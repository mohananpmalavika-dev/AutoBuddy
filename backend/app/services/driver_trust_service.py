import re
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.services.audit_service import write_audit_log

AADHAAR_RE = re.compile(r"^\d{12}$")
SEVERE_COMPLAINT_CATEGORIES = {"harassment", "intoxication", "assault"}
REPEAT_COMPLAINT_THRESHOLDS = {
    "reckless_driving": 3,
    "asking_for_offline_payment": 5,
}


def _utc_now() -> datetime:
    return datetime.utcnow()


def _normalize_category(value: str) -> str:
    return str(value or "").strip().lower().replace(" ", "_")


def _normalize_severity(value: str) -> str:
    cleaned = str(value or "medium").strip().lower()
    if cleaned not in {"low", "medium", "high", "critical"}:
        return "medium"
    return cleaned


def mask_aadhaar(aadhaar_number: str) -> str:
    digits = re.sub(r"\D", "", str(aadhaar_number or ""))
    if len(digits) != 12:
        return ""
    return f"XXXX-XXXX-{digits[-4:]}"


def basic_aadhaar_check(aadhaar_number: str) -> Dict[str, Any]:
    digits = re.sub(r"\D", "", str(aadhaar_number or ""))
    if not AADHAAR_RE.match(digits):
        return {
            "valid_format": False,
            "message": "Invalid Aadhaar format",
        }
    return {
        "valid_format": True,
        "masked": mask_aadhaar(digits),
        "message": "Aadhaar format verified. eKYC provider validation can be plugged in next.",
    }


async def _count_documents_safe(collection, query: Dict[str, Any]) -> int:
    try:
        return int(await collection.count_documents(query))
    except Exception:
        return 0


async def calculate_driver_fraud_score(db: AsyncIOMotorDatabase, driver_id: str) -> Dict[str, Any]:
    since = _utc_now() - timedelta(days=90)

    complaints = await _count_documents_safe(
        db.driver_complaints,
        {"driver_id": driver_id, "created_at": {"$gte": since}},
    )
    serious_complaints = await _count_documents_safe(
        db.driver_complaints,
        {
            "driver_id": driver_id,
            "severity": {"$in": ["high", "critical"]},
            "created_at": {"$gte": since},
        },
    )
    cancelled = await _count_documents_safe(
        db.bookings,
        {"driver_id": driver_id, "status": "cancelled", "created_at": {"$gte": since}},
    )
    completed = await _count_documents_safe(
        db.bookings,
        {"driver_id": driver_id, "status": "completed", "created_at": {"$gte": since}},
    )
    rejected = await _count_documents_safe(
        db.dispatch_attempts,
        {"driver_id": driver_id, "response": "rejected", "created_at": {"$gte": since}},
    )
    accepted = await _count_documents_safe(
        db.dispatch_attempts,
        {"driver_id": driver_id, "response": "accepted", "created_at": {"$gte": since}},
    )

    blacklist = await db.driver_blacklist.find_one({"driver_id": driver_id, "active": True}, {"_id": 0, "reason": 1})

    total_rides = completed + cancelled
    total_dispatches = accepted + rejected
    cancel_rate = cancelled / max(total_rides, 1)
    reject_rate = rejected / max(total_dispatches, 1)

    risk = 0
    reasons: List[str] = []

    if complaints >= 3:
        risk += 20
        reasons.append("repeat_complaints")
    if serious_complaints >= 1:
        risk += 30
        reasons.append("serious_complaint")
    if cancel_rate > 0.35:
        risk += 20
        reasons.append("high_cancellation_rate")
    if reject_rate > 0.60:
        risk += 10
        reasons.append("high_rejection_rate")
    if blacklist:
        risk += 60
        reasons.append("blacklisted")

    risk = min(100, max(0, risk))
    if risk >= 75:
        level = "critical"
    elif risk >= 50:
        level = "high"
    elif risk >= 25:
        level = "medium"
    else:
        level = "low"

    result = {
        "driver_id": driver_id,
        "fraud_score": risk,
        "risk_level": level,
        "reasons": reasons,
        "complaints_90d": complaints,
        "serious_complaints_90d": serious_complaints,
        "cancel_rate": round(cancel_rate, 2),
        "reject_rate": round(reject_rate, 2),
        "updated_at": _utc_now(),
    }
    await db.driver_trust_scores.update_one({"driver_id": driver_id}, {"$set": result}, upsert=True)
    return result


