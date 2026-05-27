import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * AccessibilityContext - Manage accessibility settings
 */

const AccessibilityContext = createContext(null);

export function AccessibilityProvider({ children }) {
  const [accessibility, setAccessibility] = useState({
    textSize: 'normal', // 'small', 'normal', 'large'
    highContrast: false,
    screenReaderEnabled: false,
    hapticFeedback: true,
    reduceMotion: false,
    voiceGuidance: false,
  });

  const updateAccessibilitySettings = useCallback((key, value) => {
    setAccessibility((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  const resetAccessibilitySettings = useCallback(() => {
    setAccessibility({
      textSize: 'normal',
      highContrast: false,
      screenReaderEnabled: false,
      hapticFeedback: true,
      reduceMotion: false,
      voiceGuidance: false,
    });
  }, []);

  const value = {
    accessibility,
    updateAccessibilitySettings,
    resetAccessibilitySettings,
    setAccessibility,
  };

  return (
    <AccessibilityContext.Provider value={value}>
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used within AccessibilityProvider');
  }
  return context;
}
