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
from app.utils.time_helpers import get_ist_now
from motor.motor_asyncio import AsyncIOMotorDatabase
from math import radians, cos, sin, asin, sqrt
from app.db.deps import get_db
from app.models.canonical_vehicle_model import CANONICAL_VEHICLES_COLLECTION
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
from app.utils.rbac import get_current_user_secure
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/bookings", tags=["bookings"])

ACTIVE_BOOKING_STATUSES = ("pending", "accepted", "driver_arrived", "in_progress")


def _vehicle_catalog(db: AsyncIOMotorDatabase):
    return db[CANONICAL_VEHICLES_COLLECTION]


def _vehicle_multiplier_from_catalog(vehicle: dict, subtype_id: Optional[str] = None) -> float:
    multiplier = float(vehicle.get("base_multiplier", 1.0) or 1.0)
    if subtype_id:
        for subtype in vehicle.get("subtypes", []):
            if subtype.get("id") == subtype_id:
                return float(subtype.get("multiplier", multiplier) or multiplier)
    return multiplier


def _vehicle_subtype_from_catalog(vehicle: dict, subtype_id: Optional[str] = None) -> Optional[dict]:
    if not subtype_id:
        return None
    for subtype in vehicle.get("subtypes", []):
        if subtype.get("id") == subtype_id:
            return subtype
    return None


def _vehicle_capacity_from_catalog(vehicle: dict, subtype_id: Optional[str] = None) -> tuple[int, str]:
    subtype = _vehicle_subtype_from_catalog(vehicle, subtype_id)
    capacity = subtype.get("capacity") if subtype else None
    if not capacity:
        capacity = vehicle.get("capacity", 1)
    return int(capacity or 1), vehicle.get("capacity_unit", "passengers")


def _normalize_region(value: Optional[str]) -> str:
    return str(value or "").strip().lower()


def _validate_vehicle_region(vehicle: dict, *candidates: Optional[str]) -> None:
    normalized_regions = {
        _normalize_region(region)
        for region in vehicle.get("regions", ["all"])
        if _normalize_region(region)
    }
    if not normalized_regions or "all" in normalized_regions:
        return

    requested = {_normalize_region(candidate) for candidate in candidates if _normalize_region(candidate)}
    if requested and normalized_regions.isdisjoint(requested):
        raise HTTPException(
            status_code=400,
            detail=f"Vehicle {vehicle.get('vehicle_type_id')} is not available in the selected region",
        )


def _validate_vehicle_constraints(
    vehicle: dict,
    ride_type: str,
    subtype_id: Optional[str],
    passenger_count: Optional[int],
    goods_weight_kg: Optional[float],
) -> tuple[int, str]:
    if subtype_id and not _vehicle_subtype_from_catalog(vehicle, subtype_id):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid vehicle subtype: {subtype_id}",
        )

    capacity, capacity_unit = _vehicle_capacity_from_catalog(vehicle, subtype_id)
    if ride_type == "goods":
        if not vehicle.get("goods_supported", False):
            raise HTTPException(
                status_code=400,
                detail=f"Vehicle {vehicle.get('vehicle_type_id')} does not support goods bookings",
            )
        if capacity_unit == "kg" and goods_weight_kg is not None and goods_weight_kg > capacity:
            raise HTTPException(
                status_code=400,
                detail=f"Goods weight exceeds selected vehicle capacity of {capacity} kg",
            )
    else:
        if not vehicle.get("passenger_supported", True):
            raise HTTPException(
                status_code=400,
                detail=f"Vehicle {vehicle.get('vehicle_type_id')} does not support passenger bookings",
            )
        if capacity_unit != "kg" and passenger_count and passenger_count > capacity:
            raise HTTPException(
                status_code=400,
                detail=f"Passenger count exceeds selected vehicle capacity of {capacity}",
            )

    return capacity, capacity_unit


def _as_plain_dict(value):
    if value is None:
        return None
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if hasattr(value, "dict"):
        return value.dict()
    if isinstance(value, dict):
        return value
    return value


