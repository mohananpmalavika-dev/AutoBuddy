# Calendar Booking - System Architecture

## 🏗️ High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        AUTOBUDDY APP (Frontend)                       │
│                      React Native / TypeScript                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │           PassengerDashboard (Main Screen)                  │   │
│  │  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐          │   │
│  │  │Home  │  │Active│  │Hist  │  │📅Cal │  │Prof  │  ← NEW  │   │
│  │  └──────┘  └──────┘  └──────┘  └──────┘  └──────┘          │   │
│  │                        │                                     │   │
│  │                        ▼                                     │   │
│  │           ┌──────────────────────────────┐                 │   │
│  │           │ CalendarBookingScreen (NEW)  │                 │   │
│  │           │                              │                 │   │
│  │           │ • OAuth Manager              │                 │   │
│  │           │ • Preferences Modal          │                 │   │
│  │           │ • Booking Display            │                 │   │
│  │           │ • Stats Dashboard            │                 │   │
│  │           └──────────────────────────────┘                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                 │                                     │
│                    API Calls (Bearer Token)                          │
│                                 │                                     │
└─────────────────────────────────┼─────────────────────────────────────┘
                                  │
                    HTTPS / REST API (Port 8000)
                                  │
          ┌───────────────────────┴───────────────────────┐
          │                                               │
┌─────────▼──────────────────────────────────────────────▼────────┐
│            AUTOBUDDY BACKEND (FastAPI / Python)                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │         Calendar Booking Routes (14 Endpoints)             │ │
│  │                                                            │ │
│  │  Auth Routes (3)              Booking Routes (5)          │ │
│  │  • GET  /auth/status          • GET  /bookings            │ │
│  │  • GET  /auth/authorize       • GET  /upcoming            │ │
│  │  • POST /auth/callback        • POST /sync-and-book       │ │
│  │                               • DELETE /bookings/{id}     │ │
│  │  Preference Routes (2)        • GET  /bookings/{id}       │ │
│  │  • GET  /preferences                                      │ │
│  │  • POST /preferences          Analysis Routes (4)        │ │
│  │                               • POST /analyze              │ │
│  │                               • GET  /stats                │ │
│  │                               • GET  /reminders            │ │
│  │                               • GET  /history              │ │
│  └────────────────────────────────────────────────────────────┘ │
│                          │                                       │
│                          ▼                                       │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │      CalendarBookingService (Core Business Logic)          │ │
│  │                                                            │ │
│  │  • OAuth Token Management                                │ │
│  │    ├─ Store/retrieve encrypted tokens                    │ │
│  │    ├─ Refresh tokens automatically                       │ │
│  │    └─ CSRF protection with state parameter              │ │
│  │                                                            │ │
│  │  • Google Calendar Integration                           │ │
│  │    ├─ Fetch user calendars                              │ │
│  │    ├─ List calendar events                              │ │
│  │    └─ Handle API rate limits                            │ │
│  │                                                            │ │
│  │  • Meeting Analysis Engine                              │ │
│  │    ├─ Extract location from event                       │ │
│  │    ├─ Confidence scoring (0-1)                          │ │
│  │    └─ Decision: Book or Skip?                           │ │
│  │                                                            │ │
│  │  • Geocoding & Distance Calculation                     │ │
│  │    ├─ Convert location to coordinates                   │ │
│  │    ├─ Calculate distance from user                      │ │
│  │    └─ Filter by max distance threshold                  │ │
│  │                                                            │ │
│  │  • Booking Orchestration                                │ │
│  │    ├─ Calculate pickup time                             │ │
│  │    ├─ Create booking in system                          │ │
│  │    └─ Send confirmations                                │ │
│  │                                                            │ │
│  └────────────────────────────────────────────────────────────┘ │
│          │                    │                  │                 │
└──────────┼────────────────────┼──────────────────┼─────────────────┘
           │                    │                  │
           ▼                    ▼                  ▼
      ┌─────────┐          ┌──────────┐      ┌─────────────┐
      │ Google  │          │ MongoDB  │      │ Booking     │
      │Calendar │          │Database  │      │Service      │
      │ API     │          │          │      │ (Existing)  │
      └─────────┘          └──────────┘      └─────────────┘
```

---

## 📊 Database Schema

```
MongoDB Collections:

1. calendar_credentials
   ├─ _id (ObjectId)
   ├─ user_id (String, indexed)
   ├─ email (String)
   ├─ access_token (Encrypted String)
   ├─ refresh_token (Encrypted String)
   ├─ token_expiry (DateTime)
   ├─ calendars (Array)
   └─ created_at, updated_at

2. calendar_events
   ├─ _id (ObjectId)
   ├─ user_id (String, indexed)
   ├─ event_id (String)
   ├─ title (String)
   ├─ location (String)
   ├─ start_time (DateTime, indexed)
   ├─ end_time (DateTime)
   ├─ organizer (String)
   ├─ description (String)
   └─ created_at

3. calendar_bookings
   ├─ _id (ObjectId)
   ├─ user_id (String, indexed)
   ├─ event_id (String)
   ├─ event_title (String)
   ├─ location (String)
   ├─ booking_status (String: pending/booked/completed/cancelled)
   ├─ ride_id (String, optional)
   ├─ estimated_cost (Float)
   ├─ pickup_location (String)
   ├─ pickup_time (DateTime)
   ├─ confidence_score (Float)
   ├─ distance_km (Float)
   ├─ created_at
   └─ updated_at

4. auto_booking_preferences
   ├─ _id (ObjectId)
   ├─ user_id (String, unique indexed)
   ├─ enabled (Boolean)
   ├─ auto_confirm (Boolean)
   ├─ buffer_minutes (Integer)
   ├─ min_days_in_advance (Integer)
   ├─ max_distance (Integer)
   ├─ preferred_ride_type (String)
   ├─ created_at
   └─ updated_at

5. oauth_states
   ├─ _id (ObjectId)
   ├─ user_id (String, indexed)
   ├─ state (String, unique)
   ├─ created_at (TTL index: 10 minutes)
   └─ used (Boolean)

Indexes:
├─ calendar_credentials: user_id, email
├─ calendar_events: (user_id, start_time)
├─ calendar_bookings: (user_id, booking_status), user_id
├─ auto_booking_preferences: user_id
└─ oauth_states: state, created_at (TTL)
```

---

## 🔄 OAuth Flow Diagram

```
USER APP                          GOOGLE               AUTOBUDDY BACKEND
  │                                 │                         │
  │ 1. Tap "Connect Calendar"       │                         │
  ├────────────────────────────────►GET /auth/authorize       │
  │                                 │                         │
  │                                 │◄────────────────────────┤
  │                                 │  (returns auth_url)     │
  │                                 │                         │
  │ 2. Redirect to Google OAuth     │                         │
  ├─────────────────────────────────┼────────────────────────►│
  │  (with state parameter)          │                         │
  │                                  │                         │
  │◄─────────────────────────────────┼─────────────────────────┤
  │  User logs in & grants           │                         │
  │  permission                      │                         │
  │                                  │                         │
  │ 3. Redirected back with code    │                         │
  ├────────────────────────────────────────────────────────────┤
  │  myapp://oauth-callback?        │                         │
  │  code=AUTH_CODE&state=STATE    │                         │
  │                                  │                         │
  │ 4. POST /auth/callback            │                         │
  ├─────────────────────────────────────────────────────────►│
  │  (with code)                     │                         │
  │                                  │                         │
  │                                  │ 5. Exchange code       │
  │                                  │    for tokens          │
  │                                  ├────────────────────────►│
  │                                  │                         │
  │                                  │◄────────────────────────┤
  │                                  │    (access_token,      │
  │                                  │     refresh_token)     │
  │                                  │                         │
  │◄────────────────────────────────────────────────────────────┤
  │  Success ✓                       │  (tokens encrypted     │
  │  Show bookings UI                │   & stored)            │
  │                                  │                         │
  │ 6. Sync Calendar                │                         │
  ├─────────────────────────────────────────────────────────►│
  │  POST /sync-and-book             │                         │
  │                                  │ 7. Use refresh_token   │
  │                                  │    to get new access   │
  │                                  ├────────────────────────►│
  │                                  │    Google Calendar API  │
  │                                  │                         │
  │                                  │ 8. Fetch events        │
  │                                  │    Analyze & Book      │
  │                                  │    rides               │
  │                                  │                         │
  │◄────────────────────────────────────────────────────────────┤
  │  Bookings created ✓              │                         │
  │  Display in UI                   │                         │
  │                                  │                         │
