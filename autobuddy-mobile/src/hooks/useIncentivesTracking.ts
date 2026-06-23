import { useState, useCallback } from 'react';
import axios from 'axios';

export interface Incentive {
  id: string;
  driverId: string;
  type: 'rides_completed' | 'rating_based' | 'hours_online' | 'referral' | 'challenge';
  title: string;
  description: string;
  rewardAmount: number;
  conditions: {
    type: string;
    target: number;
    current: number;
    unit: string;
  }[];
  progress: number;
  status: 'active' | 'in_progress' | 'completed' | 'expired' | 'claimed';
  startDate: Date;
  endDate: Date;
  claimDeadline: Date;
  claimedAt?: Date;
  claimableAt?: Date;
}

export interface Bonus {
  id: string;
  driverId: string;
  amount: number;
  reason: string;
  status: 'pending' | 'credited' | 'cancelled';
  earnedAt: Date;
  creditedAt?: Date;
}

export interface IncentiveHistory {
  id: string;
  driverId: string;
  incentiveId: string;
  amount: number;
  claimedAt: Date;
}

interface UseIncentivesTrackingReturn {
  activeIncentives: Incentive[];
  completedIncentives: Incentive[];
  bonuses: Bonus[];
  incentiveHistory: IncentiveHistory[];
  loading: boolean;
  error: Error | null;
  fetchActiveIncentives: () => Promise<void>;
  fetchIncentiveHistory: () => Promise<void>;
  fetchBonuses: () => Promise<void>;
  claimIncentive: (incentiveId: string) => Promise<boolean>;
  getIncentiveProgress: (incentiveId: string) => number;
  getTotalEarnings: () => number;
  getUnclaimedAmount: () => number;
  updateIncentiveProgress: (incentiveId: string) => Promise<void>;
  getUpcomingIncentives: () => Incentive[];
  getIncentiveStats: () => any;
}

export const useIncentivesTracking = (token: string | null, driverId: string): UseIncentivesTrackingReturn => {
  const [activeIncentives, setActiveIncentives] = useState<Incentive[]>([]);
  const [completedIncentives, setCompletedIncentives] = useState<Incentive[]>([]);
  const [bonuses, setBonuses] = useState<Bonus[]>([]);
  const [incentiveHistory, setIncentiveHistory] = useState<IncentiveHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

  const fetchActiveIncentives = useCallback(async () => {
    if (!token) {return;}
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/incentives/${driverId}/active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setActiveIncentives(response.data.active || []);
      setCompletedIncentives(response.data.completed || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch incentives'));
    } finally {
      setLoading(false);
    }
  }, [token, driverId, API_BASE_URL]);

  const fetchIncentiveHistory = useCallback(async () => {
    if (!token) {return;}
    try {
      const response = await axios.get(
        `${API_BASE_URL}/incentives/${driverId}/history`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setIncentiveHistory(response.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch history'));
    }
  }, [token, driverId, API_BASE_URL]);

  const fetchBonuses = useCallback(async () => {
    if (!token) {return;}
    try {
      const response = await axios.get(`${API_BASE_URL}/bonuses/${driverId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setBonuses(response.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch bonuses'));
    }
  }, [token, driverId, API_BASE_URL]);

  const claimIncentive = useCallback(
    async (incentiveId: string): Promise<boolean> => {
      if (!token) {return false;}
      try {
        const response = await axios.post(
          `${API_BASE_URL}/incentives/${incentiveId}/claim`,
          { driverId },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        setActiveIncentives((prev) =>
          prev.map((i) =>
            i.id === incentiveId
              ? { ...i, status: 'claimed', claimedAt: new Date() }
              : i
          )
        );

        setIncentiveHistory((prev) => [
          ...prev,
          {
            id: response.data.historyId || '',
            driverId,
            incentiveId,
            amount: response.data.amount,
            claimedAt: new Date(),
          },
        ]);

        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to claim incentive'));
        return false;
      }
    },
    [token, driverId, API_BASE_URL]
  );

  const getIncentiveProgress = useCallback(
    (incentiveId: string): number => {
      const incentive = activeIncentives.find((i) => i.id === incentiveId);
      if (!incentive) {return 0;}
      return incentive.progress;
    },
    [activeIncentives]
  );

  const getTotalEarnings = useCallback(() => {
    return incentiveHistory.reduce((sum, item) => sum + item.amount, 0);
  }, [incentiveHistory]);

  const getUnclaimedAmount = useCallback(() => {
    return activeIncentives
      .filter((i) => i.status === 'completed' && i.claimedAt === undefined)
      .reduce((sum, i) => sum + i.rewardAmount, 0);
  }, [activeIncentives]);

  const updateIncentiveProgress = useCallback(
    async (incentiveId: string) => {
      if (!token) {return;}
      try {
        const response = await axios.put(
          `${API_BASE_URL}/incentives/${incentiveId}/progress`,
          { driverId },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const updatedIncentive = response.data;
        setActiveIncentives((prev) =>
          prev.map((i) => (i.id === incentiveId ? updatedIncentive : i))
        );
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update progress'));
      }
    },
    [token, driverId, API_BASE_URL]
  );

  const getUpcomingIncentives = useCallback(() => {
    const now = new Date();
    return activeIncentives.filter((i) => new Date(i.startDate) > now);
  }, [activeIncentives]);

  const getIncentiveStats = useCallback(() => {
    const total = activeIncentives.length + completedIncentives.length;
    const completed = completedIncentives.length;
    const claimed = activeIncentives.filter((i) => i.status === 'claimed').length;
    const totalAmount = activeIncentives.reduce((sum, i) => sum + i.rewardAmount, 0);

    return {
      total,
      completed,
      claimed,
      unclaimed: completed - claimed,
      totalAmount,
      totalEarned: getTotalEarnings(),
      averageReward: total > 0 ? totalAmount / total : 0,
    };
  }, [activeIncentives, completedIncentives, getTotalEarnings]);

  return {
    activeIncentives,
    completedIncentives,
    bonuses,
    incentiveHistory,
    loading,
    error,
    fetchActiveIncentives,
    fetchIncentiveHistory,
    fetchBonuses,
    claimIncentive,
    getIncentiveProgress,
    getTotalEarnings,
    getUnclaimedAmount,
    updateIncentiveProgress,
    getUpcomingIncentives,
    getIncentiveStats,
  };
};
