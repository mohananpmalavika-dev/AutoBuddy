"""
Driver Trip Insurance & Coverage System - Production Implementation
Manages insurance plans, trip coverage, claims filing, and policy terms
"""

from sqlalchemy import (
    Column, String, Integer, Float, DateTime, Boolean, Text, JSON,
    ForeignKey, Index, Enum as SQLEnum, UniqueConstraint
)
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime, timedelta, timezone
from enum import Enum
import uuid

Base = declarative_base()

IST_TZ = timezone(timedelta(hours=5, minutes=30))

def get_ist_now():
    return datetime.now(IST_TZ)


class CoverageType(str, Enum):
    """Insurance plan coverage types"""
    BRONZE = "bronze"      # Basic coverage
    SILVER = "silver"      # Standard coverage
    GOLD = "gold"          # Premium coverage


class ClaimType(str, Enum):
    """Insurance claim types"""
    ACCIDENT = "accident"
    LIABILITY = "liability"
    INJURY = "injury"
    THEFT = "theft"
    OTHER = "other"


class ClaimStatus(str, Enum):
    """Claim processing status"""
    SUBMITTED = "submitted"
    UNDER_REVIEW = "under_review"
    APPROVED = "approved"
    REJECTED = "rejected"


class PlanStatus(str, Enum):
    """Insurance plan status"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"
    EXPIRED = "expired"


# ============================================================================
# DRIVER INSURANCE PLAN
# ============================================================================

class DriverInsurancePlan(Base):
    """
    Active insurance plan for driver
    Covers trips with deductible and coverage limits
    """
    __tablename__ = "driver_insurance_plans"

    plan_id = Column(String(50), primary_key=True, default=lambda: str(uuid.uuid4()))
    driver_id = Column(String(100), nullable=False, index=True)
    plan_name = Column(String(50), nullable=False)  # "Bronze", "Silver", "Gold"
    coverage_type = Column(SQLEnum(CoverageType), nullable=False)
    status = Column(SQLEnum(PlanStatus), nullable=False, default=PlanStatus.ACTIVE)

    # Premium & Coverage
    monthly_premium = Column(Float, nullable=False, default=500.0)  # INR
    trip_deductible = Column(Float, nullable=False, default=500.0)  # INR per claim
    trip_limit = Column(Float, nullable=False)  # Max coverage per claim

    # Coverage flags
    accident_coverage = Column(Boolean, nullable=False, default=True)
    liability_coverage = Column(Boolean, nullable=False, default=True)
    injury_coverage = Column(Boolean, nullable=False, default=True)
    theft_coverage = Column(Boolean, nullable=False, default=False)

    # Coverage limits per type (JSON)
    coverage_limits = Column(JSON, nullable=False, default={
        "accident": 200000,
        "liability": 500000,
        "injury": 100000,
        "theft": 50000
    })

    # Plan validity
    active_from = Column(DateTime, nullable=False, default=get_ist_now)
    active_until = Column(DateTime, nullable=False)
    auto_renew = Column(Boolean, nullable=False, default=True)

    # Metadata
    created_at = Column(DateTime, nullable=False, default=get_ist_now)
    updated_at = Column(DateTime, nullable=False, default=get_ist_now, onupdate=get_ist_now)

    __table_args__ = (
        Index("ix_driver_insurance_driver_id_status", "driver_id", "status"),
    )


# ============================================================================
# TRIPS INSURED
# ============================================================================

class TripsInsured(Base):
    """
    Records each trip covered by insurance
    Links trip to insurance plan and tracks if claim filed
    """
    __tablename__ = "trips_insured"

    trip_id = Column(String(50), primary_key=True)
    driver_id = Column(String(100), nullable=False, index=True)
    booking_id = Column(String(100), nullable=False, index=True)
    plan_id = Column(String(50), ForeignKey("driver_insurance_plans.plan_id"), nullable=False)

    # Insurance details
    insurance_premium = Column(Float, nullable=False)  # Amount deducted from fare
    ride_type = Column(String(50), nullable=False)

    # Trip timeline
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=True)

    # Claim tracking
    claim_filed = Column(Boolean, nullable=False, default=False)
    claim_id = Column(String(50), ForeignKey("insurance_claims.claim_id"), nullable=True)

    created_at = Column(DateTime, nullable=False, default=get_ist_now)

    __table_args__ = (
        Index("ix_trips_insured_driver_id_booking_id", "driver_id", "booking_id"),
        Index("ix_trips_insured_claim_filed", "claim_filed"),
    )


# ============================================================================
# INSURANCE CLAIMS
# ============================================================================

class InsuranceClaim(Base):
    """
    Insurance claim filed by driver for a trip
    Tracks claim lifecycle from submission to decision
    """
    __tablename__ = "insurance_claims"

    claim_id = Column(String(50), primary_key=True, default=lambda: str(uuid.uuid4()))
    driver_id = Column(String(100), nullable=False, index=True)
    trip_id = Column(String(50), ForeignKey("trips_insured.trip_id"), nullable=False)
    plan_id = Column(String(50), ForeignKey("driver_insurance_plans.plan_id"), nullable=False)

    # Claim details
    claim_type = Column(SQLEnum(ClaimType), nullable=False)
    claim_description = Column(Text, nullable=False)
    claim_amount = Column(Float, nullable=False)

    # Incident details
    incident_datetime = Column(DateTime, nullable=False)
    incident_location = Column(String(300), nullable=False)

    # Claim status
    claim_status = Column(SQLEnum(ClaimStatus), nullable=False, default=ClaimStatus.SUBMITTED)

    # Documents
    supporting_documents = Column(JSON, nullable=False, default=[])  # Array of file paths
    document_count = Column(Integer, nullable=False, default=0)

    # Decision details
    approved_amount = Column(Float, nullable=True)
    rejection_reason = Column(Text, nullable=True)
    decision_message = Column(Text, nullable=True)
    reviewed_by = Column(String(100), nullable=True)
    reviewed_at = Column(DateTime, nullable=True)

    # Metadata
    created_at = Column(DateTime, nullable=False, default=get_ist_now)
    updated_at = Column(DateTime, nullable=False, default=get_ist_now, onupdate=get_ist_now)

    __table_args__ = (
        Index("ix_insurance_claims_driver_id_status", "driver_id", "claim_status"),
        Index("ix_insurance_claims_trip_id", "trip_id"),
    )


# ============================================================================
# INSURANCE POLICY TERMS
# ============================================================================

class InsurancePolicyTerms(Base):
    """
    Policy terms and conditions for each coverage type
    Defines what's covered, excluded, and claim limits
    """
    __tablename__ = "insurance_policy_terms"

    policy_id = Column(String(50), primary_key=True, default=lambda: str(uuid.uuid4()))
    plan_name = Column(String(50), nullable=False, unique=True)
    coverage_type = Column(SQLEnum(CoverageType), nullable=False)

    # Coverage details
    coverage_limits = Column(JSON, nullable=False)  # {accident: 200000, ...}
    deductible = Column(Float, nullable=False)

    # Policy text
    what_covered = Column(JSON, nullable=False)  # Array of coverage descriptions
    what_not_covered = Column(JSON, nullable=False)  # Array of exclusions

    # Claim process
    claim_process = Column(Text, nullable=False)
    max_claims_per_year = Column(Integer, nullable=False, default=3)
    document_upload_limit = Column(Integer, nullable=False, default=5)
    claim_processing_days = Column(Integer, nullable=False, default=3)

    # Full terms
    terms_html = Column(Text, nullable=False)

    created_at = Column(DateTime, nullable=False, default=get_ist_now)
    updated_at = Column(DateTime, nullable=False, default=get_ist_now, onupdate=get_ist_now)


# ============================================================================
# MONTHLY PREMIUM DEDUCTIONS
# ============================================================================

class InsurancePremiumDeduction(Base):
    """
    Tracks monthly premium deductions from driver's account
    Ensures premiums are paid on renewal date
    """
    __tablename__ = "insurance_premium_deductions"

    deduction_id = Column(String(50), primary_key=True, default=lambda: str(uuid.uuid4()))
    driver_id = Column(String(100), nullable=False, index=True)
    plan_id = Column(String(50), ForeignKey("driver_insurance_plans.plan_id"), nullable=False)

    # Deduction details
    amount = Column(Float, nullable=False)
    deduction_period_start = Column(DateTime, nullable=False)
    deduction_period_end = Column(DateTime, nullable=False)

    # Status
    is_paid = Column(Boolean, nullable=False, default=False)
    payment_method = Column(String(50), nullable=True)  # "wallet", "card", etc.
    transaction_id = Column(String(100), nullable=True)

    created_at = Column(DateTime, nullable=False, default=get_ist_now)
    paid_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_premium_deductions_driver_period", "driver_id", "deduction_period_start"),
    )
