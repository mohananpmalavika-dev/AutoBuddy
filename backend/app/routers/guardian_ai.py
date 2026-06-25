"""
Guardian AI Router — Mobility Assistant for Autism & Elderly
Features: Geo-fencing, voice guidance, caregiver monitoring, transport recognition, SOS escalation
"""

from fastapi import APIRouter, Request, HTTPException, BackgroundTasks
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
import random
import math
import asyncio
from enum import Enum

from app.utils.rbac import get_current_user_from_request

router = APIRouter(prefix="/api/guardian", tags=["guardian-ai"])


# ============================================================================
# DATA MODELS & CONSTANTS
# ============================================================================

class GeofenceStatus(str, Enum):
    ACTIVE = "active"
    BREACHED = "breached"
    SAFE = "safe"


class TransportType(str, Enum):
    BUS = "bus"
    TRAIN = "train"
    AUTO = "auto"
    TAXI = "taxi"


class GuardianDestination(str, Enum):
    HOME = "home"
    HOSPITAL = "hospital"
    TEMPLE = "temple"
    WORK = "work"
    SCHOOL = "school"


# In-memory storage for demo (replace with MongoDB in production)
GEOFENCES = {}  # {geofence_id: geofence_data}
GUARDIAN_USERS = {}  # {user_id: {destinations, preferences, caregiver_contact}}
ACTIVE_TRIPS = {}  # {trip_id: {user_id, destination, start_time, status, location}}
CAREGIVER_ALERTS = {}  # {alert_id: alert_data}


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in km using Haversine formula"""
    R = 6371  # Earth's radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 + 
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def is_point_in_geofence(lat: float, lon: float, geofence: Dict) -> bool:
    """Check if point is within geofence radius"""
    distance = calculate_distance(lat, lon, geofence["center_lat"], geofence["center_lon"])
    return distance <= geofence["radius_km"]


def generate_voice_instructions(start_lat: float, start_lon: float, 
                                end_lat: float, end_lon: float, 
                                mode: str = "walking") -> List[str]:
    """Generate simplified step-by-step voice instructions"""
    instructions = [
        f"Starting navigation to destination in {mode} mode.",
        "Move ahead slowly.",
    ]
    
    # Calculate bearing and distance
    dy = end_lat - start_lat
    dx = end_lon - start_lon
    bearing = math.degrees(math.atan2(dx, dy))
    distance = calculate_distance(start_lat, start_lon, end_lat, end_lon)
    
    # Directional instruction
    if bearing < 45 or bearing >= 315:
        direction = "North"
    elif bearing < 135:
        direction = "East"
    elif bearing < 225:
        direction = "South"
    else:
        direction = "West"
    
    instructions.append(f"Head towards {direction}.")
    instructions.append(f"Destination is approximately {distance:.1f} kilometers away.")
    instructions.append("Listen for crossing signals. Stop at red lights.")
    instructions.append("When you reach the destination, a confirmation message will appear.")
    
    return instructions


def format_guardian_trip(trip_id: str, trip_data: Dict) -> Dict:
    """Format trip data for caregiver dashboard"""
    return {
        "trip_id": trip_id,
        "user_id": trip_data.get("user_id"),
        "destination": trip_data.get("destination"),
        "current_latitude": trip_data.get("latitude"),
        "current_longitude": trip_data.get("longitude"),
        "start_time": trip_data.get("start_time"),
        "elapsed_minutes": int((datetime.utcnow() - datetime.fromisoformat(trip_data["start_time"])).total_seconds() / 60),
        "status": trip_data.get("status", "in_progress"),
        "geofence_status": trip_data.get("geofence_status", "safe"),
        "battery_percent": trip_data.get("battery_percent", 75),
        "network_quality": trip_data.get("network_quality", "good"),
    }


# ============================================================================
# GEOFENCE ENDPOINTS (3.2)
# ============================================================================

@router.post("/geofence/create")
async def create_geofence(
    request: Request,
    geofence_data: Dict = None
):
    """Create a safe zone geofence"""
    user = await get_current_user_from_request(request)
    
    try:
        geofence_id = f"GF-{random.randint(100000, 999999)}"
        
        geofence = {
            "geofence_id": geofence_id,
            "user_id": user.get("user_id"),
            "name": geofence_data.get("name", "Safe Zone"),
            "center_lat": geofence_data.get("center_lat"),
            "center_lon": geofence_data.get("center_lon"),
            "radius_km": geofence_data.get("radius_km", 0.5),
            "alert_on_exit": geofence_data.get("alert_on_exit", True),
            "caregiver_phone": geofence_data.get("caregiver_phone"),
            "created_at": datetime.utcnow().isoformat(),
            "status": GeofenceStatus.SAFE.value
        }
        
        GEOFENCES[geofence_id] = geofence
        
        return {
            "ok": True,
            "geofence_id": geofence_id,
            "message": f"Geofence '{geofence['name']}' created",
            "geofence": geofence
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/geofence/check")
async def check_geofence_breach(
    request: Request,
    check_data: Dict = None,
    background_tasks: BackgroundTasks = None
):
    """Check if user has breached any geofence and trigger alerts"""
    user = await get_current_user_from_request(request)
    
    user_lat = check_data.get("latitude")
    user_lon = check_data.get("longitude")
    trip_id = check_data.get("trip_id")
    
    breaches = []
    
    for geofence_id, geofence in GEOFENCES.items():
        if geofence["user_id"] != user.get("user_id"):
            continue
            
        is_inside = is_point_in_geofence(user_lat, user_lon, geofence)
        previous_status = geofence.get("status", GeofenceStatus.SAFE.value)
        
        if not is_inside and previous_status == GeofenceStatus.SAFE.value:
            # Breach detected
            geofence["status"] = GeofenceStatus.BREACHED.value
            
            breach_alert = {
                "alert_id": f"ALT-{random.randint(100000, 999999)}",
                "geofence_id": geofence_id,
                "user_id": user.get("user_id"),
                "timestamp": datetime.utcnow().isoformat(),
                "latitude": user_lat,
                "longitude": user_lon,
                "message": f"User left safe zone: {geofence['name']}",
                "caregiver_phone": geofence.get("caregiver_phone")
            }
            
            CAREGIVER_ALERTS[breach_alert["alert_id"]] = breach_alert
            breaches.append(breach_alert)
            
            # Trigger SMS notification in production
            if background_tasks and geofence.get("alert_on_exit"):
                background_tasks.add_task(send_sms_alert, breach_alert)
        
        elif is_inside and previous_status == GeofenceStatus.BREACHED.value:
            # User re-entered safe zone
            geofence["status"] = GeofenceStatus.SAFE.value
    
    return {
        "ok": True,
        "user_id": user.get("user_id"),
        "breaches_detected": len(breaches),
        "breaches": breaches,
        "location": {"latitude": user_lat, "longitude": user_lon}
    }


@router.get("/geofence/list")
async def list_geofences(request: Request):
    """List all geofences for current user"""
    user = await get_current_user_from_request(request)
    
    user_geofences = [
        gf for gf in GEOFENCES.values() 
        if gf["user_id"] == user.get("user_id")
    ]
    
    return {
        "ok": True,
        "total": len(user_geofences),
        "geofences": user_geofences
    }


# ============================================================================
# VOICE GUIDANCE ENDPOINTS (3.4)
# ============================================================================

@router.post("/voice-guide")
async def generate_voice_guidance(
    request: Request,
    guidance_data: Dict = None
):
    """Generate turn-by-turn voice instructions for simplified routes"""
    user = await get_current_user_from_request(request)
    
    try:
        start_lat = guidance_data.get("start_latitude")
        start_lon = guidance_data.get("start_longitude")
        end_lat = guidance_data.get("end_latitude")
        end_lon = guidance_data.get("end_longitude")
        mode = guidance_data.get("mode", "walking")  # walking, cycling, auto
        
        # Generate simplified instructions
        instructions = generate_voice_instructions(start_lat, start_lon, end_lat, end_lon, mode)
        
        return {
            "ok": True,
            "instructions": instructions,
            "instruction_count": len(instructions),
            "mode": mode,
            "start": {"latitude": start_lat, "longitude": start_lon},
            "destination": {"latitude": end_lat, "longitude": end_lon}
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================================
# CAREGIVER DASHBOARD ENDPOINTS (3.3)
# ============================================================================

@router.get("/caregiver/dashboard")
async def get_caregiver_dashboard(
    request: Request,
    ward_user_id: str = None
):
    """Get real-time dashboard for caregiver monitoring"""
    user = await get_current_user_from_request(request)
    
    # In production, verify caregiver relationship to ward_user_id
    
    # Get active trips for ward
    active_trips = [
        format_guardian_trip(trip_id, trip_data)
        for trip_id, trip_data in ACTIVE_TRIPS.items()
        if trip_data.get("user_id") == ward_user_id
    ]
    
    # Get recent alerts
    recent_alerts = [
        alert for alert in CAREGIVER_ALERTS.values()
        if alert.get("user_id") == ward_user_id
    ][-5:]  # Last 5 alerts
    
    return {
        "ok": True,
        "ward_user_id": ward_user_id,
        "active_trips": active_trips,
        "active_trip_count": len(active_trips),
        "recent_alerts": recent_alerts,
        "alert_count": len(recent_alerts),
        "last_update": datetime.utcnow().isoformat()
    }


@router.get("/caregiver/trip/{trip_id}")
async def get_trip_details(
    request: Request,
    trip_id: str
):
    """Get detailed trip information for caregiver"""
    user = await get_current_user_from_request(request)
    
    if trip_id not in ACTIVE_TRIPS:
        raise HTTPException(status_code=404, detail="Trip not found")
    
    trip_data = ACTIVE_TRIPS[trip_id]
    
    return {
        "ok": True,
        "trip": format_guardian_trip(trip_id, trip_data),
        "breadcrumb_trail": trip_data.get("breadcrumbs", []),
        "eta_minutes": trip_data.get("eta_minutes", 15),
        "estimated_arrival": (
            datetime.utcnow() + timedelta(minutes=trip_data.get("eta_minutes", 15))
        ).isoformat()
    }


# ============================================================================
# BUS/TRAIN RECOGNITION ENDPOINTS (3.5)
# ============================================================================

@router.post("/transport/recognize")
async def recognize_transport(
    request: Request,
    recognition_data: Dict = None
):
    """Detect bus/train from camera feed using ML model"""
    user = await get_current_user_from_request(request)
    
    try:
        # In production, use YOLO or similar ML model
        # For now, return mock detection
        image_url = recognition_data.get("image_url")
        confidence = random.uniform(0.7, 0.99)
        
        detected_types = []
        if random.random() > 0.3:
            detected_types.append({
                "type": TransportType.BUS.value,
                "confidence": confidence,
                "route_number": f"Route {random.randint(1, 100)}",
                "location": recognition_data.get("location", "Unknown")
            })
        
        return {
            "ok": True,
            "image_url": image_url,
            "detected_transports": detected_types,
            "detected_count": len(detected_types),
            "timestamp": datetime.utcnow().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================================
# SOS FLOW ENDPOINTS (3.6)
# ============================================================================

@router.post("/sos")
async def trigger_guardian_sos(
    request: Request,
    sos_data: Dict = None,
    background_tasks: BackgroundTasks = None
):
    """Trigger SOS with Guardian escalation: SMS + caregiver notification + live location"""
    user = await get_current_user_from_request(request)
    
    try:
        sos_id = f"SOS-{random.randint(100000, 999999)}"
        
        sos_record = {
            "sos_id": sos_id,
            "user_id": user.get("user_id"),
            "reason": sos_data.get("reason", "General emergency"),
            "latitude": sos_data.get("latitude"),
            "longitude": sos_data.get("longitude"),
            "timestamp": datetime.utcnow().isoformat(),
            "status": "active",
            "escalation_steps": []
        }
        
        # Step 1: Send SMS to caregiver
        caregiver_phone = sos_data.get("caregiver_phone")
        if caregiver_phone and background_tasks:
            background_tasks.add_task(
                send_sos_sms, 
                caregiver_phone, 
                sos_record
            )
            sos_record["escalation_steps"].append({
                "step": 1,
                "action": "SMS sent to caregiver",
                "timestamp": datetime.utcnow().isoformat(),
                "status": "completed"
            })
        
        # Step 2: Send push notification to caregiver app
        sos_record["escalation_steps"].append({
            "step": 2,
            "action": "Push notification to caregiver app",
            "timestamp": datetime.utcnow().isoformat(),
            "status": "completed"
        })
        
        # Step 3: Enable live location sharing
        sos_record["escalation_steps"].append({
            "step": 3,
            "action": "Live location sharing activated",
            "timestamp": datetime.utcnow().isoformat(),
            "status": "completed"
        })
        
        # Step 4: Contact emergency services (optional)
        if sos_data.get("contact_emergency"):
            sos_record["escalation_steps"].append({
                "step": 4,
                "action": "Emergency services contacted",
                "timestamp": datetime.utcnow().isoformat(),
                "status": "pending"
            })
        
        return {
            "ok": True,
            "sos_id": sos_id,
            "message": "SOS triggered successfully",
            "escalation": sos_record,
            "caregiver_notified": bool(caregiver_phone),
            "live_location_sharing_enabled": True
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================================
# SIMPLIFIED ONE-TAP BOOKING ENDPOINTS (3.7)
# ============================================================================

@router.post("/simplified-book")
async def simplified_one_tap_booking(
    request: Request,
    booking_data: Dict = None
):
    """One-tap booking to saved destinations (Home/Hospital/Temple/Work/School)"""
    user = await get_current_user_from_request(request)
    
    try:
        destination_type = booking_data.get("destination", GuardianDestination.HOME.value)
        current_lat = booking_data.get("current_latitude")
        current_lon = booking_data.get("current_longitude")
        
        # Define preset destinations (in production, fetch from user profile)
        destinations = {
            GuardianDestination.HOME.value: {"lat": 13.0826, "lon": 80.2707, "name": "Home"},
            GuardianDestination.HOSPITAL.value: {"lat": 13.0645, "lon": 80.2449, "name": "Hospital"},
            GuardianDestination.TEMPLE.value: {"lat": 13.0489, "lon": 80.2295, "name": "Temple"},
            GuardianDestination.WORK.value: {"lat": 13.1939, "lon": 80.1305, "name": "Work"},
            GuardianDestination.SCHOOL.value: {"lat": 13.0349, "lon": 80.2704, "name": "School"},
        }
        
        dest_coords = destinations.get(destination_type)
        if not dest_coords:
            raise ValueError(f"Unknown destination: {destination_type}")
        
        trip_id = f"TRIP-{random.randint(100000, 999999)}"
        
        distance = calculate_distance(
            current_lat, current_lon,
            dest_coords["lat"], dest_coords["lon"]
        )
        eta_minutes = int(distance * 2)  # Rough estimate: 2 min per km
        
        trip = {
            "trip_id": trip_id,
            "user_id": user.get("user_id"),
            "destination": destination_type,
            "destination_name": dest_coords["name"],
            "destination_lat": dest_coords["lat"],
            "destination_lon": dest_coords["lon"],
            "origin_lat": current_lat,
            "origin_lon": current_lon,
            "distance_km": distance,
            "eta_minutes": eta_minutes,
            "start_time": datetime.utcnow().isoformat(),
            "status": "confirmed",
            "latitude": current_lat,
            "longitude": current_lon,
            "geofence_status": "safe"
        }
        
        ACTIVE_TRIPS[trip_id] = trip
        
        return {
            "ok": True,
            "trip_id": trip_id,
            "message": f"Ride booked to {dest_coords['name']}",
            "destination": destination_type,
            "destination_name": dest_coords["name"],
            "distance_km": distance,
            "eta_minutes": eta_minutes,
            "trip": trip
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/simplified-destinations")
async def get_saved_destinations(request: Request):
    """Get list of preset destinations for quick booking"""
    user = await get_current_user_from_request(request)
    
    destinations = [
        {
            "type": GuardianDestination.HOME.value,
            "name": "Home",
            "latitude": 13.0826,
            "longitude": 80.2707,
            "emoji": "🏠"
        },
        {
            "type": GuardianDestination.HOSPITAL.value,
            "name": "Hospital",
            "latitude": 13.0645,
            "longitude": 80.2449,
            "emoji": "🏥"
        },
        {
            "type": GuardianDestination.TEMPLE.value,
            "name": "Temple",
            "latitude": 13.0489,
            "longitude": 80.2295,
            "emoji": "🛕"
        },
        {
            "type": GuardianDestination.WORK.value,
            "name": "Work",
            "latitude": 13.1939,
            "longitude": 80.1305,
            "emoji": "💼"
        },
        {
            "type": GuardianDestination.SCHOOL.value,
            "name": "School",
            "latitude": 13.0349,
            "longitude": 80.2704,
            "emoji": "🎓"
        }
    ]
    
    return {
        "ok": True,
        "destinations": destinations,
        "count": len(destinations)
    }


# ============================================================================
# HELPER BACKGROUND TASKS
# ============================================================================

async def send_sms_alert(breach_alert: Dict):
    """Send SMS alert to caregiver on geofence breach"""
    # In production, integrate with Twilio or similar
    print(f"[SMS] Geofence breach alert sent to {breach_alert.get('caregiver_phone')}")


async def send_sos_sms(phone: str, sos_record: Dict):
    """Send SOS alert SMS to caregiver"""
    # In production, integrate with Twilio or similar
    print(f"[SMS] SOS alert sent to {phone}: {sos_record.get('reason')}")
