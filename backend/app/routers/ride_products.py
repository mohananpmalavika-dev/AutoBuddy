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
from app.models.ride_type_compatibility import is_vehicle_compatible_with_ride_type
from app.utils.rbac import get_current_user_secure

router = APIRouter(prefix="/api", tags=["ride_products"])
PER_TRIP_BLOCK_GRACE_RIDES = 2
SCHEDULED_MIN_ADVANCE_MINUTES = 30
PASSENGER_KYC_REQUIRED_FOR_BOOKING = (
    os.environ.get("PASSENGER_KYC_REQUIRED_FOR_BOOKING", "false").strip().lower()
    not in {"0", "false", "no", "off"}
)


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
    tourism_package: Optional[str] = Field(default=None, max_length=120)
    women_only_required: bool = False
    driver_gender_preference: Optional[str] = Field(default="any", max_length=20)
    rental_hours: Optional[int] = Field(default=None, ge=1, le=24)
    safe_ride_priority: Optional[str] = Field(default=None, max_length=40)
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
}
RIDE_TYPE_COMPATIBILITY_ALIASES = {
    RideProduct.NORMAL.value: "instant",
    RideProduct.POOL.value: "instant",
    RideProduct.EV_AUTO.value: "instant",
    RideProduct.WOMEN_ONLY.value: "instant",
    RideProduct.SCHOOL_ELDERLY_SAFE.value: "instant",
    RideProduct.INTERCITY.value: "instant",
    RideProduct.RENTAL_HOURLY.value: "rental",
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
    requested_compatibility = RIDE_TYPE_COMPATIBILITY_ALIASES.get(requested_key, requested_key)
    return any(item not in ALL_RIDE_PRODUCT_KEY_SET and item == requested_compatibility for item in accepted)


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
    if requested_vehicle_type and driver_vehicle_type != requested_vehicle_type:
        return False
    if requested_vehicle_subtype and driver_vehicle_subtype and driver_vehicle_subtype != requested_vehicle_subtype:
        return False
    compatibility_key = RIDE_TYPE_COMPATIBILITY_ALIASES.get(ride_product.value, ride_product.value)
    if not is_vehicle_compatible_with_ride_type(driver_vehicle_type, compatibility_key):
        return False
    return _driver_accepts_ride_product(driver, ride_product)


async def _find_matching_driver_ids(
    db: AsyncIOMotorDatabase,
    pickup: Dict[str, Any],
    vehicle_type_id: Optional[str],
    vehicle_subtype_id: Optional[str],
    ride_product: RideProduct,
    *,
    radius_km: float = 2.0,
    limit: int = 5,
) -> List[str]:
    drivers = await db.drivers.find(
        {
            "is_available": True,
            "vehicle_info": {"$ne": None},
            "kyc_status": "approved",
        },
        {"_id": 0, "user_id": 1, "current_location": 1, "vehicle_info": 1, "rating": 1},
    ).to_list(250)
    scored: List[Dict[str, Any]] = []
    for driver in drivers:
        if not _driver_matches_service(driver, vehicle_type_id, vehicle_subtype_id, ride_product):
            continue
        location = _as_dict(driver.get("current_location"))
        distance = _location_distance_km(pickup, location)
        if math.isfinite(distance) and distance <= radius_km:
            scored.append({"driver_id": str(driver.get("user_id") or ""), "distance_km": distance})
    scored.sort(key=lambda item: item["distance_km"])
    return [item["driver_id"] for item in scored[: max(1, int(limit or 1))] if item["driver_id"]]


async def _selected_driver_pickup_error(
    db: AsyncIOMotorDatabase,
    selected_driver_id: str,
    pickup: Dict[str, Any],
    vehicle_type_id: Optional[str],
    vehicle_subtype_id: Optional[str],
    ride_product: RideProduct,
    *,
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
        {"_id": 0, "user_id": 1, "current_location": 1, "vehicle_info": 1, "rating": 1},
    )
    if not driver:
        return "Selected driver is unavailable right now."
    if not _driver_matches_service(driver, vehicle_type_id, vehicle_subtype_id, ride_product):
        return "Selected driver does not match the requested vehicle or ride type."

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
            "description": "Long-distance city-to-city rides.",
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
            "description": "Sightseeing, temple and local tourism packages.",
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

    if payload.ride_product == RideProduct.RENTAL_HOURLY and not payload.rental_hours:
        raise HTTPException(status_code=400, detail="Rental hours required for rental/hourly rides")

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
    base_fare = 60.0
    per_km = 18.0
    ride_type_multiplier = _product_multiplier(payload.ride_product)
    vehicle_type_multiplier = _vehicle_multiplier(payload.vehicle_type_id, payload.vehicle_subtype_id)
    raw_estimated_fare = round((base_fare + (distance_km * per_km)) * ride_type_multiplier * vehicle_type_multiplier, 2)
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
    selected_driver_id = str(payload.selected_driver_id or "").strip() or None
    women_only_required = bool(payload.women_only_required or payload.ride_product == RideProduct.WOMEN_ONLY)
    driver_gender_preference = _normalize_driver_gender_preference(payload.driver_gender_preference)
    if women_only_required:
        driver_gender_preference = "female"
    candidate_driver_ids = []
    if selected_driver_id:
        if not is_scheduled:
            selected_driver_error = await _selected_driver_pickup_error(
                db,
                selected_driver_id,
                pickup,
                payload.vehicle_type_id,
                payload.vehicle_subtype_id,
                payload.ride_product,
                radius_km=2.0,
            )
            if selected_driver_error:
                raise HTTPException(status_code=400, detail=selected_driver_error)
        candidate_driver_ids = [selected_driver_id]
    elif not is_scheduled:
        candidate_driver_ids = await _find_matching_driver_ids(
            db,
            pickup,
            payload.vehicle_type_id,
            payload.vehicle_subtype_id,
            payload.ride_product,
            radius_km=2.0,
            limit=5,
        )
    booking = {
        "id": booking_id,
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
        "intercity_return_trip": payload.intercity_return_trip,
        "tourism_package": payload.tourism_package,
        "women_only_required": women_only_required,
        "driver_gender_preference": driver_gender_preference,
        "pickup_district": availability.get("pickup_district"),
        "rental_hours": payload.rental_hours,
        "safe_ride_priority": payload.safe_ride_priority,
        "notes": payload.notes,
        "selected_driver_id": selected_driver_id,
        "vehicle_type_id": payload.vehicle_type_id,
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
        "dispatch_status": "scheduled" if is_scheduled else "searching",
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
    if payload.ride_product == RideProduct.EV_AUTO:
        driver_filter["vehicle_type"] = "ev_auto"
    elif payload.ride_product == RideProduct.SCHOOL_ELDERLY_SAFE:
        driver_filter["trust_priority"] = True
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
    return booking
