"""
Places Router - Geocoding and Location Services

Handles:
- Reverse geocoding (lat/lon → address) - Uses Nominatim/OpenStreetMap
- Place autocomplete search - Uses mock data
- Place details lookup - Uses mock data
"""

from fastapi import APIRouter, Query, HTTPException
from typing import Optional, List, Dict, Any
from datetime import datetime
import os
import logging
import httpx

# Setup logging
logger = logging.getLogger(__name__)

# Nominatim API endpoint (OpenStreetMap's free reverse geocoding)
NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"

router = APIRouter(prefix="/api/places", tags=["places"])


# Mock database of locations in Kerala/India for testing
MOCK_LOCATIONS = {
    # Kochi area
    "8.5241,76.9366": {
        "address": "Kochi, Kerala",
        "city": "Kochi",
        "state": "Kerala",
        "country": "India",
        "type": "city",
    },
    "9.9676,76.3261": {
        "address": "MG Road, Kochi",
        "city": "Kochi",
        "state": "Kerala",
        "country": "India",
        "type": "area",
    },
    "8.6753,76.8589": {
        "address": "Ernakulathappan, Kochi",
        "city": "Kochi",
        "state": "Kerala",
        "country": "India",
        "type": "area",
    },
    "8.8965,76.5667": {
        "address": "Fort Kochi, Kochi",
        "city": "Kochi",
        "state": "Kerala",
        "country": "India",
        "type": "area",
    },
    "8.9270,76.3906": {
        "address": "Cochin International Airport, Kochi",
        "city": "Kochi",
        "state": "Kerala",
        "country": "India",
        "type": "landmark",
    },
    # Thiruvananthapuram area
    "8.7426,76.7873": {
        "address": "Thiruvananthapuram, Kerala",
        "city": "Thiruvananthapuram",
        "state": "Kerala",
        "country": "India",
        "type": "city",
    },
    "8.7249,76.7367": {
        "address": "Vazhuthacaud, Thiruvananthapuram",
        "city": "Thiruvananthapuram",
        "state": "Kerala",
        "country": "India",
        "type": "area",
    },
    # Kollam area
    "8.5344,76.2450": {
        "address": "Kollam, Kerala",
        "city": "Kollam",
        "state": "Kerala",
        "country": "India",
        "type": "city",
    },
    "8.8956,76.5687": {
        "address": "Kollam City Center",
        "city": "Kollam",
        "state": "Kerala",
        "country": "India",
        "type": "area",
    },
    # Kottayam area
    "8.4942,76.8194": {
        "address": "Kottayam, Kerala",
        "city": "Kottayam",
        "state": "Kerala",
        "country": "India",
        "type": "city",
    },
    "8.5123,76.8234": {
        "address": "Kottayam City Center",
        "city": "Kottayam",
        "state": "Kerala",
        "country": "India",
        "type": "area",
    },
    # Pathanamthitta area
    "9.2756,76.7871": {
        "address": "Pathanamthitta, Kerala",
        "city": "Pathanamthitta",
        "state": "Kerala",
        "country": "India",
        "type": "city",
    },
    # Alappuzha area
    "9.4981,76.3388": {
        "address": "Alappuzha, Kerala",
        "city": "Alappuzha",
        "state": "Kerala",
        "country": "India",
        "type": "city",
    },
    # Ernakulam area
    "9.6355,76.2263": {
        "address": "Ernakulam Junction",
        "city": "Ernakulam",
        "state": "Kerala",
        "country": "India",
        "type": "area",
    },
}

MOCK_PLACES = {
    "ChIJV4qv-0_1rjoCFdCzjN_n6iY": {
        "name": "Kochi International Airport",
        "address": "Nedumbassery, Kochi, Kerala 682529",
        "latitude": 9.9270,
        "longitude": 76.3906,
        "place_id": "ChIJV4qv-0_1rjoCFdCzjN_n6iY",
    },
    "ChIJWc1--jv1rjoCXq9QnqEhSkY": {
        "name": "MG Road, Kochi",
        "address": "MG Road, Kochi, Kerala",
        "latitude": 9.9676,
        "longitude": 76.3261,
        "place_id": "ChIJWc1--jv1rjoCXq9QnqEhSkY",
    },
    "ChIJ6_e2U9z1rjoCkFQr9YY7hh0": {
        "name": "Ernakulathappan Temple",
        "address": "Ernakulathappan Lane, Kochi",
        "latitude": 9.9655,
        "longitude": 76.3275,
        "place_id": "ChIJ6_e2U9z1rjoCkFQr9YY7hh0",
    },
}


