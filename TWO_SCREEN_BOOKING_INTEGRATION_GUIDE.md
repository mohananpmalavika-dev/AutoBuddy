# Two-Screen Booking Flow - Integration Guide

## Quick Start

The two-screen booking flow has been created and is ready to integrate with your existing PassengerMap. Here's how to use it.

---

## Files Created

```
autobuddy-mobile/src/screens/
├── ServiceSelectionScreen.js       (744 lines)
├── BookingDetailsScreen.js         (688 lines)
└── PassengerBookingNavigator.js    (63 lines)
```

---

## Integration Options

### Option 1: Modal Integration (Recommended)

Show the new booking flow as a modal over PassengerMap:

```javascript
// In PassengerMap.js or PassengerMap.web.js

import PassengerBookingNavigator from '../screens/PassengerBookingNavigator';
import { Modal } from 'react-native';

export function PassengerMapContent({ token, user, onLogout, onProfilePress }) {
  const [showNewBookingFlow, setShowNewBookingFlow] = useState(false);

  const handleBookingFlowComplete = (bookingData) => {
    // Booking created, show confirmation
    setShowNewBookingFlow(false);
    // Handle the booking (same as current booking flow)
    handleCreateBooking(bookingData);
  };

  return (
    <>
      {/* Existing PassengerMap content */}
      
      {/* New booking flow modal */}
      <Modal
        visible={showNewBookingFlow}
        animationType="slide"
        presentationStyle="fullScreen"
      >
        <PassengerBookingNavigator
          onBookingComplete={handleBookingFlowComplete}
          onCancel={() => setShowNewBookingFlow(false)}
        />
      </Modal>

      {/* Button to trigger new flow */}
      <TouchableOpacity
        onPress={() => setShowNewBookingFlow(true)}
        style={styles.bookButton}
      >
        <Text>New Booking (Two-Step)</Text>
      </TouchableOpacity>
    </>
  );
}
```

### Option 2: Stack Navigation Integration

Use React Navigation Stack:

```javascript
// In navigation configuration

import ServiceSelectionScreen from '../screens/ServiceSelectionScreen';
import BookingDetailsScreen from '../screens/BookingDetailsScreen';

const Stack = createNativeStackNavigator();

export function BookingStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="ServiceSelection"
        component={ServiceSelectionScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="BookingDetails"
        component={BookingDetailsScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
```

### Option 3: Tab-Based Integration

Add as a new tab in passenger menu:

```javascript
// In PassengerMap.js

const PASSENGER_MENU_OPTIONS = [
  { key: 'ride' },
  { key: 'new-booking' },  // NEW - Two-step booking
  { key: 'drivers' },
  // ... rest of menu
];

// In render section:
if (activePassengerMenu === 'new-booking') {
  return (
    <PassengerBookingNavigator
      onBookingComplete={handleBookingFlowComplete}
      onCancel={() => setActivePassengerMenu('ride')}
    />
  );
}
```

---

## Component API

### PassengerBookingNavigator

**Props:**
```javascript
{
  onBookingComplete?: (bookingData) => void,  // Called when booking succeeds
  onCancel?: () => void                        // Called when user cancels
}
```

**Navigation Interface:**
```javascript
navigation = {
  navigate: (screen: string, params?: object) => void,
  goBack: () => void
}
```

---

## Data Flow

```
USER SELECTS SERVICE
  ↓
ServiceSelectionScreen.js
  ├─ Shows 7 vehicle types
  └─ Shows 7 ride types
  ↓
PassengerBookingNavigator (state management)
  ↓
BookingDetailsScreen.js
  ├─ Shows location inputs
  ├─ Shows date/time picker (if scheduled)
  ├─ Shows passenger count / goods weight
  └─ Shows fare estimate
  ↓
USER TAPS "FIND DRIVER"
  ↓
POST /api/bookings/create
  ↓
onBookingComplete callback
```

---

## Screen Features

### ServiceSelectionScreen

**Displays:**
- Vehicle type grid (Auto, Taxi, XL, Traveller, Bus, Mini Truck, Truck)
- Ride type grid (Instant, Scheduled, Rental, Airport, Corporate, Tourism, Goods)
- Vehicle subtypes for selected vehicle
- Selection summary

**Outputs:**
```javascript
{
  vehicleType: {
    id: "auto",
    name: "Auto",
    icon: "🛺",
    // ...
  },
  rideType: {
    id: "instant",
    name: "Instant Ride",
    // ...
  }
}
```

### BookingDetailsScreen

**Displays:**
- Service summary (vehicle + ride type)
- Pickup location input with autocomplete
- Dropoff location input with autocomplete
- Saved places quick select
- Date/time picker (if scheduled)
- Passenger count or goods weight counter
- Promo code input
- Fare estimate breakdown
- Find Driver button

**Outputs:**
```javascript
{
  pickupLocation: "Market Street, Kochi",
  pickupCoords: { latitude: 13.0827, longitude: 80.2707 },
  dropoffLocation: "Airport, Terminal 3",
  dropoffCoords: { latitude: 13.1939, longitude: 80.1180 },
  rideDate: "2026-05-30T10:30:00Z",
  passengerCount: 2,
  goodsWeight: 0,
  promoCode: "WELCOME50",
  estimatedFare: 361
}
```

---

## Required Backend Endpoints

These endpoints need to be implemented before the screens will work:

### 1. Fetch Ride Types
```
GET /api/ride-types/public/all
Response: { data: [ { id, name, icon, description, active, regions } ] }
```

