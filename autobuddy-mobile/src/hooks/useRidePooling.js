import { useCallback, useState } from 'react';
import { apiRequest } from '../lib/api';

export function useRidePooling({ token, driverId }) {
  const [poolOpportunities, setPoolOpportunities] = useState([]);
  const [driverPools, setDriverPools] = useState([]);
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
        try {
          const opportunitiesResponse = await apiRequest(`/drivers-tier3/pooling/opportunities`, {
            method: 'GET',
            token,
          });
          const opportunitiesPayload = opportunitiesResponse?.data || opportunitiesResponse;
          setPoolOpportunities(opportunitiesPayload?.opportunities || []);
        } catch (opportunityErr) {
          console.warn('Pooling opportunities error:', opportunityErr);
        }
        return payload;
      }
    } catch (err) {
      setError(`Failed to load pooling analytics: ${err.message}`);
      console.warn('Analytics error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, driverId]);

  const loadDriverPools = useCallback(async () => {
    if (!token || !driverId) return [];

    setIsLoading(true);
    setError('');

    try {
      const response = await apiRequest('/ride-pooling/my-pools', {
        method: 'GET',
        token,
      });
      const payload = response?.data || response;
      const pools = Array.isArray(payload) ? payload : payload?.pools || [];
      setDriverPools(pools);
      return pools;
    } catch (err) {
      setError(`Failed to load shared routes: ${err.message}`);
      console.warn('Driver pools error:', err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [driverId, token]);

  const createDriverPoolRoute = useCallback(async (routePayload) => {
    if (!token || !driverId) return null;

    setIsLoading(true);
    setError('');

    try {
      const response = await apiRequest('/ride-pooling/driver-create', {
        method: 'POST',
        token,
        body: {
          ...routePayload,
          pool_model: 'DRIVER_CREATED',
        },
      });
      const payload = response?.data || response;
      const pool = payload?.pool || payload;
      if (pool) {
        setDriverPools((prev) => [pool, ...prev.filter((item) => (item.pool_id || item.id) !== (pool.pool_id || pool.id))]);
      }
      return payload;
    } catch (err) {
      setError(`Failed to start shared route: ${err.message}`);
      console.warn('Create driver pool error:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [driverId, token]);

  const assignDriverToPool = useCallback(async (poolId) => {
    if (!token || !poolId) return null;

    try {
      const response = await apiRequest(`/ride-pooling/${poolId}/assign-driver`, {
        method: 'POST',
        token,
      });
      const payload = response?.data || response;
      const pool = payload?.pool || payload;
      if (pool) {
        setDriverPools((prev) =>
          prev.map((item) => ((item.pool_id || item.id) === (pool.pool_id || pool.id) ? pool : item))
        );
      }
      return payload;
    } catch (err) {
      setError(`Failed to assign shared route: ${err.message}`);
      console.warn('Assign driver pool error:', err);
      return null;
    }
  }, [token]);

  // Accept pooling offer
  const acceptPoolingOffer = useCallback(async (poolId) => {
    if (!token) return null;

    try {
      const response = await apiRequest(`/drivers-tier3/pooling/accept`, {
        method: 'POST',
        token,
        body: { pool_id: poolId },
      });

      const payload = response?.data || response;
      setPoolOpportunities(prev => prev.filter(pool => pool.pool_id !== poolId));
      await loadPoolingAnalytics();
      return payload;
    } catch (err) {
      setError(`Failed to accept pool: ${err.message}`);
      console.warn('Accept pool error:', err);
    }
  }, [loadPoolingAnalytics, token]);

  return {
    poolOpportunities,
    driverPools,
    poolAnalytics,
    isLoading,
    error,
    detectPoolingOpportunity,
    loadPoolingAnalytics,
    loadDriverPools,
    createDriverPoolRoute,
    assignDriverToPool,
    acceptPoolingOffer,
  };
}
