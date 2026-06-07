import math
import os
import secrets
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, ConfigDict, Field


ASSISTED_RIDE_STATUS_FLOW = [
    "searching_driver",
    "driver_assigned",
    "driver_arrived",
    "pickup_otp_pending",
    "pickup_verified",
    "ride_started",
    "live_tracking",
    "drop_otp_pending",
    "completed",
    "guardian_notified",
]

ASSISTED_RIDE_CATEGORIES = {"school", "elderly"}
APPROVED_STATUSES = {"approved", "verified", "valid", "clear", "completed", "active"}
NEGATIVE_COMPLAINT_STATUSES = {"open", "pending", "under_review", "substantiated", "confirmed"}
VEHICLE_DOCUMENT_TYPES = {"registration", "insurance"}


class AssistedRideRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    ride_category: str = Field(..., max_length=20)
    pickup_location: Optional[Dict[str, Any]] = None
    drop_location: Optional[Dict[str, Any]] = None
    pickup_latitude: Optional[float] = None
    pickup_longitude: Optional[float] = None
    pickup_address: Optional[str] = Field(default=None, max_length=300)
    drop_latitude: Optional[float] = None
    drop_longitude: Optional[float] = None
    drop_address: Optional[str] = Field(default=None, max_length=300)
    guardian_name: str = Field(..., min_length=2, max_length=80)
    guardian_phone: str = Field(..., min_length=6, max_length=20)
    passenger_name: str = Field(..., min_length=2, max_length=80)
    passenger_age: int = Field(..., ge=1, le=120)
    wheelchair_required: bool = False
    assistance_required: bool = True
    female_driver_preferred: bool = False
    trusted_driver_required: bool = True
    guardian_share_tracking: bool = True
    scheduled_time: Optional[datetime] = None
    notes: Optional[str] = Field(default=None, max_length=500)
    passenger_count: int = Field(default=1, ge=1, le=6)


class AssignAssistedDriverRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    driver_id: Optional[str] = Field(default=None, max_length=120)


class VerifyAssistedOtpRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    otp: str = Field(..., min_length=4, max_length=8)


def generate_assisted_ride_id() -> str:
    return f"ASR_{uuid.uuid4().hex[:12].upper()}"


def generate_assisted_otp() -> str:
    return f"{secrets.randbelow(10000):04d}"


def normalize_assisted_category(value: Any) -> str:
    category = str(value or "").strip().lower()
    if category in ASSISTED_RIDE_CATEGORIES:
        return category
    return ""


def _clean_text(value: Any, *, max_length: int = 500) -> str:
    return str(value or "").strip()[:max_length]


def _phone_digits(value: Any) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit() or ch == "+").strip()


def prepare_assisted_ride_context(
    *,
    ride_category: Any,
    guardian_name: Any,
    guardian_phone: Any,
    passenger_name: Any,
    passenger_age: Any,
    wheelchair_required: bool = False,
    assistance_required: bool = True,
    female_driver_preferred: bool = False,
    trusted_driver_required: bool = True,
    guardian_share_tracking: bool = True,
    scheduled_time: Optional[datetime] = None,
    notes: Any = None,
) -> Dict[str, Any]:
    category = normalize_assisted_category(ride_category)
    if not category:
        raise ValueError("Choose School or Elderly for assisted ride priority.")

    guardian_name_clean = _clean_text(guardian_name, max_length=80)
    guardian_phone_clean = _phone_digits(guardian_phone)
    passenger_name_clean = _clean_text(passenger_name, max_length=80)
    try:
        age = int(passenger_age)
    except (TypeError, ValueError):
        age = 0

    if len(guardian_name_clean) < 2:
        raise ValueError("Guardian name is required for assisted rides.")
    if len(guardian_phone_clean) < 6:
        raise ValueError("Guardian phone is required for assisted rides.")
    if len(passenger_name_clean) < 2:
        raise ValueError("Passenger name is required for assisted rides.")
    if age < 1 or age > 120:
        raise ValueError("Passenger age must be between 1 and 120.")
    if category == "school" and age > 18:
        raise ValueError("School assisted rides are for passengers 18 or younger.")
    if category == "elderly" and age < 55:
        raise ValueError("Elderly assisted rides are for passengers 55 or older.")

    return {
        "ride_category": category,
        "guardian_name": guardian_name_clean,
        "guardian_phone": guardian_phone_clean,
        "passenger_name": passenger_name_clean,
        "passenger_age": age,
        "wheelchair_required": bool(wheelchair_required),
        "assistance_required": bool(assistance_required),
        "female_driver_preferred": bool(female_driver_preferred),
        "trusted_driver_required": bool(trusted_driver_required),
        "guardian_share_tracking": bool(guardian_share_tracking),
        "scheduled_time": scheduled_time,
        "notes": _clean_text(notes, max_length=500) or None,
    }


