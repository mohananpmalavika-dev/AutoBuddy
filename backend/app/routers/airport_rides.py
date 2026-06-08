"""
Airport Ride System API Endpoints
Real-time airport ride management and flight integration
"""

from fastapi import APIRouter, Body, HTTPException, Request, Query
from datetime import datetime, timedelta
from app.utils.time_helpers import get_ist_now
import logging
import random
from typing import Literal, Optional
from uuid import uuid4

from pydantic import BaseModel, Field, model_validator

from app.utils.rbac import get_current_user_from_request

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/airport", tags=["airport_system"])


AIRPORT_TERMINALS = {
    "term_TRV": {
        "terminal_id": "term_TRV",
        "airport_code": "TRV",
        "terminal_name": "Thiruvananthapuram International Terminal",
        "terminal_type": "international",
        "city": "Thiruvananthapuram",
        "address": "Airport Road, Chacka, Thiruvananthapuram",
        "latitude": 8.4821,
        "longitude": 76.9201,
        "gates_count": 18,
        "parking_spaces": 420,
        "operating_hours_start": "00:00",
        "operating_hours_end": "23:59",
        "average_passengers_daily": 18500,
    },
    "term_COK": {
        "terminal_id": "term_COK",
        "airport_code": "COK",
        "terminal_name": "Cochin International Terminal 3",
        "terminal_type": "international",
        "city": "Kochi",
        "address": "Airport Road, Nedumbassery, Kochi",
        "latitude": 10.1520,
        "longitude": 76.4019,
        "gates_count": 28,
        "parking_spaces": 650,
        "operating_hours_start": "00:00",
        "operating_hours_end": "23:59",
        "average_passengers_daily": 31000,
    },
    "term_CCJ": {
        "terminal_id": "term_CCJ",
        "airport_code": "CCJ",
        "terminal_name": "Calicut International Terminal",
        "terminal_type": "mixed",
        "city": "Kozhikode",
        "address": "Karipur, Malappuram",
        "latitude": 11.1368,
        "longitude": 75.9553,
        "gates_count": 16,
        "parking_spaces": 360,
        "operating_hours_start": "00:00",
        "operating_hours_end": "23:59",
        "average_passengers_daily": 16000,
    },
    "term_CNN": {
        "terminal_id": "term_CNN",
        "airport_code": "CNN",
        "terminal_name": "Kannur International Terminal",
        "terminal_type": "mixed",
        "city": "Kannur",
        "address": "Mattannur, Kannur",
        "latitude": 11.9186,
        "longitude": 75.5472,
        "gates_count": 12,
        "parking_spaces": 300,
        "operating_hours_start": "00:00",
        "operating_hours_end": "23:59",
        "average_passengers_daily": 9500,
    },
    "term_BLR": {
        "terminal_id": "term_BLR",
        "airport_code": "BLR",
        "terminal_name": "Kempegowda International Terminal",
        "terminal_type": "international",
        "city": "Bangalore",
        "address": "Bengaluru International Airport, Devanahalli",
        "latitude": 13.1986,
        "longitude": 77.7066,
        "gates_count": 52,
        "parking_spaces": 750,
        "operating_hours_start": "00:00",
        "operating_hours_end": "23:59",
        "average_passengers_daily": 45000,
    },
    "term_DEL": {
        "terminal_id": "term_DEL",
        "airport_code": "DEL",
        "terminal_name": "IGI Terminal 3",
        "terminal_type": "international",
        "city": "Delhi",
        "address": "Indira Gandhi International Airport, New Delhi",
        "latitude": 28.5562,
        "longitude": 77.1000,
        "gates_count": 78,
        "parking_spaces": 1200,
        "operating_hours_start": "00:00",
        "operating_hours_end": "23:59",
        "average_passengers_daily": 72000,
    },
    "term_BOM": {
        "terminal_id": "term_BOM",
        "airport_code": "BOM",
        "terminal_name": "Chhatrapati Shivaji Maharaj Terminal 2",
        "terminal_type": "international",
        "city": "Mumbai",
        "address": "Sahar Road, Mumbai",
        "latitude": 19.0896,
        "longitude": 72.8656,
        "gates_count": 60,
        "parking_spaces": 980,
        "operating_hours_start": "00:00",
        "operating_hours_end": "23:59",
        "average_passengers_daily": 62000,
    },
    "term_HYD": {
        "terminal_id": "term_HYD",
        "airport_code": "HYD",
        "terminal_name": "Rajiv Gandhi International Terminal",
        "terminal_type": "international",
        "city": "Hyderabad",
        "address": "Shamshabad, Hyderabad",
        "latitude": 17.2403,
        "longitude": 78.4294,
        "gates_count": 38,
        "parking_spaces": 800,
        "operating_hours_start": "00:00",
        "operating_hours_end": "23:59",
        "average_passengers_daily": 38000,
    },
}

