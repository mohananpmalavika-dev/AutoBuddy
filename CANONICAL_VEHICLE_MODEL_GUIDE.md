# Canonical Vehicle Model - Complete Integration Guide

## Overview

The **Canonical Vehicle Model** is a unified, single-source-of-truth system for managing all vehicle types across the AutoBuddy platform. It replaces scattered vehicle definitions across multiple routers and collections.

### What It Solves

**Before (Fragmented System):**
```
FleetVehicle model → vehicle_type: "economy", "comfort", etc.
Driver users → vehicle_type: "auto", "taxi", etc.
vehicle_types collection → 2_wheeler, 3_wheeler, etc.
vehicle_types_extended → auto, taxi, xl, etc.
Ride products → base_multiplier defined in code
```

**After (Unified System):**
```
CANONICAL_VEHICLE_TYPES in canonical_vehicle_model.py
↓
canonical_vehicle_types collection (database)
↓
All references → canonical vehicle_type_id
```

---

## Database Schema

### canonical_vehicle_types Collection

```javascript
{
  _id: "auto",  // Same as vehicle_type_id for fast lookups
  vehicle_type_id: "auto",
  name: "Auto",
  name_ml: "ഓട്ടോ",
  icon: "🛺",
  description: "Budget-friendly, 3-4 seater auto rickshaw",
  capacity: 3,
  capacity_unit: "passengers",
  base_multiplier: 0.75,
  
  allowed_ride_types: ["instant", "scheduled"],
  goods_supported: false,
  passenger_supported: true,
  accessibility_support: false,
  
  subtypes: [
    {
      id: "auto_standard",
      name: "Standard",
      multiplier: 0.75
    }
  ],
  
  regions: ["all"],
  active: true,
  created_at: ISODate("2024-01-01T00:00:00Z"),
  updated_at: ISODate("2024-01-01T00:00:00Z")
}
```

### Canonical Vehicle Types

```
ID          Name        Icon  Capacity  Multiplier  Type
---         ----        ----  --------  ----------  ----
auto        Auto        🛺    3         0.75x       Passenger
taxi        Taxi        🚖    4         1.0x        Passenger (Standard)
xl          XL          🚗    6         1.25x       Passenger
traveller   Traveller   🚐    8         1.25x       Passenger (Group)
bus         Bus         🚌    40        1.8x        Passenger (Large)
minitruck   Mini Truck  🚚    1000kg    1.5x        Goods
truck       Truck       🚛    10000kg   1.8x        Goods
```

---

## API Endpoints

### Public Endpoints (No Authentication)

#### Get All Vehicle Types
```
GET /api/vehicles/public/all?active_only=true

Response:
{
  "data": [
    {
      "vehicle_type_id": "auto",
      "name": "Auto",
      "icon": "🛺",
      "capacity": 3,
      "base_multiplier": 0.75,
      ...
    }
  ]
}
```

#### Get Specific Vehicle
```
GET /api/vehicles/public/auto

Response:
{
  "vehicle_type_id": "auto",
  "name": "Auto",
  "description": "Budget-friendly, 3-4 seater auto rickshaw",
  "icon": "🛺",
  "capacity": 3,
  "capacity_unit": "passengers",
  "base_multiplier": 0.75,
  "allowed_ride_types": ["instant", "scheduled"],
  "goods_supported": false,
  "passenger_supported": true,
  "subtypes": [...]
}
```

#### Get Vehicles by Ride Type
```
GET /api/vehicles/public/by-ride-type/instant

Response: [List of vehicles supporting instant rides]
```

#### Get Goods Delivery Vehicles
```
GET /api/vehicles/public/goods-only

Response: [minitruck, truck]
```

#### Get Multiplier for Vehicle
```
GET /api/vehicles/public/multiplier/taxi?subtype_id=taxi_sedan

Response:
{
  "vehicle_type_id": "taxi",
  "subtype_id": "taxi_sedan",
  "multiplier": 1.0
}
```

