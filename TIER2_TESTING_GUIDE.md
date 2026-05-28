# TIER 2 Testing Guide

Complete testing procedures for all TIER 2 features with cURL commands, expected responses, and scenario walkthroughs.

---

## 📋 Test Environment Setup

### Prerequisites
- AutoBuddy backend running: `python start_dev.py`
- PostgreSQL database with TIER 2 migration executed: `python backend/app/db/migration_tier2.py`
- Valid JWT token for authenticated requests
- Postman or cURL for API testing

### Test Database Reset
```bash
# Reset TIER 2 tables (if needed)
psql -U autobuddy_user -d autobuddy_db -c "
TRUNCATE TABLE ride_filter_preferences CASCADE;
TRUNCATE TABLE vehicle_maintenance CASCADE;
TRUNCATE TABLE vehicle_document_expiry CASCADE;
TRUNCATE TABLE earning_target CASCADE;
TRUNCATE TABLE driver_payment_method CASCADE;
TRUNCATE TABLE payout_schedule_config CASCADE;
TRUNCATE TABLE payout_history CASCADE;
"
```

---

## 🎯 FEATURE 1: Ride Filters (Auto-Decline)

### Test 1.1: Set Ride Filter Preferences
```bash
curl -X POST http://localhost:8000/api/drivers-tier2/ride-filters \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "max_pickup_distance_km": 15,
    "min_passenger_rating": 4.0,
    "auto_decline_enabled": true,
    "blocked_areas": ["Downtown", "Industrial Zone"]
  }'
```

**Expected Response (201):**
```json
{
  "id": 1,
  "driver_id": "driver_123",
  "max_pickup_distance_km": 15,
  "min_passenger_rating": 4.0,
  "auto_decline_enabled": true,
  "blocked_areas": ["Downtown", "Industrial Zone"],
  "allowed_areas": null,
  "time_slot_restrictions": null,
  "created_at": "2024-05-29T09:30:00+05:30",
  "updated_at": "2024-05-29T09:30:00+05:30"
}
```

### Test 1.2: Get Current Ride Filters
```bash
curl -X GET http://localhost:8000/api/drivers-tier2/ride-filters \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response (200):**
Same structure as above

### Test 1.3: Update Ride Filters
```bash
curl -X POST http://localhost:8000/api/drivers-tier2/ride-filters \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "max_pickup_distance_km": 20,
    "min_passenger_rating": 3.5
  }'
```

**Expected Response (200):** Updated filters

### Test 1.4: Apply Filters to Ride Request
```bash
curl -X POST http://localhost:8000/api/drivers-tier2/rides/ride_456/auto-decide \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response (200):**
```json
{
  "should_accept": true,
  "filters_applied": true,
  "matching_rules": []
}
```

### Success Criteria
✓ Filters persist in database
✓ All fields update correctly
✓ Boolean flags toggle as expected
✓ Null handling for optional fields

---

## 📊 FEATURE 2: Passenger Ratings

### Test 2.1: Get Passenger Rating
```bash
curl -X GET http://localhost:8000/api/drivers-tier2/passengers/passenger_789/ratings \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response (200):**
```json
{
  "passenger_id": "passenger_789",
  "average_rating": 4.5,
  "total_ratings": 42,
  "recent_reviews": [
    {
      "rating": 5,
      "comment": "Great ride!",
      "date": "2024-05-29T09:30:00+05:30"
    },
    {
      "rating": 4,
      "comment": "Good driver",
      "date": "2024-05-28T14:00:00+05:30"
    }
  ]
}
```

### Test 2.2: Get Passenger Reviews (Paginated)
```bash
curl -X GET "http://localhost:8000/api/drivers-tier2/passengers/passenger_789/reviews?limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response (200):**
```json
{
  "passenger_id": "passenger_789",
  "reviews": [],
  "average_rating": 4.5,
  "total_count": 0
}
```

