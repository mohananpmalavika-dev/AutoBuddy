# Family Assistant Feature - AutoBuddy

## Overview

The **Family Assistant** is an intelligent transportation management system that helps coordinate rides and appointments for your family members. It enables you to:

- 📱 **Manage family members** - Add and track parents, children, spouse, and other family members
- 📅 **Sync appointments** - Automatically import calendar events (medical, work, personal)
- 🚗 **One-click ride booking** - Book rides for family members with pre-filled details
- 🔔 **Smart notifications** - Get alerts about upcoming appointments and transportation needs
- ⚡ **Quick actions** - Execute pre-configured actions (book hospital ride, call doctor, etc.)
- 📊 **Analytics & tracking** - Monitor family transportation costs and patterns

## Use Case: Mother's Hospital Appointment

Here's a real-world example showing how Family Assistant works:

```
1. Mom's calendar: "Cardiology Appointment - City Hospital" at 3 PM tomorrow
   ↓
2. Family Assistant syncs calendar and detects medical appointment
   ↓
3. System creates notification: "Mom has hospital appointment tomorrow at 3 PM"
   ↓
4. You see notification with "Book vehicle?" quick action
   ↓
5. One click → Ride automatically booked with:
   - Pickup: Your home address
   - Destination: City Hospital
   - Time: 30 mins before appointment
   - Vehicle type: Comfort (or as per preference)
   - Confirmation sent to Mom's phone
```

## Architecture

### Components

1. **Data Models** (`family_assistant_models.py`)
   - `FamilyMember` - Profile of each family member
   - `FamilyAppointment` - Appointments and events
   - `FamilyNotification` - Alerts and messages
   - `FamilyQuickAction` - Pre-configured action templates
   - `CalendarSyncConfig` - Calendar integration settings

2. **API Endpoints** (`family_assistant.py`)
   - Family member CRUD operations
   - Appointment management
   - Notification handling
   - One-click quick actions
   - Dashboard and analytics

3. **Service Layer** (`family_assistant_service.py`)
   - Business logic for all operations
   - Calendar syncing and event analysis
   - Notification generation
   - Analytics calculation

4. **Integration Points**
   - Google Calendar / Outlook (for appointment syncing)
   - Ride Booking API (for transportation booking)
   - Notification Service (SMS, Email, Push)
   - Payment Service (charging for rides)

## API Reference

### Base URL
```
/api/family
```

### 1. Family Member Management

#### Add Family Member
```bash
POST /api/family/members/add
Content-Type: application/json

{
  "name": "Mom",
  "relationship": "mother",
  "phone": "+91-9876543210",
  "email": "mom@example.com",
  "age": 65,
  "health_conditions": ["hypertension"],
  "auto_book_rides": true,
  "preferred_vehicle_type": "comfort"
}

# Response
{
  "success": true,
  "member_id": "FM-001",
  "message": "Mom added to family"
}
```

#### List Family Members
```bash
GET /api/family/members/list

# Response
{
  "total_members": 2,
  "members": [
    {
      "member_id": "FM-001",
      "member_name": "Mom",
      "relationship": "mother",
      "phone_number": "+91-9876543210",
      "health_conditions": ["hypertension"],
      "auto_book_rides": true,
      "emergency_contact": true
    }
  ]
}
```

#### Get Family Member Details
```bash
GET /api/family/members/{member_id}

# Response
{
  "member_id": "FM-001",
  "member_name": "Mom",
  "relationship": "mother",
  "age": 65,
  "health_conditions": ["hypertension", "arthritis"],
  "calendar_synced": true,
  "tracking_enabled": true,
  "auto_book_rides": true
}
```

#### Update Family Member
```bash
PUT /api/family/members/{member_id}
Content-Type: application/json

{
  "auto_book_rides": true,
  "preferred_vehicle_type": "comfort"
}
```

---

### 2. Appointment Management

