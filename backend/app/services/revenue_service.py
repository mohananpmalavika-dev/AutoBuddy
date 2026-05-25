import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

DEFAULT_PASSENGER_PLANS = [
    {
        "plan_type": "free",
        "name": "Free",
        "amount": 0,
        "duration_days": 30,
        "priority_rides": 0,
        "discount_percent": 0,
        "active": True,
    },
    {
        "plan_type": "plus",
        "name": "AutoBuddy Plus",
        "amount": 99,
        "duration_days": 30,
        "priority_rides": 5,
        "discount_percent": 5,
        "active": True,
    },
    {
        "plan_type": "premium",
        "name": "AutoBuddy Premium",
        "amount": 199,
        "duration_days": 30,
        "priority_rides": 15,
        "discount_percent": 10,
        "active": True,
    },
]

DEFAULT_DRIVER_PLANS = [
    {
        "plan_type": "basic_driver",
        "name": "Basic Driver",
        "amount": 299,
        "duration_days": 30,
        "commission_percent": 12,
        "priority_leads": 0,
        "active": True,
    },
    {
        "plan_type": "pro_driver",
        "name": "Pro Driver",
        "amount": 599,
        "duration_days": 30,
        "commission_percent": 8,
        "priority_leads": 30,
        "active": True,
    },
    {
        "plan_type": "elite_driver",
        "name": "Elite Driver",
        "amount": 999,
        "duration_days": 30,
        "commission_percent": 0,
        "priority_leads": 90,
        "active": True,
    },
]


def _utc_now() -> datetime:
    return datetime.utcnow()


def _normalize_role(role: Any) -> str:
    raw = str(role or "").strip().lower()
    if "." in raw:
        raw = raw.split(".")[-1]
    return raw


def referral_code_from_user(user: Dict[str, Any]) -> str:
    base = (str(user.get("name") or "AUTO").upper().replace(" ", "")[:4]) or "AUTO"
    user_tail = str(user.get("id") or "")[-5:].upper() or str(uuid.uuid4())[:5].upper()
    return f"{base}{user_tail}"


async def ensure_default_revenue_plans(db: AsyncIOMotorDatabase) -> None:
    for plan in DEFAULT_PASSENGER_PLANS:
        await db.revenue_plans.update_one(
            {"plan_type": plan["plan_type"], "role": "passenger"},
            {"$setOnInsert": {**plan, "role": "passenger", "created_at": _utc_now()}},
            upsert=True,
        )
    for plan in DEFAULT_DRIVER_PLANS:
        await db.revenue_plans.update_one(
            {"plan_type": plan["plan_type"], "role": "driver"},
            {"$setOnInsert": {**plan, "role": "driver", "created_at": _utc_now()}},
            upsert=True,
        )


async def get_active_subscription(db: AsyncIOMotorDatabase, user_id: str) -> Optional[Dict[str, Any]]:
    return await db.user_subscriptions.find_one(
        {"user_id": user_id, "active": True, "expires_at": {"$gte": _utc_now()}},
        {"_id": 0},
    )


async def create_subscription(db: AsyncIOMotorDatabase, user: Dict[str, Any], plan: Dict[str, Any]) -> Dict[str, Any]:
    now = _utc_now()
    await db.user_subscriptions.update_many(
        {"user_id": user["id"], "active": True},
        {"$set": {"active": False, "cancelled_at": now}},
    )
    sub = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "role": _normalize_role(user.get("role")),
        "plan_type": plan["plan_type"],
        "plan_name": plan.get("name"),
        "amount": float(plan.get("amount", 0)),
        "active": True,
        "started_at": now,
        "expires_at": now + timedelta(days=int(plan.get("duration_days", 30))),
        "benefits": {
            "priority_rides": int(plan.get("priority_rides", 0) or 0),
            "discount_percent": float(plan.get("discount_percent", 0) or 0),
            "commission_percent": plan.get("commission_percent"),
            "priority_leads": int(plan.get("priority_leads", 0) or 0),
        },
        "created_at": now,
    }
    await db.user_subscriptions.insert_one(sub)
    return sub


async def get_wallet(db: AsyncIOMotorDatabase, user_id: str) -> Dict[str, Any]:
    wallet = await db.wallets.find_one({"user_id": user_id}, {"_id": 0})
    if wallet:
        return wallet
    wallet = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "balance": 0.0,
        "currency": "INR",
        "created_at": _utc_now(),
    }
    await db.wallets.insert_one(wallet)
    return wallet


async def add_wallet_credit(
    db: AsyncIOMotorDatabase,
    user_id: str,
    amount: float,
    reason: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    await get_wallet(db, user_id)
    value = round(float(amount or 0), 2)
    txn = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "type": "credit",
        "amount": value,
        "reason": str(reason or "credit").strip(),
        "metadata": metadata or {},
        "created_at": _utc_now(),
    }
    await db.wallet_transactions.insert_one(txn)
    await db.wallets.update_one({"user_id": user_id}, {"$inc": {"balance": value}})
    return txn


async def create_referral_if_missing(db: AsyncIOMotorDatabase, user: Dict[str, Any]) -> Dict[str, Any]:
    existing = await db.referrals.find_one({"user_id": user["id"]}, {"_id": 0})
    if existing:
        return existing
    referral = {
        "id": str(uuid.uuid4()),
        "user_id": user["id"],
        "code": referral_code_from_user(user),
        "total_invites": 0,
        "successful_invites": 0,
        "total_earned": 0.0,
        "active": True,
        "created_at": _utc_now(),
    }
    await db.referrals.insert_one(referral)
    return referral


