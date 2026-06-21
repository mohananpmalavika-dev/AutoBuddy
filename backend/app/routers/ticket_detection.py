"""
Ticket Detection Router
API endpoints for detecting travel/event ticket information from images and auto-creating rides
"""
import logging
import os
from typing import Optional
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, status, Query
from pydantic import BaseModel

from app.db.deps import get_db
from app.utils.rbac import require_roles
from app.utils.api_responses import StandardResponse
from app.services.ticket_detection import (
    get_ticket_detection_service,
    DetectedTicketInfo,
    DetectedLocation
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/tickets", tags=["ticket_detection"])


# Response Models
class TicketDetectionResponse(BaseModel):
    """Response with detected ticket information"""
    ticket_type: str
    departure_location: Optional[str]
    arrival_location: Optional[str]
    departure_datetime: Optional[datetime]
    arrival_datetime: Optional[datetime]
    confirmation_number: Optional[str]
    passenger_name: Optional[str]
    carrier_name: Optional[str]
    additional_info: dict


class TicketToRideRequest(BaseModel):
    """Request to create scheduled ride from detected ticket"""
    detected_ticket: TicketDetectionResponse
    pickup_address: Optional[str] = None  # Override auto-detected pickup
    dropoff_address: Optional[str] = None  # Override auto-detected dropoff
    pickup_latitude: Optional[float] = None
    pickup_longitude: Optional[float] = None
    dropoff_latitude: Optional[float] = None
    dropoff_longitude: Optional[float] = None
    advance_minutes: int = 90  # Schedule ride N minutes before departure
    auto_create_ride: bool = True
    preferred_payment: str = "wallet"
    driver_gender_preference: str = "any"
    notes: Optional[str] = None


class RideCreatedResponse(BaseModel):
    """Response when ride is successfully created"""
    ride_id: str
    scheduled_time: datetime
    pickup_location: str
    dropoff_location: str
    estimated_fare: float
    status: str
    message: str


def _get_api_key() -> Optional[str]:
    """Get Gemini API key from environment"""
    return os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")


def _infer_location_from_name(location_name: str) -> tuple[Optional[float], Optional[float]]:
    """
    Simple location inference from common city/airport names
    In production, use geocoding API
    """
    # Common airport coordinates
    airport_coords = {
        "jfk": (40.6413, -73.7781),
        "lax": (33.9425, -118.4081),
        "lhr": (51.4700, -0.4543),
        "cdg": (49.0097, 2.5479),
        "narita": (35.7653, 140.3931),
        "dxb": (25.2528, 55.3644),
        "ord": (41.9742, -87.9073),
        "atl": (33.6407, -84.4277),
        "hnd": (35.5494, 139.7798),
    }
    
    # Common city coordinates
    city_coords = {
        "new york": (40.7128, -74.0060),
        "los angeles": (34.0522, -118.2437),
        "london": (51.5074, -0.1278),
        "paris": (48.8566, 2.3522),
        "tokyo": (35.6762, 139.6503),
        "dubai": (25.2048, 55.2708),
        "chicago": (41.8781, -87.6298),
        "atlanta": (33.7490, -84.3880),
        "san francisco": (37.7749, -122.4194),
        "singapore": (1.3521, 103.8198),
    }
    
    name_lower = location_name.lower().strip()
    
    # Try exact match
    if name_lower in airport_coords:
        return airport_coords[name_lower]
    if name_lower in city_coords:
        return city_coords[name_lower]
    
    # Try substring match
    for key, coords in {**airport_coords, **city_coords}.items():
        if key in name_lower or name_lower in key:
            return coords
    
    return None, None


@router.post("/detect", response_model=TicketDetectionResponse)
async def detect_ticket(
    file: UploadFile = File(...),
    user=Depends(require_roles("passenger", "driver", "admin"))
):
    """
    Detect ticket information from image using AI
    
    Accepts: JPG, PNG, GIF, WebP images
    Returns: Parsed ticket information (type, locations, dates, etc.)
    """
    try:
        # Validate file type
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be an image (JPG, PNG, GIF, or WebP)"
            )
        
        # Read file
        file_content = await file.read()
        
        if not file_content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File is empty"
            )
        
        # Get API key
        api_key = _get_api_key()
        if not api_key:
            logger.error("GOOGLE_API_KEY not configured")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="AI service is not configured"
            )
        
        # Detect ticket
        service = get_ticket_detection_service(api_key=api_key)
        success, ticket_info, error = await service.detect_ticket_info(file_content)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=error or "Could not detect ticket information"
            )
        
        logger.info(f"Ticket detected for user {user.get('id')}: {ticket_info.ticket_type}")
        
        return StandardResponse.ok(
            data=ticket_info,
            message="Ticket information detected successfully"
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Ticket detection error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process ticket image"
        )


