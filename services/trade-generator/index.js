/**
 * Trade Generator
 * Continuously POSTs synthetic trade events to the ingestion service.
 * Rate is configurable via TRADES_PER_SECOND env var (default: 2).
 * Set BURST_MODE=true to spike volume for HPA testing.
 */

const INGESTION_URL = process.env.INGESTION_URL || 'http://ingestion-service.risk.svc.cluster.local:3001/trades';
const TPS = parseFloat(process.env.TRADES_PER_SECOND) || 2;
const BURST_MODE = process.env.BURST_MODE === 'true';
const BURST_TPS = 50;

const COUNTERPARTIES = ['CP-ALPHA', 'CP-BETA', 'CP-GAMMA', 'CP-DELTA', 'CP-EPSILON'];
const DIRECTIONS = ['BUY', 'SELL'];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY'];

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function generateTrade() {
  return {
    counterparty_id: COUNTERPARTIES[Math.floor(Math.random() * COUNTERPARTIES.length)],
    // Notional between 50k and 300k — sized so breaches happen within a few minutes
    notional: Math.round(randomBetween(50000, 300000)),
    currency: CURRENCIES[Math.floor(Math.random() * CURRENCIES.length)],
    direction: DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)],
  };
}

async function sendTrade() {
  const trade = generateTrade();
  try {
    const res = await fetch(INGESTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trade),
    });
    if (!res.ok) {
      console.warn(`Ingestion responded ${res.status}`);
    } else {
      const body = await res.json();
      console.log(`Sent: ${body.trade_id} | ${trade.counterparty_id} | ${trade.notional}`);
    }
  } catch (err) {
    console.error('Send failed:', err.message);
  }
}

async function main() {
  const effectiveTPS = BURST_MODE ? BURST_TPS : TPS;
  const intervalMs = 1000 / effectiveTPS;

  console.log(`Trade generator starting | TPS=${effectiveTPS} | BURST=${BURST_MODE}`);
  console.log(`Target: ${INGESTION_URL}`);

  // Wait for ingestion service to be up
  await new Promise(r => setTimeout(r, 5000));

  setInterval(sendTrade, intervalMs);
}

main();
