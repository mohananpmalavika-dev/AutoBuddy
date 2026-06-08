import os
from dataclasses import dataclass
from urllib.parse import urlparse


PRODUCTION_ENVIRONMENTS = {"production", "staging"}
WEAK_SECRET_VALUES = {
    "autorickshaw-secret-key-change-in-production",
    "changeme",
    "default",
    "secret",
}


def _clean_env(value: str) -> str:
    cleaned = str(value or "").strip()
    while len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in {"'", '"'}:
        cleaned = cleaned[1:-1].strip()
    return cleaned


def _get_bool(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _get_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)).strip())
    except (TypeError, ValueError):
        return default


def _get_feature_database_url() -> str:
    for name in ("FEATURE_DATABASE_URL", "PASSENGER_FEATURE_DATABASE_URL", "SQLALCHEMY_DATABASE_URL"):
        value = _clean_env(os.getenv(name, ""))
        if value.startswith("postgres://"):
            return f"postgresql://{value[len('postgres://'):]}"
        if value:
            return value
    return ""


def _is_postgresql_url(value: str) -> bool:
    normalized = value.strip().lower()
    return normalized.startswith("postgresql:") or normalized.startswith("postgresql+")


def _is_mongo_url(value: str) -> bool:
    normalized = value.strip().lower()
    return normalized.startswith("mongodb://") or normalized.startswith("mongodb+srv://")


def _split_origins(value: str) -> list[str]:
    return [origin.strip().rstrip("/") for origin in str(value or "").split(",") if origin.strip()]


def _has_only_public_https_origins(origins: list[str]) -> bool:
    if not origins or "*" in origins:
        return False
    for origin in origins:
        parsed = urlparse(origin)
        hostname = (parsed.hostname or "").lower()
        if parsed.scheme.lower() != "https":
            return False
        if hostname in {"localhost", "127.0.0.1", "0.0.0.0"}:
            return False
    return True


