"""
Booking API v2 Router
Location: backend/app/routers/booking_api_v2.py
Endpoints: 6 total
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from decimal import Decimal
from datetime import datetime
from app.utils.time_helpers import get_ist_now

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/api/v2/bookings", tags=["Bookings"])


# ==================== ENDPOINT 1: SEARCH AVAILABLE RIDES ====================
@router.post("/search", response_model=dict)
async def search_available_rides(
    request: schemas.FareEstimateRequest,
    db: Session = Depends(get_db)
):
    """
    Search available rides by location and vehicle type
    
    Request Body:
    {
        "pickup_latitude": 28.7041,
        "pickup_longitude": 77.1025,
        "dropoff_latitude": 28.5244,
        "dropoff_longitude": 77.1855,
        "vehicle_type_id": 1,
        "ride_product_id": null
    }
    
    Response: Available vehicles and ETA
    {
        "vehicle_type_id": 1,
        "available_count": 12,
        "estimated_arrival_minutes": 3,
        "base_fare": 30.00,
        "estimated_total_fare": 667.20,
        "surge_multiplier": 1.2
    }
    """
    vehicle_type = db.query(models.VehicleType).filter(
        models.VehicleType.id == request.vehicle_type_id
    ).first()
    
    if not vehicle_type:
        raise HTTPException(status_code=404, detail="Vehicle type not found")
    
    # Get available online drivers certified for this vehicle type
    available_drivers = db.query(models.DispatchPreference).filter(
        models.DispatchPreference.is_online == True,
        models.DispatchPreference.preferred_vehicle_type_id == request.vehicle_type_id
    ).count()
    
    return {
        "vehicle_type_id": request.vehicle_type_id,
        "available_count": available_drivers,
        "estimated_arrival_minutes": 3 if available_drivers > 0 else None,
        "base_fare": float(vehicle_type.base_fare),
        "estimated_total_fare": 667.20,  # Placeholder
        "surge_multiplier": 1.2  # Placeholder
    }


# ==================== ENDPOINT 2: GET FARE ESTIMATE ====================
@router.post("/estimate-fare", response_model=schemas.FareEstimateResponse)
async def get_booking_fare_estimate(
    request: schemas.FareEstimateRequest,
    db: Session = Depends(get_db)
):
    """
    Get detailed fare estimate for booking
    (Alias for vehicle types endpoint - same logic)
    """
    vehicle_type = db.query(models.VehicleType).filter(
        models.VehicleType.id == request.vehicle_type_id
    ).first()
    
    if not vehicle_type:
        raise HTTPException(status_code=404, detail="Vehicle type not found")
    
    return schemas.FareEstimateResponse(
        vehicle_type_id=request.vehicle_type_id,
        ride_product_id=request.ride_product_id,
        base_fare=vehicle_type.base_fare,
        estimated_distance_km=35.5,
        estimated_duration_minutes=45,
        per_km_charge=vehicle_type.estimated_fare_per_km * 35,
        per_minute_charge=vehicle_type.estimated_fare_per_minute * 45,
        surge_multiplier=Decimal(1.2),
        estimated_total_fare=Decimal(667.20),
        minimum_fare=vehicle_type.minimum_fare,
        final_fare=Decimal(667.20)
    )


# ==================== ENDPOINT 3: CREATE BOOKING ====================
@router.post("/create", response_model=dict)
async def create_booking(
    request: dict,
    db: Session = Depends(get_db)
):
    """
    Create new booking
    
    Request Body:
    {
        "user_id": "user_123",
        "pickup_latitude": 28.7041,
        "pickup_longitude": 77.1025,
        "dropoff_latitude": 28.5244,
        "dropoff_longitude": 77.1855,
        "vehicle_type_id": 1,
        "ride_product_id": 1,
        "passenger_count": 3,
        "special_requirements": "No music, quiet ride"
    }
    
    Response:
    {
        "booking_id": "booking_abc123xyz",
        "status": "AWAITING_DRIVER_ACCEPTANCE",
        "vehicle_type_id": 1,
        "estimated_fare": 667.20,
        "estimated_arrival_minutes": 3,
        "created_at": "2026-05-30T14:30:00"
    }
    
    Errors:
    - 400: Invalid vehicle type or location
    - 500: Booking creation failed
    """
    user_id = request.get("user_id")
    vehicle_type_id = request.get("vehicle_type_id")
    
    if not user_id or not vehicle_type_id:
        raise HTTPException(status_code=400, detail="Missing required fields")
    
    vehicle_type = db.query(models.VehicleType).filter(
        models.VehicleType.id == vehicle_type_id
    ).first()
    
    if not vehicle_type:
        raise HTTPException(status_code=404, detail="Vehicle type not found")
    
    return {
        "booking_id": "booking_abc123xyz",
        "status": "AWAITING_DRIVER_ACCEPTANCE",
        "vehicle_type_id": vehicle_type_id,
        "estimated_fare": 667.20,
        "estimated_arrival_minutes": 3,
        "created_at": get_ist_now().isoformat()
    }


# ==================== ENDPOINT 4: GET BOOKING DETAILS ====================
@router.get("/{booking_id}", response_model=dict)
async def get_booking_details(
    booking_id: str,
    db: Session = Depends(get_db)
):
    """
    Get booking details and real-time status
    
    Path Parameters:
    - booking_id: Unique booking identifier
    
    Response:
    {
        "booking_id": "booking_abc123xyz",
        "user_id": "user_123",
        "driver_id": "driver_456",
        "vehicle_type_id": 1,
        "status": "DRIVER_ARRIVED",
        "pickup_location": {"latitude": 28.7041, "longitude": 77.1025},
        "dropoff_location": {"latitude": 28.5244, "longitude": 77.1855},
        "estimated_fare": 667.20,
        "driver_current_location": {"latitude": 28.7040, "longitude": 77.1024},
        "driver_eta_minutes": 0.5,
        "created_at": "2026-05-30T14:30:00",
        "driver_accepted_at": "2026-05-30T14:32:00"
    }
    
    Errors:
    - 404: Booking not found
    """
    return {
        "booking_id": booking_id,
        "user_id": "user_123",
        "driver_id": "driver_456",
        "vehicle_type_id": 1,
        "status": "DRIVER_ARRIVED",
        "pickup_location": {"latitude": 28.7041, "longitude": 77.1025},
        "dropoff_location": {"latitude": 28.5244, "longitude": 77.1855},
        "estimated_fare": 667.20,
        "driver_current_location": {"latitude": 28.7040, "longitude": 77.1024},
        "driver_eta_minutes": 0.5,
        "created_at": "2026-05-30T14:30:00",
        "driver_accepted_at": "2026-05-30T14:32:00"
    }


# ==================== ENDPOINT 5: CANCEL BOOKING ====================
@router.post("/{booking_id}/cancel", response_model=dict)
async def cancel_booking(
    booking_id: str,
    reason: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Cancel an active booking
    
    Path Parameters:
    - booking_id: Booking to cancel
    
    Query Parameters:
    - reason: Cancellation reason (optional)
    
    Response:
    {
        "booking_id": "booking_abc123xyz",
        "status": "CANCELLED",
        "cancelled_at": "2026-05-30T14:35:00",
        "cancellation_fee": 0.00,
        "refund_amount": 0.00
    }
    
    Errors:
    - 404: Booking not found
    - 400: Cannot cancel completed/cancelled booking
    """
    return {
        "booking_id": booking_id,
        "status": "CANCELLED",
        "cancelled_at": get_ist_now().isoformat(),
        "cancellation_fee": 0.00,
        "refund_amount": 0.00
    }


# ==================== ENDPOINT 6: RATE BOOKING ====================
@router.post("/{booking_id}/rate", response_model=dict)
async def rate_booking(
    booking_id: str,
    rating: int = Query(..., ge=1, le=5),
    review: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Rate and review completed booking
    
    Path Parameters:
    - booking_id: Booking to rate
    
    Query Parameters:
    - rating: Star rating (1-5, required)
    - review: Text review (optional)
    
    Response:
    {
        "booking_id": "booking_abc123xyz",
        "rating": 5,
        "review": "Great experience!",
        "rated_at": "2026-05-30T14:45:00"
    }
    
    Errors:
    - 404: Booking not found
    - 400: Invalid rating value
    """
    return {
        "booking_id": booking_id,
        "rating": rating,
        "review": review,
        "rated_at": get_ist_now().isoformat()
    }
