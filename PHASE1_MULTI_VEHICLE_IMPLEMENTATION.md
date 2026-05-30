# Phase 1: Multi-Vehicle Booking System
## Implementation Guide (Weeks 1-3)

**Objective**: Launch 5 vehicle types (Auto, Taxi, XL, Mini Truck, Truck) with unified booking
**Components**: 8 new | API Groups: 3 new | Database: 6 new tables
**Estimated Effort**: 180 dev-hours

---

## 🏗️ ARCHITECTURE OVERVIEW

```
┌─────────────────────────────────────────┐
│         User Selects Vehicle            │
│  (Auto / Taxi / XL / Truck / Mini)      │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│    Get Available Drivers + Pricing      │
│  (vehicleTypesAPI.searchRides)          │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│     Display Ride Options & Prices       │
│   (Dynamic pricing per vehicle type)    │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│      User Confirms & Books Ride         │
│  (bookingAPIv2.createBooking)           │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│     Smart Dispatch to Driver            │
│  (Match best driver for vehicle type)   │
└─────────────────────────────────────────┘
```

---

## 📊 DATABASE SCHEMA (Phase 1)

### Table 1: vehicle_types
```sql
CREATE TABLE vehicle_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Basic Info
  category VARCHAR(50) NOT NULL, -- 'auto', 'taxi', 'xl', 'truck', etc
  name VARCHAR(100) NOT NULL, -- 'Auto Rickshaw', 'Taxi', etc
  display_name VARCHAR(100) NOT NULL,
  icon_emoji VARCHAR(2),
  description TEXT,
  
  -- Capacity
  passenger_capacity INT NOT NULL,
  cargo_capacity_kg INT DEFAULT 0,
  
  -- Pricing
  base_rate DECIMAL(10,2) NOT NULL, -- ₹50 for auto
  per_km_rate DECIMAL(10,2) NOT NULL, -- ₹15/km
  per_minute_rate DECIMAL(10,2) NOT NULL, -- ₹2/min
  
  -- Features & Requirements
  requires_training BOOLEAN DEFAULT false,
  requires_commercial_license BOOLEAN DEFAULT false,
  requires_insurance VARCHAR(200),
  ac_available BOOLEAN DEFAULT false,
  wifi_available BOOLEAN DEFAULT false,
  power_charging BOOLEAN DEFAULT false,
  
  -- Compliance
  documents_required JSONB, -- ['license', 'insurance', 'pollution']
  
  -- Status
  active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO vehicle_types VALUES
  (gen_random_uuid(), 'auto', 'Auto Rickshaw', 'Auto', '🏍️', 'Budget auto ride', 3, 50, 50, 15, 2, false, false, NULL, false, false, false, NULL, true, 1, NOW(), NOW()),
  (gen_random_uuid(), 'taxi', 'Sedan Taxi', 'Taxi', '🚕', 'Comfortable car ride', 4, 100, 80, 18, 2.5, true, true, 'Taxi permit, Commercial license', false, true, true, '["taxi_permit", "commercial_license", "insurance"]', true, 2, NOW(), NOW()),
  (gen_random_uuid(), 'xl', 'XL/Traveller', 'XL', '🚐', 'Group travel, 6-7 people', 7, 200, 150, 25, 3, false, true, 'Commercial license', false, true, true, '["commercial_license", "insurance", "permit"]', true, 3, NOW(), NOW()),
  (gen_random_uuid(), 'mini_truck', 'Mini Truck', 'Mini Truck', '🚚', 'Goods transport 500kg', 2, 500, 150, 80, 4, true, true, 'Commercial vehicle', false, false, false, '["commercial_license", "insurance", "pollution"]', true, 4, NOW(), NOW()),
  (gen_random_uuid(), 'truck', 'Full Truck', 'Truck', '🚛', 'Heavy goods 2-5 ton', 2, 3000, 300, 120, 5, true, true, 'Heavy vehicle license', false, false, false, '["heavy_license", "insurance", "fitness", "pollution"]', true, 5, NOW(), NOW());
```

