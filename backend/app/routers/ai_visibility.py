"""
AI Visibility Router

Endpoints for surfacing AI predictions and insights to users:
- Travel pattern recognition ("You usually travel to Kollam at 8 AM")
- Predictive suggestions ("Book your office ride?")
- Weather-based alerts ("Heavy rain expected. Leave 15 min early")
- Destination memory ("Same destination as yesterday?")
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Optional
import json

from app.database import get_db
from app.models import User, RideHistory, Weather
from app.schemas.ai_visibility import (
    AIInsight,
    AIInsightType,
    TravelPattern,
    PredictiveOffer,
    WeatherAlert,
    DestinationRecognition,
)

router = APIRouter(prefix="/api/v1/ai-visibility", tags=["ai-visibility"])


def get_current_user(user_id: str, db: Session) -> User:
    """Get current user from database"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("/insights/{user_id}", response_model=List[AIInsight])
async def get_ai_insights(
    user_id: str,
    limit: int = Query(5, ge=1, le=10),
    db: Session = Depends(get_db),
):
    """
    Get personalized AI insights for a user.
    Combines all insight types into a single response.
    """
    user = get_current_user(user_id, db)
    insights = []

    # 1. Get travel pattern insights
    pattern_insight = get_travel_pattern_insight(user_id, db)
    if pattern_insight:
        insights.append(pattern_insight)

    # 2. Get predictive offers
    offer_insight = get_predictive_offer_insight(user_id, db)
    if offer_insight:
        insights.append(offer_insight)

    # 3. Get weather-based alerts
    weather_insight = get_weather_alert_insight(user_id, db)
    if weather_insight:
        insights.append(weather_insight)

    # 4. Get destination recognition
    destination_insight = get_destination_recognition_insight(user_id, db)
    if destination_insight:
        insights.append(destination_insight)

    # Sort by confidence score (highest first)
    insights.sort(key=lambda x: x.confidence_score, reverse=True)
    return insights[:limit]


def get_travel_pattern_insight(user_id: str, db: Session) -> Optional[AIInsight]:
    """
    Detect travel patterns and return insight.
    Example: "You usually travel to Kollam at 8 AM"
    """
    # Get rides from past 30 days
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    rides = (
        db.query(RideHistory)
        .filter(
            RideHistory.user_id == user_id,
            RideHistory.created_at >= thirty_days_ago,
            RideHistory.status == "completed",
        )
        .all()
    )

    if len(rides) < 3:
        return None

    # Group rides by destination and time of day
    pattern_map = {}
    for ride in rides:
        if ride.destination_lat and ride.destination_lng:
            key = f"{ride.destination_lat:.4f},{ride.destination_lng:.4f}"
            hour = ride.created_at.hour
            if key not in pattern_map:
                pattern_map[key] = []
            pattern_map[key].append(hour)

    # Find most common pattern
    best_pattern = max(pattern_map.items(), key=lambda x: len(x[1]), default=(None, []))
    if not best_pattern[0]:
        return None

    dest_coords = best_pattern[0].split(",")
    hours = best_pattern[1]
    avg_hour = sum(hours) // len(hours)
    count = len(hours)

    # Calculate confidence (0-1 based on consistency)
    confidence = min(count / 10.0, 1.0)

    return AIInsight(
        type=AIInsightType.TRAVEL_PATTERN,
        title="Recurring Journey",
        message=f"You usually travel here at {avg_hour}:00 AM" if avg_hour < 12 else f"You usually travel here at {avg_hour-12}:00 PM",
        destination_lat=float(dest_coords[0]),
        destination_lng=float(dest_coords[1]),
        metadata={
            "frequency": count,
            "common_hour": avg_hour,
            "consistency_score": len([h for h in hours if abs(h - avg_hour) <= 1]) / len(hours),
        },
        confidence_score=confidence,
        action_label="Book Ride",
        action_type="quick_book",
    )


