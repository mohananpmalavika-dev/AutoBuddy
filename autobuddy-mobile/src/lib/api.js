import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getDisplayMessage, getDisplayText } from './displayText';
import {
  clearSession as clearLegacySession,
  loadSession as loadLegacySession,
  saveSession as saveLegacySession,
} from './session';
import {
  clearSession as clearPersistentSession,
  extendSessionExpiry,
  isSessionValid,
  loadSession as loadPersistentSession,
  saveSession as savePersistentSession,
} from './persistentSessionManager';

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
let refreshInFlightPromise = null;
let refreshRetryBlockedUntilMs = 0;
const inFlightGetRequests = new Map();
const getRateLimitCooldowns = new Map();
const SERVER_ERROR_THRESHOLD = 3;
const OUTAGE_COOLDOWN_MS = 15000;
const RATE_LIMIT_COOLDOWN_MS = 30000;
const RATE_LIMIT_MIN_COOLDOWN_MS = 5000;
const RATE_LIMIT_MAX_COOLDOWN_MS = 120000;
const REFRESH_FAILURE_COOLDOWN_MS = 60000;
const REFRESH_RATE_LIMIT_COOLDOWN_MS = 120000;
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const SESSION_EXPIRED_MESSAGE = 'Session expired. Please log in again.';
const SESSION_RECONNECT_MESSAGE = 'Could not confirm your login right now. Keeping your session active.';
const AUTH_EXPIRED_CODE = 'AUTH_EXPIRED';
const AUTH_RETRY_CODE = 'AUTH_RETRY_REQUIRED';

function createAuthExpiredError(message = SESSION_EXPIRED_MESSAGE) {
  const error = new Error(message);
  error.status = 401;
  error.code = AUTH_EXPIRED_CODE;
  error.authExpired = true;
  return error;
}

function createAuthRetryError(message = SESSION_RECONNECT_MESSAGE) {
  const error = new Error(message);
  error.status = 401;
  error.code = AUTH_RETRY_CODE;
  error.authExpired = false;
  error.sessionPreserved = true;
  return error;
}

async function safelyCall(fn) {
  try {
    return await fn();
  } catch {
    return null;
  }
}

async function clearAllSessions() {
  await Promise.allSettled([clearLegacySession(), clearPersistentSession()]);
}

async function shouldPreserveStoredSession() {
  const persistentValid = await safelyCall(isSessionValid);
  if (persistentValid) {
    return true;
  }

  const legacy = normalizeStoredSession(await safelyCall(loadLegacySession));
  return Boolean(legacy?.token);
}

async function failRefreshWithoutClearingValidSession(message = SESSION_RECONNECT_MESSAGE) {
  if (await shouldPreserveStoredSession()) {
    throw createAuthRetryError(message);
  }

  await clearAllSessions();
  throw createAuthExpiredError();
}

function normalizeStoredSession(session) {
  if (!session || typeof session !== 'object') {
    return null;
  }

  const token = String(session.token || session.access_token || session.accessToken || '').trim();
  if (!token) {
    return null;
  }

  const refreshToken = String(session.refresh_token || session.refreshToken || '').trim();
  return {
    ...session,
    token,
    refresh_token: refreshToken || undefined,
  };
}

async function loadBestSession() {
  const [legacySession, persistentSession] = await Promise.all([
    safelyCall(loadLegacySession),
    safelyCall(loadPersistentSession),
  ]);
  const legacy = normalizeStoredSession(legacySession);
  const persistent = normalizeStoredSession(persistentSession);

  return persistent?.refresh_token ? persistent : legacy?.refresh_token ? legacy : persistent || legacy;
}

async function saveAllSessions(session) {
  await Promise.allSettled([saveLegacySession(session), savePersistentSession(session)]);
}

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
    const detailMessage = getDisplayMessage(detail, '');
    if (detailMessage) {
      return detailMessage;
    }
  }

  const dataMessage = getDisplayText(data?.message, '');
  if (dataMessage) {
    return dataMessage;
  }

  if (typeof data === 'string' && data.trim()) {
    return data.trim();
  }

  return `Request failed (${status})`;
}

