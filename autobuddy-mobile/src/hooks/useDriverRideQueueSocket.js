import { useEffect } from 'react';

import { DRIVER_RIDE_SOCKET_EVENTS } from '../lib/driverDashboardFlow';
import { createAutoBuddySocket } from '../lib/socket';

export function useDriverRideQueueSocket({
  token,
  socketRef,
  refreshDriverRideQueueFromRealtime,
  onSocketError,
  activeRideId = null,
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
}
