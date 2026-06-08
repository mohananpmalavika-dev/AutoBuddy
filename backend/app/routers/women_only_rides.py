import math
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.db.deps import get_db
from app.models.women_only import (
    WOMEN_ONLY_STATUS_FLOW,
    build_women_only_safety_context,
    calculate_women_only_fare,
    is_women_only_passenger_allowed,
    sanitize_women_only_ride_for_response,
    women_only_driver_eligibility,
)
from app.utils.rbac import get_current_user_secure
from app.utils.time_helpers import get_ist_now


router = APIRouter(prefix="/api/women-only-rides", tags=["women_only_rides"])


class WomenOnlyRideRequest(BaseModel):
    passenger_id: Optional[str] = Field(default=None, max_length=120)
    passenger_name: Optional[str] = Field(default=None, max_length=120)
    passenger_gender: str = Field(default="female", max_length=20)
    phone: Optional[str] = Field(default=None, max_length=20)
    pickup_location: Dict[str, Any]
    drop_location: Dict[str, Any]
    vehicle_type: str = Field(default="auto", max_length=40)
    passengers_count: int = Field(default=1, ge=1, le=6)
    scheduled_date: Optional[datetime] = None
    female_driver_required: bool = True
    allow_trusted_male_driver_if_unavailable: bool = False
    guardian_name: Optional[str] = Field(default=None, max_length=80)
    guardian_phone: Optional[str] = Field(default=None, max_length=20)
    share_guardian_tracking: bool = True
    notes: Optional[str] = Field(default=None, max_length=500)


class WomenOnlyPickupOtpRequest(BaseModel):
    otp: str = Field(min_length=4, max_length=8)


class WomenOnlySosRequest(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=240)
    location: Optional[Dict[str, Any]] = None


def _normalize_role(user: Dict[str, Any]) -> str:
    role = user.get("role")
    return str(getattr(role, "value", role) or "").strip().lower()


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
    except Exception:
        return default
    return number if math.isfinite(number) else default


def _distance_from_payload(pickup: Dict[str, Any], drop: Dict[str, Any]) -> float:
    explicit = _as_float(drop.get("distance_km"), _as_float(pickup.get("distance_km"), 0.0))
    if explicit > 0:
        return max(0.5, explicit)
    lat1 = _as_float(pickup.get("latitude"), math.nan)
    lng1 = _as_float(pickup.get("longitude"), math.nan)
    lat2 = _as_float(drop.get("latitude"), math.nan)
    lng2 = _as_float(drop.get("longitude"), math.nan)
    if any(not math.isfinite(value) for value in (lat1, lng1, lat2, lng2)):
        return 5.0
    radius_km = 6371.0
    delta_lat = math.radians(lat2 - lat1)
    delta_lng = math.radians(lng2 - lng1)
    hav = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(delta_lng / 2) ** 2
    )
    return max(0.5, radius_km * 2 * math.atan2(math.sqrt(hav), math.sqrt(max(0.0, 1 - hav))))


def _driver_projection() -> Dict[str, int]:
    return {
        "_id": 0,
        "user_id": 1,
        "id": 1,
        "name": 1,
        "gender": 1,
        "vehicle_info": 1,
        "vehicle_type": 1,
        "vehicle_type_id": 1,
        "rating": 1,
        "average_rating": 1,
        "kyc_status": 1,
        "kyc_verified": 1,
        "police_verified": 1,
        "police_verification_status": 1,
        "background_check_status": 1,
        "safety_score": 1,
        "women_only_safety_score": 1,
        "trusted_safety_driver": 1,
        "women_only_trusted_driver": 1,
        "active_complaints": 1,
        "open_safety_complaints": 1,
        "safety_complaint_count": 1,
        "current_location": 1,
        "live_location_enabled": 1,
        "location_sharing_enabled": 1,
        "accepted_ride_types": 1,
        "is_available": 1,
    }


