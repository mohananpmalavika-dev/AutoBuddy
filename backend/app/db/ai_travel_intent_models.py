"""
AI Travel Intent Engine - Data Models

Handles intent recognition, destination suggestions, and lifestyle-based recommendations.
Transforms "Where are you heading?" into "Movie with friends" → Cinepolis Kollam
"""

from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from enum import Enum
from datetime import datetime


class IntentCategory(str, Enum):
    """Lifestyle intent categories"""
    ENTERTAINMENT = "entertainment"  # Movies, concerts, events
    DINING = "dining"  # Restaurants, cafes
    SHOPPING = "shopping"  # Malls, markets, stores
    MEDICAL = "medical"  # Hospitals, clinics
    EDUCATION = "education"  # Schools, colleges, training centers
    SPORTS = "sports"  # Gyms, stadiums, sports venues
    TRAVEL = "travel"  # Airports, stations, tourist spots
    BUSINESS = "business"  # Offices, co-working spaces
    WELLNESS = "wellness"  # Spas, salons, yoga studios
    PERSONAL = "personal"  # Home, office, custom location


class LocationCategory(str, Enum):
    """Business location categories"""
    MULTIPLEX = "multiplex"
    RESTAURANT = "restaurant"
    MALL = "mall"
    HOSPITAL = "hospital"
    SCHOOL = "school"
    OFFICE = "office"
    AIRPORT = "airport"
    RAILWAY = "railway"
    GYM = "gym"
    CAFE = "cafe"
    OTHER = "other"


class VehicleType(str, Enum):
    """Vehicle types for suggestions"""
    AUTO = "auto"
    CAB = "cab"
    PREMIUM = "premium"
    XL = "xl"


class IntentRequest(BaseModel):
    """User input for intent recognition"""
    query: str = Field(..., description="User's natural language query (e.g., 'Movie with friends')")
    current_location: Optional[Dict[str, float]] = Field(
        None,
        description="Current location {latitude, longitude}"
    )
    num_passengers: int = Field(1, ge=1, le=6, description="Number of passengers")
    preferences: Optional[Dict[str, Any]] = Field(
        None,
        description="User preferences (vehicle_type, budget, etc.)"
    )
    user_id: Optional[str] = Field(None, description="User ID for personalization")

    @validator('query')
    def query_not_empty(cls, v):
        if not v or len(v.strip()) < 2:
            raise ValueError('Query must be at least 2 characters')
        return v.lower().strip()


class Location(BaseModel):
    """Business location/destination"""
    id: str
    name: str
    category: LocationCategory
    address: str
    latitude: float
    longitude: float
    phone: Optional[str] = None
    website: Optional[str] = None
    opening_hours: Optional[str] = None
    rating: Optional[float] = Field(None, ge=0, le=5)
    reviews_count: Optional[int] = None
    capacity: Optional[int] = None  # For venues
    amenities: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    distance_meters: Optional[float] = None  # Calculated from user location
    estimated_travel_time_minutes: Optional[int] = None


class PricingDetails(BaseModel):
    """Ride pricing"""
    vehicle_type: VehicleType
    base_fare: float
    per_km_charge: float
    per_minute_charge: float
    estimated_fare: float
    minimum_fare: float = 0
    surge_multiplier: float = 1.0
    estimated_distance_km: float
    estimated_duration_minutes: int


class IntentSuggestion(BaseModel):
    """AI-generated suggestion for user intent"""
    id: str = Field(description="Unique suggestion ID")
    location: Location = Field(description="Suggested destination")
    intent_matched: str = Field(description="What intent was matched (e.g., 'Movie')")
    confidence_score: float = Field(ge=0, le=1, description="Confidence in suggestion (0-1)")
    
    # Availability & Booking Info
    seats_available: int = Field(description="Number of seats available at location")
    estimated_arrival_minutes: int = Field(description="Minutes to reach location")
    
    # Pricing for different vehicles
    pricing_options: List[PricingDetails] = Field(description="Pricing for different vehicles")
    
    # Additional context
    reason: str = Field(description="Why this suggestion (e.g., '4.5⭐ nearest multiplex')")
    busy_level: Optional[str] = Field(None, description="Current busy level: quiet, moderate, busy, very_busy")
    special_offers: Optional[List[str]] = Field(None, description="Active offers at location")
    
    created_at: datetime = Field(default_factory=datetime.utcnow)


