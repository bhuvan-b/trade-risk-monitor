"""
Ingestion Service
Receives trade events via HTTP POST, validates, and produces to Kafka.
"""

import os
import json
import logging
import uuid
from datetime import datetime
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, field_validator
from confluent_kafka import Producer
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Trade Ingestion Service")

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "trades")

producer = Producer({"bootstrap.servers": KAFKA_BOOTSTRAP})

VALID_ASSETS = {"EQUITY", "FX", "BOND", "DERIVATIVE", "COMMODITY"}


class TradeEvent(BaseModel):
    counterparty: str
    asset_class: str
    notional: float
    direction: str  # BUY or SELL

    @field_validator("direction")
    @classmethod
    def direction_must_be_valid(cls, v):
        if v not in ("BUY", "SELL"):
            raise ValueError("direction must be BUY or SELL")
        return v

    @field_validator("asset_class")
    @classmethod
    def asset_class_must_be_valid(cls, v):
        if v not in VALID_ASSETS:
            raise ValueError(f"asset_class must be one of {VALID_ASSETS}")
        return v

    @field_validator("notional")
    @classmethod
    def notional_must_be_positive(cls, v):
        if v <= 0:
            raise ValueError("notional must be positive")
        return v


def delivery_report(err, msg):
    if err is not None:
        logger.error(f"Delivery failed: {err}")
    else:
        logger.info(f"Delivered to {msg.topic()} [{msg.partition()}]")


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/readyz")
def readyz():
    try:
        meta = producer.list_topics(timeout=3)
        if meta:
            return {"status": "ready"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Kafka not ready: {e}")
    return {"status": "ready"}


@app.post("/trade", status_code=202)
def ingest_trade(trade: TradeEvent):
    event = {
        "trade_id": str(uuid.uuid4()),
        "timestamp": datetime.utcnow().isoformat(),
        "counterparty": trade.counterparty,
        "asset_class": trade.asset_class,
        "notional": trade.notional,
        "direction": trade.direction,
    }
    producer.produce(
        KAFKA_TOPIC,
        key=trade.counterparty,
        value=json.dumps(event),
        callback=delivery_report,
    )
    producer.poll(0)
    logger.info(f"Queued trade {event['trade_id']} for {trade.counterparty}")
    return {"trade_id": event["trade_id"], "status": "accepted"}


@app.on_event("shutdown")
def shutdown():
    producer.flush()


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8080)
