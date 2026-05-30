export type UserRole = 'passenger' | 'driver' | 'operator' | 'admin';

export interface AppUser {
  id: string;
  email: string;
  name: string;
  phone: string;
  role: UserRole;
}

export interface AppSession {
  token: string;
  refresh_token?: string;
  user: AppUser;
}

export interface ApiNotification {
  id: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export type SubscriptionPlanType = 'monthly' | 'quarterly' | 'annually' | 'per_trip';

export interface SubscriptionPlanConfig {
  amount?: number;
  active?: boolean;
}

export interface SubscriptionConfigPayload {
  plans?: Partial<Record<SubscriptionPlanType, SubscriptionPlanConfig>>;
}

export interface SubscriptionStatusPayload {
  subscription?: {
    plan_type?: SubscriptionPlanType | '';
  };
}

export interface PlanOption {
  planType: SubscriptionPlanType;
  amount: number;
  active: boolean;
}
