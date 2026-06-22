/**
 * useFeatureAccess - Custom hook for conditional feature rendering
 * Location: src/hooks/useFeatureAccess.ts
 * 
 * Simplifies feature-gated component rendering
 */

import { useUserMode } from '../contexts/UserModeContext';
import { canAccessFeature, logFeatureAccess } from '../utils/featureAccess';

interface UseFeatureAccessOptions {
  onAccessDenied?: () => void;
  logAccess?: boolean;
}

/**
 * Hook to check if a feature is accessible
 */
export const useFeatureAccess = (featureName: string, options: UseFeatureAccessOptions = {}) => {
  const { currentMode, isFeatureAccessible, modeProfile } = useUserMode();
  const { onAccessDenied, logAccess = true } = options;

  const hasAccess = isFeatureAccessible(featureName);

  if (logAccess) {
    logFeatureAccess(featureName, hasAccess, currentMode);
  }

  if (!hasAccess && onAccessDenied) {
    onAccessDenied();
  }

  return {
    hasAccess,
    currentMode,
    featureName,
    canUpgrade: modeProfile?.current_mode === 'simple',
    isPro: currentMode === 'pro',
    isSmart: currentMode === 'smart',
  };
};

/**
 * Hook to get all accessible features for current mode
 */
export const useAccessibleFeatures = () => {
  const { getAccessibleFeatures, currentMode } = useUserMode();
  const features = getAccessibleFeatures();

  return {
    features,
    count: features.length,
    currentMode,
    hasProFeatures: currentMode === 'pro',
    hasSmartFeatures: currentMode === 'smart' || currentMode === 'pro',
  };
};

/**
 * Hook to manage mode upgrades
 */
export const useModeUpgrade = () => {
  const { setUserMode, startProTrial, upgradeToProSubscription, loading } = useUserMode();

  const upgradeToSmart = async () => {
    try {
      await setUserMode('smart');
      return { success: true, mode: 'smart' };
    } catch (error) {
      return { success: false, error };
    }
  };

  const upgradeToProWithTrial = async (trialDays = 7) => {
    try {
      await startProTrial(trialDays);
      return { success: true, mode: 'pro', type: 'trial', trialDays };
    } catch (error) {
      return { success: false, error };
    }
  };

  const upgradeToProPaid = async (subscriptionDays = 30) => {
    try {
      await upgradeToProSubscription(subscriptionDays);
      return { success: true, mode: 'pro', type: 'subscription', subscriptionDays };
    } catch (error) {
      return { success: false, error };
    }
  };

  return {
    upgradeToSmart,
    upgradeToProWithTrial,
    upgradeToProPaid,
    loading,
  };
};

/**
 * Hook to get mode-specific metadata
 */
export const useModeMetadata = () => {
  const { currentMode, modeProfile } = useUserMode();

  const metadata = {
    mode: currentMode,
    isProTrial: modeProfile?.is_pro_trial || false,
    isProSubscriber: modeProfile?.is_pro_subscriber || false,
    proTrialExpiresAt: modeProfile?.pro_trial_expires_at,
    proSubscriptionExpiresAt: modeProfile?.pro_subscription_expires_at,
    modeUpgradedAt: modeProfile?.mode_upgraded_at,
    previousMode: modeProfile?.previous_mode,
  };

  // Calculate remaining trial days
  let trialRemainingDays = 0;
  if (metadata.isProTrial && metadata.proTrialExpiresAt) {
    const expiresDate = new Date(metadata.proTrialExpiresAt);
    const today = new Date();
    const diffTime = expiresDate.getTime() - today.getTime();
    trialRemainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  return {
    ...metadata,
    trialRemainingDays: Math.max(0, trialRemainingDays),
    isProActive: metadata.isProTrial || metadata.isProSubscriber,
  };
};

/**
 * Hook for feature-gated components
 */
export interface FeatureGateProps {
  feature: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showUpgradePrompt?: boolean;
}

/**
 * Hook to create a feature gate component
 */
export const useFeatureGate = (feature: string) => {
  const { hasAccess } = useFeatureAccess(feature);
  const { upgradeToSmart, upgradeToProWithTrial } = useModeUpgrade();
  const { currentMode } = useUserMode();

  return {
    hasAccess,
    currentMode,
    handleUpgrade: async () => {
      if (currentMode === 'simple') {
        return upgradeToSmart();
      } else if (currentMode === 'smart') {
        return upgradeToProWithTrial();
      }
    },
  };
};

/**
 * Hook to check feature compatibility
 */
export const useFeatureCompatibility = (requiredMode: 'simple' | 'smart' | 'pro') => {
  const { currentMode } = useUserMode();

  const modeHierarchy = {
    simple: 0,
    smart: 1,
    pro: 2,
  };

  const isCompatible = modeHierarchy[currentMode] >= modeHierarchy[requiredMode];

  return {
    isCompatible,
    requiredMode,
    currentMode,
    needsUpgrade: !isCompatible,
    upgradeToMode: requiredMode,
  };
};
