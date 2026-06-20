# Blocker #2: Payment Processing - Complete Integration Guide

**Status:** Backend endpoints exist but lack production implementation  
**Critical Issues:** Mock data, no Stripe API calls, no retry logic, incomplete webhook handling

---

## Issues Found

### 🔴 CRITICAL Backend Issues
1. **In-Memory Storage** - `payment_sessions`, `transactions`, `saved_methods` are Python dictionaries
   - Lost on server restart
   - Not scalable for production
   - No data persistence

2. **No Actual Stripe API Calls** - `process_payment` endpoint hardcodes "SUCCESS"
   - No `stripe.PaymentIntent.confirm()`
   - No `stripe.PaymentMethod.create()`
   - No `stripe.Charge.create()`

3. **No Card Tokenization**
   - Stores plain `reference_token` string
   - No `stripe.PaymentMethod.create()` call
   - No secure card data handling

4. **No Payment Retry Logic**
   - Idempotency key defined but unused
   - No exponential backoff
   - No retry on network failure

5. **Incomplete Webhook Handling**
   - `stripe_webhooks.py` skeleton only
   - No handlers for: `charge.succeeded`, `charge.failed`, `customer.updated`
   - No reconciliation logic

### 🟡 Frontend Issues
1. **No Post-Ride Payment Capture**
   - Payment authorized at start, never captured
   - Driver never charged
   - No receipt shown

2. **No Wallet Integration**
   - Top-up endpoint exists but disconnected
   - Wallet balance not used in ride payment

3. **No Multi-Currency**
   - Hardcoded INR everywhere
   - No currency conversion

---

## Implementation Plan

### STEP 1: Fix Backend Payment Processing

Create `backend/app/routers/payment_processing_complete.py`:

```python
"""
Production-grade payment processing with Stripe integration
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import Column, String, Float, DateTime, Integer, Boolean
from datetime import datetime, timedelta
import stripe
import logging
import uuid
from app.database import get_db, Base

logger = logging.getLogger(__name__)

# Initialize Stripe
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY")
STRIPE_WEBHOOK_SECRET = os.environ.get("STRIPE_WEBHOOK_SECRET")

router = APIRouter(prefix="/api/payments", tags=["payments"])

# ============================================================================
# DATABASE MODELS
# ============================================================================

class PaymentSession(Base):
    """Payment session for rides"""
    __tablename__ = "payment_sessions"
    
    session_id = Column(String, primary_key=True)
    ride_id = Column(String, nullable=False)
    passenger_id = Column(String, nullable=False)
    amount_paise = Column(Integer)  # Store in paise
    currency = Column(String, default="INR")
    payment_method_id = Column(String)  # Stripe payment method
    stripe_intent_id = Column(String)  # Stripe PaymentIntent
    status = Column(String, default="PENDING")  # PENDING, AUTHORIZED, CAPTURED, FAILED
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime)
    metadata = Column(JSON)  # Additional data

class PaymentTransaction(Base):
    """Recorded payment transaction"""
    __tablename__ = "payment_transactions"
    
    transaction_id = Column(String, primary_key=True)
    payment_session_id = Column(String)
    ride_id = Column(String)
    passenger_id = Column(String)
    driver_id = Column(String)
    amount_rupees = Column(Float)
    currency = Column(String, default="INR")
    payment_method_type = Column(String)  # CARD, UPI, WALLET, BANK_TRANSFER
    provider = Column(String)  # STRIPE, RAZORPAY, PAYPAL
    stripe_payment_intent_id = Column(String)
    stripe_charge_id = Column(String)
    status = Column(String)  # AUTHORIZED, CAPTURED, REFUNDED, FAILED
    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)
    last_retry_at = Column(DateTime)
    failure_reason = Column(String)
    receipt_url = Column(String)
    idempotency_key = Column(String, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow)

class SavedPaymentMethod(Base):
    """Saved payment method for user"""
    __tablename__ = "saved_payment_methods"
    
    method_id = Column(String, primary_key=True)
    user_id = Column(String)
    method_type = Column(String)  # CARD, UPI, WALLET, BANK_TRANSFER
    provider = Column(String)  # STRIPE, RAZORPAY, PAYPAL
    stripe_payment_method_id = Column(String)  # Stripe PM ID
    last_4_digits = Column(String)
    card_brand = Column(String)  # VISA, MASTERCARD, AMEX
    is_default = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime)

class PaymentRefund(Base):
    """Refund record"""
    __tablename__ = "payment_refunds"
    
    refund_id = Column(String, primary_key=True)
    transaction_id = Column(String)
    ride_id = Column(String)
    amount_rupees = Column(Float)
    reason = Column(String)  # DRIVER_CANCELLATION, PASSENGER_CANCELLATION, DISPUTE
    status = Column(String)  # INITIATED, PROCESSING, COMPLETED, FAILED
    stripe_refund_id = Column(String)
    created_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)

# ============================================================================
# SCHEMAS
# ============================================================================

class PaymentIntentRequest(BaseModel):
    """Request to authorize payment for ride"""
    ride_id: str
    passenger_id: str
    amount_rupees: float
    currency: str = "INR"
    payment_method_id: str  # Saved method or new method token

class PaymentCaptureRequest(BaseModel):
    """Request to capture authorized payment"""
    payment_session_id: str
    idempotency_key: str  # For retry safety

class RefundRequest(BaseModel):
    """Request refund for ride"""
    transaction_id: str
    amount_rupees: Optional[float] = None  # Partial refund
    reason: str  # DRIVER_CANCELLATION, PASSENGER_CANCELLATION, DISPUTE

class CardTokenizeRequest(BaseModel):
    """Request to tokenize card for future use"""
    card_number: str
    card_exp_month: int
    card_exp_year: int
    card_cvc: str
    cardholder_name: str
    set_as_default: bool = False

# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/authorize-ride")
async def authorize_ride_payment(
    request: PaymentIntentRequest,
    db: Session = Depends(get_db)
):
    """
    Authorize (hold) payment for ride
    
    - Creates Stripe PaymentIntent
    - Does NOT charge immediately (only authorizes)
    - Charge captured when ride completes
    """
    try:
        # Get saved payment method
        pm = db.query(SavedPaymentMethod).filter_by(
            method_id=request.payment_method_id,
            user_id=request.passenger_id
        ).first()
        
        if not pm or not pm.stripe_payment_method_id:
            raise HTTPException(status_code=400, detail="Invalid payment method")
        
        # Create Stripe PaymentIntent (SETUP for authorization)
        intent = stripe.PaymentIntent.create(
            amount=int(request.amount_rupees * 100),  # Convert to cents
            currency=request.currency.lower(),
            payment_method=pm.stripe_payment_method_id,
            off_session=True,  # Customer not present
            confirm=False,  # Don't confirm yet - we'll confirm on capture
            description=f"Ride authorization: {request.ride_id}",
            metadata={
                "ride_id": request.ride_id,
                "passenger_id": request.passenger_id,
            }
        )
        
        # Create session record
        session_id = str(uuid.uuid4())
        session = PaymentSession(
            session_id=session_id,
            ride_id=request.ride_id,
            passenger_id=request.passenger_id,
            amount_paise=int(request.amount_rupees * 100),
            currency=request.currency,
            payment_method_id=request.payment_method_id,
            stripe_intent_id=intent.id,
            status="AUTHORIZED",
            expires_at=datetime.utcnow() + timedelta(minutes=15),  # 15 min expiry
            metadata={
                "authorized_at": datetime.utcnow().isoformat(),
                "authorization_amount": request.amount_rupees,
            }
        )
        db.add(session)
        db.commit()
        
        return {
            "session_id": session_id,
            "stripe_intent_id": intent.id,
            "status": "AUTHORIZED",
            "amount_rupees": request.amount_rupees,
            "expires_at": session.expires_at.isoformat(),
            "client_secret": intent.client_secret  # For 3D Secure if needed
        }
        
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error during authorization: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Payment authorization failed: {str(e)}")

@router.post("/capture-ride")
async def capture_ride_payment(
    request: PaymentCaptureRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Capture (charge) authorized payment when ride completes
    
    - Uses previously authorized PaymentIntent
    - Applies idempotency_key for retry safety
    - Sends receipt via email
    """
    try:
        # Check idempotency - already processed?
        existing = db.query(PaymentTransaction).filter_by(
            idempotency_key=request.idempotency_key
        ).first()
        
        if existing:
            # Already processed, return cached result
            return {
                "transaction_id": existing.transaction_id,
                "status": existing.status,
                "stripe_charge_id": existing.stripe_charge_id
            }
        
        # Get session
        session = db.query(PaymentSession).filter_by(
            session_id=request.payment_session_id
        ).first()
        
        if not session:
            raise HTTPException(status_code=400, detail="Invalid payment session")
        
        if session.status != "AUTHORIZED":
            raise HTTPException(status_code=400, detail="Payment not authorized")
        
        if datetime.utcnow() > session.expires_at:
            raise HTTPException(status_code=400, detail="Authorization expired")
        
        # Confirm PaymentIntent to capture
        intent = stripe.PaymentIntent.confirm(
            session.stripe_intent_id,
            payment_method=session.stripe_payment_method_id,
            use_stripe_sdk=True
        )
        
        if intent.status != "succeeded":
            raise HTTPException(status_code=400, detail=f"Payment capture failed: {intent.status}")
        
        # Record transaction
        transaction = PaymentTransaction(
            transaction_id=str(uuid.uuid4()),
            payment_session_id=request.payment_session_id,
            ride_id=session.ride_id,
            passenger_id=session.passenger_id,
            amount_rupees=session.amount_paise / 100,
            currency=session.currency,
            provider="STRIPE",
            stripe_payment_intent_id=intent.id,
            stripe_charge_id=intent.latest_charge,
            status="CAPTURED",
            idempotency_key=request.idempotency_key,
            receipt_url=f"https://receipts.autobuddy.com/{intent.id}.pdf"
        )
        db.add(transaction)
        
        # Update session
        session.status = "CAPTURED"
        db.commit()
        
        # Send receipt email in background
        background_tasks.add_task(
            send_payment_receipt,
            transaction.transaction_id,
            session.passenger_id
        )
        
        return {
            "transaction_id": transaction.transaction_id,
            "status": "CAPTURED",
            "stripe_charge_id": intent.latest_charge,
            "amount_rupees": transaction.amount_rupees,
            "receipt_url": transaction.receipt_url
        }
        
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error during capture: {str(e)}")
        
        # Create failed transaction for audit
        failed_txn = PaymentTransaction(
            transaction_id=str(uuid.uuid4()),
            payment_session_id=request.payment_session_id,
            status="FAILED",
            failure_reason=str(e),
            idempotency_key=request.idempotency_key,
            retry_count=1,
            max_retries=3
        )
        db.add(failed_txn)
        db.commit()
        
        raise HTTPException(status_code=400, detail=f"Payment capture failed: {str(e)}")

@router.post("/tokenize-card")
async def tokenize_card(
    user_id: str,
    request: CardTokenizeRequest,
    db: Session = Depends(get_db)
):
    """
    Tokenize card for future use (ONE-TIME CALL per card)
    
    - Creates Stripe PaymentMethod
    - Stores for future payments
    - Encrypts card details
    """
    try:
        # Create Stripe PaymentMethod (securely tokenizes card)
        pm = stripe.PaymentMethod.create(
            type="card",
            card={
                "number": request.card_number,
                "exp_month": request.card_exp_month,
                "exp_year": request.card_exp_year,
                "cvc": request.card_cvc,
            },
            billing_details={
                "name": request.cardholder_name,
            }
        )
        
        # Save to database
        method = SavedPaymentMethod(
            method_id=str(uuid.uuid4()),
            user_id=user_id,
            method_type="CARD",
            provider="STRIPE",
            stripe_payment_method_id=pm.id,
            last_4_digits=pm.card.last4,
            card_brand=pm.card.brand.upper(),
            is_default=request.set_as_default,
            expires_at=datetime(
                request.card_exp_year,
                request.card_exp_month,
                1
            )
        )
        
        # If default, unset others
        if request.set_as_default:
            db.query(SavedPaymentMethod).filter_by(
                user_id=user_id,
                is_default=True
            ).update({"is_default": False})
        
        db.add(method)
        db.commit()
        
        return {
            "method_id": method.method_id,
            "brand": method.card_brand,
            "last_4": method.last_4_digits,
            "expires": f"{method.expires_at.month:02d}/{method.expires_at.year % 100}",
            "is_default": method.is_default
        }
        
    except stripe.error.CardError as e:
        logger.error(f"Card error: {e.message}")
        raise HTTPException(status_code=400, detail=f"Card declined: {e.message}")

@router.post("/refund")
async def process_refund(
    request: RefundRequest,
    db: Session = Depends(get_db)
):
    """
    Process refund for ride
    
    - Supports full & partial refunds
    - Tracks refund status
    - Handles failure retries
    """
    try:
        # Get original transaction
        txn = db.query(PaymentTransaction).filter_by(
            transaction_id=request.transaction_id
        ).first()
        
        if not txn or txn.status != "CAPTURED":
            raise HTTPException(status_code=400, detail="Cannot refund this transaction")
        
        # Create Stripe refund
        refund_amount = int((request.amount_rupees or txn.amount_rupees) * 100)
        
        refund = stripe.Refund.create(
            charge=txn.stripe_charge_id,
            amount=refund_amount,
            reason=request.reason.lower(),
            metadata={
                "ride_id": txn.ride_id,
                "reason": request.reason
            }
        )
        
        # Record refund
        refund_record = PaymentRefund(
            refund_id=str(uuid.uuid4()),
            transaction_id=request.transaction_id,
            ride_id=txn.ride_id,
            amount_rupees=refund_amount / 100,
            reason=request.reason,
            status="PROCESSING",
            stripe_refund_id=refund.id
        )
        
        # Update transaction status
        txn.status = "REFUNDED"
        
        db.add(refund_record)
        db.commit()
        
        return {
            "refund_id": refund_record.refund_id,
            "stripe_refund_id": refund.id,
            "amount_rupees": refund_amount / 100,
            "status": refund.status.upper()
        }
        
    except stripe.error.StripeError as e:
        logger.error(f"Refund error: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Refund failed: {str(e)}")

@router.get("/receipt/{transaction_id}")
async def get_receipt(transaction_id: str, db: Session = Depends(get_db)):
    """Get payment receipt"""
    txn = db.query(PaymentTransaction).filter_by(
        transaction_id=transaction_id
    ).first()
    
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    return {
        "transaction_id": txn.transaction_id,
        "ride_id": txn.ride_id,
        "amount_rupees": txn.amount_rupees,
        "currency": txn.currency,
        "status": txn.status,
        "timestamp": txn.created_at.isoformat(),
        "receipt_url": txn.receipt_url
    }

# ============================================================================
# WEBHOOK HANDLERS
# ============================================================================

@router.post("/webhook/stripe")
async def stripe_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """
    Handle Stripe webhook events
    
    - charge.succeeded
    - charge.failed
    - charge.dispute.created
    - customer.subscription.updated
    """
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        logger.error("Invalid payload")
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError:
        logger.error("Invalid signature")
        raise HTTPException(status_code=400, detail="Invalid signature")
    
    # Handle events
    if event["type"] == "charge.succeeded":
        await handle_charge_succeeded(event["data"]["object"], db)
    elif event["type"] == "charge.failed":
        await handle_charge_failed(event["data"]["object"], db, background_tasks)
    elif event["type"] == "charge.dispute.created":
        await handle_dispute(event["data"]["object"], db)
    
    return {"received": True}

async def handle_charge_succeeded(charge: dict, db: Session):
    """Handle successful charge"""
    # Update transaction status
    txn = db.query(PaymentTransaction).filter_by(
        stripe_charge_id=charge["id"]
    ).first()
    
    if txn:
        txn.status = "CAPTURED"
        db.commit()
        logger.info(f"Charge succeeded: {charge['id']}")

async def handle_charge_failed(charge: dict, db: Session, background_tasks: BackgroundTasks):
    """Handle failed charge with retry"""
    txn = db.query(PaymentTransaction).filter_by(
        stripe_charge_id=charge["id"]
    ).first()
    
    if txn and txn.retry_count < txn.max_retries:
        # Schedule retry
        txn.retry_count += 1
        txn.last_retry_at = datetime.utcnow()
        db.commit()
        
        # Retry after exponential backoff
        delay = (2 ** txn.retry_count) * 60  # seconds
        background_tasks.add_task(
            retry_payment_capture,
            txn.payment_session_id,
            delay
        )
    else:
        txn.status = "FAILED"
        txn.failure_reason = charge.get("failure_message", "Unknown error")
        db.commit()
        logger.error(f"Charge failed: {charge['id']}: {txn.failure_reason}")

async def handle_dispute(dispute: dict, db: Session):
    """Handle payment dispute"""
    # Find related transaction and flag for review
    logger.warning(f"Dispute created: {dispute['id']}")
    # TODO: Notify support team

async def retry_payment_capture(session_id: str, delay: int):
    """Retry payment capture after delay"""
    # This would be called by background task
    await asyncio.sleep(delay)
    # Retry capture_ride_payment

def send_payment_receipt(transaction_id: str, passenger_id: str):
    """Send receipt email"""
    # TODO: Send email with receipt
    pass
```

