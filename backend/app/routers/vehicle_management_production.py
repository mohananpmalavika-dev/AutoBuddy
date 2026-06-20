from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from datetime import datetime, timedelta
from pydantic import BaseModel
from typing import Optional, List
import uuid
from enum import Enum

from app.database import get_db
from app.models import User

# ==================== DATABASE MODELS ====================

from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean, JSON, Enum as SQLEnum, ForeignKey
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class Vehicle(Base):
    __tablename__ = "vehicles"

    vehicle_id = Column(String, primary_key=True)
    driver_id = Column(String, ForeignKey("users.user_id"))
    vehicle_type = Column(String)  # economy, premium, xl
    registration_number = Column(String, unique=True)
    make = Column(String)  # Maruti, Honda, etc.
    model = Column(String)  # Swift, City, etc.
    year = Column(Integer)
    color = Column(String)
    vin = Column(String, nullable=True)  # Vehicle Identification Number
    license_plate = Column(String)
    seating_capacity = Column(Integer, default=4)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class VehicleDocument(Base):
    __tablename__ = "vehicle_documents"

    document_id = Column(String, primary_key=True)
    vehicle_id = Column(String, ForeignKey("vehicles.vehicle_id"))
    driver_id = Column(String, ForeignKey("users.user_id"))
    document_type = Column(String)  # rc, insurance, pollution, tax, permit
    document_number = Column(String)
    document_url = Column(String)  # S3 URL
    issued_date = Column(DateTime)
    expiry_date = Column(DateTime)
    is_verified = Column(Boolean, default=False)
    verification_status = Column(String, default="pending")  # pending, verified, rejected, expired
    rejection_reason = Column(String, nullable=True)
    uploaded_at = Column(DateTime, default=datetime.utcnow)
    verified_at = Column(DateTime, nullable=True)
    days_to_expiry = Column(Integer, default=0)  # calculated field
    is_expiring_soon = Column(Boolean, default=False)  # true if < 30 days
    alert_sent = Column(Boolean, default=False)

class VehicleInsurance(Base):
    __tablename__ = "vehicle_insurance"

    insurance_id = Column(String, primary_key=True)
    vehicle_id = Column(String, ForeignKey("vehicles.vehicle_id"))
    driver_id = Column(String, ForeignKey("users.user_id"))
    provider_name = Column(String)  # ICICI, HDFC, etc.
    policy_number = Column(String, unique=True)
    cover_type = Column(String)  # third_party, comprehensive
    sum_insured = Column(Float)
    start_date = Column(DateTime)
    expiry_date = Column(DateTime)
    premium_amount = Column(Float)
    renewal_date = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)
    days_to_expiry = Column(Integer, default=0)
    renewal_alert_sent = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class VehicleRegistration(Base):
    __tablename__ = "vehicle_registrations"

    registration_id = Column(String, primary_key=True)
    vehicle_id = Column(String, ForeignKey("vehicles.vehicle_id"))
    driver_id = Column(String, ForeignKey("users.user_id"))
    rc_number = Column(String, unique=True)
    issued_date = Column(DateTime)
    expiry_date = Column(DateTime)
    registration_type = Column(String)  # commercial, personal
    is_verified = Column(Boolean, default=False)
    days_to_expiry = Column(Integer, default=0)
    renewal_alert_sent = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class PollutionCertificate(Base):
    __tablename__ = "pollution_certificates"

    certificate_id = Column(String, primary_key=True)
    vehicle_id = Column(String, ForeignKey("vehicles.vehicle_id"))
    driver_id = Column(String, ForeignKey("users.user_id"))
    certificate_number = Column(String)
    issued_date = Column(DateTime)
    expiry_date = Column(DateTime)
    test_center = Column(String)
    test_result = Column(String)  # pass, fail
    is_verified = Column(Boolean, default=False)
    days_to_expiry = Column(Integer, default=0)
    renewal_alert_sent = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

class MaintenanceRecord(Base):
    __tablename__ = "maintenance_records"

    maintenance_id = Column(String, primary_key=True)
    vehicle_id = Column(String, ForeignKey("vehicles.vehicle_id"))
    driver_id = Column(String, ForeignKey("users.user_id"))
    service_type = Column(String)  # oil_change, tire_rotation, inspection, repair, other
    description = Column(String)
    maintenance_date = Column(DateTime)
    next_due_date = Column(DateTime, nullable=True)
    cost = Column(Float, nullable=True)
    service_center = Column(String)
    notes = Column(String, nullable=True)
    odometer_reading = Column(Integer, nullable=True)
    parts_replaced = Column(JSON, nullable=True)  # list of parts
    created_at = Column(DateTime, default=datetime.utcnow)

