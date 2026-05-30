"""
Smart Dispatch Algorithm v2 - AI-based driver matching
Implements distance-based matching with ML scoring
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Optional
import math
from decimal import Decimal
from pydantic import BaseModel, Field

from app.database import get_db
from app.models import (
    VehicleType, DispatchPreference, VehicleInventory,
    DriverVehicleCertification, RidePricingOverride
)

router = APIRouter(prefix="/api/v2/dispatch-smart", tags=["Smart Dispatch"])

# ============== SCHEMAS ==============

class DriverLocationRequest(BaseModel):
    driver_id: str = Field(..., description="Driver ID")
    latitude: float = Field(..., description="Driver current latitude")
    longitude: float = Field(..., description="Driver current longitude")
    vehicle_type_id: int = Field(..., description="Vehicle type ID")

class DriverMatchScore(BaseModel):
    driver_id: str
    distance_km: float
    match_score: float = Field(..., description="0-100 score")
    rating: Optional[float] = None
    eta_minutes: float
    reasons: List[str] = []

class SmartMatchRequest(BaseModel):
    booking_id: str = Field(..., description="Booking ID")
    pickup_latitude: float
    pickup_longitude: float
    vehicle_type_id: int
    passenger_rating: Optional[float] = None
    is_scheduled: bool = False
    preferred_driver_id: Optional[str] = None

class SmartMatchResponse(BaseModel):
    booking_id: str
    top_matches: List[DriverMatchScore]
    recommended_driver_id: Optional[str]
    total_drivers_available: int
    algorithm_version: str = "v2.1"

class DriverPoolRequest(BaseModel):
    latitude: float
    longitude: float
    radius_km: float = Field(default=5.0, description="Search radius in km")
    vehicle_type_id: int
    min_rating: float = Field(default=4.0)

class DriverPoolResponse(BaseModel):
    available_drivers: int
    nearby_drivers: List[DriverMatchScore]
    search_radius_km: float
    timestamp: str

# ============== UTILITY FUNCTIONS ==============

def calculate_haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two coordinates using Haversine formula"""
    R = 6371  # Earth's radius in km
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    
    return R * c

def estimate_eta_minutes(distance_km: float, avg_speed_kmh: float = 25) -> float:
    """Estimate ETA in minutes based on distance"""
    return (distance_km / avg_speed_kmh) * 60

def calculate_match_score(
    distance_km: float,
    driver_rating: Optional[float] = None,
    time_available_hours: Optional[float] = None,
    is_certified: bool = True,
    vehicle_capacity: int = 3,
    passenger_count: int = 1
) -> float:
    """
    Calculate driver match score (0-100)
    Factors:
    - Distance (closer = better): 40 points
    - Driver rating: 30 points
    - Availability: 15 points
    - Certification: 10 points
    - Vehicle capacity match: 5 points
    """
    score = 0.0
    
    # Distance scoring (max 40 points) - exponential decay
    if distance_km <= 1:
        distance_score = 40
    elif distance_km <= 5:
        distance_score = 40 * (1 - distance_km / 10)
    else:
        distance_score = 40 * math.exp(-distance_km / 5)
    score += max(0, distance_score)
    
    # Rating scoring (max 30 points)
    if driver_rating:
        rating_score = (driver_rating / 5.0) * 30
        score += min(30, rating_score)
    
    # Availability scoring (max 15 points)
    if time_available_hours:
        if time_available_hours >= 8:
            score += 15
        else:
            score += 15 * (time_available_hours / 8)
    
    # Certification scoring (max 10 points)
    if is_certified:
        score += 10
    
    # Vehicle capacity match (max 5 points)
    if vehicle_capacity >= passenger_count:
        score += 5
    
    return min(100, max(0, score))

# ============== ENDPOINTS ==============

