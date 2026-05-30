# 🏗️ PHASE 1 TECHNICAL ARCHITECTURE
## Multi-Vehicle Booking System (Detailed Specs)

**Document Version**: 1.0  
**Date**: May 30, 2026  
**Status**: READY FOR IMPLEMENTATION  

---

## TABLE OF CONTENTS
1. Architecture Overview
2. Database Schema Details
3. API Specifications
4. Frontend Component Specifications
5. Integration Points
6. Error Handling & Recovery
7. Performance Targets
8. Security Considerations

---

## 1. ARCHITECTURE OVERVIEW

### System Diagram
```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND (React Native)                  │
│  VehicleTypeSelector → RideProductSelector → FareEstimator  │
│           ↓                    ↓                    ↓         │
│     GET /vehicle-types   GET /ride-products   POST /estimate │
└────────────────────────┬────────────────────────────────────┘
                         │
        ┌────────────────┴────────────────┐
        │                                 │
┌───────▼──────────────────┐    ┌────────▼─────────────────┐
│  API Layer (FastAPI)     │    │  Real-time (Socket.IO)  │
│  - Vehicle Types API     │    │  - Driver updates       │
│  - Booking API v2        │    │  - Trip status          │
│  - Dispatch API v2       │    │  - Location tracking    │
│  - Pricing API           │    │  - Chat messages        │
└───────┬──────────────────┘    └────────┬─────────────────┘
        │                                 │
        └────────────────┬────────────────┘
                         │
        ┌────────────────▼────────────────┐
        │     Database Layer (PostgreSQL) │
        │  - vehicle_types               │
        │  - ride_products               │
        │  - driver_vehicle_certifications│
        │  - ride_pricing_overrides      │
        │  - dispatch_preferences        │
        │  - vehicle_inventory           │
        └────────────────────────────────┘
```

### Core Data Flow

**Booking Flow**:
```
User selects vehicle type
    ↓
Frontend calls GET /api/v2/vehicle-types
    ↓
Database returns [Auto, Taxi, XL, Mini Truck, Full Truck]
    ↓
User selects Taxi
    ↓
Frontend calls GET /api/v2/ride-products?vehicle_type=taxi
    ↓
Database returns [Taxi, Taxi+, Taxi XL]
    ↓
User selects pickup/dropoff
    ↓
Frontend calls POST /api/v2/bookings/estimate-fare
    ↓
Backend: Calculate distance → Get vehicle rates → Get surge multiplier → Return fare
    ↓
User confirms booking
    ↓
Backend calls POST /api/v2/dispatch/bookings/{id}/smart-match
    ↓
Smart algorithm: Filter taxi-certified drivers → Score by rating/distance → Assign best
    ↓
Driver receives offer on Socket.IO
    ↓
Driver accepts → Ride active
```

---

## 2. DATABASE SCHEMA (DETAILED)

### Table 2.1: vehicle_types

**Purpose**: Master table for all vehicle types available on platform

```sql
CREATE TABLE vehicle_types (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Classification
  category VARCHAR(50) NOT NULL,           -- auto, taxi, xl, mini_truck, full_truck
  name VARCHAR(100) NOT NULL,              -- "Auto Rickshaw"
  display_name VARCHAR(100) NOT NULL,      -- "Auto" (for UI)
  icon_emoji VARCHAR(2),                   -- "🏍️"
  slug VARCHAR(100) UNIQUE,                -- "auto-rickshaw" (for URLs)
  
  -- Capacity & Features
  description TEXT,
  passenger_capacity INT NOT NULL,         -- 3 for auto, 4 for taxi
  cargo_capacity_kg INT DEFAULT 0,         -- 0 for auto, 100 for taxi, 500 for truck
  
  -- Pricing Model
  base_rate DECIMAL(10,2) NOT NULL,        -- ₹50 for auto
  per_km_rate DECIMAL(10,2) NOT NULL,      -- ₹15/km for auto
  per_minute_rate DECIMAL(10,2) NOT NULL,  -- ₹2/min for auto
  minimum_fare DECIMAL(10,2) DEFAULT 0,    -- Minimum charge
  
  -- Compliance & Certification
  requires_training BOOLEAN DEFAULT false,
  requires_commercial_license BOOLEAN DEFAULT false,
  requires_insurance VARCHAR(200),         -- "commercial_vehicle"
  documents_required JSONB,                -- ["commercial_license", "insurance_cert"]
  
  -- Display & Management
  active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,                -- 10 for auto, 20 for taxi
  metadata JSONB,                          -- {"color": "#FFB800", "features": ["AC"]}
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_vehicle_types_category ON vehicle_types(category);
CREATE INDEX idx_vehicle_types_active ON vehicle_types(active);
CREATE INDEX idx_vehicle_types_slug ON vehicle_types(slug);
```

