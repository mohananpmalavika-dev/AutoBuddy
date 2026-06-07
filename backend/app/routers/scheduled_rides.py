"""
Scheduled Rides Router
Handles creation, retrieval, and management of scheduled rides with recurring support
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.security import HTTPBearer
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Literal
from bson import ObjectId
import calendar
import logging
import math

from app.db.deps import get_db
from app.utils.rbac import require_roles

router = APIRouter(prefix="/api/scheduled-rides", tags=["scheduled_rides"])
logger = logging.getLogger(__name__)

MIN_ADVANCE_MINUTES = 30
REMINDER_BEFORE_MINUTES = 60
DISPATCH_BEFORE_MINUTES = 30
ASSIGNMENT_BEFORE_MINUTES = 15
LIVE_RIDE_CREATION_BEFORE_MINUTES = 5
CANCELLATION_FEE_WINDOW_MINUTES = 15
LATE_CANCELLATION_FEE = 30.0
SCHEDULED_RIDE_RESERVATION_FEE = 20.0

ACTIVE_SCHEDULED_STATUSES = ["pending", "scheduled", "confirmed", "pending_confirmation", "dispatching"]


def _current_user_id(current_user: dict) -> str:
    return str(current_user.get("id", "")).strip()


def _object_id_or_400(value: str, field_name: str = "ride_id") -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid {field_name}")
    return ObjectId(value)


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _normalize_driver_gender_preference(value: Optional[str]) -> str:
    raw = str(value or "any").strip().lower()
    aliases = {
        "": "any",
        "none": "any",
        "no_preference": "any",
        "no-preference": "any",
        "female_only": "female",
        "female-only": "female",
        "women": "female",
        "woman": "female",
        "male_only": "male",
        "male-only": "male",
        "men": "male",
        "man": "male",
    }
    normalized = aliases.get(raw, raw)
    if normalized not in {"any", "female", "male"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="driver_gender_preference must be any, female, or male",
        )
    return normalized


def _driver_filter_for_preference(preference: str) -> Optional[Dict[str, str]]:
    return {"gender": preference} if preference in {"female", "male"} else None


def _coord(location: Any, key: str) -> Optional[float]:
    value = getattr(location, key, None) if isinstance(location, Location) else (location or {}).get(key)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _distance_km(pickup: Any, dropoff: Any) -> float:
    pickup_lat = _coord(pickup, "latitude")
    pickup_lng = _coord(pickup, "longitude")
    drop_lat = _coord(dropoff, "latitude")
    drop_lng = _coord(dropoff, "longitude")
    if None in {pickup_lat, pickup_lng, drop_lat, drop_lng}:
        return 0.0

    earth_radius_km = 6371.0
    d_lat = math.radians(drop_lat - pickup_lat)
    d_lng = math.radians(drop_lng - pickup_lng)
    lat1 = math.radians(pickup_lat)
    lat2 = math.radians(drop_lat)
    a = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lng / 2) ** 2
    return earth_radius_km * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _estimate_scheduled_fare(ride: "ScheduledRideCreate") -> float:
    if ride.estimated_fare is not None:
        return round(max(float(ride.estimated_fare), 0.0), 2)
    distance = _distance_km(ride.pickup_location, ride.dropoff_location)
    return round(max(60.0, 35.0 + (distance * 18.0) + SCHEDULED_RIDE_RESERVATION_FEE), 2)


def _scheduled_lifecycle_fields(
    scheduled_time: datetime,
    now: Optional[datetime] = None,
    *,
    include_created: bool = True,
) -> Dict[str, Any]:
    current = now or datetime.now(timezone.utc)
    fields = {
        "status": "scheduled",
        "dispatch_status": "reserved",
        "reminder_due_at": scheduled_time - timedelta(minutes=REMINDER_BEFORE_MINUTES),
        "reminder_sent": False,
        "reminder_sent_at": None,
        "dispatch_due_at": scheduled_time - timedelta(minutes=DISPATCH_BEFORE_MINUTES),
        "dispatch_started": False,
        "dispatch_started_at": None,
        "driver_assignment_due_at": scheduled_time - timedelta(minutes=ASSIGNMENT_BEFORE_MINUTES),
        "driver_assignment_started": False,
        "driver_assignment_started_at": None,
        "driver_confirmed": False,
        "driver_confirmed_at": None,
        "payment_hold_status": "not_started",
        "payment_hold_amount": None,
        "cancellation_fee": 0.0,
        "cancelled_at": None,
        "cancel_reason": None,
        "updated_at": current,
    }
    if include_created:
        fields["created_at"] = current
    return fields


def _late_cancellation_fee(scheduled_time: datetime, now: datetime) -> float:
    if not isinstance(scheduled_time, datetime):
        return 0.0
    minutes_until = (_as_utc(scheduled_time) - now).total_seconds() / 60
    return LATE_CANCELLATION_FEE if 0 <= minutes_until <= CANCELLATION_FEE_WINDOW_MINUTES else 0.0


# Models
class Location(BaseModel):
    address: str
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)


class ScheduledRideCreate(BaseModel):
    pickup_location: Location
    dropoff_location: Location
    scheduled_time: datetime
    trip_type: str = "ride"
    estimated_fare: Optional[float] = None
    preferred_payment: str = "wallet"
    driver_gender_preference: str = "any"
    notes: Optional[str] = None
    
    # Recurring options
    is_recurring: bool = False
    recurring_pattern: Optional[Literal["daily", "weekly", "monthly"]] = None
    recurring_end_date: Optional[datetime] = None
    recurring_days: Optional[List[int]] = None  # 0=Monday, 6=Sunday for weekly


class ScheduledRideUpdate(BaseModel):
    pickup_location: Optional[Location] = None
    dropoff_location: Optional[Location] = None
    scheduled_time: Optional[datetime] = None
    notes: Optional[str] = None
    driver_gender_preference: Optional[str] = None
    status: Optional[Literal["pending", "scheduled", "confirmed", "cancelled"]] = None


class ScheduledRideResponse(BaseModel):
    id: str
    passenger_id: str
    pickup_location: Location
    dropoff_location: Location
    scheduled_time: datetime
    trip_type: str
    estimated_fare: Optional[float]
    preferred_payment: str
    driver_gender_preference: str = "any"
    driver_filter: Optional[Dict[str, Any]] = None
    status: str
    notes: Optional[str]
    is_recurring: bool
    recurring_pattern: Optional[str]
    recurring_end_date: Optional[datetime]
    recurring_days: Optional[List[int]] = None
    recurring_template_id: Optional[str] = None
    recurring_rule: Optional[Dict[str, Any]] = None
    ride_id: Optional[str]  # Actual ride created from schedule
    confirmation_code: Optional[str] = None
    dispatch_status: Optional[str] = None
    reminder_due_at: Optional[datetime] = None
    reminder_sent: bool = False
    reminder_sent_at: Optional[datetime] = None
    dispatch_due_at: Optional[datetime] = None
    dispatch_started: bool = False
    dispatch_started_at: Optional[datetime] = None
    driver_assignment_due_at: Optional[datetime] = None
    driver_assignment_started: bool = False
    driver_assignment_started_at: Optional[datetime] = None
    driver_confirmed: bool = False
    driver_confirmed_at: Optional[datetime] = None
    payment_hold_status: str = "not_started"
    payment_hold_amount: Optional[float] = None
    cancellation_fee: float = 0.0
    cancelled_at: Optional[datetime] = None
    cancel_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class RecurringScheduledRideTemplateResponse(BaseModel):
    id: str
    passenger_id: str
    pickup_location: Location
    dropoff_location: Location
    trip_type: str
    preferred_payment: str
    driver_gender_preference: str = "any"
    driver_filter: Optional[Dict[str, Any]] = None
    recurring_pattern: str
    recurring_days: Optional[List[int]] = None
    recurring_end_date: datetime
    next_scheduled_time: Optional[datetime] = None
    active: bool
    created_at: datetime
    updated_at: datetime


# Endpoints
@router.post("/", response_model=ScheduledRideResponse, status_code=status.HTTP_201_CREATED)
async def create_scheduled_ride(
    ride: ScheduledRideCreate,
    current_passenger: dict = Depends(require_roles("passenger")),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Create a new scheduled ride with optional recurring options"""
    try:
        now = datetime.now(timezone.utc)
        scheduled_time = _as_utc(ride.scheduled_time)
        if scheduled_time < now + timedelta(minutes=MIN_ADVANCE_MINUTES):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Scheduled rides must be booked at least {MIN_ADVANCE_MINUTES} minutes in advance"
            )
        driver_gender_preference = _normalize_driver_gender_preference(ride.driver_gender_preference)
        driver_filter = _driver_filter_for_preference(driver_gender_preference)
        estimated_fare = _estimate_scheduled_fare(ride)
        
        recurring_pattern = ride.recurring_pattern
        recurring_end_date = _as_utc(ride.recurring_end_date) if ride.recurring_end_date else None
        recurring_days = ride.recurring_days
        recurring_template_id = None
        if ride.is_recurring:
            recurring_pattern = recurring_pattern or "weekly"
            recurring_end_date = recurring_end_date or (scheduled_time + timedelta(weeks=12))
            if recurring_pattern == "weekly":
                recurring_days = recurring_days or [scheduled_time.weekday()]
            if recurring_end_date <= scheduled_time:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="recurring_end_date must be after scheduled_time"
                )
        
        passenger_id = _current_user_id(current_passenger)
        recurring_rule = None
        scheduled_ride_id = ObjectId()
        confirmation_code = f"SR-{str(scheduled_ride_id)[-6:].upper()}"
        if ride.is_recurring:
            recurring_template_id = str(ObjectId())
            recurring_rule = {
                "pattern": recurring_pattern,
                "days": recurring_days or [],
                "starts_at": scheduled_time,
                "ends_at": recurring_end_date,
                "timezone": "UTC",
            }
            await db.recurring_scheduled_ride_templates.insert_one({
                "_id": ObjectId(recurring_template_id),
                "passenger_id": passenger_id,
                "pickup_location": ride.pickup_location.model_dump(),
                "dropoff_location": ride.dropoff_location.model_dump(),
                "trip_type": ride.trip_type,
                "estimated_fare": estimated_fare,
                "preferred_payment": ride.preferred_payment,
                "driver_gender_preference": driver_gender_preference,
                "driver_filter": driver_filter,
                "notes": ride.notes,
                "recurring_pattern": recurring_pattern,
                "recurring_days": recurring_days,
                "recurring_end_date": recurring_end_date,
                "next_scheduled_time": scheduled_time,
                "active": True,
                "created_at": now,
                "updated_at": now,
            })

        # Create scheduled ride document
        scheduled_ride = {
            "_id": scheduled_ride_id,
            "passenger_id": passenger_id,
            "pickup_location": ride.pickup_location.model_dump(),
            "dropoff_location": ride.dropoff_location.model_dump(),
            "scheduled_time": scheduled_time,
            "trip_type": ride.trip_type,
            "estimated_fare": estimated_fare,
            "preferred_payment": ride.preferred_payment,
            "driver_gender_preference": driver_gender_preference,
            "driver_filter": driver_filter,
            "confirmation_code": confirmation_code,
            "notes": ride.notes,
            "is_recurring": ride.is_recurring,
            "recurring_pattern": recurring_pattern,
            "recurring_end_date": recurring_end_date,
            "recurring_days": recurring_days,
            "recurring_template_id": recurring_template_id,
            "recurring_rule": recurring_rule,
            "ride_id": None,
            **_scheduled_lifecycle_fields(scheduled_time, now),
        }
        
        result = await db.scheduled_rides.insert_one(scheduled_ride)
        scheduled_ride["_id"] = result.inserted_id
        
        # Schedule recurring rides if needed
        if ride.is_recurring:
            await _schedule_recurring_rides(scheduled_ride, db)
        
        logger.info(f"Scheduled ride created: {result.inserted_id} for passenger {passenger_id}")
        
        return _format_ride(scheduled_ride)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating scheduled ride: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create scheduled ride"
        )


