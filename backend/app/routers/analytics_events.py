import logging
from typing import Any, Dict

from fastapi import APIRouter, Depends, Request, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db.deps import get_db

router = APIRouter()
logger = logging.getLogger("autobuddy.analytics.events")


@router.post("/events")
async def ingest_analytics_event(request: Request, db: AsyncIOMotorDatabase = Depends(get_db)):
    """Ingest analytics events from clients. Stores events in MongoDB collection `analytics_events`.

    Expects arbitrary JSON payload. This endpoint is intentionally permissive for telemetry.
    """
    try:
        payload: Dict[str, Any] = await request.json()
    except Exception as exc:
        logger.exception("Failed to parse analytics event: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid JSON payload")

    try:
        # add server-side timestamp
        payload.setdefault("received_at", None)
        await db.analytics_events.insert_one(payload)
    except Exception as exc:
        logger.exception("Failed to persist analytics event: %s", exc)
        # swallow errors but return generic success to clients to avoid breaking UX
        return {"status": "error", "message": "stored_failed"}

    return {"status": "ok"}
