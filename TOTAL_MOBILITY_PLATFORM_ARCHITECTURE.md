# Total Mobility Platform - Architecture & Implementation Plan

## Overview

Transform AutoBuddy from a ride-sharing app into a **Total Mobility Platform** supporting multiple vehicle types, ride types, and admin-controlled geographic coverage.

---

## 1. Frontend Architecture

### Screen Flow

```
LOGIN
  ↓
PASSENGER MAP (Dashboard)
  ↓ [User taps "Book a Ride"]
SERVICE SELECTION SCREEN
  ├─ Select Vehicle Type (Auto, Taxi, XL, Traveller, Bus, Mini Truck, Truck)
  └─ Select Ride Type (Instant, Scheduled, Rental, Airport, Corporate, Tourism, Goods)
  ↓ [User taps "Continue"]
BOOKING DETAILS SCREEN
  ├─ Enter Pickup Location
  ├─ Enter Dropoff Location
  ├─ Set Date/Time (if scheduled)
  ├─ Passenger Count / Goods Weight
  ├─ Promo Code
  └─ Fare Estimate
  ↓ [User taps "Find Driver"]
BOOKING CONFIRMATION
  ↓
RIDE PROGRESS
```

### New Components Created

1. **ServiceSelectionScreen.js** ✅
   - Displays 7 vehicle types with icons and descriptions
   - Displays 7 ride types with descriptions
   - Shows vehicle subtypes (e.g., 2-wheeler std, 4-wheeler sedan/SUV)
   - Validates selections before continuing

2. **BookingDetailsScreen.js** ✅
   - Location input with autocomplete
   - Saved places quick-select
   - Date/time picker (for scheduled rides)
   - Passenger count / goods weight counters
   - Promo code input
   - Real-time fare estimation
   - Book/Find Driver button

3. **PassengerBookingNavigator.js** ✅
   - Manages navigation between screens
   - Handles back/cancel flows
   - Passes data between screens

---

## 2. Backend API Specification

### New Endpoints

#### 2.1 Ride Types Management

**GET /api/ride-types/public/all**
```json
Response:
{
  "data": [
    {
      "id": "instant",
      "name": "Instant Ride",
      "description": "Book now, ride immediately",
      "active": true,
      "regions": ["all"]
    },
    {
      "id": "scheduled",
      "name": "Scheduled Ride",
      "description": "Book for later time",
      "active": true,
      "regions": ["all"]
    },
    // ... more ride types
  ]
}
```

#### 2.2 Vehicle Types with Subtypes

**GET /api/admin/vehicle-types/public/all**
```json
Response:
{
  "data": [
    {
      "id": "auto",
      "name": "Auto",
      "icon": "🛺",
      "base_multiplier": 0.75,
      "subtypes": [
        {
          "id": "auto_standard",
          "name": "Standard",
          "multiplier": 0.75
        }
      ],
      "active": true,
      "regions": ["Kerala", "Tamil Nadu"]
    },
    {
      "id": "taxi",
      "name": "Taxi",
      "icon": "🚖",
      "base_multiplier": 1.0,
      "subtypes": [
        {
          "id": "taxi_sedan",
          "name": "Sedan",
          "multiplier": 1.0
        },
        {
          "id": "taxi_hatchback",
          "name": "Hatchback",
          "multiplier": 0.95
        }
      ],
      "active": true,
      "regions": ["all"]
    },
    // ... more vehicle types
  ]
}
```

#### 2.3 Fare Estimation

**POST /api/bookings/estimate-fare**
```json
Request:
{
  "pickup_latitude": 13.0827,
  "pickup_longitude": 80.2707,
  "dropoff_latitude": 13.1939,
  "dropoff_longitude": 80.1180,
  "vehicle_type_id": "auto",
  "vehicle_subtype_id": "auto_standard",
  "ride_type": "instant",
  "passenger_count": 2,
  "goods_weight_kg": null,
  "is_scheduled": false
}

Response:
{
  "data": {
    "distance_km": 15.2,
    "duration_minutes": 28,
    "base_fare": 200,
    "distance_charge": 152,
    "time_charge": 56,
    "subtotal": 408,
    "vehicle_multiplier": 0.75,
    "vehicle_charge": -102,
    "after_vehicle": 306,
    "surge_multiplier": 1.0,
    "surge_charge": 0,
    "after_surge": 306,
    "taxes": 55,
    "estimated_fare": 361,
    "breakdown": {
      "base": 200,
      "distance": 152,
      "time": 56,
      "vehicle_premium": -102,
      "surge": 0,
      "taxes": 55
    }
  }
}
```

