/**
 * Error UI Components
 * React components for displaying errors
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Animated } from 'react-native';
import { useError, ERROR_SEVERITY, getRetryActionText } from '../utils/errorHandling';

/**
 * Error Display Colors
 */
const ERROR_COLORS = {
  info: '#2196F3',
  warning: '#FF9800',
  error: '#F44336',
  critical: '#8B0000'
};

const ICON_LABELS = {
  info: 'i',
  warning: '!',
  error: '!',
  'error-outline': '!',
  close: 'x',
  refresh: 'R'
};

function ErrorIcon({ name, size = 20, color = 'white', style }) {
  return (
    <Text
      style={[
        styles.iconText,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          color,
          borderColor: color,
          fontSize: Math.max(11, Math.round(size * 0.55)),
          lineHeight: size - 2
        },
        style
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {ICON_LABELS[name] || '!'}
    </Text>
  );
}

/**
 * ErrorBanner - Top banner for displaying errors
 */
export function ErrorBanner() {
  const { errors, clearError } = useError();
  const [slideAnim] = useState(() => new Animated.Value(0));

  const topError = errors[errors.length - 1];

  useEffect(() => {
    if (topError) {
      Animated.timing(slideAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: false
      }).start();
    } else {
      slideAnim.setValue(0);
    }
  }, [slideAnim, topError]);

  if (!topError) return null;

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-100, 0]
  });

  return (
    <Animated.View style={[styles.banner, { transform: [{ translateY }] }]}>
      <View style={[
        styles.bannerContent,
        { backgroundColor: ERROR_COLORS[topError.severity] }
      ]}>
        <View style={styles.bannerIconContainer}>
          <ErrorIcon
            name={getSeverityIcon(topError.severity)}
            size={20}
            color="white"
          />
        </View>

        <View style={styles.bannerTextContainer}>
          <Text style={styles.bannerMessage} numberOfLines={2}>
            {topError.message}
          </Text>
          {topError.retryable && (
            <Text style={styles.bannerRetryHint}>
              {getRetryActionText(topError)}
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.bannerCloseButton}
          onPress={() => clearError(topError.id)}
        >
          <ErrorIcon name="close" size={20} color="white" />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

/**
 * ErrorDialog - Full screen error dialog for critical errors
 */
export function ErrorDialog() {
  const { activeError, clearError, errors } = useError();
  const [fadeAnim] = useState(() => new Animated.Value(0));

  const error = errors.find(e => e.id === activeError?.id);
  const isCritical = error?.severity === ERROR_SEVERITY.CRITICAL;

  useEffect(() => {
    if (error && isCritical) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true
      }).start();
    }
  }, [error, fadeAnim, isCritical]);

  if (!error || !isCritical) return null;

  return (
    <Animated.View style={[styles.dialogOverlay, { opacity: fadeAnim }]}>
      <Modal
        transparent
        visible={isCritical}
        animationType="slide"
        onRequestClose={() => clearError(error.id)}
      >
        <View style={styles.dialogContainer}>
          <View style={styles.dialogContent}>
            <View style={styles.dialogIconContainer}>
              <ErrorIcon
                name={getSeverityIcon(error.severity)}
                size={48}
                color={ERROR_COLORS[error.severity]}
              />
            </View>

            <Text style={styles.dialogTitle}>
              {getSeverityTitle(error.severity)}
            </Text>

            <Text style={styles.dialogMessage}>
              {error.message}
            </Text>

            {error.details && (
              <View style={styles.detailsContainer}>
                <Text style={styles.detailsTitle}>Details:</Text>
                <ScrollView style={styles.detailsList}>
                  {Array.isArray(error.details) ? (
                    error.details.map((detail, idx) => (
                      <Text key={idx} style={styles.detailsItem}>
                        • {detail.field}: {detail.message}
                      </Text>
                    ))
                  ) : (
                    <Text style={styles.detailsItem}>
                      {JSON.stringify(error.details, null, 2)}
                    </Text>
                  )}
                </ScrollView>
              </View>
            )}

            <View style={styles.dialogButtonContainer}>
              {error.action && (
                <TouchableOpacity
                  style={[styles.dialogButton, styles.primaryButton]}
                  onPress={() => {
                    handleErrorAction(error.action);
                    clearError(error.id);
                  }}
                >
                  <Text style={styles.buttonText}>
                    {getActionButtonText(error.action)}
                  </Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.dialogButton, styles.secondaryButton]}
                onPress={() => clearError(error.id)}
              >
                <Text style={[styles.buttonText, { color: ERROR_COLORS[error.severity] }]}>
                  Close
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
}

/**
 * ValidationErrorField - Inline validation error display
 */
