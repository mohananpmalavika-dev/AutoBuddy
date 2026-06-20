"""
Production Push Notification System - FCM integration with reliable delivery
Handles ride updates, payments, support, and safety alerts with retry logic
"""

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_, func
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Set
import json
import asyncio
import logging
import uuid
from enum import Enum
from pydantic import BaseModel, Field
import firebase_admin
from firebase_admin import credentials, messaging

from app.database import get_db
from app.utils.time_helpers import get_ist_now

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v3/notifications", tags=["Push Notifications"])

# ============================================================================
# DATABASE MODELS
# ============================================================================

from sqlalchemy import Column, String, Float, DateTime, Integer, Boolean, JSON, Enum as SQLEnum
from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

class NotificationTopic(str, Enum):
    """Push notification topics for subscription"""
    RIDE_UPDATES = "ride_updates"           # Driver accepted, arrived, completed
    PAYMENT_UPDATES = "payment_updates"     # Payment authorized, captured, refunded
    SUPPORT_REPLIES = "support_replies"     # Customer support team responses
    SAFETY_ALERTS = "safety_alerts"         # SOS, incident alerts, emergency
    PROMOTIONS = "promotions"               # Offers, bonuses, campaigns

class NotificationPriority(str, Enum):
    """Notification priority levels"""
    HIGH = "high"       # Immediate delivery (ride accepted, emergency)
    NORMAL = "normal"   # Standard (most notifications)
    LOW = "low"         # Background (promotions, non-urgent)

class DeviceTokenRecord(Base):
    """Store and manage device FCM tokens"""
    __tablename__ = "device_tokens"

    token_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, index=True, nullable=False)
    device_id = Column(String, index=True, nullable=False)  # Phone's unique device ID
    fcm_token = Column(String, unique=True, index=True, nullable=False)  # FCM token
    device_type = Column(String)  # "ios" or "android"
    app_version = Column(String)
    os_version = Column(String)

    # Subscription topics
    subscribed_topics = Column(JSON, default=list)  # List of NotificationTopic values

    # Status tracking
    is_active = Column(Boolean, default=True)  # Token valid and able to receive
    badge_count = Column(Integer, default=0)   # App badge (unread count)
    last_heartbeat = Column(DateTime, default=lambda: get_ist_now())  # Last token validation
    last_notification_sent = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=lambda: get_ist_now())
    updated_at = Column(DateTime, default=lambda: get_ist_now())

class NotificationLog(Base):
    """Audit trail of all notifications sent"""
    __tablename__ = "notification_logs"

    log_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    notification_id = Column(String, index=True, unique=True)  # Idempotency key
    user_id = Column(String, index=True, nullable=False)
    device_token_id = Column(String, index=True)

    topic = Column(String, nullable=False)  # NotificationTopic
    priority = Column(String, default="normal")  # NotificationPriority
    title = Column(String, nullable=False)
    body = Column(String, nullable=False)
    data = Column(JSON)  # Extra data (ride_id, payment_id, etc)

    # Delivery tracking
    status = Column(String, default="QUEUED")  # QUEUED, SENT, DELIVERED, FAILED, RETRYING
    fcm_message_id = Column(String, nullable=True)  # FCM's message ID
    error_code = Column(String, nullable=True)  # FCM error code on failure
    error_message = Column(String, nullable=True)  # Human-readable error

    retry_count = Column(Integer, default=0)
    max_retries = Column(Integer, default=3)
    last_retry_at = Column(DateTime, nullable=True)
    next_retry_at = Column(DateTime, nullable=True)

    sent_at = Column(DateTime, nullable=True)
    delivered_at = Column(DateTime, nullable=True)
    read_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=lambda: get_ist_now(), index=True)