### 2. Fetch Vehicle Types with Subtypes
```
GET /api/admin/vehicle-types/public/all
Response: { data: [ { id, name, icon, subtypes: [ { id, name, multiplier } ] } ] }
```

### 3. Estimate Fare
```
POST /api/bookings/estimate-fare
Body: { pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude, vehicle_type_id, ride_type, passenger_count, goods_weight_kg }
Response: { data: { distance_km, duration_minutes, estimated_fare, breakdown: { ... } } }
```

### 4. Create Booking
```
POST /api/bookings/create
Body: { pickup_*, dropoff_*, vehicle_type_id, ride_type, scheduled_pickup_time, passenger_count, promo_code }
Response: { data: { booking_id, status, estimated_fare } }
```

---

## Styling & Theming

Both screens use the existing COLORS and TYPOGRAPHY theme from your app:

```javascript
import { COLORS, SHADOWS, TYPOGRAPHY } from '../theme';

// Colors used:
COLORS.primary           // Button, selected state
COLORS.background        // Screen background
COLORS.card              // Input containers
COLORS.text              // Primary text
COLORS.textSecondary     // Descriptions, labels
COLORS.border            // Input borders
COLORS.success           // Checkmarks
COLORS.disabled          // Inactive buttons
```

To customize:
1. Edit `src/theme.js` with your colors
2. Both screens automatically use updated colors
3. No changes needed in screen files

---

## Vehicle Types & Subtypes

### Vehicle Types (7)
```
🛺 Auto        - Budget friendly (0.75x multiplier)
🚖 Taxi        - Comfortable (1.0x)
🚗 XL          - More space (1.25-1.5x)
🚐 Traveller   - Group travel (1.25x)
🚌 Bus         - Large groups (1.8x)
🚚 Mini Truck  - Small goods (1.5x)
🚛 Truck       - Heavy goods (1.8x)
```

### Ride Types (7)
```
⚡ Instant Ride      - Book now, ride immediately
📅 Scheduled Ride    - Book for later time
⏰ Rental / Hourly   - Hourly rental service
✈️ Airport          - Airport transfer
🏢 Corporate        - Business travel
🗺️ Tourism         - Sightseeing tours
📦 Goods / Logistics - Cargo delivery
```

---

## Environment Variables

Make sure these are set in your `.env`:

```bash
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your_key_here
EXPO_PUBLIC_API_BASE_URL=https://your-api.com
```

Both screens use:
- `getPlaceLocation()` for geocoding
- `searchPlaces()` for autocomplete
- `reverseGeocodeLocation()` for address lookup

---

## Testing Checklist

- [ ] ServiceSelectionScreen renders all vehicle types
- [ ] ServiceSelectionScreen renders all ride types
- [ ] Vehicle subtypes appear when vehicle selected
- [ ] Continue button only enabled when both selected
- [ ] BookingDetailsScreen receives vehicle and ride type
- [ ] Location inputs work with Places API
- [ ] Saved places display correctly
- [ ] Date picker shows for scheduled rides only
- [ ] Passenger count works for non-goods rides
- [ ] Goods weight works for goods/logistics rides
- [ ] Fare estimate calculates correctly
- [ ] Find Driver button submits booking
- [ ] Back button navigates correctly
- [ ] Modal dismisses on cancel
- [ ] onBookingComplete called with correct data

---

## Common Issues & Solutions

### Issue: Location inputs not working
**Solution:** Ensure Google Places API is configured and EXPO_PUBLIC_GOOGLE_MAPS_API_KEY is set

### Issue: Fare estimation returns error
**Solution:** Backend endpoint /api/bookings/estimate-fare not implemented yet

### Issue: Vehicle types not loading
**Solution:** Backend endpoint /api/admin/vehicle-types/public/all not implemented yet

### Issue: Screens not rendering
**Solution:** Check that all imports are correct and file paths match your project structure

---

## Next Steps

1. **Integrate screens** using one of the options above
2. **Implement backend endpoints** (see API spec in TOTAL_MOBILITY_PLATFORM_ARCHITECTURE.md)
3. **Test booking flow** from service selection to confirmation
4. **Build admin panel** for managing vehicle types and ride types
5. **Configure regional coverage** for your deployment areas
6. **Load test** with multiple concurrent bookings

---

## File Manifest

| File | Lines | Purpose |
|------|-------|---------|
| ServiceSelectionScreen.js | 744 | Vehicle & ride type selection |
| BookingDetailsScreen.js | 688 | Location, time, fare entry |
| PassengerBookingNavigator.js | 63 | Navigation state management |

**Total New Code:** ~1,500 lines

---

## Architecture Diagram

```
PassengerMap (Main Screen)
  ↓
  ├─ User taps "Book a Ride"
  ↓
PassengerBookingNavigator (Container)
  ├─ State: currentScreen, selectedService
  ├─ Navigation handlers
  ↓
  ├─ ServiceSelectionScreen
  │  ├─ Fetch vehicle types & ride types
  │  ├─ Show selection grid
  │  └─ handleServiceSelected()
  │
  └─ BookingDetailsScreen
     ├─ Fetch saved places
     ├─ Show location inputs
     ├─ Calculate fare estimate
     └─ handleBookRide()
        ↓
     POST /api/bookings/create
        ↓
     onBookingComplete()
        ↓
     Back to PassengerMap
```

---

## Support

Questions? Check:
1. TOTAL_MOBILITY_PLATFORM_ARCHITECTURE.md (full spec)
2. Component JSDoc comments
3. API endpoint documentation
4. Theme configuration in src/theme.js

---

**Status**: ✅ Complete and Ready for Integration  
**Created**: May 30, 2026  
**Next Phase**: Backend API Implementation
