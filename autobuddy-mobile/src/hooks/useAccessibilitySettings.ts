import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AccessibilitySettings {
  audioAnnouncements: boolean;
  highContrastMode: boolean;
  voiceCommands: boolean;
  textToSpeech: boolean;
  hapticFeedback: boolean;
  screenReaderEnabled: boolean;
  fontSize: 'small' | 'normal' | 'large' | 'xlarge';
  enableCaptions: boolean;
  enableSubtitles: boolean;
  colorBlindMode: 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia';
  reduceMotion: boolean;
  pauseAnimations: boolean;
  speakingRate: number; // 0.5 to 2.0
}

const ACCESSIBILITY_STORAGE = 'accessibility_settings';

export const useAccessibilitySettings = (token: string | null, userId: string) => {
  const [settings, setSettings] = useState<AccessibilitySettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initialize = async () => {
      try {
        setLoading(true);
        const saved = await AsyncStorage.getItem(ACCESSIBILITY_STORAGE);
        if (saved) {
          setSettings(JSON.parse(saved));
        } else {
          const defaults: AccessibilitySettings = {
            audioAnnouncements: false,
            highContrastMode: false,
            voiceCommands: false,
            textToSpeech: false,
            hapticFeedback: true,
            screenReaderEnabled: false,
            fontSize: 'normal',
            enableCaptions: true,
            enableSubtitles: false,
            colorBlindMode: 'none',
            reduceMotion: false,
            pauseAnimations: false,
            speakingRate: 1.0,
          };
          setSettings(defaults);
          await AsyncStorage.setItem(ACCESSIBILITY_STORAGE, JSON.stringify(defaults));
        }
      } catch (err) {
        setError(`Init failed: ${err}`);
      } finally {
        setLoading(false);
      }
    };
    if (token && userId) {initialize();}
  }, [token, userId]);

  const updateSetting = useCallback(
    async (key: keyof AccessibilitySettings, value: any) => {
      try {
        if (!settings) {return;}
        const updated = { ...settings, [key]: value };
        setSettings(updated);
        await AsyncStorage.setItem(ACCESSIBILITY_STORAGE, JSON.stringify(updated));
      } catch (err) {
        setError(`Update failed: ${err}`);
        throw err;
      }
    },
    [settings]
  );

  const enableAudioAnnouncements = useCallback(async () => {
    await updateSetting('audioAnnouncements', true);
  }, [updateSetting]);

  const disableAudioAnnouncements = useCallback(async () => {
    await updateSetting('audioAnnouncements', false);
  }, [updateSetting]);

  const toggleHighContrast = useCallback(async (enabled: boolean) => {
    await updateSetting('highContrastMode', enabled);
  }, [updateSetting]);

  const enableVoiceCommands = useCallback(async () => {
    await updateSetting('voiceCommands', true);
  }, [updateSetting]);

  const toggleTextToSpeech = useCallback(async (enabled: boolean) => {
    await updateSetting('textToSpeech', enabled);
  }, [updateSetting]);

  const setFontSize = useCallback(
    async (size: 'small' | 'normal' | 'large' | 'xlarge') => {
      await updateSetting('fontSize', size);
    },
    [updateSetting]
  );

  const setSpeakingRate = useCallback(
    async (rate: number) => {
      await updateSetting('speakingRate', Math.max(0.5, Math.min(2.0, rate)));
    },
    [updateSetting]
  );

  const setColorBlindMode = useCallback(
    async (mode: 'none' | 'deuteranopia' | 'protanopia' | 'tritanopia') => {
      await updateSetting('colorBlindMode', mode);
    },
    [updateSetting]
  );

  const resetToDefaults = useCallback(async () => {
    const defaults: AccessibilitySettings = {
      audioAnnouncements: false,
      highContrastMode: false,
      voiceCommands: false,
      textToSpeech: false,
      hapticFeedback: true,
      screenReaderEnabled: false,
      fontSize: 'normal',
      enableCaptions: true,
      enableSubtitles: false,
      colorBlindMode: 'none',
      reduceMotion: false,
      pauseAnimations: false,
      speakingRate: 1.0,
    };
    setSettings(defaults);
    await AsyncStorage.setItem(ACCESSIBILITY_STORAGE, JSON.stringify(defaults));
  }, []);

  return {
    settings,
    loading,
    error,
    updateSetting,
    enableAudioAnnouncements,
    disableAudioAnnouncements,
    toggleHighContrast,
    enableVoiceCommands,
    toggleTextToSpeech,
    setFontSize,
    setSpeakingRate,
    setColorBlindMode,
    resetToDefaults,
  };
};
