"""
Intelligent Dispatch Algorithm - Match drivers to passengers
Based on proximity, rating, vehicle type, and availability
"""

from fastapi import APIRouter, HTTPException, Request
from bson import ObjectId
from datetime import datetime, timedelta
from app.utils.time_helpers import get_ist_now
from typing import List, Optional, Dict, Any
import logging
import math

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/dispatch", tags=["dispatch"])

# Dependencies (injected from main app)
db = None
io = None

def set_dependencies(database, socket_io):
    """Initialize dependencies"""
    global db, io
    db = database
    io = socket_io


def haversine_distance(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Calculate distance between two coordinates in kilometers"""
    lon1, lat1, lon2, lat2 = map(math.radians, [lon1, lat1, lon2, lat2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    r = 6371  # Earth radius in kilometers
    return c * r


def calculate_driver_score(
    driver: Dict[str, Any],
    passenger_latitude: float,
    passenger_longitude: float,
    required_vehicle_type: Optional[str] = None
) -> float:
    """
    Calculate match score for a driver (0-100)
    Factors: proximity (40%), rating (30%), acceptance rate (20%), vehicle match (10%)
    """
    score = 0
    
    # 1. Proximity score (0-40 points)
    distance = haversine_distance(
        driver.get('current_longitude', 0),
        driver.get('current_latitude', 0),
        passenger_longitude,
        passenger_latitude
    )
    
    # Closer = better (max 5 km for 40 points, degrade beyond)
    if distance <= 0.5:
        proximity_score = 40
    elif distance <= 2:
        proximity_score = 30
    elif distance <= 5:
        proximity_score = 20
    else:
        proximity_score = max(0, 10 - (distance / 2))
    score += proximity_score
    
    # 2. Rating score (0-30 points)
    rating = driver.get('rating', 4.0)
    rating_score = (rating / 5.0) * 30  # Normalize 5-star to 30 points
    score += rating_score
    
    # 3. Acceptance rate score (0-20 points)
    total_offers = driver.get('total_offers', 1)
    accepted_offers = driver.get('accepted_offers', 0)
    acceptance_rate = (accepted_offers / total_offers) if total_offers > 0 else 0
    acceptance_score = acceptance_rate * 20
    score += acceptance_score
    
    # 4. Vehicle type match (0-10 points)
    if required_vehicle_type:
        driver_vehicle = driver.get('vehicle_type', '').lower()
        if driver_vehicle == required_vehicle_type.lower():
            score += 10
        elif required_vehicle_type.lower() == 'any':
            score += 10
    else:
        score += 10
    
    # 5. Penalties
    # Reduce score if driver has been offline recently
    last_active = driver.get('last_location_update')
    if last_active:
        time_since_active = (get_ist_now() - last_active).total_seconds()
        if time_since_active > 300:  # Offline for > 5 minutes
            score *= 0.8  # 20% penalty
    
    # Reduce score if driver has many active rides
    active_rides = driver.get('active_ride_count', 0)
    if active_rides > 3:
        score *= (1 - (active_rides * 0.05))  # 5% penalty per active ride
    
    return min(100, max(0, score))  # Clamp between 0-100


async def find_best_drivers(
    booking: Dict[str, Any],
    max_drivers: int = 10,
    max_distance_km: float = 10.0
) -> List[Dict[str, Any]]:
    """
    Find best available drivers for a booking
    Returns sorted list by match score
    """
    try:
        pickup_latitude = booking.get('pickup_latitude')
        pickup_longitude = booking.get('pickup_longitude')
        vehicle_type = booking.get('vehicle_type_id', 'any')
        
        # Get all available drivers
        available_drivers = await db.drivers.find({
            'is_available': True,
            'is_active': True,
            'is_suspended': False,
            'current_latitude': {'$exists': True},
            'current_longitude': {'$exists': True}
        }).to_list(length=500)
        
        # Score and filter drivers
        scored_drivers = []
        for driver in available_drivers:
            distance = haversine_distance(
                driver.get('current_longitude', 0),
                driver.get('current_latitude', 0),
                pickup_longitude,
                pickup_latitude
            )
            
            # Skip drivers too far away
            if distance > max_distance_km:
                continue
            
            score = calculate_driver_score(
                driver,
                pickup_latitude,
                pickup_longitude,
                vehicle_type
            )
            
            scored_drivers.append({
                'driver_id': str(driver['_id']),
                'name': driver.get('name', 'Driver'),
                'phone': driver.get('phone'),
                'rating': driver.get('rating', 4.0),
                'vehicle_type': driver.get('vehicle_type'),
                'license_plate': driver.get('license_plate'),
                'distance_km': round(distance, 2),
                'eta_minutes': int(distance * 2.5),  # ~1.5 min per km
                'acceptance_rate': driver.get('accepted_offers', 0) / max(1, driver.get('total_offers', 1)),
                'score': score,
                'current_location': {
                    'latitude': driver.get('current_latitude'),
                    'longitude': driver.get('current_longitude')
                }
            })
        
        # Sort by score descending
        scored_drivers.sort(key=lambda x: x['score'], reverse=True)
        
        logger.info(f"Found {len(scored_drivers)} candidate drivers for booking. Top 3: {[d['score'] for d in scored_drivers[:3]]}")
        
        return scored_drivers[:max_drivers]
        
    except Exception as e:
        logger.error(f"Error finding best drivers: {str(e)}")
        raise


@router.post("/{booking_id}/match-drivers", tags=["dispatch"])
async def match_drivers_for_booking(booking_id: str, request: Request):
    """
    Dispatch: Find and send ride offers to best matching drivers
    Returns list of drivers in score order
    """
    try:
        # Get booking details
        booking = await db.bookings.find_one({'_id': ObjectId(booking_id)})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        # Get candidate drivers
        candidates = await find_best_drivers(booking, max_drivers=10)
        
        if not candidates:
            raise HTTPException(status_code=404, detail="No available drivers found in area")
        
        # Create ride offers for top 5 drivers
        ride_offers = []
        for i, driver in enumerate(candidates[:5]):
            offer = {
                'booking_id': ObjectId(booking_id),
                'driver_id': ObjectId(driver['driver_id']),
                'status': 'pending',
                'created_at': get_ist_now(),
                'expires_at': get_ist_now() + timedelta(minutes=2),
                'offer_sequence': i + 1,  # First offer gets highest priority
                'score': driver['score']
            }
            
            result = await db.ride_offers.insert_one(offer)
            ride_offers.append(str(result.inserted_id))
            
            # Send Socket.IO notification to driver
            io.emit('ride_offer', {
                'booking_id': booking_id,
                'offer_id': str(result.inserted_id),
                'passenger': {
                    'name': booking.get('passenger_name', 'Passenger'),
                    'phone': booking.get('passenger_phone'),
                    'rating': booking.get('passenger_rating', 5.0)
                },
                'pickup': {
                    'address': booking.get('pickup_address'),
                    'latitude': booking.get('pickup_latitude'),
                    'longitude': booking.get('pickup_longitude')
                },
                'dropoff': {
                    'address': booking.get('dropoff_address'),
                    'latitude': booking.get('dropoff_latitude'),
                    'longitude': booking.get('dropoff_longitude')
                },
                'estimated_fare': booking.get('estimated_fare'),
                'distance_km': booking.get('estimated_distance'),
                'eta_minutes': booking.get('estimated_duration_minutes'),
                'expires_in_seconds': 120,
                'offer_sequence': i + 1
            }, room=f'driver_{driver["driver_id"]}')
            
            logger.info(f"Sent ride offer to driver {driver['driver_id']} (score: {driver['score']})")
        
        # Update booking status
        await db.bookings.update_one(
            {'_id': ObjectId(booking_id)},
            {
                '$set': {
                    'status': 'offer_sent',
                    'offers_sent_at': get_ist_now(),
                    'total_offers_sent': len(ride_offers)
                }
            }
        )
        
        return {
            'status': 'success',
            'booking_id': booking_id,
            'offers_sent': len(ride_offers),
            'drivers': candidates[:5]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error matching drivers: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to match drivers")


@router.post("/{booking_id}/auto-assign", tags=["dispatch"])
async def auto_assign_driver(booking_id: str, request: Request):
    """
    Auto-assign the best available driver to a booking
    Used when passenger wants automatic matching
    """
    try:
        booking = await db.bookings.find_one({'_id': ObjectId(booking_id)})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        # Get best driver
        candidates = await find_best_drivers(booking, max_drivers=1)
        if not candidates:
            raise HTTPException(status_code=404, detail="No available drivers")
        
        best_driver = candidates[0]
        driver_id = best_driver['driver_id']
        
        # Directly assign driver
        updated_booking = await db.bookings.find_one_and_update(
            {'_id': ObjectId(booking_id)},
            {
                '$set': {
                    'status': 'accepted',
                    'driver_id': ObjectId(driver_id),
                    'assigned_at': get_ist_now(),
                    'auto_assigned': True
                }
            },
            return_document=True
        )
        
        # Notify passenger
        io.emit('driver_assigned', {
            'booking_id': booking_id,
            'driver': best_driver
        }, room=f'passenger_{booking["passenger_id"]}')
        
        # Notify driver
        io.emit('ride_assigned', {
            'booking_id': booking_id,
            'passenger_name': booking.get('passenger_name'),
            'pickup': booking.get('pickup_address'),
            'estimated_fare': booking.get('estimated_fare')
        }, room=f'driver_{driver_id}')
        
        logger.info(f"Auto-assigned driver {driver_id} to booking {booking_id}")
        
        return {
            'status': 'success',
            'booking_id': booking_id,
            'driver_id': driver_id,
            'driver': best_driver
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error auto-assigning driver: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to auto-assign driver")


@router.get("/{booking_id}/candidate-drivers", tags=["dispatch"])
async def get_candidate_drivers(booking_id: str, request: Request):
    """
    Get list of candidate drivers for a booking without sending offers
    Used for admin/operations to see dispatch options
    """
    try:
        booking = await db.bookings.find_one({'_id': ObjectId(booking_id)})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        candidates = await find_best_drivers(booking, max_drivers=20)
        
        return {
            'status': 'success',
            'booking_id': booking_id,
            'total_candidates': len(candidates),
            'candidates': candidates
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting candidate drivers: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get candidates")
