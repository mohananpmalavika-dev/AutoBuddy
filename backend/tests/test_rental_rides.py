from datetime import datetime, timedelta, timezone

import pytest

from app.models.canonical_vehicle_model import supports_ride_type
from app.models.rental import (
    build_rental_booking_context,
    calculate_rental_final_fare,
    get_rental_package,
    list_rental_packages,
    rental_driver_eligibility,
    sanitize_rental_ride_for_response,
)
from app.models.ride_type_compatibility import (
    get_compatible_vehicles,
    get_fare_config,
    get_special_fields_for_ride_type,
    is_vehicle_compatible_with_ride_type,
)
from app.routers.ride_products import AdvancedBookingRequest, RideProduct, _driver_matches_service


def _rental_driver(**overrides):
    driver = {
        "is_available": True,
        "kyc_status": "approved",
        "vehicle_verified": True,
        "rating": 4.8,
        "rental_enabled": True,
        "current_location": {"latitude": 8.5241, "longitude": 76.9366},
        "vehicle_info": {
            "vehicle_type_id": "auto",
            "vehicle_verified": True,
            "accepted_ride_types": ["rental"],
        },
    }
    driver.update(overrides)
    return driver


def test_rental_package_catalog_and_context():
    auto_package = get_rental_package("auto", 4)
    taxi_full_day = get_rental_package("taxi", 12)

    assert auto_package["base_fare"] == 850.0
    assert auto_package["included_km"] == 40.0
    assert taxi_full_day["included_km"] == 180.0
    assert any(item["package_hours"] == 8 for item in list_rental_packages("auto"))

    context = build_rental_booking_context(
        vehicle_type="auto",
        package_hours=4,
        stops=[{"address": "Temple", "waiting_minutes": 30}],
    )
    assert context["estimated_fare"] == 850.0
    assert context["driver_filter"]["rental_enabled_required"] is True
    assert context["pickup_otp_status"] == "sent_to_passenger"

    sanitized = sanitize_rental_ride_for_response({"pickup_otp": "1234", "rental_details": {"pickup_otp": "5678"}})
    assert sanitized["pickup_otp"] == "sent_to_passenger"
    assert sanitized["rental_details"]["pickup_otp"] == "sent_to_passenger"


def test_rental_package_limits_and_final_fare_math():
    with pytest.raises(ValueError):
        get_rental_package("auto", 12)
    with pytest.raises(ValueError):
        get_rental_package("xl", 1)

    started_at = datetime(2026, 6, 8, 9, 0, tzinfo=timezone.utc)
    completed_at = started_at + timedelta(hours=4, minutes=30)
    fare = calculate_rental_final_fare(
        base_fare=850,
        package_hours=4,
        included_km=40,
        extra_km_rate=18,
        extra_15_min_rate=50,
        actual_distance_km=45,
        started_at=started_at,
        completed_at=completed_at,
    )

    assert fare["extra_minutes"] == 30.0
    assert fare["extra_15_min_blocks"] == 2.0
    assert fare["extra_time_charge"] == 100.0
    assert fare["extra_km"] == 5.0
    assert fare["extra_km_charge"] == 90.0
    assert fare["final_fare"] == 1040.0


def test_rental_driver_eligibility_and_ride_product_matching():
    assert rental_driver_eligibility(_rental_driver(), vehicle_type="auto", package_hours=4)["eligible"] is True

    accepted_only = _rental_driver(rental_enabled=False)
    accepted_only["vehicle_info"]["accepted_ride_types"] = ["rental_hourly"]
    assert rental_driver_eligibility(accepted_only, vehicle_type="auto", package_hours=4)["eligible"] is True

    assert rental_driver_eligibility(_rental_driver(rating=4.2), vehicle_type="auto", package_hours=4)["eligible"] is False
    unverified_vehicle = _rental_driver(vehicle_verified=False)
    unverified_vehicle["vehicle_info"]["vehicle_verified"] = False
    assert rental_driver_eligibility(unverified_vehicle, vehicle_type="auto", package_hours=4)["eligible"] is False

    assert _driver_matches_service(
        _rental_driver(),
        "auto",
        "",
        RideProduct.RENTAL_HOURLY,
        rental_package_hours=4,
    ) is True


def test_rental_ride_product_schema_and_vehicle_compatibility():
    payload = AdvancedBookingRequest(
        pickup_location={"latitude": 8.5241, "longitude": 76.9366, "district": "Trivandrum"},
        drop_location={"distance_km": 5},
        ride_product="rental_hourly",
        vehicle_type_id="auto",
        rental_hours=4,
        rental_stops=[{"address": "Hospital", "waiting_minutes": 20}],
    )

    assert payload.ride_product == RideProduct.RENTAL_HOURLY
    assert payload.rental_hours == 4
    assert "auto" in get_compatible_vehicles("rental")
    assert is_vehicle_compatible_with_ride_type("auto", "rental") is True
    assert supports_ride_type("auto", "rental") is True
    assert supports_ride_type("taxi", "rental") is True
    assert supports_ride_type("xl", "rental") is True
    assert get_fare_config("auto", "rental").minimum_hours == 1
    assert "rental_package_hours" in get_special_fields_for_ride_type("rental")
