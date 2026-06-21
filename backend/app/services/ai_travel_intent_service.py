"""
AI Travel Intent Engine - Core Service

Handles intent recognition, destination suggestion, and pricing calculation.
"""

import re
from typing import List, Dict, Optional, Tuple, Any
from datetime import datetime, timedelta
from enum import Enum
import math
from ..db.ai_travel_intent_models import (
    IntentRequest,
    IntentRecognitionResult,
    IntentCategory,
    IntentSuggestion,
    IntentParsedData,
    Location,
    PricingDetails,
    VehicleType,
    LocationCategory,
    TrendingDestination,
    SearchMetrics,
)


class IntentRecognitionEngine:
    """
    NLP-based intent recognition engine.
    Converts natural language queries into structured intent data.
    """

    # Intent keywords mapping
    INTENT_KEYWORDS = {
        IntentCategory.ENTERTAINMENT: {
            'keywords': ['movie', 'cinema', 'film', 'show', 'concert', 'theater', 'play', 'comedy', 'event'],
            'entities': ['movie_name', 'cinema_name', 'show_time'],
            'location_categories': [LocationCategory.MULTIPLEX],
            'default_group_size': 2,
        },
        IntentCategory.DINING: {
            'keywords': ['eat', 'food', 'dinner', 'lunch', 'breakfast', 'coffee', 'pizza', 'restaurant', 'cafe', 'bar'],
            'entities': ['cuisine', 'restaurant_name', 'occasion'],
            'location_categories': [LocationCategory.RESTAURANT, LocationCategory.CAFE],
            'default_group_size': 2,
        },
        IntentCategory.SHOPPING: {
            'keywords': ['shop', 'buy', 'mall', 'market', 'store', 'shopping', 'clothes', 'groceries'],
            'entities': ['item_type', 'brand', 'mall_name'],
            'location_categories': [LocationCategory.MALL],
            'default_group_size': 2,
        },
        IntentCategory.MEDICAL: {
            'keywords': ['doctor', 'hospital', 'clinic', 'checkup', 'appointment', 'dental', 'medical'],
            'entities': ['doctor_name', 'hospital_name', 'speciality'],
            'location_categories': [LocationCategory.HOSPITAL],
            'default_group_size': 1,
        },
        IntentCategory.SPORTS: {
            'keywords': ['gym', 'fitness', 'yoga', 'exercise', 'workout', 'sports', 'swimming', 'badminton'],
            'entities': ['gym_name', 'activity'],
            'location_categories': [LocationCategory.GYM],
            'default_group_size': 1,
        },
        IntentCategory.EDUCATION: {
            'keywords': ['school', 'college', 'university', 'coaching', 'tuition', 'class', 'training'],
            'entities': ['institution_name', 'course'],
            'location_categories': [LocationCategory.SCHOOL],
            'default_group_size': 1,
        },
        IntentCategory.TRAVEL: {
            'keywords': ['airport', 'railway', 'station', 'flight', 'train', 'bus', 'tourist'],
            'entities': ['destination', 'transport_type'],
            'location_categories': [LocationCategory.AIRPORT, LocationCategory.RAILWAY],
            'default_group_size': 1,
        },
        IntentCategory.BUSINESS: {
            'keywords': ['office', 'meeting', 'conference', 'workplace', 'business', 'work'],
            'entities': ['office_name', 'meeting_type'],
            'location_categories': [LocationCategory.OFFICE],
            'default_group_size': 1,
        },
        IntentCategory.WELLNESS: {
            'keywords': ['spa', 'salon', 'massage', 'wellness', 'grooming', 'haircut'],
            'entities': ['service_type', 'salon_name'],
            'location_categories': [LocationCategory.GYM],  # Can add more categories
            'default_group_size': 1,
        },
    }

    # Companion type keywords
    COMPANION_KEYWORDS = {
        'friends': ['friend', 'friends', 'buddy', 'buddies', 'gang', 'squad'],
        'family': ['family', 'mom', 'dad', 'parents', 'brother', 'sister', 'kids', 'children'],
        'date': ['date', 'girlfriend', 'boyfriend', 'partner', 'significant other'],
        'colleagues': ['colleague', 'coworkers', 'team', 'office', 'work'],
    }

    # Time hint keywords
    TIME_KEYWORDS = {
        'now': ['now', 'immediately', 'asap', 'urgent', 'right now'],
        'tonight': ['tonight', 'this evening', 'evening'],
        'tomorrow': ['tomorrow', 'next day'],
        'weekend': ['weekend', 'saturday', 'sunday'],
    }

    def recognize_intent(self, request: IntentRequest) -> IntentRecognitionResult:
        """
        Recognize intent from user query.
        
        Args:
            request: IntentRequest with query and context
            
        Returns:
            IntentRecognitionResult with recognized intent and confidence
        """
        query = request.query.lower()
        
        # Find matching intent category
        matched_category = None
        max_score = 0
        matched_keywords = []
        
        for category, config in self.INTENT_KEYWORDS.items():
            score = self._calculate_keyword_match_score(query, config['keywords'])
            if score > max_score:
                max_score = score
                matched_category = category
                matched_keywords = config['keywords']
        
        # Parse additional entities
        parsed_data = self._parse_entities(query, request.num_passengers)
        
        # Determine confidence
        confidence = min(max_score, 1.0)
        is_valid = matched_category is not None and confidence > 0.3
        
        return IntentRecognitionResult(
            query=request.query,
            identified_intent=matched_keywords[0] if matched_keywords else None,
            intent_category=matched_category,
            entities=parsed_data.dict(),
            confidence=confidence,
            is_valid_intent=is_valid,
            error_message=None if is_valid else "Could not determine a valid travel intent from query"
        )

    def _calculate_keyword_match_score(self, query: str, keywords: List[str]) -> float:
        """Calculate matching score for keywords in query"""
        # More lenient matching - if any keyword matches, give higher score
        matched_count = sum(1 for keyword in keywords if keyword in query)
        if matched_count == 0:
            return 0
        # Return a score based on matches (minimum 0.5 if any match, up to 1.0)
        return min(0.5 + (matched_count * 0.15), 1.0)

    def _parse_entities(self, query: str, num_passengers: int) -> IntentParsedData:
        """Parse additional entities from query"""
        # Detect companion types
        companion_types = []
        for comp_type, keywords in self.COMPANION_KEYWORDS.items():
            if any(kw in query for kw in keywords):
                companion_types.append(comp_type)
        
        # Detect time hints
        time_hint = None
        for time_type, keywords in self.TIME_KEYWORDS.items():
            if any(kw in query for kw in keywords):
                time_hint = time_type
                break
        
        # Extract group size
        group_size = num_passengers
        # Look for numbers in query
        numbers = re.findall(r'\b(\d+)\b', query)
        if numbers:
            group_size = int(numbers[0])
        
        return IntentParsedData(
            group_size=min(group_size, 6),  # Max 6 passengers
            event_type=None,
            time_hint=time_hint,
            budget_range=None,
            companion_types=companion_types if companion_types else None
        )