async function readResponsePayload(response) {
  const raw = await response.text();
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function getRefreshCooldownMs(status) {
  if (status === 429) {
    return REFRESH_RATE_LIMIT_COOLDOWN_MS;
  }
  if (status >= 500 || status === 0) {
    return REFRESH_FAILURE_COOLDOWN_MS;
  }
  return 30000;
}

function pauseRefreshRetries(status) {
  refreshRetryBlockedUntilMs = Math.max(
    refreshRetryBlockedUntilMs,
    Date.now() + getRefreshCooldownMs(Number(status || 0)),
  );
}

function getRetryAfterCooldownMs(response) {
  const rawRetryAfter = response?.headers?.get?.('Retry-After');
  if (!rawRetryAfter) {
    return RATE_LIMIT_COOLDOWN_MS;
  }

  const seconds = Number(rawRetryAfter);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(RATE_LIMIT_MAX_COOLDOWN_MS, Math.max(RATE_LIMIT_MIN_COOLDOWN_MS, seconds * 1000));
  }

  const retryDateMs = Date.parse(rawRetryAfter);
  if (Number.isFinite(retryDateMs)) {
    return Math.min(
      RATE_LIMIT_MAX_COOLDOWN_MS,
      Math.max(RATE_LIMIT_MIN_COOLDOWN_MS, retryDateMs - Date.now()),
    );
  }

  return RATE_LIMIT_COOLDOWN_MS;
}

function createRateLimitCooldownError(cooldownUntilMs) {
  const seconds = Math.max(1, Math.ceil((cooldownUntilMs - Date.now()) / 1000));
  const error = new Error(`Too many requests. Pausing this request for ${seconds}s.`);
  error.status = 429;
  error.rateLimitCooldown = true;
  error.retryAfterMs = Math.max(0, cooldownUntilMs - Date.now());
  return error;
}

function createBackendOutageError(cooldownUntilMs) {
  const retryAfterMs = Math.max(0, cooldownUntilMs - Date.now());
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  const error = new Error(`Backend temporarily unavailable. Retrying automatically in ${seconds}s.`);
  error.status = 503;
  error.backendOutage = true;
  error.retryAfterMs = retryAfterMs;
  return error;
}

async function performRefreshAccessToken() {
  if (Date.now() < refreshRetryBlockedUntilMs) {
    await failRefreshWithoutClearingValidSession();
  }

  const session = await loadBestSession();
  if (!session?.refresh_token) {
    pauseRefreshRetries(0);
    await failRefreshWithoutClearingValidSession();
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
  } catch {
    pauseRefreshRetries(0);
    await failRefreshWithoutClearingValidSession();
  }

  const payload = await readResponsePayload(response);
  if (!response.ok) {
    const message = extractErrorMessage(payload, response.status);
    if (response.status === 401 || response.status === 403) {
      refreshRetryBlockedUntilMs = 0;
      await clearAllSessions();
      throw createAuthExpiredError(message);
    }
    if (response.status >= 500) {
      backendOutageUntilMs = Math.max(backendOutageUntilMs, Date.now() + OUTAGE_COOLDOWN_MS);
    }
    pauseRefreshRetries(response.status);
    await failRefreshWithoutClearingValidSession(message || SESSION_RECONNECT_MESSAGE);
  }
  if (!payload?.access_token) {
    pauseRefreshRetries(0);
    await failRefreshWithoutClearingValidSession();
  }
  const nextSession = {
    ...session,
    token: payload.access_token,
    refresh_token: payload.refresh_token || session.refresh_token,
  };
  await saveAllSessions(nextSession);
  refreshRetryBlockedUntilMs = 0;
  return payload.access_token;
}

export async function refreshAccessToken() {
  if (!refreshInFlightPromise) {
    refreshInFlightPromise = performRefreshAccessToken().finally(() => {
      refreshInFlightPromise = null;
    });
  }

  return refreshInFlightPromise;
}

