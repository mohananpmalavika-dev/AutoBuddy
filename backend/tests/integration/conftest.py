"""
Integration test configuration for mobile features
Provides fixtures for testing mobile app ↔ backend API integration
"""

import pytest
import sys
import uuid
from pathlib import Path
from datetime import datetime, timedelta
import os

# Add parent directories to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))


class MockClient:
    """Mock HTTP client for testing without actual server instance"""

    def __init__(self):
        self.base_url = "http://testserver"

    def _make_response(self, status_code=404, data=None):
        """Create mock response"""
        class MockResponse:
            def __init__(self, status, json_data=None):
                self.status_code = status
                self.headers = {"content-type": "application/json"}
                self._json_data = json_data or {"error": "Not implemented"}

            def json(self):
                return self._json_data

        return MockResponse(status_code, data)

    def get(self, path, **kwargs):
        """Mock GET request"""
        # For now, return 404 - endpoints don't exist yet
        return self._make_response(404, {"error": f"Endpoint not found: {path}"})

    def post(self, path, **kwargs):
        """Mock POST request"""
        return self._make_response(404, {"error": f"Endpoint not found: {path}"})

    def patch(self, path, **kwargs):
        """Mock PATCH request"""
        return self._make_response(404, {"error": f"Endpoint not found: {path}"})

    def delete(self, path, **kwargs):
        """Mock DELETE request"""
        return self._make_response(404, {"error": f"Endpoint not found: {path}"})


@pytest.fixture(scope="function")
def client():
    """Provide test client for making requests"""
    return MockClient()


@pytest.fixture(scope="function")
def auth_headers():
    """Provide authentication headers for testing"""
    passenger_id = f"passenger-{uuid.uuid4()}"
    return {
        "Authorization": f"Bearer mock-token-{passenger_id}",
        "X-Passenger-ID": passenger_id,
        "Content-Type": "application/json"
    }


@pytest.fixture(scope="function")
def driver_headers():
    """Provide driver authentication headers"""
    driver_id = f"driver-{uuid.uuid4()}"
    return {
        "Authorization": f"Bearer mock-token-{driver_id}",
        "X-Driver-ID": driver_id,
        "Content-Type": "application/json"
    }


@pytest.fixture(scope="function")
def admin_headers():
    """Provide admin authentication headers"""
    admin_id = f"admin-{uuid.uuid4()}"
    return {
        "Authorization": f"Bearer mock-token-{admin_id}",
        "X-Admin-ID": admin_id,
        "Content-Type": "application/json"
    }


# Markers for test categorization
def pytest_configure(config):
    """Register custom markers"""
    config.addinivalue_line(
        "markers",
        "integration: integration tests for mobile ↔ backend"
    )
    config.addinivalue_line(
        "markers",
        "receipt: receipt generation tests"
    )
    config.addinivalue_line(
        "markers",
        "insurance: insurance coverage tests"
    )
    config.addinivalue_line(
        "markers",
        "expenses: expense categorization tests"
    )
    config.addinivalue_line(
        "markers",
        "preferences: ride preferences tests"
    )
    config.addinivalue_line(
        "markers",
        "accessibility: accessibility settings tests"
    )
    config.addinivalue_line(
        "markers",
        "family: family accounts tests"
    )
    config.addinivalue_line(
        "markers",
        "corporate: corporate accounts tests"
    )
    config.addinivalue_line(
        "markers",
        "routes: route optimization tests"
    )
    config.addinivalue_line(
        "markers",
        "fleet: fleet management tests"
    )
