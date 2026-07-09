# Implementation Priority Breakdown
**For AutoBuddy Development Team**

---

## 🎯 PHASE 1: FOUNDATION (Months 1-3)

### Goal: Unblock Revenue & Market Expansion

---

### 1.1 Subscription Management System
**Priority:** 🔴 CRITICAL  
**Duration:** 2-3 weeks  
**Team:** 2 Backend, 1 Frontend, 1 QA

#### Backend Tasks (Week 1-2)
- [ ] Design PostgreSQL schema for subscriptions
  - `subscription_plans` table (id, name, price, features, duration)
  - `user_subscriptions` table (user_id, plan_id, status, start_date, end_date)
  - `subscription_transactions` table (payment history)
- [ ] Create `app/routers/subscriptions.py` with endpoints:
  - `GET /api/v1/subscriptions/plans` - List all plans
  - `POST /api/v1/subscriptions/subscribe` - Subscribe to plan
  - `PUT /api/v1/subscriptions/{id}/upgrade` - Change plan
  - `DELETE /api/v1/subscriptions/{id}/cancel` - Cancel subscription
  - `GET /api/v1/subscriptions/my-subscription` - Current subscription
- [ ] Integrate with Stripe Subscriptions API
  - Create Stripe product for each plan
  - Handle webhook events (payment success, failure, cancellation)
  - Implement proration for mid-cycle changes
- [ ] Create service layer `app/services/subscription_service.py`
  - Check subscription status
  - Enforce feature access based on plan
  - Handle trial periods (14 days)
  - Auto-cancel expired subscriptions (cron job)
- [ ] Add subscription checks to existing endpoints
  - Limit rides per month based on plan
  - Enable/disable features (AI Intent, Family Assistant, etc.)
- [ ] Write unit tests (80% coverage target)

#### Frontend Tasks (Week 2-3)
- [ ] Design subscription UI screens
  - Plans comparison screen
  - Checkout screen
  - Manage subscription screen
  - Upgrade/downgrade flow
- [ ] Implement in `src/app/(tabs)/profile/subscription.tsx`
- [ ] Add subscription badge to profile (Simple/Smart/Pro)
- [ ] Show feature locks for non-subscribers
- [ ] Add "Upgrade to Smart" prompts
- [ ] Write unit tests for components

#### Testing (Week 3)
- [ ] Integration tests for full subscription flow
- [ ] Test Stripe webhook locally (use Stripe CLI)
- [ ] Test edge cases (failed payments, refunds)
- [ ] Load test subscription endpoints

**Deliverables:**
- Working subscription system
- 3 plans: Simple (Free), Smart ($9.99/mo), Pro ($19.99/mo)
- Stripe integration complete
- Admin can create/edit plans

---

### 1.2 GDPR Compliance Module
**Priority:** 🔴 CRITICAL  
**Duration:** 2-3 weeks  
**Team:** 2 Backend, 1 Frontend, 1 Legal Consultant

#### Backend Tasks (Week 1-2)
- [ ] Create `app/routers/data_privacy.py`
  - `POST /api/v1/privacy/export-data` - Request data export
  - `POST /api/v1/privacy/delete-account` - Request account deletion
  - `GET /api/v1/privacy/export-status/{id}` - Check export status
  - `POST /api/v1/privacy/consent` - Update consent preferences
- [ ] Implement data export service
  - Collect data from MongoDB (users, rides, drivers)
  - Collect data from PostgreSQL (passengers, analytics)
  - Generate JSON files + PDF summary
  - Create ZIP archive
  - Upload to S3, email link to user
  - Auto-delete after 7 days
- [ ] Implement account deletion service
  - Soft delete (retain for 30 days in case of mistake)
  - Anonymize personal data (GDPR "Right to be Forgotten")
  - Keep transactional records (legal requirement)
  - Cancel active subscriptions
  - Refund unused credits
- [ ] Create consent management
  - Store consent preferences in DB
  - Track consent version and timestamp
  - Email marketing opt-in/out
  - Data processing consent
  - Third-party sharing consent
- [ ] Add audit logging
  - Log all privacy-related actions
  - Who, what, when, why
  - Store for 7 years (compliance)
- [ ] Create cron job for data retention
  - Auto-delete old ride data (per policy)
  - Auto-delete expired exports

#### Frontend Tasks (Week 2-3)
- [ ] Create Privacy Center in settings
  - `src/app/(tabs)/profile/privacy.tsx`
  - Export my data button
  - Delete account button (with confirmation)
  - Consent preferences toggles
- [ ] Add cookie consent banner
  - Show on first visit
  - Store preference in AsyncStorage
  - Allow change in settings
- [ ] Update Terms of Service acceptance
  - Show on signup
  - Force re-accept when ToS version changes
  - Link to privacy policy
- [ ] Add "Data & Privacy" link to footer

#### Legal/Documentation (Week 3)
- [ ] Draft Privacy Policy
- [ ] Draft Terms of Service
- [ ] Draft Cookie Policy
- [ ] Draft Data Retention Policy
- [ ] Create GDPR compliance checklist
- [ ] Document data flows (for DPIAs)

