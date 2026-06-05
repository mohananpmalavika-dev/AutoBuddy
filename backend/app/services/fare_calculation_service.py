"""
ENHANCED FARE CALCULATION SERVICE
Calculates fares based on vehicle type, ride type, distance, time, and other factors
Uses canonical vehicle multipliers and ride-type specific pricing from database
"""

from typing import Optional, Dict, Tuple
from math import radians, cos, sin, asin, sqrt
import logging
from datetime import datetime, timedelta
from app.utils.time_helpers import get_ist_now

from app.models.ride_type_compatibility import (
    FARE_CONFIGURATIONS,
    FareConfig,
    GoodsCargoFareConfig,
    RentalFareConfig,
    get_ride_type_multiplier,
    RIDE_TYPE_COMPATIBILITY,
)
from app.models.canonical_vehicle_model import get_vehicle_by_id, get_vehicle_multiplier
from app.models.enhanced_booking_models import FareBreakdown, RideType

logger = logging.getLogger(__name__)


def _to_plain_config(value):
    if value is None:
        return None
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    if hasattr(value, "dict"):
        return value.dict()
    if isinstance(value, dict):
        return {k: _to_plain_config(v) for k, v in value.items()}
    return value


def _config_value(config, key: str, default=None):
    if config is None:
        return default
    if isinstance(config, dict):
        return config.get(key, default)
    return getattr(config, key, default)


