from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request, Response, UploadFile, File, Form, Query
from fastapi.exceptions import RequestValidationError
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse, FileResponse, PlainTextResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo.errors import PyMongoError, ServerSelectionTimeoutError
import httpx
import os
import logging
import json
import time
import hashlib
import secrets
import contextvars
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict, field_validator
from typing import List, Optional, Dict, Any, Literal
import uuid
from datetime import datetime, timedelta, timezone
import bcrypt
import jwt
from enum import Enum
import math
import socketio
import asyncio
import stripe
from urllib.parse import quote_plus
import random
import re
from urllib.parse import urlparse, parse_qs
from cryptography.fernet import Fernet
from bson import ObjectId
from bson.binary import Binary
from bson.errors import InvalidId
from app.core.config import get_settings
from app.db.client import create_mongo_client, create_database
from app.db.retry import retry_on_db_error
from app.routers.auth import router as modular_auth_router
from app.routers.analytics import router as modular_analytics_router
from app.routers.driver_trust import router as modular_driver_trust_router
from app.routers.ride_products import router as modular_ride_products_router
from app.routers.revenue import router as modular_revenue_router
from app.routers.security import router as modular_security_router
from app.routers.safety import router as modular_safety_router
from app.routers.features_routes import router as modular_features_router
from app.routers.notifications_addon import router as modular_notifications_router
from app.routers.tier1_driver_features import router as modular_tier1_router
from app.routers.tier2_driver_features import router as modular_tier2_router
from app.routers.tier3_polish_features import router as modular_tier3_router
from app.routers.health import router as modular_health_router
from app.routers.scheduled_rides import router as modular_scheduled_rides_router
from app.routers.vehicles import router as modular_vehicles_router
from app.routers.vehicle_types import router as modular_vehicle_types_router, init_default_vehicle_types
from app.routers.support_tickets import router as modular_support_tickets_router
from app.routers.uploads import router as modular_uploads_router
from app.routers.admin_account_deletions import router as modular_admin_account_deletions_router
from app.routers.admin_audit_compliance import router as modular_admin_audit_compliance_router
from app.routers.admin_dispute_management import router as modular_admin_dispute_management_router
from app.routers.admin_driver_management import router as modular_admin_driver_management_router
from app.routers.admin_financial_management import router as modular_admin_financial_management_router
from app.routers.admin_kyc_enhanced import router as modular_admin_kyc_enhanced_router
from app.routers.admin_launch_visitors import router as modular_admin_launch_visitors_router
from app.routers.admin_passenger_management import router as modular_admin_passenger_management_router
from app.routers.admin_phone_requests import router as modular_admin_phone_requests_router
from app.routers.admin_promotions_marketing import router as modular_admin_promotions_marketing_router
from app.routers.admin_reports_analytics import router as modular_admin_reports_analytics_router
from app.routers.admin_safety_compliance import router as modular_admin_safety_compliance_router
from app.routers.admin_subscriptions_enhanced import router as modular_admin_subscriptions_enhanced_router
from app.routers.admin_support_management import router as modular_admin_support_management_router
from app.routers.admin_system_config import router as modular_admin_system_config_router
from app.routers.admin_trip_management import router as modular_admin_trip_management_router
from app.routers.admin_wallet_topups import router as modular_admin_wallet_topups_router
from app.routers.admin_document_requirements import router as modular_admin_document_requirements_router
from app.routers.rate_limit_config import router as modular_rate_limit_config_router, init_default_rate_limit_configs
from app.routers.driver_documents import router as modular_driver_documents_router
from app.routers.passenger_documents import router as modular_passenger_documents_router
from app.routers.admin_fare_management import router as modular_admin_fare_management_router
from app.routers.driver_fare_override import router as modular_driver_fare_override_router
from app.routers.driver_fare_proposals import router as modular_driver_fare_proposals_router
from app.routers.admin_fare_proposals import router as modular_admin_fare_proposals_router
from app.routers.fleet_advanced import router as modular_fleet_advanced_router
from app.routers.operations_center import router as modular_operations_center_router
from app.routers.corporate_portal import router as modular_corporate_portal_router
from app.routers.airport_rides import router as modular_airport_router
from app.routers.driver_heatmaps import router as modular_heatmaps_router
from app.routers.fleet_profitability import router as modular_profitability_router
from app.routers.ride_types_router import router as modular_ride_types_router, init_default_ride_types
from app.routers.vehicle_types_extended import router as modular_vehicle_types_extended_router, init_default_vehicle_types_extended
from app.routers.vehicles_canonical import router as modular_vehicles_canonical_router, init_canonical_vehicles
from app.routers.bookings_extended import router as modular_bookings_extended_router
from app.routers.coverage_admin import router as modular_coverage_admin_router
from app.sockets import configure_socket_server as configure_legacy_socket_helpers
from app.db.database import SessionLocal, get_feature_database_status
from app.db.tier2_models import (
    DriverPaymentMethod,
    EarningTarget,
    PayoutScheduleConfig,
    RideFilterPreferences,
    VehicleMaintenance,
)
from app.services.ai_dispatch import build_demand_heatmap, heat_cell as dispatch_heat_cell
from app.services.revenue_service import (
    apply_referral_signup,
    backfill_referrals_for_existing_users,
    calculate_ride_revenue,
    create_referral_if_missing,
    ensure_default_revenue_plans,
)
from app.state import RuntimeStateConfig, RuntimeStateStore

try:
    from google.auth.transport.requests import Request as GoogleAuthRequest
    from google.oauth2 import id_token as google_id_token
except Exception:  # pragma: no cover - optional dependency in local/dev
    GoogleAuthRequest = None
    google_id_token = None

try:
    import sentry_sdk
    from sentry_sdk.integrations.asgi import SentryAsgiMiddleware
except Exception:  # pragma: no cover - optional dependency in local/dev
    sentry_sdk = None
    SentryAsgiMiddleware = None

try:
    from prometheus_client import Counter, Gauge, Histogram, CONTENT_TYPE_LATEST, generate_latest
except Exception:  # pragma: no cover - optional dependency in local/dev
    Counter = Gauge = Histogram = None
    CONTENT_TYPE_LATEST = "text/plain; version=0.0.4"
    generate_latest = None

try:
    import redis.asyncio as redis_async
except Exception:  # pragma: no cover - optional dependency in local/dev
    redis_async = None

# Production logging and error tracking
from app.utils.logging_config import (
    configure_logging as configure_structured_logging,
    StructuredLogger,
    set_request_context,
    clear_request_context,
    LogCategory,
    PerformanceMonitor
)
from app.utils.sentry_config import SentryConfig, set_sentry_context, clear_sentry_context
from app.middleware.rate_limiting import RateLimitingMiddleware
from app.utils.rate_limiting import (
    ensure_rate_limit_defaults,
    get_rate_limit_profile_rule,
    get_rate_limit_rule_for_path,
)
from app.routers.rate_limit_config import (
    init_default_rate_limit_configs,
    get_effective_rate_limit,
)

try:
    import boto3
    from botocore.exceptions import BotoCoreError, ClientError
except Exception:  # pragma: no cover - optional dependency in local/dev
    boto3 = None
    BotoCoreError = ClientError = Exception


def _clean_env_token(value: str) -> str:
    token = str(value or "").strip()
    while len(token) >= 2 and token[0] == token[-1] and token[0] in {"'", '"'}:
        token = token[1:-1].strip()
    return token


def _normalize_redis_url(raw_redis_url: str) -> tuple[str, bool]:
    value = _clean_env_token(raw_redis_url)
    if not value:
        return "", False
    if value.startswith(("redis://", "rediss://", "unix://")):
        return value, False
    # Convenience: allow host:port/db and normalize to redis://
    if "://" not in value and ":" in value:
        return f"redis://{value}", False
    return "", True

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
settings = get_settings()
UPLOADS_DIR = ROOT_DIR / "uploads"
PASSENGER_PROFILE_PHOTO_DIR = UPLOADS_DIR / "passenger_profile_photos"
PASSENGER_DOCUMENTS_DIR = UPLOADS_DIR / "passenger_documents"
DRIVER_DOCUMENTS_DIR = UPLOADS_DIR / "driver_documents"
DRIVER_PROFILE_PHOTO_DIR = UPLOADS_DIR / "driver_profile_photos"
SUPPORT_ATTACHMENTS_DIR = UPLOADS_DIR / "support_attachments"
UPLOAD_STORAGE_BACKEND = os.environ.get("UPLOAD_STORAGE_BACKEND", "local").strip().lower() or "local"
UPLOADS_OBJECT_BUCKET = (
    os.environ.get("UPLOADS_S3_BUCKET")
    or os.environ.get("AWS_S3_BUCKET")
    or os.environ.get("S3_BUCKET")
    or ""
).strip()
UPLOADS_OBJECT_PREFIX = os.environ.get("UPLOADS_OBJECT_PREFIX", "autobuddy-uploads").strip().strip("/")
UPLOADS_OBJECT_REGION = (
    os.environ.get("UPLOADS_S3_REGION")
    or os.environ.get("AWS_REGION")
    or os.environ.get("AWS_DEFAULT_REGION")
    or ""
).strip()
UPLOADS_OBJECT_ENDPOINT_URL = (
    os.environ.get("UPLOADS_S3_ENDPOINT_URL")
    or os.environ.get("AWS_ENDPOINT_URL")
    or os.environ.get("S3_ENDPOINT_URL")
    or ""
).strip()
DEFAULT_DRIVER_UPLOAD_STORAGE_BACKEND = "s3" if UPLOADS_OBJECT_BUCKET else "mongo"
DRIVER_UPLOAD_STORAGE_BACKEND = (
    os.environ.get("DRIVER_UPLOAD_STORAGE_BACKEND")
    or os.environ.get("UPLOAD_STORAGE_BACKEND")
    or DEFAULT_DRIVER_UPLOAD_STORAGE_BACKEND
).strip().lower()
DEFAULT_PASSENGER_UPLOAD_STORAGE_BACKEND = "s3" if UPLOADS_OBJECT_BUCKET else "mongo"
PASSENGER_UPLOAD_STORAGE_BACKEND = (
    os.environ.get("PASSENGER_UPLOAD_STORAGE_BACKEND")
    or os.environ.get("UPLOAD_STORAGE_BACKEND")
    or DEFAULT_PASSENGER_UPLOAD_STORAGE_BACKEND
).strip().lower()

# MongoDB connection
mongo_url = settings.mongo_url
MONGO_SERVER_SELECTION_TIMEOUT_MS = settings.mongo_server_selection_timeout_ms
MONGO_CONNECT_TIMEOUT_MS = settings.mongo_connect_timeout_ms
MONGO_SOCKET_TIMEOUT_MS = settings.mongo_socket_timeout_ms
client = create_mongo_client(settings)
db = create_database(client, settings)
ANALYTICS_DB_NAME = os.environ.get("ANALYTICS_DB_NAME", f"{settings.db_name}_analytics").strip() or f"{settings.db_name}_analytics"
analytics_db = client[ANALYTICS_DB_NAME]

# JWT Configuration
JWT_SECRET = settings.jwt_secret
JWT_REFRESH_SECRET = settings.jwt_refresh_secret or ""
JWT_REFRESH_SECRET_CONFIGURED = bool(settings.jwt_refresh_secret)
JWT_ALGORITHM = settings.jwt_algorithm
JWT_EXPIRATION_HOURS = settings.jwt_expiration_hours
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.environ.get("REFRESH_TOKEN_EXPIRE_DAYS", "30"))
DEFAULT_CITY_SPEED_KMPH = float(os.environ.get("DEFAULT_CITY_SPEED_KMPH", "22"))
AUTO_ASSIGN_MAX_RADIUS_KM = float(os.environ.get("AUTO_ASSIGN_MAX_RADIUS_KM", "7"))
OSRM_BASE_URL = os.environ.get("OSRM_BASE_URL", "https://router.project-osrm.org")
UPI_PAYEE_VPA = os.environ.get("UPI_PAYEE_VPA", "autobuddy@upi")
UPI_PAYEE_NAME = os.environ.get("UPI_PAYEE_NAME", "AutoBuddy")
ALLOWED_ORIGINS = settings.allowed_origins
CORS_ALLOW_ORIGIN_REGEX = settings.cors_allow_origin_regex
ENVIRONMENT = settings.environment
IS_PRODUCTION_ENV = settings.is_production_env
LOGIN_THROTTLE_WINDOW_MINUTES = settings.login_throttle_window_minutes
LOGIN_THROTTLE_MAX_ATTEMPTS = settings.login_throttle_max_attempts
OTP_EXPIRY_MINUTES = settings.otp_expiry_minutes
OTP_RESEND_COOLDOWN_SECONDS = settings.otp_resend_cooldown_seconds
GOOGLE_OAUTH_CLIENT_ID = os.environ.get(
    "GOOGLE_OAUTH_CLIENT_ID",
    os.environ.get("GOOGLE_CLIENT_ID", ""),
).strip()
GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", os.environ.get("EXPO_PUBLIC_GOOGLE_MAPS_API_KEY", "")).strip()
AUTO_ASSIGN_RETRY_INTERVAL_SECONDS = int(os.environ.get("AUTO_ASSIGN_RETRY_INTERVAL_SECONDS", "15"))
AUTO_ASSIGN_RETRY_ATTEMPTS = int(os.environ.get("AUTO_ASSIGN_RETRY_ATTEMPTS", "8"))
FCM_SERVER_KEY = os.environ.get("FCM_SERVER_KEY", "").strip()
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4.1-mini").strip()
OPENAI_BASE_URL = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").strip()
API_RATE_LIMIT_MAX_REQUESTS = settings.api_rate_limit_max_requests
API_RATE_LIMIT_WINDOW_SECONDS = settings.api_rate_limit_window_seconds
MAX_REQUEST_BODY_BYTES = max(
    65536,
    min(10 * 1024 * 1024, int(os.environ.get("MAX_REQUEST_BODY_BYTES", str(1024 * 1024)))),
)
TRIP_DISTANCE_MIN_SEGMENT_KM = float(os.environ.get("TRIP_DISTANCE_MIN_SEGMENT_KM", "0.03"))
TRIP_DISTANCE_MAX_SEGMENT_KM = float(os.environ.get("TRIP_DISTANCE_MAX_SEGMENT_KM", "8.0"))
TRIP_DISTANCE_MAX_POINTS = int(os.environ.get("TRIP_DISTANCE_MAX_POINTS", "1200"))
DRIVER_LIVE_LOCATION_TTL_SECONDS = int(os.environ.get("DRIVER_LIVE_LOCATION_TTL_SECONDS", "300"))
REDIS_URL_RAW = os.environ.get("REDIS_URL", "")
REDIS_URL, REDIS_URL_INVALID = _normalize_redis_url(REDIS_URL_RAW)
REDIS_KEY_PREFIX = os.environ.get("REDIS_KEY_PREFIX", "autobuddy").strip()
SOCKETIO_REDIS_CHANNEL = os.environ.get(
    "SOCKETIO_REDIS_CHANNEL",
    os.environ.get("SOCKET_REDIS_CHANNEL", "autobuddy-socketio"),
).strip()
REALTIME_HEARTBEAT_SECONDS = max(5, int(os.environ.get("REALTIME_HEARTBEAT_SECONDS", "15")))
REALTIME_OFFLINE_SECONDS = max(
    REALTIME_HEARTBEAT_SECONDS * 2,
    int(os.environ.get("REALTIME_OFFLINE_SECONDS", "45")),
)
REALTIME_HEALTH_MONITOR_INTERVAL_SECONDS = max(
    5,
    int(os.environ.get("REALTIME_HEALTH_MONITOR_INTERVAL_SECONDS", "15")),
)
IST_TZ = timezone(timedelta(hours=5, minutes=30))

# Helper function to get current time in IST
def get_ist_now():
    """Returns current time in IST timezone."""
    return datetime.now(IST_TZ)

SPIN_WIN_CONFIG_ID = "default"
SPIN_WIN_MAX_PRIZES = 24
SPIN_WIN_MAX_DAILY_LIMIT = 20
REQUIRE_REDIS_IN_PRODUCTION = os.environ.get("REQUIRE_REDIS_IN_PRODUCTION", "false").strip().lower() in {"1", "true", "yes", "on"}
REQUIRE_REFRESH_SECRET_IN_PRODUCTION = os.environ.get("REQUIRE_REFRESH_SECRET_IN_PRODUCTION", "false").strip().lower() in {"1", "true", "yes", "on"}
REQUIRE_FERNET_SECRET_IN_PRODUCTION = os.environ.get("REQUIRE_FERNET_SECRET_IN_PRODUCTION", "false").strip().lower() in {"1", "true", "yes", "on"}
STRIPE_SECRET_KEY = os.environ.get("STRIPE_SECRET_KEY", "").strip()
BOOTSTRAP_ADMIN_EMAIL = settings.bootstrap_admin_email
BOOTSTRAP_ADMIN_NAME = settings.bootstrap_admin_name
BOOTSTRAP_ADMIN_PHONE = settings.bootstrap_admin_phone
BOOTSTRAP_ADMIN_PASSWORD = settings.bootstrap_admin_password
MAX_PRODUCTION_ALLOWED_ORIGINS = int(os.environ.get("MAX_PRODUCTION_ALLOWED_ORIGINS", "10"))
WEAK_JWT_SECRET_VALUES = {"autorickshaw-secret-key-change-in-production", "changeme", "default", "secret"}
EFFECTIVE_CORS_ALLOW_ORIGIN_REGEX = "" if IS_PRODUCTION_ENV else CORS_ALLOW_ORIGIN_REGEX
SENTRY_DSN = os.environ.get("SENTRY_DSN", "").strip()
SENTRY_TRACE_SAMPLE_RATE = float(os.environ.get("SENTRY_TRACE_SAMPLE_RATE", "0.1"))
ENABLE_METRICS = os.environ.get("ENABLE_METRICS", "true").strip().lower() in {"1", "true", "yes", "on"}
REQUEST_ID_HEADER = "X-Request-ID"
READINESS_DB_PING_TIMEOUT_MS = max(
    200,
    min(10000, int(os.environ.get("READINESS_DB_PING_TIMEOUT_MS", "1500"))),
)
FERNET_SECRET = (settings.fernet_secret or "").strip()
FERNET_SECRET_CONFIGURED = bool(settings.fernet_secret)
if not FERNET_SECRET:
    FERNET_SECRET = Fernet.generate_key().decode()
try:
    fernet = Fernet(FERNET_SECRET.encode())
except Exception as exc:
    raise RuntimeError(
        "FERNET_SECRET is invalid. It must be a 32-byte url-safe base64 key "
        "(example generator: python -c \"from cryptography.fernet import Fernet; "
        "print(Fernet.generate_key().decode())\")."
    ) from exc
if not JWT_REFRESH_SECRET:
    JWT_REFRESH_SECRET = JWT_SECRET
if STRIPE_SECRET_KEY:
    stripe.api_key = STRIPE_SECRET_KEY

redis_client = None
if REDIS_URL and redis_async:
    try:
        redis_client = redis_async.from_url(
            REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
        )
    except Exception:
        # Defer user-facing warning to startup logger.
        redis_client = None
# Create the main app
app = FastAPI(title="AutoRickshaw Booking API")
app.state.settings = settings
app.state.mongo_client = client
app.state.db = db
app.state.redis_client = redis_client

# Add rate limiting middleware (before Sentry to properly track rate-limited requests)
app.add_middleware(RateLimitingMiddleware)

if SENTRY_DSN and sentry_sdk:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=ENVIRONMENT,
        traces_sample_rate=max(0.0, min(1.0, SENTRY_TRACE_SAMPLE_RATE)),
    )
    if SentryAsgiMiddleware:
        app.add_middleware(SentryAsgiMiddleware)
runtime_state = RuntimeStateStore(
    RuntimeStateConfig(
        redis_url=REDIS_URL,
        key_prefix=REDIS_KEY_PREFIX,
        otp_expiry_minutes=OTP_EXPIRY_MINUTES,
        otp_resend_cooldown_seconds=OTP_RESEND_COOLDOWN_SECONDS,
        login_throttle_window_minutes=LOGIN_THROTTLE_WINDOW_MINUTES,
        login_throttle_max_attempts=LOGIN_THROTTLE_MAX_ATTEMPTS,
        api_rate_limit_window_seconds=API_RATE_LIMIT_WINDOW_SECONDS,
        api_rate_limit_max_requests=API_RATE_LIMIT_MAX_REQUESTS,
        driver_live_location_ttl_seconds=DRIVER_LIVE_LOCATION_TTL_SECONDS,
    )
)
app.state.runtime_state = runtime_state

# Socket.IO setup
socket_manager = None
if REDIS_URL:
    try:
        socket_manager = socketio.AsyncRedisManager(REDIS_URL, channel=SOCKETIO_REDIS_CHANNEL)
    except Exception as exc:
        logging.getLogger("autobuddy.bootstrap").warning(
            "Socket.IO Redis manager init failed; continuing without Redis-backed socket manager: %s",
            exc,
        )
sio = socketio.AsyncServer(
    async_mode='asgi',
    client_manager=socket_manager,
    # FastAPI/Starlette CORSMiddleware owns CORS for the mounted /ws app.
    # Disable Engine.IO's duplicate CORS headers so polling responses expose
    # exactly one Access-Control-Allow-Origin value.
    cors_allowed_origins=[],
    logger=False,
    engineio_logger=False
)
app.state.sio = sio
configure_legacy_socket_helpers(sio)
# Register Fleet Portal Socket.IO events
from app.sockets.fleet_events import register_fleet_socket_events
register_fleet_socket_events(sio)
# Register Operations Center Socket.IO events
from app.sockets.operations_events import register_operations_socket_events
register_operations_socket_events(sio)
socket_app = socketio.ASGIApp(sio, socketio_path="/ws/socket.io")

driver_health_monitor_task: Optional[asyncio.Task] = None
ride_dispatch_worker_task: Optional[asyncio.Task] = None
analytics_warehouse_worker_task: Optional[asyncio.Task] = None

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)

# Configure logging
REQUEST_ID_CONTEXT: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")
STARTUP_TS = time.time()


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = REQUEST_ID_CONTEXT.get("-")
        return True


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: Dict[str, Any] = {
            "timestamp": get_ist_now().isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", REQUEST_ID_CONTEXT.get("-")),
        }
        extra_data = getattr(record, "extra_data", None)
        if isinstance(extra_data, dict):
            payload.update(extra_data)
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, default=str)


def configure_logging() -> None:
    # Initialize Sentry first (if configured)
    environment = "production" if IS_PRODUCTION_ENV else "development"
    sentry_initialized = SentryConfig.initialize(environment=environment)
    
    # Configure structured logging
    root = logging.getLogger()
    level = os.environ.get("LOG_LEVEL", "INFO").upper()
    use_json_logs = os.environ.get("LOG_JSON", "1" if IS_PRODUCTION_ENV else "0").strip().lower() in {
        "1",
        "true",
        "yes",
        "on",
    }
    root.handlers.clear()
    handler = logging.StreamHandler()
    handler.addFilter(RequestIdFilter())
    if use_json_logs:
        handler.setFormatter(JsonLogFormatter())
    else:
        handler.setFormatter(
            logging.Formatter(
                "%(asctime)s %(levelname)s %(name)s [request_id=%(request_id)s] %(message)s"
            )
        )
    root.addHandler(handler)
    root.setLevel(level)
    
    # Log initialization
    root.info(f"Logging initialized - level={level}, json_logs={use_json_logs}, sentry={sentry_initialized}")


configure_logging()
logger = logging.getLogger("autobuddy")

if ENABLE_METRICS and Counter and Histogram and Gauge:
    HTTP_REQUEST_COUNT = Counter(
        "autobuddy_http_requests_total",
        "Total HTTP requests",
        ["method", "path", "status"],
    )
    HTTP_REQUEST_DURATION = Histogram(
        "autobuddy_http_request_duration_seconds",
        "HTTP request duration in seconds",
        ["method", "path"],
    )
    HTTP_EXCEPTION_COUNT = Counter(
        "autobuddy_http_exceptions_total",
        "Total unhandled HTTP exceptions",
        ["exception_type", "path"],
    )
    APP_UPTIME_SECONDS = Gauge(
        "autobuddy_uptime_seconds",
        "Application uptime in seconds",
    )
else:
    HTTP_REQUEST_COUNT = None
    HTTP_REQUEST_DURATION = None
    HTTP_EXCEPTION_COUNT = None
    APP_UPTIME_SECONDS = None

BLOCKED_IPS = {
    ip.strip()
    for ip in str(os.environ.get("BLOCKED_IPS", "")).split(",")
    if ip.strip()
}
SUSPICIOUS_UA_SIGNATURES = ("sqlmap", "nikto", "masscan", "nmap", "acunetix")


def is_origin_allowed(origin: Optional[str]) -> bool:
    normalized_origin = str(origin or "").strip().rstrip("/")
    if not normalized_origin:
        return False
    normalized_lower = normalized_origin.lower()
    if ALLOWED_ORIGINS and "*" not in ALLOWED_ORIGINS:
        for allowed_origin in ALLOWED_ORIGINS:
            if allowed_origin and allowed_origin.lower().rstrip("/") == normalized_lower:
                return True
    if EFFECTIVE_CORS_ALLOW_ORIGIN_REGEX:
        return re.match(EFFECTIVE_CORS_ALLOW_ORIGIN_REGEX, normalized_origin, flags=re.IGNORECASE) is not None
    return "*" in ALLOWED_ORIGINS


def get_route_template(request: Request) -> str:
    route = request.scope.get("route")
    if route and getattr(route, "path", None):
        return str(route.path)
    return request.url.path


def build_error_response(
    request: Request,
    *,
    status_code: int,
    message: str,
    code: str,
    details: Optional[Any] = None,
) -> JSONResponse:
    request_id = str(getattr(request.state, "request_id", "") or REQUEST_ID_CONTEXT.get("-"))
    payload: Dict[str, Any] = {
        "error": {
            "code": code,
            "message": message,
        },
        "detail": message,
        "request_id": request_id,
        "path": request.url.path,
        "timestamp": get_ist_now().isoformat() + "Z",
    }
    if details is not None:
        payload["error"]["details"] = details
    response = JSONResponse(status_code=status_code, content=payload)
    response.headers[REQUEST_ID_HEADER] = request_id
    return response

# ==================== STARTUP SEED ====================
async def seed_admin():
    """Create indexes and optionally seed bootstrap users from environment."""
    try:
        bootstrap_users: List[Dict[str, Any]] = []
        if BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_NAME and BOOTSTRAP_ADMIN_PHONE and BOOTSTRAP_ADMIN_PASSWORD:
            bootstrap_users.append(
                {
                    "email": BOOTSTRAP_ADMIN_EMAIL.lower(),
                    "name": BOOTSTRAP_ADMIN_NAME,
                    "phone": normalize_phone(BOOTSTRAP_ADMIN_PHONE),
                    "role": UserRole.ADMIN,
                    "password": BOOTSTRAP_ADMIN_PASSWORD,
                }
            )

        for entry in bootstrap_users:
            existing = await db.users.find_one({"email": entry["email"]})
            if existing:
                continue

            user_id = str(uuid.uuid4())
            user_doc = {
                "id": user_id,
                "email": entry["email"],
                "password_hash": hash_password(entry["password"]),
                "name": entry["name"],
                "phone": entry["phone"],
                "role": entry["role"],
                "created_at": get_ist_now(),
                "is_verified": True,
            }
            await db.users.insert_one(user_doc)
            logger.info("Bootstrap account created: %s (%s)", entry["email"], entry["role"])

            if entry["role"] == UserRole.DRIVER:
                await db.drivers.update_one(
                    {"user_id": user_id},
                    {"$setOnInsert": build_default_driver_profile(user_id)},
                    upsert=True,
                )

        # Create essential indexes (skip if already exist)
        from pymongo.errors import OperationFailure
        try:
            await db.users.create_index("email", unique=True)
        except OperationFailure:
            pass
        try:
            await db.users.create_index("id", unique=True)
        except OperationFailure:
            pass
        try:
            await db.bookings.create_index("id", unique=True)
        except OperationFailure:
            pass
        try:
            await db.bookings.create_index("passenger_id")
        except OperationFailure:
            pass
        try:
            await db.bookings.create_index("driver_id")
        except OperationFailure:
            pass
        try:
            await db.drivers.create_index("user_id", unique=True)
        except OperationFailure:
            pass
        try:
            await db.drivers.create_index([("geo_point", "2dsphere")])
        except OperationFailure:
            pass
        try:
            await db.drivers.create_index([("current_location_geo", "2dsphere")])
        except OperationFailure:
            pass
        try:
            await db.drivers.create_index([("is_online", 1), ("is_available", 1), ("kyc_status", 1)])
        except OperationFailure:
            pass
        try:
            await db.bookings.create_index([("status", 1), ("created_at", -1)])
        except OperationFailure:
            pass
        try:
            await db.bookings.create_index("status")
        except OperationFailure:
            pass
        try:
            await db.bookings.create_index([("created_at", -1)])
        except OperationFailure:
            pass
        try:
            await db.bookings.create_index("pickup_heat_cell")
        except OperationFailure:
            pass
        try:
            await db.bookings.create_index([("pickup_location_geo", "2dsphere")])
        except OperationFailure:
            pass
        try:
            await db.dispatch_logs.create_index([("created_at", -1)])
        except OperationFailure:
            pass
        try:
            await db.dispatch_logs.create_index("booking_id")
        except OperationFailure:
            pass
        try:
            await db.dispatch_logs.create_index("pickup_heat_cell")
        except OperationFailure:
            pass
        try:
            await db.dispatch_attempts.create_index("booking_id")
        except OperationFailure:
            pass
        try:
            await db.dispatch_attempts.create_index("driver_id")
        except OperationFailure:
            pass
        try:
            await db.dispatch_attempts.create_index([("booking_id", 1), ("driver_id", 1)], unique=True)
        except OperationFailure:
            pass
        try:
            await db.dispatch_risk_logs.create_index([("created_at", -1)])
        except OperationFailure:
            pass
        try:
            await db.dispatch_risk_logs.create_index("booking_id")
        except OperationFailure:
            pass
        try:
            await db.driver_kyc.create_index("driver_id", unique=True)
        except OperationFailure:
            pass
        try:
            await db.driver_documents.create_index([("driver_id", 1), ("doc_type", 1)], unique=True)
            await db.driver_documents.create_index([("driver_id", 1), ("expiry_date", 1)])
        except OperationFailure:
            pass
        try:
            await db.driver_vehicles.create_index([("driver_id", 1), ("id", 1)], unique=True)
            await db.driver_vehicles.create_index([("driver_id", 1), ("is_active", 1)])
        except OperationFailure:
            pass
        try:
            await db.sos_alerts.create_index("created_at", expireAfterSeconds=60 * 60 * 24 * 30)
        except OperationFailure:
            pass
        try:
            await db.payment_orders.create_index("order_id", unique=True)
            await db.payment_orders.create_index([("order_type", 1), ("status", 1), ("submitted_at", -1)])
        except OperationFailure:
            pass
        try:
            await db.booking_chat.create_index([("booking_id", 1), ("created_at", 1)])
        except OperationFailure:
            pass
        try:
            await db.push_tokens.create_index("user_id", unique=True)
        except OperationFailure:
            pass
        try:
            await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
        except OperationFailure:
            pass
        try:
            await db.notifications.create_index("created_at", expireAfterSeconds=60 * 60 * 24 * 30)
        except OperationFailure:
            pass
        try:
            await db.emergency_contacts.create_index("user_id")
        except OperationFailure:
            pass
        try:
            await db.user_wallets.create_index("user_id", unique=True)
        except OperationFailure:
            pass
        try:
            await db.driver_wallets.create_index("driver_id", unique=True)
        except OperationFailure:
            pass
        try:
            await db.driver_withdrawal_requests.create_index([("driver_id", 1), ("created_at", -1)])
        except OperationFailure:
            pass
        try:
            await db.driver_earnings_reports.create_index([("driver_id", 1), ("created_at", -1)])
        except OperationFailure:
            pass
        try:
            await db.subscription_dues.create_index("id", unique=True)
        except OperationFailure:
            pass
        try:
            await db.subscription_dues.create_index([("user_id", 1), ("status", 1), ("created_at", -1)])
        except OperationFailure:
            pass
        try:
            await db.passenger_profiles.create_index("user_id", unique=True)
        except OperationFailure:
            pass
        try:
            await db.passenger_kyc.create_index("user_id", unique=True)
        except OperationFailure:
            pass
        try:
            await db.passenger_documents.create_index([("user_id", 1), ("uploaded_at", -1)])
        except OperationFailure:
            pass
        try:
            await db.support_attachments.create_index([("user_id", 1), ("created_at", -1)])
        except OperationFailure:
            pass
        try:
            await db.upload_files.create_index("id", unique=True)
            await db.upload_files.create_index([("created_at", -1)])
        except OperationFailure:
            pass
        try:
            await db.driver_support_tickets.create_index([("driver_id", 1), ("updated_at", -1)])
            await db.driver_support_tickets.create_index("status")
        except OperationFailure:
            pass
        try:
            await db.driver_availability_events.create_index([("driver_id", 1), ("created_at", -1)])
        except OperationFailure:
            pass
        try:
            await db.passenger_favorite_drivers.create_index([("passenger_id", 1), ("driver_id", 1)], unique=True)
        except OperationFailure:
            pass
        try:
            await db.passenger_lost_items.create_index([("passenger_id", 1), ("created_at", -1)])
            await db.passenger_lost_items.create_index("booking_id")
            await db.passenger_lost_items.create_index("status")
        except OperationFailure:
            pass
        await db.passenger_blocked_drivers.create_index([("passenger_id", 1), ("driver_id", 1)], unique=True)
        await db.driver_blocked_passengers.create_index([("driver_id", 1), ("passenger_id", 1)], unique=True)
        await db.drivers.create_index([("custom_fare_pricing_request.status", 1), ("custom_fare_pricing_request.submitted_at", -1)])
        await db.refresh_tokens.create_index("token_hash", unique=True)
        await db.refresh_tokens.create_index("user_id")
        await db.refresh_tokens.create_index("expires_at", expireAfterSeconds=0)
        await db.audit_logs.create_index("created_at")
        await db.audit_logs.create_index("user_id")
        await db.audit_logs.create_index("action")
        await db.trusted_contacts.create_index([("user_id", 1), ("active", 1), ("created_at", -1)])
        await db.trusted_contacts.create_index([("user_id", 1), ("phone", 1)])
        await db.sos_events.create_index([("created_at", -1)])
        await db.sos_events.create_index([("user_id", 1), ("created_at", -1)])
        await db.sos_events.create_index("booking_id")
        await db.sos_events.create_index("status")
        await db.sos_contact_alerts.create_index([("sos_id", 1), ("created_at", -1)])
        await db.sos_contact_alerts.create_index([("contact_phone", 1), ("dispatch_status", 1)])
        await db.family_tracking_logs.create_index([("booking_id", 1), ("created_at", -1)])
        await db.ride_audio_recordings.create_index([("booking_id", 1), ("created_at", -1)])
        await db.ride_audio_recordings.create_index([("user_id", 1), ("created_at", -1)])
        await db.driver_complaints.create_index("driver_id")
        await db.driver_complaints.create_index([("driver_id", 1), ("created_at", -1)])
        await db.driver_complaints.create_index([("category", 1), ("created_at", -1)])
        await db.driver_complaint_strikes.create_index([("driver_id", 1), ("category", 1)], unique=True)
        await db.driver_blacklist.create_index("driver_id")
        await db.driver_blacklist.create_index([("driver_id", 1), ("active", 1)])
        await db.driver_trust_scores.create_index("driver_id", unique=True)
        await db.driver_trust_scores.create_index([("fraud_score", -1), ("updated_at", -1)])
        await db.kyc_ai_reviews.create_index("driver_id")
        await db.kyc_ai_reviews.create_index([("created_at", -1)])
        await db.revenue_plans.create_index([("role", 1), ("plan_type", 1)], unique=True)
        await db.user_subscriptions.create_index("user_id")
        await db.user_subscriptions.create_index([("user_id", 1), ("active", 1), ("expires_at", -1)])
        await db.priority_rides.create_index("booking_id")
        await db.business_rides.create_index("created_by")
        await db.ad_campaigns.create_index("placement")
        await db.wallets.create_index("user_id", unique=True)
        await db.wallet_transactions.create_index([("user_id", 1), ("created_at", -1)])
        await db.referrals.create_index("user_id", unique=True)
        await db.referrals.create_index("code", unique=True)
        await db.referral_rewards.create_index("new_user_id", unique=True)
        await db.referral_rewards.create_index("referrer_user_id")
        await db.spin_win_user_daily.create_index([("user_id", 1), ("date_key", 1)], unique=True)
        await db.spin_win_user_daily.create_index("date_key")
        await db.spin_win_rewards.create_index([("created_at", -1)])
        await db.spin_win_rewards.create_index([("user_id", 1), ("created_at", -1)])
        await db.spin_win_rewards.create_index([("date_key", 1), ("prize_id", 1)])
        await db.ride_revenues.create_index("booking_id", unique=True)
        await ensure_default_revenue_plans(db)
        await db.analytics_events.create_index([("created_at", -1)])
        await analytics_db.ride_events.create_index([("created_at", -1)])
        await db.launch_page_visits.create_index([("created_at", -1)])
        await db.launch_page_visits.create_index([("event_date", 1)])
        await db.launch_page_visits.create_index([("identity_key", 1), ("created_at", -1)])
        await db.launch_page_visits.create_index([("ip_address", 1), ("created_at", -1)])
        # Total Mobility Platform indexes
        try:
            await db.ride_types.create_index("_id", unique=True)
            await db.ride_types.create_index("active")
        except OperationFailure:
            pass
        try:
            await db.vehicle_types.create_index("_id", unique=True)
            await db.vehicle_types.create_index("active")
        except OperationFailure:
            pass
        try:
            await db.coverage_areas.create_index("_id", unique=True)
            await db.coverage_areas.create_index([("level", 1), ("active", 1)])
        except OperationFailure:
            pass
        try:
            await db.bookings.create_index([("vehicle_type_id", 1), ("created_at", -1)])
            await db.bookings.create_index([("ride_type", 1), ("created_at", -1)])
        except OperationFailure:
            pass
    except Exception as e:
        logger.error(f"Seed error: {e}")
        import traceback
        traceback.print_exc()

@app.on_event("startup")
async def on_startup():
    global driver_health_monitor_task, ride_dispatch_worker_task, analytics_warehouse_worker_task, redis_client
    if not mongo_url:
        error_msg = (
            "MONGO_URL must be configured via environment. "
            "DATABASE_URL is supported as a fallback alias. "
            "Attempting to continue anyway..."
        )
        logger.warning(error_msg)
        # Don't raise - allow server to start and retry connection
    if not JWT_SECRET:
        if IS_PRODUCTION_ENV:
            raise RuntimeError("JWT_SECRET must be configured via environment in production.")
        logger.warning("JWT_SECRET not configured; using development default")
    if IS_PRODUCTION_ENV and len(JWT_SECRET) < 32:
        raise RuntimeError("JWT_SECRET must be at least 32 characters.")
    if IS_PRODUCTION_ENV and JWT_SECRET.strip().lower() in WEAK_JWT_SECRET_VALUES:
        raise RuntimeError("JWT_SECRET is too weak. Use a strong random secret.")
    if IS_PRODUCTION_ENV and REQUIRE_REFRESH_SECRET_IN_PRODUCTION and not JWT_REFRESH_SECRET_CONFIGURED:
        raise RuntimeError(
            "JWT_REFRESH_SECRET must be configured via environment in production/staging "
            "when REQUIRE_REFRESH_SECRET_IN_PRODUCTION=true."
        )
    if IS_PRODUCTION_ENV and len(JWT_REFRESH_SECRET) < 32:
        raise RuntimeError("JWT_REFRESH_SECRET must be at least 32 characters.")
    if IS_PRODUCTION_ENV and JWT_REFRESH_SECRET.strip().lower() in WEAK_JWT_SECRET_VALUES:
        raise RuntimeError("JWT_REFRESH_SECRET is too weak. Use a strong random secret.")
    if IS_PRODUCTION_ENV and not JWT_REFRESH_SECRET_CONFIGURED:
        logger.warning(
            "JWT_REFRESH_SECRET is not configured; using JWT_SECRET as refresh secret fallback. "
            "Set JWT_REFRESH_SECRET for stronger token separation."
        )
    if IS_PRODUCTION_ENV and REQUIRE_FERNET_SECRET_IN_PRODUCTION and not FERNET_SECRET_CONFIGURED:
        raise RuntimeError(
            "FERNET_SECRET must be configured via environment in production/staging "
            "when REQUIRE_FERNET_SECRET_IN_PRODUCTION=true."
        )
    if IS_PRODUCTION_ENV and not FERNET_SECRET_CONFIGURED:
        logger.warning(
            "FERNET_SECRET is not configured; using an ephemeral key for this process. "
            "Set FERNET_SECRET for stable encrypted data across restarts."
        )
    if IS_PRODUCTION_ENV and (not ALLOWED_ORIGINS or "*" in ALLOWED_ORIGINS):
        raise RuntimeError(
            "ALLOWED_ORIGINS must list explicit HTTPS domains in production/staging. "
            "Set ALLOWED_ORIGINS (comma-separated), or FRONTEND_ORIGIN/FRONTEND_URL."
        )
    if IS_PRODUCTION_ENV and len(ALLOWED_ORIGINS) > MAX_PRODUCTION_ALLOWED_ORIGINS:
        raise RuntimeError(
            f"ALLOWED_ORIGINS has too many entries for production/staging (max {MAX_PRODUCTION_ALLOWED_ORIGINS})."
        )
    if IS_PRODUCTION_ENV:
        invalid_prod_origins = [
            origin for origin in ALLOWED_ORIGINS
            if ("localhost" in origin.lower() or "127.0.0.1" in origin.lower() or not origin.lower().startswith("https://"))
        ]
        if invalid_prod_origins:
            raise RuntimeError(
                "ALLOWED_ORIGINS in production/staging must be explicit HTTPS public domains only. "
                f"Invalid entries: {', '.join(invalid_prod_origins)}"
            )
    if IS_PRODUCTION_ENV and REQUIRE_REDIS_IN_PRODUCTION and not REDIS_URL:
        raise RuntimeError(
            "REDIS_URL must be configured when REQUIRE_REDIS_IN_PRODUCTION is enabled."
        )
    if REDIS_URL_INVALID and REQUIRE_REDIS_IN_PRODUCTION:
        raise RuntimeError(
            "REDIS_URL is invalid. Use redis://, rediss://, or unix:// scheme."
        )
    bootstrap_admin_values = [
        BOOTSTRAP_ADMIN_EMAIL,
        BOOTSTRAP_ADMIN_NAME,
        BOOTSTRAP_ADMIN_PHONE,
        BOOTSTRAP_ADMIN_PASSWORD,
    ]
    if any(bootstrap_admin_values) and not all(bootstrap_admin_values):
        raise RuntimeError(
            "If any bootstrap admin variable is set, all of BOOTSTRAP_ADMIN_EMAIL/NAME/PHONE/PASSWORD must be set."
        )
    if BOOTSTRAP_ADMIN_PASSWORD and len(BOOTSTRAP_ADMIN_PASSWORD) < 12:
        raise RuntimeError("BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.")
    try:
        await runtime_state.connect()
    except Exception as exc:
        if IS_PRODUCTION_ENV and REQUIRE_REDIS_IN_PRODUCTION:
            raise
        logger.warning("Redis runtime state init failed; continuing with in-process fallback: %s", exc)
    if IS_PRODUCTION_ENV and REQUIRE_REDIS_IN_PRODUCTION and not runtime_state.is_redis_enabled:
        raise RuntimeError("Redis runtime state backend failed to initialize.")
    if not runtime_state.is_redis_enabled:
        logger.warning("Runtime state Redis is disabled; using local in-process fallback state.")
    if APP_UPTIME_SECONDS is not None:
        APP_UPTIME_SECONDS.set(0.0)
    if REDIS_URL_INVALID:
        logger.warning(
            "REDIS_URL is invalid and cache/queue redis client is disabled. "
            "Expected schemes: redis://, rediss://, or unix://."
        )
    if redis_client:
        try:
            await redis_client.ping()
            await prime_driver_geo_index()
            app.state.redis_client = redis_client
        except Exception as exc:
            logger.warning("Redis cache/queue client ping failed; continuing without cache/queue: %s", exc)
            try:
                await redis_client.close()
            except Exception:
                pass
            redis_client = None
            app.state.redis_client = None
    await seed_admin()
    # Initialize default vehicle types
    try:
        await init_default_vehicle_types(db)
    except Exception:
        logger.exception("Vehicle types initialization failed during startup")
    # Initialize default extended vehicle types
    try:
        await init_default_vehicle_types_extended(db)
    except Exception:
        logger.exception("Extended vehicle types initialization failed during startup")
    # Initialize default ride types
    try:
        await init_default_ride_types(db)
    except Exception:
        logger.exception("Ride types initialization failed during startup")
    # Initialize canonical vehicles (single source of truth)
    try:
        await init_canonical_vehicles(db)
    except Exception:
        logger.exception("Canonical vehicles initialization failed during startup")
    # Initialize database-driven rate limit configuration
    try:
        await init_default_rate_limit_configs(db)
    except Exception:
        logger.exception("Rate limit configuration initialization failed during startup")
    # Keep legacy rate limit defaults for backward compatibility
    try:
        await ensure_rate_limit_defaults(db)
    except Exception:
        logger.exception("Rate limit defaults initialization failed during startup")
    # Initialize Fleet Advanced features database indexes
    try:
        from app.db.migration_fleet_advanced import create_fleet_advanced_indexes
        await create_fleet_advanced_indexes(db)
    except Exception:
        logger.exception("Fleet Advanced features initialization failed during startup")
    
    # Initialize Operations Center database indexes
    try:
        from app.db.migration_operations_center import create_operations_center_indexes
        await create_operations_center_indexes(db)
    except Exception:
        logger.exception("Operations Center initialization failed during startup")
    
    # Initialize Corporate Portal database indexes
    try:
        from app.db.migration_corporate_portal import create_corporate_portal_indexes
        await create_corporate_portal_indexes(db)
    except Exception:
        logger.exception("Corporate Portal initialization failed during startup")
    
    # Initialize Airport Ride System database indexes
    try:
        from app.db.migration_airport import create_airport_indexes
        await create_airport_indexes(db)
    except Exception:
        logger.exception("Airport Ride System initialization failed during startup")
    
    # Initialize Driver Heatmaps database indexes
    try:
        from app.db.migration_heatmaps import create_heatmap_indexes
        await create_heatmap_indexes(db)
    except Exception:
        logger.exception("Driver Heatmaps initialization failed during startup")
    
    # Initialize Fleet Profitability database indexes
    try:
        from app.db.migration_fleet_profitability import create_fleet_profitability_indexes
        await create_fleet_profitability_indexes(db)
    except Exception:
        logger.exception("Fleet Profitability initialization failed during startup")
    
    try:
        referral_backfill = await backfill_referrals_for_existing_users(db)
        if referral_backfill.get("ran"):
            logger.info("Referral code backfill completed for %s users.", referral_backfill.get("processed", 0))
    except Exception:
        logger.exception("Referral code backfill failed during startup")
    if driver_health_monitor_task is None or driver_health_monitor_task.done():
        driver_health_monitor_task = asyncio.create_task(driver_health_monitor())
    if ride_dispatch_worker_task is None or ride_dispatch_worker_task.done():
        ride_dispatch_worker_task = asyncio.create_task(ride_dispatch_worker())
    if analytics_warehouse_worker_task is None or analytics_warehouse_worker_task.done():
        analytics_warehouse_worker_task = asyncio.create_task(analytics_warehouse_worker())

@app.middleware("http")
async def api_guardrails_middleware(request: Request, call_next):
    inbound_request_id = str(request.headers.get(REQUEST_ID_HEADER) or "").strip()
    request_id = inbound_request_id if inbound_request_id else str(uuid.uuid4())
    request.state.request_id = request_id
    token = REQUEST_ID_CONTEXT.set(request_id)
    start_time = time.perf_counter()
    client_ip = get_request_ip(request)
    path_template = request.url.path
    status_code = 500
    response: Optional[Any] = None
    try:
        if request.method in {"POST", "PUT", "PATCH"}:
            content_length_value = str(request.headers.get("content-length") or "").strip()
            if content_length_value:
                try:
                    if int(content_length_value) > MAX_REQUEST_BODY_BYTES:
                        response = build_error_response(
                            request,
                            status_code=413,
                            message="Request payload is too large.",
                            code="payload_too_large",
                            details={"max_bytes": MAX_REQUEST_BODY_BYTES},
                        )
                        status_code = int(response.status_code)
                        return response
                except ValueError:
                    response = build_error_response(
                        request,
                        status_code=400,
                        message="Invalid Content-Length header.",
                        code="invalid_content_length",
                    )
                    status_code = int(response.status_code)
                    return response

        user_agent_value = str(request.headers.get("user-agent") or "").lower()
        if client_ip in BLOCKED_IPS or await runtime_state.is_ip_blocked(client_ip):
            await audit_log(
                request=request,
                user_id=None,
                action="IP_BLOCKED",
                resource=request.url.path,
                success=False,
                metadata={"ip": client_ip},
            )
            response = build_error_response(
                request,
                status_code=403,
                message="Access denied",
                code="ip_blocked",
            )
            status_code = int(response.status_code)
            return response

        if any(signature in user_agent_value for signature in SUSPICIOUS_UA_SIGNATURES):
            suspicious_hits = await runtime_state.increment_ip_risk(client_ip, ttl_seconds=3600)
            await audit_log(
                request=request,
                user_id=None,
                action="SUSPICIOUS_CLIENT",
                resource=request.url.path,
                success=False,
                metadata={"ip": client_ip, "user_agent": user_agent_value, "hits": suspicious_hits},
            )
            if suspicious_hits >= 3:
                await runtime_state.block_ip(client_ip, ttl_seconds=3600)
                response = build_error_response(
                    request,
                    status_code=403,
                    message="Access denied",
                    code="suspicious_client_blocked",
                )
                status_code = int(response.status_code)
                return response

        if request.url.path not in {"/api/health", "/health"}:
            rate_limit_rule = await get_rate_limit_rule_for_path(request.url.path, db)
            try:
                if rate_limit_rule:
                    await runtime_state.check_bucket_rate_limit(
                        bucket_name=rate_limit_rule.bucket_name,
                        ip_address=client_ip,
                        window_seconds=rate_limit_rule.window_seconds,
                        max_requests=rate_limit_rule.max_requests,
                    )
            except HTTPException:
                await audit_log(
                    request=request,
                    user_id=None,
                    action="RATE_LIMIT_BLOCK",
                    resource=request.url.path,
                    success=False,
                    metadata={
                        "bucket": rate_limit_rule.bucket_name if rate_limit_rule else "disabled",
                        "limit_type": rate_limit_rule.limit_type if rate_limit_rule else None,
                        "source": rate_limit_rule.source if rate_limit_rule else None,
                    },
                )
                response = build_error_response(
                    request,
                    status_code=429,
                    message="Too many requests. Please try again later.",
                    code="rate_limited",
                )
                status_code = int(response.status_code)
                return response

        if request.url.path.startswith("/api") and request.url.path != "/api/health":
            api_global_rule = await get_rate_limit_profile_rule(
                "api_global",
                db,
                bucket_name="profile:api_global",
            )
            try:
                if api_global_rule:
                    await runtime_state.check_bucket_rate_limit(
                        bucket_name=api_global_rule.bucket_name,
                        ip_address=client_ip,
                        window_seconds=api_global_rule.window_seconds,
                        max_requests=api_global_rule.max_requests,
                    )
            except HTTPException as exc:
                response = build_error_response(
                    request,
                    status_code=exc.status_code,
                    message=str(exc.detail),
                    code="rate_limited",
                )
                status_code = int(response.status_code)
                return response
        response = await call_next(request)
        status_code = int(response.status_code)
        return response
    finally:
        try:
            duration_seconds = max(0.0, time.perf_counter() - start_time)
            path_template = get_route_template(request)
            if response is not None:
                response.headers[REQUEST_ID_HEADER] = request_id
            if HTTP_REQUEST_COUNT is not None:
                HTTP_REQUEST_COUNT.labels(
                    method=request.method,
                    path=path_template,
                    status=str(status_code),
                ).inc()
            if HTTP_REQUEST_DURATION is not None:
                HTTP_REQUEST_DURATION.labels(
                    method=request.method,
                    path=path_template,
                ).observe(duration_seconds)
            logger.info(
                "http_request",
                extra={
                    "extra_data": {
                        "method": request.method,
                        "path": path_template,
                        "status_code": status_code,
                        "duration_ms": round(duration_seconds * 1000, 2),
                        "client_ip": client_ip,
                        "user_agent": str(request.headers.get("user-agent") or ""),
                    }
                },
            )
        finally:
            REQUEST_ID_CONTEXT.reset(token)

# ==================== ENUMS ====================
class UserRole(str, Enum):
    PASSENGER = "passenger"
    DRIVER = "driver"
    ADMIN = "admin"

class Gender(str, Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"

class BookingStatus(str, Enum):
    PENDING = "pending"
    SCHEDULED = "scheduled"
    SEARCHING = "searching"
    ACCEPTED = "accepted"
    DRIVER_ARRIVED = "driver_arrived"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    REJECTED = "rejected"
    NO_DRIVER_FOUND = "no_driver_found"
    BOOKING_FAILED = "booking_failed"
    WAITING_FOR_PAYMENT = "waiting_for_payment"
    RATING_PENDING = "rating_pending"

class PaymentMethod(str, Enum):
    CASH = "cash"
    ONLINE = "online"

class KYCStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"

class SOSSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

class PaymentOrderStatus(str, Enum):
    CREATED = "created"
    PENDING_VERIFICATION = "pending_verification"
    PAID = "paid"
    FAILED = "failed"

class SubscriptionPlanType(str, Enum):
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    ANNUALLY = "annually"
    PER_TRIP = "per_trip"


PHONE_PATTERN = r"^\d{10}$"
OTP_PATTERN = r"^\d{4,8}$"
TIME_24H_PATTERN = r"^(?:[01]\d|2[0-3]):[0-5]\d$"
PHONE_REGEX = re.compile(r"^[6-9]\d{9}$")
NAME_REGEX = re.compile(r"^[A-Za-z\s]{2,80}$")
SUPPORTED_LANGUAGE_CODES = {
    "en",
    "as",
    "bn",
    "brx",
    "doi",
    "gu",
    "hi",
    "kn",
    "ks",
    "kok",
    "mai",
    "ml",
    "mni",
    "mr",
    "ne",
    "or",
    "pa",
    "sa",
    "sat",
    "sd",
    "ta",
    "te",
    "ur",
}


def normalize_language_code(value: Optional[str], default: str = "en") -> str:
    normalized = str(value or "").strip().lower().replace("_", "-")
    base_code = normalized.split("-")[0] if normalized else ""
    if normalized in SUPPORTED_LANGUAGE_CODES:
        return normalized
    if base_code in SUPPORTED_LANGUAGE_CODES:
        return base_code
    return default

# ==================== MODELS ====================
class Location(BaseModel):
    model_config = ConfigDict(extra="forbid")
    latitude: float
    longitude: float
    address: Optional[str] = None

class UserBase(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    email: EmailStr
    name: str = Field(min_length=2, max_length=80)
    phone: str = Field(pattern=PHONE_PATTERN)
    role: UserRole = UserRole.PASSENGER
    gender: Gender

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        cleaned = str(value or "").strip()
        if not NAME_REGEX.match(cleaned):
            raise ValueError("Name should contain only letters and spaces")
        return cleaned

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        cleaned = str(value or "").strip()
        if not PHONE_REGEX.match(cleaned):
            raise ValueError("Invalid Indian mobile number")
        return cleaned

class UserCreate(UserBase):
    password: str = Field(min_length=8, max_length=128)
    phone_otp: Optional[str] = Field(default=None, pattern=OTP_PATTERN)
    email_otp: Optional[str] = Field(default=None, pattern=OTP_PATTERN)
    referral_code: Optional[str] = Field(default=None, min_length=4, max_length=20)
    registration_fee_ack: bool = False
    registration_payment_method: Optional[Literal["qr", "upi", "razorpay"]] = None
    registration_payment_utr: Optional[str] = Field(default=None, min_length=6, max_length=80)

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, value: str) -> str:
        text = str(value or "")
        if not re.search(r"[A-Z]", text):
            raise ValueError("Password must contain one uppercase letter")
        if not re.search(r"[a-z]", text):
            raise ValueError("Password must contain one lowercase letter")
        if not re.search(r"\d", text):
            raise ValueError("Password must contain one number")
        return text

class UserLogin(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

class GoogleAuthRequestModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    google_id_token: Optional[str] = None
    email: Optional[EmailStr] = None
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    phone: Optional[str] = Field(default=None, pattern=PHONE_PATTERN)
    role: UserRole = UserRole.PASSENGER
    gender: Optional[Gender] = None
    mode: Literal["login", "register"] = "login"
    referral_code: Optional[str] = Field(default=None, min_length=4, max_length=20)
    registration_fee_ack: bool = False
    registration_payment_method: Optional[Literal["qr", "upi", "razorpay"]] = None
    registration_payment_utr: Optional[str] = Field(default=None, min_length=6, max_length=80)

class OtpSendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    phone: str = Field(pattern=PHONE_PATTERN)

class EmailOtpSendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    email: EmailStr

class OtpVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    phone: str = Field(pattern=PHONE_PATTERN)
    otp: str = Field(pattern=OTP_PATTERN)
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    email: Optional[EmailStr] = None
    role: UserRole = UserRole.PASSENGER

class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=128)

class PhoneChangeRequest(BaseModel):
    new_phone: str

class PhoneChangeVerifyRequest(BaseModel):
    new_phone: str
    otp: str = Field(min_length=4, max_length=8)

class PhoneChangeReviewRequest(BaseModel):
    status: Literal["approved", "rejected"]
    reject_reason: Optional[str] = Field(default=None, max_length=200)

class AccountDeletionConfirmation(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    confirmation: Literal["DELETE"]

class AccountDeletionReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    status: Literal["approved", "rejected"]
    reject_reason: Optional[str] = Field(default=None, max_length=250)

class PassengerProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, pattern=PHONE_PATTERN)

    @field_validator("name")
    @classmethod
    def validate_optional_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = str(value or "").strip()
        if not NAME_REGEX.match(cleaned):
            raise ValueError("Name should contain only letters and spaces")
        return cleaned

    @field_validator("phone")
    @classmethod
    def validate_optional_phone(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = str(value or "").strip()
        if not PHONE_REGEX.match(cleaned):
            raise ValueError("Invalid Indian mobile number")
        return cleaned

class PassengerProfilePreferencesUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    preferred_language: Optional[str] = Field(default=None, min_length=2, max_length=12)
    notifications_enabled: Optional[bool] = None
    email_notifications: Optional[bool] = None
    ride_sharing_enabled: Optional[bool] = None

    @field_validator("preferred_language")
    @classmethod
    def validate_preferred_language(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        normalized = normalize_language_code(value, default="")
        if not normalized:
            raise ValueError("Unsupported language")
        return normalized

class PassengerKYCVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    document_type: Literal["aadhar", "pan", "license", "passport"]
    document_number: str = Field(min_length=4, max_length=40)

class PassengerLostItemRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    item_type: str = Field(min_length=2, max_length=80)
    description: str = Field(min_length=5, max_length=500)
    contact: str = Field(min_length=3, max_length=120)

class PassengerSubscriptionUpgradeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    plan_key: str = Field(min_length=2, max_length=40)

class SupportTicketStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    status: Literal["open", "in_progress", "waiting_for_user", "resolved", "closed"]

class DriverSupportTicketCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    subject: str = Field(min_length=3, max_length=140)
    description: str = Field(min_length=5, max_length=2000)
    category: str = Field(default="general", min_length=2, max_length=40)
    priority: Literal["low", "normal", "high", "urgent"] = "normal"
    attachment_urls: List[str] = Field(default_factory=list, max_length=5)

class DriverSupportTicketReply(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    message: str = Field(min_length=1, max_length=2000)
    attachment_urls: List[str] = Field(default_factory=list, max_length=5)

class DriverSupportTicketEscalation(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    reason: str = Field(min_length=5, max_length=1000)

class OtpSendResponse(BaseModel):
    message: str
    expires_in_seconds: int
    otp_demo: Optional[str] = None

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    phone: str
    role: UserRole
    gender: Optional[Gender] = None
    referral_code: Optional[str] = None
    created_at: datetime

class AuthResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    user: UserResponse


class RefreshTokenRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    refresh_token: str = Field(min_length=20)


class LogoutRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    refresh_token: str = Field(min_length=20)

class VehicleInfo(BaseModel):
    vehicle_number: str
    vehicle_model: str
    vehicle_color: str

class DriverProfile(BaseModel):
    user_id: str
    vehicle_info: VehicleInfo
    is_available: bool = False
    current_location: Optional[Location] = None
    rating: float = 5.0
    total_rides: int = 0
    fare_multiplier: float = 1.0  # Driver can set their own multiplier

class DriverProfileCreate(BaseModel):
    vehicle_info: VehicleInfo

class DriverProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: Optional[str] = Field(default=None, min_length=2, max_length=80)
    email: Optional[EmailStr] = None
    phone: Optional[str] = Field(default=None, pattern=PHONE_PATTERN)

    @field_validator("name")
    @classmethod
    def validate_optional_name(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        cleaned = str(value or "").strip()
        if not NAME_REGEX.match(cleaned):
            raise ValueError("Name should contain only letters and spaces")
        return cleaned

    @field_validator("phone")
    @classmethod
    def validate_optional_phone(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        return normalize_phone(value)

class DriverBankDetailsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    bank_name: str = Field(min_length=2, max_length=80)
    bank_account_holder: str = Field(min_length=2, max_length=100)
    bank_account_number: str = Field(min_length=6, max_length=30)
    bank_ifsc_code: str = Field(min_length=11, max_length=11)

    @field_validator("bank_account_number")
    @classmethod
    def validate_bank_account_number(cls, value: str) -> str:
        cleaned = re.sub(r"\D+", "", str(value or ""))
        if len(cleaned) < 6:
            raise ValueError("Invalid account number")
        return cleaned

    @field_validator("bank_ifsc_code")
    @classmethod
    def validate_ifsc(cls, value: str) -> str:
        cleaned = str(value or "").strip().upper()
        if not re.match(r"^[A-Z]{4}0[A-Z0-9]{6}$", cleaned):
            raise ValueError("Invalid IFSC code")
        return cleaned

class DriverEmergencyContactUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    emergency_contact_name: str = Field(min_length=2, max_length=80)
    emergency_contact_phone: str = Field(pattern=PHONE_PATTERN)
    relationship: Optional[str] = Field(default="Emergency contact", max_length=40)

    @field_validator("emergency_contact_phone")
    @classmethod
    def validate_emergency_phone(cls, value: str) -> str:
        return normalize_phone(value)

class TwoFactorVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    otp: str = Field(pattern=OTP_PATTERN)

class TwoFactorDisableRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    current_password: str = Field(min_length=1, max_length=128)

class DriverLocationUpdate(BaseModel):
    location: Location

class DriverTelemetryUpdate(BaseModel):
    latitude: float
    longitude: float
    speed: float = 0.0
    timestamp: Optional[int] = None

class DriverAvailabilityUpdate(BaseModel):
    is_available: bool

class DriverFareUpdate(BaseModel):
    fare_multiplier: float = Field(ge=0.8, le=2.0)  # 0.8x to 2x

class DriverVehiclePayload(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    make: str = Field(min_length=1, max_length=60)
    model: str = Field(min_length=1, max_length=60)
    year: int = Field(ge=1900, le=2100)
    color: Optional[str] = Field(default="", max_length=40)
    license_plate: str = Field(min_length=2, max_length=30)
    registration_number: Optional[str] = Field(default=None, max_length=60)
    seating_capacity: int = Field(default=4, ge=1, le=12)
    vehicle_type: str = Field(default="auto", min_length=2, max_length=40)

class DriverSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    push_notifications: Optional[bool] = None
    email_notifications: Optional[bool] = None
    sms_alerts: Optional[bool] = None
    sound_enabled: Optional[bool] = None
    vibration_enabled: Optional[bool] = None
    quiet_hours_enabled: Optional[bool] = None
    quiet_hours_start: Optional[str] = Field(default=None, pattern=TIME_24H_PATTERN)
    quiet_hours_end: Optional[str] = Field(default=None, pattern=TIME_24H_PATTERN)
    language: Optional[str] = Field(default=None, min_length=2, max_length=10)
    theme: Optional[str] = Field(default=None, min_length=3, max_length=20)
    share_location: Optional[bool] = None
    accept_promo: Optional[bool] = None

    @field_validator("language")
    @classmethod
    def validate_language(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        normalized = normalize_language_code(value, default="")
        if not normalized:
            raise ValueError("Unsupported language")
        return normalized

    @field_validator("theme")
    @classmethod
    def validate_theme(cls, value: Optional[str]) -> Optional[str]:
        if value is None:
            return value
        normalized = str(value or "").strip().lower()
        if normalized not in {"light", "dark", "auto"}:
            raise ValueError("Unsupported theme")
        return normalized

class DriverFareCalculatorConfig(BaseModel):
    base_fare: float = Field(default=25.0, ge=0.0)
    per_km_rate: float = Field(default=12.0, ge=0.0)
    peak_hours: List[int] = Field(default_factory=lambda: [8, 9, 17, 18, 19])
    surge_multiplier: float = Field(default=1.5, ge=1.0)
    night_multiplier: float = Field(default=1.3, ge=1.0)
    minimum_fare: float = Field(default=30.0, ge=0.0)
    driver_base_search_radius_km: float = Field(default=5.0, ge=0.5, le=50.0)
    driver_long_distance_search_radius_km: float = Field(default=12.0, ge=0.5, le=100.0)
    driver_pickup_surcharge_per_km: float = Field(default=12.0, ge=0.0)

class DriverFareCalculatorReview(BaseModel):
    status: Literal["approved", "rejected"]
    reject_reason: Optional[str] = Field(default=None, max_length=200)

class DriverFareCalculatorResetRequest(BaseModel):
    note: Optional[str] = Field(default="Reset to admin default fare calculator", max_length=200)

class DriverWithdrawalRequest(BaseModel):
    amount: float = Field(gt=0.0)
    method: str = Field(default="bank_transfer", min_length=2, max_length=40)

class DriverWithdrawalReview(BaseModel):
    status: Literal["approved", "processing", "paid", "rejected", "failed"]
    admin_note: Optional[str] = Field(default=None, max_length=500)
    failure_reason: Optional[str] = Field(default=None, max_length=500)
    payout_reference: Optional[str] = Field(default=None, max_length=120)

class DriverBankReview(BaseModel):
    status: Literal["verified", "rejected", "failed"]
    reject_reason: Optional[str] = Field(default=None, max_length=300)

class DriverEarningsReportRequest(BaseModel):
    format: Literal["json", "pdf"] = "json"

class BookingCreate(BaseModel):
    pickup_location: Location
    drop_location: Location
    payment_method: PaymentMethod = PaymentMethod.CASH
    scheduled_for: Optional[datetime] = None
    allow_parallel: bool = False
    selected_driver_id: Optional[str] = None

class BookingResponse(BaseModel):
    id: str
    passenger_id: str
    passenger_name: Optional[str] = None
    driver_id: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    vehicle_info: Optional[VehicleInfo] = None
    pickup_location: Location
    drop_location: Location
    status: BookingStatus
    estimated_fare: float
    final_fare: Optional[float] = None
    actual_distance_km: Optional[float] = None
    distance_km: float
    pickup_surcharge: float = 0.0
    extra_pickup_distance_km: float = 0.0
    payment_method: PaymentMethod
    scheduled_for: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    route_polyline: Optional[List[Location]] = None

class BookingStatusUpdate(BaseModel):
    status: BookingStatus
    ride_start_otp: Optional[str] = Field(default=None, min_length=4, max_length=8)
    ride_end_otp: Optional[str] = Field(default=None, min_length=4, max_length=8)
    allow_complete_without_otp: bool = False
    complete_without_otp_reason: Optional[str] = Field(default=None, max_length=200)

class AdminBookingCancelRequest(BaseModel):
    reason: Optional[str] = Field(default="Cancelled by admin on user request", max_length=250)

class FareEstimateRequest(BaseModel):
    pickup_location: Location
    drop_location: Location

class FareEstimateResponse(BaseModel):
    base_fare: float
    distance_km: float
    distance_fare: float
    surge_multiplier: float
    total_fare: float
    breakdown: Dict[str, Any]

class TripTipsRequest(BaseModel):
    pickup_address: str
    drop_address: str
    payment_method: PaymentMethod = PaymentMethod.CASH
    estimated_fare: Optional[float] = None

class TripTipsResponse(BaseModel):
    tips: str
    source: str = "fallback"
class SupportChatRequest(BaseModel):
    message: str = Field(min_length=3, max_length=600)
    context: Optional[Dict[str, Any]] = None

class SupportChatResponse(BaseModel):
    reply: str
    source: str = "fallback"

class DriverAdviceRequest(BaseModel):
    city: Optional[str] = "Bengaluru"
    available_hours: Optional[int] = 8
    notes: Optional[str] = None

class DriverAdviceResponse(BaseModel):
    advice: str
    source: str = "fallback"

class AdminInsightsResponse(BaseModel):
    insights: str
    source: str = "fallback"

class PricingRule(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    base_fare: float = 25.0  # Base fare in rupees
    per_km_rate: float = 12.0  # Per km rate
    peak_hours: List[int] = [8, 9, 17, 18, 19]  # Peak hours (24h format)
    surge_multiplier: float = 1.5  # During peak hours
    night_multiplier: float = 1.3  # 11 PM - 5 AM
    minimum_fare: float = 30.0
    driver_base_search_radius_km: float = Field(default=5.0, ge=0.5, le=50.0)  # Radius A
    driver_long_distance_search_radius_km: float = Field(default=12.0, ge=0.5, le=100.0)  # Radius B
    scheduled_booking_driver_radius_km: float = Field(default=10.0, ge=0.5, le=100.0)
    driver_pickup_surcharge_per_km: float = Field(default=12.0, ge=0.0)  # Extra charge beyond radius A
    passenger_registration_fee: float = 0.0
    driver_registration_fee: float = 0.0
    enable_qr: bool = False
    enable_upi: bool = False
    enable_razorpay: bool = False
    registration_qr_code_url: Optional[str] = None
    registration_upi_id: Optional[str] = None
    razorpay_payment_link: Optional[str] = None
    updated_at: datetime = Field(default_factory=get_ist_now)

class RegistrationFeeSettings(BaseModel):
    passenger_registration_fee: float = Field(default=0.0, ge=0.0)
    driver_registration_fee: float = Field(default=0.0, ge=0.0)
    scheme_start_at: Optional[datetime] = None
    scheme_end_at: Optional[datetime] = None
    enable_qr: bool = False
    enable_upi: bool = False
    enable_razorpay: bool = False
    registration_qr_code_url: Optional[str] = None
    registration_upi_id: Optional[str] = None
    razorpay_payment_link: Optional[str] = None

class SubscriptionPeriodPlan(BaseModel):
    amount: float = Field(default=0.0, ge=0.0)
    active: bool = False
    scheme_start_at: Optional[datetime] = None
    scheme_end_at: Optional[datetime] = None

class PerTripSubscriptionPlan(BaseModel):
    amount: float = Field(default=0.0, ge=0.0)
    active: bool = False
    ride_threshold: int = Field(default=10, ge=1)
    scheme_start_at: Optional[datetime] = None
    scheme_end_at: Optional[datetime] = None

class RoleSubscriptionConfig(BaseModel):
    monthly: SubscriptionPeriodPlan = Field(default_factory=SubscriptionPeriodPlan)
    quarterly: SubscriptionPeriodPlan = Field(default_factory=SubscriptionPeriodPlan)
    annually: SubscriptionPeriodPlan = Field(default_factory=SubscriptionPeriodPlan)
    per_trip: PerTripSubscriptionPlan = Field(default_factory=PerTripSubscriptionPlan)

class SubscriptionConfig(BaseModel):
    passenger: RoleSubscriptionConfig = Field(default_factory=RoleSubscriptionConfig)
    driver: RoleSubscriptionConfig = Field(default_factory=RoleSubscriptionConfig)
    updated_at: datetime = Field(default_factory=get_ist_now)

class SubscriptionSelectionRequest(BaseModel):
    plan_type: SubscriptionPlanType

class SubscriptionDuePaymentRequest(BaseModel):
    payment_method: Literal["qr", "upi", "razorpay"]
    payment_utr: Optional[str] = Field(default=None, min_length=6, max_length=120)
    payment_ref: Optional[str] = Field(default=None, max_length=120)

class SubscriptionDueReviewRequest(BaseModel):
    status: Literal["verified", "rejected"]
    reject_reason: Optional[str] = Field(default=None, max_length=250)

class SubscriptionUserActivationRequest(BaseModel):
    plan_type: Optional[SubscriptionPlanType] = None
    activate: bool = True
    note: Optional[str] = Field(default=None, max_length=250)

class RegistrationPaymentReview(BaseModel):
    status: Literal["verified", "rejected"]
    reject_reason: Optional[str] = None

class RatingCreate(BaseModel):
    booking_id: str
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = None

class BookingCancelRequest(BaseModel):
    reason_code: Optional[str] = Field(default=None, max_length=80)
    reason_text: Optional[str] = Field(default=None, max_length=400)
    policy_acknowledged: bool = False
    policy_version: Optional[str] = Field(default="driver_cancel_v1", max_length=80)
    support_context: Optional[Dict[str, Any]] = None
    passenger_context: Optional[Dict[str, Any]] = None

class NearbyDriverResponse(BaseModel):
    driver_id: str
    name: str
    phone: str
    vehicle_info: VehicleInfo
    rating: float
    distance_km: float
    fare_multiplier: float
    location: Location
    pickup_surcharge: float = 0.0
    extra_pickup_distance_km: float = 0.0
    projected_fare: Optional[float] = None

class FavoriteDriverToggleRequest(BaseModel):
    is_favorite: bool = True

class UserBlockToggleRequest(BaseModel):
    is_blocked: bool = True
    reason: Optional[str] = None
    booking_id: Optional[str] = None

class RouteEstimateRequest(BaseModel):
    pickup_location: Location
    drop_location: Location

class RouteEstimateResponse(BaseModel):
    distance_km: float
    duration_minutes: int
    eta_minutes: int
    source: str
    route_polyline: Optional[List[Location]] = None

class DriverKYCSubmission(BaseModel):
    aadhaar_number: str = Field(min_length=12, max_length=20)
    license_number: str = Field(min_length=5, max_length=30)
    rc_number: str = Field(min_length=5, max_length=30)
    aadhaar_image_url: str
    license_image_url: str
    rc_image_url: str
    selfie_image_url: str

class DriverKYCReview(BaseModel):
    status: KYCStatus
    reject_reason: Optional[str] = None

class EmergencyContact(BaseModel):
    name: str
    phone: str
    relation: Optional[str] = None

class EmergencyContactCreate(EmergencyContact):
    pass

class SOSAlertCreate(BaseModel):
    booking_id: Optional[str] = None
    latitude: float
    longitude: float
    message: Optional[str] = None
    severity: SOSSeverity = SOSSeverity.HIGH

class PaymentOrderCreate(BaseModel):
    booking_id: str

class PaymentOrderResponse(BaseModel):
    order_id: str
    booking_id: str
    amount: float
    currency: str = "INR"
    status: PaymentOrderStatus
    provider: str = "upi_intent"
    upi_intent: Optional[str] = None
    stripe_client_secret: Optional[str] = None
    stripe_payment_intent_id: Optional[str] = None

class PaymentVerifyRequest(BaseModel):
    order_id: str
    transaction_ref: str

class PushTokenRegister(BaseModel):
    token: str = Field(min_length=20, max_length=400)
    platform: str = Field(default="web", min_length=2, max_length=40)

class BookingChatMessageCreate(BaseModel):
    message: str = Field(min_length=1, max_length=600)

class BookingChatMessageResponse(BaseModel):
    id: str
    booking_id: str
    sender_id: str
    sender_name: str
    sender_role: UserRole
    message: str
    created_at: datetime

class BookingCallRoomResponse(BaseModel):
    booking_id: str
    room_name: str
    room_url: str
    enabled_until_status: str = "completed"
# ==================== HELPER FUNCTIONS ====================
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def encrypt_value(value: str) -> str:
    if not value:
        return ""
    return fernet.encrypt(value.encode()).decode()


def decrypt_value(value: str) -> str:
    if not value:
        return ""
    return fernet.decrypt(value.encode()).decode()


def create_access_token_for_user(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "type": "access",
        "iat": get_ist_now(),
        "exp": get_ist_now() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token_for_user(user_id: str, role: str) -> str:
    token_id = str(uuid.uuid4())
    payload = {
        "sub": user_id,
        "jti": token_id,
        "role": role,
        "type": "refresh",
        "iat": get_ist_now(),
        "exp": get_ist_now() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
    }
    return jwt.encode(payload, JWT_REFRESH_SECRET, algorithm=JWT_ALGORITHM)


def create_token(user_id: str, role: str) -> str:
    # Backward-compatible alias for access tokens.
    return create_access_token_for_user(user_id, role)


def hash_refresh_token_value(refresh_token: str) -> str:
    return hashlib.sha256(refresh_token.encode("utf-8")).hexdigest()


async def store_refresh_token(user_id: str, refresh_token: str, request: Request):
    token_hash = hash_refresh_token_value(refresh_token)
    await db.refresh_tokens.insert_one(
        {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "token_hash": token_hash,
            "ip": get_client_ip(request),
            "user_agent": request.headers.get("user-agent", ""),
            "revoked": False,
            "created_at": get_ist_now(),
            "expires_at": get_ist_now() + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS),
        }
    )


async def revoke_refresh_token(refresh_token: str):
    token_hash = hash_refresh_token_value(refresh_token)
    await db.refresh_tokens.update_one(
        {"token_hash": token_hash},
        {"$set": {"revoked": True, "revoked_at": get_ist_now()}},
    )


def decode_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        token_type = str(payload.get("type") or "access").strip().lower()
        if token_type != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


def decode_refresh_token(token: str) -> dict:
    try:
        payload = jwt.decode(token, JWT_REFRESH_SECRET, algorithms=[JWT_ALGORITHM])
        if str(payload.get("type") or "").strip().lower() != "refresh":
            raise HTTPException(status_code=401, detail="Invalid refresh token")
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Refresh token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

def get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


def get_request_ip(request: Request) -> str:
    return get_client_ip(request)

def _safe_text(value: Any, max_length: int = 300) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    return text[:max_length]


def _safe_int(value: Any, *, min_value: int = 0, max_value: int = 20000) -> Optional[int]:
    if value is None or isinstance(value, bool):
        return None
    try:
        parsed = int(float(value))
    except (TypeError, ValueError):
        return None
    if parsed < min_value or parsed > max_value:
        return None
    return parsed


def _safe_float(value: Any, *, min_value: float = 0.0, max_value: float = 256.0) -> Optional[float]:
    if value is None or isinstance(value, bool):
        return None
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    if parsed < min_value or parsed > max_value:
        return None
    return parsed


def _safe_phone(value: Any) -> Optional[str]:
    digits = re.sub(r"\D+", "", str(value or ""))
    if 8 <= len(digits) <= 15:
        return digits
    return None


def _normalize_role_text(value: Any) -> Optional[str]:
    role = str(value or "").strip().lower()
    if role in {UserRole.PASSENGER.value, UserRole.DRIVER.value, UserRole.ADMIN.value}:
        return role
    return None


def _build_launch_identity(payload: Dict[str, Any], token_user: Optional[Dict[str, Any]]) -> Dict[str, Optional[str]]:
    if token_user:
        user_id = _safe_text(token_user.get("id"), 80)
        name = _safe_text(token_user.get("name"), 120)
        email = _safe_text(token_user.get("email"), 200)
        phone = _safe_phone(token_user.get("phone"))
        role = _normalize_role_text(token_user.get("role"))
    else:
        user_id = _safe_text(payload.get("session_user_id") or payload.get("user_id"), 80)
        name = _safe_text(payload.get("session_name") or payload.get("name"), 120)
        email = _safe_text(payload.get("session_email") or payload.get("email"), 200)
        phone = _safe_phone(payload.get("session_phone") or payload.get("phone"))
        role = _normalize_role_text(payload.get("session_role") or payload.get("role"))

    identity_key = None
    if user_id:
        identity_key = f"user:{user_id}"
    elif phone:
        identity_key = f"phone:{phone}"
    elif email:
        identity_key = f"email:{email.lower()}"
    elif name:
        identity_key = f"name:{name.lower()}"

    return {
        "user_id": user_id,
        "name": name,
        "email": email.lower() if email else None,
        "phone": phone,
        "role": role,
        "identity_key": identity_key,
    }

async def check_api_rate_limit(ip_address: str):
    await runtime_state.check_api_rate_limit(ip_address)

async def check_login_throttle(ip_address: str):
    await runtime_state.check_login_throttle(ip_address)


async def register_login_attempt(ip_address: str):
    await runtime_state.register_login_attempt(ip_address)


async def clear_login_attempts(ip_address: str):
    await runtime_state.clear_login_attempts(ip_address)


async def audit_log(
    *,
    request: Request,
    user_id: Optional[str],
    action: str,
    resource: str,
    success: bool,
    metadata: Optional[Dict[str, Any]] = None,
):
    try:
        await db.audit_logs.insert_one(
            {
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "action": action,
                "resource": resource,
                "success": bool(success),
                "ip": get_client_ip(request),
                "user_agent": request.headers.get("user-agent", ""),
                "method": request.method,
                "path": request.url.path,
                "metadata": metadata or {},
                "created_at": get_ist_now(),
            }
        )
    except Exception:
        logger.exception("Audit log failed")

def normalize_phone(raw_phone: str) -> str:
    digits_only = "".join(char for char in str(raw_phone) if char.isdigit())
    if len(digits_only) != 10:
        raise HTTPException(status_code=400, detail="Invalid phone. Phone number must be exactly 10 digits.")
    return digits_only

def normalize_email(raw_email: str) -> str:
    return str(raw_email or "").strip().lower()

async def consume_phone_otp(phone: str, otp_code: str):
    await runtime_state.consume_phone_otp(phone, otp_code)


async def consume_email_otp(email: str, otp_code: str):
    await runtime_state.consume_email_otp(email, otp_code)

def auth_response_for_user(user: Dict[str, Any], refresh_token: Optional[str] = None) -> AuthResponse:
    token = create_access_token_for_user(user["id"], user["role"])
    return AuthResponse(
        access_token=token,
        refresh_token=refresh_token,
        user=UserResponse(
            id=user["id"],
            email=user["email"],
            name=user["name"],
            phone=user["phone"],
            role=user["role"],
            gender=user.get("gender"),
            referral_code=str(user.get("referral_code") or "").strip().upper() or None,
            created_at=user["created_at"],
        ),
    )

def build_default_driver_profile(user_id: str) -> Dict[str, Any]:
    return {
        "user_id": user_id,
        "vehicle_info": None,
        "is_available": False,
        "current_location": None,
        "geo_point": None,
        "kyc_status": KYCStatus.PENDING,
        "rating": 5.0,
        "total_rides": 0,
        "fare_multiplier": 1.0,
        "custom_fare_pricing": None,
        "custom_fare_pricing_status": "default",
        "custom_fare_pricing_request": None,
    }

def build_default_driver_settings() -> Dict[str, Any]:
    return {
        "push_notifications": True,
        "email_notifications": True,
        "sms_alerts": True,
        "sound_enabled": True,
        "vibration_enabled": True,
        "quiet_hours_enabled": False,
        "quiet_hours_start": "22:00",
        "quiet_hours_end": "08:00",
        "language": "en",
        "theme": "light",
        "share_location": True,
        "accept_promo": True,
    }

def normalize_driver_settings(raw_settings: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    defaults = build_default_driver_settings()
    source = raw_settings if isinstance(raw_settings, dict) else {}
    next_settings = defaults.copy()

    bool_keys = {
        "push_notifications",
        "email_notifications",
        "sms_alerts",
        "sound_enabled",
        "vibration_enabled",
        "quiet_hours_enabled",
        "share_location",
        "accept_promo",
    }
    for key in bool_keys:
        if key in source:
            next_settings[key] = bool(source.get(key))

    for key in ("quiet_hours_start", "quiet_hours_end"):
        value = str(source.get(key) or "").strip()
        if re.match(TIME_24H_PATTERN, value):
            next_settings[key] = value

    language = normalize_language_code(source.get("language"), default="")
    if language:
        next_settings["language"] = language

    theme = str(source.get("theme") or "").strip().lower()
    if theme in {"light", "dark", "auto"}:
        next_settings["theme"] = theme

    return next_settings

def build_driver_vehicle_response(vehicle: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": str(vehicle.get("id") or ""),
        "driver_id": str(vehicle.get("driver_id") or ""),
        "make": str(vehicle.get("make") or ""),
        "model": str(vehicle.get("model") or ""),
        "year": int(vehicle.get("year") or 0),
        "color": str(vehicle.get("color") or ""),
        "license_plate": str(vehicle.get("license_plate") or ""),
        "registration_number": str(vehicle.get("registration_number") or ""),
        "seating_capacity": int(vehicle.get("seating_capacity") or 4),
        "vehicle_type": str(vehicle.get("vehicle_type") or "auto"),
        "is_active": bool(vehicle.get("is_active", False)),
        "created_at": vehicle.get("created_at"),
        "updated_at": vehicle.get("updated_at"),
    }

def build_driver_vehicle_info(vehicle: Dict[str, Any]) -> Dict[str, Any]:
    make = str(vehicle.get("make") or "").strip()
    model = str(vehicle.get("model") or "").strip()
    vehicle_model = " ".join(part for part in [make, model] if part) or "Auto"
    return {
        "vehicle_number": str(vehicle.get("license_plate") or ""),
        "vehicle_model": vehicle_model,
        "vehicle_color": str(vehicle.get("color") or ""),
    }

async def sync_driver_primary_vehicle(driver_id: str, vehicle: Optional[Dict[str, Any]]) -> None:
    now = get_ist_now()
    if vehicle:
        vehicle_info = build_driver_vehicle_info(vehicle)
        await db.drivers.update_one(
            {"user_id": driver_id},
            {
                "$set": {
                    "vehicle_info": vehicle_info,
                    "auto_number": vehicle_info.get("vehicle_number"),
                    "auto_registration_number": str(vehicle.get("registration_number") or vehicle_info.get("vehicle_number")),
                    "auto_model": vehicle_info.get("vehicle_model"),
                    "auto_color": vehicle_info.get("vehicle_color"),
                    "updated_at": now,
                },
                "$setOnInsert": build_default_driver_profile(driver_id),
            },
            upsert=True,
        )
    else:
        await db.drivers.update_one(
            {"user_id": driver_id},
            {
                "$set": {
                    "vehicle_info": None,
                    "updated_at": now,
                },
                "$unset": {
                    "auto_number": "",
                    "auto_registration_number": "",
                    "auto_model": "",
                    "auto_color": "",
                },
                "$setOnInsert": build_default_driver_profile(driver_id),
            },
            upsert=True,
        )
    await cache_delete(f"driver_profile:{driver_id}")

def mask_bank_account(account_number: str) -> str:
    cleaned = re.sub(r"\D+", "", str(account_number or ""))
    if not cleaned:
        return ""
    return f"{'*' * max(0, len(cleaned) - 4)}{cleaned[-4:]}"

def decrypt_profile_value(value: Any) -> str:
    if not value:
        return ""
    try:
        return decrypt_value(str(value))
    except Exception:
        return ""

def build_driver_profile_response(user: Dict[str, Any], profile: Dict[str, Any]) -> Dict[str, Any]:
    bank_account_masked = str(profile.get("bank_account_masked") or "").strip()
    if not bank_account_masked:
        encrypted_bank_account = profile.get("bank_account_number_encrypted")
        legacy_bank_account = profile.get("bank_account_number")
        bank_account_masked = mask_bank_account(
            decrypt_profile_value(encrypted_bank_account) if encrypted_bank_account else legacy_bank_account
        )
    response = without_mongo_id(profile)
    response.pop("bank_account_number", None)
    response.pop("bank_account_number_encrypted", None)
    response.update(
        {
            "id": user.get("id"),
            "user_id": user.get("id"),
            "name": user.get("name", ""),
            "email": user.get("email", ""),
            "phone": user.get("phone", ""),
            "profile_photo": profile.get("profile_photo"),
            "rating": float(profile.get("rating", 5.0) or 5.0),
            "total_rides": int(profile.get("total_rides", 0) or 0),
            "account_status": user.get("account_status", "active"),
            "two_factor_enabled": bool(user.get("two_factor_enabled", False)),
            "bank_name": profile.get("bank_name", ""),
            "bank_account_holder": profile.get("bank_account_holder", ""),
            "bank_account_number": "",
            "bank_account_masked": bank_account_masked,
            "bank_ifsc_code": profile.get("bank_ifsc_code", ""),
            "bank_verification_status": profile.get("bank_verification_status", "not_submitted"),
            "bank_updated_at": profile.get("bank_updated_at"),
            "emergency_contact_name": profile.get("emergency_contact_name", ""),
            "emergency_contact_phone": profile.get("emergency_contact_phone", ""),
            "emergency_contact_relationship": profile.get("emergency_contact_relationship", ""),
            "emergency_contact_verified": bool(profile.get("emergency_contact_verified", False)),
            "emergency_contact_updated_at": profile.get("emergency_contact_updated_at"),
        }
    )
    return response

def resolve_driver_active_fare_status(driver_profile: Optional[Dict[str, Any]]) -> str:
    profile = driver_profile or {}
    explicit_status = str(profile.get("custom_fare_pricing_status") or "").strip().lower()
    if explicit_status == "pending":
        return "pending"
    if profile.get("custom_fare_pricing"):
        return "approved"
    return "default"

async def get_passenger_blocked_driver_ids(passenger_id: str) -> List[str]:
    rows = await db.passenger_blocked_drivers.find({"passenger_id": passenger_id}).to_list(1000)
    return [str(item.get("driver_id")) for item in rows if item.get("driver_id")]

async def get_drivers_who_blocked_passenger_ids(passenger_id: str) -> List[str]:
    rows = await db.driver_blocked_passengers.find({"passenger_id": passenger_id}).to_list(1000)
    return [str(item.get("driver_id")) for item in rows if item.get("driver_id")]

async def get_driver_blocked_passenger_ids(driver_id: str) -> List[str]:
    rows = await db.driver_blocked_passengers.find({"driver_id": driver_id}).to_list(1000)
    return [str(item.get("passenger_id")) for item in rows if item.get("passenger_id")]

async def get_passengers_who_blocked_driver_ids(driver_id: str) -> List[str]:
    rows = await db.passenger_blocked_drivers.find({"driver_id": driver_id}).to_list(1000)
    return [str(item.get("passenger_id")) for item in rows if item.get("passenger_id")]

async def get_excluded_driver_ids_for_passenger(passenger_id: str) -> List[str]:
    blocked_by_passenger, blocked_driver_side = await asyncio.gather(
        get_passenger_blocked_driver_ids(passenger_id),
        get_drivers_who_blocked_passenger_ids(passenger_id),
    )
    return list(set(blocked_by_passenger + blocked_driver_side))

async def is_driver_passenger_pair_blocked(passenger_id: str, driver_id: str) -> bool:
    if not passenger_id or not driver_id:
        return False
    passenger_side = await db.passenger_blocked_drivers.find_one({"passenger_id": passenger_id, "driver_id": driver_id})
    if passenger_side:
        return True
    driver_side = await db.driver_blocked_passengers.find_one({"driver_id": driver_id, "passenger_id": passenger_id})
    return driver_side is not None

async def create_user_for_social_or_otp(
    *,
    name: str,
    phone: str,
    role: UserRole,
    gender: Optional[Gender] = None,
    email: Optional[str] = None,
) -> Dict[str, Any]:
    user_id = str(uuid.uuid4())
    resolved_email = str(email or f"user{user_id[:8]}@autobuddy.app").lower()
    existing_email = await db.users.find_one({"email": resolved_email})
    if existing_email:
        resolved_email = f"user{user_id[:8]}@autobuddy.app"

    user_dict = {
        "id": user_id,
        "email": resolved_email,
        "name": name.strip() if name else "AutoBuddy User",
        "phone": phone,
        "role": role,
        "gender": gender.value if isinstance(gender, Gender) else (str(gender).strip().lower() if gender else None),
        "password_hash": hash_password(str(uuid.uuid4())),
        "created_at": get_ist_now(),
        "is_verified": True,
    }
    await db.users.insert_one(user_dict)
    if role == UserRole.DRIVER:
        driver_profile = build_default_driver_profile(user_id)
        await db.drivers.update_one({"user_id": user_id}, {"$setOnInsert": driver_profile}, upsert=True)
    referral = await create_referral_if_missing(db, user_dict)
    user_dict["referral_code"] = referral.get("code")
    return user_dict

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if str(user.get("status") or "").strip().lower() == "blocked":
        raise HTTPException(status_code=403, detail="Account blocked")
    role = str(user.get("role") or "").strip().lower()
    if role == "driver":
        if redis_client:
            try:
                if await redis_client.sismember("global_driver_blacklist", user_id):
                    raise HTTPException(status_code=403, detail="Account permanently suspended. Contact support.")
            except HTTPException:
                raise
            except Exception:
                pass
        active_blacklist = await db.driver_blacklist.find_one({"driver_id": user_id, "active": True}, {"_id": 0})
        if active_blacklist:
            raise HTTPException(status_code=403, detail="Account permanently suspended. Contact support.")
    return user


def require_roles(*allowed_roles):
    normalized_roles = {str(role).strip().lower() for role in allowed_roles}

    async def checker(current_user: dict = Depends(get_current_user)):
        if str(current_user.get("role") or "").strip().lower() not in normalized_roles:
            raise HTTPException(status_code=403, detail="You are not allowed to perform this action")
        return current_user

    return checker

def ensure_booking_participant(booking: Dict[str, Any], current_user: Dict[str, Any]):
    if current_user["role"] == UserRole.ADMIN:
        return
    allowed_ids = {booking.get("passenger_id"), booking.get("driver_id")}
    if current_user["id"] not in allowed_ids:
        raise HTTPException(status_code=403, detail="Not authorized for this booking")

def booking_status_allows_live_comm(status_value: Any) -> bool:
    if isinstance(status_value, BookingStatus):
        normalized = status_value.value
    else:
        normalized = str(status_value or "").strip().lower()
        if "." in normalized:
            normalized = normalized.split(".")[-1]
    return normalized in {
        BookingStatus.ACCEPTED.value,
        BookingStatus.DRIVER_ARRIVED.value,
        BookingStatus.IN_PROGRESS.value,
    }

def build_booking_call_room_name(booking_id: str) -> str:
    sanitized = re.sub(r"[^a-zA-Z0-9_-]", "", str(booking_id or ""))
    if not sanitized:
        sanitized = str(uuid.uuid4()).replace("-", "")[:20]
    return f"autobuddy-{sanitized[:48]}"

def calculate_distance(loc1: Location, loc2: Location) -> float:
    """Calculate distance between two points using Haversine formula"""
    R = 6371  # Earth's radius in kilometers
    lat1, lon1 = math.radians(loc1.latitude), math.radians(loc1.longitude)
    lat2, lon2 = math.radians(loc2.latitude), math.radians(loc2.longitude)
    
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    
    return round(R * c, 2)

def normalize_tracking_location(location: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not isinstance(location, dict):
        return None
    latitude = location.get("latitude", location.get("lat"))
    longitude = location.get("longitude", location.get("lng"))
    try:
        lat_num = float(latitude)
        lng_num = float(longitude)
    except (TypeError, ValueError):
        return None
    if not (-90.0 <= lat_num <= 90.0 and -180.0 <= lng_num <= 180.0):
        return None
    return {
        "latitude": round(lat_num, 6),
        "longitude": round(lng_num, 6),
        "address": location.get("address"),
    }

async def cache_driver_live_location(driver_id: str, location: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    normalized = normalize_tracking_location(location)
    if not normalized:
        return None
    await runtime_state.cache_driver_live_location(str(driver_id), normalized, get_ist_now())
    return normalized

async def get_cached_driver_live_location(
    driver_id: Optional[str],
    *,
    max_age_seconds: Optional[int] = None,
) -> Optional[Dict[str, Any]]:
    if not driver_id:
        return None
    raw = await runtime_state.get_driver_live_location(
        str(driver_id),
        max_age_seconds=max_age_seconds,
    )
    return normalize_tracking_location(raw)

async def get_effective_driver_location(driver_profile: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not isinstance(driver_profile, dict):
        return None
    driver_id = str(driver_profile.get("user_id") or "").strip()
    return await get_cached_driver_live_location(driver_id)


async def cache_get(key: str):
    if not redis_client:
        return None
    try:
        value = await redis_client.get(key)
        return json.loads(value) if value else None
    except Exception:
        return None


async def cache_set(key: str, value: Any, ttl_seconds: int = 60):
    if not redis_client:
        return
    try:
        await redis_client.setex(
            key,
            max(1, int(ttl_seconds)),
            json.dumps(value, default=str),
        )
    except Exception:
        pass


async def cache_delete(key: str):
    if not redis_client:
        return
    try:
        await redis_client.delete(key)
    except Exception:
        pass


async def cache_delete_pattern(pattern: str):
    if not redis_client:
        return
    try:
        async for key in redis_client.scan_iter(match=pattern):
            await redis_client.delete(key)
    except Exception:
        pass


async def clear_driver_pending_request_cache(driver_ids: Optional[List[str]]) -> None:
    for driver_id in list(set(driver_ids or [])):
        if driver_id:
            await cache_delete(f"driver_pending_requests:{driver_id}")


async def clear_active_ride_cache(driver_id: Optional[str], passenger_id: Optional[str]) -> None:
    if driver_id:
        await cache_delete(f"active_ride:driver:{driver_id}")
    if passenger_id:
        await cache_delete(f"active_ride:passenger:{passenger_id}")


RIDE_QUEUE_KEY = "queue:rides:pending"
RIDE_QUEUE_PAYLOAD_PREFIX = "queue:rides:payload:"
DRIVER_GEO_KEY = "geo:drivers:live"
ANALYTICS_QUEUE_KEY = "queue:analytics:events"
RIDE_QUEUE_RETRY_BASE_SECONDS = max(3, int(os.environ.get("RIDE_QUEUE_RETRY_BASE_SECONDS", "8")))
RIDE_QUEUE_MAX_ATTEMPTS = max(1, int(os.environ.get("RIDE_QUEUE_MAX_ATTEMPTS", "8")))
ANALYTICS_WORKER_SLEEP_SECONDS = max(1, int(os.environ.get("ANALYTICS_WORKER_SLEEP_SECONDS", "2")))
ANALYTICS_QUEUE_BATCH_SIZE = max(1, int(os.environ.get("ANALYTICS_QUEUE_BATCH_SIZE", "50")))


def _ride_queue_payload_key(booking_id: str) -> str:
    return f"{RIDE_QUEUE_PAYLOAD_PREFIX}{str(booking_id or '').strip()}"


async def upsert_driver_geo_index(driver_id: str, latitude: float, longitude: float) -> None:
    if not redis_client:
        return
    try:
        await redis_client.geoadd(DRIVER_GEO_KEY, [float(longitude), float(latitude), str(driver_id)])
    except Exception:
        logger.exception("upsert_driver_geo_index failed for driver_id=%s", driver_id)


async def remove_driver_geo_index(driver_id: str) -> None:
    if not redis_client:
        return
    try:
        await redis_client.zrem(DRIVER_GEO_KEY, str(driver_id))
    except Exception:
        logger.exception("remove_driver_geo_index failed for driver_id=%s", driver_id)


async def find_nearest_drivers_redis_geo(
    pickup_location: Dict[str, Any],
    limit: int = 5,
    max_distance_km: float = 8.0,
) -> List[Dict[str, Any]]:
    if not redis_client:
        return []
    latitude = safe_float((pickup_location or {}).get("latitude"), None)
    longitude = safe_float((pickup_location or {}).get("longitude"), None)
    if latitude is None or longitude is None:
        return []
    if latitude < -90 or latitude > 90 or longitude < -180 or longitude > 180:
        return []

    try:
        rows = await redis_client.georadius(
            DRIVER_GEO_KEY,
            float(longitude),
            float(latitude),
            max(0.5, float(max_distance_km)),
            unit="km",
            withdist=True,
            sort="ASC",
            count=max(1, int(limit)),
        )
    except Exception:
        logger.exception("find_nearest_drivers_redis_geo failed")
        return []

    candidates: List[Dict[str, Any]] = []
    for raw in rows or []:
        try:
            driver_id, distance_km = raw
            normalized_driver_id = str(driver_id or "").strip()
            if not normalized_driver_id:
                continue
            candidates.append(
                {
                    "user_id": normalized_driver_id,
                    "distance_km": max(0.0, safe_float(distance_km, 9999.0)),
                }
            )
        except Exception:
            continue
    return candidates


async def prime_driver_geo_index() -> None:
    if not redis_client:
        return
    try:
        drivers = await db.drivers.find(
            {
                "is_online": True,
                "is_available": True,
                "current_location.latitude": {"$ne": None},
                "current_location.longitude": {"$ne": None},
            },
            {"_id": 0, "user_id": 1, "current_location": 1},
        ).to_list(5000)
        if not drivers:
            return
        pipe = redis_client.pipeline()
        for item in drivers:
            driver_id = str(item.get("user_id") or "").strip()
            location = normalize_tracking_location(item.get("current_location"))
            if not driver_id or not location:
                continue
            pipe.geoadd(
                DRIVER_GEO_KEY,
                [float(location["longitude"]), float(location["latitude"]), driver_id],
            )
        await pipe.execute()
    except Exception:
        logger.exception("prime_driver_geo_index failed")


async def enqueue_ride(booking_id: str, priority: int = 100):
    if not redis_client or not booking_id:
        return
    normalized_booking_id = str(booking_id).strip()
    score = int(get_ist_now().timestamp()) + int(priority)
    try:
        payload_key = _ride_queue_payload_key(normalized_booking_id)
        existing_attempts = safe_float(await redis_client.hget(payload_key, "attempts"), 0.0)
        payload = {
            "booking_id": normalized_booking_id,
            "attempts": int(existing_attempts),
            "last_enqueued_at": get_ist_now().isoformat(),
            "priority": int(priority),
        }
        pipe = redis_client.pipeline()
        pipe.hset(payload_key, mapping=payload)
        pipe.expire(payload_key, 60 * 60 * 2)
        pipe.zadd(RIDE_QUEUE_KEY, {normalized_booking_id: score})
        await pipe.execute()
    except Exception:
        logger.exception("enqueue_ride failed for booking_id=%s", normalized_booking_id)


async def dequeue_next_ride() -> Optional[str]:
    if not redis_client:
        return None
    try:
        item = await redis_client.zpopmin(RIDE_QUEUE_KEY, 1)
        if not item:
            return None
        booking_id, _ = item[0]
        return str(booking_id)
    except Exception:
        logger.exception("dequeue_next_ride failed")
        return None


async def remove_ride_from_queue(booking_id: str):
    if not redis_client or not booking_id:
        return
    try:
        normalized_booking_id = str(booking_id).strip()
        pipe = redis_client.pipeline()
        pipe.zrem(RIDE_QUEUE_KEY, normalized_booking_id)
        pipe.delete(_ride_queue_payload_key(normalized_booking_id))
        await pipe.execute()
    except Exception:
        logger.exception("remove_ride_from_queue failed for booking_id=%s", booking_id)


async def get_ride_queue_attempts(booking_id: str) -> int:
    if not redis_client or not booking_id:
        return 0
    try:
        payload = await redis_client.hgetall(_ride_queue_payload_key(str(booking_id).strip()))
    except Exception:
        return 0
    return int(safe_float((payload or {}).get("attempts"), 0.0))


async def increment_ride_queue_attempts(booking_id: str) -> int:
    if not redis_client or not booking_id:
        return 0
    try:
        attempts = await redis_client.hincrby(_ride_queue_payload_key(str(booking_id).strip()), "attempts", 1)
        await redis_client.expire(_ride_queue_payload_key(str(booking_id).strip()), 60 * 60 * 2)
        return int(safe_float(attempts, 0.0))
    except Exception:
        return 0


async def queue_analytics_event(event: Dict[str, Any]) -> bool:
    if not redis_client:
        return False
    try:
        await redis_client.rpush(ANALYTICS_QUEUE_KEY, json.dumps(event, default=str))
        return True
    except Exception:
        logger.exception("queue_analytics_event failed")
        return False


async def persist_analytics_event(event: Dict[str, Any]) -> None:
    await db.analytics_events.insert_one(event)
    await analytics_db.ride_events.insert_one(event)


async def write_analytics_event(event_type: str, user_id: Optional[str], payload: Dict[str, Any]):
    event = {
        "id": str(uuid.uuid4()),
        "event_type": str(event_type),
        "user_id": user_id,
        "payload": payload or {},
        "created_at": get_ist_now(),
        "event_date": get_ist_now().strftime("%Y-%m-%d"),
    }
    try:
        queued = await queue_analytics_event(event)
        if not queued:
            await persist_analytics_event(event)
    except Exception:
        logger.exception("write_analytics_event failed for event_type=%s", event_type)


async def find_nearest_drivers_mongo_geo(
    pickup_location: Dict[str, Any],
    limit: int = 5,
    max_distance_km: float = 8.0,
) -> List[Dict[str, Any]]:
    redis_candidates = await find_nearest_drivers_redis_geo(
        pickup_location,
        limit=max(1, int(limit) * 4),
        max_distance_km=max_distance_km,
    )
    if redis_candidates:
        candidate_ids = [str(item.get("user_id") or "").strip() for item in redis_candidates if item.get("user_id")]
        if candidate_ids:
            profiles = await db.drivers.find(
                {
                    "user_id": {"$in": list(set(candidate_ids))},
                    "is_online": True,
                    "is_available": True,
                    "kyc_status": KYCStatus.APPROVED,
                },
                {"_id": 0, "user_id": 1, "name": 1, "rating": 1, "current_location": 1},
            ).to_list(max(1, len(candidate_ids)))
            profile_map = {str(item.get("user_id") or "").strip(): item for item in profiles}
            ordered: List[Dict[str, Any]] = []
            for candidate in redis_candidates:
                driver_id = str(candidate.get("user_id") or "").strip()
                profile = profile_map.get(driver_id)
                if not profile:
                    continue
                ordered.append(
                    {
                        "user_id": driver_id,
                        "name": profile.get("name"),
                        "rating": profile.get("rating"),
                        "current_location": profile.get("current_location"),
                        "distance_km": safe_float(candidate.get("distance_km"), 9999.0),
                    }
                )
                if len(ordered) >= max(1, int(limit)):
                    break
            if ordered:
                return ordered

    latitude = safe_float((pickup_location or {}).get("latitude"), None)
    longitude = safe_float((pickup_location or {}).get("longitude"), None)
    if latitude is None or longitude is None:
        return []
    if latitude < -90 or latitude > 90 or longitude < -180 or longitude > 180:
        return []

    pickup_geo = {
        "type": "Point",
        "coordinates": [float(longitude), float(latitude)],
    }
    pipeline = [
        {
            "$geoNear": {
                "near": pickup_geo,
                "distanceField": "distance_meters",
                "spherical": True,
                "maxDistance": max(1000, int(float(max_distance_km) * 1000)),
                "query": {
                    "is_online": True,
                    "is_available": True,
                    "kyc_status": KYCStatus.APPROVED,
                },
            }
        },
        {"$limit": max(1, int(limit))},
        {
            "$project": {
                "_id": 0,
                "user_id": 1,
                "name": 1,
                "rating": 1,
                "current_location": 1,
                "distance_km": {"$divide": ["$distance_meters", 1000]},
            }
        },
    ]
    try:
        return await db.drivers.aggregate(pipeline).to_list(max(1, int(limit)))
    except Exception:
        logger.exception("find_nearest_drivers_mongo_geo failed")
        return []

def calculate_tracking_segment_km(
    previous_location: Optional[Dict[str, Any]],
    current_location: Optional[Dict[str, Any]],
) -> float:
    prev = normalize_tracking_location(previous_location)
    curr = normalize_tracking_location(current_location)
    if not prev or not curr:
        return 0.0
    try:
        segment = float(calculate_distance(Location(**prev), Location(**curr)))
    except Exception:
        return 0.0
    if not math.isfinite(segment):
        return 0.0
    return max(0.0, segment)

async def get_pricing_rules() -> PricingRule:
    """Get current pricing rules from DB or return defaults"""
    cached = await cache_get("pricing_rules:active")
    if isinstance(cached, dict) and cached:
        try:
            return PricingRule(**cached)
        except Exception:
            pass

    rules = await db.pricing_rules.find_one({})
    if rules:
        try:
            await cache_set("pricing_rules:active", rules, ttl_seconds=300)
        except Exception:
            pass
        return PricingRule(**rules)
    # Return default pricing
    return PricingRule()

def is_scheme_currently_active(
    start_at: Optional[datetime],
    end_at: Optional[datetime],
    *,
    now: Optional[datetime] = None,
) -> bool:
    now_utc = as_utc_naive(now or get_ist_now())
    start_utc = as_utc_naive(start_at) if start_at else None
    end_utc = as_utc_naive(end_at) if end_at else None
    if start_utc and now_utc < start_utc:
        return False
    if end_utc and now_utc > end_utc:
        return False
    return True

def has_paid_subscription_plan_for_current_period(role_config: RoleSubscriptionConfig) -> bool:
    now_utc = get_ist_now()
    plans = [role_config.monthly, role_config.quarterly, role_config.annually, role_config.per_trip]
    for plan in plans:
        if not bool(getattr(plan, "active", False)):
            continue
        amount = round(float(getattr(plan, "amount", 0.0) or 0.0), 2)
        if amount <= 0:
            continue
        if not is_scheme_currently_active(
            getattr(plan, "scheme_start_at", None),
            getattr(plan, "scheme_end_at", None),
            now=now_utc,
        ):
            continue
        return True
    return False

def build_effective_role_subscription_config(role_config: RoleSubscriptionConfig) -> RoleSubscriptionConfig:
    now_utc = get_ist_now()

    def normalize_plan(plan: Any) -> Dict[str, Any]:
        raw_amount = round(float(getattr(plan, "amount", 0.0) or 0.0), 2)
        in_window = is_scheme_currently_active(
            getattr(plan, "scheme_start_at", None),
            getattr(plan, "scheme_end_at", None),
            now=now_utc,
        )
        is_effective = bool(getattr(plan, "active", False)) and raw_amount > 0 and in_window
        payload = {
            "amount": raw_amount if in_window else 0.0,
            "active": bool(is_effective),
            "scheme_start_at": getattr(plan, "scheme_start_at", None),
            "scheme_end_at": getattr(plan, "scheme_end_at", None),
        }
        if hasattr(plan, "ride_threshold"):
            payload["ride_threshold"] = int(getattr(plan, "ride_threshold", 10) or 10)
        return payload

    return RoleSubscriptionConfig(
        monthly=SubscriptionPeriodPlan(**normalize_plan(role_config.monthly)),
        quarterly=SubscriptionPeriodPlan(**normalize_plan(role_config.quarterly)),
        annually=SubscriptionPeriodPlan(**normalize_plan(role_config.annually)),
        per_trip=PerTripSubscriptionPlan(**normalize_plan(role_config.per_trip)),
    )

async def get_registration_fee_settings(*, apply_current_window: bool = True) -> RegistrationFeeSettings:
    settings = RegistrationFeeSettings()
    try:
        rules = await db.pricing_rules.find_one({})
    except Exception as exc:
        logger.warning("Could not load registration fee settings from DB; using defaults: %s", exc)
        return settings

    if rules:
        def _to_float(value: Any, default: float = 0.0) -> float:
            try:
                parsed = float(value or default)
            except (TypeError, ValueError):
                return default
            return parsed if parsed >= 0 else default

        def _to_datetime(value: Any) -> Optional[datetime]:
            if isinstance(value, datetime):
                return value
            if isinstance(value, str):
                raw = value.strip()
                if not raw:
                    return None
                raw = raw.replace("Z", "+00:00")
                try:
                    parsed = datetime.fromisoformat(raw)
                except ValueError:
                    return None
                if parsed.tzinfo is not None:
                    return parsed.astimezone(timezone.utc).replace(tzinfo=None)
                return parsed
            return None

        payload = {
            "passenger_registration_fee": _to_float(rules.get("passenger_registration_fee", 0.0)),
            "driver_registration_fee": _to_float(rules.get("driver_registration_fee", 0.0)),
            "scheme_start_at": _to_datetime(rules.get("registration_fee_scheme_start_at")),
            "scheme_end_at": _to_datetime(rules.get("registration_fee_scheme_end_at")),
            "enable_qr": bool(rules.get("enable_qr", False)),
            "enable_upi": bool(rules.get("enable_upi", False) or rules.get("registration_upi_id")),
            "enable_razorpay": bool(rules.get("enable_razorpay", False)),
            "registration_qr_code_url": rules.get("registration_qr_code_url"),
            "registration_upi_id": rules.get("registration_upi_id"),
            "razorpay_payment_link": rules.get("razorpay_payment_link"),
        }
        try:
            settings = RegistrationFeeSettings(**payload)
        except Exception as exc:
            logger.warning("Invalid registration fee settings in DB; using defaults: %s", exc)
            settings = RegistrationFeeSettings(
                enable_qr=payload["enable_qr"],
                enable_upi=payload["enable_upi"],
                enable_razorpay=payload["enable_razorpay"],
                registration_qr_code_url=payload["registration_qr_code_url"],
                registration_upi_id=payload["registration_upi_id"],
                razorpay_payment_link=payload["razorpay_payment_link"],
            )
    if not apply_current_window:
        return settings

    if not is_scheme_currently_active(settings.scheme_start_at, settings.scheme_end_at):
        return RegistrationFeeSettings(
            passenger_registration_fee=0.0,
            driver_registration_fee=0.0,
            scheme_start_at=settings.scheme_start_at,
            scheme_end_at=settings.scheme_end_at,
            enable_qr=settings.enable_qr,
            enable_upi=settings.enable_upi or bool(settings.registration_upi_id),
            enable_razorpay=settings.enable_razorpay,
            registration_qr_code_url=settings.registration_qr_code_url,
            registration_upi_id=settings.registration_upi_id,
            razorpay_payment_link=settings.razorpay_payment_link,
        )
    return settings

def get_registration_fee_for_role(settings: RegistrationFeeSettings, role: UserRole) -> float:
    if role == UserRole.DRIVER:
        return float(settings.driver_registration_fee)
    return float(settings.passenger_registration_fee)

def validate_registration_payment_details(
    *,
    settings: RegistrationFeeSettings,
    required_fee: float,
    registration_fee_ack: bool,
    payment_method: Optional[str],
    payment_utr: Optional[str],
):
    if required_fee <= 0:
        return

    enabled_methods: List[str] = []
    if settings.enable_qr:
        enabled_methods.append("qr")
    if settings.enable_upi or bool(settings.registration_upi_id):
        enabled_methods.append("upi")
    if settings.enable_razorpay:
        enabled_methods.append("razorpay")

    if not enabled_methods:
        raise HTTPException(status_code=400, detail="Registration payment options are not configured by admin")
    if not payment_method:
        raise HTTPException(status_code=400, detail="Select a registration payment method")
    if payment_method not in enabled_methods:
        raise HTTPException(status_code=400, detail="Selected registration payment method is unavailable")
    if payment_method in {"qr", "upi"} and not str(payment_utr or "").strip():
        raise HTTPException(status_code=400, detail="Enter UTR for QR/UPI registration payment")
    if not registration_fee_ack:
        raise HTTPException(status_code=400, detail=f"Registration fee of Rs {required_fee:.2f} is required")

async def get_subscription_config() -> SubscriptionConfig:
    rules = await db.pricing_rules.find_one({})
    raw_config = rules.get("subscription_config") if rules else None
    if isinstance(raw_config, dict):
        payload = dict(raw_config)
        payload.setdefault("updated_at", rules.get("updated_at") or get_ist_now())
        return SubscriptionConfig(**payload)
    return SubscriptionConfig()

def get_role_subscription_config(config: SubscriptionConfig, role: UserRole) -> RoleSubscriptionConfig:
    if role == UserRole.DRIVER:
        return config.driver
    return config.passenger

def get_default_user_subscription(role: UserRole) -> Dict[str, Any]:
    role_value = role.value if isinstance(role, Enum) else str(role)
    return {
        "role": role_value,
        "plan_type": None,
        "is_active": False,
        "activated_by_admin": False,
        "selected_at": None,
        "activated_at": None,
        "activated_by": None,
        "period_started_at": None,
        "period_expires_at": None,
        "per_trip_completed_rides": 0,
        "per_trip_charged_cycles": 0,
        "outstanding_amount": 0.0,
        "total_due_generated": 0.0,
        "last_charged_at": None,
        "last_paid_at": None,
        "activation_note": None,
    }

def get_user_subscription(user: Dict[str, Any]) -> Dict[str, Any]:
    role = user.get("role", UserRole.PASSENGER)
    defaults = get_default_user_subscription(role)
    raw = user.get("subscription")
    if isinstance(raw, dict):
        defaults.update(raw)
    defaults["outstanding_amount"] = round(float(defaults.get("outstanding_amount", 0.0) or 0.0), 2)
    defaults["total_due_generated"] = round(float(defaults.get("total_due_generated", 0.0) or 0.0), 2)
    defaults["per_trip_completed_rides"] = int(defaults.get("per_trip_completed_rides", 0) or 0)
    defaults["per_trip_charged_cycles"] = int(defaults.get("per_trip_charged_cycles", 0) or 0)
    return defaults

def parse_subscription_plan_type(value: Any) -> Optional[SubscriptionPlanType]:
    if value is None:
        return None
    try:
        return SubscriptionPlanType(str(value))
    except ValueError:
        return None

def is_subscription_plan_active(role_config: RoleSubscriptionConfig, plan_type: SubscriptionPlanType) -> bool:
    if plan_type == SubscriptionPlanType.MONTHLY:
        plan = role_config.monthly
    elif plan_type == SubscriptionPlanType.QUARTERLY:
        plan = role_config.quarterly
    elif plan_type == SubscriptionPlanType.ANNUALLY:
        plan = role_config.annually
    else:
        plan = role_config.per_trip
    amount = round(float(getattr(plan, "amount", 0.0) or 0.0), 2)
    in_window = is_scheme_currently_active(
        getattr(plan, "scheme_start_at", None),
        getattr(plan, "scheme_end_at", None),
    )
    return bool(getattr(plan, "active", False)) and amount > 0 and in_window

def get_subscription_plan_amount(role_config: RoleSubscriptionConfig, plan_type: SubscriptionPlanType) -> float:
    if plan_type == SubscriptionPlanType.MONTHLY:
        plan = role_config.monthly
    elif plan_type == SubscriptionPlanType.QUARTERLY:
        plan = role_config.quarterly
    elif plan_type == SubscriptionPlanType.ANNUALLY:
        plan = role_config.annually
    else:
        plan = role_config.per_trip
    if not is_scheme_currently_active(getattr(plan, "scheme_start_at", None), getattr(plan, "scheme_end_at", None)):
        return 0.0
    return round(float(getattr(plan, "amount", 0.0) or 0.0), 2)

def get_subscription_period_expiry(plan_type: SubscriptionPlanType, start_at: datetime) -> Optional[datetime]:
    if plan_type == SubscriptionPlanType.MONTHLY:
        return start_at + timedelta(days=30)
    if plan_type == SubscriptionPlanType.QUARTERLY:
        return start_at + timedelta(days=90)
    if plan_type == SubscriptionPlanType.ANNUALLY:
        return start_at + timedelta(days=365)
    return None

PER_TRIP_BLOCK_GRACE_RIDES = 2

def get_per_trip_due_gate(subscription: Dict[str, Any], role_config: RoleSubscriptionConfig) -> Dict[str, Any]:
    completed_rides = int(subscription.get("per_trip_completed_rides", 0) or 0)
    charged_cycles = int(subscription.get("per_trip_charged_cycles", 0) or 0)
    outstanding_amount = round(float(subscription.get("outstanding_amount", 0.0) or 0.0), 2)
    ride_threshold = max(1, int(role_config.per_trip.ride_threshold or 10))
    block_after_completed_rides = (charged_cycles * ride_threshold) + PER_TRIP_BLOCK_GRACE_RIDES
    rides_remaining_before_block = max(0, block_after_completed_rides - completed_rides)
    blocked = outstanding_amount > 0 and completed_rides >= block_after_completed_rides
    return {
        "outstanding_amount": outstanding_amount,
        "ride_threshold": ride_threshold,
        "charged_cycles": charged_cycles,
        "completed_rides": completed_rides,
        "block_after_completed_rides": block_after_completed_rides,
        "rides_remaining_before_block": rides_remaining_before_block,
        "blocked": blocked,
    }

async def ensure_user_can_take_ride_actions(user: Dict[str, Any], action_label: str):
    if user.get("role") == UserRole.ADMIN:
        return

    config = await get_subscription_config()
    role = user.get("role", UserRole.PASSENGER)
    role_config = get_role_subscription_config(config, role)
    if not has_paid_subscription_plan_for_current_period(role_config):
        return

    subscription = get_user_subscription(user)
    selected_plan = parse_subscription_plan_type(subscription.get("plan_type"))

    if not selected_plan:
        raise HTTPException(
            status_code=403,
            detail=f"Select a subscription plan and wait for admin activation before {action_label}.",
        )
    if not subscription.get("is_active") or not subscription.get("activated_by_admin"):
        raise HTTPException(status_code=403, detail="Your subscription is pending admin activation.")
    if not is_subscription_plan_active(role_config, selected_plan):
        raise HTTPException(status_code=403, detail="Your selected subscription plan is currently disabled by admin.")

    if selected_plan in {
        SubscriptionPlanType.MONTHLY,
        SubscriptionPlanType.QUARTERLY,
        SubscriptionPlanType.ANNUALLY,
    }:
        expires_at = as_utc_naive(subscription.get("period_expires_at"))
        now_utc = get_ist_now()
        if not expires_at or expires_at < now_utc:
            raise HTTPException(status_code=403, detail="Your subscription plan is expired. Please renew.")

    if selected_plan == SubscriptionPlanType.PER_TRIP:
        per_trip_gate = get_per_trip_due_gate(subscription, role_config)
        if per_trip_gate["blocked"]:
            raise HTTPException(
                status_code=402,
                detail=(
                    f"Per-trip subscription due of Rs {per_trip_gate['outstanding_amount']:.2f} is pending. "
                    f"After {per_trip_gate['ride_threshold']} rides, max {PER_TRIP_BLOCK_GRACE_RIDES} extra rides are allowed. "
                    "Submit payment and wait for admin verification to continue."
                ),
            )
    else:
        outstanding_amount = float(subscription.get("outstanding_amount", 0.0) or 0.0)
        if outstanding_amount > 0:
            raise HTTPException(
                status_code=402,
                detail=f"Subscription due of Rs {outstanding_amount:.2f} is pending. Please pay to continue.",
            )

async def apply_per_trip_subscription_charge(
    *,
    user_id: str,
    role: UserRole,
    booking_id: str,
    completed_at: datetime,
):
    user = await db.users.find_one({"id": user_id})
    if not user:
        return

    subscription = get_user_subscription(user)
    selected_plan = parse_subscription_plan_type(subscription.get("plan_type"))
    if selected_plan != SubscriptionPlanType.PER_TRIP:
        return
    if not subscription.get("is_active") or not subscription.get("activated_by_admin"):
        return

    config = await get_subscription_config()
    role_config = get_role_subscription_config(config, role)
    if not is_subscription_plan_active(role_config, SubscriptionPlanType.PER_TRIP):
        return

    ride_threshold = max(1, int(role_config.per_trip.ride_threshold or 10))
    plan_amount = round(float(role_config.per_trip.amount or 0.0), 2)

    completed_rides = int(subscription.get("per_trip_completed_rides", 0) or 0) + 1
    charged_cycles = int(subscription.get("per_trip_charged_cycles", 0) or 0)
    reached_cycles = completed_rides // ride_threshold
    new_cycles = max(0, reached_cycles - charged_cycles)
    outstanding_increment = round(new_cycles * plan_amount, 2)
    current_outstanding = round(float(subscription.get("outstanding_amount", 0.0) or 0.0), 2)
    projected_outstanding = round(current_outstanding + outstanding_increment, 2)

    set_fields = {
        "subscription.per_trip_completed_rides": completed_rides,
        "subscription.per_trip_charged_cycles": charged_cycles + new_cycles,
        "subscription.last_charged_at": completed_at if new_cycles > 0 else subscription.get("last_charged_at"),
    }
    if new_cycles > 0 and outstanding_increment > 0:
        set_fields["subscription.updated_due_at"] = completed_at

    update_doc: Dict[str, Any] = {"$set": set_fields}
    if new_cycles > 0 and outstanding_increment > 0:
        update_doc["$inc"] = {
            "subscription.outstanding_amount": outstanding_increment,
            "subscription.total_due_generated": outstanding_increment,
        }

    await db.users.update_one({"id": user_id}, update_doc)

    if new_cycles > 0 and outstanding_increment > 0:
        due_docs: List[Dict[str, Any]] = []
        for cycle_number in range(charged_cycles + 1, charged_cycles + new_cycles + 1):
            due_docs.append(
                {
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "role": role.value if isinstance(role, Enum) else str(role),
                    "booking_id": booking_id,
                    "cycle_number": cycle_number,
                    "plan_type": SubscriptionPlanType.PER_TRIP.value,
                    "threshold": ride_threshold,
                    "amount": plan_amount,
                    "status": "due",
                    "created_at": completed_at,
                    "updated_at": completed_at,
                }
            )
        if due_docs:
            await db.subscription_dues.insert_many(due_docs)

    if role == UserRole.DRIVER:
        projected_subscription = {
            **subscription,
            "per_trip_completed_rides": completed_rides,
            "per_trip_charged_cycles": charged_cycles + new_cycles,
            "outstanding_amount": projected_outstanding,
        }
        gate = get_per_trip_due_gate(projected_subscription, role_config)
        if gate["blocked"]:
            await db.drivers.update_one(
                {"user_id": user_id},
                {"$set": {"is_available": False, "is_online": False, "updated_at": completed_at}},
            )

def serialize_subscription_for_response(user: Dict[str, Any], config: SubscriptionConfig) -> Dict[str, Any]:
    subscription = get_user_subscription(user)
    role = user.get("role", UserRole.PASSENGER)
    role_config = get_role_subscription_config(config, role)
    selected_plan = parse_subscription_plan_type(subscription.get("plan_type"))
    plan_amount = get_subscription_plan_amount(role_config, selected_plan) if selected_plan else 0.0
    per_trip_gate = (
        get_per_trip_due_gate(subscription, role_config)
        if selected_plan == SubscriptionPlanType.PER_TRIP
        else None
    )
    return {
        "role": role.value if isinstance(role, Enum) else str(role),
        "plan_type": selected_plan.value if selected_plan else None,
        "is_active": bool(subscription.get("is_active", False)),
        "activated_by_admin": bool(subscription.get("activated_by_admin", False)),
        "selected_at": subscription.get("selected_at"),
        "activated_at": subscription.get("activated_at"),
        "period_started_at": subscription.get("period_started_at"),
        "period_expires_at": subscription.get("period_expires_at"),
        "per_trip_completed_rides": int(subscription.get("per_trip_completed_rides", 0) or 0),
        "per_trip_charged_cycles": int(subscription.get("per_trip_charged_cycles", 0) or 0),
        "outstanding_amount": round(float(subscription.get("outstanding_amount", 0.0) or 0.0), 2),
        "total_due_generated": round(float(subscription.get("total_due_generated", 0.0) or 0.0), 2),
        "last_charged_at": subscription.get("last_charged_at"),
        "last_paid_at": subscription.get("last_paid_at"),
        "last_payment_submission_at": subscription.get("last_payment_submission_at"),
        "last_payment_status": subscription.get("last_payment_status"),
        "last_payment_reject_reason": subscription.get("last_payment_reject_reason"),
        "activation_note": subscription.get("activation_note"),
        "current_plan_amount": plan_amount,
        "current_plan_active_in_admin_config": bool(is_subscription_plan_active(role_config, selected_plan)) if selected_plan else False,
        "per_trip_threshold": int(role_config.per_trip.ride_threshold),
        "per_trip_grace_rides": PER_TRIP_BLOCK_GRACE_RIDES,
        "per_trip_block_after_completed_rides": (
            per_trip_gate.get("block_after_completed_rides")
            if per_trip_gate
            else None
        ),
        "per_trip_rides_remaining_before_block": (
            per_trip_gate.get("rides_remaining_before_block")
            if per_trip_gate
            else None
        ),
        "per_trip_blocked_due_to_unpaid": bool(per_trip_gate.get("blocked")) if per_trip_gate else False,
    }

def build_subscription_attention_summary(user: Dict[str, Any], config: SubscriptionConfig) -> Dict[str, Any]:
    role = user.get("role", UserRole.PASSENGER)
    role_config = get_role_subscription_config(config, role)
    subscription = serialize_subscription_for_response(user, config)
    paid_plan_required = has_paid_subscription_plan_for_current_period(role_config)
    attention_reasons: List[str] = []

    if paid_plan_required:
        if not subscription.get("plan_type"):
            attention_reasons.append("plan_required")
        elif not subscription.get("activated_by_admin") or not subscription.get("is_active"):
            attention_reasons.append("pending_activation")
        elif not subscription.get("current_plan_active_in_admin_config"):
            attention_reasons.append("plan_disabled")
        elif subscription.get("period_expires_at"):
            expires_at = as_utc_naive(subscription.get("period_expires_at"))
            if expires_at and expires_at < get_ist_now():
                attention_reasons.append("expired")

    if float(subscription.get("outstanding_amount", 0.0) or 0.0) > 0:
        attention_reasons.append("dues_pending")
    if subscription.get("per_trip_blocked_due_to_unpaid"):
        attention_reasons.append("per_trip_blocked")
    if str(subscription.get("last_payment_status") or "").lower() == "rejected":
        attention_reasons.append("payment_rejected")
    if str(subscription.get("last_payment_status") or "").lower() == "pending_verification":
        attention_reasons.append("payment_pending_verification")

    unique_reasons = list(dict.fromkeys(attention_reasons))
    return {
        "count": 1 if unique_reasons else 0,
        "paid_plan_required": paid_plan_required,
        "reasons": unique_reasons,
        "plan_type": subscription.get("plan_type"),
        "status": "attention" if unique_reasons else "ok",
        "outstanding_amount": subscription.get("outstanding_amount", 0.0),
        "last_payment_status": subscription.get("last_payment_status"),
    }

def get_time_multiplier() -> float:
    """Get surge multiplier based on current time"""
    current_hour = datetime.now().hour
    # Night hours (11 PM - 5 AM)
    if current_hour >= 23 or current_hour < 5:
        return 1.3
    # Peak hours
    if current_hour in [8, 9, 17, 18, 19]:
        return 1.5
    return 1.0

def as_utc_naive(timestamp: Optional[datetime]) -> Optional[datetime]:
    if not timestamp:
        return None
    if isinstance(timestamp, str):
        try:
            timestamp = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        except ValueError:
            return None
    if timestamp.tzinfo is None:
        return timestamp
    return timestamp.astimezone(timezone.utc).replace(tzinfo=None)

def schedule_is_in_future(scheduled_for: Optional[datetime], now: datetime) -> bool:
    scheduled_at = as_utc_naive(scheduled_for)
    now_at = as_utc_naive(now)
    if not scheduled_at or not now_at:
        return False
    return scheduled_at > (now_at + timedelta(minutes=2))

def generate_fallback_trip_tips(request: TripTipsRequest) -> str:
    """Return deterministic tips using free local logic."""
    tips = [
        f"Trip: {request.pickup_address} to {request.drop_address}.",
        "Share exact pickup landmark in chat/call to reduce waiting time.",
    ]

    if request.payment_method == PaymentMethod.CASH:
        tips.append("Keep small cash change ready for smoother drop-off.")
    else:
        tips.append("Confirm online payment in-app before ride completion.")

    if request.estimated_fare:
        tips.append(f"Estimated fare is about Rs. {round(request.estimated_fare, 2)}.")
    tips.append("During peak traffic, allow 5-10 extra minutes pickup buffer.")
    return " ".join(tips)

async def generate_openai_text(
    *,
    instructions: str,
    prompt: str,
    max_output_tokens: int = 260,
    temperature: float = 0.3,
) -> Optional[str]:
    if not OPENAI_API_KEY:
        return None

    payload = {
        "model": OPENAI_MODEL,
        "instructions": instructions,
        "input": prompt,
        "max_output_tokens": max_output_tokens,
        "temperature": temperature,
    }
    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

    url = f"{OPENAI_BASE_URL.rstrip('/')}/responses"
    try:
        timeout = httpx.Timeout(12.0, connect=3.0)
        async with httpx.AsyncClient(timeout=timeout) as client_http:
            response = await client_http.post(url, headers=headers, json=payload)
        if response.status_code >= 300:
            logger.warning(f"OpenAI response failed: status={response.status_code}, body={response.text[:200]}")
            return None

        data = response.json()
        output_text = data.get("output_text")
        if isinstance(output_text, str) and output_text.strip():
            return output_text.strip()

        output_items = data.get("output") or []
        for item in output_items:
            if not isinstance(item, dict):
                continue
            for content in item.get("content") or []:
                if isinstance(content, dict) and content.get("type") == "output_text":
                    text = content.get("text")
                    if isinstance(text, str) and text.strip():
                        return text.strip()
    except Exception as exc:
        logger.warning(f"OpenAI response fallback used: {exc}")
    return None

def location_to_geo_point(location: Location) -> Dict[str, Any]:
    return {
        "type": "Point",
        "coordinates": [location.longitude, location.latitude]
    }


async def fetch_google_maps_json(
    path: str,
    params: Dict[str, Any],
    *,
    allow_zero_results: bool = False,
) -> Dict[str, Any]:
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Google Places is not configured on server. Set GOOGLE_MAPS_API_KEY.",
        )

    query_params = {**params, "key": GOOGLE_MAPS_API_KEY}
    url = f"https://maps.googleapis.com/maps/api/{path}"
    timeout = httpx.Timeout(8.0, connect=3.0)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client_http:
            response = await client_http.get(url, params=query_params)
    except Exception as exc:
        logger.warning(f"Google Maps request failed: {exc}")
        raise HTTPException(status_code=502, detail="Google Maps request failed.") from exc

    if response.status_code >= 300:
        raise HTTPException(status_code=502, detail="Google Maps request failed.")

    payload = response.json()
    status_text = payload.get("status")
    if status_text == "OK" or (allow_zero_results and status_text == "ZERO_RESULTS"):
        return payload

    message = payload.get("error_message") or f"Google Maps request failed ({status_text or 'unknown'})."
    raise HTTPException(status_code=400, detail=message)


async def get_route_metrics(pickup: Location, drop: Location) -> Dict[str, Any]:
    """Prefer free OSRM route distance, duration, and polyline geometry, fallback to local approximation."""
    coord = f"{pickup.longitude},{pickup.latitude};{drop.longitude},{drop.latitude}"
    url = f"{OSRM_BASE_URL.rstrip('/')}/route/v1/driving/{coord}?overview=full&geometries=geojson&alternatives=false&steps=false"

    try:
        timeout = httpx.Timeout(4.0, connect=2.0)
        async with httpx.AsyncClient(timeout=timeout) as client_http:
            response = await client_http.get(url)
            if response.status_code == 200:
                data = response.json()
                routes = data.get("routes") or []
                if data.get("code") == "Ok" and routes:
                    route = routes[0]
                    distance_km = round(float(route.get("distance", 0)) / 1000.0, 2)
                    duration_minutes = max(1, int(round(float(route.get("duration", 0)) / 60.0)))
                    geometry = route.get("geometry") or {}
                    coords = geometry.get("coordinates") if isinstance(geometry, dict) else None
                    route_polyline = None
                    if coords and isinstance(coords, list):
                        route_polyline = [{"latitude": float(lat), "longitude": float(lng)} for lng, lat in coords]
                    return {
                        "distance_km": distance_km,
                        "duration_minutes": duration_minutes,
                        "eta_minutes": duration_minutes,
                        "source": "osrm",
                        "route_polyline": route_polyline,
                    }
    except Exception as exc:
        logger.warning(f"OSRM fallback in use: {exc}")

    fallback_distance = calculate_distance(pickup, drop)
    fallback_duration = max(1, int(round((fallback_distance / max(DEFAULT_CITY_SPEED_KMPH, 1.0)) * 60)))
    return {
        "distance_km": fallback_distance,
        "duration_minutes": fallback_duration,
        "eta_minutes": fallback_duration,
        "source": "haversine_fallback",
        "route_polyline": None,
    }


def build_upi_intent(order_id: str, amount: float) -> str:
    amount_text = f"{amount:.2f}"
    params = [
        f"pa={quote_plus(UPI_PAYEE_VPA)}",
        f"pn={quote_plus(UPI_PAYEE_NAME)}",
        f"tn={quote_plus('AutoBuddy Ride Payment ' + order_id)}",
        f"am={quote_plus(amount_text)}",
        "cu=INR"
    ]
    return "upi://pay?" + "&".join(params)


async def send_fcm_push(push_token: str, title: str, body: str, data: Optional[Dict[str, Any]] = None) -> bool:
    """Send push notification via FCM legacy endpoint when server key is configured."""
    if not FCM_SERVER_KEY:
        return False

    payload = {
        "to": push_token,
        "priority": "high",
        "notification": {
            "title": title,
            "body": body,
        },
        "data": data or {},
    }

    headers = {
        "Authorization": f"key={FCM_SERVER_KEY}",
        "Content-Type": "application/json",
    }

    try:
        timeout = httpx.Timeout(4.5, connect=2.0)
        async with httpx.AsyncClient(timeout=timeout) as client_http:
            response = await client_http.post("https://fcm.googleapis.com/fcm/send", headers=headers, json=payload)
            if response.status_code == 200:
                return True
            logger.warning(f"FCM send failed: status={response.status_code}, body={response.text[:180]}")
    except Exception as exc:
        logger.warning(f"FCM send failed: {exc}")
    return False


PROMOTIONAL_NOTIFICATION_MARKERS = {"promo", "promotion", "marketing", "offer", "campaign"}


def parse_minutes_since_midnight(value: Any) -> Optional[int]:
    match = re.match(r"^(\d{1,2}):(\d{2})$", str(value or "").strip())
    if not match:
        return None
    hours = int(match.group(1))
    minutes = int(match.group(2))
    if hours < 0 or hours > 23 or minutes < 0 or minutes > 59:
        return None
    return hours * 60 + minutes


def is_driver_quiet_hours_active(settings: Dict[str, Any], now: datetime) -> bool:
    if not settings.get("quiet_hours_enabled"):
        return False
    start = parse_minutes_since_midnight(settings.get("quiet_hours_start"))
    end = parse_minutes_since_midnight(settings.get("quiet_hours_end"))
    if start is None or end is None or start == end:
        return False
    current = now.hour * 60 + now.minute
    return start <= current < end if start < end else current >= start or current < end


def is_promotional_notification(data: Optional[Dict[str, Any]]) -> bool:
    if not isinstance(data, dict):
        return False
    values = [
        data.get("type"),
        data.get("category"),
        data.get("campaign_type"),
        data.get("topic"),
        data.get("tag"),
    ]
    haystack = " ".join(str(value or "").lower() for value in values)
    return any(marker in haystack for marker in PROMOTIONAL_NOTIFICATION_MARKERS)


async def get_driver_notification_settings(user_id: str) -> Optional[Dict[str, Any]]:
    user = await db.users.find_one({"id": user_id}, {"role": 1})
    role_value = getattr((user or {}).get("role"), "value", (user or {}).get("role"))
    if role_value != UserRole.DRIVER.value:
        return None
    driver = await db.drivers.find_one({"user_id": user_id}, {"settings": 1})
    return normalize_driver_settings((driver or {}).get("settings"))


async def notify_user(user_id: str, title: str, body: str, data: Optional[Dict[str, Any]] = None):
    """Send in-app realtime notification and optional push notification."""
    now = get_ist_now()
    notification_id = str(uuid.uuid4())
    payload_data = data or {}
    driver_settings = await get_driver_notification_settings(user_id)
    promo_suppressed = bool(
        driver_settings
        and not driver_settings.get("accept_promo", True)
        and is_promotional_notification(payload_data)
    )
    if promo_suppressed:
        return None
    quiet_hours_suppressed = bool(driver_settings and is_driver_quiet_hours_active(driver_settings, now))
    push_enabled = bool(not driver_settings or driver_settings.get("push_notifications", True))
    payload = {
        "id": notification_id,
        "title": title,
        "body": body,
        "data": payload_data,
        "timestamp": now.isoformat(),
    }

    await db.notifications.insert_one(
        {
            "id": notification_id,
            "user_id": user_id,
            "title": title,
            "body": body,
            "data": payload["data"],
            "type": payload["data"].get("type", "notification"),
            "severity": payload["data"].get("severity", "info"),
            "icon": payload["data"].get("icon"),
            "delivery_preferences": {
                "push_enabled": push_enabled,
                "email_enabled": bool(not driver_settings or driver_settings.get("email_notifications", True)),
                "sms_enabled": bool(not driver_settings or driver_settings.get("sms_alerts", True)),
                "quiet_hours_suppressed": quiet_hours_suppressed,
                "promo_suppressed": promo_suppressed,
            },
            "read": False,
            "created_at": now,
        }
    )

    if push_enabled and not quiet_hours_suppressed:
        await emit_to_user(user_id, "in_app_notification", payload)
        await emit_to_user(user_id, "notification", payload)

    token_doc = await db.push_tokens.find_one({"user_id": user_id}) if push_enabled and not quiet_hours_suppressed else None
    if token_doc and token_doc.get("token"):
        await send_fcm_push(token_doc["token"], title=title, body=body, data=payload["data"])


def compute_driver_match_score(driver: Dict[str, Any], pickup: Location) -> Dict[str, float]:
    loc = Location(**driver["current_location"])
    distance = calculate_distance(pickup, loc)
    rating = float(driver.get("rating", 5.0))
    fare_multiplier = float(driver.get("fare_multiplier", 1.0))

    cancellation_rate = float(driver.get("cancellation_rate", 0.05))
    response_rate = float(driver.get("response_rate", 0.9))

    # Better score means better assignment candidate.
    score = (
        (2.2 * (5.0 - min(distance, 8.0)))
        + (2.0 * min(rating, 5.0))
        + (1.3 * max(0.0, response_rate))
        + (0.8 * max(0.0, 1.0 - cancellation_rate))
        + (1.2 * max(0.0, 1.2 - abs(1.0 - fare_multiplier)))
    )

    return {
        "score": round(score, 3),
        "distance_km": distance,
        "fare_multiplier": fare_multiplier,
    }

def get_driver_search_radius_config(pricing: PricingRule) -> Dict[str, float]:
    base_radius = float(pricing.driver_base_search_radius_km or 5.0)
    long_radius = float(pricing.driver_long_distance_search_radius_km or 12.0)
    scheduled_radius = float(getattr(pricing, "scheduled_booking_driver_radius_km", 10.0) or 10.0)
    base_radius = max(0.5, base_radius)
    long_radius = max(base_radius, long_radius)
    scheduled_radius = max(0.5, scheduled_radius)
    return {
        "base_radius_km": round(base_radius, 2),
        "long_radius_km": round(long_radius, 2),
        "scheduled_radius_km": round(scheduled_radius, 2),
    }

DRIVER_FARE_CONFIG_FIELDS = (
    "base_fare",
    "per_km_rate",
    "peak_hours",
    "surge_multiplier",
    "night_multiplier",
    "minimum_fare",
    "driver_base_search_radius_km",
    "driver_long_distance_search_radius_km",
    "driver_pickup_surcharge_per_km",
)

def serialize_driver_fare_config(pricing: PricingRule) -> Dict[str, Any]:
    return {field: getattr(pricing, field) for field in DRIVER_FARE_CONFIG_FIELDS}

def merge_driver_fare_config(base_pricing: PricingRule, override_payload: Optional[Dict[str, Any]]) -> PricingRule:
    if not override_payload:
        return base_pricing
    merged = base_pricing.dict()
    for field in DRIVER_FARE_CONFIG_FIELDS:
        if field in override_payload and override_payload[field] is not None:
            merged[field] = override_payload[field]
    return PricingRule(**merged)

async def get_effective_pricing_for_driver_profile(
    driver_profile: Optional[Dict[str, Any]],
    base_pricing: Optional[PricingRule] = None,
) -> PricingRule:
    pricing = base_pricing or await get_pricing_rules()
    if not driver_profile:
        return pricing
    if resolve_driver_active_fare_status(driver_profile) != "approved":
        return pricing
    custom = driver_profile.get("custom_fare_pricing")
    if not isinstance(custom, dict):
        return pricing
    try:
        return merge_driver_fare_config(pricing, custom)
    except Exception:
        return pricing

def validate_driver_fare_radius_constraints(config: DriverFareCalculatorConfig):
    if config.driver_long_distance_search_radius_km < config.driver_base_search_radius_km:
        raise HTTPException(
            status_code=400,
            detail="Long distance search radius (B) must be greater than or equal to base radius (A)",
        )

def compute_pickup_surcharge_for_driver_distance(
    driver_to_pickup_distance_km: float,
    pricing: PricingRule,
) -> Dict[str, float]:
    radius_cfg = get_driver_search_radius_config(pricing)
    included_radius = float(radius_cfg["base_radius_km"])
    surcharge_rate = float(pricing.driver_pickup_surcharge_per_km or pricing.per_km_rate or 0.0)
    extra_distance = max(0.0, float(driver_to_pickup_distance_km or 0.0) - included_radius)
    surcharge = round(extra_distance * surcharge_rate, 2)
    return {
        "included_radius_km": included_radius,
        "driver_distance_km": round(float(driver_to_pickup_distance_km or 0.0), 2),
        "extra_pickup_distance_km": round(extra_distance, 2),
        "pickup_surcharge": surcharge,
        "pickup_surcharge_per_km": round(surcharge_rate, 2),
    }

def compute_driver_pickup_charge(
    *,
    driver_location: Optional[Dict[str, Any]],
    pickup_location: Dict[str, Any],
    pricing: PricingRule,
) -> Dict[str, float]:
    if not driver_location:
        return {
            "driver_distance_km": 0.0,
            "extra_pickup_distance_km": 0.0,
            "pickup_surcharge": 0.0,
        }
    try:
        distance_km = calculate_distance(Location(**driver_location), Location(**pickup_location))
    except Exception:
        return {
            "driver_distance_km": 0.0,
            "extra_pickup_distance_km": 0.0,
            "pickup_surcharge": 0.0,
        }
    surcharge_payload = compute_pickup_surcharge_for_driver_distance(distance_km, pricing)
    return {
        "driver_distance_km": surcharge_payload["driver_distance_km"],
        "extra_pickup_distance_km": surcharge_payload["extra_pickup_distance_km"],
        "pickup_surcharge": surcharge_payload["pickup_surcharge"],
    }


async def find_best_driver_for_booking(
    pickup: Location,
    candidate_driver_ids: Optional[List[str]] = None,
    max_search_radius_km: Optional[float] = None,
    excluded_driver_ids: Optional[List[str]] = None,
) -> Optional[Dict[str, Any]]:
    """Find best available driver from live in-memory locations."""
    max_radius = float(max_search_radius_km or AUTO_ASSIGN_MAX_RADIUS_KM)
    max_radius = max(0.5, max_radius)
    query = {
        "is_available": True,
        "vehicle_info": {"$ne": None},
        "kyc_status": KYCStatus.APPROVED,
    }
    blocked_set = set(excluded_driver_ids or [])
    if candidate_driver_ids:
        filtered = [driver_id for driver_id in list(set(candidate_driver_ids)) if driver_id not in blocked_set]
        if not filtered:
            return None
        query["user_id"] = {"$in": filtered}
    else:
        geo_candidates = await find_nearest_drivers_mongo_geo(
            {"latitude": pickup.latitude, "longitude": pickup.longitude},
            limit=25,
            max_distance_km=max_radius,
        )
        geo_candidate_ids = [str(item.get("user_id") or "").strip() for item in geo_candidates if item.get("user_id")]
        if geo_candidate_ids:
            if blocked_set:
                geo_candidate_ids = [driver_id for driver_id in geo_candidate_ids if driver_id not in blocked_set]
            if not geo_candidate_ids:
                return None
            query["user_id"] = {"$in": list(set(geo_candidate_ids))}
        elif blocked_set:
            query["user_id"] = {"$nin": list(blocked_set)}

    candidates = await db.drivers.find(query).to_list(250)
    filter_preferences = load_driver_ride_filter_preferences([str(driver.get("user_id") or "") for driver in candidates])

    scored: List[Dict[str, Any]] = []
    for driver in candidates:
        driver_id = str(driver.get("user_id") or "").strip()
        live_location = await get_effective_driver_location(driver)
        if not live_location:
            continue
        try:
            metrics = compute_driver_match_score({**driver, "current_location": live_location}, pickup)
        except Exception:
            continue
        filter_reasons = driver_ride_filter_rejection_reasons(
            filter_preferences.get(driver_id),
            {"pickup_location": pickup.dict() if hasattr(pickup, "dict") else pickup},
            driver_distance_km=metrics.get("distance_km"),
            passenger_rating=None,
            now=get_ist_now(),
        )
        if filter_reasons:
            continue
        if metrics["distance_km"] <= max_radius:
            scored.append({**driver, "current_location": live_location, **metrics})

    if not scored:
        return None

    scored.sort(key=lambda item: (-item["score"], item["distance_km"]))
    return scored[0]

async def find_nearest_drivers_for_booking(
    pickup: Location,
    limit: int = 5,
    candidate_driver_ids: Optional[List[str]] = None,
    max_search_radius_km: Optional[float] = None,
    excluded_driver_ids: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """Find nearest available drivers sorted by actual pickup distance from live cache."""
    max_radius = float(max_search_radius_km or AUTO_ASSIGN_MAX_RADIUS_KM)
    max_radius = max(0.5, max_radius)
    query = {
        "is_available": True,
        "vehicle_info": {"$ne": None},
        "kyc_status": KYCStatus.APPROVED,
    }
    blocked_set = set(excluded_driver_ids or [])
    if candidate_driver_ids:
        filtered = [driver_id for driver_id in list(set(candidate_driver_ids)) if driver_id not in blocked_set]
        if not filtered:
            return []
        query["user_id"] = {"$in": filtered}
    else:
        geo_candidates = await find_nearest_drivers_mongo_geo(
            {"latitude": pickup.latitude, "longitude": pickup.longitude},
            limit=max(5, int(limit) * 3),
            max_distance_km=max_radius,
        )
        geo_candidate_ids = [str(item.get("user_id") or "").strip() for item in geo_candidates if item.get("user_id")]
        if geo_candidate_ids:
            if blocked_set:
                geo_candidate_ids = [driver_id for driver_id in geo_candidate_ids if driver_id not in blocked_set]
            if not geo_candidate_ids:
                return []
            query["user_id"] = {"$in": list(set(geo_candidate_ids))}
        elif blocked_set:
            query["user_id"] = {"$nin": list(blocked_set)}
    candidates = await db.drivers.find(query).to_list(250)
    filter_preferences = load_driver_ride_filter_preferences([str(driver.get("user_id") or "") for driver in candidates])

    scored: List[Dict[str, Any]] = []
    for driver in candidates:
        driver_id = str(driver.get("user_id") or "").strip()
        live_location = await get_effective_driver_location(driver)
        if not live_location:
            continue
        try:
            distance = calculate_distance(pickup, Location(**live_location))
        except Exception:
            continue
        filter_reasons = driver_ride_filter_rejection_reasons(
            filter_preferences.get(driver_id),
            {"pickup_location": pickup.dict() if hasattr(pickup, "dict") else pickup},
            driver_distance_km=distance,
            passenger_rating=None,
            now=get_ist_now(),
        )
        if filter_reasons:
            continue
        if distance <= max_radius:
            scored.append({**driver, "current_location": live_location, "distance_km": distance})

    scored.sort(key=lambda item: item.get("distance_km", 99999))
    return scored[: max(1, limit)]

async def find_candidate_drivers_for_scheduled_booking(
    pickup: Location,
    max_search_radius_km: float,
    excluded_driver_ids: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """Return all candidate drivers in radius, including drivers currently on another ride."""
    max_radius = max(0.5, float(max_search_radius_km or 10.0))
    blocked_set = set(excluded_driver_ids or [])
    query: Dict[str, Any] = {
        "vehicle_info": {"$ne": None},
        "kyc_status": KYCStatus.APPROVED,
    }
    if blocked_set:
        query["user_id"] = {"$nin": list(blocked_set)}

    candidates = await db.drivers.find(query).to_list(500)

    scored: List[Dict[str, Any]] = []
    for driver in candidates:
        live_location = await get_effective_driver_location(driver)
        if not live_location:
            continue
        try:
            distance = calculate_distance(pickup, Location(**live_location))
        except Exception:
            continue
        if distance <= max_radius:
            scored.append({**driver, "current_location": live_location, "distance_km": distance})

    scored.sort(key=lambda item: item.get("distance_km", 99999))
    return scored

ACTIVE_RIDE_STATUSES = [BookingStatus.ACCEPTED, BookingStatus.DRIVER_ARRIVED, BookingStatus.IN_PROGRESS]


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value if value is not None else default)
    except Exception:
        return default


def km_between(a: Dict[str, Any], b: Dict[str, Any]) -> float:
    a_lat = safe_float((a or {}).get("latitude"), None)
    a_lng = safe_float((a or {}).get("longitude"), None)
    b_lat = safe_float((b or {}).get("latitude"), None)
    b_lng = safe_float((b or {}).get("longitude"), None)
    if None in {a_lat, a_lng, b_lat, b_lng}:
        return float("inf")
    try:
        return float(
            calculate_distance(
                Location(latitude=a_lat, longitude=a_lng),
                Location(latitude=b_lat, longitude=b_lng),
            )
        )
    except Exception:
        return float("inf")


async def get_driver_stats(driver_id: str) -> Dict[str, float]:
    total_future = db.bookings.count_documents({"driver_id": driver_id})
    completed_future = db.bookings.count_documents({"driver_id": driver_id, "status": BookingStatus.COMPLETED})
    cancelled_future = db.bookings.count_documents({"driver_id": driver_id, "status": BookingStatus.CANCELLED})
    accepted_future = db.dispatch_attempts.count_documents({"driver_id": driver_id, "response": "accepted"})
    rejected_future = db.dispatch_attempts.count_documents({"driver_id": driver_id, "response": "rejected"})
    expired_future = db.dispatch_attempts.count_documents({"driver_id": driver_id, "response": "expired"})
    total, completed, cancelled, accepted, rejected, expired = await asyncio.gather(
        total_future,
        completed_future,
        cancelled_future,
        accepted_future,
        rejected_future,
        expired_future,
    )
    attempts = accepted + rejected + expired
    return {
        "total": float(total),
        "completed": float(completed),
        "cancelled": float(cancelled),
        "completion_rate": float(completed) / max(float(total), 1.0),
        "cancellation_rate": float(cancelled) / max(float(total), 1.0),
        "acceptance_rate": float(accepted) / max(float(attempts), 1.0),
        "rejection_rate": float(rejected) / max(float(attempts), 1.0),
    }

def get_driver_analytics_start(period: str) -> datetime:
    now = get_ist_now()
    normalized = str(period or "week").strip().lower()
    if normalized == "day":
        return datetime(now.year, now.month, now.day)
    if normalized == "month":
        return datetime(now.year, now.month, 1)
    if normalized == "year":
        return datetime(now.year, 1, 1)
    return now - timedelta(days=7)

def booking_metric_date(booking: Dict[str, Any]) -> datetime:
    value = booking.get("trip_completed_at") or booking.get("updated_at") or booking.get("created_at")
    return value if isinstance(value, datetime) else get_ist_now()

def booking_fare_value(booking: Dict[str, Any]) -> float:
    return safe_float(booking.get("final_fare"), safe_float(booking.get("estimated_fare"), 0.0))

def booking_distance_value(booking: Dict[str, Any]) -> float:
    return safe_float(booking.get("actual_distance_km"), safe_float(booking.get("distance_km"), 0.0))

async def calculate_driver_online_hours(driver_id: str, start_at: datetime, end_at: datetime, profile: Dict[str, Any]) -> float:
    events = await db.driver_availability_events.find(
        {"driver_id": driver_id, "created_at": {"$gte": start_at, "$lte": end_at}},
        {"_id": 0, "is_available": 1, "created_at": 1},
    ).sort("created_at", 1).to_list(1000)

    last_before = await db.driver_availability_events.find_one(
        {"driver_id": driver_id, "created_at": {"$lt": start_at}},
        {"_id": 0, "is_available": 1, "created_at": 1},
        sort=[("created_at", -1)],
    )
    online = bool(last_before.get("is_available")) if last_before else False
    cursor_time = start_at
    seconds_online = 0.0

    for event in events:
        event_time = event.get("created_at")
        if not isinstance(event_time, datetime):
            continue
        if online:
            seconds_online += max(0.0, (event_time - cursor_time).total_seconds())
        online = bool(event.get("is_available"))
        cursor_time = event_time

    if online:
        seconds_online += max(0.0, (end_at - cursor_time).total_seconds())

    if seconds_online <= 0 and profile.get("is_online") and isinstance(profile.get("last_online_at"), datetime):
        online_start = max(start_at, profile["last_online_at"])
        seconds_online = max(0.0, (end_at - online_start).total_seconds())

    return round(seconds_online / 3600.0, 2)

def build_driver_analytics_series(bookings: List[Dict[str, Any]], start_at: datetime, end_at: datetime) -> tuple[List[Dict[str, Any]], Dict[str, Dict[str, Any]], List[Dict[str, Any]]]:
    daily: Dict[str, Dict[str, Any]] = {}
    hourly: Dict[int, int] = {}
    cursor = datetime(start_at.year, start_at.month, start_at.day)
    last_day = datetime(end_at.year, end_at.month, end_at.day)
    while cursor <= last_day:
        key = cursor.date().isoformat()
        daily[key] = {"date": key, "rides": 0, "earnings": 0.0, "rating": 0.0}
        cursor += timedelta(days=1)

    for booking in bookings:
        metric_date = booking_metric_date(booking)
        day_key = metric_date.date().isoformat()
        daily.setdefault(day_key, {"date": day_key, "rides": 0, "earnings": 0.0, "rating": 0.0})
        daily[day_key]["rides"] += 1
        daily[day_key]["earnings"] += booking_fare_value(booking)
        hourly[metric_date.hour] = hourly.get(metric_date.hour, 0) + 1

    daily_trends = [
        {
            "date": item["date"],
            "rides": int(item["rides"]),
            "earnings": round(float(item["earnings"]), 2),
            "rating": round(float(item.get("rating") or 0.0), 2),
        }
        for item in sorted(daily.values(), key=lambda row: row["date"])
    ]
    weekly_comparison = {
        datetime.strptime(item["date"], "%Y-%m-%d").strftime("%a %d %b"): {
            "rides": item["rides"],
            "earnings": item["earnings"],
            "rating": item["rating"],
        }
        for item in daily_trends[-7:]
    }
    peak_hours = [
        {"hour": hour, "count": count}
        for hour, count in sorted(hourly.items(), key=lambda pair: pair[1], reverse=True)[:5]
    ]
    return daily_trends, weekly_comparison, peak_hours


async def is_driver_busy(driver_id: str) -> bool:
    active = await db.bookings.find_one({"driver_id": driver_id, "status": {"$in": ACTIVE_RIDE_STATUSES}})
    return active is not None


async def get_supply_demand_score(pickup_location: Dict[str, Any], radius_km: float = 4.0) -> Dict[str, Any]:
    online_drivers = await db.drivers.find(
        {
            "is_available": True,
            "kyc_status": KYCStatus.APPROVED,
            "vehicle_info": {"$ne": None},
        }
    ).to_list(500)
    nearby_drivers = 0
    for driver in online_drivers:
        live_location = await get_effective_driver_location(driver)
        if not live_location:
            continue
        if km_between(pickup_location, live_location) <= radius_km:
            nearby_drivers += 1

    recent_cutoff = get_ist_now() - timedelta(minutes=15)
    recent_bookings = await db.bookings.find(
        {
            "created_at": {"$gte": recent_cutoff},
            "pickup_location": {"$ne": None},
            "status": {
                "$in": [
                    BookingStatus.PENDING,
                    BookingStatus.ACCEPTED,
                    BookingStatus.DRIVER_ARRIVED,
                    BookingStatus.IN_PROGRESS,
                ]
            },
        }
    ).to_list(300)
    nearby_demand = 0
    for item in recent_bookings:
        pickup = item.get("pickup_location") or {}
        if km_between(pickup_location, pickup) <= radius_km:
            nearby_demand += 1

    ratio = nearby_demand / max(nearby_drivers, 1)
    return {
        "nearby_drivers": nearby_drivers,
        "nearby_demand": nearby_demand,
        "ratio": round(ratio, 2),
    }


def calculate_surge_multiplier(supply_demand_score: Dict[str, Any]) -> float:
    ratio = safe_float(supply_demand_score.get("ratio"), 1.0)
    if ratio < 1:
        return 1.0
    if ratio < 2:
        return 1.10
    if ratio < 3:
        return 1.25
    if ratio < 5:
        return 1.45
    return 1.70


def predict_cancellation_risk(
    driver_stats: Dict[str, float],
    distance_to_pickup_km: float,
    surge_multiplier: float,
) -> float:
    risk = 0.05
    risk += safe_float(driver_stats.get("cancellation_rate"), 0.0) * 0.45
    risk += safe_float(driver_stats.get("rejection_rate"), 0.0) * 0.20
    if distance_to_pickup_km > 4:
        risk += 0.10
    if distance_to_pickup_km > 7:
        risk += 0.20
    if surge_multiplier > 1.3:
        risk -= 0.05
    return round(min(max(risk, 0.01), 0.95), 3)


def calculate_driver_rank_score(payload: Dict[str, Any]) -> float:
    distance_km = safe_float(payload.get("distance_km"), 1000.0)
    driver_stats = payload.get("driver_stats") or {}
    rating = safe_float(payload.get("rating"), 4.5)
    cancellation_risk = safe_float(payload.get("cancellation_risk"), 0.5)
    idle_minutes = safe_float(payload.get("idle_minutes"), 0.0)
    distance_score = max(0.0, 100.0 - (distance_km * 12.0))
    rating_score = min(100.0, rating * 20.0)
    acceptance_score = safe_float(driver_stats.get("acceptance_rate"), 0.0) * 100.0
    completion_score = safe_float(driver_stats.get("completion_rate"), 0.0) * 100.0
    cancellation_score = max(0.0, 100.0 - (cancellation_risk * 100.0))
    idle_score = min(100.0, idle_minutes * 2.0)
    final_score = (
        (distance_score * 0.30)
        + (rating_score * 0.20)
        + (acceptance_score * 0.20)
        + (completion_score * 0.15)
        + (cancellation_score * 0.10)
        + (idle_score * 0.05)
    )
    return round(final_score, 2)


async def detect_dispatch_fraud(passenger_id: str, pickup_location: Dict[str, Any]) -> Dict[str, Any]:
    recent_cutoff = get_ist_now() - timedelta(minutes=30)
    recent_cancel_count = await db.bookings.count_documents(
        {
            "passenger_id": passenger_id,
            "status": BookingStatus.CANCELLED,
            "created_at": {"$gte": recent_cutoff},
        }
    )
    recent_pending_count = await db.bookings.count_documents(
        {
            "passenger_id": passenger_id,
            "status": BookingStatus.PENDING,
            "created_at": {"$gte": recent_cutoff},
        }
    )
    risk = 0.0
    reasons: List[str] = []
    if recent_cancel_count >= 3:
        risk += 0.45
        reasons.append("Too many recent cancellations")
    if recent_pending_count >= 3:
        risk += 0.25
        reasons.append("Multiple pending rides")
    return {
        "risk_score": round(min(risk, 1.0), 2),
        "flagged": risk >= 0.5,
        "reasons": reasons,
        "pickup_location_checked": bool(pickup_location),
    }


def load_driver_ride_filter_preferences(driver_ids: List[str]) -> Dict[str, Dict[str, Any]]:
    cleaned_ids = [str(driver_id or "").strip() for driver_id in driver_ids if str(driver_id or "").strip()]
    if not cleaned_ids:
        return {}
    session = SessionLocal()
    try:
        rows = (
            session.query(RideFilterPreferences)
            .filter(
                RideFilterPreferences.driver_id.in_(list(set(cleaned_ids))),
                RideFilterPreferences.auto_decline_enabled.is_(True),
            )
            .all()
        )
        return {str(row.driver_id): row.to_dict() for row in rows}
    except Exception as exc:
        logger.warning("Driver ride filters unavailable; continuing without auto-decline filters: %s", exc)
        return {}
    finally:
        session.close()


def parse_hhmm_minutes(value: Any) -> Optional[int]:
    match = re.match(r"^\s*(\d{1,2}):(\d{2})", str(value or ""))
    if not match:
        return None
    hour = int(match.group(1))
    minute = int(match.group(2))
    if hour > 23 or minute > 59:
        return None
    return hour * 60 + minute


def is_time_in_restricted_window(restriction: Any, now: datetime) -> bool:
    if not isinstance(restriction, dict):
        return False
    start = parse_hhmm_minutes(restriction.get("start"))
    end = parse_hhmm_minutes(restriction.get("end"))
    if start is None or end is None or start == end:
        return False
    current = now.hour * 60 + now.minute
    return start <= current < end if start < end else current >= start or current < end


def booking_pickup_search_text(booking: Dict[str, Any]) -> str:
    pickup = booking.get("pickup_location") or {}
    if hasattr(pickup, "dict"):
        pickup = pickup.dict()
    if not isinstance(pickup, dict):
        return ""
    values = [
        pickup.get("address"),
        pickup.get("formatted_address"),
        pickup.get("name"),
        pickup.get("area"),
        pickup.get("locality"),
        pickup.get("city"),
        pickup.get("label"),
    ]
    return " ".join(str(value or "").lower() for value in values)


def driver_ride_filter_rejection_reasons(
    preferences: Optional[Dict[str, Any]],
    booking: Dict[str, Any],
    *,
    driver_distance_km: Optional[float],
    passenger_rating: Optional[float],
    now: Optional[datetime] = None,
) -> List[str]:
    if not preferences or not preferences.get("auto_decline_enabled", True):
        return []

    reasons: List[str] = []
    max_distance = preferences.get("max_pickup_distance_km")
    if max_distance is not None and driver_distance_km is not None:
        try:
            if float(driver_distance_km) > float(max_distance):
                reasons.append("pickup_too_far")
        except (TypeError, ValueError):
            pass

    min_rating = preferences.get("min_passenger_rating")
    if min_rating is not None and passenger_rating is not None:
        try:
            if float(passenger_rating) < float(min_rating):
                reasons.append("passenger_rating_below_filter")
        except (TypeError, ValueError):
            pass

    pickup_text = booking_pickup_search_text(booking)
    blocked_areas = [
        str(area or "").strip().lower()
        for area in preferences.get("blocked_pickup_areas") or preferences.get("blocked_areas") or []
    ]
    if pickup_text and any(area and area in pickup_text for area in blocked_areas):
        reasons.append("blocked_pickup_area")

    allowed_areas = [
        str(area or "").strip().lower()
        for area in preferences.get("allowed_pickup_areas") or preferences.get("allowed_areas") or []
    ]
    if pickup_text and allowed_areas and not any(area and area in pickup_text for area in allowed_areas):
        reasons.append("outside_allowed_pickup_areas")

    if is_time_in_restricted_window(preferences.get("time_slot_restrictions"), now or get_ist_now()):
        reasons.append("restricted_time_slot")

    return reasons


async def get_user_rating_summary(user_id: str) -> Dict[str, Any]:
    cleaned_id = str(user_id or "").strip()
    if not cleaned_id:
        return {"average_rating": 5.0, "total_ratings": 0}
    ratings = await db.ratings.find({"to_user_id": cleaned_id}, {"_id": 0, "rating": 1}).to_list(500)
    values = [safe_float(item.get("rating"), 0.0) for item in ratings if safe_float(item.get("rating"), 0.0) > 0]
    if values:
        return {"average_rating": round(sum(values) / len(values), 2), "total_ratings": len(values)}
    user = await db.users.find_one({"id": cleaned_id}, {"_id": 0, "rating": 1, "average_rating": 1})
    fallback_rating = safe_float((user or {}).get("average_rating"), safe_float((user or {}).get("rating"), 5.0))
    return {"average_rating": round(fallback_rating or 5.0, 2), "total_ratings": 0}


async def intelligent_find_drivers_for_booking(
    booking: Dict[str, Any],
    limit: int = 5,
    max_radius_km: float = 8.0,
    excluded_driver_ids: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    pickup = booking.get("pickup_location") or {}
    passenger_id = str(booking.get("passenger_id") or "").strip()
    booking_id = str(booking.get("id") or "").strip()
    blocked_set = set(excluded_driver_ids or [])
    if not pickup:
        return []

    fraud = await detect_dispatch_fraud(passenger_id, pickup)
    if fraud.get("flagged"):
        await db.dispatch_risk_logs.insert_one(
            {
                "id": str(uuid.uuid4()),
                "booking_id": booking_id,
                "passenger_id": passenger_id,
                "risk": fraud,
                "created_at": get_ist_now(),
            }
        )

    supply_demand = await get_supply_demand_score(pickup)
    surge_multiplier = calculate_surge_multiplier(supply_demand)

    query: Dict[str, Any] = {
        "is_available": True,
        "kyc_status": KYCStatus.APPROVED,
        "vehicle_info": {"$ne": None},
    }
    if blocked_set:
        query["user_id"] = {"$nin": list(blocked_set)}
    drivers = await db.drivers.find(query).to_list(500)
    filter_preferences = load_driver_ride_filter_preferences([str(driver.get("user_id") or "") for driver in drivers])
    passenger_rating_summary = await get_user_rating_summary(passenger_id)
    passenger_rating = safe_float(passenger_rating_summary.get("average_rating"), 5.0)

    ranked: List[Dict[str, Any]] = []
    filtered_out: List[Dict[str, Any]] = []
    for driver in drivers:
        driver_id = str(driver.get("user_id") or "").strip()
        if not driver_id or driver_id in blocked_set:
            continue
        if await is_driver_busy(driver_id):
            continue
        live_location = await get_effective_driver_location(driver)
        if not live_location:
            continue
        distance_km = km_between(pickup, live_location)
        if not math.isfinite(distance_km) or distance_km > max_radius_km:
            continue
        filter_reasons = driver_ride_filter_rejection_reasons(
            filter_preferences.get(driver_id),
            booking,
            driver_distance_km=distance_km,
            passenger_rating=passenger_rating,
            now=get_ist_now(),
        )
        if filter_reasons:
            filtered_out.append({"driver_id": driver_id, "reasons": filter_reasons})
            continue
        stats = await get_driver_stats(driver_id)
        last_assigned = driver.get("last_assigned_at")
        if isinstance(last_assigned, datetime):
            idle_minutes = max(0.0, (get_ist_now() - last_assigned).total_seconds() / 60.0)
        else:
            idle_minutes = 60.0
        rating = safe_float(driver.get("rating"), 4.5)
        cancellation_risk = predict_cancellation_risk(stats, distance_km, surge_multiplier)
        score = calculate_driver_rank_score(
            {
                "distance_km": distance_km,
                "driver_stats": stats,
                "rating": rating,
                "cancellation_risk": cancellation_risk,
                "idle_minutes": idle_minutes,
            }
        )
        ranked.append(
            {
                "driver_id": driver_id,
                "driver_name": driver.get("name"),
                "distance_km": round(distance_km, 2),
                "rating": rating,
                "acceptance_rate": round(safe_float(stats.get("acceptance_rate"), 0.0), 2),
                "completion_rate": round(safe_float(stats.get("completion_rate"), 0.0), 2),
                "cancellation_risk": cancellation_risk,
                "rank_score": score,
                "surge_multiplier": surge_multiplier,
                "demand_supply": supply_demand,
                "fraud_risk": fraud,
            }
        )
    ranked.sort(key=lambda item: item.get("rank_score", 0.0), reverse=True)
    selected = ranked[: max(1, int(limit or 1))]

    await db.dispatch_logs.insert_one(
        {
            "id": str(uuid.uuid4()),
            "booking_id": booking_id,
            "passenger_id": passenger_id,
            "pickup_location": pickup,
            "pickup_heat_cell": dispatch_heat_cell(pickup),
            "supply_demand": supply_demand,
            "surge_multiplier": surge_multiplier,
            "fraud_risk": fraud,
            "ranked_drivers": ranked[:20],
            "selected_driver_ids": [item["driver_id"] for item in selected],
            "filtered_driver_ids": filtered_out[:50],
            "passenger_rating": passenger_rating,
            "created_at": get_ist_now(),
        }
    )
    return selected

async def is_driver_in_active_ride(driver_id: str) -> bool:
    active_statuses = [BookingStatus.ACCEPTED, BookingStatus.DRIVER_ARRIVED, BookingStatus.IN_PROGRESS]
    count = await db.bookings.count_documents({"driver_id": driver_id, "status": {"$in": active_statuses}})
    return count > 0


async def attempt_auto_assign_for_pending_booking(booking_id: str) -> bool:
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        return False
    if booking.get("status") != BookingStatus.PENDING or booking.get("driver_id"):
        return False

    pickup_data = booking.get("pickup_location")
    if not pickup_data:
        return False

    pricing = await get_pricing_rules()
    radius_cfg = get_driver_search_radius_config(pricing)
    excluded_driver_ids = await get_excluded_driver_ids_for_passenger(str(booking.get("passenger_id") or ""))
    best_driver = await find_best_driver_for_booking(
        Location(**pickup_data),
        candidate_driver_ids=booking.get("candidate_driver_ids") or None,
        max_search_radius_km=float(radius_cfg["long_radius_km"]),
        excluded_driver_ids=excluded_driver_ids,
    )
    if not best_driver:
        return False

    now = get_ist_now()
    surge_multiplier = max(1.0, safe_float(booking.get("surge_multiplier"), 1.0))
    fare_multiplier = float(best_driver.get("fare_multiplier", 1.0))
    effective_pricing = await get_effective_pricing_for_driver_profile(best_driver, pricing)
    distance_km = float(booking.get("distance_km", 0.0) or 0.0)
    time_multiplier = float(booking.get("fare_time_multiplier", 0.0) or 0.0)
    if time_multiplier <= 0:
        time_multiplier = get_time_multiplier()
    base_route_fare = (effective_pricing.base_fare + (distance_km * effective_pricing.per_km_rate)) * time_multiplier
    base_route_fare = max(base_route_fare, effective_pricing.minimum_fare)
    pickup_charge = compute_driver_pickup_charge(
        driver_location=best_driver.get("current_location"),
        pickup_location=pickup_data,
        pricing=effective_pricing,
    )
    updated_estimate = (
        round((base_route_fare * surge_multiplier * fare_multiplier) + float(pickup_charge["pickup_surcharge"]), 2)
        if base_route_fare > 0
        else base_route_fare
    )

    assign_result = await db.bookings.update_one(
        {"id": booking_id, "status": BookingStatus.PENDING, "driver_id": None},
        {
            "$set": {
                "driver_id": best_driver["user_id"],
                "status": BookingStatus.ACCEPTED,
                "base_route_fare": round(base_route_fare, 2),
                "estimated_fare": updated_estimate,
                "pickup_surcharge": float(pickup_charge["pickup_surcharge"]),
                "extra_pickup_distance_km": float(pickup_charge["extra_pickup_distance_km"]),
                "driver_to_pickup_distance_km": float(pickup_charge["driver_distance_km"]),
                "dispatch_status": "accepted",
                "accepted_driver_score_updated_at": now,
                "updated_at": now,
                "assigned_at": now,
            }
        },
    )
    if assign_result.modified_count != 1:
        return False

    await db.drivers.update_one(
        {"user_id": best_driver["user_id"]},
        {"$set": {"is_available": False, "last_assigned_at": now}, "$inc": {"assigned_count": 1}},
    )

    await emit_to_user(
        best_driver["user_id"],
        "booking_auto_assigned",
        {
            "booking_id": booking_id,
            "timestamp": now.isoformat(),
        },
    )
    await emit_to_user(
        booking["passenger_id"],
        "booking_driver_assigned",
        {
            "booking_id": booking_id,
            "driver_id": best_driver["user_id"],
            "timestamp": now.isoformat(),
        },
    )
    await notify_user(
        booking["passenger_id"],
        title="Driver Assigned",
        body="A nearby driver has accepted your AutoBuddy ride.",
        data={"booking_id": booking_id, "driver_id": best_driver["user_id"]},
    )
    return True

async def retry_auto_assignment_for_pending_booking(booking_id: str):
    """Retry assignment for pending booking in background using current live driver state."""
    for _ in range(max(1, AUTO_ASSIGN_RETRY_ATTEMPTS)):
        await asyncio.sleep(max(3, AUTO_ASSIGN_RETRY_INTERVAL_SECONDS))
        if await attempt_auto_assign_for_pending_booking(booking_id):
            return

async def schedule_booking_assignment(booking_id: str, scheduled_for: datetime):
    wait_seconds = max(0, int((scheduled_for - get_ist_now()).total_seconds()))
    if wait_seconds > 0:
        await asyncio.sleep(wait_seconds)

    assigned = await attempt_auto_assign_for_pending_booking(booking_id)
    if assigned:
        return

    await emit_new_booking_to_drivers()
    asyncio.create_task(retry_auto_assignment_for_pending_booking(booking_id))

# ==================== AUTH ENDPOINTS ====================
@api_router.post("/auth/_legacy/register", response_model=AuthResponse)
async def register(user_data: UserCreate, request: Request):
    if len(str(user_data.password or "").strip()) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    normalized_email = normalize_email(user_data.email)
    normalized_phone = normalize_phone(user_data.phone)
    if user_data.phone_otp:
        await consume_phone_otp(normalized_phone, user_data.phone_otp)
    if not user_data.email_otp:
        raise HTTPException(status_code=400, detail="Email OTP is required for registration")
    await consume_email_otp(normalized_email, user_data.email_otp)
    registration_fee_settings = await get_registration_fee_settings()
    required_registration_fee = get_registration_fee_for_role(registration_fee_settings, user_data.role)
    validate_registration_payment_details(
        settings=registration_fee_settings,
        required_fee=required_registration_fee,
        registration_fee_ack=user_data.registration_fee_ack,
        payment_method=user_data.registration_payment_method,
        payment_utr=user_data.registration_payment_utr,
    )

    # Check if email exists
    existing = await db.users.find_one({"email": normalized_email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    existing_phone = await db.users.find_one({"phone": normalized_phone})
    if existing_phone:
        raise HTTPException(status_code=400, detail="Phone already registered")

    user_id = str(uuid.uuid4())
    user_dict = {
        "id": user_id,
        "email": normalized_email,
        "name": user_data.name,
        "phone": normalized_phone,
        "role": user_data.role,
        "gender": user_data.gender.value if isinstance(user_data.gender, Gender) else str(user_data.gender),
        "password_hash": hash_password(user_data.password),
        "created_at": get_ist_now(),
        "registration_fee_amount": float(required_registration_fee),
        "registration_payment_required": required_registration_fee > 0,
        "registration_payment_status": "submitted" if required_registration_fee > 0 else "not_required",
        "registration_payment_method": user_data.registration_payment_method,
        "registration_payment_utr": user_data.registration_payment_utr,
        "registration_verified_by_admin": required_registration_fee <= 0,
    }
    
    await db.users.insert_one(user_dict)
    
    # If driver, create driver profile placeholder
    if user_data.role == UserRole.DRIVER:
        driver_profile = build_default_driver_profile(user_id)
        await db.drivers.update_one({"user_id": user_id}, {"$setOnInsert": driver_profile}, upsert=True)
    referral = await create_referral_if_missing(db, user_dict)
    user_dict["referral_code"] = referral.get("code")
    incoming_referral_code = str(user_data.referral_code or "").strip().upper()
    if incoming_referral_code:
        applied = await apply_referral_signup(db, user_dict, incoming_referral_code)
        if not applied:
            await db.users.delete_one({"id": user_id})
            await db.drivers.delete_one({"user_id": user_id})
            await db.referrals.delete_one({"user_id": user_id})
            raise HTTPException(status_code=400, detail="Invalid or already used referral code")
    
    access_token = create_access_token_for_user(user_id, user_data.role)
    refresh_token = create_refresh_token_for_user(user_id, user_data.role)
    await store_refresh_token(user_id, refresh_token, request)
    return AuthResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse(
            id=user_id,
            email=normalized_email,
            name=user_data.name,
            phone=user_data.phone,
            role=user_data.role,
            gender=user_data.gender,
            referral_code=user_dict.get("referral_code"),
            created_at=user_dict["created_at"],
        ),
    )

@api_router.post("/auth/_legacy/login", response_model=AuthResponse)
async def login(credentials: UserLogin, request: Request):
    client_ip = get_request_ip(request)
    await check_login_throttle(client_ip)

    try:
        user = await db.users.find_one({"email": credentials.email})
    except ServerSelectionTimeoutError:
        logger.error("MongoDB server selection timed out during /auth/login")
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")
    except PyMongoError:
        logger.exception("MongoDB error during /auth/login")
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")

    if not user or not verify_password(credentials.password, user["password_hash"]):
        await register_login_attempt(client_ip)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if user.get("registration_payment_required") and user.get("registration_payment_status") != "verified":
        raise HTTPException(status_code=403, detail="Registration payment verification is in progress")

    if str(user.get("role") or "").strip().lower() == "driver":
        if redis_client:
            try:
                if await redis_client.sismember("global_driver_blacklist", str(user.get("id") or "")):
                    raise HTTPException(status_code=403, detail="Account permanently suspended. Contact support.")
            except HTTPException:
                raise
            except Exception:
                pass
        active_blacklist = await db.driver_blacklist.find_one(
            {"driver_id": str(user.get("id") or ""), "active": True},
            {"_id": 0, "reason": 1},
        )
        if active_blacklist:
            raise HTTPException(status_code=403, detail="Account permanently suspended. Contact support.")

    await clear_login_attempts(client_ip)
    refresh_token = create_refresh_token_for_user(user["id"], user["role"])
    await store_refresh_token(user["id"], refresh_token, request)
    return auth_response_for_user(user, refresh_token=refresh_token)

@api_router.post("/auth/_legacy/google", response_model=AuthResponse)
async def google_login(payload: GoogleAuthRequestModel, request: Request):
    profile_email: Optional[str] = None
    profile_name: Optional[str] = None

    if payload.google_id_token:
        if not google_id_token or not GoogleAuthRequest:
            raise HTTPException(status_code=500, detail="Google login is not configured on server")
        try:
            idinfo = google_id_token.verify_oauth2_token(
                payload.google_id_token,
                GoogleAuthRequest(),
                GOOGLE_OAUTH_CLIENT_ID or None,
            )
            profile_email = str(idinfo.get("email") or "").lower()
            profile_name = str(idinfo.get("name") or "").strip()
            if not profile_email:
                raise HTTPException(status_code=400, detail="Google account did not return email")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=401, detail="Invalid Google login token")
    else:
        # Dev fallback: allow Google-like login without OAuth token when user shares email + name.
        if not payload.email or not payload.name:
            raise HTTPException(status_code=400, detail="Provide Google token or email + name")
        profile_email = str(payload.email).lower()
        profile_name = str(payload.name).strip()

    user = await db.users.find_one({"email": profile_email})
    created_new_user = False
    if user and payload.mode == "register":
        raise HTTPException(status_code=400, detail="Email already registered. Please login with Google.")

    if not user:
        if payload.mode != "register":
            raise HTTPException(status_code=404, detail="Account not found. Please register with Google first.")
        if not str(payload.name or "").strip():
            raise HTTPException(status_code=400, detail="Name is required for Google registration")
        if not str(payload.phone or "").strip():
            raise HTTPException(status_code=400, detail="Phone number is required for Google registration")
        if not payload.gender:
            raise HTTPException(status_code=400, detail="Gender is required for Google registration")
        registration_fee_settings = await get_registration_fee_settings()
        required_registration_fee = get_registration_fee_for_role(registration_fee_settings, payload.role)
        validate_registration_payment_details(
            settings=registration_fee_settings,
            required_fee=required_registration_fee,
            registration_fee_ack=payload.registration_fee_ack,
            payment_method=payload.registration_payment_method,
            payment_utr=payload.registration_payment_utr,
        )
        phone = normalize_phone(payload.phone)
        user = await create_user_for_social_or_otp(
            name=str(payload.name or profile_name or "").strip(),
            phone=phone,
            role=payload.role,
            gender=payload.gender,
            email=profile_email,
        )
        created_new_user = True
        if required_registration_fee > 0:
            await db.users.update_one(
                {"id": user["id"]},
                {
                    "$set": {
                        "registration_fee_amount": float(required_registration_fee),
                        "registration_payment_required": True,
                        "registration_payment_status": "submitted",
                        "registration_payment_method": payload.registration_payment_method,
                        "registration_payment_utr": payload.registration_payment_utr,
                        "registration_verified_by_admin": False,
                    }
                },
            )
            user = await db.users.find_one({"id": user["id"]})
    referral = await create_referral_if_missing(db, user)
    user["referral_code"] = referral.get("code")
    incoming_referral_code = str(payload.referral_code or "").strip().upper()
    if payload.mode == "register" and incoming_referral_code:
        applied = await apply_referral_signup(db, user, incoming_referral_code)
        if not applied:
            if created_new_user:
                await db.users.delete_one({"id": user["id"]})
                await db.drivers.delete_one({"user_id": user["id"]})
                await db.referrals.delete_one({"user_id": user["id"]})
            raise HTTPException(status_code=400, detail="Invalid or already used referral code")

    if user.get("registration_payment_required") and user.get("registration_payment_status") != "verified":
        raise HTTPException(status_code=403, detail="Registration payment verification is in progress")

    refresh_token = create_refresh_token_for_user(user["id"], user["role"])
    await store_refresh_token(user["id"], refresh_token, request)
    return auth_response_for_user(user, refresh_token=refresh_token)

@api_router.post("/auth/_legacy/otp/send", response_model=OtpSendResponse)
async def send_otp(payload: OtpSendRequest):
    phone = normalize_phone(payload.phone)
    otp_code = f"{random.randint(100000, 999999)}"
    await runtime_state.store_phone_otp(phone, otp_code)

    return OtpSendResponse(
        message="OTP sent successfully",
        expires_in_seconds=max(60, OTP_EXPIRY_MINUTES * 60),
        otp_demo=otp_code if ENVIRONMENT != "production" else None,
    )

@api_router.post("/auth/_legacy/email-otp/send", response_model=OtpSendResponse)
async def send_email_otp(payload: EmailOtpSendRequest):
    email = normalize_email(payload.email)
    otp_code = f"{random.randint(100000, 999999)}"
    await runtime_state.store_email_otp(email, otp_code)

    # TODO: integrate real email delivery provider; demo OTP response for now.
    return OtpSendResponse(
        message="Email OTP sent successfully",
        expires_in_seconds=max(60, OTP_EXPIRY_MINUTES * 60),
        otp_demo=otp_code if ENVIRONMENT != "production" else None,
    )

@api_router.post("/auth/_legacy/otp/verify", response_model=AuthResponse)
async def verify_otp(payload: OtpVerifyRequest, request: Request):
    phone = normalize_phone(payload.phone)
    await consume_phone_otp(phone, payload.otp)
    user = await db.users.find_one({"phone": phone})
    if not user:
        generated_email = payload.email or f"{phone}@otp.autobuddy.app"
        user = await create_user_for_social_or_otp(
            name=payload.name or "OTP User",
            phone=phone,
            role=payload.role,
            email=generated_email,
        )
    referral = await create_referral_if_missing(db, user)
    user["referral_code"] = referral.get("code")

    refresh_token = create_refresh_token_for_user(user["id"], user["role"])
    await store_refresh_token(user["id"], refresh_token, request)
    return auth_response_for_user(user, refresh_token=refresh_token)


@api_router.post("/auth/_legacy/refresh")
async def refresh_access_token_legacy(payload: RefreshTokenRequest, request: Request):
    decoded = decode_refresh_token(payload.refresh_token)
    token_hash = hash_refresh_token_value(payload.refresh_token)
    stored = await db.refresh_tokens.find_one({"token_hash": token_hash, "revoked": False})
    if not stored:
        raise HTTPException(status_code=401, detail="Refresh token revoked")
    if stored.get("expires_at") and stored["expires_at"] < get_ist_now():
        raise HTTPException(status_code=401, detail="Refresh token expired")
    user = await db.users.find_one({"id": decoded["sub"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    await audit_log(
        request=request,
        user_id=user["id"],
        action="AUTH_REFRESH",
        resource="auth",
        success=True,
    )
    return {
        "access_token": create_access_token_for_user(user["id"], user["role"]),
        "token_type": "bearer",
    }


@api_router.post("/auth/_legacy/logout")
async def logout_user_legacy(
    payload: LogoutRequest,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    await revoke_refresh_token(payload.refresh_token)
    await audit_log(
        request=request,
        user_id=current_user["id"],
        action="AUTH_LOGOUT",
        resource="auth",
        success=True,
    )
    return {"message": "Logged out successfully"}

@api_router.get("/auth/_legacy/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(
        id=current_user["id"],
        email=current_user["email"],
        name=current_user["name"],
        phone=current_user["phone"],
        role=current_user["role"],
        gender=current_user.get("gender"),
        referral_code=str(current_user.get("referral_code") or "").strip().upper() or None,
        created_at=current_user["created_at"]
    )

def require_passenger(current_user: Dict[str, Any]) -> None:
    if current_user.get("role") != UserRole.PASSENGER:
        raise HTTPException(status_code=403, detail="Only passengers can access this feature")

def require_driver(current_user: Dict[str, Any]) -> None:
    if current_user.get("role") != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can access this feature")

def safe_upload_filename(original_name: str, prefix: str) -> str:
    suffix = Path(str(original_name or "upload")).suffix.lower()
    if suffix not in {".jpg", ".jpeg", ".png", ".webp", ".pdf"}:
        suffix = ".bin"
    safe_prefix = re.sub(r"[^a-zA-Z0-9_-]+", "-", prefix).strip("-") or "upload"
    return f"{safe_prefix}-{uuid.uuid4().hex}{suffix}"

def normalize_upload_storage_backend(value: Optional[str]) -> str:
    backend = str(value or "").strip().lower()
    if backend in {"s3", "object", "object-storage", "object_storage"}:
        return "s3"
    if backend in {"mongo", "mongodb", "db", "database"}:
        return "mongo"
    return "local"

_upload_s3_client = None

def get_upload_s3_client():
    global _upload_s3_client
    if boto3 is None:
        raise HTTPException(status_code=500, detail="S3 upload storage dependency is not available")
    if not UPLOADS_OBJECT_BUCKET:
        raise HTTPException(status_code=500, detail="UPLOADS_S3_BUCKET must be configured for S3 upload storage")
    if _upload_s3_client is None:
        kwargs: Dict[str, Any] = {}
        if UPLOADS_OBJECT_REGION:
            kwargs["region_name"] = UPLOADS_OBJECT_REGION
        if UPLOADS_OBJECT_ENDPOINT_URL:
            kwargs["endpoint_url"] = UPLOADS_OBJECT_ENDPOINT_URL
        _upload_s3_client = boto3.client("s3", **kwargs)
    return _upload_s3_client

def build_upload_object_key(target_dir: Path, filename: str) -> str:
    try:
        relative_path = target_dir.resolve().relative_to(UPLOADS_DIR.resolve())
        path_parts = [part for part in relative_path.parts if part and part != "."]
    except ValueError:
        safe_path = re.sub(r"[^a-zA-Z0-9_/-]+", "-", str(target_dir)).strip("/-")
        path_parts = [part for part in safe_path.split("/") if part]
    parts = [UPLOADS_OBJECT_PREFIX, *path_parts, filename]
    return "/".join(part.strip("/") for part in parts if part and part.strip("/"))

def response_download_headers(filename: str, as_attachment: bool = True) -> Dict[str, str]:
    safe_name = Path(str(filename or "download")).name.replace('"', "") or "download"
    disposition = "attachment" if as_attachment else "inline"
    return {"Content-Disposition": f'{disposition}; filename="{safe_name}"'}

def mask_document_number(document_number: str) -> str:
    cleaned = re.sub(r"\s+", "", str(document_number or ""))
    if len(cleaned) <= 4:
        return "*" * len(cleaned)
    return f"{'*' * max(0, len(cleaned) - 4)}{cleaned[-4:]}"

def without_mongo_id(document: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not document:
        return {}
    result = dict(document)
    result.pop("_id", None)
    return result


def build_driver_kyc_response(document: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not document:
        return {"status": "not_submitted"}
    result = without_mongo_id(document)
    raw_aadhaar = result.pop("aadhaar_number", None)
    result.pop("aadhaar_number_encrypted", None)
    masked_aadhaar = result.get("aadhaar_number_masked") or (
        mask_document_number(raw_aadhaar) if raw_aadhaar else ""
    )
    result["aadhaar_number_masked"] = masked_aadhaar
    result["aadhaar_number"] = masked_aadhaar
    return result

async def build_passenger_profile_response(user: Dict[str, Any]) -> Dict[str, Any]:
    profile = without_mongo_id(await db.passenger_profiles.find_one({"user_id": user["id"]}))
    total_rides = await db.bookings.count_documents({"passenger_id": user["id"]})
    completed_rides = await db.bookings.count_documents(
        {"passenger_id": user["id"], "status": BookingStatus.COMPLETED}
    )
    return {
        "id": user.get("id"),
        "name": user.get("name"),
        "email": user.get("email"),
        "phone": user.get("phone"),
        "profile_photo": profile.get("profile_photo"),
        "rating": float(profile.get("rating", 5.0) or 5.0),
        "total_rides": int(profile.get("total_rides", total_rides) or total_rides),
        "completed_rides": completed_rides,
        "account_status": user.get("account_status", "active"),
        "preferred_language": normalize_language_code(profile.get("preferred_language"), default="en"),
        "notifications_enabled": bool(profile.get("notifications_enabled", True)),
        "email_notifications": bool(profile.get("email_notifications", True)),
        "ride_sharing_enabled": bool(profile.get("ride_sharing_enabled", False)),
        "created_at": user.get("created_at"),
        "updated_at": profile.get("updated_at") or user.get("updated_at"),
    }

async def save_upload_file(
    upload: UploadFile,
    target_dir: Path,
    prefix: str,
    max_bytes: int = 5 * 1024 * 1024,
    storage_backend: Optional[str] = None,
) -> Dict[str, Any]:
    contents = await upload.read()
    if len(contents) > max_bytes:
        raise HTTPException(status_code=400, detail="File size must be less than 5MB")
    filename = safe_upload_filename(upload.filename or "upload", prefix)
    original_filename = upload.filename or filename
    content_type = upload.content_type or "application/octet-stream"
    backend = normalize_upload_storage_backend(storage_backend or UPLOAD_STORAGE_BACKEND)

    if backend == "s3" and not UPLOADS_OBJECT_BUCKET:
        backend = "mongo"

    if backend == "s3":
        object_key = build_upload_object_key(target_dir, filename)
        try:
            await asyncio.to_thread(
                get_upload_s3_client().put_object,
                Bucket=UPLOADS_OBJECT_BUCKET,
                Key=object_key,
                Body=contents,
                ContentType=content_type,
                Metadata={"original_filename": original_filename[:1024]},
            )
        except (BotoCoreError, ClientError) as exc:
            logger.error("S3 upload failed: %s", exc)
            raise HTTPException(status_code=502, detail="Upload storage is temporarily unavailable")
        return {
            "filename": filename,
            "original_filename": original_filename,
            "content_type": content_type,
            "size": len(contents),
            "path": object_key,
            "storage_backend": "s3",
            "storage_key": object_key,
            "storage_bucket": UPLOADS_OBJECT_BUCKET,
        }

    if backend == "mongo":
        storage_id = f"upload-{uuid.uuid4()}"
        await db.upload_files.insert_one(
            {
                "id": storage_id,
                "stored_filename": filename,
                "original_filename": original_filename,
                "content_type": content_type,
                "size": len(contents),
                "data": Binary(contents),
                "created_at": get_ist_now(),
            }
        )
        return {
            "filename": filename,
            "original_filename": original_filename,
            "content_type": content_type,
            "size": len(contents),
            "path": storage_id,
            "storage_backend": "mongo",
            "storage_id": storage_id,
        }

    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / filename
    target_path.write_bytes(contents)
    return {
        "filename": filename,
        "original_filename": original_filename,
        "content_type": content_type,
        "size": len(contents),
        "path": str(target_path),
        "storage_backend": "local",
    }

async def delete_stored_upload(
    document: Optional[Dict[str, Any]],
    target_dir: Path,
    stored_filename_field: str = "stored_filename",
    storage_backend_field: str = "storage_backend",
    storage_id_field: str = "storage_id",
    storage_key_field: str = "storage_key",
) -> None:
    if not document:
        return
    backend = normalize_upload_storage_backend(document.get(storage_backend_field))
    if backend == "s3" and document.get(storage_key_field):
        try:
            await asyncio.to_thread(
                get_upload_s3_client().delete_object,
                Bucket=str(document.get("storage_bucket") or UPLOADS_OBJECT_BUCKET),
                Key=str(document.get(storage_key_field)),
            )
        except (BotoCoreError, ClientError) as exc:
            logger.warning("Failed to delete S3 upload %s: %s", document.get(storage_key_field), exc)
        return
    if backend == "mongo" and document.get(storage_id_field):
        await db.upload_files.delete_one({"id": document.get(storage_id_field)})
        return

    stored_filename = Path(str(document.get(stored_filename_field) or "")).name
    if not stored_filename:
        return
    target = target_dir / stored_filename
    if target.exists() and target.is_file():
        target.unlink()

async def stored_upload_response(
    document: Dict[str, Any],
    target_dir: Path,
    filename: Optional[str] = None,
    stored_filename_field: str = "stored_filename",
    storage_backend_field: str = "storage_backend",
    storage_id_field: str = "storage_id",
    storage_key_field: str = "storage_key",
    as_attachment: bool = True,
) -> Response:
    backend = normalize_upload_storage_backend(document.get(storage_backend_field))
    download_name = filename or document.get("filename") or document.get(stored_filename_field) or "download"
    media_type = document.get("content_type") or "application/octet-stream"

    if backend == "s3" and document.get(storage_key_field):
        key = str(document.get(storage_key_field))
        bucket = str(document.get("storage_bucket") or UPLOADS_OBJECT_BUCKET)
        try:
            def read_object():
                response = get_upload_s3_client().get_object(Bucket=bucket, Key=key)
                stream = response["Body"]
                try:
                    body = stream.read()
                finally:
                    stream.close()
                return body, response.get("ContentType") or media_type

            contents, resolved_media_type = await asyncio.to_thread(read_object)
        except (BotoCoreError, ClientError) as exc:
            logger.warning("S3 upload fetch failed for %s: %s", key, exc)
            raise HTTPException(status_code=404, detail="Uploaded file not found")
        return Response(
            content=contents,
            media_type=resolved_media_type,
            headers=response_download_headers(download_name, as_attachment),
        )

    if backend == "mongo" and document.get(storage_id_field):
        stored = await db.upload_files.find_one({"id": document.get(storage_id_field)}, {"_id": 0})
        if not stored:
            raise HTTPException(status_code=404, detail="Uploaded file not found")
        contents = bytes(stored.get("data") or b"")
        return Response(
            content=contents,
            media_type=stored.get("content_type") or media_type,
            headers=response_download_headers(download_name, as_attachment),
        )

    stored_filename = Path(str(document.get(stored_filename_field) or "")).name
    target = target_dir / stored_filename
    if not stored_filename or not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="Uploaded file not found")
    if as_attachment:
        return FileResponse(target, filename=download_name)
    return FileResponse(target, media_type=media_type)

def without_upload_storage_fields(document: Dict[str, Any]) -> Dict[str, Any]:
    result = without_mongo_id(document)
    for internal_key in ["storage_backend", "storage_id", "storage_key", "storage_bucket", "path"]:
        result.pop(internal_key, None)
    return result

DRIVER_DOCUMENT_TYPES: Dict[str, Dict[str, Any]] = {
    "driver_license": {"label": "Driver License", "expires": True, "renewal_window_days": 30},
    "vehicle_registration": {"label": "Vehicle Registration", "expires": True, "renewal_window_days": 30},
    "vehicle_insurance": {"label": "Vehicle Insurance", "expires": True, "renewal_window_days": 30},
    "pollution_certificate": {"label": "Pollution Certificate", "expires": True, "renewal_window_days": 30},
    "aadhar": {"label": "Aadhar/ID Proof", "expires": False, "renewal_window_days": 0},
    "pan": {"label": "PAN Card", "expires": False, "renewal_window_days": 0},
    "selfie": {"label": "Selfie/Liveness Photo", "expires": False, "renewal_window_days": 0},
}

def normalize_driver_doc_type(doc_type: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9_-]+", "_", str(doc_type or "")).strip("_").lower()
    if normalized == "insurance_policy":
        normalized = "vehicle_insurance"
    if normalized not in DRIVER_DOCUMENT_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported driver document type")
    return normalized

def normalize_expiry_date(expiry_date: Optional[str]) -> Optional[str]:
    if isinstance(expiry_date, datetime):
        return expiry_date.date().isoformat()
    cleaned = str(expiry_date or "").strip()
    if not cleaned:
        return None
    try:
        return datetime.strptime(cleaned, "%Y-%m-%d").date().isoformat()
    except ValueError:
        raise HTTPException(status_code=400, detail="expiry_date must use YYYY-MM-DD format")

def driver_document_status(document: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    if not document:
        return {"days_until_expiry": None, "is_expired": False, "is_expiring_soon": False, "reminder_due": False}

    expiry_date = normalize_expiry_date(document.get("expiry_date"))
    if not expiry_date:
        return {"days_until_expiry": None, "is_expired": False, "is_expiring_soon": False, "reminder_due": False}

    expiry = datetime.strptime(expiry_date, "%Y-%m-%d").date()
    today = get_ist_now().date()
    days_left = (expiry - today).days
    window = int(DRIVER_DOCUMENT_TYPES.get(document.get("doc_type"), {}).get("renewal_window_days", 30) or 30)
    return {
        "days_until_expiry": days_left,
        "is_expired": days_left < 0,
        "is_expiring_soon": 0 <= days_left <= window,
        "reminder_due": days_left <= window,
    }

def build_driver_document_response(document: Optional[Dict[str, Any]], request: Optional[Request] = None, doc_type: Optional[str] = None) -> Dict[str, Any]:
    resolved_type = normalize_driver_doc_type(doc_type or (document or {}).get("doc_type"))
    config = DRIVER_DOCUMENT_TYPES[resolved_type]
    base: Dict[str, Any] = {
        "id": None,
        "type": resolved_type,
        "doc_type": resolved_type,
        "label": config["label"],
        "status": "pending",
        "verification_status": "pending",
        "expiry": None,
        "expiry_date": None,
        "lastUpdated": None,
        "uploaded_at": None,
        "filename": None,
        "content_type": None,
        "size": None,
        "download_url": None,
        "reject_reason": None,
        "requires_expiry": bool(config["expires"]),
    }

    if document:
        base.update(without_mongo_id(document))
        for internal_key in ["storage_backend", "storage_id", "storage_key", "storage_bucket", "path"]:
            base.pop(internal_key, None)
        base["type"] = resolved_type
        base["doc_type"] = resolved_type
        base["label"] = config["label"]
        base["status"] = document.get("verification_status") or document.get("status") or "pending"
        base["verification_status"] = base["status"]
        base["expiry_date"] = normalize_expiry_date(document.get("expiry_date"))
        base["expiry"] = base["expiry_date"]
        base["lastUpdated"] = document.get("updated_at") or document.get("uploaded_at")
        base["requires_expiry"] = bool(config["expires"])
        if request and document.get("stored_filename"):
            base["download_url"] = (
                f"{str(request.base_url).rstrip('/')}/api/drivers/documents/{resolved_type}/download"
            )

    base.update(driver_document_status(base))
    return base

async def get_driver_documents_map(driver_id: str, request: Request) -> Dict[str, Dict[str, Any]]:
    rows = await db.driver_documents.find({"driver_id": driver_id}).to_list(100)
    by_type = {
        normalize_driver_doc_type(row.get("doc_type")): row
        for row in rows
        if row.get("doc_type")
    }
    return {
        doc_type: build_driver_document_response(by_type.get(doc_type), request, doc_type)
        for doc_type in DRIVER_DOCUMENT_TYPES
    }

def build_driver_document_reminders(documents: Dict[str, Dict[str, Any]]) -> List[Dict[str, Any]]:
    reminders = []
    for doc_type, document in documents.items():
        if not document.get("requires_expiry") or not document.get("expiry_date"):
            continue
        if document.get("reminder_due"):
            reminders.append(
                {
                    "doc_type": doc_type,
                    "label": document.get("label"),
                    "expiry_date": document.get("expiry_date"),
                    "days_until_expiry": document.get("days_until_expiry"),
                    "is_expired": document.get("is_expired"),
                    "message": (
                        "Expired document requires renewal"
                        if document.get("is_expired")
                        else f"Renewal due in {document.get('days_until_expiry')} days"
                    ),
                }
            )
    return sorted(reminders, key=lambda item: item.get("days_until_expiry") or 0)

def build_driver_readiness_issue(code: str, message: str, tab: str, severity: str = "blocker") -> Dict[str, Any]:
    return {
        "code": code,
        "message": message,
        "tab": tab,
        "severity": severity,
    }

def is_driver_vehicle_ready(vehicle: Optional[Dict[str, Any]]) -> bool:
    if not vehicle:
        return False
    required_fields = ["license_plate", "registration_number", "vehicle_type", "seating_capacity"]
    return all(bool(vehicle.get(field_name)) for field_name in required_fields)

async def build_driver_ready_to_drive_status(
    driver_id: str,
    current_user: Dict[str, Any],
    request: Request,
) -> Dict[str, Any]:
    driver_profile = await db.drivers.find_one({"user_id": driver_id}, {"_id": 0}) or {}
    kyc_doc = await db.driver_kyc.find_one({"driver_id": driver_id}, {"_id": 0}) or {}
    kyc_status = str(enum_response_value(kyc_doc.get("status") or driver_profile.get("kyc_status") or "not_submitted")).lower()
    blockers: List[Dict[str, Any]] = []
    warnings: List[Dict[str, Any]] = []

    if kyc_status != KYCStatus.APPROVED.value:
        blockers.append(
            build_driver_readiness_issue(
                "kyc_not_approved",
                "KYC must be approved before you can receive ride matches.",
                "trust",
            )
        )

    vehicles = await db.driver_vehicles.find({"driver_id": driver_id}, {"_id": 0}).to_list(50)
    active_vehicle = next((vehicle for vehicle in vehicles if vehicle.get("is_active")), None)
    if not vehicles:
        blockers.append(
            build_driver_readiness_issue(
                "missing_vehicle",
                "Add a vehicle before going online.",
                "vehicle",
            )
        )
    elif not active_vehicle:
        blockers.append(
            build_driver_readiness_issue(
                "no_active_vehicle",
                "Activate one vehicle before going online.",
                "vehicle",
            )
        )
    elif not is_driver_vehicle_ready(active_vehicle):
        blockers.append(
            build_driver_readiness_issue(
                "incomplete_vehicle",
                "Complete license plate, registration, type, and seating details for the active vehicle.",
                "vehicle",
            )
        )
    else:
        profile_vehicle_info = driver_profile.get("vehicle_info")
        if not isinstance(profile_vehicle_info, dict) or not profile_vehicle_info.get("vehicle_number"):
            await sync_driver_primary_vehicle(driver_id, active_vehicle)
            driver_profile["vehicle_info"] = build_driver_vehicle_info(active_vehicle)

    documents = await get_driver_documents_map(driver_id, request)
    missing_documents = []
    rejected_documents = []
    pending_documents = []
    expired_documents = []
    expiring_documents = []
    for document in documents.values():
        label = document.get("label") or document.get("doc_type") or "Document"
        doc_type = document.get("doc_type") or document.get("type")
        status_value = str(document.get("verification_status") or document.get("status") or "pending").lower()
        has_file = bool(document.get("id") or document.get("filename") or document.get("download_url"))
        if not has_file:
            missing_documents.append(document)
            blockers.append(
                build_driver_readiness_issue(
                    f"missing_document_{doc_type}",
                    f"Upload {label}.",
                    "documents",
                )
            )
            continue
        if status_value == "rejected":
            rejected_documents.append(document)
            blockers.append(
                build_driver_readiness_issue(
                    f"rejected_document_{doc_type}",
                    f"Replace rejected {label}.",
                    "documents",
                )
            )
        elif status_value != "approved":
            pending_documents.append(document)
            blockers.append(
                build_driver_readiness_issue(
                    f"pending_document_{doc_type}",
                    f"{label} is waiting for approval.",
                    "documents",
                )
            )
        if document.get("is_expired"):
            expired_documents.append(document)
            blockers.append(
                build_driver_readiness_issue(
                    f"expired_document_{doc_type}",
                    f"Renew expired {label}.",
                    "documents",
                )
            )
        elif document.get("is_expiring_soon"):
            expiring_documents.append(document)
            warnings.append(
                build_driver_readiness_issue(
                    f"expiring_document_{doc_type}",
                    f"{label} expires soon.",
                    "documents",
                    severity="warning",
                )
            )

    if not str(current_user.get("name") or "").strip():
        blockers.append(build_driver_readiness_issue("missing_name", "Add your legal name.", "profile"))
    if not str(current_user.get("phone") or "").strip():
        blockers.append(build_driver_readiness_issue("missing_phone", "Add a verified phone number.", "profile"))
    if not driver_profile.get("profile_photo"):
        warnings.append(
            build_driver_readiness_issue(
                "missing_profile_photo",
                "Add a driver profile photo.",
                "profile",
                severity="warning",
            )
        )
    if not driver_profile.get("emergency_contact_verified"):
        warnings.append(
            build_driver_readiness_issue(
                "missing_emergency_contact",
                "Add and verify an emergency contact.",
                "profile",
                severity="warning",
            )
        )

    tab_priority = ["trust", "vehicle", "documents", "profile", "subscription"]
    next_tab = None
    for tab in tab_priority:
        if any(issue.get("tab") == tab for issue in blockers):
            next_tab = tab
            break
    if not next_tab and warnings:
        next_tab = warnings[0].get("tab")

    ready = len(blockers) == 0
    first_blocker = blockers[0] if blockers else None
    message = (
        "Ready to Drive checks passed."
        if ready
        else first_blocker.get("message") if first_blocker else "Complete Ready to Drive requirements before going online."
    )

    return {
        "ready": ready,
        "message": message,
        "next_tab": next_tab,
        "blockers": blockers,
        "warnings": warnings,
        "checks": {
            "kyc_status": kyc_status,
            "documents": {
                "missing_count": len(missing_documents),
                "rejected_count": len(rejected_documents),
                "pending_count": len(pending_documents),
                "expired_count": len(expired_documents),
                "expiring_count": len(expiring_documents),
                "required_count": len(DRIVER_DOCUMENT_TYPES),
            },
            "vehicle": {
                "vehicle_count": len(vehicles),
                "active_vehicle_id": active_vehicle.get("id") if active_vehicle else None,
                "ready": bool(active_vehicle and is_driver_vehicle_ready(active_vehicle)),
            },
            "profile": {
                "has_name": bool(str(current_user.get("name") or "").strip()),
                "has_phone": bool(str(current_user.get("phone") or "").strip()),
                "has_profile_photo": bool(driver_profile.get("profile_photo")),
                "has_emergency_contact": bool(driver_profile.get("emergency_contact_verified")),
            },
        },
    }

@api_router.get("/users/profile")
async def get_user_profile(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user["id"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    referral = await create_referral_if_missing(db, user)

    pending_change = await db.phone_change_requests.find_one(
        {"user_id": current_user["id"], "status": "pending_admin_approval"},
        {"_id": 0, "new_phone": 1},
    )
    return {
        "id": user.get("id"),
        "email": user.get("email"),
        "name": user.get("name"),
        "phone": user.get("phone"),
        "role": user.get("role"),
        "gender": user.get("gender"),
        "referral_code": referral.get("code"),
        "created_at": user.get("created_at"),
        "pending_phone_change": pending_change.get("new_phone") if pending_change else None,
    }

@api_router.get("/passengers/profile")
async def get_passenger_profile(current_user: dict = Depends(get_current_user)):
    require_passenger(current_user)
    user = await db.users.find_one({"id": current_user["id"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return {"profile": await build_passenger_profile_response(user)}

@api_router.post("/passengers/profile/update")
async def update_passenger_profile(
    payload: PassengerProfileUpdate,
    current_user: dict = Depends(get_current_user),
):
    require_passenger(current_user)
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        user = await db.users.find_one({"id": current_user["id"]})
        return {"profile": await build_passenger_profile_response(user or current_user)}

    if "email" in update_data:
        existing = await db.users.find_one({"email": update_data["email"], "id": {"$ne": current_user["id"]}})
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
    if "phone" in update_data:
        existing = await db.users.find_one({"phone": update_data["phone"], "id": {"$ne": current_user["id"]}})
        if existing:
            raise HTTPException(status_code=400, detail="Phone number already registered")

    now = get_ist_now()
    await db.users.update_one({"id": current_user["id"]}, {"$set": {**update_data, "updated_at": now}})
    await db.passenger_profiles.update_one(
        {"user_id": current_user["id"]},
        {"$set": {"updated_at": now}, "$setOnInsert": {"user_id": current_user["id"], "created_at": now}},
        upsert=True,
    )
    user = await db.users.find_one({"id": current_user["id"]})
    return {"profile": await build_passenger_profile_response(user)}

@api_router.post("/passengers/profile/preferences")
async def update_passenger_profile_preferences(
    payload: PassengerProfilePreferencesUpdate,
    current_user: dict = Depends(get_current_user),
):
    require_passenger(current_user)
    update_data = payload.model_dump(exclude_unset=True)
    now = get_ist_now()
    await db.passenger_profiles.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {**update_data, "updated_at": now},
            "$setOnInsert": {"user_id": current_user["id"], "created_at": now},
        },
        upsert=True,
    )
    user = await db.users.find_one({"id": current_user["id"]})
    return {"profile": await build_passenger_profile_response(user or current_user)}

@api_router.post("/passengers/profile/photo")
async def upload_passenger_profile_photo(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    require_passenger(current_user)
    saved = await save_upload_file(
        file,
        PASSENGER_PROFILE_PHOTO_DIR / current_user["id"],
        current_user["id"],
        storage_backend=PASSENGER_UPLOAD_STORAGE_BACKEND,
    )
    photo_url = f"{str(request.base_url).rstrip('/')}/api/passengers/profile/photo/{saved['filename']}"
    now = get_ist_now()
    existing = await db.passenger_profiles.find_one(
        {"user_id": current_user["id"]},
        {
            "_id": 0,
            "user_id": 1,
            "profile_photo_filename": 1,
            "profile_photo_storage_backend": 1,
            "profile_photo_storage_id": 1,
            "profile_photo_storage_key": 1,
            "storage_bucket": 1,
        },
    )
    await db.passenger_profiles.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "profile_photo": photo_url,
                "profile_photo_filename": saved["filename"],
                "profile_photo_storage_backend": saved.get("storage_backend"),
                "profile_photo_storage_id": saved.get("storage_id"),
                "profile_photo_storage_key": saved.get("storage_key"),
                "storage_bucket": saved.get("storage_bucket"),
                "updated_at": now,
            },
            "$setOnInsert": {"user_id": current_user["id"], "created_at": now},
        },
        upsert=True,
    )
    if existing and (
        existing.get("profile_photo_filename") != saved["filename"]
        or existing.get("profile_photo_storage_id") != saved.get("storage_id")
        or existing.get("profile_photo_storage_key") != saved.get("storage_key")
    ):
        existing_photo_dir = PASSENGER_PROFILE_PHOTO_DIR / current_user["id"]
        existing_filename = Path(str(existing.get("profile_photo_filename") or "")).name
        if (
            existing_filename
            and not existing.get("profile_photo_storage_backend")
            and (PASSENGER_PROFILE_PHOTO_DIR / existing_filename).exists()
        ):
            existing_photo_dir = PASSENGER_PROFILE_PHOTO_DIR
        await delete_stored_upload(
            existing,
            existing_photo_dir,
            stored_filename_field="profile_photo_filename",
            storage_backend_field="profile_photo_storage_backend",
            storage_id_field="profile_photo_storage_id",
            storage_key_field="profile_photo_storage_key",
        )
    return {"profile_photo": photo_url}

@api_router.get("/passengers/profile/photo/{filename}")
async def get_passenger_profile_photo(filename: str):
    safe_name = Path(filename).name
    document = await db.passenger_profiles.find_one(
        {"profile_photo_filename": safe_name},
        {
            "_id": 0,
            "user_id": 1,
            "profile_photo_filename": 1,
            "profile_photo_storage_backend": 1,
            "profile_photo_storage_id": 1,
            "profile_photo_storage_key": 1,
            "storage_bucket": 1,
        },
    )
    if not document:
        raise HTTPException(status_code=404, detail="Profile photo not found")
    target_dir = PASSENGER_PROFILE_PHOTO_DIR / document["user_id"]
    if (
        not document.get("profile_photo_storage_backend")
        and (PASSENGER_PROFILE_PHOTO_DIR / safe_name).exists()
    ):
        target_dir = PASSENGER_PROFILE_PHOTO_DIR
    return await stored_upload_response(
        document,
        target_dir,
        filename=safe_name,
        stored_filename_field="profile_photo_filename",
        storage_backend_field="profile_photo_storage_backend",
        storage_id_field="profile_photo_storage_id",
        storage_key_field="profile_photo_storage_key",
        as_attachment=False,
    )

@api_router.delete("/passengers/profile/delete")
async def request_passenger_account_deletion(
    payload: AccountDeletionConfirmation,
    current_user: dict = Depends(get_current_user),
):
    require_passenger(current_user)
    now = get_ist_now()
    await db.account_deletion_requests.update_one(
        {"user_id": current_user["id"], "status": "pending"},
        {
            "$set": {
                "updated_at": now,
                "confirmation": payload.confirmation,
                "name": current_user.get("name"),
                "email": current_user.get("email"),
                "phone": current_user.get("phone"),
                "role": current_user.get("role"),
            },
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "user_id": current_user["id"],
                "status": "pending",
                "created_at": now,
            },
        },
        upsert=True,
    )
    await db.users.update_one(
        {"id": current_user["id"]},
        {"$set": {"account_status": "deletion_pending", "updated_at": now}},
    )
    return {"success": True, "message": "Account deletion request submitted for review"}

@api_router.get("/passengers/kyc/status")
async def get_passenger_kyc_status(current_user: dict = Depends(get_current_user)):
    require_passenger(current_user)
    kyc = without_mongo_id(await db.passenger_kyc.find_one({"user_id": current_user["id"]}))
    if not kyc:
        return {
            "is_verified": False,
            "verification_level": "unverified",
            "document_type": "",
            "document_number": "",
            "verification_date": None,
            "expiry_date": None,
        }
    return {
        "is_verified": bool(kyc.get("is_verified", False)),
        "verification_level": kyc.get("verification_level", "pending"),
        "status": kyc.get("status", kyc.get("verification_level", "pending")),
        "document_type": kyc.get("document_type", ""),
        "document_number": kyc.get("document_number_masked", ""),
        "verification_date": kyc.get("verification_date"),
        "expiry_date": kyc.get("expiry_date"),
        "submitted_at": kyc.get("submitted_at"),
        "reject_reason": kyc.get("reject_reason"),
    }

@api_router.post("/passengers/kyc/verify")
async def submit_passenger_kyc(
    payload: PassengerKYCVerifyRequest,
    current_user: dict = Depends(get_current_user),
):
    require_passenger(current_user)
    now = get_ist_now()
    encrypted_number = fernet.encrypt(payload.document_number.encode("utf-8")).decode("utf-8")
    await db.passenger_kyc.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "document_type": payload.document_type,
                "document_number_encrypted": encrypted_number,
                "document_number_masked": mask_document_number(payload.document_number),
                "is_verified": False,
                "verification_level": "pending",
                "status": KYCStatus.PENDING,
                "submitted_at": now,
                "updated_at": now,
                "reject_reason": None,
            },
            "$setOnInsert": {"id": str(uuid.uuid4()), "user_id": current_user["id"], "created_at": now},
        },
        upsert=True,
    )
    return await get_passenger_kyc_status(current_user)

@api_router.get("/passengers/documents")
async def get_passenger_documents(current_user: dict = Depends(get_current_user)):
    require_passenger(current_user)
    documents = await db.passenger_documents.find({"user_id": current_user["id"]}).sort("uploaded_at", -1).to_list(100)
    return {"documents": [without_upload_storage_fields(document) for document in documents]}

@api_router.post("/passengers/documents/upload")
async def upload_passenger_document(
    request: Request,
    document_type: str = Form(...),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    require_passenger(current_user)
    doc_type = re.sub(r"[^a-zA-Z0-9_-]+", "_", document_type).strip("_") or "other"
    saved = await save_upload_file(
        file,
        PASSENGER_DOCUMENTS_DIR / current_user["id"],
        doc_type,
        storage_backend=PASSENGER_UPLOAD_STORAGE_BACKEND,
    )
    now = get_ist_now()
    document = {
        "id": f"doc-{uuid.uuid4()}",
        "user_id": current_user["id"],
        "type": doc_type,
        "filename": saved["original_filename"],
        "stored_filename": saved["filename"],
        "content_type": saved["content_type"],
        "size": saved["size"],
        "storage_backend": saved.get("storage_backend"),
        "storage_id": saved.get("storage_id"),
        "storage_key": saved.get("storage_key"),
        "storage_bucket": saved.get("storage_bucket"),
        "download_url": f"{str(request.base_url).rstrip('/')}/api/passengers/documents/{saved['filename']}/download",
        "uploaded_at": now,
        "verified": False,
        "verification_status": "pending",
    }
    await db.passenger_documents.insert_one(document)
    return without_upload_storage_fields(document)

@api_router.get("/passengers/documents/{filename}/download")
async def download_passenger_document(filename: str, current_user: dict = Depends(get_current_user)):
    require_passenger(current_user)
    document = await db.passenger_documents.find_one({"user_id": current_user["id"], "stored_filename": Path(filename).name})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return await stored_upload_response(
        document,
        PASSENGER_DOCUMENTS_DIR / current_user["id"],
        filename=document.get("filename") or document.get("stored_filename"),
        as_attachment=True,
    )

@api_router.delete("/passengers/documents/{document_id}")
async def delete_passenger_document(document_id: str, current_user: dict = Depends(get_current_user)):
    require_passenger(current_user)
    document = await db.passenger_documents.find_one({"user_id": current_user["id"], "id": document_id})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    await db.passenger_documents.delete_one({"user_id": current_user["id"], "id": document_id})
    await delete_stored_upload(document, PASSENGER_DOCUMENTS_DIR / current_user["id"])
    return {"success": True, "message": "Document deleted"}

@api_router.get("/passengers/ratings/eligible-rides")
async def get_passenger_rating_eligible_rides(
    current_user: dict = Depends(get_current_user),
    limit: int = Query(100, ge=1, le=200),
    skip: int = Query(0, ge=0),
):
    require_passenger(current_user)
    query = {
        "passenger_id": current_user["id"],
        "status": {"$in": [BookingStatus.COMPLETED, BookingStatus.COMPLETED.value]},
        "driver_id": {"$exists": True, "$ne": None},
    }
    bookings = await db.bookings.find(query, {"_id": 0}).sort(
        [("trip_completed_at", -1), ("updated_at", -1), ("created_at", -1)]
    ).skip(skip).to_list(limit)

    driver_ids = [booking.get("driver_id") for booking in bookings if booking.get("driver_id")]
    drivers = {
        user["id"]: user
        for user in await db.users.find(
            {"id": {"$in": driver_ids}},
            {"_id": 0, "id": 1, "name": 1, "phone": 1},
        ).to_list(None)
    } if driver_ids else {}

    rides = []
    for booking in bookings:
        driver = drivers.get(booking.get("driver_id")) or {}
        rides.append(
            {
                "id": booking.get("id"),
                "driver_id": booking.get("driver_id"),
                "driver_name": driver.get("name") or booking.get("driver_name") or "Driver",
                "driver_phone": driver.get("phone") or booking.get("driver_phone"),
                "pickup_location": booking.get("pickup_location"),
                "drop_location": booking.get("drop_location"),
                "status": enum_response_value(booking.get("status")),
                "estimated_fare": booking.get("estimated_fare"),
                "final_fare": booking.get("final_fare"),
                "distance_km": booking.get("distance_km"),
                "actual_distance_km": booking.get("actual_distance_km"),
                "payment_method": enum_response_value(booking.get("payment_method")),
                "scheduled_for": booking.get("scheduled_for"),
                "trip_completed_at": booking.get("trip_completed_at"),
                "created_at": booking.get("created_at"),
                "updated_at": booking.get("updated_at"),
            }
        )
    return {"rides": rides, "has_more": len(rides) == limit, "limit": limit, "skip": skip}

@api_router.get("/passengers/receipts")
async def get_passenger_receipts(period: str = "all", current_user: dict = Depends(get_current_user)):
    require_passenger(current_user)
    query: Dict[str, Any] = {"passenger_id": current_user["id"]}
    now = get_ist_now()
    if period == "month":
        query["created_at"] = {"$gte": now - timedelta(days=31)}
    elif period == "quarter":
        query["created_at"] = {"$gte": now - timedelta(days=92)}
    elif period == "year":
        query["created_at"] = {"$gte": now - timedelta(days=366)}

    bookings = await db.bookings.find(query).sort("created_at", -1).to_list(200)
    driver_ids = [booking.get("driver_id") for booking in bookings if booking.get("driver_id")]
    users = {user["id"]: user for user in await db.users.find({"id": {"$in": driver_ids}}).to_list(None)} if driver_ids else {}
    receipts = []
    for booking in bookings:
        fare = round(float(booking.get("final_fare") or booking.get("estimated_fare") or 0), 2)
        distance_km = round(float(booking.get("actual_distance_km") or booking.get("distance_km") or 0), 2)
        taxes = round(fare * 0.05, 2) if fare else 0.0
        base_fare = min(fare, 25.0) if fare else 0.0
        distance_fare = max(0.0, round(fare - base_fare - taxes, 2))
        driver = users.get(booking.get("driver_id"))
        created_at = booking.get("trip_completed_at") or booking.get("updated_at") or booking.get("created_at") or now
        receipts.append(
            {
                "id": f"RCP-{str(booking.get('id', ''))[:8].upper()}",
                "booking_id": booking.get("id"),
                "date": created_at,
                "from": (booking.get("pickup_location") or {}).get("address") or "Pickup",
                "to": (booking.get("drop_location") or {}).get("address") or "Drop",
                "driver_name": driver.get("name") if driver else "Driver",
                "distance_km": distance_km,
                "duration_minutes": int(booking.get("duration_minutes") or booking.get("eta_minutes") or 0),
                "base_fare": base_fare,
                "distance_fare": distance_fare,
                "surge_multiplier": float(booking.get("surge_multiplier") or 1.0),
                "taxes": taxes,
                "discount": float(booking.get("discount") or 0),
                "total": fare,
                "payment_method": str(booking.get("payment_method") or "cash").upper(),
                "payment_status": "completed" if booking.get("status") == BookingStatus.COMPLETED else str(booking.get("status") or "pending"),
            }
        )
    return {"receipts": receipts}

@api_router.post("/v1/passengers/bookings/{booking_id}/lost-item")
async def report_passenger_lost_item(
    booking_id: str,
    payload: PassengerLostItemRequest,
    current_user: dict = Depends(get_current_user),
):
    require_passenger(current_user)
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.get("passenger_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="You can report lost items only for your own rides")

    now = get_ist_now()
    lost_item = {
        "id": f"lost-{uuid.uuid4()}",
        "booking_id": booking_id,
        "passenger_id": current_user["id"],
        "driver_id": booking.get("driver_id"),
        "item_type": payload.item_type,
        "description": payload.description,
        "contact": payload.contact,
        "status": "open",
        "created_at": now,
        "updated_at": now,
    }
    await db.passenger_lost_items.insert_one(lost_item)
    await db.bookings.update_one(
        {"id": booking_id},
        {
            "$set": {"lost_item_reported_at": now},
            "$push": {
                "lost_item_reports": {
                    "id": lost_item["id"],
                    "item_type": lost_item["item_type"],
                    "status": lost_item["status"],
                    "created_at": now,
                }
            },
        },
    )
    lost_item.pop("_id", None)
    return {"message": "Lost item report submitted.", "lost_item": lost_item}

@api_router.post("/passengers/support/attachments")
async def upload_support_attachment(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    require_passenger(current_user)
    saved = await save_upload_file(
        file,
        SUPPORT_ATTACHMENTS_DIR / current_user["id"],
        "support",
        storage_backend=PASSENGER_UPLOAD_STORAGE_BACKEND,
    )
    attachment_url = f"{str(request.base_url).rstrip('/')}/api/passengers/support/attachments/{saved['filename']}"
    await db.support_attachments.insert_one(
        {
            "id": f"att-{uuid.uuid4()}",
            "user_id": current_user["id"],
            "role": "passenger",
            "stored_filename": saved["filename"],
            "filename": saved["original_filename"],
            "content_type": saved["content_type"],
            "size": saved["size"],
            "storage_backend": saved.get("storage_backend"),
            "storage_id": saved.get("storage_id"),
            "storage_key": saved.get("storage_key"),
            "storage_bucket": saved.get("storage_bucket"),
            "url": attachment_url,
            "created_at": get_ist_now(),
        }
    )
    return {"attachment_url": attachment_url, "filename": saved["original_filename"]}

@api_router.get("/passengers/support/attachments/{filename}")
async def download_support_attachment(filename: str, current_user: dict = Depends(get_current_user)):
    require_passenger(current_user)
    attachment = await db.support_attachments.find_one(
        {"user_id": current_user["id"], "stored_filename": Path(filename).name}
    )
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return await stored_upload_response(
        attachment,
        SUPPORT_ATTACHMENTS_DIR / current_user["id"],
        filename=attachment.get("filename") or attachment.get("stored_filename"),
        as_attachment=True,
    )

@api_router.post("/passengers/subscription/cancel")
async def cancel_passenger_subscription(current_user: dict = Depends(get_current_user)):
    require_passenger(current_user)
    now = get_ist_now()
    await db.users.update_one(
        {"id": current_user["id"]},
        {
            "$set": {
                "subscription.plan_type": None,
                "subscription.is_active": False,
                "subscription.activated_by_admin": False,
                "subscription.cancelled_at": now,
                "subscription.activation_note": "Cancelled by passenger",
            }
        },
    )
    refreshed = await db.users.find_one({"id": current_user["id"]})
    config = await get_subscription_config()
    return {"message": "Subscription cancelled", "subscription": serialize_subscription_for_response(refreshed, config)}

@api_router.put("/users/change-password")
async def change_user_password(
    payload: PasswordChangeRequest,
    current_user: dict = Depends(get_current_user),
):
    user = await db.users.find_one({"id": current_user["id"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if not verify_password(payload.current_password, str(user.get("password_hash") or "")):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    await db.users.update_one(
        {"id": current_user["id"]},
        {
            "$set": {
                "password_hash": hash_password(payload.new_password),
                "updated_at": get_ist_now(),
            }
        },
    )
    return {"success": True, "message": "Password changed successfully"}

@api_router.get("/users/security/2fa")
async def get_two_factor_status(current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0, "two_factor_enabled": 1, "two_factor_enabled_at": 1})
    return {
        "enabled": bool(user and user.get("two_factor_enabled")),
        "enabled_at": user.get("two_factor_enabled_at") if user else None,
        "method": "otp",
    }

@api_router.post("/users/security/2fa/request")
async def request_two_factor_setup(current_user: dict = Depends(get_current_user)):
    otp_code = f"{random.randint(100000, 999999)}"
    now = get_ist_now()
    expires_at = now + timedelta(minutes=10)
    await db.users.update_one(
        {"id": current_user["id"]},
        {
            "$set": {
                "two_factor_pending_otp_hash": hash_password(otp_code),
                "two_factor_pending_expires_at": expires_at,
                "updated_at": now,
            }
        },
    )
    response = {"success": True, "message": "Verification code sent", "expires_in_seconds": 600}
    if ENVIRONMENT != "production":
        response["otp_demo"] = otp_code
    return response

@api_router.post("/users/security/2fa/verify")
async def verify_two_factor_setup(payload: TwoFactorVerifyRequest, current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user["id"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    expires_at = user.get("two_factor_pending_expires_at")
    if not expires_at or expires_at < get_ist_now():
        raise HTTPException(status_code=400, detail="Verification code expired")
    otp_hash = str(user.get("two_factor_pending_otp_hash") or "")
    if not otp_hash or not verify_password(payload.otp, otp_hash):
        raise HTTPException(status_code=401, detail="Invalid verification code")

    now = get_ist_now()
    await db.users.update_one(
        {"id": current_user["id"]},
        {
            "$set": {"two_factor_enabled": True, "two_factor_enabled_at": now, "updated_at": now},
            "$unset": {"two_factor_pending_otp_hash": "", "two_factor_pending_expires_at": ""},
        },
    )
    await cache_delete(f"driver_profile:{current_user['id']}")
    return {"success": True, "enabled": True, "message": "Two-factor authentication enabled"}

@api_router.post("/users/security/2fa/disable")
async def disable_two_factor(payload: TwoFactorDisableRequest, current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": current_user["id"]})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not verify_password(payload.current_password, str(user.get("password_hash") or "")):
        raise HTTPException(status_code=401, detail="Current password is incorrect")
    now = get_ist_now()
    await db.users.update_one(
        {"id": current_user["id"]},
        {
            "$set": {"two_factor_enabled": False, "updated_at": now},
            "$unset": {
                "two_factor_enabled_at": "",
                "two_factor_pending_otp_hash": "",
                "two_factor_pending_expires_at": "",
            },
        },
    )
    await cache_delete(f"driver_profile:{current_user['id']}")
    return {"success": True, "enabled": False, "message": "Two-factor authentication disabled"}

@api_router.get("/users/security/login-history")
async def get_login_history(current_user: dict = Depends(get_current_user)):
    sessions = await db.refresh_tokens.find(
        {"user_id": current_user["id"]},
        {"_id": 0, "id": 1, "ip": 1, "user_agent": 1, "created_at": 1, "revoked": 1, "revoked_at": 1, "expires_at": 1},
    ).sort("created_at", -1).limit(20).to_list(20)
    return {
        "logins": [
            {
                "id": item.get("id"),
                "ip": item.get("ip", "unknown"),
                "user_agent": item.get("user_agent", ""),
                "created_at": item.get("created_at"),
                "revoked": bool(item.get("revoked", False)),
                "revoked_at": item.get("revoked_at"),
                "expires_at": item.get("expires_at"),
                "status": "signed_out" if item.get("revoked") else "active",
            }
            for item in sessions
        ]
    }

@api_router.post("/users/request-phone-change")
async def request_phone_change(
    payload: PhoneChangeRequest,
    current_user: dict = Depends(get_current_user),
):
    new_phone = normalize_phone(payload.new_phone)
    if new_phone == current_user.get("phone"):
        raise HTTPException(status_code=400, detail="New phone must be different from current phone")

    existing_user = await db.users.find_one({"phone": new_phone, "id": {"$ne": current_user["id"]}})
    if existing_user:
        raise HTTPException(status_code=400, detail="Phone number already registered")

    otp_code = f"{random.randint(100000, 999999)}"
    now = get_ist_now()
    otp_expiry = now + timedelta(minutes=max(1, OTP_EXPIRY_MINUTES))
    await db.phone_change_requests.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "user_id": current_user["id"],
                "new_phone": new_phone,
                "otp_hash": hash_password(otp_code),
                "otp_expiry": otp_expiry,
                "verified": False,
                "status": "otp_sent",
                "updated_at": now,
                "reviewed_at": None,
                "reviewed_by": None,
                "reject_reason": None,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )

    logger.info("Phone change OTP for user %s to %s generated", current_user["id"], new_phone)
    response = {"success": True, "message": f"OTP sent to {new_phone}"}
    if ENVIRONMENT != "production":
        response["otp_demo"] = otp_code
        response["expires_in_seconds"] = max(60, OTP_EXPIRY_MINUTES * 60)
    return response

@api_router.post("/users/request-phone-change-admin")
async def request_phone_change_admin(
    payload: PhoneChangeRequest,
    current_user: dict = Depends(get_current_user),
):
    new_phone = normalize_phone(payload.new_phone)
    if new_phone == current_user.get("phone"):
        raise HTTPException(status_code=400, detail="New phone must be different from current phone")

    existing_user = await db.users.find_one({"phone": new_phone, "id": {"$ne": current_user["id"]}})
    if existing_user:
        raise HTTPException(status_code=400, detail="Phone number already registered")

    now = get_ist_now()
    await db.phone_change_requests.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "user_id": current_user["id"],
                "new_phone": new_phone,
                "verified": True,
                "verified_at": now,
                "status": "pending_admin_approval",
                "otp_hash": None,
                "otp_expiry": None,
                "updated_at": now,
                "reviewed_at": None,
                "reviewed_by": None,
                "reject_reason": None,
            },
            "$setOnInsert": {"created_at": now},
        },
        upsert=True,
    )
    return {"success": True, "message": "Phone change request submitted for admin approval", "pending_phone": new_phone}

@api_router.post("/users/verify-phone-change")
async def verify_phone_change(
    payload: PhoneChangeVerifyRequest,
    current_user: dict = Depends(get_current_user),
):
    new_phone = normalize_phone(payload.new_phone)
    request_doc = await db.phone_change_requests.find_one({"user_id": current_user["id"]})
    if not request_doc:
        raise HTTPException(status_code=400, detail="No phone change request found")
    if str(request_doc.get("new_phone") or "") != new_phone:
        raise HTTPException(status_code=400, detail="Phone mismatch")

    existing_user = await db.users.find_one({"phone": new_phone, "id": {"$ne": current_user["id"]}})
    if existing_user:
        raise HTTPException(status_code=400, detail="Phone number already registered")

    otp_expiry = request_doc.get("otp_expiry")
    if not otp_expiry or otp_expiry < get_ist_now():
        raise HTTPException(status_code=400, detail="OTP expired")
    otp_hash = str(request_doc.get("otp_hash") or "")
    if not otp_hash or not verify_password(payload.otp, otp_hash):
        raise HTTPException(status_code=401, detail="Invalid OTP")

    now = get_ist_now()
    await db.phone_change_requests.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "verified": True,
                "verified_at": now,
                "status": "pending_admin_approval",
                "updated_at": now,
                "reviewed_at": None,
                "reviewed_by": None,
                "reject_reason": None,
            }
        },
    )
    return {
        "success": True,
        "message": f"Phone change to {new_phone} submitted for admin approval",
        "pending_phone": new_phone,
    }

@api_router.get("/subscriptions/config")
async def get_subscription_plan_config(current_user: dict = Depends(get_current_user)):
    config = await get_subscription_config()
    if current_user["role"] == UserRole.ADMIN:
        return config

    role_config = get_role_subscription_config(config, current_user["role"])
    effective_role_config = build_effective_role_subscription_config(role_config)
    return {
        "role": current_user["role"],
        "plans": effective_role_config,
        "updated_at": config.updated_at,
    }

@api_router.get("/subscriptions/me")
async def get_my_subscription(current_user: dict = Depends(get_current_user)):
    config = await get_subscription_config()
    dues = await db.subscription_dues.find(
        {
            "user_id": current_user["id"],
            "status": {"$in": ["due", "pending_verification", "rejected"]},
        }
    ).sort("created_at", -1).to_list(200)
    for due in dues:
        due.pop("_id", None)
    fee_settings = await get_registration_fee_settings()
    payment_options = {
        "enable_qr": bool(fee_settings.enable_qr),
        "enable_upi": bool(fee_settings.enable_upi or fee_settings.registration_upi_id),
        "enable_razorpay": bool(fee_settings.enable_razorpay),
        "qr_code_url": fee_settings.registration_qr_code_url,
        "upi_id": fee_settings.registration_upi_id,
        "razorpay_payment_link": fee_settings.razorpay_payment_link,
    }

    return {
        "subscription": serialize_subscription_for_response(current_user, config),
        "pending_dues": dues,
        "payment_options": payment_options,
    }

@api_router.put("/subscriptions/select")
async def select_subscription_plan(
    payload: SubscriptionSelectionRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] == UserRole.ADMIN:
        raise HTTPException(status_code=400, detail="Admin users do not require subscription selection")

    config = await get_subscription_config()
    role_config = get_role_subscription_config(config, current_user["role"])
    if not has_paid_subscription_plan_for_current_period(role_config):
        raise HTTPException(status_code=400, detail="No paid subscription is active for the current period")
    if not is_subscription_plan_active(role_config, payload.plan_type):
        raise HTTPException(status_code=400, detail="Selected plan is not active for your role")

    now = get_ist_now()
    current_subscription = get_user_subscription(current_user)
    selected_plan = payload.plan_type.value

    updated_subscription = {
        **current_subscription,
        "plan_type": selected_plan,
        "is_active": False,
        "activated_by_admin": False,
        "selected_at": now,
        "activated_at": None,
        "activated_by": None,
        "period_started_at": None,
        "period_expires_at": None,
        "activation_note": "Awaiting admin activation",
    }
    if payload.plan_type != SubscriptionPlanType.PER_TRIP:
        updated_subscription["per_trip_completed_rides"] = 0
        updated_subscription["per_trip_charged_cycles"] = 0
    await db.users.update_one({"id": current_user["id"]}, {"$set": {"subscription": updated_subscription}})

    return {
        "message": "Subscription plan selected. Waiting for admin activation.",
        "subscription": updated_subscription,
    }

@api_router.post("/subscriptions/pay-due")
async def pay_subscription_due(
    payload: SubscriptionDuePaymentRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] == UserRole.ADMIN:
        raise HTTPException(status_code=400, detail="Admin users do not have subscription dues")

    subscription = get_user_subscription(current_user)
    outstanding_amount = round(float(subscription.get("outstanding_amount", 0.0) or 0.0), 2)
    if outstanding_amount <= 0:
        return {"message": "No pending subscription due", "outstanding_amount": 0.0}
    fee_settings = await get_registration_fee_settings()
    enabled_methods: List[str] = []
    if fee_settings.enable_qr:
        enabled_methods.append("qr")
    if fee_settings.enable_upi or bool(fee_settings.registration_upi_id):
        enabled_methods.append("upi")
    if fee_settings.enable_razorpay:
        enabled_methods.append("razorpay")
    if not enabled_methods:
        raise HTTPException(status_code=400, detail="Subscription payment methods are not configured by admin.")
    if payload.payment_method not in enabled_methods:
        raise HTTPException(status_code=400, detail="Selected payment method is not enabled by admin.")
    if payload.payment_method in {"qr", "upi"} and not str(payload.payment_utr or "").strip():
        raise HTTPException(status_code=400, detail="UTR number is required for QR/UPI payment.")

    pending_verification = await db.subscription_dues.find_one(
        {"user_id": current_user["id"], "status": "pending_verification"},
        {"_id": 1},
    )
    if pending_verification:
        raise HTTPException(
            status_code=409,
            detail="Payment is already submitted and pending admin verification.",
        )

    open_dues = await db.subscription_dues.find(
        {"user_id": current_user["id"], "status": {"$in": ["due", "rejected"]}}
    ).to_list(500)
    if not open_dues:
        now = get_ist_now()
        fallback_due = {
            "id": str(uuid.uuid4()),
            "user_id": current_user["id"],
            "role": current_user.get("role"),
            "booking_id": None,
            "cycle_number": int(subscription.get("per_trip_charged_cycles", 0) or 0) or 1,
            "plan_type": SubscriptionPlanType.PER_TRIP.value,
            "threshold": int(subscription.get("per_trip_threshold", 10) or 10),
            "amount": outstanding_amount,
            "status": "due",
            "created_at": now,
            "updated_at": now,
        }
        await db.subscription_dues.insert_one(fallback_due)
        open_dues = [fallback_due]

    now = get_ist_now()
    submission_id = str(uuid.uuid4())
    open_due_ids = [str(item.get("id")) for item in open_dues if item.get("id")]
    payment_utr = str(payload.payment_utr or "").strip() or None
    payment_ref = str(payload.payment_ref or "").strip() or None

    await db.users.update_one(
        {"id": current_user["id"]},
        {
            "$set": {
                "subscription.last_payment_submission_at": now,
                "subscription.last_payment_status": "pending_verification",
                "subscription.last_payment_method": payload.payment_method,
                "subscription.last_payment_utr": payment_utr,
                "subscription.last_payment_ref": payment_ref,
                "subscription.last_payment_submission_id": submission_id,
                "subscription.last_payment_reject_reason": None,
            }
        },
    )
    await db.subscription_dues.update_many(
        {"id": {"$in": open_due_ids}},
        {
            "$set": {
                "status": "pending_verification",
                "payment_method": payload.payment_method,
                "payment_utr": payment_utr,
                "payment_ref": payment_ref,
                "payment_submission_id": submission_id,
                "payment_submitted_at": now,
                "payment_reject_reason": None,
                "updated_at": now,
            }
        },
    )

    return {
        "message": "Subscription payment submitted for admin verification.",
        "submitted_amount": outstanding_amount,
        "payment_submission_id": submission_id,
    }

@api_router.post("/subscriptions/cancel")
async def cancel_my_subscription(current_user: dict = Depends(get_current_user)):
    if current_user["role"] == UserRole.ADMIN:
        raise HTTPException(status_code=400, detail="Admin users do not have subscriptions")

    now = get_ist_now()
    role_label = current_user["role"].value if isinstance(current_user["role"], Enum) else str(current_user["role"])
    await db.users.update_one(
        {"id": current_user["id"]},
        {
            "$set": {
                "subscription.plan_type": None,
                "subscription.is_active": False,
                "subscription.activated_by_admin": False,
                "subscription.cancelled_at": now,
                "subscription.activation_note": f"Cancelled by {role_label}",
            }
        },
    )
    refreshed = await db.users.find_one({"id": current_user["id"]})
    config = await get_subscription_config()
    return {
        "message": "Subscription cancelled",
        "subscription": serialize_subscription_for_response(refreshed or current_user, config),
    }

# ==================== DRIVER ENDPOINTS ====================
@api_router.post("/drivers/profile")
async def create_driver_profile(profile: DriverProfileCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can create driver profile")
    
    # Update driver profile
    await db.drivers.update_one(
        {"user_id": current_user["id"]},
        {"$set": {"vehicle_info": profile.vehicle_info.dict()}},
        upsert=True
    )
    await cache_delete(f"driver_profile:{current_user['id']}")
    
    return {"message": "Driver profile updated"}

@api_router.get("/drivers/profile")
async def get_driver_profile(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can access this")

    cache_key = f"driver_profile:{current_user['id']}"
    cached_profile = await cache_get(cache_key)
    if cached_profile:
        return cached_profile

    profile = await db.drivers.find_one({"user_id": current_user["id"]}, {"_id": 0})
    if not profile:
        await db.drivers.update_one(
            {"user_id": current_user["id"]},
            {"$setOnInsert": build_default_driver_profile(current_user["id"])},
            upsert=True,
        )
        profile = await db.drivers.find_one({"user_id": current_user["id"]}, {"_id": 0})
    if not profile:
        raise HTTPException(status_code=500, detail="Driver profile could not be initialized")

    profile["current_location"] = await get_effective_driver_location(profile)
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Backward-compatible shape for older UI screens expecting nested auto/owner details.
    vehicle_info = profile.get("vehicle_info") if isinstance(profile.get("vehicle_info"), dict) else {}
    auto_ownership_type = str(profile.get("auto_ownership_type") or "owned")
    profile["auto_details"] = {
        "auto_number": profile.get("auto_number") or vehicle_info.get("vehicle_number"),
        "auto_stand_licence_number": profile.get("auto_stand_licence_number"),
        "auto_model": profile.get("auto_model") or vehicle_info.get("vehicle_model"),
        "auto_color": profile.get("auto_color") or vehicle_info.get("vehicle_color"),
        "auto_registration_number": profile.get("auto_registration_number") or vehicle_info.get("vehicle_number"),
        "auto_ownership_type": auto_ownership_type,
    }
    profile["owner_details"] = {
        "owner_name": profile.get("owner_name") if auto_ownership_type == "rented" else current_user.get("name"),
        "owner_phone": profile.get("owner_phone") if auto_ownership_type == "rented" else current_user.get("phone"),
        "owner_email": profile.get("owner_email") if auto_ownership_type == "rented" else current_user.get("email"),
        "owner_address": profile.get("owner_address") if auto_ownership_type == "rented" else None,
    }
    response_profile = build_driver_profile_response(user, profile)
    await cache_set(cache_key, response_profile, ttl_seconds=60)

    return response_profile

@api_router.put("/drivers/profile")
async def update_driver_profile(payload: DriverProfileUpdate, current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    update_data = payload.model_dump(exclude_unset=True)
    if not update_data:
        return await get_driver_profile(current_user)

    if "email" in update_data:
        existing = await db.users.find_one({"email": update_data["email"], "id": {"$ne": current_user["id"]}})
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
    if "phone" in update_data:
        existing = await db.users.find_one({"phone": update_data["phone"], "id": {"$ne": current_user["id"]}})
        if existing:
            raise HTTPException(status_code=400, detail="Phone number already registered")

    now = get_ist_now()
    await db.users.update_one({"id": current_user["id"]}, {"$set": {**update_data, "updated_at": now}})
    await db.drivers.update_one(
        {"user_id": current_user["id"]},
        {"$set": {"updated_at": now}, "$setOnInsert": build_default_driver_profile(current_user["id"])},
        upsert=True,
    )
    await cache_delete(f"driver_profile:{current_user['id']}")
    refreshed_user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    refreshed_profile = await db.drivers.find_one({"user_id": current_user["id"]}, {"_id": 0})
    return {"profile": build_driver_profile_response(refreshed_user or current_user, refreshed_profile or {})}

@api_router.post("/drivers/profile/photo")
async def upload_driver_profile_photo(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    require_driver(current_user)
    saved = await save_upload_file(
        file,
        DRIVER_PROFILE_PHOTO_DIR / current_user["id"],
        current_user["id"],
        storage_backend=DRIVER_UPLOAD_STORAGE_BACKEND,
    )
    photo_url = f"{str(request.base_url).rstrip('/')}/api/drivers/profile/photo/{saved['filename']}"
    now = get_ist_now()
    existing = await db.drivers.find_one(
        {"user_id": current_user["id"]},
        {
            "_id": 0,
            "profile_photo_filename": 1,
            "profile_photo_storage_backend": 1,
            "profile_photo_storage_id": 1,
            "profile_photo_storage_key": 1,
            "storage_bucket": 1,
        },
    )
    await db.drivers.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "profile_photo": photo_url,
                "profile_photo_filename": saved["filename"],
                "profile_photo_storage_backend": saved.get("storage_backend"),
                "profile_photo_storage_id": saved.get("storage_id"),
                "profile_photo_storage_key": saved.get("storage_key"),
                "storage_bucket": saved.get("storage_bucket"),
                "updated_at": now,
            },
            "$setOnInsert": build_default_driver_profile(current_user["id"]),
        },
        upsert=True,
    )
    if existing and (
        existing.get("profile_photo_filename") != saved["filename"]
        or existing.get("profile_photo_storage_id") != saved.get("storage_id")
        or existing.get("profile_photo_storage_key") != saved.get("storage_key")
    ):
        await delete_stored_upload(
            existing,
            DRIVER_PROFILE_PHOTO_DIR / current_user["id"],
            stored_filename_field="profile_photo_filename",
            storage_backend_field="profile_photo_storage_backend",
            storage_id_field="profile_photo_storage_id",
            storage_key_field="profile_photo_storage_key",
        )
    await cache_delete(f"driver_profile:{current_user['id']}")
    return {"profile_photo": photo_url}

@api_router.get("/drivers/profile/photo/{filename}")
async def get_driver_profile_photo(filename: str):
    safe_name = Path(filename).name
    document = await db.drivers.find_one(
        {"profile_photo_filename": safe_name},
        {
            "_id": 0,
            "user_id": 1,
            "profile_photo_filename": 1,
            "profile_photo_storage_backend": 1,
            "profile_photo_storage_id": 1,
            "profile_photo_storage_key": 1,
            "storage_bucket": 1,
        },
    )
    if not document:
        raise HTTPException(status_code=404, detail="Profile photo not found")
    return await stored_upload_response(
        document,
        DRIVER_PROFILE_PHOTO_DIR / document["user_id"],
        filename=safe_name,
        stored_filename_field="profile_photo_filename",
        storage_backend_field="profile_photo_storage_backend",
        storage_id_field="profile_photo_storage_id",
        storage_key_field="profile_photo_storage_key",
        as_attachment=False,
    )

@api_router.put("/drivers/profile/bank")
async def update_driver_bank_details(payload: DriverBankDetailsUpdate, current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    now = get_ist_now()
    await db.drivers.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "bank_name": payload.bank_name,
                "bank_account_holder": payload.bank_account_holder,
                "bank_account_number_encrypted": encrypt_value(payload.bank_account_number),
                "bank_account_masked": mask_bank_account(payload.bank_account_number),
                "bank_ifsc_code": payload.bank_ifsc_code,
                "bank_verification_status": "pending_verification",
                "bank_updated_at": now,
                "updated_at": now,
            },
            "$setOnInsert": build_default_driver_profile(current_user["id"]),
        },
        upsert=True,
    )
    await cache_delete(f"driver_profile:{current_user['id']}")
    profile = await db.drivers.find_one({"user_id": current_user["id"]}, {"_id": 0})
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    return {
        "success": True,
        "message": "Bank details submitted for payout verification",
        "profile": build_driver_profile_response(user or current_user, profile or {}),
    }

@api_router.put("/drivers/profile/emergency-contact")
async def update_driver_emergency_contact(
    payload: DriverEmergencyContactUpdate,
    current_user: dict = Depends(get_current_user),
):
    require_driver(current_user)
    now = get_ist_now()
    contact_doc = {
        "id": f"driver-emergency-{current_user['id']}",
        "user_id": current_user["id"],
        "name": payload.emergency_contact_name,
        "phone": payload.emergency_contact_phone,
        "relationship": payload.relationship or "Emergency contact",
        "active": True,
        "source": "driver_profile",
        "updated_at": now,
    }
    await db.emergency_contacts.update_one(
        {"id": contact_doc["id"], "user_id": current_user["id"]},
        {"$set": contact_doc, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    await db.drivers.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "emergency_contact_name": payload.emergency_contact_name,
                "emergency_contact_phone": payload.emergency_contact_phone,
                "emergency_contact_relationship": payload.relationship or "Emergency contact",
                "emergency_contact_verified": True,
                "emergency_contact_updated_at": now,
                "updated_at": now,
            },
            "$setOnInsert": build_default_driver_profile(current_user["id"]),
        },
        upsert=True,
    )
    await cache_delete(f"driver_profile:{current_user['id']}")
    profile = await db.drivers.find_one({"user_id": current_user["id"]}, {"_id": 0})
    user = await db.users.find_one({"id": current_user["id"]}, {"_id": 0})
    return {
        "success": True,
        "message": "Emergency contact saved and activated",
        "profile": build_driver_profile_response(user or current_user, profile or {}),
    }

@api_router.get("/drivers/settings")
async def get_driver_settings(current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    profile = await db.drivers.find_one({"user_id": current_user["id"]}, {"_id": 0, "settings": 1})
    settings = normalize_driver_settings((profile or {}).get("settings"))
    return {"settings": settings}

@api_router.put("/drivers/settings")
async def update_driver_settings(payload: DriverSettingsUpdate, current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    updates = payload.model_dump(exclude_unset=True)
    profile = await db.drivers.find_one({"user_id": current_user["id"]}, {"_id": 0, "settings": 1}) or {}
    current_settings = normalize_driver_settings(profile.get("settings"))
    merged = normalize_driver_settings({**current_settings, **updates})
    now = get_ist_now()
    await db.drivers.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "settings": merged,
                "updated_at": now,
            },
            "$setOnInsert": build_default_driver_profile(current_user["id"]),
        },
        upsert=True,
    )
    await cache_delete(f"driver_profile:{current_user['id']}")
    return {"success": True, "settings": merged}

@api_router.get("/drivers/vehicles")
async def get_driver_vehicles(current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    vehicles = await db.driver_vehicles.find({"driver_id": current_user["id"]}, {"_id": 0}).sort("updated_at", -1).to_list(50)
    if not vehicles:
        profile = await db.drivers.find_one({"user_id": current_user["id"]}, {"_id": 0, "vehicle_info": 1})
        vehicle_info = (profile or {}).get("vehicle_info")
        if isinstance(vehicle_info, dict) and vehicle_info.get("vehicle_number"):
            now = get_ist_now()
            vehicle_doc = {
                "id": str(uuid.uuid4()),
                "driver_id": current_user["id"],
                "make": "",
                "model": str(vehicle_info.get("vehicle_model") or ""),
                "year": now.year,
                "color": str(vehicle_info.get("vehicle_color") or ""),
                "license_plate": str(vehicle_info.get("vehicle_number") or ""),
                "registration_number": str(vehicle_info.get("vehicle_number") or ""),
                "seating_capacity": 3,
                "vehicle_type": "auto",
                "is_active": True,
                "created_at": now,
                "updated_at": now,
            }
            await db.driver_vehicles.insert_one(vehicle_doc)
            vehicles = [vehicle_doc]

    normalized = [build_driver_vehicle_response(item) for item in vehicles]
    active = next((item for item in normalized if item.get("is_active")), None)
    if not active and normalized:
        normalized[0]["is_active"] = True
        await db.driver_vehicles.update_many({"driver_id": current_user["id"]}, {"$set": {"is_active": False}})
        await db.driver_vehicles.update_one(
            {"driver_id": current_user["id"], "id": normalized[0]["id"]},
            {"$set": {"is_active": True, "updated_at": get_ist_now()}},
        )
        await sync_driver_primary_vehicle(current_user["id"], normalized[0])
    return {"vehicles": normalized}

@api_router.post("/drivers/vehicles")
async def create_driver_vehicle(payload: DriverVehiclePayload, current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    now = get_ist_now()
    has_existing = await db.driver_vehicles.find_one({"driver_id": current_user["id"]}, {"_id": 0, "id": 1})
    vehicle_doc = {
        "id": str(uuid.uuid4()),
        "driver_id": current_user["id"],
        "make": payload.make,
        "model": payload.model,
        "year": payload.year,
        "color": payload.color or "",
        "license_plate": payload.license_plate.upper(),
        "registration_number": (payload.registration_number or payload.license_plate).upper(),
        "seating_capacity": payload.seating_capacity,
        "vehicle_type": payload.vehicle_type,
        "is_active": not bool(has_existing),
        "created_at": now,
        "updated_at": now,
    }
    await db.driver_vehicles.insert_one(vehicle_doc)
    if vehicle_doc["is_active"]:
        await sync_driver_primary_vehicle(current_user["id"], vehicle_doc)
    return {"success": True, "vehicle": build_driver_vehicle_response(vehicle_doc)}

@api_router.put("/drivers/vehicles/{vehicle_id}")
async def update_driver_vehicle(vehicle_id: str, payload: DriverVehiclePayload, current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    existing = await db.driver_vehicles.find_one({"driver_id": current_user["id"], "id": vehicle_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    now = get_ist_now()
    updated_fields = {
        "make": payload.make,
        "model": payload.model,
        "year": payload.year,
        "color": payload.color or "",
        "license_plate": payload.license_plate.upper(),
        "registration_number": (payload.registration_number or payload.license_plate).upper(),
        "seating_capacity": payload.seating_capacity,
        "vehicle_type": payload.vehicle_type,
        "updated_at": now,
    }
    await db.driver_vehicles.update_one(
        {"driver_id": current_user["id"], "id": vehicle_id},
        {"$set": updated_fields},
    )
    refreshed = await db.driver_vehicles.find_one({"driver_id": current_user["id"], "id": vehicle_id}, {"_id": 0})
    if refreshed and refreshed.get("is_active"):
        await sync_driver_primary_vehicle(current_user["id"], refreshed)
    return {"success": True, "vehicle": build_driver_vehicle_response(refreshed or {**existing, **updated_fields})}

@api_router.put("/drivers/vehicles/{vehicle_id}/activate")
async def activate_driver_vehicle(vehicle_id: str, current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    target = await db.driver_vehicles.find_one({"driver_id": current_user["id"], "id": vehicle_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    now = get_ist_now()
    await db.driver_vehicles.update_many({"driver_id": current_user["id"]}, {"$set": {"is_active": False, "updated_at": now}})
    await db.driver_vehicles.update_one(
        {"driver_id": current_user["id"], "id": vehicle_id},
        {"$set": {"is_active": True, "updated_at": now}},
    )
    refreshed = await db.driver_vehicles.find_one({"driver_id": current_user["id"], "id": vehicle_id}, {"_id": 0})
    await sync_driver_primary_vehicle(current_user["id"], refreshed)
    return {"success": True, "vehicle": build_driver_vehicle_response(refreshed or target)}

@api_router.delete("/drivers/vehicles/{vehicle_id}")
async def delete_driver_vehicle(vehicle_id: str, current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    target = await db.driver_vehicles.find_one({"driver_id": current_user["id"], "id": vehicle_id}, {"_id": 0})
    if not target:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    await db.driver_vehicles.delete_one({"driver_id": current_user["id"], "id": vehicle_id})
    if target.get("is_active"):
        replacement = await db.driver_vehicles.find_one({"driver_id": current_user["id"]}, {"_id": 0}, sort=[("updated_at", -1)])
        if replacement:
            now = get_ist_now()
            await db.driver_vehicles.update_many({"driver_id": current_user["id"]}, {"$set": {"is_active": False, "updated_at": now}})
            await db.driver_vehicles.update_one(
                {"driver_id": current_user["id"], "id": replacement["id"]},
                {"$set": {"is_active": True, "updated_at": now}},
            )
            replacement = await db.driver_vehicles.find_one({"driver_id": current_user["id"], "id": replacement["id"]}, {"_id": 0})
            await sync_driver_primary_vehicle(current_user["id"], replacement)
        else:
            await sync_driver_primary_vehicle(current_user["id"], None)
    return {"success": True, "message": "Vehicle removed"}

@retry_on_db_error(max_attempts=3, base_delay=0.5, max_delay=5.0)
async def _db_update_driver_location(
    driver_id: str,
    current_location: dict,
    geo_location: dict,
    now_utc,
    latitude: float,
    longitude: float,
):
    """Database operations for location update with retry support."""
    driver_insert_defaults = build_default_driver_profile(driver_id)
    driver_insert_defaults.pop("current_location", None)

    await db.drivers.update_one(
        {"user_id": driver_id},
        {
            "$set": {
                "current_location": current_location,
                "current_location_geo": geo_location,
                "last_location_at": now_utc,
                "is_online": True,
            },
            "$setOnInsert": driver_insert_defaults,
        },
        upsert=True,
    )
    await upsert_driver_geo_index(driver_id, latitude, longitude)


@retry_on_db_error(max_attempts=3, base_delay=0.5, max_delay=5.0)
async def _db_get_active_booking(driver_id: str):
    """Get active booking with retry support."""
    active_statuses = [BookingStatus.ACCEPTED, BookingStatus.DRIVER_ARRIVED, BookingStatus.IN_PROGRESS]
    return await db.bookings.find_one({
        "driver_id": driver_id,
        "status": {"$in": active_statuses},
    })


@api_router.put("/drivers/location")
async def update_driver_location(location_update: DriverLocationUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can update location")
    now_utc = get_ist_now()
    next_location_dict = location_update.location.dict()
    latitude = float(next_location_dict.get("latitude"))
    longitude = float(next_location_dict.get("longitude"))
    if latitude < -90 or latitude > 90 or longitude < -180 or longitude > 180:
        raise HTTPException(status_code=400, detail="Invalid location coordinates")
    cached_location = await cache_driver_live_location(current_user["id"], next_location_dict)
    if not cached_location:
        raise HTTPException(status_code=400, detail="Invalid location payload")
    geo_location = {
        "type": "Point",
        "coordinates": [float(longitude), float(latitude)],
    }
    
    # Update driver location with automatic retries
    await _db_update_driver_location(
        current_user["id"],
        cached_location,
        geo_location,
        now_utc,
        latitude,
        longitude,
    )
    
    await cache_delete(f"driver_profile:{current_user['id']}")

    # Get active booking with retries
    active_booking = await _db_get_active_booking(current_user["id"])
    
    if active_booking:
        await emit_to_user(
            active_booking["passenger_id"],
            "driver_location",
            {
                "booking_id": active_booking["id"],
                "driver_id": current_user["id"],
                "location": cached_location,
                "timestamp": now_utc.isoformat(),
            },
        )

    return {"message": "Location updated"}



@api_router.post("/drivers/telemetry", status_code=status.HTTP_202_ACCEPTED)
async def update_driver_telemetry(
    payload: DriverTelemetryUpdate,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can update telemetry")

    latitude = float(payload.latitude)
    longitude = float(payload.longitude)
    if latitude < -90 or latitude > 90 or longitude < -180 or longitude > 180:
        raise HTTPException(status_code=400, detail="Invalid telemetry coordinates")

    speed_kmh = max(0.0, float(payload.speed or 0.0))
    timestamp_value = int(payload.timestamp or int(time.time() * 1000))
    if timestamp_value > 10_000_000_000:
        recorded_at = datetime.utcfromtimestamp(timestamp_value / 1000.0)
    else:
        recorded_at = datetime.utcfromtimestamp(float(timestamp_value))

    driver_id = str(current_user.get("id") or "").strip()
    if not driver_id:
        raise HTTPException(status_code=400, detail="Driver identity unavailable")

    spatial_record = {
        "driver_id": driver_id,
        "location": {
            "type": "Point",
            "coordinates": [longitude, latitude],
        },
        "metrics": {
            "velocity_kmh": speed_kmh,
            "is_stationary": speed_kmh < 2.0,
        },
        "recorded_at": recorded_at,
        "received_at": get_ist_now(),
    }

    if spatial_record["metrics"]["is_stationary"]:
        await db.driver_status_cache.update_one(
            {"driver_id": driver_id},
            {"$set": spatial_record},
            upsert=True,
        )
        processed_mode = "static_throttle"
    else:
        await db.driver_historical_logs.insert_one(spatial_record)
        processed_mode = "dynamic_stream"

    return {
        "status": "telemetry_ingested",
        "processed_mode": processed_mode,
    }

@retry_on_db_error(max_attempts=3, base_delay=0.5, max_delay=5.0)
async def _db_update_driver_availability(
    driver_id: str,
    is_available: bool,
    now_utc,
    driver_insert_defaults: dict,
):
    """Database operations for availability update with retry support."""
    await db.drivers.update_one(
        {"user_id": driver_id},
        {
            "$set": {
                "is_available": is_available,
                "is_online": is_available,
                "updated_at": now_utc,
                "last_online_at": now_utc if is_available else None,
                "last_offline_at": now_utc if not is_available else None,
            },
            "$setOnInsert": driver_insert_defaults,
        },
        upsert=True,
    )
    await db.driver_availability_events.insert_one(
        {
            "id": f"drv-avail-{uuid.uuid4()}",
            "driver_id": driver_id,
            "is_available": bool(is_available),
            "is_online": bool(is_available),
            "created_at": now_utc,
        }
    )


@retry_on_db_error(max_attempts=3, base_delay=0.5, max_delay=5.0)
async def _db_get_driver_for_geo(driver_id: str):
    """Get driver profile for geolocation with retry support."""
    return await db.drivers.find_one({"user_id": driver_id}, {"_id": 0, "current_location": 1})


@api_router.get("/drivers/readiness")
async def get_driver_readiness(request: Request, current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    return await build_driver_ready_to_drive_status(current_user["id"], current_user, request)

@api_router.put("/drivers/availability")
async def update_driver_availability(
    availability: DriverAvailabilityUpdate,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can update availability")
    if availability.is_available:
        readiness = await build_driver_ready_to_drive_status(current_user["id"], current_user, request)
        if not readiness.get("ready"):
            raise HTTPException(
                status_code=409,
                detail={
                    "message": readiness.get("message") or "Complete Ready to Drive requirements before going online.",
                    "readiness": readiness,
                },
            )
        await ensure_user_can_take_ride_actions(current_user, "going online")
    now_utc = get_ist_now()
    driver_insert_defaults = build_default_driver_profile(current_user["id"])
    driver_insert_defaults.pop("is_available", None)

    # Update availability with retries
    await _db_update_driver_availability(
        current_user["id"],
        availability.is_available,
        now_utc,
        driver_insert_defaults,
    )
    
    if availability.is_available:
        await runtime_state.touch_driver_heartbeat(str(current_user["id"]))
    else:
        await runtime_state.mark_driver_offline(str(current_user["id"]))
    
    await cache_delete(f"driver_profile:{current_user['id']}")
    
    if not availability.is_available:
        await runtime_state.clear_driver_live_location(str(current_user["id"]))
        await remove_driver_geo_index(str(current_user["id"]))
    else:
        profile_for_geo = await _db_get_driver_for_geo(current_user["id"])
        geo_loc = normalize_tracking_location((profile_for_geo or {}).get("current_location"))
        if geo_loc:
            await upsert_driver_geo_index(
                str(current_user["id"]),
                float(geo_loc.get("latitude")),
                float(geo_loc.get("longitude")),
            )
    
    # Return the state we just set (not fetched from DB to avoid timing issues)
    return {
        "message": "Availability updated",
        "is_available": bool(availability.is_available),
        "is_online": bool(availability.is_available),
        "current_location": await runtime_state.get_driver_live_location(str(current_user["id"])) or {},
    }

@api_router.get("/drivers/availability")
@retry_on_db_error(max_attempts=2, base_delay=0.3, max_delay=3.0)
async def get_driver_availability(current_user: dict = Depends(get_current_user)):
    """Get the current availability status of the driver."""
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can view their availability")
    
    profile = await db.drivers.find_one({"user_id": current_user["id"]}) or {}
    return {
        "is_available": bool(profile.get("is_available", False)),
        "is_online": bool(profile.get("is_online", False)),
        "current_location": await get_effective_driver_location(profile),
    }

@api_router.get("/drivers/analytics")
async def get_driver_analytics(period: str = "week", current_user: dict = Depends(get_current_user)):
    require_driver_user(current_user)
    normalized_period = str(period or "week").strip().lower()
    if normalized_period not in {"day", "week", "month", "year"}:
        raise HTTPException(status_code=400, detail="period must be one of day, week, month, year")

    driver_id = current_user["id"]
    now = get_ist_now()
    start_at = get_driver_analytics_start(normalized_period)
    assigned_statuses = [
        BookingStatus.ACCEPTED,
        BookingStatus.DRIVER_ARRIVED,
        BookingStatus.IN_PROGRESS,
        BookingStatus.COMPLETED,
        BookingStatus.CANCELLED,
        BookingStatus.RATING_PENDING,
    ]
    assigned_query = {
        "driver_id": driver_id,
        "created_at": {"$gte": start_at, "$lte": now},
        "status": {"$in": assigned_statuses},
    }
    completed_query = {
        "driver_id": driver_id,
        "status": BookingStatus.COMPLETED,
        "$or": [
            {"trip_completed_at": {"$gte": start_at, "$lte": now}},
            {"trip_completed_at": None, "updated_at": {"$gte": start_at, "$lte": now}},
        ],
    }
    dispatch_query = {
        "driver_id": driver_id,
        "responded_at": {"$gte": start_at, "$lte": now},
    }

    assigned_bookings, completed_bookings, cancelled_count, dispatch_attempts, profile = await asyncio.gather(
        db.bookings.find(assigned_query, {"_id": 0}).to_list(5000),
        db.bookings.find(completed_query, {"_id": 0}).to_list(5000),
        db.bookings.count_documents(
            {
                "driver_id": driver_id,
                "status": BookingStatus.CANCELLED,
                "created_at": {"$gte": start_at, "$lte": now},
            }
        ),
        db.dispatch_attempts.find(dispatch_query, {"_id": 0}).to_list(5000),
        db.drivers.find_one({"user_id": driver_id}, {"_id": 0}),
    )
    profile = profile or {}

    total_rides = len(completed_bookings)
    assigned_count = len(assigned_bookings)
    total_earnings = round(sum(booking_fare_value(booking) for booking in completed_bookings), 2)
    total_distance = sum(booking_distance_value(booking) for booking in completed_bookings)
    average_trip_distance = round(total_distance / max(total_rides, 1), 2)

    accepted_attempts = sum(1 for attempt in dispatch_attempts if attempt.get("response") == "accepted")
    rejected_attempts = sum(1 for attempt in dispatch_attempts if attempt.get("response") == "rejected")
    expired_attempts = sum(1 for attempt in dispatch_attempts if attempt.get("response") == "expired")
    total_attempts = accepted_attempts + rejected_attempts + expired_attempts
    acceptance_rate = round((accepted_attempts / max(total_attempts, 1)) * 100, 2)
    cancellation_rate = round((float(cancelled_count) / max(float(assigned_count), 1.0)) * 100, 2)
    hours_online = await calculate_driver_online_hours(driver_id, start_at, now, profile)
    daily_trends, weekly_comparison, peak_hours = build_driver_analytics_series(completed_bookings, start_at, now)

    analytics = {
        "period": normalized_period,
        "period_start": start_at,
        "period_end": now,
        "data_source": "backend",
        "total_rides": total_rides,
        "assigned_rides": assigned_count,
        "completed_rides": total_rides,
        "cancelled_rides": int(cancelled_count),
        "total_earnings": total_earnings,
        "average_rating": round(float(profile.get("rating", 0.0) or 0.0), 2),
        "acceptance_rate": acceptance_rate,
        "cancellation_rate": cancellation_rate,
        "average_trip_distance": average_trip_distance,
        "hours_online": hours_online,
        "rides_per_hour": round(total_rides / max(hours_online, 1.0), 2),
        "peak_hours": peak_hours,
        "daily_trends": daily_trends,
        "weekly_comparison": weekly_comparison,
        "dispatch_attempts": {
            "accepted": accepted_attempts,
            "rejected": rejected_attempts,
            "expired": expired_attempts,
            "total": total_attempts,
        },
    }
    return {"analytics": analytics}

@api_router.put("/drivers/fare")
async def update_driver_fare(fare_update: DriverFareUpdate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can update fare")
    
    await db.drivers.update_one(
        {"user_id": current_user["id"]},
        {"$set": {"fare_multiplier": fare_update.fare_multiplier}}
    )
    
    return {"message": "Fare multiplier updated", "fare_multiplier": fare_update.fare_multiplier}

@api_router.get("/drivers/fare-calculator")
async def get_driver_fare_calculator(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can access this")

    base_pricing = await get_pricing_rules()
    profile = await db.drivers.find_one({"user_id": current_user["id"]}) or {}
    effective_pricing = await get_effective_pricing_for_driver_profile(profile, base_pricing)
    request_payload = profile.get("custom_fare_pricing_request")
    active_status = resolve_driver_active_fare_status(profile)

    return {
        "default_pricing": serialize_driver_fare_config(base_pricing),
        "effective_pricing": serialize_driver_fare_config(effective_pricing),
        "status": active_status,
        "approved_pricing": profile.get("custom_fare_pricing"),
        "request": request_payload,
        "fare_multiplier": float(profile.get("fare_multiplier", 1.0)),
    }

@api_router.put("/drivers/fare-calculator")
async def submit_driver_fare_calculator(
    payload: DriverFareCalculatorConfig,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can update fare calculator")

    validate_driver_fare_radius_constraints(payload)
    now = get_ist_now()
    request_doc = {
        "payload": payload.dict(),
        "request_type": "update",
        "status": "pending",
        "submitted_at": now,
        "reviewed_at": None,
        "reviewed_by": None,
        "reject_reason": None,
    }
    await db.drivers.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "custom_fare_pricing_request": request_doc,
                "custom_fare_pricing_status": "pending",
                "custom_fare_pricing_requested_at": now,
            },
            "$setOnInsert": build_default_driver_profile(current_user["id"]),
        },
        upsert=True,
    )
    return {"message": "Fare calculator request submitted for admin approval", "status": "pending"}

@api_router.post("/drivers/fare-calculator/reset-request")
async def submit_driver_fare_calculator_reset_request(
    payload: DriverFareCalculatorResetRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can request fare calculator reset")

    now = get_ist_now()
    request_doc = {
        "payload": None,
        "request_type": "reset",
        "note": payload.note,
        "status": "pending",
        "submitted_at": now,
        "reviewed_at": None,
        "reviewed_by": None,
        "reject_reason": None,
    }
    await db.drivers.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "custom_fare_pricing_request": request_doc,
                "custom_fare_pricing_status": "pending",
                "custom_fare_pricing_requested_at": now,
            },
            "$setOnInsert": build_default_driver_profile(current_user["id"]),
        },
        upsert=True,
    )
    return {"message": "Reset request submitted for admin approval", "status": "pending"}

def serialize_driver_support_ticket(ticket: Dict[str, Any]) -> Dict[str, Any]:
    result = dict(ticket or {})
    result.pop("_id", None)
    result["messages"] = [
        {key: value for key, value in dict(message or {}).items() if key != "_id"}
        for message in result.get("messages", [])
    ]
    result["message_count"] = len(result["messages"])
    return result

def require_driver_user(current_user: Dict[str, Any]) -> None:
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can access this")

DRIVER_SUPPORT_FAQS = [
    {
        "id": "driver-faq-response-time",
        "category": "general",
        "question": "How long does support take to respond?",
        "answer": "Most driver tickets receive a first response within 24 hours. Urgent safety and payout issues are prioritized.",
    },
    {
        "id": "driver-faq-payout-delay",
        "category": "payment",
        "question": "Why is my payout delayed?",
        "answer": "Payouts can be delayed if bank details are pending verification or if a trip payment is still being reconciled.",
    },
    {
        "id": "driver-faq-document-review",
        "category": "document",
        "question": "How do I fix a rejected document?",
        "answer": "Open Documents, view the rejected item, check the review note, and reupload a clear current copy.",
    },
    {
        "id": "driver-faq-safety-escalation",
        "category": "safety",
        "question": "When should I escalate a ticket?",
        "answer": "Escalate if the issue blocks rides, affects safety, or has not received a useful response after one support reply.",
    },
]

async def notify_support_admins(title: str, body: str, data: Optional[Dict[str, Any]] = None) -> None:
    admins = await db.users.find({"role": UserRole.ADMIN}, {"_id": 0, "id": 1}).to_list(50)
    for admin in admins:
        admin_id = admin.get("id")
        if admin_id:
            await notify_user(admin_id, title=title, body=body, data=data)

def normalize_attachment_urls(urls: List[str]) -> List[str]:
    cleaned = []
    for url in urls or []:
        text = str(url or "").strip()
        if text and text not in cleaned:
            cleaned.append(text[:500])
    return cleaned[:5]

@api_router.get("/drivers/support/faqs")
async def get_driver_support_faqs(
    category: Optional[str] = None,
    q: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    require_driver_user(current_user)
    query_text = str(q or "").strip().lower()
    category_filter = str(category or "").strip().lower()
    db_faqs = await db.support_faqs.find(
        {"audience": {"$in": ["driver", "all"]}, "active": {"$ne": False}},
        {"_id": 0},
    ).sort("sort_order", 1).to_list(100)
    faqs = db_faqs or DRIVER_SUPPORT_FAQS
    if category_filter:
        faqs = [faq for faq in faqs if str(faq.get("category") or "").lower() == category_filter]
    if query_text:
        faqs = [
            faq
            for faq in faqs
            if query_text in str(faq.get("question") or "").lower()
            or query_text in str(faq.get("answer") or "").lower()
        ]
    return {"faqs": faqs}

@api_router.post("/drivers/support/attachments")
async def upload_driver_support_attachment(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    require_driver_user(current_user)
    saved = await save_upload_file(
        file,
        SUPPORT_ATTACHMENTS_DIR / current_user["id"],
        "driver-support",
        storage_backend=DRIVER_UPLOAD_STORAGE_BACKEND,
    )
    attachment_url = f"{str(request.base_url).rstrip('/')}/api/drivers/support/attachments/{saved['filename']}"
    attachment = {
        "id": f"drv-att-{uuid.uuid4()}",
        "user_id": current_user["id"],
        "role": "driver",
        "stored_filename": saved["filename"],
        "filename": saved["original_filename"],
        "content_type": saved["content_type"],
        "size": saved["size"],
        "storage_backend": saved.get("storage_backend"),
        "storage_id": saved.get("storage_id"),
        "storage_key": saved.get("storage_key"),
        "storage_bucket": saved.get("storage_bucket"),
        "url": attachment_url,
        "created_at": get_ist_now(),
    }
    await db.support_attachments.insert_one(attachment)
    response_attachment = without_mongo_id({**attachment, "attachment_url": attachment_url})
    for key in ["storage_backend", "storage_id", "storage_key", "storage_bucket"]:
        response_attachment.pop(key, None)
    return response_attachment

@api_router.get("/drivers/support/attachments/{filename}")
async def download_driver_support_attachment(filename: str, current_user: dict = Depends(get_current_user)):
    require_driver_user(current_user)
    attachment = await db.support_attachments.find_one(
        {"user_id": current_user["id"], "stored_filename": Path(filename).name}
    )
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return await stored_upload_response(
        attachment,
        SUPPORT_ATTACHMENTS_DIR / current_user["id"],
        filename=attachment.get("filename") or attachment.get("stored_filename"),
        as_attachment=True,
    )

@api_router.get("/drivers/support/tickets")
async def get_driver_support_tickets(
    status_filter: Optional[str] = None,
    category: Optional[str] = None,
    priority: Optional[str] = None,
    q: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    require_driver_user(current_user)
    query: Dict[str, Any] = {"driver_id": current_user["id"]}
    if status_filter:
        query["status"] = status_filter
    if category:
        query["category"] = str(category).strip().lower()
    if priority:
        query["priority"] = str(priority).strip().lower()
    if q:
        text = re.escape(str(q).strip())
        query["$or"] = [
            {"subject": {"$regex": text, "$options": "i"}},
            {"description": {"$regex": text, "$options": "i"}},
            {"id": {"$regex": text, "$options": "i"}},
        ]
    tickets = await db.driver_support_tickets.find(query).sort("updated_at", -1).to_list(100)
    return {"tickets": [serialize_driver_support_ticket(ticket) for ticket in tickets]}

@api_router.post("/drivers/support/tickets")
async def create_driver_support_ticket(
    payload: DriverSupportTicketCreate,
    current_user: dict = Depends(get_current_user),
):
    require_driver_user(current_user)
    now = get_ist_now()
    category = re.sub(r"[^a-zA-Z0-9_-]+", "_", payload.category).strip("_").lower() or "general"
    attachment_urls = normalize_attachment_urls(payload.attachment_urls)
    ticket = {
        "id": f"drv-ticket-{uuid.uuid4()}",
        "driver_id": current_user["id"],
        "driver_name": current_user.get("name", "Driver"),
        "subject": payload.subject,
        "description": payload.description,
        "category": category,
        "priority": payload.priority,
        "status": "open",
        "assigned_to": None,
        "attachment_urls": attachment_urls,
        "escalated": False,
        "escalated_at": None,
        "escalation_reason": None,
        "messages": [
            {
                "id": f"msg-{uuid.uuid4()}",
                "from": "driver",
                "sender_type": "driver",
                "sender_id": current_user["id"],
                "sender_name": current_user.get("name", "Driver"),
                "text": payload.description,
                "message_text": payload.description,
                "attachment_urls": attachment_urls,
                "timestamp": now,
                "created_at": now,
            }
        ],
        "created_at": now,
        "updated_at": now,
        "resolved_at": None,
    }
    await db.driver_support_tickets.insert_one(ticket)
    await notify_support_admins(
        "New driver support ticket",
        f"{current_user.get('name', 'Driver')} opened: {payload.subject}",
        {"type": "driver_support_ticket", "ticket_id": ticket["id"], "category": category, "priority": payload.priority},
    )
    return {"message": "Support ticket created", "ticket": serialize_driver_support_ticket(ticket)}

@api_router.post("/drivers/support/tickets/{ticket_id}/reply")
async def reply_to_driver_support_ticket(
    ticket_id: str,
    payload: DriverSupportTicketReply,
    current_user: dict = Depends(get_current_user),
):
    require_driver_user(current_user)
    ticket = await db.driver_support_tickets.find_one({"id": ticket_id, "driver_id": current_user["id"]})
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found")
    if ticket.get("status") == "closed":
        raise HTTPException(status_code=400, detail="Closed tickets cannot accept replies")

    now = get_ist_now()
    attachment_urls = normalize_attachment_urls(payload.attachment_urls)
    message = {
        "id": f"msg-{uuid.uuid4()}",
        "from": "driver",
        "sender_type": "driver",
        "sender_id": current_user["id"],
        "sender_name": current_user.get("name", "Driver"),
        "text": payload.message,
        "message_text": payload.message,
        "attachment_urls": attachment_urls,
        "timestamp": now,
        "created_at": now,
    }
    await db.driver_support_tickets.update_one(
        {"id": ticket_id, "driver_id": current_user["id"]},
        {
            "$push": {"messages": message},
            "$set": {"updated_at": now, "status": "open"},
        },
    )
    await notify_support_admins(
        "Driver replied to support ticket",
        f"{current_user.get('name', 'Driver')} replied on {ticket.get('subject', 'a ticket')}",
        {"type": "driver_support_reply", "ticket_id": ticket_id},
    )
    return {"message": "Reply added", "reply": message}

@api_router.put("/drivers/support/tickets/{ticket_id}/escalate")
async def escalate_driver_support_ticket(
    ticket_id: str,
    payload: DriverSupportTicketEscalation,
    current_user: dict = Depends(get_current_user),
):
    require_driver_user(current_user)
    ticket = await db.driver_support_tickets.find_one({"id": ticket_id, "driver_id": current_user["id"]})
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found")
    if ticket.get("status") == "closed":
        raise HTTPException(status_code=400, detail="Closed tickets cannot be escalated")

    now = get_ist_now()
    message = {
        "id": f"msg-{uuid.uuid4()}",
        "from": "driver",
        "sender_type": "driver",
        "sender_id": current_user["id"],
        "sender_name": current_user.get("name", "Driver"),
        "text": f"Escalation requested: {payload.reason}",
        "message_text": f"Escalation requested: {payload.reason}",
        "attachment_urls": [],
        "timestamp": now,
        "created_at": now,
    }
    await db.driver_support_tickets.update_one(
        {"id": ticket_id, "driver_id": current_user["id"]},
        {
            "$push": {"messages": message},
            "$set": {
                "status": "in_progress",
                "priority": "urgent",
                "escalated": True,
                "escalated_at": now,
                "escalation_reason": payload.reason,
                "updated_at": now,
            },
        },
    )
    await notify_support_admins(
        "Driver support escalation",
        f"{current_user.get('name', 'Driver')} escalated {ticket.get('subject', 'a ticket')}",
        {"type": "driver_support_escalation", "ticket_id": ticket_id, "reason": payload.reason},
    )
    return {"message": "Ticket escalated", "status": "in_progress"}

@api_router.put("/drivers/support/tickets/{ticket_id}/close")
async def close_driver_support_ticket(
    ticket_id: str,
    current_user: dict = Depends(get_current_user),
):
    require_driver_user(current_user)
    now = get_ist_now()
    result = await db.driver_support_tickets.update_one(
        {"id": ticket_id, "driver_id": current_user["id"]},
        {"$set": {"status": "closed", "updated_at": now, "resolved_at": now}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Support ticket not found")
    return {"message": "Ticket closed", "status": "closed"}

@api_router.get("/admin/support/driver-tickets")
async def admin_get_driver_support_tickets(
    status_filter: Optional[str] = None,
    q: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    query: Dict[str, Any] = {}
    if status_filter:
        query["status"] = status_filter
    if q:
        text = re.escape(str(q).strip())
        query["$or"] = [
            {"subject": {"$regex": text, "$options": "i"}},
            {"description": {"$regex": text, "$options": "i"}},
            {"driver_name": {"$regex": text, "$options": "i"}},
            {"id": {"$regex": text, "$options": "i"}},
        ]
    tickets = await db.driver_support_tickets.find(query).sort("updated_at", -1).to_list(200)
    return {"tickets": [serialize_driver_support_ticket(ticket) for ticket in tickets]}

@api_router.post("/admin/support/driver-tickets/{ticket_id}/reply")
async def admin_reply_to_driver_support_ticket(
    ticket_id: str,
    payload: DriverSupportTicketReply,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    ticket = await db.driver_support_tickets.find_one({"id": ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found")
    if ticket.get("status") == "closed":
        raise HTTPException(status_code=400, detail="Closed tickets cannot accept replies")

    now = get_ist_now()
    attachment_urls = normalize_attachment_urls(payload.attachment_urls)
    message = {
        "id": f"msg-{uuid.uuid4()}",
        "from": "support",
        "sender_type": "support",
        "sender_id": current_user["id"],
        "sender_name": current_user.get("name", "Support"),
        "text": payload.message,
        "message_text": payload.message,
        "attachment_urls": attachment_urls,
        "timestamp": now,
        "created_at": now,
    }
    await db.driver_support_tickets.update_one(
        {"id": ticket_id},
        {
            "$push": {"messages": message},
            "$set": {"updated_at": now, "status": "in_progress"},
        },
    )
    await notify_user(
        ticket["driver_id"],
        title="Support replied to your ticket",
        body=f"Support replied on {ticket.get('subject', 'your ticket')}",
        data={"type": "driver_support_reply", "ticket_id": ticket_id},
    )
    return {"message": "Reply added", "reply": message}

@api_router.get("/places/autocomplete")
async def places_autocomplete(
    input: str,
    language: str = "en",
    country_code: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    radius: int = 50000,
):
    text = str(input or "").strip()
    if len(text) < 3:
        return []

    params: Dict[str, Any] = {
        "input": text,
        "language": language or "en",
    }
    if country_code:
        params["components"] = f"country:{country_code}"
    if latitude is not None and longitude is not None:
        params["location"] = f"{latitude},{longitude}"
        params["radius"] = str(max(1000, min(int(radius), 100000)))

    payload = await fetch_google_maps_json(
        "place/autocomplete/json",
        params,
        allow_zero_results=True,
    )
    predictions = payload.get("predictions") or []
    return [
        {
            "placeId": item.get("place_id"),
            "description": item.get("description"),
        }
        for item in predictions
        if item.get("place_id") and item.get("description")
    ]

@api_router.get("/places/details")
async def places_details(place_id: str, language: str = "en"):
    pid = str(place_id or "").strip()
    if not pid:
        raise HTTPException(status_code=400, detail="place_id is required")

    payload = await fetch_google_maps_json(
        "place/details/json",
        {
            "place_id": pid,
            "fields": "formatted_address,geometry,name",
            "language": language or "en",
        },
    )
    result = payload.get("result") or {}
    location = ((result.get("geometry") or {}).get("location") or {})
    lat = location.get("lat")
    lng = location.get("lng")
    if not isinstance(lat, (float, int)) or not isinstance(lng, (float, int)):
        raise HTTPException(status_code=400, detail="Could not read coordinates for selected place.")

    return {
        "latitude": round(float(lat), 6),
        "longitude": round(float(lng), 6),
        "address": result.get("formatted_address") or result.get("name") or f"Lat {lat}, Lng {lng}",
    }

@api_router.get("/places/reverse-geocode")
async def places_reverse_geocode(latitude: float, longitude: float, language: str = "en"):
    payload = await fetch_google_maps_json(
        "geocode/json",
        {
            "latlng": f"{latitude},{longitude}",
            "language": language or "en",
        },
        allow_zero_results=True,
    )
    first = (payload.get("results") or [None])[0]
    return {"address": first.get("formatted_address") if isinstance(first, dict) else None}

@api_router.get("/drivers/nearby", response_model=List[NearbyDriverResponse])
async def get_nearby_drivers(
    latitude: float,
    longitude: float,
    radius_km: float = 5.0,
    drop_latitude: Optional[float] = None,
    drop_longitude: Optional[float] = None,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
):
    """Get available drivers: search in radius A first, fallback to long-distance radius B."""
    pricing = await get_pricing_rules()
    radius_cfg = get_driver_search_radius_config(pricing)
    base_radius_km = float(radius_cfg["base_radius_km"])
    long_radius_km = float(radius_cfg["long_radius_km"])
    requested_radius_km = max(0.5, float(radius_km or base_radius_km))
    primary_radius_km = min(requested_radius_km, base_radius_km)
    fallback_radius_km = long_radius_km
    blocked_driver_ids: set = set()
    if credentials:
        try:
            payload = decode_token(credentials.credentials)
            user = await db.users.find_one({"id": payload.get("sub")})
            if user and user.get("role") == UserRole.PASSENGER:
                blocked_driver_ids = set(await get_excluded_driver_ids_for_passenger(user["id"]))
        except Exception:
            blocked_driver_ids = set()

    user_location = Location(latitude=latitude, longitude=longitude)
    projected_distance_km: Optional[float] = None
    projected_time_multiplier = get_time_multiplier()
    if drop_latitude is not None and drop_longitude is not None:
        try:
            drop_location = Location(latitude=drop_latitude, longitude=drop_longitude)
            route_metrics = await get_route_metrics(user_location, drop_location)
            projected_distance_km = float(route_metrics.get("distance_km", 0.0) or 0.0)
        except Exception:
            projected_distance_km = None
    available_drivers = await db.drivers.find({
        "is_available": True,
        "vehicle_info": {"$ne": None},
        "kyc_status": KYCStatus.APPROVED
    }).to_list(250)
    if not available_drivers:
        available_drivers = await db.drivers.find({"is_available": True}).to_list(250)

    nearby_drivers: List[Dict[str, Any]] = []
    primary_scored_drivers: List[Dict[str, Any]] = []
    fallback_scored_drivers: List[Dict[str, Any]] = []
    for driver in available_drivers:
        if blocked_driver_ids and driver.get("user_id") in blocked_driver_ids:
            continue
        live_location = await get_effective_driver_location(driver)
        if not live_location:
            continue
        try:
            driver_loc = Location(**live_location)
        except Exception:
            continue
        distance = calculate_distance(user_location, driver_loc)
        distance_payload = {**driver, "current_location": live_location, "distance": distance, "driver_loc": driver_loc}
        if distance <= primary_radius_km:
            primary_scored_drivers.append(distance_payload)
        if distance <= fallback_radius_km:
            fallback_scored_drivers.append(distance_payload)

    if primary_scored_drivers:
        nearby_drivers = primary_scored_drivers
    elif fallback_scored_drivers:
        fallback_scored_drivers.sort(key=lambda item: item["distance"])
        nearby_drivers = fallback_scored_drivers[:12]

    driver_ids = [d["user_id"] for d in nearby_drivers]
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": driver_ids}}).to_list(None)} if driver_ids else {}

    nearby: List[NearbyDriverResponse] = []
    for driver in nearby_drivers:
        user = users.get(driver["user_id"])
        if user:
            raw_vehicle_info = driver.get("vehicle_info") or {
                "vehicle_number": "Pending",
                "vehicle_model": "Auto",
                "vehicle_color": "Unknown",
            }
            try:
                vehicle_info = VehicleInfo(**raw_vehicle_info)
            except Exception:
                continue
            effective_pricing = await get_effective_pricing_for_driver_profile(driver, pricing)
            surcharge_payload = compute_pickup_surcharge_for_driver_distance(driver["distance"], effective_pricing)
            projected_fare = None
            if projected_distance_km is not None and projected_distance_km > 0:
                base_route_fare = (
                    (effective_pricing.base_fare + (projected_distance_km * effective_pricing.per_km_rate))
                    * projected_time_multiplier
                )
                base_route_fare = max(base_route_fare, effective_pricing.minimum_fare)
                projected_fare = round(
                    (base_route_fare * float(driver.get("fare_multiplier", 1.0) or 1.0))
                    + float(surcharge_payload["pickup_surcharge"]),
                    2,
                )
            nearby.append(NearbyDriverResponse(
                driver_id=driver["user_id"],
                name=user["name"],
                phone=user["phone"],
                vehicle_info=vehicle_info,
                rating=driver.get("rating", 5.0),
                distance_km=driver["distance"],
                fare_multiplier=driver.get("fare_multiplier", 1.0),
                location=driver["driver_loc"],
                pickup_surcharge=surcharge_payload["pickup_surcharge"],
                extra_pickup_distance_km=surcharge_payload["extra_pickup_distance_km"],
                projected_fare=projected_fare,
            ))

    nearby.sort(key=lambda x: x.distance_km)
    return nearby

@api_router.put("/passengers/favorite-drivers/{driver_id}")
async def toggle_favorite_driver(
    driver_id: str,
    payload: FavoriteDriverToggleRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.PASSENGER:
        raise HTTPException(status_code=403, detail="Only passengers can favorite drivers")

    driver_user = await db.users.find_one({"id": driver_id, "role": UserRole.DRIVER})
    if not driver_user:
        raise HTTPException(status_code=404, detail="Driver not found")

    if payload.is_favorite:
        await db.passenger_favorite_drivers.update_one(
            {"passenger_id": current_user["id"], "driver_id": driver_id},
            {
                "$set": {
                    "passenger_id": current_user["id"],
                    "driver_id": driver_id,
                    "updated_at": get_ist_now(),
                },
                "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": get_ist_now()},
            },
            upsert=True,
        )
        return {"message": "Driver marked as favorite"}

    await db.passenger_favorite_drivers.delete_one({"passenger_id": current_user["id"], "driver_id": driver_id})
    return {"message": "Driver removed from favorites"}

@api_router.put("/passengers/blocked-drivers/{driver_id}")
async def toggle_blocked_driver_for_passenger(
    driver_id: str,
    payload: UserBlockToggleRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.PASSENGER:
        raise HTTPException(status_code=403, detail="Only passengers can block drivers")
    if driver_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="You cannot block yourself")

    driver_user = await db.users.find_one({"id": driver_id, "role": UserRole.DRIVER})
    if not driver_user:
        raise HTTPException(status_code=404, detail="Driver not found")

    if payload.is_blocked:
        await db.passenger_blocked_drivers.update_one(
            {"passenger_id": current_user["id"], "driver_id": driver_id},
            {
                "$set": {
                    "passenger_id": current_user["id"],
                    "driver_id": driver_id,
                    "updated_at": get_ist_now(),
                },
                "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": get_ist_now()},
            },
            upsert=True,
        )
        return {"message": "Driver blocked"}

    await db.passenger_blocked_drivers.delete_one({"passenger_id": current_user["id"], "driver_id": driver_id})
    return {"message": "Driver unblocked"}

@api_router.get("/passengers/blocked-drivers")
async def get_passenger_blocked_drivers(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.PASSENGER:
        raise HTTPException(status_code=403, detail="Only passengers can view blocked drivers")
    blocked_ids = await get_passenger_blocked_driver_ids(current_user["id"])
    return {"driver_ids": blocked_ids}


def coerce_block_reason(reason: Optional[str]) -> str:
    normalized = re.sub(r"\s+", " ", str(reason or "").strip())
    return normalized[:240] if normalized else "Blocked by driver"


def location_address_for_response(location: Optional[Dict[str, Any]]) -> Optional[str]:
    if not isinstance(location, dict):
        return None

    address = str(location.get("address") or "").strip()
    if address:
        return address

    latitude = location.get("latitude")
    longitude = location.get("longitude")
    if latitude is None or longitude is None:
        return None
    return f"{latitude}, {longitude}"


def serialize_driver_blocked_passenger(
    block_row: Dict[str, Any],
    passenger: Optional[Dict[str, Any]],
    booking: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    pickup_location = booking.get("pickup_location") if booking else None
    drop_location = booking.get("drop_location") if booking else None
    blocked_at = block_row.get("blocked_at") or block_row.get("created_at") or block_row.get("updated_at")

    return {
        "passenger_id": block_row.get("passenger_id"),
        "passenger_name": passenger.get("name") if passenger else None,
        "passenger_phone": passenger.get("phone") if passenger else None,
        "blocked_at": blocked_at,
        "updated_at": block_row.get("updated_at"),
        "reason": block_row.get("reason") or block_row.get("block_reason") or "No reason recorded",
        "last_booking_id": (booking or {}).get("id") or block_row.get("last_booking_id") or block_row.get("booking_id"),
        "last_booking_status": (booking or {}).get("status"),
        "last_ride_at": (booking or {}).get("created_at") or block_row.get("updated_at"),
        "pickup_address": location_address_for_response(pickup_location),
        "dropoff_address": location_address_for_response(drop_location),
        "estimated_fare": (booking or {}).get("final_fare") or (booking or {}).get("estimated_fare"),
    }


@api_router.put("/drivers/blocked-passengers/{passenger_id}")
async def toggle_blocked_passenger_for_driver(
    passenger_id: str,
    payload: UserBlockToggleRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can block passengers")
    if passenger_id == current_user["id"]:
        raise HTTPException(status_code=400, detail="You cannot block yourself")

    passenger_user = await db.users.find_one({"id": passenger_id, "role": UserRole.PASSENGER})
    if not passenger_user:
        raise HTTPException(status_code=404, detail="Passenger not found")

    if payload.is_blocked:
        now = get_ist_now()
        reason = coerce_block_reason(payload.reason)
        booking_id = str(payload.booking_id or "").strip() or None
        booking_context = None
        if booking_id:
            booking_context = await db.bookings.find_one(
                {
                    "id": booking_id,
                    "passenger_id": passenger_id,
                    "$or": [
                        {"driver_id": current_user["id"]},
                        {"candidate_driver_ids": current_user["id"]},
                        {"driver_id": None, "status": BookingStatus.PENDING},
                    ],
                }
            )

        block_update = {
            "driver_id": current_user["id"],
            "passenger_id": passenger_id,
            "reason": reason,
            "updated_at": now,
            "source": "driver_dashboard",
        }
        if booking_context:
            block_update["last_booking_id"] = booking_context.get("id")

        await db.driver_blocked_passengers.update_one(
            {"driver_id": current_user["id"], "passenger_id": passenger_id},
            {
                "$set": block_update,
                "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now, "blocked_at": now},
            },
            upsert=True,
        )
        await cache_delete(f"driver_pending_requests:{current_user['id']}")
        return {"message": "Passenger blocked", "passenger_id": passenger_id}

    await db.driver_blocked_passengers.delete_one({"driver_id": current_user["id"], "passenger_id": passenger_id})
    await cache_delete(f"driver_pending_requests:{current_user['id']}")
    return {"message": "Passenger unblocked", "passenger_id": passenger_id}

@api_router.get("/drivers/blocked-passengers")
async def get_driver_blocked_passengers(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can view blocked passengers")
    blocked_rows = await db.driver_blocked_passengers.find(
        {"driver_id": current_user["id"]}
    ).sort("updated_at", -1).to_list(500)
    blocked_ids = [row.get("passenger_id") for row in blocked_rows if row.get("passenger_id")]
    if not blocked_ids:
        return {"passenger_ids": [], "passengers": []}

    passengers = {
        user["id"]: user
        for user in await db.users.find({"id": {"$in": blocked_ids}}).to_list(None)
    }

    stored_booking_ids = [
        row.get("last_booking_id") or row.get("booking_id")
        for row in blocked_rows
        if row.get("last_booking_id") or row.get("booking_id")
    ]
    related_booking_filters = [
        {"driver_id": current_user["id"]},
        {"candidate_driver_ids": current_user["id"]},
    ]
    if stored_booking_ids:
        related_booking_filters.append({"id": {"$in": stored_booking_ids}})

    related_bookings = await db.bookings.find(
        {
            "passenger_id": {"$in": blocked_ids},
            "$or": related_booking_filters,
        }
    ).sort("created_at", -1).to_list(1000)
    bookings_by_id = {booking.get("id"): booking for booking in related_bookings if booking.get("id")}
    latest_booking_by_passenger = {}
    for booking in related_bookings:
        passenger_id_for_booking = booking.get("passenger_id")
        if passenger_id_for_booking and passenger_id_for_booking not in latest_booking_by_passenger:
            latest_booking_by_passenger[passenger_id_for_booking] = booking

    passengers_payload = []
    for row in blocked_rows:
        passenger_id = row.get("passenger_id")
        if not passenger_id:
            continue
        booking_id = row.get("last_booking_id") or row.get("booking_id")
        booking = bookings_by_id.get(booking_id) or latest_booking_by_passenger.get(passenger_id)
        passengers_payload.append(
            serialize_driver_blocked_passenger(row, passengers.get(passenger_id), booking)
        )

    return {"passenger_ids": blocked_ids, "passengers": passengers_payload}

@api_router.get("/passengers/favorite-drivers")
async def get_favorite_drivers(
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.PASSENGER:
        raise HTTPException(status_code=403, detail="Only passengers can view favorite drivers")
    excluded_driver_ids = set(await get_excluded_driver_ids_for_passenger(current_user["id"]))

    favorite_docs = await db.passenger_favorite_drivers.find(
        {"passenger_id": current_user["id"]}
    ).sort("updated_at", -1).to_list(100)
    driver_ids = [item.get("driver_id") for item in favorite_docs if item.get("driver_id")]
    if not driver_ids:
        return []

    drivers = await db.drivers.find(
        {
            "user_id": {"$in": driver_ids},
            "vehicle_info": {"$ne": None},
            "kyc_status": KYCStatus.APPROVED,
        }
    ).to_list(200)
    users = await db.users.find({"id": {"$in": driver_ids}}).to_list(200)
    users_by_id = {u["id"]: u for u in users}
    drivers_by_id = {d["user_id"]: d for d in drivers}

    active_statuses = [BookingStatus.ACCEPTED, BookingStatus.DRIVER_ARRIVED, BookingStatus.IN_PROGRESS]
    active_bookings = await db.bookings.find(
        {"driver_id": {"$in": driver_ids}, "status": {"$in": active_statuses}}
    ).to_list(300)
    active_driver_ids = {item.get("driver_id") for item in active_bookings if item.get("driver_id")}

    pickup_loc = Location(latitude=latitude, longitude=longitude) if latitude is not None and longitude is not None else None
    results: List[Dict[str, Any]] = []
    for driver_id in driver_ids:
        if excluded_driver_ids and driver_id in excluded_driver_ids:
            continue
        if driver_id in active_driver_ids:
            # Requirement: show favorite if not in active ride.
            continue
        driver = drivers_by_id.get(driver_id)
        user = users_by_id.get(driver_id)
        if not driver or not user:
            continue
        live_location = await get_effective_driver_location(driver)
        if not live_location:
            continue
        driver_loc = Location(**live_location)
        distance = calculate_distance(pickup_loc, driver_loc) if pickup_loc else None
        results.append(
            {
                "driver_id": driver_id,
                "name": user.get("name", "Unknown"),
                "phone": user.get("phone", ""),
                "vehicle_info": driver.get("vehicle_info"),
                "rating": float(driver.get("rating", 5.0)),
                "distance_km": distance,
                "fare_multiplier": float(driver.get("fare_multiplier", 1.0)),
                "location": live_location,
                "is_available": bool(driver.get("is_available", False)),
                "is_favorite": True,
                "in_active_ride": False,
            }
        )

    results.sort(key=lambda item: (99999 if item.get("distance_km") is None else item["distance_km"]))
    return results

@api_router.get("/drivers/pending-requests")
async def get_pending_requests(current_user: dict = Depends(get_current_user)):
    """Get pending booking requests for driver"""
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can access this")
    cache_key = f"driver_pending_requests:{current_user['id']}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return [
            booking for booking in cached
            if not schedule_is_in_future(booking.get("scheduled_for"), get_ist_now())
        ]

    # Get pending bookings that haven't been assigned
    pending = await db.bookings.find({
        "status": BookingStatus.PENDING,
        "driver_id": None,
        "$or": [
            {"candidate_driver_ids": {"$exists": False}},
            {"candidate_driver_ids": []},
            {"candidate_driver_ids": current_user["id"]},
        ],
    }).sort("created_at", -1).to_list(20)
    now_for_schedule = get_ist_now()
    pending = [
        booking for booking in pending
        if not schedule_is_in_future(booking.get("scheduled_for"), now_for_schedule)
    ]
    blocked_passenger_ids = set(await get_driver_blocked_passenger_ids(current_user["id"]))
    passengers_blocked_driver_ids = set(await get_passengers_who_blocked_driver_ids(current_user["id"]))
    pending = [
        booking for booking in pending
        if booking.get("passenger_id") not in blocked_passenger_ids
        and booking.get("passenger_id") not in passengers_blocked_driver_ids
    ]
    driver_gender = str(current_user.get("gender") or "").strip().lower()
    pending = [
        booking
        for booking in pending
        if (not bool(booking.get("women_only_required"))) or driver_gender == "female"
    ]

    filter_preferences = load_driver_ride_filter_preferences([current_user["id"]]).get(current_user["id"])
    if filter_preferences:
        driver_profile = await db.drivers.find_one({"user_id": current_user["id"]}, {"_id": 0}) or {}
        live_location = await get_effective_driver_location(driver_profile)
        passenger_rating_cache: Dict[str, float] = {}
        filtered_pending = []
        for booking in pending:
            passenger_id = str(booking.get("passenger_id") or "")
            if passenger_id not in passenger_rating_cache:
                passenger_rating_cache[passenger_id] = safe_float(
                    (await get_user_rating_summary(passenger_id)).get("average_rating"),
                    5.0,
                )
            pickup_distance = None
            if live_location and booking.get("pickup_location"):
                try:
                    pickup_distance = calculate_distance(Location(**booking["pickup_location"]), Location(**live_location))
                except Exception:
                    pickup_distance = None
            filter_reasons = driver_ride_filter_rejection_reasons(
                filter_preferences,
                booking,
                driver_distance_km=pickup_distance,
                passenger_rating=passenger_rating_cache.get(passenger_id),
                now=get_ist_now(),
            )
            if not filter_reasons:
                filtered_pending.append(booking)
        pending = filtered_pending
    
    # Batch fetch all passengers
    passenger_ids = list(set([b["passenger_id"] for b in pending]))
    passengers = {u["id"]: u for u in await db.users.find({"id": {"$in": passenger_ids}}).to_list(None)} if passenger_ids else {}
    
    results = []
    for booking in pending:
        passenger = passengers.get(booking["passenger_id"])
        results.append({
            **booking,
            "passenger_name": passenger["name"] if passenger else "Unknown",
            "_id": str(booking["_id"])
        })

    await cache_set(cache_key, results, ttl_seconds=10)
    return results


def enum_response_value(value: Any) -> Any:
    return value.value if isinstance(value, Enum) else value


def serialize_driver_upcoming_ride(
    booking: Dict[str, Any],
    passenger: Optional[Dict[str, Any]],
    bucket: str,
    now: datetime,
) -> Dict[str, Any]:
    scheduled_at = as_utc_naive(booking.get("scheduled_for"))
    now_at = as_utc_naive(now)
    minutes_until = None
    if scheduled_at and now_at:
        minutes_until = int((scheduled_at - now_at).total_seconds() / 60)

    return {
        "id": booking.get("id"),
        "passenger_id": booking.get("passenger_id"),
        "passenger_name": passenger.get("name") if passenger else "Unknown",
        "passenger_phone": passenger.get("phone") if passenger else "",
        "driver_id": booking.get("driver_id"),
        "pickup_location": booking.get("pickup_location"),
        "drop_location": booking.get("drop_location"),
        "status": enum_response_value(booking.get("status")),
        "dispatch_status": booking.get("dispatch_status"),
        "estimated_fare": booking.get("estimated_fare"),
        "final_fare": booking.get("final_fare"),
        "distance_km": booking.get("distance_km"),
        "payment_method": enum_response_value(booking.get("payment_method")),
        "scheduled_for": booking.get("scheduled_for"),
        "created_at": booking.get("created_at"),
        "updated_at": booking.get("updated_at"),
        "requested_driver_id": booking.get("requested_driver_id"),
        "bucket": bucket,
        "can_accept": bucket == "scheduled_request" and enum_response_value(booking.get("status")) == BookingStatus.PENDING.value,
        "minutes_until": minutes_until,
        "_id": str(booking.get("_id")) if booking.get("_id") is not None else None,
    }


@api_router.get("/drivers/upcoming-rides")
async def get_driver_upcoming_rides(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can view upcoming rides")

    now = get_ist_now()
    now_utc = as_utc_naive(now) or datetime.utcnow()
    lookback = now_utc - timedelta(hours=3)
    active_statuses = [BookingStatus.PENDING, BookingStatus.ACCEPTED, BookingStatus.DRIVER_ARRIVED, BookingStatus.IN_PROGRESS]

    scheduled_request_query: Dict[str, Any] = {
        "status": BookingStatus.PENDING,
        "driver_id": None,
        "scheduled_for": {"$ne": None, "$gte": lookback},
        "$or": [
            {"candidate_driver_ids": {"$exists": False}},
            {"candidate_driver_ids": []},
            {"candidate_driver_ids": current_user["id"]},
        ],
    }
    assigned_query: Dict[str, Any] = {
        "driver_id": current_user["id"],
        "status": {"$in": active_statuses},
        "scheduled_for": {"$ne": None, "$gte": lookback},
    }

    scheduled_requests, assigned_rides = await asyncio.gather(
        db.bookings.find(scheduled_request_query).sort("scheduled_for", 1).to_list(100),
        db.bookings.find(assigned_query).sort("scheduled_for", 1).to_list(100),
    )

    blocked_passenger_ids = set(await get_driver_blocked_passenger_ids(current_user["id"]))
    passengers_blocked_driver_ids = set(await get_passengers_who_blocked_driver_ids(current_user["id"]))
    driver_gender = str(current_user.get("gender") or "").strip().lower()

    scheduled_requests = [
        booking for booking in scheduled_requests
        if booking.get("passenger_id") not in blocked_passenger_ids
        and booking.get("passenger_id") not in passengers_blocked_driver_ids
        and ((not bool(booking.get("women_only_required"))) or driver_gender == "female")
    ]

    passenger_ids = list({
        booking.get("passenger_id")
        for booking in [*scheduled_requests, *assigned_rides]
        if booking.get("passenger_id")
    })
    passengers = {
        user["id"]: user
        for user in await db.users.find({"id": {"$in": passenger_ids}}).to_list(None)
    } if passenger_ids else {}

    request_payload = [
        serialize_driver_upcoming_ride(booking, passengers.get(booking.get("passenger_id")), "scheduled_request", now)
        for booking in scheduled_requests
    ]
    assigned_payload = [
        serialize_driver_upcoming_ride(booking, passengers.get(booking.get("passenger_id")), "assigned", now)
        for booking in assigned_rides
    ]

    return {
        "scheduled_requests": request_payload,
        "assigned_rides": assigned_payload,
        "upcoming": [*assigned_payload, *request_payload],
        "counts": {
            "scheduled_requests": len(request_payload),
            "assigned_rides": len(assigned_payload),
            "total": len(request_payload) + len(assigned_payload),
        },
    }

@api_router.get("/drivers/active-ride")
async def get_driver_active_ride(current_user: dict = Depends(get_current_user)):
    """Get driver's active ride"""
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can access this")

    cache_key = f"active_ride:driver:{current_user['id']}"
    cached = await cache_get(cache_key)
    if cached is not None:
        return cached

    active_statuses = [BookingStatus.ACCEPTED, BookingStatus.DRIVER_ARRIVED, BookingStatus.IN_PROGRESS]
    active_ride = await db.bookings.find_one({
        "driver_id": current_user["id"],
        "status": {"$in": active_statuses}
    })
    
    if active_ride:
        passenger = await db.users.find_one({"id": active_ride["passenger_id"]})
        active_ride["passenger_name"] = passenger["name"] if passenger else "Unknown"
        active_ride["passenger_phone"] = passenger["phone"] if passenger else ""
        active_ride["_id"] = str(active_ride["_id"])

    await cache_set(cache_key, active_ride, ttl_seconds=20)
    return active_ride

@api_router.get("/drivers/earnings")
async def get_driver_earnings(current_user: dict = Depends(get_current_user)):
    """Get driver's earnings summary"""
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can access this")

    completed_rides = await db.bookings.find({
        "driver_id": current_user["id"],
        "status": BookingStatus.COMPLETED
    }).to_list(5000)

    now = get_ist_now()
    today_start = as_utc_naive(now.replace(hour=0, minute=0, second=0, microsecond=0))
    week_start = as_utc_naive(now - timedelta(days=7))
    month_start = as_utc_naive(now.replace(day=1, hour=0, minute=0, second=0, microsecond=0))

    def ride_updated_at(ride: Dict[str, Any]) -> datetime:
        value = ride.get("updated_at") or ride.get("created_at") or datetime.min
        normalized = as_utc_naive(value) if isinstance(value, (datetime, str)) else None
        return normalized or datetime.min

    total_earnings = sum(booking_fare_value(ride) for ride in completed_rides)
    total_rides = len(completed_rides)
    today_rides = [ride for ride in completed_rides if ride_updated_at(ride) >= today_start]
    weekly_rides = [ride for ride in completed_rides if ride_updated_at(ride) >= week_start]
    monthly_rides = [ride for ride in completed_rides if ride_updated_at(ride) >= month_start]
    payout_overview = await build_driver_payout_overview(current_user["id"], limit=8)

    return {
        "total_earnings": round(total_earnings, 2),
        "total_rides": total_rides,
        "today_earnings": round(sum(booking_fare_value(ride) for ride in today_rides), 2),
        "today_rides": len(today_rides),
        "weekly_earnings": round(sum(booking_fare_value(ride) for ride in weekly_rides), 2),
        "weekly_rides": len(weekly_rides),
        "monthly_earnings": round(sum(booking_fare_value(ride) for ride in monthly_rides), 2),
        "monthly_rides": len(monthly_rides),
        "wallet_balance": payout_overview["wallet_balance"],
        "pending_withdrawal": payout_overview["pending_withdrawal"],
        "bank_verification_status": payout_overview["bank_verification_status"],
        "payout": payout_overview,
        "withdrawals": payout_overview["recent_withdrawals"],
    }


@api_router.post("/drivers/earnings/report")
async def create_driver_earnings_report(
    payload: DriverEarningsReportRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can request earnings reports")

    report = await get_driver_earnings(current_user)
    report_doc = {
        "id": str(uuid.uuid4()),
        "driver_id": current_user["id"],
        "format": payload.format,
        "report": report,
        "created_at": get_ist_now(),
    }
    await db.driver_earnings_reports.insert_one(report_doc)
    report_doc.pop("_id", None)
    return {
        "message": "Driver earnings report generated",
        "report_id": report_doc["id"],
        "report": report,
    }


PAYOUT_REVIEW_SLA_DAYS = 2


def serialize_driver_withdrawal(row: Dict[str, Any]) -> Dict[str, Any]:
    status_value = str(row.get("status") or "pending").strip().lower()
    created_at = row.get("created_at")
    payout_eta = row.get("payout_eta") or row.get("estimated_payout_at")
    if not payout_eta and status_value in {"pending", "approved", "processing"} and isinstance(created_at, datetime):
        payout_eta = created_at + timedelta(days=PAYOUT_REVIEW_SLA_DAYS)

    failure_reason = (
        row.get("failure_reason")
        or row.get("rejection_reason")
        or row.get("reject_reason")
        or row.get("failed_reason")
    )

    return {
        "id": row.get("id"),
        "amount": round(safe_float(row.get("amount"), 0.0), 2),
        "method": row.get("method") or "bank_transfer",
        "status": status_value,
        "created_at": created_at,
        "updated_at": row.get("updated_at"),
        "reviewed_at": row.get("reviewed_at"),
        "processed_at": row.get("processed_at"),
        "payout_eta": payout_eta,
        "failure_reason": failure_reason,
        "admin_note": row.get("admin_note") or row.get("review_note"),
        "bank_account_masked": row.get("bank_account_masked") or row.get("account_masked"),
    }


def get_driver_withdrawal_blocker(bank_status: str, wallet_balance: float) -> Optional[str]:
    normalized_status = str(bank_status or "not_submitted").strip().lower()
    if normalized_status != "verified":
        if normalized_status == "pending_verification":
            return "Bank details are pending verification before payouts can be requested."
        if normalized_status in {"rejected", "failed"}:
            return "Bank verification failed. Update payout bank details before requesting a withdrawal."
        return "Add and verify payout bank details before requesting a withdrawal."
    if wallet_balance <= 0:
        return "No available wallet balance to withdraw."
    return None


async def build_driver_payout_overview(driver_id: str, limit: int = 8) -> Dict[str, Any]:
    wallet = await db.driver_wallets.find_one({"driver_id": driver_id}, {"_id": 0}) or {}
    profile = await db.drivers.find_one({"user_id": driver_id}, {"_id": 0}) or {}
    rows = await db.driver_withdrawal_requests.find(
        {"driver_id": driver_id},
        {"_id": 0},
    ).sort("created_at", -1).to_list(limit)
    withdrawals = [serialize_driver_withdrawal(row) for row in rows]

    wallet_balance = round(safe_float(wallet.get("balance"), 0.0), 2)
    pending_withdrawal = round(safe_float(wallet.get("pending_withdrawal"), 0.0), 2)
    bank_status = str(profile.get("bank_verification_status") or "not_submitted")
    blocker = get_driver_withdrawal_blocker(bank_status, wallet_balance)
    latest = withdrawals[0] if withdrawals else None

    return {
        "wallet_balance": wallet_balance,
        "pending_withdrawal": pending_withdrawal,
        "bank_verification_status": bank_status,
        "bank_account_masked": profile.get("bank_account_masked") or "",
        "bank_name": profile.get("bank_name") or "",
        "can_withdraw": blocker is None,
        "withdrawal_blocker": blocker,
        "latest_status": latest.get("status") if latest else None,
        "latest_failure_reason": latest.get("failure_reason") if latest else None,
        "payout_eta": latest.get("payout_eta") if latest and latest.get("status") in {"pending", "approved", "processing"} else None,
        "recent_withdrawals": withdrawals,
    }


@api_router.get("/drivers/withdrawals")
async def get_driver_withdrawals(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can view withdrawal requests")
    return await build_driver_payout_overview(current_user["id"], limit=50)


@api_router.post("/drivers/withdraw")
async def request_driver_withdrawal(
    payload: DriverWithdrawalRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can request withdrawals")

    amount = round(float(payload.amount), 2)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Withdrawal amount must be greater than zero")

    now = get_ist_now()
    wallet = await db.driver_wallets.find_one({"driver_id": current_user["id"]}, {"_id": 0}) or {}
    balance = round(safe_float(wallet.get("balance"), 0.0), 2)
    driver_profile = await db.drivers.find_one({"user_id": current_user["id"]}, {"_id": 0}) or {}
    bank_status = str(driver_profile.get("bank_verification_status") or "not_submitted")
    bank_blocker = get_driver_withdrawal_blocker(bank_status, balance)
    if bank_blocker:
        raise HTTPException(status_code=400, detail=bank_blocker)
    if amount > balance:
        raise HTTPException(status_code=400, detail="Withdrawal amount exceeds wallet balance")

    withdrawal_id = str(uuid.uuid4())
    payout_eta = now + timedelta(days=PAYOUT_REVIEW_SLA_DAYS)
    update_result = await db.driver_wallets.update_one(
        {"driver_id": current_user["id"], "balance": {"$gte": amount}},
        {
            "$inc": {"balance": -amount, "pending_withdrawal": amount},
            "$set": {"updated_at": now},
            "$setOnInsert": {"created_at": now},
        },
        upsert=False,
    )
    if update_result.modified_count == 0:
        raise HTTPException(status_code=400, detail="Wallet balance changed. Refresh and try again.")

    request_doc = {
        "id": withdrawal_id,
        "driver_id": current_user["id"],
        "amount": amount,
        "method": payload.method,
        "status": "pending",
        "approval_status": "pending_admin_review",
        "bank_verification_status": bank_status,
        "bank_account_masked": driver_profile.get("bank_account_masked") or "",
        "payout_eta": payout_eta,
        "failure_reason": None,
        "status_history": [
            {
                "status": "pending",
                "at": now,
                "note": "Submitted for admin payout review",
            }
        ],
        "created_at": now,
        "updated_at": now,
    }
    await db.driver_withdrawal_requests.insert_one(request_doc)
    return {
        "message": "Withdrawal request submitted",
        "withdrawal_id": withdrawal_id,
        "status": "pending",
        "amount": amount,
        "payout_eta": payout_eta,
        "withdrawal": serialize_driver_withdrawal(request_doc),
    }


@api_router.get("/admin/drivers/bank/pending")
async def get_pending_driver_bank_reviews(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    rows = await db.drivers.find(
        {"bank_verification_status": {"$in": ["pending_verification", "pending"]}},
        {"_id": 0, "bank_account_encrypted": 0},
    ).sort("bank_submitted_at", -1).to_list(200)
    driver_ids = [row.get("user_id") for row in rows if row.get("user_id")]
    users = {
        user["id"]: user
        for user in await db.users.find({"id": {"$in": driver_ids}}, {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1}).to_list(None)
    } if driver_ids else {}

    return {
        "requests": [
            {
                "driver_id": row.get("user_id"),
                "driver_name": (users.get(row.get("user_id")) or {}).get("name") or "Driver",
                "driver_phone": (users.get(row.get("user_id")) or {}).get("phone") or "",
                "driver_email": (users.get(row.get("user_id")) or {}).get("email") or "",
                "bank_name": row.get("bank_name") or "",
                "bank_account_masked": row.get("bank_account_masked") or "",
                "bank_ifsc": row.get("bank_ifsc") or "",
                "status": row.get("bank_verification_status") or "pending_verification",
                "submitted_at": row.get("bank_submitted_at") or row.get("bank_updated_at"),
            }
            for row in rows
        ],
        "total": len(rows),
    }


@api_router.put("/admin/drivers/bank/{driver_id}")
async def review_driver_bank_details(
    driver_id: str,
    review: DriverBankReview,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    if review.status in {"rejected", "failed"} and not review.reject_reason:
        raise HTTPException(status_code=400, detail="Reject reason is required")

    existing = await db.drivers.find_one({"user_id": driver_id}, {"_id": 0, "bank_verification_status": 1})
    if not existing:
        raise HTTPException(status_code=404, detail="Driver profile not found")

    now = get_ist_now()
    update_fields = {
        "bank_verification_status": review.status,
        "bank_reviewed_by": current_user["id"],
        "bank_reviewed_at": now,
        "bank_reject_reason": review.reject_reason if review.status in {"rejected", "failed"} else None,
        "updated_at": now,
    }
    await db.drivers.update_one({"user_id": driver_id}, {"$set": update_fields})
    await notify_user(
        driver_id,
        "Payout bank details reviewed",
        "Your payout bank details were verified." if review.status == "verified" else "Your payout bank details need changes.",
        {
            "type": "driver_bank_review",
            "status": review.status,
            "reject_reason": review.reject_reason,
            "severity": "success" if review.status == "verified" else "warning",
        },
    )
    return {"message": "Driver bank review updated", "driver_id": driver_id, "status": review.status}


@api_router.get("/admin/driver-withdrawals")
async def get_admin_driver_withdrawals(
    status_filter: Optional[str] = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    query: Dict[str, Any] = {}
    if status_filter:
        query["status"] = status_filter
    rows = await db.driver_withdrawal_requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(limit)
    driver_ids = [row.get("driver_id") for row in rows if row.get("driver_id")]
    users = {
        user["id"]: user
        for user in await db.users.find({"id": {"$in": driver_ids}}, {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1}).to_list(None)
    } if driver_ids else {}
    profiles = {
        row["user_id"]: row
        for row in await db.drivers.find({"user_id": {"$in": driver_ids}}, {"_id": 0, "user_id": 1, "bank_name": 1, "bank_account_masked": 1, "bank_ifsc": 1, "bank_verification_status": 1}).to_list(None)
    } if driver_ids else {}

    withdrawals = []
    for row in rows:
        driver_id = row.get("driver_id")
        user = users.get(driver_id) or {}
        profile = profiles.get(driver_id) or {}
        withdrawals.append(
            {
                **serialize_driver_withdrawal(row),
                "driver_id": driver_id,
                "driver_name": user.get("name") or "Driver",
                "driver_phone": user.get("phone") or "",
                "driver_email": user.get("email") or "",
                "bank_name": profile.get("bank_name") or "",
                "bank_account_masked": profile.get("bank_account_masked") or row.get("bank_account_masked") or "",
                "bank_ifsc": profile.get("bank_ifsc") or "",
                "bank_verification_status": profile.get("bank_verification_status") or row.get("bank_verification_status"),
            }
        )

    return {"withdrawals": withdrawals, "total": len(withdrawals)}


@api_router.put("/admin/driver-withdrawals/{withdrawal_id}")
async def review_driver_withdrawal(
    withdrawal_id: str,
    review: DriverWithdrawalReview,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    if review.status in {"rejected", "failed"} and not review.failure_reason and not review.admin_note:
        raise HTTPException(status_code=400, detail="A rejection or failure reason is required")

    withdrawal = await db.driver_withdrawal_requests.find_one({"id": withdrawal_id}, {"_id": 0})
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal request not found")

    current_status = str(withdrawal.get("status") or "pending").lower()
    terminal_statuses = {"paid", "rejected", "failed", "cancelled"}
    if current_status in terminal_statuses and review.status != current_status:
        raise HTTPException(status_code=400, detail="Terminal withdrawal requests cannot be changed")

    now = get_ist_now()
    amount = round(safe_float(withdrawal.get("amount"), 0.0), 2)
    driver_id = str(withdrawal.get("driver_id") or "")
    update_fields: Dict[str, Any] = {
        "status": review.status,
        "approval_status": review.status,
        "updated_at": now,
        "reviewed_by": current_user["id"],
        "reviewed_at": now,
        "admin_note": review.admin_note,
        "failure_reason": review.failure_reason if review.status in {"rejected", "failed"} else None,
        "payout_reference": review.payout_reference,
    }
    if review.status == "paid":
        update_fields["processed_at"] = now
    if review.status in {"rejected", "failed"}:
        update_fields["processed_at"] = now

    wallet_inc: Dict[str, float] = {}
    if current_status not in terminal_statuses:
        if review.status == "paid":
            wallet_inc["pending_withdrawal"] = -amount
        elif review.status in {"rejected", "failed"}:
            wallet_inc["pending_withdrawal"] = -amount
            wallet_inc["balance"] = amount
    if wallet_inc and driver_id:
        await db.driver_wallets.update_one(
            {"driver_id": driver_id},
            {"$inc": wallet_inc, "$set": {"updated_at": now}},
        )

    history_entry = {
        "status": review.status,
        "at": now,
        "by": current_user["id"],
        "note": review.admin_note or review.failure_reason or "",
        "payout_reference": review.payout_reference,
    }
    await db.driver_withdrawal_requests.update_one(
        {"id": withdrawal_id},
        {"$set": update_fields, "$push": {"status_history": history_entry}},
    )

    if driver_id:
        await notify_user(
            driver_id,
            "Withdrawal updated",
            f"Your withdrawal request is now {review.status}.",
            {
                "type": "driver_withdrawal_review",
                "withdrawal_id": withdrawal_id,
                "status": review.status,
                "amount": amount,
                "severity": "success" if review.status == "paid" else "warning" if review.status in {"rejected", "failed"} else "info",
            },
        )

    updated = await db.driver_withdrawal_requests.find_one({"id": withdrawal_id}, {"_id": 0})
    return {"message": "Withdrawal updated", "withdrawal": serialize_driver_withdrawal(updated or {**withdrawal, **update_fields})}

# ==================== BOOKING ENDPOINTS ====================
@api_router.post("/bookings", response_model=BookingResponse)
async def create_booking(
    booking: BookingCreate,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.PASSENGER:
        raise HTTPException(status_code=403, detail="Only passengers can create bookings")
    await ensure_user_can_take_ride_actions(current_user, "creating bookings")

    active_statuses = [
        BookingStatus.PENDING,
        BookingStatus.ACCEPTED,
        BookingStatus.DRIVER_ARRIVED,
        BookingStatus.IN_PROGRESS,
    ]
    existing_active_booking = await db.bookings.find_one(
        {
            "passenger_id": current_user["id"],
            "status": {"$in": active_statuses},
        },
        sort=[("created_at", -1)],
    )
    if existing_active_booking and not booking.allow_parallel:
        raise HTTPException(
            status_code=409,
            detail=(
                "Active booking already in progress. "
                "Confirm and retry with allow_parallel=true to add another booking."
            ),
        )

    pricing = await get_pricing_rules()
    radius_cfg = get_driver_search_radius_config(pricing)
    base_radius_km = float(radius_cfg["base_radius_km"])
    long_radius_km = float(radius_cfg["long_radius_km"])
    route_metrics = await get_route_metrics(booking.pickup_location, booking.drop_location)
    distance = float(route_metrics["distance_km"])
    time_multiplier = get_time_multiplier()

    distance_fare = distance * pricing.per_km_rate
    route_fare = (pricing.base_fare + distance_fare) * time_multiplier
    route_fare = max(route_fare, pricing.minimum_fare)

    booking_id = str(uuid.uuid4())
    now = get_ist_now()
    scheduled_for = as_utc_naive(booking.scheduled_for)
    is_scheduled = schedule_is_in_future(scheduled_for, now)

    selected_driver_id = str(booking.selected_driver_id or "").strip() or None
    excluded_driver_ids = set(await get_excluded_driver_ids_for_passenger(current_user["id"]))
    selected_driver_profile: Optional[Dict[str, Any]] = None
    selected_driver_pricing: Optional[PricingRule] = None
    candidate_driver_ids: List[str] = []
    surge_multiplier = 1.0
    dispatch_algorithm = "intelligent_v1"
    dispatch_status = "searching"
    fraud_review_required = False
    dispatch_demand_supply: Optional[Dict[str, Any]] = None
    dispatch_fraud_ai: Optional[Dict[str, Any]] = None
    dispatch_ai_ranked_drivers: List[Dict[str, Any]] = []

    if selected_driver_id:
        dispatch_algorithm = "manual_selected_driver_v1"
        if selected_driver_id in excluded_driver_ids:
            raise HTTPException(status_code=400, detail="This driver is blocked for your account")
        selected_driver_query: Dict[str, Any] = {
            "user_id": selected_driver_id,
            "vehicle_info": {"$ne": None},
            "kyc_status": KYCStatus.APPROVED,
        }
        if not is_scheduled:
            selected_driver_query["is_available"] = True
        selected_driver_profile = await db.drivers.find_one(selected_driver_query)
        if not selected_driver_profile:
            raise HTTPException(status_code=400, detail="Selected driver is unavailable right now")
        selected_driver_live_location = await get_effective_driver_location(selected_driver_profile)
        if not selected_driver_live_location:
            raise HTTPException(status_code=400, detail="Selected driver has no active live location")
        selected_driver_profile["current_location"] = selected_driver_live_location
        selected_driver_pricing = await get_effective_pricing_for_driver_profile(selected_driver_profile, pricing)
        selected_radius_cfg = get_driver_search_radius_config(selected_driver_pricing)
        selected_long_radius_km = float(selected_radius_cfg["long_radius_km"])
        try:
            selected_driver_distance = calculate_distance(
                booking.pickup_location,
                Location(**selected_driver_live_location),
            )
        except Exception:
            selected_driver_distance = None
        if selected_driver_distance is None or selected_driver_distance > selected_long_radius_km:
            raise HTTPException(
                status_code=400,
                detail=f"Selected driver is outside max search radius ({selected_long_radius_km} km)",
            )
        if (not is_scheduled) and await is_driver_in_active_ride(selected_driver_id):
            raise HTTPException(status_code=400, detail="Selected driver is currently on an active ride")
        candidate_driver_ids = [selected_driver_id]
    elif not is_scheduled:
        booking_preview = {
            "id": booking_id,
            "passenger_id": current_user["id"],
            "pickup_location": booking.pickup_location.dict(),
            "drop_location": booking.drop_location.dict(),
            "estimated_fare": round(route_fare, 2),
            "created_at": now,
        }
        ranked_drivers = await intelligent_find_drivers_for_booking(
            booking_preview,
            limit=5,
            max_radius_km=base_radius_km,
            excluded_driver_ids=list(excluded_driver_ids),
        )
        if not ranked_drivers:
            ranked_drivers = await intelligent_find_drivers_for_booking(
                booking_preview,
                limit=8,
                max_radius_km=long_radius_km,
                excluded_driver_ids=list(excluded_driver_ids),
            )
        candidate_driver_ids = [item["driver_id"] for item in ranked_drivers]
        dispatch_ai_ranked_drivers = ranked_drivers[:10]
        if ranked_drivers:
            top_ranked = ranked_drivers[0]
            surge_multiplier = max(1.0, safe_float(top_ranked.get("surge_multiplier"), 1.0))
            dispatch_demand_supply = top_ranked.get("demand_supply")
            dispatch_fraud_ai = top_ranked.get("fraud_risk")
            fraud_review_required = bool((dispatch_fraud_ai or {}).get("flagged"))
        else:
            fraud_risk = await detect_dispatch_fraud(current_user["id"], booking.pickup_location.dict())
            dispatch_fraud_ai = fraud_risk
            fraud_review_required = bool(fraud_risk.get("flagged"))
    else:
        dispatch_algorithm = "scheduled_radius_v1"
        dispatch_status = "scheduled"
        scheduled_radius_km = float(radius_cfg["scheduled_radius_km"])
        scheduled_candidates = await find_candidate_drivers_for_scheduled_booking(
            booking.pickup_location,
            max_search_radius_km=scheduled_radius_km,
            excluded_driver_ids=list(excluded_driver_ids),
        )
        candidate_driver_ids = [item["user_id"] for item in scheduled_candidates]

    effective_pricing_for_estimate = selected_driver_pricing or pricing
    route_fare_for_estimate = (effective_pricing_for_estimate.base_fare + (distance * effective_pricing_for_estimate.per_km_rate)) * time_multiplier
    route_fare_for_estimate = max(route_fare_for_estimate, effective_pricing_for_estimate.minimum_fare)
    estimated_fare = round(route_fare_for_estimate, 2)
    if (not selected_driver_id) and (not is_scheduled):
        estimated_fare = round(estimated_fare * surge_multiplier, 2)
    
    # Apply vehicle type multiplier if provided
    vehicle_type_multiplier = 1.0
    if booking.vehicle_type_id:
        try:
            vehicle_type = await db.vehicle_types.find_one({'vehicle_type_id': booking.vehicle_type_id})
            if vehicle_type:
                vehicle_type_multiplier = float(vehicle_type.get('base_multiplier', 1.0))
                estimated_fare = round(estimated_fare * vehicle_type_multiplier, 2)
        except Exception as e:
            logger.warning(f"Failed to fetch vehicle type {booking.vehicle_type_id}: {str(e)}")

    booking_dict = {
        "id": booking_id,
        "passenger_id": current_user["id"],
        "driver_id": None,
        "pickup_location": booking.pickup_location.dict(),
        "pickup_location_geo": {
            "type": "Point",
            "coordinates": [float(booking.pickup_location.longitude), float(booking.pickup_location.latitude)],
        },
        "drop_location": booking.drop_location.dict(),
        "drop_location_geo": {
            "type": "Point",
            "coordinates": [float(booking.drop_location.longitude), float(booking.drop_location.latitude)],
        },
        "status": BookingStatus.PENDING,
        "estimated_fare": estimated_fare,
        "base_estimated_fare": round(route_fare_for_estimate, 2),
        "base_route_fare": estimated_fare,
        "surge_multiplier": surge_multiplier,
        "vehicle_type_multiplier": vehicle_type_multiplier,
        "vehicle_type_id": booking.vehicle_type_id,
        "dispatch_algorithm": dispatch_algorithm,
        "dispatch_status": dispatch_status,
        "dispatch_attempt_count": 0,
        "fraud_review_required": fraud_review_required,
        "fraud_ai": dispatch_fraud_ai,
        "demand_supply": dispatch_demand_supply,
        "pickup_heat_cell": dispatch_heat_cell(booking.pickup_location.dict()),
        "ai_ranked_drivers": dispatch_ai_ranked_drivers,
        "fare_time_multiplier": round(time_multiplier, 4),
        "pickup_surcharge": 0.0,
        "extra_pickup_distance_km": 0.0,
        "driver_to_pickup_distance_km": None,
        "actual_distance_km": 0.0,
        "trip_start_location": None,
        "trip_last_location": None,
        "trip_last_location_at": None,
        "trip_path_points": [],
        "trip_started_at": None,
        "trip_completed_at": None,
        "final_fare": None,
        "distance_km": distance,
        "eta_minutes": int(route_metrics.get("eta_minutes", 0)),
        "route_source": route_metrics.get("source", "haversine_fallback"),
        "route_polyline": route_metrics.get("route_polyline"),
        "payment_method": booking.payment_method,
        "scheduled_for": scheduled_for,
        "created_at": now,
        "updated_at": now,
        "assigned_at": None,
        "requested_driver_id": selected_driver_id,
        "candidate_driver_ids": candidate_driver_ids,
        "driver_search_radius_km": {
            "base_radius_km": base_radius_km,
            "long_radius_km": long_radius_km,
            "scheduled_radius_km": float(radius_cfg["scheduled_radius_km"]),
        },
        "ride_start_otp": None,
        "ride_start_otp_generated_at": None,
        "ride_start_otp_verified_at": None,
        "ride_end_otp": None,
        "ride_end_otp_generated_at": None,
        "ride_end_otp_verified_at": None,
        "ride_end_otp_bypass_reason": None,
    }

    await db.bookings.insert_one(booking_dict)
    await audit_log(
        request=request,
        user_id=current_user["id"],
        action="BOOKING_CREATED",
        resource="booking",
        success=True,
        metadata={"booking_id": booking_id},
    )
    await write_analytics_event(
        "BOOKING_CREATED",
        current_user["id"],
        {
            "booking_id": booking_id,
            "pickup": booking.pickup_location.dict(),
            "drop": booking.drop_location.dict(),
            "estimated_fare": estimated_fare,
        },
    )
    await clear_active_ride_cache(None, current_user["id"])
    await clear_driver_pending_request_cache(candidate_driver_ids)
    if not is_scheduled:
        await enqueue_ride(booking_id)

    if is_scheduled and scheduled_for:
        asyncio.create_task(schedule_booking_assignment(booking_id, scheduled_for))
        await emit_new_booking_to_drivers(
            booking_id=booking_id,
            target_driver_ids=candidate_driver_ids or None,
            include_unavailable=True,
        )
        await notify_user(
            current_user["id"],
            title="Ride Scheduled",
            body=(
                f"Your ride is scheduled for {scheduled_for.isoformat()} UTC. "
                f"Request shared with drivers within {float(radius_cfg['scheduled_radius_km']):.1f} km."
            ),
            data={
                "booking_id": booking_id,
                "scheduled_for": scheduled_for.isoformat(),
                "candidate_driver_count": len(candidate_driver_ids),
            },
        )
    else:
        await emit_new_booking_to_drivers(booking_id=booking_id, target_driver_ids=candidate_driver_ids or None)
        if selected_driver_id:
            await notify_user(
                selected_driver_id,
                title="New Ride Request",
                body="You have a new targeted ride request.",
                data={"booking_id": booking_id},
            )
            await notify_user(
                current_user["id"],
                title="Ride Requested",
                body="Your request has been sent to the selected driver.",
                data={"booking_id": booking_id, "requested_driver_id": selected_driver_id},
            )
        elif candidate_driver_ids:
            await notify_user(
                current_user["id"],
                title="Finding Driver",
                body=f"We sent your request to the nearest {len(candidate_driver_ids)} drivers.",
                data={"booking_id": booking_id, "candidate_driver_ids": candidate_driver_ids},
            )
        else:
            asyncio.create_task(retry_auto_assignment_for_pending_booking(booking_id))
            await notify_user(
                current_user["id"],
                title="Finding Driver",
                body="We are matching your ride request with nearby drivers.",
                data={"booking_id": booking_id},
            )

    return BookingResponse(
        **booking_dict,
        passenger_name=current_user["name"]
    )

@api_router.get("/bookings", response_model=List[BookingResponse])
async def get_bookings(
    current_user: dict = Depends(get_current_user),
    status_filter: Optional[str] = Query(None, alias="status"),
    status_in: Optional[str] = Query(None),
    history: bool = Query(False),
    limit: int = Query(100, ge=1, le=200),
    skip: int = Query(0, ge=0),
):
    """Get user's bookings"""
    query = {}
    if current_user["role"] == UserRole.PASSENGER:
        query["passenger_id"] = current_user["id"]
    elif current_user["role"] == UserRole.DRIVER:
        query["driver_id"] = current_user["id"]

    valid_status_values = {status.value for status in BookingStatus}
    if status_in:
        statuses = [
            item.strip().lower()
            for item in status_in.split(",")
            if item.strip().lower() in valid_status_values
        ]
        if statuses:
            query["status"] = {"$in": statuses}
    elif status_filter and status_filter.lower() != "all":
        normalized_status = status_filter.strip().lower()
        if normalized_status in valid_status_values:
            query["status"] = normalized_status
    elif history:
        query["status"] = {
            "$in": [
                BookingStatus.COMPLETED.value,
                BookingStatus.CANCELLED.value,
                BookingStatus.NO_DRIVER_FOUND.value,
                BookingStatus.REJECTED.value,
                BookingStatus.BOOKING_FAILED.value,
            ]
        }
    
    bookings = await db.bookings.find(query).sort("created_at", -1).skip(skip).to_list(limit)
    
    # Batch fetch all unique user IDs and driver IDs
    passenger_ids = list(set([b["passenger_id"] for b in bookings]))
    driver_ids = list(set([b["driver_id"] for b in bookings if b.get("driver_id")]))
    all_user_ids = list(set(passenger_ids + driver_ids))
    
    # Fetch all users and drivers in batch
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": all_user_ids}}).to_list(None)} if all_user_ids else {}
    driver_profiles = {d["user_id"]: d for d in await db.drivers.find({"user_id": {"$in": driver_ids}}).to_list(None)} if driver_ids else {}
    
    results = []
    for b in bookings:
        passenger = users.get(b["passenger_id"])
        driver = users.get(b.get("driver_id")) if b.get("driver_id") else None
        driver_profile = driver_profiles.get(b.get("driver_id")) if b.get("driver_id") else None
        
        results.append(BookingResponse(
            id=b["id"],
            passenger_id=b["passenger_id"],
            passenger_name=passenger["name"] if passenger else None,
            driver_id=b.get("driver_id"),
            driver_name=driver["name"] if driver else None,
            driver_phone=driver["phone"] if driver else None,
            vehicle_info=VehicleInfo(**driver_profile["vehicle_info"]) if driver_profile and driver_profile.get("vehicle_info") else None,
            pickup_location=Location(**b["pickup_location"]),
            drop_location=Location(**b["drop_location"]),
            status=b["status"],
            estimated_fare=b["estimated_fare"],
            pickup_surcharge=float(b.get("pickup_surcharge", 0.0) or 0.0),
            extra_pickup_distance_km=float(b.get("extra_pickup_distance_km", 0.0) or 0.0),
            final_fare=b.get("final_fare"),
            actual_distance_km=float(b.get("actual_distance_km", 0.0) or 0.0),
            distance_km=b["distance_km"],
            payment_method=b["payment_method"],
            scheduled_for=b.get("scheduled_for"),
            created_at=b["created_at"],
            updated_at=b["updated_at"]
        ))
    
    return results

@api_router.get("/bookings/active")
async def get_active_booking(current_user: dict = Depends(get_current_user)):
    """Get user's active booking"""
    active_statuses = [BookingStatus.PENDING, BookingStatus.ACCEPTED, BookingStatus.DRIVER_ARRIVED, BookingStatus.IN_PROGRESS]
    
    query = {"status": {"$in": active_statuses}}
    if current_user["role"] == UserRole.PASSENGER:
        query["passenger_id"] = current_user["id"]
    elif current_user["role"] == UserRole.DRIVER:
        query["driver_id"] = current_user["id"]
    
    booking = await db.bookings.find_one(query)
    
    if booking:
        passenger = await db.users.find_one({"id": booking["passenger_id"]})
        driver = await db.users.find_one({"id": booking.get("driver_id")}) if booking.get("driver_id") else None
        driver_profile = await db.drivers.find_one({"user_id": booking.get("driver_id")}) if booking.get("driver_id") else None
        driver_live_location = await get_effective_driver_location(driver_profile) if driver_profile else None

        payload = {
            **booking,
            "_id": str(booking["_id"]),
            "passenger_name": passenger["name"] if passenger else None,
            "passenger_phone": passenger["phone"] if passenger else None,
            "driver_name": driver["name"] if driver else None,
            "driver_phone": driver["phone"] if driver else None,
            "vehicle_info": driver_profile["vehicle_info"] if driver_profile and driver_profile.get("vehicle_info") else None,
            "driver_location": driver_live_location,
            "route_polyline": booking.get("route_polyline")
        }
        if current_user["role"] != UserRole.PASSENGER:
            payload.pop("ride_start_otp", None)
            payload.pop("ride_end_otp", None)
        return payload
    
    return None

@api_router.get("/bookings/{booking_id}")
async def get_booking(booking_id: str, current_user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    ensure_booking_participant(booking, current_user)

    payload = dict(booking)
    if current_user["role"] != UserRole.PASSENGER:
        payload.pop("ride_start_otp", None)
        payload.pop("ride_end_otp", None)
    return payload

def booking_location_label(booking: Dict[str, Any], key: str, fallback: str) -> str:
    location = booking.get(key)
    if isinstance(location, dict):
        return (
            str(location.get("address") or location.get("name") or "").strip()
            or fallback
        )
    if isinstance(location, str) and location.strip():
        return location.strip()
    return fallback

def receipt_money(value: Any) -> float:
    try:
        return round(float(value or 0.0), 2)
    except (TypeError, ValueError):
        return 0.0

async def build_booking_receipt_payload(booking: Dict[str, Any], current_user: Dict[str, Any]) -> Dict[str, Any]:
    ensure_booking_participant(booking, current_user)

    passenger_id = booking.get("passenger_id")
    driver_id = booking.get("driver_id")
    users = {}
    user_ids = [user_id for user_id in [passenger_id, driver_id] if user_id]
    if user_ids:
        users = {user["id"]: user for user in await db.users.find({"id": {"$in": user_ids}}, {"_id": 0, "id": 1, "name": 1, "phone": 1}).to_list(None)}

    total = receipt_money(booking.get("final_fare") if booking.get("final_fare") is not None else booking.get("estimated_fare"))
    pickup_surcharge = receipt_money(booking.get("pickup_surcharge"))
    tax_amount = receipt_money(booking.get("tax_amount") or booking.get("taxes") or booking.get("gst_amount"))
    discount = receipt_money(booking.get("discount"))
    route_fare = receipt_money(
        booking.get("base_route_fare")
        or booking.get("base_estimated_fare")
        or max(0.0, total - pickup_surcharge - tax_amount + discount)
    )
    distance_km = receipt_money(booking.get("actual_distance_km") or booking.get("distance_km"))
    created_at = booking.get("trip_completed_at") or booking.get("updated_at") or booking.get("created_at") or get_ist_now()
    status_value = enum_response_value(booking.get("status"))
    payment_status = (
        "completed"
        if status_value == BookingStatus.COMPLETED.value
        else str(booking.get("payment_status") or status_value or "pending")
    )

    breakdown = [
        {"label": "Route fare", "amount": route_fare},
    ]
    if pickup_surcharge > 0:
        breakdown.append({"label": "Pickup surcharge", "amount": pickup_surcharge})
    if tax_amount > 0:
        breakdown.append({"label": "Taxes", "amount": tax_amount})
    if discount > 0:
        breakdown.append({"label": "Discount", "amount": -discount})

    return {
        "id": f"RCP-{str(booking.get('id', ''))[:8].upper()}",
        "booking_id": booking.get("id"),
        "date": created_at,
        "status": status_value,
        "from": booking_location_label(booking, "pickup_location", "Pickup"),
        "to": booking_location_label(booking, "drop_location", "Drop"),
        "passenger_name": (users.get(passenger_id) or {}).get("name") or booking.get("passenger_name") or "Passenger",
        "driver_name": (users.get(driver_id) or {}).get("name") or booking.get("driver_name") or "Driver",
        "distance_km": distance_km,
        "duration_minutes": int(booking.get("duration_minutes") or booking.get("eta_minutes") or 0),
        "payment_method": str(booking.get("payment_method") or "cash").upper(),
        "payment_status": payment_status,
        "breakdown": breakdown,
        "subtotal": receipt_money(sum(item["amount"] for item in breakdown)),
        "total": total,
        "currency": "INR",
        "dispute_reference": f"booking:{booking.get('id')}",
        "download_url": f"/api/bookings/{booking.get('id')}/receipt/export?format=text",
    }

@api_router.get("/bookings/{booking_id}/receipt")
async def get_booking_receipt(booking_id: str, current_user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return await build_booking_receipt_payload(booking, current_user)

@api_router.get("/bookings/{booking_id}/receipt/export")
async def export_booking_receipt(
    booking_id: str,
    format: str = Query("text", pattern="^(text|txt)$"),
    current_user: dict = Depends(get_current_user),
):
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    receipt = await build_booking_receipt_payload(booking, current_user)
    lines = [
        f"AutoBuddy Receipt {receipt['id']}",
        f"Booking: {receipt['booking_id']}",
        f"Date: {receipt['date']}",
        f"Status: {receipt['status']}",
        f"Ride: {receipt['from']} -> {receipt['to']}",
        f"Passenger: {receipt['passenger_name']}",
        f"Driver: {receipt['driver_name']}",
        f"Distance: {receipt['distance_km']} km",
        "Fare breakdown:",
        *[f"- {item['label']}: INR {receipt_money(item['amount']):.2f}" for item in receipt["breakdown"]],
        f"Total: INR {receipt['total']:.2f}",
        f"Payment: {receipt['payment_method']} ({receipt['payment_status']})",
        f"Dispute reference: {receipt['dispute_reference']}",
    ]
    return PlainTextResponse(
        "\n".join(lines),
        headers={
            "Content-Disposition": f"attachment; filename=autobuddy-receipt-{str(booking_id)[:12]}.txt"
        },
    )

@api_router.get("/bookings/{booking_id}/chat", response_model=List[BookingChatMessageResponse])
async def list_booking_chat(booking_id: str, current_user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    ensure_booking_participant(booking, current_user)
    if not booking_status_allows_live_comm(booking.get("status")):
        return []

    rows = await db.booking_chat.find({"booking_id": booking_id}).sort("created_at", 1).to_list(120)
    out: List[BookingChatMessageResponse] = []
    for row in rows:
        out.append(
            BookingChatMessageResponse(
                id=row["id"],
                booking_id=row["booking_id"],
                sender_id=row["sender_id"],
                sender_name=row.get("sender_name", "User"),
                sender_role=row.get("sender_role", UserRole.PASSENGER),
                message=row["message"],
                created_at=row["created_at"],
            )
        )
    return out

@api_router.post("/bookings/{booking_id}/chat", response_model=BookingChatMessageResponse)
async def post_booking_chat(
    booking_id: str,
    payload: BookingChatMessageCreate,
    current_user: dict = Depends(get_current_user),
):
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    ensure_booking_participant(booking, current_user)
    if not booking_status_allows_live_comm(booking.get("status")):
        raise HTTPException(
            status_code=400,
            detail="In-app chat is available only from ride acceptance until completion",
        )

    now = get_ist_now()
    message_doc = {
        "id": str(uuid.uuid4()),
        "booking_id": booking_id,
        "sender_id": current_user["id"],
        "sender_name": current_user.get("name", "User"),
        "sender_role": current_user.get("role", UserRole.PASSENGER),
        "message": payload.message.strip(),
        "created_at": now,
    }
    await db.booking_chat.insert_one(message_doc)

    chat_payload = {
        "id": message_doc["id"],
        "booking_id": booking_id,
        "sender_id": message_doc["sender_id"],
        "sender_name": message_doc["sender_name"],
        "sender_role": str(message_doc["sender_role"]),
        "message": message_doc["message"],
        "created_at": now.isoformat(),
    }
    passenger_id = booking.get("passenger_id")
    driver_id = booking.get("driver_id")
    if passenger_id:
        await emit_to_user(passenger_id, "booking_chat_message", chat_payload)
    if driver_id and driver_id != passenger_id:
        await emit_to_user(driver_id, "booking_chat_message", chat_payload)

    return BookingChatMessageResponse(**message_doc)

@api_router.get("/bookings/{booking_id}/call-room", response_model=BookingCallRoomResponse)
async def get_booking_call_room(booking_id: str, current_user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    ensure_booking_participant(booking, current_user)
    if not booking_status_allows_live_comm(booking.get("status")):
        raise HTTPException(
            status_code=400,
            detail="Web call is available only from ride acceptance until completion",
        )

    room_name = build_booking_call_room_name(booking_id)
    room_url = f"https://meet.jit.si/{room_name}"
    return BookingCallRoomResponse(
        booking_id=booking_id,
        room_name=room_name,
        room_url=room_url,
    )

@api_router.put("/bookings/{booking_id}/accept")
async def accept_booking(booking_id: str, current_user: dict = Depends(get_current_user)):
    """Driver accepts a booking"""
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can accept bookings")
    await ensure_user_can_take_ride_actions(current_user, "accepting bookings")
    
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    if booking["status"] != BookingStatus.PENDING:
        raise HTTPException(status_code=400, detail="Booking is no longer available")
    candidate_driver_ids = booking.get("candidate_driver_ids") or []
    if candidate_driver_ids and current_user["id"] not in candidate_driver_ids:
        raise HTTPException(status_code=403, detail="This booking request is not assigned to you")
    if bool(booking.get("women_only_required")) and str(current_user.get("gender") or "").strip().lower() != "female":
        raise HTTPException(status_code=403, detail="Women-only rides can be accepted only by women drivers")
    if await is_driver_passenger_pair_blocked(booking.get("passenger_id"), current_user["id"]):
        raise HTTPException(status_code=403, detail="You cannot accept this ride because this passenger is blocked")
    
    pricing = await get_pricing_rules()
    # Get driver's fare multiplier
    driver_profile = await db.drivers.find_one({"user_id": current_user["id"]})
    fare_multiplier = float(driver_profile.get("fare_multiplier", 1.0)) if driver_profile else 1.0
    effective_pricing = await get_effective_pricing_for_driver_profile(driver_profile, pricing)
    driver_live_location = await get_effective_driver_location(driver_profile) if driver_profile else None
    pickup_charge = compute_driver_pickup_charge(
        driver_location=driver_live_location,
        pickup_location=booking.get("pickup_location") or {},
        pricing=effective_pricing,
    )
    await db.dispatch_attempts.update_one(
        {
            "booking_id": booking_id,
            "driver_id": current_user["id"],
        },
        {
            "$set": {
                "response": "accepted",
                "responded_at": get_ist_now(),
            }
        },
        upsert=True,
    )
    
    # Update fare with driver's multiplier
    distance_km = float(booking.get("distance_km", 0.0) or 0.0)
    time_multiplier = float(booking.get("fare_time_multiplier", 0.0) or 0.0)
    if time_multiplier <= 0:
        time_multiplier = get_time_multiplier()
    base_route_fare = (effective_pricing.base_fare + (distance_km * effective_pricing.per_km_rate)) * time_multiplier
    base_route_fare = max(base_route_fare, effective_pricing.minimum_fare)
    surge_multiplier = max(1.0, safe_float(booking.get("surge_multiplier"), 1.0))
    final_estimated_fare = round(
        (base_route_fare * surge_multiplier * fare_multiplier) + float(pickup_charge["pickup_surcharge"]),
        2,
    )
    
    await db.bookings.update_one(
        {"id": booking_id},
        {
            "$set": {
                "driver_id": current_user["id"],
                "status": BookingStatus.ACCEPTED,
                "base_route_fare": round(base_route_fare, 2),
                "estimated_fare": final_estimated_fare,
                "pickup_surcharge": float(pickup_charge["pickup_surcharge"]),
                "extra_pickup_distance_km": float(pickup_charge["extra_pickup_distance_km"]),
                "driver_to_pickup_distance_km": float(pickup_charge["driver_distance_km"]),
                "dispatch_status": "accepted",
                "accepted_driver_score_updated_at": get_ist_now(),
                "updated_at": get_ist_now()
            }
        }
    )
    
    await remove_ride_from_queue(booking_id)
    await clear_driver_pending_request_cache(
        list(set((booking.get("candidate_driver_ids") or []) + [current_user["id"]]))
    )
    await clear_active_ride_cache(current_user["id"], booking.get("passenger_id"))
    await write_analytics_event(
        "BOOKING_ACCEPTED",
        current_user["id"],
        {
            "booking_id": booking_id,
            "driver_id": current_user["id"],
        },
    )

    # Set driver as unavailable
    await db.drivers.update_one(
        {"user_id": current_user["id"]},
        {"$set": {"is_available": False}}
    )
    await cache_delete(f"driver_profile:{current_user['id']}")

    await emit_to_user(
        booking["passenger_id"],
        "booking_status_changed",
        {
            "booking_id": booking_id,
            "status": BookingStatus.ACCEPTED,
            "timestamp": get_ist_now().isoformat(),
        },
    )
    if driver_live_location:
        await emit_to_user(
            booking["passenger_id"],
            "driver_location",
            {
                "booking_id": booking_id,
                "driver_id": current_user["id"],
                "location": driver_live_location,
                "timestamp": get_ist_now().isoformat(),
            },
        )
    await notify_user(
        booking["passenger_id"],
        title="Ride Accepted",
        body=f"{current_user.get('name', 'Your driver')} accepted your ride.",
        data={"booking_id": booking_id, "status": str(BookingStatus.ACCEPTED)},
    )

    return {
        "message": "Booking accepted",
        "estimated_fare": final_estimated_fare,
        "pickup_surcharge": float(pickup_charge["pickup_surcharge"]),
        "extra_pickup_distance_km": float(pickup_charge["extra_pickup_distance_km"]),
    }

@api_router.put("/bookings/{booking_id}/reject")
async def reject_booking(booking_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can reject bookings")
    await ensure_user_can_take_ride_actions(current_user, "rejecting bookings")

    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.get("status") != BookingStatus.PENDING:
        raise HTTPException(status_code=400, detail="Booking is no longer available")

    candidate_driver_ids = booking.get("candidate_driver_ids") or []
    if candidate_driver_ids and current_user["id"] not in candidate_driver_ids:
        raise HTTPException(status_code=403, detail="This booking request is not assigned to you")

    await db.dispatch_attempts.update_one(
        {
            "booking_id": booking_id,
            "driver_id": current_user["id"],
        },
        {
            "$set": {
                "response": "rejected",
                "responded_at": get_ist_now(),
            }
        },
        upsert=True,
    )
    await db.bookings.update_one(
        {"id": booking_id},
        {
            "$inc": {"dispatch_attempt_count": 1},
            "$set": {
                "dispatch_status": "driver_rejected",
                "updated_at": get_ist_now(),
            },
            "$pull": {"candidate_driver_ids": current_user["id"]},
        },
    )
    await cache_delete(f"driver_pending_requests:{current_user['id']}")
    await enqueue_ride(booking_id)

    asyncio.create_task(retry_auto_assignment_for_pending_booking(booking_id))
    await notify_user(
        booking["passenger_id"],
        title="Finding Another Driver",
        body="A driver declined your ride. We are finding another nearby driver.",
        data={"booking_id": booking_id},
    )
    return {
        "message": "Ride rejected. Searching another driver.",
        "booking_id": booking_id,
    }

@api_router.get("/bookings/{booking_id}/dispatch-summary")
async def get_dispatch_summary(booking_id: str, current_user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if current_user["role"] != UserRole.ADMIN and current_user["id"] != booking.get("passenger_id"):
        raise HTTPException(status_code=403, detail="Not allowed")

    log = await db.dispatch_logs.find_one(
        {"booking_id": booking_id},
        {"_id": 0},
        sort=[("created_at", -1)],
    )
    return {
        "booking_id": booking_id,
        "dispatch_algorithm": booking.get("dispatch_algorithm"),
        "dispatch_status": booking.get("dispatch_status"),
        "surge_multiplier": booking.get("surge_multiplier", 1.0),
        "estimated_fare": booking.get("estimated_fare"),
        "supply_demand": (log or {}).get("supply_demand"),
        "selected_driver_count": len((log or {}).get("selected_driver_ids", [])),
        "message": "Fare and driver matching are based on nearby driver availability, demand, distance, rating and acceptance history.",
    }


@api_router.get("/bookings/{booking_id}/ai-fare-summary")
async def get_ai_fare_summary(booking_id: str, current_user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    allowed = (
        current_user["role"] == UserRole.ADMIN
        or current_user["id"] == booking.get("passenger_id")
        or current_user["id"] == booking.get("driver_id")
    )
    if not allowed:
        raise HTTPException(status_code=403, detail="Not allowed")

    return {
        "booking_id": booking_id,
        "dispatch_algorithm": booking.get("dispatch_algorithm"),
        "base_estimated_fare": booking.get("base_estimated_fare", booking.get("base_route_fare")),
        "estimated_fare": booking.get("estimated_fare"),
        "surge_multiplier": booking.get("surge_multiplier", 1.0),
        "demand_supply": booking.get("demand_supply"),
        "fraud_ai": booking.get("fraud_ai"),
        "message": "Fare combines base route estimate, nearby demand/supply pressure, and dispatch conditions.",
    }

@api_router.put("/bookings/{booking_id}/status")
async def update_booking_status(booking_id: str, status_update: BookingStatusUpdate, current_user: dict = Depends(get_current_user)):
    """Update booking status"""
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    was_already_completed = booking.get("status") == BookingStatus.COMPLETED

    if current_user["role"] != UserRole.ADMIN:
        if current_user["role"] != UserRole.DRIVER or booking.get("driver_id") != current_user["id"]:
            raise HTTPException(status_code=403, detail="Only assigned driver can update ride status")
    
    now_utc = get_ist_now()
    update_data = {
        "status": status_update.status,
        "updated_at": now_utc
    }

    if status_update.status == BookingStatus.DRIVER_ARRIVED:
        ride_start_otp = f"{random.randint(1000, 9999)}"
        update_data["ride_start_otp"] = ride_start_otp
        update_data["ride_start_otp_generated_at"] = now_utc
        update_data["ride_start_otp_verified_at"] = None

    if status_update.status == BookingStatus.IN_PROGRESS and current_user["role"] != UserRole.ADMIN:
        if booking["status"] != BookingStatus.DRIVER_ARRIVED:
            raise HTTPException(status_code=400, detail="Driver must mark arrived before starting trip")
        expected_otp = str(booking.get("ride_start_otp") or "").strip()
        provided_otp = str(status_update.ride_start_otp or "").strip()
        if not expected_otp:
            raise HTTPException(status_code=400, detail="Ride start OTP is not generated yet")
        if not provided_otp:
            raise HTTPException(status_code=400, detail="Ride start OTP is required to start trip")
        if provided_otp != expected_otp:
            raise HTTPException(status_code=400, detail="Invalid ride start OTP")
        update_data["ride_start_otp_verified_at"] = now_utc
        update_data["ride_start_otp"] = None
        ride_end_otp = f"{random.randint(1000, 9999)}"
        update_data["ride_end_otp"] = ride_end_otp
        update_data["ride_end_otp_generated_at"] = now_utc
        update_data["ride_end_otp_verified_at"] = None
        update_data["ride_end_otp_bypass_reason"] = None
        driver_profile = await db.drivers.find_one({"user_id": booking.get("driver_id")}) if booking.get("driver_id") else None
        live_driver_location = await get_effective_driver_location(driver_profile) if driver_profile else None
        start_location = normalize_tracking_location(
            live_driver_location or booking.get("pickup_location")
        )
        update_data["trip_started_at"] = now_utc
        update_data["trip_completed_at"] = None
        update_data["actual_distance_km"] = 0.0
        update_data["trip_start_location"] = start_location
        update_data["trip_last_location"] = start_location
        update_data["trip_last_location_at"] = now_utc
        update_data["trip_path_points"] = (
            [
                {
                    "latitude": start_location["latitude"],
                    "longitude": start_location["longitude"],
                    "captured_at": now_utc,
                }
            ]
            if start_location
            else []
        )

    # If completing ride, set final fare
    if status_update.status == BookingStatus.COMPLETED:
        if current_user["role"] != UserRole.ADMIN:
            if booking["status"] != BookingStatus.IN_PROGRESS:
                raise HTTPException(status_code=400, detail="Ride must be in progress before completion")
            expected_end_otp = str(booking.get("ride_end_otp") or "").strip()
            provided_end_otp = str(status_update.ride_end_otp or "").strip()
            if expected_end_otp:
                if provided_end_otp:
                    if provided_end_otp != expected_end_otp:
                        raise HTTPException(status_code=400, detail="Invalid ride completion OTP")
                    update_data["ride_end_otp_verified_at"] = now_utc
                    update_data["ride_end_otp_bypass_reason"] = None
                else:
                    if not status_update.allow_complete_without_otp:
                        raise HTTPException(
                            status_code=400,
                            detail=(
                                "Ride completion OTP is missing. "
                                "Provide OTP or confirm completion without OTP."
                            ),
                        )
                    bypass_reason = (
                        status_update.complete_without_otp_reason
                        or "passenger_unavailable"
                    ).strip()
                    update_data["ride_end_otp_bypass_reason"] = bypass_reason[:200]
        pricing = await get_pricing_rules()
        driver_profile = await db.drivers.find_one({"user_id": booking.get("driver_id")}) if booking.get("driver_id") else None
        live_driver_location = await get_effective_driver_location(driver_profile) if driver_profile else None
        effective_pricing = await get_effective_pricing_for_driver_profile(driver_profile, pricing)
        fare_multiplier = float((driver_profile or {}).get("fare_multiplier", 1.0) or 1.0)
        time_multiplier = float(booking.get("fare_time_multiplier", 0.0) or 0.0)
        if time_multiplier <= 0:
            time_multiplier = get_time_multiplier()
        pickup_surcharge = float(booking.get("pickup_surcharge", 0.0) or 0.0)

        actual_distance_km = float(booking.get("actual_distance_km", 0.0) or 0.0)
        latest_driver_location = normalize_tracking_location(live_driver_location)
        if latest_driver_location:
            tail_segment_km = calculate_tracking_segment_km(
                booking.get("trip_last_location"),
                latest_driver_location,
            )
            if (
                tail_segment_km >= max(0.0, TRIP_DISTANCE_MIN_SEGMENT_KM)
                and tail_segment_km <= max(0.5, TRIP_DISTANCE_MAX_SEGMENT_KM)
            ):
                actual_distance_km += tail_segment_km
                update_data["trip_last_location"] = latest_driver_location
                update_data["trip_last_location_at"] = now_utc
                update_data["trip_path_points"] = (booking.get("trip_path_points") or []) + [
                    {
                        "latitude": latest_driver_location["latitude"],
                        "longitude": latest_driver_location["longitude"],
                        "captured_at": now_utc,
                    }
                ]
        if actual_distance_km <= 0:
            direct_distance_km = calculate_tracking_segment_km(
                booking.get("trip_start_location"),
                booking.get("trip_last_location"),
            )
            if direct_distance_km > 0:
                actual_distance_km = direct_distance_km
        if actual_distance_km <= 0:
            actual_distance_km = float(booking.get("distance_km", 0.0) or 0.0)

        base_route_fare_actual = (
            (effective_pricing.base_fare + (actual_distance_km * effective_pricing.per_km_rate))
            * time_multiplier
        )
        base_route_fare_actual = max(base_route_fare_actual, effective_pricing.minimum_fare)
        final_fare = round((base_route_fare_actual * fare_multiplier) + pickup_surcharge, 2)

        update_data["actual_distance_km"] = round(actual_distance_km, 3)
        update_data["distance_km"] = round(actual_distance_km, 3)
        update_data["base_route_fare"] = round(base_route_fare_actual, 2)
        update_data["final_fare"] = final_fare
        update_data["trip_completed_at"] = now_utc
        update_data["ride_start_otp"] = None
        update_data["ride_end_otp"] = None
        
        # Update driver stats
        if booking.get("driver_id"):
            await db.drivers.update_one(
                {"user_id": booking["driver_id"]},
                {
                    "$set": {"is_available": True},
                    "$inc": {"total_rides": 1}
                }
            )
        if not was_already_completed:
            await apply_per_trip_subscription_charge(
                user_id=booking["passenger_id"],
                role=UserRole.PASSENGER,
                booking_id=booking_id,
                completed_at=now_utc,
            )
            if booking.get("driver_id"):
                await apply_per_trip_subscription_charge(
                    user_id=booking["driver_id"],
                    role=UserRole.DRIVER,
                    booking_id=booking_id,
                    completed_at=now_utc,
                )
    
    # If cancelled, make driver available again
    if status_update.status == BookingStatus.CANCELLED:
        update_data["ride_start_otp"] = None
        update_data["ride_end_otp"] = None
        if booking.get("driver_id"):
            await db.drivers.update_one(
                {"user_id": booking["driver_id"]},
                {"$set": {"is_available": True}}
            )
    
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": update_data}
    )
    if booking.get("driver_id"):
        await cache_delete(f"driver_profile:{booking['driver_id']}")
    await clear_active_ride_cache(booking.get("driver_id"), booking.get("passenger_id"))
    await clear_driver_pending_request_cache(booking.get("candidate_driver_ids") or [])
    if status_update.status != BookingStatus.PENDING:
        await remove_ride_from_queue(booking_id)
    if status_update.status == BookingStatus.COMPLETED:
        try:
            completed_booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
            if completed_booking:
                await calculate_ride_revenue(db, completed_booking)
        except Exception:
            logger.exception("Ride revenue calculation failed for booking_id=%s", booking_id, exc_info=True)
        await write_analytics_event(
            "BOOKING_COMPLETED",
            current_user["id"],
            {
                "booking_id": booking_id,
                "fare": update_data.get("final_fare"),
                "distance_km": update_data.get("actual_distance_km"),
            },
        )

    status_payload = {
        "booking_id": booking_id,
        "status": status_update.status,
        "timestamp": get_ist_now().isoformat(),
    }
    await emit_to_user(booking["passenger_id"], "booking_status_changed", status_payload)
    if booking.get("driver_id"):
        await emit_to_user(booking["driver_id"], "booking_status_changed", status_payload)

    if status_update.status == BookingStatus.DRIVER_ARRIVED:
        passenger_otp = str(update_data.get("ride_start_otp") or "")
        await notify_user(
            booking["passenger_id"],
            title="Driver Arrived",
            body=f"Share OTP {passenger_otp} with your driver to start the ride.",
            data={"booking_id": booking_id, "status": str(status_update.status), "ride_start_otp": passenger_otp},
        )
    elif status_update.status == BookingStatus.IN_PROGRESS:
        completion_otp = str(update_data.get("ride_end_otp") or "")
        await notify_user(
            booking["passenger_id"],
            title="Trip Started",
            body=f"Ride started. Share completion OTP {completion_otp} when you reach destination.",
            data={"booking_id": booking_id, "status": str(status_update.status), "ride_end_otp": completion_otp},
        )
    elif status_update.status == BookingStatus.COMPLETED:
        status_label = str(status_update.status).replace("_", " ").title()
        await notify_user(
            booking["passenger_id"],
            title="Ride Update",
            body=f"Ride status changed: {status_label}.",
            data={"booking_id": booking_id, "status": str(status_update.status)},
        )

    response_payload: Dict[str, Any] = {"message": "Status updated", "status": status_update.status}
    if status_update.status == BookingStatus.COMPLETED:
        response_payload["final_fare"] = update_data.get("final_fare")
        response_payload["actual_distance_km"] = update_data.get("actual_distance_km")
    return response_payload

@api_router.put("/bookings/{booking_id}/cancel")
async def cancel_booking(
    booking_id: str,
    payload: Optional[BookingCancelRequest] = None,
    current_user: dict = Depends(get_current_user),
):
    """Cancel a booking"""
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    if booking["status"] in [BookingStatus.COMPLETED, BookingStatus.CANCELLED]:
        raise HTTPException(status_code=400, detail="Cannot cancel this booking")

    if (
        current_user["role"] == UserRole.PASSENGER
        and current_user["id"] == booking.get("passenger_id")
        and enum_response_value(booking["status"])
        not in {BookingStatus.PENDING.value, BookingStatus.SCHEDULED.value}
    ):
        raise HTTPException(
            status_code=400,
            detail="Passenger cancellation is allowed only while booking is pending or scheduled.",
        )
    
    # Only passenger or assigned driver can cancel
    if current_user["id"] != booking["passenger_id"] and current_user["id"] != booking.get("driver_id"):
        raise HTTPException(status_code=403, detail="Not authorized to cancel")

    now = get_ist_now()
    payload = payload or BookingCancelRequest()
    actor_role = current_user["role"].value if isinstance(current_user["role"], Enum) else str(current_user["role"])
    reason_code = str(payload.reason_code or f"{actor_role}_cancelled").strip()[:80]
    reason_text = str(payload.reason_text or "").strip()[:400]
    status_before_cancel = enum_response_value(booking.get("status"))
    is_driver_cancel = actor_role == UserRole.DRIVER.value and current_user["id"] == booking.get("driver_id")
    fee_policy = {
        "policy_version": str(payload.policy_version or "driver_cancel_v1")[:80],
        "passenger_fee_amount": 0.0,
        "driver_fee_amount": 0.0,
        "review_required": bool(is_driver_cancel),
        "summary": (
            "Driver cancellation is logged for support review. "
            "No automatic passenger fee is applied from this endpoint."
        )
        if is_driver_cancel
        else "Cancellation is logged. Any fee review is handled by support policy.",
    }
    cancellation_details = {
        "cancelled_by": current_user["id"],
        "cancelled_by_role": actor_role,
        "cancelled_by_name": current_user.get("name"),
        "reason_code": reason_code,
        "reason_text": reason_text,
        "policy_acknowledged": bool(payload.policy_acknowledged),
        "policy": fee_policy,
        "passenger_context": payload.passenger_context or {},
        "support_context": {
            "booking_id": booking_id,
            "status_before_cancel": status_before_cancel,
            "driver_id": booking.get("driver_id"),
            "passenger_id": booking.get("passenger_id"),
            "estimated_fare": booking.get("estimated_fare"),
            "pickup": booking_location_label(booking, "pickup_location", "Pickup"),
            "drop": booking_location_label(booking, "drop_location", "Drop"),
            **(payload.support_context or {}),
        },
        "created_at": now,
    }
    
    await db.bookings.update_one(
        {"id": booking_id},
        {
            "$set": {
                "status": BookingStatus.CANCELLED,
                "cancelled_at": now,
                "cancelled_by": current_user["id"],
                "cancelled_by_role": actor_role,
                "cancellation_reason_code": reason_code,
                "cancellation_reason": reason_text,
                "cancellation_policy": fee_policy,
                "cancellation_details": cancellation_details,
                "updated_at": now,
            },
            "$push": {
                "cancellation_audit": cancellation_details,
            },
        }
    )
    await remove_ride_from_queue(booking_id)
    
    # Make driver available again
    if booking.get("driver_id"):
        await db.drivers.update_one(
            {"user_id": booking["driver_id"]},
            {"$set": {"is_available": True}}
        )
        await cache_delete(f"driver_profile:{booking['driver_id']}")
    await clear_active_ride_cache(booking.get("driver_id"), booking.get("passenger_id"))
    await clear_driver_pending_request_cache(booking.get("candidate_driver_ids") or [])
    await write_analytics_event(
        "BOOKING_CANCELLED",
        current_user["id"],
        {
            "booking_id": booking_id,
            "status": str(booking.get("status") or BookingStatus.CANCELLED),
            "cancelled_by_role": actor_role,
            "reason_code": reason_code,
            "policy_version": fee_policy["policy_version"],
        },
    )

    status_payload = {
        "booking_id": booking_id,
        "status": BookingStatus.CANCELLED,
        "reason_code": reason_code,
        "reason": reason_text,
        "timestamp": now.isoformat(),
    }
    await emit_to_user(booking["passenger_id"], "booking_status_changed", status_payload)
    if booking.get("driver_id"):
        await emit_to_user(booking["driver_id"], "booking_status_changed", status_payload)

    return {
        "message": "Booking cancelled",
        "cancellation": cancellation_details,
        "policy": fee_policy,
    }

@api_router.post("/route/estimate", response_model=RouteEstimateResponse)
async def route_estimate(request: RouteEstimateRequest):
    metrics = await get_route_metrics(request.pickup_location, request.drop_location)
    return RouteEstimateResponse(**metrics)

@api_router.get("/drivers/documents")
async def get_driver_documents(request: Request, current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    documents = await get_driver_documents_map(current_user["id"], request)
    reminders = build_driver_document_reminders(documents)
    return {"documents": documents, "reminders": reminders, "renewal_count": len(reminders)}


@api_router.get("/drivers/menu-badges")
async def get_driver_menu_badges(request: Request, current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    driver_id = current_user["id"]

    documents = await get_driver_documents_map(driver_id, request)
    reminders = build_driver_document_reminders(documents)
    document_values = list(documents.values())
    missing_documents = [
        document for document in document_values
        if not document.get("id") and not document.get("download_url") and not document.get("filename")
    ]
    rejected_documents = [
        document for document in document_values
        if str(document.get("verification_status") or document.get("status") or "").lower() == "rejected"
    ]
    pending_documents = [
        document for document in document_values
        if document.get("id")
        and str(document.get("verification_status") or document.get("status") or "").lower() == "pending"
    ]

    support_tickets = await db.driver_support_tickets.find({"driver_id": driver_id}, {"_id": 0}).to_list(200)
    active_support_tickets = [
        ticket for ticket in support_tickets
        if str(ticket.get("status") or "").lower() in {"open", "in_progress"}
    ]
    escalated_support_tickets = [ticket for ticket in support_tickets if bool(ticket.get("escalated"))]
    support_replied_tickets = []
    for ticket in active_support_tickets:
        messages = ticket.get("messages") if isinstance(ticket.get("messages"), list) else []
        last_message = messages[-1] if messages else {}
        if str(last_message.get("sender_type") or last_message.get("from") or "").lower() in {"support", "admin"}:
            support_replied_tickets.append(ticket)

    kyc_doc = await db.driver_kyc.find_one({"driver_id": driver_id}, {"_id": 0})
    driver_profile = await db.drivers.find_one({"user_id": driver_id}, {"_id": 0}) or {}
    kyc_status = enum_response_value(
        (kyc_doc or {}).get("status") or driver_profile.get("kyc_status") or "not_submitted"
    )
    trust_needs_attention = str(kyc_status or "").lower() not in {"approved"}

    payout_overview = await build_driver_payout_overview(driver_id, limit=8)
    pending_withdrawal_count = await db.driver_withdrawal_requests.count_documents(
        {"driver_id": driver_id, "status": {"$in": ["pending", "approved", "processing"]}}
    )
    payout_bank_status = str(payout_overview.get("bank_verification_status") or "not_submitted").lower()
    payout_needs_attention = payout_bank_status != "verified"
    subscription_config = await get_subscription_config()
    subscription_badge = build_subscription_attention_summary(current_user, subscription_config)
    vehicles = await db.driver_vehicles.find({"driver_id": driver_id}, {"_id": 0}).to_list(50)
    active_vehicle = next((vehicle for vehicle in vehicles if vehicle.get("is_active")), None)
    vehicle_issues = []
    if not vehicles:
        vehicle_issues.append("missing_vehicle")
    elif not active_vehicle:
        vehicle_issues.append("no_active_vehicle")
    else:
        for field_name in ["license_plate", "registration_number", "vehicle_type", "seating_capacity"]:
            if not active_vehicle.get(field_name):
                vehicle_issues.append(f"missing_{field_name}")

    profile_issues = []
    if not str(current_user.get("name") or "").strip():
        profile_issues.append("missing_name")
    if not str(current_user.get("phone") or "").strip():
        profile_issues.append("missing_phone")
    if not str(current_user.get("email") or "").strip():
        profile_issues.append("missing_email")
    if not driver_profile.get("profile_photo"):
        profile_issues.append("missing_profile_photo")
    if not driver_profile.get("emergency_contact_verified"):
        profile_issues.append("missing_emergency_contact")
    if not current_user.get("two_factor_enabled"):
        profile_issues.append("two_factor_disabled")

    recent_since = get_ist_now() - timedelta(days=30)
    low_rating_count = await db.ratings.count_documents(
        {
            "to_user_id": driver_id,
            "rating": {"$lte": 3},
            "created_at": {"$gte": recent_since},
        }
    )
    recent_review_count = await db.ratings.count_documents(
        {
            "to_user_id": driver_id,
            "created_at": {"$gte": recent_since},
        }
    )

    trusted_contact_count = await db.trusted_contacts.count_documents({"user_id": driver_id, "active": True})
    active_sos_count = await db.sos_alerts.count_documents(
        {
            "user_id": driver_id,
            "created_at": {"$gte": get_ist_now() - timedelta(hours=24)},
        }
    )
    safety_issues = []
    if trusted_contact_count == 0:
        safety_issues.append("missing_trusted_contact")
    if active_sos_count > 0:
        safety_issues.append("recent_sos_alert")

    tier_tool_badges: Dict[str, Dict[str, Any]] = {
        "filters": {"count": 0, "issues": []},
        "targets": {"count": 0, "issues": []},
        "paymethods": {"count": 0, "issues": []},
        "payout": {"count": 0, "issues": []},
        "maintenance": {"count": 0, "issues": []},
    }
    feature_session = SessionLocal()
    try:
        filters = feature_session.query(RideFilterPreferences).filter_by(driver_id=driver_id).first()
        if not filters:
            tier_tool_badges["filters"]["count"] = 1
            tier_tool_badges["filters"]["issues"].append("filters_not_configured")

        active_target_count = (
            feature_session.query(EarningTarget)
            .filter(EarningTarget.driver_id == driver_id, EarningTarget.status.in_(["active", "pending"]))
            .count()
        )
        if active_target_count == 0:
            tier_tool_badges["targets"]["count"] = 1
            tier_tool_badges["targets"]["issues"].append("no_active_earning_target")

        methods = (
            feature_session.query(DriverPaymentMethod)
            .filter(DriverPaymentMethod.driver_id == driver_id, DriverPaymentMethod.is_active.is_(True))
            .all()
        )
        pending_method_count = len([method for method in methods if str(method.verification_status or "").lower() != "verified"])
        if not methods:
            tier_tool_badges["paymethods"]["issues"].append("no_payout_method")
        if pending_method_count:
            tier_tool_badges["paymethods"]["issues"].append("payout_method_pending")
        tier_tool_badges["paymethods"]["count"] = (1 if not methods else 0) + pending_method_count

        payout_schedule = feature_session.query(PayoutScheduleConfig).filter_by(driver_id=driver_id, is_active=True).first()
        if not payout_schedule:
            tier_tool_badges["payout"]["count"] += 1
            tier_tool_badges["payout"]["issues"].append("payout_schedule_not_configured")

        due_cutoff = get_ist_now().date() + timedelta(days=14)
        due_maintenance_count = (
            feature_session.query(VehicleMaintenance)
            .filter(
                VehicleMaintenance.driver_id == driver_id,
                VehicleMaintenance.next_due_date.isnot(None),
                VehicleMaintenance.next_due_date <= due_cutoff,
            )
            .count()
        )
        if due_maintenance_count:
            tier_tool_badges["maintenance"]["count"] += int(due_maintenance_count)
            tier_tool_badges["maintenance"]["issues"].append("maintenance_due")
    except Exception as exc:
        logger.warning("Driver feature badges unavailable: %s", exc)
    finally:
        feature_session.close()

    detected_pool_count = await db.driver_ride_pools.count_documents({"driver_id": driver_id, "status": {"$in": ["detected", "pending_dispatch"]}})
    tax_report_count = await db.driver_tax_reports.count_documents({"driver_id": driver_id})
    shift_schedule_count = await db.driver_shift_schedules.count_documents({"driver_id": driver_id})
    completed_ride_count_for_badges = await db.bookings.count_documents({"driver_id": driver_id, "status": BookingStatus.COMPLETED})

    return {
        "documents": {
            "count": len(reminders) + len(rejected_documents) + len(missing_documents),
            "renewal_count": len(reminders),
            "missing_count": len(missing_documents),
            "rejected_count": len(rejected_documents),
            "pending_count": len(pending_documents),
        },
        "support": {
            "count": len(active_support_tickets),
            "open_count": len([ticket for ticket in support_tickets if str(ticket.get("status") or "").lower() == "open"]),
            "in_progress_count": len([ticket for ticket in support_tickets if str(ticket.get("status") or "").lower() == "in_progress"]),
            "escalated_count": len(escalated_support_tickets),
            "needs_response_count": len(support_replied_tickets),
        },
        "trust": {
            "count": 1 if trust_needs_attention else 0,
            "kyc_status": kyc_status,
            "reject_reason": (kyc_doc or {}).get("reject_reason"),
        },
        "earnings": {
            "count": int(pending_withdrawal_count) + (1 if payout_needs_attention else 0),
            "pending_withdrawal_count": int(pending_withdrawal_count),
            "pending_withdrawal": payout_overview.get("pending_withdrawal", 0.0),
            "bank_verification_status": payout_overview.get("bank_verification_status"),
            "withdrawal_blocker": payout_overview.get("withdrawal_blocker"),
        },
        "payout": {
            "count": int(tier_tool_badges["payout"]["count"]) + int(pending_withdrawal_count),
            "issues": tier_tool_badges["payout"]["issues"],
            "pending_withdrawal_count": int(pending_withdrawal_count),
        },
        "paymethods": tier_tool_badges["paymethods"],
        "subscription": subscription_badge,
        "vehicle": {
            "count": len(vehicle_issues),
            "issues": vehicle_issues,
            "vehicle_count": len(vehicles),
            "active_vehicle_id": active_vehicle.get("id") if active_vehicle else None,
        },
        "maintenance": tier_tool_badges["maintenance"],
        "profile": {
            "count": len(profile_issues),
            "issues": profile_issues,
        },
        "reviews": {
            "count": int(low_rating_count),
            "low_rating_count": int(low_rating_count),
            "recent_review_count": int(recent_review_count),
        },
        "safety": {
            "count": len(safety_issues),
            "issues": safety_issues,
            "trusted_contact_count": int(trusted_contact_count),
            "recent_sos_count": int(active_sos_count),
        },
        "filters": tier_tool_badges["filters"],
        "targets": tier_tool_badges["targets"],
        "pooling": {
            "count": int(detected_pool_count),
            "pending_pool_count": int(detected_pool_count),
        },
        "taxreports": {
            "count": 1 if tax_report_count == 0 else 0,
            "report_count": int(tax_report_count),
            "issues": ["no_tax_report"] if tax_report_count == 0 else [],
        },
        "shifts": {
            "count": 1 if shift_schedule_count == 0 else 0,
            "schedule_count": int(shift_schedule_count),
            "issues": ["no_shift_schedule"] if shift_schedule_count == 0 else [],
        },
        "badges": {
            "count": 1 if completed_ride_count_for_badges >= 100 else 0,
            "completed_rides": int(completed_ride_count_for_badges),
        },
    }


@api_router.get("/drivers/documents/{doc_type}")
async def get_driver_document_detail(doc_type: str, request: Request, current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    normalized_type = normalize_driver_doc_type(doc_type)
    document = await db.driver_documents.find_one({"driver_id": current_user["id"], "doc_type": normalized_type})
    return {"document": build_driver_document_response(document, request, normalized_type)}


@api_router.get("/drivers/documents/{doc_type}/download")
async def download_driver_document(doc_type: str, current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    normalized_type = normalize_driver_doc_type(doc_type)
    document = await db.driver_documents.find_one({"driver_id": current_user["id"], "doc_type": normalized_type})
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return await stored_upload_response(
        document,
        DRIVER_DOCUMENTS_DIR / current_user["id"],
        filename=document.get("filename") or document.get("stored_filename"),
        as_attachment=True,
    )


@api_router.post("/drivers/documents/{doc_type}")
async def upload_driver_document(
    doc_type: str,
    request: Request,
    expiry_date: Optional[str] = Form(default=None),
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    require_driver(current_user)
    normalized_type = normalize_driver_doc_type(doc_type)
    normalized_expiry = normalize_expiry_date(expiry_date)
    existing = await db.driver_documents.find_one({"driver_id": current_user["id"], "doc_type": normalized_type})
    saved = await save_upload_file(
        file,
        DRIVER_DOCUMENTS_DIR / current_user["id"],
        normalized_type,
        storage_backend=DRIVER_UPLOAD_STORAGE_BACKEND,
    )
    now = get_ist_now()
    document = {
        "id": existing.get("id") if existing else f"driver-doc-{uuid.uuid4()}",
        "driver_id": current_user["id"],
        "doc_type": normalized_type,
        "type": normalized_type,
        "filename": saved["original_filename"],
        "stored_filename": saved["filename"],
        "content_type": saved["content_type"],
        "size": saved["size"],
        "storage_backend": saved.get("storage_backend"),
        "storage_id": saved.get("storage_id"),
        "storage_key": saved.get("storage_key"),
        "storage_bucket": saved.get("storage_bucket"),
        "expiry_date": normalized_expiry,
        "status": "pending",
        "verification_status": "pending",
        "reject_reason": None,
        "uploaded_at": now,
        "updated_at": now,
    }
    await db.driver_documents.update_one(
        {"driver_id": current_user["id"], "doc_type": normalized_type},
        {"$set": document, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )

    if existing and (
        existing.get("stored_filename") != saved["filename"]
        or existing.get("storage_id") != saved.get("storage_id")
        or existing.get("storage_key") != saved.get("storage_key")
    ):
        await delete_stored_upload(existing, DRIVER_DOCUMENTS_DIR / current_user["id"])

    response_document = await db.driver_documents.find_one({"driver_id": current_user["id"], "doc_type": normalized_type})
    return {"document": build_driver_document_response(response_document, request, normalized_type)}


@api_router.delete("/drivers/documents/{doc_type}")
async def delete_driver_document(doc_type: str, request: Request, current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    normalized_type = normalize_driver_doc_type(doc_type)
    document = await db.driver_documents.find_one({"driver_id": current_user["id"], "doc_type": normalized_type})
    if not document:
        return {
            "success": True,
            "message": "Document already removed",
            "document": build_driver_document_response(None, request, normalized_type),
        }

    await db.driver_documents.delete_one({"driver_id": current_user["id"], "doc_type": normalized_type})
    await delete_stored_upload(document, DRIVER_DOCUMENTS_DIR / current_user["id"])

    return {
        "success": True,
        "message": "Document deleted",
        "document": build_driver_document_response(None, request, normalized_type),
    }


@api_router.post("/drivers/kyc")
async def submit_driver_kyc(payload: DriverKYCSubmission, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can submit KYC")

    now = get_ist_now()
    aadhaar_masked = mask_document_number(payload.aadhaar_number)
    kyc_doc = {
        "id": str(uuid.uuid4()),
        "driver_id": current_user["id"],
        "aadhaar_number_encrypted": encrypt_value(payload.aadhaar_number),
        "aadhaar_number_masked": aadhaar_masked,
        "license_number": payload.license_number,
        "rc_number": payload.rc_number,
        "aadhaar_image_url": payload.aadhaar_image_url,
        "license_image_url": payload.license_image_url,
        "rc_image_url": payload.rc_image_url,
        "selfie_image_url": payload.selfie_image_url,
        "status": KYCStatus.PENDING,
        "reject_reason": None,
        "submitted_at": now,
        "updated_at": now,
    }

    await db.driver_kyc.update_one(
        {"driver_id": current_user["id"]},
        {"$set": kyc_doc, "$unset": {"aadhaar_number": ""}},
        upsert=True,
    )

    await db.drivers.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "kyc_status": KYCStatus.PENDING,
                "license_number": payload.license_number,
                "rc_number": payload.rc_number,
                "aadhaar_masked": aadhaar_masked,
                "aadhaar_document_url": payload.aadhaar_image_url,
                "license_document_url": payload.license_image_url,
                "rc_document_url": payload.rc_image_url,
                "selfie_url": payload.selfie_image_url,
            }
        },
    )

    return {"message": "KYC submitted", "status": KYCStatus.PENDING}


@api_router.get("/drivers/kyc")
async def get_driver_kyc(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can access KYC")

    doc = await db.driver_kyc.find_one({"driver_id": current_user["id"]})
    return build_driver_kyc_response(doc)


@api_router.get("/admin/kyc/pending")
async def get_pending_kyc(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    pending = await db.driver_kyc.find({"status": KYCStatus.PENDING}).sort("submitted_at", -1).to_list(100)
    driver_ids = [item["driver_id"] for item in pending]
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": driver_ids}}).to_list(None)} if driver_ids else {}

    out = []
    for item in pending:
        user = users.get(item["driver_id"])
        item = build_driver_kyc_response(item)
        item["driver_name"] = user["name"] if user else "Unknown"
        item["driver_phone"] = user["phone"] if user else ""
        out.append(item)

    return out


@api_router.put("/admin/kyc/{driver_id}")
async def review_driver_kyc(driver_id: str, review: DriverKYCReview, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    existing = await db.driver_kyc.find_one({"driver_id": driver_id})
    if not existing:
        raise HTTPException(status_code=404, detail="KYC record not found")

    if review.status == KYCStatus.REJECTED and not review.reject_reason:
        raise HTTPException(status_code=400, detail="Reject reason is required")

    await db.driver_kyc.update_one(
        {"driver_id": driver_id},
        {
            "$set": {
                "status": review.status,
                "reject_reason": review.reject_reason,
                "reviewed_by": current_user["id"],
                "updated_at": get_ist_now(),
            }
        },
    )

    await db.drivers.update_one(
        {"user_id": driver_id},
        {"$set": {"kyc_status": review.status}},
    )

    await emit_to_user(
        driver_id,
        "kyc_status_changed",
        {
            "status": review.status,
            "reject_reason": review.reject_reason,
            "timestamp": get_ist_now().isoformat(),
        },
    )

    return {"message": "KYC updated", "status": review.status}


@api_router.get("/admin/passengers/kyc/pending")
async def get_pending_passenger_kyc(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    pending = await db.passenger_kyc.find(
        {
            "$or": [
                {"status": KYCStatus.PENDING},
                {"status": {"$exists": False}, "verification_level": "pending"},
            ]
        },
        {"_id": 0, "document_number_encrypted": 0},
    ).sort("submitted_at", -1).to_list(100)
    passenger_ids = [item["user_id"] for item in pending if item.get("user_id")]
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": passenger_ids}}).to_list(None)} if passenger_ids else {}

    out = []
    for item in pending:
        user = users.get(item["user_id"]) or {}
        out.append(
            {
                **item,
                "passenger_id": item["user_id"],
                "passenger_name": user.get("name") or "Unknown",
                "passenger_phone": user.get("phone") or "",
                "passenger_email": user.get("email") or "",
            }
        )
    return out


@api_router.put("/admin/passengers/kyc/{passenger_id}")
async def review_passenger_kyc(passenger_id: str, review: DriverKYCReview, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    existing = await db.passenger_kyc.find_one({"user_id": passenger_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Passenger KYC record not found")

    if review.status == KYCStatus.REJECTED and not review.reject_reason:
        raise HTTPException(status_code=400, detail="Reject reason is required")

    now = get_ist_now()
    approved = review.status == KYCStatus.APPROVED
    update_fields = {
        "status": review.status,
        "is_verified": approved,
        "verification_level": "verified" if approved else "rejected",
        "verification_date": now if approved else None,
        "reject_reason": review.reject_reason if review.status == KYCStatus.REJECTED else None,
        "reviewed_by": current_user["id"],
        "reviewed_at": now,
        "updated_at": now,
    }
    await db.passenger_kyc.update_one({"user_id": passenger_id}, {"$set": update_fields})
    await db.users.update_one({"id": passenger_id}, {"$set": {"kyc_status": review.status}})

    await emit_to_user(
        passenger_id,
        "kyc_status_changed",
        {
            "status": review.status,
            "reject_reason": review.reject_reason,
            "timestamp": now.isoformat(),
        },
    )
    await notify_user(
        passenger_id,
        title="KYC Status Updated",
        body="Your passenger KYC was approved." if approved else "Your passenger KYC was rejected. Please review and resubmit.",
        data={"status": review.status, "reject_reason": review.reject_reason},
    )

    return {"message": "Passenger KYC updated", "status": review.status}


@api_router.get("/admin/account-deletions/pending")
async def get_pending_account_deletions(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    pending = await db.account_deletion_requests.find(
        {"status": "pending"},
        {"_id": 0},
    ).sort("created_at", -1).to_list(100)
    user_ids = [item.get("user_id") for item in pending if item.get("user_id")]
    users = {
        user["id"]: user
        for user in await db.users.find(
            {"id": {"$in": user_ids}},
            {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1, "role": 1, "account_status": 1, "status": 1},
        ).to_list(None)
    } if user_ids else {}

    requests = []
    for item in pending:
        user = users.get(item.get("user_id")) or {}
        requests.append(
            {
                **item,
                "name": user.get("name") or item.get("name") or "Unknown",
                "email": user.get("email") or item.get("email") or "",
                "phone": user.get("phone") or item.get("phone") or "",
                "role": user.get("role") or item.get("role") or "passenger",
                "account_status": user.get("account_status") or "deletion_pending",
                "user_status": user.get("status") or "active",
            }
        )
    return requests


@api_router.put("/admin/account-deletions/{request_id}")
async def review_account_deletion_request(
    request_id: str,
    payload: AccountDeletionReviewRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    request_doc = await db.account_deletion_requests.find_one({"id": request_id, "status": "pending"})
    if not request_doc:
        raise HTTPException(status_code=404, detail="Pending account deletion request not found")

    now = get_ist_now()
    user_id = request_doc.get("user_id")
    review_fields = {
        "status": payload.status,
        "reviewed_at": now,
        "reviewed_by": current_user.get("id"),
        "updated_at": now,
    }

    if payload.status == "approved":
        await db.users.update_one(
            {"id": user_id},
            {
                "$set": {
                    "status": "blocked",
                    "account_status": "deleted",
                    "deleted_at": now,
                    "deletion_reviewed_at": now,
                    "deletion_reviewed_by": current_user.get("id"),
                    "updated_at": now,
                }
            },
        )
        review_fields["message"] = "Account deletion approved and account access blocked."
    else:
        reject_reason = str(payload.reject_reason or "").strip() or "Rejected by admin review."
        await db.users.update_one(
            {"id": user_id},
            {
                "$set": {
                    "account_status": "active",
                    "deletion_rejected_at": now,
                    "deletion_reviewed_by": current_user.get("id"),
                    "updated_at": now,
                }
            },
        )
        review_fields["reject_reason"] = reject_reason
        review_fields["message"] = "Account deletion request rejected."

    await db.account_deletion_requests.update_one(
        {"id": request_id},
        {"$set": review_fields},
    )

    if user_id:
        await emit_to_user(
            user_id,
            "account_deletion_reviewed",
            {
                "status": payload.status,
                "message": review_fields["message"],
                "timestamp": now.isoformat(),
            },
        )
        if payload.status == "rejected":
            await notify_user(
                user_id,
                title="Account Deletion Request Reviewed",
                body="Your account deletion request was rejected. Your account remains active.",
                data={"status": payload.status, "reject_reason": review_fields.get("reject_reason")},
            )

    return {"message": review_fields["message"], "status": payload.status}


@api_router.post("/users/push-token")
async def register_push_token(payload: PushTokenRegister, current_user: dict = Depends(get_current_user)):
    now = get_ist_now()
    await db.push_tokens.update_one(
        {"user_id": current_user["id"]},
        {
            "$set": {
                "token": payload.token.strip(),
                "platform": payload.platform.strip().lower(),
                "updated_at": now,
            },
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "user_id": current_user["id"],
                "created_at": now,
            },
        },
        upsert=True,
    )
    return {"message": "Push token registered"}


def serialize_notification(row: Dict[str, Any]) -> Dict[str, Any]:
    data = row.get("data") if isinstance(row.get("data"), dict) else {}
    created_at = row.get("created_at") or row.get("timestamp") or get_ist_now()
    if isinstance(created_at, datetime):
        created_at_value = created_at.isoformat()
    else:
        created_at_value = str(created_at)
    timestamp = row.get("timestamp") or created_at_value
    if isinstance(timestamp, datetime):
        timestamp = timestamp.isoformat()

    notification_id = str(row.get("id") or row.get("_id") or "")
    body = row.get("body") or row.get("message") or data.get("body") or data.get("message") or ""

    return {
        "_id": str(row.get("_id")) if row.get("_id") is not None else None,
        "id": notification_id,
        "user_id": row.get("user_id"),
        "title": row.get("title") or data.get("title") or "Notification",
        "body": body,
        "message": body,
        "type": row.get("type") or data.get("type") or "notification",
        "severity": row.get("severity") or data.get("severity") or "info",
        "icon": row.get("icon") or data.get("icon"),
        "read": bool(row.get("read", False)),
        "data": data,
        "created_at": created_at_value,
        "timestamp": timestamp,
    }


def notification_owner_query(user_id: str, notification_id: str) -> Dict[str, Any]:
    clauses = [{"user_id": user_id, "id": notification_id}]
    try:
        clauses.append({"user_id": user_id, "_id": ObjectId(notification_id)})
    except InvalidId:
        pass
    return {"$or": clauses}


@api_router.get("/users/notifications")
async def get_user_notifications(
    current_user: dict = Depends(get_current_user),
    unread_only: bool = Query(False),
    limit: int = Query(40, ge=1, le=100),
    skip: int = Query(0, ge=0),
):
    query: Dict[str, Any] = {"user_id": current_user["id"]}
    if unread_only:
        query["read"] = {"$ne": True}
    rows = (
        await db.notifications.find(query)
        .sort("created_at", -1)
        .skip(skip)
        .limit(limit)
        .to_list(length=limit)
    )
    return [serialize_notification(row) for row in rows]


@api_router.post("/users/notifications/read-all")
async def mark_all_user_notifications_read(current_user: dict = Depends(get_current_user)):
    result = await db.notifications.update_many(
        {"user_id": current_user["id"], "read": {"$ne": True}},
        {"$set": {"read": True, "read_at": get_ist_now()}},
    )
    return {"message": "Notifications marked as read", "modified_count": result.modified_count}


@api_router.post("/users/notifications/clear-all")
async def clear_user_notifications(current_user: dict = Depends(get_current_user)):
    result = await db.notifications.delete_many({"user_id": current_user["id"]})
    return {"message": "Notifications cleared", "deleted_count": result.deleted_count}


@api_router.post("/users/notifications/{notification_id}/read")
async def mark_user_notification_read(notification_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.notifications.update_one(
        notification_owner_query(current_user["id"], notification_id),
        {"$set": {"read": True, "read_at": get_ist_now()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification marked as read"}


@api_router.delete("/users/notifications/{notification_id}")
async def delete_user_notification(notification_id: str, current_user: dict = Depends(get_current_user)):
    result = await db.notifications.delete_one(notification_owner_query(current_user["id"], notification_id))
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Notification deleted"}


@api_router.post("/users/emergency-contacts")
async def save_emergency_contact(contact: EmergencyContactCreate, current_user: dict = Depends(get_current_user)):
    doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        **contact.dict(),
        "created_at": get_ist_now(),
    }
    await db.emergency_contacts.insert_one(doc)
    return {"message": "Emergency contact saved"}


@api_router.get("/users/emergency-contacts")
async def list_emergency_contacts(current_user: dict = Depends(get_current_user)):
    contacts = await db.emergency_contacts.find({"user_id": current_user["id"]}).sort("created_at", -1).to_list(20)
    for item in contacts:
        item["_id"] = str(item["_id"])
    return contacts


@api_router.post("/sos")
async def create_sos_alert(payload: SOSAlertCreate, current_user: dict = Depends(get_current_user)):
    alert = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "booking_id": payload.booking_id,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "severity": payload.severity,
        "message": payload.message,
        "status": "open",
        "created_at": get_ist_now(),
    }

    await db.sos_alerts.insert_one(alert)

    admin_users = await db.users.find({"role": UserRole.ADMIN}).to_list(20)
    for admin in admin_users:
        await emit_to_user(
            admin["id"],
            "sos_alert",
            {
                "alert_id": alert["id"],
                "user_id": current_user["id"],
                "booking_id": payload.booking_id,
                "severity": payload.severity,
                "latitude": payload.latitude,
                "longitude": payload.longitude,
                "message": payload.message,
                "timestamp": alert["created_at"].isoformat(),
            },
        )
        await notify_user(
            admin["id"],
            title="SOS Alert",
            body="High priority SOS alert received from an active user.",
            data={"alert_id": alert["id"], "user_id": current_user["id"], "booking_id": payload.booking_id},
        )

    contacts = await db.emergency_contacts.find({"user_id": current_user["id"]}).to_list(10)

    return {
        "message": "SOS alert created",
        "alert_id": alert["id"],
        "notified_admins": len(admin_users),
        "trusted_contacts_count": len(contacts),
    }


@api_router.post("/payments/order", response_model=PaymentOrderResponse)
async def create_payment_order(payload: PaymentOrderCreate, current_user: dict = Depends(get_current_user)):
    booking = await db.bookings.find_one({"id": payload.booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    if current_user["role"] == UserRole.PASSENGER and booking["passenger_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    amount = float(booking.get("final_fare") or booking.get("estimated_fare") or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid payable amount")

    order_id = f"pay_{uuid.uuid4().hex[:16]}"
    use_stripe = bool(STRIPE_SECRET_KEY) and booking.get("payment_method") == PaymentMethod.ONLINE
    upi_intent = build_upi_intent(order_id, amount)
    stripe_client_secret = None
    stripe_payment_intent_id = None
    provider = "upi_intent"

    if use_stripe:
        try:
            payment_intent = stripe.PaymentIntent.create(
                amount=max(1, int(round(amount * 100))),
                currency="inr",
                metadata={"booking_id": payload.booking_id, "order_id": order_id},
                automatic_payment_methods={"enabled": True},
            )
            stripe_client_secret = payment_intent.client_secret
            stripe_payment_intent_id = payment_intent.id
            provider = "stripe"
        except Exception as exc:
            logger.warning(f"Stripe PaymentIntent create failed, falling back to UPI intent: {exc}")
            provider = "upi_intent"

    order_doc = {
        "id": str(uuid.uuid4()),
        "order_id": order_id,
        "booking_id": payload.booking_id,
        "passenger_id": booking["passenger_id"],
        "driver_id": booking.get("driver_id"),
        "amount": round(amount, 2),
        "currency": "INR",
        "status": PaymentOrderStatus.CREATED,
        "provider": provider,
        "upi_intent": upi_intent,
        "stripe_client_secret": stripe_client_secret,
        "stripe_payment_intent_id": stripe_payment_intent_id,
        "created_at": get_ist_now(),
        "updated_at": get_ist_now(),
    }

    await db.payment_orders.insert_one(order_doc)

    return PaymentOrderResponse(
        order_id=order_id,
        booking_id=payload.booking_id,
        amount=order_doc["amount"],
        status=PaymentOrderStatus.CREATED,
        provider=provider,
        upi_intent=upi_intent,
        stripe_client_secret=stripe_client_secret,
        stripe_payment_intent_id=stripe_payment_intent_id,
    )


@api_router.post("/payments/verify")
async def verify_payment(payload: PaymentVerifyRequest, current_user: dict = Depends(get_current_user)):
    order = await db.payment_orders.find_one({"order_id": payload.order_id})
    if not order:
        raise HTTPException(status_code=404, detail="Payment order not found")

    if current_user["role"] == UserRole.PASSENGER and order["passenger_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    if order.get("status") == PaymentOrderStatus.PAID:
        return {
            "message": "Payment already verified",
            "order_id": payload.order_id,
            "status": PaymentOrderStatus.PAID,
        }

    if order.get("provider") == "stripe" and STRIPE_SECRET_KEY:
        intent_id = order.get("stripe_payment_intent_id") or payload.transaction_ref
        if not intent_id:
            raise HTTPException(status_code=400, detail="Missing Stripe payment intent reference")
        try:
            payment_intent = stripe.PaymentIntent.retrieve(intent_id)
            if payment_intent.status not in {"succeeded", "processing", "requires_capture"}:
                raise HTTPException(status_code=400, detail=f"Stripe payment not complete (status: {payment_intent.status})")
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Unable to verify Stripe payment: {exc}")

    now = get_ist_now()

    await db.payment_orders.update_one(
        {"order_id": payload.order_id},
        {
            "$set": {
                "status": PaymentOrderStatus.PAID,
                "transaction_ref": payload.transaction_ref,
                "paid_at": now,
                "updated_at": now,
            }
        },
    )

    await db.bookings.update_one(
        {"id": order["booking_id"]},
        {
            "$set": {
                "payment_status": PaymentOrderStatus.PAID,
                "payment_order_id": payload.order_id,
                "updated_at": now,
            }
        },
    )

    if order.get("driver_id"):
        driver_amount = round(order["amount"] * 0.9, 2)
        await db.driver_wallets.update_one(
            {"driver_id": order["driver_id"]},
            {
                "$inc": {"balance": driver_amount},
                "$setOnInsert": {
                    "driver_id": order["driver_id"],
                    "created_at": now,
                },
                "$set": {"updated_at": now},
            },
            upsert=True,
        )

    await emit_to_user(
        order["passenger_id"],
        "payment_success",
        {
            "booking_id": order["booking_id"],
            "order_id": payload.order_id,
            "amount": order["amount"],
            "timestamp": now.isoformat(),
            },
        )

    await notify_user(
        order["passenger_id"],
        title="Payment Successful",
        body=f"Payment of Rs {order['amount']} confirmed.",
        data={"booking_id": order["booking_id"], "order_id": payload.order_id},
    )

    if order.get("driver_id"):
        await emit_to_user(
            order["driver_id"],
            "payment_received",
            {
                "booking_id": order["booking_id"],
                "order_id": payload.order_id,
                "amount": order["amount"],
                "timestamp": now.isoformat(),
            },
        )
        await notify_user(
            order["driver_id"],
            title="Payment Received",
            body=f"Ride payment of Rs {order['amount']} is completed.",
            data={"booking_id": order["booking_id"], "order_id": payload.order_id},
        )

    return {
        "message": "Payment verified",
        "order_id": payload.order_id,
        "status": PaymentOrderStatus.PAID,
    }


# ==================== FARE ENDPOINTS ====================
class WalletResponse(BaseModel):
    user_id: str
    balance: float
    currency: str = "INR"
    updated_at: datetime

class WalletTopupRequest(BaseModel):
    amount: float = Field(gt=0)

class WalletTopupOrderCreate(BaseModel):
    amount: float = Field(gt=0, le=100000)
    payment_channel: Literal["upi", "stripe"] = "upi"

class WalletTopupVerifyRequest(BaseModel):
    order_id: str = Field(min_length=4, max_length=120)
    transaction_ref: Optional[str] = Field(default=None, max_length=120)

class AdminWalletTopupReview(BaseModel):
    status: Literal["verified", "rejected"]
    reject_reason: Optional[str] = Field(default=None, max_length=250)


class SpinWinPrizeConfig(BaseModel):
    id: Optional[str] = Field(default=None, min_length=2, max_length=80)
    label: str = Field(min_length=2, max_length=80)
    reward_type: Literal["cash", "coupon", "points", "gift", "none"] = "cash"
    reward_value: float = Field(default=0.0, ge=0.0)
    currency: str = Field(default="INR", min_length=3, max_length=8)
    weight: float = Field(default=1.0, gt=0.0)
    daily_stock: Optional[int] = Field(default=None, ge=0)
    description: Optional[str] = Field(default=None, max_length=160)
    active: bool = True


class SpinWinConfigPayload(BaseModel):
    enabled: bool = False
    daily_spin_limit: int = Field(default=1, ge=0, le=SPIN_WIN_MAX_DAILY_LIMIT)
    eligible_roles: List[UserRole] = Field(default_factory=lambda: [UserRole.PASSENGER])
    included_user_ids: List[str] = Field(default_factory=list, max_length=2000)
    excluded_user_ids: List[str] = Field(default_factory=list, max_length=2000)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None
    prizes: List[SpinWinPrizeConfig] = Field(default_factory=list, max_length=SPIN_WIN_MAX_PRIZES)


def default_spin_win_config() -> Dict[str, Any]:
    now = get_ist_now()
    return {
        "id": SPIN_WIN_CONFIG_ID,
        "enabled": False,
        "daily_spin_limit": 1,
        "eligible_roles": [UserRole.PASSENGER.value],
        "included_user_ids": [],
        "excluded_user_ids": [],
        "starts_at": None,
        "ends_at": None,
        "prizes": [
            {
                "id": "better_luck",
                "label": "Better luck next time",
                "reward_type": "none",
                "reward_value": 0.0,
                "currency": "INR",
                "weight": 70.0,
                "daily_stock": None,
                "description": "No reward this time.",
                "active": True,
            },
            {
                "id": "wallet_10",
                "label": "INR 10 Wallet Cash",
                "reward_type": "cash",
                "reward_value": 10.0,
                "currency": "INR",
                "weight": 30.0,
                "daily_stock": 500,
                "description": "Wallet top-up credit.",
                "active": True,
            },
        ],
        "updated_at": now,
        "created_at": now,
    }


def normalize_spin_user_ids(values: Any) -> List[str]:
    out: List[str] = []
    seen: set[str] = set()
    for raw in values or []:
        value = str(raw or "").strip()
        if not value or value in seen:
            continue
        seen.add(value)
        out.append(value)
    return out


def normalize_spin_roles(values: Any) -> List[str]:
    out: List[str] = []
    seen: set[str] = set()
    for raw in values or []:
        text = str(raw or "").strip().lower()
        if not text:
            continue
        try:
            role = UserRole(text).value
        except ValueError:
            continue
        if role in seen:
            continue
        seen.add(role)
        out.append(role)
    if not out:
        out = [UserRole.PASSENGER.value]
    return out


def normalize_spin_prizes(values: Any) -> List[Dict[str, Any]]:
    prizes: List[Dict[str, Any]] = []
    for index, raw_prize in enumerate(values or []):
        try:
            prize = SpinWinPrizeConfig(**(raw_prize or {}))
        except Exception:
            continue
        prize_id = str(prize.id or f"prize_{index + 1}_{uuid.uuid4().hex[:6]}").strip()
        prizes.append(
            {
                "id": prize_id,
                "label": str(prize.label).strip(),
                "reward_type": str(prize.reward_type),
                "reward_value": round(float(prize.reward_value or 0.0), 2),
                "currency": str(prize.currency or "INR").upper(),
                "weight": max(0.01, round(float(prize.weight or 0.0), 4)),
                "daily_stock": None if prize.daily_stock is None else int(prize.daily_stock),
                "description": str(prize.description or "").strip() or None,
                "active": bool(prize.active),
            }
        )
        if len(prizes) >= SPIN_WIN_MAX_PRIZES:
            break
    if not prizes:
        prizes = default_spin_win_config()["prizes"]
    return prizes


def normalize_spin_win_config_document(config_doc: Dict[str, Any]) -> Dict[str, Any]:
    doc = config_doc or default_spin_win_config()
    starts_at = as_utc_naive(doc.get("starts_at")) if isinstance(doc.get("starts_at"), datetime) else None
    ends_at = as_utc_naive(doc.get("ends_at")) if isinstance(doc.get("ends_at"), datetime) else None
    return {
        "id": SPIN_WIN_CONFIG_ID,
        "enabled": bool(doc.get("enabled", False)),
        "daily_spin_limit": max(0, min(SPIN_WIN_MAX_DAILY_LIMIT, int(doc.get("daily_spin_limit", 1) or 0))),
        "eligible_roles": normalize_spin_roles(doc.get("eligible_roles") or [UserRole.PASSENGER.value]),
        "included_user_ids": normalize_spin_user_ids(doc.get("included_user_ids")),
        "excluded_user_ids": normalize_spin_user_ids(doc.get("excluded_user_ids")),
        "starts_at": starts_at,
        "ends_at": ends_at,
        "prizes": normalize_spin_prizes(doc.get("prizes")),
        "updated_at": doc.get("updated_at") if isinstance(doc.get("updated_at"), datetime) else get_ist_now(),
        "created_at": doc.get("created_at") if isinstance(doc.get("created_at"), datetime) else get_ist_now(),
    }


async def get_spin_win_config_document() -> Dict[str, Any]:
    config_doc = await db.spin_win_config.find_one({"id": SPIN_WIN_CONFIG_ID})
    if not config_doc:
        config_doc = default_spin_win_config()
        await db.spin_win_config.update_one(
            {"id": SPIN_WIN_CONFIG_ID},
            {"$setOnInsert": config_doc},
            upsert=True,
        )
    normalized = normalize_spin_win_config_document(config_doc)
    if (
        config_doc.get("daily_spin_limit") != normalized["daily_spin_limit"]
        or config_doc.get("eligible_roles") != normalized["eligible_roles"]
        or config_doc.get("included_user_ids") != normalized["included_user_ids"]
        or config_doc.get("excluded_user_ids") != normalized["excluded_user_ids"]
    ):
        await db.spin_win_config.update_one(
            {"id": SPIN_WIN_CONFIG_ID},
            {"$set": {**normalized, "updated_at": get_ist_now()}},
            upsert=True,
        )
    return normalized


def get_spin_win_date_key(now_utc: Optional[datetime] = None) -> str:
    base = now_utc or get_ist_now()
    aware = base.replace(tzinfo=timezone.utc) if base.tzinfo is None else base.astimezone(timezone.utc)
    return aware.astimezone(IST_TZ).strftime("%Y-%m-%d")


def evaluate_spin_win_eligibility(config: Dict[str, Any], current_user: Dict[str, Any], now_utc: datetime) -> tuple[bool, str]:
    if not bool(config.get("enabled")):
        return False, "Spin & Win is disabled by admin."
    starts_at = config.get("starts_at")
    ends_at = config.get("ends_at")
    if starts_at and now_utc < starts_at:
        return False, "Spin & Win campaign has not started yet."
    if ends_at and now_utc > ends_at:
        return False, "Spin & Win campaign has ended."

    user_role = str(current_user.get("role") or "")
    allowed_roles = set(config.get("eligible_roles") or [])
    if allowed_roles and user_role not in allowed_roles:
        return False, "Spin & Win is not enabled for your account role."

    user_id = str(current_user.get("id") or "")
    included_ids = set(config.get("included_user_ids") or [])
    excluded_ids = set(config.get("excluded_user_ids") or [])
    if included_ids and user_id not in included_ids:
        return False, "Spin & Win is available only for selected customers."
    if user_id in excluded_ids:
        return False, "Spin & Win is not available for this account."
    return True, ""

@api_router.get("/wallet", response_model=WalletResponse)
async def get_wallet(current_user: dict = Depends(get_current_user)):
    wallet = await db.user_wallets.find_one({"user_id": current_user["id"]})
    if not wallet:
        now = get_ist_now()
        wallet = {
            "id": str(uuid.uuid4()),
            "user_id": current_user["id"],
            "balance": 0.0,
            "currency": "INR",
            "updated_at": now,
            "created_at": now,
        }
        await db.user_wallets.insert_one(wallet)

    return WalletResponse(
        user_id=wallet["user_id"],
        balance=round(wallet.get("balance", 0.0), 2),
        currency=wallet.get("currency", "INR"),
        updated_at=wallet["updated_at"],
    )

async def credit_verified_wallet_topup(
    order: Dict[str, Any],
    transaction_ref: Optional[str],
    verified_by: Optional[str] = None,
) -> Dict[str, Any]:
    if order.get("order_type") != "wallet_topup":
        raise HTTPException(status_code=400, detail="Payment order is not a wallet top-up")

    now = get_ist_now()
    order_id = str(order.get("order_id") or "")
    user_id = str(order.get("user_id") or order.get("passenger_id") or "")
    amount = round(float(order.get("amount") or 0), 2)
    if not order_id or not user_id or amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid wallet top-up order")

    if order.get("status") != PaymentOrderStatus.PAID:
        update_result = await db.payment_orders.update_one(
            {
                "order_id": order_id,
                "order_type": "wallet_topup",
                "status": {"$ne": PaymentOrderStatus.PAID},
            },
            {
                "$set": {
                    "status": PaymentOrderStatus.PAID,
                    "transaction_ref": transaction_ref,
                    "verified_by": verified_by,
                    "paid_at": now,
                    "updated_at": now,
                }
            },
        )
        if update_result.modified_count:
            await db.user_wallets.update_one(
                {"user_id": user_id},
                {
                    "$inc": {"balance": amount},
                    "$set": {"updated_at": now},
                    "$setOnInsert": {
                        "id": str(uuid.uuid4()),
                        "user_id": user_id,
                        "currency": "INR",
                        "created_at": now,
                    },
                },
                upsert=True,
            )
            await db.wallet_transactions.insert_one(
                {
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "type": "credit",
                    "amount": amount,
                    "reason": "wallet_topup",
                    "metadata": {
                        "source": "wallet_topup",
                        "order_id": order_id,
                        "provider": order.get("provider"),
                        "transaction_ref": transaction_ref,
                        "verified_by": verified_by,
                    },
                    "created_at": now,
                }
            )

    wallet = await db.user_wallets.find_one({"user_id": user_id})
    return {
        "message": "Wallet top-up verified and credited.",
        "order_id": order_id,
        "status": PaymentOrderStatus.PAID,
        "balance": round(float((wallet or {}).get("balance") or 0), 2),
        "currency": (wallet or {}).get("currency", "INR"),
        "updated_at": (wallet or {}).get("updated_at", now),
    }


@api_router.post("/wallet/topup/order")
async def create_wallet_topup_order(payload: WalletTopupOrderCreate, current_user: dict = Depends(get_current_user)):
    if current_user["role"] == UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admins cannot top up a user wallet from this endpoint")

    now = get_ist_now()
    amount = round(float(payload.amount), 2)
    order_id = f"wallet_{uuid.uuid4().hex[:16]}"
    use_stripe = payload.payment_channel == "stripe" and bool(STRIPE_SECRET_KEY)
    provider = "stripe" if use_stripe else "upi_intent"
    upi_intent = build_upi_intent(order_id, amount)
    stripe_client_secret = None
    stripe_payment_intent_id = None

    if use_stripe:
        try:
            payment_intent = stripe.PaymentIntent.create(
                amount=max(1, int(round(amount * 100))),
                currency="inr",
                metadata={
                    "order_type": "wallet_topup",
                    "user_id": current_user["id"],
                    "order_id": order_id,
                },
                automatic_payment_methods={"enabled": True},
            )
            stripe_client_secret = payment_intent.client_secret
            stripe_payment_intent_id = payment_intent.id
        except Exception as exc:
            logger.warning("Stripe wallet top-up intent failed, falling back to UPI intent: %s", exc)
            provider = "upi_intent"

    order_doc = {
        "id": str(uuid.uuid4()),
        "order_id": order_id,
        "order_type": "wallet_topup",
        "booking_id": None,
        "user_id": current_user["id"],
        "passenger_id": current_user["id"],
        "amount": amount,
        "currency": "INR",
        "status": PaymentOrderStatus.CREATED,
        "provider": provider,
        "upi_intent": upi_intent,
        "stripe_client_secret": stripe_client_secret,
        "stripe_payment_intent_id": stripe_payment_intent_id,
        "created_at": now,
        "updated_at": now,
    }
    await db.payment_orders.insert_one(order_doc)

    return {
        "message": "Wallet top-up order created. Complete payment before the balance is credited.",
        "order_id": order_id,
        "amount": amount,
        "currency": "INR",
        "status": PaymentOrderStatus.CREATED,
        "provider": provider,
        "upi_intent": upi_intent,
        "stripe_client_secret": stripe_client_secret,
        "stripe_payment_intent_id": stripe_payment_intent_id,
    }


@api_router.post("/wallet/topup/verify")
async def verify_wallet_topup(payload: WalletTopupVerifyRequest, current_user: dict = Depends(get_current_user)):
    order = await db.payment_orders.find_one({"order_id": payload.order_id, "order_type": "wallet_topup"})
    if not order:
        raise HTTPException(status_code=404, detail="Wallet top-up order not found")

    if order.get("user_id") != current_user["id"] and current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized")

    if order.get("status") == PaymentOrderStatus.PAID:
        wallet = await db.user_wallets.find_one({"user_id": order["user_id"]})
        return {
            "message": "Wallet top-up already verified.",
            "order_id": payload.order_id,
            "status": PaymentOrderStatus.PAID,
            "balance": round(float((wallet or {}).get("balance") or 0), 2),
        }

    transaction_ref = str(payload.transaction_ref or "").strip()
    if order.get("provider") == "stripe" and STRIPE_SECRET_KEY:
        intent_id = order.get("stripe_payment_intent_id") or transaction_ref
        if not intent_id:
            raise HTTPException(status_code=400, detail="Missing Stripe payment intent reference")
        try:
            payment_intent = stripe.PaymentIntent.retrieve(intent_id)
            if payment_intent.status not in {"succeeded", "processing", "requires_capture"}:
                raise HTTPException(status_code=400, detail=f"Stripe payment not complete (status: {payment_intent.status})")
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Unable to verify Stripe payment: {exc}")
        return await credit_verified_wallet_topup(order, intent_id, verified_by="stripe")

    if len(transaction_ref) < 4:
        raise HTTPException(status_code=400, detail="Enter a valid payment reference or UTR")

    await db.payment_orders.update_one(
        {"order_id": payload.order_id, "order_type": "wallet_topup"},
        {
            "$set": {
                "status": PaymentOrderStatus.PENDING_VERIFICATION,
                "transaction_ref": transaction_ref,
                "submitted_at": get_ist_now(),
                "updated_at": get_ist_now(),
            }
        }
    )
    return {
        "message": "Payment reference submitted. Wallet balance will update after admin verification.",
        "order_id": payload.order_id,
        "status": PaymentOrderStatus.PENDING_VERIFICATION,
    }


@api_router.post("/wallet/topup")
async def topup_wallet(payload: WalletTopupRequest, current_user: dict = Depends(get_current_user)):
    raise HTTPException(
        status_code=400,
        detail="Direct wallet top-up is disabled. Create /wallet/topup/order and verify payment before crediting.",
    )


@api_router.get("/admin/wallet/topups/pending")
async def get_pending_wallet_topups(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    pending = await db.payment_orders.find(
        {"order_type": "wallet_topup", "status": PaymentOrderStatus.PENDING_VERIFICATION},
        {"_id": 0, "stripe_client_secret": 0},
    ).sort("submitted_at", -1).to_list(200)
    user_ids = [item.get("user_id") for item in pending if item.get("user_id")]
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": user_ids}}).to_list(None)} if user_ids else {}

    out = []
    for item in pending:
        user = users.get(item.get("user_id")) or {}
        out.append(
            {
                **item,
                "name": user.get("name") or "User",
                "email": user.get("email") or "",
                "phone": user.get("phone") or "",
                "role": user.get("role") or "",
            }
        )
    return out


@api_router.put("/admin/wallet/topups/{order_id}")
async def review_wallet_topup(order_id: str, payload: AdminWalletTopupReview, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    order = await db.payment_orders.find_one({"order_id": order_id, "order_type": "wallet_topup"})
    if not order:
        raise HTTPException(status_code=404, detail="Wallet top-up order not found")

    if payload.status == "rejected":
        reject_reason = str(payload.reject_reason or "Rejected by admin review.").strip()
        await db.payment_orders.update_one(
            {"order_id": order_id, "order_type": "wallet_topup"},
            {
                "$set": {
                    "status": PaymentOrderStatus.FAILED,
                    "reject_reason": reject_reason,
                    "reviewed_by": current_user["id"],
                    "reviewed_at": get_ist_now(),
                    "updated_at": get_ist_now(),
                }
            },
        )
        await notify_user(
            order["user_id"],
            title="Wallet Top-up Rejected",
            body=reject_reason,
            data={"order_id": order_id, "status": PaymentOrderStatus.FAILED},
        )
        return {"message": "Wallet top-up rejected", "order_id": order_id, "status": PaymentOrderStatus.FAILED}

    credited = await credit_verified_wallet_topup(
        order,
        str(order.get("transaction_ref") or ""),
        verified_by=current_user["id"],
    )
    await notify_user(
        order["user_id"],
        title="Wallet Top-up Credited",
        body=f"Rs {float(order.get('amount') or 0):.2f} has been added to your wallet.",
        data={"order_id": order_id, "status": PaymentOrderStatus.PAID},
    )
    return credited


@api_router.get("/spin-win/config")
async def get_spin_win_config(current_user: dict = Depends(get_current_user)):
    now = get_ist_now()
    date_key = get_spin_win_date_key(now)
    config = await get_spin_win_config_document()
    eligible, eligibility_reason = evaluate_spin_win_eligibility(config, current_user, now)
    daily_limit = int(config.get("daily_spin_limit", 0) or 0)
    daily_doc = await db.spin_win_user_daily.find_one({"user_id": current_user["id"], "date_key": date_key}) or {}
    spins_used = int(daily_doc.get("spins_used", 0) or 0)
    spins_left = max(0, daily_limit - spins_used)
    latest_reward = await db.spin_win_rewards.find_one(
        {"user_id": current_user["id"]},
        sort=[("created_at", -1)],
    )
    if latest_reward:
        latest_reward.pop("_id", None)

    return {
        "enabled": bool(config.get("enabled", False)),
        "daily_spin_limit": daily_limit,
        "spins_used_today": spins_used,
        "spins_left_today": spins_left,
        "date_key": date_key,
        "eligible": bool(eligible),
        "eligibility_reason": eligibility_reason,
        "starts_at": config.get("starts_at"),
        "ends_at": config.get("ends_at"),
        "prizes": config.get("prizes", []),
        "latest_reward": latest_reward,
        "updated_at": config.get("updated_at"),
    }


@api_router.post("/spin-win/spin")
async def perform_spin_win(current_user: dict = Depends(get_current_user)):
    now = get_ist_now()
    date_key = get_spin_win_date_key(now)
    config = await get_spin_win_config_document()
    eligible, eligibility_reason = evaluate_spin_win_eligibility(config, current_user, now)
    if not eligible:
        raise HTTPException(status_code=403, detail=eligibility_reason or "Spin & Win not available")

    daily_limit = int(config.get("daily_spin_limit", 0) or 0)
    if daily_limit <= 0:
        raise HTTPException(status_code=400, detail="No daily spins are configured by admin")

    update_result = await db.spin_win_user_daily.update_one(
        {
            "user_id": current_user["id"],
            "date_key": date_key,
            "spins_used": {"$lt": daily_limit},
        },
        {
            "$inc": {"spins_used": 1},
            "$set": {"updated_at": now},
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "user_id": current_user["id"],
                "date_key": date_key,
                "created_at": now,
            },
        },
        upsert=True,
    )
    if update_result.matched_count == 0 and update_result.upserted_id is None:
        raise HTTPException(status_code=400, detail="Daily spin limit reached")

    daily_doc = await db.spin_win_user_daily.find_one({"user_id": current_user["id"], "date_key": date_key}) or {}
    spins_used = int(daily_doc.get("spins_used", 0) or 0)
    spins_left = max(0, daily_limit - spins_used)

    active_prizes = [prize for prize in (config.get("prizes") or []) if bool(prize.get("active", True))]
    if not active_prizes:
        await db.spin_win_user_daily.update_one(
            {"user_id": current_user["id"], "date_key": date_key, "spins_used": {"$gt": 0}},
            {"$inc": {"spins_used": -1}, "$set": {"updated_at": get_ist_now()}},
        )
        raise HTTPException(status_code=503, detail="No active prizes configured")

    prize_ids = [str(prize.get("id") or "") for prize in active_prizes if prize.get("id")]
    stock_counts = await db.spin_win_rewards.aggregate(
        [
            {"$match": {"date_key": date_key, "prize_id": {"$in": prize_ids}}},
            {"$group": {"_id": "$prize_id", "count": {"$sum": 1}}},
        ]
    ).to_list(None)
    used_count_by_prize = {str(row.get("_id")): int(row.get("count", 0) or 0) for row in stock_counts}

    weighted_pool: List[tuple[Dict[str, Any], float]] = []
    for prize in active_prizes:
        prize_id = str(prize.get("id") or "")
        if not prize_id:
            continue
        daily_stock = prize.get("daily_stock")
        if daily_stock is not None and int(daily_stock) >= 0:
            if used_count_by_prize.get(prize_id, 0) >= int(daily_stock):
                continue
        weight = float(prize.get("weight", 0.0) or 0.0)
        if weight <= 0:
            continue
        weighted_pool.append((prize, weight))

    if not weighted_pool:
        await db.spin_win_user_daily.update_one(
            {"user_id": current_user["id"], "date_key": date_key, "spins_used": {"$gt": 0}},
            {"$inc": {"spins_used": -1}, "$set": {"updated_at": get_ist_now()}},
        )
        raise HTTPException(status_code=503, detail="All daily prizes are exhausted. Try tomorrow.")

    total_weight = sum(weight for _, weight in weighted_pool)
    random_threshold = random.uniform(0.0, total_weight)
    running_weight = 0.0
    selected_prize = weighted_pool[-1][0]
    for prize, weight in weighted_pool:
        running_weight += weight
        if random_threshold <= running_weight:
            selected_prize = prize
            break

    wallet_credit_amount = 0.0
    reward_type = str(selected_prize.get("reward_type") or "none")
    reward_value = round(float(selected_prize.get("reward_value", 0.0) or 0.0), 2)
    if reward_type == "cash" and reward_value > 0:
        wallet_credit_amount = reward_value
        await db.user_wallets.update_one(
            {"user_id": current_user["id"]},
            {
                "$inc": {"balance": wallet_credit_amount},
                "$set": {"updated_at": now},
                "$setOnInsert": {
                    "id": str(uuid.uuid4()),
                    "currency": str(selected_prize.get("currency") or "INR"),
                    "created_at": now,
                },
            },
            upsert=True,
        )
        await db.wallet_transactions.insert_one(
            {
                "id": str(uuid.uuid4()),
                "user_id": current_user["id"],
                "type": "credit",
                "amount": wallet_credit_amount,
                "reason": "spin_win_reward",
                "metadata": {
                    "source": "spin_win",
                    "prize_id": str(selected_prize.get("id") or ""),
                    "prize_label": str(selected_prize.get("label") or ""),
                    "date_key": date_key,
                },
                "created_at": now,
            }
        )

    reward_doc = {
        "id": str(uuid.uuid4()),
        "user_id": current_user["id"],
        "user_name": current_user.get("name"),
        "user_role": current_user.get("role"),
        "date_key": date_key,
        "spin_number": spins_used,
        "prize_id": str(selected_prize.get("id") or ""),
        "prize_label": str(selected_prize.get("label") or ""),
        "reward_type": reward_type,
        "reward_value": reward_value,
        "currency": str(selected_prize.get("currency") or "INR"),
        "wallet_credit_amount": wallet_credit_amount,
        "description": selected_prize.get("description"),
        "created_at": now,
    }
    await db.spin_win_rewards.insert_one(reward_doc)

    return {
        "message": "Spin completed",
        "date_key": date_key,
        "spins_used_today": spins_used,
        "spins_left_today": spins_left,
        "reward": {
            "prize_id": reward_doc["prize_id"],
            "label": reward_doc["prize_label"],
            "reward_type": reward_doc["reward_type"],
            "reward_value": reward_doc["reward_value"],
            "currency": reward_doc["currency"],
            "wallet_credit_amount": reward_doc["wallet_credit_amount"],
            "description": reward_doc["description"],
        },
    }

@api_router.post("/fare/estimate", response_model=FareEstimateResponse)
async def estimate_fare(request: FareEstimateRequest):
    """Estimate fare for a ride"""
    pricing = await get_pricing_rules()
    radius_cfg = get_driver_search_radius_config(pricing)
    route_metrics = await get_route_metrics(request.pickup_location, request.drop_location)
    distance = float(route_metrics["distance_km"])
    time_multiplier = get_time_multiplier()
    
    distance_fare = distance * pricing.per_km_rate
    subtotal = pricing.base_fare + distance_fare
    total_fare = subtotal * time_multiplier
    total_fare = max(total_fare, pricing.minimum_fare)
    
    return FareEstimateResponse(
        base_fare=pricing.base_fare,
        distance_km=distance,
        distance_fare=round(distance_fare, 2),
        surge_multiplier=time_multiplier,
        total_fare=round(total_fare, 2),
        breakdown={
            "base_fare": pricing.base_fare,
            "distance_km": distance,
            "per_km_rate": pricing.per_km_rate,
            "distance_fare": round(distance_fare, 2),
            "surge_multiplier": time_multiplier,
            "minimum_fare": pricing.minimum_fare,
            "driver_base_search_radius_km": radius_cfg["base_radius_km"],
            "driver_long_distance_search_radius_km": radius_cfg["long_radius_km"],
            "driver_pickup_surcharge_per_km": pricing.driver_pickup_surcharge_per_km,
            "eta_minutes": route_metrics.get("eta_minutes"),
            "route_source": route_metrics.get("source", "haversine_fallback"),
        }
    )

@api_router.get("/pricing/rules")
async def get_pricing():
    """Get current pricing rules"""
    pricing = await get_pricing_rules()
    return pricing

@api_router.get("/registration/fees", response_model=RegistrationFeeSettings)
async def get_registration_fees():
    return await get_registration_fee_settings()

@api_router.post("/assistant/trip-tips", response_model=TripTipsResponse)
async def trip_tips(request: TripTipsRequest):
    """Smart trip tips with OpenAI fallback to deterministic local logic."""
    prompt = (
        f"Pickup: {request.pickup_address}\n"
        f"Drop: {request.drop_address}\n"
        f"Payment: {request.payment_method}\n"
        f"Estimated fare INR: {request.estimated_fare if request.estimated_fare is not None else 'unknown'}\n"
        "Give concise rider tips in 4-6 sentences."
    )
    ai_text = await generate_openai_text(
        instructions="You are AutoBuddy rider assistant. Give practical and safety-first transport tips for India.",
        prompt=prompt,
        max_output_tokens=220,
        temperature=0.2,
    )
    if ai_text:
        return TripTipsResponse(tips=ai_text, source=f"openai:{OPENAI_MODEL}")

    return TripTipsResponse(
        tips=generate_fallback_trip_tips(request),
        source="free_local"
    )


@api_router.post("/assistant/support-chat", response_model=SupportChatResponse)
async def support_chat(request: SupportChatRequest, current_user: dict = Depends(get_current_user)):
    role = str(current_user.get("role", "passenger"))
    message = request.message.lower()

    ai_context = request.context or {}
    ai_prompt = (
        f"Role: {role}\n"
        f"User message: {request.message}\n"
        f"Context JSON: {ai_context}\n"
        "Reply with concise actionable steps (max 6 sentences)."
    )
    ai_text = await generate_openai_text(
        instructions=(
            "You are AutoBuddy support. Be precise, calm, and practical. "
            "Do not invent unavailable features and never expose sensitive data."
        ),
        prompt=ai_prompt,
        max_output_tokens=260,
        temperature=0.3,
    )
    if ai_text:
        return SupportChatResponse(reply=ai_text, source=f"openai:{OPENAI_MODEL}")

    if "login" in message or "password" in message:
        reply = "Please verify your email/password, then try login again."
    elif "cancel" in message:
        reply = "Open Active Ride and tap Cancel Ride. If cancellation fails, refresh data and retry once."
    elif "fare" in message:
        reply = "Use Estimate Fare first, then check nearby drivers before creating booking for better acceptance."
    elif "driver" in message and role == "passenger":
        reply = "Tap Find Nearby Drivers and confirm pickup landmark clearly to reduce waiting time."
    else:
        reply = "Refresh app data, verify pickup/drop coordinates, then retry the action. For stuck bookings, cancel and recreate once."

    return SupportChatResponse(reply=reply, source="free_local")

@api_router.post("/assistant/driver-advice", response_model=DriverAdviceResponse)
async def driver_advice(request: DriverAdviceRequest, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can access this")

    earnings = await get_driver_earnings(current_user)
    profile = await db.drivers.find_one({"user_id": current_user["id"]}) or {}
    fare_multiplier = float(profile.get("fare_multiplier", 1.0))
    today_rides = int(earnings.get("today_rides", 0))
    today_earnings = float(earnings.get("today_earnings", 0))

    tips = [
        "1) Stay online during 8-10 AM and 5-8 PM for higher demand.",
        "2) Keep fare multiplier around 1.0-1.2 for better booking acceptance.",
        "3) Update location every 5-10 minutes in busy pickup zones.",
    ]

    if today_rides < 3:
        tips.append("4) Reposition near office hubs, metro exits, and hospital zones to increase ride frequency.")
    if today_earnings < 500:
        tips.append("5) Prioritize short-to-medium rides to increase trip count before late evening.")
    if fare_multiplier > 1.3:
        tips.append("6) Consider reducing fare multiplier slightly to improve request conversion.")

    advice = " ".join(tips)
    prompt = (
        f"City: {request.city}\n"
        f"Available hours: {request.available_hours}\n"
        f"Notes: {request.notes}\n"
        f"Today rides: {today_rides}\n"
        f"Today earnings INR: {today_earnings}\n"
        f"Current fare multiplier: {fare_multiplier}\n"
        "Provide a shift plan with numbered recommendations."
    )
    ai_text = await generate_openai_text(
        instructions=(
            "You are an operations advisor for autorickshaw drivers in India. "
            "Focus on ethical, legal, and practical advice."
        ),
        prompt=prompt,
        max_output_tokens=280,
        temperature=0.25,
    )
    if ai_text:
        return DriverAdviceResponse(advice=ai_text, source=f"openai:{OPENAI_MODEL}")

    return DriverAdviceResponse(advice=advice, source="free_local")

@api_router.get("/assistant/admin-insights", response_model=AdminInsightsResponse)
async def admin_insights(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    stats = await get_admin_dashboard(current_user)
    pricing = await get_pricing_rules()

    active = int(stats.get("active_bookings", 0))
    completed = int(stats.get("completed_bookings", 0))
    drivers = int(stats.get("total_drivers", 0))
    passengers = int(stats.get("total_passengers", 0))

    insight_lines = [
        f"Supply-demand snapshot: {drivers} drivers vs {passengers} passengers with {active} active bookings.",
        f"Completion trend: {completed} completed rides so far; monitor cancellations in peak windows.",
        f"Pricing baseline: base fare Rs {pricing.base_fare}, per-km Rs {pricing.per_km_rate}, minimum fare Rs {pricing.minimum_fare}.",
        "Action: run a 7-day experiment on peak-hour driver availability and compare conversion + completion rates.",
    ]
    fallback_text = " ".join(insight_lines)

    prompt = (
        f"Total drivers: {drivers}\n"
        f"Total passengers: {passengers}\n"
        f"Active bookings: {active}\n"
        f"Completed bookings: {completed}\n"
        f"Base fare: {pricing.base_fare}\n"
        f"Per km rate: {pricing.per_km_rate}\n"
        f"Minimum fare: {pricing.minimum_fare}\n"
        "Provide concise business insights and 3 priority actions."
    )
    ai_text = await generate_openai_text(
        instructions=(
            "You are a ride-hailing growth analyst. Use provided metrics only and avoid fabricated numbers."
        ),
        prompt=prompt,
        max_output_tokens=320,
        temperature=0.2,
    )
    if ai_text:
        return AdminInsightsResponse(insights=ai_text, source=f"openai:{OPENAI_MODEL}")

    return AdminInsightsResponse(insights=fallback_text, source="free_local")

@api_router.get("/admin/security/audit-logs")
async def get_audit_logs(current_user: dict = Depends(require_roles(UserRole.ADMIN.value))):
    logs = await db.audit_logs.find({}, {"_id": 0}).sort("created_at", -1).limit(200).to_list(200)
    return logs


@api_router.get("/admin/analytics/summary")
async def get_analytics_summary(current_user: dict = Depends(require_roles(UserRole.ADMIN.value))):
    today = get_ist_now().strftime("%Y-%m-%d")
    cache_key = f"analytics_summary:{today}"
    cached = await cache_get(cache_key)
    if cached:
        return cached

    total_bookings = await db.bookings.count_documents({})
    completed = await db.bookings.count_documents({"status": BookingStatus.COMPLETED})
    cancelled = await db.bookings.count_documents({"status": BookingStatus.CANCELLED})
    pending = await db.bookings.count_documents({"status": BookingStatus.PENDING})
    today_events = await db.analytics_events.count_documents({"event_date": today})

    result = {
        "total_bookings": total_bookings,
        "completed_bookings": completed,
        "cancelled_bookings": cancelled,
        "pending_bookings": pending,
        "today_events": today_events,
        "completion_rate": round((completed / max(total_bookings, 1)) * 100, 2),
        "cancel_rate": round((cancelled / max(total_bookings, 1)) * 100, 2),
    }
    await cache_set(cache_key, result, ttl_seconds=60)
    return result


@api_router.get("/admin/ai/demand-heatmap")
async def get_admin_demand_heatmap(
    minutes: int = 60,
    current_user: dict = Depends(require_roles(UserRole.ADMIN.value)),
):
    cells = await build_demand_heatmap(db, minutes=minutes)
    return {
        "minutes": max(5, int(minutes or 60)),
        "cells": cells[:100],
    }


@api_router.get("/admin/ai/dispatch-logs")
async def get_admin_ai_dispatch_logs(
    limit: int = 100,
    current_user: dict = Depends(require_roles(UserRole.ADMIN.value)),
):
    safe_limit = max(1, min(int(limit or 100), 300))
    logs = (
        await db.dispatch_logs.find({}, {"_id": 0})
        .sort("created_at", -1)
        .limit(safe_limit)
        .to_list(safe_limit)
    )
    return {
        "count": len(logs),
        "items": logs,
    }


@api_router.post("/launch/visit")
async def record_launch_visit(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
):
    payload: Dict[str, Any] = {}
    try:
        parsed = await request.json()
        if isinstance(parsed, dict):
            payload = parsed
    except Exception:
        payload = {}

    token_user: Optional[Dict[str, Any]] = None
    if credentials and credentials.credentials:
        try:
            token_payload = decode_token(credentials.credentials)
            token_user_id = _safe_text(token_payload.get("sub"), 80)
            if token_user_id:
                token_user = await db.users.find_one({"id": token_user_id}, {"_id": 0})
        except HTTPException:
            token_user = None
        except Exception:
            token_user = None

    identity = _build_launch_identity(payload, token_user)
    client_ip = get_client_ip(request)
    headers = request.headers
    now_utc = get_ist_now()
    event_date = now_utc.strftime("%Y-%m-%d")

    visit_doc: Dict[str, Any] = {
        "id": str(uuid.uuid4()),
        "created_at": now_utc,
        "event_date": event_date,
        "ip_address": _safe_text(client_ip, 120),
        "forwarded_for": _safe_text(headers.get("x-forwarded-for"), 300),
        "real_ip": _safe_text(headers.get("x-real-ip"), 120),
        "user_agent": _safe_text(payload.get("user_agent") or headers.get("user-agent"), 500),
        "page_url": _safe_text(payload.get("page_url"), 600),
        "referrer": _safe_text(payload.get("referrer") or headers.get("referer"), 600),
        "origin": _safe_text(headers.get("origin"), 300),
        "host": _safe_text(headers.get("host"), 300),
        "timezone": _safe_text(payload.get("timezone"), 120),
        "language": _safe_text(payload.get("language"), 80),
        "platform": _safe_text(payload.get("platform"), 120),
        "screen_width": _safe_int(payload.get("screen_width"), min_value=0, max_value=20000),
        "screen_height": _safe_int(payload.get("screen_height"), min_value=0, max_value=20000),
        "device_memory_gb": _safe_float(payload.get("device_memory_gb"), min_value=0.0, max_value=512.0),
        "country": _safe_text(
            headers.get("x-vercel-ip-country")
            or headers.get("cf-ipcountry")
            or payload.get("country"),
            100,
        ),
        "region": _safe_text(
            headers.get("x-vercel-ip-country-region")
            or headers.get("x-appengine-region")
            or payload.get("region"),
            120,
        ),
        "city": _safe_text(
            headers.get("x-vercel-ip-city")
            or headers.get("x-appengine-city")
            or payload.get("city"),
            120,
        ),
        "user_id": identity.get("user_id"),
        "name": identity.get("name"),
        "email": identity.get("email"),
        "phone": identity.get("phone"),
        "role": identity.get("role"),
        "identity_key": identity.get("identity_key") or f"anon_ip:{client_ip}",
    }
    await db.launch_page_visits.insert_one(visit_doc)

    return {
        "message": "launch visit recorded",
        "visit_id": visit_doc["id"],
    }


@api_router.get("/admin/launch-visits/report")
async def get_admin_launch_visit_report(
    days: int = 30,
    limit: int = 100,
    current_user: dict = Depends(require_roles(UserRole.ADMIN.value)),
):
    _ = current_user
    safe_days = max(1, min(int(days or 30), 365))
    safe_limit = max(10, min(int(limit or 100), 500))
    since = get_ist_now() - timedelta(days=safe_days)
    query = {"created_at": {"$gte": since}}

    total_clicks = await db.launch_page_visits.count_documents(query)
    unique_ips = await db.launch_page_visits.distinct("ip_address", query)
    unique_visitors = await db.launch_page_visits.distinct("identity_key", query)
    known_visitors = await db.launch_page_visits.distinct(
        "identity_key",
        {
            "$and": [
                query,
                {
                    "$or": [
                        {"user_id": {"$nin": [None, ""]}},
                        {"phone": {"$nin": [None, ""]}},
                        {"email": {"$nin": [None, ""]}},
                        {"name": {"$nin": [None, ""]}},
                    ]
                },
            ]
        },
    )

    recent_rows = await db.launch_page_visits.find(
        query,
        {
            "_id": 0,
            "id": 1,
            "created_at": 1,
            "page_url": 1,
            "referrer": 1,
            "ip_address": 1,
            "country": 1,
            "region": 1,
            "city": 1,
            "name": 1,
            "email": 1,
            "phone": 1,
            "role": 1,
            "identity_key": 1,
            "timezone": 1,
            "language": 1,
            "platform": 1,
            "user_agent": 1,
        },
    ).sort("created_at", -1).limit(safe_limit).to_list(safe_limit)

    visitor_rows = await db.launch_page_visits.aggregate(
        [
            {"$match": query},
            {"$sort": {"created_at": -1}},
            {
                "$group": {
                    "_id": "$identity_key",
                    "visit_count": {"$sum": 1},
                    "latest": {"$first": "$$ROOT"},
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "identity_key": "$_id",
                    "visit_count": 1,
                    "last_seen_at": "$latest.created_at",
                    "name": "$latest.name",
                    "email": "$latest.email",
                    "phone": "$latest.phone",
                    "role": "$latest.role",
                    "ip_address": "$latest.ip_address",
                    "country": "$latest.country",
                    "region": "$latest.region",
                    "city": "$latest.city",
                }
            },
            {"$sort": {"last_seen_at": -1}},
            {"$limit": safe_limit},
        ]
    ).to_list(safe_limit)

    daily_rows = await db.launch_page_visits.aggregate(
        [
            {"$match": query},
            {
                "$group": {
                    "_id": "$event_date",
                    "clicks": {"$sum": 1},
                    "unique_ips_set": {"$addToSet": "$ip_address"},
                    "unique_visitors_set": {"$addToSet": "$identity_key"},
                }
            },
            {
                "$project": {
                    "_id": 0,
                    "date": "$_id",
                    "clicks": 1,
                    "unique_ips": {"$size": "$unique_ips_set"},
                    "unique_visitors": {"$size": "$unique_visitors_set"},
                }
            },
            {"$sort": {"date": 1}},
        ]
    ).to_list(safe_days + 2)

    return {
        "days": safe_days,
        "summary": {
            "total_clicks": int(total_clicks),
            "unique_ips": len([ip for ip in unique_ips if ip]),
            "unique_visitors": len([visitor for visitor in unique_visitors if visitor]),
            "known_visitors": len([visitor for visitor in known_visitors if visitor]),
        },
        "daily": daily_rows,
        "recent_clicks": recent_rows,
        "visitors": visitor_rows,
    }

# ==================== RATING ENDPOINTS ====================
@api_router.get("/drivers/reviews")
async def get_driver_reviews(
    limit: int = Query(50, ge=1, le=100),
    skip: int = Query(0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    require_driver(current_user)
    driver_id = current_user["id"]
    ratings = await db.ratings.find({"to_user_id": driver_id}, {"_id": 0}).sort("created_at", -1).skip(skip).to_list(limit)
    total_count = await db.ratings.count_documents({"to_user_id": driver_id})
    aggregate = await db.ratings.aggregate([
        {"$match": {"to_user_id": driver_id}},
        {
            "$group": {
                "_id": "$rating",
                "count": {"$sum": 1},
            }
        },
    ]).to_list(10)
    distribution = {str(star): 0 for star in range(1, 6)}
    weighted_total = 0
    for row in aggregate:
        rating_value = int(row.get("_id") or 0)
        count = int(row.get("count") or 0)
        if 1 <= rating_value <= 5:
            distribution[str(rating_value)] = count
            weighted_total += rating_value * count

    average_rating = round(weighted_total / total_count, 2) if total_count else 0.0
    booking_ids = [item.get("booking_id") for item in ratings if item.get("booking_id")]
    passenger_ids = [item.get("from_user_id") for item in ratings if item.get("from_user_id")]
    bookings = {
        booking["id"]: booking
        for booking in await db.bookings.find({"id": {"$in": booking_ids}}, {"_id": 0}).to_list(None)
    } if booking_ids else {}
    passengers = {
        user["id"]: user
        for user in await db.users.find({"id": {"$in": passenger_ids}}, {"_id": 0, "id": 1, "name": 1}).to_list(None)
    } if passenger_ids else {}

    reviews = []
    for rating in ratings:
        booking = bookings.get(rating.get("booking_id")) or {}
        passenger = passengers.get(rating.get("from_user_id")) or {}
        reviews.append({
            "id": rating.get("id"),
            "booking_id": rating.get("booking_id"),
            "rating": int(rating.get("rating") or 0),
            "comment": rating.get("comment") or "",
            "created_at": rating.get("created_at"),
            "passenger_name": passenger.get("name") or "Passenger",
            "pickup": booking_location_label(booking, "pickup_location", "Pickup"),
            "drop": booking_location_label(booking, "drop_location", "Drop"),
            "booking_status": enum_response_value(booking.get("status")) if booking else None,
            "fare": receipt_money(booking.get("final_fare") if booking.get("final_fare") is not None else booking.get("estimated_fare")) if booking else 0.0,
            "appeal_reference": f"rating:{rating.get('id')}",
        })

    return {
        "average_rating": average_rating,
        "total_count": total_count,
        "distribution": distribution,
        "reviews": reviews,
        "has_more": skip + len(reviews) < total_count,
    }

@api_router.post("/ratings")
async def create_rating(rating_data: RatingCreate, current_user: dict = Depends(get_current_user)):
    """Rate a completed ride"""
    booking = await db.bookings.find_one({"id": rating_data.booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    if booking["status"] != BookingStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Can only rate completed rides")
    
    # Determine who is being rated
    if current_user["role"] == UserRole.PASSENGER:
        rated_user_id = booking.get("driver_id")
    else:
        rated_user_id = booking["passenger_id"]
    
    if not rated_user_id:
        raise HTTPException(status_code=400, detail="No one to rate")
    
    rating_doc = {
        "id": str(uuid.uuid4()),
        "booking_id": rating_data.booking_id,
        "from_user_id": current_user["id"],
        "to_user_id": rated_user_id,
        "rating": rating_data.rating,
        "comment": rating_data.comment,
        "created_at": get_ist_now()
    }
    
    await db.ratings.insert_one(rating_doc)
    
    # Update driver's average rating using aggregation pipeline
    if current_user["role"] == UserRole.PASSENGER and rated_user_id:
        result = await db.ratings.aggregate([
            {"$match": {"to_user_id": rated_user_id}},
            {"$group": {"_id": None, "avg_rating": {"$avg": "$rating"}}}
        ]).to_list(1)
        avg_rating = result[0]["avg_rating"] if result else 5.0
        await db.drivers.update_one(
            {"user_id": rated_user_id},
            {"$set": {"rating": round(avg_rating, 1)}}
        )
    
    return {"message": "Rating submitted"}

# ==================== ADMIN ENDPOINTS ====================
@api_router.get("/admin/dashboard")
async def get_admin_dashboard(current_user: dict = Depends(get_current_user)):
    """Get admin dashboard stats"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    total_users = await db.users.count_documents({})
    total_drivers = await db.users.count_documents({"role": UserRole.DRIVER})
    total_passengers = await db.users.count_documents({"role": UserRole.PASSENGER})
    total_bookings = await db.bookings.count_documents({})
    completed_bookings = await db.bookings.count_documents({"status": BookingStatus.COMPLETED})
    active_bookings = await db.bookings.count_documents({
        "status": {"$in": [BookingStatus.PENDING, BookingStatus.ACCEPTED, BookingStatus.DRIVER_ARRIVED, BookingStatus.IN_PROGRESS]}
    })
    
    # Revenue - use aggregation pipeline for efficiency
    revenue_result = await db.bookings.aggregate([
        {"$match": {"status": BookingStatus.COMPLETED}},
        {"$project": {"fare": {"$ifNull": ["$final_fare", "$estimated_fare"]}}},
        {"$group": {"_id": None, "total": {"$sum": "$fare"}}}
    ]).to_list(1)
    total_revenue = revenue_result[0]["total"] if revenue_result else 0
    
    return {
        "total_users": total_users,
        "total_drivers": total_drivers,
        "total_passengers": total_passengers,
        "total_bookings": total_bookings,
        "completed_bookings": completed_bookings,
        "active_bookings": active_bookings,
        "total_revenue": round(total_revenue, 2)
    }

@api_router.get("/admin/users")
async def get_all_users(current_user: dict = Depends(get_current_user)):
    """Get all users"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    users = await db.users.find({}).to_list(1000)
    return [{**u, "_id": str(u["_id"]), "password_hash": None} for u in users]

@api_router.get("/admin/users/live-status")
async def get_admin_users_live_status(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    users = await db.users.find({"role": {"$in": [UserRole.DRIVER, UserRole.PASSENGER]}}).to_list(5000)
    if not users:
        return {
            "drivers": [],
            "passengers": [],
            "live_counts": {"drivers_live": 0, "passengers_live": 0, "total_live": 0},
        }

    driver_ids = [str(user.get("id") or "") for user in users if user.get("role") == UserRole.DRIVER and user.get("id")]
    passenger_ids = [str(user.get("id") or "") for user in users if user.get("role") == UserRole.PASSENGER and user.get("id")]

    driver_profiles = await db.drivers.find({"user_id": {"$in": driver_ids}}).to_list(None) if driver_ids else []
    driver_profile_by_id = {str(profile.get("user_id")): profile for profile in driver_profiles if profile.get("user_id")}

    active_statuses = [
        BookingStatus.PENDING,
        BookingStatus.ACCEPTED,
        BookingStatus.DRIVER_ARRIVED,
        BookingStatus.IN_PROGRESS,
    ]
    active_bookings = await db.bookings.find({"status": {"$in": active_statuses}}).to_list(5000)
    active_booking_by_passenger_id: Dict[str, str] = {}
    active_booking_by_driver_id: Dict[str, str] = {}
    for booking in active_bookings:
        booking_id = str(booking.get("id") or "")
        passenger_id = str(booking.get("passenger_id") or "")
        driver_id = str(booking.get("driver_id") or "")
        if passenger_id and booking_id and passenger_id not in active_booking_by_passenger_id:
            active_booking_by_passenger_id[passenger_id] = booking_id
        if driver_id and booking_id and driver_id not in active_booking_by_driver_id:
            active_booking_by_driver_id[driver_id] = booking_id

    drivers: List[Dict[str, Any]] = []
    passengers: List[Dict[str, Any]] = []
    drivers_live = 0
    passengers_live = 0

    for user in users:
        user_id = str(user.get("id") or "")
        role = user.get("role")
        base_payload = {
            "id": user_id,
            "name": user.get("name"),
            "email": user.get("email"),
            "phone": user.get("phone"),
            "created_at": user.get("created_at"),
        }

        if role == UserRole.DRIVER:
            profile = driver_profile_by_id.get(user_id, {})
            live_location = await get_effective_driver_location(profile)
            is_live = bool(live_location)
            if is_live:
                drivers_live += 1
            drivers.append(
                {
                    **base_payload,
                    "is_live": is_live,
                    "is_available": bool(profile.get("is_available", False)),
                    "kyc_status": profile.get("kyc_status"),
                    "current_location": live_location,
                    "live_location_updated_at": profile.get("last_location_at"),
                    "active_booking_id": active_booking_by_driver_id.get(user_id),
                }
            )
            continue

        if role == UserRole.PASSENGER:
            has_active_booking = user_id in active_booking_by_passenger_id
            is_live = bool(has_active_booking)
            if is_live:
                passengers_live += 1
            passengers.append(
                {
                    **base_payload,
                    "is_live": is_live,
                    "active_booking_id": active_booking_by_passenger_id.get(user_id),
                }
            )

    drivers.sort(key=lambda item: (not item.get("is_live"), str(item.get("name") or "").lower()))
    passengers.sort(key=lambda item: (not item.get("is_live"), str(item.get("name") or "").lower()))
    return {
        "drivers": drivers,
        "passengers": passengers,
        "live_counts": {
            "drivers_live": drivers_live,
            "passengers_live": passengers_live,
            "total_live": drivers_live + passengers_live,
        },
    }

@api_router.get("/admin/bookings/ongoing")
async def get_admin_ongoing_bookings(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    active_statuses = [
        BookingStatus.PENDING,
        BookingStatus.ACCEPTED,
        BookingStatus.DRIVER_ARRIVED,
        BookingStatus.IN_PROGRESS,
    ]
    bookings = await db.bookings.find({"status": {"$in": active_statuses}}).sort("updated_at", -1).to_list(500)
    if not bookings:
        return []

    passenger_ids = [booking.get("passenger_id") for booking in bookings if booking.get("passenger_id")]
    driver_ids = [booking.get("driver_id") for booking in bookings if booking.get("driver_id")]
    user_ids = list(set(passenger_ids + driver_ids))
    users = {
        user["id"]: user
        for user in await db.users.find({"id": {"$in": user_ids}}).to_list(None)
    } if user_ids else {}
    driver_profiles = {
        profile["user_id"]: profile
        for profile in await db.drivers.find({"user_id": {"$in": driver_ids}}).to_list(None)
    } if driver_ids else {}

    items: List[Dict[str, Any]] = []
    for booking in bookings:
        passenger = users.get(booking.get("passenger_id"), {})
        driver = users.get(booking.get("driver_id"), {}) if booking.get("driver_id") else {}
        driver_profile = driver_profiles.get(booking.get("driver_id"), {}) if booking.get("driver_id") else {}
        items.append(
            {
                "id": booking.get("id"),
                "status": booking.get("status"),
                "passenger_id": booking.get("passenger_id"),
                "passenger_name": passenger.get("name", "Unknown"),
                "passenger_phone": passenger.get("phone"),
                "driver_id": booking.get("driver_id"),
                "driver_name": driver.get("name"),
                "driver_phone": driver.get("phone"),
                "vehicle_info": driver_profile.get("vehicle_info"),
                "pickup_location": booking.get("pickup_location"),
                "drop_location": booking.get("drop_location"),
                "estimated_fare": float(booking.get("estimated_fare", 0.0) or 0.0),
                "distance_km": float(booking.get("distance_km", 0.0) or 0.0),
                "trip_started_at": booking.get("trip_started_at"),
                "scheduled_for": booking.get("scheduled_for"),
                "created_at": booking.get("created_at"),
                "updated_at": booking.get("updated_at"),
            }
        )
    return items

@api_router.put("/admin/bookings/{booking_id}/cancel")
async def cancel_booking_from_admin(
    booking_id: str,
    payload: AdminBookingCancelRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.get("status") in [BookingStatus.COMPLETED, BookingStatus.CANCELLED]:
        raise HTTPException(status_code=400, detail="This booking is already closed")

    now = get_ist_now()
    cancel_reason = str(payload.reason or "Cancelled by admin on user request").strip() or "Cancelled by admin on user request"
    await db.bookings.update_one(
        {"id": booking_id},
        {
            "$set": {
                "status": BookingStatus.CANCELLED,
                "updated_at": now,
                "ride_start_otp": None,
                "ride_end_otp": None,
                "admin_cancelled_at": now,
                "admin_cancelled_by": current_user.get("id"),
                "admin_cancel_reason": cancel_reason,
            }
        },
    )
    if booking.get("driver_id"):
        await db.drivers.update_one(
            {"user_id": booking["driver_id"]},
            {"$set": {"is_available": True}},
        )

    status_payload = {
        "booking_id": booking_id,
        "status": BookingStatus.CANCELLED,
        "timestamp": now.isoformat(),
        "cancelled_by_admin": True,
        "admin_cancel_reason": cancel_reason,
    }
    await emit_to_user(booking["passenger_id"], "booking_status_changed", status_payload)
    if booking.get("driver_id"):
        await emit_to_user(booking["driver_id"], "booking_status_changed", status_payload)

    await notify_user(
        booking["passenger_id"],
        title="Ride Cancelled",
        body=f"Your ride was cancelled by admin. Reason: {cancel_reason}",
        data={"booking_id": booking_id, "status": str(BookingStatus.CANCELLED)},
    )
    if booking.get("driver_id"):
        await notify_user(
            booking["driver_id"],
            title="Ride Cancelled",
            body=f"This ride was cancelled by admin. Reason: {cancel_reason}",
            data={"booking_id": booking_id, "status": str(BookingStatus.CANCELLED)},
        )

    return {"message": "Booking cancelled by admin", "status": BookingStatus.CANCELLED}

@api_router.get("/admin/phone-changes/pending")
async def get_pending_phone_changes(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    requests = await db.phone_change_requests.find(
        {"status": "pending_admin_approval"}
    ).sort("updated_at", -1).to_list(500)
    if not requests:
        return []

    user_ids = [row.get("user_id") for row in requests if row.get("user_id")]
    users = {
        row["id"]: row
        for row in await db.users.find({"id": {"$in": user_ids}}).to_list(None)
    } if user_ids else {}

    out: List[Dict[str, Any]] = []
    for row in requests:
        user_id = row.get("user_id")
        user = users.get(user_id, {})
        out.append(
            {
                "user_id": user_id,
                "name": user.get("name", "Unknown"),
                "email": user.get("email"),
                "role": user.get("role"),
                "current_phone": user.get("phone"),
                "new_phone": row.get("new_phone"),
                "verified": bool(row.get("verified")),
                "verified_at": row.get("verified_at"),
                "requested_at": row.get("created_at"),
                "updated_at": row.get("updated_at"),
            }
        )
    return out

@api_router.put("/admin/phone-changes/{user_id}")
async def review_phone_change_request(
    user_id: str,
    payload: PhoneChangeReviewRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    request_doc = await db.phone_change_requests.find_one({"user_id": user_id})
    if not request_doc or str(request_doc.get("status")) != "pending_admin_approval":
        raise HTTPException(status_code=404, detail="No pending phone change request found for this user")

    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    now = get_ist_now()
    if payload.status == "approved":
        new_phone = normalize_phone(str(request_doc.get("new_phone") or ""))
        existing_user = await db.users.find_one({"phone": new_phone, "id": {"$ne": user_id}})
        if existing_user:
            raise HTTPException(status_code=400, detail="Phone number already registered by another user")

        await db.users.update_one(
            {"id": user_id},
            {"$set": {"phone": new_phone, "updated_at": now}},
        )
        await db.phone_change_requests.update_one(
            {"user_id": user_id},
            {
                "$set": {
                    "status": "approved",
                    "approved_at": now,
                    "reviewed_at": now,
                    "reviewed_by": current_user.get("id"),
                    "reject_reason": None,
                    "updated_at": now,
                }
            },
        )
        return {"message": "Phone change approved and user phone updated", "status": "approved", "new_phone": new_phone}

    await db.phone_change_requests.update_one(
        {"user_id": user_id},
        {
            "$set": {
                "status": "rejected",
                "reviewed_at": now,
                "reviewed_by": current_user.get("id"),
                "reject_reason": payload.reject_reason or "Rejected by admin review",
                "updated_at": now,
            }
        },
    )
    return {"message": "Phone change request rejected", "status": "rejected"}

@api_router.get("/admin/registration-payments/pending")
async def get_pending_registration_payments(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    pending_users = await db.users.find(
        {
            "registration_payment_required": True,
            "registration_payment_status": {"$in": ["submitted", "pending"]},
        }
    ).to_list(500)
    sanitized: List[Dict[str, Any]] = []
    for user in pending_users:
        sanitized.append(
            {
                "id": user.get("id"),
                "name": user.get("name"),
                "email": user.get("email"),
                "phone": user.get("phone"),
                "role": user.get("role"),
                "registration_fee_amount": user.get("registration_fee_amount", 0),
                "registration_payment_method": user.get("registration_payment_method"),
                "registration_payment_utr": user.get("registration_payment_utr"),
                "registration_payment_status": user.get("registration_payment_status"),
                "created_at": user.get("created_at"),
            }
        )
    return sanitized

@api_router.put("/admin/registration-payments/{user_id}")
async def review_registration_payment(
    user_id: str,
    payload: RegistrationPaymentReview,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    update_data: Dict[str, Any] = {
        "registration_payment_status": payload.status,
        "registration_verified_by_admin": payload.status == "verified",
        "registration_verified_at": get_ist_now(),
        "registration_verified_by": current_user.get("id"),
        "registration_reject_reason": payload.reject_reason if payload.status == "rejected" else None,
    }
    result = await db.users.update_one({"id": user_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": f"Registration payment {payload.status}"}

@api_router.get("/admin/subscriptions/pending")
async def get_pending_subscription_activations(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    users = await db.users.find(
        {
            "role": {"$in": [UserRole.PASSENGER, UserRole.DRIVER]},
            "subscription.plan_type": {"$ne": None},
            "subscription.activated_by_admin": {"$ne": True},
        }
    ).to_list(1000)
    config = await get_subscription_config()
    return [
        {
            "id": user.get("id"),
            "name": user.get("name"),
            "email": user.get("email"),
            "phone": user.get("phone"),
            "role": user.get("role"),
            "subscription": serialize_subscription_for_response(user, config),
        }
        for user in users
    ]

@api_router.get("/admin/subscriptions/payments/pending")
async def get_pending_subscription_payments(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    rows = await db.subscription_dues.find(
        {"status": "pending_verification"},
        {"_id": 0},
    ).sort("payment_submitted_at", -1).to_list(2000)
    if not rows:
        return []

    grouped: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        submission_id = str(row.get("payment_submission_id") or "")
        if not submission_id:
            continue
        entry = grouped.get(submission_id)
        if not entry:
            entry = {
                "payment_submission_id": submission_id,
                "user_id": row.get("user_id"),
                "role": row.get("role"),
                "payment_method": row.get("payment_method"),
                "payment_utr": row.get("payment_utr"),
                "payment_ref": row.get("payment_ref"),
                "submitted_at": row.get("payment_submitted_at") or row.get("updated_at") or row.get("created_at"),
                "due_count": 0,
                "total_amount": 0.0,
                "due_ids": [],
            }
            grouped[submission_id] = entry
        entry["due_count"] += 1
        entry["total_amount"] = round(float(entry["total_amount"]) + float(row.get("amount") or 0.0), 2)
        if row.get("id"):
            entry["due_ids"].append(row.get("id"))

    user_ids = [str(item.get("user_id") or "") for item in grouped.values() if item.get("user_id")]
    users = await db.users.find(
        {"id": {"$in": user_ids}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1},
    ).to_list(len(user_ids) or 1)
    user_map = {str(user.get("id")): user for user in users}

    out: List[Dict[str, Any]] = []
    for item in grouped.values():
        profile = user_map.get(str(item.get("user_id") or ""), {})
        out.append(
            {
                **item,
                "name": profile.get("name"),
                "email": profile.get("email"),
                "phone": profile.get("phone"),
            }
        )
    out.sort(key=lambda row: str(row.get("submitted_at") or ""), reverse=True)
    return out

@api_router.put("/admin/subscriptions/payments/{payment_submission_id}")
async def review_subscription_payment_submission(
    payment_submission_id: str,
    payload: SubscriptionDueReviewRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    dues = await db.subscription_dues.find(
        {"payment_submission_id": payment_submission_id, "status": "pending_verification"},
        {"_id": 0},
    ).to_list(1000)
    if not dues:
        raise HTTPException(status_code=404, detail="Pending subscription payment submission not found")

    user_id = str(dues[0].get("user_id") or "")
    if not user_id:
        raise HTTPException(status_code=400, detail="Invalid subscription payment submission")
    now = get_ist_now()

    if payload.status == "verified":
        total_amount = round(sum(float(item.get("amount") or 0.0) for item in dues), 2)
        due_ids = [item.get("id") for item in dues if item.get("id")]
        await db.subscription_dues.update_many(
            {"id": {"$in": due_ids}},
            {
                "$set": {
                    "status": "verified",
                    "verified_at": now,
                    "verified_by": current_user.get("id"),
                    "reviewed_at": now,
                    "reviewed_by": current_user.get("id"),
                    "payment_reject_reason": None,
                    "updated_at": now,
                }
            },
        )
        user = await db.users.find_one({"id": user_id}, {"_id": 0, "subscription": 1})
        if user:
            subscription = get_user_subscription(user)
            current_outstanding = round(float(subscription.get("outstanding_amount", 0.0) or 0.0), 2)
            new_outstanding = max(0.0, round(current_outstanding - total_amount, 2))
            await db.users.update_one(
                {"id": user_id},
                {
                    "$set": {
                        "subscription.outstanding_amount": new_outstanding,
                        "subscription.last_paid_at": now,
                        "subscription.last_payment_status": "verified",
                        "subscription.last_payment_reject_reason": None,
                        "subscription.last_payment_reviewed_at": now,
                        "subscription.last_payment_reviewed_by": current_user.get("id"),
                    }
                },
            )
        return {"message": "Subscription payment verified"}

    reject_reason = str(payload.reject_reason or "").strip() or "Rejected by admin review."
    due_ids = [item.get("id") for item in dues if item.get("id")]
    await db.subscription_dues.update_many(
        {"id": {"$in": due_ids}},
        {
            "$set": {
                "status": "rejected",
                "reviewed_at": now,
                "reviewed_by": current_user.get("id"),
                "payment_reject_reason": reject_reason,
                "updated_at": now,
            }
        },
    )
    await db.users.update_one(
        {"id": user_id},
        {
            "$set": {
                "subscription.last_payment_status": "rejected",
                "subscription.last_payment_reject_reason": reject_reason,
                "subscription.last_payment_reviewed_at": now,
                "subscription.last_payment_reviewed_by": current_user.get("id"),
            }
        },
    )
    return {"message": "Subscription payment rejected"}

@api_router.get("/admin/driver-fare-calculator/pending")
async def get_pending_driver_fare_calculator_requests(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    rows = await db.drivers.find(
        {"custom_fare_pricing_request.status": "pending"}
    ).sort("custom_fare_pricing_request.submitted_at", -1).to_list(500)
    driver_ids = [row.get("user_id") for row in rows if row.get("user_id")]
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": driver_ids}}).to_list(None)} if driver_ids else {}

    out: List[Dict[str, Any]] = []
    for row in rows:
        req = row.get("custom_fare_pricing_request") or {}
        payload = req.get("payload") if isinstance(req.get("payload"), dict) else None
        request_type = str(req.get("request_type") or "update")
        driver_id = row.get("user_id")
        user = users.get(driver_id, {})
        out.append(
            {
                "driver_id": driver_id,
                "driver_name": user.get("name", "Unknown"),
                "driver_email": user.get("email"),
                "driver_phone": user.get("phone"),
                "submitted_at": req.get("submitted_at"),
                "request_type": request_type,
                "note": req.get("note"),
                "payload": payload,
                "existing_status": resolve_driver_active_fare_status(row),
            }
        )
    return out

@api_router.get("/admin/driver-fare-calculator/approved")
async def get_approved_driver_fare_calculators(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    rows = await db.drivers.find(
        {"custom_fare_pricing": {"$ne": None}}
    ).sort("custom_fare_pricing_approved_at", -1).to_list(1000)
    driver_ids = [row.get("user_id") for row in rows if row.get("user_id")]
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": driver_ids}}).to_list(None)} if driver_ids else {}

    out: List[Dict[str, Any]] = []
    for row in rows:
        pricing = row.get("custom_fare_pricing")
        if not isinstance(pricing, dict):
            continue
        driver_id = row.get("user_id")
        user = users.get(driver_id, {})
        out.append(
            {
                "driver_id": driver_id,
                "driver_name": user.get("name", "Unknown"),
                "driver_email": user.get("email"),
                "driver_phone": user.get("phone"),
                "approved_at": row.get("custom_fare_pricing_approved_at"),
                "approved_by": row.get("custom_fare_pricing_approved_by"),
                "status": resolve_driver_active_fare_status(row),
                "pricing": pricing,
            }
        )
    return out

@api_router.put("/admin/driver-fare-calculator/{driver_id}")
async def review_driver_fare_calculator_request(
    driver_id: str,
    payload: DriverFareCalculatorReview,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    row = await db.drivers.find_one({"user_id": driver_id})
    if not row:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    request_doc = row.get("custom_fare_pricing_request") or {}
    request_type = str(request_doc.get("request_type") or "update")
    requested_payload = request_doc.get("payload") if isinstance(request_doc.get("payload"), dict) else None
    if request_type not in {"update", "reset"}:
        raise HTTPException(status_code=400, detail="Invalid fare calculator request type")
    if request_type == "update" and not requested_payload:
        raise HTTPException(status_code=400, detail="No fare calculator request found for this driver")

    now = get_ist_now()
    if payload.status == "approved":
        if request_type == "reset":
            await db.drivers.update_one(
                {"user_id": driver_id},
                {
                    "$set": {
                        "custom_fare_pricing": None,
                        "custom_fare_pricing_status": "default",
                        "custom_fare_pricing_approved_at": now,
                        "custom_fare_pricing_approved_by": current_user.get("id"),
                        "custom_fare_pricing_request.status": "approved",
                        "custom_fare_pricing_request.reviewed_at": now,
                        "custom_fare_pricing_request.reviewed_by": current_user.get("id"),
                        "custom_fare_pricing_request.reject_reason": None,
                    }
                },
            )
            return {"message": "Driver fare calculator reset approved", "status": "approved"}
        try:
            config_model = DriverFareCalculatorConfig(**requested_payload)
            validate_driver_fare_radius_constraints(config_model)
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=400, detail="Requested fare calculator payload is invalid")

        await db.drivers.update_one(
            {"user_id": driver_id},
            {
                "$set": {
                    "custom_fare_pricing": config_model.dict(),
                    "custom_fare_pricing_status": "approved",
                    "custom_fare_pricing_approved_at": now,
                    "custom_fare_pricing_approved_by": current_user.get("id"),
                    "custom_fare_pricing_request.status": "approved",
                    "custom_fare_pricing_request.reviewed_at": now,
                    "custom_fare_pricing_request.reviewed_by": current_user.get("id"),
                    "custom_fare_pricing_request.reject_reason": None,
                }
            },
        )
        return {"message": "Driver fare calculator approved", "status": "approved"}

    fallback_status = "approved" if row.get("custom_fare_pricing") else "default"
    await db.drivers.update_one(
        {"user_id": driver_id},
        {
            "$set": {
                "custom_fare_pricing_status": fallback_status,
                "custom_fare_pricing_request.status": "rejected",
                "custom_fare_pricing_request.reviewed_at": now,
                "custom_fare_pricing_request.reviewed_by": current_user.get("id"),
                "custom_fare_pricing_request.reject_reason": payload.reject_reason or "Rejected by admin",
            }
        },
    )
    return {"message": "Driver fare calculator rejected", "status": fallback_status}

@api_router.put("/admin/subscriptions/config")
async def update_subscription_config(
    settings: SubscriptionConfig,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    for role_key, role_config in (("passenger", settings.passenger), ("driver", settings.driver)):
        for plan_key, plan in (
            ("monthly", role_config.monthly),
            ("quarterly", role_config.quarterly),
            ("annually", role_config.annually),
            ("per_trip", role_config.per_trip),
        ):
            amount = round(float(getattr(plan, "amount", 0.0) or 0.0), 2)
            if amount > 0 and (not plan.scheme_start_at or not plan.scheme_end_at):
                raise HTTPException(
                    status_code=400,
                    detail=f"{role_key} {plan_key} scheme start and end date are required when amount is greater than zero",
                )
            start_at = as_utc_naive(plan.scheme_start_at) if plan.scheme_start_at else None
            end_at = as_utc_naive(plan.scheme_end_at) if plan.scheme_end_at else None
            if start_at and end_at and end_at <= start_at:
                raise HTTPException(
                    status_code=400,
                    detail=f"{role_key} {plan_key} scheme end date must be after start date",
                )

    now = get_ist_now()
    subscription_payload = settings.dict()
    subscription_payload["updated_at"] = now
    await db.pricing_rules.update_one(
        {},
        {"$set": {"subscription_config": subscription_payload, "updated_at": now}},
        upsert=True,
    )
    await cache_delete("pricing_rules:active")
    return SubscriptionConfig(**subscription_payload)

@api_router.put("/admin/subscriptions/users/{user_id}")
async def activate_user_subscription(
    user_id: str,
    payload: SubscriptionUserActivationRequest,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("role") not in {UserRole.PASSENGER, UserRole.DRIVER}:
        raise HTTPException(status_code=400, detail="Only driver and passenger subscriptions can be managed")

    existing_subscription = get_user_subscription(user)
    selected_plan = payload.plan_type or parse_subscription_plan_type(existing_subscription.get("plan_type"))
    if payload.activate and not selected_plan:
        raise HTTPException(status_code=400, detail="User must select a subscription plan before activation")

    now = get_ist_now()
    set_fields: Dict[str, Any] = {
        "subscription.activation_note": payload.note,
        "subscription.activated_by": current_user.get("id"),
    }

    if not payload.activate:
        set_fields.update(
            {
                "subscription.is_active": False,
                "subscription.activated_by_admin": False,
                "subscription.activated_at": None,
            }
        )
        await db.users.update_one({"id": user_id}, {"$set": set_fields})
        refreshed = await db.users.find_one({"id": user_id})
        config = await get_subscription_config()
        return {"message": "Subscription deactivated", "subscription": serialize_subscription_for_response(refreshed, config)}

    config = await get_subscription_config()
    role_config = get_role_subscription_config(config, user["role"])
    if not is_subscription_plan_active(role_config, selected_plan):
        raise HTTPException(status_code=400, detail="Selected plan is not active in admin settings")

    set_fields.update(
        {
            "subscription.plan_type": selected_plan.value,
            "subscription.is_active": True,
            "subscription.activated_by_admin": True,
            "subscription.activated_at": now,
            "subscription.selected_at": existing_subscription.get("selected_at") or now,
        }
    )

    if selected_plan in {
        SubscriptionPlanType.MONTHLY,
        SubscriptionPlanType.QUARTERLY,
        SubscriptionPlanType.ANNUALLY,
    }:
        expires_at = get_subscription_period_expiry(selected_plan, now)
        set_fields["subscription.period_started_at"] = now
        set_fields["subscription.period_expires_at"] = expires_at
    else:
        set_fields["subscription.period_started_at"] = None
        set_fields["subscription.period_expires_at"] = None

    await db.users.update_one({"id": user_id}, {"$set": set_fields})
    refreshed = await db.users.find_one({"id": user_id})
    return {"message": "Subscription activated", "subscription": serialize_subscription_for_response(refreshed, config)}

@api_router.put("/admin/pricing")
async def update_pricing(pricing: PricingRule, current_user: dict = Depends(get_current_user)):
    """Update pricing rules"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    existing = await db.pricing_rules.find_one({}) or {}
    incoming_fields = pricing.dict(exclude_unset=True)
    merged = {**existing, **incoming_fields}
    merged_model = PricingRule(**merged)

    if merged_model.driver_long_distance_search_radius_km < merged_model.driver_base_search_radius_km:
        raise HTTPException(
            status_code=400,
            detail="Long distance search radius (B) must be greater than or equal to base radius (A)",
        )
    
    pricing_dict = merged_model.dict()
    pricing_dict["updated_at"] = get_ist_now()
    
    await db.pricing_rules.update_one({}, {"$set": pricing_dict}, upsert=True)
    await cache_delete("pricing_rules:active")
    
    return {"message": "Pricing updated"}

@api_router.get("/admin/registration-fees/config", response_model=RegistrationFeeSettings)
async def get_admin_registration_fee_config(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return await get_registration_fee_settings(apply_current_window=False)

@api_router.put("/admin/registration-fees", response_model=RegistrationFeeSettings)
async def update_registration_fees(
    settings: RegistrationFeeSettings,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    passenger_fee = float(settings.passenger_registration_fee or 0.0)
    driver_fee = float(settings.driver_registration_fee or 0.0)
    if passenger_fee > 0 or driver_fee > 0:
        if not settings.scheme_start_at or not settings.scheme_end_at:
            raise HTTPException(
                status_code=400,
                detail="Registration fee scheme start and end date are required when fee is greater than zero",
            )
        start_at = as_utc_naive(settings.scheme_start_at)
        end_at = as_utc_naive(settings.scheme_end_at)
        if start_at and end_at and end_at <= start_at:
            raise HTTPException(status_code=400, detail="Registration fee scheme end date must be after start date")

    await db.pricing_rules.update_one(
        {},
        {
            "$set": {
                "passenger_registration_fee": passenger_fee,
                "driver_registration_fee": driver_fee,
                "registration_fee_scheme_start_at": settings.scheme_start_at,
                "registration_fee_scheme_end_at": settings.scheme_end_at,
                "enable_qr": bool(settings.enable_qr),
                "enable_upi": bool(settings.enable_upi or settings.registration_upi_id),
                "enable_razorpay": bool(settings.enable_razorpay),
                "registration_qr_code_url": settings.registration_qr_code_url,
                "registration_upi_id": settings.registration_upi_id,
                "razorpay_payment_link": settings.razorpay_payment_link,
                "updated_at": get_ist_now(),
            }
        },
        upsert=True,
    )
    await cache_delete("pricing_rules:active")
    return settings


@api_router.get("/admin/spin-win/config")
async def get_admin_spin_win_config(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return await get_spin_win_config_document()


@api_router.put("/admin/spin-win/config")
async def update_admin_spin_win_config(
    payload: SpinWinConfigPayload,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    starts_at = as_utc_naive(payload.starts_at) if payload.starts_at else None
    ends_at = as_utc_naive(payload.ends_at) if payload.ends_at else None
    if starts_at and ends_at and ends_at <= starts_at:
        raise HTTPException(status_code=400, detail="Spin & Win end date must be after start date")
    if payload.enabled and int(payload.daily_spin_limit or 0) <= 0:
        raise HTTPException(status_code=400, detail="Daily spin limit must be greater than zero when enabled")
    if payload.enabled and not payload.prizes:
        raise HTTPException(status_code=400, detail="At least one prize is required when Spin & Win is enabled")

    now = get_ist_now()
    config_doc = {
        "id": SPIN_WIN_CONFIG_ID,
        "enabled": bool(payload.enabled),
        "daily_spin_limit": max(0, min(SPIN_WIN_MAX_DAILY_LIMIT, int(payload.daily_spin_limit or 0))),
        "eligible_roles": normalize_spin_roles([str(role.value if isinstance(role, UserRole) else role) for role in payload.eligible_roles]),
        "included_user_ids": normalize_spin_user_ids(payload.included_user_ids),
        "excluded_user_ids": normalize_spin_user_ids(payload.excluded_user_ids),
        "starts_at": starts_at,
        "ends_at": ends_at,
        "prizes": normalize_spin_prizes([item.dict() for item in payload.prizes]),
        "updated_at": now,
    }
    await db.spin_win_config.update_one(
        {"id": SPIN_WIN_CONFIG_ID},
        {"$set": config_doc, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    return await get_spin_win_config_document()


@api_router.get("/admin/spin-win/winners")
async def get_admin_spin_win_winners(
    limit: int = 100,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    safe_limit = max(1, min(500, int(limit or 100)))
    winners = await db.spin_win_rewards.find({}).sort("created_at", -1).to_list(safe_limit)
    for winner in winners:
        winner.pop("_id", None)
    return winners

# API root (useful quick-check endpoint)
@api_router.get("")
@api_router.get("/")
async def api_root():
    return {
        "message": "AutoBuddy API is running",
        "health": "/api/health",
        "metrics": "/api/metrics",
    }

# Health check
@api_router.get("/health")
async def health_check():
    now = get_ist_now().isoformat()
    uptime_seconds = max(0.0, time.time() - STARTUP_TS)
    redis_status = "ok" if runtime_state.is_redis_enabled else "degraded"
    feature_database_status = get_feature_database_status()
    queue_pending: Optional[int] = None
    analytics_queue_pending: Optional[int] = None
    if redis_client:
        try:
            queue_pending = int(await redis_client.zcard(RIDE_QUEUE_KEY))
            analytics_queue_pending = int(await redis_client.llen(ANALYTICS_QUEUE_KEY))
        except Exception:
            queue_pending = None
            analytics_queue_pending = None
    try:
        await db.command("ping")
    except ServerSelectionTimeoutError:
        return JSONResponse(
            status_code=503,
            content={
                "status": "degraded",
                "database": "unreachable",
                "redis": redis_status,
                "redis_queue_pending": queue_pending,
                "analytics_queue_pending": analytics_queue_pending,
                "passenger_feature_database": feature_database_status,
                "uptime_seconds": round(uptime_seconds, 2),
                "timestamp": now,
            },
        )
    except PyMongoError:
        return JSONResponse(
            status_code=503,
            content={
                "status": "degraded",
                "database": "error",
                "redis": redis_status,
                "redis_queue_pending": queue_pending,
                "analytics_queue_pending": analytics_queue_pending,
                "passenger_feature_database": feature_database_status,
                "uptime_seconds": round(uptime_seconds, 2),
                "timestamp": now,
            },
        )

    if APP_UPTIME_SECONDS is not None:
        APP_UPTIME_SECONDS.set(uptime_seconds)

    return {
        "status": "healthy",
        "database": "ok",
        "redis": redis_status,
        "redis_queue_pending": queue_pending,
        "analytics_queue_pending": analytics_queue_pending,
        "passenger_feature_database": feature_database_status,
        "uptime_seconds": round(uptime_seconds, 2),
        "timestamp": now,
    }


def _worker_health(task: Optional[asyncio.Task]) -> str:
    if task is None:
        return "missing"
    if task.cancelled():
        return "cancelled"
    if task.done():
        return "stopped"
    return "running"


@api_router.get("/ready")
async def readiness_check():
    started = time.perf_counter()
    now = get_ist_now().isoformat()
    feature_database_status = get_feature_database_status()
    feature_database_ok = bool(feature_database_status.get("production_ready"))
    worker_state = {
        "driver_health_monitor": _worker_health(driver_health_monitor_task),
        "ride_dispatch_worker": _worker_health(ride_dispatch_worker_task),
        "analytics_warehouse_worker": _worker_health(analytics_warehouse_worker_task),
    }
    redis_runtime_ok = runtime_state.is_redis_enabled
    redis_requirement_ok = (not (IS_PRODUCTION_ENV and REQUIRE_REDIS_IN_PRODUCTION)) or redis_runtime_ok
    database_ok = True
    db_error: Optional[str] = None
    try:
        await db.command("ping", maxTimeMS=READINESS_DB_PING_TIMEOUT_MS)
    except Exception as exc:
        database_ok = False
        db_error = str(exc)
    api_global_limit = await get_rate_limit_profile_rule(
        "api_global",
        db,
        bucket_name="profile:api_global",
    )

    workers_ok = all(state == "running" for state in worker_state.values())
    ready = database_ok and redis_requirement_ok and workers_ok and feature_database_ok
    payload = {
        "status": "ready" if ready else "not_ready",
        "database": "ok" if database_ok else "error",
        "passenger_feature_database": feature_database_status,
        "redis_runtime_state": "ok" if redis_runtime_ok else "degraded",
        "redis_required": bool(IS_PRODUCTION_ENV and REQUIRE_REDIS_IN_PRODUCTION),
        "workers": worker_state,
        "request_limits": {
            "api_global": {
                "enabled": api_global_limit is not None,
                "window_seconds": api_global_limit.window_seconds if api_global_limit else None,
                "max_requests": api_global_limit.max_requests if api_global_limit else None,
                "source": api_global_limit.source if api_global_limit else "database",
            },
            "max_request_body_bytes": MAX_REQUEST_BODY_BYTES,
        },
        "elapsed_ms": round((time.perf_counter() - started) * 1000, 2),
        "timestamp": now,
    }
    if db_error:
        payload["database_error"] = db_error
    return JSONResponse(status_code=200 if ready else 503, content=payload)


@api_router.get("/metrics")
async def metrics():
    if not ENABLE_METRICS or generate_latest is None:
        raise HTTPException(status_code=404, detail="Metrics are disabled")
    payload = generate_latest()
    return Response(content=payload, media_type=CONTENT_TYPE_LATEST)

# ==================== SOCKET.IO EVENTS ====================
def ride_room(booking_id: str) -> str:
    return f"ride:{str(booking_id or '').strip()}"

def user_room(user_id: str) -> str:
    return f"user:{str(user_id or '').strip()}"

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius_km = 6371.0
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    arc = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    )
    return earth_radius_km * 2 * math.atan2(math.sqrt(arc), math.sqrt(1 - arc))

def calculate_eta_minutes(
    driver_location: Optional[Dict[str, Any]],
    target_location: Optional[Dict[str, Any]],
    avg_speed_kmph: float = DEFAULT_CITY_SPEED_KMPH,
) -> Optional[int]:
    normalized_driver = normalize_tracking_location(driver_location)
    normalized_target = normalize_tracking_location(target_location)
    if not normalized_driver or not normalized_target:
        return None
    speed = max(5.0, float(avg_speed_kmph or DEFAULT_CITY_SPEED_KMPH or 22.0))
    distance_km = haversine_km(
        float(normalized_driver["latitude"]),
        float(normalized_driver["longitude"]),
        float(normalized_target["latitude"]),
        float(normalized_target["longitude"]),
    )
    eta = (distance_km / speed) * 60
    return max(1, int(round(eta)))

def _extract_socket_token(environ: Dict[str, Any], auth: Optional[Dict[str, Any]]) -> Optional[str]:
    token = None
    if isinstance(auth, dict):
        token = auth.get("token")
    if token:
        return str(token).strip()
    query_string = str((environ or {}).get("QUERY_STRING") or "")
    if query_string:
        params = parse_qs(query_string, keep_blank_values=False)
        query_token = (params.get("token") or [None])[0]
        if query_token:
            return str(query_token).strip()
    return None

async def _bind_socket_user(sid: str, user_id: str, role: Optional[str]) -> None:
    user_id = str(user_id or "").strip()
    if not user_id:
        return
    normalized_role = str(role or "")
    await runtime_state.bind_socket_user(sid, user_id, normalized_role)
    await sio.save_session(sid, {"user_id": user_id, "role": str(role or "")})
    await sio.enter_room(sid, user_room(user_id))
    if normalized_role.lower() == UserRole.DRIVER.value:
        await sio.enter_room(sid, "drivers")

async def get_socket_session_user(sid: str) -> Optional[Dict[str, str]]:
    try:
        raw = await sio.get_session(sid)
    except Exception:
        raw = None
    if isinstance(raw, dict) and raw.get("user_id"):
        return {
            "user_id": str(raw.get("user_id")),
            "role": str(raw.get("role") or ""),
        }
    return await runtime_state.get_socket_session_user(sid)

async def get_user_from_socket(environ: Dict[str, Any], auth: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    token = _extract_socket_token(environ or {}, auth or {})
    if not token:
        return None
    try:
        payload = decode_token(token)
    except Exception:
        return None
    user_id = str(payload.get("sub") or payload.get("id") or "").strip()
    if not user_id:
        return None
    return await db.users.find_one({"id": user_id}, {"_id": 0})


async def emit_driver_connection_state(
    *,
    booking_id: str,
    driver_id: str,
    online: bool,
    message: Optional[str] = None,
) -> None:
    normalized_booking_id = str(booking_id or "").strip()
    normalized_driver_id = str(driver_id or "").strip()
    if not normalized_booking_id or not normalized_driver_id:
        return
    payload = {
        "booking_id": normalized_booking_id,
        "driver_id": normalized_driver_id,
        "online": bool(online),
        "timestamp": get_ist_now().isoformat(),
    }
    if message:
        payload["message"] = str(message)
    await sio.emit("driver_connection_changed", payload, room=ride_room(normalized_booking_id))
    await sio.emit("driver_connection_changed", payload, room=f"booking:{normalized_booking_id}")
    # Backward/forward compatibility for alternate client event names.
    await sio.emit("driver_connection", payload, room=ride_room(normalized_booking_id))
    await sio.emit("driver_connection", payload, room=f"booking:{normalized_booking_id}")


async def emit_ride_sync_state(
    booking_id: str,
    *,
    to_sid: Optional[str] = None,
) -> None:
    normalized_booking_id = str(booking_id or "").strip()
    if not normalized_booking_id:
        return
    booking = await db.bookings.find_one({"id": normalized_booking_id}, {"_id": 0})
    if not booking:
        return
    driver_live_location = booking.get("driver_live_location") or booking.get("driver_location")
    payload = {
        "booking_id": normalized_booking_id,
        "status": booking.get("status"),
        "driver_id": booking.get("driver_id"),
        "passenger_id": booking.get("passenger_id"),
        "pickup_location": booking.get("pickup_location"),
        "drop_location": booking.get("drop_location") or booking.get("dropoff_location"),
        "driver_live_location": driver_live_location,
        "eta_to_pickup_min": booking.get("driver_eta_to_pickup_min"),
        "eta_to_drop_min": booking.get("driver_eta_to_drop_min"),
        "updated_at": get_ist_now().isoformat(),
    }
    target = to_sid if to_sid else ride_room(normalized_booking_id)
    await sio.emit("ride_state_sync", payload, to=target)
    # Compatibility alias used by some clients.
    await sio.emit("ride_sync", payload, to=target)

@sio.event
async def connect(sid, environ, auth=None):
    socket_origin = str((environ or {}).get("HTTP_ORIGIN") or "").strip()
    if socket_origin and not is_origin_allowed(socket_origin):
        raise ConnectionRefusedError("Origin not allowed")

    user = await get_user_from_socket(environ or {}, auth if isinstance(auth, dict) else None)
    if not user:
        raise ConnectionRefusedError("Unauthorized socket")

    await _bind_socket_user(sid, str(user.get("id") or ""), str(user.get("role") or ""))
    logger.info(f"Socket connected and authenticated: sid={sid}")
    user_id = str(user.get("id") or "").strip()
    role = str(user.get("role") or "").strip().lower()
    if role == UserRole.DRIVER.value:
        active_booking_id = await runtime_state.get_driver_active_booking(user_id)
        if active_booking_id:
            await sio.enter_room(sid, ride_room(active_booking_id))
            await sio.enter_room(sid, f"booking:{active_booking_id}")
            await emit_driver_connection_state(
                booking_id=active_booking_id,
                driver_id=user_id,
                online=True,
            )

    await sio.emit(
        "socket_connected",
        {
            "user_id": user.get("id"),
            "role": user.get("role"),
            "timestamp": get_ist_now().isoformat(),
        },
        to=sid,
    )
    # Compatibility alias used by alternate clients.
    await sio.emit(
        "connected_ok",
        {
            "user_id": user.get("id"),
            "role": user.get("role"),
            "timestamp": get_ist_now().isoformat(),
        },
        to=sid,
    )

@sio.event
async def disconnect(sid):
    logger.info(f"Client disconnected: {sid}")
    session_user = await runtime_state.disconnect_socket_user(sid)
    user_id = str((session_user or {}).get("user_id") or "").strip()
    if not user_id:
        return

    role = str((session_user or {}).get("role") or "").lower()
    if role == UserRole.DRIVER.value:
        await runtime_state.touch_driver_heartbeat(user_id)
        active_booking_id = await runtime_state.get_driver_active_booking(user_id)
        if active_booking_id:
            await emit_driver_connection_state(
                booking_id=active_booking_id,
                driver_id=user_id,
                online=False,
                message="Driver connection lost. Trying to reconnect.",
            )

@sio.event
async def join(sid, data):
    """Legacy join support for older clients: { user_id }."""
    user_id = str((data or {}).get('user_id') or '').strip()
    if not user_id:
        return {"ok": False, "message": "user_id required"}

    session_user = await get_socket_session_user(sid)
    if session_user:
        session_user_id = str(session_user.get("user_id") or "").strip()
        session_role = str(session_user.get("role") or "").lower()
        if session_user_id and user_id != session_user_id and session_role != UserRole.ADMIN.value:
            return {"ok": False, "message": "user_id mismatch"}

    user = await db.users.find_one({"id": user_id})
    if not user:
        return {"ok": False, "message": "User not found"}

    await _bind_socket_user(sid, user_id, str(user.get("role") or ""))
    logger.info(f"User {user_id} joined with sid {sid}")
    await sio.emit('joined', {'status': 'connected', 'user_id': user_id}, to=sid)
    return {"ok": True}

@sio.event
async def join_ride_room(sid, data):
    session_user = await get_socket_session_user(sid)
    if not session_user:
        await sio.emit("ride_join_error", {"message": "Not authenticated"}, to=sid)
        return {"ok": False, "message": "Not authenticated"}

    user_id = str(session_user.get("user_id") or "").strip()
    role = str(session_user.get("role") or "").lower()
    booking_id = str((data or {}).get("booking_id") or "").strip()
    if not booking_id:
        await sio.emit("ride_join_error", {"message": "booking_id required"}, to=sid)
        return {"ok": False, "message": "booking_id required"}

    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        await sio.emit("ride_join_error", {"message": "Booking not found"}, to=sid)
        return {"ok": False, "message": "Booking not found"}

    allowed = user_id in {
        str(booking.get("passenger_id") or ""),
        str(booking.get("driver_id") or ""),
    } or role == UserRole.ADMIN.value
    if not allowed:
        await sio.emit("ride_join_error", {"message": "Not allowed for this ride"}, to=sid)
        return {"ok": False, "message": "Not allowed"}

    await sio.enter_room(sid, ride_room(booking_id))
    await sio.enter_room(sid, f"booking:{booking_id}")
    if role == UserRole.DRIVER.value:
        await runtime_state.set_driver_active_booking(user_id, booking_id)
        await runtime_state.touch_driver_heartbeat(user_id)

    await emit_ride_sync_state(booking_id, to_sid=sid)
    return {"ok": True}

@sio.event
async def leave_ride_room(sid, data):
    booking_id = str((data or {}).get("booking_id") or "").strip()
    if not booking_id:
        return {"ok": False, "message": "booking_id required"}
    await sio.leave_room(sid, ride_room(booking_id))
    await sio.leave_room(sid, f"booking:{booking_id}")
    return {"ok": True}


@sio.event
async def leave_ride(sid, data):
    """Compatibility alias for enterprise clients."""
    return await leave_ride_room(sid, data)

@sio.event
async def join_booking(sid, data):
    """Backward-compatible alias."""
    return await join_ride_room(sid, data)


@sio.event
async def join_ride(sid, data):
    """Compatibility alias for enterprise clients."""
    return await join_ride_room(sid, data)

async def get_user_id_from_sid(sid: str) -> Optional[str]:
    session_user = await runtime_state.get_socket_session_user(sid)
    if session_user and session_user.get("user_id"):
        return str(session_user.get("user_id"))
    return None

@sio.event
async def booking_chat_send(sid, data):
    user_session = await get_socket_session_user(sid)
    user_id = user_session.get("user_id") if user_session else await get_user_id_from_sid(sid)
    if not user_id:
        return

    booking_id = (data or {}).get("booking_id")
    message = ((data or {}).get("message") or "").strip()
    if not booking_id or not message:
        return

    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        return
    if user_id not in {booking.get("passenger_id"), booking.get("driver_id")}:
        return
    if not booking_status_allows_live_comm(booking.get("status")):
        return

    sender = await db.users.find_one({"id": user_id})
    sender_name = sender.get("name") if sender else "User"
    sender_role = sender.get("role") if sender else UserRole.PASSENGER
    now = get_ist_now()

    message_doc = {
        "id": str(uuid.uuid4()),
        "booking_id": booking_id,
        "sender_id": user_id,
        "sender_name": sender_name,
        "sender_role": sender_role,
        "message": message[:600],
        "created_at": now,
    }
    await db.booking_chat.insert_one(message_doc)

    payload = {
        "id": message_doc["id"],
        "booking_id": booking_id,
        "sender_id": message_doc["sender_id"],
        "sender_name": message_doc["sender_name"],
        "sender_role": str(message_doc["sender_role"]),
        "message": message_doc["message"],
        "created_at": now.isoformat(),
    }
    await emit_to_user(booking.get("passenger_id"), "booking_chat_message", payload)
    await emit_to_user(booking.get("driver_id"), "booking_chat_message", payload)

@sio.event
async def driver_heartbeat(sid, data):
    session_user = await get_socket_session_user(sid)
    if not session_user:
        return {"ok": False, "message": "Not authenticated"}

    driver_id = str(session_user.get("user_id") or "").strip()
    role = str(session_user.get("role") or "").lower()
    if role and role != UserRole.DRIVER.value:
        return {"ok": False, "message": "Only driver can send heartbeat"}

    await runtime_state.touch_driver_heartbeat(driver_id)
    fallback_booking_id = await runtime_state.get_driver_active_booking(driver_id)
    booking_id = str((data or {}).get("booking_id") or fallback_booking_id or "").strip()
    if booking_id:
        await runtime_state.set_driver_active_booking(driver_id, booking_id)

    await sio.emit(
        "driver_heartbeat_ack",
        {
            "driver_id": driver_id,
            "booking_id": booking_id or None,
            "server_time": get_ist_now().isoformat(),
        },
        to=sid,
    )
    if booking_id:
        await emit_driver_connection_state(
            booking_id=booking_id,
            driver_id=driver_id,
            online=True,
        )
    return {"ok": True}

@sio.event
async def driver_location_update(sid, data):
    """Driver sends location update (supports {location:{...}} or {latitude,longitude,...})."""
    user_session = await get_socket_session_user(sid)
    if not user_session:
        return {"ok": False, "message": "Not authenticated"}

    driver_id = str(user_session.get("user_id") or "")
    role = str(user_session.get("role") or "")
    if role.lower() and role.lower() != UserRole.DRIVER.value:
        return {"ok": False, "message": "Only driver can send location"}

    raw_location = (data or {}).get("location")
    if not isinstance(raw_location, dict):
        raw_location = {
            "latitude": (data or {}).get("latitude"),
            "longitude": (data or {}).get("longitude"),
            "heading": (data or {}).get("heading"),
            "speed": (data or {}).get("speed"),
            "accuracy": (data or {}).get("accuracy"),
            "address": (data or {}).get("address"),
        }
    normalized_live_location = await cache_driver_live_location(driver_id, raw_location)
    if not normalized_live_location:
        return {"ok": False, "message": "Invalid location payload"}

    booking_id = str((data or {}).get("booking_id") or "").strip()
    if not booking_id:
        active = await db.bookings.find_one(
            {
                "driver_id": driver_id,
                "status": {"$in": [BookingStatus.ACCEPTED, BookingStatus.DRIVER_ARRIVED, BookingStatus.IN_PROGRESS]},
            },
            sort=[("updated_at", -1)],
        )
        booking_id = str((active or {}).get("id") or "").strip()
    if booking_id:
        await runtime_state.set_driver_active_booking(driver_id, booking_id)
    await runtime_state.touch_driver_heartbeat(driver_id)

    location_payload = {
        "latitude": normalized_live_location.get("latitude"),
        "longitude": normalized_live_location.get("longitude"),
        "heading": (data or {}).get("heading"),
        "speed": (data or {}).get("speed"),
        "accuracy": (data or {}).get("accuracy"),
        "address": normalized_live_location.get("address") or (data or {}).get("address"),
        "updated_at": get_ist_now().isoformat(),
    }
    geo_location = {
        "type": "Point",
        "coordinates": [
            float(location_payload.get("longitude")),
            float(location_payload.get("latitude")),
        ],
    }

    await db.drivers.update_one(
        {"user_id": driver_id},
        {
            "$set": {
                "current_location": location_payload,
                "current_location_geo": geo_location,
                "last_location_at": get_ist_now(),
                "is_online": True,
            }
        },
        upsert=True,
    )
    await cache_delete(f"driver_profile:{driver_id}")

    payload = {
        "booking_id": booking_id,
        "driver_id": driver_id,
        "location": location_payload,
        "latitude": location_payload.get("latitude"),
        "longitude": location_payload.get("longitude"),
        "heading": (data or {}).get("heading"),
        "speed": (data or {}).get("speed"),
        "accuracy": (data or {}).get("accuracy"),
        "eta_to_pickup_min": None,
        "eta_to_drop_min": None,
        "timestamp": get_ist_now().isoformat(),
    }

    if booking_id:
        booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
        if booking and str(booking.get("passenger_id") or ""):
            pickup = booking.get("pickup_location")
            drop = booking.get("drop_location") or booking.get("dropoff_location")
            payload["eta_to_pickup_min"] = calculate_eta_minutes(location_payload, pickup)
            payload["eta_to_drop_min"] = calculate_eta_minutes(location_payload, drop)
            await db.bookings.update_one(
                {"id": booking_id},
                {
                    "$set": {
                        "driver_live_location": location_payload,
                        "driver_location": location_payload,
                        "driver_eta_to_pickup_min": payload["eta_to_pickup_min"],
                        "driver_eta_to_drop_min": payload["eta_to_drop_min"],
                        "updated_at": get_ist_now(),
                    }
                },
            )

        await sio.emit("driver_location_changed", payload, room=ride_room(booking_id))
        await sio.emit("driver_location", payload, room=ride_room(booking_id))
        await sio.emit("driver_location_changed", payload, room=f"booking:{booking_id}")
        await sio.emit("driver_location", payload, room=f"booking:{booking_id}")

        if booking:
            passenger_id = str(booking.get("passenger_id") or "")
            driver_user_id = str(booking.get("driver_id") or "")
            if passenger_id:
                await emit_to_user(passenger_id, "driver_location_changed", payload)
                await emit_to_user(passenger_id, "driver_location", payload)
            if driver_user_id:
                await emit_to_user(driver_user_id, "driver_location_changed", payload)
                await emit_to_user(driver_user_id, "driver_location", payload)

    return {"ok": True}


@sio.event
async def driver_location(sid, data):
    """Compatibility alias for enterprise clients."""
    return await driver_location_update(sid, data)

@sio.event
async def ride_state_update(sid, data):
    session_user = await get_socket_session_user(sid)
    if not session_user:
        return {"ok": False, "message": "Not authenticated"}
    user_id = str(session_user.get("user_id") or "").strip()
    role = str(session_user.get("role") or "").lower()

    booking_id = str((data or {}).get("booking_id") or "").strip()
    status = str((data or {}).get("status") or "").strip()
    if not booking_id or not status:
        return {"ok": False, "message": "booking_id and status required"}

    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        return {"ok": False, "message": "Booking not found"}

    allowed = user_id == str(booking.get("driver_id") or "") or role == UserRole.ADMIN.value
    if not allowed:
        return {"ok": False, "message": "Not allowed"}

    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"status": status, "updated_at": get_ist_now()}},
    )
    await clear_active_ride_cache(str(booking.get("driver_id") or ""), str(booking.get("passenger_id") or ""))
    if status in {BookingStatus.COMPLETED.value, BookingStatus.CANCELLED.value, BookingStatus.ACCEPTED.value}:
        await remove_ride_from_queue(booking_id)

    status_payload = {
        "booking_id": booking_id,
        "status": status,
        "timestamp": get_ist_now().isoformat(),
    }
    await sio.emit("booking_status_changed", status_payload, room=ride_room(booking_id))
    await sio.emit("booking_status_changed", status_payload, room=f"booking:{booking_id}")
    await emit_to_user(str(booking.get("passenger_id") or ""), "booking_status_changed", status_payload)
    await emit_to_user(str(booking.get("driver_id") or ""), "booking_status_changed", status_payload)
    return {"ok": True}

@sio.event
async def booking_status_update(sid, data):
    """Backward-compatible alias for ride_state_update."""
    return await ride_state_update(sid, data)


@sio.event
async def ride_status_update(sid, data):
    """Compatibility alias for enterprise clients."""
    return await ride_state_update(sid, data)


@sio.event
async def ride_sync_request(sid, data):
    """Return latest ride state to reconnecting clients."""
    session_user = await get_socket_session_user(sid)
    if not session_user:
        return {"ok": False, "message": "Not authenticated"}
    user_id = str(session_user.get("user_id") or "").strip()
    role = str(session_user.get("role") or "").lower()
    booking_id = str((data or {}).get("booking_id") or "").strip()
    if not booking_id:
        return {"ok": False, "message": "booking_id required"}
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        return {"ok": False, "message": "Booking not found"}
    allowed = user_id in {
        str(booking.get("passenger_id") or ""),
        str(booking.get("driver_id") or ""),
    } or role == UserRole.ADMIN.value
    if not allowed:
        return {"ok": False, "message": "Not allowed"}
    await emit_ride_sync_state(booking_id, to_sid=sid)
    return {"ok": True}


@sio.event
async def request_ride_sync(sid, data):
    """Compatibility alias for enterprise clients."""
    return await ride_sync_request(sid, data)

# Helper function to emit events from API endpoints
async def emit_to_user(user_id: str, event: str, data: dict):
    """Emit event to a specific user if they're connected"""
    normalized_user_id = str(user_id or "").strip()
    if not normalized_user_id:
        return
    await sio.emit(event, data, room=user_room(normalized_user_id))

async def emit_new_booking_to_drivers(
    booking_id: Optional[str] = None,
    target_driver_ids: Optional[List[str]] = None,
    include_unavailable: bool = False,
):
    """Notify drivers about new booking (optionally targeted)."""
    query: Dict[str, Any] = {}
    if not include_unavailable:
        query["is_available"] = True
    if target_driver_ids:
        query["user_id"] = {"$in": list(set(target_driver_ids))}
    available_drivers = await db.drivers.find(query).to_list(150)
    passenger_id = None
    blocked_driver_ids: set = set()
    women_only_required = False
    if booking_id:
        booking = await db.bookings.find_one({"id": booking_id})
        passenger_id = booking.get("passenger_id") if booking else None
        women_only_required = bool((booking or {}).get("women_only_required"))
        if passenger_id:
            blocked_driver_ids = set(await get_excluded_driver_ids_for_passenger(passenger_id))
    female_driver_ids: set = set()
    if women_only_required and available_drivers:
        driver_ids = [str(item.get("user_id") or "").strip() for item in available_drivers if item.get("user_id")]
        female_rows = await db.users.find(
            {"id": {"$in": driver_ids}, "role": UserRole.DRIVER, "gender": "female"},
            {"_id": 0, "id": 1},
        ).to_list(None)
        female_driver_ids = {str(item.get("id") or "").strip() for item in female_rows if item.get("id")}
    for driver in available_drivers:
        if blocked_driver_ids and driver.get("user_id") in blocked_driver_ids:
            continue
        driver_id = str(driver.get("user_id") or "").strip()
        if not driver_id:
            continue
        if women_only_required and driver_id not in female_driver_ids:
            continue
        await sio.emit(
            'new_booking_available',
            {
                'message': 'New ride request available',
                'booking_id': booking_id,
                'timestamp': get_ist_now().isoformat()
            },
            room=user_room(driver_id),
        )


async def ride_dispatch_worker():
    while True:
        try:
            booking_id = await dequeue_next_ride()
            if not booking_id:
                await asyncio.sleep(2)
                continue

            booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
            if not booking or booking.get("status") != BookingStatus.PENDING:
                await remove_ride_from_queue(booking_id)
                continue

            if booking.get("driver_id"):
                await remove_ride_from_queue(booking_id)
                continue

            if booking.get("candidate_driver_ids"):
                # Already has candidate drivers selected by request-time dispatch.
                await remove_ride_from_queue(booking_id)
                continue

            attempts = await increment_ride_queue_attempts(booking_id)
            drivers = await find_nearest_drivers_mongo_geo(
                booking.get("pickup_location") or {},
                limit=5,
                max_distance_km=8,
            )
            candidate_driver_ids = [str(item.get("user_id") or "").strip() for item in drivers if item.get("user_id")]
            if bool(booking.get("women_only_required")) and candidate_driver_ids:
                female_rows = await db.users.find(
                    {"id": {"$in": candidate_driver_ids}, "role": UserRole.DRIVER, "gender": "female"},
                    {"_id": 0, "id": 1},
                ).to_list(None)
                female_ids = {str(item.get("id") or "").strip() for item in female_rows if item.get("id")}
                candidate_driver_ids = [driver_id for driver_id in candidate_driver_ids if driver_id in female_ids]
            if not candidate_driver_ids:
                if attempts < RIDE_QUEUE_MAX_ATTEMPTS:
                    retry_delay = min(60, RIDE_QUEUE_RETRY_BASE_SECONDS * max(1, attempts))
                    await enqueue_ride(booking_id, priority=retry_delay)
                else:
                    await db.bookings.update_one(
                        {"id": booking_id},
                        {
                            "$set": {
                                "dispatch_status": "no_drivers_available",
                                "dispatch_attempt_count": int(attempts),
                                "updated_at": get_ist_now(),
                            }
                        },
                    )
                await write_analytics_event(
                    "DISPATCH_RETRY",
                    str(booking.get("passenger_id") or ""),
                    {
                        "booking_id": booking_id,
                        "attempts": int(attempts),
                        "has_candidates": False,
                    },
                )
                continue

            await db.bookings.update_one(
                {"id": booking_id},
                {
                    "$set": {
                        "candidate_driver_ids": candidate_driver_ids,
                        "dispatch_status": "queued_dispatched",
                        "dispatch_attempt_count": int(attempts),
                        "updated_at": get_ist_now(),
                    }
                },
            )
            await write_analytics_event(
                "DISPATCH_MATCH_FOUND",
                str(booking.get("passenger_id") or ""),
                {
                    "booking_id": booking_id,
                    "attempts": int(attempts),
                    "candidate_count": len(candidate_driver_ids),
                },
            )
            await clear_driver_pending_request_cache(candidate_driver_ids)
            await emit_new_booking_to_drivers(
                booking_id=booking_id,
                target_driver_ids=candidate_driver_ids,
                include_unavailable=False,
            )
            await remove_ride_from_queue(booking_id)
        except Exception as exc:
            logger.exception("ride_dispatch_worker failed: %s", exc)

        await asyncio.sleep(1)

async def analytics_warehouse_worker():
    while True:
        try:
            if not redis_client:
                await asyncio.sleep(ANALYTICS_WORKER_SLEEP_SECONDS)
                continue

            batch: List[Dict[str, Any]] = []
            for _ in range(ANALYTICS_QUEUE_BATCH_SIZE):
                raw = await redis_client.lpop(ANALYTICS_QUEUE_KEY)
                if not raw:
                    break
                try:
                    payload = json.loads(raw)
                    if isinstance(payload, dict):
                        batch.append(payload)
                except Exception:
                    continue

            if not batch:
                await asyncio.sleep(ANALYTICS_WORKER_SLEEP_SECONDS)
                continue

            for event in batch:
                try:
                    await persist_analytics_event(event)
                except Exception:
                    logger.exception("analytics_warehouse_worker failed persisting event")
                    try:
                        await redis_client.rpush(ANALYTICS_QUEUE_KEY, json.dumps(event, default=str))
                    except Exception:
                        logger.exception("analytics_warehouse_worker failed to requeue event")
        except Exception as exc:
            logger.exception("analytics_warehouse_worker loop failed: %s", exc)
            await asyncio.sleep(ANALYTICS_WORKER_SLEEP_SECONDS)

async def driver_health_monitor():
    while True:
        try:
            now = get_ist_now()
            offline_cutoff = now - timedelta(seconds=REALTIME_OFFLINE_SECONDS)
            stale_driver_ids = await runtime_state.list_stale_driver_ids(offline_cutoff)
            for driver_id in stale_driver_ids:
                await runtime_state.mark_driver_offline(driver_id)
                await remove_driver_geo_index(driver_id)
                await db.drivers.update_one(
                    {"user_id": driver_id},
                    {"$set": {"is_online": False, "is_available": False, "last_offline_at": now}},
                )

                booking_id = await runtime_state.get_driver_active_booking(driver_id)
                if not booking_id:
                    continue

                await emit_driver_connection_state(
                    booking_id=booking_id,
                    driver_id=driver_id,
                    online=False,
                    message="Driver network is weak/offline.",
                )

        except Exception as exc:
            logger.exception("driver_health_monitor failed: %s", exc)
        await asyncio.sleep(REALTIME_HEALTH_MONITOR_INTERVAL_SECONDS)

# Add security headers middleware for OAuth popup support
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    try:
        response = await call_next(request)
    except RequestValidationError as exc:
        response = build_error_response(
            request,
            status_code=422,
            message="Request validation failed.",
            code="validation_error",
            details=exc.errors(),
        )
    except HTTPException as exc:
        message = exc.detail if isinstance(exc.detail, str) else "Request failed."
        response = build_error_response(
            request,
            status_code=exc.status_code,
            message=str(message),
            code="http_error",
            details=exc.detail if not isinstance(exc.detail, str) else None,
        )
    except (ServerSelectionTimeoutError, PyMongoError):
        logger.exception("Database connectivity error while processing request", exc_info=True)
        if HTTP_EXCEPTION_COUNT is not None:
            HTTP_EXCEPTION_COUNT.labels(exception_type="database_error", path=get_route_template(request)).inc()
        response = build_error_response(
            request,
            status_code=503,
            message="Database temporarily unavailable. Please retry.",
            code="database_unavailable",
        )
    except Exception:
        logger.exception("Unhandled server error while processing request", exc_info=True)
        if HTTP_EXCEPTION_COUNT is not None:
            HTTP_EXCEPTION_COUNT.labels(exception_type="unhandled_error", path=get_route_template(request)).inc()
        response = build_error_response(
            request,
            status_code=500,
            message="Internal server error",
            code="internal_error",
        )
    response.headers["Cross-Origin-Opener-Policy"] = "same-origin-allow-popups"
    response.headers["Cross-Origin-Embedder-Policy"] = "require-corp"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Cross-Origin-Resource-Policy"] = "same-site"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(self)"
    response.headers["X-XSS-Protection"] = "0"
    if request.url.path.startswith("/api"):
        response.headers["Content-Security-Policy"] = "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    if IS_PRODUCTION_ENV:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    # Ensure CORS response headers are set in a strict, explicit way.
    origin = request.headers.get("origin")
    try:
        if origin:
            if is_origin_allowed(origin):
                response.headers["Access-Control-Allow-Origin"] = origin
            elif not IS_PRODUCTION_ENV:
                response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, X-Requested-With, Cache-Control, Pragma"
        response.headers["Access-Control-Allow-Credentials"] = "false"
        response.headers["Vary"] = "Origin"
    except Exception:
        pass
    return response

# Add CORS middleware early so it wraps mounted apps
cors_origins = ALLOWED_ORIGINS if ALLOWED_ORIGINS else ([] if IS_PRODUCTION_ENV else ["*"])
if "*" in cors_origins:
    cors_origins = ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=cors_origins,
    allow_origin_regex=EFFECTIVE_CORS_ALLOW_ORIGIN_REGEX or None,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global OPTIONS handler to ensure preflight requests get CORS headers even
# if other route dependencies would reject them.
@app.options("/{full_path:path}")
async def global_options_handler(full_path: str, request: Request):
    origin = request.headers.get("origin")
    allow_origin_value = None
    if origin and is_origin_allowed(origin):
        allow_origin_value = origin
    elif not IS_PRODUCTION_ENV:
        allow_origin_value = "*"

    if not allow_origin_value:
        return JSONResponse(status_code=403, content={"detail": "Origin not allowed"})

    headers = {
        "Access-Control-Allow-Origin": allow_origin_value,
        "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": request.headers.get("access-control-request-headers", "Authorization, Content-Type"),
        "Access-Control-Allow-Credentials": "false",
        "Vary": "Origin",
    }
    return JSONResponse(status_code=200, content={"ok": True}, headers=headers)

# Include the router in the main app and mount socket.io under /ws
app.include_router(modular_auth_router)
app.include_router(modular_analytics_router)
app.include_router(modular_driver_trust_router)
app.include_router(modular_ride_products_router)
app.include_router(modular_revenue_router)
app.include_router(modular_security_router)
app.include_router(modular_safety_router)
app.include_router(modular_features_router)
app.include_router(modular_notifications_router)
app.include_router(modular_tier1_router)
app.include_router(modular_tier2_router)
app.include_router(modular_tier3_router)
app.include_router(modular_health_router)
app.include_router(modular_scheduled_rides_router)
app.include_router(modular_vehicles_router)
app.include_router(modular_vehicle_types_router)
app.include_router(modular_vehicle_types_extended_router)
app.include_router(modular_vehicles_canonical_router)
app.include_router(modular_ride_types_router)
app.include_router(modular_bookings_extended_router)
app.include_router(modular_coverage_admin_router)
app.include_router(modular_support_tickets_router)
app.include_router(modular_uploads_router)
app.include_router(modular_admin_account_deletions_router)
app.include_router(modular_admin_audit_compliance_router)
app.include_router(modular_admin_dispute_management_router)
app.include_router(modular_admin_driver_management_router)
app.include_router(modular_admin_financial_management_router)
app.include_router(modular_admin_kyc_enhanced_router)
app.include_router(modular_admin_launch_visitors_router)
app.include_router(modular_admin_passenger_management_router)
app.include_router(modular_admin_phone_requests_router)
app.include_router(modular_admin_promotions_marketing_router)
app.include_router(modular_admin_reports_analytics_router)
app.include_router(modular_admin_safety_compliance_router)
app.include_router(modular_admin_subscriptions_enhanced_router)
app.include_router(modular_admin_support_management_router)
app.include_router(modular_admin_system_config_router)
app.include_router(modular_admin_trip_management_router)
app.include_router(modular_admin_wallet_topups_router)
app.include_router(modular_admin_document_requirements_router)
app.include_router(modular_driver_documents_router)
app.include_router(modular_passenger_documents_router)
app.include_router(modular_admin_fare_management_router)
app.include_router(modular_driver_fare_override_router)
app.include_router(modular_driver_fare_proposals_router)
app.include_router(modular_admin_fare_proposals_router)
app.include_router(modular_fleet_advanced_router)
app.include_router(modular_operations_center_router)
app.include_router(modular_corporate_portal_router)
app.include_router(modular_airport_router)
app.include_router(modular_heatmaps_router)
app.include_router(modular_profitability_router)
app.include_router(modular_rate_limit_config_router)
app.include_router(api_router)
app.mount("/ws", socket_app)

@app.on_event("shutdown")
async def shutdown_db_client():
    global driver_health_monitor_task, ride_dispatch_worker_task, analytics_warehouse_worker_task
    if driver_health_monitor_task and not driver_health_monitor_task.done():
        driver_health_monitor_task.cancel()
    driver_health_monitor_task = None
    if ride_dispatch_worker_task and not ride_dispatch_worker_task.done():
        ride_dispatch_worker_task.cancel()
    ride_dispatch_worker_task = None
    if analytics_warehouse_worker_task and not analytics_warehouse_worker_task.done():
        analytics_warehouse_worker_task.cancel()
    analytics_warehouse_worker_task = None
    await runtime_state.close()
    if redis_client:
        try:
            await redis_client.close()
        except Exception:
            pass
    client.close()
