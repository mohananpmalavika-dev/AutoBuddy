"""
Family Assistant Database Models
Features: Family member profiles, appointment tracking, notifications, quick actions
"""

from datetime import datetime
from typing import List, Dict, Optional
from pydantic import BaseModel, Field
from enum import Enum


# ============================================================================
# FAMILY MEMBER MODELS
# ============================================================================

class FamilyMemberRelationship(str, Enum):
    """Relationship types"""
    MOTHER = "mother"
    FATHER = "father"
    SPOUSE = "spouse"
    CHILD = "child"
    SIBLING = "sibling"
    GRANDPARENT = "grandparent"
    OTHER = "other"


class FamilyMember(BaseModel):
    """Family member profile"""
    id: Optional[str] = Field(default=None, alias="_id")
    primary_user_id: str  # Main user managing the family
    member_name: str
    relationship: FamilyMemberRelationship
    phone_number: str
    email: Optional[str] = None
    age: Optional[int] = None
    health_conditions: List[str] = Field(default_factory=list)  # e.g., ["diabetes", "heart_condition"]
    emergency_contact: bool = True  # Notify main user in emergencies
    
    # Calendar sync
    calendar_synced: bool = False
    google_calendar_id: Optional[str] = None
    calendar_sync_token: Optional[str] = None
    last_calendar_sync: Optional[datetime] = None
    
    # Quick action settings
    auto_book_rides: bool = False
    auto_book_threshold: float = 0.8  # Confidence threshold for auto-booking
    preferred_vehicle_type: str = "economy"  # economy, comfort, premium
    preferred_pickup_location: Optional[str] = None
    
    # Tracking
    tracking_enabled: bool = True
    location_sharing: bool = False
    safety_alerts_enabled: bool = True
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# APPOINTMENT MODELS
# ============================================================================

class AppointmentType(str, Enum):
    """Types of appointments"""
    MEDICAL = "medical"
    EDUCATION = "education"
    WORK = "work"
    PERSONAL = "personal"
    SOCIAL = "social"
    OTHER = "other"


