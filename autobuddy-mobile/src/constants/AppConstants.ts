/**
 * Global App Constants & Types
 * Centralized configuration for the entire application
 */

// ============== USER ROLES ==============
export const USER_ROLES = {
  DRIVER: 'driver',
  PASSENGER: 'passenger',
  OPERATOR: 'operator',
  ADMIN: 'admin',
} as const;

export type UserRole = typeof USER_ROLES[keyof typeof USER_ROLES];

// ============== RIDE STATUS ==============
export const RIDE_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  NO_SHOW: 'no_show',
} as const;

export type RideStatus = typeof RIDE_STATUS[keyof typeof RIDE_STATUS];

// ============== PAYMENT STATUS ==============
export const PAYMENT_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
} as const;

export type PaymentStatus = typeof PAYMENT_STATUS[keyof typeof PAYMENT_STATUS];

// ============== EXPENSE CATEGORIES ==============
export const EXPENSE_CATEGORIES = {
  FUEL: 'fuel',
  MAINTENANCE: 'maintenance',
  INSURANCE: 'insurance',
  TOLL: 'toll',
  CLEANING: 'cleaning',
  OTHER: 'other',
} as const;

export type ExpenseCategory = typeof EXPENSE_CATEGORIES[keyof typeof EXPENSE_CATEGORIES];

// ============== CALL STATUS ==============
export const CALL_STATUS = {
  RINGING: 'ringing',
  ACTIVE: 'active',
  ENDED: 'ended',
  REJECTED: 'rejected',
  MISSED: 'missed',
} as const;

export type CallStatus = typeof CALL_STATUS[keyof typeof CALL_STATUS];

// ============== API CONFIGURATION ==============
export const API_CONFIG = {
  TIMEOUT: 30000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
  BASE_URL: process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000',
} as const;

// ============== CACHE CONFIGURATION ==============
export const CACHE_CONFIG = {
  DEFAULT_TTL: 5 * 60 * 1000, // 5 minutes
  RIDE_TTL: 60 * 1000, // 1 minute
  USER_TTL: 15 * 60 * 1000, // 15 minutes
  ANALYTICS_TTL: 60 * 60 * 1000, // 1 hour
  MAX_ENTRIES: 500,
} as const;

// ============== PERFORMANCE THRESHOLDS ==============
export const PERFORMANCE_THRESHOLDS = {
  SLOW_API_CALL: 1000, // ms
  SLOW_RENDER: 16, // ms (60fps)
  SLOW_NAVIGATION: 300, // ms
} as const;

// ============== UI CONSTANTS ==============
export const UI_CONSTANTS = {
  PRIMARY_COLOR: '#2196F3',
  SUCCESS_COLOR: '#4CAF50',
  WARNING_COLOR: '#FF9800',
  ERROR_COLOR: '#F44336',
  INFO_COLOR: '#2196F3',
  BORDER_RADIUS: 8,
  SPACING_UNIT: 8,
} as const;

// ============== SUPPORTED LANGUAGES ==============
export const SUPPORTED_LANGUAGES = [
  'en', // English
  'es', // Spanish
  'fr', // French
  'de', // German
  'pt', // Portuguese
  'zh', // Chinese
  'ja', // Japanese
  'ar', // Arabic
  'hi', // Hindi
] as const;

export type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

// ============== FEATURE FLAGS ==============
export const FEATURE_FLAGS = {
  ENABLE_VIDEO_CALLS: true,
  ENABLE_RIDE_POOLING: true,
  ENABLE_ACCESSIBILITY: true,
  ENABLE_OFFLINE_MODE: false,
  ENABLE_ANALYTICS: true,
  ENABLE_SOCIAL_FEATURES: true,
} as const;

// ============== ERROR CODES ==============
export const ERROR_CODES = {
  NETWORK: 'NETWORK_ERROR',
  AUTHENTICATION: 'AUTHENTICATION_ERROR',
  AUTHORIZATION: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  VALIDATION: 'VALIDATION_ERROR',
  RATE_LIMIT: 'RATE_LIMIT',
  SERVER: 'SERVER_ERROR',
  UNKNOWN: 'UNKNOWN_ERROR',
} as const;

