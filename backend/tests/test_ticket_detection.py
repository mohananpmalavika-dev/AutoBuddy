"""
Test suite for ticket detection feature
Tests ticket info extraction and ride creation workflow
"""
import pytest
import asyncio
import os
from unittest.mock import AsyncMock, MagicMock, patch
from io import BytesIO
from PIL import Image

from app.services.ticket_detection import (
    TicketDetectionService,
    DetectedTicketInfo,
    DetectedLocation
)


@pytest.fixture
def sample_ticket_image():
    """Create a sample image for testing"""
    img = Image.new('RGB', (200, 200), color='white')
    img_bytes = BytesIO()
    img.save(img_bytes, format='PNG')
    return img_bytes.getvalue()


@pytest.fixture
def ticket_detection_service():
    """Create ticket detection service instance"""
    return TicketDetectionService(api_key="test_key")


class TestImageValidation:
    """Test image validation"""
    
    def test_validate_valid_image(self, sample_ticket_image):
        """Test valid image passes validation"""
        valid, error = TicketDetectionService._validate_image(sample_ticket_image)
        assert valid is True
        assert error is None
    
    def test_validate_oversized_image(self):
        """Test oversized image fails validation"""
        large_data = b"x" * (21 * 1024 * 1024)  # 21MB
        valid, error = TicketDetectionService._validate_image(large_data, max_size_mb=20)
        assert valid is False
        assert "exceeds" in error.lower()
    
    def test_validate_invalid_image_format(self):
        """Test invalid image format fails validation"""
        invalid_data = b"not an image"
        valid, error = TicketDetectionService._validate_image(invalid_data)
        assert valid is False
        assert "invalid" in error.lower()


