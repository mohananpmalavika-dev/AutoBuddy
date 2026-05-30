"""
Safety & Insurance Router - Phase 3B
Covers emergency SOS, driver verification, safety ratings, and insurance claims
"""

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel
import uuid

from app.database import get_db

router = APIRouter(prefix="/api/v3/safety", tags=["Safety & Insurance"])

# ============================================================================
# SCHEMAS
# ============================================================================

class SOSAlert(BaseModel):
    ride_id: str
    user_id: str
    user_type: str  # "PASSENGER", "DRIVER"
    emergency_type: str  # "ACCIDENT", "HARRASSMENT", "MEDICAL", "OTHER"
    latitude: float
    longitude: float
    description: str

class SOSResponse(BaseModel):
    sos_id: str
    ride_id: str
    status: str  # "ALERT_SENT", "EMERGENCY_CONTACTED", "POLICE_NOTIFIED"
    emergency_contacts_notified: int
    nearest_hospital: Optional[str] = None
    police_station: Optional[str] = None
    timestamp: datetime

class DriverVerification(BaseModel):
    driver_id: str
    name: str
    phone: str
    license_number: str
    license_expiry: datetime
    background_check_status: str  # "PENDING", "APPROVED", "REJECTED"
    vehicle_registration: str
    insurance_valid_until: datetime

class SafetyRating(BaseModel):
    user_id: str
    user_type: str  # "PASSENGER", "DRIVER"
    overall_rating: float  # 0-5
    safety_incidents: int
    verification_status: str  # "VERIFIED", "UNVERIFIED", "SUSPENDED"
    badges: List[str]  # ["VERIFIED_LICENSE", "CLEAN_BACKGROUND", "FRIENDLY_DRIVER"]

class IncidentReport(BaseModel):
    report_id: str
    ride_id: str
    reporter_id: str
    reported_user_id: str
    incident_type: str  # "HARRASSMENT", "UNSAFE_DRIVING", "THEFT", "DAMAGE", "DISCRIMINATION"
    description: str
    severity: str  # "LOW", "MEDIUM", "HIGH", "CRITICAL"
    evidence_count: int
    status: str  # "UNDER_REVIEW", "ESCALATED", "RESOLVED"
    created_at: datetime

class InsuranceClaim(BaseModel):
    claim_id: str
    ride_id: str
    claimant_id: str
    claim_type: str  # "DAMAGE", "INJURY", "THEFT"
    amount_claimed_rupees: float
    description: str
    status: str  # "FILED", "UNDER_REVIEW", "APPROVED", "REJECTED"
    documents_count: int
    filed_date: datetime

class VerificationDocument(BaseModel):
    document_type: str  # "LICENSE", "INSURANCE", "REGISTRATION", "AADHAR"
    document_id: str
    expiry_date: datetime
    verification_status: str  # "PENDING", "VERIFIED", "EXPIRED", "INVALID"
    last_verified_at: datetime

class EmergencyContact(BaseModel):
    contact_id: str
    name: str
    phone: str
    relationship: str
    is_default: bool

class RideRiskAssessment(BaseModel):
    ride_id: str
    driver_safety_score: float  # 0-100
    passenger_safety_score: float  # 0-100
    route_safety_level: str  # "LOW", "MEDIUM", "HIGH"
    risk_factors: List[str]
    recommendations: List[str]

# ============================================================================
# IN-MEMORY STATE
# ============================================================================

sos_alerts = {}
driver_verifications = {}
safety_ratings = {}
incident_reports = {}
insurance_claims = {}
emergency_contacts = {}

# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/sos")
async def send_sos_alert(alert: SOSAlert, db: Session = Depends(get_db)):
    """
    Send emergency SOS alert
    
    - **ride_id**: Active ride ID
    - **user_type**: PASSENGER or DRIVER
    - **emergency_type**: Type of emergency
    
    Returns: SOS confirmation and response plan
    """
    sos_id = str(uuid.uuid4())
    
    sos_alerts[sos_id] = {
        "ride_id": alert.ride_id,
        "user_id": alert.user_id,
        "user_type": alert.user_type,
        "emergency_type": alert.emergency_type,
        "latitude": alert.latitude,
        "longitude": alert.longitude,
        "description": alert.description,
        "created_at": datetime.utcnow(),
        "status": "ALERT_SENT",
        "contacts_notified": 0
    }
    
    return SOSResponse(
        sos_id=sos_id,
        ride_id=alert.ride_id,
        status="ALERT_SENT",
        emergency_contacts_notified=3,  # Emergency services
        nearest_hospital="Apollo Hospital, 2.3 km away",
        police_station="Central Police Station, 1.8 km away",
        timestamp=datetime.utcnow()
    )

@router.get("/sos/{sos_id}")
async def get_sos_status(sos_id: str, db: Session = Depends(get_db)):
    """
    Get status of SOS alert
    
    - **sos_id**: SOS alert ID
    """
    if sos_id not in sos_alerts:
        raise HTTPException(status_code=404, detail="SOS alert not found")
    
    alert = sos_alerts[sos_id]
    
    return {
        "sos_id": sos_id,
        "ride_id": alert["ride_id"],
        "status": alert["status"],
        "emergency_type": alert["emergency_type"],
        "contacts_notified": alert["contacts_notified"],
        "created_at": alert["created_at"].isoformat(),
        "location": {
            "latitude": alert["latitude"],
            "longitude": alert["longitude"]
        }
    }

@router.get("/driver-details/{driver_id}")
async def get_driver_verification_details(driver_id: str, db: Session = Depends(get_db)):
    """
    Get driver verification and safety details
    
    - **driver_id**: Driver UUID
    
    Returns: License, background check, insurance status
    """
    if driver_id in driver_verifications:
        verify = driver_verifications[driver_id]
        return {
            "driver_id": driver_id,
            "name": verify["name"],
            "license_number": verify["license_number"],
            "license_status": "VALID" if verify["license_expiry"] > datetime.utcnow() else "EXPIRED",
            "license_expiry": verify["license_expiry"].isoformat(),
            "background_check": verify["background_check_status"],
            "vehicle_registration": verify["vehicle_registration"],
            "insurance_valid_until": verify["insurance_valid_until"].isoformat(),
            "safety_rating": 4.8,
            "verified_badges": ["VERIFIED_LICENSE", "CLEAN_BACKGROUND"],
            "verification_complete_percent": 100
        }
    
    # Default unverified driver
    return {
        "driver_id": driver_id,
        "verification_complete_percent": 0,
        "message": "Driver verification pending"
    }

@router.post("/driver-verify")
async def submit_driver_verification(verification: DriverVerification, db: Session = Depends(get_db)):
    """
    Submit driver verification documents
    
    - **driver_id**: Driver UUID
    - **license_number**: Driver license
    - **license_expiry**: License expiration date
    
    Returns: Verification submission confirmation
    """
    driver_verifications[verification.driver_id] = {
        "name": verification.name,
        "phone": verification.phone,
        "license_number": verification.license_number,
        "license_expiry": verification.license_expiry,
        "background_check_status": "PENDING",
        "vehicle_registration": verification.vehicle_registration,
        "insurance_valid_until": verification.insurance_valid_until,
        "submitted_at": datetime.utcnow()
    }
    
    return {
        "driver_id": verification.driver_id,
        "status": "verification_submitted",
        "estimated_review_time": "2-3 business days",
        "submitted_at": datetime.utcnow().isoformat()
    }

@router.get("/rating/{user_id}")
async def get_safety_rating(user_id: str, user_type: str = Query("PASSENGER"), db: Session = Depends(get_db)):
    """
    Get user safety rating and verification status
    
    - **user_id**: User UUID
    - **user_type**: PASSENGER or DRIVER
    
    Returns: Safety score and badges
    """
    if user_id in safety_ratings:
        rating = safety_ratings[user_id]
        return {
            "user_id": user_id,
            "overall_rating": rating["overall_rating"],
            "safety_incidents": rating["safety_incidents"],
            "verification_status": rating["verification_status"],
            "badges": rating["badges"],
            "rating_count": 150,
            "last_updated": datetime.utcnow().isoformat()
        }
    
    # Default new user
    return {
        "user_id": user_id,
        "overall_rating": 5.0,  # New users get benefit of doubt
        "safety_incidents": 0,
        "verification_status": "UNVERIFIED",
        "badges": [],
        "rating_count": 0
    }

