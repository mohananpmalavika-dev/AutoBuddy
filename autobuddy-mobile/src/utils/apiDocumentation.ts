export const API_DOCUMENTATION = `
# AutoBuddy API Contracts & Hook Usage Guide

## Architecture Overview

AutoBuddy uses a modular architecture with:
- **Custom React Hooks** for state management and API integration
- **Material Design UI** components with TypeScript
- **REST API** backend with Bearer token authentication
- **AsyncStorage** for local caching and persistence
- **Context API** for global state (Localization, Theme)

---

## Authentication

### Bearer Token Pattern
All API requests use Bearer token authentication:

\`\`\`typescript
headers: {
  Authorization: \`Bearer \${token}\`,
  'Content-Type': 'application/json'
}
\`\`\`

---

## Core Hooks Reference

### User Management
- **useAuth**: Authentication, login, logout, session management
- **useUserProfile**: User data fetching, profile updates
- **useRoleAccess**: Role-based permission checking

### Ride Management
- **useRideHistory**: Ride history, filtering, search
- **useRideReceipts**: Receipt generation, tax documents
- **useRidePooling**: Ride pooling, passenger management

### Financial
- **useWallet**: Wallet balance, transactions, topup
- **useExpenseTracking**: Expense tracking, categorization
- **useReferralSystem**: Referral codes, rewards, statistics
- **usePaymentMethods**: Payment method management

### Driver Features
- **useVehicleManagement**: Vehicle CRUD, document tracking
- **useRouteOptimization**: Route planning, optimization
- **useIncentivesTracking**: Active incentives, claims
- **useComplianceTracking**: Compliance scoring, alerts

### Analytics & Reporting
- **useAdvancedAnalytics**: Report generation, metrics
- **useDriverPerformanceInsights**: Performance analytics
- **usePerformanceMonitoring**: App performance tracking

### Support & Communication
- **useCustomerSupport**: Support tickets, FAQ, messaging
- **useVideoCall**: Video calling, recording, history

### Accessibility & Localization
- **useAccessibilityFeatures**: A11y settings with presets
- **useLocalization**: 9-language support, date/currency formatting

### Utilities
- **useCache**: Caching with TTL, statistics
- **usePerformanceMonitoring**: API and rendering performance
- **useMemoizedRequest**: Cached API requests

---

## API Endpoint Patterns

### Authentication
- POST /auth/login - User login
- POST /auth/logout - User logout
- POST /auth/refresh - Token refresh

### Rides
- GET /rides/{userId}/history - Ride history
- POST /rides/{rideId}/complete - Complete ride
- GET /rides/{rideId}/details - Ride details

### Receipts & Taxes
- GET /receipts/{receiptId}/download - Download receipt
- POST /receipts/generate - Generate receipt
- GET /tax/summary/{userId} - Tax summary
- POST /tax/report - Generate tax report

### Expenses
- GET /expenses/{userId} - Get expenses
- POST /expenses - Add expense
- PATCH /expenses/{expenseId}/categorize - Categorize

### Referrals
- GET /referrals/{userId}/codes - Referral codes
- POST /referrals/codes/create - Create code
- GET /referrals/{userId}/rewards - Rewards
- POST /referrals/apply - Apply code

### Analytics
- GET /analytics/reports/{userId} - Get reports
- POST /analytics/reports/generate - Generate report
- GET /analytics/metrics - Get metrics

### Video Calls
- POST /calls/initiate - Start call
- POST /calls/{callId}/answer - Answer call
- POST /calls/{callId}/end - End call
- GET /calls/history/{userId} - Call history

### Performance
- POST /performance/report - Report metrics
- GET /performance/stats - Get stats

---

## Hook Usage Examples

### Fetching Data with Caching
\`\`\`typescript
const { data, loading, error, refetch } = useMemoizedRequest(
  () => axios.get('/api/rides'),
  'rides_list',
  5 * 60 * 1000 // 5 minute TTL
);
\`\`\`

### Performance Monitoring
\`\`\`typescript
const { recordApiCall, getStats } = usePerformanceMonitoring(token);

// Record API call
recordApiCall('/api/rides', 250, 200);

// Get performance stats
const stats = getStats();
console.log(\`Success rate: \${stats.successRate}%\`);
\`\`\`

### Localization
\`\`\`typescript
const { t, setLanguage, formatCurrency, getDirection } = useLocalization('en');

// Translate UI strings
<Text>{t('common.save')}</Text>

// Format currency
<Text>{formatCurrency(100, 'USD')}</Text>

// Get text direction for RTL languages
<View style={{ direction: getDirection() }}>
\`\`\`

### Error Handling
\`\`\`typescript
const error = createError(
  ErrorCode.VALIDATION_ERROR,
  'Invalid input',
  { field: 'email', message: 'Invalid email format' }
);

if (isRetryableError(error)) {
  // Retry the operation
}

logError(error, 'UserRegistration');
\`\`\`

---

## Response Format

### Success Response
\`\`\`json
{
  "status": "success",
  "data": { ... },
  "timestamp": "2025-06-20T10:30:00Z"
}
\`\`\`

### Error Response
\`\`\`json
{
  "status": "error",
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "details": {
    "field": "email",
    "error": "Invalid email format"
  },
  "timestamp": "2025-06-20T10:30:00Z"
}
\`\`\`

---

## Type Safety

All hooks use TypeScript interfaces:

\`\`\`typescript
interface RideHistory {
  id: string;
  userId: string;
  pickupLocation: string;
  dropoffLocation: string;
  totalAmount: number;
  date: Date;
  status: 'completed' | 'cancelled' | 'pending';
}
\`\`\`

---

## Testing Integration

### API Mocking
\`\`\`typescript
import axios from 'axios';
jest.mock('axios');

test('fetches ride history', async () => {
  const mockData = [{ id: '1', totalAmount: 50 }];
  axios.get.mockResolvedValue({ data: mockData });

  const { result } = renderHook(() => useRideHistory(token, userId));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.rides).toEqual(mockData);
});
\`\`\`

---

## Performance Guidelines

1. **Use useCache for repeated requests**: Cache frequently accessed data
2. **Monitor with usePerformanceMonitoring**: Track slow endpoints
3. **Implement pagination**: Fetch large datasets in chunks
4. **Debounce rapid updates**: Prevent unnecessary API calls
5. **Use image optimization**: Compress and resize images

---

## Security Best Practices

1. **Token Storage**: Use AsyncStorage with encryption
2. **HTTPS Only**: All API calls must use HTTPS in production
3. **Input Validation**: Validate all user inputs before sending
4. **Error Messages**: Don't expose sensitive information in errors
5. **Token Refresh**: Implement automatic token refresh on expiry

---

## Deployment Checklist

- [ ] All environment variables configured
- [ ] API endpoints updated for production
- [ ] Logging and monitoring enabled
- [ ] Error tracking integration (Sentry/Bugsnag)
- [ ] Performance monitoring active
- [ ] Security headers configured
- [ ] API rate limiting enabled
- [ ] Database backups scheduled

---

## Support & Debugging

### Enable Debug Logging
\`\`\`typescript
// Set in development environment
if (__DEV__) {
  LogBox.ignoreLogs(['Non-serializable values']);
}
\`\`\`

### Monitor Network Requests
Use React DevTools Network tab or Charles Proxy to inspect API calls

### Performance Profiling
Use React Native Debugger to profile component rendering and memory usage
`;