**Deliverables:**
- GDPR-compliant data export (30-day SLA)
- GDPR-compliant account deletion
- Privacy Policy & ToS published
- Consent management system
- Audit trail for compliance

---

### 1.3 Multi-Language Support (i18n)
**Priority:** 🔴 CRITICAL  
**Duration:** 3-4 weeks  
**Team:** 1 Backend, 2 Frontend, 1 QA, Translators

#### Backend Tasks (Week 1)
- [ ] Add locale support to API
  - Accept `Accept-Language` header
  - Return localized error messages
  - Add `locale` field to user profile
- [ ] Create translation files for backend
  - `locales/en.json` (English - default)
  - `locales/hi.json` (Hindi)
  - `locales/ta.json` (Tamil)
  - `locales/es.json` (Spanish)
  - `locales/ar.json` (Arabic)
- [ ] Update email templates for multi-language
  - Use templates with placeholders
  - Select template based on user locale
- [ ] Add currency localization
  - Store currency in user profile
  - Format amounts based on locale (₹, $, €)
  - Support currency conversion API

#### Frontend Tasks (Week 1-3)
- [ ] Install and configure i18next
  ```bash
  npm install i18next react-i18next i18next-browser-languagedetector
  ```
- [ ] Create translation files
  - `src/locales/en.json` (English)
  - `src/locales/hi.json` (Hindi)
  - `src/locales/ta.json` (Tamil)
  - `src/locales/es.json` (Spanish)
  - `src/locales/ar.json` (Arabic)
- [ ] Refactor all hardcoded strings
  - Replace "Book a Ride" → `t('bookRide')`
  - Replace "Cancel" → `t('cancel')`
  - ~500-700 strings to replace
- [ ] Add language selector
  - In settings/profile screen
  - Show available languages with flags
  - Persist selection in AsyncStorage
  - Restart app to apply (or hot reload)
- [ ] Implement RTL support for Arabic
  - Use `I18nManager` from React Native
  - Test all screens in RTL mode
  - Adjust layouts (flexDirection, alignItems)
- [ ] Localize dates and times
  - Use `date-fns` or `moment` with locale
  - "2 hours ago" → "2 घंटे पहले" (Hindi)
- [ ] Localize currency display
  - Use `Intl.NumberFormat`
  - $10.00 → ₹750.00 (if currency is INR)
- [ ] Test each language thoroughly

#### Translation (Week 3-4)
- [ ] Professional translation for Hindi (most important for India)
- [ ] Professional translation for Tamil
- [ ] Professional translation for Spanish (US market)
- [ ] Professional translation for Arabic (Middle East expansion)
- [ ] Review translations with native speakers
- [ ] Test translations in context (not just strings)

**Deliverables:**
- 5 languages supported (EN, HI, TA, ES, AR)
- Language selector in settings
- RTL support for Arabic
- Currency and date localization
- Translation management process

---

### 1.4 Real-Time Communication (Chat & Calling)
**Priority:** 🔴 CRITICAL  
**Duration:** 3-4 weeks  
**Team:** 2 Backend, 2 Frontend, 1 QA

#### Backend Tasks (Week 1-2)
- [ ] Design MongoDB schema for messaging
  - `conversations` collection (ride_id, participants, last_message)
  - `messages` collection (conversation_id, sender_id, text, timestamp, read)
- [ ] Create WebSocket events for chat
  - `chat:message:send` - Send message
  - `chat:message:received` - Receive message
  - `chat:typing:start` - User started typing
  - `chat:typing:stop` - User stopped typing
  - `chat:message:read` - Mark as read
- [ ] Create `app/routers/messaging.py`
  - `GET /api/v1/messages/{ride_id}` - Get conversation history
  - `POST /api/v1/messages/{ride_id}` - Send message (REST fallback)
  - `PUT /api/v1/messages/{id}/read` - Mark message as read
- [ ] Implement phone number masking
  - Use Twilio or similar for masked calling
  - Generate temp numbers for ride duration
  - Release numbers after ride ends
- [ ] Add push notifications for messages
  - Send FCM notification when message received
  - Include message preview
  - Deep link to conversation
- [ ] Store message history
  - Keep for 90 days
  - Auto-delete after retention period
- [ ] Add profanity filter
  - Block offensive messages
  - Flag for review

#### Frontend Tasks (Week 2-3)
- [ ] Create chat UI component
  - `src/components/RideChat.tsx`
  - Message list (FlatList)
  - Input field with send button
  - Typing indicator
  - Read receipts
  - Timestamp display
- [ ] Integrate Socket.IO client
  - Connect when ride is active
  - Listen for message events
  - Send messages via socket
- [ ] Add chat button to active ride screen
  - Badge for unread messages
  - Open modal with chat UI
- [ ] Implement VoIP calling (optional, Week 3-4)
  - Use WebRTC for peer-to-peer calling
  - Or integrate Twilio Voice
  - "Call Driver" button in ride screen
  - Show call duration
  - Hang up button
- [ ] Add quick reply templates
  - "I'm here"
  - "5 minutes away"
  - "Can't find you"
  - Customizable by user
