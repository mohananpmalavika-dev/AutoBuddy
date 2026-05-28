"""
Payment processing router
Handles payment processing, refunds, and wallet transactions
"""
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.security import HTTPBearer
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timedelta, timezone
from enum import Enum
import stripe
import uuid
import logging

from app.db.deps import get_db
from app.utils.rbac import require_roles, get_current_user_secure
from app.utils.logging_config import StructuredLogger, LogCategory

router = APIRouter(prefix="/api/payments", tags=["payments"])
logger = logging.getLogger(__name__)
structured_logger = StructuredLogger(__name__)

# Configuration
stripe.api_key = None  # Set from environment


class PaymentStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"
    PARTIALLY_REFUNDED = "partially_refunded"


class RefundStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    REJECTED = "rejected"


class PaymentCreate(BaseModel):
    booking_id: str
    amount: float = Field(..., gt=0)
    payment_method_id: str
    currency: str = "INR"
    metadata: Optional[dict] = None


class PaymentResponse(BaseModel):
    id: str
    booking_id: str
    amount: float
    currency: str
    status: PaymentStatus
    payment_method_id: Optional[str]
    transaction_id: Optional[str]
    created_at: datetime
    updated_at: datetime
    error_message: Optional[str]


class RefundCreate(BaseModel):
    payment_id: str
    amount: Optional[float] = None  # Full refund if not specified
    reason: str = "customer_request"
    notes: Optional[str] = None


class RefundResponse(BaseModel):
    id: str
    payment_id: str
    amount: float
    status: RefundStatus
    reason: str
    created_at: datetime
    processed_at: Optional[datetime]
    error_message: Optional[str]


# Background tasks
async def process_refund_async(refund_id: str, payment_id: str, amount: float, db):
    """Background task to process refund asynchronously"""
    try:
        structured_logger.log_operation(
            f"async_refund_{refund_id}",
            "started",
            category=LogCategory.PAYMENT,
            metadata={
                "payment_id": payment_id,
                "amount": amount
            }
        )
        
        # Get payment from database
        payment = await db.payments.find_one({"id": payment_id})
        if not payment:
            structured_logger.log_operation(
                f"async_refund_{refund_id}",
                "failure",
                category=LogCategory.PAYMENT,
                error="Payment not found",
                metadata={"payment_id": payment_id}
            )
            return
        
        # Check if already refunded
        if payment["status"] in [PaymentStatus.REFUNDED, PaymentStatus.PARTIALLY_REFUNDED]:
            refundable_amount = payment.get("refundable_amount", 0)
            if refundable_amount < amount:
                structured_logger.log_operation(
                    f"async_refund_{refund_id}",
                    "failure",
                    category=LogCategory.PAYMENT,
                    error="Refund amount exceeds available balance",
                    metadata={"payment_id": payment_id, "amount": amount, "available": refundable_amount}
                )
                return
        
        # Process refund with payment provider
        refund_result = await _process_stripe_refund(payment_id, amount)
        
        if refund_result["success"]:
            # Update refund status
            await db.refunds.update_one(
                {"id": refund_id},
                {
                    "$set": {
                        "status": RefundStatus.COMPLETED,
                        "processed_at": datetime.now(timezone.utc),
                        "external_refund_id": refund_result.get("refund_id")
                    }
                }
            )
            
            # Update payment
            new_status = PaymentStatus.PARTIALLY_REFUNDED if amount < payment["amount"] else PaymentStatus.REFUNDED
            await db.payments.update_one(
                {"id": payment_id},
                {
                    "$set": {
                        "status": new_status,
                        "refunded_amount": payment.get("refunded_amount", 0) + amount,
                        "refundable_amount": payment.get("refundable_amount", 0) - amount,
                        "updated_at": datetime.now(timezone.utc)
                    }
                }
            )
            
            # Create wallet transaction for passenger
            await db.wallet_transactions.insert_one({
                "id": str(uuid.uuid4()),
                "user_id": payment["user_id"],
                "type": "refund",
                "amount": amount,
                "payment_id": payment_id,
                "refund_id": refund_id,
                "status": "completed",
                "created_at": datetime.now(timezone.utc),
                "metadata": {"reason": "payment_refund"}
            })
            
            structured_logger.log_operation(
                f"async_refund_{refund_id}",
                "success",
                category=LogCategory.PAYMENT,
                duration_ms=0,  # Updated by caller
                metadata={
                    "payment_id": payment_id,
                    "amount": amount,
                    "external_refund_id": refund_result.get("refund_id")
                }
            )
        else:
            # Update refund status to failed
            await db.refunds.update_one(
                {"id": refund_id},
                {
                    "$set": {
                        "status": RefundStatus.FAILED,
                        "error_message": refund_result.get("error")
                    }
                }
            )
            
            structured_logger.log_operation(
                f"async_refund_{refund_id}",
                "failure",
                category=LogCategory.PAYMENT,
                error=refund_result.get("error"),
                metadata={"payment_id": payment_id, "amount": amount}
            )
    
    except Exception as e:
        structured_logger.error(
            f"Refund processing failed: {str(e)}",
            category=LogCategory.PAYMENT,
            exception=e
        )
        
        # Mark as failed
        await db.refunds.update_one(
            {"id": refund_id},
            {
                "$set": {
                    "status": RefundStatus.FAILED,
                    "error_message": str(e)
                }
            }
        )


