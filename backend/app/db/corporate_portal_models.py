"""
Corporate Ride Portal Database Models
B2B ride management for enterprise employees
"""

from pydantic import BaseModel, Field
from datetime import datetime
from .models_features import get_ist_now
from typing import List, Optional, Dict, Any
from enum import Enum


class CorporateApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    EXPIRED = "expired"


class RidePolicyType(str, Enum):
    PREDEFINED_ROUTES = "predefined_routes"
    TIME_WINDOW = "time_window"
    BUDGET_LIMIT = "budget_limit"
    DESTINATION_RESTRICTION = "destination_restriction"
    PROVIDER_RESTRICTION = "provider_restriction"


class CorporateRideStatus(str, Enum):
    REQUESTED = "requested"
    APPROVED = "approved"
    REJECTED = "rejected"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class EmployeeRoleType(str, Enum):
    EMPLOYEE = "employee"
    MANAGER = "manager"
    FINANCE_OFFICER = "finance_officer"
    HR_ADMIN = "hr_admin"
    COMPANY_ADMIN = "company_admin"


class CorporateCompany(BaseModel):
    """Main corporate company entity."""
    id: str = Field(default_factory=lambda: str(get_ist_now().timestamp()))
    company_name: str
    registration_number: str
    industry: str  # e.g., "IT", "Finance", "Retail"
    employee_count: int
    headquarters_city: str
    establishment_date: datetime
    contact_email: str
    contact_phone: str
    primary_contact_name: str
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    
    # Account status
    is_active: bool = True
    subscription_status: str  # "trial", "basic", "professional", "enterprise"
    subscription_start_date: datetime = Field(default_factory=get_ist_now)
    subscription_end_date: datetime
    
    # Billing
    payment_method: str  # "invoice", "credit_card", "bank_transfer"
    billing_cycle: str  # "monthly", "quarterly", "annual"
    
    created_at: datetime = Field(default_factory=get_ist_now)
    updated_at: datetime = Field(default_factory=get_ist_now)
    
    class Config:
        json_schema_extra = {
            "example": {
                "company_name": "TechCorp India",
                "registration_number": "REG-12345",
                "industry": "IT",
                "employee_count": 500,
                "headquarters_city": "Bangalore",
                "subscription_status": "professional"
            }
        }


class CorporateEmployee(BaseModel):
    """Employee enrolled in corporate ride program."""
    id: str = Field(default_factory=lambda: str(get_ist_now().timestamp()))
    company_id: str
    user_id: str  # Reference to main user
    employee_id: str  # Company's internal employee ID
    name: str
    email: str
    phone: str
    department: str
    job_title: str
    manager_id: Optional[str] = None
    
    # Employee status
    is_active: bool = True
    employment_type: str  # "full_time", "part_time", "contractor"
    joined_date: datetime
    
    # Ride policy
    monthly_ride_budget: float = Field(ge=0)
    rides_per_month_limit: int
    approved_destinations: List[str] = Field(default_factory=list)  # Predefined list
    role_in_program: EmployeeRoleType = EmployeeRoleType.EMPLOYEE
    
    # Tracking
    rides_used_this_month: int = 0
    budget_spent_this_month: float = 0.0
    total_distance_km: float = 0.0
    
    created_at: datetime = Field(default_factory=get_ist_now)
    updated_at: datetime = Field(default_factory=get_ist_now)
    
    class Config:
        json_schema_extra = {
            "example": {
                "company_id": "corp_123",
                "employee_id": "EMP-001",
                "name": "Rajesh Kumar",
                "department": "Engineering",
                "monthly_ride_budget": 5000,
                "rides_per_month_limit": 20
            }
        }


class CorporateRidePolicy(BaseModel):
    """Policy that governs employee ride usage."""
    id: str = Field(default_factory=lambda: str(get_ist_now().timestamp()))
    company_id: str
    policy_name: str
    policy_type: RidePolicyType
    description: str
    
    # Policy configuration
    is_active: bool = True
    applies_to_roles: List[EmployeeRoleType] = Field(default_factory=list)
    
    # Predefined Routes (if applicable)
    origin_location: Optional[str] = None
    destination_location: Optional[str] = None
    route_name: Optional[str] = None
    
    # Time Window (if applicable)
    allowed_start_time: Optional[str] = None  # HH:MM
    allowed_end_time: Optional[str] = None    # HH:MM
    allowed_days: List[str] = Field(default_factory=list)  # Mon-Fri
    
    # Budget Limits (if applicable)
    max_ride_cost: Optional[float] = None
    max_monthly_cost: Optional[float] = None
    
    # Destination Restrictions
    forbidden_destinations: List[str] = Field(default_factory=list)
    allowed_city_zones: List[str] = Field(default_factory=list)
    
    # Provider Restrictions
    preferred_providers: List[str] = Field(default_factory=list)  # e.g., ["uber", "ola"]
    require_approval: bool = False
    
    created_at: datetime = Field(default_factory=get_ist_now)
    
    class Config:
        json_schema_extra = {
            "example": {
                "company_id": "corp_123",
                "policy_name": "Office to Home",
                "policy_type": "predefined_routes",
                "origin_location": "TechCorp HQ",
                "destination_location": "Employee's registered home address"
            }
        }


