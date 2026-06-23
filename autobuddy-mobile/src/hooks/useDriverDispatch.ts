import { useState, useCallback, useRef, useEffect } from 'react';
import { apiRequest } from '../lib/api-client';

export interface RideOffer {
  offerId: string;
  rideId: string;
  passengerId: string;
  pickupLocation: string;
  dropoffLocation: string;
  estimatedFare: number;
  estimatedDuration: number;
  estimatedDistance: number;
  passengerName: string;
  passengerRating: number;
  offerExpiresAt: Date;
  vehicleType: string;
  rideType: 'regular' | 'scheduled' | 'goods' | 'airport';
  surgeMultiplier: number;
}

export interface DriverRide {
  rideId: string;
  status: 'accepted' | 'arrived' | 'in_progress' | 'completed' | 'cancelled';
  passenger: {
    id: string;
    name: string;
    phone: string;
    rating: number;
    profileImage?: string;
  };
  pickup: {
    location: string;
    latitude: number;
    longitude: number;
    arrivedAt?: Date;
  };
  dropoff: {
    location: string;
    latitude: number;
    longitude: number;
  };
  fare: {
    estimatedAmount: number;
    finalAmount?: number;
    currency: string;
  };
  startedAt?: Date;
  completedAt?: Date;
  cancellationReason?: string;
}

interface UseDriverDispatchReturn {
  rideOffers: RideOffer[];
  activeRide: DriverRide | null;
  isLoadingOffers: boolean;
  isAccepting: boolean;
  error: Error | null;
  fetchRideOffers: () => Promise<void>;
  acceptRideOffer: (offerId: string) => Promise<boolean>;
  declineRideOffer: (offerId: string, reason?: string) => Promise<boolean>;
  acceptMultipleOffers: (offerIds: string[]) => Promise<{ accepted: string[]; failed: string[] }>;
  markDriverArrived: (rideId: string) => Promise<boolean>;
  startRide: (rideId: string, otp?: string) => Promise<boolean>;
  completeRide: (rideId: string, otp?: string, rating?: number) => Promise<boolean>;
  cancelRide: (rideId: string, reason: string) => Promise<boolean>;
  getActiveRide: () => Promise<DriverRide | null>;
  getRideOfferExpiry: (offerId: string) => number;
  clearError: () => void;
}

