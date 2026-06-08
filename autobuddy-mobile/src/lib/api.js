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
const ACCESS_TOKEN_REFRESH_SKEW_MS = 60000;
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

function decodeBase64UrlJson(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');

  try {
    if (typeof globalThis.atob === 'function') {
      const binary = globalThis.atob(padded);
      try {
        return JSON.parse(
          decodeURIComponent(
            Array.from(binary, (char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''),
          ),
        );
      } catch {
        return JSON.parse(binary);
      }
    }

    const bufferCtor = globalThis.Buffer;
    if (typeof bufferCtor?.from === 'function') {
      return JSON.parse(bufferCtor.from(padded, 'base64').toString('utf8'));
    }
  } catch {
    return null;
  }

  return null;
}

function getJwtPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    return null;
  }
  const payload = decodeBase64UrlJson(parts[1]);
  return payload && typeof payload === 'object' ? payload : null;
}

export function getAccessTokenExpiryMs(token) {
  const payload = getJwtPayload(token);
  const exp = Number(payload?.exp || 0);
  if (!Number.isFinite(exp) || exp <= 0) {
    return null;
  }
  return exp * 1000;
}

export function isAccessTokenExpiringSoon(token, skewMs = ACCESS_TOKEN_REFRESH_SKEW_MS) {
  const expiresAtMs = getAccessTokenExpiryMs(token);
  if (!expiresAtMs) {
    return false;
  }
  return expiresAtMs <= Date.now() + Math.max(0, Number(skewMs || 0));
}