def find_nearest_location(lat: float, lng: float, radius_km: float = 5) -> Optional[Dict[str, Any]]:
    """
    Find nearest location in mock database.
    In production, would use Google Maps Geocoding API or similar.
    """
    def haversine_distance(lat1, lon1, lat2, lon2):
        """Calculate distance between two lat/lon points in km"""
        from math import radians, sin, cos, sqrt, atan2
        
        R = 6371  # Earth's radius in km
        dlat = radians(lat2 - lat1)
        dlon = radians(lon2 - lon1)
        
        a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
        c = 2 * atan2(sqrt(a), sqrt(1 - a))
        distance = R * c
        
        return distance

    nearest = None
    min_distance = radius_km
    
    for key, location in MOCK_LOCATIONS.items():
        loc_parts = key.split(",")
        if len(loc_parts) == 2:
            try:
                loc_lat = float(loc_parts[0])
                loc_lng = float(loc_parts[1])
                distance = haversine_distance(lat, lng, loc_lat, loc_lng)
                
                if distance < min_distance:
                    min_distance = distance
                    nearest = location
            except ValueError:
                continue
    
    return nearest


async def call_nominatim_reverse(lat: float, lng: float, language: str = "en") -> Optional[Dict[str, str]]:
    """
    Call Nominatim (OpenStreetMap) API for reverse geocoding.
    Free, no API key required. Returns real place names.
    """
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            params = {
                "lat": lat,
                "lon": lng,
                "format": "json",
                "zoom": 18,
                "addressdetails": 1,
                "language": language,
            }
            
            # Add User-Agent header (Nominatim requires it)
            headers = {
                "User-Agent": "AutoBuddy/1.0 (https://auto-buddy.in)"
            }
            
            response = await client.get(NOMINATIM_URL, params=params, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                address_parts = data.get("address", {})
                
                # Extract meaningful location info from Nominatim response
                city = (
                    address_parts.get("city")
                    or address_parts.get("town")
                    or address_parts.get("village")
                    or address_parts.get("hamlet")
                    or "Unknown"
                )
                
                state = (
                    address_parts.get("state")
                    or "Unknown"
                )
                
                # Use display_name as full address
                address = data.get("display_name", f"Location at {lat:.4f}, {lng:.4f}")
                
                country = address_parts.get("country", "India")
                
                logger.info(f"Nominatim reverse geocode success: {address}")
                
                return {
                    "address": address,
                    "city": city,
                    "state": state,
                    "country": country,
                }
            else:
                logger.warning(f"Nominatim API returned status {response.status_code}")
                return None
    
    except httpx.TimeoutException:
        logger.warning(f"Nominatim reverse geocode timeout for {lat}, {lng}")
        return None
    except httpx.RequestError as e:
        logger.warning(f"Nominatim request error: {e}")
        return None
    except Exception as e:
        logger.error(f"Nominatim reverse geocode error: {e}")
        return None


@router.get("/reverse-geocode")
async def reverse_geocode(
    latitude: Optional[float] = Query(None),
    longitude: Optional[float] = Query(None),
    lat: Optional[float] = Query(None),
    lng: Optional[float] = Query(None),
    language: str = Query("en"),
) -> Dict[str, Any]:
    """Reverse geocode a location (lat/lng to address) using Nominatim/OpenStreetMap."""
    try:
        # Determine which coordinates to use
        final_lat = latitude if latitude is not None else lat
        final_lng = longitude if longitude is not None else lng
        
        # Validate we have coordinates
        if final_lat is None or final_lng is None:
            return {
                "success": True,
                "latitude": None,
                "longitude": None,
                "address": "Unknown Location",
                "city": "Unknown",
                "state": "Unknown",
                "country": "India",
                "type": "location",
            }
        
        # Ensure they're floats
        try:
            final_lat = float(final_lat)
            final_lng = float(final_lng)
        except (ValueError, TypeError):
            return {
                "success": True,
                "latitude": final_lat,
                "longitude": final_lng,
                "address": "Unknown Location",
                "city": "Unknown",
                "state": "Unknown",
                "country": "India",
                "type": "location",
            }
        
        # Validate ranges
        if not (-90 <= final_lat <= 90 and -180 <= final_lng <= 180):
            return {
                "success": True,
                "latitude": final_lat,
                "longitude": final_lng,
                "address": f"Location at {final_lat}, {final_lng}",
                "city": "Unknown",
                "state": "Unknown",
                "country": "India",
                "type": "location",
            }
        
        # Call Nominatim API for real reverse geocoding
        geocoded = await call_nominatim_reverse(final_lat, final_lng, language)
        
        if geocoded:
            return {
                "success": True,
                "address": geocoded.get("address", f"Location at {final_lat:.4f}, {final_lng:.4f}"),
                "city": geocoded.get("city", "Unknown"),
                "state": geocoded.get("state", "Unknown"),
                "country": geocoded.get("country", "India"),
                "type": "location",
                "latitude": final_lat,
                "longitude": final_lng,
            }
        else:
            # Fallback if Nominatim fails
            return {
                "success": True,
                "address": f"Location at {final_lat:.4f}, {final_lng:.4f}",
                "city": "Unknown",
                "state": "Unknown",
                "country": "India",
                "type": "location",
                "latitude": final_lat,
                "longitude": final_lng,
            }
    
    except Exception as e:
        logger.exception(f"Reverse geocode critical error: {e}")
        # Return a valid response even if something goes catastrophically wrong
        return {
            "success": True,
            "latitude": latitude or lat,
            "longitude": longitude or lng,
            "address": "Unknown Location",
            "city": "Unknown",
            "state": "Unknown",
            "country": "India",
            "type": "location",
        }


@router.get("/autocomplete")
async def autocomplete(
    input: str = Query(..., min_length=3, description="Search query"),
    language: str = Query("en", description="Language code"),
    country_code: Optional[str] = Query(None, description="Country code filter"),
    latitude: Optional[float] = Query(None, description="Latitude for proximity bias"),
    longitude: Optional[float] = Query(None, description="Longitude for proximity bias"),
    radius: Optional[int] = Query(50000, description="Search radius in meters"),
):
    """
    Autocomplete place search.
    
    Returns list of matching places with descriptions and place IDs.
    """
    try:
        if len(input) < 3:
            raise HTTPException(status_code=400, detail="Search query must be at least 3 characters.")
        
        search_term = input.lower()
        results = []
        
        # Search in mock places
        for place_id, place in MOCK_PLACES.items():
            if (search_term in place["name"].lower() or 
                search_term in place["address"].lower()):
                results.append({
                    "place_id": place_id,
                    "placeId": place_id,
                    "name": place["name"],
                    "description": place["address"],
                    "address": place["address"],
                    "latitude": place.get("latitude"),
                    "longitude": place.get("longitude"),
                })
        
        # Also search in locations
        for loc_data in MOCK_LOCATIONS.values():
            if search_term in loc_data["address"].lower():
                results.append({
                    "place_id": loc_data["address"],
                    "placeId": loc_data["address"],
                    "name": loc_data["address"],
                    "description": loc_data["address"],
                    "address": loc_data["address"],
                })
        
        # Remove duplicates
        seen = set()
        unique_results = []
        for result in results:
            key = (result["place_id"], result["address"])
            if key not in seen:
                seen.add(key)
                unique_results.append(result)
        
        return unique_results[:10]  # Return top 10 results
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.get("/details")
async def place_details(
    place_id: str = Query(..., description="Place ID"),
    language: str = Query("en", description="Language code"),
):
    """
    Get detailed information about a place.
    
    Returns full place details including name, address, coordinates, etc.
    """
    try:
        if place_id in MOCK_PLACES:
            place = MOCK_PLACES[place_id]
            return {
                "success": True,
                "place_id": place_id,
                "name": place["name"],
                "address": place["address"],
                "description": place["address"],
                "latitude": place.get("latitude"),
                "longitude": place.get("longitude"),
            }
        elif place_id in MOCK_LOCATIONS:
            location = MOCK_LOCATIONS[place_id]
            return {
                "success": True,
                "place_id": place_id,
                "name": location["address"],
                "address": location["address"],
                "description": location["address"],
            }
        else:
            raise HTTPException(status_code=404, detail=f"Place {place_id} not found.")
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Details lookup failed: {str(e)}")


@router.get("/health")
async def places_health():
    """Health check endpoint for places service."""
    return {
        "status": "healthy",
        "service": "places",
        "timestamp": datetime.utcnow().isoformat(),
        "mock_locations_count": len(MOCK_LOCATIONS),
        "mock_places_count": len(MOCK_PLACES),
        "external_apis_enabled": not DISABLE_EXTERNAL_APIS,
        "mock_data_only": MOCK_DATA_ONLY,
        "version": "2.0",
    }


@router.get("/debug")
async def places_debug():
    """Debug endpoint to verify places service is working correctly."""
    return {
        "status": "debug",
        "service": "places",
        "version": "2.0-mock-only",
        "timestamp": datetime.utcnow().isoformat(),
        "disable_external_apis": DISABLE_EXTERNAL_APIS,
        "mock_data_only": MOCK_DATA_ONLY,
        "available_endpoints": [
            "/api/places/reverse-geocode",
            "/api/places/autocomplete",
            "/api/places/details",
            "/api/places/health",
            "/api/places/debug",
        ],
        "note": "This service uses ONLY mock data. No external API calls are made.",
        "mock_locations": list(MOCK_LOCATIONS.keys())[:3],
        "mock_places": list(MOCK_PLACES.keys())[:3],
    }
