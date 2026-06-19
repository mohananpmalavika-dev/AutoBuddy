# Complete AutoBuddy Integration Guide - All 4 Flows

**Status**: Ready for Implementation  
**Date**: June 19, 2026

---

## 📱 App Architecture

### Authentication Flow
```
LoginScreen / SignupScreen
    ↓
    ├─→ role === 'passenger' → PassengerOnboarding → PassengerDashboard
    ├─→ role === 'driver' → DriverDashboard
    ├─→ role === 'operator' → OperatorDashboard
    └─→ role === 'admin' → AdminDashboard
```

### File Structure
```
autobuddy-mobile/src/
├── App.tsx                          # Root app with role-based routing
├── screens/
│   ├── auth/
│   │   ├── LoginScreen.tsx
│   │   └── SignupScreen.tsx
│   ├── PassengerDashboard.tsx       # Passenger main screen
│   ├── DriverDashboardSimplified.tsx # Driver main screen
│   ├── OperatorDashboard.tsx        # Operator main screen
│   └── AdminDashboard.tsx           # Admin main screen
├── components/                      # Shared UI components
├── hooks/                          # Shared logic hooks
└── lib/
    └── api-client.ts               # All API calls for 4 flows
```

---

## 🔐 Authentication Setup

### 1. Login Screen
```typescript
import LoginScreen from './screens/auth/LoginScreen';

// User selects role (Passenger/Driver/Operator/Admin)
// Enters phone + password
// API: POST /auth/login
// Response: { token, user: { id, name, role, ... } }
```

### 2. Signup Screen  
```typescript
import SignupScreen from './screens/auth/SignupScreen';

// Step 1: Select role, enter phone/name/email
// Step 2: Enter password (validation, confirmation)
// API: POST /auth/signup
// Response: { token, user: { id, name, role, ... } }
```

### 3. Session Management
```typescript
// Store token securely
await SecureStore.setItemAsync('auth_token', response.token);
setSession(response);

// On logout
await SecureStore.deleteItemAsync('auth_token');
setSession(null);
```

---

## 👥 Role-Based Navigation

### Passenger Flow
```
LoginScreen
    ↓
PassengerOnboarding (4-step: Phone → Name → Email → Payment)
    ↓
PassengerDashboard (4 tabs)
├── Home: Booking interface
├── Active: Live tracking
├── History: Ride history
└── Profile: Account & payment methods
```

### Driver Flow
```
LoginScreen
    ↓
DriverDashboard (4 tabs)
├── Map: Ride requests
├── Rides: Today's rides
├── Earnings: Real-time earnings + documents
└── Profile: Account & vehicle info
```

### Operator Flow
```
LoginScreen
    ↓
OperatorDashboard
├── Live Stats: Online drivers, active rides, ratings
├── Revenue: Earnings breakdown with profit
├── Alerts: Multi-severity system alerts
├── Top Performers: Leaderboard
└── Quick Actions: Fleet map, add driver, reports, settings
```

### Admin Flow
```
LoginScreen
    ↓
AdminDashboard
├── Time Filter: 24h / 7d / 30d
├── System Health: API, DB, Cache, Payment Gateway
├── Key Metrics: Active users, revenue, rides, rating
├── Alerts: Critical and high priority system alerts
├── Statistics: New drivers, tickets, compliance
└── Management: Users, drivers, payments, compliance, reports
```

---

## 📡 API Integration

### Base URL
```typescript
// Set in .env
REACT_APP_API_URL=http://localhost:8000/api
```

### Authentication Header
```typescript
// All authenticated requests include:
Authorization: Bearer {token}
```

### API Categories

#### Authentication (All Roles)
```
POST /auth/login          → Login
POST /auth/signup         → Register
POST /auth/verify-otp     → Verify OTP
POST /auth/logout         → Logout
POST /auth/refresh        → Refresh token
```

#### Passenger APIs
```
GET  /passengers/me/profile
POST /passengers/rides/book
GET  /passengers/rides/{bookingId}/tracking
POST /passengers/rides/{bookingId}/cancel
GET  /passengers/me/ride-history
POST /passengers/rides/schedule
POST /passengers/rides/estimate-fare
GET  /passengers/me/payment-methods
```

#### Driver APIs
```
GET  /drivers/me/profile
GET  /drivers/me/earnings
GET  /drivers/me/documents
PUT  /rides/{rideId}/accept
PUT  /rides/{rideId}/decline
PUT  /drivers/me/online-status
GET  /drivers/me/alerts/unread
GET  /drivers/me/rides
```

