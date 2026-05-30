import uuid
from datetime import datetime
from app.utils.time_helpers import get_ist_now
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.services.audit_service import write_audit_log

KERALA_EMERGENCY_NUMBERS: Dict[str, str] = {
    "police": "112",
    "women_helpline": "181",
    "ambulance": "108",
    "childline": "1098",
    "fire": "101",
}

MALAYALAM_SOS_PHRASES = [
    "രക്ഷിക്കൂ",
    "സഹായിക്കൂ",
    "പോലീസിനെ വിളിക്കൂ",
    "ആപത്താണ്",
    "rakshikku",
    "sahaayikku",
]


def _utc_now() -> datetime:
    return get_ist_now()


def _normalize_phone(phone: str) -> str:
    digits = "".join(ch for ch in str(phone or "") if ch.isdigit())
    if len(digits) < 10 or len(digits) > 15:
        raise HTTPException(status_code=400, detail="Phone number must be 10 to 15 digits")
    return digits


def _tracking_url(track_token: str) -> str:
    return f"https://auto-buddy.in/track/{track_token}"


def _build_sos_contact_message(
    *,
    rider_name: str,
    reason: str,
    track_url: str,
    location: Optional[Dict[str, Any]],
) -> str:
    lat = location.get("latitude") if isinstance(location, dict) else None
    lng = location.get("longitude") if isinstance(location, dict) else None
    maps = f"https://maps.google.com/?q={lat},{lng}" if lat is not None and lng is not None else "Unavailable"
    return (
        f"AutoBuddy SOS: {rider_name} needs help. "
        f"Reason: {reason}. "
        f"Track: {track_url}. "
        f"Location: {maps}. "
        f"Emergency numbers: Police 112, Women 181, Ambulance 108."
    )


async def get_safety_mode(db: AsyncIOMotorDatabase, user_id: str) -> Dict[str, Any]:
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "safety_mode": 1})
    mode = (user or {}).get("safety_mode")
    if isinstance(mode, dict):
        return mode
    return {
        "enabled": False,
        "women_safety_mode": False,
        "auto_share_location": True,
        "audio_recording_enabled": False,
        "malayalam_voice_enabled": True,
        "voice_auto_sos_enabled": True,
    }


async def update_safety_mode(
    db: AsyncIOMotorDatabase,
    user_id: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    mode = {
        "enabled": bool(payload.get("enabled")),
        "women_safety_mode": bool(payload.get("women_safety_mode")),
        "auto_share_location": bool(payload.get("auto_share_location", True)),
        "audio_recording_enabled": bool(payload.get("audio_recording_enabled")),
        "malayalam_voice_enabled": bool(payload.get("malayalam_voice_enabled", True)),
        "voice_auto_sos_enabled": bool(payload.get("voice_auto_sos_enabled", True)),
    }
    await db.users.update_one(
        {"id": user_id},
        {
            "$set": {
                "safety_mode": mode,
                "safety_mode_updated_at": _utc_now(),
            }
        },
    )
    return mode


async def add_trusted_contact(
    db: AsyncIOMotorDatabase,
    *,
    user_id: str,
    name: str,
    phone: str,
    relation: str,
) -> Dict[str, Any]:
    normalized_phone = _normalize_phone(phone)
    now = _utc_now()
    existing = await db.trusted_contacts.find_one(
        {
            "user_id": user_id,
            "phone": normalized_phone,
            "active": True,
        }
    )
    if existing:
        raise HTTPException(status_code=400, detail="Trusted contact already added")

    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "name": str(name or "").strip(),
        "phone": normalized_phone,
        "relation": str(relation or "Family").strip() or "Family",
        "active": True,
        "created_at": now,
        "updated_at": now,
    }
    await db.trusted_contacts.insert_one(doc)
    return doc


async def list_trusted_contacts(db: AsyncIOMotorDatabase, user_id: str, limit: int = 20) -> List[Dict[str, Any]]:
    safe_limit = max(1, min(50, int(limit or 20)))
    return await db.trusted_contacts.find(
        {"user_id": user_id, "active": True},
        {"_id": 0},
    ).sort("created_at", -1).limit(safe_limit).to_list(safe_limit)


