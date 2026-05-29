"""
Admin Document Requirements Management Router
Features: Document requirement configuration, grace periods, mandatory/non-mandatory docs
"""

from fastapi import APIRouter, HTTPException, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ASCENDING, DESCENDING
from datetime import datetime, timedelta
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from bson import ObjectId
from app.db.client import get_db
from app.core.auth import require_roles
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/documents", tags=["admin-documents"])


# ==================== Document Types Definition ====================

DOCUMENT_TYPES = {
    # KYC Documents
    "passport": {"label": "Passport", "category": "KYC"},
    "national_id": {"label": "National ID / Identity Card", "category": "KYC"},
    "driving_license": {"label": "Driving License", "category": "KYC"},
    "driving_history": {"label": "Driving History Report", "category": "KYC"},
    "fitness_certificate": {"label": "Medical/Fitness Certificate", "category": "KYC"},
    "police_clearance": {"label": "Police Clearance Certificate", "category": "KYC"},
    "pan_id": {"label": "PAN / Tax ID", "category": "KYC"},
    "bank_details": {"label": "Bank Account Proof", "category": "KYC"},
    "address_proof": {"label": "Address Proof", "category": "KYC"},
    
    # Vehicle Documents
    "registration": {"label": "Vehicle Registration Certificate", "category": "Vehicle"},
    "insurance": {"label": "Insurance Certificate", "category": "Vehicle"},
    "pollution_certificate": {"label": "Pollution Certificate / PUC", "category": "Vehicle"},
    "vehicle_inspection": {"label": "Vehicle Inspection Report", "category": "Vehicle"},
    "ownership_proof": {"label": "Ownership Proof / Title Deed", "category": "Vehicle"},
    "vehicle_photo_front": {"label": "Vehicle Photo - Front", "category": "Vehicle"},
    "vehicle_photo_back": {"label": "Vehicle Photo - Back", "category": "Vehicle"},
    "vehicle_photo_interior": {"label": "Vehicle Photo - Interior", "category": "Vehicle"},
    "vehicle_inspection_sticker": {"label": "Inspection Sticker / Permit", "category": "Vehicle"},
    "loan_details": {"label": "Loan/Mortgage Documentation", "category": "Vehicle"},
    "emission_test": {"label": "Emission Test Report", "category": "Vehicle"},
}


# ==================== Models ====================

class DocumentRequirement(BaseModel):
    """Document requirement configuration"""
    document_type: str = Field(..., description="e.g., license, registration, insurance, passport, national_id, vehicle_inspection, driving_history, fitness_certificate")
    display_name: str = Field(..., description="User-friendly name")
    is_mandatory: bool = Field(default=True, description="Whether document is mandatory")
    grace_period_days: int = Field(default=7, ge=0, le=365, description="Days user has to upload document")
    applicable_to: str = Field(..., description="driver, passenger, both")
    description: Optional[str] = None
    enabled: bool = True


class DocumentRequirementUpdate(BaseModel):
    """Update document requirement"""
    display_name: Optional[str] = None
    is_mandatory: Optional[bool] = None
    grace_period_days: Optional[int] = Field(None, ge=0, le=365)
    description: Optional[str] = None
    enabled: Optional[bool] = None


class DocumentUploadTracking(BaseModel):
    """Track user document uploads"""
    user_id: str
    document_type: str
    file_url: str
    uploaded_at: datetime = Field(default_factory=datetime.utcnow)
    verified: bool = False
    verified_at: Optional[datetime] = None
    verified_by: Optional[str] = None
    rejection_reason: Optional[str] = None


class UserDocumentStatus(BaseModel):
    """User document completion status"""
    user_id: str
    status: str = Field(..., description="compliant, grace_period, non_compliant, exempt")
    documents_uploaded: int
    documents_required: int
    grace_period_expires_at: Optional[datetime] = None
    days_remaining: Optional[int] = None


class DocumentVerification(BaseModel):
    """Verify uploaded document"""
    document_id: str
    verified: bool
    rejection_reason: Optional[str] = None


# ==================== GET Endpoints ====================

@router.get("/types")
async def get_document_types():
    """Get all available document types"""
    try:
        types_list = []
        for type_key, type_info in DOCUMENT_TYPES.items():
            types_list.append({
                "value": type_key,
                "label": type_info["label"],
                "category": type_info["category"],
            })
        
        # Group by category
        kyc_docs = [t for t in types_list if t["category"] == "KYC"]
        vehicle_docs = [t for t in types_list if t["category"] == "Vehicle"]
        
        return {
            "total": len(types_list),
            "by_category": {
                "KYC": kyc_docs,
                "Vehicle": vehicle_docs,
            },
            "all": types_list,
        }
    except Exception as e:
        logger.error(f"Error fetching document types: {str(e)}")
        raise HTTPException(status_code=500, detail="Error fetching document types")


