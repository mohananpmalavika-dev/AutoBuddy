import asyncio
import math
import os
import uuid
from datetime import datetime, timedelta
from app.utils.time_helpers import get_ist_now
from enum import Enum
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func

from app.db.deps import get_db
from app.db.models_features import PaymentMethod as PassengerPaymentMethod
from app.db.models_features import PromoCode, PromoCodeUsage
from app.db.database import SessionLocal
from app.models.document_catalog import effective_is_mandatory, ensure_default_document_requirements
from app.models.canonical_vehicle_model import get_vehicle_multiplier
from app.models.assisted_ride import (
    ASSISTED_RIDE_STATUS_FLOW,
    assisted_driver_eligibility,
    build_assisted_ride_snapshot,
    generate_assisted_otp,
    generate_assisted_ride_id,
    prepare_assisted_ride_context,
)
from app.models.ride_type_compatibility import is_vehicle_compatible_with_ride_type
from app.models.tourism import (
    TOURISM_ADDONS,
    TOURISM_PACKAGE_TYPES,
    TOURISM_STATUS_FLOW,
    attractions_for_city,
    build_tourism_route,
    build_tourism_summary,
    calculate_tourism_fare,
    get_default_tourism_package,
    get_tourism_package,
    list_tourism_packages,
    normalize_tourism_city,
    tourism_driver_eligibility,
)
from app.models.women_only import (
    build_women_only_safety_context,
    calculate_women_only_fare,
    is_women_only_passenger_allowed,
    sanitize_women_only_ride_for_response,
    women_only_driver_eligibility,
)
from app.models.rental import (
    RENTAL_STATUS_FLOW,
    build_rental_booking_context,
    rental_driver_eligibility,
)
from app.utils.rbac import get_current_user_secure

router = APIRouter(prefix="/api", tags=["ride_products"])
PER_TRIP_BLOCK_GRACE_RIDES = 2
SCHEDULED_MIN_ADVANCE_MINUTES = 30
PASSENGER_KYC_REQUIRED_FOR_BOOKING = (
    os.environ.get("PASSENGER_KYC_REQUIRED_FOR_BOOKING", "false").strip().lower()
    not in {"0", "false", "no", "off"}
)
RIDE_PRODUCT_CONFIG_VERSION = 2


class RideProduct(str, Enum):
    NORMAL = "normal"
    POOL = "pool"
    SCHEDULED = "scheduled"
    CORPORATE = "corporate"
    AIRPORT = "airport"
    INTERCITY = "intercity"
    EV_AUTO = "ev_auto"
    TOURISM = "tourism"
    WOMEN_ONLY = "women_only"
    PET = "pet"
    RENTAL_HOURLY = "rental_hourly"
    SCHOOL_ELDERLY_SAFE = "school_elderly_safe"


class AdvancedBookingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    pickup_location: Dict[str, Any]
    drop_location: Dict[str, Any]
    ride_product: RideProduct = RideProduct.NORMAL
    scheduled_for: Optional[datetime] = None
    passenger_count: int = Field(default=1, ge=1, le=6)
    corporate_code: Optional[str] = Field(default=None, max_length=80)
    corporate_purpose: Optional[str] = Field(default=None, max_length=160)
    corporate_cost_center_id: Optional[str] = Field(default=None, max_length=80)
    airport_terminal: Optional[str] = Field(default=None, max_length=40)
    flight_number: Optional[str] = Field(default=None, max_length=40)
    intercity_return_trip: bool = False
    intercity_wait_hours: Optional[int] = Field(default=None, ge=0, le=72)
    intercity_tolls_included: bool = True
    intercity_route_notes: Optional[str] = Field(default=None, max_length=240)
    tourism_package: Optional[str] = Field(default=None, max_length=120)
    tourism_package_id: Optional[str] = Field(default=None, max_length=40)
    tourism_package_type: Optional[str] = Field(default="full_day", max_length=40)
    tourism_city: Optional[str] = Field(default=None, max_length=80)
    tourism_custom_stops: List[str] = Field(default_factory=list, max_length=12)
    tourism_language_preference: str = Field(default="English", max_length=40)
    tourism_guide_required: bool = False
    tourism_photographer_required: bool = False
    tourism_boat_ride_required: bool = False
    tourism_hotel_booking_requested: bool = False
    tourism_ticket_booking_requested: bool = False
    women_only_required: bool = False
    passenger_gender: Optional[str] = Field(default=None, max_length=20)
    women_only_female_driver_required: bool = True
    women_only_allow_trusted_male_driver: bool = False
    women_only_guardian_name: Optional[str] = Field(default=None, max_length=80)
    women_only_guardian_phone: Optional[str] = Field(default=None, max_length=20)
    women_only_share_guardian_tracking: bool = True
    driver_gender_preference: Optional[str] = Field(default="any", max_length=20)
    pet_type: Optional[str] = Field(default=None, max_length=80)
    pet_count: Optional[int] = Field(default=None, ge=1, le=4)
    pet_carrier_required: bool = False
    rental_hours: Optional[int] = Field(default=None, ge=1, le=12)
    rental_package_hours: Optional[int] = Field(default=None, ge=1, le=12)
    rental_included_km: Optional[float] = Field(default=None, ge=0)
    rental_stops: List[Dict[str, Any]] = Field(default_factory=list, max_length=12)
    safe_ride_priority: Optional[str] = Field(default=None, max_length=40)
    guardian_name: Optional[str] = Field(default=None, max_length=80)
    guardian_phone: Optional[str] = Field(default=None, max_length=20)
    assisted_passenger_name: Optional[str] = Field(default=None, max_length=80)
    assisted_passenger_age: Optional[int] = Field(default=None, ge=1, le=120)
    wheelchair_required: bool = False
    assistance_required: bool = True
    female_driver_preferred: bool = False
    trusted_driver_required: bool = True
    guardian_share_tracking: bool = True
    notes: Optional[str] = Field(default=None, max_length=500)
    allow_parallel: bool = False
    selected_driver_id: Optional[str] = Field(default=None, max_length=120)
    payment_method: str = Field(default="cash", max_length=20)
    payment_method_id: Optional[str] = Field(default=None, max_length=120)
    payment_channel: Optional[str] = Field(default=None, max_length=40)
    promo_code: Optional[str] = Field(default=None, max_length=50)
    promo_discount_type: Optional[str] = Field(default=None, max_length=20)
    promo_discount_value: Optional[float] = Field(default=None, ge=0)
    promo_max_discount: Optional[float] = Field(default=None, ge=0)
    vehicle_type_id: Optional[str] = Field(default=None, max_length=50)
    vehicle_subtype_id: Optional[str] = Field(default=None, max_length=80)
    vehicle_model: Optional[str] = Field(default=None, max_length=120)


class DistrictRideProductRule(BaseModel):
    district: str = Field(min_length=2, max_length=80)
    enabled_products: List[RideProduct] = Field(default_factory=list)


class RideProductDistrictConfigUpdate(BaseModel):
    default_enabled_products: List[RideProduct] = Field(default_factory=list)
    district_rules: List[DistrictRideProductRule] = Field(default_factory=list, max_length=300)


class TourismRouteRequest(BaseModel):
    city: str = Field(min_length=2, max_length=80)
    package_id: Optional[str] = Field(default=None, max_length=40)
    package_type: Optional[str] = Field(default="full_day", max_length=40)
    custom_stops: List[str] = Field(default_factory=list, max_length=12)
    vehicle_type: str = Field(default="taxi", max_length=40)
    passengers_count: int = Field(default=1, ge=1, le=40)
    guide_required: bool = False
    photographer_required: bool = False
    boat_ride_required: bool = False
    hotel_booking_requested: bool = False
    ticket_booking_requested: bool = False


class TourismBookingRequest(TourismRouteRequest):
    passenger_id: Optional[str] = Field(default=None, max_length=120)
    scheduled_date: datetime
    pickup_location: Dict[str, Any]
    language_preference: str = Field(default="English", max_length=40)
    notes: Optional[str] = Field(default=None, max_length=500)


class TourismVisitedPlaceRequest(BaseModel):
    place_name: str = Field(min_length=1, max_length=120)
    visited_at: Optional[datetime] = None


ALL_RIDE_PRODUCT_KEYS: List[str] = [item.value for item in RideProduct]
ALL_RIDE_PRODUCT_KEY_SET = set(ALL_RIDE_PRODUCT_KEYS)
LEGACY_COMPATIBILITY_RIDE_TYPE_KEYS = {
    "instant",
    "scheduled",
    "rental",
    "airport",
    "corporate",
    "tourism",
    "goods",
    "intercity",
    "ev_auto",
    "women_only",
    "pet",
}
RIDE_TYPE_COMPATIBILITY_ALIASES = {
    RideProduct.NORMAL.value: "instant",
    RideProduct.POOL.value: "instant",
    RideProduct.EV_AUTO.value: "ev_auto",
    RideProduct.WOMEN_ONLY.value: "women_only",
    RideProduct.SCHOOL_ELDERLY_SAFE.value: "instant",
    RideProduct.INTERCITY.value: "intercity",
    RideProduct.RENTAL_HOURLY.value: "rental",
    RideProduct.PET.value: "pet",
}
DISTRICT_ALIASES: Dict[str, str] = {
    "trivandrum": "thiruvananthapuram",
    "thiruvananthapuram": "thiruvananthapuram",
    "tvm": "thiruvananthapuram",
    "kochi": "ernakulam",
    "cochin": "ernakulam",
    "ernakulam": "ernakulam",
    "calicut": "kozhikode",
    "kozhikode": "kozhikode",
    "kannur": "kannur",
    "kasaragod": "kasaragod",
    "wayanad": "wayanad",
    "malappuram": "malappuram",
    "palakkad": "palakkad",
    "thrissur": "thrissur",
    "idukki": "idukki",
    "kottayam": "kottayam",
    "alappuzha": "alappuzha",
    "pathanamthitta": "pathanamthitta",
    "kollam": "kollam",
}


def _normalize_driver_accepted_ride_types(value: Any) -> List[str]:
    if value is None:
        return []
    raw_values = [part.strip() for part in value.split(",")] if isinstance(value, str) else value
    if not isinstance(raw_values, list):
        return []
    result: List[str] = []
    seen: Set[str] = set()
    for raw in raw_values:
        key = str(raw or "").strip().lower().replace("-", "_").replace(" ", "_")
        if key not in ALL_RIDE_PRODUCT_KEY_SET and key not in LEGACY_COMPATIBILITY_RIDE_TYPE_KEYS:
            continue
        if key in seen:
            continue
        seen.add(key)
        result.append(key)
    return result


def _driver_accepts_ride_product(driver: Dict[str, Any], ride_product: RideProduct) -> bool:
    raw_vehicle = _as_dict(driver.get("vehicle_info"))
    accepted = _normalize_driver_accepted_ride_types(
        raw_vehicle.get("accepted_ride_types")
        or _as_dict(driver.get("online_vehicle")).get("accepted_ride_types")
        or driver.get("accepted_ride_types")
    )
    if not accepted:
        return True
    requested_key = ride_product.value
    if requested_key in accepted:
        return True
    if ride_product == RideProduct.WOMEN_ONLY and any(item in {"normal", "instant"} for item in accepted):
        return True
    requested_compatibility = RIDE_TYPE_COMPATIBILITY_ALIASES.get(requested_key, requested_key)
    return any(item not in ALL_RIDE_PRODUCT_KEY_SET and item == requested_compatibility for item in accepted)


