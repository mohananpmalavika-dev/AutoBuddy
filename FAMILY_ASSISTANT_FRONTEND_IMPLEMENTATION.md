# Family Assistant Frontend Implementation Guide

## Overview
This guide covers implementing the Family Assistant feature in both React Native (mobile) and React (web) applications. The feature enables one-click ride booking for family members with automatic appointment detection and smart notifications.

## Architecture

### Shared Components
- **familyAssistantService.ts**: Core API service layer (works with both platforms)
- **FamilyAssistant models**: TypeScript interfaces for type safety

### Mobile (React Native/Expo)
- **useFamilyAssistant**: Custom React hook for state management
- **FamilyAssistantDashboard.tsx**: Main dashboard screen
- **QuickActionBookingModal.tsx**: One-click booking modal
- Components use React Native styling with StyleSheet

### Web (React)
- **useFamilyAssistantWeb**: Web-specific React hook with native fetch API
- **FamilyAssistantDashboardWeb.tsx**: React web dashboard component
- Fully styled with inline styles and CSS-in-JS

---

## Mobile Implementation (React Native/Expo)

### Installation

1. **Copy files to project:**
```bash
autobuddy-mobile/
├── src/
│   ├── services/
│   │   └── familyAssistantService.ts      # API client
│   ├── hooks/
│   │   └── useFamilyAssistant.ts          # Custom hook
│   ├── screens/
│   │   └── FamilyAssistantDashboard.tsx   # Main screen
│   └── components/
│       └── QuickActionBookingModal.tsx    # Booking modal
```

### Basic Usage

```tsx
// In your navigation setup or screen component
import { FamilyAssistantDashboard } from '../screens/FamilyAssistantDashboard';

// Add to navigation
<Stack.Screen
  name="FamilyAssistant"
  component={FamilyAssistantDashboard}
  options={{
    title: 'Family Assistant',
  }}
/>

// Or render directly
<FamilyAssistantDashboard
  userId={userId}
  token={authToken}
  userType="passenger"
/>
```

### Custom Hook Usage

```tsx
import { useFamilyAssistant } from '../hooks/useFamilyAssistant';

const MyComponent = ({ userId }: { userId: string }) => {
  const {
    familyMembers,
    upcomingAppointments,
    notifications,
    quickBookRide,
    addFamilyMember,
    loading,
    error,
  } = useFamilyAssistant(userId);

  // Your custom implementation
  return (
    // ...
  );
};
```

### Available Hook Methods

```typescript
// Family Members
addFamilyMember(data): Promise<void>
removeFamilyMember(memberId): Promise<void>
updateFamilyMember(memberId, data): Promise<void>

// Appointments
addAppointment(memberId, data): Promise<void>
updateAppointment(appointmentId, data): Promise<void>
cancelAppointment(appointmentId): Promise<void>
refreshAppointments(): Promise<void>

// Notifications
markNotificationRead(notificationId): Promise<void>
markAllRead(): Promise<void>
refreshNotifications(): Promise<void>

// One-Click Booking
quickBookRide(request): Promise<QuickActionBookingResponse>

// Calendar Sync
initializeCalendarSync(memberId, provider): Promise<void>
syncCalendar(memberId): Promise<void>

// Refresh all data
refreshAll(): Promise<void>
```

---

## Web Implementation (React)

### Installation

1. **Copy files to project:**
```bash
src/
├── hooks/
│   └── useFamilyAssistantWeb.ts           # Web hook
├── components/
│   └── FamilyAssistantDashboardWeb.tsx    # Web dashboard
└── services/
    └── familyAssistantService.ts          # API client (shared)
```

2. **Set API Base URL** (in `.env`):
```env
REACT_APP_API_URL=http://localhost:8000
```

### Basic Usage

```tsx
// In your React component or page
import { FamilyAssistantDashboard } from '../components/FamilyAssistantDashboardWeb';

function Page() {
  const { user } = useAuth(); // Your auth context/hook
  const token = useToken(); // Get auth token

  return (
    <FamilyAssistantDashboard
      userId={user.id}
      token={token}
    />
  );
}

export default Page;
```

### Custom Hook Usage

```tsx
import { useFamilyAssistantWeb } from '../hooks/useFamilyAssistantWeb';

function MyComponent() {
  const userId = getUserIdFromContext();
  const token = getTokenFromContext();

  const {
    familyMembers,
    upcomingAppointments,
    notifications,
    quickBookRide,
    dashboardData,
    loading,
    error,
  } = useFamilyAssistantWeb(userId, token);

  // Your custom implementation
  return (
    // ...
  );
}
```