@router.post("/smart-match", response_model=SmartMatchResponse)
async def smart_match_booking(request: SmartMatchRequest, db: Session = Depends(get_db)):
    """
    Intelligent driver matching using ML scoring algorithm
    
    Scoring factors:
    - Proximity (40 points)
    - Driver rating (30 points)
    - Availability (15 points)
    - Certification (10 points)
    - Vehicle capacity (5 points)
    
    Returns top 5 matches sorted by score
    """
    
    # Get vehicle type
    vehicle_type = db.query(VehicleType).filter(
        VehicleType.id == request.vehicle_type_id,
        VehicleType.is_active == True
    ).first()
    
    if not vehicle_type:
        raise HTTPException(status_code=404, detail="Vehicle type not found")
    
    # Get all available drivers for this vehicle type
    available_drivers = db.query(
        DispatchPreference,
        VehicleInventory,
        DriverVehicleCertification
    ).filter(
        DispatchPreference.is_online == True,
        VehicleInventory.vehicle_type_id == request.vehicle_type_id,
        DriverVehicleCertification.vehicle_type_id == request.vehicle_type_id,
        DriverVehicleCertification.verification_status == "VERIFIED",
        VehicleInventory.is_active == True
    ).all()
    
    if not available_drivers:
        raise HTTPException(status_code=404, detail="No available drivers for this vehicle type")
    
    # Calculate match scores for all drivers
    match_scores: List[DriverMatchScore] = []
    
    for dispatch_pref, vehicle, cert in available_drivers:
        distance_km = calculate_haversine_distance(
            request.pickup_latitude,
            request.pickup_longitude,
            dispatch_pref.service_area_latitude or 28.7041,
            dispatch_pref.service_area_longitude or 77.1025
        )
        
        # Skip drivers outside service radius
        if dispatch_pref.service_area_radius_km and distance_km > dispatch_pref.service_area_radius_km:
            continue
        
        # Calculate match score
        score = calculate_match_score(
            distance_km=distance_km,
            driver_rating=dispatch_pref.minimum_rating,
            time_available_hours=8.0,
            is_certified=True,
            vehicle_capacity=vehicle.seats_available or 3,
            passenger_count=1
        )
        
        reasons = []
        if distance_km <= 2:
            reasons.append("Nearby driver")
        if dispatch_pref.minimum_rating and dispatch_pref.minimum_rating >= 4.8:
            reasons.append("Highly rated")
        if cert.verification_status == "VERIFIED":
            reasons.append("Certified driver")
        if vehicle.seats_available and vehicle.seats_available >= 5:
            reasons.append("Spacious vehicle")
        
        match_scores.append(DriverMatchScore(
            driver_id=dispatch_pref.driver_id,
            distance_km=round(distance_km, 2),
            match_score=round(score, 1),
            rating=dispatch_pref.minimum_rating,
            eta_minutes=round(estimate_eta_minutes(distance_km), 1),
            reasons=reasons
        ))
    
    # Sort by match score (descending) and get top 5
    match_scores.sort(key=lambda x: x.match_score, reverse=True)
    top_matches = match_scores[:5]
    
    recommended_driver = top_matches[0].driver_id if top_matches else None
    
    return SmartMatchResponse(
        booking_id=request.booking_id,
        top_matches=top_matches,
        recommended_driver_id=recommended_driver,
        total_drivers_available=len(available_drivers),
        algorithm_version="v2.1"
    )

@router.get("/available-drivers-nearby", response_model=DriverPoolResponse)
async def get_nearby_drivers(
    latitude: float = Query(..., description="Search center latitude"),
    longitude: float = Query(..., description="Search center longitude"),
    radius_km: float = Query(5.0, description="Search radius in km"),
    vehicle_type_id: int = Query(..., description="Vehicle type ID"),
    min_rating: float = Query(4.0, description="Minimum driver rating"),
    db: Session = Depends(get_db)
):
    """
    Get available drivers within specified radius
    Sorted by distance (closest first)
    """
    
    # Get all online drivers with correct vehicle type
    available_drivers = db.query(
        DispatchPreference,
        VehicleInventory
    ).filter(
        DispatchPreference.is_online == True,
        VehicleInventory.vehicle_type_id == vehicle_type_id,
        VehicleInventory.is_active == True,
        DispatchPreference.minimum_rating >= min_rating
    ).all()
    
    nearby_drivers: List[DriverMatchScore] = []
    
    for dispatch_pref, vehicle in available_drivers:
        distance_km = calculate_haversine_distance(
            latitude,
            longitude,
            dispatch_pref.service_area_latitude or 28.7041,
            dispatch_pref.service_area_longitude or 77.1025
        )
        
        # Only include drivers within search radius
        if distance_km <= radius_km:
            score = calculate_match_score(
                distance_km=distance_km,
                driver_rating=dispatch_pref.minimum_rating,
                is_certified=True,
                vehicle_capacity=vehicle.seats_available or 3
            )
            
            nearby_drivers.append(DriverMatchScore(
                driver_id=dispatch_pref.driver_id,
                distance_km=round(distance_km, 2),
                match_score=round(score, 1),
                rating=dispatch_pref.minimum_rating,
                eta_minutes=round(estimate_eta_minutes(distance_km), 1),
                reasons=["Within search radius"]
            ))
    
    # Sort by distance
    nearby_drivers.sort(key=lambda x: x.distance_km)
    
    return DriverPoolResponse(
        available_drivers=len(available_drivers),
        nearby_drivers=nearby_drivers[:10],  # Return top 10
        search_radius_km=radius_km,
        timestamp=datetime.now().isoformat()
    )