async def _attach_user_identity(db: AsyncIOMotorDatabase, drivers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    driver_ids = [str(item.get("user_id") or item.get("id") or "").strip() for item in drivers]
    driver_ids = [item for item in driver_ids if item]
    if not driver_ids:
        return drivers
    users = await db.users.find(
        {"id": {"$in": list(set(driver_ids))}},
        {"_id": 0, "id": 1, "name": 1, "gender": 1},
    ).to_list(None)
    users_by_id = {str(item.get("id") or ""): item for item in users}
    hydrated: List[Dict[str, Any]] = []
    for driver in drivers:
        driver_id = str(driver.get("user_id") or driver.get("id") or "").strip()
        user = users_by_id.get(driver_id) or {}
        hydrated.append(
            {
                **driver,
                "gender": driver.get("gender") or user.get("gender"),
                "name": driver.get("name") or user.get("name"),
            }
        )
    return hydrated


async def _find_candidate_driver_ids(
    db: AsyncIOMotorDatabase,
    *,
    vehicle_type: str,
    female_driver_required: bool,
    allow_trusted_male_driver_if_unavailable: bool,
    limit: int = 5,
) -> List[str]:
    vehicle_key = str(vehicle_type or "auto").strip().lower() or "auto"
    drivers = await db.drivers.find(
        {
            "is_available": True,
            "vehicle_info": {"$ne": None},
            "kyc_status": "approved",
        },
        _driver_projection(),
    ).to_list(300)
    drivers = await _attach_user_identity(db, drivers)
    scored = []
    for driver in drivers:
        raw_vehicle = driver.get("vehicle_info") if isinstance(driver.get("vehicle_info"), dict) else {}
        driver_vehicle = str(
            raw_vehicle.get("vehicle_type_id")
            or raw_vehicle.get("vehicle_type")
            or driver.get("vehicle_type_id")
            or driver.get("vehicle_type")
            or ""
        ).strip().lower()
        if vehicle_key and driver_vehicle and driver_vehicle != vehicle_key:
            continue
        eligibility = women_only_driver_eligibility(
            driver,
            female_driver_required=female_driver_required,
            allow_trusted_male_driver_if_unavailable=allow_trusted_male_driver_if_unavailable,
        )
        if not eligibility["eligible"]:
            continue
        driver_id = str(driver.get("user_id") or driver.get("id") or "").strip()
        if not driver_id:
            continue
        scored.append(
            {
                "driver_id": driver_id,
                "gender_priority": 0 if eligibility.get("gender") == "female" else 1,
                "safety_score": eligibility.get("safety_score") or 0,
            }
        )
    scored.sort(key=lambda item: (item["gender_priority"], -float(item["safety_score"])))
    return [item["driver_id"] for item in scored[: max(1, int(limit or 1))]]


async def _get_women_only_booking(
    db: AsyncIOMotorDatabase,
    ride_id: str,
    current_user: Dict[str, Any],
) -> Dict[str, Any]:
    ride_key = str(ride_id or "").strip()
    ride = await db.women_only_rides.find_one({"booking_id": ride_key}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Women Only ride not found")
    role = _normalize_role(current_user)
    current_user_id = str(current_user.get("id") or "").strip()
    allowed = role == "admin" or current_user_id in {
        str(ride.get("passenger_id") or ""),
        str(ride.get("driver_id") or ""),
    }
    if not allowed:
        raise HTTPException(status_code=403, detail="You cannot access this Women Only ride")
    return ride


@router.post("/book")
async def book_women_only_ride(
    payload: WomenOnlyRideRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure),
):
    if _normalize_role(current_user) != "passenger":
        raise HTTPException(status_code=403, detail="Passenger only")
    current_user_id = str(current_user.get("id") or "").strip()
    requested_passenger_id = str(payload.passenger_id or current_user_id).strip()
    if requested_passenger_id != current_user_id:
        raise HTTPException(status_code=403, detail="Cannot book Women Only ride for another passenger")
    profile_gender = str(current_user.get("gender") or "").strip()
    passenger_gender = str(payload.passenger_gender or profile_gender or "").strip()
    if profile_gender and not is_women_only_passenger_allowed(profile_gender):
        raise HTTPException(status_code=403, detail="Women Only rides are available only for female passengers")
    if not is_women_only_passenger_allowed(passenger_gender):
        raise HTTPException(status_code=400, detail="Passenger gender must be female for Women Only rides")

    scheduled_date = payload.scheduled_date
    context = build_women_only_safety_context(
        passenger_gender=passenger_gender,
        guardian_name=payload.guardian_name,
        guardian_phone=payload.guardian_phone,
        share_guardian_tracking=payload.share_guardian_tracking,
        female_driver_required=payload.female_driver_required,
        allow_trusted_male_driver_if_unavailable=(
            bool(payload.allow_trusted_male_driver_if_unavailable)
            and not bool(payload.female_driver_required)
        ),
        scheduled_time=scheduled_date,
    )
    distance_km = _distance_from_payload(payload.pickup_location, payload.drop_location)
    fare = calculate_women_only_fare(distance_km, payload.vehicle_type)
    candidate_driver_ids = await _find_candidate_driver_ids(
        db,
        vehicle_type=payload.vehicle_type,
        female_driver_required=context["female_driver_required"],
        allow_trusted_male_driver_if_unavailable=context["allow_trusted_male_driver_if_unavailable"],
    )
    now = get_ist_now()
    booking_id = f"WOMEN_{uuid.uuid4().hex[:12]}"
    status_value = "created" if scheduled_date else "searching_safe_driver"
    booking = {
        "id": booking_id,
        "booking_id": booking_id,
        "booking_type": "WOMEN_ONLY_RIDE",
        "passenger_id": current_user_id,
        "passenger_name": payload.passenger_name or current_user.get("name"),
        "passenger_phone": payload.phone or current_user.get("phone"),
        "passenger_gender": context["passenger_gender"],
        "pickup_location": payload.pickup_location,
        "drop_location": payload.drop_location,
        "ride_product": "women_only",
        "ride_type": "women_only",
        "ride_product_label": "Women-Only Ride",
        "vehicle_type_id": payload.vehicle_type,
        "passenger_count": payload.passengers_count,
        "scheduled_for": scheduled_date,
        "estimated_fare": fare,
        "distance_km": round(distance_km, 2),
        "women_only_required": True,
        "women_only_details": context,
        "driver_filter": context["driver_filter"],
        "candidate_driver_ids": candidate_driver_ids,
        "driver_gender_preference": "female" if context["female_driver_required"] else "female_preferred",
        "guardian_name": context["guardian"]["name"],
        "guardian_phone": context["guardian"]["phone"],
        "guardian_share_tracking": context["guardian"]["live_tracking_enabled"],
        "otp_required": {"pickup": True, "drop": False},
        "sos_enabled": True,
        "live_tracking_enabled": True,
        "night_ride": context["night_ride"],
        "completion_notification_enabled": True,
        "status": "scheduled" if scheduled_date else "pending",
        "dispatch_status": "scheduled" if scheduled_date else "searching_safe_driver",
        "notes": payload.notes,
        "created_at": now,
        "updated_at": now,
    }
    ride = {
        "booking_id": booking_id,
        "passenger_id": current_user_id,
        "passenger_gender": context["passenger_gender"],
        "pickup_location": payload.pickup_location,
        "drop_location": payload.drop_location,
        "vehicle_type": payload.vehicle_type,
        "passengers_count": payload.passengers_count,
        "scheduled_date": scheduled_date,
        "fare": fare,
        "female_driver_required": context["female_driver_required"],
        "allow_trusted_male_driver_if_unavailable": context["allow_trusted_male_driver_if_unavailable"],
        "guardian": context["guardian"],
        "pickup_otp_required": True,
        "pickup_otp": context["pickup_otp"],
        "pickup_otp_status": "sent_to_passenger",
        "pickup_otp_verified": False,
        "sos_enabled": True,
        "sos_events": [],
        "live_tracking_enabled": True,
        "night_ride": context["night_ride"],
        "night_safety_checks": context["night_safety_checks"],
        "completion_notification_enabled": True,
        "status": status_value,
        "status_flow": list(WOMEN_ONLY_STATUS_FLOW),
        "candidate_driver_ids": candidate_driver_ids,
        "guardian_notifications": [{"event": "booking_created", "status": "queued", "at": now}],
        "status_history": [{"status": status_value, "at": now}],
        "notes": payload.notes,
        "created_at": now,
        "updated_at": now,
    }
    await db.bookings.insert_one(booking)
    await db.women_only_rides.insert_one(ride)
    return {"status": "success", "booking": sanitize_women_only_ride_for_response(ride)}


@router.get("/{ride_id}")
async def get_women_only_ride(
    ride_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure),
):
    ride = await _get_women_only_booking(db, ride_id, current_user)
    return {"status": "success", "booking": sanitize_women_only_ride_for_response(ride)}


