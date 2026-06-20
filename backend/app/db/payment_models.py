"""
Payment Processing Models - Stripe Integration
- Payment Sessions (authorization holds)
- Payment Transactions (actual charges)
- Saved Payment Methods (tokenized cards)
- Payment Refunds (refund tracking)
"""

from sqlalchemy import (
    Column, String, Integer, Float, DateTime, Boolean, Text,
    ForeignKey, Index, JSON, Enum as SQLEnum
)
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime, timedelta, timezone
import enum
import uuid

Base = declarative_base()

# IST Timezone
IST_TZ = timezone(timedelta(hours=5, minutes=30))

def get_ist_now():
    """Returns current time in IST timezone."""
    return datetime.now(IST_TZ)


class PaymentStatus(str, enum.Enum):
    """Payment status enum"""
    PENDING = "PENDING"
    AUTHORIZED = "AUTHORIZED"
    CAPTURED = "CAPTURED"
    REFUNDED = "REFUNDED"
    FAILED = "FAILED"
    PROCESSING = "PROCESSING"


class PaymentMethod(str, enum.Enum):
    """Payment method types"""
    CARD = "CARD"
    UPI = "UPI"
    WALLET = "WALLET"
    BANK_TRANSFER = "BANK_TRANSFER"


class PaymentProvider(str, enum.Enum):
    """Payment provider"""
    STRIPE = "STRIPE"
    RAZORPAY = "RAZORPAY"
    PAYPAL = "PAYPAL"


class CardBrand(str, enum.Enum):
    """Card brands"""
    VISA = "VISA"
    MASTERCARD = "MASTERCARD"
    AMEX = "AMEX"
    DISCOVER = "DISCOVER"
    DINERSCLUB = "DINERSCLUB"


class RefundReason(str, enum.Enum):
    """Refund reasons"""
    DRIVER_CANCELLATION = "DRIVER_CANCELLATION"
    PASSENGER_CANCELLATION = "PASSENGER_CANCELLATION"
    DISPUTE = "DISPUTE"
    TECHNICAL_ERROR = "TECHNICAL_ERROR"
    NO_SHOW = "NO_SHOW"


# ============================================================================
# PAYMENT SESSION - Authorization Hold
# ============================================================================

