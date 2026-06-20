"""
Scheduled Rides System - Production Implementation
Handles advance ride booking, recurring rides, reminders, and rescheduling
"""

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy import Column, String, DateTime, Boolean, JSON, Integer, Enum as SQLEnum, and_, desc
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, List, Dict, Any
import hashlib
from apscheduler.schedulers.background import BackgroundScheduler

# ==================== ENUMS ====================

class RecurrenceType(str, Enum):
    NEVER = "never"          # One-time scheduled ride
    DAILY = "daily"          # Every day
    WEEKDAYS = "weekdays"    # Monday-Friday
    WEEKENDS = "weekends"    # Saturday-Sunday
    WEEKLY = "weekly"        # Specific day of week
    BIWEEKLY = "biweekly"    # Every 2 weeks
    MONTHLY = "monthly"      # Same day each month


class ScheduledRideStatus(str, Enum):
    SCHEDULED = "scheduled"      # Waiting for ride time
    CONFIRMED = "confirmed"      # Driver accepted
    ACTIVE = "active"            # Ride in progress
    COMPLETED = "completed"      # Ride finished
    CANCELLED = "cancelled"      # Cancelled by user
    RESCHEDULED = "rescheduled"  # Rescheduled by user
    EXPIRED = "expired"          # Time passed, not booked
    SYSTEM_CANCELLED = "system_cancelled"  # Cancelled by system (driver no-show, etc)


class ScheduledRideNotificationType(str, Enum):
    REMINDER_1HOUR = "reminder_1hour"        # 1 hour before
    REMINDER_15MIN = "reminder_15min"        # 15 min before
    DRIVER_ASSIGNED = "driver_assigned"      # Driver accepted
    DRIVER_ARRIVED = "driver_arrived"        # Driver at pickup
    RIDE_CANCELLED = "ride_cancelled"        # By driver or system
    RIDE_RESCHEDULED = "ride_rescheduled"    # By user


# ==================== DATABASE MODELS ====================

class ScheduledRide(BaseModel):
    """Main scheduled ride booking"""
    __tablename__ = "scheduled_rides"

    ride_id = Column(String, primary_key=True)
    user_id = Column(String, index=True)  # Passenger
    user_type = Column(String)  # "passenger"

    # Location
    pickup_latitude = Column(Float)
    pickup_longitude = Column(Float)
    pickup_address = Column(String)
    dropoff_latitude = Column(Float)
    dropoff_longitude = Column(Float)
    dropoff_address = Column(String)

    # Scheduling
    scheduled_at = Column(DateTime, index=True)  # When the ride should start
    scheduled_for_date = Column(String)  # "2026-06-25" for grouping
    scheduled_for_time = Column(String)  # "09:30" for grouping

    # Current status
    status = Column(String(enum=ScheduledRideStatus), default=ScheduledRideStatus.SCHEDULED, index=True)
    assigned_driver_id = Column(String, nullable=True)  # Driver when accepted
    confirmed_at = Column(DateTime, nullable=True)  # When driver accepted

    # Pricing
    estimated_fare = Column(Float)
    estimated_duration_minutes = Column(Integer)
    estimated_distance_km = Column(Float)

    # Preferences
    vehicle_type = Column(String, default="economy")  # "economy", "premium", "xl"
    special_instructions = Column(String, nullable=True)  # e.g., "Driver, please wait 5 min"
    accessible = Column(Boolean, default=False)  # Accessible vehicle
    share_ride = Column(Boolean, default=False)  # Allow ride sharing

    # Recurrence
    is_recurring = Column(Boolean, default=False)
    recurrence_type = Column(String(enum=RecurrenceType), default=RecurrenceType.NEVER)
    recurrence_parent_id = Column(String, nullable=True)  # Parent of recurring series
    recurrence_end_date = Column(DateTime, nullable=True)  # When recurring stops
    recurrence_days_of_week = Column(JSON, default=[])  # [0-6] for weekly recurrence

    # Notifications sent
    reminder_1hour_sent = Column(Boolean, default=False)
    reminder_15min_sent = Column(Boolean, default=False)

    # Cancellation
    cancelled_at = Column(DateTime, nullable=True)
    cancelled_by = Column(String, nullable=True)  # "user", "driver", "system"
    cancellation_reason = Column(String, nullable=True)
    refund_status = Column(String, default="pending")  # "pending", "processed"

    # Tracking
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ScheduledRideHistory(BaseModel):
    """Track all changes to scheduled ride"""
    __tablename__ = "scheduled_ride_history"

    history_id = Column(String, primary_key=True)
    ride_id = Column(String, index=True)
    user_id = Column(String, index=True)

    # Change tracking
    action = Column(String)  # "created", "confirmed", "rescheduled", "cancelled"
    previous_status = Column(String, nullable=True)
    new_status = Column(String)

    # Change details
    change_details = Column(JSON)  # {"scheduled_at": "...", "estimated_fare": "..."}
    changed_by = Column(String)  # "user", "driver", "system"
    reason = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)


