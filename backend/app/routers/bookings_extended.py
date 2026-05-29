"""
Fare Estimation and Booking Management for Total Mobility Platform
Handles fare calculation with vehicle multipliers and ride type configurations
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
from math import radians, cos, sin, asin, sqrt
from app.db.database import get_db
import uuid

router = APIRouter(prefix="/api/bookings", tags=["bookings"])

# Models
class FareEstimateRequest(BaseModel):
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

class CreateBookingRequest(BaseModel):
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

# Utility functions
def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points on earth (in km)
    """
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2)**2 + cos(lat1) * cos(lat2) * sin(dlon / 2)**2
    c = 2 * asin(sqrt(a))
    
    km = 6371 * c
    return km

async def get_vehicle_multiplier(
    db: AsyncIOMotorDatabase,
    vehicle_type_id: str,
    vehicle_subtype_id: Optional[str]
) -> float:
    """Get multiplier for vehicle type/subtype"""
    try:
        collection = db["vehicle_types"]
        vehicle = await collection.find_one({"_id": vehicle_type_id})
        
        if not vehicle:
            return 1.0
        
        if vehicle_subtype_id:
            for subtype in vehicle.get("subtypes", []):
                if subtype["id"] == vehicle_subtype_id:
                    return subtype.get("multiplier", 1.0)
        
        return vehicle.get("base_multiplier", 1.0)
    except:
        return 1.0

def get_base_fare(vehicle_type_id: str, ride_type: str) -> float:
    """Get base fare for vehicle type and ride type"""
    
    BASE_FARES = {
        "instant": {
            "auto": 25, "taxi": 40, "xl": 50, "traveller": 60,
            "bus": 100, "minitruck": 80, "truck": 120
        },
        "scheduled": {
            "auto": 25, "taxi": 40, "xl": 50, "traveller": 60,
            "bus": 100, "minitruck": 80, "truck": 120
        },
        "rental": {
            "auto": 200, "taxi": 300, "xl": 400, "traveller": 500,
            "bus": 800, "minitruck": 600, "truck": 900
        },
        "airport": {
            "auto": 50, "taxi": 75, "xl": 100, "traveller": 150,
            "bus": 250, "minitruck": 150, "truck": 250
        },
        "corporate": {
            "auto": 40, "taxi": 60, "xl": 80, "traveller": 100,
            "bus": 200, "minitruck": 120, "truck": 180
        },
        "tourism": {
            "auto": 300, "taxi": 500, "xl": 700, "traveller": 1000,
            "bus": 1500, "minitruck": 1200, "truck": 1800
        },
        "goods": {
            "minitruck": 100, "truck": 150
        }
    }
    
    return BASE_FARES.get(ride_type, {}).get(vehicle_type_id, 50)

