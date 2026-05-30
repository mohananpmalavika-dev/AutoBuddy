"""
Stripe Payment Webhooks - Handle payment events and reconciliation
"""

from fastapi import APIRouter, HTTPException, Request, status
from bson import ObjectId
from datetime import datetime
import stripe
import logging
import hmac
import hashlib
import os
from typing import Dict, Any

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])

# Dependencies (injected from main app)
db = None
io = None

def set_dependencies(database, socket_io):
    """Initialize dependencies"""
    global db, io
    db = database
    io = socket_io


def verify_stripe_signature(payload: bytes, sig_header: str, endpoint_secret: str) -> bool:
    """Verify Stripe webhook signature"""
    try:
        stripe.Webhook.construct_event(payload, sig_header, endpoint_secret)
        return True
    except ValueError:
        logger.warning("Invalid payload")
        return False
    except stripe.error.SignatureVerificationError:
        logger.warning("Invalid signature")
        return False


@router.post("/stripe", tags=["webhooks"])
async def handle_stripe_webhook(request: Request):
    """
    Handle Stripe webhook events
    Manages payment_intent.succeeded, payment_intent.payment_failed, etc.
    """
    try:
        # Get webhook secret from environment
        endpoint_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
        
        # Get payload and signature
        payload = await request.body()
        sig_header = request.headers.get("stripe-signature", "")
        
        # Verify signature
        if not endpoint_secret:
            logger.warning("Stripe webhook secret not configured")
            return {"received": True, "warning": "webhook_secret_not_configured"}
        
        try:
            event = stripe.Webhook.construct_event(payload, sig_header, endpoint_secret)
        except ValueError as e:
            logger.error(f"Invalid payload: {str(e)}")
            raise HTTPException(status_code=400, detail="Invalid payload")
        except stripe.error.SignatureVerificationError as e:
            logger.error(f"Invalid signature: {str(e)}")
            raise HTTPException(status_code=400, detail="Invalid signature")
        
        # Handle different event types
        event_type = event['type']
        data = event['data']['object']
        
        logger.info(f"Received Stripe webhook event: {event_type}")
        
        if event_type == 'payment_intent.succeeded':
            await handle_payment_succeeded(data)
        
        elif event_type == 'payment_intent.payment_failed':
            await handle_payment_failed(data)
        
        elif event_type == 'charge.refunded':
            await handle_charge_refunded(data)
        
        elif event_type == 'customer.subscription.deleted':
            await handle_subscription_cancelled(data)
        
        return {"received": True}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error handling Stripe webhook: {str(e)}")
        raise HTTPException(status_code=500, detail="Webhook processing error")


async def handle_payment_succeeded(payment_intent: Dict[str, Any]):
    """Handle successful payment"""
    try:
        # Extract metadata
        metadata = payment_intent.get('metadata', {})
        booking_id = metadata.get('booking_id')
        passenger_id = metadata.get('passenger_id')
        amount = payment_intent.get('amount') / 100  # Convert cents to main currency
        
        if not booking_id:
            logger.warning(f"Payment succeeded but no booking_id in metadata")
            return
        
        # Update booking payment status
        updated_booking = await db.bookings.find_one_and_update(
            {'_id': ObjectId(booking_id)},
            {
                '$set': {
                    'payment_status': 'paid',
                    'payment_method': 'stripe',
                    'stripe_payment_intent_id': payment_intent.get('id'),
                    'amount_paid': amount,
                    'payment_completed_at': datetime.utcnow()
                }
            },
            return_document=True
        )
        
        if not updated_booking:
            logger.warning(f"Booking {booking_id} not found for payment success")
            return
        
        # Update passenger wallet if prepaid
        if passenger_id:
            await db.passengers.update_one(
                {'_id': ObjectId(passenger_id)},
                {
                    '$inc': {'wallet_balance': amount}
                }
            )
        
        # Notify passenger
        io.emit('payment_completed', {
            'booking_id': booking_id,
            'amount': amount,
            'status': 'success',
            'timestamp': datetime.utcnow().isoformat()
        }, room=f'passenger_{passenger_id}')
        
        logger.info(f"Payment succeeded for booking {booking_id}: ₹{amount}")
        
    except Exception as e:
        logger.error(f"Error handling payment success: {str(e)}")


