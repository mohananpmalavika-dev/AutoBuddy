import asyncio
import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.models.canonical_vehicle_model import CANONICAL_VEHICLES_COLLECTION
from app.routers.operator_portal import (
    OPERATOR_FLEET_VEHICLES_COLLECTION,
    OPERATOR_PROFILES_COLLECTION,
    OPERATOR_ASSIGNMENT_HISTORY_COLLECTION,
    OperatorProfileUpdate,
    OperatorVehiclePayload,
    OperatorStatusPayload,
    assign_operator_vehicle_driver,
    create_operator_vehicle,
    delete_operator_vehicle,
    get_operator_dashboard,
    get_operator_profile,
    get_operator_vehicle,
    list_operator_assignments,
    list_operator_drivers,
    list_operators,
    update_operator_profile,
    update_operator_status,
    update_operator_vehicle,
    unassign_operator_vehicle_driver,
)


def make_cursor(results):
    cursor = AsyncMock()
    cursor.sort.return_value = cursor
    cursor.to_list = AsyncMock(return_value=results)
    return cursor


def async_test(func):
    def wrapper(*args, **kwargs):
        return asyncio.run(func(*args, **kwargs))
    return wrapper


@async_test
async def test_operator_vehicle_create_assign_unassign_syncs_driver_vehicles_and_audit():
    operator_id = "operator-abc"
    vehicle_id = str(uuid.uuid4())
    driver_id = "driver-xyz"
    current_user = {"id": operator_id, "role": "operator", "name": "Fleet Boss", "email": "boss@example.com"}

    # Create collection mocks for direct db access.
    collections = {
        OPERATOR_PROFILES_COLLECTION: MagicMock(),
        OPERATOR_FLEET_VEHICLES_COLLECTION: MagicMock(),
        CANONICAL_VEHICLES_COLLECTION: MagicMock(),
        "users": MagicMock(),
        "driver_vehicles": MagicMock(),
        "drivers": MagicMock(),
        OPERATOR_ASSIGNMENT_HISTORY_COLLECTION: MagicMock(),
    }

    db = MagicMock()
    db.__getitem__.side_effect = lambda name: collections[name]
    db.users = collections["users"]
    db.driver_vehicles = collections["driver_vehicles"]
    db.drivers = collections["drivers"]

    # Setup canonical vehicle lookup
    canonical_vehicle = {
        "vehicle_type_id": "sedan",
        "name": "Sedan",
        "icon": "car",
        "capacity_unit": "passengers",
        "capacity": 4,
        "active": True,
        "subtypes": [],
    }
    collections[CANONICAL_VEHICLES_COLLECTION].find_one = AsyncMock(return_value=canonical_vehicle)

    # Operator profile ensure/update
    collections[OPERATOR_PROFILES_COLLECTION].update_one = AsyncMock()
    collections[OPERATOR_PROFILES_COLLECTION].find_one = AsyncMock(return_value={"operator_id": operator_id})

    # No duplicate vehicle on creation
    collections[OPERATOR_FLEET_VEHICLES_COLLECTION].find_one = AsyncMock(return_value=None)
    collections[OPERATOR_FLEET_VEHICLES_COLLECTION].insert_one = AsyncMock()
    collections[OPERATOR_FLEET_VEHICLES_COLLECTION].update_one = AsyncMock()

    payload = OperatorVehiclePayload(
        make="Toyota",
        model="Camry",
        year=2024,
        color="White",
        license_plate="ab12cd3456",
        registration_number="AB12CD3456",
        seating_capacity=4,
        vehicle_type_id="sedan",
        service_regions=["all"],
    )

    created = await create_operator_vehicle(payload, current_user=current_user, db=db)
    assert created["vehicle"]["operator_id"] == operator_id
    assert created["vehicle"]["license_plate"] == "AB12CD3456"
    assert created["vehicle"]["vehicle_type_name"] == "Sedan"
    collections[OPERATOR_FLEET_VEHICLES_COLLECTION].insert_one.assert_awaited_once()

    # Assign driver to vehicle
    vehicle_before_assign = {
        "id": vehicle_id,
        "operator_id": operator_id,
        "license_plate": "AB12CD3456",
        "vehicle_type_id": "sedan",
        "vehicle_type_name": "Sedan",
        "vehicle_subtype_id": None,
        "vehicle_subtype_name": None,
        "vehicle_icon": "car",
        "capacity_unit": "passengers",
        "capacity": 4,
        "seating_capacity": 4,
        "assigned_driver_id": None,
        "active": True,
    }
    vehicle_after_assign = {**vehicle_before_assign, "assigned_driver_id": driver_id}
    collections[OPERATOR_FLEET_VEHICLES_COLLECTION].find_one = AsyncMock(side_effect=[vehicle_before_assign, vehicle_after_assign])

    driver = {"id": driver_id, "role": "driver", "name": "Driver One", "phone": "+911234567890"}
    collections["users"].find_one = AsyncMock(return_value=driver)
    collections["driver_vehicles"].find_one = AsyncMock(side_effect=[None, None])
    collections["driver_vehicles"].update_one = AsyncMock()
    collections["drivers"].update_one = AsyncMock()
    collections[OPERATOR_ASSIGNMENT_HISTORY_COLLECTION].insert_one = AsyncMock()

    assign_payload = type("P", (), {"driver_id": driver_id, "driver_email": None, "driver_phone": None})
    assigned = await assign_operator_vehicle_driver(
        vehicle_id=vehicle_id,
        payload=assign_payload,
        current_user=current_user,
        db=db,
    )

    assert assigned["vehicle"]["assigned_driver_id"] == driver_id
    collections[OPERATOR_FLEET_VEHICLES_COLLECTION].update_one.assert_awaited()
    collections["driver_vehicles"].update_one.assert_awaited_once()
    collections[OPERATOR_ASSIGNMENT_HISTORY_COLLECTION].insert_one.assert_awaited_once()
    collections["drivers"].update_one.assert_awaited_once()

    # Unassign driver from vehicle
    collections[OPERATOR_FLEET_VEHICLES_COLLECTION].find_one = AsyncMock(return_value={
        "id": vehicle_id,
        "operator_id": operator_id,
        "license_plate": "AB12CD3456",
        "vehicle_type_id": "sedan",
        "assigned_driver_id": driver_id,
        "active": True,
    })
    collections["driver_vehicles"].find_one = AsyncMock(return_value={"is_active": True})
    collections["driver_vehicles"].delete_one = AsyncMock()
    collections["driver_vehicles"].update_many = AsyncMock()
    collections["drivers"].update_one = AsyncMock()
    collections[OPERATOR_ASSIGNMENT_HISTORY_COLLECTION].insert_one = AsyncMock()

    unassigned = await unassign_operator_vehicle_driver(
        vehicle_id=vehicle_id,
        current_user=current_user,
        db=db,
    )

    assert unassigned["vehicle"]["assigned_driver_id"] is None
    collections["driver_vehicles"].delete_one.assert_awaited_once()
    collections[OPERATOR_ASSIGNMENT_HISTORY_COLLECTION].insert_one.assert_awaited_once()
    collections[OPERATOR_FLEET_VEHICLES_COLLECTION].update_one.assert_awaited()