class PaymentSession(Base):
    """
    Payment session for ride authorization
    Holds payment until ride completes (then captured)
    Expires after 15 minutes
    """
    __tablename__ = "payment_sessions"

    session_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # Ride & User Info
    ride_id = Column(String(36), nullable=False, index=True)
    passenger_id = Column(String(36), nullable=False, index=True)
    driver_id = Column(String(36), nullable=True)

    # Payment Amount
    amount_rupees = Column(Float, nullable=False)  # Display amount
    amount_paise = Column(Integer, nullable=False)  # Actual charge amount (rupees * 100)
    currency = Column(String(3), default="INR", nullable=False)

    # Payment Method
    payment_method_id = Column(String(36), nullable=False, index=True)
    stripe_payment_method_id = Column(String(255), nullable=True)  # Stripe PM ID

    # Stripe Integration
    stripe_intent_id = Column(String(255), nullable=True, index=True)  # PaymentIntent ID
    client_secret = Column(String(255), nullable=True)  # For 3D Secure

    # Status
    status = Column(SQLEnum(PaymentStatus), default=PaymentStatus.PENDING, index=True)
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)

    # Timestamps
    created_at = Column(DateTime, default=get_ist_now, index=True)
    authorized_at = Column(DateTime, nullable=True)
    captured_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=False, index=True)  # 15 min

    # Metadata
    metadata = Column(JSON, nullable=True)  # Flexible data storage

    def to_dict(self):
        return {
            "session_id": self.session_id,
            "ride_id": self.ride_id,
            "passenger_id": self.passenger_id,
            "amount_rupees": self.amount_rupees,
            "status": self.status.value,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================================
# PAYMENT TRANSACTION - Recorded Charge
# ============================================================================

class PaymentTransaction(Base):
    """
    Recorded payment transaction
    Created when payment is captured
    Tracks Stripe charge ID for reconciliation
    """
    __tablename__ = "payment_transactions"

    transaction_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # Session Link
    payment_session_id = Column(String(36), nullable=True, index=True)

    # Ride & User Info
    ride_id = Column(String(36), nullable=False, index=True)
    passenger_id = Column(String(36), nullable=False, index=True)
    driver_id = Column(String(36), nullable=True, index=True)

    # Amount
    amount_rupees = Column(Float, nullable=False)
    currency = Column(String(3), default="INR")

    # Payment Method
    payment_method_type = Column(SQLEnum(PaymentMethod), nullable=False)
    provider = Column(SQLEnum(PaymentProvider), nullable=False)

    # Stripe IDs
    stripe_payment_intent_id = Column(String(255), nullable=True)
    stripe_charge_id = Column(String(255), nullable=True, index=True)
    stripe_payment_method_id = Column(String(255), nullable=True)

    # Status & Retry
    status = Column(SQLEnum(PaymentStatus), default=PaymentStatus.PENDING, index=True)
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)
    last_retry_at = Column(DateTime, nullable=True)

    # Failure Info
    failure_reason = Column(Text, nullable=True)
    failure_code = Column(String(50), nullable=True)  # Stripe error code

    # Receipt
    receipt_url = Column(String(500), nullable=True)
    receipt_email_sent_at = Column(DateTime, nullable=True)

    # Idempotency (for retry safety)
    idempotency_key = Column(String(100), unique=True, nullable=True, index=True)

    # Timestamps
    created_at = Column(DateTime, default=get_ist_now, index=True)
    updated_at = Column(DateTime, default=get_ist_now, onupdate=get_ist_now)

    # Indexes for efficient queries
    __table_args__ = (
        Index('ix_txn_ride_id_status', 'ride_id', 'status'),
        Index('ix_txn_passenger_created', 'passenger_id', 'created_at'),
        Index('ix_txn_driver_created', 'driver_id', 'created_at'),
        Index('ix_txn_stripe_charge', 'stripe_charge_id'),
    )

    def to_dict(self):
        return {
            "transaction_id": self.transaction_id,
            "ride_id": self.ride_id,
            "amount_rupees": self.amount_rupees,
            "status": self.status.value,
            "payment_method": self.payment_method_type.value,
            "receipt_url": self.receipt_url,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================================
# SAVED PAYMENT METHOD - Tokenized Cards
# ============================================================================

class SavedPaymentMethod(Base):
    """
    Saved payment method for user
    Stores tokenized card data from Stripe
    Supports multiple cards per user
    """
    __tablename__ = "saved_payment_methods"

    method_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # User
    user_id = Column(String(36), nullable=False, index=True)

    # Method Type
    method_type = Column(SQLEnum(PaymentMethod), nullable=False)
    provider = Column(SQLEnum(PaymentProvider), nullable=False)

    # Stripe Integration
    stripe_payment_method_id = Column(String(255), nullable=False, unique=True, index=True)
    stripe_customer_id = Column(String(255), nullable=True, index=True)

    # Card Details (only for cards)
    card_brand = Column(SQLEnum(CardBrand), nullable=True)
    last_4_digits = Column(String(4), nullable=True)
    exp_month = Column(Integer, nullable=True)  # 1-12
    exp_year = Column(Integer, nullable=True)  # YYYY
    cardholder_name = Column(String(255), nullable=True)

    # UPI/Other Details
    upi_handle = Column(String(255), nullable=True)  # username@upi
    bank_account_last_4 = Column(String(4), nullable=True)

    # Preferences
    is_default = Column(Boolean, default=False, index=True)
    is_active = Column(Boolean, default=True)

    # Status
    verification_status = Column(String(20), default="VERIFIED")  # VERIFIED, PENDING, FAILED

    # Timestamps
    created_at = Column(DateTime, default=get_ist_now, index=True)
    expires_at = Column(DateTime, nullable=True)  # For cards with expiry
    last_used_at = Column(DateTime, nullable=True)

    # Metadata
    metadata = Column(JSON, nullable=True)

    __table_args__ = (
        Index('ix_pm_user_default', 'user_id', 'is_default'),
        Index('ix_pm_user_active', 'user_id', 'is_active'),
    )

    def to_dict(self):
        return {
            "method_id": self.method_id,
            "method_type": self.method_type.value,
            "brand": self.card_brand.value if self.card_brand else None,
            "last_4": self.last_4_digits,
            "is_default": self.is_default,
            "expires": f"{self.exp_month:02d}/{self.exp_year % 100}" if self.exp_month and self.exp_year else None,
        }


# ============================================================================
# PAYMENT REFUND - Refund Tracking
# ============================================================================

class PaymentRefund(Base):
    """
    Refund record for ride payments
    Tracks refund status and completion
    Supports full and partial refunds
    """
    __tablename__ = "payment_refunds"

    refund_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # Links
    transaction_id = Column(String(36), nullable=False, index=True)
    ride_id = Column(String(36), nullable=False, index=True)
    passenger_id = Column(String(36), nullable=False, index=True)

    # Amount
    amount_rupees = Column(Float, nullable=False)
    original_amount_rupees = Column(Float, nullable=False)  # Full charge amount
    reason = Column(SQLEnum(RefundReason), nullable=False)

    # Stripe Integration
    stripe_refund_id = Column(String(255), nullable=True, unique=True, index=True)
    stripe_charge_id = Column(String(255), nullable=True)

    # Status
    status = Column(String(20), default="INITIATED")  # INITIATED, PROCESSING, COMPLETED, FAILED

    # Metadata
    reason_details = Column(Text, nullable=True)
    processed_by = Column(String(255), nullable=True)  # User/system that initiated refund

    # Timestamps
    created_at = Column(DateTime, default=get_ist_now, index=True)
    initiated_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)

    __table_args__ = (
        Index('ix_refund_ride_status', 'ride_id', 'status'),
        Index('ix_refund_passenger_created', 'passenger_id', 'created_at'),
    )

    def to_dict(self):
        return {
            "refund_id": self.refund_id,
            "ride_id": self.ride_id,
            "amount_rupees": self.amount_rupees,
            "reason": self.reason.value,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================================
# WALLET ACCOUNT - User Wallet Balance
# ============================================================================

class UserWallet(Base):
    """
    User wallet for prepaid balance
    Can be used as payment method
    """
    __tablename__ = "user_wallets"

    wallet_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), nullable=False, unique=True, index=True)

    # Balance
    balance_rupees = Column(Float, default=0.0)
    reserved_rupees = Column(Float, default=0.0)  # Reserved for active ride

    # Status
    is_active = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime, default=get_ist_now)
    updated_at = Column(DateTime, default=get_ist_now, onupdate=get_ist_now)

    def to_dict(self):
        return {
            "wallet_id": self.wallet_id,
            "user_id": self.user_id,
            "balance_rupees": self.balance_rupees,
            "available_rupees": self.balance_rupees - self.reserved_rupees,
        }


