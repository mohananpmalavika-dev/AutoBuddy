# 📋 PASSENGER MENU FEATURE IMPLEMENTATION ROADMAP

**Project:** AutoBuddy Passenger Menu Enhancement  
**Target:** All 10 Missing Features  
**Scope:** Web & Native (Expo React Native)  
**Timeline:** Phased over 4 weeks  

---

## 🏗️ ARCHITECTURE OVERVIEW

### Database Schema Changes
```sql
-- New Tables Needed

-- 1. Notifications
CREATE TABLE passenger_notifications (
  id UUID PRIMARY KEY,
  passenger_id UUID,
  type VARCHAR (booking_accepted, driver_arrived, trip_started, trip_completed, promo, system),
  title VARCHAR,
  body TEXT,
  data JSONB (booking_id, driver_id, etc),
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP,
  FOREIGN KEY (passenger_id) REFERENCES users(id)
);

-- 2. Passenger Ratings
CREATE TABLE passenger_ride_ratings (
  id UUID PRIMARY KEY,
  booking_id UUID UNIQUE,
  passenger_id UUID,
  driver_id UUID,
  rating INTEGER (1-5),
  comment TEXT,
  images TEXT[], -- image URLs
  reported_issues TEXT[],
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  FOREIGN KEY (passenger_id) REFERENCES users(id),
  FOREIGN KEY (driver_id) REFERENCES users(id)
);

-- 3. Saved Places
CREATE TABLE saved_places (
  id UUID PRIMARY KEY,
  passenger_id UUID,
  label VARCHAR (home, work, other),
  address VARCHAR,
  latitude DECIMAL(10,8),
  longitude DECIMAL(11,8),
  custom_label VARCHAR,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP,
  FOREIGN KEY (passenger_id) REFERENCES users(id)
);

-- 4. Payment Methods
CREATE TABLE payment_methods (
  id UUID PRIMARY KEY,
  passenger_id UUID,
  type VARCHAR (card, upi, wallet),
  provider VARCHAR (stripe, razorpay),
  token VARCHAR, -- encrypted token
  last_four VARCHAR,
  expiry_month INTEGER,
  expiry_year INTEGER,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP,
  FOREIGN KEY (passenger_id) REFERENCES users(id)
);

-- 5. Preferences
CREATE TABLE passenger_preferences (
  id UUID PRIMARY KEY,
  passenger_id UUID UNIQUE,
  preferred_driver_ids UUID[],
  auto_book BOOLEAN DEFAULT false,
  notifications_enabled BOOLEAN DEFAULT true,
  safety_preferences JSONB,
  ride_preferences JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  FOREIGN KEY (passenger_id) REFERENCES users(id)
);

-- 6. Promo Codes
CREATE TABLE promo_codes (
  id UUID PRIMARY KEY,
  code VARCHAR UNIQUE,
  discount_type VARCHAR (fixed, percentage),
  discount_value DECIMAL,
  max_uses INTEGER,
  uses_count INTEGER DEFAULT 0,
  valid_from TIMESTAMP,
  valid_until TIMESTAMP,
  active BOOLEAN DEFAULT true
);

CREATE TABLE promo_redemptions (
  id UUID PRIMARY KEY,
  booking_id UUID,
  promo_id UUID,
  passenger_id UUID,
  discount_amount DECIMAL,
  created_at TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id),
  FOREIGN KEY (promo_id) REFERENCES promo_codes(id),
  FOREIGN KEY (passenger_id) REFERENCES users(id)
);

-- 7. Support Tickets
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY,
  passenger_id UUID,
  booking_id UUID,
  category VARCHAR (ride_issue, payment, safety, other),
  subject VARCHAR,
  description TEXT,
  status VARCHAR (open, in_progress, resolved, closed),
  priority VARCHAR (low, medium, high),
  created_at TIMESTAMP,
  resolved_at TIMESTAMP,
  FOREIGN KEY (passenger_id) REFERENCES users(id),
  FOREIGN KEY (booking_id) REFERENCES bookings(id)
);

CREATE TABLE support_messages (
  id UUID PRIMARY KEY,
  ticket_id UUID,
  sender_id UUID,
  message TEXT,
  attachments TEXT[],
  created_at TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id),
  FOREIGN KEY (sender_id) REFERENCES users(id)
);

-- 8. Scheduled Rides (modify existing)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS
  scheduled_at TIMESTAMP,
  scheduled_status VARCHAR (pending, confirmed, cancelled),
  reminder_sent BOOLEAN DEFAULT false;
```

