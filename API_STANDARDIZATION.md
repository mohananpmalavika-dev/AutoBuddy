# AutoBuddy API Contract & Standardization Guide

## Version: 1.0
## Last Updated: 2026-06-21

---

## Table of Contents
1. [Standard Response Format](#standard-response-format)
2. [Error Handling](#error-handling)
3. [Pagination](#pagination)
4. [API Versioning](#api-versioning)
5. [Rate Limiting](#rate-limiting)
6. [Status Codes](#status-codes)
7. [Request Headers](#request-headers)
8. [Examples](#examples)

---

## Standard Response Format

All API responses follow this standardized structure:

```json
{
  "status": "success|error|partial",
  "message": "Human readable message",
  "data": {},
  "pagination": {},
  "metadata": {},
  "timestamp": "2026-06-21T10:30:00Z",
  "version": "1.0",
  "request_id": "req_xxxxx"
}
```

### Success Response (200)
```json
{
  "status": "success",
  "message": "Operation completed successfully",
  "data": {
    "id": "user_123",
    "name": "John Doe"
  },
  "timestamp": "2026-06-21T10:30:00Z",
  "version": "1.0"
}
```

### List Response with Pagination (200)
```json
{
  "status": "success",
  "message": "Items retrieved successfully",
  "data": [
    { "id": 1, "name": "Item 1" },
    { "id": 2, "name": "Item 2" }
  ],
  "pagination": {
    "total": 100,
    "limit": 20,
    "offset": 0,
    "page": 1,
    "pages": 5,
    "has_next": true,
    "has_prev": false
  },
  "timestamp": "2026-06-21T10:30:00Z",
  "version": "1.0"
}
```

### Created Response (201)
```json
{
  "status": "success",
  "message": "Resource created successfully",
  "data": {
    "id": "res_123",
    "created_at": "2026-06-21T10:30:00Z"
  },
  "metadata": {
    "resource_id": "res_123"
  },
  "timestamp": "2026-06-21T10:30:00Z",
  "version": "1.0"
}
```

---

## Error Handling

### Standard Error Response
```json
{
  "status": "error",
  "message": "Operation failed",
  "error": {
    "code": "validation_error",
    "message": "Email is invalid",
    "details": {
      "field": "email",
      "value": "invalid-email"
    }
  },
  "timestamp": "2026-06-21T10:30:00Z",
  "version": "1.0",
  "request_id": "req_xxxxx"
}
```

### Validation Error (422)
```json
{
  "status": "error",
  "message": "Validation failed",
  "error": {
    "code": "validation_error",
    "message": "Request validation failed"
  },
  "errors": [
    {
      "field": "email",
      "code": "invalid_format",
      "message": "Email format is invalid"
    },
    {
      "field": "phone",
      "code": "required",
      "message": "Phone number is required"
    }
  ],
  "timestamp": "2026-06-21T10:30:00Z",
  "version": "1.0"
}
```

### Error Codes Reference

| Code | Status | Description |
|------|--------|-------------|
| `bad_request` | 400 | Invalid request parameters |
| `unauthorized` | 401 | Authentication required or invalid |
| `forbidden` | 403 | Insufficient permissions |
| `not_found` | 404 | Resource not found |
| `conflict` | 409 | Resource conflict (e.g., duplicate) |
| `validation_error` | 422 | Request validation failed |
| `rate_limit_exceeded` | 429 | Too many requests |
| `internal_server_error` | 500 | Server error |

---

## Pagination

Pagination parameters and metadata are standardized across all list endpoints.

### Query Parameters
```
GET /api/v1/resource?limit=20&offset=0
GET /api/v1/resource?page=1&per_page=20  (alternative)
```

### Pagination Metadata
```json
{
  "pagination": {
    "total": 250,        // Total number of items
    "limit": 20,         // Items per page
    "offset": 0,         // Starting position
    "page": 1,           // Current page number
    "pages": 13,         // Total pages
    "has_next": true,    // Whether next page exists
    "has_prev": false    // Whether previous page exists
  }
}
```

---

## API Versioning

All endpoints must include version prefix: `/api/v1/`

### Supported Versions
- `v1` - Current stable version
- `v2` - (Planning) Future version with breaking changes

### Version Selection
1. **URL Path** (Primary): `/api/v1/resource`
2. **Header** (Optional): `X-API-Version: v1`

### Version Deprecation Policy
- Announcement period: 6 months
- Maintenance period: 6 months
- Sunset period: 6 months

---

## Rate Limiting

All endpoints are rate limited with the following defaults:

- **Public endpoints**: 100 requests/minute
- **Authenticated endpoints**: 1000 requests/minute
- **Admin endpoints**: 5000 requests/minute

### Rate Limit Headers
```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1624266600
```

### 429 Response
```json
{
  "status": "error",
  "message": "Too many requests",
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Rate limit exceeded. Retry after 60 seconds",
    "retry_after_seconds": 60
  },
  "timestamp": "2026-06-21T10:30:00Z"
}
```

---

## Status Codes

Standard HTTP status codes:

| Code | Meaning | Use When |
|------|---------|----------|
| 200 | OK | Successful GET, PUT, PATCH |
| 201 | Created | Successful POST |
| 204 | No Content | Successful DELETE with no response |
| 207 | Multi-Status | Partial success (some items failed) |
| 400 | Bad Request | Invalid parameters |
| 401 | Unauthorized | Missing/invalid authentication |
| 403 | Forbidden | Authenticated but not authorized |
| 404 | Not Found | Resource not found |
| 409 | Conflict | Resource conflict (e.g., duplicate key) |
| 422 | Unprocessable Entity | Validation failed |
| 429 | Too Many Requests | Rate limited |
| 500 | Server Error | Internal error |
| 503 | Service Unavailable | Maintenance or overload |

---

## Request Headers

Required and optional headers:

### Required
```
Content-Type: application/json
X-API-Version: v1
```

### Authentication
```
Authorization: Bearer {token}
```

### Optional
```
X-Client-Version: 1.0.0
X-Request-ID: unique-request-id
Accept-Language: en-US
```

---

## Examples

### Example 1: Get User Profile
```
GET /api/v1/users/user_123

Response 200:
{
  "status": "success",
  "message": "User retrieved successfully",
  "data": {
    "id": "user_123",
    "name": "John Doe",
    "email": "john@example.com",
    "user_type": "passenger"
  },
  "timestamp": "2026-06-21T10:30:00Z",
  "version": "1.0"
}
```

### Example 2: List Rides with Pagination
```
GET /api/v1/rides?limit=10&offset=0

Response 200:
{
  "status": "success",
  "message": "Rides retrieved successfully",
  "data": [
    {
      "id": "ride_1",
      "pickup": "123 Main St",
      "dropoff": "456 Oak Ave",
      "fare": 25.50
    },
    {
      "id": "ride_2",
      "pickup": "789 Pine Ln",
      "dropoff": "321 Elm St",
      "fare": 18.75
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 10,
    "offset": 0,
    "page": 1,
    "pages": 15,
    "has_next": true,
    "has_prev": false
  },
  "timestamp": "2026-06-21T10:30:00Z",
  "version": "1.0"
}
```

### Example 3: Create Ride with Validation Error
```
POST /api/v1/rides
{
  "pickup": "",
  "dropoff": "123 Main St"
}

Response 422:
{
  "status": "error",
  "message": "Validation failed",
  "error": {
    "code": "validation_error",
    "message": "Request validation failed"
  },
  "errors": [
    {
      "field": "pickup",
      "code": "required",
      "message": "Pickup location is required"
    }
  ],
  "timestamp": "2026-06-21T10:30:00Z",
  "version": "1.0"
}
```

### Example 4: Handle Rate Limiting
```
GET /api/v1/rides (after 1000 requests)

Response 429:
{
  "status": "error",
  "message": "Too many requests",
  "error": {
    "code": "rate_limit_exceeded",
    "message": "Rate limit exceeded. Retry after 60 seconds",
    "retry_after_seconds": 60
  },
  "timestamp": "2026-06-21T10:30:00Z",
  "version": "1.0"
}

Headers:
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1624266600
Retry-After: 60
```

---

## Implementation Guidelines

### Backend (FastAPI)
1. Always use `ResponseBuilder` from `app/utils/unified_responses.py`
2. Include `request_id` for tracing
3. Validate all requests before processing
4. Return appropriate status codes

### Frontend (React Native)
1. Use `validateStandardResponse()` to validate responses
2. Handle `pagination` metadata when present
3. Display `error.message` to users
4. Retry on `rate_limit_exceeded` after `retry_after_seconds`

### Example Backend Usage
```python
from app.utils.unified_responses import ResponseBuilder, ErrorCode, ErrorDetail

# Success response
response, status_code = ResponseBuilder.success(
    data=user_data,
    message="User retrieved successfully"
)
return response.to_dict(), status_code

# Paginated response
response, status_code = ResponseBuilder.paginated(
    items=users,
    total=total_count,
    limit=limit,
    offset=offset
)
return response.to_dict(), status_code

# Error response
errors = [ErrorDetail(field="email", code="invalid", message="Invalid email")]
response, status_code = ResponseBuilder.validation_error(errors)
return response.to_dict(), status_code
```

---

## Migration Guide

### From Old Response Format
```json
// Old
{
  "success": true,
  "data": { ... }
}

// New
{
  "status": "success",
  "message": "Operation completed",
  "data": { ... },
  "timestamp": "2026-06-21T10:30:00Z",
  "version": "1.0"
}
```

### Update Endpoints
Use the `ResponseBuilder` to migrate endpoints systematically:
1. Import `ResponseBuilder` and error types
2. Replace response dict construction with builder methods
3. Add request_id tracking for debugging
4. Test with standardized response validation

---

## Related Files
- Backend: `app/utils/unified_responses.py`
- Frontend: `src/utils/apiClient.ts`
- Documentation: This file
