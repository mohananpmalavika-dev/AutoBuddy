# Rate Limit Configuration System

## Overview

The AutoBuddy platform includes a comprehensive rate limiting system to protect API endpoints from abuse and ensure fair usage. This guide explains how to configure rate limits through the admin dashboard.

## What is Rate Limiting?

Rate limiting controls how many requests a user or IP address can make to an API endpoint within a specific time window. When the limit is exceeded, requests are rejected with a 429 (Too Many Requests) response.

## Architecture

### Components

1. **Backend API** (`backend/app/utils/rate_limiting.py`)
   - In-memory rate limiter for single instances
   - Redis-based rate limiter for distributed deployments

2. **Middleware** (`backend/app/middleware/rate_limiting.py`)
   - Intercepts requests and applies rate limiting
   - Excludes certain endpoints from rate limiting

3. **Admin Endpoints** (`backend/app/routers/admin_system_config.py`)
   - Manage global rate limits
   - Configure endpoint-specific limits

4. **Admin UI** (`autobuddy-mobile/src/components/AdminRateLimitConfig.js`)
   - Interface to view and configure rate limits

## Default Rate Limits

### Global Limits

The system comes with predefined limits:

| Limit Type | Max Requests | Window | Purpose |
|-----------|-------------|--------|---------|
| **Strict** | 5 | 60 sec | Login, registration, payment endpoints |
| **Moderate** | 30 | 60 sec | Booking, support tickets |
| **Normal** | 100 | 60 sec | General API endpoints |
| **Authenticated** | 500 | 3600 sec | Per-user limits for logged-in users |
| **Anonymous** | 50 | 3600 sec | Per-IP limits for unauthenticated users |

### Strict Endpoints (Default)

```
/api/auth/login
/api/auth/register
/api/payments/order
/api/payments/verify
/api/admin/audit-log
```

### Moderate Endpoints (Default)

```
/api/bookings
/api/support/tickets
```

## Accessing Rate Limit Configuration

### Admin Dashboard

1. Navigate to the **Admin Dashboard**
2. Click **"Other Menus"** button
3. Select **"Rate Limits"** from the menu
4. Two tabs will appear:
   - **Global Limits** - Configure default rate limits
   - **Endpoint Limits** - Set limits for specific endpoints

## Configuration Guide

### Global Limits Tab

#### Viewing Global Limits

The Global Limits tab shows all available limit types with their current settings.

**Fields:**
- **Limit Type**: strict, moderate, normal, authenticated, or anonymous
- **Max Requests**: Number of requests allowed in the time window
- **Window**: Time period in seconds (1-3600)
- **Status**: Enabled or Disabled
- **Description**: Purpose or notes about the limit

#### Editing a Global Limit

1. Click the **"Edit"** button on any limit card
2. Modify the values:
   - **Max Requests**: Increase for more permissive limits, decrease for stricter enforcement
   - **Window (seconds)**: Adjust the time window (60 = 1 minute, 3600 = 1 hour)
   - **Description**: Add or update notes
3. Toggle the **"Enabled"** checkbox to enable/disable the limit
4. Click **"Save"** to apply changes

**Example:** To allow 10 requests per minute for strict endpoints:
- Max Requests: 10
- Window: 60

### Endpoint Limits Tab

#### Adding a Custom Endpoint Limit

Custom limits override global limits for specific endpoints.

1. Click **"+ Add Endpoint Limit"** button
2. Fill in the form:
   - **Endpoint Path**: Full API path (e.g., `/api/bookings/create`)
   - **Limit Type**: Choose base limit type (strict, moderate, normal)
   - **Max Requests**: Override value for this endpoint
   - **Window (seconds)**: Override time window
   - **Description**: Optional notes
3. Toggle **"Enabled"** if needed
4. Click **"Save"**

#### Editing an Endpoint Limit

1. Click the **✎ (edit)** button on the endpoint card
2. Modify the settings
3. Click **"Save"**

#### Deleting an Endpoint Limit

1. Click the **🗑 (delete)** button on the endpoint card
2. Confirm the deletion

**Endpoint Path Format:**
- Use exact paths: `/api/bookings`
- Include version if applicable: `/api/v2/rides`
- Don't include query parameters

## Rate Limit Behaviors

### When Rate Limit is Exceeded

**Response Status:** 429 Too Many Requests

**Response Headers:**
```
X-RateLimit-Limit: 5
X-RateLimit-Window: 60
Retry-After: 45
```

**Response Body:**
```json
{
  "code": "rate_limit_exceeded",
  "detail": "Rate limit exceeded",
  "retry_after": 45
}
```

### Rate Limit Keys

The system determines rate limits based on:

1. **For Authenticated Requests**
   - User ID is used as the rate limit key
   - Example: `user:12345`

2. **For Unauthenticated Requests**
   - Client IP address is used
   - Example: `ip:192.168.1.1`

### Excluded Endpoints