---

## 📦 FRONTEND COMPONENTS TO CREATE

### 1. NOTIFICATIONS SYSTEM
**Components:**
- `NotificationCenter.js` - Main notification panel
- `NotificationBell.js` - Header icon with badge
- `NotificationItem.js` - Single notification card
- `NotificationService.js` - WebSocket/polling logic

**Hooks:**
- `useNotifications()` - State management
- `useNotificationWebSocket()` - Real-time updates

**Files to Create:**
```
src/components/
  ├── NotificationCenter.js (350 lines)
  ├── NotificationBell.js (150 lines)
  ├── NotificationItem.js (200 lines)
src/hooks/
  ├── useNotifications.js (250 lines)
  ├── useNotificationWebSocket.js (300 lines)
src/lib/
  ├── notificationService.js (200 lines)
```

---

### 2. PASSENGER RATINGS SYSTEM
**Components:**
- `RideRatingModal.js` - Post-ride rating UI
- `RatingStars.js` - Interactive star selector
- `IssueSelector.js` - Issue checkboxes
- `PhotoUpload.js` - Image attachment
- `RatingsHistory.js` - View past ratings

**Files to Create:**
```
src/components/
  ├── RideRatingModal.js (450 lines)
  ├── RatingStars.js (120 lines)
  ├── IssueSelector.js (200 lines)
  ├── PhotoUpload.js (280 lines)
src/screens/
  ├── RatingsHistory.js (350 lines)
```

---

### 3. SAVED PLACES
**Components:**
- `SavedPlaces.js` - Manage saved locations
- `SavePlaceModal.js` - Add/edit place
- `PlaceQuickButton.js` - Quick access button
- `PlacesList.js` - All places listing

**Files to Create:**
```
src/components/
  ├── SavedPlaces.js (400 lines)
  ├── SavePlaceModal.js (300 lines)
  ├── PlaceQuickButton.js (100 lines)
  ├── PlacesList.js (250 lines)
```

---

### 4. PAYMENT METHODS MANAGEMENT
**Components:**
- `PaymentMethodsList.js` - All methods listing
- `AddPaymentModal.js` - Add new method
- `CardForm.js` - Card input
- `UPIForm.js` - UPI input
- `PaymentMethodCard.js` - Single method display

**Files to Create:**
```
src/components/
  ├── PaymentMethodsList.js (350 lines)
  ├── AddPaymentModal.js (400 lines)
  ├── CardForm.js (250 lines)
  ├── UPIForm.js (200 lines)
  ├── PaymentMethodCard.js (180 lines)
```

---

### 5. PREFERENCES & SETTINGS
**Components:**
- `PreferencesMenu.js` - Settings screen
- `RidePreferences.js` - Ride customization
- `SafetyPreferences.js` - Safety settings
- `NotificationPreferences.js` - Alert settings
- `AccessibilitySettings.js` - A11y options

**Files to Create:**
```
src/screens/
  ├── PreferencesMenu.js (500 lines)
  ├── RidePreferences.js (350 lines)
  ├── SafetyPreferences.js (300 lines)
  ├── NotificationPreferences.js (280 lines)
  ├── AccessibilitySettings.js (300 lines)
```

---

### 6. SCHEDULED RIDES MANAGEMENT
**Components:**
- `ScheduledRidesList.js` - All scheduled rides
- `ScheduledRideDetail.js` - View/modify/cancel
- `ModifyScheduledModal.js` - Edit time/location
- `ReminderNotification.js` - Pre-ride alerts

**Files to Create:**
```
src/components/
  ├── ScheduledRidesList.js (400 lines)
  ├── ScheduledRideDetail.js (350 lines)
  ├── ModifyScheduledModal.js (300 lines)
src/hooks/
  ├── useScheduledRideReminders.js (250 lines)
```

---

