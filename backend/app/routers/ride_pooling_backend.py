"""
Ride Pooling Backend Router
System for grouping rides with shared routes and cost splitting
"""
from fastapi import APIRouter, HTTPException, Request, Query
from datetime import datetime, timezone
from bson import ObjectId
import logging
from typing import Optional, List
import math

from app.utils.rbac import get_current_user_from_request

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ride-pooling", tags=["ride_pooling"])

db = None
io = None

def set_dependencies(database, socket_io):
    global db, io
    db = database
    io = socket_io

async def verify_user_token(request: Request):
    try:
        user = await get_current_user_from_request(request, db_override=db)
        return {
            'user_id': str(user.get('id') or user.get('user_id') or ''),
            'mongo_id': str(user.get('_id') or ''),
            'user_type': str(user.get('role') or user.get('user_type') or '').lower(),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token verification failed: {str(e)}")
        raise HTTPException(status_code=401, detail="Unauthorized")

def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    return R * c

@router.post("")
async def create_pooled_ride(request: Request):
    """Create a pooled ride request"""
    try:
        user = await verify_user_token(request)
        if user['user_type'] != 'passenger':
            raise HTTPException(status_code=403, detail="Passenger access required")
        
        data = await request.json()
        pool = {
            "initiator_id": user['user_id'],
            "passengers": [user['user_id']],
            "pickup": data.get("pickup"),
            "dropoff": data.get("dropoff"),
            "requested_time": datetime.now(timezone.utc),
            "status": "searching",  # searching, matched, in_progress, completed
            "estimated_fare_per_passenger": data.get("estimated_fare", 100),
            "discount_percentage": data.get("discount_percentage", 20),
            "max_passengers": data.get("max_passengers", 4),
            "created_at": datetime.now(timezone.utc)
        }
        
        result = await db.pooled_rides.insert_one(pool)
        if io:
            io.emit('pool_created', {'pool_id': str(result.inserted_id)}, room='admin')
        
        logger.info(f"Pooled ride created: {result.inserted_id}")
        return {"id": str(result.inserted_id), "status": "searching"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating pooled ride: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create pooled ride")

@router.get("/available")
async def find_available_pools(request: Request, lat: float = Query(...), lon: float = Query(...), radius_km: float = Query(2, ge=0.5, le=10)):
    """Find available pooled rides near user location"""
    try:
        user = await verify_user_token(request)
        if user['user_type'] != 'passenger':
            raise HTTPException(status_code=403, detail="Passenger access required")
        
        pools = await db.pooled_rides.find({"status": "searching"}).to_list(None)
        
        nearby = []
        for pool in pools:
            if pool['initiator_id'] != user['user_id']:
                dist = haversine_distance(lat, lon, pool['pickup']['latitude'], pool['pickup']['longitude'])
                if dist <= radius_km and len(pool['passengers']) < pool['max_passengers']:
                    saved_amount = pool['estimated_fare_per_passenger'] * (pool['discount_percentage'] / 100)
                    nearby.append({
                        "id": str(pool["_id"]),
                        "pickup": pool["pickup"],
                        "dropoff": pool["dropoff"],
                        "distance_km": round(dist, 2),
                        "passengers_count": len(pool["passengers"]),
                        "max_passengers": pool["max_passengers"],
                        "fare_per_passenger": round(pool['estimated_fare_per_passenger'] * (1 - pool['discount_percentage']/100), 2),
                        "savings": round(saved_amount, 2)
                    })
        
        return {"pools": nearby}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error finding pools: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to find pools")

@router.post("/{pool_id}/join")
async def join_pooled_ride(pool_id: str, request: Request):
    """Join an existing pooled ride"""
    try:
        user = await verify_user_token(request)
        
        try:
            pid = ObjectId(pool_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid pool ID")
        
        pool = await db.pooled_rides.find_one({"_id": pid})
        if not pool:
            raise HTTPException(status_code=404, detail="Pool not found")
        
        if len(pool['passengers']) >= pool['max_passengers']:
            raise HTTPException(status_code=400, detail="Pool is full")
        
        if user['user_id'] in pool['passengers']:
            raise HTTPException(status_code=400, detail="Already joined this pool")
        
        result = await db.pooled_rides.find_one_and_update(
            {"_id": pid},
            {"$push": {"passengers": user['user_id']}},
            return_document=True
        )
        
        logger.info(f"User {user['user_id']} joined pool {pool_id}")
        return {"message": "Joined pool successfully", "total_passengers": len(result['passengers'])}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error joining pool: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to join pool")

@router.post("/{pool_id}/leave")
async def leave_pooled_ride(pool_id: str, request: Request):
    """Leave a pooled ride"""
    try:
        user = await verify_user_token(request)
        try:
            pid = ObjectId(pool_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid pool ID")
        
        pool = await db.pooled_rides.find_one({"_id": pid})
        if not pool or user['user_id'] not in pool['passengers']:
            raise HTTPException(status_code=404, detail="Not in this pool")
        
        result = await db.pooled_rides.find_one_and_update(
            {"_id": pid},
            {"$pull": {"passengers": user['user_id']}},
            return_document=True
        )
        
        if len(result['passengers']) < 2:
            await db.pooled_rides.delete_one({"_id": pid})
        
        logger.info(f"User {user['user_id']} left pool {pool_id}")
        return {"message": "Left pool successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error leaving pool: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to leave pool")

@router.get("/{pool_id}")
async def get_pool_details(pool_id: str, request: Request):
    """Get pool details and participants"""
    try:
        user = await verify_user_token(request)
        try:
            pid = ObjectId(pool_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid pool ID")
        
        pool = await db.pooled_rides.find_one({"_id": pid})
        if not pool:
            raise HTTPException(status_code=404, detail="Pool not found")
        
        return {
            "id": str(pool["_id"]),
            "pickup": pool["pickup"],
            "dropoff": pool["dropoff"],
            "passengers_count": len(pool["passengers"]),
            "max_passengers": pool["max_passengers"],
            "fare_per_passenger": round(pool['estimated_fare_per_passenger'] * (1 - pool['discount_percentage']/100), 2),
            "status": pool["status"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting pool details: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get pool details")
