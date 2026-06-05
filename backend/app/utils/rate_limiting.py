"""
Rate limiting utilities for production
"""
import hashlib
import time
import logging
import asyncio
import os
from dataclasses import dataclass
from datetime import datetime
from app.utils.time_helpers import get_ist_now
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

RATE_LIMIT_CONFIG_CACHE_SECONDS = max(30, int(os.environ.get("RATE_LIMIT_CONFIG_CACHE_SECONDS", "120")))
RATE_LIMIT_CONFIG_DB_TIMEOUT_SECONDS = max(
    0.2,
    min(5.0, float(os.environ.get("RATE_LIMIT_CONFIG_DB_TIMEOUT_SECONDS", "0.75"))),
)
RATE_LIMIT_DEFAULTS_SEEDED_KEY = "rate_limit_defaults_seeded"

DEFAULT_RATE_LIMIT_CONFIGS: Dict[str, Dict[str, Any]] = {
    "api_global": {
        "max_requests": 900,
        "window_seconds": 60,
        "description": "Global per-client API guardrail",
    },
    "strict": {
        "max_requests": 250,
        "window_seconds": 60,
        "description": "Strict limit for sensitive endpoints",
    },
    "moderate": {
        "max_requests": 600,
        "window_seconds": 60,
        "description": "Moderate limit for common endpoints",
    },
    "normal": {
        "max_requests": 500,
        "window_seconds": 60,
        "description": "Normal limit for general endpoints",
    },
    "passenger_realtime": {
        "max_requests": 1200,
        "window_seconds": 60,
        "description": "High-frequency passenger map and trip preview reads",
    },
    "driver_realtime": {
        "max_requests": 1200,
        "window_seconds": 60,
        "description": "High-frequency driver dashboard, queue, and location sync",
    },
    "authenticated": {
        "max_requests": 3000,
        "window_seconds": 3600,
        "description": "Per-user limit for authenticated requests",
    },
    "anonymous": {
        "max_requests": 250,
        "window_seconds": 3600,
        "description": "Per-IP limit for anonymous requests",
    },
}

VALID_RATE_LIMIT_TYPES = tuple(DEFAULT_RATE_LIMIT_CONFIGS.keys())
ENDPOINT_RATE_LIMIT_TYPES = ("strict", "moderate", "normal", "passenger_realtime", "driver_realtime")

LOGIN_RATE_LIMIT_EXEMPT_PATHS = (
    "/api/auth/login",
    "/api/auth/google",
    "/api/auth/_legacy/login",
    "/api/auth/_legacy/google",
)

STRICT_ENDPOINT_PATHS = (
    "/api/auth/register",
    "/api/payments/order",
    "/api/payments/verify",
    "/api/admin/audit-log",
)

MODERATE_ENDPOINT_PATHS = (
    "/api/bookings",
    "/api/support/tickets",
)

PASSENGER_REALTIME_ENDPOINT_PATHS = (
    "/api/bookings/active",
    "/api/drivers/nearby",
    "/api/fare/estimate",
    "/api/passengers/blocked-drivers",
    "/api/passengers/favorite-drivers",
    "/api/places/details",
    "/api/places/reverse-geocode",
    "/api/places/search",
    "/api/ride-products/availability",
    "/api/spin-win/config",
)

DRIVER_REALTIME_ENDPOINT_PATHS = (
    "/api/drivers/profile",
    "/api/drivers/availability",
    "/api/drivers/readiness",
    "/api/drivers/pending-requests",
    "/api/drivers/active-ride",
    "/api/drivers/upcoming-rides",
    "/api/drivers/location",
    "/api/drivers/menu-badges",
    "/api/drivers/blocked-passengers",
    "/api/drivers/settings",
    "/api/drivers/vehicles",
    "/api/drivers/earnings",
    "/api/drivers/fare-calculator",
    "/api/pricing/rules",
)

NORMAL_ENDPOINT_PATHS = (
    "/api/vehicle-types",
    "/api/vehicles/types",
)

