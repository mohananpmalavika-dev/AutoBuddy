"""
Geographic Coverage Management - Admin Panel
Manage state/district/locality/pincode level service availability
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.db.database import get_db
from app.utils.rbac import require_roles

router = APIRouter(
    prefix="/api/admin/coverage",
    tags=["coverage"],
    dependencies=[Depends(require_roles("admin"))],
)

class CoverageArea(BaseModel):
    level: str  # "state", "district", "locality", "pincode"
    value: str  # "Kerala", "Ernakulam", etc.
    vehicle_types: List[str] = []
    ride_types: List[str] = []
    active: bool = True
    base_fare_multiplier: float = 1.0

@router.get("/all")
async def get_all_coverage_areas(
    db: AsyncIOMotorDatabase = Depends(get_db),
    level: Optional[str] = Query(None)
):
    """
    Get all coverage areas, optionally filtered by level
    """
    try:
        collection = db["coverage_areas"]
        
        query = {}
        if level:
            query["level"] = level
        
        areas = await collection.find(query).to_list(None)
        
        for area in areas:
            area.pop("_id", None)
        
        return {
            "status": "success",
            "data": areas,
            "count": len(areas)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/by-location")
async def get_coverage_by_location(
    latitude: float = Query(...),
    longitude: float = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Get coverage information for a specific location (coordinates)
    Can implement geohashing/geospatial queries for accuracy
    """
    try:
        # For now, return all active areas (in production, use geospatial index)
        collection = db["coverage_areas"]
        areas = await collection.find({"active": True}).to_list(None)
        
        for area in areas:
            area.pop("_id", None)
        
        return {
            "status": "success",
            "data": areas,
            "count": len(areas)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/create")
async def create_coverage_area(
    coverage: CoverageArea,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Admin: Create a new coverage area
    """
    try:
        collection = db["coverage_areas"]
        
        coverage_doc = {
            "_id": f"{coverage.level}_{coverage.value}".lower().replace(" ", "_"),
            "level": coverage.level,
            "value": coverage.value,
            "vehicle_types": coverage.vehicle_types,
            "ride_types": coverage.ride_types,
            "active": coverage.active,
            "base_fare_multiplier": coverage.base_fare_multiplier,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        result = await collection.insert_one(coverage_doc)
        
        return {
            "status": "success",
            "message": "Coverage area created",
            "id": result.inserted_id
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/update/{coverage_id}")
async def update_coverage_area(
    coverage_id: str,
    update_data: dict,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Admin: Update a coverage area
    """
    try:
        collection = db["coverage_areas"]
        
        update_data["updated_at"] = datetime.utcnow()
        
        result = await collection.update_one(
            {"_id": coverage_id},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Coverage area not found")
        
        return {
            "status": "success",
            "message": "Coverage area updated"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/delete/{coverage_id}")
async def delete_coverage_area(
    coverage_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Admin: Delete (disable) a coverage area
    """
    try:
        collection = db["coverage_areas"]
        
        result = await collection.update_one(
            {"_id": coverage_id},
            {
                "$set": {
                    "active": False,
                    "updated_at": datetime.utcnow()
                }
            }
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Coverage area not found")
        
        return {
            "status": "success",
            "message": "Coverage area disabled"
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/bulk-import")
async def bulk_import_coverage_areas(
    coverage_list: List[CoverageArea],
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Admin: Bulk import multiple coverage areas (e.g., from CSV)
    """
    try:
        collection = db["coverage_areas"]
        
        coverage_docs = []
        for i, coverage in enumerate(coverage_list):
            coverage_docs.append({
                "_id": f"{coverage.level}_{coverage.value}_{i}".lower().replace(" ", "_"),
                "level": coverage.level,
                "value": coverage.value,
                "vehicle_types": coverage.vehicle_types,
                "ride_types": coverage.ride_types,
                "active": coverage.active,
                "base_fare_multiplier": coverage.base_fare_multiplier,
                "created_at": datetime.utcnow(),
                "updated_at": datetime.utcnow()
            })
        
        if coverage_docs:
            result = await collection.insert_many(coverage_docs)
            return {
                "status": "success",
                "message": f"Imported {len(result.inserted_ids)} coverage areas"
            }
        
        return {
            "status": "success",
            "message": "No coverage areas to import"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/states")
async def get_all_states(db: AsyncIOMotorDatabase = Depends(get_db)):
    """
    Get list of all states with service availability
    """
    try:
        collection = db["coverage_areas"]
        
        states = await collection.find({"level": "state", "active": True}).to_list(None)
        
        state_list = [{"name": s["value"], "id": s["_id"]} for s in states]
        
        return {
            "status": "success",
            "data": state_list,
            "count": len(state_list)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/districts/{state}")
async def get_districts_for_state(
    state: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Get districts for a specific state
    """
    try:
        collection = db["coverage_areas"]
        
        # In production, store parent-child relationships
        # For now, return all districts
        districts = await collection.find({"level": "district", "active": True}).to_list(None)
        
        district_list = [{"name": d["value"], "id": d["_id"]} for d in districts]
        
        return {
            "status": "success",
            "data": district_list,
            "count": len(district_list)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/localities/{district}")
async def get_localities_for_district(
    district: str,
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Get localities for a specific district
    """
    try:
        collection = db["coverage_areas"]
        
        localities = await collection.find({"level": "locality", "active": True}).to_list(None)
        
        locality_list = [{"name": l["value"], "id": l["_id"]} for l in localities]
        
        return {
            "status": "success",
            "data": locality_list,
            "count": len(locality_list)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/search")
async def search_coverage_areas(
    query: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_db)
):
    """
    Search coverage areas by name
    """
    try:
        collection = db["coverage_areas"]
        
        # Simple text search (can be improved with full-text indexes)
        areas = await collection.find({
            "value": {"$regex": query, "$options": "i"},
            "active": True
        }).to_list(None)
        
        for area in areas:
            area.pop("_id", None)
        
        return {
            "status": "success",
            "data": areas,
            "count": len(areas)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
