"""Rental ride package rules, fare settlement, and driver eligibility."""

from __future__ import annotations

import math
import random
from copy import deepcopy
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.utils.time_helpers import get_ist_now


RENTAL_MIN_DRIVER_RATING = 4.5

RENTAL_STATUS_FLOW = [
    "created",
    "searching_rental_driver",
    "driver_assigned",
    "accepted",
    "driver_arrived",
    "started",
    "stop_added",
    "waiting",
    "in_progress",
    "completed",
    "cancelled",
]

RENTAL_PACKAGE_CATALOG: Dict[str, Dict[int, Dict[str, Any]]] = {
    "auto": {
        1: {"base_fare": 250.0, "included_km": 10.0, "extra_km_rate": 18.0, "extra_15_min_rate": 40.0},
        2: {"base_fare": 450.0, "included_km": 20.0, "extra_km_rate": 18.0, "extra_15_min_rate": 40.0},
        4: {"base_fare": 850.0, "included_km": 40.0, "extra_km_rate": 18.0, "extra_15_min_rate": 50.0},
        8: {"base_fare": 1600.0, "included_km": 80.0, "extra_km_rate": 18.0, "extra_15_min_rate": 60.0},
    },
    "taxi": {
        1: {"base_fare": 500.0, "included_km": 15.0, "extra_km_rate": 25.0, "extra_15_min_rate": 75.0},
        2: {"base_fare": 900.0, "included_km": 30.0, "extra_km_rate": 25.0, "extra_15_min_rate": 80.0},
        4: {"base_fare": 1700.0, "included_km": 60.0, "extra_km_rate": 25.0, "extra_15_min_rate": 100.0},
        8: {"base_fare": 3200.0, "included_km": 120.0, "extra_km_rate": 25.0, "extra_15_min_rate": 120.0},
        12: {"base_fare": 4600.0, "included_km": 180.0, "extra_km_rate": 25.0, "extra_15_min_rate": 140.0},
    },
    "xl": {
        2: {"base_fare": 1400.0, "included_km": 30.0, "extra_km_rate": 35.0, "extra_15_min_rate": 120.0},
        4: {"base_fare": 2600.0, "included_km": 60.0, "extra_km_rate": 35.0, "extra_15_min_rate": 150.0},
        8: {"base_fare": 5000.0, "included_km": 120.0, "extra_km_rate": 35.0, "extra_15_min_rate": 180.0},
        12: {"base_fare": 7200.0, "included_km": 180.0, "extra_km_rate": 35.0, "extra_15_min_rate": 220.0},
    },
}


def _normalize_text(value: Any) -> str:
    return str(value or "").strip().lower().replace("-", "_").replace(" ", "_")


def normalize_rental_vehicle_type(value: Any) -> str:
    key = _normalize_text(value)
    aliases = {
        "rickshaw": "auto",
        "auto_rickshaw": "auto",
        "autorickshaw": "auto",
        "cab": "taxi",
        "car": "taxi",
        "sedan": "taxi",
        "suv": "xl",
        "muv": "xl",
    }
    return aliases.get(key, key or "auto")


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return _normalize_text(value) in {"1", "true", "yes", "y", "on", "approved", "verified", "enabled"}


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _first_number(*values: Any, default: float = 0.0) -> float:
    for value in values:
        try:
            number = float(value)
        except Exception:
            continue
        if math.isfinite(number):
            return number
    return default


def _parse_datetime(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=get_ist_now().tzinfo)
    text = str(value or "").strip()
    if not text:
        return get_ist_now()
    if text.endswith("Z"):
        text = f"{text[:-1]}+00:00"
    parsed = datetime.fromisoformat(text)
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=get_ist_now().tzinfo)


def generate_rental_otp() -> str:
    return f"{random.randint(1000, 9999)}"


def list_rental_packages(vehicle_type: Optional[str] = None) -> List[Dict[str, Any]]:
    vehicle_keys = [normalize_rental_vehicle_type(vehicle_type)] if vehicle_type else sorted(RENTAL_PACKAGE_CATALOG)
    packages: List[Dict[str, Any]] = []
    for vehicle_key in vehicle_keys:
        for hours, config in sorted((RENTAL_PACKAGE_CATALOG.get(vehicle_key) or {}).items()):
            label = "Full day" if hours == 12 else f"{hours} hour" if hours == 1 else f"{hours} hours"
            packages.append({"vehicle_type": vehicle_key, "package_hours": hours, "label": label, **config})
    return packages


