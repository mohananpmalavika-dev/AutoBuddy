"""
Wallet & In-App Balance Management System - Production Implementation
Handles prepaid wallet, auto-recharge, cashback, transaction history, and refunds
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Column, String, DateTime, Boolean, JSON, Integer, Float, desc, and_, func
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, List, Dict, Any
import hashlib

# ==================== ENUMS ====================

class TransactionType(str, Enum):
    TOPUP = "topup"              # Add money to wallet
    RIDE_PAYMENT = "ride_payment"  # Ride fare charged
    REFUND = "refund"            # Refund to wallet
    CASHBACK = "cashback"        # Cashback credit
    AUTO_RECHARGE = "auto_recharge"  # Auto-recharge triggered
    DISPUTE_CREDIT = "dispute_credit"  # Support gave credit
    WITHDRAWAL = "withdrawal"    # Cash withdrawal


class TransactionStatus(str, Enum):
    PENDING = "pending"
    SUCCESS = "success"
    FAILED = "failed"
    REVERSED = "reversed"


class AutoRechargeStatus(str, Enum):
    INACTIVE = "inactive"
    ACTIVE = "active"
    PAUSED = "paused"


# ==================== DATABASE MODELS ====================

class UserWallet(BaseModel):
    """Main wallet balance tracking"""
    __tablename__ = "user_wallets"

    wallet_id = Column(String, primary_key=True)
    user_id = Column(String, index=True, unique=True)
    user_type = Column(String)  # "passenger" or "driver"

    # Balance
    current_balance = Column(Float, default=0.0)  # Current wallet balance
    total_topups = Column(Float, default=0.0)  # Total added
    total_spent = Column(Float, default=0.0)  # Total used
    total_cashback_received = Column(Float, default=0.0)  # Total CB earned

    # Limits
    max_balance = Column(Float, default=50000.0)  # Max balance allowed
    min_auto_recharge_threshold = Column(Float, default=500.0)  # Recharge when below

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_transaction_at = Column(DateTime, nullable=True)


class WalletTransaction(BaseModel):
    """Wallet transaction history"""
    __tablename__ = "wallet_transactions"

    transaction_id = Column(String, primary_key=True)
    wallet_id = Column(String, index=True)
    user_id = Column(String, index=True)

    # Transaction details
    type = Column(String(enum=TransactionType))
    status = Column(String(enum=TransactionStatus), default=TransactionStatus.PENDING)
    amount = Column(Float)
    balance_before = Column(Float)
    balance_after = Column(Float)

    # Reference
    ride_id = Column(String, nullable=True)  # For ride payments
    topup_id = Column(String, nullable=True)  # For topups
    refund_id = Column(String, nullable=True)  # For refunds
    cashback_id = Column(String, nullable=True)  # For cashback

    # Details
    description = Column(String)  # "Ride to Airport", "Cashback 5%", etc
    metadata = Column(JSON)  # Extra data: {"ride_duration": 15, "distance": 5.2}

    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AutoRechargeConfig(BaseModel):
    """Auto-recharge settings per user"""
    __tablename__ = "auto_recharge_configs"

    config_id = Column(String, primary_key=True)
    user_id = Column(String, index=True, unique=True)
    wallet_id = Column(String)

    # Configuration
    status = Column(String(enum=AutoRechargeStatus), default=AutoRechargeStatus.INACTIVE)
    is_enabled = Column(Boolean, default=False)

    # Recharge trigger
    threshold_amount = Column(Float)  # Recharge when balance < this
    recharge_amount = Column(Float)  # Amount to recharge
    max_recharges_per_day = Column(Integer, default=3)  # Safety limit
    recharge_count_today = Column(Integer, default=0)

    # Payment method
    payment_method_id = Column(String)  # Saved card ID
    payment_instrument = Column(String)  # "card_ending_in_1234"

    # Notifications
    notify_before_recharge = Column(Boolean, default=True)
    notify_after_recharge = Column(Boolean, default=True)

    # Tracking
    last_recharge_at = Column(DateTime, nullable=True)
    next_recharge_at = Column(DateTime, nullable=True)
    total_auto_recharged = Column(Float, default=0.0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CashbackRule(BaseModel):
    """Cashback rules and tracking"""
    __tablename__ = "cashback_rules"

    rule_id = Column(String, primary_key=True)
    name = Column(String)  # "Weekend Bonus", "Referral CB"

    # Rule details
    trigger_type = Column(String)  # "ride_count", "amount_spent", "referral", "promo"
    percentage = Column(Float)  # Cashback percentage
    fixed_amount = Column(Float, nullable=True)  # Fixed amount instead of %
    min_transaction_amount = Column(Float)  # Minimum to apply

    # Limits
    max_cashback_per_transaction = Column(Float, nullable=True)
    max_cashback_per_day = Column(Float, nullable=True)
    max_cashback_per_user = Column(Float, nullable=True)

    # Timing
    valid_from = Column(DateTime)
    valid_to = Column(DateTime)
    is_active = Column(Boolean, default=True)

    # Criteria
    applicable_to = Column(String)  # "all", "new_users", "premium_members"
    day_of_week = Column(String, nullable=True)  # "weekend" or null for all days


class CashbackEarning(BaseModel):
    """Track cashback earned by user"""
    __tablename__ = "cashback_earnings"

    earning_id = Column(String, primary_key=True)
    user_id = Column(String, index=True)
    wallet_id = Column(String)

    # Earning details
    rule_id = Column(String)  # Which rule triggered
    transaction_id = Column(String)  # Which transaction earned it
    ride_id = Column(String, nullable=True)

    # Amounts
    transaction_amount = Column(Float)
    cashback_percentage = Column(Float)
    cashback_amount = Column(Float)

    # Status
    status = Column(String)  # "pending", "credited", "reversed"
    credited_at = Column(DateTime, nullable=True)
    reversal_reason = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)


class WalletTopup(BaseModel):
    """Track wallet topup transactions"""
    __tablename__ = "wallet_topups"

    topup_id = Column(String, primary_key=True)
    user_id = Column(String, index=True)
    wallet_id = Column(String)

    # Topup details
    amount = Column(Float)
    payment_method = Column(String)  # "card", "upi", "bank_transfer"
    payment_method_id = Column(String)

    # Payment tracking
    stripe_payment_id = Column(String, nullable=True)
    status = Column(String)  # "initiated", "processing", "success", "failed"
    stripe_status = Column(String, nullable=True)

    # Pricing
    platform_fee = Column(Float, default=0.0)
    total_charged = Column(Float)  # amount + fee

    # Promo
    promo_code = Column(String, nullable=True)
    discount_amount = Column(Float, default=0.0)

    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)


class WalletRefund(BaseModel):
    """Refunds to wallet from ride cancellations or support"""
    __tablename__ = "wallet_refunds"

    refund_id = Column(String, primary_key=True)
    user_id = Column(String, index=True)
    wallet_id = Column(String)

    # Refund details
    reason = Column(String)  # "ride_cancelled", "support_credit", "payment_failed"
    amount = Column(Float)
    ride_id = Column(String, nullable=True)
    support_ticket_id = Column(String, nullable=True)

    # Tracking
    initiated_by = Column(String)  # "system", "agent", "auto"
    status = Column(String)  # "pending", "processed", "failed"
    processed_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)


# ==================== REQUEST/RESPONSE MODELS ====================

class WalletBalanceResponse:
    user_id: str
    current_balance: float
    total_topups: float
    total_spent: float
    total_cashback: float
    max_balance: float
    last_transaction_at: Optional[datetime]


class WalletTransactionHistoryResponse:
    total_count: int
    page: int
    per_page: int
    transactions: List[Dict[str, Any]]


class AutoRechargeConfigResponse:
    status: str
    is_enabled: bool
    threshold_amount: float
    recharge_amount: float
    payment_instrument: str
    last_recharge_at: Optional[datetime]
    total_auto_recharged: float


class CashbackCalculationResponse:
    transaction_amount: float
    applicable_rules: List[Dict]
    total_cashback: float
    breakdown: Dict[str, float]


# ==================== ROUTER ====================

router = APIRouter(prefix="/api/v3/wallet", tags=["wallet"])


# ==================== HELPER FUNCTIONS ====================

def generate_id(prefix: str) -> str:
    return f"{prefix}_{hashlib.md5(f'{datetime.utcnow()}{id(prefix)}'.encode()).hexdigest()[:12]}"


def calculate_cashback(transaction_amount: float, user_id: str, db: Session) -> Dict:
    """Calculate cashback for a transaction"""

    # Get active cashback rules
    rules = db.query(CashbackRule).filter(
        CashbackRule.is_active == True,
        CashbackRule.valid_from <= datetime.utcnow(),
        CashbackRule.valid_to >= datetime.utcnow(),
        CashbackRule.min_transaction_amount <= transaction_amount
    ).all()

    if not rules:
        return {"total_cashback": 0.0, "breakdown": {}}

    total_cashback = 0.0
    breakdown = {}

    for rule in rules:
        # Calculate cashback for this rule
        if rule.percentage:
            cashback = transaction_amount * (rule.percentage / 100)
        else:
            cashback = rule.fixed_amount or 0.0

        # Apply max per transaction
        if rule.max_cashback_per_transaction:
            cashback = min(cashback, rule.max_cashback_per_transaction)

        breakdown[rule.name] = cashback
        total_cashback += cashback

    return {
        "total_cashback": total_cashback,
        "breakdown": breakdown,
        "applicable_rules": [r.name for r in rules]
    }


def check_auto_recharge_trigger(wallet: UserWallet, db: Session):
    """Check if auto-recharge should be triggered"""

    config = db.query(AutoRechargeConfig).filter_by(
        user_id=wallet.user_id,
        status=AutoRechargeStatus.ACTIVE
    ).first()

    if not config or not config.is_enabled:
        return False

    # Check if balance below threshold
    if wallet.current_balance >= config.threshold_amount:
        return False

    # Check daily limit
    today = datetime.utcnow().date()
    today_recharges = db.query(WalletTransaction).filter(
        WalletTransaction.user_id == wallet.user_id,
        WalletTransaction.type == TransactionType.AUTO_RECHARGE,
        func.date(WalletTransaction.created_at) == today
    ).count()

    if today_recharges >= config.max_recharges_per_day:
        return False

    return True


# ==================== ENDPOINTS ====================

@router.get("/balance/{user_id}")
async def get_wallet_balance(user_id: str, db: Session = Depends(get_db)):
    """Get current wallet balance and statistics"""

    wallet = db.query(UserWallet).filter_by(user_id=user_id).first()

    if not wallet:
        # Create wallet if doesn't exist
        wallet_id = generate_id("wallet")
        wallet = UserWallet(
            wallet_id=wallet_id,
            user_id=user_id,
            user_type="passenger"  # Default
        )
        db.add(wallet)
        db.commit()

    return {
        "user_id": user_id,
        "current_balance": wallet.current_balance,
        "total_topups": wallet.total_topups,
        "total_spent": wallet.total_spent,
        "total_cashback_received": wallet.total_cashback_received,
        "max_balance": wallet.max_balance,
        "can_topup": wallet.current_balance < wallet.max_balance,
        "last_transaction_at": wallet.last_transaction_at.isoformat() if wallet.last_transaction_at else None
    }


@router.get("/transactions/{user_id}")
async def get_transaction_history(
    user_id: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=100),
    type: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get wallet transaction history with pagination"""

    # Build query
    query = db.query(WalletTransaction).filter_by(user_id=user_id)

    # Filter by type if provided
    if type:
        query = query.filter_by(type=type)

    # Get total count
    total_count = query.count()

    # Pagination
    offset = (page - 1) * per_page
    transactions = query.order_by(desc(WalletTransaction.created_at)).offset(offset).limit(per_page).all()

    return {
        "total_count": total_count,
        "page": page,
        "per_page": per_page,
        "total_pages": (total_count + per_page - 1) // per_page,
        "transactions": [
            {
                "transaction_id": t.transaction_id,
                "type": t.type,
                "status": t.status,
                "amount": t.amount,
                "balance_before": t.balance_before,
                "balance_after": t.balance_after,
                "description": t.description,
                "created_at": t.created_at.isoformat(),
                "ride_id": t.ride_id
            }
            for t in transactions
        ]
    }