class MaintenanceReminder(Base):
    __tablename__ = "maintenance_reminders"

    reminder_id = Column(String, primary_key=True)
    vehicle_id = Column(String, ForeignKey("vehicles.vehicle_id"))
    driver_id = Column(String, ForeignKey("users.user_id"))
    service_type = Column(String)  # oil_change, tire_rotation, etc.
    interval_km = Column(Integer, nullable=True)  # every X km
    interval_days = Column(Integer, nullable=True)  # every X days
    last_service_date = Column(DateTime, nullable=True)
    last_service_odometer = Column(Integer, nullable=True)
    next_reminder_date = Column(DateTime)
    reminder_sent = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class VehicleHealthCheck(Base):
    __tablename__ = "vehicle_health_checks"

    check_id = Column(String, primary_key=True)
    vehicle_id = Column(String, ForeignKey("vehicles.vehicle_id"))
    driver_id = Column(String, ForeignKey("users.user_id"))
    check_date = Column(DateTime, default=datetime.utcnow)
    engine_status = Column(String)  # good, warning, critical
    transmission_status = Column(String)
    brake_status = Column(String)
    tire_condition = Column(String)
    battery_status = Column(String)
    overall_health = Column(String)  # good, warning, critical
    issues_found = Column(JSON, nullable=True)  # list of issues
    recommendations = Column(JSON, nullable=True)
    next_check_recommended = Column(DateTime, nullable=True)

# ==================== PYDANTIC MODELS ====================

class VehicleCreate(BaseModel):
    vehicle_type: str
    registration_number: str
    make: str
    model: str
    year: int
    color: str
    license_plate: str
    seating_capacity: int = 4

class VehicleUpdate(BaseModel):
    vehicle_type: Optional[str] = None
    color: Optional[str] = None
    seating_capacity: Optional[int] = None
    is_active: Optional[bool] = None

class VehicleDocumentUpload(BaseModel):
    document_type: str  # rc, insurance, pollution, tax, permit
    document_number: str
    issued_date: str  # YYYY-MM-DD
    expiry_date: str  # YYYY-MM-DD

class MaintenanceRecordCreate(BaseModel):
    service_type: str
    description: str
    maintenance_date: str
    cost: Optional[float] = None
    service_center: str
    odometer_reading: Optional[int] = None

class MaintenanceReminderCreate(BaseModel):
    service_type: str
    interval_km: Optional[int] = None
    interval_days: Optional[int] = None

# ==================== ROUTER ====================

router = APIRouter(prefix="/api/v3/vehicle-management", tags=["vehicle-management"])

# ==================== VEHICLE CRUD ====================

@router.post("/vehicles/add")
async def add_vehicle(
    driver_id: str,
    vehicle: VehicleCreate,
    db: Session = Depends(get_db)
):
    """Add a new vehicle"""
    vehicle_id = str(uuid.uuid4())

    new_vehicle = Vehicle(
        vehicle_id=vehicle_id,
        driver_id=driver_id,
        vehicle_type=vehicle.vehicle_type,
        registration_number=vehicle.registration_number,
        make=vehicle.make,
        model=vehicle.model,
        year=vehicle.year,
        color=vehicle.color,
        license_plate=vehicle.license_plate,
        seating_capacity=vehicle.seating_capacity
    )

    db.add(new_vehicle)
    db.commit()
    db.refresh(new_vehicle)

    return {
        "vehicle_id": new_vehicle.vehicle_id,
        "registration_number": new_vehicle.registration_number,
        "make": new_vehicle.make,
        "model": new_vehicle.model,
        "message": "Vehicle added successfully"
    }

@router.get("/vehicles/{driver_id}")
async def get_vehicles(
    driver_id: str,
    db: Session = Depends(get_db)
):
    """Get all vehicles for a driver"""
    vehicles = db.query(Vehicle).filter(
        Vehicle.driver_id == driver_id
    ).all()

    return {
        "vehicles": [
            {
                "vehicle_id": v.vehicle_id,
                "vehicle_type": v.vehicle_type,
                "registration_number": v.registration_number,
                "make": v.make,
                "model": v.model,
                "year": v.year,
                "color": v.color,
                "is_active": v.is_active,
                "is_verified": v.is_verified
            } for v in vehicles
        ],
        "count": len(vehicles)
    }

