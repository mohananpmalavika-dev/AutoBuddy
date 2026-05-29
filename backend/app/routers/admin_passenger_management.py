"""
Admin Passenger Management Router
Features: List, status, complaints, refunds, verification, account management
"""

from fastapi import APIRouter, HTTPException, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING
from datetime import datetime, timedelta
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from app.db.client import get_db
from app.core.auth import require_roles

router = APIRouter(prefix="/api/admin/passengers", tags=["admin-passengers"])


# ==================== Models ====================

class PassengerStatusUpdate(BaseModel):
    passenger_id: str
    status: str = Field(..., description="active, inactive, suspended, banned")
    reason: Optional[str] = None


class ComplaintResolution(BaseModel):
    complaint_id: str
    resolution: str = Field(..., description="resolved, dismissed, escalated, pending")
    notes: str
    refund_amount: Optional[float] = None
    action_taken: Optional[str] = None


class RefundProcessing(BaseModel):
    passenger_id: str
    booking_id: str
    refund_amount: float
    reason: str
    refund_type: str = Field(..., description="full, partial")


class ComplaintInvestigation(BaseModel):
    complaint_id: str
    investigation_notes: str
    findings: str
    severity_level: str = Field(..., description="low, medium, high, critical")


class BulkPassengerAction(BaseModel):
    passenger_ids: List[str]
    action: str = Field(..., description="suspend, ban, activate, deactivate")
    reason: str


# ==================== GET Endpoints ====================

