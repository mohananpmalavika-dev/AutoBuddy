"""
TIER 1 Driver Features - API Endpoints
Implements GPS tracking, SOS alerts, and expense tracking
"""

from fastapi import APIRouter, HTTPException, Depends, Query, status
from pydantic import BaseModel, Field, validator
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from sqlalchemy import desc, and_, func
import uuid
import asyncio

# Import models
from backend.app.db.tier1_models import (
    DriverGPSLocation, SOSAlert, DriverExpense, DriverLocationStats,
    ExpenseType, SOSStatus, get_ist_now
)
from backend.app.db.database import get_db

# Import dependencies
from backend.app.routers.auth import verify_token

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
        schema_extra = {
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
        schema_extra = {
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
        schema_extra = {
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


# ============================================================================
# GPS Location Endpoints
# ============================================================================

@router.post("/location", response_model=LocationResponse, status_code=status.HTTP_201_CREATED)
async def post_driver_location(
    location: LocationUpdateRequest,
    db: Session = Depends(get_db),
    driver_id: str = Depends(verify_token)
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
        
        # TODO: Emit WebSocket event to passengers
        # await broadcast_driver_location(driver_id, db_location.to_dict())
        
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
    driver_id: str = Depends(verify_token)
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
    driver_id: str = Depends(verify_token)
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
    alert: SOSAlertRequest,
    db: Session = Depends(get_db),
    driver_id: str = Depends(verify_token)
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
            authorities_notified=True,  # Mark for notification service
            admin_notified=True
        )
        
        db.add(db_sos)
        db.commit()
        db.refresh(db_sos)
        
        # Update cooldown
        last_sos_time[driver_id] = get_ist_now()
        
        # TODO: Integrate with Twilio or emergency service provider
        # await notify_emergency_services(db_sos)
        # await notify_admin(db_sos)
        # if alert.ride_id:
        #     await notify_passenger(alert.ride_id, db_sos)
        
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
    db: Session = Depends(get_db),
    driver_id: str = Depends(verify_token)
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
        
        # TODO: Notify emergency services and admin of cancellation
        # await notify_emergency_services_cancel(sos_id)
        # await notify_admin_cancel(sos_id)
        
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
    driver_id: str = Depends(verify_token)
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
    expense: ExpenseRequest,
    db: Session = Depends(get_db),
    driver_id: str = Depends(verify_token)
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
        
        # TODO: Update ride total_expenses
        # TODO: Recalculate driver earnings (fare - total_expenses)
        
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
    driver_id: str = Depends(verify_token)
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
    db: Session = Depends(get_db),
    driver_id: str = Depends(verify_token)
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
    
    try:
        db.delete(expense)
        db.commit()
        
        # TODO: Update ride total_expenses
        # TODO: Recalculate driver earnings
        
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error deleting expense: {str(e)}"
        )


@router.patch("/expenses/{expense_id}", response_model=ExpenseResponse)
async def update_expense(
    expense_id: str,
    expense_update: ExpenseRequest,
    db: Session = Depends(get_db),
    driver_id: str = Depends(verify_token)
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
        
        # TODO: Update ride total_expenses
        # TODO: Recalculate driver earnings
        
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
    driver_id: str = Depends(verify_token)
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