AIRPORT_RIDES = {}
AIRPORT_DRIVERS = {
    "DRV_TRV_TAXI_01": {
        "driver_id": "DRV_TRV_TAXI_01",
        "name": "Airport Driver 1",
        "vehicle_type": "taxi",
        "airport_permit": True,
        "rating": 4.8,
        "available": True,
        "terminal_id": "term_TRV",
        "vehicle_details": "Taxi - KL01AB1122",
        "eta_minutes": 8,
        "waiting_zone": "Terminal 1 pickup bay",
    },
    "DRV_COK_XL_01": {
        "driver_id": "DRV_COK_XL_01",
        "name": "Airport Driver 2",
        "vehicle_type": "xl",
        "airport_permit": True,
        "rating": 4.7,
        "available": True,
        "terminal_id": "term_COK",
        "vehicle_details": "XL - KL07CD3344",
        "eta_minutes": 11,
        "waiting_zone": "Terminal 3 arrival gate",
    },
    "DRV_CCJ_AUTO_01": {
        "driver_id": "DRV_CCJ_AUTO_01",
        "name": "Airport Driver 3",
        "vehicle_type": "auto",
        "airport_permit": True,
        "rating": 4.6,
        "available": True,
        "terminal_id": "term_CCJ",
        "vehicle_details": "Auto - KL10EF7788",
        "eta_minutes": 6,
        "waiting_zone": "Domestic pickup stand",
    },
}

FLIGHTS = {
    "AI967": {
        "flight_id": "flight_TRV_AI967",
        "flight_number": "AI967",
        "airline": "Air India",
        "departure_city": "Thiruvananthapuram",
        "arrival_city": "Dubai",
        "departure_time_offset_hours": 7,
        "arrival_time_offset_hours": 11,
        "flight_status": "scheduled",
        "gate_number": "I4",
        "terminal_id": "term_TRV",
        "expected_passengers": 186,
    },
    "6E662": {
        "flight_id": "flight_COK_6E662",
        "flight_number": "6E662",
        "airline": "IndiGo",
        "departure_city": "Kochi",
        "arrival_city": "Bangalore",
        "departure_time_offset_hours": 4,
        "arrival_time_offset_hours": 5.5,
        "flight_status": "boarding",
        "gate_number": "D8",
        "terminal_id": "term_COK",
        "expected_passengers": 174,
    },
    "IX394": {
        "flight_id": "flight_CCJ_IX394",
        "flight_number": "IX394",
        "airline": "Air India Express",
        "departure_city": "Doha",
        "arrival_city": "Kozhikode",
        "departure_time_offset_hours": -2,
        "arrival_time_offset_hours": 1.25,
        "flight_status": "delayed",
        "gate_number": "A2",
        "terminal_id": "term_CCJ",
        "expected_passengers": 162,
    },
}