#### 2.4 Create Booking with Ride Type

**POST /api/bookings/create**
```json
Request:
{
  "pickup_latitude": 13.0827,
  "pickup_longitude": 80.2707,
  "pickup_address": "Market Street, Kochi",
  "dropoff_latitude": 13.1939,
  "dropoff_longitude": 80.1180,
  "dropoff_address": "Kochi Airport, Terminal 3",
  "vehicle_type_id": "auto",
  "vehicle_subtype_id": "auto_standard",
  "ride_type": "instant",
  "scheduled_pickup_time": null,
  "passenger_count": 2,
  "goods_weight_kg": null,
  "promo_code": "WELCOME50"
}

Response:
{
  "data": {
    "booking_id": "booking_xyz789",
    "status": "searching",
    "vehicle_type_id": "auto",
    "vehicle_subtype_id": "auto_standard",
    "ride_type": "instant",
    "estimated_fare": 361,
    "pickup_address": "Market Street, Kochi",
    "dropoff_address": "Kochi Airport, Terminal 3",
    "created_at": "2026-05-30T10:30:00Z"
  }
}
```

---

## 3. Database Schema Extensions

### Vehicle Types Table
```sql
CREATE TABLE vehicle_types (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  icon CHAR(1),
  description VARCHAR(255),
  base_multiplier FLOAT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Vehicle Subtypes Table
```sql
CREATE TABLE vehicle_subtypes (
  id VARCHAR(50) PRIMARY KEY,
  vehicle_type_id VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  multiplier FLOAT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id)
);
```

### Ride Types Table
```sql
CREATE TABLE ride_types (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255),
  icon CHAR(1),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Geographic Coverage Table
```sql
CREATE TABLE coverage_areas (
  id VARCHAR(50) PRIMARY KEY,
  level VARCHAR(20),  -- 'state', 'district', 'locality', 'pincode'
  value VARCHAR(100),
  vehicle_type_id VARCHAR(50),
  ride_type_id VARCHAR(50),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  FOREIGN KEY (vehicle_type_id) REFERENCES vehicle_types(id),
  FOREIGN KEY (ride_type_id) REFERENCES ride_types(id)
);
```

### Bookings Table Extensions
```sql
ALTER TABLE bookings ADD COLUMN (
  vehicle_subtype_id VARCHAR(50),
  ride_type VARCHAR(50),
  passenger_count INT,
  goods_weight_kg FLOAT,
  scheduled_pickup_time TIMESTAMP,
  is_scheduled BOOLEAN
);
```

---

## 4. Admin Panel Features

### Vehicle Type Management

**Admin Menu**: Administration → Vehicle & Service Management → Vehicle Types

**Features:**
1. **List View**
   - All vehicle types with active status
   - Edit/Delete/Disable buttons
   - Filter by region

2. **Add Vehicle Type**
   - Name, Icon, Description
   - Base Multiplier
   - Subtypes (add multiple)
   - Regions (checkboxes for each state/district)
   - Active/Inactive toggle

3. **Edit Vehicle Type**
   - Modify all fields
   - Add/remove subtypes
   - Update regional availability
   - Adjust multipliers

4. **Regional Coverage**
   - Select level: State → District → Locality → Pincode
   - Choose which vehicle types available in each area
   - Set multiplier overrides per region
   - Example: "2-wheeler not available in Kerala metro areas"

---

### Ride Type Management

**Admin Menu**: Administration → Vehicle & Service Management → Ride Types

**Features:**
1. **List View**
   - All ride types
   - Active/Inactive status
   - Regional availability

