# Family Assistant Implementation Guide

## Quick Start for Developers

This guide helps you integrate and use the Family Assistant feature in AutoBuddy.

## Installation

The Family Assistant is already integrated into the AutoBuddy backend. No additional installation needed.

### Files Added

```
backend/app/
├── db/
│   └── family_assistant_models.py          # Pydantic models for Family Assistant
├── routers/
│   └── family_assistant.py                 # API endpoints
└── services/
    └── family_assistant_service.py         # Business logic layer
```

### Bootstrap Configuration

The router is automatically registered in `app/bootstrap.py`:

```python
from app.routers.family_assistant import router as family_assistant_router

routers = (
    # ... other routers
    family_assistant_router,
)
```

## Testing the API

### 1. Start the Backend Server

```bash
cd backend
python -m uvicorn server:app --reload --port 8000
```

### 2. Test Family Member Endpoints

```bash
# Add family member
curl -X POST http://localhost:8000/api/family/members/add \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "name": "Mom",
    "relationship": "mother",
    "phone": "+91-9876543210",
    "email": "mom@example.com",
    "age": 65,
    "health_conditions": ["hypertension"],
    "auto_book_rides": true,
    "preferred_vehicle_type": "comfort"
  }'

# List family members
curl -X GET http://localhost:8000/api/family/members/list \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get specific member
curl -X GET http://localhost:8000/api/family/members/FM-001 \
  -H "Authorization: Bearer YOUR_TOKEN"

# Update member
curl -X PUT http://localhost:8000/api/family/members/FM-001 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "auto_book_rides": false,
    "preferred_vehicle_type": "premium"
  }'
```

### 3. Test Appointment Endpoints

```bash
# Add appointment
curl -X POST http://localhost:8000/api/family/appointments/add \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "family_member_id": "FM-001",
    "title": "Hospital Appointment - Cardiology",
    "appointment_type": "medical",
    "priority": "high",
    "start_time": "2026-06-23T15:00:00",
    "end_time": "2026-06-23T16:00:00",
    "location": "City Hospital, Hyderabad",
    "location_coordinates": {"lat": 17.3850, "lon": 78.4867},
    "transportation_needed": true,
    "round_trip": true,
    "notify_main_user": true
  }'

# Get upcoming appointments
curl -X GET "http://localhost:8000/api/family/appointments/FM-001?days_ahead=7" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4. Test Notification Endpoints

```bash
# Get notifications
curl -X GET http://localhost:8000/api/family/notifications \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get unread notifications only
curl -X GET "http://localhost:8000/api/family/notifications?unread_only=true" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Mark notification as read
curl -X POST http://localhost:8000/api/family/notifications/NOTIF-001/mark-read \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 5. Test Quick Action - One Click Booking

```bash
# Book ride (one-click action)
curl -X POST http://localhost:8000/api/family/quick-actions/book-ride \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "family_member_id": "FM-001",
    "notification_id": "NOTIF-001",
    "appointment_id": "APT-001",
    "passenger_name": "Mom",
    "passenger_phone": "+91-9876543210",
    "pickup_location": "Home",
    "destination": "City Hospital, Hyderabad",
    "scheduled_time": "2026-06-23T14:30:00",
    "round_trip": true,
    "vehicle_type": "comfort"
  }'
```

### 6. Test Dashboard & Analytics

```bash
# Get family dashboard
curl -X GET http://localhost:8000/api/family/dashboard \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get family analytics (monthly)
curl -X GET "http://localhost:8000/api/family/analytics?period=month" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 7. Test Calendar Sync

```bash
# Enable auto calendar sync
curl -X POST http://localhost:8000/api/family/calendar/enable-auto-sync/FM-001 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "calendar_source": "google",
    "sync_interval_minutes": 15,
    "include_event_types": ["medical", "work"],
    "auto_book_rides": false
  }'

# Sync calendar now
curl -X POST "http://localhost:8000/api/family/calendar/sync/FM-001?calendar_source=google" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Check sync status
curl -X GET http://localhost:8000/api/family/calendar/sync-status/FM-001 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Integration with Frontend