async def handle_payment_failed(payment_intent: Dict[str, Any]):
    """Handle failed payment"""
    try:
        metadata = payment_intent.get('metadata', {})
        booking_id = metadata.get('booking_id')
        passenger_id = metadata.get('passenger_id')
        
        if not booking_id:
            logger.warning("Payment failed but no booking_id in metadata")
            return
        
        # Update booking payment status
        await db.bookings.update_one(
            {'_id': ObjectId(booking_id)},
            {
                '$set': {
                    'payment_status': 'failed',
                    'stripe_payment_intent_id': payment_intent.get('id'),
                    'payment_failed_reason': payment_intent.get('last_payment_error', {}).get('message'),
                    'payment_failed_at': datetime.utcnow()
                }
            }
        )
        
        # Notify passenger
        if passenger_id:
            io.emit('payment_failed', {
                'booking_id': booking_id,
                'reason': payment_intent.get('last_payment_error', {}).get('message', 'Payment declined'),
                'timestamp': datetime.utcnow().isoformat()
            }, room=f'passenger_{passenger_id}')
        
        logger.warning(f"Payment failed for booking {booking_id}: {payment_intent.get('last_payment_error', {}).get('message')}")
        
    except Exception as e:
        logger.error(f"Error handling payment failure: {str(e)}")


async def handle_charge_refunded(charge: Dict[str, Any]):
    """Handle refunded charge"""
    try:
        # Find booking by payment intent ID
        payment_intent_id = charge.get('payment_intent')
        amount_refunded = charge.get('amount_refunded') / 100  # Convert cents
        
        booking = await db.bookings.find_one(
            {'stripe_payment_intent_id': payment_intent_id}
        )
        
        if not booking:
            logger.warning(f"Refund for unknown payment intent: {payment_intent_id}")
            return
        
        booking_id = str(booking['_id'])
        passenger_id = str(booking.get('passenger_id', ''))
        
        # Update booking
        await db.bookings.update_one(
            {'_id': ObjectId(booking_id)},
            {
                '$set': {
                    'refund_status': 'refunded',
                    'amount_refunded': amount_refunded,
                    'refunded_at': datetime.utcnow()
                }
            }
        )
        
        # Update passenger wallet
        if passenger_id:
            await db.passengers.update_one(
                {'_id': ObjectId(passenger_id)},
                {
                    '$inc': {'wallet_balance': amount_refunded}
                }
            )
        
        # Notify passenger
        io.emit('refund_processed', {
            'booking_id': booking_id,
            'amount': amount_refunded,
            'timestamp': datetime.utcnow().isoformat()
        }, room=f'passenger_{passenger_id}')
        
        logger.info(f"Refund processed for booking {booking_id}: ₹{amount_refunded}")
        
    except Exception as e:
        logger.error(f"Error handling refund: {str(e)}")


async def handle_subscription_cancelled(subscription: Dict[str, Any]):
    """Handle subscription cancellation"""
    try:
        # Find driver by Stripe customer ID
        customer_id = subscription.get('customer')
        
        driver = await db.drivers.find_one(
            {'stripe_customer_id': customer_id}
        )
        
        if not driver:
            logger.warning(f"Subscription cancel for unknown customer: {customer_id}")
            return
        
        # Update driver subscription status
        await db.drivers.update_one(
            {'_id': driver['_id']},
            {
                '$set': {
                    'subscription_status': 'cancelled',
                    'subscription_cancelled_at': datetime.utcnow()
                }
            }
        )
        
        logger.info(f"Driver {driver['_id']} subscription cancelled")
        
    except Exception as e:
        logger.error(f"Error handling subscription cancellation: {str(e)}")


