import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * PreferencesContext - User preferences (language, notifications, etc.)
 */

const PreferencesContext = createContext(null);

export function PreferencesProvider({ children }) {
  const [preferences, setPreferences] = useState({
    language: 'en',
    notifications: {
      bookingUpdates: true,
      promotions: true,
      safety: true,
      sound: true,
      vibration: true,
    },
    payment: {
      defaultMethod: 'wallet',
      autoReload: false,
    },
    privacy: {
      shareLocation: true,
      rideSharing: true,
    },
    accessibility: {
      largeText: false,
      highContrast: false,
      voiceGuidance: false,
    },
  });

  const updatePreference = useCallback((path, value) => {
    setPreferences((prev) => {
      const keys = path.split('.');
      let current = { ...prev };
      let obj = current;
      
      for (let i = 0; i < keys.length - 1; i++) {
        obj[keys[i]] = { ...obj[keys[i]] };
        obj = obj[keys[i]];
      }
      
      obj[keys[keys.length - 1]] = value;
      return current;
    });
  }, []);

  const resetPreferences = useCallback(() => {
    setPreferences({
      language: 'en',
      notifications: {
        bookingUpdates: true,
        promotions: true,
        safety: true,
        sound: true,
        vibration: true,
      },
      payment: { defaultMethod: 'wallet', autoReload: false },
      privacy: { shareLocation: true, rideSharing: true },
      accessibility: { largeText: false, highContrast: false, voiceGuidance: false },
    });
  }, []);

  const value = {
    preferences,
    updatePreference,
    resetPreferences,
    setPreferences,
  };

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used within PreferencesProvider');
  }
  return context;
}
