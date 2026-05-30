import uuid
from datetime import datetime
from app.utils.time_helpers import get_ist_now
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, ConfigDict, Field

from app.db.deps import get_db
from app.services import revenue_service
from app.utils.rbac import get_current_user_secure, require_roles

router = APIRouter(prefix="/api", tags=["revenue"])


class SubscribePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    plan_type: str = Field(..., min_length=2, max_length=60)


class PriorityRidePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    booking_id: str = Field(..., min_length=6, max_length=120)


class BusinessRidePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    company_name: str = Field(..., min_length=2, max_length=120)
    gst_number: Optional[str] = Field(default=None, max_length=30)
    pickup_location: Dict[str, Any]
    drop_location: Dict[str, Any]
    passenger_name: str = Field(..., min_length=2, max_length=80)
    passenger_phone: str = Field(..., min_length=10, max_length=20)
    notes: Optional[str] = Field(default=None, max_length=300)


class AdCampaignPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(..., min_length=3, max_length=100)
    placement: str = Field(default="home_banner", min_length=2, max_length=80)
    image_url: Optional[str] = Field(default=None, max_length=500)
    target_url: Optional[str] = Field(default=None, max_length=500)
    budget: float = Field(default=0, ge=0)
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None


class ReferralApplyPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    referral_code: str = Field(..., min_length=4, max_length=20)


class RideQuotePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    base_fare: float = Field(..., ge=0)
    ride_type: str = Field(default="standard", min_length=3, max_length=20)


@router.post("/revenue/seed-plans")
async def seed_plans(
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles("admin")),
):
    _ = user
    await revenue_service.ensure_default_revenue_plans(db)
    return {"message": "Revenue plans seeded"}


@router.get("/revenue/plans")
async def list_plans(
    role: Optional[str] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    query: Dict[str, Any] = {"active": True}
    if role:
        query["role"] = str(role).strip().lower()
    return await db.revenue_plans.find(query, {"_id": 0}).sort("amount", 1).to_list(100)


@router.post("/revenue/subscribe")
async def subscribe_plan(
    payload: SubscribePayload,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user_secure),
):
    role = str(user.get("role") or "").strip().lower()
    plan = await db.revenue_plans.find_one(
        {"plan_type": payload.plan_type, "role": role, "active": True},
        {"_id": 0},
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found for your role")
    subscription = await revenue_service.create_subscription(db, user, plan)
    return {"message": "Subscription activated", "subscription": subscription}


@router.get("/revenue/subscription/me")
async def my_subscription(
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user_secure),
):
    sub = await revenue_service.get_active_subscription(db, user["id"])
    return {"subscription": sub}


@router.post("/revenue/ride/quote")
async def get_ride_quote(
    payload: RideQuotePayload,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user_secure),
):
    return await revenue_service.calculate_quote(
        db=db,
        user_id=user["id"],
        base_fare=payload.base_fare,
        ride_type=payload.ride_type,
    )


@router.post("/revenue/priority-ride")
async def mark_priority_ride(
    payload: PriorityRidePayload,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles("passenger")),
):
    booking = await db.bookings.find_one({"id": payload.booking_id, "passenger_id": user["id"]}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    sub = await revenue_service.get_active_subscription(db, user["id"])
    if not sub:
        raise HTTPException(status_code=403, detail="Priority rides require an active passenger plan")
    priority_limit = int((sub.get("benefits") or {}).get("priority_rides", 0) or 0)
    used_count = await db.priority_rides.count_documents(
        {"passenger_id": user["id"], "created_at": {"$gte": sub["started_at"]}}
    )
    if priority_limit <= used_count:
        raise HTTPException(status_code=403, detail="Priority ride limit reached")
    record = {
        "id": str(uuid.uuid4()),
        "booking_id": booking["id"],
        "passenger_id": user["id"],
        "priority_level": "high",
        "created_at": get_ist_now(),
    }
    await db.priority_rides.insert_one(record)
    await db.bookings.update_one(
        {"id": booking["id"]},
        {"$set": {"priority_ride": True, "dispatch_priority": 1, "ride_type": "priority", "updated_at": get_ist_now()}},
    )
    return record


@router.post("/revenue/business-rides")
async def create_business_ride(
    payload: BusinessRidePayload,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user_secure),
):
    ride = {
        "id": str(uuid.uuid4()),
        "created_by": user["id"],
        "company_name": payload.company_name,
        "gst_number": payload.gst_number,
        "pickup_location": payload.pickup_location,
        "drop_location": payload.drop_location,
        "passenger_name": payload.passenger_name,
        "passenger_phone": payload.passenger_phone,
        "notes": payload.notes,
        "status": "requested",
        "billing_status": "pending",
        "created_at": get_ist_now(),
    }
    await db.business_rides.insert_one(ride)
    return {"message": "Business ride requested", "business_ride": ride}


