from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request, Response, UploadFile, File, Form, Query
from fastapi.exceptions import RequestValidationError
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import JSONResponse, FileResponse, PlainTextResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import httpx
import os
import logging
import json
import time
import copy
import faulthandler
import sys
import traceback
import hashlib
import secrets
import contextvars
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict, field_validator, model_validator
from typing import List, Optional, Dict, Any, Literal
import uuid
from datetime import datetime, timedelta, timezone
from app.utils.time_helpers import get_ist_now
import bcrypt
import jwt
from enum import Enum
import math
import socketio
import asyncio
from motor.motor_asyncio import AsyncIOMotorDatabase
import stripe
from urllib.parse import quote_plus
import random
import re
import fnmatch
from collections import defaultdict
from urllib.parse import urlparse, parse_qs
from cryptography.fernet import Fernet
from pymongo.errors import ServerSelectionTimeoutError, PyMongoError
from bson import ObjectId
from bson.binary import Binary
from bson.errors import InvalidId
from app.core.config import get_settings
from app.bootstrap import (
    configure_socket_event_handlers,
    initialize_default_catalogs,
    register_modular_routers,
)
from app.routers.user_mode import router as user_mode_router
from app.routers.premium_ui import router as premium_ui_router
from app.routers.ai_visibility import router as ai_visibility_router
from app.routers.places import router as places_router
from app.routers.guardian_ai import router as guardian_ai_router
from app.routers.ai_destination_predictor import router as ai_predictor_router
from app.routers.smart_intent_booking import router as smart_intent_router
from app.services.feature_service import bootstrap_features
from app.db.retry import retry_on_db_error
from app.db.client import create_mongo_client, create_database
from app.database import SessionLocal, get_db
from app.routers.driver_documents import get_driver_document_status
from app.services.email_delivery import send_otp_email_message
from app.models.canonical_vehicle_model import CANONICAL_VEHICLES_COLLECTION, get_vehicle_by_id, get_vehicle_multiplier
from app.models.document_catalog import (
    document_mandatory_pause_active,
    effective_is_mandatory,
    ensure_default_document_requirements,
)
from app.models.ride_type_compatibility import is_vehicle_compatible_with_ride_type
from app.models.rental import calculate_rental_final_fare, rental_driver_eligibility
from app.models.tourism import tourism_driver_eligibility
from app.models.women_only import women_only_driver_eligibility
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
from app.utils.rate_limiting import (
    DRIVER_REALTIME_ENDPOINT_PATHS,
    PASSENGER_REALTIME_ENDPOINT_PATHS,
    ensure_rate_limit_defaults,
    get_rate_limit_key,
    get_rate_limit_profile_rule,
    get_rate_limit_rule_for_path,
    is_login_rate_limit_exempt_path,
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
DEBUG_STACK_DUMP_INTERVAL_SECONDS = max(
    0.0,
    float(os.environ.get("DEBUG_STACK_DUMP_INTERVAL_SECONDS", "0") or 0),
)
DEBUG_ASYNC_TASK_DUMP_INTERVAL_SECONDS = max(
    0.0,
    float(os.environ.get("DEBUG_ASYNC_TASK_DUMP_INTERVAL_SECONDS", "0") or 0),
)
if DEBUG_STACK_DUMP_INTERVAL_SECONDS > 0:
    try:
        faulthandler.dump_traceback_later(DEBUG_STACK_DUMP_INTERVAL_SECONDS, repeat=True)
    except Exception:
        pass
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

# PostgreSQL connection is handled by SQLAlchemy through app.database
# MongoDB client no longer used - migrated to PostgreSQL

# JWT Configuration
JWT_SECRET = settings.jwt_secret
JWT_REFRESH_SECRET = settings.jwt_refresh_secret or ""
JWT_REFRESH_SECRET_CONFIGURED = bool(settings.jwt_refresh_secret)
JWT_ALGORITHM = settings.jwt_algorithm
JWT_EXPIRATION_HOURS = settings.jwt_expiration_hours
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.environ.get("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.environ.get("REFRESH_TOKEN_EXPIRE_DAYS", "3650"))
DEFAULT_CITY_SPEED_KMPH = float(os.environ.get("DEFAULT_CITY_SPEED_KMPH", "22"))
AUTO_ASSIGN_MAX_RADIUS_KM = float(os.environ.get("AUTO_ASSIGN_MAX_RADIUS_KM", "7"))
OSRM_BASE_URL = os.environ.get("OSRM_BASE_URL", "https://router.project-osrm.org")
ENABLE_OSRM_ROUTING = os.environ.get("ENABLE_OSRM_ROUTING", "false").strip().lower() in {"1", "true", "yes", "on"}
OSRM_TIMEOUT_SECONDS = max(0.25, min(4.0, float(os.environ.get("OSRM_TIMEOUT_SECONDS", "1.0"))))
ROUTE_METRICS_CACHE_SECONDS = max(0, int(os.environ.get("ROUTE_METRICS_CACHE_SECONDS", "30")))
ROUTE_METRICS_CACHE_MAX = max(0, int(os.environ.get("ROUTE_METRICS_CACHE_MAX", "2000")))
LOCAL_CACHE_MAX_ITEMS = max(100, int(os.environ.get("LOCAL_CACHE_MAX_ITEMS", "5000")))
AUTH_USER_CACHE_TTL_SECONDS = max(0, int(os.environ.get("AUTH_USER_CACHE_TTL_SECONDS", "10")))
AUTH_USER_CACHE_MAX_ITEMS = max(100, int(os.environ.get("AUTH_USER_CACHE_MAX_ITEMS", "20000")))
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
PASSENGER_KYC_REQUIRED_FOR_BOOKING = (
    os.environ.get("PASSENGER_KYC_REQUIRED_FOR_BOOKING", "false").strip().lower()
    not in {"0", "false", "no", "off"}
)
GOOGLE_OAUTH_CLIENT_ID = os.environ.get(
    "GOOGLE_OAUTH_CLIENT_ID",
    os.environ.get(
        "GOOGLE_CLIENT_ID",
        os.environ.get(
            "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
            os.environ.get("EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID", ""),
        ),
    ),
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
DEFAULT_WAITING_CHARGE_PER_MINUTE = float(os.environ.get("DEFAULT_WAITING_CHARGE_PER_MINUTE", "2.0"))
DRIVER_LIVE_LOCATION_TTL_SECONDS = int(os.environ.get("DRIVER_LIVE_LOCATION_TTL_SECONDS", "300"))
ANALYTICS_DB_NAME = os.environ.get("ANALYTICS_DB_NAME", f"{settings.db_name}_analytics").strip() or f"{settings.db_name}_analytics"
REDIS_URL_RAW = os.environ.get("REDIS_URL", "")
REDIS_URL, REDIS_URL_INVALID = _normalize_redis_url(REDIS_URL_RAW)
REDIS_KEY_PREFIX = os.environ.get("REDIS_KEY_PREFIX", "autobuddy").strip()
REDIS_MAX_CONNECTIONS = max(2, min(50, int(os.environ.get("REDIS_MAX_CONNECTIONS", "8"))))
REDIS_RUNTIME_MAX_CONNECTIONS = max(
    2,
    min(50, int(os.environ.get("REDIS_RUNTIME_MAX_CONNECTIONS", "6"))),
)
REDIS_SOCKET_TIMEOUT_SECONDS = max(0.25, float(os.environ.get("REDIS_SOCKET_TIMEOUT_SECONDS", "2.0")))
REDIS_RUNTIME_DEGRADE_SECONDS = max(5, int(os.environ.get("REDIS_RUNTIME_DEGRADE_SECONDS", "60")))
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
DRIVER_ACCEPTING_BACKGROUND_SECONDS = max(
    DRIVER_LIVE_LOCATION_TTL_SECONDS,
    REALTIME_OFFLINE_SECONDS * 4,
    int(os.environ.get("DRIVER_ACCEPTING_BACKGROUND_SECONDS", str(4 * 60 * 60))),
)
DRIVER_LOCATION_BACKGROUND_PERSIST = (
    os.environ.get("DRIVER_LOCATION_BACKGROUND_PERSIST", "true").strip().lower()
    in {"1", "true", "yes", "on"}
)
DRIVER_LOCATION_PERSIST_MIN_INTERVAL_SECONDS = max(
    0.0,
    float(os.environ.get("DRIVER_LOCATION_PERSIST_MIN_INTERVAL_SECONDS", "2.0")),
)
DRIVER_LOCATION_PERSIST_MAX_CONCURRENCY = max(
    1,
    min(64, int(os.environ.get("DRIVER_LOCATION_PERSIST_MAX_CONCURRENCY", "16"))),
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
# Enable regex-based origin validation in all environments to support wildcard domain patterns.
# The regex itself is strictly controlled via environment config, so this is safe.
EFFECTIVE_CORS_ALLOW_ORIGIN_REGEX = CORS_ALLOW_ORIGIN_REGEX
SENTRY_DSN = os.environ.get("SENTRY_DSN", "").strip()
SENTRY_TRACE_SAMPLE_RATE = float(os.environ.get("SENTRY_TRACE_SAMPLE_RATE", "0.1"))
ENABLE_METRICS = os.environ.get("ENABLE_METRICS", "true").strip().lower() in {"1", "true", "yes", "on"}
REQUEST_ID_HEADER = "X-Request-ID"
READINESS_DB_PING_TIMEOUT_MS = max(
    200,
    min(10000, int(os.environ.get("READINESS_DB_PING_TIMEOUT_MS", "1500"))),
)
DRIVER_DASHBOARD_REQUEST_TIMEOUT_SECONDS = max(
    2.0,
    min(30.0, float(os.environ.get("DRIVER_DASHBOARD_REQUEST_TIMEOUT_SECONDS", "12"))),
)
FAST_PROBE_PATHS = {"/", "/health", "/api/health", "/ready", "/api/ready"}
DRIVER_DASHBOARD_TIMEOUT_PATHS = {
    "/api/drivers/active-ride",
    "/api/drivers/availability",
    "/api/drivers/blocked-passengers",
    "/api/drivers/earnings",
    "/api/drivers/fare-calculator",
    "/api/drivers/menu-badges",
    "/api/drivers/pending-requests",
    "/api/drivers/profile",
    "/api/drivers/readiness",
    "/api/drivers/upcoming-rides",
    "/api/pricing/rules",
    "/api/spin-win/config",
}
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
db = None
analytics_db = None
LOCAL_CACHE: Dict[str, tuple[float, Any]] = {}
AUTH_USER_CACHE: Dict[str, tuple[float, Dict[str, Any]]] = {}
DRIVER_LOCATION_PERSIST_LAST_AT: Dict[str, float] = {}
DRIVER_LOCATION_PERSIST_SEMAPHORE = asyncio.Semaphore(DRIVER_LOCATION_PERSIST_MAX_CONCURRENCY)
if REDIS_URL and redis_async:
    try:
        redis_client = redis_async.from_url(
            REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            max_connections=REDIS_MAX_CONNECTIONS,
            socket_connect_timeout=REDIS_SOCKET_TIMEOUT_SECONDS,
            socket_timeout=REDIS_SOCKET_TIMEOUT_SECONDS,
            retry_on_timeout=True,
            health_check_interval=30,
        )
    except Exception:
        # Defer user-facing warning to startup logger.
        redis_client = None
# Create the main app
app = FastAPI(title="AutoRickshaw Booking API")
app.state.settings = settings
app.state.redis_client = redis_client

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
        redis_max_connections=REDIS_RUNTIME_MAX_CONNECTIONS,
        redis_socket_timeout_seconds=REDIS_SOCKET_TIMEOUT_SECONDS,
        redis_degrade_seconds=REDIS_RUNTIME_DEGRADE_SECONDS,
    )
)
app.state.runtime_state = runtime_state

REALTIME_RATE_LIMIT_EXEMPT_PATH_PREFIXES = ("/socket.io", "/ws")
REALTIME_RATE_LIMIT_EXEMPT_PATHS = {
    str(path).rstrip("/").lower()
    for path in (
        *DRIVER_REALTIME_ENDPOINT_PATHS,
        *PASSENGER_REALTIME_ENDPOINT_PATHS,
    )
}


def is_realtime_rate_limit_exempt_path(path: str) -> bool:
    normalized = f"/{str(path or '').strip().lstrip('/')}".rstrip("/").lower()
    return normalized in REALTIME_RATE_LIMIT_EXEMPT_PATHS or any(
        normalized.startswith(prefix)
        for prefix in REALTIME_RATE_LIMIT_EXEMPT_PATH_PREFIXES
    )

# Socket.IO setup
socket_manager = None
if REDIS_URL and redis_async:
    try:
        socket_manager = socketio.AsyncRedisManager(REDIS_URL, channel=SOCKETIO_REDIS_CHANNEL)
    except Exception as exc:
        logging.getLogger("autobuddy.bootstrap").warning(
            "Socket.IO Redis manager init failed; continuing without Redis-backed socket manager: %s",
            exc,
        )
elif REDIS_URL:
    logging.getLogger("autobuddy.bootstrap").warning(
        "Socket.IO Redis manager disabled because the redis package is unavailable."
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
configure_socket_event_handlers(sio)
socket_app = socketio.ASGIApp(sio, socketio_path=None)
root_socket_app = socketio.ASGIApp(sio, socketio_path=None)

driver_health_monitor_task: Optional[asyncio.Task] = None
ride_dispatch_worker_task: Optional[asyncio.Task] = None
analytics_warehouse_worker_task: Optional[asyncio.Task] = None
debug_async_task_dump_task: Optional[asyncio.Task] = None


async def debug_asyncio_task_dump_worker() -> None:
    while True:
        await asyncio.sleep(DEBUG_ASYNC_TASK_DUMP_INTERVAL_SECONDS)
        try:
            current = asyncio.current_task()
            tasks = [task for task in asyncio.all_tasks() if task is not current]
            print(f"ASYNC_TASK_DUMP task_count={len(tasks)}", file=sys.stderr, flush=True)
            for task in tasks[:120]:
                print(
                    f"Task name={task.get_name()} state={getattr(task, '_state', '')} coro={task.get_coro()}",
                    file=sys.stderr,
                    flush=True,
                )
                for frame in task.get_stack(limit=8):
                    for line in traceback.format_stack(frame, limit=1):
                        print(line.rstrip(), file=sys.stderr, flush=True)
        except Exception as exc:
            print(f"ASYNC_TASK_DUMP failed: {exc}", file=sys.stderr, flush=True)

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
    
    # Check explicit allow-list first
    if ALLOWED_ORIGINS and "*" not in ALLOWED_ORIGINS:
        for allowed_origin in ALLOWED_ORIGINS:
            if allowed_origin and allowed_origin.lower().rstrip("/") == normalized_lower:
                logger.debug(f"Origin allowed by whitelist: {normalized_origin}")
                return True
    
    # Check regex pattern
    if EFFECTIVE_CORS_ALLOW_ORIGIN_REGEX:
        pattern_matches = re.match(EFFECTIVE_CORS_ALLOW_ORIGIN_REGEX, normalized_origin, flags=re.IGNORECASE) is not None
        if pattern_matches:
            logger.debug(f"Origin allowed by regex: {normalized_origin}")
        else:
            logger.debug(f"Origin blocked by regex: {normalized_origin}, pattern={EFFECTIVE_CORS_ALLOW_ORIGIN_REGEX}")
        return pattern_matches
    
    # Fallback to wildcard check
    is_allowed = "*" in ALLOWED_ORIGINS
    if is_allowed:
        logger.debug(f"Origin allowed by wildcard: {normalized_origin}")
    else:
        logger.debug(f"Origin rejected: {normalized_origin}, allowed_origins={ALLOWED_ORIGINS}, regex_enabled={bool(EFFECTIVE_CORS_ALLOW_ORIGIN_REGEX)}")
    return is_allowed


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
    if db is None:
        logger.warning("Skipping Mongo seed/index setup because primary database is unavailable.")
        return
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
            await db.document_uploads.create_index([("user_id", 1), ("document_type", 1)], unique=True)
            await db.document_uploads.create_index([("user_id", 1), ("uploaded_at", -1)])
        except OperationFailure:
            pass
        try:
            await db.document_requirements.create_index("document_type", unique=True)
            await db.document_requirements.create_index([("enabled", 1), ("applicable_to", 1)])
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
        if analytics_db is not None:
            await analytics_db.ride_events.create_index([("created_at", -1)])
        await db.launch_page_visits.create_index([("created_at", -1)])
        await db.launch_page_visits.create_index([("event_date", 1)])
        await db.launch_page_visits.create_index([("identity_key", 1), ("created_at", -1)])
        await db.launch_page_visits.create_index([("ip_address", 1), ("created_at", -1)])
        # Total Mobility Platform indexes
        try:
            await db.ride_types.create_index("active")
        except OperationFailure:
            pass
        try:
            await db.vehicle_types.create_index("active")
        except OperationFailure:
            pass
        try:
            await db.coverage_areas.create_index([("level", 1), ("active", 1)])
        except OperationFailure:
            pass
        try:
            await db.bookings.create_index([("vehicle_type_id", 1), ("created_at", -1)])
            await db.bookings.create_index([("ride_type", 1), ("created_at", -1)])
        except OperationFailure:
            pass
    except Exception as e:
        logger.exception("Seed error: %s", e)
        raise

async def run_startup_bootstrap() -> None:
    """Run deployment-critical database bootstrap before startup completes."""
    if db is None:
        raise RuntimeError("Cannot complete startup bootstrap because primary database is unavailable.")

    logger.info("Startup bootstrap started")
    try:
        # Initialize SQL feature database tables
        from app.db.database import init_db
        try:
            init_db()
            logger.info("Feature database tables initialized")
        except Exception as e:
            logger.warning(f"Feature database initialization failed (non-critical): {e}")
        
        await seed_admin()
        await initialize_default_catalogs(db)
        await ensure_rate_limit_defaults(db)

        from app.db.migration_fleet_advanced import create_fleet_advanced_indexes
        from app.db.migration_operations_center import create_operations_center_indexes
        from app.db.migration_corporate_portal import create_corporate_portal_indexes
        from app.db.migration_airport import create_airport_indexes
        from app.db.migration_heatmaps import create_heatmap_indexes
        from app.db.migration_fleet_profitability import create_fleet_profitability_indexes

        await create_fleet_advanced_indexes(db)
        await create_operations_center_indexes(db)
        await create_corporate_portal_indexes(db)
        await create_airport_indexes(db)
        await create_heatmap_indexes(db)
        await create_fleet_profitability_indexes(db)

        # Skip feature bootstrap if db is Motor (MongoDB)
        # Features will be registered on-demand during runtime
        try:
            bootstrap_features(db)
        except TypeError as e:
            if "MotorCollection object is not callable" in str(e):
                logger.warning("Skipping feature bootstrap - using MongoDB. Features will be registered on-demand.")
            else:
                raise

        referral_backfill = await backfill_referrals_for_existing_users(db)
        if referral_backfill.get("ran"):
            logger.info("Referral code backfill completed for %s users.", referral_backfill.get("processed", 0))
    except Exception:
        logger.exception("Startup bootstrap failed")
        raise

    logger.info("Startup bootstrap completed")


@app.on_event("startup")
async def on_startup():
    global driver_health_monitor_task, ride_dispatch_worker_task, analytics_warehouse_worker_task, debug_async_task_dump_task, redis_client, db, analytics_db
    if not settings.mongo_url:
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
    
    # Initialize MongoDB connection
    try:
        mongo_client = create_mongo_client(settings)
        db = create_database(mongo_client, settings)
        analytics_db = mongo_client[ANALYTICS_DB_NAME]
        app.state.db = db
        app.state.analytics_db = analytics_db
        app.state.mongo_client = mongo_client
        logger.info("MongoDB connection initialized")
    except Exception as exc:
        db = None
        analytics_db = None
        app.state.db = None
        app.state.analytics_db = None
        logger.exception("MongoDB initialization failed; startup cannot continue")
        raise RuntimeError("MongoDB initialization failed; deployment bootstrap cannot complete.") from exc

    await run_startup_bootstrap()
    
    # Initialize dependencies for critical routers
    try:
        import app.routers.dispatch_service as dispatch_service
        import app.routers.stripe_webhooks as stripe_webhooks
        import app.routers.ride_operations as ride_operations
        import app.routers.notifications_backend as notifications_backend
        import app.routers.calendar_booking as calendar_booking_router
        
        dispatch_service.set_dependencies(db, sio)
        stripe_webhooks.set_dependencies(db, sio)
        ride_operations.set_dependencies(db, sio)
        notifications_backend.set_dependencies(db, sio)
        
        # Initialize calendar booking service
        try:
            from app.services.calendar_booking_service import CalendarBookingService
            calendar_service = CalendarBookingService(db, ride_service=None)
            calendar_booking_router.set_dependencies(db, calendar_service)
            logging.getLogger("autobuddy.bootstrap").info("✓ Calendar booking service initialized")
        except Exception as exc:
            logging.getLogger("autobuddy.bootstrap").warning(f"Calendar booking service initialization failed: {exc}")
        
        import app.routers.driver_operations as driver_operations
        driver_operations.set_dependencies(db, sio)
        # Ensure driver availability module has runtime dependencies wired
        try:
            import app.routers.driver_availability_operations as driver_availability_operations
            logging.getLogger("autobuddy.bootstrap").info(f"Setting driver availability dependencies: db={db is not None}, sio={sio is not None}")
            driver_availability_operations.set_dependencies(db, sio)
            logging.getLogger("autobuddy.bootstrap").info("✓ Driver availability dependencies wired successfully")
        except Exception as exc:
            # Non-fatal: availability module may be unused in some deployments
            logging.getLogger("autobuddy.bootstrap").exception(
                f"Driver availability dependency wiring failed (will cause 503 on toggle): {exc}",
            )

        import app.routers.support_backend as support_backend
        support_backend.set_dependencies(db, sio)
        
        import app.routers.lost_items_backend as lost_items_backend
        import app.routers.ride_pooling_backend as ride_pooling_backend
        import app.routers.promo_codes_backend as promo_codes_backend
        import app.routers.accessibility_backend as accessibility_backend
        
        lost_items_backend.set_dependencies(db, sio)
        ride_pooling_backend.set_dependencies(db, sio)
        promo_codes_backend.set_dependencies(db, sio)
        accessibility_backend.set_dependencies(db, sio)
    except Exception as e:
        logger.exception("Failed to initialize critical router dependencies: %s", e)
    
    if driver_health_monitor_task is None or driver_health_monitor_task.done():
        driver_health_monitor_task = asyncio.create_task(driver_health_monitor())
    if ride_dispatch_worker_task is None or ride_dispatch_worker_task.done():
        ride_dispatch_worker_task = asyncio.create_task(ride_dispatch_worker())
    if analytics_warehouse_worker_task is None or analytics_warehouse_worker_task.done():
        analytics_warehouse_worker_task = asyncio.create_task(analytics_warehouse_worker())
    if (
        DEBUG_ASYNC_TASK_DUMP_INTERVAL_SECONDS > 0
        and (debug_async_task_dump_task is None or debug_async_task_dump_task.done())
    ):
        debug_async_task_dump_task = asyncio.create_task(debug_asyncio_task_dump_worker())

@app.middleware("http")
async def api_guardrails_middleware(request: Request, call_next):
    inbound_request_id = str(request.headers.get(REQUEST_ID_HEADER) or "").strip()
    request_id = inbound_request_id if inbound_request_id else str(uuid.uuid4())
    request.state.request_id = request_id
    token = REQUEST_ID_CONTEXT.set(request_id)
    start_time = time.perf_counter()
    client_ip = get_request_ip(request)
    request_path = request.url.path
    rate_limit_subject = get_rate_limit_key(request)
    path_template = request_path
    is_realtime_path = is_realtime_rate_limit_exempt_path(request_path)
    is_login_rate_limit_exempt = is_login_rate_limit_exempt_path(request_path)
    status_code = 500
    response: Optional[Any] = None
    try:
        if request.method == "HEAD" and request_path in FAST_PROBE_PATHS:
            response = Response(status_code=204)
            status_code = int(response.status_code)
            return response

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

        if not is_realtime_path and not is_login_rate_limit_exempt and request_path not in {"/api/health", "/health"}:
            rate_limit_rule = await get_rate_limit_rule_for_path(request_path, db)
            try:
                if rate_limit_rule:
                    await runtime_state.check_bucket_rate_limit(
                        bucket_name=rate_limit_rule.bucket_name,
                        ip_address=rate_limit_subject,
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
                        "subject": rate_limit_subject,
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

        if (
            not is_realtime_path
            and not is_login_rate_limit_exempt
            and request_path.startswith("/api")
            and request_path != "/api/health"
        ):
            api_global_rule = await get_rate_limit_profile_rule(
                "api_global",
                db,
                bucket_name="profile:api_global",
            )
            try:
                if api_global_rule:
                    await runtime_state.check_bucket_rate_limit(
                        bucket_name=api_global_rule.bucket_name,
                        ip_address=rate_limit_subject,
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
        try:
            if request.method == "GET" and request_path in DRIVER_DASHBOARD_TIMEOUT_PATHS:
                response = await asyncio.wait_for(
                    call_next(request),
                    timeout=DRIVER_DASHBOARD_REQUEST_TIMEOUT_SECONDS,
                )
            else:
                response = await call_next(request)
        except asyncio.TimeoutError:
            logger.warning(
                "Driver dashboard request timed out",
                extra={
                    "extra_data": {
                        "method": request.method,
                        "path": request_path,
                        "timeout_seconds": DRIVER_DASHBOARD_REQUEST_TIMEOUT_SECONDS,
                        "client_ip": client_ip,
                    }
                },
            )
            response = build_error_response(
                request,
                status_code=504,
                message="Driver dashboard is still warming up. Please retry.",
                code="driver_dashboard_timeout",
                details={"timeout_seconds": DRIVER_DASHBOARD_REQUEST_TIMEOUT_SECONDS},
            )
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
    OPERATOR = "operator"
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
    document_type: str = Field(min_length=2, max_length=40)
    document_number: str = Field(min_length=4, max_length=40)

    @field_validator("document_type", mode="before")
    @classmethod
    def normalize_document_type(cls, value: Any) -> str:
        normalized = re.sub(r"[^a-z0-9]+", "_", str(value or "").strip().lower()).strip("_")
        aliases = {
            "aadhaar": "aadhar",
            "aadhaar_card": "aadhar",
            "aadhar_card": "aadhar",
            "national_id": "aadhar",
            "id_proof": "aadhar",
            "pan_card": "pan",
            "pan_id": "pan",
            "driver_license": "license",
            "drivers_license": "license",
            "driving_license": "license",
            "licence": "license",
            "driving_licence": "license",
        }
        mapped = aliases.get(normalized, normalized)
        if mapped not in {"aadhar", "pan", "license", "passport"}:
            raise ValueError("document_type must be one of: aadhar, pan, license, passport")
        return mapped

    @field_validator("document_number", mode="before")
    @classmethod
    def normalize_document_number(cls, value: Any) -> str:
        return str(value or "").strip().upper()

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
    vehicle_type: Optional[str] = None
    vehicle_type_id: Optional[str] = None
    vehicle_subtype_id: Optional[str] = None
    accepted_ride_types: List[str] = Field(default_factory=list)

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

    @model_validator(mode="before")
    @classmethod
    def accept_flat_or_nested_location(cls, data):
        if not isinstance(data, dict):
            return data
        if isinstance(data.get("location"), dict):
            return data

        latitude = data.get("latitude", data.get("lat"))
        longitude = data.get("longitude", data.get("lng"))
        if latitude is None or longitude is None:
            return data

        location = {
            "latitude": latitude,
            "longitude": longitude,
        }
        address = str(data.get("address") or "").strip()
        if address:
            location["address"] = address
        return {"location": location}

class DriverTelemetryUpdate(BaseModel):
    latitude: float
    longitude: float
    speed: float = 0.0
    timestamp: Optional[int] = None

class DriverAvailabilityUpdate(BaseModel):
    is_available: bool
    vehicle_id: Optional[str] = Field(default=None, max_length=120)

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
    vehicle_type: Optional[str] = Field(default=None, min_length=2, max_length=40)
    vehicle_type_id: Optional[str] = Field(default=None, min_length=2, max_length=40)
    vehicle_subtype_id: Optional[str] = Field(default=None, max_length=80)
    accepted_ride_types: Optional[List[str]] = Field(default=None, max_length=20)

    @model_validator(mode="after")
    def normalize_canonical_vehicle_fields(self):
        vehicle_type_id = (self.vehicle_type_id or self.vehicle_type or "auto").strip()
        self.vehicle_type_id = vehicle_type_id
        self.vehicle_type = vehicle_type_id
        if self.vehicle_subtype_id is not None:
            self.vehicle_subtype_id = self.vehicle_subtype_id.strip() or None
        if self.accepted_ride_types is not None:
            accepted_ride_types = normalize_driver_accepted_ride_types(self.accepted_ride_types, default=[])
            if not accepted_ride_types:
                raise ValueError("Select at least one accepted ride type.")
            self.accepted_ride_types = accepted_ride_types
        return self

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
    waiting_charge_per_minute: float = Field(default=DEFAULT_WAITING_CHARGE_PER_MINUTE, ge=0.0)

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
    vehicle_type_id: Optional[str] = Field(default=None, max_length=50)
    vehicle_subtype_id: Optional[str] = Field(default=None, max_length=80)
    ride_type: Optional[str] = Field(default="normal", max_length=50)

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
    vehicle_type_id: Optional[str] = Field(default=None, max_length=50)
    vehicle_subtype_id: Optional[str] = Field(default=None, max_length=80)
    ride_type: Optional[str] = Field(default=None, max_length=50)

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
    waiting_charge_per_minute: float = Field(default=DEFAULT_WAITING_CHARGE_PER_MINUTE, ge=0.0)
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
    operator_registration_fee: float = Field(default=0.0, ge=0.0)
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
    operator: RoleSubscriptionConfig = Field(default_factory=RoleSubscriptionConfig)
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


def build_emergency_contact_document(payload: Any, user_id: str) -> Dict[str, Any]:
    source = payload.model_dump() if isinstance(payload, BaseModel) else dict(payload or {})
    name = str(source.get("contact_name") or source.get("name") or "").strip()
    phone = str(source.get("phone_number") or source.get("phone") or "").strip()
    relation = str(
        source.get("relation") or source.get("relationship") or source.get("emergency_contact_relationship") or ""
    ).strip()

    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Contact name is required")

    normalized_phone = normalize_phone(phone)
    now = get_ist_now()
    contact_id = str(source.get("id") or uuid.uuid4()).strip()

    return {
        "id": contact_id,
        "user_id": user_id,
        "name": name,
        "contact_name": name,
        "phone": normalized_phone,
        "phone_number": normalized_phone,
        "relation": relation or "Emergency contact",
        "relationship": relation or "Emergency contact",
        "notify_on_rides": bool(source.get("notify_on_rides", True)),
        "active": source.get("active", True) is not False,
        "created_at": now,
        "updated_at": now,
    }


def serialize_emergency_contact(row: Dict[str, Any]) -> Dict[str, Any]:
    contact_id = str(row.get("id") or row.get("_id") or "")
    name = str(row.get("contact_name") or row.get("name") or "").strip()
    phone = str(row.get("phone_number") or row.get("phone") or "").strip()
    relation = str(row.get("relation") or row.get("relationship") or "Emergency contact").strip()
    created_at = row.get("created_at")
    updated_at = row.get("updated_at")
    deleted_at = row.get("deleted_at")

    if isinstance(created_at, datetime):
        created_at = created_at.isoformat()
    if isinstance(updated_at, datetime):
        updated_at = updated_at.isoformat()
    if isinstance(deleted_at, datetime):
        deleted_at = deleted_at.isoformat()

    return {
        "_id": str(row.get("_id")) if row.get("_id") is not None else None,
        "id": contact_id,
        "name": name,
        "contact_name": name,
        "phone": phone,
        "phone_number": phone,
        "relation": relation,
        "relationship": relation,
        "notify_on_rides": bool(row.get("notify_on_rides", True)),
        "active": row.get("active", True) is not False,
        "created_at": created_at,
        "updated_at": updated_at,
        "deleted_at": deleted_at,
    }


def emergency_contact_owner_query(user_id: str, contact_id: str) -> Dict[str, Any]:
    normalized_id = str(contact_id or "").strip()
    clauses = [{"user_id": user_id, "id": normalized_id}]
    try:
        clauses.append({"user_id": user_id, "_id": ObjectId(normalized_id)})
    except InvalidId:
        pass
    return {"$or": clauses}

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
    role = str(getattr(value, "value", value) or "").strip().lower()
    if "." in role:
        role = role.split(".")[-1]
    if role == "user":
        role = UserRole.PASSENGER.value
    if role in {UserRole.PASSENGER.value, UserRole.DRIVER.value, UserRole.OPERATOR.value, UserRole.ADMIN.value}:
        return role
    return None


def _role_query(*values: Any) -> Dict[str, Any]:
    variants = set()
    for value in values:
        raw = str(getattr(value, "value", value) or "").strip()
        normalized = _normalize_role_text(value)
        for candidate in {raw, normalized or ""}:
            candidate = str(candidate or "").strip()
            if not candidate:
                continue
            variants.update(
                {
                    candidate,
                    candidate.lower(),
                    candidate.upper(),
                    candidate.capitalize(),
                    f"UserRole.{candidate.upper()}",
                }
            )
    return {"$or": [{"role": {"$in": list(variants)}}, {"user_type": {"$in": list(variants)}}]}


def _enum_query_values(*values: Any) -> List[Any]:
    variants: List[Any] = []
    for value in values:
        if value not in variants:
            variants.append(value)
        raw = str(getattr(value, "value", value) or "").strip()
        enum_name = str(getattr(value, "name", "") or "").strip()
        enum_class = value.__class__.__name__ if enum_name else ""
        enum_variants = {
            f"{enum_class}.{enum_name}" if enum_class and enum_name else "",
            f"{enum_class}.{enum_name}".lower() if enum_class and enum_name else "",
            f"{enum_class}.{enum_name}".upper() if enum_class and enum_name else "",
        }
        for candidate in {raw, raw.lower(), raw.upper(), *enum_variants}:
            if candidate and candidate not in variants:
                variants.append(candidate)
    return variants


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

def user_id_from_record(user: Dict[str, Any]) -> str:
    user_id = str(user.get("id") or "").strip()
    if user_id:
        return user_id
    return str(user.get("_id") or "").strip()

async def ensure_user_record_id(user: Dict[str, Any]) -> str:
    user_id = user_id_from_record(user)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid account data. Please contact support.")
    if not str(user.get("id") or "").strip():
        selector = None
        if user.get("_id") is not None:
            selector = {"_id": user.get("_id")}
        elif user.get("email"):
            selector = {"email": user.get("email")}
        if selector:
            await db.users.update_one(selector, {"$set": {"id": user_id}})
        user["id"] = user_id
    return user_id

def auth_response_for_user(user: Dict[str, Any], refresh_token: Optional[str] = None) -> AuthResponse:
    user_id = user_id_from_record(user)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid account data. Please contact support.")
    role = _normalize_role_text(user.get("role")) or UserRole.PASSENGER.value
    gender = str(user.get("gender") or "").strip().lower()
    if "." in gender:
        gender = gender.split(".")[-1]
    if gender not in {"male", "female", "other"}:
        gender = None
    created_at = user.get("created_at")
    if not isinstance(created_at, datetime):
        created_at = get_ist_now()

    token = create_access_token_for_user(user_id, role)
    return AuthResponse(
        access_token=token,
        refresh_token=refresh_token,
        user=UserResponse(
            id=user_id,
            email=str(user.get("email") or ""),
            name=str(user.get("name") or "User"),
            phone=str(user.get("phone") or ""),
            role=role,
            gender=gender,
            referral_code=str(user.get("referral_code") or "").strip().upper() or None,
            created_at=created_at,
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

def build_default_operator_profile(user_id: str, user: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    source = user or {}
    return {
        "operator_id": user_id,
        "company_name": f"{str(source.get('name') or 'AutoBuddy').strip()} Fleet",
        "contact_name": str(source.get("name") or "").strip(),
        "contact_email": str(source.get("email") or "").strip().lower(),
        "contact_phone": str(source.get("phone") or "").strip(),
        "service_regions": ["all"],
        "verification_status": "pending",
        "active": True,
        "created_at": get_ist_now(),
        "updated_at": get_ist_now(),
    }

async def ensure_operator_profile(user_id: str, user: Optional[Dict[str, Any]] = None) -> None:
    await db.operator_profiles.update_one(
        {"operator_id": user_id},
        {"$setOnInsert": build_default_operator_profile(user_id, user)},
        upsert=True,
    )

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
    vehicle_type_id = str(vehicle.get("vehicle_type_id") or vehicle.get("vehicle_type") or "auto")
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
        "vehicle_type": vehicle_type_id,
        "vehicle_type_id": vehicle_type_id,
        "vehicle_subtype_id": vehicle.get("vehicle_subtype_id"),
        "vehicle_type_name": str(vehicle.get("vehicle_type_name") or vehicle_type_id.title()),
        "vehicle_subtype_name": vehicle.get("vehicle_subtype_name"),
        "vehicle_icon": vehicle.get("vehicle_icon"),
        "capacity_unit": str(vehicle.get("capacity_unit") or "passengers"),
        "accepted_ride_types": normalize_driver_accepted_ride_types(
            vehicle.get("accepted_ride_types"),
            default=list(DRIVER_ACCEPTED_RIDE_TYPE_KEYS),
        ),
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
        "vehicle_type": str(vehicle.get("vehicle_type") or vehicle.get("vehicle_type_id") or "auto"),
        "vehicle_type_id": str(vehicle.get("vehicle_type_id") or vehicle.get("vehicle_type") or "auto"),
        "vehicle_subtype_id": vehicle.get("vehicle_subtype_id"),
        "vehicle_type_name": vehicle.get("vehicle_type_name"),
        "vehicle_subtype_name": vehicle.get("vehicle_subtype_name"),
        "accepted_ride_types": normalize_driver_accepted_ride_types(
            vehicle.get("accepted_ride_types"),
            default=list(DRIVER_ACCEPTED_RIDE_TYPE_KEYS),
        ),
    }

async def resolve_driver_vehicle_catalog_selection(payload: DriverVehiclePayload) -> Dict[str, Any]:
    vehicle_type_id = payload.vehicle_type_id or payload.vehicle_type or "auto"
    catalog_lookup_failed = False
    try:
        vehicle = await db[CANONICAL_VEHICLES_COLLECTION].find_one({
            "vehicle_type_id": vehicle_type_id,
            "active": True,
        })
    except (ServerSelectionTimeoutError, PyMongoError) as exc:
        catalog_lookup_failed = True
        vehicle = None
        logger.warning("Canonical vehicle catalog lookup failed for %s: %s", vehicle_type_id, exc)

    if not vehicle and catalog_lookup_failed:
        vehicle = get_vehicle_by_id(vehicle_type_id)

    if not vehicle:
        if catalog_lookup_failed:
            raise HTTPException(status_code=503, detail="Vehicle catalog temporarily unavailable. Please retry.")
        raise HTTPException(status_code=400, detail=f"Invalid vehicle type: {vehicle_type_id}")

    subtype = None
    if payload.vehicle_subtype_id:
        subtype = next(
            (
                item
                for item in vehicle.get("subtypes", [])
                if item.get("id") == payload.vehicle_subtype_id
            ),
            None,
        )
        if not subtype:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid subtype {payload.vehicle_subtype_id} for vehicle type {vehicle_type_id}",
            )

    return {"vehicle": vehicle, "subtype": subtype}

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


async def resolve_driver_online_vehicle_for_availability(
    driver_id: str,
    requested_vehicle_id: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    vehicles = await db.driver_vehicles.find({"driver_id": driver_id}, {"_id": 0}).to_list(50)
    if not vehicles:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Add and verify a vehicle before going online.",
                "vehicles": [],
            },
        )

    requested_id = str(requested_vehicle_id or "").strip()
    selected_vehicle: Optional[Dict[str, Any]] = None
    if requested_id:
        selected_vehicle = next((vehicle for vehicle in vehicles if str(vehicle.get("id") or "") == requested_id), None)
        if not selected_vehicle:
            raise HTTPException(status_code=400, detail="Selected vehicle was not found.")
    elif len(vehicles) == 1:
        selected_vehicle = vehicles[0]
    else:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Select which vehicle will be online.",
                "vehicles": [build_driver_vehicle_response(vehicle) for vehicle in vehicles],
            },
        )

    if not is_driver_vehicle_ready(selected_vehicle):
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Selected vehicle must have vehicle number, model, color, type, and accepted ride types before going online.",
                "vehicle": build_driver_vehicle_response(selected_vehicle),
            },
        )

    now = get_ist_now()
    await db.driver_vehicles.update_many(
        {"driver_id": driver_id},
        {"$set": {"is_active": False, "updated_at": now}},
    )
    await db.driver_vehicles.update_one(
        {"driver_id": driver_id, "id": str(selected_vehicle.get("id") or "")},
        {"$set": {"is_active": True, "updated_at": now}},
    )
    refreshed = await db.driver_vehicles.find_one(
        {"driver_id": driver_id, "id": str(selected_vehicle.get("id") or "")},
        {"_id": 0},
    )
    return refreshed or selected_vehicle

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

def build_driver_availability_response(
    profile: Dict[str, Any],
    current_location: Optional[Dict[str, Any]] = None,
    location_online: Optional[bool] = None,
) -> Dict[str, Any]:
    is_available = bool((profile or {}).get("is_available", False))
    presence_online = bool((profile or {}).get("is_online", False))
    resolved_current_location = current_location if current_location is not None else (profile or {}).get("current_location")
    live_location_online = bool(location_online)
    is_online = is_available or presence_online or live_location_online
    availability_status = "online" if is_online else "offline"
    online_vehicle = (profile or {}).get("online_vehicle")
    online_vehicle_id = str(
        (profile or {}).get("online_vehicle_id")
        or (online_vehicle or {}).get("id")
        or ""
    ).strip() or None
    return {
        "is_available": is_available,
        # Dashboard compatibility: show a driver as online when either the
        # explicit availability toggle or live heartbeat/location presence is on.
        "is_online": is_online,
        "presence_online": presence_online,
        "location_online": live_location_online,
        "availability_status": availability_status,
        "online_status": availability_status,
        "current_location": resolved_current_location,
        "vehicle_info": (profile or {}).get("vehicle_info"),
        "online_vehicle_id": online_vehicle_id,
        "online_vehicle": online_vehicle,
    }

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
    response.update(build_driver_availability_response(profile, profile.get("current_location")))
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
    elif role == UserRole.OPERATOR:
        await ensure_operator_profile(user_id, user_dict)
    referral = await create_referral_if_missing(db, user_dict)
    user_dict["referral_code"] = referral.get("code")
    return user_dict

def _get_cached_auth_user(user_id: str) -> Optional[Dict[str, Any]]:
    if AUTH_USER_CACHE_TTL_SECONDS <= 0:
        return None
    cached = AUTH_USER_CACHE.get(user_id)
    now_monotonic = time.monotonic()
    if not cached:
        return None
    expires_at, user = cached
    if expires_at <= now_monotonic:
        AUTH_USER_CACHE.pop(user_id, None)
        return None
    return copy.deepcopy(user)


def _set_cached_auth_user(user_id: str, user: Dict[str, Any]) -> None:
    if AUTH_USER_CACHE_TTL_SECONDS <= 0 or not user_id:
        return
    if len(AUTH_USER_CACHE) >= AUTH_USER_CACHE_MAX_ITEMS:
        AUTH_USER_CACHE.clear()
    AUTH_USER_CACHE[user_id] = (
        time.monotonic() + AUTH_USER_CACHE_TTL_SECONDS,
        copy.deepcopy(user),
    )


def clear_auth_user_cache(user_id: Optional[str]) -> None:
    if user_id:
        AUTH_USER_CACHE.pop(str(user_id), None)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = decode_token(credentials.credentials)
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token")
    user_id = str(user_id)
    cached_user = _get_cached_auth_user(user_id)
    if cached_user is not None:
        return cached_user

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
    _set_cached_auth_user(user_id, user)
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

def normalized_enum_text(value: Any) -> str:
    text = str(value.value if isinstance(value, Enum) else value or "").strip().lower()
    if "." in text:
        text = text.rsplit(".", 1)[-1]
    return text.replace("-", "_").replace(" ", "_")

def booking_status_value(value: Any) -> str:
    return normalized_enum_text(value)

def booking_payment_satisfied(booking: Dict[str, Any]) -> bool:
    payment_status = normalized_enum_text(booking.get("payment_status"))
    payment_method = normalized_enum_text(booking.get("payment_method"))
    ride_status = booking_status_value(booking.get("status"))
    if payment_status in {
        PaymentOrderStatus.PAID.value,
        "paid",
        "completed",
        "verified",
        "cash_collected",
    }:
        return True
    return payment_method == PaymentMethod.CASH.value and ride_status == BookingStatus.COMPLETED.value

TERMINAL_BOOKING_STATUSES = {
    BookingStatus.COMPLETED.value,
    BookingStatus.CANCELLED.value,
    BookingStatus.REJECTED.value,
    BookingStatus.NO_DRIVER_FOUND.value,
    BookingStatus.BOOKING_FAILED.value,
}

BOOKING_STATUS_TRANSITIONS: Dict[str, set[str]] = {
    BookingStatus.SCHEDULED.value: {BookingStatus.PENDING.value, BookingStatus.CANCELLED.value},
    BookingStatus.SEARCHING.value: {
        BookingStatus.PENDING.value,
        BookingStatus.ACCEPTED.value,
        BookingStatus.CANCELLED.value,
        BookingStatus.NO_DRIVER_FOUND.value,
    },
    BookingStatus.PENDING.value: {
        BookingStatus.ACCEPTED.value,
        BookingStatus.CANCELLED.value,
        BookingStatus.REJECTED.value,
        BookingStatus.NO_DRIVER_FOUND.value,
        BookingStatus.BOOKING_FAILED.value,
    },
    BookingStatus.ACCEPTED.value: {BookingStatus.DRIVER_ARRIVED.value, BookingStatus.CANCELLED.value},
    BookingStatus.DRIVER_ARRIVED.value: {BookingStatus.IN_PROGRESS.value, BookingStatus.CANCELLED.value},
    BookingStatus.IN_PROGRESS.value: {BookingStatus.COMPLETED.value, BookingStatus.CANCELLED.value},
    BookingStatus.WAITING_FOR_PAYMENT.value: {BookingStatus.COMPLETED.value, BookingStatus.CANCELLED.value},
    BookingStatus.RATING_PENDING.value: {BookingStatus.COMPLETED.value},
}

def validate_booking_status_transition(current_status: Any, target_status: Any, actor_role: Any) -> None:
    current = booking_status_value(current_status)
    target = booking_status_value(target_status)
    role = normalized_enum_text(actor_role)

    if not target:
        raise HTTPException(status_code=400, detail="Target booking status is required")
    if current == target:
        return
    if current in TERMINAL_BOOKING_STATUSES:
        raise HTTPException(status_code=400, detail=f"Cannot change terminal booking status '{current}'")
    if role == UserRole.DRIVER.value and target not in {
        BookingStatus.DRIVER_ARRIVED.value,
        BookingStatus.IN_PROGRESS.value,
        BookingStatus.COMPLETED.value,
        BookingStatus.CANCELLED.value,
    }:
        raise HTTPException(status_code=403, detail="Driver cannot set this booking status")

    allowed_targets = BOOKING_STATUS_TRANSITIONS.get(current, set())
    if target not in allowed_targets:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid booking status transition: {current or 'unknown'} -> {target}",
        )

