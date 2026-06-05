"""
Pytest configuration and fixtures for integration tests
"""

import pytest
from fastapi.testclient import TestClient
from fastapi import FastAPI, Depends
from sqlalchemy import create_engine, Column, String
from sqlalchemy.orm import sessionmaker, Session
from datetime import datetime, timedelta
from app.utils.time_helpers import get_ist_now
import uuid
import sys
from pathlib import Path

# Add parent directories to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db.models_features import Base
from app.db.database import get_db
from app.core.auth import get_current_passenger
from app.routers.features_routes import router as features_router

# Create stub models using the SAME Base as features
class Passenger(Base):
    __tablename__ = "passengers"
    id = Column(String, primary_key=True)

class Driver(Base):
    __tablename__ = "drivers"
    id = Column(String, primary_key=True)

class Booking(Base):
    __tablename__ = "bookings"
    id = Column(String, primary_key=True)

class SupportAgent(Base):
    __tablename__ = "support_agents"
    id = Column(String, primary_key=True)

# Use SQLite in-memory database for tests
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
)

TestingSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


@pytest.fixture(scope="session")
def db():
    """Create test database"""
    # Create all tables (including stub models)
    Base.metadata.create_all(bind=engine)
    yield
    # Cleanup
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def db_session(db):
    """Create a fresh database session for each test"""
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    
    yield session
    
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture(scope="function")
def app(db_session: Session):
    """Create FastAPI test application"""
    app = FastAPI(title="AutoBuddy Features Test API")
    
    # Override dependencies
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    
    def override_get_current_passenger():
        return {"id": "test-passenger-123", "role": "passenger", "phone": "+919876543210"}
    
    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_passenger] = override_get_current_passenger
    
    # Include router
    app.include_router(features_router)
    
    yield app
    
    app.dependency_overrides.clear()


@pytest.fixture(scope="function")
def client(app: FastAPI):
    """Create test client"""
    client = TestClient(app)
    return client


@pytest.fixture(scope="function")
def auth_headers():
    """Create valid authentication headers for testing"""
    # This would use your actual authentication mechanism
    # For now, returning a sample header structure
    
    passenger_id = f"passenger-{uuid.uuid4()}"
    
    # Mock token (in real implementation, generate valid JWT)
    return {
        "Authorization": f"Bearer mock-token-{passenger_id}",
        "X-Passenger-ID": passenger_id
    }


@pytest.fixture(scope="function")
def sample_passenger(db_session: Session):
    """Create a sample passenger for testing"""
    # Adjust based on your actual Passenger model
    passenger = {
        "id": f"passenger-{uuid.uuid4()}",
        "name": "Test Passenger",
        "phone": "+919876543210",
        "email": "test@example.com",
        "created_at": get_ist_now()
    }
    
    # Insert into database if you have a Passenger model
    # db_session.add(passenger_obj)
    # db_session.commit()
    
    return passenger


@pytest.fixture(scope="function")
def sample_driver(db_session: Session):
    """Create a sample driver for testing"""
    driver = {
        "id": f"driver-{uuid.uuid4()}",
        "name": "Test Driver",
        "phone": "+919876543211",
        "vehicle_number": "KL-01-AB-1234",
        "rating": 4.8,
        "total_rides": 500,
        "created_at": get_ist_now()
    }
    
    return driver


@pytest.fixture(scope="function")
def sample_booking(db_session: Session, sample_passenger, sample_driver):
    """Create a sample booking for testing"""
    booking = {
        "id": f"booking-{uuid.uuid4()}",
        "passenger_id": sample_passenger["id"],
        "driver_id": sample_driver["id"],
        "pickup_location": "123 Main St",
        "dropoff_location": "456 Park Ave",
        "pickup_latitude": 40.7128,
        "pickup_longitude": -74.0060,
        "dropoff_latitude": 40.7580,
        "dropoff_longitude": -73.9855,
        "status": "completed",
        "fare": 450.0,
        "created_at": get_ist_now() - timedelta(hours=1),
        "completed_at": get_ist_now()
    }
    
    return booking


@pytest.fixture(scope="function")
def sample_promo_code(db_session: Session):
    """Create a sample promo code for testing"""
    promo = {
        "id": f"promo-{uuid.uuid4()}",
        "code": "SAVE10",
        "discount_type": "percentage",
        "discount_value": 10,
        "min_ride_fare": 200.0,
        "max_discount": 100.0,
        "valid_from": get_ist_now(),
        "valid_until": get_ist_now() + timedelta(days=30),
        "usage_limit": 100,
        "usage_per_user": 2,
        "is_active": True,
        "description": "10% discount on rides"
    }
    
    return promo


# Markers for test categorization
def pytest_configure(config):
    """Register custom markers"""
    config.addinivalue_line(
        "markers",
        "integration: integration tests requiring database"
    )
    config.addinivalue_line(
        "markers",
        "unit: unit tests"
    )
    config.addinivalue_line(
        "markers",
        "slow: slow running tests"
    )


@pytest.fixture(autouse=True)
def reset_db(db_session: Session):
    """Auto-reset database before each test"""
    yield
    # Database automatically rolled back due to fixture design


# Optional: Logging helper for debugging
@pytest.fixture
def caplog_handler():
    """Helper for captured logs in tests"""
    import logging
    logger = logging.getLogger("autobuddy")
    logger.setLevel(logging.DEBUG)
    return logger
