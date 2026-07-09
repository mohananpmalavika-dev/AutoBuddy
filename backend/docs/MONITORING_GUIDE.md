# Monitoring & Observability Guide

## Overview

AutoBuddy uses a comprehensive monitoring stack for production observability:
- **Prometheus** - Metrics collection and storage
- **Grafana** - Metrics visualization and dashboards
- **Structured Logging** - JSON logs with request correlation
- **Sentry** - Error tracking and alerting
- **Health Checks** - Liveness and readiness probes

---

## Quick Start

### 1. Enable Monitoring

```bash
# backend/.env
ENABLE_METRICS=true
ENABLE_REQUEST_LOGGING=true
LOG_JSON=true
LOG_LEVEL=INFO
SENTRY_DSN=your_sentry_dsn_here
```

### 2. Start Prometheus

```bash
# Using Docker
docker run -d \
  --name prometheus \
  -p 9090:9090 \
  -v ./backend/config/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus

# Or install locally
brew install prometheus  # Mac
apt-get install prometheus  # Ubuntu
```

### 3. Start Grafana

```bash
# Using Docker
docker run -d \
  --name grafana \
  -p 3000:3000 \
  grafana/grafana

# Access at http://localhost:3000
# Default credentials: admin/admin
```

### 4. Import Dashboards

