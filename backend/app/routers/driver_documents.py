"""
Driver Document Management Router
Features: Document upload, status checking, grace period tracking
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel, Field
from typing import Optional, List
from bson import ObjectId
from app.db.client import get_db
from app.core.auth import require_roles
from app.models.document_catalog import (
    DOCUMENT_TYPES as DOCUMENT_CATALOG,
    effective_is_mandatory,
    ensure_default_document_requirements,
)
from app.services.file_upload import file_upload_service
import logging

logger = logging.getLogger(__name__)

IST_TZ = timezone(timedelta(hours=5, minutes=30))


def get_ist_now():
    return datetime.now(IST_TZ)


router = APIRouter(prefix="/api/driver/documents", tags=["driver-documents"])


async def _find_driver_record(db: AsyncIOMotorDatabase, driver_id: str):
    if ObjectId.is_valid(driver_id):
        driver_data = await db.drivers.find_one({"user_id": ObjectId(driver_id)})
        if driver_data:
            return driver_data
        driver_data = await db.users.find_one({"_id": ObjectId(driver_id)})
        if driver_data:
            return driver_data

    driver_data = await db.drivers.find_one({"user_id": driver_id})
    if driver_data:
        return driver_data
    return await db.users.find_one({"id": driver_id})


def _normalize_datetime(value):
    if isinstance(value, datetime):
        return value.astimezone(IST_TZ) if value.tzinfo else value.replace(tzinfo=IST_TZ)
    if isinstance(value, str):
        try:
            if value.endswith('Z'):
                value = value[:-1] + '+00:00'
            parsed = datetime.fromisoformat(value)
            return parsed.astimezone(IST_TZ) if parsed.tzinfo else parsed.replace(tzinfo=IST_TZ)
        except ValueError:
            pass
    return None


# ==================== Document Types (shared with admin)

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

class DocumentStatusResponse(BaseModel):
    """Document status for driver"""
    document_type: str
    display_name: str
    is_mandatory: bool
    is_uploaded: bool
    is_verified: Optional[bool] = None
    upload_date: Optional[str] = None
    grace_period_days: int


class DriverDocumentSummary(BaseModel):
    """Driver's overall document status"""
    can_use_services: bool
    status: str  # compliant, grace_period, non_compliant, exempt
    documents_completed: int
    documents_required: int
    grace_period_expires_at: Optional[str] = None
    days_remaining: Optional[int] = None
    message: str


# ==================== GET Endpoints ====================

@router.get("/requirements")
async def get_driver_document_requirements(
    db: AsyncIOMotorDatabase = Depends(get_db),
    driver: dict = Depends(require_roles("driver")),
):
    """Get document requirements for driver"""
    try:
        await ensure_default_document_requirements(db)
        # Get document requirements for drivers
        requirements = await db.document_requirements.find({
            "enabled": True,
            "applicable_to": {"$in": ["driver", "both"]}
        }).to_list(None)
        
        driver_id = driver.get("id")
        
        # Get driver's uploaded documents
        uploads = await db.document_uploads.find({"user_id": driver_id}).to_list(None)
        upload_map = {up.get("document_type"): up for up in uploads}
        
        requirements_list = []
        for req in requirements:
            doc_type = req.get("document_type")
            upload = upload_map.get(doc_type)
            
            requirements_list.append({
                "document_type": doc_type,
                "display_name": req.get("display_name"),
                "is_mandatory": effective_is_mandatory(req),
                "configured_is_mandatory": bool(req.get("is_mandatory")),
                "grace_period_days": req.get("grace_period_days"),
                "description": req.get("description"),
                "is_uploaded": upload is not None,
                "is_verified": upload.get("verified", False) if upload else None,
                "upload_date": upload.get("uploaded_at").isoformat() if upload and upload.get("uploaded_at") else None,
                "rejection_reason": upload.get("rejection_reason") if upload else None,
            })
        
        return {
            "total": len(requirements_list),
            "requirements": requirements_list
        }
    except Exception as e:
        logger.error(f"Error fetching driver requirements: {str(e)}")
        raise HTTPException(status_code=500, detail="Error fetching document requirements")