### Available Hook Methods (Web)

Same as mobile, with additional:

```typescript
// Analytics
getAnalytics(timeRange: 'week' | 'month' | 'year'): Promise<any>
```

---

## Data Models

### FamilyMember
```typescript
{
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string;
  relation: 'parent' | 'child' | 'spouse' | 'sibling' | 'friend';
  date_of_birth?: string;
  emergency_contact?: boolean;
  is_active: boolean;
  calendar_synced: boolean;
  calendar_oauth_token?: string;
  last_sync: string;
}
```

### FamilyAppointment
```typescript
{
  id: string;
  member_id: string;
  title: string;
  description?: string;
  appointment_type: 'medical' | 'education' | 'work' | 'personal';
  start_time: string;
  end_time: string;
  location: string;
  estimated_travel_time_minutes: number;
  priority: 'high' | 'medium' | 'low';
  status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
}
```

### FamilyNotification
```typescript
{
  id: string;
  member_id: string;
  appointment_id: string;
  message: string;
  notification_type: 'appointment_reminder' | 'ride_booked' | 'ride_cancelled' | 'quick_action_available';
  read: boolean;
  quick_action_data?: {
    can_book_ride: boolean;
    suggested_vehicle_type?: string;
    estimated_fare?: number;
  };
}
```

---

## Integration Patterns

### 1. Global State Management (Redux/Zustand)

For larger apps, integrate with Redux:

```typescript
// family-assistant.slice.ts
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { familyAssistantService } from '../services/familyAssistantService';

export const fetchAppointments = createAsyncThunk(
  'familyAssistant/fetchAppointments',
  async (memberId: string) => {
    return familyAssistantService.getAppointments(memberId);
  }
);

const familyAssistantSlice = createSlice({
  name: 'familyAssistant',
  initialState: {
    members: [],
    appointments: [],
    notifications: [],
    loading: false,
    error: null,
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchAppointments.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchAppointments.fulfilled, (state, action) => {
        state.appointments = action.payload;
        state.loading = false;
      })
      .addCase(fetchAppointments.rejected, (state, action) => {
        state.error = action.error.message;
        state.loading = false;
      });
  },
});

export default familyAssistantSlice.reducer;
```

### 2. Real-Time Notifications with WebSocket

```typescript
// Extend the hook to support WebSocket
useEffect(() => {
  const ws = new WebSocket('ws://your-api/family-assistant');
  
  ws.onmessage = (event) => {
    const notification = JSON.parse(event.data);
    setNotifications(prev => [notification, ...prev]);
  };

  return () => ws.close();
}, [userId]);
```

### 3. Calendar Integration

```typescript
// Initialize Google Calendar sync
const handleGoogleCalendarSync = async (memberId: string) => {
  try {
    await initializeCalendarSync(memberId, 'google');
    // Redirect to OAuth flow
    window.open(`${API_BASE_URL}/api/family/members/${memberId}/calendar/google/authorize`);
  } catch (error) {
    console.error('Failed to sync calendar:', error);
  }
};
```

### 4. Polling for Updates

```typescript
// Poll for new appointments every 15 minutes
useEffect(() => {
  const interval = setInterval(() => {
    refreshAppointments();
  }, 15 * 60 * 1000);

  return () => clearInterval(interval);
}, [refreshAppointments]);
```

---

## Common Integration Points

### 1. Connect to Existing Ride Booking
```typescript
// Quick book should trigger existing ride booking flow
const handleQuickBook = async (appointment: FamilyAppointment) => {
  const response = await quickBookRide({
    member_id: appointment.member_id,
    appointment_id: appointment.id,
    vehicle_type: 'economy',
  });

  // Pass to existing ride tracking
  navigateToRideTracking(response.ride_id);
};
```

### 2. Integrate with Notification Service
```typescript
// Use platform-specific notifications
import messaging from '@react-native-firebase/messaging';

useEffect(() => {
  // When Family Assistant notification arrives
  messaging().onMessage(async (message) => {
    if (message.data.type === 'appointment_reminder') {
      // Show local notification
      showLocalNotification({
        title: message.notification?.title,
        body: message.notification?.body,
      });
    }
  });
}, []);
```

### 3. Payment Method Selection
```typescript
const handleQuickBook = async (appointment: FamilyAppointment) => {
  // Get user's saved payment methods
  const paymentMethods = await getPaymentMethods();

  // Use preferred or let user select
  const paymentMethodId = paymentMethods[0]?.id;

  return quickBookRide({
    member_id: appointment.member_id,
    appointment_id: appointment.id,
    payment_method_id: paymentMethodId,
  });
};
```

---

