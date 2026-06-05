"""
Airport Ride System Models
Pydantic validation models for airport terminal rides and operations
"""

from pydantic import BaseModel, Field, validator
from datetime import datetime
from .models_features import get_ist_now
from typing import List, Optional, Dict
from enum import Enum


# ============================================================================
# ENUMS
# ============================================================================

class AirportTerminalType(str, Enum):
    """Airport terminal types."""
    DOMESTIC = "domestic"
    INTERNATIONAL = "international"
    MIXED = "mixed"


class FlightStatus(str, Enum):
    """Flight status values."""
    SCHEDULED = "scheduled"
    DELAYED = "delayed"
    BOARDING = "boarding"
    DEPARTED = "departed"
    LANDED = "landed"
    CANCELLED = "cancelled"


class RidePhaseType(str, Enum):
    """Ride phases in airport context."""
    PRE_FLIGHT = "pre_flight"      # Before flight
    POST_FLIGHT = "post_flight"    # After flight
    SHUTTLE = "shuttle"
    PARKING = "parking"


class ParkingSpaceStatus(str, Enum):
    """Parking space occupancy status."""
    AVAILABLE = "available"
    OCCUPIED = "occupied"
    RESERVED = "reserved"
    MAINTENANCE = "maintenance"


# ============================================================================
# MODELS
# ============================================================================

class AirportTerminal(BaseModel):
    """Airport terminal information."""
    terminal_id: str = Field(default_factory=lambda: f"term_{id(object())%10000}", description="Terminal identifier")
    airport_code: str = Field(..., description="IATA airport code (BLR, DEL, etc.)")
    terminal_name: str = Field(..., description="Terminal name")
    terminal_type: AirportTerminalType = Field(default=AirportTerminalType.MIXED)
    city: str = Field(..., description="City name")
    address: str = Field(..., description="Terminal address")
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    gates_count: int = Field(ge=0, description="Number of gates")
    parking_spaces: int = Field(ge=0)
    operating_hours_start: str = Field(default="00:00")  # HH:MM format
    operating_hours_end: str = Field(default="23:59")
    average_passengers_daily: int = Field(ge=0)
    
    class Config:
        json_schema_extra = {
            "example": {
                "airport_code": "BLR",
                "terminal_name": "Terminal 1",
                "terminal_type": "international",
                "city": "Bangalore",
                "latitude": 13.1986,
                "longitude": 77.7064,
                "gates_count": 45,
                "parking_spaces": 500
            }
        }


class FlightData(BaseModel):
    """Real-time flight information."""
    flight_id: str = Field(..., description="Unique flight identifier")
    flight_number: str = Field(..., description="Airline flight number (e.g., AI123)")
    airline: str = Field(..., description="Airline name")
    departure_city: str = Field(..., description="Departure city")
    arrival_city: str = Field(..., description="Arrival city")
    departure_time: datetime = Field(...)
    arrival_time: Optional[datetime] = None
    flight_status: FlightStatus = Field(default=FlightStatus.SCHEDULED)
    gate_number: Optional[str] = None
    terminal_id: str = Field(...)
    expected_passengers: int = Field(ge=0)
    
    class Config:
        json_schema_extra = {
            "example": {
                "flight_number": "AI123",
                "airline": "Air India",
                "departure_city": "Mumbai",
                "arrival_city": "Bangalore",
                "flight_status": "scheduled",
                "expected_passengers": 180
            }
        }


class AirportRideRequest(BaseModel):
    """Airport-specific ride request with flight integration."""
    ride_id: str = Field(default_factory=lambda: f"aride_{id(object())%10000}")
    passenger_name: str = Field(...)
    phone_number: str = Field(...)
    email: Optional[str] = None
    flight_id: Optional[str] = None  # Link to flight data
    flight_number: Optional[str] = None
    ride_phase: RidePhaseType = Field(default=RidePhaseType.PRE_FLIGHT)
    pickup_location: str = Field(...)
    dropoff_location: str = Field(...)
    pickup_latitude: float = Field(ge=-90, le=90)
    pickup_longitude: float = Field(ge=-180, le=180)
    dropoff_latitude: float = Field(ge=-90, le=90)
    dropoff_longitude: float = Field(ge=-180, le=180)
    terminal_id: str = Field(...)
    ride_type: str = Field(default="economy")  # economy, premium, xl
    estimated_fare: float = Field(ge=0)
    luggage_count: int = Field(ge=0, default=0)
    passengers_count: int = Field(ge=1, le=6, default=1)
    special_requests: Optional[str] = None
    ride_status: str = Field(default="requested")  # requested, accepted, in_progress, completed, cancelled
    scheduled_pickup_time: Optional[datetime] = None
    actual_pickup_time: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    driver_id: Optional[str] = None
    rating: Optional[float] = Field(None, ge=1, le=5)
    created_at: datetime = Field(default_factory=get_ist_now)
    
    class Config:
        json_schema_extra = {
            "example": {
                "passenger_name": "John Doe",
                "phone_number": "+919876543210",
                "flight_number": "AI123",
                "ride_phase": "pre_flight",
                "pickup_location": "Home",
                "dropoff_location": "BLR Terminal 1",
                "luggage_count": 2,
                "passengers_count": 2
            }
        }


