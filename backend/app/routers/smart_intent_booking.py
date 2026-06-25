"""
Smart Intent Booking Router — Natural language intent parsing for simplified booking
Features: Intent parsing, destination extraction, vehicle recommendation, special requirements
"""

from fastapi import APIRouter, Request, HTTPException, Body
from datetime import datetime, timedelta
from typing import Dict, Optional, List
from enum import Enum
import re

from app.utils.rbac import get_current_user_from_request

router = APIRouter(prefix="/api/intent", tags=["smart-intent-booking"])


# ============================================================================
# DATA MODELS
# ============================================================================

class IntentType(str, Enum):
    AIRPORT = "airport"
    HOSPITAL = "hospital"
    GROCERY = "grocery"
    OFFICE = "office"
    HOME = "home"
    SCHOOL = "school"
    RESTAURANT = "restaurant"
    SHOPPING = "shopping"
    GYM = "gym"
    TEMPLE = "temple"
    FAMILY_DROPOFF = "family_dropoff"
    URGENT = "urgent"
    UNKNOWN = "unknown"


class VehicleType(str, Enum):
    ECONOMY = "economy"
    COMFORT = "comfort"
    PREMIUM = "premium"
    XL = "xl"  # For family/multiple passengers


# ============================================================================
# INTENT PATTERNS & EXTRACTION
# ============================================================================

INTENT_PATTERNS = {
    IntentType.AIRPORT: {
        "patterns": [r"airport", r"flight", r"fly", r"boarding", r"terminal"],
        "urgency_boost": 0.2,
        "vehicle_hint": VehicleType.COMFORT,
        "default_buffer_mins": 120,
    },
    IntentType.HOSPITAL: {
        "patterns": [r"hospital", r"doctor", r"medical", r"clinic", r"emergency", r"urgent care"],
        "urgency_boost": 0.3,
        "vehicle_hint": VehicleType.COMFORT,
        "default_buffer_mins": 15,
        "special_flags": ["medical"],
    },
    IntentType.GROCERY: {
        "patterns": [r"grocery", r"shopping", r"supermarket", r"store", r"market"],
        "urgency_boost": 0.0,
        "vehicle_hint": VehicleType.ECONOMY,
        "default_buffer_mins": 5,
    },
    IntentType.OFFICE: {
        "patterns": [r"office", r"work", r"meeting", r"workplace"],
        "urgency_boost": 0.1,
        "vehicle_hint": VehicleType.ECONOMY,
        "default_buffer_mins": 30,
    },
    IntentType.HOME: {
        "patterns": [r"home", r"house", r"back home"],
        "urgency_boost": 0.0,
        "vehicle_hint": VehicleType.ECONOMY,
        "default_buffer_mins": 5,
    },
    IntentType.SCHOOL: {
        "patterns": [r"school", r"college", r"university"],
        "urgency_boost": 0.1,
        "vehicle_hint": VehicleType.ECONOMY,
        "default_buffer_mins": 15,
    },
    IntentType.RESTAURANT: {
        "patterns": [r"restaurant", r"dinner", r"lunch", r"food", r"eat"],
        "urgency_boost": 0.0,
        "vehicle_hint": VehicleType.ECONOMY,
        "default_buffer_mins": 10,
    },
    IntentType.GYM: {
        "patterns": [r"gym", r"fitness", r"workout", r"exercise"],
        "urgency_boost": 0.0,
        "vehicle_hint": VehicleType.ECONOMY,
        "default_buffer_mins": 5,
    },
}

SPECIAL_REQUIREMENTS_PATTERNS = {
    "elderly": r"\b(elderly|old|mother|father|grandpa|grandma)\b",
    "child": r"\b(child|kid|son|daughter|baby)\b",
    "disability": r"\b(wheelchair|disabled|disability|mobility|handicap)\b",
    "multiple_passengers": r"\b(family|everyone|all|group|take my|with)\b",
    "luggage": r"\b(luggage|baggage|suitcase|bags|belongings)\b",
    "pet": r"\b(dog|cat|pet|puppy)\b",
}

