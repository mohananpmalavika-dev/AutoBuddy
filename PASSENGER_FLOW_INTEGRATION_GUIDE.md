# Passenger Flow Implementation - Integration Guide

**Status**: Ready to Use  
**Created**: June 19, 2026

---

## 📦 Deliverables

### Components Created
1. **PassengerSimplifiedOnboarding.tsx** - 4-step signup process
2. **PassengerSingleScreenBooking.tsx** - Single-screen booking interface
3. **DriverInfoCard.tsx** - Driver information display
4. **ScheduleRideModal.tsx** - Date/time picker for scheduling
5. **PassengerDashboard.tsx** - Main dashboard with 4 tabs
6. **usePassengerBooking.ts** - Custom hooks for data management

### Key Files
```
autobuddy-mobile/src/
├── components/
│   ├── PassengerSimplifiedOnboarding.tsx
│   ├── PassengerSingleScreenBooking.tsx
│   ├── DriverInfoCard.tsx
│   └── ScheduleRideModal.tsx
├── screens/
│   └── PassengerDashboard.tsx
└── hooks/
    └── usePassengerBooking.ts
```

---

## 🚀 How to Use

### 1. Import Components in Your Screen

```typescript
import PassengerDashboard from '@/screens/PassengerDashboard';
import { SimplifiedOnboarding } from '@/components/PassengerSimplifiedOnboarding';
import { SingleScreenBooking } from '@/components/PassengerSingleScreenBooking';
import { DriverInfoCard } from '@/components/DriverInfoCard';
import { ScheduleRideModal } from '@/components/ScheduleRideModal';
```

### 2. Use in Your App

```typescript
import PassengerDashboard from '@/screens/PassengerDashboard';

export function App() {
  const [session, setSession] = useState<AppSession | null>(null);

  return (
    <PassengerDashboard
      token={session?.token || ''}
      user={session?.user}
      onLogout={() => handleLogout()}
    />
  );
}
```

---

## 🎯 Component Details

### PassengerSimplifiedOnboarding

**Purpose**: Streamlined 4-step signup process  
**Props**:
```typescript
{
  loading?: boolean;
  onComplete: (data: SignupData) => void;
  onSkip?: () => void;
}
```

**Usage**:
```typescript
<SimplifiedOnboarding
  onComplete={(data) => {
    console.log('Phone:', data.phone);
    console.log('Name:', data.name);
    console.log('Payment:', data.paymentMethod);
  }}
  onSkip={() => skipOnboarding()}
/>
```

**Features**:
- ✅ 4-step signup (Phone → Name → Email → Payment)
- ✅ Phone verification with OTP
- ✅ Progress bar showing completion
- ✅ Optional email field
- ✅ Payment method selection
- ✅ ~2-3 minutes completion time (vs 5-10 minutes before)

---

### PassengerSingleScreenBooking

**Purpose**: Consolidated booking interface  
**Props**:
```typescript
{
  savedLocations?: Location[];
  onBookRide: (rideData: BookingData) => void;
  onScheduleClick?: () => void;
  loading?: boolean;
}
```

**Usage**:
```typescript
<SingleScreenBooking
  savedLocations={[
    {
      latitude: 13.0827,
      longitude: 80.2707,
      address: '123 MG Road, Bangalore',
      name: 'Home',
    },
  ]}
  onBookRide={(rideData) => {
    console.log('Booking:', rideData);
  }}
  onScheduleClick={() => openScheduleModal()}
/>
```

**Features**:
- ✅ Search with voice input
- ✅ Saved locations with quick access (Home, Work)
- ✅ Location suggestions dropdown
- ✅ 4 ride types (Bike, Economy, Premium, XL)
- ✅ Real-time fare estimation
- ✅ Surge pricing display
- ✅ Book Now and Schedule buttons
- ✅ Safety and discount info cards

---

### DriverInfoCard

