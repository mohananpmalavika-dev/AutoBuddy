/**
 * useNotifications Hook - Handles notification fetching and Socket.IO integration
 */

import { useEffect, useCallback } from 'react';
import { notificationAPI } from '../services/apiClient';
import { getSocket, registerPassengerListeners } from '../services/socketClient';

export const useNotifications = (notificationContext, userId) => {
  // Fetch notifications from backend
  const fetchNotifications = useCallback(async () => {
    try {
      const response = await notificationAPI.listNotifications({}, 0, 50);
      const notifications = response.data.notifications || [];
      
      // Clear existing and load all
      notificationContext.clearAll?.();
      notifications.forEach((notif) => {
        notificationContext.addNotification?.(notif);
      });
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  }, [notificationContext]);

  // Mark notification as read (both local + backend)
  const markAsRead = useCallback(async (notificationId) => {
    try {
      // Update local state immediately
      notificationContext.markAsRead?.(notificationId);
      
      // Sync with backend
      await notificationAPI.markAsRead(notificationId);
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  }, [notificationContext]);

  // Mark all as read (both local + backend)
  const markAllAsRead = useCallback(async () => {
    try {
      notificationContext.markAllAsRead?.();
      await notificationAPI.markAllAsRead();
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  }, [notificationContext]);

  // Delete notification
  const deleteNotification = useCallback(async (notificationId) => {
    try {
      notificationContext.removeNotification?.(notificationId);
      await notificationAPI.deleteNotification(notificationId);
    } catch (error) {
      console.error('Error deleting notification:', error);
    }
  }, [notificationContext]);

  // Socket.IO listeners
  useEffect(() => {
    fetchNotifications();

    const socket = getSocket();
    if (socket && userId) {
      registerPassengerListeners({
        onNotification: (data) => {
          notificationContext.addNotification?.(data);
        },
        onRideStatusChanged: (data) => {
          notificationContext.addNotification?.({
            type: 'booking',
            title: 'Ride Status Updated',
            body: `Your ride status: ${data.status}`,
            booking_id: data.booking_id,
            data,
          });
        },
        onSupportTicketMessage: (data) => {
          notificationContext.addNotification?.({
            type: 'support',
            title: 'Support Message',
            body: data.message,
            data,
          });
        },
      });
    }
  }, [userId, notificationContext, fetchNotifications]);

  return {
    markAsRead,
    markAllAsRead,
    deleteNotification,
    fetchNotifications,
  };
};

/**
 * useSupportTickets Hook - Handles support ticket operations
 */

import { supportAPI } from '../services/apiClient';

export const useSupportTickets = (supportContext) => {
  // Fetch tickets from backend
  const fetchTickets = useCallback(async (filters) => {
    try {
      const response = await supportAPI.listTickets(filters, 0, 50);
      const tickets = response.data.tickets || [];
      supportContext.setTickets?.(tickets);
    } catch (error) {
      console.error('Error fetching support tickets:', error);
    }
  }, [supportContext]);

  // Create ticket
  const createTicket = useCallback(async (ticketData) => {
    try {
      const response = await supportAPI.createTicket(ticketData);
      const newTicket = response.data.ticket || response.data;
      supportContext.createSupportTicket?.(ticketData.issue, ticketData.description);
      return newTicket;
    } catch (error) {
      console.error('Error creating support ticket:', error);
      throw error;
    }
  }, [supportContext]);

  // Add message to ticket
  const addMessage = useCallback(async (ticketId, message) => {
    try {
      const response = await supportAPI.addMessage(ticketId, message);
      supportContext.addMessage?.(ticketId, message, 'passenger');
      return response.data;
    } catch (error) {
      console.error('Error adding message:', error);
      throw error;
    }
  }, [supportContext]);

  // Close ticket
  const closeTicket = useCallback(async (ticketId) => {
    try {
      await supportAPI.updateTicketStatus(ticketId, 'closed');
      supportContext.closeSupportTicket?.(ticketId);
    } catch (error) {
      console.error('Error closing ticket:', error);
      throw error;
    }
  }, [supportContext]);

  return {
    fetchTickets,
    createTicket,
    addMessage,
    closeTicket,
  };
};

/**
 * useScheduledRides Hook - Handles scheduled ride operations
 */

import { scheduledRidesAPI } from '../services/apiClient';

export const useScheduledRides = (scheduledRidesContext) => {
  // Fetch scheduled rides from backend
  const fetchScheduledRides = useCallback(async () => {
    try {
      const response = await scheduledRidesAPI.listScheduledRides(0, 50);
      const rides = response.data.rides || [];
      scheduledRidesContext.setScheduledRides?.(rides);
    } catch (error) {
      console.error('Error fetching scheduled rides:', error);
    }
  }, [scheduledRidesContext]);

  // Create scheduled ride
  const createScheduledRide = useCallback(async (rideData) => {
    try {
      const response = await scheduledRidesAPI.createScheduledRide(rideData);
      const newRide = response.data.ride || response.data;
      scheduledRidesContext.createScheduledRide?.(newRide);
      return newRide;
    } catch (error) {
      console.error('Error creating scheduled ride:', error);
      throw error;
    }
  }, [scheduledRidesContext]);

  // Update scheduled ride
  const updateScheduledRide = useCallback(async (rideId, updates) => {
    try {
      const response = await scheduledRidesAPI.updateScheduledRide(rideId, updates);
      // Refetch to get updated data
      await fetchScheduledRides();
      return response.data;
    } catch (error) {
      console.error('Error updating scheduled ride:', error);
      throw error;
    }
  }, [scheduledRidesContext, fetchScheduledRides]);

  // Cancel scheduled ride
  const cancelScheduledRide = useCallback(async (rideId) => {
    try {
      await scheduledRidesAPI.cancelScheduledRide(rideId);
      scheduledRidesContext.cancelScheduledRide?.(rideId);
    } catch (error) {
      console.error('Error canceling scheduled ride:', error);
      throw error;
    }
  }, [scheduledRidesContext]);

  // Confirm scheduled ride (when time comes)
  const confirmScheduledRide = useCallback(async (rideId) => {
    try {
      const response = await scheduledRidesAPI.confirmScheduledRide(rideId);
      await fetchScheduledRides();
      return response.data;
    } catch (error) {
      console.error('Error confirming scheduled ride:', error);
      throw error;
    }
  }, [fetchScheduledRides]);

  useEffect(() => {
    fetchScheduledRides();
  }, []);

  return {
    fetchScheduledRides,
    createScheduledRide,
    updateScheduledRide,
    cancelScheduledRide,
    confirmScheduledRide,
  };
};

/**
 * usePromoCode Hook - Handles promo code validation
 */

import { promoAPI } from '../services/apiClient';

export const usePromoCode = (promoCodesContext) => {
  // Validate promo code
  const validateCode = useCallback(async (code, fare) => {
    try {
      const response = await promoAPI.validateCode(code, fare);
      return response.data; // { discount_amount, final_fare }
    } catch (error) {
      console.error('Error validating promo code:', error);
      throw error;
    }
  }, []);

  // Fetch available codes
  const fetchAvailableCodes = useCallback(async () => {
    try {
      const response = await promoAPI.listCodes(0, 50);
      const codes = response.data.codes || [];
      promoCodesContext.setPromoCodes?.(codes);
    } catch (error) {
      console.error('Error fetching promo codes:', error);
    }
  }, [promoCodesContext]);

  useEffect(() => {
    fetchAvailableCodes();
  }, []);

  return {
    validateCode,
    fetchAvailableCodes,
  };
};

/**
 * useAccessibility Hook - Handles accessibility features
 */

import { accessibilityAPI } from '../services/apiClient';

export const useAccessibility = (userId) => {
  const [requirements, setRequirements] = useState(null);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(false);

  // Fetch accessibility requirements
  const fetchRequirements = useCallback(async () => {
    setLoading(true);
    try {
      const response = await accessibilityAPI.getRequirements(userId);
      setRequirements(response.data.requirements || {});
    } catch (error) {
      console.error('Error fetching accessibility requirements:', error);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Update accessibility requirements
  const updateRequirements = useCallback(async (newRequirements) => {
    try {
      const response = await accessibilityAPI.updateRequirements(userId, newRequirements);
      setRequirements(response.data.requirements || newRequirements);
    } catch (error) {
      console.error('Error updating accessibility requirements:', error);
      throw error;
    }
  }, [userId]);

  // Fetch text size settings
  const fetchSettings = useCallback(async () => {
    try {
      const response = await accessibilityAPI.getTextSizeSettings();
      setSettings(response.data.settings || {});
    } catch (error) {
      console.error('Error fetching accessibility settings:', error);
    }
  }, []);

  // Update text size settings
  const updateSettings = useCallback(async (newSettings) => {
    try {
      const response = await accessibilityAPI.updateTextSizeSettings(newSettings);
      setSettings(response.data.settings || newSettings);
    } catch (error) {
      console.error('Error updating accessibility settings:', error);
      throw error;
    }
  }, []);

  useEffect(() => {
    if (userId) {
      fetchRequirements();
      fetchSettings();
    }
  }, [userId, fetchRequirements, fetchSettings]);

  return {
    requirements,
    settings,
    loading,
    updateRequirements,
    updateSettings,
  };
};
