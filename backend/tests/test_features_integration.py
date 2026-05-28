"""
Integration Tests for Passenger Features
Tests complete workflows from frontend to backend to database
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from datetime import datetime, timedelta
import json

# This is a template showing test patterns
# Adjust imports based on your actual project structure

SCHEDULED_RIDES_DEPRECATED_MESSAGE = "Scheduled rides are managed as real bookings now"


def assert_scheduled_rides_deprecated(response):
    assert response.status_code == 410
    assert SCHEDULED_RIDES_DEPRECATED_MESSAGE in response.json()["detail"]


class TestPassengerRatings:
    """Test rating submission and retrieval"""
    
    def test_submit_rating(self, client: TestClient, auth_headers: dict, db_session: Session):
        """Test passenger can submit a rating"""
        rating_data = {
            "driver_id": "driver-123",
            "booking_id": "booking-456",
            "score": 5,
            "feedback": "Excellent driver, very professional!"
        }
        
        response = client.post(
            "/api/v1/passengers/ratings",
            json=rating_data,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["score"] == 5
        assert data["feedback"] == rating_data["feedback"]
        assert data["driver_id"] == "driver-123"
        assert "id" in data
        assert "created_at" in data
    
    
    def test_get_passenger_ratings(self, client: TestClient, auth_headers: dict, db_session: Session):
        """Test passenger can retrieve all their ratings"""
        # First, submit a few ratings
        for i in range(3):
            rating_data = {
                "driver_id": f"driver-{i}",
                "score": min(5, 4 + i),
                "feedback": f"Good ride #{i}"
            }
            client.post(
                "/api/v1/passengers/ratings",
                json=rating_data,
                headers=auth_headers
            )
        
        # Retrieve ratings
        response = client.get(
            "/api/v1/passengers/ratings",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert len(data) >= 3
        assert all("id" in r for r in data)
        assert all("score" in r for r in data)
    
    
    def test_invalid_rating_score(self, client: TestClient, auth_headers: dict):
        """Test rating with invalid score is rejected"""
        rating_data = {
            "driver_id": "driver-123",
            "score": 10,  # Invalid, must be 1-5
            "feedback": "Great!"
        }
        
        response = client.post(
            "/api/v1/passengers/ratings",
            json=rating_data,
            headers=auth_headers
        )
        
        assert response.status_code == 422  # Validation error


class TestSavedPlaces:
    """Test saved places management"""
    
    def test_add_saved_place(self, client: TestClient, auth_headers: dict, db_session: Session):
        """Test adding a saved place"""
        place_data = {
            "name": "Home",
            "address": "123 Main St, Springfield",
            "place_type": "home",
            "latitude": 40.7128,
            "longitude": -74.0060,
            "is_favorite": True
        }
        
        response = client.post(
            "/api/v1/passengers/saved-places",
            json=place_data,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["name"] == "Home"
        assert data["address"] == place_data["address"]
        assert data["place_type"] == "home"
        assert data["is_favorite"] == True
    
    
    def test_get_saved_places_by_type(self, client: TestClient, auth_headers: dict):
        """Test retrieving saved places filtered by type"""
        # Add home and work places
        client.post(
            "/api/v1/passengers/saved-places",
            json={
                "name": "Home",
                "address": "123 Main St",
                "place_type": "home",
                "latitude": 40.7128,
                "longitude": -74.0060
            },
            headers=auth_headers
        )
        
        client.post(
            "/api/v1/passengers/saved-places",
            json={
                "name": "Office",
                "address": "456 Office Blvd",
                "place_type": "work",
                "latitude": 40.7132,
                "longitude": -74.0065
            },
            headers=auth_headers
        )
        
        # Filter by home
        response = client.get(
            "/api/v1/passengers/saved-places?place_type=home",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert len(data) >= 1
        assert all(p["place_type"] == "home" for p in data)
    
    
    def test_update_saved_place(self, client: TestClient, auth_headers: dict):
        """Test updating a saved place"""
        # Create a place
        create_response = client.post(
            "/api/v1/passengers/saved-places",
            json={
                "name": "Home",
                "address": "123 Main St",
                "place_type": "home",
                "latitude": 40.7128,
                "longitude": -74.0060
            },
            headers=auth_headers
        )
        
        place_id = create_response.json()["id"]
        
        # Update it
        response = client.put(
            f"/api/v1/passengers/saved-places/{place_id}",
            json={
                "name": "Home Sweet Home",
                "address": "123 Main St, Updated",
                "place_type": "home",
                "latitude": 40.7128,
                "longitude": -74.0060
            },
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Home Sweet Home"


class TestPreferences:
    """Test user preferences management"""
    
    def test_get_default_preferences(self, client: TestClient, auth_headers: dict):
        """Test getting default preferences"""
        response = client.get(
            "/api/v1/passengers/preferences",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Check default values
        assert data["push_notifications"] == True
        assert data["language"] == "en"
        assert data["default_payment_method"] == "wallet"
    
    
    def test_update_preferences(self, client: TestClient, auth_headers: dict):
        """Test updating preferences"""
        update_data = {
            "language": "ml",
            "push_notifications": False,
            "default_payment_method": "card"
        }
        
        response = client.patch(
            "/api/v1/passengers/preferences",
            json=update_data,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["language"] == "ml"
        assert data["push_notifications"] == False
        assert data["default_payment_method"] == "card"
    
    
    def test_partial_preference_update(self, client: TestClient, auth_headers: dict):
        """Test updating only some preferences"""
        response = client.patch(
            "/api/v1/passengers/preferences",
            json={"language": "ml"},
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        # Language should be updated
        assert data["language"] == "ml"
        # Other defaults should remain
        assert data["push_notifications"] == True


class TestScheduledRides:
    """Test scheduled ride feature route deprecation"""
    
    def test_create_scheduled_ride_route_is_deprecated(self, client: TestClient, auth_headers: dict):
        """Scheduled rides are now created through the real booking flow"""
        future_time = datetime.utcnow() + timedelta(days=1)
        
        ride_data = {
            "pickup_location": "123 Main St",
            "pickup_latitude": 40.7128,
            "pickup_longitude": -74.0060,
            "dropoff_location": "456 Park Ave",
            "dropoff_latitude": 40.7580,
            "dropoff_longitude": -73.9855,
            "scheduled_time": future_time.isoformat(),
            "ride_type": "normal"
        }
        
        response = client.post(
            "/api/v1/passengers/scheduled-rides",
            json=ride_data,
            headers=auth_headers
        )
        
        assert_scheduled_rides_deprecated(response)
    
    
    def test_get_upcoming_rides_route_is_deprecated(self, client: TestClient, auth_headers: dict):
        """Scheduled ride lists now come from /api/bookings"""
        response = client.get(
            "/api/v1/passengers/scheduled-rides?status=scheduled",
            headers=auth_headers
        )
        
        assert_scheduled_rides_deprecated(response)


    def test_update_and_cancel_scheduled_ride_routes_are_deprecated(self, client: TestClient, auth_headers: dict):
        """Stale scheduled ride mutation routes should stay closed"""
        future_time = datetime.utcnow() + timedelta(days=1)
        payload = {
            "pickup_location": "123 Main St",
            "dropoff_location": "456 Park Ave",
            "scheduled_time": future_time.isoformat(),
            "ride_type": "normal"
        }

        update_response = client.patch(
            "/api/v1/passengers/scheduled-rides/ride-123",
            json=payload,
            headers=auth_headers
        )
        delete_response = client.delete(
            "/api/v1/passengers/scheduled-rides/ride-123",
            headers=auth_headers
        )

        assert_scheduled_rides_deprecated(update_response)
        assert_scheduled_rides_deprecated(delete_response)


class TestPaymentMethods:
    """Test payment methods management"""
    
    def test_add_payment_method(self, client: TestClient, auth_headers: dict):
        """Test adding a payment method"""
        method_data = {
            "method_type": "card",
            "card_last_four": "4242",
            "card_brand": "visa",
            "card_expiry": "12/25",
            "is_default": True
        }
        
        response = client.post(
            "/api/v1/passengers/payment-methods",
            json=method_data,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["method_type"] == "card"
        assert data["card_brand"] == "visa"
        assert data["is_default"] == True
    
    
    def test_get_payment_methods(self, client: TestClient, auth_headers: dict):
        """Test retrieving payment methods"""
        # Add a few methods
        for i in range(2):
            client.post(
                "/api/v1/passengers/payment-methods",
                json={
                    "method_type": "upi" if i == 0 else "card",
                    "upi_id": f"user{i}@upi" if i == 0 else None,
                    "card_last_four": "4242" if i == 1 else None
                },
                headers=auth_headers
            )
        
        response = client.get(
            "/api/v1/passengers/payment-methods",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert len(data) >= 2


class TestPromoCodeValidation:
    """Test promo code validation"""
    
    def test_validate_valid_promo_code(self, client: TestClient, auth_headers: dict, db_session: Session):
        """Test validating a valid promo code"""
        # This assumes a promo code already exists in DB
        promo_data = {
            "code": "SAVE10",
            "ride_fare": 500.0
        }
        
        response = client.post(
            "/api/v1/passengers/promo-codes/validate",
            json=promo_data,
            headers=auth_headers
        )
        
        # Should succeed if code exists
        if response.status_code == 200:
            data = response.json()
            assert "code" in data
            assert "discount_value" in data
        else:
            # Expected 404 if code doesn't exist in test
            assert response.status_code == 404
    
    
    def test_invalid_promo_code(self, client: TestClient, auth_headers: dict):
        """Test validation fails for invalid code"""
        promo_data = {
            "code": "INVALID_CODE_12345",
            "ride_fare": 500.0
        }
        
        response = client.post(
            "/api/v1/passengers/promo-codes/validate",
            json=promo_data,
            headers=auth_headers
        )
        
        assert response.status_code == 404


class TestSupportTickets:
    """Test support ticket system"""
    
    def test_create_support_ticket(self, client: TestClient, auth_headers: dict):
        """Test creating a support ticket"""
        ticket_data = {
            "subject": "Driver was rude",
            "description": "The driver was very rude during my ride",
            "category": "driver",
            "priority": "high"
        }
        
        response = client.post(
            "/api/v1/passengers/support/tickets",
            json=ticket_data,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["subject"] == ticket_data["subject"]
        assert data["category"] == "driver"
        assert data["status"] == "open"
    
    
    def test_add_message_to_ticket(self, client: TestClient, auth_headers: dict):
        """Test adding a message to support ticket"""
        # Create ticket
        create_response = client.post(
            "/api/v1/passengers/support/tickets",
            json={
                "subject": "Issue",
                "description": "I have an issue",
                "category": "other"
            },
            headers=auth_headers
        )
        
        ticket_id = create_response.json()["id"]
        
        # Add message
        response = client.post(
            f"/api/v1/passengers/support/tickets/{ticket_id}/messages",
            json={
                "message_text": "Can you help me with this?",
                "attachment_url": None
            },
            headers=auth_headers
        )
        
        assert response.status_code == 200


class TestAccessibilitySettings:
    """Test accessibility settings"""
    
    def test_get_default_accessibility_settings(self, client: TestClient, auth_headers: dict):
        """Test getting default accessibility settings"""
        response = client.get(
            "/api/v1/passengers/accessibility",
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["text_size"] == "normal"
        assert data["high_contrast"] == False
        assert data["voice_guidance"] == False
    
    
    def test_update_accessibility_settings(self, client: TestClient, auth_headers: dict):
        """Test updating accessibility settings"""
        update_data = {
            "text_size": "large",
            "high_contrast": True,
            "voice_guidance": True,
            "voice_guidance_speed": 0.8
        }
        
        response = client.patch(
            "/api/v1/passengers/accessibility",
            json=update_data,
            headers=auth_headers
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["text_size"] == "large"
        assert data["high_contrast"] == True
        assert data["voice_guidance"] == True
        assert data["voice_guidance_speed"] == 0.8


class TestEndToEndWorkflows:
    """Integration tests for complete feature workflows"""
    
    def test_complete_ride_and_rating_workflow(self, client: TestClient, auth_headers: dict):
        """Test rating workflow against a real booking id supplied by dispatch"""
        rating_response = client.post(
            "/api/v1/passengers/ratings",
            json={
                "driver_id": "driver-123",
                "booking_id": "booking-456",
                "score": 5,
                "feedback": "Great ride!"
            },
            headers=auth_headers
        )
        assert rating_response.status_code == 200
        
        # Verify rating was saved
        ratings = client.get(
            "/api/v1/passengers/ratings",
            headers=auth_headers
        )
        assert len(ratings.json()) >= 1
    
    
    def test_saved_places_and_scheduled_ride_workflow(self, client: TestClient, auth_headers: dict):
        """Test using saved places for scheduling rides"""
        # Step 1: Save home location
        home_response = client.post(
            "/api/v1/passengers/saved-places",
            json={
                "name": "Home",
                "address": "123 Main St",
                "place_type": "home",
                "latitude": 40.7128,
                "longitude": -74.0060
            },
            headers=auth_headers
        )
        assert home_response.status_code == 200
        
        # Step 2: Save office location
        office_response = client.post(
            "/api/v1/passengers/saved-places",
            json={
                "name": "Office",
                "address": "456 Office Blvd",
                "place_type": "work",
                "latitude": 40.7580,
                "longitude": -73.9855
            },
            headers=auth_headers
        )
        assert office_response.status_code == 200
        
        # Step 3: Legacy scheduled ride route should tell clients to use real bookings
        future_time = datetime.utcnow() + timedelta(days=1)
        
        ride_response = client.post(
            "/api/v1/passengers/scheduled-rides",
            json={
                "pickup_location": "Home",  # Using saved place name
                "pickup_latitude": 40.7128,
                "pickup_longitude": -74.0060,
                "dropoff_location": "Office",
                "dropoff_latitude": 40.7580,
                "dropoff_longitude": -73.9855,
                "scheduled_time": future_time.isoformat(),
                "ride_type": "normal"
            },
            headers=auth_headers
        )
        assert_scheduled_rides_deprecated(ride_response)
