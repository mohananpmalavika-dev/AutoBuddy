import { useEffect, useRef, useState, useCallback } from 'react';
import { useWebSocket } from './useWebSocket';
import { useAppSession } from './useAppSession';

export interface DriverLocation {
  driver_id: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  heading?: number;
  speed?: number;
  timestamp: string;
}

export interface RideTracking {
  ride_id: string;
  driver_id: string;
  driver_name: string;
  driver_rating: number;
  driver_photo?: string;
  vehicle_info?: {
    number: string;
    model: string;
    color: string;
  };
  eta?: number;
  distance_remaining?: number;
  pickup: string;
  dropoff: string;
  status: string;
}

/**
 * Hook for live tracking updates (Passenger)
 * Receives real-time driver location updates
 */
export function useRealtimeTracking(rideId?: string) {
  const { session } = useAppSession();
  const { isConnected, isAuthenticated, emit, on, off } = useWebSocket();
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [rideInfo, setRideInfo] = useState<RideTracking | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const subscriptionRef = useRef<string | null>(null);

  // Subscribe to ride tracking
  useEffect(() => {
    if (!isAuthenticated || !rideId || subscriptionRef.current === rideId) {
      return;
    }

    setIsLoading(true);
    subscriptionRef.current = rideId;

    try {
      // Subscribe to ride
      emit('passenger:subscribe_ride', { ride_id: rideId });

      // Listen for location updates
      const unsubscribeLocation = on('driver:location_updated', (data: DriverLocation) => {
        setDriverLocation(data);
      });

      // Listen for ride acceptance
      const unsubscribeAccepted = on('passenger:ride_accepted', (data: RideTracking) => {
        setRideInfo(data);
        setIsLoading(false);
      });

      // Listen for ride completion
      const unsubscribeCompleted = on('passenger:ride_completed', (data: any) => {
        setRideInfo(prev => prev ? { ...prev, status: 'completed' } : null);
      });

      // Listen for driver status changes
      const unsubscribeStatus = on('driver:status_changed', (data: any) => {
        setRideInfo(prev => prev ? { ...prev, status: data.online ? 'active' : 'paused' } : null);
      });

      return () => {
        unsubscribeLocation();
        unsubscribeAccepted();
        unsubscribeCompleted();
        unsubscribeStatus();
        subscriptionRef.current = null;
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setIsLoading(false);
    }
  }, [isAuthenticated, rideId, emit, on]);

  // Unsubscribe when ride ends
  const unsubscribe = useCallback(() => {
    if (subscriptionRef.current) {
      emit('passenger:unsubscribe_ride', { ride_id: subscriptionRef.current });
      subscriptionRef.current = null;
      setDriverLocation(null);
      setRideInfo(null);
    }
  }, [emit]);

  return {
    driverLocation,
    rideInfo,
    isLoading,
    error,
    unsubscribe,
  };
}

/**
 * Hook for driver location streaming (Driver)
 * Sends real-time location updates
 */
export function useDriverLocationStreaming(rideId?: string) {
  const { isConnected, isAuthenticated, emit } = useWebSocket();
  const [isStreaming, setIsStreaming] = useState(false);
  const streamingRef = useRef<NodeJS.Timeout | null>(null);
  const lastLocationRef = useRef<{ lat: number; lng: number } | null>(null);

  // Start streaming location
  const startStreaming = useCallback((getLocation: () => Promise<{ latitude: number; longitude: number; accuracy?: number; speed?: number }>) => {
    if (streamingRef.current || !isAuthenticated) {
      return;
    }

    setIsStreaming(true);

    streamingRef.current = setInterval(async () => {
      try {
        const location = await getLocation();
        emit('driver:update_location', {
          ride_id: rideId,
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy || 50,
          speed: location.speed || 0,
        });
      } catch (err) {
        console.error('Error sending location:', err);
      }
    }, 5000); // Update every 5 seconds
  }, [isAuthenticated, rideId, emit]);

  // Stop streaming location
  const stopStreaming = useCallback(() => {
    if (streamingRef.current) {
      clearInterval(streamingRef.current);
      streamingRef.current = null;
      setIsStreaming(false);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamingRef.current) {
        clearInterval(streamingRef.current);
      }
    };
  }, []);

  return {
    isStreaming,
    startStreaming,
    stopStreaming,
  };
}

/**
 * Hook for real-time ride request notifications (Driver)
 */
export function useRideRequests() {
  const { isAuthenticated, emit, on } = useWebSocket();
  const [rideRequest, setRideRequest] = useState<any | null>(null);
  const [countdown, setCountdown] = useState(12);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);

  // Subscribe to ride requests
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    emit('driver:subscribe_ride_requests');

    const unsubscribe = on('driver:new_ride_request', (data: any) => {
      setRideRequest(data);
      setCountdown(12);

      // Start countdown
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }

      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            clearInterval(countdownRef.current!);
            countdownRef.current = null;
            // Auto-decline
            emit('driver:decline_ride', {
              ride_id: data.ride_id,
              reason: 'timeout',
            });
            setRideRequest(null);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    });

    return () => {
      unsubscribe();
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [isAuthenticated, emit, on]);

  // Accept ride
  const acceptRide = useCallback((rideId: string) => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    emit('broadcast:ride_accepted', {
      ride_id: rideId,
      driver_id: 'current_driver_id', // Will be set by context
    });
    setRideRequest(null);
  }, [emit]);

  // Decline ride
  const declineRide = useCallback((rideId: string, reason?: string) => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    emit('driver:decline_ride', {
      ride_id: rideId,
      reason: reason || 'declined',
    });
    setRideRequest(null);
  }, [emit]);

  return {
    rideRequest,
    countdown,
    acceptRide,
    declineRide,
  };
}

/**
 * Hook for fleet location monitoring (Operator)
 */
export function useFleetLocations() {
  const { isAuthenticated, emit, on } = useWebSocket();
  const [locations, setLocations] = useState<DriverLocation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Subscribe to fleet updates
  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    setIsLoading(true);

    try {
      emit('operator:subscribe_fleet');

      // Listen for location updates
      const unsubscribeLocations = on('driver:location_updated', (data: DriverLocation) => {
        setLocations(prev => {
          const index = prev.findIndex(l => l.driver_id === data.driver_id);
          if (index >= 0) {
            const updated = [...prev];
            updated[index] = data;
            return updated;
          }
          return [...prev, data];
        });
      });

      // Listen for status changes
      const unsubscribeStatus = on('driver:status_changed', (data: any) => {
        // Filter out offline drivers or update their status
        setLocations(prev => prev.filter(l => l.driver_id !== data.driver_id || data.online));
      });

      setIsLoading(false);

      return () => {
        unsubscribeLocations();
        unsubscribeStatus();
      };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      setIsLoading(false);
    }
  }, [isAuthenticated, emit, on]);

  return {
    locations,
    isLoading,
    error,
  };
}

export default useRealtimeTracking;