def get_rental_package(vehicle_type: Optional[str], package_hours: Any) -> Dict[str, Any]:
    vehicle_key = normalize_rental_vehicle_type(vehicle_type)
    try:
        hours = int(package_hours)
    except Exception as exc:
        raise ValueError("Rental package hours must be a whole number") from exc

    package = (RENTAL_PACKAGE_CATALOG.get(vehicle_key) or {}).get(hours)
    if not package:
        available = ", ".join(str(item) for item in sorted((RENTAL_PACKAGE_CATALOG.get(vehicle_key) or {}).keys()))
        if available:
            raise ValueError(f"{vehicle_key} rental package not available for {hours} hours. Available: {available}")
        raise ValueError(f"{vehicle_key} rentals are not available")
    return {"vehicle_type": vehicle_key, "package_hours": hours, **deepcopy(package)}


def calculate_rental_final_fare(
    *,
    base_fare: Any,
    package_hours: Any,
    included_km: Any,
    extra_km_rate: Any,
    extra_15_min_rate: Any,
    actual_distance_km: Any,
    started_at: Any,
    completed_at: Optional[Any] = None,
) -> Dict[str, float]:
    start = _parse_datetime(started_at)
    end = _parse_datetime(completed_at) if completed_at else get_ist_now()
    used_minutes = max(0.0, (end - start).total_seconds() / 60.0)
    included_minutes = max(0.0, _first_number(package_hours) * 60.0)
    extra_minutes = max(0.0, used_minutes - included_minutes)
    extra_15_blocks = int(math.ceil(extra_minutes / 15.0)) if extra_minutes > 0 else 0

    actual_distance = max(0.0, _first_number(actual_distance_km))
    included_distance = max(0.0, _first_number(included_km))
    extra_km = max(0.0, actual_distance - included_distance)

    extra_time_charge = extra_15_blocks * max(0.0, _first_number(extra_15_min_rate))
    extra_km_charge = extra_km * max(0.0, _first_number(extra_km_rate))
    final_fare = max(0.0, _first_number(base_fare) + extra_time_charge + extra_km_charge)

    return {
        "used_minutes": round(used_minutes, 2),
        "included_minutes": round(included_minutes, 2),
        "extra_minutes": round(extra_minutes, 2),
        "extra_15_min_blocks": float(extra_15_blocks),
        "actual_distance_km": round(actual_distance, 2),
        "included_km": round(included_distance, 2),
        "extra_km": round(extra_km, 2),
        "extra_time_charge": round(extra_time_charge, 2),
        "extra_km_charge": round(extra_km_charge, 2),
        "final_fare": round(final_fare, 2),
    }


def _driver_rating(driver: Dict[str, Any]) -> float:
    return _first_number(driver.get("rental_rating"), driver.get("average_rating"), driver.get("rating"), default=5.0)


def _kyc_verified(driver: Dict[str, Any]) -> bool:
    return (
        _truthy(driver.get("kyc_verified"))
        or _normalize_text(driver.get("kyc_status")) in {"approved", "verified"}
        or _normalize_text(driver.get("verification_status")) in {"approved", "verified"}
    )


def _vehicle_verified(driver: Dict[str, Any]) -> bool:
    vehicle = _as_dict(driver.get("vehicle_info"))
    online_vehicle = _as_dict(driver.get("online_vehicle"))
    return (
        _truthy(driver.get("vehicle_verified"))
        or _truthy(vehicle.get("vehicle_verified"))
        or _truthy(online_vehicle.get("vehicle_verified"))
        or _normalize_text(driver.get("vehicle_verification_status")) in {"approved", "verified"}
        or _normalize_text(vehicle.get("verification_status")) in {"approved", "verified"}
    )


def _is_available(driver: Dict[str, Any]) -> bool:
    if "is_available" in driver:
        return _truthy(driver.get("is_available"))
    if "available" in driver:
        return _truthy(driver.get("available"))
    return True


def _driver_vehicle_type(driver: Dict[str, Any]) -> str:
    vehicle = _as_dict(driver.get("vehicle_info"))
    online_vehicle = _as_dict(driver.get("online_vehicle"))
    return normalize_rental_vehicle_type(
        vehicle.get("vehicle_type_id")
        or vehicle.get("vehicle_type")
        or online_vehicle.get("vehicle_type_id")
        or online_vehicle.get("vehicle_type")
        or driver.get("vehicle_type_id")
        or driver.get("vehicle_type")
    )


