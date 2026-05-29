# Phase 1: Router Integration Guide

**Status**: 3 routers created and ready for integration  
**Time Estimate**: 1-2 hours for integration + testing  
**Date**: Current Session  

---

## ✅ Completed Routers

### 1. **bookings_core.py** (350+ lines)
**Location**: `backend/app/routers/bookings_core.py`  
**Purpose**: Core ride workflow  
**Endpoints**:
- `POST /bookings/{booking_id}/accept` - Driver accepts ride, auto-reassign to others
- `POST /bookings/{booking_id}/decline` - Decline accepted ride  
- `POST /bookings/{booking_id}/start` - Mark ride in progress
- `POST /bookings/{booking_id}/complete` - Complete ride, calculate fare, create payment record

**Features**:
- 30-minute acceptance deadline
- Automatic driver reassignment on decline
- Fare calculation with breakdown (base + distance + time + surge + tax)
- Receipt generation
- Real-time Socket.IO emissions

---

### 2. **payments.py** (400+ lines)
**Location**: `backend/app/routers/payments.py`  
**Purpose**: Stripe payment integration  
**Endpoints**:
- `POST /payments/stripe/intent` - Create PaymentIntent (returns client_secret)
- `POST /payments/stripe/confirm` - Confirm payment after authentication
- `POST /payments/webhooks/stripe` - Stripe webhook (configure in Stripe Dashboard!)
- `GET /payments/status/{payment_id}` - Check payment status
- `POST /payments/wallet/charge` - Charge wallet balance (fallback)

**Webhook Handlers**:
- `payment_intent.succeeded` → Update payment & booking
- `payment_intent.payment_failed` → Log failure
- `payment_intent.canceled` → Handle cancellation

---

### 3. **driver_operations.py** (350+ lines)
**Location**: `backend/app/routers/driver_operations.py`  
**Purpose**: Driver status and availability management  
**Endpoints**:
- `POST /drivers/availability/toggle` - Go online/offline
- `GET /drivers/status` - Current driver status
- `POST /drivers/location/update` - Update location (broadcasts to passenger)
- `GET /drivers/nearby-requests` - Show available rides to driver
- `POST /drivers/accept-request/{booking_id}` - Accept ride shorthand
- `POST /drivers/decline-request/{booking_id}` - Decline ride shorthand
- `GET /drivers/stats` - Driver performance stats

**Features**:
- Real-time availability broadcasting
- Location update with passenger notification
- Request expiry handling (5-minute offers)
- Stats aggregation (earnings, completion rate)

---

## 🔧 Integration Steps

### Step 1: Add Imports to `backend/server.py`

**Find**: Top of server.py (around line 1-50)

**Add after other router imports**:
```python
from app.routers import bookings_core, payments, driver_operations
```

---

### Step 2: Register Routers with FastAPI

**Find**: Where `app.include_router()` is called (search for "include_router")

**Add**:
```python
# Register routers
app.include_router(bookings_core.router)
app.include_router(payments.router)
app.include_router(driver_operations.router)
```

---

### Step 3: Inject Dependencies

**Find**: After routers are registered (same location as Step 2)

**Add**:
```python
# Inject database and Socket.IO dependencies
bookings_core.set_dependencies(db, sio)
payments.set_dependencies(db)
driver_operations.set_dependencies(db, sio)
```

**Note**: `db` and `sio` are the database and Socket.IO objects already in server.py

---

## ⚙️ Configuration Required

### Environment Variables

Create/update `.env` in project root:

```bash
# Stripe Configuration (CRITICAL)
STRIPE_SECRET_KEY=sk_live_your_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_live_your_publishable_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

**Get These From**:
1. Go to https://dashboard.stripe.com/apikeys
2. Copy "Secret key" → STRIPE_SECRET_KEY
3. Copy "Publishable key" → STRIPE_PUBLISHABLE_KEY
4. For webhook secret:
   - Go to https://dashboard.stripe.com/webhooks
   - Create new endpoint with URL: `https://yourdomain.com/payments/webhooks/stripe`
   - Select events: `payment_intent.succeeded`, `payment_intent.payment_failed`, `payment_intent.canceled`
   - Copy signing secret → STRIPE_WEBHOOK_SECRET

