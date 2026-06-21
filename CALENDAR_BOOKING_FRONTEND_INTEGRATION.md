# Calendar Booking Frontend Integration Guide

## Overview
The Calendar Booking feature has been successfully integrated into the AutoBuddy mobile app's PassengerDashboard. Users can now connect their Google Calendar, manage auto-booking preferences, and view their upcoming calendar-based rides.

## What Was Added

### 1. New CalendarBookingScreen Component
**File:** `autobuddy-mobile/src/screens/scheduled/CalendarBookingScreen.tsx` (632 lines)

Features:
- **OAuth Flow:** Seamless Google Calendar authentication with secure token storage
- **Sync & Book:** One-tap calendar sync that automatically detects meetings and books rides
- **Preferences Panel:** Modal for customizing auto-booking settings (buffer time, ride type, distance)
- **Booking Display:** Shows upcoming and recent bookings with status tracking
- **Stats Dashboard:** Displays total booked rides, savings, and connected calendars
- **Empty States:** User-friendly prompts for first-time setup

### 2. Updated PassengerDashboard
**File:** `autobuddy-mobile/src/screens/PassengerDashboard.tsx` (modified)

Changes:
- Added `'calendar'` to `DashboardTab` type
- Imported `CalendarBookingScreen` component
- Added Calendar tab to bottom navigation bar (positioned between History and Profile)
- Conditional rendering for calendar tab content

### 3. Tab Navigation Structure
The Calendar Booking tab is now accessible in the main dashboard:
- **Home** - Book rides
- **Active** - Track active rides
- **History** - View ride history
- **Calendar** ← NEW (Auto-book from calendar meetings)
- **Profile** - User settings

## Environment Setup

### Step 1: Get Google OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing one
3. Enable these APIs:
   - Google Calendar API
   - Google+ API
4. Create OAuth 2.0 credentials:
   - Type: **Web application**
   - Authorized JavaScript origins: 
     - `http://localhost:3000` (dev)
     - `http://localhost:8000` (if frontend on same origin)
     - Your production domain
   - Authorized redirect URIs:
     - `http://localhost:3000/oauth-callback` (dev)
     - `myapp://oauth-callback` (for native/Expo)
     - Your production OAuth redirect URL
5. Copy the **Client ID** and **Client Secret**

### Step 2: Configure Environment Variables

#### Backend (.env)
```bash
# Google OAuth
GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth-callback

# Or for Expo native app
GOOGLE_REDIRECT_URI=myapp://oauth-callback
```

#### Frontend (.env / .env.local)
```bash
# Google OAuth Client (for any frontend-side validation)
REACT_APP_GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
REACT_APP_API_URL=http://localhost:8000
```

### Step 3: Update App Configuration (Expo)

**File:** `app.json` (for native/Expo app)
```json
{
  "expo": {
    "scheme": "myapp",
    "plugins": [
      [
        "expo-web-browser",
        {
          "scheme": "myapp"
        }
      ]
    ]
  }
}
```

### Step 4: Install Required Dependencies

```bash
# If not already installed
npm install expo-web-browser expo-secure-store

# Or with yarn
yarn add expo-web-browser expo-secure-store
```

## API Endpoints Used

The frontend calls these backend endpoints:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/calendar-booking/auth/status` | Check OAuth status |
| GET | `/api/calendar-booking/auth/authorize` | Get OAuth authorization URL |
| POST | `/api/calendar-booking/auth/callback` | Exchange code for tokens |
| GET | `/api/calendar-booking/preferences` | Fetch auto-booking settings |
| POST | `/api/calendar-booking/preferences` | Update auto-booking settings |
| POST | `/api/calendar-booking/sync-and-book` | Sync calendar and create bookings |
| GET | `/api/calendar-booking/bookings` | List all bookings |
| GET | `/api/calendar-booking/upcoming` | List upcoming bookings |
| GET | `/api/calendar-booking/stats` | Get statistics |
| DELETE | `/api/calendar-booking/bookings/{id}` | Cancel a booking |

All endpoints require `Authorization: Bearer <token>` header.

## User Flow

### First-Time Setup
1. User taps **Calendar** tab
2. Sees "Connect Your Calendar" screen
3. Taps **Connect Google Calendar** button
4. Redirected to Google OAuth login
5. Grants permission to access calendar
6. Returns to app, authenticated
7. Auto-booking settings panel appears

### Daily Usage
1. User opens **Calendar** tab
2. Taps **Sync Calendar & Book Rides**
3. App scans Google Calendar for upcoming meetings
4. Automatically books rides for meetings requiring transportation
5. Shows upcoming rides with status (pending/booked/completed)
6. User can cancel individual bookings if needed

### Customization
1. User taps **Edit** icon in "Auto-Booking Settings"
2. Modal opens with options:
   - Toggle auto-booking on/off
   - Toggle auto-confirm bookings
   - Adjust buffer time before meetings
   - Set preferred ride type (economy/comfort/premium)
   - Set max distance threshold
3. Taps **Save** to apply changes

## Key Features

### Smart Meeting Detection
- Analyzes meeting title and location
- Uses 0-1 confidence scoring
- Factors: travel keywords, address patterns, meeting type, location specificity
- Excludes virtual meetings automatically
- Configurable threshold (default 0.7)

### Automatic Booking
- Books rides optimally before meetings
- Considers traffic, distance, and ride type
- Respects user preferences and budget limits
- Can auto-confirm or require manual review

### Secure OAuth
- Tokens encrypted in database
- Refresh tokens handled automatically
- User isolation (per-user token storage)
- CSRF protection with state parameter

### Offline Support
- Cached booking data displayed offline
- Sync happens when connection restored
- User can still view preferences offline

## Testing

### Test with Sample Calendar Events

Create these events in your Google Calendar to test:

1. **Meeting with location:**
   - Title: "KSUM Meeting"
   - Location: "Technopark, Kochi"
   - Time: Tomorrow 10:00 AM
   - Result: Should auto-detect transportation needed

2. **Meeting without location:**
   - Title: "Team Standup"
   - Time: Tomorrow 9:00 AM
   - Result: May or may not book depending on keywords

3. **Virtual meeting:**
   - Title: "Google Meet - Project Discussion"
   - Description: "https://meet.google.com/abc"
   - Time: Tomorrow 2:00 PM
   - Result: Should NOT book (virtual meeting)

4. **Far away location:**
   - Title: "Client Visit"
   - Location: "500 km away"
   - Time: Tomorrow 3:00 PM
   - Result: May not book if exceeds max distance

### Manual Testing Steps

1. Start backend:
   ```bash
   cd backend
   python -m uvicorn app.server:app --reload
   ```

2. Start frontend (Expo):
   ```bash
   cd autobuddy-mobile
   npm start
   ```

3. In Expo, scan QR code or run on simulator

4. Navigate to Calendar tab and test OAuth flow

5. Check browser console (dev tools) for any errors

6. Monitor backend logs for API calls

## Troubleshooting

### OAuth Fails with "Redirect URI mismatch"
**Problem:** OAuth redirect URL doesn't match Google Cloud config
**Solution:**
1. Go to Google Cloud Console
2. Check OAuth redirect URI configuration
3. Update .env `GOOGLE_REDIRECT_URI` to match
4. For native apps, use exact scheme: `myapp://oauth-callback`