### React Example

```jsx
import React, { useState, useEffect } from 'react';

const FamilyAssistant = () => {
  const [familyMembers, setFamilyMembers] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchFamilyMembers();
    fetchNotifications();
  }, []);

  const fetchFamilyMembers = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/family/members/list', {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await response.json();
      setFamilyMembers(data.members);
    } catch (error) {
      console.error('Error fetching family members:', error);
    }
    setLoading(false);
  };

  const fetchNotifications = async () => {
    try {
      const response = await fetch('/api/family/notifications?unread_only=true', {
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await response.json();
      setNotifications(data.notifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const bookRide = async (notification) => {
    try {
      const response = await fetch('/api/family/quick-actions/book-ride', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify(notification.quick_action_data)
      });
      const data = await response.json();
      console.log('Ride booked:', data);
      // Show success message
      alert(`Ride booked! Booking ID: ${data.booking_id}`);
    } catch (error) {
      console.error('Error booking ride:', error);
    }
  };

  return (
    <div className="family-assistant">
      <h1>Family Assistant</h1>

      {/* Family Members Section */}
      <section className="family-members">
        <h2>Family Members</h2>
        {familyMembers.map(member => (
          <div key={member.member_id} className="member-card">
            <h3>{member.member_name}</h3>
            <p>Relationship: {member.relationship}</p>
            <p>Phone: {member.phone_number}</p>
            {member.health_conditions?.length > 0 && (
              <p>Health: {member.health_conditions.join(', ')}</p>
            )}
          </div>
        ))}
      </section>

      {/* Notifications Section */}
      <section className="notifications">
        <h2>Alerts ({notifications.length})</h2>
        {notifications.map(notification => (
          <div key={notification.notification_id} className="notification-card">
            <h3>{notification.title}</h3>
            <p>{notification.message}</p>
            {notification.quick_action_available && (
              <button 
                className="primary-btn"
                onClick={() => bookRide(notification)}
              >
                {notification.action_type === 'book_ride' ? 'Book Vehicle?' : 'Take Action'}
              </button>
            )}
          </div>
        ))}
      </section>

      {loading && <p>Loading...</p>}
    </div>
  );
};

export default FamilyAssistant;
```

### Vue Example

```vue
<template>
  <div class="family-assistant">
    <h1>Family Assistant</h1>

    <!-- Family Members -->
    <section class="family-members">
      <h2>Family Members</h2>
      <div v-for="member in familyMembers" :key="member.member_id" class="member-card">
        <h3>{{ member.member_name }}</h3>
        <p>Relationship: {{ member.relationship }}</p>
        <p>Phone: {{ member.phone_number }}</p>
        <p v-if="member.health_conditions?.length">
          Health: {{ member.health_conditions.join(', ') }}
        </p>
      </div>
    </section>

    <!-- Notifications -->
    <section class="notifications">
      <h2>Alerts ({{ notifications.length }})</h2>
      <div v-for="notif in notifications" :key="notif.notification_id" class="notification-card">
        <h3>{{ notif.title }}</h3>
        <p>{{ notif.message }}</p>
        <button 
          v-if="notif.quick_action_available"
          @click="bookRide(notif)"
          class="primary-btn"
        >
          {{ notif.action_type === 'book_ride' ? 'Book Vehicle?' : 'Take Action' }}
        </button>
      </div>
    </section>

    <p v-if="loading">Loading...</p>
  </div>
</template>

<script>
export default {
  data() {
    return {
      familyMembers: [],
      notifications: [],
      loading: false
    };
  },

  mounted() {
    this.fetchFamilyMembers();
    this.fetchNotifications();
    // Refresh notifications every 2 minutes
    setInterval(() => this.fetchNotifications(), 120000);
  },

  methods: {
    async fetchFamilyMembers() {
      this.loading = true;
      try {
        const response = await fetch('/api/family/members/list', {
          headers: { 'Authorization': `Bearer ${this.getToken()}` }
        });
        const data = await response.json();
        this.familyMembers = data.members;
      } catch (error) {
        console.error('Error fetching family members:', error);
      }
      this.loading = false;
    },

    async fetchNotifications() {
      try {
        const response = await fetch('/api/family/notifications?unread_only=true', {
          headers: { 'Authorization': `Bearer ${this.getToken()}` }
        });
        const data = await response.json();
        this.notifications = data.notifications;
      } catch (error) {
        console.error('Error fetching notifications:', error);
      }
    },

    async bookRide(notification) {
      try {
        const response = await fetch('/api/family/quick-actions/book-ride', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.getToken()}`
          },
          body: JSON.stringify(notification.quick_action_data)
        });
        const data = await response.json();
        alert(`Ride booked! Booking ID: ${data.booking_id}`);
      } catch (error) {
        console.error('Error booking ride:', error);
      }
    },

    getToken() {
      // Get JWT token from localStorage or auth service
      return localStorage.getItem('auth_token');
    }
  }
};
</script>