class DestinationSuggestionEngine:
    """
    Suggests destinations based on intent and user location.
    Integrates with location database and real-time data.
    """

    def __init__(self, locations_db: List[Location]):
        """
        Initialize with location database.
        
        Args:
            locations_db: List of available locations
        """
        self.locations_db = locations_db

    def suggest_destinations(
        self,
        intent_result: IntentRecognitionResult,
        user_location: Optional[Dict[str, float]],
        num_passengers: int = 1,
        preferences: Optional[Dict[str, Any]] = None,
        limit: int = 5
    ) -> List[IntentSuggestion]:
        """
        Get top destination suggestions for intent.
        
        Args:
            intent_result: Result from intent recognition
            user_location: User's current location {latitude, longitude}
            num_passengers: Number of passengers
            preferences: User preferences for filtering
            limit: Max number of suggestions
            
        Returns:
            List of top IntentSuggestion objects
        """
        if not intent_result.is_valid_intent or not intent_result.intent_category:
            return []

        # Filter locations by category
        config = IntentRecognitionEngine.INTENT_KEYWORDS[intent_result.intent_category]
        matching_locations = [
            loc for loc in self.locations_db
            if loc.category in config['location_categories']
        ]

        # Calculate distances and scores
        suggestions = []
        for location in matching_locations:
            distance = self._calculate_distance(
                user_location,
                {'lat': location.latitude, 'lng': location.longitude}
            ) if user_location else None

            travel_time = self._estimate_travel_time(distance) if distance else 15

            # Calculate suggestion score
            score = self._calculate_suggestion_score(
                location,
                distance,
                intent_result.confidence
            )

            # Generate pricing options
            pricing = self._generate_pricing_options(distance, num_passengers)

            suggestion = IntentSuggestion(
                id=f"sug_{location.id}_{datetime.utcnow().timestamp()}",
                location=location,
                intent_matched=intent_result.identified_intent or "destination",
                confidence_score=intent_result.confidence,
                seats_available=min(location.capacity or 20, num_passengers),
                estimated_arrival_minutes=int(travel_time),
                pricing_options=pricing,
                reason=self._generate_reason(location, distance, intent_result),
                busy_level="moderate",  # Would come from real-time data
                special_offers=["50% off on first ride", "Book now, pay later"],
            )

            suggestions.append((score, suggestion))

        # Sort by score and return top suggestions
        suggestions.sort(key=lambda x: x[0], reverse=True)
        return [sug[1] for sug in suggestions[:limit]]

    def _calculate_distance(
        self,
        loc1: Optional[Dict[str, float]],
        loc2: Dict[str, float]
    ) -> Optional[float]:
        """Calculate distance between two locations using Haversine formula"""
        if not loc1 or 'lat' not in loc1 or 'lng' not in loc1:
            return None

        lat1, lon1 = loc1['lat'], loc1['lng']
        lat2, lon2 = loc2['lat'], loc2['lng']

        R = 6371  # Earth's radius in km
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)

        a = (
            math.sin(dlat / 2) ** 2 +
            math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
        )
        c = 2 * math.asin(math.sqrt(a))
        distance_km = R * c

        return distance_km

    def _estimate_travel_time(self, distance_km: Optional[float]) -> float:
        """Estimate travel time based on distance"""
        if distance_km is None:
            return 15
        # Average speed in urban area: 25-30 km/h
        avg_speed = 25
        return (distance_km / avg_speed) * 60  # Convert to minutes

    def _calculate_suggestion_score(
        self,
        location: Location,
        distance: Optional[float],
        intent_confidence: float
    ) -> float:
        """Calculate overall suggestion score"""
        score = intent_confidence

        # Add rating factor (0-1)
        if location.rating:
            score += (location.rating / 5.0) * 0.3

        # Subtract distance factor (closer is better)
        if distance:
            distance_factor = max(0, 1 - (distance / 20))  # Max 20 km
            score += distance_factor * 0.2

        return min(score, 1.0)

    def _generate_pricing_options(
        self,
        distance_km: Optional[float],
        num_passengers: int
    ) -> List[PricingDetails]:
        """Generate pricing for different vehicle types"""
        if distance_km is None:
            distance_km = 5  # Default 5 km if unknown

        pricing_options = [
            PricingDetails(
                vehicle_type=VehicleType.AUTO,
                base_fare=25,
                per_km_charge=8,
                per_minute_charge=1,
                estimated_fare=max(25, 25 + (distance_km * 8)),
                minimum_fare=25,
                estimated_distance_km=distance_km,
                estimated_duration_minutes=int(distance_km / 25 * 60)
            ),
            PricingDetails(
                vehicle_type=VehicleType.CAB,
                base_fare=40,
                per_km_charge=12,
                per_minute_charge=2,
                estimated_fare=max(40, 40 + (distance_km * 12)),
                minimum_fare=40,
                estimated_distance_km=distance_km,
                estimated_duration_minutes=int(distance_km / 25 * 60)
            ),
            PricingDetails(
                vehicle_type=VehicleType.PREMIUM,
                base_fare=60,
                per_km_charge=16,
                per_minute_charge=3,
                estimated_fare=max(60, 60 + (distance_km * 16)),
                minimum_fare=60,
                estimated_distance_km=distance_km,
                estimated_duration_minutes=int(distance_km / 25 * 60)
            ),
        ]

        if num_passengers > 4:
            pricing_options.append(PricingDetails(
                vehicle_type=VehicleType.XL,
                base_fare=80,
                per_km_charge=18,
                per_minute_charge=4,
                estimated_fare=max(80, 80 + (distance_km * 18)),
                minimum_fare=80,
                estimated_distance_km=distance_km,
                estimated_duration_minutes=int(distance_km / 25 * 60)
            ))

        return pricing_options

    def _generate_reason(
        self,
        location: Location,
        distance: Optional[float],
        intent_result: IntentRecognitionResult
    ) -> str:
        """Generate human-readable reason for suggestion"""
        reasons = []

        # Add rating
        if location.rating:
            reasons.append(f"{location.rating}⭐")

        # Add distance
        if distance:
            if distance < 2:
                reasons.append("nearest")
            elif distance < 5:
                reasons.append(f"{distance:.1f}km away")

        # Add category info
        if location.capacity:
            reasons.append(f"{location.capacity} capacity")

        # Add review count
        if location.reviews_count:
            reasons.append(f"{location.reviews_count} reviews")

        return " • ".join(reasons) if reasons else "Popular choice"


