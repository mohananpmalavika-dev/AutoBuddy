# AutoBuddy

AutoBuddy is a full-stack ride operations platform with:
- Passenger, driver, and admin role workflows
- Real-time trip updates and live status
- Subscription, registration fee, and KYC operations
- Safety, trust, revenue, and audit tooling

## Monorepo Structure

- `autobuddy-mobile/` Expo app (web + native)
- `backend/` FastAPI backend
- `docs/` product, deployment, and policy docs
- `.github/workflows/` CI/CD workflows

## Local Development

### 1. Backend

```powershell
cd backend
python -m venv ..\\.venv
..\\.venv\\Scripts\\Activate.ps1
pip install -r requirements.txt
copy .env.sample .env
uvicorn server:app --reload --host 0.0.0.0 --port 8001
```

### 2. Expo App

```powershell
cd autobuddy-mobile
npm install
npx expo start
```

## API Health and Ops Endpoints

- Liveness/health: `GET /api/health`
- Readiness: `GET /api/ready`
- Metrics: `GET /api/metrics` (when enabled)

## Production Security Baseline

- Strong `JWT_SECRET` and `JWT_REFRESH_SECRET` (32+ chars)
- `FERNET_SECRET` configured for stable encryption at rest
- Explicit production `ALLOWED_ORIGINS` (HTTPS only)
- Optional strict Redis requirement: `REQUIRE_REDIS_IN_PRODUCTION=true`
- API request/response guardrails with structured request IDs

See [Phase 1 Checklist](docs/PHASE1_PRODUCTION_CHECKLIST.md) for the full hardening runbook.

## Deployment

Use the provider setup docs in this repo:
- `DEPLOYMENT_SETUP.md`
- `PRODUCTION_SETUP.md`
- `docs/DEPLOYMENT.md`

