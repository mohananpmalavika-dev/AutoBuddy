"""
Family Assistant API Endpoints
Features: Family member management, appointment tracking, notifications, quick actions
"""

from fastapi import APIRouter, Request, HTTPException, BackgroundTasks, Body
from datetime import datetime, timedelta
from typing import List, Dict, Optional
import random
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.utils.rbac import get_current_user_from_request
from app.db.family_assistant_models import (
    FamilyMember, FamilyMemberRelationship, FamilyAppointment, FamilyNotification,
    FamilyQuickAction, QuickActionExecution, FamilyGroup, AppointmentType,
    AppointmentPriority, FamilyDashboardSummary
)

router = APIRouter(prefix="/api/family", tags=["family-assistant"])


# ============================================================================
# FAMILY MEMBER MANAGEMENT ENDPOINTS
# ============================================================================

@router.post("/members/add")
async def add_family_member(
    member_data: Dict,
    request: Request,
    background_tasks: BackgroundTasks
):
    """Add a new family member"""
    user = await get_current_user_from_request(request)
    
    try:
        family_member = FamilyMember(
            primary_user_id=user["user_id"],
            member_name=member_data.get("name"),
            relationship=member_data.get("relationship", "other"),
            phone_number=member_data.get("phone"),
            email=member_data.get("email"),
            age=member_data.get("age"),
            health_conditions=member_data.get("health_conditions", []),
            auto_book_rides=member_data.get("auto_book_rides", False),
            preferred_vehicle_type=member_data.get("preferred_vehicle_type", "economy")
        )
        
        # In production, save to MongoDB
        member_dict = family_member.model_dump(exclude_unset=True)
        member_dict["_id"] = f"FM-{random.randint(100000, 999999)}"
        member_dict["created_at"] = datetime.utcnow()
        
        return {
            "success": True,
            "member_id": member_dict["_id"],
            "message": f"{family_member.member_name} added to family",
            "member": member_dict
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/members/list")
async def list_family_members(request: Request):
    """Get all family members for current user"""
    user = await get_current_user_from_request(request)
    
    # Mock data - in production, fetch from MongoDB
    family_members = [
        {
            "member_id": "FM-001",
            "member_name": "Mom",
            "relationship": "mother",
            "phone_number": "+91-9876543210",
            "email": "mom@example.com",
            "age": 65,
            "health_conditions": ["hypertension"],
            "calendar_synced": True,
            "auto_book_rides": True,
            "emergency_contact": True,
            "created_at": datetime.utcnow().isoformat()
        },
        {
            "member_id": "FM-002",
            "member_name": "Dad",
            "relationship": "father",
            "phone_number": "+91-9876543211",
            "age": 68,
            "health_conditions": [],
            "calendar_synced": False,
            "auto_book_rides": False,
            "emergency_contact": True,
            "created_at": datetime.utcnow().isoformat()
        }
    ]
    
    return {
        "total_members": len(family_members),
        "members": family_members
    }


@router.get("/members/{member_id}")
async def get_family_member(member_id: str, request: Request):
    """Get details of a specific family member"""
    user = await get_current_user_from_request(request)
    
    # Mock data - in production, fetch from MongoDB
    member = {
        "member_id": member_id,
        "member_name": "Mom",
        "relationship": "mother",
        "phone_number": "+91-9876543210",
        "email": "mom@example.com",
        "age": 65,
        "health_conditions": ["hypertension", "arthritis"],
        "calendar_synced": True,
        "google_calendar_id": "calendar123@google.com",
        "last_calendar_sync": datetime.utcnow().isoformat(),
        "auto_book_rides": True,
        "preferred_vehicle_type": "comfort",
        "tracking_enabled": True,
        "safety_alerts_enabled": True,
        "location_sharing": True,
        "created_at": datetime.utcnow().isoformat()
    }
    
    return member


@router.put("/members/{member_id}")
async def update_family_member(
    member_id: str,
    update_data: Dict,
    request: Request
):
    """Update family member details"""
    user = await get_current_user_from_request(request)
    
    try:
        # In production, update in MongoDB
        return {
            "success": True,
            "member_id": member_id,
            "message": "Family member updated successfully",
            "updated_fields": list(update_data.keys())
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================================
# APPOINTMENT & EVENT TRACKING
# ============================================================================

@router.get("/appointments/{member_id}")
async def get_member_appointments(
    member_id: str,
    days_ahead: int = 7,
    request: Request = None
):
    """Get upcoming appointments for a family member"""
    user = await get_current_user_from_request(request)
    
    # Mock data - in production, fetch from MongoDB and sync from calendar
    now = datetime.utcnow()
    appointments = [
        {
            "appointment_id": "APT-001",
            "family_member_name": "Mom",
            "title": "Hospital Appointment - Cardiology",
            "description": "Annual heart checkup",
            "appointment_type": "medical",
            "priority": "high",
            "start_time": (now + timedelta(days=1, hours=3)).isoformat(),
            "end_time": (now + timedelta(days=1, hours=4)).isoformat(),
            "location": "City Hospital, Hyderabad",
            "location_coordinates": {"lat": 17.3850, "lon": 78.4867},
            "transportation_needed": True,
            "round_trip": True,
            "travel_time_minutes": 25,
            "ride_booked": False,
            "notification_time_minutes_before": 60,
            "notify_main_user": True
        },
        {
            "appointment_id": "APT-002",
            "family_member_name": "Mom",
            "title": "Hair Salon",
            "appointment_type": "personal",
            "priority": "medium",
            "start_time": (now + timedelta(days=3, hours=2)).isoformat(),
            "end_time": (now + timedelta(days=3, hours=3)).isoformat(),
            "location": "Beauty Plus Salon, Banjara Hills",
            "transportation_needed": True,
            "round_trip": True,
            "ride_booked": False
        }
    ]
    
    return {
        "member_id": member_id,
        "total_appointments": len(appointments),
        "appointments": appointments
    }


@router.post("/appointments/add")
async def add_appointment(
    appointment_data: Dict,
    request: Request
):
    """Add a new appointment for a family member"""
    user = await get_current_user_from_request(request)
    
    try:
        appointment = FamilyAppointment(
            family_member_id=appointment_data.get("family_member_id"),
            primary_user_id=user["user_id"],
            title=appointment_data.get("title"),
            description=appointment_data.get("description"),
            appointment_type=appointment_data.get("appointment_type", "other"),
            priority=appointment_data.get("priority", "medium"),
            start_time=datetime.fromisoformat(appointment_data.get("start_time")),
            end_time=datetime.fromisoformat(appointment_data.get("end_time")),
            location=appointment_data.get("location"),
            location_coordinates=appointment_data.get("location_coordinates"),
            transportation_needed=appointment_data.get("transportation_needed", True),
            round_trip=appointment_data.get("round_trip", False),
            notify_main_user=appointment_data.get("notify_main_user", True)
        )
        
        appointment_dict = appointment.model_dump(exclude_unset=True)
        appointment_dict["_id"] = f"APT-{random.randint(100000, 999999)}"
        
        return {
            "success": True,
            "appointment_id": appointment_dict["_id"],
            "message": "Appointment added successfully",
            "appointment": appointment_dict
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================================
# NOTIFICATIONS & ALERTS
# ============================================================================

@router.get("/notifications")
async def get_family_notifications(
    unread_only: bool = False,
    request: Request = None
):
    """Get all notifications for family-related events"""
    user = await get_current_user_from_request(request)
    
    # Mock data - in production, fetch from MongoDB
    notifications = [
        {
            "notification_id": "NOTIF-001",
            "family_member_name": "Mom",
            "title": "Hospital Appointment Tomorrow",
            "message": "Mom has appointment at 3 PM at City Hospital. Book vehicle?",
            "action_type": "book_ride",
            "read": False,
            "quick_action_available": True,
            "quick_action_data": {
                "family_member_id": "FM-001",
                "pickup_location": "Home",
                "destination": "City Hospital, Hyderabad",
                "scheduled_time": (datetime.utcnow() + timedelta(days=1, hours=3)).isoformat(),
                "round_trip": True
            },
            "created_at": datetime.utcnow().isoformat()
        },
        {
            "notification_id": "NOTIF-002",
            "family_member_name": "Dad",
            "title": "Medication Reminder",
            "message": "Dad's blood pressure medication due in 2 hours",
            "action_type": "reminder",
            "read": True,
            "created_at": (datetime.utcnow() - timedelta(hours=1)).isoformat()
        }
    ]
    
    if unread_only:
        notifications = [n for n in notifications if not n.get("read", False)]
    
    return {
        "total": len(notifications),
        "unread": len([n for n in notifications if not n.get("read", False)]),
        "notifications": notifications
    }


@router.post("/notifications/{notification_id}/mark-read")
async def mark_notification_read(
    notification_id: str,
    request: Request
):
    """Mark a notification as read"""
    user = await get_current_user_from_request(request)
    
    return {
        "success": True,
        "notification_id": notification_id,
        "message": "Notification marked as read"
    }


# ============================================================================
# QUICK ACTIONS - ONE-CLICK OPERATIONS
# ============================================================================

@router.post("/quick-actions/book-ride")
async def quick_action_book_ride(
    action_data: Dict = Body(...),
    request: Request = None,
    background_tasks: BackgroundTasks = None
):
    """
    Execute one-click ride booking for family member
    
    Example:
    {
        "family_member_id": "FM-001",
        "notification_id": "NOTIF-001",
        "appointment_id": "APT-001",
        "pickup_location": "Home",
        "destination": "City Hospital, Hyderabad",
        "scheduled_time": "2026-06-23T15:00:00",
        "round_trip": true,
        "vehicle_type": "comfort"
    }
    """
    user = await get_current_user_from_request(request)
    
    try:
        # Pre-fill booking with family member details
        booking_payload = {
            "passenger_name": action_data.get("passenger_name", "Mom"),
            "passenger_phone": action_data.get("passenger_phone", "+91-9876543210"),
            "pickup_address": action_data.get("pickup_location", "Home"),
            "pickup_coordinates": action_data.get("pickup_coordinates"),
            "destination_address": action_data.get("destination", "City Hospital"),
            "destination_coordinates": action_data.get("destination_coordinates"),
            "scheduled_time": action_data.get("scheduled_time"),
            "ride_type": "scheduled",
            "vehicle_type": action_data.get("vehicle_type", "comfort"),
            "round_trip": action_data.get("round_trip", False),
            "special_requirements": action_data.get("special_requirements", []),
            "notes": f"Family assistant booking for {action_data.get('family_member_id')}"
        }
        
        # In production, call actual booking API
        booking_id = f"BK-{random.randint(100000, 999999)}"
        
        # Log quick action execution
        execution = QuickActionExecution(
            primary_user_id=user["user_id"],
            family_member_id=action_data.get("family_member_id"),
            quick_action_id=f"QA-{random.randint(100000, 999999)}",
            action_type="book_ride",
            status="completed",
            booking_id=booking_id,
            initiated_from="notification"
        )
        
        # Send notifications
        return {
            "success": True,
            "booking_id": booking_id,
            "status": "confirmed",
            "message": f"Ride booked successfully for {action_data.get('passenger_name', 'family member')}",
            "booking_details": {
                "booking_id": booking_id,
                "pickup": action_data.get("pickup_location"),
                "destination": action_data.get("destination"),
                "scheduled_time": action_data.get("scheduled_time"),
                "vehicle_type": action_data.get("vehicle_type", "comfort"),
                "round_trip": action_data.get("round_trip", False),
                "estimated_fare": 350.0,  # Mock fare
                "confirmation_sent_to": action_data.get("passenger_phone")
            }
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/quick-actions/templates")
async def get_quick_action_templates(
    family_member_id: str,
    request: Request = None
):
    """Get pre-configured quick action templates for a family member"""
    user = await get_current_user_from_request(request)
    
    # Mock data - in production, fetch from MongoDB
    templates = [
        {
            "action_id": "QA-001",
            "action_type": "book_ride",
            "description": "Book ride to hospital",
            "preset_data": {
                "destination": "City Hospital, Hyderabad",
                "vehicle_type": "comfort",
                "round_trip": True
            },
            "times_used": 5
        },
        {
            "action_id": "QA-002",
            "action_type": "book_ride",
            "description": "Book ride to salon",
            "preset_data": {
                "destination": "Beauty Plus Salon",
                "vehicle_type": "economy",
                "round_trip": True
            },
            "times_used": 12
        }
    ]
    
    return {
        "family_member_id": family_member_id,
        "total_templates": len(templates),
        "templates": templates
    }


@router.post("/quick-actions/create")
async def create_quick_action(
    action_config: Dict,
    request: Request = None
):
    """Create a new quick action template"""
    user = await get_current_user_from_request(request)
    
    try:
        quick_action = FamilyQuickAction(
            primary_user_id=user["user_id"],
            family_member_id=action_config.get("family_member_id"),
            action_type=action_config.get("action_type", "book_ride"),
            description=action_config.get("description"),
            preset_data=action_config.get("preset_data", {}),
            requires_confirmation=action_config.get("requires_confirmation", True)
        )
        
        action_dict = quick_action.model_dump(exclude_unset=True)
        action_dict["_id"] = f"QA-{random.randint(100000, 999999)}"
        
        return {
            "success": True,
            "action_id": action_dict["_id"],
            "message": "Quick action template created",
            "action": action_dict
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================================================
# FAMILY DASHBOARD & ANALYTICS
# ============================================================================

@router.get("/dashboard")
async def get_family_dashboard(request: Request = None):
    """Get comprehensive family assistant dashboard"""
    user = await get_current_user_from_request(request)
    
    now = datetime.utcnow()
    
    # Mock data - in production, aggregate real data
    dashboard = {
        "total_family_members": 2,
        "today_appointments": [
            {
                "member_name": "Mom",
                "title": "Doctor's Appointment",
                "time": (now + timedelta(hours=3)).isoformat(),
                "location": "City Hospital",
                "ride_booked": False,
                "priority": "high"
            }
        ],
        "pending_notifications": 3,
        "upcoming_rides_needed": [
            {
                "member_name": "Mom",
                "purpose": "Hospital Visit",
                "time": (now + timedelta(hours=3)).isoformat(),
                "status": "awaiting_booking"
            },
            {
                "member_name": "Dad",
                "purpose": "Airport Pickup",
                "time": (now + timedelta(days=2)).isoformat(),
                "status": "awaiting_confirmation"
            }
        ],
        "this_week_stats": {
            "total_appointments": 5,
            "rides_booked": 3,
            "rides_completed": 2,
            "emergency_contacts": 2
        },
        "health_alerts": [
            {
                "member_name": "Mom",
                "alert": "Medication reminder",
                "time": (now + timedelta(hours=2)).isoformat()
            }
        ],
        "quick_actions": [
            {
                "action_id": "QA-001",
                "label": "Book hospital ride",
                "member_name": "Mom",
                "enabled": True
            },
            {
                "action_id": "QA-002",
                "label": "Call doctor",
                "member_name": "Mom",
                "enabled": True
            }
        ]
    }
    
    return dashboard


@router.get("/analytics")
async def get_family_analytics(
    period: str = "month",
    request: Request = None
):
    """Get family transportation and health analytics"""
    user = await get_current_user_from_request(request)
    
    # Mock data - in production, calculate from real data
    analytics = {
        "period": period,
        "total_rides_booked": 23,
        "total_rides_completed": 21,
        "total_rides_cancelled": 2,
        "total_transportation_cost": 5890.0,
        "average_cost_per_ride": 256.0,
        "appointments_attended": 18,
        "appointments_missed": 1,
        "most_visited_location": "City Hospital",
        "most_active_member": "Mom",
        "trending_appointments": ["Medical", "Shopping", "Social"],
        "cost_breakdown": {
            "hospital_visits": 2340.0,
            "shopping": 1500.0,
            "social_events": 1050.0,
            "misc": 1000.0
        }
    }
    
    return analytics


# ============================================================================
# CALENDAR SYNC
# ============================================================================

@router.post("/calendar/sync/{member_id}")
async def sync_family_calendar(
    member_id: str,
    calendar_source: str = "google",
    request: Request = None,
    background_tasks: BackgroundTasks = None
):
    """
    Sync family member's calendar with AutoBuddy
    Automatically detects appointments and creates notifications
    """
    user = await get_current_user_from_request(request)
    
    try:
        # In production, integrate with Google Calendar API or Outlook
        background_tasks.add_task(sync_calendar_background, member_id, calendar_source)
        
        return {
            "success": True,
            "member_id": member_id,
            "message": "Calendar sync initiated",
            "status": "syncing",
            "calendar_source": calendar_source
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/calendar/sync-status/{member_id}")
async def get_calendar_sync_status(
    member_id: str,
    request: Request = None
):
    """Get calendar sync status for a family member"""
    user = await get_current_user_from_request(request)
    
    # Mock data
    return {
        "member_id": member_id,
        "calendar_synced": True,
        "last_sync": (datetime.utcnow() - timedelta(minutes=5)).isoformat(),
        "next_sync": (datetime.utcnow() + timedelta(minutes=10)).isoformat(),
        "appointments_synced": 12,
        "new_appointments_detected": 2,
        "status": "active"
    }


# ============================================================================
# BACKGROUND TASKS
# ============================================================================

async def sync_calendar_background(member_id: str, calendar_source: str):
    """Background task to sync calendar and process appointments"""
    try:
        # In production:
        # 1. Fetch calendar events from Google Calendar / Outlook
        # 2. Analyze each event for transportation needs
        # 3. Create FamilyAppointment records
        # 4. Generate notifications for main user
        # 5. Pre-fill quick action bookings
        
        print(f"Syncing {calendar_source} calendar for family member {member_id}")
        await asyncio.sleep(2)  # Simulate API call
        print(f"Calendar sync completed for {member_id}")
    except Exception as e:
        print(f"Calendar sync error for {member_id}: {str(e)}")


@router.post("/calendar/enable-auto-sync/{member_id}")
async def enable_auto_calendar_sync(
    member_id: str,
    calendar_config: Dict = Body(...),
    request: Request = None
):
    """
    Enable automatic calendar syncing for a family member
    Syncs every 15 minutes by default
    """
    user = await get_current_user_from_request(request)
    
    try:
        config = {
            "member_id": member_id,
            "auto_sync_enabled": True,
            "sync_interval_minutes": calendar_config.get("sync_interval_minutes", 15),
            "calendar_source": calendar_config.get("calendar_source", "google"),
            "include_event_types": calendar_config.get("include_event_types", ["medical", "work"]),
            "auto_book_rides": calendar_config.get("auto_book_rides", False),
            "enabled_at": datetime.utcnow().isoformat()
        }
        
        return {
            "success": True,
            "member_id": member_id,
            "message": "Auto calendar sync enabled",
            "configuration": config
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
