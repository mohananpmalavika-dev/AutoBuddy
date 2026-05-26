# API Documentation

## 1. Introduction
This document describes the AutoBuddy backend API endpoints, request/response contracts, and authentication requirements.

## 2. Authentication
- All endpoints require bearer token authentication except public health checks.
- Tokens are issued on login and refreshed via the auth flow.

## 3. User Endpoints
### POST /auth/login
- Request: `{ email, password }`
- Response: `{ access_token, refresh_token, user }`

### POST /auth/register
- Request: `{ name, email, phone, role, password }`
- Response: `{ user, next_steps }`

### GET /users/me
- Response: `{ id, name, role, status, profile }`

## 4. Ride Endpoints
### POST /rides
- Request: `{ pickup, dropoff, passenger_id, ride_type, payment_method }`
- Response: `{ ride_id, status, estimated_fare }`

### GET /rides/{ride_id}
- Response: `{ ride_details, driver_info, status, route }`

### POST /rides/{ride_id}/cancel
- Request: `{ reason }`
- Response: `{ status: cancelled }`

## 5. Driver Endpoints
### GET /drivers/available
- Response: `[{ driver_id, location, rating, status }]`

### POST /drivers/{driver_id}/accept
- Request: `{ ride_id }`
- Response: `{ status: accepted, assigned_ride }`

## 6. Admin Endpoints
### GET /admin/rides
- Response: `[{ ride_id, status, passenger, driver, fare }]`

### POST /admin/drivers/{driver_id}/verify
- Request: `{ verification_status, notes }`
- Response: `{ driver_id, status }`

## 7. Payment Endpoints
### POST /payments/intents
- Request: `{ ride_id, amount, currency, payment_method }`
- Response: `{ payment_intent_id, status }`

### GET /payments/{payment_id}
- Response: `{ payment_status, amount, ride_id }`

## 8. Realtime Endpoints
- WebSocket/Socket.IO namespace for ride events, driver location updates, and chat.
- Events: `ride:update`, `location:update`, `chat:message`, `ride:status`.

## 9. Error Codes
- `400`: Validation error.
- `401`: Unauthorized.
- `403`: Forbidden.
- `404`: Not found.
- `500`: Server error.

## 10. Notes
- All payloads use JSON.
- Use UTC timestamps for all date/time fields.
- Protect admin APIs with RBAC scopes.