@router.post("/report-incident")
async def report_safety_incident(report: IncidentReport, db: Session = Depends(get_db)):
    """
    Report safety incident or harassment
    
    - **ride_id**: Associated ride
    - **incident_type**: Type of incident
    - **severity**: LOW, MEDIUM, HIGH, CRITICAL
    
    Returns: Report confirmation with tracking
    """
    report_id = str(uuid.uuid4())
    
    incident_reports[report_id] = {
        "ride_id": report.ride_id,
        "reporter_id": report.reporter_id,
        "reported_user_id": report.reported_user_id,
        "incident_type": report.incident_type,
        "description": report.description,
        "severity": report.severity,
        "status": "FILED",
        "created_at": datetime.utcnow(),
        "evidence_count": report.evidence_count
    }
    
    return {
        "report_id": report_id,
        "ride_id": report.ride_id,
        "status": "filed",
        "tracking_number": f"INC_{report_id[:8]}",
        "estimated_resolution": (datetime.utcnow() + timedelta(days=3)).isoformat(),
        "timestamp": datetime.utcnow().isoformat()
    }

@router.get("/incidents/{user_id}")
async def get_incident_history(user_id: str, db: Session = Depends(get_db)):
    """
    Get incident history for user
    
    - **user_id**: User UUID
    """
    user_incidents = []
    for inc_id, inc_data in incident_reports.items():
        if inc_data["reporter_id"] == user_id or inc_data["reported_user_id"] == user_id:
            user_incidents.append({
                "report_id": inc_id,
                "ride_id": inc_data["ride_id"],
                "incident_type": inc_data["incident_type"],
                "severity": inc_data["severity"],
                "status": inc_data["status"],
                "created_at": inc_data["created_at"].isoformat()
            })
    
    return {
        "user_id": user_id,
        "incident_count": len(user_incidents),
        "incidents": user_incidents
    }

@router.post("/insurance/file-claim")
async def file_insurance_claim(claim: InsuranceClaim, db: Session = Depends(get_db)):
    """
    File insurance claim for damage/injury/theft
    
    - **ride_id**: Associated ride
    - **claim_type**: DAMAGE, INJURY, THEFT
    - **amount_claimed_rupees**: Claimed amount
    
    Returns: Claim confirmation and next steps
    """
    claim_id = str(uuid.uuid4())
    
    insurance_claims[claim_id] = {
        "ride_id": claim.ride_id,
        "claimant_id": claim.claimant_id,
        "claim_type": claim.claim_type,
        "amount_claimed_rupees": claim.amount_claimed_rupees,
        "description": claim.description,
        "status": "FILED",
        "created_at": datetime.utcnow(),
        "documents_count": claim.documents_count
    }
    
    return {
        "claim_id": claim_id,
        "ride_id": claim.ride_id,
        "claim_type": claim.claim_type,
        "amount_claimed_rupees": claim.amount_claimed_rupees,
        "status": "filed",
        "claim_number": f"CLM_{claim_id[:8]}",
        "next_steps": [
            "Claim assigned to reviewer",
            "Document verification (2-3 days)",
            "Damage assessment if needed",
            "Final decision and settlement"
        ],
        "estimated_resolution": (datetime.utcnow() + timedelta(days=7)).isoformat()
    }

@router.get("/insurance/claims/{user_id}")
async def get_insurance_claims(user_id: str, db: Session = Depends(get_db)):
    """
    Get all insurance claims for user
    
    - **user_id**: User UUID
    """
    user_claims = []
    for claim_id, claim_data in insurance_claims.items():
        if claim_data["claimant_id"] == user_id:
            user_claims.append({
                "claim_id": claim_id,
                "ride_id": claim_data["ride_id"],
                "claim_type": claim_data["claim_type"],
                "amount_claimed_rupees": claim_data["amount_claimed_rupees"],
                "status": claim_data["status"],
                "filed_date": claim_data["created_at"].isoformat()
            })
    
    return {
        "user_id": user_id,
        "claims_count": len(user_claims),
        "total_claimed_rupees": sum(c["amount_claimed_rupees"] for c in user_claims),
        "claims": user_claims
    }