#### Get Capacity for Vehicle
```
GET /api/vehicles/public/capacity/bus?subtype_id=bus_city

Response:
{
  "vehicle_type_id": "bus",
  "subtype_id": "bus_city",
  "capacity": 40,
  "capacity_unit": "passengers"
}
```

### Admin Endpoints (Requires admin role)

#### Create Vehicle Type
```
POST /api/vehicles/admin/create

Body:
{
  "vehicle_type_id": "bike",
  "name": "Bike",
  "icon": "🏍️",
  "description": "2-wheeler motorcycle",
  "capacity": 2,
  "base_multiplier": 0.6,
  "allowed_ride_types": ["instant"],
  "goods_supported": false,
  "passenger_supported": true
}
```

#### Update Vehicle Type
```
PUT /api/vehicles/admin/taxi

Body:
{
  "base_multiplier": 1.1,  # Increase taxi rates by 10%
  "active": true
}
```

#### Disable Vehicle Type
```
DELETE /api/vehicles/admin/taxi
```

---

## Code Integration

### 1. Using in Fare Calculation

**Before:**
```python
# Scattered across multiple files
if vehicle_type == "economy":
    multiplier = 0.8
elif vehicle_type == "comfort":
    multiplier = 1.0
elif vehicle_type == "premium":
    multiplier = 1.25
```

**After:**
```python
from app.models.canonical_vehicle_model import get_vehicle_multiplier

multiplier = get_vehicle_multiplier(vehicle_type_id="taxi", subtype_id="taxi_sedan")
# Returns: 1.0
```

### 2. Checking Ride Type Support

**Before:**
```python
# Had to maintain separate compatibility matrices
if ride_type == "instant" and vehicle_type in ["economy", "comfort"]:
    supported = True
```

**After:**
```python
from app.models.canonical_vehicle_model import supports_ride_type

if supports_ride_type("taxi", "instant"):
    # Taxi supports instant rides
    pass
```

### 3. Getting Vehicle Capacity

**Before:**
```python
# Scattered across different models
vehicle_capacity = VEHICLE_CAPACITIES.get(vehicle_type, 4)
```

**After:**
```python
from app.models.canonical_vehicle_model import get_vehicle_capacity

capacity = get_vehicle_capacity("bus", subtype_id="bus_city")
# Returns: 40
```

### 4. Filtering by Service Type

**Before:**
```python
# Maintain multiple lists
passenger_vehicles = ["economy", "comfort", "premium"]
goods_vehicles = ["mini_truck", "truck"]
```

**After:**
```python
from app.models.canonical_vehicle_model import (
    get_goods_carrying_vehicles,
    get_passenger_vehicles
)

passenger_types = get_passenger_vehicles()
# Returns: ["auto", "taxi", "xl", "traveller", "bus"]

goods_types = get_goods_carrying_vehicles()
# Returns: ["minitruck", "truck"]
```

### 5. Accessing via Database Query

```python
from motor.motor_asyncio import AsyncIOMotorDatabase

async def get_vehicle_by_type(db: AsyncIOMotorDatabase, vehicle_type_id: str):
    vehicle = await db.canonical_vehicle_types.find_one({"vehicle_type_id": vehicle_type_id})
    return vehicle
```

---

## Migration Path

### Step 1: Pre-Migration (Backup)
```bash
# The migration script creates backups automatically
# Backup collections created:
# - fleet_vehicles_backup_20240115_120000
# - users_backup_20240115_120000
```

### Step 2: Run Migration
```bash
python backend/scripts/migrate_to_canonical_vehicles.py
```

### Step 3: What Gets Migrated
- **FleetVehicle records**: `vehicle_type` → `vehicle_type_id`
- **Driver records**: `vehicle_type` → `vehicle_type_id`
- **Old type mappings**: economy→auto, comfort→taxi, premium→xl, etc.

### Step 4: Verification
```bash
# Check migration summary output for:
# ✓ All canonical vehicle types present
# ✓ Fleet vehicles migrated
# ✓ Driver vehicles migrated
```

