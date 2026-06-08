"""Tourism packages, fare rules, routes, and driver eligibility."""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class TourismPackage(BaseModel):
    id: str
    name: str
    city: str
    package_type: str
    duration_hours: int = Field(ge=2, le=120)
    places: List[str]
    base_price: float = Field(ge=0)
    vehicle_types: List[str]
    active: bool = True


class TourismAttraction(BaseModel):
    name: str
    category: str
    rating: float
    entry_fee: float = 0.0
    estimated_minutes: int = 60


TOURISM_PACKAGE_TYPES: Dict[str, Dict[str, Any]] = {
    "half_day": {"label": "Half Day", "duration_hours": 4},
    "full_day": {"label": "Full Day", "duration_hours": 8},
    "multi_day": {"label": "Multi Day", "duration_hours": 24},
    "custom": {"label": "Custom Tour", "duration_hours": 8},
}

TOURISM_STATUS_FLOW = [
    "created",
    "driver_assigned",
    "accepted",
    "trip_started",
    "place_visited",
    "trip_completed",
]

TOURISM_ADDONS = {
    "guide": {"label": "Local Guide", "price": 500.0},
    "photographer": {"label": "Photographer", "price": 1000.0},
    "boat_ride": {"label": "Boat Ride", "price": 750.0},
    "hotel_booking": {"label": "Hotel Booking Assistance", "price": 0.0},
    "ticket_booking": {"label": "Ticket Booking Assistance", "price": 0.0},
}

TOURISM_CITY_ALIASES = {
    "trivandrum": "Trivandrum",
    "thiruvananthapuram": "Trivandrum",
    "tvm": "Trivandrum",
    "kochi": "Kochi",
    "cochin": "Kochi",
    "ernakulam": "Kochi",
    "munnar": "Munnar",
    "alappuzha": "Alleppey",
    "alleppey": "Alleppey",
    "wayanad": "Wayanad",
    "kanyakumari": "Kanyakumari",
    "kanniyakumari": "Kanyakumari",
}

