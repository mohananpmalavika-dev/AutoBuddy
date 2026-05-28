import { useCallback, useState } from 'react';
import { apiRequest } from '../lib/api';

export function useRidePooling({ token, driverId }) {
  const [poolOpportunities, setPoolOpportunities] = useState([]);
  const [poolAnalytics, setPoolAnalytics] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Detect pooling opportunities for a route
  const detectPoolingOpportunity = useCallback(async (pickupLoc, dropoffLoc, requestedTime) => {
    if (!token || !driverId) return null;

    setIsLoading(true);
    setError('');

    try {
      const response = await apiRequest(`/drivers-tier3/pooling/detect`, {
        method: 'POST',
        token,
        body: {
          pickup_location: pickupLoc,
          dropoff_location: dropoffLoc,
          requested_time: requestedTime,
          max_wait_time_minutes: 5,
        },
      });

      const payload = response?.data || response;
      if (payload) {
        setPoolOpportunities(prev => [...prev, payload]);
        return payload;
      }
    } catch (err) {
      setError(`Failed to detect pooling: ${err.message}`);
      console.warn('Pooling detection error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, driverId]);

  // Load pooling analytics
  const loadPoolingAnalytics = useCallback(async () => {
    if (!token || !driverId) return null;

    setIsLoading(true);
    setError('');

    try {
      const response = await apiRequest(`/drivers-tier3/pooling/analytics`, {
        method: 'GET',
        token,
      });

      const payload = response?.data || response;
      if (payload) {
        setPoolAnalytics(payload);
        return payload;
      }
    } catch (err) {
      setError(`Failed to load pooling analytics: ${err.message}`);
      console.warn('Analytics error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, driverId]);

  // Accept pooling offer
  const acceptPoolingOffer = useCallback(async (poolId) => {
    if (!token) return null;

    try {
      const response = await apiRequest(`/drivers-tier3/pooling/accept`, {
        method: 'POST',
        token,
        body: { pool_id: poolId },
      });

      return response?.data || response;
    } catch (err) {
      setError(`Failed to accept pool: ${err.message}`);
      console.warn('Accept pool error:', err);
    }
  }, [token]);

  return {
    poolOpportunities,
    poolAnalytics,
    isLoading,
    error,
    detectPoolingOpportunity,
    loadPoolingAnalytics,
    acceptPoolingOffer,
  };
}
