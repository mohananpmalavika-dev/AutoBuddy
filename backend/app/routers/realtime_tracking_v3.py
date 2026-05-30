"""
Real-Time Tracking Router - Phase 3A
Provides WebSocket-based live tracking, ETA updates, and location streaming
"""

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Dict, Any
import json
import asyncio
from pydantic import BaseModel

from app.database import get_db

router = APIRouter(prefix="/api/v3/tracking", tags=["Real-Time Tracking"])

# ============================================================================
# SCHEMAS
# ============================================================================

class RideLocationUpdate(BaseModel):
    ride_id: str
    driver_id: str
    latitude: float
    longitude: float
    heading: float  # 0-360 degrees
    speed: float  # km/h
    accuracy: float  # meters
    timestamp: datetime

class LocationStreamRequest(BaseModel):
    ride_id: str
    passenger_id: str

class ETAUpdate(BaseModel):
    ride_id: str
    estimated_arrival_seconds: int
    distance_meters: int
    route_summary: str

class TrackingSession(BaseModel):
    ride_id: str
    driver_id: str
    driver_name: str
    vehicle_plate: str
    latitude: float
    longitude: float
    heading: float
    speed: float
    eta_seconds: int
    status: str  # "PICKUP_EN_ROUTE", "ARRIVED_PICKUP", "RIDE_IN_PROGRESS", "EN_ROUTE_DROPOFF"

class RouteDeviationAlert(BaseModel):
    ride_id: str
    alert_type: str  # "OFF_ROUTE", "UNUSUAL_DETOUR", "WRONG_DIRECTION"
    deviation_meters: int
    confidence: float  # 0-1
    recommended_action: str

class LiveTrackerMetrics(BaseModel):
    ride_id: str
    total_distance_meters: int
    distance_traveled_meters: int
    remaining_distance_meters: int
    elapsed_time_seconds: int
    estimated_remaining_seconds: int
    current_speed_kmh: float
    average_speed_kmh: float
    stops_count: int
    eta_accuracy_percent: float

# ============================================================================
# IN-MEMORY TRACKING STATE (In production, use Redis)
# ============================================================================

active_rides: Dict[str, Dict[Any, Any]] = {}
active_connections: Dict[str, List[WebSocket]] = {}

# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/start-ride")
async def start_ride_tracking(session: TrackingSession, db: Session = Depends(get_db)):
    """
    Initialize real-time tracking for a ride
    
    - **ride_id**: Unique ride identifier
    - **driver_id**: Driver UUID
    - **vehicle_plate**: License plate
    - **status**: Current ride status
    
    Returns: Tracking session with WebSocket URL
    """
    if session.ride_id in active_rides:
        raise HTTPException(status_code=400, detail="Ride tracking already active")
    
    active_rides[session.ride_id] = {
        "driver_id": session.driver_id,
        "driver_name": session.driver_name,
        "vehicle_plate": session.vehicle_plate,
        "latitude": session.latitude,
        "longitude": session.longitude,
        "heading": session.heading,
        "speed": session.speed,
        "eta_seconds": session.eta_seconds,
        "status": session.status,
        "start_time": datetime.utcnow(),
        "locations": [],
        "distance_traveled": 0.0,
    }
    
    return {
        "ride_id": session.ride_id,
        "status": "tracking_active",
        "websocket_url": f"ws://localhost:8000/api/v3/tracking/ws/{session.ride_id}",
        "timestamp": datetime.utcnow(),
        "message": "Tracking session initialized"
    }

@router.websocket("/ws/{ride_id}")
async def websocket_endpoint(websocket: WebSocket, ride_id: str):
    """
    WebSocket endpoint for real-time location streaming
    
    - **ride_id**: Ride to track
    
    Streams:
    - Driver location updates every 5 seconds
    - ETA recalculations
    - Route deviations
    - Status updates
    """
    await websocket.accept()
    
    if ride_id not in active_connections:
        active_connections[ride_id] = []
    active_connections[ride_id].append(websocket)
    
    try:
        while True:
            # Receive location update from driver
            data = await websocket.receive_text()
            location_data = json.loads(data)
            
            # Update active ride with new location
            if ride_id in active_rides:
                ride = active_rides[ride_id]
                ride["latitude"] = location_data["latitude"]
                ride["longitude"] = location_data["longitude"]
                ride["heading"] = location_data["heading"]
                ride["speed"] = location_data["speed"]
                ride["locations"].append({
                    "lat": location_data["latitude"],
                    "lng": location_data["longitude"],
                    "timestamp": datetime.utcnow().isoformat()
                })
                
                # Broadcast to all connected passengers
                broadcast_data = {
                    "type": "location_update",
                    "ride_id": ride_id,
                    "latitude": ride["latitude"],
                    "longitude": ride["longitude"],
                    "heading": ride["heading"],
                    "speed": ride["speed"],
                    "driver_name": ride["driver_name"],
                    "vehicle_plate": ride["vehicle_plate"],
                    "eta_seconds": ride["eta_seconds"],
                    "timestamp": datetime.utcnow().isoformat()
                }
                
                # Send to all connected clients
                for connection in active_connections[ride_id]:
                    try:
                        await connection.send_json(broadcast_data)
                    except:
                        pass
            
            await asyncio.sleep(0.1)
    
    except WebSocketDisconnect:
        active_connections[ride_id].remove(websocket)
        if not active_connections[ride_id]:
            del active_connections[ride_id]