**Sample Data**:
```json
{
  "id": "v1-auto",
  "category": "auto",
  "name": "Auto Rickshaw",
  "display_name": "Auto",
  "icon_emoji": "🏍️",
  "slug": "auto-rickshaw",
  "passenger_capacity": 3,
  "cargo_capacity_kg": 0,
  "base_rate": 50,
  "per_km_rate": 15,
  "per_minute_rate": 2,
  "requires_commercial_license": false,
  "active": true,
  "sort_order": 10
}
```

---

### Table 2.2: ride_products

**Purpose**: Specific ride offerings within a vehicle type (e.g., Taxi, Taxi+, Taxi XL)

```sql
CREATE TABLE ride_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Classification
  vehicle_type_id UUID NOT NULL REFERENCES vehicle_types(id),
  name VARCHAR(100) NOT NULL,              -- "Taxi Plus"
  display_name VARCHAR(100) NOT NULL,      -- "Taxi +"
  slug VARCHAR(100) UNIQUE,                -- "taxi-plus"
  
  -- Pricing Multiplier
  base_multiplier DECIMAL(5,2) DEFAULT 1.0, -- 1.0 for Taxi, 1.25 for Taxi+
  
  -- Features
  description TEXT,
  features JSONB,                          -- ["premium_driver", "aadhaar_verified"]
  additional_charges JSONB,                -- {"premium": 100}
  
  -- Availability
  active BOOLEAN DEFAULT true,
  available_from TIME,
  available_until TIME,
  min_driver_rating DECIMAL(3,2),          -- 4.5 for Taxi+
  
  -- Display
  sort_order INT DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_ride_products_vehicle_type ON ride_products(vehicle_type_id);
CREATE INDEX idx_ride_products_active ON ride_products(active);
```

**Sample Data**:
```json
{
  "id": "p1-taxi",
  "vehicle_type_id": "v2-taxi",
  "name": "Taxi",
  "display_name": "Taxi",
  "slug": "taxi",
  "base_multiplier": 1.0,
  "features": ["standard_driver", "basic_verification"],
  "active": true,
  "min_driver_rating": 4.0
}
```

---

### Table 2.3: driver_vehicle_certifications

**Purpose**: Track which drivers are certified for which vehicle types

```sql
CREATE TABLE driver_vehicle_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relationships
  driver_id UUID NOT NULL,                 -- From users table
  vehicle_type_id UUID NOT NULL REFERENCES vehicle_types(id),
  
  -- Certification Status
  certification_status VARCHAR(50) NOT NULL,  -- 'pending', 'verified', 'expired', 'rejected'
  certification_date TIMESTAMP,
  expiry_date TIMESTAMP,
  
  -- Documents
  document_ids JSONB,                      -- ["doc_123", "doc_456"]
  verification_notes TEXT,
  
  -- Audit
  verified_by_admin_id UUID,
  verified_at TIMESTAMP,
  
  -- Display
  active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  UNIQUE(driver_id, vehicle_type_id),
  FOREIGN KEY (driver_id) REFERENCES users(id)
);

CREATE INDEX idx_driver_certs_driver ON driver_vehicle_certifications(driver_id);
CREATE INDEX idx_driver_certs_vehicle ON driver_vehicle_certifications(vehicle_type_id);
CREATE INDEX idx_driver_certs_status ON driver_vehicle_certifications(certification_status);
```

