# Phase 1 Production Checklist

This checklist is for stability and security hardening before Phase 2 feature expansion.

## 1. Secrets and Auth

- [ ] `JWT_SECRET` is set and 32+ characters.
- [ ] `JWT_REFRESH_SECRET` is set and 32+ characters.
- [ ] `FERNET_SECRET` is set and valid.
- [ ] `REQUIRE_REFRESH_SECRET_IN_PRODUCTION=true` (recommended).
- [ ] `REQUIRE_FERNET_SECRET_IN_PRODUCTION=true` (recommended).
- [ ] Access and refresh token rotation verified in QA.

## 2. API and Edge Security

- [ ] `ALLOWED_ORIGINS` uses only explicit HTTPS origins in production.
- [ ] No `localhost` or `http://` origins in production.
- [ ] Request size limit configured with `MAX_REQUEST_BODY_BYTES`.
- [ ] `X-Request-ID` visible in logs and API responses.
- [ ] Security response headers validated on `/api/*`.

## 3. Runtime and Datastores

- [ ] MongoDB connectivity stable (`/api/health` green).
- [ ] Readiness endpoint green: `/api/ready`.
- [ ] Redis configured for multi-instance runtime state.
- [ ] `REQUIRE_REDIS_IN_PRODUCTION=true` if strict HA is required.
- [ ] Index creation runs cleanly at startup (no duplicate key errors).

## 4. Observability

- [ ] JSON logs enabled (`LOG_JSON=true`) in production.
- [ ] Sentry DSN configured (`SENTRY_DSN`).
- [ ] Metrics endpoint exposed and scraped (`/api/metrics`).
- [ ] Alerting configured for:
  - [ ] readiness failures
  - [ ] sustained 5xx rate
  - [ ] Redis degraded/runtime fallback
  - [ ] Mongo latency and connection failures

## 5. Deployment Gates

- [ ] Staging smoke test passes on every deploy.
- [ ] Production deploy checklist is documented and repeatable.
- [ ] Rollback path tested for backend release.
- [ ] Environment variable inventory maintained by owner.

## 6. Data Safety and Compliance Basics

- [ ] Backup policy exists for MongoDB.
- [ ] Retention policy documented for logs and sensitive collections.
- [ ] KYC/sensitive payload exposure reviewed in logs.
- [ ] Audit logs queryable by admin/security team.

## Recommended Pre-Launch Command Set

```powershell
# backend lint/tests
cd backend
pytest

# app lint
cd ..\\autobuddy-mobile
npx eslint src
```

