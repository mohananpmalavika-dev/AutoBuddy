"""
Fleet Profitability Endpoints - Comprehensive Test Suite
Tests for all fleet profitability endpoints including financial analytics,
vehicle metrics, ROI analysis, and optimization recommendations.
"""

import pytest
import json
from datetime import datetime


@pytest.fixture
def auth_headers():
    """Bearer token authorization headers"""
    return {"Authorization": "Bearer test-token"}


@pytest.fixture
def fleet_id():
    """Test fleet ID"""
    return "fleet_bangalore_001"


# ============================================================================
# Portfolio Endpoints Tests
# ============================================================================
class TestPortfolioEndpoints:
    """Tests for fleet portfolio and overview endpoints"""

    @pytest.mark.asyncio
    async def test_get_portfolio_success(self, client, auth_headers, fleet_id):
        """Test successful portfolio retrieval"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/portfolio",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["status"] == "success"
        assert "data" in data
        assert "portfolio_id" in data["data"]
        assert "total_vehicles" in data["data"]
        assert "total_daily_revenue" in data["data"]

    @pytest.mark.asyncio
    async def test_get_dashboard_success(self, client, auth_headers, fleet_id):
        """Test dashboard data retrieval"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/dashboard",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["status"] == "success"
        assert "daily_summary" in data["data"]
        assert "revenue" in data["data"]["daily_summary"]
        assert "profit" in data["data"]["daily_summary"]
        assert "margin_percentage" in data["data"]["daily_summary"]

    @pytest.mark.asyncio
    async def test_get_trends_success(self, client, auth_headers, fleet_id):
        """Test trends data retrieval with period parameter"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/trends?period=monthly",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["status"] == "success"
        assert "trends" in data["data"]

    @pytest.mark.asyncio
    async def test_portfolio_invalid_fleet_id(self, client, auth_headers):
        """Test portfolio with invalid fleet ID"""
        response = await client.get(
            "/api/v1/fleet-profitability/fleets/invalid_fleet/portfolio",
            headers=auth_headers,
        )
        # Should still return 200 with mock data (no database validation)
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_portfolio_missing_auth(self, client, fleet_id):
        """Test portfolio without authentication"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/portfolio"
        )
        # Permissive auth - should still work without header
        assert response.status_code == 200


# ============================================================================
# Vehicle Profitability Endpoints Tests
# ============================================================================
class TestVehicleProfitability:
    """Tests for vehicle-level profitability endpoints"""

    @pytest.mark.asyncio
    async def test_get_vehicles_list(self, client, auth_headers, fleet_id):
        """Test retrieving vehicles list with pagination"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/vehicles?limit=10&offset=0",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["status"] == "success"
        assert "vehicles" in data["data"]
        assert isinstance(data["data"]["vehicles"], list)
        assert len(data["data"]["vehicles"]) > 0

    @pytest.mark.asyncio
    async def test_get_vehicles_pagination(self, client, auth_headers, fleet_id):
        """Test vehicles pagination"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/vehicles?limit=5&offset=5",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = json.loads(response.body)
        assert "vehicles" in data["data"]

    @pytest.mark.asyncio
    async def test_get_vehicle_details(self, client, auth_headers, fleet_id):
        """Test getting specific vehicle details"""
        vehicle_id = "vehicle_bangalore_001"
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/vehicles/{vehicle_id}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["status"] == "success"
        assert "vehicle_id" in data["data"]
        assert data["data"]["vehicle_id"] == vehicle_id

    @pytest.mark.asyncio
    async def test_get_top_performers(self, client, auth_headers, fleet_id):
        """Test retrieving top performing vehicles"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/top-performers?limit=10",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["status"] == "success"
        assert "vehicles" in data["data"]
        assert len(data["data"]["vehicles"]) > 0

    @pytest.mark.asyncio
    async def test_get_vehicles_needing_attention(self, client, auth_headers, fleet_id):
        """Test retrieving vehicles needing attention"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/needs-attention",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["status"] == "success"
        assert "vehicles" in data["data"]

    @pytest.mark.asyncio
    async def test_vehicle_profit_margin_valid(self, client, auth_headers, fleet_id):
        """Test vehicle profit margin is within valid range"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/vehicles?limit=1",
            headers=auth_headers,
        )
        data = json.loads(response.body)
        vehicle = data["data"]["vehicles"][0]
        assert 0 <= vehicle["profit_margin"] <= 100

    @pytest.mark.asyncio
    async def test_vehicle_utilization_valid(self, client, auth_headers, fleet_id):
        """Test vehicle utilization is within valid range"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/vehicles?limit=1",
            headers=auth_headers,
        )
        data = json.loads(response.body)
        vehicle = data["data"]["vehicles"][0]
        assert 0 <= vehicle["utilization_rate"] <= 100


