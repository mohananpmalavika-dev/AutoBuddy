import React, { useCallback, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../theme';

/**
 * ErrorRecoverySystem Component
 * 
 * Smart error handling with contextual retry actions.
 * Addresses Issue #10: Loading States & Error Feedback
 * 
 * Props:
 *   - error: Error object or message string
 *   - errorType: 'network' | 'server' | 'auth' | 'validation'
 *   - isRetrying: boolean
 *   - onRetry: () => void (async function)
 *   - onDismiss: () => void
 *   - onContactSupport: () => void
 *   - autoRetryDelay: number (ms, default: 5000)
 *   - autoRetry: boolean (default: false for transient errors)
 */
export default function ErrorRecoverySystem({
  error = null,
  errorType = 'server',
  isRetrying = false,
  onRetry,
  onDismiss,
  onContactSupport,
  autoRetryDelay = 5000,
  autoRetry = true,
}) {
  const [autoRetryCountdown, setAutoRetryCountdown] = React.useState(0);
  const fadeAnim = React.useMemo(() => new Animated.Value(0), []);

  // Show/hide and manage animations
  useEffect(() => {
    if (error) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [error, fadeAnim]);

  // Initialize auto-retry countdown when error arrives
  useEffect(() => {
    if (error && autoRetry && ['network', 'server'].includes(errorType)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAutoRetryCountdown(Math.ceil(autoRetryDelay / 1000));
    } else {
      setAutoRetryCountdown(0);
    }
  }, [error, autoRetry, errorType, autoRetryDelay]);

  // Auto-retry countdown timer
  useEffect(() => {
    if (autoRetryCountdown <= 0) return;

    const timer = setInterval(() => {
      setAutoRetryCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          if (typeof onRetry === 'function' && !isRetrying) {
            onRetry();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [autoRetryCountdown, isRetrying, onRetry]);

  const errorConfig = useMemo(() => {
    const configs = {
      network: {
        icon: '📡',
        title: 'No Connection',
        message: 'Check your internet connection. Changes will sync when online.',
        color: '#FF9800',
        actions: ['Retry', 'Offline Mode'],
      },
      server: {
        icon: '⚠️',
        title: 'Service Unavailable',
        message: 'The server is temporarily unavailable. Retrying...',
        color: '#FF6B6B',
        actions: ['Retry', 'Details', 'Support'],
      },
      auth: {
        icon: '🔐',
        title: 'Session Expired',
        message: 'Your session has expired. Please login again.',
        color: '#FF6B6B',
        actions: ['Login', 'Support'],
      },
      validation: {
        icon: '❌',
        title: 'Invalid Input',
        message: String(error) || 'Please check your input and try again.',
        color: '#FF6B6B',
        actions: ['Edit', 'Dismiss'],
      },
    };
    return configs[errorType] || configs.server;
  }, [errorType, error]);

  const handleDismiss = useCallback(() => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      if (typeof onDismiss === 'function') {
        onDismiss();
      }
    });
  }, [fadeAnim, onDismiss]);

  const handleRetry = useCallback(() => {
    if (typeof onRetry === 'function' && !isRetrying) {
      onRetry();
    }
  }, [onRetry, isRetrying]);

  if (!error) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        { opacity: fadeAnim },
      ]}>
      <View style={styles.backdrop} />

      <View
        style={[
          styles.errorPanel,
          { borderLeftColor: errorConfig.color },
        ]}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.icon}>{errorConfig.icon}</Text>
          <View style={styles.titleContainer}>
            <Text style={styles.title}>{errorConfig.title}</Text>
            {autoRetryCountdown > 0 && (
              <Text style={styles.autoRetryText}>
                Retrying in {autoRetryCountdown}s...
              </Text>
            )}
          </View>
          <TouchableOpacity
            onPress={handleDismiss}
            style={styles.closeButton}
            disabled={isRetrying}>
            <Text style={styles.closeIcon}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Message */}
        <Text style={styles.message}>{errorConfig.message}</Text>

        {/* Error Details (if available) */}
        {typeof error === 'object' && error?.details && (
          <View style={styles.detailsBox}>
            <Text style={styles.detailsLabel}>Details:</Text>
            <Text style={styles.detailsText}>
              {error.details}
            </Text>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionContainer}>
          {isRetrying ? (
            <View style={styles.retryingContainer}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <Text style={styles.retryingText}>Retrying...</Text>
            </View>
          ) : (
            <>
              {/* Primary Action (usually Retry) */}
              <TouchableOpacity
                style={[styles.actionButton, styles.primaryButton]}
                onPress={handleRetry}
                disabled={isRetrying}>
                <Text style={styles.primaryButtonText}>Retry</Text>
              </TouchableOpacity>

              {/* Secondary Action */}
              {errorType !== 'validation' && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.secondaryButton]}
                  onPress={onContactSupport}
                  disabled={!onContactSupport}>
                  <Text style={styles.secondaryButtonText}>Support</Text>
                </TouchableOpacity>
              )}

              {/* Tertiary Action (Dismiss) */}
              {errorType === 'validation' && (
                <TouchableOpacity
                  style={[styles.actionButton, styles.secondaryButton]}
                  onPress={handleDismiss}>
                  <Text style={styles.secondaryButtonText}>Dismiss</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>

        {/* Offline Mode Note */}
        {errorType === 'network' && (
          <View style={styles.noteBox}>
            <Text style={styles.noteText}>
              💡 Your actions are saved locally and will sync when connection is restored.
            </Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  errorPanel: {
    marginHorizontal: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    borderLeftWidth: 4,
    ...SHADOWS.elevated,
    maxWidth: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  icon: {
    fontSize: 28,
    marginTop: 2,
  },
  titleContainer: {
    flex: 1,
  },
  title: {
    ...TYPOGRAPHY.headline6,
    fontWeight: '600',
    marginBottom: 2,
  },
  autoRetryText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  closeButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 16,
    backgroundColor: '#F5F5F5',
  },
  closeIcon: {
    fontSize: 18,
    color: COLORS.textSecondary,
  },
  message: {
    ...TYPOGRAPHY.body2,
    color: COLORS.textSecondary,
    marginBottom: 12,
    lineHeight: 20,
  },
  detailsBox: {
    backgroundColor: '#F5F5F5',
    borderLeftWidth: 2,
    borderLeftColor: '#FF9800',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginBottom: 12,
  },
  detailsLabel: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
    marginBottom: 4,
  },
  detailsText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  actionContainer: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  retryingContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  retryingText: {
    ...TYPOGRAPHY.body2,
    marginLeft: 8,
    color: COLORS.textSecondary,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
  },
  primaryButtonText: {
    ...TYPOGRAPHY.button,
    color: COLORS.white,
    fontWeight: '600',
  },
  secondaryButton: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  secondaryButtonText: {
    ...TYPOGRAPHY.button,
    color: COLORS.primary,
    fontWeight: '600',
  },
  noteBox: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderLeftWidth: 2,
    borderLeftColor: '#6BCF7F',
  },
  noteText: {
    ...TYPOGRAPHY.caption,
    color: '#2E7D32',
    lineHeight: 16,
  },
});
