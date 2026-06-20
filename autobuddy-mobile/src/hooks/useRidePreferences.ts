import { useState, useCallback, useEffect } from 'react';

export interface RidePreferences {
  passenger_id: string;
  music_preference: 'no_preference' | 'neutral' | 'preferred';
  ac_preference: 'cold' | 'cool' | 'warm' | 'hot';
  communication_level: 'quiet' | 'normal' | 'chatty';
  vehicle_type_preference: string[] | null;
}

interface UseRidePreferencesReturn {
  preferences: RidePreferences | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  updatePreferences: (updates: Partial<RidePreferences>) => Promise<void>;
  resetToDefaults: () => Promise<void>;
  getPreferenceSummary: () => string[];
}

const API_BASE = 'http://localhost:8000/api/v3/preferences';

export function useRidePreferences(passengerId: string | undefined, authToken: string): UseRidePreferencesReturn {
  const [preferences, setPreferences] = useState<RidePreferences | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (passengerId && authToken) {
      fetchPreferences();
    }
  }, [passengerId, authToken]);

  const fetchPreferences = useCallback(async () => {
    if (!passengerId || !authToken) return;

    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/ride/${passengerId}`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (!response.ok) {
        if (response.status === 404) {
          setPreferences({
            passenger_id: passengerId,
            music_preference: 'neutral',
            ac_preference: 'cool',
            communication_level: 'normal',
            vehicle_type_preference: null,
          });
        } else {
          throw new Error('Failed to fetch preferences');
        }
        return;
      }

      const data = await response.json();
      setPreferences(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [passengerId, authToken]);

  const updatePreferences = useCallback(
    async (updates: Partial<RidePreferences>) => {
      if (!passengerId || !authToken || !preferences) return;

      setIsSaving(true);
      setError(null);

      try {
        const updatedPrefs = { ...preferences, ...updates };

        const response = await fetch(`${API_BASE}/ride/${passengerId}`, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${authToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            music_preference: updatedPrefs.music_preference,
            ac_preference: updatedPrefs.ac_preference,
            communication_level: updatedPrefs.communication_level,
            vehicle_type_preference: updatedPrefs.vehicle_type_preference,
          }),
        });

        if (!response.ok) {
          throw new Error('Failed to update preferences');
        }

        const data = await response.json();
        setPreferences(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update preferences');
        throw err;
      } finally {
        setIsSaving(false);
      }
    },
    [passengerId, authToken, preferences]
  );

  const resetToDefaults = useCallback(async () => {
    if (!passengerId || !authToken) return;

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/ride/${passengerId}/reset`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });

      if (!response.ok) {
        throw new Error('Failed to reset preferences');
      }

      const data = await response.json();
      setPreferences(data.preferences);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset preferences');
      throw err;
    } finally {
      setIsSaving(false);
    }
  }, [passengerId, authToken]);

  const getPreferenceSummary = useCallback((): string[] => {
    if (!preferences) return [];

    const summary: string[] = [];

    if (preferences.music_preference !== 'neutral') {
      summary.push(`🎵 ${preferences.music_preference === 'preferred' ? 'Music preferred' : 'No music'}`);
    }

    const tempEmoji = { cold: '❄️', cool: '🌡️', warm: '☀️', hot: '🔥' };
    summary.push(`${tempEmoji[preferences.ac_preference]} ${preferences.ac_preference.charAt(0).toUpperCase() + preferences.ac_preference.slice(1)}`);

    if (preferences.communication_level !== 'normal') {
      const commEmoji = preferences.communication_level === 'quiet' ? '🤐' : '💬';
      summary.push(`${commEmoji} ${preferences.communication_level.charAt(0).toUpperCase() + preferences.communication_level.slice(1)}`);
    }

    if (preferences.vehicle_type_preference && preferences.vehicle_type_preference.length > 0) {
      summary.push(`🚖 ${preferences.vehicle_type_preference.join(', ')}`);
    }

    return summary;
  }, [preferences]);

  return {
    preferences,
    isLoading,
    isSaving,
    error,
    updatePreferences,
    resetToDefaults,
    getPreferenceSummary,
  };
}