### Table 2: ride_products
```sql
CREATE TABLE ride_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_type_id UUID NOT NULL REFERENCES vehicle_types(id),
  
  -- Identification
  code VARCHAR(50) UNIQUE NOT NULL, -- 'AUTO_STANDARD', 'TAXI_PREMIUM'
  name VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- Pricing Override (if different from vehicle_type)
  base_price_override DECIMAL(10,2),
  per_km_override DECIMAL(10,2),
  per_minute_override DECIMAL(10,2),
  
  -- Features specific to this product
  features JSONB, -- ['ac', 'wifi', 'water', 'charger']
  surge_multiplier_enabled BOOLEAN DEFAULT true,
  cancellation_policy VARCHAR(50) DEFAULT 'standard', -- 'strict', 'moderate', 'flexible'
  
  -- Availability
  available_24_7 BOOLEAN DEFAULT true,
  available_from TIME DEFAULT '00:00',
  available_until TIME DEFAULT '23:59',
  
  -- UI
  sort_order INT DEFAULT 0,
  active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO ride_products VALUES
  (gen_random_uuid(), (SELECT id FROM vehicle_types WHERE category='auto'), 'AUTO_STANDARD', 'Auto Standard', 'Regular auto rickshaw', NULL, NULL, NULL, '[]'::jsonb, true, 'standard', true, '00:00', '23:59', 1, true, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM vehicle_types WHERE category='auto'), 'AUTO_SHARE', 'Auto Share', 'Share auto with others', 30, NULL, NULL, '[]'::jsonb, false, 'flexible', true, '06:00', '22:00', 2, true, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM vehicle_types WHERE category='taxi'), 'TAXI_SEDAN', 'Taxi Sedan', 'Comfortable sedan ride', NULL, NULL, NULL, '["ac", "water", "charger"]'::jsonb, true, 'standard', true, '00:00', '23:59', 1, true, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM vehicle_types WHERE category='taxi'), 'TAXI_PREMIUM', 'Taxi Premium', 'Premium sedan with WiFi', NULL, 120, 3.5, '["ac", "wifi", "water", "charger"]'::jsonb, true, 'strict', true, '00:00', '23:59', 2, true, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM vehicle_types WHERE category='xl'), 'XL_STANDARD', 'XL Standard', 'Standard 6-7 seater', NULL, NULL, NULL, '["ac"]'::jsonb, true, 'standard', true, '00:00', '23:59', 1, true, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM vehicle_types WHERE category='mini_truck'), 'MINI_TRUCK_STANDARD', 'Mini Truck', '500kg transport', NULL, NULL, NULL, '[]'::jsonb, true, 'standard', true, '00:00', '23:59', 1, true, NOW(), NOW()),
  (gen_random_uuid(), (SELECT id FROM vehicle_types WHERE category='truck'), 'TRUCK_STANDARD', 'Full Truck', '2-5 ton transport', NULL, NULL, NULL, '[]'::jsonb, true, 'standard', true, '00:00', '23:59', 1, true, NOW(), NOW());
```

### Table 3: driver_vehicle_certifications
```sql
CREATE TABLE driver_vehicle_certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id),
  vehicle_type_id UUID NOT NULL REFERENCES vehicle_types(id),
  
  -- Certification Status
  certification_status ENUM('pending', 'verified', 'rejected', 'expired') DEFAULT 'pending',
  
  -- Verification Details
  verified_by UUID, -- admin_id
  verified_at TIMESTAMP,
  verification_notes TEXT,
  
  -- Required Documents
  license_type VARCHAR(50), -- 'LMV', 'HPMV', 'PSV'
  license_number VARCHAR(50),
  license_valid_until DATE,
  
  insurance_valid_until DATE,
  pollution_certificate_until DATE,
  
  vehicle_registration VARCHAR(50),
  vehicle_make_model VARCHAR(100),
  
  -- Eligibility
  can_accept_bookings BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Table 4: ride_pricing_overrides
```sql
CREATE TABLE ride_pricing_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- What it applies to
  vehicle_type_id UUID REFERENCES vehicle_types(id),
  ride_product_id UUID REFERENCES ride_products(id),
  
  -- When (time-based)
  start_time TIME,
  end_time TIME,
  days_of_week VARCHAR(7), -- 'MTWRFSU' bitmap
  
  -- Where (location-based)
  location_zone VARCHAR(100), -- 'airport', 'downtown', 'suburbs'
  
  -- Override values
  base_rate_multiplier DECIMAL(3,2), -- 1.5 for 50% increase
  per_km_multiplier DECIMAL(3,2),
  per_minute_multiplier DECIMAL(3,2),
  
  -- Status
  active BOOLEAN DEFAULT true,
  reason VARCHAR(200), -- 'peak_hours', 'event', 'rain'
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Example: Peak hour multiplier
INSERT INTO ride_pricing_overrides VALUES
  (gen_random_uuid(), 
   (SELECT id FROM vehicle_types WHERE category='auto'),
   NULL,
   '08:00', '10:00', 'MTWRF',
   'downtown',
   1.5, 1.5, 1.5,
   true, 'peak_hours', NOW(), NOW());
