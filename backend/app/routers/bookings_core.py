"""
Booking core operations: accept, decline, start, complete rides.
Extracted from monolithic server.py for better maintainability.
"""

from fastapi import APIRouter, HTTPException, Request
from bson import ObjectId
from datetime import datetime, timedelta
from typing import Optional
import logging
import os

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/bookings", tags=["bookings"])

# These will be injected from main app
db = None
io = None

def set_dependencies(database, socket_io):
    """Initialize dependencies"""
    global db, io
    db = database
    io = socket_io


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
        passenger_id = str(booking['passenger_id'])
        await notify_user(
            user_id=passenger_id,
            message=f"Driver accepted your ride! They will arrive in {booking.get('estimated_time', 5)} min",
            type='ride_accepted',
            booking_id=booking_id
        )
        
        # Broadcast to passenger via Socket.IO
        io.emit('ride_accepted', {
            'booking_id': booking_id,
            'driver': {
                'id': str(driver_id),
                'name': driver_data.get('name', 'Driver'),
                'phone': mask_phone(driver_data.get('phone', '')),
                'rating': driver_data.get('rating', 5.0),
                'vehicle': driver_data.get('vehicle_type', 'standard'),
                'plate': driver_data.get('license_plate', '')
            },
            'eta_minutes': booking.get('estimated_time', 5)
        }, room=f'passenger_{passenger_id}')
        
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
        passenger_id = str(booking['passenger_id'])
        io.emit('ride_started', {
            'booking_id': booking_id,
            'message': 'Your ride has started!'
        }, room=f'passenger_{passenger_id}')
        
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
            ride_type=booking.get('ride_type', 'standard'),
            distance=actual_distance,
            duration=ride_duration,
            base_fare=booking.get('base_fare', 50),
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
        passenger_id = str(booking['passenger_id'])
        io.emit('ride_completed', {
            'booking_id': booking_id,
            'fare': fare,
            'receipt': receipt
        }, room=f'passenger_{passenger_id}')
        
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
    # This would call your actual token verification function
    # For now, assume it returns driver data
    try:
        # TODO: Use your actual token decoder
        driver_data = {'_id': ObjectId(), 'name': 'Driver', 'phone': '1234567890', 'rating': 5.0}
        return driver_data
    except:
        raise HTTPException(status_code=401, detail="Invalid token")


async def reassign_to_drivers(booking_id: str):
    """Find next set of available drivers and offer them the ride."""
    try:
        booking = await db.bookings.find_one({'_id': ObjectId(booking_id)})
        if not booking:
            return
        
        # Find nearby available drivers
        nearby_drivers = await db.drivers.find({
            'is_available': True,
            'current_ride': None,
            'verified_status': 'approved'
        }).to_list(5)
        
        for driver_info in nearby_drivers:
            driver_id = driver_info['_id']
            
            # Create offer
            offer = {
                'booking_id': ObjectId(booking_id),
                'driver_id': driver_id,
                'status': 'pending',
                'eta_minutes': 5,
                'created_at': datetime.utcnow(),
                'expires_at': datetime.utcnow() + timedelta(seconds=30)
            }
            await db.ride_offers.insert_one(offer)
            
            # Send offer to driver
            io.emit('new_ride_offer', {
                'booking_id': str(booking_id),
                'passenger': {
                    'name': booking.get('passenger_name', 'Passenger'),
                    'rating': booking.get('passenger_rating', 5.0)
                },
                'pickup': booking.get('pickup_location'),
                'destination': booking.get('destination'),
                'fare': booking.get('estimated_fare', 100),
                'eta': 5
            }, room=f'driver_{driver_id}')
    except Exception as e:
        logger.error(f"Error reassigning ride: {str(e)}")


def calculate_final_fare(ride_type, distance, duration, base_fare, surge_multiplier):
    """Calculate final fare based on actual distance and time."""
    # Base rates per km and minute
    rates = {
        'standard': {'per_km': 15, 'per_minute': 0.5},
        'premium': {'per_km': 25, 'per_minute': 0.75},
        'xl': {'per_km': 20, 'per_minute': 0.6}
    }
    
    rate = rates.get(ride_type, rates['standard'])
    
    distance_charge = distance * rate['per_km']
    time_charge = (duration / 60) * rate['per_minute']
    subtotal = base_fare + distance_charge + time_charge
    
    # Apply surge
    subtotal_with_surge = subtotal * surge_multiplier
    
    # Tax (5%)
    tax = subtotal_with_surge * 0.05
    
    # Discount (if any)
    discount = 0
    
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
        'date': booking['completed_at'].isoformat() if booking.get('completed_at') else '',
        'from': booking.get('pickup_location'),
        'to': booking.get('destination'),
        'distance': booking.get('actual_distance', 0),
        'duration': booking.get('actual_duration', 0),
        'fare_breakdown': fare,
        'payment_method': booking.get('payment_method'),
        'driver': {
            'name': booking.get('driver_name', 'Driver'),
            'vehicle': booking.get('vehicle_type', 'standard')
        }
    }


def format_booking(booking):
    """Format booking for response."""
    return {
        'id': str(booking['_id']),
        'status': booking['status'],
        'passenger_id': str(booking.get('passenger_id', '')),
        'driver_id': str(booking.get('accepted_driver_id', '')),
        'pickup': booking.get('pickup_location'),
        'destination': booking.get('destination'),
        'fare': booking.get('final_fare', booking.get('estimated_fare')),
        'created_at': booking['created_at'].isoformat() if booking.get('created_at') else None,
        'completed_at': booking['completed_at'].isoformat() if booking.get('completed_at') else None
    }


def mask_phone(phone: str) -> str:
    """Mask phone number for privacy."""
    if len(phone) < 4:
        return "****"
    return phone[-4:]


async def notify_user(user_id: str, message: str, type: str, booking_id: str = None):
    """Send notification to user."""
    try:
        notification = {
            'user_id': ObjectId(user_id),
            'message': message,
            'type': type,
            'booking_id': ObjectId(booking_id) if booking_id else None,
            'created_at': datetime.utcnow(),
            'read': False
        }
        await db.notifications.insert_one(notification)
    except Exception as e:
        logger.warning(f"Failed to create notification: {str(e)}")