2. **Add Ride Type**
   - Name, Icon, Description
   - Default fields (date/time, passenger count, etc.)
   - Allowed vehicle types
   - Base fare adjustments
   - Regional availability

3. **Edit Ride Type**
   - Modify fields
   - Update allowed vehicle combinations
   - Region-specific pricing

---

### Geographic Coverage Management

**Admin Menu**: Administration → Coverage Areas

**Hierarchy:**
```
State (e.g., Kerala)
  ↓
District (e.g., Ernakulam)
  ↓
Locality (e.g., Kochi City)
  ↓
Pincode (e.g., 682018)
```

**Features:**
1. **View Coverage Map**
   - Visual map showing active areas
   - Color-coded by vehicle type availability

2. **Add Coverage Area**
   - Select level (State/District/Locality/Pincode)
   - Select value
   - Choose vehicle types available
   - Choose ride types available
   - Set as active/inactive

3. **Bulk Import**
   - CSV upload for pincodes
   - Set default vehicle types
   - Automatic regional assignment

4. **Regional Pricing Rules**
   - Base fare adjustments per region
   - Multiplier overrides
   - Surge pricing by area
   - Weekend/holiday rates

---

## 5. Implementation Roadmap

### Phase 1: Core Screens & Navigation ✅
- [x] ServiceSelectionScreen component
- [x] BookingDetailsScreen component
- [x] PassengerBookingNavigator wrapper
- [x] Screen validation and flow

### Phase 2: Backend Endpoints (NEXT)
- [ ] Create ride_types table and seed data
- [ ] Create vehicle_subtypes table
- [ ] Create coverage_areas table
- [ ] Add GET /api/ride-types/public/all endpoint
- [ ] Update GET /api/vehicle-types/public/all with subtypes
- [ ] Create POST /api/bookings/estimate-fare endpoint
- [ ] Update POST /api/bookings/create to accept ride_type

### Phase 3: Admin Panel
- [ ] Vehicle Types management UI
- [ ] Ride Types management UI
- [ ] Coverage Areas management UI
- [ ] Regional pricing configuration
- [ ] Bulk import functionality

### Phase 4: Integration & Testing
- [ ] Connect screens to backend APIs
- [ ] End-to-end booking flow testing
- [ ] Performance testing (heavy load)
- [ ] Regional coverage validation
- [ ] Admin panel testing

---

## 6. Data Models

### Vehicle Type Model
```javascript
{
  id: "auto",
  name: "Auto",
  icon: "🛺",
  description: "Budget friendly",
  baseMultiplier: 0.75,
  subtypes: [
    {
      id: "auto_standard",
      name: "Standard",
      multiplier: 0.75
    }
  ],
  active: true,
  regions: ["Kerala", "Tamil Nadu", "Karnataka"]
}
```

### Ride Type Model
```javascript
{
  id: "instant",
  name: "Instant Ride",
  icon: "⚡",
  description: "Book now, ride immediately",
  allowedVehicleTypes: ["auto", "taxi", "xl", "traveller"],
  requiresScheduling: false,
  requiresDestination: true,
  requiresPassengerCount: true,
  active: true,
  regions: ["all"]
}
```

### Booking Model (Extended)
```javascript
{
  bookingId: "booking_xyz789",
  status: "searching",
  
  // Vehicle & Service
  vehicleTypeId: "auto",
  vehicleSubtypeId: "auto_standard",
  rideType: "instant",
  
  // Location & Time
  pickupAddress: "Market Street, Kochi",
  pickupCoordinates: { latitude: 13.0827, longitude: 80.2707 },
  dropoffAddress: "Kochi Airport, Terminal 3",
  dropoffCoordinates: { latitude: 13.1939, longitude: 80.1180 },
  scheduledPickupTime: null,
  
  // Passengers & Cargo
  passengerCount: 2,
  goodsWeightKg: null,
  
  // Pricing
  estimatedFare: 361,
  baseFare: 200,
  distanceCharge: 152,
  timeCharge: 56,
  vehicleMultiplier: 0.75,
  vehicleCharge: -102,
  surgeMultiplier: 1.0,
  surgeCharge: 0,
  promoDiscount: 50,
  taxes: 55,
  
  createdAt: "2026-05-30T10:30:00Z",
  createdBy: "passenger_123"
}
```

