## Functional gaps in existing passenger flow

These are not full feature holes, but they reduce quality a lot:

- __Ride history is too limited__
  - Only shows a small slice of rides.
  - Needs better pagination, filters, and ride detail/receipt view.

- __Driver list is constrained__
  - Inline driver preview is limited.
  - Needs better sorting, filtering, and pagination.

- __Route and receipt details are thin__
  - History rows can truncate on smaller screens.
  - Trip detail/receipt view is missing.

- __Post-ride actions are weak__
  - No strong “rate driver”, “report issue”, or “lost item” follow-up flow.

- __No clear cancellation policy UI__
  - The app prevents actions in some states but doesn’t explain them well.

- __No trip modification flow__
  - Missing add-stop, reschedule, and pre-arrival destination edit support.

- __Fare explanation is unclear__
  - Projected fare exists, but the breakdown is not well explained.
# Passenger Flow Enhancement Plan - Functional Gaps Implementation

## Overview
This document outlines the implementation plan to address 7 key functional gaps in the passenger flow. These enhancements will significantly improve user experience and feature completeness.

## Gap Analysis & Implementation Priority

### 1. **Ride History - Enhanced with Pagination, Filters, and Detail View**

**Current State:**
- Only shows first 20 rides inline
- No pagination controls
- No filter options
- No trip detail/receipt view
- Route text truncates on small screens

**Proposed Solution:**
- Create `RideHistoryPanel.js` - New dedicated component replacing inline history
- **Pagination:**
  - Load 10 rides per page
  - "Load more" button or infinite scroll
  - Server-side pagination via `GET /bookings?limit=10&skip=20`

- **Filters:**
  - Status: All, Completed, Cancelled, In-Progress
  - Date Range: Last 7 days, Last 30 days, Last 90 days, Custom
  - Product Type: All, Scheduled, Airport, Corporate, etc.
  - Min/Max Fare

- **Trip Detail Modal:**
  - Shows full trip information
  - Receipt view with breakdown
  - Post-ride actions (rate, report, lost item)
  - Accessible from history card

**API Requirements:**
- `GET /bookings?limit={limit}&skip={skip}&status={status}&from_date={date}&to_date={date}`
- `GET /bookings/{booking_id}` - Full trip details
- `GET /bookings/{booking_id}/receipt` - Receipt data

**Files to Create:**
- `src/components/RideHistoryPanel.js` (new)
- `src/components/TripDetailModal.js` (new)
- `src/components/RideHistoryCard.js` (new)

**Implementation Steps:**
1. Create RideHistoryPanel with filters and pagination
2. Create TripDetailModal for full trip view
3. Create RideHistoryCard (reusable row component)
4. Update PassengerMap.web.js to use new RideHistoryPanel
5. Add pagination UI with "Load more" functionality
6. Integrate receipt data display

---

### 2. **Trip Detail & Receipt View - Comprehensive Display**

**Current State:**
- ReceiptsPanel exists but is separate from history
- No deep trip detail view
- Missing breakdown of charges
- No invoice/export functionality

**Proposed Solution:**
- Create `TripDetailModal.js` - Modal showing complete trip information
- **Display Structure:**
  ```
  Trip Information
  - Booking ID | Date/Time | Status
  - Driver: Name, Photo, Rating, Vehicle
  
  Route & Stops
  - Pickup: Full address, time
  - Drop: Full address, time
  - Distance: km, Duration: minutes
  
  Fare Breakdown
  - Base Fare: INR X
  - Distance Charge: INR X (X km × rate)
  - Time Charge: INR X (if applicable)
  - Surge Multiplier: Xx (if applied)
  - Promotions: -INR X
  - Taxes: INR X
  - Total: INR X
  
  Payment
  - Method: Cash/Card/Wallet
  - Status: Completed/Failed
  
  Actions
  - Rate Driver
  - Report Issue
  - Lost Item Report
  - View Receipt (Export/Share)
  ```

**Files to Create:**
- `src/components/TripDetailModal.js` (new)
- `src/components/FareBreakdown.js` (new)

**Implementation Steps:**
1. Create TripDetailModal with full trip information
2. Create FareBreakdown component showing all charges
3. Add share/export receipt functionality
4. Link from history cards to modal

---

### 3. **Driver List Enhancement - Sorting, Filtering, Pagination**

**Current State:**
- Simple list of nearby drivers
- No sorting options
- No filtering (except fare expectation)
- No pagination
- Limited preview information

**Proposed Solution:**
- Enhance driver selection interface
- **Sorting Options:**
  - Nearest First (default)
  - Highest Rating
  - Lowest Estimated Fare
  - Most Recent (recently completed rides)

- **Filtering:**
  - Driver Favorites (show favorite drivers first)
  - AC vs Non-AC (if available)
  - Driver Type: All, Female, Experienced (100+ rides)
  - Pickup Time: Immediate, 5min, 10min

