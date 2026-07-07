/**
 * Safe AsyncStorage Utilities
 * 
 * Provides safe wrappers for AsyncStorage operations with comprehensive error handling.
 * Prevents crashes from storage quota exceeded, permissions, or other storage failures.
 * 
 * Created as part of BUG-006 fix - AsyncStorage error handling.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface StorageResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Safely get item from AsyncStorage
 * @param key - Storage key
 * @param defaultValue - Default value if key doesn't exist or error occurs
 * @returns Storage result with data or error
 */
export async function safeGetItem<T = string>(
  key: string,
  defaultValue?: T
): Promise<StorageResult<T>> {
  try {
    if (!key || typeof key !== 'string') {
      return {
        success: false,
        error: 'Invalid storage key',
      };
    }

    const value = await AsyncStorage.getItem(key);
    
    if (value === null) {
      return {
        success: true,
        data: defaultValue,
      };
    }

    // Try to parse as JSON if it looks like JSON
    if (value.startsWith('{') || value.startsWith('[')) {
      try {
        const parsed = JSON.parse(value) as T;
        return {
          success: true,
          data: parsed,
        };
      } catch {
        // Not JSON, return as string
        return {
          success: true,
          data: value as T,
        };
      }
    }

    return {
      success: true,
      data: value as T,
    };
  } catch (error: any) {
    console.error('[SafeStorage] Error getting item:', key, error);
    return {
      success: false,
      data: defaultValue,
      error: getStorageErrorMessage(error),
    };
  }
}

/**
 * Safely set item in AsyncStorage
 * @param key - Storage key
 * @param value - Value to store (will be JSON stringified if object)
 * @returns Storage result
 */
export async function safeSetItem<T = any>(
  key: string,
  value: T
): Promise<StorageResult<void>> {
  try {
    if (!key || typeof key !== 'string') {
      return {
        success: false,
        error: 'Invalid storage key',
      };
    }

    if (value === undefined) {
      return {
        success: false,
        error: 'Cannot store undefined value',
      };
    }

    let stringValue: string;
    
    if (typeof value === 'string') {
      stringValue = value;
    } else {
      try {
        stringValue = JSON.stringify(value);
      } catch (error) {
        return {
          success: false,
          error: 'Failed to serialize value',
        };
      }
    }

    // Check if storage might be full (approximate check)
    if (stringValue.length > 2 * 1024 * 1024) { // 2MB warning
      console.warn('[SafeStorage] Large item being stored:', key, `${(stringValue.length / 1024).toFixed(0)}KB`);
    }

    await AsyncStorage.setItem(key, stringValue);
    
    return {
      success: true,
    };
  } catch (error: any) {
    console.error('[SafeStorage] Error setting item:', key, error);
    
    // Try to clear some space if quota exceeded
    if (isQuotaExceeded(error)) {
      console.warn('[SafeStorage] Storage quota exceeded, attempting cleanup...');
      await attemptStorageCleanup();
    }
    
    return {
      success: false,
      error: getStorageErrorMessage(error),
    };
  }
}

/**
 * Safely remove item from AsyncStorage
 * @param key - Storage key to remove
 * @returns Storage result
 */
export async function safeRemoveItem(key: string): Promise<StorageResult<void>> {
  try {
    if (!key || typeof key !== 'string') {
      return {
        success: false,
        error: 'Invalid storage key',
      };
    }

    await AsyncStorage.removeItem(key);
    
    return {
      success: true,
    };
  } catch (error: any) {
    console.error('[SafeStorage] Error removing item:', key, error);
    return {
      success: false,
      error: getStorageErrorMessage(error),
    };
  }
}

/**
 * Safely clear all AsyncStorage data
 * @returns Storage result
 */
export async function safeClearAll(): Promise<StorageResult<void>> {
  try {
    await AsyncStorage.clear();
    
    return {
      success: true,
    };
  } catch (error: any) {
    console.error('[SafeStorage] Error clearing storage:', error);
    return {
      success: false,
      error: getStorageErrorMessage(error),
    };
  }
}

/**
 * Safely get multiple items from AsyncStorage
 * @param keys - Array of storage keys
 * @returns Storage result with key-value pairs
 */
