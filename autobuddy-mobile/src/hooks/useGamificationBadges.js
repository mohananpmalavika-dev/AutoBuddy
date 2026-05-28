import { useCallback, useState } from 'react';
import { apiRequest } from '../lib/api';

export function useGamificationBadges({ token, driverId }) {
  const [earnedBadges, setEarnedBadges] = useState([]);
  const [inProgressBadges, setInProgressBadges] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Load earned badges
  const loadEarnedBadges = useCallback(async () => {
    if (!token || !driverId) return null;

    setIsLoading(true);
    setError('');

    try {
      const response = await apiRequest(`/drivers-tier3/badges/earned`, {
        method: 'GET',
        token,
      });

      if (response.data && response.data.badges) {
        setEarnedBadges(response.data.badges);
        return response.data.badges;
      }
    } catch (err) {
      setError(`Failed to load badges: ${err.message}`);
      console.warn('Load badges error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, driverId]);

  // Load badge progress
  const loadBadgeProgress = useCallback(async () => {
    if (!token || !driverId) return null;

    setIsLoading(true);
    setError('');

    try {
      const response = await apiRequest(`/drivers-tier3/badges/progress`, {
        method: 'GET',
        token,
      });

      if (response.data && response.data.in_progress_badges) {
        setInProgressBadges(response.data.in_progress_badges);
        return response.data.in_progress_badges;
      }
    } catch (err) {
      setError(`Failed to load badge progress: ${err.message}`);
      console.warn('Badge progress error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, driverId]);

  // Load leaderboard
  const loadLeaderboard = useCallback(async (limit = 50) => {
    if (!token) return null;

    setIsLoading(true);
    setError('');

    try {
      const response = await apiRequest(`/drivers-tier3/badges/leaderboard?limit=${limit}`, {
        method: 'GET',
        token,
      });

      if (response.data) {
        setLeaderboard(response.data.leaderboard || []);
        return response.data;
      }
    } catch (err) {
      setError(`Failed to load leaderboard: ${err.message}`);
      console.warn('Leaderboard error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // Get badge by type
  const getBadgeByType = useCallback((badgeType) => {
    return earnedBadges.find(badge => badge.badge_type === badgeType);
  }, [earnedBadges]);

  // Get progress for badge type
  const getProgressForBadge = useCallback((badgeType) => {
    const badge = inProgressBadges.find(b => b.badge_type === badgeType);
    return badge ? badge.progress : 0;
  }, [inProgressBadges]);

  // Calculate total badge count
  const getTotalBadgeCount = useCallback(() => {
    return earnedBadges.length;
  }, [earnedBadges]);

  // Calculate badge collection percentage
  const getBadgeCompletionPercentage = useCallback(() => {
    const totalPossibleBadges = 12; // Estimate
    const earnedCount = earnedBadges.length;
    return Math.round((earnedCount / totalPossibleBadges) * 100);
  }, [earnedBadges]);

  // Get badge tiers
  const getBadgeTiers = useCallback(() => {
    const badges = {
      safety: earnedBadges.filter(b => b.badge_type === 'safety'),
      performance: earnedBadges.filter(b => b.badge_type === 'performance'),
      consistency: earnedBadges.filter(b => b.badge_type === 'consistency'),
      customerService: earnedBadges.filter(b => b.badge_type === 'customer_service'),
      milestone: earnedBadges.filter(b => b.badge_type === 'milestone'),
    };
    return badges;
  }, [earnedBadges]);

  return {
    earnedBadges,
    inProgressBadges,
    leaderboard,
    isLoading,
    error,
    loadEarnedBadges,
    loadBadgeProgress,
    loadLeaderboard,
    getBadgeByType,
    getProgressForBadge,
    getTotalBadgeCount,
    getBadgeCompletionPercentage,
    getBadgeTiers,
  };
}