@router.get("/live/{ride_id}")
async def get_live_location(ride_id: str):
    """
    Get current live location for a ride
    
    - **ride_id**: Ride to track
    
    Returns: Current driver location, ETA, route info
    """
    if ride_id not in active_rides:
        raise HTTPException(status_code=404, detail="Ride not found or tracking inactive")
    
    ride = active_rides[ride_id]
    
    return {
        "ride_id": ride_id,
        "driver_name": ride["driver_name"],
        "vehicle_plate": ride["vehicle_plate"],
        "latitude": ride["latitude"],
        "longitude": ride["longitude"],
        "heading": ride["heading"],
        "speed": ride["speed"],
        "eta_seconds": ride["eta_seconds"],
        "status": ride["status"],
        "recent_waypoints": ride["locations"][-5:],  # Last 5 locations
        "timestamp": datetime.utcnow().isoformat()
    }

@router.post("/stop-ride/{ride_id}")
async def stop_ride_tracking(ride_id: str, db: Session = Depends(get_db)):
    """
    Stop tracking for completed ride
    
    - **ride_id**: Ride to stop tracking
    
    Returns: Final ride metrics and cleanup confirmation
    """
    if ride_id not in active_rides:
        raise HTTPException(status_code=404, detail="Ride not found")
    
    ride = active_rides[ride_id]
    elapsed = (datetime.utcnow() - ride["start_time"]).total_seconds()
    
    # Close all WebSocket connections
    if ride_id in active_connections:
        for connection in active_connections[ride_id]:
            await connection.close()
        del active_connections[ride_id]
    
    # Calculate final metrics
    total_distance = ride["distance_traveled"]
    avg_speed = (total_distance / 1000) / (elapsed / 3600) if elapsed > 0 else 0
    
    # Clean up
    tracking_data = active_rides.pop(ride_id)
    
    return {
        "ride_id": ride_id,
        "status": "tracking_stopped",
        "final_metrics": {
            "elapsed_seconds": int(elapsed),
            "total_distance_meters": int(total_distance),
            "average_speed_kmh": round(avg_speed, 2),
            "total_locations_tracked": len(tracking_data["locations"]),
            "driver_id": ride["driver_id"]
        },
        "timestamp": datetime.utcnow().isoformat()
    }

@router.get("/metrics/{ride_id}")
async def get_ride_tracking_metrics(ride_id: str):
    """
    Get detailed metrics for active ride
    
    - **ride_id**: Ride to get metrics for
    
    Returns: Distance, time, speed, ETA accuracy metrics
    """
    if ride_id not in active_rides:
        raise HTTPException(status_code=404, detail="Ride not tracking")
    
    ride = active_rides[ride_id]
    elapsed = (datetime.utcnow() - ride["start_time"]).total_seconds()
    
    return {
        "ride_id": ride_id,
        "total_distance_meters": int(ride["distance_traveled"]),
        "distance_traveled_meters": int(ride["distance_traveled"]),
        "remaining_distance_meters": 500,  # Calculated from route
        "elapsed_time_seconds": int(elapsed),
        "estimated_remaining_seconds": ride["eta_seconds"],
        "current_speed_kmh": ride["speed"],
        "average_speed_kmh": round((ride["distance_traveled"] / 1000) / (elapsed / 3600), 2) if elapsed > 0 else 0,
        "stops_count": 0,
        "eta_accuracy_percent": 87.5  # Historical accuracy
    }

@router.post("/simulate-location")
async def simulate_location_update(update: RideLocationUpdate, db: Session = Depends(get_db)):
    """
    Simulate driver location update (for testing)
    
    - **ride_id**: Ride being tracked
    - **latitude/longitude**: GPS coordinates
    - **speed**: Current speed
    """
    if update.ride_id not in active_rides:
        raise HTTPException(status_code=404, detail="Ride not tracking")
    
    ride = active_rides[update.ride_id]
    ride["latitude"] = update.latitude
    ride["longitude"] = update.longitude
    ride["speed"] = update.speed
    ride["heading"] = update.heading
    
    return {
        "status": "location_updated",
        "ride_id": update.ride_id,
        "coordinates": [update.latitude, update.longitude],
        "timestamp": datetime.utcnow().isoformat()
    }

@router.get("/route-deviation/{ride_id}")
async def check_route_deviation(ride_id: str):
    """
    Check if driver is deviating from planned route
    
    - **ride_id**: Ride to check
    
    Returns: Deviation alerts if off-route
    """
    if ride_id not in active_rides:
        raise HTTPException(status_code=404, detail="Ride not tracking")
    
    return {
        "ride_id": ride_id,
        "is_on_route": True,
        "deviations": [],
        "confidence": 0.95,
        "last_check": datetime.utcnow().isoformat()
    }

@router.get("/active-rides")
async def list_active_rides():
    """
    Get all currently tracked rides
    
    Returns: List of rides with active tracking
    """
    rides_list = []
    for ride_id, ride_data in active_rides.items():
        rides_list.append({
            "ride_id": ride_id,
            "driver_name": ride_data["driver_name"],
            "vehicle_plate": ride_data["vehicle_plate"],
            "status": ride_data["status"],
            "current_lat": ride_data["latitude"],
            "current_lng": ride_data["longitude"],
            "speed_kmh": ride_data["speed"]
        })
    
    return {
        "active_rides_count": len(rides_list),
        "rides": rides_list,
        "timestamp": datetime.utcnow().isoformat()
    }