# ============================================================================
# WALLET TRANSACTION - Wallet Activity Log
# ============================================================================

class WalletTransaction(Base):
    """
    Transaction log for wallet (topups, usage, refunds)
    """
    __tablename__ = "wallet_transactions"

    transaction_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    wallet_id = Column(String(36), nullable=False, index=True)
    user_id = Column(String(36), nullable=False, index=True)

    # Transaction
    type = Column(String(20), nullable=False)  # TOPUP, USAGE, REFUND, BONUS
    amount_rupees = Column(Float, nullable=False)
    reason = Column(String(255), nullable=True)

    # Links
    ride_id = Column(String(36), nullable=True)  # If ride-related
    payment_transaction_id = Column(String(36), nullable=True)  # If payment-related

    # Balance
    balance_before_rupees = Column(Float, nullable=False)
    balance_after_rupees = Column(Float, nullable=False)

    # Timestamp
    created_at = Column(DateTime, default=get_ist_now, index=True)

    __table_args__ = (
        Index('ix_wallet_txn_user_date', 'user_id', 'created_at'),
    )

    def to_dict(self):
        return {
            "transaction_id": self.transaction_id,
            "type": self.type,
            "amount_rupees": self.amount_rupees,
            "balance_after": self.balance_after_rupees,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ============================================================================
# PAYMENT RECONCILIATION - Stripe Webhook Log
# ============================================================================

class StripeWebhookLog(Base):
    """
    Log of Stripe webhook events for reconciliation
    Prevents duplicate processing
    """
    __tablename__ = "stripe_webhook_logs"

    log_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))

    # Webhook Event
    stripe_event_id = Column(String(255), nullable=False, unique=True, index=True)
    event_type = Column(String(50), nullable=False, index=True)  # charge.succeeded, etc
    event_data = Column(JSON, nullable=False)

    # Processing
    processed = Column(Boolean, default=False, index=True)
    processed_at = Column(DateTime, nullable=True)

    # Related Transaction
    stripe_charge_id = Column(String(255), nullable=True, index=True)
    transaction_id = Column(String(36), nullable=True, index=True)

    # Error Info
    error_message = Column(Text, nullable=True)
    retry_count = Column(Integer, default=0)

    # Timestamps
    received_at = Column(DateTime, default=get_ist_now, index=True)

    def to_dict(self):
        return {
            "log_id": self.log_id,
            "event_type": self.event_type,
            "processed": self.processed,
            "received_at": self.received_at.isoformat() if self.received_at else None,
        }
