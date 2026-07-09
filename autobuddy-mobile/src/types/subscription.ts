/**
 * Subscription Type Definitions
 * TypeScript interfaces for subscription-related data
 */

export enum SubscriptionTier {
  SIMPLE = 'simple',
  SMART = 'smart',
  PRO = 'pro',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  CANCELED = 'canceled',
  PAST_DUE = 'past_due',
  TRIALING = 'trialing',
  EXPIRED = 'expired',
}

export enum BillingCycle {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
  QUARTERLY = 'quarterly',
}

export interface SubscriptionPlanFeatures {
  max_rides_per_month: number | null;
  ai_travel_intent: boolean;
  family_assistant: boolean;
  priority_support: boolean;
  ride_scheduling: boolean;
  ride_history_days: number;
  concurrent_bookings: number;
  no_surge_pricing: boolean;
  carbon_offset: boolean;
  premium_vehicles: boolean;
  discount_percentage: number;
  free_cancellations_per_month: number;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  tier: SubscriptionTier;
  description: string | null;
  price: number;
  currency: string;
  billing_cycle: BillingCycle;
  trial_days: number;
  features: SubscriptionPlanFeatures;
  is_active: boolean;
  display_order: number;
  stripe_price_id: string | null;
  stripe_product_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSubscription {
  id: string;
  user_id: string;
  plan_id: string;
  plan?: SubscriptionPlan;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  trial_start: string | null;
  trial_end: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  rides_used_this_period: number;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionUsage {
  subscription_id: string;
  rides_used: number;
  rides_limit: number | null;
  rides_remaining: number | null;
  period_start: string;
  period_end: string;
  days_remaining: number;
  usage_percentage: number | null;
}

export interface SubscribeRequest {
  plan_id: string;
  payment_method_id?: string;
  trial_end?: string;
  coupon_code?: string;
}

export interface UpgradeRequest {
  new_plan_id: string;
  proration_behavior?: 'create_prorations' | 'none';
}

export interface CancelRequest {
  cancel_at_period_end: boolean;
  reason?: string;
}
