"""
Ride Pooling / Shared Rides System - Production Implementation
Handles ride matching, fare splitting, pool management, and real-time status
"""

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket
from sqlalchemy import Column, String, DateTime, Boolean, JSON, Integer, Float, Enum as SQLEnum, and_, desc, func
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, List, Dict, Any, Set
import hashlib
import math
from collections import defaultdict

# ==================== ENUMS ====================

class PoolStatus(str, Enum):
    SEARCHING = "searching"        # Looking for pool partners
    MATCHED = "matched"            # Found compatible riders
    CONFIRMED = "confirmed"        # All riders confirmed
    IN_PROGRESS = "in_progress"    # Ride started
    COMPLETED = "completed"        # Ride finished
    CANCELLED = "cancelled"        # Cancelled by user
    SYSTEM_CANCELLED = "system_cancelled"  # Cancelled by system


class PoolRole(str, Enum):
    INITIATOR = "initiator"        # Rider who started the pool
    JOINER = "joiner"              # Rider who joined the pool


class PoolPreference(str, Enum):
    PREFER_ALONE = "prefer_alone"           # Don't pool
    WILLING_TO_POOL = "willing_to_pool"    # Accept pools
    PREFER_POOL = "prefer_pool"            # Prefer pooled rides


# ==================== DATABASE MODELS ====================

class RidePool(BaseModel):
    """Main ride pool record"""
    __tablename__ = "ride_pools"

    pool_id = Column(String, primary_key=True)
    initiator_ride_id = Column(String)  # Original ride that started pool

    # Pool details
    status = Column(String(enum=PoolStatus), default=PoolStatus.SEARCHING, index=True)
    driver_id = Column(String, nullable=True)  # Assigned driver
    confirmed_at = Column(DateTime, nullable=True)

    # Location matching
    pool_region = Column(String)  # Geohash for region
    pickup_latitude = Column(Float)
    pickup_longitude = Column(Float)
    dropoff_latitude = Column(Float)
    dropoff_longitude = Column(Float)

    # Pool members
    max_pool_size = Column(Integer, default=4)  # Max riders per pool
    member_count = Column(Integer, default=1)  # Current riders
    rider_ids = Column(JSON, default=[])  # List of rider IDs

    # Pricing
    original_total_fare = Column(Float)  # Before pooling
    pooled_total_fare = Column(Float)  # After pooling savings
    pool_savings = Column(Float)  # Amount saved
    savings_percentage = Column(Float)  # % discount

    # Vehicle
    vehicle_type = Column(String)  # Must match all riders

    # Timing
    created_at = Column(DateTime, default=datetime.utcnow)
    pool_deadline = Column(DateTime)  # When to give up searching (2 min after initiation)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    cancelled_by = Column(String, nullable=True)  # Which rider cancelled


class RidePoolMember(BaseModel):
    """Individual member in a ride pool"""
    __tablename__ = "ride_pool_members"

    member_id = Column(String, primary_key=True)
    pool_id = Column(String, index=True)
    ride_id = Column(String)  # Original ride request
    user_id = Column(String, index=True)

    # Member details
    role = Column(String(enum=PoolRole))  # Initiator or Joiner
    status = Column(String)  # "pending", "confirmed", "completed", "cancelled"

    # Locations
    pickup_latitude = Column(Float)
    pickup_longitude = Column(Float)
    pickup_address = Column(String)
    dropoff_latitude = Column(Float)
    dropoff_longitude = Column(Float)
    dropoff_address = Column(String)

    # Pricing for this member
    original_fare = Column(Float)  # What they'd pay alone
    pooled_fare = Column(Float)  # What they pay in pool
    member_savings = Column(Float)  # Amount saved
    savings_percentage = Column(Float)  # % discount

    # Confirmation
    confirmed_at = Column(DateTime, nullable=True)
    pickup_completed_at = Column(DateTime, nullable=True)
    dropoff_completed_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)


