"""
Advanced Features - Rental, Subscriptions, Corporate Accounts
Premium features for enterprise and frequent users
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Optional
from pydantic import BaseModel, Field
from decimal import Decimal
from enum import Enum

from app.database import get_db

router = APIRouter(prefix="/api/v2/advanced", tags=["Advanced Features"])

class SubscriptionPlan(str, Enum):
    DAILY = "DAILY"
    WEEKLY = "WEEKLY"
    MONTHLY = "MONTHLY"
    ANNUAL = "ANNUAL"

class RentalRequest(BaseModel):
    passenger_id: str
    start_date: str  # ISO format
    end_date: str    # ISO format
    vehicle_type_id: int
    driver_preference: Optional[str] = None
    insurance_included: bool = True
    fuel_included: bool = True

class RentalResponse(BaseModel):
    rental_id: str
    total_days: int
    daily_rate: Decimal
    total_amount: Decimal
    insurance_cost: Decimal
    status: str
    confirmation_number: str

class SubscriptionRequest(BaseModel):
    passenger_id: str
    plan: SubscriptionPlan
    rides_per_month: int
    vehicle_types: List[int]
    automatic_renewal: bool = True

class SubscriptionResponse(BaseModel):
    subscription_id: str
    plan: SubscriptionPlan
    monthly_cost: Decimal
    rides_included: int
    valid_from: str
    valid_to: str
    discount_percentage: float
    status: str

class CorporateAccountRequest(BaseModel):
    company_name: str
    company_email: str
    num_employees: int
    admin_name: str
    admin_phone: str

class CorporateAccountResponse(BaseModel):
    corporate_id: str
    company_name: str
    status: str
    api_key: str
    portal_url: str
    onboarding_progress: int

# ============== RENTAL ENDPOINTS ==============

@router.post("/rentals/book")
async def book_vehicle_rental(
    request: RentalRequest,
    db: Session = Depends(get_db)
) -> RentalResponse:
    """
    Book a vehicle for rental (hourly, daily, or long-term)
    """
    
    start = datetime.fromisoformat(request.start_date)
    end = datetime.fromisoformat(request.end_date)
    days = (end - start).days
    
    if days < 1:
        raise HTTPException(status_code=400, detail="Rental must be at least 1 day")
    
    # Pricing
    daily_rate = Decimal("1500.00")
    insurance_cost = Decimal("200.00") if request.insurance_included else Decimal("0.00")
    total_amount = (daily_rate * days) + insurance_cost
    
    # Apply discount for longer rentals
    if days >= 30:
        total_amount = total_amount * Decimal("0.85")  # 15% discount
    elif days >= 7:
        total_amount = total_amount * Decimal("0.90")  # 10% discount
    
    rental_id = f"RENT_{int(start.timestamp())}"
    
    return RentalResponse(
        rental_id=rental_id,
        total_days=days,
        daily_rate=daily_rate,
        total_amount=total_amount,
        insurance_cost=insurance_cost,
        status="CONFIRMED",
        confirmation_number=f"RC_{rental_id}"
    )

@router.get("/rentals/my-rentals/{passenger_id}")
async def get_passenger_rentals(passenger_id: str):
    """Get all rentals for a passenger"""
    
    return {
        "passenger_id": passenger_id,
        "total_rentals": 2,
        "rentals": [
            {
                "rental_id": "RENT_1",
                "start_date": (datetime.now() + timedelta(days=5)).isoformat(),
                "end_date": (datetime.now() + timedelta(days=10)).isoformat(),
                "total_cost": 7500.00,
                "status": "CONFIRMED"
            },
            {
                "rental_id": "RENT_2",
                "start_date": (datetime.now() + timedelta(days=30)).isoformat(),
                "end_date": (datetime.now() + timedelta(days=37)).isoformat(),
                "total_cost": 8925.00,
                "status": "PENDING"
            }
        ]
    }

# ============== SUBSCRIPTION ENDPOINTS ==============

@router.post("/subscriptions/activate")
async def activate_subscription(
    request: SubscriptionRequest,
    db: Session = Depends(get_db)
) -> SubscriptionResponse:
    """
    Activate a subscription plan for unlimited/discounted rides
    """
    
    pricing = {
        SubscriptionPlan.DAILY: {"cost": Decimal("99"), "rides": 3, "discount": 10},
        SubscriptionPlan.WEEKLY: {"cost": Decimal("499"), "rides": 15, "discount": 15},
        SubscriptionPlan.MONTHLY: {"cost": Decimal("1999"), "rides": 60, "discount": 25},
        SubscriptionPlan.ANNUAL: {"cost": Decimal("19999"), "rides": 700, "discount": 35}
    }
    
    plan_details = pricing.get(request.plan)
    
    subscription_id = f"SUB_{request.passenger_id}_{int(datetime.now().timestamp())}"
    valid_from = datetime.now().isoformat()
    
    if request.plan == SubscriptionPlan.DAILY:
        valid_to = (datetime.now() + timedelta(days=1)).isoformat()
    elif request.plan == SubscriptionPlan.WEEKLY:
        valid_to = (datetime.now() + timedelta(weeks=1)).isoformat()
    elif request.plan == SubscriptionPlan.MONTHLY:
        valid_to = (datetime.now() + timedelta(days=30)).isoformat()
    else:
        valid_to = (datetime.now() + timedelta(days=365)).isoformat()
    
    return SubscriptionResponse(
        subscription_id=subscription_id,
        plan=request.plan,
        monthly_cost=plan_details["cost"],
        rides_included=plan_details["rides"],
        valid_from=valid_from,
        valid_to=valid_to,
        discount_percentage=plan_details["discount"],
        status="ACTIVE"
    )

@router.get("/subscriptions/active/{passenger_id}")
async def get_active_subscription(passenger_id: str):
    """Get passenger's active subscription"""
    
    return {
        "passenger_id": passenger_id,
        "subscription_id": "SUB_PASS_1234_1717129200",
        "plan": "MONTHLY",
        "monthly_cost": 1999.00,
        "rides_used": 23,
        "rides_remaining": 37,
        "valid_until": (datetime.now() + timedelta(days=15)).isoformat(),
        "discount_percentage": 25,
        "status": "ACTIVE",
        "renewal_enabled": True
    }