def _truthy_ev_value(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    text = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
    return text in {"1", "true", "yes", "y", "on", "ev", "electric", "ev_auto", "battery_electric"}


def _driver_has_ev_auto_capability(driver: Dict[str, Any]) -> bool:
    raw_vehicle = _as_dict(driver.get("vehicle_info"))
    online_vehicle = _as_dict(driver.get("online_vehicle"))
    accepted = _normalize_driver_accepted_ride_types(
        raw_vehicle.get("accepted_ride_types")
        or online_vehicle.get("accepted_ride_types")
        or driver.get("accepted_ride_types")
    )
    if RideProduct.EV_AUTO.value in accepted:
        return True

    flag_fields = ("is_ev", "is_electric", "electric", "ev_enabled", "ev_auto")
    for source in (raw_vehicle, online_vehicle, driver):
        if any(_truthy_ev_value(source.get(field)) for field in flag_fields):
            return True

    text_fields = (
        "vehicle_type_id",
        "vehicle_type",
        "vehicle_subtype_id",
        "vehicle_model",
        "model",
        "fuel_type",
        "fuel",
        "energy_type",
        "powertrain",
    )
    for source in (raw_vehicle, online_vehicle, driver):
        for field in text_fields:
            text = str(source.get(field) or "").strip().lower().replace("-", "_").replace(" ", "_")
            if text in {"ev", "electric", "ev_auto", "battery_electric", "zero_emission"} or "ev_auto" in text:
                return True
    return False


def _driver_has_tourism_capability(
    driver: Dict[str, Any],
    *,
    city: Optional[str] = None,
    language: Optional[str] = None,
) -> bool:
    return tourism_driver_eligibility(driver, city=city, language=language).get("eligible") is True


def _driver_has_women_only_capability(
    driver: Dict[str, Any],
    *,
    female_driver_required: bool = True,
    allow_trusted_male_driver_if_unavailable: bool = False,
) -> bool:
    return women_only_driver_eligibility(
        driver,
        female_driver_required=female_driver_required,
        allow_trusted_male_driver_if_unavailable=allow_trusted_male_driver_if_unavailable,
    ).get("eligible") is True


def _driver_has_rental_capability(
    driver: Dict[str, Any],
    *,
    vehicle_type: Optional[str] = None,
    package_hours: Optional[int] = None,
) -> bool:
    return rental_driver_eligibility(
        driver,
        vehicle_type=vehicle_type,
        package_hours=package_hours,
    ).get("eligible") is True


def _normalize_tourism_stops(values: Any) -> List[str]:
    if values is None:
        return []
    raw_values = values if isinstance(values, list) else [values]
    result: List[str] = []
    seen: Set[str] = set()
    for raw in raw_values:
        text = str(raw or "").strip()
        key = text.lower()
        if not text or key in seen:
            continue
        seen.add(key)
        result.append(text[:120])
    return result[:12]


def _build_tourism_booking_context(
    *,
    package_id: Optional[str],
    package_type: Optional[str],
    city: Optional[str],
    custom_stops: Any,
    vehicle_type: Optional[str],
    passengers_count: int,
    guide_required: bool = False,
    photographer_required: bool = False,
    boat_ride_required: bool = False,
    hotel_booking_requested: bool = False,
    ticket_booking_requested: bool = False,
) -> Dict[str, Any]:
    city_name = normalize_tourism_city(city)
    package = get_tourism_package(package_id) or get_default_tourism_package(city_name, package_type)
    if package_id and not get_tourism_package(package_id):
        raise HTTPException(status_code=404, detail="Tourism package not found")

    route = build_tourism_route(
        city=city_name or package.get("city"),
        package_id=package.get("id"),
        package_type=package_type or package.get("package_type"),
        custom_stops=_normalize_tourism_stops(custom_stops),
    )
    vehicle_key = str(vehicle_type or "taxi").strip().lower() or "taxi"
    allowed_vehicles = {str(item).strip().lower() for item in package.get("vehicle_types", [])}
    if allowed_vehicles and vehicle_key not in allowed_vehicles:
        raise HTTPException(
            status_code=400,
            detail=f"{package.get('name')} is not available for {vehicle_key}.",
        )

    fare = calculate_tourism_fare(
        package.get("base_price", 0),
        vehicle_key,
        passengers_count,
        guide=guide_required,
        photographer=photographer_required,
        boat_ride=boat_ride_required,
        hotel_booking=hotel_booking_requested,
        ticket_booking=ticket_booking_requested,
    )
    add_ons = {
        "guide": bool(guide_required),
        "photographer": bool(photographer_required),
        "boat_ride": bool(boat_ride_required),
        "hotel_booking": bool(hotel_booking_requested),
        "ticket_booking": bool(ticket_booking_requested),
    }
    return {
        "package": package,
        "city": route.get("city") or city_name or package.get("city"),
        "route": route,
        "fare": fare,
        "add_ons": add_ons,
        "status_flow": list(TOURISM_STATUS_FLOW),
    }


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value if value is not None else default)
    except Exception:
        return default


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _vehicle_multiplier(vehicle_type_id: Optional[str], subtype_id: Optional[str] = None) -> float:
    key = str(vehicle_type_id or "").strip().lower()
    subtype_key = str(subtype_id or "").strip() or None
    if not key:
        return 1.0
    try:
        multiplier = float(get_vehicle_multiplier(key, subtype_key))
        return multiplier if math.isfinite(multiplier) and multiplier > 0 else 1.0
    except Exception:
        return 1.0


def _product_multiplier(product: RideProduct) -> float:
    return {
        RideProduct.NORMAL: 1.00,
        RideProduct.POOL: 0.78,
        RideProduct.SCHEDULED: 1.10,
        RideProduct.CORPORATE: 1.20,
        RideProduct.AIRPORT: 1.35,
        RideProduct.INTERCITY: 1.60,
        RideProduct.EV_AUTO: 1.05,
        RideProduct.TOURISM: 1.85,
        RideProduct.WOMEN_ONLY: 1.15,
        RideProduct.PET: 1.18,
        RideProduct.RENTAL_HOURLY: 2.10,
        RideProduct.SCHOOL_ELDERLY_SAFE: 1.12,
    }.get(product, 1.00)


def _location_distance_km(origin: Dict[str, Any], target: Dict[str, Any]) -> float:
    origin_lat = _to_float(origin.get("latitude"), math.nan)
    origin_lng = _to_float(origin.get("longitude"), math.nan)
    target_lat = _to_float(target.get("latitude"), math.nan)
    target_lng = _to_float(target.get("longitude"), math.nan)
    if any(not math.isfinite(value) for value in [origin_lat, origin_lng, target_lat, target_lng]):
        return math.inf
    radius_km = 6371.0
    lat1 = math.radians(origin_lat)
    lat2 = math.radians(target_lat)
    delta_lat = math.radians(target_lat - origin_lat)
    delta_lng = math.radians(target_lng - origin_lng)
    hav = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(delta_lng / 2) ** 2
    )
    return radius_km * 2 * math.atan2(math.sqrt(hav), math.sqrt(max(0.0, 1 - hav)))


def _driver_matches_service(
    driver: Dict[str, Any],
    vehicle_type_id: Optional[str],
    vehicle_subtype_id: Optional[str],
    ride_product: RideProduct,
    *,
    tourism_city: Optional[str] = None,
    tourism_language_preference: Optional[str] = None,
    women_only_female_driver_required: bool = True,
    women_only_allow_trusted_male_driver: bool = False,
    rental_package_hours: Optional[int] = None,
) -> bool:
    raw_vehicle = _as_dict(driver.get("vehicle_info"))
    driver_vehicle_type = str(
        raw_vehicle.get("vehicle_type_id")
        or raw_vehicle.get("vehicle_type")
        or driver.get("vehicle_type_id")
        or driver.get("vehicle_type")
        or "auto"
    ).strip().lower()
    driver_vehicle_subtype = str(
        raw_vehicle.get("vehicle_subtype_id")
        or driver.get("vehicle_subtype_id")
        or ""
    ).strip().lower()
    requested_vehicle_type = str(vehicle_type_id or "").strip().lower()
    requested_vehicle_subtype = str(vehicle_subtype_id or "").strip().lower()
    ev_auto_type_match = (
        ride_product == RideProduct.EV_AUTO
        and requested_vehicle_type in {"auto", "ev_auto"}
        and driver_vehicle_type in {"auto", "ev_auto"}
    )
    if requested_vehicle_type and driver_vehicle_type != requested_vehicle_type and not ev_auto_type_match:
        return False
    if requested_vehicle_subtype and driver_vehicle_subtype and driver_vehicle_subtype != requested_vehicle_subtype:
        return False
    compatibility_key = RIDE_TYPE_COMPATIBILITY_ALIASES.get(ride_product.value, ride_product.value)
    if not is_vehicle_compatible_with_ride_type(driver_vehicle_type, compatibility_key):
        return False
    if ride_product == RideProduct.EV_AUTO and not _driver_has_ev_auto_capability(driver):
        return False
    if ride_product == RideProduct.TOURISM and not _driver_has_tourism_capability(
        driver,
        city=tourism_city,
        language=tourism_language_preference,
    ):
        return False
    if ride_product == RideProduct.WOMEN_ONLY and not _driver_has_women_only_capability(
        driver,
        female_driver_required=women_only_female_driver_required,
        allow_trusted_male_driver_if_unavailable=women_only_allow_trusted_male_driver,
    ):
        return False
    if ride_product == RideProduct.RENTAL_HOURLY and not _driver_has_rental_capability(
        driver,
        vehicle_type=requested_vehicle_type,
        package_hours=rental_package_hours,
    ):
        return False
    return _driver_accepts_ride_product(driver, ride_product)


def _driver_search_projection() -> Dict[str, int]:
    return {
        "_id": 1,
        "id": 1,
        "user_id": 1,
        "current_location": 1,
        "vehicle_info": 1,
        "online_vehicle": 1,
        "vehicle_type": 1,
        "vehicle_type_id": 1,
        "vehicle_subtype_id": 1,
        "rating": 1,
        "average_rating": 1,
        "rental_rating": 1,
        "rental_enabled": 1,
        "gender": 1,
        "kyc_status": 1,
        "kyc_verified": 1,
        "vehicle_verified": 1,
        "vehicle_verification_status": 1,
        "police_verified": 1,
        "police_verification_status": 1,
        "background_check_status": 1,
        "safety_score": 1,
        "women_only_safety_score": 1,
        "trusted_safety_driver": 1,
        "women_only_trusted_driver": 1,
        "live_location_enabled": 1,
        "location_sharing_enabled": 1,
        "active_complaints": 1,
        "trained_for_assisted_rides": 1,
        "assisted_ride_trained": 1,
        "assisted_ride_enabled": 1,
        "emergency_contact_verified": 1,
        "emergency_contact_enabled": 1,
        "emergency_contact_phone": 1,
        "safety_complaint_count": 1,
        "open_safety_complaints": 1,
        "accepted_ride_types": 1,
        "tourism_enabled": 1,
        "tourism_rating": 1,
        "languages": 1,
        "language_codes": 1,
        "district": 1,
        "city": 1,
        "tourism_cities": 1,
        "service_cities": 1,
        "local_areas": 1,
        "districts": 1,
    }


