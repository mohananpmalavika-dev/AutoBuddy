/**
 * Error Handling Utilities & Components
 * Centralized error handling for the frontend
 */

import React, { createContext, useState, useCallback } from 'react';

/**
 * Error severity levels
 */
export const ERROR_SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

/**
 * Error categories for different handling strategies
 */
export const ERROR_CATEGORY = {
  NETWORK: 'network',
  VALIDATION: 'validation',
  AUTHENTICATION: 'authentication',
  AUTHORIZATION: 'authorization',
  SERVER: 'server',
  UNKNOWN: 'unknown',
  USER_ACTION: 'user_action'
};

/**
 * Standard error messages for users
 */
export const ERROR_MESSAGES = {
  // Network errors
  NETWORK_ERROR: 'Network connection failed. Please check your internet connection.',
  NETWORK_TIMEOUT: 'Request timed out. Please try again.',
  NO_CONNECTION: 'No internet connection. Some features may be unavailable.',
  
  // Authentication errors
  UNAUTHORIZED: 'You are not authenticated. Please log in again.',
  SESSION_EXPIRED: 'Your session has expired. Please log in again.',
  INVALID_CREDENTIALS: 'Invalid email or password.',
  
  // Authorization errors
  FORBIDDEN: 'You don\'t have permission to perform this action.',
  ACCESS_DENIED: 'Access denied.',
  
  // Validation errors
  INVALID_INPUT: 'Please check your input and try again.',
  REQUIRED_FIELD: 'This field is required.',
  INVALID_FORMAT: 'Invalid format. Please check and try again.',
  
  // Server errors
  SERVER_ERROR: 'Something went wrong on our end. Please try again later.',
  SERVICE_UNAVAILABLE: 'Service is temporarily unavailable. Please try again later.',
  RATE_LIMITED: 'Too many requests. Please wait a moment and try again.',
  
  // Ride-specific errors
  BOOKING_FAILED: 'Failed to create booking. Please try again.',
  NO_DRIVERS_AVAILABLE: 'No drivers available in your area. Try again in a moment.',
  PAYMENT_FAILED: 'Payment failed. Please check your payment method and try again.',
  RIDE_CANCELLED: 'The ride was cancelled.',
  DRIVER_CANCELLED: 'The driver cancelled the ride.',
  
  // Generic
  SOMETHING_WRONG: 'Something went wrong. Please try again.',
  TRY_AGAIN: 'Please try again.'
};

/**
 * Classify error and extract details
 */
export function classifyError(error) {
  if (!error) {
    return {
      category: ERROR_CATEGORY.UNKNOWN,
      severity: ERROR_SEVERITY.ERROR,
      message: ERROR_MESSAGES.SOMETHING_WRONG,
      code: 'UNKNOWN_ERROR'
    };
  }

  // Network errors
  if (error.message?.includes('Network') || error.code === 'NETWORK_ERROR') {
    return {
      category: ERROR_CATEGORY.NETWORK,
      severity: ERROR_SEVERITY.ERROR,
      message: ERROR_MESSAGES.NETWORK_ERROR,
      code: 'NETWORK_ERROR',
      retryable: true
    };
  }

  if (error.message?.includes('timeout') || error.code === 'TIMEOUT') {
    return {
      category: ERROR_CATEGORY.NETWORK,
      severity: ERROR_SEVERITY.WARNING,
      message: ERROR_MESSAGES.NETWORK_TIMEOUT,
      code: 'TIMEOUT',
      retryable: true
    };
  }

  // HTTP status codes
  if (error.status) {
    switch (error.status) {
      case 400:
        return {
          category: ERROR_CATEGORY.VALIDATION,
          severity: ERROR_SEVERITY.WARNING,
          message: error.data?.error?.message || ERROR_MESSAGES.INVALID_INPUT,
          code: 'VALIDATION_ERROR',
          details: error.data?.errors || null
        };
      case 401:
        return {
          category: ERROR_CATEGORY.AUTHENTICATION,
          severity: ERROR_SEVERITY.ERROR,
          message: ERROR_MESSAGES.UNAUTHORIZED,
          code: 'UNAUTHORIZED',
          retryable: false
        };
      case 403:
        return {
          category: ERROR_CATEGORY.AUTHORIZATION,
          severity: ERROR_SEVERITY.ERROR,
          message: ERROR_MESSAGES.FORBIDDEN,
          code: 'FORBIDDEN',
          retryable: false
        };
      case 429:
        return {
          category: ERROR_CATEGORY.NETWORK,
          severity: ERROR_SEVERITY.WARNING,
          message: ERROR_MESSAGES.RATE_LIMITED,
          code: 'RATE_LIMITED',
          retryable: true,
          retryAfter: error.headers?.['retry-after']
        };
      case 500:
      case 502:
      case 503:
      case 504:
        return {
          category: ERROR_CATEGORY.SERVER,
          severity: ERROR_SEVERITY.ERROR,
          message: ERROR_MESSAGES.SERVER_ERROR,
          code: `SERVER_ERROR_${error.status}`,
          retryable: true
        };
    }
  }

  // API error codes
  const apiError = error.data?.error || error.response?.data?.error;
  if (apiError?.code) {
    switch (apiError.code) {
      case 'invalid_credentials':
        return {
          category: ERROR_CATEGORY.AUTHENTICATION,
          severity: ERROR_SEVERITY.ERROR,
          message: ERROR_MESSAGES.INVALID_CREDENTIALS,
          code: apiError.code
        };
      case 'session_expired':
        return {
          category: ERROR_CATEGORY.AUTHENTICATION,
          severity: ERROR_SEVERITY.ERROR,
          message: ERROR_MESSAGES.SESSION_EXPIRED,
          code: apiError.code,
          action: 'REDIRECT_TO_LOGIN'
        };
      case 'validation_error':
        return {
          category: ERROR_CATEGORY.VALIDATION,
          severity: ERROR_SEVERITY.WARNING,
          message: apiError.message || ERROR_MESSAGES.INVALID_INPUT,
          code: apiError.code,
          details: error.data?.errors
        };
      case 'no_drivers_available':
        return {
          category: ERROR_CATEGORY.USER_ACTION,
          severity: ERROR_SEVERITY.WARNING,
          message: ERROR_MESSAGES.NO_DRIVERS_AVAILABLE,
          code: apiError.code,
          retryable: true
        };
      case 'payment_failed':
        return {
          category: ERROR_CATEGORY.USER_ACTION,
          severity: ERROR_SEVERITY.ERROR,
          message: ERROR_MESSAGES.PAYMENT_FAILED,
          code: apiError.code,
          action: 'UPDATE_PAYMENT_METHOD'
        };
    }
  }

  return {
    category: ERROR_CATEGORY.UNKNOWN,
    severity: ERROR_SEVERITY.ERROR,
    message: error.message || ERROR_MESSAGES.SOMETHING_WRONG,
    code: 'UNKNOWN_ERROR'
  };
}

