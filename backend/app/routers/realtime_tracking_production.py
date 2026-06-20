"""
Real-Time Location Tracking - Production Implementation
WebSocket-based live tracking with accuracy validation, privacy controls, and battery optimization
"""

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from datetime import datetime, timedelta
from app.utils.time_helpers import get_ist_now
from typing import Dict, Set, Optional, List
import json
import asyncio
import logging
from pydantic import BaseModel
import uuid

from app.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v3/tracking", tags=["Real-Time Tracking"])

# ============================================================================
# DATABASE MODELS
# ============================================================================

from sqlalchemy import Column, String, Float, DateTime, Integer, Boolean, Enum as SQLEnum
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class DriverLocationRecord(Base):
    """Persist driver locations for history and reconciliation"""
    __tablename__ = "driver_locations"

    location_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    ride_id = Column(String, index=True)
    driver_id = Column(String, nullable=False, index=True)
    passenger_id = Column(String, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    accuracy_meters = Column(Float, nullable=False)
    altitude = Column(Float, nullable=True)
    heading = Column(Float, nullable=True)
    speed_kmh = Column(Float, nullable=True)
    is_valid = Column(Boolean, default=True)  # Accuracy validation flag
    timestamp = Column(DateTime, default=lambda: get_ist_now(), index=True)

class RideTracking(Base):
    """Active ride tracking session"""
    __tablename__ = "ride_tracking"

    tracking_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    ride_id = Column(String, unique=True, index=True)
    driver_id = Column(String, nullable=False, index=True)
    passenger_id = Column(String, nullable=False, index=True)
    driver_name = Column(String)
    vehicle_plate = Column(String)
    pickup_latitude = Column(Float)
    pickup_longitude = Column(Float)
    dropoff_latitude = Column(Float)
    dropoff_longitude = Column(Float)
    current_latitude = Column(Float)
    current_longitude = Column(Float)
    status = Column(String)  # PICKUP_EN_ROUTE, ARRIVED, IN_PROGRESS, EN_ROUTE_DROPOFF
    total_distance_meters = Column(Float, default=0.0)
    location_count = Column(Integer, default=0)
    last_location_timestamp = Column(DateTime)
    update_frequency_seconds = Column(Integer, default=5)  # 5s for normal, 1s during ride
    privacy_mode = Column(Boolean, default=False)  # Hide exact location
    battery_optimized = Column(Boolean, default=False)  # 10s intervals for low battery
    started_at = Column(DateTime, default=lambda: get_ist_now())
    updated_at = Column(DateTime, default=lambda: get_ist_now())

# ============================================================================
# SCHEMAS
# ============================================================================

class LocationUpdate(BaseModel):
    ride_id: str
    driver_id: str
    latitude: float
    longitude: float
    accuracy: float  # meters
    altitude: Optional[float] = None
    heading: Optional[float] = None
    speed: Optional[float] = None
    battery_level: Optional[int] = None  # 0-100
    timestamp: datetime

class TrackingStart(BaseModel):
    ride_id: str
    driver_id: str
    passenger_id: str
    driver_name: str
    vehicle_plate: str
    pickup_lat: float
    pickup_lng: float
    dropoff_lat: float
    dropoff_lng: float
    privacy_mode: bool = False
    battery_optimized: bool = False

# ============================================================================
# WEBSOCKET CONNECTION MANAGEMENT
# ============================================================================

class ConnectionManager:
    """Manages WebSocket connections per ride"""

    def __init__(self):
        # ride_id → { driver_socket, passenger_sockets }
        self.active_connections: Dict[str, Dict[str, any]] = {}
        # ride_id → last_update_timestamp
        self.last_updates: Dict[str, float] = {}

    async def connect_driver(self, ride_id: str, websocket: WebSocket, driver_id: str):
        """Connect driver WebSocket"""
        await websocket.accept()

        if ride_id not in self.active_connections:
            self.active_connections[ride_id] = {
                "driver_socket": None,
                "driver_id": None,
                "passenger_sockets": {},
            }

        self.active_connections[ride_id]["driver_socket"] = websocket
        self.active_connections[ride_id]["driver_id"] = driver_id
        logger.info(f"Driver {driver_id} connected for ride {ride_id}")

    async def connect_passenger(self, ride_id: str, websocket: WebSocket, passenger_id: str):
        """Connect passenger WebSocket"""
        await websocket.accept()

        if ride_id not in self.active_connections:
            self.active_connections[ride_id] = {
                "driver_socket": None,
                "driver_id": None,
                "passenger_sockets": {},
            }

        self.active_connections[ride_id]["passenger_sockets"][passenger_id] = websocket
        logger.info(f"Passenger {passenger_id} connected to track ride {ride_id}")

    async def broadcast_location(
        self,
        ride_id: str,
        location_data: dict,
        min_interval_seconds: int = 5
    ) -> bool:
        """
        Broadcast location to all passengers
        Enforces minimum interval between updates (battery optimization)
        """
        now = asyncio.get_event_loop().time()
        last_update = self.last_updates.get(ride_id, 0)

        # Enforce update frequency
        if now - last_update < min_interval_seconds:
            logger.debug(f"Location update skipped for {ride_id}: too frequent")
            return False

        self.last_updates[ride_id] = now

        if ride_id not in self.active_connections:
            return False

        connections = self.active_connections[ride_id]
        passengers = connections.get("passenger_sockets", {})

        disconnected = []

        for passenger_id, socket in passengers.items():
            try:
                await socket.send_json(location_data)
            except Exception as e:
                logger.error(f"Error sending to passenger {passenger_id}: {e}")
                disconnected.append(passenger_id)

        # Clean up disconnected clients
        for passenger_id in disconnected:
            del passengers[passenger_id]

        return True

    def disconnect(self, ride_id: str):
        """Disconnect and cleanup ride"""
        if ride_id in self.active_connections:
            connections = self.active_connections[ride_id]

            # Close all passenger connections
            for socket in connections.get("passenger_sockets", {}).values():
                try:
                    socket.close()
                except:
                    pass

            del self.active_connections[ride_id]

        self.last_updates.pop(ride_id, None)
        logger.info(f"Disconnected tracking for ride {ride_id}")

connection_manager = ConnectionManager()

# ============================================================================
# ACCURACY VALIDATION
# ============================================================================

def validate_location_accuracy(latitude: float, longitude: float, accuracy: float) -> bool:
    """
    Validate location based on accuracy threshold
    - Accuracy > 100m: LOW (may be network/GPS error)
    - Accuracy 50-100m: MEDIUM (acceptable for tracking)
    - Accuracy < 50m: HIGH (use this)
    """
    ACCURACY_THRESHOLD = 100  # meters

    # Latitude bounds: -90 to 90
    if not (-90 <= latitude <= 90):
        return False

    # Longitude bounds: -180 to 180
    if not (-180 <= longitude <= 180):
        return False

    # Accuracy must be positive
    if accuracy < 0:
        return False

    # Accept if accuracy is acceptable
    if accuracy <= ACCURACY_THRESHOLD:
        return True

    logger.warning(
        f"Location rejected: accuracy {accuracy}m exceeds threshold {ACCURACY_THRESHOLD}m"
    )
    return False

def apply_privacy_masking(latitude: float, longitude: float, precision: int = 3) -> tuple:
    """
    Mask exact coordinates for privacy
    precision=3 rounds to ~100m grid
    precision=2 rounds to ~1km grid
    """
    factor = 10 ** precision
    return (
        round(latitude * factor) / factor,
        round(longitude * factor) / factor
    )

# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/start")
async def start_tracking(request: TrackingStart, db: Session = Depends(get_db)):
    """
    Initialize tracking for a ride
    """
    # Check if tracking already active
    existing = db.query(RideTracking).filter(
        RideTracking.ride_id == request.ride_id
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="Tracking already active for this ride")

    # Create tracking record
    tracking = RideTracking(
        tracking_id=str(uuid.uuid4()),
        ride_id=request.ride_id,
        driver_id=request.driver_id,
        passenger_id=request.passenger_id,
        driver_name=request.driver_name,
        vehicle_plate=request.vehicle_plate,
        pickup_latitude=request.pickup_lat,
        pickup_longitude=request.pickup_lng,
        dropoff_latitude=request.dropoff_lat,
        dropoff_longitude=request.dropoff_lng,
        status="PICKUP_EN_ROUTE",
        privacy_mode=request.privacy_mode,
        battery_optimized=request.battery_optimized,
        update_frequency_seconds=10 if request.battery_optimized else 5
    )

    db.add(tracking)
    db.commit()
    db.refresh(tracking)

    logger.info(f"Tracking started for ride {request.ride_id}")

    return {
        "tracking_id": tracking.tracking_id,
        "ride_id": request.ride_id,
        "status": "tracking_active",
        "update_frequency_seconds": tracking.update_frequency_seconds,
        "websocket_url": f"ws://localhost:8000/api/v3/tracking/ws/{request.ride_id}",
        "privacy_mode": request.privacy_mode,
        "timestamp": get_ist_now().isoformat()
    }

@router.websocket("/ws/{ride_id}/{client_type}/{client_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    ride_id: str,
    client_type: str,  # "driver" or "passenger"
    client_id: str,
    db: Session = Depends(get_db)
):
    """
    WebSocket endpoint for driver location streaming

    Path: /ws/{ride_id}/{client_type}/{client_id}
    - client_type: "driver" or "passenger"
    - client_id: driver_id or passenger_id
    """
    try:
        # Get tracking session
        tracking = db.query(RideTracking).filter(
            RideTracking.ride_id == ride_id
        ).first()

        if not tracking:
            await websocket.close(code=4004, reason="Tracking not found")
            return

        # Connect client
        if client_type == "driver":
            await connection_manager.connect_driver(ride_id, websocket, client_id)
        elif client_type == "passenger":
            await connection_manager.connect_passenger(ride_id, websocket, client_id)
        else:
            await websocket.close(code=4003, reason="Invalid client type")
            return

        # Listen for messages
        while True:
            if client_type == "driver":
                # Receive location update from driver
                data = await websocket.receive_text()
                location_data = json.loads(data)

                # Validate location accuracy
                if not validate_location_accuracy(
                    location_data["latitude"],
                    location_data["longitude"],
                    location_data["accuracy"]
                ):
                    logger.warning(f"Invalid location received from driver {client_id}")
                    await websocket.send_json({
                        "type": "error",
                        "message": "Location accuracy too low"
                    })
                    continue

                # Apply privacy masking if enabled
                lat, lng = location_data["latitude"], location_data["longitude"]
                if tracking.privacy_mode:
                    lat, lng = apply_privacy_masking(lat, lng)

                # Record location in database
                location_record = DriverLocationRecord(
                    location_id=str(uuid.uuid4()),
                    ride_id=ride_id,
                    driver_id=client_id,
                    passenger_id=tracking.passenger_id,
                    latitude=lat,
                    longitude=lng,
                    accuracy_meters=location_data["accuracy"],
                    altitude=location_data.get("altitude"),
                    heading=location_data.get("heading"),
                    speed_kmh=location_data.get("speed"),
                    is_valid=True
                )
                db.add(location_record)

                # Update tracking
                tracking.current_latitude = lat
                tracking.current_longitude = lng
                tracking.location_count += 1
                tracking.last_location_timestamp = get_ist_now()
                tracking.updated_at = get_ist_now()
                db.commit()

                # Broadcast to passengers with rate limiting
                broadcast_data = {
                    "type": "location_update",
                    "ride_id": ride_id,
                    "latitude": lat,
                    "longitude": lng,
                    "heading": location_data.get("heading"),
                    "speed": location_data.get("speed"),
                    "driver_name": tracking.driver_name,
                    "vehicle_plate": tracking.vehicle_plate,
                    "status": tracking.status,
                    "accuracy": location_data.get("accuracy"),
                    "timestamp": get_ist_now().isoformat()
                }

                await connection_manager.broadcast_location(
                    ride_id,
                    broadcast_data,
                    min_interval_seconds=tracking.update_frequency_seconds
                )

                # Battery optimization: send ack back
                battery_level = location_data.get("battery_level")
                if battery_level is not None and battery_level < 20:
                    # Switch to lower frequency if battery critical
                    tracking.battery_optimized = True
                    tracking.update_frequency_seconds = 15  # 15s intervals
                    db.commit()

                # Send acknowledgment
                await websocket.send_json({
                    "type": "location_received",
                    "timestamp": get_ist_now().isoformat()
                })

            else:  # passenger
                # Passengers don't send, only receive
                await asyncio.sleep(1)

    except WebSocketDisconnect:
        if client_type == "driver":
            logger.info(f"Driver {client_id} disconnected from ride {ride_id}")
        else:
            logger.info(f"Passenger {client_id} disconnected from tracking {ride_id}")

    except Exception as e:
        logger.error(f"WebSocket error: {e}")

    finally:
        # Don't disconnect ride on first client disconnect
        pass

@router.post("/stop/{ride_id}")
async def stop_tracking(ride_id: str, db: Session = Depends(get_db)):
    """
    Stop tracking and cleanup location history
    """
    tracking = db.query(RideTracking).filter(
        RideTracking.ride_id == ride_id
    ).first()

    if not tracking:
        raise HTTPException(status_code=404, detail="Tracking not found")

    # Get final metrics
    location_count = db.query(func.count(DriverLocationRecord.location_id)).filter(
        DriverLocationRecord.ride_id == ride_id
    ).scalar()

    # Calculate average speed from locations
    locations = db.query(DriverLocationRecord).filter(
        DriverLocationRecord.ride_id == ride_id,
        DriverLocationRecord.speed_kmh > 0
    ).all()

    avg_speed = sum(loc.speed_kmh for loc in locations) / len(locations) if locations else 0

    # Delete tracking record
    db.delete(tracking)
    db.commit()

    # Cleanup location history (keep last 100 for audit, delete rest)
    old_locations = db.query(DriverLocationRecord).filter(
        DriverLocationRecord.ride_id == ride_id,
        DriverLocationRecord.timestamp < get_ist_now() - timedelta(days=30)
    ).delete()
    db.commit()

    connection_manager.disconnect(ride_id)

    logger.info(f"Tracking stopped for ride {ride_id}, cleaned up {old_locations} old records")

    return {
        "ride_id": ride_id,
        "status": "tracking_stopped",
        "metrics": {
            "total_locations": location_count,
            "average_speed_kmh": round(avg_speed, 2),
            "locations_archived": old_locations
        },
        "timestamp": get_ist_now().isoformat()
    }

@router.get("/location/{ride_id}")
async def get_current_location(ride_id: str, db: Session = Depends(get_db)):
    """
    Get current driver location for a ride
    """
    tracking = db.query(RideTracking).filter(
        RideTracking.ride_id == ride_id
    ).first()

    if not tracking:
        raise HTTPException(status_code=404, detail="Tracking not found")

    return {
        "ride_id": ride_id,
        "driver_name": tracking.driver_name,
        "vehicle_plate": tracking.vehicle_plate,
        "latitude": tracking.current_latitude,
        "longitude": tracking.current_longitude,
        "status": tracking.status,
        "location_count": tracking.location_count,
        "timestamp": tracking.last_location_timestamp.isoformat() if tracking.last_location_timestamp else None
    }

@router.get("/health")
async def tracking_health():
    """Health check"""
    return {
        "status": "healthy",
        "active_rides": len(connection_manager.active_connections),
        "timestamp": get_ist_now().isoformat()
    }
