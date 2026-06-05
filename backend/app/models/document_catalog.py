from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional

from pymongo import UpdateOne
from pymongo.errors import BulkWriteError


IST_TZ = timezone(timedelta(hours=5, minutes=30))
DOCUMENT_MANDATORY_PAUSE_END = datetime(2026, 6, 16, 0, 0, 0, tzinfo=IST_TZ)
DOCUMENT_MANDATORY_PAUSE_UNTIL_LABEL = "June 15, 2026"


DOCUMENT_TYPES: Dict[str, Dict[str, Any]] = {
    # KYC and identity documents
    "passport": {"label": "Passport", "category": "KYC", "applicable_to": "both"},
    "national_id": {"label": "National ID / Identity Card", "category": "KYC", "applicable_to": "both"},
    "id_proof": {"label": "Identity Proof", "category": "KYC", "applicable_to": "passenger"},
    "aadhar": {"label": "Aadhar / ID Proof", "category": "KYC", "applicable_to": "both"},
    "driving_license": {"label": "Driving License", "category": "KYC", "applicable_to": "driver"},
    "driver_license": {"label": "Driver License", "category": "KYC", "applicable_to": "driver"},
    "driving_history": {"label": "Driving History Report", "category": "KYC", "applicable_to": "driver"},
    "fitness_certificate": {"label": "Medical/Fitness Certificate", "category": "KYC", "applicable_to": "driver"},
    "police_clearance": {"label": "Police Clearance Certificate", "category": "KYC", "applicable_to": "driver"},
    "pan_id": {"label": "PAN / Tax ID", "category": "KYC", "applicable_to": "both"},
    "pan": {"label": "PAN Card", "category": "KYC", "applicable_to": "both"},
    "bank_details": {"label": "Bank Account Proof", "category": "KYC", "applicable_to": "driver"},
    "address_proof": {"label": "Address Proof", "category": "KYC", "applicable_to": "both"},
    "selfie": {"label": "Selfie / Liveness Photo", "category": "KYC", "applicable_to": "driver"},
    # Vehicle and driver profile documents
    "registration": {"label": "Vehicle Registration Certificate", "category": "Vehicle", "applicable_to": "driver"},
    "vehicle_registration": {"label": "Vehicle Registration", "category": "Vehicle", "applicable_to": "driver"},
    "insurance": {"label": "Insurance Document", "category": "Vehicle", "applicable_to": "both"},
    "vehicle_insurance": {"label": "Vehicle Insurance", "category": "Vehicle", "applicable_to": "driver"},
    "pollution_certificate": {"label": "Pollution Certificate / PUC", "category": "Vehicle", "applicable_to": "driver"},
    "vehicle_inspection": {"label": "Vehicle Inspection Report", "category": "Vehicle", "applicable_to": "driver"},
    "ownership_proof": {"label": "Ownership Proof / Title Deed", "category": "Vehicle", "applicable_to": "driver"},
    "vehicle_photo_front": {"label": "Vehicle Photo - Front", "category": "Vehicle", "applicable_to": "driver"},
    "vehicle_photo_back": {"label": "Vehicle Photo - Back", "category": "Vehicle", "applicable_to": "driver"},
    "vehicle_photo_interior": {"label": "Vehicle Photo - Interior", "category": "Vehicle", "applicable_to": "driver"},
    "vehicle_inspection_sticker": {"label": "Inspection Sticker / Permit", "category": "Vehicle", "applicable_to": "driver"},
    "loan_details": {"label": "Loan/Mortgage Documentation", "category": "Vehicle", "applicable_to": "driver"},
    "emission_test": {"label": "Emission Test Report", "category": "Vehicle", "applicable_to": "driver"},
    # Passenger profile documents
    "emergency_doc": {"label": "Emergency Contact Document", "category": "Passenger", "applicable_to": "passenger"},
    "other": {"label": "Other Documents", "category": "Passenger", "applicable_to": "passenger"},
}


def get_document_types_list() -> List[Dict[str, str]]:
    return [
        {
            "value": key,
            "label": value["label"],
            "category": value["category"],
            "applicable_to": value.get("applicable_to", "both"),
        }
        for key, value in DOCUMENT_TYPES.items()
    ]


def group_document_types_by_category(items: Optional[Iterable[Dict[str, str]]] = None) -> Dict[str, List[Dict[str, str]]]:
    grouped: Dict[str, List[Dict[str, str]]] = {}
    for item in items or get_document_types_list():
        grouped.setdefault(item.get("category") or "Other", []).append(item)
    return grouped


def document_mandatory_pause_active(now: Optional[datetime] = None) -> bool:
    current = now or datetime.now(IST_TZ)
    if current.tzinfo is None:
        current = current.replace(tzinfo=IST_TZ)
    else:
        current = current.astimezone(IST_TZ)
    return current < DOCUMENT_MANDATORY_PAUSE_END


def effective_is_mandatory(requirement: Dict[str, Any], now: Optional[datetime] = None) -> bool:
    if document_mandatory_pause_active(now):
        return False
    return bool(requirement.get("is_mandatory"))


def serialize_document_requirement(requirement: Dict[str, Any]) -> Dict[str, Any]:
    configured_mandatory = bool(requirement.get("is_mandatory"))
    return {
        "id": str(requirement.get("_id")) if requirement.get("_id") else None,
        "document_type": requirement.get("document_type"),
        "display_name": requirement.get("display_name"),
        "is_mandatory": effective_is_mandatory(requirement),
        "configured_is_mandatory": configured_mandatory,
        "mandatory_paused": document_mandatory_pause_active(),
        "mandatory_paused_until": DOCUMENT_MANDATORY_PAUSE_UNTIL_LABEL,
        "grace_period_days": requirement.get("grace_period_days"),
        "applicable_to": requirement.get("applicable_to"),
        "description": requirement.get("description"),
        "enabled": requirement.get("enabled"),
        "category": requirement.get("category"),
    }


async def ensure_default_document_requirements(db: Any) -> None:
    now = datetime.now(IST_TZ)
    operations = []
    for document_type, info in DOCUMENT_TYPES.items():
        operations.append(
            UpdateOne(
                {"document_type": document_type},
                {
                    "$setOnInsert": {
                        "document_type": document_type,
                        "display_name": info["label"],
                        "is_mandatory": False,
                        "grace_period_days": 0,
                        "applicable_to": info.get("applicable_to", "both"),
                        "description": None,
                        "enabled": True,
                        "category": info["category"],
                        "created_at": now,
                        "updated_at": now,
                        "created_by": "system",
                    }
                },
                upsert=True,
            )
        )
    if operations:
        try:
            await db.document_requirements.bulk_write(operations, ordered=False)
        except BulkWriteError:
            # A concurrent request may seed the same document type first.
            pass