@router.post("/create-ride-from-ticket", response_model=RideCreatedResponse)
async def create_ride_from_ticket(
    request: TicketToRideRequest,
    db=Depends(get_db),
    user=Depends(require_roles("passenger"))
):
    """
    Create a scheduled ride from detected ticket information
    
    Automatically schedules pickup at airport/station/venue before departure time
    """
    try:
        ticket = request.detected_ticket
        
        # Validate ticket has required info
        if not ticket.departure_datetime:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Ticket must have departure date/time"
            )
        
        if not ticket.departure_location or not ticket.arrival_location:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Ticket must have departure and arrival locations"
            )
        
        # Determine pickup and dropoff
        pickup_address = request.pickup_address or ticket.departure_location
        dropoff_address = request.dropoff_address or ticket.arrival_location
        
        # Infer coordinates if not provided
        pickup_lat = request.pickup_latitude
        pickup_lng = request.pickup_longitude
        if not pickup_lat or not pickup_lng:
            pickup_lat, pickup_lng = _infer_location_from_name(pickup_address)
            if not pickup_lat or not pickup_lng:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Could not determine coordinates for {pickup_address}. Please provide pickup_latitude and pickup_longitude."
                )
        
        dropoff_lat = request.dropoff_latitude
        dropoff_lng = request.dropoff_longitude
        if not dropoff_lat or not dropoff_lng:
            dropoff_lat, dropoff_lng = _infer_location_from_name(dropoff_address)
            if not dropoff_lat or not dropoff_lng:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Could not determine coordinates for {dropoff_address}. Please provide dropoff_latitude and dropoff_longitude."
                )
        
        # Schedule pickup before departure
        departure_time = ticket.departure_datetime
        if departure_time.tzinfo is None:
            departure_time = departure_time.replace(tzinfo=timezone.utc)
        
        scheduled_time = departure_time - timedelta(minutes=request.advance_minutes)
        
        # Ensure scheduled time is in the future
        now = datetime.now(timezone.utc)
        if scheduled_time <= now:
            scheduled_time = now + timedelta(minutes=30)
        
        # Create scheduled ride document
        scheduled_ride = {
            "passenger_id": user.get("id"),
            "pickup_location": {
                "address": pickup_address,
                "latitude": float(pickup_lat),
                "longitude": float(pickup_lng)
            },
            "dropoff_location": {
                "address": dropoff_address,
                "latitude": float(dropoff_lat),
                "longitude": float(dropoff_lng)
            },
            "scheduled_time": scheduled_time,
            "trip_type": _get_trip_type(ticket.ticket_type),
            "preferred_payment": request.preferred_payment,
            "driver_gender_preference": request.driver_gender_preference,
            "notes": request.notes or f"Auto-created from {ticket.ticket_type} ticket. Confirmation: {ticket.confirmation_number or 'N/A'}",
            "status": "pending",
            "dispatch_status": "reserved",
            "reminder_due_at": scheduled_time - timedelta(minutes=60),
            "reminder_sent": False,
            "dispatch_due_at": scheduled_time - timedelta(minutes=30),
            "dispatch_started": False,
            "driver_assignment_due_at": scheduled_time - timedelta(minutes=15),
            "driver_assignment_started": False,
            "driver_confirmed": False,
            "payment_hold_status": "not_started",
            "is_recurring": False,
            "created_at": now,
            "updated_at": now,
            "ticket_reference": ticket.confirmation_number,
            "ticket_type": ticket.ticket_type,
        }
        
        # Insert into database
        collection = db["scheduled_rides"]
        result = await collection.insert_one(scheduled_ride)
        
        # Calculate estimated fare
        estimated_fare = _estimate_fare(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)
        
        logger.info(f"Created scheduled ride {result.inserted_id} from {ticket.ticket_type} ticket for user {user.get('id')}")
        
        return StandardResponse.created(
            data={
                "ride_id": str(result.inserted_id),
                "scheduled_time": scheduled_time,
                "pickup_location": pickup_address,
                "dropoff_location": dropoff_address,
                "estimated_fare": estimated_fare,
                "status": "pending",
                "message": f"Ride scheduled for {scheduled_time.strftime('%Y-%m-%d %H:%M')} UTC"
            },
            resource_id=str(result.inserted_id)
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating ride from ticket: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create scheduled ride"
        )


