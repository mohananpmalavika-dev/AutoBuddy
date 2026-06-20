import { useEffect, useCallback, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface CurrentTier {
  driver_id: string;
  current_tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  tier_name: string;
  tier_color: string;
  multiplier: number;
  tier_points: number;
  benefits: string[];
  last_updated: string;
}

interface TierProgress {
  current_tier: string;
  next_tier?: string;
  points_current: number;
  points_required: number;
  points_needed: number;
  progress_percentage: number;
  rides_required: number;
  rides_current: number;
  rides_needed: number;
  rating_required: number;
  rating_current: number;
  acceptance_required: number;
  acceptance_current: number;
  days_estimate: number;
}

interface TierBenefitsInfo {
  tier: string;
  name: string;
  multiplier: number;
  earning_percentage_boost: number;
  requirements: {
    rides: number;
    rating: number;
    acceptance_rate: number;
  };
  benefits: string[];
  color: string;
}

interface TierUpgradeEvent {
  date: string;
  from_tier: string;
  to_tier: string;
  metrics_at_upgrade: {
    rides: number;
    rating: number;
    acceptance: number;
    earnings: number;
  };
}

interface TierDashboard {
  tier_info: {
    current_tier: string;
    tier_name: string;
    tier_color: string;
    multiplier: number;
    earnings_boost_percentage: number;
    tier_points: number;
  };
  progress: TierProgress;
  benefits: string[];
  metrics: {
    total_rides: number;
    average_rating: number;
    acceptance_rate: number;
    total_earnings: number;
  };
  last_updated: string;
}

export const useDriverTier = (driverId: string | null, authToken: string | null) => {
  const [currentTier, setCurrentTier] = useState<CurrentTier | null>(null);
  const [tierProgress, setTierProgress] = useState<TierProgress | null>(null);
  const [tierBenefits, setTierBenefits] = useState<TierBenefitsInfo | null>(null);
  const [tierHistory, setTierHistory] = useState<TierUpgradeEvent[]>([]);
  const [tierDashboard, setTierDashboard] = useState<TierDashboard | null>(null);
  const [multiplier, setMultiplier] = useState<number>(1.0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCurrentTier = useCallback(
    async () => {
      if (!driverId || !authToken) return;
      try {
        setIsLoading(true);
        const response = await axios.get(
          `${API_BASE_URL}/api/v3/driver-tier/current/${driverId}`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        setCurrentTier(response.data);
        setError(null);
      } catch (err) {
        console.error('Error fetching current tier:', err);
        setError('Failed to load tier information');
      } finally {
        setIsLoading(false);
      }
    },
    [driverId, authToken]
  );

  const fetchTierProgress = useCallback(
    async () => {
      if (!driverId || !authToken) return;
      try {
        const response = await axios.get(
          `${API_BASE_URL}/api/v3/driver-tier/progress/${driverId}`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        setTierProgress(response.data);
        setError(null);
      } catch (err) {
        console.error('Error fetching tier progress:', err);
        setError('Failed to load tier progress');
      }
    },
    [driverId, authToken]
  );

  const fetchTierBenefits = useCallback(
    async (tierLevel: string) => {
      if (!authToken) return;
      try {
        const response = await axios.get(
          `${API_BASE_URL}/api/v3/driver-tier/benefits/${tierLevel}`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        setTierBenefits(response.data);
        setError(null);
      } catch (err) {
        console.error('Error fetching tier benefits:', err);
        setError('Failed to load tier benefits');
      }
    },
    [authToken]
  );

  const fetchTierHistory = useCallback(
    async () => {
      if (!driverId || !authToken) return;
      try {
        const response = await axios.get(
          `${API_BASE_URL}/api/v3/driver-tier/history/${driverId}`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        setTierHistory(response.data.upgrades);
        setError(null);
      } catch (err) {
        console.error('Error fetching tier history:', err);
        setError('Failed to load tier history');
      }
    },
    [driverId, authToken]
  );

  const fetchEarningsMultiplier = useCallback(
    async () => {
      if (!driverId || !authToken) return;
      try {
        const response = await axios.get(
          `${API_BASE_URL}/api/v3/driver-tier/earnings-multiplier/${driverId}`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        setMultiplier(response.data.multiplier);
        setError(null);
      } catch (err) {
        console.error('Error fetching multiplier:', err);
        setMultiplier(1.0);
      }
    },
    [driverId, authToken]
  );

  const fetchTierDashboard = useCallback(
    async () => {
      if (!driverId || !authToken) return;
      try {
        setIsLoading(true);
        const response = await axios.get(
          `${API_BASE_URL}/api/v3/driver-tier/dashboard/${driverId}`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        setTierDashboard(response.data);
        setCurrentTier({
          driver_id: driverId,
          current_tier: response.data.tier_info.current_tier,
          tier_name: response.data.tier_info.tier_name,
          tier_color: response.data.tier_info.tier_color,
          multiplier: response.data.tier_info.multiplier,
          tier_points: response.data.tier_info.tier_points,
          benefits: response.data.benefits,
          last_updated: response.data.last_updated
        });
        setTierProgress(response.data.progress);
        setMultiplier(response.data.tier_info.multiplier);
        setError(null);
      } catch (err) {
        console.error('Error fetching tier dashboard:', err);
        setError('Failed to load tier dashboard');
      } finally {
        setIsLoading(false);
      }
    },
    [driverId, authToken]
  );

  const checkUpgrade = useCallback(
    async () => {
      if (!driverId || !authToken) return;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/api/v3/driver-tier/check-upgrade/${driverId}`,
          {},
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        if (response.data.upgraded) {
          // Refresh all tier data after upgrade
          await fetchTierDashboard();
        }
        return response.data;
      } catch (err) {
        console.error('Error checking upgrade:', err);
        return null;
      }
    },
    [driverId, authToken, fetchTierDashboard]
  );

  const applyMultiplierToRide = useCallback(
    async (rideId: string, baseFare: number) => {
      if (!driverId || !authToken) return null;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/api/v3/driver-tier/apply-multiplier/${rideId}`,
          {},
          {
            params: { driver_id: driverId, base_fare: baseFare },
            headers: { Authorization: `Bearer ${authToken}` }
          }
        );
        return response.data;
      } catch (err) {
        console.error('Error applying multiplier:', err);
        return null;
      }
    },
    [driverId, authToken]
  );

  const getTierColor = useCallback((tier: string): string => {
    const colors: { [key: string]: string } = {
      bronze: '#CD7F32',
      silver: '#C0C0C0',
      gold: '#FFD700',
      platinum: '#E5E4E2'
    };
    return colors[tier] || '#999';
  }, []);

  const calculateDaysToUpgrade = useCallback((): number => {
    return tierProgress?.days_estimate || 0;
  }, [tierProgress]);

  // Initial fetch on mount
  useEffect(() => {
    if (driverId && authToken) {
      fetchTierDashboard();
    }
  }, [driverId, authToken, fetchTierDashboard]);

  return {
    // State
    currentTier,
    tierProgress,
    tierBenefits,
    tierHistory,
    tierDashboard,
    multiplier,
    isLoading,
    error,

    // Functions
    fetchCurrentTier,
    fetchTierProgress,
    fetchTierBenefits,
    fetchTierHistory,
    fetchEarningsMultiplier,
    fetchTierDashboard,
    checkUpgrade,
    applyMultiplierToRide,
    getTierColor,
    calculateDaysToUpgrade
  };
};
