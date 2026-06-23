import { useCallback, useState } from 'react';
import { apiRequest } from '../lib/api-client';

export interface DriverCandidate {
  driverId: string;
  name: string;
  location: { latitude: number; longitude: number };
  rating: number;
  acceptanceRate: number;
  distanceKm: number;
  etaSeconds: number;
  vehicleType: string;
  onlineStatus: 'online' | 'offline' | 'on_ride';
  matchScore: number; // 0-100 calculated by algorithm
}

export interface DispatchRequest {
  rideId: string;
  pickupLocation: { latitude: number; longitude: number };
  dropoffLocation: { latitude: number; longitude: number };
  rideType: 'regular' | 'scheduled' | 'goods' | 'airport';
  passengerCount: number;
  vehicleType: string;
  estimatedFare: number;
  surge: number;
  urgency: 'low' | 'medium' | 'high';
}

export interface DispatchResult {
  rideId: string;
  assignedDriverId: string;
  reason: string;
  alternatives: string[];
  assignmentConfirmedAt: Date;
}

interface UseDispatchAlgorithmReturn {
  findBestDriver: (request: DispatchRequest) => Promise<DriverCandidate | null>;
  findTopCandidates: (request: DispatchRequest, limit: number) => Promise<DriverCandidate[]>;
  autoAssignDriver: (request: DispatchRequest) => Promise<DispatchResult | null>;
  getDriverMatchScore: (
    candidate: DriverCandidate,
    request: DispatchRequest
  ) => number;
  calculateOptimalRoute: (
    driverLocation: { latitude: number; longitude: number },
    pickupLocation: { latitude: number; longitude: number },
    dropoffLocation: { latitude: number; longitude: number }
  ) => Promise<{distance: number; duration: number}>;
  setDispatchPreference: (
    preference: 'speed' | 'rating' | 'balanced'
  ) => void;
  isDispatching: boolean;
  error: Error | null;
  clearError: () => void;
}

const MATCH_WEIGHTS = {
  DISTANCE: 0.3,
  RATING: 0.2,
  ACCEPTANCE_RATE: 0.15,
  VEHICLE_MATCH: 0.2,
  ETA: 0.15,
};

const DISTANCE_THRESHOLD_KM = 10;
const MIN_RATING = 3.5;
const MIN_ACCEPTANCE_RATE = 0.7;

