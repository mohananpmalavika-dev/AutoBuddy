"""
Ticket Detection Service
Detects travel/event information from ticket images using Google Generative AI
"""
import base64
import json
import logging
from typing import Optional, Dict, Any, Tuple
from datetime import datetime
from io import BytesIO
from PIL import Image
try:
    from google import genai
except ImportError:
    import google.generativeai as genai
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class DetectedLocation(BaseModel):
    """Detected location from ticket"""
    address: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class DetectedTicketInfo(BaseModel):
    """Structured ticket information extracted from image"""
    ticket_type: str = Field(..., description="Type: airport, train, bus, event")
    departure_location: Optional[str] = None
    arrival_location: Optional[str] = None
    departure_datetime: Optional[datetime] = None
    arrival_datetime: Optional[datetime] = None
    confirmation_number: Optional[str] = None
    passenger_name: Optional[str] = None
    carrier_name: Optional[str] = None
    additional_info: Dict[str, Any] = Field(default_factory=dict)


class TicketDetectionService:
    """Service for detecting ticket information from images"""
    
    def __init__(self, api_key: Optional[str] = None):
        """Initialize with Google Generative AI API key"""
        if api_key:
            genai.configure(api_key=api_key)
    
    @staticmethod
    def _image_to_base64(image_data: bytes) -> str:
        """Convert image bytes to base64 string"""
        return base64.standard_b64encode(image_data).decode("utf-8")
    
    @staticmethod
    def _validate_image(image_data: bytes, max_size_mb: int = 20) -> Tuple[bool, Optional[str]]:
        """Validate image data"""
        # Check size
        size_mb = len(image_data) / (1024 * 1024)
        if size_mb > max_size_mb:
            return False, f"Image size {size_mb:.1f}MB exceeds {max_size_mb}MB limit"
        
        # Check if valid image
        try:
            Image.open(BytesIO(image_data))
            return True, None
        except Exception as e:
            return False, f"Invalid image format: {str(e)}"
    
    async def detect_ticket_info(self, image_data: bytes) -> Tuple[bool, Optional[DetectedTicketInfo], Optional[str]]:
        """
        Detect ticket information from image using Gemini vision
        
        Returns: (success, ticket_info, error_message)
        """
        try:
            # Validate image
            valid, error = self._validate_image(image_data)
            if not valid:
                return False, None, error
            
            # Convert to base64
            image_b64 = self._image_to_base64(image_data)
            
            # Prepare the prompt
            detection_prompt = """Analyze this ticket/booking image and extract the following information:

1. **Ticket Type**: Identify if this is an airport/flight ticket, train ticket, bus ticket, or event ticket
2. **Departure Location**: Where the journey starts (city/airport name)
3. **Arrival Location**: Where the journey ends (city/airport name)
4. **Departure Date/Time**: When the journey starts (ISO 8601 format: YYYY-MM-DDTHH:MM:SS)
5. **Arrival Date/Time**: When the journey is expected to arrive (ISO 8601 format)
6. **Confirmation Number**: Booking/Ticket reference number
7. **Passenger Name**: Name on the ticket
8. **Carrier Name**: Airline/Train/Bus/Event operator name
9. **Additional Info**: Any other relevant details (seat number, vehicle type, event venue, etc.)

Return the information as valid JSON with these exact keys:
{
  "ticket_type": "airport|train|bus|event",
  "departure_location": "city/location",
  "arrival_location": "city/location",
  "departure_datetime": "YYYY-MM-DDTHH:MM:SS or null",
  "arrival_datetime": "YYYY-MM-DDTHH:MM:SS or null",
  "confirmation_number": "reference number or null",
  "passenger_name": "name or null",
  "carrier_name": "operator name or null",
  "additional_info": { "key": "value" }
}

If you cannot identify certain fields, use null. Only return valid JSON, no additional text."""
            
            # Call Gemini API
            model = genai.GenerativeModel("gemini-2.0-flash")
            response = model.generate_content([
                {
                    "role": "user",
                    "parts": [
                        {
                            "inline_data": {
                                "mime_type": "image/jpeg",
                                "data": image_b64
                            }
                        },
                        detection_prompt
                    ]
                }
            ])
            
            if not response.text:
                return False, None, "No response from AI model"
            
            # Parse JSON response
            try:
                response_text = response.text.strip()
                # Handle markdown code blocks
                if response_text.startswith("```"):
                    response_text = response_text.split("```")[1]
                    if response_text.startswith("json"):
                        response_text = response_text[4:]
                    response_text = response_text.strip()
                
                ticket_dict = json.loads(response_text)
                
                # Parse datetime strings
                departure_dt = None
                arrival_dt = None
                
                if ticket_dict.get("departure_datetime"):
                    try:
                        departure_dt = datetime.fromisoformat(ticket_dict["departure_datetime"].replace("Z", "+00:00"))
                    except (ValueError, AttributeError):
                        pass
                
                if ticket_dict.get("arrival_datetime"):
                    try:
                        arrival_dt = datetime.fromisoformat(ticket_dict["arrival_datetime"].replace("Z", "+00:00"))
                    except (ValueError, AttributeError):
                        pass
                
                ticket_info = DetectedTicketInfo(
                    ticket_type=ticket_dict.get("ticket_type", "").lower() or "unknown",
                    departure_location=ticket_dict.get("departure_location"),
                    arrival_location=ticket_dict.get("arrival_location"),
                    departure_datetime=departure_dt,
                    arrival_datetime=arrival_dt,
                    confirmation_number=ticket_dict.get("confirmation_number"),
                    passenger_name=ticket_dict.get("passenger_name"),
                    carrier_name=ticket_dict.get("carrier_name"),
                    additional_info=ticket_dict.get("additional_info", {})
                )
                
                logger.info(f"Successfully detected ticket: {ticket_info.ticket_type}")
                return True, ticket_info, None
                
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse AI response as JSON: {response.text[:200]}")
                return False, None, f"Failed to parse ticket information: {str(e)}"
        
        except Exception as e:
            logger.error(f"Ticket detection error: {str(e)}")
            return False, None, f"Ticket detection failed: {str(e)}"


# Singleton instance
_ticket_service: Optional[TicketDetectionService] = None


def get_ticket_detection_service(api_key: Optional[str] = None) -> TicketDetectionService:
    """Get or create ticket detection service"""
    global _ticket_service
    if _ticket_service is None:
        _ticket_service = TicketDetectionService(api_key=api_key)
    return _ticket_service