```

---

## 🚀 Meeting Detection Algorithm

```
INPUT: Calendar Event (title, location, time, description)
│
├─ STEP 1: Extract Information
│  ├─ Get event title
│  ├─ Get event location
│  ├─ Get event description
│  └─ Parse datetime
│
├─ STEP 2: Initial Checks
│  ├─ Is event in past? → NO BOOK
│  ├─ Is it a virtual meeting?
│  │  (Check: contains "meet.google.com", "zoom", "teams", etc.)
│  │  → YES: NO BOOK (score = 0)
│  └─ Is location provided?
│     → NO: Use minimal scoring
│
├─ STEP 3: Calculate Confidence Score (0-1)
│  │
│  ├─ Travel Keywords Analysis
│  │  ├─ Check title & description for:
│  │  │  • "airport", "station", "office", "meeting", "visit"
│  │  │  • "conference", "seminar", "event"
│  │  │  • Each found = +0.15 (max 0.45)
│  │  └─ Keywords found? → Add to score
│  │
│  ├─ Address Pattern Analysis
│  │  ├─ Location contains:
│  │  │  • Street address (123 Main St) → +0.2
│  │  │  • City & area (Kochi, Mumbai) → +0.2
│  │  │  • Landmark (Technopark, Mall) → +0.15
│  │  │  • Coordinates (lat,long) → +0.2
│  │  └─ Pattern found? → Add to score
│  │
│  ├─ Meeting Type Classification
│  │  ├─ Title contains:
│  │  │  • "Meeting" → +0.2
│  │  │  • "Conference" → +0.25
│  │  │  • "Interview" → +0.25
│  │  │  • "Appointment" → +0.2
│  │  │  • "Review", "Standup" → +0.1
│  │  └─ Classification found? → Add to score
│  │
│  └─ Location Specificity
│     ├─ Location is very specific (full address) → +0.1
│     ├─ Location is generic (just city) → +0.05
│     └─ No location → +0
│
├─ STEP 4: Distance Check
│  ├─ Geocode location → Get lat/long
│  ├─ Calculate distance from user
│  └─ Distance > max_threshold?
│     → YES: Set score = 0 (too far)
│     → NO: Continue
│
├─ STEP 5: Threshold Comparison
│  ├─ final_score = confidence_score
│  ├─ user_threshold = preferences.threshold (default 0.7)
│  ├─ decision = (final_score >= user_threshold)
│  └─ Result:
│     ├─ YES → BOOK RIDE ✓
│     └─ NO → SKIP BOOKING ✗
│
└─ OUTPUT: Booking Status & Confidence Score

Example Scoring:

Event 1: "KSUM Meeting" @ "Technopark, Kochi" @ 10 AM
├─ Keywords found: "meeting" (+0.2)
├─ Address pattern: "Technopark, Kochi" (+0.2)
├─ Meeting type: "Meeting" (+0.2)
├─ Specificity: +0.1
├─ Total Score: 0.7 ← THRESHOLD MET
└─ Decision: ✅ BOOK

Event 2: "Google Meet Standup" (virtual) @ 9 AM
├─ Virtual meeting detected
├─ Total Score: 0 (auto-excluded)
└─ Decision: ✗ SKIP

Event 3: "Team Standup" (no location) @ 11 AM
├─ Keywords: "team", "standup" (+0.1)
├─ No address pattern (0)
├─ Meeting type: low confidence (+0.1)
├─ Total Score: 0.2 ← BELOW THRESHOLD (0.7)
└─ Decision: ✗ SKIP
```

---

## 📱 Frontend Component Hierarchy

```
PassengerDashboard
├─ State: activeTab, token, user
├─ Routes to: CalendarBookingScreen
│  when activeTab === 'calendar'
│
└─ CalendarBookingScreen
   ├─ State:
   │  ├─ authenticated (boolean)
   │  ├─ bookings (array)
   │  ├─ preferences (object)
   │  ├─ upcomingBookings (array)
   │  └─ stats (object)
   │
   ├─ Effects:
   │  ├─ Check auth status on mount
   │  ├─ Fetch bookings if authenticated
   │  └─ Listen for token changes
   │
   ├─ Functions:
   │  ├─ startGoogleOAuth() → Redirect to Google
   │  ├─ fetchPreferences() → API call
   │  ├─ fetchBookings() → API call
   │  ├─ syncCalendar() → API call
   │  ├─ savePreferences() → API call
   │  └─ cancelBooking() → API call
   │
   └─ Renders:
      ├─ IF NOT authenticated:
      │  └─ AuthContainer
      │     ├─ Title & subtitle
      │     ├─ OAuth button
      │     └─ Benefits list
      │
      └─ IF authenticated:
         ├─ StatsContainer
         │  ├─ Total booked
         │  ├─ Savings
         │  └─ Calendars connected
         │
         ├─ SyncButton
         │  └─ "Sync Calendar & Book Rides"
         │
         ├─ PreferencesSection
         │  ├─ Toggle switches
         │  ├─ Settings grid
         │  └─ Edit button
         │
         ├─ UpcomingBookings
         │  └─ List of upcoming rides
         │
         ├─ RecentBookings
         │  └─ List of past rides
         │
         └─ PreferencesModal
            ├─ Buffer time input
            ├─ Max distance input
            ├─ Ride type selector
            ├─ Auto-confirm toggle
            └─ Save/Cancel buttons
