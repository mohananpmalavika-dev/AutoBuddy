"""
ENHANCED BOOKING PAYLOAD MODELS - All Vehicle Types
Extends basic booking to support vehicle-specific fields, ride types, and fare breakdown
"""

from pydantic import BaseModel, Field, validator
from typing import List, Optional, Dict
from datetime import datetime
from enum import Enum


class RideType(str, Enum):
    """Supported ride types"""
    INSTANT = "instant"
    SCHEDULED = "scheduled"
    RENTAL = "rental"
    AIRPORT = "airport"
    CORPORATE = "corporate"
    TOURISM = "tourism"
    GOODS = "goods"


class GoodsDetails(BaseModel):
    """Goods/cargo specific details"""
    goods_weight_kg: float = Field(..., ge=0.1, le=100000, description="Weight in kg")
    goods_type: str = Field(..., min_length=1, max_length=100, description="Type: package|furniture|electronics|etc")
    loading_help_required: bool = Field(default=False, description="Need loading assistance")
    special_handling: Optional[str] = Field(default=None, description="Fragile|Heavy|etc")


class AirportDetails(BaseModel):
    """Airport transfer specific details"""
    airport_code: str = Field(..., min_length=3, max_length=10, description="IATA code")
    terminal: Optional[str] = Field(default=None, description="Terminal number")
    flight_number: Optional[str] = Field(default=None, description="Flight number")
    flight_datetime: Optional[datetime] = Field(default=None, description="Flight time")


class RentalDetails(BaseModel):
    """Rental service specific details"""
    rental_hours: float = Field(..., ge=1, le=168, description="Rental duration in hours")
    rental_start_datetime: datetime = Field(..., description="Start time of rental")
    with_driver: bool = Field(default=True, description="Include driver service")
    max_km_allowance: Optional[float] = Field(default=None, description="Max km allowed in rental")


class TourismDetails(BaseModel):
    """Tourism/sightseeing specific details"""
    tour_hours: float = Field(..., ge=2, le=24, description="Tour duration in hours")
    tour_itinerary: Optional[str] = Field(default=None, description="Planned stops/route")
    return_location: Optional[str] = Field(default=None, description="Return location if different")


class EnhancedBookingRequest(BaseModel):
    """
    ENHANCED BOOKING REQUEST - Supports all vehicle types and ride types
    """
    # Basic Location Info
    pickup_location: str = Field(..., description="Pickup address")
    pickup_latitude: float = Field(..., description="Pickup latitude")
    pickup_longitude: float = Field(..., description="Pickup longitude")
    dropoff_location: str = Field(..., description="Dropoff address")
    dropoff_latitude: float = Field(..., description="Dropoff latitude")
    dropoff_longitude: float = Field(..., description="Dropoff longitude")
    
    # Service Selection
    ride_type: RideType = Field(..., description="Type of ride: instant|scheduled|rental|airport|corporate|tourism|goods")
    vehicle_type_id: str = Field(..., description="Vehicle type: auto|taxi|xl|traveller|bus|minitruck|truck")
    vehicle_subtype_id: Optional[str] = Field(default=None, description="Vehicle subtype if applicable")
    
    # Passenger/Capacity Info
    passenger_count: Optional[int] = Field(default=1, ge=1, le=100, description="Number of passengers")
    
    # Ride Scheduling
    scheduled_datetime: Optional[datetime] = Field(default=None, description="For scheduled rides")
    
    # Ride-Specific Details (Optional based on ride type)
    goods_details: Optional[GoodsDetails] = None
    airport_details: Optional[AirportDetails] = None
    rental_details: Optional[RentalDetails] = None
    tourism_details: Optional[TourismDetails] = None
    
    # Additional Info
    notes: Optional[str] = Field(default=None, max_length=500, description="Special requests")
    preferred_driver_id: Optional[str] = Field(default=None, description="Specific driver preference")
    
    # Accessibility & Preferences
    wheelchair_accessible: bool = Field(default=False, description="Need wheelchair accessible vehicle")
    ac_required: bool = Field(default=True, description="Air conditioning required")
    
    @validator('passenger_count')
    def validate_passenger_count(cls, v):
        if v is None:
            return 1
        return v