@dataclass
class ProductionConfig:
    """Production environment configuration"""
    
    # Server
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development").strip().lower()
    DEBUG: bool = _get_bool("DEBUG", False)
    
    # Database
    MONGO_URL: str = _clean_env(os.getenv("MONGO_URL") or os.getenv("DATABASE_URL", ""))
    DB_NAME: str = _clean_env(os.getenv("DB_NAME", ""))
    FEATURE_DATABASE_URL: str = _get_feature_database_url()
    MONGO_MAX_POOL_SIZE: int = _get_int("MONGO_MAX_POOL_SIZE", 300)
    MONGO_MIN_POOL_SIZE: int = _get_int("MONGO_MIN_POOL_SIZE", 10)
    MONGO_WAIT_QUEUE_TIMEOUT_MS: int = _get_int("MONGO_WAIT_QUEUE_TIMEOUT_MS", 15000)
    DATABASE_POOL_SIZE: int = _get_int("DATABASE_POOL_SIZE", 20)
    DATABASE_MAX_OVERFLOW: int = _get_int("DATABASE_MAX_OVERFLOW", 40)
    DATABASE_POOL_TIMEOUT: int = _get_int("DATABASE_POOL_TIMEOUT", 30)
    
    # Security
    JWT_SECRET: str = _clean_env(os.getenv("JWT_SECRET", os.getenv("JWT_SECRET_KEY", "")))
    JWT_REFRESH_SECRET: str = _clean_env(os.getenv("JWT_REFRESH_SECRET", ""))
    JWT_EXPIRATION_HOURS: int = _get_int("JWT_EXPIRATION_HOURS", 24)
    REFRESH_TOKEN_EXPIRATION_DAYS: int = _get_int("REFRESH_TOKEN_EXPIRATION_DAYS", 7)
    
    # Redis
    REDIS_URL: str = _clean_env(os.getenv("REDIS_URL", ""))
    REDIS_POOL_SIZE: int = _get_int("REDIS_POOL_SIZE", 10)
    REQUIRE_REDIS_IN_PRODUCTION: bool = _get_bool("REQUIRE_REDIS_IN_PRODUCTION", False)
    
    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = _get_bool("RATE_LIMIT_ENABLED", True)
    RATE_LIMIT_AUTH_REQUESTS_PER_MINUTE: int = _get_int("RATE_LIMIT_AUTH_REQUESTS_PER_MINUTE", 5)
    RATE_LIMIT_PAYMENT_REQUESTS_PER_MINUTE: int = _get_int("RATE_LIMIT_PAYMENT_REQUESTS_PER_MINUTE", 10)
    RATE_LIMIT_API_REQUESTS_PER_MINUTE: int = _get_int("RATE_LIMIT_API_REQUESTS_PER_MINUTE", 100)
    
    # File Upload
    MAX_UPLOAD_SIZE_MB: int = _get_int("MAX_UPLOAD_SIZE_MB", 50)
    UPLOAD_DIRECTORY: str = os.getenv("UPLOAD_DIRECTORY", "/tmp/uploads")
    
    # Monitoring
    SENTRY_DSN: str = os.getenv("SENTRY_DSN", "")
    ENABLE_METRICS: bool = _get_bool("ENABLE_METRICS", True)
    ENABLE_TRACING: bool = _get_bool("ENABLE_TRACING", False)
    
    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FORMAT: str = os.getenv("LOG_FORMAT", "json")  # json or text
    
    # API
    API_TIMEOUT_SECONDS: int = _get_int("API_TIMEOUT_SECONDS", 30)
    ALLOWED_ORIGINS: str = os.getenv("ALLOWED_ORIGINS", os.getenv("CORS_ORIGINS", ""))
    CORS_ORIGINS: str = ALLOWED_ORIGINS
    
    # Payment
    STRIPE_SECRET_KEY: str = os.getenv("STRIPE_SECRET_KEY", "")
    STRIPE_WEBHOOK_SECRET: str = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    PAYMENT_TIMEOUT_SECONDS: int = _get_int("PAYMENT_TIMEOUT_SECONDS", 30)
    
    @classmethod
    def validate_production(cls) -> tuple[bool, list[str]]:
        """Validate production configuration"""
        config = cls()
        errors = []
        is_production_env = config.ENVIRONMENT in PRODUCTION_ENVIRONMENTS
        
        # Required for production
        if is_production_env:
            if not config.MONGO_URL or not _is_mongo_url(config.MONGO_URL):
                errors.append("MONGO_URL must be a mongodb:// or mongodb+srv:// URL in production/staging")
            if not config.FEATURE_DATABASE_URL or not _is_postgresql_url(config.FEATURE_DATABASE_URL):
                errors.append("FEATURE_DATABASE_URL must be a postgresql:// URL in production/staging")
            if not config.JWT_SECRET:
                errors.append("JWT_SECRET must be set in production/staging")
            if len(config.JWT_SECRET or "") < 32:
                errors.append("JWT_SECRET must be at least 32 characters")
            if (config.JWT_SECRET or "").strip().lower() in WEAK_SECRET_VALUES:
                errors.append("JWT_SECRET is too weak")
            if not _has_only_public_https_origins(_split_origins(config.ALLOWED_ORIGINS)):
                errors.append("ALLOWED_ORIGINS must list explicit public HTTPS origins in production/staging")
            if not config.REDIS_URL:
                errors.append("REDIS_URL must be configured for multi-instance production stability")
            if not config.SENTRY_DSN and not config.ENABLE_METRICS:
                errors.append("SENTRY_DSN or ENABLE_METRICS must be configured for production observability")
        
        return len(errors) == 0, errors
    
    def get_logging_config(self) -> dict:
        """Get logging configuration"""
        return {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "json": {
                    "format": '{"timestamp": "%(asctime)s", "level": "%(levelname)s", "message": "%(message)s"}'
                },
                "text": {
                    "format": "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
                }
            },
            "handlers": {
                "console": {
                    "class": "logging.StreamHandler",
                    "formatter": self.LOG_FORMAT,
                    "level": self.LOG_LEVEL
                }
            },
            "root": {
                "handlers": ["console"],
                "level": self.LOG_LEVEL
            }
        }