### 7. PROMO CODES & WALLET
**Components:**
- `PromoCodeInput.js` - Code entry field
- `ActiveDeals.js` - Promotions display
- `WalletBalance.js` - Balance view
- `TopupWallet.js` - Add funds
- `PromoHistory.js` - Applied promos

**Files to Create:**
```
src/components/
  ├── PromoCodeInput.js (200 lines)
  ├── ActiveDeals.js (300 lines)
  ├── WalletBalance.js (150 lines)
  ├── TopupWallet.js (350 lines)
  ├── PromoHistory.js (280 lines)
```

---

### 8. SUPPORT/HELP SYSTEM
**Components:**
- `SupportCenter.js` - Help & support main
- `SupportChatbox.js` - Live chat UI
- `SupportTicketForm.js` - Report issue
- `FaqScreen.js` - Knowledge base
- `ContactSupport.js` - Contact options

**Files to Create:**
```
src/screens/
  ├── SupportCenter.js (400 lines)
  ├── SupportChatbox.js (500 lines)
  ├── SupportTicketForm.js (350 lines)
  ├── FaqScreen.js (300 lines)
  ├── ContactSupport.js (200 lines)
```

---

### 9. RIDE DETAILS & RECEIPTS
**Components:**
- `RideReceipt.js` - Full trip receipt
- `FareBreakdown.js` - Fare calculation details
- `TripMap.js` - Route visualization
- `ReceiptDownload.js` - PDF export
- `ReceiptShare.js` - Share email/link

**Files to Create:**
```
src/components/
  ├── RideReceipt.js (400 lines)
  ├── FareBreakdown.js (300 lines)
  ├── TripMap.js (350 lines)
  ├── ReceiptDownload.js (200 lines)
src/lib/
  ├── pdfGenerator.js (300 lines)
```

---

### 10. SOS & EMERGENCY
**Components:**
- `SosButton.js` - Emergency button
- `EmergencyContacts.js` - Contact management
- `SosConfirmation.js` - Confirmation dialog
- `EmergencyAlert.js` - Alert notification

**Files to Create:**
```
src/components/
  ├── SosButton.js (200 lines)
  ├── EmergencyContacts.js (350 lines)
  ├── SosConfirmation.js (180 lines)
src/screens/
  ├── EmergencyManager.js (400 lines)
```

---

## 🔌 BACKEND API ENDPOINTS TO CREATE

### Notifications API
```
POST   /api/v1/notifications                    - Get all notifications
POST   /api/v1/notifications/read/:id           - Mark as read
POST   /api/v1/notifications/read-all           - Mark all as read
DELETE /api/v1/notifications/:id                - Delete notification
WS     /api/v1/ws/notifications                 - WebSocket real-time
```

### Ratings API
```
POST   /api/v1/bookings/:id/rating              - Submit rating
GET    /api/v1/bookings/:id/rating              - Get rating
PUT    /api/v1/bookings/:id/rating              - Update rating
DELETE /api/v1/bookings/:id/rating              - Delete rating
GET    /api/v1/ratings/history                  - All ratings
POST   /api/v1/ratings/upload-image             - Image upload
```

### Saved Places API
```
GET    /api/v1/passengers/saved-places          - List all
POST   /api/v1/passengers/saved-places          - Create
PUT    /api/v1/passengers/saved-places/:id      - Update
DELETE /api/v1/passengers/saved-places/:id      - Delete
```

### Payment Methods API
```
GET    /api/v1/passengers/payment-methods       - List all
POST   /api/v1/passengers/payment-methods       - Add method
PUT    /api/v1/passengers/payment-methods/:id   - Update
DELETE /api/v1/passengers/payment-methods/:id   - Remove
PUT    /api/v1/passengers/payment-methods/:id/default - Set default
```

### Preferences API
```
GET    /api/v1/passengers/preferences           - Get all prefs
PUT    /api/v1/passengers/preferences           - Update prefs
PUT    /api/v1/passengers/preferences/safety    - Update safety
PUT    /api/v1/passengers/preferences/ride      - Update ride prefs
PUT    /api/v1/passengers/preferences/notifications - Alert prefs
```