**Business Logic**:
- Driver can only accept bookings for certified vehicle types
- Certification expires after 1 year
- Admin must manually approve each certification
- A driver can be certified for multiple vehicle types

---

### Table 2.4: ride_pricing_overrides

**Purpose**: Special pricing for specific routes, times, or surge conditions

```sql
CREATE TABLE ride_pricing_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Scope
  vehicle_type_id UUID NOT NULL REFERENCES vehicle_types(id),
  ride_product_id UUID REFERENCES ride_products(id),  -- NULL = all products
  
  -- When to Apply
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP NOT NULL,
  day_of_week VARCHAR(10),                 -- 'monday', 'friday', NULL = all days
  start_time TIME,                         -- '18:00' for evening rush
  end_time TIME,                           -- '22:00'
  
  -- Pricing Override
  override_type VARCHAR(50),                -- 'surge_multiplier', 'fixed_rate', 'discount'
  override_value DECIMAL(10,2),             -- 1.5 for 50% surge, -100 for ₹100 discount
  
  -- Trigger Condition
  min_demand_level INT,                    -- 0-100, 70+ means high demand
  weather_condition VARCHAR(50),           -- 'rain', 'snow'
  
  -- Audit
  created_by_admin_id UUID,
  reason TEXT,                             -- "Friday evening rush"
  
  active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_pricing_overrides_vehicle ON ride_pricing_overrides(vehicle_type_id);
CREATE INDEX idx_pricing_overrides_time ON ride_pricing_overrides(start_date, end_date);
```

---

### Table 2.5: dispatch_preferences

**Purpose**: Driver preferences for which vehicle types/products they prefer

```sql
CREATE TABLE dispatch_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  driver_id UUID NOT NULL UNIQUE REFERENCES users(id),
  
  -- Preferences
  preferred_vehicle_types JSONB,           -- ["auto", "taxi"]
  min_fare_threshold DECIMAL(10,2),        -- Won't accept rides below ₹200
  max_distance_km INT,                     -- Won't accept > 25km
  auto_accept_enabled BOOLEAN DEFAULT false,
  auto_decline_surge_above DECIMAL(5,2),   -- Auto-decline if surge > 1.5x
  
  -- Availability Windows
  available_from TIME,
  available_until TIME,
  
  -- Cancellation Tolerance
  max_cancellation_rate DECIMAL(5,2),      -- 0.2 = 20%, alerts admin if exceeded
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_dispatch_prefs_driver ON dispatch_preferences(driver_id);
```

---

### Table 2.6: vehicle_inventory

**Purpose**: Track physical vehicle assignments and utilization

```sql
CREATE TABLE vehicle_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Vehicle Details
  license_plate VARCHAR(20) UNIQUE NOT NULL,
  vehicle_type_id UUID NOT NULL REFERENCES vehicle_types(id),
  make VARCHAR(50),                        -- "Bajaj"
  model VARCHAR(50),                       -- "RE Compact"
  registration_number VARCHAR(50) UNIQUE,
  
  -- Assignment
  currently_assigned_to UUID,              -- driver_id
  ownership_type VARCHAR(50),              -- 'personal', 'fleet', 'lease'
  
  -- Status
  status VARCHAR(50) DEFAULT 'available',  -- 'available', 'in_use', 'maintenance', 'inactive'
  last_maintenance_date DATE,
  next_maintenance_date Date,
  
  -- Insurance & Documents
  insurance_policy_number VARCHAR(100),
  insurance_expiry_date DATE,
  pollution_certificate_expiry DATE,
  fitness_certificate_expiry DATE,
  
  -- Utilization
  total_rides INT DEFAULT 0,
  total_earnings DECIMAL(15,2) DEFAULT 0,
  average_rating DECIMAL(3,2),
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_vehicle_inv_type ON vehicle_inventory(vehicle_type_id);
CREATE INDEX idx_vehicle_inv_driver ON vehicle_inventory(currently_assigned_to);
CREATE INDEX idx_vehicle_inv_status ON vehicle_inventory(status);
```

---