TOURISM_ATTRACTIONS: Dict[str, List[Dict[str, Any]]] = {
    "Trivandrum": [
        {"name": "Padmanabhaswamy Temple", "category": "Temple", "rating": 4.8, "entry_fee": 0, "estimated_minutes": 90},
        {"name": "Napier Museum", "category": "Museum", "rating": 4.5, "entry_fee": 30, "estimated_minutes": 75},
        {"name": "Kovalam Beach", "category": "Beach", "rating": 4.8, "entry_fee": 0, "estimated_minutes": 120},
        {"name": "Poovar Island", "category": "Backwater", "rating": 4.7, "entry_fee": 350, "estimated_minutes": 120},
        {"name": "Azhimala Shiva Temple", "category": "Temple", "rating": 4.7, "entry_fee": 0, "estimated_minutes": 75},
    ],
    "Kochi": [
        {"name": "Fort Kochi", "category": "Heritage", "rating": 4.7, "entry_fee": 0, "estimated_minutes": 120},
        {"name": "Marine Drive", "category": "Promenade", "rating": 4.5, "entry_fee": 0, "estimated_minutes": 75},
        {"name": "Jew Town", "category": "Heritage", "rating": 4.6, "entry_fee": 0, "estimated_minutes": 90},
        {"name": "Mattancherry Palace", "category": "Museum", "rating": 4.5, "entry_fee": 20, "estimated_minutes": 90},
    ],
    "Munnar": [
        {"name": "Tea Gardens", "category": "Nature", "rating": 4.9, "entry_fee": 0, "estimated_minutes": 120},
        {"name": "Top Station", "category": "Viewpoint", "rating": 4.7, "entry_fee": 0, "estimated_minutes": 120},
        {"name": "Mattupetty Dam", "category": "Dam", "rating": 4.6, "entry_fee": 20, "estimated_minutes": 90},
        {"name": "Eravikulam National Park", "category": "Wildlife", "rating": 4.7, "entry_fee": 200, "estimated_minutes": 150},
    ],
    "Alleppey": [
        {"name": "Backwater Cruise", "category": "Backwater", "rating": 4.9, "entry_fee": 600, "estimated_minutes": 180},
        {"name": "Houseboat Tour", "category": "Backwater", "rating": 4.8, "entry_fee": 1500, "estimated_minutes": 240},
        {"name": "Alappuzha Beach", "category": "Beach", "rating": 4.5, "entry_fee": 0, "estimated_minutes": 90},
        {"name": "Kuttanad", "category": "Village", "rating": 4.6, "entry_fee": 0, "estimated_minutes": 120},
    ],
    "Wayanad": [
        {"name": "Edakkal Caves", "category": "Heritage", "rating": 4.7, "entry_fee": 50, "estimated_minutes": 120},
        {"name": "Banasura Sagar Dam", "category": "Dam", "rating": 4.6, "entry_fee": 40, "estimated_minutes": 120},
        {"name": "Pookode Lake", "category": "Lake", "rating": 4.5, "entry_fee": 30, "estimated_minutes": 90},
        {"name": "Soochipara Falls", "category": "Waterfall", "rating": 4.6, "entry_fee": 80, "estimated_minutes": 120},
    ],
    "Kanyakumari": [
        {"name": "Vivekananda Rock Memorial", "category": "Memorial", "rating": 4.8, "entry_fee": 75, "estimated_minutes": 120},
        {"name": "Thiruvalluvar Statue", "category": "Monument", "rating": 4.7, "entry_fee": 30, "estimated_minutes": 75},
        {"name": "Kanyakumari Beach", "category": "Beach", "rating": 4.6, "entry_fee": 0, "estimated_minutes": 90},
        {"name": "Suchindram Temple", "category": "Temple", "rating": 4.7, "entry_fee": 0, "estimated_minutes": 90},
    ],
}

