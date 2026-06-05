"""
Ride Pooling Engine - Multi-passenger ride sharing
Enables cost-efficient shared rides with dynamic matching
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel, Field
from decimal import Decimal

from app.database import get_db
from app.models import VehicleType, DispatchPreference

router = APIRouter(prefix="/api/v2/ride-pooling", tags=["Ride Pooling"])

class PoolingPassenger(BaseModel):
    passenger_id: str
    pickup_lat: float
    pickup_lon: float
    dropoff_lat: float
    dropoff_lon: float
    estimated_fare: Decimal
    pickup_time_preference: Optional[str] = None

class PoolingRequest(BaseModel):
    passenger_id: str = Field(..., description="Requesting passenger")
    pickup_latitude: float
    pickup_longitude: float
    dropoff_latitude: float
    dropoff_longitude: float
    vehicle_type_id: int
    max_wait_minutes: int = Field(default=10)
    max_detour_percent: float = Field(default=20.0)

class PoolingMatch(BaseModel):
    pool_id: str
    passengers: List[PoolingPassenger]
    estimated_fare_per_passenger: Decimal
    savings_per_passenger: Decimal
    total_distance_km: float
    estimated_duration_minutes: int

class PoolingResponse(BaseModel):
    matched: bool
    pool_id: Optional[str] = None
    matches: Optional[List[PoolingMatch]] = None
    base_fare: Decimal
    pooling_discount: float = Field(description="Discount percentage")
    final_fare: Decimal
    message: str

@router.post("/find-matches", response_model=PoolingResponse)
async def find_pooling_matches(
    request: PoolingRequest,
    db: Session = Depends(get_db)
):
    """
    Find other passengers for ride pooling
    Returns potential pool matches with savings
    """
    
    base_fare = Decimal("150.00")  # Example base fare
    
    # Simulated pooling matches
    pooling_discount = 0.25  # 25% discount for pooling
    final_fare = base_fare * Decimal(str(1 - pooling_discount))
    
    if request.max_wait_minutes >= 5:
        # Mock available pools
        pool = PoolingMatch(
            pool_id="POOL_20260530_001",
            passengers=[
                PoolingPassenger(
                    passenger_id=request.passenger_id,
                    pickup_lat=request.pickup_latitude,
                    pickup_lon=request.pickup_longitude,
                    dropoff_lat=request.dropoff_latitude,
                    dropoff_lon=request.dropoff_longitude,
                    estimated_fare=final_fare
                ),
                PoolingPassenger(
                    passenger_id="PASS_9876",
                    pickup_lat=28.7070,
                    pickup_lon=77.1020,
                    dropoff_lat=28.5250,
                    dropoff_lon=77.1850,
                    estimated_fare=final_fare
                )
            ],
            estimated_fare_per_passenger=final_fare,
            savings_per_passenger=base_fare - final_fare,
            total_distance_km=45.5,
            estimated_duration_minutes=60
        )
        
        return PoolingResponse(
            matched=True,
            pool_id=pool.pool_id,
            matches=[pool],
            base_fare=base_fare,
            pooling_discount=pooling_discount * 100,
            final_fare=final_fare,
            message=f"Found 1 available pool. Save ₹{base_fare - final_fare} by joining!"
        )
    
    return PoolingResponse(
        matched=False,
        base_fare=base_fare,
        pooling_discount=0,
        final_fare=base_fare,
        message="No available pools at this moment. Standard booking available."
    )

@router.post("/accept-pooling/{pool_id}")
async def accept_pooling_offer(
    pool_id: str,
    passenger_id: str = Query(...)
):
    """Accept a pooling offer"""
    
    return {
        "pool_id": pool_id,
        "passenger_id": passenger_id,
        "status": "ACCEPTED",
        "message": "You've joined a shared ride pool!",
        "pickup_time": (datetime.now() + timedelta(minutes=8)).isoformat(),
        "total_passengers": 2,
        "your_savings": 37.50
    }

@router.get("/active-pools")
async def get_active_pools(
    vehicle_type_id: int = Query(...),
    latitude: float = Query(...),
    longitude: float = Query(...),
    radius_km: float = Query(default=5.0)
):
    """Get active pools in the area"""
    
    return {
        "active_pools": 3,
        "search_area": {
            "center": [latitude, longitude],
            "radius_km": radius_km
        },
        "pools": [
            {
                "pool_id": "POOL_20260530_001",
                "passengers": 2,
                "max_capacity": 3,
                "pickup_time": (datetime.now() + timedelta(minutes=5)).isoformat(),
                "discount_percent": 25
            },
            {
                "pool_id": "POOL_20260530_002",
                "passengers": 1,
                "max_capacity": 4,
                "pickup_time": (datetime.now() + timedelta(minutes=12)).isoformat(),
                "discount_percent": 20
            }
        ]
    }

@router.post("/cancel-pooling/{pool_id}")
async def cancel_pooling(pool_id: str, passenger_id: str = Query(...)):
    """Cancel pooling request"""
    
    return {
        "pool_id": pool_id,
        "status": "CANCELLED",
        "message": "You've been removed from the pool",
        "refund": 0
    }

@router.get("/pooling-savings-estimate")
async def estimate_pooling_savings(
    base_fare: Decimal = Query(200),
    pool_size: int = Query(default=2)
):
    """Estimate savings with pooling"""
    
    # Pooling discounts by pool size
    discount_rates = {
        1: 0.0,
        2: 0.25,  # 25% off for 2 passengers
        3: 0.35,  # 35% off for 3 passengers
        4: 0.40,  # 40% off for 4 passengers
        5: 0.45   # 45% off for 5 passengers
    }
    
    discount_rate = discount_rates.get(pool_size, 0.45)
    discounted_fare = base_fare * Decimal(str(1 - discount_rate))
    savings = base_fare - discounted_fare
    
    return {
        "base_fare": base_fare,
        "pool_size": pool_size,
        "discount_percentage": discount_rate * 100,
        "discounted_fare": round(discounted_fare, 2),
        "savings_per_passenger": round(savings, 2),
        "total_savings": round(savings * pool_size, 2)
    }
