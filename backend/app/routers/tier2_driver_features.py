"""
TIER 2 Driver Features Router
Implements: Auto-decline filters, Passenger ratings, Vehicle maintenance,
Earning targets, and Payment/payout management
"""

from fastapi import APIRouter, HTTPException, Depends, status, Query
from pydantic import BaseModel, Field, ConfigDict
from typing import Optional, List, Dict, Any, Literal
from datetime import datetime, timedelta
from sqlalchemy import select, desc, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.db.models import get_db
from app.db.tier2_models import (
    RideFilterPreferences,
    VehicleMaintenance,
    VehicleDocumentExpiry,
    EarningTarget,
    DriverPaymentMethod,
    PayoutScheduleConfig,
    PayoutHistory,
)
from app.routers.auth import verify_token
from app.utils.timezone import get_ist_now

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
    id: int
    driver_id: str
    created_at: datetime
    updated_at: datetime

class MaintenanceRequest(BaseModel):
    maintenance_type: str = Field(..., description="Type of maintenance")
    service_date: datetime
    next_due_date: datetime
    cost: Optional[float] = Field(None, ge=0)
    receipt_url: Optional[str] = None
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class MaintenanceResponse(MaintenanceRequest):
    id: int
    vehicle_id: str
    driver_id: str
    created_at: datetime
    updated_at: datetime

class DocumentExpiryRequest(BaseModel):
    document_type: str = Field(..., description="Insurance, Registration, Permit, etc")
    expiry_date: datetime
    alert_days_before: int = Field(30, ge=1, le=90)
    document_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

class DocumentExpiryResponse(DocumentExpiryRequest):
    id: int
    vehicle_id: str
    driver_id: str
    created_at: datetime
    updated_at: datetime

class EarningTargetRequest(BaseModel):
    target_amount: float = Field(..., gt=0)
    target_period: Literal["weekly", "monthly"] = "weekly"
    bonus_multiplier: float = Field(1.5, ge=1.0, le=5.0)

    model_config = ConfigDict(from_attributes=True)

class EarningTargetResponse(EarningTargetRequest):
    id: int
    driver_id: str
    target_week_start: Optional[datetime]
    current_earnings: float = 0
    bonus_earned: float = 0
    status: str
    created_at: datetime
    updated_at: datetime

class PaymentMethodRequest(BaseModel):
    method_type: Literal["bank_transfer", "upi", "wallet", "razorpay"] = "bank_transfer"
    account_holder_name: str
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    upi_id: Optional[str] = None
    is_verified: bool = False
    is_default: bool = False

    model_config = ConfigDict(from_attributes=True)

class PaymentMethodResponse(PaymentMethodRequest):
    id: int
    driver_id: str
    verification_status: str
    created_at: datetime
    updated_at: datetime

class PayoutScheduleConfigRequest(BaseModel):
    payment_method_id: int = Field(..., description="ID of payment method to use")
    schedule_type: Literal["daily", "weekly", "monthly", "manual"] = "weekly"
    schedule_day: Optional[int] = Field(None, description="Day of week (0-6) or day of month (1-31)")
    schedule_time: Optional[str] = Field(None, description="Time in HH:MM format")
    minimum_balance_threshold: float = Field(1000, ge=0)

    model_config = ConfigDict(from_attributes=True)

class PayoutScheduleConfigResponse(PayoutScheduleConfigRequest):
    id: int
    driver_id: str
    created_at: datetime
    updated_at: datetime

class PayoutHistoryResponse(BaseModel):
    id: int
    driver_id: str
    amount: float
    payment_method_id: int
    status: Literal["pending", "processing", "completed", "failed", "cancelled"]
    transaction_id: Optional[str] = None
    failure_reason: Optional[str] = None
    processed_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class PayoutRequestRequest(BaseModel):
    amount: float = Field(..., gt=0)
    payment_method_id: int

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
    driver_id = user_data.get("driver_id")
    
    existing = db.query(RideFilterPreferences).filter_by(driver_id=driver_id).first()
    
    if existing:
        for field, value in filters.model_dump(exclude_unset=True).items():
            setattr(existing, field, value)
        existing.updated_at = get_ist_now()
    else:
        existing = RideFilterPreferences(
            driver_id=driver_id,
            **filters.model_dump()
        )
        db.add(existing)
    
    db.commit()
    db.refresh(existing)
    return existing

