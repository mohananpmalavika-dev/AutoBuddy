import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * NotificationContext - Global state for passenger notifications
 * Manages real-time alerts for booking updates, arrivals, completions, etc.
 */

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);

  // Add a new notification
  const addNotification = useCallback((notification) => {
    const id = `notif-${Date.now()}-${Math.random()}`;
    const newNotif = {
      id,
      timestamp: new Date(),
      read: false,
      ...notification,
    };

    setNotifications((prev) => [newNotif, ...prev]);
    setUnreadCount((prev) => prev + 1);

    // Auto-dismiss info notifications after 5 seconds
    if (notification.type === 'info') {
      setTimeout(() => {
        removeNotification(id);
      }, 5000);
    }

    return id;
  }, []);

  // Mark notification as read
  const markAsRead = useCallback((notificationId) => {
    setNotifications((prev) =>
      prev.map((notif) =>
        notif.id === notificationId ? { ...notif, read: true } : notif
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  // Mark all as read
  const markAllAsRead = useCallback(() => {
    setNotifications((prev) =>
      prev.map((notif) => ({ ...notif, read: true }))
    );
    setUnreadCount(0);
  }, []);

  // Remove a notification
  const removeNotification = useCallback((notificationId) => {
    setNotifications((prev) => prev.filter((notif) => notif.id !== notificationId));
  }, []);

  // Remove all notifications
  const clearAll = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
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
