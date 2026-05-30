"""
Driver Fare Override Router
Features: Individual driver fare configuration management
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

router = APIRouter(prefix="/api", tags=["driver-fares"])


# ==================== Models ====================

class DriverFareOverride(BaseModel):
    """Driver individual fare override"""
    ride_type: str = Field(..., min_length=1, max_length=50)
    base_fare: float = Field(..., ge=0)
    per_km: float = Field(..., ge=0)
    per_minute: float = Field(..., ge=0)
    minimum_fare: float = Field(..., ge=0)
    surge_multiplier: float = Field(default=1.0, ge=1.0, le=5.0)
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None


# ==================== Admin Endpoints ====================

@router.post("/admin/drivers/{driver_id}/fares")
async def set_driver_fare_override(
    driver_id: str,
    fare: DriverFareOverride,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin: dict = Depends(require_roles("admin")),
):
    """Set or update driver's individual fare override"""
    try:
        # Validate driver_id is ObjectId format
        try:
            ObjectId(driver_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid driver_id format"
            )
        
        # Check if driver exists
        driver_data = await db.drivers.find_one({"user_id": ObjectId(driver_id)})
        if not driver_data:
            driver_data = await db.users.find_one({"_id": ObjectId(driver_id)})
        
        if not driver_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Driver not found"
            )
        
        # Check if override exists
        existing = await db.driver_fare_override.find_one({
            "driver_id": driver_id,
            "ride_type": fare.ride_type
        })
        
        override_doc = {
            "driver_id": driver_id,
            "ride_type": fare.ride_type,
            "base_fare": fare.base_fare,
            "per_km": fare.per_km,
            "per_minute": fare.per_minute,
            "minimum_fare": fare.minimum_fare,
            "surge_multiplier": fare.surge_multiplier,
            "effective_from": fare.effective_from,
            "effective_to": fare.effective_to,
            "updated_at": get_ist_now(),
        }
        
        if existing:
            await db.driver_fare_override.update_one(
                {"_id": existing["_id"]},
                {"$set": override_doc}
            )
            return {
                "message": "Driver fare override updated",
                "driver_id": driver_id,
                "ride_type": fare.ride_type,
                "data": override_doc
            }
        else:
            override_doc["created_at"] = get_ist_now()
            result = await db.driver_fare_override.insert_one(override_doc)
            return {
                "message": "Driver fare override created",
                "driver_id": driver_id,
                "ride_type": fare.ride_type,
                "id": str(result.inserted_id),
                "data": override_doc
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting driver fare override: {str(e)}")
        raise HTTPException(status_code=500, detail="Error setting driver fare override")


@router.get("/admin/drivers/{driver_id}/fares")
async def get_driver_fares(
    driver_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin: dict = Depends(require_roles("admin")),
):
    """Get all fare overrides for a driver"""
    try:
        # Validate driver_id
        try:
            ObjectId(driver_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid driver_id format"
            )
        
        overrides = await db.driver_fare_override.find({"driver_id": driver_id}).to_list(None)
        
        return {
            "driver_id": driver_id,
            "total": len(overrides),
            "fares": [
                {
                    "id": str(f.get("_id")),
                    "ride_type": f.get("ride_type"),
                    "base_fare": f.get("base_fare"),
                    "per_km": f.get("per_km"),
                    "per_minute": f.get("per_minute"),
                    "minimum_fare": f.get("minimum_fare"),
                    "surge_multiplier": f.get("surge_multiplier"),
                    "effective_from": f.get("effective_from").isoformat() if f.get("effective_from") else None,
                    "effective_to": f.get("effective_to").isoformat() if f.get("effective_to") else None,
                    "updated_at": f.get("updated_at").isoformat() if f.get("updated_at") else None,
                }
                for f in overrides
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting driver fares: {str(e)}")
        raise HTTPException(status_code=500, detail="Error getting driver fares")


@router.delete("/admin/drivers/{driver_id}/fares/{ride_type}")
async def delete_driver_fare_override(
    driver_id: str,
    ride_type: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin: dict = Depends(require_roles("admin")),
):
    """Delete driver's fare override for a ride type"""
    try:
        # Validate driver_id
        try:
            ObjectId(driver_id)
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid driver_id format"
            )
        
        result = await db.driver_fare_override.delete_one({
            "driver_id": driver_id,
            "ride_type": ride_type
        })
        
        if result.deleted_count == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No fare override found for driver {driver_id}/{ride_type}"
            )
        
        return {"message": f"Driver fare override for {ride_type} deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting driver fare override: {str(e)}")
        raise HTTPException(status_code=500, detail="Error deleting driver fare override")


# ==================== Driver Self-Service Endpoints ====================

@router.get("/driver/my-fares")
async def get_my_fares(
    db: AsyncIOMotorDatabase = Depends(get_db),
    driver: dict = Depends(require_roles("driver")),
):
    """Get driver's own fare overrides"""
    try:
        driver_id = driver.get("id")
        overrides = await db.driver_fare_override.find({"driver_id": driver_id}).to_list(None)
        
        return {
            "total": len(overrides),
            "fares": [
                {
                    "ride_type": f.get("ride_type"),
                    "base_fare": f.get("base_fare"),
                    "per_km": f.get("per_km"),
                    "per_minute": f.get("per_minute"),
                    "minimum_fare": f.get("minimum_fare"),
                    "surge_multiplier": f.get("surge_multiplier"),
                    "effective_from": f.get("effective_from").isoformat() if f.get("effective_from") else None,
                    "effective_to": f.get("effective_to").isoformat() if f.get("effective_to") else None,
                }
                for f in overrides
            ]
        }
    except Exception as e:
        logger.error(f"Error getting driver fares: {str(e)}")
        raise HTTPException(status_code=500, detail="Error getting your fares")


# ==================== Fare Calculation Service ====================

@router.post("/fares/calculate")
async def calculate_fare(
    pickup_location: Dict[str, Any] = None,
    drop_location: Dict[str, Any] = None,
    ride_type: str = Query(..., min_length=1, max_length=50),
    distance_km: float = Query(..., ge=0),
    duration_minutes: float = Query(..., ge=0),
    driver_id: Optional[str] = Query(None),
    surge_multiplier: float = Query(default=1.0, ge=1.0, le=5.0),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Calculate fare using hierarchical fare resolver
    Priority: Driver Override > Locality > District > Global
    """
    try:
        # Extract district/locality from location if provided
        district = None
        locality = None
        
        if pickup_location and isinstance(pickup_location, dict):
            district = pickup_location.get("district")
            locality = pickup_location.get("locality")
        
        # 1. Check driver override if driver_id provided
        if driver_id:
            try:
                ObjectId(driver_id)
                driver_override = await db.driver_fare_override.find_one({
                    "driver_id": driver_id,
                    "ride_type": ride_type
                })
                
                if driver_override:
                    return _calculate_from_config(
                        driver_override,
                        distance_km,
                        duration_minutes,
                        surge_multiplier,
                        source="driver_override"
                    )
            except Exception:
                pass  # Invalid driver_id, fall through to defaults
        
        # 2. Check locality fare if both district and locality provided
        if district and locality:
            locality_fare = await db.fare_configuration.find_one({
                "type": "locality",
                "district": district,
                "locality": locality,
                "ride_type": ride_type,
                "enabled": True
            })
            
            if locality_fare:
                return _calculate_from_config(
                    locality_fare,
                    distance_km,
                    duration_minutes,
                    surge_multiplier,
                    source="locality"
                )
        
        # 3. Check district fare if district provided
        if district:
            district_fare = await db.fare_configuration.find_one({
                "type": "district",
                "district": district,
                "ride_type": ride_type,
                "enabled": True
            })
            
            if district_fare:
                return _calculate_from_config(
                    district_fare,
                    distance_km,
                    duration_minutes,
                    surge_multiplier,
                    source="district"
                )
        
        # 4. Fall back to global default
        global_fare = await db.fare_configuration.find_one({
            "type": "global",
            "ride_type": ride_type,
            "enabled": True
        })
        
        if global_fare:
            return _calculate_from_config(
                global_fare,
                distance_km,
                duration_minutes,
                surge_multiplier,
                source="global"
            )
        
        # No fare config found
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No fare configuration found for ride type: {ride_type}"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating fare: {str(e)}")
        raise HTTPException(status_code=500, detail="Error calculating fare")


def _calculate_from_config(config: Dict, distance_km: float, duration_minutes: float, surge_multiplier: float, source: str) -> Dict[str, Any]:
    """Helper to calculate fare from configuration"""
    base_fare = float(config.get("base_fare", 0))
    per_km = float(config.get("per_km", 0))
    per_minute = float(config.get("per_minute", 0))
    minimum_fare = float(config.get("minimum_fare", 0))
    config_surge = float(config.get("surge_multiplier", 1.0))
    
    # Use provided surge or config surge, whichever is higher
    final_surge = max(surge_multiplier, config_surge)
    
    # Calculate components
    km_charge = distance_km * per_km
    minute_charge = duration_minutes * per_minute
    subtotal = base_fare + km_charge + minute_charge
    
    # Apply surge and minimum
    total = max(subtotal * final_surge, minimum_fare)
    
    return {
        "fare_breakdown": {
            "base_fare": base_fare,
            "distance_charge": km_charge,
            "time_charge": minute_charge,
            "subtotal": subtotal,
            "surge_multiplier": final_surge,
            "minimum_fare": minimum_fare,
        },
        "total_fare": round(total, 2),
        "source": source,
        "ride_type": config.get("ride_type"),
    }
