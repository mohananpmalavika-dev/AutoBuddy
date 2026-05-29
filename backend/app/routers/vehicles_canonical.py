"""
Canonical Vehicles API Router - Single unified API for all vehicle operations
Replaces: vehicle_types.py, vehicle_types_extended.py, etc.
"""

from fastapi import APIRouter, Depends, HTTPException, status, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from bson import ObjectId
import logging

from app.db.deps import get_db
from app.utils.rbac import require_roles, get_current_user_secure
from app.models.canonical_vehicle_model import (
    CanonicalVehicleType,
    CANONICAL_VEHICLE_TYPES,
    get_vehicle_by_id,
    get_vehicle_multiplier,
    get_vehicle_capacity,
    supports_ride_type,
    get_goods_carrying_vehicles,
    get_passenger_vehicles,
)
from app.models.ride_type_compatibility import (
    get_compatible_vehicles,
    is_vehicle_compatible_with_ride_type,
    get_ride_type_multiplier,
    RIDE_TYPE_COMPATIBILITY,
    FARE_CONFIGURATIONS,
)

router = APIRouter(prefix="/api/vehicles", tags=["canonical_vehicles"])
logger = logging.getLogger(__name__)


# ============================================================================
# PYDANTIC MODELS
# ============================================================================

class VehicleTypeCreate(BaseModel):
    vehicle_type_id: str
    name: str
    name_ml: Optional[str] = None
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


class VehicleTypeUpdate(BaseModel):
    name: Optional[str] = None
    name_ml: Optional[str] = None
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


class VehicleTypeResponse(BaseModel):
    vehicle_type_id: str
    name: str
    name_ml: Optional[str]
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
        # Check if already initialized
        count = await db.vehicles.count_documents({"active": {"$in": [True, False]}})
        if count > 0:
            logger.info(f"✓ Vehicles collection already has {count} types")
            return
        
        # Insert canonical vehicle types
        for vehicle_data in CANONICAL_VEHICLE_TYPES:
            vehicle_data["_id"] = vehicle_data["vehicle_type_id"]
            await db.vehicles.insert_one(vehicle_data)
        
        # Create indexes
        await db.vehicles.create_index("_id", unique=True)
        await db.vehicles.create_index("vehicle_type_id", unique=True)
        await db.vehicles.create_index([("allowed_ride_types", 1), ("active", 1)])
        await db.vehicles.create_index([("goods_supported", 1), ("active", 1)])
        
        logger.info(f"✓ Initialized {len(CANONICAL_VEHICLE_TYPES)} canonical vehicle types")
    except Exception as e:
        logger.error(f"Error initializing vehicles: {str(e)}")
        raise


# ============================================================================
# PUBLIC ENDPOINTS
# ============================================================================

@router.get("/public/all", response_model=List[VehicleTypeResponse])
async def get_all_vehicles(
    active_only: bool = Query(True),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get all vehicle types (public endpoint)"""
    try:
        query = {"active": True} if active_only else {}
        vehicles = await db.vehicles.find(query).to_list(None)
        
        return [
            {
                **{k: v for k, v in v.items() if k != "_id"},
                "vehicle_type_id": v.get("vehicle_type_id"),
                "created_at": v.get("created_at", datetime.utcnow()).isoformat(),
                "updated_at": v.get("updated_at", datetime.utcnow()).isoformat(),
            }
            for v in vehicles
        ]
    except Exception as e:
        logger.error(f"Error fetching vehicles: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/public/{vehicle_type_id}", response_model=VehicleTypeResponse)
async def get_vehicle(
    vehicle_type_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get specific vehicle type"""
    try:
        vehicle = await db.vehicles.find_one({"vehicle_type_id": vehicle_type_id})
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehicle type not found")
        
        return {
            **{k: v for k, v in vehicle.items() if k != "_id"},
            "vehicle_type_id": vehicle.get("vehicle_type_id"),
            "created_at": vehicle.get("created_at", datetime.utcnow()).isoformat(),
            "updated_at": vehicle.get("updated_at", datetime.utcnow()).isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching vehicle: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/public/by-ride-type/{ride_type}", response_model=List[VehicleTypeResponse])
async def get_vehicles_by_ride_type(
    ride_type: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get vehicles supporting specific ride type"""
    try:
        vehicles = await db.vehicles.find({
            "allowed_ride_types": ride_type,
            "active": True
        }).to_list(None)
        
        return [
            {
                **{k: v for k, v in v.items() if k != "_id"},
                "vehicle_type_id": v.get("vehicle_type_id"),
                "created_at": v.get("created_at", datetime.utcnow()).isoformat(),
                "updated_at": v.get("updated_at", datetime.utcnow()).isoformat(),
            }
            for v in vehicles
        ]
    except Exception as e:
        logger.error(f"Error fetching vehicles by ride type: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/public/goods-only", response_model=List[VehicleTypeResponse])
async def get_goods_vehicles(
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get vehicles that support goods delivery"""
    try:
        vehicles = await db.vehicles.find({
            "goods_supported": True,
            "active": True
        }).to_list(None)
        
        return [
            {
                **{k: v for k, v in v.items() if k != "_id"},
                "vehicle_type_id": v.get("vehicle_type_id"),
                "created_at": v.get("created_at", datetime.utcnow()).isoformat(),
                "updated_at": v.get("updated_at", datetime.utcnow()).isoformat(),
            }
            for v in vehicles
        ]
    except Exception as e:
        logger.error(f"Error fetching goods vehicles: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/public/multiplier/{vehicle_type_id}", response_model=dict)
async def get_multiplier(
    vehicle_type_id: str,
    subtype_id: Optional[str] = None
):
    """Get fare multiplier for vehicle (supports subtype)"""
    try:
        multiplier = get_vehicle_multiplier(vehicle_type_id, subtype_id)
        if multiplier == 1.0 and not get_vehicle_by_id(vehicle_type_id):
            raise HTTPException(status_code=404, detail="Vehicle type not found")
        
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
    subtype_id: Optional[str] = None
):
    """Get capacity for vehicle (supports subtype)"""
    try:
        capacity = get_vehicle_capacity(vehicle_type_id, subtype_id)
        if capacity == 1 and not get_vehicle_by_id(vehicle_type_id):
            raise HTTPException(status_code=404, detail="Vehicle type not found")
        
        vehicle = get_vehicle_by_id(vehicle_type_id)
        capacity_unit = "passengers" if not vehicle else vehicle.get("capacity_unit", "passengers")
        
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
async def get_ride_type_vehicles(ride_type: str = Query(..., description="Ride type: instant|scheduled|rental|airport|corporate|tourism|goods")):
    """Get all compatible vehicles for a ride type"""
    try:
        if ride_type not in RIDE_TYPE_COMPATIBILITY:
            raise HTTPException(status_code=400, detail=f"Unknown ride type: {ride_type}")
        
        compatible_vehicles = get_compatible_vehicles(ride_type)
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
    ride_type: str = Query(...)
):
    """Check if vehicle type supports specific ride type"""
    try:
        is_compatible = is_vehicle_compatible_with_ride_type(vehicle_type_id, ride_type)
        
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
            "special_fields": RIDE_TYPE_COMPATIBILITY[ride_type].get("special_fields", [])
        }
    except Exception as e:
        logger.error(f"Error checking compatibility: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/public/fare-config/{vehicle_type_id}", response_model=dict)