@async_test
async def test_operator_profile_get_and_update():
    operator_id = "operator-abc"
    current_user = {"id": operator_id, "role": "operator", "name": "Fleet Boss", "email": "boss@example.com"}

    collections = {
        OPERATOR_PROFILES_COLLECTION: MagicMock(),
    }
    db = MagicMock()
    db.__getitem__.side_effect = lambda name: collections[name]

    default_profile = {"operator_id": operator_id, "company_name": "Fleet Boss Fleet"}
    updated_profile = {"operator_id": operator_id, "company_name": "New Fleet Name"}
    collections[OPERATOR_PROFILES_COLLECTION].update_one = AsyncMock()
    collections[OPERATOR_PROFILES_COLLECTION].find_one = AsyncMock(side_effect=[default_profile, updated_profile])

    payload = OperatorProfileUpdate(company_name="New Fleet Name")
    result = await update_operator_profile(payload, current_user=current_user, db=db)

    assert result["profile"]["company_name"] == "New Fleet Name"
    assert collections[OPERATOR_PROFILES_COLLECTION].update_one.await_count == 2
    collections[OPERATOR_PROFILES_COLLECTION].find_one.assert_awaited()


@async_test
async def test_operator_dashboard_summary_and_bookings():
    operator_id = "operator-abc"
    current_user = {"id": operator_id, "role": "operator", "name": "Fleet Boss", "email": "boss@example.com"}
    collections = {
        OPERATOR_PROFILES_COLLECTION: MagicMock(),
        OPERATOR_FLEET_VEHICLES_COLLECTION: MagicMock(),
        "bookings": MagicMock(),
    }
    db = MagicMock()
    db.__getitem__.side_effect = lambda name: collections[name]
    db.bookings = collections["bookings"]

    collections[OPERATOR_PROFILES_COLLECTION].update_one = AsyncMock()
    collections[OPERATOR_PROFILES_COLLECTION].find_one = AsyncMock(return_value={"operator_id": operator_id})
    collections[OPERATOR_FLEET_VEHICLES_COLLECTION].find = MagicMock(return_value=make_cursor([
        {"id": "v1", "operator_id": operator_id, "assigned_driver_id": "d1", "active": True},
        {"id": "v2", "operator_id": operator_id, "active": False},
    ]))
    collections["bookings"].find = MagicMock(return_value=make_cursor([
        {"id": "b1", "final_fare": 120, "status": "completed"},
        {"id": "b2", "estimated_fare": 80, "status": "COMPLETED"},
    ]))

    result = await get_operator_dashboard(current_user=current_user, db=db)

    assert result["summary"]["total_vehicles"] == 2
    assert result["summary"]["active_vehicles"] == 1
    assert result["summary"]["assigned_vehicles"] == 1
    assert result["summary"]["drivers"] == 1
    assert result["summary"]["completed_rides"] == 2
    assert result["summary"]["gross_earnings"] == 200.0
    assert len(result["recent_bookings"]) == 2


