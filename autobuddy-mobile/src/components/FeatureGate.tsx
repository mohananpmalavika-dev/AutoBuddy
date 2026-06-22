/**
 * FeatureGate Component - Reusable feature-gated component wrapper
 * Location: src/components/FeatureGate.tsx
 * 
 * Wraps components to show/hide based on user's current mode
 */

import React, { ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFeatureAccess, useModeUpgrade } from '../hooks/useFeatureAccess';
import { getFeatureUpgradePath } from '../utils/featureAccess';

interface FeatureGateProps {
  /**
   * Feature name to check access for
   */
  feature: string;
  
  /**
   * Content to show when feature is accessible
   */
  children: ReactNode;
  
  /**
   * Optional fallback content when feature is not accessible
   */
  fallback?: ReactNode;
  
  /**
   * Show upgrade button when feature not accessible
   */
  showUpgradeButton?: boolean;
  
  /**
   * Custom upgrade button text
   */
  upgradeButtonText?: string;
  
  /**
   * Callback when upgrade is attempted
   */
  onUpgradeClick?: () => void;
  
  /**
   * Show feature name in upgrade prompt
   */
  showFeatureName?: boolean;
}

export const FeatureGate: React.FC<FeatureGateProps> = ({
  feature,
  children,
  fallback,
  showUpgradeButton = true,
  upgradeButtonText,
  onUpgradeClick,
  showFeatureName = true,
}) => {
  const { hasAccess, currentMode, canUpgrade } = useFeatureAccess(feature);
  const { upgradeToSmart, upgradeToProWithTrial, loading } = useModeUpgrade();

  if (hasAccess) {
    return <>{children}</>;
  }

  // Custom fallback
  if (fallback) {
    return <>{fallback}</>;
  }

  // Default upgrade prompt
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Feature Not Available</Text>
        
        <Text style={styles.message}>
          {showFeatureName && `"${feature}" is`} not available in {currentMode} mode.
        </Text>
        
        <Text style={styles.upgradePath}>
          {getFeatureUpgradePath(feature, currentMode as any)}
        </Text>
      </View>

      {showUpgradeButton && (
        <TouchableOpacity
          style={[styles.button, { opacity: loading ? 0.6 : 1 }]}
          onPress={async () => {
            if (onUpgradeClick) {
              onUpgradeClick();
              return;
            }

            if (currentMode === 'simple') {
              await upgradeToSmart();
            } else if (currentMode === 'smart') {
              await upgradeToProWithTrial();
            }
          }}
          disabled={loading}
        >
          <Text style={styles.buttonText}>
            {upgradeButtonText || 'Upgrade Mode'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  content: {
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: '#1e3a8a',
    marginBottom: 8,
    textAlign: 'center',
  },
  upgradePath: {
    fontSize: 13,
    color: '#3b82f6',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#3b82f6',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
});

// ============================================================================
// Advanced Feature Gate with More Options
// ============================================================================

interface AdvancedFeatureGateProps extends FeatureGateProps {
  /**
   * Badge to show when feature is premium
   */
  showBadge?: boolean;
  
  /**
   * Custom badge text
   */
  badgeText?: string;
  
  /**
   * Blur content instead of showing gate
   */
  blurContent?: boolean;
  
  /**
   * Log feature access attempts
   */
  logAccess?: boolean;
}

export const AdvancedFeatureGate: React.FC<AdvancedFeatureGateProps> = ({
  feature,
  children,
  fallback,
  showUpgradeButton = true,
  upgradeButtonText,
  onUpgradeClick,
  showFeatureName = true,
  showBadge = false,
  badgeText,
  blurContent = false,
  logAccess = true,
}) => {
  const { hasAccess, currentMode } = useFeatureAccess(feature, { logAccess });

  if (hasAccess) {
    return (
      <View>
        {showBadge && (
          <View style={advancedStyles.badgeContainer}>
            <Text style={advancedStyles.badge}>
              {badgeText || 'Premium Feature'}
            </Text>
          </View>
        )}
        {children}
      </View>
    );
  }

  if (blurContent) {
    return (
      <View style={advancedStyles.blurContainer}>
        <View style={advancedStyles.blur}>{children}</View>
        <View style={advancedStyles.overlay}>
          <FeatureGate
            feature={feature}
            fallback={fallback}
            showUpgradeButton={showUpgradeButton}
            upgradeButtonText={upgradeButtonText}
            onUpgradeClick={onUpgradeClick}
            showFeatureName={showFeatureName}
          >
            {children}
          </FeatureGate>
        </View>
      </View>
    );
  }

  return (
    <FeatureGate
      feature={feature}
      fallback={fallback}
      showUpgradeButton={showUpgradeButton}
      upgradeButtonText={upgradeButtonText}
      onUpgradeClick={onUpgradeClick}
      showFeatureName={showFeatureName}
    >
      {children}
    </FeatureGate>
  );
};

const advancedStyles = StyleSheet.create({
  badgeContainer: {
    marginBottom: 8,
  },
  badge: {
    backgroundColor: '#fbbf24',
    color: '#78350f',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 'bold',
    alignSelf: 'flex-start',
  },
  blurContainer: {
    position: 'relative',
  },
  blur: {
    opacity: 0.5,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

// ============================================================================
// Premium Badge - Show "Premium" badge on feature
// ============================================================================

interface PremiumBadgeProps {
  mode?: 'smart' | 'pro';
  children: ReactNode;
}

export const PremiumBadge: React.FC<PremiumBadgeProps> = ({
  mode = 'smart',
  children,
}) => {
  const badgeText = mode === 'pro' ? 'Pro Feature' : 'Smart Feature';
  const backgroundColor = mode === 'pro' ? '#dc2626' : '#8b5cf6';

  return (
    <View style={premiumStyles.container}>
      <View style={premiumStyles.content}>{children}</View>
      <View style={[premiumStyles.badge, { backgroundColor }]}>
        <Text style={premiumStyles.badgeText}>{badgeText}</Text>
      </View>
    </View>
  );
};

const premiumStyles = StyleSheet.create({
  container: {
    position: 'relative',
  },
  content: {
    width: '100%',
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  badgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
});

// ============================================================================
// Upgrade Prompt - Standalone upgrade prompt component
// ============================================================================

interface UpgradePromptProps {
  feature: string;
  mode?: 'simple' | 'smart' | 'pro';
  onUpgrade?: () => void;
}

export const UpgradePrompt: React.FC<UpgradePromptProps> = ({
  feature,
  mode,
  onUpgrade,
}) => {
  const { upgradeToSmart, upgradeToProWithTrial, loading } = useModeUpgrade();

  const handleUpgrade = async () => {
    if (onUpgrade) {
      onUpgrade();
      return;
    }

    if (mode === 'simple') {
      await upgradeToSmart();
    } else {
      await upgradeToProWithTrial();
    }
  };

  return (
    <View style={promptStyles.container}>
      <Text style={promptStyles.title}>Unlock Premium Features</Text>
      <Text style={promptStyles.description}>
        Upgrade to access "{feature}" and more advanced features.
      </Text>

      <TouchableOpacity
        style={promptStyles.button}
        onPress={handleUpgrade}
        disabled={loading}
      >
        <Text style={promptStyles.buttonText}>
          {loading ? 'Loading...' : 'Upgrade Now'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

const promptStyles = StyleSheet.create({
  container: {
    backgroundColor: '#fef3c7',
    borderRadius: 8,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#78350f',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    color: '#92400e',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#f59e0b',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
  },
});
