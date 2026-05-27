import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { clearSession, loadSession, saveSession } from './session';

const DEFAULT_BACKEND_PORT = process.env.EXPO_PUBLIC_API_PORT || '8001';
const DEFAULT_PROD_API_BASE_URL = 'https://autobuddy-z1vx.onrender.com/api';

function getHostFromUri(uri) {
  if (!uri || typeof uri !== 'string') {
    return null;
  }

  const trimmed = uri.trim();
  if (!trimmed) {
    return null;
  }

  const withoutScheme = trimmed.replace(/^[a-z]+:\/\//i, '');
  const withoutPath = withoutScheme.split('/')[0];
  return withoutPath.split(':')[0] || null;
}

function getHostFromExpo() {
  const candidates = [
    Constants.expoConfig?.hostUri,
    Constants.expoGoConfig?.debuggerHost,
    Constants.manifest2?.extra?.expoClient?.hostUri,
    Constants.manifest?.debuggerHost,
  ];

  for (const candidate of candidates) {
    const host = getHostFromUri(candidate);
    if (host) {
      return host;
    }
  }

  return null;
}

function getDefaultApiBaseUrl() {
  const expoHost = getHostFromExpo();
  if (expoHost) {
    return `http://${expoHost}:${DEFAULT_BACKEND_PORT}/api`;
  }

  if (Platform.OS === 'android') {
    return `http://10.0.2.2:${DEFAULT_BACKEND_PORT}/api`;
  }
  return DEFAULT_PROD_API_BASE_URL;
}

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.replace(/\/$/, '') || getDefaultApiBaseUrl();

let backendOutageUntilMs = 0;
let consecutiveServerErrors = 0;
const SERVER_ERROR_THRESHOLD = 3;
const OUTAGE_COOLDOWN_MS = 15000;

function extractErrorMessage(data, status) {
  const detail = data?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim();
  }

  if (Array.isArray(detail) && detail.length > 0) {
    const joined = detail
      .map((entry) => {
        if (typeof entry === 'string') {
          return entry;
        }
        if (entry && typeof entry === 'object') {
          const msg = String(entry.msg || entry.message || '').trim();
          const loc = Array.isArray(entry.loc) ? entry.loc.filter(Boolean).join('.') : '';
          if (msg && loc) {
            return `${loc}: ${msg}`;
          }
          if (msg) {
            return msg;
          }
        }
        return '';
      })
      .filter(Boolean)
      .join('; ');
    if (joined) {
      return joined;
    }
  }

  if (detail && typeof detail === 'object') {
    const msg = String(detail.message || detail.msg || '').trim();
    if (msg) {
      return msg;
    }
  }

  if (typeof data?.message === 'string' && data.message.trim()) {
    return data.message.trim();
  }

  if (typeof data === 'string' && data.trim()) {
    return data.trim();
  }

  return `Request failed (${status})`;
}

export async function refreshAccessToken() {
  const session = await loadSession();
  if (!session?.refresh_token) {
    throw new Error('No refresh token');
  }
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!response.ok) {
    await clearSession();
    throw new Error('Session expired. Please login again.');
  }
  const payload = await response.json();
  const nextSession = {
    ...session,
    token: payload.access_token,
    refresh_token: payload.refresh_token || session.refresh_token,
  };
  await saveSession(nextSession);
  return payload.access_token;
}

export async function apiRequest(path, options = {}, legacyPath = undefined, legacyBody = undefined) {
  const legacySignature = typeof options === 'string';
  if (legacySignature) {
    options = {
      method: options,
      token: path,
      body: legacyBody,
    };
    path = legacyPath;
  }

  const { method = 'GET', token, body, query, timeoutMs = 20000, _retry = false, isFormData = false } = options;
  const nowMs = Date.now();
  let normalizedPath = String(path || '');
  if (normalizedPath === '/api') {
    normalizedPath = '';
  } else if (normalizedPath.startsWith('/api/')) {
    normalizedPath = normalizedPath.slice(4);
  }
  if (
    nowMs < backendOutageUntilMs &&
    !normalizedPath.includes('/auth/login') &&
    !normalizedPath.includes('/auth/_legacy/login')
  ) {
    const seconds = Math.max(1, Math.ceil((backendOutageUntilMs - nowMs) / 1000));
    const fastFailError = new Error(`Backend temporarily unavailable. Retrying automatically in ${seconds}s.`);
    fastFailError.status = 503;
    throw fastFailError;
  }

  const url = new URL(`${API_BASE_URL}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
  }

  let effectiveToken = token ? String(token).trim() : '';
  if (effectiveToken) {
    try {
      // Prefer the latest persisted access token to avoid stale in-memory token loops.
      const latestSession = await loadSession();
      const latestToken = String(latestSession?.token || '').trim();
      if (latestToken) {
        effectiveToken = latestToken;
      }
    } catch {
      // Ignore session read errors and continue with provided token.
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const hasBody = body !== undefined && body !== null;
    const requestBody = isFormData || typeof body === 'string' ? body : hasBody ? JSON.stringify(body) : undefined;
    const response = await fetch(url.toString(), {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(hasBody && !isFormData ? { 'Content-Type': 'application/json' } : {}),
        ...(effectiveToken ? { Authorization: `Bearer ${effectiveToken}` } : {}),
      },
      body: requestBody,
    });

    const raw = await response.text();
    let data = null;

    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = raw;
    }

    if (!response.ok) {
      if (response.status >= 500) {
        consecutiveServerErrors += 1;
        if (consecutiveServerErrors >= SERVER_ERROR_THRESHOLD) {
          backendOutageUntilMs = Date.now() + OUTAGE_COOLDOWN_MS;
        }
      } else {
        consecutiveServerErrors = 0;
      }
      if (
        response.status === 503 &&
        normalizedPath === '/auth/login' &&
        method.toUpperCase() === 'POST' &&
        body &&
        !options._legacyTried
      ) {
        return apiRequest('/auth/_legacy/login', {
          ...options,
          _legacyTried: true,
        });
      }
      if (
        response.status === 401 &&
        !_retry &&
        !normalizedPath.includes('/auth/login') &&
        !normalizedPath.includes('/auth/refresh')
      ) {
        const newToken = await refreshAccessToken();
        return apiRequest(normalizedPath, {
          ...options,
          token: newToken,
          _retry: true,
        });
      }
      const message = extractErrorMessage(data, response.status);
      const error = new Error(message);
      error.status = response.status;
      error.payload = data;
      throw error;
    }

    consecutiveServerErrors = 0;
    backendOutageUntilMs = 0;

    return legacySignature ? { data } : data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Network timeout. Please check connection.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
