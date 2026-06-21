#!/bin/bash
# Calendar Booking - Developer Quick Reference
# A cheat sheet for implementing and working with Calendar Booking

# ============================================================================
# ENVIRONMENT SETUP
# ============================================================================

# 1. Add to .env file:
cat >> .env << 'EOF'
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/calendar/oauth/callback
GOOGLE_MAPS_API_KEY=optional_api_key
EOF

# ============================================================================
# BACKEND STRUCTURE
# ============================================================================

# Key Files Created:
# - backend/app/models/calendar_booking_models.py         (Pydantic models)
# - backend/app/services/calendar_booking_service.py      (Core logic)
# - backend/app/routers/calendar_booking.py               (REST API)
# - backend/app/bootstrap.py                              (Router registration)
# - backend/server.py                                     (Service initialization)

# ============================================================================
# FRONTEND STRUCTURE
# ============================================================================

# Key Files Created:
# - autobuddy-mobile/src/components/CalendarBooking.tsx   (React component)
# - autobuddy-mobile/src/components/CalendarBooking.css   (Styling)

# ============================================================================
# API ENDPOINTS REFERENCE
# ============================================================================

# CONNECTION MANAGEMENT
POST   /api/calendar/oauth/authorize
GET    /api/calendar/oauth/callback?code=CODE&state=STATE
POST   /api/calendar/check-calendar-connected
POST   /api/calendar/disconnect-calendar

# PREFERENCES
GET    /api/calendar/preferences
POST   /api/calendar/preferences

# BOOKINGS
POST   /api/calendar/sync-and-book
GET    /api/calendar/bookings?limit=50&status=pending
GET    /api/calendar/bookings/{booking_id}
DELETE /api/calendar/bookings/{booking_id}

# ANALYSIS & INSIGHTS
POST   /api/calendar/analyze-meeting
GET    /api/calendar/reminders
GET    /api/calendar/stats

# ============================================================================
# KEY PYTHON CLASSES
# ============================================================================

# CalendarBookingService
#   .get_auth_flow(user_id) -> Flow
#   .store_calendar_credentials(user_id, creds_dict) -> bool
#   .get_calendar_credentials(user_id) -> Credentials
#   .fetch_calendar_events(user_id, start, end) -> List[Event]
#   .analyze_meeting_for_transportation(title, location) -> (bool, float, str)
#   .sync_calendar_and_book_rides(user_id, preferences) -> Dict
#   .get_user_bookings(user_id) -> List[Booking]
#   .cancel_calendar_booking(booking_id, user_id) -> bool
#   .get_upcoming_meetings_reminders(user_id) -> List[Meeting]

# ============================================================================
# KEY TYPESCRIPT INTERFACES
# ============================================================================

# AutoBookingPreference
#   enabled: boolean
#   auto_book_threshold: 0.0 - 1.0
#   preferred_ride_type: "instant" | "scheduled"
#   advance_booking_minutes: 5 - 120
#   max_daily_auto_bookings: 1 - 20
#   payment_method: "wallet" | "credit_card"

# CalendarEvent
#   _id: string
#   title: string
#   location: string
#   event_start_time: string (ISO)
#   auto_booked: boolean
#   booking_status: "pending" | "confirmed" | "cancelled"
#   transportation_confidence: 0.0 - 1.0

# ============================================================================
# CURL EXAMPLES
# ============================================================================

# Check connection
curl -X POST http://localhost:8000/api/calendar/check-calendar-connected \
  -H "Authorization: Bearer TOKEN"

# Get authorization URL
curl -X POST http://localhost:8000/api/calendar/oauth/authorize \
  -H "Authorization: Bearer TOKEN"

# Set preferences
curl -X POST http://localhost:8000/api/calendar/preferences \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "enabled": true,
    "auto_book_threshold": 0.7,
    "preferred_ride_type": "instant",
    "advance_booking_minutes": 30,
    "max_daily_auto_bookings": 5
  }'

# Sync and book
curl -X POST http://localhost:8000/api/calendar/sync-and-book \
  -H "Authorization: Bearer TOKEN"

# Get bookings
curl -X GET "http://localhost:8000/api/calendar/bookings?limit=10" \
  -H "Authorization: Bearer TOKEN"

# Analyze meeting
curl -X POST http://localhost:8000/api/calendar/analyze-meeting \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "meeting_title": "Team Meeting",
    "meeting_location": "Tech Park, Bangalore",
    "meeting_time": "2024-06-22T10:00:00Z"
  }'

