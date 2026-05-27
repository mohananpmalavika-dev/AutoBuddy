"""
Database Models for Passenger Features
Supports all 10 features: Ratings, Saved Places, Preferences, Scheduled Rides,
Payment Methods, Favorites, Promo Codes, Support, and Accessibility
"""

from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean, JSON, ForeignKey, Text, Enum, Table
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

Base = declarative_base()


# ============================================================================
# Feature #2: Passenger Ratings
# ============================================================================

class PassengerRating(Base):
    """Ratings given by passengers to drivers after trips"""
    __tablename__ = "passenger_ratings"

    id = Column(String, primary_key=True)
    passenger_id = Column(String, ForeignKey("passengers.id"), nullable=False, index=True)
    driver_id = Column(String, ForeignKey("drivers.id"), nullable=False, index=True)
    booking_id = Column(String, ForeignKey("bookings.id"), nullable=True, index=True)
    
    score = Column(Integer, nullable=False)  # 1-5 stars
    feedback = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    passenger = relationship("Passenger", back_populates="ratings_given", foreign_keys=[passenger_id])
    driver = relationship("Driver", back_populates="ratings_received", foreign_keys=[driver_id])
    booking = relationship("Booking", back_populates="rating")
    
    def to_dict(self):
        return {
            "id": self.id,
            "passenger_id": self.passenger_id,
            "driver_id": self.driver_id,
            "booking_id": self.booking_id,
            "score": self.score,
            "feedback": self.feedback,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


# ============================================================================
# Feature #3: Saved Places
# ============================================================================

class SavedPlace(Base):
    """Saved locations for passengers (home, work, favorites)"""
    __tablename__ = "saved_places"

    id = Column(String, primary_key=True)
    passenger_id = Column(String, ForeignKey("passengers.id"), nullable=False, index=True)
    
    name = Column(String, nullable=False)  # "Home", "Work", custom name
    address = Column(String, nullable=False)
    place_type = Column(String, nullable=False)  # "home", "work", "custom"
    
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    
    is_favorite = Column(Boolean, default=False, index=True)
    is_primary = Column(Boolean, default=False)  # Primary home/work location
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    passenger = relationship("Passenger", back_populates="saved_places")
    
    def to_dict(self):
        return {
            "id": self.id,
            "passenger_id": self.passenger_id,
            "name": self.name,
            "address": self.address,
            "place_type": self.place_type,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "is_favorite": self.is_favorite,
            "is_primary": self.is_primary,
            "created_at": self.created_at.isoformat(),
        }


# ============================================================================
# Feature #4: User Preferences
# ============================================================================

class PassengerPreferences(Base):
    """Passenger preferences and settings"""
    __tablename__ = "passenger_preferences"

    id = Column(String, primary_key=True)
    passenger_id = Column(String, ForeignKey("passengers.id"), nullable=False, unique=True, index=True)
    
    # Notification Preferences
    push_notifications = Column(Boolean, default=True)
    email_notifications = Column(Boolean, default=True)
    sms_notifications = Column(Boolean, default=True)
    promotional_offers = Column(Boolean, default=False)
    
    # Payment Preferences
    default_payment_method = Column(String, default="wallet")  # "wallet", "card", "upi"
    save_card_details = Column(Boolean, default=True)
    biometric_payment = Column(Boolean, default=False)
    
    # Privacy Preferences
    profile_public = Column(Boolean, default=False)
    share_location_with_driver = Column(Boolean, default=True)
    analytics_enabled = Column(Boolean, default=True)
    
    # Language & Locale
    language = Column(String, default="en")  # "en", "ml", etc.
    timezone = Column(String, nullable=True)
    
    # Additional settings as JSON
    additional_settings = Column(JSON, default={})
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    passenger = relationship("Passenger", back_populates="preferences")
    
    def to_dict(self):
        return {
            "id": self.id,
            "passenger_id": self.passenger_id,
            "push_notifications": self.push_notifications,
            "email_notifications": self.email_notifications,
            "sms_notifications": self.sms_notifications,
            "promotional_offers": self.promotional_offers,
            "default_payment_method": self.default_payment_method,
            "save_card_details": self.save_card_details,
            "biometric_payment": self.biometric_payment,
            "profile_public": self.profile_public,
            "share_location_with_driver": self.share_location_with_driver,
            "analytics_enabled": self.analytics_enabled,
            "language": self.language,
            "timezone": self.timezone,
            "additional_settings": self.additional_settings,
        }


# ============================================================================
# Feature #5: Scheduled Rides
# ============================================================================

class ScheduledRide(Base):
    """Future rides scheduled by passengers"""
    __tablename__ = "scheduled_rides"

    id = Column(String, primary_key=True)
    passenger_id = Column(String, ForeignKey("passengers.id"), nullable=False, index=True)
    
    pickup_location = Column(String, nullable=False)
    pickup_latitude = Column(Float, nullable=True)
    pickup_longitude = Column(Float, nullable=True)
    
    dropoff_location = Column(String, nullable=False)
    dropoff_latitude = Column(Float, nullable=True)
    dropoff_longitude = Column(Float, nullable=True)
    
    scheduled_time = Column(DateTime, nullable=False, index=True)
    ride_type = Column(String, nullable=False)  # "normal", "pool", "corporate", etc.
    
    status = Column(String, default="scheduled")  # "scheduled", "confirmed", "cancelled", "completed"
    notes = Column(Text, nullable=True)
    
    estimated_fare = Column(Float, nullable=True)
    recurring = Column(Boolean, default=False)  # For recurring rides (daily, weekly)
    recurrence_pattern = Column(String, nullable=True)  # "daily", "weekly", "monthly"
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    passenger = relationship("Passenger", back_populates="scheduled_rides")
    
    def to_dict(self):
        return {
            "id": self.id,
            "passenger_id": self.passenger_id,
            "pickup_location": self.pickup_location,
            "dropoff_location": self.dropoff_location,
            "scheduled_time": self.scheduled_time.isoformat(),
            "ride_type": self.ride_type,
            "status": self.status,
            "notes": self.notes,
            "estimated_fare": self.estimated_fare,
            "recurring": self.recurring,
            "recurrence_pattern": self.recurrence_pattern,
            "created_at": self.created_at.isoformat(),
        }


# ============================================================================
# Feature #6: Payment Methods
# ============================================================================

class PaymentMethod(Base):
    """Stored payment methods for passengers"""
    __tablename__ = "payment_methods"

    id = Column(String, primary_key=True)
    passenger_id = Column(String, ForeignKey("passengers.id"), nullable=False, index=True)
    
    method_type = Column(String, nullable=False)  # "card", "upi", "wallet", "bank_transfer"
    
    # Card details (encrypted)
    card_last_four = Column(String, nullable=True)  # Store only last 4 digits
    card_brand = Column(String, nullable=True)  # "visa", "mastercard", "amex"
    card_expiry = Column(String, nullable=True)  # MM/YY format
    card_holder_name = Column(String, nullable=True)
    
    # UPI details
    upi_id = Column(String, nullable=True)
    
    # Bank details
    bank_account_number = Column(String, nullable=True)  # Encrypted
    bank_ifsc = Column(String, nullable=True)
    bank_name = Column(String, nullable=True)
    
    is_default = Column(Boolean, default=False, index=True)
    is_active = Column(Boolean, default=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    passenger = relationship("Passenger", back_populates="payment_methods")
    
    def to_dict(self):
        return {
            "id": self.id,
            "passenger_id": self.passenger_id,
            "method_type": self.method_type,
            "card_last_four": self.card_last_four,
            "card_brand": self.card_brand,
            "upi_id": self.upi_id,
            "bank_name": self.bank_name,
            "is_default": self.is_default,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat(),
        }


class PassengerWallet(Base):
    """Passenger wallet balance and transactions"""
    __tablename__ = "passenger_wallets"

    id = Column(String, primary_key=True)
    passenger_id = Column(String, ForeignKey("passengers.id"), nullable=False, unique=True, index=True)
    
    balance = Column(Float, default=0.0)
    total_added = Column(Float, default=0.0)
    total_spent = Column(Float, default=0.0)
    
    last_transaction_at = Column(DateTime, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    passenger = relationship("Passenger", back_populates="wallet")
    transactions = relationship("WalletTransaction", back_populates="wallet")
    
    def to_dict(self):
        return {
            "id": self.id,
            "passenger_id": self.passenger_id,
            "balance": self.balance,
            "total_added": self.total_added,
            "total_spent": self.total_spent,
            "last_transaction_at": self.last_transaction_at.isoformat() if self.last_transaction_at else None,
        }


class WalletTransaction(Base):
    """Wallet transaction history"""
    __tablename__ = "wallet_transactions"

    id = Column(String, primary_key=True)
    wallet_id = Column(String, ForeignKey("passenger_wallets.id"), nullable=False, index=True)
    
    transaction_type = Column(String, nullable=False)  # "credit", "debit"
    amount = Column(Float, nullable=False)
    description = Column(String, nullable=True)  # "Ride fare", "Wallet topup", etc.
    
    booking_id = Column(String, nullable=True)
    payment_method_id = Column(String, nullable=True)
    
    balance_before = Column(Float, nullable=False)
    balance_after = Column(Float, nullable=False)
    
    status = Column(String, default="completed")  # "pending", "completed", "failed"
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Relationships
    wallet = relationship("PassengerWallet", back_populates="transactions")
    
    def to_dict(self):
        return {
            "id": self.id,
            "wallet_id": self.wallet_id,
            "transaction_type": self.transaction_type,
            "amount": self.amount,
            "description": self.description,
            "balance_after": self.balance_after,
            "status": self.status,
            "created_at": self.created_at.isoformat(),
        }


# ============================================================================
# Feature #7: Favorites & Emergency Contacts
# ============================================================================

class FavoriteDriver(Base):
    """Passenger's favorite drivers"""
    __tablename__ = "favorite_drivers"

    id = Column(String, primary_key=True)
    passenger_id = Column(String, ForeignKey("passengers.id"), nullable=False, index=True)
    driver_id = Column(String, ForeignKey("drivers.id"), nullable=False, index=True)
    
    added_at = Column(DateTime, default=datetime.utcnow, index=True)
    last_ride_with = Column(DateTime, nullable=True)
    ride_count_together = Column(Integer, default=1)

    passenger = relationship("Passenger", back_populates="favorite_drivers")
    driver = relationship("Driver", back_populates="favorited_by")
    
    def to_dict(self):
        return {
            "id": self.id,
            "passenger_id": self.passenger_id,
            "driver_id": self.driver_id,
            "ride_count_together": self.ride_count_together,
            "added_at": self.added_at.isoformat(),
        }


class EmergencyContact(Base):
    """Emergency contacts for passengers"""
    __tablename__ = "emergency_contacts"

    id = Column(String, primary_key=True)
    passenger_id = Column(String, ForeignKey("passengers.id"), nullable=False, index=True)
    
    contact_name = Column(String, nullable=False)
    phone_number = Column(String, nullable=False)
    relation = Column(String, nullable=True)  # "Family", "Friend", "Spouse", etc.
    
    is_primary = Column(Boolean, default=False)
    notify_on_rides = Column(Boolean, default=False)  # Notify during rides
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    passenger = relationship("Passenger", back_populates="emergency_contacts")
    
    def to_dict(self):
        return {
            "id": self.id,
            "passenger_id": self.passenger_id,
            "contact_name": self.contact_name,
            "phone_number": self.phone_number,
            "relation": self.relation,
            "is_primary": self.is_primary,
            "notify_on_rides": self.notify_on_rides,
        }


# ============================================================================
# Feature #8: Promo Codes
# ============================================================================

class PromoCode(Base):
    """Promotional codes for discounts"""
    __tablename__ = "promo_codes"

    id = Column(String, primary_key=True)
    code = Column(String, unique=True, nullable=False, index=True)
    
    discount_type = Column(String, nullable=False)  # "flat", "percentage"
    discount_value = Column(Float, nullable=False)
    
    min_ride_fare = Column(Float, default=0.0)
    max_discount = Column(Float, nullable=True)
    
    valid_from = Column(DateTime, nullable=False)
    valid_until = Column(DateTime, nullable=False, index=True)
    
    usage_limit = Column(Integer, nullable=True)  # Max number of uses overall
    usage_per_user = Column(Integer, default=1)  # Max uses per user
    
    is_active = Column(Boolean, default=True, index=True)
    description = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    usages = relationship("PromoCodeUsage", back_populates="promo_code")
    
    def to_dict(self):
        return {
            "id": self.id,
            "code": self.code,
            "discount_type": self.discount_type,
            "discount_value": self.discount_value,
            "min_ride_fare": self.min_ride_fare,
            "max_discount": self.max_discount,
            "is_active": self.is_active,
            "description": self.description,
        }


class PromoCodeUsage(Base):
    """Track promo code usage by passengers"""
    __tablename__ = "promo_code_usages"

    id = Column(String, primary_key=True)
    promo_code_id = Column(String, ForeignKey("promo_codes.id"), nullable=False, index=True)
    passenger_id = Column(String, nullable=False, index=True)
    booking_id = Column(String, nullable=True, index=True)
    
    discount_amount = Column(Float, nullable=False)
    
    used_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    promo_code = relationship("PromoCode", back_populates="usages")
    
    def to_dict(self):
        return {
            "id": self.id,
            "promo_code_id": self.promo_code_id,
            "passenger_id": self.passenger_id,
            "discount_amount": self.discount_amount,
            "used_at": self.used_at.isoformat(),
        }


# ============================================================================
# Feature #9: Support Tickets
# ============================================================================

class SupportTicket(Base):
    """Customer support tickets"""
    __tablename__ = "support_tickets"

    id = Column(String, primary_key=True)
    passenger_id = Column(String, ForeignKey("passengers.id"), nullable=False, index=True)
    
    subject = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    category = Column(String, nullable=False)  # "booking", "payment", "driver", "safety", "other"
    
    status = Column(String, default="open")  # "open", "in_progress", "waiting_for_user", "resolved", "closed"
    priority = Column(String, default="normal")  # "low", "normal", "high", "urgent"
    
    assigned_to = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    
    passenger = relationship("Passenger", back_populates="support_tickets")
    messages = relationship("TicketMessage", back_populates="ticket", cascade="all, delete-orphan")

    @property
    def message_count(self):
        return len(self.messages or [])
    
    def to_dict(self):
        return {
            "id": self.id,
            "passenger_id": self.passenger_id,
            "subject": self.subject,
            "description": self.description,
            "category": self.category,
            "status": self.status,
            "priority": self.priority,
            "message_count": self.message_count,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class TicketMessage(Base):
    """Messages in support tickets"""
    __tablename__ = "ticket_messages"

    id = Column(String, primary_key=True)
    ticket_id = Column(String, ForeignKey("support_tickets.id"), nullable=False, index=True)
    
    sender_type = Column(String, nullable=False)  # "passenger", "agent"
    sender_id = Column(String, nullable=False)
    sender_name = Column(String, nullable=True)
    
    message_text = Column(Text, nullable=False)
    attachment_url = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Relationships
    ticket = relationship("SupportTicket", back_populates="messages")
    
    def to_dict(self):
        return {
            "id": self.id,
            "ticket_id": self.ticket_id,
            "sender_type": self.sender_type,
            "sender_name": self.sender_name,
            "message_text": self.message_text,
            "created_at": self.created_at.isoformat(),
        }


# ============================================================================
# Feature #10: Accessibility Settings
# ============================================================================

class AccessibilitySetting(Base):
    """Accessibility preferences for passengers"""
    __tablename__ = "accessibility_settings"

    id = Column(String, primary_key=True)
    passenger_id = Column(String, ForeignKey("passengers.id"), nullable=False, unique=True, index=True)
    
    text_size = Column(String, default="normal")  # "small", "normal", "large", "extra_large"
    high_contrast = Column(Boolean, default=False)
    screen_reader_enabled = Column(Boolean, default=False)
    haptic_feedback = Column(Boolean, default=True)
    reduce_motion = Column(Boolean, default=False)
    voice_guidance = Column(Boolean, default=False)
    
    voice_guidance_speed = Column(Float, default=1.0)  # Playback speed for voice
    voice_guidance_language = Column(String, default="en")
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    passenger = relationship("Passenger", back_populates="accessibility_settings")
    
    def to_dict(self):
        return {
            "id": self.id,
            "passenger_id": self.passenger_id,
            "text_size": self.text_size,
            "high_contrast": self.high_contrast,
            "screen_reader_enabled": self.screen_reader_enabled,
            "haptic_feedback": self.haptic_feedback,
            "reduce_motion": self.reduce_motion,
            "voice_guidance": self.voice_guidance,
            "voice_guidance_speed": self.voice_guidance_speed,
        }


