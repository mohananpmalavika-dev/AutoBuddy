import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * ScheduledRidesContext - Manage scheduled/future rides
 */

const ScheduledRidesContext = createContext(null);

export function ScheduledRidesProvider({ children }) {
  const [scheduledRides, setScheduledRides] = useState([]);

  const createScheduledRide = useCallback((rideData) => {
    const ride = {
      id: `scheduled-${Date.now()}`,
      ...rideData,
      status: 'scheduled',
      createdAt: new Date(),
    };
    setScheduledRides((prev) => [...prev, ride]);
    return ride;
  }, []);

  const cancelScheduledRide = useCallback((rideId) => {
    setScheduledRides((prev) =>
      prev.map((r) => (r.id === rideId ? { ...r, status: 'cancelled' } : r))
    );
  }, []);

  const rescheduleRide = useCallback((rideId, newDateTime) => {
    setScheduledRides((prev) =>
      prev.map((r) => (r.id === rideId ? { ...r, scheduledAt: newDateTime } : r))
    );
  }, []);

  const getUpcomingRides = useCallback(
    () => scheduledRides.filter((r) => r.status === 'scheduled' && new Date(r.scheduledAt) > new Date()),
    [scheduledRides]
  );

  const value = {
    scheduledRides,
    createScheduledRide,
    cancelScheduledRide,
    rescheduleRide,
    getUpcomingRides,
    setScheduledRides,
  };

  return (
    <ScheduledRidesContext.Provider value={value}>
      {children}
    </ScheduledRidesContext.Provider>
  );
}

export function useScheduledRides() {
  const context = useContext(ScheduledRidesContext);
  if (!context) {
    throw new Error('useScheduledRides must be used within ScheduledRidesProvider');
  }
  return context;
}
