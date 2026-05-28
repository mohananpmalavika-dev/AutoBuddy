# Frontend Error Handling & User Feedback Implementation Guide

## Overview
This guide ensures consistent error handling across the mobile and web frontends with proper user feedback, retry mechanisms, and offline support.

---

## 1. Error Handling Utility

### Create `src/utils/errorHandler.js`

```javascript
export const ERROR_CODES = {
  // Network errors
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  CONNECTION_LOST: 'CONNECTION_LOST',
  
  // Authentication errors
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  
  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_FIELD: 'MISSING_FIELD',
  
  // Business logic errors
  BOOKING_ERROR: 'BOOKING_ERROR',
  PAYMENT_ERROR: 'PAYMENT_ERROR',
  FILE_UPLOAD_ERROR: 'FILE_UPLOAD_ERROR',
  
  // Server errors
  SERVER_ERROR: 'SERVER_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // Unknown error
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};

export const getErrorMessage = (errorCode, context = {}) => {
  const messages = {
    [ERROR_CODES.NETWORK_ERROR]: 'Network connection failed. Please check your internet connection.',
    [ERROR_CODES.TIMEOUT_ERROR]: 'Request timed out. Please try again.',
    [ERROR_CODES.CONNECTION_LOST]: 'Connection lost. You can still use offline features.',
    [ERROR_CODES.INVALID_CREDENTIALS]: 'Invalid email or password. Please try again.',
    [ERROR_CODES.TOKEN_EXPIRED]: 'Your session has expired. Please log in again.',
    [ERROR_CODES.UNAUTHORIZED]: 'You don\'t have permission to access this resource.',
    [ERROR_CODES.VALIDATION_ERROR]: 'Please check your input and try again.',
    [ERROR_CODES.FILE_UPLOAD_ERROR]: `File upload failed. ${context.reason || ''}`,
    [ERROR_CODES.PAYMENT_ERROR]: 'Payment processing failed. Please try again or contact support.',
    [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 'Too many requests. Please wait a few minutes before trying again.',
    [ERROR_CODES.SERVICE_UNAVAILABLE]: 'Service temporarily unavailable. Please try again later.',
    [ERROR_CODES.SERVER_ERROR]: 'Something went wrong. Please try again or contact support.',
    [ERROR_CODES.UNKNOWN_ERROR]: 'An unexpected error occurred. Please try again.',
  };
  
  return messages[errorCode] || messages[ERROR_CODES.UNKNOWN_ERROR];
};

export const parseError = (error) => {
  // API error response
  if (error?.response?.data?.error) {
    return {
      code: error.response.data.error.code || ERROR_CODES.SERVER_ERROR,
      message: error.response.data.error.message,
      statusCode: error.response.status,
      details: error.response.data.error.details || {},
      retryable: error.response.status >= 500 || error.response.status === 429,
      retryAfter: parseInt(error.response.headers['retry-after'] || 0) * 1000,
    };
  }
  
  // Network timeout
  if (error?.code === 'ECONNABORTED') {
    return {
      code: ERROR_CODES.TIMEOUT_ERROR,
      message: getErrorMessage(ERROR_CODES.TIMEOUT_ERROR),
      statusCode: 0,
      retryable: true,
    };
  }
  
  // Network error
  if (!error?.response) {
    return {
      code: ERROR_CODES.NETWORK_ERROR,
      message: getErrorMessage(ERROR_CODES.NETWORK_ERROR),
      statusCode: 0,
      retryable: true,
    };
  }
  
  // Unknown error
  return {
    code: ERROR_CODES.UNKNOWN_ERROR,
    message: error?.message || getErrorMessage(ERROR_CODES.UNKNOWN_ERROR),
    statusCode: error?.response?.status || 0,
    retryable: false,
  };
};

export const shouldRetry = (error, attempt = 1, maxAttempts = 3) => {
  const parsed = parseError(error);
  
  if (!parsed.retryable) return false;
  if (attempt >= maxAttempts) return false;
  
  // Don't retry rate limit on first attempt, wait before retry
  if (parsed.code === ERROR_CODES.RATE_LIMIT_EXCEEDED && attempt === 1) {
    return false;
  }
  
  return true;
};
```

