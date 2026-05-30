"""
Operator / Fleet Owner Portal

Operators own vehicles and assign them to driver accounts. This keeps operator
ownership separate from platform admin powers while still syncing assigned
vehicles into the driver vehicle collection used by the driver app.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field, model_validator

from app.db.deps import get_db
from app.models.canonical_vehicle_model import CANONICAL_VEHICLES_COLLECTION
from app.utils.rbac import require_roles


router = APIRouter(prefix="/api/operators", tags=["operators"])
admin_router = APIRouter(prefix="/api/admin/operators", tags=["admin_operators"])

OPERATOR_PROFILES_COLLECTION = "operator_profiles"
OPERATOR_FLEET_VEHICLES_COLLECTION = "operator_fleet_vehicles"
OPERATOR_ASSIGNMENT_HISTORY_COLLECTION = "operator_vehicle_assignment_history"


def _user_id(current_user: dict) -> str:
    return str(current_user.get("id") or "").strip()


def _now() -> datetime:
    return datetime.utcnow()


def _strip_mongo_id(document: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not document:
        return {}
    cleaned = dict(document)
    cleaned.pop("_id", None)
    return cleaned


def _operator_profile_defaults(current_user: dict) -> Dict[str, Any]:
    operator_id = _user_id(current_user)
    return {
        "operator_id": operator_id,
        "company_name": f"{str(current_user.get('name') or 'AutoBuddy').strip()} Fleet",
        "contact_name": str(current_user.get("name") or "").strip(),
        "contact_email": str(current_user.get("email") or "").strip().lower(),
        "contact_phone": str(current_user.get("phone") or "").strip(),
        "service_regions": ["all"],
        "verification_status": "pending",
        "active": True,
        "created_at": _now(),
        "updated_at": _now(),
    }


async def _ensure_operator_profile(db: AsyncIOMotorDatabase, current_user: dict) -> Dict[str, Any]:
    operator_id = _user_id(current_user)
    defaults = _operator_profile_defaults(current_user)
    await db[OPERATOR_PROFILES_COLLECTION].update_one(
        {"operator_id": operator_id},
        {"$setOnInsert": defaults},
        upsert=True,
    )
    profile = await db[OPERATOR_PROFILES_COLLECTION].find_one({"operator_id": operator_id})
    return _strip_mongo_id(profile or defaults)


async def _canonical_vehicle(
    db: AsyncIOMotorDatabase,
    vehicle_type_id: str,
    vehicle_subtype_id: Optional[str] = None,
) -> tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
    vehicle = await db[CANONICAL_VEHICLES_COLLECTION].find_one({
        "vehicle_type_id": vehicle_type_id,
        "active": True,
    })
    if not vehicle:
        raise HTTPException(status_code=400, detail=f"Invalid vehicle type: {vehicle_type_id}")

    subtype = None
    if vehicle_subtype_id:
        subtype = next(
            (item for item in vehicle.get("subtypes", []) if item.get("id") == vehicle_subtype_id),
            None,
        )
        if not subtype:
            raise HTTPException(status_code=400, detail=f"Invalid vehicle subtype: {vehicle_subtype_id}")
    return vehicle, subtype


async def _resolve_driver(db: AsyncIOMotorDatabase, payload: "AssignDriverPayload") -> Dict[str, Any]:
    query = None
    if payload.driver_id:
        query = {"id": payload.driver_id}
    elif payload.driver_email:
        query = {"email": payload.driver_email.strip().lower()}
    elif payload.driver_phone:
        query = {"phone": payload.driver_phone.strip()}

    if not query:
        raise HTTPException(status_code=400, detail="Provide driver id, email, or phone")

    driver = await db.users.find_one(query)
    if not driver or str(driver.get("role") or "").strip().lower() != "driver":
        raise HTTPException(status_code=404, detail="Driver account not found")
    return driver


def _vehicle_response(document: Dict[str, Any]) -> Dict[str, Any]:
    return _strip_mongo_id(document)


async def _record_assignment_history(
    db: AsyncIOMotorDatabase,
    operator_id: str,
    vehicle_id: str,
    driver_id: str,
    event_type: str,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    await db[OPERATOR_ASSIGNMENT_HISTORY_COLLECTION].insert_one({
        "id": str(uuid.uuid4()),
        "operator_id": operator_id,
        "vehicle_id": vehicle_id,
        "driver_id": driver_id,
        "event_type": event_type,
        "details": details or {},
        "created_at": _now(),
    })


async def _sync_assigned_driver_vehicle(
    db: AsyncIOMotorDatabase,
    vehicle: Dict[str, Any],
    driver: Dict[str, Any],
) -> None:
    driver_id = str(driver.get("id") or "")
    existing = await db.driver_vehicles.find_one({
        "driver_id": driver_id,
        "operator_vehicle_id": vehicle["id"],
    })
    has_active_vehicle = await db.driver_vehicles.find_one({
        "driver_id": driver_id,
        "is_active": True,
        "operator_vehicle_id": {"$ne": vehicle["id"]},
    })
    is_active = bool(existing.get("is_active")) if existing else not bool(has_active_vehicle)
    make = str(vehicle.get("make") or "").strip()
    model = str(vehicle.get("model") or "").strip()
    vehicle_model = " ".join(part for part in [make, model] if part) or vehicle.get("vehicle_type_name") or "Vehicle"
    now = _now()

    driver_vehicle_fields = {
        "driver_id": driver_id,
        "operator_id": vehicle["operator_id"],
        "owner_id": vehicle["operator_id"],
        "operator_vehicle_id": vehicle["id"],
        "make": vehicle.get("make", ""),
        "model": vehicle.get("model", ""),
        "year": vehicle.get("year"),
        "color": vehicle.get("color", ""),
        "license_plate": vehicle.get("license_plate", ""),
        "registration_number": vehicle.get("registration_number") or vehicle.get("license_plate", ""),
        "seating_capacity": vehicle.get("seating_capacity") or vehicle.get("capacity") or 1,
        "vehicle_type": vehicle.get("vehicle_type_id"),
        "vehicle_type_id": vehicle.get("vehicle_type_id"),
        "vehicle_subtype_id": vehicle.get("vehicle_subtype_id"),
        "vehicle_type_name": vehicle.get("vehicle_type_name"),
        "vehicle_subtype_name": vehicle.get("vehicle_subtype_name"),
        "vehicle_icon": vehicle.get("vehicle_icon"),
        "capacity_unit": vehicle.get("capacity_unit", "passengers"),
        "verification_status": vehicle.get("verification_status", "pending"),
        "is_active": is_active,
        "updated_at": now,
    }

    await db.driver_vehicles.update_one(
        {"driver_id": driver_id, "operator_vehicle_id": vehicle["id"]},
        {
            "$set": driver_vehicle_fields,
            "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now},
        },
        upsert=True,
    )

    await _record_assignment_history(
        db=db,
        operator_id=vehicle.get("operator_id"),
        vehicle_id=vehicle.get("id"),
        driver_id=driver_id,
        event_type="assign",
        details={
            "license_plate": vehicle.get("license_plate"),
            "vehicle_type_id": vehicle.get("vehicle_type_id"),
        },
    )

    if is_active:
        await db.drivers.update_one(
            {"user_id": driver_id},
            {
                "$set": {
                    "vehicle_info": {
                        "vehicle_number": vehicle.get("license_plate", ""),
                        "vehicle_model": vehicle_model,
                        "vehicle_color": vehicle.get("color", ""),
                        "vehicle_type": vehicle.get("vehicle_type_id"),
                        "vehicle_type_id": vehicle.get("vehicle_type_id"),
                        "vehicle_subtype_id": vehicle.get("vehicle_subtype_id"),
                        "vehicle_type_name": vehicle.get("vehicle_type_name"),
                        "vehicle_subtype_name": vehicle.get("vehicle_subtype_name"),
                    },
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "user_id": driver_id,
                    "is_available": False,
                    "kyc_status": "pending",
                    "rating": 5.0,
                    "total_rides": 0,
                    "fare_multiplier": 1.0,
                },
            },
            upsert=True,
        )


async def _remove_assigned_driver_vehicle(
    db: AsyncIOMotorDatabase,
    vehicle: Dict[str, Any],
    driver_id: Optional[str] = None,
) -> None:
    resolved_driver_id = str(driver_id or vehicle.get("assigned_driver_id") or "").strip()
    if not resolved_driver_id:
        return

    existing = await db.driver_vehicles.find_one({
        "driver_id": resolved_driver_id,
        "operator_vehicle_id": vehicle["id"],
    })
    await db.driver_vehicles.delete_one({
        "driver_id": resolved_driver_id,
        "operator_vehicle_id": vehicle["id"],
    })
    if existing and existing.get("is_active"):
        replacement = await db.driver_vehicles.find_one(
            {"driver_id": resolved_driver_id},
            sort=[("updated_at", -1)],
        )
        if replacement:
            await db.driver_vehicles.update_many(
                {"driver_id": resolved_driver_id},
                {"$set": {"is_active": False, "updated_at": _now()}},
            )
            await db.driver_vehicles.update_one(
                {"driver_id": resolved_driver_id, "id": replacement["id"]},
                {"$set": {"is_active": True, "updated_at": _now()}},
            )
        else:
            await db.drivers.update_one(
                {"user_id": resolved_driver_id},
                {"$set": {"vehicle_info": None, "updated_at": _now()}},
            )

    await _record_assignment_history(
        db=db,
        operator_id=vehicle.get("operator_id"),
        vehicle_id=vehicle.get("id"),
        driver_id=resolved_driver_id,
        event_type="unassign",
        details={
            "license_plate": vehicle.get("license_plate"),
            "vehicle_type_id": vehicle.get("vehicle_type_id"),
        },
    )


class OperatorProfileUpdate(BaseModel):
    company_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    contact_name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    contact_email: Optional[str] = Field(default=None, max_length=180)
    contact_phone: Optional[str] = Field(default=None, max_length=20)
    gst_number: Optional[str] = Field(default=None, max_length=30)
    service_regions: Optional[List[str]] = None


class OperatorVehiclePayload(BaseModel):
    make: str = Field(..., min_length=1, max_length=80)
    model: str = Field(..., min_length=1, max_length=80)
    year: int = Field(..., ge=2000, le=2100)
    color: Optional[str] = Field(default="", max_length=40)
    license_plate: str = Field(..., min_length=3, max_length=20)
    registration_number: Optional[str] = Field(default=None, max_length=40)
    seating_capacity: Optional[int] = Field(default=None, ge=1, le=100)
    vehicle_type_id: str = Field(..., min_length=1, max_length=60)
    vehicle_subtype_id: Optional[str] = Field(default=None, max_length=80)
    service_regions: List[str] = Field(default_factory=lambda: ["all"])

    @model_validator(mode="after")
    def normalize_license_plate(self):
        self.license_plate = self.license_plate.strip().upper()
        if self.registration_number:
            self.registration_number = self.registration_number.strip().upper()
        return self


class AssignDriverPayload(BaseModel):
    driver_id: Optional[str] = None
    driver_email: Optional[str] = None
    driver_phone: Optional[str] = None


class OperatorStatusPayload(BaseModel):
    verification_status: str = Field(..., pattern="^(pending|approved|rejected|suspended)$")
    active: bool = True
    note: Optional[str] = Field(default=None, max_length=250)


@router.get("/profile")
async def get_operator_profile(
    current_user: dict = Depends(require_roles("operator")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    return {"profile": await _ensure_operator_profile(db, current_user)}


@router.put("/profile")
async def update_operator_profile(
    payload: OperatorProfileUpdate,
    current_user: dict = Depends(require_roles("operator")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    operator_id = _user_id(current_user)
    await _ensure_operator_profile(db, current_user)
    update_data = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    update_data["updated_at"] = _now()
    await db[OPERATOR_PROFILES_COLLECTION].update_one(
        {"operator_id": operator_id},
        {"$set": update_data},
    )
    profile = await db[OPERATOR_PROFILES_COLLECTION].find_one({"operator_id": operator_id})
    return {"profile": _strip_mongo_id(profile)}


@router.get("/dashboard")
async def get_operator_dashboard(
    current_user: dict = Depends(require_roles("operator")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    operator_id = _user_id(current_user)
    await _ensure_operator_profile(db, current_user)
    vehicles = await db[OPERATOR_FLEET_VEHICLES_COLLECTION].find({"operator_id": operator_id}).to_list(500)
    assigned_driver_ids = sorted({
        str(vehicle.get("assigned_driver_id"))
        for vehicle in vehicles
        if vehicle.get("assigned_driver_id")
    })
    completed_bookings = await db.bookings.find({
        "$or": [
            {"driver_id": {"$in": assigned_driver_ids}},
            {"accepted_driver_id": {"$in": assigned_driver_ids}},
        ],
        "status": {"$in": ["completed", "COMPLETED"]},
    }).sort("created_at", -1).to_list(100)
    gross_earnings = sum(
        float(booking.get("final_fare") or booking.get("estimated_fare") or 0)
        for booking in completed_bookings
    )
    return {
        "summary": {
            "total_vehicles": len(vehicles),
            "active_vehicles": len([vehicle for vehicle in vehicles if vehicle.get("active", True)]),
            "assigned_vehicles": len([vehicle for vehicle in vehicles if vehicle.get("assigned_driver_id")]),
            "drivers": len(assigned_driver_ids),
            "completed_rides": len(completed_bookings),
            "gross_earnings": round(gross_earnings, 2),
        },
        "recent_bookings": [_strip_mongo_id(item) for item in completed_bookings[:10]],
    }


@router.get("/vehicles")
async def list_operator_vehicles(
    active_only: bool = Query(False),
    current_user: dict = Depends(require_roles("operator")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    query: Dict[str, Any] = {"operator_id": _user_id(current_user)}
    if active_only:
        query["active"] = True
    vehicles = await db[OPERATOR_FLEET_VEHICLES_COLLECTION].find(query).sort("updated_at", -1).to_list(500)
    return {"vehicles": [_vehicle_response(item) for item in vehicles]}


@router.get("/vehicles/{vehicle_id}")
async def get_operator_vehicle(
    vehicle_id: str,
    current_user: dict = Depends(require_roles("operator")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    operator_id = _user_id(current_user)
    vehicle = await db[OPERATOR_FLEET_VEHICLES_COLLECTION].find_one({"operator_id": operator_id, "id": vehicle_id})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return {"vehicle": _vehicle_response(vehicle)}


@router.get("/drivers")
async def list_operator_drivers(
    current_user: dict = Depends(require_roles("operator")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    operator_id = _user_id(current_user)
    vehicles = await db[OPERATOR_FLEET_VEHICLES_COLLECTION].find({"operator_id": operator_id, "assigned_driver_id": {"$exists": True, "$ne": None}}).to_list(500)
    driver_ids = sorted({str(vehicle.get("assigned_driver_id")) for vehicle in vehicles if vehicle.get("assigned_driver_id")})
    if not driver_ids:
        return {"drivers": []}

    drivers = await db.users.find({"id": {"$in": driver_ids}}).to_list(500)
    return {"drivers": [{"id": driver.get("id"), "name": driver.get("name"), "email": driver.get("email"), "phone": driver.get("phone")} for driver in drivers]}


@router.get("/assignments")
async def list_operator_assignments(
    current_user: dict = Depends(require_roles("operator")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    operator_id = _user_id(current_user)
    history = await db[OPERATOR_ASSIGNMENT_HISTORY_COLLECTION].find({"operator_id": operator_id}).sort("created_at", -1).to_list(200)
    return {"assignments": [_strip_mongo_id(item) for item in history]}


@router.post("/vehicles")
async def create_operator_vehicle(
    payload: OperatorVehiclePayload,
    current_user: dict = Depends(require_roles("operator")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    operator_id = _user_id(current_user)
    await _ensure_operator_profile(db, current_user)
    canonical_vehicle, canonical_subtype = await _canonical_vehicle(
        db,
        payload.vehicle_type_id,
        payload.vehicle_subtype_id,
    )
    duplicate = await db[OPERATOR_FLEET_VEHICLES_COLLECTION].find_one({
        "operator_id": operator_id,
        "license_plate": payload.license_plate,
        "active": {"$ne": False},
    })
    if duplicate:
        raise HTTPException(status_code=409, detail="Vehicle already exists in your fleet")

    capacity = payload.seating_capacity or (canonical_subtype.get("capacity") if canonical_subtype else None)
    if not capacity:
        capacity = canonical_vehicle.get("capacity", 1)
    now = _now()
    vehicle_doc = {
        "id": str(uuid.uuid4()),
        "operator_id": operator_id,
        **payload.model_dump(),
        "capacity": int(capacity or 1),
        "seating_capacity": payload.seating_capacity or int(capacity or 1),
        "vehicle_type_name": canonical_vehicle.get("name"),
        "vehicle_subtype_name": canonical_subtype.get("name") if canonical_subtype else None,
        "vehicle_icon": canonical_vehicle.get("icon"),
        "capacity_unit": canonical_vehicle.get("capacity_unit", "passengers"),
        "verification_status": "pending",
        "active": True,
        "assigned_driver_id": None,
        "assigned_driver_name": None,
        "assigned_at": None,
        "created_at": now,
        "updated_at": now,
    }
    await db[OPERATOR_FLEET_VEHICLES_COLLECTION].insert_one(vehicle_doc)
    return {"vehicle": _vehicle_response(vehicle_doc)}


@router.put("/vehicles/{vehicle_id}")
async def update_operator_vehicle(
    vehicle_id: str,
    payload: OperatorVehiclePayload,
    current_user: dict = Depends(require_roles("operator")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    operator_id = _user_id(current_user)
    existing = await db[OPERATOR_FLEET_VEHICLES_COLLECTION].find_one({"operator_id": operator_id, "id": vehicle_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    canonical_vehicle, canonical_subtype = await _canonical_vehicle(
        db,
        payload.vehicle_type_id,
        payload.vehicle_subtype_id,
    )
    capacity = payload.seating_capacity or (canonical_subtype.get("capacity") if canonical_subtype else None)
    if not capacity:
        capacity = canonical_vehicle.get("capacity", 1)
    update_data = {
        **payload.model_dump(),
        "capacity": int(capacity or 1),
        "seating_capacity": payload.seating_capacity or int(capacity or 1),
        "vehicle_type_name": canonical_vehicle.get("name"),
        "vehicle_subtype_name": canonical_subtype.get("name") if canonical_subtype else None,
        "vehicle_icon": canonical_vehicle.get("icon"),
        "capacity_unit": canonical_vehicle.get("capacity_unit", "passengers"),
        "updated_at": _now(),
    }
    await db[OPERATOR_FLEET_VEHICLES_COLLECTION].update_one(
        {"operator_id": operator_id, "id": vehicle_id},
        {"$set": update_data},
    )
    updated = await db[OPERATOR_FLEET_VEHICLES_COLLECTION].find_one({"operator_id": operator_id, "id": vehicle_id})
    if updated and updated.get("assigned_driver_id"):
        driver = await db.users.find_one({"id": updated["assigned_driver_id"]})
        if driver:
            await _sync_assigned_driver_vehicle(db, updated, driver)
    return {"vehicle": _vehicle_response(updated)}


async def _record_assignment_history(
    db: AsyncIOMotorDatabase,
    operator_id: str,
    vehicle_id: str,
    driver_id: str,
    event_type: str,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    await db[OPERATOR_ASSIGNMENT_HISTORY_COLLECTION].insert_one({
        "id": str(uuid.uuid4()),
        "operator_id": operator_id,
        "vehicle_id": vehicle_id,
        "driver_id": driver_id,
        "event_type": event_type,
        "details": details or {},
        "created_at": _now(),
    })


@router.put("/vehicles/{vehicle_id}/assign-driver")
async def assign_operator_vehicle_driver(
    vehicle_id: str,
    payload: AssignDriverPayload,
    current_user: dict = Depends(require_roles("operator")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    operator_id = _user_id(current_user)
    vehicle = await db[OPERATOR_FLEET_VEHICLES_COLLECTION].find_one({"operator_id": operator_id, "id": vehicle_id})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    driver = await _resolve_driver(db, payload)
    previous_driver_id = str(vehicle.get("assigned_driver_id") or "")
    if previous_driver_id and previous_driver_id != driver["id"]:
        await _remove_assigned_driver_vehicle(db, vehicle, previous_driver_id)

    now = _now()
    await db[OPERATOR_FLEET_VEHICLES_COLLECTION].update_one(
        {"operator_id": operator_id, "id": vehicle_id},
        {
            "$set": {
                "assigned_driver_id": driver["id"],
                "assigned_driver_name": driver.get("name"),
                "assigned_driver_phone": driver.get("phone"),
                "assigned_at": now,
                "updated_at": now,
            }
        },
    )
    updated = await db[OPERATOR_FLEET_VEHICLES_COLLECTION].find_one({"operator_id": operator_id, "id": vehicle_id})
    await _sync_assigned_driver_vehicle(db, updated, driver)
    return {"vehicle": _vehicle_response(updated)}


@router.delete("/vehicles/{vehicle_id}/assign-driver")
async def unassign_operator_vehicle_driver(
    vehicle_id: str,
    current_user: dict = Depends(require_roles("operator")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    operator_id = _user_id(current_user)
    vehicle = await db[OPERATOR_FLEET_VEHICLES_COLLECTION].find_one({"operator_id": operator_id, "id": vehicle_id})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    await _remove_assigned_driver_vehicle(db, vehicle)
    await db[OPERATOR_FLEET_VEHICLES_COLLECTION].update_one(
        {"operator_id": operator_id, "id": vehicle_id},
        {
            "$set": {"updated_at": _now()},
            "$unset": {
                "assigned_driver_id": "",
                "assigned_driver_name": "",
                "assigned_driver_phone": "",
                "assigned_at": "",
            },
        },
    )
    updated = await db[OPERATOR_FLEET_VEHICLES_COLLECTION].find_one({"operator_id": operator_id, "id": vehicle_id})
    return {"vehicle": _vehicle_response(updated)}


@router.delete("/vehicles/{vehicle_id}")
async def delete_operator_vehicle(
    vehicle_id: str,
    current_user: dict = Depends(require_roles("operator")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    operator_id = _user_id(current_user)
    vehicle = await db[OPERATOR_FLEET_VEHICLES_COLLECTION].find_one({"operator_id": operator_id, "id": vehicle_id})
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    await _remove_assigned_driver_vehicle(db, vehicle)
    await db[OPERATOR_FLEET_VEHICLES_COLLECTION].update_one(
        {"operator_id": operator_id, "id": vehicle_id},
        {"$set": {"active": False, "updated_at": _now()}},
    )
    return {"success": True, "message": "Vehicle disabled"}


@router.get("/vehicles/{vehicle_id}/assignment-history")
async def get_vehicle_assignment_history(
    vehicle_id: str,
    current_user: dict = Depends(require_roles("operator")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    operator_id = _user_id(current_user)
    history = await db[OPERATOR_ASSIGNMENT_HISTORY_COLLECTION].find({
        "operator_id": operator_id,
        "vehicle_id": vehicle_id,
    }).sort("created_at", -1).to_list(200)
    return {"assignments": [_strip_mongo_id(item) for item in history]}


@admin_router.get("")
async def list_operators(
    current_user: dict = Depends(require_roles("admin")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    profiles = await db[OPERATOR_PROFILES_COLLECTION].find({}).sort("updated_at", -1).to_list(500)
    return {"operators": [_strip_mongo_id(item) for item in profiles]}


@admin_router.put("/{operator_id}/status")
async def update_operator_status(
    operator_id: str,
    payload: OperatorStatusPayload,
    current_user: dict = Depends(require_roles("admin")),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    result = await db[OPERATOR_PROFILES_COLLECTION].update_one(
        {"operator_id": operator_id},
        {
            "$set": {
                "verification_status": payload.verification_status,
                "active": payload.active,
                "admin_note": payload.note,
                "reviewed_by": _user_id(current_user),
                "reviewed_at": _now(),
                "updated_at": _now(),
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Operator profile not found")
    profile = await db[OPERATOR_PROFILES_COLLECTION].find_one({"operator_id": operator_id})
    return {"operator": _strip_mongo_id(profile)}
