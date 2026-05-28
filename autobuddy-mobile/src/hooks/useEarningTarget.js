import { useCallback, useState, useMemo } from 'react';
import { apiRequest } from '../lib/api';

export function useEarningTarget({ token, driverId }) {
  const [currentTarget, setCurrentTarget] = useState(null);
  const [targetHistory, setTargetHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Load current weekly target
  const loadCurrentTarget = useCallback(async () => {
    if (!token || !driverId) return;

    setIsLoading(true);
    setError('');

    try {
      const response = await apiRequest(`/drivers/earning-targets/current`, {
        method: 'GET',
        token,
      });

      if (response.data) {
        setCurrentTarget({
          id: response.data.id,
          targetAmount: response.data.target_amount,
          currentEarnings: response.data.current_earnings,
          bonusMultiplier: response.data.bonus_multiplier,
          bonusEarned: response.data.bonus_earned,
          status: response.data.status,
          weekStart: response.data.target_week_start,
        });
      }
    } catch (err) {
      console.warn('Failed to load target:', err);
      setError(`Failed to load target: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [token, driverId]);

  // Set weekly earning target
  const setEarningTarget = useCallback(
    async (targetAmount, bonusMultiplier = 1.5) => {
      if (!token || !driverId) {
        setError('Missing required data');
        return false;
      }

      if (targetAmount <= 0) {
        setError('Target must be greater than 0');
        return false;
      }

      setIsLoading(true);
      setError('');

      try {
        await apiRequest(`/drivers/earning-targets`, {
          method: 'POST',
          token,
          body: {
            target_amount: targetAmount,
            target_period: 'weekly',
            bonus_multiplier: bonusMultiplier,
          },
        });

        await loadCurrentTarget();
        return true;
      } catch (err) {
        setError(`Failed to set target: ${err.message}`);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [token, driverId, loadCurrentTarget]
  );

  // Calculate progress metrics
  const progressMetrics = useMemo(() => {
    if (!currentTarget) return null;

    const targetAmount = currentTarget.targetAmount;
    const currentEarnings = currentTarget.currentEarnings;
    const progressPercentage = (currentEarnings / targetAmount) * 100;
    const remainingAmount = Math.max(0, targetAmount - currentEarnings);

    // Calculate hours remaining (assuming 50/hour average)
    const hoursRemaining = Math.ceil(remainingAmount / 50);

    // Determine status color
    let statusColor = '#2E7D32'; // Green
    if (progressPercentage >= 100) {
      statusColor = '#4CAF50'; // Bright green
    } else if (progressPercentage >= 80) {
      statusColor = '#8BC34A'; // Light green
    } else if (progressPercentage >= 50) {
      statusColor = '#FFC107'; // Yellow
    } else if (progressPercentage >= 25) {
      statusColor = '#FF9800'; // Orange
    } else {
      statusColor = '#F44336'; // Red
    }

    return {
      progressPercentage: Math.min(progressPercentage, 100),
      remainingAmount,
      hoursRemaining,
      bonusEarned: currentTarget.bonusEarned,
      statusColor,
      isTargetMet: progressPercentage >= 100,
      targetAmount,
      currentEarnings,
    };
  }, [currentTarget]);

  // Load target history for analytics
  const loadTargetHistory = useCallback(async () => {
    if (!token || !driverId) return;

    setIsLoading(true);

    try {
      const response = await apiRequest(`/drivers/earning-targets/history`, {
        method: 'GET',
        token,
      });

      setTargetHistory(response.data.history || []);
    } catch (err) {
      console.warn('Failed to load history:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, driverId]);

  // Calculate success rate
  const successRate = useMemo(() => {
    if (targetHistory.length === 0) return 0;
    const succeeded = targetHistory.filter((t) => t.status === 'completed').length;
    return Math.round((succeeded / targetHistory.length) * 100);
  }, [targetHistory]);

  return {
    currentTarget,
    targetHistory,
    progressMetrics,
    isLoading,
    error,
    loadCurrentTarget,
    setEarningTarget,
    loadTargetHistory,
    successRate,
  };
}
