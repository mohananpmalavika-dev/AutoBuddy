import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import * as Notifications from 'expo-notifications';

/**
 * Firebase Configuration
 * Get these from your Firebase Console project settings
 */
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY || 'AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN || 'autobuddy-xxxx.firebaseapp.com',
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID || 'autobuddy-xxxx',
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET || 'autobuddy-xxxx.appspot.com',
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_ID || 'xxxxxxxxxx',
  appId: process.env.REACT_APP_FIREBASE_APP_ID || '1:xxxxxxxxxx:web:xxxxxxxxxxxxxxxx',
};

let firebaseApp: any = null;
let messaging: any = null;

/**
 * Initialize Firebase
 */
export const initializeFirebase = () => {
  try {
    if (firebaseApp) {
      return firebaseApp;
    }

    firebaseApp = initializeApp(firebaseConfig);
    messaging = getMessaging(firebaseApp);

    console.log('[Firebase] Initialized successfully');
    return firebaseApp;
  } catch (error) {
    console.error('[Firebase] Initialization failed:', error);
    throw error;
  }
};

/**
 * Get FCM token for this device
 */
export const getFirebaseToken = async (): Promise<string | null> => {
  try {
    if (!messaging) {
      initializeFirebase();
    }

    // Request notification permission
    const permission = await Notifications.requestPermissionsAsync();

    if (permission.granted) {
      const token = await getToken(messaging, {
        vapidKey: process.env.REACT_APP_FIREBASE_VAPID_KEY,
      });

      console.log('[Firebase] FCM Token:', token);
      return token;
    } else {
      console.warn('[Firebase] Notification permission denied');
      return null;
    }
  } catch (error) {
    console.error('[Firebase] Failed to get FCM token:', error);
    return null;
  }
};

/**
 * Listen for incoming messages
 */
export const setupMessageListener = (
  onMessageReceived: (payload: any) => void
) => {
  try {
    if (!messaging) {
      initializeFirebase();
    }

    const unsubscribe = onMessage(messaging, (payload) => {
      console.log('[Firebase] Message received:', payload);
      onMessageReceived(payload);
    });

    return unsubscribe;
  } catch (error) {
    console.error('[Firebase] Failed to setup message listener:', error);
  }
};

/**
 * Send FCM token to backend for user device registration
 */
export const registerDeviceToken = async (
  userId: string,
  token: string,
  role: string,
  apiRequest: (path: string, options: any) => Promise<any>
) => {
  try {
    await apiRequest('/devices/register', {
      method: 'POST',
      body: {
        user_id: userId,
        fcm_token: token,
        role: role,
        device_type: 'mobile',
        device_name: `AutoBuddy-${role}`,
      },
    });

    console.log('[Firebase] Device token registered with backend');
  } catch (error) {
    console.error('[Firebase] Failed to register device token:', error);
  }
};

/**
 * Setup local notification handler for foreground messages
 */
export const setupLocalNotifications = () => {
  try {
    // Set notification handler for foreground messages
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        console.log('[Notifications] Foreground notification:', notification);

        return {
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        };
      },
    });

    console.log('[Notifications] Local notification handler setup complete');
  } catch (error) {
    console.error('[Notifications] Setup failed:', error);
  }
};

/**
 * Listen for notification taps
 */
export const setupNotificationTapListener = (
  onNotificationTap: (notification: any) => void
) => {
  try {
    // Handle notification when app is in foreground
    const subscription1 = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        console.log('[Notifications] Notification tapped:', response);
        onNotificationTap(response.notification);
      }
    );

    // Handle notification when app is opened from notification
    const subscription2 = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        console.log('[Notifications] App opened from notification:', response);
        onNotificationTap(response.notification);
      }
    );

    return () => {
      subscription1.remove();
      subscription2.remove();
    };
  } catch (error) {
    console.error('[Notifications] Failed to setup tap listener:', error);
  }
};

/**
 * Send local notification (testing)
 */
export const sendLocalNotification = async (
  title: string,
  body: string,
  data?: Record<string, any>
) => {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: title,
        body: body,
        data: data || {},
        sound: true,
        badge: 1,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
      },
    });

    console.log('[Notifications] Local notification sent');
  } catch (error) {
    console.error('[Notifications] Failed to send local notification:', error);
  }
};

export default {
  initializeFirebase,
  getFirebaseToken,
  setupMessageListener,
  registerDeviceToken,
  setupLocalNotifications,
  setupNotificationTapListener,
  sendLocalNotification,
};
