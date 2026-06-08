"""Unified admin control center.

This router gives the admin panel one stable namespace for the major
operational controls, while the deeper admin modules keep their specialized
screens and workflows.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field, model_validator

from app.core.auth import require_roles
from app.db.client import get_db
from app.utils.time_helpers import get_ist_now


router = APIRouter(prefix="/api/admin/control", tags=["admin-control"])

ACTIVE_RIDE_STATUSES = ["pending", "accepted", "driver_arrived", "in_progress"]
BLOCKED_USER_STATUSES = ["blocked", "banned", "suspended"]
DOCUMENT_REVIEW_COLLECTIONS = {
    "driver_documents": "driver_documents",
    "passenger_documents": "passenger_documents",
    "document_uploads": "document_uploads",
}

ADMIN_CONTROL_CAPABILITIES: Dict[str, Dict[str, Any]] = {
    "fares": {
        "summary": "/api/admin/control/fares",
        "write": "/api/admin/control/fares/pricing plus /api/admin/fares/*",
    },
    "drivers": {
        "summary": "/api/admin/control/drivers",
        "write": "/api/admin/control/drivers/{driver_id}/status",
    },
    "passengers": {
        "summary": "/api/admin/control/passengers",
        "write": "/api/admin/control/passengers/{passenger_id}/status",
    },
    "disputes": {
        "summary": "/api/admin/control/disputes",
        "write": "/api/admin/control/disputes/{dispute_id}/control",
    },
    "refunds": {
        "summary": "/api/admin/control/refunds",
        "write": "/api/admin/control/refunds/process and /api/admin/control/refunds/{refund_id}/review",
    },
    "commissions": {
        "summary": "/api/admin/control/commissions/summary",
        "write": "/api/admin/control/commissions/config",
    },
    "documents": {
        "summary": "/api/admin/control/documents/review-queue",
        "write": "/api/admin/control/documents/{collection}/{document_id}/review",
    },
    "live_rides": {
        "summary": "/api/admin/control/live-rides",
        "write": "/api/admin/control/live-rides/{booking_id}/control",
    },
    "blocked_users": {
        "summary": "/api/admin/control/blocked-users",
        "write": "/api/admin/control/blocked-users/{user_id}",
    },
}


class UserStatusControl(BaseModel):
    status: Literal["active", "inactive", "suspended", "blocked", "banned"]
    reason: Optional[str] = Field(default=None, max_length=300)


class PricingControlRequest(BaseModel):
    base_fare: Optional[float] = Field(default=None, ge=0)
    per_km_rate: Optional[float] = Field(default=None, ge=0)
    per_km: Optional[float] = Field(default=None, ge=0)
    per_minute: Optional[float] = Field(default=None, ge=0)
    minimum_fare: Optional[float] = Field(default=None, ge=0)
    surge_multiplier: Optional[float] = Field(default=None, ge=1.0, le=5.0)
    night_multiplier: Optional[float] = Field(default=None, ge=1.0, le=5.0)
    driver_base_search_radius_km: Optional[float] = Field(default=None, ge=0.5)
    driver_long_distance_search_radius_km: Optional[float] = Field(default=None, ge=0.5)
    driver_pickup_surcharge_per_km: Optional[float] = Field(default=None, ge=0)
    waiting_charge_per_minute: Optional[float] = Field(default=None, ge=0)

    @model_validator(mode="after")
    def require_any_pricing_field(self) -> "PricingControlRequest":
        if not self.model_dump(exclude_none=True):
            raise ValueError("At least one pricing field is required")
        return self


class DisputeControlRequest(BaseModel):
    status: Literal["open", "assigned", "investigating", "resolved", "rejected", "appeal_filed"]
    note: Optional[str] = Field(default=None, max_length=500)
    assigned_to: Optional[str] = Field(default=None, max_length=120)
    resolution_type: Optional[Literal["favor_driver", "favor_passenger", "settlement", "no_fault"]] = None
    amount: Optional[float] = Field(default=None, ge=0)


class RefundProcessRequest(BaseModel):
    amount: Optional[float] = Field(default=None, ge=0)
    booking_id: Optional[str] = Field(default=None, min_length=1, max_length=120)
    passenger_id: Optional[str] = Field(default=None, min_length=1, max_length=120)
    payment_order_id: Optional[str] = Field(default=None, max_length=120)
    refund_type: Literal["full", "partial", "adjustment"] = "partial"
    reason: str = Field(min_length=3, max_length=500)
    credit_wallet: bool = True

    @model_validator(mode="after")
    def require_booking_or_passenger(self) -> "RefundProcessRequest":
        if not self.booking_id and not self.passenger_id:
            raise ValueError("booking_id or passenger_id is required")
        return self


class RefundReviewRequest(BaseModel):
    status: Literal["approved", "rejected", "paid", "failed"]
    note: Optional[str] = Field(default=None, max_length=500)
    transaction_ref: Optional[str] = Field(default=None, max_length=120)


class CommissionConfigRequest(BaseModel):
    default_platform_rate: float = Field(default=0.15, ge=0.0, le=1.0)
    ride_type_rates: Dict[str, float] = Field(default_factory=dict)
    minimum_commission: float = Field(default=0.0, ge=0.0)
    maximum_commission: Optional[float] = Field(default=None, ge=0.0)
    active: bool = True

    @model_validator(mode="after")
    def validate_rates(self) -> "CommissionConfigRequest":
        for ride_type, rate in self.ride_type_rates.items():
            if not str(ride_type or "").strip():
                raise ValueError("ride_type_rates keys must be non-empty")
            if rate < 0 or rate > 1:
                raise ValueError("ride_type_rates values must be between 0 and 1")
        if self.maximum_commission is not None and self.maximum_commission < self.minimum_commission:
            raise ValueError("maximum_commission must be greater than or equal to minimum_commission")
        return self


class DocumentReviewRequest(BaseModel):
    status: Literal["approved", "rejected", "pending", "needs_resubmission"]
    note: Optional[str] = Field(default=None, max_length=500)


class LiveRideControlRequest(BaseModel):
    action: Literal["cancel", "pause", "resume", "reassign", "force_status"]
    reason: str = Field(min_length=3, max_length=500)
    new_driver_id: Optional[str] = Field(default=None, max_length=120)
    status: Optional[str] = Field(default=None, max_length=80)

    @model_validator(mode="after")
    def validate_action_payload(self) -> "LiveRideControlRequest":
        if self.action == "reassign" and not self.new_driver_id:
            raise ValueError("new_driver_id is required for reassign")
        if self.action == "force_status" and not self.status:
            raise ValueError("status is required for force_status")
        return self


class BlockedUserControlRequest(BaseModel):
    blocked: bool
    reason: Optional[str] = Field(default=None, max_length=500)


def without_mongo_id(row: Dict[str, Any]) -> Dict[str, Any]:
    result = dict(row or {})
    if "_id" in result:
        result["mongo_id"] = str(result.pop("_id"))
    return result


def object_or_public_id_query(identifier: str, *public_fields: str) -> Dict[str, Any]:
    clauses = [{field: identifier} for field in public_fields if field]
    try:
        clauses.append({"_id": ObjectId(identifier)})
    except (InvalidId, TypeError):
        pass
    if not clauses:
        return {"id": identifier}
    return {"$or": clauses} if len(clauses) > 1 else clauses[0]


def user_lookup_query(user_id: str, role: Optional[str] = None) -> Dict[str, Any]:
    query = object_or_public_id_query(user_id, "id", "user_id")
    if role:
        return {"$and": [query, {"role": {"$in": [role, role.lower(), role.upper()]}}]}
    return query


async def audit_admin_control(
    db: AsyncIOMotorDatabase,
    admin_user: Dict[str, Any],
    action: str,
    resource: str,
    resource_id: Optional[str],
    payload: Optional[Dict[str, Any]] = None,
) -> None:
    await db.admin_control_audit_logs.insert_one(
        {
            "id": str(ObjectId()),
            "action": action,
            "resource": resource,
            "resource_id": resource_id,
            "payload": payload or {},
            "admin_id": admin_user.get("id") or admin_user.get("user_id"),
            "created_at": get_ist_now(),
        }
    )


def fare_amount_from_booking(booking: Dict[str, Any]) -> float:
    for field in ("final_fare", "estimated_fare", "fare_amount", "amount"):
        value = booking.get(field)
        if value is None:
            continue
        try:
            return max(0.0, float(value))
        except (TypeError, ValueError):
            continue
    return 0.0


def timestamp_sort_value(value: Any) -> float:
    if isinstance(value, datetime):
        return value.timestamp()
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return 0.0
    return 0.0


def document_sort_value(row: Dict[str, Any]) -> float:
    return max(timestamp_sort_value(row.get("uploaded_at")), timestamp_sort_value(row.get("created_at")))


def commission_for_booking(booking: Dict[str, Any], config: Dict[str, Any]) -> Dict[str, float]:
    amount = fare_amount_from_booking(booking)
    ride_type = str(booking.get("ride_type") or booking.get("ride_product") or "normal").strip().lower()
    rate = float((config.get("ride_type_rates") or {}).get(ride_type, config.get("default_platform_rate", 0.15)) or 0)
    commission = amount * max(0.0, min(1.0, rate))
    minimum = float(config.get("minimum_commission") or 0.0)
    maximum = config.get("maximum_commission")
    if amount > 0:
        commission = max(minimum, commission)
    if maximum is not None:
        commission = min(float(maximum), commission)
    commission = round(max(0.0, commission), 2)
    return {
        "fare_amount": round(amount, 2),
        "platform_commission": commission,
        "driver_share": round(max(0.0, amount - commission), 2),
    }


async def get_commission_config_document(db: AsyncIOMotorDatabase) -> Dict[str, Any]:
    existing = await db.admin_commission_config.find_one({"key": "default"}, {"_id": 0})
    if existing:
        return existing
    return {
        "key": "default",
        "default_platform_rate": 0.15,
        "ride_type_rates": {},
        "minimum_commission": 0.0,
        "maximum_commission": None,
        "active": True,
    }


@router.get("/capabilities")
async def get_admin_control_capabilities(admin_user: dict = Depends(require_roles("admin"))):
    """Return the admin panel's canonical control map."""
    return {
        "capabilities": ADMIN_CONTROL_CAPABILITIES,
        "required": list(ADMIN_CONTROL_CAPABILITIES.keys()),
    }