@router.get("/status")
async def get_driver_document_status(
    db: AsyncIOMotorDatabase = Depends(get_db),
    driver: dict = Depends(require_roles("driver")),
):
    """Get driver's document completion status"""
    try:
        driver_id = driver.get("id")
        
        # Get document requirements for drivers
        await ensure_default_document_requirements(db)
        requirements = await db.document_requirements.find({
            "enabled": True,
            "applicable_to": {"$in": ["driver", "both"]}
        }).to_list(None)
        
        # Separate mandatory and optional documents
        mandatory_docs = [req for req in requirements if effective_is_mandatory(req)]
        
        # Get driver's uploaded documents
        uploads = await db.document_uploads.find({"user_id": driver_id}).to_list(None)
        uploaded_types = {up.get("document_type") for up in uploads}
        
        # Calculate completion
        mandatory_uploaded = sum(1 for doc in mandatory_docs if doc.get("document_type") in uploaded_types)
        total_mandatory = len(mandatory_docs)
        
        # Get driver's account created date for grace period
        driver_data = await _find_driver_record(db, driver_id)
        created_at_raw = driver_data.get("created_at") if driver_data else None
        created_at = _normalize_datetime(created_at_raw) or get_ist_now()
        
        # Use the longest grace period from mandatory documents
        max_grace_days = max([req.get("grace_period_days", 7) for req in mandatory_docs], default=7) if mandatory_docs else 0
        grace_expires = created_at + timedelta(days=max_grace_days)
        days_remaining = (grace_expires - get_ist_now()).days
        
        # Determine status
        if total_mandatory == 0:
            status_value = "exempt"
            can_use = True
            message = "No mandatory documents required. You can use all services."
        elif mandatory_uploaded == total_mandatory:
            status_value = "compliant"
            can_use = True
            message = f"All mandatory documents uploaded ({mandatory_uploaded}/{total_mandatory})."
        elif days_remaining > 0:
            status_value = "grace_period"
            can_use = True
            message = f"Grace period active. Upload remaining documents within {days_remaining} days."
        else:
            status_value = "non_compliant"
            can_use = False
            message = f"Grace period expired. Please upload remaining documents ({total_mandatory - mandatory_uploaded} remaining) to use services."
        
        return {
            "can_use_services": can_use,
            "status": status_value,
            "documents_completed": mandatory_uploaded,
            "documents_required": total_mandatory,
            "grace_period_expires_at": grace_expires.isoformat() if grace_expires else None,
            "days_remaining": max(0, days_remaining) if days_remaining > 0 else 0,
            "message": message,
        }
    except Exception as e:
        logger.error(f"Error fetching driver status: {str(e)}")
        raise HTTPException(status_code=500, detail="Error fetching document status")


@router.get("/pending-approvals")
async def get_pending_approvals(
    db: AsyncIOMotorDatabase = Depends(get_db),
    driver: dict = Depends(require_roles("driver")),
):
    """Get documents pending verification"""
    try:
        driver_id = driver.get("id")
        
        # Get pending documents
        pending = await db.document_uploads.find({
            "user_id": driver_id,
            "verified": False
        }).to_list(None)
        
        return {
            "total": len(pending),
            "pending_documents": [
                {
                    "id": str(doc.get("_id")),
                    "document_type": doc.get("document_type"),
                    "uploaded_at": doc.get("uploaded_at").isoformat() if doc.get("uploaded_at") else None,
                    "rejection_reason": doc.get("rejection_reason"),
                }
                for doc in pending
            ]
        }
    except Exception as e:
        logger.error(f"Error fetching pending approvals: {str(e)}")
        raise HTTPException(status_code=500, detail="Error fetching pending documents")


# ==================== POST Endpoints ====================