async def remove_trusted_contact(db: AsyncIOMotorDatabase, user_id: str, contact_id: str) -> None:
    result = await db.trusted_contacts.update_one(
        {"id": contact_id, "user_id": user_id, "active": True},
        {"$set": {"active": False, "updated_at": _utc_now(), "deleted_at": _utc_now()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Trusted contact not found")


async def create_sos_event(
    db: AsyncIOMotorDatabase,
    *,
    current_user: Dict[str, Any],
    request_ip: str,
    user_agent: str,
    booking_id: Optional[str],
    reason: str,
    location: Optional[Dict[str, Any]],
    audio_evidence_url: Optional[str],
    source: str,
) -> Dict[str, Any]:
    now = _utc_now()
    track_token = uuid.uuid4().hex
    ride_id = str(booking_id or "").strip() or None
    sos_id = str(uuid.uuid4())
    track_url = _tracking_url(track_token)
    doc = {
        "id": sos_id,
        "user_id": current_user["id"],
        "user_role": str(current_user.get("role") or ""),
        "booking_id": ride_id,
        "reason": str(reason or "Emergency SOS").strip() or "Emergency SOS",
        "location": location or None,
        "audio_evidence_url": str(audio_evidence_url or "").strip() or None,
        "source": str(source or "manual").strip().lower(),
        "status": "active",
        "tracking_token": track_token,
        "tracking_url": track_url,
        "escalation_stage": "family_and_control",
        "kerala_emergency_numbers": KERALA_EMERGENCY_NUMBERS,
        "created_at": now,
        "updated_at": now,
    }
    await db.sos_events.insert_one(doc)

    contacts = await list_trusted_contacts(db, current_user["id"], limit=20)
    rider_name = str(current_user.get("name") or "AutoBuddy user").strip()
    if contacts:
        alerts: List[Dict[str, Any]] = []
        for contact in contacts:
            alerts.append(
                {
                    "id": str(uuid.uuid4()),
                    "sos_id": sos_id,
                    "user_id": current_user["id"],
                    "contact_name": contact.get("name", ""),
                    "contact_phone": contact.get("phone", ""),
                    "relation": contact.get("relation", ""),
                    "message": _build_sos_contact_message(
                        rider_name=rider_name,
                        reason=doc["reason"],
                        track_url=track_url,
                        location=location,
                    ),
                    "dispatch_status": "queued",
                    "created_at": now,
                }
            )
        await db.sos_contact_alerts.insert_many(alerts)

    await write_audit_log(
        db=db,
        action="KERALA_SOS_TRIGGERED",
        success=True,
        user_id=current_user["id"],
        request_ip=request_ip,
        user_agent=user_agent,
        method="POST",
        path="/api/safety/sos",
        resource="safety_sos",
        metadata={
            "sos_id": sos_id,
            "booking_id": ride_id,
            "source": doc["source"],
            "trusted_contacts_notified": len(contacts),
        },
    )
    return {
        **doc,
        "trusted_contacts_notified": len(contacts),
    }


async def resolve_sos_event(db: AsyncIOMotorDatabase, *, user_id: str, sos_id: str) -> None:
    result = await db.sos_events.update_one(
        {"id": sos_id, "user_id": user_id},
        {"$set": {"status": "resolved", "resolved_at": _utc_now(), "updated_at": _utc_now()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="SOS event not found")


async def log_family_location(
    db: AsyncIOMotorDatabase,
    *,
    user_id: str,
    booking_id: str,
    location: Dict[str, Any],
) -> Dict[str, Any]:
    now = _utc_now()
    event = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "booking_id": booking_id,
        "location": location,
        "created_at": now,
    }
    await db.family_tracking_logs.insert_one(event)
    return event


async def save_ride_audio_metadata(
    db: AsyncIOMotorDatabase,
    *,
    user_id: str,
    booking_id: str,
    file_url: str,
    duration_seconds: int,
    mime_type: Optional[str],
    size_bytes: Optional[int],
    started_at: Optional[str],
    ended_at: Optional[str],
) -> Dict[str, Any]:
    now = _utc_now()
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "booking_id": booking_id,
        "file_url": str(file_url or "").strip(),
        "duration_seconds": max(0, int(duration_seconds or 0)),
        "mime_type": str(mime_type or "").strip() or None,
        "size_bytes": int(size_bytes) if size_bytes is not None else None,
        "started_at": started_at,
        "ended_at": ended_at,
        "access": "restricted_admin_only",
        "created_at": now,
    }
    await db.ride_audio_recordings.insert_one(doc)
    return doc


async def women_safety_match(
    db: AsyncIOMotorDatabase,
    *,
    pickup_latitude: float,
    pickup_longitude: float,
    radius_km: float = 5.0,
    limit: int = 30,
) -> List[Dict[str, Any]]:
    radius_m = max(500, min(20000, int(float(radius_km) * 1000)))
    safe_limit = max(1, min(100, int(limit or 30)))

    nearby = await db.drivers.find(
        {
            "is_online": True,
            "is_available": True,
            "kyc_status": "approved",
            "current_location_geo": {
                "$near": {
                    "$geometry": {
                        "type": "Point",
                        "coordinates": [float(pickup_longitude), float(pickup_latitude)],
                    },
                    "$maxDistance": radius_m,
                }
            },
        },
        {
            "_id": 0,
            "id": 1,
            "user_id": 1,
            "name": 1,
            "gender": 1,
            "rating": 1,
            "total_rides": 1,
            "current_location_geo": 1,
        },
    ).limit(safe_limit).to_list(safe_limit)

    scored: List[Dict[str, Any]] = []
    for driver in nearby:
        gender = str(driver.get("gender") or "").strip().lower()
        rating = float(driver.get("rating") or 0.0)
        total_rides = int(driver.get("total_rides") or 0)
        score = 0
        reason = "general_safe_candidate"
        if gender == "female":
            score += 100
            reason = "female_driver_priority"
        if total_rides >= 500 and rating >= 4.8:
            score += 50
            if reason == "general_safe_candidate":
                reason = "vetted_high_rating_driver"
        if rating >= 4.6:
            score += 15
        scored.append(
            {
                "driver_id": driver.get("user_id") or driver.get("id"),
                "name": driver.get("name", "Driver"),
                "gender": gender or "unknown",
                "rating": rating,
                "total_rides": total_rides,
                "safety_match_score": score,
                "reason": reason,
            }
        )
    scored.sort(key=lambda row: row["safety_match_score"], reverse=True)
    return scored[:safe_limit]


async def compute_safety_score(db: AsyncIOMotorDatabase, user_id: str) -> Dict[str, Any]:
    contacts = await db.trusted_contacts.count_documents({"user_id": user_id, "active": True})
    sos_count = await db.sos_events.count_documents({"user_id": user_id})
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "safety_mode": 1})
    mode = (user or {}).get("safety_mode") or {}

    score = 55
    if contacts >= 1:
        score += 10
    if contacts >= 3:
        score += 10
    if bool(mode.get("enabled")):
        score += 10
    if bool(mode.get("women_safety_mode")):
        score += 8
    if bool(mode.get("malayalam_voice_enabled")):
        score += 4
    if bool(mode.get("audio_recording_enabled")):
        score += 3
    if sos_count == 0:
        score += 5

    return {
        "user_id": user_id,
        "safety_score": min(100, score),
        "trusted_contacts": int(contacts),
        "sos_events": int(sos_count),
        "women_safety_mode": bool(mode.get("women_safety_mode")),
    }


async def list_sos_events_admin(db: AsyncIOMotorDatabase, limit: int = 100) -> List[Dict[str, Any]]:
    safe_limit = max(1, min(300, int(limit or 100)))
    return await db.sos_events.find({}, {"_id": 0}).sort("created_at", -1).limit(safe_limit).to_list(safe_limit)
