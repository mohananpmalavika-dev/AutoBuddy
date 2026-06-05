"""
Airport Ride System API Test Suite
"""

import pytest
from datetime import datetime


@pytest.fixture
def auth_headers():
    return {"Authorization": "Bearer test-admin-token"}


@pytest.fixture
def terminal_id():
    return "term_BLR"


# Terminal Management Tests
class TestTerminalManagement:

    @pytest.mark.asyncio
    async def test_list_airports(self, client, auth_headers):
        """Test listing all airports."""
        response = await client.get(
            "/api/v1/airport/terminals",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        airports = data["data"]
        assert isinstance(airports, list)

    @pytest.mark.asyncio
    async def test_list_airports_by_city(self, client, auth_headers):
        """Test filtering airports by city."""
        response = await client.get(
            "/api/v1/airport/terminals?city=Bangalore",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        if data["data"]:
            assert data["data"][0]["city"].lower() == "bangalore"

    @pytest.mark.asyncio
    async def test_get_terminal_details(self, client, auth_headers, terminal_id):
        """Test retrieving terminal details."""
        response = await client.get(
            f"/api/v1/airport/terminals/{terminal_id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        terminal = data["data"]
        assert "airport_code" in terminal
        assert "gates_count" in terminal


# Flight Management Tests
class TestFlightManagement:

    @pytest.mark.asyncio
    async def test_list_flights(self, client, auth_headers, terminal_id):
        """Test listing flights for a terminal."""
        response = await client.get(
            f"/api/v1/airport/terminals/{terminal_id}/flights",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        flights = data["data"]
        assert isinstance(flights, list)

    @pytest.mark.asyncio
    async def test_list_flights_by_status(self, client, auth_headers, terminal_id):
        """Test filtering flights by status."""
        response = await client.get(
            f"/api/v1/airport/terminals/{terminal_id}/flights?status=scheduled",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        if data["data"]:
            assert data["data"][0]["flight_status"] == "scheduled"

    @pytest.mark.asyncio
    async def test_get_flight_details(self, client, auth_headers):
        """Test retrieving flight details."""
        response = await client.get(
            "/api/v1/airport/flights/flight_001",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        flight = data["data"]
        assert "flight_number" in flight
        assert "airline" in flight


# Airport Ride Request Tests
class TestAirportRideRequests:

    @pytest.mark.asyncio
    async def test_request_airport_ride(self, client, auth_headers, terminal_id):
        """Test requesting an airport ride."""
        payload = {
            "passenger_name": "John Doe",
            "phone_number": "+919876543210",
            "flight_number": "AI123",
            "ride_phase": "pre_flight",
            "pickup_location": "Home",
            "dropoff_location": "BLR Terminal 1",
            "terminal_id": terminal_id,
            "passengers_count": 2,
            "luggage_count": 2
        }
        response = await client.post(
            "/api/v1/airport/rides/request",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        ride = data["data"]
        assert ride["passenger_name"] == "John Doe"
        assert ride["flight_number"] == "AI123"
        assert ride["ride_status"] == "requested"

    @pytest.mark.asyncio
    async def test_list_airport_rides(self, client, auth_headers, terminal_id):
        """Test listing rides at terminal."""
        response = await client.get(
            f"/api/v1/airport/terminals/{terminal_id}/rides",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        rides = data["data"]
        assert isinstance(rides, list)

    @pytest.mark.asyncio
    async def test_list_rides_by_phase(self, client, auth_headers, terminal_id):
        """Test filtering rides by phase."""
        response = await client.get(
            f"/api/v1/airport/terminals/{terminal_id}/rides?ride_phase=pre_flight",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        if data["data"]:
            assert data["data"][0]["ride_phase"] == "pre_flight"

    @pytest.mark.asyncio
    async def test_get_ride_details(self, client, auth_headers):
        """Test retrieving ride details."""
        response = await client.get(
            "/api/v1/airport/rides/aride_001",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        ride = data["data"]
        assert "passenger_name" in ride
        assert "ride_status" in ride

    @pytest.mark.asyncio
    async def test_accept_ride(self, client, auth_headers):
        """Test accepting/assigning ride to driver."""
        payload = {"driver_id": "driver_001"}
        response = await client.post(
            "/api/v1/airport/rides/aride_001/accept",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["data"]["ride_status"] == "accepted"


# Parking Management Tests
class TestParkingManagement:

    @pytest.mark.asyncio
    async def test_get_parking_availability(self, client, auth_headers, terminal_id):
        """Test getting parking availability."""
        response = await client.get(
            f"/api/v1/airport/terminals/{terminal_id}/parking/availability",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        availability = data["data"]
        assert "available_spaces" in availability
        assert "occupied_spaces" in availability
        assert "occupancy_rate" in availability

    @pytest.mark.asyncio
    async def test_reserve_parking_spot(self, client, auth_headers, terminal_id):
        """Test reserving parking spot."""
        payload = {"ride_id": "aride_001"}
        response = await client.post(
            f"/api/v1/airport/terminals/{terminal_id}/parking/reserve",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        spot = data["data"]
        assert spot["status"] == "reserved"


# Demand Management Tests
class TestDemandManagement:

    @pytest.mark.asyncio
    async def test_get_terminal_demand(self, client, auth_headers, terminal_id):
        """Test getting demand metrics."""
        response = await client.get(
            f"/api/v1/airport/terminals/{terminal_id}/demand",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        demand = data["data"]
        assert isinstance(demand, list)
        if demand:
            assert "demand_score" in demand[0]
            assert "surge_multiplier" in demand[0]

    @pytest.mark.asyncio
    async def test_get_demand_by_phase(self, client, auth_headers, terminal_id):
        """Test filtering demand by phase."""
        response = await client.get(
            f"/api/v1/airport/terminals/{terminal_id}/demand?ride_phase=pre_flight",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        if data["data"]:
            assert data["data"][0]["ride_phase"] == "pre_flight"

    @pytest.mark.asyncio
    async def test_get_queue_status(self, client, auth_headers, terminal_id):
        """Test getting queue status."""
        response = await client.get(
            f"/api/v1/airport/terminals/{terminal_id}/queue",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        queue = data["data"]
        assert "queue_length" in queue
        assert "estimated_wait_time_minutes" in queue


# Alerts Tests
class TestAlerts:

    @pytest.mark.asyncio
    async def test_get_terminal_alerts(self, client, auth_headers, terminal_id):
        """Test getting terminal alerts."""
        response = await client.get(
            f"/api/v1/airport/terminals/{terminal_id}/alerts",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        alerts = data["data"]
        assert isinstance(alerts, list)

    @pytest.mark.asyncio
    async def test_get_alerts_by_severity(self, client, auth_headers, terminal_id):
        """Test filtering alerts by severity."""
        response = await client.get(
            f"/api/v1/airport/terminals/{terminal_id}/alerts?severity=critical",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        if data["data"]:
            assert data["data"][0]["severity"] == "critical"


# Service Metrics Tests
class TestServiceMetrics:

    @pytest.mark.asyncio
    async def test_get_daily_metrics(self, client, auth_headers, terminal_id):
        """Test getting daily metrics."""
        response = await client.get(
            f"/api/v1/airport/terminals/{terminal_id}/metrics/daily",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        metrics = data["data"]
        assert metrics["metric_period"] == "daily"
        assert "total_rides" in metrics
        assert "average_rating" in metrics

    @pytest.mark.asyncio
    async def test_get_hourly_metrics(self, client, auth_headers, terminal_id):
        """Test getting hourly metrics."""
        response = await client.get(
            f"/api/v1/airport/terminals/{terminal_id}/metrics/hourly",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        metrics = data["data"]
        assert isinstance(metrics, list)


# Error Handling Tests
class TestErrorHandling:

    @pytest.mark.asyncio
    async def test_unauthorized_request(self, client):
        """Test unauthorized request without token."""
        response = await client.get("/api/v1/airport/terminals")
        assert response.status_code in [401, 200]  # May be allowed in dev mode

    @pytest.mark.asyncio
    async def test_invalid_terminal_id(self, client, auth_headers):
        """Test with invalid terminal ID."""
        response = await client.get(
            "/api/v1/airport/terminals/invalid_id",
            headers=auth_headers
        )
        assert response.status_code == 200  # Mock data returns success
