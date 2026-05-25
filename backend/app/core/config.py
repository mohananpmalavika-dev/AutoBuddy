import os
from dataclasses import dataclass
from functools import lru_cache
from typing import List, Optional
from urllib.parse import urlparse


def _clean_origin_token(value: str) -> str:
    token = str(value or "").strip()
    if not token:
        return ""
    # Handle env values wrapped in single/double quotes.
    while len(token) >= 2 and token[0] == token[-1] and token[0] in {"'", '"'}:
        token = token[1:-1].strip()
    return token.rstrip("/")


def _clean_secret_token(value: str) -> str:
    token = str(value or "").strip()
    if not token:
        return ""
    # Handle env values wrapped in single/double quotes.
    while len(token) >= 2 and token[0] == token[-1] and token[0] in {"'", '"'}:
        token = token[1:-1].strip()
    # Handle accidental Python bytes literal format: b'...'
    if len(token) >= 4 and token[0] in {"b", "B"} and token[1] in {"'", '"'} and token[-1] == token[1]:
        token = token[2:-1].strip()
    return token


def build_allowed_origins(raw_origins: str) -> List[str]:
    values = [_clean_origin_token(origin) for origin in str(raw_origins or "").split(",")]
    values = [origin for origin in values if origin]
    if not values:
        return []
    if "*" in values:
        return ["*"]

    expanded: List[str] = []
    for raw_origin in values:
        origin = _clean_origin_token(raw_origin)
        if not origin:
            continue
        # Allow bare domains in env vars by normalizing to HTTPS.
        if "://" not in origin and "." in origin and "/" not in origin:
            origin = f"https://{origin}"
        if origin not in expanded:
            expanded.append(origin)
        parsed = urlparse(origin)
        hostname = (parsed.hostname or "").lower()
        if not hostname or hostname in {"localhost", "127.0.0.1"}:
            continue
        scheme = parsed.scheme or "https"
        port_part = f":{parsed.port}" if parsed.port else ""
        alt_host = hostname[4:] if hostname.startswith("www.") else f"www.{hostname}"
        alt_origin = f"{scheme}://{alt_host}{port_part}"
        if alt_origin not in expanded:
            expanded.append(alt_origin)
    return expanded


def _get_env_int(name: str, default: int, min_value: int, max_value: int) -> int:
    raw = os.environ.get(name, str(default)).strip()
    try:
        value = int(raw)
    except (TypeError, ValueError) as exc:
        raise RuntimeError(f"Environment variable {name} must be an integer.") from exc
    if value < min_value or value > max_value:
        raise RuntimeError(f"Environment variable {name} must be between {min_value} and {max_value}.")
    return value


def _get_optional_env(name: str) -> Optional[str]:
    value = os.environ.get(name)
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _resolve_default_allowed_origins(environment: str) -> str:
    if environment in {"production", "staging"}:
        # Prefer explicit frontend origin; fall back to Render public URL.
        for name in ("FRONTEND_ORIGIN", "FRONTEND_URL", "RENDER_EXTERNAL_URL"):
            value = os.environ.get(name, "").strip().rstrip("/")
            if value:
                return value
        return ""
    return "http://localhost:3000,http://127.0.0.1:3000"


def _get_secret(name: str) -> str:
    value = _clean_secret_token(os.environ.get(name, ""))
    if value:
        return value
    secret_file = _clean_secret_token(os.environ.get(f"{name}_FILE", ""))
    if secret_file:
        try:
            with open(secret_file, "r", encoding="utf-8") as handle:
                file_value = _clean_secret_token(handle.read())
                if file_value:
                    return file_value
        except OSError as exc:
            raise RuntimeError(f"Unable to read secret file for {name}.") from exc
    return ""


def _get_mongo_url() -> str:
    """Resolve Mongo URL from canonical or legacy env names."""
    mongo_url = _clean_origin_token(os.environ.get("MONGO_URL", ""))
    if mongo_url:
        return mongo_url
    return _clean_origin_token(os.environ.get("DATABASE_URL", ""))


