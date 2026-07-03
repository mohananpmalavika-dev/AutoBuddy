/**
 * Safe Async Hook
 * 
 * Wraps async functions with comprehensive error handling.
 * Provides loading states, error states, and automatic error alerts.
 * 
 * Created as part of BUG-005 fix - Missing try-catch blocks.
 */

import { useState, useCallback } from 'react';
import { Alert } from 'react-native';

interface UseSafeAsyncOptions {
  /** Custom error message to show user (overrides API error message) */
  errorMessage?: string;
  /** Whether to show alert on error (default: true) */
  showAlert?: boolean;
  /** Callback function to run on error */
  onError?: (error: any) => void;
  /** Callback function to run on success */
  onSuccess?: (result: any) => void;
}

interface UseSafeAsyncReturn<T, Args extends any[]> {
  /** Execute the async function with error handling */
  execute: (...args: Args) => Promise<T | null>;
  /** Loading state */
  loading: boolean;
  /** Error message (null if no error) */
  error: string | null;
  /** Clear error state */
  clearError: () => void;
}

/**
 * Hook to safely execute async functions with error handling
 * 
 * @param asyncFn - The async function to wrap
 * @param options - Configuration options
 * @returns Object with execute function, loading state, and error state
 * 
 * @example
 * const { execute: fetchData, loading, error } = useSafeAsync(
 *   myApiCall,
 *   { errorMessage: 'Failed to load data' }
 * );
 * 
 * const handleClick = async () => {
 *   const result = await fetchData(arg1, arg2);
 *   if (result) {
 *     // Success - use result
 *   }
 * };
 */
export function useSafeAsync<T, Args extends any[]>(
  asyncFn: (...args: Args) => Promise<T>,
  options: UseSafeAsyncOptions = {}
): UseSafeAsyncReturn<T, Args> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const {
    errorMessage: customErrorMessage,
    showAlert = true,
    onError,
    onSuccess,
  } = options;
  
  const execute = useCallback(
    async (...args: Args): Promise<T | null> => {
      setLoading(true);
      setError(null);
      
      try {
        const result = await asyncFn(...args);
        
        // Call success callback if provided
        if (onSuccess) {
          try {
            onSuccess(result);
          } catch (callbackError) {
            console.error('[useSafeAsync] Success callback error:', callbackError);
          }
        }
        
        return result;
      } catch (err: any) {
        // Extract error message
        const errorMsg = customErrorMessage || 
                        err?.userMessage || 
                        err?.message || 
                        'An unexpected error occurred';
        
        // Set error state
        setError(errorMsg);
        
        // Log error for debugging
        console.error('[useSafeAsync] Error:', {
          message: errorMsg,
          code: err?.code,
          status: err?.status,
          originalError: err,
        });
        
        // Call error callback if provided
        if (onError) {
          try {
            onError(err);
          } catch (callbackError) {
            console.error('[useSafeAsync] Error callback error:', callbackError);
          }
        }
        
        // Show alert if enabled
        if (showAlert) {
          Alert.alert('Error', errorMsg);
        }
        
        return null;
      } finally {
        setLoading(false);
      }
    },
    [asyncFn, customErrorMessage, showAlert, onError, onSuccess]
  );
  
  const clearError = useCallback(() => {
    setError(null);
  }, []);
  
  return {
    execute,
    loading,
    error,
    clearError,
  };
}

/**
 * Variant that doesn't show alerts automatically
 * Useful when you want to handle errors in UI differently
 */
export function useSafeAsyncSilent<T, Args extends any[]>(
  asyncFn: (...args: Args) => Promise<T>,
  options: Omit<UseSafeAsyncOptions, 'showAlert'> = {}
): UseSafeAsyncReturn<T, Args> {
  return useSafeAsync(asyncFn, { ...options, showAlert: false });
}

/**
 * Variant for mutations (POST, PUT, DELETE) with success message
 */
export function useSafeMutation<T, Args extends any[]>(
  asyncFn: (...args: Args) => Promise<T>,
  options: UseSafeAsyncOptions & { successMessage?: string } = {}
): UseSafeAsyncReturn<T, Args> {
  const { successMessage, onSuccess, ...restOptions } = options;
  
  return useSafeAsync(asyncFn, {
    ...restOptions,
    onSuccess: (result) => {
      if (successMessage) {
        Alert.alert('Success', successMessage);
      }
      if (onSuccess) {
        onSuccess(result);
      }
    },
  });
}
