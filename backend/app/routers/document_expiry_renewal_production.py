"""
Document Expiry Alerts & Renewal System - Production Implementation
Handles document expiry tracking, alert notifications, renewal requests, and automatic status updates
"""

from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks, UploadFile, File
from sqlalchemy import func, desc, and_, or_
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from enum import Enum
import uuid
import os
from pathlib import Path

# Database Models
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy import Column, String, Integer, Float, DateTime, JSON, Boolean, Enum as SQLEnum, ForeignKey

Base = declarative_base()

# ==================== ENUMS ====================

class AlertType(str, Enum):
    EXPIRING_SOON = "expiring_soon"
    EXPIRED = "expired"
    RENEWAL_REQUIRED = "renewal_required"


class AlertStatus(str, Enum):
    SENT = "sent"
    ACKNOWLEDGED = "acknowledged"
    DISMISSED = "dismissed"


class Severity(str, Enum):
    WARNING = "warning"
    CRITICAL = "critical"


class RenewalStatus(str, Enum):
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    REJECTED = "rejected"


class DocumentCategory(str, Enum):
    VEHICLE_DOC = "vehicle_doc"
    KYC_DOC = "kyc_doc"
    INSURANCE = "insurance"
    REGISTRATION = "registration"


# ==================== DATABASE MODELS ====================

class DocumentExpiryAlert(Base):
    __tablename__ = "document_expiry_alerts"

    alert_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    driver_id = Column(String, nullable=False, index=True)
    document_id = Column(String, nullable=False)
    document_type = Column(String, nullable=False)
    document_type_category = Column(SQLEnum(DocumentCategory), nullable=False)
    expiry_date = Column(DateTime, nullable=False)
    alert_type = Column(SQLEnum(AlertType), nullable=False)
    alert_status = Column(SQLEnum(AlertStatus), nullable=False, default=AlertStatus.SENT)
    severity = Column(SQLEnum(Severity), nullable=False)
    days_to_expiry = Column(Integer, nullable=False)
    sent_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    acknowledged_at = Column(DateTime, nullable=True)
    dismissed_at = Column(DateTime, nullable=True)
    renewal_request_id = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class RenewalRequest(Base):
    __tablename__ = "renewal_requests"

    request_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    driver_id = Column(String, nullable=False, index=True)
    document_id = Column(String, nullable=False)
    document_type = Column(String, nullable=False)
    original_expiry_date = Column(DateTime, nullable=False)
    renewal_file_path = Column(String, nullable=False)
    renewal_uploaded_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    renewal_status = Column(SQLEnum(RenewalStatus), nullable=False, default=RenewalStatus.SUBMITTED)
    verification_status = Column(String, nullable=False, default="pending")
    verified_at = Column(DateTime, nullable=True)
    verified_by_agent_id = Column(String, nullable=True)
    rejection_reason = Column(String, nullable=True)
    renewal_notes = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class DocumentExpiryRule(Base):
    __tablename__ = "document_expiry_rules"

    rule_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    document_type = Column(String, nullable=False, unique=True)
    alert_days_before = Column(Integer, nullable=False, default=30)
    is_critical = Column(Boolean, nullable=False, default=True)
    grace_period_days = Column(Integer, nullable=True)
    auto_update_can_drive = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


# ==================== CALCULATION SERVICE ====================

