"""
Vehicle Types API Router
Location: backend/app/routers/vehicle_types_api.py
Endpoints: 5 total
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from decimal import Decimal
import math

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/api/v2/vehicle-types", tags=["Vehicle Types"])


# ==================== ENDPOINT 1: GET ALL VEHICLE TYPES ====================
@router.get("", response_model=List[schemas.VehicleTypeResponse])
async def get_all_vehicle_types(
    db: Session = Depends(get_db),
    active_only: bool = Query(True)
):
    """
    Get all vehicle types
    
    Query Parameters:
    - active_only: Filter only active vehicle types (default: true)
    
    Response: List of vehicle types with all details
    """
    query = db.query(models.VehicleType)
    if active_only:
        query = query.filter(models.VehicleType.is_active == True)
    
    vehicle_types = query.all()
    if not vehicle_types:
        raise HTTPException(status_code=404, detail="No vehicle types found")
    
    return vehicle_types


# ==================== ENDPOINT 2: GET VEHICLE TYPE BY ID ====================
@router.get("/{vehicle_type_id}", response_model=schemas.VehicleTypeResponse)
async def get_vehicle_type(
    vehicle_type_id: int,
    db: Session = Depends(get_db)
):
    """
    Get specific vehicle type by ID
    
    Path Parameters:
    - vehicle_type_id: Unique vehicle type identifier
    
    Response: Vehicle type details with all specifications
    
    Errors:
    - 404: Vehicle type not found
    """
    vehicle_type = db.query(models.VehicleType).filter(
        models.VehicleType.id == vehicle_type_id
    ).first()
    
    if not vehicle_type:
        raise HTTPException(status_code=404, detail="Vehicle type not found")
    
    return vehicle_type


# ==================== ENDPOINT 3: GET RIDE PRODUCTS FOR VEHICLE TYPE ====================
@router.get("/{vehicle_type_id}/ride-products", response_model=List[schemas.RideProductResponse])
async def get_ride_products(
    vehicle_type_id: int,
    db: Session = Depends(get_db)
):
    """
    Get all ride products (variants) for a vehicle type
    
    Path Parameters:
    - vehicle_type_id: Vehicle type identifier
    
    Response: List of ride product variants with pricing
    
    Example Products:
    - Auto Standard (1.0x multiplier)
    - Taxi Standard (1.0x multiplier)
    - Taxi Premium (1.5x multiplier)
    """
    vehicle_type = db.query(models.VehicleType).filter(
        models.VehicleType.id == vehicle_type_id
    ).first()
    
    if not vehicle_type:
        raise HTTPException(status_code=404, detail="Vehicle type not found")
    
    ride_products = db.query(models.RideProduct).filter(
        models.RideProduct.vehicle_type_id == vehicle_type_id,
        models.RideProduct.is_active == True
    ).all()
    
    return ride_products


# ==================== ENDPOINT 4: ESTIMATE FARE ====================
@router.post("/estimate-fare", response_model=schemas.FareEstimateResponse)
async def estimate_fare(
    request: schemas.FareEstimateRequest,
    db: Session = Depends(get_db)
):
    """
    Calculate estimated fare for a ride
    
    Request Body:
    {
        "pickup_latitude": 28.7041,
        "pickup_longitude": 77.1025,
        "dropoff_latitude": 28.5244,
        "dropoff_longitude": 77.1855,
        "vehicle_type_id": 1,
        "ride_product_id": null
    }
    
    Response: Detailed fare breakdown with surge pricing
    {
        "vehicle_type_id": 1,
        "ride_product_id": null,
        "base_fare": 30.00,
        "estimated_distance_km": 35.5,
        "estimated_duration_minutes": 45,
        "per_km_charge": 532.50,
        "per_minute_charge": 22.50,
        "surge_multiplier": 1.2,
        "estimated_total_fare": 667.20,
        "minimum_fare": 50.00,
        "final_fare": 667.20
    }
    """
    # Get vehicle type
    vehicle_type = db.query(models.VehicleType).filter(
        models.VehicleType.id == request.vehicle_type_id
    ).first()
    
    if not vehicle_type:
        raise HTTPException(status_code=404, detail="Vehicle type not found")
    
    # Calculate distance using Haversine formula (simplified)
    lat_diff = abs(request.dropoff_latitude - request.pickup_latitude)
    lon_diff = abs(request.dropoff_longitude - request.pickup_longitude)
    distance_km = math.sqrt(lat_diff**2 + lon_diff**2) * 111  # Approx 111 km per degree
    
    # Estimate duration (avg speed 40 km/hr in city)
    duration_minutes = (distance_km / 40) * 60
    
    # Get pricing overrides for current location/time
    pricing_override = db.query(models.RidePricingOverride).filter(
        models.RidePricingOverride.vehicle_type_id == request.vehicle_type_id,
        models.RidePricingOverride.is_active == True
    ).order_by(models.RidePricingOverride.priority_order).first()
    
    surge_multiplier = Decimal(1.0)
    if pricing_override:
        surge_multiplier = pricing_override.surge_multiplier
    
    # Calculate fare
    per_km_charge = Decimal(distance_km) * vehicle_type.estimated_fare_per_km
    per_minute_charge = Decimal(duration_minutes) * vehicle_type.estimated_fare_per_minute
    
    estimated_total = vehicle_type.base_fare + per_km_charge + per_minute_charge
    estimated_total = estimated_total * surge_multiplier
    
    final_fare = max(estimated_total, vehicle_type.minimum_fare)
    
    return schemas.FareEstimateResponse(
        vehicle_type_id=request.vehicle_type_id,
        ride_product_id=request.ride_product_id,
        base_fare=vehicle_type.base_fare,
        estimated_distance_km=distance_km,
        estimated_duration_minutes=duration_minutes,
        per_km_charge=per_km_charge,
        per_minute_charge=per_minute_charge,
        surge_multiplier=surge_multiplier,
        estimated_total_fare=estimated_total,
        minimum_fare=vehicle_type.minimum_fare,
        final_fare=final_fare
    )


# ==================== ENDPOINT 5: GET SURGE MULTIPLIERS ====================
@router.get("/surge-multipliers/current", response_model=List[schemas.SurgeMultiplierResponse])
async def get_surge_multipliers(
    latitude: Optional[Decimal] = Query(None),
    longitude: Optional[Decimal] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Get current surge pricing across all vehicle types
    
    Query Parameters:
    - latitude: Optional pickup location latitude
    - longitude: Optional pickup location longitude
    
    Response: List of surge multipliers by vehicle type
    
    Example:
    [
        {
            "vehicle_type_id": 1,
            "current_surge_multiplier": 1.0,
            "surge_level": "LOW",
            "demand_level": 25,
            "available_drivers": 120,
            "available_rides_waiting": 15
        },
        {
            "vehicle_type_id": 2,
            "current_surge_multiplier": 1.5,
            "surge_level": "MEDIUM",
            "demand_level": 65,
            "available_drivers": 45,
            "available_rides_waiting": 80
        }
    ]
    """
    vehicle_types = db.query(models.VehicleType).filter(
        models.VehicleType.is_active == True
    ).all()
    
    surge_data = []
    for vt in vehicle_types:
        # Get pricing override if available
        pricing_override = db.query(models.RidePricingOverride).filter(
            models.RidePricingOverride.vehicle_type_id == vt.id,
            models.RidePricingOverride.is_active == True
        ).first()
        
        surge_multiplier = pricing_override.surge_multiplier if pricing_override else Decimal(1.0)
        
        # Determine surge level
        if surge_multiplier <= 1.0:
            surge_level = "LOW"
        elif surge_multiplier <= 1.5:
            surge_level = "MEDIUM"
        elif surge_multiplier <= 2.0:
            surge_level = "HIGH"
        else:
            surge_level = "VERY_HIGH"
        
        surge_data.append(schemas.SurgeMultiplierResponse(
            vehicle_type_id=vt.id,
            current_surge_multiplier=surge_multiplier,
            surge_level=surge_level,
            demand_level=50,  # Placeholder - would come from Redis cache
            available_drivers=100,  # Placeholder
            available_rides_waiting=20  # Placeholder
        ))
    
    return surge_data