class FareBreakdown(BaseModel):
    """Detailed fare breakdown"""
    base_fare: float = Field(..., description="Base fare before multipliers")
    distance_km: float = Field(..., description="Distance in km")
    distance_charge: float = Field(..., description="Charge for distance")
    time_minutes: float = Field(..., description="Estimated time in minutes")
    time_charge: Optional[float] = Field(default=0, description="Charge for time/waiting")
    
    vehicle_multiplier: float = Field(..., description="Vehicle type multiplier (0.75-2.2)")
    ride_type_multiplier: float = Field(default=1.0, description="Ride type multiplier")
    
    goods_weight_kg: Optional[float] = Field(default=None, description="Goods weight for weight-based pricing")
    goods_charge: Optional[float] = Field(default=0, description="Charge for goods/weight")
    loading_help_charge: Optional[float] = Field(default=0, description="Loading assistance charge")
    
    subtotal: float = Field(..., description="Sum before tax/surges")
    surge_percentage: float = Field(default=0, description="Dynamic surge percentage")
    surge_amount: float = Field(default=0, description="Surge charge amount")
    tax_percentage: float = Field(default=5, description="Tax percentage")
    tax_amount: float = Field(..., description="Tax amount")
    
    promo_code: Optional[str] = Field(default=None, description="Applied promo code")
    promo_discount: float = Field(default=0, description="Discount from promo")
    
    total_fare: float = Field(..., description="Final fare after all calculations")
    
    class Config:
        json_schema_extra = {
            "example": {
                "base_fare": 50.0,
                "distance_km": 10.5,
                "distance_charge": 105.0,
                "time_minutes": 25,
                "time_charge": 50.0,
                "vehicle_multiplier": 1.25,
                "ride_type_multiplier": 1.0,
                "subtotal": 207.5,
                "surge_percentage": 0,
                "surge_amount": 0,
                "tax_percentage": 5,
                "tax_amount": 10.375,
                "promo_discount": 0,
                "total_fare": 217.875
            }
        }


class EnhancedBooking(BaseModel):
    """
    ENHANCED BOOKING RECORD - Complete booking with all vehicle/ride type data
    """
    # Identifiers
    booking_id: str = Field(..., description="Unique booking ID")
    user_id: str = Field(..., description="Passenger user ID")
    
    # Location & Route
    pickup_location: str
    pickup_latitude: float
    pickup_longitude: float
    dropoff_location: str
    dropoff_latitude: float
    dropoff_longitude: float
    
    # Service Details
    ride_type: RideType
    vehicle_type_id: str
    vehicle_subtype_id: Optional[str] = None
    vehicle_name: str = Field(..., description="Display name of vehicle")
    vehicle_icon: str = Field(..., description="Vehicle emoji/icon")
    
    # Capacity & Passenger Info
    passenger_count: int
    vehicle_capacity: int
    capacity_unit: str = Field(default="passengers")
    
    # Ride-Specific Data
    goods_details: Optional[GoodsDetails] = None
    airport_details: Optional[AirportDetails] = None
    rental_details: Optional[RentalDetails] = None
    tourism_details: Optional[TourismDetails] = None
    
    # Fare Information
    estimated_fare: float
    vehicle_type_multiplier: float
    ride_type_multiplier: float
    fare_breakdown: Optional[FareBreakdown] = None
    
    # Status & Timestamps
    status: str = Field(default="pending", description="pending|confirmed|assigned|in_progress|completed|cancelled")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    scheduled_datetime: Optional[datetime] = None
    
    # Optional Fields
    notes: Optional[str] = None
    preferred_driver_id: Optional[str] = None
    assigned_driver_id: Optional[str] = None
    
    class Config:
        from_attributes = True


class BookingFareEstimateRequest(BaseModel):
    """Request to estimate fare for a booking"""
    ride_type: RideType
    vehicle_type_id: str
    vehicle_subtype_id: Optional[str] = None
    
    pickup_latitude: float
    pickup_longitude: float
    dropoff_latitude: float
    dropoff_longitude: float
    
    passenger_count: Optional[int] = 1
    scheduled_datetime: Optional[datetime] = None
    
    goods_weight_kg: Optional[float] = None
    rental_hours: Optional[float] = None
    tour_hours: Optional[float] = None


class BookingFareEstimateResponse(BaseModel):
    """Response with fare estimate"""
    estimated_fare: float
    vehicle_type: str
    vehicle_name: str
    vehicle_icon: str
    
    distance_km: float
    estimated_time_minutes: int
    
    vehicle_multiplier: float
    ride_type_multiplier: float
    
    fare_breakdown: FareBreakdown
    
    currency: str = "INR"
    valid_for_seconds: int = 300  # Estimate valid for 5 minutes
