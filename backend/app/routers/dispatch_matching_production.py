"""
Production Dispatch Algorithm - Real-time driver matching with WebSocket broadcasting
Implements multi-factor scoring: distance (30%), rating (20%), acceptance rate (15%), vehicle (20%), ETA (15%)
"""

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Set
import json
import asyncio
import logging
import math
import uuid
from pydantic import BaseModel, Field

from app.database import get_db
from app.utils.time_helpers import get_ist_now

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v3/dispatch", tags=["Dispatch Matching"])

# ============================================================================
# DATABASE MODELS
# ============================================================================

from sqlalchemy import Column, String, Float, DateTime, Integer, Boolean, JSON, Enum as SQLEnum
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class DispatchOffer(Base):
    """Track ride offers sent to drivers"""
    __tablename__ = "dispatch_offers"

    offer_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    ride_id = Column(String, index=True, nullable=False)
    driver_id = Column(String, index=True, nullable=False)
    passenger_id = Column(String, nullable=False)

    pickup_lat = Column(Float, nullable=False)
    pickup_lng = Column(Float, nullable=False)
    dropoff_lat = Column(Float, nullable=False)
    dropoff_lng = Column(Float, nullable=False)

    match_score = Column(Float)  # 0-100
    distance_km = Column(Float)  # From driver to pickup
    eta_minutes = Column(Float)

    # Scoring breakdown
    distance_score = Column(Float)     # 0-30
    rating_score = Column(Float)       # 0-20
    acceptance_rate_score = Column(Float)  # 0-15
    vehicle_score = Column(Float)      # 0-20
    eta_score = Column(Float)          # 0-15

    status = Column(String, default="PENDING")  # PENDING, ACCEPTED, DECLINED, EXPIRED
    offered_at = Column(DateTime, default=lambda: get_ist_now(), index=True)
    response_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, index=True)

    decline_reason = Column(String, nullable=True)  # Why driver declined

class DispatchSession(Base):
    """Track ride dispatch in progress"""
    __tablename__ = "dispatch_sessions"

    session_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    ride_id = Column(String, unique=True, index=True, nullable=False)
    passenger_id = Column(String, nullable=False)

    pickup_lat = Column(Float, nullable=False)
    pickup_lng = Column(Float, nullable=False)
    dropoff_lat = Column(Float, nullable=False)
    dropoff_lng = Column(Float, nullable=False)

    status = Column(String, default="SEARCHING")  # SEARCHING, OFFERED, ACCEPTED, MATCHED, EXPIRED

    # Top candidates evaluated
    top_candidates = Column(JSON)  # List of top 5 driver IDs
    accepted_driver_id = Column(String, nullable=True)

    created_at = Column(DateTime, default=lambda: get_ist_now())
    expires_at = Column(DateTime, index=True)  # Auto-expire search after 2 minutes

# ============================================================================
# SCHEMAS
# ============================================================================

class DriverLocation(BaseModel):
    driver_id: str
    latitude: float
    longitude: float
    rating: float = Field(default=4.5)
    acceptance_rate: float = Field(default=95.0)  # 0-100
    vehicle_type: str
    current_passengers: int = Field(default=0)
    is_available: bool = True

class RideRequest(BaseModel):
    ride_id: str
    passenger_id: str
    passenger_rating: Optional[float] = None
    pickup_lat: float
    pickup_lng: float
    dropoff_lat: float
    dropoff_lng: float
    vehicle_type: str = "auto"
    preferred_drivers: Optional[List[str]] = None

class MatchScore(BaseModel):
    driver_id: str
    match_score: float  # 0-100
    distance_km: float
    eta_minutes: float
    distance_score: float
    rating_score: float
    acceptance_rate_score: float
    vehicle_score: float
    eta_score: float
    reasons: List[str]

class DispatchResponse(BaseModel):
    ride_id: str
    top_candidates: List[MatchScore]
    dispatch_started_at: str
    expires_in_seconds: int = 12

# ============================================================================
# WEBSOCKET CONNECTION MANAGEMENT
# ============================================================================

