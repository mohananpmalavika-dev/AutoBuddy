"""ORM model exports used by the v2 SQLAlchemy routers."""

from app.models.vehicle_platform import (
    Base,
    DispatchPreference,
    DriverVehicleCertification,
    RidePricingOverride,
    RideProduct,
    VehicleInventory,
    VehicleType,
)

__all__ = [
    "Base",
    "DispatchPreference",
    "DriverVehicleCertification",
    "RidePricingOverride",
    "RideProduct",
    "VehicleInventory",
    "VehicleType",
]