<style scoped>
.family-assistant {
  padding: 20px;
}

.member-card, .notification-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 15px;
  margin: 10px 0;
  background: #f9f9f9;
}

.primary-btn {
  background-color: #4CAF50;
  color: white;
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  margin-top: 10px;
}

.primary-btn:hover {
  background-color: #45a049;
}

h2 {
  color: #333;
  margin-top: 20px;
}
</style>
```

## Environment Variables

Ensure these are set in your `.env` file:

```env
# Database
MONGO_URL=mongodb://localhost:27017/autobuddy
FEATURE_DATABASE_URL=postgresql://user:password@localhost/autobuddy

# JWT
JWT_SECRET=your_jwt_secret_min_32_chars
JWT_REFRESH_SECRET=your_refresh_secret_min_32_chars

# Notifications (optional)
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=+1234567890

# Calendar Integration (optional)
GOOGLE_OAUTH_CLIENT_ID=your_google_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_google_client_secret

# Ride Booking Integration
RIDE_API_ENDPOINT=http://localhost:8000/api/bookings
RIDE_API_KEY=your_api_key
```

## Production Deployment Checklist

- [ ] Set `ENVIRONMENT=production` in `.env`
- [ ] Use strong `JWT_SECRET` and `JWT_REFRESH_SECRET` (min 32 chars)
- [ ] Configure MongoDB Atlas connection string
- [ ] Set up PostgreSQL for feature database
- [ ] Configure Twilio/SMS gateway for notifications
- [ ] Set up Google OAuth for calendar integration
- [ ] Configure notification delivery service (SendGrid, SES, etc.)
- [ ] Enable CORS with production origins only
- [ ] Set up Redis for caching
- [ ] Configure error tracking (Sentry)
- [ ] Set up monitoring and alerts
- [ ] Run database migrations
- [ ] Test all critical workflows end-to-end

## Troubleshooting

### Issue: Appointments not syncing from calendar
**Solution:**
1. Verify Google Calendar OAuth token is valid
2. Check calendar event has location details
3. Ensure sync interval is not too large
4. Review backend logs for API errors

### Issue: One-click booking failing
**Solution:**
1. Verify family member phone number is correct
2. Check ride booking API is responding
3. Ensure payment method is valid
4. Review booking service logs

### Issue: Notifications not appearing
**Solution:**
1. Check notification service is configured
2. Verify SMS/Email service credentials
3. Confirm recipient phone/email are correct
4. Check notification delivery logs

## Next Steps

1. **Frontend Implementation**: Build the UI components for Family Assistant
2. **Calendar Integration**: Implement Google Calendar OAuth flow
3. **Notification Service**: Set up SMS/Email delivery
4. **Ride Booking Integration**: Connect to ride booking APIs
5. **Mobile App**: Create mobile-specific features
6. **Analytics**: Add advanced analytics dashboard
7. **Testing**: Write comprehensive test suite

## Support

For questions or issues:
- Check `FAMILY_ASSISTANT_GUIDE.md` for detailed documentation
- Review API endpoint definitions in `family_assistant.py`
- Check business logic in `family_assistant_service.py`
- Review data models in `family_assistant_models.py`