@router.post("/stripe/create-payment-intent", tags=["webhooks"])
async def create_stripe_payment_intent(request: Request):
    """
    Create a Stripe payment intent for a booking
    Called from frontend when passenger confirms payment
    """
    try:
        body = await request.json()
        booking_id = body.get('booking_id')
        amount = body.get('amount')  # In main currency (₹)
        passenger_id = body.get('passenger_id')
        
        if not booking_id or not amount:
            raise HTTPException(status_code=400, detail="Missing required fields")
        
        # Get booking
        booking = await db.bookings.find_one({'_id': ObjectId(booking_id)})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        # Create payment intent
        intent = stripe.PaymentIntent.create(
            amount=int(amount * 100),  # Convert to cents
            currency='inr',
            metadata={
                'booking_id': booking_id,
                'passenger_id': passenger_id,
                'booking_date': datetime.utcnow().isoformat()
            },
            description=f"Ride booking #{booking_id}"
        )
        
        # Store payment intent ID in booking
        await db.bookings.update_one(
            {'_id': ObjectId(booking_id)},
            {
                '$set': {
                    'stripe_payment_intent_id': intent.id,
                    'stripe_client_secret': intent.client_secret,
                    'payment_initiated_at': datetime.utcnow()
                }
            }
        )
        
        logger.info(f"Created payment intent {intent.id} for booking {booking_id}")
        
        return {
            'status': 'success',
            'client_secret': intent.client_secret,
            'payment_intent_id': intent.id,
            'amount': amount
        }
        
    except Exception as e:
        logger.error(f"Error creating payment intent: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create payment intent")


@router.post("/stripe/confirm-payment", tags=["webhooks"])
async def confirm_stripe_payment(request: Request):
    """
    Confirm a Stripe payment after 3D Secure or other verification
    """
    try:
        body = await request.json()
        payment_intent_id = body.get('payment_intent_id')
        
        if not payment_intent_id:
            raise HTTPException(status_code=400, detail="Missing payment_intent_id")
        
        # Get payment intent status
        intent = stripe.PaymentIntent.retrieve(payment_intent_id)
        
        if intent.status == 'succeeded':
            # Payment already succeeded, webhook should have handled it
            logger.info(f"Payment intent {payment_intent_id} already succeeded")
            return {
                'status': 'success',
                'message': 'Payment already processed'
            }
        
        elif intent.status == 'requires_action':
            # Need to get next action
            return {
                'status': 'requires_action',
                'client_secret': intent.client_secret
            }
        
        else:
            return {
                'status': intent.status,
                'client_secret': intent.client_secret
            }
        
    except Exception as e:
        logger.error(f"Error confirming payment: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to confirm payment")


@router.post("/stripe/refund", tags=["webhooks"])
async def refund_booking_payment(request: Request):
    """
    Manually refund a booking payment
    Called when driver cancels ride after passenger already paid
    """
    try:
        body = await request.json()
        booking_id = body.get('booking_id')
        reason = body.get('reason', 'Customer request')
        
        # Get booking
        booking = await db.bookings.find_one({'_id': ObjectId(booking_id)})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        payment_intent_id = booking.get('stripe_payment_intent_id')
        if not payment_intent_id:
            raise HTTPException(status_code=400, detail="No payment to refund")
        
        # Create refund
        refund = stripe.Refund.create(
            payment_intent=payment_intent_id,
            reason='requested_by_customer',
            metadata={'reason': reason, 'booking_id': booking_id}
        )
        
        logger.info(f"Refund created for booking {booking_id}: {refund.id}")
        
        return {
            'status': 'success',
            'refund_id': refund.id,
            'amount': refund.amount / 100
        }
        
    except Exception as e:
        logger.error(f"Error refunding payment: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to refund payment")
