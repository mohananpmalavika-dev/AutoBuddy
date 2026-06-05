"""
Admin Dispute & Complaint Management Router
Features: Investigation, resolution, appeals, escalation tracking
"""

from fastapi import APIRouter, HTTPException, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING
from datetime import datetime, timedelta
from app.utils.time_helpers import get_ist_now
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from app.db.client import get_db
from app.core.auth import require_roles

router = APIRouter(prefix="/api/admin/disputes", tags=["admin-disputes"])


class DisputeAssignment(BaseModel):
    dispute_id: str
    assigned_to: str
    priority: str = Field(..., description="low, medium, high, critical")


class DisputeResolution(BaseModel):
    dispute_id: str
    resolution_type: str = Field(..., description="favor_driver, favor_passenger, settlement")
    amount: Optional[float] = None
    notes: str


class AppealRequest(BaseModel):
    dispute_id: str
    appeal_reason: str
    supporting_documents: Optional[List[str]] = None


# ==================== GET Endpoints ====================

@router.get("/list")
async def get_disputes_list(
    status: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """List all disputes with filtering"""
    try:
        filters = {}
        if status:
            filters["status"] = status
        if severity:
            filters["severity"] = severity
        
        total = await db.disputes.count_documents(filters)
        
        disputes = await db.disputes.find(filters).sort("created_at", DESCENDING).skip(skip).limit(limit).to_list(limit)
        
        return {
            "total": total,
            "disputes": [
                {
                    "dispute_id": str(d.get("_id")),
                    "booking_id": d.get("booking_id"),
                    "driver_id": d.get("driver_id"),
                    "passenger_id": d.get("passenger_id"),
                    "type": d.get("dispute_type"),
                    "status": d.get("status"),
                    "severity": d.get("severity"),
                    "created_at": d.get("created_at"),
                    "assigned_to": d.get("assigned_to"),
                }
                for d in disputes
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing disputes: {str(e)}")


@router.get("/{dispute_id}")
async def get_dispute_details(
    dispute_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get detailed dispute information"""
    try:
        from bson import ObjectId
        dispute = await db.disputes.find_one({"_id": ObjectId(dispute_id)})
        if not dispute:
            raise HTTPException(status_code=404, detail="Dispute not found")
        
        return {
            "dispute_id": dispute_id,
            "booking_id": dispute.get("booking_id"),
            "driver_id": dispute.get("driver_id"),
            "passenger_id": dispute.get("passenger_id"),
            "type": dispute.get("dispute_type"),
            "description": dispute.get("description"),
            "status": dispute.get("status"),
            "severity": dispute.get("severity"),
            "evidence": dispute.get("evidence", []),
            "assigned_to": dispute.get("assigned_to"),
            "timeline": {
                "created_at": dispute.get("created_at"),
                "last_updated": dispute.get("last_updated"),
                "resolved_at": dispute.get("resolved_at"),
            },
            "resolution": dispute.get("resolution"),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching dispute: {str(e)}")


@router.get("/{dispute_id}/appeals")
async def get_dispute_appeals(
    dispute_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get appeals for a dispute"""
    try:
        appeals = await db.appeals.find(
            {"dispute_id": dispute_id}
        ).sort("created_at", DESCENDING).to_list(None)
        
        return {
            "dispute_id": dispute_id,
            "total_appeals": len(appeals),
            "appeals": [
                {
                    "appeal_id": str(a.get("_id")),
                    "appeal_by": a.get("appeal_by"),
                    "reason": a.get("reason"),
                    "status": a.get("status"),
                    "created_at": a.get("created_at"),
                }
                for a in appeals
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching appeals: {str(e)}")


# ==================== PUT Endpoints ====================

@router.put("/{dispute_id}/assign")
async def assign_dispute(
    dispute_id: str,
    assignment: DisputeAssignment,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Assign dispute to admin for investigation"""
    try:
        from bson import ObjectId
        await db.disputes.update_one(
            {"_id": ObjectId(dispute_id)},
            {
                "$set": {
                    "assigned_to": assignment.assigned_to,
                    "priority": assignment.priority,
                    "assigned_at": get_ist_now(),
                }
            }
        )
        
        return {"status": "success", "dispute_id": dispute_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error assigning dispute: {str(e)}")


@router.put("/{dispute_id}/resolve")
async def resolve_dispute(
    dispute_id: str,
    resolution: DisputeResolution,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Resolve a dispute"""
    try:
        from bson import ObjectId
        
        dispute = await db.disputes.find_one({"_id": ObjectId(dispute_id)})
        if not dispute:
            raise HTTPException(status_code=404, detail="Dispute not found")
        
        await db.disputes.update_one(
            {"_id": ObjectId(dispute_id)},
            {
                "$set": {
                    "status": "resolved",
                    "resolution_type": resolution.resolution_type,
                    "resolution_amount": resolution.amount,
                    "resolution_notes": resolution.notes,
                    "resolved_by": admin_user.get("user_id"),
                    "resolved_at": get_ist_now(),
                }
            }
        )
        
        # Process settlement if applicable
        if resolution.resolution_type == "settlement" and resolution.amount:
            await db.wallets.update_one(
                {"user_id": dispute.get("passenger_id")},
                {"$inc": {"balance": resolution.amount}},
                upsert=True
            )
        
        return {"status": "success", "dispute_id": dispute_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error resolving dispute: {str(e)}")


# ==================== POST Endpoints ====================

@router.post("/{dispute_id}/appeal")
async def process_appeal(
    dispute_id: str,
    appeal: AppealRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Process an appeal for a resolved dispute"""
    try:
        from bson import ObjectId
        
        await db.appeals.insert_one({
            "dispute_id": dispute_id,
            "appeal_reason": appeal.appeal_reason,
            "supporting_documents": appeal.supporting_documents or [],
            "status": "pending",
            "created_at": get_ist_now(),
        })
        
        # Update dispute status
        await db.disputes.update_one(
            {"_id": ObjectId(dispute_id)},
            {"$set": {"status": "appeal_filed"}}
        )
        
        return {"status": "success", "dispute_id": dispute_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing appeal: {str(e)}")
