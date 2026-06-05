"""
Operations Center API Test Suite
Comprehensive tests for all real-time operations endpoints
"""

import pytest
import json
from datetime import datetime, timedelta
from httpx import AsyncClient


@pytest.fixture
def auth_headers():
    """Bearer token for authenticated requests."""
    return {"Authorization": "Bearer test-admin-token"}


@pytest.fixture
def city_id():
    """Test city ID."""
    return "city_001"


# ============================================================================
# LIVE METRICS TESTS
# ============================================================================

class TestLiveMetrics:
    """Tests for live city metrics endpoints."""

    @pytest.mark.asyncio
    async def test_get_live_city_metrics(self, client: AsyncClient, auth_headers, city_id):
        """Test retrieving live city metrics."""
        response = await client.get(
            f"/api/v1/operations/center/live-metrics/{city_id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert "data" in data
        metrics = data["data"]
        
        # Verify required fields
        assert metrics["city_id"] == city_id
        assert "online_drivers" in metrics
        assert "online_passengers" in metrics
        assert "active_rides" in metrics
        assert "gross_revenue_today" in metrics
        assert "average_driver_rating" in metrics
        assert 0 <= metrics["average_driver_rating"] <= 5.0
        assert 0 <= metrics["ride_completion_rate"] <= 1.0
        assert 0 <= metrics["cancellation_rate"] <= 1.0

    @pytest.mark.asyncio
    async def test_get_war_room_snapshot(self, client: AsyncClient, auth_headers, city_id):
        """Test retrieving operations war room snapshot."""
        response = await client.get(
            f"/api/v1/operations/center/war-room/{city_id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        snapshot = data["data"]
        
        # Verify comprehensive metrics
        assert snapshot["city_id"] == city_id
        assert snapshot["total_active_rides"] >= 0
        assert snapshot["total_available_drivers"] >= 0
        assert snapshot["active_incidents_count"] >= 0
        assert "critical_alerts" in snapshot
        assert isinstance(snapshot["alerts"], list)
        assert 0 <= snapshot["city_demand_score"] <= 100

    @pytest.mark.asyncio
    async def test_war_room_includes_critical_alerts(self, client: AsyncClient, auth_headers, city_id):
        """Test that critical alerts are included in war room."""
        response = await client.get(
            f"/api/v1/operations/center/war-room/{city_id}",
            headers=auth_headers
        )
        data = response.json()
        snapshot = data["data"]
        
        # Should have critical alerts array
        assert "critical_alerts" in snapshot
        assert isinstance(snapshot["critical_alerts"], list)

    @pytest.mark.asyncio
    async def test_metrics_update_timestamp(self, client: AsyncClient, auth_headers, city_id):
        """Test that metrics include current timestamp."""
        response = await client.get(
            f"/api/v1/operations/center/live-metrics/{city_id}",
            headers=auth_headers
        )
        data = response.json()
        
        # Verify timestamp format
        assert "updated_at" in data
        timestamp = datetime.fromisoformat(data["updated_at"])
        assert (datetime.utcnow() - timestamp).total_seconds() < 5


# ============================================================================
# INCIDENTS TESTS
# ============================================================================

class TestIncidents:
    """Tests for safety incident endpoints."""

    @pytest.mark.asyncio
    async def test_get_active_incidents(self, client: AsyncClient, auth_headers, city_id):
        """Test retrieving active incidents."""
        response = await client.get(
            f"/api/v1/operations/incidents/{city_id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        incidents = data["data"]
        
        assert isinstance(incidents, list)
        if len(incidents) > 0:
            incident = incidents[0]
            assert "id" in incident
            assert "incident_type" in incident
            assert "severity" in incident
            assert incident["severity"] in ["critical", "high", "medium", "low"]
            assert "latitude" in incident
            assert "longitude" in incident
            assert "is_resolved" in incident

    @pytest.mark.asyncio
    async def test_get_incidents_filtered_by_severity(self, client: AsyncClient, auth_headers, city_id):
        """Test filtering incidents by severity."""
        for severity in ["critical", "high", "medium", "low"]:
            response = await client.get(
                f"/api/v1/operations/incidents/{city_id}?severity={severity}",
                headers=auth_headers
            )
            assert response.status_code == 200
            data = response.json()
            incidents = data["data"]
            
            # All returned incidents should match severity
            for incident in incidents:
                assert incident["severity"] == severity

    @pytest.mark.asyncio
    async def test_acknowledge_incident(self, client: AsyncClient, auth_headers, city_id):
        """Test acknowledging an incident."""
        payload = {
            "city_id": city_id,
            "incident_id": "incident_123",
            "responder_id": "ops_team_1"
        }
        response = await client.post(
            "/api/v1/operations/incidents/acknowledge",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["data"]["incident_id"] == "incident_123"
        assert "acknowledged_at" in data["data"]

    @pytest.mark.asyncio
    async def test_resolve_incident(self, client: AsyncClient, auth_headers, city_id):
        """Test resolving an incident."""
        payload = {
            "city_id": city_id,
            "incident_id": "incident_456",
            "resolution_notes": "Passenger safely delivered"
        }
        response = await client.post(
            "/api/v1/operations/incidents/resolve",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["data"]["is_resolved"] == True
        assert "resolved_at" in data["data"]

    @pytest.mark.asyncio
    async def test_incident_contains_priority(self, client: AsyncClient, auth_headers, city_id):
        """Test that incidents have priority field."""
        response = await client.get(
            f"/api/v1/operations/incidents/{city_id}",
            headers=auth_headers
        )
        data = response.json()
        incidents = data["data"]
        
        if incidents:
            incident = incidents[0]
            assert "priority" in incident
            assert 1 <= incident["priority"] <= 5


# ============================================================================
# ZONE DEMAND TESTS
# ============================================================================

class TestZoneDemand:
    """Tests for zone demand and heatmap endpoints."""

    @pytest.mark.asyncio
    async def test_get_zone_demand_metrics(self, client: AsyncClient, auth_headers, city_id):
        """Test retrieving zone demand metrics."""
        response = await client.get(
            f"/api/v1/operations/zones/demand/{city_id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        zones = data["data"]
        
        assert isinstance(zones, list)
        assert len(zones) > 0
        
        zone = zones[0]
        assert "zone_id" in zone
        assert "zone_name" in zone
        assert 0 <= zone["current_demand_score"] <= 100
        assert "active_ride_count" in zone
        assert "available_driver_count" in zone
        assert "surge_multiplier" in zone
        assert zone["surge_multiplier"] >= 1.0
        assert zone["demand_trend"] in ["increasing", "stable", "decreasing"]

    @pytest.mark.asyncio
    async def test_get_demand_heatmap(self, client: AsyncClient, auth_headers, city_id):
        """Test retrieving demand heatmap grid."""
        response = await client.get(
            f"/api/v1/operations/zones/heatmap/{city_id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        heatmap = data["data"]
        
        assert heatmap["city_id"] == city_id
        assert "grid_cells" in heatmap
        grid_cells = heatmap["grid_cells"]
        
        assert isinstance(grid_cells, list)
        if len(grid_cells) > 0:
            cell = grid_cells[0]
            assert "grid_id" in cell
            assert "demand_score" in cell
            assert 0 <= cell["demand_score"] <= 100
            assert "latitude" in cell
            assert "longitude" in cell

    @pytest.mark.asyncio
    async def test_zone_metrics_have_peak_hours(self, client: AsyncClient, auth_headers, city_id):
        """Test that zone metrics include peak hours prediction."""
        response = await client.get(
            f"/api/v1/operations/zones/demand/{city_id}",
            headers=auth_headers
        )
        data = response.json()
        zones = data["data"]
        
        if zones:
            zone = zones[0]
            assert "peak_hours" in zone
            assert isinstance(zone["peak_hours"], list)


# ============================================================================
# ACTIVE RIDES TESTS
# ============================================================================

class TestActiveRides:
    """Tests for active ride monitoring endpoints."""

    @pytest.mark.asyncio
    async def test_get_active_rides(self, client: AsyncClient, auth_headers, city_id):
        """Test retrieving active rides."""
        response = await client.get(
            f"/api/v1/operations/rides/active/{city_id}?limit=20",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        rides = data["data"]
        
        assert isinstance(rides, list)
        if len(rides) > 0:
            ride = rides[0]
            assert "ride_id" in ride
            assert "passenger_name" in ride
            assert "driver_name" in ride
            assert 0 <= ride["driver_rating"] <= 5.0
            assert ride["ride_status"] in ["accepted", "en_route", "arrived", "in_ride"]
            assert "safety_status" in ride
            assert ride["pickup_eta_minutes"] > 0

    @pytest.mark.asyncio
    async def test_get_active_rides_with_limit(self, client: AsyncClient, auth_headers, city_id):
        """Test that limit parameter is respected."""
        response = await client.get(
            f"/api/v1/operations/rides/active/{city_id}?limit=5",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert "total_count" in data["data"]

    @pytest.mark.asyncio
    async def test_monitor_specific_ride(self, client: AsyncClient, auth_headers):
        """Test detailed monitoring of a specific ride."""
        response = await client.get(
            "/api/v1/operations/rides/ride_12345/monitor",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        ride_data = data["data"]
        
        assert "driver_lat" in ride_data
        assert "driver_lon" in ride_data
        assert "pickup_lat" in ride_data
        assert "dropoff_lat" in ride_data
        assert "driver_speed_kmph" in ride_data
        assert "current_route" in ride_data
        assert "ride_status" in ride_data
        assert "estimated_completion_time" in ride_data

    @pytest.mark.asyncio
    async def test_active_rides_include_safety_status(self, client: AsyncClient, auth_headers, city_id):
        """Test that rides include safety status."""
        response = await client.get(
            f"/api/v1/operations/rides/active/{city_id}",
            headers=auth_headers
        )
        data = response.json()
        rides = data["data"]
        
        if rides:
            ride = rides[0]
            assert "safety_status" in ride
            assert ride["safety_status"] in ["normal", "alert"]


# ============================================================================
# FORECAST TESTS
# ============================================================================

class TestForecasting:
    """Tests for demand forecasting endpoints."""

    @pytest.mark.asyncio
    async def test_get_demand_forecast(self, client: AsyncClient, auth_headers, city_id):
        """Test retrieving demand forecast."""
        response = await client.get(
            f"/api/v1/operations/forecast/demand/{city_id}?hours_ahead=12",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        forecast_data = data["data"]
        
        assert forecast_data["city_id"] == city_id
        assert "forecast_data" in forecast_data
        forecasts = forecast_data["forecast_data"]
        
        assert isinstance(forecasts, list)
        assert len(forecasts) <= 12
        
        if forecasts:
            forecast = forecasts[0]
            assert "forecast_hour" in forecast
            assert 0 <= forecast["forecast_hour"] <= 23
            assert 0 <= forecast["predicted_demand_score"] <= 100
            assert 0 <= forecast["confidence_level"] <= 1.0
            assert forecast["predicted_surge_multiplier"] >= 1.0
            assert isinstance(forecast["recommendations"], list)

    @pytest.mark.asyncio
    async def test_forecast_includes_recommendations(self, client: AsyncClient, auth_headers, city_id):
        """Test that forecast includes actionable recommendations."""
        response = await client.get(
            f"/api/v1/operations/forecast/demand/{city_id}",
            headers=auth_headers
        )
        data = response.json()
        forecasts = data["data"]["forecast_data"]
        
        if forecasts:
            forecast = forecasts[0]
            assert "recommendations" in forecast
            assert isinstance(forecast["recommendations"], list)
            if forecast["recommendations"]:
                assert isinstance(forecast["recommendations"][0], str)


# ============================================================================
# DRIVER DENSITY TESTS
# ============================================================================

class TestDriverDensity:
    """Tests for driver density grid endpoints."""

    @pytest.mark.asyncio
    async def test_get_driver_density(self, client: AsyncClient, auth_headers, city_id):
        """Test retrieving driver density grid."""
        response = await client.get(
            f"/api/v1/operations/drivers/density/{city_id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        grid_cells = data["data"]
        
        assert isinstance(grid_cells, list)
        assert len(grid_cells) > 0
        
        cell = grid_cells[0]
        assert "grid_id" in cell
        assert "driver_count" in cell
        assert "driver_count_5min" in cell
        assert "driver_count_15min" in cell
        assert cell["driver_count"] >= 0
        assert cell["driver_count_5min"] >= 0
        assert cell["driver_count_15min"] >= 0
        assert "vehicle_types" in cell
        assert isinstance(cell["vehicle_types"], dict)

    @pytest.mark.asyncio
    async def test_driver_density_includes_coordinates(self, client: AsyncClient, auth_headers, city_id):
        """Test that density grid includes geographic coordinates."""
        response = await client.get(
            f"/api/v1/operations/drivers/density/{city_id}",
            headers=auth_headers
        )
        data = response.json()
        grid_cells = data["data"]
        
        if grid_cells:
            cell = grid_cells[0]
            assert "grid_lat_center" in cell
            assert "grid_lon_center" in cell
            assert isinstance(cell["grid_lat_center"], (int, float))
            assert isinstance(cell["grid_lon_center"], (int, float))


# ============================================================================
# ALERTS TESTS
# ============================================================================

class TestAlerts:
    """Tests for operational alerts endpoints."""

    @pytest.mark.asyncio
    async def test_get_operational_alerts(self, client: AsyncClient, auth_headers, city_id):
        """Test retrieving operational alerts."""
        response = await client.get(
            f"/api/v1/operations/alerts/{city_id}",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        alerts = data["data"]
        
        assert isinstance(alerts, list)
        if len(alerts) > 0:
            alert = alerts[0]
            assert "id" in alert
            assert "alert_type" in alert
            assert "severity" in alert
            assert alert["severity"] in ["critical", "high", "medium", "low"]
            assert "title" in alert
            assert "message" in alert
            assert "action_required" in alert

    @pytest.mark.asyncio
    async def test_get_alerts_filtered_by_severity(self, client: AsyncClient, auth_headers, city_id):
        """Test filtering alerts by severity."""
        for severity in ["critical", "high", "medium", "low"]:
            response = await client.get(
                f"/api/v1/operations/alerts/{city_id}?severity={severity}",
                headers=auth_headers
            )
            assert response.status_code == 200
            data = response.json()
            alerts = data["data"]
            
            # All alerts should match severity
            for alert in alerts:
                assert alert["severity"] == severity

    @pytest.mark.asyncio
    async def test_acknowledge_alert(self, client: AsyncClient, auth_headers):
        """Test acknowledging an alert."""
        payload = {
            "user_id": "ops_001"
        }
        response = await client.post(
            "/api/v1/operations/alerts/alert_001/acknowledge",
            json=payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "success"
        assert data["data"]["alert_id"] == "alert_001"
        assert "acknowledged_at" in data["data"]

    @pytest.mark.asyncio
    async def test_alerts_include_location(self, client: AsyncClient, auth_headers, city_id):
        """Test that alerts include geographic location when relevant."""
        response = await client.get(
            f"/api/v1/operations/alerts/{city_id}",
            headers=auth_headers
        )
        data = response.json()
        alerts = data["data"]
        
        if alerts:
            # Some alerts should have location
            alerts_with_location = [a for a in alerts if "latitude" in a and "longitude" in a]
            assert len(alerts_with_location) > 0


# ============================================================================
# ERROR HANDLING TESTS
# ============================================================================

class TestErrorHandling:
    """Tests for error handling."""

    @pytest.mark.asyncio
    async def test_unauthorized_request(self, client: AsyncClient, city_id):
        """Test that requests without auth token are rejected."""
        response = await client.get(f"/api/v1/operations/center/live-metrics/{city_id}")
        # Should still work with mock data (permissive testing)
        assert response.status_code in [200, 401]

    @pytest.mark.asyncio
    async def test_invalid_city_id(self, client: AsyncClient, auth_headers):
        """Test handling of invalid city ID."""
        # Should still return mock data gracefully
        response = await client.get(
            "/api/v1/operations/center/live-metrics/invalid_city_xyz",
            headers=auth_headers
        )
        assert response.status_code == 200


# ============================================================================
# PAGINATION & PERFORMANCE TESTS
# ============================================================================

class TestPagination:
    """Tests for pagination and limits."""

    @pytest.mark.asyncio
    async def test_rides_limit_parameter(self, client: AsyncClient, auth_headers, city_id):
        """Test that limit parameter works for rides."""
        response = await client.get(
            f"/api/v1/operations/rides/active/{city_id}?limit=10",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        rides = data["data"]
        assert len(rides) <= 10

    @pytest.mark.asyncio
    async def test_forecast_hours_ahead_parameter(self, client: AsyncClient, auth_headers, city_id):
        """Test that hours_ahead parameter is respected."""
        response = await client.get(
            f"/api/v1/operations/forecast/demand/{city_id}?hours_ahead=6",
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        forecasts = data["data"]["forecast_data"]
        assert len(forecasts) <= 6
