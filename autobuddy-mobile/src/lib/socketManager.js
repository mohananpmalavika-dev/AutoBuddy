/**
 * DEPRECATED: Legacy socket manager.
 * Use services/socketClient.ts and lib/socket.js for the shared socket implementation.
 *
 * Handles auto-reconnection, background persistence, and resilience
 * Works even when app is closed or in background
 */

import { Platform, AppState } from 'react-native';
import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadSession } from './persistentSessionManager';

const SOCKET_STATE_KEY = 'autobuddy_socket_state_v1';
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY_MS = 3000;
const MAX_RECONNECT_DELAY_MS = 30000;

class SocketManager {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.listeners = new Set();
    this.appStateSubscription = null;
    this.messageQueue = [];
    this.shouldMaintainConnection = true;
  }

  /**
   * Initialize socket connection
   */
  async initialize(token, baseUrl = '') {
    if (!token) {
      console.warn('Socket: No token provided');
      return;
    }

    if (this.socket) {
      // Already initialized
      if (this.socket.auth.token === token) {
        return;
      }
      this.disconnect();
    }

    try {
      // Create socket connection
      this.socket = io(baseUrl || this.getDefaultUrl(), {
        auth: { token },
        reconnection: true,
        reconnectionDelay: RECONNECT_DELAY_MS,
        reconnectionDelayMax: MAX_RECONNECT_DELAY_MS,
        reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
        transports: ['websocket', 'polling'],
        // Keep connection alive even in background
        closeOnBeforeUnload: false,
        // Persist connection state
        autoConnect: true,
      });

      // Attach event listeners
      this.attachEventListeners();

      // Setup app state monitoring for mobile
      if (Platform.OS !== 'web') {
        this.setupAppStateMonitoring();
      }

      // Save connection state
      await this.saveConnectionState(token);

      console.log('Socket: Initialized');
    } catch (error) {
      console.error('Socket: Initialization error:', error);
    }
  }

  /**
   * Get default socket URL
   */
  getDefaultUrl() {
    if (Platform.OS === 'web') {
      return window.location.origin;
    }
    return (
      process.env.EXPO_PUBLIC_SOCKET_BASE_URL ||
      process.env.EXPO_PUBLIC_API_BASE_URL ||
      (typeof __DEV__ !== 'undefined' && __DEV__ ? 'http://localhost:8001' : '')
    );
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    if (!this.socket) {
      return;
    }

    // Connection events
    this.socket.on('connect', () => this.handleConnect());
    this.socket.on('disconnect', () => this.handleDisconnect());
    this.socket.on('connect_error', (error) => this.handleConnectError(error));
    this.socket.on('reconnect', () => this.handleReconnect());
    this.socket.on('reconnect_attempt', () => this.handleReconnectAttempt());

    // Message events
    this.socket.on('notification', (data) => this.handleNotification(data));
    this.socket.on('message', (data) => this.handleMessage(data));
    this.socket.on('status_update', (data) => this.handleStatusUpdate(data));
  }

  /**
   * Handle successful connection
   */
  handleConnect() {
    console.log('Socket: Connected');
    this.isConnected = true;
    this.reconnectAttempts = 0;

    // Process queued messages
    this.processMessageQueue();

    // Notify listeners
    this.notifyListeners({
      type: 'connected',
      timestamp: Date.now(),
    });
  }

  /**
   * Handle disconnection
   */
  handleDisconnect(reason) {
    console.log('Socket: Disconnected -', reason);
    this.isConnected = false;

    // Don't auto-reconnect if user explicitly logged out
    if (!this.shouldMaintainConnection) {
      return;
    }

    // Notify listeners
    this.notifyListeners({
      type: 'disconnected',
      reason,
      timestamp: Date.now(),
    });

    // Attempt auto-reconnect
    if (this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.scheduleReconnect();
    }
  }

  /**
   * Handle connection error
   */
  handleConnectError(error) {
    console.error('Socket: Connection error:', error);

    this.notifyListeners({
      type: 'error',
      error: error.message || String(error),
      timestamp: Date.now(),
    });
  }

  /**
   * Handle reconnection
   */
  handleReconnect() {
    console.log('Socket: Reconnected');
    this.reconnectAttempts = 0;
  }

  /**
   * Handle reconnection attempt
   */
  handleReconnectAttempt() {
    this.reconnectAttempts++;
    console.log(`Socket: Reconnect attempt ${this.reconnectAttempts}`);
  }

  /**
   * Schedule reconnection
   */
  scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }

    const delay = Math.min(
      RECONNECT_DELAY_MS * Math.pow(1.5, this.reconnectAttempts),
      MAX_RECONNECT_DELAY_MS
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.socket && this.shouldMaintainConnection) {
        this.socket.connect();
      }
    }, delay);
  }

  /**
   * Handle incoming notification
   */
  handleNotification(data) {
    console.log('Socket: Notification received:', data);

    this.notifyListeners({
      type: 'notification',
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle incoming message
   */
  handleMessage(data) {
    console.log('Socket: Message received:', data);

    this.notifyListeners({
      type: 'message',
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle status update
   */
  handleStatusUpdate(data) {
    console.log('Socket: Status update:', data);

    this.notifyListeners({
      type: 'status_update',
      data,
      timestamp: Date.now(),
    });
  }

  /**
   * Setup app state monitoring for mobile
   */
  setupAppStateMonitoring() {
    if (Platform.OS === 'web' || !AppState) {
      return;
    }

    this.appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        this.handleAppForeground();
      } else if (state === 'background' || state === 'inactive') {
        this.handleAppBackground();
      }
    });
  }

  /**
   * Handle app coming to foreground
   */
  handleAppForeground() {
    console.log('Socket: App coming to foreground');

    if (!this.isConnected && this.shouldMaintainConnection && this.socket) {
      this.socket.connect();
    }

    this.notifyListeners({
      type: 'app_foreground',
      timestamp: Date.now(),
    });
  }

  /**
   * Handle app going to background
   */
  handleAppBackground() {
    console.log('Socket: App going to background');

    this.notifyListeners({
      type: 'app_background',
      timestamp: Date.now(),
    });

    // Keep connection alive in background
  }

  /**
   * Process queued messages
   */
  processMessageQueue() {
    while (this.messageQueue.length > 0 && this.isConnected) {
      const { event, data, callback } = this.messageQueue.shift();
      try {
        if (callback) {
          this.socket.emit(event, data, callback);
        } else {
          this.socket.emit(event, data);
        }
      } catch (error) {
        console.error('Error processing queued message:', error);
      }
    }
  }

  /**
   * Queue message for later delivery
   */
  queueMessage(event, data, callback) {
    this.messageQueue.push({ event, data, callback });
  }

  /**
   * Emit event with auto-queue on disconnect
   */
  emit(event, data, callback) {
    if (!this.socket) {
      if (callback) {
        callback(new Error('Socket not initialized'));
      }
      return;
    }

    if (this.isConnected) {
      if (callback) {
        this.socket.emit(event, data, callback);
      } else {
        this.socket.emit(event, data);
      }
    } else {
      // Queue for later
      this.queueMessage(event, data, callback);
    }
  }

  /**
   * Subscribe to socket events
   */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners
   */
  notifyListeners(event) {
    this.listeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error calling socket listener:', error);
      }
    });
  }

  /**
   * Save connection state for recovery
   */
  async saveConnectionState(token) {
    try {
      const state = {
        token,
        connectedAt: Date.now(),
      };
      await AsyncStorage.setItem(SOCKET_STATE_KEY, JSON.stringify(state));
    } catch (error) {
      console.error('Error saving socket state:', error);
    }
  }

  /**
   * Check if should restore connection
   */
  async shouldRestoreConnection() {
    try {
      const session = await loadSession();
      const stateRaw = await AsyncStorage.getItem(SOCKET_STATE_KEY);

      if (!session || !session.token || !stateRaw) {
        return false;
      }

      const state = JSON.parse(stateRaw);
      // Restore if within 24 hours
      const maxAge = 24 * 60 * 60 * 1000;
      return Date.now() - state.connectedAt < maxAge;
    } catch (error) {
      console.error('Error checking should restore connection:', error);
      return false;
    }
  }

  /**
   * Disconnect socket
   */
  disconnect() {
    console.log('Socket: Disconnecting');
    this.shouldMaintainConnection = false;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.isConnected = false;
    this.messageQueue = [];
    this.listeners.clear();
  }

  /**
   * Get connection status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      queuedMessages: this.messageQueue.length,
    };
  }
}

// Singleton instance
let socketManager = null;

/**
 * Get or create the socket manager
 */
export function getSocketManager() {
  if (!socketManager) {
    socketManager = new SocketManager();
  }
  return socketManager;
}

/**
 * Initialize socket connection
 */
export async function initializeSocket(token, baseUrl) {
  const manager = getSocketManager();
  await manager.initialize(token, baseUrl);
  return manager;
}

/**
 * Disconnect socket
 */
export function disconnectSocket() {
  if (socketManager) {
    socketManager.disconnect();
    socketManager = null;
  }
}

export default SocketManager;
