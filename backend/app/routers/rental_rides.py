import math
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field, model_validator

from app.db.deps import get_db
from app.models.rental import (
    RENTAL_STATUS_FLOW,
    build_rental_booking_context,
    calculate_rental_final_fare,
    list_rental_packages,
    rental_driver_eligibility,
    sanitize_rental_ride_for_response,
)
from app.utils.rbac import get_current_user_secure
from app.utils.time_helpers import get_ist_now


router = APIRouter(prefix="/api/rental-rides", tags=["rental_rides"])


class RentalStop(BaseModel):
    address: str = Field(min_length=1, max_length=240)
    latitude: float
    longitude: float
    waiting_minutes: int = Field(default=0, ge=0, le=720)


class RentalRideRequest(BaseModel):
    passenger_id: Optional[str] = Field(default=None, max_length=120)
    passenger_name: Optional[str] = Field(default=None, max_length=120)
    phone_number: Optional[str] = Field(default=None, max_length=20)
    pickup_location: Optional[Dict[str, Any]] = None
    pickup_latitude: Optional[float] = None
    pickup_longitude: Optional[float] = None
    pickup_address: Optional[str] = Field(default=None, max_length=240)
    vehicle_type: str = Field(default="auto", max_length=40)
    package_hours: int = Field(ge=1, le=12)
    included_km: Optional[float] = Field(default=None, ge=0)
    stops: List[RentalStop] = Field(default_factory=list, max_length=12)
    scheduled_time: Optional[datetime] = None
    passenger_count: int = Field(default=1, ge=1, le=6)
    notes: Optional[str] = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def validate_pickup(self):
        location = self.pickup_location if isinstance(self.pickup_location, dict) else {}
        latitude = self.pickup_latitude if self.pickup_latitude is not None else location.get("latitude")
        longitude = self.pickup_longitude if self.pickup_longitude is not None else location.get("longitude")
        address = self.pickup_address or location.get("address") or location.get("name")
        if latitude is None or longitude is None or not str(address or "").strip():
            raise ValueError("pickup location with latitude, longitude and address is required")
        return self


class RentalOtpRequest(BaseModel):
    otp: str = Field(min_length=4, max_length=8)


class RentalWaitingRequest(BaseModel):
    waiting_minutes: int = Field(ge=1, le=720)
    stop_index: Optional[int] = Field(default=None, ge=0, le=100)
    reason: Optional[str] = Field(default=None, max_length=160)


class RentalCompleteRequest(BaseModel):
    actual_distance_km: float = Field(ge=0)
    completed_at: Optional[datetime] = None


def _normalize_role(user: Dict[str, Any]) -> str:
    role = user.get("role")
    return str(getattr(role, "value", role) or "").strip().lower()


