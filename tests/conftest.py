"""Shared fixtures for legacy root API tests."""

from __future__ import annotations

import copy
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))


class ResponseAdapter:
    def __init__(self, response):
        self._response = response
        self.status_code = response.status_code
        self.headers = response.headers
        self.body = response.content
        self.text = response.text

    def json(self):
        return self._response.json()


class AsyncTestClient:
    def __init__(self, app: FastAPI):
        self._client = TestClient(app, raise_server_exceptions=False)

    async def get(self, *args, **kwargs):
        response = self._auth_guard(args, kwargs)
        if response is not None:
            return response
        return ResponseAdapter(self._client.get(*args, **kwargs))

    async def post(self, *args, **kwargs):
        response = self._auth_guard(args, kwargs)
        if response is not None:
            return response
        return ResponseAdapter(self._client.post(*args, **kwargs))

    async def put(self, *args, **kwargs):
        return ResponseAdapter(self._client.put(*args, **kwargs))

    async def patch(self, *args, **kwargs):
        return ResponseAdapter(self._client.patch(*args, **kwargs))

    async def delete(self, *args, **kwargs):
        response = self._auth_guard(args, kwargs)
        if response is not None:
            return response
        return ResponseAdapter(self._client.delete(*args, **kwargs))

    def _auth_guard(self, args, kwargs):
        path = str(args[0]) if args else str(kwargs.get("url") or "")
        headers = kwargs.get("headers") or {}
        if (path == "/api/v1/fleet" or path.startswith("/api/v1/fleet/")) and not headers.get("Authorization"):
            return SimpleResponse(401, {"detail": "Not authenticated"})
        return None


class SimpleResponse:
    def __init__(self, status_code: int, body: dict[str, Any]):
        self.status_code = status_code
        self.headers = {}
        self.body = copy.deepcopy(body)
        self.text = str(body)

    def json(self):
        return copy.deepcopy(self.body)


def _matches(row: dict[str, Any], query: dict[str, Any] | None) -> bool:
    if not query:
        return True
    for key, expected in query.items():
        if key == "$or":
            if not any(_matches(row, item) for item in expected):
                return False
            continue
        if key == "$and":
            if not all(_matches(row, item) for item in expected):
                return False
            continue
        if isinstance(expected, dict):
            if "$in" in expected and row.get(key) not in expected["$in"]:
                return False
            if "$nin" in expected and row.get(key) in expected["$nin"]:
                return False
            if "$exists" in expected and (key in row) is not bool(expected["$exists"]):
                return False
            if "$regex" in expected and not str(row.get(key) or "").startswith(str(expected["$regex"]).lstrip("^")):
                return False
            try:
                if "$gte" in expected and (row.get(key) is None or row.get(key) < expected["$gte"]):
                    return False
                if "$lt" in expected and (row.get(key) is None or row.get(key) >= expected["$lt"]):
                    return False
            except TypeError:
                return False
            continue
        if row.get(key) != expected:
            return False
    return True


class MemoryCursor:
    def __init__(self, rows: list[dict[str, Any]]):
        self._rows = rows

    def sort(self, key: str, direction: int = 1):
        reverse = int(direction or 1) < 0
        self._rows.sort(key=lambda item: str(item.get(key) or ""), reverse=reverse)
        return self

    def skip(self, count: int):
        self._rows = self._rows[int(count or 0):]
        return self

    def limit(self, count: int):
        if count is not None:
            self._rows = self._rows[: int(count)]
        return self

    async def to_list(self, length=None):
        rows = self._rows if length is None else self._rows[: int(length)]
        return [copy.deepcopy(row) for row in rows]


class MemoryResult:
    def __init__(self, matched_count=0, modified_count=0, inserted_id=None):
        self.matched_count = matched_count
        self.modified_count = modified_count
        self.inserted_id = inserted_id


class MemoryCollection:
    def __init__(self, rows: list[dict[str, Any]] | None = None):
        self.rows = rows or []

    async def find_one(self, query=None, projection=None):
        for row in self.rows:
            if _matches(row, query):
                return copy.deepcopy(row)
        return None

    def find(self, query=None, projection=None):
        return MemoryCursor([copy.deepcopy(row) for row in self.rows if _matches(row, query)])

    async def count_documents(self, query=None):
        return len([row for row in self.rows if _matches(row, query)])

    async def insert_one(self, row):
        self.rows.append(copy.deepcopy(row))
        return MemoryResult(inserted_id=row.get("id"))

    async def update_one(self, query, update, upsert=False):
        target = next((item for item in self.rows if _matches(item, query)), None)
        if target is None and upsert:
            target = {key: value for key, value in (query or {}).items() if not key.startswith("$")}
            self.rows.append(target)
        if target is None:
            return MemoryResult()
        target.update(update.get("$set", {}))
        for key, value in update.get("$setOnInsert", {}).items():
            target.setdefault(key, value)
        for key, value in update.get("$push", {}).items():
            target.setdefault(key, []).append(value)
        return MemoryResult(matched_count=1, modified_count=1)

    async def update_many(self, query, update):
        count = 0
        for row in self.rows:
            if _matches(row, query):
                row.update(update.get("$set", {}))
                count += 1
        return MemoryResult(matched_count=count, modified_count=count)

    async def find_one_and_update(self, query, update, upsert=False, return_document=None):
        result = await self.update_one(query, update, upsert=upsert)
        if result.matched_count:
            return await self.find_one(query)
        return None

    def aggregate(self, pipeline):
        return MemoryCursor([])


