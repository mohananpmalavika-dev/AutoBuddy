import { useState, useCallback } from 'react';
import axios from 'axios';

export interface AccessibilitySettings {
  userId: string;
  visualSettings: {
    fontSize: 'small' | 'normal' | 'large' | 'xlarge';
    highContrast: boolean;
    colorBlindMode: 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia';
    reduceAnimations: boolean;
    darkMode: boolean;
  };
  audioSettings: {
    audioDescription: boolean;
    captionPreference: 'always' | 'auto' | 'never';
    soundIndicators: boolean;
  };
  motorSettings: {
    largerTouchTargets: boolean;
    simplifiedGestures: boolean;
    voiceControl: boolean;
  };
  cognitiveSettings: {
    simplifiedUI: boolean;
    readingGuide: boolean;
    focusMode: boolean;
  };
  updatedAt: Date;
}

interface UseAccessibilityFeaturesReturn {
  settings: AccessibilitySettings | null;
  loading: boolean;
  error: Error | null;
  fetchSettings: () => Promise<void>;
  updateVisualSettings: (visual: Partial<AccessibilitySettings['visualSettings']>) => Promise<boolean>;
  updateAudioSettings: (audio: Partial<AccessibilitySettings['audioSettings']>) => Promise<boolean>;
  updateMotorSettings: (motor: Partial<AccessibilitySettings['motorSettings']>) => Promise<boolean>;
  updateCognitiveSettings: (cognitive: Partial<AccessibilitySettings['cognitiveSettings']>) => Promise<boolean>;
  resetToDefaults: () => Promise<boolean>;
  getAccessibilityPreset: (preset: string) => AccessibilitySettings | null;
}

export const useAccessibilityFeatures = (token: string | null, userId: string): UseAccessibilityFeaturesReturn => {
  const [settings, setSettings] = useState<AccessibilitySettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

  const fetchSettings = useCallback(async () => {
    if (!token) {return;}
    setLoading(true);
    try {
      const response = await axios.get(
        `${API_BASE_URL}/accessibility/${userId}/settings`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSettings(response.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch accessibility settings'));
    } finally {
      setLoading(false);
    }
  }, [token, userId, API_BASE_URL]);

  const updateVisualSettings = useCallback(
    async (visual: Partial<AccessibilitySettings['visualSettings']>): Promise<boolean> => {
      if (!token || !settings) {return false;}
      try {
        const response = await axios.patch(
          `${API_BASE_URL}/accessibility/${userId}/visual`,
          visual,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setSettings(response.data);
        setError(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update visual settings'));
        return false;
      }
    },
    [token, userId, API_BASE_URL, settings]
  );

  const updateAudioSettings = useCallback(
    async (audio: Partial<AccessibilitySettings['audioSettings']>): Promise<boolean> => {
      if (!token || !settings) {return false;}
      try {
        const response = await axios.patch(
          `${API_BASE_URL}/accessibility/${userId}/audio`,
          audio,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setSettings(response.data);
        setError(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update audio settings'));
        return false;
      }
    },
    [token, userId, API_BASE_URL, settings]
  );

  const updateMotorSettings = useCallback(
    async (motor: Partial<AccessibilitySettings['motorSettings']>): Promise<boolean> => {
      if (!token || !settings) {return false;}
      try {
        const response = await axios.patch(
          `${API_BASE_URL}/accessibility/${userId}/motor`,
          motor,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setSettings(response.data);
        setError(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update motor settings'));
        return false;
      }
    },
    [token, userId, API_BASE_URL, settings]
  );

  const updateCognitiveSettings = useCallback(
    async (cognitive: Partial<AccessibilitySettings['cognitiveSettings']>): Promise<boolean> => {
      if (!token || !settings) {return false;}
      try {
        const response = await axios.patch(
          `${API_BASE_URL}/accessibility/${userId}/cognitive`,
          cognitive,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setSettings(response.data);
        setError(null);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update cognitive settings'));
        return false;
      }
    },
    [token, userId, API_BASE_URL, settings]
  );

  const resetToDefaults = useCallback(async (): Promise<boolean> => {
    if (!token) {return false;}
    try {
      const response = await axios.post(
        `${API_BASE_URL}/accessibility/${userId}/reset`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSettings(response.data);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to reset accessibility settings'));
      return false;
    }
  }, [token, userId, API_BASE_URL]);

  const getAccessibilityPreset = useCallback(
    (preset: string): AccessibilitySettings | null => {
      if (!settings) {return null;}

      const presets: { [key: string]: Partial<AccessibilitySettings> } = {
        blind: {
          audioSettings: {
            audioDescription: true,
            captionPreference: 'always',
            soundIndicators: true,
          },
          motorSettings: {
            voiceControl: true,
            simplifiedGestures: true,
          },
        },
        lowVision: {
          visualSettings: {
            fontSize: 'xlarge',
            highContrast: true,
            darkMode: true,
          },
        },
        deaf: {
          audioSettings: {
            captionPreference: 'always',
          },
        },
        motorImpaired: {
          motorSettings: {
            largerTouchTargets: true,
            simplifiedGestures: true,
            voiceControl: true,
          },
        },
        dyslexia: {
          visualSettings: {
            fontSize: 'large',
            reduceAnimations: true,
          },
          cognitiveSettings: {
            simplifiedUI: true,
            readingGuide: true,
          },
        },
      };

      if (presets[preset]) {
        return { ...settings, ...presets[preset] } as AccessibilitySettings;
      }
      return null;
    },
    [settings]
  );

  return {
    settings,
    loading,
    error,
    fetchSettings,
    updateVisualSettings,
    updateAudioSettings,
    updateMotorSettings,
    updateCognitiveSettings,
    resetToDefaults,
    getAccessibilityPreset,
  };
};
