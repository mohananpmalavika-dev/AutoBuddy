"""
Ride Types Management
Handles creation, updating, and fetching of ride service types
"""

from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from enum import Enum

class RideTypeEnum(str, Enum):
    INSTANT = "instant"
    SCHEDULED = "scheduled"
    RENTAL = "rental"
    AIRPORT = "airport"
    CORPORATE = "corporate"
    TOURISM = "tourism"
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
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
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
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
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
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
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
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
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
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    },
    {
        "_id": "tourism",
        "name": "Tourism",
        "icon": "🗺️",
        "description": "Sightseeing tours",
        "allowed_vehicle_types": ["traveller", "bus"],
        "requires_scheduling": False,
        "requires_destination": False,
        "requires_passenger_count": True,
        "active": True,
        "regions": ["all"],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
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
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
]
