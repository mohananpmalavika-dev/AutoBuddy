import asyncio

from app.models.canonical_vehicle_model import supports_ride_type
from app.models.enhanced_booking_models import RideType
from app.models.ride_type_compatibility import (
    get_compatible_vehicles,
    get_fare_config,
    get_ride_type_multiplier,
    get_special_fields_for_ride_type,
    is_vehicle_compatible_with_ride_type,
)
from app.models.ride_types_model import DEFAULT_RIDE_TYPES, RideTypeEnum
from app.routers.ride_products import (
    AdvancedBookingRequest,
    RIDE_PRODUCT_CONFIG_VERSION,
    RIDE_TYPE_COMPATIBILITY_ALIASES,
    RideProduct,
    _default_ride_product_config,
    _get_ride_product_config,
    _product_label,
    _product_multiplier,
)


def test_pet_ride_product_defaults_and_request_schema():
    assert RideProduct.PET.value == "pet"
    assert RIDE_TYPE_COMPATIBILITY_ALIASES["pet"] == "pet"
    assert _product_multiplier(RideProduct.PET) == 1.18
    assert _product_label(RideProduct.PET) == "Pet Rides"
    default_config = _default_ride_product_config()
    assert default_config["catalog_version"] == RIDE_PRODUCT_CONFIG_VERSION
    assert "pet" in default_config["default_enabled_products"]

    payload = AdvancedBookingRequest(
        pickup_location={"latitude": 9.9312, "longitude": 76.2673},
        drop_location={"latitude": 9.9646, "longitude": 76.2764},
        ride_product="pet",
        pet_type="dog",
        pet_count=2,
        pet_carrier_required=True,
    )

    assert payload.ride_product == RideProduct.PET
    assert payload.pet_type == "dog"
    assert payload.pet_count == 2
    assert payload.pet_carrier_required is True


def test_pet_ride_type_vehicle_compatibility_and_fares():
    assert set(get_compatible_vehicles("pet")) == {"auto", "taxi", "xl"}
    assert is_vehicle_compatible_with_ride_type("auto", "pet") is True
    assert is_vehicle_compatible_with_ride_type("taxi", "pet") is True
    assert is_vehicle_compatible_with_ride_type("xl", "pet") is True
    assert is_vehicle_compatible_with_ride_type("traveller", "pet") is False
    assert is_vehicle_compatible_with_ride_type("truck", "pet") is False
    assert get_ride_type_multiplier("pet") == 1.18
    assert get_fare_config("taxi", "pet") == {"multiplier": 1.18}
    assert get_fare_config("traveller", "pet") is None
    assert get_special_fields_for_ride_type("pet") == [
        "pet_type",
        "pet_count",
        "pet_carrier_required",
    ]


def test_pet_ride_defaults_are_available_to_legacy_booking_paths():
    assert RideType.PET.value == "pet"
    assert RideTypeEnum.PET.value == "pet"
    assert any(ride_type["_id"] == "pet" for ride_type in DEFAULT_RIDE_TYPES)
    assert supports_ride_type("auto", "pet") is True
    assert supports_ride_type("taxi", "pet") is True
    assert supports_ride_type("xl", "pet") is True
    assert supports_ride_type("traveller", "pet") is False


def test_old_ride_product_config_is_upgraded_with_pet_enabled_once():
    class FakeRideProductConfigCollection:
        def __init__(self):
            self.doc = {
                "id": "district_ride_products",
                "default_enabled_products": ["normal", "pool"],
                "district_rules": [],
                "catalog_version": 1,
            }
            self.updated = None

        async def find_one(self, *_args, **_kwargs):
            return self.doc

        async def update_one(self, *_args, **_kwargs):
            self.updated = _kwargs or _args

    class FakeDb:
        def __init__(self):
            self.ride_product_config = FakeRideProductConfigCollection()

    db = FakeDb()
    config = asyncio.run(_get_ride_product_config(db))

    assert config["catalog_version"] == RIDE_PRODUCT_CONFIG_VERSION
    assert config["default_enabled_products"] == ["normal", "pool", "pet"]
    assert db.ride_product_config.updated is not None
