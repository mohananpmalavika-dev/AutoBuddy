"""
Vehicle Subtypes and Extended Vehicle Models
"""

from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class VehicleSubtype(BaseModel):
    id: str
    name: str
    multiplier: float
    
    class Config:
        from_attributes = True

class VehicleTypeExtended(BaseModel):
    id: str
    name: str
    icon: str
    description: str
    base_multiplier: float
    subtypes: List[VehicleSubtype] = []
    active: bool = True
    regions: List[str] = ["all"]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# Extended vehicle types with subtypes
EXTENDED_VEHICLE_TYPES = [
    {
        "_id": "auto",
        "name": "Auto",
        "icon": "🛺",
        "description": "Budget friendly, 3-4 seater",
        "base_multiplier": 0.75,
        "subtypes": [
            {"id": "auto_standard", "name": "Standard", "multiplier": 0.75}
        ],
        "active": True,
        "regions": ["all"],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    },
    {
        "_id": "taxi",
        "name": "Taxi",
        "icon": "🚖",
        "description": "Comfortable, 4 seater",
        "base_multiplier": 1.0,
        "subtypes": [
            {"id": "taxi_sedan", "name": "Sedan", "multiplier": 1.0},
            {"id": "taxi_hatchback", "name": "Hatchback", "multiplier": 0.95}
        ],
        "active": True,
        "regions": ["all"],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    },
    {
        "_id": "xl",
        "name": "XL",
        "icon": "🚗",
        "description": "More space, 5-6 seater",
        "base_multiplier": 1.25,
        "subtypes": [
            {"id": "xl_suv", "name": "SUV", "multiplier": 1.5},
            {"id": "xl_wagon", "name": "Wagon", "multiplier": 1.25}
        ],
        "active": True,
        "regions": ["all"],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    },
    {
        "_id": "traveller",
        "name": "Traveller",
        "icon": "🚐",
        "description": "Group travel, 6-8 seater",
        "base_multiplier": 1.25,
        "subtypes": [
            {"id": "traveller_6seat", "name": "6-seater", "multiplier": 1.25},
            {"id": "traveller_8seat", "name": "8-seater", "multiplier": 1.35}
        ],
        "active": True,
        "regions": ["all"],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    },
    {
        "_id": "bus",
        "name": "Bus",
        "icon": "🚌",
        "description": "Large groups, 20+ seater",
        "base_multiplier": 1.8,
        "subtypes": [
            {"id": "bus_city", "name": "City Bus", "multiplier": 1.8},
            {"id": "bus_coach", "name": "Coach", "multiplier": 2.0}
        ],
        "active": True,
        "regions": ["all"],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    },
    {
        "_id": "minitruck",
        "name": "Mini Truck",
        "icon": "🚚",
        "description": "Small goods, up to 1T",
        "base_multiplier": 1.5,
        "subtypes": [
            {"id": "minitruck_500kg", "name": "500kg", "multiplier": 1.5},
            {"id": "minitruck_1000kg", "name": "1000kg", "multiplier": 1.5}
        ],
        "active": True,
        "regions": ["all"],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    },
    {
        "_id": "truck",
        "name": "Truck",
        "icon": "🚛",
        "description": "Heavy goods, 2.5T - 10T+",
        "base_multiplier": 1.8,
        "subtypes": [
            {"id": "truck_2_5t", "name": "2.5T", "multiplier": 1.8},
            {"id": "truck_5t", "name": "5T", "multiplier": 2.0},
            {"id": "truck_10t", "name": "10T", "multiplier": 2.2}
        ],
        "active": True,
        "regions": ["all"],
        "created_at": datetime.utcnow(),
        "updated_at": datetime.utcnow()
    }
]
