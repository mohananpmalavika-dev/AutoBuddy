# 🔍 Passenger Menu Audit Report
**Date:** May 27, 2026  
**Scope:** PassengerMap.web.js + PassengerMap.native.js + PassengerProfile.web.js + components  
**Status:** Comprehensive feature review (what's implemented vs. missing vs. broken)

---

## 📊 Current Menu Structure

```
Passenger Dashboard has 6 menus:
├─ Ride (Primary - shown on dashboard)
├─ Drivers (Secondary)
├─ Safety (Secondary)
├─ Wallet (Secondary)
├─ Spin (Secondary)
└─ History (Secondary)

Plus: Profile (separate, not in menu system)
```

---

## ✅ IMPLEMENTED FEATURES

### 1️⃣ **Ride Booking Menu**
| Feature | Status | Tech Details |
|---------|--------|--------------|
| **Pickup location search** | ✅ | VoiceTextInput + Places API (reverse geocoding) |
| **Dropoff location search** | ✅ | VoiceTextInput + Places API |
| **Use current location** | ✅ | Geolocation API with fallback |
| **Ride type selector** | ✅ | RideProductsGrid (normal, airport, corporate, intercity, tourism, rental_hourly, school_elderly_safe, scheduled) |
| **Inline driver preview (max 5)** | ✅ | PHASE 1 FIX - 71% reduction in taps |
| **Fare calculator** | ✅ | estimateDriverFare() with surge, multipliers, surcharges |
| **Passenger count** | ✅ | Voice/text input, default 1 |
| **Scheduled booking** | ✅ | datetime-local picker |
| **Corporate code** | ✅ | Conditional display + warning highlighting |
| **Airport fields** | ✅ | Terminal + Flight number with warning styling |
| **Intercity return trip toggle** | ✅ | Only shown for intercity ride type |
| **Tourism package selection** | ✅ | Text input for package type |
| **Rental hours** | ✅ | Number input (default 4 hours) |
| **Safe ride priority** | ✅ | School vs Elderly toggle for safe ride type |
| **Active booking display** | ✅ | Shows status, driver, locations, live ETA, OTP (copy to clipboard) |
| **OTP sharing** | ✅ | Start OTP + End OTP, copy button |
| **Booking cancellation** | ✅ | Conditional (disabled after driver accepted) |
| **Ride progress timeline** | ✅ | RideProgressTimeline component |
| **In-ride messaging** | ✅ | RideCommunicationCard |
| **Booking confirmation** | ✅ | BookingConfirmationCard with 5s auto-dismiss |
| **Refresh button** | ✅ | Manual refresh of dashboard data |

### 2️⃣ **Drivers Menu**
| Feature | Status | Tech Details |
|---------|--------|--------------|
| **Fare estimate display** | ✅ | Shows total, distance, surge multiplier |
| **Max fare expectation filter** | ✅ | Text input to filter drivers |
| **Driver list (nearby)** | ✅ | Distance, rating, projected fare, pickup surcharge |
| **Driver selection/deselection** | ✅ | Toggle select state |
| **Mark as favorite** | ✅ | toggleFavoriteDriver() API call |
| **Unblock drivers** | ✅ | toggleBlockedDriver() API call |
| **Opt-out driver (temp hide)** | ✅ | optOutDriver() - hides for current session |
| **Reset opt-outs** | ✅ | Clear all temporary driver hides |
| **Blocked drivers section** | ✅ | Shows list of permanently blocked drivers (max 8) |
| **No nearby drivers message** | ✅ | Graceful empty state |

### 3️⃣ **Safety Menu**
| Feature | Status | Tech Details |
|---------|--------|--------------|
| **KeralaSafetyCard integration** | ✅ | useKeralaSafety hook |
| **SOS trigger capability** | ✅ | triggerSos() in safety service |
| **Emergency numbers** | ✅ | Police 112, Women 181, Ambulance 108 |
| **Trusted contacts** | ✅ | addTrustedContact, deleteTrustedContact |
| **Send family location** | ✅ | sendFamilyLocation() function |
| **Safety mode toggle** | ✅ | updateSafetyMode() |
| **Safety score display** | ✅ | getMySafetyScore() |
| **Audio recording metadata** | ✅ | saveAudioRecordingMetadata() for ride recording |

### 4️⃣ **Wallet Menu**
| Feature | Status | Tech Details |
|---------|--------|--------------|
| **Revenue card display** | ✅ | RevenueCard component |
| **Appears as "wallet" label** | ✅ | Menu shows wallet icon/label |

### 5️⃣ **Spin & Win Menu**
| Feature | Status | Tech Details |
|---------|--------|--------------|
| **Spin eligibility check** | ✅ | spinWinStatus.eligible |
| **Daily spin limit display** | ✅ | Shows: total limit, used today, left today |
| **Campaign dates** | ✅ | Shows starts_at and ends_at |
| **Latest reward display** | ✅ | Shows prize_label and reward_type |
| **Spin button** | ✅ | spinNow() - disabled if ineligible or no spins left |
| **Refresh button** | ✅ | refreshSpinWinStatus() with silent/verbose modes |
| **Loading states** | ✅ | spinWinLoading and spinningNow flags |

### 6️⃣ **History Menu**
| Feature | Status | Tech Details |
|---------|--------|--------------|
| **Past rides list** | ✅ | Paginated (max 20 rides displayed) |
| **Ride status badge** | ✅ | Color-coded (completed=green, cancelled=red, other=blue) |
| **Booking ID** | ✅ | First 8 characters displayed |
| **Driver name** | ✅ | Shows driver or "not assigned" if null |
| **Fare amount** | ✅ | Estimated fare display |
| **Route summary** | ⚠️ | Shows pickup → dropoff but may truncate on small screens |
| **Refresh button** | ✅ | refreshPassengerBookings({ silent: false }) |
| **Empty state** | ✅ | PremiumEmptyState component |

### 7️⃣ **Profile (Separate Screen)**
| Feature | Status | Tech Details |
|---------|--------|--------------|
| **Account info display** | ✅ | Name, email, phone (read-only) |
| **Password change** | ✅ | Current + new password with confirmation |
| **Phone number change** | ✅ | OTP verification with 10-digit validation |
| **Admin phone verification** | ✅ | Request admin approval if OTP fails |
| **Referral code** | ✅ | Display + share button |
| **Subscription info** | ✅ | Plan type, amount, outstanding balance |
| **Subscription plans** | ✅ | Monthly, quarterly, annual, per-trip options |
| **Payment methods** | ✅ | Display available payment options |
| **Payment history** | ✅ | Track past payments with UTR/ref numbers |
| **Admin verification status** | ⚠️ | Shows warning if payment pending verification |

---

## ❌ MISSING / NOT IMPLEMENTED FEATURES

### Critical Gaps
1. **⚠️ No Ratings/Reviews in menu**
   - Can give rating to drivers but no driver rating display
   - No passenger ratings visible to drivers
   - No way to view/manage your own ratings

2. **⚠️ No Help/Support Center**
   - No FAQ or help documentation in-app
   - No contact support option
   - No ticket/complaint system visible in menu
   - Users would have to contact via external means

3. **⚠️ No Preferences/Settings submenu**
   - No language preference toggle (exists in code but not in menu)
   - No notification preferences
   - No privacy settings
   - No trip preferences (preferred drivers, vehicle types, etc.)

4. **⚠️ No Promotions/Offers visibility**
   - No coupon/promo code display
   - No active deals or discounts section
   - Spin & Win is gamification, but no general promotions

5. **⚠️ No SOS Quick Button on main dashboard**
   - Emergency features exist in Safety menu but require navigation
   - Should be accessible from any screen (floating button)
   - No quick dial-to-emergency option

6. **⚠️ No Payment Method Management**
   - Payment method is hardcoded to 'cash'
   - No wallet balance display
   - No linked cards/UPI management
   - No add/remove payment methods

### Feature-Wise Issues

| Feature | Gap | Impact |
|---------|-----|--------|
| **Driver ratings** | Not visible before booking | Can't make informed driver choice |
| **Your own rating** | Hidden | No feedback on passenger behavior |
| **Support system** | Nonexistent | Users stuck if issue occurs |
| **Settings menu** | Missing | No personalization |
| **Promotions** | Not visible | Users unaware of discounts |
| **Quick SOS** | Hidden in submenu | Life-threatening delay in emergency |
| **Payment methods** | Cash-only | Limited flexibility |
| **Notifications** | No preferences | Users get all or nothing |
| **Language switching** | State exists but UI hidden | Non-English users stuck |
| **Trip preferences** | Not available | No ride customization |

---

## 🔧 TECHNICAL ISSUES / CONCERNS

### 1. **State Duplication**
- Both `isOnline` and `serverIsOnline` in driver but only one properly used ✅ FIXED
- Multiple refresh cycles polling same endpoints

### 2. **Menu Navigation Pattern is Outdated**
- **Current:** "Other Menus" dropdown with 5 secondary items + primary
- **Better:** Tab-based navigation (like driver dashboard Phase 3A)
- **Impact:** Deep nesting + 2-3 taps to reach features

### 3. **Locale/Language System**
- `languageCode` state exists and switches locales
- BUT no UI toggle visible in menu to change language
- Users can't discover language feature

### 4. **API Call Optimization Needed**
- Multiple parallel calls in useEffect: `/bookings`, `/drivers`, `/fare`, `/favorites`, `/blocked`
- Polling at multiple intervals (ride updates, availability, spin status)
- Could batch/deduplicate

### 5. **Component Organization**
- 1350+ lines in PassengerMap.web.js (too large)
- Each menu section could be extracted to component
- Similar to DriverDashboard refactoring (Phase 3A)

### 6. **Missing Error Boundaries**
- No granular error handling per menu
- Single top-level error message
- Menu switches often fail silently

### 7. **Web-Only Features**
- Some features are in `.web.js` but not in `.native.js`
- Incomplete platform parity:
  - LocationSearchModal exists in web but not used
  - InteractiveMap component exists but web only removes it

---

## 🚨 BROKEN/EDGE-CASE BEHAVIORS

### 1. **Route Truncation in History**
```
"Pickup Landmark, Area" → "Drop Landmark, Area"
// On small screens, entire route gets cut off (numberOfLines={1})
```
→ **Fix:** Use ellipsis or expandable row

### 2. **OTP Copy Button**
```javascript
// Uses navigator.clipboard (web API)
// May fail on mobile or non-secure contexts
if (navigator.clipboard) { ... }
```
→ **Risk:** Silent failure on mobile if HTTPS not enforced

### 3. **Geolocation Permission Fallback**
- "Use Current" button fetches location
- No explanation if permission denied
- User sees "Fetching..." forever if permission blocked

### 4. **Driver List Pagination**
- Shows max 5 drivers inline, "View All" goes to drivers menu
- Drivers menu lists ALL drivers (could be 50+)
- No pagination, slow scroll, heavy DOM

### 5. **Scheduled Booking Datetime**
- Uses native `<input type="datetime-local">`
- Not styled consistently
- May not work on all browsers/platforms

### 6. **Ride Product Availability**
- Fetched from `/ride-products/{district}`
- If network is slow, products load after user starts typing location
- No loading skeleton, just blank

---

## 📋 COMPREHENSIVE FEATURE COMPARISON

### What Driver Dashboard Has That Passenger Doesn't
| Feature | Driver | Passenger |
|---------|--------|-----------|
| Tab-based navigation | ✅ NEW (Phase 3A) | ❌ Uses menu dropdown |
| Quick toggle button (Online) | ✅ | ❌ Hidden in submenu |
| Earnings dashboard | ✅ | ⚠️ Partial (wallet) |
| Spin & Win interface | ✅ | ✅ |
| In-ride controls | ✅ Extensive | ✅ Limited |
| Settings panel | ✅ | ❌ |

### What Passenger Dashboard Has That Driver Doesn't
| Feature | Passenger | Driver |
|---------|-----------|--------|
| Booking confirmation card | ✅ | ❌ |
| Multiple ride types | ✅ 8+ types | ❌ Not applicable |
| Scheduled bookings | ✅ | ❌ |
| Driver filtering (fare/favorite) | ✅ | ❌ |
| Ride product selection | ✅ | ❌ |

---

## 🎯 PRIORITY RECOMMENDATIONS

### High Priority (User-Impacting)
1. **Add Quick SOS button** - Floating button accessible from any screen
2. **Show driver ratings** - Before and after booking
3. **Add Help/Support section** - With FAQs and contact option
4. **Refactor menu to tabs** - Like Phase 3A driver dashboard
5. **Enable payment method selection** - Not just cash

### Medium Priority (Feature Completeness)
6. **Add preferences submenu** - Language, notifications, privacy
7. **Show active promotions** - Discounts and coupon codes
8. **Improve history pagination** - Load more vs. all at once
9. **Fix route display** - Expandable/tooltip instead of truncation
10. **Add rating/feedback UI** - After ride completion

### Low Priority (Technical Debt)
11. **Extract menu components** - Reduce file size
12. **Optimize API calls** - Batch/deduplicate
13. **Fix scheduled booking UI** - Custom datetime picker
14. **Add error boundaries** - Per-menu error handling

---

## 📌 QUICK ACTION ITEMS

### Immediate (Next Sprint)
- [ ] Add floating SOS button
- [ ] Show driver rating before booking
- [ ] Add Help menu option linking to support

### Short-term (1-2 Weeks)
- [ ] Refactor menu from dropdown to tabs (match Phase 3A)
- [ ] Add language selector UI
- [ ] Enable multiple payment methods
- [ ] Create preferences submenu

### Medium-term (3-4 Weeks)
- [ ] Extract menu sections to components
- [ ] Add promotions/offers visibility
- [ ] Improve ride history pagination
- [ ] Add post-ride feedback form

---

## 📎 RELATED FILES
- Main: `autobuddy-mobile/src/screens/PassengerMap.web.js` (1350+ lines)
- Native: `autobuddy-mobile/src/screens/PassengerMap.native.js` (980+ lines)
- Profile: `autobuddy-mobile/src/screens/PassengerProfile.web.js` (700+ lines)
- Safety: `autobuddy-mobile/src/hooks/useKeralaSafety.js`
- Components: `RideCard`, `RideProductsGrid`, `KeralaSafetyCard`, `RevenueCard`

---

**Audit Complete** ✓
