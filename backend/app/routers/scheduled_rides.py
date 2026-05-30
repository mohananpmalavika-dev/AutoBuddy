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

from app.db.deps import get_db
from app.utils.rbac import require_roles

router = APIRouter(prefix="/api/scheduled-rides", tags=["scheduled_rides"])
logger = logging.getLogger(__name__)


def _current_user_id(current_user: dict) -> str:
    return str(current_user.get("id", "")).strip()


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
    status: Optional[Literal["pending", "confirmed", "cancelled"]] = None


class ScheduledRideResponse(BaseModel):
    id: str
    passenger_id: str
    pickup_location: Location
    dropoff_location: Location
    scheduled_time: datetime
    trip_type: str
    estimated_fare: Optional[float]
    preferred_payment: str
    status: str
    notes: Optional[str]
    is_recurring: bool
    recurring_pattern: Optional[str]
    recurring_end_date: Optional[datetime]
    recurring_days: Optional[List[int]] = None
    recurring_template_id: Optional[str] = None
    recurring_rule: Optional[Dict[str, Any]] = None
    ride_id: Optional[str]  # Actual ride created from schedule
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
        # Validate scheduled time is in future
        now = datetime.now(timezone.utc)
        if ride.scheduled_time <= now:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Scheduled time must be in the future"
            )
        
        recurring_pattern = ride.recurring_pattern
        recurring_end_date = ride.recurring_end_date
        recurring_days = ride.recurring_days
        recurring_template_id = None
        if ride.is_recurring:
            recurring_pattern = recurring_pattern or "weekly"
            recurring_end_date = recurring_end_date or (ride.scheduled_time + timedelta(weeks=12))
            if recurring_pattern == "weekly":
                recurring_days = recurring_days or [ride.scheduled_time.weekday()]
            if recurring_end_date <= ride.scheduled_time:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="recurring_end_date must be after scheduled_time"
                )
        
        passenger_id = _current_user_id(current_passenger)
        recurring_rule = None
        if ride.is_recurring:
            recurring_template_id = str(ObjectId())
            recurring_rule = {
                "pattern": recurring_pattern,
                "days": recurring_days or [],
                "starts_at": ride.scheduled_time,
                "ends_at": recurring_end_date,
                "timezone": "UTC",
            }
            await db.recurring_scheduled_ride_templates.insert_one({
                "_id": ObjectId(recurring_template_id),
                "passenger_id": passenger_id,
                "pickup_location": ride.pickup_location.model_dump(),
                "dropoff_location": ride.dropoff_location.model_dump(),
                "trip_type": ride.trip_type,
                "estimated_fare": ride.estimated_fare,
                "preferred_payment": ride.preferred_payment,
                "notes": ride.notes,
                "recurring_pattern": recurring_pattern,
                "recurring_days": recurring_days,
                "recurring_end_date": recurring_end_date,
                "next_scheduled_time": ride.scheduled_time,
                "active": True,
                "created_at": now,
                "updated_at": now,
            })

        # Create scheduled ride document
        scheduled_ride = {
            "passenger_id": passenger_id,
            "pickup_location": ride.pickup_location.model_dump(),
            "dropoff_location": ride.dropoff_location.model_dump(),
            "scheduled_time": ride.scheduled_time,
            "trip_type": ride.trip_type,
            "estimated_fare": ride.estimated_fare,
            "preferred_payment": ride.preferred_payment,
            "status": "pending",
            "notes": ride.notes,
            "is_recurring": ride.is_recurring,
            "recurring_pattern": recurring_pattern,
            "recurring_end_date": recurring_end_date,
            "recurring_days": recurring_days,
            "recurring_template_id": recurring_template_id,
            "recurring_rule": recurring_rule,
            "ride_id": None,
            "created_at": now,
            "updated_at": now
        }
        
        result = await db.scheduled_rides.insert_one(scheduled_ride)
        scheduled_ride["_id"] = result.inserted_id
        
        # Schedule recurring rides if needed
        if ride.is_recurring:
            await _schedule_recurring_rides(scheduled_ride, db)
        
        logger.info(f"Scheduled ride created: {result.inserted_id} for passenger {current_passenger['id']}")
        
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
            "status": {"$in": ["pending", "confirmed"]},
            "scheduled_time": {"$gte": now},
        },
        {"$set": {"status": "cancelled", "updated_at": now}},
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
        ride = await db.scheduled_rides.find_one({
            "_id": ObjectId(ride_id),
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
        # Verify ownership
        ride = await db.scheduled_rides.find_one({
            "_id": ObjectId(ride_id),
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
        update_data = {}
        if update.pickup_location:
            update_data["pickup_location"] = update.pickup_location.model_dump()
        if update.dropoff_location:
            update_data["dropoff_location"] = update.dropoff_location.model_dump()
        if update.scheduled_time:
            update_data["scheduled_time"] = update.scheduled_time
        if update.notes is not None:
            update_data["notes"] = update.notes
        if update.status:
            update_data["status"] = update.status
        
        update_data["updated_at"] = datetime.now(timezone.utc)
        
        updated_ride = await db.scheduled_rides.find_one_and_update(
            {"_id": ObjectId(ride_id)},
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
        result = await db.scheduled_rides.delete_one({
            "_id": ObjectId(ride_id),
            "passenger_id": _current_user_id(current_passenger)
        })
        
        if result.deleted_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Scheduled ride not found"
            )
        
        logger.info(f"Scheduled ride deleted: {ride_id}")
    
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
        ride = await db.scheduled_rides.find_one({
            "_id": ObjectId(ride_id),
            "passenger_id": _current_user_id(current_passenger)
        })
        
        if not ride:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Scheduled ride not found"
            )
        
        if ride["status"] != "pending":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot confirm ride with status: {ride['status']}"
            )
        
        updated_ride = await db.scheduled_rides.find_one_and_update(
            {"_id": ObjectId(ride_id)},
            {
                "$set": {
                    "status": "confirmed",
                    "updated_at": datetime.now(timezone.utc)
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
        status=ride.get("status", "pending"),
        notes=ride.get("notes"),
        is_recurring=ride.get("is_recurring", False),
        recurring_pattern=ride.get("recurring_pattern"),
        recurring_end_date=ride.get("recurring_end_date"),
        recurring_days=ride.get("recurring_days"),
        recurring_template_id=ride.get("recurring_template_id"),
        recurring_rule=ride.get("recurring_rule"),
        ride_id=ride.get("ride_id"),
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
    
    current = original_time
    recurring_rides = []
    
    while current <= end_date:
        current = _advance_recurring_time(current, scheduled_ride)
        
        if current <= end_date:
            recurring_ride = {
                "passenger_id": scheduled_ride["passenger_id"],
                "pickup_location": scheduled_ride["pickup_location"],
                "dropoff_location": scheduled_ride["dropoff_location"],
                "scheduled_time": current,
                "trip_type": scheduled_ride["trip_type"],
                "estimated_fare": scheduled_ride["estimated_fare"],
                "preferred_payment": scheduled_ride["preferred_payment"],
                "status": "pending",
                "notes": scheduled_ride["notes"],
                "is_recurring": True,
                "recurring_pattern": pattern,
                "recurring_end_date": end_date,
                "recurring_days": scheduled_ride.get("recurring_days"),
                "recurring_template_id": scheduled_ride.get("recurring_template_id"),
                "recurring_rule": scheduled_ride.get("recurring_rule"),
                "parent_id": scheduled_ride["_id"] if isinstance(scheduled_ride.get("_id"), ObjectId) else ObjectId(scheduled_ride["_id"]),
                "ride_id": None,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc)
            }
            recurring_rides.append(recurring_ride)
    
    if recurring_rides:
        await db.scheduled_rides.insert_many(recurring_rides)
        logger.info(f"Created {len(recurring_rides)} recurring rides")


async def process_scheduled_rides(db: AsyncIOMotorDatabase):
    """Process due scheduled rides and create actual rides"""
    try:
        now = datetime.now(timezone.utc)
        
        # Find rides scheduled for next 5 minutes
        due_rides = await db.scheduled_rides.find({
            "status": "confirmed",
            "scheduled_time": {
                "$gte": now,
                "$lte": now + timedelta(minutes=5)
            }
        }).to_list(None)
        
        for ride in due_rides:
            # Create actual ride from scheduled ride
            actual_ride = {
                "passenger_id": ride["passenger_id"],
                "driver_id": None,
                "pickup_location": ride["pickup_location"],
                "dropoff_location": ride["dropoff_location"],
                "status": "waiting_for_driver",
                "scheduled_ride_id": ride["_id"],
                "created_at": now,
                "updated_at": now
            }
            
            result = await db.rides.insert_one(actual_ride)
            
            # Update scheduled ride with actual ride ID
            await db.scheduled_rides.update_one(
                {"_id": ride["_id"]},
                {
                    "$set": {
                        "ride_id": str(result.inserted_id),
                        "status": "in_progress"
                    }
                }
            )
            
            logger.info(f"Created ride {result.inserted_id} from scheduled ride {ride['_id']}")
    
    except Exception as e:
        logger.error(f"Error processing scheduled rides: {str(e)}")
