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
    RIDE_TYPE_COMPATIBILITY_ALIASES,
    RideProduct,
    _product_label,
    _product_multiplier,
)


def test_intercity_ride_product_schema_and_alias():
    assert RideProduct.INTERCITY.value == "intercity"
    assert RIDE_TYPE_COMPATIBILITY_ALIASES["intercity"] == "intercity"
    assert _product_multiplier(RideProduct.INTERCITY) == 1.60
    assert _product_label(RideProduct.INTERCITY) == "Intercity Booking"

    payload = AdvancedBookingRequest(
        pickup_location={"latitude": 8.8932, "longitude": 76.6141},
        drop_location={"latitude": 9.9312, "longitude": 76.2673},
        ride_product="intercity",
        vehicle_type_id="taxi",
        vehicle_subtype_id="taxi_sedan",
        intercity_return_trip=True,
        intercity_wait_hours=6,
        intercity_tolls_included=False,
        intercity_route_notes="NH route via Alappuzha",
    )

    assert payload.ride_product == RideProduct.INTERCITY
    assert payload.intercity_return_trip is True
    assert payload.intercity_wait_hours == 6
    assert payload.intercity_tolls_included is False
    assert payload.intercity_route_notes == "NH route via Alappuzha"


def test_intercity_ride_type_vehicle_compatibility_and_fares():
    assert set(get_compatible_vehicles("intercity")) == {"taxi", "xl", "traveller"}
    assert is_vehicle_compatible_with_ride_type("taxi", "intercity") is True
    assert is_vehicle_compatible_with_ride_type("xl", "intercity") is True
    assert is_vehicle_compatible_with_ride_type("traveller", "intercity") is True
    assert is_vehicle_compatible_with_ride_type("auto", "intercity") is False
    assert is_vehicle_compatible_with_ride_type("truck", "intercity") is False
    assert get_ride_type_multiplier("intercity") == 1.6
    assert get_fare_config("taxi", "intercity") == {"multiplier": 1.6}
    assert get_fare_config("xl", "intercity") == {"multiplier": 1.75}
    assert get_fare_config("traveller", "intercity") == {"multiplier": 1.9}
    assert get_fare_config("auto", "intercity") is None
    assert get_special_fields_for_ride_type("intercity") == [
        "intercity_return_trip",
        "intercity_wait_hours",
        "intercity_tolls_included",
        "intercity_route_notes",
    ]


def test_intercity_defaults_are_available_to_legacy_booking_paths():
    assert RideType.INTERCITY.value == "intercity"
    assert RideTypeEnum.INTERCITY.value == "intercity"
    assert any(ride_type["_id"] == "intercity" for ride_type in DEFAULT_RIDE_TYPES)
    assert supports_ride_type("taxi", "intercity") is True
    assert supports_ride_type("xl", "intercity") is True
    assert supports_ride_type("traveller", "intercity") is True
    assert supports_ride_type("auto", "intercity") is False
