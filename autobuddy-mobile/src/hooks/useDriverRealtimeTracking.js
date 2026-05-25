import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

import { createAutoBuddySocket } from '../lib/socket';
import { apiRequest } from '../lib/api';
import {
  startBackgroundDriverTracking,
  stopBackgroundDriverTracking,
} from '../services/driverBackgroundTracking';

const HEARTBEAT_MS = Math.max(
  5000,
  Number(process.env.EXPO_PUBLIC_REALTIME_HEARTBEAT_SECONDS || 15) * 1000,
);

export function useDriverRealtimeTracking({
  token,
  activeRideId,
  enabled = true,
  manageLocationWatch = true,
}) {
  const socketRef = useRef(null);
  const locationSubRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const lastLocationRef = useRef(null);

  const [connected, setConnected] = useState(false);
  const [trackingError, setTrackingError] = useState('');

  const emitSocketLocationUpdate = useCallback((payload) => {
    if (!payload) {
      return;
    }
    if (socketRef.current?.connected) {
      socketRef.current.emit('driver_location_update', payload);
    }
  }, []);

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
        speed: coords.speed ?? null,
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
    },
    [activeRideId, emitSocketLocationUpdate, enabled, token],
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

    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== 'granted') {
      setTrackingError('Background location not granted. Live tracking works only while app is open.');
    } else if (Platform.OS !== 'web' && activeRideId) {
      await startBackgroundDriverTracking({
        token,
        activeRideId,
      });
    }

    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    await emitLocation(current);

    locationSubRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.High,
        timeInterval: 5000,
        distanceInterval: 10,
      },
      emitLocation,
    );
  }, [activeRideId, emitLocation, manageLocationWatch, token]);

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
        socket.emit('driver_location_update', lastLocationRef.current);
      }
      startLocationWatch().catch(() => null);
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
  }, [token, enabled, activeRideId, startLocationWatch]);

  return {
    connected,
    trackingError,
    emitSocketLocationUpdate,
    emitLocation,
  };
}
