"""
Corporate Billing & Invoice Management - Production Implementation
Handles consolidated billing, bulk operations, and payment tracking for corporate accounts
"""

import uuid
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import select, and_, func
import csv
import io

from app.db.corporate_portal_models import (
    CorporateInvoice, InvoiceStatus, CorporateRideRequest, CorporateRideStatus,
    CorporateApprovalStatus, CorporateEmployee, CorporateCostCenter, EmployeeRoleType
)
from app.db.enterprise_models import EmployeeRideAccount
from app.db.deps import get_db
from app.utils.rbac import get_current_user_secure
from app.utils.time_helpers import get_ist_now

router = APIRouter(prefix="/api/v3/corporate", tags=["corporate-billing"])

# ============================================================================
# SERVICE CLASS: CORPORATE BILLING
# ============================================================================

class CorporateBillingService:
    """Service for handling corporate billing, invoices, and bulk operations"""

    @staticmethod
    def generate_monthly_invoice(
        db: Session,
        account_id: str,
        period_start: datetime,
        period_end: datetime
    ) -> CorporateInvoice:
        """Generate monthly invoice aggregating all approved rides in period"""
        stmt = select(CorporateRideRequest).where(
            and_(
                CorporateRideRequest.company_id == account_id,
                CorporateRideRequest.status == CorporateRideStatus.COMPLETED,
                CorporateRideRequest.approval_status == CorporateApprovalStatus.APPROVED,
                CorporateRideRequest.completed_at >= period_start,
                CorporateRideRequest.completed_at <= period_end
            )
        )
        rides = db.execute(stmt).scalars().all()

        # Build breakdown by employee
        employee_breakdown = {}
        for ride in rides:
            if ride.employee_id not in employee_breakdown:
                employee_breakdown[ride.employee_id] = {
                    "employee_id": ride.employee_id,
                    "rides": 0,
                    "amount": 0.0,
                    "approval_status": "approved"
                }
            employee_breakdown[ride.employee_id]["rides"] += 1
            employee_breakdown[ride.employee_id]["amount"] += float(ride.actual_cost or 0)

        # Build breakdown by department
        department_breakdown = {}
        for emp_id, emp_data in employee_breakdown.items():
            stmt = select(CorporateEmployee).where(CorporateEmployee.id == emp_id)
            emp = db.execute(stmt).scalar_one_or_none()
            if emp:
                dept = emp.department
                if dept not in department_breakdown:
                    department_breakdown[dept] = {
                        "department": dept,
                        "rides": 0,
                        "amount": 0.0
                    }
                department_breakdown[dept]["rides"] += emp_data["rides"]
                department_breakdown[dept]["amount"] += emp_data["amount"]

        total_amount = sum(emp["amount"] for emp in employee_breakdown.values())
        total_rides = sum(emp["rides"] for emp in employee_breakdown.values())
        total_employees = len(employee_breakdown)

        # Create invoice
        invoice = CorporateInvoice(
            id=str(uuid.uuid4()),
            company_id=account_id,
            invoice_number=f"INV-{period_start.strftime('%Y-%m')}-{str(uuid.uuid4())[:8].upper()}",
            billing_period_start=period_start,
            billing_period_end=period_end,
            total_rides=total_rides,
            total_employees=total_employees,
            total_amount=total_amount,
            breakdown_by_employee=list(employee_breakdown.values()),
            breakdown_by_department=list(department_breakdown.values()),
            invoice_status=InvoiceStatus.GENERATED,
            issued_date=get_ist_now(),
            due_date=get_ist_now() + timedelta(days=30)
        )

        db.add(invoice)
        db.commit()
        db.refresh(invoice)
        return invoice

    @staticmethod
    def get_invoice_breakdown(db: Session, invoice_id: str) -> Dict[str, Any]:
        """Get detailed breakdown by employee and department"""
        stmt = select(CorporateInvoice).where(CorporateInvoice.id == invoice_id)
        invoice = db.execute(stmt).scalar_one_or_none()

        if not invoice:
            raise ValueError(f"Invoice {invoice_id} not found")

        return {
            "by_employee": invoice.breakdown_by_employee,
            "by_department": invoice.breakdown_by_department,
            "total_amount": invoice.total_amount,
            "total_rides": invoice.total_rides
        }

    @staticmethod
    def process_payment(
        db: Session,
        invoice_id: str,
        payment_method: str,
        transaction_id: str
    ) -> CorporateInvoice:
        """Mark invoice as paid and update payment tracking"""
        stmt = select(CorporateInvoice).where(CorporateInvoice.id == invoice_id)
        invoice = db.execute(stmt).scalar_one_or_none()

        if not invoice:
            raise ValueError(f"Invoice {invoice_id} not found")

        invoice.invoice_status = InvoiceStatus.PAID
        invoice.payment_received_date = get_ist_now()
        invoice.paid_amount = invoice.total_amount
        invoice.payment_method = payment_method

        db.commit()
        db.refresh(invoice)
        return invoice

    @staticmethod
    def bulk_add_employees(
        db: Session,
        account_id: str,
        employee_list: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Create multiple employees at once"""
        added_count = 0
        failed_count = 0
        errors = []

        for emp_data in employee_list:
            try:
                # Create CorporateEmployee
                employee = CorporateEmployee(
                    id=str(uuid.uuid4()),
                    company_id=account_id,
                    user_id=str(uuid.uuid4()),
                    employee_id=emp_data.get("employee_id", f"EMP-{uuid.uuid4().hex[:8]}"),
                    name=emp_data.get("name", ""),
                    email=emp_data.get("email", ""),
                    phone=emp_data.get("phone", ""),
                    department=emp_data.get("department", "General"),
                    job_title=emp_data.get("job_title", ""),
                    manager_id=emp_data.get("manager_id"),
                    employment_type=emp_data.get("employment_type", "full_time"),
                    joined_date=get_ist_now(),
                    monthly_ride_budget=float(emp_data.get("monthly_budget", 5000)),
                    rides_per_month_limit=int(emp_data.get("rides_per_month_limit", 20)),
                    role_in_program=EmployeeRoleType(emp_data.get("role", "employee"))
                )
                db.add(employee)
                db.flush()

                # Create EmployeeRideAccount
                ride_account = EmployeeRideAccount(
                    id=str(uuid.uuid4()),
                    employee_id=employee.id,
                    company_id=account_id,
                    daily_limit=float(emp_data.get("daily_limit", 500)),
                    monthly_limit=float(emp_data.get("monthly_budget", 5000)),
                    requires_approval=emp_data.get("requires_approval", False),
                    cost_center=emp_data.get("cost_center", "default"),
                    can_ride=True
                )
                db.add(ride_account)
                added_count += 1

            except Exception as e:
                failed_count += 1
                errors.append(f"Failed to add {emp_data.get('email', 'unknown')}: {str(e)}")

        db.commit()
        return {
            "added_count": added_count,
            "failed_count": failed_count,
            "errors": errors
        }

    @staticmethod
    def bulk_remove_employees(
        db: Session,
        account_id: str,
        employee_ids: List[str]
    ) -> Dict[str, Any]:
        """Deactivate multiple employees"""
        removed_count = 0
        failed_count = 0

        for emp_id in employee_ids:
            try:
                # Deactivate CorporateEmployee
                stmt = select(CorporateEmployee).where(
                    and_(
                        CorporateEmployee.id == emp_id,
                        CorporateEmployee.company_id == account_id
                    )
                )
                emp = db.execute(stmt).scalar_one_or_none()
                if emp:
                    emp.is_active = False
                    db.flush()

                # Update EmployeeRideAccount
                stmt = select(EmployeeRideAccount).where(EmployeeRideAccount.employee_id == emp_id)
                ride_account = db.execute(stmt).scalar_one_or_none()
                if ride_account:
                    ride_account.can_ride = False
                    db.flush()

                removed_count += 1
            except Exception:
                failed_count += 1

        db.commit()
        return {
            "removed_count": removed_count,
            "failed_count": failed_count
        }

    @staticmethod
    def parse_csv_employees(file_content: str) -> Dict[str, Any]:
        """Parse CSV file and return preview of employees"""
        try:
            reader = csv.DictReader(io.StringIO(file_content))
            employees = list(reader)
            return {
                "parsed_count": len(employees),
                "preview": employees[:10],
                "ready_to_import": len(employees) > 0
            }
        except Exception as e:
            raise ValueError(f"Failed to parse CSV: {str(e)}")


# ============================================================================
# ENDPOINTS: BULK OPERATIONS
# ============================================================================

@router.post("/{account_id}/employees/bulk-add")
async def bulk_add_employees(
    account_id: str,
    request: Dict[str, List[Dict[str, Any]]],
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user_secure)
):
    """Bulk add multiple employees at once"""
    # TODO: Add authorization check for account_id

    result = CorporateBillingService.bulk_add_employees(
        db, account_id, request.get("employees", [])
    )
    return result


@router.delete("/{account_id}/employees/bulk-remove")
async def bulk_remove_employees(
    account_id: str,
    request: Dict[str, List[str]],
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user_secure)
):
    """Bulk remove multiple employees"""
    # TODO: Add authorization check for account_id

    result = CorporateBillingService.bulk_remove_employees(
        db, account_id, request.get("employee_ids", [])
    )
    return result


@router.post("/{account_id}/employees/import-csv")
async def import_employee_csv(
    account_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user_secure)
):
    """Import employees from CSV file - returns preview before actual import"""
    # TODO: Add authorization check for account_id

    content = await file.read()
    file_str = content.decode("utf-8")

    result = CorporateBillingService.parse_csv_employees(file_str)
    return result


# ============================================================================
# ENDPOINTS: INVOICING
# ============================================================================

@router.get("/{account_id}/invoices")
async def get_invoices(
    account_id: str,
    month: Optional[str] = None,
    status: str = "all",
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user_secure)
):
    """Get list of invoices for account with optional filters"""
    # TODO: Add authorization check for account_id

    stmt = select(CorporateInvoice).where(CorporateInvoice.company_id == account_id)

    if month:
        # Filter by month YYYY-MM
        period_start = datetime.strptime(f"{month}-01", "%Y-%m-%d")
        period_end = period_start + timedelta(days=31)
        stmt = stmt.where(
            and_(
                CorporateInvoice.billing_period_start >= period_start,
                CorporateInvoice.billing_period_end <= period_end
            )
        )

    if status != "all":
        stmt = stmt.where(CorporateInvoice.invoice_status == status)

    invoices = db.execute(stmt.order_by(CorporateInvoice.issued_date.desc())).scalars().all()

    return [
        {
            "invoice_id": inv.id,
            "invoice_number": inv.invoice_number,
            "billing_period_start": inv.billing_period_start.isoformat(),
            "billing_period_end": inv.billing_period_end.isoformat(),
            "total_amount": inv.total_amount,
            "total_rides": inv.total_rides,
            "invoice_status": inv.invoice_status.value,
            "issued_date": inv.issued_date.isoformat(),
            "due_date": inv.due_date.isoformat(),
            "payment_received_date": inv.payment_received_date.isoformat() if inv.payment_received_date else None
        }
        for inv in invoices
    ]


@router.get("/{account_id}/invoices/{invoice_id}")
async def get_invoice_detail(
    account_id: str,
    invoice_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user_secure)
):
    """Get detailed invoice with breakdown by employee and department"""
    # TODO: Add authorization check for account_id

    stmt = select(CorporateInvoice).where(
        and_(
            CorporateInvoice.id == invoice_id,
            CorporateInvoice.company_id == account_id
        )
    )
    invoice = db.execute(stmt).scalar_one_or_none()

    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")

    breakdown = CorporateBillingService.get_invoice_breakdown(db, invoice_id)

    return {
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "billing_period_start": invoice.billing_period_start.isoformat(),
        "billing_period_end": invoice.billing_period_end.isoformat(),
        "total_rides": invoice.total_rides,
        "total_employees": invoice.total_employees,
        "total_amount": invoice.total_amount,
        "invoice_status": invoice.invoice_status.value,
        "issued_date": invoice.issued_date.isoformat(),
        "due_date": invoice.due_date.isoformat(),
        "payment_received_date": invoice.payment_received_date.isoformat() if invoice.payment_received_date else None,
        "paid_amount": invoice.paid_amount,
        "payment_method": invoice.payment_method,
        "breakdown_by_employee": breakdown["by_employee"],
        "breakdown_by_department": breakdown["by_department"]
    }


@router.post("/{account_id}/invoices/generate")
async def generate_invoice(
    account_id: str,
    billing_period_start: str,
    billing_period_end: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user_secure)
):
    """Generate monthly invoice for specified period"""
    # TODO: Add authorization check for account_id

    try:
        period_start = datetime.fromisoformat(billing_period_start)
        period_end = datetime.fromisoformat(billing_period_end)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use ISO format.")

    invoice = CorporateBillingService.generate_monthly_invoice(
        db, account_id, period_start, period_end
    )

    return {
        "invoice_id": invoice.id,
        "invoice_number": invoice.invoice_number,
        "total_amount": invoice.total_amount,
        "total_rides": invoice.total_rides,
        "invoice_status": invoice.invoice_status.value
    }


@router.post("/{account_id}/invoices/{invoice_id}/pay")
async def pay_invoice(
    account_id: str,
    invoice_id: str,
    request: Dict[str, str],
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user_secure)
):
    """Process payment for invoice"""
    # TODO: Add authorization check for account_id

    payment_method = request.get("payment_method", "card")
    transaction_id = request.get("transaction_id", "")

    invoice = CorporateBillingService.process_payment(
        db, invoice_id, payment_method, transaction_id
    )

    return {
        "invoice_id": invoice.id,
        "status": "payment_processing",
        "invoice_status": invoice.invoice_status.value,
        "paid_amount": invoice.paid_amount,
        "expected_completion_date": (get_ist_now() + timedelta(days=1)).isoformat()
    }


# ============================================================================
# ENDPOINTS: DASHBOARD DATA
# ============================================================================

@router.get("/{account_id}/dashboard/summary")
async def get_dashboard_summary(
    account_id: str,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user_secure)
):
    """Get dashboard summary with budget and approval stats"""
    # TODO: Add authorization check for account_id

    # Get employees count
    stmt = select(func.count(CorporateEmployee.id)).where(
        and_(
            CorporateEmployee.company_id == account_id,
            CorporateEmployee.is_active == True
        )
    )
    active_employees = db.execute(stmt).scalar() or 0

    stmt = select(func.count(CorporateEmployee.id)).where(
        CorporateEmployee.company_id == account_id
    )
    total_employees = db.execute(stmt).scalar() or 0

    # Get pending approvals
    stmt = select(func.count(CorporateRideRequest.id)).where(
        and_(
            CorporateRideRequest.company_id == account_id,
            CorporateRideRequest.approval_status == CorporateApprovalStatus.PENDING
        )
    )
    pending_approvals = db.execute(stmt).scalar() or 0

    # Get current month rides and expenses
    now = get_ist_now()
    month_start = now.replace(day=1)

    stmt = select(
        func.count(CorporateRideRequest.id),
        func.sum(CorporateRideRequest.actual_cost)
    ).where(
        and_(
            CorporateRideRequest.company_id == account_id,
            CorporateRideRequest.status == CorporateRideStatus.COMPLETED,
            CorporateRideRequest.completed_at >= month_start
        )
    )
    result = db.execute(stmt).one()
    current_month_rides = result[0] or 0
    current_month_expense = float(result[1] or 0)

    total_budget = 50000  # TODO: Get from CorporateAccount
    spent_this_month = current_month_expense
    remaining_budget = max(0, total_budget - spent_this_month)
    budget_utilization_pct = round((spent_this_month / total_budget * 100) if total_budget > 0 else 0, 1)

    return {
        "total_budget": total_budget,
        "spent_this_month": spent_this_month,
        "remaining_budget": remaining_budget,
        "budget_utilization_pct": budget_utilization_pct,
        "total_employees": total_employees,
        "active_employees": active_employees,
        "pending_approvals": pending_approvals,
        "current_month_rides": current_month_rides,
        "current_month_expense": current_month_expense
    }


@router.get("/{account_id}/dashboard/expenses")
async def get_expenses(
    account_id: str,
    group_by: str = "employee",
    month: Optional[str] = None,
    db: Session = Depends(get_db),
    user: dict = Depends(get_current_user_secure)
):
    """Get expense breakdown grouped by employee, department, or date"""
    # TODO: Add authorization check for account_id

    # Default to current month if not specified
    if not month:
        now = get_ist_now()
        month = now.strftime("%Y-%m")

    period_start = datetime.fromisoformat(f"{month}-01")
    period_end = period_start + timedelta(days=31)

    stmt = select(CorporateRideRequest).where(
        and_(
            CorporateRideRequest.company_id == account_id,
            CorporateRideRequest.status == CorporateRideStatus.COMPLETED,
            CorporateRideRequest.completed_at >= period_start,
            CorporateRideRequest.completed_at <= period_end
        )
    )
    rides = db.execute(stmt).scalars().all()

    if group_by == "employee":
        breakdown = {}
        for ride in rides:
            emp_id = ride.employee_id
            if emp_id not in breakdown:
                breakdown[emp_id] = {
                    "category": emp_id,
                    "ride_count": 0,
                    "total_amount": 0.0,
                    "avg_per_ride": 0.0,
                    "trend": "stable"
                }
            breakdown[emp_id]["ride_count"] += 1
            breakdown[emp_id]["total_amount"] += float(ride.actual_cost or 0)

        for emp_id in breakdown:
            if breakdown[emp_id]["ride_count"] > 0:
                breakdown[emp_id]["avg_per_ride"] = round(
                    breakdown[emp_id]["total_amount"] / breakdown[emp_id]["ride_count"], 2
                )

        return list(breakdown.values())

    elif group_by == "department":
        breakdown = {}
        for ride in rides:
            stmt = select(CorporateEmployee).where(CorporateEmployee.id == ride.employee_id)
            emp = db.execute(stmt).scalar_one_or_none()
            if emp:
                dept = emp.department
                if dept not in breakdown:
                    breakdown[dept] = {
                        "category": dept,
                        "ride_count": 0,
                        "total_amount": 0.0,
                        "avg_per_ride": 0.0,
                        "trend": "stable"
                    }
                breakdown[dept]["ride_count"] += 1
                breakdown[dept]["total_amount"] += float(ride.actual_cost or 0)

        for dept in breakdown:
            if breakdown[dept]["ride_count"] > 0:
                breakdown[dept]["avg_per_ride"] = round(
                    breakdown[dept]["total_amount"] / breakdown[dept]["ride_count"], 2
                )

        return list(breakdown.values())

    elif group_by == "date":
        breakdown = {}
        for ride in rides:
            date_key = ride.completed_at.strftime("%Y-%m-%d") if ride.completed_at else "unknown"
            if date_key not in breakdown:
                breakdown[date_key] = {
                    "category": date_key,
                    "ride_count": 0,
                    "total_amount": 0.0,
                    "avg_per_ride": 0.0,
                    "trend": "stable"
                }
            breakdown[date_key]["ride_count"] += 1
            breakdown[date_key]["total_amount"] += float(ride.actual_cost or 0)

        for date_key in breakdown:
            if breakdown[date_key]["ride_count"] > 0:
                breakdown[date_key]["avg_per_ride"] = round(
                    breakdown[date_key]["total_amount"] / breakdown[date_key]["ride_count"], 2
                )

        return sorted(list(breakdown.values()), key=lambda x: x["category"])

    else:
        raise HTTPException(status_code=400, detail="group_by must be 'employee', 'department', or 'date'")
