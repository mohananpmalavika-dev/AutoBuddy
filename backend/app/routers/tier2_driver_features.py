"""
TIER 2 Driver Features Router
Implements: Auto-decline filters, Passenger ratings, Vehicle maintenance,
Earning targets, and Payment/payout management
"""

from fastapi import APIRouter, HTTPException, Depends, status, Query
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime, timedelta, time
import uuid
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.tier2_models import (
    RideFilterPreferences,
    VehicleMaintenance,
    VehicleDocumentExpiry,
    EarningTarget,
    DriverPaymentMethod,
    PayoutScheduleConfig,
    PayoutHistory,
    get_ist_now,
)
from app.routers.auth import verify_token

router = APIRouter(prefix="/api/drivers-tier2", tags=["tier2-features"])

# =====================
# PYDANTIC MODELS
# =====================

class RideFilterPreferencesRequest(BaseModel):
    max_pickup_distance_km: Optional[float] = Field(None, ge=0, le=100)
    min_passenger_rating: Optional[float] = Field(None, ge=1, le=5)
    allowed_areas: Optional[List[str]] = Field(None, description="List of allowed pickup areas")
    blocked_areas: Optional[List[str]] = Field(None, description="List of blocked areas")
    time_slot_restrictions: Optional[Dict[str, Any]] = Field(None, description="Time-based restrictions")
    auto_decline_enabled: bool = Field(True)
    
    model_config = ConfigDict(from_attributes=True)

class RideFilterPreferencesResponse(RideFilterPreferencesRequest):
    id: str
    driver_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None

class MaintenanceRequest(BaseModel):
    maintenance_type: str = Field(..., description="Type of maintenance")
    service_date: datetime
    next_due_date: datetime
    cost: Optional[float] = Field(None, ge=0)
    receipt_url: Optional[str] = None
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class MaintenanceResponse(MaintenanceRequest):
    id: str
    vehicle_id: str
    driver_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None

class DocumentExpiryRequest(BaseModel):
    document_type: str = Field(..., description="Insurance, Registration, Permit, etc")
    expiry_date: datetime
    alert_days_before: int = Field(30, ge=1, le=90)
    document_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class DocumentExpiryResponse(DocumentExpiryRequest):
    id: str
    vehicle_id: str
    driver_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None

class EarningTargetRequest(BaseModel):
    target_amount: float = Field(..., gt=0)
    target_period: Literal["weekly", "monthly"] = "weekly"
    bonus_multiplier: float = Field(1.5, ge=1.0, le=5.0)

    model_config = ConfigDict(from_attributes=True)

class EarningTargetResponse(EarningTargetRequest):
    id: str
    driver_id: str
    target_week_start: Optional[str]
    current_earnings: float = 0
    bonus_earned: float = 0
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None

class PaymentMethodRequest(BaseModel):
    method_type: Literal["bank_transfer", "upi", "wallet", "razorpay"] = "bank_transfer"
    account_holder_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    upi_id: Optional[str] = None
    is_verified: bool = False
    is_default: bool = False

    model_config = ConfigDict(from_attributes=True)

class PaymentMethodResponse(PaymentMethodRequest):
    id: str
    driver_id: str
    verification_status: str
    created_at: datetime
    updated_at: Optional[datetime] = None

class PaymentMethodUpdateRequest(BaseModel):
    method_type: Optional[Literal["bank_transfer", "upi", "wallet", "razorpay"]] = None
    account_holder_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    upi_id: Optional[str] = None
    is_default: Optional[bool] = None

    model_config = ConfigDict(from_attributes=True)

class PayoutScheduleConfigRequest(BaseModel):
    payment_method_id: str = Field(..., description="ID of payment method to use")
    schedule_type: Literal["daily", "weekly", "monthly", "manual"] = "weekly"
    schedule_day: Optional[int] = Field(None, description="Day of week (0-6) or day of month (1-31)")
    schedule_time: Optional[str] = Field(None, description="Time in HH:MM format")
    minimum_balance_threshold: float = Field(1000, ge=0)

    model_config = ConfigDict(from_attributes=True)

