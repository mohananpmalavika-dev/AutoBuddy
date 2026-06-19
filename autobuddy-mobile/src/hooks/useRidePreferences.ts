import { useState, useCallback } from 'react';
import axios from 'axios';

export interface RidePreferences {
  id: string;
  driverId: string;
  rideTypes: {
    rides: boolean;
    pools: boolean;
    longRides: boolean;
    scheduledRides: boolean;
  };
  passengerFilters: {
    minRating: number;
    maxRidesCancelled: number;
    acceptNewPassengers: boolean;
    acceptFemalePassengersOnly: boolean;
  };
  stopPreferences: {
    allowStops: boolean;
    maxStops: number;
    stopPenaltyPreference: 'none' | 'low' | 'medium' | 'high';
  };
  rideLength: {
    minDistance: number;
    maxDistance: number;
    minDuration: number;
    maxDuration: number;
  };
  musicAndEnvironment: {
    musicPreference: 'no_music' | 'passenger_choice' | 'driver_choice';
    acTemperature: number;
    allowSmokingBreaks: boolean;
    allowPets: boolean;
  };
  communicationLevel: 'quiet' | 'normal' | 'chatty';
  acceptanceTimeout: number;
  autoAcceptRides: boolean;
  preferredAreas: string[];
  avoidAreas: string[];
  updatedAt: Date;
}

interface UseRidePreferencesReturn {
  preferences: RidePreferences | null;
  loading: boolean;
  error: Error | null;
  fetchPreferences: () => Promise<void>;
  updatePreferences: (updates: Partial<RidePreferences>) => Promise<boolean>;
  updateRideTypes: (rideTypes: RidePreferences['rideTypes']) => Promise<boolean>;
  updatePassengerFilters: (filters: RidePreferences['passengerFilters']) => Promise<boolean>;
  updateStopPreferences: (stops: RidePreferences['stopPreferences']) => Promise<boolean>;
  updateRideLength: (rideLength: RidePreferences['rideLength']) => Promise<boolean>;
  updateMusicAndEnvironment: (settings: RidePreferences['musicAndEnvironment']) => Promise<boolean>;
  updateCommunicationLevel: (level: RidePreferences['communicationLevel']) => Promise<boolean>;
  toggleAutoAccept: (enabled: boolean) => Promise<boolean>;
  addPreferredArea: (area: string) => Promise<boolean>;
  removePreferredArea: (area: string) => Promise<boolean>;
  addAvoidArea: (area: string) => Promise<boolean>;
  removeAvoidArea: (area: string) => Promise<boolean>;
  resetToDefaults: () => Promise<boolean>;
  validateRide: (rideDetails: any) => boolean;
}

const DEFAULT_PREFERENCES: Omit<RidePreferences, 'id' | 'driverId' | 'updatedAt'> = {
  rideTypes: {
    rides: true,
    pools: false,
    longRides: true,
    scheduledRides: true,
  },
  passengerFilters: {
    minRating: 4.0,
    maxRidesCancelled: 5,
    acceptNewPassengers: true,
    acceptFemalePassengersOnly: false,
  },
  stopPreferences: {
    allowStops: true,
    maxStops: 3,
    stopPenaltyPreference: 'medium',
  },
  rideLength: {
    minDistance: 0,
    maxDistance: 500,
    minDuration: 5,
    maxDuration: 480,
  },
  musicAndEnvironment: {
    musicPreference: 'passenger_choice',
    acTemperature: 22,
    allowSmokingBreaks: false,
    allowPets: false,
  },
  communicationLevel: 'normal',
  acceptanceTimeout: 30,
  autoAcceptRides: false,
  preferredAreas: [],
  avoidAreas: [],
};

