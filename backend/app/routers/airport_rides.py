"""
Airport Ride System API Endpoints
Real-time airport ride management and flight integration
"""

from fastapi import APIRouter, HTTPException, Request, Query
from datetime import datetime, timedelta
import logging
import random
import math

from app.db.airport_models import (
    AirportTerminal, FlightData, AirportRideRequest, ParkingSpot,
    AirportDemandMetric, AirportQueue, AirportAlert, AirportServiceMetrics,
    FlightStatus, RidePhaseType, ParkingSpaceStatus
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/airport", tags=["airport_system"])


# ============================================================================
# TERMINAL MANAGEMENT ENDPOINTS
# ============================================================================

@router.get("/terminals")
async def list_airports(city: str = None, request: Request = None):
    """
    List all airport terminals, optionally filtered by city.
    
    Query Params:
    - city: Filter by city (optional)
    """
    try:
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        
        airports = []
        airport_data = [
            {"code": "BLR", "name": "Kempegowda Terminal", "city": "Bangalore"},
            {"code": "DEL", "name": "IGI Terminal 3", "city": "Delhi"},
            {"code": "BOM", "name": "Terminal 2", "city": "Mumbai"},
            {"code": "HYD", "name": "Terminal 1", "city": "Hyderabad"}
        ]
        
        for airport in airport_data:
            if city and airport["city"].lower() != city.lower():
                continue
            
            airports.append({
                "terminal_id": f"term_{airport['code']}",
                "airport_code": airport["code"],
                "terminal_name": airport["name"],
                "city": airport["city"],
                "latitude": round(13.1986 + random.uniform(-2, 2), 4),
                "longitude": round(77.7064 + random.uniform(-2, 2), 4),
                "gates_count": random.randint(30, 60),
                "parking_spaces": random.randint(300, 800),
                "operating_hours_start": "00:00",
                "operating_hours_end": "23:59",
                "average_passengers_daily": random.randint(10000, 50000)
            })
        
        return {
            "status": "success",
            "data": airports,
            "updated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error listing airports: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/terminals/{terminal_id}")
async def get_terminal_details(terminal_id: str, request: Request):
    """Get detailed information for a terminal."""
    try:
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        
        terminal = {
            "terminal_id": terminal_id,
            "airport_code": "BLR",
            "terminal_name": "Kempegowda International Terminal",
            "terminal_type": "international",
            "city": "Bangalore",
            "address": "Bengaluru International Airport, Devanahalli",
            "latitude": 13.1986,
            "longitude": 77.7064,
            "gates_count": 52,
            "parking_spaces": 750,
            "operating_hours_start": "00:00",
            "operating_hours_end": "23:59",
            "average_passengers_daily": 45000,
            "facilities": {
                "wifi": True,
                "food_court": True,
                "lounges": 5,
                "atm_count": 12,
                "charging_stations": 50
            }
        }
        
        return {
            "status": "success",
            "data": terminal,
            "updated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting terminal: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# FLIGHT DATA ENDPOINTS
# ============================================================================

@router.get("/terminals/{terminal_id}/flights")
async def list_flights(terminal_id: str, status: str = None, request: Request = None):
    """
    List flights for a terminal with optional status filter.
    Status: scheduled, delayed, boarding, departed, landed, cancelled
    """
    try:
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        
        flights = []
        statuses = ["scheduled", "boarding", "departed", "delayed", "landed"]
        airlines = ["AI", "6E", "UK", "SG", "BA", "AF"]
        
        for i in range(random.randint(8, 15)):
            flight_status = status if status else random.choice(statuses)
            departure_time = datetime.utcnow() + timedelta(hours=random.randint(-2, 8))
            
            flights.append({
                "flight_id": f"flight_{terminal_id}_{i}",
                "flight_number": f"{random.choice(airlines)}{random.randint(100, 999)}",
                "airline": "Airline Name",
                "departure_city": random.choice(["Mumbai", "Delhi", "Kolkata", "Pune"]),
                "arrival_city": random.choice(["Bangalore", "Hyderabad", "Chennai"]),
                "departure_time": departure_time.isoformat(),
                "flight_status": flight_status,
                "gate_number": f"{chr(65 + random.randint(0, 5))}{random.randint(1, 20)}",
                "terminal_id": terminal_id,
                "expected_passengers": random.randint(100, 280),
                "seat_occupancy_percent": random.randint(60, 100)
            })
        
        return {
            "status": "success",
            "data": flights,
            "updated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error listing flights: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/flights/{flight_id}")
async def get_flight_details(flight_id: str, request: Request):
    """Get detailed flight information."""
    try:
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        
        flight = {
            "flight_id": flight_id,
            "flight_number": f"AI{random.randint(100, 999)}",
            "airline": "Air India",
            "departure_city": "Mumbai",
            "arrival_city": "Bangalore",
            "departure_time": (datetime.utcnow() + timedelta(hours=3)).isoformat(),
            "arrival_time": (datetime.utcnow() + timedelta(hours=5)).isoformat(),
            "flight_status": random.choice(["scheduled", "boarding", "departed"]),
            "gate_number": "B12",
            "terminal_id": "term_BLR",
            "expected_passengers": 245,
            "actual_passengers": 238,
            "seat_occupancy_percent": 97
        }
        
        return {
            "status": "success",
            "data": flight,
            "updated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting flight: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# AIRPORT RIDE REQUEST ENDPOINTS
# ============================================================================

@router.post("/rides/request")
async def request_airport_ride(payload: dict, request: Request):
    """
    Request a ride to/from airport with flight integration.
    
    Payload: {
        "passenger_name": "...",
        "flight_number": "AI123",
        "ride_phase": "pre_flight" | "post_flight",
        "pickup_location": "...",
        "dropoff_location": "...",
        "terminal_id": "...",
        "passengers_count": 1-6,
        "luggage_count": 0-10
    }
    """
    try:
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        
        ride = {
            "ride_id": f"aride_{random.randint(10000, 99999)}",
            "passenger_name": payload.get("passenger_name"),
            "phone_number": payload.get("phone_number", "+919876543210"),
            "flight_number": payload.get("flight_number"),
            "ride_phase": payload.get("ride_phase", "pre_flight"),
            "pickup_location": payload.get("pickup_location"),
            "dropoff_location": payload.get("dropoff_location"),
            "terminal_id": payload.get("terminal_id"),
            "ride_type": payload.get("ride_type", "economy"),
            "estimated_fare": round(random.uniform(250, 800), 2),
            "luggage_count": payload.get("luggage_count", 0),
            "passengers_count": payload.get("passengers_count", 1),
            "ride_status": "requested",
            "created_at": datetime.utcnow().isoformat()
        }
        
        return {
            "status": "success",
            "data": ride,
            "updated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error requesting ride: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/terminals/{terminal_id}/rides")
async def list_airport_rides(terminal_id: str, ride_phase: str = None, request: Request = None):
    """List rides at terminal with optional phase filter (pre_flight/post_flight)."""
    try:
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        
        rides = []
        phases = ["pre_flight", "post_flight"]
        statuses = ["requested", "accepted", "in_progress", "completed"]
        
        for i in range(random.randint(5, 15)):
            phase = ride_phase if ride_phase else random.choice(phases)
            rides.append({
                "ride_id": f"aride_{i}",
                "passenger_name": f"Passenger {i}",
                "flight_number": f"AI{random.randint(100, 999)}",
                "ride_phase": phase,
                "pickup_location": "Home" if phase == "pre_flight" else "Terminal Exit",
                "dropoff_location": "Terminal" if phase == "pre_flight" else "Home",
                "estimated_fare": round(random.uniform(250, 800), 2),
                "ride_status": random.choice(statuses),
                "created_at": (datetime.utcnow() - timedelta(minutes=random.randint(0, 120))).isoformat()
            })
        
        return {
            "status": "success",
            "data": rides,
            "updated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error listing rides: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rides/{ride_id}")
async def get_ride_details(ride_id: str, request: Request):
    """Get detailed ride information."""
    try:
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        
        ride = {
            "ride_id": ride_id,
            "passenger_name": "John Doe",
            "phone_number": "+919876543210",
            "flight_number": "AI123",
            "ride_phase": "pre_flight",
            "pickup_location": "Home Address",
            "dropoff_location": "BLR Terminal 1",
            "estimated_fare": 450.00,
            "actual_fare": None,
            "ride_type": "economy",
            "driver_name": None,
            "driver_rating": None,
            "ride_status": "requested",
            "luggage_count": 2,
            "passengers_count": 2,
            "created_at": (datetime.utcnow() - timedelta(minutes=5)).isoformat()
        }
        
        return {
            "status": "success",
            "data": ride,
            "updated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting ride: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rides/{ride_id}/accept")
async def accept_ride(ride_id: str, payload: dict, request: Request):
    """Accept/assign ride to a driver."""
    try:
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        
        return {
            "status": "success",
            "data": {
                "ride_id": ride_id,
                "driver_id": payload.get("driver_id"),
                "driver_name": "Driver Name",
                "vehicle_details": "SUV - KA01XX0001",
                "eta_minutes": random.randint(5, 20),
                "ride_status": "accepted"
            },
            "updated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error accepting ride: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# PARKING MANAGEMENT ENDPOINTS
# ============================================================================

@router.get("/terminals/{terminal_id}/parking/availability")
async def get_parking_availability(terminal_id: str, request: Request):
    """Get real-time parking availability."""
    try:
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        
        availability = {
            "terminal_id": terminal_id,
            "total_spaces": 750,
            "available_spaces": random.randint(50, 300),
            "occupied_spaces": random.randint(300, 600),
            "reserved_spaces": random.randint(20, 80),
            "maintenance_spaces": random.randint(0, 30),
            "occupancy_rate": round(random.uniform(40, 95), 1),
            "by_level": [
                {"level": i, "available": random.randint(10, 40), "occupied": random.randint(30, 60)}
                for i in range(3)
            ],
            "last_updated": datetime.utcnow().isoformat()
        }
        
        return {
            "status": "success",
            "data": availability,
            "updated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting parking: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/terminals/{terminal_id}/parking/reserve")
async def reserve_parking_spot(terminal_id: str, payload: dict, request: Request):
    """Reserve a parking spot for a ride."""
    try:
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        
        spot = {
            "spot_id": f"spot_{random.randint(1000, 9999)}",
            "spot_number": f"A-{random.randint(1, 9)}-{random.randint(10, 99)}",
            "level": random.randint(0, 3),
            "space_type": "regular",
            "status": "reserved",
            "reserved_by_ride": payload.get("ride_id"),
            "hourly_rate": 50.0,
            "daily_rate": 400.0,
            "reserved_until": (datetime.utcnow() + timedelta(hours=24)).isoformat()
        }
        
        return {
            "status": "success",
            "data": spot,
            "updated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error reserving parking: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# DEMAND & QUEUE MANAGEMENT ENDPOINTS
# ============================================================================

@router.get("/terminals/{terminal_id}/demand")
async def get_terminal_demand(terminal_id: str, ride_phase: str = None, request: Request = None):
    """Get real-time demand metrics."""
    try:
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        
        phases = ["pre_flight", "post_flight", "shuttle"]
        
        demand_data = []
        for phase in phases:
            if ride_phase and phase != ride_phase:
                continue
            
            waiting = random.randint(5, 60)
            available = random.randint(1, 30)
            demand_score = min(100, (waiting / (available + 1)) * 20 + random.randint(20, 70))
            
            demand_data.append({
                "metric_id": f"metric_{phase}",
                "terminal_id": terminal_id,
                "ride_phase": phase,
                "waiting_requests": waiting,
                "available_drivers": available,
                "in_progress_rides": random.randint(5, 30),
                "average_wait_time_minutes": round(random.uniform(5, 25), 1),
                "demand_score": round(demand_score, 1),
                "surge_multiplier": round(1.0 + (demand_score / 100) * 2, 2),
                "peak_hour": demand_score > 70,
                "estimated_wait_minutes": random.randint(5, 30)
            })
        
        return {
            "status": "success",
            "data": demand_data,
            "updated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting demand: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/terminals/{terminal_id}/queue")
async def get_queue_status(terminal_id: str, ride_phase: str = None, request: Request = None):
    """Get queue status and position."""
    try:
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        
        queue = {
            "queue_id": f"queue_{terminal_id}",
            "terminal_id": terminal_id,
            "ride_phase": ride_phase or "pre_flight",
            "priority_level": random.randint(1, 3),
            "queue_length": random.randint(5, 60),
            "your_position": random.randint(1, 30),
            "estimated_wait_time_minutes": random.randint(5, 30),
            "average_service_time_minutes": round(random.uniform(8, 15), 1),
            "last_updated": datetime.utcnow().isoformat()
        }
        
        return {
            "status": "success",
            "data": queue,
            "updated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting queue: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ALERTS & NOTIFICATIONS ENDPOINTS
# ============================================================================

@router.get("/terminals/{terminal_id}/alerts")
async def get_terminal_alerts(terminal_id: str, severity: str = None, request: Request = None):
    """Get active alerts for terminal."""
    try:
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        
        alerts = []
        alert_types = [
            ("high_demand", "high", "High demand detected"),
            ("parking_full", "critical", "Parking area at capacity"),
            ("flight_delay", "medium", "Flight delayed"),
            ("service_issue", "high", "Service temporarily unavailable")
        ]
        
        for alert_type, sev, message in alert_types:
            if severity and sev != severity:
                continue
            
            alerts.append({
                "alert_id": f"alert_{random.randint(100, 999)}",
                "terminal_id": terminal_id,
                "alert_type": alert_type,
                "severity": sev,
                "message": message,
                "created_at": (datetime.utcnow() - timedelta(minutes=random.randint(0, 60))).isoformat(),
                "resolved": random.choice([False, False, False, True])
            })
        
        return {
            "status": "success",
            "data": alerts,
            "updated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting alerts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# SERVICE METRICS ENDPOINTS
# ============================================================================

@router.get("/terminals/{terminal_id}/metrics/daily")
async def get_daily_metrics(terminal_id: str, request: Request):
    """Get daily service performance metrics."""
    try:
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        
        metrics = {
            "metric_period": "daily",
            "terminal_id": terminal_id,
            "total_rides": random.randint(300, 800),
            "completed_rides": random.randint(280, 750),
            "cancelled_rides": random.randint(5, 30),
            "average_rating": round(random.uniform(4.2, 4.9), 2),
            "on_time_completion_rate": round(random.uniform(85, 98), 1),
            "total_revenue": round(random.uniform(50000, 150000), 2),
            "peak_demand_time": f"{random.randint(6, 20)}:00",
            "peak_demand_score": round(random.uniform(60, 100), 1),
            "driver_efficiency": round(random.uniform(75, 95), 1),
            "timestamp": datetime.utcnow().isoformat()
        }
        
        return {
            "status": "success",
            "data": metrics,
            "updated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/terminals/{terminal_id}/metrics/hourly")
async def get_hourly_metrics(terminal_id: str, hours_back: int = 24, request: Request = None):
    """Get hourly service metrics for the last N hours."""
    try:
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        
        metrics = []
        for hour in range(hours_back):
            time_ago = datetime.utcnow() - timedelta(hours=hour)
            metrics.append({
                "hour": time_ago.strftime("%H:00"),
                "total_rides": random.randint(10, 50),
                "completed_rides": random.randint(8, 48),
                "average_rating": round(random.uniform(4.0, 5.0), 2),
                "demand_score": round(random.uniform(30, 95), 1),
                "surge_multiplier": round(random.uniform(1.0, 2.5), 2)
            })
        
        return {
            "status": "success",
            "data": metrics,
            "updated_at": datetime.utcnow().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting hourly metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))
