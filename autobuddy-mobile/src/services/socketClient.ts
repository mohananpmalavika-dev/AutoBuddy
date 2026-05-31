/**
 * Socket.IO Client Service - Real-time communication
 *
 * Handles real-time events:
 * - Driver location updates
 * - Ride status changes
 * - Notifications (system, support, payment)
 * - Admin alerts
 */

import type { Socket } from 'socket.io-client';
import { createAutoBuddySocket, disconnectAutoBuddySocket, getAutoBuddySocket } from '../lib/socket';
import { istISOString } from '../utils/time';

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
export const initializeSocket = (token: string, baseUrl?: string): Socket | null => {
  if (!token) {
    return null;
  }

  try {
    const socket = createAutoBuddySocket(token, baseUrl);

    socket.on('connect', () => {
      console.log('Socket connected:', socket.id);
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    socket.on('error', (error: unknown) => {
      console.error('Socket error:', error);
    });

    return socket;
  } catch (error) {
    console.error('Socket initialization failed:', error);
    return null;
  }
};

/**
 * Get current shared Socket instance
 */
export const getSocket = (): Socket | null => {
  return getAutoBuddySocket();
};

/**
 * Register all event listeners for passenger user
 */
export const registerPassengerListeners = (handlers: SocketEventHandlers) => {
  const socket = getSocket();
  if (!socket) {
    return;
  }

  socket.on('driver_location_updated', (data) => {
    handlers.onDriverLocation?.(data);
  });

  socket.on('ride_status_changed', (data) => {
    handlers.onRideStatusChanged?.(data);
  });

  socket.on('notification', (data) => {
    handlers.onNotification?.(data);
  });

  socket.on('support_ticket_message', (data) => {
    handlers.onSupportTicketMessage?.(data);
  });

  socket.on('lost_item_reported', (data) => {
    handlers.onLostItemReported?.(data);
  });

  socket.on('pool_created', (data) => {
    handlers.onPoolCreated?.(data);
  });

  socket.on('accessibility_notification', (data) => {
    handlers.onAccessibilityNotification?.(data);
  });

  socket.on('payment_succeeded', (data) => {
    handlers.onPaymentSucceeded?.(data);
  });
};

/**
 * Register all event listeners for driver user
 */
export const registerDriverListeners = (handlers: SocketEventHandlers) => {
  const socket = getSocket();
  if (!socket) {
    return;
  }

  socket.on('ride_offer', (data) => {
    handlers.onNotification?.(data);
  });

  socket.on('ride_status_changed', (data) => {
    handlers.onRideStatusChanged?.(data);
  });

  socket.on('notification', (data) => {
    handlers.onNotification?.(data);
  });

  socket.on('support_ticket_message', (data) => {
    handlers.onSupportTicketMessage?.(data);
  });
};

/**
 * Register event listeners for admin user
 */
export const registerAdminListeners = (handlers: SocketEventHandlers) => {
  const socket = getSocket();
  if (!socket) {
    return;
  }

  socket.on('notification', (data) => {
    handlers.onNotification?.(data);
  });

  socket.on('ride_status_changed', (data) => {
    handlers.onRideStatusChanged?.(data);
  });

  socket.on('support_ticket_message', (data) => {
    handlers.onSupportTicketMessage?.(data);
  });

  socket.on('lost_item_reported', (data) => {
    handlers.onLostItemReported?.(data);
  });

  socket.on('pool_created', (data) => {
    handlers.onPoolCreated?.(data);
  });
};

/**
 * Join a specific room (e.g., user_{userId}, driver_{driverId}, admin)
 */
export const joinRoom = (room: string) => {
  const socket = getSocket();
  if (!socket) {
    return;
  }
  socket.emit('join_room', { room });
};

/**
 * Join ride tracking room and listen for location updates
 */
export const joinRideTracking = (rideId: string, handlers: SocketEventHandlers) => {
  const socket = getSocket();
  if (!socket) {
    return;
  }

  const roomName = `ride_${rideId}`;
  socket.emit('join_room', { room: roomName });

  socket.on('driver_location', (data) => {
    handlers.onDriverLocation?.(data);
  });

  socket.on('ride_status_changed', (data) => {
    handlers.onRideStatusChanged?.(data);
  });
};

/**
 * Emit driver location for real-time tracking
 */
export const emitDriverLocation = (rideId: string, latitude: number, longitude: number, accuracy?: number) => {
  const socket = getSocket();
  if (!socket) {
    return;
  }

  socket.emit('driver_location_update', {
    ride_id: rideId,
    latitude,
    longitude,
    accuracy: accuracy || 0,
    timestamp: istISOString(new Date()),
  });
};

/**
 * Leave a specific room
 */
export const leaveRoom = (room: string) => {
  const socket = getSocket();
  if (!socket) {
    return;
  }
  socket.emit('leave_room', { room });
};

/**
 * Leave ride tracking room
 */
export const leaveRideTracking = (rideId: string) => {
  const socket = getSocket();
  if (!socket) {
    return;
  }

  const roomName = `ride_${rideId}`;
  socket.emit('leave_room', { room: roomName });

  socket.off('driver_location');
  socket.off('ride_status_changed');
};

/**
 * Disconnect socket
 */
export const disconnectSocket = () => {
  disconnectAutoBuddySocket();
};

/**
 * Emit event to server
 */
export const emitEvent = (event: string, data: any) => {
  const socket = getSocket();
  if (!socket) {
    return;
  }
  socket.emit(event, data);
};

export default getSocket();