export async function safeMultiGet(
  keys: string[]
): Promise<StorageResult<Record<string, string>>> {
  try {
    if (!Array.isArray(keys) || keys.length === 0) {
      return {
        success: false,
        error: 'Invalid keys array',
      };
    }

    const results = await AsyncStorage.multiGet(keys);
    const data: Record<string, string> = {};
    
    for (const [key, value] of results) {
      if (value !== null) {
        data[key] = value;
      }
    }
    
    return {
      success: true,
      data,
    };
  } catch (error: any) {
    console.error('[SafeStorage] Error getting multiple items:', error);
    return {
      success: false,
      error: getStorageErrorMessage(error),
    };
  }
}

/**
 * Safely set multiple items in AsyncStorage
 * @param keyValuePairs - Array of [key, value] pairs
 * @returns Storage result
 */
export async function safeMultiSet(
  keyValuePairs: Array<[string, string]>
): Promise<StorageResult<void>> {
  try {
    if (!Array.isArray(keyValuePairs) || keyValuePairs.length === 0) {
      return {
        success: false,
        error: 'Invalid key-value pairs array',
      };
    }

    await AsyncStorage.multiSet(keyValuePairs);
    
    return {
      success: true,
    };
  } catch (error: any) {
    console.error('[SafeStorage] Error setting multiple items:', error);
    
    if (isQuotaExceeded(error)) {
      await attemptStorageCleanup();
    }
    
    return {
      success: false,
      error: getStorageErrorMessage(error),
    };
  }
}

/**
 * Get all keys from AsyncStorage
 * @returns Storage result with array of keys
 */
export async function safeGetAllKeys(): Promise<StorageResult<string[]>> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    
    return {
      success: true,
      data: Array.from(keys),
    };
  } catch (error: any) {
    console.error('[SafeStorage] Error getting all keys:', error);
    return {
      success: false,
      error: getStorageErrorMessage(error),
    };
  }
}

/**
 * Check if storage quota is exceeded error
 * @param error - Error object
 * @returns true if quota exceeded
 */
function isQuotaExceeded(error: any): boolean {
  const message = error?.message?.toLowerCase() || '';
  return (
    message.includes('quota') ||
    message.includes('exceeded') ||
    message.includes('full') ||
    message.includes('space')
  );
}

/**
 * Get user-friendly error message for storage errors
 * @param error - Error object
 * @returns User-friendly error message
 */
function getStorageErrorMessage(error: any): string {
  const message = error?.message?.toLowerCase() || '';
  
  if (isQuotaExceeded(error)) {
    return 'Storage is full. Please free up some space.';
  }
  
  if (message.includes('permission')) {
    return 'Storage permission denied. Please check app settings.';
  }
  
  if (message.includes('not available') || message.includes('unavailable')) {
    return 'Storage is not available. Please try again.';
  }
  
  return 'Failed to access storage. Please try again.';
}

/**
 * Attempt to cleanup old storage items
 * This is a basic cleanup - apps should implement their own strategy
 */
async function attemptStorageCleanup(): Promise<void> {
  try {
    console.log('[SafeStorage] Attempting storage cleanup...');
    
    // Get all keys
    const keysResult = await safeGetAllKeys();
    if (!keysResult.success || !keysResult.data) {
      return;
    }
    
    // Remove temporary or cache items
    const keysToRemove = keysResult.data.filter(key => 
      key.startsWith('temp_') || 
      key.startsWith('cache_') ||
      key.includes('_expired')
    );
    
    if (keysToRemove.length > 0) {
      console.log(`[SafeStorage] Removing ${keysToRemove.length} temporary items`);
      await AsyncStorage.multiRemove(keysToRemove);
    }
  } catch (error) {
    console.error('[SafeStorage] Cleanup failed:', error);
  }
}

/**
 * Check if AsyncStorage is available
 * @returns true if storage is accessible
 */
export async function isStorageAvailable(): Promise<boolean> {
  try {
    const testKey = '__storage_test__';
    await AsyncStorage.setItem(testKey, 'test');
    await AsyncStorage.removeItem(testKey);
    return true;
  } catch (error) {
    console.error('[SafeStorage] Storage not available:', error);
    return false;
  }
}

/**
 * Get approximate storage usage (requires getting all items)
 * WARNING: This can be slow for large storage
 * @returns Approximate size in bytes
 */
export async function getStorageSize(): Promise<number> {
  try {
    const keys = await AsyncStorage.getAllKeys();
    if (keys.length === 0) return 0;
    
    const items = await AsyncStorage.multiGet(keys);
    let totalSize = 0;
    
    for (const [key, value] of items) {
      if (value) {
        totalSize += key.length + value.length;
      }
    }
    
    return totalSize;
  } catch (error) {
    console.error('[SafeStorage] Error calculating storage size:', error);
    return 0;
  }
}
