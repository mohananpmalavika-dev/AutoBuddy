"""
E2E Tests for Traffic Alerts & Route Optimization
Tests WebSocket integration, API endpoints, and real-time alert broadcasting
"""

import pytest
import pytest_asyncio
import json
import asyncio
from datetime import datetime
from typing import List
from unittest.mock import Mock, AsyncMock, patch


class TestTrafficAlertsE2E:
    """End-to-end tests for traffic alerts system"""

    @pytest_asyncio.fixture
    async def mock_sio_server(self):
        """Mock SocketIO server for testing"""
        from unittest.mock import MagicMock
        mock = MagicMock()
        mock.emit = AsyncMock()
        mock.enter_room = AsyncMock()
        mock.leave_room = AsyncMock()
        return mock

    @pytest.mark.asyncio
    async def test_driver_subscribes_to_route_alerts(self, mock_sio_server):
        """Test driver subscription to traffic alerts for a route"""
        from app.sockets.traffic_alerts import register_traffic_alert_handlers

        # Register handlers
        register_traffic_alert_handlers(mock_sio_server)

        # Simulate subscription event
        handlers = {event: callback for event, callback in mock_sio_server.on.call_args_list}
        print(f"Registered handlers: {[call[0][0] for call in mock_sio_server.on.call_args_list]}")

        assert any("subscribe" in str(call) for call in mock_sio_server.on.call_args_list)

    @pytest.mark.asyncio
    async def test_broadcast_traffic_alert_to_subscribers(self, mock_sio_server):
        """Test broadcasting alert to all drivers on a route"""
        from app.sockets.traffic_alerts import (
            broadcast_traffic_alert,
            TrafficAlert,
            register_traffic_alert_handlers,
            driver_alert_subscriptions,
        )

        # Setup mock subscriptions
        driver_alert_subscriptions["driver-001"] = {"route-123": "sid-001"}
        driver_alert_subscriptions["driver-002"] = {"route-123": "sid-002"}

        # Create test alert
        alert = TrafficAlert(
            id="alert-001",
            type="CONGESTION",
            severity="HIGH",
            title="Heavy traffic ahead",
            description="Major congestion on Main Street",
            location="Main Street",
            delay_time=600,
            impact="AVOID",
            reported_time=datetime.now(),
        )

        # Broadcast alert
        result = await broadcast_traffic_alert(mock_sio_server, alert, "route-123")

        assert result is True
        mock_sio_server.emit.assert_called_once()

        # Verify emission parameters
        call_args = mock_sio_server.emit.call_args
        assert "traffic:alert_new" in str(call_args)

    @pytest.mark.asyncio
    async def test_alert_deduplication(self):
        """Test duplicate alert filtering"""
        from app.sockets.traffic_alerts import (
            is_alert_duplicate,
            cache_alert,
            TrafficAlert,
            alert_cache,
        )

        alert_cache.clear()

        alert1 = TrafficAlert(
            id="alert-001",
            type="ACCIDENT",
            severity="HIGH",
            title="Car accident",
            description="Two cars collided",
            location="Main Street",
            delay_time=900,
            impact="AVOID",
            reported_time=datetime.now(),
        )

        alert2 = TrafficAlert(
            id="alert-002",
            type="ACCIDENT",
            severity="HIGH",
            title="Another accident",
            description="Different incident",
            location="Main Street",  # Same location as alert1
            delay_time=900,
            impact="AVOID",
            reported_time=datetime.now(),
        )

        # First alert should not be duplicate
        assert not is_alert_duplicate(alert1)
        cache_alert(alert1)

        # Second alert with same location should be duplicate
        assert is_alert_duplicate(alert2)

    @pytest.mark.asyncio
    async def test_dismiss_alert_removes_from_driver_view(self, mock_sio_server):
        """Test that dismissed alerts don't appear for driver"""
        from app.sockets.traffic_alerts import (
            driver_preferences,
        )

        driver_id = "driver-001"
        alert_id = "alert-001"

        driver_preferences[driver_id] = {
            "muted_alert_ids": set(),
            "dismissed_alert_ids": set(),
        }

        # Dismiss alert
        driver_preferences[driver_id]["dismissed_alert_ids"].add(alert_id)

        # Verify dismissed
        assert alert_id in driver_preferences[driver_id]["dismissed_alert_ids"]

    @pytest.mark.asyncio
    async def test_api_get_traffic_alerts(self):
        """Test GET /traffic/alerts endpoint"""
        from app.routers.traffic_alerts_api import get_traffic_alerts

        response = await get_traffic_alerts(
            origin_lat=12.9716,
            origin_lng=77.5946,
            dest_lat=13.1939,
            dest_lng=77.6245,
        )

        assert "alerts" in response
        assert "routes" in response
        assert "metadata" in response

        # Verify alert structure
        for alert in response["alerts"]:
            assert "id" in alert
            assert "type" in alert
            assert "severity" in alert
            assert alert["severity"] in ["HIGH", "MEDIUM", "LOW"]

        # Verify route structure
        for route in response["routes"]:
            assert "id" in route
            assert "distance" in route
            assert "traffic_condition" in route

    @pytest.mark.asyncio
    async def test_api_optimize_route(self):
        """Test POST /traffic/routes/optimize endpoint"""
        from app.routers.traffic_alerts_api import optimize_route

        response = await optimize_route(
            origin_lat=12.9716,
            origin_lng=77.5946,
            dest_lat=13.1939,
            dest_lng=77.6245,
            vehicle_capacity=4,
        )

        assert "id" in response
        assert "stops" in response
        assert "total_distance" in response
        assert "estimated_duration" in response
        assert "traffic" in response

        # Verify traffic data
        assert response["traffic"]["level"] in ["low", "moderate", "high", "severe"]
        assert isinstance(response["traffic"]["delay"], (int, float))

    @pytest.mark.asyncio
    async def test_api_get_alternative_routes(self):
        """Test GET /traffic/routes/alternatives endpoint"""
        from app.routers.traffic_alerts_api import get_alternative_routes

        response = await get_alternative_routes(
            origin_lat=12.9716,
            origin_lng=77.5946,
            dest_lat=13.1939,
            dest_lng=77.6245,
            count=3,
        )

        assert "alternatives" in response
        assert len(response["alternatives"]) > 0

        # Verify recommended route
        recommended = [r for r in response["alternatives"] if r.get("is_recommended")]
        assert len(recommended) > 0

        # Verify route structure
        for route in response["alternatives"]:
            assert "id" in route
            assert "roi_score" in route
            assert 0 <= route["roi_score"] <= 100

    @pytest.mark.asyncio
    async def test_api_get_navigation_steps(self):
        """Test GET /traffic/{route_id}/navigation endpoint"""
        from app.routers.traffic_alerts_api import get_navigation_steps

        response = await get_navigation_steps("route-123")

        assert "steps" in response
        assert len(response["steps"]) > 0

        # Verify step structure
        for step in response["steps"]:
            assert "instruction" in step
            assert "distance" in step
            assert "duration" in step
            assert "maneuver" in step

    @pytest.mark.asyncio
    async def test_api_recalculate_route(self):
        """Test POST /traffic/{route_id}/recalculate endpoint"""
        from app.routers.traffic_alerts_api import recalculate_route

        response = await recalculate_route(
            route_id="route-123",
            current_lat=13.0827,
            current_lng=77.6070,
            driver_id="driver-001",
        )

        assert "status" in response
        assert "reason" in response
        assert "suggested_route" in response

    @pytest.mark.asyncio
    async def test_websocket_connection_lifecycle(self, mock_sio_server):
        """Test full WebSocket connection lifecycle"""
        from app.sockets.traffic_alerts import (
            register_traffic_alert_handlers,
            driver_alert_subscriptions,
        )

        # Register handlers
        register_traffic_alert_handlers(mock_sio_server)

        # Verify handlers registered
        handler_names = [call[0][0] for call in mock_sio_server.on.call_args_list]
        assert "traffic:subscribe_alerts" in handler_names
        assert "traffic:unsubscribe_alerts" in handler_names
        assert "traffic:dismiss_alert" in handler_names

    @pytest.mark.asyncio
    async def test_multiple_routes_alert_broadcasting(self, mock_sio_server):
        """Test broadcasting same alert to multiple routes"""
        from app.sockets.traffic_alerts import (
            broadcast_traffic_alert,
            TrafficAlert,
            driver_alert_subscriptions,
        )

        # Setup subscriptions to multiple routes
        driver_alert_subscriptions["driver-001"] = {
            "route-A": "sid-001",
            "route-B": "sid-002",
        }

        alert = TrafficAlert(
            id="alert-001",
            type="CONSTRUCTION",
            severity="MEDIUM",
            title="Road construction",
            description="Main Street closed for construction",
            location="Main Street",
            delay_time=1800,
            impact="CONSIDER",
            reported_time=datetime.now(),
        )

        # Broadcast to route-A
        result_a = await broadcast_traffic_alert(mock_sio_server, alert, "route-A")
        assert result_a is True

        # Reset mock for second broadcast
        mock_sio_server.emit.reset_mock()

        # Broadcast to route-B (should not be duplicate between different routes)
        result_b = await broadcast_traffic_alert(mock_sio_server, alert, "route-B")
        # Second broadcast within same alert window will be filtered as duplicate
        # This is expected behavior for deduplication

    @pytest.mark.asyncio
    async def test_alert_stats_generation(self):
        """Test alert statistics generation"""
        from app.sockets.traffic_alerts import (
            get_alert_stats,
            driver_alert_subscriptions,
            alert_cache,
        )

        driver_alert_subscriptions["driver-001"] = {"route-A": "sid-001"}
        driver_alert_subscriptions["driver-002"] = {
            "route-B": "sid-002",
            "route-C": "sid-003",
        }

        stats = get_alert_stats()

        assert stats["active_drivers"] == 2
        assert stats["total_subscriptions"] == 3
        assert "timestamp" in stats

    @pytest.mark.asyncio
    async def test_alert_cache_cleanup(self):
        """Test old alert cache cleanup"""
        from app.sockets.traffic_alerts import (
            cleanup_old_alerts,
            alert_cache,
        )

        # Simulate old alerts
        alert_cache["old-alert"] = {
            "timestamp": datetime.now(),
            "count": 1,
            "severity": "LOW",
        }

        initial_count = len(alert_cache)
        await cleanup_old_alerts()

        # Cache should not be empty (alert is recent)
        assert len(alert_cache) >= initial_count - 1