def booking_status_allows_live_comm(status_value: Any) -> bool:
    normalized = booking_status_value(status_value)
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

def is_recent_driver_location(profile: Optional[Dict[str, Any]], max_age_seconds: Optional[int] = None) -> bool:
    if not isinstance(profile, dict):
        return False
    timestamp = (
        profile.get("last_location_at")
        or profile.get("last_heartbeat_at")
        or profile.get("last_online_at")
        or profile.get("updated_at")
    )
    timestamp_utc = as_utc_naive(timestamp)
    now_utc = as_utc_naive(get_ist_now())
    if not timestamp_utc or not now_utc:
        return False
    max_age = max(
        int(max_age_seconds or 0),
        int(DRIVER_LIVE_LOCATION_TTL_SECONDS),
        int(REALTIME_OFFLINE_SECONDS * 4),
    )
    age_seconds = (now_utc - timestamp_utc).total_seconds()
    return -60 <= age_seconds <= max_age

async def get_effective_driver_location(driver_profile: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not isinstance(driver_profile, dict):
        return None
    driver_id = str(driver_profile.get("user_id") or "").strip()
    live_location = await get_cached_driver_live_location(
        driver_id,
        max_age_seconds=DRIVER_LIVE_LOCATION_TTL_SECONDS,
    )
    if live_location:
        return live_location

    if not bool(driver_profile.get("is_available")):
        return None
    if not is_recent_driver_location(driver_profile, DRIVER_ACCEPTING_BACKGROUND_SECONDS):
        return None
    return normalize_tracking_location(driver_profile.get("current_location"))


async def cache_get(key: str):
    if not redis_client:
        cached = LOCAL_CACHE.get(key)
        if not cached:
            return None
        expires_at, value = cached
        if expires_at <= time.monotonic():
            LOCAL_CACHE.pop(key, None)
            return None
        return copy.deepcopy(value)
    try:
        value = await redis_client.get(key)
        return json.loads(value) if value else None
    except Exception:
        return None


async def cache_set(key: str, value: Any, ttl_seconds: int = 60):
    if not redis_client:
        ttl = max(1, int(ttl_seconds))
        if len(LOCAL_CACHE) >= LOCAL_CACHE_MAX_ITEMS:
            LOCAL_CACHE.clear()
        LOCAL_CACHE[key] = (time.monotonic() + ttl, copy.deepcopy(value))
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
        LOCAL_CACHE.pop(key, None)
        return
    try:
        await redis_client.delete(key)
    except Exception:
        pass


async def cache_delete_pattern(pattern: str):
    if not redis_client:
        for key in list(LOCAL_CACHE.keys()):
            if fnmatch.fnmatch(key, pattern):
                LOCAL_CACHE.pop(key, None)
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
            await cache_delete_pattern(f"driver_pending_requests:{driver_id}:*")


async def clear_active_ride_cache(driver_id: Optional[str], passenger_id: Optional[str]) -> None:
    if driver_id:
        await cache_delete(f"active_ride:driver:{driver_id}")
    if passenger_id:
        await cache_delete(f"active_ride:passenger:{passenger_id}")


RIDE_QUEUE_KEY = "queue:rides:pending"
RIDE_QUEUE_PAYLOAD_PREFIX = "queue:rides:payload:"
DRIVER_GEO_KEY = "geo:drivers:live"
ANALYTICS_QUEUE_KEY = "queue:analytics:events"
DISPATCH_DRIVER_ACCEPTANCE_TIMEOUT_SECONDS = max(
    15,
    min(300, int(os.environ.get("DISPATCH_DRIVER_ACCEPTANCE_TIMEOUT_SECONDS", "45"))),
)
DISPATCH_SEQUENTIAL_CANDIDATE_LIMIT = max(
    3,
    min(25, int(os.environ.get("DISPATCH_SEQUENTIAL_CANDIDATE_LIMIT", "10"))),
)
DISPATCH_RECENT_PENALTY_WINDOW_HOURS = max(
    1,
    min(48, int(os.environ.get("DISPATCH_RECENT_PENALTY_WINDOW_HOURS", "6"))),
)
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


async def enqueue_ride(booking_id: str, priority: int = 0):
    if not redis_client or not booking_id:
        return
    normalized_booking_id = str(booking_id).strip()
    score = int(get_ist_now().timestamp()) + max(0, int(priority))
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
        due = await redis_client.zrange(RIDE_QUEUE_KEY, 0, 0, withscores=True)
        if not due:
            return None
        booking_id, score = due[0]
        if float(score) > int(get_ist_now().timestamp()):
            return None
        removed = await redis_client.zrem(RIDE_QUEUE_KEY, booking_id)
        if not removed:
            return None
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
    if db is None:
        return
    await db.analytics_events.insert_one(event)
    if analytics_db is not None:
        try:
            await analytics_db.ride_events.insert_one(event)
        except Exception:
            logger.exception("Analytics mirror write failed")


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
    vehicle_type_id: Optional[str] = None,
    vehicle_subtype_id: Optional[str] = None,
    ride_type: Optional[str] = None,
    booking_context: Optional[Dict[str, Any]] = None,
    excluded_driver_ids: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    blocked_set = {
        str(driver_id or "").strip()
        for driver_id in (excluded_driver_ids or [])
        if str(driver_id or "").strip()
    }
    service_filter = dict(booking_context or {})
    service_filter["vehicle_type_id"] = str(vehicle_type_id or service_filter.get("vehicle_type_id") or "").strip().lower()
    service_filter["vehicle_subtype_id"] = str(
        vehicle_subtype_id or service_filter.get("vehicle_subtype_id") or ""
    ).strip().lower()
    service_filter["ride_product"] = str(
        ride_type or service_filter.get("ride_product") or service_filter.get("ride_type") or ""
    ).strip().lower()

    async def hydrate_women_only_driver_identity(candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        if service_filter.get("ride_product") != "women_only" or not candidates:
            return candidates
        driver_ids = [str(item.get("user_id") or "").strip() for item in candidates if item.get("user_id")]
        if not driver_ids:
            return candidates
        users = await db.users.find(
            {"id": {"$in": list(set(driver_ids))}, "role": UserRole.DRIVER},
            {"_id": 0, "id": 1, "name": 1, "gender": 1},
        ).to_list(None)
        users_by_id = {str(item.get("id") or ""): item for item in users}
        hydrated = []
        for candidate in candidates:
            user = users_by_id.get(str(candidate.get("user_id") or ""))
            hydrated.append(
                {
                    **candidate,
                    "gender": candidate.get("gender") or (user or {}).get("gender"),
                    "name": candidate.get("name") or (user or {}).get("name"),
                }
            )
        return hydrated

    async def filter_matchable_drivers(candidates: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        candidates = await hydrate_women_only_driver_identity(candidates)
        ordered: List[Dict[str, Any]] = []
        for candidate in candidates:
            driver_id = str(candidate.get("user_id") or "").strip()
            if not driver_id:
                continue
            if blocked_set and driver_id in blocked_set:
                continue
            if not driver_matches_booking_service(candidate, service_filter):
                continue
            effective_location = await get_effective_driver_location(candidate)
            if not effective_location:
                continue
            ordered.append(
                {
                    "user_id": driver_id,
                    "name": candidate.get("name"),
                    "rating": candidate.get("rating"),
                    "vehicle_info": candidate.get("vehicle_info"),
                    "current_location": effective_location,
                    "distance_km": safe_float(candidate.get("distance_km"), 9999.0),
                }
            )
            if len(ordered) >= max(1, int(limit)):
                break
        return ordered

    redis_candidates = await find_nearest_drivers_redis_geo(
        pickup_location,
        limit=max(1, int(limit) * 4),
        max_distance_km=max_distance_km,
    )
    if redis_candidates:
        candidate_ids = [str(item.get("user_id") or "").strip() for item in redis_candidates if item.get("user_id")]
        if candidate_ids:
            if blocked_set:
                candidate_ids = [driver_id for driver_id in candidate_ids if driver_id not in blocked_set]
            if not candidate_ids:
                return []
            profiles = await db.drivers.find(
                {
                    "user_id": {"$in": list(set(candidate_ids))},
                    "is_available": True,
                    "kyc_status": KYCStatus.APPROVED,
                },
                {
                    "_id": 0,
                    "user_id": 1,
                    "name": 1,
                    "rating": 1,
                    "average_rating": 1,
                    "rental_rating": 1,
                    "rental_enabled": 1,
                    "gender": 1,
                    "is_available": 1,
                    "kyc_status": 1,
                    "kyc_verified": 1,
                    "vehicle_verified": 1,
                    "vehicle_verification_status": 1,
                    "police_verified": 1,
                    "police_verification_status": 1,
                    "background_check_status": 1,
                    "safety_score": 1,
                    "women_only_safety_score": 1,
                    "trusted_safety_driver": 1,
                    "women_only_trusted_driver": 1,
                    "active_complaints": 1,
                    "open_safety_complaints": 1,
                    "safety_complaint_count": 1,
                    "live_location_enabled": 1,
                    "location_sharing_enabled": 1,
                    "tourism_rating": 1,
                    "tourism_enabled": 1,
                    "languages": 1,
                    "language_codes": 1,
                    "district": 1,
                    "city": 1,
                    "tourism_cities": 1,
                    "service_cities": 1,
                    "local_areas": 1,
                    "online_vehicle": 1,
                    "accepted_ride_types": 1,
                    "districts": 1,
                    "vehicle_info": 1,
                    "current_location": 1,
                    "is_available": 1,
                    "last_location_at": 1,
                    "last_heartbeat_at": 1,
                    "last_online_at": 1,
                    "updated_at": 1,
                },
            ).to_list(max(1, len(candidate_ids)))
            profile_map = {str(item.get("user_id") or "").strip(): item for item in profiles}
            ordered_candidates: List[Dict[str, Any]] = []
            for candidate in redis_candidates:
                driver_id = str(candidate.get("user_id") or "").strip()
                profile = profile_map.get(driver_id)
                if not profile:
                    continue
                ordered_candidates.append({**profile, "distance_km": safe_float(candidate.get("distance_km"), 9999.0)})
            ordered = await filter_matchable_drivers(ordered_candidates)
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
    geo_query: Dict[str, Any] = {
        "is_available": True,
        "kyc_status": KYCStatus.APPROVED,
        "vehicle_info": {"$ne": None},
    }
    if blocked_set:
        geo_query["user_id"] = {"$nin": list(blocked_set)}
    geo_limit = max(1, int(limit))
    pipeline = [
        {
            "$geoNear": {
                "near": pickup_geo,
                "key": "current_location_geo",
                "distanceField": "distance_meters",
                "spherical": True,
                "maxDistance": max(1000, int(float(max_distance_km) * 1000)),
                "query": geo_query,
            }
        },
        {"$limit": geo_limit * 3},
        {
            "$project": {
                "_id": 0,
                "user_id": 1,
                "name": 1,
                "rating": 1,
                "average_rating": 1,
                "rental_rating": 1,
                "rental_enabled": 1,
                "gender": 1,
                "kyc_status": 1,
                "kyc_verified": 1,
                "vehicle_verified": 1,
                "vehicle_verification_status": 1,
                "police_verified": 1,
                "police_verification_status": 1,
                "background_check_status": 1,
                "safety_score": 1,
                "women_only_safety_score": 1,
                "trusted_safety_driver": 1,
                "women_only_trusted_driver": 1,
                "active_complaints": 1,
                "open_safety_complaints": 1,
                "safety_complaint_count": 1,
                "live_location_enabled": 1,
                "location_sharing_enabled": 1,
                "tourism_rating": 1,
                "tourism_enabled": 1,
                "languages": 1,
                "language_codes": 1,
                "district": 1,
                "city": 1,
                "tourism_cities": 1,
                "service_cities": 1,
                "local_areas": 1,
                "online_vehicle": 1,
                "accepted_ride_types": 1,
                "districts": 1,
                "vehicle_info": 1,
                "current_location": 1,
                "is_available": 1,
                "last_location_at": 1,
                "last_heartbeat_at": 1,
                "last_online_at": 1,
                "updated_at": 1,
                "distance_km": {"$divide": ["$distance_meters", 1000]},
            }
        },
    ]
    try:
        candidates = await db.drivers.aggregate(pipeline).to_list(geo_limit * 3)
        return await filter_matchable_drivers(candidates)
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


def tracking_path_point(location: Dict[str, Any], captured_at: datetime) -> Dict[str, Any]:
    return {
        "latitude": location["latitude"],
        "longitude": location["longitude"],
        "captured_at": captured_at,
    }


def build_trip_distance_tracking_update(
    booking: Optional[Dict[str, Any]],
    current_location: Optional[Dict[str, Any]],
    captured_at: datetime,
) -> tuple[Dict[str, Any], Optional[Dict[str, Any]]]:
    if not booking or enum_response_value(booking.get("status")) != BookingStatus.IN_PROGRESS.value:
        return {}, None

    normalized_location = normalize_tracking_location(current_location)
    if not normalized_location:
        return {}, None

    previous_location = normalize_tracking_location(
        booking.get("trip_last_location") or booking.get("trip_start_location")
    )
    if not previous_location:
        return {
            "trip_start_location": normalized_location,
            "trip_last_location": normalized_location,
            "trip_last_location_at": captured_at,
        }, {
            "$each": [tracking_path_point(normalized_location, captured_at)],
            "$slice": -TRIP_DISTANCE_MAX_POINTS,
        }

    segment_km = calculate_tracking_segment_km(previous_location, normalized_location)
    if segment_km < max(0.0, TRIP_DISTANCE_MIN_SEGMENT_KM):
        return {}, None
    if segment_km > max(0.5, TRIP_DISTANCE_MAX_SEGMENT_KM):
        return {}, None

    actual_distance_km = max(0.0, safe_float(booking.get("actual_distance_km"), 0.0)) + segment_km
    return {
        "actual_distance_km": round(actual_distance_km, 3),
        "trip_last_location": normalized_location,
        "trip_last_location_at": captured_at,
    }, {
        "$each": [tracking_path_point(normalized_location, captured_at)],
        "$slice": -TRIP_DISTANCE_MAX_POINTS,
    }


def calculate_actual_trip_duration_minutes(booking: Dict[str, Any], completed_at: datetime) -> float:
    started_at = as_utc_naive(booking.get("trip_started_at"))
    completed_at_utc = as_utc_naive(completed_at)
    if not started_at or not completed_at_utc:
        return 0.0
    return max(0.0, (completed_at_utc - started_at).total_seconds() / 60.0)


def calculate_waiting_charge(
    booking: Dict[str, Any],
    pricing: "PricingRule",
    completed_at: datetime,
) -> Dict[str, float]:
    actual_duration_minutes = calculate_actual_trip_duration_minutes(booking, completed_at)
    estimated_minutes = max(0.0, safe_float(booking.get("eta_minutes"), 0.0))
    waiting_minutes = max(0.0, actual_duration_minutes - estimated_minutes)
    waiting_rate = max(0.0, safe_float(getattr(pricing, "waiting_charge_per_minute", 0.0), 0.0))
    waiting_charge = round(waiting_minutes * waiting_rate, 2)
    return {
        "actual_duration_minutes": round(actual_duration_minutes, 2),
        "estimated_duration_minutes": round(estimated_minutes, 2),
        "waiting_minutes": round(waiting_minutes, 2),
        "waiting_charge": waiting_charge,
        "waiting_charge_per_minute": round(waiting_rate, 2),
    }

async def build_driver_arrived_cancellation_fare_update(
    booking: Dict[str, Any],
    actor_role: str,
    cancelled_at: datetime,
) -> Optional[Dict[str, Any]]:
    if enum_response_value(booking.get("status")) != BookingStatus.DRIVER_ARRIVED.value:
        return None
    if actor_role == UserRole.DRIVER.value or not booking.get("driver_id"):
        return None

    pricing = await get_pricing_rules()
    driver_profile = await db.drivers.find_one({"user_id": booking.get("driver_id")}) if booking.get("driver_id") else None
    effective_pricing = await get_effective_pricing_for_driver_profile(driver_profile, pricing)
    vehicle_type_multiplier = float(
        booking.get("vehicle_type_multiplier")
        or get_vehicle_type_fare_multiplier(
            booking.get("vehicle_type_id"),
            booking.get("vehicle_subtype_id"),
        )
        or 1.0
    )
    ride_type_multiplier = float(
        booking.get("ride_type_multiplier")
        or get_ride_type_fare_multiplier(booking.get("ride_type"))
        or 1.0
    )
    driver_fare_multiplier = float((driver_profile or {}).get("fare_multiplier", 1.0) or 1.0)
    minimum_route_fare = max(0.0, float(effective_pricing.minimum_fare or pricing.minimum_fare or 0.0))
    cancellation_fee = round(
        minimum_route_fare * vehicle_type_multiplier * ride_type_multiplier * driver_fare_multiplier,
        2,
    )
    if cancellation_fee <= 0:
        return None

    return {
        "actual_distance_km": 0.0,
        "distance_km": 0.0,
        "duration_minutes": 0,
        "waiting_minutes": 0.0,
        "waiting_charge": 0.0,
        "base_actual_route_fare": round(minimum_route_fare, 2),
        "base_route_fare": cancellation_fee,
        "final_fare": cancellation_fee,
        "cancellation_fee": cancellation_fee,
        "cancellation_fee_applied": True,
        "cancellation_fee_type": "driver_arrived_minimum_fare",
        "payment_status": "pending",
        "fare_breakdown": {
            "pricing_basis": "driver_arrived_cancellation_minimum",
            "minimum_fare": round(minimum_route_fare, 2),
            "actual_distance_km": 0.0,
            "vehicle_type_multiplier": round(vehicle_type_multiplier, 4),
            "ride_type_multiplier": round(ride_type_multiplier, 4),
            "driver_fare_multiplier": round(driver_fare_multiplier, 4),
            "cancelled_at": cancelled_at.isoformat(),
        },
    }


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
            "operator_registration_fee": _to_float(rules.get("operator_registration_fee", 0.0)),
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
            operator_registration_fee=0.0,
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
    if role == UserRole.OPERATOR:
        return float(settings.operator_registration_fee)
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
    if role == UserRole.OPERATOR:
        return config.operator
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

def subscription_tier_name(plan_type: Optional[SubscriptionPlanType]) -> str:
    if plan_type == SubscriptionPlanType.PER_TRIP:
        return "Per Trip"
    if plan_type == SubscriptionPlanType.MONTHLY:
        return "Monthly"
    if plan_type == SubscriptionPlanType.QUARTERLY:
        return "Quarterly"
    if plan_type == SubscriptionPlanType.ANNUALLY:
        return "Annual"
    return "Standard"

def subscription_plan_window_active(plan: Any) -> bool:
    return is_scheme_currently_active(
        getattr(plan, "scheme_start_at", None),
        getattr(plan, "scheme_end_at", None),
    )

def build_driver_tier_entry(
    name: str,
    plan_type: Optional[SubscriptionPlanType],
    plan: Optional[Any],
    subscription: Dict[str, Any],
) -> Dict[str, Any]:
    if not plan_type or not plan:
        return {
            "name": name,
            "benefits": {
                "platform_access": "Basic",
                "plan_amount": 0,
                "activation": "No paid tier selected",
            },
            "requirements": {
                "select_plan": "Choose an active tier",
                "admin_activation": "Required after selection",
            },
        }

    amount = get_subscription_plan_amount(
        RoleSubscriptionConfig(
            monthly=plan if plan_type == SubscriptionPlanType.MONTHLY else SubscriptionPeriodPlan(),
            quarterly=plan if plan_type == SubscriptionPlanType.QUARTERLY else SubscriptionPeriodPlan(),
            annually=plan if plan_type == SubscriptionPlanType.ANNUALLY else SubscriptionPeriodPlan(),
            per_trip=plan if plan_type == SubscriptionPlanType.PER_TRIP else PerTripSubscriptionPlan(),
        ),
        plan_type,
    )
    is_config_active = bool(getattr(plan, "active", False)) and subscription_plan_window_active(plan)
    benefits: Dict[str, Any] = {
        "plan_amount": amount,
        "admin_enabled": "Yes" if is_config_active else "No",
    }
    requirements: Dict[str, Any] = {
        "admin_activation": "Required",
    }

    if plan_type == SubscriptionPlanType.PER_TRIP:
        ride_threshold = int(getattr(plan, "ride_threshold", 10) or 10)
        benefits.update(
            {
                "billing": "Per ride cycle",
                "ride_threshold": ride_threshold,
                "grace_rides": PER_TRIP_BLOCK_GRACE_RIDES,
            }
        )
        requirements["completed_rides_per_cycle"] = ride_threshold
    elif plan_type == SubscriptionPlanType.MONTHLY:
        benefits["billing_cycle_days"] = 30
    elif plan_type == SubscriptionPlanType.QUARTERLY:
        benefits["billing_cycle_days"] = 90
    elif plan_type == SubscriptionPlanType.ANNUALLY:
        benefits["billing_cycle_days"] = 365

    return {
        "name": name,
        "benefits": benefits,
        "requirements": requirements,
    }

def build_driver_subscription_tiers(role_config: RoleSubscriptionConfig, subscription: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [
        build_driver_tier_entry("Standard", None, None, subscription),
        build_driver_tier_entry("Per Trip", SubscriptionPlanType.PER_TRIP, role_config.per_trip, subscription),
        build_driver_tier_entry("Monthly", SubscriptionPlanType.MONTHLY, role_config.monthly, subscription),
        build_driver_tier_entry("Quarterly", SubscriptionPlanType.QUARTERLY, role_config.quarterly, subscription),
        build_driver_tier_entry("Annual", SubscriptionPlanType.ANNUALLY, role_config.annually, subscription),
    ]

def get_driver_tier_progress(subscription: Dict[str, Any], selected_plan: Optional[SubscriptionPlanType], role_config: RoleSubscriptionConfig) -> float:
    if selected_plan == SubscriptionPlanType.PER_TRIP:
        threshold = max(1, int(role_config.per_trip.ride_threshold or 10))
        completed = int(subscription.get("per_trip_completed_rides", 0) or 0)
        return round(min(100.0, (completed / threshold) * 100), 2)
    if selected_plan:
        return 100.0 if subscription.get("is_active") and subscription.get("activated_by_admin") else 50.0
    return 0.0

def driver_identity_candidates(user: Dict[str, Any]) -> List[str]:
    candidates = [
        str(user.get("id") or "").strip(),
        str(user.get("_id") or "").strip(),
        str(user.get("user_id") or "").strip(),
    ]
    return list(dict.fromkeys([candidate for candidate in candidates if candidate and candidate != "None"]))

def get_referral_next_tier_target(successful_referrals: int) -> int:
    if successful_referrals < 5:
        return 5
    if successful_referrals < 10:
        return 10
    if successful_referrals < 25:
        return 25
    return 0

def normalize_driver_referral_reward(reward: Dict[str, Any]) -> Dict[str, Any]:
    status_value = str(reward.get("status") or "pending").strip().lower()
    return {
        "id": str(reward.get("id") or reward.get("_id") or uuid.uuid4()),
        "name": reward.get("new_user_name") or reward.get("referred_user_name") or "Driver",
        "date": reward.get("created_at"),
        "status": "completed" if status_value in {"credited", "completed", "paid"} else status_value,
        "earning_amount": round(float(reward.get("reward_amount") or reward.get("amount") or 0.0), 2),
    }

async def build_driver_referral_program_response(user: Dict[str, Any]) -> Dict[str, Any]:
    referral = await create_referral_if_missing(db, user)
    rewards = await db.referral_rewards.find(
        {"referrer_user_id": user["id"]},
        {"_id": 0},
    ).sort("created_at", -1).limit(50).to_list(50)

    referred_user_ids = [
        str(reward.get("new_user_id") or "").strip()
        for reward in rewards
        if reward.get("new_user_id")
    ]
    if referred_user_ids:
        users_by_id = {
            row.get("id"): row
            for row in await db.users.find(
                {"id": {"$in": referred_user_ids}},
                {"_id": 0, "id": 1, "name": 1, "role": 1},
            ).to_list(100)
        }
        for reward in rewards:
            referred_user = users_by_id.get(str(reward.get("new_user_id") or ""))
            if referred_user:
                reward["new_user_name"] = referred_user.get("name") or "Driver"

    successful_referrals = max(
        int(referral.get("successful_invites") or 0),
        len([reward for reward in rewards if str(reward.get("status") or "").lower() in {"credited", "completed", "paid"}]),
    )
    total_referrals = max(int(referral.get("total_invites") or 0), len(rewards))
    total_earnings = round(
        float(referral.get("total_earned") or 0.0)
        or sum(float(reward.get("reward_amount") or 0.0) for reward in rewards),
        2,
    )
    return {
        "referral_code": str(referral.get("code") or user.get("referral_code") or "").strip().upper(),
        "total_referrals": total_referrals,
        "successful_referrals": successful_referrals,
        "pending_referrals": max(0, total_referrals - successful_referrals),
        "total_earnings": total_earnings,
        "referral_rate": 50,
        "next_tier_referrals": get_referral_next_tier_target(successful_referrals),
        "recent_referrals": [normalize_driver_referral_reward(reward) for reward in rewards[:10]],
    }

async def find_latest_driver_action(user: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    candidates = driver_identity_candidates(user)
    if not candidates:
        return None
    return await db.driver_actions.find_one(
        {
            "driver_id": {"$in": candidates},
            "action": {"$in": ["suspend", "suspended", "ban", "banned"]},
        },
        {"_id": 0},
        sort=[("created_at", -1)],
    )

def to_naive_datetime(value: Any) -> Optional[datetime]:
    try:
        return as_utc_naive(value)
    except Exception:
        return None

async def build_driver_suspension_status(user: Dict[str, Any]) -> Dict[str, Any]:
    latest_action = await find_latest_driver_action(user)
    current_status = str(
        user.get("driver_status")
        or user.get("account_status")
        or user.get("status")
        or "active"
    ).strip().lower()
    if current_status in {"enabled", "approved", "online"}:
        current_status = "active"

    action_name = str((latest_action or {}).get("action") or "").strip().lower()
    active_statuses = {"suspended", "banned"}
    if current_status not in active_statuses and action_name in {"suspend", "ban"}:
        current_status = "suspended" if action_name == "suspend" else "banned"

    if current_status not in active_statuses:
        return {
            "status": "active",
            "has_pending_appeal": False,
            "can_appeal": False,
            "appeal_deadline_days": 7,
            "message": "No active suspension",
        }

    now = get_ist_now()
    suspended_at = (
        to_naive_datetime(user.get("suspended_at"))
        or to_naive_datetime(user.get("banned_at"))
        or to_naive_datetime((latest_action or {}).get("created_at"))
        or as_utc_naive(now)
    )
    end_at = (
        to_naive_datetime(user.get("suspension_end_date"))
        or to_naive_datetime(user.get("ban_until"))
        or to_naive_datetime((latest_action or {}).get("ban_until"))
    )
    now_naive = as_utc_naive(now)
    appeal_deadline_days = int(user.get("appeal_deadline_days") or 7)
    appeal_deadline = suspended_at + timedelta(days=appeal_deadline_days)
    can_appeal = bool(user.get("appeal_allowed", True)) and now_naive <= appeal_deadline
    days_suspended = max(0, (now_naive - suspended_at).days)
    days_remaining = max(0, (end_at - now_naive).days) if end_at else None
    pending_appeal = await db.driver_suspension_appeals.find_one(
        {
            "driver_id": {"$in": driver_identity_candidates(user)},
            "status": {"$in": ["pending", "under_review"]},
        },
        {"_id": 0},
        sort=[("created_at", -1)],
    )

    return {
        "status": "suspended",
        "raw_status": current_status,
        "reason": user.get("suspension_reason") or user.get("ban_reason") or (latest_action or {}).get("reason") or "Policy violation",
        "suspended_at": suspended_at,
        "days_suspended": days_suspended,
        "days_remaining": days_remaining,
        "suspension_end_date": end_at,
        "can_appeal": can_appeal,
        "appeal_deadline_days": appeal_deadline_days,
        "appeal_deadline_at": appeal_deadline,
        "has_pending_appeal": bool(pending_appeal),
        "pending_appeal": pending_appeal,
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

async def ensure_passenger_booking_compliance(user: Dict[str, Any]) -> None:
    passenger_id = str(user.get("id") or "").strip()
    if not passenger_id:
        raise HTTPException(status_code=401, detail="Invalid passenger account. Please login again.")

    now = as_utc_naive(get_ist_now()) or get_ist_now()

    if PASSENGER_KYC_REQUIRED_FOR_BOOKING:
        kyc_doc = await db.passenger_kyc.find_one({"user_id": passenger_id}, {"_id": 0})
        raw_status = (
            (kyc_doc or {}).get("status")
            or (kyc_doc or {}).get("verification_level")
            or user.get("kyc_status")
            or "unverified"
        )
        kyc_status = str(enum_response_value(raw_status) or "").strip().lower()
        kyc_verified = bool((kyc_doc or {}).get("is_verified")) or kyc_status in {"approved", "verified"}
        if not kyc_verified:
            raise HTTPException(
                status_code=403,
                detail="Passenger KYC must be approved before booking a ride.",
            )

    await ensure_default_document_requirements(db)
    requirement_rows = await db.document_requirements.find(
        {
            "enabled": True,
            "applicable_to": {"$in": ["passenger", "both"]},
        }
    ).to_list(None)
    requirements = [
        requirement
        for requirement in requirement_rows
        if effective_is_mandatory(requirement)
    ]
    if not requirements:
        return

    upload_rows = await db.document_uploads.find({"user_id": passenger_id}).to_list(None)
    legacy_rows = await db.passenger_documents.find({"user_id": passenger_id}).to_list(None)
    uploaded_types = {
        str(row.get("document_type") or row.get("type") or "").strip()
        for row in [*upload_rows, *legacy_rows]
        if str(row.get("document_type") or row.get("type") or "").strip()
    }
    missing = [
        requirement
        for requirement in requirements
        if str(requirement.get("document_type") or "").strip() not in uploaded_types
    ]
    if not missing:
        return

    user_record = await db.users.find_one({"id": passenger_id}, {"_id": 0, "created_at": 1}) or {}
    created_at = as_utc_naive(user_record.get("created_at") or user.get("created_at")) or now
    max_grace_days = max(int(requirement.get("grace_period_days", 0) or 0) for requirement in requirements)
    if max_grace_days > 0 and now <= created_at + timedelta(days=max_grace_days):
        return

    missing_names = [
        str(requirement.get("display_name") or requirement.get("document_type") or "required document")
        for requirement in missing
    ]
    raise HTTPException(
        status_code=403,
        detail=f"Mandatory passenger documents are required before booking: {', '.join(missing_names)}.",
    )

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


ROUTE_METRICS_CACHE: Dict[str, tuple[float, Dict[str, Any]]] = {}


def local_route_metrics(pickup: Location, drop: Location) -> Dict[str, Any]:
    fallback_distance = calculate_distance(pickup, drop)
    fallback_duration = max(1, int(round((fallback_distance / max(DEFAULT_CITY_SPEED_KMPH, 1.0)) * 60)))
    return {
        "distance_km": fallback_distance,
        "duration_minutes": fallback_duration,
        "eta_minutes": fallback_duration,
        "source": "haversine_fallback",
        "route_polyline": None,
    }


async def get_route_metrics(pickup: Location, drop: Location) -> Dict[str, Any]:
    """Return route distance and ETA without making ride flow depend on public map APIs."""
    cache_key = (
        f"{round(float(pickup.latitude), 5)},{round(float(pickup.longitude), 5)}:"
        f"{round(float(drop.latitude), 5)},{round(float(drop.longitude), 5)}"
    )
    now_monotonic = time.monotonic()
    if ROUTE_METRICS_CACHE_SECONDS > 0:
        cached = ROUTE_METRICS_CACHE.get(cache_key)
        if cached and now_monotonic - cached[0] <= ROUTE_METRICS_CACHE_SECONDS:
            return dict(cached[1])

    metrics: Dict[str, Any]
    if ENABLE_OSRM_ROUTING:
        coord = f"{pickup.longitude},{pickup.latitude};{drop.longitude},{drop.latitude}"
        url = f"{OSRM_BASE_URL.rstrip('/')}/route/v1/driving/{coord}?overview=full&geometries=geojson&alternatives=false&steps=false"
        try:
            timeout = httpx.Timeout(OSRM_TIMEOUT_SECONDS, connect=min(OSRM_TIMEOUT_SECONDS, 0.5))
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
                        metrics = {
                            "distance_km": distance_km,
                            "duration_minutes": duration_minutes,
                            "eta_minutes": duration_minutes,
                            "source": "osrm",
                            "route_polyline": route_polyline,
                        }
                    else:
                        metrics = local_route_metrics(pickup, drop)
                else:
                    metrics = local_route_metrics(pickup, drop)
        except Exception as exc:
            logger.warning("OSRM fallback in use: %s", exc)
            metrics = local_route_metrics(pickup, drop)
    else:
        metrics = local_route_metrics(pickup, drop)

    if ROUTE_METRICS_CACHE_SECONDS > 0 and ROUTE_METRICS_CACHE_MAX > 0:
        if len(ROUTE_METRICS_CACHE) >= ROUTE_METRICS_CACHE_MAX:
            ROUTE_METRICS_CACHE.clear()
        ROUTE_METRICS_CACHE[cache_key] = (now_monotonic, dict(metrics))
    return metrics


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
    "waiting_charge_per_minute",
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
            excluded_driver_ids=list(blocked_set),
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
            excluded_driver_ids=list(blocked_set),
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
    vehicle_type_id: Optional[str] = None,
    vehicle_subtype_id: Optional[str] = None,
    ride_type: Optional[str] = None,
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
    service_filter = {
        "vehicle_type_id": vehicle_type_id,
        "vehicle_subtype_id": vehicle_subtype_id,
        "ride_product": ride_type,
    }
    for driver in candidates:
        if not driver_matches_booking_service(driver, service_filter):
            continue
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


RIDE_TYPE_FARE_MULTIPLIERS = {
    "normal": 1.00,
    "pool": 0.78,
    "scheduled": 1.10,
    "corporate": 1.20,
    "airport": 1.35,
    "intercity": 1.60,
    "ev_auto": 1.05,
    "tourism": 1.85,
    "women_only": 1.15,
    "pet": 1.18,
    "rental_hourly": 2.10,
    "school_elderly_safe": 1.12,
}

RIDE_TYPE_COMPATIBILITY_ALIASES = {
    "normal": "instant",
    "pool": "instant",
    "ev_auto": "ev_auto",
    "women_only": "women_only",
    "school_elderly_safe": "instant",
    "intercity": "intercity",
    "rental_hourly": "rental",
    "pet": "pet",
}

DRIVER_ACCEPTED_RIDE_TYPE_KEYS = tuple(RIDE_TYPE_FARE_MULTIPLIERS.keys())
DRIVER_ACCEPTED_RIDE_TYPE_SET = set(DRIVER_ACCEPTED_RIDE_TYPE_KEYS)
DRIVER_COMPATIBILITY_RIDE_TYPE_SET = {
    "instant",
    "scheduled",
    "rental",
    "airport",
    "corporate",
    "tourism",
    "goods",
    "intercity",
    "ev_auto",
    "women_only",
    "pet",
}
DEFAULT_DRIVER_ACCEPTED_RIDE_TYPES = ["normal"]


def normalize_driver_accepted_ride_types(
    value: Any,
    *,
    default: Optional[List[str]] = None,
) -> List[str]:
    if value is None:
        return list(default or [])
    raw_values = value
    if isinstance(value, str):
        raw_values = [part.strip() for part in value.split(",")]
    if not isinstance(raw_values, list):
        return list(default or [])

    seen = set()
    normalized: List[str] = []
    for raw in raw_values:
        key = str(raw or "").strip().lower()
        if not key:
            continue
        key = key.replace("-", "_").replace(" ", "_")
        if key not in DRIVER_ACCEPTED_RIDE_TYPE_SET and key not in DRIVER_COMPATIBILITY_RIDE_TYPE_SET:
            continue
        if key in seen:
            continue
        seen.add(key)
        normalized.append(key)
    return normalized or list(default or [])


def get_ride_type_fare_multiplier(ride_type: Optional[str]) -> float:
    key = str(ride_type or "normal").strip().lower() or "normal"
    return float(RIDE_TYPE_FARE_MULTIPLIERS.get(key, 1.0))


def get_ride_type_compatibility_key(ride_type: Optional[str]) -> str:
    key = str(ride_type or "").strip().lower()
    return RIDE_TYPE_COMPATIBILITY_ALIASES.get(key, key)


def vehicle_supports_requested_ride_type(vehicle_type_id: str, ride_type: Optional[str]) -> bool:
    compatibility_key = get_ride_type_compatibility_key(ride_type)
    if not compatibility_key:
        return True
    return is_vehicle_compatible_with_ride_type(vehicle_type_id, compatibility_key)


def get_vehicle_type_fare_multiplier(vehicle_type_id: Optional[str], subtype_id: Optional[str] = None) -> float:
    key = str(vehicle_type_id or "").strip().lower()
    subtype_key = str(subtype_id or "").strip() or None
    if not key:
        return 1.0
    try:
        multiplier = float(get_vehicle_multiplier(key, subtype_key))
        if math.isfinite(multiplier) and multiplier > 0:
            return multiplier
    except Exception:
        logger.warning("Could not resolve vehicle fare multiplier for type=%s subtype=%s", key, subtype_key)
    return 1.0


def get_driver_online_vehicle_type(driver: Optional[Dict[str, Any]]) -> str:
    raw_vehicle = (driver or {}).get("vehicle_info") or {}
    return str(
        raw_vehicle.get("vehicle_type_id")
        or raw_vehicle.get("vehicle_type")
        or (driver or {}).get("vehicle_type_id")
        or (driver or {}).get("vehicle_type")
        or "auto"
    ).strip().lower()


def get_driver_online_vehicle_subtype(driver: Optional[Dict[str, Any]]) -> str:
    raw_vehicle = (driver or {}).get("vehicle_info") or {}
    return str(
        raw_vehicle.get("vehicle_subtype_id")
        or (driver or {}).get("vehicle_subtype_id")
        or ""
    ).strip().lower()


def get_driver_accepted_ride_types(driver: Optional[Dict[str, Any]]) -> List[str]:
    source = driver or {}
    raw_vehicle = source.get("vehicle_info") or {}
    online_vehicle = source.get("online_vehicle") or {}
    return normalize_driver_accepted_ride_types(
        raw_vehicle.get("accepted_ride_types")
        or online_vehicle.get("accepted_ride_types")
        or source.get("accepted_ride_types"),
    )


def driver_accepts_requested_ride_type(driver: Optional[Dict[str, Any]], requested_ride_type: Optional[str]) -> bool:
    requested = str(requested_ride_type or "").strip().lower()
    if not requested:
        return True
    requested = requested.replace("-", "_").replace(" ", "_")
    accepted = get_driver_accepted_ride_types(driver)
    if not accepted:
        return True
    if requested in accepted:
        return True
    if requested in {"rental", "rental_hourly"} and any(item in {"rental", "rental_hourly"} for item in accepted):
        return True
    if requested == "women_only" and any(item in {"normal", "instant"} for item in accepted):
        return True
    requested_compatibility = get_ride_type_compatibility_key(requested)
    return any(
        accepted_key not in DRIVER_ACCEPTED_RIDE_TYPE_SET
        and accepted_key == requested_compatibility
        for accepted_key in accepted
    )


def truthy_ev_vehicle_value(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    text = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
    return text in {"1", "true", "yes", "y", "on", "ev", "electric", "ev_auto", "battery_electric"}


def driver_has_ev_auto_capability(driver: Optional[Dict[str, Any]]) -> bool:
    source = driver or {}
    raw_vehicle = source.get("vehicle_info") or {}
    online_vehicle = source.get("online_vehicle") or {}
    accepted = get_driver_accepted_ride_types(source)
    if "ev_auto" in accepted:
        return True

    flag_fields = ("is_ev", "is_electric", "electric", "ev_enabled", "ev_auto")
    for row in (raw_vehicle, online_vehicle, source):
        if any(truthy_ev_vehicle_value(row.get(field)) for field in flag_fields):
            return True

    text_fields = (
        "vehicle_type_id",
        "vehicle_type",
        "vehicle_subtype_id",
        "vehicle_model",
        "model",
        "fuel_type",
        "fuel",
        "energy_type",
        "powertrain",
    )
    for row in (raw_vehicle, online_vehicle, source):
        for field in text_fields:
            text = str(row.get(field) or "").strip().lower().replace("-", "_").replace(" ", "_")
            if text in {"ev", "electric", "ev_auto", "battery_electric", "zero_emission"} or "ev_auto" in text:
                return True
    return False


def driver_has_tourism_capability(
    driver: Optional[Dict[str, Any]],
    booking: Optional[Dict[str, Any]] = None,
) -> bool:
    booking_doc = booking or {}
    tourism_details = booking_doc.get("tourism_details") if isinstance(booking_doc.get("tourism_details"), dict) else {}
    driver_filter = booking_doc.get("driver_filter") if isinstance(booking_doc.get("driver_filter"), dict) else {}
    city = (
        tourism_details.get("city")
        or booking_doc.get("tourism_city")
        or driver_filter.get("tourism_city")
    )
    language = (
        tourism_details.get("language_preference")
        or booking_doc.get("tourism_language_preference")
        or driver_filter.get("language_preference")
    )
    return tourism_driver_eligibility(driver or {}, city=city, language=language).get("eligible") is True


def driver_has_women_only_capability(
    driver: Optional[Dict[str, Any]],
    booking: Optional[Dict[str, Any]] = None,
) -> bool:
    booking_doc = booking or {}
    driver_filter = booking_doc.get("driver_filter") if isinstance(booking_doc.get("driver_filter"), dict) else {}
    details = booking_doc.get("women_only_details") if isinstance(booking_doc.get("women_only_details"), dict) else {}
    female_driver_required = bool(
        details.get("female_driver_required")
        if "female_driver_required" in details
        else driver_filter.get("female_driver_required", True)
    )
    allow_trusted_fallback = bool(
        details.get("allow_trusted_male_driver_if_unavailable")
        if "allow_trusted_male_driver_if_unavailable" in details
        else driver_filter.get("allow_trusted_male_driver_if_unavailable", False)
    )
    return women_only_driver_eligibility(
        driver or {},
        female_driver_required=female_driver_required,
        allow_trusted_male_driver_if_unavailable=allow_trusted_fallback,
    ).get("eligible") is True


def driver_has_rental_capability(
    driver: Optional[Dict[str, Any]],
    booking: Optional[Dict[str, Any]] = None,
) -> bool:
    booking_doc = booking or {}
    details = booking_doc.get("rental_details") if isinstance(booking_doc.get("rental_details"), dict) else {}
    driver_filter = booking_doc.get("driver_filter") if isinstance(booking_doc.get("driver_filter"), dict) else {}
    package_hours = (
        details.get("package_hours")
        or booking_doc.get("rental_package_hours")
        or booking_doc.get("rental_hours")
        or driver_filter.get("package_hours")
    )
    try:
        package_hours = int(package_hours) if package_hours is not None else None
    except Exception:
        package_hours = None
    vehicle_type = (
        details.get("vehicle_type")
        or booking_doc.get("vehicle_type_id")
        or booking_doc.get("vehicle_type")
        or driver_filter.get("vehicle_type")
    )
    return rental_driver_eligibility(
        driver or {},
        vehicle_type=vehicle_type,
        package_hours=package_hours,
    ).get("eligible") is True


async def hydrate_driver_profiles_with_user_identity(drivers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    driver_ids = [str(item.get("user_id") or item.get("id") or "").strip() for item in drivers if item]
    driver_ids = [item for item in driver_ids if item]
    if not driver_ids:
        return drivers
    users = await db.users.find(
        {"id": {"$in": list(set(driver_ids))}, "role": UserRole.DRIVER},
        {"_id": 0, "id": 1, "name": 1, "gender": 1},
    ).to_list(None)
    users_by_id = {str(item.get("id") or ""): item for item in users}
    hydrated = []
    for driver in drivers:
        driver_id = str(driver.get("user_id") or driver.get("id") or "").strip()
        user = users_by_id.get(driver_id) or {}
        hydrated.append(
            {
                **driver,
                "gender": driver.get("gender") or user.get("gender"),
                "name": driver.get("name") or user.get("name"),
            }
        )
    return hydrated


def driver_matches_booking_service(driver: Optional[Dict[str, Any]], booking: Optional[Dict[str, Any]]) -> bool:
    booking_doc = booking or {}
    requested_vehicle_type = str(
        booking_doc.get("vehicle_type_id")
        or booking_doc.get("vehicle_type")
        or ""
    ).strip().lower()
    requested_vehicle_subtype = str(booking_doc.get("vehicle_subtype_id") or "").strip().lower()
    requested_ride_type = str(
        booking_doc.get("ride_product")
        or booking_doc.get("ride_type")
        or ""
    ).strip().lower()

    driver_vehicle_type = get_driver_online_vehicle_type(driver)
    driver_vehicle_subtype = get_driver_online_vehicle_subtype(driver)
    ev_auto_type_match = (
        requested_ride_type == "ev_auto"
        and requested_vehicle_type in {"auto", "ev_auto"}
        and driver_vehicle_type in {"auto", "ev_auto"}
    )
    if requested_vehicle_type and driver_vehicle_type != requested_vehicle_type and not ev_auto_type_match:
        return False
    if requested_vehicle_subtype and driver_vehicle_subtype and driver_vehicle_subtype != requested_vehicle_subtype:
        return False
    if requested_ride_type and not vehicle_supports_requested_ride_type(driver_vehicle_type, requested_ride_type):
        return False
    if requested_ride_type == "ev_auto" and not driver_has_ev_auto_capability(driver):
        return False
    if requested_ride_type == "tourism" and not driver_has_tourism_capability(driver, booking_doc):
        return False
    if requested_ride_type == "women_only" and not driver_has_women_only_capability(driver, booking_doc):
        return False
    if requested_ride_type in {"rental", "rental_hourly"} and not driver_has_rental_capability(driver, booking_doc):
        return False
    if requested_ride_type and not driver_accepts_requested_ride_type(driver, requested_ride_type):
        return False
    return True


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


def empty_driver_stats() -> Dict[str, float]:
    return {
        "total": 0.0,
        "completed": 0.0,
        "cancelled": 0.0,
        "completion_rate": 0.0,
        "cancellation_rate": 0.0,
        "acceptance_rate": 0.0,
        "rejection_rate": 0.0,
    }


async def get_driver_stats_many(driver_ids: List[str]) -> Dict[str, Dict[str, float]]:
    unique_driver_ids = [
        driver_id
        for driver_id in list(dict.fromkeys(str(item or "").strip() for item in driver_ids))
        if driver_id
    ]
    stats_by_id = {driver_id: empty_driver_stats() for driver_id in unique_driver_ids}
    if not unique_driver_ids:
        return stats_by_id

    booking_rows, attempt_rows = await asyncio.gather(
        db.bookings.aggregate(
            [
                {"$match": {"driver_id": {"$in": unique_driver_ids}}},
                {
                    "$group": {
                        "_id": "$driver_id",
                        "total": {"$sum": 1},
                        "completed": {
                            "$sum": {"$cond": [{"$eq": ["$status", BookingStatus.COMPLETED]}, 1, 0]}
                        },
                        "cancelled": {
                            "$sum": {"$cond": [{"$eq": ["$status", BookingStatus.CANCELLED]}, 1, 0]}
                        },
                    }
                },
            ]
        ).to_list(None),
        db.dispatch_attempts.aggregate(
            [
                {
                    "$match": {
                        "driver_id": {"$in": unique_driver_ids},
                        "response": {"$in": ["accepted", "rejected", "expired"]},
                    }
                },
                {
                    "$group": {
                        "_id": {"driver_id": "$driver_id", "response": "$response"},
                        "count": {"$sum": 1},
                    }
                },
            ]
        ).to_list(None),
    )

    attempt_counts: Dict[str, Dict[str, float]] = defaultdict(lambda: {"accepted": 0.0, "rejected": 0.0, "expired": 0.0})
    for row in attempt_rows:
        driver_id = str((row.get("_id") or {}).get("driver_id") or "").strip()
        response = str((row.get("_id") or {}).get("response") or "").strip().lower()
        if driver_id and response in attempt_counts[driver_id]:
            attempt_counts[driver_id][response] = float(row.get("count") or 0)

    for row in booking_rows:
        driver_id = str(row.get("_id") or "").strip()
        if not driver_id:
            continue
        stats = stats_by_id.setdefault(driver_id, empty_driver_stats())
        stats["total"] = float(row.get("total") or 0)
        stats["completed"] = float(row.get("completed") or 0)
        stats["cancelled"] = float(row.get("cancelled") or 0)

    for driver_id, stats in stats_by_id.items():
        attempts = attempt_counts.get(driver_id, {})
        accepted = float(attempts.get("accepted") or 0.0)
        rejected = float(attempts.get("rejected") or 0.0)
        expired = float(attempts.get("expired") or 0.0)
        total_attempts = accepted + rejected + expired
        total = max(float(stats.get("total") or 0.0), 1.0)
        stats["completion_rate"] = float(stats.get("completed") or 0.0) / total
        stats["cancellation_rate"] = float(stats.get("cancelled") or 0.0) / total
        stats["acceptance_rate"] = accepted / max(total_attempts, 1.0)
        stats["rejection_rate"] = rejected / max(total_attempts, 1.0)
    return stats_by_id


async def get_recent_dispatch_attempt_penalties(driver_ids: List[str]) -> Dict[str, Dict[str, float]]:
    unique_driver_ids = [
        driver_id
        for driver_id in list(dict.fromkeys(str(item or "").strip() for item in driver_ids))
        if driver_id
    ]
    penalties = {driver_id: {"rejected": 0.0, "expired": 0.0} for driver_id in unique_driver_ids}
    if not unique_driver_ids:
        return penalties
    cutoff = get_ist_now() - timedelta(hours=DISPATCH_RECENT_PENALTY_WINDOW_HOURS)
    try:
        rows = await db.dispatch_attempts.aggregate(
            [
                {
                    "$match": {
                        "driver_id": {"$in": unique_driver_ids},
                        "response": {"$in": ["rejected", "expired"]},
                        "$or": [
                            {"responded_at": {"$gte": cutoff}},
                            {"expired_at": {"$gte": cutoff}},
                            {"created_at": {"$gte": cutoff}},
                        ],
                    }
                },
                {
                    "$group": {
                        "_id": {"driver_id": "$driver_id", "response": "$response"},
                        "count": {"$sum": 1},
                    }
                },
            ]
        ).to_list(None)
    except Exception:
        logger.warning("Recent dispatch penalty lookup failed; continuing without recency penalties", exc_info=True)
        return penalties

    for row in rows:
        key = row.get("_id") or {}
        driver_id = str(key.get("driver_id") or "").strip()
        response = str(key.get("response") or "").strip().lower()
        if driver_id in penalties and response in penalties[driver_id]:
            penalties[driver_id][response] = float(row.get("count") or 0)
    return penalties

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


async def get_busy_driver_ids(driver_ids: List[str]) -> set[str]:
    unique_driver_ids = [
        driver_id
        for driver_id in list(dict.fromkeys(str(item or "").strip() for item in driver_ids))
        if driver_id
    ]
    if not unique_driver_ids:
        return set()
    active_driver_ids = await db.bookings.distinct(
        "driver_id",
        {"driver_id": {"$in": unique_driver_ids}, "status": {"$in": ACTIVE_RIDE_STATUSES}},
    )
    return {str(driver_id or "").strip() for driver_id in active_driver_ids if str(driver_id or "").strip()}


async def get_supply_demand_score(pickup_location: Dict[str, Any], radius_km: float = 4.0) -> Dict[str, Any]:
    latitude = safe_float((pickup_location or {}).get("latitude"), None)
    longitude = safe_float((pickup_location or {}).get("longitude"), None)
    nearby_drivers = 0
    driver_geo_counted = False
    if latitude is not None and longitude is not None:
        try:
            rows = await db.drivers.aggregate(
                [
                    {
                        "$geoNear": {
                            "near": {
                                "type": "Point",
                                "coordinates": [float(longitude), float(latitude)],
                            },
                            "key": "current_location_geo",
                            "distanceField": "distance_meters",
                            "spherical": True,
                            "maxDistance": max(1000, int(float(radius_km) * 1000)),
                            "query": {
                                "is_available": True,
                                "kyc_status": KYCStatus.APPROVED,
                                "vehicle_info": {"$ne": None},
                            },
                        }
                    },
                    {"$count": "count"},
                ]
            ).to_list(1)
            nearby_drivers = int((rows[0] if rows else {}).get("count") or 0)
            driver_geo_counted = True
        except Exception:
            logger.exception("Driver supply geo count failed; falling back to bounded scan")
    if not driver_geo_counted:
        online_drivers = await db.drivers.find(
            {
                "is_available": True,
                "kyc_status": KYCStatus.APPROVED,
                "vehicle_info": {"$ne": None},
            }
        ).to_list(120)
        for driver in online_drivers:
            live_location = await get_effective_driver_location(driver)
            if not live_location:
                continue
            if km_between(pickup_location, live_location) <= radius_km:
                nearby_drivers += 1

    recent_cutoff = get_ist_now() - timedelta(minutes=15)
    nearby_demand = 0
    demand_statuses = [
        BookingStatus.PENDING,
        BookingStatus.ACCEPTED,
        BookingStatus.DRIVER_ARRIVED,
        BookingStatus.IN_PROGRESS,
    ]
    demand_geo_counted = False
    if latitude is not None and longitude is not None:
        try:
            rows = await db.bookings.aggregate(
                [
                    {
                        "$geoNear": {
                            "near": {
                                "type": "Point",
                                "coordinates": [float(longitude), float(latitude)],
                            },
                            "key": "pickup_location_geo",
                            "distanceField": "distance_meters",
                            "spherical": True,
                            "maxDistance": max(1000, int(float(radius_km) * 1000)),
                            "query": {
                                "created_at": {"$gte": recent_cutoff},
                                "status": {"$in": demand_statuses},
                            },
                        }
                    },
                    {"$count": "count"},
                ]
            ).to_list(1)
            nearby_demand = int((rows[0] if rows else {}).get("count") or 0)
            demand_geo_counted = True
        except Exception:
            logger.exception("Demand geo count failed; falling back to bounded scan")
    if not demand_geo_counted:
        recent_bookings = await db.bookings.find(
            {
                "created_at": {"$gte": recent_cutoff},
                "pickup_location": {"$ne": None},
                "status": {"$in": demand_statuses},
            }
        ).to_list(120)
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
    product_priority_bonus = safe_float(payload.get("product_priority_bonus"), 0.0)
    product_suitability_bonus = safe_float(payload.get("product_suitability_bonus"), 0.0)
    fatigue_penalty = safe_float(payload.get("fatigue_penalty"), 0.0)
    decline_penalty = safe_float(payload.get("decline_penalty"), 0.0)
    timeout_penalty = safe_float(payload.get("timeout_penalty"), 0.0)
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
        + product_priority_bonus
        + product_suitability_bonus
        - fatigue_penalty
        - decline_penalty
        - timeout_penalty
    )
    return round(max(0.0, final_score), 2)


def normalized_dispatch_product_key(booking: Optional[Dict[str, Any]]) -> str:
    source = booking or {}
    try:
        product = booking_product_key(source)
    except NameError:
        product = ""
    if not product:
        product = str(
            source.get("ride_product")
            or source.get("ride_type")
            or source.get("booking_type")
            or ""
        ).strip().lower()
    product = product.replace("-", "_").replace(" ", "_")
    if product == "rental_hourly":
        return "rental"
    if product:
        return product
    if schedule_is_in_future(as_utc_naive(source.get("scheduled_for")), get_ist_now()):
        return "scheduled"
    return "normal"


def dispatch_queue_priority_for_booking(booking: Optional[Dict[str, Any]]) -> int:
    product = normalized_dispatch_product_key(booking)
    if product == "airport":
        return 0
    if product == "scheduled":
        return 0
    if product in {"rental", "women_only"}:
        return 1
    return 2


def dispatch_product_priority_bonus(booking: Optional[Dict[str, Any]]) -> float:
    product = normalized_dispatch_product_key(booking)
    bonus = {
        "airport": 14.0,
        "scheduled": 11.0,
        "rental": 9.0,
        "women_only": 8.0,
    }.get(product, 0.0)
    scheduled_for = as_utc_naive((booking or {}).get("scheduled_for"))
    now = as_utc_naive(get_ist_now())
    if product == "scheduled" and scheduled_for and now:
        minutes_until = (scheduled_for - now).total_seconds() / 60.0
        if minutes_until <= 45:
            bonus += 6.0
        elif minutes_until <= 120:
            bonus += 3.0
    return bonus


def truthy_dispatch_value(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value or "").strip().lower() in {"1", "true", "yes", "y", "on", "enabled", "approved"}


def driver_dispatch_product_suitability_bonus(driver: Optional[Dict[str, Any]], booking: Optional[Dict[str, Any]]) -> float:
    source = driver or {}
    product = normalized_dispatch_product_key(booking)
    bonus = 0.0
    accepted = set(get_driver_accepted_ride_types(source))

    if product == "airport":
        if truthy_dispatch_value(source.get("airport_enabled") or source.get("airport_pickup_enabled")):
            bonus += 8.0
        if truthy_dispatch_value(source.get("airport_permit_verified") or source.get("airport_badge_verified")):
            bonus += 5.0
        bonus += min(5.0, safe_float(source.get("airport_rating"), 0.0))
        if safe_float(source.get("completed_airport_rides"), 0.0) >= 10:
            bonus += 3.0
    elif product == "scheduled":
        if "scheduled" in accepted or truthy_dispatch_value(source.get("accepts_scheduled_rides")):
            bonus += 8.0
        bonus += min(5.0, safe_float(source.get("on_time_score"), 0.0))
    elif product == "rental":
        if truthy_dispatch_value(source.get("rental_enabled")):
            bonus += 8.0
        bonus += min(6.0, safe_float(source.get("rental_rating"), 0.0))
        if "rental" in accepted or "rental_hourly" in accepted:
            bonus += 4.0
    elif product == "women_only":
        gender = str(source.get("gender") or "").strip().lower()
        if gender in {"female", "woman", "women"}:
            bonus += 14.0
        if truthy_dispatch_value(source.get("women_only_trusted_driver") or source.get("trusted_safety_driver")):
            bonus += 8.0
        bonus += min(8.0, safe_float(source.get("women_only_safety_score"), safe_float(source.get("safety_score"), 0.0)) / 12.5)
    return round(bonus, 2)


def calculate_driver_dispatch_penalties(
    driver: Optional[Dict[str, Any]],
    driver_stats: Optional[Dict[str, float]],
    recent_attempts: Optional[Dict[str, float]] = None,
) -> Dict[str, float]:
    source = driver or {}
    stats = driver_stats or {}
    recent = recent_attempts or {}
    recent_declines = safe_float(recent.get("rejected"), safe_float(source.get("recent_dispatch_declines"), 0.0))
    recent_timeouts = safe_float(recent.get("expired"), safe_float(source.get("recent_dispatch_timeouts"), 0.0))
    consecutive_declines = safe_float(source.get("consecutive_dispatch_declines"), 0.0)
    rejection_rate = safe_float(stats.get("rejection_rate"), 0.0)
    decline_penalty = min(35.0, (rejection_rate * 18.0) + (recent_declines * 5.0) + (consecutive_declines * 4.0))
    timeout_penalty = min(24.0, recent_timeouts * 4.0)

    shift_minutes = safe_float(
        source.get("shift_minutes")
        or source.get("online_minutes_today")
        or source.get("current_shift_minutes"),
        0.0,
    )
    rides_today = safe_float(source.get("rides_today") or source.get("completed_rides_today"), 0.0)
    fatigue_score = safe_float(source.get("dispatch_fatigue_score") or source.get("fatigue_score"), 0.0)
    if shift_minutes > 480:
        fatigue_score += (shift_minutes - 480.0) / 60.0 * 3.0
    if rides_today > 10:
        fatigue_score += (rides_today - 10.0) * 1.5
    fatigue_penalty = min(30.0, fatigue_score)
    return {
        "decline_penalty": round(decline_penalty, 2),
        "timeout_penalty": round(timeout_penalty, 2),
        "fatigue_penalty": round(fatigue_penalty, 2),
        "total_penalty": round(decline_penalty + timeout_penalty + fatigue_penalty, 2),
    }


def ordered_unique_driver_ids(values: Any) -> List[str]:
    seen = set()
    ordered: List[str] = []
    raw_values = values if isinstance(values, list) else []
    for raw in raw_values:
        if isinstance(raw, dict):
            raw = raw.get("driver_id") or raw.get("user_id") or raw.get("id")
        driver_id = str(raw or "").strip()
        if not driver_id or driver_id in seen:
            continue
        seen.add(driver_id)
        ordered.append(driver_id)
    return ordered


def dispatch_attempted_driver_ids(booking: Optional[Dict[str, Any]]) -> set[str]:
    source = booking or {}
    attempted = set(ordered_unique_driver_ids(source.get("dispatch_attempted_driver_ids") or []))
    for entry in source.get("dispatch_attempt_history") or []:
        if isinstance(entry, dict):
            driver_id = str(entry.get("driver_id") or "").strip()
            if driver_id:
                attempted.add(driver_id)
    return attempted


def dispatch_candidate_queue_for_booking(booking: Optional[Dict[str, Any]]) -> List[str]:
    source = booking or {}
    queue: List[str] = []
    queue.extend(ordered_unique_driver_ids(source.get("dispatch_candidate_queue") or []))
    queue.extend(ordered_unique_driver_ids(source.get("candidate_driver_ids") or []))
    queue.extend(ordered_unique_driver_ids(source.get("ai_ranked_drivers") or []))
    return ordered_unique_driver_ids(queue)


def select_next_dispatch_candidate(
    booking: Optional[Dict[str, Any]],
    ranked_driver_ids: Optional[List[str]] = None,
    excluded_driver_ids: Optional[List[str]] = None,
) -> Optional[str]:
    excluded = set(ordered_unique_driver_ids(excluded_driver_ids or []))
    excluded.update(dispatch_attempted_driver_ids(booking))
    queue = dispatch_candidate_queue_for_booking(booking)
    queue.extend(ordered_unique_driver_ids(ranked_driver_ids or []))
    for driver_id in ordered_unique_driver_ids(queue):
        if driver_id not in excluded:
            return driver_id
    return None


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
    candidate_limit = max(40, min(160, max(1, int(limit or 1)) * 25))
    drivers = await find_nearest_drivers_mongo_geo(
        pickup,
        limit=candidate_limit,
        max_distance_km=max_radius_km,
        vehicle_type_id=booking.get("vehicle_type_id"),
        vehicle_subtype_id=booking.get("vehicle_subtype_id"),
        ride_type=booking.get("ride_product") or booking.get("ride_type"),
        booking_context=booking,
        excluded_driver_ids=list(blocked_set),
    )
    if not drivers:
        drivers = await db.drivers.find(query).to_list(120)
    if str(booking.get("ride_product") or booking.get("ride_type") or "").strip().lower() == "women_only":
        drivers = await hydrate_driver_profiles_with_user_identity(drivers)
    driver_ids = [str(driver.get("user_id") or "").strip() for driver in drivers if driver.get("user_id")]
    filter_preferences = load_driver_ride_filter_preferences(driver_ids)
    passenger_rating_summary = await get_user_rating_summary(passenger_id)
    passenger_rating = safe_float(passenger_rating_summary.get("average_rating"), 5.0)
    busy_driver_ids, stats_by_driver_id, recent_penalties_by_driver_id = await asyncio.gather(
        get_busy_driver_ids(driver_ids),
        get_driver_stats_many(driver_ids),
        get_recent_dispatch_attempt_penalties(driver_ids),
    )

    ranked: List[Dict[str, Any]] = []
    filtered_out: List[Dict[str, Any]] = []
    product_priority_bonus = dispatch_product_priority_bonus(booking)
    dispatch_product = normalized_dispatch_product_key(booking)
    for driver in drivers:
        driver_id = str(driver.get("user_id") or "").strip()
        if not driver_id or driver_id in blocked_set:
            continue
        if not driver_matches_booking_service(driver, booking):
            filtered_out.append({"driver_id": driver_id, "reasons": ["vehicle_or_ride_type_mismatch"]})
            continue
        if driver_id in busy_driver_ids:
            continue
        live_location = normalize_tracking_location(driver.get("current_location")) or await get_effective_driver_location(driver)
        if not live_location:
            continue
        distance_km = safe_float(driver.get("distance_km"), None)
        if distance_km is None or not math.isfinite(distance_km):
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
        stats = stats_by_driver_id.get(driver_id) or empty_driver_stats()
        last_assigned = driver.get("last_assigned_at")
        if isinstance(last_assigned, datetime):
            idle_minutes = max(0.0, (get_ist_now() - last_assigned).total_seconds() / 60.0)
        else:
            idle_minutes = 60.0
        rating = safe_float(driver.get("rating"), 4.5)
        cancellation_risk = predict_cancellation_risk(stats, distance_km, surge_multiplier)
        product_suitability_bonus = driver_dispatch_product_suitability_bonus(driver, booking)
        penalties = calculate_driver_dispatch_penalties(
            driver,
            stats,
            recent_penalties_by_driver_id.get(driver_id),
        )
        score = calculate_driver_rank_score(
            {
                "distance_km": distance_km,
                "driver_stats": stats,
                "rating": rating,
                "cancellation_risk": cancellation_risk,
                "idle_minutes": idle_minutes,
                "product_priority_bonus": product_priority_bonus,
                "product_suitability_bonus": product_suitability_bonus,
                "fatigue_penalty": penalties["fatigue_penalty"],
                "decline_penalty": penalties["decline_penalty"],
                "timeout_penalty": penalties["timeout_penalty"],
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
                "dispatch_product": dispatch_product,
                "product_priority_bonus": product_priority_bonus,
                "product_suitability_bonus": product_suitability_bonus,
                "fatigue_penalty": penalties["fatigue_penalty"],
                "decline_penalty": penalties["decline_penalty"],
                "timeout_penalty": penalties["timeout_penalty"],
                "surge_multiplier": surge_multiplier,
                "demand_supply": supply_demand,
                "fraud_risk": fraud,
            }
        )
    ranked.sort(key=lambda item: (-item.get("rank_score", 0.0), item.get("distance_km", 9999.0)))
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
            "dispatch_product": dispatch_product,
            "product_priority_bonus": product_priority_bonus,
            "passenger_rating": passenger_rating,
            "created_at": get_ist_now(),
        }
    )
    return selected


def dispatch_expiry_datetime(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    return None


def active_dispatch_driver_id(booking: Optional[Dict[str, Any]]) -> Optional[str]:
    source = booking or {}
    current = str(source.get("current_dispatch_driver_id") or "").strip()
    if current:
        return current
    if not source.get("dispatch_expires_at") and str(source.get("dispatch_status") or "") != "awaiting_driver_acceptance":
        return None
    candidates = ordered_unique_driver_ids(source.get("candidate_driver_ids") or [])
    return candidates[0] if candidates else None


async def update_driver_dispatch_response_metrics(driver_id: str, response: str, now: Optional[datetime] = None) -> None:
    normalized_driver_id = str(driver_id or "").strip()
    if not normalized_driver_id:
        return
    response_value = str(response or "").strip().lower()
    timestamp = now or get_ist_now()
    update_doc: Dict[str, Any] = {
        "$set": {
            "last_dispatch_response": response_value,
            "last_dispatch_response_at": timestamp,
            "updated_at": timestamp,
        }
    }
    if response_value == "accepted":
        update_doc["$set"].update(
            {
                "consecutive_dispatch_declines": 0,
                "recent_dispatch_declines": 0,
                "recent_dispatch_timeouts": 0,
            }
        )
    elif response_value == "rejected":
        update_doc["$inc"] = {
            "dispatch_decline_count": 1,
            "recent_dispatch_declines": 1,
            "consecutive_dispatch_declines": 1,
            "dispatch_fatigue_score": 2,
        }
    elif response_value == "expired":
        update_doc["$inc"] = {
            "dispatch_timeout_count": 1,
            "recent_dispatch_timeouts": 1,
            "consecutive_dispatch_declines": 1,
            "dispatch_fatigue_score": 1,
        }
    try:
        await db.drivers.update_one({"user_id": normalized_driver_id}, update_doc)
    except Exception:
        logger.exception("Failed to update dispatch response metrics for driver_id=%s", normalized_driver_id)


async def record_dispatch_attempt_sent(
    booking_id: str,
    driver_id: str,
    *,
    sequence: int,
    expires_at: datetime,
    reason: str,
) -> None:
    now = get_ist_now()
    await db.dispatch_attempts.update_one(
        {
            "booking_id": booking_id,
            "driver_id": driver_id,
        },
        {
            "$set": {
                "response": "sent",
                "sequence": int(sequence),
                "reason": str(reason or "dispatch"),
                "expires_at": expires_at,
                "sent_at": now,
                "updated_at": now,
            },
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "booking_id": booking_id,
                "driver_id": driver_id,
                "created_at": now,
            },
        },
        upsert=True,
    )


async def expire_active_dispatch_candidate_if_due(
    booking: Dict[str, Any],
    *,
    force: bool = False,
    reason: str = "acceptance_timeout",
) -> bool:
    booking_id = str(booking.get("id") or "").strip()
    driver_id = active_dispatch_driver_id(booking)
    if not booking_id or not driver_id:
        return False
    now = get_ist_now()
    expires_at = dispatch_expiry_datetime(booking.get("dispatch_expires_at"))
    if not force and expires_at and as_utc_naive(expires_at) > as_utc_naive(now):
        return False

    await db.dispatch_attempts.update_one(
        {
            "booking_id": booking_id,
            "driver_id": driver_id,
        },
        {
            "$set": {
                "response": "expired",
                "responded_at": now,
                "expired_at": now,
                "timeout_reason": reason,
                "updated_at": now,
            },
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "booking_id": booking_id,
                "driver_id": driver_id,
                "created_at": now,
            },
        },
        upsert=True,
    )
    await update_driver_dispatch_response_metrics(driver_id, "expired", now)

    attempted = ordered_unique_driver_ids(
        list(dispatch_attempted_driver_ids(booking)) + [driver_id]
    )
    remaining_active = [
        item for item in ordered_unique_driver_ids(booking.get("candidate_driver_ids") or [])
        if item != driver_id
    ]
    await db.bookings.update_one(
        {
            "id": booking_id,
            "status": {"$in": [BookingStatus.PENDING, BookingStatus.PENDING.value]},
            "driver_id": None,
        },
        {
            "$set": {
                "candidate_driver_ids": remaining_active,
                "current_dispatch_driver_id": remaining_active[0] if remaining_active else None,
                "dispatch_attempted_driver_ids": attempted,
                "dispatch_status": "driver_acceptance_timeout",
                "updated_at": now,
            },
            "$push": {
                "dispatch_attempt_history": {
                    "driver_id": driver_id,
                    "response": "expired",
                    "reason": reason,
                    "at": now,
                }
            },
        },
    )
    await cache_delete(f"driver_pending_requests:{driver_id}")
    return True


async def dispatch_next_candidate_for_booking(
    booking_id: str,
    *,
    reason: str = "dispatch_retry",
    extra_excluded_driver_ids: Optional[List[str]] = None,
) -> bool:
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        return False
    if booking_status_value(booking.get("status")) != BookingStatus.PENDING.value or booking.get("driver_id"):
        return False

    now = get_ist_now()
    excluded_driver_ids = set(await get_excluded_driver_ids_for_passenger(str(booking.get("passenger_id") or "")))
    excluded_driver_ids.update(ordered_unique_driver_ids(extra_excluded_driver_ids or []))
    excluded_driver_ids.update(dispatch_attempted_driver_ids(booking))
    active_driver = active_dispatch_driver_id(booking)
    if active_driver:
        excluded_driver_ids.add(active_driver)

    queue = dispatch_candidate_queue_for_booking(booking)
    next_driver_id = select_next_dispatch_candidate(
        booking,
        ranked_driver_ids=queue,
        excluded_driver_ids=list(excluded_driver_ids),
    )
    ranked_drivers: List[Dict[str, Any]] = []

    if not next_driver_id:
        pricing = await get_pricing_rules()
        radius_cfg = get_driver_search_radius_config(pricing)
        ranked_drivers = await intelligent_find_drivers_for_booking(
            booking,
            limit=DISPATCH_SEQUENTIAL_CANDIDATE_LIMIT,
            max_radius_km=float(radius_cfg["long_radius_km"]),
            excluded_driver_ids=list(excluded_driver_ids),
        )
        ranked_ids = [item["driver_id"] for item in ranked_drivers]
        next_driver_id = select_next_dispatch_candidate(
            booking,
            ranked_driver_ids=ranked_ids,
            excluded_driver_ids=list(excluded_driver_ids),
        )
        queue = ordered_unique_driver_ids(queue + ranked_ids)

    attempts = int(safe_float(booking.get("dispatch_attempt_count"), 0.0)) + 1
    if not next_driver_id:
        if attempts < RIDE_QUEUE_MAX_ATTEMPTS:
            retry_delay = min(60, RIDE_QUEUE_RETRY_BASE_SECONDS * max(1, attempts))
            await db.bookings.update_one(
                {
                    "id": booking_id,
                    "status": {"$in": [BookingStatus.PENDING, BookingStatus.PENDING.value]},
                    "driver_id": None,
                },
                {
                    "$set": {
                        "candidate_driver_ids": [],
                        "current_dispatch_driver_id": None,
                        "dispatch_status": "searching_retry",
                        "dispatch_attempt_count": attempts,
                        "dispatch_candidate_queue": queue,
                        "updated_at": now,
                    }
                },
            )
            await enqueue_ride(booking_id, priority=retry_delay)
        else:
            await db.bookings.update_one(
                {
                    "id": booking_id,
                    "status": {"$in": [BookingStatus.PENDING, BookingStatus.PENDING.value]},
                    "driver_id": None,
                },
                {
                    "$set": {
                        "candidate_driver_ids": [],
                        "current_dispatch_driver_id": None,
                        "dispatch_status": "no_drivers_available",
                        "dispatch_attempt_count": attempts,
                        "dispatch_candidate_queue": queue,
                        "updated_at": now,
                    }
                },
            )
        await write_analytics_event(
            "DISPATCH_RETRY",
            str(booking.get("passenger_id") or ""),
            {
                "booking_id": booking_id,
                "attempts": attempts,
                "has_candidates": False,
                "reason": reason,
            },
        )
        return False

    expires_at = now + timedelta(seconds=DISPATCH_DRIVER_ACCEPTANCE_TIMEOUT_SECONDS)
    attempted = ordered_unique_driver_ids(list(dispatch_attempted_driver_ids(booking)) + [next_driver_id])
    queue = ordered_unique_driver_ids([next_driver_id] + queue)
    await db.bookings.update_one(
        {
            "id": booking_id,
            "status": {"$in": [BookingStatus.PENDING, BookingStatus.PENDING.value]},
            "driver_id": None,
        },
        {
            "$set": {
                "candidate_driver_ids": [next_driver_id],
                "current_dispatch_driver_id": next_driver_id,
                "dispatch_candidate_queue": queue,
                "dispatch_attempted_driver_ids": attempted,
                "dispatch_attempt_count": attempts,
                "dispatch_status": "awaiting_driver_acceptance",
                "dispatch_last_reason": reason,
                "dispatch_expires_at": expires_at,
                "dispatch_acceptance_timeout_seconds": DISPATCH_DRIVER_ACCEPTANCE_TIMEOUT_SECONDS,
                "updated_at": now,
            },
            "$push": {
                "dispatch_attempt_history": {
                    "driver_id": next_driver_id,
                    "response": "sent",
                    "reason": reason,
                    "expires_at": expires_at,
                    "at": now,
                }
            },
        },
    )
    await record_dispatch_attempt_sent(
        booking_id,
        next_driver_id,
        sequence=attempts,
        expires_at=expires_at,
        reason=reason,
    )
    await clear_driver_pending_request_cache([next_driver_id])
    await emit_new_booking_to_drivers(
        booking_id=booking_id,
        target_driver_ids=[next_driver_id],
        include_unavailable=False,
    )
    await enqueue_ride(booking_id, priority=DISPATCH_DRIVER_ACCEPTANCE_TIMEOUT_SECONDS)
    await write_analytics_event(
        "DISPATCH_MATCH_FOUND",
        str(booking.get("passenger_id") or ""),
        {
            "booking_id": booking_id,
            "attempts": attempts,
            "candidate_count": 1,
            "driver_id": next_driver_id,
            "reason": reason,
            "ranked_driver_count": len(ranked_drivers),
        },
    )
    return True


async def is_driver_in_active_ride(driver_id: str) -> bool:
    active_statuses = [BookingStatus.ACCEPTED, BookingStatus.DRIVER_ARRIVED, BookingStatus.IN_PROGRESS]
    count = await db.bookings.count_documents({"driver_id": driver_id, "status": {"$in": active_statuses}})
    return count > 0


async def attempt_auto_assign_for_pending_booking(booking_id: str) -> bool:
    booking = await db.bookings.find_one({"id": booking_id})
    if not booking:
        return False
    if booking_status_value(booking.get("status")) != BookingStatus.PENDING.value or booking.get("driver_id"):
        return False

    pickup_data = booking.get("pickup_location")
    if not pickup_data:
        return False

    now = get_ist_now()
    active_driver = active_dispatch_driver_id(booking)
    expires_at = dispatch_expiry_datetime(booking.get("dispatch_expires_at"))
    if active_driver and expires_at and as_utc_naive(expires_at) > as_utc_naive(now):
        remaining_seconds = max(1, int((as_utc_naive(expires_at) - as_utc_naive(now)).total_seconds()))
        await enqueue_ride(booking_id, priority=remaining_seconds)
        return True

    if active_driver:
        await expire_active_dispatch_candidate_if_due(booking, force=True)

    return await dispatch_next_candidate_for_booking(
        booking_id,
        reason="driver_timeout" if active_driver else "dispatch_retry",
    )

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
    elif user_data.role == UserRole.OPERATOR:
        await ensure_operator_profile(user_id, user_dict)
    referral = await create_referral_if_missing(db, user_dict)
    user_dict["referral_code"] = referral.get("code")
    incoming_referral_code = str(user_data.referral_code or "").strip().upper()
    if incoming_referral_code:
        applied = await apply_referral_signup(db, user_dict, incoming_referral_code)
        if not applied:
            await db.users.delete_one({"id": user_id})
            await db.drivers.delete_one({"user_id": user_id})
            await db.operator_profiles.delete_one({"operator_id": user_id})
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
    try:
        user = await db.users.find_one({"email": credentials.email})
    except ServerSelectionTimeoutError:
        logger.error("MongoDB server selection timed out during /auth/login")
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")
    except PyMongoError:
        logger.exception("MongoDB error during /auth/login")
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")

    if not user or not verify_password(credentials.password, user["password_hash"]):
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

    refresh_token = create_refresh_token_for_user(user["id"], user["role"])
    await store_refresh_token(user["id"], refresh_token, request)
    return auth_response_for_user(user, refresh_token=refresh_token)


def get_google_oauth_audiences() -> Any:
    if not GOOGLE_OAUTH_CLIENT_ID:
        return None
    audiences = [item.strip() for item in GOOGLE_OAUTH_CLIENT_ID.replace(";", ",").split(",") if item.strip()]
    if not audiences:
        return None
    return audiences[0] if len(audiences) == 1 else audiences

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
                get_google_oauth_audiences(),
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
        if payload.role == UserRole.OPERATOR:
            await ensure_operator_profile(str(user.get("id") or ""), user)
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
    user_id = await ensure_user_record_id(user)
    referral = await create_referral_if_missing(db, user)
    user["referral_code"] = referral.get("code")
    incoming_referral_code = str(payload.referral_code or "").strip().upper()
    if created_new_user and payload.mode == "register" and incoming_referral_code:
        applied = await apply_referral_signup(db, user, incoming_referral_code)
        if not applied:
            if created_new_user:
                await db.users.delete_one({"id": user_id})
                await db.drivers.delete_one({"user_id": user_id})
                await db.operator_profiles.delete_one({"operator_id": user_id})
                await db.referrals.delete_one({"user_id": user_id})
            raise HTTPException(status_code=400, detail="Invalid or already used referral code")

    if user.get("registration_payment_required") and user.get("registration_payment_status") != "verified":
        raise HTTPException(status_code=403, detail="Registration payment verification is in progress")

    if str(user.get("role") or "").strip().lower() == UserRole.OPERATOR.value:
        await ensure_operator_profile(user_id, user)

    refresh_token = create_refresh_token_for_user(user_id, _normalize_role_text(user.get("role")) or UserRole.PASSENGER.value)
    await store_refresh_token(user_id, refresh_token, request)
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
    try:
        delivered = await send_otp_email_message(
            recipient_email=email,
            otp_code=otp_code,
            production=IS_PRODUCTION_ENV,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return OtpSendResponse(
        message="Email OTP sent successfully" if delivered else "Email OTP generated for development",
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
    expires_at = as_utc_naive(stored.get("expires_at"))
    now = as_utc_naive(get_ist_now()) or get_ist_now()
    if expires_at and expires_at < now:
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

def build_driver_document_expiry_alert(document: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    if not document.get("requires_expiry") or not document.get("expiry_date") or not document.get("reminder_due"):
        return None

    doc_type = normalize_driver_doc_type(document.get("doc_type") or document.get("type"))
    days_left = document.get("days_until_expiry")
    severity = "critical" if days_left is not None and days_left <= 7 else "warning"
    expiry_date = document.get("expiry_date")
    alert_id = f"{doc_type}:{expiry_date}"
    is_expired = bool(document.get("is_expired"))

    return {
        "id": alert_id,
        "alert_id": alert_id,
        "document_id": doc_type,
        "doc_type": doc_type,
        "document_type": document.get("label") or DRIVER_DOCUMENT_TYPES[doc_type]["label"],
        "expiry_date": expiry_date,
        "days_until_expiry": days_left,
        "severity": severity,
        "message": (
            "Expired document requires renewal"
            if is_expired
            else f"Renewal due in {days_left} days"
        ),
    }

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
    has_required_fields = all(bool(vehicle.get(field_name)) for field_name in required_fields)
    accepted_default = list(DRIVER_ACCEPTED_RIDE_TYPE_KEYS) if "accepted_ride_types" not in vehicle else []
    has_accepted_ride_types = bool(
        normalize_driver_accepted_ride_types(vehicle.get("accepted_ride_types"), default=accepted_default)
    )
    return has_required_fields and has_accepted_ride_types

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
                "Complete license plate, registration, type, seating, and accepted ride types for the active vehicle.",
                "vehicle",
            )
        )
    else:
        profile_vehicle_info = driver_profile.get("vehicle_info")
        if not isinstance(profile_vehicle_info, dict) or not profile_vehicle_info.get("vehicle_number"):
            await sync_driver_primary_vehicle(driver_id, active_vehicle)
            driver_profile["vehicle_info"] = build_driver_vehicle_info(active_vehicle)

    documents = await get_driver_documents_map(driver_id, request)
    documents_required_for_readiness = not document_mandatory_pause_active()
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
            if documents_required_for_readiness:
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
            if documents_required_for_readiness:
                blockers.append(
                    build_driver_readiness_issue(
                        f"rejected_document_{doc_type}",
                        f"Replace rejected {label}.",
                        "documents",
                    )
                )
        elif status_value != "approved":
            pending_documents.append(document)
            if documents_required_for_readiness:
                blockers.append(
                    build_driver_readiness_issue(
                        f"pending_document_{doc_type}",
                        f"{label} is waiting for approval.",
                        "documents",
                    )
                )
        if document.get("is_expired"):
            expired_documents.append(document)
            if documents_required_for_readiness:
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
                "required_count": len(DRIVER_DOCUMENT_TYPES) if documents_required_for_readiness else 0,
                "mandatory_paused": not documents_required_for_readiness,
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


@api_router.get("/passengers/ride-stats")
async def get_passenger_ride_stats(period: str = "month", current_user: dict = Depends(get_current_user)):
    require_passenger(current_user)
    normalized_period = str(period or "month").strip().lower()
    if normalized_period not in {"month", "quarter", "year", "all"}:
        normalized_period = "month"

    now = as_utc_naive(get_ist_now()) or datetime.utcnow()
    start_at: Optional[datetime] = None
    if normalized_period == "month":
        start_at = now - timedelta(days=31)
    elif normalized_period == "quarter":
        start_at = now - timedelta(days=92)
    elif normalized_period == "year":
        start_at = now - timedelta(days=366)

    query = {
        "passenger_id": current_user["id"],
        "status": {"$in": [BookingStatus.COMPLETED, BookingStatus.COMPLETED.value]},
    }
    bookings = await db.bookings.find(query, {"_id": 0}).sort(
        [("trip_completed_at", -1), ("updated_at", -1), ("created_at", -1)]
    ).to_list(5000)

    def ride_completed_at(booking: Dict[str, Any]) -> datetime:
        value = booking.get("trip_completed_at") or booking.get("updated_at") or booking.get("created_at")
        normalized = as_utc_naive(value) if isinstance(value, (datetime, str)) else None
        return normalized or datetime.min

    filtered_bookings = [
        booking for booking in bookings
        if start_at is None or ride_completed_at(booking) >= start_at
    ]

    total_rides = len(filtered_bookings)
    total_spent = round(sum(booking_fare_value(booking) for booking in filtered_bookings), 2)
    total_distance = round(sum(booking_distance_value(booking) for booking in filtered_bookings), 2)
    durations = [
        safe_float(booking.get("duration_minutes"), safe_float(booking.get("eta_minutes"), 0.0))
        for booking in filtered_bookings
    ]
    durations = [value for value in durations if value > 0]

    driver_counts: Dict[str, Dict[str, Any]] = {}
    day_counts: Dict[str, int] = {}
    hour_counts: Dict[int, int] = {}
    route_counts: Dict[str, int] = {}
    vehicle_counts: Dict[str, int] = {}

    for booking in filtered_bookings:
        completed_at = ride_completed_at(booking)
        if completed_at != datetime.min:
            day_name = completed_at.strftime("%A")
            day_counts[day_name] = day_counts.get(day_name, 0) + 1
            hour_counts[completed_at.hour] = hour_counts.get(completed_at.hour, 0) + 1

        pickup_address = str((booking.get("pickup_location") or {}).get("address") or "").strip()
        drop_address = str((booking.get("drop_location") or {}).get("address") or "").strip()
        if pickup_address and drop_address:
            route_label = f"{pickup_address} -> {drop_address}"
            route_counts[route_label] = route_counts.get(route_label, 0) + 1

        vehicle_label = (
            booking.get("vehicle_type_name")
            or booking.get("vehicle_type_id")
            or booking.get("ride_type")
            or booking.get("ride_product")
        )
        if vehicle_label:
            vehicle_key = str(vehicle_label).replace("_", " ").title()
            vehicle_counts[vehicle_key] = vehicle_counts.get(vehicle_key, 0) + 1

        driver_id = str(booking.get("driver_id") or "").strip()
        if driver_id:
            entry = driver_counts.setdefault(
                driver_id,
                {
                    "driver_id": driver_id,
                    "driver_name": booking.get("driver_name") or "Driver",
                    "ride_count": 0,
                    "rating": 5.0,
                },
            )
            entry["ride_count"] += 1

    driver_ids = list(driver_counts.keys())
    if driver_ids:
        users = {
            user["id"]: user
            for user in await db.users.find(
                {"id": {"$in": driver_ids}},
                {"_id": 0, "id": 1, "name": 1, "rating": 1, "average_rating": 1},
            ).to_list(None)
        }
        for driver_id, entry in driver_counts.items():
            user = users.get(driver_id) or {}
            entry["driver_name"] = user.get("name") or entry.get("driver_name") or "Driver"
            entry["rating"] = round(safe_float(user.get("average_rating"), safe_float(user.get("rating"), 5.0)), 1)

    top_drivers = sorted(
        driver_counts.values(),
        key=lambda item: (int(item.get("ride_count") or 0), safe_float(item.get("rating"), 0.0)),
        reverse=True,
    )[:5]

    insights: List[str] = []
    if total_rides == 0:
        insights.append("No completed rides found for this period.")
    else:
        insights.append(f"You completed {total_rides} ride{'s' if total_rides != 1 else ''} in this period.")
        if total_distance > 0:
            insights.append(f"You travelled about {round(total_distance, 1)} km.")
        if total_spent > 0:
            insights.append(f"Average fare was Rs {round(total_spent / max(total_rides, 1), 0):.0f}.")

    stats = {
        "period": normalized_period,
        "total_rides": total_rides,
        "total_spent": total_spent,
        "avg_fare": round(total_spent / max(total_rides, 1), 2) if total_rides else 0.0,
        "total_distance_km": total_distance,
        "avg_distance_km": round(total_distance / max(total_rides, 1), 2) if total_rides else 0.0,
        "total_duration_hours": round(sum(durations) / 60.0, 2) if durations else 0.0,
        "avg_duration_minutes": round(sum(durations) / max(len(durations), 1), 2) if durations else 0.0,
        "avg_rating": round(
            sum(safe_float(item.get("rating"), 0.0) for item in top_drivers) / max(len(top_drivers), 1),
            2,
        ) if top_drivers else 0.0,
        "top_drivers": top_drivers,
        "ride_patterns": {
            "peak_day": max(day_counts, key=day_counts.get) if day_counts else None,
            "peak_hour": max(hour_counts, key=hour_counts.get) if hour_counts else None,
            "favorite_route": max(route_counts, key=route_counts.get) if route_counts else None,
            "preferred_vehicle_type": max(vehicle_counts, key=vehicle_counts.get) if vehicle_counts else None,
        },
        "achievements": [],
        "savings_and_rewards": {
            "total_savings": 0.0,
            "promo_discounts": 0.0,
            "loyalty_points": float(total_rides * 10),
        },
        "insights": insights,
    }
    return {"stats": stats}


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
                "waiting_charge": round(float(booking.get("waiting_charge") or 0), 2),
                "cancellation_fee": round(float(booking.get("cancellation_fee") or 0), 2),
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

@api_router.get("/passengers/support/attachments")
async def list_support_attachments(current_user: dict = Depends(get_current_user)):
    require_passenger(current_user)
    attachments = await db.support_attachments.find(
        {"user_id": current_user["id"]}
    ).sort("created_at", -1).to_list(200)
    return {"attachments": [without_upload_storage_fields(attachment) for attachment in attachments]}

@api_router.get("/passengers/lost-items")
async def list_passenger_lost_items(current_user: dict = Depends(get_current_user)):
    require_passenger(current_user)
    lost_items = await db.passenger_lost_items.find(
        {"passenger_id": current_user["id"]}
    ).sort("created_at", -1).to_list(200)
    return {"lost_items": [without_mongo_id(item) for item in lost_items]}

@api_router.get("/passengers/bookings/history")
async def get_passenger_booking_history(
    current_user: dict = Depends(get_current_user),
    limit: int = Query(50, ge=1, le=200),
    status: Optional[str] = None,
):
    require_passenger(current_user)
    query = {"passenger_id": current_user["id"]}
    if status:
        query["status"] = status
    bookings = await db.bookings.find(query).sort("created_at", -1).limit(limit).to_list(limit)
    return {"bookings": [without_mongo_id(booking) for booking in bookings]}

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

@api_router.get("/drivers/tier-benefits")
async def get_driver_tier_benefits(current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    config = await get_subscription_config()
    role_config = get_role_subscription_config(config, UserRole.DRIVER)
    subscription = serialize_subscription_for_response(current_user, config)
    selected_plan = parse_subscription_plan_type(subscription.get("plan_type"))
    current_tier = subscription_tier_name(selected_plan)
    available_tiers = build_driver_subscription_tiers(role_config, subscription)
    current_tier_entry = next(
        (tier for tier in available_tiers if tier.get("name") == current_tier),
        available_tiers[0],
    )

    return {
        "current_tier": current_tier,
        "current_tier_progress": get_driver_tier_progress(subscription, selected_plan, role_config),
        "current_benefits": current_tier_entry.get("benefits", {}),
        "available_tiers": available_tiers,
        "subscription": subscription,
        "paid_plan_required": has_paid_subscription_plan_for_current_period(role_config),
    }

@api_router.get("/drivers/referral-program")
async def get_driver_referral_program(
    driver_id: Optional[str] = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    require_driver(current_user)
    if driver_id and driver_id not in driver_identity_candidates(current_user):
        raise HTTPException(status_code=403, detail="You can only view your own referral program")
    return await build_driver_referral_program_response(current_user)

@api_router.get("/drivers/suspension-status")
async def get_driver_suspension_status(current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    return await build_driver_suspension_status(current_user)

@api_router.post("/drivers/suspension-appeals")
async def submit_driver_suspension_appeal(request: Request, current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    if not isinstance(payload, dict):
        payload = {}

    reason = str(payload.get("reason") or "").strip()
    details = str(payload.get("details") or "").strip()
    if len(reason) < 10:
        raise HTTPException(status_code=400, detail="Please provide at least 10 characters explaining your appeal")

    suspension_status = await build_driver_suspension_status(current_user)
    if suspension_status.get("status") != "suspended":
        raise HTTPException(status_code=400, detail="No active suspension is available to appeal")
    if not suspension_status.get("can_appeal", False):
        raise HTTPException(status_code=400, detail="The appeal window for this suspension has closed")

    candidates = driver_identity_candidates(current_user)
    existing = await db.driver_suspension_appeals.find_one(
        {
            "driver_id": {"$in": candidates},
            "status": {"$in": ["pending", "under_review"]},
        },
        {"_id": 0},
    )
    if existing:
        return {
            "success": True,
            "message": "An appeal is already under review",
            "appeal": existing,
        }

    now = get_ist_now()
    appeal = {
        "id": f"driver-appeal-{uuid.uuid4()}",
        "driver_id": current_user["id"],
        "driver_identity_candidates": candidates,
        "driver_name": current_user.get("name"),
        "driver_email": current_user.get("email"),
        "reason": reason,
        "details": details,
        "status": "pending",
        "suspension_reason": suspension_status.get("reason"),
        "suspended_at": suspension_status.get("suspended_at"),
        "created_at": now,
        "updated_at": now,
    }
    await db.driver_suspension_appeals.insert_one(appeal)
    return {
        "success": True,
        "message": "Appeal submitted successfully",
        "appeal": without_mongo_id(appeal),
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
                "vehicle_type_id": "auto",
                "vehicle_subtype_id": None,
                "vehicle_type_name": "Auto",
                "vehicle_subtype_name": None,
                "accepted_ride_types": list(DRIVER_ACCEPTED_RIDE_TYPE_KEYS),
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
    catalog_selection = await resolve_driver_vehicle_catalog_selection(payload)
    canonical_vehicle = catalog_selection["vehicle"]
    canonical_subtype = catalog_selection["subtype"]
    accepted_ride_types = normalize_driver_accepted_ride_types(
        payload.accepted_ride_types,
        default=DEFAULT_DRIVER_ACCEPTED_RIDE_TYPES,
    )
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
        "vehicle_type": payload.vehicle_type_id,
        "vehicle_type_id": payload.vehicle_type_id,
        "vehicle_subtype_id": payload.vehicle_subtype_id,
        "vehicle_type_name": canonical_vehicle.get("name"),
        "vehicle_subtype_name": canonical_subtype.get("name") if canonical_subtype else None,
        "vehicle_icon": canonical_vehicle.get("icon"),
        "capacity_unit": canonical_vehicle.get("capacity_unit", "passengers"),
        "accepted_ride_types": accepted_ride_types,
        "is_active": not bool(has_existing),
        "created_at": now,
        "updated_at": now,
    }
    await db.driver_vehicles.insert_one(vehicle_doc)
    if vehicle_doc["is_active"]:
        await sync_driver_primary_vehicle(current_user["id"], vehicle_doc)
    return {"success": True, "vehicle": build_driver_vehicle_response(vehicle_doc)}

@api_router.put("/drivers/vehicles/{vehicle_id}")
@retry_on_db_error(max_attempts=3, base_delay=0.5, max_delay=5.0)
async def update_driver_vehicle(vehicle_id: str, payload: DriverVehiclePayload, current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    existing = await db.driver_vehicles.find_one({"driver_id": current_user["id"], "id": vehicle_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    now = get_ist_now()
    catalog_selection = await resolve_driver_vehicle_catalog_selection(payload)
    canonical_vehicle = catalog_selection["vehicle"]
    canonical_subtype = catalog_selection["subtype"]
    accepted_ride_types = (
        normalize_driver_accepted_ride_types(payload.accepted_ride_types, default=DEFAULT_DRIVER_ACCEPTED_RIDE_TYPES)
        if "accepted_ride_types" in payload.model_fields_set
        else normalize_driver_accepted_ride_types(
            existing.get("accepted_ride_types"),
            default=list(DRIVER_ACCEPTED_RIDE_TYPE_KEYS),
        )
    )
    updated_fields = {
        "make": payload.make,
        "model": payload.model,
        "year": payload.year,
        "color": payload.color or "",
        "license_plate": payload.license_plate.upper(),
        "registration_number": (payload.registration_number or payload.license_plate).upper(),
        "seating_capacity": payload.seating_capacity,
        "vehicle_type": payload.vehicle_type_id,
        "vehicle_type_id": payload.vehicle_type_id,
        "vehicle_subtype_id": payload.vehicle_subtype_id,
        "vehicle_type_name": canonical_vehicle.get("name"),
        "vehicle_subtype_name": canonical_subtype.get("name") if canonical_subtype else None,
        "vehicle_icon": canonical_vehicle.get("icon"),
        "capacity_unit": canonical_vehicle.get("capacity_unit", "passengers"),
        "accepted_ride_types": accepted_ride_types,
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
                "last_heartbeat_at": now_utc,
                "last_online_at": now_utc,
                "updated_at": now_utc,
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


def should_persist_driver_location(driver_id: str) -> bool:
    if DRIVER_LOCATION_PERSIST_MIN_INTERVAL_SECONDS <= 0:
        return True
    now_monotonic = time.monotonic()
    last_persisted_at = DRIVER_LOCATION_PERSIST_LAST_AT.get(driver_id)
    if last_persisted_at and now_monotonic - last_persisted_at < DRIVER_LOCATION_PERSIST_MIN_INTERVAL_SECONDS:
        return False
    DRIVER_LOCATION_PERSIST_LAST_AT[driver_id] = now_monotonic
    if len(DRIVER_LOCATION_PERSIST_LAST_AT) > max(1000, AUTH_USER_CACHE_MAX_ITEMS):
        DRIVER_LOCATION_PERSIST_LAST_AT.clear()
    return True


async def persist_driver_location_side_effects(
    driver_id: str,
    cached_location: Dict[str, Any],
    geo_location: Dict[str, Any],
    now_utc: datetime,
    latitude: float,
    longitude: float,
) -> None:
    async with DRIVER_LOCATION_PERSIST_SEMAPHORE:
        try:
            await _db_update_driver_location(
                driver_id,
                cached_location,
                geo_location,
                now_utc,
                latitude,
                longitude,
            )
            await cache_delete(f"driver_profile:{driver_id}")

            active_booking = await _db_get_active_booking(driver_id)
            if not active_booking:
                return

            booking_id = str(active_booking.get("id") or "")
            passenger_id = str(active_booking.get("passenger_id") or "")
            pickup = active_booking.get("pickup_location")
            drop = active_booking.get("drop_location") or active_booking.get("dropoff_location")
            payload = {
                "booking_id": booking_id,
                "driver_id": driver_id,
                "location": cached_location,
                "latitude": cached_location.get("latitude"),
                "longitude": cached_location.get("longitude"),
                "eta_to_pickup_min": calculate_eta_minutes(cached_location, pickup),
                "eta_to_drop_min": calculate_eta_minutes(cached_location, drop),
                "timestamp": now_utc.isoformat(),
            }
            await runtime_state.set_driver_active_booking(str(driver_id), booking_id)
            tracking_set, tracking_push = build_trip_distance_tracking_update(
                active_booking,
                cached_location,
                now_utc,
            )
            booking_set_fields = {
                "driver_live_location": cached_location,
                "driver_location": cached_location,
                "driver_eta_to_pickup_min": payload["eta_to_pickup_min"],
                "driver_eta_to_drop_min": payload["eta_to_drop_min"],
                "updated_at": now_utc,
                **tracking_set,
            }
            booking_update: Dict[str, Any] = {"$set": booking_set_fields}
            if tracking_push:
                booking_update["$push"] = {"trip_path_points": tracking_push}
            await db.bookings.update_one(
                {"id": booking_id},
                booking_update,
            )
            await clear_active_ride_cache(str(driver_id), passenger_id)
            for event_name in ("driver_location_changed", "driver_location", "driver_location_updated"):
                await sio.emit(event_name, payload, room=ride_room(booking_id))
                await sio.emit(event_name, payload, room=f"booking:{booking_id}")
                await emit_to_user(passenger_id, event_name, payload)
        except Exception:
            logger.exception("persist_driver_location_side_effects failed for driver_id=%s", driver_id)


@api_router.post("/drivers/location")
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
    driver_id = str(current_user["id"])
    await runtime_state.touch_driver_heartbeat(driver_id)

    if should_persist_driver_location(driver_id):
        if DRIVER_LOCATION_BACKGROUND_PERSIST:
            asyncio.create_task(
                persist_driver_location_side_effects(
                    driver_id,
                    cached_location,
                    geo_location,
                    now_utc,
                    latitude,
                    longitude,
                )
            )
        else:
            await persist_driver_location_side_effects(
                driver_id,
                cached_location,
                geo_location,
                now_utc,
                latitude,
                longitude,
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
    online_vehicle: Optional[Dict[str, Any]] = None,
):
    """Database operations for availability update with retry support."""
    set_fields = {
        "is_available": is_available,
        "is_online": is_available,
        "updated_at": now_utc,
        "last_online_at": now_utc if is_available else None,
        "last_offline_at": now_utc if not is_available else None,
        "last_heartbeat_at": now_utc if is_available else None,
    }
    if not is_available:
        set_fields["current_location"] = None
        set_fields["current_location_geo"] = None
        set_fields["online_vehicle_id"] = None
        set_fields["online_vehicle"] = None
    elif online_vehicle:
        vehicle_info = build_driver_vehicle_info(online_vehicle)
        set_fields.update(
            {
                "online_vehicle_id": str(online_vehicle.get("id") or ""),
                "online_vehicle": build_driver_vehicle_response(online_vehicle),
                "vehicle_info": vehicle_info,
                "auto_number": vehicle_info.get("vehicle_number"),
                "auto_registration_number": str(
                    online_vehicle.get("registration_number") or vehicle_info.get("vehicle_number") or ""
                ),
                "auto_model": vehicle_info.get("vehicle_model"),
                "auto_color": vehicle_info.get("vehicle_color"),
            }
        )

    await db.drivers.update_one(
        {"user_id": driver_id},
        {
            "$set": set_fields,
            "$setOnInsert": driver_insert_defaults,
        },
        upsert=True,
    )
    try:
        await db.driver_availability_events.insert_one(
            {
                "id": f"drv-avail-{uuid.uuid4()}",
                "driver_id": driver_id,
                "is_available": bool(is_available),
                "is_online": bool(is_available),
                "online_vehicle_id": str((online_vehicle or {}).get("id") or "") or None,
                "created_at": now_utc,
            }
        )
    except Exception as exc:
        logger.warning("Availability event log failed: %s", exc)


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
    driver_insert_defaults.pop("current_location", None)
    driver_insert_defaults.pop("current_location_geo", None)

    online_vehicle = None
    if availability.is_available:
        online_vehicle = await resolve_driver_online_vehicle_for_availability(
            current_user["id"],
            availability.vehicle_id,
        )

    try:
        # Update availability with retries
        await _db_update_driver_availability(
            current_user["id"],
            availability.is_available,
            now_utc,
            driver_insert_defaults,
            online_vehicle,
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

        confirmed_profile = await db.drivers.find_one({"user_id": current_user["id"]}) or {}
        if bool(confirmed_profile.get("is_available", False)) != bool(availability.is_available):
            await _db_update_driver_availability(
                current_user["id"],
                availability.is_available,
                now_utc,
                driver_insert_defaults,
                online_vehicle,
            )
            confirmed_profile = await db.drivers.find_one({"user_id": current_user["id"]}) or {}
        if not confirmed_profile:
            confirmed_profile = {
                "is_available": bool(availability.is_available),
                "is_online": bool(availability.is_available),
            }

        live_location = await runtime_state.get_driver_live_location(str(current_user["id"]))
        confirmed_location = live_location or confirmed_profile.get("current_location") or {}

        status_payload = {
            "driver_id": current_user["id"],
            "online": bool(availability.is_available),
            "is_available": bool(availability.is_available),
            "location": confirmed_location or None,
            "online_vehicle_id": confirmed_profile.get("online_vehicle_id"),
            "online_vehicle": confirmed_profile.get("online_vehicle"),
            "timestamp": now_utc.isoformat(),
        }
        try:
            await emit_to_user(current_user["id"], "driver_status_update", status_payload)
            await emit_to_user(current_user["id"], "availability_sync", status_payload)
            await emit_to_user(current_user["id"], "driver_availability_changed", status_payload)
        except Exception as exc:
            logger.warning("Failed to emit availability socket event for driver %s: %s", current_user["id"], exc)

        return {
            "message": "Availability updated",
            **build_driver_availability_response(
                confirmed_profile,
                confirmed_location,
                location_online=bool(live_location),
            ),
        }
    except (ServerSelectionTimeoutError, PyMongoError) as exc:
        logger.exception("Database error while updating driver availability: %s", exc)
        raise HTTPException(status_code=503, detail="Database unavailable. Please try again.")
    except Exception as exc:
        logger.exception("Error updating driver availability: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to update availability")

@api_router.get("/drivers/availability")
@retry_on_db_error(max_attempts=2, base_delay=0.3, max_delay=3.0)
async def get_driver_availability(current_user: dict = Depends(get_current_user)):
    """Get the current availability status of the driver."""
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can view their availability")
    
    profile = await db.drivers.find_one({"user_id": current_user["id"]}) or {}
    live_location = await get_effective_driver_location(profile)
    return build_driver_availability_response(
        profile,
        live_location,
        location_online=bool(live_location),
    )

@app.get("/drivers/status")
async def get_legacy_driver_status(current_user: dict = Depends(get_current_user)):
    """Legacy driver status alias for clients that still call /drivers/status."""
    return await get_driver_availability(current_user)

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
    country_code: Optional[str] = "IN",
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    radius: int = 50000,
):
    """Autocomplete using Nominatim (real OpenStreetMap data)"""
    text = str(input or "").strip()
    if len(text) < 3:
        return []

    # Validate latitude/longitude if provided
    if latitude is not None and longitude is not None:
        try:
            lat_float = float(latitude)
            lon_float = float(longitude)
            
            if not (-90 <= lat_float <= 90):
                raise HTTPException(status_code=400, detail="Invalid latitude: must be between -90 and 90")
            if not (-180 <= lon_float <= 180):
                raise HTTPException(status_code=400, detail="Invalid longitude: must be between -180 and 180")
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Invalid latitude or longitude: must be valid numbers")

    results = []
    
    # Use Nominatim for real data
    search_url = "https://nominatim.openstreetmap.org/search"
    
    params = {
        "q": text,
        "format": "json",
        "addressdetails": 1,
        "limit": 20,
    }
    
    # Add proximity bias if coordinates provided
    if latitude is not None and longitude is not None:
        params["viewbox"] = f"{longitude - 0.5},{latitude - 0.5},{longitude + 0.5},{latitude + 0.5}"
        params["bounded"] = 0  # Don't strictly bound, just prioritize
    
    try:
        headers = {"User-Agent": "AutoBuddy/1.0 (Passenger booking app)"}
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(search_url, params=params, headers=headers)
            response.raise_for_status()
            nominatim_results = response.json()
        
        logger.info(f"Nominatim search for '{text}' returned {len(nominatim_results)} results")
        
        # Convert Nominatim results to our format
        for result in nominatim_results:
            results.append({
                "placeId": str(result.get("place_id", "")),
                "description": result.get("display_name", result.get("name", "")),
                "name": result.get("name", ""),
                "address": result.get("display_name", result.get("name", "")),
                "latitude": float(result.get("lat", 0)),
                "longitude": float(result.get("lon", 0)),
            })
    except Exception as e:
        logger.warning(f"Nominatim API error: {e}")
        # Return empty list on error, frontend can handle gracefully
        return []
    
    # Return top 10 results
    return results[:10]

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

@api_router.get("/drivers/nearby", response_model=List[NearbyDriverResponse])
async def get_nearby_drivers(
    latitude: float,
    longitude: float,
    radius_km: Optional[float] = Query(default=None),
    drop_latitude: Optional[float] = None,
    drop_longitude: Optional[float] = None,
    vehicle_type_id: Optional[str] = Query(default=None),
    vehicle_subtype_id: Optional[str] = Query(default=None),
    ride_type: Optional[str] = Query(default=None),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
):
    """Get available drivers matching location, selected vehicle type, and ride type."""
    pricing = await get_pricing_rules()
    radius_cfg = get_driver_search_radius_config(pricing)
    base_radius_km = float(radius_cfg["base_radius_km"])
    long_radius_km = float(radius_cfg["long_radius_km"])
    strict_radius_requested = radius_km is not None
    requested_radius_km = max(0.5, float(radius_km if radius_km is not None else base_radius_km))
    primary_radius_km = min(requested_radius_km, base_radius_km)
    fallback_radius_km = primary_radius_km if strict_radius_requested else long_radius_km
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
    requested_vehicle_type = str(vehicle_type_id or "").strip().lower()
    requested_vehicle_subtype = str(vehicle_subtype_id or "").strip().lower()
    requested_ride_type = str(ride_type or "").strip().lower()
    requested_service = {
        "vehicle_type_id": requested_vehicle_type,
        "vehicle_subtype_id": requested_vehicle_subtype,
        "ride_type": requested_ride_type,
    }
    candidate_radius_km = fallback_radius_km if not strict_radius_requested else primary_radius_km
    available_drivers = await find_nearest_drivers_mongo_geo(
        {"latitude": latitude, "longitude": longitude},
        limit=80,
        max_distance_km=candidate_radius_km,
        vehicle_type_id=requested_vehicle_type,
        vehicle_subtype_id=requested_vehicle_subtype,
        ride_type=requested_ride_type,
        booking_context=requested_service,
        excluded_driver_ids=list(blocked_driver_ids),
    )
    if not available_drivers:
        available_drivers = await db.drivers.find({
            "is_available": True,
            "vehicle_info": {"$ne": None},
            "kyc_status": KYCStatus.APPROVED,
        }).to_list(120)
        if requested_ride_type == "women_only":
            available_drivers = await hydrate_driver_profiles_with_user_identity(available_drivers)

    nearby_drivers: List[Dict[str, Any]] = []
    primary_scored_drivers: List[Dict[str, Any]] = []
    fallback_scored_drivers: List[Dict[str, Any]] = []
    for driver in available_drivers:
        if not driver_matches_booking_service(driver, requested_service):
            continue
        if blocked_driver_ids and driver.get("user_id") in blocked_driver_ids:
            continue
        live_location = normalize_tracking_location(driver.get("current_location")) or await get_effective_driver_location(driver)
        if not live_location:
            continue
        try:
            driver_loc = Location(**live_location)
        except Exception:
            continue
        distance = safe_float(driver.get("distance_km"), None)
        if distance is None or not math.isfinite(distance):
            distance = calculate_distance(user_location, driver_loc)
        distance_payload = {**driver, "current_location": live_location, "distance": distance, "driver_loc": driver_loc}
        if distance <= primary_radius_km:
            primary_scored_drivers.append(distance_payload)
        if distance <= fallback_radius_km:
            fallback_scored_drivers.append(distance_payload)

    if primary_scored_drivers:
        nearby_drivers = primary_scored_drivers
    elif fallback_scored_drivers and not strict_radius_requested:
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
                selected_vehicle_type = requested_vehicle_type or get_driver_online_vehicle_type(driver)
                selected_vehicle_subtype = requested_vehicle_subtype or get_driver_online_vehicle_subtype(driver)
                vehicle_multiplier = get_vehicle_type_fare_multiplier(selected_vehicle_type, selected_vehicle_subtype)
                ride_type_multiplier = get_ride_type_fare_multiplier(requested_ride_type)
                base_route_fare = (
                    (effective_pricing.base_fare + (projected_distance_km * effective_pricing.per_km_rate))
                    * projected_time_multiplier
                )
                base_route_fare = max(base_route_fare, effective_pricing.minimum_fare)
                projected_fare = round(
                    (base_route_fare * vehicle_multiplier * ride_type_multiplier * float(driver.get("fare_multiplier", 1.0) or 1.0))
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
    return nearby[:5]

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
    include_availability: bool = Query(False),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.PASSENGER:
        raise HTTPException(status_code=403, detail="Only passengers can view favorite drivers")
    should_include_availability = bool(
        include_availability or (latitude is not None and longitude is not None)
    )
    excluded_driver_ids = (
        set(await get_excluded_driver_ids_for_passenger(current_user["id"]))
        if should_include_availability
        else set()
    )

    favorite_docs = await db.passenger_favorite_drivers.find(
        {"passenger_id": current_user["id"]}
    ).sort("updated_at", -1).to_list(100)
    driver_ids = [item.get("driver_id") for item in favorite_docs if item.get("driver_id")]
    if not driver_ids:
        return []

    drivers = await db.drivers.find({"user_id": {"$in": driver_ids}}).to_list(200)
    users = await db.users.find({"id": {"$in": driver_ids}}).to_list(200)
    users_by_id = {u["id"]: u for u in users}
    drivers_by_id = {d["user_id"]: d for d in drivers}
    favorite_docs_by_driver_id = {
        item.get("driver_id"): item for item in favorite_docs if item.get("driver_id")
    }

    active_driver_ids = set()
    if should_include_availability:
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
        driver = drivers_by_id.get(driver_id)
        user = users_by_id.get(driver_id)
        if not user:
            continue

        vehicle_info = driver.get("vehicle_info") if driver else None
        live_location = await get_effective_driver_location(driver) if driver and should_include_availability else None
        distance = None
        if live_location and pickup_loc:
            driver_loc = Location(**live_location)
            distance = calculate_distance(pickup_loc, driver_loc)

        kyc_status = driver.get("kyc_status") if driver else None
        is_approved = kyc_status in {KYCStatus.APPROVED, KYCStatus.APPROVED.value}
        in_active_ride = driver_id in active_driver_ids
        driver_online = bool(driver and driver.get("is_available", False))
        is_dispatch_available = bool(
            should_include_availability
            and driver_online
            and vehicle_info
            and is_approved
            and live_location
            and not in_active_ride
        )
        favorite_doc = favorite_docs_by_driver_id.get(driver_id) or {}
        results.append(
            {
                "driver_id": driver_id,
                "name": user.get("name", "Unknown"),
                "phone": user.get("phone", ""),
                "vehicle_info": vehicle_info,
                "rating": float(driver.get("rating", 5.0)) if driver else 5.0,
                "distance_km": distance,
                "fare_multiplier": float(driver.get("fare_multiplier", 1.0)) if driver else 1.0,
                "location": live_location,
                "is_available": is_dispatch_available,
                "is_favorite": True,
                "has_driver_profile": bool(driver),
                "has_live_location": bool(live_location),
                "is_dispatch_available": is_dispatch_available,
                "in_active_ride": in_active_ride,
                "favorite_since": favorite_doc.get("created_at"),
                "updated_at": favorite_doc.get("updated_at"),
            }
        )

    if should_include_availability:
        results.sort(
            key=lambda item: (
                0 if item.get("is_dispatch_available") else 1,
                99999 if item.get("distance_km") is None else item["distance_km"],
                str(item.get("name") or ""),
            )
        )
    return results

@api_router.get("/drivers/pending-requests")
async def get_pending_requests(current_user: dict = Depends(get_current_user)):
    """Get pending booking requests for driver"""
    if current_user["role"] != UserRole.DRIVER:
        raise HTTPException(status_code=403, detail="Only drivers can access this")
    driver_service_profile = await db.drivers.find_one(
        {"user_id": current_user["id"]},
        {
            "_id": 0,
            "vehicle_info": 1,
            "online_vehicle": 1,
            "online_vehicle_id": 1,
            "is_available": 1,
            "rating": 1,
            "average_rating": 1,
            "rental_rating": 1,
            "rental_enabled": 1,
            "gender": 1,
            "kyc_status": 1,
            "kyc_verified": 1,
            "vehicle_verified": 1,
            "vehicle_verification_status": 1,
            "police_verified": 1,
            "police_verification_status": 1,
            "background_check_status": 1,
            "safety_score": 1,
            "women_only_safety_score": 1,
            "trusted_safety_driver": 1,
            "women_only_trusted_driver": 1,
            "active_complaints": 1,
            "open_safety_complaints": 1,
            "safety_complaint_count": 1,
            "current_location": 1,
            "live_location_enabled": 1,
            "location_sharing_enabled": 1,
            "tourism_rating": 1,
            "tourism_enabled": 1,
            "languages": 1,
            "language_codes": 1,
            "district": 1,
            "city": 1,
            "tourism_cities": 1,
            "service_cities": 1,
            "local_areas": 1,
            "districts": 1,
            "accepted_ride_types": 1,
        },
    ) or {}
    driver_service_profile = {
        **driver_service_profile,
        "gender": driver_service_profile.get("gender") or current_user.get("gender"),
        "name": driver_service_profile.get("name") or current_user.get("name"),
        "user_id": driver_service_profile.get("user_id") or current_user.get("id"),
    }
    cache_vehicle_key = str(
        driver_service_profile.get("online_vehicle_id")
        or get_driver_online_vehicle_type(driver_service_profile)
        or "none"
    ).strip()
    accepted_ride_type_key = ",".join(get_driver_accepted_ride_types(driver_service_profile) or ["legacy"])
    cache_key = f"driver_pending_requests:{current_user['id']}:{cache_vehicle_key}:{accepted_ride_type_key}"
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
    pending = [
        booking
        for booking in pending
        if driver_matches_booking_service(driver_service_profile, booking)
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


BOOKING_TYPE_PRODUCT_ALIASES = {
    "rental_ride": "rental_hourly",
    "women_only_ride": "women_only",
    "tourism_ride": "tourism",
    "tourism_booking": "tourism",
}

PRODUCT_SIDECAR_COLLECTIONS = {
    "rental": "rental_rides",
    "rental_hourly": "rental_rides",
    "women_only": "women_only_rides",
    "tourism": "tourism_bookings",
}

PRODUCT_SIDECAR_STATUS_MAP = {
    "rental": {
        "accepted": "accepted",
        "driver_arrived": "driver_arrived",
        "in_progress": "started",
        "completed": "completed",
        "cancelled": "cancelled",
    },
    "rental_hourly": {
        "accepted": "accepted",
        "driver_arrived": "driver_arrived",
        "in_progress": "started",
        "completed": "completed",
        "cancelled": "cancelled",
    },
    "women_only": {
        "accepted": "accepted",
        "driver_arrived": "pickup_otp_pending",
        "in_progress": "started",
        "completed": "completed",
        "cancelled": "cancelled",
    },
    "tourism": {
        "accepted": "accepted",
        "driver_arrived": "driver_arrived",
        "in_progress": "in_progress",
        "completed": "completed",
        "cancelled": "cancelled",
    },
}


def normalize_status_text(value: Any) -> str:
    text = str(enum_response_value(value) or "").strip().lower()
    if "." in text:
        text = text.rsplit(".", 1)[-1]
    return text.replace("-", "_").replace(" ", "_")


def booking_product_key(booking: Optional[Dict[str, Any]]) -> str:
    source = booking or {}
    for raw in (source.get("ride_product"), source.get("ride_type"), source.get("booking_type")):
        key = str(enum_response_value(raw) or "").strip().lower()
        if not key:
            continue
        if "." in key:
            key = key.rsplit(".", 1)[-1]
        key = key.replace("-", "_").replace(" ", "_")
        return BOOKING_TYPE_PRODUCT_ALIASES.get(key, key)
    return ""


def first_present(*values: Any) -> Any:
    for value in values:
        if value is not None and value != "":
            return value
    return None


async def calculate_rental_completion_fare_for_booking(
    booking: Dict[str, Any],
    actual_distance_km: float,
    completed_at: datetime,
) -> Optional[Dict[str, Any]]:
    if booking_product_key(booking) not in {"rental", "rental_hourly"}:
        return None
    booking_id = str(booking.get("id") or booking.get("booking_id") or "").strip()
    sidecar = await db.rental_rides.find_one({"booking_id": booking_id}, {"_id": 0}) if booking_id else None
    sidecar = sidecar or {}
    details = booking.get("rental_details") if isinstance(booking.get("rental_details"), dict) else {}
    started_at = first_present(sidecar.get("started_at"), booking.get("trip_started_at"), booking.get("started_at"))
    if not started_at:
        return None
    try:
        fare = calculate_rental_final_fare(
            base_fare=first_present(sidecar.get("base_fare"), details.get("base_fare"), booking.get("estimated_fare")),
            package_hours=first_present(
                sidecar.get("package_hours"),
                details.get("package_hours"),
                booking.get("rental_package_hours"),
                booking.get("rental_hours"),
            ),
            included_km=first_present(sidecar.get("included_km"), details.get("included_km"), booking.get("rental_included_km")),
            extra_km_rate=first_present(sidecar.get("extra_km_rate"), details.get("extra_km_rate")),
            extra_15_min_rate=first_present(sidecar.get("extra_15_min_rate"), details.get("extra_15_min_rate")),
            actual_distance_km=actual_distance_km,
            started_at=started_at,
            completed_at=completed_at,
        )
    except Exception:
        logger.exception("Rental fare calculation failed for booking_id=%s", booking_id)
        return None
    fare["package_base_fare"] = safe_float(first_present(sidecar.get("base_fare"), details.get("base_fare"), booking.get("estimated_fare")), 0.0)
    fare["package_hours"] = safe_float(first_present(sidecar.get("package_hours"), details.get("package_hours"), booking.get("rental_package_hours")), 0.0)
    fare["extra_km_rate"] = safe_float(first_present(sidecar.get("extra_km_rate"), details.get("extra_km_rate")), 0.0)
    fare["extra_15_min_rate"] = safe_float(first_present(sidecar.get("extra_15_min_rate"), details.get("extra_15_min_rate")), 0.0)
    return fare


async def sync_booking_product_sidecar_status(
    booking: Optional[Dict[str, Any]],
    status: Any,
    *,
    set_fields: Optional[Dict[str, Any]] = None,
    push_history: bool = True,
) -> None:
    product_key = booking_product_key(booking)
    collection_name = PRODUCT_SIDECAR_COLLECTIONS.get(product_key)
    booking_id = str((booking or {}).get("id") or (booking or {}).get("booking_id") or "").strip()
    if not collection_name or not booking_id:
        return

    status_value = normalize_status_text(status)
    sidecar_status = PRODUCT_SIDECAR_STATUS_MAP.get(product_key, {}).get(status_value, status_value)
    update_fields = dict(set_fields or {})
    now = update_fields.get("updated_at") or get_ist_now()
    update_fields["updated_at"] = now
    if sidecar_status:
        update_fields["status"] = sidecar_status

    update_doc: Dict[str, Any] = {"$set": update_fields}
    if push_history and sidecar_status:
        update_doc["$push"] = {
            "status_history": {
                "status": sidecar_status,
                "booking_status": status_value,
                "at": now,
            }
        }
    try:
        await db[collection_name].update_one({"booking_id": booking_id}, update_doc)
    except Exception:
        logger.exception("Product sidecar sync failed for booking_id=%s collection=%s", booking_id, collection_name)


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
    now_utc = as_utc_naive(now) or get_ist_now()
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
    driver_service_profile = await db.drivers.find_one(
        {"user_id": current_user["id"]},
        {
            "_id": 0,
            "user_id": 1,
            "name": 1,
            "gender": 1,
            "vehicle_info": 1,
            "online_vehicle": 1,
            "online_vehicle_id": 1,
            "is_available": 1,
            "vehicle_type": 1,
            "vehicle_type_id": 1,
            "vehicle_subtype_id": 1,
            "rating": 1,
            "average_rating": 1,
            "rental_rating": 1,
            "rental_enabled": 1,
            "kyc_status": 1,
            "kyc_verified": 1,
            "vehicle_verified": 1,
            "vehicle_verification_status": 1,
            "police_verified": 1,
            "police_verification_status": 1,
            "background_check_status": 1,
            "safety_score": 1,
            "women_only_safety_score": 1,
            "trusted_safety_driver": 1,
            "women_only_trusted_driver": 1,
            "active_complaints": 1,
            "open_safety_complaints": 1,
            "safety_complaint_count": 1,
            "current_location": 1,
            "live_location_enabled": 1,
            "location_sharing_enabled": 1,
            "accepted_ride_types": 1,
            "tourism_rating": 1,
            "tourism_enabled": 1,
            "languages": 1,
            "language_codes": 1,
            "district": 1,
            "city": 1,
            "tourism_cities": 1,
            "service_cities": 1,
            "local_areas": 1,
            "districts": 1,
        },
    ) or {}
    driver_service_profile = {
        **driver_service_profile,
        "gender": driver_service_profile.get("gender") or current_user.get("gender"),
        "name": driver_service_profile.get("name") or current_user.get("name"),
        "user_id": driver_service_profile.get("user_id") or current_user.get("id"),
    }

    scheduled_requests = [
        booking for booking in scheduled_requests
        if booking.get("passenger_id") not in blocked_passenger_ids
        and booking.get("passenger_id") not in passengers_blocked_driver_ids
        and driver_matches_booking_service(driver_service_profile, booking)
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
    cancellation_fee_rides = await db.bookings.find({
        "driver_id": current_user["id"],
        "status": BookingStatus.CANCELLED,
        "cancellation_fee_applied": True,
    }).to_list(5000)

    now = get_ist_now()
    today_start = as_utc_naive(now.replace(hour=0, minute=0, second=0, microsecond=0))
    week_start = as_utc_naive(now - timedelta(days=7))
    month_start = as_utc_naive(now.replace(day=1, hour=0, minute=0, second=0, microsecond=0))

    def ride_updated_at(ride: Dict[str, Any]) -> datetime:
        value = ride.get("updated_at") or ride.get("created_at") or datetime.min
        normalized = as_utc_naive(value) if isinstance(value, (datetime, str)) else None
        return normalized or datetime.min

    def driver_earning_value(ride: Dict[str, Any]) -> float:
        if enum_response_value(ride.get("status")) == BookingStatus.CANCELLED.value:
            return round(float(ride.get("cancellation_fee") or 0.0), 2)
        return booking_fare_value(ride)

    earning_rides = completed_rides + cancellation_fee_rides
    total_earnings = sum(driver_earning_value(ride) for ride in earning_rides)
    total_rides = len(completed_rides)
    today_rides = [ride for ride in completed_rides if ride_updated_at(ride) >= today_start]
    weekly_rides = [ride for ride in completed_rides if ride_updated_at(ride) >= week_start]
    monthly_rides = [ride for ride in completed_rides if ride_updated_at(ride) >= month_start]
    today_earning_rides = [ride for ride in earning_rides if ride_updated_at(ride) >= today_start]
    weekly_earning_rides = [ride for ride in earning_rides if ride_updated_at(ride) >= week_start]
    monthly_earning_rides = [ride for ride in earning_rides if ride_updated_at(ride) >= month_start]
    cancellation_earnings = round(sum(driver_earning_value(ride) for ride in cancellation_fee_rides), 2)
    payout_overview = await build_driver_payout_overview(current_user["id"], limit=8)

    return {
        "total_earnings": round(total_earnings, 2),
        "total_rides": total_rides,
        "today_earnings": round(sum(driver_earning_value(ride) for ride in today_earning_rides), 2),
        "today_rides": len(today_rides),
        "weekly_earnings": round(sum(driver_earning_value(ride) for ride in weekly_earning_rides), 2),
        "weekly_rides": len(weekly_rides),
        "monthly_earnings": round(sum(driver_earning_value(ride) for ride in monthly_earning_rides), 2),
        "monthly_rides": len(monthly_rides),
        "cancellation_earnings": cancellation_earnings,
        "cancellation_fee_rides": len(cancellation_fee_rides),
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
    await ensure_passenger_booking_compliance(current_user)

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
    dispatch_candidate_queue: List[str] = []
    dispatch_expires_at: Optional[datetime] = None

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
        if str(booking.ride_type or "").strip().lower() == "women_only":
            hydrated_profiles = await hydrate_driver_profiles_with_user_identity([selected_driver_profile])
            selected_driver_profile = hydrated_profiles[0] if hydrated_profiles else selected_driver_profile
        selected_service = {
            "vehicle_type_id": booking.vehicle_type_id,
            "vehicle_subtype_id": booking.vehicle_subtype_id,
            "ride_product": booking.ride_type or "normal",
        }
        if not driver_matches_booking_service(selected_driver_profile, selected_service):
            raise HTTPException(status_code=400, detail="Selected driver does not match the requested vehicle or ride type")
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
        dispatch_candidate_queue = [selected_driver_id]
    elif not is_scheduled:
        booking_preview = {
            "id": booking_id,
            "passenger_id": current_user["id"],
            "pickup_location": booking.pickup_location.dict(),
            "drop_location": booking.drop_location.dict(),
            "estimated_fare": round(route_fare, 2),
            "vehicle_type_id": booking.vehicle_type_id,
            "vehicle_subtype_id": booking.vehicle_subtype_id,
            "ride_product": booking.ride_type or "normal",
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
        dispatch_candidate_queue = [item["driver_id"] for item in ranked_drivers]
        candidate_driver_ids = dispatch_candidate_queue[:1]
        dispatch_ai_ranked_drivers = ranked_drivers[:10]
        if candidate_driver_ids:
            dispatch_status = "awaiting_driver_acceptance"
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
            vehicle_type_id=booking.vehicle_type_id,
            vehicle_subtype_id=booking.vehicle_subtype_id,
            ride_type=booking.ride_type or "normal",
        )
        candidate_driver_ids = [item["user_id"] for item in scheduled_candidates]
        dispatch_candidate_queue = list(candidate_driver_ids)

    if (not is_scheduled) and candidate_driver_ids:
        dispatch_expires_at = now + timedelta(seconds=DISPATCH_DRIVER_ACCEPTANCE_TIMEOUT_SECONDS)
        dispatch_status = "awaiting_driver_acceptance"

    effective_pricing_for_estimate = selected_driver_pricing or pricing
    route_fare_for_estimate = (effective_pricing_for_estimate.base_fare + (distance * effective_pricing_for_estimate.per_km_rate)) * time_multiplier
    route_fare_for_estimate = max(route_fare_for_estimate, effective_pricing_for_estimate.minimum_fare)
    estimated_fare = round(route_fare_for_estimate, 2)
    if (not selected_driver_id) and (not is_scheduled):
        estimated_fare = round(estimated_fare * surge_multiplier, 2)
    
    vehicle_type_multiplier = get_vehicle_type_fare_multiplier(booking.vehicle_type_id, booking.vehicle_subtype_id)
    ride_type_multiplier = get_ride_type_fare_multiplier(booking.ride_type)
    estimated_fare = round(estimated_fare * vehicle_type_multiplier * ride_type_multiplier, 2)

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
        "vehicle_subtype_id": booking.vehicle_subtype_id,
        "ride_type": booking.ride_type or "normal",
        "ride_type_multiplier": ride_type_multiplier,
        "dispatch_algorithm": dispatch_algorithm,
        "dispatch_status": dispatch_status,
        "dispatch_candidate_queue": dispatch_candidate_queue,
        "dispatch_attempted_driver_ids": candidate_driver_ids[:] if (not is_scheduled) else [],
        "current_dispatch_driver_id": candidate_driver_ids[0] if ((not is_scheduled) and candidate_driver_ids) else None,
        "dispatch_expires_at": dispatch_expires_at,
        "dispatch_acceptance_timeout_seconds": DISPATCH_DRIVER_ACCEPTANCE_TIMEOUT_SECONDS,
        "dispatch_attempt_count": 1 if ((not is_scheduled) and candidate_driver_ids) else 0,
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
        if candidate_driver_ids and dispatch_expires_at:
            await record_dispatch_attempt_sent(
                booking_id,
                candidate_driver_ids[0],
                sequence=1,
                expires_at=dispatch_expires_at,
                reason="booking_created",
            )
            await enqueue_ride(booking_id, priority=DISPATCH_DRIVER_ACCEPTANCE_TIMEOUT_SECONDS)
        else:
            await enqueue_ride(booking_id, priority=dispatch_queue_priority_for_booking(booking_dict))

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
                body="We sent your request to the best nearby driver and will retry automatically if needed.",
                data={
                    "booking_id": booking_id,
                    "candidate_driver_ids": candidate_driver_ids,
                    "dispatch_expires_at": dispatch_expires_at.isoformat() if dispatch_expires_at else None,
                },
            )
            asyncio.create_task(retry_auto_assignment_for_pending_booking(booking_id))
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


def normalize_booking_enum_value(value: Any, enum_cls: type[Enum], default: str) -> str:
    raw_value = enum_response_value(value)
    normalized = str(raw_value or "").strip()
    if "." in normalized:
        normalized = normalized.split(".")[-1]
    normalized = normalized.lower()
    valid_values = {item.value for item in enum_cls}
    return normalized if normalized in valid_values else default


def booking_response_location(value: Any, fallback_address: str) -> Location:
    if isinstance(value, dict):
        latitude = value.get("latitude", value.get("lat"))
        longitude = value.get("longitude", value.get("lng"))
        try:
            return Location(
                latitude=float(latitude),
                longitude=float(longitude),
                address=value.get("address") or value.get("name") or fallback_address,
            )
        except (TypeError, ValueError):
            pass
    return Location(latitude=0.0, longitude=0.0, address=fallback_address)


def booking_response_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value if value is not None else default)
    except (TypeError, ValueError):
        return default


def booking_response_datetime(value: Any, fallback: datetime) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return fallback
    return fallback


def booking_response_vehicle_info(driver_profile: Optional[Dict[str, Any]]) -> Optional[VehicleInfo]:
    if not driver_profile or not isinstance(driver_profile.get("vehicle_info"), dict):
        return None
    try:
        return VehicleInfo(**driver_profile["vehicle_info"])
    except Exception as exc:
        logger.warning(
            "Skipping invalid vehicle_info on booking history response for driver_id=%s: %s",
            driver_profile.get("user_id"),
            exc,
        )
        return None


def build_booking_history_response(
    booking: Dict[str, Any],
    passenger: Optional[Dict[str, Any]],
    driver: Optional[Dict[str, Any]],
    driver_profile: Optional[Dict[str, Any]],
) -> BookingResponse:
    now = get_ist_now()
    created_at = booking_response_datetime(booking.get("created_at"), now)
    updated_at = booking_response_datetime(booking.get("updated_at"), created_at)
    booking_id = str(booking.get("id") or booking.get("_id") or uuid.uuid4())
    passenger_id = str(booking.get("passenger_id") or "")
    if not passenger_id:
        raise ValueError("booking is missing passenger_id")

    return BookingResponse(
        id=booking_id,
        passenger_id=passenger_id,
        passenger_name=passenger.get("name") if passenger else None,
        driver_id=booking.get("driver_id"),
        driver_name=driver.get("name") if driver else None,
        driver_phone=driver.get("phone") if driver else None,
        vehicle_info=booking_response_vehicle_info(driver_profile),
        pickup_location=booking_response_location(booking.get("pickup_location"), "Pickup unavailable"),
        drop_location=booking_response_location(booking.get("drop_location"), "Drop unavailable"),
        status=normalize_booking_enum_value(booking.get("status"), BookingStatus, BookingStatus.PENDING.value),
        estimated_fare=booking_response_float(booking.get("estimated_fare")),
        pickup_surcharge=booking_response_float(booking.get("pickup_surcharge")),
        extra_pickup_distance_km=booking_response_float(booking.get("extra_pickup_distance_km")),
        final_fare=booking_response_float(booking.get("final_fare")) if booking.get("final_fare") is not None else None,
        actual_distance_km=booking_response_float(booking.get("actual_distance_km")),
        distance_km=booking_response_float(booking.get("distance_km")),
        payment_method=normalize_booking_enum_value(booking.get("payment_method"), PaymentMethod, PaymentMethod.CASH.value),
        scheduled_for=booking_response_datetime(booking.get("scheduled_for"), now) if booking.get("scheduled_for") else None,
        created_at=created_at,
        updated_at=updated_at,
        route_polyline=[
            booking_response_location(point, "Route point")
            for point in (booking.get("route_polyline") or [])
            if isinstance(point, dict)
        ] or None,
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
    passenger_ids = list(set([b.get("passenger_id") for b in bookings if b.get("passenger_id")]))
    driver_ids = list(set([b["driver_id"] for b in bookings if b.get("driver_id")]))
    all_user_ids = list(set(passenger_ids + driver_ids))
    
    # Fetch all users and drivers in batch
    users = {u["id"]: u for u in await db.users.find({"id": {"$in": all_user_ids}}).to_list(None)} if all_user_ids else {}
    driver_profiles = {d["user_id"]: d for d in await db.drivers.find({"user_id": {"$in": driver_ids}}).to_list(None)} if driver_ids else {}
    
    results = []
    for b in bookings:
        passenger = users.get(b.get("passenger_id"))
        driver = users.get(b.get("driver_id")) if b.get("driver_id") else None
        driver_profile = driver_profiles.get(b.get("driver_id")) if b.get("driver_id") else None
        try:
            results.append(build_booking_history_response(b, passenger, driver, driver_profile))
        except Exception as exc:
            logger.warning(
                "Skipping malformed booking in /bookings response: booking_id=%s error=%s",
                b.get("id") or b.get("_id"),
                exc,
            )
    
    return results

@api_router.get("/bookings/active")
@retry_on_db_error(max_attempts=3, base_delay=0.5, max_delay=5.0)
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
        passenger_id = booking.get("passenger_id")
        driver_id = booking.get("driver_id")
        passenger = await db.users.find_one({"id": passenger_id}) if passenger_id else None
        driver = await db.users.find_one({"id": booking.get("driver_id")}) if booking.get("driver_id") else None
        driver_profile = await db.drivers.find_one({"user_id": driver_id}) if driver_id else None
        driver_live_location = await get_effective_driver_location(driver_profile) if driver_profile else None

        payload = dict(booking)
        if payload.get("_id") is not None:
            payload["_id"] = str(payload["_id"])
        payload = {
            **payload,
            "passenger_name": passenger.get("name") if passenger else None,
            "passenger_phone": passenger.get("phone") if passenger else None,
            "driver_name": driver.get("name") if driver else None,
            "driver_phone": driver.get("phone") if driver else None,
            "vehicle_info": driver_profile.get("vehicle_info") if driver_profile and driver_profile.get("vehicle_info") else None,
            "driver_live_location": driver_live_location,
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
    waiting_charge = receipt_money(booking.get("waiting_charge"))
    cancellation_fee = receipt_money(booking.get("cancellation_fee"))
    tax_amount = receipt_money(booking.get("tax_amount") or booking.get("taxes") or booking.get("gst_amount"))
    discount = receipt_money(booking.get("discount"))
    route_fare = receipt_money(
        booking.get("base_route_fare")
        or booking.get("base_estimated_fare")
        or max(0.0, total - pickup_surcharge - waiting_charge - tax_amount + discount)
    )
    distance_km = receipt_money(booking.get("actual_distance_km") or booking.get("distance_km"))
    created_at = booking.get("trip_completed_at") or booking.get("updated_at") or booking.get("created_at") or get_ist_now()
    status_value = enum_response_value(booking.get("status"))
    payment_status = normalized_enum_text(booking.get("payment_status"))
    if not payment_status:
        payment_status = (
            PaymentOrderStatus.PAID.value
            if booking_payment_satisfied(booking)
            else "pending"
        )

    breakdown = []
    if cancellation_fee > 0 and status_value == BookingStatus.CANCELLED.value:
        breakdown.append({"label": "Cancellation minimum fare", "amount": cancellation_fee})
    else:
        breakdown.append({"label": "Route fare", "amount": route_fare})
    if pickup_surcharge > 0:
        breakdown.append({"label": "Pickup surcharge", "amount": pickup_surcharge})
    if waiting_charge > 0:
        breakdown.append({"label": "Waiting charge", "amount": waiting_charge})
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
    
    if booking_status_value(booking.get("status")) != BookingStatus.PENDING.value:
        raise HTTPException(status_code=400, detail="Booking is no longer available")
    candidate_driver_ids = booking.get("candidate_driver_ids") or []
    if candidate_driver_ids and current_user["id"] not in candidate_driver_ids:
        raise HTTPException(status_code=403, detail="This booking request is not assigned to you")
    if await is_driver_passenger_pair_blocked(booking.get("passenger_id"), current_user["id"]):
        raise HTTPException(status_code=403, detail="You cannot accept this ride because this passenger is blocked")
    
    pricing = await get_pricing_rules()
    # Get driver's fare multiplier
    driver_profile = await db.drivers.find_one({"user_id": current_user["id"]})
    driver_identity = {
        **(driver_profile or {}),
        "gender": (driver_profile or {}).get("gender") or current_user.get("gender"),
        "name": (driver_profile or {}).get("name") or current_user.get("name"),
        "user_id": (driver_profile or {}).get("user_id") or current_user.get("id"),
    }
    if not driver_matches_booking_service(driver_identity, booking):
        raise HTTPException(status_code=403, detail="Driver does not meet this ride product's service requirements")
    fare_multiplier = float(driver_profile.get("fare_multiplier", 1.0)) if driver_profile else 1.0
    effective_pricing = await get_effective_pricing_for_driver_profile(driver_profile, pricing)
    driver_live_location = await get_effective_driver_location(driver_profile) if driver_profile else None
    pickup_charge = compute_driver_pickup_charge(
        driver_location=driver_live_location,
        pickup_location=booking.get("pickup_location") or {},
        pricing=effective_pricing,
    )
    accepted_at = get_ist_now()
    await db.dispatch_attempts.update_one(
        {
            "booking_id": booking_id,
            "driver_id": current_user["id"],
        },
        {
            "$set": {
                "response": "accepted",
                "responded_at": accepted_at,
                "updated_at": accepted_at,
            },
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "booking_id": booking_id,
                "driver_id": current_user["id"],
                "created_at": accepted_at,
            },
        },
        upsert=True,
    )
    await update_driver_dispatch_response_metrics(current_user["id"], "accepted", accepted_at)
    
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
    
    assign_result = await db.bookings.update_one(
        {
            "id": booking_id,
            "status": {"$in": [BookingStatus.PENDING, BookingStatus.PENDING.value]},
            "driver_id": None,
        },
        {
            "$set": {
                "driver_id": current_user["id"],
                "status": BookingStatus.ACCEPTED.value,
                "candidate_driver_ids": [],
                "current_dispatch_driver_id": current_user["id"],
                "dispatch_expires_at": None,
                "base_route_fare": round(base_route_fare, 2),
                "estimated_fare": final_estimated_fare,
                "pickup_surcharge": float(pickup_charge["pickup_surcharge"]),
                "extra_pickup_distance_km": float(pickup_charge["extra_pickup_distance_km"]),
                "driver_to_pickup_distance_km": float(pickup_charge["driver_distance_km"]),
                "driver_live_location": driver_live_location,
                "driver_location": driver_live_location,
                "driver_eta_to_pickup_min": calculate_eta_minutes(
                    driver_live_location,
                    booking.get("pickup_location"),
                ),
                "driver_eta_to_drop_min": calculate_eta_minutes(
                    driver_live_location,
                    booking.get("drop_location") or booking.get("dropoff_location"),
                ),
                "dispatch_status": "accepted",
                "accepted_driver_score_updated_at": accepted_at,
                "assigned_at": accepted_at,
                "updated_at": accepted_at
            },
            "$push": {
                "dispatch_attempt_history": {
                    "driver_id": current_user["id"],
                    "response": "accepted",
                    "at": accepted_at,
                }
            }
        }
    )
    if assign_result.modified_count != 1:
        raise HTTPException(status_code=409, detail="Booking was already assigned")
    await sync_booking_product_sidecar_status(
        booking,
        BookingStatus.ACCEPTED,
        set_fields={
            "driver_id": current_user["id"],
            "dispatch_status": "accepted",
            "accepted_at": get_ist_now(),
            "estimated_fare": final_estimated_fare,
        },
    )
    
    await remove_ride_from_queue(booking_id)
    await clear_driver_pending_request_cache(
        list(set((booking.get("candidate_driver_ids") or []) + [current_user["id"]]))
    )
    await runtime_state.set_driver_active_booking(str(current_user["id"]), booking_id)
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
        {"$set": {"is_available": False, "last_assigned_at": accepted_at}, "$inc": {"assigned_count": 1}}
    )
    await cache_delete(f"driver_profile:{current_user['id']}")

    status_payload = {
        "booking_id": booking_id,
        "status": BookingStatus.ACCEPTED.value,
        "timestamp": get_ist_now().isoformat(),
    }
    await sio.emit("booking_status_changed", status_payload, room=ride_room(booking_id))
    await sio.emit("booking_status_changed", status_payload, room=f"booking:{booking_id}")
    await emit_to_user(booking["passenger_id"], "booking_status_changed", status_payload)
    await emit_to_user(current_user["id"], "booking_status_changed", status_payload)
    if driver_live_location:
        location_payload = {
            "booking_id": booking_id,
            "driver_id": current_user["id"],
            "location": driver_live_location,
            "latitude": driver_live_location.get("latitude"),
            "longitude": driver_live_location.get("longitude"),
            "eta_to_pickup_min": calculate_eta_minutes(driver_live_location, booking.get("pickup_location")),
            "eta_to_drop_min": calculate_eta_minutes(
                driver_live_location,
                booking.get("drop_location") or booking.get("dropoff_location"),
            ),
            "timestamp": get_ist_now().isoformat(),
        }
        for event_name in ("driver_location_changed", "driver_location", "driver_location_updated"):
            await sio.emit(event_name, location_payload, room=ride_room(booking_id))
            await sio.emit(event_name, location_payload, room=f"booking:{booking_id}")
            await emit_to_user(booking["passenger_id"], event_name, location_payload)
            await emit_to_user(current_user["id"], event_name, location_payload)
    await emit_ride_sync_state(booking_id)
    await notify_user(
        booking["passenger_id"],
        title="Ride Accepted",
        body=f"{current_user.get('name', 'Your driver')} accepted your ride.",
        data={"booking_id": booking_id, "status": BookingStatus.ACCEPTED.value},
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
    if booking_status_value(booking.get("status")) != BookingStatus.PENDING.value:
        raise HTTPException(status_code=400, detail="Booking is no longer available")

    candidate_driver_ids = booking.get("candidate_driver_ids") or []
    if candidate_driver_ids and current_user["id"] not in candidate_driver_ids:
        raise HTTPException(status_code=403, detail="This booking request is not assigned to you")

    rejected_at = get_ist_now()
    await db.dispatch_attempts.update_one(
        {
            "booking_id": booking_id,
            "driver_id": current_user["id"],
        },
        {
            "$set": {
                "response": "rejected",
                "responded_at": rejected_at,
                "updated_at": rejected_at,
            },
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "booking_id": booking_id,
                "driver_id": current_user["id"],
                "created_at": rejected_at,
            },
        },
        upsert=True,
    )
    await update_driver_dispatch_response_metrics(current_user["id"], "rejected", rejected_at)
    attempted = ordered_unique_driver_ids(
        list(dispatch_attempted_driver_ids(booking)) + [current_user["id"]]
    )
    await db.bookings.update_one(
        {"id": booking_id},
        {
            "$set": {
                "dispatch_status": "driver_rejected",
                "dispatch_attempted_driver_ids": attempted,
                "current_dispatch_driver_id": None,
                "dispatch_expires_at": None,
                "updated_at": rejected_at,
            },
            "$push": {
                "dispatch_attempt_history": {
                    "driver_id": current_user["id"],
                    "response": "rejected",
                    "at": rejected_at,
                }
            },
            "$pull": {"candidate_driver_ids": current_user["id"]},
        },
    )
    await cache_delete(f"driver_pending_requests:{current_user['id']}")
    dispatched_next = await dispatch_next_candidate_for_booking(
        booking_id,
        reason="driver_rejected",
        extra_excluded_driver_ids=[current_user["id"]],
    )
    if not dispatched_next:
        await enqueue_ride(booking_id, priority=dispatch_queue_priority_for_booking(booking))
        asyncio.create_task(retry_auto_assignment_for_pending_booking(booking_id))
    await notify_user(
        booking["passenger_id"],
        title="Finding Another Driver",
        body=(
            "A driver declined your ride. We sent it to the next best nearby driver."
            if dispatched_next
            else "A driver declined your ride. We are finding another nearby driver."
        ),
        data={"booking_id": booking_id, "next_driver_dispatched": dispatched_next},
    )
    return {
        "message": "Ride rejected. Searching another driver.",
        "booking_id": booking_id,
        "next_driver_dispatched": dispatched_next,
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
    current_status = booking_status_value(booking.get("status"))
    target_status = booking_status_value(status_update.status)
    was_already_completed = current_status == BookingStatus.COMPLETED.value
    passenger_id = str(
        booking.get("passenger_id")
        or booking.get("user_id")
        or booking.get("customer_id")
        or ""
    ).strip()
    driver_id = str(booking.get("driver_id") or "").strip()

    if current_user["role"] != UserRole.ADMIN:
        if current_user["role"] != UserRole.DRIVER or driver_id != current_user["id"]:
            raise HTTPException(status_code=403, detail="Only assigned driver can update ride status")
    validate_booking_status_transition(current_status, target_status, current_user["role"])
    
    now_utc = get_ist_now()
    update_data = {
        "status": target_status,
        "updated_at": now_utc
    }

    if target_status == BookingStatus.DRIVER_ARRIVED.value:
        ride_start_otp = f"{random.randint(1000, 9999)}"
        update_data["ride_start_otp"] = ride_start_otp
        update_data["ride_start_otp_generated_at"] = now_utc
        update_data["ride_start_otp_verified_at"] = None

    if target_status == BookingStatus.IN_PROGRESS.value and current_user["role"] != UserRole.ADMIN:
        if current_status != BookingStatus.DRIVER_ARRIVED.value:
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
    if target_status == BookingStatus.COMPLETED.value:
        if current_user["role"] != UserRole.ADMIN:
            if current_status != BookingStatus.IN_PROGRESS.value:
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

        actual_distance_km = max(0.0, actual_distance_km)
        waiting = calculate_waiting_charge(booking, effective_pricing, now_utc)
        vehicle_type_multiplier = float(
            booking.get("vehicle_type_multiplier")
            or get_vehicle_type_fare_multiplier(
                booking.get("vehicle_type_id"),
                booking.get("vehicle_subtype_id"),
            )
            or 1.0
        )
        ride_type_multiplier = float(
            booking.get("ride_type_multiplier")
            or get_ride_type_fare_multiplier(booking.get("ride_type"))
            or 1.0
        )

        base_route_fare_actual = (
            (effective_pricing.base_fare + (actual_distance_km * effective_pricing.per_km_rate))
            * time_multiplier
        )
        base_route_fare_actual = max(base_route_fare_actual, effective_pricing.minimum_fare)
        route_fare_actual = round(base_route_fare_actual * vehicle_type_multiplier * ride_type_multiplier, 2)
        final_fare = round((route_fare_actual * fare_multiplier) + pickup_surcharge + waiting["waiting_charge"], 2)
        rental_fare = await calculate_rental_completion_fare_for_booking(
            booking,
            actual_distance_km,
            now_utc,
        )
        if rental_fare:
            route_fare_actual = round(float(rental_fare["final_fare"]), 2)
            base_route_fare_actual = round(float(rental_fare["package_base_fare"]), 2)
            final_fare = route_fare_actual

        update_data["actual_distance_km"] = round(actual_distance_km, 3)
        update_data["distance_km"] = round(actual_distance_km, 3)
        update_data["actual_duration_minutes"] = waiting["actual_duration_minutes"]
        update_data["duration_minutes"] = waiting["actual_duration_minutes"]
        update_data["estimated_duration_minutes"] = waiting["estimated_duration_minutes"]
        update_data["waiting_minutes"] = waiting["waiting_minutes"]
        update_data["waiting_charge"] = waiting["waiting_charge"]
        update_data["waiting_charge_per_minute"] = waiting["waiting_charge_per_minute"]
        update_data["base_actual_route_fare"] = round(base_route_fare_actual, 2)
        update_data["base_route_fare"] = route_fare_actual
        update_data["fare_breakdown"] = {
            "pricing_basis": "actual_distance",
            "base_fare": round(effective_pricing.base_fare, 2),
            "per_km_rate": round(effective_pricing.per_km_rate, 2),
            "minimum_fare": round(effective_pricing.minimum_fare, 2),
            "actual_distance_km": round(actual_distance_km, 3),
            "actual_duration_minutes": waiting["actual_duration_minutes"],
            "estimated_duration_minutes": waiting["estimated_duration_minutes"],
            "waiting_minutes": waiting["waiting_minutes"],
            "waiting_charge": waiting["waiting_charge"],
            "vehicle_type_multiplier": round(vehicle_type_multiplier, 4),
            "ride_type_multiplier": round(ride_type_multiplier, 4),
            "driver_fare_multiplier": round(fare_multiplier, 4),
            "pickup_surcharge": round(pickup_surcharge, 2),
        }
        if rental_fare:
            update_data["fare_breakdown"].update(
                {
                    "pricing_basis": "rental_package_actuals",
                    "base_fare": round(rental_fare["package_base_fare"], 2),
                    "package_hours": round(rental_fare["package_hours"], 2),
                    "included_km": rental_fare["included_km"],
                    "extra_km": rental_fare["extra_km"],
                    "extra_km_rate": round(rental_fare["extra_km_rate"], 2),
                    "extra_km_charge": rental_fare["extra_km_charge"],
                    "extra_minutes": rental_fare["extra_minutes"],
                    "extra_15_min_blocks": int(rental_fare["extra_15_min_blocks"]),
                    "extra_15_min_rate": round(rental_fare["extra_15_min_rate"], 2),
                    "extra_time_charge": rental_fare["extra_time_charge"],
                    "used_minutes": rental_fare["used_minutes"],
                }
            )
        update_data["final_fare"] = final_fare
        update_data["estimated_fare"] = final_fare
        update_data["trip_completed_at"] = now_utc
        update_data["ride_start_otp"] = None
        update_data["ride_end_otp"] = None
        if normalized_enum_text(booking.get("payment_method")) == PaymentMethod.CASH.value:
            update_data["payment_status"] = PaymentOrderStatus.PAID.value
            update_data["payment_completed_at"] = now_utc
            update_data["payment_collection_method"] = PaymentMethod.CASH.value
        elif booking_payment_satisfied(booking):
            update_data["payment_status"] = normalized_enum_text(booking.get("payment_status")) or PaymentOrderStatus.PAID.value
        else:
            update_data["payment_status"] = "pending"
        
        # Update driver stats
        if driver_id:
            await db.drivers.update_one(
                {"user_id": driver_id},
                {
                    "$set": {"is_available": True},
                    "$inc": {"total_rides": 1}
                }
            )
        if not was_already_completed:
            if passenger_id:
                try:
                    await apply_per_trip_subscription_charge(
                        user_id=passenger_id,
                        role=UserRole.PASSENGER,
                        booking_id=booking_id,
                        completed_at=now_utc,
                    )
                except Exception:
                    logger.exception("Passenger per-trip subscription charge failed for booking_id=%s", booking_id)
            else:
                logger.warning("Skipping passenger subscription charge; booking_id=%s has no passenger_id", booking_id)
            if driver_id:
                try:
                    await apply_per_trip_subscription_charge(
                        user_id=driver_id,
                        role=UserRole.DRIVER,
                        booking_id=booking_id,
                        completed_at=now_utc,
                    )
                except Exception:
                    logger.exception("Driver per-trip subscription charge failed for booking_id=%s", booking_id)
    
    # If cancelled, make driver available again
    if target_status == BookingStatus.CANCELLED.value:
        update_data["ride_start_otp"] = None
        update_data["ride_end_otp"] = None
        if driver_id:
            await db.drivers.update_one(
                {"user_id": driver_id},
                {"$set": {"is_available": True}}
            )
    
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": update_data}
    )
    sidecar_set_fields: Dict[str, Any] = {
        "dispatch_status": target_status,
        "updated_at": now_utc,
    }
    if target_status == BookingStatus.DRIVER_ARRIVED.value:
        sidecar_set_fields.update(
            {
                "pickup_otp": update_data.get("ride_start_otp"),
                "pickup_otp_status": "sent_to_passenger",
                "pickup_otp_verified": False,
                "driver_arrived_at": now_utc,
            }
        )
    elif target_status == BookingStatus.IN_PROGRESS.value:
        sidecar_set_fields.update(
            {
                "dispatch_status": "trip_started",
                "pickup_otp_verified": True,
                "pickup_otp_verified_at": now_utc,
                "started_at": update_data.get("trip_started_at") or now_utc,
                "actual_distance_km": update_data.get("actual_distance_km", 0.0),
            }
        )
    elif target_status == BookingStatus.COMPLETED.value:
        fare_breakdown = update_data.get("fare_breakdown") if isinstance(update_data.get("fare_breakdown"), dict) else {}
        trip_summary = {
            "booking_id": booking_id,
            "completed_at": now_utc,
            "final_fare": update_data.get("final_fare"),
            "actual_distance_km": update_data.get("actual_distance_km"),
            "actual_duration_minutes": update_data.get("actual_duration_minutes"),
        }
        sidecar_set_fields.update(
            {
                "dispatch_status": "completed",
                "completed_at": now_utc,
                "final_fare": update_data.get("final_fare"),
                "actual_distance_km": update_data.get("actual_distance_km"),
                "trip_summary": trip_summary,
            }
        )
        if fare_breakdown.get("pricing_basis") == "rental_package_actuals":
            sidecar_set_fields.update(
                {
                    "used_minutes": fare_breakdown.get("used_minutes"),
                    "extra_minutes": fare_breakdown.get("extra_minutes"),
                    "extra_15_min_blocks": fare_breakdown.get("extra_15_min_blocks"),
                    "extra_km": fare_breakdown.get("extra_km"),
                    "extra_time_charge": fare_breakdown.get("extra_time_charge"),
                    "extra_km_charge": fare_breakdown.get("extra_km_charge"),
                }
            )
    elif target_status == BookingStatus.CANCELLED.value:
        sidecar_set_fields.update(
            {
                "dispatch_status": "cancelled",
                "cancelled_at": now_utc,
            }
        )
    await sync_booking_product_sidecar_status(
        booking,
        target_status,
        set_fields=sidecar_set_fields,
    )
    if driver_id:
        await cache_delete(f"driver_profile:{driver_id}")
    await clear_active_ride_cache(driver_id, passenger_id)
    await clear_driver_pending_request_cache(booking.get("candidate_driver_ids") or [])
    if target_status != BookingStatus.PENDING.value:
        await remove_ride_from_queue(booking_id)
    if target_status == BookingStatus.COMPLETED.value:
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
        "status": target_status,
        "timestamp": get_ist_now().isoformat(),
    }
    if passenger_id:
        try:
            await emit_to_user(passenger_id, "booking_status_changed", status_payload)
        except Exception:
            logger.exception("Passenger status emit failed for booking_id=%s", booking_id)
    else:
        logger.warning("Skipping passenger status emit; booking_id=%s has no passenger_id", booking_id)
    if driver_id:
        try:
            await emit_to_user(driver_id, "booking_status_changed", status_payload)
        except Exception:
            logger.exception("Driver status emit failed for booking_id=%s", booking_id)

    if passenger_id:
        try:
            if target_status == BookingStatus.DRIVER_ARRIVED.value:
                passenger_otp = str(update_data.get("ride_start_otp") or "")
                await notify_user(
                    passenger_id,
                    title="Driver Arrived",
                    body=f"Share OTP {passenger_otp} with your driver to start the ride.",
                    data={"booking_id": booking_id, "status": target_status, "ride_start_otp": passenger_otp},
                )
            elif target_status == BookingStatus.IN_PROGRESS.value:
                completion_otp = str(update_data.get("ride_end_otp") or "")
                await notify_user(
                    passenger_id,
                    title="Trip Started",
                    body=f"Ride started. Share completion OTP {completion_otp} when you reach destination.",
                    data={"booking_id": booking_id, "status": target_status, "ride_end_otp": completion_otp},
                )
            elif target_status == BookingStatus.COMPLETED.value:
                status_label = target_status.replace("_", " ").title()
                await notify_user(
                    passenger_id,
                    title="Ride Update",
                    body=f"Ride status changed: {status_label}.",
                    data={"booking_id": booking_id, "status": target_status},
                )
        except Exception:
            logger.exception("Passenger notification failed for booking_id=%s status=%s", booking_id, target_status)

    response_payload: Dict[str, Any] = {"message": "Status updated", "status": target_status}
    if target_status == BookingStatus.COMPLETED.value:
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

    booking_status_value = enum_response_value(booking.get("status"))
    if booking_status_value in {BookingStatus.COMPLETED.value, BookingStatus.CANCELLED.value}:
        raise HTTPException(status_code=400, detail="Cannot cancel this booking")

    if (
        current_user["role"] == UserRole.PASSENGER
        and current_user["id"] == booking.get("passenger_id")
        and booking_status_value
        not in {
            BookingStatus.PENDING.value,
            BookingStatus.SCHEDULED.value,
            BookingStatus.DRIVER_ARRIVED.value,
        }
    ):
        raise HTTPException(
            status_code=400,
            detail="Passenger cancellation is allowed while pending, scheduled, or after driver arrival before trip start.",
        )
    
    # Only passenger or assigned driver can cancel
    if current_user["id"] != booking["passenger_id"] and current_user["id"] != booking.get("driver_id"):
        raise HTTPException(status_code=403, detail="Not authorized to cancel")

    now = get_ist_now()
    payload = payload or BookingCancelRequest()
    actor_role = current_user["role"].value if isinstance(current_user["role"], Enum) else str(current_user["role"])
    reason_code = str(payload.reason_code or f"{actor_role}_cancelled").strip()[:80]
    reason_text = str(payload.reason_text or "").strip()[:400]
    status_before_cancel = booking_status_value
    is_driver_cancel = actor_role == UserRole.DRIVER.value and current_user["id"] == booking.get("driver_id")
    cancellation_fare_update = await build_driver_arrived_cancellation_fare_update(
        booking,
        actor_role,
        now,
    )
    policy_version = str(payload.policy_version or "driver_cancel_v1").strip()[:80]
    if cancellation_fare_update and policy_version == "driver_cancel_v1":
        policy_version = "passenger_driver_arrived_cancel_v1"
    fee_policy = {
        "policy_version": policy_version,
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
    if cancellation_fare_update:
        cancellation_fee = round(float(cancellation_fare_update.get("cancellation_fee", 0.0) or 0.0), 2)
        fee_policy.update(
            {
                "passenger_fee_amount": cancellation_fee,
                "driver_earning_amount": cancellation_fee,
                "review_required": False,
                "summary": (
                    "Driver arrived; minimum fare applies because the passenger cancelled "
                    "before the trip started."
                ),
            }
        )
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
                **(cancellation_fare_update or {}),
            },
            "$push": {
                "cancellation_audit": cancellation_details,
            },
        }
    )
    await sync_booking_product_sidecar_status(
        booking,
        BookingStatus.CANCELLED,
        set_fields={
            "dispatch_status": "cancelled",
            "cancelled_at": now,
            "cancelled_by": current_user["id"],
            "cancelled_by_role": actor_role,
            "cancellation_reason_code": reason_code,
            "cancellation_reason": reason_text,
            "cancellation_details": cancellation_details,
        },
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


def _location_from_any(value: Any) -> Optional[Location]:
    if not isinstance(value, dict):
        return None
    latitude = safe_float(value.get("latitude", value.get("lat")), None)
    longitude = safe_float(value.get("longitude", value.get("lng", value.get("lon"))), None)
    if latitude is None or longitude is None:
        return None
    try:
        return Location(
            latitude=latitude,
            longitude=longitude,
            address=str(value.get("address") or value.get("name") or "Location"),
        )
    except Exception:
        return None


@api_router.get("/drivers/demand-heatmap")
async def get_driver_demand_heatmap(
    latitude: Optional[float] = Query(None),
    longitude: Optional[float] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    require_driver(current_user)
    since = get_ist_now() - timedelta(hours=2)
    rows = await db.bookings.find(
        {
            "status": {"$in": [BookingStatus.PENDING, BookingStatus.PENDING.value, "pending"]},
            "created_at": {"$gte": since},
        },
        {"_id": 0, "pickup_location": 1, "estimated_fare": 1, "fare_before_discount": 1},
    ).to_list(500)

    origin = None
    if latitude is not None and longitude is not None:
        origin = Location(latitude=latitude, longitude=longitude, address="Driver location")

    buckets: Dict[str, Dict[str, Any]] = {}
    for row in rows:
        pickup = _location_from_any(row.get("pickup_location"))
        if not pickup:
            continue
        bucket_key = f"{round(pickup.latitude, 2)}:{round(pickup.longitude, 2)}"
        bucket = buckets.setdefault(
            bucket_key,
            {
                "id": f"demand-{bucket_key}",
                "latitude": round(pickup.latitude, 5),
                "longitude": round(pickup.longitude, 5),
                "name": pickup.address,
                "estimatedRequests": 0,
                "avgFare": 0.0,
                "fareTotal": 0.0,
            },
        )
        bucket["estimatedRequests"] += 1
        bucket["fareTotal"] += safe_float(row.get("estimated_fare") or row.get("fare_before_discount"), 0.0)

    hotspots = []
    for bucket in buckets.values():
        count = max(1, int(bucket["estimatedRequests"]))
        bucket["avgFare"] = round(bucket.pop("fareTotal", 0.0) / count, 2)
        bucket["demandLevel"] = "HIGH" if count >= 5 else "MEDIUM" if count >= 2 else "LOW"
        bucket["radius"] = min(2500, 700 + (count * 250))
        bucket["peakHours"] = "Last 2 hours"
        if origin:
            bucket["distance"] = calculate_distance(
                origin,
                Location(latitude=bucket["latitude"], longitude=bucket["longitude"], address=bucket["name"]),
            )
            bucket["eta"] = f"{max(3, int(bucket['distance'] * 3))} mins"
        else:
            bucket["distance"] = 0
            bucket["eta"] = "Live"
        hotspots.append(bucket)

    hotspots.sort(key=lambda item: (item["estimatedRequests"], item["avgFare"]), reverse=True)
    return {"hotspots": hotspots[:20], "updated_at": get_ist_now().isoformat()}


@api_router.post("/drivers/traffic-alerts")
async def get_driver_traffic_alerts(request: Request, current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    payload = await request.json()
    origin = _location_from_any(payload.get("origin"))
    destination = _location_from_any(payload.get("destination"))
    alert_rows = await db.traffic_alerts.find(
        {"active": {"$ne": False}},
        {"_id": 0},
    ).sort("created_at", -1).limit(25).to_list(25)
    alerts = [
        {
            "id": str(row.get("id") or row.get("alert_id") or idx),
            "type": row.get("type") or row.get("incident_type") or "traffic",
            "severity": str(row.get("severity") or "LOW").upper(),
            "title": row.get("title") or row.get("summary") or "Traffic alert",
            "description": row.get("description") or row.get("details") or "",
            "location": row.get("location_name") or row.get("location") or "",
            "delayTime": row.get("delay_time") or row.get("delayTime") or "0 mins",
            "impact": str(row.get("impact") or "INFO").upper(),
            "reportedTime": row.get("created_at") or row.get("reported_at") or get_ist_now(),
        }
        for idx, row in enumerate(alert_rows)
    ]
    routes = []
    if origin and destination:
        distance_km = calculate_distance(origin, destination)
        duration_minutes = max(5, int(distance_km * 3.2))
        routes.append(
            {
                "id": "direct",
                "name": "Direct route",
                "distance": distance_km,
                "duration": f"{duration_minutes} mins",
                "trafficCondition": "MODERATE" if alerts else "LIGHT",
                "avgSpeed": round((distance_km / max(duration_minutes / 60, 0.1)), 1),
                "toll": 0,
                "avoidedAlerts": [],
                "isRecommended": True,
            }
        )
    return {"alerts": alerts, "routes": routes, "updated_at": get_ist_now().isoformat()}


@api_router.post("/drivers/verification/photo")
async def submit_driver_photo_verification(request: Request, current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    payload = await request.json()
    score = safe_float(payload.get("liveness_score"), 0.0)
    status_value = "VERIFIED" if score >= 80 else "FAILED"
    now = get_ist_now()
    document = {
        "driver_id": current_user["id"],
        "photo_uri": str(payload.get("photo_uri") or ""),
        "liveness_score": score,
        "status": status_value,
        "updated_at": now,
    }
    await db.driver_photo_verifications.update_one(
        {"driver_id": current_user["id"]},
        {"$set": document, "$setOnInsert": {"created_at": now, "id": str(uuid.uuid4())}},
        upsert=True,
    )
    return document


@api_router.get("/drivers/passenger-safety-rating/{passenger_id}")
async def get_driver_passenger_safety_rating(passenger_id: str, current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    ratings = await db.ratings.find(
        {
            "$or": [
                {"rated_user_id": passenger_id},
                {"passenger_id": passenger_id},
                {"rated_user_role": UserRole.PASSENGER.value, "rated_user_id": passenger_id},
            ]
        },
        {"_id": 0, "rating": 1, "score": 1, "comment": 1},
    ).to_list(500)
    incidents = await db.safety_reports.count_documents({"passenger_id": passenger_id})
    rating_values = [safe_float(row.get("rating") or row.get("score"), 0.0) for row in ratings]
    rating_values = [value for value in rating_values if value > 0]
    average_rating = round(sum(rating_values) / len(rating_values), 2) if rating_values else 0.0
    safety_score = "EXCELLENT" if average_rating >= 4.7 and incidents == 0 else "GOOD" if average_rating >= 4.0 else "MODERATE" if average_rating >= 3.0 else "POOR"
    return {
        "rating": {
            "passengerId": passenger_id,
            "averageRating": average_rating,
            "totalRatings": len(rating_values),
            "safetyScore": safety_score,
            "reportedIncidents": incidents,
            "warnings": ["Reported safety incidents on file"] if incidents else [],
            "behaviourFlags": [],
            "lastUpdated": get_ist_now().isoformat(),
        }
    }

@api_router.get("/drivers/documents")
async def get_driver_documents(request: Request, current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    documents = await get_driver_documents_map(current_user["id"], request)
    reminders = build_driver_document_reminders(documents)
    return {"documents": documents, "reminders": reminders, "renewal_count": len(reminders)}


@api_router.get("/drivers/document-expiry-alerts")
async def get_driver_document_expiry_alerts(request: Request, current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    driver_id = current_user["id"]
    documents = await get_driver_documents_map(driver_id, request)
    dismissed_rows = await db.driver_document_alert_dismissals.find(
        {"driver_id": driver_id},
        {"_id": 0, "alert_id": 1},
    ).to_list(200)
    dismissed_alert_ids = {
        str(row.get("alert_id") or "")
        for row in dismissed_rows
        if row.get("alert_id")
    }
    alerts = []
    for document in documents.values():
        alert = build_driver_document_expiry_alert(document)
        if alert and alert["id"] not in dismissed_alert_ids:
            alerts.append(alert)
    alerts.sort(key=lambda item: item.get("days_until_expiry") if item.get("days_until_expiry") is not None else 9999)
    return {
        "alerts": alerts,
        "critical_count": len([alert for alert in alerts if alert.get("severity") == "critical"]),
        "warning_count": len([alert for alert in alerts if alert.get("severity") == "warning"]),
    }


@api_router.post("/drivers/document-expiry-alerts/{alert_id}/dismiss")
async def dismiss_driver_document_expiry_alert(alert_id: str, current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    cleaned_alert_id = str(alert_id or "").strip()
    if not cleaned_alert_id:
        raise HTTPException(status_code=400, detail="Alert id is required")

    now = get_ist_now()
    await db.driver_document_alert_dismissals.update_one(
        {"driver_id": current_user["id"], "alert_id": cleaned_alert_id},
        {
            "$set": {"dismissed_at": now, "updated_at": now},
            "$setOnInsert": {
                "id": f"driver-doc-alert-dismissal-{uuid.uuid4()}",
                "driver_id": current_user["id"],
                "alert_id": cleaned_alert_id,
                "created_at": now,
            },
        },
        upsert=True,
    )
    return {"success": True, "alert_id": cleaned_alert_id}


@api_router.post("/drivers/documents/{doc_type}/renew-request")
async def request_driver_document_renewal(doc_type: str, request: Request, current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    normalized_type = normalize_driver_doc_type(doc_type)

    payload: Dict[str, Any] = {}
    try:
        parsed_payload = await request.json()
        if isinstance(parsed_payload, dict):
            payload = parsed_payload
    except Exception:
        payload = {}

    alert_id = str(payload.get("alert_id") or "").strip()
    now = get_ist_now()
    await db.driver_document_renewal_requests.update_one(
        {
            "driver_id": current_user["id"],
            "doc_type": normalized_type,
            "status": "pending",
        },
        {
            "$set": {
                "alert_id": alert_id or None,
                "updated_at": now,
            },
            "$setOnInsert": {
                "id": f"driver-doc-renewal-{uuid.uuid4()}",
                "driver_id": current_user["id"],
                "doc_type": normalized_type,
                "status": "pending",
                "created_at": now,
            },
        },
        upsert=True,
    )

    if alert_id:
        await db.driver_document_alert_dismissals.update_one(
            {"driver_id": current_user["id"], "alert_id": alert_id},
            {
                "$set": {"dismissed_at": now, "updated_at": now},
                "$setOnInsert": {
                    "id": f"driver-doc-alert-dismissal-{uuid.uuid4()}",
                    "driver_id": current_user["id"],
                    "alert_id": alert_id,
                    "created_at": now,
                },
            },
            upsert=True,
        )

    return {
        "success": True,
        "message": "Renewal request submitted",
        "document_id": normalized_type,
        "alert_id": alert_id or None,
    }


@api_router.get("/drivers/menu-badges")
async def get_driver_menu_badges(request: Request, current_user: dict = Depends(get_current_user)):
    require_driver(current_user)
    driver_id = current_user["id"]

    documents = await get_driver_documents_map(driver_id, request)
    reminders = build_driver_document_reminders(documents)
    document_values = list(documents.values())
    documents_required_for_readiness = not document_mandatory_pause_active()
    missing_documents = (
        [
            document for document in document_values
            if not document.get("id") and not document.get("download_url") and not document.get("filename")
        ]
        if documents_required_for_readiness
        else []
    )
    rejected_documents = (
        [
            document for document in document_values
            if str(document.get("verification_status") or document.get("status") or "").lower() == "rejected"
        ]
        if documents_required_for_readiness
        else []
    )
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
    normalized_id = str(notification_id or "").strip()
    clauses = [
        {"user_id": user_id, "id": normalized_id},
        {"user_id": user_id, "notification_id": normalized_id},
    ]
    try:
        clauses.append({"user_id": user_id, "_id": ObjectId(normalized_id)})
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
    doc = build_emergency_contact_document(contact, current_user["id"])
    await db.emergency_contacts.insert_one(doc)
    return {"message": "Emergency contact saved", "contact": serialize_emergency_contact(doc)}


@api_router.get("/users/emergency-contacts")
async def list_emergency_contacts(current_user: dict = Depends(get_current_user)):
    contacts = await db.emergency_contacts.find(
        {"user_id": current_user["id"], "active": {"$ne": False}}
    ).sort("created_at", -1).to_list(20)
    return [serialize_emergency_contact(item) for item in contacts]


@api_router.get("/passengers/emergency-contacts")
@api_router.get("/v1/passengers/emergency-contacts")
async def list_passenger_emergency_contacts(current_user: dict = Depends(get_current_user)):
    require_passenger(current_user)
    contacts = await db.emergency_contacts.find(
        {"user_id": current_user["id"], "active": {"$ne": False}}
    ).sort("created_at", -1).to_list(20)
    serialized = [serialize_emergency_contact(item) for item in contacts]
    return {"contacts": serialized, "data": serialized}


@api_router.post("/passengers/emergency-contacts")
@api_router.post("/v1/passengers/emergency-contacts")
async def create_passenger_emergency_contact(
    payload: Dict[str, Any],
    current_user: dict = Depends(get_current_user),
):
    require_passenger(current_user)
    doc = build_emergency_contact_document(payload, current_user["id"])
    await db.emergency_contacts.insert_one(doc)
    return {"message": "Emergency contact saved", "contact": serialize_emergency_contact(doc)}


@api_router.delete("/passengers/emergency-contacts/{contact_id}")
@api_router.delete("/v1/passengers/emergency-contacts/{contact_id}")
async def delete_passenger_emergency_contact(contact_id: str, current_user: dict = Depends(get_current_user)):
    require_passenger(current_user)
    result = await db.emergency_contacts.update_one(
        {
            "$and": [
                emergency_contact_owner_query(current_user["id"], contact_id),
                {"active": {"$ne": False}},
            ],
        },
        {"$set": {"active": False, "deleted_at": get_ist_now(), "updated_at": get_ist_now()}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Emergency contact not found")
    return {"message": "Emergency contact deleted"}


async def validate_passenger_booking_for_sharing(user_id: str, booking_id: Optional[str]) -> None:
    normalized_booking_id = str(booking_id or "").strip()
    if not normalized_booking_id:
        return
    booking = await db.bookings.find_one({"id": normalized_booking_id}, {"_id": 0, "passenger_id": 1})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.get("passenger_id") != user_id:
        raise HTTPException(status_code=403, detail="Not authorized for this booking")


async def get_active_emergency_contact(user_id: str, contact_id: str) -> Dict[str, Any]:
    contact = await db.emergency_contacts.find_one(
        {
            "$and": [
                emergency_contact_owner_query(user_id, contact_id),
                {"active": {"$ne": False}},
            ],
        }
    )
    if not contact:
        raise HTTPException(status_code=404, detail="Emergency contact not found")
    return contact


@api_router.post("/passengers/location-sharing/update")
@api_router.post("/v1/passengers/location-sharing/update")
async def update_passenger_location_sharing(
    payload: Dict[str, Any],
    current_user: dict = Depends(get_current_user),
):
    require_passenger(current_user)
    contact_id = str(payload.get("contact_id") or "").strip()
    if not contact_id:
        raise HTTPException(status_code=400, detail="Contact is required")

    enabled = payload.get("enabled", True) is not False
    booking_id = str(payload.get("booking_id") or "").strip() or None
    await validate_passenger_booking_for_sharing(current_user["id"], booking_id)
    contact = await get_active_emergency_contact(current_user["id"], contact_id)

    now = get_ist_now()
    share_query = {"user_id": current_user["id"], "contact_id": contact_id, "booking_id": booking_id}
    if not enabled:
        result = await db.location_sharing.update_many(
            share_query,
            {"$set": {"active": False, "stopped_at": now, "updated_at": now}},
        )
        return {"message": "Location sharing stopped", "enabled": False, "modified_count": result.modified_count}

    location = normalize_tracking_location(payload.get("location"))
    if not location:
        raise HTTPException(status_code=400, detail="Current location is required to share live location")

    share_token = secrets.token_urlsafe(18)
    await db.location_sharing.update_one(
        share_query,
        {
            "$set": {
                "user_id": current_user["id"],
                "contact_id": contact_id,
                "contact": serialize_emergency_contact(contact),
                "booking_id": booking_id,
                "location": location,
                "active": True,
                "updated_at": now,
            },
            "$setOnInsert": {
                "id": f"share-{uuid.uuid4().hex}",
                "share_token": share_token,
                "created_at": now,
            },
        },
        upsert=True,
    )
    return {
        "message": "Location sharing updated",
        "enabled": True,
        "contact_id": contact_id,
        "booking_id": booking_id,
        "location": location,
    }


@api_router.post("/passengers/location-sharing/auto-enable")
@api_router.post("/v1/passengers/location-sharing/auto-enable")
async def auto_enable_passenger_location_sharing(
    payload: Dict[str, Any],
    current_user: dict = Depends(get_current_user),
):
    require_passenger(current_user)
    booking_id = str(payload.get("booking_id") or "").strip() or None
    await validate_passenger_booking_for_sharing(current_user["id"], booking_id)

    try:
        duration_minutes = int(payload.get("duration_minutes") or 30)
    except (TypeError, ValueError):
        duration_minutes = 30
    duration_minutes = max(1, min(1440, duration_minutes))
    now = get_ist_now()
    expires_at = now + timedelta(minutes=duration_minutes)
    contacts = await db.emergency_contacts.find(
        {"user_id": current_user["id"], "active": {"$ne": False}}
    ).sort("created_at", -1).to_list(20)

    for contact in contacts:
        contact_id = str(contact.get("id") or contact.get("_id") or "")
        await db.location_sharing.update_one(
            {"user_id": current_user["id"], "contact_id": contact_id, "booking_id": booking_id},
            {
                "$set": {
                    "user_id": current_user["id"],
                    "contact_id": contact_id,
                    "contact": serialize_emergency_contact(contact),
                    "booking_id": booking_id,
                    "active": True,
                    "auto_share": True,
                    "expires_at": expires_at,
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "id": f"share-{uuid.uuid4().hex}",
                    "share_token": secrets.token_urlsafe(18),
                    "created_at": now,
                },
            },
            upsert=True,
        )

    return {
        "message": "Auto-sharing enabled",
        "enabled": bool(contacts),
        "shared_count": len(contacts),
        "duration_minutes": duration_minutes,
        "expires_at": expires_at.isoformat(),
    }


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

    current_role = normalized_enum_text(current_user.get("role"))
    if current_role not in {UserRole.PASSENGER.value, UserRole.ADMIN.value}:
        raise HTTPException(status_code=403, detail="Only passenger can create ride payment")
    if current_role == UserRole.PASSENGER.value and booking["passenger_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    if booking_status_value(booking.get("status")) != BookingStatus.COMPLETED.value:
        raise HTTPException(status_code=400, detail="Complete the trip before creating payment")
    if booking_payment_satisfied(booking):
        existing_paid_order = await db.payment_orders.find_one(
            {
                "booking_id": payload.booking_id,
                "status": PaymentOrderStatus.PAID.value,
            },
            sort=[("created_at", -1)],
        )
        if existing_paid_order:
            return PaymentOrderResponse(
                order_id=existing_paid_order["order_id"],
                booking_id=payload.booking_id,
                amount=round(float(existing_paid_order.get("amount") or 0), 2),
                status=PaymentOrderStatus.PAID,
                provider=existing_paid_order.get("provider", "upi_intent"),
                upi_intent=existing_paid_order.get("upi_intent"),
                stripe_client_secret=existing_paid_order.get("stripe_client_secret"),
                stripe_payment_intent_id=existing_paid_order.get("stripe_payment_intent_id"),
            )
        raise HTTPException(status_code=409, detail="Payment already completed for this booking")

    existing_open_order = await db.payment_orders.find_one(
        {
            "booking_id": payload.booking_id,
            "status": {"$in": [PaymentOrderStatus.CREATED.value, PaymentOrderStatus.PENDING_VERIFICATION.value]},
        },
        sort=[("created_at", -1)],
    )
    if existing_open_order:
        return PaymentOrderResponse(
            order_id=existing_open_order["order_id"],
            booking_id=payload.booking_id,
            amount=round(float(existing_open_order.get("amount") or 0), 2),
            status=PaymentOrderStatus(normalized_enum_text(existing_open_order.get("status"))),
            provider=existing_open_order.get("provider", "upi_intent"),
            upi_intent=existing_open_order.get("upi_intent"),
            stripe_client_secret=existing_open_order.get("stripe_client_secret"),
            stripe_payment_intent_id=existing_open_order.get("stripe_payment_intent_id"),
        )

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
        "status": PaymentOrderStatus.CREATED.value,
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
    booking = await db.bookings.find_one({"id": order["booking_id"]})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    current_role = normalized_enum_text(current_user.get("role"))
    if current_role not in {UserRole.PASSENGER.value, UserRole.ADMIN.value}:
        raise HTTPException(status_code=403, detail="Only passenger can verify ride payment")
    if current_role == UserRole.PASSENGER.value and order["passenger_id"] != current_user["id"]:
        raise HTTPException(status_code=403, detail="Not authorized")
    if booking_status_value(booking.get("status")) != BookingStatus.COMPLETED.value:
        raise HTTPException(status_code=400, detail="Complete the trip before verifying payment")
    expected_amount = round(float(booking.get("final_fare") or booking.get("estimated_fare") or 0), 2)
    order_amount = round(float(order.get("amount") or 0), 2)
    if expected_amount <= 0 or abs(order_amount - expected_amount) > 0.01:
        raise HTTPException(status_code=400, detail="Payment amount does not match completed trip fare")

    if normalized_enum_text(order.get("status")) == PaymentOrderStatus.PAID.value:
        return {
            "message": "Payment already verified",
            "order_id": payload.order_id,
            "status": PaymentOrderStatus.PAID.value,
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
    else:
        transaction_ref = str(payload.transaction_ref or "").strip()
        if len(transaction_ref) < 4:
            raise HTTPException(status_code=400, detail="Enter a valid payment reference or UTR")

    now = get_ist_now()

    await db.payment_orders.update_one(
        {"order_id": payload.order_id},
        {
            "$set": {
                "status": PaymentOrderStatus.PAID.value,
                "transaction_ref": str(payload.transaction_ref or "").strip(),
                "paid_at": now,
                "updated_at": now,
            }
        },
    )

    await db.bookings.update_one(
        {"id": order["booking_id"]},
        {
            "$set": {
                "payment_status": PaymentOrderStatus.PAID.value,
                "payment_order_id": payload.order_id,
                "payment_completed_at": now,
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
        "status": PaymentOrderStatus.PAID.value,
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
    vehicle_multiplier = get_vehicle_type_fare_multiplier(request.vehicle_type_id, request.vehicle_subtype_id)
    ride_type_multiplier = get_ride_type_fare_multiplier(request.ride_type)
    
    distance_fare = distance * pricing.per_km_rate
    subtotal = pricing.base_fare + distance_fare
    route_fare = subtotal * time_multiplier
    total_fare = route_fare * vehicle_multiplier * ride_type_multiplier
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
            "vehicle_type_id": request.vehicle_type_id,
            "vehicle_subtype_id": request.vehicle_subtype_id,
            "vehicle_multiplier": vehicle_multiplier,
            "ride_type": request.ride_type or "normal",
            "ride_type_multiplier": ride_type_multiplier,
            "route_fare_before_multipliers": round(route_fare, 2),
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
    
    current_role = normalized_enum_text(current_user.get("role"))
    if current_role not in {UserRole.PASSENGER.value, UserRole.DRIVER.value}:
        raise HTTPException(status_code=403, detail="Only ride participants can rate a ride")
    ensure_booking_participant(booking, current_user)

    if booking_status_value(booking.get("status")) != BookingStatus.COMPLETED.value:
        raise HTTPException(status_code=400, detail="Can only rate completed rides")
    if not booking_payment_satisfied(booking):
        raise HTTPException(status_code=400, detail="Complete payment before rating this ride")
    existing_rating = await db.ratings.find_one(
        {"booking_id": rating_data.booking_id, "from_user_id": current_user["id"]},
        {"_id": 0, "id": 1},
    )
    if existing_rating:
        raise HTTPException(status_code=409, detail="You have already rated this ride")
    
    # Determine who is being rated
    if current_role == UserRole.PASSENGER.value:
        rated_user_id = booking.get("driver_id")
    else:
        rated_user_id = booking["passenger_id"]
    
    if not rated_user_id:
        raise HTTPException(status_code=400, detail="No one to rate")
    
    now = get_ist_now()
    rating_doc = {
        "id": str(uuid.uuid4()),
        "booking_id": rating_data.booking_id,
        "from_user_id": current_user["id"],
        "to_user_id": rated_user_id,
        "rating": rating_data.rating,
        "comment": rating_data.comment,
        "created_at": now
    }
    
    await db.ratings.insert_one(rating_doc)
    await db.bookings.update_one(
        {"id": rating_data.booking_id},
        {
            "$set": {
                "updated_at": now,
                (
                    "passenger_rating_id"
                    if current_role == UserRole.PASSENGER.value
                    else "driver_rating_id"
                ): rating_doc["id"],
            }
        },
    )
    
    # Update driver's average rating using aggregation pipeline
    if current_role == UserRole.PASSENGER.value and rated_user_id:
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
def build_admin_users_query(user_type: Optional[str] = None, search_text: Optional[str] = None) -> Dict[str, Any]:
    filters: List[Dict[str, Any]] = []
    normalized_role = _normalize_role_text(user_type)
    if normalized_role:
        filters.append(_role_query(normalized_role))

    normalized_search = re.sub(r"\s+", " ", str(search_text or "").strip())
    if normalized_search:
        escaped = re.escape(normalized_search)
        filters.append(
            {
                "$or": [
                    {"id": {"$regex": escaped, "$options": "i"}},
                    {"name": {"$regex": escaped, "$options": "i"}},
                    {"email": {"$regex": escaped, "$options": "i"}},
                    {"phone": {"$regex": escaped, "$options": "i"}},
                ]
            }
        )

    if not filters:
        return {}
    if len(filters) == 1:
        return filters[0]
    return {"$and": filters}


def serialize_admin_user(user: Dict[str, Any]) -> Dict[str, Any]:
    row = without_mongo_id(user)
    row.pop("password_hash", None)
    role = _normalize_role_text(row.get("role") or row.get("user_type")) or str(row.get("role") or row.get("user_type") or "")
    blocked = bool(row.get("is_blocked") or row.get("blocked") or str(row.get("status") or "").strip().lower() == "blocked")
    account_status = "blocked" if blocked else row.get("account_status") or str(row.get("status") or "active")
    return {
        **row,
        "id": str(row.get("id") or ""),
        "role": role,
        "user_type": role,
        "blocked": blocked,
        "is_blocked": blocked,
        "account_status": account_status,
    }


@api_router.get("/admin/dashboard")
async def get_admin_dashboard(current_user: dict = Depends(get_current_user)):
    """Get admin dashboard stats"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    completed_statuses = _enum_query_values(BookingStatus.COMPLETED)
    active_statuses = _enum_query_values(
        BookingStatus.PENDING,
        BookingStatus.ACCEPTED,
        BookingStatus.DRIVER_ARRIVED,
        BookingStatus.IN_PROGRESS,
    )
    (
        total_users,
        total_drivers,
        total_passengers,
        total_operators,
        total_admins,
        driver_profiles,
        passenger_profiles,
        total_bookings,
        completed_bookings,
        active_bookings,
        revenue_result,
    ) = await asyncio.gather(
        db.users.count_documents({}),
        db.users.count_documents(_role_query(UserRole.DRIVER)),
        db.users.count_documents(_role_query(UserRole.PASSENGER, "user")),
        db.users.count_documents(_role_query(UserRole.OPERATOR)),
        db.users.count_documents(_role_query(UserRole.ADMIN)),
        db.drivers.count_documents({}),
        db.passengers.count_documents({}),
        db.bookings.count_documents({}),
        db.bookings.count_documents({"status": {"$in": completed_statuses}}),
        db.bookings.count_documents({"status": {"$in": active_statuses}}),
        db.bookings.aggregate([
            {"$match": {"status": {"$in": completed_statuses}}},
            {"$project": {"fare": {"$ifNull": ["$final_fare", "$estimated_fare"]}}},
            {"$group": {"_id": None, "total": {"$sum": "$fare"}}}
        ]).to_list(1),
    )
    total_drivers = max(total_drivers, driver_profiles)
    total_passengers = max(total_passengers, passenger_profiles)
    total_users = max(total_users, total_drivers + total_passengers + total_operators + total_admins)
    total_revenue = revenue_result[0]["total"] if revenue_result else 0
    
    dashboard_stats = {
        "total_users": total_users,
        "total_drivers": total_drivers,
        "total_passengers": total_passengers,
        "total_operators": total_operators,
        "total_admins": total_admins,
        "total_bookings": total_bookings,
        "completed_bookings": completed_bookings,
        "active_bookings": active_bookings,
        "total_revenue": round(total_revenue, 2)
    }
    dashboard_aliases = {
        "totalUsers": dashboard_stats["total_users"],
        "totalDrivers": dashboard_stats["total_drivers"],
        "totalPassengers": dashboard_stats["total_passengers"],
        "totalOperators": dashboard_stats["total_operators"],
        "totalAdmins": dashboard_stats["total_admins"],
        "totalBookings": dashboard_stats["total_bookings"],
        "completedBookings": dashboard_stats["completed_bookings"],
        "activeBookings": dashboard_stats["active_bookings"],
        "active_rides": dashboard_stats["active_bookings"],
        "activeRides": dashboard_stats["active_bookings"],
        "totalRevenue": dashboard_stats["total_revenue"],
        "revenue": dashboard_stats["total_revenue"],
    }
    return {
        **dashboard_stats,
        **dashboard_aliases,
        "overview": {**dashboard_stats, **dashboard_aliases},
        "stats": {**dashboard_stats, **dashboard_aliases},
        "generated_at": get_ist_now(),
    }

@api_router.get("/admin/users")
async def get_all_users(
    user_type: str = Query("all", alias="type"),
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(get_current_user),
):
    """Get all users"""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    query = build_admin_users_query(user_type if user_type != "all" else None)
    users = await db.users.find(query).sort("created_at", -1).to_list(limit)
    return {"users": [serialize_admin_user(user) for user in users]}


@api_router.get("/admin/users/search")
async def search_admin_users(
    q: Optional[str] = Query(None),
    query: Optional[str] = Query(None),
    user_type: str = Query("all"),
    type_filter: str = Query("all", alias="type"),
    limit: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    search_text = q or query or ""
    role_filter = user_type if user_type != "all" else type_filter
    users = await db.users.find(
        build_admin_users_query(role_filter if role_filter != "all" else None, search_text)
    ).sort("created_at", -1).to_list(limit)
    return {"users": [serialize_admin_user(user) for user in users]}

@api_router.get("/admin/users/role-report")
async def get_admin_users_role_report(current_user: dict = Depends(get_current_user)):
    """User-wise role report for passenger, driver, operator/owner, and admin accounts."""
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    role_keys = ["passenger", "driver", "operator", "admin"]
    role_buckets: Dict[str, List[Dict[str, Any]]] = {
        "passengers": [],
        "drivers": [],
        "operators": [],
        "admins": [],
    }

    users = await db.users.find(
        _role_query(UserRole.PASSENGER, UserRole.DRIVER, UserRole.OPERATOR, UserRole.ADMIN, "user"),
        {
            "_id": 0,
            "id": 1,
            "name": 1,
            "email": 1,
            "phone": 1,
            "role": 1,
            "user_type": 1,
            "created_at": 1,
            "joined_at": 1,
            "createdAt": 1,
            "account_status": 1,
            "is_blocked": 1,
        },
    ).sort("created_at", -1).to_list(10000)

    for user in users:
        role = _normalize_role_text(user.get("role") or user.get("user_type"))
        if role not in role_keys:
            continue

        joining_date = user.get("created_at") or user.get("joined_at") or user.get("createdAt")
        report_row = {
            "id": str(user.get("id") or ""),
            "role": role,
            "name": user.get("name") or "Unknown User",
            "email": user.get("email") or "",
            "phone": user.get("phone") or "",
            "joining_date": joining_date,
            "created_at": joining_date,
            "account_status": user.get("account_status") or ("blocked" if user.get("is_blocked") else "active"),
        }
        role_buckets[f"{role}s"].append(report_row)

    for rows in role_buckets.values():
        rows.sort(key=lambda item: str(item.get("joining_date") or ""), reverse=True)

    counts = {
        "passengers": len(role_buckets["passengers"]),
        "drivers": len(role_buckets["drivers"]),
        "operators": len(role_buckets["operators"]),
        "admins": len(role_buckets["admins"]),
    }
    return {
        **role_buckets,
        "counts": {
            **counts,
            "total": counts["passengers"] + counts["drivers"] + counts["operators"] + counts["admins"],
        },
        "generated_at": get_ist_now(),
    }

@api_router.get("/admin/users/live-status")
async def get_admin_users_live_status(current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    user_projection = {
        "_id": 0,
        "id": 1,
        "name": 1,
        "email": 1,
        "phone": 1,
        "role": 1,
        "user_type": 1,
        "created_at": 1,
    }
    users = await db.users.find(
        _role_query(UserRole.DRIVER, UserRole.PASSENGER, UserRole.OPERATOR, "user"),
        user_projection,
    ).to_list(5000)
    if not users:
        return {
            "drivers": [],
            "passengers": [],
            "operators": [],
            "live_counts": {"drivers_live": 0, "passengers_live": 0, "operators_total": 0, "total_live": 0},
            "generated_at": get_ist_now(),
        }

    driver_ids = [str(user.get("id") or "") for user in users if _normalize_role_text(user.get("role") or user.get("user_type")) == UserRole.DRIVER.value and user.get("id")]
    driver_projection = {
        "_id": 0,
        "user_id": 1,
        "is_available": 1,
        "kyc_status": 1,
        "current_location": 1,
        "last_location_at": 1,
        "last_heartbeat_at": 1,
        "last_online_at": 1,
    }
    driver_profiles = await db.drivers.find(
        {"user_id": {"$in": driver_ids}},
        driver_projection,
    ).to_list(len(driver_ids)) if driver_ids else []
    driver_profile_by_id = {str(profile.get("user_id")): profile for profile in driver_profiles if profile.get("user_id")}

    active_statuses = _enum_query_values(
        BookingStatus.PENDING,
        BookingStatus.ACCEPTED,
        BookingStatus.DRIVER_ARRIVED,
        BookingStatus.IN_PROGRESS,
    )
    active_bookings = await db.bookings.find(
        {"status": {"$in": active_statuses}},
        {"_id": 0, "id": 1, "passenger_id": 1, "driver_id": 1},
    ).to_list(5000)
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
    operators: List[Dict[str, Any]] = []
    drivers_live = 0
    passengers_live = 0

    for user in users:
        user_id = str(user.get("id") or "")
        role = _normalize_role_text(user.get("role") or user.get("user_type"))
        base_payload = {
            "id": user_id,
            "name": user.get("name"),
            "email": user.get("email"),
            "phone": user.get("phone"),
            "created_at": user.get("created_at"),
        }

        if role == UserRole.DRIVER.value:
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

        if role == UserRole.PASSENGER.value:
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
            continue

        if role == UserRole.OPERATOR.value:
            operators.append(
                {
                    **base_payload,
                    "is_live": False,
                }
            )

    drivers.sort(key=lambda item: (not item.get("is_live"), str(item.get("name") or "").lower()))
    passengers.sort(key=lambda item: (not item.get("is_live"), str(item.get("name") or "").lower()))
    operators.sort(key=lambda item: str(item.get("name") or "").lower())
    return {
        "drivers": drivers,
        "passengers": passengers,
        "operators": operators,
        "live_counts": {
            "drivers_live": drivers_live,
            "passengers_live": passengers_live,
            "operators_total": len(operators),
            "total_live": drivers_live + passengers_live,
        },
        "generated_at": get_ist_now(),
    }


@api_router.put("/admin/users/{user_id}/block")
async def block_admin_user(
    user_id: str,
    payload: Optional[UserBlockToggleRequest] = None,
    current_user: dict = Depends(get_current_user),
):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    if user_id == current_user.get("id"):
        raise HTTPException(status_code=400, detail="Admins cannot block their own active account")

    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if _normalize_role_text(user.get("role") or user.get("user_type")) == UserRole.ADMIN.value:
        raise HTTPException(status_code=400, detail="Admin accounts cannot be blocked from this panel")

    now = get_ist_now()
    reason = str((payload.reason if payload else None) or "Admin action").strip() or "Admin action"
    await db.users.update_one(
        {"id": user_id},
        {
            "$set": {
                "status": "blocked",
                "account_status": "blocked",
                "is_blocked": True,
                "blocked": True,
                "blocked_at": now,
                "blocked_by": current_user.get("id"),
                "block_reason": reason,
                "updated_at": now,
            }
        },
    )

    if _normalize_role_text(user.get("role") or user.get("user_type")) == UserRole.DRIVER.value:
        await db.drivers.update_one(
            {"user_id": user_id},
            {"$set": {"is_online": False, "is_available": False, "admin_blocked": True, "updated_at": now}},
        )
        await cache_delete(f"driver_pending_requests:{user_id}")

    updated = await db.users.find_one({"id": user_id}) or user
    return {"message": "User blocked", "user": serialize_admin_user(updated)}


@api_router.put("/admin/users/{user_id}/unblock")
async def unblock_admin_user(user_id: str, current_user: dict = Depends(get_current_user)):
    if current_user["role"] != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")

    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    now = get_ist_now()
    await db.users.update_one(
        {"id": user_id},
        {
            "$set": {
                "status": "active",
                "account_status": "active",
                "is_blocked": False,
                "blocked": False,
                "unblocked_at": now,
                "unblocked_by": current_user.get("id"),
                "updated_at": now,
            },
            "$unset": {"block_reason": "", "blocked_at": "", "blocked_by": ""},
        },
    )

    if _normalize_role_text(user.get("role") or user.get("user_type")) == UserRole.DRIVER.value:
        await db.drivers.update_one(
            {"user_id": user_id},
            {"$set": {"admin_blocked": False, "updated_at": now}},
        )
        await cache_delete(f"driver_pending_requests:{user_id}")

    updated = await db.users.find_one({"id": user_id}) or user
    return {"message": "User unblocked", "user": serialize_admin_user(updated)}

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
    await sync_booking_product_sidecar_status(
        booking,
        BookingStatus.CANCELLED,
        {
            "dispatch_status": "cancelled",
            "status": "cancelled",
            "cancelled_at": now,
            "cancelled_by": current_user.get("id"),
            "cancelled_by_role": "admin",
            "cancel_reason": cancel_reason,
            "cancellation_reason": cancel_reason,
            "admin_cancelled_at": now,
            "admin_cancelled_by": current_user.get("id"),
            "admin_cancel_reason": cancel_reason,
            "cancellation_details": {
                "cancelled_by": current_user.get("id"),
                "cancelled_by_role": "admin",
                "reason": cancel_reason,
                "cancelled_at": now,
            },
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
            "role": {"$in": [UserRole.PASSENGER, UserRole.DRIVER, UserRole.OPERATOR]},
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

    for role_key, role_config in (
        ("passenger", settings.passenger),
        ("driver", settings.driver),
        ("operator", settings.operator),
    ):
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
    if user.get("role") not in {UserRole.PASSENGER, UserRole.DRIVER, UserRole.OPERATOR}:
        raise HTTPException(status_code=400, detail="Only passenger, driver, and operator subscriptions can be managed")

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
    operator_fee = float(settings.operator_registration_fee or 0.0)
    if passenger_fee > 0 or driver_fee > 0 or operator_fee > 0:
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
                "operator_registration_fee": operator_fee,
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
        if db is None:
            raise ServerSelectionTimeoutError("MongoDB client is not initialized")
        await db.command("ping", maxTimeMS=READINESS_DB_PING_TIMEOUT_MS)
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
    if generate_latest is None:
        fallback_payload = (
            "# HELP python_gc_objects_collected_total Objects collected during gc\n"
            "# TYPE python_gc_objects_collected_total counter\n"
            'python_gc_objects_collected_total{generation="0"} 0\n'
        )
        return Response(content=fallback_payload, media_type=CONTENT_TYPE_LATEST)
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
        token = (
            auth.get("token")
            or auth.get("access_token")
            or auth.get("accessToken")
            or auth.get("authorization")
        )
    elif isinstance(auth, str):
        token = auth
    if token and str(token).strip().lower().startswith("bearer "):
        token = str(token).strip()[7:]
    if token:
        return str(token).strip()
    auth_header = str((environ or {}).get("HTTP_AUTHORIZATION") or "").strip()
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    query_string = str((environ or {}).get("QUERY_STRING") or "")
    if query_string:
        params = parse_qs(query_string, keep_blank_values=False)
        query_token = (params.get("token") or params.get("access_token") or [None])[0]
        if query_token:
            return str(query_token).strip()
    return None


def _normalize_socket_role(raw_role: Any) -> str:
    role = getattr(raw_role, "value", raw_role)
    normalized = str(role or "").strip().lower()
    if "." in normalized:
        normalized = normalized.split(".")[-1]
    return normalized

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
        logger.warning("Socket auth rejected: missing token")
        return None
    try:
        payload = decode_token(token)
    except HTTPException as exc:
        logger.warning("Socket auth rejected: %s", exc.detail)
        return None
    except Exception as exc:
        logger.warning("Socket auth rejected: token decode failed: %s", exc)
        return None
    user_id = str(payload.get("sub") or payload.get("id") or payload.get("user_id") or "").strip()
    if not user_id:
        logger.warning("Socket auth rejected: token missing subject")
        return None
    if db is None:
        logger.warning("Socket auth rejected: primary DB is unavailable")
        return None
    try:
        user = await db.users.find_one(
            {"$or": [{"id": user_id}, {"user_id": user_id}]},
            {"_id": 0},
        )
    except Exception as exc:
        logger.warning("Socket auth rejected: user lookup failed: %s", exc)
        return None
    if user:
        if str(user.get("status") or "").strip().lower() == "blocked":
            logger.warning("Socket auth rejected: blocked user_id=%s", user_id)
            return None
        user["id"] = str(user.get("id") or user.get("user_id") or user_id)
        user["role"] = _normalize_socket_role(user.get("role")) or _normalize_socket_role(payload.get("role"))
        return user
    logger.warning("Socket auth rejected: token valid but user not found user_id=%s", user_id)
    return None


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
        logger.warning(
            f"Socket connection rejected: origin not allowed. "
            f"sid={sid}, origin={socket_origin}, "
            f"allowed_origins={ALLOWED_ORIGINS}, "
            f"regex_enabled={bool(EFFECTIVE_CORS_ALLOW_ORIGIN_REGEX)}"
        )
        raise ConnectionRefusedError("Origin not allowed")

    user = await get_user_from_socket(environ or {}, auth if isinstance(auth, dict) else None)
    if not user:
        raise ConnectionRefusedError("Unauthorized socket")

    await _bind_socket_user(sid, str(user.get("id") or ""), str(user.get("role") or ""))
    if socket_origin:
        logger.info(f"Socket connected and authenticated: sid={sid}, origin={socket_origin}")
    else:
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

    now = get_ist_now()
    await runtime_state.touch_driver_heartbeat(driver_id)
    await db.drivers.update_one(
        {"user_id": driver_id},
        {
            "$set": {
                "is_online": True,
                "last_heartbeat_at": now,
                "last_online_at": now,
                "updated_at": now,
            },
            "$setOnInsert": build_default_driver_profile(driver_id),
        },
        upsert=True,
    )
    await cache_delete(f"driver_profile:{driver_id}")
    fallback_booking_id = await runtime_state.get_driver_active_booking(driver_id)
    booking_id = str((data or {}).get("booking_id") or fallback_booking_id or "").strip()
    if booking_id:
        await runtime_state.set_driver_active_booking(driver_id, booking_id)

    await sio.emit(
        "driver_heartbeat_ack",
        {
            "driver_id": driver_id,
            "booking_id": booking_id or None,
            "server_time": now.isoformat(),
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

    now = get_ist_now()
    location_payload = {
        "latitude": normalized_live_location.get("latitude"),
        "longitude": normalized_live_location.get("longitude"),
        "heading": (data or {}).get("heading"),
        "speed": (data or {}).get("speed"),
        "accuracy": (data or {}).get("accuracy"),
        "address": normalized_live_location.get("address") or (data or {}).get("address"),
        "updated_at": now.isoformat(),
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
                "last_location_at": now,
                "last_heartbeat_at": now,
                "last_online_at": now,
                "updated_at": now,
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
        "timestamp": now.isoformat(),
    }

    if booking_id:
        booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
        if booking and str(booking.get("passenger_id") or ""):
            pickup = booking.get("pickup_location")
            drop = booking.get("drop_location") or booking.get("dropoff_location")
            payload["eta_to_pickup_min"] = calculate_eta_minutes(location_payload, pickup)
            payload["eta_to_drop_min"] = calculate_eta_minutes(location_payload, drop)
            tracking_set, tracking_push = build_trip_distance_tracking_update(
                booking,
                location_payload,
                now,
            )
            booking_set_fields = {
                "driver_live_location": location_payload,
                "driver_location": location_payload,
                "driver_eta_to_pickup_min": payload["eta_to_pickup_min"],
                "driver_eta_to_drop_min": payload["eta_to_drop_min"],
                "updated_at": get_ist_now(),
                **tracking_set,
            }
            booking_update: Dict[str, Any] = {"$set": booking_set_fields}
            if tracking_push:
                booking_update["$push"] = {"trip_path_points": tracking_push}
            await db.bookings.update_one(
                {"id": booking_id},
                booking_update,
            )

        for event_name in ("driver_location_changed", "driver_location", "driver_location_updated"):
            await sio.emit(event_name, payload, room=ride_room(booking_id))
            await sio.emit(event_name, payload, room=f"booking:{booking_id}")

        if booking:
            passenger_id = str(booking.get("passenger_id") or "")
            driver_user_id = str(booking.get("driver_id") or "")
            if passenger_id:
                for event_name in ("driver_location_changed", "driver_location", "driver_location_updated"):
                    await emit_to_user(passenger_id, event_name, payload)
            if driver_user_id:
                for event_name in ("driver_location_changed", "driver_location", "driver_location_updated"):
                    await emit_to_user(driver_user_id, event_name, payload)

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


async def notify_driver_ride_request(driver_id: str, booking_id: Optional[str]) -> None:
    normalized_driver_id = str(driver_id or "").strip()
    normalized_booking_id = str(booking_id or "").strip()
    if not normalized_driver_id or not normalized_booking_id:
        return

    existing = await db.notifications.find_one(
        {
            "user_id": normalized_driver_id,
            "type": "ride_request",
            "data.booking_id": normalized_booking_id,
        },
        {"_id": 1},
    )
    if existing:
        return

    await notify_user(
        normalized_driver_id,
        title="New ride request",
        body="A passenger is requesting a ride near you.",
        data={
            "type": "ride_request",
            "booking_id": normalized_booking_id,
            "severity": "high",
            "screen": "driver_requests",
        },
    )


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
    booking = None
    passenger_id = None
    blocked_driver_ids: set = set()
    if booking_id:
        booking = await db.bookings.find_one({"id": booking_id})
        passenger_id = booking.get("passenger_id") if booking else None
        if passenger_id:
            blocked_driver_ids = set(await get_excluded_driver_ids_for_passenger(passenger_id))
    if booking_product_key(booking) == "women_only" and available_drivers:
        driver_ids = [str(item.get("user_id") or "").strip() for item in available_drivers if item.get("user_id")]
        driver_users = await db.users.find(
            {"id": {"$in": driver_ids}, "role": UserRole.DRIVER},
            {"_id": 0, "id": 1, "gender": 1, "name": 1},
        ).to_list(None)
        users_by_id = {str(item.get("id") or ""): item for item in driver_users}
        available_drivers = [
            {
                **driver,
                "gender": driver.get("gender") or (users_by_id.get(str(driver.get("user_id") or "")) or {}).get("gender"),
                "name": driver.get("name") or (users_by_id.get(str(driver.get("user_id") or "")) or {}).get("name"),
            }
            for driver in available_drivers
        ]
    for driver in available_drivers:
        if blocked_driver_ids and driver.get("user_id") in blocked_driver_ids:
            continue
        driver_id = str(driver.get("user_id") or "").strip()
        if not driver_id:
            continue
        if booking and not driver_matches_booking_service(driver, booking):
            continue
        dispatch_expires_at = dispatch_expiry_datetime((booking or {}).get("dispatch_expires_at"))
        await sio.emit(
            'new_booking_available',
            {
                'message': 'New ride request available',
                'booking_id': booking_id,
                'dispatch_driver_id': active_dispatch_driver_id(booking),
                'acceptance_timeout_seconds': DISPATCH_DRIVER_ACCEPTANCE_TIMEOUT_SECONDS,
                'dispatch_expires_at': dispatch_expires_at.isoformat() if dispatch_expires_at else None,
                'timestamp': get_ist_now().isoformat()
            },
            room=user_room(driver_id),
        )
        await notify_driver_ride_request(driver_id, booking_id)


async def ride_dispatch_worker():
    while True:
        try:
            booking_id = await dequeue_next_ride()
            if not booking_id:
                await asyncio.sleep(2)
                continue

            booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
            if not booking or booking_status_value(booking.get("status")) != BookingStatus.PENDING.value:
                await remove_ride_from_queue(booking_id)
                continue

            if booking.get("driver_id"):
                await remove_ride_from_queue(booking_id)
                continue

            active_driver = active_dispatch_driver_id(booking)
            expires_at = dispatch_expiry_datetime(booking.get("dispatch_expires_at"))
            if active_driver and expires_at and as_utc_naive(expires_at) > as_utc_naive(get_ist_now()):
                remaining_seconds = max(
                    1,
                    int((as_utc_naive(expires_at) - as_utc_naive(get_ist_now())).total_seconds()),
                )
                await enqueue_ride(booking_id, priority=remaining_seconds)
                continue

            if active_driver:
                await expire_active_dispatch_candidate_if_due(booking, force=True)
            await dispatch_next_candidate_for_booking(
                booking_id,
                reason="driver_timeout" if active_driver else "queue_worker",
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
                # Stale heartbeat is transient presence only. Do not clear the
                # driver's explicit availability choice; the dashboard and next
                # location push should keep a ready driver online.
                await db.drivers.update_one(
                    {"user_id": driver_id},
                    {"$set": {"is_online": False, "last_offline_at": now, "updated_at": now}},
                )
                await cache_delete(f"driver_profile:{driver_id}")

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
    response.headers["Cross-Origin-Opener-Policy"] = "unsafe-none"
    response.headers["Cross-Origin-Embedder-Policy"] = "unsafe-none"
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
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

def expose_included_router_routes_for_route_inventory(fastapi_app: FastAPI) -> None:
    """Expose lazy included-router children for legacy tests and route audits.

    Newer FastAPI versions may keep included routers as lazy wrapper routes.
    Runtime matching still works, but existing route inventory checks inspect
    app.routes directly and expect concrete APIRoute entries.
    """
    expanded_routes = []
    seen_routes = set()

    def remember(route: Any) -> None:
        route_key = (
            getattr(route, "path", None),
            tuple(sorted(getattr(route, "methods", set()) or set())),
            getattr(route, "name", None),
        )
        if route_key not in seen_routes:
            expanded_routes.append(route)
            seen_routes.add(route_key)

    for route in list(fastapi_app.router.routes):
        remember(route)
        original_router = getattr(route, "original_router", None)
        if original_router is None:
            continue
        for child_route in getattr(original_router, "routes", []) or []:
            remember(child_route)

    fastapi_app.router.routes = expanded_routes

# Include the router in the main app and mount Socket.IO under both legacy
# /socket.io and current /ws/socket.io paths. Serving both paths avoids
# frontend/backend deploy-order mismatches during rolling releases.
register_modular_routers(app)
app.include_router(api_router)
app.include_router(user_mode_router)
app.include_router(premium_ui_router)
app.include_router(ai_visibility_router)
app.include_router(places_router)
app.include_router(guardian_ai_router)
app.include_router(ai_predictor_router)
app.include_router(smart_intent_router)
expose_included_router_routes_for_route_inventory(app)
app.mount("/socket.io", root_socket_app)
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
    if hasattr(app.state, 'mongo_client') and app.state.mongo_client:
        try:
            app.state.mongo_client.close()
        except Exception:
            pass
