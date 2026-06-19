# Driver Flow Implementation - Integration Guide

**Status**: Ready to Use  
**Created**: June 19, 2026

---

## 📦 Deliverables

### Components Created
1. **DriverDocumentStatus.tsx** - Document verification dashboard
2. **DriverEarningsWidget.tsx** - Real-time earnings display
3. **DriverRideRequestCard.tsx** - Improved ride request UI
4. **DriverDashboardSimplified.tsx** - Main dashboard with 4 tabs
5. **useDriverDashboard.ts** - Custom hooks for data fetching

### Key Files
```
autobuddy-mobile/src/
├── components/
│   ├── DriverDocumentStatus.tsx
│   ├── DriverEarningsWidget.tsx
│   ├── DriverRideRequestCard.tsx
├── screens/
│   └── DriverDashboardSimplified.tsx
└── hooks/
    └── useDriverDashboard.ts
```

---

## 🚀 How to Use

### 1. Import Components in Your Screen

```typescript
import DriverDashboardSimplified from '@/screens/DriverDashboardSimplified';
import { DriverDocumentStatus } from '@/components/DriverDocumentStatus';
import { DriverEarningsWidget } from '@/components/DriverEarningsWidget';
import { RideRequestCard } from '@/components/DriverRideRequestCard';
```

### 2. Use in Your App

```typescript
import DriverDashboardSimplified from '@/screens/DriverDashboardSimplified';

export function App() {
  const [session, setSession] = useState<AppSession | null>(null);

  return (
    <DriverDashboardSimplified
      token={session?.token || ''}
      user={session?.user}
      onLogout={() => handleLogout()}
    />
  );
}
```

---

## 🎯 Component Details

### DriverDocumentStatus

**Purpose**: Show document verification progress  
**Props**:
```typescript
{
  documents: DocumentStatus[];  // Array of documents
  onUploadDocument?: (docName: string) => void;  // Upload callback
  loading?: boolean;
}
```

**Usage**:
```typescript
<DriverDocumentStatus
  documents={documents}
  onUploadDocument={(docName) => handleUpload(docName)}
  loading={false}
/>
```

**Features**:
- ✅ Progress bar (0-100%)
- ✅ Individual document status tracking
- ✅ Rejection reason display
- ✅ Next step indicator
- ✅ Expandable details

---

### DriverEarningsWidget

**Purpose**: Display real-time earnings  
**Props**:
```typescript
{
  earnings: EarningsData;
  loading?: boolean;
  onViewDetails?: () => void;
}
```

**Usage**:
```typescript
<DriverEarningsWidget
  earnings={{
    today: 2450,
    week: 15230,
    month: 45200,
    statistics: {
      ridesCount: 12,
      distance: 45,
      avgRating: 4.8,
      completionRate: 98,
    },
    nextPayoutDate: '2026-06-21',
    payoutAmount: 15000,
    comparison: {
      percentChange: 15,
      previousAmount: 2130,
    },
  }}
/>
```

**Features**:
- ✅ Today's earnings prominent display
- ✅ Comparison with average (+/- %)
- ✅ Weekly/monthly breakdown
- ✅ Payout schedule
- ✅ Earning tips

---

### RideRequestCard

**Purpose**: Show ride requests with timer  
**Props**:
```typescript
{
  ride: RideRequest;
  onAccept: (rideId: string) => void;
  onDecline: (rideId: string) => void;
  decisionTimeLimit?: number;  // Default: 12 seconds
}
```

**Usage**:
```typescript
<RideRequestCard
  ride={{
    id: 'ride-123',
    passenger: {
      id: 'user-123',
      name: 'John Doe',
      photo: 'https://...',
      rating: 4.8,
      rideCount: 45,
    },
    pickupLocation: 'MG Road, Bangalore',
    destinationLocation: 'Indiranagar, Bangalore',
    estimatedFare: 150,
    estimatedDistance: 8.5,
    estimatedDuration: 18,
  }}
  onAccept={(rideId) => acceptRide(rideId)}
  onDecline={(rideId) => declineRide(rideId)}
  decisionTimeLimit={12}
/>
```

**Features**:
- ✅ 12-second timer (configurable)
- ✅ Timer bar at top with color change (red at 3s)
- ✅ Passenger info with photo & rating
- ✅ Pickup & destination locations
- ✅ Fare estimate + distance
- ✅ Auto-decline on timeout
- ✅ Loading states

---

### DriverDashboardSimplified

**Purpose**: Main driver dashboard with 4 tabs  
**Props**:
```typescript
{
  token: string;
  user: any;
  onLogout: () => void;
}
```

**Tabs**:
1. **Map** - Live ride map (placeholder)
2. **Rides** - Ride history
3. **Earnings** - Earnings + documents
4. **Profile** - Profile + logout

---

## 🪝 Custom Hooks

### useDriverEarnings

```typescript
const { earnings, loading, error, refetch } = useDriverEarnings(token);

// earnings: EarningsData | null
// loading: boolean
// error: DriverError | null
// refetch: () => Promise<void>
```

**Features**:
- Fetches earnings data
- Auto-refreshes every 30 seconds
- Error handling

---

### useDriverDocuments

```typescript
const { documents, loading, error, refetch } = useDriverDocuments(token);

// documents: DocumentStatus[]
// loading: boolean
// error: DriverError | null
// refetch: () => Promise<void>
```

**Features**:
- Fetches document status
- Auto-refreshes every 60 seconds
- Tracks pending/verified/rejected

---

### useRideRequest

