"""
Fare Estimation and Booking Management for Total Mobility Platform
Handles fare calculation with vehicle multipliers and ride type configurations
Uses CANONICAL VEHICLE MODEL as single source of truth
Integrated with comprehensive fare_calculation_service
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
from math import radians, cos, sin, asin, sqrt
from app.db.database import get_db
from app.models.canonical_vehicle_model import (
    get_vehicle_by_id,
    get_vehicle_multiplier as canonical_get_multiplier,
    get_vehicle_capacity,
    supports_ride_type
)
from app.models.enhanced_booking_models import (
    EnhancedBookingRequest,
    BookingFareEstimateRequest,
    BookingFareEstimateResponse,
    GoodsDetails,
    AirportDetails,
    RentalDetails,
    TourismDetails,
    FareBreakdown
)
from app.services.fare_calculation_service import (
    calculate_complete_fare,
    haversine_distance as service_haversine,
    estimate_time_minutes
)
from app.models.ride_type_compatibility import (
    RIDE_TYPE_COMPATIBILITY,
    get_compatible_vehicles,
    is_vehicle_compatible_with_ride_type
)
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/bookings", tags=["bookings"])

# Models - Using enhanced booking models
class LegacyFareEstimateRequest(BaseModel):
    """Legacy request format for backwards compatibility"""
    pickup_latitude: float
    pickup_longitude: float
    dropoff_latitude: float
    dropoff_longitude: float
    vehicle_type_id: str
    vehicle_subtype_id: Optional[str] = None
    ride_type: str
    passenger_count: int = 1
    goods_weight_kg: Optional[float] = None
    is_scheduled: bool = False
    discount_percentage: float = 0

class LegacyCreateBookingRequest(BaseModel):
    """Legacy request format for backwards compatibility"""
    pickup_latitude: float
    pickup_longitude: float
    pickup_address: str
    dropoff_latitude: float
    dropoff_longitude: float
    dropoff_address: str
    vehicle_type_id: str
    vehicle_subtype_id: Optional[str] = None
    ride_type: str
    scheduled_pickup_time: Optional[str] = None
    passenger_count: int = 1
    goods_weight_kg: Optional[float] = None
    promo_code: Optional[str] = None


# Utility function for backwards compatibility
def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points on earth (in km)
    Deprecated: Use fare_calculation_service.haversine_distance instead
    """
    return service_haversine(lat1, lon1, lat2, lon2)

