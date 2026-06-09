"""SQLAlchemy models for the v2 vehicle booking platform tables."""

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    Numeric,
    String,
    Text,
    Time,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import declarative_base, relationship

from app.utils.time_helpers import get_ist_now


Base = declarative_base()


class TimestampMixin:
    created_at = Column(DateTime, default=get_ist_now, nullable=True)
    updated_at = Column(DateTime, default=get_ist_now, onupdate=get_ist_now, nullable=True)


class VehicleType(TimestampMixin, Base):
    __tablename__ = "vehicle_types"
    __table_args__ = (
        Index("idx_vehicle_types_active", "is_active"),
        Index("idx_vehicle_types_category", "category"),
        Index("idx_vehicle_types_name", "vehicle_type_name"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    vehicle_type_name = Column(String(50), nullable=False, unique=True)
    category = Column(String(50), nullable=False)
    capacity_passengers = Column(Integer, nullable=False)
    capacity_luggage_cubic_meters = Column(Float, nullable=True)
    estimated_fare_per_km = Column(Numeric(10, 2), nullable=False)
    estimated_fare_per_minute = Column(Numeric(10, 2), nullable=False)
    base_fare = Column(Numeric(10, 2), nullable=False)
    minimum_fare = Column(Numeric(10, 2), nullable=False)
    maximum_passengers = Column(Integer, nullable=False)
    image_url = Column(String(500), nullable=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=True)

    ride_products = relationship("RideProduct", back_populates="vehicle_type")
    pricing_overrides = relationship("RidePricingOverride", back_populates="vehicle_type")
    certifications = relationship("DriverVehicleCertification", back_populates="vehicle_type")
    inventory = relationship("VehicleInventory", back_populates="vehicle_type")


class RideProduct(TimestampMixin, Base):
    __tablename__ = "ride_products"
    __table_args__ = (
        Index("idx_ride_products_vehicle_type", "vehicle_type_id"),
        Index("idx_ride_products_active", "is_active"),
        Index("idx_ride_products_code", "product_code"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    vehicle_type_id = Column(Integer, ForeignKey("vehicle_types.id", ondelete="CASCADE"), nullable=False)
    product_name = Column(String(100), nullable=False)
    product_code = Column(String(50), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    price_multiplier = Column(Numeric(3, 2), default=1.0, nullable=True)
    surge_multiplier_range_min = Column(Numeric(3, 2), default=1.0, nullable=True)
    surge_multiplier_range_max = Column(Numeric(4, 2), default=3.0, nullable=True)
    is_active = Column(Boolean, default=True, nullable=True)

    vehicle_type = relationship("VehicleType", back_populates="ride_products")
    pricing_overrides = relationship("RidePricingOverride", back_populates="ride_product")


class DriverVehicleCertification(TimestampMixin, Base):
    __tablename__ = "driver_vehicle_certifications"
    __table_args__ = (
        Index("idx_driver_certifications_driver", "driver_id"),
        Index("idx_driver_certifications_vehicle", "vehicle_type_id"),
        Index("idx_driver_certifications_status", "verification_status"),
        Index("idx_driver_certifications_active", "is_active"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    driver_id = Column(String(100), nullable=False)
    vehicle_type_id = Column(Integer, ForeignKey("vehicle_types.id", ondelete="CASCADE"), nullable=False)
    certification_date = Column(DateTime, default=get_ist_now, nullable=True)
    expiry_date = Column(DateTime, nullable=True)
    verification_status = Column(String(50), default="PENDING", nullable=True)
    verified_by = Column(String(100), nullable=True)
    verified_date = Column(DateTime, nullable=True)
    document_url = Column(String(500), nullable=True)
    notes = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=True)

    vehicle_type = relationship("VehicleType", back_populates="certifications")


class RidePricingOverride(TimestampMixin, Base):
    __tablename__ = "ride_pricing_overrides"
    __table_args__ = (
        Index("idx_pricing_overrides_vehicle", "vehicle_type_id"),
        Index("idx_pricing_overrides_active", "is_active"),
        Index("idx_pricing_overrides_priority", "priority_order"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    vehicle_type_id = Column(Integer, ForeignKey("vehicle_types.id", ondelete="CASCADE"), nullable=False)
    ride_product_id = Column(Integer, ForeignKey("ride_products.id", ondelete="SET NULL"), nullable=True)
    pricing_rule_name = Column(String(100), nullable=False)
    location_latitude = Column(Numeric(10, 8), nullable=True)
    location_longitude = Column(Numeric(11, 8), nullable=True)
    location_radius_km = Column(Float, nullable=True)
    time_from = Column(Time, nullable=True)
    time_to = Column(Time, nullable=True)
    day_of_week_start = Column(Integer, nullable=True)
    day_of_week_end = Column(Integer, nullable=True)
    surge_multiplier = Column(Numeric(4, 2), default=1.0, nullable=True)
    base_fare_override = Column(Numeric(10, 2), nullable=True)
    per_km_override = Column(Numeric(10, 2), nullable=True)
    per_minute_override = Column(Numeric(10, 2), nullable=True)
    priority_order = Column(Integer, default=100, nullable=True)
    is_active = Column(Boolean, default=True, nullable=True)

    vehicle_type = relationship("VehicleType", back_populates="pricing_overrides")
    ride_product = relationship("RideProduct", back_populates="pricing_overrides")


class DispatchPreference(TimestampMixin, Base):
    __tablename__ = "dispatch_preferences"
    __table_args__ = (
        Index("idx_dispatch_prefs_driver", "driver_id"),
        Index("idx_dispatch_prefs_online", "is_online"),
        Index("idx_dispatch_prefs_vehicle", "preferred_vehicle_type_id"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    driver_id = Column(String(100), nullable=False, unique=True)
    available_vehicle_type_ids = Column(ARRAY(Integer).with_variant(JSON(), "sqlite"), nullable=True)
    preferred_vehicle_type_id = Column(Integer, nullable=True)
    accepts_pooled_rides = Column(Boolean, default=False, nullable=True)
    accepts_scheduled_rides = Column(Boolean, default=False, nullable=True)
    accepts_goods_transport = Column(Boolean, default=False, nullable=True)
    minimum_rating = Column(Numeric(3, 2), default=4.0, nullable=True)
    maximum_ride_distance_km = Column(Float, default=50.0, nullable=True)
    service_area_latitude = Column(Numeric(10, 8), nullable=True)
    service_area_longitude = Column(Numeric(11, 8), nullable=True)
    service_area_radius_km = Column(Float, default=10.0, nullable=True)
    is_online = Column(Boolean, default=False, nullable=True)
    last_active_at = Column(DateTime, nullable=True)


class VehicleInventory(TimestampMixin, Base):
    __tablename__ = "vehicle_inventory"
    __table_args__ = (
        Index("idx_vehicle_inventory_driver", "driver_id"),
        Index("idx_vehicle_inventory_type", "vehicle_type_id"),
        Index("idx_vehicle_inventory_active", "is_active"),
        Index("idx_vehicle_inventory_registration", "vehicle_registration_number"),
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    driver_id = Column(String(100), nullable=False)
    vehicle_type_id = Column(Integer, ForeignKey("vehicle_types.id", ondelete="RESTRICT"), nullable=False)
    vehicle_registration_number = Column(String(20), nullable=False, unique=True)
    vehicle_make = Column(String(100), nullable=True)
    vehicle_model = Column(String(100), nullable=True)
    vehicle_year = Column(Integer, nullable=True)
    vehicle_color = Column(String(50), nullable=True)
    seats_available = Column(Integer, nullable=True)
    trunk_space_cubic_meters = Column(Float, nullable=True)
    permit_type = Column(String(50), nullable=True)
    permit_expiry_date = Column(Date, nullable=True)
    insurance_provider = Column(String(100), nullable=True)
    insurance_expiry_date = Column(Date, nullable=True)
    pollution_certificate_expiry_date = Column(Date, nullable=True)
    fitness_certificate_expiry_date = Column(Date, nullable=True)
    inspection_status = Column(String(50), default="PENDING", nullable=True)
    inspection_date = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=False, nullable=True)

    vehicle_type = relationship("VehicleType", back_populates="inventory")


__all__ = [
    "Base",
    "DispatchPreference",
    "DriverVehicleCertification",
    "RidePricingOverride",
    "RideProduct",
    "VehicleInventory",
    "VehicleType",
]