TIME_PATTERNS = {
    "before": r"before\s+(\d{1,2}(?::\d{2})?)\s*(?:am|pm|a\.m\.|p\.m\.)?",
    "by": r"by\s+(\d{1,2}(?::\d{2})?)\s*(?:am|pm|a\.m\.|p\.m\.)?",
    "in_minutes": r"in\s+(\d+)\s+(?:minute|min)",
    "in_hours": r"in\s+(\d+)\s+(?:hour|hr)",
    "asap": r"\b(?:asap|immediately|urgent|now|right now)\b",
}

URGENCY_KEYWORDS = {
    "critical": r"\b(emergency|critical|sos|urgent|life-threatening)\b",
    "high": r"\b(hurry|rush|need to|must|quickly)\b",
    "medium": r"\b(soon|shortly|please|want to)\b",
    "low": r"\b(whenever|anytime|later)\b",
}


# ============================================================================
# INTENT PARSING FUNCTIONS
# ============================================================================

def extract_intent_type(text: str) -> tuple[IntentType, float]:
    """
    Detect primary intent from user text.
    Returns (intent_type, confidence_score)
    """
    text_lower = text.lower()
    scores = {}

    for intent_type, config in INTENT_PATTERNS.items():
        match_count = 0
        for pattern in config["patterns"]:
            if re.search(pattern, text_lower):
                match_count += 1

        if match_count > 0:
            confidence = min(0.5 + (match_count * 0.25), 1.0)
            scores[intent_type] = confidence

    if not scores:
        return IntentType.UNKNOWN, 0.3

    top_intent = max(scores, key=scores.get)
    return top_intent, scores[top_intent]


def extract_time_constraint(text: str) -> Optional[Dict]:
    """
    Extract time constraint from user text.
    Returns dict with target_time and buffer_minutes or None.
    """
    text_lower = text.lower()

    # Check for ASAP
    if re.search(TIME_PATTERNS["asap"], text_lower):
        return {
            "target_time": datetime.utcnow() + timedelta(minutes=10),
            "buffer_minutes": 5,
            "type": "asap",
        }

    # Check for "in X minutes"
    match = re.search(TIME_PATTERNS["in_minutes"], text_lower)
    if match:
        minutes = int(match.group(1))
        return {
            "target_time": datetime.utcnow() + timedelta(minutes=minutes),
            "buffer_minutes": 5,
            "type": "relative",
        }

    # Check for "in X hours"
    match = re.search(TIME_PATTERNS["in_hours"], text_lower)
    if match:
        hours = int(match.group(1))
        return {
            "target_time": datetime.utcnow() + timedelta(hours=hours),
            "buffer_minutes": 15,
            "type": "relative",
        }

    # Check for "before HH:MM"
    match = re.search(TIME_PATTERNS["before"], text_lower)
    if match:
        time_str = match.group(1)
        # Parse time (simplified)
        if ":" in time_str:
            hour, minute = map(int, time_str.split(":"))
        else:
            hour = int(time_str)
            minute = 0

        # Detect AM/PM from full text
        is_pm = bool(re.search(r"\bpm|p\.m\.", text_lower))
        if is_pm and hour < 12:
            hour += 12

        target = datetime.utcnow().replace(hour=hour, minute=minute, second=0, microsecond=0)
        # If time is in past today, assume tomorrow
        if target < datetime.utcnow():
            target += timedelta(days=1)

        return {
            "target_time": target,
            "buffer_minutes": 30,
            "type": "absolute",
        }

    return None


def extract_special_requirements(text: str) -> Dict[str, bool]:
    """Extract special requirements flags from user text."""
    text_lower = text.lower()
    requirements = {}

    for req_type, pattern in SPECIAL_REQUIREMENTS_PATTERNS.items():
        requirements[req_type] = bool(re.search(pattern, text_lower))

    return requirements


def extract_urgency_level(text: str) -> str:
    """Classify urgency from user text."""
    text_lower = text.lower()

    for level in ["critical", "high", "medium", "low"]:
        if re.search(URGENCY_KEYWORDS[level], text_lower):
            return level

    return "medium"