---

## 2. Retry Mechanism with Exponential Backoff

### Create `src/utils/retryHandler.js`

```javascript
export class RetryConfig {
  constructor(options = {}) {
    this.maxAttempts = options.maxAttempts || 3;
    this.initialDelayMs = options.initialDelayMs || 100;
    this.maxDelayMs = options.maxDelayMs || 5000;
    this.exponentialBase = options.exponentialBase || 2;
    this.jitter = options.jitter !== false; // default true
  }
  
  getDelay(attempt) {
    let delayMs = this.initialDelayMs * Math.pow(this.exponentialBase, attempt);
    delayMs = Math.min(delayMs, this.maxDelayMs);
    
    if (this.jitter) {
      delayMs *= Math.random() * 0.5 + 0.75; // 75%-125%
    }
    
    return Math.round(delayMs);
  }
}

export async function retryWithBackoff(
  fn,
  config = new RetryConfig(),
  onRetry = null
) {
  let lastError;
  
  for (let attempt = 0; attempt < config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt < config.maxAttempts - 1) {
        const delay = config.getDelay(attempt);
        
        if (onRetry) {
          onRetry({
            attempt: attempt + 1,
            maxAttempts: config.maxAttempts,
            delay,
            error,
          });
        }
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}
```

---

## 3. API Client with Error Handling

### Update API client to include error handling:

```javascript
const API_TIMEOUT = 30000; // 30 seconds

export const apiCall = async (endpoint, options = {}) => {
  const {
    method = 'GET',
    body = null,
    headers = {},
    timeout = API_TIMEOUT,
    retryConfig = new RetryConfig({ maxAttempts: 3 }),
    onProgress = null,
  } = options;
  
  return retryWithBackoff(
    async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      
      try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
          method,
          headers: {
            'Content-Type': 'application/json',
            ...headers,
          },
          body: body ? JSON.stringify(body) : null,
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        
        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = response.headers.get('retry-after');
          const error = new Error('Rate limited');
          error.response = {
            status: 429,
            headers: { 'retry-after': retryAfter || '60' },
          };
          throw error;
        }
        
        // Handle successful response
        const data = await response.json();
        
        if (!response.ok) {
          throw {
            response: {
              status: response.status,
              data,
            },
          };
        }
        
        return data;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    },
    retryConfig,
    ({ attempt, maxAttempts, delay }) => {
      onProgress?.({
        type: 'retry',
        attempt,
        maxAttempts,
        delay,
      });
    }
  );
};
```

---

## 4. File Upload with Progress & Error Handling

### Create `src/hooks/useFileUpload.js`

```javascript
import { useState, useCallback } from 'react';
import { parseError, ERROR_CODES } from '../utils/errorHandler';

export const useFileUpload = () => {
  const [uploadProgress, setUploadProgress] = useState({});
  const [uploadErrors, setUploadErrors] = useState({});
  
  const uploadFile = useCallback(async (file, uploadId) => {
    const formData = new FormData();
    formData.append('file', file);
    
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      // Track upload progress
      xhr.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          setUploadProgress(prev => ({
            ...prev,
            [uploadId]: percentComplete,
          }));
        }
      });
      
      // Handle error
      xhr.addEventListener('error', () => {
        setUploadErrors(prev => ({
          ...prev,
          [uploadId]: parseError({ code: 'ECONNABORTED' }),
        }));
        reject(new Error('Upload failed'));
      });
      
      // Handle abort
      xhr.addEventListener('abort', () => {
        setUploadErrors(prev => ({
          ...prev,
          [uploadId]: { code: ERROR_CODES.NETWORK_ERROR, message: 'Upload cancelled' },
        }));
        reject(new Error('Upload cancelled'));
      });
      
      // Handle completion
      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          setUploadProgress(prev => ({
            ...prev,
            [uploadId]: 100,
          }));
          resolve(JSON.parse(xhr.responseText));
        } else {
          const error = parseError({
            response: {
              status: xhr.status,
              data: JSON.parse(xhr.responseText),
            },
          });
          setUploadErrors(prev => ({
            ...prev,
            [uploadId]: error,
          }));
          reject(error);
        }
      });
      
      xhr.open('POST', `/api/upload`);
      xhr.send(formData);
    });
  }, []);
  
  return {
    uploadFile,
    uploadProgress,
    uploadErrors,
  };
};
```