### "Token not found" Error
**Problem:** OAuth token not stored/retrieved correctly
**Solution:**
1. Check `expo-secure-store` is installed
2. On Android: Check app has INTERNET permission
3. On iOS: Check Keychain Access permissions
4. Try clearing app data and re-authenticating

### Calendar Events Not Appearing
**Problem:** Events synced but no bookings created
**Solution:**
1. Check calendar events have locations
2. Verify auto-booking is enabled in preferences
3. Check transportation detection threshold (default 0.7)
4. Review backend logs for detection scoring

### "Network Error" on Sync
**Problem:** Frontend can't reach backend
**Solution:**
1. Verify backend is running (`http://localhost:8000`)
2. Check `.env` `REACT_APP_API_URL` points to correct server
3. For phone on different machine: use machine IP instead of localhost
4. Check CORS headers in backend (should allow frontend origin)

## Performance Optimization

### Frontend Performance
- Lazy-load CalendarBookingScreen only when tab is active
- Cache booking data in state (updates on sync)
- Debounce rapid syncs
- Paginate large booking lists

### Backend Performance
- Database indexes on (user_id, event_start_time)
- Rate limiting: 10 syncs/hour per user
- Bulk insert bookings in single transaction
- Cache Google Calendar events in MongoDB

## Security Considerations

### Token Storage
- Access tokens stored encrypted in MongoDB
- Refresh tokens stored securely (auto-rotated)
- User cannot see tokens in response

### User Isolation
- All queries filtered by user_id
- User cannot access other users' calendars
- Cross-user access blocked at API level

### Rate Limiting
- 10 syncs per hour per user
- Prevents calendar abuse
- Returns 429 if exceeded

### Data Privacy
- Calendar data not stored longer than needed
- Minimal personal info exposed to frontend
- Booking history kept for user reference only

## Files Modified/Created

### Created
- `autobuddy-mobile/src/screens/scheduled/CalendarBookingScreen.tsx` (632 lines)

### Modified
- `autobuddy-mobile/src/screens/PassengerDashboard.tsx`:
  - Added calendar import
  - Updated DashboardTab type
  - Added Calendar tab rendering
  - Added Calendar tab button

### Existing Backend Files (Already Created)
- `backend/app/models/calendar_booking_models.py`
- `backend/app/services/calendar_booking_service.py`
- `backend/app/routers/calendar_booking.py`
- `backend/app/bootstrap.py` (updated)
- `backend/server.py` (updated)

## Next Steps

1. **Google OAuth Setup:** Get credentials and update .env
2. **Backend Verification:** Run backend and test endpoints
3. **Frontend Testing:** Test OAuth flow in Expo/browser
4. **User Testing:** Have users set up real calendar connections
5. **Production Deployment:** Configure for production domains
6. **Monitoring:** Set up alerts for sync failures, booking errors

## Support & References

- [Google Calendar API Docs](https://developers.google.com/calendar)
- [OAuth 2.0 Flow](https://developers.google.com/identity/protocols/oauth2)
- [Expo Web Browser](https://docs.expo.dev/versions/latest/sdk/webbrowser/)
- [Calendar Booking Backend Docs](./CALENDAR_BOOKING_IMPLEMENTATION.md)

---

**Status:** ✅ Frontend Integration Complete
- Calendar tab visible in PassengerDashboard
- OAuth flow implemented
- All API calls integrated
- Ready for Google OAuth credentials setup