DEFAULT_ENDPOINT_RATE_LIMITS = tuple(
    [
        {
            "endpoint": endpoint,
            "limit_type": "strict",
            "description": "Default strict endpoint limit",
        }
        for endpoint in STRICT_ENDPOINT_PATHS
    ]
    + [
        {
            "endpoint": endpoint,
            "limit_type": "passenger_realtime",
            "description": "Default live passenger map and trip preview limit",
        }
        for endpoint in PASSENGER_REALTIME_ENDPOINT_PATHS
    ]
    + [
        {
            "endpoint": endpoint,
            "limit_type": "driver_realtime",
            "description": "Default live driver dashboard and ride queue limit",
        }
        for endpoint in DRIVER_REALTIME_ENDPOINT_PATHS
    ]
    + [
        {
            "endpoint": endpoint,
            "limit_type": "normal",
            "description": "Default normal endpoint limit for polling reads",
        }
        for endpoint in NORMAL_ENDPOINT_PATHS
    ]
    + [
        {
            "endpoint": endpoint,
            "limit_type": "moderate",
            "description": "Default moderate endpoint limit",
        }
        for endpoint in MODERATE_ENDPOINT_PATHS
    ]
)


@dataclass(frozen=True)
class RateLimitRule:
    """Resolved rate limit rule used by runtime middleware."""

    limit_type: str
    max_requests: int
    window_seconds: int
    bucket_name: str
    source: str = "defaults"


_rate_limit_config_cache: Dict[str, Any] = {
    "loaded_at": 0.0,
    "settings": None,
    "db_id": None,
}


class SimpleInMemoryRateLimiter:
    """
    In-memory rate limiter for single-instance deployments
    For distributed deployments, use Redis-based rate limiter
    """
    
    def __init__(self):
        self.requests: Dict[str, list] = {}  # key -> list of timestamps
        self.cleanup_interval = 60  # seconds
    
    def is_allowed(self, key: str, max_requests: int, window_seconds: int) -> bool:
        """
        Check if request is allowed under rate limit
        
        Args:
            key: Rate limit key (e.g., user_id, IP address)
            max_requests: Maximum requests allowed
            window_seconds: Time window in seconds
        
        Returns:
            True if request is allowed, False if rate limited
        """
        now = time.time()
        
        if key not in self.requests:
            self.requests[key] = []
        
        # Remove old requests outside window
        cutoff = now - window_seconds
        self.requests[key] = [ts for ts in self.requests[key] if ts > cutoff]
        
        # Check if under limit
        if len(self.requests[key]) < max_requests:
            self.requests[key].append(now)
            return True
        
        return False
    
    def get_retry_after(self, key: str, window_seconds: int) -> int:
        """Get seconds until next request is allowed"""
        if key not in self.requests or not self.requests[key]:
            return 0
        
        oldest_request = min(self.requests[key])
        retry_after = int((oldest_request + window_seconds - time.time()) + 1)
        return max(0, retry_after)
    
    def cleanup(self):
        """Remove old entries to prevent memory leak"""
        now = time.time()
        keys_to_remove = []
        
        for key, timestamps in self.requests.items():
            # Keep only recent requests (last hour)
            self.requests[key] = [ts for ts in timestamps if now - ts < 3600]
            if not self.requests[key]:
                keys_to_remove.append(key)
        
        for key in keys_to_remove:
            del self.requests[key]


class RedisRateLimiter:
    """
    Redis-based rate limiter for distributed deployments
    Requires redis.asyncio
    """
    
    def __init__(self, redis_client):
        self.redis = redis_client
        self.prefix = "ratelimit:"
    
    async def is_allowed(
        self,
        key: str,
        max_requests: int,
        window_seconds: int
    ) -> bool:
        """Check if request is allowed under rate limit"""
        try:
            redis_key = f"{self.prefix}{key}"
            
            # Increment counter
            current = await self.redis.incr(redis_key)
            
            # Set expiration on first request
            if current == 1:
                await self.redis.expire(redis_key, window_seconds)
            
            return current <= max_requests
        except Exception as e:
            logger.error(f"Rate limiter error: {str(e)}")
            # Allow request if rate limiter fails
            return True
    
    async def get_retry_after(self, key: str) -> int:
        """Get seconds until next request is allowed"""
        try:
            redis_key = f"{self.prefix}{key}"
            ttl = await self.redis.ttl(redis_key)
            return max(0, ttl)
        except Exception:
            return 0