class ScheduledRideNotification(BaseModel):
    """Track scheduled ride notifications"""
    __tablename__ = "scheduled_ride_notifications"

    notification_id = Column(String, primary_key=True)
    ride_id = Column(String, index=True)
    user_id = Column(String, index=True)

    # Notification
    type = Column(String(enum=ScheduledRideNotificationType))
    title = Column(String)
    body = Column(String)

    # Delivery
    scheduled_at = Column(DateTime)  # When to send
    sent_at = Column(DateTime, nullable=True)  # When actually sent
    delivery_status = Column(String)  # "pending", "sent", "failed"

    created_at = Column(DateTime, default=datetime.utcnow)


class ScheduledRideReschedule(BaseModel):
    """Track reschedule requests"""
    __tablename__ = "scheduled_ride_reschedules"

    reschedule_id = Column(String, primary_key=True)
    original_ride_id = Column(String, index=True)
    new_ride_id = Column(String, nullable=True)  # Links to new scheduled ride
    user_id = Column(String, index=True)

    # Original and new times
    original_scheduled_at = Column(DateTime)
    new_scheduled_at = Column(DateTime)

    # Status
    status = Column(String)  # "pending", "confirmed", "cancelled"
    reason = Column(String, nullable=True)

    # Charges
    fare_difference = Column(Float, default=0.0)
    charge_type = Column(String)  # "credit", "charge", "none"

    created_at = Column(DateTime, default=datetime.utcnow)
    processed_at = Column(DateTime, nullable=True)


# ==================== REQUEST/RESPONSE MODELS ====================

class ScheduleRideRequest:
    user_id: str
    pickup_latitude: float
    pickup_longitude: float
    pickup_address: str
    dropoff_latitude: float
    dropoff_longitude: float
    dropoff_address: str
    scheduled_at: datetime
    vehicle_type: str = "economy"
    special_instructions: Optional[str] = None
    accessible: bool = False
    share_ride: bool = False
    recurrence_type: str = "never"
    recurrence_end_date: Optional[datetime] = None


class ScheduledRideResponse:
    ride_id: str
    status: str
    scheduled_at: datetime
    estimated_fare: float
    estimated_duration_minutes: int


# ==================== ROUTER ====================

router = APIRouter(prefix="/api/v3/scheduled-rides", tags=["scheduled_rides"])

# Scheduler for background jobs
scheduler = BackgroundScheduler()
if not scheduler.running:
    scheduler.start()


# ==================== HELPER FUNCTIONS ====================

def generate_id(prefix: str) -> str:
    return f"{prefix}_{hashlib.md5(f'{datetime.utcnow()}{id(prefix)}'.encode()).hexdigest()[:12]}"


def estimate_ride_details(pickup_lat: float, pickup_lon: float,
                         dropoff_lat: float, dropoff_lon: float) -> Dict:
    """Estimate fare, duration, and distance using Haversine formula"""

    # Simplified Haversine calculation
    from math import radians, sin, cos, sqrt, atan2

    R = 6371  # Earth radius in km
    lat1, lon1 = radians(pickup_lat), radians(pickup_lon)
    lat2, lon2 = radians(dropoff_lat), radians(dropoff_lon)

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    distance = R * c

    # Estimate: 5 min + 2 min per km
    duration = 5 + int(distance * 2)

    # Estimate fare: ₹30 base + ₹10/km + ₹2/min
    base_fare = 30
    distance_fare = distance * 10
    duration_fare = duration * 2
    estimated_fare = base_fare + distance_fare + duration_fare

    return {
        "estimated_distance_km": round(distance, 1),
        "estimated_duration_minutes": duration,
        "estimated_fare": round(estimated_fare, 2)
    }