class ParkingSpot(BaseModel):
    """Airport parking spot tracking."""
    spot_id: str = Field(default_factory=lambda: f"spot_{id(object())%10000}")
    terminal_id: str = Field(...)
    spot_number: str = Field(...)
    level: int = Field(ge=0, description="Parking level (0=ground)")
    space_type: str = Field(default="regular")  # regular, compact, handicap, ev_charging
    status: ParkingSpaceStatus = Field(default=ParkingSpaceStatus.AVAILABLE)
    is_reserved: bool = Field(default=False)
    reserved_by_ride: Optional[str] = None  # ride_id if reserved
    last_occupied: Optional[datetime] = None
    occupancy_duration_minutes: Optional[int] = None
    hourly_rate: float = Field(ge=0)
    daily_rate: float = Field(ge=0)
    updated_at: datetime = Field(default_factory=get_ist_now)
    
    class Config:
        json_schema_extra = {
            "example": {
                "spot_number": "A-05-12",
                "level": 1,
                "space_type": "regular",
                "status": "available",
                "hourly_rate": 50.0,
                "daily_rate": 400.0
            }
        }


class AirportDemandMetric(BaseModel):
    """Real-time demand metrics for airport rides."""
    metric_id: str = Field(default_factory=lambda: f"metric_{id(object())%10000}")
    terminal_id: str = Field(...)
    timestamp: datetime = Field(default_factory=get_ist_now)
    ride_phase: RidePhaseType = Field(...)
    waiting_requests: int = Field(ge=0)  # Passengers waiting for pickup
    available_drivers: int = Field(ge=0)
    in_progress_rides: int = Field(ge=0)
    average_wait_time_minutes: float = Field(ge=0)
    demand_score: float = Field(ge=0, le=100)  # 0-100 scale
    surge_multiplier: float = Field(ge=1.0)
    peak_hour: bool = Field(default=False)
    avg_fare_amount: float = Field(ge=0)
    estimated_wait_minutes: int = Field(ge=0)
    
    class Config:
        json_schema_extra = {
            "example": {
                "ride_phase": "pre_flight",
                "waiting_requests": 45,
                "available_drivers": 12,
                "demand_score": 75,
                "surge_multiplier": 1.5,
                "average_wait_time_minutes": 12.5
            }
        }


class AirportQueue(BaseModel):
    """Queue management for airport rides."""
    queue_id: str = Field(default_factory=lambda: f"queue_{id(object())%10000}")
    terminal_id: str = Field(...)
    ride_phase: RidePhaseType = Field(...)
    priority_level: int = Field(ge=1, le=5, description="1=highest, 5=lowest")
    queued_ride_ids: List[str] = Field(default_factory=list)
    queue_length: int = Field(ge=0)
    estimated_wait_time_minutes: int = Field(ge=0)
    last_updated: datetime = Field(default_factory=get_ist_now)
    
    class Config:
        json_schema_extra = {
            "example": {
                "ride_phase": "post_flight",
                "priority_level": 1,
                "queue_length": 28,
                "estimated_wait_time_minutes": 15
            }
        }


class AirportAlert(BaseModel):
    """Alerts for airport operations."""
    alert_id: str = Field(default_factory=lambda: f"alert_{id(object())%10000}")
    terminal_id: str = Field(...)
    alert_type: str = Field(...)  # flight_delayed, high_demand, parking_full, service_issue
    severity: str = Field(...)  # critical, high, medium, low
    message: str = Field(...)
    ride_ids_affected: List[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=get_ist_now)
    resolved: bool = Field(default=False)
    resolution_time: Optional[datetime] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "alert_type": "high_demand",
                "severity": "high",
                "message": "High demand at Terminal 1, 45 min wait expected"
            }
        }


class AirportServiceMetrics(BaseModel):
    """Overall service performance metrics."""
    metric_period: str = Field(...)  # hourly, daily, weekly
    terminal_id: str = Field(...)
    total_rides: int = Field(ge=0)
    completed_rides: int = Field(ge=0)
    cancelled_rides: int = Field(ge=0)
    average_rating: float = Field(ge=0, le=5)
    on_time_completion_rate: float = Field(ge=0, le=100)  # percentage
    total_revenue: float = Field(ge=0)
    peak_demand_time: str = Field(default="")  # HH:MM format
    peak_demand_score: float = Field(ge=0, le=100)
    driver_efficiency: float = Field(ge=0, le=100)
    timestamp: datetime = Field(default_factory=get_ist_now)
    
    class Config:
        json_schema_extra = {
            "example": {
                "metric_period": "daily",
                "total_rides": 512,
                "completed_rides": 489,
                "average_rating": 4.7,
                "on_time_completion_rate": 94.5,
                "total_revenue": 102400.0
            }
        }