@router.post("/estimate-fare")
async def estimate_fare(
    request: BookingFareEstimateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Comprehensive fare estimation using fare_calculation_service
    
    Calculation flow:
    1. Validate vehicle type and ride type compatibility
    2. Calculate distance using haversine
    3. Estimate time based on distance and ride type
    4. Get base fare configuration from database
    5. Calculate base fare (distance or weight based)
    6. Apply vehicle multiplier
    7. Apply ride-type multiplier
    8. Calculate surge pricing (if provided)
    9. Apply promo discount
    10. Calculate taxes
    11. Return complete FareBreakdown
    """
    try:
        # Validate vehicle type using CANONICAL vehicles collection
        vehicle = await db.vehicles.find_one({"vehicle_type_id": request.vehicle_type_id})
        if not vehicle:
            raise HTTPException(status_code=400, detail=f"Invalid vehicle type: {request.vehicle_type_id}")
        
        # Validate ride type compatibility
        if not is_vehicle_compatible_with_ride_type(request.vehicle_type_id, request.ride_type):
            raise HTTPException(
                status_code=400,
                detail=f"Vehicle {request.vehicle_type_id} does not support {request.ride_type} rides"
            )
        
        # Get current demand levels (default values if not provided)
        current_rides = request.current_rides or 0
        available_drivers = request.available_drivers or 10
        is_peak = request.is_peak_hours or False
        
        # Call comprehensive fare calculation service
        fare_result = calculate_complete_fare(
            vehicle_type_id=request.vehicle_type_id,
            ride_type=request.ride_type,
            pickup_lat=request.pickup_latitude,
            pickup_lon=request.pickup_longitude,
            dropoff_lat=request.dropoff_latitude,
            dropoff_lon=request.dropoff_longitude,
            vehicle_subtype_id=request.vehicle_subtype_id,
            goods_weight_kg=request.goods_weight_kg,
            rental_hours=request.rental_hours,
            is_peak_hours=is_peak,
            current_rides=current_rides,
            available_drivers=available_drivers,
            promo_discount=request.promo_discount or 0.0,
            tax_percentage=5.0  # 5% tax
        )
        
        # Log fare calculation
        logger.info(f"Fare estimate: {request.vehicle_type_id} {request.ride_type} - ₹{fare_result['total_fare']:.2f}")
        
        return {
            "status": "success",
            "data": {
                "estimated_fare": fare_result['total_fare'],
                "distance_km": fare_result['distance_km'],
                "estimated_time_minutes": fare_result['estimated_time_minutes'],
                "vehicle_multiplier": fare_result['vehicle_multiplier'],
                "ride_type_multiplier": fare_result['ride_type_multiplier'],
                "surge_multiplier": fare_result.get('surge_multiplier', 1.0),
                "fare_breakdown": fare_result['fare_breakdown'],
                "valid_until": fare_result['valid_until']
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Fare estimation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Fare calculation failed: {str(e)}")

@router.post("/create")
async def create_booking(
    request: EnhancedBookingRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    # current_user = Depends(get_current_user)  # Uncomment when auth is ready
):
    """
    Create a new booking with complete vehicle and ride type information
    
    Supports:
    - Instant: Standard distance-based rides
    - Scheduled: Pre-booked rides with discount
    - Rental: Hourly vehicle rental with minimum hours
    - Airport: Premium airport transfers with flight details
    - Corporate: Business rides with premium pricing
    - Tourism: Extended tours with hourly rates
    - Goods: Weight-based cargo delivery
    """
    try:
        # Validate vehicle type
        vehicle = await db.vehicles.find_one({"vehicle_type_id": request.vehicle_type_id})
        if not vehicle:
            raise HTTPException(status_code=400, detail=f"Invalid vehicle type: {request.vehicle_type_id}")
        
        # Validate ride type compatibility
        if not is_vehicle_compatible_with_ride_type(request.vehicle_type_id, request.ride_type):
            raise HTTPException(
                status_code=400,
                detail=f"Vehicle {request.vehicle_type_id} does not support {request.ride_type} rides"
            )
        
        # Calculate comprehensive fare
        fare_result = calculate_complete_fare(
            vehicle_type_id=request.vehicle_type_id,
            ride_type=request.ride_type,
            pickup_lat=request.pickup_latitude,
            pickup_lon=request.pickup_longitude,
            dropoff_lat=request.dropoff_latitude,
            dropoff_lon=request.dropoff_longitude,
            vehicle_subtype_id=request.vehicle_subtype_id,
            goods_weight_kg=request.goods_details.goods_weight_kg if request.goods_details else None,
            rental_hours=request.rental_details.rental_hours if request.rental_details else None,
            is_peak_hours=False,
            current_rides=0,
            available_drivers=10,
            promo_discount=0.0,
            tax_percentage=5.0
        )
        
        # Create booking document
        booking_id = f"booking_{uuid.uuid4().hex[:12]}"
        
        booking = {
            "_id": booking_id,
            "passenger_id": "TEMP_PASSENGER",  # TODO: Get from current_user
            "status": "pending",
            
            # Vehicle information
            "vehicle_type_id": request.vehicle_type_id,
            "vehicle_subtype_id": request.vehicle_subtype_id,
            "vehicle_name": vehicle.get("name", request.vehicle_type_id),
            
            # Ride type and details
            "ride_type": request.ride_type,
            "scheduled_datetime": request.scheduled_datetime,
            "passenger_count": request.passenger_count,
            
            # Location
            "pickup_latitude": request.pickup_latitude,
            "pickup_longitude": request.pickup_longitude,
            "pickup_location": request.pickup_location,
            "dropoff_latitude": request.dropoff_latitude,
            "dropoff_longitude": request.dropoff_longitude,
            "dropoff_location": request.dropoff_location,
            
            # Ride-specific details (conditionally included)
            "goods_details": request.goods_details.dict() if request.goods_details else None,
            "airport_details": request.airport_details.dict() if request.airport_details else None,
            "rental_details": request.rental_details.dict() if request.rental_details else None,
            "tourism_details": request.tourism_details.dict() if request.tourism_details else None,
            
            # Accessibility and preferences
            "wheelchair_accessible": request.wheelchair_accessible,
            "ac_required": request.ac_required,
            "notes": request.notes,
            
            # Fare information
            "distance_km": fare_result['distance_km'],
            "estimated_time_minutes": fare_result['estimated_time_minutes'],
            "base_estimated_fare": fare_result['base_fare'],
            "vehicle_type_multiplier": fare_result['vehicle_multiplier'],
            "ride_type_multiplier": fare_result['ride_type_multiplier'],
            "surge_multiplier": fare_result.get('surge_multiplier', 1.0),
            "estimated_fare": fare_result['total_fare'],
            "fare_breakdown": fare_result['fare_breakdown'],
            "final_fare": None,  # Set when ride completes
            
            # Driver assignment
            "driver_id": None,
            "assigned_at": None,
            
            # Timestamps
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "completed_at": None
        }
        
        # Insert booking
        bookings_collection = db["bookings"]
        result = await bookings_collection.insert_one(booking)
        
        if not result.inserted_id:
            raise HTTPException(status_code=500, detail="Failed to create booking")
        
        logger.info(f"Booking created: {booking_id} - {request.vehicle_type_id} {request.ride_type} - ₹{fare_result['total_fare']:.2f}")
        
        return {
            "status": "success",
            "data": {
                "booking_id": booking_id,
                "status": "pending",
                "vehicle_type_id": request.vehicle_type_id,
                "vehicle_name": booking["vehicle_name"],
                "ride_type": request.ride_type,
                "distance_km": fare_result['distance_km'],
                "estimated_time_minutes": fare_result['estimated_time_minutes'],
                "estimated_fare": fare_result['total_fare'],
                "fare_breakdown": fare_result['fare_breakdown'],
                "pickup_location": request.pickup_location,
                "dropoff_location": request.dropoff_location,
                "created_at": booking["created_at"].isoformat()
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Booking creation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Booking creation failed: {str(e)}")

@router.get("/{booking_id}")
async def get_booking(
    booking_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get booking details"""
    try:
        bookings_collection = db["bookings"]
        booking = await bookings_collection.find_one({"_id": booking_id})
        
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        booking.pop("_id", None)
        return {
            "status": "success",
            "data": booking
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
