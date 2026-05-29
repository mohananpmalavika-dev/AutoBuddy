# Backend Implementation Guide - Two-Screen Booking Flow

## Overview

This guide provides complete implementation details for the backend API endpoints needed to support the new two-screen booking flow.

---

## 1. Database Models

### vehicle_types collection (MongoDB)

```python
# models/VehicleType.py

from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class VehicleSubtype(BaseModel):
    id: str              # e.g., "auto_standard", "taxi_sedan"
    name: str            # e.g., "Standard", "Sedan"
    multiplier: float    # e.g., 0.75, 1.0, 1.5

class VehicleType(BaseModel):
    id: str                    # e.g., "auto", "taxi", "xl"
    name: str                  # e.g., "Auto", "Taxi"
    icon: str                  # emoji, e.g., "🛺"
    description: str           # e.g., "Budget friendly"
    base_multiplier: float     # Default multiplier if no subtype selected
    subtypes: List[VehicleSubtype] = []
    active: bool = True
    regions: List[str] = ["all"]  # States, districts, or "all"
    created_at: datetime
    updated_at: datetime
    
# MongoDB document structure:
{
    "_id": "auto",
    "name": "Auto",
    "icon": "🛺",
    "description": "Budget friendly, 3-4 seater",
    "base_multiplier": 0.75,
    "subtypes": [
        {
            "id": "auto_standard",
            "name": "Standard",
            "multiplier": 0.75
        }
    ],
    "active": True,
    "regions": ["all"],
    "created_at": datetime.now(),
    "updated_at": datetime.now()
}
```

### ride_types collection (MongoDB)

```python
# models/RideType.py

from pydantic import BaseModel
from typing import List
from datetime import datetime

class RideType(BaseModel):
    id: str                      # e.g., "instant", "scheduled"
    name: str                    # e.g., "Instant Ride"
    icon: str                    # emoji, e.g., "⚡"
    description: str             # e.g., "Book now, ride immediately"
    allowed_vehicle_types: List[str] = []  # e.g., ["auto", "taxi"]
    requires_scheduling: bool = False
    requires_destination: bool = True
    requires_passenger_count: bool = True
    active: bool = True
    regions: List[str] = ["all"]
    created_at: datetime
    updated_at: datetime

# MongoDB document:
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
    "created_at": datetime.now(),
    "updated_at": datetime.now()
}
```

### coverage_areas collection (MongoDB)

```python
# models/CoverageArea.py

from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class CoverageArea(BaseModel):
    id: str                      # e.g., "coverage_kerala_auto"
    level: str                   # "state", "district", "locality", "pincode"
    value: str                   # e.g., "Kerala", "Ernakulam", "682018"
    vehicle_types: List[str] = []  # Available vehicle types
    ride_types: List[str] = []     # Available ride types
    active: bool = True
    base_fare_multiplier: float = 1.0  # Regional price adjustment
    created_at: datetime
    updated_at: datetime

# MongoDB document:
{
    "_id": "coverage_kerala_auto",
    "level": "state",
    "value": "Kerala",
    "vehicle_types": ["auto", "taxi", "xl", "traveller"],
    "ride_types": ["instant", "scheduled", "rental"],
    "active": True,
    "base_fare_multiplier": 1.0,
    "created_at": datetime.now(),
    "updated_at": datetime.now()
}
```

---

## 2. API Endpoints

### Endpoint 1: GET /api/ride-types/public/all

**Purpose**: Fetch all available ride types

**Code**:
```python
# routes/ride_types.py

from fastapi import APIRouter, HTTPException
from models.RideType import RideType
from database import db

router = APIRouter(prefix="/api/ride-types", tags=["ride-types"])

@router.get("/public/all")
async def get_all_ride_types():
    """
    Fetch all active ride types
    
    Response:
    {
        "data": [
            {
                "id": "instant",
                "name": "Instant Ride",
                "icon": "⚡",
                "description": "Book now, ride immediately",
                "allowed_vehicle_types": ["auto", "taxi", ...],
                "active": true,
                "regions": ["all"]
            }
        ]
    }
    """
    try:
        ride_types = list(db.ride_types.find({"active": True}))
        
        # Remove MongoDB _id field
        for rt in ride_types:
            rt.pop("_id", None)
        
        return {
            "status": "success",
            "data": ride_types
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

---

### Endpoint 2: GET /api/admin/vehicle-types/public/all

**Purpose**: Fetch vehicle types with subtypes

**Code**:
```python
# routes/vehicle_types.py

