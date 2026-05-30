"""
Admin Fare Management Router
Features: Global, district, and locality fare configuration management
"""

from fastapi import APIRouter, HTTPException, Depends, status, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime
from app.utils.time_helpers import get_ist_now
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from bson import ObjectId
from app.db.client import get_db
from app.core.auth import require_roles
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/fares", tags=["admin-fares"])


# ==================== Models ====================

class FareConfig(BaseModel):
    """Fare configuration model"""
    ride_type: str = Field(..., min_length=1, max_length=50)
    base_fare: float = Field(..., ge=0)
    per_km: float = Field(..., ge=0)
    per_minute: float = Field(..., ge=0)
    minimum_fare: float = Field(..., ge=0)
    surge_multiplier: float = Field(default=1.0, ge=1.0, le=5.0)


class GlobalFareConfig(BaseModel):
    """Global default fare configuration"""
    ride_type: str = Field(..., min_length=1, max_length=50)
    base_fare: float = Field(..., ge=0)
    per_km: float = Field(..., ge=0)
    per_minute: float = Field(..., ge=0)
    minimum_fare: float = Field(..., ge=0)
    surge_multiplier: float = Field(default=1.0, ge=1.0, le=5.0)
    enabled: bool = Field(default=True)


class DistrictFareConfig(BaseModel):
    """District-level fare configuration"""
    district: str = Field(..., min_length=2, max_length=80)
    ride_type: str = Field(..., min_length=1, max_length=50)
    base_fare: float = Field(..., ge=0)
    per_km: float = Field(..., ge=0)
    per_minute: float = Field(..., ge=0)
    minimum_fare: float = Field(..., ge=0)
    surge_multiplier: float = Field(default=1.0, ge=1.0, le=5.0)
    enabled: bool = Field(default=True)


class LocalityFareConfig(BaseModel):
    """Locality-level fare configuration"""
    district: str = Field(..., min_length=2, max_length=80)
    locality: str = Field(..., min_length=1, max_length=100)
    ride_type: str = Field(..., min_length=1, max_length=50)
    base_fare: float = Field(..., ge=0)
    per_km: float = Field(..., ge=0)
    per_minute: float = Field(..., ge=0)
    minimum_fare: float = Field(..., ge=0)
    surge_multiplier: float = Field(default=1.0, ge=1.0, le=5.0)
    enabled: bool = Field(default=True)


class FareHierarchyResponse(BaseModel):
    """Fare hierarchy structure"""
    global_fares: List[Dict[str, Any]]
    district_count: int
    locality_count: int
    total_configs: int


# ==================== Global Fares ====================

@router.post("/global")
async def set_global_fare(
    fare: GlobalFareConfig,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin: dict = Depends(require_roles("admin")),
):
    """Set or update global default fare for ride type"""
    try:
        # Check if exists
        existing = await db.fare_configuration.find_one({
            "type": "global",
            "ride_type": fare.ride_type
        })
        
        fare_doc = {
            "type": "global",
            "ride_type": fare.ride_type,
            "base_fare": fare.base_fare,
            "per_km": fare.per_km,
            "per_minute": fare.per_minute,
            "minimum_fare": fare.minimum_fare,
            "surge_multiplier": fare.surge_multiplier,
            "enabled": fare.enabled,
            "updated_at": get_ist_now(),
        }
        
        if existing:
            await db.fare_configuration.update_one(
                {"_id": existing["_id"]},
                {"$set": fare_doc}
            )
            return {
                "message": "Global fare updated",
                "ride_type": fare.ride_type,
                "data": fare_doc
            }
        else:
            fare_doc["created_at"] = get_ist_now()
            result = await db.fare_configuration.insert_one(fare_doc)
            return {
                "message": "Global fare created",
                "ride_type": fare.ride_type,
                "id": str(result.inserted_id),
                "data": fare_doc
            }
    except Exception as e:
        logger.error(f"Error setting global fare: {str(e)}")
        raise HTTPException(status_code=500, detail="Error setting global fare")


