from datetime import datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.routers import airport_rides


@pytest.fixture()
def airport_client(monkeypatch):
    async def fake_current_user(request):
        return {"id": "passenger_test", "role": "passenger"}

    monkeypatch.setattr(airport_rides, "get_current_user_from_request", fake_current_user)
    airport_rides.AIRPORT_RIDES.clear()
    for driver in airport_rides.AIRPORT_DRIVERS.values():
        driver["available"] = True

    app = FastAPI()
    app.include_router(airport_rides.router)
    return TestClient(app)


def test_airport_ride_request_assigns_permitted_driver_and_reschedules_delay(airport_client):
    response = airport_client.post(
        "/api/v1/airport/rides/request",
        json={
            "passenger_name": "Airport Passenger",
            "phone_number": "+919876543210",
            "flight_number": "AI967",
            "ride_phase": "pre_flight",
            "pickup_location": "Kollam",
            "dropoff_location": "TRV Terminal 1",
            "terminal_id": "term_TRV",
            "passengers_count": 2,
            "luggage_count": 3,
            "vehicle_type": "taxi",
            "flight_type": "international",
        },
        headers={"Authorization": "Bearer test-token"},
    )

    assert response.status_code == 200
    ride = response.json()["data"]
    assert ride["ride_type"] == "airport"
    assert ride["ride_status"] == "driver_assigned"
    assert ride["driver_id"] == "DRV_TRV_TAXI_01"
    assert ride["pickup_buffer_hours"] == 4
    assert ride["estimated_fare"] == ride["fare_breakdown"]["total"]
    assert ride["fare_breakdown"]["luggage_fee"] == 60.0

    old_pickup = datetime.fromisoformat(ride["scheduled_pickup_time"])
    delay_response = airport_client.post(
        f"/api/v1/airport/rides/{ride['ride_id']}/flight-delay",
        json={"delay_minutes": 45},
        headers={"Authorization": "Bearer test-token"},
    )

    assert delay_response.status_code == 200
    delayed_ride = delay_response.json()["data"]
    new_pickup = datetime.fromisoformat(delayed_ride["scheduled_pickup_time"])
    assert delayed_ride["ride_status"] == "rescheduled_due_to_flight_delay"
    assert delayed_ride["flight_delay_minutes"] == 45
    assert int((new_pickup - old_pickup).total_seconds() / 60) == 45
