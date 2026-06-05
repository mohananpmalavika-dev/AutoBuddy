"""
Vehicle Types Management Router
Manages vehicle type definitions (2-wheeler, auto, bus, truck, etc.)
"""
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from typing import List, Optional
from bson import ObjectId
import logging

from app.db.deps import get_db
from app.utils.rbac import require_roles, get_current_user_secure

router = APIRouter(prefix="/api/admin/vehicle-types", tags=["admin_vehicle_types"])
logger = logging.getLogger(__name__)


class VehicleTypeCreate(BaseModel):
    vehicle_type_id: str = Field(..., min_length=1, max_length=50)
    name: str = Field(..., min_length=1, max_length=100)
    name_ml: str = Field(..., min_length=1, max_length=100)
    capacity: int = Field(..., ge=1, le=100)
    icon: str = Field(..., max_length=10)
    base_multiplier: float = Field(..., ge=0.1, le=5.0)
    description: str = Field(..., min_length=1, max_length=200)


class VehicleTypeUpdate(BaseModel):
    name: Optional[str] = None
    name_ml: Optional[str] = None
    capacity: Optional[int] = None
    icon: Optional[str] = None
    base_multiplier: Optional[float] = None
    description: Optional[str] = None
    active: Optional[bool] = None


class VehicleTypeResponse(BaseModel):
    id: str
    vehicle_type_id: str
    name: str
    name_ml: str
    capacity: int
    icon: str
    base_multiplier: float
    description: str
    active: bool
    created_at: str
    updated_at: str


# Default vehicle types
DEFAULT_VEHICLE_TYPES = [
    {
        "vehicle_type_id": "2_wheeler",
        "name": "2-Wheeler",
        "name_ml": "2-ചക്രം",
        "capacity": 1,
        "icon": "🏍️",
        "base_multiplier": 0.5,
        "description": "Bike/Motorcycle"
    },
    {
        "vehicle_type_id": "3_wheeler",
        "name": "3-Wheeler",
        "name_ml": "3-ചക്രം",
        "capacity": 2,
        "icon": "🛵",
        "base_multiplier": 0.7,
        "description": "Auto Rickshaw"
    },
    {
        "vehicle_type_id": "4_wheeler",
        "name": "4-Wheeler",
        "name_ml": "4-ചക്രം",
        "capacity": 4,
        "icon": "🚗",
        "base_multiplier": 1.0,
        "description": "Car"
    },
    {
        "vehicle_type_id": "6_wheeler",
        "name": "6-Wheeler",
        "name_ml": "6-ചക്രം",
        "capacity": 8,
        "icon": "🚐",
        "base_multiplier": 1.3,
        "description": "Mini Bus"
    },
    {
        "vehicle_type_id": "7_wheeler",
        "name": "7-Wheeler",
        "name_ml": "7-ചക്രം",
        "capacity": 13,
        "icon": "🚌",
        "base_multiplier": 1.5,
        "description": "Van"
    },
    {
        "vehicle_type_id": "bus",
        "name": "Bus",
        "name_ml": "ബസ്",
        "capacity": 45,
        "icon": "🚌",
        "base_multiplier": 1.8,
        "description": "Full-Size Bus"
    },
    {
        "vehicle_type_id": "traveller",
        "name": "Traveller",
        "name_ml": "ട്രാവെലർ",
        "capacity": 16,
        "icon": "🚐",
        "base_multiplier": 1.6,
        "description": "Travel Van"
    },
    {
        "vehicle_type_id": "truck",
        "name": "Truck",
        "name_ml": "ട്രക്ക്",
        "capacity": 2,
        "icon": "🚚",
        "base_multiplier": 1.4,
        "description": "Commercial Truck"
    }
]


async def init_default_vehicle_types(db: AsyncIOMotorDatabase):
    """Initialize default vehicle types if not already present"""
    collection = db["vehicle_types"]
    
    for vehicle_type in DEFAULT_VEHICLE_TYPES:
        existing = await collection.find_one({"vehicle_type_id": vehicle_type["vehicle_type_id"]})
        if not existing:
            vehicle_type_doc = {
                **vehicle_type,
                "active": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat()
            }
            await collection.insert_one(vehicle_type_doc)
            logger.info(f"Created default vehicle type: {vehicle_type['vehicle_type_id']}")


@router.get("/", dependencies=[Depends(require_roles("admin"))])
async def list_vehicle_types(
    db: AsyncIOMotorDatabase = Depends(get_db),
    active_only: bool = False
):
    """List all vehicle types"""
    collection = db["vehicle_types"]
    
    filter_query = {"active": True} if active_only else {}
    vehicle_types = await collection.find(filter_query).sort("created_at", 1).to_list(None)
    
    return [
        VehicleTypeResponse(
            id=str(vt["_id"]),
            vehicle_type_id=vt["vehicle_type_id"],
            name=vt["name"],
            name_ml=vt["name_ml"],
            capacity=vt["capacity"],
            icon=vt["icon"],
            base_multiplier=vt["base_multiplier"],
            description=vt["description"],
            active=vt.get("active", True),
            created_at=vt.get("created_at", ""),
            updated_at=vt.get("updated_at", "")
        )
        for vt in vehicle_types
    ]


@router.get("/public/all")
async def get_public_vehicle_types(db: AsyncIOMotorDatabase = Depends(get_db)):
    """Get all active vehicle types (public endpoint for passenger/driver apps)"""
    collection = db["vehicle_types"]
    vehicle_types = await collection.find({"active": True}).sort("created_at", 1).to_list(None)
    
    return [
        {
            "id": vt["vehicle_type_id"],
            "name": vt["name"],
            "name_ml": vt["name_ml"],
            "capacity": vt["capacity"],
            "icon": vt["icon"],
            "base_multiplier": vt["base_multiplier"],
            "description": vt["description"]
        }
        for vt in vehicle_types
    ]


