"""
Subscription Service Layer
Business logic for subscription management and Stripe integration
"""
import os
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
from bson import ObjectId
import stripe

from app.database import get_database
from app.models.subscriptions import SubscriptionPlan, UserSubscription, SubscriptionTransaction
from app.schemas.subscriptions import (
    SubscriptionPlanCreate,
    SubscriptionPlanUpdate,
    SubscriptionStatus,
    SubscriptionPlanTier,
    BillingCycle
)

# Initialize Stripe
stripe.api_key = os.environ.get("STRIPE_SECRET_KEY", "")


class SubscriptionService:
    """Service for managing subscriptions"""
    
    def __init__(self):
        self.db = get_database()
        self.plans_collection = self.db["subscription_plans"]
        self.subscriptions_collection = self.db["user_subscriptions"]
        self.transactions_collection = self.db["subscription_transactions"]
    
    async def create_plan(self, plan_data: SubscriptionPlanCreate) -> SubscriptionPlan:
        """Create a new subscription plan"""
        # Create Stripe product and price if Stripe is configured
        stripe_product_id = plan_data.stripe_product_id
        stripe_price_id = plan_data.stripe_price_id
        
        if stripe.api_key and not stripe_product_id:
            try:
                # Create Stripe product
                product = stripe.Product.create(
                    name=plan_data.name,
                    description=plan_data.description,
                    metadata={"tier": plan_data.tier.value}
                )
                stripe_product_id = product.id
                
                # Create Stripe price
                price_data = {
                    "product": stripe_product_id,
                    "currency": plan_data.currency.lower(),
                    "recurring": {"interval": plan_data.billing_cycle.value},
                }
                
                # Convert price to cents for Stripe
                if plan_data.currency.upper() in ["USD", "EUR", "GBP", "CAD", "AUD"]:
                    price_data["unit_amount"] = int(plan_data.price * 100)
                else:
                    price_data["unit_amount"] = int(plan_data.price)
                
                price = stripe.Price.create(**price_data)
                stripe_price_id = price.id
            except Exception as e:
                print(f"Failed to create Stripe product/price: {e}")
        
        # Create plan in database
        plan_dict = plan_data.model_dump(exclude={"stripe_product_id", "stripe_price_id"})
        plan_dict["features"] = plan_data.features.model_dump()
        plan_dict["stripe_product_id"] = stripe_product_id
        plan_dict["stripe_price_id"] = stripe_price_id
        plan_dict["created_at"] = datetime.utcnow()
        plan_dict["updated_at"] = datetime.utcnow()
        
        result = await self.plans_collection.insert_one(plan_dict)
        plan_dict["_id"] = str(result.inserted_id)
        
        return SubscriptionPlan(**plan_dict)

    
    async def get_plan(self, plan_id: str) -> Optional[SubscriptionPlan]:
        """Get a subscription plan by ID"""
        plan = await self.plans_collection.find_one({"_id": ObjectId(plan_id)})
        if plan:
            plan["_id"] = str(plan["_id"])
            return SubscriptionPlan(**plan)
        return None
    
    async def get_all_plans(self, include_inactive: bool = False) -> List[SubscriptionPlan]:
        """Get all subscription plans"""
        query = {} if include_inactive else {"is_active": True}
        cursor = self.plans_collection.find(query).sort("display_order", 1)
        plans = []
        async for plan in cursor:
            plan["_id"] = str(plan["_id"])
            plans.append(SubscriptionPlan(**plan))
        return plans
    
    async def update_plan(self, plan_id: str, update_data: SubscriptionPlanUpdate) -> Optional[SubscriptionPlan]:
        """Update a subscription plan"""
        update_dict = update_data.model_dump(exclude_unset=True)
        
        if "features" in update_dict and update_dict["features"]:
            update_dict["features"] = update_dict["features"].model_dump()
        
        update_dict["updated_at"] = datetime.utcnow()
        
        result = await self.plans_collection.find_one_and_update(
            {"_id": ObjectId(plan_id)},
            {"$set": update_dict},
            return_document=True
        )
        
        if result:
            result["_id"] = str(result["_id"])
            return SubscriptionPlan(**result)
        return None
    
    async def subscribe_user(
        self,
        user_id: str,
        plan_id: str,
        payment_method_id: Optional[str] = None,
        trial_end: Optional[datetime] = None,
        coupon_code: Optional[str] = None
    ) -> UserSubscription:
        """Subscribe a user to a plan"""
        # Get plan details
        plan = await self.get_plan(plan_id)
        if not plan:
            raise ValueError("Invalid plan ID")
        
        # Check for existing active subscription
        existing = await self.subscriptions_collection.find_one({
            "user_id": user_id,
            "status": {"$in": ["active", "trialing"]}
        })
        
        if existing:
            raise ValueError("User already has an active subscription")
        
        # Calculate trial and period dates
        now = datetime.utcnow()
        if trial_end or plan.trial_days > 0:
            trial_start = now
            trial_end = trial_end or (now + timedelta(days=plan.trial_days))
            current_period_start = trial_end
            status = SubscriptionStatus.TRIALING.value
        else:
            trial_start = None
            trial_end = None
            current_period_start = now
            status = SubscriptionStatus.ACTIVE.value
        
        # Calculate period end based on billing cycle
        if plan.billing_cycle == "monthly":
            current_period_end = current_period_start + timedelta(days=30)
        elif plan.billing_cycle == "yearly":
            current_period_end = current_period_start + timedelta(days=365)
        elif plan.billing_cycle == "quarterly":
            current_period_end = current_period_start + timedelta(days=90)
        else:
            current_period_end = current_period_start + timedelta(days=30)
        
        # Create Stripe subscription if configured
        stripe_subscription_id = None
        stripe_customer_id = None
        
        if stripe.api_key and plan.stripe_price_id:
            try:
                # Get or create Stripe customer
                # In production, fetch user email from database
                customer = stripe.Customer.create(
                    metadata={"user_id": user_id}
                )
                stripe_customer_id = customer.id
                
                if payment_method_id:
                    stripe.PaymentMethod.attach(payment_method_id, customer=stripe_customer_id)
                    stripe.Customer.modify(
                        stripe_customer_id,
                        invoice_settings={"default_payment_method": payment_method_id}
                    )
                
                # Create subscription
                subscription_params = {
                    "customer": stripe_customer_id,
                    "items": [{"price": plan.stripe_price_id}],
                    "metadata": {"user_id": user_id, "plan_id": plan_id}
                }
                
                if trial_end:
                    subscription_params["trial_end"] = int(trial_end.timestamp())
                elif plan.trial_days > 0:
                    subscription_params["trial_period_days"] = plan.trial_days
                
                if coupon_code:
                    subscription_params["coupon"] = coupon_code
                
                stripe_subscription = stripe.Subscription.create(**subscription_params)
                stripe_subscription_id = stripe_subscription.id
                
            except Exception as e:
                print(f"Failed to create Stripe subscription: {e}")
                # Continue with local subscription even if Stripe fails
        
        # Create subscription in database
        subscription_data = {
            "user_id": user_id,
            "plan_id": plan_id,
            "status": status,
            "current_period_start": current_period_start,
            "current_period_end": current_period_end,
            "cancel_at_period_end": False,
            "canceled_at": None,
            "trial_start": trial_start,
            "trial_end": trial_end,
            "stripe_subscription_id": stripe_subscription_id,
            "stripe_customer_id": stripe_customer_id,
            "stripe_payment_method_id": payment_method_id,
            "rides_used_this_period": 0,
            "metadata": {},
            "created_at": now,
            "updated_at": now
        }
        
        result = await self.subscriptions_collection.insert_one(subscription_data)
        subscription_data["_id"] = str(result.inserted_id)
        
        return UserSubscription(**subscription_data)

    
    async def get_user_subscription(self, user_id: str) -> Optional[UserSubscription]:
        """Get user's active subscription"""
        subscription = await self.subscriptions_collection.find_one({
            "user_id": user_id,
            "status": {"$in": ["active", "trialing", "past_due"]}
        })
        
        if subscription:
            subscription["_id"] = str(subscription["_id"])
            return UserSubscription(**subscription)
        return None
    
    async def cancel_subscription(
        self,
        user_id: str,
        cancel_at_period_end: bool = True,
        reason: Optional[str] = None
    ) -> Optional[UserSubscription]:
        """Cancel a user's subscription"""
        subscription = await self.get_user_subscription(user_id)
        if not subscription:
            raise ValueError("No active subscription found")
        
        # Cancel in Stripe if applicable
        if stripe.api_key and subscription.stripe_subscription_id:
            try:
                stripe.Subscription.modify(
                    subscription.stripe_subscription_id,
                    cancel_at_period_end=cancel_at_period_end,
                    metadata={"cancellation_reason": reason or ""}
                )
            except Exception as e:
                print(f"Failed to cancel Stripe subscription: {e}")
        
        # Update database
        update_data = {
            "cancel_at_period_end": cancel_at_period_end,
            "updated_at": datetime.utcnow()
        }
        
        if not cancel_at_period_end:
            update_data["status"] = SubscriptionStatus.CANCELED.value
            update_data["canceled_at"] = datetime.utcnow()
        
        if reason:
            update_data["cancellation_reason"] = reason
        
        result = await self.subscriptions_collection.find_one_and_update(
            {"_id": ObjectId(subscription.id)},
            {"$set": update_data},
            return_document=True
        )
        
        if result:
            result["_id"] = str(result["_id"])
            return UserSubscription(**result)
        return None
    
    async def upgrade_subscription(
        self,
        user_id: str,
        new_plan_id: str,
        proration_behavior: str = "create_prorations"
    ) -> UserSubscription:
        """Upgrade or downgrade a user's subscription"""
        current_subscription = await self.get_user_subscription(user_id)
        if not current_subscription:
            raise ValueError("No active subscription found")
        
        new_plan = await self.get_plan(new_plan_id)
        if not new_plan:
            raise ValueError("Invalid plan ID")
        
        # Update in Stripe if applicable
        if stripe.api_key and current_subscription.stripe_subscription_id and new_plan.stripe_price_id:
            try:
                stripe_subscription = stripe.Subscription.retrieve(current_subscription.stripe_subscription_id)
                stripe.Subscription.modify(
                    current_subscription.stripe_subscription_id,
                    items=[{
                        "id": stripe_subscription["items"]["data"][0].id,
                        "price": new_plan.stripe_price_id
                    }],
                    proration_behavior=proration_behavior
                )
            except Exception as e:
                print(f"Failed to update Stripe subscription: {e}")
        
        # Update database
        result = await self.subscriptions_collection.find_one_and_update(
            {"_id": ObjectId(current_subscription.id)},
            {"$set": {
                "plan_id": new_plan_id,
                "updated_at": datetime.utcnow()
            }},
            return_document=True
        )
        
        if result:
            result["_id"] = str(result["_id"])
            return UserSubscription(**result)
        
        raise ValueError("Failed to update subscription")
    
    async def check_subscription_access(self, user_id: str, feature: str) -> bool:
        """Check if user has access to a feature based on subscription"""
        subscription = await self.get_user_subscription(user_id)
        
        # No subscription = Simple (free) tier
        if not subscription:
            # Simple tier features
            return feature in ["ride_scheduling"]
        
        # Get plan features
        plan = await self.get_plan(subscription.plan_id)
        if not plan:
            return False
        
        # Check feature access
        features = plan.features
        return features.get(feature, False)
    
    async def increment_ride_usage(self, user_id: str) -> bool:
        """Increment ride usage for subscription period"""
        subscription = await self.get_user_subscription(user_id)
        if not subscription:
            return True  # No subscription limit
        
        plan = await self.get_plan(subscription.plan_id)
        if not plan:
            return True
        
        max_rides = plan.features.get("max_rides_per_month")
        if max_rides is None:
            return True  # Unlimited
        
        if subscription.rides_used_this_period >= max_rides:
            return False  # Limit reached
        
        await self.subscriptions_collection.update_one(
            {"_id": ObjectId(subscription.id)},
            {"$inc": {"rides_used_this_period": 1}}
        )
        
        return True
    
    async def reset_period_usage(self):
        """Reset usage counters for subscriptions entering new period (cron job)"""
        now = datetime.utcnow()
        
        # Find subscriptions where current period has ended
        expired_periods = await self.subscriptions_collection.find({
            "status": {"$in": ["active", "trialing"]},
            "current_period_end": {"$lte": now}
        }).to_list(length=1000)
        
        for subscription in expired_periods:
            plan = await self.get_plan(subscription["plan_id"])
            if not plan:
                continue
            
            # Calculate new period
            current_period_start = subscription["current_period_end"]
            if plan.billing_cycle == "monthly":
                current_period_end = current_period_start + timedelta(days=30)
            elif plan.billing_cycle == "yearly":
                current_period_end = current_period_start + timedelta(days=365)
            elif plan.billing_cycle == "quarterly":
                current_period_end = current_period_start + timedelta(days=90)
            else:
                current_period_end = current_period_start + timedelta(days=30)
            
            # Update subscription
            await self.subscriptions_collection.update_one(
                {"_id": subscription["_id"]},
                {"$set": {
                    "current_period_start": current_period_start,
                    "current_period_end": current_period_end,
                    "rides_used_this_period": 0,
                    "updated_at": now
                }}
            )
    
    async def handle_webhook(self, event_type: str, event_data: Dict[str, Any]):
        """Handle Stripe webhook events"""
        if event_type == "customer.subscription.updated":
            stripe_subscription_id = event_data.get("id")
            status = event_data.get("status")
            
            # Map Stripe status to our status
            status_map = {
                "active": SubscriptionStatus.ACTIVE.value,
                "trialing": SubscriptionStatus.TRIALING.value,
                "past_due": SubscriptionStatus.PAST_DUE.value,
                "canceled": SubscriptionStatus.CANCELED.value,
                "incomplete": SubscriptionStatus.INACTIVE.value,
                "incomplete_expired": SubscriptionStatus.EXPIRED.value
            }
            
            await self.subscriptions_collection.update_one(
                {"stripe_subscription_id": stripe_subscription_id},
                {"$set": {
                    "status": status_map.get(status, SubscriptionStatus.INACTIVE.value),
                    "updated_at": datetime.utcnow()
                }}
            )
        
        elif event_type == "customer.subscription.deleted":
            stripe_subscription_id = event_data.get("id")
            await self.subscriptions_collection.update_one(
                {"stripe_subscription_id": stripe_subscription_id},
                {"$set": {
                    "status": SubscriptionStatus.CANCELED.value,
                    "canceled_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }}
            )
        
        elif event_type == "invoice.payment_succeeded":
            # Record successful payment
            subscription_id = event_data.get("subscription")
            amount = event_data.get("amount_paid") / 100  # Convert from cents
            
            subscription = await self.subscriptions_collection.find_one({
                "stripe_subscription_id": subscription_id
            })
            
            if subscription:
                transaction_data = {
                    "subscription_id": str(subscription["_id"]),
                    "user_id": subscription["user_id"],
                    "plan_id": subscription["plan_id"],
                    "amount": amount,
                    "currency": event_data.get("currency", "usd").upper(),
                    "status": "succeeded",
                    "transaction_type": "payment",
                    "stripe_payment_intent_id": event_data.get("payment_intent"),
                    "stripe_invoice_id": event_data.get("id"),
                    "description": f"Subscription payment for period",
                    "metadata": {},
                    "created_at": datetime.utcnow()
                }
                await self.transactions_collection.insert_one(transaction_data)
        
        elif event_type == "invoice.payment_failed":
            # Mark subscription as past_due
            subscription_id = event_data.get("subscription")
            await self.subscriptions_collection.update_one(
                {"stripe_subscription_id": subscription_id},
                {"$set": {
                    "status": SubscriptionStatus.PAST_DUE.value,
                    "updated_at": datetime.utcnow()
                }}
            )
