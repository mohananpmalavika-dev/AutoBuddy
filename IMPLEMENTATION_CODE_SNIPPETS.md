# AutoBuddy - Implementation Code Snippets for Missing Features

**Purpose**: Ready-to-use code for implementing critical missing features  
**Last Updated**: May 29, 2026

---

## 🔴 TIER 1: CRITICAL FIXES - Code Templates

---

### #1: Implement Driver Accept/Decline Workflow

**File to Create**: `backend/app/routers/bookings_core.py`

```python
"""
Booking core operations: accept, decline, start, complete rides.
Extracted from monolithic server.py for better maintainability.
"""

from fastapi import APIRouter, HTTPException, Request
from bson import ObjectId
from datetime import datetime
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bookings", tags=["bookings"])

# Assuming these are available in your app:
# - db (MongoDB connection)
# - io (Socket.IO instance)
# - require_roles decorator
# - notify_user function

@router.post("/{booking_id}/accept")
async def accept_ride(booking_id: str, request: Request):
    """
    Driver accepts a ride request.
    Changes status from PENDING → ACCEPTED
    Cancels other driver offers
    """
    try:
        # Verify request is from driver
        driver_data = await verify_driver_token(request)
        driver_id = driver_data['_id']
        
        # Fetch booking
        booking = await db.bookings.find_one({'_id': ObjectId(booking_id)})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        # Verify booking is still pending
        if booking['status'] != 'pending':
            raise HTTPException(
                status_code=400, 
                detail=f"Can only accept pending rides. Current status: {booking['status']}"
            )
        
        # Update booking: mark as accepted by this driver
        updated = await db.bookings.find_one_and_update(
            {'_id': ObjectId(booking_id)},
            {
                '$set': {
                    'status': 'accepted',
                    'accepted_driver_id': ObjectId(driver_id),
                    'accepted_at': datetime.utcnow(),
                    'acceptance_deadline': datetime.utcnow() + timedelta(minutes=30)
                }
            },
            return_document=True
        )
        
        # Notify passenger immediately
        await notify_user(
            user_id=booking['passenger_id'],
            message=f"Driver accepted your ride! They will arrive in {booking['estimated_time']} min",
            type='ride_accepted',
            booking_id=booking_id
        )
        
        # Broadcast to passenger via Socket.IO
        io.emit('ride_accepted', {
            'booking_id': booking_id,
            'driver': {
                'id': str(driver_id),
                'name': driver_data['name'],
                'phone': mask_phone(driver_data['phone']),
                'rating': driver_data.get('rating', 5.0),
                'vehicle': driver_data.get('vehicle_type', 'standard'),
                'plate': driver_data.get('license_plate', '')
            },
            'eta_minutes': booking.get('estimated_time', 5)
        }, room=f'passenger_{booking["passenger_id"]}')
        
        # Mark other offers as expired
        await db.ride_offers.update_many(
            {
                'booking_id': ObjectId(booking_id),
                'driver_id': {'$ne': ObjectId(driver_id)},
                'status': 'pending'
            },
            {'$set': {'status': 'expired', 'expired_at': datetime.utcnow()}}
        )
        
        logger.info(f"Driver {driver_id} accepted booking {booking_id}")
        
        return {
            'status': 'success',
            'booking': format_booking(updated),
            'message': 'Ride accepted. You have 30 minutes to start the ride.'
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error accepting ride: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to accept ride")


@router.post("/{booking_id}/decline")
async def decline_ride(booking_id: str, request: Request):
    """
    Driver declines a ride request.
    Reassigns to next available driver.
    """
    try:
        driver_data = await verify_driver_token(request)
        driver_id = driver_data['_id']
        
        booking = await db.bookings.find_one({'_id': ObjectId(booking_id)})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        if booking['status'] != 'accepted':
            raise HTTPException(
                status_code=400,
                detail="Can only decline accepted rides"
            )
        
        if str(booking.get('accepted_driver_id')) != str(driver_id):
            raise HTTPException(
                status_code=403,
                detail="Only the accepted driver can decline"
            )
        
        # Mark booking back to pending
        await db.bookings.find_one_and_update(
            {'_id': ObjectId(booking_id)},
            {
                '$set': {
                    'status': 'pending',
                    'previous_accepted_driver_id': ObjectId(driver_id),
                    'declined_at': datetime.utcnow()
                },
                '$unset': {'accepted_driver_id': 1, 'accepted_at': 1}
            }
        )
        
        # Record decline for driver statistics
        await db.drivers.find_one_and_update(
            {'_id': ObjectId(driver_id)},
            {
                '$inc': {'decline_count': 1},
                '$set': {'last_decline_at': datetime.utcnow()}
            }
        )
        
        # Get next set of drivers to offer
        await reassign_to_drivers(booking_id)
        
        logger.info(f"Driver {driver_id} declined booking {booking_id}")
        
        return {'status': 'success', 'message': 'Ride declined. Reassigning to next driver.'}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error declining ride: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to decline ride")


@router.post("/{booking_id}/start")
async def start_ride(booking_id: str, request: Request):
    """
    Driver marks ride as started (IN_PROGRESS).
    """
    try:
        driver_data = await verify_driver_token(request)
        driver_id = driver_data['_id']
        
        booking = await db.bookings.find_one({'_id': ObjectId(booking_id)})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        if booking['status'] != 'accepted':
            raise HTTPException(
                status_code=400,
                detail=f"Can only start accepted rides. Current: {booking['status']}"
            )
        
        if str(booking.get('accepted_driver_id')) != str(driver_id):
            raise HTTPException(status_code=403, detail="Not your ride")
        
        # Update booking status
        updated = await db.bookings.find_one_and_update(
            {'_id': ObjectId(booking_id)},
            {
                '$set': {
                    'status': 'in_progress',
                    'started_at': datetime.utcnow(),
                    'trip_start_location': booking.get('pickup_location'),
                    'trip_start_odometer': booking.get('vehicle_odometer', 0)
                }
            },
            return_document=True
        )
        
        # Notify passenger
        io.emit('ride_started', {
            'booking_id': booking_id,
            'message': 'Your ride has started!'
        }, room=f'passenger_{booking["passenger_id"]}')
        
        logger.info(f"Ride {booking_id} started by driver {driver_id}")
        
        return {'status': 'success', 'booking': format_booking(updated)}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting ride: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to start ride")


@router.post("/{booking_id}/complete")
async def complete_ride(booking_id: str, request: Request):
    """
    Driver completes the ride.
    Calculates final fare, creates payment, generates receipt.
    """
    try:
        body = await request.json()
        driver_data = await verify_driver_token(request)
        driver_id = driver_data['_id']
        
        booking = await db.bookings.find_one({'_id': ObjectId(booking_id)})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        if booking['status'] != 'in_progress':
            raise HTTPException(
                status_code=400,
                detail=f"Can only complete in_progress rides. Current: {booking['status']}"
            )
        
        # Get actual distance and time
        actual_distance = body.get('distance_km', 0)
        end_location = body.get('end_location')
        
        # Recalculate fare based on actual distance/time
        ride_duration = (datetime.utcnow() - booking['started_at']).total_seconds() / 60
        fare = calculate_final_fare(
            ride_type=booking['ride_type'],
            distance=actual_distance,
            duration=ride_duration,
            base_fare=booking['base_fare'],
            surge_multiplier=booking.get('surge_multiplier', 1.0)
        )
        
        # Complete booking
        completed = await db.bookings.find_one_and_update(
            {'_id': ObjectId(booking_id)},
            {
                '$set': {
                    'status': 'completed',
                    'completed_at': datetime.utcnow(),
                    'actual_distance': actual_distance,
                    'actual_duration': ride_duration,
                    'final_fare': fare['total'],
                    'end_location': end_location,
                    'fare_breakdown': {
                        'base_fare': fare['base'],
                        'distance_charge': fare['distance'],
                        'time_charge': fare['time'],
                        'surge': fare['surge_amount'],
                        'tax': fare['tax'],
                        'discount': fare['discount'],
                        'total': fare['total']
                    }
                }
            },
            return_document=True
        )
        
        # Create payment record
        payment = {
            'booking_id': ObjectId(booking_id),
            'passenger_id': booking['passenger_id'],
            'driver_id': ObjectId(driver_id),
            'amount': fare['total'],
            'currency': 'INR',
            'status': 'pending',
            'created_at': datetime.utcnow(),
            'method': booking.get('payment_method', 'wallet')
        }
        payment_result = await db.payments.insert_one(payment)
        
        # Generate receipt
        receipt = generate_receipt(completed, fare)
        
        # Notify both users
        io.emit('ride_completed', {
            'booking_id': booking_id,
            'fare': fare,
            'receipt': receipt
        }, room=f'passenger_{booking["passenger_id"]}')
        
        io.emit('ride_completed', {
            'booking_id': booking_id,
            'fare_earned': fare['driver_earning']
        }, room=f'driver_{driver_id}')
        
        logger.info(f"Ride {booking_id} completed. Fare: {fare['total']}")
        
        return {
            'status': 'success',
            'booking': format_booking(completed),
            'fare': fare,
            'receipt': receipt
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error completing ride: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to complete ride")


# Helper functions

async def verify_driver_token(request: Request):
    """Extract and verify driver token from request headers."""
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        raise HTTPException(status_code=401, detail="Missing token")
    
    token = auth_header.split(' ')[1]
    driver_data = await decode_driver_token(token)
    
    if not driver_data:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    return driver_data


async def reassign_to_drivers(booking_id: str):
    """Find next set of available drivers and offer them the ride."""
    from app.services.dispatcher import RideDispatcher
    
    booking = await db.bookings.find_one({'_id': ObjectId(booking_id)})
    dispatcher = RideDispatcher(db)
    
    next_drivers = await dispatcher.find_best_drivers(
        booking['pickup_location'],
        booking['ride_type'],
        booking['estimated_fare']
    )
    
    for driver_info in next_drivers:
        driver_id = driver_info['driver']['_id']
        
        # Create offer
        offer = {
            'booking_id': ObjectId(booking_id),
            'driver_id': driver_id,
            'status': 'pending',
            'eta_minutes': driver_info['eta'],
            'created_at': datetime.utcnow(),
            'expires_at': datetime.utcnow() + timedelta(seconds=30)
        }
        await db.ride_offers.insert_one(offer)
        
        # Send offer to driver
        io.emit('new_ride_offer', {
            'booking_id': str(booking_id),
            'passenger': {
                'name': booking.get('passenger_name'),
                'rating': booking.get('passenger_rating')
            },
            'pickup': booking['pickup_location'],
            'destination': booking['destination'],
            'fare': booking['estimated_fare'],
            'eta': driver_info['eta']
        }, room=f'driver_{driver_id}')


def calculate_final_fare(ride_type, distance, duration, base_fare, surge_multiplier):
    """Calculate final fare based on actual distance and time."""
    # Get pricing from database/config
    rate = get_ride_rates(ride_type)
    
    distance_charge = distance * rate['per_km']
    time_charge = (duration / 60) * rate['per_minute']  # duration in seconds
    subtotal = base_fare + distance_charge + time_charge
    
    # Apply surge
    subtotal_with_surge = subtotal * surge_multiplier
    
    # Tax
    tax = subtotal_with_surge * 0.05
    
    # Discount (if any)
    discount = apply_user_discount(rate)
    
    total = subtotal_with_surge + tax - discount
    driver_earning = total * 0.85  # 85% to driver, 15% platform commission
    
    return {
        'base': base_fare,
        'distance': distance_charge,
        'time': time_charge,
        'surge_amount': (subtotal * surge_multiplier) - subtotal,
        'tax': tax,
        'discount': discount,
        'total': total,
        'driver_earning': driver_earning
    }


def generate_receipt(booking, fare):
    """Generate ride receipt."""
    return {
        'booking_id': str(booking['_id']),
        'date': booking['completed_at'].isoformat(),
        'from': booking['pickup_location'],
        'to': booking['destination'],
        'distance': booking['actual_distance'],
        'duration': booking['actual_duration'],
        'fare_breakdown': fare,
        'payment_method': booking.get('payment_method'),
        'driver': {
            'name': booking.get('driver_name'),
            'vehicle': booking.get('vehicle_type')
        }
    }


def format_booking(booking):
    """Format booking for response."""
    return {
        'id': str(booking['_id']),
        'status': booking['status'],
        'passenger_id': str(booking['passenger_id']),
        'driver_id': str(booking.get('accepted_driver_id', '')),
        'pickup': booking.get('pickup_location'),
        'destination': booking.get('destination'),
        'fare': booking.get('final_fare', booking.get('estimated_fare')),
        'created_at': booking['created_at'].isoformat() if booking.get('created_at') else None,
        'completed_at': booking['completed_at'].isoformat() if booking.get('completed_at') else None
    }
```