export const useDriverDispatch = (
  token: string | null,
  driverId: string
): UseDriverDispatchReturn => {
  const [rideOffers, setRideOffers] = useState<RideOffer[]>([]);
  const [activeRide, setActiveRide] = useState<DriverRide | null>(null);
  const [isLoadingOffers, setIsLoadingOffers] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const socketRef = useRef<any>(null);
  const offerTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    if (!token) return;

    const initSocket = async () => {
      try {
        const response = await apiRequest('/drivers/socket-auth', {
          method: 'POST',
          body: { driverId },
        });

        if (response.socketUrl) {
          socketRef.current = new WebSocket(response.socketUrl);

          socketRef.current.onopen = () => {
            socketRef.current?.send(
              JSON.stringify({
                type: 'driver_connect',
                driverId,
              })
            );
          };

          socketRef.current.onmessage = (event: MessageEvent) => {
            try {
              const data = JSON.parse(event.data);

              if (data.type === 'ride_offer') {
                const offer: RideOffer = {
                  offerId: data.offerId,
                  rideId: data.rideId,
                  passengerId: data.passengerId,
                  pickupLocation: data.pickupLocation,
                  dropoffLocation: data.dropoffLocation,
                  estimatedFare: data.estimatedFare,
                  estimatedDuration: data.estimatedDuration,
                  // Accept multiple possible field names from server (camelCase, snake_case, or distance_km)
                  estimatedDistance: Number(data.estimatedDistance ?? data.estimated_distance_km ?? data.distance_km ?? 0),
                  passengerName: data.passengerName,
                  passengerRating: data.passengerRating,
                  offerExpiresAt: new Date(data.offerExpiresAt),
                  vehicleType: data.vehicleType,
                  rideType: data.rideType,
                  surgeMultiplier: data.surgeMultiplier || 1,
                };

                setRideOffers((prev) => [offer, ...prev]);

                const timeoutDuration =
                  offer.offerExpiresAt.getTime() - Date.now();
                if (timeoutDuration > 0) {
                  const timeout = setTimeout(() => {
                    setRideOffers((prev) =>
                      prev.filter((o) => o.offerId !== offer.offerId)
                    );
                  }, timeoutDuration);

                  offerTimeoutRef.current?.set(offer.offerId, timeout);
                }
              }

              if (data.type === 'ride_status_update') {
                setActiveRide((prev) =>
                  prev
                    ? {
                        ...prev,
                        status: data.status,
                        completedAt:
                          data.status === 'completed'
                            ? new Date()
                            : prev.completedAt,
                      }
                    : null
                );
              }
            } catch (err) {
              console.error('[Dispatch] Socket message parse error:', err);
            }
          };

          socketRef.current.onerror = (event: Event) => {
            setError(
              new Error('WebSocket connection error')
            );
          };
        }
      } catch (err) {
        const error =
          err instanceof Error
            ? err
            : new Error('Failed to initialize socket');
        setError(error);
      }
    };

    initSocket();

    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
      offerTimeoutRef.current?.forEach((timeout) => clearTimeout(timeout));
    };
  }, [token, driverId]);

  const fetchRideOffers = useCallback(async () => {
    if (!token) return;

    setIsLoadingOffers(true);
    setError(null);
    try {
      const response = await apiRequest('/drivers/ride-offers', {
        method: 'GET',
      });

      const offers = (response.offers || []).map((o: any) => ({
        offerId: o.offerId,
        rideId: o.rideId,
        passengerId: o.passengerId,
        pickupLocation: o.pickupLocation,
        dropoffLocation: o.dropoffLocation,
        estimatedFare: o.estimatedFare,
        estimatedDuration: o.estimatedDuration,
        // Accept multiple server field variants for distance
        estimatedDistance: Number(o.estimatedDistance ?? o.estimated_distance_km ?? o.distance_km ?? 0),
        passengerName: o.passengerName,
        passengerRating: o.passengerRating,
        offerExpiresAt: new Date(o.offerExpiresAt),
        vehicleType: o.vehicleType,
        rideType: o.rideType,
        surgeMultiplier: o.surgeMultiplier || 1,
      }));

      setRideOffers(offers);
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to fetch ride offers');
      setError(error);
    } finally {
      setIsLoadingOffers(false);
    }
  }, [token]);

  const acceptRideOffer = useCallback(
    async (offerId: string): Promise<boolean> => {
      if (!token) return false;

      setIsAccepting(true);
      setError(null);

      try {
        const response = await apiRequest('/drivers/accept-offer', {
          method: 'POST',
          body: { offerId },
        });

        if (response.rideId) {
          setRideOffers((prev) => prev.filter((o) => o.offerId !== offerId));
          setActiveRide({
            rideId: response.rideId,
            status: 'accepted',
            passenger: response.passenger,
            pickup: {
              location: response.pickup.location,
              latitude: response.pickup.latitude,
              longitude: response.pickup.longitude,
            },
            dropoff: {
              location: response.dropoff.location,
              latitude: response.dropoff.latitude,
              longitude: response.dropoff.longitude,
            },
            fare: {
              estimatedAmount: response.fare.estimatedAmount,
              currency: response.fare.currency,
            },
            startedAt: response.startedAt
              ? new Date(response.startedAt)
              : undefined,
          });

          const timeout = offerTimeoutRef.current?.get(offerId);
          if (timeout) {
            clearTimeout(timeout);
            offerTimeoutRef.current?.delete(offerId);
          }

          return true;
        }

        throw new Error('Failed to accept ride offer');
      } catch (err) {
        const error =
          err instanceof Error
            ? err
            : new Error('Failed to accept ride offer');
        setError(error);
        return false;
      } finally {
        setIsAccepting(false);
      }
    },
    [token]
  );

  const declineRideOffer = useCallback(
    async (offerId: string, reason?: string): Promise<boolean> => {
      if (!token) return false;

      try {
        await apiRequest('/drivers/decline-offer', {
          method: 'POST',
          body: { offerId, reason },
        });

        setRideOffers((prev) => prev.filter((o) => o.offerId !== offerId));

        const timeout = offerTimeoutRef.current?.get(offerId);
        if (timeout) {
          clearTimeout(timeout);
          offerTimeoutRef.current?.delete(offerId);
        }

        return true;
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to decline offer');
        setError(error);
        return false;
      }
    },
    [token]
  );

  const acceptMultipleOffers = useCallback(
    async (offerIds: string[]): Promise<{ accepted: string[]; failed: string[] }> => {
      const accepted: string[] = [];
      const failed: string[] = [];

      for (const offerId of offerIds) {
        const success = await acceptRideOffer(offerId);
        if (success) {
          accepted.push(offerId);
        } else {
          failed.push(offerId);
        }
      }

      return { accepted, failed };
    },
    [acceptRideOffer]
  );

  const markDriverArrived = useCallback(
    async (rideId: string): Promise<boolean> => {
      if (!token) return false;

      try {
        const response = await apiRequest(`/rides/${rideId}/arrived`, {
          method: 'POST',
        });

        if (response.success) {
          setActiveRide((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'arrived',
                  pickup: {
                    ...prev.pickup,
                    arrivedAt: new Date(),
                  },
                }
              : null
          );
          return true;
        }
        return false;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to mark arrived');
        setError(error);
        return false;
      }
    },
    [token]
  );

  const startRide = useCallback(
    async (rideId: string, otp?: string): Promise<boolean> => {
      if (!token) return false;

      try {
        const response = await apiRequest(`/rides/${rideId}/start`, {
          method: 'POST',
          body: { otp },
        });

        if (response.success) {
          setActiveRide((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'in_progress',
                  startedAt: new Date(),
                }
              : null
          );
          return true;
        }
        return false;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to start ride');
        setError(error);
        return false;
      }
    },
    [token]
  );

  const completeRide = useCallback(
    async (rideId: string, otp?: string, rating?: number): Promise<boolean> => {
      if (!token) return false;

      try {
        const response = await apiRequest(`/rides/${rideId}/complete`, {
          method: 'POST',
          body: { otp, rating },
        });

        if (response.success) {
          setActiveRide(null);
          setRideOffers([]);
          return true;
        }
        return false;
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to complete ride');
        setError(error);
        return false;
      }
    },
    [token]
  );

  const cancelRide = useCallback(
    async (rideId: string, reason: string): Promise<boolean> => {
      if (!token) return false;

      try {
        const response = await apiRequest(`/rides/${rideId}/cancel`, {
          method: 'POST',
          body: { reason },
        });

        if (response.success) {
          setActiveRide(null);
          return true;
        }
        return false;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to cancel ride');
        setError(error);
        return false;
      }
    },
    [token]
  );

  const getActiveRide = useCallback(async (): Promise<DriverRide | null> => {
    if (!token) return null;

    try {
      const response = await apiRequest('/drivers/active-ride', {
        method: 'GET',
      });

      if (response.ride) {
        const ride: DriverRide = {
          rideId: response.ride.rideId,
          status: response.ride.status,
          passenger: response.ride.passenger,
          pickup: {
            location: response.ride.pickup.location,
            latitude: response.ride.pickup.latitude,
            longitude: response.ride.pickup.longitude,
            arrivedAt: response.ride.pickup.arrivedAt
              ? new Date(response.ride.pickup.arrivedAt)
              : undefined,
          },
          dropoff: {
            location: response.ride.dropoff.location,
            latitude: response.ride.dropoff.latitude,
            longitude: response.ride.dropoff.longitude,
          },
          fare: {
            estimatedAmount: response.ride.fare.estimatedAmount,
            finalAmount: response.ride.fare.finalAmount,
            currency: response.ride.fare.currency,
          },
          startedAt: response.ride.startedAt
            ? new Date(response.ride.startedAt)
            : undefined,
          completedAt: response.ride.completedAt
            ? new Date(response.ride.completedAt)
            : undefined,
        };

        setActiveRide(ride);
        return ride;
      }

      return null;
    } catch (err) {
      console.error('[Dispatch] Failed to get active ride:', err);
      return null;
    }
  }, [token]);

  const getRideOfferExpiry = useCallback((offerId: string): number => {
    const offer = rideOffers.find((o) => o.offerId === offerId);
    if (!offer) return 0;

    const msUntilExpiry = offer.offerExpiresAt.getTime() - Date.now();
    return Math.max(0, Math.ceil(msUntilExpiry / 1000));
  }, [rideOffers]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    rideOffers,
    activeRide,
    isLoadingOffers,
    isAccepting,
    error,
    fetchRideOffers,
    acceptRideOffer,
    declineRideOffer,
    acceptMultipleOffers,
    markDriverArrived,
    startRide,
    completeRide,
    cancelRide,
    getActiveRide,
    getRideOfferExpiry,
    clearError,
  };
};

export default useDriverDispatch;
