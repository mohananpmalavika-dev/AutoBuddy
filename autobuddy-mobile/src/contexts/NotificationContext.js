import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * NotificationContext - Global state for user notifications.
 * Manages real-time alerts for booking updates, driver notices, support, and payouts.
 */

export const NotificationContext = createContext(null);

function getNotificationId(notification = {}) {
  return String(
    notification.id ||
      notification._id ||
      notification.notification_id ||
      notification.data?.id ||
      notification.data?.notification_id ||
      `notif-${Date.now()}-${Math.random()}`,
  );
}

function normalizeNotification(notification = {}) {
  const data = notification.data && typeof notification.data === 'object' ? notification.data : {};
  const readProvided = notification.read !== undefined || notification.is_read !== undefined;
  const createdAt = notification.created_at || data.created_at;
  const timestamp = notification.timestamp || data.timestamp || createdAt || new Date().toISOString();

  return {
    ...notification,
    id: getNotificationId(notification),
    type: notification.type || data.type || 'notification',
    title: notification.title || data.title || 'New Update',
    body: notification.body || notification.message || data.body || data.message || '',
    icon: notification.icon || data.icon || 'N',
    severity: notification.severity || data.severity || 'info',
    timestamp,
    created_at: createdAt || timestamp,
    read: readProvided ? Boolean(notification.read ?? notification.is_read) : false,
    bookingId:
      notification.bookingId ||
      notification.booking_id ||
      data.bookingId ||
      data.booking_id ||
      null,
    driverId:
      notification.driverId ||
      notification.driver_id ||
      data.driverId ||
      data.driver_id ||
      null,
    data,
    readProvided,
  };
}

function sortNotifications(list) {
  return [...list].sort((left, right) => {
    const leftTime = new Date(left.timestamp || left.created_at || 0).getTime();
    const rightTime = new Date(right.timestamp || right.created_at || 0).getTime();
    return rightTime - leftTime;
  });
}

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.read).length,
    [notifications],
  );

  // Add or update a notification from socket, polling, or initial hydration.
  const addNotification = useCallback((notification) => {
    const normalized = normalizeNotification(notification);

    setNotifications((prev) => {
      const existing = prev.find((item) => String(item.id) === String(normalized.id));
      if (!existing) {
        const nextNotification = { ...normalized };
        delete nextNotification.readProvided;
        return sortNotifications([nextNotification, ...prev]);
      }

      const nextRead = normalized.readProvided ? normalized.read : existing.read;
      const nextNotification = { ...normalized };
      delete nextNotification.readProvided;
      return sortNotifications(
        prev.map((item) =>
          String(item.id) === String(normalized.id)
            ? { ...item, ...nextNotification, read: nextRead }
            : item,
        ),
      );
    });

    return normalized.id;
  }, []);

  // Mark notification as read
  const markAsRead = useCallback((notificationId) => {
    setNotifications((prev) =>
      prev.map((notif) =>
        String(notif.id) === String(notificationId) ? { ...notif, read: true } : notif
      )
    );
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(() => {
    setNotifications((prev) =>
      prev.map((notif) => ({ ...notif, read: true }))
    );
  }, []);

  // Remove a notification
  const removeNotification = useCallback((notificationId) => {
    setNotifications((prev) => prev.filter((notif) => String(notif.id) !== String(notificationId)));
  }, []);

  // Remove all notifications
  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  // Get notifications by type (e.g., 'booking', 'system')
  const getByType = useCallback(
    (type) => notifications.filter((n) => n.type === type),
    [notifications]
  );

  // Get unread notifications only
  const unreadNotifications = notifications.filter((n) => !n.read);

  const value = {
    notifications,
    unreadCount,
    unreadNotifications,
    isInitialized,
    addNotification,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
    getByType,
    setIsInitialized,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within NotificationProvider');
  }
  return context;
}
