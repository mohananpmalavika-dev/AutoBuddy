import { useEffect, useRef, useState, useCallback } from 'react';
import { webSocketService } from '../services/WebSocketService';
import { useAppSession } from './useAppSession';

interface WebSocketHookOptions {
  autoConnect?: boolean;
  onError?: (error: Error) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function useWebSocket(options: WebSocketHookOptions = {}) {
  const { session } = useAppSession();
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const connectionAttempted = useRef(false);

  // Setup connection and authentication
  useEffect(() => {
    if (!session?.token || connectionAttempted.current) {
      return;
    }

    connectionAttempted.current = true;

    const setupConnection = async () => {
      try {
        // Connect to WebSocket
        await webSocketService.connect();
        setIsConnected(true);
        options.onConnect?.();

        // Authenticate user
        await webSocketService.authenticate(
          session.user.id,
          session.token,
          session.user.role
        );
        setIsAuthenticated(true);

        // Setup error handler
        const unsubscribeError = webSocketService.onError((err) => {
          setError(err);
          options.onError?.(err);
        });

        // Setup disconnect handler
        const unsubscribeDisconnect = webSocketService.getSocket()?.on('disconnect', () => {
          setIsConnected(false);
          setIsAuthenticated(false);
          options.onDisconnect?.();
        });

        return () => {
          unsubscribeError();
          if (unsubscribeDisconnect) {
            webSocketService.getSocket()?.off('disconnect', unsubscribeDisconnect);
          }
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        options.onError?.(error);
        connectionAttempted.current = false; // Allow retry
      }
    };

    if (options.autoConnect !== false) {
      setupConnection();
    }

    return () => {
      // Don't disconnect on unmount - keep connection alive
    };
  }, [session?.token, session?.user.id, session?.user.role, options]);

  // Emit event
  const emit = useCallback((event: string, data?: any) => {
    if (!isConnected) {
      console.warn(`WebSocket not connected, cannot emit ${event}`);
      return;
    }
    webSocketService.emit(event, data);
  }, [isConnected]);

  // Subscribe to event
  const on = useCallback((event: string, callback: (data: any) => void) => {
    return webSocketService.on(event, callback);
  }, []);

  // Unsubscribe from event
  const off = useCallback((event: string, callback: (data: any) => void) => {
    webSocketService.off(event, callback);
  }, []);

  // Listen to one event
  const once = useCallback((event: string, callback: (data: any) => void) => {
    webSocketService.once(event, callback);
  }, []);

  return {
    isConnected,
    isAuthenticated,
    error,
    emit,
    on,
    off,
    once,
  };
}

export default useWebSocket;
