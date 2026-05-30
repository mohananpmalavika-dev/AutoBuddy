# ✅ QUICK FIX GUIDE - API CLIENT METHODS

**Priority:** CRITICAL (Blocks Phase 1)  
**Time Estimate:** 1-2 hours  
**Status:** ACTION REQUIRED

---

## 🎯 WHAT NEEDS TO BE FIXED

The three updated screens use API methods that don't exist in `apiClient.ts`. These must be added BEFORE testing can proceed.

---

## 🔧 FIX 1: ADD MISSING BOOKING API METHODS

**File:** `autobuddy-mobile/src/services/apiClient.ts`

**Add after line 81 (in bookingAPI object):**

```typescript
export const bookingAPI = {
  // ... existing methods ...
  
  // MISSING - ADD THESE:
  
  // Estimate fare for a route
  estimateFare: (data: any) =>
    axiosInstance.post('/api/bookings/estimate-fare', data),

  // Get saved places for user
  getSavedPlaces: () =>
    axiosInstance.get('/api/users/saved-places'),

  // Add saved place
  addSavedPlace: (place: any) =>
    axiosInstance.post('/api/users/saved-places', place),

  // Create booking (already exists as createBooking)
  // createBooking: (data: any) =>
  //   axiosInstance.post('/api/bookings', data),
};
```

---

## 🔧 FIX 2: ADD MISSING DRIVER API METHODS

**File:** `autobuddy-mobile/src/services/apiClient.ts`

**Add after line 115 (in driverAPI object - replace current implementation):**

```typescript
export const driverAPI = {
  // CURRENT IMPLEMENTATION (KEEP):
  setAvailability: (driverId: string, status: 'online' | 'offline', location?: any) =>
    axiosInstance.put(`/api/drivers/${driverId}/availability`, {
      availability_status: status,
      location,
    }),

  getAvailability: (driverId: string) =>
    axiosInstance.get(`/api/drivers/${driverId}/availability`),

  // MISSING - ADD THESE:

  // Update driver availability (for new pattern)
  updateAvailability: (data: any) =>
    axiosInstance.put('/api/drivers/availability', data),

  // Update driver location (for continuous tracking)
  updateLocation: (data: any) =>
    axiosInstance.post('/api/drivers/location', data),

  // Get driver profile
  getProfile: () =>
    axiosInstance.get('/api/drivers/profile'),

  // Get nearby drivers
  getNearbyDrivers: (latitude: number, longitude: number, radius_km?: number) =>
    axiosInstance.get(
      `/api/drivers/available/list?latitude=${latitude}&longitude=${longitude}&radius_km=${radius_km || 5}`
    ),

  // Start shift
  startShift: (driverId: string) =>
    axiosInstance.post(`/api/drivers/${driverId}/shift-start`, {}),

  // End shift
  endShift: (driverId: string) =>
    axiosInstance.post(`/api/drivers/${driverId}/shift-end`, {}),
};
```

---

## 🔧 FIX 3: ADD MISSING ADMIN API METHODS

**File:** `autobuddy-mobile/src/services/apiClient.ts`

**Replace entire adminAPI section (starting around line 424):**

