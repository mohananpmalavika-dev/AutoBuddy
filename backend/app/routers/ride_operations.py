"""
Ride Status Transitions - Complete ride lifecycle management
PENDING → ACCEPTED → DRIVER_ARRIVING → ARRIVED → IN_PROGRESS → COMPLETED/CANCELLED
"""

from fastapi import APIRouter, HTTPException, Request
from bson import ObjectId
from datetime import datetime, timedelta
from app.utils.time_helpers import get_ist_now
from typing import Optional
import logging
import math

from app.utils.rbac import get_current_user_from_request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/rides", tags=["ride-operations"])

# Dependencies (injected from main app)
db = None
io = None

def set_dependencies(database, socket_io):
    """Initialize dependencies"""
    global db, io
    db = database
    io = socket_io


async def verify_driver_token(request: Request):
    """Verify driver JWT token"""
    try:
        user = await get_current_user_from_request(request, db_override=db, allowed_roles=["driver"])
        user_id = str(user.get("id") or user.get("user_id") or "").strip()
        driver = await db.drivers.find_one({"user_id": user_id})
        if not driver:
            raise HTTPException(status_code=401, detail="Driver not found")
        driver["_auth_user_id"] = user_id
        driver["id"] = driver.get("id") or user_id
        return driver
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Unauthorized")


def driver_identity_values(driver_data: dict) -> set:
    return {
        str(driver_data.get("_id") or ""),
        str(driver_data.get("user_id") or ""),
        str(driver_data.get("_auth_user_id") or ""),
        str(driver_data.get("id") or ""),
    } - {""}


def driver_user_identity(driver_data: dict) -> str:
    return str(
        driver_data.get("user_id")
        or driver_data.get("_auth_user_id")
        or driver_data.get("id")
        or driver_data.get("_id")
        or ""
    )


def driver_mongo_identity(driver_data: dict) -> str:
    return str(driver_data.get("_id") or "")


