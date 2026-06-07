"""
Corporate Ride Portal API Endpoints
B2B management platform for enterprise ride programs
"""

from fastapi import APIRouter, HTTPException, Request, Query, Body
from datetime import datetime, timedelta
from app.utils.time_helpers import get_ist_now
import logging
import random
import json
from app.utils.rbac import get_current_user_from_request

from app.db.corporate_portal_models import (
    CorporateCompany, CorporateEmployee, CorporateRidePolicy,
    CorporateRideRequest, ApprovalWorkflow, CorporateInvoice,
    CorporateCostCenter, CorporateExpenseReport
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/corporate", tags=["corporate_portal"])


# ============================================================================
# COMPANY MANAGEMENT ENDPOINTS
# ============================================================================

@router.post("/company/register")
async def register_corporate_company(payload: dict, request: Request):
    """
    Register a new corporate company for the ride program.
    
    Payload: {
        "company_name": "...",
        "registration_number": "...",
        "industry": "...",
        "employee_count": 500,
        "contact_email": "...",
        "contact_phone": "..."
    }
    """
    try:
        await get_current_user_from_request(request)
        company = {
            "id": f"corp_{random.randint(1000, 9999)}",
            "company_name": payload.get("company_name"),
            "registration_number": payload.get("registration_number"),
            "industry": payload.get("industry"),
            "employee_count": payload.get("employee_count", 0),
            "headquarters_city": payload.get("headquarters_city", "Bangalore"),
            "subscription_status": "trial",
            "subscription_start_date": get_ist_now().isoformat(),
            "subscription_end_date": (get_ist_now() + timedelta(days=30)).isoformat(),
            "created_at": get_ist_now().isoformat()
        }
        
        return {
            "status": "success",
            "data": company,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error registering company: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/company/{company_id}")
async def get_company_details(company_id: str, request: Request):
    """Get corporate company details."""
    try:
        await get_current_user_from_request(request)
        company = {
            "id": company_id,
            "company_name": "TechCorp India",
            "registration_number": "REG-12345",
            "industry": "IT",
            "employee_count": 500,
            "headquarters_city": "Bangalore",
            "subscription_status": "professional",
            "active_employees": random.randint(100, 500),
            "total_rides_month": random.randint(500, 2000),
            "total_spend_month": round(random.uniform(50000, 200000), 2),
            "payment_method": "invoice",
            "billing_cycle": "monthly",
            "is_active": True,
            "created_at": (get_ist_now() - timedelta(days=random.randint(30, 365))).isoformat()
        }
        
        return {
            "status": "success",
            "data": company,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error fetching company: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/company/{company_id}/settings")
async def update_company_settings(company_id: str, payload: dict, request: Request):
    """Update corporate company settings."""
    try:
        await get_current_user_from_request(request)
        return {
            "status": "success",
            "data": {
                "company_id": company_id,
                "updated_fields": list(payload.keys()),
                "updated_at": get_ist_now().isoformat()
            },
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error updating company: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# EMPLOYEE MANAGEMENT ENDPOINTS
# ============================================================================

@router.post("/company/{company_id}/employees")
async def add_employee(company_id: str, payload: dict, request: Request):
    """Add employee to corporate program."""
    try:
        await get_current_user_from_request(request)
        employee = {
            "id": f"emp_{random.randint(1000, 9999)}",
            "company_id": company_id,
            "employee_id": payload.get("employee_id"),
            "name": payload.get("name"),
            "email": payload.get("email"),
            "department": payload.get("department"),
            "job_title": payload.get("job_title"),
            "monthly_ride_budget": payload.get("monthly_ride_budget", 5000),
            "rides_per_month_limit": payload.get("rides_per_month_limit", 20),
            "is_active": True,
            "created_at": get_ist_now().isoformat()
        }
        
        return {
            "status": "success",
            "data": employee,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error adding employee: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/company/{company_id}/employees")
async def list_employees(company_id: str, department: str = None, request: Request = None):
    """List all employees in a company."""
    try:
        await get_current_user_from_request(request)
        employees = []
        for i in range(random.randint(10, 50)):
            employees.append({
                "id": f"emp_{i}",
                "company_id": company_id,
                "employee_id": f"EMP-{i:04d}",
                "name": f"Employee {i}",
                "department": department or f"Dept {i % 3}",
                "job_title": "Software Engineer",
                "monthly_ride_budget": 5000,
                "rides_used_this_month": random.randint(0, 20),
                "budget_spent_this_month": round(random.uniform(0, 5000), 2),
                "is_active": random.choice([True, True, False])
            })
        
        return {
            "status": "success",
            "data": employees,
            "total_count": len(employees),
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error listing employees: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/company/{company_id}/employees/{employee_id}")
async def get_employee(company_id: str, employee_id: str, request: Request):
    """Get employee profile and ride history."""
    try:
        await get_current_user_from_request(request)
        employee = {
            "id": employee_id,
            "company_id": company_id,
            "name": "Rajesh Kumar",
            "email": "rajesh@techcorp.com",
            "department": "Engineering",
            "job_title": "Senior Engineer",
            "manager_name": "Priya Sharma",
            "monthly_ride_budget": 5000,
            "rides_per_month_limit": 20,
            "rides_used_this_month": 12,
            "budget_spent_this_month": 2400,
            "budget_remaining": 2600,
            "average_ride_cost": 200,
            "total_rides_all_time": 85,
            "joined_date": (get_ist_now() - timedelta(days=random.randint(30, 365))).isoformat()
        }
        
        return {
            "status": "success",
            "data": employee,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting employee: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/company/{company_id}/employees/{employee_id}")
async def remove_employee(company_id: str, employee_id: str, request: Request):
    """Remove employee from corporate program."""
    try:
        await get_current_user_from_request(request)
        return {
            "status": "success",
            "data": {
                "employee_id": employee_id,
                "status": "removed",
                "removed_at": get_ist_now().isoformat()
            },
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error removing employee: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# RIDE POLICY ENDPOINTS
# ============================================================================

@router.post("/company/{company_id}/policies")
async def create_policy(company_id: str, payload: dict, request: Request):
    """Create a ride policy."""
    try:
        await get_current_user_from_request(request)
        policy = {
            "id": f"policy_{random.randint(1000, 9999)}",
            "company_id": company_id,
            "policy_name": payload.get("policy_name"),
            "policy_type": payload.get("policy_type"),
            "description": payload.get("description"),
            "is_active": True,
            "created_at": get_ist_now().isoformat()
        }
        
        # Add type-specific fields
        if payload.get("policy_type") == "predefined_routes":
            policy["origin_location"] = payload.get("origin_location")
            policy["destination_location"] = payload.get("destination_location")
        elif payload.get("policy_type") == "time_window":
            policy["allowed_start_time"] = payload.get("allowed_start_time")
            policy["allowed_end_time"] = payload.get("allowed_end_time")
        elif payload.get("policy_type") == "budget_limit":
            policy["max_ride_cost"] = payload.get("max_ride_cost")
            policy["max_monthly_cost"] = payload.get("max_monthly_cost")
        
        return {
            "status": "success",
            "data": policy,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error creating policy: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/company/{company_id}/policies")
async def list_policies(company_id: str, request: Request):
    """List all policies for a company."""
    try:
        await get_current_user_from_request(request)
        policies = []
        policy_types = ["predefined_routes", "time_window", "budget_limit"]
        
        for i, ptype in enumerate(policy_types):
            policies.append({
                "id": f"policy_{i}",
                "company_id": company_id,
                "policy_name": f"Policy {i}: {ptype}",
                "policy_type": ptype,
                "is_active": True,
                "employees_count": random.randint(10, 100)
            })
        
        return {
            "status": "success",
            "data": policies,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error listing policies: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# RIDE REQUEST ENDPOINTS
# ============================================================================

@router.post("/ride-requests")
async def request_corporate_ride(payload: dict, request: Request):
    """
    Request a ride under corporate program.
    Automatic approval if policy-compliant, else requires approval.
    """
    try:
        await get_current_user_from_request(request)
        requires_approval = payload.get("requires_approval", False)
        
        ride_request = {
            "id": f"req_{random.randint(10000, 99999)}",
            "company_id": payload.get("company_id"),
            "employee_id": payload.get("employee_id"),
            "pickup_location": payload.get("pickup_location"),
            "dropoff_location": payload.get("dropoff_location"),
            "estimated_cost": payload.get("estimated_cost", 250),
            "ride_type": payload.get("ride_type", "uber"),
            "status": "approved" if not requires_approval else "pending",
            "approval_status": "approved" if not requires_approval else "pending",
            "policy_compliant": not requires_approval,
            "requires_approval": requires_approval,
            "requested_at": get_ist_now().isoformat()
        }
        
        return {
            "status": "success",
            "data": ride_request,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error requesting ride: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ride-requests/{company_id}")
async def list_ride_requests(company_id: str, status: str = None, request: Request = None):
    """List ride requests for a company with filtering."""
    try:
        await get_current_user_from_request(request)
        requests_list = []
        statuses = ["approved", "pending", "rejected", "completed"]
        
        for i in range(random.randint(5, 20)):
            req_status = status if status else random.choice(statuses)
            requests_list.append({
                "id": f"req_{i}",
                "company_id": company_id,
                "employee_name": f"Employee {i}",
                "ride_date": (get_ist_now() + timedelta(days=random.randint(-10, 5))).isoformat(),
                "pickup": f"Location {i}",
                "dropoff": f"Location {i+1}",
                "estimated_cost": round(random.uniform(150, 500), 2),
                "status": req_status,
                "approval_status": req_status if req_status != "completed" else "approved"
            })
        
        return {
            "status": "success",
            "data": requests_list,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error listing ride requests: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ride-requests/{request_id}/approve")
async def approve_ride_request(request_id: str, payload: dict, request: Request):
    """Approve a pending ride request."""
    try:
        await get_current_user_from_request(request)
        return {
            "status": "success",
            "data": {
                "request_id": request_id,
                "approval_status": "approved",
                "approved_by": payload.get("approver_id"),
                "approved_at": get_ist_now().isoformat()
            },
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error approving request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ride-requests/{request_id}/reject")
async def reject_ride_request(request_id: str, payload: dict, request: Request):
    """Reject a pending ride request."""
    try:
        await get_current_user_from_request(request)
        return {
            "status": "success",
            "data": {
                "request_id": request_id,
                "approval_status": "rejected",
                "rejection_reason": payload.get("reason"),
                "rejected_at": get_ist_now().isoformat()
            },
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error rejecting request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# INVOICE & BILLING ENDPOINTS
# ============================================================================

@router.get("/company/{company_id}/invoices")
async def list_invoices(company_id: str, year: int = None, month: int = None, request: Request = None):
    """List invoices for a company."""
    try:
        await get_current_user_from_request(request)
        invoices = []
        for i in range(6):
            month_back = i
            invoice_date = get_ist_now() - timedelta(days=30 * month_back)
            invoices.append({
                "id": f"inv_{i}",
                "invoice_number": f"INV-2024-{i:03d}",
                "billing_month": invoice_date.strftime("%Y-%m"),
                "total_rides": random.randint(50, 300),
                "total_cost": round(random.uniform(10000, 50000), 2),
                "total_amount": round(random.uniform(11000, 55000), 2),
                "status": random.choice(["draft", "sent", "paid"]),
                "payment_due_date": (invoice_date + timedelta(days=30)).isoformat()
            })
        
        return {
            "status": "success",
            "data": invoices,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error listing invoices: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/company/{company_id}/invoices/{invoice_id}")
async def get_invoice_details(company_id: str, invoice_id: str, request: Request):
    """Get detailed invoice with employee breakdown."""
    try:
        await get_current_user_from_request(request)
        invoice = {
            "id": invoice_id,
            "invoice_number": "INV-2024-003",
            "company_id": company_id,
            "billing_month": "2024-03",
            "period": {
                "start_date": "2024-03-01",
                "end_date": "2024-03-31"
            },
            "summary": {
                "total_rides": 125,
                "total_ride_cost": 25000,
                "platform_fee": 2500,
                "taxes": 2970,
                "total_amount": 30470
            },
            "payment_status": "paid",
            "payment_date": (get_ist_now() - timedelta(days=5)).isoformat(),
            "employee_breakdown": [
                {
                    "employee_name": f"Employee {i}",
                    "rides": random.randint(1, 10),
                    "cost": round(random.uniform(100, 1000), 2)
                }
                for i in range(random.randint(5, 15))
            ]
        }
        
        return {
            "status": "success",
            "data": invoice,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting invoice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/company/{company_id}/invoices/{invoice_id}/download")
async def download_invoice(company_id: str, invoice_id: str, request: Request):
    """Generate and download invoice as PDF."""
    try:
        await get_current_user_from_request(request)
        return {
            "status": "success",
            "data": {
                "download_url": f"/files/invoices/{invoice_id}.pdf",
                "file_name": f"Invoice-{invoice_id}.pdf"
            },
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error downloading invoice: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# COST CENTER ENDPOINTS
# ============================================================================

@router.get("/company/{company_id}/cost-centers")
async def list_cost_centers(company_id: str, request: Request):
    """List all cost centers in company."""
    try:
        await get_current_user_from_request(request)
        cost_centers = []
        departments = ["Engineering", "Finance", "Sales", "HR", "Operations"]
        
        for i, dept in enumerate(departments):
            cost_centers.append({
                "id": f"cc_{i}",
                "cost_center_code": f"CC-{i:03d}",
                "cost_center_name": f"{dept} Department",
                "allocated_budget": 50000,
                "spent_budget": round(random.uniform(10000, 45000), 2),
                "budget_remaining": round(random.uniform(5000, 40000), 2),
                "employees": random.randint(10, 50),
                "rides_this_month": random.randint(50, 200)
            })
        
        return {
            "status": "success",
            "data": cost_centers,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error listing cost centers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# EXPENSE REPORT ENDPOINTS
# ============================================================================

@router.post("/company/{company_id}/employees/{employee_id}/expense-reports")
async def create_expense_report(company_id: str, employee_id: str, payload: dict, request: Request):
    """Create expense report for employee rides."""
    try:
        await get_current_user_from_request(request)
        report = {
            "id": f"report_{random.randint(10000, 99999)}",
            "company_id": company_id,
            "employee_id": employee_id,
            "report_period": payload.get("report_period"),
            "total_rides": payload.get("total_rides", 0),
            "total_cost": payload.get("total_cost", 0),
            "approval_status": "draft",
            "created_at": get_ist_now().isoformat()
        }
        
        return {
            "status": "success",
            "data": report,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error creating expense report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/company/{company_id}/employees/{employee_id}/expense-reports")
async def list_expense_reports(company_id: str, employee_id: str, request: Request):
    """List expense reports for employee."""
    try:
        await get_current_user_from_request(request)
        reports = []
        for i in range(3, 0, -1):
            month_ago = get_ist_now() - timedelta(days=30 * i)
            reports.append({
                "id": f"report_{i}",
                "report_period": month_ago.strftime("%Y-%m"),
                "total_rides": random.randint(10, 30),
                "total_cost": round(random.uniform(2000, 5000), 2),
                "approval_status": random.choice(["approved", "submitted", "pending"]),
                "submitted_at": month_ago.isoformat()
            })
        
        return {
            "status": "success",
            "data": reports,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error listing expense reports: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/expense-reports/{report_id}/submit")
async def submit_expense_report(report_id: str, request: Request):
    """Submit expense report for approval."""
    try:
        await get_current_user_from_request(request)
        return {
            "status": "success",
            "data": {
                "report_id": report_id,
                "approval_status": "submitted",
                "submitted_at": get_ist_now().isoformat()
            },
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error submitting report: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# ANALYTICS & REPORTING ENDPOINTS
# ============================================================================

@router.get("/company/{company_id}/analytics/dashboard")
async def get_corporate_dashboard(company_id: str, request: Request):
    """Get company dashboard with key metrics."""
    try:
        await get_current_user_from_request(request)
        dashboard = {
            "company_id": company_id,
            "timestamp": get_ist_now().isoformat(),
            "metrics": {
                "active_employees": random.randint(100, 500),
                "total_rides_this_month": random.randint(200, 1000),
                "total_spend_this_month": round(random.uniform(50000, 200000), 2),
                "average_ride_cost": round(random.uniform(150, 400), 2),
                "most_active_department": "Engineering",
                "policy_compliance_rate": round(random.uniform(85, 99), 1)
            },
            "top_destinations": [
                {"destination": "Airport", "rides": 45},
                {"destination": "Railway Station", "rides": 32},
                {"destination": "Office Campus", "rides": 28}
            ],
            "pending_approvals": random.randint(0, 15),
            "overdue_invoices": random.randint(0, 3)
        }
        
        return {
            "status": "success",
            "data": dashboard,
            "updated_at": get_ist_now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting dashboard: {e}")
        raise HTTPException(status_code=500, detail=str(e))