@router.post("/topup")
async def create_wallet_topup(
    user_id: str,
    amount: float,
    payment_method: str = "card",
    payment_method_id: str = None,
    promo_code: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Initiate wallet topup with Stripe"""

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    # Get wallet
    wallet = db.query(UserWallet).filter_by(user_id=user_id).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")

    # Check max balance
    if wallet.current_balance + amount > wallet.max_balance:
        raise HTTPException(
            status_code=400,
            detail=f"Would exceed max balance. Max allowed: {wallet.max_balance - wallet.current_balance}"
        )

    # Calculate fees and discounts
    platform_fee = 0.0  # Free for now
    discount_amount = 0.0
    if promo_code:
        # Verify promo code (simplified)
        if promo_code == "WELCOME10":
            discount_amount = amount * 0.10

    total_charged = amount + platform_fee - discount_amount

    # Create topup record
    topup_id = generate_id("topup")
    topup = WalletTopup(
        topup_id=topup_id,
        user_id=user_id,
        wallet_id=wallet.wallet_id,
        amount=amount,
        payment_method=payment_method,
        payment_method_id=payment_method_id,
        status="initiated",
        platform_fee=platform_fee,
        total_charged=total_charged,
        promo_code=promo_code,
        discount_amount=discount_amount
    )
    db.add(topup)
    db.commit()

    return {
        "topup_id": topup_id,
        "amount": amount,
        "platform_fee": platform_fee,
        "discount_amount": discount_amount,
        "total_charged": total_charged,
        "status": "initiated",
        "next_step": "redirect_to_payment"
    }


@router.post("/topup/{topup_id}/confirm")
async def confirm_topup(
    topup_id: str,
    stripe_payment_id: str,
    db: Session = Depends(get_db)
):
    """Confirm topup after Stripe payment success"""

    topup = db.query(WalletTopup).filter_by(topup_id=topup_id).first()
    if not topup:
        raise HTTPException(status_code=404, detail="Topup not found")

    # Get wallet
    wallet = db.query(UserWallet).filter_by(user_id=topup.user_id).first()

    # Update topup
    topup.status = "success"
    topup.stripe_payment_id = stripe_payment_id
    topup.stripe_status = "succeeded"
    topup.completed_at = datetime.utcnow()

    # Update wallet balance
    old_balance = wallet.current_balance
    wallet.current_balance += topup.amount
    wallet.total_topups += topup.amount
    wallet.last_transaction_at = datetime.utcnow()
    wallet.updated_at = datetime.utcnow()

    # Create transaction record
    transaction = WalletTransaction(
        transaction_id=generate_id("txn"),
        wallet_id=wallet.wallet_id,
        user_id=topup.user_id,
        type=TransactionType.TOPUP,
        status=TransactionStatus.SUCCESS,
        amount=topup.amount,
        balance_before=old_balance,
        balance_after=wallet.current_balance,
        topup_id=topup_id,
        description=f"Wallet topup via {topup.payment_method}",
        metadata={"topup_id": topup_id, "payment_method": topup.payment_method}
    )
    db.add(transaction)

    db.commit()

    return {
        "status": "success",
        "user_id": topup.user_id,
        "amount_added": topup.amount,
        "new_balance": wallet.current_balance,
        "message": "Wallet topup completed successfully"
    }


@router.post("/auto-recharge/setup")
async def setup_auto_recharge(
    user_id: str,
    threshold_amount: float,
    recharge_amount: float,
    payment_method_id: str,
    db: Session = Depends(get_db)
):
    """Setup auto-recharge configuration"""

    if threshold_amount <= 0 or recharge_amount <= 0:
        raise HTTPException(status_code=400, detail="Amounts must be positive")

    wallet = db.query(UserWallet).filter_by(user_id=user_id).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")

    # Check or create config
    config = db.query(AutoRechargeConfig).filter_by(user_id=user_id).first()

    if not config:
        config_id = generate_id("arconfig")
        config = AutoRechargeConfig(
            config_id=config_id,
            user_id=user_id,
            wallet_id=wallet.wallet_id,
            threshold_amount=threshold_amount,
            recharge_amount=recharge_amount,
            payment_method_id=payment_method_id,
            status=AutoRechargeStatus.ACTIVE,
            is_enabled=True
        )
        db.add(config)
    else:
        config.threshold_amount = threshold_amount
        config.recharge_amount = recharge_amount
        config.payment_method_id = payment_method_id
        config.status = AutoRechargeStatus.ACTIVE
        config.is_enabled = True
        config.updated_at = datetime.utcnow()

    db.commit()

    return {
        "status": "enabled",
        "threshold_amount": threshold_amount,
        "recharge_amount": recharge_amount,
        "message": "Auto-recharge enabled"
    }


@router.get("/auto-recharge/{user_id}")
async def get_auto_recharge_config(user_id: str, db: Session = Depends(get_db)):
    """Get auto-recharge configuration"""

    config = db.query(AutoRechargeConfig).filter_by(user_id=user_id).first()

    if not config:
        return {
            "status": "disabled",
            "is_enabled": False,
            "message": "Auto-recharge not configured"
        }

    return {
        "status": config.status,
        "is_enabled": config.is_enabled,
        "threshold_amount": config.threshold_amount,
        "recharge_amount": config.recharge_amount,
        "max_recharges_per_day": config.max_recharges_per_day,
        "total_auto_recharged": config.total_auto_recharged,
        "last_recharge_at": config.last_recharge_at.isoformat() if config.last_recharge_at else None,
        "next_recharge_at": config.next_recharge_at.isoformat() if config.next_recharge_at else None
    }


@router.post("/auto-recharge/{user_id}/disable")
async def disable_auto_recharge(user_id: str, db: Session = Depends(get_db)):
    """Disable auto-recharge"""

    config = db.query(AutoRechargeConfig).filter_by(user_id=user_id).first()
    if not config:
        raise HTTPException(status_code=404, detail="Auto-recharge not configured")

    config.is_enabled = False
    config.status = AutoRechargeStatus.INACTIVE
    config.updated_at = datetime.utcnow()
    db.commit()

    return {"status": "disabled", "message": "Auto-recharge disabled"}


@router.get("/cashback/calculate")
async def calculate_cashback_for_transaction(
    user_id: str,
    transaction_amount: float,
    db: Session = Depends(get_db)
):
    """Calculate cashback for a hypothetical transaction"""

    if transaction_amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    result = calculate_cashback(transaction_amount, user_id, db)

    return {
        "transaction_amount": transaction_amount,
        "total_cashback": result["total_cashback"],
        "cashback_percentage": (result["total_cashback"] / transaction_amount * 100) if transaction_amount > 0 else 0,
        "breakdown": result["breakdown"],
        "applicable_rules": result["applicable_rules"]
    }


@router.get("/cashback/earnings/{user_id}")
async def get_cashback_earnings(
    user_id: str,
    page: int = Query(1, ge=1),
    per_page: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db)
):
    """Get cashback earnings history"""

    query = db.query(CashbackEarning).filter_by(user_id=user_id)
    total_count = query.count()

    # Total earned
    total_earned = db.query(func.sum(CashbackEarning.cashback_amount)).filter_by(
        user_id=user_id,
        status="credited"
    ).scalar() or 0.0

    # Pagination
    offset = (page - 1) * per_page
    earnings = query.order_by(desc(CashbackEarning.created_at)).offset(offset).limit(per_page).all()

    return {
        "total_earned": total_earned,
        "pending_cashback": db.query(func.sum(CashbackEarning.cashback_amount)).filter_by(
            user_id=user_id,
            status="pending"
        ).scalar() or 0.0,
        "total_count": total_count,
        "page": page,
        "per_page": per_page,
        "earnings": [
            {
                "earning_id": e.earning_id,
                "transaction_id": e.transaction_id,
                "ride_id": e.ride_id,
                "transaction_amount": e.transaction_amount,
                "cashback_percentage": e.cashback_percentage,
                "cashback_amount": e.cashback_amount,
                "status": e.status,
                "created_at": e.created_at.isoformat()
            }
            for e in earnings
        ]
    }


@router.post("/refund")
async def process_wallet_refund(
    user_id: str,
    amount: float,
    reason: str,
    ride_id: Optional[str] = None,
    support_ticket_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Process refund to wallet (ride cancellation, support credit)"""

    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    wallet = db.query(UserWallet).filter_by(user_id=user_id).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")

    # Create refund record
    refund_id = generate_id("refund")
    old_balance = wallet.current_balance

    refund = WalletRefund(
        refund_id=refund_id,
        user_id=user_id,
        wallet_id=wallet.wallet_id,
        reason=reason,
        amount=amount,
        ride_id=ride_id,
        support_ticket_id=support_ticket_id,
        initiated_by="system",
        status="processed",
        processed_at=datetime.utcnow()
    )
    db.add(refund)

    # Update wallet
    wallet.current_balance += amount
    wallet.last_transaction_at = datetime.utcnow()
    wallet.updated_at = datetime.utcnow()

    # Create transaction record
    transaction = WalletTransaction(
        transaction_id=generate_id("txn"),
        wallet_id=wallet.wallet_id,
        user_id=user_id,
        type=TransactionType.REFUND,
        status=TransactionStatus.SUCCESS,
        amount=amount,
        balance_before=old_balance,
        balance_after=wallet.current_balance,
        refund_id=refund_id,
        description=f"Refund: {reason}",
        metadata={"reason": reason, "ride_id": ride_id}
    )
    db.add(transaction)

    db.commit()

    return {
        "refund_id": refund_id,
        "status": "processed",
        "amount_refunded": amount,
        "new_balance": wallet.current_balance,
        "message": "Refund processed to wallet"
    }


@router.post("/ride-payment")
async def deduct_ride_fare(
    user_id: str,
    ride_id: str,
    amount: float,
    description: str,
    db: Session = Depends(get_db)
):
    """Deduct ride fare from wallet"""

    wallet = db.query(UserWallet).filter_by(user_id=user_id).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")

    if wallet.current_balance < amount:
        raise HTTPException(status_code=400, detail="Insufficient wallet balance")

    # Calculate cashback
    cashback_result = calculate_cashback(amount, user_id, db)
    cashback_amount = cashback_result["total_cashback"]

    # Deduct fare
    old_balance = wallet.current_balance
    wallet.current_balance -= amount
    wallet.total_spent += amount
    wallet.last_transaction_at = datetime.utcnow()

    # Create transaction
    transaction = WalletTransaction(
        transaction_id=generate_id("txn"),
        wallet_id=wallet.wallet_id,
        user_id=user_id,
        type=TransactionType.RIDE_PAYMENT,
        status=TransactionStatus.SUCCESS,
        amount=amount,
        balance_before=old_balance,
        balance_after=wallet.current_balance,
        ride_id=ride_id,
        description=description,
        metadata={"cashback_earned": cashback_amount}
    )
    db.add(transaction)

    # Add cashback if earned
    if cashback_amount > 0:
        wallet.total_cashback_received += cashback_amount

        # Credit cashback immediately or as pending
        cashback_earning = CashbackEarning(
            earning_id=generate_id("cb"),
            user_id=user_id,
            wallet_id=wallet.wallet_id,
            rule_id="auto",
            transaction_id=transaction.transaction_id,
            ride_id=ride_id,
            transaction_amount=amount,
            cashback_percentage=cashback_result["total_cashback"] / amount * 100,
            cashback_amount=cashback_amount,
            status="credited",
            credited_at=datetime.utcnow()
        )
        db.add(cashback_earning)

        # Credit to wallet
        wallet.current_balance += cashback_amount
        cashback_transaction = WalletTransaction(
            transaction_id=generate_id("txn"),
            wallet_id=wallet.wallet_id,
            user_id=user_id,
            type=TransactionType.CASHBACK,
            status=TransactionStatus.SUCCESS,
            amount=cashback_amount,
            balance_before=wallet.current_balance - cashback_amount,
            balance_after=wallet.current_balance,
            cashback_id=cashback_earning.earning_id,
            description=f"Cashback on ride {ride_id}"
        )
        db.add(cashback_transaction)

    # Check if auto-recharge needed
    if check_auto_recharge_trigger(wallet, db):
        config = db.query(AutoRechargeConfig).filter_by(user_id=user_id).first()
        # Trigger auto-recharge (simplified - in production would call payment processor)
        auto_recharge_tx = WalletTransaction(
            transaction_id=generate_id("txn"),
            wallet_id=wallet.wallet_id,
            user_id=user_id,
            type=TransactionType.AUTO_RECHARGE,
            status=TransactionStatus.PENDING,
            amount=config.recharge_amount,
            balance_before=wallet.current_balance,
            balance_after=wallet.current_balance + config.recharge_amount,
            description="Auto-recharge triggered"
        )
        db.add(auto_recharge_tx)
        config.last_recharge_at = datetime.utcnow()
        config.total_auto_recharged += config.recharge_amount

    db.commit()

    return {
        "user_id": user_id,
        "ride_id": ride_id,
        "fare_charged": amount,
        "cashback_earned": cashback_amount,
        "new_balance": wallet.current_balance,
        "status": "success"
    }


@router.get("/summary/{user_id}")
async def get_wallet_summary(user_id: str, db: Session = Depends(get_db)):
    """Get complete wallet summary for dashboard display"""

    wallet = db.query(UserWallet).filter_by(user_id=user_id).first()
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")

    auto_recharge = db.query(AutoRechargeConfig).filter_by(user_id=user_id).first()

    # Get recent transactions
    recent_txns = db.query(WalletTransaction).filter_by(user_id=user_id).order_by(
        desc(WalletTransaction.created_at)
    ).limit(5).all()

    # Get stats
    this_month_spent = db.query(func.sum(WalletTransaction.amount)).filter(
        WalletTransaction.user_id == user_id,
        WalletTransaction.type == TransactionType.RIDE_PAYMENT,
        WalletTransaction.created_at >= datetime.utcnow().replace(day=1)
    ).scalar() or 0.0

    return {
        "current_balance": wallet.current_balance,
        "max_balance": wallet.max_balance,
        "total_topups": wallet.total_topups,
        "total_spent": wallet.total_spent,
        "total_cashback_received": wallet.total_cashback_received,
        "auto_recharge_enabled": auto_recharge.is_enabled if auto_recharge else False,
        "auto_recharge_threshold": auto_recharge.threshold_amount if auto_recharge else None,
        "this_month_spent": this_month_spent,
        "recent_transactions": [
            {
                "type": t.type,
                "amount": t.amount,
                "description": t.description,
                "created_at": t.created_at.isoformat()
            }
            for t in recent_txns
        ],
        "last_updated": wallet.updated_at.isoformat()
    }