@async_test
async def test_list_operator_drivers_returns_assigned_driver_contacts():
    operator_id = "operator-abc"
    current_user = {"id": operator_id, "role": "operator", "name": "Fleet Boss", "email": "boss@example.com"}
    collections = {
        OPERATOR_FLEET_VEHICLES_COLLECTION: MagicMock(),
        "users": MagicMock(),
    }
    db = MagicMock()
    db.__getitem__.side_effect = lambda name: collections[name]
    db.users = collections["users"]

    collections[OPERATOR_FLEET_VEHICLES_COLLECTION].find = MagicMock(return_value=make_cursor([
        {"id": "v1", "operator_id": operator_id, "assigned_driver_id": "d1"},
    ]))
    collections["users"].find = MagicMock(return_value=make_cursor([
        {"id": "d1", "name": "Driver One", "email": "driver@example.com", "phone": "+911234567890"},
    ]))

    result = await list_operator_drivers(current_user=current_user, db=db)

    assert result["drivers"] == [{"id": "d1", "name": "Driver One", "email": "driver@example.com", "phone": "+911234567890"}]


@async_test
async def test_admin_list_and_update_operator_status():
    operator_id = "operator-abc"
    admin_user = {"id": "admin-1", "role": "admin", "name": "Admin"}
    collections = {
        OPERATOR_PROFILES_COLLECTION: MagicMock(),
    }
    db = MagicMock()
    db.__getitem__.side_effect = lambda name: collections[name]

    collections[OPERATOR_PROFILES_COLLECTION].find = MagicMock(return_value=make_cursor([
        {"operator_id": operator_id, "company_name": "Fleet Boss"},
    ]))
    collections[OPERATOR_PROFILES_COLLECTION].update_one = AsyncMock(return_value=MagicMock(matched_count=1))
    collections[OPERATOR_PROFILES_COLLECTION].find_one = AsyncMock(return_value={"operator_id": operator_id, "company_name": "Fleet Boss", "verification_status": "approved", "active": True})

    list_result = await list_operators(current_user=admin_user, db=db)
    assert list_result["operators"][0]["company_name"] == "Fleet Boss"

    payload = OperatorStatusPayload(verification_status="approved", active=True, note="Ok")
    update_result = await update_operator_status(operator_id=operator_id, payload=payload, current_user=admin_user, db=db)
    assert update_result["operator"]["verification_status"] == "approved"
    collections[OPERATOR_PROFILES_COLLECTION].update_one.assert_awaited_once()


