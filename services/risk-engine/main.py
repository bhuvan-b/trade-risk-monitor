"""
Risk Engine
Consumes trade events from Kafka, maintains running exposure per counterparty,
checks against limits, flags breaches, writes state to Postgres.
Exposes Prometheus metrics for HPA and observability.
"""

import os
import json
import logging
import signal
import time
from datetime import datetime
from confluent_kafka import Consumer, KafkaError
import psycopg2
import psycopg2.extras
from prometheus_client import Counter, Gauge, Histogram, start_http_server

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "trades")
KAFKA_GROUP = os.getenv("KAFKA_GROUP_ID", "risk-engine")
DB_URL = os.getenv("DATABASE_URL", "postgresql://risk:risk@postgres:5432/riskdb")
DEFAULT_LIMIT = float(os.getenv("DEFAULT_EXPOSURE_LIMIT", "10000000"))

# ── Prometheus metrics ───────────────────────────────────────────────────────
TRADES_PROCESSED = Counter("risk_trades_processed_total", "Total trade events consumed")
BREACHES_DETECTED = Counter("risk_breaches_total", "Total limit breaches detected", ["counterparty"])
EXPOSURE_GAUGE = Gauge("risk_exposure_usd", "Current net exposure USD", ["counterparty"])
PROCESSING_LATENCY = Histogram("risk_processing_seconds", "Trade processing latency")
KAFKA_LAG = Gauge("risk_kafka_consumer_lag", "Estimated Kafka consumer lag")


def get_db():
    return psycopg2.connect(DB_URL)


def init_db(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS exposure (
                counterparty TEXT PRIMARY KEY,
                net_exposure  NUMERIC NOT NULL DEFAULT 0,
                trade_count   INT NOT NULL DEFAULT 0,
                updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS breaches (
                id                 SERIAL PRIMARY KEY,
                counterparty       TEXT NOT NULL,
                exposure_at_breach NUMERIC NOT NULL,
                limit_usd          NUMERIC NOT NULL,
                detected_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS trades (
                trade_id     TEXT PRIMARY KEY,
                counterparty TEXT NOT NULL,
                asset_class  TEXT NOT NULL,
                notional     NUMERIC NOT NULL,
                direction    TEXT NOT NULL,
                processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        """)
    conn.commit()
    logger.info("DB schema initialised")


def upsert_exposure(conn, counterparty: str, delta: float) -> float:
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO exposure (counterparty, net_exposure, trade_count, updated_at)
            VALUES (%s, %s, 1, NOW())
            ON CONFLICT (counterparty) DO UPDATE
                SET net_exposure = exposure.net_exposure + EXCLUDED.net_exposure,
                    trade_count  = exposure.trade_count + 1,
                    updated_at   = NOW()
            RETURNING net_exposure
        """, (counterparty, delta))
        new_exposure = float(cur.fetchone()[0])
    conn.commit()
    return new_exposure


def record_trade(conn, trade: dict):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO trades (trade_id, counterparty, asset_class, notional, direction, processed_at)
            VALUES (%s, %s, %s, %s, %s, NOW())
            ON CONFLICT (trade_id) DO NOTHING
        """, (trade["trade_id"], trade["counterparty"], trade["asset_class"],
              trade["notional"], trade["direction"]))
    conn.commit()


def record_breach(conn, counterparty: str, exposure: float, limit: float):
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO breaches (counterparty, exposure_at_breach, limit_usd, detected_at)
            VALUES (%s, %s, %s, NOW())
        """, (counterparty, exposure, limit))
    conn.commit()
    logger.warning(f"BREACH: {counterparty} exposure={exposure:.0f} limit={limit:.0f}")


def process_trade(conn, trade: dict):
    start = time.time()
    direction_sign = 1 if trade["direction"] == "BUY" else -1
    delta = trade["notional"] * direction_sign

    record_trade(conn, trade)
    new_exposure = upsert_exposure(conn, trade["counterparty"], delta)

    EXPOSURE_GAUGE.labels(counterparty=trade["counterparty"]).set(new_exposure)
    TRADES_PROCESSED.inc()

    if new_exposure > DEFAULT_LIMIT:
        record_breach(conn, trade["counterparty"], new_exposure, DEFAULT_LIMIT)
        BREACHES_DETECTED.labels(counterparty=trade["counterparty"]).inc()

    PROCESSING_LATENCY.observe(time.time() - start)


running = True


def handle_sigterm(*_):
    global running
    logger.info("SIGTERM received — shutting down cleanly")
    running = False


signal.signal(signal.SIGTERM, handle_sigterm)
signal.signal(signal.SIGINT, handle_sigterm)


def main():
    start_http_server(9090)
    logger.info("Prometheus metrics on :9090")

    conn = None
    while conn is None:
        try:
            conn = get_db()
            init_db(conn)
        except Exception as e:
            logger.warning(f"DB not ready: {e} — retrying in 3s")
            time.sleep(3)

    consumer = Consumer({
        "bootstrap.servers": KAFKA_BOOTSTRAP,
        "group.id": KAFKA_GROUP,
        "auto.offset.reset": "earliest",
        "enable.auto.commit": True,
    })
    consumer.subscribe([KAFKA_TOPIC])
    logger.info(f"Subscribed to {KAFKA_TOPIC}")

    while running:
        msg = consumer.poll(timeout=1.0)
        if msg is None:
            continue
        if msg.error():
            if msg.error().code() == KafkaError._PARTITION_EOF:
                continue
            logger.error(f"Kafka error: {msg.error()}")
            continue
        try:
            trade = json.loads(msg.value().decode("utf-8"))
            process_trade(conn, trade)
        except Exception as e:
            logger.error(f"Failed to process message: {e}", exc_info=True)

    consumer.close()
    conn.close()
    logger.info("Risk engine shut down cleanly")


if __name__ == "__main__":
    main()
