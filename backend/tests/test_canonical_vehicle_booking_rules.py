from pathlib import Path
import sys

import pytest
from fastapi import HTTPException

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.bookings_extended import _validate_vehicle_constraints
from app.services.fare_calculation_service import calculate_complete_fare


def test_fare_calculation_uses_db_fare_config_override():
    result = calculate_complete_fare(
        vehicle_type_id="taxi",
        ride_type="instant",
        pickup_lat=10.0,
        pickup_lon=76.0,
        dropoff_lat=10.01,
        dropoff_lon=76.01,
        vehicle_multiplier_override=1.0,
        fare_config_override={
            "base": {
                "base_fare": 1000,
                "per_km_rate": 0,
                "per_minute_rate": 0,
                "minimum_fare": 1000,
            },
            "instant": {"multiplier": 1},
        },
    )

    assert result["success"] is True
    assert result["base_fare"] == 1000
    assert result["total_fare"] == 1050


def test_goods_weight_cannot_exceed_selected_subtype_capacity():
    vehicle = {
        "vehicle_type_id": "minitruck",
        "goods_supported": True,
        "passenger_supported": False,
        "capacity": 1000,
        "capacity_unit": "kg",
        "subtypes": [{"id": "minitruck_500kg", "capacity": 500}],
    }

    with pytest.raises(HTTPException) as exc:
        _validate_vehicle_constraints(
            vehicle=vehicle,
            ride_type="goods",
            subtype_id="minitruck_500kg",
            passenger_count=1,
            goods_weight_kg=750,
        )

    assert exc.value.status_code == 400
    assert "capacity" in exc.value.detail


def test_passenger_count_uses_subtype_capacity():
    vehicle = {
        "vehicle_type_id": "traveller",
        "goods_supported": False,
        "passenger_supported": True,
        "capacity": 8,
        "capacity_unit": "passengers",
        "subtypes": [{"id": "traveller_6seat", "capacity": 6}],
    }

    with pytest.raises(HTTPException) as exc:
        _validate_vehicle_constraints(
            vehicle=vehicle,
            ride_type="instant",
            subtype_id="traveller_6seat",
            passenger_count=7,
            goods_weight_kg=None,
        )

    assert exc.value.status_code == 400
    assert "Passenger count" in exc.value.detail
