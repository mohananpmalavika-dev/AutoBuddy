# Calendar Booking - Quick Start Guide

## 🚀 Get Started in 5 Steps

### Step 1: Get Google OAuth Credentials (5 min)

1. Visit [Google Cloud Console](https://console.cloud.google.com)
2. **Create a new project:**
   - Click project dropdown
   - Click "NEW PROJECT"
   - Name: `AutoBuddy-Calendar`
   - Click CREATE

3. **Enable APIs:**
   - Search for "Google Calendar API"
   - Click the result
   - Click ENABLE
   - Go back to APIs dashboard
   - Search for "Google+ API"
   - Click ENABLE

4. **Create OAuth Credentials:**
   - Click "Create Credentials" button
   - Choose "OAuth 2.0 Client ID"
   - Click "Configure Consent Screen" first
   - Fill "App name": `AutoBuddy`
   - Add your email
   - Click SAVE AND CONTINUE through all steps
   - Back to credentials, click "Create Credentials" > "OAuth 2.0 Client ID"
   - Application type: `Web application`
   - Name: `AutoBuddy Web`
   - **Authorized JavaScript origins:**
     - `http://localhost:3000`
     - `http://localhost:8000`
     - Add your production domain later
   - **Authorized redirect URIs:**
     - `http://localhost:3000/oauth-callback`
     - `http://localhost:8000/api/calendar-booking/auth/callback`
   - Click CREATE
   - Copy the **Client ID** and **Client Secret**

### Step 2: Update Environment Files (2 min)

**File: `backend/.env`**
```bash
# Add these lines
GOOGLE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth-callback
```

**File: `autobuddy-mobile/.env`**
```bash
# Add this line
REACT_APP_API_URL=http://localhost:8000
```

### Step 3: Install Dependencies (2 min)

```bash
cd autobuddy-mobile
npm install expo-web-browser expo-secure-store
```

### Step 4: Start Services (1 min)

**Terminal 1 - Backend:**
```bash
cd backend
python -m uvicorn app.server:app --reload --port 8000
```

**Terminal 2 - Frontend:**
```bash
cd autobuddy-mobile
npm start
```

### Step 5: Test the Feature (5 min)

1. **Open the app** in Expo/browser
2. **Tap the Calendar tab** (new in bottom navigation)
3. **Tap "Connect Google Calendar"**
4. **Grant permissions** to AutoBuddy
5. **Create a test event** in your Google Calendar:
   - Title: `KSUM Meeting`
   - Location: `Technopark, Kochi`
   - Time: `Tomorrow 10:00 AM`
6. **Back in app, tap "Sync Calendar & Book Rides"**
7. **See your booking appear** ✅

---

## 📱 What Users See

### Screen 1: Not Connected
```
🗓️ Connect Your Calendar
Sync Google Calendar to automatically book 
rides for your meetings

[Connect Google Calendar]

✓ Auto-detect meetings
✓ Book rides automatically
✓ Never miss a meeting
```

### Screen 2: Connected
```
STATS CARDS:
📊 15 Rides Booked  💰 ₹500 Saved  📅 1 Calendar

[Sync Calendar & Book Rides]

AUTO-BOOKING SETTINGS
🔄 Auto-Booking: ON
✓ Auto-Confirm: OFF
Buffer Time: 30 min | Ride Type: Economy

UPCOMING RIDES (2)
📍 KSUM Meeting at Technopark
   🕐 10:00 AM | ₹150

📍 Client Visit at Mall of India
   🕐 2:00 PM | ₹200
```

---

## 🧪 Test Scenarios

Copy-paste these into your testing:

### Test 1: Basic Meeting with Location
```
Event: KSUM Meeting
Location: Technopark, Kochi
Time: Tomorrow 10:00 AM
Expected: ✅ Booking created
```

### Test 2: Virtual Meeting (Should NOT book)
```
Event: Team Standup
Description: https://meet.google.com/abc
Time: Tomorrow 9:00 AM
Expected: ✅ Skipped (virtual)
```

### Test 3: Meeting Too Far Away
```
Event: Remote Office Visit
Location: Delhi (500 km)
Time: Tomorrow 3:00 PM
Expected: ✅ Skipped (too far, assuming max=50km)
```

### Test 4: Meeting Without Location
```
Event: Marketing Discussion
Time: Tomorrow 11:00 AM
Expected: ⚠️ May or may not book (depends on keywords)
```

---

## 🔧 API Endpoints to Test

Use curl or Postman to test:

```bash
# 1. Check auth status
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/calendar-booking/auth/status

# 2. Get preferences
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/calendar-booking/preferences

# 3. Sync and book
curl -X POST -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/calendar-booking/sync-and-book

# 4. Get upcoming bookings
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/calendar-booking/upcoming

# 5. Get statistics
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/calendar-booking/stats
```

---

## ✅ Verification Checklist

- [ ] Google Cloud Console credentials created
- [ ] `.env` files updated with credentials
- [ ] Backend running on port 8000
- [ ] Frontend running in Expo
- [ ] Calendar tab visible in dashboard
- [ ] Can click "Connect Google Calendar"
- [ ] OAuth flow completes
- [ ] Can tap "Sync Calendar & Book Rides"
- [ ] Test event creates booking
- [ ] Can cancel bookings
- [ ] Settings modal opens and saves

---

## 🐛 Common Issues & Fixes

| Problem | Solution |
|---------|----------|
| "Redirect URI mismatch" | Make sure OAuth redirect URI in .env matches Google Console exactly |
| "Token not found" | Try again - first OAuth attempt sometimes needs retry |
| "Calendar events not appearing" | Check event has location, and transportation detection threshold |
| "API returns 401" | Copy exact Bearer token from login response |
| "No rides available" | Verify booking service has drivers/vehicles available |

---

## 📊 Feature Highlight for Users

Share this with your users:

**AutoBuddy Calendar Booking - Features:**
- ✅ Connect Google Calendar in 30 seconds
- ✅ Automatically detects meeting locations
- ✅ Books rides with smart timing
- ✅ Customizable preferences
- ✅ View bookings in one place
- ✅ Never late to a meeting again

**Example:**
```
1. User has "Meeting at Technopark" at 10 AM
2. AutoBuddy detects location 25 km away
3. Calculates: Need 45 min travel + 30 min buffer = 1 hour
4. Auto-books ride for 8:30 AM
5. User gets reminder & sees ride in app
```

---

## 📈 Next Steps After Testing

1. **Performance Tuning**
   - Test with 100+ calendar events
   - Monitor sync time
   - Check database indexes

2. **User Acceptance Testing**
   - Invite 5-10 beta users
   - Collect feedback
   - Refine UX

3. **Production Deployment**
   - Update Google OAuth redirect URIs
   - Configure production environment
   - Run full regression tests
   - Deploy to staging first

4. **Monitoring**
   - Set up error logging
   - Monitor OAuth failures
   - Track booking success rate
   - Alert on API errors

---

## 🎯 Success Metrics to Track

After launch:
- **Adoption:** % of users who connect calendar
- **Usage:** Avg syncs per user per week
- **Conversion:** % of meetings → bookings
- **User Rating:** Feedback & review scores
- **Errors:** OAuth/booking failure rate

---

## 📚 Full Documentation

For detailed information:
- **Setup Guide:** `CALENDAR_BOOKING_FRONTEND_INTEGRATION.md`
- **Architecture:** `CALENDAR_BOOKING_GUIDE.md`
- **Backend Details:** `CALENDAR_BOOKING_IMPLEMENTATION.md`
- **User Guide:** `README_CALENDAR_BOOKING.md`
- **Complete Summary:** `CALENDAR_BOOKING_COMPLETION_SUMMARY.md`

---

## 🎉 You're All Set!

The Calendar Booking feature is production-ready. Just add your Google OAuth credentials and you're good to go!

**Questions?** Check the documentation files above or review the code comments in:
- `backend/app/services/calendar_booking_service.py`
- `autobuddy-mobile/src/screens/scheduled/CalendarBookingScreen.tsx`

Happy coding! 🚀