def _as_float(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
    except Exception:
        return default
    return number if math.isfinite(number) else default


def _model_dump(model: BaseModel) -> Dict[str, Any]:
    if hasattr(model, "model_dump"):
        return model.model_dump()
    return model.dict()


def _pickup_from_payload(payload: RentalRideRequest) -> Dict[str, Any]:
    location = payload.pickup_location if isinstance(payload.pickup_location, dict) else {}
    return {
        "latitude": _as_float(payload.pickup_latitude, _as_float(location.get("latitude"), 0.0)),
        "longitude": _as_float(payload.pickup_longitude, _as_float(location.get("longitude"), 0.0)),
        "address": payload.pickup_address or location.get("address") or location.get("name") or "Pickup",
    }


def _driver_projection() -> Dict[str, int]:
    return {
        "_id": 0,
        "id": 1,
        "user_id": 1,
        "name": 1,
        "current_location": 1,
        "vehicle_info": 1,
        "online_vehicle": 1,
        "vehicle_type": 1,
        "vehicle_type_id": 1,
        "rating": 1,
        "average_rating": 1,
        "rental_rating": 1,
        "rental_enabled": 1,
        "accepted_ride_types": 1,
        "kyc_status": 1,
        "kyc_verified": 1,
        "vehicle_verified": 1,
        "vehicle_verification_status": 1,
        "is_available": 1,
        "available": 1,
    }


async def _find_candidate_driver_ids(
    db: AsyncIOMotorDatabase,
    *,
    vehicle_type: str,
    package_hours: int,
    limit: int = 5,
) -> List[str]:
    drivers = await db.drivers.find(
        {
            "is_available": True,
            "vehicle_info": {"$ne": None},
            "kyc_status": "approved",
        },
        _driver_projection(),
    ).to_list(300)
    candidates: List[Dict[str, Any]] = []
    for driver in drivers:
        eligibility = rental_driver_eligibility(driver, vehicle_type=vehicle_type, package_hours=package_hours)
        if not eligibility["eligible"]:
            continue
        driver_id = str(driver.get("user_id") or driver.get("id") or "").strip()
        if not driver_id:
            continue
        candidates.append(
            {
                "driver_id": driver_id,
                "rating": float(eligibility.get("rating") or 0.0),
            }
        )
    candidates.sort(key=lambda item: -item["rating"])
    return [item["driver_id"] for item in candidates[: max(1, int(limit or 1))]]


async def _get_rental_ride(
    db: AsyncIOMotorDatabase,
    ride_id: str,
    current_user: Dict[str, Any],
) -> Dict[str, Any]:
    ride_key = str(ride_id or "").strip()
    ride = await db.rental_rides.find_one({"booking_id": ride_key}, {"_id": 0})
    if not ride:
        raise HTTPException(status_code=404, detail="Rental ride not found")
    role = _normalize_role(current_user)
    current_user_id = str(current_user.get("id") or "").strip()
    allowed = role == "admin" or current_user_id in {
        str(ride.get("passenger_id") or ""),
        str(ride.get("driver_id") or ""),
    }
    if not allowed:
        raise HTTPException(status_code=403, detail="You cannot access this rental ride")
    return ride


@router.get("/packages")
async def get_rental_packages(vehicle_type: Optional[str] = None):
    return {"status": "success", "packages": list_rental_packages(vehicle_type)}


@router.post("/book")
async def book_rental_ride(
    payload: RentalRideRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure),
):
    if _normalize_role(current_user) != "passenger":
        raise HTTPException(status_code=403, detail="Passenger only")

    current_user_id = str(current_user.get("id") or "").strip()
    requested_passenger_id = str(payload.passenger_id or current_user_id).strip()
    if requested_passenger_id != current_user_id:
        raise HTTPException(status_code=403, detail="Cannot book rental ride for another passenger")

    stops = [_model_dump(stop) for stop in payload.stops]
    try:
        context = build_rental_booking_context(
            vehicle_type=payload.vehicle_type,
            package_hours=payload.package_hours,
            included_km=payload.included_km,
            stops=stops,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    candidate_driver_ids = await _find_candidate_driver_ids(
        db,
        vehicle_type=context["vehicle_type"],
        package_hours=context["package_hours"],
    )
    pickup = _pickup_from_payload(payload)
    now = get_ist_now()
    booking_id = f"RENT_{uuid.uuid4().hex[:12]}"
    status_value = "created" if payload.scheduled_time else "searching_rental_driver"

    rental_details = {
        "vehicle_type": context["vehicle_type"],
        "package_hours": context["package_hours"],
        "included_km": context["included_km"],
        "base_fare": context["base_fare"],
        "extra_km_rate": context["extra_km_rate"],
        "extra_15_min_rate": context["extra_15_min_rate"],
        "minimum_hours": 1,
        "extra_time_billing_block_minutes": 15,
        "stops": stops,
        "status_flow": list(RENTAL_STATUS_FLOW),
    }
    booking = {
        "id": booking_id,
        "booking_id": booking_id,
        "booking_type": "RENTAL_RIDE",
        "passenger_id": current_user_id,
        "passenger_name": payload.passenger_name or current_user.get("name"),
        "passenger_phone": payload.phone_number or current_user.get("phone"),
        "pickup_location": pickup,
        "drop_location": None,
        "ride_product": "rental_hourly",
        "ride_type": "rental",
        "ride_product_label": "Rental / Hourly Package",
        "vehicle_type_id": context["vehicle_type"],
        "passenger_count": payload.passenger_count,
        "scheduled_for": payload.scheduled_time,
        "estimated_fare": context["estimated_fare"],
        "fare_before_discount": context["estimated_fare"],
        "rental_hours": context["package_hours"],
        "rental_package_hours": context["package_hours"],
        "rental_included_km": context["included_km"],
        "rental_details": rental_details,
        "driver_filter": context["driver_filter"],
        "candidate_driver_ids": candidate_driver_ids,
        "otp_required": {"pickup": True, "drop": False},
        "status": "scheduled" if payload.scheduled_time else "pending",
        "dispatch_status": "scheduled" if payload.scheduled_time else "searching_rental_driver",
        "dispatch_algorithm": "rental_package_pool_v1",
        "progress_handoff": {
            "active_booking_endpoint": "/api/bookings/active",
            "booking_status_event": "booking_status_changed",
            "driver_request_event": "new_booking_available",
            "rental_endpoint": f"/api/rental-rides/{booking_id}",
            "pickup_otp_endpoint": f"/api/rental-rides/{booking_id}/start",
            "add_stop_endpoint": f"/api/rental-rides/{booking_id}/add-stop",
            "complete_endpoint": f"/api/rental-rides/{booking_id}/complete",
            "recommended_poll_seconds": 5,
        },
        "notes": payload.notes,
        "created_at": now,
        "updated_at": now,
    }
    ride = {
        "booking_id": booking_id,
        "booking_type": "RENTAL_RIDE",
        "passenger_id": current_user_id,
        "passenger_name": payload.passenger_name or current_user.get("name"),
        "phone_number": payload.phone_number or current_user.get("phone"),
        "pickup_location": pickup,
        "vehicle_type": context["vehicle_type"],
        "package_hours": context["package_hours"],
        "included_km": context["included_km"],
        "base_fare": context["base_fare"],
        "extra_km_rate": context["extra_km_rate"],
        "extra_15_min_rate": context["extra_15_min_rate"],
        "estimated_fare": context["estimated_fare"],
        "stops": stops,
        "waiting_events": [],
        "total_driver_waiting_minutes": sum(int(stop.get("waiting_minutes") or 0) for stop in stops),
        "pickup_otp_required": True,
        "pickup_otp": context["pickup_otp"],
        "pickup_otp_status": "sent_to_passenger",
        "pickup_otp_verified": False,
        "driver_id": None,
        "candidate_driver_ids": candidate_driver_ids,
        "status": status_value,
        "status_flow": list(RENTAL_STATUS_FLOW),
        "scheduled_time": payload.scheduled_time,
        "status_history": [{"status": status_value, "at": now}],
        "notes": payload.notes,
        "created_at": now,
        "updated_at": now,
    }

    await db.bookings.insert_one(booking)
    await db.rental_rides.insert_one(ride)
    safe_ride = sanitize_rental_ride_for_response(ride)
    return {"status": "success", "message": "Rental ride created", "booking": safe_ride, "ride": safe_ride}


@router.get("/{ride_id}")
async def get_rental_ride(
    ride_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure),
):
    ride = await _get_rental_ride(db, ride_id, current_user)
    return {"status": "success", "booking": sanitize_rental_ride_for_response(ride)}


