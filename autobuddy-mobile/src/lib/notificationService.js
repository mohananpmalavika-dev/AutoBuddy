import { apiRequest } from './api';
import { createAutoBuddySocket } from './socket';

/**
 * NotificationService - Handles real-time notification delivery
 * Uses WebSocket when available, falls back to polling
 */

let notificationSocket = null;
let pollingInterval = null;
const POLLING_INTERVAL = 10000; // 10 seconds fallback

export const notificationService = {
  /**
   * Initialize notification system
   * @param {string} token - Auth token
   * @param {Function} onNotification - Callback when notification received
   * @returns {Promise<void>}
   */
  async initialize(token, onNotification) {
    try {
      // Try WebSocket first (real-time)
      this.setupWebSocket(token, onNotification);

      // Also start polling as fallback
      this.startPolling(token, onNotification);

      console.log('✅ Notification service initialized');
    } catch (error) {
      console.error('❌ Notification init error:', error);
      // Fallback to polling only
      this.startPolling(token, onNotification);
    }
  },

  /**
   * Setup WebSocket connection for real-time notifications
   */
  setupWebSocket(token, onNotification) {
    try {
      notificationSocket = createAutoBuddySocket(token);

      notificationSocket.on('notification', (data) => {
        console.log('📬 New notification via WebSocket:', data);
        if (typeof onNotification === 'function') {
          onNotification(data);
        }
      });

      notificationSocket.on('booking_accepted', (data) => {
        onNotification({
          type: 'booking_accepted',
          title: 'Driver Accepted',
          body: `${data.driver_name} accepted your ride`,
          bookingId: data.booking_id,
          driverId: data.driver_id,
          severity: 'info',
          icon: '✅',
        });
      });

      notificationSocket.on('driver_arrived', (data) => {
        onNotification({
          type: 'driver_arrived',
          title: 'Driver Arrived',
          body: `${data.driver_name} has arrived at pickup`,
          bookingId: data.booking_id,
          driverId: data.driver_id,
          severity: 'important',
          icon: '📍',
        });
      });

      notificationSocket.on('trip_started', (data) => {
        onNotification({
          type: 'trip_started',
          title: 'Trip Started',
          body: 'Your ride has started',
          bookingId: data.booking_id,
          severity: 'info',
          icon: '🚗',
        });
      });

      notificationSocket.on('trip_completed', (data) => {
        onNotification({
          type: 'trip_completed',
          title: 'Trip Completed',
          body: `Fare: ₹${data.fare}. Please rate your driver.`,
          bookingId: data.booking_id,
          fare: data.fare,
          severity: 'info',
          icon: '✔️',
        });
      });

      notificationSocket.on('driver_cancelled', (data) => {
        onNotification({
          type: 'driver_cancelled',
          title: 'Ride Cancelled',
          body: `Driver ${data.driver_name} cancelled the ride`,
          bookingId: data.booking_id,
          severity: 'warning',
          icon: '⚠️',
        });
      });

      notificationSocket.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        // Continue with polling fallback
      });

      console.log('✅ WebSocket connected for notifications');
    } catch (error) {
      console.warn('⚠️ WebSocket setup failed, using polling:', error);
    }
  },

  /**
   * Start polling for notifications (fallback)
   */
  startPolling(token, onNotification) {
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }

    pollingInterval = setInterval(async () => {
      try {
        const response = await apiRequest('/passengers/notifications', {
          token,
          query: { unread_only: true },
        });

        if (Array.isArray(response)) {
          response.forEach((notif) => {
            if (typeof onNotification === 'function') {
              onNotification(notif);
            }
          });
        }
      } catch (error) {
        console.warn('⚠️ Polling error:', error);
      }
    }, POLLING_INTERVAL);
  },

  /**
   * Fetch all notifications
   */
  async fetchNotifications(token, options = {}) {
    try {
      const response = await apiRequest('/passengers/notifications', {
        token,
        query: {
          limit: options.limit || 50,
          offset: options.offset || 0,
          unread_only: options.unreadOnly || false,
        },
      });
      return Array.isArray(response) ? response : [];
    } catch (error) {
      console.error('❌ Error fetching notifications:', error);
      return [];
    }
  },

  /**
   * Mark notification as read
   */
  async markAsRead(token, notificationId) {
    try {
      await apiRequest(`/passengers/notifications/${notificationId}/read`, {
        token,
        method: 'POST',
      });
      return true;
    } catch (error) {
      console.error('❌ Error marking notification as read:', error);
      return false;
    }
  },

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(token) {
    try {
      await apiRequest('/passengers/notifications/read-all', {
        token,
        method: 'POST',
      });
      return true;
    } catch (error) {
      console.error('❌ Error marking all as read:', error);
      return false;
    }
  },

  /**
   * Delete a notification
   */
  async deleteNotification(token, notificationId) {
    try {
      await apiRequest(`/passengers/notifications/${notificationId}`, {
        token,
        method: 'DELETE',
      });
      return true;
    } catch (error) {
      console.error('❌ Error deleting notification:', error);
      return false;
    }
  },

  /**
   * Clear all notifications
   */
  async clearAll(token) {
    try {
      await apiRequest('/passengers/notifications/clear-all', {
        token,
        method: 'POST',
      });
      return true;
    } catch (error) {
      console.error('❌ Error clearing notifications:', error);
      return false;
    }
  },

  /**
   * Cleanup notification service
   */
  cleanup() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
    if (notificationSocket) {
      notificationSocket.disconnect();
      notificationSocket = null;
    }
    console.log('✅ Notification service cleaned up');
  },
};
