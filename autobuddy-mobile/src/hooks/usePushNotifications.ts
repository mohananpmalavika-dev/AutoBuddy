import { useEffect, useRef, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import {
  initializeFirebase,
  getFirebaseToken,
  setupMessageListener,
  registerDeviceToken,
  setupLocalNotifications,
  setupNotificationTapListener,
  sendLocalNotification,
} from '../lib/firebase-config';
import { useAppSession } from './useAppSession';
import { apiRequest } from '../lib/api-client';

export interface PushNotification {
  id: string;
  title: string;
  body: string;
  type:
    | 'ride_request'
    | 'ride_accepted'
    | 'ride_completed'
    | 'earnings_update'
    | 'incentive'
    | 'system_alert'
    | 'promotion'
    | 'other';
  severity?: 'critical' | 'high' | 'medium' | 'low';
  data?: Record<string, any>;
  timestamp: Date;
  read?: boolean;
}

interface NotificationHistory {
  notifications: PushNotification[];
  unreadCount: number;
}

/**
 * Hook to manage push notifications
 */
export function usePushNotifications() {
  const { session } = useAppSession();
  const [isInitialized, setIsInitialized] = useState(false);
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<PushNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<Error | null>(null);
  const setupCompleteRef = useRef(false);
  const messageListenerRef = useRef<(() => void) | null>(null);
  const tapListenerRef = useRef<(() => void) | null>(null);

  // Initialize Firebase and push notifications
  useEffect(() => {
    if (!session || setupCompleteRef.current) {
      return;
    }

    setupCompleteRef.current = true;

    const setupPushNotifications = async () => {
      try {
        // Initialize Firebase
        initializeFirebase();
        setupLocalNotifications();

        // Get FCM token
        const token = await getFirebaseToken();
        if (token) {
          setFcmToken(token);

          // Store token locally
          await SecureStore.setItemAsync('fcm_token', token);

          // Register token with backend
          await registerDeviceToken(session.user.id, token, session.user.role, apiRequest);
        }

        // Setup message listener for foreground messages
        const unsubscribeMessages = setupMessageListener((payload) => {
          handleIncomingNotification(payload);
        });

        if (unsubscribeMessages) {
          messageListenerRef.current = unsubscribeMessages;
        }

        // Setup notification tap listener
        const unsubscribeTaps = setupNotificationTapListener((notification) => {
          handleNotificationTap(notification);
        });

        if (unsubscribeTaps) {
          tapListenerRef.current = unsubscribeTaps;
        }

        // Load notification history
        await loadNotificationHistory();

        setIsInitialized(true);
        console.log('[PushNotifications] Setup complete');
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        console.error('[PushNotifications] Setup failed:', error);
      }
    };

    setupPushNotifications();

    // Cleanup
    return () => {
      if (messageListenerRef.current) {
        messageListenerRef.current();
      }
      if (tapListenerRef.current) {
        tapListenerRef.current();
      }
    };
  }, [session]);

  // Handle incoming notification
  const handleIncomingNotification = useCallback((payload: any) => {
    const { notification, data } = payload;

    const notif: PushNotification = {
      id: `notif_${Date.now()}`,
      title: notification?.title || 'Notification',
      body: notification?.body || '',
      type: data?.type || 'other',
      severity: data?.severity,
      data: data || {},
      timestamp: new Date(),
      read: false,
    };

    // Add to notifications list
    setNotifications((prev) => [notif, ...prev].slice(0, 100));
    setUnreadCount((prev) => prev + 1);

    // Show local notification if app is in foreground
    if (notification) {
      sendLocalNotification(notification.title, notification.body, data);
    }

    console.log('[PushNotifications] Notification received:', notif);
  }, []);

  // Handle notification tap
  const handleNotificationTap = useCallback((notification: any) => {
    const type = notification.request?.content?.data?.type;

    console.log('[PushNotifications] Notification tapped:', type);

    // Route based on notification type
    switch (type) {
      case 'ride_request':
        // Show ride request modal
        console.log('[Routing] Navigate to ride request');
        break;

      case 'ride_accepted':
        // Navigate to tracking screen
        console.log('[Routing] Navigate to ride tracking');
        break;

      case 'ride_completed':
        // Navigate to ratings/completion screen
        console.log('[Routing] Navigate to ride completion');
        break;

      case 'earnings_update':
        // Navigate to earnings dashboard
        console.log('[Routing] Navigate to earnings');
        break;

      case 'incentive':
        // Show incentive modal
        console.log('[Routing] Show incentive modal');
        break;

      case 'system_alert':
        // Show alert details
        console.log('[Routing] Show alert details');
        break;

      case 'promotion':
        // Navigate to promos/deals
        console.log('[Routing] Navigate to promotions');
        break;

      default:
        console.log('[Routing] No specific handler for:', type);
    }
  }, []);

  // Load notification history from storage
  const loadNotificationHistory = async () => {
    try {
      const history = await SecureStore.getItemAsync('notification_history');
      if (history) {
        const parsed = JSON.parse(history);
        setNotifications(parsed);
        const unread = parsed.filter((n: PushNotification) => !n.read).length;
        setUnreadCount(unread);
      }
    } catch (err) {
      console.error('[PushNotifications] Failed to load history:', err);
    }
  };

  // Save notification history
  const saveNotificationHistory = useCallback(async (notifs: PushNotification[]) => {
    try {
      await SecureStore.setItemAsync('notification_history', JSON.stringify(notifs));
    } catch (err) {
      console.error('[PushNotifications] Failed to save history:', err);
    }
  }, []);

  // Mark notification as read
  const markAsRead = useCallback((notifId: string) => {
    setNotifications((prev) => {
      const updated = prev.map((n) =>
        n.id === notifId ? { ...n, read: true } : n
      );

      setUnreadCount((count) => Math.max(0, count - 1));
      saveNotificationHistory(updated);

      return updated;
    });
  }, [saveNotificationHistory]);

  // Mark all as read
  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => {
      const updated = prev.map((n) => ({ ...n, read: true }));
      saveNotificationHistory(updated);
      return updated;
    });

    setUnreadCount(0);
  }, [saveNotificationHistory]);

  // Clear notifications
  const clearNotifications = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
    saveNotificationHistory([]);
  }, [saveNotificationHistory]);

  // Remove notification
  const removeNotification = useCallback(
    (notifId: string) => {
      setNotifications((prev) => {
        const updated = prev.filter((n) => n.id !== notifId);
        saveNotificationHistory(updated);

        const wasUnread = prev.find((n) => n.id === notifId)?.read === false;
        if (wasUnread) {
          setUnreadCount((count) => Math.max(0, count - 1));
        }

        return updated;
      });
    },
    [saveNotificationHistory]
  );

  // Get notifications by type
  const getNotificationsByType = useCallback((type: PushNotification['type']) => {
    return notifications.filter((n) => n.type === type);
  }, [notifications]);

  // Get critical notifications
  const getCriticalNotifications = useCallback(() => {
    return notifications.filter((n) => n.severity === 'critical');
  }, [notifications]);

  return {
    isInitialized,
    fcmToken,
    notifications,
    unreadCount,
    error,
    markAsRead,
    markAllAsRead,
    clearNotifications,
    removeNotification,
    getNotificationsByType,
    getCriticalNotifications,
  };
}

export default usePushNotifications;