@router.post("/{ride_id}/verify-pickup")
async def verify_women_only_pickup(
    ride_id: str,
    payload: WomenOnlyPickupOtpRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure),
):
    ride = await _get_women_only_booking(db, ride_id, current_user)
    if str(ride.get("pickup_otp") or "").strip() != payload.otp.strip():
        raise HTTPException(status_code=400, detail="Invalid pickup OTP")
    now = get_ist_now()
    event = {"status": "started", "event": "pickup_otp_verified", "at": now}
    update_doc = {
        "pickup_otp_verified": True,
        "pickup_otp_verified_at": now,
        "status": "started",
        "updated_at": now,
    }
    await db.women_only_rides.update_one(
        {"booking_id": ride.get("booking_id")},
        {"$set": update_doc, "$push": {"status_history": event}},
    )
    await db.bookings.update_one(
        {"id": ride.get("booking_id")},
        {"$set": {"status": "in_progress", "dispatch_status": "trip_started", "updated_at": now}},
    )
    return {"status": "success", "pickup_verified": True}


@router.post("/{ride_id}/sos")
async def trigger_women_only_sos(
    ride_id: str,
    payload: WomenOnlySosRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure),
):
    ride = await _get_women_only_booking(db, ride_id, current_user)
    now = get_ist_now()
    sos_event = {
        "id": f"sos_{uuid.uuid4().hex[:10]}",
        "reason": (payload.reason or "Women Only ride SOS").strip(),
        "location": payload.location,
        "triggered_by": str(current_user.get("id") or ""),
        "at": now,
    }
    status_event = {"status": "sos_triggered", "at": now, "sos_event_id": sos_event["id"]}
    await db.women_only_rides.update_one(
        {"booking_id": ride.get("booking_id")},
        {
            "$set": {"status": "sos_triggered", "updated_at": now},
            "$push": {"sos_events": sos_event, "status_history": status_event},
        },
    )
    await db.bookings.update_one(
        {"id": ride.get("booking_id")},
        {
            "$set": {"status": "sos_triggered", "dispatch_status": "sos_triggered", "updated_at": now},
            "$push": {"sos_events": sos_event},
        },
    )
    return {"status": "success", "sos_event": sos_event}


@router.post("/{ride_id}/complete")
async def complete_women_only_ride(
    ride_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure),
):
    ride = await _get_women_only_booking(db, ride_id, current_user)
    now = get_ist_now()
    status_event = {"status": "completed", "at": now}
    summary = {
        "booking_id": ride.get("booking_id"),
        "guardian_notified": bool((ride.get("guardian") or {}).get("live_tracking_enabled")),
        "sos_events_count": len(ride.get("sos_events") or []),
        "pickup_otp_verified": bool(ride.get("pickup_otp_verified")),
        "completed_at": now,
    }
    await db.women_only_rides.update_one(
        {"booking_id": ride.get("booking_id")},
        {
            "$set": {
                "status": "completed",
                "completed_at": now,
                "updated_at": now,
                "trip_summary": summary,
            },
            "$push": {"status_history": status_event},
        },
    )
    await db.bookings.update_one(
        {"id": ride.get("booking_id")},
        {
            "$set": {
                "status": "completed",
                "dispatch_status": "completed",
                "completed_at": now,
                "updated_at": now,
                "trip_summary": summary,
            }
        },
    )
    return {"status": "success", "summary": summary}
