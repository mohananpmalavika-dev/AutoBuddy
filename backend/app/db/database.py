"""
SQLAlchemy Database Configuration for Passenger Features
Sets up SQLAlchemy ORM for all 10 feature models
"""

import logging
import os

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.models_features import Base

logger = logging.getLogger(__name__)

LOCAL_SQLITE_DATABASE_URL = "sqlite:///./autobuddy_features.db"
FEATURE_DATABASE_ENV_VARS = (
    "FEATURE_DATABASE_URL",
    "PASSENGER_FEATURE_DATABASE_URL",
    "SQLALCHEMY_DATABASE_URL",
)
PRODUCTION_ENVIRONMENTS = {"production", "staging"}


def _normalize_database_url(database_url: str) -> str:
    normalized = str(database_url or "").strip()
    if normalized.startswith("postgres://"):
        return f"postgresql://{normalized[len('postgres://'):]}"
    return normalized


def _is_production_environment(environ=None) -> bool:
    source = environ if environ is not None else os.environ
    return str(source.get("ENVIRONMENT", "development")).strip().lower() in PRODUCTION_ENVIRONMENTS


def _is_sqlite_url(database_url: str) -> bool:
    return str(database_url or "").strip().lower().startswith("sqlite:")


def _is_postgresql_url(database_url: str) -> bool:
    normalized = str(database_url or "").strip().lower()
    return normalized.startswith("postgresql:") or normalized.startswith("postgresql+")


def resolve_feature_database_url(environ=None) -> tuple[str, str]:
    """Resolve the SQL store for passenger feature routes.

    DATABASE_URL is intentionally not used here because this backend also uses
    it as a MongoDB fallback alias for core users/bookings.
    """
    source = environ if environ is not None else os.environ
    for env_name in FEATURE_DATABASE_ENV_VARS:
        configured = _normalize_database_url(source.get(env_name, ""))
        if configured:
            return configured, env_name

    if _is_production_environment(source):
        raise RuntimeError(
            "Passenger feature routes require FEATURE_DATABASE_URL, "
            "PASSENGER_FEATURE_DATABASE_URL, or SQLALCHEMY_DATABASE_URL in "
            "production/staging. Local SQLite fallback is disabled; DATABASE_URL "
            "is reserved for the primary Mongo connection alias."
        )

    return LOCAL_SQLITE_DATABASE_URL, "development default"


# Database URL Configuration
DATABASE_URL, DATABASE_URL_SOURCE = resolve_feature_database_url()
if _is_production_environment() and not _is_postgresql_url(DATABASE_URL):
    raise RuntimeError(
        "Passenger feature database must use durable PostgreSQL in production/staging. "
        "Set FEATURE_DATABASE_URL to a postgresql:// database URL."
    )

# Create engine with appropriate configuration
if _is_sqlite_url(DATABASE_URL):
    # SQLite configuration (development)
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        echo=os.environ.get("SQL_ECHO", "false").lower() == "true"
    )
else:
    # PostgreSQL or other database (production)
    engine = create_engine(
        DATABASE_URL,
        pool_size=20,
        max_overflow=40,
        pool_pre_ping=True,
        echo=os.environ.get("SQL_ECHO", "false").lower() == "true"
    )

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """Dependency function for database session in FastAPI"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all database tables"""
    Base.metadata.create_all(bind=engine)


# Initialize tables on import
try:
    init_db()
except Exception as e:
    if _is_production_environment():
        raise RuntimeError("Could not initialize passenger feature database tables.") from e
    logger.warning("Could not initialize passenger feature database tables: %s", e)