## 3. API SPECIFICATIONS (DETAILED)

### 3.1 Vehicle Types API

#### Endpoint 1: GET /api/v2/vehicle-types
**Purpose**: List all available vehicle types

**Request**:
```http
GET /api/v2/vehicle-types
Authorization: Bearer {token}
```

**Query Parameters**:
```
active: boolean (default: true)      # Only return active types
category: string (optional)           # Filter by 'auto', 'taxi', etc.
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": "v1-auto",
      "name": "Auto Rickshaw",
      "display_name": "Auto",
      "icon_emoji": "🏍️",
      "passenger_capacity": 3,
      "base_rate": 50,
      "per_km_rate": 15,
      "per_minute_rate": 2,
      "category": "auto"
    },
    {
      "id": "v2-taxi",
      "name": "Sedan Taxi",
      "display_name": "Taxi",
      "icon_emoji": "🚕",
      "passenger_capacity": 4,
      "base_rate": 80,
      "per_km_rate": 18,
      "per_minute_rate": 2.5,
      "category": "taxi"
    },
    // ... 3 more
  ],
  "meta": {
    "total_count": 5,
    "timestamp": "2026-06-03T10:00:00Z"
  }
}
```

**Error Cases**:
- 401 Unauthorized: Missing/invalid token → Return `{error: "Unauthorized"}`
- 500 Server Error: Database down → Return `{error: "Database connection failed"}`

---

#### Endpoint 2: GET /api/v2/vehicle-types/{vehicle_type_id}
**Purpose**: Get details for specific vehicle type

**Request**:
```http
GET /api/v2/vehicle-types/v2-taxi
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "id": "v2-taxi",
    "name": "Sedan Taxi",
    "display_name": "Taxi",
    "icon_emoji": "🚕",
    "description": "Comfortable sedan for 4 passengers with air conditioning",
    "passenger_capacity": 4,
    "cargo_capacity_kg": 100,
    "base_rate": 80,
    "per_km_rate": 18,
    "per_minute_rate": 2.5,
    "minimum_fare": 100,
    "requires_commercial_license": true,
    "requires_training": true,
    "documents_required": ["commercial_license", "insurance_certificate"],
    "active": true,
    "category": "taxi"
  }
}
```

**Error Cases**:
- 404 Not Found: Vehicle type doesn't exist
- 401 Unauthorized: Missing token

---

#### Endpoint 3: GET /api/v2/ride-products?vehicle_type={id}
**Purpose**: Get ride products (variants) for a specific vehicle type

**Request**:
```http
GET /api/v2/ride-products?vehicle_type=v2-taxi
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": [
    {
      "id": "p1-taxi",
      "name": "Taxi",
      "display_name": "Taxi",
      "base_multiplier": 1.0,
      "features": ["standard_driver"],
      "min_driver_rating": 4.0,
      "active": true
    },
    {
      "id": "p2-taxi-plus",
      "name": "Taxi Plus",
      "display_name": "Taxi +",
      "base_multiplier": 1.25,
      "features": ["premium_driver", "aadhaar_verified"],
      "additional_charges": { "premium": 100 },
      "min_driver_rating": 4.5,
      "active": true
    },
    {
      "id": "p3-taxi-xl",
      "name": "Taxi XL",
      "display_name": "Taxi XL",
      "base_multiplier": 1.5,
      "features": ["luxury_driver", "insurance_verified"],
      "min_driver_rating": 4.7,
      "active": true
    }
  ],
  "vehicle_type_id": "v2-taxi"
}
```

---

#### Endpoint 4: POST /api/v2/bookings/estimate-fare
**Purpose**: Calculate estimated fare for a booking

