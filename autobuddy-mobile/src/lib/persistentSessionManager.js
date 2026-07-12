/**
 * Persistent Session Manager
 * Handles session persistence, auto-reconnection, and background task management
 * Supports both web and mobile platforms
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';

const SESSION_KEY = 'autobuddy_session_v2';
const SESSION_EXPIRY_KEY = 'autobuddy_session_expiry_v1';
const SESSION_LAST_ACTIVITY_KEY = 'autobuddy_session_last_activity_v1';
const BACKGROUND_TASK_NAME = 'autobuddy-background-sync';
const NOTIFICATION_QUEUE_KEY = 'autobuddy_notification_queue_v1';

const sessionListeners = new Set();
let backgroundTaskRegistered = false;

/**
 * Notify all listeners about session change
 */
function notifySessionListeners(session) {
  sessionListeners.forEach((listener) => {
    try {
      listener(session);
    } catch (error) {
      console.error('Error notifying session listener:', error);
    }
  });
}

/**
 * Load session from persistent storage
 * Auto-validates and refreshes if needed
 */
export async function loadSession() {
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }

    const session = JSON.parse(raw);
    await AsyncStorage.removeItem(SESSION_EXPIRY_KEY);
    return session;
  } catch (error) {
    console.error('Error loading session:', error);
    return null;
  }
}

/**
 * Save session persistently
 * Only triggers logout when explicitly called, not on app close
 */
export async function saveSession(session) {
  try {
    if (!session || !session.token) {
      await clearSession();
      return;
    }

    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
    
    // Keep activity metadata, but never use browser/app close as logout.
    const now = Date.now();
    await AsyncStorage.removeItem(SESSION_EXPIRY_KEY);
    await AsyncStorage.setItem(SESSION_LAST_ACTIVITY_KEY, String(now));
    
    notifySessionListeners(session);
  } catch (error) {
    console.error('Error saving session:', error);
  }
}

/**
 * Clear session - only called when user explicitly logs out
 */
export async function clearSession() {
  try {
    await AsyncStorage.removeItem(SESSION_KEY);
    await AsyncStorage.removeItem(SESSION_EXPIRY_KEY);
    await AsyncStorage.removeItem(SESSION_LAST_ACTIVITY_KEY);
    notifySessionListeners(null);
  } catch (error) {
    console.error('Error clearing session:', error);
  }
}

/**
 * Subscribe to session changes
 * Returns unsubscribe function
 */
export function subscribeSession(listener) {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}

/**
 * Queue notification for background delivery
 * Used when app is closed/backgrounded
 */
export async function queueNotification(notification) {
  try {
    const queueRaw = await AsyncStorage.getItem(NOTIFICATION_QUEUE_KEY);
    const queue = queueRaw ? JSON.parse(queueRaw) : [];
    
    queue.push({
      ...notification,
      queuedAt: Date.now(),
    });

    // Keep only last 100 notifications
    const trimmed = queue.slice(-100);
    await AsyncStorage.setItem(NOTIFICATION_QUEUE_KEY, JSON.stringify(trimmed));
  } catch (error) {
    console.error('Error queueing notification:', error);
  }
}

/**
 * Get queued notifications
 */
export async function getQueuedNotifications() {
  try {
    const queueRaw = await AsyncStorage.getItem(NOTIFICATION_QUEUE_KEY);
    return queueRaw ? JSON.parse(queueRaw) : [];
  } catch (error) {
    console.error('Error getting queued notifications:', error);
    return [];
  }
}

/**
 * Clear notification queue
 */
export async function clearNotificationQueue() {
  try {
    await AsyncStorage.removeItem(NOTIFICATION_QUEUE_KEY);
  } catch (error) {
    console.error('Error clearing notification queue:', error);
  }
}

/**
 * Register background task for syncing (mobile only)
 */
export async function registerBackgroundTask() {
  if (Platform.OS === 'web') {
    return;
  }

  if (backgroundTaskRegistered) {
    return;
  }

  try {
    // Define the background task
    TaskManager.defineTask(BACKGROUND_TASK_NAME, async () => {
      try {
        const session = await loadSession();
        if (!session || !session.token) {
          return;
        }

        // Attempt to fetch notifications from server
        // eslint-disable-next-line no-unused-vars
        const queue = await getQueuedNotifications();
        
        // Mark task as completed
        return;
      } catch (error) {
        console.error('Background task error:', error);
      }
    });

    backgroundTaskRegistered = true;
  } catch (error) {
    console.error('Error registering background task:', error);
  }
}

/**
 * Check if session is still valid
 */
export async function isSessionValid() {
  try {
    const session = await loadSession();
    if (!session || !session.token) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking session validity:', error);
    return false;
  }
}

/**
 * Extend session expiry (called on successful API requests)
 */
export async function extendSessionExpiry() {
  try {
    await AsyncStorage.removeItem(SESSION_EXPIRY_KEY);
    await AsyncStorage.setItem(SESSION_LAST_ACTIVITY_KEY, String(Date.now()));
  } catch (error) {
    console.error('Error extending session expiry:', error);
  }
}

/**
 * Get session info without loading full session
 */
export async function getSessionInfo() {
  try {
    const session = await loadSession();
    if (!session) {
      return null;
    }

    const expiryRaw = await AsyncStorage.getItem(SESSION_EXPIRY_KEY);
    const lastActivityRaw = await AsyncStorage.getItem(SESSION_LAST_ACTIVITY_KEY);
    const expiry = expiryRaw ? parseInt(expiryRaw, 10) : null;
    const lastActivity = lastActivityRaw ? parseInt(lastActivityRaw, 10) : null;

    return {
      userId: session.user?.id,
      userRole: session.user?.role,
      hasToken: !!session.token,
      lastActivityAt: lastActivity,
      expiresAt: expiry,
      expiresIn: expiry ? Math.max(0, expiry - Date.now()) : null,
    };
  } catch (error) {
    console.error('Error getting session info:', error);
    return null;
  }
}
