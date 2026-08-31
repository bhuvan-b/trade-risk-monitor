const express = require('express');
const { Kafka } = require('kafkajs');

const app = express();
app.use(express.json());

const kafka = new Kafka({
  clientId: 'ingestion-service',
  brokers: [process.env.KAFKA_BROKER || 'kafka.risk.svc.cluster.local:9092'],
  retry: { retries: 10, initialRetryTime: 1000 },
});

const producer = kafka.producer();

let ready = false;

async function connect() {
  await producer.connect();
  ready = true;
  console.log('Kafka producer connected');
}

connect().catch(err => {
  console.error('Failed to connect producer:', err);
  process.exit(1);
});

// Health probes
app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
app.get('/readyz', (_req, res) => {
  if (!ready) return res.status(503).json({ status: 'not ready' });
  res.json({ status: 'ready' });
});

// Ingest a trade event
// Body: { counterparty_id, notional, currency, direction }
app.post('/trades', async (req, res) => {
  if (!ready) return res.status(503).json({ error: 'producer not ready' });

  const { counterparty_id, notional, currency = 'USD', direction = 'BUY' } = req.body;

  if (!counterparty_id || notional == null) {
    return res.status(400).json({ error: 'counterparty_id and notional required' });
  }

  const event = {
    counterparty_id,
    notional: Number(notional),
    currency,
    direction,
    trade_id: `TRD-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    timestamp: new Date().toISOString(),
  };

  await producer.send({
    topic: 'trade-events',
    messages: [{ key: counterparty_id, value: JSON.stringify(event) }],
  });

  console.log(`Ingested: ${event.trade_id} | ${counterparty_id} | ${notional}`);
  res.status(202).json({ trade_id: event.trade_id });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Ingestion service listening on ${PORT}`));