**Request**:
```json
{
  "vehicle_type_id": "v2-taxi",
  "ride_product_id": "p1-taxi",
  "pickup_latitude": 10.7905,
  "pickup_longitude": 106.6937,
  "dropoff_latitude": 10.8000,
  "dropoff_longitude": 106.7000,
  "surge_multiplier": 1.2
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "fare_breakdown": {
      "base_fare": 80,
      "distance_km": 10,
      "distance_charge": 180,
      "waiting_time_charge": 0,
      "surge_multiplier": 1.2,
      "surge_amount": 60,
      "additional_charges": 0,
      "subtotal": 380,
      "tax_percentage": 5,
      "tax_amount": 19,
      "total_fare": 399
    },
    "estimated_duration_minutes": 12,
    "distance_km": 10,
    "ride_product": {
      "name": "Taxi",
      "features": ["standard_driver"]
    },
    "vehicle_type": {
      "name": "Sedan Taxi",
      "icon_emoji": "🚕"
    }
  }
}
```

**Calculation Logic**:
```python
def calculate_fare(vehicle, distance_km, duration_minutes, surge_multiplier):
    base = vehicle.base_rate
    distance_charge = distance_km * vehicle.per_km_rate
    time_charge = duration_minutes * vehicle.per_minute_rate
    subtotal = base + distance_charge + time_charge
    surged = subtotal * surge_multiplier
    tax = surged * 0.05  # 5% tax
    total = surged + tax
    return {
        "base_fare": base,
        "distance_charge": distance_charge,
        "time_charge": time_charge,
        "surge_multiplier": surge_multiplier,
        "surge_amount": (subtotal * (surge_multiplier - 1)),
        "tax": tax,
        "total": total
    }
```

---

#### Endpoint 5: GET /api/v2/pricing/surge-multipliers
**Purpose**: Get current surge multipliers for all vehicle types

**Request**:
```http
GET /api/v2/pricing/surge-multipliers
Authorization: Bearer {token}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "auto": {
      "current_multiplier": 1.0,
      "active_bookings": 45,
      "available_drivers": 120,
      "demand_level": 30
    },
    "taxi": {
      "current_multiplier": 1.5,
      "active_bookings": 200,
      "available_drivers": 80,
      "demand_level": 75
    },
    "xl": {
      "current_multiplier": 1.2,
      "active_bookings": 50,
      "available_drivers": 30,
      "demand_level": 45
    },
    "mini_truck": {
      "current_multiplier": 1.0,
      "active_bookings": 20,
      "available_drivers": 25,
      "demand_level": 20
    },
    "full_truck": {
      "current_multiplier": 1.1,
      "active_bookings": 10,
      "available_drivers": 15,
      "demand_level": 25
    }
  },
  "timestamp": "2026-06-03T10:30:00Z"
}
```

**Surge Calculation Algorithm**:
```python
def calculate_surge_multiplier(active_bookings, available_drivers, base_multiplier=1.0):
    ratio = active_bookings / (available_drivers + 1)
    
    if ratio < 1:
        return 1.0  # More drivers than bookings
    elif ratio < 2:
        return 1.1  # Low demand
    elif ratio < 3:
        return 1.25  # Medium demand
    elif ratio < 4:
        return 1.5   # High demand
    else:
        return 2.0   # Critical demand
```

---

### 3.2 Booking API v2

#### Endpoint 1: POST /api/v2/bookings/search
**Purpose**: Find available ride options (extended search)

**Request**:
```json
{
  "pickup_latitude": 10.7905,
  "pickup_longitude": 106.6937,
  "dropoff_latitude": 10.8000,
  "dropoff_longitude": 106.7000,
  "passenger_count": 2,
  "luggage_count": 1,
  "preferred_vehicle_types": ["taxi", "xl"],
  "accessibility_requirements": ["wheelchair_accessible"]
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "search_id": "search_abc123",
    "available_options": [
      {
        "vehicle_type": {
          "id": "v2-taxi",
          "name": "Taxi",
          "icon_emoji": "🚕"
        },
        "products": [
          {
            "id": "p1-taxi",
            "name": "Taxi",
            "estimated_fare": 399,
            "surge_multiplier": 1.2,
            "estimated_arrival_time": "3 minutes",
            "available_drivers": 45
          }
        ]
      },
      {
        "vehicle_type": {
          "id": "v3-xl",
          "name": "XL",
          "icon_emoji": "🚐"
        },
        "products": [
          {
            "id": "p4-xl",
            "name": "XL",
            "estimated_fare": 599,
            "surge_multiplier": 1.3,
            "estimated_arrival_time": "5 minutes",
            "available_drivers": 20
          }
        ]
      }
    ],
    "expires_at": "2026-06-03T10:35:00Z"
  }
}
```

