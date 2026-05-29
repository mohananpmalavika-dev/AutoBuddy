"""
Admin Driver Management Router
Features: List, status, suspend, ban, earnings, verification, tier management
"""

from fastapi import APIRouter, HTTPException, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from app.db.client import get_db
from app.core.auth import require_roles

router = APIRouter(prefix="/api/admin/drivers", tags=["admin-drivers"])


# ==================== Models ====================

class DriverStatusUpdate(BaseModel):
    driver_id: str
    status: str = Field(..., description="active, inactive, suspended, banned")
    reason: Optional[str] = None
    suspension_duration_days: Optional[int] = None


class DriverBan(BaseModel):
    driver_id: str
    reason: str
    ban_type: str = Field(..., description="temporary, permanent")
    duration_days: Optional[int] = None
    appeal_allowed: bool = True


class BulkDriverAction(BaseModel):
    driver_ids: List[str]
    action: str = Field(..., description="suspend, ban, activate, deactivate")
    reason: str
    duration_days: Optional[int] = None


class DriverEarningsAdjustment(BaseModel):
    driver_id: str
    amount: float
    adjustment_type: str = Field(..., description="bonus, deduction, correction")
    reason: str
    reference_id: Optional[str] = None


class DriverTierUpdate(BaseModel):
    driver_id: str
    new_tier: str = Field(..., description="bronze, silver, gold, platinum")
    reason: str


# ==================== GET Endpoints ====================

