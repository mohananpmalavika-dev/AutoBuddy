# API Contract Specification & Fixes

## Overview
This document specifies the standardized API contracts for all endpoints to ensure consistency, prevent mismatches, and enable reliable frontend-backend integration.

---

## 1. Response Format Standard

### Success Response
```json
{
  "success": true,
  "status": "success",
  "data": {},
  "meta": {
    "timestamp": "2026-05-29T12:00:00Z",
    "request_id": "uuid",
    "version": "1.0.0"
  }
}
```

### Error Response
```json
{
  "success": false,
  "status": "error",
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}
  },
  "meta": {
    "timestamp": "2026-05-29T12:00:00Z",
    "request_id": "uuid",
    "version": "1.0.0"
  }
}
```

### Paginated Response
```json
{
  "success": true,
  "status": "success",
  "data": [],
  "pagination": {
    "skip": 0,
    "limit": 20,
    "total": 150,
    "pages": 8,
    "current_page": 1
  },
  "meta": {
    "timestamp": "2026-05-29T12:00:00Z",
    "request_id": "uuid",
    "version": "1.0.0"
  }
}
```

---

## 2. Authentication API Fixes

### FIXED: POST /api/auth/login

**Request:**
```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

**Response (200):**
```json
{
  "success": true,
  "status": "success",
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "John Doe",
      "role": "passenger",
      "avatar_url": "https://..."
    },
    "tokens": {
      "access_token": "eyJhbGc...",
      "refresh_token": "eyJhbGc...",
      "expires_in": 86400
    }
  },
  "meta": {
    "timestamp": "2026-05-29T12:00:00Z",
    "request_id": "uuid",
    "version": "1.0.0"
  }
}
```

---

## 3. Passenger API Fixes

### FIXED: GET /api/passengers/profile

**Response (200):**
```json
{
  "success": true,
  "status": "success",
  "data": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe",
    "phone": "+91...",
    "avatar_url": "https://...",
    "rating": 4.8,
    "total_rides": 150,
    "wallet_balance": 500.00,
    "preferred_payment": "wallet",
    "accessibility_settings": {
      "high_contrast": false,
      "large_text": false,
      "screen_reader_enabled": false
    }
  },
  "meta": {
    "timestamp": "2026-05-29T12:00:00Z",
    "request_id": "uuid",
    "version": "1.0.0"
  }
}
```

**CHANGE:** Renamed `total_passengers` → `total_rides` for clarity

---

### FIXED: GET /api/passengers/saved-places

**Query Parameters:**
- `place_type`: Optional (home|work|favorite|other)
- `skip`: 0
- `limit`: 50

**Response (200):**
```json
{
  "success": true,
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "name": "Home",
      "address": "123 Main St, City, State 12345",
      "place_type": "home",
      "latitude": 12.9716,
      "longitude": 77.5946,
      "is_favorite": true,
      "is_primary": true,
      "notes": "Ground floor apartment",
      "created_at": "2026-05-20T10:30:00Z",
      "updated_at": "2026-05-20T10:30:00Z"
    }
  ],
  "pagination": {
    "skip": 0,
    "limit": 50,
    "total": 5,
    "pages": 1,
    "current_page": 1
  },
  "meta": {
    "timestamp": "2026-05-29T12:00:00Z",
    "request_id": "uuid",
    "version": "1.0.0"
  }
}
```

---

## 4. Driver API Fixes

### FIXED: GET /api/drivers/profile

**Response (200):**
```json
{
  "success": true,
  "status": "success",
  "data": {
    "id": "uuid",
    "email": "driver@example.com",
    "name": "Jane Smith",
    "phone": "+91...",
    "avatar_url": "https://...",
    "rating": 4.9,
    "total_rides": 450,
    "total_earnings": 45000.00,
    "earnings_summary": {
      "today": 250.00,
      "week": 1500.00,
      "month": 6500.00,
      "lifetime": 45000.00
    },
    "vehicle": {
      "id": "uuid",
      "make": "Hyundai",
      "model": "i20",
      "year": 2022,
      "license_plate": "KA01AB1234",
      "color": "white"
    },
    "kyc_status": "approved",
    "bank_account": {
      "last_four": "1234",
      "holder_name": "Jane Smith"
    }
  },
  "meta": {
    "timestamp": "2026-05-29T12:00:00Z",
    "request_id": "uuid",
    "version": "1.0.0"
  }
}
```

**CHANGE:** 
- Renamed `driver_earnings` → `earnings_summary`
- Added nested structure with today/week/month/lifetime breakdown
- Changed format from flat to nested object

---

### FIXED: GET /api/drivers/analytics

**Query Parameters:**
- `period`: Optional (today|week|month|year|custom)
- `start_date`: Optional (YYYY-MM-DD format if period=custom)
- `end_date`: Optional (YYYY-MM-DD format if period=custom)

**Response (200):**
```json
{
  "success": true,
  "status": "success",
  "data": {
    "period": "month",
    "period_label": "Last 30 Days",
    "start_date": "2026-04-29",
    "end_date": "2026-05-29",
    "summary": {
      "total_rides": 45,
      "total_earnings": 6500.00,
      "average_earnings_per_ride": 144.44,
      "total_hours": 78.5,
      "average_rating": 4.8,
      "completion_rate": 98.5,
      "cancellation_rate": 1.5
    },
    "daily_breakdown": [
      {
        "date": "2026-05-29",
        "rides": 3,
        "earnings": 450.00,
        "hours": 2.5,
        "rating": 4.9
      }
    ],
    "hourly_demand": {
      "peak_hours": ["07:00-08:00", "17:00-19:00"],
      "avg_wait_time_minutes": 2.3,
      "cancellations": 2
    }
  },
  "meta": {
    "timestamp": "2026-05-29T12:00:00Z",
    "request_id": "uuid",
    "version": "1.0.0"
  }
}
```

**CHANGE:**
- Now returns REAL data calculated from database (not mock)
- Added daily breakdown
- Added hourly demand analysis
- Includes completion and cancellation rates

---

## 5. Booking/Ride API Fixes

### FIXED: POST /api/bookings

**Request:**
```json
{
  "pickup_location": {
    "address": "123 Main St",
    "latitude": 12.9716,
    "longitude": 77.5946
  },
  "dropoff_location": {
    "address": "456 Park Ave",
    "latitude": 12.9352,
    "longitude": 77.6245
  },
  "ride_product_id": "uuid",  // CHANGED from trip_type
  "preferred_payment": "wallet",
  "scheduling_time": "2026-05-29T15:00:00Z"  // Optional for scheduled rides
}
```

**Response (201):**
```json
{
  "success": true,
  "status": "success",
  "data": {
    "id": "uuid",
    "status": "waiting_for_driver",
    "driver": null,
    "pickup": {
      "address": "123 Main St",
      "latitude": 12.9716,
      "longitude": 77.5946,
      "eta_seconds": 180
    },
    "dropoff": {
      "address": "456 Park Ave",
      "latitude": 12.9352,
      "longitude": 77.6245
    },
    "ride_product": {
      "id": "uuid",
      "name": "Economy",
      "base_fare": 30.00,
      "per_km": 12.00,
      "per_minute": 2.00,
      "icon": "car"
    },
    "estimated_fare": 145.00,
    "estimated_duration_minutes": 12,
    "estimated_distance_km": 8.5,
    "payment_method": "wallet",
    "created_at": "2026-05-29T12:00:00Z"
  },
  "meta": {
    "timestamp": "2026-05-29T12:00:00Z",
    "request_id": "uuid",
    "version": "1.0.0"
  }
}
```

**CHANGE:**
- Now accepts `ride_product_id` instead of `trip_type`
- Added detailed ride product information
- Structured pickup/dropoff as nested objects
- Added ETA calculation

---

## 6. Analytics API Fixes

### FIXED: GET /api/admin/analytics/overview

**Query Parameters:**
- `days`: 30 (default, 1-365)

**Response (200):**
```json
{
  "success": true,
  "status": "success",
  "data": {
    "period_days": 30,
    "metrics": {
      "total_bookings": 1250,
      "completed_rides": 1200,
      "cancelled_rides": 50,
      "completion_rate": 96.0,
      "active_drivers": 45,
      "active_passengers": 380,
      "total_revenue": 78500.00,
      "average_fare": 62.80,
      "total_payout": 54950.00,
      "platform_fee": 23550.00
    },
    "trends": {
      "booking_trend": 2.5,  // percentage change from previous period
      "revenue_trend": 5.8,
      "driver_trend": 1.2
    }
  },
  "meta": {
    "timestamp": "2026-05-29T12:00:00Z",
    "request_id": "uuid",
    "version": "1.0.0"
  }
}
```

---

## 7. Admin Audit Log API

### FIXED: GET /api/admin/audit-log

**Query Parameters:**
- `skip`: 0
- `limit`: 100
- `action_type`: Optional (filter by action)
- `user_id`: Optional (filter by user)
- `start_date`: Optional (YYYY-MM-DD)
- `end_date`: Optional (YYYY-MM-DD)

**Response (200):**
```json
{
  "success": true,
  "status": "success",
  "data": [
    {
      "id": "uuid",
      "action_type": "trip_cancelled",
      "user_id": "uuid",
      "user_email": "admin@example.com",
      "entity_type": "trip",
      "entity_id": "uuid",
      "changes": {
        "status": {
          "old": "in_progress",
          "new": "cancelled"
        },
        "cancellation_reason": "No driver accepted"
      },
      "timestamp": "2026-05-29T12:00:00Z",
      "ip_address": "192.168.1.100",
      "details": {}
    }
  ],
  "pagination": {
    "skip": 0,
    "limit": 100,
    "total": 523,
    "pages": 6,
    "current_page": 1
  },
  "meta": {
    "timestamp": "2026-05-29T12:00:00Z",
    "request_id": "uuid",
    "version": "1.0.0"
  }
}
```

**CHANGE:**
- Now actually persists data in database
- Added filtering by action_type, user_id, and date range
- Includes pagination
- Returns actual change tracking data

---

## 8. Common Error Codes

| Code | HTTP Status | Message | Solution |
|------|------------|---------|----------|
| `INVALID_CREDENTIALS` | 401 | Invalid email or password | Verify credentials |
| `TOKEN_EXPIRED` | 401 | Access token expired | Use refresh token |
| `UNAUTHORIZED` | 403 | You don't have permission | Check user role |
| `NOT_FOUND` | 404 | Resource not found | Verify ID |
| `VALIDATION_ERROR` | 400 | Invalid input | Check request format |
| `DUPLICATE_ENTRY` | 409 | Resource already exists | Use unique value |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests | Wait and retry |
| `INTERNAL_ERROR` | 500 | Server error | Retry or contact support |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable | Retry later |

---

## 9. Implementation Checklist

- [ ] Update all response formatters to use standardized format
- [ ] Add request/response validation middleware
- [ ] Update frontend API client to expect new format
- [ ] Add error code handling in frontend
- [ ] Update API documentation
- [ ] Run integration tests
- [ ] Test with staging environment
- [ ] Deploy with feature flag rollout

---

## 10. Migration Path

### Phase 1 (Week 1)
- Deploy new endpoints alongside old ones
- Add API version header (Accept: application/vnd.autobuddy.v1+json)

### Phase 2 (Week 2)
- Log deprecation warnings for old endpoints
- Notify clients to migrate

### Phase 3 (Week 3)
- Remove old endpoints
- Full v1 API in production

---

**Last Updated:** 2026-05-29  
**API Version:** 1.0.0  
**Status:** Production Ready