def recommend_vehicle_type(
    intent_type: IntentType,
    special_requirements: Dict[str, bool],
    urgency: str
) -> str:
    """Recommend vehicle type based on intent and requirements."""
    # Base recommendation from intent
    base_vehicle = INTENT_PATTERNS.get(intent_type, {}).get("vehicle_hint", VehicleType.ECONOMY)

    # Upgrade for special needs
    if special_requirements.get("multiple_passengers"):
        return VehicleType.XL
    if special_requirements.get("disability"):
        return VehicleType.XL  # Accessible vehicle needed
    if special_requirements.get("elderly"):
        return VehicleType.COMFORT
    if special_requirements.get("luggage"):
        return VehicleType.COMFORT

    # Higher urgency → comfort preference
    if urgency in ["critical", "high"]:
        if base_vehicle == VehicleType.ECONOMY:
            return VehicleType.COMFORT
        return base_vehicle

    return base_vehicle


def estimate_destination_coordinates(intent_type: IntentType) -> tuple[float, float]:
    """
    Return mock coordinates based on intent type.
    In production, use location services, user's saved places, or calendar.
    """
    destinations = {
        IntentType.AIRPORT: (13.1939, 80.1305),  # Chennai Airport
        IntentType.HOSPITAL: (13.0656, 80.2391),  # Apollo Hospital, Chennai
        IntentType.GROCERY: (13.0826, 80.2707),  # Local supermarket
        IntentType.OFFICE: (13.1939, 80.1305),  # Typical CBD
        IntentType.HOME: (13.0450, 80.2450),  # User's home (mock)
        IntentType.SCHOOL: (13.0050, 80.2330),  # Local school
        IntentType.RESTAURANT: (13.0827, 80.2707),  # Popular restaurant area
        IntentType.GYM: (13.0656, 80.2391),  # Local gym
        IntentType.TEMPLE: (13.1475, 80.2748),  # Local temple
        IntentType.FAMILY_DROPOFF: (13.0050, 80.2330),  # School/home
    }

    return destinations.get(intent_type, (13.0827, 80.2707))


# ============================================================================
# API ENDPOINTS
# ============================================================================

