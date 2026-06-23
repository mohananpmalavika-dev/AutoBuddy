import { useEffect, useState, useCallback } from 'react';
import { apiRequest } from '../lib/api-client';

export interface PassengerError {
  message: string;
  code?: string;
  status?: number;
}

export interface BookingData {
  id: string;
  origin: string;
  destination: string;
  rideType: string;
  fare: number;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  createdAt: Date;
}

export interface RideTrackingData {
  driverId: string;
  driverName: string;
  driverPhoto?: string;
  driverRating: number;
  vehicleType: string;
  licensePlate: string;
  eta: number;
  driverLocation: {
    latitude: number;
    longitude: number;
  };
  passengerLocation: {
    latitude: number;
    longitude: number;
  };
  destinationLocation: {
    latitude: number;
    longitude: number;
  };
}

export interface PaymentMethod {
  id: string;
  type: 'wallet' | 'upi' | 'card' | 'cash';
  label: string;
  isDefault: boolean;
  lastUsed?: Date;
}

export interface PassengerProfile {
  id: string;
  name: string;
  email?: string;
  phone: string;
  photo?: string;
  rating?: number;
  totalRides: number;
  joinedDate: Date;
  savedLocations: {
    id: string;
    label: string;
    address: string;
    latitude: number;
    longitude: number;
  }[];
}

export interface RideHistory {
  id: string;
  date: Date;
  driverName: string;
  origin: string;
  destination: string;
  distance: number;
  fare: number;
  rating?: number;
}

export interface ScheduledRide {
  id: string;
  destination: string;
  scheduledAt: Date;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  discount: number;
}

export interface FareEstimate {
  minFare: number;
  maxFare: number;
  estimatedTime: number;
  distance: number;
  surgeMultiplier?: number;
}

/**
 * Hook to handle ride booking
 */