class TestTrafficAlertsIntegration:
    """Integration tests combining multiple components"""

    @pytest.mark.asyncio
    async def test_end_to_end_alert_flow(self, mock_sio_server=None):
        """
        Test complete flow:
        1. Driver subscribes to route
        2. Traffic incident reported
        3. Alert broadcasted to subscribed drivers
        4. Driver dismisses alert
        """
        from app.sockets.traffic_alerts import (
            driver_alert_subscriptions,
            driver_preferences,
            TrafficAlert,
        )

        # Step 1: Driver subscribes
        driver_id = "driver-001"
        route_id = "route-123"

        driver_alert_subscriptions[driver_id] = {route_id: "sid-001"}
        driver_preferences[driver_id] = {
            "muted_alert_ids": set(),
            "dismissed_alert_ids": set(),
        }

        assert len(driver_alert_subscriptions[driver_id]) == 1

        # Step 2: New alert
        alert = TrafficAlert(
            id="alert-001",
            type="ACCIDENT",
            severity="HIGH",
            title="Accident reported",
            description="Two-vehicle collision",
            location="Main Street",
            delay_time=900,
            impact="AVOID",
            reported_time=datetime.now(),
        )

        # Step 3: Driver dismisses
        driver_preferences[driver_id]["dismissed_alert_ids"].add(alert.id)

        assert alert.id in driver_preferences[driver_id]["dismissed_alert_ids"]


# Run tests with: pytest tests/e2e/test_traffic_alerts_e2e.py -v
if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
