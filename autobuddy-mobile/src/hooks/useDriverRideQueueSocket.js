import { useEffect } from 'react';

import { DRIVER_RIDE_SOCKET_EVENTS } from '../lib/driverDashboardFlow';
import { createAutoBuddySocket } from '../lib/socket';

const DRIVER_HEARTBEAT_INTERVAL_MS = Math.max(
  5000,
  Number(process.env.EXPO_PUBLIC_REALTIME_HEARTBEAT_SECONDS || 15) * 1000,
);

export function useDriverRideQueueSocket({
  token,
  socketRef,
  refreshDriverRideQueueFromRealtime,
  onSocketError,
  activeRideId = null,
  heartbeatEnabled = false,
}) {
  useEffect(() => {
    if (!token) {
      return undefined;
    }

    const socket = createAutoBuddySocket(token);
    socketRef.current = socket;

    const refreshFromRealtime = () => {
      void refreshDriverRideQueueFromRealtime();
    };
    const handleSocketError = (err) => {
      onSocketError?.(err);
    };

    socket.on('connect', refreshFromRealtime);
    DRIVER_RIDE_SOCKET_EVENTS.forEach((eventName) => {
      socket.on(eventName, refreshFromRealtime);
    });
    socket.on('connect_error', handleSocketError);

    if (socket.connected) {
      refreshFromRealtime();
    }

    return () => {
      socket.off('connect', refreshFromRealtime);
      DRIVER_RIDE_SOCKET_EVENTS.forEach((eventName) => {
        socket.off(eventName, refreshFromRealtime);
      });
      socket.off('connect_error', handleSocketError);
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [onSocketError, refreshDriverRideQueueFromRealtime, socketRef, token]);

  useEffect(() => {
    const bookingId = String(activeRideId || '').trim();
    const socket = socketRef.current;
    if (!token || !socket || !bookingId) {
      return undefined;
    }

    const joinBookingRoom = () => {
      socket.emit('join_booking', { booking_id: bookingId });
    };

    socket.on('connect', joinBookingRoom);
    if (socket.connected) {
      joinBookingRoom();
    }

    return () => {
      socket.off('connect', joinBookingRoom);
    };
  }, [activeRideId, socketRef, token]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!token || !socket || !heartbeatEnabled) {
      return undefined;
    }

    const emitHeartbeat = () => {
      const currentSocket = socketRef.current;
      if (!currentSocket?.connected) {
        return;
      }
      currentSocket.emit('driver_heartbeat', {
        booking_id: String(activeRideId || '').trim() || undefined,
      });
    };

    socket.on('connect', emitHeartbeat);
    emitHeartbeat();
    const timer = setInterval(emitHeartbeat, DRIVER_HEARTBEAT_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      socket.off('connect', emitHeartbeat);
    };
  }, [activeRideId, heartbeatEnabled, socketRef, token]);
}
