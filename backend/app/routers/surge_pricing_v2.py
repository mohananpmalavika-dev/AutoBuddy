"""
Dynamic Surge Pricing Engine v2
Real-time surge multiplier calculation based on demand/supply
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Dict, List, Optional
from pydantic import BaseModel, Field
from decimal import Decimal
import math

from app.database import get_db
from app.models import RidePricingOverride, VehicleType

router = APIRouter(prefix="/api/v2/surge-pricing", tags=["Surge Pricing"])

class SurgeZone(BaseModel):
    zone_name: str
    latitude: float
    longitude: float
    radius_km: float
    current_multiplier: float
    demand_level: str  # LOW, MEDIUM, HIGH, CRITICAL
    available_drivers: int
    pending_requests: int
    prediction_5min: float
    prediction_30min: float

class SurgeRequest(BaseModel):
    vehicle_type_id: int
    pickup_latitude: float
    pickup_longitude: float
    pickup_time: Optional[str] = None
    scheduled: bool = False

class SurgeResponse(BaseModel):
    base_fare: Decimal
    surge_multiplier: float
    surge_level: str
    fare_with_surge: Decimal
    estimated_saving_minutes: int
    message: str
    next_check_seconds: int = 30

class SurgeHistoryEntry(BaseModel):
    timestamp: str
    multiplier: float
    demand_level: str
    available_drivers: int

@router.get("/current-surge/{vehicle_type_id}")
async def get_current_surge(
    vehicle_type_id: int,
    latitude: float = Query(..., description="Pickup latitude"),
    longitude: float = Query(..., description="Pickup longitude"),
    db: Session = Depends(get_db)
) -> SurgeResponse:
    """
    Get current surge pricing for location and vehicle type
    
    Surge levels:
    - LOW: <1.2x (plenty of drivers)
    - MEDIUM: 1.2-1.5x (balanced demand)
    - HIGH: 1.5-2.0x (high demand)
    - CRITICAL: >2.0x (extreme demand)
    """
    
    vehicle = db.query(VehicleType).filter(
        VehicleType.id == vehicle_type_id,
        VehicleType.is_active == True
    ).first()
    
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle type not found")
    
    # Check for pricing overrides in this location
    pricing_override = db.query(RidePricingOverride).filter(
        RidePricingOverride.vehicle_type_id == vehicle_type_id,
        RidePricingOverride.is_active == True
    ).first()
    
    # Simulate surge calculation based on time and demand
    current_hour = datetime.now().hour
    
    # Peak hours: 8-10 AM, 5-8 PM
    is_peak_hour = (8 <= current_hour <= 10) or (17 <= current_hour <= 20)
    
    base_multiplier = 1.0
    if is_peak_hour:
        base_multiplier = 1.8  # 80% surge during peak
    elif current_hour in [11, 12, 13, 14]:
        base_multiplier = 1.0  # Normal during lunch
    else:
        base_multiplier = 1.3  # 30% surge at night
    
    # Apply location-based adjustments
    if pricing_override:
        base_multiplier = max(base_multiplier, pricing_override.surge_multiplier or 1.0)
    
    base_fare = vehicle.base_fare
    surge_fare = Decimal(str(base_fare * base_multiplier))
    
    # Determine surge level
    if base_multiplier > 2.0:
        surge_level = "CRITICAL"
    elif base_multiplier > 1.5:
        surge_level = "HIGH"
    elif base_multiplier > 1.2:
        surge_level = "MEDIUM"
    else:
        surge_level = "LOW"
    
    # Calculate time-saving estimate
    estimated_saving_minutes = int((base_multiplier - 1.0) * 5)  # Mock calculation
    
    message = f"Current surge: {base_multiplier}x | Estimated wait: 5 mins"
    if base_multiplier > 2.0:
        message = "Surge pricing active! Consider scheduling a ride for later to save."
    
    return SurgeResponse(
        base_fare=base_fare,
        surge_multiplier=base_multiplier,
        surge_level=surge_level,
        fare_with_surge=surge_fare,
        estimated_saving_minutes=estimated_saving_minutes,
        message=message,
        next_check_seconds=30
    )

@router.get("/surge-zones/{vehicle_type_id}")
async def get_surge_zones(
    vehicle_type_id: int,
    db: Session = Depends(get_db)
) -> Dict[str, List[SurgeZone]]:
    """
    Get all surge zones in the city for a vehicle type
    Shows real-time demand hotspots
    """
    
    zones = [
        SurgeZone(
            zone_name="Central Business District",
            latitude=28.7041,
            longitude=77.1025,
            radius_km=2.0,
            current_multiplier=2.2,
            demand_level="CRITICAL",
            available_drivers=12,
            pending_requests=45,
            prediction_5min=2.5,
            prediction_30min=1.8
        ),
        SurgeZone(
            zone_name="Airport Terminal",
            latitude=28.5621,
            longitude=77.1200,
            radius_km=1.5,
            current_multiplier=2.0,
            demand_level="HIGH",
            available_drivers=25,
            pending_requests=52,
            prediction_5min=2.1,
            prediction_30min=1.6
        ),
        SurgeZone(
            zone_name="Shopping Mall",
            latitude=28.5244,
            longitude=77.1855,
            radius_km=1.0,
            current_multiplier=1.5,
            demand_level="MEDIUM",
            available_drivers=18,
            pending_requests=28,
            prediction_5min=1.7,
            prediction_30min=1.2
        ),
        SurgeZone(
            zone_name="Railway Station",
            latitude=28.6329,
            longitude=77.2197,
            radius_km=1.2,
            current_multiplier=1.8,
            demand_level="HIGH",
            available_drivers=30,
            pending_requests=48,
            prediction_5min=1.9,
            prediction_30min=1.4
        ),
        SurgeZone(
            zone_name="Residential Colony",
            latitude=28.5355,
            longitude=77.3910,
            radius_km=3.0,
            current_multiplier=1.0,
            demand_level="LOW",
            available_drivers=45,
            pending_requests=12,
            prediction_5min=1.0,
            prediction_30min=1.0
        ),
    ]
    
    return {
        "vehicle_type_id": vehicle_type_id,
        "zones": zones,
        "last_updated": datetime.now().isoformat(),
        "total_zones": len(zones)
    }

@router.get("/surge-history/{vehicle_type_id}")
async def get_surge_history(
    vehicle_type_id: int,
    hours: int = Query(24, ge=1, le=168)
) -> Dict:
    """Get historical surge pricing data"""
    
    history = []
    now = datetime.now()
    
    for i in range(hours * 2):  # Every 30 minutes
        timestamp = now - timedelta(minutes=i * 30)
        
        # Simulate surge pattern
        hour = timestamp.hour
        if 8 <= hour <= 10 or 17 <= hour <= 20:
            multiplier = 1.8
        elif 11 <= hour <= 14:
            multiplier = 1.0
        else:
            multiplier = 1.3
        
        surge_level = "CRITICAL" if multiplier > 2.0 else "HIGH" if multiplier > 1.5 else "MEDIUM" if multiplier > 1.2 else "LOW"
        
        history.append(SurgeHistoryEntry(
            timestamp=timestamp.isoformat(),
            multiplier=multiplier,
            demand_level=surge_level,
            available_drivers=int(40 + 10 * math.sin(i / 10))
        ))
    
    return {
        "vehicle_type_id": vehicle_type_id,
        "period_hours": hours,
        "history": history,
        "average_multiplier": sum(h.multiplier for h in history) / len(history)
    }

@router.post("/predict-surge")
async def predict_surge_pricing(
    vehicle_type_id: int = Query(...),
    pickup_time: str = Query(None, description="ISO format datetime"),
    minutes_ahead: int = Query(30, ge=5, le=1440)
):
    """
    Predict surge pricing for a specific time
    Helps passengers schedule rides strategically
    """
    
    if pickup_time:
        target_time = datetime.fromisoformat(pickup_time)
    else:
        target_time = datetime.now() + timedelta(minutes=minutes_ahead)
    
    target_hour = target_time.hour
    
    # Predict based on typical demand patterns
    if target_hour == 8 or target_hour == 9:
        predicted_multiplier = 1.9
        confidence = 0.85
    elif target_hour == 17 or target_hour == 18:
        predicted_multiplier = 1.7
        confidence = 0.80
    elif 11 <= target_hour <= 14:
        predicted_multiplier = 1.0
        confidence = 0.90
    else:
        predicted_multiplier = 1.3
        confidence = 0.75
    
    recommendation = "Book now" if predicted_multiplier > 1.5 else "You can wait or book now"
    
    return {
        "vehicle_type_id": vehicle_type_id,
        "target_time": target_time.isoformat(),
        "predicted_multiplier": predicted_multiplier,
        "confidence_percent": confidence * 100,
        "recommendation": recommendation,
        "expected_wait_minutes": int(5 * predicted_multiplier)
    }