async def kyc_ai_review(db: AsyncIOMotorDatabase, driver_id: str) -> Dict[str, Any]:
    profile = await db.drivers.find_one({"user_id": driver_id}, {"_id": 0})
    if not profile:
        return {
            "status": "failed",
            "kyc_ai_score": 0,
            "reasons": ["driver_profile_not_found"],
        }

    required_fields = [
        "name",
        "phone",
        "vehicle_info",
        "license_number",
        "aadhaar_masked",
        "selfie_url",
    ]
    missing = [field for field in required_fields if not profile.get(field)]

    score = 100
    reasons: List[str] = []
    if missing:
        score -= len(missing) * 12
        reasons.append(f"missing_fields:{','.join(missing)}")
    if profile.get("aadhaar_verified") is not True:
        score -= 25
        reasons.append("aadhaar_not_verified")
    if profile.get("selfie_verified") is not True:
        score -= 25
        reasons.append("selfie_not_verified")

    fraud = await calculate_driver_fraud_score(db, driver_id)
    if fraud["risk_level"] in {"high", "critical"}:
        score -= 30
        reasons.append("high_driver_fraud_risk")

    score = min(100, max(0, score))
    if score >= 80:
        status = "approved"
    elif score >= 55:
        status = "manual_review"
    else:
        status = "rejected"

    review = {
        "id": str(uuid.uuid4()),
        "driver_id": driver_id,
        "kyc_ai_score": score,
        "status": status,
        "reasons": reasons,
        "fraud_score_snapshot": fraud,
        "created_at": _utc_now(),
    }
    await db.kyc_ai_reviews.insert_one(review)
    await db.drivers.update_one(
        {"user_id": driver_id},
        {
            "$set": {
                "kyc_ai_score": score,
                "kyc_status": status,
                "kyc_ai_reasons": reasons,
                "kyc_reviewed_at": _utc_now(),
            }
        },
        upsert=True,
    )
    return review


async def _set_redis_blacklist(redis_client: Any, driver_id: str, blacklisted: bool) -> None:
    if not redis_client:
        return
    try:
        if blacklisted:
            await redis_client.sadd("global_driver_blacklist", driver_id)
        else:
            await redis_client.srem("global_driver_blacklist", driver_id)
    except Exception:
        return


async def blacklist_driver(
    *,
    db: AsyncIOMotorDatabase,
    redis_client: Any,
    driver_id: str,
    reason: str,
    admin_user_id: str,
    request_ip: str,
    user_agent: str,
) -> Dict[str, Any]:
    now = _utc_now()
    active = await db.driver_blacklist.find_one({"driver_id": driver_id, "active": True}, {"_id": 0})
    if active:
        return active

    record = {
        "id": str(uuid.uuid4()),
        "driver_id": driver_id,
        "reason": str(reason or "policy_violation").strip() or "policy_violation",
        "active": True,
        "created_by": admin_user_id,
        "created_at": now,
    }
    await db.driver_blacklist.insert_one(record)
    await db.drivers.update_one(
        {"user_id": driver_id},
        {"$set": {"blacklisted": True, "is_available": False, "is_online": False, "kyc_status": "blacklisted"}},
    )
    await db.users.update_one(
        {"id": driver_id},
        {"$set": {"status": "blocked", "blocked_reason": record["reason"], "blocked_at": now}},
    )
    await db.refresh_tokens.update_many(
        {"user_id": driver_id, "revoked": False},
        {"$set": {"revoked": True, "revoked_at": now, "revoked_reason": "driver_blacklisted"}},
    )
    await _set_redis_blacklist(redis_client, driver_id, True)
    await calculate_driver_fraud_score(db, driver_id)
    await write_audit_log(
        db=db,
        action="DRIVER_BLACKLISTED",
        success=True,
        user_id=admin_user_id,
        request_ip=request_ip,
        user_agent=user_agent,
        method="POST",
        path="/api/driver-trust/blacklist",
        resource="driver_trust_blacklist",
        metadata={"driver_id": driver_id, "reason": record["reason"]},
    )
    return record