export const useDispatchAlgorithm = (token: string | null): UseDispatchAlgorithmReturn => {
  const [isDispatching, setIsDispatching] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [dispatchPreference, setDispatchPreference] = useState<'speed' | 'rating' | 'balanced'>(
    'balanced'
  );

  const getDriverMatchScore = useCallback(
    (candidate: DriverCandidate, request: DispatchRequest): number => {
      let score = 0;

      const maxDistance = DISTANCE_THRESHOLD_KM;
      const distanceScore = Math.max(
        0,
        (1 - candidate.distanceKm / maxDistance) * 100
      );
      score +=
        distanceScore * (dispatchPreference === 'speed' ? 0.4 : MATCH_WEIGHTS.DISTANCE);

      const ratingScore = Math.min(
        100,
        (candidate.rating / 5) * 100
      );
      score +=
        ratingScore *
        (dispatchPreference === 'rating' ? 0.4 : MATCH_WEIGHTS.RATING);

      const acceptanceScore = candidate.acceptanceRate * 100;
      score += acceptanceScore * MATCH_WEIGHTS.ACCEPTANCE_RATE;

      const vehicleMatch =
        candidate.vehicleType === request.vehicleType ? 100 : 50;
      score += vehicleMatch * MATCH_WEIGHTS.VEHICLE_MATCH;

      const maxEta = 600; // 10 minutes
      const etaScore = Math.max(
        0,
        (1 - candidate.etaSeconds / maxEta) * 100
      );
      score += etaScore * MATCH_WEIGHTS.ETA;

      if (candidate.rating < MIN_RATING || candidate.acceptanceRate < MIN_ACCEPTANCE_RATE) {
        score *= 0.5;
      }

      if (candidate.distanceKm > DISTANCE_THRESHOLD_KM) {
        score = 0;
      }

      return Math.round(score);
    },
    [dispatchPreference]
  );

  const calculateOptimalRoute = useCallback(
    async (
      driverLocation: { latitude: number; longitude: number },
      pickupLocation: { latitude: number; longitude: number },
      dropoffLocation: { latitude: number; longitude: number }
    ): Promise<{ distance: number; duration: number }> => {
      if (!token) {return { distance: 0, duration: 0 };}

      try {
        const response = await apiRequest('/routing/optimize-route', {
          method: 'POST',
          body: {
            start: driverLocation,
            pickup: pickupLocation,
            dropoff: dropoffLocation,
          },
        });

        return {
          distance: response.distance || 0,
          duration: response.duration || 0,
        };
      } catch (err) {
        console.error('[Dispatch] Route calculation failed:', err);
        return { distance: 0, duration: 0 };
      }
    },
    [token]
  );

  const findBestDriver = useCallback(
    async (request: DispatchRequest): Promise<DriverCandidate | null> => {
      if (!token) {return null;}

      setIsDispatching(true);
      setError(null);

      try {
        const response = await apiRequest('/dispatch/best-driver', {
          method: 'POST',
          body: {
            pickupLocation: request.pickupLocation,
            dropoffLocation: request.dropoffLocation,
            rideType: request.rideType,
            vehicleType: request.vehicleType,
            urgency: request.urgency,
          },
        });

        if (response.driver) {
          const candidate: DriverCandidate = {
            driverId: response.driver.driverId,
            name: response.driver.name,
            location: response.driver.location,
            rating: response.driver.rating,
            acceptanceRate: response.driver.acceptanceRate,
            distanceKm: response.driver.distanceKm,
            etaSeconds: response.driver.etaSeconds,
            vehicleType: response.driver.vehicleType,
            onlineStatus: response.driver.onlineStatus,
            matchScore: response.driver.matchScore || 0,
          };

          return candidate;
        }

        return null;
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to find best driver');
        setError(error);
        return null;
      } finally {
        setIsDispatching(false);
      }
    },
    [token]
  );

  const findTopCandidates = useCallback(
    async (
      request: DispatchRequest,
      limit: number = 5
    ): Promise<DriverCandidate[]> => {
      if (!token) {return [];}

      setIsDispatching(true);
      setError(null);

      try {
        const response = await apiRequest('/dispatch/candidates', {
          method: 'POST',
          body: {
            pickupLocation: request.pickupLocation,
            dropoffLocation: request.dropoffLocation,
            rideType: request.rideType,
            vehicleType: request.vehicleType,
            limit,
          },
        });

        return (response.candidates || []).map((d: any) => ({
          driverId: d.driverId,
          name: d.name,
          location: d.location,
          rating: d.rating,
          acceptanceRate: d.acceptanceRate,
          distanceKm: d.distanceKm,
          etaSeconds: d.etaSeconds,
          vehicleType: d.vehicleType,
          onlineStatus: d.onlineStatus,
          matchScore: getDriverMatchScore(
            {
              driverId: d.driverId,
              name: d.name,
              location: d.location,
              rating: d.rating,
              acceptanceRate: d.acceptanceRate,
              distanceKm: d.distanceKm,
              etaSeconds: d.etaSeconds,
              vehicleType: d.vehicleType,
              onlineStatus: d.onlineStatus,
              matchScore: 0,
            },
            request
          ),
        }));
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to find candidates');
        setError(error);
        return [];
      } finally {
        setIsDispatching(false);
      }
    },
    [token, getDriverMatchScore]
  );

  const autoAssignDriver = useCallback(
    async (request: DispatchRequest): Promise<DispatchResult | null> => {
      if (!token) {return null;}

      setIsDispatching(true);
      setError(null);

      try {
        const response = await apiRequest('/dispatch/auto-assign', {
          method: 'POST',
          body: {
            rideId: request.rideId,
            pickupLocation: request.pickupLocation,
            dropoffLocation: request.dropoffLocation,
            rideType: request.rideType,
            vehicleType: request.vehicleType,
            surge: request.surge,
          },
        });

        if (response.assignedDriverId) {
          return {
            rideId: request.rideId,
            assignedDriverId: response.assignedDriverId,
            reason: response.reason || 'Optimal match found',
            alternatives: response.alternatives || [],
            assignmentConfirmedAt: new Date(),
          };
        }

        throw new Error('No suitable driver found for assignment');
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Auto-assignment failed');
        setError(error);
        return null;
      } finally {
        setIsDispatching(false);
      }
    },
    [token]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    findBestDriver,
    findTopCandidates,
    autoAssignDriver,
    getDriverMatchScore,
    calculateOptimalRoute,
    setDispatchPreference,
    isDispatching,
    error,
    clearError,
  };
};

export default useDispatchAlgorithm;
