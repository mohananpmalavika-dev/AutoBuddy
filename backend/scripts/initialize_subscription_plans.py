"""
Initialize Default Subscription Plans
Run this script to create the default Simple, Smart, and Pro plans
"""
import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.services.subscription_service import SubscriptionService
from app.schemas.subscriptions import (
    SubscriptionPlanCreate,
    SubscriptionPlanTier,
    BillingCycle,
    SubscriptionPlanFeatures
)


async def initialize_plans():
    """Create default subscription plans"""
    service = SubscriptionService()
    
    # Simple Plan (Free)
    simple_plan = SubscriptionPlanCreate(
        name="Simple",
        tier=SubscriptionPlanTier.SIMPLE,
        description="Basic ride booking features for casual users",
        price=0.00,
        currency="USD",
        billing_cycle=BillingCycle.MONTHLY,
        trial_days=0,
        features=SubscriptionPlanFeatures(
            max_rides_per_month=10,
            ai_travel_intent=False,
            family_assistant=False,
            priority_support=False,
            ride_scheduling=True,
            ride_history_days=30,
            concurrent_bookings=1,
            no_surge_pricing=False,
            carbon_offset=False,
            premium_vehicles=False,
            discount_percentage=0,
            free_cancellations_per_month=1
        ),
        is_active=True,
        display_order=1
    )
    
    # Smart Plan
    smart_plan = SubscriptionPlanCreate(
        name="Smart",
        tier=SubscriptionPlanTier.SMART,
        description="AI-powered features and family assistant for regular users",
        price=9.99,
        currency="USD",
        billing_cycle=BillingCycle.MONTHLY,
        trial_days=14,
        features=SubscriptionPlanFeatures(
            max_rides_per_month=50,
            ai_travel_intent=True,
            family_assistant=True,
            priority_support=False,
            ride_scheduling=True,
            ride_history_days=180,
            concurrent_bookings=3,
            no_surge_pricing=False,
            carbon_offset=True,
            premium_vehicles=False,
            discount_percentage=5,
            free_cancellations_per_month=5
        ),
        is_active=True,
        display_order=2
    )
    
    # Pro Plan
    pro_plan = SubscriptionPlanCreate(
        name="Pro",
        tier=SubscriptionPlanTier.PRO,
        description="Unlimited rides with premium features and priority support",
        price=19.99,
        currency="USD",
        billing_cycle=BillingCycle.MONTHLY,
        trial_days=14,
        features=SubscriptionPlanFeatures(
            max_rides_per_month=None,  # Unlimited
            ai_travel_intent=True,
            family_assistant=True,
            priority_support=True,
            ride_scheduling=True,
            ride_history_days=365,
            concurrent_bookings=5,
            no_surge_pricing=True,
            carbon_offset=True,
            premium_vehicles=True,
            discount_percentage=15,
            free_cancellations_per_month=10
        ),
        is_active=True,
        display_order=3
    )
    
    print("Creating subscription plans...")
    
    try:
        simple = await service.create_plan(simple_plan)
        print(f"✓ Created Simple plan: {simple.id}")
    except Exception as e:
        print(f"✗ Failed to create Simple plan: {e}")
    
    try:
        smart = await service.create_plan(smart_plan)
        print(f"✓ Created Smart plan: {smart.id}")
    except Exception as e:
        print(f"✗ Failed to create Smart plan: {e}")
    
    try:
        pro = await service.create_plan(pro_plan)
        print(f"✓ Created Pro plan: {pro.id}")
    except Exception as e:
        print(f"✗ Failed to create Pro plan: {e}")
    
    print("\nSubscription plans initialized successfully!")
    print("\nPlan Summary:")
    print("  Simple: Free - 10 rides/month, basic features")
    print("  Smart: $9.99/month - 50 rides/month, AI features, family assistant")
    print("  Pro: $19.99/month - Unlimited rides, premium features, no surge")


if __name__ == "__main__":
    asyncio.run(initialize_plans())