- [ ] Handle offline messages
  - Queue messages when offline
  - Send when connection restored

#### Testing (Week 4)
- [ ] Test real-time message delivery
- [ ] Test with poor network conditions
- [ ] Test notification delivery
- [ ] Load test (100+ concurrent conversations)

**Deliverables:**
- In-app text chat (real-time)
- Phone number masking for calls
- Push notifications for messages
- 90-day message history
- Typing indicators and read receipts

---

### 1.5 Analytics Dashboard (MVP)
**Priority:** 🔴 CRITICAL  
**Duration:** 4-6 weeks  
**Team:** 2 Backend, 2 Frontend, 1 Data Engineer, 1 QA

#### Backend Tasks (Week 1-3)
- [ ] Design analytics data warehouse
  - Use PostgreSQL for analytics (separate DB)
  - Create materialized views for performance
  - ETL pipeline from MongoDB to PostgreSQL
- [ ] Create `app/routers/analytics.py`
  - `GET /api/v1/analytics/overview` - High-level metrics
  - `GET /api/v1/analytics/rides` - Ride statistics
  - `GET /api/v1/analytics/revenue` - Revenue metrics
  - `GET /api/v1/analytics/users` - User growth
  - `GET /api/v1/analytics/drivers` - Driver statistics
  - `GET /api/v1/analytics/custom` - Custom query builder
- [ ] Implement key metrics calculations
  - **Real-time:** Active rides, drivers online, passengers online
  - **Daily:** Total rides, revenue, new users, new drivers
  - **Weekly:** Week-over-week growth, churn rate
  - **Monthly:** MRR, LTV, CAC, retention cohorts
- [ ] Create background jobs for analytics
  - Hourly: Update real-time metrics
  - Daily: Calculate daily aggregates
  - Weekly: Generate reports
  - Monthly: Cohort analysis
- [ ] Add filters to analytics endpoints
  - Date range (start_date, end_date)
  - City/region
  - Ride type
  - User segment
- [ ] Implement caching for analytics
  - Cache results in Redis (TTL: 5 minutes)
  - Invalidate on significant events

#### Frontend Tasks (Week 3-5)
- [ ] Create Analytics Dashboard screen
  - `src/app/admin/analytics.tsx`
  - Accessible only to admin role
- [ ] Implement key metric cards
  - Total Rides (today, MTD, YTD)
  - Total Revenue
  - Active Users
  - Driver Utilization
  - Average Rating
- [ ] Add charts and visualizations
  - Use `react-native-chart-kit` or `victory-native`
  - Line chart: Rides over time
  - Bar chart: Revenue by ride type
  - Pie chart: User distribution by city
  - Area chart: Growth trends
- [ ] Add date range picker
  - Select custom date range
  - Presets: Today, Week, Month, Year
- [ ] Implement drill-down functionality
  - Click metric → see detailed view
  - Example: Click "Total Rides" → list of rides
- [ ] Add export functionality
  - Export data as CSV
  - Email report
- [ ] Make dashboard responsive
  - Works on mobile and web

#### Data Pipeline (Week 4-6)
- [ ] Set up ETL pipeline
  - Extract data from MongoDB hourly
  - Transform and aggregate
  - Load into PostgreSQL analytics DB
- [ ] Create scheduled jobs
  - Use Celery or similar for task scheduling
  - Monitor job execution
- [ ] Add data quality checks
  - Validate data integrity
  - Alert on anomalies

**Deliverables:**
- Real-time analytics dashboard
- Key business metrics tracked
- Historical trend analysis
- Exportable reports
- Admin-only access

---

## 📦 PHASE 1 SUMMARY

**Duration:** 12-16 weeks (3-4 months)  
**Team Size:** 5-7 engineers  
**Estimated Cost:** $120-150K  

**Deliverables:**
✅ Subscription management (Simple/Smart/Pro)  
✅ GDPR compliance (data export, deletion)  
✅ Multi-language support (5 languages)  
✅ Real-time chat & calling  
✅ Analytics dashboard (MVP)  

**Impact:**
- Unlocks revenue model (subscriptions)
- Enables EU market expansion (GDPR)
- Enables India market penetration (i18n)
- Improves ride coordination (chat)
- Enables data-driven decisions (analytics)

**Completion Criteria:**
- All features deployed to production
- 80% test coverage
- Zero critical bugs
- User acceptance testing passed
- Documentation complete

---

## 🚀 NEXT PHASES

### Phase 2: Revenue (Months 4-6)
- Corporate Portal
- Loyalty & Rewards
- Advanced Payments
- Dynamic Pricing
- Driver Management

### Phase 3: Scale (Months 7-9)
- Integration APIs
- Advanced Safety
- Multi-Region
- Performance Optimization
- Admin Tools

### Phase 4: Differentiation (Months 10-12)
- AI/ML Enhancements
- Accessibility
- Social Features
- Environmental
- Premium Entertainment

---

**Document Owner:** Engineering Lead  
**Last Updated:** July 9, 2026  
**Next Review:** Weekly during Phase 1
