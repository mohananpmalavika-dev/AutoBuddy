import { useCallback, useRef, useState, useEffect } from 'react';
import { apiRequest } from '../lib/api';

/**
 * Custom hook for managing driver earnings and pricing rules
 * Consolidates earnings fetching, pricing rules, and related actions
 *
 * @param {string} token - Authentication token
 * @param {function} onEarningsChange - Callback when earnings update
 * @returns {object} Earnings state and action methods
 */
export function useDriverEarnings({ token, onEarningsChange } = {}) {
  const refreshInFlightRef = useRef(false);
  const pricingRefreshInFlightRef = useRef(false);

  // State management
  const [earnings, setEarnings] = useState(null);
  const [pricingRules, setPricingRules] = useState(null);
  const [driverFareConfig, setDriverFareConfig] = useState({
    base_fare: '25',
    per_km_rate: '12',
    surge_multiplier: '1.5',
    night_multiplier: '1.3',
    minimum_fare: '30',
    driver_base_search_radius_km: '5',
    driver_long_distance_search_radius_km: '12',
    driver_pickup_surcharge_per_km: '12',
    peak_hours: '8,9,17,18,19',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch earnings data
  const refreshEarnings = useCallback(
    async (forceRefresh = false) => {
      if (!token) {
        setError('Missing authentication token');
        return;
      }

      // Prevent concurrent requests
      if (refreshInFlightRef.current && !forceRefresh) {
        return;
      }

      refreshInFlightRef.current = true;
      setLoading(true);
      setError('');

      try {
        const response = await apiRequest('/drivers/earnings', {
          method: 'GET',
          token,
        });

        if (response?.success) {
          setEarnings(response.data || {});
          onEarningsChange?.(response.data);
        } else if (response?.data) {
          // Some API responses return data even without explicit success flag
          setEarnings(response.data);
          onEarningsChange?.(response.data);
        } else {
          throw new Error(response?.message || 'Failed to fetch earnings');
        }
      } catch (err) {
        const errorMsg = err?.message || 'Error fetching earnings';
        setError(errorMsg);
        console.error('refreshEarnings error:', err);
      } finally {
        setLoading(false);
        refreshInFlightRef.current = false;
      }
    },
    [token, onEarningsChange]
  );

  // Fetch pricing rules
  const refreshPricingRules = useCallback(
    async (forceRefresh = false) => {
      if (!token) {
        setError('Missing authentication token');
        return;
      }

      // Prevent concurrent requests
      if (pricingRefreshInFlightRef.current && !forceRefresh) {
        return;
      }

      pricingRefreshInFlightRef.current = true;
      setLoading(true);
      setError('');

      try {
        const response = await apiRequest('/pricing/rules', {
          method: 'GET',
          token,
        });

        if (response?.success) {
          setPricingRules(response.data || {});
        } else if (response?.data) {
          // Some API responses return data even without explicit success flag
          setPricingRules(response.data);
        } else {
          throw new Error(response?.message || 'Failed to fetch pricing rules');
        }
      } catch (err) {
        const errorMsg = err?.message || 'Error fetching pricing';
        setError(errorMsg);
        console.error('refreshPricingRules error:', err);
      } finally {
        setLoading(false);
        pricingRefreshInFlightRef.current = false;
      }
    },
    [token]
  );

  // Fetch driver-specific fare configuration
  const refreshDriverFareConfig = useCallback(
    async () => {
      if (!token) {
        return;
      }

      try {
        const response = await apiRequest('/drivers/fare-config', {
          method: 'GET',
          token,
        });

        if (response?.success || response?.data) {
          const config = response.data || response;
          setDriverFareConfig((prev) => ({ ...prev, ...config }));
        }
      } catch (err) {
        console.warn('Failed to fetch driver fare config:', err?.message);
      }
    },
    [token]
  );

  // Request withdrawal (async operation)
  const requestWithdrawal = useCallback(
    async (amount, method = 'bank_transfer') => {
      if (!token) {
        setError('Missing authentication token');
        return false;
      }

      if (!amount || amount <= 0) {
        setError('Invalid withdrawal amount');
        return false;
      }

      setLoading(true);
      setError('');

      try {
        const response = await apiRequest('/drivers/withdraw', {
          method: 'POST',
          token,
          body: {
            amount: Number(amount),
            method,
          },
        });

        if (response?.success) {
          // Refresh earnings after withdrawal
          setTimeout(() => refreshEarnings(true), 500);
          return true;
        }

        throw new Error(response?.message || 'Failed to request withdrawal');
      } catch (err) {
        const errorMsg = err?.message || 'Error requesting withdrawal';
        setError(errorMsg);
        console.error('requestWithdrawal error:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [token, refreshEarnings]
  );

  // Request earnings report (generates document/email)
  const requestEarningsReport = useCallback(
    async (format = 'pdf') => {
      if (!token) {
        setError('Missing authentication token');
        return false;
      }

      setLoading(true);
      setError('');

      try {
        const response = await apiRequest('/drivers/earnings/report', {
          method: 'POST',
          token,
          body: { format },
        });

        if (response?.success) {
          return response.data?.report_url || true;
        }

        throw new Error(response?.message || 'Failed to generate report');
      } catch (err) {
        const errorMsg = err?.message || 'Error generating report';
        setError(errorMsg);
        console.error('requestEarningsReport error:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  // Calculate fare based on distance and pricing rules
  const calculateFare = useCallback((distance, surgeMultiplier = 1) => {
    if (!pricingRules || !distance) {
      return null;
    }

    const baseFare = Number(pricingRules.base_fare) || 0;
    const perKmRate = Number(pricingRules.per_km_rate) || 0;
    const minimumFare = Number(pricingRules.minimum_fare) || baseFare;

    const fare = (baseFare + distance * perKmRate) * surgeMultiplier;
    return Math.max(fare, minimumFare);
  }, [pricingRules]);

  // Clear error
  const clearError = useCallback(() => {
    setError('');
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    if (token) {
      refreshEarnings();
      refreshPricingRules();
      refreshDriverFareConfig();
    }
  }, [token, refreshEarnings, refreshPricingRules, refreshDriverFareConfig]);

  return {
    // State
    earnings,
    pricingRules,
    driverFareConfig,
    loading,
    error,

    // Actions
    refreshEarnings,
    refreshPricingRules,
    refreshDriverFareConfig,
    requestWithdrawal,
    requestEarningsReport,
    calculateFare,
    clearError,

    // Setters (for manual control)
    setEarnings,
    setPricingRules,
    setDriverFareConfig,
  };
}
