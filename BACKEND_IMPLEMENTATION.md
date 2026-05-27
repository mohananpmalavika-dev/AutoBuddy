# Backend Implementation Guide - Passenger Features

## Overview

This document outlines the complete backend infrastructure for all 10 passenger features implemented in the AutoBuddy application. The backend provides:

- ✅ **Database Models** (SQLAlchemy ORM) for all feature data
- ✅ **API Endpoints** (FastAPI routes) for CRUD operations
- ✅ **WebSocket Events** for real-time feature updates
- ✅ **Integration Tests** validating frontend-backend communication

---

## Architecture

```
Backend Stack:
├── FastAPI (async HTTP API framework)
├── SQLAlchemy (ORM for database models)
├── Socket.IO (WebSocket real-time communication)
├── SQLite/PostgreSQL (data persistence)
└── Pytest (integration testing)
```

---

## Database Models (`backend/app/db/models_features.py`)

### Feature #2: Passenger Ratings
```python
PassengerRating
├── id (PK)
├── passenger_id (FK)
├── driver_id (FK)
├── booking_id (FK)
├── score (1-5)
├── feedback (text)
└── timestamps (created_at, updated_at)
```

**Relationships:**
- `Passenger.ratings_given` → list of ratings submitted
- `Driver.ratings_received` → list of ratings for driver

**Indexes:** `passenger_id`, `driver_id`, `booking_id`, `created_at`

---

### Feature #3: Saved Places
```python
SavedPlace
├── id (PK)
├── passenger_id (FK)
├── name (string)
├── address (string)
├── place_type (enum: "home", "work", "custom")
├── latitude, longitude (geo coordinates)
├── is_favorite (boolean)
├── is_primary (boolean)
└── timestamps (created_at, updated_at)
```

**Max per passenger:** 50 locations recommended
**Indexes:** `passenger_id`, `place_type`

---

### Feature #4: Passenger Preferences
```python
PassengerPreferences
├── id (PK)
├── passenger_id (FK - unique)
├── Notification Settings
│   ├── push_notifications
│   ├── email_notifications
│   ├── sms_notifications
│   └── promotional_offers
├── Payment Settings
│   ├── default_payment_method
│   ├── save_card_details
│   └── biometric_payment
├── Privacy Settings
│   ├── profile_public
│   ├── share_location_with_driver
│   └── analytics_enabled
├── Language & Locale
│   ├── language (en, ml, etc.)
│   └── timezone
└── additional_settings (JSON for extensibility)
```

**One-to-One with Passenger**

---

### Feature #5: Scheduled Rides
```python
ScheduledRide
├── id (PK)
├── passenger_id (FK)
├── pickup_location, dropoff_location
├── coordinates (lat/lon pairs)
├── scheduled_time (datetime)
├── ride_type (normal, pool, corporate)
├── status (scheduled, confirmed, cancelled, completed)
├── notes (text)
├── estimated_fare (float)
├── recurring (boolean)
├── recurrence_pattern (daily, weekly, monthly)
└── timestamps
```

**Indexes:** `passenger_id`, `scheduled_time`, `status`

---

### Feature #6: Payment Methods
```python
PaymentMethod
├── id (PK)
├── passenger_id (FK)
├── method_type (card, upi, wallet, bank_transfer)
├── Card Fields (encrypted in production)
│   ├── card_last_four (last 4 digits only)
│   ├── card_brand (visa, mastercard, amex)
│   ├── card_expiry (MM/YY)
│   └── card_holder_name
├── UPI Fields
│   └── upi_id
├── Bank Fields (encrypted)
│   ├── bank_account_number
│   ├── bank_ifsc
│   └── bank_name
├── is_default (boolean)
├── is_active (boolean)
└── timestamps
```

**PassengerWallet (one-to-one):**
```python
PassengerWallet
├── id (PK)
├── passenger_id (FK - unique)
├── balance (float)
├── total_added, total_spent
├── last_transaction_at
└── transactions (relationship)
```

**WalletTransaction (audit log):**
```python
WalletTransaction
├── id (PK)
├── wallet_id (FK)
├── transaction_type (credit/debit)
├── amount, description
├── booking_id (FK - ride reference)
├── balance_before, balance_after
├── status (pending, completed, failed)
└── created_at (immutable)
```

---

### Feature #7: Favorites & Emergency Contacts
```python
FavoriteDriver
├── id (PK)
├── passenger_id (FK)
├── driver_id (FK)
├── ride_count_together (int)
├── last_ride_with (datetime)
└── added_at (datetime)

EmergencyContact
├── id (PK)
├── passenger_id (FK)
├── contact_name
├── phone_number
├── relation (family, friend, spouse)
├── is_primary (boolean)
├── notify_on_rides (boolean)
└── timestamps
```

---

