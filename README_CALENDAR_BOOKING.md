# 📅 AutoBuddy Calendar Booking Feature

## Overview

AutoBuddy's **Calendar Booking** feature is a smart transportation booking system that automatically reserves rides for your calendar meetings. It integrates seamlessly with Google Calendar and uses intelligent analysis to determine when you need a ride.

### Key Features

- 🔗 **Google Calendar Integration** - Secure OAuth connection to your calendar
- 🤖 **Smart Detection** - AI-powered analysis to determine if transportation is needed
- ⚡ **Automatic Booking** - Books rides automatically before meetings (with user approval)
- 📍 **Location Recognition** - Extracts and geocodes meeting locations
- 🔔 **Smart Reminders** - Notifications for upcoming meetings with booking status
- 📊 **Analytics** - Track your transportation patterns and costs
- 🛡️ **Secure** - OAuth 2.0, encrypted tokens, user data isolation
- 📱 **Mobile Ready** - Beautiful responsive UI for all devices

---

## Installation

### Backend Setup

#### 1. Install Dependencies
```bash
cd backend
pip install -r requirements.txt
```

The requirements already include:
- `google-auth-oauthlib` - OAuth support
- `google-auth-httplib2` - HTTP transport
- `google-api-python-client` - Calendar API
- `motor` - Async MongoDB
- `FastAPI` - Web framework

#### 2. Configure Environment Variables
```bash
# Add to backend/.env
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/calendar/oauth/callback

# Optional: For enhanced location geocoding
GOOGLE_MAPS_API_KEY=your_maps_api_key
```

#### 3. Get Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable Google Calendar API
4. Go to Credentials → Create OAuth 2.0 Web Application
5. Add authorized redirect URI: `http://localhost:8000/api/calendar/oauth/callback`
6. Download credentials JSON
7. Set environment variables from the downloaded file

#### 4. Start Backend Server
```bash
cd backend
python server.py
```

Server will run at `http://localhost:8000`

### Frontend Setup

#### 1. Add Component to Your App
```bash
cd autobuddy-mobile
```

#### 2. Copy Files
The component files are already created:
- `src/components/CalendarBooking.tsx` - Main component
- `src/components/CalendarBooking.css` - Styles

#### 3. Add to Routes
```tsx
import CalendarBooking from './components/CalendarBooking'

// In your routing:
<Route path="/calendar" element={<CalendarBooking />} />

// Or use directly:
<div>
  <CalendarBooking />
</div>
```

#### 4. Update API Base URL
In `CalendarBooking.tsx`, ensure the API_BASE is correct:
```tsx
const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000'
```

---

## How It Works

### User Journey

```
1. User Connects Google Calendar
   ↓
2. Authorizes AutoBuddy to access calendar
   ↓
3. Sets auto-booking preferences
   ↓
4. System fetches calendar events
   ↓
5. Analyzes each event for transportation need
   ↓
6. Auto-books rides for meetings exceeding confidence threshold
   ↓
7. Sends reminders with booking status
   ↓
8. Shows bookings in dashboard
```

### Transportation Detection

The system scores each meeting to determine if transportation is needed:

```
Score = Base Score from Analysis

Factors:
+ Travel keywords found in location
+ Address patterns (postal codes, building numbers)
+ Meeting-type keywords (conference, summit, etc.)
- Virtual meeting keywords (Zoom, Teams, etc.)

Range: 0.0 to 1.0
Decision: Auto-book if score >= user's confidence threshold
```

### Example Scenarios

| Meeting | Location | Score | Decision |
|---------|----------|-------|----------|
| KSUM Meeting | Technopark, Trivandrum | 75% | ✓ Book |
| Team Zoom Call | Zoom | 5% | ✗ Skip |
| Conference | Convention Center, NYC | 85% | ✓ Book |
| Lunch Meeting | Office | 55% | ✓ Book |
| Video Call | Online | 0% | ✗ Skip |

---

## API Reference

### Authentication & Connection

#### Start Google Calendar Authorization
```http
POST /api/calendar/oauth/authorize
Authorization: Bearer TOKEN

Response:
{
  "authorization_url": "https://accounts.google.com/o/oauth2/v2/auth?...",
  "state": "user_id_hash"
}
```

#### Check Connection Status
```http
POST /api/calendar/check-calendar-connected
Authorization: Bearer TOKEN

Response:
{
  "connected": true|false,
  "message": "Google Calendar connected|not connected"
}
```

#### Disconnect Google Calendar
```http
POST /api/calendar/disconnect-calendar
Authorization: Bearer TOKEN

Response:
{
  "status": "success",
  "message": "Google Calendar disconnected"
}
```

### Preferences

#### Get User Preferences
```http
GET /api/calendar/preferences
Authorization: Bearer TOKEN

Response:
{
  "enabled": true,
  "auto_book_threshold": 0.7,
  "preferred_ride_type": "instant",
  "advance_booking_minutes": 30,
  "max_daily_auto_bookings": 5,
  "payment_method": "wallet"
}
```