@router.post("/parse")
async def parse_intent(
    request: Request,
    intent_data: Dict = Body(default=None, embed=False)
):
    """
    Parse natural language user intent and return structured booking details.
    
    Input: { "text": "Need to reach airport before 8pm", ... }
    Output: {
        "ok": true,
        "intent": {
            "type": "airport",
            "confidence": 0.95,
            "urgency": "high",
            "destination": { "latitude": 13.19, "longitude": 80.13, ... },
            "vehicle_type": "comfort",
            "estimated_fare": 450,
            "time_constraint": { "target_time": "2026-06-25T20:00:00", ... },
            "special_requirements": { "luggage": true, ... },
            "summary": "Airport pickup before 8pm - Comfort vehicle recommended"
        }
    }
    """
    user = await get_current_user_from_request(request)
    user_id = user.get("user_id")

    try:
        intent_text = intent_data.get("text", "").strip() if intent_data else ""
        if not intent_text:
            raise ValueError("Intent text is required")

        # Parse intent components
        intent_type, intent_confidence = extract_intent_type(intent_text)
        urgency = extract_urgency_level(intent_text)
        special_requirements = extract_special_requirements(intent_text)
        time_constraint = extract_time_constraint(intent_text)
        vehicle_type = recommend_vehicle_type(intent_type, special_requirements, urgency)

        # Estimate destination
        dest_lat, dest_lon = estimate_destination_coordinates(intent_type)

        # Mock fare estimation (in production, use real distance + rate card)
        base_fares = {
            VehicleType.ECONOMY: 100,
            VehicleType.COMFORT: 150,
            VehicleType.PREMIUM: 250,
            VehicleType.XL: 200,
        }
        estimated_fare = base_fares.get(vehicle_type, 150)

        # Generate human-readable summary
        summary_parts = [
            f"{intent_type.value.replace('_', ' ').title()}",
            f"({vehicle_type.value})" if vehicle_type != VehicleType.ECONOMY else None,
        ]
        if time_constraint:
            if time_constraint["type"] == "asap":
                summary_parts.append("- Urgent/ASAP")
            else:
                summary_parts.append(f"- {time_constraint['type']}")
        if any(special_requirements.values()):
            req_flags = [k for k, v in special_requirements.items() if v]
            summary_parts.append(f"Special: {', '.join(req_flags)}")

        summary = " ".join([p for p in summary_parts if p])

        return {
            "ok": True,
            "user_id": user_id,
            "intent": {
                "type": intent_type.value,
                "confidence": round(intent_confidence, 2),
                "urgency": urgency,
                "destination": {
                    "latitude": dest_lat,
                    "longitude": dest_lon,
                    "type": intent_type.value,
                },
                "vehicle_type": vehicle_type.value,
                "estimated_fare": estimated_fare,
                "time_constraint": {
                    "target_time": time_constraint["target_time"].isoformat()
                    if time_constraint
                    else None,
                    "buffer_minutes": time_constraint["buffer_minutes"] if time_constraint else 0,
                }
                if time_constraint
                else None,
                "special_requirements": special_requirements,
                "summary": summary,
                "parsed_text": intent_text,
            },
            "message": "Intent parsed successfully",
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/book-from-intent")
async def book_from_intent(
    request: Request,
    booking_data: Dict = Body(default=None, embed=False)
):
    """
    Complete a booking directly from parsed intent.
    Bridges smart intent parsing to ride booking system.
    
    Input: {
        "intent_type": "airport",
        "destination_latitude": 13.19,
        "destination_longitude": 80.13,
        "vehicle_type": "comfort",
        "special_requirements": { "luggage": true, ... },
        "time_constraint": { ... }
    }
    Output: { "ok": true, "booking_id": "...", "summary": "..." }
    """
    user = await get_current_user_from_request(request)
    user_id = user.get("user_id")

    try:
        intent_type = booking_data.get("intent_type")
        destination_lat = booking_data.get("destination_latitude")
        destination_lon = booking_data.get("destination_longitude")
        vehicle_type = booking_data.get("vehicle_type", "economy")
        special_requirements = booking_data.get("special_requirements", {})

        if not all([intent_type, destination_lat, destination_lon]):
            raise ValueError("Missing required booking fields")

        # Mock booking creation (in production, call actual booking service)
        booking_id = f"INTENT-{user_id[:6]}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
        summary = booking_data.get("summary", f"Booking for {intent_type}")

        return {
            "ok": True,
            "booking_id": booking_id,
            "user_id": user_id,
            "intent_type": intent_type,
            "vehicle_type": vehicle_type,
            "destination": {
                "latitude": destination_lat,
                "longitude": destination_lon,
            },
            "special_requirements": special_requirements,
            "summary": summary,
            "status": "confirmed",
            "message": "Booking confirmed - Driver will be assigned shortly",
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/examples")
async def get_intent_examples(request: Request):
    """Return example intents for UI guidance."""
    user = await get_current_user_from_request(request)

    examples = [
        {
            "text": "Need to reach airport before 8pm",
            "intent_type": "airport",
            "expected_vehicle": "comfort",
            "urgency": "high",
        },
        {
            "text": "Take my mother to hospital",
            "intent_type": "hospital",
            "expected_vehicle": "comfort",
            "special_needs": "elderly",
        },
        {
            "text": "Grocery shopping, in 30 minutes",
            "intent_type": "grocery",
            "expected_vehicle": "economy",
            "urgency": "medium",
        },
        {
            "text": "Emergency - need ride immediately",
            "intent_type": "urgent",
            "expected_vehicle": "comfort",
            "urgency": "critical",
        },
        {
            "text": "Pick up my child from school",
            "intent_type": "school",
            "expected_vehicle": "economy",
            "special_needs": "child",
        },
        {
            "text": "Family dinner out - 5 of us",
            "intent_type": "restaurant",
            "expected_vehicle": "xl",
            "special_needs": "multiple_passengers",
        },
    ]

    return {
        "ok": True,
        "examples": examples,
        "message": f"Found {len(examples)} example intents",
    }
