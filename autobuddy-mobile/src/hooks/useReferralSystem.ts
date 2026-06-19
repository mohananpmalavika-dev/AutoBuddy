import { useState, useCallback } from 'react';
import axios from 'axios';

export interface ReferralCode {
  id: string;
  userId: string;
  code: string;
  displayName: string;
  discountPercentage: number;
  maxUses: number;
  currentUses: number;
  rewardAmount: number;
  status: 'active' | 'inactive' | 'expired';
  createdAt: Date;
  expiresAt?: Date;
}

export interface ReferralReward {
  id: string;
  userId: string;
  type: 'signup' | 'ride_completion' | 'bonus';
  amount: number;
  status: 'pending' | 'credited' | 'paid';
  referredUser?: string;
  earnedAt: Date;
  creditedAt?: Date;
}

export interface ReferralStats {
  totalEarned: number;
  totalReferrals: number;
  activeReferrals: number;
  pendingRewards: number;
  rewards: ReferralReward[];
  topReferral?: {
    code: string;
    uses: number;
    earnings: number;
  };
}

interface UseReferralSystemReturn {
  codes: ReferralCode[];
  rewards: ReferralReward[];
  stats: ReferralStats | null;
  loading: boolean;
  error: Error | null;
  fetchReferralCodes: (userId: string) => Promise<void>;
  createReferralCode: (displayName: string, discountPercentage: number, maxUses: number) => Promise<boolean>;
  deactivateCode: (codeId: string) => Promise<boolean>;
  reactivateCode: (codeId: string) => Promise<boolean>;
  fetchRewards: (userId: string) => Promise<void>;
  getReferralStats: (userId: string) => Promise<void>;
  shareReferralCode: (code: string, platform: 'whatsapp' | 'sms' | 'email' | 'link') => Promise<boolean>;
  claimReward: (rewardId: string) => Promise<boolean>;
  applyReferralCode: (code: string) => Promise<boolean>;
  getReferralHistory: () => ReferralReward[];
  generateShareLink: (code: string) => string;
}

export const useReferralSystem = (token: string | null, userId: string): UseReferralSystemReturn => {
  const [codes, setCodes] = useState<ReferralCode[]>([]);
  const [rewards, setRewards] = useState<ReferralReward[]>([]);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

  const fetchReferralCodes = useCallback(
    async (userId: string) => {
      if (!token) return;
      setLoading(true);
      try {
        const response = await axios.get(
          `${API_BASE_URL}/referrals/${userId}/codes`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setCodes(response.data || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch referral codes'));
      } finally {
        setLoading(false);
      }
    },
    [token, API_BASE_URL]
  );

  const createReferralCode = useCallback(
    async (
      displayName: string,
      discountPercentage: number,
      maxUses: number
    ): Promise<boolean> => {
      if (!token) return false;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/referrals/codes/create`,
          { userId, displayName, discountPercentage, maxUses },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setCodes((prev) => [response.data, ...prev]);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to create referral code'));
        return false;
      }
    },
    [token, userId, API_BASE_URL]
  );

  const deactivateCode = useCallback(
    async (codeId: string): Promise<boolean> => {
      if (!token) return false;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/referrals/codes/${codeId}/deactivate`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setCodes((prev) =>
          prev.map((c) => (c.id === codeId ? response.data : c))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to deactivate code'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const reactivateCode = useCallback(
    async (codeId: string): Promise<boolean> => {
      if (!token) return false;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/referrals/codes/${codeId}/reactivate`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setCodes((prev) =>
          prev.map((c) => (c.id === codeId ? response.data : c))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to reactivate code'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const fetchRewards = useCallback(
    async (userId: string) => {
      if (!token) return;
      try {
        const response = await axios.get(
          `${API_BASE_URL}/referrals/${userId}/rewards`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setRewards(response.data || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch rewards'));
      }
    },
    [token, API_BASE_URL]
  );

  const getReferralStats = useCallback(
    async (userId: string) => {
      if (!token) return;
      try {
        const response = await axios.get(
          `${API_BASE_URL}/referrals/${userId}/stats`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setStats(response.data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch stats'));
      }
    },
    [token, API_BASE_URL]
  );

  const shareReferralCode = useCallback(
    async (code: string, platform: 'whatsapp' | 'sms' | 'email' | 'link'): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.post(
          `${API_BASE_URL}/referrals/share`,
          { code, platform },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to share code'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const claimReward = useCallback(
    async (rewardId: string): Promise<boolean> => {
      if (!token) return false;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/referrals/rewards/${rewardId}/claim`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setRewards((prev) =>
          prev.map((r) => (r.id === rewardId ? response.data : r))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to claim reward'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const applyReferralCode = useCallback(
    async (code: string): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.post(
          `${API_BASE_URL}/referrals/apply`,
          { userId, code },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to apply code'));
        return false;
      }
    },
    [token, userId, API_BASE_URL]
  );

  const getReferralHistory = useCallback(() => {
    return rewards.filter((r) => r.status === 'credited' || r.status === 'paid');
  }, [rewards]);

  const generateShareLink = useCallback((code: string) => {
    return `${API_BASE_URL}/referral/${code}`;
  }, [API_BASE_URL]);

  return {
    codes,
    rewards,
    stats,
    loading,
    error,
    fetchReferralCodes,
    createReferralCode,
    deactivateCode,
    reactivateCode,
    fetchRewards,
    getReferralStats,
    shareReferralCode,
    claimReward,
    applyReferralCode,
    getReferralHistory,
    generateShareLink,
  };
};
