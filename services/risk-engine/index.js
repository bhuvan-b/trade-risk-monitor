const { Kafka } = require('kafkajs');
const { Pool } = require('pg');
const express = require('express');

// Health endpoint (probes need this)
const app = express();
app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
app.get('/readyz', (_req, res) => {
  if (!consumerReady) return res.status(503).json({ status: 'not ready' });
  res.json({ status: 'ready' });
});
app.listen(3002, () => console.log('Risk engine health endpoint on 3002'));

const pool = new Pool({
  host: process.env.PGHOST || 'postgres.risk.svc.cluster.local',
  port: 5432,
  user: process.env.PGUSER || 'risk',
  password: process.env.PGPASSWORD || 'riskpassword',
  database: process.env.PGDATABASE || 'riskdb',
});

const kafka = new Kafka({
  clientId: 'risk-engine',
  brokers: [process.env.KAFKA_BROKER || 'kafka.risk.svc.cluster.local:9092'],
  retry: { retries: 15, initialRetryTime: 2000 },
});

const consumer = kafka.consumer({ groupId: 'risk-engine-group' });

let consumerReady = false;

async function processEvent(event) {
  const { counterparty_id, notional } = event;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Upsert exposure — add notional to running total
    const result = await client.query(
      `INSERT INTO counterparty_exposure (counterparty_id, exposure, limit_amount)
       VALUES ($1, $2, 1000000)
       ON CONFLICT (counterparty_id) DO UPDATE
         SET exposure = counterparty_exposure.exposure + $2,
             updated_at = NOW()
       RETURNING exposure, limit_amount, counterparty_id`,
      [counterparty_id, notional]
    );

    const row = result.rows[0];

    // Record a breach if exposure has crossed the limit
    if (row.exposure > row.limit_amount) {
      await client.query(
        `INSERT INTO breaches (counterparty_id, exposure, limit_amount)
         VALUES ($1, $2, $3)`,
        [row.counterparty_id, row.exposure, row.limit_amount]
      );
      console.warn(
        `BREACH: ${row.counterparty_id} | exposure=${row.exposure} | limit=${row.limit_amount}`
      );
    }

    await client.query('COMMIT');
    console.log(`Processed: ${counterparty_id} | new exposure=${row.exposure}`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function run() {
  // Wait for Postgres
  for (let i = 0; i < 20; i++) {
    try {
      await pool.query('SELECT 1');
      console.log('Postgres connected');
      break;
    } catch {
      console.log(`Waiting for Postgres... (${i + 1}/20)`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  await consumer.connect();
  await consumer.subscribe({ topic: 'trade-events', fromBeginning: false });

  consumerReady = true;
  console.log('Risk engine consuming trade-events');

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const event = JSON.parse(message.value.toString());
        await processEvent(event);
      } catch (err) {
        console.error('Error processing event:', err);
        // Don't throw — let Kafka continue; dead-letter handling is Phase 5+
      }
    },
  });
}

run().catch(err => {
  console.error('Risk engine fatal error:', err);
  process.exit(1);
});