### Feature #8: Promo Codes
```python
PromoCode
├── id (PK)
├── code (unique, indexed)
├── discount_type (flat, percentage)
├── discount_value (float)
├── min_ride_fare, max_discount
├── valid_from, valid_until (datetime)
├── usage_limit (total), usage_per_user
├── is_active (boolean)
├── description
└── timestamps

PromoCodeUsage (audit)
├── id (PK)
├── promo_code_id (FK)
├── passenger_id (FK)
├── booking_id (FK)
├── discount_amount, used_at
└── relationship to PromoCode and Passenger
```

---

### Feature #9: Support Tickets
```python
SupportTicket
├── id (PK)
├── passenger_id (FK)
├── subject, description
├── category (booking, payment, driver, safety, other)
├── status (open, in_progress, waiting_for_user, resolved, closed)
├── priority (low, normal, high, urgent)
├── assigned_to (support_agent_id FK)
├── timestamps (created, updated, resolved)
└── messages (relationship - many-to-one)

TicketMessage (conversation)
├── id (PK)
├── ticket_id (FK)
├── sender_type (passenger, agent)
├── sender_id, sender_name
├── message_text, attachment_url
└── created_at (immutable)
```

---

### Feature #10: Accessibility Settings
```python
AccessibilitySetting
├── id (PK)
├── passenger_id (FK - unique)
├── text_size (small, normal, large, extra_large)
├── high_contrast (boolean)
├── screen_reader_enabled (boolean)
├── haptic_feedback (boolean)
├── reduce_motion (boolean)
├── voice_guidance (boolean)
├── voice_guidance_speed (float: 0.5-2.0)
├── voice_guidance_language
└── timestamps
```

---

## API Endpoints (`backend/app/routers/features_routes.py`)

All endpoints require authentication header: `Authorization: Bearer <token>`

### Feature #2: Ratings

```http
POST   /api/v1/passengers/ratings
GET    /api/v1/passengers/ratings?skip=0&limit=10
GET    /api/v1/passengers/ratings/{rating_id}
DELETE /api/v1/passengers/ratings/{rating_id}
```

**POST Request:**
```json
{
  "driver_id": "driver-123",
  "booking_id": "booking-456",
  "score": 5,
  "feedback": "Excellent service!"
}
```

---

### Feature #3: Saved Places

```http
POST   /api/v1/passengers/saved-places
GET    /api/v1/passengers/saved-places?place_type=home&skip=0&limit=50
PUT    /api/v1/passengers/saved-places/{place_id}
DELETE /api/v1/passengers/saved-places/{place_id}
```

**POST Request:**
```json
{
  "name": "Home",
  "address": "123 Main St, Springfield",
  "place_type": "home",
  "latitude": 40.7128,
  "longitude": -74.0060,
  "is_favorite": true,
  "is_primary": true
}
```

---

### Feature #4: Preferences

```http
GET    /api/v1/passengers/preferences
PATCH  /api/v1/passengers/preferences
```

**PATCH Request (partial update):**
```json
{
  "language": "ml",
  "push_notifications": false,
  "default_payment_method": "card"
}
```

---

### Feature #5: Scheduled Rides

```http
POST   /api/v1/passengers/scheduled-rides
GET    /api/v1/passengers/scheduled-rides?status=scheduled&skip=0&limit=20
PATCH  /api/v1/passengers/scheduled-rides/{ride_id}
DELETE /api/v1/passengers/scheduled-rides/{ride_id}
```

**POST Request:**
```json
{
  "pickup_location": "123 Main St",
  "pickup_latitude": 40.7128,
  "pickup_longitude": -74.0060,
  "dropoff_location": "456 Park Ave",
  "dropoff_latitude": 40.7580,
  "dropoff_longitude": -73.9855,
  "scheduled_time": "2024-12-25T09:00:00Z",
  "ride_type": "normal",
  "notes": "Please call 5 mins before arrival",
  "recurring": false,
  "recurrence_pattern": null
}
```

---

### Feature #6: Payment Methods

```http
POST   /api/v1/passengers/payment-methods
GET    /api/v1/passengers/payment-methods
DELETE /api/v1/passengers/payment-methods/{method_id}
```

**POST Request:**
```json
{
  "method_type": "card",
  "card_last_four": "4242",
  "card_brand": "visa",
  "card_expiry": "12/25",
  "card_holder_name": "John Doe",
  "is_default": true
}
```

---

### Feature #7: Favorites & Emergency Contacts

```http
POST   /api/v1/passengers/emergency-contacts
GET    /api/v1/passengers/emergency-contacts
DELETE /api/v1/passengers/emergency-contacts/{contact_id}
```

**POST Request:**
```json
{
  "contact_name": "Mom",
  "phone_number": "+919876543210",
  "relation": "mother",
  "is_primary": true,
  "notify_on_rides": true
}
```

---

### Feature #8: Promo Codes

