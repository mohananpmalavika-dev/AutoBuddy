"""
RIDE TYPE COMPATIBILITY & FARE CONFIGURATION
Manages which vehicle types support which ride types and their pricing multipliers
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime


class RideTypeMultiplier(BaseModel):
    """Ride-type specific fare multiplier for a vehicle"""
    ride_type: str  # instant|scheduled|rental|airport|corporate|intercity|ev_auto|tourism|women_only|goods|pet
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
    "ev_auto": {
        "description": "Electric auto ride request",
        "vehicles": ["auto", "ev_auto"],
        "ride_type_multiplier": 1.05,
        "min_travel_time": 0,
        "special_fields": ["ev_auto_required"],
    },
    "scheduled": {
        "description": "Scheduled ride in advance",
        "vehicles": ["auto", "taxi", "xl", "traveller", "bus"],
        "ride_type_multiplier": 0.95,  # Slight discount for scheduled
        "min_travel_time": 30,
    },
    "rental": {
        "description": "Hourly package rental service with included km and extra time/km billing",
        "vehicles": ["auto", "taxi", "xl", "traveller", "bus"],
        "ride_type_multiplier": 2.5,  # Rental multiplier on hourly rate
        "min_travel_time": 60,  # 1 hour minimum
        "fare_type": "hourly_package",
        "special_fields": [
            "rental_hours",
            "rental_package_hours",
            "rental_included_km",
            "rental_stops",
        ],
    },
    "airport": {
        "description": "Airport transfer service",
        "vehicles": ["taxi", "xl", "traveller"],
        "ride_type_multiplier": 1.3,  # 30% premium for airport service
        "min_travel_time": 45,
        "special_fields": ["terminal", "flight_number"],
    },
    "intercity": {
        "description": "Intercity/outstation passenger ride",
        "vehicles": ["taxi", "xl", "traveller"],
        "ride_type_multiplier": 1.6,
        "min_travel_time": 60,
        "special_fields": [
            "intercity_return_trip",
            "intercity_wait_hours",
            "intercity_tolls_included",
            "intercity_route_notes",
        ],
    },
    "corporate": {
        "description": "Corporate/business ride",
        "vehicles": ["taxi", "xl"],
        "ride_type_multiplier": 1.25,  # 25% premium for corporate
        "min_travel_time": 0,
    },
    "pet": {
        "description": "Pet-friendly passenger ride",
        "vehicles": ["auto", "taxi", "xl"],
        "ride_type_multiplier": 1.18,
        "min_travel_time": 0,
        "special_fields": ["pet_type", "pet_count", "pet_carrier_required"],
    },
    "women_only": {
        "description": "Safety-first ride for women passengers with female-driver-first matching",
        "vehicles": ["auto", "ev_auto", "taxi", "xl"],
        "ride_type_multiplier": 1.15,
        "min_travel_time": 0,
        "special_fields": [
            "passenger_gender",
            "women_only_female_driver_required",
            "women_only_allow_trusted_male_driver",
            "women_only_guardian_name",
            "women_only_guardian_phone",
            "women_only_share_guardian_tracking",
        ],
    },
    "tourism": {
        "description": "Tourism packages, custom tours and local discovery",
        "vehicles": ["auto", "taxi", "xl", "traveller", "bus"],
        "ride_type_multiplier": 1.5,  # Package fare engine handles final tourism fare
        "min_travel_time": 120,  # 2 hours minimum
        "fare_type": "hourly",
        "special_fields": [
            "tourism_package_id",
            "tourism_package_type",
            "tourism_city",
            "tourism_custom_stops",
            "tourism_language_preference",
            "tourism_guide_required",
            "tourism_photographer_required",
            "tourism_boat_ride_required",
            "tourism_hotel_booking_requested",
            "tourism_ticket_booking_requested",
        ],
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
        "ev_auto": {"multiplier": 1.05},
        "women_only": {"multiplier": 1.15},
        "scheduled": {"multiplier": 0.95},
        "airport": None,  # Not supported
        "intercity": None,  # Not supported
        "corporate": None,  # Not supported
        "pet": {"multiplier": 1.12},
        "rental": RentalFareConfig(
            hourly_rate=250.0,
            minimum_hours=1,
            km_limit_per_hour=10.0,
            extra_km_rate=18.0,
        ),
        "tourism": RentalFareConfig(hourly_rate=450.0),
        "goods": None,  # Not supported
    },
    "ev_auto": {
        "base": FareConfig(
            base_fare=45.0,
            per_km_rate=8.5,
            per_minute_rate=1.5,
            minimum_fare=85.0,
        ),
        "instant": {"multiplier": 1.0},
        "ev_auto": {"multiplier": 1.0},
        "women_only": {"multiplier": 1.08},
        "scheduled": {"multiplier": 0.95},
        "airport": None,  # Not supported
        "intercity": None,  # Not supported
        "corporate": None,  # Not supported
        "pet": None,  # Not supported
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
        "ev_auto": None,  # Not supported
        "women_only": {"multiplier": 1.15},
        "scheduled": {"multiplier": 0.95},
        "airport": {"multiplier": 1.3},
        "intercity": {"multiplier": 1.6},
        "corporate": {"multiplier": 1.25},
        "pet": {"multiplier": 1.18},
        "rental": RentalFareConfig(
            hourly_rate=500.0,
            minimum_hours=1,
            km_limit_per_hour=15.0,
            extra_km_rate=25.0,
        ),
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
        "ev_auto": None,  # Not supported
        "women_only": {"multiplier": 1.15},
        "scheduled": {"multiplier": 1.2},
        "airport": {"multiplier": 1.4},
        "intercity": {"multiplier": 1.75},
        "corporate": {"multiplier": 1.3},
        "pet": {"multiplier": 1.22},
        "rental": RentalFareConfig(
            hourly_rate=700.0,
            minimum_hours=2,
            km_limit_per_hour=15.0,
            extra_km_rate=35.0,
        ),
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
        "ev_auto": None,  # Not supported
        "women_only": None,  # Not supported
        "scheduled": {"multiplier": 1.2},
        "airport": None,  # Not typically used
        "intercity": {"multiplier": 1.9},
        "corporate": None,  # Not typically used
        "pet": None,  # Not supported
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
        "ev_auto": None,
        "women_only": None,
        "scheduled": {"multiplier": 1.7},
        "airport": None,
        "intercity": None,
        "corporate": None,
        "pet": None,
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
        "ev_auto": None,
        "women_only": None,
        "scheduled": {"multiplier": 0.95},
        "airport": None,
        "intercity": None,
        "corporate": None,
        "pet": None,
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
        "ev_auto": None,
        "women_only": None,
        "scheduled": {"multiplier": 0.95},
        "airport": None,
        "intercity": None,
        "corporate": None,
        "pet": None,
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