```

### Table 5: dispatch_preferences
```sql
CREATE TABLE dispatch_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id),
  
  -- Vehicle types this driver can handle
  preferred_vehicle_types UUID[] DEFAULT '{}',
  
  -- Location preferences
  preferred_zones VARCHAR(100)[] DEFAULT '{}',
  
  -- Operating hours
  available_hours_start TIME DEFAULT '00:00',
  available_hours_end TIME DEFAULT '23:59',
  
  -- Matching preferences
  minimum_rating DECIMAL(3,2) DEFAULT 3.0,
  accept_share_rides BOOLEAN DEFAULT true,
  accept_surge_rides BOOLEAN DEFAULT true,
  max_distance_km INT DEFAULT 50,
  
  -- Earnings targets
  daily_target DECIMAL(10,2),
  target_zone VARCHAR(100),
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Table 6: vehicle_inventory
```sql
CREATE TABLE vehicle_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES drivers(id),
  vehicle_type_id UUID NOT NULL REFERENCES vehicle_types(id),
  
  -- Vehicle Details
  vehicle_registration VARCHAR(50) UNIQUE NOT NULL,
  make_model VARCHAR(100),
  year_of_manufacture INT,
  color VARCHAR(50),
  
  -- Status
  status ENUM('active', 'maintenance', 'inactive') DEFAULT 'active',
  
  -- Documents
  insurance_valid_until DATE NOT NULL,
  pollution_cert_until DATE NOT NULL,
  fitness_cert_until DATE,
  
  -- Metrics
  total_km_driven INT DEFAULT 0,
  rating DECIMAL(3,2),
  rides_completed INT DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔌 API ENDPOINTS (Phase 1)

### Group 1: vehicleTypesAPI
```typescript
export const vehicleTypesAPI = {
  // Get all available vehicle types
  listVehicleTypes: () =>
    axiosInstance.get('/api/v2/vehicle-types'),

  // Get single vehicle type details
  getVehicleType: (vehicleTypeId: string) =>
    axiosInstance.get(`/api/v2/vehicle-types/${vehicleTypeId}`),

  // Get ride products for a vehicle type
  getRideProducts: (vehicleTypeId: string) =>
    axiosInstance.get(`/api/v2/ride-products?vehicle_type=${vehicleTypeId}`),

  // Get pricing for specific route
  calculatePricing: (data: {
    vehicle_type_id: string;
    origin: [number, number];
    destination: [number, number];
    ride_product_id?: string;
  }) =>
    axiosInstance.post('/api/v2/pricing/calculate', data),

  // Get current surge multipliers
  getSurgeMultipliers: () =>
    axiosInstance.get('/api/v2/pricing/surge-multipliers'),
};
```

### Group 2: bookingAPIv2
```typescript
export const bookingAPIv2 = {
  // Search available rides for a route
  searchRides: (data: {
    origin: [number, number];
    destination: [number, number];
    vehicle_types?: string[]; // Filter by specific types
    num_passengers?: number;
    cargo_weight_kg?: number;
    preferred_product?: string;
  }) =>
    axiosInstance.post('/api/v2/bookings/search', data),

  // Get estimated fare breakdown
  estimateFare: (data: {
    origin: [number, number];
    destination: [number, number];
    vehicle_type_id: string;
    ride_product_id: string;
  }) =>
    axiosInstance.post('/api/v2/bookings/estimate-fare', data),

  // Create new booking (multi-vehicle)
  createBooking: (data: {
    origin: [number, number];
    destination: [number, number];
    origin_address: string;
    destination_address: string;
    vehicle_type_id: string;
    ride_product_id: string;
    num_passengers: number;
    cargo_weight_kg?: number;
    special_requirements?: string;
  }) =>
    axiosInstance.post('/api/v2/bookings/create', data),

  // Get booking details
  getBooking: (bookingId: string) =>
    axiosInstance.get(`/api/v2/bookings/${bookingId}`),

  // Cancel booking
  cancelBooking: (bookingId: string, reason: string) =>
    axiosInstance.post(`/api/v2/bookings/${bookingId}/cancel`, { reason }),

  // Rate ride after completion
  rateRide: (bookingId: string, data: {
    rating: number;
    review: string;
  }) =>
    axiosInstance.post(`/api/v2/bookings/${bookingId}/rate`, data),
};
```

### Group 3: dispatchAPIv2
```typescript
export const dispatchAPIv2 = {
  // Get drivers available for specific vehicle type
  getAvailableDrivers: (vehicleTypeId: string, location: [number, number]) =>
    axiosInstance.get('/api/v2/dispatch/available-drivers', {
      params: {
        vehicle_type: vehicleTypeId,
        latitude: location[0],
        longitude: location[1],
      },
    }),

  // Smart dispatch (AI matching)
  smartDispatch: (bookingId: string) =>
    axiosInstance.post(`/api/v2/dispatch/bookings/${bookingId}/smart-match`, {}),

  // Manual driver selection
  assignDriver: (bookingId: string, driverId: string) =>
    axiosInstance.post(`/api/v2/dispatch/bookings/${bookingId}/assign-driver`, {
      driver_id: driverId,
    }),

  // Get dispatch status
  getDispatchStatus: (bookingId: string) =>
    axiosInstance.get(`/api/v2/dispatch/bookings/${bookingId}/status`),

  // Offer trip to driver
  offerTrip: (driverId: string, bookingId: string) =>
    axiosInstance.post(`/api/v2/dispatch/drivers/${driverId}/offer-trip`, {
      booking_id: bookingId,
    }),
};
```

---

## 💻 FRONTEND COMPONENTS (Phase 1)

### Component 1: VehicleTypeSelector.tsx (Main Screen)
```typescript
/**
 * VehicleTypeSelector - Show all 5 vehicle types with pricing
 * 
 * - Auto: Budget
 * - Taxi: Comfort
 * - XL: Group
 * - Mini Truck: Small goods
 * - Truck: Large goods
 */