@router.post("/subscriptions/cancel/{subscription_id}")
async def cancel_subscription(subscription_id: str):
    """Cancel an active subscription"""
    
    return {
        "subscription_id": subscription_id,
        "status": "CANCELLED",
        "refund_amount": 1000.00,
        "message": "Subscription cancelled. Refund will be processed in 3-5 business days."
    }

@router.get("/subscriptions/plans")
async def get_available_plans():
    """Get all available subscription plans"""
    
    return {
        "plans": [
            {
                "name": "Daily Pass",
                "code": "DAILY",
                "cost": 99,
                "rides": 3,
                "discount": "10%",
                "features": ["Unlimited distance", "Priority support"]
            },
            {
                "name": "Weekly Pass",
                "code": "WEEKLY",
                "cost": 499,
                "rides": 15,
                "discount": "15%",
                "features": ["Unlimited distance", "Priority support", "Pool rides"]
            },
            {
                "name": "Monthly Pass",
                "code": "MONTHLY",
                "cost": 1999,
                "rides": 60,
                "discount": "25%",
                "features": ["Unlimited distance", "Priority support", "Pool rides", "Free cancellations"]
            },
            {
                "name": "Annual Pass",
                "code": "ANNUAL",
                "cost": 19999,
                "rides": 700,
                "discount": "35%",
                "features": ["Unlimited distance", "VIP support", "Pool rides", "Free cancellations", "Birthday bonus"]
            }
        ]
    }

# ============== CORPORATE ACCOUNT ENDPOINTS ==============

@router.post("/corporate/register")
async def register_corporate_account(
    request: CorporateAccountRequest,
    db: Session = Depends(get_db)
) -> CorporateAccountResponse:
    """
    Register a corporate account for businesses
    Provides API access and employee management
    """
    
    corporate_id = f"CORP_{int(datetime.now().timestamp())}"
    api_key = f"sk_live_{corporate_id}_{int(datetime.now().timestamp())}"
    
    return CorporateAccountResponse(
        corporate_id=corporate_id,
        company_name=request.company_name,
        status="PENDING_VERIFICATION",
        api_key=api_key,
        portal_url=f"https://corporate.autobuddy.io/{corporate_id}",
        onboarding_progress=30
    )

@router.get("/corporate/{corporate_id}/dashboard")
async def get_corporate_dashboard(corporate_id: str):
    """Get corporate account dashboard"""
    
    return {
        "corporate_id": corporate_id,
        "company_name": "Tech Company Inc",
        "status": "ACTIVE",
        "total_employees": 150,
        "active_employees": 145,
        "rides_this_month": 2345,
        "total_spending": 456750.00,
        "average_ride_cost": 195.00,
        "monthly_budget": 500000.00,
        "budget_remaining": 43250.00,
        "api_usage": {
            "calls_today": 1234,
            "calls_limit": 10000,
            "percentage_used": 12.34
        }
    }

@router.post("/corporate/{corporate_id}/employees/manage")
async def manage_corporate_employees(
    corporate_id: str,
    employee_email: str = Query(...),
    action: str = Query(..., regex="^(ADD|REMOVE|ACTIVATE|DEACTIVATE)$")
):
    """Add, remove, or manage corporate employees"""
    
    return {
        "corporate_id": corporate_id,
        "employee_email": employee_email,
        "action": action,
        "status": "SUCCESS",
        "message": f"Employee {action.lower()}ed successfully"
    }

@router.get("/corporate/{corporate_id}/billing")
async def get_corporate_billing(corporate_id: str):
    """Get corporate billing information"""
    
    return {
        "corporate_id": corporate_id,
        "current_month": datetime.now().month,
        "current_year": datetime.now().year,
        "total_rides": 2345,
        "total_amount": 456750.00,
        "invoice_status": "PAID",
        "next_billing_date": (datetime.now() + timedelta(days=5)).isoformat(),
        "previous_invoices": [
            {
                "invoice_id": "INV_001",
                "date": (datetime.now() - timedelta(days=30)).isoformat(),
                "amount": 445000.00,
                "status": "PAID"
            }
        ]
    }

@router.post("/corporate/{corporate_id}/api-keys/generate")
async def generate_api_key(corporate_id: str):
    """Generate new API key for corporate account"""
    
    new_api_key = f"sk_live_{corporate_id}_{int(datetime.now().timestamp())}"
    
    return {
        "api_key": new_api_key,
        "status": "ACTIVE",
        "created_at": datetime.now().isoformat(),
        "message": "New API key generated successfully. Save it securely."
    }