### Test 2.3: Handle Non-Existent Passenger
```bash
curl -X GET http://localhost:8000/api/drivers-tier2/passengers/non_existent/ratings \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response (200):** Default stub response

### Success Criteria
✓ Ratings cache appropriately
✓ Reviews display in chronological order
✓ Color coding logic works (excellent/good/average/low)
✓ 5-minute cache invalidation works

---

## 🚗 FEATURE 3: Vehicle Maintenance

### Test 3.1: Log Maintenance Service
```bash
curl -X POST http://localhost:8000/api/drivers-tier2/vehicles/vehicle_123/maintenance \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "maintenance_type": "oil_change",
    "service_date": "2024-05-29T10:00:00+05:30",
    "next_due_date": "2024-11-29T10:00:00+05:30",
    "cost": 500,
    "receipt_url": "https://storage.example.com/receipt.pdf",
    "notes": "Regular oil change with filter replacement"
  }'
```

**Expected Response (201):**
```json
{
  "id": 1,
  "driver_id": "driver_123",
  "vehicle_id": "vehicle_123",
  "maintenance_type": "oil_change",
  "service_date": "2024-05-29T10:00:00+05:30",
  "next_due_date": "2024-11-29T10:00:00+05:30",
  "cost": 500,
  "receipt_url": "https://storage.example.com/receipt.pdf",
  "notes": "Regular oil change with filter replacement",
  "created_at": "2024-05-29T10:00:00+05:30",
  "updated_at": "2024-05-29T10:00:00+05:30"
}
```

### Test 3.2: Get Maintenance History
```bash
curl -X GET "http://localhost:8000/api/drivers-tier2/vehicles/vehicle_123/maintenance?limit=5" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response (200):**
```json
{
  "records": [
    {
      "id": 1,
      "maintenance_type": "oil_change",
      "service_date": "2024-05-29T10:00:00+05:30",
      "next_due_date": "2024-11-29T10:00:00+05:30",
      "cost": 500
    }
  ],
  "total": 1
}
```

### Test 3.3: Get Maintenance Due Soon (30 days)
```bash
curl -X GET http://localhost:8000/api/drivers-tier2/vehicles/vehicle_123/maintenance-due \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response (200):**
```json
{
  "due_items": [],
  "count": 0
}
```

### Test 3.4: Update Maintenance Record
```bash
curl -X PATCH http://localhost:8000/api/drivers-tier2/vehicles/vehicle_123/maintenance/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "cost": 550,
    "notes": "Updated cost after additional repair"
  }'
```

**Expected Response (200):** Updated record

### Test 3.5: Add Document Expiry Tracking
```bash
curl -X POST http://localhost:8000/api/drivers-tier2/vehicles/vehicle_123/document-expiry \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "document_type": "Insurance",
    "expiry_date": "2024-12-31T00:00:00+05:30",
    "alert_days_before": 30,
    "document_url": "https://storage.example.com/insurance.pdf"
  }'
```

**Expected Response (201):**
```json
{
  "id": 1,
  "driver_id": "driver_123",
  "vehicle_id": "vehicle_123",
  "document_type": "Insurance",
  "expiry_date": "2024-12-31T00:00:00+05:30",
  "alert_days_before": 30,
  "document_url": "https://storage.example.com/insurance.pdf",
  "created_at": "2024-05-29T10:00:00+05:30",
  "updated_at": "2024-05-29T10:00:00+05:30"
}
```

### Test 3.6: Get All Document Expiries
```bash
curl -X GET http://localhost:8000/api/drivers-tier2/vehicles/vehicle_123/document-expiry \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response (200):**
```json
{
  "documents": [
    {
      "id": 1,
      "document_type": "Insurance",
      "expiry_date": "2024-12-31T00:00:00+05:30",
      "alert_days_before": 30
    }
  ],
  "total": 1
}
```

### Success Criteria
✓ Maintenance records created with valid dates
✓ Due dates calculated correctly (30-day window)
✓ Cost tracking accurate
✓ Document expiry alerts trigger at correct threshold
✓ Multiple maintenance types supported

---

## 💰 FEATURE 4: Earning Targets

### Test 4.1: Set Weekly Earning Target
```bash
curl -X POST http://localhost:8000/api/drivers-tier2/earning-targets \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "target_amount": 5000,
    "target_period": "weekly",
    "bonus_multiplier": 1.5
  }'
```

