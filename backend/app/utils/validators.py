"""
Comprehensive validation utilities for production
Provides validators for common data types and business logic
"""
from pydantic import BaseModel, field_validator, model_validator
from typing import Optional, List
from datetime import datetime
from app.utils.time_helpers import get_ist_now
import re
from enum import Enum


class ValidationError(Exception):
    """Custom validation error"""
    def __init__(self, field: str, message: str):
        self.field = field
        self.message = message
        super().__init__(f"{field}: {message}")


class Validators:
    """Collection of reusable validators"""
    
    @staticmethod
    def validate_email(email: str) -> bool:
        """Validate email address format"""
        pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        return bool(re.match(pattern, email))
    
    @staticmethod
    def validate_phone(phone: str, country_code: str = "+91") -> bool:
        """Validate phone number format"""
        phone = phone.strip()
        # Remove common separators
        phone = re.sub(r'[\s\-\(\)\.]+', '', phone)
        
        # Check length (10-15 digits for international)
        if not (10 <= len(phone) <= 15):
            return False
        
        # Must contain only digits
        return bool(re.match(r'^\d{10,15}$', phone))
    
    @staticmethod
    def validate_url(url: str) -> bool:
        """Validate URL format"""
        pattern = r'^https?://[^\s/$.?#].[^\s]*$'
        return bool(re.match(pattern, url, re.IGNORECASE))
    
    @staticmethod
    def validate_coordinate(value: float, coord_type: str = "latitude") -> bool:
        """Validate latitude/longitude coordinates"""
        if coord_type.lower() == "latitude":
            return -90 <= value <= 90
        elif coord_type.lower() == "longitude":
            return -180 <= value <= 180
        return False
    
    @staticmethod
    def validate_currency_amount(amount: float, min_value: float = 0, max_value: float = 1_000_000) -> bool:
        """Validate currency amount"""
        if not isinstance(amount, (int, float)):
            return False
        
        if amount < min_value or amount > max_value:
            return False
        
        # Check decimal places (max 2 for currency)
        if amount != round(amount, 2):
            return False
        
        return True
    
    @staticmethod
    def validate_datetime_range(start: datetime, end: datetime) -> bool:
        """Validate start date is before end date"""
        return start < end
    
    @staticmethod
    def validate_future_datetime(dt: datetime) -> bool:
        """Validate datetime is in the future"""
        return dt > get_ist_now()
    
    @staticmethod
    def validate_past_datetime(dt: datetime) -> bool:
        """Validate datetime is in the past"""
        return dt < get_ist_now()
    
    @staticmethod
    def validate_password_strength(password: str, min_length: int = 8) -> tuple[bool, str]:
        """
        Validate password strength
        Returns: (is_valid, error_message)
        """
        if len(password) < min_length:
            return False, f"Password must be at least {min_length} characters"
        
        if not re.search(r'[a-z]', password):
            return False, "Password must contain lowercase letters"
        
        if not re.search(r'[A-Z]', password):
            return False, "Password must contain uppercase letters"
        
        if not re.search(r'\d', password):
            return False, "Password must contain numbers"
        
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', password):
            return False, "Password must contain special characters"
        
        return True, ""
    
    @staticmethod
    def validate_alphanumeric(value: str, allow_spaces: bool = False, allow_special: List[str] = None) -> bool:
        """Validate alphanumeric string"""
        pattern = r'^[a-zA-Z0-9'
        if allow_spaces:
            pattern += r'\s'
        if allow_special:
            pattern += re.escape(''.join(allow_special))
        pattern += r']+$'
        
        return bool(re.match(pattern, value))
    
    @staticmethod
    def validate_length(value: str, min_length: int = 0, max_length: int = None) -> bool:
        """Validate string length"""
        length = len(value)
        if length < min_length:
            return False
        
        if max_length and length > max_length:
            return False
        
        return True
    
    @staticmethod
    def validate_enum_value(value: str, valid_values: List[str]) -> bool:
        """Validate value is in enum"""
        return value in valid_values
    
    @staticmethod
    def validate_json_serializable(obj: any) -> bool:
        """Validate object is JSON serializable"""
        import json
        try:
            json.dumps(obj)
            return True
        except (TypeError, ValueError):
            return False
    
    @staticmethod
    def validate_uuid(value: str) -> bool:
        """Validate UUID format"""
        pattern = r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        return bool(re.match(pattern, value, re.IGNORECASE))


# Pydantic validator definitions
class EmailField(BaseModel):
    """Pydantic model for email validation"""
    email: str
    
    @field_validator('email')
    @classmethod
    def validate_email(cls, v):
        if not Validators.validate_email(v):
            raise ValueError('Invalid email format')
        return v.lower()


class PhoneField(BaseModel):
    """Pydantic model for phone validation"""
    phone: str
    country_code: str = "+91"
    
    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v, info):
        country = info.data.get('country_code', "+91")
        if not Validators.validate_phone(v, country):
            raise ValueError('Invalid phone format')
        return v.strip()


class CurrencyAmount(BaseModel):
    """Pydantic model for currency validation"""
    amount: float
    currency: str = "INR"
    
    @field_validator('amount')
    @classmethod
    def validate_amount(cls, v):
        if not Validators.validate_currency_amount(v):
            raise ValueError('Invalid currency amount')
        return round(v, 2)