# ============================================================================
# Cost and Revenue Analysis Tests
# ============================================================================
class TestCostRevenue:
    """Tests for cost breakdown and revenue analysis endpoints"""

    @pytest.mark.asyncio
    async def test_cost_breakdown_fleet_level(self, client, auth_headers, fleet_id):
        """Test cost breakdown at fleet level"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/cost-breakdown",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["status"] == "success"
        assert "cost_breakdown" in data["data"]

    @pytest.mark.asyncio
    async def test_cost_breakdown_vehicle_level(self, client, auth_headers, fleet_id):
        """Test cost breakdown at vehicle level"""
        vehicle_id = "vehicle_bangalore_001"
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/cost-breakdown?vehicle_id={vehicle_id}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["status"] == "success"

    @pytest.mark.asyncio
    async def test_revenue_analysis(self, client, auth_headers, fleet_id):
        """Test revenue analysis endpoint"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/revenue-analysis",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["status"] == "success"
        assert "revenue_analysis" in data["data"]

    @pytest.mark.asyncio
    async def test_cost_components_structure(self, client, auth_headers, fleet_id):
        """Test cost breakdown includes all components"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/cost-breakdown",
            headers=auth_headers,
        )
        data = json.loads(response.body)
        cost_data = data["data"]["cost_breakdown"]
        assert "fuel_cost" in cost_data
        assert "maintenance_cost" in cost_data
        assert "insurance_cost" in cost_data
        assert "driver_payment" in cost_data
        assert "total_cost" in cost_data


# ============================================================================
# ROI Analysis Tests
# ============================================================================
class TestROIAnalysis:
    """Tests for ROI and return on investment endpoints"""

    @pytest.mark.asyncio
    async def test_vehicle_roi(self, client, auth_headers, fleet_id):
        """Test vehicle ROI analysis"""
        vehicle_id = "vehicle_bangalore_001"
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/vehicles/{vehicle_id}/roi",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["status"] == "success"
        assert "vehicle_id" in data["data"]
        assert "roi_percentage" in data["data"]
        assert "break_even_months" in data["data"]

    @pytest.mark.asyncio
    async def test_roi_summary(self, client, auth_headers, fleet_id):
        """Test fleet-level ROI summary"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/roi-summary",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["status"] == "success"
        assert "overall_roi_percentage" in data["data"]
        assert "average_vehicle_roi" in data["data"]
        assert "vehicles_roi_positive" in data["data"]

    @pytest.mark.asyncio
    async def test_before_after_metrics(self, client, auth_headers, fleet_id):
        """Test before-after comparison metrics"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/before-after",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["status"] == "success"

    @pytest.mark.asyncio
    async def test_roi_percentage_valid_range(self, client, auth_headers, fleet_id):
        """Test ROI percentages are valid"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/roi-summary",
            headers=auth_headers,
        )
        data = json.loads(response.body)
        roi_data = data["data"]
        # ROI can be negative or positive but should be reasonable
        assert isinstance(roi_data["overall_roi_percentage"], (int, float))


# ============================================================================
# Optimization and Recommendations Tests
# ============================================================================
class TestOptimization:
    """Tests for optimization tips and recommendations"""

    @pytest.mark.asyncio
    async def test_optimization_tips(self, client, auth_headers, fleet_id):
        """Test retrieving optimization tips"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/optimization-tips",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["status"] == "success"
        assert "optimization_tips" in data["data"]
        assert len(data["data"]["optimization_tips"]) > 0

    @pytest.mark.asyncio
    async def test_optimization_tip_structure(self, client, auth_headers, fleet_id):
        """Test optimization tip has all required fields"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/optimization-tips",
            headers=auth_headers,
        )
        data = json.loads(response.body)
        tip = data["data"]["optimization_tips"][0]
        assert "tip_id" in tip
        assert "title" in tip
        assert "potential_profit_increase" in tip
        assert "estimated_roi_days" in tip
        assert "priority" in tip

    @pytest.mark.asyncio
    async def test_vehicle_recommendations(self, client, auth_headers, fleet_id):
        """Test vehicle-specific recommendations"""
        vehicle_id = "vehicle_bangalore_001"
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/vehicles/{vehicle_id}/recommendations",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["status"] == "success"

    @pytest.mark.asyncio
    async def test_optimization_opportunities(self, client, auth_headers, fleet_id):
        """Test retrieving optimization opportunities"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/optimization-opportunities",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["status"] == "success"

    @pytest.mark.asyncio
    async def test_tip_priority_valid(self, client, auth_headers, fleet_id):
        """Test tip priorities are valid"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/optimization-tips",
            headers=auth_headers,
        )
        data = json.loads(response.body)
        tip = data["data"]["optimization_tips"][0]
        assert tip["priority"] in ["high", "medium", "low"]


