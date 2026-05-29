# Canonical Vehicle Model - Implementation Summary

## ✅ What Was Implemented

### 1. Core Canonical Vehicle Model
**File:** `backend/app/models/canonical_vehicle_model.py`

- **CanonicalVehicleType** Pydantic model with complete schema
- **CANONICAL_VEHICLE_TYPES** array with 7 vehicle types:
  - Auto (🛺) - 0.75x - 3 passengers
  - Taxi (🚖) - 1.0x - 4 passengers
  - XL (🚗) - 1.25x - 6 passengers
  - Traveller (🚐) - 1.25x - 8 passengers
  - Bus (🚌) - 1.8x - 40 passengers
  - Mini Truck (🚚) - 1.5x - 1000 kg
  - Truck (🚛) - 1.8x - 10000 kg

- **Helper Functions:**
  - `get_vehicle_by_id()` - Retrieve vehicle config
  - `get_vehicle_multiplier()` - Get fare multiplier (with subtype support)
  - `get_vehicle_capacity()` - Get capacity (with subtype support)
  - `supports_ride_type()` - Check ride type compatibility
  - `get_goods_carrying_vehicles()` - Filter goods vehicles
  - `get_passenger_vehicles()` - Filter passenger vehicles

### 2. Canonical Vehicles API Router
**File:** `backend/app/routers/vehicles_canonical.py`

**Public Endpoints (No Auth):**
- `GET /api/vehicles/public/all` - Get all vehicle types
- `GET /api/vehicles/public/{vehicle_type_id}` - Get specific vehicle
- `GET /api/vehicles/public/by-ride-type/{ride_type}` - Vehicles supporting ride type
- `GET /api/vehicles/public/goods-only` - Goods-carrying vehicles
- `GET /api/vehicles/public/multiplier/{vehicle_type_id}` - Get fare multiplier
- `GET /api/vehicles/public/capacity/{vehicle_type_id}` - Get capacity

**Admin Endpoints (Admin Role Required):**
- `POST /api/vehicles/admin/create` - Create vehicle type
- `PUT /api/vehicles/admin/{vehicle_type_id}` - Update vehicle type
- `DELETE /api/vehicles/admin/{vehicle_type_id}` - Disable vehicle type

**Automatic Initialization:**
- `init_canonical_vehicles()` function initializes vehicles collection on startup
- Creates MongoDB indexes for fast queries
- Seeds all 7 canonical vehicle types

### 3. Backend Integration

**server.py Changes:**
```python
# Import added (line ~90):
from app.routers.vehicles_canonical import router as modular_vehicles_canonical_router, init_canonical_vehicles

# Router registration added (line ~14685):
app.include_router(modular_vehicles_canonical_router)

# Startup initialization added (line ~1020):
try:
    await init_canonical_vehicles(db)
except Exception:
    logger.exception("Canonical vehicles initialization failed during startup")
```

**bookings_extended.py Updates:**
- Import canonical model helpers
- Updated `get_vehicle_multiplier()` to query vehicles collection first
- Updated `estimate_fare()` endpoint to validate against vehicles collection
- Updated `create_booking()` endpoint to validate against vehicles collection
- Fallback to helper functions if database query fails

### 4. Migration Tools

**File:** `backend/scripts/migrate_to_canonical_vehicles.py`

Features:
- Creates automatic backups before migration
- Maps old vehicle types to canonical IDs
- Migrates FleetVehicle records (vehicle_type → vehicle_type_id)
- Migrates driver records (vehicle_type → vehicle_type_id)
- Validates canonical vehicles exist
- Prints migration summary with statistics
- Supports rollback to backup collections

Usage:
```bash
python backend/scripts/migrate_to_canonical_vehicles.py
```

### 5. Database Schema

**vehicles Collection:**
```javascript
{
  _id: "auto",  // indexed for fast lookups
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
  subtypes: [{id: "auto_standard", name: "Standard", multiplier: 0.75}],
  regions: ["all"],
  active: true,
  created_at: ISODate(...),
  updated_at: ISODate(...)
}
```

**Indexes Created:**
- `_id` (unique)
- `vehicle_type_id` (unique)
- `[allowed_ride_types, active]` (compound)
- `[goods_supported, active]` (compound)

---

## 📋 Next Steps for Testing & Integration

### Phase 1: Backend Testing (Manual)
1. **Start server:**
   ```bash
   cd backend && python server.py
   ```

2. **Check health:**
   ```bash
   curl http://localhost:8000/health
   ```

3. **Test canonical vehicles API:**
   ```bash
   # Get all vehicles
   curl http://localhost:8000/api/vehicles/public/all
   
   # Get specific vehicle
   curl http://localhost:8000/api/vehicles/public/taxi
   
   # Get multiplier
   curl http://localhost:8000/api/vehicles/public/multiplier/taxi
   ```

4. **Test fare estimation:**
   ```bash
   curl -X POST http://localhost:8000/api/bookings/estimate-fare \
     -H "Content-Type: application/json" \
     -d '{
       "pickup_latitude": 8.5241,
       "pickup_longitude": 76.9366,
       "dropoff_latitude": 8.5350,
       "dropoff_longitude": 76.9450,
       "vehicle_type_id": "taxi",
       "ride_type": "instant",
       "passenger_count": 1
     }'
   ```

### Phase 2: Run Migration (One-Time)
```bash
python backend/scripts/migrate_to_canonical_vehicles.py
```

This will:
- ✓ Backup fleet_vehicles and users collections
- ✓ Migrate vehicle type references
- ✓ Validate canonical vehicles
- ✓ Print migration summary

### Phase 3: Frontend Integration
Update frontend components to use canonical vehicles API:

**ServiceSelectionScreen.js:**
```javascript
// Replace hardcoded VEHICLE_TYPES with API call
const response = await fetch('/api/vehicles/public/all');
const vehicles = await response.json();
```

**BookingDetailsScreen.js:**
```javascript
// Already uses /api/bookings/estimate-fare which now uses canonical model
// No changes needed - fare calculation now uses canonical multipliers
```

### Phase 4: Verification Checklist

- [ ] Server starts without errors
- [ ] `/api/vehicles/public/all` returns 7 vehicle types
- [ ] Fare estimation works with each vehicle type
- [ ] Multipliers are correct (auto=0.75, taxi=1.0, etc.)
- [ ] Booking creation stores vehicle_type_id correctly
- [ ] Goods support is correct for minitruck/truck
- [ ] Migration script completes successfully
- [ ] Driver vehicle types are updated
- [ ] Fleet vehicles are updated
- [ ] No duplicate vehicle definitions in code

---

## 🔧 How to Use Canonical Model in Code

### Get Vehicle Info
```python
from app.models.canonical_vehicle_model import get_vehicle_by_id, CANONICAL_VEHICLE_TYPES

# Get from memory
vehicle = get_vehicle_by_id("taxi")
print(vehicle["name"])  # "Taxi"
print(vehicle["base_multiplier"])  # 1.0

# Or iterate
for vehicle in CANONICAL_VEHICLE_TYPES:
    if vehicle["goods_supported"]:
        print(f"{vehicle['name']} supports goods")
```

### Check Capabilities
```python
from app.models.canonical_vehicle_model import supports_ride_type, get_goods_carrying_vehicles

# Check if taxi supports airport rides
can_airport = supports_ride_type("taxi", "airport")  # True

# Get all goods vehicles
goods_vehicles = get_goods_carrying_vehicles()  # ["minitruck", "truck"]
```

### Calculate Fare
```python
from app.models.canonical_vehicle_model import get_vehicle_multiplier, get_vehicle_capacity

# Get multiplier for XL sedan
multiplier = get_vehicle_multiplier("xl", subtype_id="xl_suv")  # 1.5x

# Get capacity for bus
capacity = get_vehicle_capacity("bus", subtype_id="bus_city")  # 40 passengers

# Calculate fare
base_fare = 100
total_fare = base_fare * multiplier  # 150
```

### Query Database
```python
# Get vehicle from MongoDB
vehicle = await db.vehicles.find_one({"vehicle_type_id": "taxi"})

# Get all active vehicles
active_vehicles = await db.vehicles.find({"active": True}).to_list(None)

# Get vehicles supporting instant rides
instant_vehicles = await db.vehicles.find({
    "allowed_ride_types": "instant",
    "active": True
}).to_list(None)
```

---

## 📚 Files Modified/Created

### Created Files:
```
backend/app/models/canonical_vehicle_model.py (500 lines)
backend/app/routers/vehicles_canonical.py (480 lines)
backend/scripts/migrate_to_canonical_vehicles.py (300 lines)
CANONICAL_VEHICLE_MODEL_GUIDE.md (400+ lines)
```

### Modified Files:
```
backend/server.py
  - Added import for vehicles_canonical router
  - Added router registration
  - Added init_canonical_vehicles() to startup

backend/app/routers/bookings_extended.py
  - Added imports for canonical model
  - Updated get_vehicle_multiplier() to query vehicles collection
  - Updated estimate_fare() validation
  - Updated create_booking() validation
```

---

## 🚀 Benefits

✅ **Single Source of Truth:** One canonical definition for all vehicles  
✅ **Consistency:** No duplicate vehicle types across codebase  
✅ **Flexibility:** Easy to add new fields without code changes  
✅ **Performance:** Indexed database queries instead of code lookups  
✅ **Admin Control:** Admins can update vehicle types via API  
✅ **Scalability:** Support for subtypes and regional customization  
✅ **Audit Trail:** All changes recorded with timestamps  
✅ **Backward Compatible:** Helper functions work without database  

---

## 🔄 Architecture Overview

```
Frontend
  └─ ServiceSelectionScreen → GET /api/vehicles/public/all
  └─ BookingDetailsScreen → POST /api/bookings/estimate-fare
                            └─ Uses canonical multipliers

Backend Routers
  ├─ vehicles_canonical.py
  │  ├─ GET /api/vehicles/public/* (public)
  │  └─ POST/PUT/DELETE /api/vehicles/admin/* (admin)
  │
  └─ bookings_extended.py
     ├─ POST /api/bookings/estimate-fare
     └─ POST /api/bookings/create
        └─ Uses get_vehicle_multiplier() → vehicles collection

Database
  └─ vehicles collection (MongoDB)
     ├─ auto
     ├─ taxi
     ├─ xl
     ├─ traveller
     ├─ bus
     ├─ minitruck
     └─ truck

Memory (Code)
  └─ canonical_vehicle_model.py
     ├─ CANONICAL_VEHICLE_TYPES array
     ├─ Helper functions
     └─ Fallback for queries
```

---

## 🐛 Troubleshooting

**Issue:** Vehicle not found  
**Solution:** Check `/api/vehicles/public/all` to verify initialization

**Issue:** Multiplier returning 1.0  
**Solution:** This is by design - invalid types default to 1.0 for safety

**Issue:** Migration failed  
**Solution:** Check backup collections exist, restore, and retry

**Issue:** Duplicate vehicle types  
**Solution:** Remove old vehicle_types collection after verified migration

---

## 📞 Support

If issues arise during testing:
1. Check server logs for error messages
2. Verify all imports in modified files
3. Ensure MongoDB is running
4. Check migration backup collections
5. Review database indexes with: `db.vehicles.getIndexes()`

---

**Status:** ✅ Implementation Complete - Ready for Manual Testing
