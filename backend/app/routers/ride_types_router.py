"""
Ride Types Router - API Endpoints for Ride Type Management
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import JSONResponse
from typing import List, Optional
from datetime import datetime
from app.utils.time_helpers import get_ist_now
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.models.ride_types_model import RideTypeResponse, DEFAULT_RIDE_TYPES, RideTypeEnum
from app.db.database import get_db
from app.utils.rbac import require_roles

router = APIRouter(prefix="/api/ride-types", tags=["ride-types"])

async def init_default_ride_types(db: AsyncIOMotorDatabase):
    """Initialize default ride types in database"""
    try:
        collection = db["ride_types"]
        
        # Check if ride types already exist
        count = await collection.count_documents({})
        if count > 0:
            return
        
        # Insert default ride types
        await collection.insert_many(DEFAULT_RIDE_TYPES)
        print("✅ Default ride types initialized")
    except Exception as e:
        print(f"⚠️ Error initializing ride types: {e}")
        raise

@router.get("/public/all")
async def get_all_ride_types(db: AsyncIOMotorDatabase = Depends(get_db)):
    """
    Fetch all active ride types
    
    Returns list of ride service types available in the platform
    """
    try:
        collection = db["ride_types"]
        
        # Fetch active ride types
        ride_types = await collection.find({"active": True}).to_list(None)
        
        # Remove MongoDB _id field
        for rt in ride_types:
            rt["id"] = str(rt.get("_id") or rt.get("id") or "")
            rt.pop("_id", None)
        
        return {
            "status": "success",
            "data": ride_types,
            "count": len(ride_types)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching ride types: {str(e)}")

@router.get("/public/{ride_type_id}")
async def get_ride_type(ride_type_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    """
    Fetch a specific ride type by ID
    """
    try:
        collection = db["ride_types"]
        
        ride_type = await collection.find_one({"_id": ride_type_id, "active": True})
        
        if not ride_type:
            raise HTTPException(status_code=404, detail="Ride type not found")
        
        ride_type["id"] = str(ride_type.get("_id") or ride_type.get("id") or "")
        ride_type.pop("_id", None)
        
        return {
            "status": "success",
            "data": ride_type
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/public/filter/vehicle-compatible")
async def get_ride_types_for_vehicle(
    vehicle_type_id: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Get ride types compatible with a specific vehicle type
    """
    try:
        collection = db["ride_types"]
        
        # Find ride types that support this vehicle
        ride_types = await collection.find({
            "active": True,
            "allowed_vehicle_types": vehicle_type_id
        }).to_list(None)
        
        for rt in ride_types:
            rt["id"] = str(rt.get("_id") or rt.get("id") or "")
            rt.pop("_id", None)
        
        return {
            "status": "success",
            "data": ride_types,
            "count": len(ride_types)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/create", dependencies=[Depends(require_roles("admin"))])
async def create_ride_type(
    ride_type_data: dict,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Admin: Create a new ride type
    """
    try:
        collection = db["ride_types"]
        
        # Validate required fields
        required_fields = ["id", "name", "icon", "description"]
        for field in required_fields:
            if field not in ride_type_data:
                raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
        
        # Set defaults
        ride_type_data.setdefault("allowed_vehicle_types", [])
        ride_type_data.setdefault("requires_scheduling", False)
        ride_type_data.setdefault("requires_destination", True)
        ride_type_data.setdefault("requires_passenger_count", True)
        ride_type_data.setdefault("active", True)
        ride_type_data.setdefault("regions", ["all"])
        ride_type_data["created_at"] = get_ist_now()
        ride_type_data["updated_at"] = get_ist_now()
        
        # Use id as _id
        ride_type_data["_id"] = ride_type_data.pop("id")
        
        result = await collection.insert_one(ride_type_data)
        
        if not result.inserted_id:
            raise HTTPException(status_code=500, detail="Failed to create ride type")
        
        return {
            "status": "success",
            "message": "Ride type created",
            "id": result.inserted_id
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/admin/update/{ride_type_id}", dependencies=[Depends(require_roles("admin"))])
async def update_ride_type(
    ride_type_id: str,
    update_data: dict,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Admin: Update a ride type
    """
    try:
        collection = db["ride_types"]
        
        update_data["updated_at"] = get_ist_now()
        
        result = await collection.update_one(
            {"_id": ride_type_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Ride type not found")
        
        return {
            "status": "success",
            "message": "Ride type updated"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/admin/delete/{ride_type_id}", dependencies=[Depends(require_roles("admin"))])
async def delete_ride_type(
    ride_type_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Admin: Delete (disable) a ride type
    """
    try:
        collection = db["ride_types"]
        
        result = await collection.update_one(
            {"_id": ride_type_id},
            {
                "$set": {
                    "active": False,
                    "updated_at": get_ist_now()
                }
            }
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Ride type not found")
        
        return {
            "status": "success",
            "message": "Ride type disabled"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