@router.post("/detect-and-create-ride")
async def detect_and_create_ride(
    file: UploadFile = File(...),
    auto_create: bool = Query(True, description="Automatically create ride if detection succeeds"),
    advance_minutes: int = Query(90, description="Minutes before departure to schedule pickup"),
    pickup_address: Optional[str] = Query(None),
    dropoff_address: Optional[str] = Query(None),
    pickup_latitude: Optional[float] = Query(None),
    pickup_longitude: Optional[float] = Query(None),
    dropoff_latitude: Optional[float] = Query(None),
    dropoff_longitude: Optional[float] = Query(None),
    db=Depends(get_db),
    user=Depends(require_roles("passenger"))
):
    """
    One-shot endpoint: Upload ticket image and optionally auto-create ride
    
    Flow:
    1. Detect ticket information from image
    2. If auto_create=true, automatically schedule a ride
    3. Return both detected info and ride details
    """
    try:
        # First, detect the ticket
        if not file.content_type or not file.content_type.startswith("image/"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File must be an image"
            )
        
        file_content = await file.read()
        if not file_content:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="File is empty"
            )
        
        api_key = _get_api_key()
        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="AI service is not configured"
            )
        
        service = get_ticket_detection_service(api_key=api_key)
        success, ticket_info, error = await service.detect_ticket_info(file_content)
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=error or "Could not detect ticket"
            )
        
        result = {
            "detected_ticket": ticket_info,
            "ride_created": None
        }
        
        # Create ride if requested and ticket is valid
        if auto_create and ticket_info.departure_datetime and ticket_info.departure_location:
            try:
                ride_request = TicketToRideRequest(
                    detected_ticket=TicketDetectionResponse(**ticket_info.dict()),
                    pickup_address=pickup_address,
                    dropoff_address=dropoff_address,
                    pickup_latitude=pickup_latitude,
                    pickup_longitude=pickup_longitude,
                    dropoff_latitude=dropoff_latitude,
                    dropoff_longitude=dropoff_longitude,
                    advance_minutes=advance_minutes
                )
                
                # Call create ride logic
                collection = db["scheduled_rides"]
                
                pickup_addr = pickup_address or ticket_info.departure_location
                dropoff_addr = dropoff_address or ticket_info.arrival_location
                
                pickup_lat, pickup_lng = pickup_latitude, pickup_longitude
                if not pickup_lat or not pickup_lng:
                    pickup_lat, pickup_lng = _infer_location_from_name(pickup_addr)
                
                dropoff_lat, dropoff_lng = dropoff_latitude, dropoff_longitude
                if not dropoff_lat or not dropoff_lng:
                    dropoff_lat, dropoff_lng = _infer_location_from_name(dropoff_addr)
                
                if pickup_lat and pickup_lng and dropoff_lat and dropoff_lng:
                    departure_time = ticket_info.departure_datetime
                    if departure_time.tzinfo is None:
                        departure_time = departure_time.replace(tzinfo=timezone.utc)
                    
                    scheduled_time = departure_time - timedelta(minutes=advance_minutes)
                    now = datetime.now(timezone.utc)
                    if scheduled_time <= now:
                        scheduled_time = now + timedelta(minutes=30)
                    
                    scheduled_ride = {
                        "passenger_id": user.get("id"),
                        "pickup_location": {
                            "address": pickup_addr,
                            "latitude": float(pickup_lat),
                            "longitude": float(pickup_lng)
                        },
                        "dropoff_location": {
                            "address": dropoff_addr,
                            "latitude": float(dropoff_lat),
                            "longitude": float(dropoff_lng)
                        },
                        "scheduled_time": scheduled_time,
                        "trip_type": _get_trip_type(ticket_info.ticket_type),
                        "preferred_payment": "wallet",
                        "driver_gender_preference": "any",
                        "notes": f"Auto-created from {ticket_info.ticket_type} ticket. Confirmation: {ticket_info.confirmation_number or 'N/A'}",
                        "status": "pending",
                        "dispatch_status": "reserved",
                        "reminder_due_at": scheduled_time - timedelta(minutes=60),
                        "reminder_sent": False,
                        "dispatch_due_at": scheduled_time - timedelta(minutes=30),
                        "dispatch_started": False,
                        "driver_assignment_due_at": scheduled_time - timedelta(minutes=15),
                        "driver_assignment_started": False,
                        "driver_confirmed": False,
                        "payment_hold_status": "not_started",
                        "is_recurring": False,
                        "created_at": now,
                        "updated_at": now,
                        "ticket_reference": ticket_info.confirmation_number,
                        "ticket_type": ticket_info.ticket_type,
                    }
                    
                    ride_result = await collection.insert_one(scheduled_ride)
                    estimated_fare = _estimate_fare(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)
                    
                    result["ride_created"] = {
                        "ride_id": str(ride_result.inserted_id),
                        "scheduled_time": scheduled_time,
                        "pickup_location": pickup_addr,
                        "dropoff_location": dropoff_addr,
                        "estimated_fare": estimated_fare,
                        "status": "pending"
                    }
                    
                    logger.info(f"Auto-created ride from ticket: {ride_result.inserted_id}")
            except Exception as e:
                logger.warning(f"Could not auto-create ride: {str(e)}")
                result["ride_created_error"] = str(e)
        
        return StandardResponse.ok(data=result)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in detect-and-create-ride: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process request"
        )


def _get_trip_type(ticket_type: str) -> str:
    """Map ticket type to trip type"""
    type_map = {
        "airport": "airport_ride",
        "train": "rental",
        "bus": "ride",
        "event": "ride"
    }
    return type_map.get(ticket_type.lower(), "ride")


def _estimate_fare(pickup_lat: float, pickup_lng: float, dropoff_lat: float, dropoff_lng: float) -> float:
    """Simple fare estimation based on distance"""
    import math
    
    def haversine(lat1, lon1, lat2, lon2):
        r = 6371  # Earth's radius in km
        d_lat = math.radians(lat2 - lat1)
        d_lon = math.radians(lon2 - lon1)
        a = math.sin(d_lat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon/2)**2
        c = 2 * math.asin(math.sqrt(a))
        return r * c
    
    distance = haversine(pickup_lat, pickup_lng, dropoff_lat, dropoff_lng)
    # Base fare 60 + 18 per km + 20 booking fee
    fare = max(60.0, 35.0 + (distance * 18.0) + 20.0)
    return round(fare, 2)