@dataclass(frozen=True)
class Settings:
    mongo_url: str
    db_name: str
    jwt_secret: str
    jwt_refresh_secret: str
    fernet_secret: str
    jwt_algorithm: str
    jwt_expiration_hours: int
    environment: str
    is_production_env: bool
    allowed_origins: List[str]
    cors_allow_origin_regex: str
    otp_expiry_minutes: int
    otp_resend_cooldown_seconds: int
    login_throttle_window_minutes: int
    login_throttle_max_attempts: int
    api_rate_limit_window_seconds: int
    api_rate_limit_max_requests: int
    google_oauth_client_id: str
    mongo_server_selection_timeout_ms: int
    mongo_connect_timeout_ms: int
    mongo_socket_timeout_ms: int
    bootstrap_admin_email: Optional[str]
    bootstrap_admin_name: Optional[str]
    bootstrap_admin_phone: Optional[str]
    bootstrap_admin_password: Optional[str]


@lru_cache
def get_settings() -> Settings:
    environment = os.environ.get("ENVIRONMENT", "development").lower()
    default_allowed_origins = _resolve_default_allowed_origins(environment)
    mongo_url = _get_mongo_url()
    if not mongo_url:
        raise RuntimeError(
            "MONGO_URL must be configured via environment. "
            "DATABASE_URL is supported as a fallback alias."
        )
    allowed_origins = build_allowed_origins(
        os.environ.get("ALLOWED_ORIGINS", default_allowed_origins)
    )
    if environment in {"production", "staging"}:
        sanitized_prod_origins: List[str] = []
        for origin in allowed_origins:
            parsed = urlparse(origin)
            hostname = (parsed.hostname or "").lower()
            scheme = (parsed.scheme or "").lower()
            if not hostname or hostname in {"localhost", "127.0.0.1"}:
                continue
            if scheme != "https":
                continue
            normalized = f"{scheme}://{hostname}"
            if parsed.port:
                normalized = f"{normalized}:{parsed.port}"
            if normalized not in sanitized_prod_origins:
                sanitized_prod_origins.append(normalized)
        allowed_origins = sanitized_prod_origins
    return Settings(
        mongo_url=mongo_url,
        db_name=os.environ.get("DB_NAME", "autorickshaw_db"),
        jwt_secret=_get_secret("JWT_SECRET"),
        jwt_refresh_secret=_get_secret("JWT_REFRESH_SECRET"),
        fernet_secret=_get_secret("FERNET_SECRET"),
        jwt_algorithm="HS256",
        jwt_expiration_hours=24 * 7,
        environment=environment,
        is_production_env=environment in {"production", "staging"},
        allowed_origins=allowed_origins,
        cors_allow_origin_regex=os.environ.get(
            "ALLOWED_ORIGIN_REGEX",
            r"^https://([a-z0-9-]+\.)?auto-buddy\.in$",
        ).strip(),
        otp_expiry_minutes=_get_env_int("OTP_EXPIRY_MINUTES", 5, 1, 30),
        otp_resend_cooldown_seconds=_get_env_int("OTP_RESEND_COOLDOWN_SECONDS", 40, 10, 300),
        login_throttle_window_minutes=_get_env_int("LOGIN_THROTTLE_WINDOW_MINUTES", 10, 1, 120),
        login_throttle_max_attempts=_get_env_int("LOGIN_THROTTLE_MAX_ATTEMPTS", 8, 1, 50),
        api_rate_limit_window_seconds=_get_env_int("API_RATE_LIMIT_WINDOW_SECONDS", 60, 10, 3600),
        api_rate_limit_max_requests=_get_env_int("API_RATE_LIMIT_MAX_REQUESTS", 320, 10, 10000),
        google_oauth_client_id=os.environ.get(
            "GOOGLE_OAUTH_CLIENT_ID",
            os.environ.get("GOOGLE_CLIENT_ID", ""),
        ).strip(),
        mongo_server_selection_timeout_ms=_get_env_int("MONGO_SERVER_SELECTION_TIMEOUT_MS", 5000, 1000, 60000),
        mongo_connect_timeout_ms=_get_env_int("MONGO_CONNECT_TIMEOUT_MS", 5000, 1000, 60000),
        mongo_socket_timeout_ms=_get_env_int("MONGO_SOCKET_TIMEOUT_MS", 10000, 1000, 120000),
        bootstrap_admin_email=_get_optional_env("BOOTSTRAP_ADMIN_EMAIL"),
        bootstrap_admin_name=_get_optional_env("BOOTSTRAP_ADMIN_NAME"),
        bootstrap_admin_phone=_get_optional_env("BOOTSTRAP_ADMIN_PHONE"),
        bootstrap_admin_password=_get_secret("BOOTSTRAP_ADMIN_PASSWORD") or None,
    )