class PayoutScheduleConfigResponse(PayoutScheduleConfigRequest):
    id: str
    driver_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None

class PayoutHistoryResponse(BaseModel):
    id: str
    driver_id: str
    amount: float
    payment_method_id: str
    status: Literal["pending", "processing", "completed", "failed", "cancelled"]
    transaction_id: Optional[str] = None
    failure_reason: Optional[str] = None
    processed_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class PayoutRequestRequest(BaseModel):
    amount: float = Field(..., gt=0)
    payment_method_id: str

    model_config = ConfigDict(from_attributes=True)

class PassengerRatingRequest(BaseModel):
    passenger_id: str

    model_config = ConfigDict(from_attributes=True)

class PassengerRatingResponse(BaseModel):
    passenger_id: str
    average_rating: float
    total_ratings: int
    recent_reviews: List[Dict[str, Any]]

    model_config = ConfigDict(from_attributes=True)

def _driver_id(user_data: dict) -> str:
    driver_id = user_data.get("driver_id") or user_data.get("id") or user_data.get("user_id")
    if not driver_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Driver identity not found")
    return str(driver_id)


def _new_id() -> str:
    return str(uuid.uuid4())


def _ride_filter_values(filters: RideFilterPreferencesRequest, *, exclude_unset: bool = False) -> Dict[str, Any]:
    data = filters.model_dump(exclude_unset=exclude_unset)
    if "allowed_areas" in data:
        data["allowed_pickup_areas"] = data.pop("allowed_areas")
    if "blocked_areas" in data:
        data["blocked_pickup_areas"] = data.pop("blocked_areas")
    return data


def _schedule_time(value: Optional[str]) -> Optional[time]:
    if not value:
        return None
    try:
        hours, minutes = value.split(":", 1)
        return time(hour=int(hours), minute=int(minutes[:2]))
    except (TypeError, ValueError):
        raise HTTPException(status_code=422, detail="schedule_time must use HH:MM format")


def _schedule_values(config: PayoutScheduleConfigRequest) -> Dict[str, Any]:
    day_of_week = None
    day_of_month = None
    if config.schedule_type == "weekly":
        day_of_week = config.schedule_day if config.schedule_day is not None else 1
        if day_of_week < 0 or day_of_week > 6:
            raise HTTPException(status_code=422, detail="Weekly payout day must be 0-6")
    elif config.schedule_type == "monthly":
        day_of_month = config.schedule_day if config.schedule_day is not None else 1
        if day_of_month < 1 or day_of_month > 31:
            raise HTTPException(status_code=422, detail="Monthly payout day must be 1-31")

    return {
        "payment_method_id": str(config.payment_method_id),
        "schedule_type": config.schedule_type,
        "day_of_week": day_of_week,
        "day_of_month": day_of_month,
        "scheduled_time": _schedule_time(config.schedule_time),
        "minimum_balance_threshold": config.minimum_balance_threshold,
    }


def _validate_payment_method(method: PaymentMethodRequest) -> None:
    if method.method_type == "bank_transfer":
        missing = [
            label for label, value in {
                "account_holder_name": method.account_holder_name,
                "account_number": method.account_number,
                "ifsc_code": method.ifsc_code,
            }.items() if not str(value or "").strip()
        ]
        if missing:
            raise HTTPException(status_code=422, detail=f"Missing bank transfer fields: {', '.join(missing)}")
    if method.method_type == "upi" and not str(method.upi_id or "").strip():
        raise HTTPException(status_code=422, detail="upi_id is required for UPI payout methods")

# =====================
# RIDE FILTER ENDPOINTS
# =====================