**Purpose**: Display driver information before/during ride  
**Props**:
```typescript
{
  driver: DriverInfo;
  onCall?: () => void;
  onMessage?: () => void;
  showEta?: boolean;
}
```

**Usage**:
```typescript
<DriverInfoCard
  driver={{
    id: 'driver-123',
    name: 'Raj Kumar',
    photo: 'https://...',
    rating: 4.8,
    rideCount: 145,
    vehicle: {
      make: 'Toyota',
      model: 'Innova',
      licensePlate: 'KA01AB1234',
      color: 'Silver',
    },
    eta: 5,
  }}
  onCall={() => callDriver()}
  onMessage={() => messageDriver()}
  showEta={true}
/>
```

**Features**:
- ✅ Driver photo, name, rating, ride count
- ✅ Vehicle make, model, license plate, color
- ✅ ETA display
- ✅ Call and message buttons
- ✅ Safety verification badge

---

### ScheduleRideModal

**Purpose**: Date/time picker for scheduling rides  
**Props**:
```typescript
{
  visible: boolean;
  destination: string;
  rideType: string;
  onConfirm: (scheduleData: ScheduleData) => void;
  onCancel: () => void;
}
```

**Usage**:
```typescript
<ScheduleRideModal
  visible={showScheduleModal}
  destination="Indiranagar, Bangalore"
  rideType="economy"
  onConfirm={(data) => {
    console.log('Scheduled for:', data.date, data.time);
  }}
  onCancel={() => setShowScheduleModal(false)}
/>
```

**Features**:
- ✅ Date selection (Today + 4 days ahead)
- ✅ Time slot selection (14 available times)
- ✅ Optional notes/special instructions
- ✅ 10% discount promotion
- ✅ Guaranteed pickup at scheduled time

---

### PassengerDashboard

**Purpose**: Main passenger dashboard with 4 tabs  
**Props**:
```typescript
{
  token: string;
  user: any;
  onLogout: () => void;
}
```

**Tabs**:
1. **Home** - Booking interface + upcoming rides
2. **Active** - Currently active ride with driver info + map
3. **History** - Past rides with details
4. **Profile** - Profile info + payment methods + locations

---

## 🪝 Custom Hooks

### usePassengerBooking

```typescript
const { booking, loading, error, bookRide, cancelBooking } = 
  usePassengerBooking(token);

// booking: BookingData | null
// loading: boolean
// error: PassengerError | null
// bookRide: (origin, destination, rideType, fare) => Promise<void>
// cancelBooking: (bookingId) => Promise<void>
```

---

### usePassengerRideTracking

```typescript
const { tracking, loading, error } = 
  usePassengerRideTracking(token, bookingId);

// tracking: RideTrackingData | null (updates every 5s)
// loading: boolean
// error: PassengerError | null
// Auto-updates driver location, ETA, passenger location
```

---

### usePassengerPayment

```typescript
const { methods, loading, error, setDefaultMethod, refetch } = 
  usePassengerPayment(token);

// methods: PaymentMethod[]
// loading: boolean
// error: PassengerError | null
// setDefaultMethod: (methodId: string) => Promise<void>
```

---

### usePassengerProfile

```typescript
const { profile, loading, error, updateProfile, refetch } = 
  usePassengerProfile(token);

// profile: PassengerProfile | null
// loading: boolean
// error: PassengerError | null
// updateProfile: (updates: Partial<PassengerProfile>) => Promise<void>
```

---

### usePassengerHistory

```typescript
const { rides, loading, error, hasMore, loadMore, refetch } = 
  usePassengerHistory(token, limit);

// rides: RideHistory[]
// loading: boolean
// error: PassengerError | null
// hasMore: boolean (pagination)
// loadMore: () => Promise<void> (load next page)
```

---

### usePassengerSchedule

```typescript
const { scheduled, loading, error, scheduleRide, cancelScheduled, refetch } = 
  usePassengerSchedule(token);

// scheduled: ScheduledRide[]
// loading: boolean
// error: PassengerError | null
// scheduleRide: (destination, scheduledAt, rideType) => Promise<void>
// cancelScheduled: (rideId) => Promise<void>
```

