import math
import secrets
import uuid
from datetime import timedelta
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db.deps import get_db
from app.models.assisted_ride import (
    ASSISTED_RIDE_STATUS_FLOW,
    AssignAssistedDriverRequest,
    AssistedRideRequest,
    VerifyAssistedOtpRequest,
    assisted_driver_eligibility,
    build_assisted_ride_snapshot,
    generate_assisted_otp,
    generate_assisted_ride_id,
    normalize_assisted_location,
    prepare_assisted_ride_context,
    serialize_assisted_ride,
)
from app.utils.rbac import get_current_user_secure
from app.utils.time_helpers import get_ist_now


router = APIRouter(prefix="/api/assisted-rides", tags=["assisted_rides"])


def _normalize_role(value: Any) -> str:
    role = str(value or "").strip().lower()
    if "." in role:
        role = role.split(".")[-1]
    return "passenger" if role == "user" else role


def _current_user_id(user: Dict[str, Any]) -> str:
    return str(user.get("id") or user.get("user_id") or user.get("_id") or "").strip()


def _driver_id_candidates(driver_id: str) -> List[Any]:
    driver_id = str(driver_id or "").strip()
    candidates: List[Any] = []
    if driver_id:
        candidates.append(driver_id)
        if ObjectId.is_valid(driver_id):
            candidates.append(ObjectId(driver_id))
    return candidates


def _as_float(value: Any, default: float = math.nan) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return parsed if math.isfinite(parsed) else default


def _location_distance_km(origin: Dict[str, Any], target: Dict[str, Any]) -> float:
    origin_lat = _as_float(origin.get("latitude"))
    origin_lng = _as_float(origin.get("longitude"))
    target_lat = _as_float(target.get("latitude"))
    target_lng = _as_float(target.get("longitude"))
    if any(not math.isfinite(value) for value in [origin_lat, origin_lng, target_lat, target_lng]):
        return math.inf
    radius_km = 6371.0
    lat1 = math.radians(origin_lat)
    lat2 = math.radians(target_lat)
    delta_lat = math.radians(target_lat - origin_lat)
    delta_lng = math.radians(target_lng - origin_lng)
    hav = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lng / 2) ** 2
    )
    return radius_km * 2 * math.atan2(math.sqrt(hav), math.sqrt(max(0.0, 1 - hav)))


def _driver_projection() -> Dict[str, int]:
    return {
        "_id": 1,
        "id": 1,
        "user_id": 1,
        "current_location": 1,
        "vehicle_info": 1,
        "vehicle_type": 1,
        "vehicle_type_id": 1,
        "rating": 1,
        "average_rating": 1,
        "gender": 1,
        "kyc_status": 1,
        "police_verified": 1,
        "background_check_status": 1,
        "trained_for_assisted_rides": 1,
        "assisted_ride_trained": 1,
        "assisted_ride_enabled": 1,
        "emergency_contact_verified": 1,
        "emergency_contact_enabled": 1,
        "emergency_contact_phone": 1,
        "safety_complaint_count": 1,
        "open_safety_complaints": 1,
        "accepted_ride_types": 1,
    }


async def _find_driver(db: AsyncIOMotorDatabase, driver_id: str) -> Optional[Dict[str, Any]]:
    candidates = _driver_id_candidates(driver_id)
    if not candidates:
        return None
    return await db.drivers.find_one(
        {"$or": [{"user_id": {"$in": candidates}}, {"id": {"$in": candidates}}, {"_id": {"$in": candidates}}]},
        _driver_projection(),
    )


async def _find_eligible_assisted_driver_ids(
    db: AsyncIOMotorDatabase,
    pickup: Dict[str, Any],
    *,
    radius_km: float = 3.0,
    limit: int = 5,
    female_preferred: bool = False,
) -> List[str]:
    drivers = await db.drivers.find(
        {
            "is_available": True,
            "vehicle_info": {"$ne": None},
            "kyc_status": "approved",
        },
        _driver_projection(),
    ).to_list(300)
    scored: List[Dict[str, Any]] = []
    for driver in drivers:
        distance = _location_distance_km(pickup, driver.get("current_location") or {})
        if not math.isfinite(distance) or distance > radius_km:
            continue
        eligibility = await assisted_driver_eligibility(db, driver)
        if not eligibility["eligible"]:
            continue
        driver_id = str(driver.get("user_id") or driver.get("id") or driver.get("_id") or "").strip()
        if not driver_id:
            continue
        gender_rank = 0 if female_preferred and str(driver.get("gender") or "").lower() == "female" else 1
        scored.append({"driver_id": driver_id, "distance_km": distance, "gender_rank": gender_rank})
    scored.sort(key=lambda item: (item["gender_rank"], item["distance_km"]))
    return [item["driver_id"] for item in scored[: max(1, int(limit or 1))]]