class PricingEngine:
    """
    Dynamic pricing calculation engine.
    Factors: distance, time, demand, vehicle type
    """

    SURGE_MULTIPLIERS = {
        "peak_morning": 1.2,      # 7-10 AM
        "peak_evening": 1.3,      # 5-8 PM
        "night": 1.5,             # 10 PM - 5 AM
        "normal": 1.0,
    }

    def calculate_dynamic_price(
        self,
        base_fare: float,
        per_km_charge: float,
        distance_km: float,
        duration_minutes: int,
        per_minute_charge: float = 1,
        current_time: Optional[datetime] = None,
        demand_level: str = "normal"
    ) -> float:
        """
        Calculate final price with all factors.
        
        Args:
            base_fare: Base fare amount
            per_km_charge: Per km charge
            distance_km: Distance in km
            duration_minutes: Estimated duration
            per_minute_charge: Per minute charge
            current_time: Current time for surge pricing
            demand_level: Current demand level
            
        Returns:
            Final price amount
        """
        # Base calculation
        distance_cost = distance_km * per_km_charge
        time_cost = duration_minutes * per_minute_charge
        subtotal = base_fare + distance_cost + time_cost

        # Apply surge multiplier based on time
        multiplier = self._get_surge_multiplier(current_time, demand_level)
        final_price = subtotal * multiplier

        return round(final_price, 2)

    def _get_surge_multiplier(
        self,
        current_time: Optional[datetime],
        demand_level: str
    ) -> float:
        """Get surge multiplier based on time and demand"""
        if not current_time:
            return 1.0

        hour = current_time.hour

        if 7 <= hour < 10:
            return self.SURGE_MULTIPLIERS["peak_morning"]
        elif 17 <= hour < 20:
            return self.SURGE_MULTIPLIERS["peak_evening"]
        elif hour >= 22 or hour < 5:
            return self.SURGE_MULTIPLIERS["night"]

        return self.SURGE_MULTIPLIERS["normal"]


# Initialize singleton instances
intent_recognition = IntentRecognitionEngine()
pricing_engine = PricingEngine()
