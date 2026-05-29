import React, { useEffect, useState } from 'react';

import NotificationPanel from './NotificationPanel';
import { createAutoBuddySocket } from '../lib/socket';
import { loadSession, subscribeSession } from '../lib/session';

function getSessionToken(session) {
  return session?.token || session?.accessToken || session?.access_token || null;
}

export default function RealtimeNotificationHost() {
  const [token, setToken] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [socketState, setSocketState] = useState({ token: null, socket: null });

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
      setToken(getSessionToken(session));
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    const nextSocket = createAutoBuddySocket(token);
    const handleConnect = () => {
      setSocketState({ token, socket: nextSocket });
      setIsConnected(true);
    };
    const handleDisconnect = () => setIsConnected(false);
    const handleConnectError = () => setIsConnected(false);

    nextSocket.on('connect', handleConnect);
    nextSocket.on('disconnect', handleDisconnect);
    nextSocket.on('connect_error', handleConnectError);

    return () => {
      nextSocket.off('connect', handleConnect);
      nextSocket.off('disconnect', handleDisconnect);
      nextSocket.off('connect_error', handleConnectError);
      nextSocket.disconnect();
    };
  }, [token]);

  if (!token) {
    return null;
  }

  const currentSocket = socketState.token === token ? socketState.socket : null;

  return <NotificationPanel socket={currentSocket} isConnected={isConnected} />;
}
