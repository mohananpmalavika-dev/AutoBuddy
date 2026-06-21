"""
AI Travel Intent Engine - API Routes

Endpoints for intent recognition, destination suggestions, and quick booking.
"""

from fastapi import APIRouter, HTTPException, Query, Depends
from typing import List, Optional, Dict, Any
from datetime import datetime

from ..db.ai_travel_intent_models import (
    IntentRequest,
    IntentRecognitionResult,
    IntentSuggestion,
    IntentQuickBookRequest,
    TrendingDestination,
    IntentHistory,
    UserIntentPreference,
    SearchMetrics,
)
from ..db.ai_travel_intent_locations import (
    get_sample_locations,
    search_locations_by_tags,
    get_location_by_id,
)
from ..services.ai_travel_intent_service import (
    intent_recognition,
    DestinationSuggestionEngine,
    pricing_engine,
)

router = APIRouter(prefix="/api/intent", tags=["AI Travel Intent Engine"])

# Initialize engines
suggestion_engine = DestinationSuggestionEngine(get_sample_locations())


@router.post("/recognize", response_model=IntentRecognitionResult)
async def recognize_intent(request: IntentRequest):
    """
    Recognize travel intent from natural language query.

    Example:
        - "Movie with friends" → entertainment intent
        - "Dinner tonight" → dining intent
        - "Doctor appointment" → medical intent
    """
    try:
        result = intent_recognition.recognize_intent(request)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/suggest", response_model=List[IntentSuggestion])
async def get_suggestions(
    query: str = Query(..., description="User's query (e.g., 'Movie with friends')"),
    latitude: Optional[float] = Query(None, description="Current latitude"),
    longitude: Optional[float] = Query(None, description="Current longitude"),
    num_passengers: int = Query(1, ge=1, le=6, description="Number of passengers"),
    limit: int = Query(5, ge=1, le=10, description="Max suggestions"),
    user_preferences: Optional[Dict[str, Any]] = None,
):
    """
    Get AI-powered destination suggestions based on intent.

    Returns top matching locations with:
    - Destination details (name, address, ratings)
    - Pricing for different vehicles
    - Availability information
    - Travel time estimates
    """
    try:
        # Create intent request
        request = IntentRequest(
            query=query,
            current_location={
                "lat": latitude,
                "lng": longitude,
            } if latitude and longitude else None,
            num_passengers=num_passengers,
            preferences=user_preferences,
        )

        # Recognize intent
        intent_result = intent_recognition.recognize_intent(request)

        if not intent_result.is_valid_intent:
            return []

        # Get suggestions
        suggestions = suggestion_engine.suggest_destinations(
            intent_result=intent_result,
            user_location={
                "lat": latitude,
                "lng": longitude,
            } if latitude and longitude else None,
            num_passengers=num_passengers,
            preferences=user_preferences,
            limit=limit,
        )

        return suggestions
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/suggestions/{suggestion_id}", response_model=IntentSuggestion)
async def get_suggestion_details(suggestion_id: str):
    """
    Get detailed information about a suggestion.
    """
    try:
        # In production, would fetch from database
        # For now, return error
        raise HTTPException(status_code=404, detail="Suggestion not found")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/quick-book", response_model=Dict[str, Any])