class PoolMatchingScore(BaseModel):
    """Compatibility score between riders"""
    __tablename__ = "pool_matching_scores"

    score_id = Column(String, primary_key=True)
    pool_id = Column(String, index=True)
    candidate_ride_id = Column(String)  # Ride being considered for pool

    # Scoring breakdown
    route_compatibility = Column(Float)  # 0-30 (pickup/dropoff overlap)
    time_compatibility = Column(Float)  # 0-20 (arrival time within 5 min)
    vehicle_match = Column(Float)  # 0-20 (same vehicle type)
    pickup_distance = Column(Float)  # 0-15 (nearby pickups)
    dropoff_distance = Column(Float)  # 0-15 (similar dropoffs)

    total_score = Column(Float)  # 0-100
    should_pool = Column(Boolean)  # Score > 65 = good match

    pickup_distance_km = Column(Float)
    eta_difference_seconds = Column(Integer)

    created_at = Column(DateTime, default=datetime.utcnow)


class PoolPreferenceConfig(BaseModel):
    """User's pool preferences"""
    __tablename__ = "pool_preference_configs"

    config_id = Column(String, primary_key=True)
    user_id = Column(String, index=True, unique=True)

    # Preferences
    pool_preference = Column(String(enum=PoolPreference), default=PoolPreference.WILLING_TO_POOL)
    max_detour_minutes = Column(Integer, default=5)  # Max extra time willing to wait
    max_detour_km = Column(Float, default=2.0)  # Max extra distance
    min_savings_percentage = Column(Integer, default=10)  # Min savings to accept pool

    # Privacy
    share_name = Column(Boolean, default=True)
    share_phone = Column(Boolean, default=False)
    share_rating = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)


class PoolNotification(BaseModel):
    """Track pool-related notifications"""
    __tablename__ = "pool_notifications"

    notification_id = Column(String, primary_key=True)
    pool_id = Column(String, index=True)
    user_id = Column(String, index=True)

    type = Column(String)  # "pool_found", "rider_joined", "pool_confirmed", "driver_assigned"
    title = Column(String)
    body = Column(String)

    sent_at = Column(DateTime, default=datetime.utcnow)


# ==================== REQUEST/RESPONSE MODELS ====================

class PoolMatchResponse:
    pool_id: str
    status: str
    member_count: int
    total_savings: float
    estimated_fare_with_pool: float
    estimated_fare_without_pool: float
    pool_deadline: datetime


class PoolMemberInfo:
    name: str
    rating: float
    vehicle_match: bool
    pickup_distance_km: float
    eta_difference_minutes: int


# ==================== ROUTER ====================

router = APIRouter(prefix="/api/v3/ride-pools", tags=["ride_pools"])

# Active pools being searched
ACTIVE_POOL_SEARCHES: Dict[str, Dict] = {}


# ==================== HELPER FUNCTIONS ====================

def generate_id(prefix: str) -> str:
    return f"{prefix}_{hashlib.md5(f'{datetime.utcnow()}{id(prefix)}'.encode()).hexdigest()[:12]}"


def calculate_geohash_region(latitude: float, longitude: float, precision: int = 5) -> str:
    """Generate geohash for regional matching"""
    # Simplified geohash (production would use proper library)
    return f"{int(latitude * 100)},{int(longitude * 100)}"


