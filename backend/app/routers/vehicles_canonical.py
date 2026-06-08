"""
Canonical Vehicles API Router - Single unified API for all vehicle operations
Replaces: vehicle_types.py, vehicle_types_extended.py, etc.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional
from datetime import datetime
from app.utils.time_helpers import get_ist_now
import asyncio
import logging
import os
import time

from app.db.deps import get_db
from app.utils.rbac import require_roles, get_current_user_secure
from app.models.canonical_vehicle_model import (
    CANONICAL_VEHICLE_TYPES,
    CANONICAL_VEHICLES_COLLECTION,
    LEGACY_CANONICAL_VEHICLES_COLLECTION,
)
from app.models.ride_type_compatibility import (
    get_ride_type_multiplier,
    RIDE_TYPE_COMPATIBILITY,
    FARE_CONFIGURATIONS,
)

router = APIRouter(prefix="/api/vehicles", tags=["canonical_vehicles"])
logger = logging.getLogger(__name__)
VEHICLE_CATALOG_DB_TIMEOUT_SECONDS = max(
    0.5,
    min(10.0, float(os.environ.get("VEHICLE_CATALOG_DB_TIMEOUT_SECONDS", "2.0"))),
)
VEHICLE_CATALOG_CACHE_TTL_SECONDS = max(
    0,
    min(300, int(os.environ.get("VEHICLE_CATALOG_CACHE_TTL_SECONDS", "60"))),
)
_vehicle_catalog_cache: Dict[str, Dict[str, Any]] = {}


def _vehicle_collection(db: AsyncIOMotorDatabase):
    return db[CANONICAL_VEHICLES_COLLECTION]


def _to_plain_dict(value: Any) -> Any:
    if value is None:
        return None
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if hasattr(value, "dict"):
        return value.dict()
    if isinstance(value, dict):
        return {k: _to_plain_dict(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_plain_dict(item) for item in value]
    return value


def _vehicle_fare_config(vehicle_type_id: str, vehicle: Optional[dict] = None) -> Dict[str, Any]:
    stored_config = (vehicle or {}).get("fare_config")
    if isinstance(stored_config, dict) and stored_config:
        return _to_plain_dict(stored_config)

    return _to_plain_dict(
        FARE_CONFIGURATIONS.get(vehicle_type_id)
        or FARE_CONFIGURATIONS.get("taxi")
        or {}
    )


def _coverage_tokens(
    region: Optional[str] = None,
    district: Optional[str] = None,
    pincode: Optional[str] = None,
) -> List[str]:
    tokens: List[str] = []
    for value in (region, district, pincode):
        normalized = str(value or "").strip()
        if normalized:
            tokens.extend([normalized, normalized.lower()])
    return list(dict.fromkeys(tokens))


def _availability_query(
    active_only: bool = True,
    region: Optional[str] = None,
    district: Optional[str] = None,
    pincode: Optional[str] = None,
) -> Dict[str, Any]:
    query: Dict[str, Any] = {"active": True} if active_only else {}
    tokens = _coverage_tokens(region=region, district=district, pincode=pincode)
    if tokens:
        query["$or"] = [
            {"regions": {"$exists": False}},
            {"regions": {"$size": 0}},
            {"regions": "all"},
            {"regions": {"$in": tokens}},
        ]
    return query


def _catalog_cache_key(
    active_only: bool = True,
    region: Optional[str] = None,
    district: Optional[str] = None,
    pincode: Optional[str] = None,
) -> str:
    return "|".join([
        "1" if active_only else "0",
        str(region or "").strip().lower(),
        str(district or "").strip().lower(),
        str(pincode or "").strip().lower(),
    ])


def _clone_vehicle_rows(rows: List[dict]) -> List[dict]:
    return [dict(row) for row in rows]


def _get_cached_vehicle_catalog(cache_key: str) -> Optional[List[dict]]:
    cached = _vehicle_catalog_cache.get(cache_key)
    if not cached:
        return None
    if cached.get("expires_at", 0.0) <= time.monotonic():
        _vehicle_catalog_cache.pop(cache_key, None)
        return None
    rows = cached.get("rows")
    return _clone_vehicle_rows(rows) if isinstance(rows, list) else None


def _set_cached_vehicle_catalog(cache_key: str, rows: List[dict]) -> None:
    if VEHICLE_CATALOG_CACHE_TTL_SECONDS <= 0:
        return
    _vehicle_catalog_cache[cache_key] = {
        "expires_at": time.monotonic() + VEHICLE_CATALOG_CACHE_TTL_SECONDS,
        "rows": _clone_vehicle_rows(rows),
    }


def _clear_vehicle_catalog_cache() -> None:
    _vehicle_catalog_cache.clear()


def _matches_catalog_filters(
    vehicle: dict,
    active_only: bool = True,
    region: Optional[str] = None,
    district: Optional[str] = None,
    pincode: Optional[str] = None,
) -> bool:
    if active_only and not bool(vehicle.get("active", True)):
        return False
    tokens = [str(token or "").strip().lower() for token in _coverage_tokens(region, district, pincode)]
    tokens = [token for token in tokens if token]
    if not tokens:
        return True
    regions = vehicle.get("regions") or []
    region_values = {str(value or "").strip().lower() for value in regions if str(value or "").strip()}
    return not region_values or "all" in region_values or any(token in region_values for token in tokens)


def _default_vehicle_catalog(
    active_only: bool = True,
    region: Optional[str] = None,
    district: Optional[str] = None,
    pincode: Optional[str] = None,
) -> List[dict]:
    return [
        _serialize_vehicle(_seed_vehicle_doc(vehicle_data))
        for vehicle_data in CANONICAL_VEHICLE_TYPES
        if _matches_catalog_filters(vehicle_data, active_only, region, district, pincode)
    ]


async def _load_vehicle_catalog_from_db(db: AsyncIOMotorDatabase, query: Dict[str, Any]) -> List[dict]:
    if db is None:
        raise RuntimeError("Database is unavailable")
    cursor = _vehicle_collection(db).find(query)
    try:
        cursor = cursor.max_time_ms(int(VEHICLE_CATALOG_DB_TIMEOUT_SECONDS * 1000))
    except AttributeError:
        pass
    return await cursor.to_list(100)


def _serialize_vehicle(vehicle: dict) -> dict:
    created_at = vehicle.get("created_at") or get_ist_now()
    updated_at = vehicle.get("updated_at") or get_ist_now()
    vehicle_type_id = vehicle.get("vehicle_type_id")

    return {
        **{k: v for k, v in vehicle.items() if k != "_id"},
        "vehicle_type_id": vehicle_type_id,
        "name": vehicle.get("name") or str(vehicle_type_id or "Vehicle").title(),
        "name_ml": vehicle.get("name_ml"),
        "translations": vehicle.get("translations", {}),
        "icon": vehicle.get("icon") or "car",
        "description": vehicle.get("description") or "Vehicle service",
        "capacity": vehicle.get("capacity", 1),
        "capacity_unit": vehicle.get("capacity_unit", "passengers"),
        "base_multiplier": vehicle.get("base_multiplier", 1.0),
        "allowed_ride_types": vehicle.get("allowed_ride_types", []),
        "goods_supported": vehicle.get("goods_supported", False),
        "passenger_supported": vehicle.get("passenger_supported", True),
        "accessibility_support": vehicle.get("accessibility_support", False),
        "subtypes": vehicle.get("subtypes", []),
        "regions": vehicle.get("regions", ["all"]),
        "fare_config": _vehicle_fare_config(str(vehicle_type_id or ""), vehicle),
        "active": vehicle.get("active", True),
        "created_at": created_at.isoformat() if isinstance(created_at, datetime) else str(created_at),
        "updated_at": updated_at.isoformat() if isinstance(updated_at, datetime) else str(updated_at),
    }


def _seed_vehicle_doc(vehicle_data: dict) -> dict:
    now = get_ist_now()
    doc = dict(vehicle_data)
    doc["_id"] = doc["vehicle_type_id"]
    doc.setdefault("active", True)
    doc.setdefault("created_at", now)
    doc.setdefault("updated_at", now)
    return doc


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class VehicleTypeCreate(BaseModel):
    vehicle_type_id: str
    name: str
    name_ml: Optional[str] = None
    translations: Dict[str, Dict[str, str]] = Field(default_factory=dict)
    icon: str
    description: str
    capacity: int
    capacity_unit: str = "passengers"
    base_multiplier: float
    allowed_ride_types: List[str] = []
    goods_supported: bool = False
    passenger_supported: bool = True
    accessibility_support: bool = False
    subtypes: List[dict] = []
    regions: List[str] = []
    fare_config: Optional[Dict[str, Any]] = None


class VehicleTypeUpdate(BaseModel):
    name: Optional[str] = None
    name_ml: Optional[str] = None
    translations: Optional[Dict[str, Dict[str, str]]] = None
    icon: Optional[str] = None
    description: Optional[str] = None
    capacity: Optional[int] = None
    capacity_unit: Optional[str] = None
    base_multiplier: Optional[float] = None
    allowed_ride_types: Optional[List[str]] = None
    goods_supported: Optional[bool] = None
    passenger_supported: Optional[bool] = None
    accessibility_support: Optional[bool] = None
    active: Optional[bool] = None
    regions: Optional[List[str]] = None
    subtypes: Optional[List[dict]] = None
    fare_config: Optional[Dict[str, Any]] = None


class FareConfigUpdate(BaseModel):
    fare_config: Dict[str, Any]


class VehicleTypeResponse(BaseModel):
    vehicle_type_id: str
    name: str
    name_ml: Optional[str]
    translations: Dict[str, Dict[str, str]] = Field(default_factory=dict)
    icon: str
    description: str
    capacity: int
    capacity_unit: str
    base_multiplier: float
    allowed_ride_types: List[str]
    goods_supported: bool
    passenger_supported: bool
    accessibility_support: bool
    subtypes: List[dict]
    regions: List[str]
    fare_config: Dict[str, Any] = Field(default_factory=dict)
    active: bool
    created_at: str
    updated_at: str

    class Config:
        from_attributes = True


# ============================================================================
# INITIALIZATION
# ============================================================================

async def init_canonical_vehicles(db: AsyncIOMotorDatabase) -> None:
    """Initialize canonical vehicles in database on startup"""
    try:
        vehicles_collection = _vehicle_collection(db)
        existing_count = await vehicles_collection.count_documents({"vehicle_type_id": {"$exists": True}})

        if existing_count == 0:
            legacy_collection = db[LEGACY_CANONICAL_VEHICLES_COLLECTION]
            legacy_docs = await legacy_collection.find({
                "vehicle_type_id": {"$exists": True},
                "base_multiplier": {"$exists": True},
            }).to_list(None)

            for legacy_doc in legacy_docs:
                migrated_doc = {k: v for k, v in legacy_doc.items() if k != "_id"}
                migrated_doc = _seed_vehicle_doc(migrated_doc)
                await vehicles_collection.update_one(
                    {"vehicle_type_id": migrated_doc["vehicle_type_id"]},
                    {"$setOnInsert": migrated_doc},
                    upsert=True,
                )

            if legacy_docs:
                logger.info(
                    f"Migrated {len(legacy_docs)} canonical vehicle type docs to "
                    f"{CANONICAL_VEHICLES_COLLECTION}"
                )

        # Ensure every default canonical type exists without overwriting admin edits.
        for vehicle_data in CANONICAL_VEHICLE_TYPES:
            seed_doc = _seed_vehicle_doc(vehicle_data)
            await vehicles_collection.update_one(
                {"vehicle_type_id": seed_doc["vehicle_type_id"]},
                {"$setOnInsert": seed_doc},
                upsert=True,
            )

        await vehicles_collection.create_index("vehicle_type_id", unique=True)
        await vehicles_collection.create_index([("allowed_ride_types", 1), ("active", 1)])
        await vehicles_collection.create_index([("goods_supported", 1), ("active", 1)])

        total_count = await vehicles_collection.count_documents({"vehicle_type_id": {"$exists": True}})
        logger.info(f"Canonical vehicle catalog ready: {total_count} types")
    except Exception as e:
        logger.error(f"Error initializing vehicles: {str(e)}")
        raise


# ============================================================================
# PUBLIC ENDPOINTS
# ============================================================================

@router.get("/public/all", response_model=List[VehicleTypeResponse])
async def get_all_vehicles(
    active_only: bool = Query(True),
    region: Optional[str] = Query(None),
    district: Optional[str] = Query(None),
    pincode: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get all vehicle types (public endpoint)"""
    cache_key = _catalog_cache_key(active_only, region, district, pincode)
    cached_rows = _get_cached_vehicle_catalog(cache_key)
    if cached_rows is not None:
        return cached_rows

    try:
        query = _availability_query(
            active_only=active_only,
            region=region,
            district=district,
            pincode=pincode,
        )
        vehicles = await asyncio.wait_for(
            _load_vehicle_catalog_from_db(db, query),
            timeout=VEHICLE_CATALOG_DB_TIMEOUT_SECONDS,
        )
        rows = [_serialize_vehicle(v) for v in vehicles]
    except Exception as e:
        logger.warning(
            "Vehicle catalog DB lookup failed; returning canonical defaults: %s",
            str(e),
        )
        rows = _default_vehicle_catalog(active_only, region, district, pincode)

    _set_cached_vehicle_catalog(cache_key, rows)
    return rows