import React, { useState, useEffect } from 'react';
import { View, FlatList, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { vehicleTypesAPI } from '../services/apiClient';

export default function VehicleTypeSelector({ 
  onVehicleSelected,
  origin,
  destination,
}) {
  const [vehicles, setVehicles] = useState([]);
  const [pricing, setPricing] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadVehicles();
  }, []);

  const loadVehicles = async () => {
    try {
      const vehicleTypes = await vehicleTypesAPI.listVehicleTypes();
      setVehicles(vehicleTypes.data);
      
      // Calculate pricing for each
      for (const vt of vehicleTypes.data) {
        const fare = await vehicleTypesAPI.calculatePricing({
          vehicle_type_id: vt.id,
          origin,
          destination,
        });
        setPricing(prev => ({
          ...prev,
          [vt.id]: fare.data.estimated_fare,
        }));
      }
    } catch (err) {
      console.error('Error loading vehicles:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose Your Ride</Text>
      <FlatList
        data={vehicles}
        keyExtractor={v => v.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.vehicleCard}
            onPress={() => onVehicleSelected(item)}
          >
            <View style={styles.vehicleHeader}>
              <Text style={styles.vehicleEmoji}>{item.icon_emoji}</Text>
              <View style={styles.vehicleInfo}>
                <Text style={styles.vehicleName}>{item.display_name}</Text>
                <Text style={styles.vehicleDescription}>
                  {item.passenger_capacity} passengers
                </Text>
              </View>
              <Text style={styles.vehiclePrice}>
                ₹{pricing[item.id]?.toFixed(0) || '--'}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        scrollEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  vehicleCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 12,
    marginBottom: 10,
  },
  vehicleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  vehicleEmoji: {
    fontSize: 32,
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleName: {
    fontSize: 14,
    fontWeight: '600',
  },
  vehicleDescription: {
    fontSize: 12,
    color: '#999',
  },
  vehiclePrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4ECDC4',
  },
});
```

### Component 2: RideProductSelector.tsx
```typescript
/**
 * RideProductSelector - Show variants for selected vehicle
 * (e.g., Auto Standard, Auto Share)
 */

