import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { createAutoBuddySocket } from '../lib/socket';
import { emitDriverLocation } from '../services/socketClient';
import { apiRequest } from '../lib/api';
import {
  startBackgroundDriverTracking,
  stopBackgroundDriverTracking,
} from '../services/driverBackgroundTracking';

const HEARTBEAT_MS = Math.max(
  5000,
  Number(process.env.EXPO_PUBLIC_REALTIME_HEARTBEAT_SECONDS || 15) * 1000,
);
const MOVING_INTERVAL_MS = 5000;
const IDLE_INTERVAL_MS = 20000;
const IDLE_SPEED_THRESHOLD_KMH = 2;

export function useDriverRealtimeTracking({
  token,
  activeRideId,
  enabled = true,
  manageLocationWatch = true,
  manageBackgroundTracking = manageLocationWatch,
}) {
  const socketRef = useRef(null);
  const locationSubRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const lastLocationRef = useRef(null);
  const telemetryTimerRef = useRef(null);
  const hasRequestedBgPermRef = useRef(false);

  const [connected, setConnected] = useState(false);
  const [trackingError, setTrackingError] = useState('');
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [trackingInterval, setTrackingInterval] = useState(MOVING_INTERVAL_MS);

  const updateAdaptiveIntervalFromKmh = useCallback((speedKmh) => {
    const next = speedKmh < IDLE_SPEED_THRESHOLD_KMH ? IDLE_INTERVAL_MS : MOVING_INTERVAL_MS;
    setTrackingInterval((prev) => (prev === next ? prev : next));
  }, []);

  const emitTelemetry = useCallback(
    async ({ latitude, longitude, speedKmh, timestamp }) => {
      if (!enabled || !token) {
        return;
      }
      try {
        await apiRequest('/drivers/telemetry', {
          method: 'POST',
          token,
          body: {
            latitude,
            longitude,
            speed: speedKmh,
            timestamp,
          },
        });
      } catch {
        // Keep realtime stream resilient even when telemetry ingestion fails.
      }
    },
    [enabled, token],
  );

  const emitSocketLocationUpdate = useCallback((payload) => {
    if (!payload) {
      return;
    }
    const speedKmh = Number(payload.speed ?? 0);
    const normalizedSpeed = Number.isFinite(speedKmh) ? Math.max(0, speedKmh) : 0;
    setCurrentSpeed(normalizedSpeed);
    updateAdaptiveIntervalFromKmh(normalizedSpeed);
    if (socketRef.current?.connected) {
      try {
        emitDriverLocation(payload.booking_id || activeRideId, payload.latitude, payload.longitude, payload.accuracy);
      } catch (err) {
        // Fallback to raw socket emit if helper fails
        socketRef.current.emit('driver_location_update', payload);
      }
    }
    clearTimeout(telemetryTimerRef.current);
    telemetryTimerRef.current = setTimeout(() => {
      emitTelemetry({
        latitude: Number(payload.latitude),
        longitude: Number(payload.longitude),
        speedKmh: normalizedSpeed,
        timestamp: Date.now(),
      }).catch(() => null);
    }, 0);
  }, [emitTelemetry, updateAdaptiveIntervalFromKmh]);

  const emitLocation = useCallback(
    async (location) => {
      if (!location || !enabled) {
        return;
      }

      const coords = location.coords || location;
      const payload = {
        booking_id: activeRideId || undefined,
        latitude: coords.latitude,
        longitude: coords.longitude,
        heading: coords.heading ?? null,
        speed:
          Number.isFinite(Number(coords.speed))
            ? Number(coords.speed) * 3.6
            : 0,
        accuracy: coords.accuracy ?? null,
      };

      lastLocationRef.current = payload;
      emitSocketLocationUpdate(payload);

      try {
        await apiRequest('/drivers/location', {
          method: 'PUT',
          token,
          body: {
            location: {
              latitude: payload.latitude,
              longitude: payload.longitude,
              heading: payload.heading,
              speed: payload.speed,
              accuracy: payload.accuracy,
            },
          },
        });
      } catch {
        // Socket still handles live tracking; REST retry can be added later.
      }

      await emitTelemetry({
        latitude: Number(payload.latitude),
        longitude: Number(payload.longitude),
        speedKmh: Number(payload.speed || 0),
        timestamp: Date.now(),
      });
    },
    [activeRideId, emitSocketLocationUpdate, emitTelemetry, enabled, token],
  );

  const startLocationWatch = useCallback(async () => {
    if (!manageLocationWatch) {
      return;
    }

    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      setTrackingError('Location permission denied.');
      return;
    }

    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    await emitLocation(current);

    locationSubRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: trackingInterval,
        distanceInterval: trackingInterval === MOVING_INTERVAL_MS ? 5 : 15,
      },
      emitLocation,
    );
  }, [emitLocation, manageLocationWatch, trackingInterval]);

  const startBackgroundTracking = useCallback(async () => {
    if (!manageBackgroundTracking || Platform.OS === 'web' || !token || !activeRideId || !enabled) {
      return;
    }

    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      setTrackingError('Location permission denied.');
      return;
    }

    let bg = await Location.getBackgroundPermissionsAsync().catch(() => null);
    if (bg?.status !== 'granted' && !hasRequestedBgPermRef.current) {
      hasRequestedBgPermRef.current = true;
      bg = await Location.requestBackgroundPermissionsAsync();
    }

    if (bg?.status !== 'granted') {
      setTrackingError('Background location not granted. Live tracking works only while app is open.');
      await stopBackgroundDriverTracking().catch(() => null);
      return;
    }

    await startBackgroundDriverTracking({
      token,
      activeRideId,
    });
  }, [activeRideId, enabled, manageBackgroundTracking, token]);

  useEffect(() => {
    if (!token || !enabled) {
      return undefined;
    }

    const socket = createAutoBuddySocket(token);
    socketRef.current = socket;

    const handleConnect = () => {
      setConnected(true);
      if (activeRideId) {
        socket.emit('join_ride_room', { booking_id: activeRideId });
        socket.emit('request_ride_sync', { booking_id: activeRideId });
      }
      if (lastLocationRef.current) {
        try {
          emitDriverLocation(lastLocationRef.current.booking_id || activeRideId, lastLocationRef.current.latitude, lastLocationRef.current.longitude, lastLocationRef.current.accuracy);
        } catch (err) {
          socket.emit('driver_location_update', lastLocationRef.current);
        }
      }
    };

    const handleDisconnect = () => {
      setConnected(false);
    };

    const handleConnectError = () => {
      setConnected(false);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);

    heartbeatTimerRef.current = setInterval(() => {
      if (socket.connected) {
        socket.emit('driver_heartbeat', {
          booking_id: activeRideId || undefined,
        });
      }
    }, HEARTBEAT_MS);

    if (socket.connected) {
      handleConnect();
    }

    return () => {
      stopBackgroundDriverTracking().catch(() => null);
      clearTimeout(telemetryTimerRef.current);
      if (activeRideId) {
        socket.emit('leave_ride_room', { booking_id: activeRideId });
      }
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      clearInterval(heartbeatTimerRef.current);
      if (locationSubRef.current) {
        locationSubRef.current.remove();
        locationSubRef.current = null;
      }
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, enabled, activeRideId]);

  useEffect(() => {
    if (!token || !enabled || !manageLocationWatch) {
      return undefined;
    }
    const restartTimer = setTimeout(() => {
      startLocationWatch().catch(() => null);
    }, 0);
    return () => {
      clearTimeout(restartTimer);
      if (locationSubRef.current) {
        locationSubRef.current.remove();
        locationSubRef.current = null;
      }
    };
  }, [token, enabled, manageLocationWatch, trackingInterval, startLocationWatch]);

  useEffect(() => {
    if (Platform.OS === 'web' || !manageBackgroundTracking) {
      return undefined;
    }

    if (!token || !enabled || !activeRideId) {
      stopBackgroundDriverTracking().catch(() => null);
      return undefined;
    }

    let cancelled = false;
    const startTimer = setTimeout(() => {
      if (!cancelled) {
        startBackgroundTracking().catch(() => null);
      }
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(startTimer);
      stopBackgroundDriverTracking().catch(() => null);
    };
  }, [activeRideId, enabled, manageBackgroundTracking, startBackgroundTracking, token]);

  return {
    connected,
    trackingError,
    currentSpeed,
    trackingInterval,
    emitSocketLocationUpdate,
    emitLocation,
  };
}