@router.get("/list")
async def get_drivers_list(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    tier: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    sort_by: str = Query("created_at", description="joined_at, earnings, rating, trips"),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """List all drivers with advanced filtering and sorting"""
    try:
        filters = {}
        
        if status:
            filters["driver_status"] = status
        if tier:
            filters["driver_tier"] = tier
        
        if search:
            filters["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}},
                {"phone": {"$regex": search, "$options": "i"}},
                {"license_number": {"$regex": search, "$options": "i"}},
            ]
        
        # Sorting
        sort_field = sort_by if sort_by in ["created_at", "earnings", "rating", "trips"] else "created_at"
        sort_direction = DESCENDING if sort_field in ["earnings", "rating", "trips"] else ASCENDING
        
        total = await db.users.count_documents({**filters, "role": "driver"})
        
        drivers = await db.users.find(
            {**filters, "role": "driver"}
        ).sort(sort_field, sort_direction).skip(skip).limit(limit).to_list(limit)
        
        return {
            "total": total,
            "skip": skip,
            "limit": limit,
            "drivers": [
                {
                    "user_id": str(d.get("_id")),
                    "name": d.get("name"),
                    "email": d.get("email"),
                    "phone": d.get("phone"),
                    "status": d.get("driver_status"),
                    "tier": d.get("driver_tier"),
                    "rating": d.get("rating", 0),
                    "total_trips": d.get("total_trips", 0),
                    "total_earnings": d.get("total_earnings", 0),
                    "verified": d.get("kyc_verified", False),
                    "joined_at": d.get("created_at"),
                }
                for d in drivers
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing drivers: {str(e)}")


@router.get("/{driver_id}")
async def get_driver_details(
    driver_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get detailed driver profile"""
    try:
        from bson import ObjectId
        try:
            obj_id = ObjectId(driver_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid driver ID")
        
        driver = await db.users.find_one({"_id": obj_id, "role": "driver"})
        if not driver:
            raise HTTPException(status_code=404, detail="Driver not found")
        
        # Get earnings details
        earnings = await db.driver_earnings.find_one({"driver_id": driver_id}) or {}
        
        # Get suspension history
        suspensions = await db.driver_actions.find(
            {"driver_id": driver_id, "action": "suspend"}
        ).sort("created_at", DESCENDING).limit(5).to_list(5)
        
        return {
            "driver_id": driver_id,
            "personal_info": {
                "name": driver.get("name"),
                "email": driver.get("email"),
                "phone": driver.get("phone"),
                "date_of_birth": driver.get("date_of_birth"),
            },
            "vehicle_info": {
                "vehicle_number": driver.get("vehicle_number"),
                "vehicle_type": driver.get("vehicle_type"),
                "insurance_expiry": driver.get("insurance_expiry"),
                "registration_expiry": driver.get("registration_expiry"),
            },
            "status": driver.get("driver_status"),
            "tier": driver.get("driver_tier"),
            "rating": driver.get("rating", 0),
            "verification": {
                "kyc_verified": driver.get("kyc_verified", False),
                "kyc_verified_at": driver.get("kyc_verified_at"),
                "license_verified": driver.get("license_verified", False),
            },
            "statistics": {
                "total_trips": driver.get("total_trips", 0),
                "total_earnings": earnings.get("total_earnings", 0),
                "completed_rides": driver.get("completed_rides", 0),
                "cancelled_rides": driver.get("cancelled_rides", 0),
                "cancellation_rate": driver.get("cancellation_rate", 0),
            },
            "suspension_history": [
                {
                    "suspended_at": s.get("created_at"),
                    "reason": s.get("reason"),
                    "duration_days": s.get("duration_days"),
                    "lifted_at": s.get("lifted_at"),
                }
                for s in suspensions
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching driver details: {str(e)}")


@router.get("/earnings/{driver_id}")
async def get_driver_earnings(
    driver_id: str,
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get driver earnings and payout history"""
    try:
        earnings = await db.driver_earnings.find_one({"driver_id": driver_id})
        if not earnings:
            earnings = {}
        
        # Get payout history
        payouts = await db.driver_payouts.find(
            {"driver_id": driver_id}
        ).sort("payout_date", DESCENDING).limit(12).to_list(12)
        
        return {
            "driver_id": driver_id,
            "total_earnings": earnings.get("total_earnings", 0),
            "pending_amount": earnings.get("pending_amount", 0),
            "total_paid": earnings.get("total_paid", 0),
            "last_payout_date": earnings.get("last_payout_date"),
            "payout_history": [
                {
                    "payout_id": str(p.get("_id")),
                    "amount": p.get("amount"),
                    "payout_date": p.get("payout_date"),
                    "status": p.get("status"),
                    "method": p.get("method"),
                }
                for p in payouts
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching earnings: {str(e)}")


# ==================== PUT Endpoints ====================

@router.put("/{driver_id}/status")
async def update_driver_status(
    driver_id: str,
    update: DriverStatusUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Update driver status (active, inactive, suspended, banned)"""
    try:
        from bson import ObjectId
        
        # Validate status
        valid_statuses = ["active", "inactive", "suspended", "banned"]
        if update.status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
        
        obj_id = ObjectId(driver_id)
        
        # Update driver
        result = await db.users.update_one(
            {"_id": obj_id, "role": "driver"},
            {"$set": {"driver_status": update.status, "updated_at": datetime.utcnow()}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Driver not found")
        
        # Log action
        await db.driver_actions.insert_one({
            "driver_id": driver_id,
            "action": update.status,
            "reason": update.reason,
            "admin_id": admin_user.get("user_id"),
            "created_at": datetime.utcnow(),
        })
        
        return {
            "status": "success",
            "driver_id": driver_id,
            "new_status": update.status,
            "changed_at": datetime.utcnow(),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating driver status: {str(e)}")


@router.put("/{driver_id}/ban")
async def ban_driver(
    driver_id: str,
    ban_info: DriverBan,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Ban a driver temporarily or permanently"""
    try:
        from bson import ObjectId
        
        obj_id = ObjectId(driver_id)
        
        ban_until = None
        if ban_info.ban_type == "temporary" and ban_info.duration_days:
            ban_until = datetime.utcnow() + timedelta(days=ban_info.duration_days)
        
        # Update driver
        await db.users.update_one(
            {"_id": obj_id, "role": "driver"},
            {
                "$set": {
                    "driver_status": "banned",
                    "ban_reason": ban_info.reason,
                    "ban_type": ban_info.ban_type,
                    "ban_until": ban_until,
                    "appeal_allowed": ban_info.appeal_allowed,
                    "updated_at": datetime.utcnow(),
                }
            }
        )
        
        # Log ban
        await db.driver_actions.insert_one({
            "driver_id": driver_id,
            "action": "ban",
            "ban_type": ban_info.ban_type,
            "reason": ban_info.reason,
            "ban_until": ban_until,
            "admin_id": admin_user.get("user_id"),
            "created_at": datetime.utcnow(),
        })
        
        return {
            "status": "success",
            "driver_id": driver_id,
            "ban_type": ban_info.ban_type,
            "ban_until": ban_until,
            "appeal_allowed": ban_info.appeal_allowed,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error banning driver: {str(e)}")


@router.put("/{driver_id}/tier")
async def update_driver_tier(
    driver_id: str,
    tier_update: DriverTierUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Update driver tier (bronze, silver, gold, platinum)"""
    try:
        from bson import ObjectId
        
        valid_tiers = ["bronze", "silver", "gold", "platinum"]
        if tier_update.new_tier not in valid_tiers:
            raise HTTPException(status_code=400, detail=f"Invalid tier. Must be one of: {valid_tiers}")
        
        obj_id = ObjectId(driver_id)
        
        await db.users.update_one(
            {"_id": obj_id, "role": "driver"},
            {
                "$set": {
                    "driver_tier": tier_update.new_tier,
                    "tier_updated_at": datetime.utcnow(),
                }
            }
        )
        
        await db.driver_actions.insert_one({
            "driver_id": driver_id,
            "action": "tier_update",
            "new_tier": tier_update.new_tier,
            "reason": tier_update.reason,
            "admin_id": admin_user.get("user_id"),
            "created_at": datetime.utcnow(),
        })
        
        return {
            "status": "success",
            "driver_id": driver_id,
            "new_tier": tier_update.new_tier,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating driver tier: {str(e)}")


# ==================== POST Endpoints ====================

@router.post("/bulk-action")
async def bulk_driver_action(
    bulk_action: BulkDriverAction,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Apply bulk actions to multiple drivers"""
    try:
        from bson import ObjectId
        
        results = {"success": [], "failed": []}
        
        for driver_id in bulk_action.driver_ids:
            try:
                obj_id = ObjectId(driver_id)
                
                status_map = {
                    "suspend": "suspended",
                    "ban": "banned",
                    "activate": "active",
                    "deactivate": "inactive",
                }
                new_status = status_map.get(bulk_action.action)
                
                if not new_status:
                    results["failed"].append({"driver_id": driver_id, "error": "Invalid action"})
                    continue
                
                await db.users.update_one(
                    {"_id": obj_id, "role": "driver"},
                    {"$set": {"driver_status": new_status, "updated_at": datetime.utcnow()}}
                )
                
                await db.driver_actions.insert_one({
                    "driver_id": driver_id,
                    "action": bulk_action.action,
                    "reason": bulk_action.reason,
                    "admin_id": admin_user.get("user_id"),
                    "created_at": datetime.utcnow(),
                })
                
                results["success"].append(driver_id)
            except Exception as e:
                results["failed"].append({"driver_id": driver_id, "error": str(e)})
        
        return {
            "status": "completed",
            "action": bulk_action.action,
            "total": len(bulk_action.driver_ids),
            "succeeded": len(results["success"]),
            "failed": len(results["failed"]),
            "results": results,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error performing bulk action: {str(e)}")


@router.post("/{driver_id}/earnings-adjustment")
async def adjust_driver_earnings(
    driver_id: str,
    adjustment: DriverEarningsAdjustment,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Manually adjust driver earnings (bonus, deduction, correction)"""
    try:
        # Update or create earnings record
        await db.driver_earnings.update_one(
            {"driver_id": driver_id},
            {
                "$inc": {"total_earnings": adjustment.amount if adjustment.adjustment_type == "bonus" else -adjustment.amount},
                "$set": {"last_adjustment": datetime.utcnow()}
            },
            upsert=True
        )
        
        # Log adjustment
        await db.driver_adjustments.insert_one({
            "driver_id": driver_id,
            "amount": adjustment.amount,
            "adjustment_type": adjustment.adjustment_type,
            "reason": adjustment.reason,
            "reference_id": adjustment.reference_id,
            "admin_id": admin_user.get("user_id"),
            "created_at": datetime.utcnow(),
        })
        
        return {
            "status": "success",
            "driver_id": driver_id,
            "adjustment": {
                "amount": adjustment.amount,
                "type": adjustment.adjustment_type,
                "reason": adjustment.reason,
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error adjusting earnings: {str(e)}")