def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance using Haversine formula"""
    from math import radians, sin, cos, sqrt, atan2

    R = 6371  # Earth radius in km
    lat1, lon1 = radians(lat1), radians(lon1)
    lat2, lon2 = radians(lat2), radians(lon2)

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    return R * c


def calculate_pool_fare_split(members_count: int, total_distance_km: float,
                            total_duration_minutes: int, vehicle_type: str) -> float:
    """Calculate per-person fare in a pool with savings"""

    # Base calculation: ₹30 + ₹10/km + ₹2/min
    base_fare = 30 * members_count
    distance_fare = total_distance_km * 10
    duration_fare = total_duration_minutes * 2

    total_without_pool = base_fare + distance_fare + duration_fare

    # Savings based on members (25% saving for 2 riders, 35% for 3, 40% for 4+)
    savings_rates = {
        2: 0.25,
        3: 0.35,
        4: 0.40
    }
    savings_rate = savings_rates.get(members_count, 0.40)

    total_with_pool = total_without_pool * (1 - savings_rate)
    per_person_fare = total_with_pool / members_count

    return {
        "total_without_pool": round(total_without_pool, 2),
        "total_with_pool": round(total_with_pool, 2),
        "per_person_fare": round(per_person_fare, 2),
        "savings_per_person": round((total_without_pool / members_count) - per_person_fare, 2),
        "savings_percentage": round(savings_rate * 100, 1)
    }


def calculate_pool_compatibility_score(
    pool_pickup: tuple, pool_dropoff: tuple, pool_eta: datetime,
    candidate_pickup: tuple, candidate_dropoff: tuple, candidate_eta: datetime
) -> Dict:
    """Calculate compatibility score between pool and candidate rider"""

    scores = {}

    # 1. Route Compatibility (0-30)
    # Pickup proximity
    pickup_distance = calculate_distance(
        pool_pickup[0], pool_pickup[1],
        candidate_pickup[0], candidate_pickup[1]
    )
    pickup_score = max(0, 15 - pickup_distance * 3)  # 15 if <0.5km away

    # Dropoff proximity
    dropoff_distance = calculate_distance(
        pool_dropoff[0], pool_dropoff[1],
        candidate_dropoff[0], candidate_dropoff[1]
    )
    dropoff_score = max(0, 15 - dropoff_distance * 3)  # 15 if <0.5km away

    scores['route_compatibility'] = round(pickup_score + dropoff_score, 1)

    # 2. Time Compatibility (0-20)
    # ETA difference
    eta_diff_seconds = abs((candidate_eta - pool_eta).total_seconds())
    eta_diff_minutes = eta_diff_seconds / 60

    if eta_diff_minutes <= 2:
        time_score = 20  # Perfect timing
    elif eta_diff_minutes <= 5:
        time_score = 15
    elif eta_diff_minutes <= 10:
        time_score = 10
    else:
        time_score = 0

    scores['time_compatibility'] = time_score

    # 3. Vehicle Match (0-20) - would need vehicle type from candidate
    scores['vehicle_match'] = 20  # Assume same type

    # 4. Pickup Distance (0-15)
    if pickup_distance <= 0.5:
        scores['pickup_distance'] = 15
    elif pickup_distance <= 1.0:
        scores['pickup_distance'] = 10
    elif pickup_distance <= 2.0:
        scores['pickup_distance'] = 5
    else:
        scores['pickup_distance'] = 0

    # 5. Dropoff Distance (0-15)
    if dropoff_distance <= 0.5:
        scores['dropoff_distance'] = 15
    elif dropoff_distance <= 1.0:
        scores['dropoff_distance'] = 10
    elif dropoff_distance <= 2.0:
        scores['dropoff_distance'] = 5
    else:
        scores['dropoff_distance'] = 0

    total_score = sum(scores.values())
    should_pool = total_score >= 65

    return {
        "scores": scores,
        "total_score": round(total_score, 1),
        "should_pool": should_pool,
        "pickup_distance_km": round(pickup_distance, 2),
        "eta_difference_minutes": round(eta_diff_minutes, 1)
    }


# ==================== ENDPOINTS ====================

@router.post("/initiate-pool")
async def initiate_pool_search(
    ride_id: str,
    user_id: str,
    pickup_lat: float,
    pickup_lon: float,
    pickup_address: str,
    dropoff_lat: float,
    dropoff_lon: float,
    dropoff_address: str,
    vehicle_type: str,
    estimated_fare: float,
    estimated_distance_km: float,
    estimated_duration_minutes: int,
    db: Session = Depends(get_db)
):
    """Initiate a pool search for a ride"""

    # Check user preferences
    prefs = db.query(PoolPreferenceConfig).filter_by(user_id=user_id).first()

    if prefs and prefs.pool_preference == PoolPreference.PREFER_ALONE:
        return {
            "pool_id": None,
            "status": "no_pool",
            "message": "User prefers not to pool"
        }

    # Create pool
    pool_id = generate_id("pool")
    geohash = calculate_geohash_region(pickup_lat, pickup_lon)
    pool_deadline = datetime.utcnow() + timedelta(minutes=2)

    pool = RidePool(
        pool_id=pool_id,
        initiator_ride_id=ride_id,
        status=PoolStatus.SEARCHING,
        pool_region=geohash,
        pickup_latitude=pickup_lat,
        pickup_longitude=pickup_lon,
        dropoff_latitude=dropoff_lat,
        dropoff_longitude=dropoff_lon,
        vehicle_type=vehicle_type,
        original_total_fare=estimated_fare,
        pool_deadline=pool_deadline,
        member_count=1
    )
    db.add(pool)

    # Add initiator as member
    member_id = generate_id("member")
    member = RidePoolMember(
        member_id=member_id,
        pool_id=pool_id,
        ride_id=ride_id,
        user_id=user_id,
        role=PoolRole.INITIATOR,
        status="pending",
        pickup_latitude=pickup_lat,
        pickup_longitude=pickup_lon,
        pickup_address=pickup_address,
        dropoff_latitude=dropoff_lat,
        dropoff_longitude=dropoff_lon,
        dropoff_address=dropoff_address,
        original_fare=estimated_fare,
        pooled_fare=estimated_fare
    )
    db.add(member)
    pool.rider_ids = [user_id]

    db.commit()

    # Calculate fare with potential pool savings (2-4 riders)
    fare_with_2 = calculate_pool_fare_split(2, estimated_distance_km, estimated_duration_minutes, vehicle_type)
    fare_with_3 = calculate_pool_fare_split(3, estimated_distance_km, estimated_duration_minutes, vehicle_type)
    fare_with_4 = calculate_pool_fare_split(4, estimated_distance_km, estimated_duration_minutes, vehicle_type)

    # Store in pool for reference
    ACTIVE_POOL_SEARCHES[pool_id] = {
        "user_id": user_id,
        "ride_id": ride_id,
        "pickup": (pickup_lat, pickup_lon),
        "dropoff": (dropoff_lat, dropoff_lon),
        "vehicle_type": vehicle_type,
        "deadline": pool_deadline,
        "candidates": []
    }

    return {
        "pool_id": pool_id,
        "status": PoolStatus.SEARCHING,
        "message": "Searching for pool partners...",
        "potential_savings": {
            "with_2_riders": fare_with_2,
            "with_3_riders": fare_with_3,
            "with_4_riders": fare_with_4
        },
        "pool_deadline": pool_deadline.isoformat()
    }


@router.post("/find-compatible-rides")
async def find_compatible_pools(
    ride_id: str,
    user_id: str,
    pickup_lat: float,
    pickup_lon: float,
    dropoff_lat: float,
    dropoff_lon: float,
    vehicle_type: str,
    estimated_eta: datetime,
    db: Session = Depends(get_db)
):
    """Find compatible pools for a new ride request"""

    geohash = calculate_geohash_region(pickup_lat, pickup_lon)

    # Find active pools in same region
    compatible_pools = db.query(RidePool).filter(
        RidePool.pool_region == geohash,
        RidePool.status == PoolStatus.SEARCHING,
        RidePool.vehicle_type == vehicle_type,
        RidePool.member_count < RidePool.max_pool_size,
        RidePool.pool_deadline > datetime.utcnow()
    ).all()

    matches = []

    for pool in compatible_pools:
        # Calculate compatibility
        compatibility = calculate_pool_compatibility_score(
            (pool.pickup_latitude, pool.pickup_longitude),
            (pool.dropoff_latitude, pool.dropoff_longitude),
            pool.created_at + timedelta(minutes=10),  # Estimated pool ETA
            (pickup_lat, pickup_lon),
            (dropoff_lat, dropoff_lon),
            estimated_eta
        )

        if compatibility['should_pool']:
            matches.append({
                "pool_id": pool.pool_id,
                "score": compatibility['total_score'],
                "member_count": pool.member_count,
                "potential_savings": compatibility,
                "compatibility_breakdown": compatibility['scores']
            })

    # Sort by score (highest first)
    matches.sort(key=lambda x: x['score'], reverse=True)

    return {
        "ride_id": ride_id,
        "compatible_pools": matches[:5],  # Top 5 matches
        "message": f"Found {len(matches)} compatible pools"
    }


@router.post("/join-pool/{pool_id}")
async def join_pool(
    pool_id: str,
    ride_id: str,
    user_id: str,
    pickup_lat: float,
    pickup_lon: float,
    pickup_address: str,
    dropoff_lat: float,
    dropoff_lon: float,
    dropoff_address: str,
    estimated_fare: float,
    db: Session = Depends(get_db)
):
    """Join an existing pool"""

    pool = db.query(RidePool).filter_by(pool_id=pool_id).first()

    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")

    if pool.status != PoolStatus.SEARCHING:
        raise HTTPException(status_code=400, detail=f"Pool status is {pool.status}")

    if pool.member_count >= pool.max_pool_size:
        raise HTTPException(status_code=400, detail="Pool is full")

    # Add member
    member_id = generate_id("member")
    member = RidePoolMember(
        member_id=member_id,
        pool_id=pool_id,
        ride_id=ride_id,
        user_id=user_id,
        role=PoolRole.JOINER,
        status="pending",
        pickup_latitude=pickup_lat,
        pickup_longitude=pickup_lon,
        pickup_address=pickup_address,
        dropoff_latitude=dropoff_lat,
        dropoff_longitude=dropoff_lon,
        dropoff_address=dropoff_address,
        original_fare=estimated_fare,
        pooled_fare=estimated_fare
    )
    db.add(member)

    # Update pool
    pool.member_count += 1
    pool.rider_ids.append(user_id)

    # Calculate fare split for all members
    all_members = db.query(RidePoolMember).filter_by(pool_id=pool_id).all()
    total_distance = calculate_distance(
        pool.pickup_latitude, pool.pickup_longitude,
        pool.dropoff_latitude, pool.dropoff_longitude
    )
    total_duration = 15  # Simplified estimate

    fare_split = calculate_pool_fare_split(
        pool.member_count,
        total_distance,
        total_duration,
        pool.vehicle_type
    )

    # Update all members' fares
    per_person_fare = fare_split['per_person_fare']
    for m in all_members:
        m.pooled_fare = per_person_fare
        m.member_savings = m.original_fare - per_person_fare
        m.savings_percentage = (m.member_savings / m.original_fare * 100) if m.original_fare > 0 else 0

    pool.pooled_total_fare = fare_split['total_with_pool']
    pool.pool_savings = fare_split['total_without_pool'] - fare_split['total_with_pool']
    pool.savings_percentage = fare_split['savings_percentage']

    db.commit()

    return {
        "pool_id": pool_id,
        "status": PoolStatus.SEARCHING,
        "member_count": pool.member_count,
        "per_person_fare": per_person_fare,
        "member_savings": fare_split['total_without_pool'] / pool.member_count - per_person_fare,
        "savings_percentage": fare_split['savings_percentage'],
        "message": f"Joined pool! Saving ₹{fare_split['total_without_pool'] / pool.member_count - per_person_fare:.2f}"
    }


@router.get("/pool-status/{pool_id}")
async def get_pool_status(pool_id: str, db: Session = Depends(get_db)):
    """Get current status of a pool"""

    pool = db.query(RidePool).filter_by(pool_id=pool_id).first()

    if not pool:
        raise HTTPException(status_code=404, detail="Pool not found")

    members = db.query(RidePoolMember).filter_by(pool_id=pool_id).all()

    return {
        "pool_id": pool_id,
        "status": pool.status,
        "member_count": pool.member_count,
        "max_pool_size": pool.max_pool_size,
        "total_fare_without_pool": pool.original_total_fare,
        "total_fare_with_pool": pool.pooled_total_fare,
        "total_savings": pool.pool_savings,
        "savings_percentage": pool.savings_percentage,
        "driver_id": pool.driver_id,
        "members": [
            {
                "user_id": m.user_id,
                "role": m.role,
                "status": m.status,
                "pickup_address": m.pickup_address,
                "dropoff_address": m.dropoff_address,
                "fare": m.pooled_fare,
                "savings": m.member_savings
            }
            for m in members
        ]
    }


@router.post("/set-pool-preferences/{user_id}")
async def set_pool_preferences(
    user_id: str,
    pool_preference: str = PoolPreference.WILLING_TO_POOL,
    max_detour_minutes: int = 5,
    max_detour_km: float = 2.0,
    min_savings_percentage: int = 10,
    db: Session = Depends(get_db)
):
    """Set user's pool preferences"""

    config = db.query(PoolPreferenceConfig).filter_by(user_id=user_id).first()

    if not config:
        config_id = generate_id("poolpref")
        config = PoolPreferenceConfig(
            config_id=config_id,
            user_id=user_id,
            pool_preference=pool_preference,
            max_detour_minutes=max_detour_minutes,
            max_detour_km=max_detour_km,
            min_savings_percentage=min_savings_percentage
        )
        db.add(config)
    else:
        config.pool_preference = pool_preference
        config.max_detour_minutes = max_detour_minutes
        config.max_detour_km = max_detour_km
        config.min_savings_percentage = min_savings_percentage

    db.commit()

    return {
        "status": "success",
        "pool_preference": pool_preference,
        "message": "Pool preferences saved"
    }