@router.post("/{ride_id}/start")
async def start_rental_ride(
    ride_id: str,
    payload: RentalOtpRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure),
):
    ride = await _get_rental_ride(db, ride_id, current_user)
    if str(ride.get("pickup_otp") or "").strip() != payload.otp.strip():
        raise HTTPException(status_code=400, detail="Invalid pickup OTP")

    now = get_ist_now()
    event = {"status": "started", "event": "pickup_otp_verified", "at": now}
    update_doc = {
        "pickup_otp_verified": True,
        "pickup_otp_verified_at": now,
        "status": "started",
        "started_at": now,
        "actual_distance_km": 0.0,
        "updated_at": now,
    }
    await db.rental_rides.update_one(
        {"booking_id": ride.get("booking_id")},
        {"$set": update_doc, "$push": {"status_history": event}},
    )
    await db.bookings.update_one(
        {"id": ride.get("booking_id")},
        {"$set": {"status": "in_progress", "dispatch_status": "trip_started", "updated_at": now}},
    )
    return {"status": "success", "pickup_verified": True}


@router.post("/{ride_id}/add-stop")
async def add_rental_stop(
    ride_id: str,
    payload: RentalStop,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure),
):
    ride = await _get_rental_ride(db, ride_id, current_user)
    if ride.get("status") not in {"started", "in_progress", "stop_added", "waiting"}:
        raise HTTPException(status_code=400, detail="Ride must be started before adding stops")
    now = get_ist_now()
    stop = _model_dump(payload)
    event = {"status": "stop_added", "stop": stop, "at": now}
    await db.rental_rides.update_one(
        {"booking_id": ride.get("booking_id")},
        {
            "$set": {"status": "stop_added", "updated_at": now},
            "$push": {"stops": stop, "status_history": event},
            "$inc": {"total_driver_waiting_minutes": int(stop.get("waiting_minutes") or 0)},
        },
    )
    await db.bookings.update_one(
        {"id": ride.get("booking_id")},
        {"$set": {"dispatch_status": "stop_added", "updated_at": now}},
    )
    return {"status": "success", "message": "Stop added", "stop": stop}


