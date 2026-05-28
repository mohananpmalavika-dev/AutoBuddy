import { useEffect, useRef } from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import { notificationService } from '../lib/notificationService';

/**
 * useNotificationManager - Initialize and manage notifications
 * Should be called once in a screen wrapped by NotificationProvider.
 *
 * @param {string} token - Auth token
 * @param {string} userId - User ID
 * @returns {Object} - { loading, error, initialized }
 */
export function useNotificationManager(token, userId) {
  const { addNotification, setIsInitialized } = useNotifications();
  const initializingRef = useRef(false);

  useEffect(() => {
    if (!token || !userId || initializingRef.current) {
      return;
    }

    initializingRef.current = true;

    const handleIncomingNotification = (notificationData) => {
      const safeNotification =
        notificationData && typeof notificationData === 'object' ? notificationData : {};
      const payloadData =
        safeNotification.data && typeof safeNotification.data === 'object'
          ? safeNotification.data
          : {};

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

      // Browser notification if permitted
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
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
      if (typeof window !== 'undefined' && window.speechSynthesis) {
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
    };

    // Initialize notification service and hydrate existing unread/read state.
    notificationService.initialize(token, handleIncomingNotification);
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
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => null);
    }

    // Cleanup on unmount
    return () => {
      // Don't cleanup service on unmount - keep listening
      // notificationService.cleanup();
    };
  }, [token, userId, addNotification, setIsInitialized]);

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