export function ValidationErrorField({ error, field, touched }) {
  if (!error || !touched) return null;

  return (
    <View style={styles.fieldErrorContainer}>
      <ErrorIcon
        name="error-outline"
        size={16}
        color={ERROR_COLORS.warning}
      />
      <Text style={styles.fieldErrorText}>
        {error}
      </Text>
    </View>
  );
}

/**
 * ErrorRetryButton - Button for retrying failed operations
 */
export function ErrorRetryButton({ error, onRetry, loading }) {
  if (!error?.retryable) return null;

  return (
    <TouchableOpacity
      style={[styles.retryButton, loading && styles.retryButtonLoading]}
      onPress={onRetry}
      disabled={loading}
    >
      <ErrorIcon
        name="refresh"
        size={18}
        color="white"
        style={{ marginRight: 8 }}
      />
      <Text style={styles.retryButtonText}>
        {loading ? 'Retrying...' : 'Retry'}
      </Text>
    </TouchableOpacity>
  );
}

/**
 * ErrorBoundary - React error boundary component
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error,
      errorInfo
    });

    // Log to error reporting service
    console.error('Error Boundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorBoundaryContainer}>
          <ErrorIcon
            name="error"
            size={48}
            color={ERROR_COLORS.critical}
          />
          <Text style={styles.errorBoundaryTitle}>
            Something went wrong
          </Text>
          <Text style={styles.errorBoundaryMessage}>
            {this.state.error?.message}
          </Text>
          <TouchableOpacity
            style={styles.errorBoundaryButton}
            onPress={() => this.setState({ hasError: false })}
          >
            <Text style={styles.errorBoundaryButtonText}>
              Try Again
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

/**
 * Helper Functions
 */

function getSeverityIcon(severity) {
  switch (severity) {
    case 'info':
      return 'info';
    case 'warning':
      return 'warning';
    case 'error':
      return 'error';
    case 'critical':
      return 'error';
    default:
      return 'info';
  }
}

function getSeverityTitle(severity) {
  switch (severity) {
    case 'info':
      return 'Information';
    case 'warning':
      return 'Warning';
    case 'error':
      return 'Error';
    case 'critical':
      return 'Critical Error';
    default:
      return 'Error';
  }
}

function getActionButtonText(action) {
  switch (action) {
    case 'REDIRECT_TO_LOGIN':
      return 'Go to Login';
    case 'UPDATE_PAYMENT_METHOD':
      return 'Update Payment';
    case 'CONTACT_SUPPORT':
      return 'Contact Support';
    case 'RETRY':
      return 'Try Again';
    default:
      return 'Action';
  }
}

function handleErrorAction(action) {
  switch (action) {
    case 'REDIRECT_TO_LOGIN':
      // Navigate to login screen
      break;
    case 'UPDATE_PAYMENT_METHOD':
      // Navigate to payment settings
      break;
    case 'CONTACT_SUPPORT':
      // Open support
      break;
  }
}

/**
 * Styles
 */
const styles = StyleSheet.create({
  iconText: {
    borderWidth: 1.5,
    fontWeight: '900',
    textAlign: 'center',
    overflow: 'hidden'
  },

  // Banner styles
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 60
  },
  bannerIconContainer: {
    marginRight: 12
  },
  bannerTextContainer: {
    flex: 1
  },
  bannerMessage: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500'
  },
  bannerRetryHint: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 4
  },
  bannerCloseButton: {
    padding: 8,
    marginLeft: 8
  },

  // Dialog styles
  dialogOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 2000
  },
  dialogContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  dialogContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    paddingVertical: 24,
    paddingHorizontal: 20,
    marginHorizontal: 20,
    maxHeight: '80%',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84
  },
  dialogIconContainer: {
    alignItems: 'center',
    marginBottom: 16
  },
  dialogTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
    color: '#333'
  },
  dialogMessage: {
    fontSize: 14,
    textAlign: 'center',
    color: '#666',
    lineHeight: 20,
    marginBottom: 16
  },
  detailsContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16
  },
  detailsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8
  },
  detailsList: {
    maxHeight: 150
  },
  detailsItem: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
    marginBottom: 4
  },
  dialogButtonContainer: {
    flexDirection: 'column',
    gap: 10
  },
  dialogButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  primaryButton: {
    backgroundColor: '#2196F3'
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#ddd'
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white'
  },

  // Field error styles
  fieldErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 8
  },
  fieldErrorText: {
    fontSize: 12,
    color: ERROR_COLORS.warning,
    marginLeft: 4,
    flex: 1
  },

  // Retry button styles
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 12
  },
  retryButtonLoading: {
    opacity: 0.7
  },
  retryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white'
  },

  // Error boundary styles
  errorBoundaryContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 20
  },
  errorBoundaryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 8
  },
  errorBoundaryMessage: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20
  },
  errorBoundaryButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8
  },
  errorBoundaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600'
  }
});
