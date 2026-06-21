import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type MusicPreference = 'none' | 'soft' | 'upbeat' | 'classical' | 'bollywood' | 'indie' | 'jazz';
export type TemperaturePreference = 'cold' | 'cool' | 'neutral' | 'warm' | 'hot';
export type CommunicationLevel = 'quiet' | 'minimal' | 'friendly' | 'chatty';
export type StopPreference = 'no_stops' | 'one_stop' | 'two_stops' | 'three_stops';
export type VehicleType = 'economy' | 'comfort' | 'premium';

export interface RidePreferences {
  userId: string;
  musicPreference: MusicPreference;
  temperaturePreference: TemperaturePreference;
  communicationLevel: CommunicationLevel;
  stopPreference: StopPreference;
  vehicleType: VehicleType;
  driverRatingMin: number;
  allowSharedRides: boolean;
  allowPets: boolean;
  noSmoking: boolean;
  enableAccessibility: boolean;
  preferWomenDriver: boolean;
}

const RIDE_PREFERENCES_STORAGE = 'ride_preferences';

export const useRidePreferences = (token: string | null, userId: string) => {
  const [preferences, setPreferences] = useState<RidePreferences | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initialize = async () => {
      try {
        setLoading(true);
        const saved = await AsyncStorage.getItem(RIDE_PREFERENCES_STORAGE);
        if (saved) {
          setPreferences(JSON.parse(saved));
        } else {
          const defaults: RidePreferences = {
            userId,
            musicPreference: 'soft',
            temperaturePreference: 'neutral',
            communicationLevel: 'friendly',
            stopPreference: 'one_stop',
            vehicleType: 'economy',
            driverRatingMin: 4,
            allowSharedRides: true,
            allowPets: false,
            noSmoking: true,
            enableAccessibility: false,
            preferWomenDriver: false,
          };
          setPreferences(defaults);
          await AsyncStorage.setItem(RIDE_PREFERENCES_STORAGE, JSON.stringify(defaults));
        }
      } catch (err) {
        setError(`Init failed: ${err}`);
      } finally {
        setLoading(false);
      }
    };
    if (token && userId) initialize();
  }, [token, userId]);

  const updatePreferences = useCallback(
    async (updates: Partial<RidePreferences>) => {
      try {
        if (!preferences) return;
        const updated = { ...preferences, ...updates };
        setPreferences(updated);
        await AsyncStorage.setItem(RIDE_PREFERENCES_STORAGE, JSON.stringify(updated));
      } catch (err) {
        setError(`Update failed: ${err}`);
        throw err;
      }
    },
    [preferences]
  );

  const updateSingle = useCallback(
    async (key: keyof RidePreferences, value: any) => {
      try {
        if (!preferences) return;
        const updated = { ...preferences, [key]: value };
        setPreferences(updated);
        await AsyncStorage.setItem(RIDE_PREFERENCES_STORAGE, JSON.stringify(updated));
      } catch (err) {
        setError(`Update failed: ${err}`);
        throw err;
      }
    },
    [preferences]
  );

  return {
    preferences,
    loading,
    error,
    updatePreferences,
    updateSingle,
  };
};
