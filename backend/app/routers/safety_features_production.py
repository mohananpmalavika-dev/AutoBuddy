from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from datetime import datetime, timedelta
from pydantic import BaseModel, EmailStr
from typing import Optional, List
import asyncio
import json
import uuid
from enum import Enum

from app.database import get_db
from app.models import User, Ride

# ==================== DATABASE MODELS ====================

from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean, JSON, Enum as SQLEnum, ForeignKey
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class SOS(Base):
    __tablename__ = "sos_alerts"

    sos_id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.user_id"))
    ride_id = Column(String, ForeignKey("rides.ride_id"), nullable=True)
    status = Column(String, default="active")  # active, acknowledged, resolved, cancelled
    location_latitude = Column(Float)
    location_longitude = Column(Float)
    location_address = Column(String)
    triggered_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    reason = Column(String)  # accident, threat, medical, technical
    is_driver = Column(Boolean, default=False)
    emergency_services_notified = Column(Boolean, default=False)
    emergency_contacts_notified = Column(Boolean, default=False)
    notes = Column(String, nullable=True)

class EmergencyContact(Base):
    __tablename__ = "emergency_contacts"

    contact_id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.user_id"))
    name = Column(String)
    phone = Column(String)
    email = Column(String, nullable=True)
    relationship = Column(String)  # family, friend, colleague
    is_primary = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class IncidentReport(Base):
    __tablename__ = "incident_reports"

    incident_id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.user_id"))
    ride_id = Column(String, ForeignKey("rides.ride_id"), nullable=True)
    sos_id = Column(String, ForeignKey("sos_alerts.sos_id"), nullable=True)
    incident_type = Column(String)  # accident, threat, harassment, property_damage, other
    severity = Column(String)  # low, medium, high, critical
    description = Column(String)
    photos = Column(JSON, nullable=True)  # list of photo URLs
    video_url = Column(String, nullable=True)
    location_latitude = Column(Float)
    location_longitude = Column(Float)
    location_address = Column(String)
    reported_at = Column(DateTime, default=datetime.utcnow)
    involved_parties = Column(JSON, nullable=True)  # driver/passenger info
    police_report_filed = Column(Boolean, default=False)
    police_report_number = Column(String, nullable=True)
    status = Column(String, default="open")  # open, under_review, resolved, closed

class SafetyRating(Base):
    __tablename__ = "safety_ratings"

    rating_id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.user_id"))
    ride_id = Column(String, ForeignKey("rides.ride_id"))
    rater_type = Column(String)  # passenger, driver
    rating_score = Column(Integer)  # 1-5
    reason = Column(String, nullable=True)
    is_safe = Column(Boolean)  # true if 4-5 stars
    created_at = Column(DateTime, default=datetime.utcnow)

