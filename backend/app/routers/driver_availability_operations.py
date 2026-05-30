"""
Driver Availability Management - Toggle online/offline status
"""

from fastapi import APIRouter, HTTPException, Request, Depends
from bson import ObjectId
from datetime import datetime
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/drivers", tags=["driver-availability"])

# Dependencies (injected from main app)
db = None
io = None

def set_dependencies(database, socket_io):
    """Initialize dependencies"""
    global db, io
    db = database
    io = socket_io


async def verify_driver_token(request: Request):
    """Verify driver JWT token and return driver data"""
    try:
        # Prefer JWT Authorization header and decode using shared helper
        from app.core.config import get_settings
        from app.utils.security import decode_token

        auth_header = request.headers.get("Authorization", "")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header.split("Bearer ")[1].strip()
            settings = get_settings()
            payload = decode_token(token, settings)
            driver_id = payload.get("sub")
            if not driver_id:
                raise HTTPException(status_code=401, detail="Invalid token payload")

            driver = await db.drivers.find_one({"_id": ObjectId(driver_id)})
            if not driver:
                raise HTTPException(status_code=401, detail="Driver not found")

            return driver

        # Fallback: legacy header-based driver id (keeps backward compatibility)
        driver_id = request.headers.get("X-Driver-ID")
        if driver_id:
            logger.warning("Using legacy X-Driver-ID header for authentication; migrate clients to JWT")
            driver = await db.drivers.find_one({"_id": ObjectId(driver_id)})
            if not driver:
                raise HTTPException(status_code=401, detail="Driver not found")
            return driver

        raise HTTPException(status_code=401, detail="Missing authorization header")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token verification failed: {str(e)}")
        raise HTTPException(status_code=401, detail="Unauthorized")


def _assert_driver_owns_resource(driver_data: dict, driver_id: str):
    if str(driver_data.get("_id")) != driver_id:
        raise HTTPException(status_code=403, detail="Cannot update another driver's availability")


@router.put("/availability", tags=["driver-availability"])
async def set_my_availability(request: Request):
    driver_data = await verify_driver_token(request)
    return await set_driver_availability(str(driver_data["_id"]), request)


@router.get("/availability", tags=["driver-availability"])
async def get_my_availability(request: Request):
    driver_data = await verify_driver_token(request)
    return await get_driver_availability(str(driver_data["_id"]), request)


@router.get("/status", tags=["driver-availability"])
async def get_driver_status(request: Request):
    driver_data = await verify_driver_token(request)
    driver_id = str(driver_data["_id"])

    return {
        'driver_id': driver_id,
        'name': driver_data.get('name'),
        'is_available': driver_data.get('is_available', False),
        'current_location': {
            'latitude': driver_data.get('current_latitude'),
            'longitude': driver_data.get('current_longitude')
        },
        'rating': driver_data.get('rating', 0),
        'total_rides': driver_data.get('total_rides', 0),
        'acceptance_rate': driver_data.get('acceptance_rate', 0),
        'availability_updated_at': driver_data.get('availability_updated_at'),
    }


@router.put("/{driver_id}/availability", tags=["driver-availability"])
async def set_driver_availability(driver_id: str, request: Request):
    """
    Set driver availability status (online/offline)
    
    Request body:
    {
        "is_available": true|false,
        "latitude": 13.0827,
        "longitude": 80.2707
    }
    """
    try:
        # Verify request is from authenticated driver
        driver_data = await verify_driver_token(request)
        _assert_driver_owns_resource(driver_data, driver_id)
        
        body = await request.json()
        is_available = body.get("is_available", False)
        latitude = body.get("latitude")
        longitude = body.get("longitude")
        
        # Update driver availability status
        update_data = {
            'is_available': is_available,
            'availability_updated_at': datetime.utcnow(),
        }
        
        if latitude is not None and longitude is not None:
            update_data['current_latitude'] = latitude
            update_data['current_longitude'] = longitude
            update_data['last_location_update'] = datetime.utcnow()
        
        if is_available:
            update_data['availability_started_at'] = datetime.utcnow()
        else:
            update_data['availability_ended_at'] = datetime.utcnow()
        
        updated_driver = await db.drivers.find_one_and_update(
            {'_id': ObjectId(driver_id)},
            {'$set': update_data},
            return_document=True
        )
        
        if not updated_driver:
            raise HTTPException(status_code=404, detail="Driver not found")
        
        # Notify admin of status change
        status = "ONLINE" if is_available else "OFFLINE"
        logger.info(f"Driver {driver_id} is now {status}")
        
        # Emit event via Socket.IO
        io.emit('driver_availability_changed', {
            'driver_id': driver_id,
            'is_available': is_available,
            'timestamp': datetime.utcnow().isoformat(),
            'location': {
                'latitude': latitude,
                'longitude': longitude
            } if latitude is not None and longitude is not None else None
        }, room='admin')
        
        return {
            'status': 'success',
            'driver_id': driver_id,
            'is_available': is_available,
            'message': f"Driver availability set to {status}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting driver availability: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update availability")


