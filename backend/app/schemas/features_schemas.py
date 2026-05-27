"""
Pydantic schemas for all passenger features
Used for request/response validation
"""

from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import datetime
from enum import Enum


# ============================================================================
# Feature #2: Ratings Schemas
# ============================================================================

class RatingCreate(BaseModel):
    driver_id: str
    booking_id: Optional[str] = None
    score: int = Field(..., ge=1, le=5)
    feedback: Optional[str] = None


class RatingUpdate(BaseModel):
    score: Optional[int] = Field(default=None, ge=1, le=5)
    feedback: Optional[str] = None


class RatingResponse(BaseModel):
    id: str
    passenger_id: str
    driver_id: str
    booking_id: Optional[str]
    score: int
    feedback: Optional[str]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# ============================================================================
# Feature #3: Saved Places Schemas
# ============================================================================

class SavedPlaceCreate(BaseModel):
    name: str
    address: str
    place_type: str  # "home", "work", "custom"
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_favorite: Optional[bool] = False
    is_primary: Optional[bool] = False


class SavedPlaceResponse(BaseModel):
    id: str
    passenger_id: str
    name: str
    address: str
    place_type: str
    latitude: Optional[float]
    longitude: Optional[float]
    is_favorite: bool
    is_primary: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


# ============================================================================
# Feature #4: Preferences Schemas
# ============================================================================

class PreferencesUpdate(BaseModel):
    push_notifications: Optional[bool] = None
    email_notifications: Optional[bool] = None
    sms_notifications: Optional[bool] = None
    promotional_offers: Optional[bool] = None
    default_payment_method: Optional[str] = None
    save_card_details: Optional[bool] = None
    biometric_payment: Optional[bool] = None
    profile_public: Optional[bool] = None
    share_location_with_driver: Optional[bool] = None
    analytics_enabled: Optional[bool] = None
    language: Optional[str] = None
    timezone: Optional[str] = None


class PreferencesResponse(BaseModel):
    id: str
    passenger_id: str
    push_notifications: bool
    email_notifications: bool
    sms_notifications: bool
    promotional_offers: bool
    default_payment_method: str
    save_card_details: bool
    biometric_payment: bool
    profile_public: bool
    share_location_with_driver: bool
    analytics_enabled: bool
    language: str
    timezone: Optional[str]
    
    class Config:
        from_attributes = True


# ============================================================================
# Feature #5: Scheduled Rides Schemas
# ============================================================================

class ScheduledRideCreate(BaseModel):
    pickup_location: str
    pickup_latitude: Optional[float] = None
    pickup_longitude: Optional[float] = None
    dropoff_location: str
    dropoff_latitude: Optional[float] = None
    dropoff_longitude: Optional[float] = None
    scheduled_time: datetime
    ride_type: str
    notes: Optional[str] = None
    recurring: Optional[bool] = False
    recurrence_pattern: Optional[str] = None


class ScheduledRideResponse(BaseModel):
    id: str
    passenger_id: str
    pickup_location: str
    dropoff_location: str
    scheduled_time: datetime
    ride_type: str
    status: str
    notes: Optional[str]
    estimated_fare: Optional[float]
    recurring: bool
    recurrence_pattern: Optional[str]
    created_at: datetime
    
    class Config:
        from_attributes = True


# ============================================================================
# Feature #6: Payment Methods Schemas
# ============================================================================

class PaymentMethodCreate(BaseModel):
    method_type: str  # "card", "upi", "wallet", "bank_transfer"
    card_last_four: Optional[str] = None
    card_brand: Optional[str] = None
    card_expiry: Optional[str] = None
    upi_id: Optional[str] = None
    bank_name: Optional[str] = None
    is_default: Optional[bool] = False


class PaymentMethodResponse(BaseModel):
    id: str
    passenger_id: str
    method_type: str
    card_last_four: Optional[str]
    card_brand: Optional[str]
    card_expiry: Optional[str] = None
    upi_id: Optional[str]
    bank_name: Optional[str]
    is_default: bool
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class WalletResponse(BaseModel):
    id: str
    passenger_id: str
    balance: float
    total_added: float
    total_spent: float
    last_transaction_at: Optional[datetime]
    
    class Config:
        from_attributes = True


class WalletTransactionResponse(BaseModel):
    id: str
    wallet_id: str
    transaction_type: str
    amount: float
    description: Optional[str]
    balance_after: float
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True


# ============================================================================
# Feature #7: Favorites & Emergency Contacts Schemas
# ============================================================================

class FavoriteDriverResponse(BaseModel):
    id: str
    passenger_id: str
    driver_id: str
    ride_count_together: int
    added_at: datetime
    
    class Config:
        from_attributes = True


class EmergencyContactCreate(BaseModel):
    contact_name: str
    phone_number: str
    relation: Optional[str] = None
    is_primary: Optional[bool] = False
    notify_on_rides: Optional[bool] = False


class EmergencyContactResponse(BaseModel):
    id: str
    passenger_id: str
    contact_name: str
    phone_number: str
    relation: Optional[str]
    is_primary: bool
    notify_on_rides: bool
    
    class Config:
        from_attributes = True


# ============================================================================
# Feature #8: Promo Codes Schemas
# ============================================================================

class PromoCodeValidateRequest(BaseModel):
    code: str
    ride_fare: float = Field(..., gt=0)


class PromoCodeResponse(BaseModel):
    id: str
    code: str
    discount_type: str
    discount_value: float
    min_ride_fare: float
    max_discount: Optional[float]
    is_active: bool
    description: Optional[str]
    
    class Config:
        from_attributes = True


class PromoCodeUsageResponse(BaseModel):
    id: str
    promo_code_id: str
    passenger_id: str
    discount_amount: float
    used_at: datetime
    
    class Config:
        from_attributes = True


# ============================================================================
# Feature #9: Support Tickets Schemas
# ============================================================================

class TicketMessageCreate(BaseModel):
    message_text: str
    attachment_url: Optional[str] = None


class TicketMessageResponse(BaseModel):
    id: str
    ticket_id: str
    sender_type: str
    sender_name: Optional[str]
    message_text: str
    attachment_url: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class SupportTicketCreate(BaseModel):
    subject: str
    description: str
    category: str  # "booking", "payment", "driver", "safety", "other"
    priority: Optional[str] = "normal"  # "low", "normal", "high", "urgent"


class SupportTicketStatusUpdate(BaseModel):
    status: str


class SupportTicketResponse(BaseModel):
    id: str
    passenger_id: str
    subject: str
    description: str
    category: str
    status: str
    priority: str
    message_count: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class SupportTicketDetailResponse(SupportTicketResponse):
    messages: List[TicketMessageResponse] = []


# ============================================================================
# Feature #10: Accessibility Settings Schemas
# ============================================================================

class AccessibilitySettingsUpdate(BaseModel):
    text_size: Optional[str] = None  # "small", "normal", "large", "extra_large"
    high_contrast: Optional[bool] = None
    screen_reader_enabled: Optional[bool] = None
    haptic_feedback: Optional[bool] = None
    reduce_motion: Optional[bool] = None
    voice_guidance: Optional[bool] = None
    voice_guidance_speed: Optional[float] = None
    voice_guidance_language: Optional[str] = None


class AccessibilitySettingsResponse(BaseModel):
    id: str
    passenger_id: str
    text_size: str
    high_contrast: bool
    screen_reader_enabled: bool
    haptic_feedback: bool
    reduce_motion: bool
    voice_guidance: bool
    voice_guidance_speed: float
    voice_guidance_language: str
    
    class Config:
        from_attributes = True
