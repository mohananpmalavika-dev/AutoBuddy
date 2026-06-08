from app.models.canonical_vehicle_model import supports_ride_type
from app.models.enhanced_booking_models import RideType, WomenOnlyDetails
from app.models.ride_type_compatibility import (
    get_compatible_vehicles,
    get_fare_config,
    get_ride_type_multiplier,
    get_special_fields_for_ride_type,
    is_vehicle_compatible_with_ride_type,
)
from app.models.ride_types_model import DEFAULT_RIDE_TYPES, RideTypeEnum
from app.models.women_only import (
    build_women_only_safety_context,
    calculate_women_only_fare,
    is_women_only_passenger_allowed,
    sanitize_women_only_ride_for_response,
    women_only_driver_eligibility,
)
from app.routers.ride_products import AdvancedBookingRequest, RideProduct, _driver_matches_service


def _safe_driver(**overrides):
    driver = {
        "is_available": True,
        "gender": "female",
        "kyc_status": "approved",
        "police_verified": True,
        "rating": 4.9,
        "safety_score": 98,
        "active_complaints": 0,
        "current_location": {"latitude": 8.5241, "longitude": 76.9366},
        "vehicle_info": {
            "vehicle_type_id": "taxi",
            "vehicle_subtype_id": "taxi_sedan",
            "accepted_ride_types": ["instant"],
        },
    }
    driver.update(overrides)
    return driver


def test_women_only_fare_context_and_response_sanitization():
    assert calculate_women_only_fare(5, "auto") == 145.0
    assert calculate_women_only_fare(5, "taxi") == 255.0
    assert is_women_only_passenger_allowed("female") is True
    assert is_women_only_passenger_allowed("male") is False

    context = build_women_only_safety_context(
        passenger_gender="female",
        guardian_name="Asha",
        guardian_phone="9999999999",
        female_driver_required=False,
        allow_trusted_male_driver_if_unavailable=True,
    )
    assert context["passenger_allowed"] is True
    assert context["guardian"]["live_tracking_enabled"] is True
    assert context["pickup_otp_required"] is True
    assert context["driver_filter"]["min_rating"] == 4.7
    assert context["driver_filter"]["min_safety_score"] == 90.0

    sanitized = sanitize_women_only_ride_for_response({"women_only_details": context, "pickup_otp": "1234"})
    assert sanitized["pickup_otp"] == "sent_to_passenger"
    assert sanitized["women_only_details"]["pickup_otp"] == "sent_to_passenger"


def test_women_only_driver_eligibility_rules():
    assert women_only_driver_eligibility(_safe_driver())["eligible"] is True

    male_driver = _safe_driver(gender="male", trusted_safety_driver=True, safety_score=99)
    assert women_only_driver_eligibility(male_driver)["eligible"] is False
    assert women_only_driver_eligibility(
        male_driver,
        female_driver_required=False,
        allow_trusted_male_driver_if_unavailable=True,
    )["eligible"] is True

    assert women_only_driver_eligibility(_safe_driver(rating=4.5))["eligible"] is False
    assert women_only_driver_eligibility(_safe_driver(active_complaints=1))["eligible"] is False
    assert women_only_driver_eligibility(_safe_driver(active_complaints=None, open_safety_complaints=1))["eligible"] is False
    assert women_only_driver_eligibility(_safe_driver(police_verified=False))["eligible"] is False


def test_women_only_ride_product_schema_and_matching():
    payload = AdvancedBookingRequest(
        pickup_location={"latitude": 8.5241, "longitude": 76.9366, "district": "Trivandrum"},
        drop_location={"latitude": 8.4004, "longitude": 76.9787},
        ride_product="women_only",
        vehicle_type_id="taxi",
        vehicle_subtype_id="taxi_sedan",
        passenger_gender="female",
        women_only_female_driver_required=False,
        women_only_allow_trusted_male_driver=True,
        women_only_guardian_name="Asha",
        women_only_guardian_phone="9999999999",
    )

    assert payload.ride_product == RideProduct.WOMEN_ONLY
    assert payload.women_only_allow_trusted_male_driver is True
    assert _driver_matches_service(
        _safe_driver(),
        "taxi",
        "taxi_sedan",
        RideProduct.WOMEN_ONLY,
    ) is True
    assert _driver_matches_service(
        _safe_driver(gender="male", trusted_safety_driver=True, safety_score=99),
        "taxi",
        "taxi_sedan",
        RideProduct.WOMEN_ONLY,
        women_only_female_driver_required=False,
        women_only_allow_trusted_male_driver=True,
    ) is True


def test_women_only_vehicle_compatibility_and_defaults():
    assert set(get_compatible_vehicles("women_only")) == {"auto", "ev_auto", "taxi", "xl"}
    assert is_vehicle_compatible_with_ride_type("auto", "women_only") is True
    assert is_vehicle_compatible_with_ride_type("taxi", "women_only") is True
    assert is_vehicle_compatible_with_ride_type("traveller", "women_only") is False
    assert get_ride_type_multiplier("women_only") == 1.15
    assert get_fare_config("taxi", "women_only")["multiplier"] == 1.15
    assert "women_only_guardian_phone" in get_special_fields_for_ride_type("women_only")

    assert RideType.WOMEN_ONLY.value == "women_only"
    assert RideTypeEnum.WOMEN_ONLY.value == "women_only"
    assert WomenOnlyDetails(passenger_gender="female").female_driver_required is True
    assert any(ride_type["_id"] == "women_only" for ride_type in DEFAULT_RIDE_TYPES)
    assert supports_ride_type("auto", "women_only") is True
    assert supports_ride_type("taxi", "women_only") is True
    assert supports_ride_type("traveller", "women_only") is False
