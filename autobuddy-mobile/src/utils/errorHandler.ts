export enum ErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  RATE_LIMIT = 'RATE_LIMIT',
  SERVER_ERROR = 'SERVER_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface AppError {
  code: ErrorCode;
  message: string;
  severity: ErrorSeverity;
  details?: Record<string, any>;
  timestamp: Date;
  userMessage: string;
  action?: string;
}

const ErrorMessages: Record<ErrorCode, { userMessage: string; severity: ErrorSeverity }> = {
  [ErrorCode.NETWORK_ERROR]: {
    userMessage: 'Network connection failed. Please check your internet connection.',
    severity: ErrorSeverity.HIGH,
  },
  [ErrorCode.AUTHENTICATION_ERROR]: {
    userMessage: 'Authentication failed. Please log in again.',
    severity: ErrorSeverity.CRITICAL,
  },
  [ErrorCode.AUTHORIZATION_ERROR]: {
    userMessage: 'You do not have permission to perform this action.',
    severity: ErrorSeverity.HIGH,
  },
  [ErrorCode.NOT_FOUND]: {
    userMessage: 'The requested resource was not found.',
    severity: ErrorSeverity.MEDIUM,
  },
  [ErrorCode.VALIDATION_ERROR]: {
    userMessage: 'Please check your input and try again.',
    severity: ErrorSeverity.MEDIUM,
  },
  [ErrorCode.RATE_LIMIT]: {
    userMessage: 'Too many requests. Please wait a moment and try again.',
    severity: ErrorSeverity.MEDIUM,
  },
  [ErrorCode.SERVER_ERROR]: {
    userMessage: 'Server error. Please try again later.',
    severity: ErrorSeverity.HIGH,
  },
  [ErrorCode.UNKNOWN_ERROR]: {
    userMessage: 'An unexpected error occurred. Please try again.',
    severity: ErrorSeverity.HIGH,
  },
};

export const createError = (
  code: ErrorCode,
  message: string,
  details?: Record<string, any>
): AppError => {
  const errorConfig = ErrorMessages[code];

  return {
    code,
    message,
    severity: errorConfig.severity,
    details,
    timestamp: new Date(),
    userMessage: errorConfig.userMessage,
  };
};

export const handleAxiosError = (error: any): AppError => {
  if (!error.response) {
    return createError(
      ErrorCode.NETWORK_ERROR,
      'Network error occurred',
      { originalError: error.message }
    );
  }

  const status = error.response.status;

  switch (status) {
    case 401:
      return createError(
        ErrorCode.AUTHENTICATION_ERROR,
        'Authentication failed',
        { status }
      );
    case 403:
      return createError(
        ErrorCode.AUTHORIZATION_ERROR,
        'Access denied',
        { status }
      );
    case 404:
      return createError(
        ErrorCode.NOT_FOUND,
        'Resource not found',
        { status }
      );
    case 422:
      return createError(
        ErrorCode.VALIDATION_ERROR,
        error.response.data?.message || 'Validation failed',
        { status, details: error.response.data?.errors }
      );
    case 429:
      return createError(
        ErrorCode.RATE_LIMIT,
        'Rate limit exceeded',
        { status, retryAfter: error.response.headers['retry-after'] }
      );
    case 500:
    case 502:
    case 503:
    case 504:
      return createError(
        ErrorCode.SERVER_ERROR,
        'Server error',
        { status }
      );
    default:
      return createError(
        ErrorCode.UNKNOWN_ERROR,
        error.response.data?.message || 'Unknown error',
        { status }
      );
  }
};

export const handleApiError = handleAxiosError;

export const isRetryableError = (error: AppError): boolean => {
  return (
    error.code === ErrorCode.NETWORK_ERROR ||
    error.code === ErrorCode.RATE_LIMIT ||
    error.code === ErrorCode.SERVER_ERROR
  );
};

export const getErrorAction = (error: AppError): string | undefined => {
  switch (error.code) {
    case ErrorCode.AUTHENTICATION_ERROR:
      return 'LOGIN';
    case ErrorCode.NETWORK_ERROR:
      return 'RETRY';
    case ErrorCode.RATE_LIMIT:
      return 'WAIT';
    default:
      return undefined;
  }
};

export const logError = (error: AppError, context?: string): void => {
  const timestamp = error.timestamp.toISOString();
  const contextStr = context ? `[${context}]` : '';

  if (error.severity === ErrorSeverity.CRITICAL) {
    console.error(
      `${contextStr} [CRITICAL] ${error.code}: ${error.message}`,
      error.details
    );
  } else if (error.severity === ErrorSeverity.HIGH) {
    console.warn(
      `${contextStr} [HIGH] ${error.code}: ${error.message}`,
      error.details
    );
  } else {
    console.log(
      `${contextStr} [${error.severity.toUpperCase()}] ${error.code}: ${error.message}`,
      error.details
    );
  }
};

export const createErrorMessage = (error: AppError): string => {
  if (error.details?.validation) {
    const validationErrors = Object.entries(error.details.validation)
      .map(([field, msg]) => `${field}: ${msg}`)
      .join('\n');
    return `${error.userMessage}\n\n${validationErrors}`;
  }

  return error.userMessage;
};
