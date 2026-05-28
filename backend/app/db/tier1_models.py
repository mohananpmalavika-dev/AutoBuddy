"""
Database Models for TIER 1 Driver Features
- GPS Location Tracking
- SOS Emergency Alerts
- Expense Tracking
"""

from sqlalchemy import Column, String, Integer, Float, DateTime, Boolean, Text, ForeignKey, Index, Enum
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta, timezone
import enum

Base = declarative_base()

# IST Timezone and helper
IST_TZ = timezone(timedelta(hours=5, minutes=30))
def get_ist_now():
    """Returns current time in IST timezone."""
    return datetime.now(IST_TZ)


# ============================================================================
# TIER 1 Feature #1: Real-Time GPS Tracking
# ============================================================================

class DriverGPSLocation(Base):
    """Real-time GPS location tracking for drivers during active rides"""
    __tablename__ = "driver_gps_locations"

    id = Column(String, primary_key=True)
    driver_id = Column(String, nullable=False, index=True)
    ride_id = Column(String, nullable=True, index=True)  # NULL if not in active ride
    
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    accuracy = Column(Float, nullable=True)  # GPS accuracy in meters
    speed = Column(Float, nullable=True)  # Speed in km/h
    altitude = Column(Float, nullable=True)  # Height above sea level
    
    address = Column(String, nullable=True)  # Reverse geocoded address
    
    created_at = Column(DateTime, default=get_ist_now, index=True)
    
    # Composite index for efficient queries
    __table_args__ = (
        Index('ix_driver_location_ride_time', 'driver_id', 'ride_id', 'created_at'),
        Index('ix_driver_location_recent', 'driver_id', 'created_at', mysql_length={'driver_id': 50}),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "driver_id": self.driver_id,
            "ride_id": self.ride_id,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "accuracy": self.accuracy,
            "speed": self.speed,
            "altitude": self.altitude,
            "address": self.address,
            "created_at": self.created_at.isoformat(),
        }


# ============================================================================
# TIER 1 Feature #2: SOS Emergency Alerts
# ============================================================================

class SOSStatus(str, enum.Enum):
    """SOS alert status"""
    ACTIVE = "active"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    CANCELLED = "cancelled"
    FALSE_ALARM = "false_alarm"


class SOSAlert(Base):
    """Emergency SOS alerts triggered by drivers"""
    __tablename__ = "sos_alerts"

    id = Column(String, primary_key=True)
    driver_id = Column(String, nullable=False, index=True)
    ride_id = Column(String, nullable=True, index=True)
    
    reason = Column(String, nullable=False)  # "emergency", "accident", "medical", "harassment", "other"
    description = Column(Text, nullable=True)
    
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    address = Column(String, nullable=True)
    
    status = Column(String, default=SOSStatus.ACTIVE.value, index=True)
    
    # Emergency contacts notified
    authorities_notified = Column(Boolean, default=False)
    admin_notified = Column(Boolean, default=False)
    passenger_notified = Column(Boolean, default=False)
    
    # Contact information for authorities
    contact_phone = Column(String, nullable=True)
    contact_name = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=get_ist_now, index=True)
    acknowledged_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    
    # Track response time
    response_time_minutes = Column(Float, nullable=True)
    
    __table_args__ = (
        Index('ix_sos_driver_status', 'driver_id', 'status'),
        Index('ix_sos_recent', 'created_at'),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "driver_id": self.driver_id,
            "ride_id": self.ride_id,
            "reason": self.reason,
            "description": self.description,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "address": self.address,
            "status": self.status,
            "authorities_notified": self.authorities_notified,
            "admin_notified": self.admin_notified,
            "passenger_notified": self.passenger_notified,
            "contact_phone": self.contact_phone,
            "contact_name": self.contact_name,
            "created_at": self.created_at.isoformat(),
            "acknowledged_at": self.acknowledged_at.isoformat() if self.acknowledged_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "response_time_minutes": self.response_time_minutes,
        }


# ============================================================================
# TIER 1 Feature #3: Expense Tracking
# ============================================================================

class ExpenseType(str, enum.Enum):
    """Types of expenses drivers can track"""
    TOLL = "toll"
    PARKING = "parking"
    FUEL = "fuel"
    MAINTENANCE = "maintenance"
    OTHER = "other"


class DriverExpense(Base):
    """Expenses tracked by drivers for each ride"""
    __tablename__ = "driver_expenses"

    id = Column(String, primary_key=True)
    ride_id = Column(String, nullable=False, index=True)
    driver_id = Column(String, nullable=False, index=True)
    
    expense_type = Column(String, nullable=False)  # From ExpenseType enum
    amount = Column(Float, nullable=False)  # Amount in currency units (e.g., INR)
    description = Column(Text, nullable=True)
    receipt_url = Column(String, nullable=True)  # URL to receipt image
    
    created_at = Column(DateTime, default=get_ist_now, index=True)
    updated_at = Column(DateTime, default=get_ist_now, onupdate=get_ist_now)
    
    __table_args__ = (
        Index('ix_expense_ride', 'ride_id'),
        Index('ix_expense_driver', 'driver_id', 'created_at'),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "ride_id": self.ride_id,
            "driver_id": self.driver_id,
            "expense_type": self.expense_type,
            "amount": self.amount,
            "description": self.description,
            "receipt_url": self.receipt_url,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


# ============================================================================
# Statistics and Aggregates
# ============================================================================

class DriverLocationStats(Base):
    """Aggregated statistics for driver locations (for analytics)"""
    __tablename__ = "driver_location_stats"

    id = Column(String, primary_key=True)
    driver_id = Column(String, nullable=False, index=True)
    date = Column(String, nullable=False, index=True)  # YYYY-MM-DD
    
    total_distance_km = Column(Float, default=0.0)
    avg_speed_kmh = Column(Float, nullable=True)
    max_speed_kmh = Column(Float, nullable=True)
    min_speed_kmh = Column(Float, nullable=True)
    
    active_hours = Column(Float, default=0.0)
    rides_completed = Column(Integer, default=0)
    
    created_at = Column(DateTime, default=get_ist_now)
    updated_at = Column(DateTime, default=get_ist_now, onupdate=get_ist_now)
    
    __table_args__ = (
        Index('ix_driver_stats_date', 'driver_id', 'date'),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "driver_id": self.driver_id,
            "date": self.date,
            "total_distance_km": self.total_distance_km,
            "avg_speed_kmh": self.avg_speed_kmh,
            "max_speed_kmh": self.max_speed_kmh,
            "min_speed_kmh": self.min_speed_kmh,
            "active_hours": self.active_hours,
            "rides_completed": self.rides_completed,
        }
