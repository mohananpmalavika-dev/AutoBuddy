"""
Driver operations and availability management.
Phase 1 implementation for AutoBuddy.
"""

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from datetime import datetime
from app.utils.time_helpers import get_ist_now
from bson import ObjectId
import logging
import json

from app.utils.rbac import get_current_user_from_request

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/drivers", tags=["drivers"])

# Dependencies to be injected
db = None
io = None


def set_dependencies(database, socket_io):
    """Initialize dependencies"""
    global db, io
    db = database
    io = socket_io


class AvailabilityToggleRequest(BaseModel):
    available: bool


async def verify_driver_token(request: Request):
    """
    Extract and verify driver token from Authorization header.
    """
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
    except Exception as e:
        logger.error(f"Error verifying token: {str(e)}")
        raise HTTPException(status_code=401, detail="Token verification failed")


@router.post("/availability/toggle")
async def toggle_availability(req: AvailabilityToggleRequest, request: Request):
    """
    Toggle driver availability on/off.
    Available drivers appear in dispatch pool.
    """
    try:
        driver = await verify_driver_token(request)
        driver_id = driver['_id']
        
        # Update driver availability
        updated_driver = await db.drivers.find_one_and_update(
            {'_id': ObjectId(driver_id)},
            {
                '$set': {
                    'is_available': req.available,
                    'availability_updated_at': get_ist_now(),
                    'last_status_change': {
                        'status': 'available' if req.available else 'unavailable',
                        'timestamp': get_ist_now()
                    }
                }
            },
            return_document=True
        )
        
        # Broadcast availability change to admin dashboard
        io.emit('driver_status_changed', {
            'driver_id': str(driver_id),
            'driver_name': driver.get('name'),
            'is_available': req.available,
            'current_location': driver.get('current_location'),
            'updated_at': get_ist_now().isoformat()
        }, room='admin_dashboard')
        
        # Log availability change
        logger.info(
            f"Driver {driver_id} ({driver.get('name')}) "
            f"{'went online' if req.available else 'went offline'}"
        )
        
        status_text = "online" if req.available else "offline"
        
        return {
            'status': 'success',
            'message': f'Driver is now {status_text}',
            'driver_id': str(driver_id),
            'is_available': req.available,
            'updated_at': get_ist_now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling availability: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to toggle availability")


@router.get("/status")
async def get_driver_status(request: Request):
    """Get current driver status and availability."""
    try:
        driver = await verify_driver_token(request)
        driver_id = driver['_id']
        
        return {
            'driver_id': str(driver_id),
            'name': driver.get('name'),
            'is_available': driver.get('is_available', False),
            'current_location': driver.get('current_location'),
            'rating': driver.get('rating', 0),
            'total_rides': driver.get('total_rides', 0),
            'acceptance_rate': driver.get('acceptance_rate', 0),
            'availability_updated_at': driver.get('availability_updated_at'),
            'status_history': driver.get('last_status_change')
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting driver status: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get driver status")


@router.post("/location/update")
async def update_driver_location(request: Request):
    """
    Update driver's current location.
    Location is broadcast to passengers in real-time via Socket.IO.
    """
    try:
        driver = await verify_driver_token(request)
        driver_id = driver['_id']
        
        body = await request.json()
        latitude = body.get('latitude')
        longitude = body.get('longitude')
        
        if latitude is None or longitude is None:
            raise HTTPException(status_code=400, detail="Location coordinates required")
        
        # Update driver location
        await db.drivers.find_one_and_update(
            {'_id': ObjectId(driver_id)},
            {
                '$set': {
                    'current_location': {
                        'type': 'Point',
                        'coordinates': [longitude, latitude]
                    },
                    'location_updated_at': get_ist_now()
                }
            }
        )
        
        # Broadcast location to passengers in active rides with this driver
        active_bookings = await db.bookings.find({
            'accepted_driver_id': ObjectId(driver_id),
            'status': {'$in': ['accepted', 'in_progress']}
        }).to_list(None)
        
        for booking in active_bookings:
            passenger_id = str(booking.get('passenger_id', ''))
            
            # Emit location update to passenger
            io.emit('driver_location_update', {
                'driver_id': str(driver_id),
                'latitude': latitude,
                'longitude': longitude,
                'updated_at': get_ist_now().isoformat()
            }, room=f'passenger_{passenger_id}')
        
        return {
            'status': 'success',
            'message': 'Location updated',
            'driver_id': str(driver_id)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating location: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update location")


@router.get("/nearby-requests")
async def get_nearby_requests(request: Request):
    """
    Get ride requests near driver's current location.
    Used by driver app to show available rides.
    """
    try:
        driver = await verify_driver_token(request)
        driver_id = driver['_id']
        
        # Check if driver is available
        if not driver.get('is_available'):
            return {'requests': []}
        
        location = driver.get('current_location')
        if not location:
            return {'requests': []}
        
        # Find rides nearby (within 5km) that haven't been accepted
        nearby_rides = await db.ride_offers.find({
            'driver_id': ObjectId(driver_id),
            'status': 'pending',
            'expires_at': {'$gt': get_ist_now()}
        }).to_list(None)
        
        requests = []
        for ride_offer in nearby_rides:
            booking = await db.bookings.find_one({'_id': ride_offer['booking_id']})
            if booking:
                requests.append({
                    'booking_id': str(booking['_id']),
                    'passenger_name': booking.get('passenger_name'),
                    'pickup_location': booking.get('pickup_location'),
                    'dropoff_location': booking.get('dropoff_location'),
                    'estimated_fare': booking.get('estimated_fare'),
                    'ride_type': booking.get('ride_type'),
                    'expires_in_seconds': int(
                        (ride_offer['expires_at'] - get_ist_now()).total_seconds()
                    )
                })
        
        return {'requests': requests}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting nearby requests: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get nearby requests")


@router.post("/accept-request/{booking_id}")
async def accept_request(booking_id: str, request: Request):
    """
    Accept a ride request (shorthand for bookings router).
    """
    try:
        driver = await verify_driver_token(request)
        driver_id = driver['_id']
        
        # Verify booking exists and driver has an offer for it
        booking = await db.bookings.find_one({'_id': ObjectId(booking_id)})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        ride_offer = await db.ride_offers.find_one({
            'booking_id': ObjectId(booking_id),
            'driver_id': ObjectId(driver_id)
        })
        if not ride_offer:
            raise HTTPException(status_code=403, detail="No offer for this ride")
        
        # Check if offer has expired
        if ride_offer.get('expires_at') < get_ist_now():
            raise HTTPException(status_code=400, detail="Offer has expired")
        
        # Update booking status
        updated = await db.bookings.find_one_and_update(
            {'_id': ObjectId(booking_id)},
            {
                '$set': {
                    'status': 'accepted',
                    'accepted_driver_id': ObjectId(driver_id),
                    'accepted_at': get_ist_now(),
                    'driver_name': driver.get('name'),
                    'driver_phone': driver.get('phone'),
                    'driver_rating': driver.get('rating', 0)
                }
            },
            return_document=True
        )
        
        # Update ride offer
        await db.ride_offers.find_one_and_update(
            {'_id': ride_offer['_id']},
            {'$set': {'status': 'accepted', 'accepted_at': get_ist_now()}}
        )
        
        # Cancel other offers for this booking
        await db.ride_offers.update_many(
            {
                'booking_id': ObjectId(booking_id),
                'driver_id': {'$ne': ObjectId(driver_id)},
                'status': 'pending'
            },
            {'$set': {'status': 'canceled', 'canceled_at': get_ist_now()}}
        )
        
        # Notify passenger
        passenger_id = str(booking.get('passenger_id', ''))
        io.emit('ride_accepted', {
            'booking_id': booking_id,
            'driver_name': driver.get('name'),
            'driver_phone': driver.get('phone'),
            'driver_rating': driver.get('rating', 0),
            'driver_location': driver.get('current_location'),
            'eta_minutes': updated.get('estimated_time', 5),
            'accepted_at': get_ist_now().isoformat()
        }, room=f'passenger_{passenger_id}')
        
        # Log acceptance
        logger.info(f"Driver {driver_id} accepted booking {booking_id}")
        
        return {
            'status': 'success',
            'message': 'Ride accepted',
            'booking_id': booking_id,
            'driver_id': str(driver_id)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error accepting request: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to accept request")


@router.post("/decline-request/{booking_id}")
async def decline_request(booking_id: str, request: Request):
    """
    Decline a ride request.
    """
    try:
        driver = await verify_driver_token(request)
        driver_id = driver['_id']
        
        # Verify offer exists
        ride_offer = await db.ride_offers.find_one({
            'booking_id': ObjectId(booking_id),
            'driver_id': ObjectId(driver_id)
        })
        if not ride_offer:
            raise HTTPException(status_code=404, detail="No offer for this ride")
        
        # Update ride offer status
        await db.ride_offers.find_one_and_update(
            {'_id': ride_offer['_id']},
            {'$set': {'status': 'declined', 'declined_at': get_ist_now()}}
        )
        
        # Log decline
        logger.info(f"Driver {driver_id} declined booking {booking_id}")
        
        return {
            'status': 'success',
            'message': 'Ride declined',
            'booking_id': booking_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error declining request: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to decline request")


@router.get("/stats")
async def get_driver_stats(request: Request):
    """Get driver performance statistics."""
    try:
        driver = await verify_driver_token(request)
        driver_id = driver['_id']
        
        # Get completed rides
        completed_rides = await db.bookings.count_documents({
            'accepted_driver_id': ObjectId(driver_id),
            'status': 'completed'
        })
        
        # Get total earnings
        earnings_pipeline = [
            {
                '$match': {
                    'accepted_driver_id': ObjectId(driver_id),
                    'status': 'completed'
                }
            },
            {
                '$group': {
                    '_id': None,
                    'total_earnings': {'$sum': '$driver_earning'}
                }
            }
        ]
        earnings_result = await db.bookings.aggregate(earnings_pipeline).to_list(None)
        total_earnings = earnings_result[0]['total_earnings'] if earnings_result else 0
        
        return {
            'driver_id': str(driver_id),
            'name': driver.get('name'),
            'rating': driver.get('rating', 0),
            'total_rides': driver.get('total_rides', 0),
            'completed_rides': completed_rides,
            'acceptance_rate': driver.get('acceptance_rate', 0),
            'total_earnings': total_earnings,
            'is_available': driver.get('is_available', False)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting driver stats: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get driver stats")
