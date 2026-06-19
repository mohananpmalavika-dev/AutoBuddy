# Operator Flow Implementation - Integration Guide

**Status**: Ready to Use  
**Created**: June 19, 2026

---

## 📦 Deliverables

### Components Created
1. **OperatorDashboard.tsx** - Main operations dashboard
2. **DriverManagementCard.tsx** - Individual driver management
3. **useOperatorDashboard.ts** - Custom hooks for data management

### Key Files
```
autobuddy-mobile/src/
├── components/
│   └── DriverManagementCard.tsx
├── screens/
│   └── OperatorDashboard.tsx
└── hooks/
    └── useOperatorDashboard.ts
```

---

## 🚀 How to Use

### 1. Import Components

```typescript
import OperatorDashboard from '@/screens/OperatorDashboard';
import { DriverManagementCard } from '@/components/DriverManagementCard';
```

### 2. Use in Your App

```typescript
import OperatorDashboard from '@/screens/OperatorDashboard';

export function App() {
  const [session, setSession] = useState<AppSession | null>(null);

  return (
    <OperatorDashboard
      token={session?.token || ''}
      onLogout={() => handleLogout()}
    />
  );
}
```

---

## 🎯 Component Details

### OperatorDashboard

**Purpose**: Main operations dashboard with real-time stats  
**Props**:
```typescript
{
  token: string;
  onLogout: () => void;
}
```

**Features**:
- ✅ Period filter (Today/Week/Month)
- ✅ Live status cards (Online drivers, active rides, rating, utilization)
- ✅ Revenue breakdown (Earnings, Costs, Profit)
- ✅ Commission and incentive breakdown
- ✅ Real-time alerts system
- ✅ Quick action buttons
- ✅ Top performers leaderboard
- ✅ Real-time updates (30s refresh)

---

### DriverManagementCard

**Purpose**: Display and manage individual driver  
**Props**:
```typescript
{
  driver: DriverInfo;
  onMessage?: () => void;
  onAdjustIncentive?: () => void;
  onViewHistory?: () => void;
}
```

**Usage**:
```typescript
<DriverManagementCard
  driver={{
    id: 'driver-123',
    name: 'Raj Kumar',
    status: 'online',
    rating: 4.8,
    rideCount: 145,
    ridestoday: 12,
    earningsToday: 2500,
    earningsWeek: 15230,
    acceptanceRate: 94,
  }}
  onMessage={() => openChat()}
  onAdjustIncentive={() => openIncentiveModal()}
  onViewHistory={() => navigate('/driver-history')}
/>
```

**Features**:
- ✅ Driver photo and basic info
- ✅ Status badge (Online/Offline/On Ride)
- ✅ Rating display
- ✅ Today's stats (rides, earnings)
- ✅ Week earnings
- ✅ Acceptance rate
- ✅ Quick action buttons

---

## 🪝 Custom Hooks

### useFleetStats

```typescript
const { stats, loading, error, refetch } = useFleetStats(token);

// stats: FleetStatsData | null
// loading: boolean
// error: OperatorError | null
// Auto-refreshes every 30 seconds
```

**Provides**:
- Drivers online/total
- Active rides count
- Average rating
- Utilization rate
- Revenue, costs, profit

---

### useDriverMetrics

```typescript
const { drivers, loading, error, refetch, updateDriverIncentive } = 
  useDriverMetrics(token);

// drivers: DriverMetrics[]
// loading: boolean
// error: OperatorError | null
// Auto-refreshes every 60 seconds
```

**Provides**:
- All drivers with metrics
- Status and location
- Today's and week's stats
- Acceptance rates

---

### useOperatorAlerts

```typescript
const { alerts, loading, error, refetch, dismissAlert } = 
  useOperatorAlerts(token);

// alerts: OperatorAlert[]
// loading: boolean
// error: OperatorError | null
// Auto-refreshes every 60 seconds
```

---

### useDriverLocations

```typescript
const { locations, loading, error } = useDriverLocations(token);

// locations: DriverMetrics[] (with location data)
// loading: boolean
// error: OperatorError | null
// Real-time updates every 10 seconds
```