### Step 5: Rollback (If Needed)
```bash
# Restore from backup collections manually
db.fleet_vehicles.deleteMany({})
db.fleet_vehicles.insertMany(db.fleet_vehicles_backup_20240115_120000.find().toArray())
```

---

## Implementation Checklist

- [ ] **Backend Integration**
  - [x] Create `canonical_vehicle_model.py` with complete schema
  - [x] Create `vehicles_canonical.py` router with all endpoints
  - [x] Add router import and registration in `server.py`
  - [x] Add `init_canonical_vehicles()` to startup event
  - [ ] Update `bookings_extended.py` to use canonical multipliers
  - [ ] Update fare calculation across all routers
  - [ ] Run migration script

- [ ] **Frontend Update**
  - [ ] Update `ServiceSelectionScreen.js` to call `/api/vehicles/public/all`
  - [ ] Update `BookingDetailsScreen.js` fare display
  - [ ] Update vehicle selection UI with canonical data

- [ ] **Testing**
  - [ ] Create booking with each vehicle type
  - [ ] Verify fare calculation with multipliers
  - [ ] Test ride type filtering
  - [ ] Test goods vs passenger vehicles
  - [ ] Admin: Create/update/delete vehicle types

- [ ] **Documentation**
  - [ ] Update API documentation
  - [ ] Train support team on admin endpoints
  - [ ] Document multiplier system

---

## Common Operations

### For Developers

**Get all active vehicles:**
```python
from app.models.canonical_vehicle_model import CANONICAL_VEHICLE_TYPES
vehicles = [v for v in CANONICAL_VEHICLE_TYPES if v.get("active")]
```

**Check if vehicle supports service:**
```python
from app.models.canonical_vehicle_model import supports_ride_type
if supports_ride_type("taxi", "airport"):
    # Taxi can be used for airport rides
```

**Calculate total fare with multiplier:**
```python
from app.models.canonical_vehicle_model import get_vehicle_multiplier

base_fare = 100
vehicle_multiplier = get_vehicle_multiplier("xl")  # 1.25
total_fare = base_fare * vehicle_multiplier  # 125
```

### For Admins

**Add new vehicle type via API:**
```bash
curl -X POST http://localhost:8000/api/vehicles/admin/create \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "vehicle_type_id": "bike",
    "name": "Bike",
    "icon": "🏍️",
    "description": "2-wheeler motorcycle",
    "capacity": 2,
    "base_multiplier": 0.6
  }'
```

**Update multiplier:**
```bash
curl -X PUT http://localhost:8000/api/vehicles/admin/taxi \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"base_multiplier": 1.1}'
```

---

## Benefits of Canonical Model

1. **Single Source of Truth**: One place to define vehicle properties
2. **Consistency**: No duplicate definitions across multiple files
3. **Flexibility**: Easy to add new fields (e.g., eco_friendly, vehicle_class)
4. **Scalability**: Support for subtypes and regional customization
5. **Performance**: Indexed database queries instead of code lookups
6. **Admin Control**: Admins can update vehicle types without code changes
7. **Audit Trail**: All changes recorded with timestamps

---

## Troubleshooting

### Issue: "Vehicle type not found"
**Solution**: Check that vehicle exists in the `canonical_vehicle_types` collection
```bash
db.canonical_vehicle_types.find({vehicle_type_id: "taxi"})
```

### Issue: Multiplier returning 1.0 for invalid types
**Solution**: This is by design - invalid types default to 1.0 for safety
```python
# To check if valid:
vehicle = get_vehicle_by_id("invalid_type")
if not vehicle:
    print("Invalid vehicle type")
```

### Issue: Migration failed
**Solution**: 
1. Check backup collections exist
2. Review migration logs
3. Restore from backup and retry

---

## Next Steps

1. ✅ **Phase 1**: Create canonical model (DONE)
2. ⏳ **Phase 2**: Integrate with bookings router
3. ⏳ **Phase 3**: Run migration
4. ⏳ **Phase 4**: Update frontend
5. ⏳ **Phase 5**: Remove old vehicle_types collections