@router.get("/vehicles/{vehicle_id}/details")
async def get_vehicle_details(
    vehicle_id: str,
    db: Session = Depends(get_db)
):
    """Get detailed vehicle information"""
    vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == vehicle_id).first()

    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    # Get associated documents
    documents = db.query(VehicleDocument).filter(
        VehicleDocument.vehicle_id == vehicle_id
    ).all()

    insurance = db.query(VehicleInsurance).filter(
        VehicleInsurance.vehicle_id == vehicle_id
    ).first()

    registration = db.query(VehicleRegistration).filter(
        VehicleRegistration.vehicle_id == vehicle_id
    ).first()

    pollution = db.query(PollutionCertificate).filter(
        PollutionCertificate.vehicle_id == vehicle_id
    ).first()

    return {
        "vehicle": {
            "vehicle_id": vehicle.vehicle_id,
            "vehicle_type": vehicle.vehicle_type,
            "registration_number": vehicle.registration_number,
            "make": vehicle.make,
            "model": vehicle.model,
            "year": vehicle.year,
            "color": vehicle.color,
            "seating_capacity": vehicle.seating_capacity,
            "is_active": vehicle.is_active,
            "is_verified": vehicle.is_verified
        },
        "documents": [
            {
                "document_id": d.document_id,
                "type": d.document_type,
                "number": d.document_number,
                "expiry_date": d.expiry_date,
                "status": d.verification_status,
                "days_to_expiry": d.days_to_expiry,
                "is_expiring_soon": d.is_expiring_soon
            } for d in documents
        ],
        "insurance": {
            "policy_number": insurance.policy_number if insurance else None,
            "provider": insurance.provider_name if insurance else None,
            "expiry_date": insurance.expiry_date if insurance else None,
            "days_to_expiry": insurance.days_to_expiry if insurance else None
        } if insurance else None,
        "registration": {
            "rc_number": registration.rc_number if registration else None,
            "expiry_date": registration.expiry_date if registration else None,
            "days_to_expiry": registration.days_to_expiry if registration else None
        } if registration else None,
        "pollution_certificate": {
            "number": pollution.certificate_number if pollution else None,
            "expiry_date": pollution.expiry_date if pollution else None,
            "days_to_expiry": pollution.days_to_expiry if pollution else None
        } if pollution else None
    }

@router.put("/vehicles/{vehicle_id}")
async def update_vehicle(
    vehicle_id: str,
    vehicle: VehicleUpdate,
    db: Session = Depends(get_db)
):
    """Update vehicle details"""
    db_vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == vehicle_id).first()

    if not db_vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    update_data = vehicle.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_vehicle, key, value)

    db_vehicle.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(db_vehicle)

    return {"message": "Vehicle updated", "vehicle_id": vehicle_id}

@router.delete("/vehicles/{vehicle_id}")
async def delete_vehicle(
    vehicle_id: str,
    db: Session = Depends(get_db)
):
    """Delete vehicle"""
    db_vehicle = db.query(Vehicle).filter(Vehicle.vehicle_id == vehicle_id).first()

    if not db_vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    db.delete(db_vehicle)
    db.commit()

    return {"message": "Vehicle deleted"}

# ==================== VEHICLE DOCUMENTS ====================

