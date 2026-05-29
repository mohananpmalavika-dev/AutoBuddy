/**
 * Background Notification Service
 * Handles notifications even when app is closed or in background
 * Supports both web (Service Worker) and mobile (background tasks)
 */

import { Platform, AppState, DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getQueuedNotifications,
  clearNotificationQueue,
} from './persistentSessionManager';

const LAST_NOTIFICATION_CHECK_KEY = 'autobuddy_last_notification_check_v1';
const CHECK_INTERVAL_MS = 30000; // Check every 30 seconds

class BackgroundNotificationService {
  constructor() {
    this.isInitialized = false;
    this.listeners = new Set();
    this.appStateSubscription = null;
    this.checkTimer = null;
    this.lastCheckTime = 0;
  }

  /**
   * Initialize the service
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    this.isInitialized = true;

    if (Platform.OS === 'web') {
      this.initializeWeb();
    } else {
      this.initializeMobile();
    }
  }

  /**
   * Web-specific initialization (Service Worker)
   */
  initializeWeb() {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    // Listen for notifications from Service Worker
    if ('serviceWorker' in navigator && typeof BroadcastChannel !== 'undefined') {
      try {
        const channel = new BroadcastChannel('autobuddy-notifications');
        channel.onmessage = (event) => {
          if (event.data?.type === 'notification') {
            this.handleNotification(event.data.payload);
          }
        };
      } catch (error) {
        console.error('Error setting up BroadcastChannel:', error);
      }
    }

    // Start polling for notifications
    this.startPolling();
  }

  /**
   * Mobile-specific initialization (background tasks)
   */
  initializeMobile() {
    // Listen to app state changes
    if (AppState) {
      this.appStateSubscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          this.handleAppForeground();
        } else if (state === 'background') {
          this.handleAppBackground();
        }
      });
    }

    // Process queued notifications when app comes to foreground
    this.processQueuedNotifications();
  }

  /**
   * Start polling for new notifications
   */
  startPolling() {
    if (this.checkTimer) {
      return;
    }

    this.checkTimer = setInterval(() => {
      this.checkForNotifications();
    }, CHECK_INTERVAL_MS);

    // Initial check
    this.checkForNotifications();
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /**
   * Check for new notifications from queue
   */
  async checkForNotifications() {
    try {
      const queue = await getQueuedNotifications();
      const lastCheckRaw = await AsyncStorage.getItem(LAST_NOTIFICATION_CHECK_KEY);
      const lastCheck = lastCheckRaw ? parseInt(lastCheckRaw, 10) : 0;

      // Get notifications newer than last check
      const newNotifications = queue.filter((n) => n.queuedAt > lastCheck);

      if (newNotifications.length > 0) {
        newNotifications.forEach((n) => this.handleNotification(n));
        await AsyncStorage.setItem(
          LAST_NOTIFICATION_CHECK_KEY,
          String(Date.now())
        );
      }
    } catch (error) {
      console.error('Error checking for notifications:', error);
    }
  }

  /**
   * Handle app coming to foreground
   */
  async handleAppForeground() {
    // Check for queued notifications
    await this.processQueuedNotifications();

    // Notify listeners of foreground state
    this.notifyListeners({
      type: 'app_foreground',
      timestamp: Date.now(),
    });
  }

  /**
   * Handle app going to background
   */
  handleAppBackground() {
    // Notify listeners
    this.notifyListeners({
      type: 'app_background',
      timestamp: Date.now(),
    });
  }

  /**
   * Process queued notifications when app returns to foreground
   */
  async processQueuedNotifications() {
    try {
      const notifications = await getQueuedNotifications();

      for (const notification of notifications) {
        this.handleNotification(notification);
      }

      // Clear queue after processing
      await clearNotificationQueue();
    } catch (error) {
      console.error('Error processing queued notifications:', error);
    }
  }

  /**
   * Handle a notification
   */
  handleNotification(notification) {
    if (!notification || typeof notification !== 'object') {
      return;
    }

    // Emit to all listeners
    this.notifyListeners({
      type: 'notification',
      payload: notification,
      timestamp: Date.now(),
    });

    // Also emit as device event for React Native
    if (Platform.OS !== 'web') {
      DeviceEventEmitter.emit('autobuddy_notification', notification);
    }
  }

  /**
   * Notify all listeners
   */
  notifyListeners(event) {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error calling notification listener:', error);
      }
    });
  }

  /**
   * Subscribe to notifications
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Get number of queued notifications
   */
  async getQueuedCount() {
    try {
      const notifications = await getQueuedNotifications();
      return notifications.length;
    } catch (error) {
      console.error('Error getting queued notification count:', error);
      return 0;
    }
  }

  /**
   * Cleanup
   */
  destroy() {
    this.stopPolling();

    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    this.listeners.clear();
    this.isInitialized = false;
  }
}

// Singleton instance
let instance = null;

/**
 * Get or create the background notification service
 */
export function getBackgroundNotificationService() {
  if (!instance) {
    instance = new BackgroundNotificationService();
  }
  return instance;
}

/**
 * Initialize background notification service
 */
export async function initializeBackgroundNotifications() {
  const service = getBackgroundNotificationService();
  await service.initialize();
  return service;
}

export default BackgroundNotificationService;