@router.get("/list")
async def get_passengers_list(
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    sort_by: str = Query("created_at", description="joined_at, total_spent, complaints"),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """List all passengers with filtering and sorting"""
    try:
        filters = {"role": "passenger"}
        
        if status:
            filters["passenger_status"] = status
        
        if search:
            filters["$or"] = [
                {"name": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}},
                {"phone": {"$regex": search, "$options": "i"}},
            ]
        
        total = await db.users.count_documents(filters)
        
        sort_direction = DESCENDING if sort_by in ["total_spent", "complaints"] else ASCENDING
        
        passengers = await db.users.find(filters).sort(sort_by, sort_direction).skip(skip).limit(limit).to_list(limit)
        
        return {
            "total": total,
            "skip": skip,
            "limit": limit,
            "passengers": [
                {
                    "user_id": str(p.get("_id")),
                    "name": p.get("name"),
                    "email": p.get("email"),
                    "phone": p.get("phone"),
                    "status": p.get("passenger_status", "active"),
                    "total_trips": p.get("total_trips", 0),
                    "total_spent": p.get("total_spent", 0),
                    "complaints": p.get("complaint_count", 0),
                    "joined_at": p.get("created_at"),
                }
                for p in passengers
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing passengers: {str(e)}")


@router.get("/{passenger_id}")
async def get_passenger_details(
    passenger_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get detailed passenger profile"""
    try:
        from bson import ObjectId
        try:
            obj_id = ObjectId(passenger_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid passenger ID")
        
        passenger = await db.users.find_one({"_id": obj_id, "role": "passenger"})
        if not passenger:
            raise HTTPException(status_code=404, detail="Passenger not found")
        
        # Get complaints
        complaints = await db.complaints.find(
            {"passenger_id": passenger_id}
        ).sort("created_at", DESCENDING).limit(5).to_list(5)
        
        # Get ratings as passenger
        ratings = await db.ratings.find({"passenger_id": passenger_id}).limit(5).to_list(5)
        
        return {
            "passenger_id": passenger_id,
            "personal_info": {
                "name": passenger.get("name"),
                "email": passenger.get("email"),
                "phone": passenger.get("phone"),
                "date_of_birth": passenger.get("date_of_birth"),
            },
            "status": passenger.get("passenger_status", "active"),
            "statistics": {
                "total_trips": passenger.get("total_trips", 0),
                "total_spent": passenger.get("total_spent", 0),
                "average_rating": passenger.get("average_rating", 0),
                "complaints": len(complaints),
            },
            "recent_complaints": [
                {
                    "complaint_id": str(c.get("_id")),
                    "subject": c.get("subject"),
                    "status": c.get("status"),
                    "created_at": c.get("created_at"),
                    "resolved_at": c.get("resolved_at"),
                }
                for c in complaints
            ],
            "account_info": {
                "joined_at": passenger.get("created_at"),
                "last_active": passenger.get("last_active"),
                "is_verified": passenger.get("is_verified", False),
                "preferred_payment": passenger.get("preferred_payment_method"),
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching passenger details: {str(e)}")


@router.get("/{passenger_id}/complaints")
async def get_passenger_complaints(
    passenger_id: str,
    status: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get all complaints filed by passenger"""
    try:
        filters = {"passenger_id": passenger_id}
        if status:
            filters["status"] = status
        
        total = await db.complaints.count_documents(filters)
        
        complaints = await db.complaints.find(filters).sort("created_at", DESCENDING).skip(skip).limit(limit).to_list(limit)
        
        return {
            "total": total,
            "skip": skip,
            "limit": limit,
            "complaints": [
                {
                    "complaint_id": str(c.get("_id")),
                    "booking_id": c.get("booking_id"),
                    "subject": c.get("subject"),
                    "description": c.get("description"),
                    "status": c.get("status"),
                    "severity": c.get("severity"),
                    "created_at": c.get("created_at"),
                    "resolved_at": c.get("resolved_at"),
                    "resolution_notes": c.get("resolution_notes"),
                }
                for c in complaints
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching complaints: {str(e)}")


@router.get("/{passenger_id}/refund-history")
async def get_passenger_refunds(
    passenger_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get refund history for passenger"""
    try:
        total = await db.refunds.count_documents({"passenger_id": passenger_id})
        
        refunds = await db.refunds.find(
            {"passenger_id": passenger_id}
        ).sort("created_at", DESCENDING).skip(skip).limit(limit).to_list(limit)
        
        return {
            "total": total,
            "skip": skip,
            "limit": limit,
            "refunds": [
                {
                    "refund_id": str(r.get("_id")),
                    "booking_id": r.get("booking_id"),
                    "amount": r.get("amount"),
                    "refund_type": r.get("refund_type"),
                    "reason": r.get("reason"),
                    "status": r.get("status"),
                    "requested_at": r.get("created_at"),
                    "processed_at": r.get("processed_at"),
                }
                for r in refunds
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching refunds: {str(e)}")


# ==================== PUT Endpoints ====================

@router.put("/{passenger_id}/status")
async def update_passenger_status(
    passenger_id: str,
    update: PassengerStatusUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Update passenger status"""
    try:
        from bson import ObjectId
        
        valid_statuses = ["active", "inactive", "suspended", "banned"]
        if update.status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
        
        obj_id = ObjectId(passenger_id)
        
        result = await db.users.update_one(
            {"_id": obj_id, "role": "passenger"},
            {"$set": {"passenger_status": update.status, "updated_at": datetime.utcnow()}}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Passenger not found")
        
        # Log action
        await db.passenger_actions.insert_one({
            "passenger_id": passenger_id,
            "action": update.status,
            "reason": update.reason,
            "admin_id": admin_user.get("user_id"),
            "created_at": datetime.utcnow(),
        })
        
        return {
            "status": "success",
            "passenger_id": passenger_id,
            "new_status": update.status,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating passenger status: {str(e)}")


# ==================== POST Endpoints ====================

@router.post("/complaints/{complaint_id}/resolve")
async def resolve_complaint(
    complaint_id: str,
    resolution: ComplaintResolution,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Resolve a complaint with refund if applicable"""
    try:
        from bson import ObjectId
        
        comp_id = ObjectId(complaint_id)
        
        complaint = await db.complaints.find_one({"_id": comp_id})
        if not complaint:
            raise HTTPException(status_code=404, detail="Complaint not found")
        
        # Update complaint
        await db.complaints.update_one(
            {"_id": comp_id},
            {
                "$set": {
                    "status": resolution.resolution,
                    "resolution_notes": resolution.notes,
                    "resolved_at": datetime.utcnow(),
                    "resolved_by": admin_user.get("user_id"),
                    "refund_amount": resolution.refund_amount,
                }
            }
        )
        
        # Process refund if applicable
        if resolution.refund_amount and resolution.refund_amount > 0:
            await db.refunds.insert_one({
                "complaint_id": complaint_id,
                "passenger_id": complaint.get("passenger_id"),
                "booking_id": complaint.get("booking_id"),
                "amount": resolution.refund_amount,
                "reason": resolution.notes,
                "status": "approved",
                "created_at": datetime.utcnow(),
            })
            
            # Update passenger wallet
            await db.wallets.update_one(
                {"user_id": complaint.get("passenger_id")},
                {"$inc": {"balance": resolution.refund_amount}},
                upsert=True
            )
        
        return {
            "status": "success",
            "complaint_id": complaint_id,
            "resolution": resolution.resolution,
            "refund_processed": resolution.refund_amount is not None,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error resolving complaint: {str(e)}")


@router.post("/complaints/{complaint_id}/investigate")
async def investigate_complaint(
    complaint_id: str,
    investigation: ComplaintInvestigation,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Investigate a complaint"""
    try:
        from bson import ObjectId
        
        comp_id = ObjectId(complaint_id)
        
        await db.complaints.update_one(
            {"_id": comp_id},
            {
                "$set": {
                    "status": "investigating",
                    "investigation_notes": investigation.investigation_notes,
                    "findings": investigation.findings,
                    "severity": investigation.severity_level,
                    "investigating_admin": admin_user.get("user_id"),
                    "investigation_started": datetime.utcnow(),
                }
            }
        )
        
        return {
            "status": "success",
            "complaint_id": complaint_id,
            "severity": investigation.severity_level,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error investigating complaint: {str(e)}")


@router.post("/{passenger_id}/process-refund")
async def process_refund(
    passenger_id: str,
    refund: RefundProcessing,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Process refund for passenger"""
    try:
        # Create refund record
        await db.refunds.insert_one({
            "passenger_id": passenger_id,
            "booking_id": refund.booking_id,
            "amount": refund.refund_amount,
            "refund_type": refund.refund_type,
            "reason": refund.reason,
            "status": "approved",
            "processed_by": admin_user.get("user_id"),
            "created_at": datetime.utcnow(),
        })
        
        # Credit wallet
        await db.wallets.update_one(
            {"user_id": passenger_id},
            {"$inc": {"balance": refund.refund_amount}},
            upsert=True
        )
        
        # Update booking
        await db.bookings.update_one(
            {"_id": ObjectId(refund.booking_id)},
            {"$set": {"refund_status": "completed", "refund_amount": refund.refund_amount}}
        )
        
        return {
            "status": "success",
            "passenger_id": passenger_id,
            "refund_amount": refund.refund_amount,
            "refund_type": refund.refund_type,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing refund: {str(e)}")


@router.post("/bulk-action")
async def bulk_passenger_action(
    bulk_action: BulkPassengerAction,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Apply bulk actions to multiple passengers"""
    try:
        from bson import ObjectId
        
        results = {"success": [], "failed": []}
        status_map = {
            "suspend": "suspended",
            "ban": "banned",
            "activate": "active",
            "deactivate": "inactive",
        }
        new_status = status_map.get(bulk_action.action)
        
        for passenger_id in bulk_action.passenger_ids:
            try:
                obj_id = ObjectId(passenger_id)
                await db.users.update_one(
                    {"_id": obj_id, "role": "passenger"},
                    {"$set": {"passenger_status": new_status}}
                )
                
                await db.passenger_actions.insert_one({
                    "passenger_id": passenger_id,
                    "action": bulk_action.action,
                    "reason": bulk_action.reason,
                    "admin_id": admin_user.get("user_id"),
                    "created_at": datetime.utcnow(),
                })
                
                results["success"].append(passenger_id)
            except Exception as e:
                results["failed"].append({"passenger_id": passenger_id, "error": str(e)})
        
        return {
            "status": "completed",
            "action": bulk_action.action,
            "succeeded": len(results["success"]),
            "failed": len(results["failed"]),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error performing bulk action: {str(e)}")