These endpoints are NOT rate limited:
- Health check endpoints
- Metrics endpoints
- Certain admin endpoints

## Best Practices

### Setting Limits

1. **Start Conservative**: Set lower limits initially, then relax based on metrics
2. **Monitor Usage**: Track API usage patterns before adjusting
3. **Segment Endpoints**: Use endpoint-specific limits for sensitive operations
4. **Consider Peak Hours**: Account for legitimate traffic spikes

### Examples

#### Protect Payment Endpoints
```
Endpoint: /api/payments/verify
Max Requests: 3
Window: 60 seconds
```

#### Allow High-Volume Endpoints
```
Endpoint: /api/trips/nearby
Max Requests: 100
Window: 60 seconds
```

#### Gradual Login Restriction
```
Endpoint: /api/auth/login
Max Requests: 5
Window: 300 seconds (5 minutes)
```

## API Endpoints

### Get Global Rate Limits
```
GET /api/admin/config/rate-limits
Authorization: Bearer <token>
```

**Response:**
```json
{
  "total": 5,
  "limits": [
    {
      "limit_id": "strict",
      "limit_type": "strict",
      "max_requests": 5,
      "window_seconds": 60,
      "description": "Strict limit for sensitive endpoints",
      "enabled": true,
      "is_default": true
    }
  ]
}
```

### Update Global Rate Limit
```
PUT /api/admin/config/rate-limits/{limit_type}
Authorization: Bearer <token>
Content-Type: application/json

{
  "limit_type": "strict",
  "max_requests": 10,
  "window_seconds": 60,
  "description": "Updated strict limit",
  "enabled": true
}
```

### Get Endpoint Rate Limits
```
GET /api/admin/config/rate-limits/endpoints
Authorization: Bearer <token>
```

### Add Endpoint Rate Limit
```
POST /api/admin/config/rate-limits/endpoints/add
Authorization: Bearer <token>
Content-Type: application/json

{
  "endpoint": "/api/bookings",
  "limit_type": "moderate",
  "max_requests": 20,
  "window_seconds": 60,
  "description": "Custom limit for bookings",
  "enabled": true
}
```

### Update Endpoint Rate Limit
```
PUT /api/admin/config/rate-limits/endpoints/{config_id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "endpoint": "/api/bookings",
  "limit_type": "moderate",
  "max_requests": 25,
  "window_seconds": 60,
  "description": "Increased limit for bookings",
  "enabled": true
}
```

### Delete Endpoint Rate Limit
```
DELETE /api/admin/config/rate-limits/endpoints/{config_id}
Authorization: Bearer <token>
```

## Troubleshooting

### Users Getting 429 Errors

1. **Check if limit is too strict** - Review the rate limit configuration
2. **Verify endpoint** - Ensure the limit applies to the correct endpoint
3. **Adjust Window** - Longer windows are more forgiving for bursty traffic
4. **Add Whitelist** (custom implementation) - Create exceptions for certain IPs/users

### Rate Limiter Not Working

1. **Verify middleware is enabled** - Check `server.py` includes the rate limiting middleware
2. **Check Redis connection** - If using Redis, ensure Redis is accessible
3. **Review logs** - Check application logs for errors
4. **Test with curl**:
   ```bash
   curl -X POST http://localhost:8000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@test.com","password":"test"}' \
     -w "\n%{http_code}\n" \
     --max-time 1
   ```

### Configuration Not Taking Effect

1. **Restart the service** - Changes require service restart
2. **Check database** - Verify configuration is saved in MongoDB
3. **Verify user role** - Only admin users can modify rate limits

## Monitoring Rate Limits

### Recommended Metrics to Track

1. **Rate Limit Hits**
   - Count of 429 responses per endpoint
   - Trend over time

2. **Client Analysis**
   - Top IPs/users hitting rate limits
   - Legitimate vs. bot traffic patterns

3. **Endpoint Performance**
   - Request volume by endpoint
   - Peak usage times

### Integration with Monitoring

The rate limiting system logs all violations:

```python
logger.info(f"Rate limit exceeded for {key} on {path}")
```

Monitor logs for patterns indicating:
- DDoS attacks
- Misconfigured clients
- Need for limit adjustments

## Security Considerations

1. **Authentication Bypass**: Authenticated users get higher limits - ensure auth is secure
2. **IP Spoofing**: IP-based limits are vulnerable to spoofing; use for non-critical endpoints
3. **Distributed Attacks**: Single-instance in-memory limiter can't handle distributed attacks; use Redis for production
4. **Whitelist Trusted Services**: Configure internal services to bypass rate limits if needed

## Future Enhancements

Potential improvements:
- Dynamic rate limiting based on system load
- User tier-based limits (premium vs. free users)
- Geographic rate limits
- Time-based adjustments (different limits during peak hours)
- Machine learning-based anomaly detection

---

**Last Updated:** May 29, 2026  
**Version:** 1.0.0
