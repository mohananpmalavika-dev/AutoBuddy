/*
 * Frontend Error State Management with Real Error Handling.
 * Replaces mock data with real API error tracking and display.
 */

import React, { createContext, useContext, useReducer, useCallback } from 'react';

// Error state context
const ErrorContext = createContext(null);

// Error types matching backend
const ERROR_TYPES = {
  NETWORK: 'network',
  VALIDATION: 'validation',
  AUTHENTICATION: 'authentication',
  AUTHORIZATION: 'authorization',
  SERVER: 'server',
  NOT_FOUND: 'not_found',
  RATE_LIMITED: 'rate_limited',
  CONFLICT: 'conflict',
  UNKNOWN: 'unknown'
};

const ERROR_SEVERITY = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
};

// Classify error from API response
export const classifyErrorFromResponse = (response, error) => {
  // Network error
  if (!response) {
    return {
      type: ERROR_TYPES.NETWORK,
      severity: ERROR_SEVERITY.ERROR,
      code: 'NETWORK_ERROR',
      message: error?.message || 'Network error. Please check your connection.',
      retriable: true
    };
  }

  // Parse response
  const status = response.status;
  const data = response.data || {};

  // Rate limiting
  if (status === 429) {
    return {
      type: ERROR_TYPES.RATE_LIMITED,
      severity: ERROR_SEVERITY.WARNING,
      code: data.error?.code || 'RATE_LIMITED',
      message: data.error?.message || 'Too many requests. Please try again later.',
      retryAfter: parseInt(response.headers?.['retry-after'] || '60'),
      retriable: true
    };
  }

  // Validation error
  if (status === 422 || data.status === 'validation_error') {
    return {
      type: ERROR_TYPES.VALIDATION,
      severity: ERROR_SEVERITY.WARNING,
      code: 'VALIDATION_ERROR',
      message: data.message || 'Validation failed',
      errors: data.errors || {},
      retriable: false
    };
  }

  // Authentication error
  if (status === 401) {
    return {
      type: ERROR_TYPES.AUTHENTICATION,
      severity: ERROR_SEVERITY.ERROR,
      code: data.error?.code || 'UNAUTHORIZED',
      message: data.error?.message || 'Authentication required. Please log in.',
      retriable: false
    };
  }

  // Authorization error
  if (status === 403) {
    return {
      type: ERROR_TYPES.AUTHORIZATION,
      severity: ERROR_SEVERITY.WARNING,
      code: data.error?.code || 'FORBIDDEN',
      message: data.error?.message || 'You do not have permission to access this resource.',
      retriable: false
    };
  }

  // Not found error
  if (status === 404) {
    return {
      type: ERROR_TYPES.NOT_FOUND,
      severity: ERROR_SEVERITY.INFO,
      code: data.error?.code || 'NOT_FOUND',
      message: data.error?.message || 'The requested resource was not found.',
      retriable: false
    };
  }

  // Conflict error
  if (status === 409) {
    return {
      type: ERROR_TYPES.CONFLICT,
      severity: ERROR_SEVERITY.WARNING,
      code: data.error?.code || 'CONFLICT',
      message: data.error?.message || 'There was a conflict with the current state.',
      retriable: true
    };
  }

  // Server error
  if (status >= 500) {
    return {
      type: ERROR_TYPES.SERVER,
      severity: ERROR_SEVERITY.CRITICAL,
      code: data.error?.code || 'SERVER_ERROR',
      message: data.error?.message || 'Server error. Please try again later.',
      errorId: data.error?.details?.error_id,
      retriable: true
    };
  }

  // Unknown error
  return {
    type: ERROR_TYPES.UNKNOWN,
    severity: ERROR_SEVERITY.ERROR,
    code: 'UNKNOWN_ERROR',
    message: data.error?.message || data.message || 'An unknown error occurred.',
    retriable: true
  };
};

// Error reducer
const errorReducer = (state, action) => {
  switch (action.type) {
    case 'ADD_ERROR':
      return {
        ...state,
        errors: [...state.errors, { ...action.payload, id: Date.now() }],
        lastError: action.payload
      };

    case 'REMOVE_ERROR':
      return {
        ...state,
        errors: state.errors.filter(e => e.id !== action.payload),
        lastError: state.errors.length <= 1 ? null : state.lastError
      };

    case 'CLEAR_ERRORS':
      return {
        ...state,
        errors: [],
        lastError: null
      };

    case 'UPDATE_RETRY_COUNT':
      return {
        ...state,
        errors: state.errors.map(e =>
          e.id === action.payload.errorId
            ? { ...e, retryCount: (e.retryCount || 0) + 1 }
            : e
        )
      };

    case 'CLEAR_VALIDATION_ERRORS':
      return {
        ...state,
        validationErrors: {}
      };

    default:
      return state;
  }
};

// Error provider component
export const ErrorProvider = ({ children }) => {
  const [state, dispatch] = useReducer(errorReducer, {
    errors: [],
    lastError: null,
    validationErrors: {}
  });

  const addError = useCallback((error) => {
    dispatch({
      type: 'ADD_ERROR',
      payload: error
    });
  }, []);

  const removeError = useCallback((errorId) => {
    dispatch({
      type: 'REMOVE_ERROR',
      payload: errorId
    });
  }, []);

  const clearErrors = useCallback(() => {
    dispatch({
      type: 'CLEAR_ERRORS'
    });
  }, []);

  const addValidationError = useCallback((errors) => {
    const classifiedError = {
      type: ERROR_TYPES.VALIDATION,
      severity: ERROR_SEVERITY.WARNING,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      errors
    };
    addError(classifiedError);
  }, [addError]);

  const handleAPIError = useCallback((response, error) => {
    const classifiedError = classifyErrorFromResponse(response, error);
    addError(classifiedError);
    return classifiedError;
  }, [addError]);

  const value = {
    state,
    dispatch,
    addError,
    removeError,
    clearErrors,
    addValidationError,
    handleAPIError
  };

  return (
    <ErrorContext.Provider value={value}>
      {children}
    </ErrorContext.Provider>
  );
};

// Hook to use error context
export const useError = () => {
  const context = useContext(ErrorContext);
  if (!context) {
    throw new Error('useError must be used within ErrorProvider');
  }
  return context;
};

// Hook for error retry with exponential backoff
export const useErrorRetry = () => {
  const retry = useCallback(
    async (fn, maxRetries = 3) => {
      let lastError = null;
      let delay = 1000; // Start with 1 second

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          return await fn();
        } catch (error) {
          lastError = error;

          if (attempt < maxRetries) {
            // Exponential backoff: 1s, 2s, 4s, etc.
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
          }
        }
      }

      throw lastError;
    },
    []
  );

  return { retry };
};

// Axios error interceptor
export const setupErrorInterceptor = (axiosInstance, errorHandler) => {
  axiosInstance.interceptors.response.use(
    response => response,
    error => {
      const response = error.response;
      const classifiedError = classifyErrorFromResponse(response, error);

      if (errorHandler) {
        errorHandler(classifiedError);
      }

      return Promise.reject(classifiedError);
    }
  );
};

export default ErrorContext;
