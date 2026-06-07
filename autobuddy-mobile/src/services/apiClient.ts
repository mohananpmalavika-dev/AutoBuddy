/**
 * API Client Service - Centralized API communication layer
 * Handles all backend API calls for AutoBuddy
 * 
 * Configuration:
 * - Base URL: production uses EXPO_PUBLIC_API_BASE_URL / REACT_APP_API_URL or relative /api on web
 * - Auth: Bearer token from Context
 * - Timeout: 30 seconds
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse, create } from 'axios';
import { Platform } from 'react-native';
import {
  clearSession as clearPersistentSession,
  extendSessionExpiry,
  isSessionValid,
  loadSession as loadPersistentSession,
} from '../lib/persistentSessionManager';
import {
  clearSession as clearLegacySession,
  loadSession as loadLegacySession,
} from '../lib/session';
import { getFreshAccessToken, isAccessTokenExpiringSoon } from '../lib/api';
import { istISOString } from '../utils/time';

// API Base URL - adjust based on environment
const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ||
  process.env.REACT_APP_API_URL ||
  (typeof window !== 'undefined' ? '/api' : '')
)
  .replace(/\/$/, '')
  .replace(/\/api$/, '');
const SESSION_STORAGE_KEY = 'autobuddy_session_v1';
const SESSION_RECONNECT_MESSAGE = 'Could not confirm your login right now. Keeping your session active.';

type BrowserStorage = {
  getItem: (key: string) => string | null;
  removeItem: (key: string) => void;
};

type BrowserLocation = {
  href: string;
};

type BrowserRuntime = typeof globalThis & {
  localStorage?: BrowserStorage;
  location?: BrowserLocation;
};

type PayloadAxiosInstance = Omit<
  AxiosInstance,
  'request' | 'get' | 'delete' | 'head' | 'options' | 'post' | 'put' | 'patch'
> & {
  request<T = any, D = any>(config: AxiosRequestConfig<D>): Promise<T>;
  get<T = any, D = any>(url: string, config?: AxiosRequestConfig<D>): Promise<T>;
  delete<T = any, D = any>(url: string, config?: AxiosRequestConfig<D>): Promise<T>;
  head<T = any, D = any>(url: string, config?: AxiosRequestConfig<D>): Promise<T>;
  options<T = any, D = any>(url: string, config?: AxiosRequestConfig<D>): Promise<T>;
  post<T = any, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<T>;
  put<T = any, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<T>;
  patch<T = any, D = any>(url: string, data?: D, config?: AxiosRequestConfig<D>): Promise<T>;
};

const getBrowserRuntime = (): BrowserRuntime | null => {
  if (Platform.OS !== 'web' || typeof globalThis === 'undefined') {
    return null;
  }

  return globalThis as BrowserRuntime;
};

const getBrowserStorage = () => {
  const browserRuntime = getBrowserRuntime();
  if (!browserRuntime) {
    return null;
  }

  try {
    return browserRuntime.localStorage || null;
  } catch {
    return null;
  }
};

const getStoredAuthToken = async () => {
  try {
    const persistentSession = await loadPersistentSession();
    const persistentToken =
      persistentSession?.token || persistentSession?.access_token || persistentSession?.authToken || '';
    if (persistentToken) {
      return persistentToken;
    }

    const legacySession = await loadLegacySession();
    const legacyToken = legacySession?.token || legacySession?.access_token || legacySession?.authToken || '';
    if (legacyToken) {
      return legacyToken;
    }
  } catch {
    // Fall back to older raw storage paths below.
  }

  const browserStorage = getBrowserStorage();
  const browserToken = browserStorage?.getItem('authToken');
  if (browserToken) {
    return browserToken;
  }

  try {
    const rawSession = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
    const session = rawSession ? JSON.parse(rawSession) : null;
    return session?.token || session?.access_token || session?.authToken || '';
  } catch {
    return '';
  }
};

const clearStoredAuth = async () => {
  const browserStorage = getBrowserStorage();
  browserStorage?.removeItem('authToken');

  try {
    await Promise.allSettled([
      clearPersistentSession(),
      clearLegacySession(),
      AsyncStorage.removeItem(SESSION_STORAGE_KEY),
    ]);
  } catch {
    // Clearing auth should not mask the original API failure.
  }
};

const redirectToLoginIfWeb = () => {
  const location = getBrowserRuntime()?.location;
  if (location) {
    location.href = '/login';
  }
};

const shouldPreserveStoredAuth = async () => {
  try {
    const token = await getStoredAuthToken();
    if (!token || isAccessTokenExpiringSoon(token, 0)) {
      return false;
    }

    if (await isSessionValid()) {
      return true;
    }

    return true;
  } catch {
    return false;
  }
};

const isAuthRequestUrl = (url?: string) => {
  const value = String(url || '').toLowerCase();
  return (
    value.includes('/auth/login') ||
    value.includes('/auth/register') ||
    value.includes('/auth/google') ||
    value.includes('/auth/refresh') ||
    value.includes('/auth/_legacy/')
  );
};

const attachLegacyDataAlias = <T>(payload: T): T => {
  if (
    payload &&
    (typeof payload === 'object' || typeof payload === 'function') &&
    !Object.prototype.hasOwnProperty.call(payload, 'data')
  ) {
    try {
      Object.defineProperty(payload, 'data', {
        value: payload,
        enumerable: false,
        configurable: true,
      });
    } catch {
      // Some response objects, like Blob on certain platforms, are not extensible.
    }
  }
  return payload;
};

// Create axios instance with default config
const rawAxiosInstance: AxiosInstance = create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor to inject auth token
rawAxiosInstance.interceptors.request.use(
  async (config) => {
    let token = await getStoredAuthToken();
    if (token && !isAuthRequestUrl(config.url) && isAccessTokenExpiringSoon(token)) {
      token = await getFreshAccessToken(token);
    }
    if (token) {
      config.headers = config.headers || {};
      (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Add response interceptor with retry logic and error handling
let retryCount = 0;
const MAX_RETRIES = 3;

rawAxiosInstance.interceptors.response.use(
  async (response: AxiosResponse) => {
    const headers = response.config?.headers as Record<string, unknown> | undefined;
    const authorization = headers?.Authorization || headers?.authorization;
    if (authorization) {
      await extendSessionExpiry();
    }
    return attachLegacyDataAlias(response.data) as AxiosResponse;
  },
  async (error: AxiosError) => {
    // Handle 401 Unauthorized - token expired
    if (error.response?.status === 401) {
      const errorData = error.response?.data as AnyRecord;
      if (await shouldPreserveStoredAuth()) {
        const backendMessage = String(errorData?.error?.message || errorData?.message || '').trim();
        const message =
          backendMessage && !backendMessage.toLowerCase().includes('session expired')
            ? backendMessage
            : SESSION_RECONNECT_MESSAGE;
        return Promise.reject({
          message,
          code: 'AUTH_RETRY_REQUIRED',
          authExpired: false,
          sessionPreserved: true,
          status: 401,
          originalError: error,
        });
      }

      await clearStoredAuth();
      redirectToLoginIfWeb();
      return Promise.reject({
        message: errorData?.error?.message || 'Session expired. Please log in again.',
        code: 'AUTH_EXPIRED',
        authExpired: true,
        status: 401,
        originalError: error,
      });
    }

    // Handle 429 Too Many Requests - retry with exponential backoff
    if (error.response?.status === 429 && retryCount < MAX_RETRIES) {
      retryCount++;
      const delayMs = Math.pow(2, retryCount) * 1000;
      await new Promise(resolve => setTimeout(resolve, delayMs));
      return rawAxiosInstance(error.config!);
    }

    // Handle network errors - retry once
    if (!error.response && retryCount < 1) {
      retryCount++;
      await new Promise(resolve => setTimeout(resolve, 1000));
      return rawAxiosInstance(error.config!);
    }

    // Extract user-friendly error message
    const errorData = error.response?.data as AnyRecord;
    const message = 
      errorData?.error?.message ||
      errorData?.message ||
      error.message ||
      'An error occurred. Please try again.';
    
    const code = errorData?.error?.code || 'UNKNOWN_ERROR';

    return Promise.reject({
      message,
      code,
      status: error.response?.status || 0,
      details: errorData?.error?.details,
      originalError: error,
    });
  }
);

const axiosInstance = rawAxiosInstance as unknown as PayloadAxiosInstance;

type AnyRecord = Record<string, any>;

const isRecord = (value: any): value is AnyRecord =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const withIdAlias = <T>(item: T): T => {
  if (!isRecord(item)) {
    return item;
  }
  const id = item.id || item._id;
  return {
    ...item,
    id,
    _id: item._id || id,
  } as T;
};

const locationText = (location: any) => {
  if (typeof location === 'string') {
    return location;
  }
  if (isRecord(location)) {
    return (
      location.address ||
      location.description ||
      location.name ||
      [location.latitude ?? location.lat, location.longitude ?? location.lng ?? location.lon]
        .filter((value) => value !== undefined && value !== null && value !== '')
        .join(', ')
    );
  }
  return '';
};

const toLocationObject = (location: any, fallbackAddress: string) => {
  if (isRecord(location)) {
    return {
      address: location.address || location.description || location.name || fallbackAddress,
      latitude: Number(location.latitude ?? location.lat ?? 0),
      longitude: Number(location.longitude ?? location.lng ?? location.lon ?? 0),
    };
  }
  return {
    address: String(location || fallbackAddress),
    latitude: 0,
    longitude: 0,
  };
};

const normalizePool = (pool: any) => {
  if (!isRecord(pool)) {
    return pool;
  }
  const normalized = withIdAlias(pool);
  return {
    ...normalized,
    pickup_location: normalized.pickup_location || locationText(normalized.pickup),
    dropoff_location: normalized.dropoff_location || locationText(normalized.dropoff),
    current_passengers:
      normalized.current_passengers ??
      normalized.passengers_count ??
      (Array.isArray(normalized.passengers) ? normalized.passengers.length : 1),
    estimated_fare:
      normalized.estimated_fare ??
      normalized.estimated_fare_per_passenger ??
      normalized.fare_per_passenger ??
      0,
  };
};

const normalizePoolResponse = (data: any, response: any, overrides: AnyRecord = {}) => {
  const nestedPool = isRecord(response?.pool) ? response.pool : {};
  return attachLegacyDataAlias(normalizePool({ ...data, ...nestedPool, ...response, ...overrides }));
};

const normalizePoolCollection = (payload: any) => {
  const pools = Array.isArray(payload) ? payload : payload?.pools || payload?.data || [];
  const normalizedPools = Array.isArray(pools) ? pools.map(normalizePool) : [];
  return attachLegacyDataAlias(
    Array.isArray(payload) ? normalizedPools : { ...(payload || {}), pools: normalizedPools }
  );
};

const normalizePoolPayload = (data: any) => ({
  ...data,
  pickup: data?.pickup || toLocationObject(data?.pickup_location, 'Pickup'),
  dropoff: data?.dropoff || toLocationObject(data?.dropoff_location, 'Dropoff'),
});

const normalizeScheduledRide = (ride: any) => {
  if (!isRecord(ride)) {
    return ride;
  }
  const normalized = withIdAlias(ride);
  const pickup = normalized.pickup_location;
  const dropoff = normalized.dropoff_location;
  return {
    ...normalized,
    pickup,
    dropoff,
    pickup_location: locationText(pickup),
    dropoff_location: locationText(dropoff),
    scheduled_datetime: normalized.scheduled_datetime || normalized.scheduled_time,
    driver_gender_preference: normalized.driver_gender_preference || 'any',
    status: normalized.status === 'pending' ? 'scheduled' : normalized.status,
  };
};

const normalizeScheduledRideCollection = (payload: any) => {
  const rides = Array.isArray(payload)
    ? payload
    : payload?.scheduled_rides || payload?.rides || payload?.data || [];
  const normalizedRides = Array.isArray(rides) ? rides.map(normalizeScheduledRide) : [];
  return attachLegacyDataAlias(
    Array.isArray(payload)
      ? normalizedRides
      : { ...(payload || {}), scheduled_rides: normalizedRides, rides: normalizedRides }
  );
};

const normalizeScheduledRidePayload = (data: any) => {
  const scheduledTime = data?.scheduled_time || data?.scheduled_datetime;
  const isRecurring = Boolean(data?.is_recurring ?? data?.recurring);
  return {
    ...data,
    pickup_location: toLocationObject(data?.pickup_location || data?.pickup, 'Pickup'),
    dropoff_location: toLocationObject(data?.dropoff_location || data?.dropoff, 'Dropoff'),
    scheduled_time: scheduledTime,
    trip_type: data?.trip_type || data?.vehicle_type || 'ride',
    driver_gender_preference: data?.driver_gender_preference || 'any',
    is_recurring: isRecurring,
    recurring_pattern: data?.recurring_pattern || data?.repeat_pattern || (isRecurring ? 'weekly' : undefined),
    recurring_days: data?.recurring_days,
    recurring_end_date: data?.recurring_end_date,
  };
};

const normalizeSupportTicket = (ticket: any) => {
  if (!isRecord(ticket)) {
    return ticket;
  }
  return withIdAlias(ticket);
};

const normalizeSupportTicketCollection = (payload: any) => {
  const tickets = Array.isArray(payload) ? payload : payload?.tickets || payload?.data || [];
  const normalizedTickets = Array.isArray(tickets) ? tickets.map(normalizeSupportTicket) : [];
  return attachLegacyDataAlias(
    Array.isArray(payload) ? normalizedTickets : { ...(payload || {}), tickets: normalizedTickets }
  );
};

const normalizeLostItem = (item: any) => {
  if (!isRecord(item)) {
    return item;
  }
  const normalized = withIdAlias(item);
  return {
    ...normalized,
    created_at: normalized.created_at || normalized.reported_at,
    location_lost: normalized.location_lost || normalized.location || '',
  };
};

const normalizeLostItemCollection = (payload: any) => {
  const items = Array.isArray(payload) ? payload : payload?.items || payload?.data || [];
  const normalizedItems = Array.isArray(items) ? items.map(normalizeLostItem) : [];
  return attachLegacyDataAlias(
    Array.isArray(payload) ? normalizedItems : { ...(payload || {}), items: normalizedItems }
  );
};

const normalizeVehicleType = (vehicleType: any) => {
  if (!isRecord(vehicleType)) {
    return vehicleType;
  }
  const normalized = withIdAlias(vehicleType);
  return {
    ...normalized,
    id: normalized.id || normalized.vehicle_type_id,
    vehicle_type_name:
      normalized.vehicle_type_name ||
      normalized.name ||
      normalized.label ||
      normalized.vehicle_type_id ||
      normalized.id,
    category: normalized.category || normalized.type || 'standard',
    capacity_passengers: Number(
      normalized.capacity_passengers ?? normalized.capacity ?? normalized.passenger_capacity ?? 1
    ),
    estimated_fare_per_km: Number(
      normalized.estimated_fare_per_km ??
        normalized.fare_per_km ??
        normalized.rate_per_km ??
        normalized.base_multiplier ??
        0
    ),
    base_fare: Number(normalized.base_fare ?? normalized.minimum_fare ?? normalized.base_multiplier ?? 0),
    image_url: normalized.image_url || normalized.icon_url || '',
    description: normalized.description || '',
    is_active: Boolean(normalized.is_active ?? normalized.active ?? true),
  };
};

const normalizeVehicleTypeCollection = (payload: any) => {
  const vehicleTypes = Array.isArray(payload)
    ? payload
    : payload?.vehicle_types || payload?.vehicles || payload?.data || [];
  const normalizedVehicleTypes = Array.isArray(vehicleTypes)
    ? vehicleTypes.map(normalizeVehicleType)
    : [];
  return attachLegacyDataAlias(
    Array.isArray(payload)
      ? normalizedVehicleTypes
      : { ...(payload || {}), data: normalizedVehicleTypes, vehicle_types: normalizedVehicleTypes }
  );
};

const normalizeRideProduct = (product: any, index = 0) => {
  if (!isRecord(product)) {
    return product;
  }
  const id = product.id || product.product_code || product.key || String(index + 1);
  return {
    ...product,
    id,
    product_name: product.product_name || product.title || product.name || product.key || id,
    product_code: product.product_code || product.key || String(id),
    description: product.description || '',
    price_multiplier: Number(product.price_multiplier ?? product.multiplier ?? 1),
    is_active: Boolean(product.is_active ?? product.active ?? true),
  };
};

const normalizeRideProductCollection = (payload: any) => {
  const products = Array.isArray(payload) ? payload : payload?.products || payload?.data || [];
  const normalizedProducts = Array.isArray(products)
    ? products.map((product, index) => normalizeRideProduct(product, index))
    : [];
  return attachLegacyDataAlias(
    Array.isArray(payload)
      ? normalizedProducts
      : { ...(payload || {}), products: normalizedProducts, data: normalizedProducts }
  );
};

// =====================================================================
// BOOKING & DISPATCH ENDPOINTS
// =====================================================================

export const bookingAPI = {
  // Create new booking
  createBooking: (data: any) =>
    axiosInstance.post('/api/bookings', data),

  // List user's bookings with pagination
  listBookings: (skip?: number, limit?: number) =>
    axiosInstance.get(`/api/bookings?skip=${skip || 0}&limit=${limit || 50}`),

  // Get booking details
  getBooking: (bookingId: string) =>
    axiosInstance.get(`/api/bookings/${bookingId}`),

  // Cancel booking
  cancelBooking: (bookingId: string, reason?: string) =>
    axiosInstance.post(`/api/bookings/${bookingId}/cancel`, { reason }),

  // Estimate fare for a route
  estimateFare: (data: any) =>
    axiosInstance.post('/api/bookings/estimate-fare', data),

  // Request driver assignment (trigger dispatch)
  requestDrivers: (bookingId: string) =>
    axiosInstance.post(`/api/dispatch/${bookingId}/match-drivers`),

  // Auto-assign driver
  autoAssignDriver: (bookingId: string) =>
    axiosInstance.post(`/api/dispatch/${bookingId}/auto-assign`),

  // Get candidate drivers for booking
  getCandidateDrivers: (bookingId: string) =>
    axiosInstance.get(`/api/dispatch/${bookingId}/candidate-drivers`),
};

// =====================================================================
// VEHICLE TYPES & RIDE PRODUCTS
// =====================================================================

export const vehicleTypesAPI = {
  getAllVehicleTypes: (options?: { activeOnly?: boolean }) =>
    axiosInstance
      .get('/api/admin/vehicle-types/public/all', {
        params: { active_only: options?.activeOnly ?? true },
      })
      .then(normalizeVehicleTypeCollection),

  getRideProducts: (_vehicleTypeId?: number | string, pickupAddress?: string) =>
    axiosInstance
      .get('/api/ride-products', {
        params: { pickup_address: pickupAddress },
      })
      .then(normalizeRideProductCollection),

  estimateFare: (data: any) => bookingAPI.estimateFare(data),
};

// =====================================================================
// DRIVER AVAILABILITY & OPERATIONS
// =====================================================================

const normalizeAvailabilityPayload = (payload: any) => {
  if (!isRecord(payload)) {
    return payload;
  }

  const normalized = { ...payload };

  if (typeof normalized.is_online === 'boolean' && normalized.is_available === undefined) {
    normalized.is_available = normalized.is_online;
  }

  if (
    typeof normalized.availability_status === 'string' &&
    normalized.is_available === undefined
  ) {
    const status = normalized.availability_status.toLowerCase();
    normalized.is_available = ['online', 'available', 'active', 'ready'].includes(status);
  }

  return normalized;
};

export const driverAPI = {
  // Toggle driver online/offline (legacy)
  setAvailability: (
    driverId: string,
    statusOrPayload: 'online' | 'offline' | AnyRecord,
    location?: any
  ) => {
    const payload = isRecord(statusOrPayload)
      ? normalizeAvailabilityPayload(statusOrPayload)
      : normalizeAvailabilityPayload({
          availability_status: statusOrPayload,
          location,
        });
    return axiosInstance.put(`/api/drivers/${driverId}/availability`, payload);
  },

  // Get current availability status
  getAvailability: (driverId: string) =>
    axiosInstance.get(`/api/drivers/${driverId}/availability`),

  // Update driver availability (new pattern)
  updateAvailability: (data: any) =>
    axiosInstance.put('/api/drivers/availability', data),

  // Update driver location (for continuous tracking)
  updateLocation: (data: any) =>
    axiosInstance.post('/api/drivers/location', data),

  // Get driver profile
  getProfile: () =>
    axiosInstance.get('/api/drivers/profile'),

  // Get list of available drivers near coordinates
  getNearbyDrivers: (latitude: number, longitude: number, radius_km?: number) =>
    axiosInstance.get(
      `/api/drivers/available/list?latitude=${latitude}&longitude=${longitude}&radius_km=${radius_km || 5}`
    ),

  // Start shift
  startShift: (driverId: string, data: any = {}) =>
    axiosInstance.post(`/api/drivers/${driverId}/shift-start`, data),

  // End shift
  endShift: (driverId: string, data: any = {}) =>
    axiosInstance.post(`/api/drivers/${driverId}/shift-end`, data),

  // Trigger SOS alert (redirect to driverSafetyAPI)
  triggerSOS: (data: any) =>
    axiosInstance.post('/api/drivers/safety/sos', data),

  // Submit photo verification (redirect to driverSafetyAPI)
  submitPhotoVerification: (photoUri: string, livenessScore: number) =>
    axiosInstance.post('/api/drivers/verification/photo', {
      photo_uri: photoUri,
      liveness_score: livenessScore,
    }),

  // Get passenger safety rating (redirect to driverSafetyAPI)
  getPassengerSafetyRating: (passengerId: string) =>
    axiosInstance.get(`/api/drivers/passenger-safety-rating/${passengerId}`),

  // Get demand heatmap (redirect to demandTrafficAPI)
  getDemandHeatmap: (latitude?: number, longitude?: number) =>
    axiosInstance.get('/api/drivers/demand-heatmap', {
      params: { latitude, longitude },
    }),

  // Get traffic alerts (redirect to demandTrafficAPI)
  getTrafficAlerts: (origin: any, destination: any) =>
    axiosInstance.post('/api/drivers/traffic-alerts', { origin, destination }),
};

// =====================================================================
// RIDE OPERATIONS
// =====================================================================

export const rideAPI = {
  // Start ride (after driver arrives)
  startRide: (bookingId: string) =>
    axiosInstance.post(`/api/rides/${bookingId}/start-ride`, {}),

  // Complete ride
  completeRide: (bookingId: string) =>
    axiosInstance.post(`/api/rides/${bookingId}/complete-ride`, {}),

  // Cancel ride
  cancelRide: (bookingId: string, reason?: string) =>
    axiosInstance.post(`/api/rides/${bookingId}/cancel-ride`, { reason }),

  // Update ride location (GPS tracking)
  updateLocation: (bookingId: string, latitude: number, longitude: number) =>
    axiosInstance.post(`/api/rides/${bookingId}/update-ride-location`, {
      latitude,
      longitude,
      timestamp: istISOString(new Date()),
    }),

  // Get ride status and tracking
  getRideStatus: (bookingId: string) =>
    axiosInstance.get(`/api/rides/${bookingId}/status`),
};

// =====================================================================
// RIDE OFFERS (for drivers)
// =====================================================================

export const rideOfferAPI = {
  // Accept ride offer
  acceptOffer: (offerId: string) =>
    axiosInstance.post(`/api/ride-offers/${offerId}/accept`, {}),

  // Decline ride offer
  declineOffer: (offerId: string, reason?: string) =>
    axiosInstance.post(`/api/ride-offers/${offerId}/decline`, { reason }),
};

// =====================================================================
// PAYMENTS & STRIPE WEBHOOKS
// =====================================================================

export const paymentAPI = {
  // Create payment intent
  createPaymentIntent: (bookingId: string, amount: number) =>
    axiosInstance.post('/api/webhooks/stripe/create-payment-intent', {
      booking_id: bookingId,
      amount,
    }),

  // Confirm payment (after 3D Secure)
  confirmPayment: (paymentIntentId: string) =>
    axiosInstance.post('/api/webhooks/stripe/confirm-payment', {
      payment_intent_id: paymentIntentId,
    }),

  // Refund booking payment
  refundPayment: (bookingId: string) =>
    axiosInstance.post('/api/webhooks/stripe/refund', { booking_id: bookingId }),
};

// =====================================================================
// NOTIFICATIONS
// =====================================================================

export const notificationAPI = {
  // Create notification
  createNotification: (data: any) =>
    axiosInstance.post('/api/notifications', data),

  // List notifications with filters
  listNotifications: (filters?: any, skip?: number, limit?: number) =>
    axiosInstance.get(
      `/api/notifications?skip=${skip || 0}&limit=${limit || 50}`,
      { params: filters }
    ),

  // Get single notification
  getNotification: (notificationId: string) =>
    axiosInstance.get(`/api/notifications/${notificationId}`),

  // Mark notification as read
  markAsRead: (notificationId: string) =>
    axiosInstance.put(`/api/notifications/${notificationId}/read`, {}),

  // Mark all as read
  markAllAsRead: () =>
    axiosInstance.put('/api/notifications/read-all', {}),

  // Delete notification
  deleteNotification: (notificationId: string) =>
    axiosInstance.delete(`/api/notifications/${notificationId}`),

  // Delete all notifications
  deleteAllNotifications: () =>
    axiosInstance.delete('/api/notifications', {}),

  // Get unread count
  getUnreadCount: () =>
    axiosInstance.get('/api/notifications/stats/unread-count'),

  // Get notification preferences
  getPreferences: (userId: string) =>
    axiosInstance.get(`/api/notifications/${userId}/preferences`),

  // Update notification preferences
  updatePreferences: (userId: string, preferences: any) =>
    axiosInstance.put(`/api/notifications/${userId}/preferences`, preferences),
};

// =====================================================================
// SUPPORT TICKETS
// =====================================================================

export const supportAPI = {
  // Create support ticket
  createTicket: (data: any) =>
    axiosInstance
      .post('/api/support/tickets', data)
      .then((ticket) => attachLegacyDataAlias(normalizeSupportTicket({ ...data, ...ticket }))),

  // List support tickets
  listTickets: (filters?: any, skip?: number, limit?: number) =>
    axiosInstance
      .get(`/api/support/tickets?skip=${skip || 0}&limit=${limit || 50}`, { params: filters })
      .then(normalizeSupportTicketCollection),

  // Get ticket details
  getTicket: (ticketId: string) =>
    axiosInstance.get(`/api/support/tickets/${ticketId}`).then(normalizeSupportTicket),

  // Add message to ticket
  addMessage: (ticketId: string, message: string | AnyRecord, attachments?: any[]) => {
    const payload = isRecord(message) ? message : { message, attachments };
    return axiosInstance.post(`/api/support/tickets/${ticketId}/messages`, payload);
  },

  // Update ticket status
  updateTicketStatus: (ticketId: string, status: string | AnyRecord, notes?: string) => {
    const payload = isRecord(status)
      ? status
      : {
          status,
          resolution_notes: notes,
        };
    return axiosInstance.put(`/api/support/tickets/${ticketId}/status`, payload);
  },

  // Submit satisfaction rating
  submitSatisfaction: (ticketId: string, rating: number | AnyRecord) => {
    const ratingValue = isRecord(rating)
      ? rating.rating ?? rating.satisfaction_rating
      : rating;
    return axiosInstance.post(`/api/support/tickets/${ticketId}/satisfaction`, {
      rating: ratingValue,
    });
  },

  // Get admin dashboard stats
  getAdminStats: () =>
    axiosInstance.get('/api/admin/support/tickets/admin/stats/dashboard'),
};

// =====================================================================
// LOST ITEMS
// =====================================================================

export const lostItemsAPI = {
  // Report lost item
  reportItem: (data: any) =>
    axiosInstance
      .post('/api/lost-items', data)
      .then((item) => attachLegacyDataAlias(normalizeLostItem({ ...data, ...item }))),

  // List lost items
  listItems: (filters?: any, skip?: number, limit?: number) =>
    axiosInstance
      .get(`/api/lost-items?skip=${skip || 0}&limit=${limit || 50}`, { params: filters })
      .then(normalizeLostItemCollection),

  // Get item details
  getItem: (itemId: string) =>
    axiosInstance.get(`/api/lost-items/${itemId}`).then(normalizeLostItem),

  // Update item status
  updateItemStatus: (itemId: string, status: string | AnyRecord, notes?: string) => {
    const payload = isRecord(status)
      ? status
      : {
          status,
          resolution_notes: notes,
        };
    return axiosInstance
      .put(`/api/lost-items/${itemId}/status`, payload)
      .then((item) => attachLegacyDataAlias(normalizeLostItem({ id: itemId, ...payload, ...item })));
  },

  // Close item report
  closeItem: (itemId: string) =>
    axiosInstance.delete(`/api/lost-items/${itemId}`),

  // Alias used by the lost-items panel
  deleteItem: (itemId: string) =>
    axiosInstance.delete(`/api/lost-items/${itemId}`),
};

// =====================================================================
// DRIVER SAFETY & VERIFICATION
// =====================================================================

export const driverSafetyAPI = {
  // Trigger SOS/panic button
  triggerSOS: (data: any) =>
    axiosInstance.post('/api/drivers/safety/sos', data),

  // Cancel SOS alert
  cancelSOS: () =>
    axiosInstance.post('/api/drivers/safety/sos/cancel', {}),

  // Get SOS status
  getSOSStatus: () =>
    axiosInstance.get('/api/drivers/safety/sos/status'),

  // Submit driver photo verification (liveness check)
  submitPhotoVerification: (photoUri: string, livenessScore: number) =>
    axiosInstance.post('/api/drivers/verification/photo', {
      photo_uri: photoUri,
      liveness_score: livenessScore,
      timestamp: new Date().toISOString(),
    }),

  // Get photo verification status
  getPhotoVerificationStatus: () =>
    axiosInstance.get('/api/drivers/verification/photo/status'),

  // Get passenger safety ratings for a specific passenger
  getPassengerSafetyRating: (passengerId: string) =>
    axiosInstance.get(`/api/drivers/passenger-safety-rating/${passengerId}`),

  // Report unsafe passenger behavior
  reportUnsafePassenger: (passengerId: string, reportData: any) =>
    axiosInstance.post(`/api/drivers/safety/report-passenger/${passengerId}`, reportData),
};

// =====================================================================
// DEMAND & TRAFFIC INTELLIGENCE
// =====================================================================

export const demandTrafficAPI = {
  // Get demand heatmap data for driver earnings optimization
  getDemandHeatmap: (latitude?: number, longitude?: number) =>
    axiosInstance.get('/api/drivers/demand-heatmap', {
      params: { latitude, longitude },
    }),

  // Get real-time traffic alerts and route options
  getTrafficAlerts: (origin: any, destination: any) =>
    axiosInstance.post('/api/drivers/traffic-alerts', { origin, destination }),

  // Get route optimization suggestions
  getOptimizedRoutes: (origin: any, destination: any, preferences?: any) =>
    axiosInstance.post('/api/drivers/route-optimization', {
      origin,
      destination,
      preferences,
    }),

  // Report traffic incident (accident, congestion, etc.)
  reportTrafficIncident: (incidentData: any) =>
    axiosInstance.post('/api/drivers/traffic-report', incidentData),

  // Get earnings forecast based on location and time
  getEarningsForecast: (latitude: number, longitude: number) =>
    axiosInstance.get('/api/drivers/earnings-forecast', {
      params: { latitude, longitude },
    }),
};

// =====================================================================
// RIDE POOLING
// =====================================================================

export const ridePoolingAPI = {
  // Default AutoBuddy flow: system-created auto-match pool request
  createPool: (data: any) =>
    axiosInstance
      .post('/api/ride-pooling', normalizePoolPayload(data))
      .then((pool) => normalizePoolResponse(data, pool, { current_passengers: pool?.current_passengers ?? 1 })),

  // Explicit system-created pool request
  requestSystemPool: (data: any) =>
    axiosInstance
      .post('/api/ride-pooling/system-request', normalizePoolPayload(data))
      .then((pool) => normalizePoolResponse(data, pool)),

  // Explicit passenger-created pool
  createPassengerPool: (data: any) =>
    axiosInstance
      .post('/api/ride-pooling/passenger-create', normalizePoolPayload(data))
      .then((pool) => normalizePoolResponse(data, pool, { current_passengers: pool?.current_passengers ?? 1 })),

  // Driver opens a shared route
  createDriverPool: (data: any) =>
    axiosInstance
      .post('/api/ride-pooling/driver-create', normalizePoolPayload(data))
      .then((pool) => normalizePoolResponse(data, pool)),

  // Find available pools
  findAvailablePools: (latitude?: number, longitude?: number, radius_km?: number) => {
    if (
      latitude === undefined ||
      latitude === null ||
      longitude === undefined ||
      longitude === null
    ) {
      return Promise.resolve(attachLegacyDataAlias({ pools: [] }));
    }
    return axiosInstance
      .get('/api/ride-pooling/available', {
        params: { lat: latitude, lon: longitude, radius_km: radius_km || 2 },
      })
      .then(normalizePoolCollection);
  },

  // List pools joined/created by the current user
  listUserPools: () =>
    axiosInstance
      .get('/api/ride-pooling/my-pools')
      .then(normalizePoolCollection)
      .catch((error) => {
        if (error?.response?.status === 400 || error?.response?.status === 404) {
          return attachLegacyDataAlias({ pools: [] });
        }
        throw error;
      }),

  // Get pool details
  getPool: (poolId: string) =>
    axiosInstance.get(`/api/ride-pooling/${poolId}`).then(normalizePool),

  // Join pool
  joinPool: (poolId: string) =>
    axiosInstance.post(`/api/ride-pooling/${poolId}/join`, {}),

  // Leave pool
  leavePool: (poolId: string) =>
    axiosInstance.post(`/api/ride-pooling/${poolId}/leave`, {}),

  // Assign driver to pool
  assignDriver: (poolId: string, driverId?: string) =>
    axiosInstance.post(`/api/ride-pooling/${poolId}/assign-driver`, driverId ? { driver_id: driverId } : {}),
};

// =====================================================================
// PROMO CODES
// =====================================================================

export const promoAPI = {
  // Validate promo code
  validateCode: (code: string, fare: number) =>
    axiosInstance.post('/api/promo-codes/validate', { code, fare }),

  // List available promo codes
  listCodes: (skip?: number, limit?: number) =>
    axiosInstance.get(`/api/promo-codes?skip=${skip || 0}&limit=${limit || 50}`),

  // Create promo code (admin)
  createCode: (data: any) =>
    axiosInstance.post('/api/promo-codes/admin/create', data),

  // Get admin stats
  getAdminStats: () =>
    axiosInstance.get('/api/promo-codes/admin/stats'),
};

// =====================================================================
// ACCESSIBILITY
// =====================================================================

export const accessibilityAPI = {
  // Get accessibility requirements
  getRequirements: (userId: string) =>
    axiosInstance.get(`/api/accessibility/${userId}/requirements`),

  // Update accessibility requirements
  updateRequirements: (userId: string, requirements: any) =>
    axiosInstance.put(`/api/accessibility/${userId}/requirements`, requirements),

  // Get accessible vehicles (drivers)
  getAccessibleVehicles: () =>
    axiosInstance.get('/api/accessibility/drivers/accessible-vehicles'),

  // Add accessibility notes to booking
  addAccessibilityNotes: (bookingId: string, notes: string) =>
    axiosInstance.post(`/api/accessibility/bookings/${bookingId}/accessibility-notes`, {
      notes,
    }),

  // Get text size settings
  getTextSizeSettings: () =>
    axiosInstance.get('/api/accessibility/settings/text-size'),

  // Update text size settings
  updateTextSizeSettings: (settings: any) =>
    axiosInstance.put('/api/accessibility/settings/text-size', settings),
};

// =====================================================================
// SCHEDULED RIDES
// =====================================================================

export const scheduledRidesAPI = {
  // Create scheduled ride
  createScheduledRide: (data: any) =>
    axiosInstance
      .post('/api/scheduled-rides/', normalizeScheduledRidePayload(data))
      .then(normalizeScheduledRide),

  // List scheduled rides
  listScheduledRides: (skip?: number, limit?: number) =>
    axiosInstance
      .get('/api/scheduled-rides/', { params: { skip: skip || 0, limit: limit || 50 } })
      .then(normalizeScheduledRideCollection),

  // Get scheduled ride details
  getScheduledRide: (rideId: string) =>
    axiosInstance.get(`/api/scheduled-rides/${rideId}`).then(normalizeScheduledRide),

  // Update scheduled ride
  updateScheduledRide: (rideId: string, data: any) =>
    axiosInstance
      .put(`/api/scheduled-rides/${rideId}`, normalizeScheduledRidePayload(data))
      .then(normalizeScheduledRide),

  // Cancel scheduled ride
  cancelScheduledRide: (rideId: string) =>
    axiosInstance.delete(`/api/scheduled-rides/${rideId}`),

  // Confirm scheduled ride (when it's time)
  confirmScheduledRide: (rideId: string) =>
    axiosInstance.post(`/api/scheduled-rides/${rideId}/confirm`, {}).then(normalizeScheduledRide),
};

// =====================================================================
// ADMIN ENDPOINTS
// =====================================================================

export const adminAPI = {
  // Analytics & Dashboard
  getDashboard: () =>
    axiosInstance.get('/api/admin/dashboard'),

  getDashboardAnalytics: (range?: string) =>
    axiosInstance.get(`/api/admin/analytics/dashboard?range=${range || 'week'}`),

  getRideAnalytics: (filters?: any) =>
    axiosInstance.get('/api/admin/analytics/rides', { params: filters }),

  getDriverAnalytics: (filters?: any) =>
    axiosInstance.get('/api/admin/analytics/drivers', { params: filters }),

  getRevenueAnalytics: (range?: string) =>
    axiosInstance.get(`/api/admin/analytics/revenue?range=${range || 'week'}`),

  // KYC Management
  getKycPending: () =>
    axiosInstance.get('/api/admin/kyc/pending'),

  getPassengerKycPending: () =>
    axiosInstance.get('/api/admin/passengers/kyc/pending'),

  // Pricing & Configuration
  getPricingRules: () =>
    axiosInstance.get('/api/pricing/rules'),

  getRegistrationFeeConfig: () =>
    axiosInstance.get('/api/admin/registration-fees/config'),

  // Payment Management
  getPendingRegistrations: () =>
    axiosInstance.get('/api/admin/registration-payments/pending'),

  getPendingWalletTopups: () =>
    axiosInstance.get('/api/admin/wallet/topups/pending'),

  // Subscriptions
  getSubscriptionConfig: () =>
    axiosInstance.get('/api/subscriptions/config'),

  getPendingSubscriptions: () =>
    axiosInstance.get('/api/admin/subscriptions/pending'),

  getPendingSubscriptionPayments: () =>
    axiosInstance.get('/api/admin/subscriptions/payments/pending'),

  // User Requests
  getPendingPhoneChanges: () =>
    axiosInstance.get('/api/admin/phone-changes/pending'),

  getPendingAccountDeletions: () =>
    axiosInstance.get('/api/admin/account-deletions/pending'),

  // Driver Fare Management
  getPendingDriverFareRequests: () =>
    axiosInstance.get('/api/admin/driver-fare-calculator/pending'),

  getApprovedDriverFareConfigs: () =>
    axiosInstance.get('/api/admin/driver-fare-calculator/approved'),

  // Trip Management
  getOngoingTrips: () =>
    axiosInstance.get('/api/admin/bookings/ongoing'),

  getUsersLiveStatus: () =>
    axiosInstance.get('/api/admin/users/live-status'),

  getRolewiseUserReport: () =>
    axiosInstance.get('/api/admin/users/role-report'),

  // Launch Tracking
  getLaunchVisitReport: (options?: any) =>
    axiosInstance.get('/api/admin/launch-visits/report', { params: options }),

  // Gamification
  getSpinWinConfig: () =>
    axiosInstance.get('/api/admin/spin-win/config'),

  getSpinWinWinners: (options?: any) =>
    axiosInstance.get('/api/admin/spin-win/winners', { params: options }),

  // Ride Products
  getRideProductsDistrictConfig: () =>
    axiosInstance.get('/api/admin/ride-products/district-config'),

  // User Management
  searchUsers: (query: string, userType?: string) =>
    axiosInstance.get('/api/admin/users/search', { params: { q: query, user_type: userType } }),

  blockUser: (userId: string) =>
    axiosInstance.put(`/api/admin/users/${userId}/block`, {}),

  unblockUser: (userId: string) =>
    axiosInstance.put(`/api/admin/users/${userId}/unblock`, {}),
};

// =====================================================================
// USER PROFILE
// =====================================================================

export const userAPI = {
  // Get user profile
  getProfile: () =>
    axiosInstance.get('/api/users/profile'),

  // Update user profile
  updateProfile: (data: any) =>
    axiosInstance.put('/api/users/profile', data),

  // Get saved places
  getSavedPlaces: () =>
    axiosInstance.get('/api/users/saved-places'),

  // Add saved place
  addSavedPlace: (place: any) =>
    axiosInstance.post('/api/users/saved-places', place),

  // Update saved place
  updateSavedPlace: (placeId: string, place: any) =>
    axiosInstance.patch(`/api/users/saved-places/${placeId}`, place),

  // Delete saved place
  deleteSavedPlace: (placeId: string) =>
    axiosInstance.delete(`/api/users/saved-places/${placeId}`),

  // Get wallet balance
  getWallet: () =>
    axiosInstance.get('/api/users/wallet'),

  // Add money to wallet
  addToWallet: (amount: number, paymentMethod: string) =>
    axiosInstance.post('/api/users/wallet/add', { amount, payment_method: paymentMethod }),
};

// =====================================================================
// FLEET MANAGEMENT (Driver feature)
// =====================================================================

export const fleetManagementAPI = {
  // Get all drivers in fleet
  getFleetDrivers: (fleetOwnerId: string, skip?: number, limit?: number) =>
    axiosInstance.get(`/api/fleet/${fleetOwnerId}/drivers?skip=${skip || 0}&limit=${limit || 50}`),

  // Add driver to fleet
  addFleetDriver: (fleetOwnerId: string, driverData: any) =>
    axiosInstance.post(`/api/fleet/${fleetOwnerId}/drivers`, driverData),

  // Get fleet vehicles
  getFleetVehicles: (fleetOwnerId: string, skip?: number, limit?: number) =>
    axiosInstance.get(`/api/fleet/${fleetOwnerId}/vehicles?skip=${skip || 0}&limit=${limit || 50}`),

  // Add vehicle to fleet
  addFleetVehicle: (fleetOwnerId: string, vehicleData: any) =>
    axiosInstance.post(`/api/fleet/${fleetOwnerId}/vehicles`, vehicleData),

  // Assign vehicle to driver
  assignVehicle: (fleetOwnerId: string, driverId: string, vehicleId: string) =>
    axiosInstance.post(`/api/fleet/${fleetOwnerId}/drivers/${driverId}/assign-vehicle`, {
      vehicle_id: vehicleId,
    }),

  // Get fleet statistics
  getFleetStats: (fleetOwnerId: string) =>
    axiosInstance.get(`/api/fleet/${fleetOwnerId}/stats`),

  // Update driver performance metrics
  updateDriverMetrics: (fleetOwnerId: string, driverId: string, metrics: any) =>
    axiosInstance.put(`/api/fleet/${fleetOwnerId}/drivers/${driverId}/metrics`, metrics),
};

// =====================================================================
// EARNINGS FORECASTING (Driver feature)
// =====================================================================

export const earningsForecastAPI = {
  // Get earnings forecast for period
  getEarningsForecast: (driverId: string, period: 'day' | 'week' | 'month') =>
    axiosInstance.get(`/api/drivers/${driverId}/earnings/forecast?period=${period}`),

  // Get earnings trends (historical)
  getEarningsTrends: (driverId: string, days?: number) =>
    axiosInstance.get(`/api/drivers/${driverId}/earnings/trends?days=${days || 30}`),

  // Get income optimization suggestions
  getIncomeOptimization: (driverId: string) =>
    axiosInstance.get(`/api/drivers/${driverId}/earnings/optimization`),

  // Get peak hours analysis
  getPeakHours: (driverId: string, location?: any) =>
    axiosInstance.get(`/api/drivers/${driverId}/earnings/peak-hours`, { params: { location } }),

  // Get historical monthly summary
  getMonthlySummary: (driverId: string, year?: number, month?: number) =>
    axiosInstance.get(
      `/api/drivers/${driverId}/earnings/monthly?year=${year || new Date().getFullYear()}&month=${month || new Date().getMonth() + 1}`
    ),
};

// =====================================================================
// INSTANT PAYOUTS (Driver feature)
// =====================================================================

export const payoutAPI = {
  // Get current balance
  getBalance: (driverId: string) =>
    axiosInstance.get(`/api/drivers/${driverId}/payouts/balance`),

  // Request instant payout
  requestInstantPayout: (driverId: string, payoutData: any) =>
    axiosInstance.post(`/api/drivers/${driverId}/payouts/request`, payoutData),

  // Get payout history
  getPayoutHistory: (driverId: string, skip?: number, limit?: number) =>
    axiosInstance.get(
      `/api/drivers/${driverId}/payouts/history?skip=${skip || 0}&limit=${limit || 50}`
    ),

  // Get payment methods
  getPaymentMethods: (driverId: string) =>
    axiosInstance.get(`/api/drivers/${driverId}/payouts/methods`),

  // Add payment method
  addPaymentMethod: (driverId: string, methodData: any) =>
    axiosInstance.post(`/api/drivers/${driverId}/payouts/methods`, methodData),

  // Set default payment method
  setDefaultPaymentMethod: (driverId: string, methodId: string) =>
    axiosInstance.put(`/api/drivers/${driverId}/payouts/methods/${methodId}/default`, {}),

  // Get payout status
  getPayoutStatus: (driverId: string, payoutId: string) =>
    axiosInstance.get(`/api/drivers/${driverId}/payouts/${payoutId}/status`),
};

// =====================================================================
// TAX REPORTING (Driver feature)
// =====================================================================

export const taxAPI = {
  // Get tax summary for financial year
  getTaxSummary: (driverId: string, financialYear: string) =>
    axiosInstance.get(`/api/drivers/${driverId}/tax/summary?fy=${financialYear}`),

  // Get deductions breakdown
  getDeductions: (driverId: string, financialYear: string) =>
    axiosInstance.get(`/api/drivers/${driverId}/tax/deductions?fy=${financialYear}`),

  // Generate tax report
  generateTaxReport: (driverId: string, financialYear: string, reportType?: string) =>
    axiosInstance.post(`/api/drivers/${driverId}/tax/reports/generate`, {
      financial_year: financialYear,
      report_type: reportType || 'comprehensive',
    }),

  // Get tax documents
  getTaxDocuments: (driverId: string, financialYear: string) =>
    axiosInstance.get(`/api/drivers/${driverId}/tax/documents?fy=${financialYear}`),

  // Download specific document
  downloadDocument: (driverId: string, documentId: string) =>
    axiosInstance.get(`/api/drivers/${driverId}/tax/documents/${documentId}/download`, {
      responseType: 'blob',
    }),

  // Get GST information
  getGSTInfo: (driverId: string) =>
    axiosInstance.get(`/api/drivers/${driverId}/tax/gst`),

  // Submit GST return
  submitGSTReturn: (driverId: string, returnData: any) =>
    axiosInstance.post(`/api/drivers/${driverId}/tax/gst/submit`, returnData),

  // Get monthly statements
  getMonthlyStatements: (driverId: string, year?: number) =>
    axiosInstance.get(
      `/api/drivers/${driverId}/tax/statements/monthly?year=${year || new Date().getFullYear()}`
    ),

  // Export for tax filing
  exportForTaxYear: (driverId: string, financialYear: string, format?: 'pdf' | 'excel') =>
    axiosInstance.get(`/api/drivers/${driverId}/tax/export?fy=${financialYear}&format=${format || 'pdf'}`, {
      responseType: 'blob',
    }),
};

// =====================================================================
// DRIVER COMMUNICATION (Driver feature - Voice/Video)
// =====================================================================

export const driverCommunicationAPI = {
  // Initiate voice call with passenger
  initiateVoiceCall: (bookingId: string) =>
    axiosInstance.post(`/api/bookings/${bookingId}/calls/voice/initiate`, {}),

  // Initiate video call with passenger
  initiateVideoCall: (bookingId: string) =>
    axiosInstance.post(`/api/bookings/${bookingId}/calls/video/initiate`, {}),

  // End call
  endCall: (bookingId: string, callId: string, duration: number) =>
    axiosInstance.post(`/api/bookings/${bookingId}/calls/${callId}/end`, { duration }),

  // Get Twilio/Vonage token for call
  getCallToken: (bookingId: string, callType: 'voice' | 'video') =>
    axiosInstance.get(`/api/bookings/${bookingId}/calls/token?type=${callType}`),

  // Report communication issue
  reportCommunicationIssue: (bookingId: string, callId: string, issue: string) =>
    axiosInstance.post(`/api/bookings/${bookingId}/calls/${callId}/report-issue`, { issue }),

  // Get call history for driver
  getCallHistory: (driverId: string, skip?: number, limit?: number) =>
    axiosInstance.get(
      `/api/drivers/${driverId}/calls/history?skip=${skip || 0}&limit=${limit || 50}`
    ),

  // Get call statistics
  getCallStats: (driverId: string, period?: string) =>
    axiosInstance.get(`/api/drivers/${driverId}/calls/stats?period=${period || 'week'}`),
};

export default axiosInstance;