async def apply_referral_signup(
    db: AsyncIOMotorDatabase,
    new_user: Dict[str, Any],
    referral_code: str,
) -> Optional[Dict[str, Any]]:
    if not referral_code:
        return None
    code = str(referral_code or "").strip().upper()
    referral = await db.referrals.find_one({"code": code, "active": True}, {"_id": 0})
    if not referral:
        return None
    if referral["user_id"] == new_user["id"]:
        return None
    already = await db.referral_rewards.find_one({"new_user_id": new_user["id"]}, {"_id": 1})
    if already:
        return None

    reward_amount = 50.0
    reward = {
        "id": str(uuid.uuid4()),
        "referrer_user_id": referral["user_id"],
        "new_user_id": new_user["id"],
        "referral_code": code,
        "reward_amount": reward_amount,
        "status": "credited",
        "created_at": _utc_now(),
    }
    await db.referral_rewards.insert_one(reward)
    await db.referrals.update_one(
        {"code": code},
        {"$inc": {"total_invites": 1, "successful_invites": 1, "total_earned": reward_amount}},
    )
    await add_wallet_credit(
        db=db,
        user_id=referral["user_id"],
        amount=reward_amount,
        reason="referral_reward",
        metadata={"new_user_id": new_user["id"]},
    )
    return reward


async def calculate_ride_revenue(db: AsyncIOMotorDatabase, booking: Dict[str, Any]) -> Dict[str, Any]:
    fare = float(booking.get("final_fare") or booking.get("estimated_fare") or 0)
    driver_id = booking.get("driver_id")
    passenger_id = booking.get("passenger_id")
    ride_type = str(booking.get("ride_type") or "standard").strip().lower()

    driver_sub = await get_active_subscription(db, driver_id) if driver_id else None
    passenger_sub = await get_active_subscription(db, passenger_id) if passenger_id else None

    commission_percent = 15.0
    if driver_sub and driver_sub.get("benefits", {}).get("commission_percent") is not None:
        commission_percent = float(driver_sub["benefits"]["commission_percent"] or 0)

    discount_percent = 0.0
    if passenger_sub:
        discount_percent = float(passenger_sub.get("benefits", {}).get("discount_percent", 0) or 0)

    if ride_type == "priority":
        commission_percent = max(commission_percent, 20.0)
    if ride_type == "business":
        commission_percent = max(commission_percent, 18.0)

    discount_amount = round(fare * discount_percent / 100, 2)
    net_fare = max(0.0, round(fare - discount_amount, 2))
    platform_commission = round(net_fare * commission_percent / 100, 2)
    driver_earning = round(net_fare - platform_commission, 2)

    revenue = {
        "id": str(uuid.uuid4()),
        "booking_id": booking["id"],
        "passenger_id": passenger_id,
        "driver_id": driver_id,
        "ride_type": ride_type,
        "gross_fare": fare,
        "discount_percent": discount_percent,
        "discount_amount": discount_amount,
        "net_fare": net_fare,
        "commission_percent": commission_percent,
        "platform_commission": platform_commission,
        "driver_earning": driver_earning,
        "created_at": _utc_now(),
    }
    await db.ride_revenues.update_one({"booking_id": booking["id"]}, {"$set": revenue}, upsert=True)
    return revenue


async def calculate_quote(
    *,
    db: AsyncIOMotorDatabase,
    user_id: str,
    base_fare: float,
    ride_type: str,
) -> Dict[str, Any]:
    fare = max(0.0, float(base_fare or 0))
    kind = str(ride_type or "standard").strip().lower()
    if kind == "priority":
        fare = round(fare * 1.30, 2)
    elif kind == "business":
        fare = round(fare * 1.15, 2)
    passenger_sub = await get_active_subscription(db, user_id)
    discount_percent = float((passenger_sub or {}).get("benefits", {}).get("discount_percent", 0) or 0)
    discount_amount = round(fare * discount_percent / 100, 2)
    final_fare = round(max(0.0, fare - discount_amount), 2)
    return {
        "ride_type": kind,
        "base_fare": round(float(base_fare or 0), 2),
        "surged_fare": fare,
        "discount_percent": discount_percent,
        "discount_amount": discount_amount,
        "final_fare": final_fare,
    }


async def fetch_revenue_summary(db: AsyncIOMotorDatabase) -> Dict[str, Any]:
    subscriptions = await db.user_subscriptions.count_documents({"active": True, "expires_at": {"$gte": _utc_now()}})
    ads = await db.ad_campaigns.count_documents({"active": True})
    rows = await db.ride_revenues.find({}, {"_id": 0}).to_list(10000)
    gross_fare = round(sum(float(item.get("gross_fare", 0) or 0) for item in rows), 2)
    platform_commission = round(sum(float(item.get("platform_commission", 0) or 0) for item in rows), 2)
    credits = await db.wallet_transactions.find({"type": "credit"}, {"_id": 0}).to_list(10000)
    referral_cost = round(
        sum(float(item.get("amount", 0) or 0) for item in credits if item.get("reason") == "referral_reward"),
        2,
    )
    return {
        "active_subscriptions": subscriptions,
        "active_ads": ads,
        "gross_fare": gross_fare,
        "platform_commission": platform_commission,
        "referral_reward_cost": referral_cost,
        "net_platform_revenue_estimate": round(platform_commission - referral_cost, 2),
    }