@router.post("/{booking_id}/start-ride", tags=["ride-operations"])
async def start_ride(booking_id: str, request: Request):
    """
    Driver starts the ride
    Changes status from ACCEPTED → IN_PROGRESS
    Starts collecting GPS coordinates for tracking
    """
    try:
        driver_data = await verify_driver_token(request)
        driver_id = driver_user_identity(driver_data)
        driver_mongo_id = driver_mongo_identity(driver_data)
        
        body = await request.json()
        latitude = body.get('latitude')
        longitude = body.get('longitude')
        
        # Get booking
        booking = await db.bookings.find_one({'_id': ObjectId(booking_id)})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        # Verify driver is assigned
        assigned_driver_id = str(booking.get('driver_id', ''))
        if assigned_driver_id not in driver_identity_values(driver_data):
            raise HTTPException(
                status_code=403,
                detail="Only assigned driver can start this ride"
            )
        
        # Verify ride is in ACCEPTED state
        if booking.get('status') not in ['accepted', 'driver_arriving']:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot start ride with status: {booking.get('status')}"
            )
        
        # Update booking status
        updated_booking = await db.bookings.find_one_and_update(
            {'_id': ObjectId(booking_id)},
            {
                '$set': {
                    'status': 'in_progress',
                    'ride_started_at': get_ist_now(),
                    'driver_latitude_at_start': latitude,
                    'driver_longitude_at_start': longitude
                }
            },
            return_document=True
        )
        
        # Initialize GPS tracking
        await db.ride_tracking.insert_one({
            'booking_id': ObjectId(booking_id),
            'driver_id': ObjectId(driver_mongo_id),
            'coordinates': [{
                'latitude': latitude,
                'longitude': longitude,
                'timestamp': get_ist_now(),
                'accuracy': body.get('accuracy')
            }],
            'distance_km': 0,
            'tracking_started_at': get_ist_now()
        })
        
        # Notify passenger
        passenger_id = str(booking['passenger_id'])
        io.emit('ride_started', {
            'booking_id': booking_id,
            'driver': {
                'id': driver_id,
                'latitude': latitude,
                'longitude': longitude,
                'name': driver_data.get('name')
            },
            'timestamp': get_ist_now().isoformat()
        }, room=f'passenger_{passenger_id}')
        
        logger.info(f"Ride {booking_id} started by driver {driver_id}")
        
        return {
            'status': 'success',
            'booking_id': booking_id,
            'ride_status': 'in_progress',
            'message': 'Ride started successfully'
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting ride: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to start ride")


@router.post("/{booking_id}/complete-ride", tags=["ride-operations"])
async def complete_ride(booking_id: str, request: Request):
    """
    Driver completes the ride
    Changes status: IN_PROGRESS → COMPLETED
    Calculates final fare and creates receipt
    """
    try:
        driver_data = await verify_driver_token(request)
        driver_id = driver_user_identity(driver_data)
        driver_mongo_id = driver_mongo_identity(driver_data)
        
        body = await request.json()
        latitude = body.get('latitude')
        longitude = body.get('longitude')
        
        # Get booking
        booking = await db.bookings.find_one({'_id': ObjectId(booking_id)})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        # Verify driver
        if str(booking.get('driver_id', '')) not in driver_identity_values(driver_data):
            raise HTTPException(status_code=403, detail="Only assigned driver can complete this ride")
        
        # Verify ride is in progress
        if booking.get('status') != 'in_progress':
            raise HTTPException(status_code=400, detail="Ride is not in progress")
        
        # Get tracking data
        tracking = await db.ride_tracking.find_one({'booking_id': ObjectId(booking_id)})
        
        # Calculate actual distance and duration
        ride_start = booking.get('ride_started_at', get_ist_now())
        ride_end = get_ist_now()
        ride_duration_seconds = (ride_end - ride_start).total_seconds()
        ride_duration_minutes = ride_duration_seconds / 60
        
        # Calculate actual distance from GPS tracking
        actual_distance_km = 0
        if tracking and tracking.get('coordinates'):
            coords = tracking['coordinates']
            for i in range(len(coords) - 1):
                lat1, lon1 = coords[i]['latitude'], coords[i]['longitude']
                lat2, lon2 = coords[i+1]['latitude'], coords[i+1]['longitude']
                
                # Haversine formula
                lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
                dlat = lat2 - lat1
                dlon = lon2 - lon1
                a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
                c = 2 * math.asin(math.sqrt(a))
                r = 6371  # Earth radius in km
                actual_distance_km += c * r
        
        # Recalculate fare based on actual distance and time
        base_fare = booking.get('base_fare', 50)
        distance_rate = booking.get('distance_rate', 10)  # per km
        time_rate = booking.get('time_rate', 2)  # per minute
        
        distance_charge = actual_distance_km * distance_rate
        time_charge = (ride_duration_minutes / 60) * time_rate  # Convert to hourly rate
        
        # Apply vehicle multiplier
        vehicle_multiplier = booking.get('vehicle_multiplier', 1.0)
        subtotal = (base_fare + distance_charge + time_charge) * vehicle_multiplier
        
        # Apply surge pricing if applicable
        surge_multiplier = booking.get('surge_multiplier', 1.0)
        subtotal_with_surge = subtotal * surge_multiplier
        
        # Calculate taxes (assuming 5%)
        tax_rate = 0.05
        taxes = subtotal_with_surge * tax_rate
        
        final_fare = subtotal_with_surge + taxes
        
        # Update booking with completion details
        updated_booking = await db.bookings.find_one_and_update(
            {'_id': ObjectId(booking_id)},
            {
                '$set': {
                    'status': 'completed',
                    'ride_completed_at': ride_end,
                    'ride_duration_seconds': int(ride_duration_seconds),
                    'ride_duration_minutes': round(ride_duration_minutes, 2),
                    'actual_distance_km': round(actual_distance_km, 2),
                    'final_fare': round(final_fare, 2),
                    'completion_location': {
                        'latitude': latitude,
                        'longitude': longitude
                    },
                    'fare_breakdown': {
                        'base_fare': base_fare,
                        'distance_charge': round(distance_charge, 2),
                        'time_charge': round(time_charge, 2),
                        'subtotal': round(subtotal, 2),
                        'vehicle_multiplier': vehicle_multiplier,
                        'surge_multiplier': surge_multiplier,
                        'subtotal_with_surge': round(subtotal_with_surge, 2),
                        'taxes': round(taxes, 2),
                        'final_total': round(final_fare, 2)
                    }
                }
            },
            return_document=True
        )
        
        # Create receipt
        receipt = {
            'booking_id': ObjectId(booking_id),
            'passenger_id': booking['passenger_id'],
            'driver_id': ObjectId(driver_mongo_id),
            'created_at': get_ist_now(),
            'pickup_address': booking.get('pickup_address'),
            'dropoff_address': booking.get('dropoff_address'),
            'ride_duration_minutes': round(ride_duration_minutes, 2),
            'distance_km': round(actual_distance_km, 2),
            'fare': round(final_fare, 2),
            'payment_method': booking.get('payment_method', 'wallet'),
            'payment_status': 'pending'
        }
        
        receipt_result = await db.receipts.insert_one(receipt)
        
        # Update driver earnings
        await db.drivers.update_one(
            {'_id': ObjectId(driver_mongo_id)},
            {
                '$inc': {
                    'total_earnings': final_fare,
                    'total_rides_completed': 1
                }
            }
        )
        
        # Notify passenger
        passenger_id = str(booking['passenger_id'])
        io.emit('ride_completed', {
            'booking_id': booking_id,
            'final_fare': final_fare,
            'distance_km': round(actual_distance_km, 2),
            'duration_minutes': round(ride_duration_minutes, 2),
            'receipt_id': str(receipt_result.inserted_id),
            'timestamp': ride_end.isoformat()
        }, room=f'passenger_{passenger_id}')
        
        logger.info(f"Ride {booking_id} completed. Fare: ₹{final_fare}, Distance: {actual_distance_km}km")
        
        return {
            'status': 'success',
            'booking_id': booking_id,
            'ride_status': 'completed',
            'final_fare': round(final_fare, 2),
            'distance_km': round(actual_distance_km, 2),
            'duration_minutes': round(ride_duration_minutes, 2),
            'receipt_id': str(receipt_result.inserted_id)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error completing ride: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to complete ride")


@router.post("/{booking_id}/cancel-ride", tags=["ride-operations"])
async def cancel_ride(booking_id: str, request: Request):
    """
    Cancel a ride
    Can be called by driver, passenger, or admin
    """
    try:
        current_user = await get_current_user_from_request(
            request,
            db_override=db,
            allowed_roles=["passenger", "driver", "admin"],
        )
        body = await request.json()
        reason = body.get('reason', 'User request')
        current_role = str(current_user.get("role") or current_user.get("user_type") or "").lower()
        current_user_id = str(current_user.get("id") or current_user.get("user_id") or "")
        cancelled_by = current_role or "user"
        
        # Get booking
        booking = await db.bookings.find_one({'_id': ObjectId(booking_id)})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")

        allowed_identity_values = {current_user_id, str(current_user.get("_id") or "")} - {""}
        if current_role == "driver":
            driver_profile = await db.drivers.find_one({"user_id": current_user_id})
            if driver_profile:
                allowed_identity_values.update(
                    {
                        str(driver_profile.get("_id") or ""),
                        str(driver_profile.get("user_id") or ""),
                    }
                )
        booking_identity_values = {
            str(booking.get("passenger_id") or ""),
            str(booking.get("driver_id") or ""),
        } - {""}
        if current_role != "admin" and not (allowed_identity_values & booking_identity_values):
            raise HTTPException(status_code=403, detail="Cannot cancel another user's ride")
        
        # Check if ride can be cancelled
        current_status = booking.get('status', '')
        cancellable_statuses = ['pending', 'accepted', 'driver_arriving']
        
        if current_status not in cancellable_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot cancel ride with status: {current_status}"
            )
        
        # Calculate cancellation fee if applicable
        cancellation_fee = 0
        if current_status in ['accepted', 'driver_arriving']:
            # Charge cancellation fee
            cancellation_fee = 50  # Fixed fee
        
        # Update booking
        updated_booking = await db.bookings.find_one_and_update(
            {'_id': ObjectId(booking_id)},
            {
                '$set': {
                    'status': 'cancelled',
                    'cancelled_at': get_ist_now(),
                    'cancelled_by': cancelled_by,
                    'cancellation_reason': reason,
                    'cancellation_fee': cancellation_fee
                }
            },
            return_document=True
        )
        
        # Notify both passenger and driver
        passenger_id = str(booking['passenger_id'])
        driver_id = str(booking.get('driver_id', ''))
        
        io.emit('ride_cancelled', {
            'booking_id': booking_id,
            'cancelled_by': cancelled_by,
            'reason': reason,
            'cancellation_fee': cancellation_fee
        }, room=f'passenger_{passenger_id}')
        
        if driver_id:
            io.emit('ride_cancelled', {
                'booking_id': booking_id,
                'cancelled_by': cancelled_by,
                'reason': reason
            }, room=f'driver_{driver_id}')
        
        logger.info(f"Ride {booking_id} cancelled by {cancelled_by}: {reason}")
        
        return {
            'status': 'success',
            'booking_id': booking_id,
            'ride_status': 'cancelled',
            'cancellation_fee': cancellation_fee
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling ride: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to cancel ride")


@router.post("/{booking_id}/update-location", tags=["ride-operations"])
async def update_ride_location(booking_id: str, request: Request):
    """
    Update driver location during ride (for tracking)
    Called frequently (every 5-10 seconds) during active ride
    """
    try:
        driver_data = await verify_driver_token(request)
        driver_id = driver_user_identity(driver_data)
        
        body = await request.json()
        latitude = body.get('latitude')
        longitude = body.get('longitude')
        accuracy = body.get('accuracy', 10)
        
        if not latitude or not longitude:
            raise HTTPException(status_code=400, detail="Missing coordinates")
        
        # Get booking
        booking = await db.bookings.find_one({'_id': ObjectId(booking_id)})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        # Verify driver
        if str(booking.get('driver_id', '')) not in driver_identity_values(driver_data):
            raise HTTPException(status_code=403, detail="Unauthorized")
        
        # Update tracking
        timestamp = get_ist_now()
        await db.ride_tracking.update_one(
            {'booking_id': ObjectId(booking_id)},
            {
                '$push': {
                    'coordinates': {
                        'latitude': latitude,
                        'longitude': longitude,
                        'timestamp': timestamp,
                        'accuracy': accuracy
                    }
                }
            },
            upsert=True
        )
        
        # Broadcast location to passenger
        passenger_id = str(booking['passenger_id'])
        io.emit('driver_location_updated', {
            'booking_id': booking_id,
            'driver': {
                'id': driver_id,
                'latitude': latitude,
                'longitude': longitude,
                'accuracy': accuracy
            },
            'timestamp': timestamp.isoformat()
        }, room=f'passenger_{passenger_id}')
        
        return {
            'status': 'success',
            'message': 'Location updated'
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating ride location: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update location")


@router.get("/{booking_id}/status", tags=["ride-operations"])
async def get_ride_status(booking_id: str):
    """Get current ride status"""
    try:
        booking = await db.bookings.find_one({'_id': ObjectId(booking_id)})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        return {
            'booking_id': booking_id,
            'status': booking.get('status'),
            'driver_id': str(booking.get('driver_id', '')),
            'passenger_id': str(booking.get('passenger_id', '')),
            'created_at': booking.get('created_at'),
            'updated_at': booking.get('updated_at'),
            'fare': booking.get('final_fare'),
            'distance_km': booking.get('actual_distance_km')
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting ride status: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get ride status")