class AirportRideCreateRequest(BaseModel):
    passenger_id: Optional[str] = None
    passenger_name: str = Field(..., min_length=1, max_length=100)
    phone_number: str = Field(..., min_length=5, max_length=24)
    flight_number: str = Field(..., min_length=2, max_length=16)
    ride_phase: Literal["pre_flight", "post_flight"] = "pre_flight"
    pickup_location: str = Field(..., min_length=1, max_length=200)
    dropoff_location: str = Field(..., min_length=1, max_length=200)
    terminal_id: str = Field(..., min_length=1, max_length=40)
    passengers_count: int = Field(..., ge=1, le=8)
    luggage_count: int = Field(..., ge=0, le=10)
    vehicle_type: Literal["auto", "taxi", "xl", "traveller"] = "taxi"
    flight_type: Literal["domestic", "international"] = "domestic"
    scheduled_pickup_time: Optional[datetime] = None
    notes: Optional[str] = Field(default=None, max_length=500)

    @model_validator(mode="before")
    @classmethod
    def normalize_legacy_fields(cls, data):
        if not isinstance(data, dict):
            return data

        normalized = dict(data)
        if not normalized.get("vehicle_type") and normalized.get("ride_type"):
            ride_type = str(normalized.get("ride_type") or "").strip().lower()
            normalized["vehicle_type"] = {
                "economy": "taxi",
                "standard": "taxi",
                "premium": "taxi",
                "suv": "xl",
            }.get(ride_type, ride_type)
        if normalized.get("special_requests") and not normalized.get("notes"):
            normalized["notes"] = normalized.get("special_requests")
        if normalized.get("scheduled_pickup_time") == "":
            normalized["scheduled_pickup_time"] = None
        return normalized


class AirportRideAcceptRequest(BaseModel):
    driver_id: str = Field(..., min_length=1, max_length=80)


class AirportFlightDelayUpdate(BaseModel):
    delay_minutes: int = Field(..., ge=-240, le=1440)


def _serialize_terminal(terminal: dict) -> dict:
    return {
        **terminal,
        "facilities": {
            "wifi": True,
            "food_court": True,
            "lounges": 5 if terminal["terminal_type"] == "international" else 2,
            "atm_count": 12,
            "charging_stations": 50,
        },
    }


def _flight_datetime(offset_hours: float) -> datetime:
    return get_ist_now() + timedelta(hours=float(offset_hours))


def _serialize_flight(flight: dict) -> dict:
    departure_time = _flight_datetime(flight.get("departure_time_offset_hours", 3))
    arrival_offset = flight.get("arrival_time_offset_hours")
    return {
        **flight,
        "departure_time": departure_time.isoformat(),
        "arrival_time": _flight_datetime(arrival_offset).isoformat() if arrival_offset is not None else None,
        "seat_occupancy_percent": random.randint(65, 98),
    }


def _lookup_flight(flight_number: str) -> Optional[dict]:
    normalized = str(flight_number or "").strip().upper().replace(" ", "")
    if not normalized:
        return None
    flight = FLIGHTS.get(normalized)
    return _serialize_flight(flight) if flight else None


def calculate_airport_fare(payload: AirportRideCreateRequest) -> dict:
    base_by_vehicle = {
        "auto": 120,
        "taxi": 250,
        "xl": 430,
        "traveller": 650,
    }
    base_fare = base_by_vehicle[payload.vehicle_type]
    luggage_fee = payload.luggage_count * 20
    extra_passenger_fee = max(0, payload.passengers_count - 4) * 25
    airport_fee = 80
    service_fee = 30
    international_fee = 50 if payload.flight_type == "international" else 0
    total = base_fare + luggage_fee + extra_passenger_fee + airport_fee + service_fee + international_fee
    return {
        "base_fare": float(base_fare),
        "luggage_fee": float(luggage_fee),
        "extra_passenger_fee": float(extra_passenger_fee),
        "airport_fee": float(airport_fee),
        "service_fee": float(service_fee),
        "international_fee": float(international_fee),
        "total": float(total),
    }


def calculate_pickup_time(payload: AirportRideCreateRequest) -> tuple[datetime, Optional[float], Optional[dict]]:
    if payload.scheduled_pickup_time:
        return payload.scheduled_pickup_time, None, _lookup_flight(payload.flight_number)

    now = get_ist_now()
    flight = _lookup_flight(payload.flight_number)
    if payload.ride_phase == "post_flight":
        if flight and flight.get("arrival_time"):
            arrival_time = datetime.fromisoformat(flight["arrival_time"])
            return arrival_time + timedelta(minutes=30), None, flight
        return now + timedelta(minutes=30), None, flight

    buffer_hours = 4 if payload.flight_type == "international" else 2.5
    if flight and flight.get("departure_time"):
        departure_time = datetime.fromisoformat(flight["departure_time"])
        return departure_time - timedelta(hours=buffer_hours), buffer_hours, flight

    return now + timedelta(minutes=60), buffer_hours, flight