#### Operator APIs
```
GET  /operators/me/fleet-stats
GET  /operators/me/drivers/metrics
GET  /operators/me/drivers/locations
GET  /operators/me/alerts
POST /operators/me/alerts/{alertId}/dismiss
PUT  /operators/me/drivers/{driverId}/incentive
GET  /operators/me/reports
POST /operators/me/reports/generate
```

#### Admin APIs
```
GET  /admin/metrics
GET  /admin/system/health
GET  /admin/alerts
POST /admin/alerts/{alertId}/resolve
GET  /admin/compliance/status
GET  /admin/system/config
PUT  /admin/system/config
POST /admin/users/{userId}/suspend
POST /admin/users/{userId}/ban
POST /admin/rides/{rideId}/refund
POST /admin/reports/generate
GET  /admin/reports/{reportId}/download
```

---

## 🔄 Real-Time Data Updates

### Refresh Intervals
- **Passenger Tracking**: 5 seconds (live ride)
- **Driver Earnings**: 30 seconds
- **Operator Fleet Stats**: 30 seconds
- **Admin System Health**: 30 seconds
- **Alerts**: 60 seconds

### WebSocket Ready
All hooks support real-time updates. Replace interval polling with:
```typescript
useEffect(() => {
  const socket = io(API_BASE_URL);
  socket.on('driver-locations', (data) => setLocations(data));
  return () => socket.disconnect();
}, []);
```

---

## 💾 Data Persistence

### Session Storage
```typescript
// Secure storage for token (iOS/Android)
import * as SecureStore from 'expo-secure-store';

// On login
await SecureStore.setItemAsync('auth_token', token);

// On app startup
const token = await SecureStore.getItemAsync('auth_token');
```

### Local State
- Use Redux, Zustand, or Context for app state
- Persist critical data (saved locations, preferences)
- Clear on logout

---

## 🧪 Development Workflow

### 1. Setup Environment
```bash
npm install
npm install axios react-navigation react-native-safe-area-context
# Configure .env with API_BASE_URL
```

### 2. Test Login
```typescript
// Use demo credentials
Phone: 9876543210
Password: demo123
```

### 3. Test Each Role
- **Passenger**: Book a ride, track driver, view history
- **Driver**: Accept rides, toggle online, view earnings
- **Operator**: Monitor fleet, check driver metrics
- **Admin**: View system health, manage alerts

### 4. Integration Testing
```bash
npm test                    # Unit tests
npm run test:integration   # Integration tests
npm run build              # Production build
```

---

## 📊 Error Handling

### Common Errors
```typescript
// 401 - Auth failed
if (error.status === 401) {
  // Try to refresh token
  // If refresh fails, redirect to login
}

// 400 - Validation error
if (error.status === 400) {
  Alert.alert('Invalid Input', error.message);
}

// 500 - Server error
if (error.status === 500) {
  Alert.alert('Server Error', 'Please try again later');
}
```

### Retry Logic
```typescript
// Auto-retry failed requests (optional)
const maxRetries = 3;
const retryDelay = 1000; // 1 second
```

---

## 🔒 Security Checklist

- ✅ All API calls use HTTPS
- ✅ Tokens stored securely (SecureStore)
- ✅ Passwords never logged
- ✅ Tokens auto-refresh before expiry
- ✅ Clear session on logout
- ✅ Input validation before sending
- ✅ CORS headers configured
- ✅ Rate limiting on API endpoints

---

## 📱 Testing Credentials

```
Role: Passenger
Phone: 9876543210
Password: demo123

Role: Driver
Phone: 9876543211
Password: demo123

Role: Operator
Phone: 9876543212
Password: demo123

Role: Admin
Phone: 9876543213
Password: demo123
```

---

## 🚀 Deployment Checklist

- [ ] Environment variables configured (.env)
- [ ] API endpoints tested and verified
- [ ] Authentication flow working for all roles
- [ ] Real-time updates tested
- [ ] Error handling in place
- [ ] Performance optimized (load time < 2s)
- [ ] Security review completed
- [ ] Unit tests passing
- [ ] Integration tests passing
- [ ] QA sign-off received
- [ ] Beta release (10% traffic)
- [ ] Full production release

---

## 📞 Support

For integration issues:
1. Check API endpoint in api-client.ts
2. Verify request/response format
3. Check error messages
4. Review backend logs
5. Contact: support@auto-buddy.in

---

*Integration Guide for All 4 Flows*  
*Created: June 19, 2026*
