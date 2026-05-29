"""
Admin Promotions & Marketing Router
Features: Promo management, coupons, referrals, campaign tracking
"""

from fastapi import APIRouter, HTTPException, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
from typing import List, Optional
from app.db.client import get_db
from app.core.auth import require_roles
import uuid

router = APIRouter(prefix="/api/admin/promotions", tags=["admin-promotions"])


class Promotion(BaseModel):
    name: str
    code: str
    discount_type: str = Field(..., description="percentage, fixed")
    discount_value: float
    valid_from: str
    valid_until: str
    max_uses: Optional[int] = None
    applicable_to: str = Field(..., description="all, new_users, drivers")


class Coupon(BaseModel):
    code: str
    discount_amount: float
    max_usage: int = 1
    expiry_date: str


class ReferralProgram(BaseModel):
    name: str
    referrer_bonus: float
    referee_bonus: float
    active: bool = True


# ==================== GET Endpoints ====================

@router.get("/promotions")
async def get_promotions(
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get all active promotions"""
    try:
        filters = {}
        if status:
            filters["status"] = status
        else:
            filters["valid_until"] = {"$gte": datetime.utcnow()}
        
        total = await db.promotions.count_documents(filters)
        
        promos = await db.promotions.find(filters).sort("created_at", DESCENDING).skip(skip).limit(limit).to_list(limit)
        
        return {
            "total": total,
            "promotions": [
                {
                    "promo_id": str(p.get("_id")),
                    "name": p.get("name"),
                    "code": p.get("code"),
                    "discount_type": p.get("discount_type"),
                    "discount_value": p.get("discount_value"),
                    "valid_from": p.get("valid_from"),
                    "valid_until": p.get("valid_until"),
                    "uses": p.get("uses", 0),
                    "max_uses": p.get("max_uses"),
                }
                for p in promos
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching promotions: {str(e)}")


@router.get("/coupons")
async def get_coupons(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get all coupons"""
    try:
        total = await db.coupons.count_documents({})
        
        coupons = await db.coupons.find({}).sort("created_at", DESCENDING).skip(skip).limit(limit).to_list(limit)
        
        return {
            "total": total,
            "coupons": [
                {
                    "coupon_id": str(c.get("_id")),
                    "code": c.get("code"),
                    "discount_amount": c.get("discount_amount"),
                    "max_usage": c.get("max_usage"),
                    "current_usage": c.get("uses", 0),
                    "expiry_date": c.get("expiry_date"),
                    "status": "valid" if c.get("expiry_date", datetime.utcnow()) > datetime.utcnow() else "expired",
                }
                for c in coupons
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching coupons: {str(e)}")


@router.get("/referral-programs")
async def get_referral_programs(
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get all referral programs"""
    try:
        programs = await db.referral_programs.find({}).to_list(None)
        
        return {
            "programs": [
                {
                    "program_id": str(p.get("_id")),
                    "name": p.get("name"),
                    "referrer_bonus": p.get("referrer_bonus"),
                    "referee_bonus": p.get("referee_bonus"),
                    "active": p.get("active", True),
                    "total_referrals": p.get("total_referrals", 0),
                }
                for p in programs
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching programs: {str(e)}")


@router.get("/referral-stats")
async def get_referral_stats(
    days: int = Query(30, ge=1, le=365),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get referral statistics"""
    try:
        start_date = datetime.utcnow() - timedelta(days=days)
        
        pipeline = [
            {"$match": {"created_at": {"$gte": start_date}}},
            {"$group": {
                "_id": None,
                "total_referrals": {"$sum": 1},
                "total_bonuses_paid": {"$sum": "$bonus_amount"}
            }}
        ]
        
        stats = await db.referrals.aggregate(pipeline).to_list(1)
        data = stats[0] if stats else {"total_referrals": 0, "total_bonuses_paid": 0}
        
        return {
            "period_days": days,
            "total_referrals": data.get("total_referrals", 0),
            "total_bonuses": data.get("total_bonuses_paid", 0),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching stats: {str(e)}")


# ==================== POST Endpoints ====================

@router.post("/create-promo")
async def create_promotion(
    promo: Promotion,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Create new promotion"""
    try:
        await db.promotions.insert_one({
            "name": promo.name,
            "code": promo.code,
            "discount_type": promo.discount_type,
            "discount_value": promo.discount_value,
            "valid_from": datetime.fromisoformat(promo.valid_from),
            "valid_until": datetime.fromisoformat(promo.valid_until),
            "max_uses": promo.max_uses,
            "applicable_to": promo.applicable_to,
            "uses": 0,
            "created_by": admin_user.get("user_id"),
            "created_at": datetime.utcnow(),
        })
        
        return {"status": "success", "code": promo.code}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating promotion: {str(e)}")


@router.post("/create-coupon")
async def create_coupon(
    coupon: Coupon,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Create new coupon"""
    try:
        await db.coupons.insert_one({
            "code": coupon.code,
            "discount_amount": coupon.discount_amount,
            "max_usage": coupon.max_usage,
            "uses": 0,
            "expiry_date": datetime.fromisoformat(coupon.expiry_date),
            "created_by": admin_user.get("user_id"),
            "created_at": datetime.utcnow(),
        })
        
        return {"status": "success", "code": coupon.code}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating coupon: {str(e)}")


@router.post("/create-referral-program")
async def create_referral_program(
    program: ReferralProgram,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Create referral program"""
    try:
        await db.referral_programs.insert_one({
            "name": program.name,
            "referrer_bonus": program.referrer_bonus,
            "referee_bonus": program.referee_bonus,
            "active": program.active,
            "total_referrals": 0,
            "created_by": admin_user.get("user_id"),
            "created_at": datetime.utcnow(),
        })
        
        return {"status": "success", "name": program.name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error creating program: {str(e)}")