```typescript
export const adminAPI = {
  // Analytics
  getDashboard: () =>
    axiosInstance.get('/api/admin/dashboard'),

  getDashboardAnalytics: (range?: string) =>
    axiosInstance.get(`/api/admin/analytics/dashboard?range=${range || 'week'}`),

  getRideAnalytics: (filters?: any) =>
    axiosInstance.get('/api/admin/analytics/rides', { params: filters }),

  getDriverAnalytics: (filters?: any) =>
    axiosInstance.get('/api/admin/analytics/drivers', { params: filters }),

  getRevenueAnalytics: (range?: string) =>
    axiosInstance.get(`/api/admin/analytics/revenue?range=${range || 'week'}`),

  // KYC Management
  getKycPending: () =>
    axiosInstance.get('/api/admin/kyc/pending'),

  getPassengerKycPending: () =>
    axiosInstance.get('/api/admin/passengers/kyc/pending'),

  // Pricing & Configuration
  getPricingRules: () =>
    axiosInstance.get('/api/pricing/rules'),

  getRegistrationFeeConfig: () =>
    axiosInstance.get('/api/admin/registration-fees/config'),

  // Payment Management
  getPendingRegistrations: () =>
    axiosInstance.get('/api/admin/registration-payments/pending'),

  getPendingWalletTopups: () =>
    axiosInstance.get('/api/admin/wallet/topups/pending'),

  // Subscriptions
  getSubscriptionConfig: () =>
    axiosInstance.get('/api/subscriptions/config'),

  getPendingSubscriptions: () =>
    axiosInstance.get('/api/admin/subscriptions/pending'),

  getPendingSubscriptionPayments: () =>
    axiosInstance.get('/api/admin/subscriptions/payments/pending'),

  // User Requests
  getPendingPhoneChanges: () =>
    axiosInstance.get('/api/admin/phone-changes/pending'),

  getPendingAccountDeletions: () =>
    axiosInstance.get('/api/admin/account-deletions/pending'),

  // Driver Fare Management
  getPendingDriverFareRequests: () =>
    axiosInstance.get('/api/admin/driver-fare-calculator/pending'),

  getApprovedDriverFareConfigs: () =>
    axiosInstance.get('/api/admin/driver-fare-calculator/approved'),

  // Trip Management
  getOngoingTrips: () =>
    axiosInstance.get('/api/admin/bookings/ongoing'),

  getUsersLiveStatus: () =>
    axiosInstance.get('/api/admin/users/live-status'),

  // Launch Tracking
  getLaunchVisitReport: (options?: any) =>
    axiosInstance.get('/api/admin/launch-visits/report', { params: options }),

  // Gamification
  getSpinWinConfig: () =>
    axiosInstance.get('/api/admin/spin-win/config'),

  getSpinWinWinners: (options?: any) =>
    axiosInstance.get('/api/admin/spin-win/winners', { params: options }),

  // Ride Products
  getRideProductsDistrictConfig: () =>
    axiosInstance.get('/api/admin/ride-products/district-config'),

  // User Management
  searchUsers: (query: string, userType?: string) =>
    axiosInstance.get('/api/admin/users/search', { params: { q: query, user_type: userType } }),

  blockUser: (userId: string) =>
    axiosInstance.put(`/api/admin/users/${userId}/block`, {}),

  unblockUser: (userId: string) =>
    axiosInstance.put(`/api/admin/users/${userId}/unblock`, {}),
};
```

---

## 🔧 FIX 4: UPDATE SCREEN CODE REFERENCES

The screens reference methods that now exist. Verify these calls match:

### BookingDetailsScreen.js

```typescript
// ✅ Already updated in code:
const places = await bookingAPI.getSavedPlaces();
const fareData = await bookingAPI.estimateFare(fareRequest);
const bookingResponse = await bookingAPI.createBooking(bookingData);
```

### DriverDashboard.native.js

```typescript
// ✅ Already updated in code:
await driverAPI.updateLocation(locationToSend);
const updated = await driverAPI.updateAvailability({is_available: !!pending.desired});
const profile = await driverAPI.getProfile();
```

### AdminDashboard.js

```typescript
// ✅ Already updated in code:
const dashboard = await adminAPI.getDashboard();
const pending = await adminAPI.getKycPending();
const pricingSettings = await adminAPI.getPricingRules();
// ... etc for all methods
```

---

## ✅ VERIFICATION CHECKLIST

After adding these methods:

- [ ] No TypeScript compilation errors in `apiClient.ts`
- [ ] All screen imports still work
- [ ] API methods have correct signatures
- [ ] Axios instance properly configured
- [ ] Auth token injection working

---

## 🚀 NEXT STEPS

1. **Add the methods above** to `apiClient.ts`
2. **Verify no compilation errors** - Check terminal for TypeScript errors
3. **Run backend server** - `cd backend && python server.py`
4. **Test one API call** - Manual test of one endpoint
5. **Then proceed to Phase 2** - E2E and load testing

---

## ⏱️ TIME BREAKDOWN

| Task | Time |
|------|------|
| Add bookingAPI methods | 10 min |
| Add driverAPI methods | 15 min |
| Add adminAPI methods | 20 min |
| Verify compilation | 5 min |
| Test locally | 10 min |
| **Total** | **1 hour** |

---

**Status After Fixes:** Ready for Phase 1 Testing ✅
