"""
Enhanced Vehicle Types Router - API Endpoints for Vehicle Type Management
Supports vehicle subtypes and regional availability
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import JSONResponse
from typing import List, Optional
from datetime import datetime
from app.utils.time_helpers import get_ist_now
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.models.vehicle_subtypes_model import VehicleTypeExtended, EXTENDED_VEHICLE_TYPES
from app.db.database import get_db

router = APIRouter(prefix="/api/admin/vehicle-types", tags=["vehicle-types"])

async def init_default_vehicle_types_extended(db: AsyncIOMotorDatabase):
    """Initialize default vehicle types with subtypes in database"""
    try:
        collection = db["vehicle_types"]
        
        # Check if vehicle types already exist
        count = await collection.count_documents({})
        if count > 0:
            return
        
        # Insert extended vehicle types
        await collection.insert_many(EXTENDED_VEHICLE_TYPES)
        print("✅ Extended vehicle types initialized")
    except Exception as e:
        print(f"⚠️ Error initializing vehicle types: {e}")
        raise

@router.get("/public/all")
async def get_all_vehicle_types(db: AsyncIOMotorDatabase = Depends(get_db)):
    """
    Fetch all active vehicle types with subtypes
    
    Returns list of vehicle types with their subtypes, multipliers, and regional availability
    """
    try:
        collection = db["vehicle_types"]
        
        # Fetch active vehicle types
        vehicle_types = await collection.find({"active": True}).to_list(None)
        
        # Remove MongoDB _id field
        for vt in vehicle_types:
            vt.pop("_id", None)
        
        return {
            "status": "success",
            "data": vehicle_types,
            "count": len(vehicle_types)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching vehicle types: {str(e)}")

@router.get("/public/{vehicle_type_id}")
async def get_vehicle_type(
    vehicle_type_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Fetch a specific vehicle type by ID with its subtypes
    """
    try:
        collection = db["vehicle_types"]
        
        vehicle_type = await collection.find_one({"_id": vehicle_type_id, "active": True})
        
        if not vehicle_type:
            raise HTTPException(status_code=404, detail="Vehicle type not found")
        
        vehicle_type.pop("_id", None)
        
        return {
            "status": "success",
            "data": vehicle_type
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/public/filter/ride-compatible")
async def get_vehicle_types_for_ride(
    ride_type_id: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Get vehicle types compatible with a specific ride type
    """
    try:
        # First, get the ride type to see its allowed vehicles
        ride_collection = db["ride_types"]
        ride_type = await ride_collection.find_one({"_id": ride_type_id, "active": True})
        
        if not ride_type:
            raise HTTPException(status_code=404, detail="Ride type not found")
        
        allowed_vehicles = ride_type.get("allowed_vehicle_types", [])
        
        # Get vehicle types that are in the allowed list
        vehicle_collection = db["vehicle_types"]
        vehicle_types = await vehicle_collection.find({
            "_id": {"$in": allowed_vehicles},
            "active": True
        }).to_list(None)
        
        for vt in vehicle_types:
            vt.pop("_id", None)
        
        return {
            "status": "success",
            "data": vehicle_types,
            "count": len(vehicle_types)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/create")
async def create_vehicle_type(
    vehicle_type_data: dict,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Admin: Create a new vehicle type with subtypes
    """
    try:
        collection = db["vehicle_types"]
        
        # Validate required fields
        required_fields = ["id", "name", "icon", "base_multiplier"]
        for field in required_fields:
            if field not in vehicle_type_data:
                raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
        
        # Set defaults
        vehicle_type_data.setdefault("description", "")
        vehicle_type_data.setdefault("subtypes", [])
        vehicle_type_data.setdefault("active", True)
        vehicle_type_data.setdefault("regions", ["all"])
        vehicle_type_data["created_at"] = get_ist_now()
        vehicle_type_data["updated_at"] = get_ist_now()
        
        # Use id as _id
        vehicle_type_data["_id"] = vehicle_type_data.pop("id")
        
        result = await collection.insert_one(vehicle_type_data)
        
        if not result.inserted_id:
            raise HTTPException(status_code=500, detail="Failed to create vehicle type")
        
        return {
            "status": "success",
            "message": "Vehicle type created",
            "id": result.inserted_id
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/admin/update/{vehicle_type_id}")
async def update_vehicle_type(
    vehicle_type_id: str,
    update_data: dict,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Admin: Update a vehicle type and/or its subtypes
    """
    try:
        collection = db["vehicle_types"]
        
        update_data["updated_at"] = get_ist_now()
        
        result = await collection.update_one(
            {"_id": vehicle_type_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Vehicle type not found")
        
        return {
            "status": "success",
            "message": "Vehicle type updated"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/{vehicle_type_id}/add-subtype")
async def add_vehicle_subtype(
    vehicle_type_id: str,
    subtype_data: dict,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Admin: Add a new subtype to an existing vehicle type
    """
    try:
        collection = db["vehicle_types"]
        
        # Validate subtype data
        if "id" not in subtype_data or "name" not in subtype_data or "multiplier" not in subtype_data:
            raise HTTPException(status_code=400, detail="Subtype must have id, name, and multiplier")
        
        result = await collection.update_one(
            {"_id": vehicle_type_id},
            {
                "$push": {"subtypes": subtype_data},
                "$set": {"updated_at": get_ist_now()}
            }
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Vehicle type not found")
        
        return {
            "status": "success",
            "message": "Subtype added"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/admin/{vehicle_type_id}/delete-subtype/{subtype_id}")
async def remove_vehicle_subtype(
    vehicle_type_id: str,
    subtype_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Admin: Remove a subtype from a vehicle type
    """
    try:
        collection = db["vehicle_types"]
        
        result = await collection.update_one(
            {"_id": vehicle_type_id},
            {
                "$pull": {"subtypes": {"id": subtype_id}},
                "$set": {"updated_at": get_ist_now()}
            }
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Vehicle type not found")
        
        return {
            "status": "success",
            "message": "Subtype removed"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/admin/delete/{vehicle_type_id}")
async def delete_vehicle_type(
    vehicle_type_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Admin: Delete (disable) a vehicle type
    """
    try:
        collection = db["vehicle_types"]
        
        result = await collection.update_one(
            {"_id": vehicle_type_id},
            {
                "$set": {
                    "active": False,
                    "updated_at": get_ist_now()
                }
            }
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Vehicle type not found")
        
        return {
            "status": "success",
            "message": "Vehicle type disabled"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