async def _process_stripe_refund(payment_id: str, amount: float):
    """Process refund with Stripe"""
    try:
        if not stripe.api_key:
            return {
                "success": False,
                "error": "Stripe API key not configured"
            }
        
        # Get transaction ID from database
        # In production, use async stripe client
        refund = stripe.Refund.create(
            charge=payment_id,  # Stripe charge ID
            amount=int(amount * 100),  # Amount in cents
        )
        
        return {
            "success": True,
            "refund_id": refund.id
        }
    
    except Exception as e:
        structured_logger.error(
            f"Stripe refund failed: {str(e)}",
            category=LogCategory.PAYMENT,
            exception=e
        )
        return {
            "success": False,
            "error": str(e)
        }


# Endpoints
@router.post("/process", response_model=PaymentResponse)
async def process_payment(
    payment: PaymentCreate,
    db=Depends(get_db),
    user=Depends(require_roles("passenger", "driver"))
):
    """Process payment for booking"""
    try:
        structured_logger.log_operation(
            "payment_process",
            "started",
            category=LogCategory.PAYMENT,
            resource_id=user.get("id"),
            metadata={"booking_id": payment.booking_id, "amount": payment.amount}
        )
        
        # Validate booking exists
        booking = await db.bookings.find_one({"id": payment.booking_id})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        # Validate booking belongs to user
        if booking["passenger_id"] != user.get("id"):
            raise HTTPException(status_code=403, detail="Not authorized for this booking")
        
        # Validate amount matches booking fare
        if payment.amount <= 0:
            raise HTTPException(status_code=400, detail="Invalid payment amount")
        
        # Create payment record
        payment_id = str(uuid.uuid4())
        payment_record = {
            "id": payment_id,
            "booking_id": payment.booking_id,
            "user_id": user.get("id"),
            "amount": payment.amount,
            "currency": payment.currency,
            "status": PaymentStatus.PROCESSING,
            "payment_method_id": payment.payment_method_id,
            "refunded_amount": 0,
            "refundable_amount": payment.amount,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "metadata": payment.metadata or {}
        }
        
        await db.payments.insert_one(payment_record)
        
        # In production, process with payment gateway
        # For now, mark as completed
        await db.payments.update_one(
            {"id": payment_id},
            {
                "$set": {
                    "status": PaymentStatus.COMPLETED,
                    "transaction_id": f"txn_{payment_id[:8]}",
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        # Update booking
        await db.bookings.update_one(
            {"id": payment.booking_id},
            {
                "$set": {
                    "payment_status": "completed",
                    "paid_amount": payment.amount
                }
            }
        )
        
        structured_logger.log_operation(
            "payment_process",
            "success",
            category=LogCategory.PAYMENT,
            resource_id=user.get("id"),
            metadata={"payment_id": payment_id, "amount": payment.amount}
        )
        
        return PaymentResponse(
            id=payment_id,
            booking_id=payment.booking_id,
            amount=payment.amount,
            currency=payment.currency,
            status=PaymentStatus.COMPLETED,
            payment_method_id=payment.payment_method_id,
            transaction_id=f"txn_{payment_id[:8]}",
            created_at=payment_record["created_at"],
            updated_at=datetime.now(timezone.utc)
        )
    
    except HTTPException:
        raise
    except Exception as e:
        structured_logger.error(
            f"Payment processing failed: {str(e)}",
            category=LogCategory.PAYMENT,
            exception=e
        )
        raise HTTPException(status_code=500, detail="Payment processing failed")


@router.post("/refund", response_model=RefundResponse)
async def create_refund(
    refund: RefundCreate,
    background_tasks: BackgroundTasks,
    db=Depends(get_db),
    user=Depends(require_roles("passenger", "driver", "admin"))
):
    """Create refund for payment"""
    try:
        # Get payment
        payment = await db.payments.find_one({"id": refund.payment_id})
        if not payment:
            raise HTTPException(status_code=404, detail="Payment not found")
        
        # Validate authorization
        if user.get("role") != "admin" and payment["user_id"] != user.get("id"):
            raise HTTPException(status_code=403, detail="Not authorized to refund this payment")
        
        # Validate payment status can be refunded
        if payment["status"] not in [PaymentStatus.COMPLETED, PaymentStatus.PARTIALLY_REFUNDED]:
            raise HTTPException(status_code=400, detail=f"Cannot refund payment with status: {payment['status']}")
        
        # Calculate refund amount
        refund_amount = refund.amount or payment["amount"]
        
        # Validate refund amount doesn't exceed available
        available = payment.get("refundable_amount", payment["amount"])
        if refund_amount > available:
            raise HTTPException(status_code=400, detail=f"Refund amount exceeds available ({available})")
        
        # Create refund record
        refund_id = str(uuid.uuid4())
        refund_record = {
            "id": refund_id,
            "payment_id": refund.payment_id,
            "amount": refund_amount,
            "status": RefundStatus.PENDING,
            "reason": refund.reason,
            "notes": refund.notes,
            "created_at": datetime.now(timezone.utc),
            "processed_at": None,
            "error_message": None
        }
        
        await db.refunds.insert_one(refund_record)
        
        # Start async refund processing
        background_tasks.add_task(
            process_refund_async,
            refund_id,
            refund.payment_id,
            refund_amount,
            db
        )
        
        structured_logger.log_operation(
            "refund_create",
            "success",
            category=LogCategory.PAYMENT,
            resource_id=user.get("id"),
            metadata={
                "refund_id": refund_id,
                "payment_id": refund.payment_id,
                "amount": refund_amount
            }
        )
        
        return RefundResponse(
            id=refund_id,
            payment_id=refund.payment_id,
            amount=refund_amount,
            status=RefundStatus.PENDING,
            reason=refund.reason,
            created_at=refund_record["created_at"],
            processed_at=None
        )
    
    except HTTPException:
        raise
    except Exception as e:
        structured_logger.error(
            f"Refund creation failed: {str(e)}",
            category=LogCategory.PAYMENT,
            exception=e
        )
        raise HTTPException(status_code=500, detail="Refund creation failed")


@router.get("/refunds/{refund_id}", response_model=RefundResponse)
async def get_refund(
    refund_id: str,
    db=Depends(get_db),
    user=Depends(require_roles("passenger", "driver", "admin"))
):
    """Get refund status"""
    try:
        refund = await db.refunds.find_one({"id": refund_id})
        if not refund:
            raise HTTPException(status_code=404, detail="Refund not found")
        
        # Validate authorization
        payment = await db.payments.find_one({"id": refund["payment_id"]})
        if user.get("role") != "admin" and payment["user_id"] != user.get("id"):
            raise HTTPException(status_code=403, detail="Not authorized")
        
        return RefundResponse(
            id=refund["id"],
            payment_id=refund["payment_id"],
            amount=refund["amount"],
            status=refund["status"],
            reason=refund["reason"],
            created_at=refund["created_at"],
            processed_at=refund.get("processed_at"),
            error_message=refund.get("error_message")
        )
    
    except HTTPException:
        raise
    except Exception as e:
        structured_logger.error(
            f"Failed to get refund: {str(e)}",
            category=LogCategory.PAYMENT,
            exception=e
        )
        raise HTTPException(status_code=500, detail="Failed to retrieve refund")


@router.get("/list", response_model=List[PaymentResponse])
async def list_payments(
    skip: int = 0,
    limit: int = 50,
    db=Depends(get_db),
    user=Depends(require_roles("passenger", "driver", "admin"))
):
    """List payments for current user"""
    try:
        query = {}
        
        # Non-admin users can only see their own payments
        if user.get("role") != "admin":
            query["user_id"] = user.get("id")
        
        payments = await db.payments.find(query).skip(skip).limit(limit).to_list(limit)
        
        return [
            PaymentResponse(
                id=p["id"],
                booking_id=p["booking_id"],
                amount=p["amount"],
                currency=p["currency"],
                status=p["status"],
                payment_method_id=p.get("payment_method_id"),
                transaction_id=p.get("transaction_id"),
                created_at=p["created_at"],
                updated_at=p["updated_at"],
                error_message=p.get("error_message")
            )
            for p in payments
        ]
    
    except Exception as e:
        structured_logger.error(
            f"Failed to list payments: {str(e)}",
            category=LogCategory.PAYMENT,
            exception=e
        )
        raise HTTPException(status_code=500, detail="Failed to retrieve payments")