---

## 🧪 Testing Phase

### Test 1: Availability Toggle
```bash
curl -X POST http://localhost:8000/drivers/availability/toggle \
  -H "Authorization: Bearer your_driver_token" \
  -H "Content-Type: application/json" \
  -d '{"available": true}'
```

**Expected**: Driver status updates, broadcasts to admin dashboard

---

### Test 2: Accept Ride
```bash
curl -X POST http://localhost:8000/bookings/{booking_id}/accept \
  -H "Authorization: Bearer your_driver_token"
```

**Expected**: 
- Ride status → "accepted"
- Other drivers' offers → canceled
- Passenger notified via Socket.IO
- Database updated

---

### Test 3: Payment Intent Creation
```bash
curl -X POST http://localhost:8000/payments/stripe/intent \
  -H "Content-Type: application/json" \
  -d '{
    "booking_id": "your_booking_id",
    "amount": 250.50,
    "payment_method_type": "card"
  }'
```

**Expected**:
```json
{
  "status": "success",
  "payment_intent_id": "pi_...",
  "client_secret": "pi_..._secret_...",
  "publishable_key": "pk_..."
}
```

---

### Test 4: Complete Ride
```bash
curl -X POST http://localhost:8000/bookings/{booking_id}/complete \
  -H "Authorization: Bearer your_driver_token"
```

**Expected**:
- Fare calculated
- Payment record created
- Receipt generated
- Booking marked complete
- Socket.IO notification to passenger

---

## 📋 Checklist

- [ ] Imports added to server.py
- [ ] Routers registered with `app.include_router()`
- [ ] Dependencies injected with `set_dependencies()`
- [ ] Environment variables set (especially Stripe keys!)
- [ ] Stripe webhook URL configured in Dashboard
- [ ] Server restarts without errors
- [ ] Test accept/decline workflow
- [ ] Test location updates via Socket.IO
- [ ] Test payment intent creation
- [ ] Test availability toggle
- [ ] Check database updates
- [ ] Verify Socket.IO room emissions work correctly
- [ ] Integration test suite passes

---

## 🚀 Next Steps After Integration

1. **Week 1, Day 2-5**: Full integration testing
2. **Week 2**: Bug fixes and optimization
3. **Phase 2** (Weeks 3-4): Refactor monolithic server.py
4. **Phase 3** (Weeks 5-6): Add remaining features (smart dispatch, ratings, etc.)
5. **Phase 4** (Weeks 7-8): Final testing and launch

---

## ⚠️ Important Notes

### Token Format
All endpoints require Bearer token in Authorization header:
```
Authorization: Bearer your_jwt_token_here
```

### Socket.IO Rooms
- Passenger updates broadcast to: `passenger_{passenger_id}`
- Admin updates broadcast to: `admin_dashboard`
- Ride-specific rooms: `ride_{booking_id}`

### Database Assumptions
- Collection: `bookings` (with `_id`, `passenger_id`, `accepted_driver_id`, etc.)
- Collection: `drivers` (with `_id`, `auth_token`, `is_available`, `current_location`, etc.)
- Collection: `payments` (for payment records)
- Collection: `ride_offers` (for dispatch logic)

### Stripe Integration
- Payment amounts are in INR (Indian Rupees)
- Amounts are converted to paise (100 paise = 1 rupee) for Stripe
- Webhook signature verification is mandatory for security

---

## 🔗 Related Documents

- `IMPLEMENTATION_CODE_SNIPPETS.md` - Full code examples with explanations
- `QUICK_FIX_PRIORITY_LIST.md` - Prioritized implementation tasks
- `PROJECT_AUDIT_REPORT.md` - Technical details of missing features
- `IMPLEMENTATION_CHECKLIST.md` - Week-by-week project tracker

---

**Last Updated**: Current Session  
**Status**: Ready for Integration  
**Estimated Completion**: 1-2 hours to integrate + 2-4 hours to test
