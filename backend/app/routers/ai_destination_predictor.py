"""
AI Destination Predictor Router — Smart destination suggestions based on context
Features: Time-of-day patterns, day-of-week habits, calendar awareness, historical rides, traffic
"""

from fastapi import APIRouter, Request, HTTPException, Body
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple
import random
from enum import Enum

from app.utils.rbac import get_current_user_from_request

router = APIRouter(prefix="/api/ai", tags=["ai-predictor"])


# ============================================================================
# DATA MODELS
# ============================================================================

class PredictedDestination(str, Enum):
    OFFICE = "office"
    HOME = "home"
    GYM = "gym"
    HOSPITAL = "hospital"
    TEMPLE = "temple"
    AIRPORT = "airport"
    RAILWAY_STATION = "railway_station"
    SHOPPING = "shopping"
    RESTAURANT = "restaurant"
    SCHOOL = "school"


# In-memory storage for demo (replace with MongoDB in production)
USER_RIDE_HISTORY = {}  # {user_id: [ride_records]}
USER_PREFERENCES = {}  # {user_id: user_prefs}


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_time_bucket(hour: int) -> str:
    """Classify hour into time period"""
    if 5 <= hour < 9:
        return "morning_commute"
    elif 9 <= hour < 12:
        return "mid_morning"
    elif 12 <= hour < 14:
        return "lunch"
    elif 14 <= hour < 18:
        return "afternoon"
    elif 18 <= hour < 21:
        return "evening_commute"
    elif 21 <= hour < 23:
        return "night"
    else:
        return "late_night"


def get_day_type(day_of_week: int) -> str:
    """Classify day (0=Monday, 6=Sunday)"""
    return "weekend" if day_of_week >= 5 else "weekday"


def calculate_destination_scores(
    hour: int,
    day_of_week: int,
    ride_history: List[Dict],
    has_calendar_event: bool = False,
    calendar_event_type: Optional[str] = None
) -> Dict[str, float]:
    """
    Calculate confidence scores for each destination based on multiple factors.
    Returns dict with destination types and their scores (0-100).
    """
    scores = {}
    time_bucket = get_time_bucket(hour)
    day_type = get_day_type(day_of_week)
    
    # =========================================================================
    # TIME-OF-DAY PATTERNS
    # =========================================================================
    if time_bucket == "morning_commute" and day_type == "weekday":
        scores[PredictedDestination.OFFICE.value] = 70
        scores[PredictedDestination.GYM.value] = 15
        scores[PredictedDestination.HOSPITAL.value] = 5
    
    elif time_bucket == "lunch" and day_type == "weekday":
        scores[PredictedDestination.RESTAURANT.value] = 50
        scores[PredictedDestination.OFFICE.value] = 30
        scores[PredictedDestination.SHOPPING.value] = 10
    
    elif time_bucket == "evening_commute" and day_type == "weekday":
        scores[PredictedDestination.HOME.value] = 75
        scores[PredictedDestination.GYM.value] = 10
        scores[PredictedDestination.RESTAURANT.value] = 10
    
    elif day_type == "weekend" and time_bucket == "morning_commute":
        scores[PredictedDestination.TEMPLE.value] = 40
        scores[PredictedDestination.SHOPPING.value] = 35
        scores[PredictedDestination.GYM.value] = 15
        scores[PredictedDestination.RESTAURANT.value] = 10
    
    elif day_type == "weekend" and time_bucket in ["afternoon", "evening_commute"]:
        scores[PredictedDestination.SHOPPING.value] = 45
        scores[PredictedDestination.RESTAURANT.value] = 40
        scores[PredictedDestination.TEMPLE.value] = 10
        scores[PredictedDestination.HOME.value] = 5
    
    else:
        # Default neutral distribution
        scores = {
            PredictedDestination.HOME.value: 30,
            PredictedDestination.OFFICE.value: 25,
            PredictedDestination.SHOPPING.value: 20,
            PredictedDestination.RESTAURANT.value: 15,
            PredictedDestination.TEMPLE.value: 10,
        }
    
    # =========================================================================
    # BOOST BASED ON CALENDAR EVENTS
    # =========================================================================
    if has_calendar_event and calendar_event_type:
        if "doctor" in calendar_event_type.lower() or "hospital" in calendar_event_type.lower():
            scores[PredictedDestination.HOSPITAL.value] = 95
        elif "airport" in calendar_event_type.lower():
            scores[PredictedDestination.AIRPORT.value] = 95
        elif "train" in calendar_event_type.lower():
            scores[PredictedDestination.RAILWAY_STATION.value] = 95
    
    # =========================================================================
    # BOOST BASED ON HISTORICAL RIDES
    # =========================================================================
    if ride_history:
        # Count destination frequencies from last 30 days
        destination_count = {}
        cutoff_date = datetime.utcnow() - timedelta(days=30)
        
        for ride in ride_history:
            ride_date = datetime.fromisoformat(ride.get("timestamp", ""))
            if ride_date > cutoff_date:
                dest = ride.get("destination_type", "unknown")
                destination_count[dest] = destination_count.get(dest, 0) + 1
        
        # Boost top historical destinations
        if destination_count:
            top_dest = max(destination_count, key=destination_count.get)
            if top_dest in scores:
                scores[top_dest] = min(scores[top_dest] + 20, 100)
    
    return scores