### Scheduled Rides API
```
GET    /api/v1/bookings/scheduled               - List scheduled rides
POST   /api/v1/bookings/:id/reschedule          - Modify date/time
POST   /api/v1/bookings/:id/cancel-schedule     - Cancel scheduled
POST   /api/v1/bookings/:id/reminder-opt-in     - Reminders on/off
```

### Promo Codes API
```
POST   /api/v1/promos/validate                  - Check code validity
POST   /api/v1/bookings/:id/apply-promo         - Apply to booking
GET    /api/v1/promos/active                    - Active promotions
GET    /api/v1/passengers/promo-history         - Redemption history
```

### Support API
```
POST   /api/v1/support/tickets                  - Create ticket
GET    /api/v1/support/tickets                  - List tickets
PUT    /api/v1/support/tickets/:id              - Update ticket
POST   /api/v1/support/tickets/:id/messages     - Send message
GET    /api/v1/support/tickets/:id/messages     - Get chat history
GET    /api/v1/support/faq                      - FAQ list
WS     /api/v1/ws/support/:ticket-id            - Live chat socket
```

---

## 📊 STATE MANAGEMENT ARCHITECTURE

### Contexts to Create
```javascript
// NotificationContext
- notifications: []
- unreadCount: 0
- addNotification()
- markAsRead()
- clearAll()

// RatingsContext
- ratings: []
- ratingsDraft: {}
- submitRating()
- updateRating()

// SavedPlacesContext
- places: []
- addPlace()
- removePlace()
- setDefault()

// PaymentMethodsContext
- methods: []
- defaultMethod: null
- addMethod()
- removeMethod()
- setDefault()

// PreferencesContext
- preferences: {}
- updatePreferences()
- updateSafetyPrefs()

// ScheduledRidesContext
- scheduledRides: []
- loadScheduled()
- reschedule()
- cancel()

// SupportContext
- tickets: []
- activeChat: null
- createTicket()
- sendMessage()

// WalletContext
- balance: 0
- transactions: []
- promos: []
- applyPromo()
- topup()
```

---

## 🔄 INTEGRATION POINTS

### PassengerMap.web.js Modifications
1. Add NotificationBell to header
2. Add SavedPlaces quick buttons
3. Add PromoCodeInput to booking form
4. Add SOS button (floating)
5. Add Support button (floating)
6. Trigger RideRatingModal on trip completion
7. Add Preferences menu link

### PassengerProfile.web.js Modifications
1. Move payment methods management here
2. Add preferences/settings section
3. Add notification settings
4. Add emergency contacts

### New Route Structure
```
/passenger/
  ├── map/                   (existing PassengerMap)
  ├── profile/               (PassengerProfile)
  ├── preferences/           (NEW)
  ├── support/               (NEW)
  ├── saved-places/          (NEW)
  ├── payment-methods/       (NEW)
  ├── scheduled-rides/       (NEW)
  ├── ratings-history/       (NEW)
  ├── wallet/                (NEW)
```

---

## ⚙️ THIRD-PARTY INTEGRATIONS NEEDED

| Service | Purpose | Implementation |
|---------|---------|-----------------|
| **Firebase Cloud Messaging** | Push notifications | `react-native-firebase` |
| **Stripe** | Payment processing | `stripe-react-native` |
| **Socket.io** | Real-time (already using) | Extend for notifications |
| **Image Compression** | Photo upload | `react-image-compressor` |
| **PDF Generation** | Receipt export | `react-pdf` |
| **File Upload** | Support images | Cloudinary API |

---

## 📈 PHASED ROLLOUT PLAN

### PHASE 1: CORE FOUNDATIONS (Week 1)
**Focus:** Infrastructure & most-used features
- [ ] Database schema creation
- [ ] Notification system (backend + frontend)
- [ ] Saved places (basic CRUD)
- [ ] NotificationContext setup
- **Deliverable:** Real-time alerts + location shortcuts

### PHASE 2: USER FEEDBACK (Week 2)
**Focus:** Post-ride quality & ratings
- [ ] Passenger ratings system
- [ ] Ride history enhancements
- [ ] Ride receipt/details screen
- [ ] RatingsContext setup
- **Deliverable:** Quality feedback loop

