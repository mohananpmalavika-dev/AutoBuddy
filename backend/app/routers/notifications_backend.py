"""
Notifications Backend Router
Complete CRUD operations for notifications with preferences and filtering
"""
from fastapi import APIRouter, HTTPException, Request, Query
from datetime import datetime, timezone
from bson import ObjectId
from bson.errors import InvalidId
import logging
from typing import Optional, List, Literal

logger = logging.getLogger(__name__)


def notification_owner_query(user_id: str, notification_id: str) -> dict:
    normalized_id = str(notification_id or "").strip()
    clauses = [
        {"user_id": user_id, "id": normalized_id},
        {"user_id": user_id, "notification_id": normalized_id},
    ]
    try:
        clauses.append({"user_id": user_id, "_id": ObjectId(normalized_id)})
    except InvalidId:
        pass
    return {"$or": clauses}

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

# Global dependencies
db = None
io = None


def set_dependencies(database, socket_io):
    """Initialize dependencies"""
    global db, io
    db = database
    io = socket_io


async def verify_user_token(request: Request):
    """Extract and verify user token from Authorization header"""
    try:
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer '):
            raise HTTPException(status_code=401, detail="Invalid token format")
        
        token = auth_header.replace('Bearer ', '')
        
        # In production, verify JWT token
        # For now, simple lookup
        user = await db.users.find_one({'auth_token': token})
        if not user:
            raise HTTPException(status_code=401, detail="Invalid user token")
        
        return str(user.get('_id'))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token verification failed: {str(e)}")
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.post("")
async def create_notification(request: Request):
    """Create a new notification"""
    try:
        user_id = await verify_user_token(request)
        data = await request.json()
        
        notification = {
            "user_id": user_id,
            "type": data.get("type", "general"),  # booking, payment, message, support, safety, promo
            "title": data.get("title", ""),
            "message": data.get("message", ""),
            "read": False,
            "booking_id": data.get("booking_id"),
            "driver_id": data.get("driver_id"),
            "passenger_id": data.get("passenger_id"),
            "action_url": data.get("action_url"),
            "priority": data.get("priority", "normal"),  # low, normal, high, critical
            "timestamp": datetime.now(timezone.utc),
            "expires_at": None,  # Optional expiry
        }
        
        # Validate required fields
        if not notification["message"]:
            raise HTTPException(status_code=400, detail="Message is required")
        
        result = await db.notifications.insert_one(notification)
        notification["_id"] = str(result.inserted_id)
        
        # Broadcast via Socket.IO to user's notification room
        if io:
            io.emit('notification', {
                'id': str(result.inserted_id),
                'type': notification['type'],
                'title': notification['title'],
                'message': notification['message'],
                'timestamp': notification['timestamp'].isoformat()
            }, room=f'user_{user_id}')
        
        logger.info(f"Notification created: {result.inserted_id} for user {user_id}")
        
        return {
            "id": str(result.inserted_id),
            "message": "Notification created successfully",
            "timestamp": notification["timestamp"].isoformat()
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating notification: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create notification")


@router.get("")
async def list_notifications(
    request: Request,
    unread: Optional[bool] = Query(None),
    notification_type: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500)
):
    """List notifications with optional filtering"""
    try:
        user_id = await verify_user_token(request)
        
        query = {"user_id": user_id}
        
        # Apply filters
        if unread is not None:
            query["read"] = not unread
        
        if notification_type:
            query["type"] = notification_type
        
        if priority:
            query["priority"] = priority
        
        # Exclude expired notifications
        query["$or"] = [
            {"expires_at": None},
            {"expires_at": {"$gt": datetime.now(timezone.utc)}}
        ]
        
        # Get total count
        total = await db.notifications.count_documents(query)
        
        # Fetch notifications sorted by timestamp (newest first)
        notifications = await db.notifications.find(query)\
            .sort("timestamp", -1)\
            .skip(skip)\
            .limit(limit)\
            .to_list(None)
        
        formatted = []
        for notif in notifications:
            notification_id = str(notif.get("id") or notif.get("notification_id") or notif.get("_id") or "")
            formatted.append({
                "_id": str(notif["_id"]) if notif.get("_id") is not None else None,
                "id": notification_id,
                "type": notif.get("type"),
                "title": notif.get("title"),
                "message": notif.get("message"),
                "read": notif.get("read"),
                "priority": notif.get("priority"),
                "booking_id": notif.get("booking_id"),
                "action_url": notif.get("action_url"),
                "timestamp": notif.get("timestamp").isoformat() if notif.get("timestamp") else None,
                "expires_at": notif.get("expires_at").isoformat() if notif.get("expires_at") else None
            })
        
        return {
            "total": total,
            "count": len(formatted),
            "skip": skip,
            "limit": limit,
            "notifications": formatted
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing notifications: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve notifications")


@router.get("/{notification_id}")
async def get_notification(notification_id: str, request: Request):
    """Get a specific notification"""
    try:
        user_id = await verify_user_token(request)
        notification = await db.notifications.find_one(notification_owner_query(user_id, notification_id))
        
        if not notification:
            raise HTTPException(status_code=404, detail="Notification not found")
        
        response_id = str(notification.get("id") or notification.get("notification_id") or notification.get("_id") or "")
        return {
            "_id": str(notification["_id"]) if notification.get("_id") is not None else None,
            "id": response_id,
            "type": notification.get("type"),
            "title": notification.get("title"),
            "message": notification.get("message"),
            "read": notification.get("read"),
            "priority": notification.get("priority"),
            "booking_id": notification.get("booking_id"),
            "driver_id": notification.get("driver_id"),
            "passenger_id": notification.get("passenger_id"),
            "action_url": notification.get("action_url"),
            "timestamp": notification.get("timestamp").isoformat() if notification.get("timestamp") else None,
            "expires_at": notification.get("expires_at").isoformat() if notification.get("expires_at") else None
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving notification: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve notification")


@router.put("/{notification_id}/read")
async def mark_notification_read(notification_id: str, request: Request):
    """Mark a notification as read"""
    try:
        user_id = await verify_user_token(request)
        
        result = await db.notifications.find_one_and_update(
            notification_owner_query(user_id, notification_id),
            {"$set": {"read": True}},
            return_document=True
        )
        
        if not result:
            raise HTTPException(status_code=404, detail="Notification not found")
        
        logger.info(f"Notification {notification_id} marked as read")
        
        return {"id": str(result["_id"]), "read": True}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error marking notification as read: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update notification")


@router.put("/read-all")
async def mark_all_notifications_read(request: Request):
    """Mark all notifications as read for the user"""
    try:
        user_id = await verify_user_token(request)
        
        result = await db.notifications.update_many(
            {"user_id": user_id, "read": False},
            {"$set": {"read": True}}
        )
        
        logger.info(f"Marked {result.modified_count} notifications as read for user {user_id}")
        
        return {
            "message": "All notifications marked as read",
            "updated_count": result.modified_count
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error marking all notifications as read: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update notifications")


@router.delete("/{notification_id}")
async def delete_notification(notification_id: str, request: Request):
    """Delete a specific notification"""
    try:
        user_id = await verify_user_token(request)
        result = await db.notifications.delete_one(notification_owner_query(user_id, notification_id))
        
        if result.deleted_count == 0:
            raise HTTPException(status_code=404, detail="Notification not found")
        
        logger.info(f"Notification {notification_id} deleted")
        
        return {"message": "Notification deleted successfully"}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting notification: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete notification")


@router.delete("")
async def delete_all_notifications(request: Request):
    """Delete all notifications for the user"""
    try:
        user_id = await verify_user_token(request)
        
        result = await db.notifications.delete_many({"user_id": user_id})
        
        logger.info(f"Deleted {result.deleted_count} notifications for user {user_id}")
        
        return {
            "message": "All notifications deleted successfully",
            "deleted_count": result.deleted_count
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting all notifications: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete notifications")


@router.get("/{user_id}/preferences")
async def get_notification_preferences(user_id: str, request: Request):
    """Get notification preferences for a user"""
    try:
        current_user_id = await verify_user_token(request)
        
        # Users can only see their own preferences
        if current_user_id != user_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        
        preferences = await db.notification_preferences.find_one({"user_id": user_id})
        
        if not preferences:
            # Return default preferences if not found
            preferences = {
                "user_id": user_id,
                "booking_notifications": True,
                "payment_notifications": True,
                "message_notifications": True,
                "support_notifications": True,
                "safety_notifications": True,
                "promo_notifications": True,
                "email_notifications": True,
                "push_notifications": True,
                "sms_notifications": False,
                "quiet_hours_enabled": False,
                "quiet_hours_start": None,
                "quiet_hours_end": None
            }
        
        return {
            "user_id": preferences.get("user_id"),
            "booking_notifications": preferences.get("booking_notifications", True),
            "payment_notifications": preferences.get("payment_notifications", True),
            "message_notifications": preferences.get("message_notifications", True),
            "support_notifications": preferences.get("support_notifications", True),
            "safety_notifications": preferences.get("safety_notifications", True),
            "promo_notifications": preferences.get("promo_notifications", True),
            "email_notifications": preferences.get("email_notifications", True),
            "push_notifications": preferences.get("push_notifications", True),
            "sms_notifications": preferences.get("sms_notifications", False),
            "quiet_hours_enabled": preferences.get("quiet_hours_enabled", False),
            "quiet_hours_start": preferences.get("quiet_hours_start"),
            "quiet_hours_end": preferences.get("quiet_hours_end")
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving notification preferences: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve preferences")


@router.put("/{user_id}/preferences")
async def update_notification_preferences(user_id: str, request: Request):
    """Update notification preferences for a user"""
    try:
        current_user_id = await verify_user_token(request)
        
        # Users can only update their own preferences
        if current_user_id != user_id:
            raise HTTPException(status_code=403, detail="Forbidden")
        
        data = await request.json()
        
        # Build update document
        update_data = {
            "user_id": user_id,
            "booking_notifications": data.get("booking_notifications", True),
            "payment_notifications": data.get("payment_notifications", True),
            "message_notifications": data.get("message_notifications", True),
            "support_notifications": data.get("support_notifications", True),
            "safety_notifications": data.get("safety_notifications", True),
            "promo_notifications": data.get("promo_notifications", True),
            "email_notifications": data.get("email_notifications", True),
            "push_notifications": data.get("push_notifications", True),
            "sms_notifications": data.get("sms_notifications", False),
            "quiet_hours_enabled": data.get("quiet_hours_enabled", False),
            "quiet_hours_start": data.get("quiet_hours_start"),
            "quiet_hours_end": data.get("quiet_hours_end"),
            "updated_at": datetime.now(timezone.utc)
        }
        
        result = await db.notification_preferences.find_one_and_update(
            {"user_id": user_id},
            {"$set": update_data},
            upsert=True,
            return_document=True
        )
        
        logger.info(f"Notification preferences updated for user {user_id}")
        
        return {
            "message": "Preferences updated successfully",
            "preferences": {
                "user_id": result.get("user_id"),
                "booking_notifications": result.get("booking_notifications"),
                "payment_notifications": result.get("payment_notifications"),
                "message_notifications": result.get("message_notifications"),
                "support_notifications": result.get("support_notifications"),
                "safety_notifications": result.get("safety_notifications"),
                "promo_notifications": result.get("promo_notifications"),
                "email_notifications": result.get("email_notifications"),
                "push_notifications": result.get("push_notifications"),
                "sms_notifications": result.get("sms_notifications"),
                "quiet_hours_enabled": result.get("quiet_hours_enabled"),
                "quiet_hours_start": result.get("quiet_hours_start"),
                "quiet_hours_end": result.get("quiet_hours_end")
            }
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating notification preferences: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update preferences")


@router.get("/stats/unread-count")
async def get_unread_count(request: Request):
    """Get count of unread notifications"""
    try:
        user_id = await verify_user_token(request)
        
        unread_count = await db.notifications.count_documents({
            "user_id": user_id,
            "read": False,
            "$or": [
                {"expires_at": None},
                {"expires_at": {"$gt": datetime.now(timezone.utc)}}
            ]
        })
        
        return {"unread_count": unread_count}
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting unread count: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get unread count")