export function usePassengerBooking(token: string | null) {
  const [booking, setBooking] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PassengerError | null>(null);

  const bookRide = useCallback(
    async (origin: string, destination: string, rideType: string, fare: number) => {
      if (!token) {return;}

      try {
        setLoading(true);
        setError(null);
        const response = await apiRequest<BookingData>('/passengers/rides/book', {
          method: 'POST',
          token,
          body: { origin, destination, rideType, fare },
        });
        setBooking(response || null);
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to book ride',
          code: apiError?.code,
          status: apiError?.status,
        });
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  const cancelBooking = useCallback(
    async (bookingId: string) => {
      if (!token) {return;}

      try {
        setLoading(true);
        await apiRequest(`/passengers/rides/${bookingId}/cancel`, {
          method: 'POST',
          token,
        });
        setBooking(null);
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to cancel booking',
          code: apiError?.code,
          status: apiError?.status,
        });
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  return { booking, loading, error, bookRide, cancelBooking };
}

/**
 * Hook to track active ride in real-time
 */
export function usePassengerRideTracking(token: string | null, bookingId?: string) {
  const [tracking, setTracking] = useState<RideTrackingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PassengerError | null>(null);

  useEffect(() => {
    if (!token || !bookingId) {return;}

    const fetchTracking = async () => {
      try {
        setLoading(true);
        const response = await apiRequest<RideTrackingData>(
          `/passengers/rides/${bookingId}/tracking`,
          { token }
        );
        setTracking(response || null);
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to fetch tracking',
          code: apiError?.code,
          status: apiError?.status,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchTracking();

    // Update tracking every 5 seconds
    const interval = setInterval(fetchTracking, 5000);
    return () => clearInterval(interval);
  }, [token, bookingId]);

  return { tracking, loading, error };
}

/**
 * Hook to manage payment methods
 */
export function usePassengerPayment(token: string | null) {
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PassengerError | null>(null);

  const fetchPaymentMethods = useCallback(async () => {
    if (!token) {return;}

    try {
      setLoading(true);
      setError(null);
      const response = await apiRequest<PaymentMethod[]>(
        '/passengers/me/payment-methods',
        { token }
      );
      setMethods(response || []);
    } catch (err: unknown) {
      const apiError = err as any;
      setError({
        message: apiError?.message || 'Failed to fetch payment methods',
        code: apiError?.code,
        status: apiError?.status,
      });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPaymentMethods();
  }, [fetchPaymentMethods]);

  const setDefaultMethod = useCallback(
    async (methodId: string) => {
      if (!token) {return;}

      try {
        await apiRequest(`/passengers/me/payment-methods/${methodId}/set-default`, {
          method: 'PUT',
          token,
        });
        setMethods(prev =>
          prev.map(m => ({
            ...m,
            isDefault: m.id === methodId,
          }))
        );
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to set default payment method',
          code: apiError?.code,
          status: apiError?.status,
        });
      }
    },
    [token]
  );

  return { methods, loading, error, setDefaultMethod, refetch: fetchPaymentMethods };
}

/**
 * Hook to fetch passenger profile
 */
export function usePassengerProfile(token: string | null) {
  const [profile, setProfile] = useState<PassengerProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PassengerError | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!token) {return;}

    try {
      setLoading(true);
      setError(null);
      const response = await apiRequest<PassengerProfile>(
        '/passengers/me/profile',
        { token }
      );
      setProfile(response || null);
    } catch (err: unknown) {
      const apiError = err as any;
      setError({
        message: apiError?.message || 'Failed to fetch profile',
        code: apiError?.code,
        status: apiError?.status,
      });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const updateProfile = useCallback(
    async (updates: Partial<PassengerProfile>) => {
      if (!token) {return;}

      try {
        setLoading(true);
        const response = await apiRequest<PassengerProfile>(
          '/passengers/me/profile',
          {
            method: 'PUT',
            token,
            body: updates,
          }
        );
        setProfile(response || null);
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to update profile',
          code: apiError?.code,
          status: apiError?.status,
        });
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  return { profile, loading, error, updateProfile, refetch: fetchProfile };
}

/**
 * Hook to fetch ride history
 */
export function usePassengerHistory(token: string | null, limit = 10) {
  const [rides, setRides] = useState<RideHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PassengerError | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const fetchHistory = useCallback(
    async (loadMore = false) => {
      if (!token) {return;}

      try {
        setLoading(true);
        setError(null);
        const query = `?limit=${limit}&offset=${loadMore ? offset + limit : 0}`;
        const response = await apiRequest<{ rides: RideHistory[]; total: number }>(
          `/passengers/me/ride-history${query}`,
          { token }
        );

        if (loadMore) {
          setRides(prev => [...prev, ...(response?.rides || [])]);
          setOffset(offset + limit);
        } else {
          setRides(response?.rides || []);
        }

        setHasMore((response?.rides?.length || 0) === limit);
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to fetch ride history',
          code: apiError?.code,
          status: apiError?.status,
        });
      } finally {
        setLoading(false);
      }
    },
    [token, limit, offset]
  );

  useEffect(() => {
    fetchHistory();
  }, []);

  return {
    rides,
    loading,
    error,
    hasMore,
    loadMore: () => fetchHistory(true),
    refetch: () => fetchHistory(false),
  };
}

/**
 * Hook to manage scheduled rides
 */
export function usePassengerSchedule(token: string | null) {
  const [scheduled, setScheduled] = useState<ScheduledRide[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PassengerError | null>(null);

  const fetchScheduled = useCallback(async () => {
    if (!token) {return;}

    try {
      setLoading(true);
      setError(null);
      const response = await apiRequest<ScheduledRide[]>(
        '/passengers/me/scheduled-rides',
        { token }
      );
      setScheduled(response || []);
    } catch (err: unknown) {
      const apiError = err as any;
      setError({
        message: apiError?.message || 'Failed to fetch scheduled rides',
        code: apiError?.code,
        status: apiError?.status,
      });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchScheduled();

    // Refresh every 120 seconds
    const interval = setInterval(fetchScheduled, 120000);
    return () => clearInterval(interval);
  }, [fetchScheduled]);

  const scheduleRide = useCallback(
    async (destination: string, scheduledAt: Date, rideType: string) => {
      if (!token) {return;}

      try {
        setLoading(true);
        const response = await apiRequest<ScheduledRide>(
          '/passengers/rides/schedule',
          {
            method: 'POST',
            token,
            body: { destination, scheduledAt, rideType },
          }
        );
        setScheduled(prev => [...prev, response]);
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to schedule ride',
          code: apiError?.code,
          status: apiError?.status,
        });
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  const cancelScheduled = useCallback(
    async (rideId: string) => {
      if (!token) {return;}

      try {
        await apiRequest(`/passengers/scheduled-rides/${rideId}/cancel`, {
          method: 'POST',
          token,
        });
        setScheduled(prev => prev.filter(r => r.id !== rideId));
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to cancel scheduled ride',
          code: apiError?.code,
          status: apiError?.status,
        });
      }
    },
    [token]
  );

  return { scheduled, loading, error, scheduleRide, cancelScheduled, refetch: fetchScheduled };
}

/**
 * Hook to estimate fare
 */
export function usePassengerFareEstimate(token: string | null) {
  const [estimate, setEstimate] = useState<FareEstimate | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<PassengerError | null>(null);

  const estimateFare = useCallback(
    async (origin: string, destination: string, rideType: string) => {
      if (!token) {return;}

      try {
        setLoading(true);
        setError(null);
        const response = await apiRequest<FareEstimate>(
          '/passengers/rides/estimate-fare',
          {
            method: 'POST',
            token,
            body: { origin, destination, rideType },
          }
        );
        setEstimate(response || null);
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to estimate fare',
          code: apiError?.code,
          status: apiError?.status,
        });
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  return { estimate, loading, error, estimateFare };
}
