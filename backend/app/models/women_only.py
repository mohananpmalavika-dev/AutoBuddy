"""
Women Only ride safety rules.

This module keeps the driver eligibility, fare and ride-state rules in one
place so booking, dispatch and standalone safety endpoints do not drift apart.
"""

from __future__ import annotations

import math
import random
from copy import deepcopy
from datetime import datetime
from typing import Any, Dict, Optional

from app.utils.time_helpers import get_ist_now


WOMEN_ONLY_MIN_DRIVER_RATING = 4.7
WOMEN_ONLY_MIN_SAFETY_SCORE = 90.0
WOMEN_ONLY_TRUSTED_FALLBACK_SCORE = 95.0

WOMEN_ONLY_STATUS_FLOW = [
    "created",
    "searching_safe_driver",
    "driver_assigned",
    "accepted",
    "driver_arrived",
    "pickup_otp_pending",
    "started",
    "sos_triggered",
    "completed",
    "cancelled",
]

WOMEN_ONLY_FARE_CONFIG = {
    "auto": {"base_fare": 45.0, "per_km_rate": 18.0, "safety_fee": 10.0},
    "ev_auto": {"base_fare": 45.0, "per_km_rate": 18.0, "safety_fee": 10.0},
    "taxi": {"base_fare": 120.0, "per_km_rate": 25.0, "safety_fee": 10.0},
    "xl": {"base_fare": 150.0, "per_km_rate": 30.0, "safety_fee": 15.0},
}


def _as_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _normalize_text(value: Any) -> str:
    return str(value or "").strip().lower().replace("-", "_").replace(" ", "_")


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return _normalize_text(value) in {"1", "true", "yes", "y", "on", "verified", "approved", "passed", "clear"}


def normalize_women_only_gender(value: Any) -> str:
    text = _normalize_text(value)
    if text in {"f", "female", "woman", "women", "lady"}:
        return "female"
    if text in {"m", "male", "man", "men"}:
        return "male"
    return text


def is_women_only_passenger_allowed(gender: Any) -> bool:
    return normalize_women_only_gender(gender) == "female"


def generate_women_only_otp() -> str:
    return f"{random.randint(1000, 9999)}"


def is_women_only_night_ride(scheduled_time: Optional[datetime] = None) -> bool:
    ride_time = scheduled_time or get_ist_now()
    return ride_time.hour >= 20 or ride_time.hour < 6


def calculate_women_only_fare(distance_km: Any, vehicle_type: Optional[str] = None) -> float:
    vehicle_key = _normalize_text(vehicle_type) or "auto"
    config = WOMEN_ONLY_FARE_CONFIG.get(vehicle_key) or WOMEN_ONLY_FARE_CONFIG["auto"]
    try:
        distance = float(distance_km if distance_km is not None else 0.0)
    except Exception:
        distance = 0.0
    distance = max(0.5, distance)
    fare = config["base_fare"] + (distance * config["per_km_rate"]) + config["safety_fee"]
    return round(fare, 2)


def _first_number(*values: Any, default: float = 0.0) -> float:
    for value in values:
        try:
            number = float(value)
        except Exception:
            continue
        if math.isfinite(number):
            return number
    return default


def _driver_rating(driver: Dict[str, Any]) -> float:
    return _first_number(
        driver.get("women_only_rating"),
        driver.get("safety_rating"),
        driver.get("average_rating"),
        driver.get("rating"),
        default=5.0,
    )


def _driver_safety_score(driver: Dict[str, Any]) -> float:
    explicit = _first_number(
        driver.get("women_only_safety_score"),
        driver.get("safety_score"),
        driver.get("driver_safety_score"),
        default=float("nan"),
    )
    if math.isfinite(explicit):
        return explicit
    if _active_complaint_count(driver) > 0:
        return 0.0
    return min(100.0, 88.0 + (_driver_rating(driver) * 2.4))


def _active_complaint_count(driver: Dict[str, Any]) -> int:
    for key in ("active_complaints", "open_safety_complaints", "safety_complaint_count", "complaint_count"):
        value = driver.get(key)
        if value is None:
            continue
        if isinstance(value, list):
            return len(value)
        try:
            return int(value or 0)
        except Exception:
            continue
    return 0


def _kyc_verified(driver: Dict[str, Any]) -> bool:
    return (
        _truthy(driver.get("kyc_verified"))
        or _normalize_text(driver.get("kyc_status")) in {"approved", "verified"}
        or _normalize_text(driver.get("verification_status")) in {"approved", "verified"}
    )


def _police_verified(driver: Dict[str, Any]) -> bool:
    return (
        _truthy(driver.get("police_verified"))
        or _normalize_text(driver.get("police_verification_status")) in {"approved", "verified", "clear"}
        or _normalize_text(driver.get("background_check_status")) in {"approved", "verified", "passed", "clear"}
    )


def _has_live_location(driver: Dict[str, Any]) -> bool:
    if _truthy(driver.get("live_location_enabled")) or _truthy(driver.get("location_sharing_enabled")):
        return True
    location = _as_dict(driver.get("current_location")) or _as_dict(driver.get("driver_live_location"))
    return location.get("latitude") is not None and location.get("longitude") is not None


def _is_available(driver: Dict[str, Any]) -> bool:
    if "is_available" in driver:
        return _truthy(driver.get("is_available"))
    if "available" in driver:
        return _truthy(driver.get("available"))
    return True


