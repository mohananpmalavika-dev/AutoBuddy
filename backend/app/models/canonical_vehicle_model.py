"""
CANONICAL VEHICLE MODEL - Single Source of Truth
This replaces scattered vehicle definitions across the system
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict
from datetime import datetime
from app.utils.time_helpers import get_ist_now
from enum import Enum


# Canonical vehicle type documents live in their own collection. Driver-owned
# vehicle registrations are operational records and must not share this schema.
CANONICAL_VEHICLES_COLLECTION = "canonical_vehicle_types"
LEGACY_CANONICAL_VEHICLES_COLLECTION = "vehicles"


class VehicleSubtype(BaseModel):
    """Vehicle subtype variation (e.g., Sedan vs Hatchback for Taxi)"""
    id: str
    name: str
    multiplier: float  # Relative to base vehicle multiplier
    capacity: Optional[int] = None  # Override parent capacity
    icon: Optional[str] = None


class CanonicalVehicleType(BaseModel):
    """
    CANONICAL VEHICLE TYPE - Single source of truth for all vehicles
    Used by: drivers, fleet vehicles, ride products, fare calculations, bookings
    """
    vehicle_type_id: str = Field(..., description="Unique identifier: auto|ev_auto|taxi|xl|traveller|bus|minitruck|truck")
    name: str = Field(..., description="Display name")
    name_ml: Optional[str] = None  # Malayalam name for regional support
    translations: Dict[str, Dict[str, str]] = Field(
        default_factory=dict,
        description="Localized display strings by language code",
    )
    icon: str = Field(..., description="Emoji or icon representation")
    description: str = Field(..., description="User-friendly description")
    
    # Capacity & Support
    capacity: int = Field(..., ge=1, le=100, description="Max passengers or cargo (kg for trucks)")
    capacity_unit: str = Field(default="passengers", description="passengers|kg|units")
    
    # Pricing & Multipliers
    base_multiplier: float = Field(..., ge=0.5, le=5.0, description="Fare multiplier vs taxi")
    fare_config: Optional[Dict] = Field(default=None, description="DB-backed fare config override")
    
    # Ride Type Support
    allowed_ride_types: List[str] = Field(
        default_factory=lambda: ["instant", "scheduled"],
        description="Ride types this vehicle supports: instant|scheduled|rental|airport|corporate|intercity|ev_auto|tourism|women_only|goods|pet"
    )
    
    # Service Support
    goods_supported: bool = Field(default=False, description="Can carry goods/freight")
    passenger_supported: bool = Field(default=True, description="Can carry passengers")
    accessibility_support: bool = Field(default=False, description="Wheelchair accessible")
    
    # Vehicle Variations
    subtypes: List[VehicleSubtype] = Field(default_factory=list, description="Variants of this vehicle")
    
    # Regional Configuration
    regions: List[str] = Field(default_factory=lambda: ["all"], description="Available regions")
    
    # Status & Metadata
    active: bool = Field(default=True)
    created_at: datetime = Field(default_factory=get_ist_now)
    updated_at: datetime = Field(default_factory=get_ist_now)
    
    class Config:
        from_attributes = True


# ============================================================================
# CANONICAL VEHICLE DATABASE - Single Source of Truth
# ============================================================================
CANONICAL_VEHICLE_TYPES = [
    {
        "vehicle_type_id": "auto",
        "name": "Auto",
        "name_ml": "ഓട്ടോ",
        "icon": "🛺",
        "description": "Budget-friendly, 3-4 seater auto rickshaw",
        "capacity": 3,
        "capacity_unit": "passengers",
        "base_multiplier": 0.75,
        "allowed_ride_types": ["instant", "scheduled", "rental", "ev_auto", "tourism", "women_only", "pet"],
        "goods_supported": False,
        "passenger_supported": True,
        "accessibility_support": False,
        "subtypes": [
            {"id": "auto_standard", "name": "Standard", "multiplier": 0.75}
        ],
        "regions": ["all"],
        "active": True,
        "created_at": get_ist_now(),
        "updated_at": get_ist_now()
    },
    {
        "vehicle_type_id": "ev_auto",
        "name": "EV Auto",
        "name_ml": "ഇവി ഓട്ടോ",
        "icon": "🔋",
        "description": "Electric auto rickshaw for eco-friendly city rides",
        "capacity": 3,
        "capacity_unit": "passengers",
        "base_multiplier": 0.8,
        "allowed_ride_types": ["instant", "scheduled", "ev_auto", "women_only"],
        "goods_supported": False,
        "passenger_supported": True,
        "accessibility_support": False,
        "subtypes": [
            {"id": "ev_auto_standard", "name": "EV Standard", "multiplier": 0.8, "capacity": 3}
        ],
        "regions": ["all"],
        "active": True,
        "created_at": get_ist_now(),
        "updated_at": get_ist_now()
    },
    {
        "vehicle_type_id": "taxi",
        "name": "Taxi",
        "name_ml": "ടാക്സി",
        "icon": "🚖",
        "description": "Comfortable, 4 seater sedan",
        "capacity": 4,
        "capacity_unit": "passengers",
        "base_multiplier": 1.0,
        "allowed_ride_types": ["instant", "scheduled", "rental", "airport", "corporate", "intercity", "tourism", "women_only", "pet"],
        "goods_supported": False,
        "passenger_supported": True,
        "accessibility_support": True,
        "subtypes": [
            {"id": "taxi_sedan", "name": "Sedan", "multiplier": 1.0, "capacity": 4},
            {"id": "taxi_hatchback", "name": "Hatchback", "multiplier": 0.95, "capacity": 4}
        ],
        "regions": ["all"],
        "active": True,
        "created_at": get_ist_now(),
        "updated_at": get_ist_now()
    },
    {
        "vehicle_type_id": "xl",
        "name": "XL",
        "name_ml": "എക്സ്എൽ",
        "icon": "🚗",
        "description": "More space, 5-6 seater SUV or wagon",
        "capacity": 6,
        "capacity_unit": "passengers",
        "base_multiplier": 1.25,
        "allowed_ride_types": ["instant", "scheduled", "rental", "airport", "corporate", "intercity", "tourism", "women_only", "pet"],
        "goods_supported": False,
        "passenger_supported": True,
        "accessibility_support": True,
        "subtypes": [
            {"id": "xl_suv", "name": "SUV", "multiplier": 1.5, "capacity": 5},
            {"id": "xl_wagon", "name": "Wagon", "multiplier": 1.25, "capacity": 6}
        ],
        "regions": ["all"],
        "active": True,
        "created_at": get_ist_now(),
        "updated_at": get_ist_now()
    },
    {
        "vehicle_type_id": "traveller",
        "name": "Traveller",
        "name_ml": "ട്രാവലർ",
        "icon": "🚐",
        "description": "Group travel, 6-8 seater minibus",
        "capacity": 8,
        "capacity_unit": "passengers",
        "base_multiplier": 1.25,
        "allowed_ride_types": ["instant", "scheduled", "rental", "intercity", "tourism"],
        "goods_supported": False,
        "passenger_supported": True,
        "accessibility_support": False,
        "subtypes": [
            {"id": "traveller_6seat", "name": "6-seater", "multiplier": 1.25, "capacity": 6},
            {"id": "traveller_8seat", "name": "8-seater", "multiplier": 1.35, "capacity": 8}
        ],
        "regions": ["all"],
        "active": True,
        "created_at": get_ist_now(),
        "updated_at": get_ist_now()
    },
    {
        "vehicle_type_id": "bus",
        "name": "Bus",
        "name_ml": "ബസ്സ്",
        "icon": "🚌",
        "description": "Large groups, 20+ seater bus",
        "capacity": 40,
        "capacity_unit": "passengers",
        "base_multiplier": 1.8,
        "allowed_ride_types": ["instant", "scheduled", "rental", "tourism"],
        "goods_supported": False,
        "passenger_supported": True,
        "accessibility_support": False,
        "subtypes": [
            {"id": "bus_city", "name": "City Bus", "multiplier": 1.8, "capacity": 40},
            {"id": "bus_coach", "name": "Coach", "multiplier": 2.0, "capacity": 45}
        ],
        "regions": ["all"],
        "active": True,
        "created_at": get_ist_now(),
        "updated_at": get_ist_now()
    },
    {
        "vehicle_type_id": "minitruck",
        "name": "Mini Truck",
        "name_ml": "മിനി ട്രക്ക്",
        "icon": "🚚",
        "description": "Small goods delivery, up to 1 ton",
        "capacity": 1000,
        "capacity_unit": "kg",
        "base_multiplier": 1.5,
        "allowed_ride_types": ["instant", "scheduled", "goods"],
        "goods_supported": True,
        "passenger_supported": False,
        "accessibility_support": False,
        "subtypes": [
            {"id": "minitruck_500kg", "name": "500kg", "multiplier": 1.5, "capacity": 500},
            {"id": "minitruck_1000kg", "name": "1 Ton", "multiplier": 1.5, "capacity": 1000}
        ],
        "regions": ["all"],
        "active": True,
        "created_at": get_ist_now(),
        "updated_at": get_ist_now()
    },
    {
        "vehicle_type_id": "truck",
        "name": "Truck",
        "name_ml": "ട്രക്ക്",
        "icon": "🚛",
        "description": "Heavy goods, 2.5T to 10T+ capacity",
        "capacity": 10000,
        "capacity_unit": "kg",
        "base_multiplier": 1.8,
        "allowed_ride_types": ["instant", "scheduled", "goods"],
        "goods_supported": True,
        "passenger_supported": False,
        "accessibility_support": False,
        "subtypes": [
            {"id": "truck_2_5t", "name": "2.5 Ton", "multiplier": 1.8, "capacity": 2500},
            {"id": "truck_5t", "name": "5 Ton", "multiplier": 2.0, "capacity": 5000},
            {"id": "truck_10t", "name": "10 Ton", "multiplier": 2.2, "capacity": 10000}
        ],
        "regions": ["all"],
        "active": True,
        "created_at": get_ist_now(),
        "updated_at": get_ist_now()
    }
]


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_vehicle_by_id(vehicle_type_id: str) -> Optional[Dict]:
    """Get vehicle config by ID from canonical source"""
    for vehicle in CANONICAL_VEHICLE_TYPES:
        if vehicle.get("vehicle_type_id") == vehicle_type_id:
            return vehicle
    return None


def get_vehicle_multiplier(vehicle_type_id: str, subtype_id: Optional[str] = None) -> float:
    """Get fare multiplier for vehicle with optional subtype override"""
    vehicle = get_vehicle_by_id(vehicle_type_id)
    if not vehicle:
        return 1.0
    
    if subtype_id and vehicle.get("subtypes"):
        for subtype in vehicle["subtypes"]:
            if subtype.get("id") == subtype_id:
                return subtype.get("multiplier", vehicle.get("base_multiplier", 1.0))
    
    return vehicle.get("base_multiplier", 1.0)


def get_vehicle_capacity(vehicle_type_id: str, subtype_id: Optional[str] = None) -> int:
    """Get capacity for vehicle with optional subtype override"""
    vehicle = get_vehicle_by_id(vehicle_type_id)
    if not vehicle:
        return 1
    
    if subtype_id and vehicle.get("subtypes"):
        for subtype in vehicle["subtypes"]:
            if subtype.get("id") == subtype_id and subtype.get("capacity"):
                return subtype.get("capacity")
    
    return vehicle.get("capacity", 1)


def supports_ride_type(vehicle_type_id: str, ride_type: str) -> bool:
    """Check if vehicle supports specific ride type"""
    vehicle = get_vehicle_by_id(vehicle_type_id)
    if not vehicle:
        return False
    return ride_type in vehicle.get("allowed_ride_types", [])


def get_goods_carrying_vehicles() -> List[str]:
    """Get all vehicle types that support goods"""
    return [v.get("vehicle_type_id") for v in CANONICAL_VEHICLE_TYPES if v.get("goods_supported")]


def get_passenger_vehicles() -> List[str]:
    """Get all vehicle types that support passengers"""
    return [v.get("vehicle_type_id") for v in CANONICAL_VEHICLE_TYPES if v.get("passenger_supported")]
