"""
Premium UI Backend API
Provides endpoints for dynamic pricing, real-time tracking, and ETA calculations
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import math

router = APIRouter(prefix="/api/v1/premium-ui", tags=["premium-ui"])


class Location(BaseModel):
    latitude: float
    longitude: float


class PricingRequest(BaseModel):
    pickup: Location
    dropoff: Location
    ride_type: str = "economy"
    is_scheduled: bool = False


class PricingBreakdown(BaseModel):
    base_fare: float
    distance_fare: float
    surge_fare: float = 0.0
    discount: float = 0.0
    taxes: float = 0.0
    total: float
    currency: str = "INR"
    is_surge_active: bool = False
    surge_multiplier: float = 1.0


class ETAResponse(BaseModel):
    eta_minutes: int
    distance_km: float
    driver_name: Optional[str] = None
    driver_rating: Optional[float] = None
    vehicle_number: Optional[str] = None
    vehicle_type: Optional[str] = None


class RideStatusUpdate(BaseModel):
    status: str  # "searching", "accepted", "arriving", "arrived", "in_transit", "completed"
    driver_location: Optional[Location] = None
    eta_minutes: Optional[int] = None
    distance_to_pickup: Optional[float] = None


def calculate_distance(loc1: Location, loc2: Location) -> float:
    """Calculate distance between two coordinates using Haversine formula (in km)"""
    R = 6371  # Earth radius in km
    
    lat1_rad = math.radians(loc1.latitude)
    lat2_rad = math.radians(loc2.latitude)
    delta_lat = math.radians(loc2.latitude - loc1.latitude)
    delta_lon = math.radians(loc2.longitude - loc1.longitude)
    
    a = math.sin(delta_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    
    return R * c


def get_base_fare(ride_type: str = "economy") -> float:
    """Get base fare by ride type"""
    fares = {
        "economy": 50.0,
        "premium": 100.0,
        "shared": 30.0,
    }
    return fares.get(ride_type, 50.0)


def get_distance_rate(ride_type: str = "economy") -> float:
    """Get per-km rate by ride type (in ₹/km)"""
    rates = {
        "economy": 15.0,
        "premium": 25.0,
        "shared": 10.0,
    }
    return rates.get(ride_type, 15.0)


def calculate_surge_multiplier(current_hour: int, is_peak: bool = False) -> float:
    """
    Calculate surge multiplier based on time and demand
    Peak hours: 8-9 AM, 5-7 PM
    """
    if is_peak:
        return 1.5
    
    # Light surge during off-peak
    if current_hour in [9, 10, 11, 12, 1, 2, 3, 4]:
        return 1.0  # No surge during day time
    elif current_hour in [5, 6, 7, 8, 22, 23]:
        return 1.2  # Light surge
    else:
        return 1.0


def apply_discounts(total: float, user_id: Optional[str] = None) -> float:
    """Apply available discounts to fare"""
    # Placeholder: Check user's promo codes, loyalty, etc.
    if user_id and user_id.startswith("loyalty_"):
        return total * 0.9  # 10% discount
    return total


@router.post("/calculate-pricing")
async def calculate_pricing(request: PricingRequest) -> PricingBreakdown:
    """
    Calculate dynamic pricing based on pickup/dropoff and current conditions
    
    Returns real-time pricing breakdown with surge pricing if applicable
    """
    try:
        # Calculate distance
        distance_km = calculate_distance(request.pickup, request.dropoff)
        
        # Validate distance
        if distance_km < 0.5:
            raise HTTPException(
                status_code=400,
                detail="Pickup and dropoff are too close (minimum 500m)"
            )
        
        # Base calculations
        base_fare = get_base_fare(request.ride_type)
        distance_rate = get_distance_rate(request.ride_type)
        distance_fare = distance_km * distance_rate
        
        # Surge pricing (simplified)
        current_hour = datetime.now().hour
        is_peak = current_hour in [8, 9, 17, 18, 19]  # Peak hours
        surge_multiplier = calculate_surge_multiplier(current_hour, is_peak)
        
        # Apply surge to base + distance
        subtotal = (base_fare + distance_fare) * surge_multiplier
        surge_fare = subtotal - (base_fare + distance_fare)
        
        # Taxes (5% GST)
        tax_rate = 0.05
        taxes = subtotal * tax_rate
        
        # Discount (10% if using promo)
        discount = subtotal * 0.1 if request.is_scheduled else 0.0
        
        # Total
        total = subtotal + taxes - discount
        
        return PricingBreakdown(
            base_fare=base_fare,
            distance_fare=distance_fare,
            surge_fare=surge_fare,
            discount=discount,
            taxes=taxes,
            total=max(total, base_fare),  # Minimum fare protection
            is_surge_active=surge_multiplier > 1.0,
            surge_multiplier=surge_multiplier,
        )
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/calculate-eta")
async def calculate_eta(request: PricingRequest) -> ETAResponse:
    """
    Calculate ETA based on distance and traffic conditions
    
    Returns estimated time and distance to destination
    """
    try:
        distance_km = calculate_distance(request.pickup, request.dropoff)
        
        # Simplified ETA calculation (assumes 20 km/h average in city)
        average_speed = 20  # km/h
        
        # Add buffer for traffic (increase by 30% during peak hours)
        current_hour = datetime.now().hour
        if current_hour in [8, 9, 17, 18, 19]:
            average_speed *= 0.7  # Reduce speed for peak hours
        
        eta_minutes = max(2, int((distance_km / average_speed) * 60))
        
        return ETAResponse(
            eta_minutes=eta_minutes,
            distance_km=round(distance_km, 2),
        )
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/pricing-summary/{user_id}")
async def get_pricing_summary(
    user_id: str,
    pickup_lat: float = Query(...),
    pickup_lon: float = Query(...),
    dropoff_lat: float = Query(...),
    dropoff_lon: float = Query(...),
    ride_type: str = Query("economy"),
) -> dict:
    """
    Get pricing summary for a specific route
    
    Query params: pickup coordinates, dropoff coordinates, ride type
    """
    try:
        pickup = Location(latitude=pickup_lat, longitude=pickup_lon)
        dropoff = Location(latitude=dropoff_lat, longitude=dropoff_lon)
        
        request = PricingRequest(
            pickup=pickup,
            dropoff=dropoff,
            ride_type=ride_type,
        )
        
        pricing = await calculate_pricing(request)
        eta = await calculate_eta(request)
        
        return {
            "pricing": pricing.dict(),
            "eta": eta.dict(),
            "user_id": user_id,
            "calculated_at": datetime.now().isoformat(),
        }
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/surge-status")
async def get_surge_status() -> dict:
    """
    Get current surge pricing status across the city
    
    Returns surge multiplier, peak hours, and affected zones
    """
    current_hour = datetime.now().hour
    is_peak = current_hour in [8, 9, 17, 18, 19]
    surge_multiplier = calculate_surge_multiplier(current_hour, is_peak)
    
    return {
        "is_surge_active": surge_multiplier > 1.0,
        "surge_multiplier": surge_multiplier,
        "peak_hours": [8, 9, 17, 18, 19],
        "current_hour": current_hour,
        "message": "High demand - prices are higher" if is_peak else "Normal pricing",
        "affected_zones": ["downtown", "airport"] if is_peak else [],
    }


@router.post("/ride-status/{ride_id}")
async def update_ride_status(ride_id: str, update: RideStatusUpdate) -> dict:
    """
    Update ride status with real-time information
    
    Used to push updates to frontend (driver location, ETA, etc.)
    """
    return {
        "ride_id": ride_id,
        "status": update.status,
        "driver_location": update.driver_location.dict() if update.driver_location else None,
        "eta_minutes": update.eta_minutes,
        "distance_to_pickup": update.distance_to_pickup,
        "updated_at": datetime.now().isoformat(),
    }


@router.get("/estimated-fare/{ride_type}")
async def get_estimated_fare(
    ride_type: str,
    distance_km: float = Query(default=10.0),
) -> dict:
    """
    Get quick estimate without exact coordinates
    
    Useful for quick estimates in search/booking flow
    """
    base_fare = get_base_fare(ride_type)
    distance_rate = get_distance_rate(ride_type)
    distance_fare = distance_km * distance_rate
    
    # Assume 1.2x surge for estimation
    subtotal = (base_fare + distance_fare) * 1.2
    taxes = subtotal * 0.05
    total = subtotal + taxes
    
    return {
        "ride_type": ride_type,
        "distance_km": distance_km,
        "estimated_fare": round(total, 2),
        "minimum": base_fare,
        "maximum": round(total * 1.3, 2),  # Show range
        "currency": "INR",
        "note": "Actual fare may vary based on traffic and demand",
    }
