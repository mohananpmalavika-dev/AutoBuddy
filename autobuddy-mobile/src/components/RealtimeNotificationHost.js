import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import NotificationPanel from './NotificationPanel';
import { loadSession, subscribeSession } from '../lib/session';
import { initializeSocket } from '../lib/socketManager';
import { initializeBackgroundNotifications } from '../lib/backgroundNotificationService';
import { API_BASE_URL } from '../lib/api-client';

function getSessionToken(session) {
  return session?.token || session?.accessToken || session?.access_token || null;
}

export default function RealtimeNotificationHost() {
  const [token, setToken] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [socketState, setSocketState] = useState({ token: null, socket: null });
  const [backgroundNotifications, setBackgroundNotifications] = useState([]);

  // Load session and subscribe to changes
  useEffect(() => {
    let mounted = true;

    loadSession()
      .then((session) => {
        if (mounted) {
          setToken(getSessionToken(session));
        }
      })
      .catch(() => {
        if (mounted) {
          setToken(null);
        }
      });

    const unsubscribe = subscribeSession((session) => {
      if (mounted) {
        setToken(getSessionToken(session));
      }
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // Initialize socket connection
  useEffect(() => {
    if (!token) {
      return undefined;
    }

    let mounted = true;

    async function setupSocket() {
      try {
        const socketManager = await initializeSocket(token, API_BASE_URL);
        
        const handleConnect = () => {
          if (mounted) {
            setSocketState({ token, socket: socketManager });
            setIsConnected(true);
          }
        };

        const handleDisconnect = () => {
          if (mounted) {
            setIsConnected(false);
          }
        };

        const handleConnectError = () => {
          if (mounted) {
            setIsConnected(false);
          }
        };

        // Subscribe to socket events
        const unsubscribe = socketManager.subscribe((event) => {
          if (event.type === 'connected') {
            handleConnect();
          } else if (event.type === 'disconnected') {
            handleDisconnect();
          } else if (event.type === 'error') {
            handleConnectError();
          } else if (event.type === 'notification') {
            // Handle notification
            if (mounted) {
              setBackgroundNotifications((prev) => [
                ...prev,
                { ...event.data, id: Math.random() },
              ]);
            }
          }
        });

        return () => {
          unsubscribe();
        };
      } catch (error) {
        console.error('Error setting up socket:', error);
      }
    }

    const cleanup = setupSocket();
    return () => {
      mounted = false;
      if (cleanup instanceof Promise) {
        cleanup.then((fn) => fn && fn());
      }
    };
  }, [token]);

  // Initialize background notification service
  useEffect(() => {
    let mounted = true;

    async function setupBackgroundNotifications() {
      try {
        const bgService = await initializeBackgroundNotifications();

        // Subscribe to background notifications
        const unsubscribe = bgService.subscribe((event) => {
          if (mounted && event.type === 'notification') {
            setBackgroundNotifications((prev) => [
              ...prev,
              { ...event.payload, id: Math.random() },
            ]);
          }
        });

        return unsubscribe;
      } catch (error) {
        console.error('Error setting up background notifications:', error);
      }
    }

    if (Platform.OS !== 'web') {
      const cleanup = setupBackgroundNotifications();
      return () => {
        mounted = false;
        if (cleanup instanceof Promise) {
          cleanup.then((fn) => fn && fn());
        }
      };
    }
  }, []);

  if (!token) {
    return null;
  }

  const currentSocket = socketState.token === token ? socketState.socket : null;

  return (
    <NotificationPanel
      socket={currentSocket}
      isConnected={isConnected}
      backgroundNotifications={backgroundNotifications}
      onProcessNotification={() => setBackgroundNotifications([])}
    />
  );
}
