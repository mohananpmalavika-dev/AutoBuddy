import { useEffect, useMemo, useRef } from 'react';
import { Platform, Vibration } from 'react-native';
import { useNotifications } from '../contexts/NotificationContext';
import { notificationService } from '../lib/notificationService';

const DEFAULT_NOTIFICATION_SETTINGS = {
  push_notifications: true,
  sound_enabled: true,
  vibration_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00',
  accept_promo: true,
  ride_status_notifications: true,
  driver_arrival_notification: true,
  surge_pricing_notification: true,
};
const EMPTY_NOTIFICATION_SETTINGS = {};

function normalizeSettings(settings = {}) {
  const source = settings && typeof settings === 'object' ? settings : {};
  const acceptPromo =
    source.accept_promo !== undefined
      ? source.accept_promo
      : source.promotional_offers !== undefined
        ? source.promotional_offers
        : DEFAULT_NOTIFICATION_SETTINGS.accept_promo;
  const pushNotifications =
    source.push_notifications !== undefined
      ? source.push_notifications
      : source.notifications_enabled !== undefined
        ? source.notifications_enabled
        : DEFAULT_NOTIFICATION_SETTINGS.push_notifications;
  const vibrationEnabled =
    source.vibration_enabled !== undefined
      ? source.vibration_enabled
      : source.haptic_feedback !== undefined
        ? source.haptic_feedback
        : DEFAULT_NOTIFICATION_SETTINGS.vibration_enabled;

  return {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...source,
    accept_promo: acceptPromo,
    push_notifications: pushNotifications,
    vibration_enabled: vibrationEnabled,
  };
}

function settingsSignature(settings = {}) {
  const source = settings && typeof settings === 'object' ? settings : {};
  return JSON.stringify(
    Object.keys(source)
      .sort()
      .reduce((acc, key) => {
        acc[key] = source[key];
        return acc;
      }, {}),
  );
}

