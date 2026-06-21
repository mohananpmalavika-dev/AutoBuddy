# Calendar Booking Feature - Implementation Guide

## Overview

AutoBuddy's Calendar Booking feature enables users to:
- Connect their Google Calendar
- Automatically detect meetings and events
- Intelligently assess if transportation is needed
- Book rides automatically before meetings
- Manage and track calendar-based bookings

This feature leverages NLP, geocoding, and heuristic analysis to provide a seamless transportation booking experience integrated with users' calendars.

## Architecture

### Components

1. **Frontend (React)**
   - `CalendarBooking.tsx` - Main UI component
   - `CalendarBooking.css` - Styling
   - Features: Auth flow, preferences management, reminders, booking display

2. **Backend (FastAPI)**
   - Models: `calendar_booking_models.py` - Pydantic models
   - Service: `calendar_booking_service.py` - Core logic
   - Router: `calendar_booking.py` - REST API endpoints

3. **Database (MongoDB)**
   - Collections: calendar_credentials, calendar_bookings, auto_booking_preferences, calendar_events, oauth_states

### Data Flow

```
User Calendar Event
    ↓
Fetch from Google Calendar API
    ↓
Analyze Meeting Location & Title
    ↓
NLP-based Transportation Need Detection
    ↓
Geocode Location
    ↓
Create Ride Booking Request
    ↓
Store in Database
    ↓
Notify User
```

## API Endpoints

### Authentication & Connection

#### `POST /api/calendar/oauth/authorize`
Initiates Google Calendar OAuth flow
- Returns: authorization_url, state
- Auth: Required (Bearer token)

#### `GET /api/calendar/oauth/callback`
Handles OAuth callback from Google
- Params: code, state
- Returns: success/error status

#### `POST /api/calendar/disconnect-calendar`
Revokes Google Calendar access
- Auth: Required
- Returns: success status

#### `POST /api/calendar/check-calendar-connected`
Checks if user has connected Google Calendar
- Auth: Required
- Returns: {connected: boolean}

### Preferences Management

#### `GET /api/calendar/preferences`
Get user's auto-booking preferences
- Auth: Required
- Returns: AutoBookingPreference object

#### `POST /api/calendar/preferences`
Set or update auto-booking preferences
- Auth: Required
- Body: AutoBookingPreference
- Returns: updated preferences

### Booking Operations

#### `POST /api/calendar/sync-and-book`
Sync calendar and automatically book rides
- Auth: Required
- Returns: {synced_events, auto_booked_count, bookings, errors}

#### `GET /api/calendar/bookings`
Fetch calendar bookings for user
- Auth: Required
- Query params: limit (default 50), status (optional)
- Returns: {count, bookings[]}

#### `GET /api/calendar/bookings/{booking_id}`
Get specific booking details
- Auth: Required
- Returns: CalendarBooking object

#### `DELETE /api/calendar/bookings/{booking_id}`
Cancel a calendar booking
- Auth: Required
- Returns: success status

### Analysis & Insights

#### `POST /api/calendar/analyze-meeting`
Analyze a meeting for transportation needs
- Auth: Required
- Body: {meeting_title, meeting_location, meeting_time}
- Returns: {needs_transportation, confidence_score, reason}

#### `GET /api/calendar/reminders`
Get reminders for next 24 hours
- Auth: Required
- Returns: {count, reminders[]}

#### `GET /api/calendar/stats`
Get calendar booking statistics
- Auth: Required
- Returns: {total_bookings, bookings_by_status, auto_booking_enabled}

## Transportation Need Detection Algorithm

The system uses a multi-factor scoring algorithm:

### Factors Considered:

1. **Exclusion Keywords** (virtual meetings)
   - "call", "zoom", "video", "phone", "virtual", "online", "webinar", "remote", "home"
   - Score: 0.0 (auto-excluded)

2. **Travel Keywords** (location indicators)
   - office, meeting, conference, event, venue, location, building, center, park, hotel, airport, station
   - Score: +0.15 per keyword