# Get reminders
curl -X GET http://localhost:8000/api/calendar/reminders \
  -H "Authorization: Bearer TOKEN"

# Get stats
curl -X GET http://localhost:8000/api/calendar/stats \
  -H "Authorization: Bearer TOKEN"

# Cancel booking
curl -X DELETE "http://localhost:8000/api/calendar/bookings/{id}" \
  -H "Authorization: Bearer TOKEN"

# ============================================================================
# TRANSPORTATION DETECTION ALGORITHM
# ============================================================================

# Score Calculation:
# 1. Start with 0.0
# 2. Check for virtual keywords → Auto-exclude if found
# 3. +0.15 per travel keyword found
# 4. +0.2 for address patterns (postal code, numbers)
# 5. +0.1 for having location
# 6. +0.2 for meeting-type keywords
# 7. -0.2 if location is very short
# 8. Clamp to [0.0, 1.0]

# Decision:
# IF score >= 0.5 AND score >= user_threshold → Auto-book

# ============================================================================
# TESTING COMMANDS
# ============================================================================

# Test models
cd backend
python -m py_compile app/models/calendar_booking_models.py

# Test service
python -m py_compile app/services/calendar_booking_service.py

# Test router
python -m py_compile app/routers/calendar_booking.py

# Run examples
python examples_calendar_booking.py

# Run detection tests
python examples_calendar_booking.py --test

# ============================================================================
# DATABASE INDEXES (MongoDB)
# ============================================================================

# Create indexes:
db.calendar_credentials.createIndex({ user_id: 1 })
db.calendar_bookings.createIndex({ user_id: 1, event_start_time: -1 })
db.calendar_bookings.createIndex({ user_id: 1, booking_status: 1 })
db.auto_booking_preferences.createIndex({ user_id: 1 })
db.calendar_events.createIndex({ user_id: 1, start_time: 1 })
db.oauth_states.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 })

# ============================================================================
# REACT COMPONENT USAGE
# ============================================================================

# In your React app:
import CalendarBooking from './components/CalendarBooking'

// Add to routing:
<Route path="/calendar" element={<CalendarBooking />} />

// Or use directly:
<CalendarBooking />

# ============================================================================
# COMMON ISSUES & SOLUTIONS
# ============================================================================

# Issue: "Google Calendar not connected"
# Solution: User needs to authorize - click "Connect Google Calendar"

# Issue: Events not syncing
# Solution: 
#   1. Verify Google Calendar API is enabled
#   2. Check OAuth scopes include calendar.readonly
#   3. Verify user hasn't revoked permissions

# Issue: Wrong meetings being booked
# Solution:
#   1. Check auto_book_threshold setting
#   2. Review transportation_confidence score
#   3. Adjust exclusion/travel keywords

# Issue: OAuth token expired
# Solution: System auto-refreshes, if fails user re-authorizes

# ============================================================================
# FILE LOCATIONS
# ============================================================================

Models:   backend/app/models/calendar_booking_models.py
Service:  backend/app/services/calendar_booking_service.py
Router:   backend/app/routers/calendar_booking.py
Component: autobuddy-mobile/src/components/CalendarBooking.tsx
Styles:   autobuddy-mobile/src/components/CalendarBooking.css
Guide:    CALENDAR_BOOKING_GUIDE.md
Examples: backend/examples_calendar_booking.py

# ============================================================================
# NEXT STEPS
# ============================================================================

# 1. Set environment variables in .env
# 2. Start backend server: python backend/server.py
# 3. Integrate React component in frontend
# 4. Test with examples: python backend/examples_calendar_booking.py
# 5. Run manual tests with test calendar events
# 6. Deploy to staging
# 7. User beta testing
# 8. Production deployment

# ============================================================================
# IMPORTANT LINKS
# ============================================================================

# Documentation:    See CALENDAR_BOOKING_GUIDE.md
# Implementation:   See CALENDAR_BOOKING_IMPLEMENTATION.md
# Examples:         See backend/examples_calendar_booking.py
# Google OAuth:     https://developers.google.com/identity/protocols/oauth2
# Calendar API:     https://developers.google.com/calendar/api
# FastAPI Docs:     http://localhost:8000/docs (when running)
# API Schema:       http://localhost:8000/openapi.json

# ============================================================================
