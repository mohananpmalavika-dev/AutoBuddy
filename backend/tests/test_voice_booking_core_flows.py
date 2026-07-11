import pytest
from fastapi import HTTPException

from app.routers import core_flows


class _InsertResult:
    inserted_id = "voice-ride-1"


class _RidesCollection:
    def __init__(self):
        self.inserted = None

    async def insert_one(self, document):
        self.inserted = document
        return _InsertResult()


class _Db:
    def __init__(self):
        self.rides = _RidesCollection()

    def get_collection(self, name):
        assert name == "rides"
        return self.rides


@pytest.mark.asyncio
async def test_voice_booking_accepts_null_ride_product():
    db = _Db()

    response = await core_flows.voice_book_ride(
        {
            "raw_utterance": "Kollam",
            "destination_text": "Kollam",
            "pickup_text": None,
            "preferred_vehicle_hint": None,
            "preferred_ride_product": None,
            "intent_type": "custom",
            "language_detected": "en-IN",
        },
        current_user={"id": "passenger-1", "role": "passenger", "name": "Test Passenger"},
        db=db,
    )

    assert response["status"] == "searching"
    assert response["destination"] == "Kollam"
    assert response["ride_type"] == "economy"
    assert db.rides.inserted["pickup"] == "Current Location"
    assert db.rides.inserted["dropoff"] == "Kollam"


@pytest.mark.asyncio
async def test_voice_booking_requires_passenger_role():
    with pytest.raises(HTTPException) as exc:
        await core_flows.voice_book_ride(
            {"destination_text": "Kollam"},
            current_user={"id": "driver-1", "role": "driver"},
            db=_Db(),
        )

    assert exc.value.status_code == 403
