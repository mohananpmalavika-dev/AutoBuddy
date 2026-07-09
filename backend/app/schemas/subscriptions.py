"""
Subscription Management Schemas
Pydantic models for subscription plans, user subscriptions, and transactions
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field, validator


class SubscriptionPlanTier(str, Enum):
    """Subscription plan tiers"""
    SIMPLE = "simple"
    SMART = "smart"
    PRO = "pro"


class SubscriptionStatus(str, Enum):
    """Subscription statuses"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    CANCELED = "canceled"
    PAST_DUE = "past_due"
    TRIALING = "trialing"
    EXPIRED = "expired"


class BillingCycle(str, Enum):
    """Billing cycle options"""
    MONTHLY = "monthly"
    YEARLY = "yearly"
    QUARTERLY = "quarterly"


class SubscriptionPlanFeatures(BaseModel):
    """Features included in a subscription plan"""
    max_rides_per_month: Optional[int] = Field(None, description="Maximum rides per month, None = unlimited")
    ai_travel_intent: bool = Field(False, description="AI-powered natural language booking")
    family_assistant: bool = Field(False, description="Manage rides for family members")
    priority_support: bool = Field(False, description="Priority customer support")
    ride_scheduling: bool = Field(True, description="Schedule rides in advance")
    ride_history_days: int = Field(90, description="Days of ride history to keep")
    concurrent_bookings: int = Field(1, description="Number of concurrent active bookings")
    no_surge_pricing: bool = Field(False, description="Exemption from surge pricing")
    carbon_offset: bool = Field(False, description="Automatic carbon offset for rides")
    premium_vehicles: bool = Field(False, description="Access to premium vehicle categories")
    discount_percentage: int = Field(0, ge=0, le=100, description="Discount percentage on rides")
    free_cancellations_per_month: int = Field(0, ge=0, description="Free ride cancellations per month")
    
    class Config:
        json_schema_extra = {
            "example": {
                "max_rides_per_month": 50,
                "ai_travel_intent": True,
                "family_assistant": True,
                "priority_support": True,
                "ride_scheduling": True,
                "ride_history_days": 365,
                "concurrent_bookings": 3,
                "no_surge_pricing": False,
                "carbon_offset": True,
                "premium_vehicles": True,
                "discount_percentage": 10,
                "free_cancellations_per_month": 5
            }
        }


class SubscriptionPlanBase(BaseModel):
    """Base subscription plan schema"""
    name: str = Field(..., min_length=1, max_length=100, description="Plan name")
    tier: SubscriptionPlanTier = Field(..., description="Plan tier")
    description: Optional[str] = Field(None, max_length=500, description="Plan description")
    price: float = Field(..., ge=0, description="Plan price")
    currency: str = Field("USD", min_length=3, max_length=3, description="Currency code (ISO 4217)")
    billing_cycle: BillingCycle = Field(BillingCycle.MONTHLY, description="Billing cycle")
    trial_days: int = Field(0, ge=0, le=90, description="Free trial period in days")
    features: SubscriptionPlanFeatures = Field(..., description="Plan features")
    is_active: bool = Field(True, description="Is plan available for new subscriptions")
    display_order: int = Field(0, description="Display order in UI")


class SubscriptionPlanCreate(SubscriptionPlanBase):
    """Schema for creating a subscription plan"""
    stripe_price_id: Optional[str] = Field(None, description="Stripe Price ID")
    stripe_product_id: Optional[str] = Field(None, description="Stripe Product ID")


class SubscriptionPlanUpdate(BaseModel):
    """Schema for updating a subscription plan"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    price: Optional[float] = Field(None, ge=0)
    trial_days: Optional[int] = Field(None, ge=0, le=90)
    features: Optional[SubscriptionPlanFeatures] = None
    is_active: Optional[bool] = None
    display_order: Optional[int] = None


class SubscriptionPlanResponse(SubscriptionPlanBase):
    """Schema for subscription plan response"""
    id: str = Field(..., description="Plan ID")
    stripe_price_id: Optional[str] = Field(None, description="Stripe Price ID")
    stripe_product_id: Optional[str] = Field(None, description="Stripe Product ID")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    
    class Config:
        from_attributes = True


class UserSubscriptionCreate(BaseModel):
    """Schema for creating a user subscription"""
    plan_id: str = Field(..., description="Subscription plan ID")
    payment_method_id: Optional[str] = Field(None, description="Stripe Payment Method ID")
    trial_end: Optional[datetime] = Field(None, description="Trial end date")
    coupon_code: Optional[str] = Field(None, description="Coupon code for discount")


class UserSubscriptionResponse(BaseModel):
    """Schema for user subscription response"""
    id: str = Field(..., description="Subscription ID")
    user_id: str = Field(..., description="User ID")
    plan_id: str = Field(..., description="Plan ID")
    plan: Optional[SubscriptionPlanResponse] = Field(None, description="Plan details")
    status: SubscriptionStatus = Field(..., description="Subscription status")
    current_period_start: datetime = Field(..., description="Current period start")
    current_period_end: datetime = Field(..., description="Current period end")
    cancel_at_period_end: bool = Field(False, description="Will cancel at period end")
    canceled_at: Optional[datetime] = Field(None, description="Cancellation timestamp")
    trial_start: Optional[datetime] = Field(None, description="Trial start date")
    trial_end: Optional[datetime] = Field(None, description="Trial end date")
    stripe_subscription_id: Optional[str] = Field(None, description="Stripe Subscription ID")
    stripe_customer_id: Optional[str] = Field(None, description="Stripe Customer ID")
    rides_used_this_period: int = Field(0, description="Rides used in current period")
    created_at: datetime = Field(..., description="Creation timestamp")
    updated_at: datetime = Field(..., description="Last update timestamp")
    
    class Config:
        from_attributes = True


class SubscriptionUpgradeRequest(BaseModel):
    """Schema for upgrading/downgrading subscription"""
    new_plan_id: str = Field(..., description="New plan ID")
    proration_behavior: str = Field("create_prorations", description="create_prorations or none")


class SubscriptionCancelRequest(BaseModel):
    """Schema for canceling subscription"""
    cancel_at_period_end: bool = Field(True, description="Cancel at period end or immediately")
    reason: Optional[str] = Field(None, max_length=500, description="Cancellation reason")


class SubscriptionUsageResponse(BaseModel):
    """Schema for subscription usage statistics"""
    subscription_id: str
    rides_used: int
    rides_limit: Optional[int]
    rides_remaining: Optional[int]
    period_start: datetime
    period_end: datetime
    days_remaining: int
    usage_percentage: Optional[float]


class SubscriptionWebhookEvent(BaseModel):
    """Schema for Stripe webhook events"""
    event_type: str
    subscription_id: str
    customer_id: str
    data: Dict[str, Any]
    received_at: datetime = Field(default_factory=datetime.utcnow)


class SubscriptionListResponse(BaseModel):
    """Schema for paginated subscription list"""
    items: List[SubscriptionPlanResponse]
    total: int
    page: int
    page_size: int
    has_more: bool
