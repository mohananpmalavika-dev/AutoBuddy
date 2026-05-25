import { io } from 'socket.io-client';

import { API_BASE_URL } from './api';

function resolveSocketBaseUrl() {
  const trimmed = String(API_BASE_URL || '').replace(/\/+$/, '');
  if (!trimmed) {
    return '';
  }
  return trimmed.endsWith('/api') ? trimmed.slice(0, -4) : trimmed;
}

export function createAutoBuddySocket(token) {
  const baseUrl = resolveSocketBaseUrl();
  return io(baseUrl, {
    path: '/ws/socket.io',
    transports: ['websocket'],
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