from fastapi import APIRouter, HTTPException
from models.VehicleType import VehicleType
from database import db

router = APIRouter(prefix="/api/admin/vehicle-types", tags=["vehicle-types"])

@router.get("/public/all")
async def get_all_vehicle_types():
    """
    Fetch all active vehicle types with subtypes
    
    Response:
    {
        "data": [
            {
                "id": "auto",
                "name": "Auto",
                "icon": "🛺",
                "description": "Budget friendly",
                "base_multiplier": 0.75,
                "subtypes": [
                    {
                        "id": "auto_standard",
                        "name": "Standard",
                        "multiplier": 0.75
                    }
                ],
                "active": true,
                "regions": ["all"]
            }
        ]
    }
    """
    try:
        vehicle_types = list(db.vehicle_types.find({"active": True}))
        
        for vt in vehicle_types:
            vt.pop("_id", None)
        
        return {
            "status": "success",
            "data": vehicle_types
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

---

### Endpoint 3: POST /api/bookings/estimate-fare

**Purpose**: Calculate estimated fare for a booking

**Code**:
```python
# routes/bookings.py - estimate-fare endpoint

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from math import radians, cos, sin, asin, sqrt
from database import db
import os

router = APIRouter(prefix="/api/bookings", tags=["bookings"])

class FareEstimateRequest(BaseModel):
    pickup_latitude: float
    pickup_longitude: float
    dropoff_latitude: float
    dropoff_longitude: float
    vehicle_type_id: str
    vehicle_subtype_id: Optional[str] = None
    ride_type: str
    passenger_count: int = 1
    goods_weight_kg: Optional[float] = None
    is_scheduled: bool = False
    discount_percentage: float = 0

def haversine_distance(lat1, lon1, lat2, lon2):
    """
    Calculate the great circle distance between two points 
    on the earth (specified in decimal degrees)
    Returns distance in kilometers
    """
    # Convert to radians
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    
    # Haversine formula
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = sin(dlat / 2)**2 + cos(lat1) * cos(lat2) * sin(dlon / 2)**2
    c = 2 * asin(sqrt(a))
    
    # Radius of earth in kilometers
    km = 6371 * c
    return km

def get_vehicle_multiplier(vehicle_type_id: str, vehicle_subtype_id: Optional[str]) -> float:
    """Get multiplier for vehicle type/subtype"""
    vehicle = db.vehicle_types.find_one({"_id": vehicle_type_id})
    
    if not vehicle:
        return 1.0
    
    if vehicle_subtype_id:
        for subtype in vehicle.get("subtypes", []):
            if subtype["id"] == vehicle_subtype_id:
                return subtype.get("multiplier", 1.0)
    
    return vehicle.get("base_multiplier", 1.0)

def get_base_fare(vehicle_type_id: str, ride_type: str) -> float:
    """
    Get base fare for vehicle type and ride type
    
    Returns base fare in ₹
    """
    # Configuration (can be moved to database)
    BASE_FARES = {
        "instant": {
            "auto": 25,
            "taxi": 40,
            "xl": 50,
            "traveller": 60,
            "bus": 100,
            "minitruck": 80,
            "truck": 120
        },
        "scheduled": {  # Same as instant for now
            "auto": 25,
            "taxi": 40,
            "xl": 50,
            "traveller": 60,
            "bus": 100,
            "minitruck": 80,
            "truck": 120
        },
        "rental": {
            "auto": 200,      # Per hour
            "taxi": 300,
            "xl": 400,
            "traveller": 500,
            "bus": 800,
            "minitruck": 600,
            "truck": 900
        },
        "airport": {
            "auto": 50,        # Fixed + distance
            "taxi": 75,
            "xl": 100,
            "traveller": 150,
            "bus": 250,
            "minitruck": 150,
            "truck": 250
        },
        "corporate": {
            "auto": 40,
            "taxi": 60,
            "xl": 80,
            "traveller": 100,
            "bus": 200,
            "minitruck": 120,
            "truck": 180
        },
        "tourism": {
            "auto": 300,       # Per 4 hours
            "taxi": 500,
            "xl": 700,
            "traveller": 1000,
            "bus": 1500,
            "minitruck": 1200,
            "truck": 1800
        },
        "goods": {
            "minitruck": 100,  # Base, plus weight
            "truck": 150
        }
    }
    
    return BASE_FARES.get(ride_type, {}).get(vehicle_type_id, 50)

@router.post("/estimate-fare")
async def estimate_fare(request: FareEstimateRequest):
    """
    Estimate fare for a booking
    
    Calculation flow:
    1. Calculate distance using haversine
    2. Estimate time (avg speed ~20 km/h in city)
    3. Calculate base components:
       - Base fare
       - Distance charge (₹12 per km)
       - Time charge (₹2 per minute)
    4. Apply vehicle multiplier
    5. Apply surge pricing (1.0x for now)
    6. Add taxes (18% GST)
    """
    try:
        # Validate vehicle type exists
        vehicle = db.vehicle_types.find_one({"_id": request.vehicle_type_id})
        if not vehicle:
            raise HTTPException(status_code=400, detail="Invalid vehicle type")
        
        # Validate ride type exists
        ride_type = db.ride_types.find_one({"_id": request.ride_type})
        if not ride_type:
            raise HTTPException(status_code=400, detail="Invalid ride type")
        
        # Calculate distance
        distance_km = haversine_distance(
            request.pickup_latitude,
            request.pickup_longitude,
            request.dropoff_latitude,
            request.dropoff_longitude
        )
        
        # Ensure minimum distance
        distance_km = max(distance_km, 1.0)
        
        # Estimate duration (average speed ~20 km/h in city)
        # Add 5 minutes base time for pickup/dropoff
        duration_minutes = int((distance_km / 20) * 60 + 5)
        
        # Get base fare
        base_fare = get_base_fare(request.vehicle_type_id, request.ride_type)
        
        # Calculate components
        distance_charge = distance_km * 12  # ₹12 per km
        time_charge = duration_minutes * 2   # ₹2 per minute
        
        subtotal = base_fare + distance_charge + time_charge
        
        # Apply vehicle multiplier
        vehicle_multiplier = get_vehicle_multiplier(
            request.vehicle_type_id,
            request.vehicle_subtype_id
        )
        
        # Vehicle charge (only if multiplier > 1.0)
        vehicle_charge = subtotal * (vehicle_multiplier - 1)
        after_vehicle = subtotal + vehicle_charge
        
        # Apply surge pricing (can be dynamic)
        # For now, 1.0x (no surge)
        surge_multiplier = 1.0
        surge_charge = after_vehicle * (surge_multiplier - 1)
        after_surge = after_vehicle + surge_charge
        
        # Apply goods weight surcharge (if applicable)
        goods_charge = 0
        if request.goods_weight_kg and request.goods_weight_kg > 0:
            # ₹5 per kg
            goods_charge = request.goods_weight_kg * 5
        
        # Taxes (18% GST)
        tax_rate = 0.18
        taxable_amount = after_surge + goods_charge
        taxes = taxable_amount * tax_rate
        
        # Final fare
        estimated_fare = taxable_amount + taxes
        
        # Apply discount if provided
        if request.discount_percentage > 0:
            discount_amount = estimated_fare * (request.discount_percentage / 100)
            estimated_fare = estimated_fare - discount_amount
        
        return {
            "status": "success",
            "data": {
                "distance_km": round(distance_km, 2),
                "duration_minutes": duration_minutes,
                "base_fare": base_fare,
                "distance_charge": round(distance_charge, 2),
                "time_charge": round(time_charge, 2),
                "subtotal": round(subtotal, 2),
                "vehicle_multiplier": vehicle_multiplier,
                "vehicle_charge": round(vehicle_charge, 2),
                "after_vehicle": round(after_vehicle, 2),
                "surge_multiplier": surge_multiplier,
                "surge_charge": round(surge_charge, 2),
                "after_surge": round(after_surge, 2),
                "goods_charge": round(goods_charge, 2),
                "taxes": round(taxes, 2),
                "estimated_fare": round(estimated_fare, 2),
                "breakdown": {
                    "base": base_fare,
                    "distance": round(distance_charge, 2),
                    "time": round(time_charge, 2),
                    "vehicle_premium": round(vehicle_charge, 2),
                    "surge": round(surge_charge, 2),
                    "goods": round(goods_charge, 2),
                    "taxes": round(taxes, 2)
                }
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

---

### Endpoint 4: POST /api/bookings/create

**Purpose**: Create a new booking with vehicle and ride type

**Code**:
```python
# routes/bookings.py - create endpoint

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from database import db
from utils.auth import get_current_user
import uuid

class CreateBookingRequest(BaseModel):
    pickup_latitude: float
    pickup_longitude: float
    pickup_address: str
    dropoff_latitude: float
    dropoff_longitude: float
    dropoff_address: str
    vehicle_type_id: str
    vehicle_subtype_id: Optional[str] = None
    ride_type: str
    scheduled_pickup_time: Optional[str] = None
    passenger_count: int = 1
    goods_weight_kg: Optional[float] = None
    promo_code: Optional[str] = None

@router.post("/create")
async def create_booking(
    request: CreateBookingRequest,
    current_user = Depends(get_current_user)
):
    """
    Create a new booking with vehicle and ride type
    """
    try:
        # Validate passenger
        if not current_user or current_user.get("role") != "passenger":
            raise HTTPException(status_code=403, detail="Only passengers can create bookings")
        
        # Validate vehicle type
        vehicle = db.vehicle_types.find_one({"_id": request.vehicle_type_id})
        if not vehicle:
            raise HTTPException(status_code=400, detail="Invalid vehicle type")
        
        # Validate ride type
        ride_type_obj = db.ride_types.find_one({"_id": request.ride_type})
        if not ride_type_obj:
            raise HTTPException(status_code=400, detail="Invalid ride type")
        
        # Get vehicle multiplier
        vehicle_multiplier = 1.0
        if request.vehicle_subtype_id:
            for subtype in vehicle.get("subtypes", []):
                if subtype["id"] == request.vehicle_subtype_id:
                    vehicle_multiplier = subtype.get("multiplier", 1.0)
                    break
        else:
            vehicle_multiplier = vehicle.get("base_multiplier", 1.0)
        
        # Estimate fare
        distance_km = haversine_distance(
            request.pickup_latitude,
            request.pickup_longitude,
            request.dropoff_latitude,
            request.dropoff_longitude
        )
        distance_km = max(distance_km, 1.0)
        duration_minutes = int((distance_km / 20) * 60 + 5)
        
        base_fare = get_base_fare(request.vehicle_type_id, request.ride_type)
        distance_charge = distance_km * 12
        time_charge = duration_minutes * 2
        
        subtotal = base_fare + distance_charge + time_charge
        vehicle_charge = subtotal * (vehicle_multiplier - 1)
        after_vehicle = subtotal + vehicle_charge
        
        # For now, no surge pricing
        surge_multiplier = 1.0
        after_surge = after_vehicle
        
        # Goods charge
        goods_charge = 0
        if request.goods_weight_kg and request.goods_weight_kg > 0:
            goods_charge = request.goods_weight_kg * 5
        
        # Taxes
        taxable_amount = after_surge + goods_charge
        taxes = taxable_amount * 0.18
        
        estimated_fare = taxable_amount + taxes
        
        # Apply promo code if provided
        promo_discount = 0
        if request.promo_code:
            promo = db.promos.find_one({
                "code": request.promo_code,
                "active": True
            })
            if promo and promo.get("max_uses", -1) != 0:
                promo_discount = estimated_fare * (promo.get("discount_percentage", 0) / 100)
                estimated_fare = estimated_fare - promo_discount
                
                # Update promo usage
                db.promos.update_one(
                    {"_id": promo["_id"]},
                    {"$inc": {"uses": 1, "max_uses": -1}}
                )
        
        # Create booking
        booking_id = f"booking_{uuid.uuid4().hex[:12]}"
        
        booking = {
            "_id": booking_id,
            "passenger_id": current_user["_id"],
            "status": "pending",
            "vehicle_type_id": request.vehicle_type_id,
            "vehicle_subtype_id": request.vehicle_subtype_id,
            "ride_type": request.ride_type,
            "pickup_latitude": request.pickup_latitude,
            "pickup_longitude": request.pickup_longitude,
            "pickup_address": request.pickup_address,
            "dropoff_latitude": request.dropoff_latitude,
            "dropoff_longitude": request.dropoff_longitude,
            "dropoff_address": request.dropoff_address,
            "passenger_count": request.passenger_count,
            "goods_weight_kg": request.goods_weight_kg,
            "scheduled_pickup_time": request.scheduled_pickup_time,
            "distance_km": round(distance_km, 2),
            "duration_minutes": duration_minutes,
            "base_estimated_fare": base_fare,
            "vehicle_type_multiplier": vehicle_multiplier,
            "vehicle_charge": round(vehicle_charge, 2),
            "surge_multiplier": surge_multiplier,
            "promo_code": request.promo_code,
            "promo_discount": round(promo_discount, 2),
            "taxes": round(taxes, 2),
            "estimated_fare": round(estimated_fare, 2),
            "final_fare": None,
            "driver_id": None,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        }
        
        result = db.bookings.insert_one(booking)
        
        if not result.inserted_id:
            raise HTTPException(status_code=500, detail="Failed to create booking")
        
        # Trigger driver search (background task)
        # await search_drivers_task(booking_id, request.vehicle_type_id)
        
        return {
            "status": "success",
            "data": {
                "booking_id": booking_id,
                "status": "pending",
                "vehicle_type_id": request.vehicle_type_id,
                "ride_type": request.ride_type,
                "estimated_fare": round(estimated_fare, 2),
                "pickup_address": request.pickup_address,
                "dropoff_address": request.dropoff_address,
                "created_at": booking["created_at"].isoformat()
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

---

## 3. Seed Data

```python
# scripts/seed_data.py

from database import db
from datetime import datetime

def seed_vehicle_types():
    """Seed vehicle types with subtypes"""
    vehicle_types = [
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
        # ... more vehicle types
    ]
    
    db.vehicle_types.delete_many({})
    result = db.vehicle_types.insert_many(vehicle_types)
    print(f"Seeded {len(result.inserted_ids)} vehicle types")

def seed_ride_types():
    """Seed ride types"""
    ride_types = [
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
            "description": "Book for later time",
            "allowed_vehicle_types": ["auto", "taxi", "xl", "traveller"],
            "requires_scheduling": True,
            "requires_destination": True,
            "requires_passenger_count": True,
            "active": True,
            "regions": ["all"],
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        # ... more ride types
    ]
    
    db.ride_types.delete_many({})
    result = db.ride_types.insert_many(ride_types)
    print(f"Seeded {len(result.inserted_ids)} ride types")

def seed_coverage_areas():
    """Seed geographic coverage"""
    coverage_areas = [
        {
            "_id": "coverage_kerala_all",
            "level": "state",
            "value": "Kerala",
            "vehicle_types": ["auto", "taxi", "xl", "traveller"],
            "ride_types": ["instant", "scheduled", "rental", "airport", "corporate"],
            "active": True,
            "base_fare_multiplier": 1.0,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow()
        },
        # ... more coverage areas
    ]
    
    db.coverage_areas.delete_many({})
    result = db.coverage_areas.insert_many(coverage_areas)
    print(f"Seeded {len(result.inserted_ids)} coverage areas")

if __name__ == "__main__":
    seed_vehicle_types()
    seed_ride_types()
    seed_coverage_areas()
    print("✅ All seed data loaded successfully")
```

---

## 4. Configuration

### Update server.py

```python
# server.py

from fastapi import FastAPI
from routes import ride_types, vehicle_types, bookings
from database import db
import motor.motor_asyncio

app = FastAPI()

# Include routers
app.include_router(ride_types.router)
app.include_router(vehicle_types.router)
app.include_router(bookings.router)

@app.on_event("startup")
async def startup_event():
    """Initialize database and ensure indexes"""
    global db
    
    # Create indexes for faster queries
    db.vehicle_types.create_index("active")
    db.ride_types.create_index("active")
    db.bookings.create_index([("passenger_id", 1), ("created_at", -1)])
    db.bookings.create_index([("status", 1)])
    db.bookings.create_index([("vehicle_type_id", 1)])
    db.bookings.create_index([("ride_type", 1)])
    
    print("✅ Database indexes created")

@app.get("/health")
async def health_check():
    return {"status": "ok"}
```

---

## 5. Testing

```python
# tests/test_booking_flow.py

import pytest
from httpx import AsyncClient
from main import app

@pytest.mark.asyncio
async def test_estimate_fare():
    """Test fare estimation"""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/bookings/estimate-fare",
            json={
                "pickup_latitude": 13.0827,
                "pickup_longitude": 80.2707,
                "dropoff_latitude": 13.1939,
                "dropoff_longitude": 80.1180,
                "vehicle_type_id": "auto",
                "ride_type": "instant",
                "passenger_count": 1,
                "goods_weight_kg": None
            }
        )
        
        assert response.status_code == 200
        data = response.json()["data"]
        assert "distance_km" in data
        assert "estimated_fare" in data
        assert "breakdown" in data

@pytest.mark.asyncio
async def test_create_booking():
    """Test booking creation"""
    async with AsyncClient(app=app, base_url="http://test") as client:
        response = await client.post(
            "/api/bookings/create",
            json={
                "pickup_latitude": 13.0827,
                "pickup_longitude": 80.2707,
                "pickup_address": "Market Street",
                "dropoff_latitude": 13.1939,
                "dropoff_longitude": 80.1180,
                "dropoff_address": "Airport",
                "vehicle_type_id": "auto",
                "ride_type": "instant",
                "passenger_count": 1,
                "promo_code": None
            },
            headers={"Authorization": "Bearer test_token"}
        )
        
        assert response.status_code == 200
        data = response.json()["data"]
        assert "booking_id" in data
        assert data["status"] == "pending"
        assert "estimated_fare" in data
```

---

## Implementation Checklist

- [ ] Create MongoDB collections (vehicle_types, ride_types, coverage_areas)
- [ ] Create Pydantic models
- [ ] Implement GET /api/ride-types/public/all endpoint
- [ ] Implement GET /api/admin/vehicle-types/public/all endpoint
- [ ] Implement POST /api/bookings/estimate-fare endpoint
- [ ] Implement POST /api/bookings/create endpoint
- [ ] Seed database with vehicle types and ride types
- [ ] Create unit tests for fare calculation
- [ ] Create integration tests for booking flow
- [ ] Document API in Swagger/OpenAPI
- [ ] Deploy to staging environment
- [ ] Load test with concurrent requests
- [ ] Deploy to production

---

## Next Steps

1. Copy this guide to your backend development team
2. Create branch: `feature/two-screen-booking-api`
3. Implement endpoints in order listed above
4. Run tests after each endpoint
5. Integrate with frontend screens
6. Test end-to-end booking flow

---

**Status**: ✅ Complete Implementation Guide  
**Created**: May 30, 2026  
**Target Completion**: 5-7 days