---

## 5. Offline Support

### Create `src/utils/offlineStorage.js`

```javascript
const OFFLINE_KEY_PREFIX = 'offline_queue:';

export const offlineQueue = {
  add: async (operation) => {
    const queue = await getQueue();
    queue.push({
      id: Date.now(),
      timestamp: new Date().toISOString(),
      ...operation,
    });
    await saveQueue(queue);
  },
  
  getAll: async () => {
    return getQueue();
  },
  
  remove: async (operationId) => {
    let queue = await getQueue();
    queue = queue.filter(op => op.id !== operationId);
    await saveQueue(queue);
  },
  
  clear: async () => {
    await saveQueue([]);
  },
};

const getQueue = async () => {
  try {
    const data = localStorage.getItem(`${OFFLINE_KEY_PREFIX}queue`);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

const saveQueue = async (queue) => {
  localStorage.setItem(`${OFFLINE_KEY_PREFIX}queue`, JSON.stringify(queue));
};

// Sync offline operations when online
export const syncOfflineOperations = async (apiCall) => {
  const queue = await offlineQueue.getAll();
  
  for (const operation of queue) {
    try {
      await apiCall(operation.endpoint, {
        method: operation.method,
        body: operation.body,
      });
      await offlineQueue.remove(operation.id);
    } catch (error) {
      console.error('Sync failed:', error);
      // Continue with next operation
    }
  }
};
```

---

## 6. Component: Loading State with Retry

### Create `src/components/AsyncComponent.jsx`

```javascript
import React, { useState, useEffect } from 'react';
import { ActivityIndicator, View, Text, TouchableOpacity } from 'react-native';
import { parseError, getErrorMessage } from '../utils/errorHandler';
import { retryWithBackoff } from '../utils/retryHandler';

export const AsyncComponent = ({ 
  fetchFn, 
  renderSuccess, 
  renderError, 
  renderLoading = null 
}) => {
  const [state, setState] = useState({
    loading: true,
    data: null,
    error: null,
    retrying: false,
  });
  
  const load = async () => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const data = await retryWithBackoff(fetchFn);
      setState({ loading: false, data, error: null, retrying: false });
    } catch (error) {
      const parsedError = parseError(error);
      setState({
        loading: false,
        data: null,
        error: parsedError,
        retrying: false,
      });
    }
  };
  
  useEffect(() => {
    load();
  }, []);
  
  if (state.loading) {
    return renderLoading ? (
      renderLoading()
    ) : (
      <View style={{ justifyContent: 'center', alignItems: 'center', flex: 1 }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }
  
  if (state.error) {
    return renderError ? (
      renderError(state.error, load)
    ) : (
      <View style={{ padding: 20, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 16, color: 'red', marginBottom: 10 }}>
          {getErrorMessage(state.error.code)}
        </Text>
        <TouchableOpacity
          onPress={load}
          style={{
            paddingHorizontal: 20,
            paddingVertical: 10,
            backgroundColor: '#007AFF',
            borderRadius: 5,
          }}
        >
          <Text style={{ color: 'white', fontWeight: 'bold' }}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }
  
  return renderSuccess(state.data);
};
```

---

## 7. Implementation Checklist

- [ ] Update API client with comprehensive error handling
- [ ] Implement retry logic with exponential backoff
- [ ] Add file upload progress tracking
- [ ] Implement offline queue and sync mechanism
- [ ] Add error boundaries in React components
- [ ] Test network failures and timeouts
- [ ] Test file upload failures and recovery
- [ ] Test offline mode and sync
- [ ] Add user-facing error messages
- [ ] Test rate limiting handling

---

**Last Updated:** 2026-05-29