#### Add Appointment
```bash
POST /api/family/appointments/add
Content-Type: application/json

{
  "family_member_id": "FM-001",
  "title": "Hospital Appointment - Cardiology",
  "description": "Annual heart checkup",
  "appointment_type": "medical",
  "priority": "high",
  "start_time": "2026-06-23T15:00:00",
  "end_time": "2026-06-23T16:00:00",
  "location": "City Hospital, Hyderabad",
  "location_coordinates": {"lat": 17.3850, "lon": 78.4867},
  "transportation_needed": true,
  "round_trip": true,
  "notify_main_user": true
}

# Response
{
  "success": true,
  "appointment_id": "APT-001",
  "message": "Appointment added successfully"
}
```

#### Get Upcoming Appointments
```bash
GET /api/family/appointments/{member_id}?days_ahead=7

# Response
{
  "member_id": "FM-001",
  "total_appointments": 2,
  "appointments": [
    {
      "appointment_id": "APT-001",
      "title": "Hospital Appointment",
      "appointment_type": "medical",
      "priority": "high",
      "start_time": "2026-06-23T15:00:00",
      "location": "City Hospital",
      "transportation_needed": true,
      "ride_booked": false
    }
  ]
}
```

---

### 3. Notifications & Alerts

#### Get Family Notifications
```bash
GET /api/family/notifications?unread_only=false

# Response
{
  "total": 3,
  "unread": 1,
  "notifications": [
    {
      "notification_id": "NOTIF-001",
      "family_member_name": "Mom",
      "title": "Hospital Appointment Tomorrow",
      "message": "Mom has appointment at 3 PM at City Hospital. Book vehicle?",
      "action_type": "book_ride",
      "read": false,
      "quick_action_available": true,
      "quick_action_data": {
        "family_member_id": "FM-001",
        "destination": "City Hospital, Hyderabad",
        "scheduled_time": "2026-06-23T15:00:00",
        "round_trip": true
      }
    }
  ]
}
```

#### Mark Notification as Read
```bash
POST /api/family/notifications/{notification_id}/mark-read

# Response
{
  "success": true,
  "notification_id": "NOTIF-001"
}
```

---

### 4. One-Click Quick Actions

#### Book Ride (One-Click)
```bash
POST /api/family/quick-actions/book-ride
Content-Type: application/json

{
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
}

# Response
{
  "success": true,
  "booking_id": "BK-123456",
  "status": "confirmed",
  "message": "Ride booked successfully for Mom",
  "booking_details": {
    "booking_id": "BK-123456",
    "pickup": "Home",
    "destination": "City Hospital, Hyderabad",
    "scheduled_time": "2026-06-23T14:30:00",
    "vehicle_type": "comfort",
    "round_trip": true,
    "estimated_fare": 350.0,
    "confirmation_sent_to": "+91-9876543210"
  }
}
```

#### Get Quick Action Templates
```bash
GET /api/family/quick-actions/templates?family_member_id=FM-001

# Response
{
  "family_member_id": "FM-001",
  "total_templates": 2,
  "templates": [
    {
      "action_id": "QA-001",
      "action_type": "book_ride",
      "description": "Book ride to hospital",
      "preset_data": {
        "destination": "City Hospital, Hyderabad",
        "vehicle_type": "comfort",
        "round_trip": true
      },
      "times_used": 5
    },
    {
      "action_id": "QA-002",
      "action_type": "book_ride",
      "description": "Book ride to salon",
      "preset_data": {
        "destination": "Beauty Plus Salon",
        "vehicle_type": "economy",
        "round_trip": true
      },
      "times_used": 12
    }
  ]
}
```

#### Create Quick Action Template
```bash
POST /api/family/quick-actions/create
Content-Type: application/json

{
  "family_member_id": "FM-001",
  "action_type": "book_ride",
  "description": "Book ride to gym",
  "preset_data": {
    "destination": "Fitness First Gym, Banjara Hills",
    "vehicle_type": "economy",
    "round_trip": true
  },
  "requires_confirmation": true
}

# Response
{
  "success": true,
  "action_id": "QA-003",
  "message": "Quick action template created"
}
```