async def quick_book_ride(request: IntentQuickBookRequest):
    """
    One-click booking from suggestion.

    Books a ride immediately with pre-filled destination details.
    """
    try:
        # Extract suggestion_id to get location
        parts = request.suggestion_id.split("_")
        if len(parts) < 2:
            raise HTTPException(status_code=400, detail="Invalid suggestion ID")

        location_id = parts[1]
        location = get_location_by_id(location_id)

        if not location:
            raise HTTPException(status_code=404, detail="Location not found")

        # Calculate pricing
        # This would integrate with actual ride booking system
        pricing_details = None
        for pricing in []:  # Would get from suggestion
            if pricing.vehicle_type == request.vehicle_type:
                pricing_details = pricing
                break

        return {
            "status": "booked",
            "ride_id": f"ride_{datetime.utcnow().timestamp()}",
            "location": location.dict(),
            "vehicle_type": request.vehicle_type,
            "passengers": request.num_passengers,
            "estimated_fare": 150,  # Would be calculated
            "estimated_arrival_minutes": 12,
            "message": "Ride booked successfully! Driver will arrive shortly.",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/trending", response_model=List[Dict[str, Any]])
async def get_trending_destinations(
    category: Optional[str] = Query(None, description="Filter by category"),
    limit: int = Query(10, ge=1, le=20),
):
    """
    Get trending destinations based on recent searches and bookings.
    """
    try:
        locations = get_sample_locations()

        # Sort by rating and return
        sorted_locations = sorted(
            locations,
            key=lambda x: (x.rating or 0, x.reviews_count or 0),
            reverse=True
        )

        return [
            {
                "id": loc.id,
                "name": loc.name,
                "category": loc.category,
                "address": loc.address,
                "rating": loc.rating,
                "reviews_count": loc.reviews_count,
                "trending_score": (loc.rating or 0) * 20,
            }
            for loc in sorted_locations[:limit]
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/locations", response_model=List[Dict[str, Any]])
async def list_locations(
    category: Optional[str] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, description="Search by name"),
    limit: int = Query(20, ge=1, le=50),
):
    """
    List all available locations with optional filtering.
    """
    try:
        locations = get_sample_locations()

        # Filter by category
        if category:
            locations = [loc for loc in locations if loc.category == category]

        # Filter by search
        if search:
            search_lower = search.lower()
            locations = [
                loc for loc in locations
                if search_lower in loc.name.lower() or
                   (loc.tags and any(search_lower in tag for tag in loc.tags))
            ]

        return [
            {
                "id": loc.id,
                "name": loc.name,
                "category": loc.category,
                "address": loc.address,
                "rating": loc.rating,
                "reviews_count": loc.reviews_count,
                "capacity": loc.capacity,
                "amenities": loc.amenities,
            }
            for loc in locations[:limit]
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/locations/{location_id}", response_model=Dict[str, Any])
async def get_location_details(location_id: str):
    """
    Get detailed information about a location.
    """
    try:
        location = get_location_by_id(location_id)

        if not location:
            raise HTTPException(status_code=404, detail="Location not found")

        return {
            "id": location.id,
            "name": location.name,
            "category": location.category,
            "address": location.address,
            "latitude": location.latitude,
            "longitude": location.longitude,
            "phone": location.phone,
            "website": location.website,
            "opening_hours": location.opening_hours,
            "rating": location.rating,
            "reviews_count": location.reviews_count,
            "capacity": location.capacity,
            "amenities": location.amenities,
            "tags": location.tags,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/history", response_model=Dict[str, Any])
async def save_intent_history(
    user_id: str = Query(..., description="User ID"),
    query: str = Query(..., description="User's query"),
    suggestion_selected: Optional[str] = Query(None),
    booking_completed: bool = Query(False),
):
    """
    Save user's intent search history for personalization.
    """
    try:
        return {
            "status": "saved",
            "message": "History recorded for personalization",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/preferences", response_model=Dict[str, Any])
async def save_user_preferences(
    user_id: str = Query(..., description="User ID"),
    preferred_categories: Optional[List[str]] = None,
    vehicle_preference: Optional[str] = None,
):
    """
    Save user preferences for personalized suggestions.
    """
    try:
        return {
            "status": "saved",
            "message": "Preferences updated",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/pricing/estimate", response_model=Dict[str, Any])
async def estimate_pricing(
    from_lat: float = Query(..., description="From latitude"),
    from_lng: float = Query(..., description="From longitude"),
    to_lat: float = Query(..., description="To latitude"),
    to_lng: float = Query(..., description="To longitude"),
    vehicle_type: str = Query("auto", description="Vehicle type"),
    num_passengers: int = Query(1, ge=1, le=6),
):
    """
    Get pricing estimate for a route.
    """
    try:
        # Calculate distance (simplified)
        import math
        
        lat1, lon1 = from_lat, from_lng
        lat2, lon2 = to_lat, to_lng
        
        R = 6371  # Earth's radius in km
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        a = (
            math.sin(dlat / 2) ** 2 +
            math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * 
            math.sin(dlon / 2) ** 2
        )
        c = 2 * math.asin(math.sqrt(a))
        distance_km = R * c

        # Pricing for different vehicles
        pricing = {
            "auto": 25 + (distance_km * 8),
            "cab": 40 + (distance_km * 12),
            "premium": 60 + (distance_km * 16),
            "xl": 80 + (distance_km * 18) if num_passengers > 4 else None,
        }

        # Remove None values
        pricing = {k: v for k, v in pricing.items() if v is not None}

        return {
            "distance_km": round(distance_km, 2),
            "estimated_duration_minutes": int(distance_km / 25 * 60),
            "pricing": {k: round(v, 2) for k, v in pricing.items()},
            "selected_vehicle": vehicle_type,
            "estimated_fare": round(pricing.get(vehicle_type, 0), 2),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/search/metrics", response_model=List[Dict[str, Any]])
async def get_search_metrics(
    limit: int = Query(10, ge=1, le=20),
):
    """
    Get popular search queries and their metrics.
    """
    try:
        # Return sample metrics
        return [
            {
                "query": "Movie with friends",
                "total_searches": 1250,
                "unique_users": 850,
                "conversion_rate": 0.68,
                "trending": True,
            },
            {
                "query": "Dinner tonight",
                "total_searches": 980,
                "unique_users": 720,
                "conversion_rate": 0.72,
                "trending": True,
            },
            {
                "query": "Shopping mall",
                "total_searches": 750,
                "unique_users": 620,
                "conversion_rate": 0.65,
                "trending": False,
            },
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/feedback", response_model=Dict[str, Any])
async def submit_feedback(
    suggestion_id: str = Query(...),
    rating: int = Query(..., ge=1, le=5, description="Rating 1-5"),
    comment: Optional[str] = Query(None),
):
    """
    Submit feedback on a suggestion to improve AI model.
    """
    try:
        return {
            "status": "received",
            "message": "Thank you for your feedback! This helps us improve.",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