@router.get("/", response_model=List[ScheduledRideResponse])
async def list_scheduled_rides(
    current_passenger: dict = Depends(require_roles("passenger")),
    status_filter: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """List all scheduled rides for the current passenger"""
    try:
        query = {"passenger_id": _current_user_id(current_passenger)}
        
        if status_filter:
            query["status"] = status_filter
        
        rides = await db.scheduled_rides.find(query)\
            .sort("scheduled_time", 1)\
            .skip(skip)\
            .limit(limit)\
            .to_list(None)
        
        return [_format_ride(ride) for ride in rides]
    
    except Exception as e:
        logger.error(f"Error listing scheduled rides: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve scheduled rides"
        )


@router.get("/recurring-templates", response_model=List[RecurringScheduledRideTemplateResponse])
async def list_recurring_templates(
    current_passenger: dict = Depends(require_roles("passenger")),
    active_only: bool = Query(True),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """List recurring scheduled ride templates/rules for the current passenger"""
    query = {"passenger_id": _current_user_id(current_passenger)}
    if active_only:
        query["active"] = True
    templates = await db.recurring_scheduled_ride_templates.find(query)\
        .sort("updated_at", -1)\
        .to_list(100)
    return [_format_template(template) for template in templates]


@router.delete("/recurring-templates/{template_id}")
async def deactivate_recurring_template(
    template_id: str,
    current_passenger: dict = Depends(require_roles("passenger")),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Deactivate a recurring template and cancel future pending occurrences"""
    if not ObjectId.is_valid(template_id):
        raise HTTPException(status_code=400, detail="Invalid recurring template ID")
    passenger_id = _current_user_id(current_passenger)
    now = datetime.now(timezone.utc)
    result = await db.recurring_scheduled_ride_templates.update_one(
        {"_id": ObjectId(template_id), "passenger_id": passenger_id},
        {"$set": {"active": False, "updated_at": now}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Recurring template not found")
    await db.scheduled_rides.update_many(
        {
            "passenger_id": passenger_id,
            "recurring_template_id": template_id,
            "status": {"$in": ACTIVE_SCHEDULED_STATUSES},
            "scheduled_time": {"$gte": now},
        },
        {
            "$set": {
                "status": "cancelled",
                "dispatch_status": "cancelled",
                "cancelled_at": now,
                "cancel_reason": "recurring_template_deactivated",
                "updated_at": now,
            }
        },
    )
    return {"status": "deactivated", "template_id": template_id}


@router.get("/{ride_id}", response_model=ScheduledRideResponse)
async def get_scheduled_ride(
    ride_id: str,
    current_passenger: dict = Depends(require_roles("passenger")),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get a specific scheduled ride"""
    try:
        ride_object_id = _object_id_or_400(ride_id)
        ride = await db.scheduled_rides.find_one({
            "_id": ride_object_id,
            "passenger_id": _current_user_id(current_passenger)
        })
        
        if not ride:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Scheduled ride not found"
            )
        
        return _format_ride(ride)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving scheduled ride: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve scheduled ride"
        )


@router.put("/{ride_id}", response_model=ScheduledRideResponse)
async def update_scheduled_ride(
    ride_id: str,
    update: ScheduledRideUpdate,
    current_passenger: dict = Depends(require_roles("passenger")),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Update a scheduled ride"""
    try:
        ride_object_id = _object_id_or_400(ride_id)
        # Verify ownership
        ride = await db.scheduled_rides.find_one({
            "_id": ride_object_id,
            "passenger_id": _current_user_id(current_passenger)
        })
        
        if not ride:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Scheduled ride not found"
            )
        
        # Can't update if ride already started
        if ride["status"] in ["in_progress", "completed", "cancelled"]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot update ride in this status"
            )
        
        # Prepare update data
        now = datetime.now(timezone.utc)
        update_data = {}
        if update.pickup_location:
            update_data["pickup_location"] = update.pickup_location.model_dump()
        if update.dropoff_location:
            update_data["dropoff_location"] = update.dropoff_location.model_dump()
        if update.scheduled_time:
            scheduled_time = _as_utc(update.scheduled_time)
            if scheduled_time < now + timedelta(minutes=MIN_ADVANCE_MINUTES):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Scheduled rides must be booked at least {MIN_ADVANCE_MINUTES} minutes in advance",
                )
            update_data["scheduled_time"] = scheduled_time
            update_data.update(_scheduled_lifecycle_fields(scheduled_time, now, include_created=False))
            update_data["ride_id"] = None
        if update.notes is not None:
            update_data["notes"] = update.notes
        if update.driver_gender_preference is not None:
            driver_gender_preference = _normalize_driver_gender_preference(update.driver_gender_preference)
            update_data["driver_gender_preference"] = driver_gender_preference
            update_data["driver_filter"] = _driver_filter_for_preference(driver_gender_preference)
        if update.status:
            update_data["status"] = update.status
        
        update_data["updated_at"] = now
        
        updated_ride = await db.scheduled_rides.find_one_and_update(
            {"_id": ride_object_id},
            {"$set": update_data},
            return_document=True
        )
        
        logger.info(f"Scheduled ride updated: {ride_id}")
        return _format_ride(updated_ride)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating scheduled ride: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update scheduled ride"
        )


@router.delete("/{ride_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_scheduled_ride(
    ride_id: str,
    current_passenger: dict = Depends(require_roles("passenger")),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Delete/cancel a scheduled ride"""
    try:
        ride_object_id = _object_id_or_400(ride_id)
        ride = await db.scheduled_rides.find_one({
            "_id": ride_object_id,
            "passenger_id": _current_user_id(current_passenger)
        })
        
        if not ride:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Scheduled ride not found"
            )
        if ride.get("status") in {"in_progress", "completed"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot cancel a scheduled ride after it has started",
            )
        
        now = datetime.now(timezone.utc)
        cancellation_fee = _late_cancellation_fee(ride.get("scheduled_time"), now)
        await db.scheduled_rides.update_one(
            {"_id": ride_object_id},
            {
                "$set": {
                    "status": "cancelled",
                    "dispatch_status": "cancelled",
                    "cancelled_at": now,
                    "cancel_reason": "passenger_cancelled",
                    "cancellation_fee": cancellation_fee,
                    "updated_at": now,
                }
            },
        )

        logger.info(f"Scheduled ride cancelled: {ride_id}")
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting scheduled ride: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete scheduled ride"
        )