class DocumentExpiryService:

    @staticmethod
    def calculate_expiry_status(expiry_date: datetime) -> Dict:
        """Calculate expiry status and alert type"""
        now = datetime.utcnow()
        days_to_expiry = (expiry_date - now).days

        if days_to_expiry < 0:
            status = "expired"
            alert_type = AlertType.EXPIRED
            severity = Severity.CRITICAL
        elif days_to_expiry <= 7:
            status = "expiring_soon"
            alert_type = AlertType.EXPIRING_SOON
            severity = Severity.CRITICAL
        elif days_to_expiry <= 30:
            status = "expiring_soon"
            alert_type = AlertType.EXPIRING_SOON
            severity = Severity.WARNING
        else:
            status = "valid"
            alert_type = None
            severity = None

        return {
            "status": status,
            "alert_type": alert_type,
            "severity": severity,
            "days_to_expiry": days_to_expiry
        }

    @staticmethod
    def create_expiry_alert(db: Session, driver_id: str, document_id: str, document_type: str,
                           document_category: DocumentCategory, expiry_date: datetime):
        """Create expiry alert for document"""
        expiry_info = DocumentExpiryService.calculate_expiry_status(expiry_date)

        if expiry_info["alert_type"] is None:
            return None

        alert = DocumentExpiryAlert(
            driver_id=driver_id,
            document_id=document_id,
            document_type=document_type,
            document_type_category=document_category,
            expiry_date=expiry_date,
            alert_type=expiry_info["alert_type"],
            severity=expiry_info["severity"],
            days_to_expiry=expiry_info["days_to_expiry"]
        )
        db.add(alert)
        db.commit()
        return alert

    @staticmethod
    def acknowledge_alert(db: Session, alert_id: str):
        """Acknowledge an alert"""
        alert = db.query(DocumentExpiryAlert).filter_by(alert_id=alert_id).first()
        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")

        alert.alert_status = AlertStatus.ACKNOWLEDGED
        alert.acknowledged_at = datetime.utcnow()
        db.commit()
        return alert

    @staticmethod
    def dismiss_alert(db: Session, alert_id: str):
        """Dismiss an alert"""
        alert = db.query(DocumentExpiryAlert).filter_by(alert_id=alert_id).first()
        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")

        alert.alert_status = AlertStatus.DISMISSED
        alert.dismissed_at = datetime.utcnow()
        db.commit()
        return alert


# ==================== ROUTER ====================

router = APIRouter(prefix="/api/v3/document-expiry", tags=["document-expiry"])

from sqlalchemy.orm import sessionmaker
SessionLocal = sessionmaker(bind=None)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ==================== ENDPOINTS ====================

