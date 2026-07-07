import { API_BASE_URL as RAW_API_BASE_URL, apiRequest as rawApiRequest } from './api';

export const API_BASE_URL = String(RAW_API_BASE_URL);

export interface ApiRequestOptions<TBody = unknown> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  token?: string;
  body?: TBody;
  query?: Record<string, string | number | boolean | null | undefined>;
  timeoutMs?: number;
}

export interface ApiError extends Error {
  status?: number;
  code?: string;
  authExpired?: boolean;
  sessionPreserved?: boolean;
  payload?: unknown;
}

export interface AuthResponse {
  token: string;
  refreshToken?: string;
  user: {
    id: string;
    name: string;
    phone: string;
    email?: string;
    role: 'passenger' | 'driver' | 'operator' | 'admin';
    photo?: string;
    rating?: number;
    created_at?: string;
  };
  expiresAt?: number;
}

export async function apiRequest<TResponse = unknown, TBody = unknown>(
  path: string,
  options: ApiRequestOptions<TBody> = {},
): Promise<TResponse> {
  return (await rawApiRequest(path, options as Record<string, unknown>)) as TResponse;
}

export function asApiError(error: unknown): ApiError {
  return error as ApiError;
}

/**
 * Authentication API calls
 */
export const authAPI = {
  login: async (phone: string, password: string, role: string) => {
    return apiRequest('/auth/login', {
      method: 'POST',
      body: { phone, password, role },
    });
  },

  signup: async (data: {
    phone: string;
    name: string;
    email?: string;
    password: string;
    role: string;
  }) => {
    return apiRequest('/auth/signup', {
      method: 'POST',
      body: data,
    });
  },

  verifyOtp: async (phone: string, otp: string) => {
    return apiRequest('/auth/verify-otp', {
      method: 'POST',
      body: { phone, otp },
    });
  },

  logout: async (token: string) => {
    return apiRequest('/auth/logout', {
      method: 'POST',
      token,
    });
  },
};

/**
 * Passenger API calls
 */
export const passengerAPI = {
  getProfile: async (token: string) => {
    return apiRequest('/passengers/me/profile', { token });
  },

  bookRide: async (token: string, data: any) => {
    return apiRequest('/passengers/rides/book', {
      method: 'POST',
      token,
      body: data,
    });
  },

  getRideTracking: async (token: string, bookingId: string) => {
    return apiRequest(`/passengers/rides/${bookingId}/tracking`, { token });
  },

  cancelRide: async (token: string, bookingId: string) => {
    return apiRequest(`/passengers/rides/${bookingId}/cancel`, {
      method: 'POST',
      token,
    });
  },

  getRideHistory: async (token: string, limit = 10, offset = 0) => {
    return apiRequest(`/passengers/me/ride-history?limit=${limit}&offset=${offset}`, {
      token,
    });
  },

  scheduleRide: async (token: string, data: any) => {
    return apiRequest('/passengers/rides/schedule', {
      method: 'POST',
      token,
      body: data,
    });
  },

  estimateFare: async (token: string, origin: string, destination: string, rideType: string) => {
    return apiRequest('/passengers/rides/estimate-fare', {
      method: 'POST',
      token,
      body: { origin, destination, rideType },
    });
  },

  getPaymentMethods: async (token: string) => {
    return apiRequest('/passengers/me/payment-methods', { token });
  },
};

/**
 * Driver API calls
 */
