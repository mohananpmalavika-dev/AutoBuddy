import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, ConfigDict, Field

from app.db.deps import get_db
from app.utils.rbac import get_current_user_secure

router = APIRouter(prefix="/api", tags=["ride_products"])


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


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value if value is not None else default)
    except Exception:
        return default


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


@router.get("/ride-products")
async def list_ride_products():
    return [
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


@router.post("/bookings/advanced")
async def create_advanced_booking(
    payload: AdvancedBookingRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure),
):
    if _normalize_role(current_user.get("role")) != "passenger":
        raise HTTPException(status_code=403, detail="Passenger only")

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
            {"passenger_id": current_user["id"], "status": {"$in": active_statuses}},
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
        "passenger_id": current_user["id"],
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
