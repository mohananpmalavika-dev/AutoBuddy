/**
 * Socket.IO Client Service - Real-time communication
 * 
 * Handles real-time events:
 * - Driver location updates
 * - Ride status changes
 * - Notifications (system, support, payment)
 * - Admin alerts
 */

import io, { Socket } from 'socket.io-client';

const SOCKET_URL = process.env.REACT_APP_SOCKET_URL || 'http://localhost:8000';

let socketInstance: Socket | null = null;

export interface SocketEventHandlers {
  onDriverLocation?: (data: any) => void;
  onRideStatusChanged?: (data: any) => void;
  onNotification?: (data: any) => void;
  onSupportTicketMessage?: (data: any) => void;
  onLostItemReported?: (data: any) => void;
  onPoolCreated?: (data: any) => void;
  onAccessibilityNotification?: (data: any) => void;
  onPaymentSucceeded?: (data: any) => void;
  onError?: (error: any) => void;
}

/**
 * Initialize Socket.IO connection with auth token
 */
export const initializeSocket = (token: string): Socket => {
  if (socketInstance && socketInstance.connected) {
    return socketInstance;
  }

  socketInstance = io(SOCKET_URL, {
    auth: {
      token,
    },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5,
  });

  socketInstance.on('connect', () => {
    console.log('Socket connected:', socketInstance?.id);
  });

  socketInstance.on('disconnect', () => {
    console.log('Socket disconnected');
  });

  socketInstance.on('error', (error) => {
    console.error('Socket error:', error);
  });

  return socketInstance;
};

/**
 * Get or initialize Socket instance
 */
export const getSocket = (): Socket | null => {
  return socketInstance;
};

/**
 * Register all event listeners for passenger user
 */
export const registerPassengerListeners = (handlers: SocketEventHandlers) => {
  if (!socketInstance) return;

  // Real-time location updates from driver
  socketInstance.on('driver_location_updated', (data) => {
    handlers.onDriverLocation?.(data);
  });

  // Ride status changes
  socketInstance.on('ride_status_changed', (data) => {
    handlers.onRideStatusChanged?.(data);
  });

  // Notifications
  socketInstance.on('notification', (data) => {
    handlers.onNotification?.(data);
  });

  // Support ticket messages
  socketInstance.on('support_ticket_message', (data) => {
    handlers.onSupportTicketMessage?.(data);
  });

  // Lost item reported
  socketInstance.on('lost_item_reported', (data) => {
    handlers.onLostItemReported?.(data);
  });

  // Pool created
  socketInstance.on('pool_created', (data) => {
    handlers.onPoolCreated?.(data);
  });

  // Accessibility notification
  socketInstance.on('accessibility_notification', (data) => {
    handlers.onAccessibilityNotification?.(data);
  });

  // Payment succeeded
  socketInstance.on('payment_succeeded', (data) => {
    handlers.onPaymentSucceeded?.(data);
  });
};

/**
 * Register all event listeners for driver user
 */
export const registerDriverListeners = (handlers: SocketEventHandlers) => {
  if (!socketInstance) return;

  // Ride offers from dispatcher
  socketInstance.on('ride_offer', (data) => {
    handlers.onNotification?.(data);
  });

  // Ride status updates
  socketInstance.on('ride_status_changed', (data) => {
    handlers.onRideStatusChanged?.(data);
  });

  // Notifications
  socketInstance.on('notification', (data) => {
    handlers.onNotification?.(data);
  });

  // Support messages
  socketInstance.on('support_ticket_message', (data) => {
    handlers.onSupportTicketMessage?.(data);
  });
};

/**
 * Register event listeners for admin user
 */
export const registerAdminListeners = (handlers: SocketEventHandlers) => {
  if (!socketInstance) return;

  // All system notifications
  socketInstance.on('notification', (data) => {
    handlers.onNotification?.(data);
  });

  // Ride status changes (all rides)
  socketInstance.on('ride_status_changed', (data) => {
    handlers.onRideStatusChanged?.(data);
  });

  // Support tickets
  socketInstance.on('support_ticket_message', (data) => {
    handlers.onSupportTicketMessage?.(data);
  });

  // Lost items
  socketInstance.on('lost_item_reported', (data) => {
    handlers.onLostItemReported?.(data);
  });

  // Ride pools
  socketInstance.on('pool_created', (data) => {
    handlers.onPoolCreated?.(data);
  });
};

/**
 * Join a specific room (e.g., user_{userId}, driver_{driverId}, admin)
 */
export const joinRoom = (room: string) => {
  if (!socketInstance) return;
  socketInstance.emit('join_room', { room });
};

/**
 * Leave a specific room
 */
export const leaveRoom = (room: string) => {
  if (!socketInstance) return;
  socketInstance.emit('leave_room', { room });
};

/**
 * Disconnect socket
 */
export const disconnectSocket = () => {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
};

/**
 * Emit event to server
 */
export const emitEvent = (event: string, data: any) => {
  if (!socketInstance) return;
  socketInstance.emit(event, data);
};

export default socketInstance;