class RateLimitConfig:
    """Rate limiting configuration"""
    
    # Endpoints that require strict rate limiting
    STRICT_LIMIT = DEFAULT_RATE_LIMIT_CONFIGS["strict"]["max_requests"]
    STRICT_ENDPOINTS = set(STRICT_ENDPOINT_PATHS)
    
    # Endpoints with moderate rate limiting
    MODERATE_LIMIT = DEFAULT_RATE_LIMIT_CONFIGS["moderate"]["max_requests"]
    MODERATE_ENDPOINTS = set(MODERATE_ENDPOINT_PATHS)
    
    # Most endpoints
    NORMAL_LIMIT = DEFAULT_RATE_LIMIT_CONFIGS["normal"]["max_requests"]

    # High-frequency passenger map reads
    PASSENGER_REALTIME_LIMIT = DEFAULT_RATE_LIMIT_CONFIGS["passenger_realtime"]["max_requests"]
    PASSENGER_REALTIME_ENDPOINTS = set(PASSENGER_REALTIME_ENDPOINT_PATHS)

    # High-frequency driver dashboard reads and location sync
    DRIVER_REALTIME_LIMIT = DEFAULT_RATE_LIMIT_CONFIGS["driver_realtime"]["max_requests"]
    DRIVER_REALTIME_ENDPOINTS = set(DRIVER_REALTIME_ENDPOINT_PATHS)
    
    # Per-user limits
    AUTHENTICATED_LIMIT = DEFAULT_RATE_LIMIT_CONFIGS["authenticated"]["max_requests"]
    ANONYMOUS_LIMIT = DEFAULT_RATE_LIMIT_CONFIGS["anonymous"]["max_requests"]


def get_rate_limit_key(request) -> str:
    """
    Generate rate limit key based on request
    Prefers authenticated user ID or bearer-token identity, falls back to IP address
    """
    # Try to get user ID from AuthenticationMiddleware without forcing
    # Starlette's request.user property when that middleware is not installed.
    scope_user = getattr(request, "scope", {}).get("user")
    if scope_user is not None and hasattr(scope_user, "id"):
        return f"user:{scope_user.id}"

    auth_header = str(getattr(request, "headers", {}).get("authorization") or "").strip()
    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() == "bearer" and token.strip():
        token_hash = hashlib.sha256(token.strip().encode("utf-8")).hexdigest()[:24]
        return f"token:{token_hash}"
    
    # Fall back to IP address
    client_ip = request.client.host if request.client else "unknown"
    return f"ip:{client_ip}"


def clear_rate_limit_config_cache() -> None:
    """Clear cached DB rate-limit settings after an admin update."""
    _rate_limit_config_cache["loaded_at"] = 0.0
    _rate_limit_config_cache["settings"] = None
    _rate_limit_config_cache["db_id"] = None


def normalize_endpoint_path(endpoint: str) -> str:
    """Normalize endpoint paths for matching and storage."""
    path = str(endpoint or "").strip().split("?", 1)[0]
    if not path:
        return "/"
    path = f"/{path.lstrip('/')}"
    if len(path) > 1:
        path = path.rstrip("/")
    return path.lower()


def is_login_rate_limit_exempt_path(endpoint: str) -> bool:
    return normalize_endpoint_path(endpoint) in LOGIN_RATE_LIMIT_EXEMPT_PATHS