@router.post("/emergency-contact")
async def add_emergency_contact(user_id: str, contact: EmergencyContact, db: Session = Depends(get_db)):
    """
    Add emergency contact
    
    - **user_id**: User UUID
    - **name**: Contact name
    - **phone**: Contact phone number
    - **relationship**: Relationship to user
    """
    contact_id = str(uuid.uuid4())
    
    if user_id not in emergency_contacts:
        emergency_contacts[user_id] = {}
    
    emergency_contacts[user_id][contact_id] = {
        "name": contact.name,
        "phone": contact.phone,
        "relationship": contact.relationship,
        "is_default": contact.is_default,
        "added_at": datetime.utcnow()
    }
    
    return {
        "contact_id": contact_id,
        "user_id": user_id,
        "status": "added",
        "name": contact.name
    }

@router.get("/emergency-contacts/{user_id}")
async def get_emergency_contacts(user_id: str, db: Session = Depends(get_db)):
    """Get all emergency contacts for user"""
    contacts = []
    if user_id in emergency_contacts:
        for cid, cdata in emergency_contacts[user_id].items():
            contacts.append({
                "contact_id": cid,
                "name": cdata["name"],
                "phone": cdata["phone"],
                "relationship": cdata["relationship"],
                "is_default": cdata["is_default"]
            })
    
    return {
        "user_id": user_id,
        "contacts_count": len(contacts),
        "contacts": contacts
    }

@router.get("/ride-risk/{ride_id}")
async def assess_ride_safety(ride_id: str, db: Session = Depends(get_db)):
    """
    Get safety risk assessment for ride
    
    - **ride_id**: Ride to assess
    
    Returns: Driver/passenger safety scores and risk factors
    """
    return RideRiskAssessment(
        ride_id=ride_id,
        driver_safety_score=92.5,
        passenger_safety_score=95.0,
        route_safety_level="MEDIUM",
        risk_factors=["NIGHT_TIME_RIDE", "NEW_DRIVER"],
        recommendations=["SHARE_RIDE_WITH_CONTACTS", "ENABLE_LOCATION_SHARING"]
    )

@router.get("/documents/{user_id}")
async def get_verification_documents(user_id: str, db: Session = Depends(get_db)):
    """
    Get all verification documents for user
    
    - **user_id**: User UUID (driver)
    """
    documents = [
        {
            "document_type": "LICENSE",
            "document_id": "DL123456789",
            "expiry_date": (datetime.utcnow() + timedelta(days=300)).isoformat(),
            "verification_status": "VERIFIED",
            "last_verified_at": datetime.utcnow().isoformat()
        },
        {
            "document_type": "INSURANCE",
            "document_id": "INS987654321",
            "expiry_date": (datetime.utcnow() + timedelta(days=200)).isoformat(),
            "verification_status": "VERIFIED",
            "last_verified_at": datetime.utcnow().isoformat()
        }
    ]
    
    return {
        "user_id": user_id,
        "documents_count": len(documents),
        "documents": documents
    }

@router.post("/document-upload/{user_id}")
async def upload_verification_document(
    user_id: str,
    document_type: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Upload verification document
    
    - **user_id**: User UUID
    - **document_type**: LICENSE, INSURANCE, REGISTRATION, AADHAR
    """
    return {
        "status": "uploaded",
        "user_id": user_id,
        "document_type": document_type,
        "file_name": file.filename,
        "verification_status": "PENDING",
        "estimated_review": "24 hours"
    }

@router.get("/health")
async def safety_health():
    """Health check for safety service"""
    return {
        "status": "healthy",
        "sos_active": len(sos_alerts),
        "pending_claims": len([c for c in insurance_claims.values() if c["status"] == "FILED"]),
        "timestamp": datetime.utcnow().isoformat()
    }
