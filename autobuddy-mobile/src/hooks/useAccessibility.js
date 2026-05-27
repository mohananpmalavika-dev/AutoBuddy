import React, { useContext } from 'react';
import { COLORS, TYPOGRAPHY } from '../theme';

// Create Accessibility Context
export const AccessibilityContext = React.createContext({
  settings: {
    text_size: 'normal',
    high_contrast: false,
    reduce_motion: false,
    screen_reader_enabled: false,
    haptic_feedback: true,
    voice_guidance: false,
  },
  getTextStyle: () => ({}),
  getContainerStyle: () => ({}),
  shouldReduceMotion: () => false,
});

// Hook to access accessibility settings and computed styles
export const useAccessibility = () => {
  const context = useContext(AccessibilityContext);

  if (!context) {
    // Default context if provider is not found
    return {
      settings: {
        text_size: 'normal',
        high_contrast: false,
        reduce_motion: false,
        screen_reader_enabled: false,
        haptic_feedback: true,
        voice_guidance: false,
      },
      getTextStyle: () => ({}),
      getContainerStyle: () => ({}),
      shouldReduceMotion: () => false,
      shouldUseHighContrast: () => false,
      getTextSizeMultiplier: () => 1,
    };
  }

  return context;
};

// Provider Component
export const AccessibilityProvider = ({ children, settings = {} }) => {
  const defaultSettings = {
    text_size: 'normal',
    high_contrast: false,
    reduce_motion: false,
    screen_reader_enabled: false,
    haptic_feedback: true,
    voice_guidance: false,
  };

  const mergedSettings = { ...defaultSettings, ...settings };

  // Compute text size multiplier
  const getTextSizeMultiplier = () => {
    switch (mergedSettings.text_size) {
      case 'large':
        return 1.25;
      case 'extra_large':
        return 1.5;
      default:
        return 1;
    }
  };

  // Get text style based on accessibility settings
  const getTextStyle = () => {
    const multiplier = getTextSizeMultiplier();
    return {
      fontSize: TYPOGRAPHY.body.fontSize * multiplier,
      lineHeight: TYPOGRAPHY.body.lineHeight * multiplier,
    };
  };

  // Get heading style with accessibility adjustments
  const getHeadingStyle = () => {
    const multiplier = getTextSizeMultiplier();
    return {
      fontSize: TYPOGRAPHY.heading.fontSize * multiplier,
      lineHeight: TYPOGRAPHY.heading.lineHeight * multiplier,
    };
  };

  // Get container style based on high contrast
  const getContainerStyle = () => {
    if (mergedSettings.high_contrast) {
      return {
        backgroundColor: '#FFFFFF',
        borderWidth: 2,
        borderColor: '#000000',
      };
    }
    return {};
  };

  // Get button style based on high contrast
  const getButtonStyle = (baseStyle = {}) => {
    const multiplier = getTextSizeMultiplier();
    const style = {
      ...baseStyle,
      paddingVertical: (baseStyle.paddingVertical || 12) * multiplier,
      paddingHorizontal: (baseStyle.paddingHorizontal || 12) * multiplier,
    };

    if (mergedSettings.high_contrast) {
      style.borderWidth = 2;
      style.borderColor = '#000000';
    }

    return style;
  };

  // Get color palette based on high contrast
  const getColors = () => {
    if (mergedSettings.high_contrast) {
      return {
        ...COLORS,
        primary: '#0000EE',
        textMain: '#000000',
        textMuted: '#333333',
        background: '#FFFFFF',
        border: '#000000',
      };
    }
    return COLORS;
  };

  const shouldReduceMotion = () => mergedSettings.reduce_motion === true;

  const shouldUseHighContrast = () => mergedSettings.high_contrast === true;

  const contextValue = {
    settings: mergedSettings,
    getTextStyle,
    getHeadingStyle,
    getContainerStyle,
    getButtonStyle,
    getColors,
    shouldReduceMotion,
    shouldUseHighContrast,
    getTextSizeMultiplier,
  };

  return (
    <AccessibilityContext.Provider value={contextValue}>
      {children}
    </AccessibilityContext.Provider>
  );
};

export default useAccessibility;
