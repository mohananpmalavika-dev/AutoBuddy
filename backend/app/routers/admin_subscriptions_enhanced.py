"""
Admin Subscriptions - Enhanced with benefit config and auto-renewal
"""
from datetime import datetime, timedelta
from app.utils.time_helpers import get_ist_now
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db.deps import get_db
from app.utils.rbac import require_roles

router = APIRouter(prefix="/api/admin/subscriptions", tags=["admin_subscriptions"])


class SubscriptionBenefit(BaseModel):
    """Subscription tier benefits"""
    name: str
    discount_percent: Optional[float] = None
    bonus_credits: Optional[float] = None
    priority_matching: bool = False
    cancellation_fee_waived: bool = False
    support_priority: str = "normal"  # normal, high, vip
    max_rides_per_day: Optional[int] = None
    free_rides_per_month: int = 0
    cashback_percent: Optional[float] = None


class SubscriptionTierConfig(BaseModel):
    """Complete subscription tier configuration"""
    tier_name: str
    amount: float
    currency: str = "INR"
    active: bool
    benefits: List[SubscriptionBenefit]
    billing_cycle_days: int  # 30, 90, 365
    auto_renewal_enabled: bool = True
    renewal_reminder_days: int = 7
    cancellation_grace_period_days: int = 14
    refund_policy: str = "prorated"  # prorated, full, none


class AutoRenewalConfig(BaseModel):
    """Auto-renewal settings"""
    enabled: bool
    max_failed_attempts: int = 3
    retry_delay_hours: int = 24
    send_renewal_reminder: bool = True
    reminder_days_before: int = 7


async def update_subscription_benefits(
    db: AsyncIOMotorDatabase,
    role: str,  # "passenger" or "driver"
    tier: str,  # "monthly", "quarterly", "annually", "per_trip"
    benefits: List[Dict[str, Any]],
):
    """Update benefits for a subscription tier"""
    subs_collection = db["subscriptions"]
    
    await subs_collection.update_one(
        {"role": role, "tier": tier},
        {
            "$set": {
                "benefits": benefits,
                "updated_at": get_ist_now()
            }
        },
        upsert=True
    )


async def update_auto_renewal_config(
    db: AsyncIOMotorDatabase,
    role: str,
    auto_renewal: Dict[str, Any],
):
    """Update auto-renewal settings"""
    subs_collection = db["subscriptions"]
    
    await subs_collection.update_one(
        {"role": role},
        {
            "$set": {
                "auto_renewal_config": auto_renewal,
                "updated_at": get_ist_now()
            }
        },
        upsert=True
    )


