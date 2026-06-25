import pytest
from fastapi.testclient import TestClient
from app.database import SessionLocal
from app.models.road_hazard import HazardReport
import json

@pytest.fixture
def client():
    from app.main import app
    return TestClient(app)

@pytest.fixture
def db():
    session = SessionLocal()
    yield session
    session.query(HazardReport).delete()
    session.commit()
    session.close()


def test_safepath_report_creation(client, db):
    """Test creating a safepath report via POST /api/safepath/report"""
    payload = {
        "user_id": "test_user_123",
        "latitude": 13.0850,
        "longitude": 80.2700,
        "category": "broken_footpath",
        "description": "Large pothole on main street",
        "image_url": None,
    }
    
    response = client.post("/api/safepath/report", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["ok"] is True
    assert "id" in data


def test_safepath_route_generation(client):
    """Test safe route computation via POST /api/safepath/route"""
    payload = {
        "origin": {"latitude": 13.0827, "longitude": 80.2707},
        "destination": {"latitude": 13.0900, "longitude": 80.2800},
        "mode": "walking",
        "alternatives": 2,
    }
    
    response = client.post("/api/safepath/route", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "routes" in data
    assert len(data["routes"]) >= 1
    assert "risk_level" in data["routes"][0]


def test_safepath_hotspots(client):
    """Test hotspot detection via GET /api/safepath/hotspots"""
    response = client.get("/api/safepath/hotspots?limit=10")
    assert response.status_code == 200
    data = response.json()
    assert "hotspots" in data
    assert "count" in data


def test_safepath_route_missing_params(client):
    """Test safe route with missing parameters"""
    payload = {
        "mode": "cycling",
    }
    
    response = client.post("/api/safepath/route", json=payload)
    assert response.status_code == 400


def test_safepath_report_validation(client):
    """Test report validation"""
    # Missing required location
    payload = {
        "user_id": "test_user",
        "category": "missing_light",
    }
    
    response = client.post("/api/safepath/report", json=payload)
    # Should fail validation
    assert response.status_code in [400, 422]