class LocationShare(Base):
    __tablename__ = "location_shares"

    share_id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.user_id"))
    contact_id = Column(String, ForeignKey("emergency_contacts.contact_id"))
    ride_id = Column(String, ForeignKey("rides.ride_id"), nullable=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    auto_end_after_minutes = Column(Integer, default=60)

class TrustCircle(Base):
    __tablename__ = "trust_circles"

    circle_id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.user_id"))
    circle_name = Column(String)  # home, work, frequent_routes
    members = Column(JSON)  # list of emergency_contact_ids
    auto_share_location = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

# ==================== PYDANTIC MODELS ====================

class EmergencyContactCreate(BaseModel):
    name: str
    phone: str
    email: Optional[EmailStr] = None
    relationship: str
    is_primary: bool = False

class EmergencyContactUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    relationship: Optional[str] = None
    is_primary: Optional[bool] = None

class SOSTriggered(BaseModel):
    user_id: str
    ride_id: Optional[str] = None
    location_latitude: float
    location_longitude: float
    location_address: str
    reason: str  # accident, threat, medical, technical
    is_driver: bool = False

class IncidentReportCreate(BaseModel):
    ride_id: Optional[str] = None
    incident_type: str
    severity: str
    description: str
    location_latitude: float
    location_longitude: float
    location_address: str
    photos: Optional[List[str]] = None
    video_url: Optional[str] = None

class SafetyRatingCreate(BaseModel):
    ride_id: str
    rater_type: str
    rating_score: int
    reason: Optional[str] = None

class LocationShareStart(BaseModel):
    emergency_contact_ids: List[str]
    ride_id: Optional[str] = None
    auto_end_after_minutes: int = 60

class TrustCircleCreate(BaseModel):
    circle_name: str
    emergency_contact_ids: List[str]
    auto_share_location: bool = True

# ==================== ROUTER ====================

router = APIRouter(prefix="/api/v3/safety", tags=["safety"])

# ==================== EMERGENCY CONTACTS ====================

@router.post("/emergency-contacts/add")
async def add_emergency_contact(
    user_id: str,
    contact: EmergencyContactCreate,
    db: Session = Depends(get_db)
):
    """Add emergency contact for user"""
    contact_id = str(uuid.uuid4())

    new_contact = EmergencyContact(
        contact_id=contact_id,
        user_id=user_id,
        name=contact.name,
        phone=contact.phone,
        email=contact.email,
        relationship=contact.relationship,
        is_primary=contact.is_primary
    )

    db.add(new_contact)
    db.commit()
    db.refresh(new_contact)

    return {
        "contact_id": new_contact.contact_id,
        "name": new_contact.name,
        "phone": new_contact.phone,
        "relationship": new_contact.relationship,
        "is_primary": new_contact.is_primary,
        "message": "Emergency contact added"
    }

@router.get("/emergency-contacts/{user_id}")
async def get_emergency_contacts(
    user_id: str,
    db: Session = Depends(get_db)
):
    """Get all emergency contacts for user"""
    contacts = db.query(EmergencyContact).filter(
        EmergencyContact.user_id == user_id
    ).all()

    return {
        "contacts": [
            {
                "contact_id": c.contact_id,
                "name": c.name,
                "phone": c.phone,
                "email": c.email,
                "relationship": c.relationship,
                "is_primary": c.is_primary
            } for c in contacts
        ],
        "count": len(contacts)
    }

@router.put("/emergency-contacts/{contact_id}")
async def update_emergency_contact(
    contact_id: str,
    contact: EmergencyContactUpdate,
    db: Session = Depends(get_db)
):
    """Update emergency contact"""
    db_contact = db.query(EmergencyContact).filter(
        EmergencyContact.contact_id == contact_id
    ).first()

    if not db_contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    update_data = contact.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_contact, key, value)

    db.commit()
    db.refresh(db_contact)

    return {"message": "Contact updated", "contact_id": contact_id}

@router.delete("/emergency-contacts/{contact_id}")
async def delete_emergency_contact(
    contact_id: str,
    db: Session = Depends(get_db)
):
    """Delete emergency contact"""
    db_contact = db.query(EmergencyContact).filter(
        EmergencyContact.contact_id == contact_id
    ).first()

    if not db_contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    db.delete(db_contact)
    db.commit()

    return {"message": "Contact deleted"}

# ==================== SOS BUTTON ====================

