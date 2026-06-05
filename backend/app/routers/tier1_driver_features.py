"""
TIER 1 Driver Features - API Endpoints
Implements GPS tracking, SOS alerts, and expense tracking
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Request, status
from pydantic import BaseModel, Field, validator
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_, func
import uuid
import asyncio
import os
import httpx

# Import models
from app.db.tier1_models import (
    DriverGPSLocation, SOSAlert, DriverExpense, DriverLocationStats,
    ExpenseType, SOSStatus, get_ist_now
)
from app.db.database import get_db

# Import dependencies
from app.routers.auth import verify_token

EMERGENCY_WEBHOOK_URL = os.environ.get("EMERGENCY_WEBHOOK_URL", "").strip()


async def get_driver_id_from_token(user_data: dict = Depends(verify_token)) -> str:
    driver_id = str(user_data.get("driver_id") or user_data.get("id") or "").strip()
    if not driver_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Driver authentication required")
    return driver_id

# ============================================================================
# Pydantic Models (Request/Response)
# ============================================================================

class LocationUpdateRequest(BaseModel):
    """GPS location update from driver"""
    latitude: float = Field(..., ge=-90, le=90, description="Latitude coordinate")
    longitude: float = Field(..., ge=-180, le=180, description="Longitude coordinate")
    accuracy: Optional[float] = Field(None, ge=0, description="GPS accuracy in meters")
    speed: Optional[float] = Field(None, ge=0, description="Speed in km/h")
    altitude: Optional[float] = Field(None, description="Altitude in meters")
    address: Optional[str] = None
    ride_id: Optional[str] = None

    @validator('latitude', 'longitude')
    def validate_coordinates(cls, v):
        if v is None:
            raise ValueError("Coordinates cannot be None")
        return round(v, 6)  # 6 decimals ≈ 11cm precision

    class Config:
        json_schema_extra = {
            "example": {
                "latitude": 12.9716,
                "longitude": 77.5946,
                "accuracy": 10.5,
                "speed": 45.2,
                "address": "Brigade Road, Bangalore"
            }
        }


class LocationResponse(BaseModel):
    """GPS location response"""
    id: str
    driver_id: str
    latitude: float
    longitude: float
    accuracy: Optional[float]
    speed: Optional[float]
    address: Optional[str]
    created_at: str

    class Config:
        from_attributes = True


class SOSAlertRequest(BaseModel):
    """SOS alert request from driver"""
    reason: str = Field(..., description="Reason for SOS: emergency, accident, medical, harassment, other")
    description: Optional[str] = None
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    address: Optional[str] = None
    ride_id: Optional[str] = None
    contact_phone: Optional[str] = None
    contact_name: Optional[str] = None

    @validator('reason')
    def validate_reason(cls, v):
        valid_reasons = ["emergency", "accident", "medical", "harassment", "other"]
        if v not in valid_reasons:
            raise ValueError(f"Invalid reason. Must be one of: {', '.join(valid_reasons)}")
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "reason": "accident",
                "description": "Hit a pothole, possible injuries",
                "latitude": 12.9716,
                "longitude": 77.5946,
                "address": "MG Road, Bangalore",
                "contact_phone": "+91-9876543210"
            }
        }


class SOSAlertResponse(BaseModel):
    """SOS alert response"""
    id: str
    driver_id: str
    reason: str
    status: str
    latitude: float
    longitude: float
    address: Optional[str]
    authorities_notified: bool
    admin_notified: bool
    created_at: str

    class Config:
        from_attributes = True


class ExpenseRequest(BaseModel):
    """Expense tracking request"""
    expense_type: str = Field(..., description="Type: toll, parking, fuel, maintenance, other")
    amount: float = Field(..., gt=0, description="Expense amount")
    description: Optional[str] = None
    receipt_url: Optional[str] = None
    ride_id: str = Field(..., description="Associated ride ID")

    @validator('expense_type')
    def validate_type(cls, v):
        valid_types = ["toll", "parking", "fuel", "maintenance", "other"]
        if v not in valid_types:
            raise ValueError(f"Invalid type. Must be one of: {', '.join(valid_types)}")
        return v

    class Config:
        json_schema_extra = {
            "example": {
                "expense_type": "toll",
                "amount": 150.00,
                "description": "Toll on Highway",
                "receipt_url": "https://...",
                "ride_id": "ride_123"
            }
        }


class ExpenseResponse(BaseModel):
    """Expense response"""
    id: str
    ride_id: str
    driver_id: str
    expense_type: str
    amount: float
    description: Optional[str]
    receipt_url: Optional[str]
    created_at: str

    class Config:
        from_attributes = True


# ============================================================================
# Router Setup
# ============================================================================

router = APIRouter(prefix="/api/drivers", tags=["drivers-tier1"])

# Track last SOS time for cooldown enforcement
SOS_COOLDOWN_SECONDS = 5
last_sos_time = {}  # {driver_id: datetime}


def _mongo_db(request: Request):
    return getattr(getattr(request, "app", None), "state", None) and getattr(request.app.state, "db", None)


def _socket_server(request: Request):
    return getattr(getattr(request, "app", None), "state", None) and getattr(request.app.state, "sio", None)


def _ride_room(booking_id: str) -> str:
    return f"ride:{str(booking_id or '').strip()}"


def _user_room(user_id: str) -> str:
    return f"user:{str(user_id or '').strip()}"


def _location_payload(driver_id: str, location: DriverGPSLocation) -> Dict[str, Any]:
    created_at = location.created_at.isoformat() if location.created_at else get_ist_now().isoformat()
    return {
        "booking_id": location.ride_id,
        "ride_id": location.ride_id,
        "driver_id": driver_id,
        "location": {
            "latitude": location.latitude,
            "longitude": location.longitude,
            "accuracy": location.accuracy,
            "speed": location.speed,
            "altitude": location.altitude,
            "address": location.address,
            "updated_at": created_at,
        },
        "latitude": location.latitude,
        "longitude": location.longitude,
        "accuracy": location.accuracy,
        "speed": location.speed,
        "timestamp": created_at,
    }


async def _active_booking(mongo_db, driver_id: str, ride_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
    if mongo_db is None:
        return None
    if ride_id:
        booking = await mongo_db.bookings.find_one({"id": str(ride_id)}, {"_id": 0})
        if booking:
            return booking
    return await mongo_db.bookings.find_one(
        {
            "driver_id": driver_id,
            "status": {"$in": ["accepted", "driver_arrived", "in_progress", "BookingStatus.ACCEPTED", "BookingStatus.DRIVER_ARRIVED", "BookingStatus.IN_PROGRESS"]},
        },
        {"_id": 0},
        sort=[("updated_at", -1), ("created_at", -1)],
    )


async def _broadcast_driver_location(request: Request, driver_id: str, location: DriverGPSLocation) -> None:
    mongo_db = _mongo_db(request)
    sio = _socket_server(request)
    payload = _location_payload(driver_id, location)
    booking = await _active_booking(mongo_db, driver_id, location.ride_id)
    booking_id = str((booking or {}).get("id") or location.ride_id or "").strip()
    if booking_id:
        payload["booking_id"] = booking_id
        payload["ride_id"] = booking_id

    if mongo_db is not None:
        location_doc = payload["location"]
        geo_location = {
            "type": "Point",
            "coordinates": [float(location.longitude), float(location.latitude)],
        }
        await mongo_db.drivers.update_one(
            {"user_id": driver_id},
            {
                "$set": {
                    "current_location": location_doc,
                    "current_location_geo": geo_location,
                    "last_location_at": get_ist_now(),
                    "is_online": True,
                }
            },
            upsert=True,
        )
        if booking_id:
            await mongo_db.bookings.update_one(
                {"id": booking_id, "driver_id": driver_id},
                {
                    "$set": {
                        "driver_live_location": location_doc,
                        "driver_location": location_doc,
                        "updated_at": get_ist_now(),
                    }
                },
            )

    if sio is None or not booking_id:
        return

    await sio.emit("driver_location_changed", payload, room=_ride_room(booking_id))
    await sio.emit("driver_location", payload, room=_ride_room(booking_id))
    await sio.emit("driver_location_changed", payload, room=f"booking:{booking_id}")
    await sio.emit("driver_location", payload, room=f"booking:{booking_id}")
    passenger_id = str((booking or {}).get("passenger_id") or "").strip()
    if passenger_id:
        await sio.emit("driver_location_changed", payload, room=_user_room(passenger_id))
        await sio.emit("driver_location", payload, room=_user_room(passenger_id))


async def _notify_sos(request: Request, sos: SOSAlert, *, cancelled: bool = False) -> bool:
    mongo_db = _mongo_db(request)
    sio = _socket_server(request)
    event_name = "sos_alert_cancelled" if cancelled else "sos_alert"
    title = "SOS alert cancelled" if cancelled else "Driver SOS alert"
    body = "A driver cancelled an SOS alert." if cancelled else "A driver triggered an SOS alert."
    payload = {
        "alert_id": sos.id,
        "driver_id": sos.driver_id,
        "booking_id": sos.ride_id,
        "reason": sos.reason,
        "status": sos.status,
        "latitude": sos.latitude,
        "longitude": sos.longitude,
        "address": sos.address,
        "timestamp": get_ist_now().isoformat(),
    }
    external_notified = False
    if EMERGENCY_WEBHOOK_URL and not cancelled:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                response = await client.post(EMERGENCY_WEBHOOK_URL, json=payload)
                external_notified = response.status_code < 400
        except Exception:
            external_notified = False

    booking = await _active_booking(mongo_db, sos.driver_id, sos.ride_id)
    recipient_ids: set[str] = set()
    if mongo_db is not None:
        admin_users = await mongo_db.users.find({"role": {"$in": ["admin", "ADMIN"]}}, {"_id": 0, "id": 1}).to_list(50)
        recipient_ids.update(str(user.get("id") or "").strip() for user in admin_users)
        passenger_id = str((booking or {}).get("passenger_id") or "").strip()
        if passenger_id:
            recipient_ids.add(passenger_id)

        notification_docs = [
            {
                "id": str(uuid.uuid4()),
                "user_id": recipient_id,
                "type": event_name,
                "title": title,
                "body": body,
                "data": payload,
                "read": False,
                "created_at": get_ist_now(),
            }
            for recipient_id in recipient_ids
            if recipient_id
        ]
        if notification_docs:
            await mongo_db.notifications.insert_many(notification_docs)

    if sio is None:
        return external_notified
    booking_id = str(sos.ride_id or "").strip()
    if booking_id:
        await sio.emit(event_name, payload, room=_ride_room(booking_id))
        await sio.emit(event_name, payload, room=f"booking:{booking_id}")
    for recipient_id in recipient_ids:
        if recipient_id:
            await sio.emit(event_name, payload, room=_user_room(recipient_id))
            await sio.emit("in_app_notification", {"title": title, "body": body, "data": payload}, room=_user_room(recipient_id))
    return external_notified


def _expense_total(db: Session, ride_id: str, driver_id: str) -> float:
    total = db.query(func.coalesce(func.sum(DriverExpense.amount), 0.0)).filter(
        DriverExpense.ride_id == ride_id,
        DriverExpense.driver_id == driver_id,
    ).scalar()
    return float(total or 0.0)


async def _sync_ride_expense_totals(request: Request, db: Session, ride_id: str, driver_id: str) -> None:
    mongo_db = _mongo_db(request)
    sio = _socket_server(request)
    if mongo_db is None:
        return

    total_expenses = _expense_total(db, ride_id, driver_id)
    booking = await mongo_db.bookings.find_one({"id": ride_id, "driver_id": driver_id}, {"_id": 0})
    fare = float((booking or {}).get("final_fare") or (booking or {}).get("estimated_fare") or 0.0)
    driver_net_earnings = max(0.0, fare - total_expenses) if fare else None
    update = {
        "driver_expenses_total": total_expenses,
        "total_expenses": total_expenses,
        "updated_at": get_ist_now(),
    }
    if driver_net_earnings is not None:
        update["driver_net_earnings"] = driver_net_earnings
    await mongo_db.bookings.update_one({"id": ride_id, "driver_id": driver_id}, {"$set": update})

    if sio is not None:
        payload = {
            "booking_id": ride_id,
            "ride_id": ride_id,
            "driver_id": driver_id,
            "total_expenses": total_expenses,
            "driver_net_earnings": driver_net_earnings,
            "timestamp": get_ist_now().isoformat(),
        }
        await sio.emit("driver_expenses_updated", payload, room=_ride_room(ride_id))
        await sio.emit("driver_expenses_updated", payload, room=f"booking:{ride_id}")


# ============================================================================
# GPS Location Endpoints
# ============================================================================

@router.post("/location", response_model=LocationResponse, status_code=status.HTTP_201_CREATED)
async def post_driver_location(
    request: Request,
    location: LocationUpdateRequest,
    db: Session = Depends(get_db),
    driver_id: str = Depends(get_driver_id_from_token)
):
    """
    Store real-time GPS location for driver
    
    Called every 10 seconds during active rides or when online.
    Updates are stored and broadcast via WebSocket to passengers.
    
    Returns:
        Created location record with timestamp
    """
    try:
        location_id = str(uuid.uuid4())
        
        # Create GPS location record
        db_location = DriverGPSLocation(
            id=location_id,
            driver_id=driver_id,
            ride_id=location.ride_id,
            latitude=location.latitude,
            longitude=location.longitude,
            accuracy=location.accuracy,
            speed=location.speed,
            altitude=location.altitude,
            address=location.address,
            created_at=get_ist_now()
        )
        
        db.add(db_location)
        db.commit()
        db.refresh(db_location)
        
        await _broadcast_driver_location(request, driver_id, db_location)
        
        return LocationResponse(**db_location.to_dict())
    
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error storing location: {str(e)}"
        )


@router.get("/location", response_model=LocationResponse)
async def get_driver_location(
    db: Session = Depends(get_db),
    driver_id: str = Depends(get_driver_id_from_token)
):
    """
    Get current driver GPS location
    
    Returns the most recent location update for the driver.
    
    Returns:
        Latest location record or 404 if no location found
    """
    location = db.query(DriverGPSLocation)\
        .filter(DriverGPSLocation.driver_id == driver_id)\
        .order_by(desc(DriverGPSLocation.created_at))\
        .first()
    
    if not location:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No location found for driver"
        )
    
    return LocationResponse(**location.to_dict())


@router.get("/location/history")
async def get_location_history(
    ride_id: Optional[str] = Query(None, description="Optional ride ID filter"),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
    driver_id: str = Depends(get_driver_id_from_token)
):
    """
    Get location history for a driver
    
    Args:
        ride_id: Optional filter by specific ride
        limit: Maximum number of records (1-500, default 100)
    
    Returns:
        List of location records ordered by most recent
    """
    query = db.query(DriverGPSLocation)\
        .filter(DriverGPSLocation.driver_id == driver_id)
    
    if ride_id:
        query = query.filter(DriverGPSLocation.ride_id == ride_id)
    
    locations = query\
        .order_by(desc(DriverGPSLocation.created_at))\
        .limit(limit)\
        .all()
    
    return {
        "count": len(locations),
        "locations": [LocationResponse(**loc.to_dict()) for loc in locations]
    }


# ============================================================================
# SOS Alert Endpoints
# ============================================================================

@router.post("/sos", response_model=SOSAlertResponse, status_code=status.HTTP_201_CREATED)
async def post_sos_alert(
    request: Request,
    alert: SOSAlertRequest,
    db: Session = Depends(get_db),
    driver_id: str = Depends(get_driver_id_from_token)
):
    """
    Trigger SOS emergency alert
    
    Creates emergency alert and notifies authorities.
    Includes 5-second cooldown to prevent accidental multi-alerts.
    
    Args:
        alert: SOS alert details
    
    Returns:
        Created SOS alert record
    """
    # Check cooldown
    if driver_id in last_sos_time:
        last_time = last_sos_time[driver_id]
        time_diff = (get_ist_now() - last_time).total_seconds()
        if time_diff < SOS_COOLDOWN_SECONDS:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"SOS alert in cooldown. Please wait {SOS_COOLDOWN_SECONDS - int(time_diff)} seconds"
            )
    
    try:
        sos_id = str(uuid.uuid4())
        
        # Create SOS alert record
        db_sos = SOSAlert(
            id=sos_id,
            driver_id=driver_id,
            ride_id=alert.ride_id,
            reason=alert.reason,
            description=alert.description,
            latitude=alert.latitude,
            longitude=alert.longitude,
            address=alert.address,
            status=SOSStatus.ACTIVE.value,
            contact_phone=alert.contact_phone,
            contact_name=alert.contact_name,
            created_at=get_ist_now(),
            authorities_notified=False,
            admin_notified=True
        )
        
        db.add(db_sos)
        db.commit()
        db.refresh(db_sos)
        
        # Update cooldown
        last_sos_time[driver_id] = get_ist_now()
        
        authorities_notified = await _notify_sos(request, db_sos)
        if authorities_notified:
            db_sos.authorities_notified = True
            db_sos.updated_at = get_ist_now()
            db.commit()
            db.refresh(db_sos)
        
        return SOSAlertResponse(**db_sos.to_dict())
    
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error creating SOS alert: {str(e)}"
        )


@router.post("/sos/{sos_id}/cancel", response_model=dict)
async def cancel_sos_alert(
    sos_id: str,
    request: Request,
    db: Session = Depends(get_db),
    driver_id: str = Depends(get_driver_id_from_token)
):
    """
    Cancel active SOS alert
    
    Allows driver to cancel false alarms within 2 minutes of creation.
    
    Args:
        sos_id: SOS alert ID to cancel
    
    Returns:
        Cancellation confirmation
    """
    sos = db.query(SOSAlert)\
        .filter(
            and_(
                SOSAlert.id == sos_id,
                SOSAlert.driver_id == driver_id,
                SOSAlert.status == SOSStatus.ACTIVE.value
            )
        )\
        .first()
    
    if not sos:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active SOS alert not found"
        )
    
    # Check if cancellation is still allowed (within 2 minutes)
    time_diff = (get_ist_now() - sos.created_at).total_seconds()
    if time_diff > 120:  # 2 minutes
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot cancel SOS alert after 2 minutes"
        )
    
    try:
        sos.status = SOSStatus.CANCELLED.value
        sos.cancelled_at = get_ist_now()
        db.commit()
        await _notify_sos(request, sos, cancelled=True)
        
        return {
            "status": "cancelled",
            "sos_id": sos_id,
            "cancelled_at": sos.cancelled_at.isoformat(),
            "message": "SOS alert cancelled successfully"
        }
    
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error cancelling SOS alert: {str(e)}"
        )


@router.get("/sos", response_model=List[SOSAlertResponse])
async def get_sos_alerts(
    status_filter: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    driver_id: str = Depends(get_driver_id_from_token)
):
    """
    Get SOS alert history for driver
    
    Args:
        status_filter: Optional status filter (active, resolved, cancelled)
        limit: Maximum records to return
    
    Returns:
        List of SOS alerts
    """
    query = db.query(SOSAlert)\
        .filter(SOSAlert.driver_id == driver_id)
    
    if status_filter:
        query = query.filter(SOSAlert.status == status_filter)
    
    alerts = query\
        .order_by(desc(SOSAlert.created_at))\
        .limit(limit)\
        .all()
    
    return [SOSAlertResponse(**alert.to_dict()) for alert in alerts]


# ============================================================================
# Expense Tracking Endpoints
# ============================================================================

@router.post("/rides/{ride_id}/expenses", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
async def add_expense(
    ride_id: str,
    request: Request,
    expense: ExpenseRequest,
    db: Session = Depends(get_db),
    driver_id: str = Depends(get_driver_id_from_token)
):
    """
    Add expense record for a ride
    
    Tracks tolls, parking, fuel, and other trip-related expenses.
    
    Args:
        ride_id: Ride ID to associate expense with
        expense: Expense details
    
    Returns:
        Created expense record
    """
    try:
        expense_id = str(uuid.uuid4())
        
        # Validate ride belongs to driver (if needed)
        # ride = db.query(Booking).filter(Booking.id == ride_id).first()
        # if not ride or ride.driver_id != driver_id:
        #     raise HTTPException(status_code=404, detail="Ride not found")
        
        db_expense = DriverExpense(
            id=expense_id,
            ride_id=ride_id,
            driver_id=driver_id,
            expense_type=expense.expense_type,
            amount=expense.amount,
            description=expense.description,
            receipt_url=expense.receipt_url,
            created_at=get_ist_now()
        )
        
        db.add(db_expense)
        db.commit()
        db.refresh(db_expense)
        await _sync_ride_expense_totals(request, db, ride_id, driver_id)
        
        return ExpenseResponse(**db_expense.to_dict())
    
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error adding expense: {str(e)}"
        )


@router.get("/rides/{ride_id}/expenses", response_model=List[ExpenseResponse])
async def get_ride_expenses(
    ride_id: str,
    db: Session = Depends(get_db),
    driver_id: str = Depends(get_driver_id_from_token)
):
    """
    Get all expenses for a ride
    
    Args:
        ride_id: Ride ID to fetch expenses for
    
    Returns:
        List of expense records
    """
    expenses = db.query(DriverExpense)\
        .filter(
            and_(
                DriverExpense.ride_id == ride_id,
                DriverExpense.driver_id == driver_id
            )
        )\
        .order_by(DriverExpense.created_at)\
        .all()
    
    return [ExpenseResponse(**exp.to_dict()) for exp in expenses]


@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(
    expense_id: str,
    request: Request,
    db: Session = Depends(get_db),
    driver_id: str = Depends(get_driver_id_from_token)
):
    """
    Delete expense record
    
    Only allows deletion of expenses created within last 5 minutes.
    
    Args:
        expense_id: Expense ID to delete
    """
    expense = db.query(DriverExpense)\
        .filter(
            and_(
                DriverExpense.id == expense_id,
                DriverExpense.driver_id == driver_id
            )
        )\
        .first()
    
    if not expense:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expense not found"
        )
    
    # Check if deletion is allowed (within 5 minutes)
    time_diff = (get_ist_now() - expense.created_at).total_seconds()
    if time_diff > 300:  # 5 minutes
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete expense after 5 minutes. Contact support for manual adjustment."
        )
    
    ride_id = expense.ride_id
    try:
        db.delete(expense)
        db.commit()
        await _sync_ride_expense_totals(request, db, ride_id, driver_id)
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting expense: {str(e)}"
        )


@router.patch("/expenses/{expense_id}", response_model=ExpenseResponse)
async def update_expense(
    expense_id: str,
    request: Request,
    expense_update: ExpenseRequest,
    db: Session = Depends(get_db),
    driver_id: str = Depends(get_driver_id_from_token)
):
    """
    Update expense record
    
    Allows editing of amount, description, and receipt URL.
    Only for expenses created within last 5 minutes.
    
    Args:
        expense_id: Expense ID to update
        expense_update: Updated expense details
    
    Returns:
        Updated expense record
    """
    expense = db.query(DriverExpense)\
        .filter(
            and_(
                DriverExpense.id == expense_id,
                DriverExpense.driver_id == driver_id
            )
        )\
        .first()
    
    if not expense:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Expense not found"
        )
    
    # Check if edit is allowed (within 5 minutes)
    time_diff = (get_ist_now() - expense.created_at).total_seconds()
    if time_diff > 300:  # 5 minutes
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot edit expense after 5 minutes"
        )
    
    try:
        expense.amount = expense_update.amount
        expense.description = expense_update.description
        expense.receipt_url = expense_update.receipt_url
        expense.updated_at = get_ist_now()
        
        db.commit()
        db.refresh(expense)
        await _sync_ride_expense_totals(request, db, expense.ride_id, driver_id)
        
        return ExpenseResponse(**expense.to_dict())
    
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error updating expense: {str(e)}"
        )


@router.get("/expenses/summary/{ride_id}", response_model=dict)
async def get_expense_summary(
    ride_id: str,
    db: Session = Depends(get_db),
    driver_id: str = Depends(get_driver_id_from_token)
):
    """
    Get expense summary for a ride
    
    Returns total expenses grouped by type.
    
    Args:
        ride_id: Ride ID
    
    Returns:
        Summary with total and breakdown by type
    """
    expenses = db.query(DriverExpense)\
        .filter(
            and_(
                DriverExpense.ride_id == ride_id,
                DriverExpense.driver_id == driver_id
            )
        )\
        .all()
    
    summary = {
        "ride_id": ride_id,
        "total_expenses": 0.0,
        "by_type": {
            "toll": 0.0,
            "parking": 0.0,
            "fuel": 0.0,
            "maintenance": 0.0,
            "other": 0.0
        },
        "expense_count": len(expenses)
    }
    
    for expense in expenses:
        summary["total_expenses"] += expense.amount
        summary["by_type"][expense.expense_type] += expense.amount
    
    return summary