**Expected Response (201):**
```json
{
  "id": 1,
  "driver_id": "driver_123",
  "target_amount": 5000,
  "current_earnings": 0,
  "target_period": "weekly",
  "bonus_multiplier": 1.5,
  "bonus_earned": 0,
  "target_week_start": "2024-05-27T00:00:00+05:30",
  "status": "active",
  "created_at": "2024-05-29T10:00:00+05:30",
  "updated_at": "2024-05-29T10:00:00+05:30"
}
```

### Test 4.2: Get Current Target
```bash
curl -X GET http://localhost:8000/api/drivers-tier2/earning-targets/current \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response (200):** Current target object

### Test 4.3: Get Target Progress
```bash
curl -X GET http://localhost:8000/api/drivers-tier2/earning-targets/progress \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response (200):**
```json
{
  "target_set": true,
  "target_amount": 5000,
  "current_earnings": 0,
  "progress_percentage": 0,
  "bonus_earned": 0,
  "bonus_multiplier": 1.5,
  "status": "active"
}
```

### Test 4.4: Get Target History (10 weeks)
```bash
curl -X GET "http://localhost:8000/api/drivers-tier2/earning-targets/history?limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response (200):**
```json
{
  "history": [
    {
      "id": 1,
      "target_amount": 5000,
      "current_earnings": 0,
      "bonus_multiplier": 1.5,
      "status": "active"
    }
  ],
  "total": 1
}
```

### Test 4.5: Set Monthly Target
```bash
curl -X POST http://localhost:8000/api/drivers-tier2/earning-targets \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "target_amount": 20000,
    "target_period": "monthly",
    "bonus_multiplier": 2.0
  }'
```

**Expected Response (201):** Monthly target

### Success Criteria
✓ Weekly and monthly targets both work
✓ Progress calculation accurate (0-100%)
✓ Bonus multiplier stored (1.0-5.0)
✓ Status transitions (active → completed → abandoned)
✓ History maintained for analytics
✓ Success rate calculated from history

---

## 💳 FEATURE 5: Payment Methods

### Test 5.1: Add Bank Transfer Payment Method
```bash
curl -X POST http://localhost:8000/api/drivers-tier2/payment-methods \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "method_type": "bank_transfer",
    "account_holder_name": "John Doe",
    "account_number": "123456789012",
    "ifsc_code": "SBIN0001234",
    "is_default": true
  }'
```

**Expected Response (201):**
```json
{
  "id": 1,
  "driver_id": "driver_123",
  "method_type": "bank_transfer",
  "account_holder_name": "John Doe",
  "account_number": "123456789012",
  "ifsc_code": "SBIN0001234",
  "verification_status": "pending",
  "is_default": true,
  "created_at": "2024-05-29T10:00:00+05:30",
  "updated_at": "2024-05-29T10:00:00+05:30"
}
```

### Test 5.2: Add UPI Payment Method
```bash
curl -X POST http://localhost:8000/api/drivers-tier2/payment-methods \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "method_type": "upi",
    "account_holder_name": "John Doe",
    "upi_id": "johndoe@upi",
    "is_default": false
  }'
```

**Expected Response (201):** UPI method

### Test 5.3: Get All Payment Methods
```bash
curl -X GET http://localhost:8000/api/drivers-tier2/payment-methods \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response (200):**
```json
{
  "methods": [
    {
      "id": 1,
      "method_type": "bank_transfer",
      "account_holder_name": "John Doe",
      "is_default": true,
      "verification_status": "pending"
    },
    {
      "id": 2,
      "method_type": "upi",
      "account_holder_name": "John Doe",
      "is_default": false,
      "verification_status": "pending"
    }
  ],
  "default_method_id": 1,
  "total": 2
}
```

### Test 5.4: Update Payment Method
```bash
curl -X PATCH http://localhost:8000/api/drivers-tier2/payment-methods/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "is_verified": true,
    "verification_status": "verified"
  }'
```

**Expected Response (200):** Updated method

### Test 5.5: Set Default Payment Method
```bash
curl -X PATCH http://localhost:8000/api/drivers-tier2/payment-methods/2 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "is_default": true
  }'
```

**Expected Response (200):** Updated (note: only one can be default)