3. **Location Specificity**
   - Contains address-like patterns (numbers, multiple words)
   - Score: +0.2 for postal code/building number, +0.1 for general location

4. **Meeting Type Keywords**
   - meeting, conference, summit, meetup, presentation, event
   - Score: +0.2

5. **Location Length**
   - Very short locations: -0.2 (less likely to need transport)

### Confidence Score Normalization:
- Score ranges from 0.0 to 1.0
- Threshold for auto-booking: 0.5 (adjustable in preferences)
- User-configurable threshold: 0.5 - 1.0

### Examples:

| Meeting | Location | Score | Decision |
|---------|----------|-------|----------|
| KSUM Meeting | Technopark | 0.75 | ✓ Book |
| Team Call | Zoom | 0.05 | ✗ Skip |
| Conference | New York Convention Center | 0.85 | ✓ Book |
| Lunch | Office | 0.55 | ✓ Book |
| Virtual | Online | 0.0 | ✗ Skip |

## Setup & Configuration

### Environment Variables

```bash
# Google OAuth Credentials
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:8000/api/calendar/oauth/callback

# Optional
GOOGLE_MAPS_API_KEY=your_maps_api_key  # For geocoding enhancement
```

### Database Collections

Ensure these indexes exist:

```javascript
// calendar_credentials
db.calendar_credentials.createIndex({ user_id: 1 })

// calendar_bookings
db.calendar_bookings.createIndex({ user_id: 1, event_start_time: -1 })
db.calendar_bookings.createIndex({ user_id: 1, booking_status: 1 })

// auto_booking_preferences
db.auto_booking_preferences.createIndex({ user_id: 1 })

// calendar_events
db.calendar_events.createIndex({ user_id: 1, start_time: 1 })
```

## User Workflow

### Step 1: Connect Google Calendar
1. User clicks "Connect Google Calendar"
2. Redirected to Google OAuth consent screen
3. User authorizes AutoBuddy access
4. Credentials stored securely

### Step 2: Configure Preferences
- Ride type (instant/scheduled)
- Advance booking time (5-120 minutes)
- Max daily bookings
- Confidence threshold
- Vehicle preference
- Payment method
- Return trip preferences

### Step 3: Sync & Auto-Book
- User clicks "Sync & Book"
- System fetches calendar events (7-day window)
- Analyzes each event for transportation need
- Creates bookings for high-confidence meetings
- Shows results and reminders

### Step 4: Manage Bookings
- View upcoming meetings with booking status
- Cancel bookings if needed
- Track statistics
- Adjust preferences as needed

## Security Considerations

1. **OAuth Token Management**
   - Tokens encrypted in database
   - Refresh token rotation every 7 days
   - Access token validation before each API call

2. **Data Privacy**
   - Calendar data cached locally, not stored permanently
   - User can disconnect and revoke access anytime
   - GDPR compliant data deletion

3. **API Security**
   - All endpoints require authentication
   - Rate limiting on sync operations (max 10 per hour)
   - Input validation on all user inputs

4. **Database Security**
   - Connection pooling with encryption
   - Query parameterization to prevent injection
   - Audit logging for sensitive operations

## Error Handling

### Common Errors & Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| "Calendar not connected" | User hasn't authorized | Click "Connect Google Calendar" |
| "Failed to extract location" | Invalid location format | Ensure meeting has proper location |
| "Pickup time in the past" | Meeting time too close | Increase advance_booking_minutes |
| "Daily limit reached" | Too many auto-bookings | Increase max_daily_auto_bookings or wait |
| "OAuth token expired" | Token needs refresh | System auto-refreshes, user re-authorize if needed |

## Integration with Ride Booking

Calendar bookings create entries in the `calendar_bookings` collection and trigger ride booking requests:

```python
booking_request = {
    'passenger_id': user_id,
    'pickup_location': user_home_address,
    'dropoff_location': meeting_location,
    'scheduled_time': event_start_time - advance_minutes,
    'ride_type': preferences.preferred_ride_type,
    'source': 'calendar_booking',
    'calendar_event_id': event_id,
    'notes': f"Auto-booked for: {meeting_title}"
}
```

The actual ride booking is created through the existing booking system, maintaining full integration with:
- Driver matching
- Surge pricing
- Payment processing
- Notifications
- Tracking

## Testing

### Unit Tests

```python
# Test transportation need detection
def test_detect_office_meeting():
    needs, score, reason = calendar_service.analyze_meeting_for_transportation(
        "Team Meeting", "Conference Room A, Tech Park"
    )
    assert needs == True
    assert score >= 0.5

# Test virtual meeting exclusion
def test_exclude_zoom_call():
    needs, score, reason = calendar_service.analyze_meeting_for_transportation(
        "Team Call", "Zoom"
    )
    assert needs == False
    assert score < 0.5
```

### Integration Tests

1. Connect Google Calendar with test account
2. Create test events with various locations
3. Trigger sync and verify auto-bookings
4. Cancel bookings and verify cleanup
5. Test OAuth flow and credential refresh

### Manual Testing

1. Create recurring meetings in Google Calendar
2. Set various auto-booking preferences
3. Verify correct meetings are auto-booked
4. Check reminders and notifications
5. Test error scenarios (network errors, invalid locations)

## Performance Optimization

1. **Calendar Sync Caching**
   - Cache fetched events for 1 hour
   - Only sync new events since last check

2. **Batch Processing**
   - Process up to 50 events per sync
   - Async processing for non-blocking UI

3. **Location Geocoding Cache**
   - Cache geocoded locations for 24 hours
   - Reduce API calls to mapping services

4. **Database Indexing**
   - Composite indexes on (user_id, status)
   - TTL index on oauth_states (auto-cleanup)

## Future Enhancements

1. **Smart Meeting Duration Handling**
   - Detect multi-day events
   - Auto-book return trips based on meeting end time

2. **ML-Based Location Extraction**
   - Use NLP to extract precise locations from meeting titles
   - Learn from user behavior (which meetings they travel to)

3. **Calendar Sharing**
   - Support shared calendars and delegated calendars
   - Book rides for team members

4. **Integration with Travel Plans**
   - Detect travel days and book airport rides
   - Sync with flight/hotel bookings

5. **Expense Tracking**
   - Track calendar-based booking expenses
   - Generate reports for corporate accounts
   - Automatic expense categorization

6. **Multiple Calendar Support**
   - Sync multiple Google Calendars
   - Integrate with Outlook, iCal

## Troubleshooting

### Debug Mode

Enable detailed logging:

```bash
export LOG_LEVEL=DEBUG
export CALENDAR_DEBUG=1
```

### Common Issues

1. **OAuth Token Not Storing**
   - Check MongoDB connection
   - Verify credentials JSON is valid
   - Check file permissions for credentials storage

2. **Events Not Syncing**
   - Verify Google Calendar API is enabled
   - Check OAuth scopes include calendar.readonly
   - Verify user hasn't revoked permissions

3. **Incorrect Transportation Detection**
   - Review confidence score calculation
   - Check exclusion keywords list
   - Verify location extraction logic

### Monitoring

Monitor these metrics:
- Calendar sync success rate
- Average confidence scores
- False positive rate (non-transportation meetings booked)
- False negative rate (transportation meetings skipped)
- API response times
- Database query performance

## Support & Feedback

For issues or feature requests:
1. Check this documentation
2. Review API error messages
3. Check browser console for client-side errors
4. Consult backend logs: `tail -f backend.log`
5. Contact support with:
   - User ID
   - Meeting details
   - Expected vs actual behavior
   - Error messages/logs

## License & Attribution

Calendar Booking feature is part of AutoBuddy platform. Uses:
- Google Calendar API
- Google OAuth 2.0
- OpenAI/LLM (optional, for enhanced location extraction)