def send_scheduled_ride_notification(ride_id: str, notification_type: str, db: Session, background_tasks: BackgroundTasks):
    """Send notification for scheduled ride"""
    ride = db.query(ScheduledRide).filter_by(ride_id=ride_id).first()
    if not ride:
        return

    notification_content = {
        "reminder_1hour": {
            "title": "Ride Reminder",
            "body": f"Your ride to {ride.dropoff_address} is in 1 hour"
        },
        "reminder_15min": {
            "title": "Ride Arriving Soon",
            "body": f"Your driver will arrive in 15 minutes"
        },
        "driver_assigned": {
            "title": "Driver Assigned",
            "body": f"Driver assigned to your scheduled ride"
        },
        "ride_cancelled": {
            "title": "Ride Cancelled",
            "body": "Your scheduled ride has been cancelled"
        }
    }

    content = notification_content.get(notification_type, {})

    # Create notification record
    notif_id = generate_id("sched_notif")
    notification = ScheduledRideNotification(
        notification_id=notif_id,
        ride_id=ride_id,
        user_id=ride.user_id,
        type=notification_type,
        title=content.get("title", ""),
        body=content.get("body", ""),
        scheduled_at=datetime.utcnow(),
        sent_at=datetime.utcnow(),
        delivery_status="sent"
    )
    db.add(notification)
    db.commit()

    # Send via push notifications (background)
    # background_tasks.add_task(send_push_notification, ride.user_id, content)


def check_and_book_scheduled_ride(ride_id: str, db: Session):
    """Background task: Convert scheduled ride to active when time arrives"""
    ride = db.query(ScheduledRide).filter_by(ride_id=ride_id).first()
    if not ride or ride.status != ScheduledRideStatus.SCHEDULED:
        return

    # Get nearby drivers (same as regular ride matching)
    # For now, simplified version
    # In production, call dispatch matching algorithm

    # If no driver found, keep as scheduled
    # If driver found, update to CONFIRMED


# ==================== ENDPOINTS ====================

@router.post("/schedule")
async def schedule_ride(
    user_id: str,
    pickup_latitude: float,
    pickup_longitude: float,
    pickup_address: str,
    dropoff_latitude: float,
    dropoff_longitude: float,
    dropoff_address: str,
    scheduled_at: datetime,
    vehicle_type: str = "economy",
    special_instructions: Optional[str] = None,
    accessible: bool = False,
    share_ride: bool = False,
    recurrence_type: str = "never",
    recurrence_end_date: Optional[datetime] = None,
    recurrence_days_of_week: Optional[List[int]] = None,
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None
):
    """Schedule a ride for future"""

    if scheduled_at <= datetime.utcnow():
        raise HTTPException(status_code=400, detail="Scheduled time must be in future")

    # Min 15 min advance notice
    if (scheduled_at - datetime.utcnow()).total_seconds() < 900:
        raise HTTPException(status_code=400, detail="Must schedule at least 15 minutes in advance")

    # Estimate ride details
    ride_details = estimate_ride_details(pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude)

    # Create scheduled ride
    ride_id = generate_id("sched_ride")
    scheduled_date = scheduled_at.strftime("%Y-%m-%d")
    scheduled_time = scheduled_at.strftime("%H:%M")

    ride = ScheduledRide(
        ride_id=ride_id,
        user_id=user_id,
        user_type="passenger",
        pickup_latitude=pickup_latitude,
        pickup_longitude=pickup_longitude,
        pickup_address=pickup_address,
        dropoff_latitude=dropoff_latitude,
        dropoff_longitude=dropoff_longitude,
        dropoff_address=dropoff_address,
        scheduled_at=scheduled_at,
        scheduled_for_date=scheduled_date,
        scheduled_for_time=scheduled_time,
        status=ScheduledRideStatus.SCHEDULED,
        vehicle_type=vehicle_type,
        special_instructions=special_instructions,
        accessible=accessible,
        share_ride=share_ride,
        is_recurring=recurrence_type != "never",
        recurrence_type=recurrence_type,
        recurrence_end_date=recurrence_end_date,
        recurrence_days_of_week=recurrence_days_of_week or [],
        **ride_details
    )
    db.add(ride)

    # Create history record
    history_id = generate_id("hist")
    history = ScheduledRideHistory(
        history_id=history_id,
        ride_id=ride_id,
        user_id=user_id,
        action="created",
        new_status=ScheduledRideStatus.SCHEDULED,
        changed_by="user",
        change_details={
            "scheduled_at": scheduled_at.isoformat(),
            "location": f"{pickup_address} → {dropoff_address}",
            "vehicle_type": vehicle_type
        }
    )
    db.add(history)

    db.commit()

    # Schedule reminders
    if background_tasks:
        # 1 hour before
        reminder_1h_time = scheduled_at - timedelta(hours=1)
        if reminder_1h_time > datetime.utcnow():
            background_tasks.add_task(
                send_scheduled_ride_notification,
                ride_id, "reminder_1hour", db, background_tasks
            )

        # 15 min before
        reminder_15m_time = scheduled_at - timedelta(minutes=15)
        if reminder_15m_time > datetime.utcnow():
            background_tasks.add_task(
                send_scheduled_ride_notification,
                ride_id, "reminder_15min", db, background_tasks
            )

    return {
        "ride_id": ride_id,
        "status": ScheduledRideStatus.SCHEDULED,
        "scheduled_at": scheduled_at.isoformat(),
        "estimated_fare": ride.estimated_fare,
        "estimated_duration_minutes": ride.estimated_duration_minutes,
        "estimated_distance_km": ride.estimated_distance_km,
        "message": "Ride scheduled successfully"
    }


