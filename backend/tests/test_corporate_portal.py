import asyncio
from unittest.mock import AsyncMock, MagicMock

from app.routers import corporate_portal as corporate


def async_test(func):
    def wrapper(*args, **kwargs):
        return asyncio.run(func(*args, **kwargs))

    return wrapper


def make_cursor(results):
    cursor = MagicMock()
    cursor.sort.return_value = cursor
    cursor.to_list = AsyncMock(return_value=results)
    return cursor


def make_db(collections):
    db = MagicMock()
    db.__getitem__.side_effect = lambda name: collections[name]
    return db


@async_test
async def test_check_policy_allows_compliant_employee_ride():
    collections = {
        corporate.EMPLOYEES: MagicMock(),
        corporate.POLICIES: MagicMock(),
        corporate.BOOKINGS: MagicMock(),
    }
    collections[corporate.EMPLOYEES].find_one = AsyncMock(
        return_value={
            "employee_id": "EMP-1",
            "company_id": "corp_1",
            "is_active": True,
            "monthly_ride_budget": 5000,
            "rides_per_month_limit": 20,
        }
    )
    collections[corporate.POLICIES].find.return_value = make_cursor(
        [{"id": "policy_1", "company_id": "corp_1", "is_active": True, "max_ride_cost": 500}]
    )
    collections[corporate.BOOKINGS].find.return_value = make_cursor([])

    result = await corporate.check_policy(make_db(collections), "corp_1", "EMP-1", 250)

    assert result["approved"] is True
    assert result["policy_id"] == "policy_1"


@async_test
async def test_check_policy_sends_over_limit_ride_to_approval():
    collections = {
        corporate.EMPLOYEES: MagicMock(),
        corporate.POLICIES: MagicMock(),
        corporate.BOOKINGS: MagicMock(),
    }
    collections[corporate.EMPLOYEES].find_one = AsyncMock(
        return_value={
            "employee_id": "EMP-1",
            "company_id": "corp_1",
            "is_active": True,
            "monthly_ride_budget": 5000,
            "rides_per_month_limit": 20,
        }
    )
    collections[corporate.POLICIES].find.return_value = make_cursor(
        [{"id": "policy_1", "company_id": "corp_1", "is_active": True, "max_ride_cost": 200}]
    )
    collections[corporate.BOOKINGS].find.return_value = make_cursor([])

    result = await corporate.check_policy(make_db(collections), "corp_1", "EMP-1", 350)

    assert result["approved"] is False
    assert result["reason"] == "Ride cost exceeds corporate policy limit"


@async_test
async def test_create_booking_from_corporate_request_links_request_and_invoice_fields():
    collections = {
        corporate.BOOKINGS: MagicMock(),
        corporate.RIDE_REQUESTS: MagicMock(),
    }
    collections[corporate.BOOKINGS].find_one = AsyncMock(return_value=None)
    collections[corporate.BOOKINGS].insert_one = AsyncMock()
    collections[corporate.RIDE_REQUESTS].update_one = AsyncMock()
    ride_request = {
        "id": "corp_req_1",
        "company_id": "corp_1",
        "employee_id": "EMP-1",
        "pickup_location": {"address": "Office"},
        "dropoff_location": {"address": "Client site"},
        "estimated_cost": 320,
        "approval_status": "approved",
        "requested_by": "EMP-1",
    }

    booking = await corporate._create_booking_from_request(
        make_db(collections),
        ride_request,
        {"id": "manager_1"},
    )

    assert booking["ride_product"] == "corporate"
    assert booking["payment_method"] == "corporate_invoice"
    assert booking["corporate_request_id"] == "corp_req_1"
    assert booking["company_id"] == "corp_1"
    collections[corporate.BOOKINGS].insert_one.assert_awaited_once()
    collections[corporate.RIDE_REQUESTS].update_one.assert_awaited_once()