export default function RideProductSelector({ vehicleTypeId, onProductSelected }) {
  const [products, setProducts] = useState([]);

  useEffect(() => {
    vehicleTypesAPI.getRideProducts(vehicleTypeId)
      .then(res => setProducts(res.data))
      .catch(err => console.error(err));
  }, [vehicleTypeId]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Ride Option</Text>
      <FlatList
        data={products}
        keyExtractor={p => p.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.productCard}
            onPress={() => onProductSelected(item)}
          >
            <View style={styles.productHeader}>
              <View>
                <Text style={styles.productName}>{item.name}</Text>
                <Text style={styles.productDesc}>{item.description}</Text>
                {item.features?.length > 0 && (
                  <Text style={styles.features}>✓ {item.features.join(', ')}</Text>
                )}
              </View>
            </View>
          </TouchableOpacity>
        )}
        scrollEnabled={false}
      />
    </View>
  );
}
```

### Component 3: FareEstimator.tsx
```typescript
/**
 * FareEstimator - Show fare breakdown before booking
 */

export default function FareEstimator({ 
  vehicleTypeId, 
  rideProductId,
  origin,
  destination,
  onConfirm,
}) {
  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadEstimate();
  }, [vehicleTypeId, rideProductId]);

  const loadEstimate = async () => {
    setLoading(true);
    try {
      const result = await bookingAPIv2.estimateFare({
        vehicle_type_id: vehicleTypeId,
        ride_product_id: rideProductId,
        origin,
        destination,
      });
      setEstimate(result.data);
    } finally {
      setLoading(false);
    }
  };

  if (!estimate) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fare Details</Text>
      
      <View style={styles.fareBreakdown}>
        <View style={styles.breakdownRow}>
          <Text>Base Fare</Text>
          <Text>₹{estimate.base_fare}</Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text>Distance ({estimate.distance}km)</Text>
          <Text>₹{estimate.distance_charge}</Text>
        </View>
        <View style={styles.breakdownRow}>
          <Text>Time Charge</Text>
          <Text>₹{estimate.time_charge}</Text>
        </View>
        {estimate.surge_multiplier > 1 && (
          <View style={styles.breakdownRow}>
            <Text>Surge Multiplier ({estimate.surge_multiplier}x)</Text>
            <Text>₹{estimate.surge_charge}</Text>
          </View>
        )}
        <View style={[styles.breakdownRow, styles.totalRow]}>
          <Text style={styles.totalText}>Total</Text>
          <Text style={styles.totalAmount}>₹{estimate.total_fare}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.confirmButton}
        onPress={() => onConfirm(estimate)}
      >
        <Text style={styles.confirmText}>Book Ride</Text>
      </TouchableOpacity>
    </View>
  );
}
```

### Component 4: GoodsTransportForm.tsx
```typescript
/**
 * GoodsTransportForm - For mini truck and full truck bookings
 * Captures: weight, dimensions, item type, pickup/dropoff instructions
 */

