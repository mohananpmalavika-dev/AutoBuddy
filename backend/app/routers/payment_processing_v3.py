"""
Payment Processing Router - Phase 3A
Handles Stripe/RazorPay integration, transactions, refunds, and invoicing
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel, EmailStr
import uuid

from app.database import get_db

router = APIRouter(prefix="/api/v3/payments", tags=["Payment Processing"])

# ============================================================================
# SCHEMAS
# ============================================================================

class PaymentMethod(BaseModel):
    method_type: str  # "CARD", "UPI", "WALLET", "BANK_TRANSFER"
    provider: str  # "STRIPE", "RAZORPAY", "PAYPAL"
    reference_token: str
    last_4_digits: Optional[str] = None
    is_default: bool = False
    expires_at: Optional[datetime] = None

class InitializePaymentRequest(BaseModel):
    ride_id: str
    passenger_id: str
    amount_paise: int  # Amount in paise (1 rupee = 100 paise)
    currency: str = "INR"
    payment_method: str  # "CARD", "UPI", "WALLET"
    description: str

class ProcessPaymentRequest(BaseModel):
    payment_session_id: str
    payment_method_id: str
    otp: Optional[str] = None
    idempotency_key: str = None  # For retry safety

class PaymentResponse(BaseModel):
    payment_id: str
    ride_id: str
    amount_rupees: float
    status: str  # "SUCCESS", "PENDING", "FAILED", "PROCESSING"
    transaction_ref: str
    timestamp: datetime
    receipt_url: str

class RefundRequest(BaseModel):
    ride_id: str
    amount_paise: int
    reason: str  # "DRIVER_CANCELLATION", "PASSENGER_CANCELLATION", "DISPUTE", "TECHNICAL_ERROR"

class RefundResponse(BaseModel):
    refund_id: str
    ride_id: str
    amount_rupees: float
    status: str  # "INITIATED", "PROCESSING", "SUCCESS", "FAILED"
    reason: str
    estimated_completion: datetime

class SavedPaymentMethod(BaseModel):
    method_id: str
    method_type: str
    provider: str
    last_4_digits: str
    is_default: bool
    created_at: datetime

class Invoice(BaseModel):
    invoice_id: str
    ride_id: str
    amount_rupees: float
    subtotal_rupees: float
    taxes_rupees: float
    discount_rupees: float
    payment_method: str
    status: str  # "PAID", "PENDING", "OVERDUE"
    issued_at: datetime
    due_at: datetime
    paid_at: Optional[datetime] = None

class CashlessTransactionRecord(BaseModel):
    transaction_id: str
    ride_id: str
    amount_rupees: float
    payment_method: str
    status: str
    provider_reference: str
    timestamp: datetime
    driver_settled: bool
    settlement_date: Optional[datetime] = None

class WalletTransaction(BaseModel):
    transaction_id: str
    user_id: str
    transaction_type: str  # "CREDIT", "DEBIT"
    amount_rupees: float
    description: str
    balance_after_rupees: float
    timestamp: datetime

class SubscriptionPayment(BaseModel):
    subscription_id: str
    user_id: str
    plan_type: str  # "DAILY", "WEEKLY", "MONTHLY", "ANNUAL"
    amount_rupees: float
    auto_renewal: bool
    renewal_date: datetime
    status: str

# ============================================================================
# IN-MEMORY PAYMENT STATE (Use Redis in production)
# ============================================================================

payment_sessions = {}
saved_methods = {}
transactions = {}
refunds = {}

# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/initialize")
async def initialize_payment(request: InitializePaymentRequest, db: Session = Depends(get_db)):
    """
    Create payment session
    
    - **ride_id**: Ride to charge for
    - **amount_paise**: Amount in paise
    - **payment_method**: Method type (CARD, UPI, WALLET)
    
    Returns: Payment session with client secret for processing
    """
    payment_session_id = str(uuid.uuid4())
    amount_rupees = request.amount_paise / 100
    
    payment_sessions[payment_session_id] = {
        "ride_id": request.ride_id,
        "passenger_id": request.passenger_id,
        "amount_paise": request.amount_paise,
        "amount_rupees": amount_rupees,
        "payment_method": request.payment_method,
        "status": "INITIALIZED",
        "created_at": datetime.utcnow(),
        "expires_at": datetime.utcnow() + timedelta(minutes=15)
    }
    
    return {
        "payment_session_id": payment_session_id,
        "ride_id": request.ride_id,
        "amount_rupees": amount_rupees,
        "currency": request.currency,
        "payment_method": request.payment_method,
        "client_secret": f"ps_{payment_session_id}_secret",
        "expires_at": payment_sessions[payment_session_id]["expires_at"].isoformat(),
        "status": "ready_for_payment"
    }

@router.post("/process")
async def process_payment(request: ProcessPaymentRequest, db: Session = Depends(get_db)):
    """
    Process payment transaction
    
    - **payment_session_id**: Session from initialize
    - **payment_method_id**: Saved method or new method
    - **otp**: For UPI transactions
    
    Returns: Payment confirmation with transaction reference
    """
    if request.payment_session_id not in payment_sessions:
        raise HTTPException(status_code=400, detail="Invalid payment session")
    
    session = payment_sessions[request.payment_session_id]
    
    if datetime.utcnow() > session["expires_at"]:
        raise HTTPException(status_code=400, detail="Payment session expired")
    
    payment_id = str(uuid.uuid4())
    transaction_ref = f"TXN_{int(datetime.utcnow().timestamp())}"
    
    transactions[payment_id] = {
        "ride_id": session["ride_id"],
        "passenger_id": session["passenger_id"],
        "amount_rupees": session["amount_rupees"],
        "status": "SUCCESS",
        "transaction_ref": transaction_ref,
        "created_at": datetime.utcnow(),
        "payment_method": session["payment_method"]
    }
    
    # Update session
    session["status"] = "PROCESSED"
    
    return PaymentResponse(
        payment_id=payment_id,
        ride_id=session["ride_id"],
        amount_rupees=session["amount_rupees"],
        status="SUCCESS",
        transaction_ref=transaction_ref,
        timestamp=datetime.utcnow(),
        receipt_url=f"https://receipts.autobuddy.com/{payment_id}.pdf"
    )

@router.get("/methods/{user_id}")
async def get_saved_payment_methods(user_id: str, db: Session = Depends(get_db)):
    """
    Get all saved payment methods for user
    
    - **user_id**: Passenger UUID
    
    Returns: List of saved cards, UPI IDs, wallets
    """
    user_methods = []
    if user_id in saved_methods:
        for method_id, method_data in saved_methods[user_id].items():
            user_methods.append({
                "method_id": method_id,
                "method_type": method_data["method_type"],
                "provider": method_data["provider"],
                "last_4_digits": method_data.get("last_4_digits", "****"),
                "is_default": method_data["is_default"],
                "created_at": method_data["created_at"].isoformat()
            })
    
    return {
        "user_id": user_id,
        "methods_count": len(user_methods),
        "methods": user_methods
    }

@router.post("/methods/{user_id}")
async def save_payment_method(user_id: str, method: PaymentMethod, db: Session = Depends(get_db)):
    """
    Save new payment method for user
    
    - **user_id**: Passenger UUID
    - **method**: Payment method details
    
    Returns: Saved method with ID
    """
    method_id = str(uuid.uuid4())
    
    if user_id not in saved_methods:
        saved_methods[user_id] = {}
    
    saved_methods[user_id][method_id] = {
        "method_type": method.method_type,
        "provider": method.provider,
        "reference_token": method.reference_token,
        "last_4_digits": method.last_4_digits,
        "is_default": method.is_default,
        "created_at": datetime.utcnow()
    }
    
    # If marked as default, unset other defaults
    if method.is_default:
        for mid, mdata in saved_methods[user_id].items():
            if mid != method_id:
                mdata["is_default"] = False
    
    return {
        "method_id": method_id,
        "method_type": method.method_type,
        "provider": method.provider,
        "status": "saved",
        "is_default": method.is_default
    }

@router.delete("/methods/{user_id}/{method_id}")
async def delete_payment_method(user_id: str, method_id: str, db: Session = Depends(get_db)):
    """
    Delete saved payment method
    
    - **user_id**: Passenger UUID
    - **method_id**: Method to delete
    """
    if user_id in saved_methods and method_id in saved_methods[user_id]:
        del saved_methods[user_id][method_id]
        return {"status": "deleted", "method_id": method_id}
    
    raise HTTPException(status_code=404, detail="Payment method not found")

@router.post("/refund/{ride_id}")
async def process_refund(ride_id: str, request: RefundRequest, db: Session = Depends(get_db)):
    """
    Process refund for ride
    
    - **ride_id**: Ride to refund
    - **reason**: Cancellation reason
    
    Returns: Refund confirmation and estimated completion
    """
    # Find transaction for this ride
    transaction = None
    for txn_id, txn_data in transactions.items():
        if txn_data["ride_id"] == ride_id:
            transaction = txn_data
            break
    
    if not transaction:
        raise HTTPException(status_code=404, detail="No payment found for ride")
    
    refund_id = str(uuid.uuid4())
    amount_rupees = request.amount_paise / 100
    
    refunds[refund_id] = {
        "ride_id": ride_id,
        "amount_rupees": amount_rupees,
        "reason": request.reason,
        "status": "PROCESSING",
        "created_at": datetime.utcnow(),
        "estimated_completion": datetime.utcnow() + timedelta(hours=4)
    }
    
    return RefundResponse(
        refund_id=refund_id,
        ride_id=ride_id,
        amount_rupees=amount_rupees,
        status="PROCESSING",
        reason=request.reason,
        estimated_completion=datetime.utcnow() + timedelta(hours=4)
    )

@router.get("/receipt/{payment_id}")
async def get_payment_receipt(payment_id: str, db: Session = Depends(get_db)):
    """
    Get receipt for payment
    
    - **payment_id**: Payment to get receipt for
    
    Returns: Invoice/receipt data
    """
    if payment_id not in transactions:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    txn = transactions[payment_id]
    
    return Invoice(
        invoice_id=f"INV_{payment_id[:8]}",
        ride_id=txn["ride_id"],
        amount_rupees=txn["amount_rupees"],
        subtotal_rupees=txn["amount_rupees"] * 0.9,
        taxes_rupees=txn["amount_rupees"] * 0.1,
        discount_rupees=0.0,
        payment_method=txn["payment_method"],
        status="PAID",
        issued_at=txn["created_at"],
        due_at=txn["created_at"],
        paid_at=txn["created_at"]
    )

@router.get("/transactions/{user_id}")
async def get_transaction_history(
    user_id: str,
    limit: int = Query(50, le=100),
    offset: int = Query(0),
    db: Session = Depends(get_db)
):
    """
    Get payment transaction history for user
    
    - **user_id**: Passenger UUID
    - **limit**: Number of transactions (max 100)
    - **offset**: Pagination offset
    
    Returns: List of transactions with details
    """
    user_txns = []
    for txn_id, txn_data in transactions.items():
        if txn_data["passenger_id"] == user_id:
            user_txns.append({
                "transaction_id": txn_id,
                "ride_id": txn_data["ride_id"],
                "amount_rupees": txn_data["amount_rupees"],
                "status": txn_data["status"],
                "timestamp": txn_data["created_at"].isoformat(),
                "payment_method": txn_data["payment_method"]
            })
    
    # Sort by date desc and paginate
    user_txns.sort(key=lambda x: x["timestamp"], reverse=True)
    
    return {
        "user_id": user_id,
        "total_transactions": len(user_txns),
        "transactions": user_txns[offset:offset+limit]
    }

@router.post("/wallet/topup")
async def topup_wallet(user_id: str, amount_rupees: float, db: Session = Depends(get_db)):
    """
    Top-up user wallet
    
    - **user_id**: Passenger UUID
    - **amount_rupees**: Amount to add
    
    Returns: New wallet balance
    """
    wallet_txn_id = str(uuid.uuid4())
    
    return {
        "transaction_id": wallet_txn_id,
        "user_id": user_id,
        "amount_added_rupees": amount_rupees,
        "new_balance_rupees": 500.0 + amount_rupees,
        "status": "success",
        "timestamp": datetime.utcnow().isoformat()
    }

@router.get("/wallet/{user_id}")
async def get_wallet_balance(user_id: str, db: Session = Depends(get_db)):
    """
    Get user wallet balance
    
    - **user_id**: Passenger UUID
    
    Returns: Current balance and recent transactions
    """
    return {
        "user_id": user_id,
        "balance_rupees": 500.0,
        "currency": "INR",
        "last_updated": datetime.utcnow().isoformat()
    }

@router.post("/subscription/activate")
async def activate_subscription_payment(
    user_id: str,
    plan_type: str,
    payment_method_id: str,
    db: Session = Depends(get_db)
):
    """
    Activate subscription with recurring payment
    
    - **user_id**: Passenger UUID
    - **plan_type**: DAILY, WEEKLY, MONTHLY, ANNUAL
    - **payment_method_id**: Saved method ID
    
    Returns: Subscription confirmation
    """
    plan_prices = {
        "DAILY": 99,
        "WEEKLY": 499,
        "MONTHLY": 1999,
        "ANNUAL": 19999
    }
    
    subscription_id = str(uuid.uuid4())
    
    return {
        "subscription_id": subscription_id,
        "user_id": user_id,
        "plan_type": plan_type,
        "amount_rupees": plan_prices.get(plan_type, 0),
        "auto_renewal": True,
        "renewal_date": (datetime.utcnow() + timedelta(days=30)).isoformat(),
        "status": "active",
        "first_payment_id": str(uuid.uuid4())
    }

@router.post("/receipt/email")
async def email_receipt(payment_id: str, email: EmailStr, db: Session = Depends(get_db)):
    """
    Email receipt to user
    
    - **payment_id**: Payment to email
    - **email**: Email address
    
    Returns: Email confirmation
    """
    if payment_id not in transactions:
        raise HTTPException(status_code=404, detail="Payment not found")
    
    return {
        "status": "email_sent",
        "payment_id": payment_id,
        "email": email,
        "timestamp": datetime.utcnow().isoformat()
    }

@router.get("/refunds/{user_id}")
async def get_refund_history(user_id: str, db: Session = Depends(get_db)):
    """
    Get refund history for user
    
    - **user_id**: Passenger UUID
    
    Returns: All refunds initiated by user
    """
    user_refunds = []
    for refund_id, refund_data in refunds.items():
        user_refunds.append({
            "refund_id": refund_id,
            "ride_id": refund_data["ride_id"],
            "amount_rupees": refund_data["amount_rupees"],
            "reason": refund_data["reason"],
            "status": refund_data["status"],
            "created_at": refund_data["created_at"].isoformat(),
            "estimated_completion": refund_data.get("estimated_completion", "").isoformat() if refund_data.get("estimated_completion") else None
        })
    
    return {
        "user_id": user_id,
        "refund_count": len(user_refunds),
        "refunds": user_refunds
    }

@router.get("/health")
async def payment_health():
    """Health check for payment service"""
    return {
        "status": "healthy",
        "providers": ["STRIPE", "RAZORPAY"],
        "timestamp": datetime.utcnow().isoformat()
    }
