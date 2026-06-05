import { io } from 'socket.io-client';

import { API_BASE_URL } from './api';

const DEFAULT_SOCKET_PATH = '/socket.io';
const DEFAULT_SOCKET_TRANSPORTS = ['websocket'];
const VALID_SOCKET_TRANSPORTS = new Set(['websocket', 'polling']);

let sharedSocket = null;
let sharedToken = null;
let sharedBaseUrl = null;
let sharedRefCount = 0;

function trimTrailingSlashes(value) {
  return String(value || '').replace(/\/+$/, '');
}

function normalizeSocketPath(value) {
  const rawPath = String(value || DEFAULT_SOCKET_PATH).trim() || DEFAULT_SOCKET_PATH;
  const withLeadingSlash = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  return trimTrailingSlashes(withLeadingSlash);
}

function resolveSocketTransports() {
  const configured = process.env.EXPO_PUBLIC_SOCKET_TRANSPORTS;
  if (!configured) {
    return DEFAULT_SOCKET_TRANSPORTS;
  }

  const transports = configured
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => VALID_SOCKET_TRANSPORTS.has(entry));

  return transports.length > 0 ? transports : DEFAULT_SOCKET_TRANSPORTS;
}

function resolveSocketBaseUrl() {
  const configuredSocketUrl =
    process.env.EXPO_PUBLIC_SOCKET_BASE_URL ||
    process.env.EXPO_PUBLIC_SOCKET_URL ||
    process.env.REACT_APP_SOCKET_URL;
  const configured = trimTrailingSlashes(configuredSocketUrl);
  if (configured) {
    return configured;
  }

  const trimmed = trimTrailingSlashes(API_BASE_URL);
  if (!trimmed) {
    return typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : '';
  }
  return trimmed.endsWith('/api') ? trimmed.slice(0, -4) : trimmed;
}

function normalizeSocketUrl(value) {
  const rawValue = trimTrailingSlashes(value);
  if (!rawValue) {
    return '';
  }

  try {
    const url = new URL(rawValue, typeof window !== 'undefined' ? window.location.origin : undefined);
    if (typeof window !== 'undefined' && window.location?.protocol === 'https:' && url.protocol === 'http:') {
      url.protocol = 'https:';
    }
    return url.toString();
  } catch (error) {
    return rawValue;
  }
}

function resolveSocketUrl(baseUrl) {
  if (baseUrl) {
    return normalizeSocketUrl(baseUrl);
  }
  return normalizeSocketUrl(resolveSocketBaseUrl());
}

export function getSocketUrl(baseUrl) {
  return resolveSocketUrl(baseUrl);
}

export function getSocketPath(value = process.env.EXPO_PUBLIC_SOCKET_PATH) {
  return normalizeSocketPath(value);
}

export function getSocketTransports() {
  return resolveSocketTransports();
}

function releaseSharedSocket() {
  sharedRefCount = Math.max(0, sharedRefCount - 1);
  if (sharedRefCount > 0) {
    return;
  }

  if (sharedSocket) {
    try {
      const originalDisconnect = sharedSocket.__autoBuddyOriginalDisconnect;
      if (typeof originalDisconnect === 'function') {
        originalDisconnect();
      } else {
        sharedSocket.disconnect();
      }
    } catch (error) {
      console.error('Error disconnecting shared socket:', error);
    }
  }

  sharedSocket = null;
  sharedToken = null;
  sharedBaseUrl = null;
}

function wrapSocketInstance(socket) {
  if (socket.__autoBuddySocketWrapped) {
    return socket;
  }

  const originalDisconnect = socket.disconnect.bind(socket);
  Object.defineProperty(socket, '__autoBuddyOriginalDisconnect', {
    value: originalDisconnect,
    configurable: true,
    writable: false,
  });

  socket.disconnect = () => {
    releaseSharedSocket();
  };

  Object.defineProperty(socket, '__autoBuddySocketWrapped', {
    value: true,
    configurable: true,
    writable: false,
  });

  return socket;
}

export function getAutoBuddySocket() {
  return sharedSocket;
}

export function disconnectAutoBuddySocket() {
  if (!sharedSocket) {
    sharedRefCount = 0;
    sharedToken = null;
    sharedBaseUrl = null;
    return;
  }

  try {
    const originalDisconnect = sharedSocket.__autoBuddyOriginalDisconnect;
    if (typeof originalDisconnect === 'function') {
      originalDisconnect();
    } else {
      sharedSocket.disconnect();
    }
  } catch (error) {
    console.error('Error disconnecting shared socket:', error);
  }

  sharedSocket = null;
  sharedToken = null;
  sharedBaseUrl = null;
  sharedRefCount = 0;
}

export function createAutoBuddySocket(token, baseUrl) {
  if (!token) {
    throw new Error('Socket token is required.');
  }

  const url = resolveSocketUrl(baseUrl);
  if (!url) {
    throw new Error('Unable to resolve socket base URL.');
  }

  if (sharedSocket && sharedToken === token && sharedBaseUrl === url) {
    sharedRefCount += 1;
    return wrapSocketInstance(sharedSocket);
  }

  if (sharedSocket) {
    try {
      const originalDisconnect = sharedSocket.__autoBuddyOriginalDisconnect;
      if (typeof originalDisconnect === 'function') {
        originalDisconnect();
      } else {
        sharedSocket.disconnect();
      }
    } catch (error) {
      console.error('Error disconnecting previous shared socket:', error);
    }
    sharedSocket = null;
    sharedRefCount = 0;
  }

  sharedSocket = io(url, {
    path: getSocketPath(),
    transports: getSocketTransports(),
    upgrade: true,
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    randomizationFactor: 0.5,
    timeout: 20000,
    autoConnect: false,
  });

  sharedSocket.on('connect', () => {
    console.log('Socket.IO connected', url);
  });
  sharedSocket.on('connect_error', (error) => {
    console.error('Socket.IO connect_error', error);
  });
  sharedSocket.on('connect_timeout', () => {
    console.error('Socket.IO connect_timeout');
  });
  sharedSocket.on('disconnect', (reason) => {
    console.warn('Socket.IO disconnected', reason);
  });
  sharedSocket.on('reconnect_attempt', (attempt) => {
    console.log('Socket.IO reconnect attempt', attempt);
  });

  sharedSocket.connect();

  sharedToken = token;
  sharedBaseUrl = url;
  sharedRefCount = 1;

  return wrapSocketInstance(sharedSocket);
}