async function shouldPreserveStoredSession() {
  const session = await loadBestSession();
  if (!session?.token) {
    return false;
  }

  if (session.refresh_token && (await safelyCall(isSessionValid))) {
    return true;
  }

  return !isAccessTokenExpiringSoon(session.token, 0);
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

function getPayloadErrorCode(payload) {
  if (!payload || typeof payload !== 'object') {
    return '';
  }
  return String(payload?.error?.code || payload?.code || payload?.detail?.code || '').trim();
}

function shouldTripBackendOutage(status, payload) {
  if (status === 502 || status === 503) {
    return true;
  }
  if (status === 504) {
    return getPayloadErrorCode(payload) !== 'driver_dashboard_timeout';
  }
  return false;
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
    if (shouldTripBackendOutage(response.status, payload)) {
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

export async function getFreshAccessToken(preferredToken = '', options = {}) {
  const refreshSkewMs = Number(options.refreshSkewMs ?? ACCESS_TOKEN_REFRESH_SKEW_MS);
  let effectiveToken = String(preferredToken || '').trim();

  try {
    const latestSession = await loadBestSession();
    const latestToken = String(latestSession?.token || '').trim();
    if (latestToken) {
      effectiveToken = latestToken;
    }
  } catch {
    // Fall back to the caller-provided token.
  }

  if (!effectiveToken) {
    return '';
  }

  if (!isAccessTokenExpiringSoon(effectiveToken, refreshSkewMs)) {
    return effectiveToken;
  }

  return refreshAccessToken();
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

  if (effectiveToken && !isAuthPath && !_retry && isAccessTokenExpiringSoon(effectiveToken)) {
    effectiveToken = await getFreshAccessToken(effectiveToken);
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
        if (shouldTripBackendOutage(response.status, data)) {
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
        if (shouldTripBackendOutage(response.status, data) && backendOutageUntilMs > Date.now()) {
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

export const airportAPI = {
  listTerminals: (token, query = {}) =>
    apiRequest('/v1/airport/terminals', { token, query }),

  listFlights: (token, terminalId, query = {}) =>
    apiRequest(`/v1/airport/terminals/${encodeURIComponent(terminalId)}/flights`, { token, query }),

  getFlight: (token, flightId) =>
    apiRequest(`/v1/airport/flights/${encodeURIComponent(flightId)}`, { token }),

  listRides: (token, terminalId, query = {}) =>
    apiRequest(`/v1/airport/terminals/${encodeURIComponent(terminalId)}/rides`, { token, query }),

  requestRide: (token, payload) =>
    apiRequest('/v1/airport/rides/request', {
      method: 'POST',
      token,
      body: payload,
    }),

  acceptRide: (token, rideId, driverId) =>
    apiRequest(`/v1/airport/rides/${encodeURIComponent(rideId)}/accept`, {
      method: 'POST',
      token,
      body: { driver_id: driverId },
    }),

  updateFlightDelay: (token, rideId, delayMinutes) =>
    apiRequest(`/v1/airport/rides/${encodeURIComponent(rideId)}/flight-delay`, {
      method: 'POST',
      token,
      body: { delay_minutes: delayMinutes },
    }),

  getParkingAvailability: (token, terminalId) =>
    apiRequest(`/v1/airport/terminals/${encodeURIComponent(terminalId)}/parking/availability`, { token }),

  getDemand: (token, terminalId, query = {}) =>
    apiRequest(`/v1/airport/terminals/${encodeURIComponent(terminalId)}/demand`, { token, query }),
};

export async function requestAirportRide(token, payload) {
  return airportAPI.requestRide(token, payload);
}

export const tourismAPI = {
  listPackageTypes: () =>
    apiRequest('/tourism/package-types'),

  listPackages: (query = {}) =>
    apiRequest('/tourism/packages', { query }),

  getPackage: (packageId) =>
    apiRequest(`/tourism/packages/${encodeURIComponent(packageId)}`),

  listAttractions: (city) =>
    apiRequest('/tourism/attractions', { query: { city } }),

  previewRoute: (payload) =>
    apiRequest('/tourism/route', {
      method: 'POST',
      body: payload,
    }),

  bookTour: (token, payload) =>
    apiRequest('/tourism/book', {
      method: 'POST',
      token,
      body: payload,
    }),

  markVisited: (token, bookingId, placeName) =>
    apiRequest(`/tourism/bookings/${encodeURIComponent(bookingId)}/visited`, {
      method: 'POST',
      token,
      body: { place_name: placeName },
    }),

  complete: (token, bookingId) =>
    apiRequest(`/tourism/bookings/${encodeURIComponent(bookingId)}/complete`, {
      method: 'POST',
      token,
    }),

  getSummary: (token, bookingId) =>
    apiRequest(`/tourism/bookings/${encodeURIComponent(bookingId)}/summary`, { token }),
};

export const womenOnlyRidesAPI = {
  book: (token, payload) =>
    apiRequest('/women-only-rides/book', {
      method: 'POST',
      token,
      body: payload,
    }),

  get: (token, rideId) =>
    apiRequest(`/women-only-rides/${encodeURIComponent(rideId)}`, { token }),

  verifyPickup: (token, rideId, otp) =>
    apiRequest(`/women-only-rides/${encodeURIComponent(rideId)}/verify-pickup`, {
      method: 'POST',
      token,
      body: { otp },
    }),

  sos: (token, rideId, payload = {}) =>
    apiRequest(`/women-only-rides/${encodeURIComponent(rideId)}/sos`, {
      method: 'POST',
      token,
      body: payload,
    }),

  complete: (token, rideId) =>
    apiRequest(`/women-only-rides/${encodeURIComponent(rideId)}/complete`, {
      method: 'POST',
      token,
    }),
};

export const rentalRidesAPI = {
  listPackages: (vehicleType) =>
    apiRequest('/rental-rides/packages', {
      query: vehicleType ? { vehicle_type: vehicleType } : undefined,
    }),

  book: (token, payload) =>
    apiRequest('/rental-rides/book', {
      method: 'POST',
      token,
      body: payload,
    }),

  get: (token, rideId) =>
    apiRequest(`/rental-rides/${encodeURIComponent(rideId)}`, { token }),

  start: (token, rideId, otp) =>
    apiRequest(`/rental-rides/${encodeURIComponent(rideId)}/start`, {
      method: 'POST',
      token,
      body: { otp },
    }),

  addStop: (token, rideId, stop) =>
    apiRequest(`/rental-rides/${encodeURIComponent(rideId)}/add-stop`, {
      method: 'POST',
      token,
      body: stop,
    }),

  markWaiting: (token, rideId, payload) =>
    apiRequest(`/rental-rides/${encodeURIComponent(rideId)}/waiting`, {
      method: 'POST',
      token,
      body: payload,
    }),

  complete: (token, rideId, actualDistanceKm) =>
    apiRequest(`/rental-rides/${encodeURIComponent(rideId)}/complete`, {
      method: 'POST',
      token,
      body: { actual_distance_km: actualDistanceKm },
    }),
};

export async function bookRentalRide(token, payload) {
  return rentalRidesAPI.book(token, payload);
}