def find_airport_driver(terminal_id: str, vehicle_type: str) -> Optional[dict]:
    for driver in AIRPORT_DRIVERS.values():
        if (
            driver["available"]
            and driver["airport_permit"]
            and driver["terminal_id"] == terminal_id
            and driver["vehicle_type"] == vehicle_type
            and driver["rating"] >= 4.5
        ):
            return driver

    return None


def _mock_airport_ride(ride_id: str = "aride_001", terminal_id: str = "term_BLR") -> dict:
    return {
        "ride_id": ride_id,
        "passenger_name": "John Doe",
        "phone_number": "+919876543210",
        "flight_number": "AI123",
        "ride_phase": "pre_flight",
        "pickup_location": "Home Address",
        "dropoff_location": "BLR Terminal 1",
        "terminal_id": terminal_id,
        "estimated_fare": 450.00,
        "actual_fare": None,
        "ride_type": "airport",
        "vehicle_type": "taxi",
        "flight_type": "domestic",
        "driver_name": None,
        "driver_rating": None,
        "ride_status": "requested",
        "luggage_count": 2,
        "passengers_count": 2,
        "scheduled_pickup_time": (get_ist_now() + timedelta(minutes=60)).isoformat(),
        "created_at": (get_ist_now() - timedelta(minutes=5)).isoformat(),
    }


# ============================================================================
# TERMINAL MANAGEMENT ENDPOINTS
# ============================================================================