async def get_fare_config(
    vehicle_type_id: str,
    ride_type: Optional[str] = None
):
    """Get fare configuration for vehicle (optionally filtered by ride type)"""
    try:
        if vehicle_type_id not in FARE_CONFIGURATIONS:
            raise HTTPException(status_code=404, detail=f"No fare config for vehicle {vehicle_type_id}")
        
        vehicle_config = FARE_CONFIGURATIONS[vehicle_type_id]
        
        if ride_type:
            if ride_type not in vehicle_config:
                raise HTTPException(status_code=400, detail=f"Vehicle {vehicle_type_id} does not support {ride_type}")
            
            ride_config = vehicle_config[ride_type]
            if ride_config is None:
                raise HTTPException(status_code=400, detail=f"Vehicle {vehicle_type_id} does not support {ride_type}")
            
            return {
                "vehicle_type_id": vehicle_type_id,
                "ride_type": ride_type,
                "fare_config": ride_config
            }
        
        return {
            "vehicle_type_id": vehicle_type_id,
            "fare_config": vehicle_config
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting fare config: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ADMIN ENDPOINTS
# ============================================================================

@router.post("/admin/create", response_model=VehicleTypeResponse, dependencies=[Depends(require_roles(["admin"]))])
async def create_vehicle(
    payload: VehicleTypeCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user = Depends(get_current_user_secure)
):
    """Create new vehicle type (admin only)"""
    try:
        # Check if already exists
        existing = await db.vehicles.find_one({"vehicle_type_id": payload.vehicle_type_id})
        if existing:
            raise HTTPException(status_code=400, detail="Vehicle type already exists")
        
        vehicle_data = payload.dict(exclude_unset=True)
        vehicle_data["_id"] = payload.vehicle_type_id
        vehicle_data["active"] = True
        vehicle_data["created_at"] = datetime.utcnow()
        vehicle_data["updated_at"] = datetime.utcnow()
        
        await db.vehicles.insert_one(vehicle_data)
        
        logger.info(f"Created vehicle type: {payload.vehicle_type_id}")
        return vehicle_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating vehicle: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/admin/{vehicle_type_id}", response_model=VehicleTypeResponse, dependencies=[Depends(require_roles(["admin"]))])
async def update_vehicle(
    vehicle_type_id: str,
    payload: VehicleTypeUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user = Depends(get_current_user_secure)
):
    """Update vehicle type (admin only)"""
    try:
        vehicle = await db.vehicles.find_one({"vehicle_type_id": vehicle_type_id})
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehicle type not found")
        
        update_data = {k: v for k, v in payload.dict(exclude_unset=True).items() if v is not None}
        update_data["updated_at"] = datetime.utcnow()
        
        await db.vehicles.update_one(
            {"vehicle_type_id": vehicle_type_id},
            {"$set": update_data}
        )
        
        updated = await db.vehicles.find_one({"vehicle_type_id": vehicle_type_id})
        logger.info(f"Updated vehicle type: {vehicle_type_id}")
        
        return {
            **{k: v for k, v in updated.items() if k != "_id"},
            "vehicle_type_id": updated.get("vehicle_type_id"),
            "created_at": updated.get("created_at", datetime.utcnow()).isoformat(),
            "updated_at": updated.get("updated_at", datetime.utcnow()).isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating vehicle: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/admin/{vehicle_type_id}", dependencies=[Depends(require_roles(["admin"]))])
async def delete_vehicle(
    vehicle_type_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user = Depends(get_current_user_secure)
):
    """Delete/disable vehicle type (admin only)"""
    try:
        vehicle = await db.vehicles.find_one({"vehicle_type_id": vehicle_type_id})
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehicle type not found")
        
        # Soft delete - mark as inactive
        await db.vehicles.update_one(
            {"vehicle_type_id": vehicle_type_id},
            {"$set": {"active": False, "updated_at": datetime.utcnow()}}
        )
        
        logger.info(f"Disabled vehicle type: {vehicle_type_id}")
        return {"message": "Vehicle type disabled"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting vehicle: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