class NotificationTemplate(Base):
    """Templated notifications for consistent messaging"""
    __tablename__ = "notification_templates"

    template_id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    template_key = Column(String, unique=True, index=True)  # e.g., "ride_accepted"
    topic = Column(String)  # NotificationTopic

    title_template = Column(String)   # "{driver_name} accepted your ride"
    body_template = Column(String)    # "ETA {eta_minutes} minutes from {pickup_location}"
    data_template = Column(JSON)      # {"ride_id": "{ride_id}", "action": "open_ride"}

    priority = Column(String, default="normal")
    is_silent = Column(Boolean, default=False)  # Background/silent notification
    include_badge = Column(Boolean, default=True)

    created_at = Column(DateTime, default=lambda: get_ist_now())

# ============================================================================
# SCHEMAS
# ============================================================================

class RegisterDeviceRequest(BaseModel):
    user_id: str
    device_id: str
    fcm_token: str
    device_type: str = Field(regex="^(ios|android)$")
    app_version: str
    os_version: str

class SubscriptionUpdate(BaseModel):
    topics: List[str] = Field(description="List of NotificationTopic values to subscribe to")

class SendNotificationRequest(BaseModel):
    user_id: str
    title: str
    body: str
    topic: str = Field(description="NotificationTopic value")
    priority: str = Field(default="normal", regex="^(high|normal|low)$")
    data: Optional[Dict] = None
    silent: bool = Field(default=False, description="Silent/background notification")

class BroadcastNotificationRequest(BaseModel):
    topic: str = Field(description="NotificationTopic to broadcast to")
    title: str
    body: str
    priority: str = Field(default="normal")
    data: Optional[Dict] = None

# ============================================================================
# FCM SETUP
# ============================================================================

def get_fcm_app():
    """Get or initialize Firebase app"""
    try:
        app = firebase_admin.get_app()
    except ValueError:
        # Initialize with service account
        import os
        creds_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "firebase-credentials.json")
        cred = credentials.Certificate(creds_path)
        app = firebase_admin.initialize_app(cred)
    return app

def send_fcm_message(token: str, title: str, body: str, data: Optional[Dict] = None,
                     priority: str = "normal", silent: bool = False) -> tuple[bool, Optional[str], Optional[str]]:
    """
    Send FCM message directly to device token
    Returns (success, message_id, error_code)
    """
    try:
        message = messaging.Message(
            notification=messaging.Notification(
                title=title,
                body=body
            ) if not silent else None,
            data=data or {},
            android=messaging.AndroidConfig(
                priority=priority.upper() if priority in ["high", "normal"] else "NORMAL",
                notification=messaging.AndroidNotification(
                    title=title,
                    body=body,
                    click_action="FLUTTER_NOTIFICATION_CLICK" if silent else None
                ) if not silent else None
            ),
            apns=messaging.APNSConfig(
                payload=messaging.APNSPayload(
                    aps=messaging.Aps(
                        sound="default" if not silent else None,
                        content_available=True,
                        mutable_content=True,
                        badge=1 if not silent else None
                    )
                )
            )
        )

        message_id = messaging.send(message, app=get_fcm_app())
        logger.info(f"FCM message sent: {message_id} to {token}")
        return True, message_id, None

    except messaging.ApiCallError as e:
        error_code = e.code if hasattr(e, 'code') else "UNKNOWN"
        logger.error(f"FCM error ({error_code}): {str(e)}")
        return False, None, error_code

# ============================================================================
# NOTIFICATION DELIVERY ENGINE
# ============================================================================

