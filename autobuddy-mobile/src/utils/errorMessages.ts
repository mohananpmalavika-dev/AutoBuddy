/**
 * Error Messages Utility
 * 
 * Provides user-friendly error messages for all HTTP status codes and error types.
 * Created as part of BUG-004 fix - comprehensive API error handling.
 */

export const ERROR_MESSAGES: Record<number | string, string> = {
  // 4xx Client Errors
  400: 'Invalid request. Please check your input and try again.',
  401: 'Your session has expired. Please log in again.',
  403: "You don't have permission to perform this action.",
  404: 'The requested resource was not found.',
  409: 'This action conflicts with existing data. Please refresh and try again.',
  422: 'The data provided is invalid. Please check and try again.',
  429: 'Too many requests. Please wait a moment and try again.',
  
  // 5xx Server Errors
  500: 'Something went wrong on our end. Please try again in a moment.',
  502: 'Service temporarily unavailable. Please try again shortly.',
  503: 'Service is under maintenance. Please try again later.',
  504: 'Request timed out. Please check your connection and try again.',
  
  // Network Errors
  NETWORK_ERROR: 'No internet connection. Please check your network and try again.',
  TIMEOUT: 'Request took too long. Please try again.',
  
  // Generic
  UNKNOWN: 'An unexpected error occurred. Please try again.',
};

/**
 * Get user-friendly error message for a given status code or error code
 * @param status - HTTP status code
 * @param code - Error code from API
 * @returns User-friendly error message
 */
export function getErrorMessage(status?: number, code?: string): string {
  // Check for specific error codes first
  if (code === 'NETWORK_ERROR') return ERROR_MESSAGES.NETWORK_ERROR;
  if (code === 'TIMEOUT' || code === 'ECONNABORTED') return ERROR_MESSAGES.TIMEOUT;
  
  // Check for HTTP status codes
  if (status && ERROR_MESSAGES[status]) {
    return ERROR_MESSAGES[status];
  }
  
  // Return generic error message
  return ERROR_MESSAGES.UNKNOWN;
}

/**
 * Check if an error is retriable (5xx or network errors)
 * @param status - HTTP status code
 * @param code - Error code
 * @returns true if error should be retried
 */
export function isRetriableError(status?: number, code?: string): boolean {
  // Network errors are retriable
  if (code === 'NETWORK_ERROR' || code === 'ECONNABORTED' || code === 'ETIMEDOUT') {
    return true;
  }
  
  // 5xx server errors are retriable
  if (status && status >= 500 && status < 600) {
    return true;
  }
  
  // 429 (rate limit) is retriable with backoff
  if (status === 429) {
    return true;
  }
  
  return false;
}

/**
 * Get retry delay in milliseconds based on attempt number
 * Uses exponential backoff: 1s, 2s, 4s
 * @param attemptNumber - Current retry attempt (1-indexed)
 * @returns Delay in milliseconds
 */
export function getRetryDelay(attemptNumber: number): number {
  return Math.pow(2, attemptNumber) * 1000;
}