class DispatchConnectionManager:
    """Manages driver WebSocket connections for dispatch offers"""

    def __init__(self):
        # ride_id → {driver_id: websocket}
        self.driver_connections: Dict[str, Dict[str, WebSocket]] = {}
        # Driver location cache for quick matching
        self.driver_locations: Dict[str, DriverLocation] = {}

    async def register_driver_for_ride(
        self,
        ride_id: str,
        driver_id: str,
        websocket: WebSocket
    ):
        """Register driver WebSocket for ride dispatch"""
        await websocket.accept()

        if ride_id not in self.driver_connections:
            self.driver_connections[ride_id] = {}

        self.driver_connections[ride_id][driver_id] = websocket
        logger.info(f"Driver {driver_id} registered for dispatch on ride {ride_id}")

    async def broadcast_offer_to_drivers(
        self,
        ride_id: str,
        driver_ids: List[str],
        offer_data: dict
    ) -> int:
        """
        Broadcast offer to multiple drivers
        Returns count of drivers who received offer
        """
        delivered = 0

        if ride_id not in self.driver_connections:
            logger.warning(f"No drivers registered for ride {ride_id}")
            return 0

        disconnected = []

        for driver_id in driver_ids:
            socket = self.driver_connections[ride_id].get(driver_id)
            if not socket:
                continue

            try:
                await socket.send_json(offer_data)
                delivered += 1
            except Exception as e:
                logger.error(f"Error sending offer to driver {driver_id}: {e}")
                disconnected.append(driver_id)

        # Clean up disconnected drivers
        for driver_id in disconnected:
            del self.driver_connections[ride_id][driver_id]

        return delivered

    def unregister_driver(self, ride_id: str, driver_id: str):
        """Unregister driver for this ride"""
        if ride_id in self.driver_connections:
            self.driver_connections[ride_id].pop(driver_id, None)

dispatch_connection_manager = DispatchConnectionManager()

# ============================================================================
# MATCHING ALGORITHM
# ============================================================================

