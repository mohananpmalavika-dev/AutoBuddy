# Frontend Integration with Canonical Vehicle Model

## ✅ Frontend Integration Status

### ServiceSelectionScreen.js
**Status:** ✅ UPDATED

**Changes Made:**
- Updated API endpoint from `/api/admin/vehicle-types/public/all` → **`/api/vehicles/public/all`**
- Now fetches from canonical vehicles API
- Falls back to hardcoded types if API fails
- Displays all 7 canonical vehicle types from backend

**Line Changed:**
```javascript
// Before:
endpoint: '/api/admin/vehicle-types/public/all',

// After:
endpoint: '/api/vehicles/public/all',  // ← Canonical endpoint
```

### BookingDetailsScreen.js
**Status:** ✅ NO CHANGES NEEDED

**Why:**
- Already uses `/api/bookings/estimate-fare` endpoint
- This endpoint was updated to query canonical vehicles collection
- Automatically uses correct multipliers now
- No frontend changes required - backend handles canonical model

### PassengerBookingNavigator.js
**Status:** ✅ NO CHANGES NEEDED
- Navigation wrapper doesn't interact with vehicle data
- Delegates to child components

### RideTypes API
**Status:** ✅ COMPATIBLE
- Ride types API (`/api/ride-types/public/all`) remains unchanged
- Frontend continues to use it as-is

---

## 🔄 Data Flow

### Before (Old System)
```
Frontend (Hardcoded)
  ├─ VEHICLE_TYPES array (hardcoded)
  └─ RIDE_TYPES array (hardcoded)
       ↓
Backend (Scattered)
  ├─ vehicle_types collection
  ├─ vehicle_types_extended collection  ← Duplicate!
  └─ Multipliers in code
```

### After (Canonical System)
```
Frontend
  ├─ ServiceSelectionScreen
  │  └─ Fetches: GET /api/vehicles/public/all ← Canonical
  │
  └─ BookingDetailsScreen
     └─ Calls: POST /api/bookings/estimate-fare
        └─ Backend uses canonical vehicles for multipliers ✓

Backend (Single Source)
  └─ vehicles collection (MongoDB)
     ├─ Canonical vehicle types
     ├─ Multipliers
     ├─ Subtypes
     └─ Ride type support
```

---

## 🧪 Frontend Testing

### 1. Test ServiceSelectionScreen Vehicle Loading
```javascript
// Expected behavior:
- Screen loads and shows loading spinner
- GET /api/vehicles/public/all is called
- 7 vehicle types should display:
  ✓ Auto (🛺, 0.75x)
  ✓ Taxi (🚖, 1.0x)
  ✓ XL (🚗, 1.25x)
  ✓ Traveller (🚐, 1.25x)
  ✓ Bus (🚌, 1.8x)
  ✓ Mini Truck (🚚, 1.5x)
  ✓ Truck (🚛, 1.8x)
- User can select vehicle and ride type
- "Continue" button navigates to BookingDetailsScreen
```

### 2. Test Fare Estimation with Canonical Multipliers
```javascript
// Expected behavior:
- BookingDetailsScreen loads
- User enters pickup/dropoff locations
- POST /api/bookings/estimate-fare is called with vehicle_type_id
- Fare should reflect canonical multiplier:
  - Auto: base × 0.75
  - Taxi: base × 1.0
  - XL: base × 1.25
  - etc.
- FareBreakdown shows vehicle multiplier explanation
- User can complete booking
```

### 3. Test Booking Confirmation
```javascript
// Expected behavior:
- POST /api/bookings/create with vehicle_type_id from canonical system
- Booking should store:
  - vehicle_type_id (from canonical)
  - vehicle_icon (from canonical)
  - vehicle_type_multiplier (from canonical)
- BookingConfirmationCard shows vehicle with multiplier badge
- TripDetailModal shows fare breakdown with multiplier explanation
```

---

## 📱 Frontend Components Affected

### Components Using Canonical Data:

| Component | Data Source | Status |
|-----------|------------|--------|
| ServiceSelectionScreen | `/api/vehicles/public/all` | ✅ Updated |
| BookingDetailsScreen | `/api/bookings/estimate-fare` | ✅ Using canonical |
| BookingConfirmationCard | Booking object (has vehicle_type_id) | ✅ Compatible |
| FareBreakdown | Booking object (has multiplier) | ✅ Compatible |
| TripDetailModal | Booking object | ✅ Compatible |

---

## 🔌 API Endpoints Used by Frontend

### Public Endpoints (No Auth Required)

**Get All Vehicles (Canonical)**
```
GET /api/vehicles/public/all
Response: Array of 7 canonical vehicle types
```

**Get Ride Types**
```
GET /api/ride-types/public/all
Response: Array of ride types
```

**Estimate Fare (with Canonical Multipliers)**
```
POST /api/bookings/estimate-fare
Body: {
  pickup_latitude, pickup_longitude,
  dropoff_latitude, dropoff_longitude,
  vehicle_type_id,  ← From canonical selection
  ride_type,        ← From canonical selection
  passenger_count
}
Response: Detailed fare breakdown with canonical multipliers
```

**Create Booking**
```
POST /api/bookings/create
Body: {
  ... all booking details ...
  vehicle_type_id,  ← From canonical
  ride_type,        ← From canonical
}
```

