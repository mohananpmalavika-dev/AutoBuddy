# AutoBuddy Backend — Local Setup

Prerequisites:
- Python 3.11 or later
- MongoDB running locally (or a remote `MONGO_URL`; `DATABASE_URL` is also accepted)

Quick start (Windows PowerShell):

1. Create and activate virtualenv:

```powershell
python -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
& .\.venv\Scripts\Activate.ps1
```

2. Install dependencies:

```powershell
pip install --upgrade pip
pip install -r requirements.txt
```

3. Copy the sample env and edit if needed:

```powershell
copy .env.sample .env
# edit .env to point MONGO_URL (or DATABASE_URL) to your MongoDB instance
```

4. Run the server (development):

```powershell
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

Notes:
- If `MONGO_URL` is not set, the app will raise an error on startup. `DATABASE_URL` is also supported as a fallback alias.
- `JWT_SECRET` is required (minimum 32 chars). You can also provide `JWT_SECRET_FILE` for file-based secret loading.
- `JWT_REFRESH_SECRET` is recommended (minimum 32 chars). In production/staging, it can fall back to `JWT_SECRET` unless `REQUIRE_REFRESH_SECRET_IN_PRODUCTION=true`.
- `FERNET_SECRET` is used for encrypting sensitive values at rest; generate once and store securely. In production, fallback is ephemeral unless `REQUIRE_FERNET_SECRET_IN_PRODUCTION=true`.
- Runtime state supports Redis and an in-process fallback. Set `REDIS_URL` for multi-instance durability (local dev example: `redis://localhost:6379/0`).
- Analytics events are written to `analytics_events` in the primary DB and mirrored to `ANALYTICS_DB_NAME` (default: `<DB_NAME>_analytics`).
- To create an initial admin account, set `BOOTSTRAP_ADMIN_EMAIL/NAME/PHONE/PASSWORD` before startup.
- Structured request logs include `request_id` and latency. Use `LOG_JSON=true` for JSON logs.
- Metrics and uptime monitoring are exposed at `/api/metrics` and `/api/health` (set `ENABLE_METRICS=true`).
- Optional error tracking is available via `SENTRY_DSN` (with `SENTRY_TRACE_SAMPLE_RATE` for tracing).
- The repository includes `backend/.env.sample` with sensible defaults for local dev.

## Production / Render checklist

- Set `ENVIRONMENT=production`.
- Set `MONGO_URL` (or `DATABASE_URL`) to your MongoDB Atlas connection string.
- Set a strong `JWT_SECRET` (minimum 32 chars).
- Set a strong `JWT_REFRESH_SECRET` (minimum 32 chars). Optional strict mode: set `REQUIRE_REFRESH_SECRET_IN_PRODUCTION=true` to require a separate refresh secret.
- Set `FERNET_SECRET` (generated via `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`). Optional strict mode: set `REQUIRE_FERNET_SECRET_IN_PRODUCTION=true`.
- Set `REDIS_URL` (recommended). If you want startup to fail without Redis, set `REQUIRE_REDIS_IN_PRODUCTION=true`.
- Set CORS with explicit HTTPS origins only:
  - Option A: `ALLOWED_ORIGINS=https://your-frontend.vercel.app,https://www.yourdomain.com`
  - Option B: set `FRONTEND_ORIGIN` or `FRONTEND_URL` (single HTTPS origin) and leave `ALLOWED_ORIGINS` empty.
- Do not include `localhost` or `http://` origins in production env.