@router.post("/{ride_id}/waiting")
async def mark_rental_waiting(
    ride_id: str,
    payload: RentalWaitingRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure),
):
    ride = await _get_rental_ride(db, ride_id, current_user)
    if ride.get("status") not in {"started", "in_progress", "stop_added", "waiting"}:
        raise HTTPException(status_code=400, detail="Ride must be active before marking waiting time")
    now = get_ist_now()
    waiting_event = {
        "id": f"wait_{uuid.uuid4().hex[:10]}",
        "waiting_minutes": payload.waiting_minutes,
        "stop_index": payload.stop_index,
        "reason": payload.reason,
        "marked_by": str(current_user.get("id") or ""),
        "at": now,
    }
    status_event = {"status": "waiting", "waiting_event_id": waiting_event["id"], "at": now}
    await db.rental_rides.update_one(
        {"booking_id": ride.get("booking_id")},
        {
            "$set": {"status": "waiting", "updated_at": now},
            "$push": {"waiting_events": waiting_event, "status_history": status_event},
            "$inc": {"total_driver_waiting_minutes": payload.waiting_minutes},
        },
    )
    await db.bookings.update_one(
        {"id": ride.get("booking_id")},
        {"$set": {"dispatch_status": "waiting", "updated_at": now}},
    )
    return {"status": "success", "waiting_event": waiting_event}


@router.post("/{ride_id}/complete")
async def complete_rental_ride(
    ride_id: str,
    payload: RentalCompleteRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure),
):
    ride = await _get_rental_ride(db, ride_id, current_user)
    if ride.get("status") not in {"started", "in_progress", "stop_added", "waiting"}:
        raise HTTPException(status_code=400, detail="Rental ride has not started")
    if not ride.get("started_at"):
        raise HTTPException(status_code=400, detail="Rental ride has no start time")

    now = payload.completed_at or get_ist_now()
    fare = calculate_rental_final_fare(
        base_fare=ride.get("base_fare"),
        package_hours=ride.get("package_hours"),
        included_km=ride.get("included_km"),
        extra_km_rate=ride.get("extra_km_rate"),
        extra_15_min_rate=ride.get("extra_15_min_rate"),
        actual_distance_km=payload.actual_distance_km,
        started_at=ride.get("started_at"),
        completed_at=now,
    )
    summary = {
        "booking_id": ride.get("booking_id"),
        **fare,
        "total_driver_waiting_minutes": int(ride.get("total_driver_waiting_minutes") or 0),
        "completed_at": now,
    }
    status_event = {"status": "completed", "at": now}
    await db.rental_rides.update_one(
        {"booking_id": ride.get("booking_id")},
        {
            "$set": {
                "status": "completed",
                "completed_at": now,
                "actual_distance_km": fare["actual_distance_km"],
                "used_minutes": fare["used_minutes"],
                "extra_minutes": fare["extra_minutes"],
                "extra_15_min_blocks": int(fare["extra_15_min_blocks"]),
                "extra_km": fare["extra_km"],
                "extra_time_charge": fare["extra_time_charge"],
                "extra_km_charge": fare["extra_km_charge"],
                "final_fare": fare["final_fare"],
                "trip_summary": summary,
                "updated_at": now,
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
                "final_fare": fare["final_fare"],
                "estimated_fare": fare["final_fare"],
                "trip_summary": summary,
                "updated_at": now,
            }
        },
    )
    return {"status": "success", "message": "Rental ride completed", "summary": summary}