#### Set User Preferences
```http
POST /api/calendar/preferences
Authorization: Bearer TOKEN
Content-Type: application/json

{
  "enabled": true,
  "auto_book_threshold": 0.7,
  "preferred_ride_type": "instant",
  "advance_booking_minutes": 30,
  "include_return_trip": false,
  "max_daily_auto_bookings": 5,
  "preferred_vehicle": "auto",
  "payment_method": "wallet"
}

Response: Settings saved successfully
```

### Bookings

#### Sync Calendar & Auto-Book
```http
POST /api/calendar/sync-and-book
Authorization: Bearer TOKEN

Response:
{
  "status": "success",
  "synced_events": 12,
  "auto_booked_count": 3,
  "bookings": [
    {
      "_id": "...",
      "calendar_event_title": "KSUM Meeting",
      "event_location": "Technopark",
      "booking_status": "pending",
      "transportation_confidence": 0.75
    }
  ],
  "errors": []
}
```

#### Get Calendar Bookings
```http
GET /api/calendar/bookings?limit=50&status=pending
Authorization: Bearer TOKEN

Response:
{
  "count": 3,
  "bookings": [...]
}
```

#### Cancel a Booking
```http
DELETE /api/calendar/bookings/{booking_id}
Authorization: Bearer TOKEN

Response:
{
  "status": "success",
  "message": "Booking cancelled"
}
```

### Analysis

#### Analyze Meeting
```http
POST /api/calendar/analyze-meeting
Authorization: Bearer TOKEN
Content-Type: application/json

{
  "meeting_title": "Team Meeting",
  "meeting_location": "Tech Park, Bangalore",
  "meeting_time": "2024-06-22T10:00:00Z"
}

Response:
{
  "needs_transportation": true,
  "confidence_score": 0.75,
  "reason": "Location-specific meeting with travel keywords",
  "recommendation": "Book a ride"
}
```

#### Get Meeting Reminders
```http
GET /api/calendar/reminders
Authorization: Bearer TOKEN

Response:
{
  "count": 2,
  "reminders": [
    {
      "title": "KSUM Meeting",
      "location": "Technopark",
      "start_time": "2024-06-22T10:00:00Z",
      "ride_booked": true,
      "pickup_time": "2024-06-22T09:30:00Z"
    }
  ]
}
```

#### Get Statistics
```http
GET /api/calendar/stats
Authorization: Bearer TOKEN

Response:
{
  "total_calendar_bookings": 15,
  "bookings_by_status": {
    "pending": 2,
    "confirmed": 10,
    "cancelled": 3
  },
  "auto_booking_enabled": true
}
```

---

## Usage Examples

### Example 1: Complete Workflow in React
```tsx
import CalendarBooking from './components/CalendarBooking'

export default function Dashboard() {
  return (
    <div>
      <h1>My Dashboard</h1>
      <CalendarBooking />
    </div>
  )
}
```

### Example 2: Using the API with curl
```bash
# 1. Check connection
curl -X POST http://localhost:8000/api/calendar/check-calendar-connected \
  -H "Authorization: Bearer YOUR_TOKEN"

# 2. Get authorization URL
curl -X POST http://localhost:8000/api/calendar/oauth/authorize \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. Set preferences
curl -X POST http://localhost:8000/api/calendar/preferences \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled":true,"auto_book_threshold":0.7}'

# 4. Sync and book
curl -X POST http://localhost:8000/api/calendar/sync-and-book \
  -H "Authorization: Bearer YOUR_TOKEN"

# 5. Get bookings
curl -X GET "http://localhost:8000/api/calendar/bookings" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Example 3: Using Python SDK
```python
import requests

API_BASE = "http://localhost:8000"
headers = {"Authorization": f"Bearer {TOKEN}"}

# Check connection
response = requests.post(
    f"{API_BASE}/api/calendar/check-calendar-connected",
    headers=headers
)
print(response.json())

# Sync and book
response = requests.post(
    f"{API_BASE}/api/calendar/sync-and-book",
    headers=headers
)
bookings = response.json()
print(f"Booked {bookings['auto_booked_count']} rides")
```

---

## Database Schema

### calendar_credentials
```javascript
{
  _id: ObjectId,
  user_id: String,
  access_token: String,      // Encrypted
  refresh_token: String,      // Encrypted
  token_expiry: Date,
  calendar_id: String,
  created_at: Date
}
```

### calendar_bookings
```javascript
{
  _id: ObjectId,
  user_id: String,
  calendar_event_id: String,
  calendar_event_title: String,
  event_location: String,
  event_start_time: Date,
  event_end_time: Date,
  auto_booked: Boolean,
  booking_status: String,     // pending, confirmed, cancelled
  transportation_confidence: Number,  // 0-1
  detection_reason: String,
  pickup_location: String,
  dropoff_location: String,
  ride_type: String,
  created_at: Date
}
```

### auto_booking_preferences
```javascript
{
  _id: ObjectId,
  user_id: String,
  enabled: Boolean,
  auto_book_threshold: Number,
  preferred_ride_type: String,
  advance_booking_minutes: Number,
  include_return_trip: Boolean,
  max_daily_auto_bookings: Number,
  preferred_vehicle: String,
  payment_method: String,
  special_requirements: [String],
  created_at: Date,
  updated_at: Date
}
```

---

## Testing

### Run Examples
```bash
cd backend