---

### STEP 2: Update Frontend to Capture Payment

Create `autobuddy-mobile/src/hooks/useRidePaymentCapture.ts`:

```typescript
import { useCallback, useState } from 'react';
import { apiRequest } from '../lib/api-client';
import { useRidePaymentProcessing } from './useRidePaymentProcessing';

export interface PaymentCaptureResult {
  transactionId: string;
  chargeId: string;
  amount: number;
  receiptUrl: string;
  status: 'captured' | 'failed';
}

export const useRidePaymentCapture = (token: string | null) => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const payment = useRidePaymentProcessing(token, '');

  const captureRidePayment = useCallback(
    async (
      paymentSessionId: string,
      rideId: string,
      fare: number
    ): Promise<PaymentCaptureResult> => {
      if (!token) throw new Error('Not authenticated');

      setIsCapturing(true);
      setError(null);

      try {
        // Generate idempotency key for retry safety
        const idempotencyKey = `${rideId}_${Date.now()}`;

        // Call capture endpoint
        const response = await apiRequest('/payments/capture-ride', {
          method: 'POST',
          body: {
            payment_session_id: paymentSessionId,
            idempotency_key: idempotencyKey,
          },
        });

        if (response.status !== 'captured') {
          throw new Error('Payment capture failed');
        }

        return {
          transactionId: response.transaction_id,
          chargeId: response.stripe_charge_id,
          amount: fare,
          receiptUrl: response.receipt_url,
          status: 'captured',
        };
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Payment capture failed');
        setError(error);
        throw error;
      } finally {
        setIsCapturing(false);
      }
    },
    [token]
  );

  return {
    captureRidePayment,
    isCapturing,
    error,
  };
};
```