@router.get("/{driver_id}/availability", tags=["driver-availability"])
async def get_driver_availability(driver_id: str, request: Request):
    """Get current availability status of a driver"""
    try:
        driver_data = await verify_driver_token(request)
        _assert_driver_owns_resource(driver_data, driver_id)

        driver = await db.drivers.find_one({'_id': ObjectId(driver_id)})
        if not driver:
            raise HTTPException(status_code=404, detail="Driver not found")

        return {
            'driver_id': driver_id,
            'is_available': driver.get('is_available', False),
            'availability_updated_at': driver.get('availability_updated_at'),
            'current_location': {
                'latitude': driver.get('current_latitude'),
                'longitude': driver.get('current_longitude')
            },
            'availability_started_at': driver.get('availability_started_at'),
            'availability_ended_at': driver.get('availability_ended_at')
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting driver availability: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get availability")


@router.get("/available/list", tags=["driver-availability"])
async def get_available_drivers(
    latitude: float,
    longitude: float,
    radius_km: float = 5.0,
    limit: int = 10
):
    """
    Get list of available drivers within radius from given location
    Used for ride matching and admin monitoring
    """
    try:
        # Use geospatial query to find nearby available drivers
        drivers = await db.drivers.find({
            'is_available': True,
            'current_latitude': {'$exists': True},
            'current_longitude': {'$exists': True}
        }).to_list(length=100)
        
        # Calculate distance for each driver
        from math import radians, cos, sin, asin, sqrt
        
        def haversine(lon1, lat1, lon2, lat2):
            """Calculate distance between two points on earth (in km)"""
            lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])
            dlon = lon2 - lon1
            dlat = lat2 - lat1
            a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
            c = 2 * asin(sqrt(a))
            r = 6371  # Radius of earth in kilometers
            return c * r
        
        # Filter by radius and sort by distance
        nearby_drivers = []
        for driver in drivers:
            distance = haversine(
                driver.get('current_longitude', 0),
                driver.get('current_latitude', 0),
                longitude,
                latitude
            )
            if distance <= radius_km:
                nearby_drivers.append({
                    'driver_id': str(driver['_id']),
                    'name': driver.get('name', 'Driver'),
                    'phone': driver.get('phone'),
                    'rating': driver.get('rating', 5.0),
                    'vehicle_type': driver.get('vehicle_type'),
                    'distance_km': round(distance, 2),
                    'eta_minutes': int(distance * 2.5),  # Rough estimate
                    'current_location': {
                        'latitude': driver.get('current_latitude'),
                        'longitude': driver.get('current_longitude')
                    }
                })
        
        # Sort by distance
        nearby_drivers.sort(key=lambda x: x['distance_km'])
        
        return {
            'status': 'success',
            'total_available': len(nearby_drivers),
            'drivers': nearby_drivers[:limit],
            'search_location': {
                'latitude': latitude,
                'longitude': longitude
            },
            'search_radius_km': radius_km
        }
        
    except Exception as e:
        logger.error(f"Error getting available drivers: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get available drivers")


@router.post("/{driver_id}/shift-start", tags=["driver-availability"])
async def start_driver_shift(driver_id: str, request: Request):
    """
    Mark driver shift as started
    Sets availability to true and logs shift start time
    """
    try:
        driver_data = await verify_driver_token(request)
        _assert_driver_owns_resource(driver_data, driver_id)
        
        body = await request.json()
        latitude = body.get('latitude')
        longitude = body.get('longitude')
        
        shift_data = {
            'is_available': True,
            'shift_start_time': datetime.utcnow(),
            'shift_active': True,
            'current_latitude': latitude,
            'current_longitude': longitude,
            'last_location_update': datetime.utcnow()
        }
        
        updated_driver = await db.drivers.find_one_and_update(
            {'_id': ObjectId(driver_id)},
            {'$set': shift_data},
            return_document=True
        )
        
        logger.info(f"Driver {driver_id} started shift")
        
        return {
            'status': 'success',
            'driver_id': driver_id,
            'shift_started': True,
            'shift_start_time': shift_data['shift_start_time']
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error starting driver shift: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to start shift")


@router.post("/{driver_id}/shift-end", tags=["driver-availability"])
async def end_driver_shift(driver_id: str, request: Request):
    """
    Mark driver shift as ended
    Sets availability to false and logs shift end time
    """
    try:
        driver_data = await verify_driver_token(request)
        _assert_driver_owns_resource(driver_data, driver_id)
        
        body = await request.json()
        earnings_today = body.get('earnings_today', 0)
        rides_completed = body.get('rides_completed', 0)
        
        # Calculate shift duration
        driver = await db.drivers.find_one({'_id': ObjectId(driver_id)})
        shift_start = driver.get('shift_start_time')
        shift_end = datetime.utcnow()
        shift_duration_minutes = 0
        
        if shift_start:
            shift_duration_minutes = int((shift_end - shift_start).total_seconds() / 60)
        
        shift_data = {
            'is_available': False,
            'shift_active': False,
            'shift_end_time': shift_end,
            'shift_duration_minutes': shift_duration_minutes,
            'earnings_today': earnings_today,
            'rides_completed_today': rides_completed
        }
        
        updated_driver = await db.drivers.find_one_and_update(
            {'_id': ObjectId(driver_id)},
            {'$set': shift_data},
            return_document=True
        )
        
        logger.info(f"Driver {driver_id} ended shift. Duration: {shift_duration_minutes} min, Earnings: {earnings_today}")
        
        return {
            'status': 'success',
            'driver_id': driver_id,
            'shift_ended': True,
            'shift_end_time': shift_end,
            'shift_duration_minutes': shift_duration_minutes,
            'earnings': earnings_today,
            'rides_completed': rides_completed
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error ending driver shift: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to end shift")
