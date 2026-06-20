import { useEffect, useRef, useState, useCallback } from 'react';
import * as Location from 'expo-location';
import { apiRequest } from '../lib/api-client';

export interface DriverLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;
  heading?: number;
  speed?: number;
  timestamp: Date;
}

export interface LocationUpdate {
  driverId: string;
  location: DriverLocation;
  status: 'online' | 'offline' | 'on_ride';
}

interface UseRealtimeLocationTrackingReturn {
  currentLocation: DriverLocation | null;
  isTracking: boolean;
  error: Error | null;
  startTracking: () => Promise<boolean>;
  stopTracking: () => void;
  getLocationPermission: () => Promise<boolean>;
  updateLocation: (location: DriverLocation) => Promise<boolean>;
  getDriverLocation: (driverId: string) => Promise<DriverLocation | null>;
  watchDriverLocation: (driverId: string, callback: (location: DriverLocation) => void) => void;
  stopWatchingDriverLocation: (driverId: string) => void;
  getMultipleDriverLocations: (driverIds: string[]) => Promise<Record<string, DriverLocation>>;
  getDistance: (from: DriverLocation, to: DriverLocation) => number;
}

const LOCATION_UPDATE_INTERVAL = 5000; // 5 seconds
const LOCATION_ACCURACY_THRESHOLD = 50; // 50 meters
const FAST_MODE_INTERVAL = 1000; // 1 second during active ride

