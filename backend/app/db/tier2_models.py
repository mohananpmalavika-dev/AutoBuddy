"""
TIER 2 Database Models - Ride Filters, Maintenance, Targets, Payment Methods
"""

from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean, Text, ForeignKey, JSON, Index, Enum, Date, Time, Numeric
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta, timezone
import enum

Base = declarative_base()

# IST Timezone
IST_TZ = timezone(timedelta(hours=5, minutes=30))
def get_ist_now():
    return datetime.now(IST_TZ)


# ============================================================================
# TIER 2 Feature #1: Ride Filter Preferences
# ============================================================================

class RideFilterPreferences(Base):
    """Driver-defined rules for auto-accepting/rejecting rides"""
    __tablename__ = "ride_filter_preferences"

    id = Column(String, primary_key=True)
    driver_id = Column(String, nullable=False, index=True)
    
    # Distance filtering
    max_pickup_distance_km = Column(Integer, nullable=True)  # NULL = no limit
    
    # Passenger rating filtering
    min_passenger_rating = Column(Float, nullable=True)  # 1.0-5.0, NULL = no limit
    
    # Location preferences (stored as JSON list of zone IDs)
    allowed_pickup_areas = Column(JSON, nullable=True)
    blocked_pickup_areas = Column(JSON, nullable=True)
    
    # Time restrictions ({"start": "22:00", "end": "06:00"} for night restriction)
    time_slot_restrictions = Column(JSON, nullable=True)
    
    # Feature toggle
    auto_decline_enabled = Column(Boolean, default=True, index=True)
    
    created_at = Column(DateTime, default=get_ist_now, index=True)
    updated_at = Column(DateTime, default=get_ist_now, onupdate=get_ist_now)
    
    __table_args__ = (
        Index('ix_driver_filters', 'driver_id', 'auto_decline_enabled'),
    )

    def to_dict(self):
        allowed_areas = self.allowed_pickup_areas or []
        blocked_areas = self.blocked_pickup_areas or []
        return {
            "id": self.id,
            "driver_id": self.driver_id,
            "max_pickup_distance_km": self.max_pickup_distance_km,
            "min_passenger_rating": self.min_passenger_rating,
            "allowed_areas": allowed_areas,
            "blocked_areas": blocked_areas,
            "allowed_pickup_areas": allowed_areas,
            "blocked_pickup_areas": blocked_areas,
            "time_slot_restrictions": self.time_slot_restrictions,
            "auto_decline_enabled": self.auto_decline_enabled,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# ============================================================================
# TIER 2 Feature #2: Vehicle Maintenance Tracking
# ============================================================================

class VehicleMaintenance(Base):
    """Service and maintenance records for driver vehicles"""
    __tablename__ = "vehicle_maintenance"

    id = Column(String, primary_key=True)
    vehicle_id = Column(String, nullable=False, index=True)
    driver_id = Column(String, nullable=False, index=True)
    
    maintenance_type = Column(String, nullable=False)  # "oil_change", "tire", "inspection", "brake", "battery", etc.
    service_date = Column(Date, nullable=False)
    next_due_date = Column(Date, nullable=True)
    
    details = Column(Text, nullable=True)
    cost = Column(Numeric(10, 2), nullable=True)
    receipt_url = Column(String, nullable=True)
    
    status = Column(String, default="completed")  # "completed", "scheduled", "overdue", "pending"
    
    created_at = Column(DateTime, default=get_ist_now, index=True)
    updated_at = Column(DateTime, default=get_ist_now, onupdate=get_ist_now)
    
    __table_args__ = (
        Index('ix_maintenance_vehicle_date', 'vehicle_id', 'service_date'),
        Index('ix_maintenance_due_date', 'next_due_date', 'status'),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "vehicle_id": self.vehicle_id,
            "driver_id": self.driver_id,
            "maintenance_type": self.maintenance_type,
            "service_date": str(self.service_date),
            "next_due_date": str(self.next_due_date) if self.next_due_date else None,
            "details": self.details,
            "notes": self.details,
            "cost": float(self.cost) if self.cost else None,
            "receipt_url": self.receipt_url,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class VehicleDocumentExpiry(Base):
    """Track vehicle document expiry dates (insurance, registration, permit)"""
    __tablename__ = "vehicle_document_expiry"

    id = Column(String, primary_key=True)
    vehicle_id = Column(String, nullable=False, index=True)
    driver_id = Column(String, nullable=False, index=True)
    
    document_type = Column(String, nullable=False)  # "insurance", "registration", "permit", "inspection"
    expiry_date = Column(Date, nullable=False)
    
    alert_days_before = Column(Integer, default=30)  # Alert when 30 days before expiry
    last_alert_sent = Column(DateTime, nullable=True)
    
    document_url = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=get_ist_now, index=True)
    updated_at = Column(DateTime, default=get_ist_now, onupdate=get_ist_now)
    
    __table_args__ = (
        Index('ix_document_expiry_date', 'expiry_date', 'document_type'),
        Index('ix_document_driver', 'driver_id', 'expiry_date'),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "vehicle_id": self.vehicle_id,
            "driver_id": self.driver_id,
            "document_type": self.document_type,
            "expiry_date": str(self.expiry_date),
            "days_until_expiry": (self.expiry_date - datetime.now().date()).days,
            "alert_days_before": self.alert_days_before,
            "document_url": self.document_url,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# ============================================================================
# TIER 2 Feature #3: Earning Targets & Bonuses
# ============================================================================

class EarningTarget(Base):
    """Weekly/monthly earning targets with bonus tracking"""
    __tablename__ = "earning_targets"

    id = Column(String, primary_key=True)
    driver_id = Column(String, nullable=False, index=True)
    
    target_amount = Column(Numeric(10, 2), nullable=False)
    target_period = Column(String, default="weekly")  # "daily", "weekly", "monthly"
    target_week_start = Column(Date, nullable=False, index=True)
    
    bonus_multiplier = Column(Float, default=1.5)  # 1.5x = 50% bonus
    bonus_threshold_amount = Column(Numeric(10, 2), nullable=True)  # Amount above which bonus applies
    
    current_earnings = Column(Numeric(10, 2), default=0)
    bonus_earned = Column(Numeric(10, 2), default=0)
    
    status = Column(String, default="active")  # "active", "completed", "failed", "pending"
    
    created_at = Column(DateTime, default=get_ist_now, index=True)
    updated_at = Column(DateTime, default=get_ist_now, onupdate=get_ist_now)
    
    __table_args__ = (
        Index('ix_target_driver_period', 'driver_id', 'target_week_start'),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "driver_id": self.driver_id,
            "target_amount": float(self.target_amount),
            "target_period": self.target_period,
            "current_earnings": float(self.current_earnings),
            "progress_percentage": (float(self.current_earnings) / float(self.target_amount) * 100) if self.target_amount > 0 else 0,
            "bonus_earned": float(self.bonus_earned),
            "bonus_multiplier": self.bonus_multiplier,
            "status": self.status,
            "target_week_start": str(self.target_week_start),
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


# ============================================================================
# TIER 2 Feature #4: Payment Methods & Payout Scheduling
# ============================================================================

class DriverPaymentMethod(Base):
    """Driver's bank accounts and payment methods for payouts"""
    __tablename__ = "driver_payment_methods"

    id = Column(String, primary_key=True)
    driver_id = Column(String, nullable=False, index=True)
    
    method_type = Column(String, nullable=False)  # "bank_transfer", "upi", "wallet", "razorpay"
    
    # Bank transfer details
    account_holder_name = Column(String, nullable=True)
    account_number = Column(String, nullable=True)
    ifsc_code = Column(String, nullable=True)
    bank_name = Column(String, nullable=True)
    
    # UPI details
    upi_id = Column(String, nullable=True)
    
    # Status flags
    is_default = Column(Boolean, default=False, index=True)
    is_active = Column(Boolean, default=True, index=True)
    
    # Verification status
    verification_status = Column(String, default="pending")  # "pending", "verified", "failed"
    verification_error = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=get_ist_now, index=True)
    updated_at = Column(DateTime, default=get_ist_now, onupdate=get_ist_now)
    
    __table_args__ = (
        Index('ix_payment_method_driver', 'driver_id', 'is_active'),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "driver_id": self.driver_id,
            "method_type": self.method_type,
            "account_holder_name": self.account_holder_name,
            "account_number": self.account_number[-4:] if self.account_number else None,  # Last 4 digits only
            "ifsc_code": self.ifsc_code,
            "bank_name": self.bank_name,
            "upi_id": self.upi_id,
            "is_default": self.is_default,
            "is_active": self.is_active,
            "verification_status": self.verification_status,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class PayoutScheduleConfig(Base):
    """Automatic payout scheduling configuration"""
    __tablename__ = "payout_schedule_config"

    id = Column(String, primary_key=True)
    driver_id = Column(String, nullable=False, index=True)
    payment_method_id = Column(String, nullable=False, index=True)
    
    schedule_type = Column(String, default="daily")  # "daily", "weekly", "monthly", "manual"
    
    # For weekly: 1=Monday, 7=Sunday
    day_of_week = Column(Integer, nullable=True)
    
    # For monthly: 1-31
    day_of_month = Column(Integer, nullable=True)
    
    # Scheduled time (e.g., "16:00:00" for 4 PM)
    scheduled_time = Column(Time, nullable=True)
    
    # Minimum balance required to trigger payout
    minimum_balance_threshold = Column(Numeric(10, 2), default=100)
    
    # Status
    is_active = Column(Boolean, default=True, index=True)
    
    created_at = Column(DateTime, default=get_ist_now, index=True)
    updated_at = Column(DateTime, default=get_ist_now, onupdate=get_ist_now)
    
    __table_args__ = (
        Index('ix_schedule_driver_active', 'driver_id', 'is_active'),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "driver_id": self.driver_id,
            "payment_method_id": self.payment_method_id,
            "schedule_type": self.schedule_type,
            "day_of_week": self.day_of_week,
            "day_of_month": self.day_of_month,
            "scheduled_time": str(self.scheduled_time) if self.scheduled_time else None,
            "schedule_day": self.day_of_month if self.schedule_type == "monthly" else self.day_of_week,
            "schedule_time": str(self.scheduled_time)[:5] if self.scheduled_time else None,
            "minimum_balance_threshold": float(self.minimum_balance_threshold),
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class PayoutHistory(Base):
    """Record of all payouts processed"""
    __tablename__ = "payout_history"

    id = Column(String, primary_key=True)
    driver_id = Column(String, nullable=False, index=True)
    payment_method_id = Column(String, nullable=False, index=True)
    
    amount = Column(Numeric(10, 2), nullable=False)
    status = Column(String, default="pending")  # "pending", "processing", "completed", "failed"
    
    transaction_id = Column(String, nullable=True, index=True)  # Razorpay/bank transaction ID
    reference_number = Column(String, nullable=True)  # Internal reference
    
    scheduled_for = Column(DateTime, nullable=True)
    processed_at = Column(DateTime, nullable=True)
    
    failure_reason = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=get_ist_now, index=True)
    updated_at = Column(DateTime, default=get_ist_now, onupdate=get_ist_now)
    
    __table_args__ = (
        Index('ix_payout_driver_date', 'driver_id', 'created_at'),
        Index('ix_payout_status', 'status', 'processed_at'),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "driver_id": self.driver_id,
            "amount": float(self.amount),
            "payment_method_id": self.payment_method_id,
            "status": self.status,
            "transaction_id": self.transaction_id,
            "scheduled_for": self.scheduled_for.isoformat() if self.scheduled_for else None,
            "processed_at": self.processed_at.isoformat() if self.processed_at else None,
            "failure_reason": self.failure_reason,
            "created_at": self.created_at.isoformat(),
        }
