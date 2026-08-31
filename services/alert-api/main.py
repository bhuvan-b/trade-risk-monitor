"""
Alert / API Service
Exposes current exposure state and breach history from Postgres.
Only service reachable from outside the cluster (via Ingress).
"""

import os
import logging
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
import psycopg2.extras

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

DB_URL = os.getenv("DATABASE_URL", "postgresql://risk:risk@postgres:5432/riskdb")
DEFAULT_LIMIT = float(os.getenv("DEFAULT_EXPOSURE_LIMIT", "10000000"))

db_conn = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global db_conn
    while db_conn is None:
        try:
            db_conn = psycopg2.connect(DB_URL)
            db_conn.autocommit = True
            logger.info("DB connected")
        except Exception as e:
            logger.warning(f"DB not ready: {e} — retrying in 2s")
            time.sleep(2)
    yield
    if db_conn:
        db_conn.close()


app = FastAPI(title="Trade Risk Alert API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)


def query(sql: str, params=None) -> list[dict]:
    with db_conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(sql, params)
        return [dict(r) for r in cur.fetchall()]


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.get("/readyz")
def readyz():
    try:
        query("SELECT 1")
        return {"status": "ready"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.get("/api/exposure")
def get_exposure():
    rows = query("""
        SELECT
            counterparty,
            net_exposure,
            trade_count,
            updated_at,
            ROUND((net_exposure / %s) * 100, 2) AS utilisation_pct,
            net_exposure > %s AS breached
        FROM exposure
        ORDER BY net_exposure DESC
    """, (DEFAULT_LIMIT, DEFAULT_LIMIT))
    return {"limit_usd": DEFAULT_LIMIT, "counterparties": rows}


@app.get("/api/exposure/{counterparty}")
def get_exposure_for(counterparty: str):
    rows = query("""
        SELECT counterparty, net_exposure, trade_count, updated_at
        FROM exposure WHERE counterparty = %s
    """, (counterparty,))
    if not rows:
        raise HTTPException(status_code=404, detail="Counterparty not found")
    return rows[0]


@app.get("/api/breaches")
def get_breaches(limit: int = 50):
    rows = query("""
        SELECT id, counterparty, exposure_at_breach, limit_usd, detected_at
        FROM breaches
        ORDER BY detected_at DESC
        LIMIT %s
    """, (limit,))
    return {"breaches": rows, "total": len(rows)}


@app.get("/api/trades")
def get_recent_trades(limit: int = 100):
    rows = query("""
        SELECT trade_id, counterparty, asset_class, notional, direction, processed_at
        FROM trades
        ORDER BY processed_at DESC
        LIMIT %s
    """, (limit,))
    return {"trades": rows}


@app.get("/api/summary")
def get_summary():
    rows = query("""
        SELECT
            COUNT(*) AS counterparty_count,
            SUM(net_exposure) AS total_exposure,
            SUM(trade_count) AS total_trades,
            COUNT(*) FILTER (WHERE net_exposure > %s) AS breached_count
        FROM exposure
    """, (DEFAULT_LIMIT,))
    breach_rows = query("SELECT COUNT(*) AS total FROM breaches")
    summary = rows[0] if rows else {}
    summary["total_breach_events"] = breach_rows[0]["total"] if breach_rows else 0
    summary["limit_usd"] = DEFAULT_LIMIT
    return summary