class NotificationDeliveryEngine:
    """Handles reliable notification delivery with retries"""

    @staticmethod
    async def send_notification(
        user_id: str,
        title: str,
        body: str,
        topic: str,
        priority: str = "normal",
        data: Optional[Dict] = None,
        silent: bool = False,
        db: Session = None
    ) -> str:
        """
        Send notification to user with retry logic
        Returns notification_id for tracking
        """
        notification_id = str(uuid.uuid4())

        # Get all device tokens for user
        devices = db.query(DeviceTokenRecord).filter(
            and_(
                DeviceTokenRecord.user_id == user_id,
                DeviceTokenRecord.is_active == True
            )
        ).all()

        if not devices:
            logger.warning(f"No active devices for user {user_id}")
            # Still log the notification for audit
            return notification_id

        # Send to all devices
        for device in devices:
            log_entry = NotificationLog(
                notification_id=f"{notification_id}_{device.token_id}",
                user_id=user_id,
                device_token_id=device.token_id,
                topic=topic,
                priority=priority,
                title=title,
                body=body,
                data=data,
                status="QUEUED"
            )

            db.add(log_entry)

        db.commit()

        # Send asynchronously
        asyncio.create_task(
            NotificationDeliveryEngine._send_with_retry(
                user_id, devices, title, body, data, priority, silent, db
            )
        )

        return notification_id

    @staticmethod
    async def _send_with_retry(
        user_id: str,
        devices: List[DeviceTokenRecord],
        title: str,
        body: str,
        data: Optional[Dict],
        priority: str,
        silent: bool,
        db: Session
    ):
        """Send with automatic retry on failure"""
        for device in devices:
            log_id = f"{uuid.uuid4()}_{device.token_id}"
            success, message_id, error_code = send_fcm_message(
                device.fcm_token,
                title,
                body,
                data,
                priority,
                silent
            )

            if success:
                # Update log
                log_entry = db.query(NotificationLog).filter(
                    NotificationLog.notification_id == log_id
                ).first()

                if log_entry:
                    log_entry.status = "SENT"
                    log_entry.fcm_message_id = message_id
                    log_entry.sent_at = get_ist_now()
                    db.commit()

                # Update device last notification
                device.last_notification_sent = get_ist_now()
                db.commit()

            else:
                # Schedule retry
                log_entry = db.query(NotificationLog).filter(
                    NotificationLog.notification_id == log_id
                ).first()

                if log_entry:
                    log_entry.status = "RETRYING"
                    log_entry.error_code = error_code
                    log_entry.retry_count += 1
                    log_entry.last_retry_at = get_ist_now()

                    # Exponential backoff: 5s, 15s, 60s
                    retry_delays = [5, 15, 60]
                    if log_entry.retry_count <= len(retry_delays):
                        delay = retry_delays[log_entry.retry_count - 1]
                        log_entry.next_retry_at = get_ist_now() + timedelta(seconds=delay)

                    db.commit()

                    # Schedule retry task
                    if log_entry.retry_count < log_entry.max_retries:
                        asyncio.create_task(
                            NotificationDeliveryEngine._retry_send(
                                log_id, device, title, body, data, priority, silent, db
                            )
                        )

    @staticmethod
    async def _retry_send(
        log_id: str,
        device: DeviceTokenRecord,
        title: str,
        body: str,
        data: Optional[Dict],
        priority: str,
        silent: bool,
        db: Session
    ):
        """Retry sending notification after delay"""
        log_entry = db.query(NotificationLog).filter(
            NotificationLog.notification_id == log_id
        ).first()

        if not log_entry or not log_entry.next_retry_at:
            return

        # Wait until retry time
        wait_seconds = (log_entry.next_retry_at - get_ist_now()).total_seconds()
        if wait_seconds > 0:
            await asyncio.sleep(wait_seconds)

        # Attempt retry
        success, message_id, error_code = send_fcm_message(
            device.fcm_token, title, body, data, priority, silent
        )

        if success:
            log_entry.status = "SENT"
            log_entry.fcm_message_id = message_id
            log_entry.sent_at = get_ist_now()
        else:
            log_entry.status = "FAILED"
            log_entry.error_code = error_code

        db.commit()

# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("/register-device")
async def register_device(request: RegisterDeviceRequest, db: Session = Depends(get_db)):
    """
    Register device for push notifications
    Called on app launch or when FCM token refreshes
    """
    # Check if token already registered
    existing = db.query(DeviceTokenRecord).filter(
        DeviceTokenRecord.fcm_token == request.fcm_token
    ).first()

    if existing:
        # Update existing record
        existing.last_heartbeat = get_ist_now()
        existing.is_active = True
        db.commit()
        return {
            "status": "updated",
            "token_id": existing.token_id,
            "message": "Device token updated"
        }

    # Create new token record
    token_record = DeviceTokenRecord(
        token_id=str(uuid.uuid4()),
        user_id=request.user_id,
        device_id=request.device_id,
        fcm_token=request.fcm_token,
        device_type=request.device_type,
        app_version=request.app_version,
        os_version=request.os_version,
        subscribed_topics=list(NotificationTopic)  # Subscribe to all by default
    )

    db.add(token_record)
    db.commit()
    db.refresh(token_record)

    logger.info(f"Device registered: {request.user_id} on {request.device_type}")

    return {
        "status": "registered",
        "token_id": token_record.token_id,
        "message": "Device registered for push notifications"
    }

@router.post("/subscribe")
async def subscribe_to_topics(
    user_id: str = Query(...),
    request: SubscriptionUpdate = None,
    db: Session = Depends(get_db)
):
    """Subscribe user's devices to notification topics"""
    devices = db.query(DeviceTokenRecord).filter(
        DeviceTokenRecord.user_id == user_id
    ).all()

    if not devices:
        raise HTTPException(status_code=404, detail="No devices found for user")

    for device in devices:
        device.subscribed_topics = request.topics
        device.updated_at = get_ist_now()

    db.commit()

    return {
        "status": "subscribed",
        "user_id": user_id,
        "devices_updated": len(devices),
        "topics": request.topics
    }

@router.post("/send")
async def send_notification(request: SendNotificationRequest, db: Session = Depends(get_db)):
    """
    Send notification to specific user
    Handles retries automatically
    """
    notification_id = await NotificationDeliveryEngine.send_notification(
        user_id=request.user_id,
        title=request.title,
        body=request.body,
        topic=request.topic,
        priority=request.priority,
        data=request.data,
        silent=request.silent,
        db=db
    )

    return {
        "notification_id": notification_id,
        "status": "queued",
        "user_id": request.user_id,
        "message": "Notification queued for delivery"
    }

@router.post("/broadcast")
async def broadcast_notification(request: BroadcastNotificationRequest, db: Session = Depends(get_db)):
    """
    Broadcast notification to all users subscribed to topic
    """
    # Get all devices subscribed to topic
    devices = db.query(DeviceTokenRecord).filter(
        and_(
            DeviceTokenRecord.is_active == True,
            DeviceTokenRecord.subscribed_topics.contains([request.topic])
        )
    ).all()

    if not devices:
        logger.info(f"No subscribers for topic {request.topic}")
        return {"status": "no_subscribers", "topic": request.topic}

    # Send to all
    count = 0
    for device in devices:
        await NotificationDeliveryEngine.send_notification(
            user_id=device.user_id,
            title=request.title,
            body=request.body,
            topic=request.topic,
            priority=request.priority,
            data=request.data,
            db=db
        )
        count += 1

    logger.info(f"Broadcast notification sent to {count} devices on topic {request.topic}")

    return {
        "status": "broadcast_sent",
        "topic": request.topic,
        "devices_targeted": count,
        "message": f"Notification sent to {count} subscribed devices"
    }

@router.post("/heartbeat/{user_id}")
async def device_heartbeat(user_id: str, db: Session = Depends(get_db)):
    """
    Update device heartbeat to validate token
    Called periodically by app (e.g., every 24 hours)
    """
    devices = db.query(DeviceTokenRecord).filter(
        DeviceTokenRecord.user_id == user_id
    ).all()

    for device in devices:
        device.last_heartbeat = get_ist_now()

    db.commit()

    return {
        "status": "heartbeat_recorded",
        "devices_updated": len(devices)
    }

