"""
Calendar Booking Models - Integration with Google Calendar for automatic transportation booking
"""

from pydantic import BaseModel, Field, validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class GoogleCalendarCredential(BaseModel):
    """Google Calendar OAuth credentials"""
    user_id: str
    access_token: str
    refresh_token: str
    token_expiry: datetime
    calendar_id: str = "primary"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        from_attributes = True


class TransportationNeed(str, Enum):
    """Transportation need detection"""
    NEEDED = "needed"
    NOT_NEEDED = "not_needed"
    MAYBE = "maybe"


class CalendarEventAnalysis(BaseModel):
    """Analysis of a calendar event for transportation needs"""
    event_id: str
    title: str
    start_time: datetime
    end_time: datetime
    location: Optional[str] = None
    transportation_needed: TransportationNeed
    confidence_score: float = Field(ge=0.0, le=1.0)
    reason: str
    distance_km: Optional[float] = None
    estimated_travel_time_min: Optional[int] = None
    ride_type: str = "instant"  # instant, scheduled
    estimated_fare: Optional[float] = None


class AutoBookingPreference(BaseModel):
    """User preferences for automatic ride booking"""
    user_id: str
    enabled: bool = True
    auto_book_threshold: float = Field(default=0.7, ge=0.0, le=1.0, description="Confidence threshold for auto-booking")
    preferred_ride_type: str = Field(default="instant", description="instant, scheduled")
    advance_booking_minutes: int = Field(default=30, description="Minutes before meeting to book ride")
    include_return_trip: bool = Field(default=False, description="Auto-book return trip")
    max_daily_auto_bookings: int = Field(default=5, description="Maximum auto-bookings per day")
    preferred_vehicle: Optional[str] = None
    payment_method: str = Field(default="wallet", description="wallet, credit_card")
    expense_code: Optional[str] = None  # For corporate billing
    special_requirements: List[str] = Field(default_factory=list)  # accessibility, child_seat, etc.
    
    class Config:
        from_attributes = True


class CalendarBooking(BaseModel):
    """Record of a calendar event booking"""
    id: Optional[str] = None
    user_id: str
    calendar_event_id: str
    calendar_event_title: str
    event_location: str
    event_start_time: datetime
    event_end_time: datetime
    meeting_address: Optional[str] = None  # Resolved address for location
    
    # Auto-booking details
    auto_booked: bool = True
    booking_id: Optional[str] = None  # Link to actual ride booking
    booking_status: str = "pending"  # pending, confirmed, cancelled, completed
    booking_created_at: datetime = Field(default_factory=datetime.utcnow)
    
    # Detection metrics
    transportation_confidence: float
    detection_reason: str
    
    # Trip details
    pickup_location: str
    dropoff_location: str
    estimated_fare: Optional[float] = None
    ride_type: str = "instant"
    
    # Timestamps
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        from_attributes = True


class LocationData(BaseModel):
    """Location information extracted from meeting"""
    address: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    place_id: Optional[str] = None  # Google Place ID
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None


class MeetingAnalysisRequest(BaseModel):
    """Request to analyze a meeting for transportation needs"""
    meeting_title: str
    meeting_location: str
    meeting_time: datetime
    current_location: Optional[LocationData] = None  # User's home/office location
    ride_preference: Optional[str] = None


class CalendarSyncResponse(BaseModel):
    """Response from calendar sync operation"""
    synced_events: int
    auto_booked_count: int
    bookings: List[CalendarBooking]
    skipped_events: int
    errors: List[Dict[str, Any]] = []
    sync_timestamp: datetime = Field(default_factory=datetime.utcnow)


class MeetingReminder(BaseModel):
    """Reminder for upcoming meeting with booking status"""
    event_id: str
    title: str
    start_time: datetime
    location: str
    ride_booked: bool
    booking_id: Optional[str] = None
    pickup_time: Optional[datetime] = None
    driver_eta: Optional[int] = None  # Minutes
    notification_sent: bool = False