@router.get("/revenue/business-rides")
async def list_business_rides(
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user_secure),
):
    query: Dict[str, Any] = {}
    if str(user.get("role") or "").strip().lower() != "admin":
        query["created_by"] = user["id"]
    return await db.business_rides.find(query, {"_id": 0}).sort("created_at", -1).limit(100).to_list(100)


@router.post("/revenue/ads")
async def create_ad_campaign(
    payload: AdCampaignPayload,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles("admin")),
):
    _ = user
    campaign = {
        "id": str(uuid.uuid4()),
        "title": payload.title,
        "placement": payload.placement,
        "image_url": payload.image_url,
        "target_url": payload.target_url,
        "budget": round(float(payload.budget), 2),
        "spent": 0.0,
        "impressions": 0,
        "clicks": 0,
        "active": True,
        "starts_at": payload.starts_at,
        "ends_at": payload.ends_at,
        "created_at": get_ist_now(),
    }
    await db.ad_campaigns.insert_one(campaign)
    return campaign


@router.get("/revenue/ads/active")
async def list_active_ads(
    placement: str = "home_banner",
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    return await db.ad_campaigns.find(
        {"placement": placement, "active": True},
        {"_id": 0},
    ).sort("created_at", -1).limit(5).to_list(5)


@router.post("/revenue/ads/{ad_id}/impression")
async def ad_impression(ad_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    await db.ad_campaigns.update_one({"id": ad_id}, {"$inc": {"impressions": 1}})
    return {"message": "impression recorded"}


@router.post("/revenue/ads/{ad_id}/click")
async def ad_click(ad_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    await db.ad_campaigns.update_one({"id": ad_id}, {"$inc": {"clicks": 1}})
    return {"message": "click recorded"}


@router.get("/revenue/wallet/me")
async def my_wallet(
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user_secure),
):
    wallet = await revenue_service.get_wallet(db, user["id"])
    txns = await db.wallet_transactions.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).limit(50).to_list(50)
    return {"wallet": wallet, "transactions": txns}


@router.get("/revenue/referral/me")
async def my_referral(
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user_secure),
):
    referral = await revenue_service.create_referral_if_missing(db, user)
    rewards = await db.referral_rewards.find(
        {"referrer_user_id": user["id"]},
        {"_id": 0},
    ).sort("created_at", -1).limit(50).to_list(50)
    return {"referral": referral, "rewards": rewards}


@router.post("/revenue/referral/apply")
async def apply_referral(
    payload: ReferralApplyPayload,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(get_current_user_secure),
):
    reward = await revenue_service.apply_referral_signup(db, user, payload.referral_code)
    if not reward:
        raise HTTPException(status_code=400, detail="Invalid or already used referral code")
    return {"message": "Referral applied", "reward": reward}


@router.post("/revenue/ride-revenue/{booking_id}/calculate")
async def calculate_revenue_for_ride(
    booking_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles("admin")),
):
    _ = user
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return await revenue_service.calculate_ride_revenue(db, booking)


@router.get("/revenue/admin/summary")
async def revenue_summary(
    db: AsyncIOMotorDatabase = Depends(get_db),
    user: dict = Depends(require_roles("admin")),
):
    _ = user
    return await revenue_service.fetch_revenue_summary(db)