@router.get("/delivery-status/{notification_id}")
async def get_delivery_status(notification_id: str, db: Session = Depends(get_db)):
    """
    Get delivery status of notification
    Used for tracking/debugging
    """
    logs = db.query(NotificationLog).filter(
        NotificationLog.notification_id.like(f"{notification_id}%")
    ).all()

    if not logs:
        raise HTTPException(status_code=404, detail="Notification not found")

    return {
        "notification_id": notification_id,
        "total_devices": len(logs),
        "statuses": {
            "sent": sum(1 for l in logs if l.status == "SENT"),
            "failed": sum(1 for l in logs if l.status == "FAILED"),
            "retrying": sum(1 for l in logs if l.status == "RETRYING"),
            "queued": sum(1 for l in logs if l.status == "QUEUED")
        },
        "logs": [
            {
                "device_token_id": l.device_token_id,
                "status": l.status,
                "fcm_message_id": l.fcm_message_id,
                "error_code": l.error_code,
                "sent_at": l.sent_at.isoformat() if l.sent_at else None
            }
            for l in logs
        ]
    }

@router.get("/templates")
async def list_templates(db: Session = Depends(get_db)):
    """
    List available notification templates
    """
    templates = db.query(NotificationTemplate).all()

    return {
        "templates": [
            {
                "template_id": t.template_id,
                "template_key": t.template_key,
                "topic": t.topic,
                "title_template": t.title_template,
                "body_template": t.body_template,
                "priority": t.priority,
                "is_silent": t.is_silent
            }
            for t in templates
        ]
    }

@router.get("/user-preferences/{user_id}")
async def get_user_preferences(user_id: str, db: Session = Depends(get_db)):
    """
    Get notification preferences and device info for user
    """
    devices = db.query(DeviceTokenRecord).filter(
        DeviceTokenRecord.user_id == user_id
    ).all()

    if not devices:
        raise HTTPException(status_code=404, detail="No devices found")

    # Get subscription topics from first device (same for all)
    subscribed_topics = devices[0].subscribed_topics if devices else []

    return {
        "user_id": user_id,
        "devices": [
            {
                "device_id": d.device_id,
                "device_type": d.device_type,
                "app_version": d.app_version,
                "is_active": d.is_active,
                "badge_count": d.badge_count,
                "last_notification": d.last_notification_sent.isoformat() if d.last_notification_sent else None
            }
            for d in devices
        ],
        "subscribed_topics": subscribed_topics,
        "total_devices": len(devices)
    }

@router.post("/badge-update/{user_id}")
async def update_badge_count(user_id: str, badge_count: int = Query(0), db: Session = Depends(get_db)):
    """
    Update badge count for user's devices
    Called when clearing notifications
    """
    devices = db.query(DeviceTokenRecord).filter(
        DeviceTokenRecord.user_id == user_id
    ).all()

    for device in devices:
        device.badge_count = badge_count

    db.commit()

    return {
        "status": "badge_updated",
        "user_id": user_id,
        "badge_count": badge_count,
        "devices_updated": len(devices)
    }

@router.get("/analytics")
async def notification_analytics(days: int = Query(7, ge=1, le=90), db: Session = Depends(get_db)):
    """
    Get notification delivery analytics
    """
    since = get_ist_now() - timedelta(days=days)

    total_sent = db.query(func.count(NotificationLog.log_id)).filter(
        and_(
            NotificationLog.status.in_(["SENT", "DELIVERED"]),
            NotificationLog.created_at >= since
        )
    ).scalar() or 0

    total_failed = db.query(func.count(NotificationLog.log_id)).filter(
        and_(
            NotificationLog.status == "FAILED",
            NotificationLog.created_at >= since
        )
    ).scalar() or 0

    total_retried = db.query(func.count(NotificationLog.log_id)).filter(
        and_(
            NotificationLog.retry_count > 0,
            NotificationLog.created_at >= since
        )
    ).scalar() or 0

    success_rate = ((total_sent / (total_sent + total_failed)) * 100) if (total_sent + total_failed) > 0 else 0

    return {
        "period_days": days,
        "total_sent": total_sent,
        "total_failed": total_failed,
        "total_retried": total_retried,
        "success_rate": round(success_rate, 1),
        "timestamp": get_ist_now().isoformat()
    }
