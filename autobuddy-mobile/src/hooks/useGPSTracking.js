import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { apiRequest } from '../lib/api';

const GPS_UPDATE_INTERVAL = 10000; // 10 seconds
const GPS_ACCURACY_THRESHOLD = 50; // meters

export function useGPSTracking({
  token,
  rideId,
  enabled = true,
  onLocationUpdate,
  syncToBackend = true,
}) {
  const [location, setLocation] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [speed, setSpeed] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState('');
  const locationWatchRef = useRef(null);
  const lastSyncRef = useRef(0);

  // Request location permissions
  const requestPermissions = useCallback(async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Location permission denied');
        return false;
      }
      return true;
    } catch (err) {
      setError(`Permission request failed: ${err.message}`);
      return false;
    }
  }, []);

  // Sync location to backend
  const syncLocationToBackend = useCallback(
    async (loc, rid) => {
      try {
        await apiRequest('/drivers/location', {
          method: 'POST',
          token,
          body: {
            latitude: loc.latitude,
            longitude: loc.longitude,
            accuracy,
            speed,
            ride_id: rid,
            timestamp: loc.timestamp,
          },
        });
      } catch (err) {
        console.warn('Location sync failed:', err);
      }
    },
    [token, accuracy, speed]
  );

  // Start GPS tracking
  const startTracking = useCallback(async () => {
    if (!enabled || !token) return;

    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      // Watch location with adaptive accuracy
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: GPS_UPDATE_INTERVAL,
          distanceInterval: 10, // 10 meters minimum movement
          mayShowUserSettingsDialog: true,
        },
        (position) => {
          const { latitude, longitude, accuracy: posAccuracy, speed: posSpeed } = position.coords;
          
          // Only update if accuracy is acceptable
          if (posAccuracy <= GPS_ACCURACY_THRESHOLD || !location) {
            const newLocation = {
              latitude: Number(latitude.toFixed(6)),
              longitude: Number(longitude.toFixed(6)),
              address: `Lat ${latitude.toFixed(4)}, Lng ${longitude.toFixed(4)}`,
              timestamp: new Date().toISOString(),
            };

            setLocation(newLocation);
            setAccuracy(Math.round(posAccuracy));
            setSpeed(Math.round((posSpeed || 0) * 3.6)); // Convert m/s to km/h
            setError('');

            // Sync to backend if ride is active
            if (syncToBackend && rideId && Date.now() - lastSyncRef.current > GPS_UPDATE_INTERVAL) {
              syncLocationToBackend(newLocation, rideId);
              lastSyncRef.current = Date.now();
            }

            // Trigger callback
            if (typeof onLocationUpdate === 'function') {
              onLocationUpdate(newLocation);
            }
          }
        }
      );

      locationWatchRef.current = subscription;
      setIsTracking(true);
    } catch (err) {
      setError(`Tracking failed: ${err.message}`);
      setIsTracking(false);
    }
  }, [enabled, location, onLocationUpdate, requestPermissions, rideId, syncLocationToBackend, syncToBackend, token]);

  // Stop tracking
  const stopTracking = useCallback(() => {
    if (locationWatchRef.current) {
      locationWatchRef.current.remove();
      locationWatchRef.current = null;
    }
    setIsTracking(false);
  }, []);

  // Get current location once
  const getCurrentLocation = useCallback(async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return null;

    try {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const { latitude, longitude } = position.coords;
      return {
        latitude: Number(latitude.toFixed(6)),
        longitude: Number(longitude.toFixed(6)),
      };
    } catch (err) {
      setError(`Get location failed: ${err.message}`);
      return null;
    }
  }, [requestPermissions]);

  // Auto-start tracking if enabled
  useEffect(() => {
    const timer = enabled && token ? setTimeout(() => startTracking(), 0) : null;
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
      if (enabled) {
        stopTracking();
      }
    };
  }, [enabled, startTracking, stopTracking, token]);

  return {
    location,
    accuracy,
    speed,
    isTracking,
    error,
    startTracking,
    stopTracking,
    getCurrentLocation,
  };
}