class CorporateRideRequest(BaseModel):
    """Request for a ride that may need corporate approval."""
    id: str = Field(default_factory=lambda: str(get_ist_now().timestamp()))
    company_id: str
    employee_id: str
    
    # Ride details
    ride_date: datetime
    pickup_location: str
    dropoff_location: str
    pickup_latitude: float
    pickup_longitude: float
    dropoff_latitude: float
    dropoff_longitude: float
    
    # Ride type & preferences
    ride_type: str  # "uber", "ola", "auto", "premium"
    passengers: int
    estimated_cost: float
    actual_cost: Optional[float] = None
    
    # Approval workflow
    status: CorporateRideStatus = CorporateRideStatus.REQUESTED
    requires_approval: bool
    approval_status: CorporateApprovalStatus = CorporateApprovalStatus.PENDING
    approver_id: Optional[str] = None
    approval_notes: Optional[str] = None
    approved_at: Optional[datetime] = None
    
    # Policy compliance
    policy_id: Optional[str] = None
    policy_compliant: bool = True
    policy_violation_reason: Optional[str] = None
    
    # Tracking
    ride_id: Optional[str] = None  # Link to actual ride
    expense_report_id: Optional[str] = None
    
    requested_at: datetime = Field(default_factory=get_ist_now)
    completed_at: Optional[datetime] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "company_id": "corp_123",
                "employee_id": "emp_001",
                "pickup_location": "TechCorp HQ",
                "dropoff_location": "Airport Terminal 3",
                "estimated_cost": 450,
                "requires_approval": True
            }
        }


class ApprovalWorkflow(BaseModel):
    """Approval workflow for corporate rides."""
    id: str = Field(default_factory=lambda: str(get_ist_now().timestamp()))
    company_id: str
    ride_request_id: str
    
    # Approval chain
    required_approvers: List[str] = Field(default_factory=list)  # Manager IDs
    current_approver_index: int = 0
    approval_history: List[Dict[str, Any]] = Field(default_factory=list)
    
    # Workflow status
    is_approved: bool = False
    is_rejected: bool = False
    rejection_reason: Optional[str] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=get_ist_now)
    last_updated: datetime = Field(default_factory=get_ist_now)
    expires_at: datetime
    
    class Config:
        json_schema_extra = {
            "example": {
                "company_id": "corp_123",
                "ride_request_id": "req_456",
                "required_approvers": ["manager_001", "finance_001"],
                "current_approver_index": 0
            }
        }


class CorporateInvoice(BaseModel):
    """Monthly invoice for corporate entity."""
    id: str = Field(default_factory=lambda: str(get_ist_now().timestamp()))
    company_id: str
    invoice_number: str  # e.g., "INV-2024-001"
    
    # Period
    billing_month: str  # YYYY-MM
    start_date: datetime
    end_date: datetime
    
    # Charges
    total_rides: int
    total_ride_cost: float
    platform_fee: float  # % of ride cost
    taxes: float
    total_amount: float
    
    # Employee breakdown
    employee_breakdown: List[Dict[str, Any]] = Field(default_factory=list)
    
    # Payment status
    status: str  # "draft", "sent", "pending", "paid", "overdue"
    payment_due_date: datetime
    payment_date: Optional[datetime] = None
    
    # Additional info
    notes: Optional[str] = None
    created_at: datetime = Field(default_factory=get_ist_now)
    
    class Config:
        json_schema_extra = {
            "example": {
                "company_id": "corp_123",
                "invoice_number": "INV-2024-003",
                "billing_month": "2024-03",
                "total_rides": 125,
                "total_ride_cost": 25000,
                "total_amount": 27500
            }
        }


class CorporateCostCenter(BaseModel):
    """Department or cost center for ride expense allocation."""
    id: str = Field(default_factory=lambda: str(get_ist_now().timestamp()))
    company_id: str
    cost_center_code: str
    cost_center_name: str
    department_name: str
    
    # Budget allocation
    allocated_budget: float = Field(ge=0)
    budget_cycle: str  # "monthly", "quarterly", "annual"
    spent_budget: float = 0.0
    
    # Tracking
    employee_count: int
    rides_this_period: int = 0
    total_cost_this_period: float = 0.0
    
    created_at: datetime = Field(default_factory=get_ist_now)
    
    class Config:
        json_schema_extra = {
            "example": {
                "company_id": "corp_123",
                "cost_center_code": "CC-ENG-001",
                "cost_center_name": "Engineering Dept",
                "allocated_budget": 50000,
                "budget_cycle": "monthly"
            }
        }


class CorporateExpenseReport(BaseModel):
    """Expense report for rides taken under corporate program."""
    id: str = Field(default_factory=lambda: str(get_ist_now().timestamp()))
    company_id: str
    employee_id: str
    report_period: str  # YYYY-MM
    
    # Rides included
    ride_requests: List[str] = Field(default_factory=list)  # Ride request IDs
    total_rides: int = 0
    total_cost: float = 0.0
    
    # Approval
    approver_id: Optional[str] = None
    approval_status: str  # "draft", "submitted", "approved", "rejected"
    submitted_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    
    # Reimbursement
    reimbursement_status: str  # "pending", "processed", "paid"
    reimbursement_amount: float = 0.0
    reimbursement_date: Optional[datetime] = None
    
    created_at: datetime = Field(default_factory=get_ist_now)
    
    class Config:
        json_schema_extra = {
            "example": {
                "company_id": "corp_123",
                "employee_id": "emp_001",
                "report_period": "2024-03",
                "total_rides": 15,
                "total_cost": 3500
            }
        }