@router.post("/", dependencies=[Depends(require_roles("admin"))])
async def create_vehicle_type(
    vehicle_type: VehicleTypeCreate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure)
):
    """Create a new vehicle type"""
    collection = db["vehicle_types"]
    
    # Check if vehicle type ID already exists
    existing = await collection.find_one({"vehicle_type_id": vehicle_type.vehicle_type_id})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Vehicle type with ID '{vehicle_type.vehicle_type_id}' already exists"
        )
    
    vehicle_type_doc = {
        **vehicle_type.model_dump(),
        "active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "created_by": str(current_user.get("id", ""))
    }
    
    result = await collection.insert_one(vehicle_type_doc)
    
    vehicle_type_doc["_id"] = result.inserted_id
    return VehicleTypeResponse(
        id=str(result.inserted_id),
        **{k: v for k, v in vehicle_type_doc.items() if k != "_id"}
    )


@router.get("/{vehicle_type_id}", dependencies=[Depends(require_roles("admin"))])
async def get_vehicle_type(
    vehicle_type_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """Get a specific vehicle type"""
    collection = db["vehicle_types"]
    
    # Try to find by MongoDB ID first
    try:
        vehicle_type = await collection.find_one({"_id": ObjectId(vehicle_type_id)})
    except:
        # Fall back to vehicle_type_id field
        vehicle_type = await collection.find_one({"vehicle_type_id": vehicle_type_id})
    
    if not vehicle_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle type not found"
        )
    
    return VehicleTypeResponse(
        id=str(vehicle_type["_id"]),
        vehicle_type_id=vehicle_type["vehicle_type_id"],
        name=vehicle_type["name"],
        name_ml=vehicle_type["name_ml"],
        capacity=vehicle_type["capacity"],
        icon=vehicle_type["icon"],
        base_multiplier=vehicle_type["base_multiplier"],
        description=vehicle_type["description"],
        active=vehicle_type.get("active", True),
        created_at=vehicle_type.get("created_at", ""),
        updated_at=vehicle_type.get("updated_at", "")
    )


@router.put("/{vehicle_type_id}", dependencies=[Depends(require_roles("admin"))])
async def update_vehicle_type(
    vehicle_type_id: str,
    update_data: VehicleTypeUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure)
):
    """Update a vehicle type"""
    collection = db["vehicle_types"]
    
    # Find the vehicle type
    try:
        vehicle_type = await collection.find_one({"_id": ObjectId(vehicle_type_id)})
    except:
        vehicle_type = await collection.find_one({"vehicle_type_id": vehicle_type_id})
    
    if not vehicle_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle type not found"
        )
    
    update_dict = update_data.model_dump(exclude_unset=True)
    update_dict["updated_at"] = datetime.now(timezone.utc).isoformat()
    update_dict["updated_by"] = str(current_user.get("id", ""))
    
    result = await collection.update_one(
        {"_id": ObjectId(str(vehicle_type["_id"]))},
        {"$set": update_dict}
    )
    
    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to update vehicle type"
        )
    
    # Return updated document
    updated = await collection.find_one({"_id": vehicle_type["_id"]})
    return VehicleTypeResponse(
        id=str(updated["_id"]),
        vehicle_type_id=updated["vehicle_type_id"],
        name=updated["name"],
        name_ml=updated["name_ml"],
        capacity=updated["capacity"],
        icon=updated["icon"],
        base_multiplier=updated["base_multiplier"],
        description=updated["description"],
        active=updated.get("active", True),
        created_at=updated.get("created_at", ""),
        updated_at=updated.get("updated_at", "")
    )


@router.delete("/{vehicle_type_id}", dependencies=[Depends(require_roles("admin"))])
async def delete_vehicle_type(
    vehicle_type_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure)
):
    """Soft delete a vehicle type (mark as inactive)"""
    collection = db["vehicle_types"]
    
    # Find the vehicle type
    try:
        vehicle_type = await collection.find_one({"_id": ObjectId(vehicle_type_id)})
    except:
        vehicle_type = await collection.find_one({"vehicle_type_id": vehicle_type_id})
    
    if not vehicle_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle type not found"
        )
    
    update_dict = {
        "active": False,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": str(current_user.get("id", ""))
    }
    
    result = await collection.update_one(
        {"_id": ObjectId(str(vehicle_type["_id"]))},
        {"$set": update_dict}
    )
    
    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to delete vehicle type"
        )
    
    return {"message": "Vehicle type deleted successfully", "vehicle_type_id": vehicle_type_id}


@router.post("/{vehicle_type_id}/activate", dependencies=[Depends(require_roles("admin"))])
async def activate_vehicle_type(
    vehicle_type_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_user: dict = Depends(get_current_user_secure)
):
    """Activate a vehicle type"""
    collection = db["vehicle_types"]
    
    try:
        vehicle_type = await collection.find_one({"_id": ObjectId(vehicle_type_id)})
    except:
        vehicle_type = await collection.find_one({"vehicle_type_id": vehicle_type_id})
    
    if not vehicle_type:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle type not found"
        )
    
    update_dict = {
        "active": True,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": str(current_user.get("id", ""))
    }
    
    await collection.update_one(
        {"_id": ObjectId(str(vehicle_type["_id"]))},
        {"$set": update_dict}
    )
    
    return {"message": "Vehicle type activated successfully", "vehicle_type_id": vehicle_type_id}
