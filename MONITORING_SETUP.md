# Monitoring Dashboard Setup Guide

## Overview
AutoBuddy uses Prometheus for metrics collection and Grafana for visualization and alerting. This guide covers setup, deployment, and usage.

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌──────────┐
│  FastAPI App    │────▶│  Prometheus  │────▶│  Grafana │
│ /api/metrics    │     │ (storage)    │     │  (UI)    │
└─────────────────┘     └──────────────┘     └──────────┘
                              ▲
                              │
                         ┌────┴────┐
                         │ Scrape   │
                         │ Config   │
                         └──────────┘
```

## Prerequisites

- Docker & Docker Compose
- Python 3.9+
- `prometheus-client` package (for metrics export)

## Installation

### 1. Install Prometheus Client
```bash
pip install prometheus-client
```

### 2. Backend Integration
The metrics are automatically exported when the FastAPI app includes:
```python
# In backend/server.py
from app.utils.prometheus_metrics import create_prometheus_middleware, REGISTRY
from prometheus_client import generate_latest

# Setup middleware
app = create_prometheus_middleware(app)

# Export /api/metrics endpoint
@api_router.get("/metrics")
async def metrics():
    return generate_latest(REGISTRY)
```

### 3. Deploy Monitoring Stack
```bash
# From project root
docker-compose -f monitoring-docker-compose.yml up -d

# Verify services
docker-compose -f monitoring-docker-compose.yml ps
```

### 4. Access Services

**Prometheus UI:**
- URL: http://localhost:9090
- Query metrics directly
- Check scrape targets: http://localhost:9090/targets

**Grafana Dashboard:**
- URL: http://localhost:3000
- Default credentials: admin / admin
- Import dashboard: Dashboard → New → Import → upload `grafana-dashboard.json`

**Alertmanager:**
- URL: http://localhost:9093
- View fired alerts
- Manage alert silencing

## Configuration Files

### prometheus.yml
Scrape configuration for all data sources:
- **autobuddy-backend** (host port 8001): FastAPI app metrics at `/api/metrics`
- **postgres** (Port 5432): PostgreSQL database metrics
- **mongodb** (Port 27017): MongoDB database metrics
- **redis** (Port 6379): Redis cache metrics
- **node** (Port 9100): System metrics via Node Exporter

For Render, use `prometheus.render.example.yml` and replace the backend target with the Render service hostname. Render injects the backend port dynamically, so the scrape target should not be a fixed `localhost:$PORT` value.

### alert_rules.yml
Alert rules organized by component:
- **API Performance**: Response time, error rate
- **Database**: Query latency, slow queries, connection pool
- **WebSocket**: Connection count, event failures
- **Business**: Payment failures, booking delays
- **Infrastructure**: Database down, disk space, memory/CPU

### grafana-dashboard.json
Pre-configured dashboard with 12 panels:
1. Request Rate (5m average)
2. Active HTTP Requests (real-time gauge)
3. API Response Time (95th/99th percentiles)
4. Error Rate (percentage)
5. Error Distribution (by type)
6. Database Query Latency (95th percentile)
7. Slow Query Rate
8. Active WebSocket Connections
9. Payment Processing Rate
10. Booking Rate by Status
11. File Upload Metrics
12. System Resource Usage

## Key Metrics

### Request Metrics
- `http_requests_total`: Total requests by method, endpoint, status
- `http_request_duration_seconds`: Response time distribution
- `http_requests_active`: In-flight requests
- `http_request_size_bytes`: Request body size
- `http_response_size_bytes`: Response body size

### Database Metrics
- `db_query_duration_seconds`: Query execution time
- `db_queries_total`: Total queries by operation/collection
- `slow_queries_total`: Queries exceeding 500ms threshold
- `db_connections_active`: Connection pool utilization

### WebSocket Metrics
- `websocket_connections_total`: Total connections established
- `websocket_connections_active`: Current active connections
- `websocket_events_total`: Events by type and status
- `websocket_message_duration_seconds`: Event processing time

### Business Metrics
- `bookings_total`: Bookings by status
- `payments_total`: Payments processed
- `ratings_total`: Ratings distribution
- `active_rides`: Current ride count

### Error Metrics
- `errors_total`: Errors by type and severity
- `sentry_events_total`: Error reports sent to Sentry
- `rate_limit_violations_total`: Rate limit hits

## Alert Rules

### Critical Alerts
1. **HighErrorRate** (>1% errors)
2. **CriticalErrorRate** (>5% errors)
3. **DatabaseDown** (2+ minutes)
4. **PaymentFailureRate** (>2%)
5. **PrometheusScrapeFailing**

### Warning Alerts
1. **HighResponseTime** (95th %ile > 5s)
2. **SlowDatabaseQueries** (>0.1 per second)
3. **HighDatabaseLatency** (95th %ile > 1s)
4. **HighWebSocketEventFailureRate** (>5%)
5. **HighAuthenticationFailureRate** (>10%)
6. **HighRateLimitViolations**
7. **HighFileUploadFailureRate** (>5%)
8. **SlowFileUploads** (95th %ile > 30s)
9. **LowDiskSpace** (<10%)
10. **HighMemoryUsage** (>85%)
11. **HighCPUUsage** (>80%)

## Usage Examples

### Query Examples

**1. Average response time per endpoint:**
```
avg(http_request_duration_seconds_bucket) by (endpoint)
```

**2. Error rate by endpoint:**
```
rate(http_requests_total{status="error"}[5m]) by (endpoint)
```

**3. Active bookings:**
```
sum(active_rides)
```

**4. Database connection pool usage:**
```
db_connections_active / db_connections_max
```

**5. Top 5 slowest database operations:**
```
topk(5, histogram_quantile(0.95, db_query_duration_seconds_bucket))
```

**6. Payment success rate:**
```
rate(payments_total{status="completed"}[5m]) / 
rate(payments_total[5m])
```

**7. WebSocket connection trend:**
```
increase(websocket_connections_total[1h])
```

## Troubleshooting

### Prometheus not scraping metrics
1. Check FastAPI `/api/metrics` endpoint responds:
   ```bash
   curl http://localhost:8001/api/metrics
   ```
2. Verify prometheus.yml target is correct
3. Check Prometheus targets page: http://localhost:9090/targets

### Grafana dashboard empty
1. Verify data source is connected
2. Check Prometheus is running
3. Ensure metrics are being collected
4. Verify time range covers recent data

### Alerts not firing
1. Check alert_rules.yml syntax:
   ```bash
   promtool check rules alert_rules.yml
   ```
2. Verify rule is loaded in Prometheus
3. Check alert conditions are met
4. Test query in Prometheus UI

### High disk usage
1. Reduce retention period in prometheus.yml:
   ```yaml
   global:
     retention: 7d  # reduced from default
   ```
2. Reduce scrape frequency
3. Clean old data:
   ```bash
   docker exec prometheus prometheus-cli series --delete '{job="autobuddy-backend"}'
   ```

## Production Deployment

### Remote Storage (InfluxDB/S3)
```yaml
# Add to prometheus.yml
remote_write:
  - url: "http://influxdb:8086/api/v1/prom/write?db=prometheus"