def _trusted_safety_driver(driver: Dict[str, Any], safety_score: float) -> bool:
    vehicle = _as_dict(driver.get("vehicle_info"))
    online_vehicle = _as_dict(driver.get("online_vehicle"))
    return (
        safety_score >= WOMEN_ONLY_TRUSTED_FALLBACK_SCORE
        or _truthy(driver.get("trusted_safety_driver"))
        or _truthy(driver.get("women_only_trusted_driver"))
        or _truthy(vehicle.get("trusted_safety_driver"))
        or _truthy(online_vehicle.get("trusted_safety_driver"))
    )


def women_only_driver_eligibility(
    driver: Dict[str, Any],
    *,
    allow_trusted_male_driver_if_unavailable: bool = False,
    female_driver_required: bool = True,
) -> Dict[str, Any]:
    source = driver or {}
    gender = normalize_women_only_gender(source.get("gender") or source.get("driver_gender"))
    rating = _driver_rating(source)
    safety_score = _driver_safety_score(source)
    active_complaints = _active_complaint_count(source)
    trusted_fallback = _trusted_safety_driver(source, safety_score)

    failures = []
    if not _is_available(source):
        failures.append("driver_not_available")
    if not _kyc_verified(source):
        failures.append("kyc_not_verified")
    if not _police_verified(source):
        failures.append("police_not_verified")
    if rating < WOMEN_ONLY_MIN_DRIVER_RATING:
        failures.append("rating_below_4_7")
    if safety_score < WOMEN_ONLY_MIN_SAFETY_SCORE:
        failures.append("safety_score_below_90")
    if active_complaints > 0:
        failures.append("active_complaints")
    if not _has_live_location(source):
        failures.append("live_location_missing")

    if gender == "female":
        driver_mode = "female_driver"
    elif female_driver_required:
        failures.append("female_driver_required")
        driver_mode = "not_allowed"
    elif allow_trusted_male_driver_if_unavailable and gender == "male" and trusted_fallback:
        driver_mode = "trusted_safety_fallback"
    elif allow_trusted_male_driver_if_unavailable and gender == "male":
        failures.append("trusted_safety_fallback_required")
        driver_mode = "not_allowed"
    else:
        failures.append("female_driver_first_not_permitted")
        driver_mode = "not_allowed"

    return {
        "eligible": not failures,
        "failures": failures,
        "gender": gender or None,
        "driver_mode": driver_mode,
        "rating": round(rating, 2),
        "safety_score": round(safety_score, 2),
        "active_complaints": active_complaints,
        "trusted_safety_driver": trusted_fallback,
        "female_driver_required": bool(female_driver_required),
        "allow_trusted_male_driver_if_unavailable": bool(allow_trusted_male_driver_if_unavailable),
    }


def build_women_only_safety_context(
    *,
    passenger_gender: Any,
    guardian_name: Optional[str] = None,
    guardian_phone: Optional[str] = None,
    share_guardian_tracking: bool = True,
    female_driver_required: bool = True,
    allow_trusted_male_driver_if_unavailable: bool = False,
    scheduled_time: Optional[datetime] = None,
) -> Dict[str, Any]:
    normalized_gender = normalize_women_only_gender(passenger_gender)
    return {
        "passenger_gender": normalized_gender,
        "passenger_allowed": normalized_gender == "female",
        "female_driver_first": True,
        "female_driver_required": bool(female_driver_required),
        "allow_trusted_male_driver_if_unavailable": bool(allow_trusted_male_driver_if_unavailable),
        "guardian": {
            "name": (guardian_name or "").strip() or None,
            "phone": (guardian_phone or "").strip() or None,
            "live_tracking_enabled": bool(share_guardian_tracking),
        },
        "pickup_otp_required": True,
        "pickup_otp": generate_women_only_otp(),
        "pickup_otp_status": "sent_to_passenger",
        "sos_enabled": True,
        "live_tracking_enabled": True,
        "night_ride": is_women_only_night_ride(scheduled_time),
        "night_safety_checks": is_women_only_night_ride(scheduled_time),
        "completion_notification_enabled": True,
        "status_flow": list(WOMEN_ONLY_STATUS_FLOW),
        "driver_filter": {
            "women_only_required": True,
            "female_driver_first": True,
            "female_driver_required": bool(female_driver_required),
            "allow_trusted_male_driver_if_unavailable": bool(allow_trusted_male_driver_if_unavailable),
            "trusted_safety_driver_allowed": bool(allow_trusted_male_driver_if_unavailable),
            "kyc_verified_required": True,
            "police_verified_required": True,
            "min_rating": WOMEN_ONLY_MIN_DRIVER_RATING,
            "min_safety_score": WOMEN_ONLY_MIN_SAFETY_SCORE,
            "no_active_complaints_required": True,
            "live_location_required": True,
            "guardian_tracking_required": bool(share_guardian_tracking),
        },
    }


def sanitize_women_only_ride_for_response(ride: Dict[str, Any]) -> Dict[str, Any]:
    payload = deepcopy(ride or {})
    if payload.get("pickup_otp"):
        payload["pickup_otp"] = "sent_to_passenger"
    details = payload.get("women_only_details")
    if isinstance(details, dict) and details.get("pickup_otp"):
        details["pickup_otp"] = "sent_to_passenger"
    return payload