---

#### Endpoint 2: POST /api/v2/bookings/create
**Purpose**: Create a booking (multi-step process)

**Request**:
```json
{
  "vehicle_type_id": "v2-taxi",
  "ride_product_id": "p1-taxi",
  "pickup_latitude": 10.7905,
  "pickup_longitude": 106.6937,
  "dropoff_latitude": 10.8000,
  "dropoff_longitude": 106.7000,
  "passenger_count": 2,
  "luggage_count": 1,
  "special_requirements": []
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "data": {
    "booking_id": "bk_xyz123",
    "status": "awaiting_driver",
    "vehicle_type": {
      "name": "Taxi",
      "icon_emoji": "🚕"
    },
    "ride_product": {
      "name": "Taxi"
    },
    "estimated_fare": {
      "total": 399,
      "currency": "INR"
    },
    "pickup_location": {
      "latitude": 10.7905,
      "longitude": 106.6937,
      "address": "123 Main St, City"
    },
    "dropoff_location": {
      "latitude": 10.8000,
      "longitude": 106.7000,
      "address": "456 Beach Road, City"
    },
    "created_at": "2026-06-03T10:30:00Z"
  }
}
```

---

### 3.3 Dispatch API v2

#### Endpoint 1: POST /api/v2/dispatch/bookings/{booking_id}/smart-match
**Purpose**: Automatically find and assign the best driver

**Request**:
```http
POST /api/v2/dispatch/bookings/bk_xyz123/smart-match
Authorization: Bearer {admin_token}
```

**Response** (200 OK):
```json
{
  "success": true,
  "data": {
    "booking_id": "bk_xyz123",
    "assigned_driver": {
      "driver_id": "dr_123",
      "name": "Raj Kumar",
      "rating": 4.8,
      "vehicle": {
        "license_plate": "KA-01-AB-1234",
        "model": "Toyota Innova"
      },
      "eta_minutes": 3,
      "location": {
        "latitude": 10.7850,
        "longitude": 106.6880
      }
    },
    "assignment_reason": "Highest rated driver, closest proximity",
    "status": "driver_notified"
  }
}
```

**Smart Matching Algorithm**:
```python
def smart_match_driver(booking, available_drivers):
    """
    Score = (Rating * 0.35) + 
            (Acceptance Rate * 0.25) + 
            (Proximity Score * 0.25) + 
            (Certification Bonus * 0.15)
    """
    scored_drivers = []
    
    for driver in available_drivers:
        # Filter 1: Must have vehicle type certification
        if not driver.has_certification(booking.vehicle_type_id):
            continue
        
        # Filter 2: Must meet minimum rating
        if driver.rating < booking.ride_product.min_driver_rating:
            continue
        
        # Score calculation
        rating_score = (driver.rating / 5.0) * 0.35
        acceptance_score = (driver.acceptance_rate) * 0.25
        
        distance = calculate_distance(
            driver.current_location,
            booking.pickup_location
        )
        proximity_score = (1 - (distance / 10)) * 0.25  # Normalize to 10km
        
        cert_bonus = 0.15 if driver.aadhaar_verified else 0
        
        total_score = (rating_score + acceptance_score + 
                      proximity_score + cert_bonus)
        
        scored_drivers.append({
            'driver': driver,
            'score': total_score,
            'breakdown': {
                'rating': rating_score,
                'acceptance': acceptance_score,
                'proximity': proximity_score,
                'certification': cert_bonus
            }
        })
    
    if not scored_drivers:
        raise NoAvailableDriversError()
    
    # Return top driver
    top_driver = max(scored_drivers, key=lambda x: x['score'])
    return top_driver['driver']
```

---

## 4. FRONTEND COMPONENT SPECIFICATIONS

### 4.1 VehicleTypeSelector Component

**File**: `autobuddy-mobile/src/components/VehicleTypeSelector.tsx`