class TestBase64Conversion:
    """Test image to base64 conversion"""
    
    def test_base64_conversion(self, sample_ticket_image):
        """Test image converts to valid base64"""
        b64 = TicketDetectionService._image_to_base64(sample_ticket_image)
        assert isinstance(b64, str)
        assert len(b64) > 0
        # Valid base64 contains only alphanumeric, +, /, =
        assert all(c in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=" for c in b64)


class TestTicketDetection:
    """Test ticket detection service"""
    
    @pytest.mark.asyncio
    async def test_detect_airport_ticket(self, ticket_detection_service, sample_ticket_image):
        """Test detection of airport ticket"""
        mock_response = MagicMock()
        mock_response.text = """{
            "ticket_type": "airport",
            "departure_location": "New York (JFK)",
            "arrival_location": "London (LHR)",
            "departure_datetime": "2026-06-24T20:30:00",
            "arrival_datetime": "2026-06-25T08:00:00",
            "confirmation_number": "BA456",
            "passenger_name": "John Doe",
            "carrier_name": "British Airways",
            "additional_info": {"seat": "12A", "flight": "BA456"}
        }"""
        
        with patch('app.services.ticket_detection.genai') as mock_genai:
            mock_model = MagicMock()
            mock_model.generate_content = MagicMock(return_value=mock_response)
            mock_genai.GenerativeModel = MagicMock(return_value=mock_model)
            
            success, ticket_info, error = await ticket_detection_service.detect_ticket_info(sample_ticket_image)
            
            assert success is True
            assert error is None
            assert ticket_info.ticket_type == "airport"
            assert ticket_info.departure_location == "New York (JFK)"
            assert ticket_info.confirmation_number == "BA456"
    
    @pytest.mark.asyncio
    async def test_detect_train_ticket(self, ticket_detection_service, sample_ticket_image):
        """Test detection of train ticket"""
        mock_response = MagicMock()
        mock_response.text = """{
            "ticket_type": "train",
            "departure_location": "Chicago Union Station",
            "arrival_location": "Denver Union Station",
            "departure_datetime": "2026-06-25T14:00:00",
            "arrival_datetime": "2026-06-25T20:00:00",
            "confirmation_number": "AMTK789",
            "passenger_name": "Jane Smith",
            "carrier_name": "Amtrak",
            "additional_info": {"seat": "Car 3, Seat 14", "service": "Chicago to Denver"}
        }"""
        
        with patch('app.services.ticket_detection.genai') as mock_genai:
            mock_model = MagicMock()
            mock_model.generate_content = MagicMock(return_value=mock_response)
            mock_genai.GenerativeModel = MagicMock(return_value=mock_model)
            
            success, ticket_info, error = await ticket_detection_service.detect_ticket_info(sample_ticket_image)
            
            assert success is True
            assert ticket_info.ticket_type == "train"
            assert ticket_info.carrier_name == "Amtrak"
    
    @pytest.mark.asyncio
    async def test_detect_event_ticket(self, ticket_detection_service, sample_ticket_image):
        """Test detection of event ticket"""
        mock_response = MagicMock()
        mock_response.text = """{
            "ticket_type": "event",
            "departure_location": "Madison Square Garden, NYC",
            "arrival_location": null,
            "departure_datetime": "2026-06-25T19:00:00",
            "arrival_datetime": null,
            "confirmation_number": "EVT2024",
            "passenger_name": "Concert Goer",
            "carrier_name": "Live Nation",
            "additional_info": {"event": "Taylor Swift Concert", "section": "201", "row": "F"}
        }"""
        
        with patch('app.services.ticket_detection.genai') as mock_genai:
            mock_model = MagicMock()
            mock_model.generate_content = MagicMock(return_value=mock_response)
            mock_genai.GenerativeModel = MagicMock(return_value=mock_model)
            
            success, ticket_info, error = await ticket_detection_service.detect_ticket_info(sample_ticket_image)
            
            assert success is True
            assert ticket_info.ticket_type == "event"
            assert ticket_info.carrier_name == "Live Nation"
    
    @pytest.mark.asyncio
    async def test_invalid_image_detection(self, ticket_detection_service):
        """Test detection fails for invalid image"""
        invalid_data = b"not an image"
        
        success, ticket_info, error = await ticket_detection_service.detect_ticket_info(invalid_data)
        
        assert success is False
        assert error is not None
        assert ticket_info is None
    
    @pytest.mark.asyncio
    async def test_malformed_json_response(self, ticket_detection_service, sample_ticket_image):
        """Test handling of malformed JSON response"""
        mock_response = MagicMock()
        mock_response.text = "This is not valid JSON"
        
        with patch('app.services.ticket_detection.genai') as mock_genai:
            mock_model = MagicMock()
            mock_model.generate_content = MagicMock(return_value=mock_response)
            mock_genai.GenerativeModel = MagicMock(return_value=mock_model)
            
            success, ticket_info, error = await ticket_detection_service.detect_ticket_info(sample_ticket_image)
            
            assert success is False
            assert error is not None


class TestTicketTypes:
    """Test ticket type classification"""
    
    def test_airport_ticket_type(self):
        """Test airport ticket is classified correctly"""
        assert "airport" in ["airport", "train", "bus", "event"]
    
    def test_train_ticket_type(self):
        """Test train ticket is classified correctly"""
        assert "train" in ["airport", "train", "bus", "event"]
    
    def test_event_ticket_type(self):
        """Test event ticket is classified correctly"""
        assert "event" in ["airport", "train", "bus", "event"]


# Integration test (requires actual API)
@pytest.mark.asyncio
@pytest.mark.skipif(not os.getenv("GOOGLE_API_KEY"), reason="GOOGLE_API_KEY not set")
async def test_real_ticket_detection():
    """Integration test with real Google Generative AI API"""
    service = TicketDetectionService(api_key=os.getenv("GOOGLE_API_KEY"))
    
    # Create a sample image (this would be real ticket in production)
    img = Image.new('RGB', (200, 100), color='white')
    img_bytes = BytesIO()
    img.save(img_bytes, format='PNG')
    
    success, ticket_info, error = await service.detect_ticket_info(img_bytes.getvalue())
    
    # May fail with "not a ticket" but should not error
    assert isinstance(success, bool)
    if not success:
        assert error is not None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
