import { useCallback, useState, useRef } from 'react';
import { apiRequest } from '../lib/api-client';

export type RideStatus =
  | 'requested'
  | 'confirmed'
  | 'accepted'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'cancelled'
  | 'no_show';

export interface RideTransition {
  from: RideStatus;
  to: RideStatus;
  action: string;
  requirements: string[];
}

export interface RideState {
  rideId: string;
  status: RideStatus;
  passengerId: string;
  driverId?: string;
  pickupTime?: Date;
  dropoffTime?: Date;
  cancellationReason?: string;
  failureReason?: string;
  retryCount: number;
  lastTransitionAt: Date;
  metadata: Record<string, any>;
}

interface UseRideLifecycleManagerReturn {
  rideState: RideState | null;
  isTransitioning: boolean;
  error: Error | null;
  getValidTransitions: (status: RideStatus) => RideTransition[];
  transitionRide: (
    rideId: string,
    toStatus: RideStatus,
    metadata?: Record<string, any>
  ) => Promise<boolean>;
  getRideState: (rideId: string) => Promise<RideState | null>;
  confirmRide: (rideId: string, driverId: string) => Promise<boolean>;
  acceptRide: (rideId: string) => Promise<boolean>;
  markArrived: (rideId: string) => Promise<boolean>;
  startRide: (rideId: string, otpCode?: string) => Promise<boolean>;
  completeRide: (rideId: string, otpCode?: string) => Promise<boolean>;
  cancelRide: (rideId: string, reason: string) => Promise<boolean>;
  markNoShow: (rideId: string) => Promise<boolean>;
  retryFailedTransition: (rideId: string, toStatus: RideStatus) => Promise<boolean>;
  getTransitionHistory: (rideId: string) => Promise<Array<{timestamp: Date; from: RideStatus; to: RideStatus}>>;
  validateTransition: (from: RideStatus, to: RideStatus) => boolean;
  clearError: () => void;
}

const VALID_TRANSITIONS: Map<RideStatus, RideStatus[]> = new Map([
  ['requested', ['confirmed', 'cancelled']],
  ['confirmed', ['accepted', 'cancelled', 'no_show']],
  ['accepted', ['arrived', 'cancelled']],
  ['arrived', ['in_progress', 'cancelled']],
  ['in_progress', ['completed', 'cancelled']],
  ['completed', []],
  ['cancelled', []],
  ['no_show', []],
]);

const TRANSITION_REQUIREMENTS: Map<string, string[]> = new Map([
  ['requested_to_confirmed', ['paymentProcessed']],
  ['confirmed_to_accepted', ['driverAssigned', 'acceptanceConfirmed']],
  ['accepted_to_arrived', ['locationValid', 'withinThreshold']],
  ['arrived_to_in_progress', ['passengerPresent', 'otpVerified']],
  ['in_progress_to_completed', ['destinationReached', 'paymentCaptured']],
]);

