import { useEffect, useCallback, useRef } from 'react';
import { useNotifications } from '../contexts/NotificationContext';
import { notificationService } from '../lib/notificationService';

/**
 * useNotificationManager - Initialize and manage notifications
 * Should be called once in root component (App.tsx or PassengerMap.web.js)
 *
 * @param {string} token - Auth token
 * @param {string} userId - Passenger user ID
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
      addNotification({
        type: notificationData.type || 'notification',
        title: notificationData.title || 'New Update',
        body: notificationData.body || '',
        icon: notificationData.icon || '🔔',
        severity: notificationData.severity || 'info',
        bookingId: notificationData.booking_id || notificationData.bookingId,
        driverId: notificationData.driver_id || notificationData.driverId,
        data: notificationData,
      });

      // Browser notification if permitted
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        try {
          new Notification(notificationData.title || 'AutoBuddy', {
            body: notificationData.body || '',
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
            `${notificationData.title}. ${notificationData.body}`
          );
          utterance.lang = 'en-IN';
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
        } catch (e) {
          console.warn('Voice notification failed:', e);
        }
      }
    };

    // Initialize notification service
    notificationService.initialize(token, handleIncomingNotification);
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