@router.get("/config")
async def get_subscriptions_config(
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get complete subscription configuration with benefits"""
    _ = admin_user
    subs_collection = db["subscriptions"]
    
    config = {
        "passenger": {},
        "driver": {},
        "auto_renewal": {}
    }
    
    async for doc in subs_collection.find({}):
        role = doc.get("role", "passenger")
        if role == "passenger":
            config["passenger"] = doc
        elif role == "driver":
            config["driver"] = doc
        
        if doc.get("auto_renewal_config"):
            config["auto_renewal"][role] = doc.get("auto_renewal_config")
    
    return config


@router.put("/benefits/{role}/{tier}")
async def update_tier_benefits(
    role: str,
    tier: str,
    benefits: List[SubscriptionBenefit],
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Update benefits for a subscription tier"""
    _ = admin_user
    
    if role not in ["passenger", "driver"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    if tier not in ["monthly", "quarterly", "annually", "per_trip"]:
        raise HTTPException(status_code=400, detail="Invalid tier")
    
    benefits_list = [b.dict() for b in benefits]
    await update_subscription_benefits(db, role, tier, benefits_list)
    
    return {
        "role": role,
        "tier": tier,
        "benefits": benefits_list,
        "updated_at": get_ist_now().isoformat()
    }


@router.get("/benefits/{role}")
async def get_tier_benefits(
    role: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get all benefits for a role"""
    _ = admin_user
    subs_collection = db["subscriptions"]
    
    doc = await subs_collection.find_one({"role": role})
    if not doc:
        return {"benefits": {}}
    
    return {"benefits": doc.get("benefits", {})}


@router.put("/auto-renewal/{role}")
async def update_auto_renewal(
    role: str,
    config: AutoRenewalConfig,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Update auto-renewal settings for a role"""
    _ = admin_user
    
    if role not in ["passenger", "driver"]:
        raise HTTPException(status_code=400, detail="Invalid role")
    
    config_dict = config.dict()
    await update_auto_renewal_config(db, role, config_dict)
    
    return {
        "role": role,
        "auto_renewal_config": config_dict,
        "updated_at": get_ist_now().isoformat()
    }


@router.post("/process-renewals")
async def process_pending_renewals(
    dry_run: bool = Query(False),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Process pending subscription renewals"""
    _ = admin_user
    
    subscriptions_collection = db["subscriptions"]
    users_collection = db["users"]
    
    # Find subscriptions due for renewal
    now = get_ist_now()
    renewal_date_cutoff = now - timedelta(days=1)
    
    pipeline = [
        {
            "$match": {
                "auto_renewal_enabled": True,
                "next_renewal_date": {"$lte": renewal_date_cutoff},
                "renewal_status": {"$in": ["pending", None]}
            }
        }
    ]
    
    processed = 0
    failed = 0
    
    async for subscription in subscriptions_collection.aggregate(pipeline):
        user_id = subscription.get("user_id")
        
        if not dry_run:
            # Update renewal date for next cycle
            cycle_days = subscription.get("billing_cycle_days", 30)
            next_renewal = now + timedelta(days=cycle_days)
            
            result = await subscriptions_collection.update_one(
                {"_id": subscription["_id"]},
                {
                    "$set": {
                        "next_renewal_date": next_renewal,
                        "last_renewal_date": now,
                        "renewal_status": "completed",
                        "renewed_count": (subscription.get("renewed_count", 0) + 1)
                    }
                }
            )
            
            if result.modified_count > 0:
                processed += 1
            else:
                failed += 1
        else:
            processed += 1
    
    return {
        "processed_renewals": processed,
        "failed_renewals": failed,
        "dry_run": dry_run,
        "executed_at": get_ist_now().isoformat()
    }


@router.get("/renewal-pending")
async def get_pending_renewals(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get subscriptions pending renewal"""
    _ = admin_user
    
    subscriptions_collection = db["subscriptions"]
    now = get_ist_now()
    
    pipeline = [
        {
            "$match": {
                "auto_renewal_enabled": True,
                "next_renewal_date": {"$lte": now},
                "renewal_status": {"$in": ["pending", None]}
            }
        },
        {
            "$sort": {"next_renewal_date": 1}
        },
        {
            "$skip": skip
        },
        {
            "$limit": limit
        }
    ]
    
    renewals = []
    async for doc in subscriptions_collection.aggregate(pipeline):
        renewals.append({
            "_id": str(doc.get("_id")),
            "user_id": doc.get("user_id"),
            "role": doc.get("role"),
            "tier": doc.get("tier"),
            "amount": doc.get("amount"),
            "next_renewal_date": doc.get("next_renewal_date", now).isoformat(),
            "last_renewal_date": doc.get("last_renewal_date"),
            "renewed_count": doc.get("renewed_count", 0)
        })
    
    return {
        "pending_renewals": renewals,
        "count": len(renewals),
        "skip": skip,
        "limit": limit
    }


@router.post("/send-renewal-reminders")
async def send_renewal_reminders(
    days_before: int = Query(7, ge=1, le=30),
    dry_run: bool = Query(False),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Send reminders for upcoming subscription renewals"""
    _ = admin_user
    
    subscriptions_collection = db["subscriptions"]
    users_collection = db["users"]
    
    now = get_ist_now()
    reminder_date = now + timedelta(days=days_before)
    reminder_date_end = reminder_date + timedelta(days=1)
    
    pipeline = [
        {
            "$match": {
                "auto_renewal_enabled": True,
                "next_renewal_date": {
                    "$gte": reminder_date,
                    "$lt": reminder_date_end
                },
                "reminder_sent": {"$ne": True}
            }
        }
    ]
    
    reminders_sent = 0
    
    async for subscription in subscriptions_collection.aggregate(pipeline):
        user_id = subscription.get("user_id")
        user = await users_collection.find_one({"_id": user_id})
        
        if user and not dry_run:
            # Here you would send SMS/email notification
            await subscriptions_collection.update_one(
                {"_id": subscription["_id"]},
                {
                    "$set": {
                        "reminder_sent": True,
                        "reminder_sent_at": now
                    }
                }
            )
            reminders_sent += 1
        elif user:
            reminders_sent += 1
    
    return {
        "reminders_sent": reminders_sent,
        "days_before_renewal": days_before,
        "dry_run": dry_run,
        "executed_at": get_ist_now().isoformat()
    }


@router.get("/expiring-soon")
async def get_expiring_subscriptions(
    days: int = Query(7, ge=1, le=30),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get subscriptions expiring within specified days"""
    _ = admin_user
    
    subscriptions_collection = db["subscriptions"]
    now = get_ist_now()
    expiry_cutoff = now + timedelta(days=days)
    
    pipeline = [
        {
            "$match": {
                "auto_renewal_enabled": False,
                "expiry_date": {
                    "$gte": now,
                    "$lte": expiry_cutoff
                }
            }
        },
        {
            "$sort": {"expiry_date": 1}
        }
    ]
    
    expiring = []
    async for doc in subscriptions_collection.aggregate(pipeline):
        expiring.append({
            "_id": str(doc.get("_id")),
            "user_id": doc.get("user_id"),
            "tier": doc.get("tier"),
            "expiry_date": doc.get("expiry_date", now).isoformat(),
            "days_remaining": (doc.get("expiry_date", now) - now).days
        })
    
    return {
        "expiring_subscriptions": expiring,
        "count": len(expiring),
        "within_days": days
    }