---

### 5. Dashboard & Analytics

#### Get Family Dashboard
```bash
GET /api/family/dashboard

# Response
{
  "total_family_members": 2,
  "today_appointments": [
    {
      "member_name": "Mom",
      "title": "Doctor's Appointment",
      "time": "2026-06-22T15:00:00",
      "location": "City Hospital",
      "ride_booked": false,
      "priority": "high"
    }
  ],
  "pending_notifications": 3,
  "upcoming_rides_needed": [
    {
      "member_name": "Mom",
      "purpose": "Hospital Visit",
      "time": "2026-06-23T15:00:00",
      "status": "awaiting_booking"
    }
  ],
  "this_week_stats": {
    "total_appointments": 5,
    "rides_booked": 3,
    "rides_completed": 2,
    "emergency_contacts": 2
  }
}
```

#### Get Family Analytics
```bash
GET /api/family/analytics?period=month

# Response
{
  "period": "month",
  "total_rides_booked": 23,
  "total_rides_completed": 21,
  "total_transportation_cost": 5890.0,
  "average_cost_per_ride": 256.0,
  "appointments_attended": 18,
  "most_visited_location": "City Hospital",
  "most_active_member": "Mom",
  "cost_breakdown": {
    "hospital_visits": 2340.0,
    "shopping": 1500.0,
    "social_events": 1050.0,
    "misc": 1000.0
  }
}
```

---

### 6. Calendar Sync

#### Enable Auto Calendar Sync
```bash
POST /api/family/calendar/enable-auto-sync/{member_id}
Content-Type: application/json

{
  "calendar_source": "google",
  "sync_interval_minutes": 15,
  "include_event_types": ["medical", "work"],
  "auto_book_rides": false
}

# Response
{
  "success": true,
  "member_id": "FM-001",
  "message": "Auto calendar sync enabled",
  "configuration": {
    "auto_sync_enabled": true,
    "sync_interval_minutes": 15,
    "calendar_source": "google"
  }
}
```

#### Sync Calendar Now
```bash
POST /api/family/calendar/sync/{member_id}?calendar_source=google

# Response
{
  "success": true,
  "member_id": "FM-001",
  "message": "Calendar sync initiated",
  "status": "syncing"
}
```

#### Get Calendar Sync Status
```bash
GET /api/family/calendar/sync-status/{member_id}

# Response
{
  "member_id": "FM-001",
  "calendar_synced": true,
  "last_sync": "2026-06-22T02:29:55Z",
  "next_sync": "2026-06-22T02:44:55Z",
  "appointments_synced": 12,
  "new_appointments_detected": 2,
  "status": "active"
}
```

---

## Features

### 1. Family Member Profiles
- Add multiple family members with relationships
- Store health conditions and special needs
- Set transportation preferences per member
- Track emergency contacts

### 2. Calendar Integration
- Sync Google Calendar, Outlook, or Apple Calendar
- Auto-detect appointments requiring rides
- Process medical, work, education, and personal events
- Extract location details from calendar events

### 3. Smart Notifications
- Receive alerts before appointments
- One-click ride booking from notifications
- Customizable notification channels (SMS, Email, Push)
- Pre-filled quick actions

### 4. Quick Actions
- Book hospital visits with one click
- Create recurring ride templates
- Pre-fill transportation details
- Execute from notifications or dashboard

### 5. Intelligent Scheduling
- Auto-generate bookings X minutes before appointment
- Calculate optimal pickup times based on distance
- Support round-trip bookings
- Respect preferred vehicle types and features

### 6. Cost Management
- Track family transportation expenses
- Breakdown costs by member and type
- Monthly summaries and trends
- Set budget limits per member

### 7. Real-time Tracking
- View live location during rides
- Share location with family members
- Emergency alert capabilities
- Trip history and records