// ============== STORAGE KEYS ==============
export const STORAGE_KEYS = {
  AUTH_TOKEN: 'authToken',
  USER_ID: 'userId',
  USER_ROLE: 'userRole',
  USER_PROFILE: 'userProfile',
  APP_LANGUAGE: 'appLanguage',
  APP_THEME: 'appTheme',
  ACCESSIBILITY_SETTINGS: 'accessibilitySettings',
  LAST_APP_CLOSE: 'lastAppClose',
  LAST_CACHE_CLEANUP: 'lastCacheCleanup',
  DEVICE_ID: 'deviceId',
} as const;

// ============== REGEX PATTERNS ==============
export const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,4}[-\s.]?[0-9]{1,9}$/,
  PASSWORD: /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&]{8,}$/, // min 8 chars, 1 letter, 1 digit
  URL: /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i,
  CREDIT_CARD: /^[0-9]{13,19}$/,
} as const;

// ============== DEFAULT VALUES ==============
export const DEFAULT_VALUES = {
  CURRENCY: 'USD',
  TIMEZONE: 'UTC',
  TIME_FORMAT: '24h',
  DATE_FORMAT: 'YYYY-MM-DD',
  DEFAULT_LANGUAGE: 'en' as SupportedLanguage,
  DEFAULT_ROLE: 'passenger' as UserRole,
} as const;

// ============== API ENDPOINTS ==============
export const API_ENDPOINTS = {
  // Auth
  LOGIN: '/auth/login',
  LOGOUT: '/auth/logout',
  REFRESH: '/auth/refresh',
  SIGNUP: '/auth/signup',

  // Users
  USER_PROFILE: '/users/profile',
  UPDATE_PROFILE: '/users/profile',

  // Rides
  GET_RIDES: '/rides/:userId/history',
  BOOK_RIDE: '/rides/book',
  COMPLETE_RIDE: '/rides/:rideId/complete',

  // Payments
  PROCESS_PAYMENT: '/payments/process',
  GET_WALLET: '/wallet/:userId',

  // Analytics
  GET_ANALYTICS: '/analytics/reports/:userId',

  // Support
  GET_TICKETS: '/support/tickets/:userId',
  CREATE_TICKET: '/support/tickets',
} as const;

// ============== VALIDATION RULES ==============
export const VALIDATION_RULES = {
  MIN_PASSWORD_LENGTH: 8,
  MAX_PASSWORD_LENGTH: 128,
  MIN_NAME_LENGTH: 2,
  MAX_NAME_LENGTH: 100,
  MIN_BIO_LENGTH: 0,
  MAX_BIO_LENGTH: 500,
  MIN_AMOUNT: 0.01,
  MAX_AMOUNT: 999999.99,
} as const;

// ============== TIME CONSTANTS ==============
export const TIME_CONSTANTS = {
  MS_PER_SECOND: 1000,
  SECONDS_PER_MINUTE: 60,
  MINUTES_PER_HOUR: 60,
  HOURS_PER_DAY: 24,
  DAYS_PER_WEEK: 7,
  MS_PER_MINUTE: 60 * 1000,
  MS_PER_HOUR: 60 * 60 * 1000,
  MS_PER_DAY: 24 * 60 * 60 * 1000,
} as const;

// ============== PERMISSIONS ==============
export const PERMISSIONS = {
  CAMERA: 'CAMERA',
  MICROPHONE: 'MICROPHONE',
  LOCATION: 'LOCATION',
  CONTACTS: 'CONTACTS',
  GALLERY: 'GALLERY',
  CALENDAR: 'CALENDAR',
} as const;

// ============== STATUS COLORS ==============
export const STATUS_COLORS = {
  SUCCESS: '#4CAF50',
  PENDING: '#FF9800',
  ERROR: '#F44336',
  INFO: '#2196F3',
  WARNING: '#FFC107',
  DISABLED: '#BDBDBD',
} as const;

export default {
  USER_ROLES,
  RIDE_STATUS,
  PAYMENT_STATUS,
  EXPENSE_CATEGORIES,
  CALL_STATUS,
  API_CONFIG,
  CACHE_CONFIG,
  PERFORMANCE_THRESHOLDS,
  UI_CONSTANTS,
  SUPPORTED_LANGUAGES,
  FEATURE_FLAGS,
  ERROR_CODES,
  STORAGE_KEYS,
  REGEX_PATTERNS,
  DEFAULT_VALUES,
  API_ENDPOINTS,
  VALIDATION_RULES,
  TIME_CONSTANTS,
  PERMISSIONS,
  STATUS_COLORS,
};
