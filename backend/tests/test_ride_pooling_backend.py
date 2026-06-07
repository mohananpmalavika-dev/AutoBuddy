from datetime import timedelta

from app.routers import ride_pooling_backend as pooling


def passenger_user(user_id="passenger_1"):
    return {"user_id": user_id, "user_type": "passenger"}


def driver_user(user_id="driver_1"):
    return {"user_id": user_id, "user_type": "driver"}


def pool_payload(**overrides):
    payload = {
        "pickup": {"address": "Kazhakkoottam, Thiruvananthapuram", "latitude": 8.568, "longitude": 76.873},
        "dropoff": {"address": "Technopark, Thiruvananthapuram", "latitude": 8.558, "longitude": 76.881},
        "pickup_zone": "kazhakkoottam",
        "dropoff_zone": "technopark",
        "max_wait_minutes": 10,
        "max_passengers": 4,
        "estimated_fare": 120,
    }
    payload.update(overrides)
    return payload


def test_builds_passenger_created_pool_model_fields():
    pool = pooling.build_pool_document(
        pooling.POOL_MODEL_PASSENGER_CREATED,
        pool_payload(),
        passenger_user(),
        initial_passenger=True,
    )

    assert pool["pool_model"] == pooling.POOL_MODEL_PASSENGER_CREATED
    assert pool["created_by_user_id"] == "passenger_1"
    assert pool["created_by_driver_id"] is None
    assert pool["passengers"] == ["passenger_1"]
    assert pool["pickup_zone"] == "kazhakkoottam"
    assert pool["dropoff_zone"] == "technopark"


def test_builds_driver_created_pool_without_initial_passenger():
    pool = pooling.build_pool_document(
        pooling.POOL_MODEL_DRIVER_CREATED,
        pool_payload(route_polyline="encoded-route"),
        driver_user(),
        initial_passenger=False,
    )

    assert pool["pool_model"] == pooling.POOL_MODEL_DRIVER_CREATED
    assert pool["created_by_driver_id"] == "driver_1"
    assert pool["driver_id"] == "driver_1"
    assert pool["passengers"] == []
    assert pool["route_polyline"] == "encoded-route"


def test_system_pool_compatibility_uses_pickup_and_dropoff_zones():
    pool = pooling.build_pool_document(
        pooling.POOL_MODEL_SYSTEM_CREATED,
        pool_payload(),
        passenger_user(),
        initial_passenger=True,
    )
    request_pickup = pooling.normalize_location("Kazhakkoottam, Thiruvananthapuram", "Pickup")
    request_dropoff = pooling.normalize_location("Technopark Phase 1, Thiruvananthapuram", "Dropoff")
    detail = pooling.passenger_detail(
        "passenger_2",
        pool_payload(pickup_zone="kazhakkoottam", dropoff_zone="technopark"),
        request_pickup,
        request_dropoff,
    )

    assert pooling.is_compatible_pool(pool, detail, "passenger_2")


def test_system_pool_rejects_expired_or_full_pool():
    pool = pooling.build_pool_document(
        pooling.POOL_MODEL_SYSTEM_CREATED,
        pool_payload(max_passengers=1),
        passenger_user(),
        initial_passenger=True,
    )
    detail = pooling.passenger_detail(
        "passenger_2",
        pool_payload(),
        pooling.normalize_location("Kazhakkoottam", "Pickup"),
        pooling.normalize_location("Technopark", "Dropoff"),
    )

    assert not pooling.is_compatible_pool(pool, detail, "passenger_2")

    pool["max_passengers"] = 4
    pool["expires_at"] = pooling.utcnow() - timedelta(minutes=1)
    assert not pooling.is_compatible_pool(pool, detail, "passenger_2")


def test_serialized_pool_keeps_legacy_fields_for_mobile_client():
    pool = pooling.build_pool_document(
        pooling.POOL_MODEL_SYSTEM_CREATED,
        pool_payload(discount_percentage=25),
        passenger_user(),
        initial_passenger=True,
    )

    serialized = pooling.serialize_pool(pool)

    assert serialized["pool_model"] == pooling.POOL_MODEL_SYSTEM_CREATED
    assert serialized["current_passengers"] == 1
    assert serialized["passengers_count"] == 1
    assert serialized["pickup_location"] == "Kazhakkoottam, Thiruvananthapuram"
    assert serialized["dropoff_location"] == "Technopark, Thiruvananthapuram"
    assert serialized["fare_per_passenger"] == 90