TOURISM_PACKAGES: Dict[str, Dict[str, Any]] = {
    "PKG_TRV_TEMPLE": {
        "id": "PKG_TRV_TEMPLE",
        "name": "Trivandrum Temple Tour",
        "city": "Trivandrum",
        "package_type": "half_day",
        "duration_hours": 4,
        "places": ["Padmanabhaswamy Temple", "Azhimala Shiva Temple", "Napier Museum"],
        "base_price": 1200.0,
        "vehicle_types": ["auto", "taxi", "xl"],
        "active": True,
    },
    "PKG_TRV_HERITAGE": {
        "id": "PKG_TRV_HERITAGE",
        "name": "Trivandrum Heritage Tour",
        "city": "Trivandrum",
        "package_type": "full_day",
        "duration_hours": 8,
        "places": ["Padmanabhaswamy Temple", "Napier Museum", "Kovalam Beach", "Poovar Island"],
        "base_price": 1800.0,
        "vehicle_types": ["auto", "taxi", "xl", "traveller"],
        "active": True,
    },
    "PKG_KOC_HERITAGE": {
        "id": "PKG_KOC_HERITAGE",
        "name": "Kochi Heritage Trail",
        "city": "Kochi",
        "package_type": "full_day",
        "duration_hours": 8,
        "places": ["Fort Kochi", "Mattancherry Palace", "Jew Town", "Marine Drive"],
        "base_price": 2200.0,
        "vehicle_types": ["auto", "taxi", "xl", "traveller"],
        "active": True,
    },
    "PKG_MUN_NATURE": {
        "id": "PKG_MUN_NATURE",
        "name": "Munnar Tea Gardens Tour",
        "city": "Munnar",
        "package_type": "full_day",
        "duration_hours": 8,
        "places": ["Tea Gardens", "Mattupetty Dam", "Top Station"],
        "base_price": 2600.0,
        "vehicle_types": ["auto", "taxi", "xl", "traveller"],
        "active": True,
    },
    "PKG_ALP_BACKWATER": {
        "id": "PKG_ALP_BACKWATER",
        "name": "Alleppey Backwater Tour",
        "city": "Alleppey",
        "package_type": "full_day",
        "duration_hours": 8,
        "places": ["Backwater Cruise", "Kuttanad", "Alappuzha Beach"],
        "base_price": 2400.0,
        "vehicle_types": ["auto", "taxi", "xl", "traveller"],
        "active": True,
    },
    "PKG_ALP_HOUSEBOAT": {
        "id": "PKG_ALP_HOUSEBOAT",
        "name": "Alleppey Houseboat Day Tour",
        "city": "Alleppey",
        "package_type": "full_day",
        "duration_hours": 8,
        "places": ["Houseboat Tour", "Backwater Cruise", "Kuttanad"],
        "base_price": 3600.0,
        "vehicle_types": ["auto", "taxi", "xl", "traveller"],
        "active": True,
    },
    "PKG_WAY_NATURE": {
        "id": "PKG_WAY_NATURE",
        "name": "Wayanad Nature Circuit",
        "city": "Wayanad",
        "package_type": "full_day",
        "duration_hours": 8,
        "places": ["Edakkal Caves", "Banasura Sagar Dam", "Pookode Lake"],
        "base_price": 2500.0,
        "vehicle_types": ["auto", "taxi", "xl", "traveller"],
        "active": True,
    },
    "PKG_KKY_COASTAL": {
        "id": "PKG_KKY_COASTAL",
        "name": "Kanyakumari Sunrise Tour",
        "city": "Kanyakumari",
        "package_type": "full_day",
        "duration_hours": 8,
        "places": ["Vivekananda Rock Memorial", "Thiruvalluvar Statue", "Kanyakumari Beach", "Suchindram Temple"],
        "base_price": 2300.0,
        "vehicle_types": ["auto", "taxi", "xl", "traveller"],
        "active": True,
    },
    "PKG_CUSTOM": {
        "id": "PKG_CUSTOM",
        "name": "Custom Tour Builder",
        "city": "Trivandrum",
        "package_type": "custom",
        "duration_hours": 8,
        "places": [],
        "base_price": 1800.0,
        "vehicle_types": ["auto", "taxi", "xl", "traveller"],
        "active": True,
    },
}


def normalize_tourism_city(value: Optional[str]) -> Optional[str]:
    key = str(value or "").strip().lower().replace("-", " ").replace("_", " ")
    key = " ".join(key.split())
    return TOURISM_CITY_ALIASES.get(key)


def normalize_tourism_package_type(value: Optional[str]) -> str:
    key = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
    return key if key in TOURISM_PACKAGE_TYPES else "full_day"


def list_tourism_packages(
    *,
    city: Optional[str] = None,
    package_type: Optional[str] = None,
    active_only: bool = True,
) -> List[Dict[str, Any]]:
    city_name = normalize_tourism_city(city) if city else None
    package_type_key = normalize_tourism_package_type(package_type) if package_type else None
    packages: List[Dict[str, Any]] = []
    for package in TOURISM_PACKAGES.values():
        if active_only and not package.get("active", True):
            continue
        if city_name and package.get("city") != city_name and package.get("id") != "PKG_CUSTOM":
            continue
        if package_type_key and package.get("package_type") != package_type_key:
            continue
        packages.append(dict(package))
    return packages


def get_tourism_package(package_id: Optional[str]) -> Optional[Dict[str, Any]]:
    package = TOURISM_PACKAGES.get(str(package_id or "").strip().upper())
    return dict(package) if package else None