**Props**:
```typescript
interface VehicleTypeSelectorProps {
  onVehicleSelected: (vehicle: VehicleType) => void;
  onError?: (error: Error) => void;
  loading?: boolean;
}

interface VehicleType {
  id: string;
  name: string;
  display_name: string;
  icon_emoji: string;
  passenger_capacity: number;
  base_rate: number;
  per_km_rate: number;
  per_minute_rate: number;
}
```

**Visual Layout**:
```
┌─────────────────────────────┐
│     Choose Your Ride        │
├─────────────────────────────┤
│ [🏍️] Auto        ₹50 base   │
│      ₹15/km, ₹2/min         │
├─────────────────────────────┤
│ [🚕] Taxi        ₹80 base   │  ← Highlight on selection
│      ₹18/km, ₹2.5/min       │
├─────────────────────────────┤
│ [🚐] XL          ₹100 base  │
│      ₹20/km, ₹3/min         │
├─────────────────────────────┤
│ [🚐] Mini Truck  ₹120 base  │
│      ₹25/km, ₹3.5/min       │
├─────────────────────────────┤
│ [🚚] Full Truck  ₹150 base  │
│      ₹30/km, ₹4/min         │
└─────────────────────────────┘
```

**Code Template**:
```typescript
import React, { useState, useEffect } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet
} from 'react-native';
import { vehicleTypesAPI } from '../services/apiClient';

const VehicleTypeSelector: React.FC<VehicleTypeSelectorProps> = ({
  onVehicleSelected,
  onError
}) => {
  const [vehicles, setVehicles] = useState<VehicleType[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        const response = await vehicleTypesAPI.listVehicleTypes();
        setVehicles(response.data);
      } catch (error) {
        onError?.(error as Error);
      } finally {
        setLoading(false);
      }
    };

    fetchVehicles();
  }, [onError]);

  const handleSelect = (vehicle: VehicleType) => {
    setSelectedId(vehicle.id);
    onVehicleSelected(vehicle);
  };

  if (loading) {
    return <ActivityIndicator size="large" />;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose Your Ride</Text>
      <FlatList
        data={vehicles}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.vehicleOption,
              selectedId === item.id && styles.vehicleOptionSelected
            ]}
            onPress={() => handleSelect(item)}
          >
            <Text style={styles.emoji}>{item.icon_emoji}</Text>
            <View style={styles.details}>
              <Text style={styles.name}>{item.display_name}</Text>
              <Text style={styles.pricing}>
                ₹{item.base_rate} base · ₹{item.per_km_rate}/km
              </Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 16
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16
  },
  vehicleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    borderWidth: 2,
    borderColor: 'transparent'
  },
  vehicleOptionSelected: {
    borderColor: '#4ECDC4',
    backgroundColor: '#E8F8F6'
  },
  emoji: {
    fontSize: 24,
    marginRight: 12
  },
  details: {
    flex: 1
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000'
  },
  pricing: {
    fontSize: 13,
    color: '#666',
    marginTop: 4
  }
});

export default VehicleTypeSelector;
```

---

### 4.2 RideProductSelector Component

**File**: `autobuddy-mobile/src/components/RideProductSelector.tsx`

**Props**:
```typescript
interface RideProductSelectorProps {
  vehicleTypeId: string;
  onProductSelected: (product: RideProduct) => void;
}

interface RideProduct {
  id: string;
  name: string;
  display_name: string;
  base_multiplier: number;
  features: string[];
  additional_charges?: Record<string, number>;
}
```

**Visual Layout**:
```
┌──────────────────────────────────┐
│    Select Ride Variant           │
├──────────────────────────────────┤
│ Taxi                   ₹80 base  │  ← Standard
│ Standard Driver        1x surge  │
├──────────────────────────────────┤
│ Taxi +                 ₹100 base │  ← Premium
│ Premium Driver         1.25x surge│
│ Aadhaar Verified       +₹20      │
├──────────────────────────────────┤
│ Taxi XL                ₹120 base │  ← Luxury
│ Luxury Driver          1.5x surge │
│ Insurance Verified     +₹40      │
└──────────────────────────────────┘
```