---

### usePassengerFareEstimate

```typescript
const { estimate, loading, error, estimateFare } = 
  usePassengerFareEstimate(token);

// estimate: FareEstimate | null
// loading: boolean
// error: PassengerError | null
// estimateFare: (origin, destination, rideType) => Promise<void>
```

---

## 📱 Full Example Integration

```typescript
import React, { useState } from 'react';
import { View } from 'react-native';
import PassengerDashboard from '@/screens/PassengerDashboard';
import { SimplifiedOnboarding } from '@/components/PassengerSimplifiedOnboarding';

export function PassengerScreen() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [session, setSession] = useState(null);

  const handleSignupComplete = async (data) => {
    // Call backend API to create account
    const result = await apiRequest('/auth/signup', {
      method: 'POST',
      body: data,
    });
    
    setSession(result);
    setIsLoggedIn(true);
  };

  return (
    <View style={{ flex: 1 }}>
      {!isLoggedIn ? (
        <SimplifiedOnboarding
          onComplete={handleSignupComplete}
          onSkip={() => setIsLoggedIn(true)}
        />
      ) : (
        <PassengerDashboard
          token={session?.token}
          user={session?.user}
          onLogout={() => {
            setIsLoggedIn(false);
            setSession(null);
          }}
        />
      )}
    </View>
  );
}
```

---

## ⚙️ Backend API Requirements

### Required Endpoints

```
POST /auth/signup
  Body: { phone, otp, name, email?, paymentMethod }
  Response: { token, user }

POST /auth/verify-otp
  Body: { phone, otp }
  Response: { success: boolean }

POST /passengers/rides/book
  Body: { origin, destination, rideType, fare }
  Response: BookingData

POST /passengers/rides/schedule
  Body: { destination, scheduledAt, rideType }
  Response: ScheduledRide

GET /passengers/rides/{bookingId}/tracking
  Response: RideTrackingData (live location updates)

POST /passengers/rides/{bookingId}/cancel
  Response: { success: boolean }

GET /passengers/me/payment-methods
  Response: PaymentMethod[]

PUT /passengers/me/payment-methods/{methodId}/set-default
  Response: { success: boolean }

GET /passengers/me/profile
  Response: PassengerProfile

PUT /passengers/me/profile
  Body: Partial<PassengerProfile>
  Response: PassengerProfile

GET /passengers/me/ride-history?limit=10&offset=0
  Response: { rides: RideHistory[], total: number }

GET /passengers/me/scheduled-rides
  Response: ScheduledRide[]

POST /passengers/scheduled-rides/{rideId}/cancel
  Response: { success: boolean }

POST /passengers/rides/estimate-fare
  Body: { origin, destination, rideType }
  Response: FareEstimate
```

---

## 🧪 Testing

### Unit Tests

```typescript
import { render } from '@testing-library/react-native';
import { DriverInfoCard } from '@/components/DriverInfoCard';

describe('DriverInfoCard', () => {
  it('should display driver name and rating', () => {
    const driver = {
      id: 'driver-1',
      name: 'John Doe',
      rating: 4.8,
      rideCount: 100,
      vehicle: {
        make: 'Toyota',
        model: 'Innova',
        licensePlate: 'KA01AB1234',
        color: 'Silver',
      },
    };

    const { getByText } = render(
      <DriverInfoCard driver={driver} />
    );

    expect(getByText('John Doe')).toBeTruthy();
    expect(getByText('4.8')).toBeTruthy();
  });

  it('should display vehicle information', () => {
    const driver = {
      id: 'driver-1',
      name: 'John Doe',
      rating: 4.8,
      rideCount: 100,
      vehicle: {
        make: 'Toyota',
        model: 'Innova',
        licensePlate: 'KA01AB1234',
        color: 'Silver',
      },
    };

    const { getByText } = render(
      <DriverInfoCard driver={driver} />
    );

    expect(getByText('Toyota Innova')).toBeTruthy();
    expect(getByText('Silver')).toBeTruthy();
    expect(getByText('KA01AB1234')).toBeTruthy();
  });
});
```

