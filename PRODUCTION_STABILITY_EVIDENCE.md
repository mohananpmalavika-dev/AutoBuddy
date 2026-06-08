# Production Stability Evidence

**Last updated:** June 8, 2026  
**Current status:** Staging-ready with production gates pending

This project now has load-test proof for the main passenger, driver, and admin flows, but it should not be called fully production-ready until the production environment passes the gates below.

## Latest Verified Load Result

Report: `C:\tmp\autobuddy_scale_load_report_workers4_gpsfix_100c_ramp5.json`

| Gate | Result |
|------|--------|
| Seeded users | 10,000 passengers, 1,000 drivers |
| Active actors | 1,000 passengers, 300 drivers |
| Concurrency | 100 |
| Worker model | 4 local Uvicorn workers |
| Duration | 31.21 seconds |
| Total requests | 1,658 |
| Success | 1,658 |
| Failures | 0 |
| Failure rate | 0.0% |
| Throughput | 53.12 RPS |

The latest mixed load test covered:

- Passenger booking creation, active booking lookup, booking history, nearby-driver search
- Driver GPS updates, pending requests, readiness, telemetry
- Admin dashboard and live status
- Health and catalog endpoints

## Known Remaining Risk

The stability fixes removed the collapse seen in earlier 100-concurrency runs, but the current local p95 latency is still high. The slowest measured endpoint was `admin_live_status` at `6532.19ms` p95. That is acceptable as local proof that the system survives the 10k/1k scenario, but it is not an acceptable final production latency SLO.

## Required Production Gates

Before full production launch:

- `ENVIRONMENT=production`
- `MONGO_URL` points to production MongoDB/Atlas
- `FEATURE_DATABASE_URL` points to durable PostgreSQL; no SQLite feature DB in staging or production
- `JWT_SECRET` is a strong 32+ character secret
- `ALLOWED_ORIGINS` lists explicit HTTPS frontend origins
- `REDIS_URL` is configured for multi-instance cache, realtime, and rate-limit state
- `REQUIRE_REDIS_IN_PRODUCTION=true`
- `MONGO_MAX_POOL_SIZE>=300`
- Observability is enabled with `SENTRY_DSN` or metrics/log collection
- A production-like 30-60 minute soak test passes with 0 critical errors
- Target production p95 latency is agreed and enforced; recommended initial gate is less than 2 seconds for user-facing APIs

## Repeatable Check

Validate the latest local load evidence:

```powershell
python -X utf8 backend\scripts\production_readiness_check.py --skip-env --load-report C:\tmp\autobuddy_scale_load_report_workers4_gpsfix_100c_ramp5.json --min-rps 50 --max-failure-rate 0.5 --max-p95-ms 8500
```

Validate a real production/staging environment before deploy:

```powershell
python -X utf8 backend\scripts\production_readiness_check.py --production --load-report <production-like-load-report.json> --min-rps 50 --max-failure-rate 0.5 --max-p95-ms 2000
```