@router.post("/estimate-fare")
async def estimate_fare(
    request: FareEstimateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Estimate fare for a booking with vehicle type and ride type
    
    Calculation flow:
    1. Calculate distance using haversine
    2. Estimate time (avg speed ~20 km/h in city)
    3. Calculate base components (base fare + distance + time)
    4. Apply vehicle multiplier
    5. Apply surge pricing
    6. Add taxes (18% GST)
    """
    try:
        # Validate vehicle type
        vehicle_collection = db["vehicle_types"]
        vehicle = await vehicle_collection.find_one({"_id": request.vehicle_type_id})
        if not vehicle:
            raise HTTPException(status_code=400, detail="Invalid vehicle type")
        
        # Validate ride type
        ride_type_collection = db["ride_types"]
        ride_type_obj = await ride_type_collection.find_one({"_id": request.ride_type})
        if not ride_type_obj:
            raise HTTPException(status_code=400, detail="Invalid ride type")
        
        # Calculate distance
        distance_km = haversine_distance(
            request.pickup_latitude,
            request.pickup_longitude,
            request.dropoff_latitude,
            request.dropoff_longitude
        )
        distance_km = max(distance_km, 1.0)
        
        # Estimate duration (average speed ~20 km/h in city)
        duration_minutes = int((distance_km / 20) * 60 + 5)
        
        # Get base fare
        base_fare = get_base_fare(request.vehicle_type_id, request.ride_type)
        
        # Calculate components
        distance_charge = distance_km * 12  # ₹12 per km
        time_charge = duration_minutes * 2   # ₹2 per minute
        
        subtotal = base_fare + distance_charge + time_charge
        
        # Apply vehicle multiplier
        vehicle_multiplier = await get_vehicle_multiplier(
            db,
            request.vehicle_type_id,
            request.vehicle_subtype_id
        )
        
        # Vehicle charge (premium above base multiplier)
        vehicle_charge = subtotal * (vehicle_multiplier - 1)
        after_vehicle = subtotal + vehicle_charge
        
        # Apply surge pricing (for now, 1.0x - can be dynamic)
        surge_multiplier = 1.0
        surge_charge = after_vehicle * (surge_multiplier - 1)
        after_surge = after_vehicle + surge_charge
        
        # Apply goods weight surcharge
        goods_charge = 0
        if request.goods_weight_kg and request.goods_weight_kg > 0:
            goods_charge = request.goods_weight_kg * 5  # ₹5 per kg
        
        # Taxes (18% GST)
        tax_rate = 0.18
        taxable_amount = after_surge + goods_charge
        taxes = taxable_amount * tax_rate
        
        # Final fare
        estimated_fare = taxable_amount + taxes
        
        # Apply discount if provided
        if request.discount_percentage > 0:
            discount_amount = estimated_fare * (request.discount_percentage / 100)
            estimated_fare = estimated_fare - discount_amount
        
        return {
            "status": "success",
            "data": {
                "distance_km": round(distance_km, 2),
                "duration_minutes": duration_minutes,
                "base_fare": base_fare,
                "distance_charge": round(distance_charge, 2),
                "time_charge": round(time_charge, 2),
                "subtotal": round(subtotal, 2),
                "vehicle_multiplier": vehicle_multiplier,
                "vehicle_charge": round(vehicle_charge, 2),
                "after_vehicle": round(after_vehicle, 2),
                "surge_multiplier": surge_multiplier,
                "surge_charge": round(surge_charge, 2),
                "after_surge": round(after_surge, 2),
                "goods_charge": round(goods_charge, 2),
                "taxes": round(taxes, 2),
                "estimated_fare": round(estimated_fare, 2),
                "breakdown": {
                    "base": base_fare,
                    "distance": round(distance_charge, 2),
                    "time": round(time_charge, 2),
                    "vehicle_premium": round(vehicle_charge, 2),
                    "surge": round(surge_charge, 2),
                    "goods": round(goods_charge, 2),
                    "taxes": round(taxes, 2)
                }
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/create")
async def create_booking(
    request: CreateBookingRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    # current_user = Depends(get_current_user)  # Uncomment when auth is ready
):
    """
    Create a new booking with vehicle type and ride type
    """
    try:
        # Validate vehicle type
        vehicle_collection = db["vehicle_types"]
        vehicle = await vehicle_collection.find_one({"_id": request.vehicle_type_id})
        if not vehicle:
            raise HTTPException(status_code=400, detail="Invalid vehicle type")
        
        # Validate ride type
        ride_type_collection = db["ride_types"]
        ride_type_obj = await ride_type_collection.find_one({"_id": request.ride_type})
        if not ride_type_obj:
            raise HTTPException(status_code=400, detail="Invalid ride type")
        
        # Get vehicle multiplier
        vehicle_multiplier = await get_vehicle_multiplier(
            db,
            request.vehicle_type_id,
            request.vehicle_subtype_id
        )
        
        # Estimate fare
        distance_km = haversine_distance(
            request.pickup_latitude,
            request.pickup_longitude,
            request.dropoff_latitude,
            request.dropoff_longitude
        )
        distance_km = max(distance_km, 1.0)
        duration_minutes = int((distance_km / 20) * 60 + 5)
        
        base_fare = get_base_fare(request.vehicle_type_id, request.ride_type)
        distance_charge = distance_km * 12
        time_charge = duration_minutes * 2
        
        subtotal = base_fare + distance_charge + time_charge
        vehicle_charge = subtotal * (vehicle_multiplier - 1)
        after_vehicle = subtotal + vehicle_charge
        
        surge_multiplier = 1.0
        after_surge = after_vehicle
        
        # Goods charge
        goods_charge = 0
        if request.goods_weight_kg and request.goods_weight_kg > 0:
            goods_charge = request.goods_weight_kg * 5
        
        # Taxes
        taxable_amount = after_surge + goods_charge
        taxes = taxable_amount * 0.18
        
        estimated_fare = taxable_amount + taxes
        
        # Create booking document
        booking_id = f"booking_{uuid.uuid4().hex[:12]}"
        
        booking = {
            "_id": booking_id,
            "passenger_id": "TEMP_PASSENGER",  # TODO: Get from current_user
            "status": "pending",
            "vehicle_type_id": request.vehicle_type_id,
            "vehicle_subtype_id": request.vehicle_subtype_id,
            "ride_type": request.ride_type,
            "pickup_latitude": request.pickup_latitude,
            "pickup_longitude": request.pickup_longitude,
            "pickup_address": request.pickup_address,
            "dropoff_latitude": request.dropoff_latitude,
            "dropoff_longitude": request.dropoff_longitude,
            "dropoff_address": request.dropoff_address,
            "passenger_count": request.passenger_count,
            "goods_weight_kg": request.goods_weight_kg,
            "scheduled_pickup_time": request.scheduled_pickup_time,
            "distance_km": round(distance_km, 2),
            "duration_minutes": duration_minutes,
            "base_estimated_fare": base_fare,
            "vehicle_type_multiplier": vehicle_multiplier,
            "vehicle_charge": round(vehicle_charge, 2),
            "surge_multiplier": surge_multiplier,
            "promo_code": request.promo_code,
            "taxes": round(taxes, 2),
            "estimated_fare": round(estimated_fare, 2),
            "final_fare": None,
            "driver_id": None,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        bookings_collection = db["bookings"]
        result = await bookings_collection.insert_one(booking)
        
        if not result.inserted_id:
            raise HTTPException(status_code=500, detail="Failed to create booking")
        
        return {
            "status": "success",
            "data": {
                "booking_id": booking_id,
                "status": "pending",
                "vehicle_type_id": request.vehicle_type_id,
                "ride_type": request.ride_type,
                "estimated_fare": round(estimated_fare, 2),
                "pickup_address": request.pickup_address,
                "dropoff_address": request.dropoff_address,
                "created_at": booking["created_at"].isoformat()
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

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