```

### High Availability Setup
```yaml
# Run multiple Prometheus instances with same config
# Setup Thanos for deduplication and long-term storage
```

### Alert Routing
```yaml
# Configure Alertmanager routes in alertmanager.yml
global:
  resolve_timeout: 5m
route:
  receiver: team-notifications
  routes:
    - match:
        severity: critical
      receiver: oncall-pagerduty
```

## Performance Tuning

### Memory Usage
- Default: ~1-2GB for typical workload
- Reduce retention period
- Increase scrape interval
- Disable unnecessary metrics

### Query Performance
- Use recording rules for frequently accessed queries
- Create dashboard-specific queries
- Index high-cardinality labels

### Storage Growth
- Monitor: `prometheus_tsdb_symbol_table_size_bytes`
- Adjust retention: `--storage.tsdb.retention.time=30d`

## Maintenance

### Regular Tasks
- **Weekly**: Review alert rules and adjust thresholds
- **Monthly**: Analyze retention and storage growth
- **Quarterly**: Update Grafana dashboards based on usage patterns
- **Annually**: Plan storage infrastructure upgrades

### Backup Strategy
1. Export Prometheus data: `kubectl exec prometheus -- tar czf /data/backup.tar.gz /prometheus`
2. Backup Grafana dashboards: Settings → Dashboards → Export
3. Store in S3 or external storage

## Integration with Existing Systems

### Sentry Integration
Sentry errors are also tracked in Prometheus via:
- `sentry_events_total`: Counter for errors sent to Sentry
- Create Grafana panel correlating Sentry and Prometheus data

### APM Integration
For distributed tracing, integrate with:
- Jaeger
- Zipkin
- AWS X-Ray

Enable via environment variables in FastAPI startup.

## Next Steps

1. ✅ Deploy monitoring stack locally
2. Deploy to production (Kubernetes/VM)
3. Configure alerting to Slack/PagerDuty
4. Setup log aggregation (ELK/Loki)
5. Implement synthetic monitoring
6. Create runbooks for common alerts

---

**Support:** For issues or questions about monitoring setup, consult the Prometheus and Grafana documentation or check existing alerts in the dashboard.