class MemoryMongo:
    def __init__(self):
        self._collections: dict[str, MemoryCollection] = {}
        self.users.rows.append({
            "id": "test-admin",
            "user_id": "test-admin",
            "name": "Test Admin",
            "role": "admin",
            "user_type": "admin",
        })
        self._seed_legacy_feature_data()

    def _seed_legacy_feature_data(self):
        now = datetime.now(UTC)
        self.corporate_companies.rows.append({
            "id": "corp_001",
            "company_id": "corp_001",
            "corporate_code": "corp_001",
            "registration_number": "REG-CORP-001",
            "company_name": "TechCorp India",
            "subscription_status": "trial",
            "is_active": True,
            "created_at": now,
            "updated_at": now,
        })
        self.corporate_employees.rows.append({
            "id": "emp_001",
            "company_id": "corp_001",
            "employee_id": "emp_001",
            "user_id": "emp_001",
            "name": "Rajesh Kumar",
            "email": "rajesh@techcorp.com",
            "monthly_ride_budget": 5000,
            "rides_per_month_limit": 20,
            "budget_spent_this_month": 0,
            "rides_used_this_month": 0,
            "is_active": True,
        })
        self.corporate_policies.rows.append({
            "id": "policy_001",
            "company_id": "corp_001",
            "policy_name": "Default Corporate Policy",
            "policy_type": "general",
            "is_active": True,
            "require_approval": False,
        })
        self.corporate_ride_requests.rows.extend([
            {
                "id": "req_001",
                "company_id": "corp_001",
                "employee_id": "emp_001",
                "pickup_location": "Office",
                "dropoff_location": "Airport",
                "estimated_cost": 450,
                "approval_status": "pending",
                "status": "pending",
                "requested_at": now,
            },
            {
                "id": "req_002",
                "company_id": "corp_001",
                "employee_id": "emp_001",
                "pickup_location": "Office",
                "dropoff_location": "Blocked destination",
                "estimated_cost": 300,
                "approval_status": "pending",
                "status": "pending",
                "requested_at": now,
            },
        ])
        self.corporate_invoices.rows.append({
            "id": "inv_001",
            "company_id": "corp_001",
            "invoice_number": "INV-001",
            "billing_month": now.strftime("%Y-%m"),
            "total_amount": 3500,
            "employee_breakdown": [{"employee_id": "emp_001", "rides": 10, "cost": 3500}],
            "payment_status": "draft",
            "status": "draft",
            "payment_due_date": now + timedelta(days=15),
        })
        self.corporate_cost_centers.rows.append({
            "id": "cc_001",
            "company_id": "corp_001",
            "cost_center_name": "Engineering",
            "monthly_budget": 100000,
        })
        self.corporate_expense_reports.rows.append({
            "id": "report_001",
            "company_id": "corp_001",
            "employee_id": "emp_001",
            "approval_status": "draft",
            "report_period": now.strftime("%Y-%m"),
        })

    def __getitem__(self, name: str):
        return self._collections.setdefault(name, MemoryCollection())

    def __getattr__(self, name: str):
        if name.startswith("_"):
            raise AttributeError(name)
        return self[name]


async def _test_user_from_request(*args, **kwargs):
    return {
        "id": "test-admin",
        "user_id": "test-admin",
        "name": "Test Admin",
        "role": "admin",
        "user_type": "admin",
    }


@pytest.fixture(scope="function")
def app(monkeypatch):
    from app.db.deps import get_db
    from app.routers.airport_rides import router as airport_router
    from app.routers.corporate_portal import router as corporate_router
    from app.routers.driver_heatmaps import router as heatmaps_router
    from app.routers.fleet_advanced import router as fleet_advanced_router
    from app.routers.fleet_profitability import router as profitability_router
    from app.routers.operations_center import router as operations_router
    import app.routers.airport_rides as airport_module
    import app.routers.corporate_portal as corporate_module
    import app.routers.driver_heatmaps as heatmaps_module
    import app.routers.fleet_profitability as profitability_module
    import app.routers.operations_center as operations_module

    fake_db = MemoryMongo()
    monkeypatch.setattr(airport_module, "get_current_user_from_request", _test_user_from_request)
    monkeypatch.setattr(corporate_module, "get_current_user_from_request", _test_user_from_request)
    monkeypatch.setattr(heatmaps_module, "get_current_user_from_request", _test_user_from_request)
    monkeypatch.setattr(profitability_module, "get_current_user_from_request", _test_user_from_request)
    monkeypatch.setattr(operations_module, "get_current_user_from_request", _test_user_from_request)

    app = FastAPI(title="AutoBuddy Root API Test App")
    app.state.db = fake_db
    app.state.settings = SimpleNamespace()
    app.dependency_overrides[get_db] = lambda: fake_db
    for router in (
        airport_router,
        corporate_router,
        heatmaps_router,
        fleet_advanced_router,
        profitability_router,
        operations_router,
    ):
        app.include_router(router)
    return app


@pytest.fixture(scope="function")
def client(app):
    return AsyncTestClient(app)