1. Login to Grafana (http://localhost:3000)
2. Go to Dashboards → Import
3. Upload `backend/config/grafana-dashboard-api.json`
4. Upload `backend/config/grafana-dashboard-system.json`

---

## Metrics Endpoints

### Application Metrics

**Endpoint**: `GET /api/metrics`  
**Format**: Prometheus exposition format  
**Auth**: Public (consider restricting in production)

```bash
# Scrape metrics
curl http://localhost:8000/api/metrics

# Sample output
# HELP http_requests_total Total HTTP requests
# TYPE http_requests_total counter
http_requests_total{method="GET",endpoint="/api/v1/rides",status="200"} 1523
http_requests_total{method="POST",endpoint="/api/v1/rides",status="201"} 342

# HELP http_request_duration_seconds HTTP request duration
# TYPE http_request_duration_seconds histogram
http_request_duration_seconds_bucket{method="GET",endpoint="/api/v1/rides",le="0.1"} 1200
http_request_duration_seconds_bucket{method="GET",endpoint="/api/v1/rides",le="0.5"} 1480
```

---

## Health Checks

### Basic Health Check (Liveness)

**Endpoint**: `GET /api/health`  
**Purpose**: Load balancer liveness probe  
**Response Time**: <50ms

```bash
curl http://localhost:8000/api/health
```

```json
{
  "status": "healthy",
  "timestamp": "2026-07-09T12:00:00Z",
  "service": "autobuddy-backend",
  "version": "1.0.0"
}
```

### Detailed Health Check (Readiness)

**Endpoint**: `GET /api/health/ready`  
**Purpose**: Readiness probe, includes dependency checks  
**Response Time**: <2s

```bash
curl http://localhost:8000/api/health/ready
```

```json
{
  "status": "healthy",
  "timestamp": "2026-07-09T12:00:00Z",
  "service": "autobuddy-backend",
  "version": "1.0.0",
  "uptime": {
    "uptime_seconds": 3600,
    "uptime_human": "1:00:00",
    "started_at": "2026-07-09T11:00:00Z"
  },
  "checks": {
    "mongodb": {
      "status": "healthy",
      "response_time_ms": 5
    },
    "postgresql": {
      "status": "healthy",
      "response_time_ms": 3
    },
    "redis": {
      "status": "healthy",
      "response_time_ms": 1
    },
    "disk": {
      "status": "healthy",
      "percent_used": 45.2,
      "free_gb": 120.5,
      "total_gb": 220.0
    },
    "memory": {
      "status": "healthy",
      "percent_used": 62.3,
      "available_gb": 6.2,
      "total_gb": 16.0
    }
  }
}
```

**Status Values**:
- `healthy` - All checks passed
- `degraded` - Some warnings present
- `unhealthy` - Critical issues detected

---

## Available Metrics

### HTTP Metrics

| Metric | Type | Description | Labels |
|--------|------|-------------|--------|
| `http_requests_total` | Counter | Total HTTP requests | method, endpoint, status |
| `http_request_duration_seconds` | Histogram | Request duration | method, endpoint |

### Business Metrics

| Metric | Type | Description | Labels |
|--------|------|-------------|--------|
| `active_users_total` | Gauge | Current active users | - |
| `active_rides_total` | Gauge | Current active rides | - |
| `available_drivers_total` | Gauge | Available drivers | - |
| `rides_by_status` | Gauge | Rides grouped by status | status |

### Database Metrics

| Metric | Type | Description | Labels |
|--------|------|-------------|--------|
| `database_operations_total` | Counter | Total DB operations | operation, collection, status |
| `database_operation_duration_seconds` | Histogram | DB operation duration | operation, collection |

### External API Metrics

| Metric | Type | Description | Labels |
|--------|------|-------------|--------|
| `external_api_calls_total` | Counter | External API calls | service, status |
| `external_api_duration_seconds` | Histogram | External API duration | service |

### Payment Metrics

| Metric | Type | Description | Labels |
|--------|------|-------------|--------|
| `payment_transactions_total` | Counter | Payment transactions | method, status |

### System Metrics

| Metric | Type | Description | Labels |
|--------|------|-------------|--------|
| `system_cpu_usage_percent` | Gauge | CPU usage percentage | - |
| `system_memory_usage_percent` | Gauge | Memory usage percentage | - |
| `system_disk_usage_percent` | Gauge | Disk usage percentage | - |

---

## Structured Logging

### Log Format

All logs are in JSON format (production) or human-readable (development):

```json
{
  "timestamp": "2026-07-09T12:00:00.123Z",
  "level": "INFO",
  "logger": "app.routers.rides",
  "message": "Ride created successfully",
  "request_id": "req-abc-123",
  "user_id": "user-456",
  "endpoint": "POST /api/v1/rides",
  "environment": "production",
  "service": "autobuddy-backend",
  "module": "rides",
  "function": "create_ride",
  "line": 145,
  "ride_id": "ride-789",
  "duration_ms": 45.2
}
```

### Request Correlation

Every request has a unique `request_id` that flows through:
- All log entries
- HTTP response header: `X-Request-ID`
- Database operations
- External API calls

**Usage**:
```bash
# Search logs for specific request
grep "req-abc-123" logs/backend.log

# Or in Elasticsearch/CloudWatch
request_id:"req-abc-123"
```

### Log Levels

| Level | Usage | Examples |
|-------|-------|----------|
| **DEBUG** | Development only | Variable values, detailed flow |
| **INFO** | Significant events | Ride created, payment completed |
| **WARNING** | Recoverable issues | Retry attempts, deprecated API usage |
| **ERROR** | Error conditions | Failed payment, database error |
| **CRITICAL** | System failures | Database unavailable, service crash |

### Structured Log Helpers

```python
from app.core.logging_config import (
    get_logger,
    log_api_request,
    log_database_query,
    log_external_api_call,
    log_business_event,
    log_security_event
)

logger = get_logger(__name__)

# Log API request
log_api_request(logger, 'POST', '/api/v1/rides', 201, 45.2, 'user-123')

# Log database operation
log_database_query(logger, 'insert', 'rides', 12.5, success=True)

# Log external API call
log_external_api_call(logger, 'Google Maps', '/geocode', 234.5, 200, success=True)

# Log business event
log_business_event(logger, 'ride_completed', user_id='user-123', ride_id='ride-456')

# Log security event
log_security_event(
    logger,
    'failed_login_attempt',
    'high',
    'Multiple failed login attempts',
    user_id='user-123',
    ip_address='192.168.1.100'
)
```

---

## Alerting

### Alert Rules

Defined in `backend/config/prometheus-alerts.yml`:

#### Critical Alerts (Page on-call)
- **HighErrorRate**: 5xx errors > 5% for 5 minutes
- **DatabaseConnectionFailure**: DB errors > 0.1/sec for 2 minutes
- **HighPaymentFailureRate**: Payment failures > 10% for 5 minutes
- **CriticalCPUUsage**: CPU > 95% for 5 minutes
- **CriticalMemoryUsage**: Memory > 95% for 5 minutes
- **CriticalDiskUsage**: Disk > 90% for 10 minutes

#### Warning Alerts (Investigate)
- **HighLatency**: P95 latency > 2s for 10 minutes
- **NoAvailableDrivers**: < 5 drivers available for 15 minutes
- **HighCPUUsage**: CPU > 80% for 10 minutes
- **HighMemoryUsage**: Memory > 85% for 10 minutes
- **HighCancellationRate**: Cancellations > 20% for 15 minutes

### Alert Channels

Configure in `alertmanager.yml`:

```yaml
route:
  group_by: ['alertname', 'service']
  group_wait: 10s
  group_interval: 10s
  repeat_interval: 12h
  receiver: 'default'
  
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty'
      continue: true
    
    - match:
        severity: warning
      receiver: 'slack'

receivers:
  - name: 'default'
    webhook_configs:
      - url: 'http://localhost:5001/alerts'
  
  - name: 'pagerduty'
    pagerduty_configs:
      - service_key: 'YOUR_PAGERDUTY_KEY'
  
  - name: 'slack'
    slack_configs:
      - api_url: 'YOUR_SLACK_WEBHOOK'
        channel: '#autobuddy-alerts'
```

---

## Dashboards

### System Resources Dashboard

**File**: `backend/config/grafana-dashboard-system.json`

**Panels**:
- CPU Usage (%)
- Memory Usage (%)
- Disk Usage (%)
- Active Users
- Rides by Status

**Alerts**:
- CPU > 80% (warning), > 95% (critical)
- Memory > 85% (warning), > 95% (critical)
- Disk > 80% (warning), > 90% (critical)

### API Metrics Dashboard

**File**: `backend/config/grafana-dashboard-api.json`

**Panels**:
- Request Rate (req/sec)
- Request Duration (p95)
- Error Rate (%)
- Active Rides
- Available Drivers
- Database Operations
- Database Query Duration
- Payment Transactions
- External API Calls

---

## Runbooks

### High Error Rate

**Alert**: `HighErrorRate`  
**Severity**: Critical

**Steps**:
1. Check recent deployments: `git log -n 5`
2. View error logs: `grep "ERROR" logs/backend.log | tail -50`
3. Check specific endpoint: Search logs by `endpoint` field
4. Check database health: `curl http://localhost:8000/api/health/ready`
5. Roll back if recent deployment: `git revert <commit>`
6. Restart service if needed: `systemctl restart autobuddy-backend`

### High Latency

**Alert**: `HighLatency`  
**Severity**: Warning

**Steps**:
1. Identify slow endpoints in Grafana
2. Check database query performance: Review `database_operation_duration_seconds`
3. Check external API latency: Review `external_api_duration_seconds`
4. Scale horizontally if needed: Add more instances
5. Optimize slow queries: Add indexes, use caching

### Database Connection Failure

**Alert**: `DatabaseConnectionFailure`  
**Severity**: Critical

**Steps**:
1. Check database status: `systemctl status mongodb` / `systemctl status postgresql`
2. Test connections manually: `mongosh` / `psql`
3. Check connection pool: Review logs for "connection pool exhausted"
4. Check network: `ping database-host`
5. Restart database if needed (coordinate with team)

---

## Monitoring Best Practices

### 1. Set Meaningful Baselines
- Monitor for 1 week to establish baselines
- Adjust alert thresholds based on actual traffic patterns
- Review and update thresholds quarterly

### 2. Reduce Alert Fatigue
- Only alert on actionable items
- Use warning vs critical severity appropriately
- Group related alerts
- Implement alert suppression during maintenance

### 3. Use Correlation IDs
- Always include `request_id` in logs
- Pass `request_id` to external services
- Use `request_id` for end-to-end tracing

### 4. Monitor What Matters
- **RED metrics**: Rate, Errors, Duration (for APIs)
- **USE metrics**: Utilization, Saturation, Errors (for resources)
- **Business metrics**: Rides, payments, active users

### 5. Regular Reviews
- Weekly: Review alerts and false positives
- Monthly: Review dashboard effectiveness
- Quarterly: Update runbooks and thresholds

---

## Troubleshooting

### Metrics Not Appearing

```bash
# Check if metrics endpoint is accessible
curl http://localhost:8000/api/metrics

# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Check Prometheus logs
docker logs prometheus
```

### Logs Not Structured

```bash
# Verify environment variable
echo $LOG_JSON  # Should be "true"

# Check log format in recent logs
tail logs/backend.log | jq .  # Should parse as JSON
```

### Grafana Dashboard Not Loading

```bash
# Check Prometheus data source
# Grafana → Configuration → Data Sources → Prometheus

# Test query in Grafana Explore
# Query: up{job="autobuddy-backend"}

# Check Prometheus scrape interval
# Should match dashboard refresh rate
```

---

## Production Checklist

- [ ] Prometheus configured and scraping metrics
- [ ] Grafana dashboards imported
- [ ] Alert rules configured in Prometheus
- [ ] Alertmanager configured with notification channels
- [ ] Sentry DSN configured for error tracking
- [ ] Structured logging enabled (`LOG_JSON=true`)
- [ ] Log aggregation configured (CloudWatch/ELK)
- [ ] Health check endpoints verified
- [ ] Runbooks created for all critical alerts
- [ ] On-call rotation defined
- [ ] Dashboard review scheduled (weekly)

---

**Last Updated**: July 9, 2026  
**Maintainer**: DevOps Team  
**Next Review**: July 16, 2026