def get_default_tourism_package(city: Optional[str] = None, package_type: Optional[str] = None) -> Dict[str, Any]:
    packages = list_tourism_packages(city=city, package_type=package_type, active_only=True)
    if packages:
        return packages[0]
    city_name = normalize_tourism_city(city)
    if city_name:
        packages = list_tourism_packages(city=city_name, active_only=True)
        if packages:
            return packages[0]
    return dict(TOURISM_PACKAGES["PKG_TRV_HERITAGE"])


def attractions_for_city(city: Optional[str]) -> List[Dict[str, Any]]:
    city_name = normalize_tourism_city(city) or "Trivandrum"
    return [dict(item) for item in TOURISM_ATTRACTIONS.get(city_name, [])]


def calculate_tourism_fare(
    package_price: float,
    vehicle_type: str,
    passengers: int,
    *,
    guide: bool = False,
    photographer: bool = False,
    boat_ride: bool = False,
    hotel_booking: bool = False,
    ticket_booking: bool = False,
) -> float:
    vehicle_multiplier = {
        "auto": 1.0,
        "taxi": 1.4,
        "xl": 2.0,
        "traveller": 3.5,
        "bus": 5.0,
    }
    vehicle_key = str(vehicle_type or "taxi").strip().lower()
    fare = float(package_price or 0) * vehicle_multiplier.get(vehicle_key, 1.4)
    if int(passengers or 1) > 4:
        fare += 300.0
    if guide:
        fare += TOURISM_ADDONS["guide"]["price"]
    if photographer:
        fare += TOURISM_ADDONS["photographer"]["price"]
    if boat_ride:
        fare += TOURISM_ADDONS["boat_ride"]["price"]
    if hotel_booking:
        fare += TOURISM_ADDONS["hotel_booking"]["price"]
    if ticket_booking:
        fare += TOURISM_ADDONS["ticket_booking"]["price"]
    return round(fare, 2)


def build_trip_timeline(stops: List[str], duration_hours: int, *, start_hour: int = 8) -> Dict[str, str]:
    timeline: Dict[str, str] = {f"{start_hour:02d}:00": "Pickup"}
    if not stops:
        timeline[f"{start_hour + max(1, duration_hours):02d}:00"] = "Drop"
        return timeline

    slot = max(1, int(duration_hours / max(1, len(stops) + 1)))
    current_hour = start_hour + slot
    lunch_added = False
    for stop in stops:
        if not lunch_added and current_hour >= 13:
            timeline[f"{current_hour:02d}:00"] = "Lunch"
            current_hour += 1
            lunch_added = True
        timeline[f"{current_hour:02d}:00"] = stop
        current_hour += slot
    timeline[f"{start_hour + duration_hours:02d}:00"] = "Drop"
    return timeline


def build_tourism_route(
    *,
    city: Optional[str],
    package_id: Optional[str] = None,
    package_type: Optional[str] = None,
    custom_stops: Optional[List[str]] = None,
) -> Dict[str, Any]:
    city_name = normalize_tourism_city(city) or "Trivandrum"
    package = get_tourism_package(package_id) or get_default_tourism_package(city_name, package_type)
    package_type_key = normalize_tourism_package_type(package.get("package_type") or package_type)
    duration_hours = int(package.get("duration_hours") or TOURISM_PACKAGE_TYPES[package_type_key]["duration_hours"])
    stops = [str(item).strip() for item in (custom_stops or []) if str(item or "").strip()]
    if not stops:
        stops = [str(item).strip() for item in package.get("places", []) if str(item or "").strip()]

    attraction_index = {item["name"].lower(): item for item in attractions_for_city(city_name)}
    entry_fees = sum(float(attraction_index.get(stop.lower(), {}).get("entry_fee") or 0) for stop in stops)
    distance_km = round(max(8.0, len(stops) * 11.5 + (duration_hours * 1.8)), 1)
    travel_time_minutes = int(max(60, distance_km * 2.4 + len(stops) * 45))
    return {
        "city": city_name,
        "package": dict(package),
        "stops": stops,
        "distance_km": distance_km,
        "travel_time_minutes": travel_time_minutes,
        "entry_fees": round(entry_fees, 2),
        "food_stops": ["Local lunch stop"] if duration_hours >= 6 else [],
        "timeline": build_trip_timeline(stops, duration_hours),
    }


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "on", "enabled"}