export default function GoodsTransportForm({ onSubmit }) {
  const [weight, setWeight] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [itemType, setItemType] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = () => {
    onSubmit({
      cargo_weight_kg: parseFloat(weight),
      cargo_dimensions: dimensions,
      cargo_type: itemType,
      special_instructions: notes,
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>What are you transporting?</Text>
      
      <TextInput
        style={styles.input}
        placeholder="Weight (kg)"
        value={weight}
        onChangeText={setWeight}
        keyboardType="decimal-pad"
      />
      
      <TextInput
        style={styles.input}
        placeholder="Dimensions (L x W x H)"
        value={dimensions}
        onChangeText={setDimensions}
      />
      
      <Picker
        selectedValue={itemType}
        onValueChange={setItemType}
        style={styles.picker}
      >
        <Picker.Item label="Select item type" value="" />
        <Picker.Item label="Furniture" value="furniture" />
        <Picker.Item label="Groceries" value="groceries" />
        <Picker.Item label="Industrial" value="industrial" />
        <Picker.Item label="Other" value="other" />
      </Picker>
      
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Special handling instructions"
        value={notes}
        onChangeText={setNotes}
        multiline
      />
      
      <TouchableOpacity
        style={styles.submitButton}
        onPress={handleSubmit}
      >
        <Text style={styles.submitText}>Proceed</Text>
      </TouchableOpacity>
    </View>
  );
}
```

### Component 5: VehicleFilters.tsx
```typescript
/**
 * VehicleFilters - Show/hide vehicle types based on criteria
 */

export default function VehicleFilters({ onFiltersChange }) {
  const [filters, setFilters] = useState({
    auto: true,
    taxi: true,
    xl: true,
    minTruck: false,
    truck: false,
    maxBudget: 500,
  });

  const toggleVehicle = (type) => {
    const updated = { ...filters, [type]: !filters[type] };
    setFilters(updated);
    onFiltersChange(updated);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Filter Rides</Text>
      
      <View style={styles.filterGroup}>
        <Text style={styles.groupTitle}>Vehicle Types</Text>
        {['auto', 'taxi', 'xl', 'minTruck', 'truck'].map(type => (
          <TouchableOpacity
            key={type}
            style={styles.filterOption}
            onPress={() => toggleVehicle(type)}
          >
            <Text style={styles.checkbox}>
              {filters[type] ? '☑️' : '☐'}
            </Text>
            <Text style={styles.label}>
              {type === 'auto' && 'Auto'}
              {type === 'taxi' && 'Taxi'}
              {type === 'xl' && 'XL (Group)'}
              {type === 'minTruck' && 'Mini Truck'}
              {type === 'truck' && 'Full Truck'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.filterGroup}>
        <Text style={styles.groupTitle}>Max Budget: ₹{filters.maxBudget}</Text>
        <Slider
          style={{ height: 40 }}
          minimumValue={100}
          maximumValue={2000}
          value={filters.maxBudget}
          onValueChange={value => {
            const updated = { ...filters, maxBudget: value };
            setFilters(updated);
            onFiltersChange(updated);
          }}
          step={50}
        />
      </View>
    </View>
  );
}
```

---

## 🔄 BOOKING FLOW (Phase 1)

### User Journey Map
```
1. Open AutoBuddy App
   ↓
2. Enter Origin & Destination
   ↓
3. VehicleTypeSelector shows:
   - Auto (₹150)
   - Taxi (₹220)
   - XL (₹380)
   - Mini Truck (₹250)
   - Truck (₹450)
   ↓
4. User selects "Taxi"
   ↓
5. RideProductSelector shows:
   - Taxi Sedan (₹220)
   - Taxi Premium (₹280)
   ↓
6. User selects "Taxi Sedan"
   ↓
7. FareEstimator shows:
   - Base Fare: ₹50
   - Distance: 10km × ₹18 = ₹180
   - Time: 12 min × ₹2.5 = ₹30
   - Surge: 1.0x
   - Total: ₹260
   ↓
8. User taps "Book Ride"
   ↓
9. dispatchAPIv2.smartDispatch() finds best taxi
   ↓
10. Driver accepts
    ↓
11. Live tracking starts
    ↓
12. Driver arrives
    ↓
13. Ride completes
    ↓
14. Rate & Pay
```

---

## ✅ ACCEPTANCE CRITERIA

### Week 1 (Foundation)
- [ ] All 5 vehicle_types in database
- [ ] All 7 ride_products created
- [ ] vehicleTypesAPI fully functional
- [ ] Pricing calculator working for all types
- [ ] Unit tests passing (80%+ coverage)

### Week 2 (Core Booking)
- [ ] VehicleTypeSelector component complete
- [ ] RideProductSelector component complete
- [ ] bookingAPIv2 endpoints all working
- [ ] Users can book Auto, Taxi, XL
- [ ] E2E test for Taxi booking passing

### Week 3 (Logistics)
- [ ] GoodsTransportForm component complete
- [ ] Mini Truck & Truck bookings working
- [ ] Weight-based pricing working
- [ ] Load instructions captured & displayed to driver
- [ ] 5/5 vehicle types fully operational

### Final QA
- [ ] No TypeScript errors
- [ ] All edge cases handled
- [ ] Error messages user-friendly
- [ ] Pricing accurate for all types
- [ ] Drivers can see vehicle type requirements

---

## 📈 SUCCESS METRICS (End of Phase 1)

| Metric | Target | Actual |
|--------|--------|--------|
| Total Bookings/day | 1000 | - |
| Vehicle Type Mix | Auto 30%, Taxi 40%, XL 20%, Truck 10% | - |
| Avg Order Value | ₹400 (up from ₹250) | - |
| Completion Rate | >80% | - |
| Driver Satisfaction | >4.5/5 | - |
| Customer Satisfaction | >4.3/5 | - |

---

**Status**: Ready for implementation  
**Start Date**: TBD  
**End Date**: 3 weeks  
**Team Size**: 5 (2 Backend, 2 Frontend, 1 QA)  
**Confidence Level**: HIGH (based on existing architecture)