- **Better Preview:**
  - Driver photo/avatar
  - Completion rate (% completed rides)
  - Response time
  - Vehicle details (make, model, color, plate)
  - Rider count (how many passengers in vehicle if pool)

**Files to Modify:**
- `src/screens/PassengerMap.web.js` (update driver list section)
- Create `src/components/DriverListEnhanced.js` (new)
- Create `src/components/DriverPreview.js` (new)

**Implementation Steps:**
1. Create DriverPreview component with rich driver info
2. Add sorting dropdown
3. Add filtering options
4. Implement pagination if 10+ drivers available
5. Store sort/filter preferences

---

### 4. **Post-Ride Actions - Expanded Flow**

**Current State:**
- Only rating + feedback
- No report issue capability
- No lost item report
- No follow-up actions

**Proposed Solution:**
- Enhance `PostRideRatingModal.js` with tabs/sections
- **Sections:**
  1. **Rate Ride** (existing)
     - 5-star rating
     - Feedback text
  
  2. **Report Issue** (new)
     - Issue Type: Speeding, Wrong Route, Vehicle Problem, Driver Behavior, Payment Issue, Other
     - Description: Text input (500 chars)
     - Photo upload (optional)
     - Attachment: Dashboard video (if available)
  
  3. **Lost Item Report** (new)
     - Item Type: Phone, Wallet, Keys, Bag, Other
     - Description
     - Contact for retrieval
     - Lost Item status tracker
  
  4. **View Receipt** (new)
     - Full receipt with fare breakdown
     - Share/Export options
     - Email receipt

**API Requirements:**
- `POST /v1/passengers/ratings/{booking_id}/issue` - Report issue
- `POST /v1/passengers/bookings/{booking_id}/lost-item` - Report lost item
- `GET /v1/passengers/bookings/{booking_id}/receipt` - Receipt data

**Files to Modify:**
- `src/components/PostRideRatingModal.js` (enhance)
- Create `src/components/ReportIssueTab.js` (new)
- Create `src/components/LostItemTab.js` (new)
- Create `src/components/ReceiptTab.js` (new)

**Implementation Steps:**
1. Add tabs to PostRideRatingModal
2. Create ReportIssueTab component
3. Create LostItemTab component
4. Add receipt view tab
5. Link to tracking/status pages

---

### 5. **Cancellation Policy UI - Clear Explanation**

**Current State:**
- Cancellation disabled after driver accepts with message
- No detailed policy explanation
- No refund information
- No preview before booking

**Proposed Solution:**
- Create `CancellationPolicyModal.js` - Show policy at booking start
- **Content:**
  ```
  Cancellation Policy
  
  FREE Cancellation
  - Before driver accepts: Full refund
  - Valid until: [countdown timer]
  
  PAID Cancellation
  - After driver accepts: INR 50-100 cancellation fee
  - Exception: Driver cancels = Full refund
  
  NO Cancellation
  - After driver arrives (3+ minutes): INR 100 wait fee
  - After trip started: Full trip charge
  - Exception: Driver issue reported = Full refund
  
  Special Cases
  - Emergency scenario: Document for support
  - Lost passenger: Driver can cancel after 10 min wait
  
  [Acknowledge & Continue]
  ```

- **Implementation:**
  - Show modal on first ride booking (can skip)
  - Show banner during active ride with current cancellation cost
  - Update cancellation button with cost preview
  - Show policy in each ride state (pending, accepted, arrived, in-progress)

**Files to Create:**
- `src/components/CancellationPolicyModal.js` (new)
- `src/components/CancellationCostBanner.js` (new)

**Implementation Steps:**
1. Create CancellationPolicyModal
2. Create CancellationCostBanner (shown during booking)
3. Show policy on first ride (onboarding)
4. Update cancellation button to show cost preview
5. Link to support for cancellation disputes

---

### 6. **Trip Modification Flow - Reschedule & Add Stop**

**Current State:**
- No reschedule capability
- No add-stop during trip
- No destination edit before driver arrives
- No ride modification UI

**Proposed Solution:**
- **Reschedule (Pre-acceptance):**
  - Show reschedule button before driver accepts
  - New time picker
  - Preserve pickup/drop locations
  - Update estimated fare for new time
  - Cancel original booking, create new one

- **Add Stop (During Trip):**
  - Show "Add Stop" button when trip in-progress
  - New location picker modal
  - Add to route (pickup/intermediate/dropoff)
  - Recalculate fare on server
  - Notify driver of route change

- **Destination Edit (Before Arrival):**
  - Show edit button before driver arrives
  - Edit drop location
  - Recalculate fare
  - Show to driver in real-time

**API Requirements:**
- `POST /bookings/{id}/reschedule` - Reschedule booking
- `POST /bookings/{id}/add-stop` - Add intermediate stop
- `PATCH /bookings/{id}/destination` - Update drop location
- `GET /bookings/{id}/fare-estimate` - Get updated fare

**Files to Create:**
- `src/components/RescheduleModal.js` (new)
- `src/components/AddStopModal.js` (new)
- `src/components/EditDestinationModal.js` (new)

