# TIER 3 Testing Guide - Polish & Optimization Features

> **Last Updated:** $(date)
> **Status:** Production Ready
> **Coverage:** 50+ test cases across 5 feature modules

---

## Table of Contents

1. [Environment Setup](#environment-setup)
2. [Database Reset & Preparation](#database-reset--preparation)
3. [Feature Test Modules](#feature-test-modules)
4. [Load Testing](#load-testing)
5. [Error Handling Validation](#error-handling-validation)
6. [Production Deployment Verification](#production-deployment-verification)

---

## Environment Setup

### Prerequisites

**Backend Services:**
- FastAPI development server running: `python backend/start_dev.py` (localhost:8000)
- PostgreSQL database accessible
- All TIER 1 and TIER 2 tables already created (migration_tier1.py, migration_tier2.py executed)

**Testing Tools:**
- `curl` command-line tool
- `jq` (optional, for JSON formatting)
- Postman or similar API client (optional)

**Database Credentials:**
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=autobuddy_dev
DB_USER=postgres
DB_PASSWORD=postgres
```

**Sample Driver Token (for all requests):**
Replace `{TOKEN}` in all examples with a valid JWT token from POST `/auth/login` endpoint.

```bash
# Get a valid token
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "driver@example.com",
    "password": "password123"
  }' | jq '.access_token'
```

### Pre-Test Checklist

- [ ] Backend server is running (`python backend/start_dev.py`)
- [ ] PostgreSQL database is accessible
- [ ] TIER 1 tables exist: `drivers`, `vehicles`, `rides`
- [ ] TIER 2 tables exist: `maintenance_records`, `earning_targets`, `payout_schedules`
- [ ] TIER 3 tables ready to be created: `ride_pools`, `tax_reports`, `favorite_passengers`, `shift_schedules`, `driver_badges`
- [ ] Valid driver token obtained
- [ ] Server.py has registered tier3_router (endpoints at `/api/drivers-tier3/*`)

---

## Database Reset & Preparation

### TIER 3 Database Migration

Execute the migration to create all TIER 3 tables:

```bash
cd backend
python app/db/migration_tier3.py
```

**Expected Output:**
```
✅ TIER 3 Migration completed successfully!
Tables created:
  - ride_pools
  - tax_reports
  - favorite_passengers
  - shift_schedules
  - driver_badges
```

### Verify Tables Created

```bash
# Connect to PostgreSQL
psql -U postgres -d autobuddy_dev -h localhost

# Verify all TIER 3 tables exist
\dt ride_pools
\dt tax_reports
\dt favorite_passengers
\dt shift_schedules
\dt driver_badges

# View table schemas
\d+ ride_pools
\d+ tax_reports
\d+ favorite_passengers
\d+ shift_schedules
\d+ driver_badges
```

### Reset Test Data (Between Test Runs)

```bash
# Delete all TIER 3 test data (keep structure)
psql -U postgres -d autobuddy_dev -h localhost << EOF
DELETE FROM ride_pools WHERE created_at > NOW() - INTERVAL '1 day';
DELETE FROM tax_reports WHERE created_at > NOW() - INTERVAL '1 day';
DELETE FROM favorite_passengers WHERE created_at > NOW() - INTERVAL '1 day';
DELETE FROM shift_schedules WHERE created_at > NOW() - INTERVAL '1 day';
DELETE FROM driver_badges WHERE earned_at > NOW() - INTERVAL '1 day';
EOF
```

---

## Feature Test Modules

### Module 1: Ride Pooling

**Feature Purpose:** Detect ride pooling opportunities, accept pooling offers, track analytics

#### Test 1.1: Detect Pooling Opportunities

**Endpoint:** `POST /api/drivers-tier3/pooling/detect`

**Request:**
```bash
curl -X POST http://localhost:8000/api/drivers-tier3/pooling/detect \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "pickup_location": "MG Road, Bangalore",
    "dropoff_location": "Indiranagar, Bangalore",
    "requested_time": "2024-01-15T10:00:00Z"
  }'
```

**Expected Response (200 OK):**
```json
{
  "pool_id": "pool_12345",
  "status": "pending",
  "potential_matches": 3,
  "estimated_savings": 250.50,
  "passenger_count": 2,
  "earnings_from_pool": 185.75,
  "route_distance": 8.5,
  "estimated_duration": 18,
  "created_at": "2024-01-15T10:00:00Z"
}
```

**Success Criteria:**
- ✓ Status code: 200 OK
- ✓ pool_id is not empty
- ✓ status is "pending"
- ✓ potential_matches >= 0
- ✓ estimated_savings >= 0
- ✓ Response time < 100ms

---

#### Test 1.2: Get Pooling Analytics

**Endpoint:** `GET /api/drivers-tier3/pooling/analytics`

**Request:**
```bash
curl -X GET http://localhost:8000/api/drivers-tier3/pooling/analytics \
  -H "Authorization: Bearer {TOKEN}"
```

**Expected Response (200 OK):**
```json
{
  "acceptance_rate": 75.5,
  "potential_savings": 5420.25,
  "earnings_comparison": {
    "with_pooling": 12500.50,
    "without_pooling": 10200.75
  },
  "total_pools_available": 42,
  "pools_accepted": 32,
  "average_pool_earnings": 320.15
}
```

**Success Criteria:**
- ✓ Status code: 200 OK
- ✓ acceptance_rate is between 0-100
- ✓ potential_savings >= 0
- ✓ earnings_comparison has both fields
- ✓ total_pools_available >= pools_accepted
- ✓ average_pool_earnings > 0 (when pools_accepted > 0)

---

#### Test 1.3: Accept Pooling Offer

**Endpoint:** `POST /api/drivers-tier3/pooling/accept`

**Request:**
```bash
curl -X POST http://localhost:8000/api/drivers-tier3/pooling/accept \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "pool_id": "pool_12345"
  }'
```

**Expected Response (200 OK):**
```json
{
  "pool_id": "pool_12345",
  "status": "accepted",
  "confirmation_code": "ABC123XYZ",
  "accepted_at": "2024-01-15T10:01:00Z",
  "estimated_earnings": 185.75,
  "matched_passengers": 2
}
```

**Success Criteria:**
- ✓ Status code: 200 OK
- ✓ status changed to "accepted"
- ✓ confirmation_code is provided
- ✓ accepted_at is current timestamp
- ✓ estimated_earnings >= 0

---

#### Test 1.4: Error - Invalid Pool ID

**Request:**
```bash
curl -X POST http://localhost:8000/api/drivers-tier3/pooling/accept \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "pool_id": "invalid_pool"
  }'
```

**Expected Response (404 Not Found):**
```json
{
  "detail": "Pool not found"
}
```

**Success Criteria:**
- ✓ Status code: 404 Not Found
- ✓ Error message is descriptive

---

#### Test 1.5: Error - Missing Authentication

**Request:**
```bash
curl -X POST http://localhost:8000/api/drivers-tier3/pooling/detect \
  -H "Content-Type: application/json" \
  -d '{
    "pickup_location": "MG Road",
    "dropoff_location": "Indiranagar",
    "requested_time": "2024-01-15T10:00:00Z"
  }'
```

**Expected Response (401 Unauthorized):**
```json
{
  "detail": "Not authenticated"
}
```

**Success Criteria:**
- ✓ Status code: 401 Unauthorized
- ✓ Request rejected without token

---

### Module 2: Tax Reporting

**Feature Purpose:** Generate tax reports, track history, download PDF reports

#### Test 2.1: Generate Tax Report

**Endpoint:** `POST /api/drivers-tier3/tax-reports/generate`

**Request:**
```bash
curl -X POST http://localhost:8000/api/drivers-tier3/tax-reports/generate \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "start_date": "2024-01-01",
    "end_date": "2024-01-31",
    "report_type": "monthly"
  }'
```

**Expected Response (201 Created):**
```json
{
  "report_id": "tax_001_jan2024",
  "report_type": "monthly",
  "period_start": "2024-01-01",
  "period_end": "2024-01-31",
  "gross_earnings": 45000.00,
  "deductible_expenses": 3500.00,
  "taxable_income": 41500.00,
  "tax_liability": 6225.00,
  "tax_rate": 15.0,
  "verification_status": "pending",
  "report_url": "https://autobuddy-storage.s3.amazonaws.com/tax_001_jan2024.pdf",
  "generated_at": "2024-02-01T10:00:00Z",
  "expires_at": null
}
```

**Success Criteria:**
- ✓ Status code: 201 Created
- ✓ report_id is unique
- ✓ gross_earnings >= deductible_expenses
- ✓ taxable_income = gross_earnings - deductible_expenses
- ✓ tax_liability = taxable_income × tax_rate / 100
- ✓ verification_status is "pending" or "verified"
- ✓ report_url is provided

---

#### Test 2.2: Get Tax Report History

**Endpoint:** `GET /api/drivers-tier3/tax-reports/history?limit=12`

**Request:**
```bash
curl -X GET "http://localhost:8000/api/drivers-tier3/tax-reports/history?limit=12" \
  -H "Authorization: Bearer {TOKEN}"
```

**Expected Response (200 OK):**
```json
{
  "reports": [
    {
      "report_id": "tax_001_jan2024",
      "report_type": "monthly",
      "period": "January 2024",
      "gross_earnings": 45000.00,
      "tax_liability": 6225.00,
      "verification_status": "verified",
      "generated_at": "2024-02-01T10:00:00Z"
    },
    {
      "report_id": "tax_q1_2024",
      "report_type": "quarterly",
      "period": "Q1 2024",
      "gross_earnings": 135000.00,
      "tax_liability": 20250.00,
      "verification_status": "pending",
      "generated_at": "2024-04-01T10:00:00Z"
    }
  ],
  "total_count": 14,
  "limit": 12
}
```

**Success Criteria:**
- ✓ Status code: 200 OK
- ✓ reports array contains tax_report objects
- ✓ Each report has required fields (report_id, report_type, period, etc.)
- ✓ Reports sorted by generated_at (newest first)
- ✓ total_count reflects actual number of reports
- ✓ limit parameter respected (max 12 returned if total > 12)

---

#### Test 2.3: Download Tax Report PDF

**Endpoint:** `POST /api/drivers-tier3/tax-reports/download/{id}`

**Request:**
```bash
curl -X POST http://localhost:8000/api/drivers-tier3/tax-reports/download/tax_001_jan2024 \
  -H "Authorization: Bearer {TOKEN}"
```

**Expected Response (200 OK):**
```json
{
  "report_id": "tax_001_jan2024",
  "download_url": "https://autobuddy-storage.s3.amazonaws.com/tax_001_jan2024.pdf?token=xyz",
  "expires_in": 3600,
  "format": "pdf"
}
```

**Success Criteria:**
- ✓ Status code: 200 OK
- ✓ download_url is valid S3 URL
- ✓ expires_in > 0 (URL valid for specified seconds)
- ✓ format is "pdf"
- ✓ URL includes security token

---

#### Test 2.4: Calculate Tax Summary

**Endpoint:** `GET /api/drivers-tier3/tax-reports/summary`

**Request:**
```bash
curl -X GET http://localhost:8000/api/drivers-tier3/tax-reports/summary \
  -H "Authorization: Bearer {TOKEN}"
```

**Expected Response (200 OK):**
```json
{
  "total_earnings": 225000.00,
  "total_tax_liability": 33750.00,
  "deductible_expenses": 14000.00,
  "average_tax_rate": 15.0,
  "reports_generated": 5,
  "reports_verified": 3,
  "last_report_date": "2024-12-01T10:00:00Z"
}
```

**Success Criteria:**
- ✓ Status code: 200 OK
- ✓ total_earnings >= total_tax_liability
- ✓ average_tax_rate is between 0-50
- ✓ reports_verified <= reports_generated
- ✓ All calculations are consistent

---

#### Test 2.5: Error - Invalid Report ID

**Request:**
```bash
curl -X POST http://localhost:8000/api/drivers-tier3/tax-reports/download/invalid_id \
  -H "Authorization: Bearer {TOKEN}"
```

**Expected Response (404 Not Found):**
```json
{
  "detail": "Tax report not found"
}
```

**Success Criteria:**
- ✓ Status code: 404 Not Found
- ✓ Descriptive error message provided

---

### Module 3: Favorite Passengers

**Feature Purpose:** CRUD operations on favorite/frequent passengers list

#### Test 3.1: Add Favorite Passenger

**Endpoint:** `POST /api/drivers-tier3/favorite-passengers`

**Request:**
```bash
curl -X POST http://localhost:8000/api/drivers-tier3/favorite-passengers \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "passenger_id": "pass_001",
    "rating": 5,
    "notes": "Friendly passenger, generous tipper"
  }'
```

**Expected Response (201 Created):**
```json
{
  "favorite_id": "fav_001",
  "driver_id": "driver_001",
  "passenger_id": "pass_001",
  "rating": 5,
  "rides_completed": 0,
  "total_earnings_from_passenger": 0.00,
  "is_active": true,
  "added_at": "2024-01-15T10:00:00Z"
}
```

**Success Criteria:**
- ✓ Status code: 201 Created
- ✓ favorite_id is unique
- ✓ rating is between 1-5
- ✓ is_active is true by default
- ✓ rides_completed starts at 0
- ✓ UNIQUE constraint: same passenger can't be added twice for same driver

---

#### Test 3.2: Get All Favorite Passengers

**Endpoint:** `GET /api/drivers-tier3/favorite-passengers`

**Request:**
```bash
curl -X GET http://localhost:8000/api/drivers-tier3/favorite-passengers \
  -H "Authorization: Bearer {TOKEN}"
```

**Expected Response (200 OK):**
```json
{
  "favorites": [
    {
      "favorite_id": "fav_001",
      "passenger_id": "pass_001",
      "passenger_name": "Rajesh Kumar",
      "rating": 5,
      "rides_completed": 12,
      "total_earnings_from_passenger": 2500.00,
      "is_active": true,
      "added_at": "2024-01-01T10:00:00Z"
    },
    {
      "favorite_id": "fav_002",
      "passenger_id": "pass_002",
      "passenger_name": "Priya Sharma",
      "rating": 4,
      "rides_completed": 8,
      "total_earnings_from_passenger": 1800.00,
      "is_active": true,
      "added_at": "2024-01-05T10:00:00Z"
    }
  ],
  "total_count": 2
}
```

**Success Criteria:**
- ✓ Status code: 200 OK
- ✓ Returns array of all driver's favorites
- ✓ Includes calculated fields: rides_completed, total_earnings
- ✓ Ordered by added_at or rating (descending)
- ✓ total_count matches array length

---

#### Test 3.3: Update Favorite Passenger

**Endpoint:** `PATCH /api/drivers-tier3/favorite-passengers/{favorite_id}`

**Request:**
```bash
curl -X PATCH http://localhost:8000/api/drivers-tier3/favorite-passengers/fav_001 \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "rating": 4,
    "notes": "Updated: Still great, but less frequent now"
  }'
```

**Expected Response (200 OK):**
```json
{
  "favorite_id": "fav_001",
  "passenger_id": "pass_001",
  "rating": 4,
  "notes": "Updated: Still great, but less frequent now",
  "is_active": true,
  "updated_at": "2024-01-15T11:00:00Z"
}
```

**Success Criteria:**
- ✓ Status code: 200 OK
- ✓ Only specified fields updated
- ✓ updated_at field reflects change
- ✓ Other fields preserved

---

#### Test 3.4: Remove Favorite Passenger

**Endpoint:** `DELETE /api/drivers-tier3/favorite-passengers/{favorite_id}`

**Request:**
```bash
curl -X DELETE http://localhost:8000/api/drivers-tier3/favorite-passengers/fav_001 \
  -H "Authorization: Bearer {TOKEN}"
```

**Expected Response (204 No Content or 200 OK):**
```json
{
  "message": "Favorite passenger removed successfully",
  "favorite_id": "fav_001"
}
```

**Success Criteria:**
- ✓ Status code: 204 No Content or 200 OK
- ✓ Record is soft-deleted or marked inactive
- ✓ Subsequent GET returns updated list without deleted record

---

#### Test 3.5: Error - Duplicate Favorite

**Request:**
```bash
# After already adding pass_001 as favorite
curl -X POST http://localhost:8000/api/drivers-tier3/favorite-passengers \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "passenger_id": "pass_001",
    "rating": 3
  }'
```

**Expected Response (409 Conflict):**
```json
{
  "detail": "Passenger is already in your favorites"
}
```

**Success Criteria:**
- ✓ Status code: 409 Conflict
- ✓ UNIQUE constraint prevents duplicates
- ✓ Descriptive error message

---

### Module 4: Shift Schedule

**Feature Purpose:** Manage recurring weekly shift schedules

#### Test 4.1: Create Shift Schedule

**Endpoint:** `POST /api/drivers-tier3/shift-schedule`

**Request:**
```bash
curl -X POST http://localhost:8000/api/drivers-tier3/shift-schedule \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "day_of_week": 1,
    "start_time": "09:00",
    "end_time": "17:00",
    "is_recurring": true,
    "shift_type": "regular",
    "target_earnings": 5000.00
  }'
```

**Expected Response (201 Created):**
```json
{
  "schedule_id": "sch_001",
  "driver_id": "driver_001",
  "day_of_week": 1,
  "day_name": "Monday",
  "start_time": "09:00",
  "end_time": "17:00",
  "shift_duration_hours": 8.0,
  "is_recurring": true,
  "shift_type": "regular",
  "target_earnings": 5000.00,
  "is_active": true,
  "created_at": "2024-01-15T10:00:00Z"
}
```

**Success Criteria:**
- ✓ Status code: 201 Created
- ✓ schedule_id is unique
- ✓ day_of_week is between 0-6 (0=Sunday, 1=Monday, etc.)
- ✓ shift_duration_hours correctly calculated: (endHour - startHour) + (endMin - startMin)/60
- ✓ is_active is true by default
- ✓ shift_type is one of: regular, premium, night, weekend

---

#### Test 4.2: Get All Shift Schedules

**Endpoint:** `GET /api/drivers-tier3/shift-schedule`

**Request:**
```bash
curl -X GET http://localhost:8000/api/drivers-tier3/shift-schedule \
  -H "Authorization: Bearer {TOKEN}"
```

**Expected Response (200 OK):**
```json
{
  "schedules": [
    {
      "schedule_id": "sch_001",
      "day_of_week": 0,
      "day_name": "Sunday",
      "start_time": "10:00",
      "end_time": "18:00",
      "shift_duration_hours": 8.0,
      "is_recurring": true,
      "shift_type": "premium",
      "target_earnings": 6000.00,
      "is_active": true
    },
    {
      "schedule_id": "sch_002",
      "day_of_week": 1,
      "day_name": "Monday",
      "start_time": "09:00",
      "end_time": "17:00",
      "shift_duration_hours": 8.0,
      "is_recurring": true,
      "shift_type": "regular",
      "target_earnings": 5000.00,
      "is_active": true
    }
  ],
  "weekly_summary": {
    "total_scheduled_hours": 40.0,
    "scheduled_days_count": 5,
    "average_daily_hours": 8.0,
    "total_target_earnings": 25000.00
  }
}
```

**Success Criteria:**
- ✓ Status code: 200 OK
- ✓ Returns array for all 7 days (sorted by day_of_week)
- ✓ Includes weekly_summary with calculated totals
- ✓ total_scheduled_hours = sum of all shift_duration_hours
- ✓ scheduled_days_count = number of active shifts
- ✓ average_daily_hours = total_scheduled_hours / scheduled_days_count

---

#### Test 4.3: Update Shift Schedule

**Endpoint:** `PATCH /api/drivers-tier3/shift-schedule/{schedule_id}`

**Request:**
```bash
curl -X PATCH http://localhost:8000/api/drivers-tier3/shift-schedule/sch_001 \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "start_time": "08:00",
    "end_time": "18:00",
    "is_active": true,
    "target_earnings": 6500.00
  }'
```

**Expected Response (200 OK):**
```json
{
  "schedule_id": "sch_001",
  "day_of_week": 1,
  "start_time": "08:00",
  "end_time": "18:00",
  "shift_duration_hours": 10.0,
  "target_earnings": 6500.00,
  "is_active": true,
  "updated_at": "2024-01-15T11:00:00Z"
}
```

**Success Criteria:**
- ✓ Status code: 200 OK
- ✓ shift_duration_hours recalculated correctly
- ✓ Only specified fields updated
- ✓ updated_at timestamp reflects change

---

#### Test 4.4: Delete Shift Schedule

**Endpoint:** `DELETE /api/drivers-tier3/shift-schedule/{schedule_id}`

**Request:**
```bash
curl -X DELETE http://localhost:8000/api/drivers-tier3/shift-schedule/sch_001 \
  -H "Authorization: Bearer {TOKEN}"
```

**Expected Response (204 No Content):**
```json
{
  "message": "Shift schedule deleted successfully"
}
```

**Success Criteria:**
- ✓ Status code: 204 No Content or 200 OK
- ✓ Schedule marked as inactive or deleted
- ✓ Weekly summary recalculated on next GET

---

#### Test 4.5: Error - Invalid Day of Week

**Request:**
```bash
curl -X POST http://localhost:8000/api/drivers-tier3/shift-schedule \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "day_of_week": 8,
    "start_time": "09:00",
    "end_time": "17:00"
  }'
```

**Expected Response (400 Bad Request):**
```json
{
  "detail": "day_of_week must be between 0 and 6"
}
```

**Success Criteria:**
- ✓ Status code: 400 Bad Request
- ✓ Validation error for out-of-range day_of_week

---

### Module 5: Gamification Badges

**Feature Purpose:** Track earned badges, in-progress achievements, leaderboard

#### Test 5.1: Get Earned Badges

**Endpoint:** `GET /api/drivers-tier3/badges/earned`

**Request:**
```bash
curl -X GET http://localhost:8000/api/drivers-tier3/badges/earned \
  -H "Authorization: Bearer {TOKEN}"
```

**Expected Response (200 OK):**
```json
{
  "earned_badges": [
    {
      "badge_id": "badge_safety_001",
      "badge_name": "Safety First",
      "badge_type": "safety",
      "earned_at": "2024-01-10T10:00:00Z",
      "expires_at": null,
      "reward_points": 100,
      "reward_bonus": 500.00
    },
    {
      "badge_id": "badge_perf_001",
      "badge_name": "Performance Star",
      "badge_type": "performance",
      "earned_at": "2024-01-12T10:00:00Z",
      "expires_at": "2025-01-12T10:00:00Z",
      "reward_points": 150,
      "reward_bonus": 750.00
    }
  ],
  "total_earned": 2,
  "total_reward_points": 250,
  "total_reward_bonus": 1250.00
}
```

**Success Criteria:**
- ✓ Status code: 200 OK
- ✓ Returns array of earned badges with badge_type in [safety, performance, consistency, customer_service, milestone]
- ✓ earned_at field present
- ✓ Includes reward_points and reward_bonus
- ✓ Aggregated totals calculated correctly

---

#### Test 5.2: Get Badge Progress

**Endpoint:** `GET /api/drivers-tier3/badges/progress`

**Request:**
```bash
curl -X GET http://localhost:8000/api/drivers-tier3/badges/progress \
  -H "Authorization: Bearer {TOKEN}"
```

**Expected Response (200 OK):**
```json
{
  "in_progress_badges": [
    {
      "badge_id": "badge_consistency_draft",
      "badge_name": "Consistency Champion",
      "badge_type": "consistency",
      "progress": 65,
      "description": "Complete 100 rides with >4.5 rating",
      "requirement": "100 rides at 4.5+ rating",
      "estimated_completion_date": "2024-02-15",
      "current_count": 65,
      "target_count": 100
    },
    {
      "badge_id": "badge_customer_draft",
      "badge_name": "Customer Service Hero",
      "badge_type": "customer_service",
      "progress": 45,
      "description": "Receive 50 5-star ratings",
      "requirement": "50 5-star ratings",
      "estimated_completion_date": "2024-03-01",
      "current_count": 23,
      "target_count": 50
    }
  ],
  "total_in_progress": 2
}
```

**Success Criteria:**
- ✓ Status code: 200 OK
- ✓ progress is between 0-100
- ✓ estimated_completion_date is calculated based on progress rate
- ✓ current_count <= target_count
- ✓ progress = (current_count / target_count) * 100

---

#### Test 5.3: Get Leaderboard

**Endpoint:** `GET /api/drivers-tier3/badges/leaderboard?limit=50`

**Request:**
```bash
curl -X GET "http://localhost:8000/api/drivers-tier3/badges/leaderboard?limit=50" \
  -H "Authorization: Bearer {TOKEN}"
```

**Expected Response (200 OK):**
```json
{
  "leaderboard": [
    {
      "rank": 1,
      "driver_id": "driver_xyz",
      "driver_name": "Amit Patel",
      "total_badges": 8,
      "reward_points": 950,
      "reward_bonus_earned": 4500.00,
      "achievement_tier": "platinum"
    },
    {
      "rank": 2,
      "driver_id": "driver_abc",
      "driver_name": "Rajesh Kumar",
      "total_badges": 7,
      "reward_points": 850,
      "reward_bonus_earned": 4000.00,
      "achievement_tier": "gold"
    },
    {
      "rank": 3,
      "driver_id": "driver_001",
      "driver_name": "Current Driver",
      "total_badges": 5,
      "reward_points": 650,
      "reward_bonus_earned": 2950.00,
      "achievement_tier": "silver"
    }
  ],
  "current_driver_rank": 3,
  "total_drivers_ranked": 1250
}
```

**Success Criteria:**
- ✓ Status code: 200 OK
- ✓ Results sorted by total_badges (descending)
- ✓ Rank field is sequential (1, 2, 3, ...)
- ✓ limit parameter respected (max 50 returned)
- ✓ current_driver_rank shows logged-in driver's position
- ✓ achievement_tier based on badge count: platinum (8+), gold (6-7), silver (4-5), bronze (2-3), starter (0-1)

---

#### Test 5.4: Award New Badge

**Endpoint:** `POST /api/drivers-tier3/badges/award` (Admin/System endpoint)

**Request:**
```bash
curl -X POST http://localhost:8000/api/drivers-tier3/badges/award \
  -H "Authorization: Bearer {ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "driver_id": "driver_001",
    "badge_type": "milestone",
    "badge_name": "Century Club",
    "description": "Completed 100 rides",
    "reward_points": 200,
    "reward_bonus": 1000.00
  }'
```

**Expected Response (201 Created):**
```json
{
  "badge_id": "badge_milestone_001",
  "driver_id": "driver_001",
  "badge_type": "milestone",
  "badge_name": "Century Club",
  "earned_at": "2024-01-15T10:00:00Z",
  "reward_points": 200,
  "reward_bonus": 1000.00
}
```

**Success Criteria:**
- ✓ Status code: 201 Created
- ✓ Badge record created in database
- ✓ Driver notifications sent
- ✓ Reward points and bonus credited to driver account

---

#### Test 5.5: Error - Invalid Badge Type

**Request:**
```bash
curl -X POST http://localhost:8000/api/drivers-tier3/badges/award \
  -H "Authorization: Bearer {ADMIN_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "driver_id": "driver_001",
    "badge_type": "invalid_type",
    "badge_name": "Unknown",
    "reward_points": 100,
    "reward_bonus": 500.00
  }'
```

**Expected Response (400 Bad Request):**
```json
{
  "detail": "badge_type must be one of: safety, performance, consistency, customer_service, milestone"
}
```

**Success Criteria:**
- ✓ Status code: 400 Bad Request
- ✓ Validation error for invalid badge_type

---

## Load Testing

### Test 5.1: High Concurrency - Pooling Detection (100 concurrent requests)

**Tool:** Apache Bench or wrk

```bash
# Using wrk
wrk -t10 -c100 -d30s --script=pooling_load.lua http://localhost:8000/api/drivers-tier3/pooling/detect

# pooling_load.lua
request = function()
  wrk.method = "POST"
  wrk.headers["Authorization"] = "Bearer {TOKEN}"
  wrk.headers["Content-Type"] = "application/json"
  wrk.body = '{"pickup_location":"MG Road","dropoff_location":"Indiranagar","requested_time":"2024-01-15T10:00:00Z"}'
  return wrk.format(nil)
end
```

**Success Criteria:**
- ✓ P99 latency < 500ms
- ✓ P95 latency < 300ms
- ✓ Average latency < 150ms
- ✓ Error rate < 1%
- ✓ Throughput > 50 req/sec
- ✓ No memory leaks
- ✓ Database connection pool not exhausted

---

### Test 5.2: Sequential Tax Report Generation (50 sequential requests)

**Tool:** Custom script

```bash
for i in {1..50}; do
  curl -X POST http://localhost:8000/api/drivers-tier3/tax-reports/generate \
    -H "Authorization: Bearer {TOKEN}" \
    -H "Content-Type: application/json" \
    -d '{
      "start_date": "2024-01-01",
      "end_date": "2024-01-31",
      "report_type": "monthly"
    }' \
    -w "\nRequest %d: %{time_total}s\n" >> tax_load_results.txt
done
```

**Success Criteria:**
- ✓ All 50 requests complete successfully
- ✓ Average response time < 200ms
- ✓ Max response time < 500ms
- ✓ Database performance stable (no degradation over time)
- ✓ Disk storage for PDFs increases appropriately

---

### Test 5.3: Sustained Load - Shift Schedule Queries (30 req/sec for 5 minutes)

**Tool:** constant-load script

```bash
# Using Apache Bench with rate limiting
ab -r -c 10 -n 9000 -g shift_schedule_load.tsv \
  -H "Authorization: Bearer {TOKEN}" \
  http://localhost:8000/api/drivers-tier3/shift-schedule
```

**Success Criteria:**
- ✓ Sustained 30 req/sec without degradation
- ✓ Response times remain consistent
- ✓ Database queries optimized (indexed properly)
- ✓ Memory usage stable
- ✓ No timeout errors

---

## Error Handling Validation

### Test 6.1: Missing Required Fields

**Request:**
```bash
curl -X POST http://localhost:8000/api/drivers-tier3/pooling/detect \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "pickup_location": "MG Road"
  }'
```

**Expected Response (422 Unprocessable Entity):**
```json
{
  "detail": [
    {
      "loc": ["body", "dropoff_location"],
      "msg": "field required",
      "type": "value_error.missing"
    }
  ]
}
```

**Success Criteria:**
- ✓ Status code: 422 Unprocessable Entity
- ✓ All missing fields listed in error response
- ✓ Clear error messages for each field

---

### Test 6.2: Invalid Data Type

**Request:**
```bash
curl -X POST http://localhost:8000/api/drivers-tier3/favorite-passengers \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "passenger_id": "pass_001",
    "rating": "five"
  }'
```

**Expected Response (422 Unprocessable Entity):**
```json
{
  "detail": [
    {
      "loc": ["body", "rating"],
      "msg": "value is not a valid integer",
      "type": "type_error.integer"
    }
  ]
}
```

**Success Criteria:**
- ✓ Status code: 422 Unprocessable Entity
- ✓ Type validation errors clearly described

---

### Test 6.3: Out of Range Values

**Request:**
```bash
curl -X POST http://localhost:8000/api/drivers-tier3/favorite-passengers \
  -H "Authorization: Bearer {TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "passenger_id": "pass_001",
    "rating": 10
  }'
```

**Expected Response (422 Unprocessable Entity):**
```json
{
  "detail": [
    {
      "loc": ["body", "rating"],
      "msg": "ensure this value is less than or equal to 5",
      "type": "value_error.number.not_le"
    }
  ]
}
```

**Success Criteria:**
- ✓ Status code: 422 Unprocessable Entity
- ✓ Range validation enforced

---

### Test 6.4: Unauthorized Access

**Request:**
```bash
curl -X GET http://localhost:8000/api/drivers-tier3/shift-schedule \
  -H "Authorization: Bearer invalid_token"
```

**Expected Response (401 Unauthorized):**
```json
{
  "detail": "Could not validate credentials"
}
```

**Success Criteria:**
- ✓ Status code: 401 Unauthorized
- ✓ Invalid tokens rejected
- ✓ Request blocked at authentication layer

---

### Test 6.5: Resource Not Found

**Request:**
```bash
curl -X GET http://localhost:8000/api/drivers-tier3/favorite-passengers \
  -H "Authorization: Bearer {TOKEN}"
```

(When driver has no favorites)

**Expected Response (200 OK with empty array):**
```json
{
  "favorites": [],
  "total_count": 0
}
```

**Success Criteria:**
- ✓ Status code: 200 OK (not 404, as endpoint exists)
- ✓ Empty array returned for no data
- ✓ Consistent with REST conventions

---

## Production Deployment Verification

### Pre-Deployment Checklist

- [ ] All TIER 3 files created and tested locally
- [ ] server.py updated with tier3_router import and registration
- [ ] migration_tier3.py executed successfully on staging database
- [ ] All 50+ test cases pass locally
- [ ] No compilation errors in Python or JavaScript
- [ ] All imports verified and correct
- [ ] Database indexes created for performance
- [ ] Frontend hooks and components integrated
- [ ] Error handling and validation comprehensive
- [ ] Load testing shows acceptable performance

### Deployment Steps

1. **Backup Production Database:**
   ```bash
   pg_dump -U postgres autobuddy_prod -h prod-db-host > autobuddy_prod_backup_$(date +%Y%m%d).sql
   ```

2. **Deploy to Staging:**
   - Copy tier3_polish_features.py to staging backend
   - Update staging server.py with router registration
   - Deploy frontend components and hooks to staging
   - Execute migration_tier3.py on staging database
   - Run full test suite on staging environment

3. **Verify Staging Deployment:**
   - Test all 18 TIER 3 endpoints on staging
   - Verify TIER 1 and TIER 2 endpoints still functional
   - Monitor staging database performance
   - Check frontend integration with staging backend

4. **Production Deployment:**
   - Schedule deployment during low-traffic window
   - Execute migration_tier3.py on production database
   - Deploy backend changes (tier3_router to server.py)
   - Deploy frontend changes (components + hooks)
   - Perform smoke tests on production endpoints

5. **Post-Deployment Validation:**
   - Verify all endpoints responding correctly
   - Check database tables created with data
   - Monitor error logs for any issues
   - Verify TIER 1 + TIER 2 + TIER 3 coexistence
   - Performance monitoring (latency, throughput, error rates)

### Rollback Procedure

If production deployment fails:

1. **Immediate Actions:**
   ```bash
   # Restore previous server.py
   git checkout HEAD~1 -- backend/server.py
   
   # Restart backend
   python backend/start_dev.py
   ```

2. **Database Rollback:**
   ```bash
   # If migration caused issues
   psql -U postgres -d autobuddy_prod -h prod-db-host << EOF
   DROP TABLE IF EXISTS ride_pools;
   DROP TABLE IF EXISTS tax_reports;
   DROP TABLE IF EXISTS favorite_passengers;
   DROP TABLE IF EXISTS shift_schedules;
   DROP TABLE IF EXISTS driver_badges;
   EOF
   ```

3. **Verify Rollback:**
   - Test all TIER 1 and TIER 2 endpoints
   - Confirm no data loss in existing tables
   - Monitor application stability

---

## Monitoring & Metrics (Post-Deployment)

### Key Performance Indicators

- **Endpoint Response Times:**
  - Pooling detection: Target < 100ms
  - Tax report generation: Target < 200ms
  - Favorite passenger CRUD: Target < 50ms
  - Shift schedule queries: Target < 75ms
  - Badge queries: Target < 100ms

- **Error Rates:**
  - Target: < 0.1% across all endpoints
  - 4xx errors: < 2% (validation/not found)
  - 5xx errors: < 0.1% (server errors)

- **Database Metrics:**
  - Query performance (slow query log)
  - Connection pool usage
  - Table scan analysis
  - Index effectiveness

- **Business Metrics:**
  - Pooling acceptance rate (target > 70%)
  - Tax report generation frequency
  - Favorite passenger adoption
  - Shift schedule adoption
  - Badge earning rate

---

## Troubleshooting Guide

### Issue: "401 Unauthorized" on All Endpoints

**Solution:**
1. Verify token is valid and not expired
2. Check token format: "Bearer {TOKEN}"
3. Verify user exists in database
4. Check JWT secret key matches between frontend and backend

### Issue: "404 Not Found" for TIER 3 Endpoints

**Solution:**
1. Verify server.py has tier3_router imported
2. Verify app.include_router(modular_tier3_router) is called
3. Restart backend server
4. Verify endpoint URL matches router prefix

### Issue: Database Tables Don't Exist

**Solution:**
1. Verify migration_tier3.py executed successfully
2. Check migration output for errors
3. Manually verify tables: `\dt` in psql
4. Re-run migration if tables missing

### Issue: Slow Response Times

**Solution:**
1. Check database indexes created: `\d+ table_name`
2. Analyze slow queries in PostgreSQL logs
3. Verify database connection pool not exhausted
4. Check backend server CPU/memory usage
5. Review network latency to database

### Issue: High Error Rate on Tax Report Generation

**Solution:**
1. Verify PDF storage path accessible
2. Check S3 bucket permissions (if using S3)
3. Verify disk space available for PDF files
4. Check database disk space
5. Review error logs for specific error messages

---

## Test Execution Summary Template

```markdown
# TIER 3 Testing Summary - [DATE]

**Execution Period:** [START_TIME] to [END_TIME]
**Tester:** [NAME]
**Environment:** [local/staging/production]

## Results Overview

| Feature Module | Total Tests | Passed | Failed | Success Rate |
|---|---|---|---|---|
| Ride Pooling | 5 | 5 | 0 | 100% |
| Tax Reporting | 5 | 5 | 0 | 100% |
| Favorite Passengers | 5 | 5 | 0 | 100% |
| Shift Schedule | 5 | 5 | 0 | 100% |
| Gamification Badges | 5 | 5 | 0 | 100% |
| Error Handling | 5 | 5 | 0 | 100% |
| **TOTAL** | **30** | **30** | **0** | **100%** |

## Performance Metrics

- Average Response Time: [TIME]ms
- P95 Latency: [TIME]ms
- P99 Latency: [TIME]ms
- Throughput: [REQUESTS]/sec
- Error Rate: [RATE]%

## Issues Found

None

## Approvals

- [ ] Development Team Sign-off
- [ ] QA Team Sign-off
- [ ] DevOps/Infrastructure Sign-off
- [ ] Product Manager Sign-off

**Ready for Production Deployment:** ✓ YES / ✗ NO
```

---

**End of TIER 3 Testing Guide**
