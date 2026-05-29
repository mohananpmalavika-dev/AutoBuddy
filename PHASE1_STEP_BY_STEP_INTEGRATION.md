# Phase 1 Integration - Step-by-Step Instructions

**Time to Complete**: 15 minutes for integration + 1-2 hours for testing  
**Difficulty**: Easy (copy-paste + restart server)  
**Prerequisites**: Stripe API keys obtained from https://dashboard.stripe.com

---

## Step 1: Obtain Stripe API Keys (5 minutes)

### Get Secret Key
1. Go to https://dashboard.stripe.com/apikeys
2. Look for "Secret key" (starts with `sk_live_` or `sk_test_`)
3. Click "Reveal test key" if in test mode
4. Copy the entire key

### Get Publishable Key
1. Same page as above
2. Look for "Publishable key" (starts with `pk_live_` or `pk_test_`)
3. Copy the entire key

### Get Webhook Secret
1. Go to https://dashboard.stripe.com/webhooks
2. Click "Add an endpoint"
3. Enter URL: `https://yourdomain.com/payments/webhooks/stripe`
   - In development: `http://localhost:8000/payments/webhooks/stripe`
4. Select events to listen to:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payment_intent.canceled`
5. Click "Add endpoint"
6. Click the newly created endpoint
7. Under "Signing secret", click "Reveal"
8. Copy the entire signing secret (starts with `whsec_`)

---

## Step 2: Set Environment Variables (2 minutes)

### Create/Update `.env` File

**Location**: Root of project directory (same level as `backend/`, `autobuddy-mobile/`, `docs/`)

**Content**:
```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_yourkeyherexxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_live_yourkeyherexxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_yourweebhooksecrethere

# Optional: Other configuration
MONGODB_URI=mongodb://localhost:27017/autobuddy
ENVIRONMENT=development
```

**Save the file** (Ctrl+S or Cmd+S)

---

## Step 3: Update server.py - Add Imports (3 minutes)

**File**: `backend/server.py`

**Find**: Top of file (around line 1-50), look for other imports like:
```python
from fastapi import FastAPI, HTTPException, ...
```

**Add these lines** (after existing imports):
```python
from app.routers import bookings_core, payments, driver_operations
```

**Complete import section will look like:**
```python
from fastapi import FastAPI, HTTPException, ...
from app.routers import bookings_core, payments, driver_operations  # <- NEW LINE
```

---

## Step 4: Register Routers with FastAPI (2 minutes)

**File**: `backend/server.py`

**Find**: Where routers are currently registered. Search for:
```
app.include_router
```

**Look for a section** that looks like:
```python
# Include routers
app.include_router(some_existing_router)
# or similar
```

**Add these three lines** in that section:
```python
app.include_router(bookings_core.router)
app.include_router(payments.router)
app.include_router(driver_operations.router)
```

**If no router registration section exists**, find where the app is created:
```python
app = FastAPI(...)
```

**Add this block right after**:
```python
# Register new routers
app.include_router(bookings_core.router)
app.include_router(payments.router)
app.include_router(driver_operations.router)
```

---

## Step 5: Inject Dependencies (2 minutes)

**File**: `backend/server.py`

**Find**: Right after the router registration (from Step 4), add:
```python
# Inject dependencies for routers
bookings_core.set_dependencies(db, sio)
payments.set_dependencies(db)
driver_operations.set_dependencies(db, sio)
```

**Note**: `db` and `sio` must already exist in server.py. Search for them to verify:
- `db =` (MongoDB database object)
- `sio =` (Socket.IO instance)

If you can't find them, ask in your team - they're core to the existing server.

---

## Step 6: Restart Server (2 minutes)

**In Terminal**:
```bash
cd backend
python server.py
```

**Expected Output**:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
```

**If you see errors**:
1. Check that imports are correct (Step 3)
2. Verify router paths exist: `backend/app/routers/bookings_core.py`, etc.
3. Check `.env` file is in correct location
4. Verify `db` and `sio` variables exist and are passed correctly

---

## Step 7: Test the Integration (10-15 minutes)

### Test 1: Availability Toggle

**Open Terminal/Postman**:
```bash
curl -X POST http://localhost:8000/drivers/availability/toggle \
  -H "Authorization: Bearer test_driver_token" \
  -H "Content-Type: application/json" \
  -d '{"available": true}'
```

**Expected Response**:
```json
{
  "status": "success",
  "message": "Driver is now online",
  "driver_id": "...",
  "is_available": true,
  "updated_at": "2024-01-15T10:30:45.123456"
}
```