### Test 5.6: Delete Payment Method
```bash
curl -X DELETE http://localhost:8000/api/drivers-tier2/payment-methods/2 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response (204):** No content

### Success Criteria
✓ Bank transfer and UPI types work
✓ Verification status tracked
✓ Only one default payment method at a time
✓ Account number masked in responses
✓ IFSC code validation (11 chars max)
✓ Deletion prevents orphaned payouts

---

## 📤 FEATURE 6: Payout Schedule

### Test 6.1: Configure Daily Payout Schedule
```bash
curl -X POST http://localhost:8000/api/drivers-tier2/payout-schedule \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_method_id": 1,
    "schedule_type": "daily",
    "schedule_time": "09:00",
    "minimum_balance_threshold": 500
  }'
```

**Expected Response (201):**
```json
{
  "id": 1,
  "driver_id": "driver_123",
  "payment_method_id": 1,
  "schedule_type": "daily",
  "schedule_day": null,
  "schedule_time": "09:00",
  "minimum_balance_threshold": 500,
  "created_at": "2024-05-29T10:00:00+05:30",
  "updated_at": "2024-05-29T10:00:00+05:30"
}
```

### Test 6.2: Configure Weekly Payout (Monday at 9am)
```bash
curl -X POST http://localhost:8000/api/drivers-tier2/payout-schedule \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_method_id": 1,
    "schedule_type": "weekly",
    "schedule_day": 1,
    "schedule_time": "09:00",
    "minimum_balance_threshold": 1000
  }'
```

**Expected Response (201):** Weekly schedule

### Test 6.3: Configure Monthly Payout (1st of month)
```bash
curl -X POST http://localhost:8000/api/drivers-tier2/payout-schedule \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "payment_method_id": 1,
    "schedule_type": "monthly",
    "schedule_day": 1,
    "schedule_time": "09:00",
    "minimum_balance_threshold": 2000
  }'
```

**Expected Response (201):** Monthly schedule

### Test 6.4: Get Payout Schedule
```bash
curl -X GET http://localhost:8000/api/drivers-tier2/payout-schedule \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response (200):** Current schedule config

### Success Criteria
✓ All three schedule types (daily/weekly/monthly) work
✓ Time format HH:MM validated
✓ Day ranges validated (0-6 weekly, 1-31 monthly)
✓ Minimum balance threshold enforced
✓ Only one schedule per driver (update overwrites)

---

## 📊 FEATURE 7: Payout History

### Test 7.1: Request Manual Payout
```bash
curl -X POST http://localhost:8000/api/drivers-tier2/payouts/request \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 2500,
    "payment_method_id": 1
  }'
```

**Expected Response (201):**
```json
{
  "payout_id": 1,
  "status": "pending",
  "amount": 2500,
  "created_at": "2024-05-29T10:00:00+05:30"
}
```

### Test 7.2: Get Payout History (All Payouts)
```bash
curl -X GET "http://localhost:8000/api/drivers-tier2/payouts/history?limit=30" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response (200):**
```json
{
  "payouts": [
    {
      "id": 1,
      "driver_id": "driver_123",
      "amount": 2500,
      "payment_method_id": 1,
      "status": "pending",
      "transaction_id": null,
      "failure_reason": null,
      "processed_at": null,
      "created_at": "2024-05-29T10:00:00+05:30"
    }
  ],
  "total": 1
}
```

### Test 7.3: Get Completed Payouts Only
```bash
curl -X GET "http://localhost:8000/api/drivers-tier2/payouts/history?limit=30&status_filter=completed" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response (200):** Filtered payouts

### Test 7.4: Payout Status Transitions
Valid statuses: `pending` → `processing` → `completed` (or `failed`)

### Test 7.5: Zero Amount Rejection
```bash
curl -X POST http://localhost:8000/api/drivers-tier2/payouts/request \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 0,
    "payment_method_id": 1
  }'
```

**Expected Response (400):** Bad request

### Success Criteria
✓ Payout status workflow correct
✓ Transaction ID tracked when processed
✓ Failure reasons captured for failed payouts
✓ Processed timestamp updated on completion
✓ History queryable by status
✓ Amount validation (must be > 0)

---

## 🔐 HEALTH CHECKS & INTEGRATION

