"""
SQLAlchemy Database Configuration for Passenger Features
Sets up SQLAlchemy ORM for all 10 feature models
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from app.db.models_features import Base

# Database URL Configuration
DATABASE_URL = os.environ.get(
    "SQLALCHEMY_DATABASE_URL",
    os.environ.get("DATABASE_URL", "sqlite:///./autobuddy_features.db")
)

# Create engine with appropriate configuration
if DATABASE_URL.startswith("sqlite"):
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
    print(f"Warning: Could not initialize database tables: {e}")