export const useRidePreferences = (token: string | null, driverId: string): UseRidePreferencesReturn => {
  const [preferences, setPreferences] = useState<RidePreferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

  const fetchPreferences = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}/drivers/${driverId}/preferences`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPreferences(response.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch preferences'));
      setPreferences(null);
    } finally {
      setLoading(false);
    }
  }, [token, driverId, API_BASE_URL]);

  const updatePreferences = useCallback(
    async (updates: Partial<RidePreferences>): Promise<boolean> => {
      if (!token || !preferences) return false;
      try {
        const response = await axios.put(
          `${API_BASE_URL}/drivers/${driverId}/preferences`,
          updates,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setPreferences(response.data);
        setError(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update preferences'));
        return false;
      }
    },
    [token, driverId, API_BASE_URL, preferences]
  );

  const updateRideTypes = useCallback(
    async (rideTypes: RidePreferences['rideTypes']): Promise<boolean> => {
      return updatePreferences({ rideTypes });
    },
    [updatePreferences]
  );

  const updatePassengerFilters = useCallback(
    async (passengerFilters: RidePreferences['passengerFilters']): Promise<boolean> => {
      return updatePreferences({ passengerFilters });
    },
    [updatePreferences]
  );

  const updateStopPreferences = useCallback(
    async (stopPreferences: RidePreferences['stopPreferences']): Promise<boolean> => {
      return updatePreferences({ stopPreferences });
    },
    [updatePreferences]
  );

  const updateRideLength = useCallback(
    async (rideLength: RidePreferences['rideLength']): Promise<boolean> => {
      return updatePreferences({ rideLength });
    },
    [updatePreferences]
  );

  const updateMusicAndEnvironment = useCallback(
    async (musicAndEnvironment: RidePreferences['musicAndEnvironment']): Promise<boolean> => {
      return updatePreferences({ musicAndEnvironment });
    },
    [updatePreferences]
  );

  const updateCommunicationLevel = useCallback(
    async (communicationLevel: RidePreferences['communicationLevel']): Promise<boolean> => {
      return updatePreferences({ communicationLevel });
    },
    [updatePreferences]
  );

  const toggleAutoAccept = useCallback(
    async (enabled: boolean): Promise<boolean> => {
      return updatePreferences({ autoAcceptRides: enabled });
    },
    [updatePreferences]
  );

  const addPreferredArea = useCallback(
    async (area: string): Promise<boolean> => {
      if (!preferences) return false;
      const updatedAreas = [...new Set([...preferences.preferredAreas, area])];
      return updatePreferences({ preferredAreas: updatedAreas });
    },
    [preferences, updatePreferences]
  );

  const removePreferredArea = useCallback(
    async (area: string): Promise<boolean> => {
      if (!preferences) return false;
      const updatedAreas = preferences.preferredAreas.filter((a) => a !== area);
      return updatePreferences({ preferredAreas: updatedAreas });
    },
    [preferences, updatePreferences]
  );

  const addAvoidArea = useCallback(
    async (area: string): Promise<boolean> => {
      if (!preferences) return false;
      const updatedAreas = [...new Set([...preferences.avoidAreas, area])];
      return updatePreferences({ avoidAreas: updatedAreas });
    },
    [preferences, updatePreferences]
  );

  const removeAvoidArea = useCallback(
    async (area: string): Promise<boolean> => {
      if (!preferences) return false;
      const updatedAreas = preferences.avoidAreas.filter((a) => a !== area);
      return updatePreferences({ avoidAreas: updatedAreas });
    },
    [preferences, updatePreferences]
  );

  const resetToDefaults = useCallback(async (): Promise<boolean> => {
    if (!token) return false;
    try {
      const defaultPrefs = {
        ...DEFAULT_PREFERENCES,
        id: preferences?.id || '',
        driverId,
        updatedAt: new Date(),
      };
      const response = await axios.post(
        `${API_BASE_URL}/drivers/${driverId}/preferences/reset`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setPreferences(response.data);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to reset preferences'));
      return false;
    }
  }, [token, driverId, API_BASE_URL, preferences]);

  const validateRide = useCallback(
    (rideDetails: any): boolean => {
      if (!preferences) return true;

      // Check ride type
      if (rideDetails.isPool && !preferences.rideTypes.pools) return false;
      if (rideDetails.isLongRide && !preferences.rideTypes.longRides) return false;
      if (rideDetails.isScheduled && !preferences.rideTypes.scheduledRides) return false;

      // Check passenger rating
      if (rideDetails.passengerRating < preferences.passengerFilters.minRating) return false;

      // Check stops
      if (
        rideDetails.stops &&
        rideDetails.stops.length > preferences.stopPreferences.maxStops
      ) {
        return false;
      }

      // Check ride length
      if (rideDetails.distance < preferences.rideLength.minDistance) return false;
      if (rideDetails.distance > preferences.rideLength.maxDistance) return false;
      if (rideDetails.duration < preferences.rideLength.minDuration) return false;
      if (rideDetails.duration > preferences.rideLength.maxDuration) return false;

      // Check avoid areas
      if (preferences.avoidAreas.includes(rideDetails.pickupArea)) return false;

      return true;
    },
    [preferences]
  );

  return {
    preferences,
    loading,
    error,
    fetchPreferences,
    updatePreferences,
    updateRideTypes,
    updatePassengerFilters,
    updateStopPreferences,
    updateRideLength,
    updateMusicAndEnvironment,
    updateCommunicationLevel,
    toggleAutoAccept,
    addPreferredArea,
    removePreferredArea,
    addAvoidArea,
    removeAvoidArea,
    resetToDefaults,
    validateRide,
  };
};