@router.get("/terminals")
async def list_airports(city: str = None, request: Request = None):
    """
    List all airport terminals, optionally filtered by city.
    
    Query Params:
    - city: Filter by city (optional)
    """
    try:
        await get_current_user_from_request(request)
        airports = []

        for terminal in AIRPORT_TERMINALS.values():
            if city and terminal["city"].lower() != city.lower():
                continue
            airports.append({
                "terminal_id": terminal["terminal_id"],
                "airport_code": terminal["airport_code"],
                "terminal_name": terminal["terminal_name"],
                "terminal_type": terminal["terminal_type"],
                "city": terminal["city"],
                "latitude": terminal["latitude"],
                "longitude": terminal["longitude"],
                "gates_count": terminal["gates_count"],
                "parking_spaces": terminal["parking_spaces"],
                "operating_hours_start": terminal["operating_hours_start"],
                "operating_hours_end": terminal["operating_hours_end"],
                "average_passengers_daily": terminal["average_passengers_daily"],
            })

        return {
            "status": "success",
            "data": airports,
            "updated_at": get_ist_now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing airports: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/terminals/{terminal_id}")
async def get_terminal_details(terminal_id: str, request: Request):
    """Get detailed information for a terminal."""
    try:
        await get_current_user_from_request(request)
        terminal = AIRPORT_TERMINALS.get(terminal_id) or AIRPORT_TERMINALS["term_BLR"]

        return {
            "status": "success",
            "data": _serialize_terminal(terminal),
            "updated_at": get_ist_now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting terminal: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# FLIGHT DATA ENDPOINTS
# ============================================================================

@router.get("/terminals/{terminal_id}/flights")
async def list_flights(terminal_id: str, status: str = None, request: Request = None):
    """
    List flights for a terminal with optional status filter.
    Status: scheduled, delayed, boarding, departed, landed, cancelled
    """
    try:
        await get_current_user_from_request(request)
        flights = [
            _serialize_flight(flight)
            for flight in FLIGHTS.values()
            if flight["terminal_id"] == terminal_id
        ]
        if status:
            flights = [flight for flight in flights if flight["flight_status"] == status]

        statuses = ["scheduled", "boarding", "departed", "delayed", "landed"]
        airlines = ["AI", "6E", "UK", "SG", "BA", "AF"]

        for i in range(max(0, 8 - len(flights))):
            flight_status = status if status else random.choice(statuses)
            departure_time = get_ist_now() + timedelta(hours=random.randint(-2, 8))

            flights.append({
                "flight_id": f"flight_{terminal_id}_{i}",
                "flight_number": f"{random.choice(airlines)}{random.randint(100, 999)}",
                "airline": "Airline Name",
                "departure_city": random.choice(["Mumbai", "Delhi", "Kolkata", "Pune"]),
                "arrival_city": random.choice(["Bangalore", "Hyderabad", "Chennai"]),
                "departure_time": departure_time.isoformat(),
                "flight_status": flight_status,
                "gate_number": f"{chr(65 + random.randint(0, 5))}{random.randint(1, 20)}",
                "terminal_id": terminal_id,
                "expected_passengers": random.randint(100, 280),
                "seat_occupancy_percent": random.randint(60, 100)
            })

        return {
            "status": "success",
            "data": flights,
            "updated_at": get_ist_now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing flights: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/flights/{flight_id}")
async def get_flight_details(flight_id: str, request: Request):
    """Get detailed flight information."""
    try:
        await get_current_user_from_request(request)
        flight = None
        normalized_id = str(flight_id or "").strip().upper()
        for candidate in FLIGHTS.values():
            if normalized_id in {candidate["flight_id"].upper(), candidate["flight_number"].upper()}:
                flight = _serialize_flight(candidate)
                break

        if not flight:
            flight = {
                "flight_id": flight_id,
                "flight_number": f"AI{random.randint(100, 999)}",
                "airline": "Air India",
                "departure_city": "Mumbai",
                "arrival_city": "Bangalore",
                "departure_time": (get_ist_now() + timedelta(hours=3)).isoformat(),
                "arrival_time": (get_ist_now() + timedelta(hours=5)).isoformat(),
                "flight_status": random.choice(["scheduled", "boarding", "departed"]),
                "gate_number": "B12",
                "terminal_id": "term_BLR",
                "expected_passengers": 245,
                "actual_passengers": 238,
                "seat_occupancy_percent": 97
            }

        return {
            "status": "success",
            "data": flight,
            "updated_at": get_ist_now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting flight: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# AIRPORT RIDE REQUEST ENDPOINTS
# ============================================================================

@router.post("/rides/request")
async def request_airport_ride(payload: AirportRideCreateRequest, request: Request):
    """
    Request a ride to/from airport with flight integration.
    
    Payload: {
        "passenger_name": "...",
        "flight_number": "AI123",
        "ride_phase": "pre_flight" | "post_flight",
        "pickup_location": "...",
        "dropoff_location": "...",
        "terminal_id": "...",
        "passengers_count": 1-8,
        "luggage_count": 0-10,
        "vehicle_type": "auto" | "taxi" | "xl" | "traveller",
        "flight_type": "domestic" | "international"
    }
    """
    try:
        current_user = await get_current_user_from_request(request)
        passenger_id = payload.passenger_id or str(current_user.get("id") or current_user.get("user_id") or "")
        pickup_time, buffer_hours, flight = calculate_pickup_time(payload)
        fare = calculate_airport_fare(payload)
        terminal = AIRPORT_TERMINALS.get(payload.terminal_id, {})
        ride_id = f"aride_{uuid4().hex[:12]}"
        driver = find_airport_driver(payload.terminal_id, payload.vehicle_type)

        ride = {
            "ride_id": ride_id,
            "passenger_id": passenger_id or None,
            "passenger_name": payload.passenger_name,
            "phone_number": payload.phone_number,
            "flight_number": payload.flight_number.upper().replace(" ", ""),
            "flight": flight,
            "ride_phase": payload.ride_phase,
            "terminal_id": payload.terminal_id,
            "airport_code": terminal.get("airport_code"),
            "terminal_name": terminal.get("terminal_name"),
            "terminal_city": terminal.get("city"),
            "pickup_location": payload.pickup_location,
            "dropoff_location": payload.dropoff_location,
            "passengers_count": payload.passengers_count,
            "luggage_count": payload.luggage_count,
            "vehicle_type": payload.vehicle_type,
            "ride_type": "airport",
            "flight_type": payload.flight_type,
            "scheduled_pickup_time": pickup_time.isoformat(),
            "pickup_buffer_hours": buffer_hours,
            "estimated_fare": fare["total"],
            "fare_breakdown": fare,
            "driver_id": None,
            "driver": None,
            "driver_name": None,
            "vehicle_details": None,
            "eta_minutes": None,
            "airport_waiting_zone": None,
            "ride_status": "requested",
            "status_flow": [
                "requested",
                "driver_assigned",
                "accepted",
                "driver_on_way",
                "arrived_at_pickup",
                "pickup_completed",
                "airport_drop_in_progress",
                "completed",
                "cancelled",
                "rescheduled_due_to_flight_delay",
            ],
            "notes": payload.notes,
            "created_at": get_ist_now().isoformat(),
            "updated_at": get_ist_now().isoformat(),
        }

        if driver:
            driver["available"] = False
            ride.update({
                "driver_id": driver["driver_id"],
                "driver": dict(driver),
                "driver_name": driver["name"],
                "vehicle_details": driver["vehicle_details"],
                "eta_minutes": driver["eta_minutes"],
                "airport_waiting_zone": driver["waiting_zone"],
                "ride_status": "driver_assigned",
            })

        AIRPORT_RIDES[ride_id] = ride

        return {
            "status": "success",
            "data": ride,
            "updated_at": get_ist_now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error requesting ride: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/terminals/{terminal_id}/rides")
async def list_airport_rides(terminal_id: str, ride_phase: str = None, request: Request = None):
    """List rides at terminal with optional phase filter (pre_flight/post_flight)."""
    try:
        await get_current_user_from_request(request)
        rides = [
            ride
            for ride in AIRPORT_RIDES.values()
            if ride.get("terminal_id") == terminal_id and (not ride_phase or ride.get("ride_phase") == ride_phase)
        ]

        phases = ["pre_flight", "post_flight"]
        statuses = ["requested", "accepted", "in_progress", "completed"]

        for i in range(max(0, 5 - len(rides))):
            phase = ride_phase if ride_phase else random.choice(phases)
            rides.append({
                "ride_id": f"aride_{i}",
                "passenger_name": f"Passenger {i}",
                "flight_number": f"AI{random.randint(100, 999)}",
                "ride_phase": phase,
                "pickup_location": "Home" if phase == "pre_flight" else "Terminal Exit",
                "dropoff_location": "Terminal" if phase == "pre_flight" else "Home",
                "estimated_fare": round(random.uniform(250, 800), 2),
                "ride_status": random.choice(statuses),
                "vehicle_type": random.choice(["auto", "taxi", "xl"]),
                "flight_type": random.choice(["domestic", "international"]),
                "luggage_count": random.randint(0, 4),
                "passengers_count": random.randint(1, 4),
                "scheduled_pickup_time": (get_ist_now() + timedelta(minutes=random.randint(20, 180))).isoformat(),
                "created_at": (get_ist_now() - timedelta(minutes=random.randint(0, 120))).isoformat()
            })

        return {
            "status": "success",
            "data": rides,
            "updated_at": get_ist_now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing rides: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rides/{ride_id}")
async def get_ride_details(ride_id: str, request: Request):
    """Get detailed ride information."""
    try:
        await get_current_user_from_request(request)
        ride = AIRPORT_RIDES.get(ride_id) or _mock_airport_ride(ride_id)

        return {
            "status": "success",
            "data": ride,
            "updated_at": get_ist_now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting ride: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rides/{ride_id}/accept")
async def accept_ride(ride_id: str, payload: AirportRideAcceptRequest, request: Request):
    """Accept/assign ride to a driver."""
    try:
        await get_current_user_from_request(request)
        ride = AIRPORT_RIDES.get(ride_id) or _mock_airport_ride(ride_id)
        driver = AIRPORT_DRIVERS.get(payload.driver_id)

        if driver and not driver.get("airport_permit"):
            raise HTTPException(status_code=403, detail="Driver not eligible for airport ride")

        if not driver:
            driver = {
                "driver_id": payload.driver_id,
                "name": "Driver Name",
                "vehicle_type": ride.get("vehicle_type", "taxi"),
                "airport_permit": True,
                "rating": 4.6,
                "available": False,
                "terminal_id": ride.get("terminal_id"),
                "vehicle_details": "SUV - KA01XX0001",
                "eta_minutes": random.randint(5, 20),
                "waiting_zone": "Airport pickup bay",
            }

        driver["available"] = False
        ride.update({
            "driver_id": driver["driver_id"],
            "driver": dict(driver),
            "driver_name": driver["name"],
            "driver_rating": driver.get("rating"),
            "vehicle_details": driver.get("vehicle_details"),
            "eta_minutes": driver.get("eta_minutes", random.randint(5, 20)),
            "airport_waiting_zone": driver.get("waiting_zone"),
            "ride_status": "accepted",
            "updated_at": get_ist_now().isoformat(),
        })
        AIRPORT_RIDES[ride_id] = ride

        return {
            "status": "success",
            "data": ride,
            "updated_at": get_ist_now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error accepting ride: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rides/{ride_id}/flight-delay")
async def update_flight_delay(
    ride_id: str,
    request: Request,
    payload: Optional[AirportFlightDelayUpdate] = Body(default=None),
    delay_minutes: Optional[int] = Query(default=None),
):
    """Reschedule an airport pickup when flight timing changes."""
    try:
        await get_current_user_from_request(request)
        ride = AIRPORT_RIDES.get(ride_id)
        if not ride:
            raise HTTPException(status_code=404, detail="Airport ride not found")

        effective_delay = delay_minutes if delay_minutes is not None else payload.delay_minutes if payload else None
        if effective_delay is None:
            raise HTTPException(status_code=422, detail="delay_minutes is required")
        if effective_delay < -240 or effective_delay > 1440:
            raise HTTPException(status_code=422, detail="delay_minutes must be between -240 and 1440")

        old_time = datetime.fromisoformat(ride["scheduled_pickup_time"])
        new_time = old_time + timedelta(minutes=effective_delay)
        ride.update({
            "previous_scheduled_pickup_time": old_time.isoformat(),
            "scheduled_pickup_time": new_time.isoformat(),
            "flight_delay_minutes": effective_delay,
            "ride_status": "rescheduled_due_to_flight_delay",
            "updated_at": get_ist_now().isoformat(),
        })

        return {
            "status": "success",
            "data": ride,
            "updated_at": get_ist_now().isoformat(),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating flight delay: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# PARKING MANAGEMENT ENDPOINTS
# ============================================================================

@router.get("/terminals/{terminal_id}/parking/availability")
async def get_parking_availability(terminal_id: str, request: Request):
    """Get real-time parking availability."""
    try:
        await get_current_user_from_request(request)
        availability = {
            "terminal_id": terminal_id,
            "total_spaces": 750,
            "available_spaces": random.randint(50, 300),
            "occupied_spaces": random.randint(300, 600),
            "reserved_spaces": random.randint(20, 80),
            "maintenance_spaces": random.randint(0, 30),
            "occupancy_rate": round(random.uniform(40, 95), 1),
            "by_level": [
                {"level": i, "available": random.randint(10, 40), "occupied": random.randint(30, 60)}
                for i in range(3)
            ],
            "last_updated": get_ist_now().isoformat()
        }
        
        return {
            "status": "success",
            "data": availability,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting parking: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/terminals/{terminal_id}/parking/reserve")
async def reserve_parking_spot(terminal_id: str, payload: dict, request: Request):
    """Reserve a parking spot for a ride."""
    try:
        await get_current_user_from_request(request)
        spot = {
            "spot_id": f"spot_{random.randint(1000, 9999)}",
            "spot_number": f"A-{random.randint(1, 9)}-{random.randint(10, 99)}",
            "level": random.randint(0, 3),
            "space_type": "regular",
            "status": "reserved",
            "reserved_by_ride": payload.get("ride_id"),
            "hourly_rate": 50.0,
            "daily_rate": 400.0,
            "reserved_until": (get_ist_now() + timedelta(hours=24)).isoformat()
        }
        
        return {
            "status": "success",
            "data": spot,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error reserving parking: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# DEMAND & QUEUE MANAGEMENT ENDPOINTS
# ============================================================================

@router.get("/terminals/{terminal_id}/demand")
async def get_terminal_demand(terminal_id: str, ride_phase: str = None, request: Request = None):
    """Get real-time demand metrics."""
    try:
        await get_current_user_from_request(request)
        phases = ["pre_flight", "post_flight", "shuttle"]
        
        demand_data = []
        for phase in phases:
            if ride_phase and phase != ride_phase:
                continue
            
            waiting = random.randint(5, 60)
            available = random.randint(1, 30)
            demand_score = min(100, (waiting / (available + 1)) * 20 + random.randint(20, 70))
            
            demand_data.append({
                "metric_id": f"metric_{phase}",
                "terminal_id": terminal_id,
                "ride_phase": phase,
                "waiting_requests": waiting,
                "available_drivers": available,
                "in_progress_rides": random.randint(5, 30),
                "average_wait_time_minutes": round(random.uniform(5, 25), 1),
                "demand_score": round(demand_score, 1),
                "surge_multiplier": round(1.0 + (demand_score / 100) * 2, 2),
                "peak_hour": demand_score > 70,
                "estimated_wait_minutes": random.randint(5, 30)
            })
        
        return {
            "status": "success",
            "data": demand_data,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting demand: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/terminals/{terminal_id}/queue")
async def get_queue_status(terminal_id: str, ride_phase: str = None, request: Request = None):
    """Get queue status and position."""
    try:
        await get_current_user_from_request(request)
        queue = {
            "queue_id": f"queue_{terminal_id}",
            "terminal_id": terminal_id,
            "ride_phase": ride_phase or "pre_flight",
            "priority_level": random.randint(1, 3),
            "queue_length": random.randint(5, 60),
            "your_position": random.randint(1, 30),
            "estimated_wait_time_minutes": random.randint(5, 30),
            "average_service_time_minutes": round(random.uniform(8, 15), 1),
            "last_updated": get_ist_now().isoformat()
        }
        
        return {
            "status": "success",
            "data": queue,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting queue: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ALERTS & NOTIFICATIONS ENDPOINTS
# ============================================================================

@router.get("/terminals/{terminal_id}/alerts")
async def get_terminal_alerts(terminal_id: str, severity: str = None, request: Request = None):
    """Get active alerts for terminal."""
    try:
        await get_current_user_from_request(request)
        alerts = []
        alert_types = [
            ("high_demand", "high", "High demand detected"),
            ("parking_full", "critical", "Parking area at capacity"),
            ("flight_delay", "medium", "Flight delayed"),
            ("service_issue", "high", "Service temporarily unavailable")
        ]
        
        for alert_type, sev, message in alert_types:
            if severity and sev != severity:
                continue
            
            alerts.append({
                "alert_id": f"alert_{random.randint(100, 999)}",
                "terminal_id": terminal_id,
                "alert_type": alert_type,
                "severity": sev,
                "message": message,
                "created_at": (get_ist_now() - timedelta(minutes=random.randint(0, 60))).isoformat(),
                "resolved": random.choice([False, False, False, True])
            })
        
        return {
            "status": "success",
            "data": alerts,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting alerts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# SERVICE METRICS ENDPOINTS
# ============================================================================

@router.get("/terminals/{terminal_id}/metrics/daily")
async def get_daily_metrics(terminal_id: str, request: Request):
    """Get daily service performance metrics."""
    try:
        await get_current_user_from_request(request)
        metrics = {
            "metric_period": "daily",
            "terminal_id": terminal_id,
            "total_rides": random.randint(300, 800),
            "completed_rides": random.randint(280, 750),
            "cancelled_rides": random.randint(5, 30),
            "average_rating": round(random.uniform(4.2, 4.9), 2),
            "on_time_completion_rate": round(random.uniform(85, 98), 1),
            "total_revenue": round(random.uniform(50000, 150000), 2),
            "peak_demand_time": f"{random.randint(6, 20)}:00",
            "peak_demand_score": round(random.uniform(60, 100), 1),
            "driver_efficiency": round(random.uniform(75, 95), 1),
            "timestamp": get_ist_now().isoformat()
        }
        
        return {
            "status": "success",
            "data": metrics,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/terminals/{terminal_id}/metrics/hourly")
async def get_hourly_metrics(terminal_id: str, hours_back: int = 24, request: Request = None):
    """Get hourly service metrics for the last N hours."""
    try:
        await get_current_user_from_request(request)
        metrics = []
        for hour in range(hours_back):
            time_ago = get_ist_now() - timedelta(hours=hour)
            metrics.append({
                "hour": time_ago.strftime("%H:00"),
                "total_rides": random.randint(10, 50),
                "completed_rides": random.randint(8, 48),
                "average_rating": round(random.uniform(4.0, 5.0), 2),
                "demand_score": round(random.uniform(30, 95), 1),
                "surge_multiplier": round(random.uniform(1.0, 2.5), 2)
            })
        
        return {
            "status": "success",
            "data": metrics,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting hourly metrics: {e}")
        raise HTTPException(status_code=500, detail=str(e))