class CoordinatePair(BaseModel):
    """Pydantic model for latitude/longitude validation"""
    latitude: float
    longitude: float
    
    @field_validator('latitude')
    @classmethod
    def validate_latitude(cls, v):
        if not Validators.validate_coordinate(v, "latitude"):
            raise ValueError('Latitude must be between -90 and 90')
        return v
    
    @field_validator('longitude')
    @classmethod
    def validate_longitude(cls, v):
        if not Validators.validate_coordinate(v, "longitude"):
            raise ValueError('Longitude must be between -180 and 180')
        return v


class DateRangeModel(BaseModel):
    """Pydantic model for date range validation"""
    start_date: datetime
    end_date: datetime
    
    @model_validator(mode='after')
    def validate_date_range(self):
        if not Validators.validate_datetime_range(self.start_date, self.end_date):
            raise ValueError('start_date must be before end_date')
        return self


class PasswordModel(BaseModel):
    """Pydantic model for password validation"""
    password: str
    
    @field_validator('password')
    @classmethod
    def validate_password(cls, v):
        is_valid, error_msg = Validators.validate_password_strength(v)
        if not is_valid:
            raise ValueError(error_msg)
        return v


# Business Logic Validators
class BookingValidator:
    """Validators for booking operations"""
    
    @staticmethod
    def validate_booking_creation(
        pickup_lat: float,
        pickup_lng: float,
        dropoff_lat: float,
        dropoff_lng: float,
        scheduled_time: Optional[datetime] = None
    ) -> tuple[bool, Optional[str]]:
        """Validate booking creation inputs"""
        
        # Validate coordinates
        if not (Validators.validate_coordinate(pickup_lat, "latitude") and 
                Validators.validate_coordinate(pickup_lng, "longitude")):
            return False, "Invalid pickup coordinates"
        
        if not (Validators.validate_coordinate(dropoff_lat, "latitude") and 
                Validators.validate_coordinate(dropoff_lng, "longitude")):
            return False, "Invalid dropoff coordinates"
        
        # Validate locations are different
        if pickup_lat == dropoff_lat and pickup_lng == dropoff_lng:
            return False, "Pickup and dropoff locations must be different"
        
        # Validate scheduled time if provided
        if scheduled_time:
            if not Validators.validate_future_datetime(scheduled_time):
                return False, "Scheduled time must be in the future"
        
        return True, None
    
    @staticmethod
    def validate_ride_start(ride_status: str) -> tuple[bool, Optional[str]]:
        """Validate ride can be started"""
        valid_statuses = ["accepted"]
        if ride_status not in valid_statuses:
            return False, f"Ride status must be one of {valid_statuses}, got {ride_status}"
        
        return True, None
    
    @staticmethod
    def validate_ride_end(ride_status: str, start_time: datetime) -> tuple[bool, Optional[str]]:
        """Validate ride can be ended"""
        valid_statuses = ["in_progress"]
        if ride_status not in valid_statuses:
            return False, f"Ride must be in_progress to end, got {ride_status}"
        
        # Validate ride has been active
        duration = get_ist_now() - start_time
        if duration.total_seconds() < 60:  # At least 1 minute
            return False, "Ride must be active for at least 1 minute"
        
        return True, None


class PaymentValidator:
    """Validators for payment operations"""
    
    @staticmethod
    def validate_payment_amount(amount: float, ride_fare: float) -> tuple[bool, Optional[str]]:
        """Validate payment amount matches ride fare"""
        
        if amount <= 0:
            return False, "Payment amount must be positive"
        
        # Allow 5% variance for rounding
        variance = ride_fare * 0.05
        if not (ride_fare - variance <= amount <= ride_fare + variance):
            return False, f"Payment amount must be approximately {ride_fare}"
        
        return True, None
    
    @staticmethod
    def validate_refund_amount(refund_amount: float, original_amount: float, already_refunded: float = 0) -> tuple[bool, Optional[str]]:
        """Validate refund amount"""
        
        if refund_amount <= 0:
            return False, "Refund amount must be positive"
        
        available_for_refund = original_amount - already_refunded
        
        if refund_amount > available_for_refund:
            return False, f"Refund amount exceeds available ({available_for_refund})"
        
        return True, None


class SupportTicketValidator:
    """Validators for support ticket operations"""
    
    @staticmethod
    def validate_ticket_escalation(
        current_level: str,
        target_level: str,
        valid_levels: List[str]
    ) -> tuple[bool, Optional[str]]:
        """Validate ticket escalation"""
        
        if current_level not in valid_levels or target_level not in valid_levels:
            return False, f"Invalid escalation level"
        
        current_idx = valid_levels.index(current_level)
        target_idx = valid_levels.index(target_level)
        
        if target_idx <= current_idx:
            return False, "Can only escalate to higher levels"
        
        return True, None
    
    @staticmethod
    def validate_ticket_subject(subject: str, min_length: int = 5, max_length: int = 200) -> tuple[bool, Optional[str]]:
        """Validate ticket subject"""
        
        if not Validators.validate_length(subject, min_length, max_length):
            return False, f"Subject must be between {min_length} and {max_length} characters"
        
        if not Validators.validate_alphanumeric(subject, allow_spaces=True, allow_special=['!', '?', '-', '.']):
            return False, "Subject contains invalid characters"
        
        return True, None