export const driverAPI = {
  getProfile: async (token: string) => {
    return apiRequest('/drivers/me/profile', { token });
  },

  // Update driver profile (partial)
  updateProfile: async (token: string, data: any) => {
    return apiRequest('/drivers/me/profile', { method: 'PUT', token, body: data });
  },

  getEarnings: async (token: string, period = 'day') => {
    return apiRequest(`/drivers/me/earnings?period=${period}`, { token });
  },

  getDocuments: async (token: string) => {
    return apiRequest('/drivers/me/documents', { token });
  },

  acceptRide: async (token: string, rideId: string) => {
    return apiRequest(`/rides/${rideId}/accept`, {
      method: 'PUT',
      token,
    });
  },

  declineRide: async (token: string, rideId: string, reason?: string) => {
    return apiRequest(`/rides/${rideId}/decline`, {
      method: 'PUT',
      token,
      body: { reason },
    });
  },

  toggleOnlineStatus: async (token: string, online: boolean) => {
    return apiRequest('/drivers/me/online-status', {
      method: 'PUT',
      token,
      body: { online },
    });
  },

  getAlerts: async (token: string) => {
    return apiRequest('/drivers/me/alerts/unread', { token });
  },

  getRideHistory: async (token: string, limit = 10, offset = 0) => {
    return apiRequest(`/drivers/me/rides?limit=${limit}&offset=${offset}`, { token });
  },
};

/**
 * Operator API calls
 */
export const operatorAPI = {
  getFleetStats: async (token: string) => {
    return apiRequest('/operators/me/fleet-stats', { token });
  },

  getDriverMetrics: async (token: string) => {
    return apiRequest('/operators/me/drivers/metrics', { token });
  },

  getDriverLocations: async (token: string) => {
    return apiRequest('/operators/me/drivers/locations', { token });
  },

  getAlerts: async (token: string) => {
    return apiRequest('/operators/me/alerts', { token });
  },

  dismissAlert: async (token: string, alertId: string) => {
    return apiRequest(`/operators/me/alerts/${alertId}/dismiss`, {
      method: 'POST',
      token,
    });
  },

  updateDriverIncentive: async (token: string, driverId: string, amount: number) => {
    return apiRequest(`/operators/me/drivers/${driverId}/incentive`, {
      method: 'PUT',
      token,
      body: { incentiveAmount: amount },
    });
  },

  getReports: async (token: string) => {
    return apiRequest('/operators/me/reports', { token });
  },

  generateReport: async (token: string, type: string, period: string) => {
    return apiRequest('/operators/me/reports/generate', {
      method: 'POST',
      token,
      body: { reportType: type, period },
    });
  },
};

/**
 * Admin API calls
 */
export const adminAPI = {
  getMetrics: async (token: string, timeRange = '24h') => {
    return apiRequest(`/admin/metrics?timeRange=${timeRange}`, { token });
  },

  getSystemHealth: async (token: string) => {
    return apiRequest('/admin/system/health', { token });
  },

  getAlerts: async (token: string) => {
    return apiRequest('/admin/alerts', { token });
  },

  resolveAlert: async (token: string, alertId: string, resolution: string) => {
    return apiRequest(`/admin/alerts/${alertId}/resolve`, {
      method: 'POST',
      token,
      body: { resolution },
    });
  },

  getComplianceStatus: async (token: string) => {
    return apiRequest('/admin/compliance/status', { token });
  },

  getConfig: async (token: string) => {
    return apiRequest('/admin/system/config', { token });
  },

  updateConfig: async (token: string, config: any) => {
    return apiRequest('/admin/system/config', {
      method: 'PUT',
      token,
      body: config,
    });
  },

  suspendUser: async (token: string, userId: string, reason: string, duration: number) => {
    return apiRequest(`/admin/users/${userId}/suspend`, {
      method: 'POST',
      token,
      body: { reason, durationDays: duration },
    });
  },

  banUser: async (token: string, userId: string, reason: string) => {
    return apiRequest(`/admin/users/${userId}/ban`, {
      method: 'POST',
      token,
      body: { reason },
    });
  },

  issueRefund: async (token: string, rideId: string, amount: number, reason: string) => {
    return apiRequest(`/admin/rides/${rideId}/refund`, {
      method: 'POST',
      token,
      body: { amount, reason },
    });
  },

  generateReport: async (token: string, type: string, range: string) => {
    return apiRequest('/admin/reports/generate', {
      method: 'POST',
      token,
      body: { reportType: type, timeRange: range },
    });
  },

  downloadReport: async (token: string, reportId: string) => {
    return apiRequest(`/admin/reports/${reportId}/download`, { token });
  },
};