---

## 🎯 Frontend Implementation Checklist

- [x] ServiceSelectionScreen fetches from `/api/vehicles/public/all`
- [x] BookingDetailsScreen uses updated `/api/bookings/estimate-fare`
- [x] Fare calculation respects canonical multipliers
- [x] Vehicle selection stores vehicle_type_id from canonical system
- [x] Booking confirmation displays vehicle with multiplier
- [x] Fallback to hardcoded data if API fails
- [ ] Manual testing of vehicle selection flow
- [ ] Manual testing of fare estimation accuracy
- [ ] Manual testing of booking creation with correct multiplier

---

## 💡 How Multipliers Work in Frontend

### 1. User Selects Vehicle
```javascript
// User taps "Taxi" on ServiceSelectionScreen
selectedVehicleType = "taxi"
```

### 2. Frontend Sends to Backend
```javascript
POST /api/bookings/estimate-fare {
  vehicle_type_id: "taxi",  ← Sent to backend
  ride_type: "instant",
  ...
}
```

### 3. Backend Looks Up Canonical Vehicle
```python
# In bookings_extended.py
vehicle = await db.vehicles.find_one({"vehicle_type_id": "taxi"})
multiplier = vehicle["base_multiplier"]  # 1.0
```

### 4. Backend Calculates Fare with Multiplier
```python
base_fare = 40
vehicle_charge = base_fare * (multiplier - 1)  # 40 * 0 = 0
# Result: Same as base for taxi (1.0x multiplier)
```

### 5. Frontend Displays Breakdown
```javascript
// BookingDetailsScreen receives fare breakdown
const breakdown = {
  base: 40,
  distance: 144,
  time: 40,
  vehicle_premium: 0,  ← 0 because taxi is 1.0x (baseline)
  surge: 0,
  goods: 0,
  taxes: 42.12
}
```

---

## 🚀 Backend Endpoints Supporting Frontend

All these endpoints now use **canonical vehicles collection**:

1. ✅ `/api/vehicles/public/all` - Returns canonical vehicles
2. ✅ `/api/bookings/estimate-fare` - Uses canonical multipliers
3. ✅ `/api/bookings/create` - Stores canonical vehicle_type_id
4. ✅ `/api/ride-types/public/all` - Lists ride types
5. ✅ `/api/vehicles/public/multiplier/{vehicle_type_id}` - Get multiplier

---

## ⚙️ How to Test

### Step 1: Start Backend
```bash
cd backend
python server.py
```

### Step 2: Start Frontend
```bash
cd autobuddy-mobile
npm start
```

### Step 3: Test Vehicle Selection
1. Open PassengerMap
2. Tap "Book New Ride (Two-Screen Flow)" button
3. ServiceSelectionScreen should load
4. 7 canonical vehicle types should display
5. Select "Taxi" and "Instant Ride"
6. Tap "Continue"

### Step 4: Test Fare Estimation
1. BookingDetailsScreen should load
2. Enter a pickup location
3. Enter a dropoff location
4. Fare should estimate
5. Check if fare calculation is accurate

### Step 5: Test Multipliers
1. Select different vehicle types
2. For same pickup/dropoff:
   - Auto should be cheapest (0.75x)
   - Taxi should be baseline (1.0x)
   - XL should be higher (1.25x)
   - Bus should be highest (1.8x)
3. Verify percentage differences match multipliers

---

## 📊 Multiplier Reference for Testing

| Vehicle | Multiplier | Relative Cost |
|---------|-----------|---------------|
| Auto | 0.75x | -25% |
| Taxi | 1.0x | Baseline |
| XL | 1.25x | +25% |
| Traveller | 1.25x | +25% |
| Bus | 1.8x | +80% |
| Mini Truck | 1.5x | +50% |
| Truck | 1.8x | +80% |

**Example:** If Taxi costs ₹100, then:
- Auto costs ₹75 (0.75 × 100)
- XL costs ₹125 (1.25 × 100)
- Bus costs ₹180 (1.8 × 100)

---

## ✨ Benefits of Canonical Integration

✅ **Single Source of Truth** - Vehicles defined once in backend  
✅ **Dynamic Updates** - Admins can adjust multipliers without frontend changes  
✅ **Accurate Fares** - All fare calculations use canonical multipliers  
✅ **Easy Maintenance** - No duplicate vehicle definitions  
✅ **Consistent UX** - Same vehicle data across native and web  
✅ **Scalable** - Can add new vehicle types without code changes  

---

## 🔗 Integration Summary

| Component | Frontend | Backend | Status |
|-----------|----------|---------|--------|
| Vehicle Selection | ServiceSelectionScreen | `/api/vehicles/public/all` | ✅ Complete |
| Ride Type Selection | ServiceSelectionScreen | `/api/ride-types/public/all` | ✅ Complete |
| Fare Estimation | BookingDetailsScreen | `/api/bookings/estimate-fare` | ✅ Complete |
| Multiplier Lookup | (Backend) | vehicles collection | ✅ Complete |
| Booking Creation | BookingDetailsScreen | `/api/bookings/create` | ✅ Complete |
| Confirmation Display | BookingConfirmationCard | Booking object | ✅ Complete |

---

**Status:** ✅ Frontend Integration Complete - Ready for Testing