@router.get("/public/{vehicle_type_id}", response_model=VehicleTypeResponse)
async def get_vehicle(
    vehicle_type_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get specific vehicle type"""
    try:
        vehicle = await _vehicle_collection(db).find_one({"vehicle_type_id": vehicle_type_id})
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehicle type not found")
        
        return _serialize_vehicle(vehicle)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching vehicle: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/public/by-ride-type/{ride_type}", response_model=List[VehicleTypeResponse])
async def get_vehicles_by_ride_type(
    ride_type: str,
    region: Optional[str] = Query(None),
    district: Optional[str] = Query(None),
    pincode: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get vehicles supporting specific ride type"""
    try:
        query = _availability_query(
            active_only=True,
            region=region,
            district=district,
            pincode=pincode,
        )
        query["allowed_ride_types"] = ride_type
        vehicles = await _vehicle_collection(db).find(query).to_list(None)
        
        return [_serialize_vehicle(v) for v in vehicles]
    except Exception as e:
        logger.error(f"Error fetching vehicles by ride type: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/public/goods-only", response_model=List[VehicleTypeResponse])
async def get_goods_vehicles(
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get vehicles that support goods delivery"""
    try:
        vehicles = await _vehicle_collection(db).find({
            "goods_supported": True,
            "active": True
        }).to_list(None)
        
        return [_serialize_vehicle(v) for v in vehicles]
    except Exception as e:
        logger.error(f"Error fetching goods vehicles: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/public/multiplier/{vehicle_type_id}", response_model=dict)
async def get_multiplier(
    vehicle_type_id: str,
    subtype_id: Optional[str] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get fare multiplier for vehicle (supports subtype)"""
    try:
        vehicle = await _vehicle_collection(db).find_one({"vehicle_type_id": vehicle_type_id})
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehicle type not found")

        multiplier = vehicle.get("base_multiplier", 1.0)
        if subtype_id:
            for subtype in vehicle.get("subtypes", []):
                if subtype.get("id") == subtype_id:
                    multiplier = subtype.get("multiplier", multiplier)
                    break
        
        return {
            "vehicle_type_id": vehicle_type_id,
            "subtype_id": subtype_id,
            "multiplier": multiplier
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting multiplier: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/public/capacity/{vehicle_type_id}", response_model=dict)
async def get_capacity(
    vehicle_type_id: str,
    subtype_id: Optional[str] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get capacity for vehicle (supports subtype)"""
    try:
        vehicle = await _vehicle_collection(db).find_one({"vehicle_type_id": vehicle_type_id})
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehicle type not found")
        
        capacity = vehicle.get("capacity", 1)
        if subtype_id:
            for subtype in vehicle.get("subtypes", []):
                if subtype.get("id") == subtype_id and subtype.get("capacity"):
                    capacity = subtype.get("capacity")
                    break
        capacity_unit = vehicle.get("capacity_unit", "passengers")
        
        return {
            "vehicle_type_id": vehicle_type_id,
            "subtype_id": subtype_id,
            "capacity": capacity,
            "capacity_unit": capacity_unit
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting capacity: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# RIDE-TYPE COMPATIBILITY ENDPOINTS
# ============================================================================

@router.get("/public/compatibility/by-ride-type", response_model=dict)
async def get_ride_type_vehicles(
    ride_type: str = Query(..., description="Ride type: instant|scheduled|rental|airport|corporate|intercity|ev_auto|tourism|goods|pet"),
    region: Optional[str] = Query(None),
    district: Optional[str] = Query(None),
    pincode: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get all compatible vehicles for a ride type"""
    try:
        if ride_type not in RIDE_TYPE_COMPATIBILITY:
            raise HTTPException(status_code=400, detail=f"Unknown ride type: {ride_type}")
        
        query = _availability_query(
            active_only=True,
            region=region,
            district=district,
            pincode=pincode,
        )
        query["allowed_ride_types"] = ride_type
        vehicle_docs = await _vehicle_collection(db).find(query).to_list(None)
        compatible_vehicles = [v.get("vehicle_type_id") for v in vehicle_docs if v.get("vehicle_type_id")]
        compatibility_info = RIDE_TYPE_COMPATIBILITY[ride_type]
        
        return {
            "ride_type": ride_type,
            "description": compatibility_info.get("description"),
            "compatible_vehicles": compatible_vehicles,
            "ride_type_multiplier": get_ride_type_multiplier(ride_type),
            "fare_type": compatibility_info.get("fare_type", "distance_based"),
            "special_fields": compatibility_info.get("special_fields", []),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting ride type vehicles: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/public/compatibility/check", response_model=dict)
async def check_vehicle_compatibility(
    vehicle_type_id: str = Query(...),
    ride_type: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Check if vehicle type supports specific ride type"""
    try:
        vehicle = await _vehicle_collection(db).find_one({"vehicle_type_id": vehicle_type_id})
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehicle type not found")

        is_compatible = ride_type in vehicle.get("allowed_ride_types", [])
        
        if not is_compatible:
            return {
                "vehicle_type_id": vehicle_type_id,
                "ride_type": ride_type,
                "compatible": False,
                "reason": f"Vehicle {vehicle_type_id} does not support {ride_type} rides"
            }
        
        multiplier = get_ride_type_multiplier(ride_type)
        
        return {
            "vehicle_type_id": vehicle_type_id,
            "ride_type": ride_type,
            "compatible": True,
            "ride_type_multiplier": multiplier,
            "special_fields": RIDE_TYPE_COMPATIBILITY.get(ride_type, {}).get("special_fields", [])
        }
    except Exception as e:
        logger.error(f"Error checking compatibility: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/public/fare-config/{vehicle_type_id}", response_model=dict)
async def get_fare_config(
    vehicle_type_id: str,
    ride_type: Optional[str] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get fare configuration for vehicle (optionally filtered by ride type)"""
    try:
        vehicle = await _vehicle_collection(db).find_one({"vehicle_type_id": vehicle_type_id})
        if not vehicle and vehicle_type_id not in FARE_CONFIGURATIONS:
            raise HTTPException(status_code=404, detail=f"No fare config for vehicle {vehicle_type_id}")

        vehicle_config = _vehicle_fare_config(vehicle_type_id, vehicle)
        
        if ride_type:
            if ride_type not in vehicle_config:
                raise HTTPException(status_code=400, detail=f"Vehicle {vehicle_type_id} does not support {ride_type}")
            
            ride_config = vehicle_config[ride_type]
            if ride_config is None:
                raise HTTPException(status_code=400, detail=f"Vehicle {vehicle_type_id} does not support {ride_type}")
            
            return {
                "vehicle_type_id": vehicle_type_id,
                "ride_type": ride_type,
                "fare_config": _to_plain_dict(ride_config)
            }
        
        return {
            "vehicle_type_id": vehicle_type_id,
            "fare_config": _to_plain_dict(vehicle_config)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting fare config: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ADMIN ENDPOINTS
# ============================================================================

@router.post("/admin/create", response_model=VehicleTypeResponse, dependencies=[Depends(require_roles("admin"))])
async def create_vehicle(
    payload: VehicleTypeCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user = Depends(get_current_user_secure)
):
    """Create new vehicle type (admin only)"""
    try:
        # Check if already exists
        existing = await _vehicle_collection(db).find_one({"vehicle_type_id": payload.vehicle_type_id})
        if existing:
            raise HTTPException(status_code=400, detail="Vehicle type already exists")
        
        vehicle_data = payload.dict(exclude_unset=True)
        vehicle_data["_id"] = payload.vehicle_type_id
        vehicle_data["active"] = True
        vehicle_data["created_at"] = get_ist_now()
        vehicle_data["updated_at"] = get_ist_now()
        
        await _vehicle_collection(db).insert_one(vehicle_data)
        _clear_vehicle_catalog_cache()
        
        logger.info(f"Created vehicle type: {payload.vehicle_type_id}")
        return _serialize_vehicle(vehicle_data)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating vehicle: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/admin/{vehicle_type_id}", response_model=VehicleTypeResponse, dependencies=[Depends(require_roles("admin"))])
async def update_vehicle(
    vehicle_type_id: str,
    payload: VehicleTypeUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user = Depends(get_current_user_secure)
):
    """Update vehicle type (admin only)"""
    try:
        vehicle = await _vehicle_collection(db).find_one({"vehicle_type_id": vehicle_type_id})
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehicle type not found")
        
        update_data = {k: v for k, v in payload.dict(exclude_unset=True).items() if v is not None}
        update_data["updated_at"] = get_ist_now()
        
        await _vehicle_collection(db).update_one(
            {"vehicle_type_id": vehicle_type_id},
            {"$set": update_data}
        )
        _clear_vehicle_catalog_cache()
        
        updated = await _vehicle_collection(db).find_one({"vehicle_type_id": vehicle_type_id})
        logger.info(f"Updated vehicle type: {vehicle_type_id}")
        
        return _serialize_vehicle(updated)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating vehicle: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/admin/{vehicle_type_id}/fare-config", response_model=dict, dependencies=[Depends(require_roles("admin"))])
async def update_vehicle_fare_config(
    vehicle_type_id: str,
    payload: FareConfigUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user = Depends(get_current_user_secure),
):
    """Persist fare configuration for a canonical vehicle type."""
    try:
        vehicle = await _vehicle_collection(db).find_one({"vehicle_type_id": vehicle_type_id})
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehicle type not found")

        fare_config = _to_plain_dict(payload.fare_config)
        await _vehicle_collection(db).update_one(
            {"vehicle_type_id": vehicle_type_id},
            {"$set": {"fare_config": fare_config, "updated_at": get_ist_now()}},
        )
        _clear_vehicle_catalog_cache()

        return {
            "status": "success",
            "vehicle_type_id": vehicle_type_id,
            "fare_config": fare_config,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating fare config: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/admin/{vehicle_type_id}", dependencies=[Depends(require_roles("admin"))])
async def delete_vehicle(
    vehicle_type_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user = Depends(get_current_user_secure)
):
    """Delete/disable vehicle type (admin only)"""
    try:
        vehicle = await _vehicle_collection(db).find_one({"vehicle_type_id": vehicle_type_id})
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehicle type not found")
        
        # Soft delete - mark as inactive
        await _vehicle_collection(db).update_one(
            {"vehicle_type_id": vehicle_type_id},
            {"$set": {"active": False, "updated_at": get_ist_now()}}
        )
        _clear_vehicle_catalog_cache()
        
        logger.info(f"Disabled vehicle type: {vehicle_type_id}")
        return {"message": "Vehicle type disabled"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting vehicle: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