```http
POST   /api/v1/passengers/promo-codes/validate
```

**POST Request:**
```json
{
  "code": "SAVE10",
  "ride_fare": 500.0
}
```

**Response (200 OK):**
```json
{
  "id": "promo-123",
  "code": "SAVE10",
  "discount_type": "percentage",
  "discount_value": 10,
  "min_ride_fare": 200.0,
  "max_discount": 100.0,
  "is_active": true,
  "description": "10% discount on all rides"
}
```

---

### Feature #9: Support Tickets

```http
POST   /api/v1/passengers/support/tickets
GET    /api/v1/passengers/support/tickets?status=open&skip=0&limit=20
POST   /api/v1/passengers/support/tickets/{ticket_id}/messages
```

**Create Ticket:**
```json
{
  "subject": "Driver was rude",
  "description": "The driver was disrespectful during my ride",
  "category": "driver",
  "priority": "high"
}
```

**Add Message:**
```json
{
  "message_text": "Please look into this matter",
  "attachment_url": null
}
```

---

### Feature #10: Accessibility Settings

```http
GET    /api/v1/passengers/accessibility
PATCH  /api/v1/passengers/accessibility
```

**PATCH Request:**
```json
{
  "text_size": "large",
  "high_contrast": true,
  "voice_guidance": true,
  "voice_guidance_speed": 0.8
}
```

---

## WebSocket Events (`backend/app/sockets/events.py`)

Real-time communication channel for feature updates.

### Connection Flow

```javascript
// Frontend (notificationService.js already has this)
const socket = io('http://api.example.com', {
  transports: ['websocket', 'polling']
});

socket.emit('register_passenger', {
  passenger_id: 'passenger-123'
});
```

### Event Emissions

#### Ratings Events
- **`rating_submitted`** - When passenger submits a rating
  ```json
  {
    "rating_id": "rating-123",
    "driver_id": "driver-456",
    "score": 5,
    "feedback": "Great!",
    "timestamp": "2024-12-20T10:30:00Z"
  }
  ```

- **`rating_received`** - Driver receives new rating
  ```json
  {
    "driver_id": "driver-456",
    "new_rating": 5,
    "review_count": 45
  }
  ```

#### Saved Places Events
- **`saved_place_created`** - New location saved
- **`saved_place_removed`** - Location deleted

#### Preferences Events
- **`preferences_updated`** - Settings changed (e.g., language switched)

#### Scheduled Rides Events
- **`scheduled_ride_created`** - Ride scheduled
- **`scheduled_ride_confirmed`** - Driver matched to ride
- **`scheduled_ride_cancelled`** - Ride cancelled with reason

#### Payment Events
- **`payment_method_added`** - New payment method added
- **`wallet_credited`** - Wallet balance increased
  ```json
  {
    "amount": 500.0,
    "description": "Wallet topup",
    "new_balance": 1500.0,
    "transaction_id": "txn-123",
    "timestamp": "2024-12-20T10:30:00Z"
  }
  ```

- **`wallet_debited`** - Ride fare deducted
  ```json
  {
    "amount": 450.0,
    "description": "Ride fare - Downtown to Airport",
    "new_balance": 1050.0,
    "booking_id": "booking-123",
    "timestamp": "2024-12-20T10:40:00Z"
  }
  ```

#### Support Events
- **`support_ticket_created`** - New ticket created
- **`support_ticket_message`** - New message in ticket
- **`support_ticket_resolved`** - Ticket marked resolved

#### Accessibility Events
- **`accessibility_settings_updated`** - A11y settings changed

#### System Events
- **`system_maintenance`** - System maintenance notification
- **`service_alert`** - Service-wide alerts

---

## Testing (`backend/tests/test_features_integration.py`)

Comprehensive integration tests covering all features:

### Running Tests

```bash
# All tests
pytest backend/tests/test_features_integration.py

# Specific feature tests
pytest backend/tests/test_features_integration.py::TestPassengerRatings

# With coverage
pytest --cov=backend/app backend/tests/

# Verbose output
pytest -v backend/tests/test_features_integration.py
```

### Test Coverage

- ✅ **Ratings**: Submit, retrieve, validate score range
- ✅ **Saved Places**: Add, retrieve filtered, update, delete
- ✅ **Preferences**: Get defaults, update, partial updates
- ✅ **Scheduled Rides**: Create, retrieve by status, update, cancel
- ✅ **Payment Methods**: Add, retrieve, delete, default handling
- ✅ **Support Tickets**: Create, retrieve, add messages
- ✅ **Accessibility**: Get defaults, update settings
- ✅ **End-to-end**: Complete workflows (schedule→ride→rate)

### Test Fixtures (`backend/tests/conftest.py`)