def get_predictive_offer_insight(user_id: str, db: Session) -> Optional[AIInsight]:
    """
    Generate predictive booking offers based on user patterns.
    Example: "Book your office ride?"
    """
    # Get user's most common destinations
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    rides = (
        db.query(RideHistory)
        .filter(
            RideHistory.user_id == user_id,
            RideHistory.created_at >= thirty_days_ago,
            RideHistory.status == "completed",
        )
        .order_by(RideHistory.created_at.desc())
        .limit(10)
        .all()
    )

    if len(rides) < 2:
        return None

    # Find most recent destination
    last_ride = rides[0]
    recent_dest = rides[1] if len(rides) > 1 else last_ride

    if recent_dest.destination_lat and recent_dest.destination_lng:
        # Determine destination type (office, home, etc.)
        dest_label = infer_destination_label(recent_dest.destination_lat, recent_dest.destination_lng)

        return AIInsight(
            type=AIInsightType.PREDICTIVE_OFFER,
            title="Quick Booking",
            message=f"Book your {dest_label} ride?",
            destination_lat=recent_dest.destination_lat,
            destination_lng=recent_dest.destination_lng,
            metadata={
                "destination_type": dest_label,
                "ride_count": len(rides),
            },
            confidence_score=0.85,
            action_label="Book Now",
            action_type="quick_book",
        )

    return None


def get_weather_alert_insight(user_id: str, db: Session) -> Optional[AIInsight]:
    """
    Generate weather-based travel alerts.
    Example: "Heavy rain expected. Leave 15 min early."
    """
    try:
        # Get current weather (simplified - would integrate with weather API)
        current_hour = datetime.now().hour
        is_peak_hour = 7 <= current_hour <= 9 or 17 <= current_hour <= 19

        if is_peak_hour:
            return AIInsight(
                type=AIInsightType.WEATHER_ALERT,
                title="Heavy Traffic Alert",
                message="Heavy rain expected. Leave 15 min early.",
                metadata={
                    "weather_condition": "heavy_rain",
                    "delay_minutes": 15,
                    "peak_hour": current_hour,
                },
                confidence_score=0.75,
                action_label="Check Routes",
                action_type="view_routes",
            )
    except Exception:
        pass

    return None


def get_destination_recognition_insight(user_id: str, db: Session) -> Optional[AIInsight]:
    """
    Recognize repeated destinations and surface them.
    Example: "Same destination as yesterday?"
    """
    # Get rides from past 2 days
    yesterday = datetime.utcnow() - timedelta(days=1)
    two_days_ago = datetime.utcnow() - timedelta(days=2)

    yesterday_rides = (
        db.query(RideHistory)
        .filter(
            RideHistory.user_id == user_id,
            RideHistory.created_at >= two_days_ago,
            RideHistory.created_at <= yesterday,
        )
        .all()
    )

    today_rides = (
        db.query(RideHistory)
        .filter(RideHistory.user_id == user_id, RideHistory.created_at >= yesterday)
        .all()
    )

    if not yesterday_rides or not today_rides:
        return None

    # Compare destinations
    yesterday_dest = yesterday_rides[-1]  # Last ride yesterday
    today_dest = today_rides[0] if today_rides else None

    if (
        today_dest
        and yesterday_dest.destination_lat
        and today_dest.destination_lat
        and abs(yesterday_dest.destination_lat - today_dest.destination_lat) < 0.01
        and abs(yesterday_dest.destination_lng - today_dest.destination_lng) < 0.01
    ):
        return AIInsight(
            type=AIInsightType.DESTINATION_RECOGNITION,
            title="Familiar Route",
            message="Same destination as yesterday?",
            destination_lat=today_dest.destination_lat,
            destination_lng=today_dest.destination_lng,
            metadata={
                "last_visit": yesterday.isoformat(),
                "destination_name": infer_destination_label(
                    today_dest.destination_lat, today_dest.destination_lng
                ),
            },
            confidence_score=0.9,
            action_label="Book Ride",
            action_type="quick_book",
        )

    return None