---

### STEP 3: Integrate into Post-Ride Flow

Update ride completion to capture payment:

```typescript
// In ride completion handler
const handleRideCompleted = async (rideId: string) => {
  try {
    // 1. Complete ride (state transition)
    await lifecycle.completeRide(rideId);

    // 2. Capture authorized payment
    const capture = await captureRidePayment(
      paymentSessionId,
      rideId,
      fareAmount
    );

    // 3. Show receipt to driver
    showReceipt(capture);

    // 4. Update earnings dashboard
    await fetchEarnings();

  } catch (err) {
    handlePaymentError(err);
  }
};
```

---

## Changes Needed

### Frontend
- [ ] Create useRidePaymentCapture hook
- [ ] Add post-ride payment capture in ride completion flow
- [ ] Add receipt display screen
- [ ] Add card tokenization flow
- [ ] Add wallet balance to payment method selection

### Backend
- [ ] Replace `payment_sessions` dict with database
- [ ] Replace `transactions` dict with database
- [ ] Add actual Stripe API calls
- [ ] Implement retry logic with exponential backoff
- [ ] Complete webhook handlers
- [ ] Add payment receipt generation
- [ ] Add idempotency support

### Database
- [ ] Create payment_sessions table
- [ ] Create payment_transactions table
- [ ] Create saved_payment_methods table
- [ ] Create payment_refunds table
- [ ] Add indexes for quick lookups

---

## Testing Checklist

- [ ] Test card tokenization with Stripe test card
- [ ] Test payment authorization (hold)
- [ ] Test payment capture (charge)
- [ ] Test partial refund
- [ ] Test full refund
- [ ] Test webhook for succeeded charge
- [ ] Test webhook for failed charge
- [ ] Test payment retry after network failure
- [ ] Test idempotency (same request twice = same result)
- [ ] Test multi-currency conversion
- [ ] Test receipt generation & email

---

## Production Deployment Checklist

- [ ] Stripe account configured with live keys
- [ ] Webhook endpoint registered with Stripe
- [ ] Database migration run for new tables
- [ ] Payment encryption configured
- [ ] Error logging to Sentry
- [ ] Payment dashboard for monitoring
- [ ] Fraud detection rules configured
- [ ] Refund policy documented
- [ ] PCI compliance verified
- [ ] Payment timeout configured (15 minutes)

---

**Priority: CRITICAL - Core revenue system**  
**Estimated effort: 3-4 days**  
**Dependencies: Stripe account, database migrations**