export async function apiRequest(path, options = {}, legacyPath = undefined, legacyBody = undefined) {
  const requestArgs = Array.from(arguments);
  let shouldWrapLegacyResponse = false;
  if (typeof options === 'string') {
    const firstArg = String(path || '').trim();
    const secondArg = String(options || '').trim();
    const firstArgAsMethod = firstArg.toUpperCase();

    if (HTTP_METHODS.has(firstArgAsMethod)) {
      const fifthArg = requestArgs[4];
      const legacyOptions =
        legacyBody && typeof legacyBody === 'object' && !Array.isArray(legacyBody) ? legacyBody : {};
      options = {
        ...legacyOptions,
        method: firstArgAsMethod,
        body: legacyPath,
        token:
          typeof fifthArg === 'string'
            ? fifthArg
            : typeof legacyBody === 'string'
              ? legacyBody
              : legacyOptions.token,
      };
      path = secondArg;
    } else {
      shouldWrapLegacyResponse = true;
      options = {
        method: secondArg,
        token: firstArg,
        body: legacyBody,
      };
      path = legacyPath;
    }
  }

  const { method = 'GET', token, body, query, timeoutMs = 20000, _retry = false, isFormData = false } = options;
  const normalizedMethod = String(method || 'GET').toUpperCase();
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
    throw createBackendOutageError(backendOutageUntilMs);
  }

  const url = new URL(`${API_BASE_URL}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`);
  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const isAuthPath =
    normalizedPath.includes('/auth/login') ||
    normalizedPath.includes('/auth/register') ||
    normalizedPath.includes('/auth/google') ||
    normalizedPath.includes('/auth/refresh') ||
    normalizedPath.includes('/auth/_legacy/login') ||
    normalizedPath.includes('/auth/_legacy/google');
  let effectiveToken = token ? String(token).trim() : '';
  if (effectiveToken || !isAuthPath) {
    try {
      // Prefer the latest persisted access token to avoid stale in-memory token loops.
      const latestSession = await loadBestSession();
      const latestToken = String(latestSession?.token || '').trim();
      if (latestToken) {
        effectiveToken = latestToken;
      }
    } catch {
      // Ignore session read errors and continue with provided token.
    }
  }

  const requestDedupeKey =
    normalizedMethod === 'GET'
      ? [
          normalizedMethod,
          url.toString(),
          shouldWrapLegacyResponse ? 'wrap' : 'raw',
          effectiveToken ? effectiveToken.slice(-16) : 'anon',
        ].join('|')
      : null;

  if (requestDedupeKey) {
    const cooldownUntilMs = getRateLimitCooldowns.get(requestDedupeKey) || 0;
    if (cooldownUntilMs > Date.now()) {
      throw createRateLimitCooldownError(cooldownUntilMs);
    }
    getRateLimitCooldowns.delete(requestDedupeKey);

    const inFlightRequest = inFlightGetRequests.get(requestDedupeKey);
    if (inFlightRequest) {
      return inFlightRequest;
    }
  }

  const requestPromise = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const hasBody = body !== undefined && body !== null;
      const requestBody = isFormData || typeof body === 'string' ? body : hasBody ? JSON.stringify(body) : undefined;
      const shouldBypassCache = normalizedMethod === 'GET';
      const response = await fetch(url.toString(), {
        method: normalizedMethod,
        signal: controller.signal,
        cache: shouldBypassCache ? 'no-store' : 'default',
        headers: {
          Accept: 'application/json',
          ...(shouldBypassCache ? { 'Cache-Control': 'no-store', Pragma: 'no-cache' } : {}),
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
        let retryAfterMs = 0;
        if (response.status === 429) {
          retryAfterMs = getRetryAfterCooldownMs(response);
          if (requestDedupeKey) {
            getRateLimitCooldowns.set(requestDedupeKey, Date.now() + retryAfterMs);
          }
        }
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
          normalizedMethod === 'POST' &&
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
        if (response.status === 429) {
          error.rateLimitCooldown = true;
          error.retryAfterMs = retryAfterMs;
        }
        if (response.status >= 500 && backendOutageUntilMs > Date.now()) {
          error.backendOutage = true;
          error.retryAfterMs = Math.max(Number(error.retryAfterMs || 0), backendOutageUntilMs - Date.now());
        }
        throw error;
      }

      consecutiveServerErrors = 0;
      backendOutageUntilMs = 0;

      if (effectiveToken && !isAuthPath) {
        await safelyCall(extendSessionExpiry);
      }

      return shouldWrapLegacyResponse ? { data } : data;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('Network timeout. Please check connection.');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  })();

  if (requestDedupeKey) {
    inFlightGetRequests.set(requestDedupeKey, requestPromise);
    const clearInFlightRequest = () => {
      if (inFlightGetRequests.get(requestDedupeKey) === requestPromise) {
        inFlightGetRequests.delete(requestDedupeKey);
      }
    };
    requestPromise.then(clearInFlightRequest, clearInFlightRequest);
  }

  return requestPromise;
}
