"""
Pydantic Schemas - Request/Response validation
Location: backend/app/schemas.py
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date, time
from decimal import Decimal


# ==================== VEHICLE TYPE SCHEMAS ====================

class VehicleTypeBase(BaseModel):
    vehicle_type_name: str
    category: str
    capacity_passengers: int
    capacity_luggage_cubic_meters: Optional[float] = None
    estimated_fare_per_km: Decimal
    estimated_fare_per_minute: Decimal
    base_fare: Decimal
    minimum_fare: Decimal
    maximum_passengers: int
    image_url: Optional[str] = None
    description: Optional[str] = None
    is_active: bool = True


class VehicleTypeCreate(VehicleTypeBase):
    pass


class VehicleTypeResponse(VehicleTypeBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==================== RIDE PRODUCT SCHEMAS ====================

class RideProductBase(BaseModel):
    vehicle_type_id: int
    product_name: str
    product_code: str
    description: Optional[str] = None
    price_multiplier: Decimal = Decimal("1.0")
    surge_multiplier_range_min: Decimal = Decimal("1.0")
    surge_multiplier_range_max: Decimal = Decimal("3.0")
    is_active: bool = True


class RideProductCreate(RideProductBase):
    pass


class RideProductResponse(RideProductBase):
    id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==================== DRIVER CERTIFICATION SCHEMAS ====================

class DriverVehicleCertificationBase(BaseModel):
    driver_id: str
    vehicle_type_id: int
    expiry_date: Optional[datetime] = None
    verification_status: str = "PENDING"
    verified_by: Optional[str] = None
    verified_date: Optional[datetime] = None
    document_url: Optional[str] = None
    notes: Optional[str] = None


class DriverVehicleCertificationCreate(DriverVehicleCertificationBase):
    pass


class DriverVehicleCertificationResponse(DriverVehicleCertificationBase):
    id: int
    certification_date: datetime
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==================== PRICING OVERRIDE SCHEMAS ====================

class RidePricingOverrideBase(BaseModel):
    vehicle_type_id: int
    ride_product_id: Optional[int] = None
    pricing_rule_name: str
    location_latitude: Optional[Decimal] = None
    location_longitude: Optional[Decimal] = None
    location_radius_km: Optional[float] = None
    time_from: Optional[time] = None
    time_to: Optional[time] = None
    day_of_week_start: Optional[int] = None
    day_of_week_end: Optional[int] = None
    surge_multiplier: Decimal = Decimal("1.0")
    base_fare_override: Optional[Decimal] = None
    per_km_override: Optional[Decimal] = None
    per_minute_override: Optional[Decimal] = None
    priority_order: int = 100


class RidePricingOverrideCreate(RidePricingOverrideBase):
    pass


class RidePricingOverrideResponse(RidePricingOverrideBase):
    id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==================== DISPATCH PREFERENCE SCHEMAS ====================

class DispatchPreferenceBase(BaseModel):
    driver_id: str
    available_vehicle_type_ids: Optional[List[int]] = None
    preferred_vehicle_type_id: Optional[int] = None
    accepts_pooled_rides: bool = False
    accepts_scheduled_rides: bool = False
    accepts_goods_transport: bool = False
    minimum_rating: Decimal = Decimal("4.0")
    maximum_ride_distance_km: float = 50.0
    service_area_latitude: Optional[Decimal] = None
    service_area_longitude: Optional[Decimal] = None
    service_area_radius_km: float = 10.0


class DispatchPreferenceCreate(DispatchPreferenceBase):
    pass


class DispatchPreferenceResponse(DispatchPreferenceBase):
    id: int
    is_online: bool
    last_active_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==================== VEHICLE INVENTORY SCHEMAS ====================

class VehicleInventoryBase(BaseModel):
    driver_id: str
    vehicle_type_id: int
    vehicle_registration_number: str
    vehicle_make: Optional[str] = None
    vehicle_model: Optional[str] = None
    vehicle_year: Optional[int] = None
    vehicle_color: Optional[str] = None
    seats_available: Optional[int] = None
    trunk_space_cubic_meters: Optional[float] = None
    permit_type: Optional[str] = None
    permit_expiry_date: Optional[date] = None
    insurance_provider: Optional[str] = None
    insurance_expiry_date: Optional[date] = None
    pollution_certificate_expiry_date: Optional[date] = None
    fitness_certificate_expiry_date: Optional[date] = None


class VehicleInventoryCreate(VehicleInventoryBase):
    pass


class VehicleInventoryResponse(VehicleInventoryBase):
    id: int
    inspection_status: str
    inspection_date: Optional[datetime] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ==================== FARE ESTIMATE SCHEMAS ====================

class FareEstimateRequest(BaseModel):
    pickup_latitude: Decimal
    pickup_longitude: Decimal
    dropoff_latitude: Decimal
    dropoff_longitude: Decimal
    vehicle_type_id: int
    ride_product_id: Optional[int] = None


class FareEstimateResponse(BaseModel):
    vehicle_type_id: int
    ride_product_id: Optional[int]
    base_fare: Decimal
    estimated_distance_km: float
    estimated_duration_minutes: float
    per_km_charge: Decimal
    per_minute_charge: Decimal
    surge_multiplier: Decimal
    estimated_total_fare: Decimal
    minimum_fare: Decimal
    final_fare: Decimal


# ==================== SURGE MULTIPLIER SCHEMAS ====================

class SurgeMultiplierResponse(BaseModel):
    vehicle_type_id: int
    current_surge_multiplier: Decimal
    surge_level: str  # LOW, MEDIUM, HIGH, VERY_HIGH
    demand_level: int  # percentage
    available_drivers: int
    available_rides_waiting: int