def normalize_assisted_location(payload: AssistedRideRequest, prefix: str) -> Dict[str, Any]:
    existing = payload.pickup_location if prefix == "pickup" else payload.drop_location
    if isinstance(existing, dict) and existing:
        return existing
    latitude = payload.pickup_latitude if prefix == "pickup" else payload.drop_latitude
    longitude = payload.pickup_longitude if prefix == "pickup" else payload.drop_longitude
    address = payload.pickup_address if prefix == "pickup" else payload.drop_address
    return {
        "latitude": latitude,
        "longitude": longitude,
        "address": _clean_text(address, max_length=300),
    }


def build_assisted_ride_snapshot(context: Dict[str, Any], *, assisted_ride_id: str, status: str) -> Dict[str, Any]:
    return {
        "id": assisted_ride_id,
        "ride_category": context["ride_category"],
        "passenger_name": context["passenger_name"],
        "passenger_age": context["passenger_age"],
        "guardian_name": context["guardian_name"],
        "guardian_phone": context["guardian_phone"],
        "wheelchair_required": context["wheelchair_required"],
        "assistance_required": context["assistance_required"],
        "female_driver_preferred": context["female_driver_preferred"],
        "trusted_driver_required": context["trusted_driver_required"],
        "guardian_share_tracking": context["guardian_share_tracking"],
        "scheduled_time": context.get("scheduled_time"),
        "notes": context.get("notes"),
        "status": status,
        "pickup_otp_status": "pending",
        "drop_otp_status": "pending",
        "live_tracking_shared_to_guardian": context["guardian_share_tracking"],
    }


def _to_datetime(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    if isinstance(value, str):
        try:
            cleaned = value[:-1] + "+00:00" if value.endswith("Z") else value
            parsed = datetime.fromisoformat(cleaned)
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def _status(value: Any) -> str:
    return str(value or "").strip().lower()


def _is_approved_status(value: Any) -> bool:
    return _status(value) in APPROVED_STATUSES


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "on", "approved", "verified"}


def _driver_identifiers(driver: Dict[str, Any]) -> List[Any]:
    raw_ids = [
        driver.get("user_id"),
        driver.get("id"),
        driver.get("_id"),
    ]
    ids: List[Any] = []
    for raw in raw_ids:
        if raw is None:
            continue
        ids.append(raw)
        text = str(raw)
        if text and text not in ids:
            ids.append(text)
        if ObjectId.is_valid(text):
            object_id = ObjectId(text)
            if object_id not in ids:
                ids.append(object_id)
    return ids


async def _find_verified_documents(
    db: AsyncIOMotorDatabase,
    driver: Dict[str, Any],
    doc_types: Set[str],
) -> Dict[str, Dict[str, Any]]:
    identifiers = _driver_identifiers(driver)
    query_values = identifiers or [str(driver.get("user_id") or "")]
    rows = await db.driver_documents.find(
        {
            "$or": [
                {"driver_id": {"$in": query_values}},
                {"user_id": {"$in": query_values}},
            ],
            "doc_type": {"$in": list(doc_types)},
        }
    ).to_list(50)
    uploads = await db.document_uploads.find(
        {
            "user_id": {"$in": query_values},
            "document_type": {"$in": list(doc_types)},
        }
    ).to_list(50)

    docs: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        doc_type = row.get("doc_type")
        if doc_type:
            docs[str(doc_type)] = row
    for row in uploads:
        doc_type = row.get("document_type")
        if doc_type and str(doc_type) not in docs:
            docs[str(doc_type)] = row
    return docs


def _doc_verified_and_current(doc: Optional[Dict[str, Any]], now: datetime) -> bool:
    if not doc:
        return False
    verified = (
        _truthy(doc.get("verified"))
        or _truthy(doc.get("is_verified"))
        or _is_approved_status(doc.get("status"))
        or _is_approved_status(doc.get("verification_status"))
        or _is_approved_status(doc.get("document_status"))
    )
    if not verified:
        return False
    expiry = (
        _to_datetime(doc.get("expiry_date"))
        or _to_datetime(doc.get("expires_at"))
        or _to_datetime(doc.get("valid_until"))
    )
    if expiry and expiry < now:
        return False
    return True