async def remove_driver_from_blacklist(
    *,
    db: AsyncIOMotorDatabase,
    redis_client: Any,
    driver_id: str,
    admin_user_id: str,
    request_ip: str,
    user_agent: str,
) -> Dict[str, Any]:
    now = _utc_now()
    await db.driver_blacklist.update_many(
        {"driver_id": driver_id, "active": True},
        {"$set": {"active": False, "removed_by": admin_user_id, "removed_at": now}},
    )
    await db.drivers.update_one(
        {"user_id": driver_id},
        {"$set": {"blacklisted": False, "kyc_status": "manual_review"}},
    )
    await db.users.update_one(
        {"id": driver_id},
        {"$set": {"status": "active"}, "$unset": {"blocked_reason": "", "blocked_at": ""}},
    )
    await _set_redis_blacklist(redis_client, driver_id, False)
    await calculate_driver_fraud_score(db, driver_id)
    await write_audit_log(
        db=db,
        action="DRIVER_BLACKLIST_REMOVED",
        success=True,
        user_id=admin_user_id,
        request_ip=request_ip,
        user_agent=user_agent,
        method="PUT",
        path="/api/driver-trust/blacklist/remove",
        resource="driver_trust_blacklist",
        metadata={"driver_id": driver_id},
    )
    return {"message": "Driver removed from blacklist", "driver_id": driver_id}


async def record_complaint_and_apply_trust_engine(
    *,
    db: AsyncIOMotorDatabase,
    redis_client: Any,
    driver_id: str,
    booking_id: Optional[str],
    reported_by: str,
    reported_by_role: str,
    category: str,
    message: str,
    severity: str,
    request_ip: str,
    user_agent: str,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    now = _utc_now()
    normalized_category = _normalize_category(category)
    normalized_severity = _normalize_severity(severity)
    complaint = {
        "id": str(uuid.uuid4()),
        "driver_id": driver_id,
        "booking_id": booking_id,
        "reported_by": reported_by,
        "reported_by_role": str(reported_by_role or "").strip().lower(),
        "category": normalized_category,
        "message": str(message or "").strip(),
        "severity": normalized_severity,
        "status": "open",
        "created_at": now,
    }
    await db.driver_complaints.insert_one(complaint)

    strike_record = await db.driver_complaint_strikes.find_one(
        {"driver_id": driver_id, "category": normalized_category},
        {"_id": 0, "count": 1},
    )
    strike_count = int((strike_record or {}).get("count") or 0) + 1
    await db.driver_complaint_strikes.update_one(
        {"driver_id": driver_id, "category": normalized_category},
        {"$set": {"updated_at": now}, "$inc": {"count": 1}, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )

    action = {"type": "none", "reason": "", "strike_count": strike_count}
    if normalized_category in SEVERE_COMPLAINT_CATEGORIES:
        action = {"type": "blacklist", "reason": f"severe_violation:{normalized_category}", "strike_count": strike_count}
    else:
        threshold = REPEAT_COMPLAINT_THRESHOLDS.get(normalized_category)
        if threshold is not None and strike_count >= threshold:
            action = {
                "type": "blacklist",
                "reason": f"repeat_offender:{normalized_category}",
                "strike_count": strike_count,
            }

    if action["type"] == "blacklist":
        await blacklist_driver(
            db=db,
            redis_client=redis_client,
            driver_id=driver_id,
            reason=action["reason"],
            admin_user_id="system",
            request_ip=request_ip,
            user_agent=user_agent,
        )

    fraud_score = await calculate_driver_fraud_score(db, driver_id)
    await write_audit_log(
        db=db,
        action="DRIVER_COMPLAINT_RECORDED",
        success=True,
        user_id=reported_by,
        request_ip=request_ip,
        user_agent=user_agent,
        method="POST",
        path="/api/driver-trust/complaints",
        resource="driver_trust_complaints",
        metadata={
            "driver_id": driver_id,
            "category": normalized_category,
            "severity": normalized_severity,
            "action": action["type"],
            "strike_count": strike_count,
        },
    )
    return complaint, {"action": action, "fraud_score": fraud_score}


async def verify_driver_not_blacklisted(
    *,
    db: AsyncIOMotorDatabase,
    redis_client: Any,
    driver_user_id: str,
) -> None:
    if redis_client:
        try:
            if await redis_client.sismember("global_driver_blacklist", driver_user_id):
                raise HTTPException(status_code=403, detail="Account permanently suspended. Contact support.")
        except HTTPException:
            raise
        except Exception:
            pass
    active = await db.driver_blacklist.find_one({"driver_id": driver_user_id, "active": True}, {"_id": 0, "reason": 1})
    if active:
        raise HTTPException(status_code=403, detail="Account permanently suspended. Contact support.")