@router.get("/global")
async def list_global_fares(
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin: dict = Depends(require_roles("admin")),
):
    """List all global default fares"""
    try:
        fares = await db.fare_configuration.find({"type": "global"}).to_list(None)
        return {
            "total": len(fares),
            "fares": [
                {
                    "id": str(f.get("_id")),
                    "ride_type": f.get("ride_type"),
                    "base_fare": f.get("base_fare"),
                    "per_km": f.get("per_km"),
                    "per_minute": f.get("per_minute"),
                    "minimum_fare": f.get("minimum_fare"),
                    "surge_multiplier": f.get("surge_multiplier"),
                    "enabled": f.get("enabled"),
                    "updated_at": f.get("updated_at").isoformat() if f.get("updated_at") else None,
                }
                for f in fares
            ]
        }
    except Exception as e:
        logger.error(f"Error listing global fares: {str(e)}")
        raise HTTPException(status_code=500, detail="Error listing global fares")


# ==================== District Fares ====================

@router.post("/district/{district}")
async def set_district_fare(
    district: str,
    fare: DistrictFareConfig,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin: dict = Depends(require_roles("admin")),
):
    """Set or update district default fare"""
    try:
        # Validate district matches parameter
        if fare.district != district:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="District in URL must match district in body"
            )
        
        # Check if exists
        existing = await db.fare_configuration.find_one({
            "type": "district",
            "district": district,
            "ride_type": fare.ride_type
        })
        
        fare_doc = {
            "type": "district",
            "district": district,
            "ride_type": fare.ride_type,
            "base_fare": fare.base_fare,
            "per_km": fare.per_km,
            "per_minute": fare.per_minute,
            "minimum_fare": fare.minimum_fare,
            "surge_multiplier": fare.surge_multiplier,
            "enabled": fare.enabled,
            "updated_at": get_ist_now(),
        }
        
        if existing:
            await db.fare_configuration.update_one(
                {"_id": existing["_id"]},
                {"$set": fare_doc}
            )
            return {
                "message": "District fare updated",
                "district": district,
                "ride_type": fare.ride_type,
                "data": fare_doc
            }
        else:
            fare_doc["created_at"] = get_ist_now()
            result = await db.fare_configuration.insert_one(fare_doc)
            return {
                "message": "District fare created",
                "district": district,
                "ride_type": fare.ride_type,
                "id": str(result.inserted_id),
                "data": fare_doc
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting district fare: {str(e)}")
        raise HTTPException(status_code=500, detail="Error setting district fare")


@router.get("/district/{district}")
async def list_district_fares(
    district: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin: dict = Depends(require_roles("admin")),
):
    """List all fares for a district"""
    try:
        fares = await db.fare_configuration.find({
            "type": "district",
            "district": district
        }).to_list(None)
        
        return {
            "total": len(fares),
            "district": district,
            "fares": [
                {
                    "id": str(f.get("_id")),
                    "ride_type": f.get("ride_type"),
                    "base_fare": f.get("base_fare"),
                    "per_km": f.get("per_km"),
                    "per_minute": f.get("per_minute"),
                    "minimum_fare": f.get("minimum_fare"),
                    "surge_multiplier": f.get("surge_multiplier"),
                    "enabled": f.get("enabled"),
                    "updated_at": f.get("updated_at").isoformat() if f.get("updated_at") else None,
                }
                for f in fares
            ]
        }
    except Exception as e:
        logger.error(f"Error listing district fares: {str(e)}")
        raise HTTPException(status_code=500, detail="Error listing district fares")


# ==================== Locality Fares ====================

@router.post("/locality/{district}/{locality}")
async def set_locality_fare(
    district: str,
    locality: str,
    fare: LocalityFareConfig,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin: dict = Depends(require_roles("admin")),
):
    """Set or update locality fare"""
    try:
        # Validate parameters match body
        if fare.district != district or fare.locality != locality:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="District and locality in URL must match body"
            )
        
        # Check if exists
        existing = await db.fare_configuration.find_one({
            "type": "locality",
            "district": district,
            "locality": locality,
            "ride_type": fare.ride_type
        })
        
        fare_doc = {
            "type": "locality",
            "district": district,
            "locality": locality,
            "ride_type": fare.ride_type,
            "base_fare": fare.base_fare,
            "per_km": fare.per_km,
            "per_minute": fare.per_minute,
            "minimum_fare": fare.minimum_fare,
            "surge_multiplier": fare.surge_multiplier,
            "enabled": fare.enabled,
            "updated_at": get_ist_now(),
        }
        
        if existing:
            await db.fare_configuration.update_one(
                {"_id": existing["_id"]},
                {"$set": fare_doc}
            )
            return {
                "message": "Locality fare updated",
                "district": district,
                "locality": locality,
                "ride_type": fare.ride_type,
                "data": fare_doc
            }
        else:
            fare_doc["created_at"] = get_ist_now()
            result = await db.fare_configuration.insert_one(fare_doc)
            return {
                "message": "Locality fare created",
                "district": district,
                "locality": locality,
                "ride_type": fare.ride_type,
                "id": str(result.inserted_id),
                "data": fare_doc
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting locality fare: {str(e)}")
        raise HTTPException(status_code=500, detail="Error setting locality fare")


@router.get("/locality/{district}/{locality}")
async def list_locality_fares(
    district: str,
    locality: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin: dict = Depends(require_roles("admin")),
):
    """List all fares for a locality"""
    try:
        fares = await db.fare_configuration.find({
            "type": "locality",
            "district": district,
            "locality": locality
        }).to_list(None)
        
        return {
            "total": len(fares),
            "district": district,
            "locality": locality,
            "fares": [
                {
                    "id": str(f.get("_id")),
                    "ride_type": f.get("ride_type"),
                    "base_fare": f.get("base_fare"),
                    "per_km": f.get("per_km"),
                    "per_minute": f.get("per_minute"),
                    "minimum_fare": f.get("minimum_fare"),
                    "surge_multiplier": f.get("surge_multiplier"),
                    "enabled": f.get("enabled"),
                    "updated_at": f.get("updated_at").isoformat() if f.get("updated_at") else None,
                }
                for f in fares
            ]
        }
    except Exception as e:
        logger.error(f"Error listing locality fares: {str(e)}")
        raise HTTPException(status_code=500, detail="Error listing locality fares")


# ==================== Fare Hierarchy View ====================

@router.get("/hierarchy")
async def get_fare_hierarchy(
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin: dict = Depends(require_roles("admin")),
):
    """Get overview of fare configuration hierarchy"""
    try:
        global_fares = await db.fare_configuration.find({"type": "global"}).to_list(None)
        district_fares = await db.fare_configuration.find({"type": "district"}).to_list(None)
        locality_fares = await db.fare_configuration.find({"type": "locality"}).to_list(None)
        
        districts = set(f.get("district") for f in district_fares if f.get("district"))
        localities = len(set((f.get("district"), f.get("locality")) for f in locality_fares if f.get("district") and f.get("locality")))
        
        return {
            "global_fares_count": len(global_fares),
            "district_count": len(districts),
            "districts": sorted(list(districts)),
            "locality_count": localities,
            "total_configs": len(global_fares) + len(district_fares) + len(locality_fares),
            "ride_types": sorted(list(set(f.get("ride_type") for f in global_fares))),
        }
    except Exception as e:
        logger.error(f"Error getting fare hierarchy: {str(e)}")
        raise HTTPException(status_code=500, detail="Error getting fare hierarchy")


# ==================== Delete Fares ====================

@router.delete("/global/{ride_type}")
async def delete_global_fare(
    ride_type: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin: dict = Depends(require_roles("admin")),
):
    """Delete global fare for ride type"""
    try:
        result = await db.fare_configuration.delete_one({
            "type": "global",
            "ride_type": ride_type
        })
        
        if result.deleted_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Global fare for {ride_type} not found"
            )
        
        return {"message": f"Global fare for {ride_type} deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting global fare: {str(e)}")
        raise HTTPException(status_code=500, detail="Error deleting global fare")


@router.delete("/district/{district}/{ride_type}")
async def delete_district_fare(
    district: str,
    ride_type: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin: dict = Depends(require_roles("admin")),
):
    """Delete district fare"""
    try:
        result = await db.fare_configuration.delete_one({
            "type": "district",
            "district": district,
            "ride_type": ride_type
        })
        
        if result.deleted_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"District fare for {district}/{ride_type} not found"
            )
        
        return {"message": f"District fare for {district}/{ride_type} deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting district fare: {str(e)}")
        raise HTTPException(status_code=500, detail="Error deleting district fare")


@router.delete("/locality/{district}/{locality}/{ride_type}")
async def delete_locality_fare(
    district: str,
    locality: str,
    ride_type: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin: dict = Depends(require_roles("admin")),
):
    """Delete locality fare"""
    try:
        result = await db.fare_configuration.delete_one({
            "type": "locality",
            "district": district,
            "locality": locality,
            "ride_type": ride_type
        })
        
        if result.deleted_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Locality fare for {district}/{locality}/{ride_type} not found"
            )
        
        return {"message": f"Locality fare for {district}/{locality}/{ride_type} deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting locality fare: {str(e)}")
        raise HTTPException(status_code=500, detail="Error deleting locality fare")
