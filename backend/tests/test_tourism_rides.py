from app.models.canonical_vehicle_model import supports_ride_type
from app.models.enhanced_booking_models import RideType, TourismDetails
from app.models.ride_type_compatibility import (
    get_compatible_vehicles,
    get_fare_config,
    get_ride_type_multiplier,
    get_special_fields_for_ride_type,
    is_vehicle_compatible_with_ride_type,
)
from app.models.ride_types_model import DEFAULT_RIDE_TYPES, RideTypeEnum
from app.models.tourism import (
    attractions_for_city,
    build_tourism_route,
    calculate_tourism_fare,
    get_tourism_package,
    list_tourism_packages,
    tourism_driver_eligibility,
)
from app.routers.ride_products import (
    AdvancedBookingRequest,
    RideProduct,
    _build_tourism_booking_context,
    _driver_has_tourism_capability,
    _driver_matches_service,
    _product_label,
    _product_multiplier,
)


def test_tourism_package_catalog_fare_and_route():
    packages = list_tourism_packages(city="Trivandrum", package_type="full_day")
    package = get_tourism_package("PKG_TRV_HERITAGE")

    assert package["name"] == "Trivandrum Heritage Tour"
    assert package in packages
    assert any(item["name"] == "Kovalam Beach" for item in attractions_for_city("Trivandrum"))
    assert calculate_tourism_fare(1800, "taxi", 5, guide=True) == 3320.0

    route = build_tourism_route(city="Trivandrum", package_id="PKG_TRV_HERITAGE")
    assert route["city"] == "Trivandrum"
    assert "Padmanabhaswamy Temple" in route["stops"]
    assert route["timeline"]["08:00"] == "Pickup"
    assert route["entry_fees"] >= 0


def test_tourism_ride_product_schema_and_context():
    assert RideProduct.TOURISM.value == "tourism"
    assert _product_multiplier(RideProduct.TOURISM) == 1.85
    assert _product_label(RideProduct.TOURISM) == "Tourism Ride"

    payload = AdvancedBookingRequest(
        pickup_location={"latitude": 8.5241, "longitude": 76.9366, "district": "Trivandrum"},
        drop_location={"latitude": 8.4004, "longitude": 76.9787},
        ride_product="tourism",
        vehicle_type_id="taxi",
        vehicle_subtype_id="taxi_sedan",
        tourism_package_id="PKG_TRV_HERITAGE",
        tourism_package_type="full_day",
        tourism_city="Trivandrum",
        tourism_language_preference="English",
        tourism_guide_required=True,
        passenger_count=5,
    )

    context = _build_tourism_booking_context(
        package_id=payload.tourism_package_id,
        package_type=payload.tourism_package_type,
        city=payload.tourism_city,
        custom_stops=payload.tourism_custom_stops,
        vehicle_type=payload.vehicle_type_id,
        passengers_count=payload.passenger_count,
        guide_required=payload.tourism_guide_required,
    )

    assert payload.ride_product == RideProduct.TOURISM
    assert context["package"]["id"] == "PKG_TRV_HERITAGE"
    assert context["city"] == "Trivandrum"
    assert context["fare"] == 3320.0
    assert context["add_ons"]["guide"] is True


def test_tourism_vehicle_compatibility_and_defaults():
    assert set(get_compatible_vehicles("tourism")) == {"auto", "taxi", "xl", "traveller", "bus"}
    assert is_vehicle_compatible_with_ride_type("auto", "tourism") is True
    assert is_vehicle_compatible_with_ride_type("taxi", "tourism") is True
    assert is_vehicle_compatible_with_ride_type("xl", "tourism") is True
    assert is_vehicle_compatible_with_ride_type("traveller", "tourism") is True
    assert is_vehicle_compatible_with_ride_type("minitruck", "tourism") is False
    assert get_ride_type_multiplier("tourism") == 1.5
    assert get_fare_config("auto", "tourism").hourly_rate == 450.0
    assert "tourism_package_id" in get_special_fields_for_ride_type("tourism")

    assert RideType.TOURISM.value == "tourism"
    assert RideTypeEnum.TOURISM.value == "tourism"
    assert TourismDetails(tour_hours=8, city="Kochi").city == "Kochi"
    assert any(ride_type["_id"] == "tourism" for ride_type in DEFAULT_RIDE_TYPES)
    assert supports_ride_type("auto", "tourism") is True
    assert supports_ride_type("taxi", "tourism") is True
    assert supports_ride_type("xl", "tourism") is True


def test_tourism_driver_matching_requires_package_rules():
    tourism_driver = {
        "kyc_status": "approved",
        "tourism_enabled": True,
        "tourism_rating": 4.9,
        "languages": ["English", "Malayalam", "Tamil"],
        "district": "Trivandrum",
        "vehicle_info": {
            "vehicle_type_id": "taxi",
            "vehicle_subtype_id": "taxi_sedan",
            "accepted_ride_types": ["tourism"],
        },
    }
    low_rating_driver = {**tourism_driver, "tourism_rating": 4.2}
    wrong_city_driver = {**tourism_driver, "district": "Kochi"}
    plain_driver = {
        "kyc_status": "approved",
        "rating": 4.9,
        "languages": ["English"],
        "district": "Trivandrum",
        "vehicle_info": {"vehicle_type_id": "taxi"},
    }

    assert tourism_driver_eligibility(tourism_driver, city="Trivandrum", language="English")["eligible"] is True
    assert _driver_has_tourism_capability(tourism_driver, city="Trivandrum", language="English") is True
    assert _driver_matches_service(
        tourism_driver,
        "taxi",
        "taxi_sedan",
        RideProduct.TOURISM,
        tourism_city="Trivandrum",
        tourism_language_preference="English",
    ) is True
    assert _driver_has_tourism_capability(low_rating_driver, city="Trivandrum", language="English") is False
    assert _driver_has_tourism_capability(wrong_city_driver, city="Trivandrum", language="English") is False
    assert _driver_matches_service(
        plain_driver,
        "taxi",
        "",
        RideProduct.TOURISM,
        tourism_city="Trivandrum",
        tourism_language_preference="English",
    ) is False
