# AutoBuddy Integration Guide

## Architecture Overview

```
App.tsx (Entry Point)
    ↓
AppShell.tsx (Root Provider)
    ├─ AuthProvider (Authentication Context)
    ├─ LocalizationProvider (Multi-language Support)
    └─ RootNavigator (Role-based Navigation)
         ├─ AuthStack (Login/Signup)
         ├─ DriverTabs (Driver screens)
         ├─ PassengerTabs (Passenger screens)
         ├─ OperatorStack (Operator screens)
         └─ AdminStack (Admin screens)
```

## Integration Flow

### 1. App Initialization (App.tsx → AppShell.tsx)
- Initialize all systems (performance, error handling, cache, auth)
- Setup AppState listeners for background/foreground
- Load persisted authentication token
- Initialize API client with token

### 2. Authentication (AuthContext)
- Check for existing auth token in AsyncStorage
- Initialize API client with Bearer token
- Determine user role and route to appropriate screen
- Handle login/logout lifecycle

### 3. Navigation (RootNavigator)
- Route based on authentication status (Auth stack or App stack)
- Route based on user role (Driver, Passenger, Operator, Admin)
- Use NavigationService for programmatic navigation
- Handle deep linking

### 4. Data Flow (Hooks → API Client → Backend)
```
Component
    ↓
Custom Hook (useRideHistory, useWallet, etc.)
    ↓
API Client (apiClient.ts with interceptors)
    ├─ Request Interceptor: Add Bearer token
    ├─ Response Interceptor: Track performance, handle errors
    └─ Error Handler: Log and transform errors
    ↓
Backend API
    ↓
Response ↓
Cache (useCache for memoization)
    ↓
State Update (useState, setState)
    ↓
Component Re-render
```

### 5. Cross-Cutting Concerns

#### Performance Monitoring
- Automatic API call duration tracking
- Rendering performance detection
- Slow threshold detection (>1000ms for API, >16ms for render)
- Periodic stats aggregation

#### Error Handling
- Centralized error codes and messages
- User-friendly error messages
- Automatic retry for rate limits and server errors
- Error logging with severity levels

#### Caching
- Request-level caching with useCache
- TTL-based cache invalidation
- Namespace isolation
- Cache hit/miss statistics

#### Localization
- 9-language support
- Locale-aware formatting (dates, currency, numbers)
- RTL support for Arabic
- AsyncStorage persistence

## Key Integration Points

### 1. Authentication Integration
```typescript
// In AppShell.tsx
const { token, userId, userRole, login, logout } = useAuth();

// In any component
const { login } = useAuth();
await login(token, userId, 'driver');
```

### 2. API Integration
```typescript
// Initialize in setupIntegration.ts
initializeApiClient(token);

// Use in hooks
const response = await axios.post('/endpoint', data, {
  headers: { Authorization: `Bearer ${token}` }
});
```

### 3. Navigation Integration
```typescript
// Programmatic navigation
navigate('DriverDashboard', { rideId: '123' });

// Deep linking
handleDeepLink('autobuddy://RideDetails?rideId=123');
```

### 4. Localization Integration
```typescript
// In any component
const { t, setLanguage, formatCurrency } = useLocalizationContext();

<Text>{t('common.save')}</Text>
<Text>{formatCurrency(100, 'USD')}</Text>
```

### 5. Performance Monitoring Integration
```typescript
// Automatic for API calls via interceptors
// For custom metrics:
const { recordMetric, getStats } = usePerformanceMonitoring(token);
recordMetric('customOperation', duration, success);
```

## System Initialization Sequence

1. **App.tsx loads** → Renders GestureHandlerRootView + AppShell
2. **AppShell initializes**:
   - AuthProvider restores auth from AsyncStorage
   - LocalizationProvider loads saved language
   - initializeAllSystems() runs:
     - setupErrorHandling() - Attach error interceptors
     - setupAuthentication() - Restore token, reinit apiClient
     - setupPerformanceMonitoring() - Attach performance tracking
     - setupCacheManagement() - Initialize cache, run cleanup if needed
     - setupLocalization() - Load language preferences
