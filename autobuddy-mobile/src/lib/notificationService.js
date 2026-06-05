import { apiRequest } from './api';
import { createAutoBuddySocket } from './socket';

/**
 * NotificationService - Handles real-time notification delivery
 * Uses WebSocket when available, falls back to polling
 */

let notificationSocket = null;
let notificationSocketHandlers = [];
let pollingInterval = null;
let fallbackPollTimer = null;
let pollInFlight = false;
let pollingPausedUntilMs = 0;
let consecutivePollingFailures = 0;
let activeToken = null;
let activeOnNotification = null;
let socketConnected = false;
const POLLING_INTERVAL = 60000; // fallback only; WebSocket is preferred
const FALLBACK_POLL_DELAY_MS = 15000;
const POLLING_AUTH_RETRY_COOLDOWN_MS = 60000;
const POLLING_AUTH_EXPIRED_COOLDOWN_MS = 5 * 60 * 1000;
const POLLING_ERROR_BASE_BACKOFF_MS = 30000;
const POLLING_ERROR_MAX_BACKOFF_MS = 5 * 60 * 1000;
const USER_NOTIFICATIONS_PATH = '/users/notifications';

function clearFallbackPollTimer() {
  if (fallbackPollTimer) {
    clearTimeout(fallbackPollTimer);
    fallbackPollTimer = null;
  }
}

function bindSocketHandler(eventName, handler) {
  if (!notificationSocket) {
    return;
  }
  notificationSocket.on(eventName, handler);
  notificationSocketHandlers.push([eventName, handler]);
}

function unbindSocketHandlers() {
  if (!notificationSocket || notificationSocketHandlers.length === 0) {
    notificationSocketHandlers = [];
    return;
  }

  notificationSocketHandlers.forEach(([eventName, handler]) => {
    notificationSocket.off(eventName, handler);
  });
  notificationSocketHandlers = [];
}

function pausePollingFor(ms) {
  pollingPausedUntilMs = Math.max(pollingPausedUntilMs, Date.now() + ms);
}

function getPollingErrorBackoffMs() {
  const multiplier = Math.max(1, consecutivePollingFailures);
  return Math.min(POLLING_ERROR_MAX_BACKOFF_MS, POLLING_ERROR_BASE_BACKOFF_MS * multiplier);
}

function getErrorCode(error) {
  return String(error?.code || '').toUpperCase();
}