export const useRideLifecycleManager = (
  token: string | null,
  userId: string
): UseRideLifecycleManagerReturn => {
  const [rideState, setRideState] = useState<RideState | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const transitionQueueRef = useRef<
    Array<{
      rideId: string;
      toStatus: RideStatus;
      metadata?: Record<string, any>;
    }>
  >([]);

  const validateTransition = useCallback(
    (from: RideStatus, to: RideStatus): boolean => {
      const validTargets = VALID_TRANSITIONS.get(from);
      return validTargets ? validTargets.includes(to) : false;
    },
    []
  );

  const getValidTransitions = useCallback((status: RideStatus): RideTransition[] => {
    const validTargets = VALID_TRANSITIONS.get(status) || [];

    return validTargets.map((target) => {
      const requirementKey = `${status}_to_${target}`;
      const requirements = TRANSITION_REQUIREMENTS.get(requirementKey) || [];

      return {
        from: status,
        to: target,
        action: `${status}_to_${target}`,
        requirements,
      };
    });
  }, []);

  const getRideState = useCallback(
    async (rideId: string): Promise<RideState | null> => {
      if (!token) return null;

      try {
        const response = await apiRequest(`/rides/${rideId}/state`, {
          method: 'GET',
        });

        if (response.ride) {
          const state: RideState = {
            rideId: response.ride.rideId,
            status: response.ride.status,
            passengerId: response.ride.passengerId,
            driverId: response.ride.driverId,
            pickupTime: response.ride.pickupTime
              ? new Date(response.ride.pickupTime)
              : undefined,
            dropoffTime: response.ride.dropoffTime
              ? new Date(response.ride.dropoffTime)
              : undefined,
            cancellationReason: response.ride.cancellationReason,
            failureReason: response.ride.failureReason,
            retryCount: response.ride.retryCount || 0,
            lastTransitionAt: new Date(response.ride.lastTransitionAt),
            metadata: response.ride.metadata || {},
          };

          setRideState(state);
          return state;
        }

        return null;
      } catch (err) {
        console.error('[RideLifecycle] Failed to get ride state:', err);
        return null;
      }
    },
    [token]
  );

  const transitionRide = useCallback(
    async (
      rideId: string,
      toStatus: RideStatus,
      metadata?: Record<string, any>
    ): Promise<boolean> => {
      if (!token || !rideState) return false;

      if (!validateTransition(rideState.status, toStatus)) {
        const error = new Error(
          `Invalid transition: ${rideState.status} → ${toStatus}`
        );
        setError(error);
        return false;
      }

      setIsTransitioning(true);
      setError(null);

      try {
        const response = await apiRequest(`/rides/${rideId}/transition`, {
          method: 'POST',
          body: {
            toStatus,
            metadata,
            timestamp: new Date().toISOString(),
          },
        });

        if (response.success) {
          const newState: RideState = {
            ...rideState,
            status: toStatus,
            lastTransitionAt: new Date(),
            metadata: { ...rideState.metadata, ...metadata },
          };

          if (toStatus === 'completed') {
            newState.dropoffTime = new Date();
          } else if (toStatus === 'accepted') {
            newState.pickupTime = new Date();
          }

          setRideState(newState);
          return true;
        }

        throw new Error(response.error || 'Transition failed');
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Transition failed');
        setError(error);

        setRideState((prev) =>
          prev
            ? {
                ...prev,
                retryCount: prev.retryCount + 1,
                failureReason: error.message,
              }
            : null
        );

        return false;
      } finally {
        setIsTransitioning(false);
      }
    },
    [token, rideState, validateTransition]
  );

  const confirmRide = useCallback(
    async (rideId: string, driverId: string): Promise<boolean> => {
      if (!rideState || rideState.status !== 'requested') return false;

      return transitionRide(rideId, 'confirmed', { driverId });
    },
    [rideState, transitionRide]
  );

  const acceptRide = useCallback(
    async (rideId: string): Promise<boolean> => {
      if (!rideState || rideState.status !== 'confirmed') return false;

      return transitionRide(rideId, 'accepted', {
        acceptedAt: new Date().toISOString(),
      });
    },
    [rideState, transitionRide]
  );

  const markArrived = useCallback(
    async (rideId: string): Promise<boolean> => {
      if (!rideState || rideState.status !== 'accepted') return false;

      return transitionRide(rideId, 'arrived', {
        arrivedAt: new Date().toISOString(),
      });
    },
    [rideState, transitionRide]
  );

  const startRide = useCallback(
    async (rideId: string, otpCode?: string): Promise<boolean> => {
      if (!rideState || rideState.status !== 'arrived') return false;

      return transitionRide(rideId, 'in_progress', {
        otpVerified: !!otpCode,
        startedAt: new Date().toISOString(),
      });
    },
    [rideState, transitionRide]
  );

  const completeRide = useCallback(
    async (rideId: string, otpCode?: string): Promise<boolean> => {
      if (!rideState || rideState.status !== 'in_progress') return false;

      return transitionRide(rideId, 'completed', {
        otpVerified: !!otpCode,
        completedAt: new Date().toISOString(),
      });
    },
    [rideState, transitionRide]
  );

  const cancelRide = useCallback(
    async (rideId: string, reason: string): Promise<boolean> => {
      if (!rideState) return false;

      const validForCancellation: RideStatus[] = [
        'requested',
        'confirmed',
        'accepted',
        'arrived',
      ];
      if (!validForCancellation.includes(rideState.status)) {
        setError(
          new Error(
            `Cannot cancel ride in ${rideState.status} status`
          )
        );
        return false;
      }

      return transitionRide(rideId, 'cancelled', {
        cancellationReason: reason,
        cancelledAt: new Date().toISOString(),
      });
    },
    [rideState, transitionRide]
  );

  const markNoShow = useCallback(
    async (rideId: string): Promise<boolean> => {
      if (!rideState || rideState.status !== 'confirmed') return false;

      return transitionRide(rideId, 'no_show', {
        noShowAt: new Date().toISOString(),
      });
    },
    [rideState, transitionRide]
  );

  const retryFailedTransition = useCallback(
    async (rideId: string, toStatus: RideStatus): Promise<boolean> => {
      if (!rideState) return false;

      const maxRetries = 3;
      if (rideState.retryCount >= maxRetries) {
        setError(
          new Error(`Max retries (${maxRetries}) exceeded for ride transition`)
        );
        return false;
      }

      return transitionRide(rideId, toStatus);
    },
    [rideState, transitionRide]
  );

  const getTransitionHistory = useCallback(
    async (
      rideId: string
    ): Promise<Array<{ timestamp: Date; from: RideStatus; to: RideStatus }>> => {
      if (!token) return [];

      try {
        const response = await apiRequest(
          `/rides/${rideId}/transition-history`,
          { method: 'GET' }
        );

        return (response.transitions || []).map((t: any) => ({
          timestamp: new Date(t.timestamp),
          from: t.from as RideStatus,
          to: t.to as RideStatus,
        }));
      } catch (err) {
        console.error('[RideLifecycle] Failed to get transition history:', err);
        return [];
      }
    },
    [token]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {
    rideState,
    isTransitioning,
    error,
    getValidTransitions,
    transitionRide,
    getRideState,
    confirmRide,
    acceptRide,
    markArrived,
    startRide,
    completeRide,
    cancelRide,
    markNoShow,
    retryFailedTransition,
    getTransitionHistory,
    validateTransition,
    clearError,
  };
};

export default useRideLifecycleManager;