def _as_float(value, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _as_int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _merged_fare_config(vehicle_type_id: str, fare_config_override: Optional[Dict] = None) -> Dict:
    default_config = _to_plain_config(
        FARE_CONFIGURATIONS.get(vehicle_type_id)
        or FARE_CONFIGURATIONS.get("taxi")
        or {}
    )
    if not fare_config_override:
        return default_config

    merged = dict(default_config)
    for key, value in _to_plain_config(fare_config_override).items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key] = {**merged[key], **value}
        else:
            merged[key] = value
    return merged


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points 
    on the earth (specified in decimal degrees)
    Returns distance in kilometers
    """
    try:
        # convert decimal degrees to radians 
        lon1, lat1, lon2, lat2 = map(radians, [lon1, lat1, lon2, lat2])

        # haversine formula 
        dlon = lon2 - lon1 
        dlat = lat2 - lat1 
        a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
        c = 2 * asin(sqrt(a)) 
        r = 6371 # Radius of earth in kilometers
        return c * r
    except Exception as e:
        logger.error(f"Error calculating distance: {str(e)}")
        return 0.0


def estimate_time_minutes(distance_km: float, ride_type: str = "instant") -> float:
    """
    Estimate travel time based on distance and ride type
    Assumes average speed of 40 km/h in urban areas
    """
    if distance_km <= 0:
        return 5.0
    
    # Base speed: 40 km/h = 0.67 km/min
    base_speed = 0.67
    estimated_time = distance_km / base_speed
    
    # Add buffer for different ride types
    ride_type_factors = {
        "instant": 1.0,
        "scheduled": 1.0,
        "airport": 1.1,  # Usually longer due to airport processes
        "corporate": 1.0,
        "tourism": 1.5,  # Slower for sightseeing
        "rental": 0.5,  # Doesn't apply hourly
        "goods": 1.1,  # Slower due to pickup/dropoff
    }
    
    factor = ride_type_factors.get(ride_type, 1.0)
    estimated_time *= factor
    
    # Minimum 5 minutes
    return max(5.0, estimated_time)


def calculate_surge_multiplier(
    is_peak_hours: bool = False,
    demand_level: float = 1.0,  # 0.8 to 2.0
    current_rides: int = 0,
    available_drivers: int = 1
) -> float:
    """
    Calculate dynamic surge pricing multiplier
    - Base: 1.0 (no surge)
    - Peak hours: 1.2x (20% increase)
    - High demand/low supply: 1.5x - 2.0x
    """
    surge = 1.0
    
    if is_peak_hours:
        surge *= 1.2
    
    # Demand/supply ratio
    if available_drivers > 0:
        demand_ratio = current_rides / max(1, available_drivers)
        if demand_ratio > 3:
            surge *= 1.5
        elif demand_ratio > 5:
            surge *= 2.0
    
    # Cap at 2.0x
    return min(2.0, surge)


def calculate_base_fare(
    vehicle_type_id: str,
    ride_type: str,
    distance_km: float,
    time_minutes: float,
    goods_weight_kg: Optional[float] = None,
    rental_hours: Optional[float] = None,
    fare_config_override: Optional[Dict] = None,
) -> Tuple[float, Dict]:
    """
    Calculate base fare before taxes and surge
    Returns (fare_amount, detailed_breakdown)
    """
    ride_type_key = ride_type.value if hasattr(ride_type, "value") else str(ride_type)
    
    fare_config = _merged_fare_config(vehicle_type_id, fare_config_override)
    if not fare_config:
        logger.warning(f"No fare config for vehicle {vehicle_type_id}, using taxi config")
        fare_config = _merged_fare_config("taxi")
    
    breakdown = {}
    total = 0.0
    
    # Get ride-type specific config
    ride_config = fare_config.get(ride_type_key, {})
    
    # Handle different fare types
    fare_type = RIDE_TYPE_COMPATIBILITY.get(ride_type_key, {}).get("fare_type", "distance_based")
    
    if fare_type == "distance_based":
        # Standard distance + time based pricing
        base_config = fare_config.get("base") or _to_plain_config(FareConfig())
        
        # Base fare
        base_fare = _as_float(_config_value(base_config, "base_fare", 50.0), 50.0)
        per_km_rate = _as_float(_config_value(base_config, "per_km_rate", 10.0), 10.0)
        per_minute_rate = _as_float(_config_value(base_config, "per_minute_rate", 2.0), 2.0)
        breakdown["base_fare"] = base_fare
        total += base_fare
        
        # Distance charge
        distance_charge = distance_km * per_km_rate
        breakdown["distance_km"] = distance_km
        breakdown["distance_charge"] = distance_charge
        total += distance_charge
        
        # Time charge (as waiting time charge)
        time_charge = (time_minutes - 5) * per_minute_rate  # First 5 min free
        time_charge = max(0, time_charge)
        breakdown["time_minutes"] = time_minutes
        breakdown["time_charge"] = time_charge
        total += time_charge
        
        # Apply minimum fare
        ride_multiplier = _config_value(ride_config, "multiplier")
        if ride_multiplier:
            # Ride-type specific pricing - apply multiplier
            ride_multiplier = _as_float(ride_multiplier, 1.0)
            total = total * ride_multiplier
            breakdown["ride_type_multiplier"] = ride_multiplier
    
    elif fare_type == "weight_based":
        # Goods delivery pricing
        goods_config = fare_config.get("base") or _to_plain_config(GoodsCargoFareConfig())
        base_fare = _as_float(_config_value(goods_config, "base_fare", 100.0), 100.0)
        per_kg_rate = _as_float(_config_value(goods_config, "per_kg_rate", 5.0), 5.0)
        per_km_rate = _as_float(_config_value(goods_config, "per_km_rate", 15.0), 15.0)
        
        breakdown["base_fare"] = base_fare
        total = base_fare
        
        # Weight-based charge
        if goods_weight_kg:
            weight_charge = goods_weight_kg * per_kg_rate
            breakdown["goods_weight_kg"] = goods_weight_kg
            breakdown["goods_charge"] = weight_charge
            total += weight_charge
        
        # Distance charge
        distance_charge = distance_km * per_km_rate
        breakdown["distance_km"] = distance_km
        breakdown["distance_charge"] = distance_charge
        total += distance_charge
        
        # Loading assistance
        if ride_config and isinstance(ride_config, dict) and ride_config.get("loading_help_required"):
            loading_charge = _as_float(_config_value(goods_config, "loading_help_charge", 50.0), 50.0)
            breakdown["loading_help_charge"] = loading_charge
            total += loading_charge
    
    elif fare_type == "hourly":
        # Rental/Tourism hourly pricing
        rental_config = ride_config
        if _config_value(rental_config, "hourly_rate") is None:
            rental_config = fare_config.get("base")
        if _config_value(rental_config, "hourly_rate") is None:
            rental_config = _to_plain_config(RentalFareConfig())
        
        if rental_hours:
            # Use provided rental hours
            hours = rental_hours
        else:
            # Calculate from distance
            avg_speed = 40  # km/h
            minimum_hours = _as_int(_config_value(rental_config, "minimum_hours", 4), 4)
            hours = max(minimum_hours, distance_km / avg_speed)
        
        hourly_rate = _as_float(_config_value(rental_config, "hourly_rate", 500.0), 500.0)
        breakdown["hours"] = hours
        breakdown["hourly_rate"] = hourly_rate
        
        # Hourly charge
        hourly_charge = hours * hourly_rate
        breakdown["hourly_charge"] = hourly_charge
        total = hourly_charge
        
        # Extra km charge if applicable
        km_limit_per_hour = _as_float(_config_value(rental_config, "km_limit_per_hour", 50.0), 50.0)
        extra_km_rate = _as_float(_config_value(rental_config, "extra_km_rate", 10.0), 10.0)
        free_km = hours * km_limit_per_hour
        if distance_km > free_km:
            extra_km_charge = (distance_km - free_km) * extra_km_rate
            breakdown["extra_km_charge"] = extra_km_charge
            total += extra_km_charge
    
    # Apply minimum fare
    base_config = fare_config.get("base")
    min_fare = _config_value(base_config, "minimum_fare")
    if min_fare is not None:
        min_fare = _as_float(min_fare, 0.0)
        if total < min_fare:
            breakdown["minimum_fare_applied"] = True
            total = min_fare
    
    return total, breakdown


def calculate_complete_fare(
    vehicle_type_id: str,
    ride_type: str,
    pickup_lat: float,
    pickup_lon: float,
    dropoff_lat: float,
    dropoff_lon: float,
    vehicle_subtype_id: Optional[str] = None,
    goods_weight_kg: Optional[float] = None,
    rental_hours: Optional[float] = None,
    is_peak_hours: bool = False,
    current_rides: int = 0,
    available_drivers: int = 1,
    promo_discount: float = 0.0,
    tax_percentage: float = 5.0,
    vehicle_multiplier_override: Optional[float] = None,
    fare_config_override: Optional[Dict] = None,
) -> Dict:
    """
    COMPLETE FARE CALCULATION
    Calculates entire fare including base, multipliers, surge, tax
    """
    
    try:
        ride_type_key = ride_type.value if hasattr(ride_type, "value") else str(ride_type)
        # Calculate distance
        distance_km = haversine_distance(pickup_lat, pickup_lon, dropoff_lat, dropoff_lon)
        distance_km = max(1.0, distance_km)  # Minimum 1 km
        
        # Estimate time
        time_minutes = estimate_time_minutes(distance_km, ride_type_key)
        
        # Get vehicle info
        vehicle_info = get_vehicle_by_id(vehicle_type_id)
        if not vehicle_info and vehicle_multiplier_override is None:
            raise ValueError(f"Vehicle type {vehicle_type_id} not found")
        
        # Get multipliers
        vehicle_multiplier = (
            vehicle_multiplier_override
            if vehicle_multiplier_override is not None
            else get_vehicle_multiplier(vehicle_type_id, vehicle_subtype_id)
        )
        ride_type_multiplier = get_ride_type_multiplier(ride_type_key)
        
        # Calculate base fare
        base_fare, base_breakdown = calculate_base_fare(
            vehicle_type_id,
            ride_type_key,
            distance_km,
            time_minutes,
            goods_weight_kg,
            rental_hours,
            fare_config_override=fare_config_override,
        )
        
        # Apply vehicle multiplier (on top of ride-type specific pricing)
        subtotal = base_fare * vehicle_multiplier
        
        # Calculate surge
        surge_multiplier = calculate_surge_multiplier(is_peak_hours, 1.0, current_rides, available_drivers)
        surge_amount = (subtotal - base_fare) * (surge_multiplier - 1.0)  # Only surge on non-base amount
        
        # Apply promo discount (before tax)
        discounted_amount = subtotal + surge_amount - promo_discount
        
        # Calculate tax
        tax_amount = (discounted_amount) * (tax_percentage / 100.0)
        
        # Total fare
        total_fare = discounted_amount + tax_amount
        total_fare = round(total_fare, 2)  # Round to 2 decimals
        
        # Build fare breakdown
        fare_breakdown = FareBreakdown(
            base_fare=base_fare,
            distance_km=distance_km,
            distance_charge=base_breakdown.get("distance_charge", 0),
            time_minutes=time_minutes,
            time_charge=base_breakdown.get("time_charge", 0),
            vehicle_multiplier=vehicle_multiplier,
            ride_type_multiplier=ride_type_multiplier,
            goods_weight_kg=goods_weight_kg,
            goods_charge=base_breakdown.get("goods_charge", 0),
            loading_help_charge=base_breakdown.get("loading_help_charge", 0),
            subtotal=round(subtotal, 2),
            surge_percentage=round((surge_multiplier - 1.0) * 100, 1),
            surge_amount=round(surge_amount, 2),
            tax_percentage=tax_percentage,
            tax_amount=round(tax_amount, 2),
            total_fare=total_fare
        )
        
        return {
            "success": True,
            "distance_km": round(distance_km, 2),
            "estimated_time_minutes": int(time_minutes),
            "base_fare": round(base_fare, 2),
            "vehicle_multiplier": vehicle_multiplier,
            "ride_type_multiplier": ride_type_multiplier,
            "surge_multiplier": round(surge_multiplier, 2),
            "total_fare": total_fare,
            "estimated_fare": total_fare,
            "fare_breakdown": fare_breakdown,
            "valid_until": (get_ist_now() + timedelta(seconds=300)).isoformat()
        }
    
    except Exception as e:
        logger.error(f"Error calculating fare: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "base_fare": 0.0,
            "total_fare": 0.0,
            "estimated_fare": 0.0
        }