### 8. Analytics Dashboard
- Appointment attendance tracking
- Ride completion rates
- Most visited locations
- Family member activity patterns
- Transportation cost analysis

---

## Setup & Configuration

### 1. Add Family Members

First, add your family members to the system:

```javascript
// Frontend example (React/Vue)
const addFamilyMember = async (memberData) => {
  const response = await fetch('/api/family/members/add', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: memberData.name,
      relationship: memberData.relationship,
      phone: memberData.phone,
      email: memberData.email,
      age: memberData.age,
      health_conditions: memberData.health_conditions,
      auto_book_rides: memberData.autoBook,
      preferred_vehicle_type: memberData.vehicleType
    })
  });
  return response.json();
};

// Usage
await addFamilyMember({
  name: 'Mom',
  relationship: 'mother',
  phone: '+91-9876543210',
  email: 'mom@example.com',
  age: 65,
  health_conditions: ['hypertension'],
  autoBook: true,
  vehicleType: 'comfort'
});
```

### 2. Connect Calendar

Enable calendar syncing for automatic appointment detection:

```javascript
const enableCalendarSync = async (memberId, calendarSource = 'google') => {
  const response = await fetch(
    `/api/family/calendar/enable-auto-sync/${memberId}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        calendar_source: calendarSource,
        sync_interval_minutes: 15,
        include_event_types: ['medical', 'work'],
        auto_book_rides: true
      })
    }
  );
  return response.json();
};

// Usage
await enableCalendarSync('FM-001', 'google');
```

### 3. Set Up Quick Actions

Pre-configure frequent actions for quick access:

```javascript
const createQuickAction = async (memberId, actionConfig) => {
  const response = await fetch('/api/family/quick-actions/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      family_member_id: memberId,
      action_type: actionConfig.type,
      description: actionConfig.description,
      preset_data: actionConfig.preset,
      requires_confirmation: actionConfig.requiresConfirmation
    })
  });
  return response.json();
};

// Usage: Quick action for hospital visits
await createQuickAction('FM-001', {
  type: 'book_ride',
  description: 'Book ride to City Hospital',
  preset: {
    destination: 'City Hospital, Hyderabad',
    destination_coordinates: { lat: 17.3850, lon: 78.4867 },
    vehicle_type: 'comfort',
    round_trip: true
  },
  requiresConfirmation: true
});
```

---

## Real-World Workflows

### Workflow 1: Automatic Hospital Appointment Booking

```
Step 1: Mom's hospital appointment appears in Google Calendar
Step 2: Family Assistant syncs calendar (every 15 minutes)
Step 3: System detects "Cardiology Appointment" at 3 PM
Step 4: Creates notification: "Mom has doctor appointment tomorrow"
Step 5: You tap "Book vehicle?" quick action
Step 6: System books Comfort ride for 2:30 PM (30 mins before)
Step 7: SMS sent to Mom: "Your ride confirmed for 2:30 PM"
Step 8: Driver arrives, completes pickup
Step 9: You get tracking update with location
Step 10: After appointment, return trip auto-booked if enabled
```

### Workflow 2: Manual Appointment + Quick Booking

```
Step 1: You create appointment in AutoBuddy
  - Member: Mom
  - Time: Thursday 4 PM
  - Location: Shopping Mall
  - Transportation: Yes
Step 2: Notification created with quick actions
Step 3: You click "Book ride"
Step 4: Ride booked with pre-filled details:
  - Pickup: Home
  - Destination: Shopping Mall
  - Time: 3:30 PM (30 mins buffer)
  - Vehicle: Economy
  - Round trip: Yes
Step 5: Mom receives confirmation SMS
```

### Workflow 3: Emergency Contact Alert

```
Step 1: Emergency situation (accident, health issue)
Step 2: Tap "Emergency Alert" quick action
Step 3: System immediately:
  - Notifies all emergency contacts
  - Shares real-time location
  - Calls nearest emergency services
  - Sends SMS with location to family