@router.post("/vehicles/{vehicle_id}/documents/upload")
async def upload_document(
    vehicle_id: str,
    driver_id: str,
    document_type: str,
    document_number: str,
    issued_date: str,
    expiry_date: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Upload vehicle document"""
    document_id = str(uuid.uuid4())

    # In production, upload to S3 and get URL
    document_url = f"https://s3.example.com/documents/{document_id}"

    issued = datetime.strptime(issued_date, "%Y-%m-%d")
    expiry = datetime.strptime(expiry_date, "%Y-%m-%d")

    days_to_expiry = (expiry - datetime.utcnow()).days
    is_expiring_soon = days_to_expiry < 30 and days_to_expiry >= 0

    new_document = VehicleDocument(
        document_id=document_id,
        vehicle_id=vehicle_id,
        driver_id=driver_id,
        document_type=document_type,
        document_number=document_number,
        document_url=document_url,
        issued_date=issued,
        expiry_date=expiry,
        days_to_expiry=days_to_expiry,
        is_expiring_soon=is_expiring_soon
    )

    db.add(new_document)
    db.commit()
    db.refresh(new_document)

    return {
        "document_id": new_document.document_id,
        "type": new_document.document_type,
        "status": "pending_verification",
        "message": "Document uploaded. Awaiting verification."
    }

@router.get("/vehicles/{vehicle_id}/documents")
async def get_vehicle_documents(
    vehicle_id: str,
    db: Session = Depends(get_db)
):
    """Get all documents for a vehicle"""
    documents = db.query(VehicleDocument).filter(
        VehicleDocument.vehicle_id == vehicle_id
    ).all()

    return {
        "documents": [
            {
                "document_id": d.document_id,
                "type": d.document_type,
                "number": d.document_number,
                "expiry_date": d.expiry_date,
                "status": d.verification_status,
                "days_to_expiry": d.days_to_expiry,
                "is_expiring_soon": d.is_expiring_soon,
                "verified": d.is_verified
            } for d in documents
        ]
    }

# ==================== INSURANCE MANAGEMENT ====================

@router.post("/vehicles/{vehicle_id}/insurance/add")
async def add_insurance(
    vehicle_id: str,
    driver_id: str,
    provider_name: str,
    policy_number: str,
    cover_type: str,
    sum_insured: float,
    start_date: str,
    expiry_date: str,
    premium_amount: float,
    db: Session = Depends(get_db)
):
    """Add vehicle insurance"""
    insurance_id = str(uuid.uuid4())

    start = datetime.strptime(start_date, "%Y-%m-%d")
    expiry = datetime.strptime(expiry_date, "%Y-%m-%d")

    days_to_expiry = (expiry - datetime.utcnow()).days

    new_insurance = VehicleInsurance(
        insurance_id=insurance_id,
        vehicle_id=vehicle_id,
        driver_id=driver_id,
        provider_name=provider_name,
        policy_number=policy_number,
        cover_type=cover_type,
        sum_insured=sum_insured,
        start_date=start,
        expiry_date=expiry,
        premium_amount=premium_amount,
        days_to_expiry=days_to_expiry
    )

    db.add(new_insurance)
    db.commit()
    db.refresh(new_insurance)

    return {
        "insurance_id": new_insurance.insurance_id,
        "policy_number": new_insurance.policy_number,
        "status": "active",
        "days_to_expiry": days_to_expiry
    }

@router.get("/vehicles/{vehicle_id}/insurance")
async def get_insurance(
    vehicle_id: str,
    db: Session = Depends(get_db)
):
    """Get insurance for vehicle"""
    insurance = db.query(VehicleInsurance).filter(
        VehicleInsurance.vehicle_id == vehicle_id
    ).first()

    if not insurance:
        return {"insurance": None}

    return {
        "insurance": {
            "insurance_id": insurance.insurance_id,
            "provider_name": insurance.provider_name,
            "policy_number": insurance.policy_number,
            "cover_type": insurance.cover_type,
            "sum_insured": insurance.sum_insured,
            "expiry_date": insurance.expiry_date,
            "days_to_expiry": insurance.days_to_expiry,
            "is_active": insurance.is_active,
            "renewal_alert_sent": insurance.renewal_alert_sent
        }
    }

# ==================== MAINTENANCE TRACKING ====================

@router.post("/vehicles/{vehicle_id}/maintenance/record")
async def record_maintenance(
    vehicle_id: str,
    driver_id: str,
    maintenance: MaintenanceRecordCreate,
    db: Session = Depends(get_db)
):
    """Record maintenance service"""
    maintenance_id = str(uuid.uuid4())

    service_date = datetime.strptime(maintenance.maintenance_date, "%Y-%m-%d")

    new_record = MaintenanceRecord(
        maintenance_id=maintenance_id,
        vehicle_id=vehicle_id,
        driver_id=driver_id,
        service_type=maintenance.service_type,
        description=maintenance.description,
        maintenance_date=service_date,
        cost=maintenance.cost,
        service_center=maintenance.service_center,
        odometer_reading=maintenance.odometer_reading
    )

    db.add(new_record)
    db.commit()
    db.refresh(new_record)

    return {
        "maintenance_id": new_record.maintenance_id,
        "service_type": new_record.service_type,
        "date": new_record.maintenance_date,
        "message": "Maintenance recorded"
    }

@router.get("/vehicles/{vehicle_id}/maintenance/history")
async def get_maintenance_history(
    vehicle_id: str,
    limit: int = Query(10, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """Get maintenance history for vehicle"""
    records = db.query(MaintenanceRecord).filter(
        MaintenanceRecord.vehicle_id == vehicle_id
    ).order_by(desc(MaintenanceRecord.maintenance_date)).limit(limit).offset(offset).all()

    return {
        "maintenance_records": [
            {
                "maintenance_id": r.maintenance_id,
                "service_type": r.service_type,
                "date": r.maintenance_date,
                "cost": r.cost,
                "service_center": r.service_center,
                "odometer_reading": r.odometer_reading
            } for r in records
        ]
    }

@router.post("/vehicles/{vehicle_id}/maintenance/reminder/add")
async def add_maintenance_reminder(
    vehicle_id: str,
    driver_id: str,
    reminder: MaintenanceReminderCreate,
    db: Session = Depends(get_db)
):
    """Add maintenance reminder"""
    reminder_id = str(uuid.uuid4())

    # Calculate next reminder date
    next_date = datetime.utcnow() + timedelta(days=reminder.interval_days or 30)

    new_reminder = MaintenanceReminder(
        reminder_id=reminder_id,
        vehicle_id=vehicle_id,
        driver_id=driver_id,
        service_type=reminder.service_type,
        interval_km=reminder.interval_km,
        interval_days=reminder.interval_days,
        next_reminder_date=next_date
    )

    db.add(new_reminder)
    db.commit()
    db.refresh(new_reminder)

    return {
        "reminder_id": new_reminder.reminder_id,
        "service_type": new_reminder.service_type,
        "next_reminder_date": new_reminder.next_reminder_date
    }

@router.get("/vehicles/{vehicle_id}/maintenance/reminders")
async def get_maintenance_reminders(
    vehicle_id: str,
    db: Session = Depends(get_db)
):
    """Get maintenance reminders for vehicle"""
    reminders = db.query(MaintenanceReminder).filter(
        MaintenanceReminder.vehicle_id == vehicle_id,
        MaintenanceReminder.is_active == True
    ).all()

    return {
        "reminders": [
            {
                "reminder_id": r.reminder_id,
                "service_type": r.service_type,
                "interval_km": r.interval_km,
                "interval_days": r.interval_days,
                "next_reminder_date": r.next_reminder_date,
                "reminder_sent": r.reminder_sent
            } for r in reminders
        ]
    }

# ==================== VEHICLE HEALTH CHECK ====================

@router.post("/vehicles/{vehicle_id}/health-check")
async def create_health_check(
    vehicle_id: str,
    driver_id: str,
    engine_status: str,
    transmission_status: str,
    brake_status: str,
    tire_condition: str,
    battery_status: str,
    db: Session = Depends(get_db)
):
    """Record vehicle health check"""
    check_id = str(uuid.uuid4())

    # Determine overall health
    statuses = [engine_status, transmission_status, brake_status, tire_condition, battery_status]
    if "critical" in statuses:
        overall = "critical"
    elif "warning" in statuses:
        overall = "warning"
    else:
        overall = "good"

    new_check = VehicleHealthCheck(
        check_id=check_id,
        vehicle_id=vehicle_id,
        driver_id=driver_id,
        engine_status=engine_status,
        transmission_status=transmission_status,
        brake_status=brake_status,
        tire_condition=tire_condition,
        battery_status=battery_status,
        overall_health=overall
    )

    db.add(new_check)
    db.commit()
    db.refresh(new_check)

    return {
        "check_id": check_id,
        "overall_health": overall,
        "message": "Health check recorded"
    }

@router.get("/vehicles/{vehicle_id}/health-check/latest")
async def get_latest_health_check(
    vehicle_id: str,
    db: Session = Depends(get_db)
):
    """Get latest health check"""
    check = db.query(VehicleHealthCheck).filter(
        VehicleHealthCheck.vehicle_id == vehicle_id
    ).order_by(desc(VehicleHealthCheck.check_date)).first()

    if not check:
        return {"health_check": None}

    return {
        "health_check": {
            "check_id": check.check_id,
            "check_date": check.check_date,
            "engine_status": check.engine_status,
            "transmission_status": check.transmission_status,
            "brake_status": check.brake_status,
            "tire_condition": check.tire_condition,
            "battery_status": check.battery_status,
            "overall_health": check.overall_health,
            "issues_found": check.issues_found,
            "recommendations": check.recommendations
        }
    }

# ==================== EXPIRY TRACKING ====================

@router.get("/drivers/{driver_id}/documents/expiring-soon")
async def get_expiring_documents(
    driver_id: str,
    db: Session = Depends(get_db)
):
    """Get all documents expiring soon (< 30 days)"""
    documents = db.query(VehicleDocument).filter(
        VehicleDocument.driver_id == driver_id,
        VehicleDocument.is_expiring_soon == True
    ).all()

    return {
        "expiring_documents": [
            {
                "document_id": d.document_id,
                "vehicle_id": d.vehicle_id,
                "type": d.document_type,
                "number": d.document_number,
                "expiry_date": d.expiry_date,
                "days_to_expiry": d.days_to_expiry,
                "alert_sent": d.alert_sent
            } for d in documents
        ],
        "count": len(documents)
    }

@router.get("/drivers/{driver_id}/insurance/expiring-soon")
async def get_expiring_insurance(
    driver_id: str,
    db: Session = Depends(get_db)
):
    """Get all insurance policies expiring soon"""
    insurance = db.query(VehicleInsurance).filter(
        VehicleInsurance.driver_id == driver_id
    ).all()

    expiring = [i for i in insurance if i.days_to_expiry < 30 and i.days_to_expiry >= 0]

    return {
        "expiring_insurance": [
            {
                "insurance_id": i.insurance_id,
                "vehicle_id": i.vehicle_id,
                "policy_number": i.policy_number,
                "provider": i.provider_name,
                "expiry_date": i.expiry_date,
                "days_to_expiry": i.days_to_expiry
            } for i in expiring
        ],
        "count": len(expiring)
    }

# ==================== VEHICLE DASHBOARD ====================

@router.get("/drivers/{driver_id}/vehicle-dashboard")
async def get_vehicle_dashboard(
    driver_id: str,
    db: Session = Depends(get_db)
):
    """Get comprehensive vehicle management dashboard"""
    vehicles = db.query(Vehicle).filter(Vehicle.driver_id == driver_id).all()

    dashboard_data = {
        "total_vehicles": len(vehicles),
        "active_vehicles": len([v for v in vehicles if v.is_active]),
        "verified_vehicles": len([v for v in vehicles if v.is_verified]),
        "vehicles": []
    }

    for vehicle in vehicles:
        # Get documents
        documents = db.query(VehicleDocument).filter(
            VehicleDocument.vehicle_id == vehicle.vehicle_id
        ).all()

        # Get insurance
        insurance = db.query(VehicleInsurance).filter(
            VehicleInsurance.vehicle_id == vehicle.vehicle_id
        ).first()

        # Get registration
        registration = db.query(VehicleRegistration).filter(
            VehicleRegistration.vehicle_id == vehicle.vehicle_id
        ).first()

        # Get pollution certificate
        pollution = db.query(PollutionCertificate).filter(
            PollutionCertificate.vehicle_id == vehicle.vehicle_id
        ).first()

        # Get latest health check
        health_check = db.query(VehicleHealthCheck).filter(
            VehicleHealthCheck.vehicle_id == vehicle.vehicle_id
        ).order_by(desc(VehicleHealthCheck.check_date)).first()

        vehicle_data = {
            "vehicle_id": vehicle.vehicle_id,
            "registration_number": vehicle.registration_number,
            "make": vehicle.make,
            "model": vehicle.model,
            "year": vehicle.year,
            "is_active": vehicle.is_active,
            "is_verified": vehicle.is_verified,
            "documents_pending": len([d for d in documents if d.verification_status == "pending"]),
            "insurance_status": {
                "valid": insurance.is_active if insurance else False,
                "days_to_expiry": insurance.days_to_expiry if insurance else None
            },
            "registration_status": {
                "valid": True if registration else False,
                "days_to_expiry": registration.days_to_expiry if registration else None
            },
            "pollution_status": {
                "valid": True if pollution else False,
                "days_to_expiry": pollution.days_to_expiry if pollution else None
            },
            "health_status": health_check.overall_health if health_check else "unknown"
        }

        dashboard_data["vehicles"].append(vehicle_data)

    return dashboard_data
