"""
AI Visibility Schemas

Data models for AI-powered suggestions and insights.
"""

from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


class AIInsightType(str, Enum):
    """Types of AI insights"""
    TRAVEL_PATTERN = "travel_pattern"
    PREDICTIVE_OFFER = "predictive_offer"
    WEATHER_ALERT = "weather_alert"
    DESTINATION_RECOGNITION = "destination_recognition"


class AIInsight(BaseModel):
    """AI insight to show to user"""
    type: AIInsightType
    title: str = Field(..., description="Short title of insight")
    message: str = Field(..., description="User-facing message")
    destination_lat: Optional[float] = None
    destination_lng: Optional[float] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    confidence_score: float = Field(
        ..., ge=0.0, le=1.0, description="Confidence in this prediction (0-1)"
    )
    action_label: str = Field(default="Learn More", description="Label for primary action")
    action_type: str = Field(
        default="view_details",
        description="Type of action: quick_book, view_routes, view_details",
    )
    icon: Optional[str] = None
    color: Optional[str] = None

    class Config:
        schema_extra = {
            "example": {
                "type": "travel_pattern",
                "title": "Recurring Journey",
                "message": "You usually travel to Kollam at 8 AM",
                "destination_lat": 8.567,
                "destination_lng": 76.896,
                "metadata": {
                    "frequency": 5,
                    "common_hour": 8,
                    "consistency_score": 0.95,
                },
                "confidence_score": 0.92,
                "action_label": "Book Ride",
                "action_type": "quick_book",
            }
        }


class TravelPattern(BaseModel):
    """Travel pattern for a user"""
    destination_lat: float
    destination_lng: float
    frequency: int = Field(..., description="Number of times visited")
    common_hours: List[int] = Field(
        default_factory=list, description="Hours when ride typically taken (0-23)"
    )
    preferred_days: List[int] = Field(
        default_factory=list, description="Days of week when ride typically taken (0-6)"
    )
    label: str = Field(default="destination", description="Destination label (office, home, gym)")
    last_visited: Optional[str] = None


class PredictiveOffer(BaseModel):
    """Predictive booking offer"""
    destination_lat: float
    destination_lng: float
    destination_label: str
    estimated_fare: float
    ride_type: str = "economy"
    urgency_score: float = Field(
        ..., ge=0.0, le=1.0, description="How urgent the suggestion is"
    )
    reason: str = Field(..., description="Why this offer is being made")


class WeatherAlert(BaseModel):
    """Weather-related travel alert"""
    alert_type: str = Field(..., description="Type: heavy_rain, snow, heatwave, etc.")
    severity: str = Field(..., description="low, medium, high")
    message: str
    recommended_action: str = Field(
        default="Leave early", description="Suggested action for user"
    )
    time_adjustment_minutes: int = Field(
        default=0, description="Recommended minutes to leave early/late"
    )


class DestinationRecognition(BaseModel):
    """Recognition of repeated destinations"""
    destination_lat: float
    destination_lng: float
    destination_label: str
    last_visited: str = Field(..., description="ISO format datetime of last visit")
    visit_count: int = Field(..., description="Total visits to this destination")
    is_frequent: bool = Field(default=False, description="Is this a frequent destination?")
    message: str = Field(default="Same destination as yesterday?")


class AIInsightFeedback(BaseModel):
    """Feedback on AI insight"""
    insight_id: str
    helpful: bool
    reason: Optional[str] = None
    rating: Optional[int] = Field(None, ge=1, le=5)


class UserAIPref(BaseModel):
    """User preferences for AI features"""
    enable_travel_patterns: bool = True
    enable_predictive_offers: bool = True
    enable_weather_alerts: bool = True
    enable_destination_recognition: bool = True
    min_confidence_score: float = Field(0.7, ge=0.0, le=1.0)
    max_insights_per_session: int = Field(5, ge=1, le=10)
    notification_frequency: str = Field(
        "smart", description="off, low, smart, aggressive"
    )
