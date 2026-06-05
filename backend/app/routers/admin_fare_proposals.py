"""
Admin Fare Proposal Management Router
Handles admin review, approval, and rejection of driver fare proposals
"""

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field
from datetime import datetime
from app.utils.time_helpers import get_ist_now
from typing import Optional
from bson import ObjectId

from app.db.client import get_db
from app.core.auth import require_roles

router = APIRouter(prefix="/api", tags=["admin-fare-proposals"])


class ProposalApprovalRequest(BaseModel):
    """Request to approve or reject a proposal"""
    action: str = Field(..., description="Action: 'approve' or 'reject'")
    reason: Optional[str] = Field(None, description="Reason for rejection or note for approval")


def _current_user_id(user: dict) -> str:
    return str(user.get("id") or user.get("_id") or user.get("user_id") or "")


def _object_id_or_none(value: str):
    try:
        return ObjectId(value)
    except Exception:
        return None


async def _find_driver(db: AsyncIOMotorDatabase, driver_id: str):
    object_id = _object_id_or_none(driver_id)
    queries = [{"id": driver_id}, {"user_id": driver_id}]
    if object_id is not None:
        queries.extend([{"_id": object_id}, {"user_id": object_id}])

    for query in queries:
        driver = await db.drivers.find_one(query)
        if driver:
            return driver

    for query in queries:
        user = await db.users.find_one(query)
        if user:
            return user

    return None