def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two coordinates in km"""
    R = 6371
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)

    a = math.sin(delta_lat / 2) ** 2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))

    return R * c

def calculate_distance_score(distance_km: float) -> float:
    """
    Distance scoring (max 30 points)
    Exponential decay: closer drivers score higher
    """
    if distance_km <= 0.5:
        return 30.0
    elif distance_km <= 2:
        return 30 * (1 - distance_km / 4)
    elif distance_km <= 10:
        return 30 * math.exp(-distance_km / 5)
    else:
        return 1.0

def calculate_rating_score(rating: float) -> float:
    """
    Rating scoring (max 20 points)
    Linear from 0-5 stars
    """
    if rating < 2.0:
        return 0.0
    return min(20.0, (rating / 5.0) * 20)

def calculate_acceptance_rate_score(acceptance_rate: float) -> float:
    """
    Acceptance rate scoring (max 15 points)
    >95% = 15 points, degrading linearly
    """
    if acceptance_rate < 70:
        return 0.0
    return min(15.0, ((acceptance_rate - 70) / 25) * 15)

def calculate_vehicle_score(vehicle_type: str, current_passengers: int, requested_type: str) -> float:
    """
    Vehicle scoring (max 20 points)
    Exact match = 20, accepts pooling = 15, mismatch = 0
    """
    if vehicle_type.lower() == requested_type.lower():
        if current_passengers == 0:
            return 20.0
        else:
            return 15.0  # Already has passengers but available
    return 0.0

def calculate_eta_score(eta_minutes: float) -> float:
    """
    ETA scoring (max 15 points)
    <5 min = 15 points, degrading linearly to 0 at 15 min
    """
    if eta_minutes <= 0:
        return 15.0
    if eta_minutes >= 15:
        return 0.0
    return 15 * (1 - eta_minutes / 15)

def calculate_match_score(
    driver: DriverLocation,
    ride_request: RideRequest,
    db: Session
) -> tuple[float, dict]:
    """
    Calculate total match score and breakdown
    Returns (score, breakdown_dict)
    """
    distance_km = haversine_distance(
        driver.latitude, driver.longitude,
        ride_request.pickup_lat, ride_request.pickup_lng
    )
    eta_minutes = (distance_km / 25) * 60  # Assume 25 km/h average

    # Calculate component scores
    distance_score = calculate_distance_score(distance_km)
    rating_score = calculate_rating_score(driver.rating)
    acceptance_score = calculate_acceptance_rate_score(driver.acceptance_rate)
    vehicle_score = calculate_vehicle_score(
        driver.vehicle_type,
        driver.current_passengers,
        ride_request.vehicle_type
    )
    eta_score = calculate_eta_score(eta_minutes)

    # Weighted total (30% + 20% + 15% + 20% + 15% = 100%)
    total_score = (
        distance_score * 0.30 +
        rating_score * 0.20 +
        acceptance_score * 0.15 +
        vehicle_score * 0.20 +
        eta_score * 0.15
    )

    return total_score, {
        "distance_score": distance_score,
        "rating_score": rating_score,
        "acceptance_rate_score": acceptance_score,
        "vehicle_score": vehicle_score,
        "eta_score": eta_score,
        "distance_km": distance_km,
        "eta_minutes": eta_minutes
    }

def find_top_drivers(
    ride_request: RideRequest,
    available_drivers: List[DriverLocation],
    db: Session,
    top_n: int = 5
) -> List[MatchScore]:
    """
    Find top N drivers by match score
    """
    matches: List[tuple[MatchScore, dict]] = []

    for driver in available_drivers:
        score, breakdown = calculate_match_score(driver, ride_request, db)

        reasons = []
        if breakdown["distance_km"] <= 1:
            reasons.append("Very close")
        if driver.rating >= 4.8:
            reasons.append("Highly rated")
        if driver.acceptance_rate >= 98:
            reasons.append("Reliable driver")
        if driver.current_passengers == 0:
            reasons.append("No current passengers")

        match = MatchScore(
            driver_id=driver.driver_id,
            match_score=round(score, 1),
            distance_km=round(breakdown["distance_km"], 2),
            eta_minutes=round(breakdown["eta_minutes"], 1),
            distance_score=round(breakdown["distance_score"], 1),
            rating_score=round(breakdown["rating_score"], 1),
            acceptance_rate_score=round(breakdown["acceptance_rate_score"], 1),
            vehicle_score=round(breakdown["vehicle_score"], 1),
            eta_score=round(breakdown["eta_score"], 1),
            reasons=reasons
        )

        matches.append(match)

    # Sort by score descending
    matches.sort(key=lambda x: x.match_score, reverse=True)

    return matches[:top_n]

# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/match-ride")
async def match_ride(request: RideRequest, db: Session = Depends(get_db)):
    """
    Find top driver matches for a ride request
    Uses multi-factor algorithm to score drivers
    """
    # Check if dispatch session already exists
    existing_session = db.query(DispatchSession).filter(
        DispatchSession.ride_id == request.ride_id
    ).first()

    if existing_session:
        raise HTTPException(status_code=400, detail="Dispatch already in progress for this ride")

    # Get available drivers from real-time location tracking
    # In production, integrate with realtime_tracking_production.py
    # For now, fetch from mock driver location data
    available_drivers = [
        DriverLocation(
            driver_id="driver_1",
            latitude=request.pickup_lat + 0.01,
            longitude=request.pickup_lng + 0.01,
            rating=4.8,
            acceptance_rate=98,
            vehicle_type="auto"
        ),
        DriverLocation(
            driver_id="driver_2",
            latitude=request.pickup_lat - 0.02,
            longitude=request.pickup_lng + 0.01,
            rating=4.5,
            acceptance_rate=95,
            vehicle_type="auto"
        ),
        DriverLocation(
            driver_id="driver_3",
            latitude=request.pickup_lat + 0.03,
            longitude=request.pickup_lng - 0.02,
            rating=4.6,
            acceptance_rate=92,
            vehicle_type="sedan"
        ),
    ]

    # Find top matches
    top_matches = find_top_drivers(request, available_drivers, db, top_n=5)

    if not top_matches:
        raise HTTPException(status_code=404, detail="No available drivers nearby")

    # Create dispatch session
    session = DispatchSession(
        session_id=str(uuid.uuid4()),
        ride_id=request.ride_id,
        passenger_id=request.passenger_id,
        pickup_lat=request.pickup_lat,
        pickup_lng=request.pickup_lng,
        dropoff_lat=request.dropoff_lat,
        dropoff_lng=request.dropoff_lng,
        status="OFFERED",
        top_candidates=[m.driver_id for m in top_matches],
        expires_at=get_ist_now() + timedelta(seconds=12)
    )

    db.add(session)
    db.commit()
    db.refresh(session)

    logger.info(f"Dispatch session created for ride {request.ride_id}: {len(top_matches)} candidates")

    return DispatchResponse(
        ride_id=request.ride_id,
        top_candidates=top_matches,
        dispatch_started_at=get_ist_now().isoformat(),
        expires_in_seconds=12
    )

@router.post("/offer-response/{ride_id}/{driver_id}")
async def driver_response(
    ride_id: str,
    driver_id: str,
    response: dict,
    db: Session = Depends(get_db)
):
    """
    Handle driver's response to ride offer (accept/decline)
    First driver to accept gets the ride
    """
    offer = db.query(DispatchOffer).filter(
        and_(
            DispatchOffer.ride_id == ride_id,
            DispatchOffer.driver_id == driver_id,
            DispatchOffer.status == "PENDING"
        )
    ).first()

    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found or already responded")

    if response.get("accepted"):
        # ACCEPT: Mark as accepted
        offer.status = "ACCEPTED"
        offer.response_at = get_ist_now()

        # Get dispatch session and mark as MATCHED
        session = db.query(DispatchSession).filter(
            DispatchSession.ride_id == ride_id
        ).first()

        if session:
            session.status = "MATCHED"
            session.accepted_driver_id = driver_id

            # Auto-decline all other offers for this ride (first-accept-wins)
            other_offers = db.query(DispatchOffer).filter(
                and_(
                    DispatchOffer.ride_id == ride_id,
                    DispatchOffer.driver_id != driver_id,
                    DispatchOffer.status == "PENDING"
                )
            ).all()

            for other_offer in other_offers:
                other_offer.status = "DECLINED"
                other_offer.response_at = get_ist_now()
                other_offer.decline_reason = "Another driver accepted"

        db.commit()

        logger.info(f"Driver {driver_id} accepted ride {ride_id}")

        return {
            "status": "accepted",
            "ride_id": ride_id,
            "driver_id": driver_id,
            "message": "Ride matched successfully"
        }

    else:
        # DECLINE: Mark as declined
        offer.status = "DECLINED"
        offer.response_at = get_ist_now()
        offer.decline_reason = response.get("reason", "No reason provided")

        db.commit()

        logger.info(f"Driver {driver_id} declined ride {ride_id}: {offer.decline_reason}")

        # Check if all offers declined
        session = db.query(DispatchSession).filter(
            DispatchSession.ride_id == ride_id
        ).first()

        if session:
            pending_count = db.query(DispatchOffer).filter(
                and_(
                    DispatchOffer.ride_id == ride_id,
                    DispatchOffer.status == "PENDING"
                )
            ).count()

            if pending_count == 0:
                session.status = "EXPIRED"
                db.commit()

        return {
            "status": "declined",
            "ride_id": ride_id,
            "driver_id": driver_id,
            "message": "Offer declined, trying next driver"
        }

@router.get("/dispatch-status/{ride_id}")
async def get_dispatch_status(ride_id: str, db: Session = Depends(get_db)):
    """
    Get current dispatch status for a ride
    """
    session = db.query(DispatchSession).filter(
        DispatchSession.ride_id == ride_id
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Dispatch session not found")

    # Get all offers for this ride
    offers = db.query(DispatchOffer).filter(
        DispatchOffer.ride_id == ride_id
    ).order_by(DispatchOffer.offered_at).all()

    return {
        "ride_id": ride_id,
        "session_status": session.status,
        "accepted_driver_id": session.accepted_driver_id,
        "total_offers_sent": len(offers),
        "accepted_count": sum(1 for o in offers if o.status == "ACCEPTED"),
        "declined_count": sum(1 for o in offers if o.status == "DECLINED"),
        "pending_count": sum(1 for o in offers if o.status == "PENDING"),
        "created_at": session.created_at.isoformat(),
        "expires_at": session.expires_at.isoformat(),
        "offers": [
            {
                "driver_id": o.driver_id,
                "status": o.status,
                "match_score": o.match_score,
                "distance_km": o.distance_km,
                "eta_minutes": o.eta_minutes,
                "offered_at": o.offered_at.isoformat(),
                "response_at": o.response_at.isoformat() if o.response_at else None
            }
            for o in offers
        ]
    }

@router.get("/driver-metrics")
async def get_driver_metrics(
    driver_id: str = Query(...),
    days: int = Query(30, ge=1, le=90),
    db: Session = Depends(get_db)
):
    """
    Get driver performance metrics for matching decisions
    """
    since = get_ist_now() - timedelta(days=days)

    # Query from dispatch offers
    total_offers = db.query(func.count(DispatchOffer.offer_id)).filter(
        and_(
            DispatchOffer.driver_id == driver_id,
            DispatchOffer.offered_at >= since
        )
    ).scalar() or 0

    accepted_offers = db.query(func.count(DispatchOffer.offer_id)).filter(
        and_(
            DispatchOffer.driver_id == driver_id,
            DispatchOffer.status == "ACCEPTED",
            DispatchOffer.offered_at >= since
        )
    ).scalar() or 0

    acceptance_rate = (accepted_offers / total_offers * 100) if total_offers > 0 else 100

    return {
        "driver_id": driver_id,
        "period_days": days,
        "total_offers": total_offers,
        "accepted": accepted_offers,
        "declined": total_offers - accepted_offers,
        "acceptance_rate": round(acceptance_rate, 1),
        "average_match_score": 85.0,  # TODO: Query actual scores
        "reliability_score": round(min(100, acceptance_rate * 1.1), 1)
    }

@router.post("/broadcast-to-drivers/{ride_id}")
async def broadcast_offer(
    ride_id: str,
    driver_ids: List[str],
    offer_data: dict,
    db: Session = Depends(get_db)
):
    """
    Broadcast ride offer to multiple drivers via WebSocket
    """
    delivered = await dispatch_connection_manager.broadcast_offer_to_drivers(
        ride_id,
        driver_ids,
        offer_data
    )

    # Create dispatch offers in database
    for driver_id in driver_ids:
        offer = DispatchOffer(
            offer_id=str(uuid.uuid4()),
            ride_id=ride_id,
            driver_id=driver_id,
            passenger_id=offer_data.get("passenger_id"),
            pickup_lat=offer_data.get("pickup_lat"),
            pickup_lng=offer_data.get("pickup_lng"),
            dropoff_lat=offer_data.get("dropoff_lat"),
            dropoff_lng=offer_data.get("dropoff_lng"),
            match_score=offer_data.get("match_score"),
            distance_km=offer_data.get("distance_km"),
            eta_minutes=offer_data.get("eta_minutes"),
            expires_at=get_ist_now() + timedelta(seconds=12)
        )
        db.add(offer)

    db.commit()

    logger.info(f"Broadcast ride {ride_id} to {delivered}/{len(driver_ids)} drivers")

    return {
        "ride_id": ride_id,
        "drivers_targeted": len(driver_ids),
        "drivers_delivered": delivered,
        "timestamp": get_ist_now().isoformat()
    }

@router.websocket("/ws/{ride_id}/driver-dispatch/{driver_id}")
async def driver_dispatch_websocket(
    websocket: WebSocket,
    ride_id: str,
    driver_id: str,
    db: Session = Depends(get_db)
):
    """
    WebSocket endpoint for drivers to receive dispatch offers
    Stays open to receive offers for available rides
    """
    try:
        await dispatch_connection_manager.register_driver_for_ride(
            ride_id,
            driver_id,
            websocket
        )

        while True:
            # Listen for driver responses (accept/decline)
            data = await websocket.receive_text()
            response_data = json.loads(data)

            # Handle response via HTTP for now (can be WebSocket-native later)
            if response_data.get("action") == "respond":
                logger.info(f"Driver {driver_id} responded: {response_data}")
            else:
                # Keep-alive ping
                await websocket.send_json({
                    "type": "pong",
                    "timestamp": get_ist_now().isoformat()
                })

    except WebSocketDisconnect:
        logger.info(f"Driver {driver_id} disconnected from dispatch for ride {ride_id}")
        dispatch_connection_manager.unregister_driver(ride_id, driver_id)
    except Exception as e:
        logger.error(f"WebSocket error in dispatch: {e}")
    finally:
        dispatch_connection_manager.unregister_driver(ride_id, driver_id)