### Test 8.1: TIER 2 Health Check
```bash
curl -X GET http://localhost:8000/api/drivers-tier2/health/tier2 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Expected Response (200):**
```json
{
  "status": "ok",
  "tier2_endpoints": "operational",
  "features": [
    "ride-filters",
    "passenger-ratings",
    "vehicle-maintenance",
    "earning-targets",
    "payment-methods",
    "payout-schedule"
  ]
}
```

### Test 8.2: TIER 1 + TIER 2 Coexistence
Both TIER 1 and TIER 2 endpoints should work simultaneously:

```bash
# TIER 1 endpoint
curl -X GET http://localhost:8000/api/drivers-tier1/location \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# TIER 2 endpoint
curl -X GET http://localhost:8000/api/drivers-tier2/earning-targets/current \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

Both should return 200 OK.

---

## 🧪 LOAD TESTING SCENARIO

### Test 9.1: Multiple Driver Targets (Concurrent)
```bash
#!/bin/bash
# Create 10 earning targets concurrently

for i in {1..10}; do
  curl -X POST http://localhost:8000/api/drivers-tier2/earning-targets \
    -H "Authorization: Bearer TOKEN_$i" \
    -H "Content-Type: application/json" \
    -d "{
      \"target_amount\": $((i * 1000)),
      \"target_period\": \"weekly\",
      \"bonus_multiplier\": 1.5
    }" &
done
wait

echo "10 targets created concurrently"
```

### Test 9.2: Rapid Payout Requests
```bash
#!/bin/bash
# Request 5 payouts in quick succession

for i in {1..5}; do
  curl -X POST http://localhost:8000/api/drivers-tier2/payouts/request \
    -H "Authorization: Bearer YOUR_JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"amount\": $((i * 500)),
      \"payment_method_id\": 1
    }"
  sleep 0.1
done
```

---

## 📋 INTEGRATION TEST CHECKLIST

| Feature | Unit Tests | E2E Tests | Performance | Security |
|---------|-----------|----------|-------------|----------|
| Ride Filters | ✓ | ✓ | ✓ | ✓ |
| Passenger Ratings | ✓ | ✓ | ✓ | ✓ |
| Vehicle Maintenance | ✓ | ✓ | ✓ | ✓ |
| Earning Targets | ✓ | ✓ | ✓ | ✓ |
| Payment Methods | ✓ | ✓ | ✓ | ✓ |
| Payout Schedule | ✓ | ✓ | ✓ | ✓ |
| Payout History | ✓ | ✓ | ✓ | ✓ |

---

## 🔍 Error Handling Tests

### Test 10.1: Missing Required Fields
```bash
curl -X POST http://localhost:8000/api/drivers-tier2/payment-methods \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "method_type": "bank_transfer"
  }'
```

**Expected Response (422):** Validation error

### Test 10.2: Invalid Payment Method ID
```bash
curl -X PATCH http://localhost:8000/api/drivers-tier2/payment-methods/9999 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_default": true}'
```

**Expected Response (404):** Not found

### Test 10.3: Unauthorized Access
```bash
curl -X GET http://localhost:8000/api/drivers-tier2/ride-filters
```

**Expected Response (403):** Forbidden (no token)

### Test 10.4: Database Constraint Violation
Try to set two payment methods as default for same driver.

**Expected Response (400):** Constraint error

---

## ✅ Final Verification

Before deploying TIER 2 to production:

- [ ] All 8 test categories pass
- [ ] Load testing shows <100ms response times
- [ ] Database indexes verified with EXPLAIN ANALYZE
- [ ] No security vulnerabilities (JWT, SQL injection)
- [ ] Error responses include proper status codes
- [ ] TIER 1 endpoints still functional
- [ ] Frontend hooks integrate without errors
- [ ] Migration script runs without errors
- [ ] Pagination limits enforced
- [ ] Timezone handling correct (IST)

---

## 🚀 Deployment Verification

After production deployment:

```bash
# Verify all TIER 2 endpoints are accessible
curl https://api.autobuddy.com/api/drivers-tier2/health/tier2 \
  -H "Authorization: Bearer PROD_TOKEN"

# Check database is reachable
psql -U autobuddy_user -d autobuddy_db -c "SELECT COUNT(*) FROM earning_target;"

# Tail application logs for errors
tail -f /var/log/autobuddy/backend.log | grep -i "tier2"
```