def get_destination_details(dest_type: str) -> Dict:
    """Get emoji, name, and mock coordinates for destination"""
    details_map = {
        PredictedDestination.OFFICE.value: {
            "name": "Office",
            "emoji": "💼",
            "latitude": 13.1939,
            "longitude": 80.1305,
            "color": "#4338CA"
        },
        PredictedDestination.HOME.value: {
            "name": "Home",
            "emoji": "🏠",
            "latitude": 13.0826,
            "longitude": 80.2707,
            "color": "#047857"
        },
        PredictedDestination.GYM.value: {
            "name": "Gym",
            "emoji": "💪",
            "latitude": 13.0450,
            "longitude": 80.2450,
            "color": "#DC2626"
        },
        PredictedDestination.HOSPITAL.value: {
            "name": "Hospital",
            "emoji": "🏥",
            "latitude": 13.0645,
            "longitude": 80.2449,
            "color": "#E11D48"
        },
        PredictedDestination.TEMPLE.value: {
            "name": "Temple",
            "emoji": "🛕",
            "latitude": 13.0489,
            "longitude": 80.2295,
            "color": "#F59E0B"
        },
        PredictedDestination.AIRPORT.value: {
            "name": "Airport",
            "emoji": "✈️",
            "latitude": 13.1939,
            "longitude": 80.1305,
            "color": "#0369A1"
        },
        PredictedDestination.RAILWAY_STATION.value: {
            "name": "Railway Station",
            "emoji": "🚂",
            "latitude": 13.0826,
            "longitude": 80.2707,
            "color": "#7C3AED"
        },
        PredictedDestination.SHOPPING.value: {
            "name": "Shopping Mall",
            "emoji": "🛍️",
            "latitude": 13.0450,
            "longitude": 80.2200,
            "color": "#DB2777"
        },
        PredictedDestination.RESTAURANT.value: {
            "name": "Restaurant",
            "emoji": "🍽️",
            "latitude": 13.0500,
            "longitude": 80.2700,
            "color": "#EA580C"
        },
        PredictedDestination.SCHOOL.value: {
            "name": "School",
            "emoji": "🎓",
            "latitude": 13.0349,
            "longitude": 80.2704,
            "color": "#059669"
        },
    }
    return details_map.get(dest_type, {"name": "Unknown", "emoji": "📍", "latitude": 0, "longitude": 0, "color": "#666"})


# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.post("/predict-destination")
async def predict_destination(
    request: Request,
    prediction_data: Dict = Body(default=None, embed=False)
):
    """
    Predict the user's next destination based on:
    - Current time and day
    - Historical ride patterns
    - Calendar events (if available)
    - Traffic conditions (mock)
    
    Returns top 3 predicted destinations with confidence scores and details.
    """
    user = await get_current_user_from_request(request)
    user_id = user.get("user_id")
    
    try:
        # Get current time or use provided time
        now = datetime.utcnow()
        if prediction_data and prediction_data.get("timestamp"):
            now = datetime.fromisoformat(prediction_data["timestamp"])
        
        hour = now.hour
        day_of_week = now.weekday()  # 0=Monday, 6=Sunday
        
        # Get user's ride history (mock for now)
        ride_history = USER_RIDE_HISTORY.get(user_id, [])
        
        # Check for calendar events (mock)
        has_calendar_event = prediction_data and prediction_data.get("has_calendar_event", False)
        calendar_event_type = prediction_data and prediction_data.get("calendar_event_type")
        
        # Calculate scores for all destinations
        scores = calculate_destination_scores(
            hour,
            day_of_week,
            ride_history,
            has_calendar_event,
            calendar_event_type
        )
        
        # Sort by score and get top 3
        sorted_destinations = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:3]
        
        # Enrich with details and format response
        predictions = []
        for dest_type, score in sorted_destinations:
            details = get_destination_details(dest_type)
            predictions.append({
                "destination_type": dest_type,
                "confidence_score": round(score),
                "name": details["name"],
                "emoji": details["emoji"],
                "latitude": details["latitude"],
                "longitude": details["longitude"],
                "color": details["color"],
            })
        
        return {
            "ok": True,
            "user_id": user_id,
            "predictions": predictions,
            "prediction_count": len(predictions),
            "current_time": now.isoformat(),
            "day_of_week": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"][day_of_week],
            "time_bucket": get_time_bucket(hour),
        }
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/log-ride")
async def log_ride_for_prediction(
    request: Request,
    ride_data: Dict = Body(default=None, embed=False)
):
    """
    Log a completed ride to improve destination predictions.
    This trains the predictor over time.
    """
    user = await get_current_user_from_request(request)
    user_id = user.get("user_id")
    
    try:
        ride_record = {
            "destination_type": ride_data.get("destination_type"),
            "timestamp": datetime.utcnow().isoformat(),
            "day_of_week": datetime.utcnow().weekday(),
            "hour": datetime.utcnow().hour,
            "origin_latitude": ride_data.get("origin_latitude"),
            "origin_longitude": ride_data.get("origin_longitude"),
            "duration_minutes": ride_data.get("duration_minutes"),
            "distance_km": ride_data.get("distance_km"),
        }
        
        if user_id not in USER_RIDE_HISTORY:
            USER_RIDE_HISTORY[user_id] = []
        
        USER_RIDE_HISTORY[user_id].append(ride_record)
        
        # Keep only last 100 rides
        USER_RIDE_HISTORY[user_id] = USER_RIDE_HISTORY[user_id][-100:]
        
        return {
            "ok": True,
            "message": "Ride logged for prediction training",
            "ride_count": len(USER_RIDE_HISTORY[user_id])
        }
    
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/destination-stats/{user_id}")
async def get_destination_stats(
    request: Request,
    user_id: str
):
    """Get destination frequency statistics for a user"""
    user = await get_current_user_from_request(request)
    
    # Verify user can access this data
    if user.get("user_id") != user_id:
        raise HTTPException(status_code=403, detail="Unauthorized")
    
    ride_history = USER_RIDE_HISTORY.get(user_id, [])
    
    # Count destination frequencies
    destination_counts = {}
    for ride in ride_history:
        dest = ride.get("destination_type", "unknown")
        destination_counts[dest] = destination_counts.get(dest, 0) + 1
    
    # Get top destinations
    top_destinations = sorted(destination_counts.items(), key=lambda x: x[1], reverse=True)[:5]
    
    return {
        "ok": True,
        "user_id": user_id,
        "total_rides": len(ride_history),
        "total_unique_destinations": len(destination_counts),
        "top_destinations": [
            {
                "destination_type": dest,
                "count": count,
                "percentage": round((count / len(ride_history)) * 100) if ride_history else 0,
                "details": get_destination_details(dest)
            }
            for dest, count in top_destinations
        ],
        "last_30_days_rides": len([r for r in ride_history if datetime.fromisoformat(r["timestamp"]) > datetime.utcnow() - timedelta(days=30)])
    }
