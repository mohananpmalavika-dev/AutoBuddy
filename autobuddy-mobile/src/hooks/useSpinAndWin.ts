import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SpinPrize {
  id: string;
  name: string;
  type: 'credit' | 'discount' | 'ride' | 'badge';
  value: number;
  probability: number;
  icon: string;
}

export interface SpinReward {
  id: string;
  userId: string;
  prizeId: string;
  prize: SpinPrize;
  wonAt: Date;
  expiresAt: Date;
  redeemed: boolean;
  redeemedAt?: Date;
}

export interface DailySpinStatus {
  userId: string;
  lastSpinDate: Date;
  spinsAvailable: number;
  spinsUsedToday: number;
  nextSpinTime?: Date;
}

const SPINS_STORAGE = 'gamification_spins';
const REWARDS_STORAGE = 'gamification_rewards';
const DAILY_STATUS_STORAGE = 'gamification_daily_status';

/**
 * Hook for Spin & Win gamification feature
 */
export const useSpinAndWin = (token: string | null, userId: string) => {
  const [rewards, setRewards] = useState<SpinReward[]>([]);
  const [dailyStatus, setDailyStatus] = useState<DailySpinStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastWonPrize, setLastWonPrize] = useState<SpinPrize | null>(null);

  const prizes: SpinPrize[] = [
    { id: 'p1', name: '₹50 Credit', type: 'credit', value: 50, probability: 0.2, icon: 'wallet' },
    { id: 'p2', name: '20% Off', type: 'discount', value: 20, probability: 0.15, icon: 'local_offer' },
    { id: 'p3', name: '₹100 Credit', type: 'credit', value: 100, probability: 0.1, icon: 'wallet' },
    { id: 'p4', name: 'Free Ride', type: 'ride', value: 1, probability: 0.08, icon: 'directions_car' },
    { id: 'p5', name: '10% Off', type: 'discount', value: 10, probability: 0.25, icon: 'local_offer' },
    { id: 'p6', name: '₹200 Credit', type: 'credit', value: 200, probability: 0.05, icon: 'wallet' },
    { id: 'p7', name: 'Gold Badge', type: 'badge', value: 1, probability: 0.12, icon: 'star' },
    { id: 'p8', name: 'Better Luck Next Time', type: 'credit', value: 0, probability: 0.05, icon: 'error' },
  ];

  // Initialize
  useEffect(() => {
    const initialize = async () => {
      try {
        setLoading(true);
        const status = await loadDailyStatus();
        const rewards = await loadRewards();

        setDailyStatus(status);
        setRewards(rewards);

        // Check if daily reset needed
        await checkDailyReset();
      } catch (err) {
        setError(`Init failed: ${err}`);
      } finally {
        setLoading(false);
      }
    };

    if (token && userId) initialize();
  }, [token, userId]);

  // Spin the wheel
  const spinWheel = useCallback(async () => {
    try {
      if (!dailyStatus) throw new Error('Daily status not loaded');
      if (dailyStatus.spinsUsedToday >= dailyStatus.spinsAvailable) {
        throw new Error('No spins available today. Come back tomorrow!');
      }

      // Select random prize based on probability
      const prize = selectPrizeByProbability();

      // Create reward
      const reward: SpinReward = {
        id: `reward_${Date.now()}`,
        userId,
        prizeId: prize.id,
        prize,
        wonAt: new Date(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        redeemed: false,
      };

      // Update rewards
      const updatedRewards = [reward, ...rewards];
      setRewards(updatedRewards);
      setLastWonPrize(prize);

      // Update daily status
      const updatedStatus = {
        ...dailyStatus,
        spinsUsedToday: dailyStatus.spinsUsedToday + 1,
      };
      setDailyStatus(updatedStatus);

      // Save to storage
      await AsyncStorage.setItem(REWARDS_STORAGE, JSON.stringify(updatedRewards));
      await AsyncStorage.setItem(DAILY_STATUS_STORAGE, JSON.stringify(updatedStatus));

      return reward;
    } catch (err) {
      setError(`Spin failed: ${err}`);
      throw err;
    }
  }, [dailyStatus, userId, rewards]);

  // Select prize based on probability
  const selectPrizeByProbability = useCallback((): SpinPrize => {
    const random = Math.random();
    let accumulated = 0;

    for (const prize of prizes) {
      accumulated += prize.probability;
      if (random <= accumulated) {
        return prize;
      }
    }

    return prizes[prizes.length - 1];
  }, []);

  // Check daily reset
  const checkDailyReset = useCallback(async () => {
    try {
      if (!dailyStatus) return;

      const now = new Date();
      const lastSpin = new Date(dailyStatus.lastSpinDate);

      // Check if it's a new day
      if (now.getDate() !== lastSpin.getDate()) {
        const newStatus: DailySpinStatus = {
          userId,
          lastSpinDate: now,
          spinsAvailable: 2, // Reset to 2 spins per day
          spinsUsedToday: 0,
        };

        setDailyStatus(newStatus);
        await AsyncStorage.setItem(DAILY_STATUS_STORAGE, JSON.stringify(newStatus));
      }
    } catch (err) {
      setError(`Daily reset failed: ${err}`);
    }
  }, [dailyStatus, userId]);

  // Redeem reward
  const redeemReward = useCallback(
    async (rewardId: string) => {
      try {
        const updatedRewards = rewards.map(r =>
          r.id === rewardId
            ? { ...r, redeemed: true, redeemedAt: new Date() }
            : r
        );

        setRewards(updatedRewards);
        await AsyncStorage.setItem(REWARDS_STORAGE, JSON.stringify(updatedRewards));

        return updatedRewards.find(r => r.id === rewardId);
      } catch (err) {
        setError(`Redemption failed: ${err}`);
        throw err;
      }
    },
    [rewards]
  );

  // Get available spins
  const getAvailableSpins = useCallback((): number => {
    if (!dailyStatus) return 0;
    return dailyStatus.spinsAvailable - dailyStatus.spinsUsedToday;
  }, [dailyStatus]);

  // Get active rewards
  const getActiveRewards = useCallback((): SpinReward[] => {
    return rewards.filter(r => !r.redeemed && r.expiresAt > new Date());
  }, [rewards]);

  // Get total credit value
  const getTotalCreditValue = useCallback((): number => {
    return rewards
      .filter(r => r.prize.type === 'credit' && !r.redeemed)
      .reduce((sum, r) => sum + r.prize.value, 0);
  }, [rewards]);

  // Load/save helpers
  const loadDailyStatus = useCallback(async (): Promise<DailySpinStatus> => {
    try {
      const data = await AsyncStorage.getItem(DAILY_STATUS_STORAGE);
      if (data) {
        return JSON.parse(data);
      }

      // Create new status
      const newStatus: DailySpinStatus = {
        userId,
        lastSpinDate: new Date(),
        spinsAvailable: 2,
        spinsUsedToday: 0,
      };

      await AsyncStorage.setItem(DAILY_STATUS_STORAGE, JSON.stringify(newStatus));
      return newStatus;
    } catch (err) {
      console.error('Load daily status error:', err);
      return {
        userId,
        lastSpinDate: new Date(),
        spinsAvailable: 2,
        spinsUsedToday: 0,
      };
    }
  }, [userId]);

  const loadRewards = useCallback(async (): Promise<SpinReward[]> => {
    try {
      const data = await AsyncStorage.getItem(REWARDS_STORAGE);
      return data ? JSON.parse(data) : [];
    } catch (err) {
      console.error('Load rewards error:', err);
      return [];
    }
  }, []);

  return {
    // Main functions
    spinWheel,
    redeemReward,
    checkDailyReset,

    // Getters
    getAvailableSpins,
    getActiveRewards,
    getTotalCreditValue,

    // Data
    rewards,
    dailyStatus,
    lastWonPrize,
    prizes,

    // State
    loading,
    error,
  };
};