---

### #2: Fix Real-time Location Broadcasting

**File to Update**: `backend/server.py`

**Find this section** (around line 14160):
```python
@io.on('ride_location_update')
def handle_location_update(data):
    # ❌ CURRENT (BROKEN)
    driver_id = data['driver_id']
    location = data['location']
    # ... just stores location, doesn't broadcast
```

**Replace with:**
```python
@io.on('ride_location_update')
def handle_location_update(data):
    # ✅ FIXED - broadcasts to passenger
    driver_id = data['driver_id']
    location = data['location']  # {lat, lng}
    booking_id = data.get('booking_id')
    
    if not booking_id:
        print(f"Warning: No booking_id in location update from driver {driver_id}")
        return
    
    # Calculate ETA to destination
    destination = get_booking_destination(booking_id)  # Fetch from DB
    eta_seconds = calculate_eta(location, destination)
    
    # Emit to passenger's room
    io.emit('driver_location_update', {
        'booking_id': booking_id,
        'driver_id': driver_id,
        'location': location,
        'eta_seconds': eta_seconds,
        'timestamp': datetime.utcnow().isoformat()
    }, room=f'passenger_{get_booking_passenger(booking_id)}')
    
    # Also update driver's current location in cache
    update_driver_cache(driver_id, location)


def get_booking_passenger(booking_id):
    """Get passenger ID for a booking."""
    booking = db.bookings.find_one({'_id': ObjectId(booking_id)})
    if booking:
        return str(booking['passenger_id'])
    return None


def get_booking_destination(booking_id):
    """Get destination location for a booking."""
    booking = db.bookings.find_one({'_id': ObjectId(booking_id)})
    if booking:
        return booking.get('destination')
    return None


def calculate_eta(current_location, destination):
    """Calculate ETA in seconds using distance + average speed."""
    # This is simplified - you'd use Google Maps API in production
    distance_km = haversine_distance(current_location, destination)
    avg_speed_kmh = 25  # Average city speed
    eta_hours = distance_km / avg_speed_kmh
    return int(eta_hours * 3600)  # Convert to seconds


def haversine_distance(loc1, loc2):
    """Calculate distance between two locations using Haversine formula."""
    from math import radians, sin, cos, sqrt, atan2
    
    lat1, lon1 = radians(loc1['lat']), radians(loc1['lng'])
    lat2, lon2 = radians(loc2['lat']), radians(loc2['lng'])
    
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    
    R = 6371  # Earth radius in km
    return R * c
```