Step 4: Family members can track and receive updates
```

---

## Best Practices

### 1. Appointment Management
- Add appointments 1-2 days in advance for better planning
- Include accurate location with coordinates for better routing
- Set priority levels (medical = high, shopping = low)
- Enable notifications with 30-60 minute advance warning

### 2. Quick Actions
- Create templates for recurring destinations (hospital, office, school)
- Test quick actions before relying on them in emergencies
- Regularly update preset data to reflect latest preferences
- Include both regular and backup quick actions

### 3. Calendar Syncing
- Keep calendar updated with accurate event details
- Use consistent location naming (e.g., "City Hospital" vs "Hospital")
- Include appointment notes (e.g., "Bring insurance card")
- Set calendar reminders as backup

### 4. Cost Management
- Set reasonable budget limits per family member
- Review weekly transportation costs
- Combine trips when possible (multi-stop rides)
- Use economy vehicles when comfort not needed

### 5. Safety
- Ensure emergency contacts are up-to-date
- Regularly test emergency alert system
- Keep family member phone numbers verified
- Share real-time location with trusted contacts

---

## Database Schema

### Collections

```javascript
// Family Members
db.family_members {
  _id: "FM-001",
  primary_user_id: "USER-123",
  member_name: "Mom",
  relationship: "mother",
  phone_number: "+91-9876543210",
  health_conditions: ["hypertension"],
  auto_book_rides: true,
  preferred_vehicle_type: "comfort",
  calendar_synced: true,
  google_calendar_id: "calendar123@google.com",
  created_at: ISODate("2026-06-22"),
  updated_at: ISODate("2026-06-22")
}

// Family Appointments
db.family_appointments {
  _id: "APT-001",
  family_member_id: "FM-001",
  primary_user_id: "USER-123",
  title: "Hospital Appointment",
  appointment_type: "medical",
  priority: "high",
  start_time: ISODate("2026-06-23T15:00:00"),
  location: "City Hospital",
  transportation_needed: true,
  ride_booked: false,
  created_at: ISODate("2026-06-22")
}

// Family Notifications
db.family_notifications {
  _id: "NOTIF-001",
  primary_user_id: "USER-123",
  family_member_id: "FM-001",
  title: "Hospital Appointment Tomorrow",
  message: "Mom has appointment at 3 PM",
  action_type: "book_ride",
  read: false,
  quick_action_available: true,
  created_at: ISODate("2026-06-22")
}

// Quick Actions
db.family_quick_actions {
  _id: "QA-001",
  family_member_id: "FM-001",
  primary_user_id: "USER-123",
  action_type: "book_ride",
  description: "Book ride to hospital",
  preset_data: {
    destination: "City Hospital",
    vehicle_type: "comfort",
    round_trip: true
  },
  times_used: 5,
  created_at: ISODate("2026-06-22")
}
```

---

## Future Enhancements

- [ ] AI-powered appointment predictions
- [ ] Medication reminders and tracking
- [ ] Family member health metrics integration
- [ ] Multi-language support
- [ ] Advanced scheduling optimization
- [ ] Integration with wearable devices
- [ ] ML-based cost prediction
- [ ] Voice-activated quick actions
- [ ] Integration with health insurance
- [ ] Family group shared calendars

---

## Troubleshooting

### Calendar not syncing
1. Verify Google Calendar credentials are valid
2. Check calendar permissions in Google Account
3. Ensure calendar event has location details
4. Check logs for API errors

### Quick action not working
1. Verify family member phone number is correct
2. Ensure ride booking service is available
3. Check payment method is valid
4. Review ride booking error logs

### Notifications not received
1. Verify notification settings are enabled
2. Check SMS/Email service is active
3. Confirm phone number and email are correct
4. Review notification delivery logs

---

## Support

For issues or feature requests, please contact:
- Email: support@autobuddy.com
- GitHub: https://github.com/mohananpmalavika-dev/AutoBuddy
- Issues: GitHub Issues

---

## License

This feature is part of AutoBuddy and follows the same license terms.