@async_test
async def test_create_operator_vehicle_duplicate_license_plate_raises_conflict():
    operator_id = "operator-abc"
    current_user = {"id": operator_id, "role": "operator", "name": "Fleet Boss", "email": "boss@example.com"}
    collections = {
        OPERATOR_PROFILES_COLLECTION: MagicMock(),
        OPERATOR_FLEET_VEHICLES_COLLECTION: MagicMock(),
        CANONICAL_VEHICLES_COLLECTION: MagicMock(),
    }
    db = MagicMock()
    db.__getitem__.side_effect = lambda name: collections[name]

    collections[OPERATOR_PROFILES_COLLECTION].update_one = AsyncMock()
    collections[OPERATOR_PROFILES_COLLECTION].find_one = AsyncMock(return_value={"operator_id": operator_id})
    collections[CANONICAL_VEHICLES_COLLECTION].find_one = AsyncMock(return_value={"vehicle_type_id": "sedan", "name": "Sedan", "active": True, "capacity_unit": "passengers", "capacity": 4, "subtypes": []})
    collections[OPERATOR_FLEET_VEHICLES_COLLECTION].find_one = AsyncMock(return_value={"id": "v1"})

    payload = OperatorVehiclePayload(
        make="Toyota",
        model="Camry",
        year=2024,
        color="White",
        license_plate="AB12CD3456",
        registration_number="AB12CD3456",
        seating_capacity=4,
        vehicle_type_id="sedan",
        service_regions=["all"],
    )

    with pytest.raises(HTTPException) as excinfo:
        await create_operator_vehicle(payload, current_user=current_user, db=db)
    assert excinfo.value.status_code == 409


@async_test
async def test_update_operator_vehicle_syncs_assigned_driver():
    operator_id = "operator-abc"
    driver_id = "driver-123"
    vehicle_id = "vehicle-1"
    current_user = {"id": operator_id, "role": "operator", "name": "Fleet Boss", "email": "boss@example.com"}
    collections = {
        OPERATOR_FLEET_VEHICLES_COLLECTION: MagicMock(),
        CANONICAL_VEHICLES_COLLECTION: MagicMock(),
        "users": MagicMock(),
        "driver_vehicles": MagicMock(),
        "drivers": MagicMock(),
    }
    db = MagicMock()
    db.__getitem__.side_effect = lambda name: collections[name]
    db.users = collections["users"]
    db.driver_vehicles = collections["driver_vehicles"]
    db.drivers = collections["drivers"]
    existing_vehicle = {
        "id": vehicle_id,
        "operator_id": operator_id,
        "assigned_driver_id": driver_id,
        "license_plate": "AB12CD3456",
        "vehicle_type_id": "sedan",
        "vehicle_type_name": "Sedan",
        "vehicle_subtype_id": None,
        "vehicle_subtype_name": None,
        "vehicle_icon": "car",
        "capacity_unit": "passengers",
        "capacity": 4,
        "seating_capacity": 4,
    }

    collections[OPERATOR_FLEET_VEHICLES_COLLECTION].find_one = AsyncMock(side_effect=[existing_vehicle, existing_vehicle])
    collections[OPERATOR_FLEET_VEHICLES_COLLECTION].update_one = AsyncMock()
    collections[CANONICAL_VEHICLES_COLLECTION].find_one = AsyncMock(return_value={"vehicle_type_id": "sedan", "name": "Sedan", "active": True, "capacity_unit": "passengers", "capacity": 4, "subtypes": []})
    collections["users"].find_one = AsyncMock(return_value={"id": driver_id, "role": "driver", "name": "Driver One", "phone": "+911234567890"})
    collections["driver_vehicles"].update_one = AsyncMock()
    collections["drivers"].update_one = AsyncMock()

    payload = OperatorVehiclePayload(
        make="Toyota",
        model="Camry",
        year=2024,
        color="White",
        license_plate="AB12CD3456",
        registration_number="AB12CD3456",
        seating_capacity=4,
        vehicle_type_id="sedan",
        service_regions=["all"],
    )

    result = await update_operator_vehicle(vehicle_id=vehicle_id, payload=payload, current_user=current_user, db=db)

    assert result["vehicle"]["id"] == vehicle_id
    collections["driver_vehicles"].update_one.assert_awaited_once()
    collections["drivers"].update_one.assert_awaited_once()
