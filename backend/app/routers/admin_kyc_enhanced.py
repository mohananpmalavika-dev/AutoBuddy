"""
Admin KYC - Enhanced with OCR integration and expiration tracking
"""
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.db.deps import get_db
from app.utils.rbac import require_roles

router = APIRouter(prefix="/api/admin/kyc", tags=["admin_kyc"])


class OCRResult(BaseModel):
    """OCR extraction result"""
    document_type: str
    document_number: str
    document_holder_name: str
    expiry_date: Optional[datetime] = None
    issue_date: Optional[datetime] = None
    confidence_score: float


class KYCApproval(BaseModel):
    """KYC approval/rejection"""
    submission_id: str
    action: str  # "approved", "rejected", "pending_verification"
    admin_notes: Optional[str] = None
    ocr_verified: bool = False


async def extract_document_with_ocr(
    db: AsyncIOMotorDatabase,
    document_url: str,
    document_type: str,
) -> OCRResult:
    """Extract information from document using OCR"""
    # This would integrate with AWS Textract, Google Vision, or similar
    # For now, returning mock implementation
    
    # In production, call OCR service:
    # import boto3
    # textract = boto3.client('textract')
    # response = textract.analyze_document(
    #     Document={'S3Object': {'Bucket': bucket, 'Name': key}},
    #     FeatureTypes=['TABLES']
    # )
    
    ocr_result = OCRResult(
        document_type=document_type,
        document_number="MOCK_DOC_123",
        document_holder_name="User Name",
        expiry_date=datetime.utcnow() + timedelta(days=365),
        issue_date=datetime.utcnow() - timedelta(days=30),
        confidence_score=0.95
    )
    
    return ocr_result


async def verify_document_authenticity(
    db: AsyncIOMotorDatabase,
    document_type: str,
    document_number: str,
) -> Dict[str, Any]:
    """Verify document authenticity using government APIs"""
    # This would integrate with UIDAI, RTO, or similar
    # For now, returning mock implementation
    
    # In production, call government verification APIs
    
    return {
        "is_authentic": True,
        "verification_status": "verified",
        "verified_at": datetime.utcnow().isoformat(),
        "document_holder_matches": True
    }


async def check_document_expiry(
    expiry_date: datetime,
) -> Dict[str, Any]:
    """Check if document has expired"""
    now = datetime.utcnow()
    is_expired = now > expiry_date
    days_to_expiry = (expiry_date - now).days
    
    return {
        "is_expired": is_expired,
        "expiry_date": expiry_date.isoformat(),
        "days_to_expiry": days_to_expiry,
        "status": "expired" if is_expired else ("expiring_soon" if days_to_expiry < 30 else "valid")
    }


