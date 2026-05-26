import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, ConfigDict, Field

from app.db.deps import get_db
from app.utils.rbac import get_current_user_secure

router = APIRouter(prefix="/api", tags=["ride_products"])
PER_TRIP_BLOCK_GRACE_RIDES = 2


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
    airport_terminal: Optional[str] = Field(default=None, max_length=40)
    flight_number: Optional[str] = Field(default=None, max_length=40)
    intercity_return_trip: bool = False
    tourism_package: Optional[str] = Field(default=None, max_length=120)
    women_only_required: bool = False
    rental_hours: Optional[int] = Field(default=None, ge=1, le=24)
    safe_ride_priority: Optional[str] = Field(default=None, max_length=40)
    notes: Optional[str] = Field(default=None, max_length=500)
    allow_parallel: bool = False
    selected_driver_id: Optional[str] = Field(default=None, max_length=120)
    payment_method: str = Field(default="cash", max_length=20)


class DistrictRideProductRule(BaseModel):
    district: str = Field(min_length=2, max_length=80)
    enabled_products: List[RideProduct] = Field(default_factory=list)


class RideProductDistrictConfigUpdate(BaseModel):
    default_enabled_products: List[RideProduct] = Field(default_factory=list)
    district_rules: List[DistrictRideProductRule] = Field(default_factory=list, max_length=300)


ALL_RIDE_PRODUCT_KEYS: List[str] = [item.value for item in RideProduct]
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


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value if value is not None else default)
    except Exception:
        return default


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


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


def _default_ride_product_config() -> Dict[str, Any]:
    now = datetime.utcnow()
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
        "updated_at": payload.get("updated_at") if isinstance(payload.get("updated_at"), datetime) else datetime.utcnow(),
        "created_at": payload.get("created_at") if isinstance(payload.get("created_at"), datetime) else datetime.utcnow(),
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


def _is_scheme_active(plan: Dict[str, Any]) -> bool:
    amount = _to_float(plan.get("amount"), 0.0)
    if amount <= 0 or not bool(plan.get("active")):
        return False
    start_at = _as_utc_naive(plan.get("scheme_start_at"))
    end_at = _as_utc_naive(plan.get("scheme_end_at"))
    if not start_at or not end_at:
        return False
    now = datetime.utcnow()
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

    now = datetime.utcnow()
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

    if payload.ride_product == RideProduct.SCHEDULED and not payload.scheduled_for:
        raise HTTPException(status_code=400, detail="Scheduled time is required for scheduled rides")

    if payload.scheduled_for and payload.scheduled_for <= datetime.utcnow():
        raise HTTPException(status_code=400, detail="Scheduled time must be in the future")

    if payload.ride_product == RideProduct.RENTAL_HOURLY and not payload.rental_hours:
        raise HTTPException(status_code=400, detail="Rental hours required for rental/hourly rides")

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
    estimated_fare = round((base_fare + (distance_km * per_km)) * _product_multiplier(payload.ride_product), 2)

    now = datetime.utcnow()
    is_scheduled = payload.ride_product == RideProduct.SCHEDULED or payload.scheduled_for is not None
    booking_id = str(uuid.uuid4())
    booking = {
        "id": booking_id,
        "passenger_id": current_user_id,
        "pickup_location": pickup,
        "drop_location": drop,
        "ride_product": payload.ride_product.value,
        "ride_product_label": _product_label(payload.ride_product),
        "scheduled_for": payload.scheduled_for,
        "passenger_count": payload.passenger_count,
        "corporate_code": payload.corporate_code,
        "airport_terminal": payload.airport_terminal,
        "flight_number": payload.flight_number,
        "intercity_return_trip": payload.intercity_return_trip,
        "tourism_package": payload.tourism_package,
        "women_only_required": bool(
            payload.women_only_required or payload.ride_product == RideProduct.WOMEN_ONLY
        ),
        "pickup_district": availability.get("pickup_district"),
        "rental_hours": payload.rental_hours,
        "safe_ride_priority": payload.safe_ride_priority,
        "notes": payload.notes,
        "selected_driver_id": payload.selected_driver_id,
        "payment_method": str(payload.payment_method or "cash").strip().lower() or "cash",
        "status": "scheduled" if is_scheduled else "pending",
        "estimated_fare": estimated_fare,
        "distance_km": round(distance_km, 2),
        "pickup_surcharge": 0.0,
        "created_at": now,
        "updated_at": now,
    }

    if payload.ride_product == RideProduct.WOMEN_ONLY:
        booking["driver_filter"] = {"gender": "female"}
    elif payload.ride_product == RideProduct.EV_AUTO:
        booking["driver_filter"] = {"vehicle_type": "ev_auto"}
    elif payload.ride_product == RideProduct.SCHOOL_ELDERLY_SAFE:
        booking["driver_filter"] = {"trust_priority": True}

    await db.bookings.insert_one(booking)
    return booking