class ProductionChecklist:
    """Pre-production deployment checklist"""
    
    @staticmethod
    def run_checks() -> dict:
        """Run all production checks"""
        config = ProductionConfig()
        checks = {
            "configuration": ProductionChecklist._check_configuration(config),
            "security": ProductionChecklist._check_security(config),
            "database": ProductionChecklist._check_database(config),
            "realtime_and_cache": ProductionChecklist._check_realtime_and_cache(config),
            "api": ProductionChecklist._check_api(config),
            "observability": ProductionChecklist._check_observability(config),
        }
        return checks
    
    @staticmethod
    def _check_configuration(config: ProductionConfig) -> dict:
        """Check configuration"""
        is_production_env = config.ENVIRONMENT in PRODUCTION_ENVIRONMENTS
        return {
            "environment_set": bool(config.ENVIRONMENT),
            "debug_disabled": not config.DEBUG,
            "production_or_staging": is_production_env,
            "primary_mongo_configured": bool(config.MONGO_URL),
            "all_checks_passed": (
                bool(config.ENVIRONMENT) and
                not config.DEBUG and
                (not is_production_env or bool(config.MONGO_URL))
            )
        }
    
    @staticmethod
    def _check_security(config: ProductionConfig) -> dict:
        """Check security configuration"""
        is_production_env = config.ENVIRONMENT in PRODUCTION_ENVIRONMENTS
        secret_value = (config.JWT_SECRET or "").strip()
        strong_secret = len(secret_value) >= 32 and secret_value.lower() not in WEAK_SECRET_VALUES
        return {
            "jwt_secret_configured": bool(secret_value),
            "jwt_secret_strong": strong_secret,
            "jwt_refresh_secret_configured": bool(config.JWT_REFRESH_SECRET),
            "https_enforced": is_production_env,
            "rate_limiting_enabled": config.RATE_LIMIT_ENABLED,
            "all_checks_passed": (
                (not is_production_env or strong_secret) and
                config.RATE_LIMIT_ENABLED
            )
        }
    
    @staticmethod
    def _check_database(config: ProductionConfig) -> dict:
        """Check database configuration"""
        is_production_env = config.ENVIRONMENT in PRODUCTION_ENVIRONMENTS
        primary_mongo_ready = bool(config.MONGO_URL) and _is_mongo_url(config.MONGO_URL)
        feature_db_ready = bool(config.FEATURE_DATABASE_URL) and _is_postgresql_url(config.FEATURE_DATABASE_URL)
        return {
            "primary_mongo_configured": bool(config.MONGO_URL),
            "primary_mongo_url_valid": primary_mongo_ready,
            "feature_database_configured": bool(config.FEATURE_DATABASE_URL),
            "feature_database_postgresql": feature_db_ready,
            "mongo_pool_configured": config.MONGO_MAX_POOL_SIZE >= 100,
            "sql_pool_configured": config.DATABASE_POOL_SIZE > 0,
            "timeout_configured": config.DATABASE_POOL_TIMEOUT > 0,
            "all_checks_passed": (
                (not is_production_env or (primary_mongo_ready and feature_db_ready)) and
                config.MONGO_MAX_POOL_SIZE >= 100 and
                config.DATABASE_POOL_SIZE > 0
            )
        }

    @staticmethod
    def _check_realtime_and_cache(config: ProductionConfig) -> dict:
        """Check Redis-backed cache and realtime readiness."""
        is_production_env = config.ENVIRONMENT in PRODUCTION_ENVIRONMENTS
        return {
            "redis_configured": bool(config.REDIS_URL),
            "redis_required_by_startup": config.REQUIRE_REDIS_IN_PRODUCTION,
            "redis_pool_configured": config.REDIS_POOL_SIZE > 0,
            "local_fallback_allowed": not config.REQUIRE_REDIS_IN_PRODUCTION,
            "all_checks_passed": (
                (not is_production_env or bool(config.REDIS_URL)) and
                config.REDIS_POOL_SIZE > 0
            )
        }
    
    @staticmethod
    def _check_api(config: ProductionConfig) -> dict:
        """Check API configuration"""
        is_production_env = config.ENVIRONMENT in PRODUCTION_ENVIRONMENTS
        origins = _split_origins(config.ALLOWED_ORIGINS)
        production_origins_ready = _has_only_public_https_origins(origins)
        return {
            "timeout_configured": config.API_TIMEOUT_SECONDS > 0,
            "cors_configured": bool(origins),
            "cors_public_https_only": production_origins_ready,
            "all_checks_passed": (
                config.API_TIMEOUT_SECONDS > 0 and
                (not is_production_env or production_origins_ready)
            )
        }

    @staticmethod
    def _check_observability(config: ProductionConfig) -> dict:
        """Check monitoring and incident evidence readiness."""
        is_production_env = config.ENVIRONMENT in PRODUCTION_ENVIRONMENTS
        return {
            "sentry_configured": bool(config.SENTRY_DSN),
            "metrics_enabled": config.ENABLE_METRICS,
            "tracing_enabled": config.ENABLE_TRACING,
            "json_logging": config.LOG_FORMAT == "json",
            "all_checks_passed": (
                (not is_production_env or (bool(config.SENTRY_DSN) or config.ENABLE_METRICS)) and
                config.LOG_FORMAT in {"json", "text"}
            )
        }
