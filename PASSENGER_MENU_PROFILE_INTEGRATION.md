# Passenger Menu Profile/Account Integration - Web Platform

## Issue
The web version of PassengerMap was missing 5 menu items that are fully implemented in the native version:
- **Profile** - User profile management
- **KYC** - Identity verification / Know Your Customer
- **Documents** - Document management and storage
- **Receipts** - Payment receipts and invoices
- **Subscription** - Subscription plan management

These menu items were defined in the native platform but completely absent from the web version.

## Changes Made

### 1. **PassengerMap.web.js** - Component Imports (Lines 40-46)
Added 5 new component imports after `ScheduledRidesPanel`:
```javascript
import PassengerProfilePanel from '../components/PassengerProfilePanel';
import PassengerKYCPanel from '../components/PassengerKYCPanel';
import PassengerDocumentsPanel from '../components/PassengerDocumentsPanel';
import ReceiptsPanel from '../components/ReceiptsPanel';
import SubscriptionPanel from '../components/SubscriptionPanel';
```

### 2. **PassengerMap.web.js** - Menu Options (Lines 64-84)
Extended `PASSENGER_MENU_OPTIONS` array from 16 items to 21 items:
```javascript
const PASSENGER_MENU_OPTIONS = [
  // ... existing 16 items ...
  { key: 'profile' },
  { key: 'kyc' },
  { key: 'documents' },
  { key: 'receipts' },
  { key: 'subscription' },
];
```

**Menu structure now matches native platform:**
1. ride
2. drivers
3. safety
4. wallet
5. spin
6. history
7. notifications
8. promo
9. support
10. payment
11. ratings
12. preferences
13. places
14. emergency
15. accessibility
16. scheduled
17. **profile** ✨ NEW
18. **kyc** ✨ NEW
19. **documents** ✨ NEW
20. **receipts** ✨ NEW
21. **subscription** ✨ NEW

### 3. **PassengerMap.web.js** - Menu Labels (Lines 186-207)
Updated `menuLabels` useMemo to include labels for the 5 new menu items:
```javascript
const menuLabels = useMemo(
  () => ({
    // ... existing 16 labels ...
    profile: t.profile || 'Profile',
    kyc: t.kyc || 'Identity Verification',
    documents: t.documents || 'Documents',
    receipts: t.receipts || 'Saved Receipts',
    subscription: t.subscription || 'Subscription',
  }),
  [t],
);
```

### 4. **PassengerMap.web.js** - Component Rendering (Lines 2295-2307)
Added conditional rendering for the 5 new components after `ScheduledRidesPanel`:
```javascript
{activePassengerMenu === 'profile' && <PassengerProfilePanel token={token} />}
{activePassengerMenu === 'kyc' && <PassengerKYCPanel token={token} />}
{activePassengerMenu === 'documents' && <PassengerDocumentsPanel token={token} />}
{activePassengerMenu === 'receipts' && <ReceiptsPanel token={token} />}
{activePassengerMenu === 'subscription' && <SubscriptionPanel token={token} />}
```

### 5. **passengerDashboard.js** - English Translations (Lines 369-390)
Added localization keys for the 5 new menu items:
- `kyc` - 'Identity Verification'
- `kycPanel` - 'KYC Verification'
- `verifyIdentity` - 'Verify Your Identity'
- `documents` - 'Documents'
- `documentsPanel` - 'My Documents'
- `uploadDocuments` - 'Upload Documents'
- `receipts` - 'Saved Receipts'
- `receiptsPanel` - 'Payment Receipts & Invoices'
- `noReceipts` - 'No receipts available'
- `viewReceipt` - 'View Receipt'
- `downloadReceipt` - 'Download Receipt'
- `subscription` - 'Subscription'
- `subscriptionPanel` - 'Subscription Plans'
- `currentPlan` - 'Current Plan'
- `upgradePlan` - 'Upgrade Plan'
- `manageBilling` - 'Manage Billing'

### 6. **passengerDashboard.js** - Malayalam Translations (Lines 749-770)
Added corresponding Malayalam translations for all 16 new locale keys.

## Platform Consistency

### Before
**Native (PassengerMap.native.js):**
- ✅ 21 menu items defined with labels
- ✅ All 5 components imported
- ✅ All 5 components rendered conditionally
- ✅ Profile button available in menu

**Web (PassengerMap.web.js):**
- ❌ Only 16 menu items (missing 5 profile-related items)
- ❌ Components not imported
- ❌ Components not rendered
- ❌ Profile button only via optional prop

### After
**Native & Web (Both Platforms):**
- ✅ 21 menu items defined with labels
- ✅ All 5 components imported
- ✅ All 5 components rendered conditionally
- ✅ Profile and account features fully accessible via menu
- ✅ Localization available in English and Malayalam

## Technical Details

### Menu Item Flow
1. User clicks menu item (e.g., 'profile')
2. `handleMenuSelection()` is called with the menu key
3. `setActivePassengerMenu()` updates state
4. Conditional rendering displays the appropriate component
5. Component receives `token` prop for API authentication

### Localization Resolution
- `menuLabels` uses `t.kyc || 'Identity Verification'` pattern
- Falls back to English default if Malayalam translation not available
- Supports language switching via `languageCode` state

## Testing Recommendations

### Functional Testing
- [ ] Click each of the 5 new menu items and verify correct component renders
- [ ] Verify menu labels display correctly
- [ ] Check language switching (EN/ML) displays correct translations
- [ ] Verify `token` prop is passed correctly to each component
- [ ] Test menu navigation between old and new items

### Localization Testing
- [ ] Verify English labels display: Profile, Identity Verification, Documents, Saved Receipts, Subscription
- [ ] Verify Malayalam labels display correctly (if using ml language)
- [ ] Test fallback labels display when locale keys missing

### Cross-platform Testing
- [ ] Native: Verify all 5 menu items still work
- [ ] Web: Verify all 5 menu items now work
- [ ] Compare behavior between platforms (should be consistent)

### Component Integration
- [ ] PassengerProfilePanel - Verify profile editing functionality
- [ ] PassengerKYCPanel - Verify identity verification workflow
- [ ] PassengerDocumentsPanel - Verify document upload/display
- [ ] ReceiptsPanel - Verify receipt listing/download
- [ ] SubscriptionPanel - Verify subscription plan display/management

## Files Modified
1. `autobuddy-mobile/src/screens/PassengerMap.web.js`
2. `autobuddy-mobile/src/locales/passengerDashboard.js`

## Implementation Status
✅ **COMPLETE** - Web platform now has full feature parity with native platform for profile/account menu items
