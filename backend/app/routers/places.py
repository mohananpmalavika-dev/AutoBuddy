"""
Places Router - Geocoding and Location Services

Handles:
- Reverse geocoding (lat/lon → address) - MOCK DATA ONLY
- Place autocomplete search - MOCK DATA ONLY
- Place details lookup - MOCK DATA ONLY

IMPORTANT: This router uses ONLY mock database data.
NO external API calls. NO Google Maps API. Fully offline.
"""

from fastapi import APIRouter, Query, HTTPException
from typing import Optional, List, Dict, Any
from datetime import datetime
import os

# Explicitly disable any external API calls
DISABLE_EXTERNAL_APIS = True
MOCK_DATA_ONLY = True

router = APIRouter(prefix="/api/places", tags=["places"])


# Mock database of locations in Kerala/India for testing
MOCK_LOCATIONS = {
    "8.5241,76.9366": {
        "address": "Kochi, Kerala",
        "city": "Kochi",
        "state": "Kerala",
        "country": "India",
        "type": "city",
    },
    "8.7426,76.7873": {
        "address": "Thiruvananthapuram, Kerala",
        "city": "Thiruvananthapuram",
        "state": "Kerala",
        "country": "India",
        "type": "city",
    },
    "8.6753,76.8589": {
        "address": "Ernakulathappan, Kochi",
        "city": "Kochi",
        "state": "Kerala",
        "country": "India",
        "type": "area",
    },
    "8.5344,76.2450": {
        "address": "Kollam, Kerala",
        "city": "Kollam",
        "state": "Kerala",
        "country": "India",
        "type": "city",
    },
    "8.4942,76.8194": {
        "address": "Kottayam, Kerala",
        "city": "Kottayam",
        "state": "Kerala",
        "country": "India",
        "type": "city",
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


@router.get("/reverse-geocode")
async def reverse_geocode(
    latitude: Optional[float] = Query(None, description="Latitude"),
    longitude: Optional[float] = Query(None, description="Longitude"),
    lat: Optional[float] = Query(None, description="Latitude (alternate)"),
    lng: Optional[float] = Query(None, description="Longitude (alternate)"),
    language: str = Query("en", description="Language code"),
):
    """
    Reverse geocode a location (convert lat/lon to address).
    
    Accepts latitude/longitude or lat/lng parameters.
    Returns address, city, state, country, and location type.
    """
    try:
        # Handle both parameter naming conventions
        final_lat = latitude if latitude is not None else lat
        final_lng = longitude if longitude is not None else lng
        
        # Validate inputs exist
        if final_lat is None or final_lng is None:
            return {
                "success": False,
                "error": "Missing parameters. Provide latitude & longitude (or lat & lng)",
                "detail": f"latitude={latitude}, longitude={longitude}, lat={lat}, lng={lng}",
            }
        
        # Convert to float if string
        try:
            final_lat = float(final_lat)
            final_lng = float(final_lng)
        except (ValueError, TypeError):
            return {
                "success": False,
                "error": "Invalid parameter format. Latitude and longitude must be numbers.",
                "detail": f"Received: latitude={final_lat} (type: {type(final_lat).__name__}), longitude={final_lng} (type: {type(final_lng).__name__})",
            }
        
        # Validate ranges
        if final_lat < -90 or final_lat > 90:
            return {
                "success": False,
                "error": "Invalid latitude. Must be between -90 and 90.",
                "received": final_lat,
            }
        if final_lng < -180 or final_lng > 180:
            return {
                "success": False,
                "error": "Invalid longitude. Must be between -180 and 180.",
                "received": final_lng,
            }
        
        # Find nearest location (mock implementation)
        location = find_nearest_location(final_lat, final_lng, radius_km=10)
        
        if location:
            return {
                "success": True,
                "address": location.get("address"),
                "city": location.get("city"),
                "state": location.get("state"),
                "country": location.get("country"),
                "type": location.get("type"),
                "latitude": final_lat,
                "longitude": final_lng,
            }
        else:
            # Return generic address if no match found
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
        try:
            import traceback as tb
            error_traceback = tb.format_exc()
        except:
            error_traceback = "Unknown error"
        
        return {
            "success": False,
            "error": "Geocoding failed",
            "detail": str(e),
            "traceback": error_traceback,
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
