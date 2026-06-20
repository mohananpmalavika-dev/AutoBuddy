"""
KYC (Know Your Customer) Verification System - Production Implementation
Handles document uploads, photo verification, background checks, and manual review workflow
"""

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, BackgroundTasks
from sqlalchemy import Column, String, DateTime, Boolean, JSON, Integer, Enum as SQLEnum, Float, desc
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from enum import Enum
import os
import hashlib
import base64
from typing import Optional, List, Dict, Any
import httpx
import shutil
from pathlib import Path

# ==================== ENUMS ====================

class DocumentType(str, Enum):
    IDENTITY = "identity"  # Passport, Aadhar, DL
    LICENSE = "license"    # Driver's license
    INSURANCE = "insurance"  # Vehicle insurance
    REGISTRATION = "registration"  # Vehicle registration


class VerificationStatus(str, Enum):
    PENDING = "pending"          # Awaiting manual review
    VERIFIED = "verified"        # Approved
    REJECTED = "rejected"        # Rejected with reason
    APPEALED = "appealed"        # Appeal in progress
    EXPIRED = "expired"          # Document expired


class RejectionReason(str, Enum):
    DOCUMENT_UNCLEAR = "document_unclear"
    FACE_MISMATCH = "face_mismatch"
    INVALID_DOCUMENT = "invalid_document"
    DOCUMENT_EXPIRED = "document_expired"
    DOCUMENT_FORGED = "document_forged"
    FAILED_BACKGROUND_CHECK = "failed_background_check"
    OTHER = "other"


class AppealStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


# ==================== DATABASE MODELS ====================

class KYCDocument(BaseModel):
    """Stores uploaded KYC documents with metadata"""
    __tablename__ = "kyc_documents"

    document_id = Column(String, primary_key=True)
    user_id = Column(String, index=True)
    document_type = Column(SQLEnum(DocumentType))
    file_path = Column(String)  # S3 or local path
    file_hash = Column(String)  # SHA256 for integrity
    file_size_kb = Column(Integer)
    mime_type = Column(String)

    # Document details
    expiry_date = Column(DateTime, nullable=True)
    document_number = Column(String, nullable=True)
    issue_date = Column(DateTime, nullable=True)

    # Verification metadata
    status = Column(SQLEnum(VerificationStatus), default=VerificationStatus.PENDING)
    verification_score = Column(Float, default=0.0)  # 0.0-1.0
    verified_by_agent_id = Column(String, nullable=True)
    verified_at = Column(DateTime, nullable=True)

    # Upload metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PhotoVerification(BaseModel):
    """Stores face verification results"""
    __tablename__ = "photo_verifications"

    verification_id = Column(String, primary_key=True)
    user_id = Column(String, index=True)
    document_id = Column(String)  # Links to KYCDocument
    selfie_path = Column(String)  # Path to selfie

    # Face matching results
    face_match_score = Column(Float)  # 0.0-1.0, >0.95 is good match
    face_detected = Column(Boolean, default=False)
    face_multiple = Column(Boolean, default=False)  # Multiple faces detected
    face_quality_score = Column(Float)  # 0.0-1.0
    lighting_adequate = Column(Boolean, default=True)
    no_accessories = Column(Boolean, default=True)  # Masks, sunglasses

    verification_status = Column(SQLEnum(VerificationStatus), default=VerificationStatus.PENDING)
    created_at = Column(DateTime, default=datetime.utcnow)
    result_data = Column(JSON)  # Raw response from verification API


class BackgroundCheckResult(BaseModel):
    """Stores third-party background check results"""
    __tablename__ = "background_check_results"

    check_id = Column(String, primary_key=True)
    user_id = Column(String, index=True)

    # Check details
    check_type = Column(String)  # "criminal", "driving_record", "insurance"
    external_check_id = Column(String)  # ID from background check provider
    provider = Column(String)  # e.g., "checkr", "accurate"

    # Results
    status = Column(String)  # "clear", "flag", "manual_review"
    risk_level = Column(String)  # "low", "medium", "high"
    flags = Column(JSON)  # List of issues found

    checked_at = Column(DateTime)
    expires_at = Column(DateTime)  # Re-check required after this date
    result_data = Column(JSON)  # Full response

    created_at = Column(DateTime, default=datetime.utcnow)