```typescript
const { rideRequest, loading, error, acceptRide, declineRide } = useRideRequest(token);

// rideRequest: RideRequest | null
// loading: boolean
// error: DriverError | null
// acceptRide: (rideId: string) => Promise<void>
// declineRide: (rideId: string, reason?: string) => Promise<void>
```

---

### useDriverOnlineStatus

```typescript
const { isOnline, loading, error, toggleOnlineStatus } = useDriverOnlineStatus(token);

// isOnline: boolean
// loading: boolean
// error: DriverError | null
// toggleOnlineStatus: (online: boolean) => Promise<void>
```

---

### useDriverAlerts

```typescript
const { alerts, loading } = useDriverAlerts(token);

// alerts: number (count of unread alerts)
// loading: boolean
```

---

### useDriverDocumentUpload

```typescript
const { uploading, error, uploadDocument } = useDriverDocumentUpload(token);

// uploading: boolean
// error: DriverError | null
// uploadDocument: (documentType: string, fileUri: string) => Promise<void>
```

---

## 📱 Full Example Integration

```typescript
import React, { useState } from 'react';
import { View } from 'react-native';
import DriverDashboardSimplified from '@/screens/DriverDashboardSimplified';

export function DriverScreen({ token, user, onLogout }) {
  return (
    <View style={{ flex: 1 }}>
      <DriverDashboardSimplified
        token={token}
        user={user}
        onLogout={onLogout}
      />
    </View>
  );
}
```

---

## ⚙️ Backend API Requirements

### Required Endpoints

```
GET /drivers/me/documents
  Response: DocumentStatus[]

GET /drivers/me/earnings?period=day|week|month
  Response: EarningsData

POST /drivers/me/ride-request/accept
  Body: { ride_id: string }

POST /drivers/me/ride-request/decline
  Body: { ride_id: string, reason?: string }

PUT /drivers/me/online-status
  Body: { online: boolean }

GET /drivers/me/alerts/unread
  Response: { count: number }

POST /drivers/me/documents/{type}/upload
  Body: FormData with file

GET /drivers/me/rides?limit=10&offset=0
  Response: { rides: Ride[], total: number }
```

---

## 🧪 Testing

### Unit Tests

```typescript
import { render } from '@testing-library/react-native';
import { DriverDocumentStatus } from '@/components/DriverDocumentStatus';

describe('DriverDocumentStatus', () => {
  it('should display progress percentage', () => {
    const documents = [
      { name: 'license', label: 'License', status: 'verified' as const },
      { name: 'insurance', label: 'Insurance', status: 'pending' as const },
    ];

    const { getByText } = render(
      <DriverDocumentStatus documents={documents} />
    );

    expect(getByText('50%')).toBeTruthy();
  });

  it('should show next step indicator', () => {
    const documents = [
      { name: 'license', label: 'License', status: 'verified' as const },
    ];

    const { getByText } = render(
      <DriverDocumentStatus documents={documents} />
    );

    expect(getByText(/upload/i)).toBeTruthy();
  });
});
```

### Integration Tests

```typescript
describe('DriverDashboardSimplified', () => {
  it('should toggle online status', async () => {
    const mockOnLogout = jest.fn();
    const { getByText, getByRole } = render(
      <DriverDashboardSimplified
        token="test-token"
        user={{ id: 1, name: 'Driver' }}
        onLogout={mockOnLogout}
      />
    );

    const onlineToggle = getByRole('button', { name: /offline/i });
    fireEvent.press(onlineToggle);

    expect(getByText(/you are now online/i)).toBeTruthy();
  });

  it('should display ride request with timer', async () => {
    // Test timer countdown
    // Test accept/decline actions
  });
});
```

---

## 📊 Data Structures

### DocumentStatus
```typescript
{
  name: string;
  label: string;
  status: 'pending' | 'verified' | 'rejected' | 'uploading' | 'expired';
  uploadedAt?: Date;
  expiresAt?: Date;
  rejectionReason?: string;
}
```

### EarningsData
```typescript
{
  today: number;
  week: number;
  month: number;
  statistics: {
    ridesCount: number;
    distance: number;
    avgRating: number;
    completionRate: number;
  };
  nextPayoutDate?: string;
  payoutAmount?: number;
  comparison?: {
    percentChange: number;
    previousAmount: number;
  };
}
```

### RideRequest
```typescript
{
  id: string;
  passenger: {
    id: string;
    name: string;
    photo?: string;
    rating: number;
    rideCount: number;
  };
  pickupLocation: string;
  destinationLocation: string;
  estimatedFare: number;
  estimatedDistance: number;
  estimatedDuration: number;
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

- Document verification completion rate
- Average time to complete verification
- Earnings display accuracy
- Ride request acceptance rate
- Ride request timeout rate
- App performance (load time, FPS)
- Error rate by endpoint
- User retention

---

## 🐛 Common Issues & Solutions

### Issue: Earnings not updating
**Solution**: Check refresh interval, verify API endpoint, check for errors

### Issue: Timer not counting down
**Solution**: Verify useEffect cleanup, check interval setup

### Issue: Document upload failing
**Solution**: Check FormData setup, verify file permissions, check API

### Issue: Ride request not showing
**Solution**: Check WebSocket connection, verify data format, check error logs

---

## 📚 Related Documentation

- DRIVER_FLOW_IMPLEMENTATION.md - Full implementation guide
- UX_DEVELOPER_REFERENCE.md - Developer quick reference
- API documentation (backend)

---

## 💬 Support

For questions or issues:
1. Check this guide
2. Review component props
3. Check example usage
4. Contact: support@auto-buddy.in