def _ride_identity_filter(ride_id: str) -> Dict[str, Any]:
    filters: List[Dict[str, Any]] = [{"id": ride_id}, {"booking_id": ride_id}]
    if ObjectId.is_valid(str(ride_id or "")):
        filters.append({"_id": ObjectId(str(ride_id))})
    return {"$or": filters}


async def _get_ride(db: AsyncIOMotorDatabase, ride_id: str) -> Dict[str, Any]:
    ride = await db.assisted_rides.find_one(_ride_identity_filter(ride_id))
    if not ride:
        raise HTTPException(status_code=404, detail="Assisted ride not found")
    return ride


def _ensure_can_view_ride(ride: Dict[str, Any], user: Dict[str, Any]) -> None:
    role = _normalize_role(user.get("role") or user.get("user_type"))
    user_id = _current_user_id(user)
    if role in {"admin", "operator", "dispatcher", "support"}:
        return
    if user_id and user_id in {str(ride.get("passenger_id") or ""), str(ride.get("driver_id") or "")}:
        return
    raise HTTPException(status_code=403, detail="Permission denied")


async def _assign_driver_to_ride(
    db: AsyncIOMotorDatabase,
    ride: Dict[str, Any],
    driver_id: str,
) -> Dict[str, Any]:
    driver = await _find_driver(db, driver_id)
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    eligibility = await assisted_driver_eligibility(db, driver)
    if not eligibility["eligible"]:
        raise HTTPException(
            status_code=400,
            detail={"message": "Driver is not eligible for assisted rides", "issues": eligibility["issues"]},
        )

    now = get_ist_now()
    update = {
        "$set": {
            "driver_id": str(driver.get("user_id") or driver.get("id") or driver.get("_id")),
            "driver_snapshot": {
                "id": str(driver.get("user_id") or driver.get("id") or driver.get("_id")),
                "rating": driver.get("rating") or driver.get("average_rating"),
                "vehicle_info": driver.get("vehicle_info"),
                "assisted_ride_verified": True,
            },
            "status": "driver_assigned",
            "updated_at": now,
            "assigned_at": now,
        },
        "$push": {
            "status_history": {"status": "driver_assigned", "at": now},
            "guardian_notifications": {"event": "driver_assigned", "status": "queued", "at": now},
        },
    }
    await db.assisted_rides.update_one(_ride_identity_filter(str(ride.get("id"))), update)
    if ride.get("booking_id"):
        await db.bookings.update_one(
            {"id": ride["booking_id"]},
            {
                "$set": {
                    "driver_id": str(driver.get("user_id") or driver.get("id") or driver.get("_id")),
                    "status": "accepted",
                    "dispatch_status": "driver_assigned",
                    "assisted_ride.status": "driver_assigned",
                    "updated_at": now,
                }
            },
        )
    return await _get_ride(db, str(ride.get("id")))