# ============================================================================
# Driver Performance Tests
# ============================================================================
class TestDriverPerformance:
    """Tests for driver performance metrics endpoints"""

    @pytest.mark.asyncio
    async def test_driver_performance_metrics(self, client, auth_headers, fleet_id):
        """Test driver performance metrics retrieval"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/driver-performance",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["status"] == "success"
        assert "drivers" in data["data"]

    @pytest.mark.asyncio
    async def test_maintenance_alerts(self, client, auth_headers, fleet_id):
        """Test maintenance alerts retrieval"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/maintenance-alerts",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["status"] == "success"
        assert "alerts" in data["data"]

    @pytest.mark.asyncio
    async def test_driver_metric_structure(self, client, auth_headers, fleet_id):
        """Test driver metric contains all required fields"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/driver-performance",
            headers=auth_headers,
        )
        data = json.loads(response.body)
        driver = data["data"]["drivers"][0]
        assert "driver_id" in driver
        assert "average_rating" in driver
        assert "daily_revenue_generated" in driver

    @pytest.mark.asyncio
    async def test_maintenance_alert_structure(self, client, auth_headers, fleet_id):
        """Test maintenance alert has required fields"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/maintenance-alerts",
            headers=auth_headers,
        )
        data = json.loads(response.body)
        alert = data["data"]["alerts"][0]
        assert "alert_id" in alert
        assert "vehicle_id" in alert
        assert "alert_type" in alert
        assert "urgency" in alert


# ============================================================================
# Error Handling Tests
# ============================================================================
class TestErrorHandling:
    """Tests for error handling and edge cases"""

    @pytest.mark.asyncio
    async def test_unauthorized_request(self, client, fleet_id):
        """Test request without authentication token"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/portfolio"
        )
        # Permissive auth - should still work
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_invalid_fleet_id_format(self, client, auth_headers):
        """Test with malformed fleet ID"""
        response = await client.get(
            "/api/v1/fleet-profitability/fleets/!!invalid!!@#/portfolio",
            headers=auth_headers,
        )
        # Should return 200 with mock data
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_invalid_limit_parameter(self, client, auth_headers, fleet_id):
        """Test with invalid limit parameter"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/vehicles?limit=abc",
            headers=auth_headers,
        )
        # Should handle gracefully
        assert response.status_code in [200, 422]

    @pytest.mark.asyncio
    async def test_negative_limit_parameter(self, client, auth_headers, fleet_id):
        """Test with negative limit"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/vehicles?limit=-1",
            headers=auth_headers,
        )
        assert response.status_code in [200, 422]

    @pytest.mark.asyncio
    async def test_response_timestamp_format(self, client, auth_headers, fleet_id):
        """Test response includes properly formatted timestamp"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/portfolio",
            headers=auth_headers,
        )
        data = json.loads(response.body)
        assert "updated_at" in data
        # Should be ISO format string
        assert isinstance(data["updated_at"], str)

    @pytest.mark.asyncio
    async def test_response_status_field(self, client, auth_headers, fleet_id):
        """Test all responses include status field"""
        response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/portfolio",
            headers=auth_headers,
        )
        data = json.loads(response.body)
        assert "status" in data
        assert data["status"] in ["success", "error"]


# ============================================================================
# Health Check Tests
# ============================================================================
class TestHealthCheck:
    """Tests for service health endpoint"""

    @pytest.mark.asyncio
    async def test_health_endpoint(self, client):
        """Test health check endpoint"""
        response = await client.get("/api/v1/fleet-profitability/health")
        assert response.status_code == 200
        data = json.loads(response.body)
        assert data["status"] == "healthy"
        assert "version" in data
        assert "timestamp" in data

    @pytest.mark.asyncio
    async def test_health_timestamp_format(self, client):
        """Test health endpoint timestamp format"""
        response = await client.get("/api/v1/fleet-profitability/health")
        data = json.loads(response.body)
        assert isinstance(data["timestamp"], str)


# ============================================================================
# Integration Tests
# ============================================================================
class TestIntegration:
    """Integration tests combining multiple endpoints"""

    @pytest.mark.asyncio
    async def test_dashboard_to_vehicles_flow(self, client, auth_headers, fleet_id):
        """Test flow from dashboard to vehicle details"""
        # Get dashboard
        dashboard_response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/dashboard",
            headers=auth_headers,
        )
        assert dashboard_response.status_code == 200

        # Get vehicles
        vehicles_response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/vehicles?limit=1",
            headers=auth_headers,
        )
        assert vehicles_response.status_code == 200
        vehicles_data = json.loads(vehicles_response.body)
        
        # Vehicles should have consistent data structure
        vehicle = vehicles_data["data"]["vehicles"][0]
        assert "daily_profit" in vehicle
        assert "daily_revenue" in vehicle

    @pytest.mark.asyncio
    async def test_roi_and_optimization_flow(self, client, auth_headers, fleet_id):
        """Test flow from ROI to optimization tips"""
        # Get ROI summary
        roi_response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/roi-summary",
            headers=auth_headers,
        )
        assert roi_response.status_code == 200

        # Get optimization tips
        tips_response = await client.get(
            f"/api/v1/fleet-profitability/fleets/{fleet_id}/optimization-tips",
            headers=auth_headers,
        )
        assert tips_response.status_code == 200
        tips_data = json.loads(tips_response.body)
        assert len(tips_data["data"]["optimization_tips"]) > 0