@router.get("/requirements")
async def get_document_requirements(
    applicable_to: Optional[str] = Query(None, description="driver, passenger, both"),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get all document requirements"""
    try:
        query = {"enabled": True}
        if applicable_to:
            query["applicable_to"] = {"$in": [applicable_to, "both"]}
        
        requirements = await db.document_requirements.find(query).to_list(None)
        
        return {
            "total": len(requirements),
            "requirements": [
                {
                    "id": str(doc.get("_id")),
                    "document_type": doc.get("document_type"),
                    "display_name": doc.get("display_name"),
                    "is_mandatory": doc.get("is_mandatory"),
                    "grace_period_days": doc.get("grace_period_days"),
                    "applicable_to": doc.get("applicable_to"),
                    "description": doc.get("description"),
                    "enabled": doc.get("enabled"),
                }
                for doc in requirements
            ]
        }
    except Exception as e:
        logger.error(f"Error fetching requirements: {str(e)}")
        raise HTTPException(status_code=500, detail="Error fetching document requirements")


@router.get("/user-status/{user_id}")
async def get_user_document_status(
    user_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get user document completion status"""
    try:
        # Get user role
        user = await db.users.find_one({"_id": ObjectId(user_id)})
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        
        role = user.get("role", "passenger")
        
        # Get document requirements
        requirements = await db.document_requirements.find({
            "enabled": True,
            "applicable_to": {"$in": [role, "both"]}
        }).to_list(None)
        
        # Get mandatory requirements
        mandatory_docs = [req for req in requirements if req.get("is_mandatory")]
        
        # Get user uploads
        uploads = await db.document_uploads.find({"user_id": user_id}).to_list(None)
        uploaded_types = {up.get("document_type") for up in uploads}
        
        # Calculate status
        mandatory_uploaded = sum(1 for doc in mandatory_docs if doc.get("document_type") in uploaded_types)
        total_mandatory = len(mandatory_docs)
        
        # Get user's account created date for grace period calculation
        user_created_at = user.get("created_at", datetime.utcnow())
        
        # Check grace period - use the strictest (longest) grace period
        max_grace_days = max([req.get("grace_period_days", 7) for req in mandatory_docs], default=7) if mandatory_docs else 0
        grace_expires = user_created_at + timedelta(days=max_grace_days)
        days_remaining = (grace_expires - datetime.utcnow()).days
        
        # Determine status
        if total_mandatory == 0:
            status_value = "exempt"  # All docs are non-mandatory
        elif mandatory_uploaded == total_mandatory:
            status_value = "compliant"  # All mandatory docs uploaded
        elif days_remaining > 0:
            status_value = "grace_period"  # In grace period
        else:
            status_value = "non_compliant"  # Grace period expired
        
        return {
            "user_id": user_id,
            "status": status_value,
            "documents_uploaded": mandatory_uploaded,
            "documents_required": total_mandatory,
            "grace_period_expires_at": grace_expires.isoformat() if grace_expires else None,
            "days_remaining": max(0, days_remaining),
            "can_use_services": status_value in ["compliant", "grace_period", "exempt"],
            "requirements": [
                {
                    "document_type": req.get("document_type"),
                    "display_name": req.get("display_name"),
                    "is_mandatory": req.get("is_mandatory"),
                    "uploaded": req.get("document_type") in uploaded_types,
                    "verified": any(up.get("verified", False) for up in uploads if up.get("document_type") == req.get("document_type")),
                }
                for req in requirements
            ]
        }
    except ObjectId.invalid:
        raise HTTPException(status_code=400, detail="Invalid user ID")
    except Exception as e:
        logger.error(f"Error fetching user status: {str(e)}")
        raise HTTPException(status_code=500, detail="Error fetching user document status")


@router.get("/uploads/{user_id}")
async def get_user_uploads(
    user_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get user document uploads"""
    try:
        uploads = await db.document_uploads.find({"user_id": user_id}).to_list(None)
        
        return {
            "total": len(uploads),
            "uploads": [
                {
                    "id": str(up.get("_id")),
                    "document_type": up.get("document_type"),
                    "file_url": up.get("file_url"),
                    "uploaded_at": up.get("uploaded_at").isoformat() if up.get("uploaded_at") else None,
                    "verified": up.get("verified", False),
                    "verified_at": up.get("verified_at").isoformat() if up.get("verified_at") else None,
                    "rejection_reason": up.get("rejection_reason"),
                }
                for up in uploads
            ]
        }
    except Exception as e:
        logger.error(f"Error fetching uploads: {str(e)}")
        raise HTTPException(status_code=500, detail="Error fetching user uploads")


# ==================== POST Endpoints ====================

@router.post("/requirements")
async def create_document_requirement(
    requirement: DocumentRequirement,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Create new document requirement"""
    try:
        # Validate document type
        if requirement.document_type not in DOCUMENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid document type. Must be one of: {', '.join(DOCUMENT_TYPES.keys())}"
            )
        
        # Check if document type already exists
        existing = await db.document_requirements.find_one({
            "document_type": requirement.document_type
        })
        
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Document requirement for '{requirement.document_type}' already exists"
            )
        
        doc = {
            "document_type": requirement.document_type,
            "display_name": requirement.display_name,
            "is_mandatory": requirement.is_mandatory,
            "grace_period_days": requirement.grace_period_days,
            "applicable_to": requirement.applicable_to,
            "description": requirement.description,
            "enabled": requirement.enabled,
            "category": DOCUMENT_TYPES[requirement.document_type]["category"],
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "created_by": admin_user.get("id"),
        }
        
        result = await db.document_requirements.insert_one(doc)
        
        return {
            "id": str(result.inserted_id),
            "message": "Document requirement created successfully",
            **requirement.dict()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating requirement: {str(e)}")
        raise HTTPException(status_code=500, detail="Error creating document requirement")


# ==================== PUT Endpoints ====================

@router.put("/requirements/{requirement_id}")
async def update_document_requirement(
    requirement_id: str,
    update_data: DocumentRequirementUpdate,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Update document requirement"""
    try:
        if not ObjectId.is_valid(requirement_id):
            raise HTTPException(status_code=400, detail="Invalid requirement ID")
        
        update_dict = {k: v for k, v in update_data.dict().items() if v is not None}
        update_dict["updated_at"] = datetime.utcnow()
        update_dict["updated_by"] = admin_user.get("id")
        
        result = await db.document_requirements.update_one(
            {"_id": ObjectId(requirement_id)},
            {"$set": update_dict}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Document requirement not found")
        
        return {"message": "Document requirement updated successfully"}
    except ObjectId.invalid:
        raise HTTPException(status_code=400, detail="Invalid requirement ID")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating requirement: {str(e)}")
        raise HTTPException(status_code=500, detail="Error updating document requirement")


@router.put("/verify-upload/{upload_id}")
async def verify_document_upload(
    upload_id: str,
    verification: DocumentVerification,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Verify or reject document upload"""
    try:
        if not ObjectId.is_valid(upload_id):
            raise HTTPException(status_code=400, detail="Invalid upload ID")
        
        update_data = {
            "verified": verification.verified,
            "verified_at": datetime.utcnow(),
            "verified_by": admin_user.get("id"),
        }
        
        if not verification.verified and verification.rejection_reason:
            update_data["rejection_reason"] = verification.rejection_reason
        
        result = await db.document_uploads.update_one(
            {"_id": ObjectId(upload_id)},
            {"$set": update_data}
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Document upload not found")
        
        return {
            "message": "Document verification updated successfully",
            "verified": verification.verified
        }
    except ObjectId.invalid:
        raise HTTPException(status_code=400, detail="Invalid upload ID")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error verifying upload: {str(e)}")
        raise HTTPException(status_code=500, detail="Error verifying document")


# ==================== DELETE Endpoints ====================

@router.delete("/requirements/{requirement_id}")
async def delete_document_requirement(
    requirement_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Delete document requirement (soft delete via enabled flag)"""
    try:
        if not ObjectId.is_valid(requirement_id):
            raise HTTPException(status_code=400, detail="Invalid requirement ID")
        
        result = await db.document_requirements.update_one(
            {"_id": ObjectId(requirement_id)},
            {
                "$set": {
                    "enabled": False,
                    "updated_at": datetime.utcnow(),
                    "updated_by": admin_user.get("id"),
                }
            }
        )
        
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Document requirement not found")
        
        return {"message": "Document requirement deleted successfully"}
    except ObjectId.invalid:
        raise HTTPException(status_code=400, detail="Invalid requirement ID")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting requirement: {str(e)}")
        raise HTTPException(status_code=500, detail="Error deleting document requirement")
