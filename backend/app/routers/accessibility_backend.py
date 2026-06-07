"""
Accessibility Features Backend Router
System for managing accessibility requirements and features
"""
from fastapi import APIRouter, HTTPException, Request, Query
from datetime import datetime, timezone
from bson import ObjectId
import logging
from typing import Optional, List

from app.utils.rbac import get_current_user_from_request

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/accessibility", tags=["accessibility"])

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

@router.get("/{user_id}/requirements")
async def get_accessibility_requirements(user_id: str, request: Request):
    """Get user's accessibility requirements"""
    try:
        current_user = await verify_user_token(request)
        
        # Users can only see their own requirements
        if current_user['user_id'] != user_id and current_user['user_type'] != 'admin':
            raise HTTPException(status_code=403, detail="Access denied")
        
        reqs = await db.accessibility_requirements.find_one({"user_id": user_id})
        
        if not reqs:
            return {
                "user_id": user_id,
                "mobility_aid": False,
                "wheelchair": False,
                "hearing_impaired": False,
                "vision_impaired": False,
                "service_animal": False,
                "extra_time_needed": False,
                "preferred_vehicle_features": [],
                "notes": ""
            }
        
        return {
            "user_id": reqs.get("user_id"),
            "mobility_aid": reqs.get("mobility_aid", False),
            "wheelchair": reqs.get("wheelchair", False),
            "hearing_impaired": reqs.get("hearing_impaired", False),
            "vision_impaired": reqs.get("vision_impaired", False),
            "service_animal": reqs.get("service_animal", False),
            "extra_time_needed": reqs.get("extra_time_needed", False),
            "preferred_vehicle_features": reqs.get("preferred_vehicle_features", []),
            "notes": reqs.get("notes", "")
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving requirements: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve requirements")

@router.put("/{user_id}/requirements")
async def update_accessibility_requirements(user_id: str, request: Request):
    """Update user's accessibility requirements"""
    try:
        current_user = await verify_user_token(request)
        
        # Users can only update their own requirements
        if current_user['user_id'] != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
        
        data = await request.json()
        
        requirements = {
            "user_id": user_id,
            "mobility_aid": data.get("mobility_aid", False),
            "wheelchair": data.get("wheelchair", False),
            "hearing_impaired": data.get("hearing_impaired", False),
            "vision_impaired": data.get("vision_impaired", False),
            "service_animal": data.get("service_animal", False),
            "extra_time_needed": data.get("extra_time_needed", False),
            "preferred_vehicle_features": data.get("preferred_vehicle_features", []),
            "notes": data.get("notes", ""),
            "updated_at": datetime.now(timezone.utc)
        }
        
        result = await db.accessibility_requirements.find_one_and_update(
            {"user_id": user_id},
            {"$set": requirements},
            upsert=True,
            return_document=True
        )
        
        logger.info(f"Accessibility requirements updated for user {user_id}")
        
        return {"message": "Requirements updated successfully", "requirements": requirements}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating requirements: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update requirements")

@router.get("/drivers/accessible-vehicles")
async def get_accessible_vehicles(request: Request):
    """Get list of drivers with accessible vehicles"""
    try:
        user = await verify_user_token(request)
        
        drivers = await db.drivers.find({
            "vehicle_features": {
                "$in": ["wheelchair_accessible", "mobility_aid_space", "service_animal_friendly"]
            }
        }).to_list(None)
        
        return {
            "accessible_drivers": len(drivers),
            "drivers": [
                {
                    "id": str(driver["_id"]),
                    "name": driver.get("name"),
                    "vehicle_type": driver.get("vehicle_type"),
                    "vehicle_features": driver.get("vehicle_features", []),
                    "rating": driver.get("rating", 0)
                }
                for driver in drivers
            ]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting accessible vehicles: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve accessible vehicles")

@router.post("/bookings/{booking_id}/accessibility-notes")
async def add_accessibility_notes(booking_id: str, request: Request):
    """Add accessibility notes to a booking"""
    try:
        user = await verify_user_token(request)
        data = await request.json()
        
        try:
            bid = ObjectId(booking_id)
        except:
            raise HTTPException(status_code=400, detail="Invalid booking ID")
        
        notes = data.get("notes", "")
        requirements = data.get("requirements", [])
        
        result = await db.bookings.find_one_and_update(
            {"_id": bid, "passenger_id": user['user_id']},
            {
                "$set": {
                    "accessibility_notes": notes,
                    "accessibility_requirements": requirements
                }
            },
            return_document=True
        )
        
        if not result:
            raise HTTPException(status_code=404, detail="Booking not found")
        
        # Notify driver
        if io and result.get("driver_id"):
            io.emit('accessibility_notification', {
                'booking_id': booking_id,
                'notes': notes,
                'requirements': requirements
            }, room=f'driver_{result.get("driver_id")}')
        
        logger.info(f"Accessibility notes added to booking {booking_id}")
        
        return {"message": "Accessibility notes added"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding notes: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to add accessibility notes")

@router.get("/settings/text-size")
async def get_text_size_setting(request: Request):
    """Get user's text size preference"""
    try:
        user = await verify_user_token(request)
        
        settings = await db.accessibility_settings.find_one({"user_id": user['user_id']})
        
        return {
            "user_id": user['user_id'],
            "text_size": settings.get("text_size", "normal") if settings else "normal",  # small, normal, large, extra_large
            "high_contrast": settings.get("high_contrast", False) if settings else False,
            "screen_reader_enabled": settings.get("screen_reader_enabled", False) if settings else False
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting text size: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve settings")

@router.put("/settings/text-size")
async def update_text_size_setting(request: Request):
    """Update user's text size preference"""
    try:
        user = await verify_user_token(request)
        data = await request.json()
        
        settings = {
            "user_id": user['user_id'],
            "text_size": data.get("text_size", "normal"),
            "high_contrast": data.get("high_contrast", False),
            "screen_reader_enabled": data.get("screen_reader_enabled", False),
            "updated_at": datetime.now(timezone.utc)
        }
        
        await db.accessibility_settings.find_one_and_update(
            {"user_id": user['user_id']},
            {"$set": settings},
            upsert=True
        )
        
        logger.info(f"Text size updated for user {user['user_id']}")
        
        return {"message": "Settings updated", "settings": settings}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating text size: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update settings")