async def _hydrate_driver_user_identity(
    db: AsyncIOMotorDatabase,
    drivers: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    driver_ids = [str(item.get("user_id") or item.get("id") or "").strip() for item in drivers if item]
    driver_ids = [item for item in driver_ids if item]
    if not driver_ids:
        return drivers
    users = await db.users.find(
        {"id": {"$in": list(set(driver_ids))}},
        {"_id": 0, "id": 1, "name": 1, "gender": 1},
    ).to_list(None)
    users_by_id = {str(item.get("id") or ""): item for item in users}
    hydrated: List[Dict[str, Any]] = []
    for driver in drivers:
        driver_id = str(driver.get("user_id") or driver.get("id") or "").strip()
        user = users_by_id.get(driver_id) or {}
        hydrated.append(
            {
                **driver,
                "gender": driver.get("gender") or user.get("gender"),
                "name": driver.get("name") or user.get("name"),
            }
        )
    return hydrated


async def _find_matching_driver_ids(
    db: AsyncIOMotorDatabase,
    pickup: Dict[str, Any],
    vehicle_type_id: Optional[str],
    vehicle_subtype_id: Optional[str],
    ride_product: RideProduct,
    *,
    tourism_city: Optional[str] = None,
    tourism_language_preference: Optional[str] = None,
    women_only_female_driver_required: bool = True,
    women_only_allow_trusted_male_driver: bool = False,
    rental_package_hours: Optional[int] = None,
    radius_km: float = 2.0,
    limit: int = 5,
) -> List[str]:
    drivers = await db.drivers.find(
        {
            "is_available": True,
            "vehicle_info": {"$ne": None},
            "kyc_status": "approved",
        },
        _driver_search_projection(),
    ).to_list(250)
    if ride_product == RideProduct.WOMEN_ONLY:
        drivers = await _hydrate_driver_user_identity(db, drivers)
    scored: List[Dict[str, Any]] = []
    for driver in drivers:
        if not _driver_matches_service(
            driver,
            vehicle_type_id,
            vehicle_subtype_id,
            ride_product,
            tourism_city=tourism_city,
            tourism_language_preference=tourism_language_preference,
            women_only_female_driver_required=women_only_female_driver_required,
            women_only_allow_trusted_male_driver=women_only_allow_trusted_male_driver,
            rental_package_hours=rental_package_hours,
        ):
            continue
        location = _as_dict(driver.get("current_location"))
        distance = _location_distance_km(pickup, location)
        if not math.isfinite(distance) or distance > radius_km:
            continue
        if ride_product == RideProduct.SCHOOL_ELDERLY_SAFE:
            eligibility = await assisted_driver_eligibility(db, driver)
            if not eligibility["eligible"]:
                continue
        scored.append(
            {
                "driver_id": str(driver.get("user_id") or driver.get("id") or driver.get("_id") or ""),
                "distance_km": distance,
                "gender_priority": (
                    0
                    if ride_product != RideProduct.WOMEN_ONLY
                    or str(driver.get("gender") or "").strip().lower() == "female"
                    else 1
                ),
            }
        )
    scored.sort(key=lambda item: (item["gender_priority"], item["distance_km"]))
    return [item["driver_id"] for item in scored[: max(1, int(limit or 1))] if item["driver_id"]]


async def _selected_driver_pickup_error(
    db: AsyncIOMotorDatabase,
    selected_driver_id: str,
    pickup: Dict[str, Any],
    vehicle_type_id: Optional[str],
    vehicle_subtype_id: Optional[str],
    ride_product: RideProduct,
    *,
    tourism_city: Optional[str] = None,
    tourism_language_preference: Optional[str] = None,
    women_only_female_driver_required: bool = True,
    women_only_allow_trusted_male_driver: bool = False,
    rental_package_hours: Optional[int] = None,
    radius_km: float = 2.0,
) -> Optional[str]:
    driver_id = str(selected_driver_id or "").strip()
    if not driver_id:
        return "Selected driver is invalid."

    driver = await db.drivers.find_one(
        {
            "user_id": driver_id,
            "is_available": True,
            "vehicle_info": {"$ne": None},
            "kyc_status": "approved",
        },
        _driver_search_projection(),
    )
    if not driver:
        return "Selected driver is unavailable right now."
    if ride_product == RideProduct.WOMEN_ONLY:
        hydrated = await _hydrate_driver_user_identity(db, [driver])
        driver = hydrated[0] if hydrated else driver
    if not _driver_matches_service(
        driver,
        vehicle_type_id,
        vehicle_subtype_id,
        ride_product,
        tourism_city=tourism_city,
        tourism_language_preference=tourism_language_preference,
        women_only_female_driver_required=women_only_female_driver_required,
        women_only_allow_trusted_male_driver=women_only_allow_trusted_male_driver,
        rental_package_hours=rental_package_hours,
    ):
        return "Selected driver does not match the requested vehicle or ride type."
    if ride_product == RideProduct.SCHOOL_ELDERLY_SAFE:
        eligibility = await assisted_driver_eligibility(db, driver)
        if not eligibility["eligible"]:
            return "Selected driver is not verified for school/elderly assisted rides."

    distance = _location_distance_km(pickup, _as_dict(driver.get("current_location")))
    if not math.isfinite(distance):
        return "Selected driver has no live location near the pickup point."
    if distance > radius_km:
        return f"Selected driver is outside the pickup search radius ({radius_km:g} km)."
    return None



def _product_label(product: RideProduct) -> str:
    return {
        RideProduct.NORMAL: "Normal Ride",
        RideProduct.POOL: "Ride Sharing / Pooling",
        RideProduct.SCHEDULED: "Scheduled Booking",
        RideProduct.CORPORATE: "Corporate Ride",
        RideProduct.AIRPORT: "Airport Booking",
        RideProduct.INTERCITY: "Intercity Booking",
        RideProduct.EV_AUTO: "EV Auto",
        RideProduct.TOURISM: "Tourism Ride",
        RideProduct.WOMEN_ONLY: "Women-Only Ride",
        RideProduct.PET: "Pet Rides",
        RideProduct.RENTAL_HOURLY: "Rental / Hourly Package",
        RideProduct.SCHOOL_ELDERLY_SAFE: "School / Elderly Safe Ride",
    }.get(product, "Normal Ride")


def _corporate_lookup(corporate_code: str) -> Dict[str, Any]:
    code = str(corporate_code or "").strip()
    return {
        "$or": [
            {"id": code},
            {"company_id": code},
            {"corporate_code": code},
            {"registration_number": code},
        ]
    }


async def _resolve_corporate_booking_context(
    db: AsyncIOMotorDatabase,
    current_user: Dict[str, Any],
    corporate_code: Optional[str],
    estimated_fare: float,
) -> Dict[str, Any]:
    code = str(corporate_code or "").strip()
    if not code:
        raise HTTPException(status_code=400, detail="Corporate code required")

    company = await db.corporate_companies.find_one(_corporate_lookup(code), {"_id": 0})
    if not company or company.get("is_active") is False:
        raise HTTPException(status_code=404, detail="Corporate account not found or inactive")

    passenger_id = str(current_user.get("id") or current_user.get("user_id") or "").strip()
    user_email = str(current_user.get("email") or "").strip().lower()
    employee_match = [
        {"user_id": passenger_id},
        {"employee_id": passenger_id},
        {"id": passenger_id},
    ]
    if user_email:
        employee_match.append({"email": user_email})

    employee = await db.corporate_employees.find_one(
        {
            "company_id": company["id"],
            "is_active": True,
            "$or": employee_match,
        },
        {"_id": 0},
    )
    if not employee:
        raise HTTPException(status_code=403, detail="You are not an active employee under this corporate account")

    active_policies = await db.corporate_policies.find(
        {"company_id": company["id"], "is_active": True},
        {"_id": 0},
    ).to_list(100)
    if not active_policies:
        raise HTTPException(status_code=409, detail="Corporate ride needs manager approval: no active policy found")

    employee_budget = float(employee.get("monthly_ride_budget") or 0)
    employee_spend = float(employee.get("budget_spent_this_month") or 0)
    if employee_budget and employee_spend + estimated_fare > employee_budget:
        raise HTTPException(status_code=409, detail="Corporate ride needs manager approval: employee budget exceeded")

    employee_limit = int(employee.get("rides_per_month_limit") or 0)
    employee_rides = int(employee.get("rides_used_this_month") or 0)
    if employee_limit and employee_rides + 1 > employee_limit:
        raise HTTPException(status_code=409, detail="Corporate ride needs manager approval: ride count limit exceeded")

    matched_policy = active_policies[0]
    for policy in active_policies:
        max_ride_cost = float(policy.get("max_ride_cost") or 0)
        if max_ride_cost and estimated_fare > max_ride_cost:
            raise HTTPException(status_code=409, detail="Corporate ride needs manager approval: policy fare limit exceeded")
        max_monthly_cost = float(policy.get("max_monthly_cost") or 0)
        if max_monthly_cost and employee_spend + estimated_fare > max_monthly_cost:
            raise HTTPException(status_code=409, detail="Corporate ride needs manager approval: policy monthly limit exceeded")
        if policy.get("require_approval"):
            raise HTTPException(status_code=409, detail="Corporate ride needs manager approval")
        matched_policy = policy

    return {
        "company": company,
        "employee": employee,
        "policy": matched_policy,
    }


def _normalize_role(value: Any) -> str:
    role = str(value or "").strip().lower()
    if "." in role:
        role = role.split(".")[-1]
    return role


def _normalize_gender(value: Any) -> str:
    gender = str(value or "").strip().lower()
    if "." in gender:
        gender = gender.split(".")[-1]
    return gender


def _normalize_driver_gender_preference(value: Any) -> str:
    raw = _normalize_gender(value or "any")
    aliases = {
        "": "any",
        "none": "any",
        "no_preference": "any",
        "no-preference": "any",
        "female_only": "female",
        "female-only": "female",
        "women": "female",
        "woman": "female",
        "male_only": "male",
        "male-only": "male",
        "men": "male",
        "man": "male",
    }
    normalized = aliases.get(raw, raw)
    if normalized not in {"any", "female", "male"}:
        raise HTTPException(status_code=400, detail="driver_gender_preference must be any, female, or male")
    return normalized


def _as_aware_ist(value: Optional[datetime]) -> Optional[datetime]:
    if value is None:
        return None
    current_ist = get_ist_now()
    if value.tzinfo is None:
        return value.replace(tzinfo=current_ist.tzinfo)
    return value.astimezone(current_ist.tzinfo)


def _normalize_district_name(value: Any) -> str:
    text = str(value or "").strip().lower()
    if not text:
        return ""
    text = text.replace(" district", "").replace("district ", "")
    text = " ".join(text.replace("-", " ").replace("/", " ").split())
    if text in DISTRICT_ALIASES:
        return DISTRICT_ALIASES[text]
    compact = text.replace(" ", "")
    if compact in DISTRICT_ALIASES:
        return DISTRICT_ALIASES[compact]
    return text


def _extract_district_from_address(address: Any) -> Optional[str]:
    raw = str(address or "").strip()
    if not raw:
        return None
    tokens = [part.strip() for part in raw.replace("|", ",").split(",") if part.strip()]
    if not tokens:
        return None
    lowered_tokens = [item.lower() for item in tokens]
    for item in lowered_tokens:
        if "district" in item:
            normalized = _normalize_district_name(item)
            return normalized or None
    if len(tokens) >= 2:
        guess = _normalize_district_name(tokens[-2])
        if guess:
            return guess
    guess = _normalize_district_name(tokens[-1])
    return guess or None


def _compute_promo_discount(
    fare_amount: float,
    discount_type: Optional[str],
    discount_value: Optional[float],
    max_discount: Optional[float],
) -> float:
    base = max(0.0, float(fare_amount or 0.0))
    if base <= 0:
        return 0.0
    kind = str(discount_type or "").strip().lower()
    value = max(0.0, float(discount_value or 0.0))
    if value <= 0:
        return 0.0
    if kind == "percentage":
        discount = (base * value) / 100.0
    else:
        discount = value
    if max_discount is not None:
        discount = min(discount, max(0.0, float(max_discount or 0.0)))
    return round(min(discount, base), 2)


def _get_owned_payment_method(passenger_id: str, payment_method_id: str) -> PassengerPaymentMethod:
    with SessionLocal() as session:
        method = (
            session.query(PassengerPaymentMethod)
            .filter(
                PassengerPaymentMethod.id == payment_method_id,
                PassengerPaymentMethod.passenger_id == passenger_id,
                PassengerPaymentMethod.is_active == True,
            )
            .first()
        )
        if not method:
            raise HTTPException(status_code=400, detail="Selected payment method is invalid or not available.")
        return method


def _resolve_validated_promo(
    *,
    passenger_id: str,
    promo_code: str,
    ride_fare: float,
) -> Dict[str, Any]:
    code = promo_code.strip()
    if not code:
        return {}

    with SessionLocal() as session:
        now = get_ist_now()
        promo = (
            session.query(PromoCode)
            .filter(
                func.lower(PromoCode.code) == code.lower(),
                PromoCode.is_active == True,
                PromoCode.valid_from <= now,
                PromoCode.valid_until >= now,
            )
            .first()
        )
        if not promo:
            raise HTTPException(status_code=400, detail="Promo code not found or expired.")

        if promo.usage_limit:
            current_usage = (
                session.query(PromoCodeUsage)
                .filter(PromoCodeUsage.promo_code_id == promo.id)
                .count()
            )
            if current_usage >= promo.usage_limit:
                raise HTTPException(status_code=400, detail="Promo code usage limit exceeded.")

        user_usage = (
            session.query(PromoCodeUsage)
            .filter(
                PromoCodeUsage.promo_code_id == promo.id,
                PromoCodeUsage.passenger_id == passenger_id,
            )
            .count()
        )
        usage_per_user = int(promo.usage_per_user or 1)
        if user_usage >= usage_per_user:
            raise HTTPException(status_code=400, detail="You have already used this promo code.")

        min_ride_fare = float(promo.min_ride_fare or 0.0)
        if ride_fare < min_ride_fare:
            raise HTTPException(
                status_code=400,
                detail=f"Minimum ride fare ₹{min_ride_fare} required for this promo code.",
            )

        discount_amount = _compute_promo_discount(
            ride_fare,
            promo.discount_type,
            promo.discount_value,
            promo.max_discount,
        )
        if discount_amount <= 0:
            raise HTTPException(status_code=400, detail="Promo code does not provide a valid discount for this ride.")

        return {
            "code": promo.code,
            "discount_type": str(promo.discount_type or "").strip().lower() or None,
            "discount_value": float(promo.discount_value or 0.0),
            "max_discount": float(promo.max_discount) if promo.max_discount is not None else None,
            "discount_amount": discount_amount,
        }


def _default_ride_product_config() -> Dict[str, Any]:
    now = get_ist_now()
    return {
        "id": "district_ride_products",
        "catalog_version": RIDE_PRODUCT_CONFIG_VERSION,
        "default_enabled_products": ALL_RIDE_PRODUCT_KEYS,
        "district_rules": [],
        "updated_at": now,
        "created_at": now,
    }


def _normalize_enabled_products(values: Any) -> List[str]:
    result: List[str] = []
    seen: Set[str] = set()
    for raw in values or []:
        key = str(raw.value if isinstance(raw, RideProduct) else raw).strip().lower()
        if key not in ALL_RIDE_PRODUCT_KEYS or key in seen:
            continue
        seen.add(key)
        result.append(key)
    if "normal" not in seen:
        result.insert(0, "normal")
    return result


def _normalize_district_rules(values: Any) -> List[Dict[str, Any]]:
    rules: List[Dict[str, Any]] = []
    seen: Set[str] = set()
    for row in values or []:
        district_raw = row.get("district") if isinstance(row, dict) else getattr(row, "district", None)
        district_norm = _normalize_district_name(district_raw)
        if not district_norm or district_norm in seen:
            continue
        enabled_raw = row.get("enabled_products") if isinstance(row, dict) else getattr(row, "enabled_products", [])
        enabled = _normalize_enabled_products(enabled_raw)
        seen.add(district_norm)
        rules.append(
            {
                "district": str(district_raw or "").strip(),
                "district_key": district_norm,
                "enabled_products": enabled,
            }
        )
    return rules


def _normalize_ride_product_config(doc: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    payload = doc or _default_ride_product_config()
    return {
        "id": "district_ride_products",
        "catalog_version": int(payload.get("catalog_version") or 1),
        "default_enabled_products": _normalize_enabled_products(payload.get("default_enabled_products")),
        "district_rules": _normalize_district_rules(payload.get("district_rules")),
        "updated_at": payload.get("updated_at") if isinstance(payload.get("updated_at"), datetime) else get_ist_now(),
        "created_at": payload.get("created_at") if isinstance(payload.get("created_at"), datetime) else get_ist_now(),
    }


async def _get_ride_product_config(db: AsyncIOMotorDatabase) -> Dict[str, Any]:
    doc = await db.ride_product_config.find_one({"id": "district_ride_products"})
    if not doc:
        doc = _default_ride_product_config()
        await db.ride_product_config.update_one(
            {"id": "district_ride_products"},
            {"$setOnInsert": doc},
            upsert=True,
        )
    elif int(doc.get("catalog_version") or 1) < RIDE_PRODUCT_CONFIG_VERSION:
        enabled_products = _normalize_enabled_products(doc.get("default_enabled_products"))
        if RideProduct.PET.value not in enabled_products:
            enabled_products.append(RideProduct.PET.value)
        now = get_ist_now()
        await db.ride_product_config.update_one(
            {"id": "district_ride_products"},
            {
                "$set": {
                    "catalog_version": RIDE_PRODUCT_CONFIG_VERSION,
                    "default_enabled_products": enabled_products,
                    "updated_at": now,
                }
            },
        )
        doc = {
            **doc,
            "catalog_version": RIDE_PRODUCT_CONFIG_VERSION,
            "default_enabled_products": enabled_products,
            "updated_at": now,
        }
    return _normalize_ride_product_config(doc)


def _resolve_available_products_for_location(
    config: Dict[str, Any],
    *,
    pickup_address: Optional[str] = None,
    pickup_district: Optional[str] = None,
) -> Dict[str, Any]:
    district_key = _normalize_district_name(pickup_district) or _extract_district_from_address(pickup_address)
    resolved_district = None
    enabled_products = list(config.get("default_enabled_products") or ALL_RIDE_PRODUCT_KEYS)

    if district_key:
        for rule in config.get("district_rules") or []:
            if _normalize_district_name(rule.get("district_key") or rule.get("district")) == district_key:
                enabled_products = _normalize_enabled_products(rule.get("enabled_products"))
                resolved_district = rule.get("district") or district_key.title()
                break

    return {
        "pickup_district": resolved_district or (district_key.title() if district_key else None),
        "district_key": district_key,
        "enabled_products": _normalize_enabled_products(enabled_products),
    }


def _as_utc_naive(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value.replace(tzinfo=None) if value.tzinfo else value
    if isinstance(value, str) and value.strip():
        try:
            parsed = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
            return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed
        except Exception:
            return None
    return None


def _normalize_status_value(value: Any) -> str:
    status = str(value or "").strip().lower()
    if "." in status:
        status = status.split(".")[-1]
    return status


async def _ensure_passenger_booking_compliance(
    db: AsyncIOMotorDatabase,
    user: Dict[str, Any],
) -> None:
    passenger_id = str(user.get("id") or "").strip()
    if not passenger_id:
        raise HTTPException(status_code=401, detail="Invalid passenger account. Please login again.")

    now = get_ist_now()
    if PASSENGER_KYC_REQUIRED_FOR_BOOKING:
        kyc_doc = await db.passenger_kyc.find_one({"user_id": passenger_id}, {"_id": 0})
        kyc_status = _normalize_status_value(
            (kyc_doc or {}).get("status")
            or (kyc_doc or {}).get("verification_level")
            or user.get("kyc_status")
            or "unverified"
        )
        kyc_verified = bool((kyc_doc or {}).get("is_verified")) or kyc_status in {"approved", "verified"}
        if not kyc_verified:
            raise HTTPException(
                status_code=403,
                detail="Passenger KYC must be approved before booking a ride.",
            )

    await ensure_default_document_requirements(db)
    requirement_rows = await db.document_requirements.find(
        {
            "enabled": True,
            "applicable_to": {"$in": ["passenger", "both"]},
        }
    ).to_list(None)
    requirements = [
        requirement
        for requirement in requirement_rows
        if effective_is_mandatory(requirement)
    ]
    if not requirements:
        return

    upload_rows = await db.document_uploads.find({"user_id": passenger_id}).to_list(None)
    legacy_rows = await db.passenger_documents.find({"user_id": passenger_id}).to_list(None)
    uploaded_types = {
        str(row.get("document_type") or row.get("type") or "").strip()
        for row in [*upload_rows, *legacy_rows]
        if str(row.get("document_type") or row.get("type") or "").strip()
    }
    missing = [
        requirement
        for requirement in requirements
        if str(requirement.get("document_type") or "").strip() not in uploaded_types
    ]
    if not missing:
        return

    user_record = await db.users.find_one({"id": passenger_id}, {"_id": 0, "created_at": 1}) or {}
    created_at = _as_utc_naive(user_record.get("created_at") or user.get("created_at")) or now
    max_grace_days = max(int(requirement.get("grace_period_days", 0) or 0) for requirement in requirements)
    if max_grace_days > 0 and now <= created_at + timedelta(days=max_grace_days):
        return

    missing_names = [
        str(requirement.get("display_name") or requirement.get("document_type") or "required document")
        for requirement in missing
    ]
    raise HTTPException(
        status_code=403,
        detail=f"Mandatory passenger documents are required before booking: {', '.join(missing_names)}.",
    )


def _is_scheme_active(plan: Dict[str, Any]) -> bool:
    amount = _to_float(plan.get("amount"), 0.0)
    if amount <= 0 or not bool(plan.get("active")):
        return False
    start_at = _as_utc_naive(plan.get("scheme_start_at"))
    end_at = _as_utc_naive(plan.get("scheme_end_at"))
    if not start_at or not end_at:
        return False
    now = get_ist_now()
    return start_at <= now <= end_at


async def _ensure_subscription_allows_advanced_booking(db: AsyncIOMotorDatabase, user: Dict[str, Any]) -> None:
    role = _normalize_role(user.get("role"))
    if role == "admin":
        return

    pricing = await db.pricing_rules.find_one({}, {"_id": 0, "subscription_config": 1})
    subscription_config = _as_dict((pricing or {}).get("subscription_config"))
    role_config = _as_dict(subscription_config.get("driver" if role == "driver" else "passenger"))

    plans = [role_config.get("monthly"), role_config.get("quarterly"), role_config.get("annually"), role_config.get("per_trip")]
    paid_active_window_exists = any(_is_scheme_active(plan or {}) for plan in plans)
    if not paid_active_window_exists:
        return

    subscription = _as_dict(user.get("subscription"))
    selected_plan = str(subscription.get("plan_type") or "").strip().lower()
    if not selected_plan:
        raise HTTPException(status_code=403, detail="Select a subscription plan and wait for admin activation before creating bookings.")
    if not subscription.get("is_active") or not subscription.get("activated_by_admin"):
        raise HTTPException(status_code=403, detail="Your subscription is pending admin activation.")

    selected_plan_config = _as_dict(role_config.get(selected_plan)) if selected_plan in {"monthly", "quarterly", "annually", "per_trip"} else {}
    if not _is_scheme_active(selected_plan_config or {}):
        raise HTTPException(status_code=403, detail="Your selected subscription plan is currently disabled by admin.")

    outstanding = _to_float(subscription.get("outstanding_amount"), 0.0)
    if selected_plan == "per_trip" and outstanding > 0:
        per_trip_config = _as_dict(role_config.get("per_trip"))
        ride_threshold = max(1, int(_to_float(per_trip_config.get("ride_threshold"), 10)))
        completed = int(_to_float(subscription.get("per_trip_completed_rides"), 0))
        charged_cycles = int(_to_float(subscription.get("per_trip_charged_cycles"), 0))
        block_after = (charged_cycles * ride_threshold) + PER_TRIP_BLOCK_GRACE_RIDES
        if completed >= block_after:
            raise HTTPException(
                status_code=402,
                detail=(
                    f"Per-trip due of Rs {outstanding:.2f} is pending. "
                    "Submit payment and wait for admin verification to continue booking."
                ),
            )
    elif selected_plan in {"monthly", "quarterly", "annually"} and outstanding > 0:
        raise HTTPException(
            status_code=402,
            detail=f"Subscription due of Rs {outstanding:.2f} is pending. Please pay to continue.",
        )


@router.get("/ride-products")
async def list_ride_products(
    pickup_address: Optional[str] = Query(default=None),
    pickup_district: Optional[str] = Query(default=None),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    config = await _get_ride_product_config(db)
    availability = _resolve_available_products_for_location(
        config,
        pickup_address=pickup_address,
        pickup_district=pickup_district,
    )
    enabled = set(availability.get("enabled_products") or [])
    products = [
        {
            "key": "pool",
            "title": "Ride Sharing / Pooling",
            "ml": "ഷെയർ യാത്ര",
            "description": "Lower fare by sharing ride with nearby passengers.",
            "investor_value": "Improves utilization and lowers customer acquisition cost.",
        },
        {
            "key": "scheduled",
            "title": "Scheduled Booking",
            "ml": "മുൻകൂട്ടി ബുക്ക് ചെയ്യുക",
            "description": "Book rides for future date and time.",
            "investor_value": "Creates predictable demand pipeline.",
        },
        {
            "key": "corporate",
            "title": "Corporate Rides",
            "ml": "കോർപ്പറേറ്റ് യാത്രകൾ",
            "description": "Company employee travel with billing code.",
            "investor_value": "B2B recurring revenue channel.",
        },
        {
            "key": "airport",
            "title": "Airport Booking",
            "ml": "എയർപോർട്ട് യാത്ര",
            "description": "Airport pickup/drop with flight and terminal support.",
            "investor_value": "Premium high-ticket ride category.",
        },
        {
            "key": "intercity",
            "title": "Intercity Booking",
            "ml": "സിറ്റി പുറത്തുള്ള യാത്ര",
            "description": "Outstation city-to-city rides with return-trip and toll planning.",
            "investor_value": "Expands revenue beyond local trips.",
        },
        {
            "key": "ev_auto",
            "title": "EV Auto",
            "ml": "ഇവി ഓട്ടോ",
            "description": "Eco-friendly electric auto rides.",
            "investor_value": "Green mobility positioning.",
        },
        {
            "key": "tourism",
            "title": "Tourism Rides",
            "ml": "ടൂറിസം യാത്രകൾ",
            "description": "Ride + guide packages, custom tours and local discovery.",
            "investor_value": "High-margin tourism vertical.",
        },
        {
            "key": "women_only",
            "title": "Women-Only Rides",
            "ml": "സ്ത്രീകൾക്കായുള്ള യാത്ര",
            "description": "Female passenger safety-first ride option.",
            "investor_value": "Strong safety differentiation.",
        },
        {
            "key": "pet",
            "title": "Pet Rides",
            "ml": "Pet Rides",
            "description": "Pet-friendly rides with driver opt-in and extra care.",
            "investor_value": "Differentiated high-trust pet mobility segment.",
        },
        {
            "key": "rental_hourly",
            "title": "Rental / Hourly Package",
            "ml": "Rental Package",
            "description": "Multi-stop city rental with hourly pricing.",
            "investor_value": "Higher order value and predictable billing windows.",
        },
        {
            "key": "school_elderly_safe",
            "title": "School / Elderly Safe Ride",
            "ml": "Safe Ride",
            "description": "Safety-priority category for school children and senior citizens.",
            "investor_value": "Trust-led segment with strong retention potential.",
        },
    ]
    return {
        "pickup_district": availability.get("pickup_district"),
        "enabled_products": sorted(enabled),
        "products": [{**item, "active": item["key"] in enabled} for item in products],
    }


@router.get("/ride-products/availability")
async def get_ride_product_availability(
    pickup_address: Optional[str] = Query(default=None),
    pickup_district: Optional[str] = Query(default=None),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    config = await _get_ride_product_config(db)
    availability = _resolve_available_products_for_location(
        config,
        pickup_address=pickup_address,
        pickup_district=pickup_district,
    )
    return {
        "pickup_district": availability.get("pickup_district"),
        "enabled_products": availability.get("enabled_products"),
        "updated_at": config.get("updated_at"),
    }


@router.get("/tourism/package-types")
async def get_tourism_package_types():
    return {"package_types": TOURISM_PACKAGE_TYPES}


@router.get("/tourism/packages")
async def get_tourism_packages(
    city: Optional[str] = Query(default=None),
    package_type: Optional[str] = Query(default=None),
):
    return {
        "city": normalize_tourism_city(city) if city else None,
        "packages": list_tourism_packages(city=city, package_type=package_type, active_only=True),
    }


@router.get("/tourism/packages/{package_id}")
async def get_tourism_package_detail(package_id: str):
    package = get_tourism_package(package_id)
    if not package:
        raise HTTPException(status_code=404, detail="Package not found")
    return {"package": package}


@router.get("/tourism/attractions")
async def get_tourism_attractions(city: str = Query(..., min_length=2, max_length=80)):
    city_name = normalize_tourism_city(city)
    if not city_name:
        raise HTTPException(status_code=404, detail="Tourism city not found")
    return {"city": city_name, "attractions": attractions_for_city(city_name)}


@router.post("/tourism/route")
async def preview_tourism_route(payload: TourismRouteRequest):
    context = _build_tourism_booking_context(
        package_id=payload.package_id,
        package_type=payload.package_type,
        city=payload.city,
        custom_stops=payload.custom_stops,
        vehicle_type=payload.vehicle_type,
        passengers_count=payload.passengers_count,
        guide_required=payload.guide_required,
        photographer_required=payload.photographer_required,
        boat_ride_required=payload.boat_ride_required,
        hotel_booking_requested=payload.hotel_booking_requested,
        ticket_booking_requested=payload.ticket_booking_requested,
    )
    return {
        "status": "success",
        "package": context["package"],
        "route": context["route"],
        "fare": context["fare"],
        "add_ons": context["add_ons"],
    }


@router.post("/tourism/book")
async def book_tourism_package(
    payload: TourismBookingRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure),
):
    if _normalize_role(current_user.get("role")) != "passenger":
        raise HTTPException(status_code=403, detail="Passenger only")
    current_user_id = str(current_user.get("id") or "").strip()
    if not current_user_id:
        raise HTTPException(status_code=401, detail="Invalid account data. Please login again.")
    if payload.passenger_id and str(payload.passenger_id).strip() != current_user_id:
        raise HTTPException(status_code=403, detail="Cannot book tourism package for another passenger")

    scheduled_for = _as_aware_ist(payload.scheduled_date)
    if not scheduled_for:
        raise HTTPException(status_code=400, detail="Scheduled date is required")
    now = get_ist_now()
    if scheduled_for <= now:
        raise HTTPException(status_code=400, detail="Scheduled date must be in the future")

    context = _build_tourism_booking_context(
        package_id=payload.package_id,
        package_type=payload.package_type,
        city=payload.city,
        custom_stops=payload.custom_stops,
        vehicle_type=payload.vehicle_type,
        passengers_count=payload.passengers_count,
        guide_required=payload.guide_required,
        photographer_required=payload.photographer_required,
        boat_ride_required=payload.boat_ride_required,
        hotel_booking_requested=payload.hotel_booking_requested,
        ticket_booking_requested=payload.ticket_booking_requested,
    )
    booking_id = f"TOUR_{uuid.uuid4().hex[:12]}"
    booking = {
        "id": booking_id,
        "booking_id": booking_id,
        "passenger_id": current_user_id,
        "pickup_location": payload.pickup_location,
        "drop_location": {
            "address": f"{context['city']} tourism route",
            "distance_km": context["route"].get("distance_km"),
        },
        "ride_product": RideProduct.TOURISM.value,
        "ride_type": RideProduct.TOURISM.value,
        "ride_product_label": _product_label(RideProduct.TOURISM),
        "vehicle_type_id": payload.vehicle_type,
        "vehicle_subtype_id": None,
        "passenger_count": payload.passengers_count,
        "scheduled_for": scheduled_for,
        "scheduled_date": scheduled_for,
        "tourism_package": context["package"].get("name"),
        "tourism_details": {
            "package_id": context["package"].get("id"),
            "package_name": context["package"].get("name"),
            "package_type": context["package"].get("package_type"),
            "city": context["city"],
            "duration_hours": context["package"].get("duration_hours"),
            "places": context["route"].get("stops"),
            "route": context["route"],
            "language_preference": payload.language_preference,
            "add_ons": context["add_ons"],
            "status_flow": context["status_flow"],
        },
        "driver_filter": {
            "tourism_required": True,
            "tourism_enabled_required": True,
            "min_rating": 4.5,
            "language_preference": payload.language_preference,
            "tourism_city": context["city"],
            "local_area_experience_required": True,
        },
        "fare": context["fare"],
        "estimated_fare": context["fare"],
        "distance_km": context["route"].get("distance_km"),
        "status": "scheduled",
        "dispatch_status": "scheduled",
        "visited_locations": [],
        "status_history": [{"status": "created", "at": now}],
        "notes": payload.notes,
        "created_at": now,
        "updated_at": now,
    }
    await db.bookings.insert_one(booking)
    await db.tourism_bookings.insert_one(
        {
            **booking,
            "package_id": context["package"].get("id"),
            "package_name": context["package"].get("name"),
            "city": context["city"],
            "vehicle_type": payload.vehicle_type,
            "passengers_count": payload.passengers_count,
            "route": context["route"],
            "language_preference": payload.language_preference,
            "add_ons": context["add_ons"],
        }
    )
    return {"status": "success", "booking": booking}


async def _get_tourism_booking_for_user(
    db: AsyncIOMotorDatabase,
    booking_id: str,
    current_user: Dict[str, Any],
) -> Dict[str, Any]:
    booking_key = str(booking_id or "").strip()
    booking = await db.tourism_bookings.find_one({"booking_id": booking_key}, {"_id": 0})
    if not booking:
        booking = await db.tourism_bookings.find_one({"id": booking_key}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Tourism booking not found")
    role = _normalize_role(current_user.get("role"))
    current_user_id = str(current_user.get("id") or "").strip()
    if role != "admin" and str(booking.get("passenger_id") or "") != current_user_id:
        raise HTTPException(status_code=403, detail="You cannot access this tourism booking")
    return booking


@router.post("/tourism/bookings/{booking_id}/visited")
async def mark_tourism_place_visited(
    booking_id: str,
    payload: TourismVisitedPlaceRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure),
):
    booking = await _get_tourism_booking_for_user(db, booking_id, current_user)
    visited = [str(item).strip() for item in booking.get("visited_locations", []) if str(item or "").strip()]
    place = payload.place_name.strip()
    if place not in visited:
        visited.append(place)
    now = payload.visited_at or get_ist_now()
    status_event = {"status": "place_visited", "place": place, "at": now}
    await db.tourism_bookings.update_one(
        {"booking_id": booking.get("booking_id") or booking.get("id")},
        {
            "$set": {"visited_locations": visited, "status": "place_visited", "updated_at": now},
            "$push": {"status_history": status_event},
        },
    )
    await db.bookings.update_one(
        {"id": booking.get("booking_id") or booking.get("id")},
        {
            "$set": {"visited_locations": visited, "status": "place_visited", "updated_at": now},
            "$push": {"status_history": status_event},
        },
    )
    return {"status": "success", "visited_locations": visited}


@router.post("/tourism/bookings/{booking_id}/complete")
async def complete_tourism_booking(
    booking_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure),
):
    booking = await _get_tourism_booking_for_user(db, booking_id, current_user)
    now = get_ist_now()
    completed = {**booking, "status": "trip_completed", "completed_at": now}
    summary = build_tourism_summary(completed)
    update_doc = {
        "status": "trip_completed",
        "completed_at": now,
        "updated_at": now,
        "trip_summary": summary,
    }
    status_event = {"status": "trip_completed", "at": now}
    await db.tourism_bookings.update_one(
        {"booking_id": booking.get("booking_id") or booking.get("id")},
        {"$set": update_doc, "$push": {"status_history": status_event}},
    )
    await db.bookings.update_one(
        {"id": booking.get("booking_id") or booking.get("id")},
        {"$set": update_doc, "$push": {"status_history": status_event}},
    )
    return {"status": "success", "summary": summary}


@router.get("/tourism/bookings/{booking_id}/summary")
async def get_tourism_booking_summary(
    booking_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure),
):
    booking = await _get_tourism_booking_for_user(db, booking_id, current_user)
    return {"status": "success", "summary": booking.get("trip_summary") or build_tourism_summary(booking)}


@router.get("/admin/ride-products/district-config")
async def get_admin_ride_product_district_config(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure),
):
    if _normalize_role(current_user.get("role")) != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return await _get_ride_product_config(db)


@router.put("/admin/ride-products/district-config")
async def update_admin_ride_product_district_config(
    payload: RideProductDistrictConfigUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure),
):
    if _normalize_role(current_user.get("role")) != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")

    now = get_ist_now()
    config_doc = {
        "id": "district_ride_products",
        "catalog_version": RIDE_PRODUCT_CONFIG_VERSION,
        "default_enabled_products": _normalize_enabled_products([item.value for item in payload.default_enabled_products]),
        "district_rules": _normalize_district_rules(
            [
                {
                    "district": row.district,
                    "enabled_products": [item.value for item in row.enabled_products],
                }
                for row in payload.district_rules
            ]
        ),
        "updated_at": now,
    }
    await db.ride_product_config.update_one(
        {"id": "district_ride_products"},
        {"$set": config_doc, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    return await _get_ride_product_config(db)


@router.post("/bookings/advanced")
async def create_advanced_booking(
    payload: AdvancedBookingRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure),
):
    if _normalize_role(current_user.get("role")) != "passenger":
        raise HTTPException(status_code=403, detail="Passenger only")
    current_user_id = str(current_user.get("id") or "").strip()
    if not current_user_id:
        raise HTTPException(status_code=401, detail="Invalid account data. Please login again.")
    await _ensure_subscription_allows_advanced_booking(db, current_user)
    await _ensure_passenger_booking_compliance(db, current_user)
    config = await _get_ride_product_config(db)
    pickup_address = str((payload.pickup_location or {}).get("address") or "").strip() or None
    pickup_district = str((payload.pickup_location or {}).get("district") or "").strip() or None
    availability = _resolve_available_products_for_location(
        config,
        pickup_address=pickup_address,
        pickup_district=pickup_district,
    )
    enabled_keys = set(availability.get("enabled_products") or [])
    if payload.ride_product.value not in enabled_keys:
        district_label = availability.get("pickup_district") or "this district"
        raise HTTPException(
            status_code=400,
            detail=f"{_product_label(payload.ride_product)} is not active in {district_label}.",
        )

    if payload.ride_product == RideProduct.CORPORATE and not payload.corporate_code:
        raise HTTPException(status_code=400, detail="Corporate code required")

    scheduled_for = _as_aware_ist(payload.scheduled_for)
    if payload.ride_product == RideProduct.SCHEDULED and not scheduled_for:
        raise HTTPException(status_code=400, detail="Scheduled time is required for scheduled rides")

    if scheduled_for:
        now_ist = get_ist_now()
        if scheduled_for <= now_ist:
            raise HTTPException(status_code=400, detail="Scheduled time must be in the future")
        if scheduled_for < now_ist + timedelta(minutes=SCHEDULED_MIN_ADVANCE_MINUTES):
            raise HTTPException(
                status_code=400,
                detail=f"Scheduled rides must be booked at least {SCHEDULED_MIN_ADVANCE_MINUTES} minutes in advance",
            )

    rental_package_hours = payload.rental_package_hours or payload.rental_hours
    if payload.ride_product == RideProduct.RENTAL_HOURLY and not rental_package_hours:
        raise HTTPException(status_code=400, detail="Rental hours required for rental/hourly rides")

    requested_compatibility_key = RIDE_TYPE_COMPATIBILITY_ALIASES.get(
        payload.ride_product.value,
        payload.ride_product.value,
    )
    requested_vehicle_type = str(
        (payload.vehicle_type_id or "auto") if payload.ride_product == RideProduct.RENTAL_HOURLY else payload.vehicle_type_id or ""
    ).strip().lower()
    if requested_vehicle_type and not is_vehicle_compatible_with_ride_type(
        requested_vehicle_type,
        requested_compatibility_key,
    ):
        raise HTTPException(
            status_code=400,
            detail=f"{_product_label(payload.ride_product)} is not available for {requested_vehicle_type}.",
        )

    assisted_context = None
    if payload.ride_product == RideProduct.SCHOOL_ELDERLY_SAFE:
        try:
            assisted_context = prepare_assisted_ride_context(
                ride_category=payload.safe_ride_priority,
                guardian_name=payload.guardian_name,
                guardian_phone=payload.guardian_phone,
                passenger_name=payload.assisted_passenger_name,
                passenger_age=payload.assisted_passenger_age,
                wheelchair_required=payload.wheelchair_required,
                assistance_required=payload.assistance_required,
                female_driver_preferred=payload.female_driver_preferred,
                trusted_driver_required=payload.trusted_driver_required,
                guardian_share_tracking=payload.guardian_share_tracking,
                scheduled_time=scheduled_for,
                notes=payload.notes,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    normalized_payment_method = str(payload.payment_method or "cash").strip().lower() or "cash"
    if normalized_payment_method not in {"cash", "online"}:
        raise HTTPException(status_code=400, detail="payment_method must be cash or online")

    if not payload.allow_parallel:
        active_statuses = ["pending", "accepted", "driver_arrived", "in_progress"]
        existing = await db.bookings.find_one(
            {"passenger_id": current_user_id, "status": {"$in": active_statuses}},
            {"_id": 0, "id": 1},
        )
        if existing:
            raise HTTPException(
                status_code=409,
                detail="You already have an active booking. Cancel it first or enable parallel booking.",
            )

    pickup = payload.pickup_location or {}
    drop = payload.drop_location or {}
    distance_km = max(0.5, _to_float(drop.get("distance_km"), _to_float(pickup.get("distance_km"), 5.0)))
    rental_context = None
    if payload.ride_product == RideProduct.RENTAL_HOURLY:
        try:
            rental_context = build_rental_booking_context(
                vehicle_type=requested_vehicle_type or payload.vehicle_type_id or "auto",
                package_hours=rental_package_hours,
                included_km=payload.rental_included_km,
                stops=payload.rental_stops,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    tourism_context = None
    if payload.ride_product == RideProduct.TOURISM:
        tourism_context = _build_tourism_booking_context(
            package_id=payload.tourism_package_id,
            package_type=payload.tourism_package_type,
            city=payload.tourism_city or pickup.get("district") or pickup.get("city") or pickup.get("address"),
            custom_stops=payload.tourism_custom_stops,
            vehicle_type=payload.vehicle_type_id,
            passengers_count=payload.passenger_count,
            guide_required=payload.tourism_guide_required,
            photographer_required=payload.tourism_photographer_required,
            boat_ride_required=payload.tourism_boat_ride_required,
            hotel_booking_requested=payload.tourism_hotel_booking_requested,
            ticket_booking_requested=payload.tourism_ticket_booking_requested,
        )
        distance_km = max(distance_km, _to_float(tourism_context["route"].get("distance_km"), distance_km))
    women_only_required = bool(payload.women_only_required or payload.ride_product == RideProduct.WOMEN_ONLY)
    women_only_context = None
    if women_only_required:
        profile_gender = str(current_user.get("gender") or "").strip()
        requested_passenger_gender = str(payload.passenger_gender or profile_gender or "").strip()
        if profile_gender and not is_women_only_passenger_allowed(profile_gender):
            raise HTTPException(status_code=403, detail="Women Only rides are available only for female passengers")
        if not is_women_only_passenger_allowed(requested_passenger_gender):
            raise HTTPException(status_code=400, detail="Passenger gender must be female for Women Only rides")
        women_only_context = build_women_only_safety_context(
            passenger_gender=requested_passenger_gender,
            guardian_name=payload.women_only_guardian_name,
            guardian_phone=payload.women_only_guardian_phone,
            share_guardian_tracking=payload.women_only_share_guardian_tracking,
            female_driver_required=payload.women_only_female_driver_required,
            allow_trusted_male_driver_if_unavailable=(
                bool(payload.women_only_allow_trusted_male_driver)
                and not bool(payload.women_only_female_driver_required)
            ),
            scheduled_time=scheduled_for,
        )
    base_fare = 60.0
    per_km = 18.0
    ride_type_multiplier = _product_multiplier(payload.ride_product)
    vehicle_type_multiplier = _vehicle_multiplier(payload.vehicle_type_id, payload.vehicle_subtype_id)
    raw_estimated_fare = (
        tourism_context["fare"]
        if tourism_context
        else rental_context["estimated_fare"]
        if rental_context
        else calculate_women_only_fare(distance_km, payload.vehicle_type_id)
        if women_only_context
        else round((base_fare + (distance_km * per_km)) * ride_type_multiplier * vehicle_type_multiplier, 2)
    )
    payment_method_id = str(payload.payment_method_id or "").strip() or None
    payment_channel = str(payload.payment_channel or "").strip().lower() or None
    if payment_method_id:
        owned_method = await asyncio.to_thread(_get_owned_payment_method, current_user_id, payment_method_id)
        normalized_payment_method = "online"
        payment_channel = str(owned_method.method_type or "").strip().lower() or payment_channel
    elif normalized_payment_method == "cash":
        payment_channel = None

    promo_code = str(payload.promo_code or "").strip() or None
    promo_discount_type = None
    promo_discount_value = 0.0
    promo_max_discount = None
    promo_discount_amount = 0.0
    if promo_code:
        promo_validation = await asyncio.to_thread(
            _resolve_validated_promo,
            passenger_id=current_user_id,
            promo_code=promo_code,
            ride_fare=raw_estimated_fare,
        )
        promo_code = promo_validation.get("code") or promo_code
        promo_discount_type = promo_validation.get("discount_type")
        promo_discount_value = float(promo_validation.get("discount_value") or 0.0)
        promo_max_discount = promo_validation.get("max_discount")
        promo_discount_amount = float(promo_validation.get("discount_amount") or 0.0)
    estimated_fare = round(max(0.0, raw_estimated_fare - promo_discount_amount), 2)
    corporate_context = None
    if payload.ride_product == RideProduct.CORPORATE:
        corporate_context = await _resolve_corporate_booking_context(
            db,
            current_user,
            payload.corporate_code,
            estimated_fare,
        )
        normalized_payment_method = "corporate_invoice"
        payment_method_id = None
        payment_channel = "invoice"

    now = get_ist_now()
    is_scheduled = payload.ride_product == RideProduct.SCHEDULED or scheduled_for is not None
    booking_id = str(uuid.uuid4())
    assisted_ride_id = generate_assisted_ride_id() if assisted_context else None
    assisted_pickup_otp = generate_assisted_otp() if assisted_context else None
    assisted_drop_otp = generate_assisted_otp() if assisted_context else None
    selected_driver_id = str(payload.selected_driver_id or "").strip() or None
    driver_gender_preference = _normalize_driver_gender_preference(payload.driver_gender_preference)
    if women_only_required:
        driver_gender_preference = (
            "female"
            if not women_only_context or women_only_context.get("female_driver_required")
            else "female_preferred"
        )
    matching_vehicle_type = rental_context["vehicle_type"] if rental_context else payload.vehicle_type_id
    candidate_driver_ids = []
    if selected_driver_id:
        if not is_scheduled:
            selected_driver_error = await _selected_driver_pickup_error(
                db,
                selected_driver_id,
                pickup,
                matching_vehicle_type,
                payload.vehicle_subtype_id,
                payload.ride_product,
                tourism_city=tourism_context["city"] if tourism_context else None,
                tourism_language_preference=(
                    payload.tourism_language_preference if payload.ride_product == RideProduct.TOURISM else None
                ),
                women_only_female_driver_required=(
                    bool(women_only_context.get("female_driver_required")) if women_only_context else True
                ),
                women_only_allow_trusted_male_driver=(
                    bool(women_only_context.get("allow_trusted_male_driver_if_unavailable"))
                    if women_only_context
                    else False
                ),
                rental_package_hours=rental_context["package_hours"] if rental_context else None,
                radius_km=2.0,
            )
            if selected_driver_error:
                raise HTTPException(status_code=400, detail=selected_driver_error)
        candidate_driver_ids = [selected_driver_id]
    elif not is_scheduled:
        candidate_driver_ids = await _find_matching_driver_ids(
            db,
            pickup,
            matching_vehicle_type,
            payload.vehicle_subtype_id,
            payload.ride_product,
            tourism_city=tourism_context["city"] if tourism_context else None,
            tourism_language_preference=(
                payload.tourism_language_preference if payload.ride_product == RideProduct.TOURISM else None
            ),
            women_only_female_driver_required=(
                bool(women_only_context.get("female_driver_required")) if women_only_context else True
            ),
            women_only_allow_trusted_male_driver=(
                bool(women_only_context.get("allow_trusted_male_driver_if_unavailable"))
                if women_only_context
                else False
            ),
            rental_package_hours=rental_context["package_hours"] if rental_context else None,
            radius_km=2.0,
            limit=5,
        )
    booking = {
        "id": booking_id,
        "booking_id": booking_id,
        "passenger_id": current_user_id,
        "pickup_location": pickup,
        "drop_location": drop,
        "ride_product": payload.ride_product.value,
        "ride_product_label": _product_label(payload.ride_product),
        "scheduled_for": scheduled_for,
        "passenger_count": payload.passenger_count,
        "corporate_code": payload.corporate_code,
        "corporate_purpose": payload.corporate_purpose,
        "corporate_cost_center_id": payload.corporate_cost_center_id,
        "airport_terminal": payload.airport_terminal,
        "flight_number": payload.flight_number,
        "ev_auto_required": payload.ride_product == RideProduct.EV_AUTO,
        "intercity_return_trip": payload.intercity_return_trip,
        "intercity_wait_hours": (
            payload.intercity_wait_hours if payload.ride_product == RideProduct.INTERCITY else None
        ),
        "intercity_tolls_included": (
            bool(payload.intercity_tolls_included) if payload.ride_product == RideProduct.INTERCITY else None
        ),
        "intercity_route_notes": (
            payload.intercity_route_notes.strip()
            if payload.ride_product == RideProduct.INTERCITY and payload.intercity_route_notes
            else None
        ),
        "tourism_package": (
            (tourism_context["package"].get("name") if tourism_context else None)
            or (payload.tourism_package.strip() if payload.tourism_package else None)
        ),
        "tourism_details": (
            {
                "package_id": tourism_context["package"].get("id"),
                "package_name": tourism_context["package"].get("name"),
                "package_type": tourism_context["package"].get("package_type"),
                "city": tourism_context["city"],
                "duration_hours": tourism_context["package"].get("duration_hours"),
                "places": tourism_context["route"].get("stops"),
                "route": tourism_context["route"],
                "language_preference": payload.tourism_language_preference,
                "add_ons": tourism_context["add_ons"],
                "status_flow": tourism_context["status_flow"],
            }
            if tourism_context
            else None
        ),
        "women_only_required": women_only_required,
        "driver_gender_preference": driver_gender_preference,
        "women_only_details": women_only_context,
        "women_only_driver_mode": (
            "female_driver_required"
            if women_only_context and women_only_context.get("female_driver_required")
            else "female_driver_first_with_trusted_fallback"
            if women_only_context
            else None
        ),
        "guardian_name": (
            women_only_context.get("guardian", {}).get("name") if women_only_context else None
        ),
        "guardian_phone": (
            women_only_context.get("guardian", {}).get("phone") if women_only_context else None
        ),
        "guardian_share_tracking": (
            bool(women_only_context.get("guardian", {}).get("live_tracking_enabled"))
            if women_only_context
            else None
        ),
        "otp_required": (
            {"pickup": True, "drop": False}
            if women_only_context or rental_context
            else None
        ),
        "sos_enabled": bool(women_only_context.get("sos_enabled")) if women_only_context else False,
        "live_tracking_enabled": (
            bool(women_only_context.get("live_tracking_enabled")) if women_only_context else False
        ),
        "night_ride": bool(women_only_context.get("night_ride")) if women_only_context else False,
        "completion_notification_enabled": (
            bool(women_only_context.get("completion_notification_enabled")) if women_only_context else False
        ),
        "pet_type": (
            payload.pet_type.strip()
            if payload.ride_product == RideProduct.PET and payload.pet_type
            else None
        ),
        "pet_count": payload.pet_count if payload.ride_product == RideProduct.PET else None,
        "pet_carrier_required": (
            bool(payload.pet_carrier_required) if payload.ride_product == RideProduct.PET else False
        ),
        "pickup_district": availability.get("pickup_district"),
        "rental_hours": rental_context["package_hours"] if rental_context else payload.rental_hours,
        "rental_package_hours": rental_context["package_hours"] if rental_context else payload.rental_package_hours,
        "rental_included_km": rental_context["included_km"] if rental_context else payload.rental_included_km,
        "rental_details": (
            {
                "vehicle_type": rental_context["vehicle_type"],
                "package_hours": rental_context["package_hours"],
                "included_km": rental_context["included_km"],
                "base_fare": rental_context["base_fare"],
                "extra_km_rate": rental_context["extra_km_rate"],
                "extra_15_min_rate": rental_context["extra_15_min_rate"],
                "extra_time_billing_block_minutes": 15,
                "stops": rental_context["stops"],
                "status_flow": rental_context["status_flow"],
            }
            if rental_context
            else None
        ),
        "safe_ride_priority": assisted_context["ride_category"] if assisted_context else payload.safe_ride_priority,
        "notes": payload.notes,
        "selected_driver_id": selected_driver_id,
        "vehicle_type_id": matching_vehicle_type,
        "vehicle_subtype_id": payload.vehicle_subtype_id,
        "vehicle_model": payload.vehicle_model,
        "payment_method": normalized_payment_method,
        "payment_method_id": payment_method_id,
        "payment_channel": payment_channel,
        "promo_code": promo_code,
        "promo_discount_type": promo_discount_type,
        "promo_discount_value": promo_discount_value,
        "promo_max_discount": promo_max_discount,
        "promo_discount_amount": promo_discount_amount,
        "fare_before_discount": raw_estimated_fare,
        "ride_type_multiplier": ride_type_multiplier,
        "vehicle_type_multiplier": vehicle_type_multiplier,
        "status": "scheduled" if is_scheduled else "pending",
        "dispatch_status": (
            "scheduled"
            if is_scheduled
            else "searching_safe_driver"
            if women_only_context
            else "searching_rental_driver"
            if rental_context
            else "searching"
        ),
        "dispatch_algorithm": "advanced_product_pool_v1",
        "candidate_driver_ids": candidate_driver_ids,
        "progress_handoff": {
            "active_booking_endpoint": "/api/bookings/active",
            "booking_status_event": "booking_status_changed",
            "driver_request_event": "new_booking_available",
            "recommended_poll_seconds": 5,
        },
        "estimated_fare": estimated_fare,
        "distance_km": round(distance_km, 2),
        "pickup_surcharge": 0.0,
        "created_at": now,
        "updated_at": now,
    }
    assisted_ride_doc = None
    rental_ride_doc = None
    if rental_context:
        booking.update(
            {
                "booking_type": "RENTAL_RIDE",
                "progress_handoff": {
                    **booking["progress_handoff"],
                    "rental_endpoint": f"/api/rental-rides/{booking_id}",
                    "pickup_otp_endpoint": f"/api/rental-rides/{booking_id}/start",
                    "add_stop_endpoint": f"/api/rental-rides/{booking_id}/add-stop",
                    "waiting_endpoint": f"/api/rental-rides/{booking_id}/waiting",
                    "complete_endpoint": f"/api/rental-rides/{booking_id}/complete",
                },
            }
        )
        rental_ride_doc = {
            "booking_id": booking_id,
            "booking_type": "RENTAL_RIDE",
            "passenger_id": current_user_id,
            "pickup_location": pickup,
            "vehicle_type": rental_context["vehicle_type"],
            "vehicle_subtype_id": payload.vehicle_subtype_id,
            "passengers_count": payload.passenger_count,
            "scheduled_time": scheduled_for,
            "package_hours": rental_context["package_hours"],
            "included_km": rental_context["included_km"],
            "base_fare": rental_context["base_fare"],
            "extra_km_rate": rental_context["extra_km_rate"],
            "extra_15_min_rate": rental_context["extra_15_min_rate"],
            "estimated_fare": estimated_fare,
            "stops": rental_context["stops"],
            "waiting_events": [],
            "total_driver_waiting_minutes": sum(
                int(_as_dict(stop).get("waiting_minutes") or 0) for stop in rental_context["stops"]
            ),
            "pickup_otp_required": True,
            "pickup_otp": rental_context["pickup_otp"],
            "pickup_otp_status": "sent_to_passenger",
            "pickup_otp_verified": False,
            "driver_id": selected_driver_id,
            "candidate_driver_ids": candidate_driver_ids,
            "status": "created" if is_scheduled else "searching_rental_driver",
            "status_flow": list(RENTAL_STATUS_FLOW),
            "status_history": [
                {"status": "created", "at": now},
                *([] if is_scheduled else [{"status": "searching_rental_driver", "at": now}]),
            ],
            "notes": payload.notes,
            "created_at": now,
            "updated_at": now,
        }
    if assisted_context and assisted_ride_id:
        assisted_snapshot = build_assisted_ride_snapshot(
            assisted_context,
            assisted_ride_id=assisted_ride_id,
            status="searching_driver",
        )
        booking.update(
            {
                "booking_type": "ASSISTED_RIDE",
                "assisted_ride_id": assisted_ride_id,
                "assisted_ride": assisted_snapshot,
                "guardian_name": assisted_context["guardian_name"],
                "guardian_phone": assisted_context["guardian_phone"],
                "assisted_passenger_name": assisted_context["passenger_name"],
                "assisted_passenger_age": assisted_context["passenger_age"],
                "wheelchair_required": assisted_context["wheelchair_required"],
                "assistance_required": assisted_context["assistance_required"],
                "female_driver_preferred": assisted_context["female_driver_preferred"],
                "trusted_driver_required": assisted_context["trusted_driver_required"],
                "guardian_share_tracking": assisted_context["guardian_share_tracking"],
                "otp_required": {"pickup": True, "drop": True},
                "progress_handoff": {
                    **booking["progress_handoff"],
                    "assisted_ride_endpoint": f"/api/assisted-rides/{assisted_ride_id}",
                    "pickup_otp_endpoint": f"/api/assisted-rides/{assisted_ride_id}/verify-pickup",
                    "drop_otp_endpoint": f"/api/assisted-rides/{assisted_ride_id}/verify-drop",
                    "guardian_tracking": assisted_context["guardian_share_tracking"],
                },
            }
        )
        assisted_ride_doc = {
            "id": assisted_ride_id,
            "booking_id": booking_id,
            "booking_type": "ASSISTED_RIDE",
            "passenger_id": current_user_id,
            "ride_category": assisted_context["ride_category"],
            "pickup_location": pickup,
            "drop_location": drop,
            "guardian_name": assisted_context["guardian_name"],
            "guardian_phone": assisted_context["guardian_phone"],
            "passenger_name": assisted_context["passenger_name"],
            "passenger_age": assisted_context["passenger_age"],
            "wheelchair_required": assisted_context["wheelchair_required"],
            "assistance_required": assisted_context["assistance_required"],
            "female_driver_preferred": assisted_context["female_driver_preferred"],
            "trusted_driver_required": assisted_context["trusted_driver_required"],
            "guardian_share_tracking": assisted_context["guardian_share_tracking"],
            "scheduled_time": scheduled_for,
            "notes": assisted_context.get("notes"),
            "status": "searching_driver",
            "status_flow": ASSISTED_RIDE_STATUS_FLOW,
            "pickup_otp": assisted_pickup_otp,
            "drop_otp": assisted_drop_otp,
            "candidate_driver_ids": candidate_driver_ids,
            "guardian_notifications": [{"event": "booking_created", "status": "queued", "at": now}],
            "status_history": [{"status": "searching_driver", "at": now}],
            "created_at": now,
            "updated_at": now,
        }
    women_only_ride_doc = None
    if women_only_context:
        booking.update(
            {
                "booking_type": "WOMEN_ONLY_RIDE",
                "progress_handoff": {
                    **booking["progress_handoff"],
                    "women_only_endpoint": f"/api/women-only-rides/{booking_id}",
                    "pickup_otp_endpoint": f"/api/women-only-rides/{booking_id}/verify-pickup",
                    "sos_endpoint": f"/api/women-only-rides/{booking_id}/sos",
                    "guardian_tracking": women_only_context["guardian"]["live_tracking_enabled"],
                },
            }
        )
        women_only_ride_doc = {
            "booking_id": booking_id,
            "booking_type": "WOMEN_ONLY_RIDE",
            "passenger_id": current_user_id,
            "passenger_gender": women_only_context["passenger_gender"],
            "pickup_location": pickup,
            "drop_location": drop,
            "vehicle_type": payload.vehicle_type_id or "auto",
            "vehicle_subtype_id": payload.vehicle_subtype_id,
            "passengers_count": payload.passenger_count,
            "scheduled_date": scheduled_for,
            "fare": estimated_fare,
            "female_driver_required": women_only_context["female_driver_required"],
            "allow_trusted_male_driver_if_unavailable": women_only_context[
                "allow_trusted_male_driver_if_unavailable"
            ],
            "guardian": women_only_context["guardian"],
            "pickup_otp_required": True,
            "pickup_otp": women_only_context["pickup_otp"],
            "pickup_otp_status": "sent_to_passenger",
            "pickup_otp_verified": False,
            "sos_enabled": True,
            "sos_events": [],
            "live_tracking_enabled": True,
            "night_ride": women_only_context["night_ride"],
            "night_safety_checks": women_only_context["night_safety_checks"],
            "completion_notification_enabled": True,
            "status": "created" if is_scheduled else "searching_safe_driver",
            "status_flow": women_only_context["status_flow"],
            "candidate_driver_ids": candidate_driver_ids,
            "guardian_notifications": [{"event": "booking_created", "status": "queued", "at": now}],
            "status_history": [
                {"status": "created", "at": now},
                *([] if is_scheduled else [{"status": "searching_safe_driver", "at": now}]),
            ],
            "created_at": now,
            "updated_at": now,
        }
    if corporate_context:
        company = corporate_context["company"]
        employee = corporate_context["employee"]
        policy = corporate_context["policy"]
        corporate_request_id = f"corp_req_{uuid.uuid4().hex[:12]}"
        booking.update(
            {
                "company_id": company["id"],
                "employee_id": employee["employee_id"],
                "corporate_request_id": corporate_request_id,
                "corporate_company_name": company.get("company_name"),
                "corporate_policy_id": policy.get("id"),
                "corporate_cost_center_id": payload.corporate_cost_center_id or employee.get("cost_center_id"),
            }
        )

    driver_filter: Dict[str, Any] = {}
    if driver_gender_preference in {"female", "male"}:
        driver_filter["gender"] = driver_gender_preference
    if women_only_context:
        driver_filter.update(women_only_context["driver_filter"])
    if rental_context:
        driver_filter.update(rental_context["driver_filter"])
    if payload.ride_product == RideProduct.PET:
        driver_filter["pet_friendly_required"] = True
    if payload.ride_product == RideProduct.INTERCITY:
        driver_filter["intercity_required"] = True
    if payload.ride_product == RideProduct.TOURISM and tourism_context:
        driver_filter.update(
            {
                "tourism_required": True,
                "tourism_enabled_required": True,
                "min_rating": 4.5,
                "language_preference": payload.tourism_language_preference,
                "tourism_city": tourism_context["city"],
                "local_area_experience_required": True,
            }
        )
    if payload.ride_product == RideProduct.EV_AUTO:
        driver_filter["ev_auto_required"] = True
    elif assisted_context:
        driver_filter.update(
            {
                "trust_priority": True,
                "assisted_ride_required": True,
                "police_verified_required": True,
                "trained_for_assisted_rides_required": True,
                "min_rating": 4.5,
                "no_safety_complaint_required": True,
                "emergency_contact_required": True,
                "vehicle_document_valid_required": True,
                "female_driver_preferred": assisted_context["female_driver_preferred"],
                "guardian_tracking_required": assisted_context["guardian_share_tracking"],
            }
        )
    if driver_filter:
        booking["driver_filter"] = driver_filter

    if corporate_context:
        company = corporate_context["company"]
        employee = corporate_context["employee"]
        policy = corporate_context["policy"]
        await db.corporate_ride_requests.insert_one(
            {
                "id": booking["corporate_request_id"],
                "company_id": company["id"],
                "corporate_code": company.get("corporate_code"),
                "employee_id": employee["employee_id"],
                "employee_name": employee.get("name"),
                "pickup_location": pickup,
                "dropoff_location": drop,
                "estimated_cost": estimated_fare,
                "ride_type": payload.vehicle_type_id or "auto",
                "purpose": payload.corporate_purpose or payload.notes or "Corporate ride booking",
                "cost_center_id": payload.corporate_cost_center_id or employee.get("cost_center_id"),
                "policy_id": policy.get("id"),
                "policy_compliant": True,
                "policy_reason": "Policy compliant",
                "requires_approval": False,
                "approval_status": "approved",
                "status": "booking_created",
                "booking_id": booking_id,
                "requested_by": current_user_id,
                "requested_at": now,
                "created_at": now,
                "updated_at": now,
            }
        )

    await db.bookings.insert_one(booking)
    if tourism_context:
        await db.tourism_bookings.insert_one(
            {
                "booking_id": booking_id,
                "passenger_id": current_user_id,
                "status": "searching_driver" if not is_scheduled else "created",
                "package_id": tourism_context["package"].get("id"),
                "package_name": tourism_context["package"].get("name"),
                "city": tourism_context["city"],
                "vehicle_type": payload.vehicle_type_id or "taxi",
                "passengers_count": payload.passenger_count,
                "scheduled_date": scheduled_for,
                "pickup_location": pickup,
                "route": tourism_context["route"],
                "language_preference": payload.tourism_language_preference,
                "add_ons": tourism_context["add_ons"],
                "fare": estimated_fare,
                "visited_locations": [],
                "status_history": [{"status": "created", "at": now}],
                "created_at": now,
                "updated_at": now,
            }
        )
    if rental_ride_doc:
        await db.rental_rides.insert_one(rental_ride_doc)
    if women_only_ride_doc:
        await db.women_only_rides.insert_one(women_only_ride_doc)
    if assisted_ride_doc:
        await db.assisted_rides.insert_one(assisted_ride_doc)
    if corporate_context:
        employee = corporate_context["employee"]
        await db.corporate_employees.update_one(
            {"company_id": corporate_context["company"]["id"], "employee_id": employee["employee_id"]},
            {
                "$inc": {
                    "rides_used_this_month": 1,
                    "budget_spent_this_month": estimated_fare,
                },
                "$set": {"updated_at": now},
            },
        )
    return sanitize_women_only_ride_for_response(booking) if women_only_context else booking
