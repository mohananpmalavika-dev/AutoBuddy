import React, { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import NotificationPanel from './NotificationPanel';
import {
  loadSession as loadLegacySession,
  subscribeSession as subscribeLegacySession,
} from '../lib/session';
import {
  loadSession as loadPersistentSession,
  subscribeSession as subscribePersistentSession,
} from '../lib/persistentSessionManager';
import { initializeSocket } from '../services/socketClient';
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
    let legacySession = null;
    let persistentSession = null;

    const syncToken = () => {
      if (mounted) {
        setToken(getSessionToken(persistentSession) || getSessionToken(legacySession));
      }
    };

    Promise.all([
      loadPersistentSession().catch(() => null),
      loadLegacySession().catch(() => null),
    ])
      .then(([persistent, legacy]) => {
        if (mounted) {
          persistentSession = persistent;
          legacySession = legacy;
          syncToken();
        }
      })
      .catch(() => {
        if (mounted) {
          setToken(null);
        }
      });

    const unsubscribePersistent = subscribePersistentSession((session) => {
      persistentSession = session;
      syncToken();
    });
    const unsubscribeLegacy = subscribeLegacySession((session) => {
      legacySession = session;
      syncToken();
    });

    return () => {
      mounted = false;
      unsubscribePersistent();
      unsubscribeLegacy();
    };
  }, []);

  // Initialize socket connection
  useEffect(() => {
    if (!token) {
      return undefined;
    }

    let mounted = true;
    let socket = null;

    async function setupSocket() {
      try {
        socket = await initializeSocket(token, API_BASE_URL);
        if (!socket) {
          return undefined;
        }

        const handleConnect = () => {
          if (mounted) {
            setSocketState({ token, socket });
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

        const handleNotification = (data) => {
          if (mounted) {
            setBackgroundNotifications((prev) => [
              ...prev,
              { ...data, id: Math.random() },
            ]);
          }
        };

        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);
        socket.on('connect_error', handleConnectError);
        socket.on('notification', handleNotification);

        if (socket.connected) {
          handleConnect();
        }

        return () => {
          socket.off('connect', handleConnect);
          socket.off('disconnect', handleDisconnect);
          socket.off('connect_error', handleConnectError);
          socket.off('notification', handleNotification);
        };
      } catch (error) {
        console.error('Error setting up socket:', error);
      }

      return undefined;
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
