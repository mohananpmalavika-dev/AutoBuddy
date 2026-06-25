"""ORM model exports used by the v2 SQLAlchemy routers."""

from sqlalchemy import Column, String, DateTime, Float, Enum as SQLEnum
from sqlalchemy.ext.declarative import declarative_base
from datetime import datetime
import enum

from app.models.vehicle_platform import (
    Base,
    DispatchPreference,
    DriverVehicleCertification,
    RidePricingOverride,
    RideProduct,
    VehicleInventory,
    VehicleType,
)


# Stub models for AI Visibility Router
# These are minimal implementations to prevent import errors
class User(Base):
    """User model stub for AI visibility tracking"""
    __tablename__ = "users_ai_visibility"
    
    id = Column(String, primary_key=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RideStatus(str, enum.Enum):
    """Ride status enum"""
    PENDING = "pending"
    CONFIRMED = "confirmed"
    STARTED = "started"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class RideHistory(Base):
    """Ride history model stub for AI pattern recognition"""
    __tablename__ = "rides_ai_history"
    
    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=False)
    pickup_location = Column(String)
    dropoff_location = Column(String)
    pickup_lat = Column(Float)
    pickup_lng = Column(Float)
    dropoff_lat = Column(Float)
    dropoff_lng = Column(Float)
    status = Column(SQLEnum(RideStatus), default=RideStatus.PENDING)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Weather(Base):
    """Weather model stub for AI alerts"""
    __tablename__ = "weather_ai_alerts"
    
    id = Column(String, primary_key=True)
    location = Column(String)
    latitude = Column(Float)
    longitude = Column(Float)
    condition = Column(String)  # sunny, rainy, cloudy, etc.
    temperature = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)


__all__ = [
    "Base",
    "DispatchPreference",
    "DriverVehicleCertification",
    "RidePricingOverride",
    "RideProduct",
    "VehicleInventory",
    "VehicleType",
    # AI Visibility stubs
    "User",
    "RideHistory",
    "Weather",
    "RideStatus",
    # Road hazards
    "RoadHazard",
    "HazardReport",
]