class IntentRecognitionResult(BaseModel):
    """Result of intent recognition"""
    query: str
    identified_intent: Optional[str] = Field(None, description="Identified intent (movie, dining, etc.)")
    intent_category: Optional[IntentCategory] = None
    entities: Dict[str, Any] = Field(default_factory=dict, description="Extracted entities (group size, time, etc.)")
    confidence: float = Field(ge=0, le=1, description="Confidence in recognition")
    is_valid_intent: bool = Field(description="Whether query is valid for ride booking")
    error_message: Optional[str] = None


class IntentParsedData(BaseModel):
    """Parsed data from intent"""
    group_size: int = 1
    event_type: Optional[str] = None  # movie, dinner, shopping, etc.
    time_hint: Optional[str] = None  # now, tonight, tomorrow
    budget_range: Optional[str] = None  # economy, medium, premium
    companion_types: Optional[List[str]] = None  # friends, family, date


class PreferredDestination(BaseModel):
    """User's preferred destination"""
    id: str
    user_id: str
    location: Location
    name: str
    visits_count: int = 0
    last_visited: Optional[datetime] = None
    is_saved: bool = True
    is_home: bool = False
    is_work: bool = False
    notes: Optional[str] = None


class UserIntentPreference(BaseModel):
    """User preferences for intent-based suggestions"""
    id: str
    user_id: str
    preferred_categories: List[IntentCategory] = Field(description="Categories user prefers")
    ignored_categories: List[IntentCategory] = Field(default_factory=list)
    favorite_locations: List[str] = Field(description="Location IDs of favorites")
    budget_preference: Optional[str] = None  # economy, medium, premium
    vehicle_preference: Optional[VehicleType] = None
    time_preferences: Optional[Dict[str, str]] = None  # preferred times for different activities
    allow_personalization: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class IntentHistory(BaseModel):
    """History of user intent searches"""
    id: str
    user_id: str
    query: str
    identified_intent: Optional[str]
    suggestions_shown: List[str] = Field(description="Location IDs suggested")
    suggestion_selected: Optional[str] = Field(None, description="Which suggestion was selected")
    booking_completed: bool = False
    ride_id: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)


class IntentQuickBookRequest(BaseModel):
    """Quick booking from suggestion"""
    suggestion_id: str
    vehicle_type: VehicleType
    num_passengers: int = Field(default=1, ge=1, le=6)
    payment_method_id: Optional[str] = None
    notes: Optional[str] = None
    scheduled_time: Optional[datetime] = None  # For pre-booking


class TrendingDestination(BaseModel):
    """Trending destination based on intent searches"""
    id: str
    location: Location
    intent_category: IntentCategory
    search_count_today: int
    search_count_week: int
    booking_conversion_rate: float  # Percentage of searches that led to bookings
    average_rating: float
    trending_score: float = Field(ge=0, le=100, description="Trending score 0-100")


class LocationStock(BaseModel):
    """Real-time availability at location"""
    location_id: str
    timestamp: datetime
    parking_available: Optional[int] = None
    tables_available: Optional[int] = None
    seats_available: Optional[int] = None
    current_capacity_percent: Optional[float] = None  # Percentage occupied
    wait_time_minutes: Optional[int] = None
    busy_level: str = Field(description="quiet, moderate, busy, very_busy")
    notes: Optional[str] = None


class SearchMetrics(BaseModel):
    """Metrics for intent search"""
    id: str
    query: str
    total_searches: int
    unique_users: int
    top_selected_location: Optional[str]
    conversion_rate: float
    average_response_time_ms: float
    timestamp: datetime = Field(default_factory=datetime.utcnow)