export const useRealtimeLocationTracking = (
  token: string | null,
  driverId: string,
  enabled: boolean = true
): UseRealtimeLocationTrackingReturn => {
  const [currentLocation, setCurrentLocation] = useState<DriverLocation | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const locationSubscriptionRef = useRef<Location.LocationSubscription | null>(null);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const driverWatchersRef = useRef<Map<string, Set<Function>>>(new Map());
  const lastLocationRef = useRef<DriverLocation | null>(null);

  const getLocationPermission = useCallback(async (): Promise<boolean> => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError(new Error('Location permission denied'));
        return false;
      }
      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Permission request failed');
      setError(error);
      return false;
    }
  }, []);

  const initializeWebSocket = useCallback(async () => {
    try {
      const response = await apiRequest('/location/ws-auth', {
        method: 'POST',
        body: { driverId },
      });

      if (response.wsUrl) {
        socketRef.current = new WebSocket(response.wsUrl);

        socketRef.current.onopen = () => {
          socketRef.current?.send(
            JSON.stringify({
              type: 'driver_location_connect',
              driverId,
            })
          );
        };

        socketRef.current.onmessage = (event: MessageEvent) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'driver_location_update') {
              const location: DriverLocation = {
                latitude: data.latitude,
                longitude: data.longitude,
                accuracy: data.accuracy,
                altitude: data.altitude,
                heading: data.heading,
                speed: data.speed,
                timestamp: new Date(data.timestamp),
              };

              const watcherKey = data.driverId;
              if (watcherKey && driverWatchersRef.current.has(watcherKey)) {
                const watchers = driverWatchersRef.current.get(watcherKey);
                watchers?.forEach((callback) => callback(location));
              }
            }
          } catch (err) {
            console.error('[Location] WebSocket message parse error:', err);
          }
        };

        socketRef.current.onerror = () => {
          setError(new Error('WebSocket connection error'));
          socketRef.current = null;
        };
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error('WebSocket init failed');
      setError(error);
    }
  }, [driverId]);

  const updateLocation = useCallback(
    async (location: DriverLocation): Promise<boolean> => {
      if (!token) return false;

      try {
        const response = await apiRequest('/location/update', {
          method: 'POST',
          body: {
            driverId,
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
            altitude: location.altitude,
            heading: location.heading,
            speed: location.speed,
            timestamp: location.timestamp.toISOString(),
          },
        });

        if (response.success) {
          lastLocationRef.current = location;
          setCurrentLocation(location);

          if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(
              JSON.stringify({
                type: 'location_update',
                driverId,
                location: {
                  latitude: location.latitude,
                  longitude: location.longitude,
                  accuracy: location.accuracy,
                },
              })
            );
          }

          return true;
        }
        return false;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Location update failed');
        console.error('[Location] Update failed:', error);
        return false;
      }
    },
    [token, driverId]
  );

  const startTracking = useCallback(async (): Promise<boolean> => {
    if (!enabled || isTracking) return false;

    const hasPermission = await getLocationPermission();
    if (!hasPermission) return false;

    try {
      setError(null);
      setIsTracking(true);

      await initializeWebSocket();

      locationSubscriptionRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: LOCATION_UPDATE_INTERVAL,
          distanceInterval: 10,
          mayShowUserSettingsDialog: true,
        },
        (position) => {
          const location: DriverLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy || 0,
            altitude: position.coords.altitude || undefined,
            heading: position.coords.heading || undefined,
            speed: position.coords.speed || undefined,
            timestamp: new Date(),
          };

          const lastLoc = lastLocationRef.current;
          const shouldUpdate =
            !lastLoc ||
            location.accuracy < lastLoc.accuracy ||
            getDistance(location, lastLoc) > 10;

          if (shouldUpdate) {
            updateLocation(location).catch((err) => {
              console.error('[Location] Failed to update:', err);
            });
          }
        }
      );

      return true;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Tracking failed');
      setError(error);
      setIsTracking(false);
      return false;
    }
  }, [enabled, isTracking, getLocationPermission, initializeWebSocket, updateLocation]);

  const stopTracking = useCallback(() => {
    if (locationSubscriptionRef.current) {
      locationSubscriptionRef.current.remove();
      locationSubscriptionRef.current = null;
    }

    if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current);
      updateIntervalRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    setIsTracking(false);
  }, []);

  const getDriverLocation = useCallback(
    async (targetDriverId: string): Promise<DriverLocation | null> => {
      if (!token) return null;

      try {
        const response = await apiRequest(`/location/driver/${targetDriverId}`, {
          method: 'GET',
        });

        if (response.location) {
          return {
            latitude: response.location.latitude,
            longitude: response.location.longitude,
            accuracy: response.location.accuracy,
            altitude: response.location.altitude,
            heading: response.location.heading,
            speed: response.location.speed,
            timestamp: new Date(response.location.timestamp),
          };
        }

        return null;
      } catch (err) {
        console.error('[Location] Failed to get driver location:', err);
        return null;
      }
    },
    [token]
  );

  const getMultipleDriverLocations = useCallback(
    async (driverIds: string[]): Promise<Record<string, DriverLocation>> => {
      if (!token) return {};

      try {
        const response = await apiRequest('/location/drivers', {
          method: 'POST',
          body: { driverIds },
        });

        const locations: Record<string, DriverLocation> = {};

        (response.locations || []).forEach((loc: any) => {
          locations[loc.driverId] = {
            latitude: loc.latitude,
            longitude: loc.longitude,
            accuracy: loc.accuracy,
            altitude: loc.altitude,
            heading: loc.heading,
            speed: loc.speed,
            timestamp: new Date(loc.timestamp),
          };
        });

        return locations;
      } catch (err) {
        console.error('[Location] Failed to get multiple locations:', err);
        return {};
      }
    },
    [token]
  );

  const watchDriverLocation = useCallback((targetDriverId: string, callback: Function) => {
    if (!driverWatchersRef.current.has(targetDriverId)) {
      driverWatchersRef.current.set(targetDriverId, new Set());
    }

    driverWatchersRef.current.get(targetDriverId)?.add(callback);
  }, []);

  const stopWatchingDriverLocation = useCallback((targetDriverId: string) => {
    driverWatchersRef.current.delete(targetDriverId);
  }, []);

  const getDistance = (from: DriverLocation, to: DriverLocation): number => {
    const R = 6371; // Earth's radius in km
    const dLat = ((to.latitude - from.latitude) * Math.PI) / 180;
    const dLon = ((to.longitude - from.longitude) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((from.latitude * Math.PI) / 180) *
        Math.cos((to.latitude * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c * 1000; // Return in meters
  };

  useEffect(() => {
    if (enabled) {
      startTracking().catch(() => null);
    }

    return () => {
      stopTracking();
    };
  }, [enabled, startTracking, stopTracking]);

  return {
    currentLocation,
    isTracking,
    error,
    startTracking,
    stopTracking,
    getLocationPermission,
    updateLocation,
    getDriverLocation,
    watchDriverLocation,
    stopWatchingDriverLocation,
    getMultipleDriverLocations,
    getDistance,
  };
};

export default useRealtimeLocationTracking;
