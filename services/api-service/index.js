const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: process.env.PGHOST || 'postgres.risk.svc.cluster.local',
  port: 5432,
  user: process.env.PGUSER || 'risk',
  password: process.env.PGPASSWORD || 'riskpassword',
  database: process.env.PGDATABASE || 'riskdb',
});

// Health probes
app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));
app.get('/readyz', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'db not ready' });
  }
});

// GET /api/exposure — all counterparties with exposure vs limit
app.get('/api/exposure', async (_req, res) => {
  const result = await pool.query(
    `SELECT
       counterparty_id,
       exposure,
       limit_amount,
       ROUND((exposure / limit_amount) * 100, 2) AS utilisation_pct,
       exposure > limit_amount AS breached,
       updated_at
     FROM counterparty_exposure
     ORDER BY utilisation_pct DESC`
  );
  res.json(result.rows);
});

// GET /api/breaches — recent breach events, newest first
app.get('/api/breaches', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const result = await pool.query(
    `SELECT id, counterparty_id, exposure, limit_amount,
            ROUND((exposure / limit_amount) * 100, 2) AS utilisation_pct,
            breached_at
     FROM breaches
     ORDER BY breached_at DESC
     LIMIT $1`,
    [limit]
  );
  res.json(result.rows);
});

// GET /api/exposure/:id — single counterparty detail
app.get('/api/exposure/:id', async (req, res) => {
  const { id } = req.params;
  const exp = await pool.query(
    'SELECT * FROM counterparty_exposure WHERE counterparty_id = $1',
    [id]
  );
  if (!exp.rows.length) return res.status(404).json({ error: 'not found' });

  const breaches = await pool.query(
    'SELECT * FROM breaches WHERE counterparty_id = $1 ORDER BY breached_at DESC LIMIT 10',
    [id]
  );

  res.json({ ...exp.rows[0], recent_breaches: breaches.rows });
});

// POST /api/exposure/:id/reset — reset exposure for chaos/testing
app.post('/api/exposure/:id/reset', async (req, res) => {
  const { id } = req.params;
  await pool.query(
    `UPDATE counterparty_exposure SET exposure = 0, updated_at = NOW()
     WHERE counterparty_id = $1`,
    [id]
  );
  res.json({ reset: true, counterparty_id: id });
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`API service on ${PORT}`));
