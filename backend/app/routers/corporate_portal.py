"""
Corporate Ride Portal API Endpoints.

DB-backed B2B ride management for company employees, approvals, and billing.
"""

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.utils.rbac import get_current_user_from_request
from app.utils.time_helpers import get_ist_now
from app.routers.corporate_billing_production import CorporateBillingService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/corporate", tags=["corporate_portal"])

COMPANIES = "corporate_companies"
EMPLOYEES = "corporate_employees"
POLICIES = "corporate_policies"
RIDE_REQUESTS = "corporate_ride_requests"
APPROVALS = "corporate_approval_workflows"
INVOICES = "corporate_invoices"
COST_CENTERS = "corporate_cost_centers"
EXPENSE_REPORTS = "corporate_expense_reports"
BOOKINGS = "bookings"


def _now() -> datetime:
    return get_ist_now()


def _make_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def _clean(value: Any) -> str:
    return str(value or "").strip()


def _money(value: Any, default: float = 0.0) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    return parsed if parsed >= 0 else default


def _serialize_value(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [_serialize_value(item) for item in value]
    if isinstance(value, dict):
        return _serialize_doc(value)
    return value


def _serialize_doc(document: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if document is None:
        return None
    return {
        key: _serialize_value(value)
        for key, value in document.items()
        if key != "_id"
    }


def _serialize_list(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [_serialize_doc(row) for row in rows]


def _response(data: Any, **extra: Any) -> Dict[str, Any]:
    return {
        "status": "success",
        "data": _serialize_value(data),
        "updated_at": _now().isoformat(),
        **extra,
    }


def _user_id(current_user: Dict[str, Any]) -> str:
    return _clean(
        current_user.get("id")
        or current_user.get("user_id")
        or current_user.get("sub")
        or current_user.get("_id")
    )


async def _update_employee_spending_on_approval(
    db: Session, employee_id: str, ride_cost: float
) -> None:
    """Update employee spending when ride is approved (integration hook with CorporateBillingService)"""
    try:
        from app.db.corporate_portal_models import CorporateEmployee
        from sqlalchemy import select, update

        stmt = select(CorporateEmployee).where(CorporateEmployee.id == employee_id)
        employee = db.execute(stmt).scalar_one_or_none()
        if employee:
            employee.budget_spent_this_month += ride_cost
            db.commit()
    except Exception as e:
        logger.warning(f"Failed to update employee spending: {str(e)}")


def _company_lookup(company_id: str) -> Dict[str, Any]:
    identifier = _clean(company_id)
    return {
        "$or": [
            {"id": identifier},
            {"company_id": identifier},
            {"corporate_code": identifier},
            {"registration_number": identifier},
        ]
    }


def _employee_lookup(company_id: str, employee_id: str) -> Dict[str, Any]:
    identifier = _clean(employee_id)
    return {
        "company_id": company_id,
        "$or": [
            {"id": identifier},
            {"employee_id": identifier},
            {"user_id": identifier},
            {"email": identifier.lower()},
        ],
    }


def _location_label(location: Any, fallback: str = "Location") -> str:
    if isinstance(location, dict):
        return (
            _clean(location.get("address"))
            or _clean(location.get("name"))
            or _clean(location.get("label"))
            or fallback
        )
    return _clean(location) or fallback


def _month_key(value: Optional[str] = None) -> str:
    text = _clean(value)
    if len(text) == 7 and text[4] == "-":
        return text
    return _now().strftime("%Y-%m")


def _month_bounds(month: Optional[str] = None) -> tuple[datetime, datetime, str]:
    key = _month_key(month)
    try:
        start = datetime.strptime(key, "%Y-%m").replace(tzinfo=_now().tzinfo)
    except ValueError:
        raise HTTPException(status_code=400, detail="month must be in YYYY-MM format")
    if start.month == 12:
        end = start.replace(year=start.year + 1, month=1)
    else:
        end = start.replace(month=start.month + 1)
    return start, end, key


async def _require_company(db: AsyncIOMotorDatabase, company_id: str) -> Dict[str, Any]:
    company = await db[COMPANIES].find_one(_company_lookup(company_id))
    if not company or company.get("is_active") is False:
        raise HTTPException(status_code=404, detail="Corporate company not found or inactive")
    return company


async def _require_employee(
    db: AsyncIOMotorDatabase,
    company_id: str,
    employee_id: str,
) -> Dict[str, Any]:
    employee = await db[EMPLOYEES].find_one(_employee_lookup(company_id, employee_id))
    if not employee or employee.get("is_active") is False:
        raise HTTPException(status_code=403, detail="Employee is not active under this company")
    return employee


async def _employee_month_usage(
    db: AsyncIOMotorDatabase,
    company_id: str,
    employee_id: str,
    month: Optional[str] = None,
) -> Dict[str, Any]:
    start, end, _ = _month_bounds(month)
    query = {
        "company_id": company_id,
        "employee_id": employee_id,
        "ride_product": "corporate",
        "created_at": {"$gte": start, "$lt": end},
        "status": {"$nin": ["cancelled", "rejected", "failed"]},
    }
    bookings = await db[BOOKINGS].find(query, {"_id": 0}).to_list(1000)
    total = sum(_money(row.get("final_fare", row.get("estimated_fare", 0))) for row in bookings)
    return {"rides": len(bookings), "spend": round(total, 2)}


async def check_policy(
    db: AsyncIOMotorDatabase,
    company_id: str,
    employee_id: str,
    estimated_cost: float,
    *,
    pickup_location: Any = None,
    dropoff_location: Any = None,
    ride_date: Optional[datetime] = None,
) -> Dict[str, Any]:
    employee = await _require_employee(db, company_id, employee_id)
    policies = await db[POLICIES].find(
        {"company_id": company_id, "is_active": True},
        {"_id": 0},
    ).to_list(100)

    if not policies:
        return {
            "approved": False,
            "reason": "No active corporate ride policy found",
            "policy_id": None,
        }

    usage = await _employee_month_usage(db, company_id, employee_id)
    employee_budget = _money(employee.get("monthly_ride_budget"))
    employee_ride_limit = int(employee.get("rides_per_month_limit") or 0)
    if employee_budget and usage["spend"] + estimated_cost > employee_budget:
        return {
            "approved": False,
            "reason": "Employee monthly corporate ride budget exceeded",
            "policy_id": None,
        }
    if employee_ride_limit and usage["rides"] + 1 > employee_ride_limit:
        return {
            "approved": False,
            "reason": "Employee monthly corporate ride count limit exceeded",
            "policy_id": None,
        }

    ride_time = ride_date or _now()
    pickup_label = _location_label(pickup_location, "").lower()
    dropoff_label = _location_label(dropoff_location, "").lower()
    matched_policy_id = policies[0].get("id")

    for policy in policies:
        matched_policy_id = policy.get("id") or matched_policy_id
        max_ride_cost = _money(policy.get("max_ride_cost"))
        max_monthly_cost = _money(policy.get("max_monthly_cost"))
        if max_ride_cost and estimated_cost > max_ride_cost:
            return {
                "approved": False,
                "reason": "Ride cost exceeds corporate policy limit",
                "policy_id": policy.get("id"),
            }
        if max_monthly_cost and usage["spend"] + estimated_cost > max_monthly_cost:
            return {
                "approved": False,
                "reason": "Monthly corporate policy budget exceeded",
                "policy_id": policy.get("id"),
            }
        if policy.get("require_approval"):
            return {
                "approved": False,
                "reason": "Corporate policy requires manager approval",
                "policy_id": policy.get("id"),
            }
        if policy.get("policy_type") == "time_window":
            start_time = _clean(policy.get("allowed_start_time"))
            end_time = _clean(policy.get("allowed_end_time"))
            current_time = ride_time.strftime("%H:%M")
            if start_time and current_time < start_time:
                return {
                    "approved": False,
                    "reason": "Ride requested before allowed corporate travel time",
                    "policy_id": policy.get("id"),
                }
            if end_time and current_time > end_time:
                return {
                    "approved": False,
                    "reason": "Ride requested after allowed corporate travel time",
                    "policy_id": policy.get("id"),
                }
        forbidden = [_clean(item).lower() for item in policy.get("forbidden_destinations", []) if _clean(item)]
        if forbidden and any(item in dropoff_label for item in forbidden):
            return {
                "approved": False,
                "reason": "Drop location is blocked by corporate policy",
                "policy_id": policy.get("id"),
            }
        allowed_zones = [_clean(item).lower() for item in policy.get("allowed_city_zones", []) if _clean(item)]
        if allowed_zones and not any(item in dropoff_label or item in pickup_label for item in allowed_zones):
            return {
                "approved": False,
                "reason": "Route is outside allowed corporate zones",
                "policy_id": policy.get("id"),
            }

    return {
        "approved": True,
        "reason": "Policy compliant",
        "policy_id": matched_policy_id,
        "month_usage": usage,
    }


async def _create_booking_from_request(
    db: AsyncIOMotorDatabase,
    ride_request: Dict[str, Any],
    current_user: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    if ride_request.get("approval_status") != "approved":
        raise HTTPException(status_code=403, detail="Corporate ride is not approved")
    if ride_request.get("booking_id"):
        existing = await db[BOOKINGS].find_one({"id": ride_request["booking_id"]}, {"_id": 0})
        if existing:
            return existing

    now = _now()
    booking_id = _make_id("booking")
    booking = {
        "id": booking_id,
        "passenger_id": ride_request["employee_id"],
        "employee_id": ride_request["employee_id"],
        "company_id": ride_request["company_id"],
        "corporate_request_id": ride_request["id"],
        "pickup_location": ride_request.get("pickup_location") or {},
        "drop_location": ride_request.get("dropoff_location") or {},
        "ride_product": "corporate",
        "ride_product_label": "Corporate",
        "payment_method": "corporate_invoice",
        "corporate_code": ride_request.get("corporate_code"),
        "cost_center_id": ride_request.get("cost_center_id"),
        "purpose": ride_request.get("purpose"),
        "estimated_fare": _money(ride_request.get("estimated_cost")),
        "status": "pending",
        "dispatch_status": "searching",
        "requested_by": ride_request.get("requested_by"),
        "created_by": _user_id(current_user or {}) or ride_request.get("requested_by"),
        "created_at": now,
        "updated_at": now,
    }
    await db[BOOKINGS].insert_one(booking)
    await db[RIDE_REQUESTS].update_one(
        {"id": ride_request["id"]},
        {
            "$set": {
                "booking_id": booking_id,
                "status": "booking_created",
                "updated_at": now,
            }
        },
    )
    booking.pop("_id", None)
    return booking


def _ride_request_view(row: Dict[str, Any], employee: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    view = dict(row)
    view["employee_name"] = employee.get("name") if employee else row.get("employee_name", row.get("employee_id"))
    view["pickup"] = _location_label(row.get("pickup_location"), "Pickup")
    view["dropoff"] = _location_label(row.get("dropoff_location"), "Dropoff")
    view["ride_date"] = row.get("ride_date") or row.get("requested_at")
    if view.get("status") == "pending_approval":
        view["status"] = "pending"
    return view


def _ride_action_payload(result: Dict[str, Any]) -> Dict[str, Any]:
    ride_request = result.get("ride_request") or {}
    payload = {
        **ride_request,
        "ride_request": ride_request,
        "booking": result.get("booking"),
    }
    if payload.get("status") == "booking_created":
        payload["status"] = payload.get("approval_status") or "approved"
    if "approval_status" not in payload and ride_request.get("status"):
        payload["approval_status"] = ride_request["status"]
    return payload


@router.post("/company/register")
async def register_corporate_company(
    payload: dict,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Register a new corporate company for the ride program."""
    try:
        current_user = await get_current_user_from_request(request, db_override=db)
        company_name = _clean(payload.get("company_name"))
        if not company_name:
            raise HTTPException(status_code=400, detail="company_name is required")

        registration_number = _clean(payload.get("registration_number")) or _make_id("reg")
        duplicate = await db[COMPANIES].find_one({"registration_number": registration_number}, {"_id": 0, "id": 1})
        if duplicate:
            raise HTTPException(status_code=409, detail="Company registration number already exists")

        now = _now()
        company = {
            "id": _make_id("corp"),
            "corporate_code": _clean(payload.get("corporate_code")) or registration_number,
            "company_name": company_name,
            "registration_number": registration_number,
            "industry": _clean(payload.get("industry")) or "General",
            "employee_count": int(payload.get("employee_count") or 0),
            "headquarters_city": _clean(payload.get("headquarters_city")) or "Kollam",
            "contact_email": _clean(payload.get("contact_email")).lower(),
            "contact_phone": _clean(payload.get("contact_phone")),
            "primary_contact_name": _clean(payload.get("primary_contact_name") or current_user.get("name")),
            "subscription_status": _clean(payload.get("subscription_status")) or "trial",
            "subscription_start_date": now,
            "subscription_end_date": now + timedelta(days=30),
            "payment_method": _clean(payload.get("payment_method")) or "invoice",
            "billing_cycle": _clean(payload.get("billing_cycle")) or "monthly",
            "is_active": True,
            "created_by": _user_id(current_user),
            "created_at": now,
            "updated_at": now,
        }
        await db[COMPANIES].insert_one(company)
        return _response(company)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error registering company")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/company/{company_id}")
async def get_company_details(
    company_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get corporate company details with real month metrics."""
    await get_current_user_from_request(request, db_override=db)
    company = await _require_company(db, company_id)
    start, end, _ = _month_bounds()
    active_employees = await db[EMPLOYEES].count_documents({"company_id": company["id"], "is_active": True})
    monthly_bookings = await db[BOOKINGS].find(
        {
            "company_id": company["id"],
            "ride_product": "corporate",
            "created_at": {"$gte": start, "$lt": end},
            "status": {"$nin": ["cancelled", "rejected", "failed"]},
        },
        {"_id": 0},
    ).to_list(1000)
    total_spend = sum(_money(row.get("final_fare", row.get("estimated_fare", 0))) for row in monthly_bookings)
    company.update(
        {
            "active_employees": active_employees,
            "total_rides_month": len(monthly_bookings),
            "total_spend_month": round(total_spend, 2),
        }
    )
    return _response(company)


@router.put("/company/{company_id}/settings")
async def update_company_settings(
    company_id: str,
    payload: dict,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Update corporate company settings."""
    await get_current_user_from_request(request, db_override=db)
    company = await _require_company(db, company_id)
    allowed = {
        "company_name",
        "industry",
        "employee_count",
        "headquarters_city",
        "contact_email",
        "contact_phone",
        "primary_contact_name",
        "subscription_status",
        "payment_method",
        "billing_cycle",
        "corporate_code",
        "is_active",
    }
    updates = {key: value for key, value in payload.items() if key in allowed}
    if not updates:
        raise HTTPException(status_code=400, detail="No supported settings supplied")
    updates["updated_at"] = _now()
    await db[COMPANIES].update_one({"id": company["id"]}, {"$set": updates})
    updated = await db[COMPANIES].find_one({"id": company["id"]})
    return _response(updated)


@router.post("/company/{company_id}/employees")
async def add_employee(
    company_id: str,
    payload: dict,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Add or update an employee in the corporate program."""
    current_user = await get_current_user_from_request(request, db_override=db)
    company = await _require_company(db, company_id)
    employee_id = _clean(payload.get("employee_id") or payload.get("user_id"))
    email = _clean(payload.get("email")).lower()
    name = _clean(payload.get("name"))
    if not employee_id:
        raise HTTPException(status_code=400, detail="employee_id is required")
    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    now = _now()
    employee = {
        "id": _make_id("emp"),
        "company_id": company["id"],
        "user_id": _clean(payload.get("user_id") or employee_id),
        "employee_id": employee_id,
        "name": name,
        "email": email,
        "phone": _clean(payload.get("phone")),
        "department": _clean(payload.get("department")) or "General",
        "job_title": _clean(payload.get("job_title")) or "Employee",
        "manager_id": _clean(payload.get("manager_id")) or None,
        "employment_type": _clean(payload.get("employment_type")) or "full_time",
        "monthly_ride_budget": _money(payload.get("monthly_ride_budget"), 5000.0),
        "rides_per_month_limit": int(payload.get("rides_per_month_limit") or 20),
        "approved_destinations": payload.get("approved_destinations") or [],
        "role_in_program": _clean(payload.get("role_in_program")) or "employee",
        "rides_used_this_month": 0,
        "budget_spent_this_month": 0.0,
        "is_active": True,
        "joined_date": now,
        "created_by": _user_id(current_user),
        "created_at": now,
        "updated_at": now,
    }
    result = await db[EMPLOYEES].find_one_and_update(
        {"company_id": company["id"], "employee_id": employee_id},
        {
            "$set": {key: value for key, value in employee.items() if key not in {"id", "created_at"}},
            "$setOnInsert": {"id": employee["id"], "created_at": now},
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return _response(result or employee)


@router.get("/company/{company_id}/employees")
async def list_employees(
    company_id: str,
    request: Request,
    department: Optional[str] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """List all employees in a company."""
    await get_current_user_from_request(request, db_override=db)
    company = await _require_company(db, company_id)
    query: Dict[str, Any] = {"company_id": company["id"]}
    if department:
        query["department"] = department
    employees = await db[EMPLOYEES].find(query, {"_id": 0}).sort("name", 1).to_list(500)
    return _response(employees, total_count=len(employees))


@router.get("/company/{company_id}/employees/{employee_id}")
async def get_employee(
    company_id: str,
    employee_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get employee profile and real month usage."""
    await get_current_user_from_request(request, db_override=db)
    company = await _require_company(db, company_id)
    employee = await _require_employee(db, company["id"], employee_id)
    usage = await _employee_month_usage(db, company["id"], employee["employee_id"])
    employee["rides_used_this_month"] = usage["rides"]
    employee["budget_spent_this_month"] = usage["spend"]
    employee["budget_remaining"] = max(0.0, _money(employee.get("monthly_ride_budget")) - usage["spend"])
    employee["average_ride_cost"] = round(usage["spend"] / usage["rides"], 2) if usage["rides"] else 0
    return _response(employee)


@router.delete("/company/{company_id}/employees/{employee_id}")
async def remove_employee(
    company_id: str,
    employee_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Deactivate an employee in the corporate program."""
    await get_current_user_from_request(request, db_override=db)
    company = await _require_company(db, company_id)
    result = await db[EMPLOYEES].update_one(
        _employee_lookup(company["id"], employee_id),
        {"$set": {"is_active": False, "updated_at": _now()}},
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Employee not found")
    return _response({"employee_id": employee_id, "status": "removed", "removed_at": _now()})


@router.post("/company/{company_id}/policies")
async def create_policy(
    company_id: str,
    payload: dict,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Create a ride policy."""
    current_user = await get_current_user_from_request(request, db_override=db)
    company = await _require_company(db, company_id)
    now = _now()
    policy = {
        "id": _make_id("policy"),
        "company_id": company["id"],
        "policy_name": _clean(payload.get("policy_name")) or "Corporate Ride Policy",
        "policy_type": _clean(payload.get("policy_type")) or "budget_limit",
        "description": _clean(payload.get("description")),
        "is_active": bool(payload.get("is_active", True)),
        "applies_to_roles": payload.get("applies_to_roles") or [],
        "origin_location": payload.get("origin_location"),
        "destination_location": payload.get("destination_location"),
        "route_name": payload.get("route_name"),
        "allowed_start_time": payload.get("allowed_start_time"),
        "allowed_end_time": payload.get("allowed_end_time"),
        "allowed_days": payload.get("allowed_days") or [],
        "max_ride_cost": payload.get("max_ride_cost"),
        "max_monthly_cost": payload.get("max_monthly_cost"),
        "forbidden_destinations": payload.get("forbidden_destinations") or [],
        "allowed_city_zones": payload.get("allowed_city_zones") or [],
        "preferred_providers": payload.get("preferred_providers") or [],
        "require_approval": bool(payload.get("require_approval", False)),
        "created_by": _user_id(current_user),
        "created_at": now,
        "updated_at": now,
    }
    await db[POLICIES].insert_one(policy)
    return _response(policy)


@router.get("/company/{company_id}/policies")
async def list_policies(
    company_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """List all policies for a company."""
    await get_current_user_from_request(request, db_override=db)
    company = await _require_company(db, company_id)
    policies = await db[POLICIES].find({"company_id": company["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    employee_count = await db[EMPLOYEES].count_documents({"company_id": company["id"], "is_active": True})
    for policy in policies:
        policy["employees_count"] = employee_count
    return _response(policies)


@router.post("/ride-requests")
async def request_corporate_ride(
    payload: dict,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """
    Request a ride under corporate program.
    Auto-creates a booking when policy-compliant; otherwise creates a manager approval item.
    """
    try:
        current_user = await get_current_user_from_request(request, db_override=db)
        company = await _require_company(db, payload.get("company_id"))
        employee = await _require_employee(db, company["id"], payload.get("employee_id") or _user_id(current_user))
        estimated_cost = _money(payload.get("estimated_cost"), 250.0)
        policy_result = await check_policy(
            db,
            company["id"],
            employee["employee_id"],
            estimated_cost,
            pickup_location=payload.get("pickup_location"),
            dropoff_location=payload.get("dropoff_location"),
        )

        now = _now()
        ride_request = {
            "id": _make_id("corp_req"),
            "company_id": company["id"],
            "corporate_code": company.get("corporate_code"),
            "employee_id": employee["employee_id"],
            "employee_name": employee.get("name"),
            "pickup_location": payload.get("pickup_location") or {},
            "dropoff_location": payload.get("dropoff_location") or {},
            "estimated_cost": estimated_cost,
            "ride_type": _clean(payload.get("ride_type")) or "auto",
            "purpose": _clean(payload.get("purpose")) or None,
            "cost_center_id": _clean(payload.get("cost_center_id")) or None,
            "policy_id": policy_result.get("policy_id"),
            "policy_compliant": bool(policy_result["approved"]),
            "policy_reason": policy_result["reason"],
            "requires_approval": not bool(policy_result["approved"]),
            "approval_status": "approved" if policy_result["approved"] else "pending",
            "status": "approved" if policy_result["approved"] else "pending_approval",
            "booking_id": None,
            "requested_by": _user_id(current_user),
            "requested_at": now,
            "created_at": now,
            "updated_at": now,
        }
        await db[RIDE_REQUESTS].insert_one(ride_request)

        booking = None
        if policy_result["approved"]:
            booking = await _create_booking_from_request(db, ride_request, current_user)
            ride_request["booking_id"] = booking["id"]
            ride_request["status"] = "booking_created"
        else:
            await db[APPROVALS].insert_one(
                {
                    "id": _make_id("approval"),
                    "company_id": company["id"],
                    "ride_request_id": ride_request["id"],
                    "employee_id": employee["employee_id"],
                    "status": "pending",
                    "is_approved": False,
                    "is_rejected": False,
                    "reason": policy_result["reason"],
                    "approval_history": [],
                    "created_at": now,
                    "last_updated": now,
                    "expires_at": now + timedelta(hours=24),
                }
            )

        return _response(_ride_action_payload({"ride_request": ride_request, "booking": booking}))
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Error requesting corporate ride")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/ride-requests/{company_id}")
async def list_ride_requests(
    company_id: str,
    request: Request,
    status: Optional[str] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """List ride requests for a company with filtering."""
    await get_current_user_from_request(request, db_override=db)
    company = await _require_company(db, company_id)
    query: Dict[str, Any] = {"company_id": company["id"]}
    if status:
        normalized_status = _clean(status).lower()
        if normalized_status == "pending":
            query["$or"] = [{"status": "pending_approval"}, {"approval_status": "pending"}]
        else:
            query["$or"] = [{"status": normalized_status}, {"approval_status": normalized_status}]
    rows = await db[RIDE_REQUESTS].find(query, {"_id": 0}).sort("requested_at", -1).to_list(500)
    employee_ids = {row.get("employee_id") for row in rows if row.get("employee_id")}
    employees = await db[EMPLOYEES].find(
        {"company_id": company["id"], "employee_id": {"$in": list(employee_ids)}},
        {"_id": 0},
    ).to_list(500) if employee_ids else []
    employee_by_id = {row.get("employee_id"): row for row in employees}
    return _response([_ride_request_view(row, employee_by_id.get(row.get("employee_id"))) for row in rows])


async def _set_request_approval(
    db: AsyncIOMotorDatabase,
    request_id: str,
    current_user: Dict[str, Any],
    *,
    approved: bool,
    note: Optional[str] = None,
) -> Dict[str, Any]:
    ride_request = await db[RIDE_REQUESTS].find_one({"id": request_id})
    if not ride_request:
        raise HTTPException(status_code=404, detail="Corporate ride request not found")
    if ride_request.get("approval_status") not in {"pending", "approved"}:
        raise HTTPException(status_code=400, detail="Request already processed")
    if ride_request.get("approval_status") == "approved" and approved and ride_request.get("booking_id"):
        return {"ride_request": ride_request, "booking": await _create_booking_from_request(db, ride_request, current_user)}

    now = _now()
    new_status = "approved" if approved else "rejected"
    update = {
        "approval_status": new_status,
        "status": new_status,
        "approved_by": _user_id(current_user),
        "manager_note": note,
        "approved_at": now if approved else None,
        "rejected_at": None if approved else now,
        "updated_at": now,
    }
    await db[RIDE_REQUESTS].update_one({"id": request_id}, {"$set": update})
    await db[APPROVALS].update_one(
        {"ride_request_id": request_id},
        {
            "$set": {
                "status": new_status,
                "is_approved": approved,
                "is_rejected": not approved,
                "manager_note": note,
                "last_updated": now,
            },
            "$push": {
                "approval_history": {
                    "action": new_status,
                    "by": _user_id(current_user),
                    "note": note,
                    "at": now,
                }
            },
        },
    )
    updated_request = await db[RIDE_REQUESTS].find_one({"id": request_id})
    booking = await _create_booking_from_request(db, updated_request, current_user) if approved else None
    return {"ride_request": updated_request, "booking": booking}


@router.post("/ride-requests/{request_id}/approve")
async def approve_ride_request(
    request_id: str,
    payload: dict,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Approve a pending ride request and create the booking."""
    current_user = await get_current_user_from_request(request, db_override=db)
    action = _clean(payload.get("action")).lower()
    if action == "reject":
        result = await _set_request_approval(
            db,
            request_id,
            current_user,
            approved=False,
            note=payload.get("manager_note") or payload.get("reason"),
        )
    else:
        result = await _set_request_approval(
            db,
            request_id,
            current_user,
            approved=True,
            note=payload.get("manager_note"),
        )
    return _response(_ride_action_payload(result))


@router.post("/ride-requests/{request_id}/reject")
async def reject_ride_request(
    request_id: str,
    payload: dict,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Reject a pending ride request."""
    current_user = await get_current_user_from_request(request, db_override=db)
    result = await _set_request_approval(
        db,
        request_id,
        current_user,
        approved=False,
        note=payload.get("reason") or payload.get("manager_note"),
    )
    return _response(_ride_action_payload(result))


@router.post("/ride-requests/{request_id}/create-booking")
async def create_booking_from_corporate_request(
    request_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Convert an approved corporate ride request into a live booking."""
    current_user = await get_current_user_from_request(request, db_override=db)
    ride_request = await db[RIDE_REQUESTS].find_one({"id": request_id})
    if not ride_request:
        raise HTTPException(status_code=404, detail="Corporate ride request not found")
    booking = await _create_booking_from_request(db, ride_request, current_user)
    return _response({"booking": booking})


@router.get("/company/{company_id}/invoices")
async def list_invoices(
    company_id: str,
    request: Request,
    year: Optional[int] = None,
    month: Optional[int] = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """List invoices for a company."""
    await get_current_user_from_request(request, db_override=db)
    company = await _require_company(db, company_id)
    query: Dict[str, Any] = {"company_id": company["id"]}
    if year and month:
        query["billing_month"] = f"{year:04d}-{month:02d}"
    elif year:
        query["billing_month"] = {"$regex": f"^{year:04d}-"}
    invoices = await db[INVOICES].find(query, {"_id": 0}).sort("billing_month", -1).to_list(200)
    return _response(invoices)


@router.post("/company/{company_id}/generate-invoice")
async def generate_monthly_invoice(
    company_id: str,
    request: Request,
    month: Optional[str] = Query(default=None),
    payload: Optional[dict] = Body(default=None),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Generate a monthly invoice from completed corporate bookings."""
    await get_current_user_from_request(request, db_override=db)
    company = await _require_company(db, company_id)
    payload = payload or {}
    billing_month = _month_key(month or payload.get("month"))
    start, end, billing_month = _month_bounds(billing_month)

    existing = await db[INVOICES].find_one({"company_id": company["id"], "billing_month": billing_month}, {"_id": 0})
    if existing:
        return _response(existing, reused=True)

    rides = await db[BOOKINGS].find(
        {
            "company_id": company["id"],
            "ride_product": "corporate",
            "status": "completed",
            "created_at": {"$gte": start, "$lt": end},
            "invoice_id": {"$exists": False},
        },
        {"_id": 0},
    ).to_list(5000)
    total_ride_cost = round(sum(_money(row.get("final_fare", row.get("estimated_fare", 0))) for row in rides), 2)
    platform_fee = round(total_ride_cost * 0.05, 2)
    taxes = round((total_ride_cost + platform_fee) * 0.18, 2)
    employee_breakdown: Dict[str, Dict[str, Any]] = {}
    for ride in rides:
        employee_id = _clean(ride.get("employee_id") or ride.get("passenger_id"))
        amount = _money(ride.get("final_fare", ride.get("estimated_fare", 0)))
        row = employee_breakdown.setdefault(employee_id, {"employee_id": employee_id, "rides": 0, "cost": 0.0})
        row["rides"] += 1
        row["cost"] = round(row["cost"] + amount, 2)

    invoice = {
        "id": _make_id("inv"),
        "company_id": company["id"],
        "invoice_number": f"INV-{billing_month.replace('-', '')}-{uuid4().hex[:5].upper()}",
        "billing_month": billing_month,
        "start_date": start,
        "end_date": end,
        "total_rides": len(rides),
        "total_ride_cost": total_ride_cost,
        "platform_fee": platform_fee,
        "taxes": taxes,
        "total_cost": total_ride_cost,
        "total_amount": round(total_ride_cost + platform_fee + taxes, 2),
        "employee_breakdown": list(employee_breakdown.values()),
        "ride_ids": [ride["id"] for ride in rides if ride.get("id")],
        "status": "draft",
        "payment_due_date": end + timedelta(days=15),
        "created_at": _now(),
    }
    await db[INVOICES].insert_one(invoice)
    if invoice["ride_ids"]:
        await db[BOOKINGS].update_many(
            {"id": {"$in": invoice["ride_ids"]}},
            {"$set": {"invoice_id": invoice["id"], "invoice_month": billing_month}},
        )
    return _response(invoice)


@router.get("/company/{company_id}/invoices/{invoice_id}")
async def get_invoice_details(
    company_id: str,
    invoice_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get detailed invoice with employee breakdown."""
    await get_current_user_from_request(request, db_override=db)
    company = await _require_company(db, company_id)
    invoice = await db[INVOICES].find_one({"company_id": company["id"], "id": invoice_id})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return _response(invoice)


@router.post("/company/{company_id}/invoices/{invoice_id}/download")
async def download_invoice(
    company_id: str,
    invoice_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Return invoice download metadata."""
    await get_current_user_from_request(request, db_override=db)
    company = await _require_company(db, company_id)
    invoice = await db[INVOICES].find_one({"company_id": company["id"], "id": invoice_id}, {"_id": 0})
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return _response(
        {
            "download_url": f"/files/invoices/{invoice_id}.pdf",
            "file_name": f"{invoice.get('invoice_number', invoice_id)}.pdf",
        }
    )


@router.get("/company/{company_id}/cost-centers")
async def list_cost_centers(
    company_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """List all cost centers in a company."""
    await get_current_user_from_request(request, db_override=db)
    company = await _require_company(db, company_id)
    rows = await db[COST_CENTERS].find({"company_id": company["id"]}, {"_id": 0}).sort("cost_center_name", 1).to_list(300)
    return _response(rows)


@router.post("/company/{company_id}/employees/{employee_id}/expense-reports")
async def create_expense_report(
    company_id: str,
    employee_id: str,
    payload: dict,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Create an expense report for employee rides."""
    current_user = await get_current_user_from_request(request, db_override=db)
    company = await _require_company(db, company_id)
    employee = await _require_employee(db, company["id"], employee_id)
    period = _month_key(payload.get("report_period"))
    start, end, _ = _month_bounds(period)
    rides = await db[RIDE_REQUESTS].find(
        {
            "company_id": company["id"],
            "employee_id": employee["employee_id"],
            "requested_at": {"$gte": start, "$lt": end},
            "approval_status": "approved",
        },
        {"_id": 0},
    ).to_list(1000)
    report = {
        "id": _make_id("report"),
        "company_id": company["id"],
        "employee_id": employee["employee_id"],
        "report_period": period,
        "ride_requests": [ride["id"] for ride in rides if ride.get("id")],
        "total_rides": len(rides),
        "total_cost": round(sum(_money(ride.get("estimated_cost")) for ride in rides), 2),
        "approval_status": "draft",
        "reimbursement_status": "pending",
        "reimbursement_amount": 0.0,
        "created_by": _user_id(current_user),
        "created_at": _now(),
    }
    await db[EXPENSE_REPORTS].insert_one(report)
    return _response(report)


@router.get("/company/{company_id}/employees/{employee_id}/expense-reports")
async def list_expense_reports(
    company_id: str,
    employee_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """List expense reports for an employee."""
    await get_current_user_from_request(request, db_override=db)
    company = await _require_company(db, company_id)
    employee = await _require_employee(db, company["id"], employee_id)
    reports = await db[EXPENSE_REPORTS].find(
        {"company_id": company["id"], "employee_id": employee["employee_id"]},
        {"_id": 0},
    ).sort("report_period", -1).to_list(100)
    return _response(reports)


@router.post("/expense-reports/{report_id}/submit")
async def submit_expense_report(
    report_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Submit an expense report for approval."""
    current_user = await get_current_user_from_request(request, db_override=db)
    now = _now()
    result = await db[EXPENSE_REPORTS].update_one(
        {"id": report_id},
        {
            "$set": {
                "approval_status": "submitted",
                "submitted_by": _user_id(current_user),
                "submitted_at": now,
                "updated_at": now,
            }
        },
    )
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Expense report not found")
    report = await db[EXPENSE_REPORTS].find_one({"id": report_id})
    return _response(report)


@router.get("/company/{company_id}/analytics/dashboard")
async def get_corporate_dashboard(
    company_id: str,
    request: Request,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Get company dashboard with real key metrics."""
    await get_current_user_from_request(request, db_override=db)
    company = await _require_company(db, company_id)
    start, end, _ = _month_bounds()
    active_employees = await db[EMPLOYEES].count_documents({"company_id": company["id"], "is_active": True})
    ride_requests = await db[RIDE_REQUESTS].find(
        {"company_id": company["id"], "requested_at": {"$gte": start, "$lt": end}},
        {"_id": 0},
    ).to_list(2000)
    bookings = await db[BOOKINGS].find(
        {
            "company_id": company["id"],
            "ride_product": "corporate",
            "created_at": {"$gte": start, "$lt": end},
            "status": {"$nin": ["cancelled", "rejected", "failed"]},
        },
        {"_id": 0},
    ).to_list(2000)
    total_spend = round(sum(_money(row.get("final_fare", row.get("estimated_fare", 0))) for row in bookings), 2)
    compliant = sum(1 for row in ride_requests if row.get("policy_compliant"))
    compliance_rate = round((compliant / len(ride_requests)) * 100, 1) if ride_requests else 100.0
    destination_counts: Dict[str, int] = {}
    for booking in bookings:
        destination = _location_label(booking.get("drop_location") or booking.get("dropoff_location"), "Destination")
        destination_counts[destination] = destination_counts.get(destination, 0) + 1
    top_destinations = [
        {"destination": destination, "rides": rides}
        for destination, rides in sorted(destination_counts.items(), key=lambda item: item[1], reverse=True)[:5]
    ]
    pending_approvals = await db[RIDE_REQUESTS].count_documents(
        {"company_id": company["id"], "approval_status": "pending"}
    )
    overdue_invoices = await db[INVOICES].count_documents(
        {"company_id": company["id"], "status": {"$in": ["sent", "pending", "overdue"]}, "payment_due_date": {"$lt": _now()}}
    )
    dashboard = {
        "company_id": company["id"],
        "timestamp": _now(),
        "metrics": {
            "active_employees": active_employees,
            "total_rides_this_month": len(bookings),
            "total_spend_this_month": total_spend,
            "average_ride_cost": round(total_spend / len(bookings), 2) if bookings else 0,
            "most_active_department": "N/A",
            "policy_compliance_rate": compliance_rate,
        },
        "top_destinations": top_destinations,
        "pending_approvals": pending_approvals,
        "overdue_invoices": overdue_invoices,
    }
    return _response(dashboard)