```

---

## 🔐 Security Architecture

```
CLIENT SIDE (React Native)
├─ HTTPS only communication
├─ Bearer token in Authorization header
├─ Tokens stored in secure storage (Keychain/Keystore)
└─ No tokens in localStorage or cookies

SERVER SIDE (FastAPI)
├─ OAuth State Parameter
│  └─ CSRF protection for OAuth flow
│
├─ Token Storage
│  ├─ Access tokens encrypted (AES-256)
│  ├─ Refresh tokens encrypted (AES-256)
│  └─ Encryption key from environment
│
├─ User Isolation
│  ├─ All queries filtered by user_id
│  ├─ Cannot access other users' data
│  └─ Cross-user access blocked at API
│
├─ Rate Limiting
│  ├─ 10 syncs/hour per user
│  ├─ 100 bookings/hour per user
│  └─ Returns 429 if exceeded
│
└─ API Authentication
   ├─ All endpoints require Bearer token
   ├─ Token validation on each request
   └─ Invalid/expired tokens rejected

DATABASE (MongoDB)
├─ Sensitive data encryption at rest
├─ Indexes optimized for user_id queries
├─ TTL indexes for temporary data
└─ Access logs for audit trail
```

---

## 📈 Performance Considerations

```
Frontend Performance
├─ Component Rendering
│  ├─ Lazy-load CalendarBookingScreen
│  ├─ Memoize bookings list
│  └─ Virtualize long lists
│
├─ API Optimization
│  ├─ Batch API requests where possible
│  ├─ Debounce rapid syncs
│  └─ Cache booking data locally
│
└─ User Experience
   ├─ Loading states for async operations
   ├─ Error handling with retry logic
   └─ Smooth animations & transitions

Backend Performance
├─ Database Optimization
│  ├─ Index on (user_id, start_time)
│  ├─ Index on (user_id, booking_status)
│  └─ TTL index for oauth_states
│
├─ API Optimization
│  ├─ Connection pooling for MongoDB
│  ├─ Query result pagination
│  └─ Rate limiting to prevent abuse
│
├─ External API Management
│  ├─ Cache Google Calendar events (1 hour)
│  ├─ Batch requests to reduce API calls
│  └─ Handle rate limits gracefully
│
└─ Scalability
   ├─ Horizontal: Add more workers
   ├─ Vertical: Optimize queries
   └─ Caching: Redis for frequent data

Example Metrics (Typical Usage)
├─ Sync calendar: 3-5 seconds (100 events)
├─ Analyze meeting: < 100ms
├─ Create booking: < 500ms
├─ Fetch bookings: < 200ms
└─ Total round-trip: < 2 seconds
```

---

## 🚀 Deployment Architecture

```
Development
├─ Frontend: http://localhost:3000 (npm start)
├─ Backend: http://localhost:8000 (uvicorn)
└─ Database: MongoDB local instance

Staging
├─ Frontend: https://staging-app.autobuddy.com
├─ Backend: https://staging-api.autobuddy.com
├─ Database: MongoDB Atlas (staging cluster)
└─ Google OAuth: Staging credentials

Production
├─ Frontend: https://app.autobuddy.com
├─ Backend: https://api.autobuddy.com (load balanced)
├─ Database: MongoDB Atlas (prod cluster, replicated)
├─ Google OAuth: Production credentials
└─ CDN: CloudFront for static assets
```

---

**Architecture Document Complete**

This architecture is production-ready and follows industry best practices for:
- Security (OAuth, encryption, rate limiting)
- Performance (indexing, caching, pagination)
- Scalability (horizontal scaling, load balancing)
- Reliability (error handling, retries, monitoring)
