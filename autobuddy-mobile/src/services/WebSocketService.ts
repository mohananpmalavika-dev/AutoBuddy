import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type WebSocketEventCallback = (data: any) => void;
export type WebSocketErrorCallback = (error: Error) => void;

interface WebSocketConfig {
  url: string;
  reconnection: boolean;
  reconnectionDelay: number;
  reconnectionAttempts: number;
  transports: ('websocket' | 'polling')[];
}

class WebSocketService {
  private socket: Socket | null = null;
  private config: WebSocketConfig;
  private eventListeners: Map<string, Set<WebSocketEventCallback>> = new Map();
  private errorListeners: Set<WebSocketErrorCallback> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isAuthenticated = false;

  constructor(config: Partial<WebSocketConfig> = {}) {
    this.config = {
      url: config.url || 'http://localhost:8000',
      reconnection: config.reconnection !== false,
      reconnectionDelay: config.reconnectionDelay || 1000,
      reconnectionAttempts: config.reconnectionAttempts || 5,
      transports: config.transports || ['websocket', 'polling'],
    };
  }

  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    if (this.socket?.connected) {
      return;
    }

    try {
      this.socket = io(this.config.url, {
        transports: this.config.transports,
        reconnection: this.config.reconnection,
        reconnectionDelay: this.config.reconnectionDelay,
        reconnectionAttempts: this.config.reconnectionAttempts,
        reconnectionDelayMax: 10000,
        autoConnect: true,
      });

      this.setupEventHandlers();
      this.startHeartbeat();

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('WebSocket connection timeout'));
        }, 5000);

        this.socket?.on('connect', () => {
          clearTimeout(timeout);
          this.reconnectAttempts = 0;
          console.log('[WebSocket] Connected');
          resolve();
        });

        this.socket?.on('connect_error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    } catch (error) {
      this.emitError(error as Error);
      throw error;
    }
  }

  /**
   * Authenticate user with server
   */
  async authenticate(userId: string, token: string, role: string): Promise<void> {
    if (!this.socket?.connected) {
      await this.connect();
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Authentication timeout'));
      }, 5000);

      this.socket?.emit('authenticate', { user_id: userId, token, role });

      this.socket?.once('auth_response', (data) => {
        clearTimeout(timeout);
        if (data.status === 'authenticated') {
          this.isAuthenticated = true;
          console.log('[WebSocket] Authenticated as', data.role);
          resolve();
        } else {
          reject(new Error('Authentication failed: ' + data.reason));
        }
      });
    });
  }

  /**
   * Subscribe to an event
   */
  on(event: string, callback: WebSocketEventCallback): () => void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }

    const listeners = this.eventListeners.get(event)!;
    listeners.add(callback);

    // Actual socket listener
    this.socket?.on(event, callback);

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from an event
   */
  off(event: string, callback: WebSocketEventCallback): void {
    this.socket?.off(event, callback);

    const listeners = this.eventListeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Listen for one event only
   */
  once(event: string, callback: WebSocketEventCallback): void {
    this.socket?.once(event, callback);
  }

  /**
   * Emit an event to server
   */
  emit(event: string, data?: any): void {
    if (!this.socket?.connected) {
      console.warn(`[WebSocket] Not connected, queuing event: ${event}`);
      return;
    }

    this.socket?.emit(event, data);
  }

  /**
   * Subscribe to passenger ride
   */
  subscribeToRide(rideId: string): void {
    this.emit('passenger:subscribe_ride', { ride_id: rideId });
  }

  /**
   * Unsubscribe from passenger ride
   */
  unsubscribeFromRide(rideId: string): void {
    this.emit('passenger:unsubscribe_ride', { ride_id: rideId });
  }

  /**
   * Subscribe to ride requests (driver)
   */
  subscribeToRideRequests(): void {
    this.emit('driver:subscribe_ride_requests');
  }

  /**
   * Update driver location
   */
  updateDriverLocation(latitude: number, longitude: number, rideId?: string, accuracy?: number, speed?: number): void {
    this.emit('driver:update_location', {
      ride_id: rideId,
      latitude,
      longitude,
      accuracy: accuracy || 50,
      speed: speed || 0,
    });
  }

  /**
   * Toggle driver online status
   */
  toggleDriverStatus(online: boolean): void {
    this.emit('driver:online_status_changed', { online });
  }

  /**
   * Subscribe to operator fleet
   */
  subscribeToFleet(): void {
    this.emit('operator:subscribe_fleet');
  }

  /**
   * Subscribe to admin alerts
   */
  subscribeToAlerts(): void {
    this.emit('admin:subscribe_alerts');
  }

  /**
   * Subscribe to admin system health
   */
  subscribeToSystemHealth(): void {
    this.emit('admin:subscribe_system_health');
  }

  /**
   * Send heartbeat to keep connection alive
   */
  private startHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (this.socket?.connected) {
        this.emit('heartbeat', { timestamp: new Date().toISOString() });
      }
    }, 30000);
  }

  /**
   * Setup default event handlers
   */
  private setupEventHandlers(): void {
    this.socket?.on('connect', () => {
      console.log('[WebSocket] Connected');
      this.reconnectAttempts = 0;
    });

    this.socket?.on('disconnect', (reason: string) => {
      console.log('[WebSocket] Disconnected:', reason);
      this.isAuthenticated = false;
    });

    this.socket?.on('connect_error', (error: Error) => {
      console.error('[WebSocket] Connection error:', error);
      this.emitError(error);
    });

    this.socket?.on('error', (error: any) => {
      console.error('[WebSocket] Error:', error);
      this.emitError(new Error(error?.message || String(error)));
    });

    this.socket?.on('reconnect_attempt', () => {
      this.reconnectAttempts++;
      console.log(`[WebSocket] Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
    });

    this.socket?.on('heartbeat_response', () => {
      // Connection is alive
    });
  }

  /**
   * Emit error to all error listeners
   */
  private emitError(error: Error): void {
    this.errorListeners.forEach(callback => callback(error));
  }

  /**
   * Add error listener
   */
  onError(callback: WebSocketErrorCallback): () => void {
    this.errorListeners.add(callback);
    return () => this.errorListeners.delete(callback);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  /**
   * Check if authenticated
   */
  isAuth(): boolean {
    return this.isAuthenticated;
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.socket?.disconnect();
    this.socket = null;
    this.eventListeners.clear();
    this.isAuthenticated = false;
    console.log('[WebSocket] Disconnected');
  }

  /**
   * Get socket instance (for advanced usage)
   */
  getSocket(): Socket | null {
    return this.socket;
  }
}

// Export singleton instance
export const webSocketService = new WebSocketService({
  url: process.env.REACT_APP_API_URL || 'http://localhost:8000',
});

export default WebSocketService;
