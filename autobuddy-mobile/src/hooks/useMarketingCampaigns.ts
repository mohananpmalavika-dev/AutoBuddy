import { useState, useCallback } from 'react';
import axios from 'axios';

export interface Campaign {
  id: string;
  name: string;
  type: 'promotion' | 'referral' | 'seasonal' | 'retention' | 'acquisition';
  description: string;
  targetAudience: {
    userType: 'passenger' | 'driver' | 'both';
    regions?: string[];
    ratingRange?: [number, number];
    rideCountRange?: [number, number];
  };
  rewardType: 'discount' | 'cashback' | 'bonus_credits' | 'free_rides';
  rewardAmount: number;
  maxRedemptions: number;
  currentRedemptions: number;
  code?: string;
  startDate: Date;
  endDate: Date;
  status: 'draft' | 'active' | 'paused' | 'ended';
  budget: number;
  spentAmount: number;
  metrics: {
    impressions: number;
    clicks: number;
    conversions: number;
    revenue: number;
  };
}

export interface CampaignReward {
  id: string;
  campaignId: string;
  userId: string;
  rewardAmount: number;
  status: 'earned' | 'redeemed' | 'expired';
  earnedAt: Date;
  redeemedAt?: Date;
  expiresAt: Date;
}

interface UseMarketingCampaignsReturn {
  campaigns: Campaign[];
  rewards: CampaignReward[];
  loading: boolean;
  error: Error | null;
  fetchCampaigns: (status?: string) => Promise<void>;
  createCampaign: (campaign: Partial<Campaign>) => Promise<boolean>;
  updateCampaign: (campaignId: string, updates: Partial<Campaign>) => Promise<boolean>;
  startCampaign: (campaignId: string) => Promise<boolean>;
  endCampaign: (campaignId: string) => Promise<boolean>;
  pauseCampaign: (campaignId: string) => Promise<boolean>;
  getCampaignMetrics: (campaignId: string) => any;
  getUserRewards: (userId: string) => CampaignReward[];
  redeemReward: (rewardId: string) => Promise<boolean>;
  getActiveRewards: () => CampaignReward[];
  estimateROI: (campaignId: string) => number;
  getDuplicateCode: () => string;
}

export const useMarketingCampaigns = (token: string | null, adminId: string): UseMarketingCampaignsReturn => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [rewards, setRewards] = useState<CampaignReward[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

  const fetchCampaigns = useCallback(
    async (status?: string) => {
      if (!token) return;
      setLoading(true);
      try {
        const params = status ? { status } : {};
        const response = await axios.get(`${API_BASE_URL}/campaigns`, {
          params,
          headers: { Authorization: `Bearer ${token}` },
        });
        setCampaigns(response.data || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch campaigns'));
      } finally {
        setLoading(false);
      }
    },
    [token, API_BASE_URL]
  );

  const createCampaign = useCallback(
    async (campaign: Partial<Campaign>): Promise<boolean> => {
      if (!token) return false;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/campaigns`,
          { ...campaign, createdBy: adminId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setCampaigns((prev) => [response.data, ...prev]);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to create campaign'));
        return false;
      }
    },
    [token, adminId, API_BASE_URL]
  );

  const updateCampaign = useCallback(
    async (campaignId: string, updates: Partial<Campaign>): Promise<boolean> => {
      if (!token) return false;
      try {
        const response = await axios.put(
          `${API_BASE_URL}/campaigns/${campaignId}`,
          updates,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setCampaigns((prev) =>
          prev.map((c) => (c.id === campaignId ? response.data : c))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update campaign'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const startCampaign = useCallback(
    async (campaignId: string): Promise<boolean> => {
      if (!token) return false;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/campaigns/${campaignId}/start`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setCampaigns((prev) =>
          prev.map((c) => (c.id === campaignId ? response.data : c))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to start campaign'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const endCampaign = useCallback(
    async (campaignId: string): Promise<boolean> => {
      if (!token) return false;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/campaigns/${campaignId}/end`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setCampaigns((prev) =>
          prev.map((c) => (c.id === campaignId ? response.data : c))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to end campaign'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const pauseCampaign = useCallback(
    async (campaignId: string): Promise<boolean> => {
      if (!token) return false;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/campaigns/${campaignId}/pause`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setCampaigns((prev) =>
          prev.map((c) => (c.id === campaignId ? response.data : c))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to pause campaign'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const getCampaignMetrics = useCallback(
    (campaignId: string) => {
      const campaign = campaigns.find((c) => c.id === campaignId);
      if (!campaign) return null;

      const ctr = campaign.metrics.impressions > 0
        ? ((campaign.metrics.clicks / campaign.metrics.impressions) * 100).toFixed(2)
        : 0;

      const cvr = campaign.metrics.clicks > 0
        ? ((campaign.metrics.conversions / campaign.metrics.clicks) * 100).toFixed(2)
        : 0;

      const cpc = campaign.metrics.clicks > 0
        ? (campaign.spentAmount / campaign.metrics.clicks).toFixed(2)
        : 0;

      const cpa = campaign.metrics.conversions > 0
        ? (campaign.spentAmount / campaign.metrics.conversions).toFixed(2)
        : 0;

      return { ctr, cvr, cpc, cpa, ...campaign.metrics };
    },
    [campaigns]
  );

  const getUserRewards = useCallback(
    (userId: string) => {
      return rewards.filter((r) => r.userId === userId);
    },
    [rewards]
  );

  const redeemReward = useCallback(
    async (rewardId: string): Promise<boolean> => {
      if (!token) return false;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/rewards/${rewardId}/redeem`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setRewards((prev) =>
          prev.map((r) => (r.id === rewardId ? response.data : r))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to redeem reward'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const getActiveRewards = useCallback(() => {
    const now = new Date();
    return rewards.filter(
      (r) => r.status === 'earned' && new Date(r.expiresAt) > now
    );
  }, [rewards]);

  const estimateROI = useCallback(
    (campaignId: string): number => {
      const campaign = campaigns.find((c) => c.id === campaignId);
      if (!campaign || campaign.spentAmount === 0) return 0;

      const roi = ((campaign.metrics.revenue - campaign.spentAmount) / campaign.spentAmount) * 100;
      return Math.round(roi);
    },
    [campaigns]
  );

  const getDuplicateCode = useCallback((): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }, []);

  return {
    campaigns,
    rewards,
    loading,
    error,
    fetchCampaigns,
    createCampaign,
    updateCampaign,
    startCampaign,
    endCampaign,
    pauseCampaign,
    getCampaignMetrics,
    getUserRewards,
    redeemReward,
    getActiveRewards,
    estimateROI,
    getDuplicateCode,
  };
};