def _serialize_booking(booking: dict) -> dict:
    payload = dict(booking or {})
    raw_id = payload.get("_id")
    if raw_id is not None:
        payload["_id"] = str(raw_id)
    payload["id"] = str(payload.get("id") or raw_id or "")
    for key in ("created_at", "updated_at", "completed_at", "scheduled_datetime"):
        if isinstance(payload.get(key), datetime):
            payload[key] = payload[key].isoformat()
    return payload


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
    pickup_region: Optional[str] = None
    pickup_district: Optional[str] = None
    pickup_pincode: Optional[str] = None
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
    pickup_region: Optional[str] = None
    pickup_district: Optional[str] = None
    pickup_pincode: Optional[str] = None
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
        # Validate vehicle type using the canonical vehicle type catalog.
        vehicle = await _vehicle_catalog(db).find_one({"vehicle_type_id": request.vehicle_type_id})
        if not vehicle:
            raise HTTPException(status_code=400, detail=f"Invalid vehicle type: {request.vehicle_type_id}")
        
        # Validate ride type compatibility
        if request.ride_type not in vehicle.get("allowed_ride_types", []):
            raise HTTPException(
                status_code=400,
                detail=f"Vehicle {request.vehicle_type_id} does not support {request.ride_type} rides"
            )
        _validate_vehicle_region(
            vehicle,
            getattr(request, "pickup_region", None),
            getattr(request, "pickup_district", None),
            getattr(request, "pickup_pincode", None),
        )
        _validate_vehicle_constraints(
            vehicle,
            request.ride_type,
            request.vehicle_subtype_id,
            request.passenger_count,
            request.goods_weight_kg,
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
            rental_hours=request.rental_hours or request.tour_hours,
            is_peak_hours=is_peak,
            current_rides=current_rides,
            available_drivers=available_drivers,
            promo_discount=request.promo_discount or 0.0,
            tax_percentage=5.0,  # 5% tax
            vehicle_multiplier_override=_vehicle_multiplier_from_catalog(
                vehicle,
                request.vehicle_subtype_id,
            ),
            fare_config_override=vehicle.get("fare_config"),
        )
        if not fare_result.get("success"):
            raise HTTPException(
                status_code=400,
                detail=fare_result.get("error") or "Fare calculation failed",
            )

        fare_breakdown = _as_plain_dict(fare_result.get("fare_breakdown"))
        
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
                "fare_breakdown": fare_breakdown,
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
    current_user: dict = Depends(get_current_user_secure),
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
        if str(current_user.get("role") or "").split(".")[-1].lower() != "passenger":
            raise HTTPException(status_code=403, detail="Only passengers can create bookings")
        passenger_id = str(current_user.get("id") or "").strip()
        if not passenger_id:
            raise HTTPException(status_code=401, detail="Invalid passenger account. Please login again.")

        # Validate vehicle type
        vehicle = await _vehicle_catalog(db).find_one({"vehicle_type_id": request.vehicle_type_id})
        if not vehicle:
            raise HTTPException(status_code=400, detail=f"Invalid vehicle type: {request.vehicle_type_id}")
        
        # Validate ride type compatibility
        if request.ride_type not in vehicle.get("allowed_ride_types", []):
            raise HTTPException(
                status_code=400,
                detail=f"Vehicle {request.vehicle_type_id} does not support {request.ride_type} rides"
            )
        _validate_vehicle_region(
            vehicle,
            getattr(request, "pickup_region", None),
            getattr(request, "pickup_district", None),
            getattr(request, "pickup_pincode", None),
        )
        vehicle_capacity, capacity_unit = _validate_vehicle_constraints(
            vehicle,
            request.ride_type,
            request.vehicle_subtype_id,
            request.passenger_count,
            request.goods_details.goods_weight_kg if request.goods_details else None,
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
            rental_hours=(
                request.rental_details.rental_hours
                if request.rental_details
                else request.tourism_details.tour_hours
                if request.tourism_details
                else None
            ),
            is_peak_hours=False,
            current_rides=0,
            available_drivers=10,
            promo_discount=0.0,
            tax_percentage=5.0,
            vehicle_multiplier_override=_vehicle_multiplier_from_catalog(
                vehicle,
                request.vehicle_subtype_id,
            ),
            fare_config_override=vehicle.get("fare_config"),
        )
        if not fare_result.get("success"):
            raise HTTPException(
                status_code=400,
                detail=fare_result.get("error") or "Fare calculation failed",
            )

        fare_breakdown = _as_plain_dict(fare_result.get("fare_breakdown"))
        
        # Create booking document
        booking_id = f"booking_{uuid.uuid4().hex[:12]}"
        
        booking = {
            "_id": booking_id,
            "id": booking_id,  # Add explicit id field for compatibility
            "passenger_id": passenger_id,
            "status": "pending",
            
            # Vehicle information
            "vehicle_type_id": request.vehicle_type_id,
            "vehicle_subtype_id": request.vehicle_subtype_id,
            "vehicle_name": vehicle.get("name", request.vehicle_type_id),
            "vehicle_capacity": vehicle_capacity,
            "capacity_unit": capacity_unit,
            
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
            "goods_details": _as_plain_dict(request.goods_details),
            "airport_details": _as_plain_dict(request.airport_details),
            "rental_details": _as_plain_dict(request.rental_details),
            "tourism_details": _as_plain_dict(request.tourism_details),
            
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
            "fare_breakdown": fare_breakdown,
            "final_fare": None,  # Set when ride completes
            
            # Driver assignment
            "driver_id": None,
            "assigned_at": None,
            
            # Timestamps
            "created_at": get_ist_now(),
            "updated_at": get_ist_now(),
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
                "vehicle_subtype_id": request.vehicle_subtype_id,
                "vehicle_name": booking["vehicle_name"],
                "vehicle_capacity": vehicle_capacity,
                "capacity_unit": capacity_unit,
                "ride_type": request.ride_type,
                "distance_km": fare_result['distance_km'],
                "estimated_time_minutes": fare_result['estimated_time_minutes'],
                "estimated_fare": fare_result['total_fare'],
                "fare_breakdown": fare_breakdown,
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


@router.get("/active")
async def get_active_booking(
    current_user: dict = Depends(get_current_user_secure),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get the current passenger/driver active booking."""
    try:
        role = str(current_user.get("role") or "").split(".")[-1].lower()
        user_id = str(current_user.get("id") or "").strip()
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid user session")

        query = {"status": {"$in": list(ACTIVE_BOOKING_STATUSES)}}
        if role == "passenger":
            query["passenger_id"] = user_id
        elif role == "driver":
            query["driver_id"] = user_id

        booking = await db["bookings"].find_one(query, sort=[("created_at", -1)])
        if not booking:
            return None

        payload = _serialize_booking(booking)
        if role != "passenger":
            payload.pop("ride_start_otp", None)
            payload.pop("ride_end_otp", None)
        return payload
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Active booking lookup error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve active booking")


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