@router.get("/alerts/{driver_id}")
async def get_alerts(
    driver_id: str,
    status: Optional[str] = Query(None, description="all, sent, acknowledged, dismissed"),
    days_remaining: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db)
):
    """Get all alerts for driver"""
    try:
        query = db.query(DocumentExpiryAlert).filter(DocumentExpiryAlert.driver_id == driver_id)

        if status and status != "all":
            query = query.filter(DocumentExpiryAlert.alert_status == status)

        alerts = query.order_by(desc(DocumentExpiryAlert.severity),
                               desc(DocumentExpiryAlert.sent_at)).all()

        return {
            "alerts": [
                {
                    "alert_id": alert.alert_id,
                    "document_type": alert.document_type,
                    "document_type_category": alert.document_type_category.value,
                    "expiry_date": alert.expiry_date.isoformat(),
                    "alert_type": alert.alert_type.value,
                    "severity": alert.severity.value,
                    "days_to_expiry": alert.days_to_expiry,
                    "alert_status": alert.alert_status.value,
                    "sent_at": alert.sent_at.isoformat()
                }
                for alert in alerts
            ],
            "summary": {
                "total": len(alerts),
                "critical": len([a for a in alerts if a.severity == Severity.CRITICAL]),
                "warning": len([a for a in alerts if a.severity == Severity.WARNING]),
                "acknowledged": len([a for a in alerts if a.alert_status == AlertStatus.ACKNOWLEDGED]),
                "dismissed": len([a for a in alerts if a.alert_status == AlertStatus.DISMISSED])
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/alerts/{driver_id}/{alert_id}")
async def get_alert_detail(driver_id: str, alert_id: str, db: Session = Depends(get_db)):
    """Get detailed alert information"""
    try:
        alert = db.query(DocumentExpiryAlert).filter(
            and_(
                DocumentExpiryAlert.driver_id == driver_id,
                DocumentExpiryAlert.alert_id == alert_id
            )
        ).first()

        if not alert:
            raise HTTPException(status_code=404, detail="Alert not found")

        return {
            "alert_id": alert.alert_id,
            "document_type": alert.document_type,
            "document_category": alert.document_type_category.value,
            "expiry_date": alert.expiry_date.isoformat(),
            "alert_type": alert.alert_type.value,
            "severity": alert.severity.value,
            "days_to_expiry": alert.days_to_expiry,
            "alert_status": alert.alert_status.value,
            "sent_at": alert.sent_at.isoformat(),
            "acknowledged_at": alert.acknowledged_at.isoformat() if alert.acknowledged_at else None,
            "dismissed_at": alert.dismissed_at.isoformat() if alert.dismissed_at else None,
            "next_action": "renew_now" if alert.days_to_expiry <= 7 else "monitor"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, db: Session = Depends(get_db)):
    """Acknowledge an alert"""
    try:
        alert = DocumentExpiryService.acknowledge_alert(db, alert_id)
        return {
            "acknowledged_at": alert.acknowledged_at.isoformat(),
            "message": "Alert acknowledged"
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/alerts/{alert_id}/dismiss")
async def dismiss_alert(alert_id: str, db: Session = Depends(get_db)):
    """Dismiss an alert"""
    try:
        alert = DocumentExpiryService.dismiss_alert(db, alert_id)
        return {
            "dismissed_at": alert.dismissed_at.isoformat(),
            "message": "Alert dismissed"
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents/{driver_id}/expiring")
async def get_expiring_documents(
    driver_id: str,
    days_remaining: int = Query(30, ge=1, le=365),
    category: Optional[str] = Query("all", description="all, vehicle, kyc"),
    db: Session = Depends(get_db)
):
    """Get list of expiring documents for driver"""
    try:
        query = db.query(DocumentExpiryAlert).filter(
            and_(
                DocumentExpiryAlert.driver_id == driver_id,
                DocumentExpiryAlert.alert_status != AlertStatus.DISMISSED,
                DocumentExpiryAlert.days_to_expiry >= -1,
                DocumentExpiryAlert.days_to_expiry <= days_remaining
            )
        )

        if category != "all":
            if category == "vehicle":
                query = query.filter(
                    DocumentExpiryAlert.document_type_category.in_([
                        DocumentCategory.VEHICLE_DOC,
                        DocumentCategory.INSURANCE,
                        DocumentCategory.REGISTRATION
                    ])
                )
            elif category == "kyc":
                query = query.filter(DocumentExpiryAlert.document_type_category == DocumentCategory.KYC_DOC)

        documents = query.order_by(
            DocumentExpiryAlert.days_to_expiry,
            desc(DocumentExpiryAlert.severity)
        ).all()

        return {
            "documents": [
                {
                    "document_id": doc.document_id,
                    "document_type": doc.document_type,
                    "category": doc.document_type_category.value,
                    "expiry_date": doc.expiry_date.isoformat(),
                    "days_to_expiry": doc.days_to_expiry,
                    "severity": doc.severity.value,
                    "status": "expired" if doc.days_to_expiry < 0 else "expiring_soon"
                }
                for doc in documents
            ],
            "total": len(documents),
            "expired": len([d for d in documents if d.days_to_expiry < 0]),
            "expiring_soon": len([d for d in documents if 0 <= d.days_to_expiry <= days_remaining])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/renewals/{driver_id}/submit")
async def submit_renewal(
    driver_id: str,
    document_id: str = Query(...),
    document_type: str = Query(...),
    file: UploadFile = File(...),
    notes: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Submit document renewal"""
    try:
        upload_dir = Path("uploads/renewals")
        upload_dir.mkdir(parents=True, exist_ok=True)

        file_path = f"renewals/{document_id}_{datetime.utcnow().timestamp()}_{file.filename}"
        full_path = upload_dir / f"{document_id}_{datetime.utcnow().timestamp()}_{file.filename}"

        with open(full_path, "wb") as f:
            f.write(await file.read())

        alert = db.query(DocumentExpiryAlert).filter_by(document_id=document_id).first()
        original_expiry = alert.expiry_date if alert else None

        renewal = RenewalRequest(
            driver_id=driver_id,
            document_id=document_id,
            document_type=document_type,
            original_expiry_date=original_expiry or datetime.utcnow(),
            renewal_file_path=str(file_path),
            renewal_notes=notes
        )
        db.add(renewal)
        db.commit()

        return {
            "request_id": renewal.request_id,
            "renewal_status": renewal.renewal_status.value,
            "message": "Renewal submitted successfully. Under review."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/renewals/{driver_id}")
async def get_renewals(driver_id: str, db: Session = Depends(get_db)):
    """Get all renewal requests for driver"""
    try:
        renewals = db.query(RenewalRequest).filter_by(driver_id=driver_id).order_by(
            desc(RenewalRequest.created_at)
        ).all()

        return {
            "renewals": [
                {
                    "request_id": renewal.request_id,
                    "document_type": renewal.document_type,
                    "original_expiry_date": renewal.original_expiry_date.isoformat(),
                    "renewal_status": renewal.renewal_status.value,
                    "verification_status": renewal.verification_status,
                    "renewal_uploaded_at": renewal.renewal_uploaded_at.isoformat(),
                    "verified_at": renewal.verified_at.isoformat() if renewal.verified_at else None,
                    "rejection_reason": renewal.rejection_reason
                }
                for renewal in renewals
            ],
            "total": len(renewals),
            "pending": len([r for r in renewals if r.renewal_status in [RenewalStatus.SUBMITTED, RenewalStatus.UNDER_REVIEW]]),
            "approved": len([r for r in renewals if r.renewal_status == RenewalStatus.APPROVED]),
            "rejected": len([r for r in renewals if r.renewal_status == RenewalStatus.REJECTED])
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/renewals/{driver_id}/{request_id}")
async def get_renewal_detail(driver_id: str, request_id: str, db: Session = Depends(get_db)):
    """Get detailed renewal request"""
    try:
        renewal = db.query(RenewalRequest).filter(
            and_(
                RenewalRequest.driver_id == driver_id,
                RenewalRequest.request_id == request_id
            )
        ).first()

        if not renewal:
            raise HTTPException(status_code=404, detail="Renewal request not found")

        return {
            "request_id": renewal.request_id,
            "document_type": renewal.document_type,
            "original_expiry_date": renewal.original_expiry_date.isoformat(),
            "renewal_status": renewal.renewal_status.value,
            "verification_status": renewal.verification_status,
            "renewal_uploaded_at": renewal.renewal_uploaded_at.isoformat(),
            "verified_at": renewal.verified_at.isoformat() if renewal.verified_at else None,
            "verified_by_agent_id": renewal.verified_by_agent_id,
            "rejection_reason": renewal.rejection_reason,
            "renewal_notes": renewal.renewal_notes,
            "created_at": renewal.created_at.isoformat()
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/background-task/check-and-expire")
async def check_and_expire_documents(
    days_threshold: int = Query(0, description="Update docs expired before this many days"),
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None
):
    """Background task: Check and update expired documents"""
    try:
        now = datetime.utcnow()
        expiry_cutoff = now + timedelta(days=days_threshold)

        updated = db.query(DocumentExpiryAlert).filter(
            and_(
                DocumentExpiryAlert.expiry_date <= expiry_cutoff,
                DocumentExpiryAlert.alert_type != AlertType.EXPIRED
            )
        ).all()

        for doc_alert in updated:
            doc_alert.alert_type = AlertType.EXPIRED
            doc_alert.severity = Severity.CRITICAL
            doc_alert.days_to_expiry = (doc_alert.expiry_date - now).days

        db.commit()

        return {
            "updated_count": len(updated),
            "expired_count": len([d for d in updated if d.days_to_expiry < 0]),
            "can_drive_updates": len([d for d in updated if d.document_type_category == DocumentCategory.KYC_DOC]),
            "message": f"Updated {len(updated)} document expiry statuses"
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