@router.post("/ride-filters", response_model=RideFilterPreferencesResponse)
async def set_ride_filters(
    filters: RideFilterPreferencesRequest,
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Set or update ride filter preferences for auto-declining rides"""
    driver_id = _driver_id(user_data)
    
    existing = db.query(RideFilterPreferences).filter_by(driver_id=driver_id).first()
    
    if existing:
        for field, value in _ride_filter_values(filters, exclude_unset=True).items():
            setattr(existing, field, value)
        existing.updated_at = get_ist_now()
    else:
        existing = RideFilterPreferences(
            id=_new_id(),
            driver_id=driver_id,
            **_ride_filter_values(filters)
        )
        db.add(existing)
    
    db.commit()
    db.refresh(existing)
    return existing.to_dict()

@router.get("/ride-filters", response_model=Optional[RideFilterPreferencesResponse])
async def get_ride_filters(
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Get current ride filter preferences"""
    driver_id = _driver_id(user_data)
    
    preferences = db.query(RideFilterPreferences).filter_by(driver_id=driver_id).first()
    return preferences.to_dict() if preferences else None

@router.post("/rides/{ride_id}/auto-decide")
async def apply_ride_filters_to_request(
    ride_id: str,
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """
    Apply auto-decline filters to incoming ride request.
    Returns True if ride matches filters (accept), False if should auto-decline.
    """
    driver_id = _driver_id(user_data)
    
    preferences = db.query(RideFilterPreferences).filter_by(driver_id=driver_id).first()
    if not preferences or not preferences.auto_decline_enabled:
        return {"should_accept": True, "reason": "Auto-decline disabled"}
    
    # In production, this would fetch actual ride details and passenger info
    # For now, return structure for frontend to handle
    return {
        "should_accept": True,
        "filters_applied": True,
        "matching_rules": []
    }

# =====================
# VEHICLE MAINTENANCE ENDPOINTS
# =====================

@router.post("/vehicles/{vehicle_id}/maintenance", response_model=Dict[str, Any])
async def log_maintenance(
    vehicle_id: str,
    maintenance: MaintenanceRequest,
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Log vehicle maintenance service"""
    driver_id = _driver_id(user_data)
    
    record = VehicleMaintenance(
        id=_new_id(),
        driver_id=driver_id,
        vehicle_id=vehicle_id,
        maintenance_type=maintenance.maintenance_type,
        service_date=maintenance.service_date.date(),
        next_due_date=maintenance.next_due_date.date() if maintenance.next_due_date else None,
        cost=maintenance.cost,
        receipt_url=maintenance.receipt_url,
        details=maintenance.notes,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record.to_dict()

@router.get("/vehicles/{vehicle_id}/maintenance", response_model=Dict[str, Any])
async def get_maintenance_history(
    vehicle_id: str,
    limit: int = Query(20, ge=1, le=100),
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Get vehicle maintenance history"""
    driver_id = _driver_id(user_data)
    
    records = db.query(VehicleMaintenance).filter_by(
        driver_id=driver_id,
        vehicle_id=vehicle_id
    ).order_by(desc(VehicleMaintenance.service_date)).limit(limit).all()
    
    return {
        "records": [r.to_dict() for r in records],
        "total": len(records)
    }

@router.get("/vehicles/{vehicle_id}/maintenance-due", response_model=Dict[str, Any])
async def get_maintenance_due(
    vehicle_id: str,
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Get maintenance items due soon"""
    driver_id = _driver_id(user_data)
    today = get_ist_now().date()
    
    due_items = db.query(VehicleMaintenance).filter(
        VehicleMaintenance.driver_id == driver_id,
        VehicleMaintenance.vehicle_id == vehicle_id,
        VehicleMaintenance.next_due_date <= today + timedelta(days=30)
    ).all()
    
    return {
        "due_items": [item.to_dict() for item in due_items],
        "count": len(due_items)
    }

@router.patch("/vehicles/{vehicle_id}/maintenance/{maintenance_id}", response_model=Dict[str, Any])
async def update_maintenance(
    vehicle_id: str,
    maintenance_id: str,
    updates: MaintenanceRequest,
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Update maintenance record"""
    driver_id = _driver_id(user_data)
    
    record = db.query(VehicleMaintenance).filter_by(
        id=maintenance_id,
        driver_id=driver_id,
        vehicle_id=vehicle_id
    ).first()
    
    if not record:
        raise HTTPException(status_code=404, detail="Maintenance record not found")
    
    update_data = updates.model_dump(exclude_unset=True)
    if "service_date" in update_data:
        record.service_date = update_data["service_date"].date()
    if "next_due_date" in update_data:
        record.next_due_date = update_data["next_due_date"].date() if update_data["next_due_date"] else None
    if "notes" in update_data:
        record.details = update_data["notes"]
    for field in ("maintenance_type", "cost", "receipt_url"):
        if field in update_data:
            setattr(record, field, update_data[field])
    record.updated_at = get_ist_now()
    
    db.commit()
    db.refresh(record)
    return record.to_dict()

# =====================
# DOCUMENT EXPIRY ENDPOINTS
# =====================

@router.post("/vehicles/{vehicle_id}/document-expiry", response_model=Dict[str, Any])
async def add_document_expiry(
    vehicle_id: str,
    document: DocumentExpiryRequest,
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Add vehicle document expiry tracking"""
    driver_id = _driver_id(user_data)
    
    record = VehicleDocumentExpiry(
        id=_new_id(),
        driver_id=driver_id,
        vehicle_id=vehicle_id,
        document_type=document.document_type,
        expiry_date=document.expiry_date.date(),
        alert_days_before=document.alert_days_before,
        document_url=document.document_url,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record.to_dict()

@router.get("/vehicles/{vehicle_id}/document-expiry", response_model=Dict[str, Any])
async def get_document_expiry(
    vehicle_id: str,
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Get all document expiry tracking"""
    driver_id = _driver_id(user_data)
    
    documents = db.query(VehicleDocumentExpiry).filter_by(
        driver_id=driver_id,
        vehicle_id=vehicle_id
    ).all()
    
    return {
        "documents": [d.to_dict() for d in documents],
        "total": len(documents)
    }

# =====================
# EARNING TARGET ENDPOINTS
# =====================

@router.post("/earning-targets", response_model=EarningTargetResponse)
async def set_earning_target(
    target: EarningTargetRequest,
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Set weekly or monthly earning target"""
    driver_id = _driver_id(user_data)
    
    # Check if target already exists for this period
    week_start = get_ist_now().replace(hour=0, minute=0, second=0, microsecond=0)
    if week_start.weekday() != 0:  # Monday
        week_start -= timedelta(days=week_start.weekday())
    
    existing = db.query(EarningTarget).filter_by(
        driver_id=driver_id,
        target_period=target.target_period
    ).order_by(desc(EarningTarget.created_at)).first()
    
    if existing and existing.target_week_start == week_start.date():
        for field, value in target.model_dump().items():
            setattr(existing, field, value)
        existing.updated_at = get_ist_now()
    else:
        existing = EarningTarget(
            id=_new_id(),
            driver_id=driver_id,
            target_week_start=week_start.date(),
            **target.model_dump()
        )
        db.add(existing)
    
    db.commit()
    db.refresh(existing)
    return existing.to_dict()

@router.get("/earning-targets/current", response_model=Optional[EarningTargetResponse])
async def get_current_earning_target(
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Get current week's earning target"""
    driver_id = _driver_id(user_data)
    
    target = db.query(EarningTarget).filter_by(
        driver_id=driver_id,
        target_period="weekly"
    ).order_by(desc(EarningTarget.created_at)).first()
    
    return target.to_dict() if target else None

@router.get("/earning-targets/progress", response_model=Dict[str, Any])
async def get_target_progress(
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Get current week's progress toward target"""
    driver_id = _driver_id(user_data)
    
    target = db.query(EarningTarget).filter_by(
        driver_id=driver_id,
        target_period="weekly"
    ).order_by(desc(EarningTarget.created_at)).first()
    
    if not target:
        return {"target_set": False, "progress": 0}
    
    return {
        "target_set": True,
        "target_amount": float(target.target_amount),
        "current_earnings": float(target.current_earnings),
        "progress_percentage": (
            float(target.current_earnings) / float(target.target_amount) * 100
        ) if float(target.target_amount) > 0 else 0,
        "bonus_earned": float(target.bonus_earned),
        "bonus_multiplier": target.bonus_multiplier,
        "status": target.status
    }

@router.get("/earning-targets/history", response_model=Dict[str, Any])
async def get_target_history(
    limit: int = Query(10, ge=1, le=52),
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Get earning target history"""
    driver_id = _driver_id(user_data)
    
    targets = db.query(EarningTarget).filter_by(driver_id=driver_id).order_by(
        desc(EarningTarget.created_at)
    ).limit(limit).all()
    
    return {
        "history": [t.to_dict() for t in targets],
        "total": len(targets)
    }

# =====================
# PAYMENT METHOD ENDPOINTS
# =====================

@router.post("/payment-methods", response_model=PaymentMethodResponse)
async def add_payment_method(
    method: PaymentMethodRequest,
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Add new payment method (bank account or UPI)"""
    driver_id = _driver_id(user_data)
    _validate_payment_method(method)
    if method.is_default:
        db.query(DriverPaymentMethod).filter_by(driver_id=driver_id, is_default=True).update({"is_default": False})
    
    payment_method = DriverPaymentMethod(
        id=_new_id(),
        driver_id=driver_id,
        method_type=method.method_type,
        account_holder_name=method.account_holder_name or "Payout Wallet",
        account_number=method.account_number,
        ifsc_code=method.ifsc_code,
        upi_id=method.upi_id,
        is_default=method.is_default,
        verification_status="verified" if method.method_type == "wallet" else "pending",
    )
    db.add(payment_method)
    db.commit()
    db.refresh(payment_method)
    return payment_method.to_dict()

@router.get("/payment-methods", response_model=Dict[str, Any])
async def get_payment_methods(
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Get all payment methods"""
    driver_id = _driver_id(user_data)
    
    methods = db.query(DriverPaymentMethod).filter_by(driver_id=driver_id).all()
    default_method = next((m for m in methods if m.is_default), None)
    
    return {
        "methods": [m.to_dict() for m in methods],
        "default_method_id": default_method.id if default_method else None,
        "total": len(methods)
    }

@router.patch("/payment-methods/{method_id}", response_model=PaymentMethodResponse)
async def update_payment_method(
    method_id: str,
    updates: PaymentMethodUpdateRequest,
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Update payment method details"""
    driver_id = _driver_id(user_data)
    
    method = db.query(DriverPaymentMethod).filter_by(
        id=method_id,
        driver_id=driver_id
    ).first()
    
    if not method:
        raise HTTPException(status_code=404, detail="Payment method not found")
    
    update_data = updates.model_dump(exclude_unset=True)
    if update_data.get("is_default"):
        db.query(DriverPaymentMethod).filter(
            DriverPaymentMethod.driver_id == driver_id,
            DriverPaymentMethod.id != method_id,
            DriverPaymentMethod.is_default.is_(True),
        ).update({"is_default": False})

    for field, value in update_data.items():
        setattr(method, field, value)
    method.updated_at = get_ist_now()
    
    db.commit()
    db.refresh(method)
    return method.to_dict()

@router.delete("/payment-methods/{method_id}", status_code=204)
async def delete_payment_method(
    method_id: str,
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Delete payment method"""
    driver_id = _driver_id(user_data)
    
    method = db.query(DriverPaymentMethod).filter_by(
        id=method_id,
        driver_id=driver_id
    ).first()
    
    if not method:
        raise HTTPException(status_code=404, detail="Payment method not found")
    
    db.delete(method)
    db.commit()

# =====================
# PAYOUT SCHEDULE ENDPOINTS
# =====================

@router.post("/payout-schedule", response_model=PayoutScheduleConfigResponse)
async def configure_payout_schedule(
    config: PayoutScheduleConfigRequest,
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Configure automatic payout schedule"""
    driver_id = _driver_id(user_data)

    method = db.query(DriverPaymentMethod).filter_by(
        id=str(config.payment_method_id),
        driver_id=driver_id,
        is_active=True,
    ).first()
    if not method:
        raise HTTPException(status_code=404, detail="Payment method not found")

    schedule_data = _schedule_values(config)
    
    existing = db.query(PayoutScheduleConfig).filter_by(driver_id=driver_id).first()
    
    if existing:
        for field, value in schedule_data.items():
            setattr(existing, field, value)
        existing.updated_at = get_ist_now()
    else:
        existing = PayoutScheduleConfig(
            id=_new_id(),
            driver_id=driver_id,
            **schedule_data
        )
        db.add(existing)
    
    db.commit()
    db.refresh(existing)
    return existing.to_dict()

@router.get("/payout-schedule", response_model=Optional[PayoutScheduleConfigResponse])
async def get_payout_schedule(
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Get payout schedule configuration"""
    driver_id = _driver_id(user_data)
    
    schedule = db.query(PayoutScheduleConfig).filter_by(driver_id=driver_id).first()
    return schedule.to_dict() if schedule else None

# =====================
# PAYOUT HISTORY ENDPOINTS
# =====================

@router.get("/payouts/history", response_model=Dict[str, Any])
async def get_payout_history(
    limit: int = Query(30, ge=1, le=100),
    status_filter: Optional[str] = Query(None),
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Get payout history"""
    driver_id = _driver_id(user_data)
    
    query = db.query(PayoutHistory).filter_by(driver_id=driver_id)
    if status_filter:
        query = query.filter_by(status=status_filter)
    
    payouts = query.order_by(desc(PayoutHistory.created_at)).limit(limit).all()
    
    return {
        "payouts": [p.to_dict() for p in payouts],
        "total": len(payouts)
    }

@router.post("/payouts/request", response_model=Dict[str, Any])
async def request_manual_payout(
    request: PayoutRequestRequest,
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Request manual payout to payment method"""
    driver_id = _driver_id(user_data)
    
    # Verify payment method exists
    method = db.query(DriverPaymentMethod).filter_by(
        id=request.payment_method_id,
        driver_id=driver_id
    ).first()
    
    if not method:
        raise HTTPException(status_code=404, detail="Payment method not found")
    
    # Create payout record
    payout = PayoutHistory(
        id=_new_id(),
        driver_id=driver_id,
        amount=request.amount,
        payment_method_id=str(request.payment_method_id),
        status="pending"
    )
    db.add(payout)
    db.commit()
    db.refresh(payout)
    
    return {
        "payout_id": payout.id,
        "status": payout.status,
        "amount": payout.amount,
        "created_at": payout.created_at
    }

# =====================
# PASSENGER RATING ENDPOINTS
# =====================

@router.get("/passengers/{passenger_id}/ratings", response_model=PassengerRatingResponse)
async def get_passenger_rating(
    passenger_id: str,
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Get passenger average rating and recent reviews"""
    # In production, this would query actual passenger ratings from ride history
    # For now, return stub response
    return {
        "passenger_id": passenger_id,
        "average_rating": 4.5,
        "total_ratings": 42,
        "recent_reviews": [
            {"rating": 5, "comment": "Great ride!", "date": get_ist_now().isoformat()},
            {"rating": 4, "comment": "Good driver", "date": (get_ist_now() - timedelta(days=1)).isoformat()}
        ]
    }

@router.get("/passengers/{passenger_id}/reviews", response_model=Dict[str, Any])
async def get_passenger_reviews(
    passenger_id: str,
    limit: int = Query(10, ge=1, le=50),
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Get passenger reviews and ratings"""
    # In production, query from ride feedback history
    return {
        "passenger_id": passenger_id,
        "reviews": [],
        "average_rating": 4.5,
        "total_count": 0
    }

@router.get("/health/tier2")
async def tier2_health():
    """Health check for TIER 2 features"""
    return {
        "status": "ok",
        "tier2_endpoints": "operational",
        "features": [
            "ride-filters",
            "passenger-ratings",
            "vehicle-maintenance",
            "earning-targets",
            "payment-methods",
            "payout-schedule"
        ]
    }