export const getApiDocumentation = (): string => {
  return API_DOCUMENTATION;
};

export const hookCategories = {
  authentication: ['useAuth', 'useUserProfile'],
  rides: ['useRideHistory', 'useRideReceipts', 'useRidePooling'],
  financial: ['useWallet', 'useExpenseTracking', 'useReferralSystem'],
  driver: ['useVehicleManagement', 'useRouteOptimization', 'useIncentivesTracking'],
  analytics: ['useAdvancedAnalytics', 'useDriverPerformanceInsights'],
  support: ['useCustomerSupport', 'useVideoCall'],
  accessibility: ['useAccessibilityFeatures', 'useLocalization'],
  utilities: ['useCache', 'usePerformanceMonitoring'],
};

export const apiEndpoints = {
  auth: {
    login: 'POST /auth/login',
    logout: 'POST /auth/logout',
    refresh: 'POST /auth/refresh',
  },
  rides: {
    history: 'GET /rides/{userId}/history',
    complete: 'POST /rides/{rideId}/complete',
    details: 'GET /rides/{rideId}/details',
  },
  receipts: {
    download: 'GET /receipts/{receiptId}/download',
    generate: 'POST /receipts/generate',
    taxSummary: 'GET /tax/summary/{userId}',
  },
  expenses: {
    list: 'GET /expenses/{userId}',
    create: 'POST /expenses',
    update: 'PUT /expenses/{expenseId}',
  },
  referrals: {
    codes: 'GET /referrals/{userId}/codes',
    createCode: 'POST /referrals/codes/create',
    rewards: 'GET /referrals/{userId}/rewards',
  },
  calls: {
    initiate: 'POST /calls/initiate',
    answer: 'POST /calls/{callId}/answer',
    end: 'POST /calls/{callId}/end',
    history: 'GET /calls/history/{userId}',
  },
};
