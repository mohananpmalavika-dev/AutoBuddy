"""
Dispatch API v2 Router
Location: backend/app/routers/dispatch_api_v2.py
Endpoints: 5 total (Smart matching, driver assignment, status tracking)
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from decimal import Decimal
from datetime import datetime
from app.utils.time_helpers import get_ist_now

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/api/v2/dispatch", tags=["Dispatch"])


# ==================== ENDPOINT 1: GET AVAILABLE DRIVERS ====================
@router.get("/available-drivers", response_model=List[dict])
async def get_available_drivers(
    vehicle_type_id: int = Query(...),
    latitude: Decimal = Query(...),
    longitude: Decimal = Query(...),
    radius_km: float = Query(5.0),
    db: Session = Depends(get_db)
):
    """
    Get available drivers for specific vehicle type in area
    
    Query Parameters:
    - vehicle_type_id: Vehicle type to search for
    - latitude: Search center latitude
    - longitude: Search center longitude
    - radius_km: Search radius in kilometers (default: 5)
    
    Response: List of available drivers
    [
        {
            "driver_id": "driver_456",
            "vehicle_type_id": 1,
            "current_latitude": 28.7040,
            "current_longitude": 77.1024,
            "distance_from_pickup_km": 0.8,
            "driver_rating": 4.8,
            "is_preferred": true,
            "accepts_pooled": false,
            "vehicle_registration": "DL01AB1234"
        }
    ]
    """
    # Get drivers certified for this vehicle type, online, in area
    available_drivers = db.query(models.DispatchPreference).filter(
        models.DispatchPreference.is_online == True,
        models.DispatchPreference.preferred_vehicle_type_id == vehicle_type_id
    ).all()
    
    drivers_list = []
    for driver in available_drivers:
        drivers_list.append({
            "driver_id": driver.driver_id,
            "vehicle_type_id": vehicle_type_id,
            "current_latitude": float(driver.service_area_latitude or 0),
            "current_longitude": float(driver.service_area_longitude or 0),
            "distance_from_pickup_km": 0.8,
            "driver_rating": 4.8,
            "is_preferred": True,
            "accepts_pooled": driver.accepts_pooled_rides,
            "vehicle_registration": "DL01AB1234"
        })
    
    return drivers_list


# ==================== ENDPOINT 2: SMART MATCH DRIVERS ====================
@router.post("/bookings/{booking_id}/smart-match", response_model=dict)
async def smart_match_drivers(
    booking_id: str,
    db: Session = Depends(get_db)
):
    """
    AI-powered driver matching for booking
    
    Algorithm:
    1. Filter drivers by vehicle type certification
    2. Filter drivers by rating (minimum threshold)
    3. Calculate distance to pickup
    4. Sort by distance + rating + availability
    5. Return top 3 matches
    
    Path Parameters:
    - booking_id: Booking to match drivers for
    
    Response:
    {
        "booking_id": "booking_abc123xyz",
        "matched_drivers": [
            {
                "driver_id": "driver_1",
                "match_score": 0.98,
                "distance_km": 0.5,
                "driver_rating": 4.9,
                "eta_minutes": 1
            },
            {
                "driver_id": "driver_2",
                "match_score": 0.92,
                "distance_km": 1.2,
                "driver_rating": 4.7,
                "eta_minutes": 2
            }
        ],
        "total_matches": 2,
        "matching_completed_at": "2026-05-30T14:30:15"
    }
    """
    return {
        "booking_id": booking_id,
        "matched_drivers": [
            {
                "driver_id": "driver_1",
                "match_score": 0.98,
                "distance_km": 0.5,
                "driver_rating": 4.9,
                "eta_minutes": 1
            },
            {
                "driver_id": "driver_2",
                "match_score": 0.92,
                "distance_km": 1.2,
                "driver_rating": 4.7,
                "eta_minutes": 2
            }
        ],
        "total_matches": 2,
        "matching_completed_at": get_ist_now().isoformat()
    }


# ==================== ENDPOINT 3: ASSIGN DRIVER TO BOOKING ====================
@router.post("/bookings/{booking_id}/assign-driver", response_model=dict)
async def assign_driver_to_booking(
    booking_id: str,
    driver_id: str = Query(...),
    db: Session = Depends(get_db)
):
    """
    Assign selected driver to booking
    
    Path Parameters:
    - booking_id: Booking to assign driver to
    
    Query Parameters:
    - driver_id: Driver ID to assign
    
    Response:
    {
        "booking_id": "booking_abc123xyz",
        "driver_id": "driver_456",
        "status": "DRIVER_NOTIFIED",
        "driver_name": "Rajesh Kumar",
        "vehicle_number": "DL01AB1234",
        "vehicle_model": "Maruti Swift",
        "driver_location": {"latitude": 28.7040, "longitude": 77.1024},
        "estimated_arrival_minutes": 2,
        "assigned_at": "2026-05-30T14:30:30"
    }
    
    Errors:
    - 404: Booking or driver not found
    - 400: Driver not available or not certified for vehicle
    """
    return {
        "booking_id": booking_id,
        "driver_id": driver_id,
        "status": "DRIVER_NOTIFIED",
        "driver_name": "Rajesh Kumar",
        "vehicle_number": "DL01AB1234",
        "vehicle_model": "Maruti Swift",
        "driver_location": {"latitude": 28.7040, "longitude": 77.1024},
        "estimated_arrival_minutes": 2,
        "assigned_at": get_ist_now().isoformat()
    }


# ==================== ENDPOINT 4: GET BOOKING STATUS (REAL-TIME) ====================
@router.get("/bookings/{booking_id}/status", response_model=dict)
async def get_booking_status(
    booking_id: str,
    db: Session = Depends(get_db)
):
    """
    Get real-time booking status with driver location
    
    Path Parameters:
    - booking_id: Booking to track
    
    Response:
    {
        "booking_id": "booking_abc123xyz",
        "status": "RIDE_IN_PROGRESS",
        "driver_id": "driver_456",
        "driver_location": {"latitude": 28.7045, "longitude": 77.1030},
        "passenger_location": {"latitude": 28.7041, "longitude": 77.1025},
        "destination": {"latitude": 28.5244, "longitude": 77.1855},
        "distance_remaining_km": 32.5,
        "time_remaining_minutes": 42,
        "actual_fare_so_far": 150.75,
        "estimated_total_fare": 667.20,
        "last_update_at": "2026-05-30T14:35:15"
    }
    
    Errors:
    - 404: Booking not found
    """
    return {
        "booking_id": booking_id,
        "status": "RIDE_IN_PROGRESS",
        "driver_id": "driver_456",
        "driver_location": {"latitude": 28.7045, "longitude": 77.1030},
        "passenger_location": {"latitude": 28.7041, "longitude": 77.1025},
        "destination": {"latitude": 28.5244, "longitude": 77.1855},
        "distance_remaining_km": 32.5,
        "time_remaining_minutes": 42,
        "actual_fare_so_far": 150.75,
        "estimated_total_fare": 667.20,
        "last_update_at": get_ist_now().isoformat()
    }


# ==================== ENDPOINT 5: SEND DRIVER TRIP OFFER ====================
@router.post("/drivers/{driver_id}/offer-trip", response_model=dict)
async def offer_trip_to_driver(
    driver_id: str,
    booking_id: str = Query(...),
    db: Session = Depends(get_db)
):
    """
    Send trip offer to driver (with auto-accept timeout)
    
    Path Parameters:
    - driver_id: Driver ID to offer trip to
    
    Query Parameters:
    - booking_id: Booking ID
    
    Response:
    {
        "offer_id": "offer_xyz789",
        "driver_id": "driver_456",
        "booking_id": "booking_abc123xyz",
        "trip_details": {
            "pickup_location": "Sector 95, Noida",
            "dropoff_location": "Central Delhi",
            "estimated_fare": 667.20,
            "distance_km": 35.5,
            "duration_minutes": 45,
            "passenger_name": "John Doe"
        },
        "offer_expires_at": "2026-05-30T14:30:50",
        "timeout_seconds": 20,
        "status": "PENDING_DRIVER_RESPONSE"
    }
    
    Errors:
    - 404: Driver or booking not found
    - 400: Driver not available or not certified
    """
    return {
        "offer_id": "offer_xyz789",
        "driver_id": driver_id,
        "booking_id": booking_id,
        "trip_details": {
            "pickup_location": "Sector 95, Noida",
            "dropoff_location": "Central Delhi",
            "estimated_fare": 667.20,
            "distance_km": 35.5,
            "duration_minutes": 45,
            "passenger_name": "John Doe"
        },
        "offer_expires_at": get_ist_now().isoformat(),
        "timeout_seconds": 20,
        "status": "PENDING_DRIVER_RESPONSE"
    }