/**
 * Error Context for global error handling
 */
export const ErrorContext = createContext();

export function ErrorProvider({ children }) {
  const [errors, setErrors] = useState([]);
  const [activeError, setActiveError] = useState(null);

  const clearError = useCallback((errorId) => {
    setErrors(prev => prev.filter(e => e.id !== errorId));
    setActiveError(prev => prev?.id === errorId ? null : prev);
  }, []);

  const addError = useCallback((error, options = {}) => {
    const classified = classifyError(error);
    const errorObj = {
      id: Math.random().toString(36),
      timestamp: Date.now(),
      ...classified,
      ...options
    };

    setErrors(prev => [...prev, errorObj]);
    setActiveError(prev => prev || errorObj);

    // Auto-dismiss non-critical errors after 5 seconds
    if (classified.severity !== ERROR_SEVERITY.CRITICAL) {
      setTimeout(() => {
        clearError(errorObj.id);
      }, 5000);
    }

    return errorObj.id;
  }, [clearError]);

  const clearAllErrors = useCallback(() => {
    setErrors([]);
    setActiveError(null);
  }, []);

  return (
    <ErrorContext.Provider value={{
      errors,
      activeError,
      addError,
      clearError,
      clearAllErrors
    }}>
      {children}
    </ErrorContext.Provider>
  );
}

/**
 * Hook to use error context
 */
export function useError() {
  const context = React.useContext(ErrorContext);
  if (!context) {
    throw new Error('useError must be used within ErrorProvider');
  }
  return context;
}

/**
 * Hook for retry logic
 */
export function useErrorRetry() {
  const [retrying, setRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [nextRetryTime, setNextRetryTime] = useState(null);

  const canRetry = useCallback((error) => {
    return error?.retryable && retryCount < 3;
  }, [retryCount]);

  const retry = useCallback(async (asyncFn) => {
    if (!canRetry) return false;

    setRetrying(true);
    try {
      await asyncFn();
      setRetryCount(0);
      return true;
    } catch {
      setRetryCount(prev => prev + 1);
      
      // Exponential backoff
      const delay = Math.pow(2, retryCount) * 1000;
      setNextRetryTime(Date.now() + delay);
      
      return false;
    } finally {
      setRetrying(false);
    }
  }, [canRetry, retryCount]);

  const reset = useCallback(() => {
    setRetryCount(0);
    setNextRetryTime(null);
    setRetrying(false);
  }, []);

  return {
    retrying,
    retryCount,
    canRetry,
    retry,
    reset,
    nextRetryTime
  };
}

/**
 * HTTP Interceptor for API calls
 */
export class APIErrorInterceptor {
  static setupInterceptors(axiosInstance, errorHandler) {
    // Response interceptor
    axiosInstance.interceptors.response.use(
      response => response,
      error => {
        const classified = classifyError(error.response || error);
        errorHandler(classified);
        return Promise.reject(classified);
      }
    );

    return axiosInstance;
  }
}

/**
 * Validation error formatter
 */
export function formatValidationErrors(errors) {
  if (Array.isArray(errors)) {
    return errors.map(err => ({
      field: err.field || err.loc?.[0],
      message: err.message || err.msg,
      type: err.type
    }));
  }
  return [];
}

/**
 * Get retry-able action suggestions
 */
export function getRetryActionText(error) {
  if (!error.retryable) return null;

  switch (error.code) {
    case 'NETWORK_ERROR':
    case 'TIMEOUT':
      return 'Check your connection and try again';
    case 'RATE_LIMITED':
      return `Wait ${error.retryAfter || 60} seconds and try again`;
    case 'SERVER_ERROR':
      return 'The server is experiencing issues. Try again soon';
    default:
      return 'Try again';
  }
}

/**
 * Log error for analytics/debugging
 */
export function logError(error, context = {}) {
  const classified = classifyError(error);
  console.error({
    timestamp: new Date().toISOString(),
    category: classified.category,
    severity: classified.severity,
    code: classified.code,
    message: classified.message,
    context,
    originalError: error
  });
}