@router.post("/book")
async def book_assisted_ride(
    payload: AssistedRideRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure),
):
    if _normalize_role(current_user.get("role") or current_user.get("user_type")) != "passenger":
        raise HTTPException(status_code=403, detail="Passenger only")
    passenger_id = _current_user_id(current_user)
    if not passenger_id:
        raise HTTPException(status_code=401, detail="Invalid account data. Please login again.")

    try:
        context = prepare_assisted_ride_context(
            ride_category=payload.ride_category,
            guardian_name=payload.guardian_name,
            guardian_phone=payload.guardian_phone,
            passenger_name=payload.passenger_name,
            passenger_age=payload.passenger_age,
            wheelchair_required=payload.wheelchair_required,
            assistance_required=payload.assistance_required,
            female_driver_preferred=payload.female_driver_preferred,
            trusted_driver_required=payload.trusted_driver_required,
            guardian_share_tracking=payload.guardian_share_tracking,
            scheduled_time=payload.scheduled_time,
            notes=payload.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    pickup = normalize_assisted_location(payload, "pickup")
    drop = normalize_assisted_location(payload, "drop")
    if not pickup.get("address") or not drop.get("address"):
        raise HTTPException(status_code=400, detail="Pickup and drop addresses are required")

    now = get_ist_now()
    assisted_ride_id = generate_assisted_ride_id()
    booking_id = str(uuid.uuid4())
    candidate_driver_ids = await _find_eligible_assisted_driver_ids(
        db,
        pickup,
        female_preferred=context["female_driver_preferred"],
    )
    snapshot = build_assisted_ride_snapshot(context, assisted_ride_id=assisted_ride_id, status="searching_driver")
    ride_doc = {
        "id": assisted_ride_id,
        "booking_id": booking_id,
        "booking_type": "ASSISTED_RIDE",
        "passenger_id": passenger_id,
        "ride_category": context["ride_category"],
        "pickup_location": pickup,
        "drop_location": drop,
        "guardian_name": context["guardian_name"],
        "guardian_phone": context["guardian_phone"],
        "passenger_name": context["passenger_name"],
        "passenger_age": context["passenger_age"],
        "wheelchair_required": context["wheelchair_required"],
        "assistance_required": context["assistance_required"],
        "female_driver_preferred": context["female_driver_preferred"],
        "trusted_driver_required": context["trusted_driver_required"],
        "guardian_share_tracking": context["guardian_share_tracking"],
        "scheduled_time": context.get("scheduled_time"),
        "notes": context.get("notes"),
        "status": "searching_driver",
        "status_flow": ASSISTED_RIDE_STATUS_FLOW,
        "pickup_otp": generate_assisted_otp(),
        "drop_otp": generate_assisted_otp(),
        "candidate_driver_ids": candidate_driver_ids,
        "guardian_notifications": [{"event": "booking_created", "status": "queued", "at": now}],
        "status_history": [{"status": "searching_driver", "at": now}],
        "created_at": now,
        "updated_at": now,
        "expires_at": now + timedelta(minutes=30),
    }
    booking_doc = {
        "id": booking_id,
        "booking_type": "ASSISTED_RIDE",
        "assisted_ride_id": assisted_ride_id,
        "passenger_id": passenger_id,
        "pickup_location": pickup,
        "drop_location": drop,
        "ride_product": "school_elderly_safe",
        "ride_product_label": "School / Elderly Safe Ride",
        "safe_ride_priority": context["ride_category"],
        "passenger_count": payload.passenger_count,
        "assisted_ride": snapshot,
        "otp_required": {"pickup": True, "drop": True},
        "driver_filter": {
            "assisted_ride_required": True,
            "police_verified_required": True,
            "trained_for_assisted_rides_required": True,
            "min_rating": 4.5,
            "no_safety_complaint_required": True,
            "emergency_contact_required": True,
            "vehicle_document_valid_required": True,
            "female_driver_preferred": context["female_driver_preferred"],
        },
        "status": "scheduled" if context.get("scheduled_time") else "pending",
        "dispatch_status": "scheduled" if context.get("scheduled_time") else "searching",
        "candidate_driver_ids": candidate_driver_ids,
        "estimated_fare": 0.0,
        "payment_method": "cash",
        "created_at": now,
        "updated_at": now,
    }
    await db.assisted_rides.insert_one(ride_doc)
    await db.bookings.insert_one(booking_doc)
    return {
        "message": "Assisted ride request created",
        "ride": serialize_assisted_ride(ride_doc),
        "booking": booking_doc,
    }


@router.get("/{ride_id}")
async def get_assisted_ride(
    ride_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure),
):
    ride = await _get_ride(db, ride_id)
    _ensure_can_view_ride(ride, current_user)
    return serialize_assisted_ride(ride)


