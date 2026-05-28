import { io } from 'socket.io-client';

import { API_BASE_URL } from './api';

const DEFAULT_SOCKET_PATH = '/ws/socket.io';
const DEFAULT_SOCKET_TRANSPORTS = ['polling', 'websocket'];
const VALID_SOCKET_TRANSPORTS = new Set(DEFAULT_SOCKET_TRANSPORTS);

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
    process.env.EXPO_PUBLIC_SOCKET_BASE_URL || process.env.EXPO_PUBLIC_SOCKET_URL;
  const configured = trimTrailingSlashes(configuredSocketUrl);
  if (configured) {
    return configured;
  }

  const trimmed = trimTrailingSlashes(API_BASE_URL);
  if (!trimmed) {
    return '';
  }
  return trimmed.endsWith('/api') ? trimmed.slice(0, -4) : trimmed;
}

export function createAutoBuddySocket(token) {
  const baseUrl = resolveSocketBaseUrl();
  return io(baseUrl, {
    path: normalizeSocketPath(process.env.EXPO_PUBLIC_SOCKET_PATH),
    transports: resolveSocketTransports(),
    upgrade: true,
    auth: { token },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    randomizationFactor: 0.5,
    timeout: 20000,
    autoConnect: true,
  });
}