@router.post("/{ride_id}/confirm", response_model=ScheduledRideResponse)
async def confirm_scheduled_ride(
    ride_id: str,
    current_passenger: dict = Depends(require_roles("passenger")),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Confirm and activate a scheduled ride"""
    try:
        ride_object_id = _object_id_or_400(ride_id)
        ride = await db.scheduled_rides.find_one({
            "_id": ride_object_id,
            "passenger_id": _current_user_id(current_passenger)
        })
        
        if not ride:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Scheduled ride not found"
            )
        
        if ride["status"] not in {"pending", "scheduled", "pending_confirmation"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot confirm ride with status: {ride['status']}"
            )
        
        now = datetime.now(timezone.utc)
        updated_ride = await db.scheduled_rides.find_one_and_update(
            {"_id": ride_object_id},
            {
                "$set": {
                    "status": "confirmed",
                    "confirmed_at": now,
                    "updated_at": now
                }
            },
            return_document=True
        )
        
        logger.info(f"Scheduled ride confirmed: {ride_id}")
        return _format_ride(updated_ride)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error confirming scheduled ride: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to confirm scheduled ride"
        )


# Helper Functions
def _format_ride(ride: dict) -> ScheduledRideResponse:
    """Format ride document for response"""
    return ScheduledRideResponse(
        id=str(ride.get("_id", "")),
        passenger_id=str(ride.get("passenger_id", "")),
        pickup_location=Location(**ride.get("pickup_location", {})),
        dropoff_location=Location(**ride.get("dropoff_location", {})),
        scheduled_time=ride.get("scheduled_time"),
        trip_type=ride.get("trip_type", "ride"),
        estimated_fare=ride.get("estimated_fare"),
        preferred_payment=ride.get("preferred_payment", "wallet"),
        driver_gender_preference=ride.get("driver_gender_preference", "any"),
        driver_filter=ride.get("driver_filter"),
        status=ride.get("status", "scheduled"),
        notes=ride.get("notes"),
        is_recurring=ride.get("is_recurring", False),
        recurring_pattern=ride.get("recurring_pattern"),
        recurring_end_date=ride.get("recurring_end_date"),
        recurring_days=ride.get("recurring_days"),
        recurring_template_id=ride.get("recurring_template_id"),
        recurring_rule=ride.get("recurring_rule"),
        ride_id=ride.get("ride_id"),
        confirmation_code=ride.get("confirmation_code"),
        dispatch_status=ride.get("dispatch_status"),
        reminder_due_at=ride.get("reminder_due_at"),
        reminder_sent=bool(ride.get("reminder_sent", False)),
        reminder_sent_at=ride.get("reminder_sent_at"),
        dispatch_due_at=ride.get("dispatch_due_at"),
        dispatch_started=bool(ride.get("dispatch_started", False)),
        dispatch_started_at=ride.get("dispatch_started_at"),
        driver_assignment_due_at=ride.get("driver_assignment_due_at"),
        driver_assignment_started=bool(ride.get("driver_assignment_started", False)),
        driver_assignment_started_at=ride.get("driver_assignment_started_at"),
        driver_confirmed=bool(ride.get("driver_confirmed", False)),
        driver_confirmed_at=ride.get("driver_confirmed_at"),
        payment_hold_status=ride.get("payment_hold_status", "not_started"),
        payment_hold_amount=ride.get("payment_hold_amount"),
        cancellation_fee=float(ride.get("cancellation_fee") or 0.0),
        cancelled_at=ride.get("cancelled_at"),
        cancel_reason=ride.get("cancel_reason"),
        created_at=ride.get("created_at"),
        updated_at=ride.get("updated_at")
    )


def _format_template(template: dict) -> RecurringScheduledRideTemplateResponse:
    return RecurringScheduledRideTemplateResponse(
        id=str(template.get("_id", "")),
        passenger_id=str(template.get("passenger_id", "")),
        pickup_location=Location(**template.get("pickup_location", {})),
        dropoff_location=Location(**template.get("dropoff_location", {})),
        trip_type=template.get("trip_type", "ride"),
        preferred_payment=template.get("preferred_payment", "wallet"),
        driver_gender_preference=template.get("driver_gender_preference", "any"),
        driver_filter=template.get("driver_filter"),
        recurring_pattern=template.get("recurring_pattern", "weekly"),
        recurring_days=template.get("recurring_days"),
        recurring_end_date=template.get("recurring_end_date"),
        next_scheduled_time=template.get("next_scheduled_time"),
        active=bool(template.get("active", True)),
        created_at=template.get("created_at"),
        updated_at=template.get("updated_at"),
    )


def _advance_recurring_time(current: datetime, scheduled_ride: dict) -> datetime:
    pattern = scheduled_ride.get("recurring_pattern")
    if pattern == "daily":
        return current + timedelta(days=1)
    if pattern == "weekly":
        days = sorted(int(day) for day in (scheduled_ride.get("recurring_days") or [current.weekday()]))
        next_time = current + timedelta(days=1)
        while next_time.weekday() not in days:
            next_time += timedelta(days=1)
        return next_time
    if pattern == "monthly":
        next_month = current.month + 1
        next_year = current.year
        if next_month > 12:
            next_month = 1
            next_year += 1
        last_day = calendar.monthrange(next_year, next_month)[1]
        return current.replace(year=next_year, month=next_month, day=min(current.day, last_day))
    return current + timedelta(weeks=1)


async def _schedule_recurring_rides(scheduled_ride: dict, db: AsyncIOMotorDatabase):
    """Schedule recurring rides based on pattern"""
    pattern = scheduled_ride.get("recurring_pattern")
    end_date = scheduled_ride.get("recurring_end_date")
    original_time = scheduled_ride.get("scheduled_time")
    
    if not pattern or not end_date:
        return
    
    end_date = _as_utc(end_date)
    current = _as_utc(original_time)
    driver_gender_preference = _normalize_driver_gender_preference(
        scheduled_ride.get("driver_gender_preference")
    )
    driver_filter = _driver_filter_for_preference(driver_gender_preference)
    recurring_rides = []
    
    while current <= end_date:
        current = _advance_recurring_time(current, scheduled_ride)
        
        if current <= end_date:
            now = datetime.now(timezone.utc)
            recurring_ride_id = ObjectId()
            recurring_ride = {
                "_id": recurring_ride_id,
                "passenger_id": scheduled_ride["passenger_id"],
                "pickup_location": scheduled_ride["pickup_location"],
                "dropoff_location": scheduled_ride["dropoff_location"],
                "scheduled_time": current,
                "trip_type": scheduled_ride["trip_type"],
                "estimated_fare": scheduled_ride["estimated_fare"],
                "preferred_payment": scheduled_ride["preferred_payment"],
                "driver_gender_preference": driver_gender_preference,
                "driver_filter": driver_filter,
                "confirmation_code": f"SR-{str(recurring_ride_id)[-6:].upper()}",
                "notes": scheduled_ride["notes"],
                "is_recurring": True,
                "recurring_pattern": pattern,
                "recurring_end_date": end_date,
                "recurring_days": scheduled_ride.get("recurring_days"),
                "recurring_template_id": scheduled_ride.get("recurring_template_id"),
                "recurring_rule": scheduled_ride.get("recurring_rule"),
                "parent_id": scheduled_ride["_id"] if isinstance(scheduled_ride.get("_id"), ObjectId) else ObjectId(scheduled_ride["_id"]),
                "ride_id": None,
                **_scheduled_lifecycle_fields(current, now),
            }
            recurring_rides.append(recurring_ride)
    
    if recurring_rides:
        await db.scheduled_rides.insert_many(recurring_rides)
        logger.info(f"Created {len(recurring_rides)} recurring rides")


async def process_scheduled_rides(db: AsyncIOMotorDatabase):
    """Advance scheduled ride lifecycle and create live rides near pickup time"""
    try:
        now = datetime.now(timezone.utc)
        
        actionable_rides = await db.scheduled_rides.find({
            "status": {"$in": ACTIVE_SCHEDULED_STATUSES},
            "scheduled_time": {
                "$gte": now - timedelta(minutes=15),
                "$lte": now + timedelta(minutes=REMINDER_BEFORE_MINUTES)
            }
        }).to_list(None)
        
        for ride in actionable_rides:
            scheduled_time = _as_utc(ride["scheduled_time"])
            minutes_until = (scheduled_time - now).total_seconds() / 60
            update_data: Dict[str, Any] = {}

            if minutes_until <= REMINDER_BEFORE_MINUTES and not ride.get("reminder_sent"):
                update_data.update({
                    "reminder_sent": True,
                    "reminder_sent_at": now,
                })

            if minutes_until <= DISPATCH_BEFORE_MINUTES and not ride.get("dispatch_started"):
                update_data.update({
                    "status": "dispatching",
                    "dispatch_status": "searching",
                    "dispatch_started": True,
                    "dispatch_started_at": now,
                    "payment_hold_status": "ready",
                    "payment_hold_amount": ride.get("estimated_fare"),
                })

            if minutes_until <= ASSIGNMENT_BEFORE_MINUTES and not ride.get("driver_assignment_started"):
                update_data.update({
                    "driver_assignment_started": True,
                    "driver_assignment_started_at": now,
                    "dispatch_status": "assignment_due",
                })

            if minutes_until <= LIVE_RIDE_CREATION_BEFORE_MINUTES and not ride.get("ride_id"):
                actual_ride = {
                    "passenger_id": ride["passenger_id"],
                    "driver_id": ride.get("driver_id"),
                    "pickup_location": ride["pickup_location"],
                    "dropoff_location": ride["dropoff_location"],
                    "drop_location": ride["dropoff_location"],
                    "status": "waiting_for_driver",
                    "dispatch_status": "searching",
                    "scheduled_for": scheduled_time,
                    "scheduled_ride_id": ride["_id"],
                    "trip_type": ride.get("trip_type", "ride"),
                    "estimated_fare": ride.get("estimated_fare"),
                    "preferred_payment": ride.get("preferred_payment", "wallet"),
                    "driver_gender_preference": ride.get("driver_gender_preference", "any"),
                    "driver_filter": ride.get("driver_filter"),
                    "booking_source": "scheduled_ride",
                    "created_at": now,
                    "updated_at": now,
                }

                result = await db.rides.insert_one(actual_ride)
                update_data.update({
                    "ride_id": str(result.inserted_id),
                    "status": "in_progress",
                    "dispatch_status": "live_ride_created",
                    "updated_at": now,
                })
                logger.info(f"Created ride {result.inserted_id} from scheduled ride {ride['_id']}")

            if update_data:
                update_data["updated_at"] = now
                await db.scheduled_rides.update_one(
                    {"_id": ride["_id"]},
                    {
                        "$set": update_data
                    }
                )
    
    except Exception as e:
        logger.error(f"Error processing scheduled rides: {str(e)}")