export const notificationService = {
  /**
   * Initialize notification system
   * @param {string} token - Auth token
   * @param {Function} onNotification - Callback when notification received
   * @returns {Promise<void>}
   */
  async initialize(token, onNotification) {
    try {
      if (!token) {
        this.cleanup();
        return;
      }

      if (activeToken === token && activeOnNotification === onNotification && (notificationSocket || pollingInterval)) {
        return;
      }

      this.cleanup();
      activeToken = token;
      activeOnNotification = onNotification;

      // Try WebSocket first (real-time)
      this.setupWebSocket(token, onNotification);

      // Poll only if the socket cannot connect quickly enough.
      this.scheduleFallbackPolling(token, onNotification);

      console.log('Notification service initialized');
    } catch (error) {
      console.error('Notification init error:', error);
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

      const handleSocketNotification = (data) => {
        console.log('New notification via WebSocket:', data);
        if (typeof onNotification === 'function') {
          onNotification(data);
        }
      };

      bindSocketHandler('notification', handleSocketNotification);
      bindSocketHandler('in_app_notification', handleSocketNotification);

      bindSocketHandler('booking_accepted', (data) => {
        onNotification?.({
          type: 'booking_accepted',
          title: 'Driver Accepted',
          body: `${data.driver_name} accepted your ride`,
          bookingId: data.booking_id,
          driverId: data.driver_id,
          severity: 'info',
          icon: 'OK',
        });
      });

      bindSocketHandler('driver_arrived', (data) => {
        onNotification?.({
          type: 'driver_arrived',
          title: 'Driver Arrived',
          body: `${data.driver_name} has arrived at pickup`,
          bookingId: data.booking_id,
          driverId: data.driver_id,
          severity: 'important',
          icon: 'PIN',
        });
      });

      bindSocketHandler('trip_started', (data) => {
        onNotification?.({
          type: 'trip_started',
          title: 'Trip Started',
          body: 'Your ride has started',
          bookingId: data.booking_id,
          severity: 'info',
          icon: 'CAR',
        });
      });

      bindSocketHandler('trip_completed', (data) => {
        onNotification?.({
          type: 'trip_completed',
          title: 'Trip Completed',
          body: `Fare: Rs. ${data.fare}. Please rate your driver.`,
          bookingId: data.booking_id,
          fare: data.fare,
          severity: 'info',
          icon: 'OK',
        });
      });

      bindSocketHandler('driver_cancelled', (data) => {
        onNotification?.({
          type: 'driver_cancelled',
          title: 'Ride Cancelled',
          body: `Driver ${data.driver_name} cancelled the ride`,
          bookingId: data.booking_id,
          severity: 'warning',
          icon: 'WARN',
        });
      });

      bindSocketHandler('connect', () => {
        socketConnected = true;
        consecutivePollingFailures = 0;
        pollingPausedUntilMs = 0;
        clearFallbackPollTimer();
        this.stopPolling();
        console.log('WebSocket connected for notifications');
      });

      bindSocketHandler('connect_error', (error) => {
        socketConnected = false;
        console.error('WebSocket connect_error:', error);
        this.scheduleFallbackPolling(token, onNotification);
      });

      bindSocketHandler('connect_timeout', () => {
        socketConnected = false;
        console.error('WebSocket connect_timeout');
        this.scheduleFallbackPolling(token, onNotification);
      });

      bindSocketHandler('disconnect', (reason) => {
        socketConnected = false;
        console.warn('WebSocket disconnected:', reason);
        if (reason !== 'io client disconnect') {
          this.scheduleFallbackPolling(token, onNotification);
        }
      });

      bindSocketHandler('error', (error) => {
        console.error('WebSocket error:', error);
        // Continue with polling fallback
        this.scheduleFallbackPolling(token, onNotification);
      });
    } catch (error) {
      console.warn('WebSocket setup failed, using polling:', error);
      socketConnected = false;
      this.scheduleFallbackPolling(token, onNotification);
    }
  },

  scheduleFallbackPolling(token, onNotification) {
    if (!token || socketConnected || pollingInterval || fallbackPollTimer) {
      return;
    }

    fallbackPollTimer = setTimeout(() => {
      fallbackPollTimer = null;
      if (!socketConnected) {
        this.startPolling(token, onNotification);
      }
    }, FALLBACK_POLL_DELAY_MS);
  },

  /**
   * Start polling for notifications (fallback)
   */
  startPolling(token, onNotification) {
    if (!token) {
      return;
    }

    if (pollingInterval) {
      return;
    }

    this.pollOnce(token, onNotification);
    pollingInterval = setInterval(() => {
      this.pollOnce(token, onNotification);
    }, POLLING_INTERVAL);
  },

  stopPolling() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  },

  async pollOnce(token, onNotification) {
    if (pollInFlight || !token || Date.now() < pollingPausedUntilMs) {
      return;
    }

    pollInFlight = true;
    try {
      const response = await apiRequest(USER_NOTIFICATIONS_PATH, {
        token,
        query: { unread_only: true, limit: 40 },
      });

      consecutivePollingFailures = 0;
      pollingPausedUntilMs = 0;

      if (Array.isArray(response)) {
        response.forEach((notif) => {
          if (typeof onNotification === 'function') {
            onNotification(notif);
          }
        });
      }
    } catch (error) {
      consecutivePollingFailures += 1;
      const status = Number(error?.status || 0);
      const code = getErrorCode(error);

      if (code === 'AUTH_RETRY_REQUIRED' || error?.sessionPreserved) {
        pausePollingFor(POLLING_AUTH_RETRY_COOLDOWN_MS);
      } else if (code === 'AUTH_EXPIRED' || status === 401 || status === 403) {
        pausePollingFor(POLLING_AUTH_EXPIRED_COOLDOWN_MS);
        this.stopPolling();
        console.warn('Notification polling paused until the user signs in again.');
        return;
      } else if (status === 429 || status >= 500 || status === 0) {
        pausePollingFor(getPollingErrorBackoffMs());
      }

      console.warn('Notification polling error:', error);
    } finally {
      pollInFlight = false;
    }
  },

  /**
   * Fetch all notifications
   */
  async fetchNotifications(token, options = {}) {
    try {
      const response = await apiRequest(USER_NOTIFICATIONS_PATH, {
        token,
        query: {
          limit: options.limit || 50,
          skip: options.skip ?? options.offset ?? 0,
          unread_only: options.unreadOnly || false,
        },
      });
      return Array.isArray(response) ? response : [];
    } catch (error) {
      const code = getErrorCode(error);
      if (code === 'AUTH_RETRY_REQUIRED' || error?.sessionPreserved) {
        console.warn('Notifications unavailable while login is being rechecked.');
      } else {
        console.error('Error fetching notifications:', error);
      }
      return [];
    }
  },

  /**
   * Mark notification as read
   */
  async markAsRead(token, notificationId) {
    try {
      await apiRequest(`${USER_NOTIFICATIONS_PATH}/${notificationId}/read`, {
        token,
        method: 'POST',
      });
      return true;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return false;
    }
  },

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(token) {
    try {
      await apiRequest(`${USER_NOTIFICATIONS_PATH}/read-all`, {
        token,
        method: 'POST',
      });
      return true;
    } catch (error) {
      console.error('Error marking all as read:', error);
      return false;
    }
  },

  /**
   * Delete a notification
   */
  async deleteNotification(token, notificationId) {
    try {
      await apiRequest(`${USER_NOTIFICATIONS_PATH}/${notificationId}`, {
        token,
        method: 'DELETE',
      });
      return true;
    } catch (error) {
      console.error('Error deleting notification:', error);
      return false;
    }
  },

  /**
   * Clear all notifications
   */
  async clearAll(token) {
    try {
      await apiRequest(`${USER_NOTIFICATIONS_PATH}/clear-all`, {
        token,
        method: 'POST',
      });
      return true;
    } catch (error) {
      console.error('Error clearing notifications:', error);
      return false;
    }
  },

  /**
   * Cleanup notification service
   */
  cleanup() {
    clearFallbackPollTimer();
    this.stopPolling();
    unbindSocketHandlers();
    if (notificationSocket) {
      notificationSocket.disconnect();
      notificationSocket = null;
    }
    pollInFlight = false;
    pollingPausedUntilMs = 0;
    consecutivePollingFailures = 0;
    activeToken = null;
    activeOnNotification = null;
    socketConnected = false;
    console.log('Notification service cleaned up');
  },
};
