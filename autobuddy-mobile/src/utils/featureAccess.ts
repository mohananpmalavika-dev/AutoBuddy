/**
 * Feature Access Utilities - Helper functions for feature-based UI rendering
 * Location: src/utils/featureAccess.ts
 * 
 * Provides reusable utilities for conditional feature rendering
 */

import { UserMode } from '../contexts/UserModeContext';

/**
 * Feature access levels
 */
export const FEATURE_LEVELS = {
  SIMPLE: 'simple' as const,
  SMART: 'smart' as const,
  PRO: 'pro' as const,
  ALL: 'all' as const,
};

/**
 * Feature registry with access levels
 */
export const FEATURES = {
  // Simple Mode Features
  BOOK_RIDE: {
    name: 'book_ride',
    level: FEATURE_LEVELS.SIMPLE,
    title: 'Book Ride',
    description: 'Book a ride immediately',
    screen: 'BookRideScreen',
  },
  SCHEDULE_RIDE: {
    name: 'schedule_ride',
    level: FEATURE_LEVELS.SIMPLE,
    title: 'Schedule Ride',
    description: 'Schedule a ride for future',
    screen: 'ScheduleRideScreen',
  },
  TRACK_RIDE: {
    name: 'track_ride',
    level: FEATURE_LEVELS.SIMPLE,
    title: 'Track Ride',
    description: 'Track current ride in real-time',
    screen: 'TrackRideScreen',
  },

  // Smart Mode Features
  AI_SUGGESTIONS: {
    name: 'ai_suggestions',
    level: FEATURE_LEVELS.SMART,
    title: 'AI Suggestions',
    description: 'AI-powered ride suggestions and optimization',
    screen: 'AISuggestionsScreen',
  },
  FAMILY_ASSISTANT: {
    name: 'family_assistant',
    level: FEATURE_LEVELS.SMART,
    title: 'Family Assistant',
    description: 'Family and group ride management',
    screen: 'FamilyAssistantScreen',
  },
  VOICE_BOOKING: {
    name: 'voice_booking',
    level: FEATURE_LEVELS.SMART,
    title: 'Voice Booking',
    description: 'Voice-enabled ride booking',
    screen: 'VoiceBookingScreen',
  },

  // Pro Mode Features
  FLEET_MANAGEMENT: {
    name: 'fleet_management',
    level: FEATURE_LEVELS.PRO,
    title: 'Fleet Management',
    description: 'Fleet operations and management console',
    screen: 'FleetManagementScreen',
  },
  ANALYTICS_DASHBOARD: {
    name: 'analytics_dashboard',
    level: FEATURE_LEVELS.PRO,
    title: 'Analytics Dashboard',
    description: 'Advanced analytics and insights',
    screen: 'AnalyticsDashboardScreen',
  },
  CORPORATE_BILLING: {
    name: 'corporate_billing',
    level: FEATURE_LEVELS.PRO,
    title: 'Corporate Billing',
    description: 'Corporate account management and billing',
    screen: 'CorporateBillingScreen',
  },
} as const;

/**
 * Check if a feature is accessible in a given mode
 */
export const canAccessFeature = (featureLevel: string, userMode: UserMode): boolean => {
  if (featureLevel === FEATURE_LEVELS.ALL) {return true;}
  
  if (featureLevel === FEATURE_LEVELS.SIMPLE) {return true;}
  
  if (featureLevel === FEATURE_LEVELS.SMART) {
    return userMode === 'smart' || userMode === 'pro';
  }
  
  if (featureLevel === FEATURE_LEVELS.PRO) {
    return userMode === 'pro';
  }
  
  return false;
};

/**
 * Get all features accessible in a given mode
 */
export const getFeaturesForMode = (mode: UserMode) => {
  const featureEntries = Object.entries(FEATURES);
  
  return featureEntries
    .filter(([_, feature]) => canAccessFeature(feature.level, mode))
    .map(([key, feature]) => ({ key, ...feature }));
};

/**
 * Get feature upgrade path (what's needed to access feature)
 */