# Run all examples
python examples_calendar_booking.py

# Run transportation detection tests
python examples_calendar_booking.py --test
```

### Manual Testing Checklist
- [ ] Connect Google Calendar
- [ ] Set auto-booking preferences
- [ ] Create test calendar events
- [ ] Sync calendar
- [ ] Verify bookings are created
- [ ] Check reminders
- [ ] Cancel a booking
- [ ] Get statistics
- [ ] Disconnect calendar

---

## Troubleshooting

### "Google Calendar not connected"
**Solution**: Click "Connect Google Calendar" button to authorize

### "Failed to sync calendar"
**Cause**: OAuth token invalid/expired  
**Solution**: Disconnect and reconnect Google Calendar

### "Events not syncing"
**Causes**:
- Google Calendar API not enabled
- OAuth scopes insufficient
- User revoked permissions

**Solution**:
1. Verify API is enabled in Google Cloud Console
2. Re-authorize the connection
3. Check browser console for detailed error

### "Wrong meetings being booked"
**Cause**: Confidence threshold too low  
**Solution**: Increase `auto_book_threshold` in preferences (0.5 - 1.0)

---

## Configuration

### Auto-Booking Preferences

| Setting | Range | Default | Description |
|---------|-------|---------|-------------|
| enabled | boolean | false | Enable/disable auto-booking |
| auto_book_threshold | 0.0-1.0 | 0.7 | Confidence score threshold |
| preferred_ride_type | instant/scheduled | instant | Type of ride to book |
| advance_booking_minutes | 5-120 | 30 | Minutes before meeting to book |
| include_return_trip | boolean | false | Auto-book return trip |
| max_daily_auto_bookings | 1-20 | 5 | Max bookings per day |
| preferred_vehicle | string | auto | Vehicle preference |
| payment_method | wallet/credit_card | wallet | Payment method |

---

## Performance

- **Calendar Sync**: Processes up to 50 events per sync
- **Geocoding**: 24-hour cache for location data
- **Event Cache**: 1-hour cache for repeated syncs
- **Database Queries**: Optimized with composite indexes
- **Async Processing**: Non-blocking UI updates

---

## Security

- ✅ OAuth 2.0 authentication with Google
- ✅ Encrypted token storage
- ✅ Automatic token refresh
- ✅ User data isolation
- ✅ Rate limiting (10 syncs/hour per user)
- ✅ CSRF protection via state parameter
- ✅ GDPR-compliant data deletion

---

## Future Roadmap

- 🚀 Multi-calendar support (shared calendars)
- 🚀 Outlook & iCal integration
- 🚀 Automatic return trip booking
- 🚀 Smart expense tracking
- 🚀 ML-based location extraction
- 🚀 Travel day detection

---

## Support & Documentation

- 📖 **Full Guide**: See `CALENDAR_BOOKING_GUIDE.md`
- 📋 **Implementation**: See `CALENDAR_BOOKING_IMPLEMENTATION.md`
- 🔍 **Quick Ref**: See `CALENDAR_BOOKING_QUICK_REFERENCE.sh`
- 💻 **Examples**: See `backend/examples_calendar_booking.py`

---

## File Structure

```
AutoBuddy/
├── backend/
│   ├── app/
│   │   ├── models/
│   │   │   └── calendar_booking_models.py
│   │   ├── services/
│   │   │   └── calendar_booking_service.py
│   │   ├── routers/
│   │   │   └── calendar_booking.py
│   │   └── bootstrap.py (updated)
│   ├── server.py (updated)
│   └── examples_calendar_booking.py
├── autobuddy-mobile/
│   └── src/components/
│       ├── CalendarBooking.tsx
│       └── CalendarBooking.css
├── CALENDAR_BOOKING_GUIDE.md
├── CALENDAR_BOOKING_IMPLEMENTATION.md
└── CALENDAR_BOOKING_QUICK_REFERENCE.sh
```

---

## Getting Started

### For Users
1. Visit the Calendar Booking section in AutoBuddy
2. Click "Connect Google Calendar"
3. Authorize access to your calendar
4. Configure auto-booking preferences
5. Sit back and let AutoBuddy book your rides!

### For Developers
1. Follow the **Installation** section above
2. Review `CALENDAR_BOOKING_GUIDE.md` for architecture
3. Check `examples_calendar_booking.py` for API usage
4. Run tests: `python examples_calendar_booking.py --test`
5. Integrate the React component in your app

---

## License & Attribution

Part of the AutoBuddy platform. Uses Google Calendar API and OAuth 2.0.

---

## Questions & Support

For issues or questions:
1. Check the documentation files
2. Review the examples
3. Check browser console for frontend errors
4. Check `backend.log` for server errors
5. Contact the development team

---

**Happy automatic booking! 🚗📅**