@router.get("/pending")
async def get_pending_kyc_submissions(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get pending KYC submissions"""
    _ = admin_user
    
    kyc_collection = db["kyc_submissions"]
    
    total = await kyc_collection.count_documents({"status": "pending"})
    
    submissions = []
    async for doc in kyc_collection.find({"status": "pending"}).skip(skip).limit(limit).sort("created_at", 1):
        submissions.append({
            "_id": str(doc.get("_id")),
            "user_id": doc.get("user_id"),
            "user_name": doc.get("user_name"),
            "user_phone": doc.get("user_phone"),
            "role": doc.get("role"),
            "submitted_at": doc.get("created_at", datetime.utcnow()).isoformat(),
            "documents": doc.get("documents", [])
        })
    
    return {
        "submissions": submissions,
        "total": total,
        "skip": skip,
        "limit": limit,
        "count": len(submissions)
    }


@router.get("/expiring")
async def get_expiring_kyc_documents(
    days: int = Query(30, ge=1, le=365),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get KYC documents expiring within specified days"""
    _ = admin_user
    
    drivers_collection = db["drivers"]
    cutoff_date = datetime.utcnow() + timedelta(days=days)
    
    pipeline = [
        {
            "$match": {
                "kyc_verified": True,
                "$or": [
                    {"license_expiry": {"$gte": datetime.utcnow(), "$lte": cutoff_date}},
                    {"registration_expiry": {"$gte": datetime.utcnow(), "$lte": cutoff_date}},
                    {"insurance_expiry": {"$gte": datetime.utcnow(), "$lte": cutoff_date}},
                ]
            }
        },
        {
            "$sort": {
                "license_expiry": 1
            }
        }
    ]
    
    expiring = []
    async for doc in drivers_collection.aggregate(pipeline):
        expiring.append({
            "user_id": doc.get("_id"),
            "user_name": doc.get("name"),
            "license_expiry": doc.get("license_expiry", datetime.utcnow()).isoformat(),
            "registration_expiry": doc.get("registration_expiry", datetime.utcnow()).isoformat(),
            "insurance_expiry": doc.get("insurance_expiry", datetime.utcnow()).isoformat(),
            "days_until_expiry": min(
                (doc.get("license_expiry", datetime.utcnow()) - datetime.utcnow()).days,
                (doc.get("registration_expiry", datetime.utcnow()) - datetime.utcnow()).days,
                (doc.get("insurance_expiry", datetime.utcnow()) - datetime.utcnow()).days
            )
        })
    
    return {
        "expiring_documents": expiring,
        "count": len(expiring),
        "within_days": days
    }


@router.post("/submit/{submission_id}")
async def process_kyc_submission(
    submission_id: str,
    approval: KYCApproval,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Process KYC submission with approval/rejection"""
    admin_id = admin_user.get("user_id", "unknown")
    
    kyc_collection = db["kyc_submissions"]
    drivers_collection = db["drivers"]
    
    submission = await kyc_collection.find_one({"_id": submission_id})
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    user_id = submission.get("user_id")
    
    if approval.action == "approved":
        # Extract and verify documents if OCR is enabled
        documents_verified = True
        document_expiry_dates = {}
        
        if approval.ocr_verified:
            for doc in submission.get("documents", []):
                try:
                    ocr_result = await extract_document_with_ocr(
                        db,
                        doc.get("url"),
                        doc.get("type")
                    )
                    
                    # Verify authenticity
                    auth_result = await verify_document_authenticity(
                        db,
                        ocr_result.document_type,
                        ocr_result.document_number
                    )
                    
                    if not auth_result.get("is_authentic"):
                        documents_verified = False
                        break
                    
                    if ocr_result.expiry_date:
                        document_expiry_dates[doc.get("type")] = ocr_result.expiry_date
                
                except Exception:
                    documents_verified = False
        
        if not documents_verified and approval.ocr_verified:
            raise HTTPException(
                status_code=400,
                detail="Document verification failed"
            )
        
        # Update driver with verified documents
        update_data = {
            "kyc_verified": True,
            "kyc_verified_at": datetime.utcnow(),
            "kyc_verified_by": admin_id,
            "kyc_status": "verified"
        }
        
        # Set expiry dates if OCR results available
        if "license" in document_expiry_dates:
            update_data["license_expiry"] = document_expiry_dates["license"]
        if "registration" in document_expiry_dates:
            update_data["registration_expiry"] = document_expiry_dates["registration"]
        if "insurance" in document_expiry_dates:
            update_data["insurance_expiry"] = document_expiry_dates["insurance"]
        
        await drivers_collection.update_one(
            {"_id": user_id},
            {"$set": update_data}
        )
        
        status = "approved"
        
    elif approval.action == "rejected":
        await drivers_collection.update_one(
            {"_id": user_id},
            {
                "$set": {
                    "kyc_verified": False,
                    "kyc_status": "rejected",
                    "kyc_rejection_reason": approval.admin_notes
                }
            }
        )
        status = "rejected"
        
    elif approval.action == "pending_verification":
        status = "pending_verification"
    else:
        raise HTTPException(status_code=400, detail="Invalid action")
    
    # Update submission
    await kyc_collection.update_one(
        {"_id": submission_id},
        {
            "$set": {
                "status": status,
                "admin_notes": approval.admin_notes,
                "processed_by": admin_id,
                "processed_at": datetime.utcnow(),
                "ocr_verified": approval.ocr_verified
            }
        }
    )
    
    return {
        "submission_id": submission_id,
        "user_id": user_id,
        "action": approval.action,
        "status": status,
        "processed_at": datetime.utcnow().isoformat()
    }


@router.get("/{submission_id}/ocr-results")
async def get_ocr_results(
    submission_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get OCR extraction results for a submission"""
    _ = admin_user
    
    kyc_collection = db["kyc_submissions"]
    submission = await kyc_collection.find_one({"_id": submission_id})
    
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    
    ocr_results = []
    
    for doc in submission.get("documents", []):
        try:
            ocr_result = await extract_document_with_ocr(
                db,
                doc.get("url"),
                doc.get("type")
            )
            
            expiry_check = await check_document_expiry(ocr_result.expiry_date or datetime.utcnow())
            
            ocr_results.append({
                "document_type": ocr_result.document_type,
                "document_number": ocr_result.document_number,
                "holder_name": ocr_result.document_holder_name,
                "confidence_score": ocr_result.confidence_score,
                "expiry_check": expiry_check
            })
        except Exception as e:
            ocr_results.append({
                "document_type": doc.get("type"),
                "error": str(e)
            })
    
    return {
        "submission_id": submission_id,
        "ocr_results": ocr_results,
        "extracted_at": datetime.utcnow().isoformat()
    }


@router.post("/bulk-verify")
async def bulk_verify_kyc(
    submission_ids: List[str],
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Bulk verify KYC submissions"""
    admin_id = admin_user.get("user_id", "unknown")
    
    kyc_collection = db["kyc_submissions"]
    drivers_collection = db["drivers"]
    
    verified_count = 0
    failed_count = 0
    
    for submission_id in submission_ids:
        try:
            submission = await kyc_collection.find_one({"_id": submission_id})
            if not submission:
                failed_count += 1
                continue
            
            user_id = submission.get("user_id")
            
            await drivers_collection.update_one(
                {"_id": user_id},
                {
                    "$set": {
                        "kyc_verified": True,
                        "kyc_verified_at": datetime.utcnow(),
                        "kyc_verified_by": admin_id,
                        "kyc_status": "verified"
                    }
                }
            )
            
            await kyc_collection.update_one(
                {"_id": submission_id},
                {
                    "$set": {
                        "status": "approved",
                        "processed_by": admin_id,
                        "processed_at": datetime.utcnow()
                    }
                }
            )
            
            verified_count += 1
        except Exception:
            failed_count += 1
    
    return {
        "verified": verified_count,
        "failed": failed_count,
        "total": len(submission_ids)
    }


@router.get("/expiry-status/{user_id}")
async def get_kyc_expiry_status(
    user_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Get KYC document expiry status for a user"""
    _ = admin_user
    
    drivers_collection = db["drivers"]
    driver = await drivers_collection.find_one({"_id": user_id})
    
    if not driver:
        raise HTTPException(status_code=404, detail="User not found")
    
    expirations = {}
    now = datetime.utcnow()
    
    for doc_type in ["license", "registration", "insurance"]:
        expiry_field = f"{doc_type}_expiry"
        expiry_date = driver.get(expiry_field)
        
        if expiry_date:
            status = "expired" if now > expiry_date else ("expiring_soon" if (expiry_date - now).days < 30 else "valid")
            expirations[doc_type] = {
                "expiry_date": expiry_date.isoformat(),
                "days_remaining": (expiry_date - now).days,
                "status": status
            }
    
    return {
        "user_id": user_id,
        "kyc_verified": driver.get("kyc_verified", False),
        "document_expirations": expirations
    }


@router.post("/send-expiry-reminder")
async def send_kyc_expiry_reminders(
    days_before: int = Query(30, ge=1, le=365),
    dry_run: bool = Query(False),
    db: AsyncIOMotorDatabase = Depends(get_db),
    admin_user: dict = Depends(require_roles("admin")),
):
    """Send reminders for expiring KYC documents"""
    _ = admin_user
    
    drivers_collection = db["drivers"]
    cutoff_date = datetime.utcnow() + timedelta(days=days_before)
    
    reminders_sent = 0
    
    pipeline = [
        {
            "$match": {
                "$or": [
                    {"license_expiry": {"$gte": datetime.utcnow(), "$lte": cutoff_date}},
                    {"registration_expiry": {"$gte": datetime.utcnow(), "$lte": cutoff_date}},
                    {"insurance_expiry": {"$gte": datetime.utcnow(), "$lte": cutoff_date}},
                ]
            }
        }
    ]
    
    async for driver in drivers_collection.aggregate(pipeline):
        if not dry_run:
            # Send SMS/email reminder
            # await send_reminder_notification(driver.get("phone"), expiry_details)
            
            await drivers_collection.update_one(
                {"_id": driver.get("_id")},
                {
                    "$set": {
                        "kyc_expiry_reminder_sent": True,
                        "kyc_expiry_reminder_sent_at": datetime.utcnow()
                    }
                }
            )
        
        reminders_sent += 1
    
    return {
        "reminders_sent": reminders_sent,
        "days_before_expiry": days_before,
        "dry_run": dry_run
    }