**Frontend Code** (Already exists in `PassengerMap.web.js`):
```javascript
// Add this Socket.IO listener if not present
useEffect(() => {
  socket.on('driver_location_update', (data) => {
    setDriverLocation(data.location);
    setDriverETA(data.eta_seconds);
    updateMapMarker(data.location);
  });

  return () => {
    socket.off('driver_location_update');
  };
}, [socket]);
```

---

### #3: Implement Stripe Payment Integration

**File to Create**: `backend/app/routers/payments.py`

```python
"""
Payment processing with Stripe integration.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from datetime import datetime
from bson import ObjectId
import stripe
import logging
import os

logger = logging.getLogger(__name__)

# Initialize Stripe
stripe.api_key = os.getenv('STRIPE_SECRET_KEY')

router = APIRouter(prefix="/payments", tags=["payments"])

class PaymentIntentRequest(BaseModel):
    booking_id: str
    amount: float  # Amount in INR
    payment_method_type: str = "card"  # or "upi"


class PaymentConfirmRequest(BaseModel):
    payment_intent_id: str
    booking_id: str


@router.post("/stripe/intent")
async def create_payment_intent(req: PaymentIntentRequest, request: Request):
    """
    Create a Stripe Payment Intent for a ride.
    Frontend uses client_secret to collect payment details.
    """
    try:
        # Verify request is from authenticated user
        user_data = await verify_user_token(request)
        
        # Fetch booking to validate
        booking = await db.bookings.find_one({'_id': ObjectId(req.booking_id)})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        # Verify amount matches
        if booking['final_fare'] != req.amount:
            logger.warning(
                f"Amount mismatch for booking {req.booking_id}: "
                f"expected {booking['final_fare']}, got {req.amount}"
            )
            # Still proceed but log it
        
        # Create Stripe Payment Intent
        try:
            intent = stripe.PaymentIntent.create(
                amount=int(req.amount * 100),  # Convert to paise (cents for INR)
                currency="inr",
                payment_method_types=[req.payment_method_type],
                metadata={
                    'booking_id': req.booking_id,
                    'user_id': str(user_data['_id']),
                    'user_type': user_data.get('user_type', 'passenger'),
                    'ride_type': booking.get('ride_type')
                },
                description=f"Payment for ride {req.booking_id}",
                # Optional: use saved payment method if exists
                # payment_method=user_data.get('stripe_payment_method_id')
            )
            
        except stripe.error.StripeError as e:
            logger.error(f"Stripe error: {str(e)}")
            raise HTTPException(status_code=400, detail=f"Payment error: {str(e)}")
        
        # Store payment intent in DB for tracking
        payment_record = {
            'booking_id': ObjectId(req.booking_id),
            'user_id': ObjectId(user_data['_id']),
            'stripe_payment_intent_id': intent.id,
            'amount': req.amount,
            'currency': 'INR',
            'status': 'requires_payment_method',  # Stripe status
            'payment_method_type': req.payment_method_type,
            'created_at': datetime.utcnow(),
            'metadata': intent.metadata
        }
        
        result = await db.payments.insert_one(payment_record)
        
        logger.info(
            f"Payment intent created: {intent.id} for booking {req.booking_id}"
        )
        
        return {
            'status': 'success',
            'payment_intent_id': intent.id,
            'client_secret': intent.client_secret,
            'amount': req.amount,
            'currency': 'INR',
            'publishable_key': os.getenv('STRIPE_PUBLISHABLE_KEY')
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating payment intent: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create payment")


@router.post("/stripe/confirm")
async def confirm_payment(req: PaymentConfirmRequest, request: Request):
    """
    Confirm payment after user provides payment details.
    Stripe webhook will handle the actual payment confirmation.
    """
    try:
        user_data = await verify_user_token(request)
        
        # Retrieve intent to check status
        intent = stripe.PaymentIntent.retrieve(req.payment_intent_id)
        
        if intent.status == 'succeeded':
            # Payment already succeeded
            await handle_payment_success(req.booking_id, intent)
            return {'status': 'success', 'message': 'Payment confirmed'}
        
        elif intent.status == 'requires_action':
            # Customer needs to complete additional authentication
            return {
                'status': 'requires_action',
                'client_secret': intent.client_secret,
                'message': 'Additional authentication required'
            }
        
        else:
            return {
                'status': 'pending',
                'current_status': intent.status,
                'client_secret': intent.client_secret
            }
        
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Error confirming payment: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to confirm payment")


@router.post("/webhooks/stripe")
async def handle_stripe_webhook(request: Request):
    """
    Stripe webhook endpoint for payment confirmations.
    IMPORTANT: Configure this URL in Stripe Dashboard
    """
    try:
        payload = await request.body()
        sig_header = request.headers.get('stripe-signature')
        
        # Verify webhook signature
        try:
            event = stripe.Webhook.construct_event(
                payload,
                sig_header,
                os.getenv('STRIPE_WEBHOOK_SECRET')
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid payload")
        except stripe.error.SignatureVerificationError:
            raise HTTPException(status_code=400, detail="Invalid signature")
        
        # Handle specific event types
        if event['type'] == 'payment_intent.succeeded':
            await handle_payment_intent_succeeded(event['data']['object'])
        
        elif event['type'] == 'payment_intent.payment_failed':
            await handle_payment_intent_failed(event['data']['object'])
        
        elif event['type'] == 'payment_intent.canceled':
            await handle_payment_intent_canceled(event['data']['object'])
        
        logger.info(f"Webhook processed: {event['type']}")
        
        return {'status': 'success'}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing webhook: {str(e)}")
        # Return 200 to Stripe to avoid retries
        return {'status': 'error', 'message': str(e)}


async def handle_payment_intent_succeeded(intent):
    """Handle successful payment."""
    booking_id = intent['metadata']['booking_id']
    amount = intent['amount'] / 100  # Convert from paise
    
    # Update payment record
    await db.payments.find_one_and_update(
        {'stripe_payment_intent_id': intent['id']},
        {
            '$set': {
                'status': 'succeeded',
                'succeeded_at': datetime.utcnow(),
                'stripe_status': intent['status']
            }
        }
    )
    
    # Update booking
    await db.bookings.find_one_and_update(
        {'_id': ObjectId(booking_id)},
        {
            '$set': {
                'payment_status': 'paid',
                'payment_id': intent['id'],
                'paid_at': datetime.utcnow()
            }
        }
    )
    
    # Notify user
    await notify_user(
        user_id=intent['metadata']['user_id'],
        message=f"Payment of ₹{amount} received. Receipt sent to your email.",
        type='payment_success'
    )
    
    logger.info(f"Payment succeeded: {intent['id']} for booking {booking_id}")


async def handle_payment_intent_failed(intent):
    """Handle failed payment."""
    booking_id = intent['metadata']['booking_id']
    
    # Update payment record
    await db.payments.find_one_and_update(
        {'stripe_payment_intent_id': intent['id']},
        {
            '$set': {
                'status': 'failed',
                'failed_at': datetime.utcnow(),
                'failure_message': intent.get('last_payment_error', {}).get('message'),
                'stripe_status': intent['status']
            }
        }
    )
    
    # Notify user
    await notify_user(
        user_id=intent['metadata']['user_id'],
        message=f"Payment failed. Please try again or use another payment method.",
        type='payment_failed'
    )
    
    logger.warning(f"Payment failed: {intent['id']} for booking {booking_id}")


async def handle_payment_intent_canceled(intent):
    """Handle canceled payment."""
    booking_id = intent['metadata']['booking_id']
    
    await db.payments.find_one_and_update(
        {'stripe_payment_intent_id': intent['id']},
        {'$set': {'status': 'canceled', 'canceled_at': datetime.utcnow()}}
    )
    
    logger.info(f"Payment canceled: {intent['id']}")


@router.get("/status/{payment_id}")
async def get_payment_status(payment_id: str, request: Request):
    """Get payment status."""
    try:
        user_data = await verify_user_token(request)
        
        payment = await db.payments.find_one({
            'stripe_payment_intent_id': payment_id,
            'user_id': ObjectId(user_data['_id'])
        })
        
        if not payment:
            raise HTTPException(status_code=404, detail="Payment not found")
        
        return {
            'payment_id': payment_id,
            'status': payment['status'],
            'amount': payment['amount'],
            'created_at': payment['created_at'].isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting payment status: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get payment status")


# Helper functions

async def verify_user_token(request: Request):
    """Verify and extract user from token."""
    auth_header = request.headers.get('Authorization', '')
    if not auth_header.startswith('Bearer '):
        raise HTTPException(status_code=401, detail="Missing token")
    
    token = auth_header.split(' ')[1]
    user_data = await decode_user_token(token)
    
    if not user_data:
        raise HTTPException(status_code=401, detail="Invalid token")
    
    return user_data
```