@router.get("/pool-preferences/{user_id}")
async def get_pool_preferences(user_id: str, db: Session = Depends(get_db)):
    """Get user's pool preferences"""

    config = db.query(PoolPreferenceConfig).filter_by(user_id=user_id).first()

    if not config:
        return {
            "pool_preference": PoolPreference.WILLING_TO_POOL,
            "max_detour_minutes": 5,
            "max_detour_km": 2.0,
            "min_savings_percentage": 10
        }

    return {
        "pool_preference": config.pool_preference,
        "max_detour_minutes": config.max_detour_minutes,
        "max_detour_km": config.max_detour_km,
        "min_savings_percentage": config.min_savings_percentage,
        "share_name": config.share_name,
        "share_phone": config.share_phone,
        "share_rating": config.share_rating
    }


@router.get("/pool-savings-estimate")
async def get_pool_savings_estimate(
    distance_km: float,
    duration_minutes: int,
    riders_count: int = 2
):
    """Estimate fare savings with pooling"""

    estimates = {
        2: calculate_pool_fare_split(2, distance_km, duration_minutes, "economy"),
        3: calculate_pool_fare_split(3, distance_km, duration_minutes, "economy"),
        4: calculate_pool_fare_split(4, distance_km, duration_minutes, "economy")
    }

    return {
        "distance_km": distance_km,
        "duration_minutes": duration_minutes,
        "estimates_by_riders": estimates
    }


@router.websocket("/ws/pool-status/{pool_id}/{user_id}")
async def websocket_pool_status(websocket: WebSocket, pool_id: str, user_id: str, db: Session = Depends(get_db)):
    """WebSocket for real-time pool status updates"""

    await websocket.accept()

    try:
        while True:
            # Get pool status
            pool = db.query(RidePool).filter_by(pool_id=pool_id).first()

            if not pool:
                await websocket.send_json({"error": "Pool not found"})
                break

            # Send status update
            await websocket.send_json({
                "pool_id": pool_id,
                "status": pool.status,
                "member_count": pool.member_count,
                "total_savings": pool.pool_savings,
                "savings_percentage": pool.savings_percentage,
                "driver_id": pool.driver_id,
                "updated_at": datetime.utcnow().isoformat()
            })

            # Check if pool is done searching
            if pool.status != PoolStatus.SEARCHING or pool.pool_deadline < datetime.utcnow():
                break

            # Update every 5 seconds
            import asyncio
            await asyncio.sleep(5)

    except Exception as e:
        print(f"WebSocket error: {e}")
    finally:
        await websocket.close()