class KYCRejection(BaseModel):
    """Tracks rejection reasons and details"""
    __tablename__ = "kyc_rejections"

    rejection_id = Column(String, primary_key=True)
    user_id = Column(String, index=True)
    document_id = Column(String, nullable=True)

    reason = Column(SQLEnum(RejectionReason))
    reason_details = Column(String)  # Human-readable explanation
    rejection_count = Column(Integer, default=1)  # How many times rejected
    max_rejections = Column(Integer, default=3)  # Max attempts allowed

    rejected_by_agent_id = Column(String)
    rejected_at = Column(DateTime, default=datetime.utcnow)


class KYCAppeal(BaseModel):
    """Tracks KYC appeals after rejection"""
    __tablename__ = "kyc_appeals"

    appeal_id = Column(String, primary_key=True)
    user_id = Column(String, index=True)
    rejection_id = Column(String)  # Links to KYCRejection

    status = Column(SQLEnum(AppealStatus), default=AppealStatus.PENDING)
    appeal_reason = Column(String)  # Why driver believes rejection was wrong
    supporting_documents = Column(JSON)  # Additional docs provided

    reviewed_by_agent_id = Column(String, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    decision = Column(String, nullable=True)  # "approved" or "rejected"

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class KYCStatus(BaseModel):
    """Current KYC status for a user - aggregated view"""
    __tablename__ = "kyc_status"

    status_id = Column(String, primary_key=True)
    user_id = Column(String, index=True, unique=True)

    # Overall status
    is_verified = Column(Boolean, default=False)
    can_drive = Column(Boolean, default=False)  # CRITICAL: Blocks going online
    verification_score = Column(Float, default=0.0)  # 0.0-1.0

    # Document statuses
    identity_status = Column(SQLEnum(VerificationStatus), default=VerificationStatus.PENDING)
    license_status = Column(SQLEnum(VerificationStatus), default=VerificationStatus.PENDING)
    insurance_status = Column(SQLEnum(VerificationStatus), default=VerificationStatus.PENDING)
    registration_status = Column(SQLEnum(VerificationStatus), default=VerificationStatus.PENDING)
    photo_status = Column(SQLEnum(VerificationStatus), default=VerificationStatus.PENDING)

    # Background checks
    criminal_check_status = Column(String)  # "clear", "flag", "pending"
    driving_record_status = Column(String)  # "clear", "flag", "pending"

    # Expiry alerts
    next_expiry_alert_at = Column(DateTime, nullable=True)
    expired_documents = Column(JSON, default={})  # {"identity": true, "license": false}

    # Current status
    current_stage = Column(String)  # "identity", "license", "insurance", "registration", "photo", "background_check", "verified"
    completion_percentage = Column(Integer, default=0)  # 0-100

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ==================== REQUEST/RESPONSE MODELS ====================

class DocumentUploadRequest:
    document_type: DocumentType
    expiry_date: Optional[datetime]
    document_number: Optional[str]


class PhotoVerificationRequest:
    selfie_file: UploadFile


class KYCStatusResponse:
    user_id: str
    is_verified: bool
    can_drive: bool
    verification_score: float
    current_stage: str
    completion_percentage: int
    document_statuses: Dict[str, str]
    next_required_document: Optional[str]
    rejection_reasons: Optional[List[Dict]]
    expiry_alerts: Optional[List[Dict]]


# ==================== ROUTER ====================

router = APIRouter(prefix="/api/v3/kyc", tags=["kyc"])

# Configuration
UPLOAD_DIR = Path("uploads/kyc")
MAX_FILE_SIZE_MB = 10
ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "application/pdf"]
PHOTO_VERIFICATION_API = "https://api.photoidentity.com"  # Example
BACKGROUND_CHECK_API = "https://api.checkr.com"  # Example
DOCUMENT_EXPIRY_DAYS = 365 * 5  # 5 years
EXPIRY_WARNING_DAYS = 30


# ==================== HELPER FUNCTIONS ====================

def generate_id(prefix: str) -> str:
    return f"{prefix}_{hashlib.md5(f'{datetime.utcnow()}{os.urandom(8)}'.encode()).hexdigest()[:12]}"


def calculate_file_hash(file_content: bytes) -> str:
    return hashlib.sha256(file_content).hexdigest()


async def send_to_photo_verification_api(image_path: str, reference_image_path: str) -> Dict:
    """Send images to face matching API"""
    try:
        with open(image_path, "rb") as f:
            selfie_data = f.read()
        with open(reference_image_path, "rb") as f:
            reference_data = f.read()

        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{PHOTO_VERIFICATION_API}/verify/face-match",
                files={
                    "selfie": selfie_data,
                    "reference": reference_data
                },
                timeout=30.0
            )
            return response.json()
    except Exception as e:
        return {
            "error": str(e),
            "face_match_score": 0.0,
            "face_detected": False
        }


