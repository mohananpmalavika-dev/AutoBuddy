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
};
const EMPTY_NOTIFICATION_SETTINGS = {};

function normalizeSettings(settings = {}) {
  return {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...(settings && typeof settings === 'object' ? settings : {}),
  };
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

  useEffect(() => {
    if (!token || !userId || initializingRef.current) {
      return;
    }

    initializingRef.current = true;
    const activeSettings = settings;

    const handleIncomingNotification = (notificationData) => {
      const safeNotification =
        notificationData && typeof notificationData === 'object' ? notificationData : {};
      const payloadData =
        safeNotification.data && typeof safeNotification.data === 'object'
          ? safeNotification.data
          : {};

      if (!activeSettings.accept_promo && isPromotionalNotification(safeNotification)) {
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
    settings,
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