@router.get("/fares")
async def get_fare_control_summary(
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    pricing_rules = await db.pricing_rules.find_one({}, {"_id": 0}) or {}
    fare_configs = await db.fare_configuration.find({}, {"_id": 0}).sort("updated_at", -1).to_list(200)
    return {
        "pricing_rules": pricing_rules,
        "fare_configuration_count": len(fare_configs),
        "fare_configurations": fare_configs,
        "write_endpoints": ["/api/admin/pricing", "/api/admin/fares/global", "/api/admin/fares/district/{district}", "/api/admin/fares/locality/{district}/{locality}"],
    }


@router.put("/fares/pricing")
async def update_fare_pricing_control(
    payload: PricingControlRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    incoming = payload.model_dump(exclude_none=True)
    if "per_km" in incoming and "per_km_rate" not in incoming:
        incoming["per_km_rate"] = incoming.pop("per_km")
    existing = await db.pricing_rules.find_one({}, {"_id": 0}) or {}
    merged = {**existing, **incoming}
    base_radius = merged.get("driver_base_search_radius_km")
    long_radius = merged.get("driver_long_distance_search_radius_km")
    if base_radius is not None and long_radius is not None and float(long_radius) < float(base_radius):
        raise HTTPException(status_code=400, detail="Long distance search radius must be greater than or equal to base radius")
    now = get_ist_now()
    merged["updated_at"] = now
    merged["updated_by"] = admin_user.get("id") or admin_user.get("user_id")
    await db.pricing_rules.update_one({}, {"$set": merged}, upsert=True)
    await audit_admin_control(db, admin_user, "fare_pricing_updated", "pricing_rules", "default", incoming)
    return {"message": "Pricing updated", "pricing_rules": merged}


@router.get("/drivers")
async def get_driver_control_summary(
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    query: Dict[str, Any] = {"role": {"$in": ["driver", "DRIVER"]}}
    if status:
        query["status"] = status
    rows = await db.users.find(query, {"password_hash": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return {"drivers": [without_mongo_id(row) for row in rows], "total": len(rows)}


@router.put("/drivers/{driver_id}/status")
async def update_driver_control_status(
    driver_id: str,
    payload: UserStatusControl,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    now = get_ist_now()
    result = await db.users.update_one(
        user_lookup_query(driver_id, "driver"),
        {
            "$set": {
                "status": payload.status,
                "admin_status_reason": payload.reason,
                "admin_status_updated_at": now,
                "updated_at": now,
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Driver not found")
    await db.drivers.update_one(
        {"user_id": driver_id},
        {
            "$set": {
                "status": payload.status,
                "admin_status_reason": payload.reason,
                "is_available": payload.status == "active",
                "updated_at": now,
            }
        },
    )
    await audit_admin_control(db, admin_user, "driver_status_update", "driver", driver_id, payload.model_dump())
    return {"message": "Driver status updated", "driver_id": driver_id, "status": payload.status}


@router.get("/passengers")
async def get_passenger_control_summary(
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    query: Dict[str, Any] = {"role": {"$in": ["passenger", "user", "PASSENGER"]}}
    if status:
        query["status"] = status
    rows = await db.users.find(query, {"password_hash": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return {"passengers": [without_mongo_id(row) for row in rows], "total": len(rows)}


@router.put("/passengers/{passenger_id}/status")
async def update_passenger_control_status(
    passenger_id: str,
    payload: UserStatusControl,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    now = get_ist_now()
    result = await db.users.update_one(
        user_lookup_query(passenger_id),
        {
            "$set": {
                "status": payload.status,
                "passenger_status": payload.status,
                "admin_status_reason": payload.reason,
                "admin_status_updated_at": now,
                "updated_at": now,
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Passenger not found")
    await audit_admin_control(db, admin_user, "passenger_status_update", "passenger", passenger_id, payload.model_dump())
    return {"message": "Passenger status updated", "passenger_id": passenger_id, "status": payload.status}


@router.get("/disputes")
async def list_disputes_control(
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    query: Dict[str, Any] = {}
    if status:
        query["status"] = status
    rows = await db.disputes.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return {"disputes": rows, "total": len(rows)}


@router.put("/disputes/{dispute_id}/control")
async def control_dispute(
    dispute_id: str,
    payload: DisputeControlRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    query = object_or_public_id_query(dispute_id, "id", "dispute_id")
    dispute = await db.disputes.find_one(query, {"_id": 0})
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")
    now = get_ist_now()
    set_fields = {
        "status": payload.status,
        "admin_note": payload.note,
        "assigned_to": payload.assigned_to or dispute.get("assigned_to"),
        "resolution_type": payload.resolution_type,
        "resolution_amount": payload.amount,
        "updated_at": now,
        "updated_by": admin_user.get("id") or admin_user.get("user_id"),
    }
    if payload.status == "assigned":
        set_fields["assigned_at"] = now
    if payload.status == "resolved":
        set_fields["resolved_at"] = now
        set_fields["resolved_by"] = admin_user.get("id") or admin_user.get("user_id")
    await db.disputes.update_one(query, {"$set": set_fields})
    if payload.status == "resolved" and payload.amount and dispute.get("passenger_id"):
        await db.wallets.update_one(
            {"user_id": dispute.get("passenger_id")},
            {
                "$inc": {"balance": round(float(payload.amount), 2)},
                "$setOnInsert": {"user_id": dispute.get("passenger_id"), "currency": "INR", "created_at": now},
                "$set": {"updated_at": now},
            },
            upsert=True,
        )
    await audit_admin_control(db, admin_user, "dispute_controlled", "dispute", dispute_id, payload.model_dump())
    return {"message": "Dispute updated", "dispute_id": dispute_id, "status": payload.status}


@router.get("/refunds")
async def list_refunds(
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    query: Dict[str, Any] = {}
    if status:
        query["status"] = status
    rows = await db.refunds.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return {"refunds": rows, "total": len(rows)}


@router.post("/refunds/process")
async def process_refund_control(
    payload: RefundProcessRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    booking = None
    if payload.booking_id:
        booking = await db.bookings.find_one(object_or_public_id_query(payload.booking_id, "id", "booking_id"), {"_id": 0})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
    passenger_id = payload.passenger_id or (booking or {}).get("passenger_id")
    if not passenger_id:
        raise HTTPException(status_code=400, detail="Passenger ID could not be resolved")

    amount = payload.amount
    if amount is None:
        amount = fare_amount_from_booking(booking or {}) if payload.refund_type == "full" else 0.0
    amount = round(float(amount or 0.0), 2)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Refund amount must be greater than zero")

    now = get_ist_now()
    refund_doc = {
        "id": str(ObjectId()),
        "booking_id": payload.booking_id,
        "passenger_id": passenger_id,
        "payment_order_id": payload.payment_order_id,
        "amount": amount,
        "refund_type": payload.refund_type,
        "reason": payload.reason,
        "status": "paid" if payload.credit_wallet else "approved",
        "credit_wallet": payload.credit_wallet,
        "processed_by": admin_user.get("id") or admin_user.get("user_id"),
        "created_at": now,
        "processed_at": now if payload.credit_wallet else None,
    }
    await db.refunds.insert_one(refund_doc)
    if payload.credit_wallet:
        await db.wallets.update_one(
            {"user_id": passenger_id},
            {
                "$inc": {"balance": amount},
                "$setOnInsert": {"user_id": passenger_id, "currency": "INR", "created_at": now},
                "$set": {"updated_at": now},
            },
            upsert=True,
        )
    if payload.booking_id:
        await db.bookings.update_one(
            object_or_public_id_query(payload.booking_id, "id", "booking_id"),
            {
                "$set": {
                    "refund_status": refund_doc["status"],
                    "refund_amount": amount,
                    "refund_reason": payload.reason,
                    "updated_at": now,
                }
            },
        )
    response_refund = without_mongo_id(refund_doc)
    await audit_admin_control(db, admin_user, "refund_processed", "refund", refund_doc["id"], response_refund)
    return {"message": "Refund processed", "refund": response_refund}


@router.put("/refunds/{refund_id}/review")
async def review_refund_control(
    refund_id: str,
    payload: RefundReviewRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    now = get_ist_now()
    result = await db.refunds.update_one(
        object_or_public_id_query(refund_id, "id", "refund_id"),
        {
            "$set": {
                "status": payload.status,
                "admin_note": payload.note,
                "transaction_ref": payload.transaction_ref,
                "reviewed_by": admin_user.get("id") or admin_user.get("user_id"),
                "reviewed_at": now,
                "updated_at": now,
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Refund not found")
    await audit_admin_control(db, admin_user, "refund_reviewed", "refund", refund_id, payload.model_dump())
    return {"message": "Refund reviewed", "refund_id": refund_id, "status": payload.status}


@router.get("/commissions/config")
async def get_commission_config(
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    return await get_commission_config_document(db)


@router.put("/commissions/config")
async def update_commission_config(
    payload: CommissionConfigRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    now = get_ist_now()
    doc = {
        "key": "default",
        **payload.model_dump(),
        "updated_at": now,
        "updated_by": admin_user.get("id") or admin_user.get("user_id"),
    }
    await db.admin_commission_config.update_one({"key": "default"}, {"$set": doc, "$setOnInsert": {"created_at": now}}, upsert=True)
    await audit_admin_control(db, admin_user, "commission_config_updated", "commission_config", "default", doc)
    return {"message": "Commission config updated", "config": doc}


@router.get("/commissions/summary")
async def get_commission_summary(
    start_at: Optional[datetime] = Query(None),
    end_at: Optional[datetime] = Query(None),
    limit: int = Query(500, ge=1, le=5000),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    query: Dict[str, Any] = {"status": {"$in": ["completed", "BookingStatus.COMPLETED"]}}
    if start_at or end_at:
        query["created_at"] = {}
        if start_at:
            query["created_at"]["$gte"] = start_at
        if end_at:
            query["created_at"]["$lte"] = end_at
    config = await get_commission_config_document(db)
    bookings = await db.bookings.find(query, {"_id": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    rows = []
    totals = {"fare_amount": 0.0, "platform_commission": 0.0, "driver_share": 0.0}
    for booking in bookings:
        values = commission_for_booking(booking, config)
        rows.append({"booking_id": booking.get("id") or booking.get("booking_id"), "driver_id": booking.get("driver_id"), **values})
        for key in totals:
            totals[key] = round(totals[key] + values[key], 2)
    return {"config": config, "totals": totals, "booking_count": len(rows), "rows": rows}


@router.get("/documents/review-queue")
async def get_document_review_queue(
    status: str = Query("pending"),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    statuses = [status] if status != "all" else ["pending", "rejected", "needs_resubmission"]
    rows: List[Dict[str, Any]] = []
    for label, collection_name in DOCUMENT_REVIEW_COLLECTIONS.items():
        collection = db[collection_name]
        query = {
            "$or": [
                {"status": {"$in": statuses}},
                {"verification_status": {"$in": statuses}},
            ]
        }
        docs = await collection.find(query, {"_id": 0}).sort("uploaded_at", -1).limit(limit).to_list(limit)
        for doc in docs:
            rows.append({"collection": label, **doc})
    rows.sort(key=document_sort_value, reverse=True)
    return {"documents": rows[:limit], "total": min(len(rows), limit)}


@router.put("/documents/{collection}/{document_id}/review")
async def review_document_control(
    collection: str,
    document_id: str,
    payload: DocumentReviewRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    collection_name = DOCUMENT_REVIEW_COLLECTIONS.get(collection)
    if not collection_name:
        raise HTTPException(status_code=400, detail="Unsupported document collection")
    now = get_ist_now()
    result = await db[collection_name].update_one(
        object_or_public_id_query(document_id, "id", "document_id", "upload_id"),
        {
            "$set": {
                "status": payload.status,
                "verification_status": payload.status,
                "review_note": payload.note,
                "reviewed_by": admin_user.get("id") or admin_user.get("user_id"),
                "reviewed_at": now,
                "updated_at": now,
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    await audit_admin_control(db, admin_user, "document_reviewed", collection_name, document_id, payload.model_dump())
    return {"message": "Document reviewed", "collection": collection_name, "document_id": document_id, "status": payload.status}


@router.get("/live-rides")
async def get_live_rides_control(
    limit: int = Query(100, ge=1, le=500),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    rides = await db.bookings.find(
        {"status": {"$in": ACTIVE_RIDE_STATUSES + [f"BookingStatus.{item.upper()}" for item in ACTIVE_RIDE_STATUSES]}},
        {"_id": 0},
    ).sort("updated_at", -1).limit(limit).to_list(limit)
    return {"rides": rides, "total": len(rides)}


@router.put("/live-rides/{booking_id}/control")
async def control_live_ride(
    booking_id: str,
    payload: LiveRideControlRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    booking = await db.bookings.find_one(object_or_public_id_query(booking_id, "id", "booking_id"), {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Ride not found")
    now = get_ist_now()
    set_fields: Dict[str, Any] = {
        "admin_control_action": payload.action,
        "admin_control_reason": payload.reason,
        "admin_controlled_by": admin_user.get("id") or admin_user.get("user_id"),
        "admin_controlled_at": now,
        "updated_at": now,
    }
    if payload.action == "cancel":
        set_fields.update({"status": "cancelled", "cancelled_by_role": "admin", "cancelled_at": now})
    elif payload.action == "pause":
        set_fields.update({"status": "paused", "paused_at": now})
    elif payload.action == "resume":
        set_fields.update({"status": "accepted", "resumed_at": now})
    elif payload.action == "reassign":
        set_fields.update(
            {
                "driver_id": payload.new_driver_id,
                "reassigned_from": booking.get("driver_id"),
                "reassigned_at": now,
            }
        )
    elif payload.action == "force_status":
        set_fields["status"] = payload.status
    await db.bookings.update_one(object_or_public_id_query(booking_id, "id", "booking_id"), {"$set": set_fields})
    if payload.action in {"cancel", "reassign"} and booking.get("driver_id"):
        await db.drivers.update_one({"user_id": booking.get("driver_id")}, {"$set": {"is_available": True, "updated_at": now}})
    await audit_admin_control(db, admin_user, f"live_ride_{payload.action}", "booking", booking_id, payload.model_dump())
    return {"message": "Live ride control applied", "booking_id": booking_id, "action": payload.action}


@router.get("/blocked-users")
async def get_blocked_users(
    limit: int = Query(100, ge=1, le=500),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    query = {
        "$or": [
            {"status": {"$in": BLOCKED_USER_STATUSES}},
            {"admin_blocked": True},
            {"driver_status": {"$in": BLOCKED_USER_STATUSES}},
            {"passenger_status": {"$in": BLOCKED_USER_STATUSES}},
        ]
    }
    users = await db.users.find(query, {"password_hash": 0}).sort("updated_at", -1).limit(limit).to_list(limit)
    return {"users": [without_mongo_id(row) for row in users], "total": len(users)}


@router.put("/blocked-users/{user_id}")
async def set_blocked_user_control(
    user_id: str,
    payload: BlockedUserControlRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    now = get_ist_now()
    status_value = "blocked" if payload.blocked else "active"
    result = await db.users.update_one(
        user_lookup_query(user_id),
        {
            "$set": {
                "status": status_value,
                "admin_blocked": payload.blocked,
                "admin_block_reason": payload.reason,
                "admin_blocked_at": now if payload.blocked else None,
                "admin_unblocked_at": None if payload.blocked else now,
                "updated_at": now,
            }
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    await db.drivers.update_one(
        {"user_id": user_id},
        {"$set": {"admin_blocked": payload.blocked, "is_available": False if payload.blocked else True, "updated_at": now}},
    )
    await audit_admin_control(
        db,
        admin_user,
        "user_blocked" if payload.blocked else "user_unblocked",
        "user",
        user_id,
        payload.model_dump(),
    )
    return {"message": "User blocked" if payload.blocked else "User unblocked", "user_id": user_id, "blocked": payload.blocked}