@router.post("/{ride_id}/assign-driver")
async def assign_assisted_ride_driver(
    ride_id: str,
    payload: AssignAssistedDriverRequest = AssignAssistedDriverRequest(),
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure),
):
    ride = await _get_ride(db, ride_id)
    role = _normalize_role(current_user.get("role") or current_user.get("user_type"))
    user_id = _current_user_id(current_user)
    if role not in {"admin", "operator", "dispatcher", "driver", "passenger"}:
        raise HTTPException(status_code=403, detail="Permission denied")
    if role == "passenger" and user_id != str(ride.get("passenger_id") or ""):
        raise HTTPException(status_code=403, detail="Permission denied")

    driver_id = str(payload.driver_id or "").strip()
    if role == "driver":
        if driver_id and driver_id != user_id:
            raise HTTPException(status_code=403, detail="Drivers can only assign themselves")
        driver_id = user_id
    if not driver_id:
        candidate_ids = await _find_eligible_assisted_driver_ids(
            db,
            ride.get("pickup_location") or {},
            female_preferred=bool(ride.get("female_driver_preferred")),
            limit=1,
        )
        driver_id = candidate_ids[0] if candidate_ids else ""
    if not driver_id:
        raise HTTPException(status_code=404, detail="No eligible assisted-ride driver found nearby")

    updated = await _assign_driver_to_ride(db, ride, driver_id)
    return {"message": "Assisted ride driver assigned", "ride": serialize_assisted_ride(updated)}


async def _verify_otp(
    db: AsyncIOMotorDatabase,
    ride: Dict[str, Any],
    *,
    otp: str,
    otp_key: str,
    next_status: str,
    booking_status: str,
    dispatch_status: str,
    event_name: str,
) -> Dict[str, Any]:
    stored = str(ride.get(otp_key) or "")
    if not stored or not secrets.compare_digest(stored, str(otp or "").strip()):
        raise HTTPException(status_code=400, detail="Invalid OTP")
    now = get_ist_now()
    set_values = {
        "status": next_status,
        "updated_at": now,
        f"{otp_key}_verified_at": now,
    }
    if otp_key == "pickup_otp":
        set_values.update(
            {
                "pickup_verified_at": now,
                "ride_started_at": now,
                "live_tracking_started_at": now,
            }
        )
    if otp_key == "drop_otp":
        set_values.update(
            {
                "drop_verified_at": now,
                "completed_at": now,
                "guardian_notified_at": now,
            }
        )
    await db.assisted_rides.update_one(
        _ride_identity_filter(str(ride.get("id"))),
        {
            "$set": set_values,
            "$push": {
                "status_history": {"status": next_status, "at": now},
                "guardian_notifications": {"event": event_name, "status": "queued", "at": now},
            },
        },
    )
    if ride.get("booking_id"):
        await db.bookings.update_one(
            {"id": ride["booking_id"]},
            {
                "$set": {
                    "status": booking_status,
                    "dispatch_status": dispatch_status,
                    "assisted_ride.status": next_status,
                    f"assisted_ride.{otp_key}_status": "verified",
                    "updated_at": now,
                }
            },
        )
    return await _get_ride(db, str(ride.get("id")))


def _ensure_can_verify_otp(ride: Dict[str, Any], user: Dict[str, Any]) -> None:
    role = _normalize_role(user.get("role") or user.get("user_type"))
    user_id = _current_user_id(user)
    if role in {"admin", "operator", "dispatcher", "support"}:
        return
    if role == "driver" and user_id == str(ride.get("driver_id") or ""):
        return
    if role == "passenger" and user_id == str(ride.get("passenger_id") or ""):
        return
    raise HTTPException(status_code=403, detail="Permission denied")


@router.post("/{ride_id}/verify-pickup")
async def verify_assisted_pickup(
    ride_id: str,
    payload: VerifyAssistedOtpRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure),
):
    ride = await _get_ride(db, ride_id)
    _ensure_can_verify_otp(ride, current_user)
    updated = await _verify_otp(
        db,
        ride,
        otp=payload.otp,
        otp_key="pickup_otp",
        next_status="live_tracking",
        booking_status="in_progress",
        dispatch_status="ride_started",
        event_name="pickup_verified_live_tracking_started",
    )
    return {"message": "Pickup OTP verified. Live tracking shared with guardian.", "ride": serialize_assisted_ride(updated)}


@router.post("/{ride_id}/verify-drop")
async def verify_assisted_drop(
    ride_id: str,
    payload: VerifyAssistedOtpRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure),
):
    ride = await _get_ride(db, ride_id)
    _ensure_can_verify_otp(ride, current_user)
    updated = await _verify_otp(
        db,
        ride,
        otp=payload.otp,
        otp_key="drop_otp",
        next_status="guardian_notified",
        booking_status="completed",
        dispatch_status="completed",
        event_name="drop_verified_completion_alert",
    )
    return {"message": "Drop OTP verified. Completion alert queued for guardian.", "ride": serialize_assisted_ride(updated)}