### Integration Tests

```typescript
describe('PassengerDashboard', () => {
  it('should show booking interface on home tab', async () => {
    const { getByText, getByPlaceholderText } = render(
      <PassengerDashboard
        token="test-token"
        user={{ id: 1, name: 'User' }}
        onLogout={jest.fn()}
      />
    );

    expect(getByPlaceholderText('Where to?')).toBeTruthy();
  });

  it('should book a ride', async () => {
    const { getByText, getByPlaceholderText } = render(
      <PassengerDashboard
        token="test-token"
        user={{ id: 1, name: 'User' }}
        onLogout={jest.fn()}
      />
    );

    const input = getByPlaceholderText('Where to?');
    fireEvent.changeText(input, 'Airport');

    const bookButton = getByText('BOOK NOW');
    fireEvent.press(bookButton);

    // Verify booking was created
    expect(getByText(/active ride/i)).toBeTruthy();
  });
});
```

---

## 📊 Data Structures

### SignupData
```typescript
{
  phone: string;
  name: string;
  email?: string;
  paymentMethod?: 'wallet' | 'upi' | 'card' | 'cash';
}
```

### BookingData
```typescript
{
  id: string;
  origin: string;
  destination: string;
  rideType: string;
  fare: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  createdAt: Date;
}
```

### RideTrackingData
```typescript
{
  driverId: string;
  driverName: string;
  driverPhoto?: string;
  driverRating: number;
  vehicleType: string;
  licensePlate: string;
  eta: number;
  driverLocation: { latitude, longitude };
  passengerLocation: { latitude, longitude };
  destinationLocation: { latitude, longitude };
}
```

### PassengerProfile
```typescript
{
  id: string;
  name: string;
  email?: string;
  phone: string;
  photo?: string;
  rating?: number;
  totalRides: number;
  joinedDate: Date;
  savedLocations: Array<{
    id: string;
    label: string;
    address: string;
    latitude: number;
    longitude: number;
  }>;
}
```

---

## 🚀 Deployment Checklist

- [ ] All components tested
- [ ] Hooks tested with mock data
- [ ] Backend APIs implemented
- [ ] Error handling tested
- [ ] Loading states tested
- [ ] Performance verified
- [ ] Accessibility checked
- [ ] Code reviewed
- [ ] QA sign-off
- [ ] Beta release (10% traffic)
- [ ] Monitor metrics
- [ ] Full release

---

## 📊 Metrics to Monitor

- Onboarding completion rate
- Booking success rate
- Average time to book
- Ride request acceptance rate
- Driver ETA accuracy
- Payment method usage
- Ride history accuracy
- App performance (load time, FPS)
- Error rate by endpoint
- User retention (30-day)

---

## 🐛 Common Issues & Solutions

### Issue: Booking not going through
**Solution**: Check booking endpoint, verify payment method is set, check network

### Issue: Driver info not updating
**Solution**: Verify tracking endpoint, check refresh interval (5s), check WebSocket

### Issue: Schedule modal not showing dates
**Solution**: Check date calculation logic, verify timezone handling

### Issue: Payment methods not loading
**Solution**: Check payment endpoints, verify user has valid payment methods

---

## 📚 Related Documentation

- DRIVER_FLOW_INTEGRATION_GUIDE.md - Driver implementation guide
- PASSENGER_FLOW_IMPLEMENTATION.md - Design specification
- UX_FLOW_AUDIT_AND_IMPROVEMENTS.md - Complete UX analysis

---

## 💬 Support

For questions or issues:
1. Check this guide
2. Review component props
3. Check example usage
4. Contact: support@auto-buddy.in

---

*Created: June 19, 2026*