@router.post("/upload/{document_type}")
async def upload_document(
    document_type: str,
    file: UploadFile = File(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
    driver: dict = Depends(require_roles("driver")),
):
    """Upload a document"""
    try:
        driver_id = driver.get("id")
        
        # Validate document type
        if document_type not in DOCUMENT_CATALOG:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid document type. Must be one of: {', '.join(DOCUMENT_CATALOG.keys())}"
            )
        
        # Verify document type exists in requirements
        await ensure_default_document_requirements(db)
        requirement = await db.document_requirements.find_one({
            "document_type": document_type,
            "enabled": True
        })
        
        if not requirement:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Document type '{document_type}' is not currently required"
            )
        
        # Read file content
        file_content = await file.read()
        if not file_content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File is empty"
            )
        
        # Upload file
        file_url = await file_upload_service.upload_file(
            file_content,
            f"documents/{driver_id}/{document_type}_{get_ist_now().timestamp()}.pdf",
            file.content_type
        )
        
        # Check if document already exists
        existing = await db.document_uploads.find_one({
            "user_id": driver_id,
            "document_type": document_type
        })
        
        if existing:
            # Update existing
            await db.document_uploads.update_one(
                {"_id": existing["_id"]},
                {
                    "$set": {
                        "file_url": file_url,
                        "uploaded_at": get_ist_now(),
                        "verified": False,
                        "rejection_reason": None,
                    }
                }
            )
            upload_id = str(existing["_id"])
        else:
            # Create new
            doc = {
                "user_id": driver_id,
                "document_type": document_type,
                "file_url": file_url,
                "uploaded_at": get_ist_now(),
                "verified": False,
                "verified_at": None,
                "verified_by": None,
                "rejection_reason": None,
                "created_at": get_ist_now(),
            }
            result = await db.document_uploads.insert_one(doc)
            upload_id = str(result.inserted_id)
        
        return {
            "upload_id": upload_id,
            "message": "Document uploaded successfully",
            "document_type": document_type,
            "file_url": file_url,
            "status": "pending_verification"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading document: {str(e)}")
        raise HTTPException(status_code=500, detail="Error uploading document")


# ==================== Service Access Check ====================

@router.get("/can-take-ride")
async def check_can_take_ride(
    db: AsyncIOMotorDatabase = Depends(get_db),
    driver: dict = Depends(require_roles("driver")),
):
    """Check if driver can take a ride based on document status"""
    try:
        driver_id = driver.get("id")
        
        # Get document requirements for drivers
        await ensure_default_document_requirements(db)
        requirements = await db.document_requirements.find({
            "enabled": True,
            "applicable_to": {"$in": ["driver", "both"]}
        }).to_list(None)
        
        # Separate mandatory documents
        mandatory_docs = [req for req in requirements if effective_is_mandatory(req)]
        
        # If no mandatory documents, driver can take ride
        if not mandatory_docs:
            return {
                "can_take_ride": True,
                "reason": "No mandatory documents required"
            }
        
        # Get driver's uploads
        uploads = await db.document_uploads.find({"user_id": driver_id}).to_list(None)
        uploaded_types = {up.get("document_type") for up in uploads}
        
        # Check if all mandatory documents uploaded
        mandatory_uploaded = all(
            doc.get("document_type") in uploaded_types 
            for doc in mandatory_docs
        )
        
        if mandatory_uploaded:
            return {
                "can_take_ride": True,
                "reason": "All mandatory documents uploaded"
            }
        
        # Check grace period
        driver_data = await _find_driver_record(db, driver_id)
        created_at_raw = driver_data.get("created_at") if driver_data else None
        created_at = _normalize_datetime(created_at_raw) or get_ist_now()
        max_grace_days = max([req.get("grace_period_days", 7) for req in mandatory_docs], default=7)
        grace_expires = created_at + timedelta(days=max_grace_days)
        
        if get_ist_now() <= grace_expires:
            days_remaining = (grace_expires - get_ist_now()).days
            return {
                "can_take_ride": True,
                "reason": f"Grace period active ({days_remaining} days remaining)"
            }
        
        # Grace period expired
        missing_docs = [
            doc.get("display_name") 
            for doc in mandatory_docs 
            if doc.get("document_type") not in uploaded_types
        ]
        
        return {
            "can_take_ride": False,
            "reason": f"Grace period expired. Please upload: {', '.join(missing_docs)}"
        }
    except Exception as e:
        logger.error(f"Error checking ride eligibility: {str(e)}")
        raise HTTPException(status_code=500, detail="Error checking ride eligibility")