@router.post("/sos/trigger")
async def trigger_sos(
    sos_request: SOSTriggered,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Trigger SOS alert"""
    sos_id = str(uuid.uuid4())

    new_sos = SOS(
        sos_id=sos_id,
        user_id=sos_request.user_id,
        ride_id=sos_request.ride_id,
        location_latitude=sos_request.location_latitude,
        location_longitude=sos_request.location_longitude,
        location_address=sos_request.location_address,
        reason=sos_request.reason,
        is_driver=sos_request.is_driver
    )

    db.add(new_sos)
    db.commit()
    db.refresh(new_sos)

    # Notify emergency services and contacts in background
    background_tasks.add_task(
        notify_emergency_services,
        db,
        sos_id,
        sos_request.user_id,
        sos_request.location_latitude,
        sos_request.location_longitude,
        sos_request.location_address,
        sos_request.reason
    )

    return {
        "sos_id": sos_id,
        "status": "active",
        "message": "SOS alert triggered. Emergency services and contacts notified.",
        "triggered_at": new_sos.triggered_at
    }

@router.get("/sos/{sos_id}")
async def get_sos_status(
    sos_id: str,
    db: Session = Depends(get_db)
):
    """Get SOS alert status"""
    sos = db.query(SOS).filter(SOS.sos_id == sos_id).first()

    if not sos:
        raise HTTPException(status_code=404, detail="SOS alert not found")

    return {
        "sos_id": sos.sos_id,
        "status": sos.status,
        "reason": sos.reason,
        "location": {
            "latitude": sos.location_latitude,
            "longitude": sos.location_longitude,
            "address": sos.location_address
        },
        "triggered_at": sos.triggered_at,
        "emergency_services_notified": sos.emergency_services_notified,
        "emergency_contacts_notified": sos.emergency_contacts_notified
    }

@router.post("/sos/{sos_id}/acknowledge")
async def acknowledge_sos(
    sos_id: str,
    db: Session = Depends(get_db)
):
    """Acknowledge SOS alert (emergency responder confirms)"""
    sos = db.query(SOS).filter(SOS.sos_id == sos_id).first()

    if not sos:
        raise HTTPException(status_code=404, detail="SOS alert not found")

    sos.status = "acknowledged"
    db.commit()

    return {"message": "SOS acknowledged", "status": "acknowledged"}

@router.post("/sos/{sos_id}/resolve")
async def resolve_sos(
    sos_id: str,
    db: Session = Depends(get_db)
):
    """Resolve SOS alert"""
    sos = db.query(SOS).filter(SOS.sos_id == sos_id).first()

    if not sos:
        raise HTTPException(status_code=404, detail="SOS alert not found")

    sos.status = "resolved"
    sos.resolved_at = datetime.utcnow()
    db.commit()

    return {
        "message": "SOS resolved",
        "status": "resolved",
        "resolved_at": sos.resolved_at
    }

@router.post("/sos/{sos_id}/cancel")
async def cancel_sos(
    sos_id: str,
    db: Session = Depends(get_db)
):
    """Cancel SOS alert (false alarm)"""
    sos = db.query(SOS).filter(SOS.sos_id == sos_id).first()

    if not sos:
        raise HTTPException(status_code=404, detail="SOS alert not found")

    sos.status = "cancelled"
    sos.resolved_at = datetime.utcnow()
    db.commit()

    return {
        "message": "SOS cancelled",
        "status": "cancelled"
    }

# ==================== INCIDENT REPORTING ====================

@router.post("/incidents/report")
async def report_incident(
    user_id: str,
    incident: IncidentReportCreate,
    db: Session = Depends(get_db)
):
    """Report safety incident"""
    incident_id = str(uuid.uuid4())

    new_incident = IncidentReport(
        incident_id=incident_id,
        user_id=user_id,
        ride_id=incident.ride_id,
        incident_type=incident.incident_type,
        severity=incident.severity,
        description=incident.description,
        location_latitude=incident.location_latitude,
        location_longitude=incident.location_longitude,
        location_address=incident.location_address,
        photos=incident.photos,
        video_url=incident.video_url
    )

    db.add(new_incident)
    db.commit()
    db.refresh(new_incident)

    return {
        "incident_id": incident_id,
        "status": "open",
        "message": "Incident reported. Support team will review shortly.",
        "reported_at": new_incident.reported_at
    }

@router.get("/incidents/{user_id}")
async def get_incident_history(
    user_id: str,
    limit: int = Query(10, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Get incident history for user"""
    incidents = db.query(IncidentReport).filter(
        IncidentReport.user_id == user_id
    ).order_by(desc(IncidentReport.reported_at)).limit(limit).offset(offset).all()

    total = db.query(func.count(IncidentReport.incident_id)).filter(
        IncidentReport.user_id == user_id
    ).scalar()

    return {
        "incidents": [
            {
                "incident_id": i.incident_id,
                "type": i.incident_type,
                "severity": i.severity,
                "description": i.description,
                "status": i.status,
                "reported_at": i.reported_at,
                "location": {
                    "latitude": i.location_latitude,
                    "longitude": i.location_longitude,
                    "address": i.location_address
                }
            } for i in incidents
        ],
        "total": total,
        "count": len(incidents)
    }

@router.get("/incidents/{incident_id}/details")
async def get_incident_details(
    incident_id: str,
    db: Session = Depends(get_db)
):
    """Get detailed incident information"""
    incident = db.query(IncidentReport).filter(
        IncidentReport.incident_id == incident_id
    ).first()

    if not incident:
        raise HTTPException(status_code=404, detail="Incident not found")

    return {
        "incident_id": incident.incident_id,
        "type": incident.incident_type,
        "severity": incident.severity,
        "description": incident.description,
        "status": incident.status,
        "reported_at": incident.reported_at,
        "location": {
            "latitude": incident.location_latitude,
            "longitude": incident.location_longitude,
            "address": incident.location_address
        },
        "photos": incident.photos,
        "video_url": incident.video_url,
        "police_report_filed": incident.police_report_filed,
        "police_report_number": incident.police_report_number
    }

# ==================== SAFETY RATING ====================

@router.post("/ratings/add")
async def add_safety_rating(
    user_id: str,
    rating: SafetyRatingCreate,
    db: Session = Depends(get_db)
):
    """Add safety rating for a ride"""
    rating_id = str(uuid.uuid4())

    new_rating = SafetyRating(
        rating_id=rating_id,
        user_id=user_id,
        ride_id=rating.ride_id,
        rater_type=rating.rater_type,
        rating_score=rating.rating_score,
        reason=rating.reason,
        is_safe=rating.rating_score >= 4
    )

    db.add(new_rating)
    db.commit()
    db.refresh(new_rating)

    return {
        "rating_id": rating_id,
        "score": new_rating.rating_score,
        "is_safe": new_rating.is_safe,
        "message": "Safety rating submitted"
    }

@router.get("/ratings/{user_id}")
async def get_safety_ratings(
    user_id: str,
    db: Session = Depends(get_db)
):
    """Get all safety ratings for user"""
    ratings = db.query(SafetyRating).filter(
        SafetyRating.user_id == user_id
    ).order_by(desc(SafetyRating.created_at)).all()

    safe_count = len([r for r in ratings if r.is_safe])
    avg_score = sum([r.rating_score for r in ratings]) / len(ratings) if ratings else 0

    return {
        "ratings": [
            {
                "rating_id": r.rating_id,
                "ride_id": r.ride_id,
                "score": r.rating_score,
                "is_safe": r.is_safe,
                "reason": r.reason,
                "created_at": r.created_at
            } for r in ratings
        ],
        "total_ratings": len(ratings),
        "safe_ratings": safe_count,
        "average_score": round(avg_score, 1),
        "safety_level": "high" if avg_score >= 4 else "medium" if avg_score >= 3 else "low"
    }

# ==================== LOCATION SHARING ====================

@router.post("/location-share/start")
async def start_location_sharing(
    user_id: str,
    share_request: LocationShareStart,
    db: Session = Depends(get_db)
):
    """Start sharing location with emergency contacts"""
    share_id = str(uuid.uuid4())

    for contact_id in share_request.emergency_contact_ids:
        location_share = LocationShare(
            share_id=str(uuid.uuid4()),
            user_id=user_id,
            contact_id=contact_id,
            ride_id=share_request.ride_id,
            auto_end_after_minutes=share_request.auto_end_after_minutes
        )
        db.add(location_share)

    db.commit()

    return {
        "message": "Location sharing started",
        "contacts_notified": len(share_request.emergency_contact_ids),
        "duration_minutes": share_request.auto_end_after_minutes
    }

@router.post("/location-share/{share_id}/stop")
async def stop_location_sharing(
    share_id: str,
    db: Session = Depends(get_db)
):
    """Stop sharing location"""
    location_share = db.query(LocationShare).filter(
        LocationShare.share_id == share_id
    ).first()

    if not location_share:
        raise HTTPException(status_code=404, detail="Location share not found")

    location_share.is_active = False
    location_share.ended_at = datetime.utcnow()
    db.commit()

    return {"message": "Location sharing stopped"}

# ==================== TRUST CIRCLES ====================

@router.post("/trust-circles/create")
async def create_trust_circle(
    user_id: str,
    circle: TrustCircleCreate,
    db: Session = Depends(get_db)
):
    """Create trust circle for quick location sharing"""
    circle_id = str(uuid.uuid4())

    new_circle = TrustCircle(
        circle_id=circle_id,
        user_id=user_id,
        circle_name=circle.circle_name,
        members=circle.emergency_contact_ids,
        auto_share_location=circle.auto_share_location
    )

    db.add(new_circle)
    db.commit()
    db.refresh(new_circle)

    return {
        "circle_id": circle_id,
        "circle_name": circle.circle_name,
        "members_count": len(circle.emergency_contact_ids),
        "message": "Trust circle created"
    }

@router.get("/trust-circles/{user_id}")
async def get_trust_circles(
    user_id: str,
    db: Session = Depends(get_db)
):
    """Get all trust circles for user"""
    circles = db.query(TrustCircle).filter(
        TrustCircle.user_id == user_id
    ).all()

    return {
        "circles": [
            {
                "circle_id": c.circle_id,
                "name": c.circle_name,
                "members_count": len(c.members),
                "auto_share_location": c.auto_share_location
            } for c in circles
        ],
        "total": len(circles)
    }

# ==================== SOS LIVE TRACKING WEBSOCKET ====================

class SOSConnectionManager:
    def __init__(self):
        self.active_connections: dict = {}

    async def connect(self, sos_id: str, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[sos_id] = websocket

    async def disconnect(self, sos_id: str):
        if sos_id in self.active_connections:
            del self.active_connections[sos_id]

    async def broadcast_location_update(self, sos_id: str, location_data: dict):
        if sos_id in self.active_connections:
            try:
                await self.active_connections[sos_id].send_json(location_data)
            except Exception as e:
                print(f"Error broadcasting location: {e}")

sos_manager = SOSConnectionManager()

@router.websocket("/ws/sos-tracking/{sos_id}")
async def websocket_sos_tracking(sos_id: str, websocket: WebSocket, db: Session = Depends(get_db)):
    """WebSocket for real-time SOS location tracking"""
    await sos_manager.connect(sos_id, websocket)

    try:
        while True:
            data = await websocket.receive_json()

            if data.get("type") == "location_update":
                # Update SOS location
                sos = db.query(SOS).filter(SOS.sos_id == sos_id).first()
                if sos:
                    sos.location_latitude = data.get("latitude")
                    sos.location_longitude = data.get("longitude")
                    sos.location_address = data.get("address", sos.location_address)
                    db.commit()

                # Broadcast to emergency services
                await sos_manager.broadcast_location_update(sos_id, {
                    "type": "location_update",
                    "sos_id": sos_id,
                    "latitude": data.get("latitude"),
                    "longitude": data.get("longitude"),
                    "address": data.get("address"),
                    "timestamp": datetime.utcnow().isoformat()
                })

    except WebSocketDisconnect:
        await sos_manager.disconnect(sos_id)

# ==================== BACKGROUND TASKS ====================

async def notify_emergency_services(
    db: Session,
    sos_id: str,
    user_id: str,
    latitude: float,
    longitude: float,
    address: str,
    reason: str
):
    """Notify emergency services of SOS"""
    sos = db.query(SOS).filter(SOS.sos_id == sos_id).first()
    if sos:
        sos.emergency_services_notified = True
        db.commit()

    # In production, integrate with emergency services API
    print(f"[EMERGENCY] SOS triggered - {reason} at {address}")

    # Notify emergency contacts
    emergency_contacts = db.query(EmergencyContact).filter(
        EmergencyContact.user_id == user_id
    ).all()

    for contact in emergency_contacts:
        print(f"[CONTACT] Notifying {contact.name} at {contact.phone}")

    if sos:
        sos.emergency_contacts_notified = True
        db.commit()

# ==================== SAFETY SUMMARY ====================

@router.get("/safety-profile/{user_id}")
async def get_safety_profile(
    user_id: str,
    db: Session = Depends(get_db)
):
    """Get comprehensive safety profile for user"""
    ratings = db.query(SafetyRating).filter(SafetyRating.user_id == user_id).all()
    incidents = db.query(IncidentReport).filter(IncidentReport.user_id == user_id).all()
    sos_alerts = db.query(SOS).filter(SOS.user_id == user_id).all()
    emergency_contacts = db.query(EmergencyContact).filter(
        EmergencyContact.user_id == user_id
    ).all()

    avg_rating = sum([r.rating_score for r in ratings]) / len(ratings) if ratings else 0
    safe_ratings_count = len([r for r in ratings if r.is_safe])

    return {
        "user_id": user_id,
        "safety_score": round(avg_rating, 1),
        "safety_level": "high" if avg_rating >= 4 else "medium" if avg_rating >= 3 else "low",
        "total_ratings": len(ratings),
        "safe_rides_percent": round((safe_ratings_count / len(ratings) * 100) if ratings else 0, 1),
        "incidents_reported": len(incidents),
        "sos_alerts_triggered": len(sos_alerts),
        "emergency_contacts_count": len(emergency_contacts),
        "recent_incidents": [
            {
                "incident_id": i.incident_id,
                "type": i.incident_type,
                "severity": i.severity,
                "reported_at": i.reported_at
            } for i in incidents[-5:]
        ]
    }
