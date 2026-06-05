from datetime import datetime, timedelta
from app.utils.time_helpers import get_ist_now
from typing import Any, Dict, List

from motor.motor_asyncio import AsyncIOMotorDatabase


async def get_recent_audit_logs(db: AsyncIOMotorDatabase, limit: int = 200) -> List[Dict[str, Any]]:
    safe_limit = max(1, min(500, int(limit or 200)))
    return await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).limit(safe_limit).to_list(safe_limit)


async def compute_user_fraud_score(db: AsyncIOMotorDatabase, user_id: str) -> Dict[str, Any]:
    cutoff = get_ist_now() - timedelta(hours=1)
    normalized_user_id = str(user_id or "").strip()
    if not normalized_user_id:
        return {"risk_score": 0.0, "flagged": False, "reasons": []}

    cancelled = await db.bookings.count_documents(
        {
            "passenger_id": normalized_user_id,
            "status": "cancelled",
            "created_at": {"$gte": cutoff},
        }
    )
    pending = await db.bookings.count_documents(
        {
            "passenger_id": normalized_user_id,
            "status": "pending",
            "created_at": {"$gte": cutoff},
        }
    )

    risk = 0.0
    reasons: List[str] = []
    if cancelled >= 3:
        risk += 0.45
        reasons.append("multiple_recent_cancellations")
    if pending >= 4:
        risk += 0.35
        reasons.append("too_many_pending_rides")

    risk_score = round(min(risk, 1.0), 2)
    return {
        "user_id": normalized_user_id,
        "risk_score": risk_score,
        "flagged": risk_score >= 0.5,
        "reasons": reasons,
    }
