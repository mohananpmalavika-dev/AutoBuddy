import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.canonical_vehicle_model import CANONICAL_VEHICLES_COLLECTION
from app.routers.operator_portal import (
    OPERATOR_FLEET_VEHICLES_COLLECTION,
    OPERATOR_PROFILES_COLLECTION,
    OPERATOR_ASSIGNMENT_HISTORY_COLLECTION,
    OperatorVehiclePayload,
    assign_operator_vehicle_driver,
    create_operator_vehicle,
    unassign_operator_vehicle_driver,
)


@pytest.mark.asyncio
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
    collections[OPERATOR_FLEET_VEHICLES_COLLECTION].find_one = AsyncMock(return_value={
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
    })

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
