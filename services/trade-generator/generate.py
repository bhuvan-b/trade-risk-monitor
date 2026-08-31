"""
Trade Generator
Runs as a Kubernetes CronJob (or standalone loop for local dev).
Posts synthetic trade events to the ingestion service.
"""

import os
import random
import requests
import logging
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

INGESTION_URL = os.getenv("INGESTION_URL", "http://ingestion:8080/trade")
TRADES_PER_RUN = int(os.getenv("TRADES_PER_RUN", "20"))
SLEEP_BETWEEN_MS = int(os.getenv("SLEEP_BETWEEN_MS", "200"))

COUNTERPARTIES = [
    "Goldman Sachs", "JP Morgan", "Deutsche Bank",
    "Barclays", "HSBC", "Nomura", "Citi", "UBS",
    "BNP Paribas", "Morgan Stanley",
]
ASSET_CLASSES = ["EQUITY", "FX", "BOND", "DERIVATIVE", "COMMODITY"]
DIRECTIONS = ["BUY", "SELL"]
HIGH_VOLUME_CP = ["Goldman Sachs", "JP Morgan"]


def random_trade():
    cp = random.choice(COUNTERPARTIES)
    if cp in HIGH_VOLUME_CP:
        notional = round(random.uniform(500_000, 4_000_000), 2)
    else:
        notional = round(random.uniform(50_000, 800_000), 2)
    return {
        "counterparty": cp,
        "asset_class": random.choice(ASSET_CLASSES),
        "notional": notional,
        "direction": random.choice(DIRECTIONS),
    }


def run():
    logger.info(f"Generating {TRADES_PER_RUN} trades → {INGESTION_URL}")
    ok, fail = 0, 0
    for _ in range(TRADES_PER_RUN):
        trade = random_trade()
        try:
            r = requests.post(INGESTION_URL, json=trade, timeout=5)
            r.raise_for_status()
            ok += 1
            logger.info(f"  ✓ {trade['counterparty']} {trade['direction']} {trade['notional']:,.0f}")
        except Exception as e:
            fail += 1
            logger.error(f"  ✗ {e}")
        time.sleep(SLEEP_BETWEEN_MS / 1000)
    logger.info(f"Done: {ok} ok, {fail} failed")


if __name__ == "__main__":
    run()