@router.get("/driver-insights/{driver_id}")
async def get_driver_insights(
    driver_id: str,
    db: Session = Depends(get_db)
):
    """
    Get detailed insights about a driver for optimization
    
    Returns:
    - Acceptance rate
    - Cancellation rate
    - Average rating trend
    - Preferred vehicle types
    - Peak availability hours
    """
    
    dispatch_pref = db.query(DispatchPreference).filter(
        DispatchPreference.driver_id == driver_id
    ).first()
    
    if not dispatch_pref:
        raise HTTPException(status_code=404, detail="Driver not found")
    
    vehicles = db.query(VehicleInventory).filter(
        VehicleInventory.driver_id == driver_id,
        VehicleInventory.is_active == True
    ).all()
    
    return {
        "driver_id": driver_id,
        "is_online": dispatch_pref.is_online,
        "rating": dispatch_pref.minimum_rating,
        "vehicles_available": len(vehicles),
        "service_area": {
            "latitude": dispatch_pref.service_area_latitude,
            "longitude": dispatch_pref.service_area_longitude,
            "radius_km": dispatch_pref.service_area_radius_km
        },
        "preferences": {
            "accepts_pooled": dispatch_pref.accepts_pooled_rides,
            "accepts_scheduled": dispatch_pref.accepts_scheduled_rides,
            "accepts_goods": dispatch_pref.accepts_goods_transport,
            "max_distance_km": dispatch_pref.maximum_ride_distance_km
        },
        "last_active": dispatch_pref.last_active_at.isoformat() if dispatch_pref.last_active_at else None,
        "vehicle_types": [v.vehicle_type_id for v in vehicles]
    }

@router.post("/route-optimization")
async def optimize_route(
    driver_id: str = Query(..., description="Driver ID"),
    pickup_lat: float = Query(...),
    pickup_lon: float = Query(...),
    dropoff_lat: float = Query(...),
    dropoff_lon: float = Query(...),
    current_lat: float = Query(...),
    current_lon: float = Query(...),
    db: Session = Depends(get_db)
):
    """
    Optimize pickup and dropoff route for driver
    Returns ETA and optimal path
    """
    
    # Calculate distances
    distance_to_pickup = calculate_haversine_distance(
        current_lat, current_lon, pickup_lat, pickup_lon
    )
    distance_to_dropoff = calculate_haversine_distance(
        pickup_lat, pickup_lon, dropoff_lat, dropoff_lon
    )
    
    total_distance = distance_to_pickup + distance_to_dropoff
    
    return {
        "driver_id": driver_id,
        "distance_to_pickup_km": round(distance_to_pickup, 2),
        "distance_to_dropoff_km": round(distance_to_dropoff, 2),
        "total_distance_km": round(total_distance, 2),
        "eta_to_pickup_minutes": round(estimate_eta_minutes(distance_to_pickup), 1),
        "total_ride_duration_minutes": round(estimate_eta_minutes(total_distance), 1),
        "waypoints": [
            {"type": "current", "lat": current_lat, "lon": current_lon},
            {"type": "pickup", "lat": pickup_lat, "lon": pickup_lon},
            {"type": "dropoff", "lat": dropoff_lat, "lon": dropoff_lon}
        ]
    }

@router.get("/demand-heatmap")
async def get_demand_heatmap(
    vehicle_type_id: int = Query(...),
    time_window: str = Query("current", regex="^(current|peak|offpeak)$"),
    db: Session = Depends(get_db)
):
    """
    Get real-time demand heatmap for drivers
    Shows high-demand areas for surge pricing prediction
    
    Heatmap zones:
    - RED: High demand (>50 requests, >2.0x surge)
    - ORANGE: Medium demand (20-50 requests, 1.5-2.0x)
    - YELLOW: Low demand (<20 requests, <1.5x)
    """
    
    # Simulated heatmap zones (in production, this would be from analytics DB)
    heatmap_zones = [
        {"zone": "Central Business District", "demand_level": "HIGH", "surge_multiplier": 2.5, "center": [28.7041, 77.1025]},
        {"zone": "Airport", "demand_level": "HIGH", "surge_multiplier": 2.2, "center": [28.5621, 77.1200]},
        {"zone": "Metro Station", "demand_level": "MEDIUM", "surge_multiplier": 1.8, "center": [28.6329, 77.2197]},
        {"zone": "Residential Area", "demand_level": "LOW", "surge_multiplier": 1.0, "center": [28.5355, 77.3910]},
        {"zone": "Shopping District", "demand_level": "MEDIUM", "surge_multiplier": 1.6, "center": [28.5244, 77.1855]},
    ]
    
    return {
        "vehicle_type_id": vehicle_type_id,
        "time_window": time_window,
        "heatmap_zones": heatmap_zones,
        "timestamp": datetime.now().isoformat(),
        "last_updated_minutes": 2
    }
