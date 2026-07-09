/**
 * Subscription Service
 * API calls for subscription management
 */
import apiClient from './apiClient';
import {
  SubscriptionPlan,
  UserSubscription,
  SubscriptionUsage,
  SubscribeRequest,
  UpgradeRequest,
  CancelRequest,
} from '../types/subscription';

export const subscriptionService = {
  // Get all available subscription plans
  getPlans: async (): Promise<SubscriptionPlan[]> => {
    const response = await apiClient.get('/api/v1/subscriptions/plans');
    return response.data;
  },

  // Get specific plan details
  getPlan: async (planId: string): Promise<SubscriptionPlan> => {
    const response = await apiClient.get(`/api/v1/subscriptions/plans/${planId}`);
    return response.data;
  },

  // Subscribe to a plan
  subscribe: async (data: SubscribeRequest): Promise<UserSubscription> => {
    const response = await apiClient.post('/api/v1/subscriptions/subscribe', data);
    return response.data;
  },

  // Get current user's subscription
  getMySubscription: async (): Promise<UserSubscription | null> => {
    const response = await apiClient.get('/api/v1/subscriptions/my-subscription');
    return response.data;
  },

  // Upgrade/downgrade subscription
  upgrade: async (data: UpgradeRequest): Promise<UserSubscription> => {
    const response = await apiClient.put('/api/v1/subscriptions/upgrade', data);
    return response.data;
  },

  // Cancel subscription
  cancel: async (data: CancelRequest): Promise<UserSubscription> => {
    const response = await apiClient.delete('/api/v1/subscriptions/cancel', { data });
    return response.data;
  },

  // Get subscription usage
  getUsage: async (): Promise<SubscriptionUsage> => {
    const response = await apiClient.get('/api/v1/subscriptions/usage');
    return response.data;
  },
};