3. **RootNavigator displays** based on auth state and user role
4. **Screen renders** with hooks accessing context and API

## Data Flow Example: Fetching Ride History

```typescript
// 1. Component mounts
useEffect(() => {
  fetchRideHistory();
}, []);

// 2. Hook called
const { rides, loading, error, fetchRideHistory } = useRideHistory(token, userId);

// 3. Inside useRideHistory hook
const fetchRideHistory = useCallback(async () => {
  try {
    // API call with interceptors
    const response = await axios.get(
      `/rides/${userId}/history`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    // Request interceptor: Records start time
    // Response interceptor: Calculates duration, logs if slow
    
    // Update state
    setRides(response.data);
    
    // Optional: Cache result
    await cache.set(`rides_${userId}`, response.data, CACHE_TTL);
  } catch (err) {
    // Error interceptor handles transformation
    const appError = handleApiError(err);
    setError(appError);
    logError(appError, 'RideHistory');
  }
}, [token, userId]);
```

## Configuration Points

### API Configuration
- Base URL: `process.env.EXPO_PUBLIC_API_URL`
- Timeout: 30 seconds
- Retry attempts: 3
- Retry delay: 1 second (exponential backoff)

### Cache Configuration
- Default TTL: 5 minutes
- Ride data TTL: 1 minute
- User data TTL: 15 minutes
- Analytics TTL: 1 hour

### Performance Thresholds
- Slow API call: >1000ms
- Slow render: >16ms (60fps)
- Slow navigation: >300ms

## Testing Integration

### Unit Test Example
```typescript
test('fetches rides with performance tracking', async () => {
  // Mock axios
  jest.mock('axios');
  
  // Initialize API client
  initializeApiClient(mockToken);
  
  // Call hook
  const { result } = renderHook(() => useRideHistory(mockToken, mockUserId));
  
  // Wait for async
  await waitFor(() => expect(result.current.loading).toBe(false));
  
  // Assert performance was tracked
  expect(recordApiCall).toHaveBeenCalled();
});
```

### Integration Test Example
```typescript
test('full authentication flow', async () => {
  // 1. Start with unauthenticated state
  const { getByText } = render(<App />);
  expect(getByText('Login')).toBeTruthy();
  
  // 2. Login
  fireEvent.press(getByText('Login'));
  
  // 3. Verify token stored and API initialized
  const token = await AsyncStorage.getItem('authToken');
  expect(token).toBeTruthy();
  
  // 4. Verify dashboard rendered
  expect(getByText('Dashboard')).toBeTruthy();
});
```

## Troubleshooting

### API Calls Fail
- Check `initializeApiClient()` called with valid token
- Verify interceptors registered properly
- Check error handling catches exceptions

### Performance Issues
- Use `usePerformanceMonitoring` to identify slow endpoints
- Enable request caching with `useMemoizedRequest`
- Check renderin performance with React DevTools Profiler

### Navigation Problems
- Verify routes defined in RootNavigator
- Check role-based routing logic
- Use NavigationService for consistent navigation

### Localization Not Working
- Verify LocalizationProvider wraps app
- Check language persisted to AsyncStorage
- Verify translation keys exist in useLocalization hook

## Production Checklist

- [ ] All environment variables configured
- [ ] API base URL set to production endpoint
- [ ] Error logging integrated (Sentry/Bugsnag)
- [ ] Performance monitoring active
- [ ] Cache cleanup scheduled
- [ ] Token refresh configured
- [ ] Security headers verified
- [ ] Rate limiting tested
- [ ] Offline mode handled (if needed)
- [ ] Deep linking tested

## Support & Debugging

### Enable Debug Logging
```typescript
if (__DEV__) {
  console.log('[Integration] Debug mode enabled');
}
```

### Check Integration Status
```typescript
import { getIntegrationStatus } from './utils/setupIntegration';
const status = await getIntegrationStatus();
console.log(status);
```

### System Health Check
```typescript
import { checkSystemHealth } from './utils/setupIntegration';
const health = await checkSystemHealth();
console.log(health);
```

---

**AutoBuddy is now fully integrated and ready for deployment!**