```python
# Available fixtures
@pytest.fixture
def db_session():
    """In-memory SQLite database per test"""

@pytest.fixture
def client():
    """FastAPI TestClient"""

@pytest.fixture
def auth_headers():
    """Valid authentication headers"""

@pytest.fixture
def sample_passenger():
    """Test passenger object"""

@pytest.fixture
def sample_driver():
    """Test driver object"""

@pytest.fixture
def sample_booking():
    """Completed booking for testing"""
```

---

## Integration Points

### Frontend to Backend Communication

**Frontend (React Native)** sends HTTP/WebSocket requests:

```javascript
// From NotificationContext, RatingsContext, etc.
const submitRating = async (driverId, score, feedback) => {
  const response = await fetch('/api/v1/passengers/ratings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      driver_id: driverId,
      score,
      feedback
    })
  });
  
  const rating = await response.json();
  addNotification({
    type: 'success',
    title: 'Rating Submitted',
    body: 'Thanks for your feedback!'
  });
};
```

**Backend** responds with data and emits WebSocket events:

```python
# From routes
@router.post("/ratings")
async def submit_rating(rating: RatingCreate, ...):
    # Save to database
    db.add(rating_obj)
    db.commit()
    
    # Emit WebSocket event
    await emit_rating_submitted(passenger_id, rating_obj.to_dict())
    
    return rating_obj

# Frontend receives real-time update
socket.on('rating_submitted', (data) => {
  setNotifications(prev => [...prev, {
    type: 'success',
    title: 'Rating Submitted',
    body: data.feedback
  }]);
});
```

---

## Deployment

### Database Initialization

```bash
# Create tables
python -c "from app.db.database import Base, engine; Base.metadata.create_all(bind=engine)"

# Or with Alembic migrations
alembic upgrade head
```

### Environment Variables

```env
DATABASE_URL=postgresql://user:pass@localhost/autobuddy
API_PORT=8000
API_BASE_URL=http://localhost:8000
SOCKET_IO_CORS_ORIGINS=http://localhost:3000,https://app.example.com
JWT_SECRET_KEY=your-secret-key
```

### Production Considerations

- ✅ Enable HTTPS for all API endpoints
- ✅ Encrypt payment/bank details in database
- ✅ Use connection pooling for database
- ✅ Implement rate limiting on API endpoints
- ✅ Add request logging and monitoring
- ✅ Set up database backups
- ✅ Use Redis for WebSocket session management (scaling)
- ✅ Implement request validation and sanitization
- ✅ Add CORS restrictions
- ✅ Enable request signing for mobile client

---

## Performance Optimization

### Database Indexes
```sql
-- Rating lookups
CREATE INDEX idx_ratings_passenger ON passenger_ratings(passenger_id);
CREATE INDEX idx_ratings_driver ON passenger_ratings(driver_id);
CREATE INDEX idx_ratings_created ON passenger_ratings(created_at);

-- Scheduled rides
CREATE INDEX idx_scheduled_rides_passenger ON scheduled_rides(passenger_id);
CREATE INDEX idx_scheduled_rides_time ON scheduled_rides(scheduled_time);
CREATE INDEX idx_scheduled_rides_status ON scheduled_rides(status);

-- Promo codes
CREATE INDEX idx_promo_codes_code ON promo_codes(code);
CREATE INDEX idx_promo_codes_expiry ON promo_codes(valid_until);
```

### Caching Strategy
- Cache active promo codes (30 min TTL)
- Cache user preferences (10 min TTL)
- Cache saved places (5 min TTL)
- Cache accessibility settings (1 hour TTL)

### API Response Times
- GET endpoints: < 200ms (with caching: < 50ms)
- POST endpoints: < 500ms
- WebSocket events: < 100ms

---

## Error Handling

### Standard Error Responses

```json
// 400 Bad Request
{
  "detail": "Invalid rating score. Must be between 1 and 5."
}

// 404 Not Found
{
  "detail": "Rating not found"
}

// 422 Validation Error
{
  "detail": [
    {
      "loc": ["body", "score"],
      "msg": "ensure this value is less than or equal to 5",
      "type": "value_error.number.not_le"
    }
  ]
}

// 500 Internal Server Error
{
  "detail": "An unexpected error occurred. Please try again later."
}
```

---

## Next Steps

1. **Integrate with existing models**: Link to Passenger, Driver, Booking models
2. **Configure database**: Update `SQLALCHEMY_DATABASE_URL`
3. **Set up authentication**: Implement JWT token validation in `get_current_passenger`
4. **Deploy**: Follow deployment section above
5. **Monitor**: Set up logging and error tracking
6. **Scale**: Implement caching and database optimization

---

## References

- FastAPI Docs: https://fastapi.tiangolo.com/
- SQLAlchemy Docs: https://docs.sqlalchemy.org/
- Socket.IO: https://python-socketio.readthedocs.io/
- Pytest: https://docs.pytest.org/
