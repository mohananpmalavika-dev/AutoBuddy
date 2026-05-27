"""
Notifications endpoint for passengers
"""

from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import List, Any

from app.core.auth import get_current_passenger
from app.db.deps import get_db

router = APIRouter(prefix="/api/v1/passengers", tags=["passenger-notifications"])


@router.get("/notifications")
async def get_passenger_notifications(
    current_passenger: dict = Depends(get_current_passenger),
    db: AsyncIOMotorDatabase = Depends(get_db),
    unread_only: bool = Query(False),
    limit: int = Query(40, ge=1, le=100),
    skip: int = Query(0, ge=0)
) -> List[Any]:
    """
    Get notifications for the current passenger
    
    Query Parameters:
    - unread_only: If true, return only unread notifications
    - limit: Maximum number of notifications to return (default: 40, max: 100)
    - skip: Number of notifications to skip (default: 0)
    """
    try:
        query = {"user_id": current_passenger["id"]}
        
        if unread_only:
            query["read"] = False
        
        # Query MongoDB for notifications
        notifications = await db.notifications.find(query)\
            .sort("created_at", -1)\
            .skip(skip)\
            .limit(limit)\
            .to_list(length=limit)
        
        # Convert MongoDB ObjectId to string for serialization
        for notification in notifications:
            if "_id" in notification:
                notification["_id"] = str(notification["_id"])
        
        return notifications
    except Exception as e:
        return []
