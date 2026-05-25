import { useEffect, useRef, useState } from 'react';

import { createAutoBuddySocket } from '../lib/socket';

export function usePassengerRideRealtime({ token, activeBooking }) {
  const socketRef = useRef(null);

  const [driverLocation, setDriverLocation] = useState(null);
  const [rideStatus, setRideStatus] = useState(activeBooking?.status || null);
  const [etaToPickup, setEtaToPickup] = useState(null);
  const [etaToDrop, setEtaToDrop] = useState(null);
  const [driverOnline, setDriverOnline] = useState(false);

  useEffect(() => {
    if (!token || !activeBooking?.id) {
      return undefined;
    }

    const socket = createAutoBuddySocket(token);
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join_ride_room', {
        booking_id: activeBooking.id,
      });
      socket.emit('request_ride_sync', {
        booking_id: activeBooking.id,
      });
    });

    socket.on('ride_state_sync', (payload) => {
      setRideStatus(payload?.status || null);
      if (payload?.driver_live_location) {
        setDriverLocation(payload.driver_live_location);
      }
      setEtaToPickup(payload?.eta_to_pickup_min ?? null);
      setEtaToDrop(payload?.eta_to_drop_min ?? null);
    });

    socket.on('driver_location', (payload) => {
      if (String(payload?.booking_id || '') !== String(activeBooking.id)) {
        return;
      }
      setDriverLocation(payload.location || null);
      setEtaToPickup(payload.eta_to_pickup_min ?? null);
      setEtaToDrop(payload.eta_to_drop_min ?? null);
      setDriverOnline(true);
    });

    socket.on('booking_status_changed', (payload) => {
      if (String(payload?.booking_id || '') !== String(activeBooking.id)) {
        return;
      }
      setRideStatus(payload.status || null);
    });

    socket.on('driver_connection_changed', (payload) => {
      if (String(payload?.booking_id || '') !== String(activeBooking.id)) {
        return;
      }
      setDriverOnline(Boolean(payload.online));
    });

    if (socket.connected) {
      socket.emit('join_ride_room', { booking_id: activeBooking.id });
      socket.emit('request_ride_sync', { booking_id: activeBooking.id });
    }

    return () => {
      socket.emit('leave_ride_room', {
        booking_id: activeBooking.id,
      });
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, activeBooking?.id]);

  return {
    driverLocation,
    rideStatus: rideStatus || activeBooking?.status || null,
    etaToPickup,
    etaToDrop,
    driverOnline,
  };
}