## Error Handling

### Standard Error Responses

All API calls return error in format:
```typescript
{
  message: string;
  code: string;
  details?: any;
}
```

### Error Handling Pattern

```tsx
const { error } = useFamilyAssistant(userId);

useEffect(() => {
  if (error) {
    // Show error toast/alert
    if (error.includes('Unauthorized')) {
      // Handle auth error - refresh token
      refreshAuthToken();
    } else if (error.includes('Network')) {
      // Handle network error - show offline message
      showOfflineMessage();
    } else {
      // Generic error
      showErrorToast(error);
    }
  }
}, [error]);
```

---

## Performance Optimization

### 1. Memoization
```tsx
import { useMemo, useCallback } from 'react';

const upcomingOnly = useMemo(
  () => appointments.filter(a => new Date(a.start_time) > new Date()),
  [appointments]
);

const handleBookRide = useCallback(async (appointmentId) => {
  // Memoized handler
}, [quickBookRide]);
```

### 2. Lazy Loading
```tsx
const [limit, setLimit] = useState(10);

const loadMore = useCallback(() => {
  setLimit(prev => prev + 10);
}, []);

const visibleAppointments = useMemo(
  () => upcomingAppointments.slice(0, limit),
  [upcomingAppointments, limit]
);
```

### 3. Request Deduplication
```typescript
const fetchAPI = useCallback(
  async (endpoint: string, options: RequestInit = {}) => {
    const key = `${endpoint}-${JSON.stringify(options)}`;
    
    // Check cache
    if (requestCache[key]) {
      return requestCache[key];
    }

    const result = await fetch(...);
    requestCache[key] = result;
    
    return result;
  },
  []
);
```

---

## Testing

### Unit Tests (Mobile)

```tsx
import { renderHook, act } from '@testing-library/react-hooks';
import { useFamilyAssistant } from '../hooks/useFamilyAssistant';

test('should fetch family members on mount', async () => {
  const { result } = renderHook(() => useFamilyAssistant('user123'));
  
  await act(async () => {
    // Wait for initial fetch
    await new Promise(r => setTimeout(r, 100));
  });

  expect(result.current.familyMembers.length).toBeGreaterThan(0);
});
```

### Integration Tests (Web)

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { FamilyAssistantDashboard } from '../components/FamilyAssistantDashboardWeb';

test('should render dashboard with appointments', async () => {
  render(<FamilyAssistantDashboard userId="user123" token="token" />);
  
  await waitFor(() => {
    expect(screen.getByText('Upcoming Appointments')).toBeInTheDocument();
  });
});
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| "API Base URL not configured" | Set `REACT_APP_API_URL` in `.env` |
| "Unauthorized" errors | Ensure token is valid and set in hook |
| "Members not loading" | Check API endpoint `/api/family/members/list` |
| "Calendar sync not working" | Verify OAuth credentials configured in backend |
| "Appointments not updating" | Enable polling with `useEffect` + interval |

---

## Next Steps

1. Integrate with existing authentication system
2. Connect to ride booking API endpoints
3. Set up notification service (Firebase, Twilio, etc.)
4. Configure calendar OAuth (Google, Apple, Outlook)
5. Add analytics tracking
6. Implement offline support (AsyncStorage/localStorage)
7. Set up error logging service (Sentry, etc.)

---

## API Endpoint Reference

All endpoints require authentication via Bearer token:

```
POST   /api/family/members/add              - Add family member
GET    /api/family/members/list             - List all members
PUT    /api/family/members/{id}             - Update member
DELETE /api/family/members/{id}             - Remove member

POST   /api/family/appointments/add         - Add appointment
GET    /api/family/appointments/{member_id}- Get member appointments
GET    /api/family/appointments/upcoming    - Get upcoming
POST   /api/family/appointments/{id}/cancel - Cancel appointment

GET    /api/family/notifications            - Get notifications
POST   /api/family/notifications/{id}/read  - Mark as read
POST   /api/family/notifications/mark-all-read - Mark all read

POST   /api/family/quick-actions/book-ride - One-click booking
GET    /api/family/dashboard                - Dashboard data
GET    /api/family/analytics                - Analytics data

POST   /api/family/members/{id}/calendar/initialize - Start sync
POST   /api/family/members/{id}/calendar/sync      - Manual sync
GET    /api/family/members/{id}/calendar/status    - Sync status
```

---

## Support & Documentation

For more details, refer to:
- FAMILY_ASSISTANT_GUIDE.md - Complete feature guide
- FAMILY_ASSISTANT_IMPLEMENTATION.md - Developer integration guide
- Backend API Documentation - Full API specification