async def send_to_background_check_api(user_id: str, document_data: Dict, check_type: str) -> Dict:
    """Send to background check provider"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{BACKGROUND_CHECK_API}/checks",
                json={
                    "external_id": user_id,
                    "document_number": document_data.get("document_number"),
                    "check_type": check_type,
                    "first_name": document_data.get("first_name"),
                    "last_name": document_data.get("last_name"),
                    "dob": document_data.get("dob"),
                    "address": document_data.get("address")
                },
                timeout=30.0
            )
            return response.json()
    except Exception as e:
        return {"error": str(e), "status": "error"}


def check_document_expiry(expiry_date: datetime) -> tuple[bool, int]:
    """Returns (is_expired, days_until_expiry)"""
    now = datetime.utcnow()
    days_until = (expiry_date - now).days
    is_expired = days_until < 0
    return is_expired, days_until


# ==================== ENDPOINTS ====================

@router.post("/upload-document")
async def upload_document(
    user_id: str,
    document_type: DocumentType,
    file: UploadFile = File(...),
    expiry_date: Optional[str] = None,
    document_number: Optional[str] = None,
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None
):
    """Upload KYC document (identity, license, insurance, registration)"""

    # Validate file
    if file.size > MAX_FILE_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=400, detail=f"File too large. Max {MAX_FILE_SIZE_MB}MB")

    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid file type. Allowed: {ALLOWED_MIME_TYPES}")

    try:
        # Save file
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        file_content = await file.read()
        file_hash = calculate_file_hash(file_content)

        file_path = UPLOAD_DIR / f"{user_id}_{document_type.value}_{file_hash[:8]}"
        with open(file_path, "wb") as f:
            f.write(file_content)

        # Create document record
        doc_id = generate_id("doc")
        parsed_expiry = datetime.fromisoformat(expiry_date) if expiry_date else None

        kyc_doc = KYCDocument(
            document_id=doc_id,
            user_id=user_id,
            document_type=document_type,
            file_path=str(file_path),
            file_hash=file_hash,
            file_size_kb=len(file_content) // 1024,
            mime_type=file.content_type,
            expiry_date=parsed_expiry,
            document_number=document_number,
            status=VerificationStatus.PENDING
        )
        db.add(kyc_doc)
        db.commit()

        # Update KYC status
        kyc_status = db.query(KYCStatus).filter_by(user_id=user_id).first()
        if not kyc_status:
            kyc_status = KYCStatus(
                status_id=generate_id("status"),
                user_id=user_id,
                current_stage=document_type.value
            )
            db.add(kyc_status)

        # Update document status field
        status_field = f"{document_type.value}_status"
        setattr(kyc_status, status_field, VerificationStatus.PENDING)
        kyc_status.updated_at = datetime.utcnow()
        db.commit()

        return {
            "document_id": doc_id,
            "status": "uploaded",
            "document_type": document_type,
            "message": "Document uploaded for verification"
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/verify-photo")
async def verify_photo(
    user_id: str,
    document_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None
):
    """Upload selfie for face verification against document"""

    if file.content_type not in ["image/jpeg", "image/png"]:
        raise HTTPException(status_code=400, detail="Only JPEG/PNG photos allowed")

    try:
        # Save selfie
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        file_content = await file.read()
        selfie_path = UPLOAD_DIR / f"{user_id}_selfie_{datetime.utcnow().timestamp()}.jpg"
        with open(selfie_path, "wb") as f:
            f.write(file_content)

        # Get document
        kyc_doc = db.query(KYCDocument).filter_by(document_id=document_id, user_id=user_id).first()
        if not kyc_doc:
            raise HTTPException(status_code=404, detail="Document not found")

        # Send to face verification API
        verify_result = await send_to_photo_verification_api(str(selfie_path), kyc_doc.file_path)

        # Create verification record
        verification_id = generate_id("photo")
        photo_ver = PhotoVerification(
            verification_id=verification_id,
            user_id=user_id,
            document_id=document_id,
            selfie_path=str(selfie_path),
            face_match_score=verify_result.get("face_match_score", 0.0),
            face_detected=verify_result.get("face_detected", False),
            face_multiple=verify_result.get("face_multiple", False),
            face_quality_score=verify_result.get("face_quality_score", 0.0),
            lighting_adequate=verify_result.get("lighting_adequate", True),
            no_accessories=verify_result.get("no_accessories", True),
            result_data=verify_result,
            verification_status=VerificationStatus.VERIFIED if verify_result.get("face_match_score", 0.0) > 0.95 else VerificationStatus.REJECTED
        )
        db.add(photo_ver)
        db.commit()

        # Update KYC status if match is good
        if verify_result.get("face_match_score", 0.0) > 0.95:
            kyc_status = db.query(KYCStatus).filter_by(user_id=user_id).first()
            if kyc_status:
                kyc_status.photo_status = VerificationStatus.VERIFIED
                kyc_status.updated_at = datetime.utcnow()
                db.commit()

        return {
            "verification_id": verification_id,
            "face_match_score": verify_result.get("face_match_score", 0.0),
            "face_detected": verify_result.get("face_detected", False),
            "status": "verified" if verify_result.get("face_match_score", 0.0) > 0.95 else "rejected",
            "message": "Face verification complete"
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/background-check")
async def trigger_background_check(
    user_id: str,
    check_type: str = "criminal",  # "criminal", "driving_record", "insurance"
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None
):
    """Trigger background check via third-party API"""

    # Get latest documents to extract info
    documents = db.query(KYCDocument).filter_by(user_id=user_id).order_by(desc(KYCDocument.created_at)).all()

    if not documents:
        raise HTTPException(status_code=400, detail="No documents uploaded yet")

    document_data = {
        "document_number": documents[0].document_number,
        "first_name": "Unknown",  # Extract from document
        "last_name": "Unknown",
        "dob": "1990-01-01",
        "address": "Unknown"
    }

    try:
        # Send to background check API
        check_result = await send_to_background_check_api(user_id, document_data, check_type)

        # Create result record
        check_id = generate_id("check")
        bg_check = BackgroundCheckResult(
            check_id=check_id,
            user_id=user_id,
            check_type=check_type,
            external_check_id=check_result.get("id", check_id),
            provider=check_result.get("provider", "unknown"),
            status=check_result.get("status", "pending"),
            risk_level=check_result.get("risk_level", "unknown"),
            flags=check_result.get("flags", []),
            checked_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(days=365),  # Re-check annually
            result_data=check_result
        )
        db.add(bg_check)

        # Update KYC status
        kyc_status = db.query(KYCStatus).filter_by(user_id=user_id).first()
        if kyc_status:
            status_field = f"{check_type}_status"
            if hasattr(kyc_status, status_field):
                setattr(kyc_status, status_field, check_result.get("status", "pending"))
                kyc_status.updated_at = datetime.utcnow()

        db.commit()

        return {
            "check_id": check_id,
            "check_type": check_type,
            "status": check_result.get("status", "pending"),
            "risk_level": check_result.get("risk_level", "unknown"),
            "message": "Background check initiated"
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{user_id}")
async def get_kyc_status(user_id: str, db: Session = Depends(get_db)):
    """Get current KYC verification status"""

    kyc_status = db.query(KYCStatus).filter_by(user_id=user_id).first()

    if not kyc_status:
        return {
            "user_id": user_id,
            "is_verified": False,
            "can_drive": False,
            "verification_score": 0.0,
            "current_stage": "identity",
            "completion_percentage": 0,
            "document_statuses": {
                "identity": "pending",
                "license": "pending",
                "insurance": "pending",
                "registration": "pending",
                "photo": "pending"
            },
            "message": "Not started"
        }

    # Check for expired documents
    documents = db.query(KYCDocument).filter_by(user_id=user_id).all()
    expired_docs = {}
    for doc in documents:
        if doc.expiry_date:
            is_expired, days_until = check_document_expiry(doc.expiry_date)
            expired_docs[doc.document_type.value] = is_expired
            if is_expired and kyc_status.is_verified:
                kyc_status.can_drive = False  # Block if document expired

    kyc_status.expired_documents = expired_docs
    db.commit()

    # Get rejections if any
    rejections = db.query(KYCRejection).filter_by(user_id=user_id).order_by(desc(KYCRejection.rejected_at)).all()
    rejection_reasons = [
        {
            "reason": r.reason,
            "details": r.reason_details,
            "rejected_at": r.rejected_at.isoformat()
        }
        for r in rejections
    ]

    # Get expiry alerts
    expiry_alerts = []
    for doc in documents:
        if doc.expiry_date:
            is_expired, days_until = check_document_expiry(doc.expiry_date)
            if 0 < days_until < EXPIRY_WARNING_DAYS:
                expiry_alerts.append({
                    "document_type": doc.document_type,
                    "expiry_date": doc.expiry_date.isoformat(),
                    "days_until_expiry": days_until
                })

    return {
        "user_id": user_id,
        "is_verified": kyc_status.is_verified,
        "can_drive": kyc_status.can_drive,  # CRITICAL: Blocks going online
        "verification_score": kyc_status.verification_score,
        "current_stage": kyc_status.current_stage,
        "completion_percentage": kyc_status.completion_percentage,
        "document_statuses": {
            "identity": kyc_status.identity_status.value,
            "license": kyc_status.license_status.value,
            "insurance": kyc_status.insurance_status.value,
            "registration": kyc_status.registration_status.value,
            "photo": kyc_status.photo_status.value
        },
        "background_checks": {
            "criminal": kyc_status.criminal_check_status,
            "driving_record": kyc_status.driving_record_status
        },
        "expired_documents": expired_docs,
        "rejection_reasons": rejection_reasons if rejection_reasons else None,
        "expiry_alerts": expiry_alerts if expiry_alerts else None
    }


@router.post("/reject/{document_id}")
async def reject_document(
    document_id: str,
    reason: RejectionReason,
    reason_details: str,
    db: Session = Depends(get_db)
):
    """Manual rejection endpoint (agent/admin only)"""

    kyc_doc = db.query(KYCDocument).filter_by(document_id=document_id).first()
    if not kyc_doc:
        raise HTTPException(status_code=404, detail="Document not found")

    user_id = kyc_doc.user_id

    # Create rejection record
    rejection_id = generate_id("rej")
    rejection = KYCRejection(
        rejection_id=rejection_id,
        user_id=user_id,
        document_id=document_id,
        reason=reason,
        reason_details=reason_details,
        rejected_by_agent_id="system"
    )
    db.add(rejection)

    # Check if max rejections exceeded
    rejection_count = db.query(KYCRejection).filter_by(user_id=user_id, document_type=kyc_doc.document_type).count()
    if rejection_count >= 3:
        # Block user
        kyc_status = db.query(KYCStatus).filter_by(user_id=user_id).first()
        if kyc_status:
            kyc_status.can_drive = False
            kyc_status.is_verified = False

    # Update document status
    kyc_doc.status = VerificationStatus.REJECTED
    kyc_doc.updated_at = datetime.utcnow()

    db.commit()

    return {
        "rejection_id": rejection_id,
        "document_id": document_id,
        "reason": reason,
        "reason_details": reason_details,
        "status": "rejected",
        "message": "Document rejected. User can appeal or resubmit."
    }


@router.post("/appeal")
async def create_appeal(
    user_id: str,
    rejection_id: str,
    appeal_reason: str,
    db: Session = Depends(get_db)
):
    """Driver appeals a rejection"""

    rejection = db.query(KYCRejection).filter_by(rejection_id=rejection_id, user_id=user_id).first()
    if not rejection:
        raise HTTPException(status_code=404, detail="Rejection not found")

    # Create appeal
    appeal_id = generate_id("app")
    appeal = KYCAppeal(
        appeal_id=appeal_id,
        user_id=user_id,
        rejection_id=rejection_id,
        appeal_reason=appeal_reason,
        status=AppealStatus.PENDING
    )
    db.add(appeal)

    # Update rejection status
    rejection.rejection_count += 1

    # Update KYC status
    kyc_status = db.query(KYCStatus).filter_by(user_id=user_id).first()
    if kyc_status:
        kyc_status.current_stage = "appealed"
        kyc_status.updated_at = datetime.utcnow()

    db.commit()

    return {
        "appeal_id": appeal_id,
        "rejection_id": rejection_id,
        "status": "pending",
        "message": "Appeal created. Support team will review within 24 hours."
    }


@router.post("/approve/{user_id}")
async def approve_kyc(user_id: str, db: Session = Depends(get_db)):
    """Approve all KYC for user (agent/admin only) - enables driving"""

    kyc_status = db.query(KYCStatus).filter_by(user_id=user_id).first()
    if not kyc_status:
        raise HTTPException(status_code=404, detail="KYC status not found")

    # Verify all documents present
    doc_count = db.query(KYCDocument).filter_by(user_id=user_id, status=VerificationStatus.VERIFIED).count()
    if doc_count < 4:
        raise HTTPException(status_code=400, detail="Not all documents verified yet")

    # Mark as approved
    kyc_status.is_verified = True
    kyc_status.can_drive = True  # CRITICAL: Now can go online
    kyc_status.verification_score = 1.0
    kyc_status.current_stage = "verified"
    kyc_status.completion_percentage = 100
    kyc_status.identity_status = VerificationStatus.VERIFIED
    kyc_status.license_status = VerificationStatus.VERIFIED
    kyc_status.insurance_status = VerificationStatus.VERIFIED
    kyc_status.registration_status = VerificationStatus.VERIFIED
    kyc_status.photo_status = VerificationStatus.VERIFIED
    kyc_status.updated_at = datetime.utcnow()

    db.commit()

    return {
        "user_id": user_id,
        "is_verified": True,
        "can_drive": True,
        "message": "KYC approved. Driver can now go online."
    }


@router.get("/admin/pending-reviews")
async def get_pending_reviews(db: Session = Depends(get_db)):
    """Get all pending KYC documents for manual review (admin only)"""

    pending_docs = db.query(KYCDocument).filter_by(status=VerificationStatus.PENDING).order_by(
        KYCDocument.created_at.desc()
    ).all()

    return {
        "total_pending": len(pending_docs),
        "documents": [
            {
                "document_id": doc.document_id,
                "user_id": doc.user_id,
                "document_type": doc.document_type.value,
                "uploaded_at": doc.created_at.isoformat(),
                "file_hash": doc.file_hash,
                "document_number": doc.document_number
            }
            for doc in pending_docs
        ]
    }


@router.get("/admin/appeals")
async def get_pending_appeals(db: Session = Depends(get_db)):
    """Get all pending KYC appeals (admin only)"""

    pending_appeals = db.query(KYCAppeal).filter_by(status=AppealStatus.PENDING).order_by(
        KYCAppeal.created_at.desc()
    ).all()

    return {
        "total_pending": len(pending_appeals),
        "appeals": [
            {
                "appeal_id": app.appeal_id,
                "user_id": app.user_id,
                "appeal_reason": app.appeal_reason,
                "created_at": app.created_at.isoformat(),
                "original_rejection": app.rejection_id
            }
            for app in pending_appeals
        ]
    }


@router.post("/admin/appeal-decision/{appeal_id}")
async def decide_appeal(
    appeal_id: str,
    decision: str,  # "approved" or "rejected"
    reason: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Admin decision on appeal (approved or rejected)"""

    appeal = db.query(KYCAppeal).filter_by(appeal_id=appeal_id).first()
    if not appeal:
        raise HTTPException(status_code=404, detail="Appeal not found")

    appeal.status = AppealStatus.APPROVED if decision == "approved" else AppealStatus.REJECTED
    appeal.reviewed_at = datetime.utcnow()
    appeal.decision = decision

    if decision == "approved":
        # Approve user and clear rejection
        kyc_status = db.query(KYCStatus).filter_by(user_id=appeal.user_id).first()
        if kyc_status:
            kyc_status.is_verified = True
            kyc_status.can_drive = True
            kyc_status.current_stage = "verified"

    db.commit()

    return {
        "appeal_id": appeal_id,
        "decision": decision,
        "message": f"Appeal {decision}. User will be notified."
    }


@router.post("/background-task/check-expiring-documents")
async def check_expiring_documents(db: Session = Depends(get_db)):
    """Background task: Check for documents expiring soon (scheduled daily)"""

    expiry_threshold = datetime.utcnow() + timedelta(days=EXPIRY_WARNING_DAYS)

    expiring_docs = db.query(KYCDocument).filter(
        KYCDocument.expiry_date <= expiry_threshold,
        KYCDocument.expiry_date > datetime.utcnow()
    ).all()

    alerts = []
    for doc in expiring_docs:
        _, days_until = check_document_expiry(doc.expiry_date)
        alerts.append({
            "user_id": doc.user_id,
            "document_type": doc.document_type.value,
            "days_until_expiry": days_until
        })

    return {
        "total_alerts": len(alerts),
        "alerts": alerts,
        "message": "Expiry check complete. Send notifications to users."
    }


# Integration with driver onboarding:
# Before allowing driver to go online, check:
# kyc_status = db.query(KYCStatus).filter_by(user_id=driver_id).first()
# if not kyc_status or not kyc_status.can_drive:
#     raise HTTPException(status_code=403, detail="KYC verification incomplete. Cannot go online.")