export const getFeatureUpgradePath = (featureLevel: string, currentMode: UserMode): string | null => {
  if (canAccessFeature(featureLevel, currentMode)) {
    return null; // Already accessible
  }
  
  if (featureLevel === FEATURE_LEVELS.SMART) {
    return 'Upgrade to Smart Mode';
  }
  
  if (featureLevel === FEATURE_LEVELS.PRO) {
    if (currentMode === 'simple') {
      return 'Upgrade to Smart or Pro Mode';
    }
    return 'Upgrade to Pro Mode';
  }
  
  return null;
};

/**
 * Get mode description
 */
export const getModeDescription = (mode: UserMode): string => {
  const descriptions = {
    simple: 'Basic ride booking and tracking',
    smart: 'AI-powered features with voice booking and family assistant',
    pro: 'Enterprise features including fleet management and analytics',
  };
  
  return descriptions[mode] || '';
};

/**
 * Get mode features summary
 */
export const getModeSummary = (mode: UserMode) => {
  const summaries = {
    simple: {
      name: 'Simple Mode',
      badge: 'BASIC',
      color: '#3B82F6', // Blue
      features: ['Book Ride', 'Schedule Ride', 'Track Ride'],
      price: 'Free',
    },
    smart: {
      name: 'Smart Mode',
      badge: 'SMART',
      color: '#8B5CF6', // Purple
      features: [
        'AI Suggestions',
        'Family Assistant',
        'Voice Booking',
        'All Simple Mode features',
      ],
      price: '₹199/month',
    },
    pro: {
      name: 'Pro Mode',
      badge: 'ENTERPRISE',
      color: '#DC2626', // Red
      features: [
        'Fleet Management',
        'Analytics Dashboard',
        'Corporate Billing',
        'All Smart Mode features',
      ],
      price: 'Custom pricing',
    },
  };
  
  return summaries[mode];
};

/**
 * Create a feature toggle component props
 */
export interface FeatureToggleProps {
  feature: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showUpgradeButton?: boolean;
  onUpgradeClick?: () => void;
}

/**
 * Render component based on feature access (used with hook)
 */
export const createFeatureGate = (
  isAccessible: boolean,
  children: React.ReactNode,
  fallback?: React.ReactNode
): React.ReactNode => {
  return isAccessible ? children : fallback;
};

/**
 * Get all mode transitions (what modes can upgrade to what)
 */
export const getModeTransitions = (currentMode: UserMode) => {
  const transitions = {
    simple: [
      { target: 'smart' as const, action: 'Upgrade to Smart' },
      { target: 'pro' as const, action: 'Upgrade to Pro' },
    ],
    smart: [{ target: 'pro' as const, action: 'Upgrade to Pro' }],
    pro: [], // Pro is the highest mode
  };
  
  return transitions[currentMode] || [];
};

/**
 * Utility to log feature access attempts (for analytics)
 */
export const logFeatureAccess = (featureName: string, allowed: boolean, userMode: UserMode) => {
  console.log(`[Feature Access] ${featureName}: ${allowed ? 'ALLOWED' : 'DENIED'} (${userMode} mode)`);
  
  // Can be extended to send analytics events
  if (!allowed) {
    console.warn(`User tried to access ${featureName} but doesn't have permission in ${userMode} mode`);
  }
};

/**
 * Get mode-specific navigation routes
 */
export const getModeNavigation = (mode: UserMode) => {
  const baseRoutes = [
    { name: 'BookRide', title: 'Book', icon: 'map-pin' },
    { name: 'Home', title: 'Home', icon: 'home' },
    { name: 'Account', title: 'Account', icon: 'user' },
  ];
  
  if (mode === 'smart' || mode === 'pro') {
    baseRoutes.push({ name: 'AISuggestions', title: 'AI', icon: 'sparkles' });
  }
  
  if (mode === 'pro') {
    baseRoutes.push({ name: 'FleetManagement', title: 'Fleet', icon: 'truck' });
  }
  
  return baseRoutes;
};