async def _has_open_safety_complaint(db: AsyncIOMotorDatabase, driver: Dict[str, Any]) -> bool:
    if int(driver.get("safety_complaint_count") or driver.get("open_safety_complaints") or 0) > 0:
        return True
    identifiers = _driver_identifiers(driver)
    if not identifiers:
        return False
    count = await db.safety_complaints.count_documents(
        {
            "driver_id": {"$in": identifiers},
            "status": {"$in": list(NEGATIVE_COMPLAINT_STATUSES)},
        }
    )
    return count > 0


async def _has_emergency_contact_enabled(db: AsyncIOMotorDatabase, driver: Dict[str, Any]) -> bool:
    if _truthy(driver.get("emergency_contact_verified")) or _truthy(driver.get("emergency_contact_enabled")):
        return True
    if _clean_text(driver.get("emergency_contact_phone"), max_length=30):
        return True
    identifiers = _driver_identifiers(driver)
    if not identifiers:
        return False
    count = await db.emergency_contacts.count_documents(
        {
            "user_id": {"$in": identifiers},
            "$or": [{"active": {"$ne": False}}, {"is_active": True}],
        }
    )
    if count > 0:
        return True
    trusted_count = await db.trusted_contacts.count_documents(
        {
            "user_id": {"$in": identifiers},
            "$or": [{"active": {"$ne": False}}, {"is_active": True}],
        }
    )
    return trusted_count > 0


def _rating_value(driver: Dict[str, Any]) -> float:
    value = driver.get("rating")
    if value is None:
        value = driver.get("average_rating")
    try:
        rating = float(value)
    except (TypeError, ValueError):
        return 0.0
    return rating if math.isfinite(rating) else 0.0


def _driver_trained_for_assisted(driver: Dict[str, Any]) -> bool:
    vehicle_info = driver.get("vehicle_info") if isinstance(driver.get("vehicle_info"), dict) else {}
    accepted = driver.get("accepted_ride_types")
    if isinstance(accepted, str):
        accepted_values = {part.strip().lower() for part in accepted.split(",")}
    elif isinstance(accepted, list):
        accepted_values = {str(part).strip().lower() for part in accepted}
    else:
        accepted_values = set()
    return any(
        [
            _truthy(driver.get("trained_for_assisted_rides")),
            _truthy(driver.get("assisted_ride_trained")),
            _truthy(driver.get("assisted_ride_enabled")),
            _truthy(vehicle_info.get("assisted_ride_enabled")),
            "school_elderly_safe" in accepted_values,
            "assisted_ride" in accepted_values,
        ]
    )


async def assisted_driver_eligibility(
    db: AsyncIOMotorDatabase,
    driver: Dict[str, Any],
    *,
    min_rating: float = 4.5,
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    issues: List[str] = []

    if not _is_approved_status(driver.get("kyc_status")):
        issues.append("kyc_not_verified")
    if _rating_value(driver) < min_rating:
        issues.append("rating_below_4_5")

    docs = await _find_verified_documents(db, driver, VEHICLE_DOCUMENT_TYPES | {"police_clearance"})
    police_verified = (
        _truthy(driver.get("police_verified"))
        or _is_approved_status(driver.get("background_check_status"))
        or _doc_verified_and_current(docs.get("police_clearance"), now)
    )
    if not police_verified:
        issues.append("police_not_verified")

    if not _driver_trained_for_assisted(driver):
        issues.append("assisted_ride_training_missing")

    if await _has_open_safety_complaint(db, driver):
        issues.append("open_safety_complaint")

    if not await _has_emergency_contact_enabled(db, driver):
        issues.append("emergency_contact_missing")

    for doc_type in VEHICLE_DOCUMENT_TYPES:
        if not _doc_verified_and_current(docs.get(doc_type), now):
            issues.append(f"{doc_type}_document_invalid")

    return {
        "eligible": not issues,
        "issues": issues,
        "min_rating": min_rating,
    }


def serialize_assisted_ride(ride: Dict[str, Any]) -> Dict[str, Any]:
    def convert(value: Any) -> Any:
        if isinstance(value, ObjectId):
            return str(value)
        if isinstance(value, datetime):
            return value.isoformat()
        if isinstance(value, dict):
            return {key: convert(item) for key, item in value.items()}
        if isinstance(value, list):
            return [convert(item) for item in value]
        return value

    payload = convert(dict(ride or {}))
    payload["id"] = str(payload.get("id") or payload.get("_id") or "")
    debug_otps = os.environ.get("ASSISTED_RIDE_DEBUG_OTPS", "false").strip().lower() in {"1", "true", "yes", "on"}
    if not debug_otps:
        payload.pop("pickup_otp", None)
        payload.pop("drop_otp", None)
    payload["pickup_otp_sent"] = bool(ride.get("pickup_otp"))
    payload["drop_otp_sent"] = bool(ride.get("drop_otp"))
    return payload