**Implementation Steps:**
1. Add reschedule button to pending booking state
2. Create RescheduleModal with time picker
3. Add "Add Stop" button during in-progress ride
4. Create AddStopModal with location picker
5. Add "Edit Destination" before driver arrival
6. Implement fare recalculation

---

### 7. **Fare Explanation - Clear Breakdown**

**Current State:**
- Shows total fare only
- No breakdown of charges
- Surge pricing not well explained
- No time/distance breakdown

**Proposed Solution:**
- Create `FareBreakdownComponent.js` - Inline or modal display
- **Display:**
  ```
  Fare Breakdown
  
  BASE RATE: INR 25
  DISTANCE: 12.5 km × INR 12/km = INR 150
  TIME: 18 min × INR 2/min = INR 36
  
  Subtotal: INR 211
  
  SURGE PRICING: 1.5x ⓘ
  (Due to high demand at this location)
  Surge Amount: INR 106 (211 × 0.5)
  
  PROMOTIONS:
  - Promo Code "RIDE10": -INR 21
  - Welcome Offer: -INR 50
  
  TAXES: INR 18
  
  ESTIMATED TOTAL: INR 264
  
  ⓘ Estimated at booking. Final fare may vary
  based on actual distance and time.
  ```

- **Features:**
  - Show on booking confirmation
  - Show during ride on in-progress screen
  - Show final in receipt
  - Explain each component with tooltips
  - Show surge reason when applicable
  - Show promotions applied

**Files to Create:**
- `src/components/FareBreakdown.js` (new)
- `src/components/FareBreakdownModal.js` (new)

**Implementation Steps:**
1. Create FareBreakdown component
2. Add to booking confirmation screen
3. Add to in-progress ride screen
4. Add to receipt view
5. Add tooltips/explanations for each charge
6. Show final breakdown when trip completes

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Enhance ride history with pagination and filters
- [ ] Create trip detail modal and fare breakdown
- [ ] Add better driver preview component

### Phase 2: Experience (Week 2-3)
- [ ] Expand post-ride actions (report issue, lost item)
- [ ] Add cancellation policy UI
- [ ] Implement fare explanation component

### Phase 3: Advanced (Week 3-4)
- [ ] Add trip modification flows (reschedule, add-stop)
- [ ] Implement real-time fare recalculation
- [ ] Add trip tracking for lost items

---

## Technical Requirements

### Backend Endpoints Needed
```
GET    /bookings?limit=10&skip=0&status=&from_date=&to_date=
GET    /bookings/{id}
GET    /bookings/{id}/receipt
POST   /bookings/{id}/reschedule
POST   /bookings/{id}/add-stop
PATCH  /bookings/{id}/destination
GET    /bookings/{id}/fare-estimate
POST   /passengers/ratings/{id}/issue
POST   /passengers/bookings/{id}/lost-item
GET    /passengers/lost-items/{id}/status
```

### Frontend Files to Create
- RideHistoryPanel.js
- TripDetailModal.js
- RideHistoryCard.js
- DriverListEnhanced.js
- DriverPreview.js
- PostRideRatingModal.js (enhanced)
- ReportIssueTab.js
- LostItemTab.js
- ReceiptTab.js
- CancellationPolicyModal.js
- CancellationCostBanner.js
- RescheduleModal.js
- AddStopModal.js
- EditDestinationModal.js
- FareBreakdown.js
- FareBreakdownModal.js

### Dependencies
- Location picker (already available)
- Date/time picker (already available)
- VoiceTextInput (already available)
- Modal component (already available)
- Scrollable components (already available)

---

## Validation Criteria

### For Each Component:
- [ ] TypeScript validation passes
- [ ] ESLint clean
- [ ] Web build succeeds
- [ ] Manual testing on web
- [ ] Responsive layout (mobile-first)
- [ ] Error handling implemented
- [ ] Loading states implemented
- [ ] Accessibility compliance

### Integration Points:
- [ ] PassengerMap.web.js updated
- [ ] PassengerMap.native.js updated
- [ ] Context providers updated if needed
- [ ] Localization strings added (EN + ML)
- [ ] No console errors
- [ ] Performance acceptable

---

## Success Metrics

1. **Ride History** - Users can view all rides with filters and pagination
2. **Trip Details** - Users can see complete trip information and receipts
3. **Driver Selection** - Users have better tools to select drivers
4. **Post-Ride** - Users can rate, report issues, and report lost items
5. **Cancellation** - Users understand cancellation policies clearly
6. **Trip Modification** - Users can reschedule or modify trips
7. **Fare Clarity** - Users understand how their fare is calculated

---

## Notes
- All components should follow existing design system (COLORS, SHADOWS, TYPOGRAPHY)
- Maintain consistency with existing UI patterns
- Focus on mobile-first responsive design
- Ensure accessibility compliance (WCAG AA)
- Add appropriate error handling and loading states
- Localize all user-facing strings (EN + ML)
