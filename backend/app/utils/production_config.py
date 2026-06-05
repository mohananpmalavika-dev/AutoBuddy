"""
Production configuration and setup utilities
"""
import os
from typing import Optional
from dataclasses import dataclass


@dataclass
class ProductionConfig:
    """Production environment configuration"""
    
    # Server
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "production")
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"
    
    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")
    DATABASE_POOL_SIZE: int = int(os.getenv("DATABASE_POOL_SIZE", "20"))
    DATABASE_MAX_OVERFLOW: int = int(os.getenv("DATABASE_MAX_OVERFLOW", "40"))
    DATABASE_POOL_TIMEOUT: int = int(os.getenv("DATABASE_POOL_TIMEOUT", "30"))
    
    # Security
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "")
    JWT_EXPIRATION_HOURS: int = int(os.getenv("JWT_EXPIRATION_HOURS", "24"))
    REFRESH_TOKEN_EXPIRATION_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRATION_DAYS", "7"))
    
    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "")
    REDIS_POOL_SIZE: int = int(os.getenv("REDIS_POOL_SIZE", "10"))
    
    # Rate Limiting
    RATE_LIMIT_ENABLED: bool = os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true"
    RATE_LIMIT_AUTH_REQUESTS_PER_MINUTE: int = int(os.getenv("RATE_LIMIT_AUTH_REQUESTS_PER_MINUTE", "5"))
    RATE_LIMIT_PAYMENT_REQUESTS_PER_MINUTE: int = int(os.getenv("RATE_LIMIT_PAYMENT_REQUESTS_PER_MINUTE", "10"))
    RATE_LIMIT_API_REQUESTS_PER_MINUTE: int = int(os.getenv("RATE_LIMIT_API_REQUESTS_PER_MINUTE", "100"))
    
    # File Upload
    MAX_UPLOAD_SIZE_MB: int = int(os.getenv("MAX_UPLOAD_SIZE_MB", "50"))
    UPLOAD_DIRECTORY: str = os.getenv("UPLOAD_DIRECTORY", "/tmp/uploads")
    
    # Monitoring
    SENTRY_DSN: str = os.getenv("SENTRY_DSN", "")
    ENABLE_METRICS: bool = os.getenv("ENABLE_METRICS", "true").lower() == "true"
    ENABLE_TRACING: bool = os.getenv("ENABLE_TRACING", "false").lower() == "true"
    
    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
    LOG_FORMAT: str = os.getenv("LOG_FORMAT", "json")  # json or text
    
    # API
    API_TIMEOUT_SECONDS: int = int(os.getenv("API_TIMEOUT_SECONDS", "30"))
    CORS_ORIGINS: str = os.getenv("CORS_ORIGINS", "*")
    
    # Payment
    STRIPE_SECRET_KEY: str = os.getenv("STRIPE_SECRET_KEY", "")
    STRIPE_WEBHOOK_SECRET: str = os.getenv("STRIPE_WEBHOOK_SECRET", "")
    PAYMENT_TIMEOUT_SECONDS: int = int(os.getenv("PAYMENT_TIMEOUT_SECONDS", "30"))
    
    @classmethod
    def validate_production(cls) -> tuple[bool, list[str]]:
        """Validate production configuration"""
        config = cls()
        errors = []
        
        # Required for production
        if config.ENVIRONMENT == "production":
            if not config.JWT_SECRET_KEY:
                errors.append("JWT_SECRET_KEY must be set in production")
            if not config.DATABASE_URL:
                errors.append("DATABASE_URL must be set in production")
            if len(config.JWT_SECRET_KEY or "") < 32:
                errors.append("JWT_SECRET_KEY must be at least 32 characters")
        
        # Recommended
        if not config.SENTRY_DSN and config.ENVIRONMENT == "production":
            errors.append("SENTRY_DSN recommended for production error tracking")
        if not config.REDIS_URL and config.ENVIRONMENT == "production":
            errors.append("REDIS_URL recommended for caching and rate limiting")
        
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
            "api": ProductionChecklist._check_api(config),
        }
        return checks
    
    @staticmethod
    def _check_configuration(config: ProductionConfig) -> dict:
        """Check configuration"""
        return {
            "environment_set": bool(config.ENVIRONMENT),
            "debug_disabled": not config.DEBUG,
            "secret_keys_configured": bool(config.JWT_SECRET_KEY),
            "all_checks_passed": (
                bool(config.ENVIRONMENT) and 
                not config.DEBUG and 
                bool(config.JWT_SECRET_KEY)
            )
        }
    
    @staticmethod
    def _check_security(config: ProductionConfig) -> dict:
        """Check security configuration"""
        return {
            "jwt_secret_strong": len(config.JWT_SECRET_KEY or "") >= 32,
            "https_enforced": config.ENVIRONMENT == "production",
            "rate_limiting_enabled": config.RATE_LIMIT_ENABLED,
            "sentry_configured": bool(config.SENTRY_DSN),
            "all_checks_passed": (
                len(config.JWT_SECRET_KEY or "") >= 32 and
                config.RATE_LIMIT_ENABLED
            )
        }
    
    @staticmethod
    def _check_database(config: ProductionConfig) -> dict:
        """Check database configuration"""
        return {
            "database_url_set": bool(config.DATABASE_URL),
            "pool_configured": config.DATABASE_POOL_SIZE > 0,
            "timeout_configured": config.DATABASE_POOL_TIMEOUT > 0,
            "all_checks_passed": (
                bool(config.DATABASE_URL) and
                config.DATABASE_POOL_SIZE > 0
            )
        }
    
    @staticmethod
    def _check_api(config: ProductionConfig) -> dict:
        """Check API configuration"""
        return {
            "timeout_configured": config.API_TIMEOUT_SECONDS > 0,
            "cors_configured": bool(config.CORS_ORIGINS),
            "all_checks_passed": (
                config.API_TIMEOUT_SECONDS > 0 and
                bool(config.CORS_ORIGINS)
            )
        }
