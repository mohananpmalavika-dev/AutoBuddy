import type { PlanOption, SubscriptionConfigPayload, SubscriptionPlanType } from './models';

export const PLAN_LABELS: Record<SubscriptionPlanType, string> = {
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  annually: 'Annual',
  per_trip: 'Per Trip',
};

const PLAN_TYPES: SubscriptionPlanType[] = ['monthly', 'quarterly', 'annually', 'per_trip'];

export function getPlanOptions(configPayload: SubscriptionConfigPayload | null | undefined): PlanOption[] {
  const plans = configPayload?.plans || {};
  return PLAN_TYPES.map((planType) => ({
    planType,
    amount: Number(plans[planType]?.amount || 0),
    active: Boolean(plans[planType]?.active),
  })).filter((item) => item.amount > 0);
}
