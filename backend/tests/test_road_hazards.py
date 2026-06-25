import asyncio

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import get_db
from app.models.road_hazard import HazardReport, RoadHazard
from app.routers import road_hazards as road_hazards_module
from app.routers.road_hazards import router as road_hazards_router

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"


@pytest.fixture(scope="function")
def road_hazards_app():
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    RoadHazard.metadata.create_all(bind=engine)
    HazardReport.metadata.create_all(bind=engine)

    app = FastAPI(title="AutoBuddy Road Hazards Test API")
    app.include_router(road_hazards_router)
    app.state.testing_db = TestingSessionLocal

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield app
    app.dependency_overrides.clear()


class SyncHTTPClient:
    def __init__(self, async_client: AsyncClient):
        self._async_client = async_client

    def get(self, *args, **kwargs):
        return asyncio.run(self._async_client.get(*args, **kwargs))

    def post(self, *args, **kwargs):
        return asyncio.run(self._async_client.post(*args, **kwargs))

    def close(self):
        return asyncio.run(self._async_client.aclose())


@pytest.fixture(scope="function")
def client(road_hazards_app: FastAPI):
    transport = ASGITransport(app=road_hazards_app)
    async_client = AsyncClient(transport=transport, base_url="http://testserver")
    yield SyncHTTPClient(async_client)
    asyncio.run(async_client.aclose())


def _get_test_db(app: FastAPI):
    return next(app.dependency_overrides[get_db]())


def test_nearby_hazards_returns_saved_hazards(client, road_hazards_app: FastAPI):
    hazard = RoadHazard(
        latitude=12.9716,
        longitude=77.5946,
        severity=4,
        type="pothole",
        source="driver_app",
    )
    db = _get_test_db(road_hazards_app)
    db.add(hazard)
    db.commit()

    response = client.get("/api/road-hazards/nearby", params={
        "latitude": 12.9716,
        "longitude": 77.5946,
        "radius_km": 1.0,
        "limit": 10,
    })

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 1
    assert payload["radius_km"] == 1.0
    assert len(payload["hazards"]) == 1
    assert payload["hazards"][0]["type"] == "pothole"


def test_hazard_risk_returns_risk_summary(client, road_hazards_app: FastAPI):
    db = _get_test_db(road_hazards_app)
    db.add_all([
        RoadHazard(latitude=12.9716, longitude=77.5946, severity=4, type="pothole"),
        RoadHazard(latitude=12.9720, longitude=77.5950, severity=2, type="crack"),
    ])
    db.commit()

    response = client.get("/api/road-hazards/risk", params={
        "latitude": 12.9716,
        "longitude": 77.5946,
        "radius_km": 1.0,
    })

    assert response.status_code == 200
    payload = response.json()
    assert payload["hazard_count"] == 2
    assert payload["risk_score"] >= 0
    assert payload["risk_level"] in {"safe", "moderate", "dangerous"}
    assert "hazard_summary" in payload
    assert payload["hazard_summary"]["hazard_count"] == 2


def test_safe_route_returns_recommended_routes(client, road_hazards_app: FastAPI):
    db = _get_test_db(road_hazards_app)
    db.add_all([
        RoadHazard(latitude=12.9716, longitude=77.5946, severity=8, type="waterlogging"),
        RoadHazard(latitude=13.0350, longitude=77.5970, severity=5, type="pothole"),
    ])
    db.commit()

    response = client.post(
        "/api/road-hazards/safe-route",
        json={
            "origin": {"latitude": 12.9716, "longitude": 77.5946},
            "destination": {"latitude": 13.0350, "longitude": 77.5970},
            "count": 2,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["route_count"] == 2
    assert len(payload["routes"]) == 2
    assert payload["routes"][0]["id"] == "direct"
    assert payload["routes"][1]["id"] == "safer"
    assert payload["routes"][1]["risk_score"] <= payload["routes"][0]["risk_score"]


def test_safe_route_requires_origin_and_destination(client):
    response = client.post(
        "/api/road-hazards/safe-route",
        json={"origin": {}, "destination": {}},
    )
    assert response.status_code == 400
    assert response.json()["detail"] == "origin and destination are required"


def test_ingest_hazard_broadcasts_hazard_alert_and_notification(client, road_hazards_app, monkeypatch):
    recorded_calls = []

    async def fake_broadcast_event(event_type, data=None, room=None):
        recorded_calls.append((event_type, data, room))

    monkeypatch.setattr(road_hazards_module, 'broadcast_event', fake_broadcast_event)

    response = client.post(
        "/api/road-hazards/ingest",
        json={
            "latitude": 12.9716,
            "longitude": 77.5946,
            "severity": 3,
            "type": "pothole",
            "source": "driver_app",
        },
    )

    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert any(call[0] == "hazard_alert" and call[2] == "broadcast:driver" for call in recorded_calls)
    assert any(call[0] == "notification" and call[2] == "broadcast:driver" for call in recorded_calls)


def test_report_hazard_broadcasts_hazard_alert_and_notification(client, road_hazards_app, monkeypatch):
    recorded_calls = []

    async def fake_broadcast_event(event_type, data=None, room=None):
        recorded_calls.append((event_type, data, room))

    monkeypatch.setattr(road_hazards_module, 'broadcast_event', fake_broadcast_event)

    response = client.post(
        "/api/road-hazards/report",
        json={
            "user_id": "user-123",
            "latitude": 12.9716,
            "longitude": 77.5946,
            "description": "Large pothole on route",
        },
    )

    assert response.status_code == 200
    assert response.json()["ok"] is True
    assert any(call[0] == "hazard_alert" and call[2] == "broadcast:driver" for call in recorded_calls)
    assert any(call[0] == "notification" and call[2] == "broadcast:driver" for call in recorded_calls)