def _accepted_ride_types(driver: Dict[str, Any]) -> List[str]:
    vehicle = _as_dict(driver.get("vehicle_info"))
    online_vehicle = _as_dict(driver.get("online_vehicle"))
    raw = (
        vehicle.get("accepted_ride_types")
        or online_vehicle.get("accepted_ride_types")
        or driver.get("accepted_ride_types")
        or []
    )
    if isinstance(raw, str):
        raw = [part.strip() for part in raw.split(",")]
    if not isinstance(raw, list):
        return []
    return [_normalize_text(item) for item in raw if str(item or "").strip()]


def rental_driver_eligibility(
    driver: Dict[str, Any],
    *,
    vehicle_type: Optional[str] = None,
    package_hours: Optional[int] = None,
) -> Dict[str, Any]:
    source = driver or {}
    requested_vehicle = normalize_rental_vehicle_type(vehicle_type)
    driver_vehicle = _driver_vehicle_type(source)
    rating = _driver_rating(source)
    accepted = set(_accepted_ride_types(source))
    vehicle = _as_dict(source.get("vehicle_info"))
    online_vehicle = _as_dict(source.get("online_vehicle"))
    rental_enabled = (
        _truthy(source.get("rental_enabled"))
        or _truthy(vehicle.get("rental_enabled"))
        or _truthy(online_vehicle.get("rental_enabled"))
        or "rental" in accepted
        or "rental_hourly" in accepted
    )

    failures = []
    if not _is_available(source):
        failures.append("driver_not_available")
    if not _kyc_verified(source):
        failures.append("kyc_not_verified")
    if not _vehicle_verified(source):
        failures.append("vehicle_not_verified")
    if rating < RENTAL_MIN_DRIVER_RATING:
        failures.append("rating_below_4_5")
    if requested_vehicle and driver_vehicle and requested_vehicle != driver_vehicle:
        failures.append("vehicle_type_mismatch")
    if requested_vehicle:
        try:
            get_rental_package(requested_vehicle, package_hours or min(RENTAL_PACKAGE_CATALOG.get(requested_vehicle, {1: {}})))
        except Exception:
            failures.append("package_not_supported")
    if not rental_enabled:
        failures.append("rental_not_enabled")

    return {
        "eligible": not failures,
        "failures": failures,
        "vehicle_type": driver_vehicle or None,
        "rating": round(rating, 2),
        "rental_enabled": rental_enabled,
        "package_hours": package_hours,
        "min_rating": RENTAL_MIN_DRIVER_RATING,
    }


def build_rental_booking_context(
    *,
    vehicle_type: Optional[str],
    package_hours: Any,
    included_km: Optional[float] = None,
    stops: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    package = get_rental_package(vehicle_type, package_hours)
    effective_included_km = float(included_km) if included_km is not None else float(package["included_km"])
    return {
        "package": {**package, "included_km": effective_included_km},
        "vehicle_type": package["vehicle_type"],
        "package_hours": package["package_hours"],
        "included_km": effective_included_km,
        "base_fare": float(package["base_fare"]),
        "estimated_fare": float(package["base_fare"]),
        "extra_km_rate": float(package["extra_km_rate"]),
        "extra_15_min_rate": float(package["extra_15_min_rate"]),
        "stops": list(stops or []),
        "pickup_otp_required": True,
        "pickup_otp": generate_rental_otp(),
        "pickup_otp_status": "sent_to_passenger",
        "driver_filter": {
            "rental_required": True,
            "rental_enabled_required": True,
            "kyc_verified_required": True,
            "vehicle_verified_required": True,
            "min_rating": RENTAL_MIN_DRIVER_RATING,
            "vehicle_type": package["vehicle_type"],
            "package_hours": package["package_hours"],
        },
        "status_flow": list(RENTAL_STATUS_FLOW),
    }


def sanitize_rental_ride_for_response(ride: Dict[str, Any]) -> Dict[str, Any]:
    payload = deepcopy(ride or {})
    if payload.get("pickup_otp"):
        payload["pickup_otp"] = "sent_to_passenger"
    details = payload.get("rental_details")
    if isinstance(details, dict) and details.get("pickup_otp"):
        details["pickup_otp"] = "sent_to_passenger"
    return payload