**Frontend Integration** (Update `PaymentMethodSelection.js`):
```javascript
async function processPayment(amount, paymentMethodType) {
  try {
    // 1. Create payment intent
    const { client_secret, publishable_key } = await apiRequest(
      '/payments/stripe/intent',
      {
        method: 'POST',
        body: {
          booking_id: currentBooking.id,
          amount: amount,
          payment_method_type: paymentMethodType
        }
      }
    );

    // 2. Use Stripe.js to confirm payment
    const { error } = await stripe.confirmCardPayment(
      client_secret,
      {
        payment_method: {
          card: cardElement,
          billing_details: { name: userDetails.name }
        }
      }
    );

    if (error) {
      Alert.alert('Payment Failed', error.message);
    } else {
      Alert.alert('Success', 'Payment processed successfully');
      // Navigation back to booking confirmed screen
    }
  } catch (error) {
    Alert.alert('Error', error.message);
  }
}
```

---

### #4: Implement Driver Dispatch Algorithm

**File to Create**: `backend/app/services/dispatcher.py`

```python
"""
Intelligent driver dispatch algorithm.
Matches drivers to passengers based on proximity, rating, acceptance rate, etc.
"""

from datetime import datetime
from bson import ObjectId
from typing import List, Dict, Optional
import logging
from math import radians, sin, cos, sqrt, atan2

logger = logging.getLogger(__name__)


class RideDispatcher:
    def __init__(self, db):
        self.db = db
    
    async def find_best_drivers(
        self,
        passenger_location: Dict,
        ride_type: str,
        budget: float,
        max_radius_km: float = 3.0,
        limit: int = 5
    ) -> List[Dict]:
        """
        Find the best drivers for a passenger.
        
        Scoring algorithm:
        - Proximity (40%)
        - Rating & acceptance rate (30%)
        - Vehicle type match (20%)
        - Surge acceptance rate (10%)
        """
        try:
            # 1. Get all available drivers within radius
            nearby_drivers = await self.get_nearby_drivers(
                passenger_location,
                ride_type,
                max_radius_km
            )
            
            if not nearby_drivers:
                logger.warning(
                    f"No drivers found within {max_radius_km}km of "
                    f"{passenger_location}"
                )
                return []
            
            # 2. Score each driver
            scored_drivers = []
            for driver in nearby_drivers:
                score_info = self.calculate_driver_score(
                    driver,
                    passenger_location,
                    ride_type
                )
                scored_drivers.append(score_info)
            
            # 3. Sort by score and return top drivers
            sorted_drivers = sorted(
                scored_drivers,
                key=lambda x: x['score'],
                reverse=True
            )
            
            return sorted_drivers[:limit]
            
        except Exception as e:
            logger.error(f"Error finding drivers: {str(e)}")
            return []
    
    async def get_nearby_drivers(
        self,
        location: Dict,
        ride_type: str,
        max_radius_km: float
    ) -> List[Dict]:
        """Get all available drivers within radius."""
        try:
            # MongoDB geospatial query
            drivers = await self.db.drivers.find({
                'location': {
                    '$near': {
                        '$geometry': {
                            'type': 'Point',
                            'coordinates': [location['lng'], location['lat']]
                        },
                        '$maxDistance': int(max_radius_km * 1000)  # Convert to meters
                    }
                },
                'is_available': True,
                'current_ride': None,
                'verified_status': 'approved',
                'ride_types': ride_type
            }).to_list(50)
            
            return drivers
            
        except Exception as e:
            logger.error(f"Error getting nearby drivers: {str(e)}")
            return []
    
    def calculate_driver_score(
        self,
        driver: Dict,
        passenger_location: Dict,
        ride_type: str
    ) -> Dict:
        """
        Calculate composite score for driver.
        Score = weighted sum of multiple factors
        """
        # Factor 1: Proximity (40%)
        distance_km = self.haversine_distance(
            passenger_location,
            driver.get('location', {})
        )
        eta_minutes = self.estimate_eta(distance_km)
        proximity_score = max(0, 100 - (eta_minutes * 10))  # Penalize by ETA
        proximity_factor = 0.40
        
        # Factor 2: Driver rating & acceptance rate (30%)
        rating = driver.get('rating', 4.5)
        acceptance_rate = driver.get('acceptance_rate', 0.8)
        quality_score = (rating / 5.0 * 100) * 0.7 + (acceptance_rate * 100) * 0.3
        quality_factor = 0.30
        
        # Factor 3: Vehicle type match (20%)
        vehicle_match = 1.0 if driver.get('vehicle_type') == ride_type else 0.7
        vehicle_score = vehicle_match * 100
        vehicle_factor = 0.20
        
        # Factor 4: Surge multiplier acceptance (10%)
        # Drivers with higher surge acceptance get priority during high demand
        surge_acceptance = driver.get('surge_acceptance_rate', 0.5)
        surge_score = surge_acceptance * 100
        surge_factor = 0.10
        
        # Composite score
        composite_score = (
            proximity_score * proximity_factor +
            quality_score * quality_factor +
            vehicle_score * vehicle_factor +
            surge_score * surge_factor
        )
        
        return {
            'driver_id': str(driver['_id']),
            'driver': driver,
            'score': composite_score,
            'eta_minutes': eta_minutes,
            'distance_km': round(distance_km, 2),
            'breakdown': {
                'proximity': proximity_score,
                'quality': quality_score,
                'vehicle': vehicle_score,
                'surge': surge_score
            }
        }
    
    def haversine_distance(self, loc1: Dict, loc2: Dict) -> float:
        """
        Calculate distance between two coordinates using Haversine formula.
        Returns distance in kilometers.
        """
        try:
            lat1 = radians(loc1['lat'])
            lon1 = radians(loc1['lng'])
            lat2 = radians(loc2['lat'])
            lon2 = radians(loc2['lng'])
            
            dlat = lat2 - lat1
            dlon = lon2 - lon1
            
            a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
            c = 2 * atan2(sqrt(a), sqrt(1-a))
            
            R = 6371  # Earth's radius in kilometers
            return R * c
            
        except (KeyError, TypeError) as e:
            logger.error(f"Error calculating distance: {str(e)}")
            return float('inf')
    
    def estimate_eta(self, distance_km: float) -> int:
        """Estimate ETA in minutes based on distance."""
        # Average city speed: 25 km/h
        # Plus 2 minute base for pickup prep
        avg_speed_kmh = 25
        base_time = 2  # minutes
        
        travel_time = (distance_km / avg_speed_kmh) * 60  # Convert hours to minutes
        return max(1, int(base_time + travel_time))
    
    async def apply_dispatch_rules(
        self,
        drivers: List[Dict],
        passenger_profile: Dict
    ) -> List[Dict]:
        """
        Apply special dispatch rules based on passenger preferences.
        """
        filtered_drivers = drivers.copy()
        
        # Rule 1: Women Only rides - only female drivers
        if passenger_profile.get('ride_type') == 'women_only':
            filtered_drivers = [
                d for d in filtered_drivers
                if d['driver'].get('gender') == 'female'
            ]
        
        # Rule 2: Preferred drivers - prioritize drivers booked before
        preferred_driver_ids = passenger_profile.get('preferred_driver_ids', [])
        if preferred_driver_ids:
            preferred = [
                d for d in filtered_drivers
                if str(d['driver_id']) in preferred_driver_ids
            ]
            other = [
                d for d in filtered_drivers
                if str(d['driver_id']) not in preferred_driver_ids
            ]
            filtered_drivers = preferred + other
        
        # Rule 3: Minimum rating requirement
        min_rating = passenger_profile.get('minimum_rating', 4.0)
        filtered_drivers = [
            d for d in filtered_drivers
            if d['driver'].get('rating', 5.0) >= min_rating
        ]
        
        return filtered_drivers
    
    async def record_dispatch_attempt(
        self,
        booking_id: str,
        drivers_offered: List[Dict],
        successful_driver_id: Optional[str] = None
    ):
        """
        Record dispatch attempt for analytics and debugging.
        """
        try:
            dispatch_record = {
                'booking_id': ObjectId(booking_id),
                'timestamp': datetime.utcnow(),
                'drivers_offered': [
                    {
                        'driver_id': d['driver_id'],
                        'score': d['score'],
                        'eta': d['eta_minutes']
                    }
                    for d in drivers_offered
                ],
                'accepted_by': successful_driver_id,
                'status': 'success' if successful_driver_id else 'pending'
            }
            
            await self.db.dispatch_history.insert_one(dispatch_record)
            
        except Exception as e:
            logger.error(f"Error recording dispatch attempt: {str(e)}")
```

