import { useEffect, useRef, useCallback, useState } from 'react';
import messaging from '@react-native-firebase/messaging';
import { Alert, AppState, AppStateStatus, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface NotificationData {
  title: string;
  body: string;
  data?: Record<string, string>;
}

interface DeviceRegistration {
  user_id: string;
  device_id: string;
  fcm_token: string;
  device_type: 'android' | 'ios';
  app_version: string;
  os_version: string;
}

/**
 * Hook for managing Firebase Cloud Messaging push notifications
 * Handles:
 * - FCM token registration and refresh
 * - Topic-based subscriptions
 * - Foreground/background notification handling
 * - Badge count management
 * - Heartbeat for token validation
 * - Automatic retry on delivery failures
 */
export const usePushNotifications = (userId: string | null, token: string | null) => {
  const appState = useRef(AppState.currentState);
  const [notificationCount, setNotificationCount] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<'granted' | 'denied' | 'pending'>('pending');
  const notificationListenerRef = useRef<(() => void) | null>(null);
  const foregroundListenerRef = useRef<(() => void) | null>(null);

  // Request notification permissions
  const requestPermissions = useCallback(async () => {
    try {
      const authStatus = await messaging().requestPermission();
      const enabled =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      setNotificationPermission(enabled ? 'granted' : 'denied');
      return enabled;
    } catch (error) {
      console.error('Permission request error:', error);
      setNotificationPermission('denied');
      return false;
    }
  }, []);

  // Register device with backend
  const registerDevice = useCallback(async (fcmToken: string) => {
    if (!userId || !token) {
      console.warn('Cannot register device: userId or token missing');
      return;
    }

    try {
      const deviceId = await getDeviceId();
      const registration: DeviceRegistration = {
        user_id: userId,
        device_id: deviceId,
        fcm_token: fcmToken,
        device_type: Platform.OS as 'android' | 'ios',
        app_version: '1.0.0',
        os_version: Platform.Version.toString(),
      };

      const response = await axios.post(
        `${API_BASE_URL}/api/v3/notifications/register-device`,
        registration,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log('Device registered:', response.data.token_id);
      await AsyncStorage.setItem('fcm_token', fcmToken);
      setFcmToken(fcmToken);

      return response.data.token_id;
    } catch (error) {
      console.error('Device registration error:', error);
      // Retry after 5 seconds
      setTimeout(() => registerDevice(fcmToken), 5000);
    }
  }, [userId, token]);

  // Subscribe to notification topics
  const subscribeTo = useCallback(async (topics: string[]) => {
    if (!userId || !token) return;

    try {
      await axios.post(
        `${API_BASE_URL}/api/v3/notifications/subscribe?user_id=${userId}`,
        { topics },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log('Subscribed to topics:', topics);
    } catch (error) {
      console.error('Subscription error:', error);
    }
  }, [userId, token]);

  // Send heartbeat to validate token
  const sendHeartbeat = useCallback(async () => {
    if (!userId || !token) return;

    try {
      await axios.post(
        `${API_BASE_URL}/api/v3/notifications/heartbeat/${userId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (error) {
      console.error('Heartbeat error:', error);
    }
  }, [userId, token]);

  // Handle notification from Firebase (foreground)
  const handleForegroundNotification = useCallback((notification: any) => {
    console.log('Foreground notification:', notification);

    const { title, body, data } = notification;

    // Show alert for important notifications
    if (title && body) {
      Alert.alert(title, body);
    }

    // Increment badge count
    setNotificationCount(prev => prev + 1);
  }, []);

  // Handle notification when app tapped from background/killed
  const handleBackgroundNotification = useCallback((message: any) => {
    console.log('Background notification tapped:', message);
    // Navigate based on data
  }, []);

  // Update badge count on device
  const updateBadge = useCallback(async (count: number) => {
    if (!userId || !token) return;

    try {
      await axios.post(
        `${API_BASE_URL}/api/v3/notifications/badge-update/${userId}?badge_count=${count}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setNotificationCount(count);
    } catch (error) {
      console.error('Badge update error:', error);
    }
  }, [userId, token]);

  // Initialize notifications on mount
  useEffect(() => {
    if (!userId || !token || isInitialized) return;

    const initialize = async () => {
      try {
        // Request permissions
        const hasPermission = await requestPermissions();
        if (!hasPermission) return;

        // Get and register FCM token
        const fcmToken = await messaging().getToken();
        await registerDevice(fcmToken);

        // Subscribe to default topics
        await subscribeTo(['ride_updates', 'payment_updates', 'safety_alerts']);

        // Set up foreground handler
        foregroundListenerRef.current = messaging().onMessage(async (remoteMessage) => {
          handleForegroundNotification(remoteMessage.notification);
        });

        // Set up background handler
        notificationListenerRef.current = messaging().onNotificationOpenedApp((remoteMessage) => {
          handleBackgroundNotification(remoteMessage);
        });

        // Check for initial notification
        const initialNotification = await messaging().getInitialNotification();
        if (initialNotification) {
          handleBackgroundNotification(initialNotification);
        }

        // Listen for token refresh
        const tokenRefreshListener = messaging().onTokenRefresh((newToken) => {
          console.log('FCM token refreshed');
          registerDevice(newToken);
        });

        // Heartbeat interval (24 hours)
        const heartbeatInterval = setInterval(sendHeartbeat, 24 * 60 * 60 * 1000);

        setIsInitialized(true);

        return () => {
          tokenRefreshListener();
          clearInterval(heartbeatInterval);
          foregroundListenerRef.current?.();
          notificationListenerRef.current?.();
        };
      } catch (error) {
        console.error('Notification init error:', error);
        setIsInitialized(true);
      }
    };

    initialize();
  }, [userId, token, isInitialized, requestPermissions, registerDevice, subscribeTo, handleForegroundNotification, handleBackgroundNotification, sendHeartbeat]);

  // Handle app state changes
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        sendHeartbeat();
      }
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, [sendHeartbeat]);

  return {
    isInitialized,
    notificationCount,
    fcmToken,
    notificationPermission,
    subscribeTo,
    updateBadge,
  };
};

// Helper function for device ID
async function getDeviceId(): Promise<string> {
  try {
    let deviceId = await AsyncStorage.getItem('device_id');
    if (!deviceId) {
      deviceId = `${Platform.OS}_${Date.now()}`;
      await AsyncStorage.setItem('device_id', deviceId);
    }
    return deviceId;
  } catch {
    return `device_${Date.now()}`;
  }
}
