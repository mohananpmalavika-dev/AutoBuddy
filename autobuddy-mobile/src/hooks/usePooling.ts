import { useEffect, useCallback, useState } from 'react';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface PoolMember {
  user_id: string;
  name: string;
  avatar?: string;
  pickup_time: string;
  dropoff_time: string;
  per_person_fare: number;
  role: 'initiator' | 'joiner';
}

interface RidePool {
  pool_id: string;
  status: string;
  initiator_id: string;
  member_count: number;
  members: PoolMember[];
  pickup_latitude: number;
  pickup_longitude: number;
  pickup_address: string;
  dropoff_latitude: number;
  dropoff_longitude: number;
  dropoff_address: string;
  original_fare: number;
  pool_fare: number;
  savings_percent: number;
  estimated_duration_minutes: number;
  vehicle_type: string;
  created_at: string;
  scheduled_at: string;
}

interface PoolPreference {
  preference_type: 'prefer_alone' | 'willing_to_pool' | 'prefer_pool';
  preferred_vehicle_types: string[];
  max_wait_time_minutes: number;
  gender_preference?: string;
}

interface PoolSavingsEstimate {
  original_fare: number;
  pool_fare: number;
  savings_amount: number;
  savings_percent: number;
  member_count: number;
}

export const usePooling = (userId: string | null, authToken: string | null) => {
  const [activePool, setActivePool] = useState<RidePool | null>(null);
  const [matchedPools, setMatchedPools] = useState<RidePool[]>([]);
  const [poolPreferences, setPoolPreferences] = useState<PoolPreference | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);

  // Initiate pool request
  const initiatePooling = useCallback(
    async (
      pickupLat: number,
      pickupLon: number,
      pickupAddr: string,
      dropoffLat: number,
      dropoffLon: number,
      dropoffAddr: string,
      vehicleType: string,
      scheduledAt: Date
    ) => {
      if (!userId || !authToken) {return null;}

      try {
        setIsLoading(true);
        const response = await axios.post(
          `${API_BASE_URL}/api/v3/ride-pooling/initiate-pool`,
          {
            user_id: userId,
            pickup_latitude: pickupLat,
            pickup_longitude: pickupLon,
            pickup_address: pickupAddr,
            dropoff_latitude: dropoffLat,
            dropoff_longitude: dropoffLon,
            dropoff_address: dropoffAddr,
            vehicle_type: vehicleType,
            scheduled_at: scheduledAt.toISOString()
          },
          { headers: { Authorization: `Bearer ${authToken}` } }
        );

        setActivePool(response.data);
        setIsSearching(true);
        setError(null);
        return response.data;
      } catch (err) {
        console.error('Error initiating pool:', err);
        setError('Failed to initiate pool');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [userId, authToken]
  );

  // Find compatible pools
  const findCompatiblePools = useCallback(
    async (
      pickupLat: number,
      pickupLon: number,
      dropoffLat: number,
      dropoffLon: number,
      vehicleType: string,
      scheduledAt: Date
    ) => {
      if (!userId || !authToken) {return [];}

      try {
        setIsLoading(true);
        const response = await axios.post(
          `${API_BASE_URL}/api/v3/ride-pooling/find-compatible-rides`,
          {
            user_id: userId,
            pickup_latitude: pickupLat,
            pickup_longitude: pickupLon,
            dropoff_latitude: dropoffLat,
            dropoff_longitude: dropoffLon,
            vehicle_type: vehicleType,
            scheduled_at: scheduledAt.toISOString()
          },
          { headers: { Authorization: `Bearer ${authToken}` } }
        );

        setMatchedPools(response.data.compatible_rides || []);
        setError(null);
        return response.data.compatible_rides || [];
      } catch (err) {
        console.error('Error finding compatible pools:', err);
        setError('Failed to find compatible pools');
        return [];
      } finally {
        setIsLoading(false);
      }
    },
    [userId, authToken]
  );

  // Join a pool
  const joinPool = useCallback(
    async (poolId: string) => {
      if (!userId || !authToken) {return false;}

      try {
        setIsLoading(true);
        await axios.post(
          `${API_BASE_URL}/api/v3/ride-pooling/join-pool/${poolId}`,
          { user_id: userId },
          { headers: { Authorization: `Bearer ${authToken}` } }
        );

        setIsSearching(false);
        setError(null);
        return true;
      } catch (err) {
        console.error('Error joining pool:', err);
        setError('Failed to join pool');
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [userId, authToken]
  );

  // Decline a pool
  const declinePool = useCallback(
    async (poolId: string) => {
      if (!authToken) {return false;}

      try {
        setIsLoading(true);
        const newMatched = matchedPools.filter((p) => p.pool_id !== poolId);
        setMatchedPools(newMatched);
        setError(null);
        return true;
      } catch (err) {
        console.error('Error declining pool:', err);
        setError('Failed to decline pool');
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [authToken, matchedPools]
  );

  // Get pool details
  const getPoolDetails = useCallback(
    async (poolId: string) => {
      if (!authToken) {return null;}

      try {
        const response = await axios.get(
          `${API_BASE_URL}/api/v3/ride-pooling/pool-status/${poolId}`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );

        setActivePool(response.data);
        return response.data;
      } catch (err) {
        console.error('Error fetching pool details:', err);
        return null;
      }
    },
    [authToken]
  );

  // Calculate savings estimate
  const calculateSavings = useCallback(
    async (originalFare: number, memberCount: number): Promise<PoolSavingsEstimate | null> => {
      try {
        let savingsPercent = 0;
        if (memberCount === 2) {savingsPercent = 25;}
        else if (memberCount === 3) {savingsPercent = 35;}
        else if (memberCount >= 4) {savingsPercent = 40;}

        const poolFare = originalFare * (1 - savingsPercent / 100);
        const perPersonFare = poolFare / memberCount;

        return {
          original_fare: originalFare,
          pool_fare: poolFare,
          savings_amount: originalFare - poolFare,
          savings_percent: savingsPercent,
          member_count: memberCount
        };
      } catch (err) {
        console.error('Error calculating savings:', err);
        return null;
      }
    },
    []
  );

  // Set pool preferences
  const setPreferences = useCallback(
    async (prefs: PoolPreference) => {
      if (!userId || !authToken) {return false;}

      try {
        setIsLoading(true);
        await axios.post(
          `${API_BASE_URL}/api/v3/ride-pooling/set-pool-preferences/${userId}`,
          prefs,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );

        setPoolPreferences(prefs);
        setError(null);
        return true;
      } catch (err) {
        console.error('Error setting preferences:', err);
        setError('Failed to save preferences');
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [userId, authToken]
  );

  // Fetch pool preferences
  const fetchPreferences = useCallback(async () => {
    if (!userId || !authToken) {return;}

    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/v3/ride-pooling/get-pool-preferences/${userId}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      setPoolPreferences(response.data);
    } catch (err) {
      console.error('Error fetching preferences:', err);
    }
  }, [userId, authToken]);

  // Connect to WebSocket for real-time updates
  const connectToPoolUpdates = useCallback(
    (poolId: string) => {
      if (!userId || !authToken) {return;}

      try {
        const wsProtocol = API_BASE_URL.startsWith('https') ? 'wss' : 'ws';
        const wsUrl = `${wsProtocol}://${API_BASE_URL.replace(/^https?:\/\//, '')}/api/v3/ride-pooling/ws/pool-status/${poolId}/${userId}`;

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('Connected to pool updates');
          ws.send(JSON.stringify({ token: authToken }));
        };

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === 'pool_update') {
            setActivePool(data.pool);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };

        ws.onclose = () => {
          console.log('Disconnected from pool updates');
        };

        setWsConnection(ws);
      } catch (err) {
        console.error('Error connecting to WebSocket:', err);
      }
    },
    [userId, authToken]
  );

  // Disconnect from WebSocket
  const disconnectFromPoolUpdates = useCallback(() => {
    if (wsConnection) {
      wsConnection.close();
      setWsConnection(null);
    }
  }, [wsConnection]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectFromPoolUpdates();
    };
  }, [disconnectFromPoolUpdates]);

  return {
    activePool,
    matchedPools,
    poolPreferences,
    isLoading,
    isSearching,
    error,
    initiatePooling,
    findCompatiblePools,
    joinPool,
    declinePool,
    getPoolDetails,
    calculateSavings,
    setPreferences,
    fetchPreferences,
    connectToPoolUpdates,
    disconnectFromPoolUpdates
  };
};
