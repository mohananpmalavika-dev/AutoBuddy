"""
RIDE TYPE COMPATIBILITY & FARE CONFIGURATION
Manages which vehicle types support which ride types and their pricing multipliers
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime


class RideTypeMultiplier(BaseModel):
    """Ride-type specific fare multiplier for a vehicle"""
    ride_type: str  # instant|scheduled|rental|airport|corporate|tourism|goods
    multiplier: float  # Additional multiplier on top of vehicle base multiplier


class FareConfig(BaseModel):
    """Complete fare calculation configuration"""
    base_fare: float = Field(default=50.0, description="Base fare in INR")
    per_km_rate: float = Field(default=10.0, description="Rate per km in INR")
    per_minute_rate: float = Field(default=2.0, description="Rate per minute in INR")
    minimum_fare: float = Field(default=100.0, description="Minimum fare")
    cancellation_fee: float = Field(default=25.0, description="Cancellation fee")
    waiting_charge_per_minute: float = Field(default=1.0, description="Charge per minute waiting")


class GoodsCargoFareConfig(BaseModel):
    """Goods/cargo specific pricing"""
    base_fare: float = Field(default=100.0, description="Base fare for goods")
    per_kg_rate: float = Field(default=5.0, description="Rate per kg")
    per_km_rate: float = Field(default=15.0, description="Rate per km")
    minimum_fare: float = Field(default=200.0, description="Minimum fare for goods")
    loading_help_charge: float = Field(default=50.0, description="Loading assistance charge")


class RentalFareConfig(BaseModel):
    """Rental ride pricing"""
    hourly_rate: float = Field(default=500.0, description="Hourly rate")
    minimum_hours: int = Field(default=4, description="Minimum rental hours")
    km_limit_per_hour: float = Field(default=50.0, description="Free km per hour")
    extra_km_rate: float = Field(default=10.0, description="Rate for km beyond limit")


# ============================================================================
# RIDE TYPE COMPATIBILITY RULES
# ============================================================================
RIDE_TYPE_COMPATIBILITY = {
    "instant": {
        "description": "Instant ride request",
        "vehicles": ["auto", "taxi", "xl", "traveller"],
        "ride_type_multiplier": 1.0,
        "min_travel_time": 0,  # minutes
    },
    "scheduled": {
        "description": "Scheduled ride in advance",
        "vehicles": ["auto", "taxi", "xl", "traveller", "bus"],
        "ride_type_multiplier": 0.95,  # Slight discount for scheduled
        "min_travel_time": 30,
    },
    "rental": {
        "description": "Hourly/daily rental service",
        "vehicles": ["taxi", "xl", "traveller", "bus"],
        "ride_type_multiplier": 2.5,  # Rental multiplier on hourly rate
        "min_travel_time": 240,  # 4 hours minimum
        "fare_type": "hourly",
    },
    "airport": {
        "description": "Airport transfer service",
        "vehicles": ["taxi", "xl", "traveller"],
        "ride_type_multiplier": 1.3,  # 30% premium for airport service
        "min_travel_time": 45,
        "special_fields": ["terminal", "flight_number"],
    },
    "corporate": {
        "description": "Corporate/business ride",
        "vehicles": ["taxi", "xl"],
        "ride_type_multiplier": 1.25,  # 25% premium for corporate
        "min_travel_time": 0,
    },
    "tourism": {
        "description": "Tourism/sightseeing",
        "vehicles": ["taxi", "xl", "traveller", "bus"],
        "ride_type_multiplier": 1.5,  # 50% premium for tourism
        "min_travel_time": 120,  # 2 hours minimum
        "fare_type": "hourly",
    },
    "goods": {
        "description": "Goods/cargo delivery",
        "vehicles": ["minitruck", "truck"],
        "ride_type_multiplier": 1.0,
        "fare_type": "weight_based",
        "special_fields": ["goods_weight_kg", "goods_type", "loading_help_required"],
    }
}


# ============================================================================
# FARE CONFIGURATION PER VEHICLE & RIDE TYPE
# ============================================================================
FARE_CONFIGURATIONS = {
    "auto": {
        "base": FareConfig(
            base_fare=40.0,
            per_km_rate=8.0,
            per_minute_rate=1.5,
            minimum_fare=80.0,
        ),
        "instant": {"multiplier": 1.0},
        "scheduled": {"multiplier": 0.95},
        "airport": None,  # Not supported
        "corporate": None,  # Not supported
        "rental": None,  # Not supported
        "tourism": None,  # Not supported
        "goods": None,  # Not supported
    },
    "taxi": {
        "base": FareConfig(
            base_fare=50.0,
            per_km_rate=10.0,
            per_minute_rate=2.0,
            minimum_fare=100.0,
        ),
        "instant": {"multiplier": 1.0},
        "scheduled": {"multiplier": 0.95},
        "airport": {"multiplier": 1.3},
        "corporate": {"multiplier": 1.25},
        "rental": RentalFareConfig(hourly_rate=500.0),
        "tourism": RentalFareConfig(hourly_rate=600.0),
        "goods": None,  # Not supported
    },
    "xl": {
        "base": FareConfig(
            base_fare=75.0,
            per_km_rate=12.0,
            per_minute_rate=2.5,
            minimum_fare=150.0,
        ),
        "instant": {"multiplier": 1.25},
        "scheduled": {"multiplier": 1.2},
        "airport": {"multiplier": 1.4},
        "corporate": {"multiplier": 1.3},
        "rental": RentalFareConfig(hourly_rate=800.0),
        "tourism": RentalFareConfig(hourly_rate=900.0),
        "goods": None,  # Not supported
    },
    "traveller": {
        "base": FareConfig(
            base_fare=100.0,
            per_km_rate=12.0,
            per_minute_rate=2.5,
            minimum_fare=200.0,
        ),
        "instant": {"multiplier": 1.25},
        "scheduled": {"multiplier": 1.2},
        "airport": None,  # Not typically used
        "corporate": None,  # Not typically used
        "rental": RentalFareConfig(hourly_rate=1200.0),
        "tourism": RentalFareConfig(hourly_rate=1500.0),
        "goods": None,  # Not supported
    },
    "bus": {
        "base": FareConfig(
            base_fare=150.0,
            per_km_rate=15.0,
            per_minute_rate=3.0,
            minimum_fare=300.0,
        ),
        "instant": {"multiplier": 1.8},
        "scheduled": {"multiplier": 1.7},
        "airport": None,
        "corporate": None,
        "rental": RentalFareConfig(hourly_rate=2000.0),
        "tourism": RentalFareConfig(hourly_rate=2500.0),
        "goods": None,  # Not supported
    },
    "minitruck": {
        "base": GoodsCargoFareConfig(
            base_fare=150.0,
            per_kg_rate=5.0,
            per_km_rate=12.0,
            minimum_fare=250.0,
        ),
        "instant": {"multiplier": 1.0},
        "scheduled": {"multiplier": 0.95},
        "airport": None,
        "corporate": None,
        "rental": None,
        "tourism": None,
        "goods": {"multiplier": 1.0},  # Supported
    },
    "truck": {
        "base": GoodsCargoFareConfig(
            base_fare=200.0,
            per_kg_rate=4.0,
            per_km_rate=15.0,
            minimum_fare=350.0,
        ),
        "instant": {"multiplier": 1.0},
        "scheduled": {"multiplier": 0.95},
        "airport": None,
        "corporate": None,
        "rental": None,
        "tourism": None,
        "goods": {"multiplier": 1.0},  # Supported
    }
}


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_compatible_vehicles(ride_type: str) -> List[str]:
    """Get all vehicle types compatible with a ride type"""
    if ride_type not in RIDE_TYPE_COMPATIBILITY:
        return []
    return RIDE_TYPE_COMPATIBILITY[ride_type]["vehicles"]


def is_vehicle_compatible_with_ride_type(vehicle_type_id: str, ride_type: str) -> bool:
    """Check if vehicle supports ride type"""
    compatible = get_compatible_vehicles(ride_type)
    return vehicle_type_id in compatible


def get_ride_type_multiplier(ride_type: str) -> float:
    """Get the ride-type multiplier"""
    if ride_type not in RIDE_TYPE_COMPATIBILITY:
        return 1.0
    return RIDE_TYPE_COMPATIBILITY[ride_type].get("ride_type_multiplier", 1.0)


def get_fare_config(vehicle_type_id: str, ride_type: str) -> Optional[Dict]:
    """Get fare configuration for vehicle + ride type combination"""
    if vehicle_type_id not in FARE_CONFIGURATIONS:
        return None
    
    vehicle_config = FARE_CONFIGURATIONS[vehicle_type_id]
    if ride_type not in vehicle_config:
        return None
    
    return vehicle_config[ride_type]


def get_base_fare_config(vehicle_type_id: str) -> Optional[FareConfig]:
    """Get base fare configuration for a vehicle"""
    if vehicle_type_id not in FARE_CONFIGURATIONS:
        return None
    
    base_config = FARE_CONFIGURATIONS[vehicle_type_id].get("base")
    return base_config


def get_special_fields_for_ride_type(ride_type: str) -> List[str]:
    """Get special/additional fields required for a ride type"""
    if ride_type not in RIDE_TYPE_COMPATIBILITY:
        return []
    return RIDE_TYPE_COMPATIBILITY[ride_type].get("special_fields", [])
