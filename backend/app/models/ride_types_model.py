"""
Ride Types Management
Handles creation, updating, and fetching of ride service types
"""

from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from app.utils.time_helpers import get_ist_now
from enum import Enum

class RideTypeEnum(str, Enum):
    INSTANT = "instant"
    SCHEDULED = "scheduled"
    RENTAL = "rental"
    AIRPORT = "airport"
    CORPORATE = "corporate"
    INTERCITY = "intercity"
    EV_AUTO = "ev_auto"
    TOURISM = "tourism"
    WOMEN_ONLY = "women_only"
    PET = "pet"
    GOODS = "goods"

class RideTypeResponse(BaseModel):
    id: str
    name: str
    icon: str
    description: str
    allowed_vehicle_types: List[str] = []
    requires_scheduling: bool = False
    requires_destination: bool = True
    requires_passenger_count: bool = True
    active: bool = True
    regions: List[str] = ["all"]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Seed data for ride types
DEFAULT_RIDE_TYPES = [
    {
        "_id": "instant",
        "name": "Instant Ride",
        "icon": "⚡",
        "description": "Book now, ride immediately",
        "allowed_vehicle_types": ["auto", "taxi", "xl", "traveller"],
        "requires_scheduling": False,
        "requires_destination": True,
        "requires_passenger_count": True,
        "active": True,
        "regions": ["all"],
        "created_at": get_ist_now(),
        "updated_at": get_ist_now()
    },
    {
        "_id": "scheduled",
        "name": "Scheduled Ride",
        "icon": "📅",
        "description": "Book for future time",
        "allowed_vehicle_types": ["auto", "taxi", "xl", "traveller"],
        "requires_scheduling": True,
        "requires_destination": True,
        "requires_passenger_count": True,
        "active": True,
        "regions": ["all"],
        "created_at": get_ist_now(),
        "updated_at": get_ist_now()
    },
    {
        "_id": "rental",
        "name": "Rental / Hourly",
        "icon": "⏰",
        "description": "Hourly rental service",
        "allowed_vehicle_types": ["auto", "taxi", "xl", "traveller"],
        "requires_scheduling": False,
        "requires_destination": False,
        "requires_passenger_count": True,
        "active": True,
        "regions": ["all"],
        "created_at": get_ist_now(),
        "updated_at": get_ist_now()
    },
    {
        "_id": "airport",
        "name": "Airport",
        "icon": "✈️",
        "description": "Airport transfer",
        "allowed_vehicle_types": ["auto", "taxi", "xl", "traveller"],
        "requires_scheduling": False,
        "requires_destination": True,
        "requires_passenger_count": True,
        "active": True,
        "regions": ["all"],
        "created_at": get_ist_now(),
        "updated_at": get_ist_now()
    },
    {
        "_id": "intercity",
        "name": "Intercity",
        "icon": "INTERCITY",
        "description": "City-to-city passenger rides",
        "allowed_vehicle_types": ["taxi", "xl", "traveller"],
        "requires_scheduling": False,
        "requires_destination": True,
        "requires_passenger_count": True,
        "active": True,
        "regions": ["all"],
        "created_at": get_ist_now(),
        "updated_at": get_ist_now()
    },
    {
        "_id": "ev_auto",
        "name": "EV Auto",
        "icon": "EV_AUTO",
        "description": "Eco-friendly electric auto rides",
        "allowed_vehicle_types": ["auto", "ev_auto"],
        "requires_scheduling": False,
        "requires_destination": True,
        "requires_passenger_count": True,
        "active": True,
        "regions": ["all"],
        "created_at": get_ist_now(),
        "updated_at": get_ist_now()
    },
    {
        "_id": "corporate",
        "name": "Corporate",
        "icon": "🏢",
        "description": "Business travel",
        "allowed_vehicle_types": ["auto", "taxi", "xl", "traveller"],
        "requires_scheduling": False,
        "requires_destination": True,
        "requires_passenger_count": True,
        "active": True,
        "regions": ["all"],
        "created_at": get_ist_now(),
        "updated_at": get_ist_now()
    },
    {
        "_id": "tourism",
        "name": "Tourism",
        "icon": "🗺️",
        "description": "Ride + guide packages, custom tours and local discovery",
        "allowed_vehicle_types": ["auto", "taxi", "xl", "traveller", "bus"],
        "requires_scheduling": False,
        "requires_destination": False,
        "requires_passenger_count": True,
        "active": True,
        "regions": ["all"],
        "created_at": get_ist_now(),
        "updated_at": get_ist_now()
    },
    {
        "_id": "women_only",
        "name": "Women Only",
        "icon": "WOMEN_ONLY",
        "description": "Safety-first rides for women with female-driver-first matching",
        "allowed_vehicle_types": ["auto", "ev_auto", "taxi", "xl"],
        "requires_scheduling": False,
        "requires_destination": True,
        "requires_passenger_count": True,
        "active": True,
        "regions": ["all"],
        "created_at": get_ist_now(),
        "updated_at": get_ist_now()
    },
    {
        "_id": "pet",
        "name": "Pet Rides",
        "icon": "PET",
        "description": "Pet-friendly passenger rides",
        "allowed_vehicle_types": ["auto", "taxi", "xl"],
        "requires_scheduling": False,
        "requires_destination": True,
        "requires_passenger_count": True,
        "active": True,
        "regions": ["all"],
        "created_at": get_ist_now(),
        "updated_at": get_ist_now()
    },
    {
        "_id": "goods",
        "name": "Goods / Logistics",
        "icon": "📦",
        "description": "Cargo delivery",
        "allowed_vehicle_types": ["minitruck", "truck"],
        "requires_scheduling": False,
        "requires_destination": True,
        "requires_passenger_count": False,
        "active": True,
        "regions": ["all"],
        "created_at": get_ist_now(),
        "updated_at": get_ist_now()
    }
]