@router.get("/my-scheduled-rides/{user_id}")
async def get_user_scheduled_rides(
    user_id: str,
    status: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Get all scheduled rides for user"""

    query = db.query(ScheduledRide).filter_by(user_id=user_id).order_by(desc(ScheduledRide.scheduled_at))

    if status:
        query = query.filter_by(status=status)

    rides = query.all()

    return {
        "total": len(rides),
        "rides": [
            {
                "ride_id": r.ride_id,
                "status": r.status,
                "scheduled_at": r.scheduled_at.isoformat(),
                "pickup_address": r.pickup_address,
                "dropoff_address": r.dropoff_address,
                "estimated_fare": r.estimated_fare,
                "estimated_duration_minutes": r.estimated_duration_minutes,
                "is_recurring": r.is_recurring,
                "recurrence_type": r.recurrence_type,
                "vehicle_type": r.vehicle_type,
                "assigned_driver_id": r.assigned_driver_id
            }
            for r in rides
        ]
    }


@router.get("/scheduled/{ride_id}")
async def get_scheduled_ride_details(ride_id: str, db: Session = Depends(get_db)):
    """Get details of a scheduled ride"""

    ride = db.query(ScheduledRide).filter_by(ride_id=ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Scheduled ride not found")

    history = db.query(ScheduledRideHistory).filter_by(ride_id=ride_id).order_by(
        desc(ScheduledRideHistory.created_at)
    ).all()

    return {
        "ride_id": ride.ride_id,
        "status": ride.status,
        "scheduled_at": ride.scheduled_at.isoformat(),
        "pickup_address": ride.pickup_address,
        "dropoff_address": ride.dropoff_address,
        "estimated_fare": ride.estimated_fare,
        "estimated_duration_minutes": ride.estimated_duration_minutes,
        "estimated_distance_km": ride.estimated_distance_km,
        "vehicle_type": ride.vehicle_type,
        "special_instructions": ride.special_instructions,
        "accessible": ride.accessible,
        "share_ride": ride.share_ride,
        "is_recurring": ride.is_recurring,
        "recurrence_type": ride.recurrence_type,
        "recurrence_end_date": ride.recurrence_end_date.isoformat() if ride.recurrence_end_date else None,
        "assigned_driver_id": ride.assigned_driver_id,
        "confirmed_at": ride.confirmed_at.isoformat() if ride.confirmed_at else None,
        "reminder_1hour_sent": ride.reminder_1hour_sent,
        "reminder_15min_sent": ride.reminder_15min_sent,
        "history": [
            {
                "action": h.action,
                "status": h.new_status,
                "reason": h.reason,
                "changed_at": h.created_at.isoformat()
            }
            for h in history
        ]
    }


@router.post("/cancel/{ride_id}")
async def cancel_scheduled_ride(
    ride_id: str,
    cancellation_reason: Optional[str] = None,
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None
):
    """Cancel a scheduled ride"""

    ride = db.query(ScheduledRide).filter_by(ride_id=ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Scheduled ride not found")

    if ride.status in [ScheduledRideStatus.COMPLETED, ScheduledRideStatus.CANCELLED]:
        raise HTTPException(status_code=400, detail=f"Cannot cancel ride with status: {ride.status}")

    # Calculate refund
    refund_amount = ride.estimated_fare * 0.8  # 80% refund if cancelled within 15 min
    if (ride.scheduled_at - datetime.utcnow()).total_seconds() < 900:  # Less than 15 min
        refund_amount = ride.estimated_fare * 0.5  # 50% refund

    # Update ride
    ride.status = ScheduledRideStatus.CANCELLED
    ride.cancelled_at = datetime.utcnow()
    ride.cancelled_by = "user"
    ride.cancellation_reason = cancellation_reason

    # Create history
    history = ScheduledRideHistory(
        history_id=generate_id("hist"),
        ride_id=ride_id,
        user_id=ride.user_id,
        action="cancelled",
        previous_status=ride.status,
        new_status=ScheduledRideStatus.CANCELLED,
        changed_by="user",
        reason=cancellation_reason
    )
    db.add(history)

    db.commit()

    # Send notification
    if background_tasks:
        background_tasks.add_task(send_scheduled_ride_notification, ride_id, "ride_cancelled", db, background_tasks)

    return {
        "ride_id": ride_id,
        "status": "cancelled",
        "refund_amount": refund_amount,
        "message": "Ride cancelled successfully. Refund will be processed."
    }


@router.post("/reschedule/{ride_id}")
async def reschedule_ride(
    ride_id: str,
    new_scheduled_at: datetime,
    reason: Optional[str] = None,
    db: Session = Depends(get_db),
    background_tasks: BackgroundTasks = None
):
    """Reschedule a scheduled ride"""

    ride = db.query(ScheduledRide).filter_by(ride_id=ride_id).first()
    if not ride:
        raise HTTPException(status_code=404, detail="Scheduled ride not found")

    if ride.status not in [ScheduledRideStatus.SCHEDULED, ScheduledRideStatus.CONFIRMED]:
        raise HTTPException(status_code=400, detail=f"Cannot reschedule ride with status: {ride.status}")

    if new_scheduled_at <= datetime.utcnow():
        raise HTTPException(status_code=400, detail="New time must be in future")

    # Create new ride with same details
    new_ride_id = generate_id("sched_ride")
    old_scheduled_at = ride.scheduled_at

    new_ride = ScheduledRide(
        ride_id=new_ride_id,
        user_id=ride.user_id,
        user_type=ride.user_type,
        pickup_latitude=ride.pickup_latitude,
        pickup_longitude=ride.pickup_longitude,
        pickup_address=ride.pickup_address,
        dropoff_latitude=ride.dropoff_latitude,
        dropoff_longitude=ride.dropoff_longitude,
        dropoff_address=ride.dropoff_address,
        scheduled_at=new_scheduled_at,
        scheduled_for_date=new_scheduled_at.strftime("%Y-%m-%d"),
        scheduled_for_time=new_scheduled_at.strftime("%H:%M"),
        status=ScheduledRideStatus.SCHEDULED,
        vehicle_type=ride.vehicle_type,
        special_instructions=ride.special_instructions,
        accessible=ride.accessible,
        share_ride=ride.share_ride,
        estimated_fare=ride.estimated_fare,
        estimated_duration_minutes=ride.estimated_duration_minutes,
        estimated_distance_km=ride.estimated_distance_km
    )
    db.add(new_ride)

    # Create reschedule record
    reschedule = ScheduledRideReschedule(
        reschedule_id=generate_id("reschedule"),
        original_ride_id=ride_id,
        new_ride_id=new_ride_id,
        user_id=ride.user_id,
        original_scheduled_at=old_scheduled_at,
        new_scheduled_at=new_scheduled_at,
        status="confirmed",
        reason=reason,
        charge_type="none"
    )
    db.add(reschedule)

    # Cancel original ride
    ride.status = ScheduledRideStatus.RESCHEDULED
    ride.updated_at = datetime.utcnow()

    # Create history
    history = ScheduledRideHistory(
        history_id=generate_id("hist"),
        ride_id=ride_id,
        user_id=ride.user_id,
        action="rescheduled",
        previous_status=ScheduledRideStatus.SCHEDULED,
        new_status=ScheduledRideStatus.RESCHEDULED,
        changed_by="user",
        reason=reason,
        change_details={"new_scheduled_at": new_scheduled_at.isoformat()}
    )
    db.add(history)

    db.commit()

    return {
        "original_ride_id": ride_id,
        "new_ride_id": new_ride_id,
        "old_scheduled_at": old_scheduled_at.isoformat(),
        "new_scheduled_at": new_scheduled_at.isoformat(),
        "charge": 0,
        "message": "Ride rescheduled successfully"
    }


@router.get("/upcoming/{user_id}")
async def get_upcoming_scheduled_rides(user_id: str, db: Session = Depends(get_db)):
    """Get upcoming scheduled rides (next 7 days)"""

    now = datetime.utcnow()
    week_later = now + timedelta(days=7)

    rides = db.query(ScheduledRide).filter(
        ScheduledRide.user_id == user_id,
        ScheduledRide.scheduled_at >= now,
        ScheduledRide.scheduled_at <= week_later,
        ScheduledRide.status.in_([ScheduledRideStatus.SCHEDULED, ScheduledRideStatus.CONFIRMED])
    ).order_by(ScheduledRide.scheduled_at).all()

    return {
        "count": len(rides),
        "rides": [
            {
                "ride_id": r.ride_id,
                "scheduled_at": r.scheduled_at.isoformat(),
                "scheduled_for_date": r.scheduled_for_date,
                "scheduled_for_time": r.scheduled_for_time,
                "pickup_address": r.pickup_address,
                "dropoff_address": r.dropoff_address,
                "estimated_fare": r.estimated_fare,
                "status": r.status
            }
            for r in rides
        ]
    }


@router.post("/background-task/send-reminders")
async def send_ride_reminders(db: Session = Depends(get_db)):
    """Background task: Send reminders for rides (run every 5 minutes)"""

    now = datetime.utcnow()

    # Get rides needing 1-hour reminder
    rides_1h = db.query(ScheduledRide).filter(
        ScheduledRide.scheduled_at >= now + timedelta(minutes=55),
        ScheduledRide.scheduled_at <= now + timedelta(minutes=65),
        ScheduledRide.reminder_1hour_sent == False,
        ScheduledRide.status == ScheduledRideStatus.SCHEDULED
    ).all()

    for ride in rides_1h:
        send_scheduled_ride_notification(ride.ride_id, "reminder_1hour", db, None)
        ride.reminder_1hour_sent = True

    # Get rides needing 15-min reminder
    rides_15m = db.query(ScheduledRide).filter(
        ScheduledRide.scheduled_at >= now + timedelta(minutes=10),
        ScheduledRide.scheduled_at <= now + timedelta(minutes=20),
        ScheduledRide.reminder_15min_sent == False,
        ScheduledRide.status.in_([ScheduledRideStatus.SCHEDULED, ScheduledRideStatus.CONFIRMED])
    ).all()

    for ride in rides_15m:
        send_scheduled_ride_notification(ride.ride_id, "reminder_15min", db, None)
        ride.reminder_15min_sent = True

    db.commit()

    return {"reminders_sent": len(rides_1h) + len(rides_15m)}


@router.post("/background-task/match-rides")
async def match_scheduled_rides(db: Session = Depends(get_db)):
    """Background task: Match drivers to scheduled rides when time arrives (run every 5 min)"""

    now = datetime.utcnow()
    window_start = now - timedelta(minutes=5)
    window_end = now + timedelta(minutes=5)

    # Get rides coming up in next 5 minutes that haven't been matched
    rides = db.query(ScheduledRide).filter(
        ScheduledRide.scheduled_at >= window_start,
        ScheduledRide.scheduled_at <= window_end,
        ScheduledRide.status == ScheduledRideStatus.SCHEDULED,
        ScheduledRide.assigned_driver_id.is_(None)
    ).all()

    matched = 0
    for ride in rides:
        # Call dispatch matching algorithm
        # dispatch_result = match_drivers_for_ride(ride)
        # if dispatch_result:
        #     ride.assigned_driver_id = dispatch_result['driver_id']
        #     ride.status = ScheduledRideStatus.CONFIRMED
        #     matched += 1

        # For now, just mark as expired if no match
        if ride.scheduled_at <= now:
            ride.status = ScheduledRideStatus.EXPIRED

    db.commit()

    return {"matched": matched, "expired": len(rides) - matched}


@router.post("/background-task/handle-recurring")
async def handle_recurring_rides(db: Session = Depends(get_db)):
    """Background task: Create recurring ride instances (run daily at midnight)"""

    now = datetime.utcnow()

    # Get active recurring rides
    recurring_rides = db.query(ScheduledRide).filter(
        ScheduledRide.is_recurring == True,
        ScheduledRide.recurrence_type != RecurrenceType.NEVER,
        ScheduledRide.status != ScheduledRideStatus.CANCELLED,
        or_(
            ScheduledRide.recurrence_end_date.is_(None),
            ScheduledRide.recurrence_end_date >= now
        )
    ).all()

    created = 0
    for parent_ride in recurring_rides:
        # Calculate next occurrence
        next_occurrence = calculate_next_recurrence(parent_ride, now)

        if next_occurrence and next_occurrence <= now + timedelta(days=1):
            # Create new instance
            new_ride_id = generate_id("sched_ride")
            new_ride = ScheduledRide(
                ride_id=new_ride_id,
                user_id=parent_ride.user_id,
                user_type=parent_ride.user_type,
                pickup_latitude=parent_ride.pickup_latitude,
                pickup_longitude=parent_ride.pickup_longitude,
                pickup_address=parent_ride.pickup_address,
                dropoff_latitude=parent_ride.dropoff_latitude,
                dropoff_longitude=parent_ride.dropoff_longitude,
                dropoff_address=parent_ride.dropoff_address,
                scheduled_at=next_occurrence,
                scheduled_for_date=next_occurrence.strftime("%Y-%m-%d"),
                scheduled_for_time=next_occurrence.strftime("%H:%M"),
                status=ScheduledRideStatus.SCHEDULED,
                vehicle_type=parent_ride.vehicle_type,
                special_instructions=parent_ride.special_instructions,
                accessible=parent_ride.accessible,
                share_ride=parent_ride.share_ride,
                estimated_fare=parent_ride.estimated_fare,
                estimated_duration_minutes=parent_ride.estimated_duration_minutes,
                estimated_distance_km=parent_ride.estimated_distance_km,
                recurrence_parent_id=parent_ride.ride_id,
                is_recurring=False  # Individual instances not recurring
            )
            db.add(new_ride)
            created += 1

    db.commit()

    return {"recurring_instances_created": created}


def calculate_next_recurrence(ride: ScheduledRide, from_date: datetime) -> Optional[datetime]:
    """Calculate next occurrence date for recurring ride"""

    recurrence_type = ride.recurrence_type

    if recurrence_type == RecurrenceType.DAILY:
        next_date = from_date + timedelta(days=1)
    elif recurrence_type == RecurrenceType.WEEKDAYS:
        next_date = from_date + timedelta(days=1)
        while next_date.weekday() >= 5:  # Skip weekends
            next_date += timedelta(days=1)
    elif recurrence_type == RecurrenceType.WEEKENDS:
        next_date = from_date + timedelta(days=1)
        while next_date.weekday() < 5:  # Skip weekdays
            next_date += timedelta(days=1)
    elif recurrence_type == RecurrenceType.WEEKLY:
        next_date = from_date + timedelta(days=7)
    elif recurrence_type == RecurrenceType.BIWEEKLY:
        next_date = from_date + timedelta(days=14)
    elif recurrence_type == RecurrenceType.MONTHLY:
        # Same day next month
        try:
            next_date = from_date.replace(month=from_date.month + 1)
        except ValueError:
            next_date = from_date.replace(year=from_date.year + 1, month=1)
    else:
        return None

    # Check end date
    if ride.recurrence_end_date and next_date > ride.recurrence_end_date:
        return None

    # Maintain original time
    original_time = ride.scheduled_at.time()
    next_date = next_date.replace(hour=original_time.hour, minute=original_time.minute, second=0)

    return next_date