---

### 4.3 FareEstimator Component

**File**: `autobuddy-mobile/src/components/FareEstimator.tsx`

**Props**:
```typescript
interface FareEstimatorProps {
  vehicleTypeId: string;
  rideProductId: string;
  pickupLocation: Location;
  dropoffLocation: Location;
  onConfirm: (booking: BookingRequest) => void;
}
```

**Visual Layout**:
```
┌──────────────────────────────────┐
│    Fare Breakdown                │
├──────────────────────────────────┤
│ Distance: 10 km                  │
│ Estimated Time: 12 minutes       │
├──────────────────────────────────┤
│ Base Fare              ₹80       │
│ Distance (10×₹18)     ₹180       │
│ Surge Multiplier (1.2x) ₹60     │
│ Taxes (5%)             ₹19       │
├──────────────────────────────────┤
│ TOTAL FARE             ₹399      │
├──────────────────────────────────┤
│  [Confirm Booking]  [Change]     │
└──────────────────────────────────┘
```

---

## 5. INTEGRATION POINTS

### Real-time Updates (Socket.IO)

**Events to Emit**:
```typescript
// Driver side
socket.emit('driver:location_update', {
  driver_id: 'dr_123',
  latitude: 10.7905,
  longitude: 106.6937,
  timestamp: Date.now()
});

// Passenger side
socket.emit('passenger:booking_created', {
  booking_id: 'bk_xyz123',
  vehicle_type: 'taxi'
});
```

**Events to Listen**:
```typescript
// Passenger listening for driver assignment
socket.on('booking:driver_assigned', (data) => {
  // data = { booking_id, driver_id, eta_minutes }
  console.log(`Driver ${data.driver_id} assigned, ETA ${data.eta_minutes} min`);
});

// Driver listening for trip offers
socket.on('driver:trip_offered', (data) => {
  // data = { booking_id, fare, pickup_location, dropoff_location }
  showTripOffer(data);
});
```

---

## 6. ERROR HANDLING & RECOVERY

### API Error Response Format
```json
{
  "success": false,
  "error": {
    "code": "VEHICLE_TYPE_NOT_FOUND",
    "message": "The requested vehicle type does not exist",
    "details": {
      "vehicle_type_id": "v_invalid_123"
    },
    "timestamp": "2026-06-03T10:30:00Z"
  }
}
```

### HTTP Status Codes
- `200 OK`: Successful request
- `201 Created`: Resource created
- `400 Bad Request`: Invalid parameters
- `401 Unauthorized`: Missing/invalid auth token
- `403 Forbidden`: Permission denied
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource already exists
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error
- `503 Service Unavailable`: Maintenance

### Retry Strategy
```
Attempt 1: Immediate
Attempt 2: After 2 seconds
Attempt 3: After 5 seconds
Attempt 4: After 10 seconds
After 3 failures: Show error to user
```

---

## 7. PERFORMANCE TARGETS

| Metric | Target | Threshold |
|--------|--------|-----------|
| GET /vehicle-types | < 100ms | > 500ms = Alert |
| GET /ride-products | < 150ms | > 500ms = Alert |
| POST /estimate-fare | < 200ms | > 1s = Timeout |
| POST /bookings/create | < 500ms | > 2s = Error |
| POST /dispatch/smart-match | < 2s | > 5s = Fallback |
| Page load time | < 2s | > 5s = Poor |
| Component render | < 16ms | > 50ms = Janky |

---

## 8. SECURITY CONSIDERATIONS

### Authentication
- All endpoints require Bearer token
- Token validated in request interceptor
- 401 → Auto logout

### Data Protection
- PII encrypted in transit (HTTPS)
- Database passwords in environment variables
- API keys rotated monthly

### Rate Limiting
- 100 requests per minute per user
- 1000 requests per minute per IP
- Burst limit: 10 requests per second

---

**Document Status**: READY FOR IMPLEMENTATION  
**Last Updated**: May 30, 2026  
**Owner**: Tech Lead  

**Next**: Distribute to backend and frontend teams
