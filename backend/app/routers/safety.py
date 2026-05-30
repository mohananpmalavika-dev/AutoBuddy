from datetime import datetime
from app.utils.time_helpers import get_ist_now
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, ConfigDict, Field

from app.db.deps import get_db
from app.services import safety_service
from app.utils.rbac import get_current_user_secure, require_roles

router = APIRouter(prefix="/api", tags=["safety"])


class LocationPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    address: Optional[str] = None


class SafetyModePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    enabled: bool = False
    women_safety_mode: bool = False
    auto_share_location: bool = True
    audio_recording_enabled: bool = False
    malayalam_voice_enabled: bool = True
    voice_auto_sos_enabled: bool = True


class TrustedContactPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(..., min_length=2, max_length=80)
    phone: str = Field(..., min_length=10, max_length=15)
    relation: Optional[str] = Field(default="Family", max_length=50)


class SosTriggerPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    booking_id: Optional[str] = None
    reason: Optional[str] = Field(default="Emergency SOS", max_length=200)
    source: Optional[str] = Field(default="manual", max_length=40)
    location: Optional[LocationPayload] = None
    audio_evidence_url: Optional[str] = Field(default=None, max_length=500)


class FamilyTrackingPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    booking_id: str = Field(..., min_length=4, max_length=120)
    location: LocationPayload


class AudioRecordingPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    booking_id: str = Field(..., min_length=4, max_length=120)
    file_url: str = Field(..., min_length=5, max_length=500)
    duration_seconds: int = Field(default=0, ge=0, le=86400)
    mime_type: Optional[str] = Field(default=None, max_length=100)
    size_bytes: Optional[int] = Field(default=None, ge=0)
    started_at: Optional[str] = None
    ended_at: Optional[str] = None


class WomenSafetyMatchPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pickup_location: LocationPayload
    radius_km: float = Field(default=5.0, ge=0.5, le=20.0)
    limit: int = Field(default=15, ge=1, le=50)


def _request_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _location_to_dict(location: Optional[LocationPayload]) -> Optional[Dict[str, Any]]:
    return location.model_dump() if location else None


@router.get("/safety/emergency-numbers")
async def get_emergency_numbers():
    return {
        "state": "Kerala",
        "numbers": safety_service.KERALA_EMERGENCY_NUMBERS,
        "voice_sos_phrases": safety_service.MALAYALAM_SOS_PHRASES,
    }


@router.get("/safety/mode")
async def get_safety_mode(
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    return await safety_service.get_safety_mode(db=db, user_id=current_user["id"])


@router.put("/safety/mode")
async def update_safety_mode(
    payload: SafetyModePayload,
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    mode = await safety_service.update_safety_mode(
        db=db,
        user_id=current_user["id"],
        payload=payload.model_dump(),
    )
    return {"message": "Safety mode updated", "safety_mode": mode}


@router.post("/safety/trusted-contacts")
async def create_trusted_contact(
    payload: TrustedContactPayload,
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    created = await safety_service.add_trusted_contact(
        db=db,
        user_id=current_user["id"],
        name=payload.name,
        phone=payload.phone,
        relation=payload.relation or "Family",
    )
    created.pop("_id", None)
    return created


@router.get("/safety/trusted-contacts")
async def fetch_trusted_contacts(
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    return await safety_service.list_trusted_contacts(db=db, user_id=current_user["id"])


@router.delete("/safety/trusted-contacts/{contact_id}")
async def delete_trusted_contact(
    contact_id: str,
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await safety_service.remove_trusted_contact(db=db, user_id=current_user["id"], contact_id=contact_id)
    return {"message": "Trusted contact removed"}


@router.post("/safety/sos")
async def trigger_sos(
    payload: SosTriggerPayload,
    request: Request,
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    sos = await safety_service.create_sos_event(
        db=db,
        current_user=current_user,
        request_ip=_request_ip(request),
        user_agent=str(request.headers.get("user-agent") or ""),
        booking_id=payload.booking_id,
        reason=payload.reason or "Emergency SOS",
        location=_location_to_dict(payload.location),
        audio_evidence_url=payload.audio_evidence_url,
        source=payload.source or "manual",
    )
    sos.pop("_id", None)
    return {
        "message": "SOS activated. Family tracking and emergency escalation started.",
        "sos": sos,
        "kerala_emergency_numbers": safety_service.KERALA_EMERGENCY_NUMBERS,
    }


@router.put("/safety/sos/{sos_id}/resolve")
async def resolve_sos(
    sos_id: str,
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    await safety_service.resolve_sos_event(db=db, user_id=current_user["id"], sos_id=sos_id)
    return {"message": "SOS resolved", "resolved_at": get_ist_now().isoformat() + "Z"}


@router.post("/safety/family-location")
async def update_family_location(
    payload: FamilyTrackingPayload,
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    event = await safety_service.log_family_location(
        db=db,
        user_id=current_user["id"],
        booking_id=payload.booking_id,
        location=payload.location.model_dump(),
    )
    event.pop("_id", None)
    return event


@router.get("/safety/family-location/{booking_id}")
async def get_family_location_timeline(
    booking_id: str,
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0, "passenger_id": 1, "driver_id": 1})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    allowed = (
        str(current_user.get("role") or "").lower() == "admin"
        or current_user["id"] == booking.get("passenger_id")
        or current_user["id"] == booking.get("driver_id")
    )
    if not allowed:
        raise HTTPException(status_code=403, detail="Not allowed")
    return await db.family_tracking_logs.find(
        {"booking_id": booking_id},
        {"_id": 0},
    ).sort("created_at", -1).limit(60).to_list(60)


@router.post("/safety/audio-recording")
async def save_ride_audio(
    payload: AudioRecordingPayload,
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    doc = await safety_service.save_ride_audio_metadata(
        db=db,
        user_id=current_user["id"],
        booking_id=payload.booking_id,
        file_url=payload.file_url,
        duration_seconds=payload.duration_seconds,
        mime_type=payload.mime_type,
        size_bytes=payload.size_bytes,
        started_at=payload.started_at,
        ended_at=payload.ended_at,
    )
    doc.pop("_id", None)
    return {"message": "Ride audio evidence metadata saved", "recording": doc}


@router.post("/safety/women-safety-match")
async def women_safety_dispatch_candidates(
    payload: WomenSafetyMatchPayload,
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    _ = current_user
    matches = await safety_service.women_safety_match(
        db=db,
        pickup_latitude=payload.pickup_location.latitude,
        pickup_longitude=payload.pickup_location.longitude,
        radius_km=payload.radius_km,
        limit=payload.limit,
    )
    return {
        "matches": matches,
        "prioritization": [
            "female_driver_priority",
            "vetted_high_rating_driver",
            "general_safe_candidate",
        ],
    }


@router.get("/safety/score/me")
async def get_my_safety_score(
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    return await safety_service.compute_safety_score(db=db, user_id=current_user["id"])


@router.get("/safety/admin/sos-events")
async def get_admin_sos_events(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(require_roles("admin")),
):
    _ = current_user
    return await safety_service.list_sos_events_admin(db=db, limit=120)