**If you get 401**: The token is invalid. Use a valid driver auth token from your database.

---

### Test 2: Accept Ride

**Prerequisites**: You need a valid booking ID from your database

```bash
curl -X POST http://localhost:8000/bookings/your_booking_id/accept \
  -H "Authorization: Bearer test_driver_token"
```

**Expected Response**:
```json
{
  "status": "success",
  "message": "Ride accepted successfully",
  "booking_id": "...",
  "driver_name": "John Doe",
  "eta_to_pickup": 5
}
```

---

### Test 3: Create Payment Intent

**Prerequisites**: Valid booking ID with passenger

```bash
curl -X POST http://localhost:8000/payments/stripe/intent \
  -H "Content-Type: application/json" \
  -d '{
    "booking_id": "your_booking_id",
    "amount": 250.00,
    "payment_method_type": "card"
  }'
```

**Expected Response**:
```json
{
  "status": "success",
  "payment_intent_id": "pi_...",
  "client_secret": "pi_..._secret_...",
  "amount": 250.0,
  "currency": "INR",
  "publishable_key": "pk_..."
}
```

**If STRIPE_SECRET_KEY not set**: You'll get error 500 - "Stripe not configured"

---

### Test 4: Get Driver Status

```bash
curl -X GET http://localhost:8000/drivers/status \
  -H "Authorization: Bearer test_driver_token"
```

**Expected Response**:
```json
{
  "driver_id": "...",
  "name": "John Doe",
  "is_available": true,
  "current_location": {"latitude": 28.123, "longitude": 77.456},
  "rating": 4.8,
  "total_rides": 125,
  "acceptance_rate": 95.5
}
```

---

## Troubleshooting

### Error: "No module named 'app.routers'"
**Cause**: Router files don't exist or are in wrong location  
**Fix**: Verify files exist at:
- `backend/app/routers/bookings_core.py`
- `backend/app/routers/payments.py`
- `backend/app/routers/driver_operations.py`

### Error: "db or sio not defined"
**Cause**: Dependencies not injected correctly  
**Fix**: Make sure `set_dependencies()` is called after router registration

### Error: "Stripe not configured" (500)
**Cause**: `STRIPE_SECRET_KEY` environment variable not set  
**Fix**: 
1. Verify `.env` file exists in root directory
2. Verify it contains `STRIPE_SECRET_KEY=sk_live_...`
3. Restart server after updating .env

### Error: "Invalid token format" (401)
**Cause**: Authorization header format incorrect  
**Fix**: Use format: `Authorization: Bearer your_token_here`

### Error: "Booking not found" (404)
**Cause**: Booking ID doesn't exist in database  
**Fix**: Use a valid booking ID from your MongoDB

---

## Verification Checklist

After integration, verify:

- [ ] Server starts without errors
- [ ] Availability toggle endpoint returns 200 OK
- [ ] Accept ride endpoint returns 200 OK
- [ ] Payment intent creation returns 200 OK with client_secret
- [ ] Get driver status returns 200 OK
- [ ] Database shows updated values (check MongoDB directly)
- [ ] Socket.IO events are emitted (check server logs)

---

## Next Steps

Once integration is complete and all tests pass:

1. **Integration Testing Phase** (2-4 hours)
   - Test full ride workflow (accept → start → complete)
   - Test payment flow end-to-end
   - Test location updates via Socket.IO
   - Test edge cases (expired offers, concurrent accepts, etc.)

2. **Staging Deployment** (30 minutes)
   - Push code to staging environment
   - Update Stripe webhook URL for staging
   - Run full test suite in staging

3. **Production Deployment** (30 minutes)
   - Update production environment variables
   - Configure production Stripe keys
   - Deploy to production
   - Monitor for errors

4. **Begin Phase 2** (Week 3)
   - Refactor monolithic server.py
   - Implement smart dispatch algorithm
   - Add rating/review system

---

## Questions or Issues?

If you run into issues:

1. **Check the server logs** - Most errors are logged with full context
2. **Verify environment variables** - Use `echo $STRIPE_SECRET_KEY` in terminal
3. **Test database connectivity** - Make sure MongoDB is running
4. **Review code comments** - Each router has detailed docstrings
5. **Reference the IMPLEMENTATION_CODE_SNIPPETS.md** - Contains full working examples

---

**Last Updated**: Current Session  
**Status**: Ready to Implement  
**Estimated Time to Complete**: 15 min integration + 2-4 hours testing = **~5 hours total**  
**Team Size**: 1 backend engineer (can do integration), 1 QA engineer (can do testing)
