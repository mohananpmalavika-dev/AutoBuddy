import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiClient, initializeApiClient } from './apiClient';
import { handleApiError, logError } from './errorHandler';

/**
 * Global Setup Integration
 * Initializes all cross-cutting concerns and monitoring systems
 */

// Performance monitoring instance
const performanceMonitoring: any = null;

/**
 * Initialize Performance Monitoring
 */
export const setupPerformanceMonitoring = async () => {
  try {
    // Setup axios interceptors for performance tracking
    const apiClient = getApiClient();

    apiClient.interceptors.request.use((config) => {
      (config as any).metadata = { startTime: Date.now() };
      return config;
    });

    apiClient.interceptors.response.use(
      (response) => {
        const duration = Date.now() - ((response.config as any).metadata?.startTime || Date.now());
        logApiPerformance(response.config.url || '', duration, response.status);
        return response;
      },
      (error) => {
        const duration = Date.now() - ((error.config as any)?.metadata?.startTime || Date.now());
        logApiPerformance(error.config?.url || '', duration, error.response?.status || 500);
        return Promise.reject(error);
      }
    );

    console.log('[Integration] Performance monitoring initialized');
  } catch (err) {
    console.error('[Integration] Failed to setup performance monitoring:', err);
  }
};

/**
 * Log API Performance Metrics
 */
const logApiPerformance = (endpoint: string, duration: number, status: number) => {
  const isError = status >= 400;
  const isSlow = duration > 1000;

  if (isError || isSlow) {
    console.warn(`[Performance] ${endpoint} took ${duration}ms (status: ${status})`);
  }
};

/**
 * Initialize Global Error Handling
 */
export const setupErrorHandling = () => {
  axios.interceptors.response.use(
    (response) => response,
    (error) => {
      const appError = handleApiError(error);
      logError(appError, 'API');
      return Promise.reject(appError);
    }
  );

  console.log('[Integration] Error handling initialized');
};

/**
 * Initialize Cache Management
 */
export const setupCacheManagement = async () => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter((k) => k.startsWith('autobuddy_cache_'));

    // Log cache status
    console.log(`[Integration] Cache initialized with ${cacheKeys.length} entries`);

    // Optionally clear old cache on app startup
    const lastCleanup = await AsyncStorage.getItem('lastCacheCleanup');
    const now = Date.now();
    const cleanupInterval = 24 * 60 * 60 * 1000; // 24 hours

    if (!lastCleanup || now - parseInt(lastCleanup) > cleanupInterval) {
      console.log('[Integration] Running cache cleanup...');
      // Implementation can vary - for now just log
      await AsyncStorage.setItem('lastCacheCleanup', now.toString());
    }
  } catch (err) {
    console.error('[Integration] Cache management setup failed:', err);
  }
};

/**
 * Initialize Authentication State
 */
export const setupAuthentication = async (): Promise<{
  token: string | null;
  userId: string | null;
  userRole: string | null;
}> => {
  try {
    const token = await AsyncStorage.getItem('authToken');
    const userId = await AsyncStorage.getItem('userId');
    const userRole = await AsyncStorage.getItem('userRole');

    if (token && userId) {
      initializeApiClient(token);
      console.log('[Integration] Authentication restored from storage');
    }

    return { token, userId, userRole };
  } catch (err) {
    console.error('[Integration] Authentication setup failed:', err);
    return { token: null, userId: null, userRole: null };
  }
};

/**
 * Initialize Localization
 */
export const setupLocalization = async () => {
  try {
    const savedLanguage = await AsyncStorage.getItem('appLanguage');
    console.log(`[Integration] Localization initialized (language: ${savedLanguage || 'default'})`);
  } catch (err) {
    console.error('[Integration] Localization setup failed:', err);
  }
};

/**
 * Initialize All Systems
 */
export const initializeAllSystems = async () => {
  console.log('[Integration] Starting AutoBuddy initialization...');

  try {
    // 1. Setup error handling
    setupErrorHandling();

    // 2. Setup authentication
    await setupAuthentication();

    // 3. Setup performance monitoring
    setupPerformanceMonitoring();

    // 4. Setup cache management
    await setupCacheManagement();

    // 5. Setup localization
    await setupLocalization();

    console.log('[Integration] ✓ All systems initialized successfully');

    return true;
  } catch (err) {
    console.error('[Integration] ✗ Initialization failed:', err);
    return false;
  }
};

/**
 * Cleanup Systems on App Close
 */
export const cleanupSystems = async () => {
  try {
    console.log('[Integration] Cleaning up systems...');

    // Save any pending state
    await AsyncStorage.setItem('lastAppClose', new Date().toISOString());

    console.log('[Integration] ✓ Cleanup completed');
  } catch (err) {
    console.error('[Integration] Cleanup failed:', err);
  }
};

/**
 * Get Integration Status
 */
export const getIntegrationStatus = async () => {
  try {
    const token = await AsyncStorage.getItem('authToken');
    const language = await AsyncStorage.getItem('appLanguage');
    const cacheKeys = await AsyncStorage.getAllKeys();
    const cacheCount = cacheKeys.filter((k) => k.startsWith('autobuddy_cache_')).length;

    return {
      authenticated: !!token,
      language: language || 'default',
      cacheSize: cacheCount,
      timestamp: new Date(),
    };
  } catch (err) {
    console.error('[Integration] Failed to get status:', err);
    return null;
  }
};

/**
 * Check System Health
 */
export const checkSystemHealth = async (): Promise<{
  status: 'healthy' | 'degraded' | 'offline';
  details: Record<string, any>;
}> => {
  try {
    const client = getApiClient();
    const startTime = Date.now();

    try {
      await client.get('/health');
      const latency = Date.now() - startTime;

      return {
        status: latency > 5000 ? 'degraded' : 'healthy',
        details: {
          apiLatency: latency,
          timestamp: new Date(),
        },
      };
    } catch (err) {
      return {
        status: 'offline',
        details: {
          error: (err as any).message,
          timestamp: new Date(),
        },
      };
    }
  } catch (err) {
    return {
      status: 'offline',
      details: {
        error: 'System check failed',
        timestamp: new Date(),
      },
    };
  }
};

/**
 * Reset All Data (for testing/debugging)
 */
export const resetAllData = async () => {
  try {
    console.log('[Integration] WARNING: Resetting all app data...');

    await AsyncStorage.clear();
    initializeApiClient(null);

    console.log('[Integration] ✓ All data cleared');

    return true;
  } catch (err) {
    console.error('[Integration] Reset failed:', err);
    return false;
  }
};

export default {
  initializeAllSystems,
  cleanupSystems,
  getIntegrationStatus,
  checkSystemHealth,
  resetAllData,
};
