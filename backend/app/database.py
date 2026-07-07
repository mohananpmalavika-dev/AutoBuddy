"""SQLAlchemy compatibility database configuration."""

import os
from typing import Generator

from sqlalchemy import create_engine, pool
from sqlalchemy.orm import Session, sessionmaker

LOCAL_SQLITE_DATABASE_URL = "sqlite:///./autobuddy_phase1.db"
SQL_DATABASE_ENV_VARS = (
    "FEATURE_DATABASE_URL",
    "PASSENGER_FEATURE_DATABASE_URL",
    "SQLALCHEMY_DATABASE_URL",
    "DATABASE_URL",
)
PRODUCTION_ENVIRONMENTS = {"production", "staging"}


def _normalize_database_url(raw_url: str) -> str:
    database_url = str(raw_url or "").strip()
    while len(database_url) >= 2 and database_url[0] == database_url[-1] and database_url[0] in {"'", '"'}:
        database_url = database_url[1:-1].strip()
    if database_url.startswith("postgres://"):
        return f"postgresql://{database_url[len('postgres://'):]}"
    return database_url


def _is_sql_database_url(database_url: str) -> bool:
    normalized = str(database_url or "").strip().lower()
    return normalized.startswith(("sqlite:", "postgresql:", "postgresql+"))


def _is_production_environment() -> bool:
    return str(os.getenv("ENVIRONMENT", "development")).strip().lower() in PRODUCTION_ENVIRONMENTS


def _resolve_database_url() -> str:
    for env_name in SQL_DATABASE_ENV_VARS:
        configured = _normalize_database_url(os.getenv(env_name, ""))
        if _is_sql_database_url(configured):
            return configured
    if _is_production_environment():
        raise RuntimeError("SQL database URL is required in production/staging.")
    return LOCAL_SQLITE_DATABASE_URL


DATABASE_URL = _resolve_database_url()

_engine = None
_SessionLocal = None


def get_engine():
    """Create the SQLAlchemy engine only when a DB session is needed."""
    global _engine
    if _engine is None:
        _engine = create_engine(
            DATABASE_URL,
            poolclass=pool.NullPool,
            echo=False,
            connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
        )
    return _engine


def get_session_local():
    """Create the session factory lazily with the configured engine."""
    global _SessionLocal
    if _SessionLocal is None:
        _SessionLocal = sessionmaker(
            autocommit=False,
            autoflush=False,
            bind=get_engine(),
        )
    return _SessionLocal


def __getattr__(name: str):
    if name == "engine":
        return get_engine()
    if name == "SessionLocal":
        return get_session_local()
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


def get_db() -> Generator[Session, None, None]:
    """
    Dependency function to get database session
    
    Usage:
        @app.get("/items")
        def get_items(db: Session = Depends(get_db)):
            return db.query(Item).all()
    """
    db = get_session_local()()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Initialize database tables"""
    from app.models import Base
    from app.models import road_hazard  # noqa: F401
    from app.models.vehicle_platform import Base as VehiclePlatformBase

    Base.metadata.create_all(bind=get_engine())
    VehiclePlatformBase.metadata.create_all(bind=get_engine())


try:
    init_db()
except Exception as exc:
    if _is_production_environment():
        raise