@router.get("/admin/fares/proposals/pending")
async def get_pending_proposals(
    ride_type_filter: Optional[str] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_admin: dict = Depends(require_roles("admin")),
):
    """
    Get all pending fare proposals waiting for admin review
    Admin can filter by ride type
    """
    try:
        query = {"status": "pending"}
        
        if ride_type_filter:
            query["ride_type"] = ride_type_filter
        
        proposals = await db.driver_fare_proposals.find(query).sort("created_at", 1).to_list(None)
        
        # Format response with driver info
        formatted_proposals = []
        for proposal in proposals:
            # Get driver info
            driver = await _find_driver(db, str(proposal.get("driver_id") or ""))
            driver_name = driver.get("name", "Unknown") if driver else "Unknown"
            driver_email = driver.get("email", "N/A") if driver else "N/A"
            
            formatted_proposals.append({
                "id": str(proposal["_id"]),
                "driver_id": proposal["driver_id"],
                "driver_name": driver_name,
                "driver_email": driver_email,
                "ride_type": proposal["ride_type"],
                "base_fare": proposal["base_fare"],
                "per_km": proposal["per_km"],
                "per_minute": proposal["per_minute"],
                "minimum_fare": proposal["minimum_fare"],
                "surge_multiplier": proposal["surge_multiplier"],
                "reason": proposal["reason"],
                "status": proposal["status"],
                "created_at": proposal["created_at"],
            })
        
        return {
            "proposals": formatted_proposals,
            "total": len(formatted_proposals)
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/admin/fares/proposals/all")
async def get_all_proposals(
    status_filter: Optional[str] = None,
    driver_id_filter: Optional[str] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_admin: dict = Depends(require_roles("admin")),
):
    """
    Get all fare proposals with optional filtering
    Admins can view all proposals: pending, approved, and rejected
    """
    try:
        query = {}
        
        if status_filter and status_filter in ["pending", "approved", "rejected"]:
            query["status"] = status_filter
        
        if driver_id_filter:
            query["driver_id"] = driver_id_filter
        
        proposals = await db.driver_fare_proposals.find(query).sort("created_at", -1).to_list(None)
        
        # Format response
        formatted_proposals = []
        for proposal in proposals:
            # Get driver info
            driver = await _find_driver(db, str(proposal.get("driver_id") or ""))
            driver_name = driver.get("name", "Unknown") if driver else "Unknown"
            
            formatted_proposals.append({
                "id": str(proposal["_id"]),
                "driver_id": proposal["driver_id"],
                "driver_name": driver_name,
                "ride_type": proposal["ride_type"],
                "base_fare": proposal["base_fare"],
                "per_km": proposal["per_km"],
                "per_minute": proposal["per_minute"],
                "minimum_fare": proposal["minimum_fare"],
                "surge_multiplier": proposal["surge_multiplier"],
                "reason": proposal["reason"],
                "status": proposal["status"],
                "created_at": proposal["created_at"],
                "reviewed_at": proposal.get("reviewed_at"),
                "reviewed_by": proposal.get("reviewed_by"),
                "rejection_reason": proposal.get("rejection_reason"),
            })
        
        return {
            "proposals": formatted_proposals,
            "total": len(formatted_proposals),
            "pending_count": len([p for p in formatted_proposals if p["status"] == "pending"])
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/admin/fares/proposals/{proposal_id}")
async def get_proposal_details(
    proposal_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_admin: dict = Depends(require_roles("admin")),
):
    """
    Get detailed view of a specific proposal
    """
    try:
        proposal = await db.driver_fare_proposals.find_one({
            "_id": ObjectId(proposal_id)
        })
        
        if not proposal:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Proposal not found"
        )
        
        # Get driver info
        driver = await _find_driver(db, str(proposal.get("driver_id") or ""))
        
        return {
            "id": str(proposal["_id"]),
            "driver_id": proposal["driver_id"],
            "driver_name": driver.get("name", "Unknown") if driver else "Unknown",
            "driver_email": driver.get("email", "N/A") if driver else "N/A",
            "driver_phone": driver.get("phone", "N/A") if driver else "N/A",
            "ride_type": proposal["ride_type"],
            "base_fare": proposal["base_fare"],
            "per_km": proposal["per_km"],
            "per_minute": proposal["per_minute"],
            "minimum_fare": proposal["minimum_fare"],
            "surge_multiplier": proposal["surge_multiplier"],
            "reason": proposal["reason"],
            "status": proposal["status"],
            "created_at": proposal["created_at"],
            "reviewed_at": proposal.get("reviewed_at"),
            "reviewed_by": proposal.get("reviewed_by"),
            "rejection_reason": proposal.get("rejection_reason"),
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/admin/fares/proposals/{proposal_id}/approve")
async def approve_proposal(
    proposal_id: str,
    approval_request: ProposalApprovalRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_admin: dict = Depends(require_roles("admin")),
):
    """
    Admin approves a fare proposal
    Creates a driver fare override entry from the approved proposal
    """
    try:
        if approval_request.action.lower() != "approve":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid action for this endpoint. Use /reject for rejections."
            )
        
        proposal = await db.driver_fare_proposals.find_one({
            "_id": ObjectId(proposal_id)
        })
        
        if not proposal:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Proposal not found"
            )
        
        if proposal["status"] != "pending":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Proposal has already been {proposal['status']}"
            )
        
        # Update proposal status
        await db.driver_fare_proposals.update_one(
            {"_id": ObjectId(proposal_id)},
            {
                "$set": {
                    "status": "approved",
                    "reviewed_at": get_ist_now(),
                    "reviewed_by": _current_user_id(current_admin),
                    "rejection_reason": None,
                }
            }
        )
        
        # Create driver fare override entry
        override_doc = {
            "driver_id": proposal["driver_id"],
            "ride_type": proposal["ride_type"],
            "base_fare": proposal["base_fare"],
            "per_km": proposal["per_km"],
            "per_minute": proposal["per_minute"],
            "minimum_fare": proposal["minimum_fare"],
            "surge_multiplier": proposal["surge_multiplier"],
            "effective_from": get_ist_now(),
            "effective_to": None,  # No expiration
            "created_at": get_ist_now(),
            "updated_at": get_ist_now(),
            "approved_from_proposal": str(proposal_id),
            "approval_notes": approval_request.reason or "",
        }
        
        override_result = await db.driver_fare_override.insert_one(override_doc)
        
        return {
            "success": True,
            "message": "Proposal approved and fare override activated",
            "proposal_id": str(proposal_id),
            "status": "approved",
            "override_id": str(override_result.inserted_id),
            "effective_from": override_doc["effective_from"]
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.post("/admin/fares/proposals/{proposal_id}/reject")
async def reject_proposal(
    proposal_id: str,
    approval_request: ProposalApprovalRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_admin: dict = Depends(require_roles("admin")),
):
    """
    Admin rejects a fare proposal
    Requires reason for rejection
    """
    try:
        if approval_request.action.lower() != "reject":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid action for this endpoint. Use /approve for approvals."
            )
        
        if not approval_request.reason or len(approval_request.reason.strip()) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Reason for rejection is required"
            )
        
        proposal = await db.driver_fare_proposals.find_one({
            "_id": ObjectId(proposal_id)
        })
        
        if not proposal:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Proposal not found"
            )
        
        if proposal["status"] != "pending":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Proposal has already been {proposal['status']}"
            )
        
        # Update proposal status
        await db.driver_fare_proposals.update_one(
            {"_id": ObjectId(proposal_id)},
            {
                "$set": {
                    "status": "rejected",
                    "reviewed_at": get_ist_now(),
                    "reviewed_by": _current_user_id(current_admin),
                    "rejection_reason": approval_request.reason,
                }
            }
        )
        
        return {
            "success": True,
            "message": "Proposal rejected",
            "proposal_id": str(proposal_id),
            "status": "rejected",
            "rejection_reason": approval_request.reason
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/admin/fares/proposals/stats/summary")
async def get_proposal_stats(
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_admin: dict = Depends(require_roles("admin")),
):
    """
    Get summary statistics of all fare proposals
    """
    try:
        total = await db.driver_fare_proposals.count_documents({})
        pending = await db.driver_fare_proposals.count_documents({"status": "pending"})
        approved = await db.driver_fare_proposals.count_documents({"status": "approved"})
        rejected = await db.driver_fare_proposals.count_documents({"status": "rejected"})
        
        # Get approval rate
        processed = approved + rejected
        approval_rate = (approved / processed * 100) if processed > 0 else 0
        
        return {
            "total_proposals": total,
            "pending": pending,
            "approved": approved,
            "rejected": rejected,
            "processed": processed,
            "approval_rate": round(approval_rate, 2),
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
