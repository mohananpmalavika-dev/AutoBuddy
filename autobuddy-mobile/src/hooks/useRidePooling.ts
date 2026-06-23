import { useState, useCallback } from 'react';
import axios from 'axios';

export interface PooledPassenger {
  id: string;
  name: string;
  phone: string;
  rating: number;
  pickupLocation: { lat: number; lng: number; address: string };
  dropoffLocation: { lat: number; lng: number; address: string };
  fare: number;
  status: 'waiting' | 'pickedup' | 'dropped';
  joinedAt: Date;
}

export interface RidePool {
  id: string;
  driverId: string;
  status: 'accepting' | 'full' | 'active' | 'completed' | 'cancelled';
  passengers: PooledPassenger[];
  route: {
    pickupSequence: string[];
    dropoffSequence: string[];
    totalDistance: number;
    estimatedDuration: number;
  };
  capacity: number;
  baseRoute: {
    pickupLat: number;
    pickupLng: number;
    dropoffLat: number;
    dropoffLng: number;
  };
  totalFare: number;
  discountPercentage: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface PoolRequest {
  id: string;
  passengerId: string;
  poolId: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  requestedAt: Date;
}

interface UseRidePoolingReturn {
  activePool: RidePool | null;
  availablePools: RidePool[];
  joinRequests: PoolRequest[];
  loading: boolean;
  error: Error | null;
  createPool: (baseRoute: RidePool['baseRoute'], capacity?: number) => Promise<RidePool | null>;
  fetchAvailablePools: (pickupLat: number, pickupLng: number, dropoffLat: number, dropoffLng: number) => Promise<RidePool[]>;
  joinPool: (poolId: string, passenger: Omit<PooledPassenger, 'id' | 'status' | 'joinedAt'>) => Promise<boolean>;
  acceptJoinRequest: (poolId: string, requestId: string) => Promise<boolean>;
  rejectJoinRequest: (poolId: string, requestId: string) => Promise<boolean>;
  removePassengerFromPool: (poolId: string, passengerId: string) => Promise<boolean>;
  startPool: (poolId: string) => Promise<boolean>;
  completePool: (poolId: string) => Promise<RidePool | null>;
  cancelPool: (poolId: string, reason: string) => Promise<boolean>;
  updatePassengerStatus: (poolId: string, passengerId: string, status: PooledPassenger['status']) => Promise<boolean>;
  getPoolDetails: (poolId: string) => Promise<RidePool | null>;
  calculateSplitFare: (totalFare: number, passengerCount: number, discountPercent?: number) => number;
}

export const useRidePooling = (token: string | null, userId: string): UseRidePoolingReturn => {
  const [activePool, setActivePool] = useState<RidePool | null>(null);
  const [availablePools, setAvailablePools] = useState<RidePool[]>([]);
  const [joinRequests, setJoinRequests] = useState<PoolRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

  const createPool = useCallback(
    async (baseRoute: RidePool['baseRoute'], capacity = 4): Promise<RidePool | null> => {
      if (!token) {return null;}
      setLoading(true);
      try {
        const response = await axios.post(
          `${API_BASE_URL}/pools/create`,
          { driverId: userId, baseRoute, capacity },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const pool = response.data;
        setActivePool(pool);
        return pool;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to create pool'));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [token, userId, API_BASE_URL]
  );

  const fetchAvailablePools = useCallback(
    async (
      pickupLat: number,
      pickupLng: number,
      dropoffLat: number,
      dropoffLng: number
    ): Promise<RidePool[]> => {
      if (!token) {return [];}
      try {
        const response = await axios.get(`${API_BASE_URL}/pools/available`, {
          params: { pickupLat, pickupLng, dropoffLat, dropoffLng },
          headers: { Authorization: `Bearer ${token}` },
        });
        const pools = response.data;
        setAvailablePools(pools);
        return pools;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch pools'));
        return [];
      }
    },
    [token, API_BASE_URL]
  );

  const joinPool = useCallback(
    async (
      poolId: string,
      passenger: Omit<PooledPassenger, 'id' | 'status' | 'joinedAt'>
    ): Promise<boolean> => {
      if (!token) {return false;}
      try {
        await axios.post(
          `${API_BASE_URL}/pools/${poolId}/join`,
          { passengerId: userId, passenger },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to join pool'));
        return false;
      }
    },
    [token, userId, API_BASE_URL]
  );

  const acceptJoinRequest = useCallback(
    async (poolId: string, requestId: string): Promise<boolean> => {
      if (!token) {return false;}
      try {
        await axios.post(
          `${API_BASE_URL}/pools/${poolId}/requests/${requestId}/accept`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setJoinRequests((prev) =>
          prev.map((r) => (r.id === requestId ? { ...r, status: 'accepted' } : r))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to accept request'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const rejectJoinRequest = useCallback(
    async (poolId: string, requestId: string): Promise<boolean> => {
      if (!token) {return false;}
      try {
        await axios.post(
          `${API_BASE_URL}/pools/${poolId}/requests/${requestId}/reject`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setJoinRequests((prev) =>
          prev.map((r) => (r.id === requestId ? { ...r, status: 'rejected' } : r))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to reject request'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const removePassengerFromPool = useCallback(
    async (poolId: string, passengerId: string): Promise<boolean> => {
      if (!token) {return false;}
      try {
        await axios.delete(
          `${API_BASE_URL}/pools/${poolId}/passengers/${passengerId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (activePool?.id === poolId) {
          setActivePool((prev) =>
            prev
              ? {
                  ...prev,
                  passengers: prev.passengers.filter((p) => p.id !== passengerId),
                }
              : null
          );
        }

        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to remove passenger'));
        return false;
      }
    },
    [token, API_BASE_URL, activePool]
  );

  const startPool = useCallback(
    async (poolId: string): Promise<boolean> => {
      if (!token) {return false;}
      try {
        const response = await axios.post(
          `${API_BASE_URL}/pools/${poolId}/start`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (activePool?.id === poolId) {
          setActivePool((prev) => (prev ? { ...prev, status: 'active', startedAt: new Date() } : null));
        }

        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to start pool'));
        return false;
      }
    },
    [token, API_BASE_URL, activePool]
  );

  const completePool = useCallback(
    async (poolId: string): Promise<RidePool | null> => {
      if (!token) {return null;}
      try {
        const response = await axios.post(
          `${API_BASE_URL}/pools/${poolId}/complete`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const completedPool = response.data;
        if (activePool?.id === poolId) {
          setActivePool(null);
        }

        return completedPool;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to complete pool'));
        return null;
      }
    },
    [token, API_BASE_URL, activePool]
  );

  const cancelPool = useCallback(
    async (poolId: string, reason: string): Promise<boolean> => {
      if (!token) {return false;}
      try {
        await axios.post(
          `${API_BASE_URL}/pools/${poolId}/cancel`,
          { reason },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (activePool?.id === poolId) {
          setActivePool(null);
        }

        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to cancel pool'));
        return false;
      }
    },
    [token, API_BASE_URL, activePool]
  );

  const updatePassengerStatus = useCallback(
    async (
      poolId: string,
      passengerId: string,
      status: PooledPassenger['status']
    ): Promise<boolean> => {
      if (!token) {return false;}
      try {
        await axios.put(
          `${API_BASE_URL}/pools/${poolId}/passengers/${passengerId}`,
          { status },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (activePool?.id === poolId) {
          setActivePool((prev) =>
            prev
              ? {
                  ...prev,
                  passengers: prev.passengers.map((p) =>
                    p.id === passengerId ? { ...p, status } : p
                  ),
                }
              : null
          );
        }

        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update passenger'));
        return false;
      }
    },
    [token, API_BASE_URL, activePool]
  );

  const getPoolDetails = useCallback(
    async (poolId: string): Promise<RidePool | null> => {
      if (!token) {return null;}
      try {
        const response = await axios.get(`${API_BASE_URL}/pools/${poolId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return response.data;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch pool details'));
        return null;
      }
    },
    [token, API_BASE_URL]
  );

  const calculateSplitFare = useCallback(
    (totalFare: number, passengerCount: number, discountPercent = 0): number => {
      const discountedFare = totalFare * (1 - discountPercent / 100);
      return Math.round((discountedFare / passengerCount) * 100) / 100;
    },
    []
  );

  return {
    activePool,
    availablePools,
    joinRequests,
    loading,
    error,
    createPool,
    fetchAvailablePools,
    joinPool,
    acceptJoinRequest,
    rejectJoinRequest,
    removePassengerFromPool,
    startPool,
    completePool,
    cancelPool,
    updatePassengerStatus,
    getPoolDetails,
    calculateSplitFare,
  };
};