---

## 7. Configuration Structure

### Seed Data for MongoDB

```javascript
// Vehicle Types
db.vehicle_types.insertMany([
  {
    id: "auto",
    name: "Auto",
    icon: "🛺",
    description: "Budget friendly, 3-4 seater",
    baseMultiplier: 0.75,
    subtypes: [{ id: "auto_std", name: "Standard", multiplier: 0.75 }],
    active: true,
    regions: ["all"]
  },
  {
    id: "taxi",
    name: "Taxi",
    icon: "🚖",
    description: "Comfortable, 4 seater",
    baseMultiplier: 1.0,
    subtypes: [
      { id: "taxi_sedan", name: "Sedan", multiplier: 1.0 },
      { id: "taxi_hatchback", name: "Hatchback", multiplier: 0.95 }
    ],
    active: true,
    regions: ["all"]
  },
  // ... more types
]);

// Ride Types
db.ride_types.insertMany([
  {
    id: "instant",
    name: "Instant Ride",
    icon: "⚡",
    description: "Book now, ride immediately",
    allowedVehicleTypes: ["auto", "taxi", "xl", "traveller"],
    active: true,
    regions: ["all"]
  },
  {
    id: "scheduled",
    name: "Scheduled Ride",
    icon: "📅",
    description: "Book for later time",
    allowedVehicleTypes: ["auto", "taxi", "xl", "traveller"],
    active: true,
    regions: ["all"]
  },
  // ... more types
]);

// Coverage Areas
db.coverage_areas.insertMany([
  {
    id: "coverage_kerala_auto",
    level: "state",
    value: "Kerala",
    vehicleTypes: ["auto", "taxi", "xl", "traveller"],
    rideTypes: ["instant", "scheduled", "rental"],
    active: true
  },
  // ... more coverage
]);
```

---

## 8. Configuration Files

### vehicle_types.config.json
```json
{
  "vehicleTypes": [
    {
      "id": "auto",
      "name": "Auto",
      "icon": "🛺",
      "description": "Budget friendly",
      "multiplier": 0.75,
      "variants": ["Standard"]
    },
    // ... more types
  ],
  "rideTypes": [
    {
      "id": "instant",
      "name": "Instant Ride",
      "icon": "⚡",
      "description": "Book now, ride immediately"
    },
    // ... more types
  ]
}
```

---

## 9. Testing Plan

### Unit Tests
- [ ] Service selection validation
- [ ] Fare calculation logic
- [ ] Location geocoding
- [ ] Regional coverage matching

### Integration Tests
- [ ] End-to-end booking flow
- [ ] API endpoint testing
- [ ] Database CRUD operations
- [ ] Real-time updates

### E2E Tests
- [ ] User: Select service → Enter locations → Get fare → Book
- [ ] Driver: Accept ride from new ride type
- [ ] Admin: Add vehicle type → Select in booking
- [ ] Regional: Booking in covered area → Booking in non-covered area

---

## 10. Deployment Checklist

- [ ] Database migrations executed
- [ ] Seed data loaded
- [ ] New API endpoints tested
- [ ] Admin panel accessible and functional
- [ ] Frontend screens integrated
- [ ] Regional coverage verified
- [ ] Load testing completed
- [ ] Rollback plan documented
- [ ] User documentation updated
- [ ] Driver app updated to support new ride types

---

## Summary

**Total Mobility Platform** transforms AutoBuddy into a comprehensive multi-service platform:
- **7 Vehicle Types** with variants
- **7 Ride Types** with specific requirements
- **Admin Control** of all configurations
- **Geographic Flexibility** for multi-region operations
- **Enhanced UX** with clear service selection before booking

**Status**: Architecture complete, ready for backend implementation.

---

**Next Steps**:
1. Create backend API endpoints
2. Implement admin panel
3. Load seed data
4. Run integration tests
5. Deploy to staging
6. Load test with multiple regions
7. Deploy to production