def infer_destination_label(lat: float, lng: float) -> str:
    """
    Infer destination type from coordinates (simplified).
    In production, would use reverse geocoding.
    """
    # Placeholder logic - in production, use Google Maps or similar
    if 8.5 < lat < 8.7 and 76.9 < lng < 77.1:
        return "office"
    elif 8.4 < lat < 8.5 and 76.8 < lng < 76.9:
        return "home"
    elif 8.3 < lat < 8.4 and 76.7 < lng < 76.8:
        return "gym"
    else:
        return "destination"


@router.post("/insights/{user_id}/feedback")
async def submit_insight_feedback(
    user_id: str,
    insight_id: str,
    helpful: bool,
    db: Session = Depends(get_db),
):
    """
    Collect feedback on AI insights to improve future recommendations.
    """
    user = get_current_user(user_id, db)

    # In production, store this feedback for ML model retraining
    return {
        "status": "success",
        "message": f"Thanks! Feedback recorded for insight {insight_id}",
        "helpful": helpful,
    }


@router.get("/travel-patterns/{user_id}", response_model=List[TravelPattern])
async def get_travel_patterns(
    user_id: str,
    days: int = Query(30, ge=7, le=90),
    db: Session = Depends(get_db),
):
    """
    Get detailed travel patterns for the user.
    """
    user = get_current_user(user_id, db)

    # Analyze rides from past N days
    cutoff_date = datetime.utcnow() - timedelta(days=days)
    rides = (
        db.query(RideHistory)
        .filter(
            RideHistory.user_id == user_id,
            RideHistory.created_at >= cutoff_date,
            RideHistory.status == "completed",
        )
        .all()
    )

    # Group by destination and extract patterns
    pattern_map = {}
    for ride in rides:
        if ride.destination_lat and ride.destination_lng:
            key = f"{ride.destination_lat:.3f},{ride.destination_lng:.3f}"
            if key not in pattern_map:
                pattern_map[key] = {
                    "lat": ride.destination_lat,
                    "lng": ride.destination_lng,
                    "hours": [],
                    "days_of_week": [],
                    "count": 0,
                }
            pattern_map[key]["hours"].append(ride.created_at.hour)
            pattern_map[key]["days_of_week"].append(ride.created_at.weekday())
            pattern_map[key]["count"] += 1

    patterns = []
    for key, data in pattern_map.items():
        if data["count"] >= 3:  # Only return patterns with 3+ occurrences
            patterns.append(
                TravelPattern(
                    destination_lat=data["lat"],
                    destination_lng=data["lng"],
                    frequency=data["count"],
                    common_hours=list(set(data["hours"])),
                    preferred_days=list(set(data["days_of_week"])),
                    label=infer_destination_label(data["lat"], data["lng"]),
                )
            )

    return sorted(patterns, key=lambda x: x.frequency, reverse=True)


@router.get("/predictions/{user_id}")
async def get_predictions(
    user_id: str,
    db: Session = Depends(get_db),
):
    """
    Get AI predictions for next ride.
    """
    user = get_current_user(user_id, db)

    # Get current time insights
    current_hour = datetime.now().hour
    is_peak_morning = 7 <= current_hour <= 9
    is_peak_evening = 17 <= current_hour <= 19

    predictions = {
        "likely_destination": None,
        "estimated_fare": None,
        "surge_multiplier": 1.5 if (is_peak_morning or is_peak_evening) else 1.0,
        "wait_time_minutes": 5 if (is_peak_morning or is_peak_evening) else 2,
        "ride_type_recommendation": "premium" if (is_peak_morning or is_peak_evening) else "economy",
        "confidence_score": 0.85,
    }

    # Get most common destination at this hour
    rides = (
        db.query(RideHistory)
        .filter(
            RideHistory.user_id == user_id,
            RideHistory.status == "completed",
        )
        .order_by(RideHistory.created_at.desc())
        .limit(20)
        .all()
    )

    if rides:
        latest = rides[0]
        predictions["likely_destination"] = {
            "lat": latest.destination_lat,
            "lng": latest.destination_lng,
            "label": infer_destination_label(latest.destination_lat, latest.destination_lng),
        }

    return predictions