def _normalize_list(value: Any) -> List[str]:
    if value is None:
        return []
    values = [value] if isinstance(value, str) else value
    if not isinstance(values, list):
        return []
    return [str(item or "").strip() for item in values if str(item or "").strip()]


def tourism_driver_eligibility(
    driver: Dict[str, Any],
    *,
    city: Optional[str] = None,
    language: Optional[str] = None,
) -> Dict[str, Any]:
    source = driver or {}
    vehicle = source.get("vehicle_info") if isinstance(source.get("vehicle_info"), dict) else {}
    online_vehicle = source.get("online_vehicle") if isinstance(source.get("online_vehicle"), dict) else {}
    failures: List[str] = []

    kyc_status = str(source.get("kyc_status") or source.get("verification_status") or "").strip().lower()
    kyc_verified = _truthy(source.get("kyc_verified")) or kyc_status in {"approved", "verified", "kyc_verified"}
    if not kyc_verified:
        failures.append("kyc_not_verified")

    accepted = [
        item.lower().replace("-", "_").replace(" ", "_")
        for item in _normalize_list(
            vehicle.get("accepted_ride_types")
            or online_vehicle.get("accepted_ride_types")
            or source.get("accepted_ride_types")
        )
    ]
    tourism_enabled = (
        "tourism" in accepted
        or _truthy(source.get("tourism_enabled"))
        or _truthy(vehicle.get("tourism_enabled"))
        or _truthy(online_vehicle.get("tourism_enabled"))
    )
    if not tourism_enabled:
        failures.append("tourism_not_enabled")

    try:
        rating = float(source.get("tourism_rating") or source.get("average_rating") or source.get("rating") or 0)
    except Exception:
        rating = 0.0
    if rating < 4.5:
        failures.append("rating_below_4_5")

    language_value = str(language or "").strip().lower()
    driver_languages = [item.lower() for item in _normalize_list(source.get("languages") or source.get("language_codes"))]
    if language_value and language_value not in driver_languages:
        failures.append("language_not_available")

    city_name = normalize_tourism_city(city)
    if city_name:
        local_values = _normalize_list(
            source.get("tourism_cities")
            or source.get("service_cities")
            or source.get("local_areas")
            or source.get("districts")
            or source.get("district")
            or source.get("city")
        )
        normalized_local = {normalize_tourism_city(item) for item in local_values}
        if city_name not in normalized_local:
            failures.append("local_area_experience_missing")

    return {"eligible": not failures, "failures": failures}


def build_tourism_summary(booking: Dict[str, Any]) -> Dict[str, Any]:
    visited = booking.get("visited_locations") if isinstance(booking.get("visited_locations"), list) else []
    tourism_details = booking.get("tourism_details") if isinstance(booking.get("tourism_details"), dict) else {}
    route = tourism_details.get("route") if isinstance(tourism_details.get("route"), dict) else {}
    planned = route.get("stops") if isinstance(route.get("stops"), list) else []
    return {
        "booking_id": booking.get("id") or booking.get("booking_id"),
        "status": booking.get("status"),
        "package_id": tourism_details.get("package_id") or booking.get("package_id"),
        "package_name": tourism_details.get("package_name") or booking.get("tourism_package"),
        "city": tourism_details.get("city"),
        "visited_count": len(visited),
        "planned_count": len(planned),
        "visited_locations": visited,
        "remaining_locations": [stop for stop in planned if stop not in visited],
        "fare": booking.get("estimated_fare") or booking.get("fare"),
        "completed_at": booking.get("completed_at") or datetime.utcnow().isoformat(),
    }
