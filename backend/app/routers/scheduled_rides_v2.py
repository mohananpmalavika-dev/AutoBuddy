"""
Scheduled Rides Management
Advance booking system with calendar integration
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel, Field
from decimal import Decimal

from app.database import get_db

router = APIRouter(prefix="/api/v2/scheduled-rides", tags=["Scheduled Rides"])

class ScheduledRideRequest(BaseModel):
    passenger_id: str
    pickup_latitude: float
    pickup_longitude: float
    dropoff_latitude: float
    dropoff_longitude: float
    scheduled_time: str = Field(..., description="ISO format datetime")
    vehicle_type_id: int
    notes: Optional[str] = None
    recurring: bool = False
    recurrence_pattern: Optional[str] = None  # DAILY, WEEKLY, MONTHLY

class ScheduledRideResponse(BaseModel):
    ride_id: str
    status: str
    scheduled_time: str
    estimated_fare: Decimal
    confirmation_token: str
    reminder_sent: bool

class ScheduledRideDetails(BaseModel):
    ride_id: str
    passenger_id: str
    scheduled_time: str
    pickup: dict
    dropoff: dict
    vehicle_type: str
    estimated_fare: Decimal
    status: str
    driver_assigned: Optional[str] = None
    confirmation_number: str

@router.post("/book")
async def book_scheduled_ride(
    request: ScheduledRideRequest,
    db: Session = Depends(get_db)
) -> ScheduledRideResponse:
    """
    Book a ride in advance
    Returns confirmation with ride ID
    """
    
    scheduled_time = datetime.fromisoformat(request.scheduled_time)
    now = datetime.now()
    
    # Validate booking time (must be at least 30 minutes in advance)
    min_advance_time = now + timedelta(minutes=30)
    if scheduled_time < min_advance_time:
        raise HTTPException(status_code=400, detail="Must schedule at least 30 minutes in advance")
    
    # Calculate fare (would use actual pricing engine in production)
    estimated_fare = Decimal("200.00")
    
    ride_id = f"SCH_{int(scheduled_time.timestamp())}"
    confirmation_token = f"CONF_{ride_id}"
    
    return ScheduledRideResponse(
        ride_id=ride_id,
        status="CONFIRMED",
        scheduled_time=scheduled_time.isoformat(),
        estimated_fare=estimated_fare,
        confirmation_token=confirmation_token,
        reminder_sent=False
    )

@router.get("/my-rides/{passenger_id}")
async def get_passenger_scheduled_rides(
    passenger_id: str,
    limit: int = Query(10, ge=1, le=50),
    offset: int = Query(0, ge=0)
):
    """Get all scheduled rides for a passenger"""
    
    # Mock scheduled rides
    rides = [
        {
            "ride_id": "SCH_1717129200",
            "scheduled_time": (datetime.now() + timedelta(days=1)).isoformat(),
            "status": "CONFIRMED",
            "pickup_location": "Home",
            "dropoff_location": "Office",
            "estimated_fare": 200.00
        },
        {
            "ride_id": "SCH_1717215600",
            "scheduled_time": (datetime.now() + timedelta(days=2)).isoformat(),
            "status": "CONFIRMED",
            "pickup_location": "Office",
            "dropoff_location": "Airport",
            "estimated_fare": 450.00
        },
        {
            "ride_id": "SCH_1717302000",
            "scheduled_time": (datetime.now() + timedelta(days=7)).isoformat(),
            "status": "SCHEDULED",
            "pickup_location": "Home",
            "dropoff_location": "Gym",
            "estimated_fare": 150.00
        }
    ]
    
    return {
        "passenger_id": passenger_id,
        "total_rides": len(rides),
        "rides": rides[offset:offset + limit]
    }

@router.get("/details/{ride_id}")
async def get_scheduled_ride_details(ride_id: str):
    """Get detailed information about a scheduled ride"""
    
    return {
        "ride_id": ride_id,
        "passenger_id": "PASS_1234",
        "scheduled_time": (datetime.now() + timedelta(days=1)).isoformat(),
        "pickup": {
            "location": "123 Main Street",
            "latitude": 28.7041,
            "longitude": 77.1025,
            "instructions": "Use the south gate"
        },
        "dropoff": {
            "location": "456 Business Plaza",
            "latitude": 28.5244,
            "longitude": 77.1855,
            "instructions": "Main entrance"
        },
        "vehicle_type": "Auto",
        "estimated_fare": 200.00,
        "status": "CONFIRMED",
        "confirmation_number": "ABC123XYZ",
        "driver_assigned": None,
        "driver_assignment_time": "1 hour before pickup"
    }

@router.post("/modify/{ride_id}")
async def modify_scheduled_ride(
    ride_id: str,
    new_time: Optional[str] = Query(None),
    new_vehicle_type: Optional[int] = Query(None)
):
    """Modify scheduled ride details"""
    
    return {
        "ride_id": ride_id,
        "status": "UPDATED",
        "message": "Ride updated successfully",
        "changes": {
            "time_changed": new_time is not None,
            "vehicle_type_changed": new_vehicle_type is not None
        }
    }

@router.post("/cancel/{ride_id}")
async def cancel_scheduled_ride(ride_id: str):
    """Cancel a scheduled ride"""
    
    return {
        "ride_id": ride_id,
        "status": "CANCELLED",
        "message": "Ride cancelled successfully",
        "refund": 0,
        "cancellation_fee": 0
    }

@router.post("/reminder/{ride_id}")
async def send_ride_reminder(
    ride_id: str,
    reminder_minutes_before: int = Query(30)
):
    """Send reminder for a scheduled ride"""
    
    return {
        "ride_id": ride_id,
        "reminder_sent": True,
        "message": f"Reminder will be sent {reminder_minutes_before} minutes before pickup"
    }

@router.post("/set-recurring")
async def set_recurring_ride(
    passenger_id: str,
    route_name: str = Query(...),
    pickup_lat: float = Query(...),
    pickup_lon: float = Query(...),
    dropoff_lat: float = Query(...),
    dropoff_lon: float = Query(...),
    days: List[str] = Query(..., description="MONDAY, TUESDAY, etc."),
    time: str = Query(..., description="HH:MM format"),
    vehicle_type_id: int = Query(1)
):
    """Set up a recurring ride schedule (e.g., daily commute)"""
    
    return {
        "recurring_ride_id": f"REC_{passenger_id}_{int(datetime.now().timestamp())}",
        "passenger_id": passenger_id,
        "route_name": route_name,
        "schedule": {
            "days": days,
            "time": time,
            "active": True
        },
        "status": "ACTIVE",
        "message": f"Recurring ride scheduled for {', '.join(days)} at {time}",
        "next_ride": (datetime.now() + timedelta(days=1)).isoformat()
    }

@router.get("/calendar")
async def get_ride_calendar(
    passenger_id: str,
    month: int = Query(None),
    year: int = Query(None)
):
    """Get calendar view of all scheduled rides"""
    
    if month is None:
        month = datetime.now().month
    if year is None:
        year = datetime.now().year
    
    # Mock calendar data
    calendar_events = {
        "1": [{"ride_id": "SCH_1", "time": "08:00", "type": "commute"}],
        "2": [{"ride_id": "SCH_2", "time": "18:30", "type": "return"}],
        "5": [{"ride_id": "SCH_3", "time": "10:00", "type": "appointment"}],
        "7": [{"ride_id": "SCH_4", "time": "14:00", "type": "airport"}],
    }
    
    return {
        "passenger_id": passenger_id,
        "month": month,
        "year": year,
        "events": calendar_events,
        "total_rides": sum(len(v) for v in calendar_events.values())
    }