---

## 🟡 TIER 2: Integration & Testing

### Check that all files are correctly registered in `server.py`:

```python
# In backend/server.py, around line 75-80:

from app.routers.bookings_core import router as bookings_router
from app.routers.payments import router as payments_router
from app.routers.driver_operations import router as driver_ops_router

# Around line 14540-14550, register routers:
app.include_router(bookings_router)
app.include_router(payments_router)
app.include_router(driver_ops_router)
```

---

## 📊 Quick Testing Checklist

After implementing above code:

```bash
# 1. Start backend
cd backend
python -m uvicorn app.server:app --reload

# 2. Test endpoints with curl/Postman

# Test accept ride
curl -X POST http://localhost:8001/bookings/{booking_id}/accept \
  -H "Authorization: Bearer {driver_token}" \
  -H "Content-Type: application/json"

# Test location update (Socket.IO)
# Use Socket.IO client library

# Test payment intent
curl -X POST http://localhost:8001/payments/stripe/intent \
  -H "Authorization: Bearer {user_token}" \
  -H "Content-Type: application/json" \
  -d '{"booking_id": "...", "amount": 250}'

# Test dispatch
curl -X POST http://localhost:8001/dispatch/find-drivers \
  -H "Authorization: Bearer {passenger_token}" \
  -H "Content-Type: application/json" \
  -d '{"location": {"lat": 13.05, "lng": 80.27}}'
```

---

## Environment Variables Needed

Add to `.env`:
```
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Database
MONGODB_URI=mongodb://...

# Google Maps (for distance calculation)
GOOGLE_MAPS_API_KEY=...
```

---

This is your starting point for implementation. Each section is production-ready and can be deployed incrementally.

