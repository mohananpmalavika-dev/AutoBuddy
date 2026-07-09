"""
Subscription Management Router
API endpoints for subscription plans and user subscriptions
"""
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from typing import List, Optional
from datetime import datetime

from app.schemas.subscriptions import (
    SubscriptionPlanCreate,
    SubscriptionPlanUpdate,
    SubscriptionPlanResponse,
    UserSubscriptionCreate,
    UserSubscriptionResponse,
    SubscriptionUpgradeRequest,
    SubscriptionCancelRequest,
    SubscriptionUsageResponse,
    SubscriptionListResponse
)
from app.services.subscription_service import SubscriptionService
from app.middleware.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/v1/subscriptions", tags=["subscriptions"])
subscription_service = SubscriptionService()


# ==================== SUBSCRIPTION PLANS ====================

@router.get("/plans", response_model=List[SubscriptionPlanResponse])
async def get_subscription_plans(include_inactive: bool = False):
    """
    Get all subscription plans
    
    - **include_inactive**: Include inactive plans (admin only)
    """
    plans = await subscription_service.get_all_plans(include_inactive=include_inactive)
    return plans


@router.get("/plans/{plan_id}", response_model=SubscriptionPlanResponse)
async def get_subscription_plan(plan_id: str):
    """Get a specific subscription plan"""
    plan = await subscription_service.get_plan(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Subscription plan not found")
    return plan


@router.post("/plans", response_model=SubscriptionPlanResponse, dependencies=[Depends(require_admin)])
async def create_subscription_plan(plan: SubscriptionPlanCreate):
    """
    Create a new subscription plan (Admin only)
    
    Creates plan in both database and Stripe
    """
    try:
        new_plan = await subscription_service.create_plan(plan)
        return new_plan
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create plan: {str(e)}")


@router.put("/plans/{plan_id}", response_model=SubscriptionPlanResponse, dependencies=[Depends(require_admin)])
async def update_subscription_plan(plan_id: str, update: SubscriptionPlanUpdate):
    """Update a subscription plan (Admin only)"""
    try:
        updated_plan = await subscription_service.update_plan(plan_id, update)
        if not updated_plan:
            raise HTTPException(status_code=404, detail="Plan not found")
        return updated_plan
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to update plan: {str(e)}")


# ==================== USER SUBSCRIPTIONS ====================

@router.post("/subscribe", response_model=UserSubscriptionResponse)
async def subscribe_to_plan(
    subscription: UserSubscriptionCreate,
    current_user: dict = Depends(get_current_user)
):
    """
    Subscribe current user to a plan
    
    - **plan_id**: ID of the subscription plan
    - **payment_method_id**: Stripe Payment Method ID (optional for trial)
    - **trial_end**: Custom trial end date (optional)
    - **coupon_code**: Discount coupon code (optional)
    """
    try:
        new_subscription = await subscription_service.subscribe_user(
            user_id=current_user["id"],
            plan_id=subscription.plan_id,
            payment_method_id=subscription.payment_method_id,
            trial_end=subscription.trial_end,
            coupon_code=subscription.coupon_code
        )
        return new_subscription
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create subscription: {str(e)}")


@router.get("/my-subscription", response_model=Optional[UserSubscriptionResponse])
async def get_my_subscription(current_user: dict = Depends(get_current_user)):
    """Get current user's active subscription"""
    subscription = await subscription_service.get_user_subscription(current_user["id"])
    if not subscription:
        return None
    
    # Fetch plan details
    plan = await subscription_service.get_plan(subscription.plan_id)
    response = UserSubscriptionResponse(**subscription.model_dump())
    if plan:
        response.plan = SubscriptionPlanResponse(**plan.model_dump())
    
    return response


@router.put("/upgrade", response_model=UserSubscriptionResponse)
async def upgrade_subscription(
    upgrade: SubscriptionUpgradeRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Upgrade or downgrade subscription
    
    - **new_plan_id**: ID of the new plan
    - **proration_behavior**: "create_prorations" (default) or "none"
    """
    try:
        updated_subscription = await subscription_service.upgrade_subscription(
            user_id=current_user["id"],
            new_plan_id=upgrade.new_plan_id,
            proration_behavior=upgrade.proration_behavior
        )
        return updated_subscription
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upgrade subscription: {str(e)}")


@router.delete("/cancel", response_model=UserSubscriptionResponse)
async def cancel_subscription(
    cancel: SubscriptionCancelRequest,
    current_user: dict = Depends(get_current_user)
):
    """
    Cancel subscription
    
    - **cancel_at_period_end**: Cancel at end of billing period (true) or immediately (false)
    - **reason**: Cancellation reason (optional)
    """
    try:
        canceled_subscription = await subscription_service.cancel_subscription(
            user_id=current_user["id"],
            cancel_at_period_end=cancel.cancel_at_period_end,
            reason=cancel.reason
        )
        if not canceled_subscription:
            raise HTTPException(status_code=404, detail="No active subscription found")
        return canceled_subscription
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to cancel subscription: {str(e)}")


@router.get("/usage", response_model=SubscriptionUsageResponse)
async def get_subscription_usage(current_user: dict = Depends(get_current_user)):
    """Get current subscription usage statistics"""
    subscription = await subscription_service.get_user_subscription(current_user["id"])
    if not subscription:
        raise HTTPException(status_code=404, detail="No active subscription found")
    
    plan = await subscription_service.get_plan(subscription.plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    rides_limit = plan.features.get("max_rides_per_month")
    rides_remaining = None
    usage_percentage = None
    
    if rides_limit is not None:
        rides_remaining = max(0, rides_limit - subscription.rides_used_this_period)
        usage_percentage = (subscription.rides_used_this_period / rides_limit * 100) if rides_limit > 0 else 0
    
    days_remaining = (subscription.current_period_end - datetime.utcnow()).days
    
    return SubscriptionUsageResponse(
        subscription_id=subscription.id,
        rides_used=subscription.rides_used_this_period,
        rides_limit=rides_limit,
        rides_remaining=rides_remaining,
        period_start=subscription.current_period_start,
        period_end=subscription.current_period_end,
        days_remaining=max(0, days_remaining),
        usage_percentage=usage_percentage
    )


# ==================== WEBHOOKS ====================

@router.post("/webhook")
async def stripe_webhook(request: Request, stripe_signature: str = Header(None)):
    """
    Handle Stripe webhook events
    
    Processes subscription lifecycle events from Stripe
    """
    import stripe
    import os
    
    webhook_secret = os.environ.get("STRIPE_WEBHOOK_SECRET", "")
    if not webhook_secret:
        raise HTTPException(status_code=500, detail="Webhook secret not configured")
    
    payload = await request.body()
    
    try:
        event = stripe.Webhook.construct_event(
            payload, stripe_signature, webhook_secret
        )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    except stripe.error.SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid signature")
    
    # Handle the event
    event_type = event["type"]
    event_data = event["data"]["object"]
    
    try:
        await subscription_service.handle_webhook(event_type, event_data)
    except Exception as e:
        print(f"Webhook processing error: {e}")
        # Don't raise error to Stripe, log and continue
    
    return {"status": "success"}


# ==================== ADMIN ENDPOINTS ====================

@router.get("/admin/users/{user_id}/subscription", response_model=Optional[UserSubscriptionResponse], dependencies=[Depends(require_admin)])
async def get_user_subscription_admin(user_id: str):
    """Get any user's subscription (Admin only)"""
    subscription = await subscription_service.get_user_subscription(user_id)
    if not subscription:
        return None
    
    plan = await subscription_service.get_plan(subscription.plan_id)
    response = UserSubscriptionResponse(**subscription.model_dump())
    if plan:
        response.plan = SubscriptionPlanResponse(**plan.model_dump())
    
    return response