class AppointmentPriority(str, Enum):
    """Appointment priority levels"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class FamilyAppointment(BaseModel):
    """Family member appointment/event"""
    id: Optional[str] = Field(default=None, alias="_id")
    family_member_id: str
    primary_user_id: str
    title: str
    description: Optional[str] = None
    appointment_type: AppointmentType
    priority: AppointmentPriority = AppointmentPriority.MEDIUM
    
    # Timing
    start_time: datetime
    end_time: datetime
    location: str
    location_coordinates: Optional[Dict] = None  # {"lat": float, "lon": float}
    
    # Transportation
    transportation_needed: bool = True
    round_trip: bool = False
    travel_time_minutes: Optional[int] = None
    
    # Notification settings
    notify_main_user: bool = True
    notification_time_minutes_before: int = 60  # Minutes before appointment
    notify_via_sms: bool = False
    notify_via_email: bool = True
    
    # Ride booking
    ride_booked: bool = False
    ride_booking_id: Optional[str] = None
    ride_confirmed: bool = False
    
    # Calendar
    calendar_event_id: Optional[str] = None
    synced_from_calendar: bool = False
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# NOTIFICATION MODELS
# ============================================================================

class NotificationChannel(str, Enum):
    """Notification delivery channels"""
    SMS = "sms"
    EMAIL = "email"
    PUSH = "push"
    IN_APP = "in_app"


class FamilyNotification(BaseModel):
    """Notification to main user about family member"""
    id: Optional[str] = Field(default=None, alias="_id")
    primary_user_id: str
    family_member_id: str
    family_member_name: str
    
    # Content
    title: str
    message: str
    action_type: str  # "book_ride", "view_details", "emergency_alert", etc.
    related_appointment_id: Optional[str] = None
    
    # Status
    read: bool = False
    action_taken: bool = False
    quick_action_available: bool = True
    quick_action_data: Optional[Dict] = None  # Pre-filled booking data, etc.
    
    # Delivery
    channels: List[NotificationChannel] = Field(default_factory=list)
    delivered_via: List[NotificationChannel] = Field(default_factory=list)
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    expires_at: Optional[datetime] = None


# ============================================================================
# QUICK ACTION MODELS
# ============================================================================

class QuickActionType(str, Enum):
    """Types of quick actions"""
    BOOK_RIDE = "book_ride"
    BOOK_ROUND_TRIP = "book_round_trip"
    UPDATE_LOCATION = "update_location"
    NOTIFY_ARRIVAL = "notify_arrival"
    REQUEST_PICKUP = "request_pickup"
    EMERGENCY_ALERT = "emergency_alert"


class FamilyQuickAction(BaseModel):
    """Quick action templates for family members"""
    id: Optional[str] = Field(default=None, alias="_id")
    primary_user_id: str
    family_member_id: str
    action_type: QuickActionType
    
    # Action details
    description: str
    preset_data: Dict  # Pre-filled form data
    requires_confirmation: bool = True
    
    # Tracking
    times_used: int = 0
    last_used: Optional[datetime] = None
    
    created_at: datetime = Field(default_factory=datetime.utcnow)


class QuickActionExecution(BaseModel):
    """Record of a quick action execution"""
    id: Optional[str] = Field(default=None, alias="_id")
    primary_user_id: str
    family_member_id: str
    quick_action_id: str
    action_type: QuickActionType
    
    # Execution details
    status: str  # "pending", "confirmed", "completed", "failed"
    booking_id: Optional[str] = None  # If booking_ride action
    
    # Metadata
    initiated_from: str  # "notification", "dashboard", "manual"
    execution_time: datetime = Field(default_factory=datetime.utcnow)
    completion_time: Optional[datetime] = None


# ============================================================================
# FAMILY GROUP MODELS
# ============================================================================

class FamilyGroup(BaseModel):
    """Group of family members for coordinated management"""
    id: Optional[str] = Field(default=None, alias="_id")
    primary_user_id: str
    group_name: str  # e.g., "Parents", "Children", "Dependents"
    description: Optional[str] = None
    
    # Members
    member_ids: List[str]  # List of FamilyMember IDs
    
    # Group settings
    shared_calendar: bool = False
    shared_location_visibility: bool = False
    group_notification_preferences: Dict = Field(default_factory=dict)
    
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


# ============================================================================
# FAMILY DASHBOARD MODELS
# ============================================================================

class FamilyDashboardSummary(BaseModel):
    """Summary view for family assistant dashboard"""
    primary_user_id: str
    total_family_members: int
    
    # Today's activities
    today_appointments: List[Dict]
    upcoming_rides_needed: List[Dict]
    pending_notifications: int
    
    # Stats
    appointments_this_week: int
    rides_booked_this_month: int
    emergency_contacts: int
    
    # Health/wellness summary
    health_alerts: List[Dict]
    medication_reminders: List[Dict]


# ============================================================================
# INTEGRATION MODELS
# ============================================================================

class CalendarSyncConfig(BaseModel):
    """Configuration for syncing family member calendars"""
    family_member_id: str
    primary_user_id: str
    
    # Calendar source
    calendar_source: str  # "google", "outlook", "apple"
    calendar_id: str
    access_token: str
    refresh_token: Optional[str] = None
    
    # Sync settings
    auto_sync_enabled: bool = True
    sync_interval_minutes: int = 15
    last_sync_timestamp: Optional[datetime] = None
    
    # Event filtering
    include_event_types: List[AppointmentType] = Field(default_factory=lambda: [AppointmentType.MEDICAL, AppointmentType.WORK])
    exclude_keywords: List[str] = Field(default_factory=list)
    
    created_at: datetime = Field(default_factory=datetime.utcnow)


class RideBookingPreference(BaseModel):
    """Preferences for automatic ride booking for family member"""
    family_member_id: str
    primary_user_id: str
    
    # Booking settings
    auto_book_enabled: bool = True
    confidence_threshold: float = 0.8
    advance_booking_minutes: int = 30
    
    # Vehicle preferences
    vehicle_type: str = "economy"
    preferred_features: List[str] = Field(default_factory=list)  # accessibility, wifi, etc.
    
    # Payment
    payment_method: str = "main_wallet"
    max_fare_limit: Optional[float] = None
    
    # Notifications
    send_booking_confirmation: bool = True
    send_arrival_notification: bool = True
    send_trip_updates: bool = True