function parseTimeToMinutes(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

function isQuietHoursActive(settings, date = new Date()) {
  if (!settings.quiet_hours_enabled) {
    return false;
  }
  const start = parseTimeToMinutes(settings.quiet_hours_start);
  const end = parseTimeToMinutes(settings.quiet_hours_end);
  if (start === null || end === null || start === end) {
    return false;
  }
  const now = date.getHours() * 60 + date.getMinutes();
  return start < end ? now >= start && now < end : now >= start || now < end;
}

function isPromotionalNotification(notification = {}) {
  const data = notification.data && typeof notification.data === 'object' ? notification.data : {};
  const typeText = [
    notification.type,
    data.type,
    data.category,
    data.campaign_type,
    data.topic,
    data.tag,
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
  return ['promo', 'promotion', 'marketing', 'offer', 'campaign'].some((marker) =>
    typeText.includes(marker),
  );
}

function notificationText(notification = {}) {
  const data = notification.data && typeof notification.data === 'object' ? notification.data : {};
  return [
    notification.type,
    data.type,
    data.category,
    data.topic,
    notification.title,
    data.title,
    notification.body,
    notification.message,
    data.body,
    data.message,
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
}

function isDriverArrivalNotification(notification = {}) {
  const text = notificationText(notification);
  return text.includes('driver_arrived') || text.includes('driver arrival') || text.includes('driver arrived');
}

function isSurgePricingNotification(notification = {}) {
  const text = notificationText(notification);
  return text.includes('surge') || text.includes('dynamic_pricing') || text.includes('dynamic pricing');
}

function isRideStatusNotification(notification = {}) {
  const text = notificationText(notification);
  return [
    'booking_accepted',
    'booking accepted',
    'driver_arrived',
    'driver arrived',
    'trip_started',
    'trip started',
    'trip_completed',
    'trip completed',
    'driver_cancelled',
    'booking_cancelled',
    'ride cancelled',
    'rating_pending',
  ].some((marker) => text.includes(marker));
}

function shouldAcceptNotification(settings, notification) {
  if (!settings.accept_promo && isPromotionalNotification(notification)) {
    return false;
  }
  if (!settings.driver_arrival_notification && isDriverArrivalNotification(notification)) {
    return false;
  }
  if (!settings.surge_pricing_notification && isSurgePricingNotification(notification)) {
    return false;
  }
  if (!settings.ride_status_notifications && isRideStatusNotification(notification)) {
    return false;
  }
  return true;
}

/**
 * useNotificationManager - Initialize and manage notifications
 * Should be called once in a screen wrapped by NotificationProvider.
 *
 * @param {string} token - Auth token
 * @param {string} userId - User ID
 * @returns {Object} - { loading, error, initialized }
 */
export function useNotificationManager(token, userId, notificationSettings = EMPTY_NOTIFICATION_SETTINGS) {
  const { addNotification, setIsInitialized } = useNotifications();
  const initializingRef = useRef(false);
  const settings = useMemo(() => normalizeSettings(notificationSettings), [notificationSettings]);
  const settingsKey = useMemo(() => settingsSignature(settings), [settings]);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings, settingsKey]);

  useEffect(() => {
    if (!token || !userId || initializingRef.current) {
      return;
    }

    initializingRef.current = true;
    const activeSettings = settingsRef.current;

    const handleIncomingNotification = (notificationData) => {
      const safeNotification =
        notificationData && typeof notificationData === 'object' ? notificationData : {};
      const payloadData =
        safeNotification.data && typeof safeNotification.data === 'object'
          ? safeNotification.data
          : {};

      if (!shouldAcceptNotification(activeSettings, safeNotification)) {
        return;
      }

      addNotification({
        ...safeNotification,
        type: safeNotification.type || payloadData.type || 'notification',
        title: safeNotification.title || 'New Update',
        body: safeNotification.body || safeNotification.message || '',
        icon: safeNotification.icon || payloadData.icon || 'N',
        severity: safeNotification.severity || payloadData.severity || 'info',
        bookingId:
          safeNotification.booking_id ||
          safeNotification.bookingId ||
          payloadData.booking_id ||
          payloadData.bookingId,
        driverId:
          safeNotification.driver_id ||
          safeNotification.driverId ||
          payloadData.driver_id ||
          payloadData.driverId,
        data: payloadData,
      });

      const quietNow = isQuietHoursActive(activeSettings);
      const externalAlertsEnabled = activeSettings.push_notifications !== false && !quietNow;

      // Browser notification if permitted
      if (
        externalAlertsEnabled &&
        typeof Notification !== 'undefined' &&
        Notification.permission === 'granted'
      ) {
        try {
          new Notification(safeNotification.title || 'AutoBuddy', {
            body: safeNotification.body || '',
            icon: '/favicon.ico',
          });
        } catch (e) {
          console.warn('Browser notification failed:', e);
        }
      }

      // Voice notification (optional)
      if (
        externalAlertsEnabled &&
        activeSettings.sound_enabled !== false &&
        typeof window !== 'undefined' &&
        window.speechSynthesis
      ) {
        try {
          const utterance = new SpeechSynthesisUtterance(
            `${safeNotification.title || 'AutoBuddy'}. ${safeNotification.body || ''}`
          );
          utterance.lang = 'en-IN';
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
        } catch (e) {
          console.warn('Voice notification failed:', e);
        }
      }

      if (externalAlertsEnabled && activeSettings.vibration_enabled !== false) {
        try {
          if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.vibrate) {
            navigator.vibrate(120);
          } else if (Platform.OS !== 'web') {
            Vibration.vibrate(250);
          }
        } catch (e) {
          console.warn('Notification vibration failed:', e);
        }
      }
    };

    if (activeSettings.push_notifications === false) {
      notificationService.cleanup();
    } else {
      // Initialize notification service and hydrate existing unread/read state.
      notificationService.initialize(token, handleIncomingNotification);
    }
    notificationService
      .fetchNotifications(token, { limit: 40 })
      .then((rows) => {
        rows
          .slice()
          .reverse()
          .filter((notification) => shouldAcceptNotification(activeSettings, notification))
          .forEach((notification) => addNotification(notification));
      })
      .catch((error) => {
        console.warn('Error fetching initial notifications:', error);
      });
    setIsInitialized(true);

    // Request browser notification permission if needed
    if (
      activeSettings.push_notifications !== false &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'default'
    ) {
      Notification.requestPermission().catch(() => null);
    }

    // Cleanup on unmount
    return () => {
      notificationService.cleanup();
      initializingRef.current = false;
      setIsInitialized(false);
    };
  }, [
    token,
    userId,
    addNotification,
    setIsInitialized,
    settingsKey,
  ]);

  return { initialized: true };
}

/**
 * useNotificationAutoRead - Auto-mark notifications as read after viewing
 * @param {string} token - Auth token
 * @param {number} delayMs - Delay before marking as read (default 3s)
 */
export function useNotificationAutoRead(token, delayMs = 3000) {
  const { unreadNotifications, markAsRead } = useNotifications();
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (unreadNotifications.length === 0) {
      return;
    }

    // Auto-mark oldest unread as read after delay
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(async () => {
      const oldestUnread = unreadNotifications[unreadNotifications.length - 1];
      if (oldestUnread) {
        markAsRead(oldestUnread.id);

        // Sync with backend
        try {
          await notificationService.markAsRead(token, oldestUnread.id);
        } catch (error) {
          console.warn('Error syncing read status:', error);
        }
      }
    }, delayMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [unreadNotifications, markAsRead, token, delayMs]);
}

/**
 * useNotificationSound - Play sound for new notifications
 * @param {boolean} enabled - Whether to play sound
 */
export function useNotificationSound(enabled = true) {
  const { unreadNotifications } = useNotifications();

  useEffect(() => {
    if (!enabled || unreadNotifications.length === 0) {
      return;
    }

    // Play notification sound
    try {
      const audio = new Audio('/sounds/notification.mp3');
      audio.play().catch(() => {
        // Silent fail if audio unavailable
      });
    } catch (error) {
      console.warn('Notification sound failed:', error);
    }
  }, [unreadNotifications, enabled]);
}