### PHASE 3: PAYMENT & PREFERENCES (Week 3)
**Focus:** Customization & payment flexibility
- [ ] Payment methods management UI
- [ ] Preferences/settings menu
- [ ] Promo codes system
- [ ] Wallet balance
- **Deliverable:** Personalized experience

### PHASE 4: SUPPORT & SAFETY (Week 4)
**Focus:** Customer support & emergency features
- [ ] Support ticketing system
- [ ] Live chat (basic)
- [ ] SOS button & emergency contacts
- [ ] Scheduled rides management
- **Deliverable:** Safety & support infrastructure

---

## 🧪 TESTING STRATEGY

### Unit Tests (Per Component)
```javascript
// Example: NotificationCenter.test.js
- Render notifications correctly
- Mark as read functionality
- Delete notification
- Badge count calculation
```

### Integration Tests
```javascript
// NotificationContext integration
- Subscribe to WebSocket
- Receive real-time notification
- Update state
- Trigger re-render
```

### E2E Tests (Cypress)
```javascript
// Booking to rating flow
1. Create booking
2. Complete ride
3. Rating modal appears
4. Submit rating
5. Verify in history
```

### Performance Tests
```javascript
// Notification impact
- Initial load time
- Memory usage with 100+ notifications
- WebSocket latency
```

---

## 📋 FILE CREATION CHECKLIST

### Total New Files: ~60
- Components: ~20 (2,000+ lines)
- Screens: ~10 (1,500+ lines)
- Hooks: ~8 (1,200+ lines)
- Contexts: ~8 (800+ lines)
- Libraries: ~6 (1,000+ lines)
- Tests: ~8 (500+ lines)

### Total New Code: ~8,000 lines

### Modifications to Existing Files
- PassengerMap.web.js (+300 lines)
- PassengerMap.native.js (+300 lines)
- PassengerProfile.web.js (+400 lines)
- index.tsx/App routing (+150 lines)
- package.json (dependencies)

---

## 🎯 SUCCESS METRICS

### Adoption
- 60%+ users enable notifications
- 40%+ users rate rides
- 30%+ users save places
- 25%+ users use promo codes

### Engagement
- Avg 2-3 saved places per user
- 80%+ rating completion after completed rides
- 15% promo redemption rate
- <5 min support ticket response time

### Technical
- WebSocket connection 99.9% uptime
- Notification delivery <5s latency
- 0 data loss on ratings
- API response time <200ms

---

## 🚀 DEPLOYMENT STRATEGY

### Web
```bash
# Phase 1
npm run build
vercel deploy --prod

# Feature flags for gradual rollout
NOTIFICATIONS_ENABLED=true
RATINGS_ENABLED=true
```

### Native (EAS)
```bash
# Phase 1
eas build --platform android --profile production
eas build --platform ios --profile production

# Over-the-air updates for hotfixes
eas update --channel production
```

---

## 📊 RESOURCE REQUIREMENTS

| Resource | Effort | Feasibility |
|----------|--------|-------------|
| Frontend Dev | 40 hours | ✅ High |
| Backend Dev | 20 hours | ✅ High |
| QA Testing | 10 hours | ✅ High |
| Deployment | 5 hours | ✅ High |
| **TOTAL** | **75 hours** | **~2 weeks** |

---

## ⚠️ RISK MITIGATION

| Risk | Mitigation |
|------|-----------|
| WebSocket stability | Fallback to polling, retry logic |
| Notification spam | Rate limiting, user preferences |
| Payment data security | PCI DSS compliance, tokenization |
| Data migration | Gradual rollout with feature flags |
| Performance impact | Lazy loading, pagination, caching |

---

## 🏁 NEXT STEPS

1. ✅ **Database schema** → Create in PostgreSQL
2. ✅ **API endpoints** → Build in backend (FastAPI)
3. ✅ **Feature 1: Notifications** → Implement first (highest impact)
4. ✅ **Feature 2: Ratings** → Build rating system
5. ✅ **Feature 3: Saved Places** → Quick access locations
6. Continue with remaining features...

---

**Ready to start implementation?** Shall I begin with **Feature #1: Notifications System**?
