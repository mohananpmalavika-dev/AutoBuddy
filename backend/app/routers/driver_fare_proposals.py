"""
Driver Fare Proposals Router
Handles driver requests for custom fares requiring admin approval
"""

from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional
from bson import ObjectId

from app.db.client import get_db
from app.core.auth import require_roles

router = APIRouter(prefix="/api", tags=["driver-fare-proposals"])


class FareProposalRequest(BaseModel):
    """Driver's fare proposal"""
    ride_type: str = Field(..., description="Type of ride (standard, premium, economy)")
    base_fare: float = Field(..., ge=0, description="Base fare amount")
    per_km: float = Field(..., ge=0, description="Price per kilometer")
    per_minute: float = Field(..., ge=0, description="Price per minute")
    minimum_fare: float = Field(..., ge=0, description="Minimum fare")
    surge_multiplier: float = Field(default=1.0, ge=1.0, description="Surge pricing multiplier")
    reason: str = Field(..., description="Reason for proposing these fares")


class FareProposalResponse(BaseModel):
    """Response model for fare proposal"""
    id: str
    driver_id: str
    ride_type: str
    base_fare: float
    per_km: float
    per_minute: float
    minimum_fare: float
    surge_multiplier: float
    reason: str
    status: str  # pending, approved, rejected
    created_at: datetime
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None
    rejection_reason: Optional[str] = None


class ApprovalRequest(BaseModel):
    """Admin approval request"""
    action: str = Field(..., description="Action: approve or reject")
    reason: Optional[str] = Field(None, description="Reason for rejection (if applicable)")


def _current_user_id(user: dict) -> str:
    return str(user.get("id") or user.get("_id") or user.get("user_id") or "")


@router.post("/driver/fares/propose")
async def submit_fare_proposal(
    proposal: FareProposalRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_driver: dict = Depends(require_roles("driver")),
):
    """
    Driver submits a custom fare proposal
    Proposal requires admin approval before activation
    """
    try:
        current_driver_id = _current_user_id(current_driver)
        if not current_driver_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unable to identify current driver",
            )

        # Check if driver already has pending proposal for this ride type
        existing_proposal = await db.driver_fare_proposals.find_one({
            "driver_id": current_driver_id,
            "ride_type": proposal.ride_type,
            "status": "pending"
        })
        
        if existing_proposal:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"You already have a pending proposal for {proposal.ride_type} rides. Please wait for admin review."
            )
        
        # Create proposal document
        proposal_doc = {
            "driver_id": current_driver_id,
            "ride_type": proposal.ride_type,
            "base_fare": proposal.base_fare,
            "per_km": proposal.per_km,
            "per_minute": proposal.per_minute,
            "minimum_fare": proposal.minimum_fare,
            "surge_multiplier": proposal.surge_multiplier,
            "reason": proposal.reason,
            "status": "pending",
            "created_at": datetime.utcnow(),
            "reviewed_at": None,
            "reviewed_by": None,
            "rejection_reason": None,
        }
        
        result = await db.driver_fare_proposals.insert_one(proposal_doc)
        
        return {
            "success": True,
            "message": "Fare proposal submitted for admin review",
            "proposal_id": str(result.inserted_id),
            "status": "pending"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )


@router.get("/driver/fares/proposals")
async def get_driver_proposals(
    status_filter: Optional[str] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_driver: dict = Depends(require_roles("driver")),
):
    """
    Get all fare proposals submitted by the driver
    Can filter by status: pending, approved, rejected
    """
    try:
        current_driver_id = _current_user_id(current_driver)
        if not current_driver_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unable to identify current driver",
            )

        query = {"driver_id": current_driver_id}
        
        if status_filter and status_filter in ["pending", "approved", "rejected"]:
            query["status"] = status_filter
        
        proposals = await db.driver_fare_proposals.find(query).sort("created_at", -1).to_list(None)
        
        # Format response
        formatted_proposals = []
        for proposal in proposals:
            formatted_proposals.append({
                "id": str(proposal["_id"]),
                "driver_id": proposal["driver_id"],
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


@router.get("/driver/fares/proposals/{proposal_id}")
async def get_proposal_details(
    proposal_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_driver: dict = Depends(require_roles("driver")),
):
    """
    Get details of a specific proposal
    Only the proposal owner can view it
    """
    try:
        current_driver_id = _current_user_id(current_driver)
        if not current_driver_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unable to identify current driver",
            )

        proposal = await db.driver_fare_proposals.find_one({
            "_id": ObjectId(proposal_id),
            "driver_id": current_driver_id
        })
        
        if not proposal:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Proposal not found"
            )
        
        return {
            "id": str(proposal["_id"]),
            "driver_id": proposal["driver_id"],
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


@router.delete("/driver/fares/proposals/{proposal_id}")
async def withdraw_proposal(
    proposal_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    current_driver: dict = Depends(require_roles("driver")),
):
    """
    Withdraw a pending proposal
    Only allows withdrawal of pending proposals
    """
    try:
        current_driver_id = _current_user_id(current_driver)
        if not current_driver_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unable to identify current driver",
            )

        proposal = await db.driver_fare_proposals.find_one({
            "_id": ObjectId(proposal_id),
            "driver_id": current_driver_id,
            "status": "pending"
        })
        
        if not proposal:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Pending proposal not found or already processed"
            )
        
        await db.driver_fare_proposals.delete_one({"_id": ObjectId(proposal_id)})
        
        return {
            "success": True,
            "message": "Proposal withdrawn"
        }
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e)
        )
