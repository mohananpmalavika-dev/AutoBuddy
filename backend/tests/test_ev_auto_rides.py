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
    _driver_has_ev_auto_capability,
    _driver_matches_service,
    _product_label,
    _product_multiplier,
)


def test_ev_auto_ride_product_schema_and_alias():
    assert RideProduct.EV_AUTO.value == "ev_auto"
    assert RIDE_TYPE_COMPATIBILITY_ALIASES["ev_auto"] == "ev_auto"
    assert _product_multiplier(RideProduct.EV_AUTO) == 1.05
    assert _product_label(RideProduct.EV_AUTO) == "EV Auto"

    payload = AdvancedBookingRequest(
        pickup_location={"latitude": 8.8932, "longitude": 76.6141},
        drop_location={"latitude": 8.9012, "longitude": 76.6201},
        ride_product="ev_auto",
        vehicle_type_id="auto",
        vehicle_subtype_id="auto_standard",
    )

    assert payload.ride_product == RideProduct.EV_AUTO
    assert payload.vehicle_type_id == "auto"


def test_ev_auto_vehicle_compatibility_and_fares():
    assert set(get_compatible_vehicles("ev_auto")) == {"auto", "ev_auto"}
    assert is_vehicle_compatible_with_ride_type("auto", "ev_auto") is True
    assert is_vehicle_compatible_with_ride_type("ev_auto", "ev_auto") is True
    assert is_vehicle_compatible_with_ride_type("taxi", "ev_auto") is False
    assert is_vehicle_compatible_with_ride_type("truck", "ev_auto") is False
    assert get_ride_type_multiplier("ev_auto") == 1.05
    assert get_fare_config("auto", "ev_auto") == {"multiplier": 1.05}
    assert get_fare_config("ev_auto", "ev_auto") == {"multiplier": 1.0}
    assert get_fare_config("taxi", "ev_auto") is None
    assert get_special_fields_for_ride_type("ev_auto") == ["ev_auto_required"]


def test_ev_auto_defaults_are_available_to_legacy_booking_paths():
    assert RideType.EV_AUTO.value == "ev_auto"
    assert RideTypeEnum.EV_AUTO.value == "ev_auto"
    assert any(ride_type["_id"] == "ev_auto" for ride_type in DEFAULT_RIDE_TYPES)
    assert supports_ride_type("auto", "ev_auto") is True
    assert supports_ride_type("ev_auto", "ev_auto") is True
    assert supports_ride_type("taxi", "ev_auto") is False


def test_ev_auto_driver_matching_requires_ev_signal():
    ev_accepting_auto_driver = {
        "vehicle_info": {
            "vehicle_type_id": "auto",
            "vehicle_subtype_id": "auto_standard",
            "accepted_ride_types": ["ev_auto"],
        }
    }
    electric_auto_driver = {
        "vehicle_info": {
            "vehicle_type_id": "ev_auto",
            "vehicle_subtype_id": "ev_auto_standard",
        }
    }
    plain_auto_driver = {
        "vehicle_info": {
            "vehicle_type_id": "auto",
            "vehicle_subtype_id": "auto_standard",
            "accepted_ride_types": ["normal"],
        }
    }

    assert _driver_has_ev_auto_capability(ev_accepting_auto_driver) is True
    assert _driver_has_ev_auto_capability(electric_auto_driver) is True
    assert _driver_has_ev_auto_capability(plain_auto_driver) is False
    assert _driver_matches_service(ev_accepting_auto_driver, "auto", "auto_standard", RideProduct.EV_AUTO) is True
    assert _driver_matches_service(electric_auto_driver, "auto", "", RideProduct.EV_AUTO) is True
    assert _driver_matches_service(plain_auto_driver, "auto", "auto_standard", RideProduct.EV_AUTO) is False