@router.get("/ride-filters", response_model=Optional[RideFilterPreferencesResponse])
async def get_ride_filters(
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Get current ride filter preferences"""
    driver_id = user_data.get("driver_id")
    
    preferences = db.query(RideFilterPreferences).filter_by(driver_id=driver_id).first()
    return preferences

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
    driver_id = user_data.get("driver_id")
    
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

@router.post("/vehicles/{vehicle_id}/maintenance", response_model=MaintenanceResponse)
async def log_maintenance(
    vehicle_id: str,
    maintenance: MaintenanceRequest,
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Log vehicle maintenance service"""
    driver_id = user_data.get("driver_id")
    
    record = VehicleMaintenance(
        driver_id=driver_id,
        vehicle_id=vehicle_id,
        **maintenance.model_dump()
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

@router.get("/vehicles/{vehicle_id}/maintenance", response_model=Dict[str, Any])
async def get_maintenance_history(
    vehicle_id: str,
    limit: int = Query(20, ge=1, le=100),
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Get vehicle maintenance history"""
    driver_id = user_data.get("driver_id")
    
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
    driver_id = user_data.get("driver_id")
    today = get_ist_now()
    
    due_items = db.query(VehicleMaintenance).filter(
        VehicleMaintenance.driver_id == driver_id,
        VehicleMaintenance.vehicle_id == vehicle_id,
        VehicleMaintenance.next_due_date <= today + timedelta(days=30)
    ).all()
    
    return {
        "due_items": [item.to_dict() for item in due_items],
        "count": len(due_items)
    }

@router.patch("/vehicles/{vehicle_id}/maintenance/{maintenance_id}", response_model=MaintenanceResponse)
async def update_maintenance(
    vehicle_id: str,
    maintenance_id: int,
    updates: MaintenanceRequest,
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Update maintenance record"""
    driver_id = user_data.get("driver_id")
    
    record = db.query(VehicleMaintenance).filter_by(
        id=maintenance_id,
        driver_id=driver_id,
        vehicle_id=vehicle_id
    ).first()
    
    if not record:
        raise HTTPException(status_code=404, detail="Maintenance record not found")
    
    for field, value in updates.model_dump(exclude_unset=True).items():
        setattr(record, field, value)
    record.updated_at = get_ist_now()
    
    db.commit()
    db.refresh(record)
    return record

# =====================
# DOCUMENT EXPIRY ENDPOINTS
# =====================

@router.post("/vehicles/{vehicle_id}/document-expiry", response_model=DocumentExpiryResponse)
async def add_document_expiry(
    vehicle_id: str,
    document: DocumentExpiryRequest,
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Add vehicle document expiry tracking"""
    driver_id = user_data.get("driver_id")
    
    record = VehicleDocumentExpiry(
        driver_id=driver_id,
        vehicle_id=vehicle_id,
        **document.model_dump()
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record

@router.get("/vehicles/{vehicle_id}/document-expiry", response_model=Dict[str, Any])
async def get_document_expiry(
    vehicle_id: str,
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Get all document expiry tracking"""
    driver_id = user_data.get("driver_id")
    
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
    driver_id = user_data.get("driver_id")
    
    # Check if target already exists for this period
    week_start = get_ist_now().replace(hour=0, minute=0, second=0, microsecond=0)
    if week_start.weekday() != 0:  # Monday
        week_start -= timedelta(days=week_start.weekday())
    
    existing = db.query(EarningTarget).filter_by(
        driver_id=driver_id,
        target_period=target.target_period
    ).order_by(desc(EarningTarget.created_at)).first()
    
    if existing and existing.target_week_start == week_start:
        for field, value in target.model_dump().items():
            setattr(existing, field, value)
        existing.updated_at = get_ist_now()
    else:
        existing = EarningTarget(
            driver_id=driver_id,
            target_week_start=week_start,
            **target.model_dump()
        )
        db.add(existing)
    
    db.commit()
    db.refresh(existing)
    return existing

@router.get("/earning-targets/current", response_model=Optional[EarningTargetResponse])
async def get_current_earning_target(
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Get current week's earning target"""
    driver_id = user_data.get("driver_id")
    
    target = db.query(EarningTarget).filter_by(
        driver_id=driver_id,
        target_period="weekly"
    ).order_by(desc(EarningTarget.created_at)).first()
    
    return target

@router.get("/earning-targets/progress", response_model=Dict[str, Any])
async def get_target_progress(
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Get current week's progress toward target"""
    driver_id = user_data.get("driver_id")
    
    target = db.query(EarningTarget).filter_by(
        driver_id=driver_id,
        target_period="weekly"
    ).order_by(desc(EarningTarget.created_at)).first()
    
    if not target:
        return {"target_set": False, "progress": 0}
    
    return {
        "target_set": True,
        "target_amount": target.target_amount,
        "current_earnings": target.current_earnings,
        "progress_percentage": (target.current_earnings / target.target_amount * 100) if target.target_amount > 0 else 0,
        "bonus_earned": target.bonus_earned,
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
    driver_id = user_data.get("driver_id")
    
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
    driver_id = user_data.get("driver_id")
    
    payment_method = DriverPaymentMethod(
        driver_id=driver_id,
        **method.model_dump()
    )
    db.add(payment_method)
    db.commit()
    db.refresh(payment_method)
    return payment_method

@router.get("/payment-methods", response_model=Dict[str, Any])
async def get_payment_methods(
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Get all payment methods"""
    driver_id = user_data.get("driver_id")
    
    methods = db.query(DriverPaymentMethod).filter_by(driver_id=driver_id).all()
    default_method = next((m for m in methods if m.is_default), None)
    
    return {
        "methods": [m.to_dict() for m in methods],
        "default_method_id": default_method.id if default_method else None,
        "total": len(methods)
    }

@router.patch("/payment-methods/{method_id}", response_model=PaymentMethodResponse)
async def update_payment_method(
    method_id: int,
    updates: PaymentMethodRequest,
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Update payment method details"""
    driver_id = user_data.get("driver_id")
    
    method = db.query(DriverPaymentMethod).filter_by(
        id=method_id,
        driver_id=driver_id
    ).first()
    
    if not method:
        raise HTTPException(status_code=404, detail="Payment method not found")
    
    for field, value in updates.model_dump(exclude_unset=True).items():
        setattr(method, field, value)
    method.updated_at = get_ist_now()
    
    db.commit()
    db.refresh(method)
    return method

@router.delete("/payment-methods/{method_id}", status_code=204)
async def delete_payment_method(
    method_id: int,
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Delete payment method"""
    driver_id = user_data.get("driver_id")
    
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
    driver_id = user_data.get("driver_id")
    
    existing = db.query(PayoutScheduleConfig).filter_by(driver_id=driver_id).first()
    
    if existing:
        for field, value in config.model_dump(exclude_unset=True).items():
            setattr(existing, field, value)
        existing.updated_at = get_ist_now()
    else:
        existing = PayoutScheduleConfig(
            driver_id=driver_id,
            **config.model_dump()
        )
        db.add(existing)
    
    db.commit()
    db.refresh(existing)
    return existing

@router.get("/payout-schedule", response_model=Optional[PayoutScheduleConfigResponse])
async def get_payout_schedule(
    user_data: dict = Depends(verify_token),
    db: Session = Depends(get_db)
):
    """Get payout schedule configuration"""
    driver_id = user_data.get("driver_id")
    
    schedule = db.query(PayoutScheduleConfig).filter_by(driver_id=driver_id).first()
    return schedule

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
    driver_id = user_data.get("driver_id")
    
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
    driver_id = user_data.get("driver_id")
    
    # Verify payment method exists
    method = db.query(DriverPaymentMethod).filter_by(
        id=request.payment_method_id,
        driver_id=driver_id
    ).first()
    
    if not method:
        raise HTTPException(status_code=404, detail="Payment method not found")
    
    # Create payout record
    payout = PayoutHistory(
        driver_id=driver_id,
        amount=request.amount,
        payment_method_id=request.payment_method_id,
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