def _coerce_positive_int(value: Any, fallback: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = int(fallback)
    return max(1, parsed)


def _is_enabled(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return True
    return str(value).strip().lower() not in {"0", "false", "no", "off", "disabled"}


def get_default_limit_type_for_endpoint(endpoint: str) -> str:
    """Fallback classification used only when DB settings are unavailable."""
    normalized = normalize_endpoint_path(endpoint)
    if normalized in RateLimitConfig.STRICT_ENDPOINTS:
        return "strict"
    if normalized in RateLimitConfig.PASSENGER_REALTIME_ENDPOINTS:
        return "passenger_realtime"
    if normalized in RateLimitConfig.DRIVER_REALTIME_ENDPOINTS:
        return "driver_realtime"
    if normalized in RateLimitConfig.MODERATE_ENDPOINTS:
        return "moderate"
    return "normal"


def _normalize_limit_doc(limit_type: str, doc: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    defaults = DEFAULT_RATE_LIMIT_CONFIGS[limit_type]
    payload = doc or {}
    return {
        "limit_type": limit_type,
        "max_requests": _coerce_positive_int(payload.get("max_requests"), defaults["max_requests"]),
        "window_seconds": _coerce_positive_int(payload.get("window_seconds"), defaults["window_seconds"]),
        "description": payload.get("description") or defaults.get("description"),
        "enabled": _is_enabled(payload.get("enabled", True)),
        "source": payload.get("source") or "defaults",
    }


def _normalize_endpoint_doc(doc: Dict[str, Any], limits: Dict[str, Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    endpoint = normalize_endpoint_path(doc.get("endpoint") or doc.get("endpoint_path"))
    if endpoint == "/":
        return None

    raw_limit_type = str(doc.get("limit_type") or get_default_limit_type_for_endpoint(endpoint)).strip().lower()
    limit_type = raw_limit_type if raw_limit_type in ENDPOINT_RATE_LIMIT_TYPES else "normal"
    profile = limits.get(limit_type) or _normalize_limit_doc("normal")
    return {
        "endpoint": endpoint,
        "limit_type": limit_type,
        "max_requests": _coerce_positive_int(doc.get("max_requests"), profile["max_requests"]),
        "window_seconds": _coerce_positive_int(doc.get("window_seconds"), profile["window_seconds"]),
        "description": doc.get("description") or "",
        "enabled": _is_enabled(doc.get("enabled", True)),
        "source": doc.get("source") or "database",
    }


def _default_limit_settings() -> Dict[str, Any]:
    limits = {
        limit_type: _normalize_limit_doc(limit_type)
        for limit_type in DEFAULT_RATE_LIMIT_CONFIGS
    }
    endpoints = []
    for endpoint_config in DEFAULT_ENDPOINT_RATE_LIMITS:
        limit_type = endpoint_config["limit_type"]
        profile = limits[limit_type]
        endpoints.append(
            {
                "endpoint": normalize_endpoint_path(endpoint_config["endpoint"]),
                "endpoint_path": normalize_endpoint_path(endpoint_config["endpoint"]),
                "limit_type": limit_type,
                "max_requests": profile["max_requests"],
                "window_seconds": profile["window_seconds"],
                "description": endpoint_config.get("description") or "",
                "enabled": True,
                "source": "defaults",
            }
        )
    return {
        "limits": limits,
        "endpoints": endpoints,
        "source": "defaults",
    }


async def ensure_rate_limit_defaults(db) -> None:
    """Seed editable rate-limit defaults into MongoDB once."""
    if db is None:
        return

    await db.rate_limit_configs.create_index("limit_type", unique=True)
    await db.endpoint_rate_limits.create_index("endpoint", unique=True)

    now = get_ist_now()
    for limit_type, config in DEFAULT_RATE_LIMIT_CONFIGS.items():
        await db.rate_limit_configs.update_one(
            {"limit_type": limit_type},
            {
                "$setOnInsert": {
                    "limit_type": limit_type,
                    "max_requests": int(config["max_requests"]),
                    "window_seconds": int(config["window_seconds"]),
                    "description": config.get("description"),
                    "enabled": True,
                    "source": "system-default",
                    "created_at": now,
                    "updated_at": now,
                }
            },
            upsert=True,
        )
        await db.rate_limit_configs.update_one(
            {
                "limit_type": limit_type,
                "source": {"$in": ["system-default", "defaults", None]},
                "max_requests": {"$lt": int(config["max_requests"])},
            },
            {
                "$set": {
                    "max_requests": int(config["max_requests"]),
                    "updated_at": now,
                }
            },
        )

    for endpoint_config in DEFAULT_ENDPOINT_RATE_LIMITS:
        limit_type = endpoint_config["limit_type"]
        profile = DEFAULT_RATE_LIMIT_CONFIGS[limit_type]
        endpoint = normalize_endpoint_path(endpoint_config["endpoint"])
        await db.endpoint_rate_limits.update_one(
            {"$or": [{"endpoint": endpoint}, {"endpoint_path": endpoint}]},
            {
                "$set": {
                    "endpoint": endpoint,
                    "endpoint_path": endpoint,
                },
                "$setOnInsert": {
                    "limit_type": limit_type,
                    "max_requests": int(profile["max_requests"]),
                    "window_seconds": int(profile["window_seconds"]),
                    "description": endpoint_config.get("description"),
                    "enabled": True,
                    "source": "system-default",
                    "created_at": now,
                    "updated_at": now,
                }
            },
            upsert=True,
        )
        await db.endpoint_rate_limits.update_one(
            {
                "$or": [{"endpoint": endpoint}, {"endpoint_path": endpoint}],
                "source": {"$in": ["system-default", "defaults", None]},
                "max_requests": {"$lt": int(profile["max_requests"])},
            },
            {
                "$set": {
                    "max_requests": int(profile["max_requests"]),
                    "updated_at": now,
                }
            },
        )

    seed_state = await db.system_settings.find_one({"setting_key": RATE_LIMIT_DEFAULTS_SEEDED_KEY})
    if not seed_state or not seed_state.get("setting_value"):
        await db.system_settings.update_one(
            {"setting_key": RATE_LIMIT_DEFAULTS_SEEDED_KEY},
            {
                "$set": {
                    "setting_key": RATE_LIMIT_DEFAULTS_SEEDED_KEY,
                    "setting_value": True,
                    "setting_type": "boolean",
                    "description": "Tracks first-run seeding of editable rate-limit defaults",
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "created_at": now,
                },
            },
            upsert=True,
        )

    login_endpoints = [normalize_endpoint_path(path) for path in LOGIN_RATE_LIMIT_EXEMPT_PATHS]
    await db.endpoint_rate_limits.update_many(
        {"endpoint": {"$in": login_endpoints}},
        {
            "$set": {
                "enabled": False,
                "description": "Login endpoint rate limiting disabled",
                "updated_at": now,
            }
        },
    )
    await db.endpoint_rate_limits.update_many(
        {"endpoint_path": {"$in": login_endpoints}},
        {
            "$set": {
                "enabled": False,
                "description": "Login endpoint rate limiting disabled",
                "updated_at": now,
            }
        },
    )


async def get_rate_limit_settings(db) -> Dict[str, Any]:
    """Load rate-limit profiles and endpoint overrides from MongoDB with fallback defaults."""
    if db is None:
        return _default_limit_settings()

    now = time.monotonic()
    cache_db_id = id(db)
    cached_settings = _rate_limit_config_cache.get("settings")
    if (
        cached_settings is not None
        and _rate_limit_config_cache.get("db_id") == cache_db_id
        and now - float(_rate_limit_config_cache.get("loaded_at") or 0) < RATE_LIMIT_CONFIG_CACHE_SECONDS
    ):
        return cached_settings

    try:
        config_cursor = db.rate_limit_configs.find({})
        endpoint_cursor = db.endpoint_rate_limits.find({})
        try:
            max_time_ms = int(RATE_LIMIT_CONFIG_DB_TIMEOUT_SECONDS * 1000)
            config_cursor = config_cursor.max_time_ms(max_time_ms)
            endpoint_cursor = endpoint_cursor.max_time_ms(max_time_ms)
        except AttributeError:
            pass
        config_docs, endpoint_docs = await asyncio.wait_for(
            asyncio.gather(
                config_cursor.to_list(100),
                endpoint_cursor.to_list(500),
            ),
            timeout=RATE_LIMIT_CONFIG_DB_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        if cached_settings is not None and _rate_limit_config_cache.get("db_id") == cache_db_id:
            logger.warning("Using stale cached rate-limit settings after DB lookup failed: %s", exc)
            return cached_settings
        logger.warning("Falling back to default rate-limit settings: %s", exc)
        return _default_limit_settings()

    limits = {
        limit_type: _normalize_limit_doc(limit_type)
        for limit_type in DEFAULT_RATE_LIMIT_CONFIGS
    }
    for doc in config_docs:
        limit_type = str(doc.get("limit_type") or "").strip().lower()
        if limit_type in DEFAULT_RATE_LIMIT_CONFIGS:
            limits[limit_type] = _normalize_limit_doc(limit_type, doc)

    endpoints: List[Dict[str, Any]] = []
    for doc in endpoint_docs:
        normalized = _normalize_endpoint_doc(doc, limits)
        if normalized:
            endpoints.append(normalized)
    endpoints.sort(key=lambda item: len(item["endpoint"]), reverse=True)

    settings = {
        "limits": limits,
        "endpoints": endpoints,
        "source": "database",
    }
    _rate_limit_config_cache.update(
        {
            "loaded_at": now,
            "settings": settings,
            "db_id": cache_db_id,
        }
    )
    return settings


def _find_endpoint_rule(endpoint: str, endpoints: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    path = normalize_endpoint_path(endpoint)
    matches = []
    for config in endpoints:
        configured_path = normalize_endpoint_path(config.get("endpoint"))
        if path == configured_path or path.startswith(f"{configured_path}/"):
            matches.append((len(configured_path), config))
    for _, config in sorted(matches, key=lambda item: item[0], reverse=True):
        if _is_enabled(config.get("enabled", True)):
            return config
    return None


async def get_rate_limit_profile_rule(
    limit_type: str,
    db=None,
    *,
    bucket_name: Optional[str] = None,
) -> Optional[RateLimitRule]:
    """Resolve a global rate-limit profile by type."""
    normalized_type = str(limit_type or "normal").strip().lower()
    if normalized_type not in DEFAULT_RATE_LIMIT_CONFIGS:
        normalized_type = "normal"

    settings = await get_rate_limit_settings(db)
    profile = settings["limits"].get(normalized_type) or _normalize_limit_doc(normalized_type)
    if not _is_enabled(profile.get("enabled", True)):
        return None

    return RateLimitRule(
        limit_type=normalized_type,
        max_requests=profile["max_requests"],
        window_seconds=profile["window_seconds"],
        bucket_name=bucket_name or normalized_type,
        source=settings.get("source", "defaults"),
    )


async def get_rate_limit_rule_for_path(
    endpoint: str,
    db=None,
    *,
    fallback_limit_type: Optional[str] = None,
) -> Optional[RateLimitRule]:
    """Resolve the active rate-limit rule for a request path."""
    settings = await get_rate_limit_settings(db)
    normalized_endpoint = normalize_endpoint_path(endpoint)
    if is_login_rate_limit_exempt_path(normalized_endpoint):
        return None
    endpoint_config = _find_endpoint_rule(normalized_endpoint, settings["endpoints"])

    if endpoint_config:
        return RateLimitRule(
            limit_type=endpoint_config["limit_type"],
            max_requests=endpoint_config["max_requests"],
            window_seconds=endpoint_config["window_seconds"],
            bucket_name=f"endpoint:{endpoint_config['endpoint']}",
            source=endpoint_config.get("source") or settings.get("source", "database"),
        )

    if fallback_limit_type:
        limit_type = str(fallback_limit_type).strip().lower()
    elif settings.get("source") == "defaults":
        limit_type = get_default_limit_type_for_endpoint(normalized_endpoint)
    else:
        limit_type = "normal"

    return await get_rate_limit_profile_rule(
        limit_type,
        db,
        bucket_name=f"profile:{limit_type}",
    )


def get_rate_limits(endpoint: str) -> Tuple[int, int]:
    """
    Get fallback rate limit (max_requests, window_seconds) for endpoint.
    
    Returns:
        (max_requests, window_seconds)
    """
    limit_type = get_default_limit_type_for_endpoint(endpoint)
    profile = DEFAULT_RATE_LIMIT_CONFIGS[limit_type]
    return (int(profile["max_requests"]), int(profile["window_seconds"]))


# Global rate limiter instance
_rate_limiter: Optional[SimpleInMemoryRateLimiter] = None


def get_rate_limiter() -> SimpleInMemoryRateLimiter:
    """Get or create rate limiter instance"""
    global _rate_limiter
    if _rate_limiter is None:
        _rate_limiter = SimpleInMemoryRateLimiter()
    return _rate_limiter


async def apply_rate_limit(request, limiter) -> Tuple[bool, Optional[int]]:
    """
    Apply rate limiting to request
    
    Returns:
        (is_allowed: bool, retry_after_seconds: Optional[int])
    """
    base_key = get_rate_limit_key(request)
    app_state = getattr(getattr(request, "app", None), "state", None)
    db = getattr(app_state, "db", None)
    rule = await get_rate_limit_rule_for_path(request.url.path, db)
    if rule is None:
        return (True, None)
    max_requests = rule.max_requests
    window_seconds = rule.window_seconds
    key = f"{base_key}:{rule.bucket_name}"
    
    if limiter.is_allowed(key, max_requests, window_seconds):
        return (True, None)
    
    retry_after = limiter.get_retry_after(key, window_seconds)
    return (False, retry_after)
