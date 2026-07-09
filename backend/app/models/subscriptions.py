"""
Subscription Management Models
MongoDB models for subscription plans, user subscriptions, and transactions
"""
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from bson import ObjectId


class SubscriptionPlan(BaseModel):
    """Subscription Plan MongoDB Model"""
    id: Optional[str] = Field(None, alias="_id")
    name: str
    tier: str  # simple, smart, pro
    description: Optional[str] = None
    price: float
    currency: str = "USD"
    billing_cycle: str = "monthly"  # monthly, yearly, quarterly
    trial_days: int = 0
    features: Dict[str, Any]
    is_active: bool = True
    display_order: int = 0
    stripe_price_id: Optional[str] = None
    stripe_product_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str, datetime: lambda v: v.isoformat()}


class UserSubscription(BaseModel):
    """User Subscription MongoDB Model"""
    id: Optional[str] = Field(None, alias="_id")
    user_id: str
    plan_id: str
    status: str  # active, inactive, canceled, past_due, trialing, expired
    current_period_start: datetime
    current_period_end: datetime
    cancel_at_period_end: bool = False
    canceled_at: Optional[datetime] = None
    cancellation_reason: Optional[str] = None
    trial_start: Optional[datetime] = None
    trial_end: Optional[datetime] = None
    stripe_subscription_id: Optional[str] = None
    stripe_customer_id: Optional[str] = None
    stripe_payment_method_id: Optional[str] = None
    rides_used_this_period: int = 0
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str, datetime: lambda v: v.isoformat()}


class SubscriptionTransaction(BaseModel):
    """Subscription Transaction MongoDB Model"""
    id: Optional[str] = Field(None, alias="_id")
    subscription_id: str
    user_id: str
    plan_id: str
    amount: float
    currency: str = "USD"
    status: str  # succeeded, pending, failed, refunded
    transaction_type: str  # payment, refund, proration
    stripe_payment_intent_id: Optional[str] = None
    stripe_invoice_id: Optional[str] = None
    description: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str, datetime: lambda v: v.isoformat()}


class SubscriptionCoupon(BaseModel):
    """Subscription Coupon MongoDB Model"""
    id: Optional[str] = Field(None, alias="_id")
    code: str
    discount_type: str  # percentage, fixed_amount
    discount_value: float
    duration: str  # once, repeating, forever
    duration_in_months: Optional[int] = None
    max_redemptions: Optional[int] = None
    redemptions_count: int = 0
    valid_from: datetime = Field(default_factory=datetime.utcnow)
    valid_until: Optional[datetime] = None
    applicable_plans: Optional[list] = None  # None = all plans
    is_active: bool = True
    stripe_coupon_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    
    class Config:
        populate_by_name = True
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str, datetime: lambda v: v.isoformat()}