---

### useOperatorReports

```typescript
const { reports, loading, error, generateReport, downloadReport, refetch } = 
  useOperatorReports(token);

// reports: OperatorReport[]
// loading: boolean
// error: OperatorError | null
```

---

### useOperatorSettings

```typescript
const { settings, loading, error, updateSettings, refetch } = 
  useOperatorSettings(token);

// settings: any (operator configuration)
// loading: boolean
// error: OperatorError | null
```

---

## 📱 Full Example Integration

```typescript
import React, { useState } from 'react';
import { View } from 'react-native';
import OperatorDashboard from '@/screens/OperatorDashboard';
import { useFleetStats, useDriverMetrics } from '@/hooks/useOperatorDashboard';

export function OperatorScreen({ token, onLogout }) {
  const { stats } = useFleetStats(token);
  const { drivers } = useDriverMetrics(token);

  return (
    <View style={{ flex: 1 }}>
      <OperatorDashboard
        token={token}
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
GET /operators/me/fleet-stats
  Response: FleetStatsData

GET /operators/me/drivers/metrics
  Response: DriverMetrics[]

PUT /operators/me/drivers/{driverId}/incentive
  Body: { incentiveAmount: number }
  Response: { success: boolean }

GET /operators/me/alerts
  Response: OperatorAlert[]

POST /operators/me/alerts/{alertId}/dismiss
  Response: { success: boolean }

GET /operators/me/drivers/locations
  Response: DriverMetrics[] (with location)

GET /operators/me/reports
  Response: OperatorReport[]

POST /operators/me/reports/generate
  Body: { period: string }
  Response: OperatorReport

GET /operators/me/reports/{reportId}/download
  Response: Report file

GET /operators/me/settings
  Response: OperatorSettings

PUT /operators/me/settings
  Body: OperatorSettings
  Response: OperatorSettings
```

---

## 🧪 Testing

### Unit Tests

```typescript
import { render } from '@testing-library/react-native';
import { DriverManagementCard } from '@/components/DriverManagementCard';

describe('DriverManagementCard', () => {
  it('should display driver name and status', () => {
    const driver = {
      id: 'driver-1',
      name: 'John Doe',
      status: 'online' as const,
      rating: 4.8,
      rideCount: 100,
      ridestoday: 12,
      earningsToday: 2500,
      earningsWeek: 15000,
      acceptanceRate: 95,
    };

    const { getByText } = render(
      <DriverManagementCard driver={driver} />
    );

    expect(getByText('John Doe')).toBeTruthy();
    expect(getByText('Online')).toBeTruthy();
  });
});
```

---

## 📊 Data Structures

### FleetStatsData
```typescript
{
  driversOnline: number;
  driversTotal: number;
  activeRides: number;
  avgRating: number;
  utilizationRate: number;
  revenue: number;
  costs: number;
  profit: number;
}
```

### DriverMetrics
```typescript
{
  driverId: string;
  name: string;
  status: 'online' | 'offline' | 'on_ride';
  rating: number;
  ridestoday: number;
  earningsToday: number;
  earningsWeek: number;
  acceptanceRate: number;
  location?: { latitude, longitude };
}
```

### OperatorAlert
```typescript
{
  id: string;
  type: 'driver' | 'ride' | 'payment' | 'system';
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
}
```

---

## 🚀 Deployment Checklist

- [ ] All components tested
- [ ] Hooks tested with mock data
- [ ] Backend APIs implemented
- [ ] Real-time updates configured
- [ ] Error handling tested
- [ ] Performance verified
- [ ] QA sign-off
- [ ] Beta release
- [ ] Full release

---

## 📊 Key Metrics

- Fleet utilization rate
- Driver acceptance rate
- Average ride rating
- Revenue per driver
- Alert response time
- Dashboard load time

---

## 💬 Support

For questions or issues:
1. Check this guide
2. Review component props
3. Check example usage
4. Contact: support@auto-buddy.in
