import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SymbolView } from 'expo-symbols';

import { apiRequest } from '../lib/api';
import { createAutoBuddySocket } from '../lib/socket';
import { getDisplayText } from '../lib/displayText';
import { getFavoriteDriverIds } from '../lib/favoriteDrivers';
import {
  getPlaceLocation,
  isPlacesConfigured,
  reverseGeocodeLocation,
  searchPlaces,
} from '../lib/places';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../theme';
import WebCommandBar from '../components/WebCommandBar';
import RevenueCard from '../components/RevenueCard';
import WebLeafletMap from '../components/WebLeafletMap';
import {
  FadeSlideView,
  GlassCard,
  LiveEtaPulse,
  PremiumEmptyState,
  RideProgressTimeline,
} from '../components/PremiumUI';
import RideProductsGrid from '../components/RideProductsGrid';
import RideCommunicationCard from '../components/RideCommunicationCard';
import VoiceTextInput from '../components/VoiceTextInput';
import BookingConfirmationCard from '../components/BookingConfirmationCard';
import ScheduledPickupPicker from '../components/ScheduledPickupPicker';
import KeralaSafetyCard from '../components/KeralaSafetyCard';
import PromoCodePanel from '../components/PromoCodePanel';
import SupportTicketsPanel from '../components/SupportTicketsPanel';
import PaymentMethodsPanel from '../components/PaymentMethodsPanel';
import PassengerRatingsPanel from '../components/PassengerRatingsPanel';
import FavoriteDriversPanel from '../components/FavoriteDriversPanel';
import PostRideRatingModal from '../components/PostRideRatingModal';
import PassengerBookingNavigator from './PassengerBookingNavigator';
import PassengerProfile from './PassengerProfile.web';
import SafePathScreen from './SafePathScreen';
import SavedPlacesQuickSelect from '../components/SavedPlacesQuickSelect';
import PreferencesPanel from '../components/PreferencesPanel';
import SavedPlacesPanel from '../components/SavedPlacesPanel';
import EmergencyContactsPanel from '../components/EmergencyContactsPanel';
import AccessibilityPanel from '../components/AccessibilityPanel';
import PassengerScheduledRidesPanel from '../components/PassengerScheduledRidesPanel';
import NotificationCenter from '../components/NotificationCenter';
import NotificationBell from '../components/NotificationBell';
import AccessibilityQuickAccess from '../components/AccessibilityQuickAccess';
import PassengerProfilePanel from '../components/PassengerProfilePanel';
import PassengerKYCPanel from '../components/PassengerKYCPanel';
import PassengerDocumentUpload from '../components/PassengerDocumentUpload';
import PassengerDocumentsPanel from '../components/PassengerDocumentsPanel';
import ReceiptsPanel from '../components/ReceiptsPanel';
import SubscriptionPanel from '../components/SubscriptionPanel';
import RideNotesPanel from '../components/RideNotesPanel';
import LocationSharingPanel from '../components/LocationSharingPanel';
import RideStatsPanel from '../components/RideStatsPanel';
import RidePoolingPanel from './RidePoolingPanel';
import { useNotifications } from '../contexts/NotificationContext';
import { useNotificationManager } from '../hooks/useNotificationManager';
import { useVehicleTypes } from '../hooks/useVehicleTypes';
import { useKeralaSafety } from '../hooks/useKeralaSafety';
import { AccessibilityProvider } from '../contexts/AccessibilityContext';
import { validateScheduledPickup } from '../lib/scheduling';
import { formatToIST } from '../utils/time';
import { normalizeLanguageCode } from '../locales/indianLanguages';
import { resolvePassengerLocale, getPassengerRideProductLabels } from '../locales/passengerDashboard';
import {
  formatWebGeolocationError,
  getWebGeolocationPermissionState,
  isWebGeolocationAvailable,
  requestWebCurrentPosition,
} from '../lib/webGeolocation';

const LOGO_SOURCE = require('../../assets/images/autobuddy-logo.jpg');

const PASSENGER_MENU_SYMBOLS = {
  ride: { ios: 'car.fill', android: 'local_taxi', web: 'local_taxi' },
  pooling: { ios: 'person.3.fill', android: 'groups', web: 'groups' },
  live: { ios: 'location.circle.fill', android: 'my_location', web: 'my_location' },
  drivers: { ios: 'person.2.fill', android: 'person_search', web: 'person_search' },
  favorites: { ios: 'star.fill', android: 'favorite', web: 'favorite' },
  safety: { ios: 'shield.fill', android: 'shield', web: 'shield' },
  wallet: { ios: 'creditcard.fill', android: 'account_balance_wallet', web: 'account_balance_wallet' },
  spin: { ios: 'gift.fill', android: 'redeem', web: 'redeem' },
  notifications: { ios: 'bell.fill', android: 'notifications', web: 'notifications' },
  promo: { ios: 'ticket.fill', android: 'confirmation_number', web: 'confirmation_number' },
  support: { ios: 'questionmark.circle.fill', android: 'support_agent', web: 'support_agent' },
  payment: { ios: 'creditcard', android: 'credit_card', web: 'credit_card' },
  ratings: { ios: 'star.circle.fill', android: 'star_rate', web: 'star_rate' },
  preferences: { ios: 'slider.horizontal.3', android: 'tune', web: 'tune' },
  places: { ios: 'mappin', android: 'location_on', web: 'location_on' },
  emergency: { ios: 'exclamationmark.triangle.fill', android: 'emergency', web: 'emergency' },
  accessibility: { ios: 'figure.roll', android: 'accessible', web: 'accessible' },
  scheduled: { ios: 'calendar', android: 'calendar_clock', web: 'calendar_clock' },
  history: { ios: 'clock.arrow.circlepath', android: 'history', web: 'history' },
  profile: { ios: 'person.crop.circle.fill', android: 'person', web: 'person' },
  kyc: { ios: 'person.crop.rectangle', android: 'id_card', web: 'id_card' },
  documents: { ios: 'doc.text.fill', android: 'description', web: 'description' },
  receipts: { ios: 'list.bullet.rectangle.portrait.fill', android: 'receipt_long', web: 'receipt_long' },
  subscription: { ios: 'checkmark.seal.fill', android: 'workspace_premium', web: 'workspace_premium' },
  notes: { ios: 'note.text', android: 'note', web: 'note' },
  sharing: { ios: 'location.fill', android: 'location_on', web: 'location_on' },
  stats: { ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' },
  family: { ios: 'person.2.fill', android: 'family_restroom', web: 'family_restroom' },
  travel: { ios: 'globe', android: 'language', web: 'language' },
  corporate: { ios: 'building.2.fill', android: 'apartment', web: 'apartment' },
  scheduled_rides: { ios: 'calendar.badge.clock', android: 'schedule', web: 'schedule' },
};
const PASSENGER_MENU_OPTIONS = [
  { key: 'ride', label: 'Ride Booking', symbol: PASSENGER_MENU_SYMBOLS.ride },
  { key: 'pooling', label: 'Pool Ride', symbol: PASSENGER_MENU_SYMBOLS.pooling },
  { key: 'live', label: 'Live Ride', symbol: PASSENGER_MENU_SYMBOLS.live },
  { key: 'family', label: 'Family Booking', symbol: PASSENGER_MENU_SYMBOLS.family },
  { key: 'corporate', label: 'Corporate Booking', symbol: PASSENGER_MENU_SYMBOLS.corporate },
  { key: 'travel', label: 'Travel Packages', symbol: PASSENGER_MENU_SYMBOLS.travel },
  { key: 'scheduled_rides', label: 'Scheduled Rides', symbol: PASSENGER_MENU_SYMBOLS.scheduled_rides },
  { key: 'drivers', label: 'Drivers', symbol: PASSENGER_MENU_SYMBOLS.drivers },
  { key: 'favorites', label: 'Favorite Drivers', symbol: PASSENGER_MENU_SYMBOLS.favorites },
  { key: 'safety', label: 'Safety', symbol: PASSENGER_MENU_SYMBOLS.safety },
  { key: 'wallet', label: 'Wallet', symbol: PASSENGER_MENU_SYMBOLS.wallet },
  { key: 'spin', label: 'Spin & Win', symbol: PASSENGER_MENU_SYMBOLS.spin },
  { key: 'notifications', label: 'Notifications', symbol: PASSENGER_MENU_SYMBOLS.notifications },
  { key: 'promo', label: 'Promo Codes', symbol: PASSENGER_MENU_SYMBOLS.promo },
  { key: 'support', label: 'Support', symbol: PASSENGER_MENU_SYMBOLS.support },
  { key: 'payment', label: 'Payment', symbol: PASSENGER_MENU_SYMBOLS.payment },
  { key: 'ratings', label: 'Ratings', symbol: PASSENGER_MENU_SYMBOLS.ratings },
  { key: 'preferences', label: 'Preferences', symbol: PASSENGER_MENU_SYMBOLS.preferences },
  { key: 'places', label: 'Saved Places', symbol: PASSENGER_MENU_SYMBOLS.places },
  { key: 'emergency', label: 'Emergency', symbol: PASSENGER_MENU_SYMBOLS.emergency },
  { key: 'accessibility', label: 'Accessibility', symbol: PASSENGER_MENU_SYMBOLS.accessibility },
  { key: 'scheduled', label: 'Scheduled Rides', symbol: PASSENGER_MENU_SYMBOLS.scheduled },
  { key: 'history', label: 'Ride History', symbol: PASSENGER_MENU_SYMBOLS.history },
  { key: 'profile', label: 'Profile', symbol: PASSENGER_MENU_SYMBOLS.profile },
  { key: 'kyc', label: 'KYC Verification', symbol: PASSENGER_MENU_SYMBOLS.kyc },
  { key: 'documents', label: 'Documents', symbol: PASSENGER_MENU_SYMBOLS.documents },
  { key: 'receipts', label: 'Receipts', symbol: PASSENGER_MENU_SYMBOLS.receipts },
  { key: 'subscription', label: 'Subscription', symbol: PASSENGER_MENU_SYMBOLS.subscription },
  { key: 'notes', label: 'Ride Notes', symbol: PASSENGER_MENU_SYMBOLS.notes },
  { key: 'sharing', label: 'Location Sharing', symbol: PASSENGER_MENU_SYMBOLS.sharing },
  { key: 'stats', label: 'Ride Stats', symbol: PASSENGER_MENU_SYMBOLS.stats },
];
const PRIMARY_PASSENGER_MENU_KEY = 'ride';
const buildPassengerMenuOptions = (keys) =>
  keys.map((key) => PASSENGER_MENU_OPTIONS.find((menu) => menu.key === key)).filter(Boolean);
const PINNED_PASSENGER_MENU_OPTIONS = buildPassengerMenuOptions(['drivers', 'favorites']);
const SECONDARY_PASSENGER_MENU_GROUPS = [
  { key: 'booking', title: 'Booking Modes', keys: ['family', 'pooling', 'corporate', 'travel', 'scheduled_rides'] },
  { key: 'trip', title: 'Trip', keys: ['pooling', 'scheduled', 'history', 'stats', 'notes', 'ratings', 'receipts'] },
  { key: 'deals', title: 'Deals & Payment', keys: ['wallet', 'spin', 'promo', 'payment', 'subscription'] },
  { key: 'account', title: 'Account', keys: ['profile', 'kyc', 'documents', 'preferences', 'places', 'accessibility', 'sharing'] },
  { key: 'help', title: 'Help', keys: ['notifications', 'support', 'emergency'] },
].map((section) => ({
  ...section,
  options: buildPassengerMenuOptions(section.keys),
})).filter((section) => section.options.length > 0);
const PASSENGER_MENU_BY_KEY = PASSENGER_MENU_OPTIONS.reduce(
  (acc, menu) => ({ ...acc, [menu.key]: menu }),
  {},
);
const DRIVER_GENDER_OPTIONS = [
  { label: 'Any', value: 'any' },
  { label: 'Female', value: 'female' },
  { label: 'Male', value: 'male' },
];
const LIVE_DRIVER_TRACKING_STATUSES = new Set(['accepted', 'driver_arrived', 'in_progress']);
const CLOSED_BOOKING_STATUSES = new Set(['completed', 'cancelled', 'rejected', 'no_driver_found', 'booking_failed']);

function normalizeDriverGenderPreference(value) {
  const raw = String(value || 'any').trim().toLowerCase();
  return ['any', 'female', 'male'].includes(raw) ? raw : 'any';
}

function driverGenderPreferenceLabel(value) {
  return DRIVER_GENDER_OPTIONS.find((option) => option.value === normalizeDriverGenderPreference(value))?.label || 'Any';
}

function resolvePassengerMenuSymbol(symbol) {
  if (typeof symbol === 'string') {
    return symbol;
  }
  if (!symbol || typeof symbol !== 'object') {
    return 'circle';
  }
  if (Platform.OS === 'ios') {
    return symbol.ios || symbol.web || symbol.android || 'circle';
  }
  if (Platform.OS === 'android') {
    return symbol.android || symbol.web || symbol.ios || 'circle';
  }
  return symbol.web || symbol.android || symbol.ios || 'circle';
}

function PassengerMenuIcon({ symbol, selected, size = 16 }) {
  return (
    <SymbolView
      name={resolvePassengerMenuSymbol(symbol)}
      size={size}
      tintColor={selected ? '#FFFFFF' : COLORS.primaryDark}
      resizeMode="scaleAspectFit"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      fallback={<View style={[styles.menuIconFallback, selected && styles.menuIconFallbackActive]} />}
    />
  );
}
const DEFAULT_CITY_LOCATION = {
  latitude: 13.0827,
  longitude: 80.2707,
};
const SHOW_LEGACY_ONE_PAGE_BOOKING_FLOW = false;
const PASSENGER_POLL_UNCHANGED = Symbol('passenger-poll-unchanged');
const PASSENGER_POLL_INTERVAL_MS = 30000;
const PASSENGER_POLL_RATE_LIMIT_COOLDOWN_MS = 30000;
const PASSENGER_POLL_BACKEND_COOLDOWN_MS = 20000;
const PASSENGER_POLL_AUTH_RETRY_COOLDOWN_MS = 60000;
const PASSENGER_POLL_AUTH_EXPIRED_COOLDOWN_MS = 5 * 60 * 1000;
const DRIVER_DISCOVERY_DEDUPE_MS = 15000;
const DRIVER_DISCOVERY_RATE_LIMIT_COOLDOWN_MS = 30000;
const RIDE_PRODUCT_LABEL_FALLBACKS = {
  normal: 'Normal',
  pool: 'Pool Ride',
  scheduled: 'Scheduled',
  corporate: 'Corporate',
  airport: 'Airport',
  intercity: 'Intercity',
  ev_auto: 'EV Auto',
  tourism: 'Tourism',
  women_only: 'Women Only',
  pet: 'Pet Rides',
  rental_hourly: 'Rental',
  school_elderly_safe: 'School/Elderly',
};
const RIDE_PRODUCT_COMPATIBILITY_KEYS = {
  normal: ['instant'],
  pool: ['instant'],
  scheduled: ['scheduled'],
  corporate: ['corporate'],
  airport: ['airport'],
  intercity: ['intercity'],
  ev_auto: ['ev_auto'],
  tourism: ['tourism'],
  women_only: ['women_only'],
  pet: ['pet'],
  rental_hourly: ['rental'],
  school_elderly_safe: ['instant'],
};
const INTERCITY_COMPATIBLE_VEHICLE_TYPES = new Set(['taxi', 'xl', 'traveller']);
const EV_AUTO_COMPATIBLE_VEHICLE_TYPES = new Set(['auto', 'ev_auto']);
const TOURISM_PACKAGE_TYPES = [
  { id: 'half_day', label: 'Half Day', hours: 4 },
  { id: 'full_day', label: 'Full Day', hours: 8 },
  { id: 'multi_day', label: 'Multi Day', hours: 24 },
  { id: 'custom', label: 'Custom Tour', hours: 8 },
];
const TOURISM_CITIES = ['Trivandrum', 'Kochi', 'Munnar', 'Alleppey', 'Wayanad', 'Kanyakumari'];
const TOURISM_LANGUAGES = ['English', 'Malayalam', 'Tamil', 'Hindi'];
const TOURISM_PACKAGES = [
  {
    id: 'PKG_TRV_TEMPLE',
    city: 'Trivandrum',
    packageType: 'half_day',
    name: 'Trivandrum Temple Tour',
    durationHours: 4,
    basePrice: 1200,
    places: ['Padmanabhaswamy Temple', 'Azhimala Shiva Temple', 'Napier Museum'],
  },
  {
    id: 'PKG_TRV_HERITAGE',
    city: 'Trivandrum',
    packageType: 'full_day',
    name: 'Trivandrum Heritage Tour',
    durationHours: 8,
    basePrice: 1800,
    places: ['Padmanabhaswamy Temple', 'Napier Museum', 'Kovalam Beach', 'Poovar Island'],
  },
  {
    id: 'PKG_KOC_HERITAGE',
    city: 'Kochi',
    packageType: 'full_day',
    name: 'Kochi Heritage Trail',
    durationHours: 8,
    basePrice: 2200,
    places: ['Fort Kochi', 'Mattancherry Palace', 'Jew Town', 'Marine Drive'],
  },
  {
    id: 'PKG_MUN_NATURE',
    city: 'Munnar',
    packageType: 'full_day',
    name: 'Munnar Tea Gardens Tour',
    durationHours: 8,
    basePrice: 2600,
    places: ['Tea Gardens', 'Mattupetty Dam', 'Top Station'],
  },
  {
    id: 'PKG_ALP_BACKWATER',
    city: 'Alleppey',
    packageType: 'full_day',
    name: 'Alleppey Backwater Tour',
    durationHours: 8,
    basePrice: 2400,
    places: ['Backwater Cruise', 'Kuttanad', 'Alappuzha Beach'],
  },
  {
    id: 'PKG_WAY_NATURE',
    city: 'Wayanad',
    packageType: 'full_day',
    name: 'Wayanad Nature Circuit',
    durationHours: 8,
    basePrice: 2500,
    places: ['Edakkal Caves', 'Banasura Sagar Dam', 'Pookode Lake'],
  },
  {
    id: 'PKG_KKY_COASTAL',
    city: 'Kanyakumari',
    packageType: 'full_day',
    name: 'Kanyakumari Sunrise Tour',
    durationHours: 8,
    basePrice: 2300,
    places: ['Vivekananda Rock Memorial', 'Thiruvalluvar Statue', 'Kanyakumari Beach', 'Suchindram Temple'],
  },
  {
    id: 'PKG_CUSTOM',
    city: 'Trivandrum',
    packageType: 'custom',
    name: 'Custom Tour Builder',
    durationHours: 8,
    basePrice: 1800,
    places: [],
  },
];

function setPassengerPollCooldown(ref, cooldownMs) {
  ref.current = Date.now() + Math.max(0, Number(cooldownMs || 0));
}

function getApiErrorCode(error) {
  return String(error?.code || '').toUpperCase();
}

function getApiRetryAfterMs(error, fallbackMs) {
  const retryAfterMs = Number(error?.retryAfterMs);
  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
    return retryAfterMs;
  }
  return fallbackMs;
}

function getPassengerPollBackoffMs(error) {
  const status = Number(error?.status || 0);
  const code = getApiErrorCode(error);
  if (code === 'AUTH_RETRY_REQUIRED' || error?.sessionPreserved) {
    return PASSENGER_POLL_AUTH_RETRY_COOLDOWN_MS;
  }
  if (code === 'AUTH_EXPIRED' || error?.authExpired || status === 401 || status === 403) {
    return PASSENGER_POLL_AUTH_EXPIRED_COOLDOWN_MS;
  }
  if (status === 429 || error?.rateLimitCooldown) {
    return getApiRetryAfterMs(error, PASSENGER_POLL_RATE_LIMIT_COOLDOWN_MS);
  }
  if (status >= 500 || status === 0 || error?.backendOutage) {
    return getApiRetryAfterMs(error, PASSENGER_POLL_BACKEND_COOLDOWN_MS);
  }
  return 0;
}

function getPassengerSyncDelayMessage(
  error,
  fallbackMessage = 'Passenger sync is paused briefly. Please try again in a moment.',
) {
  const status = Number(error?.status || 0);
  const code = getApiErrorCode(error);
  if (code === 'AUTH_RETRY_REQUIRED' || error?.sessionPreserved || status === 401 || status === 403) {
    return 'Could not confirm your login right now. Please try again in a moment.';
  }
  if (status === 429 || error?.rateLimitCooldown) {
    return 'Server is busy. Slowing passenger sync briefly.';
  }
  if (status >= 500 || status === 0 || error?.backendOutage) {
    return 'Backend is temporarily unavailable. Retrying passenger sync automatically.';
  }
  return fallbackMessage;
}

function getDiscoveryLocationSignature(location) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return 'missing';
  }
  return `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

function getDriverDiscoveryBackoffMs(error) {
  const status = Number(error?.status || 0);
  if (status === 429 || error?.rateLimitCooldown) {
    return getApiRetryAfterMs(error, DRIVER_DISCOVERY_RATE_LIMIT_COOLDOWN_MS);
  }
  if (status >= 500 || status === 0 || error?.backendOutage) {
    return getApiRetryAfterMs(error, PASSENGER_POLL_BACKEND_COOLDOWN_MS);
  }
  return 0;
}

function titleFromId(value, fallback = 'Option') {
  const text = String(value || '').trim();
  if (!text) {
    return fallback;
  }
  return text
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getVehicleTypeName(vehicleType) {
  return getDisplayText(
    vehicleType?.name || vehicleType?.label || vehicleType?.vehicle_type_name,
    titleFromId(getVehicleTypeId(vehicleType), 'Auto'),
  );
}

function getVehicleTypeId(vehicleType) {
  if (typeof vehicleType === 'string') {
    return vehicleType.trim();
  }
  return String(
    vehicleType?.vehicle_type_id ||
      vehicleType?.type_id ||
      vehicleType?.key ||
      vehicleType?.id ||
      '',
  ).trim();
}

function normalizeVehicleModelOption(option, fallbackId) {
  if (typeof option === 'string') {
    const id = option.trim() || fallbackId;
    return { id, name: titleFromId(id, 'Standard') };
  }
  if (!option || typeof option !== 'object') {
    return null;
  }
  const id = String(
    option.id ||
      option.key ||
      option.model_id ||
      option.vehicle_model_id ||
      option.name ||
      fallbackId ||
      '',
  ).trim();
  const name = getDisplayText(option.name || option.label || option.model || option.title, titleFromId(id, 'Standard'));
  return {
    id: id || name,
    name,
    description: getDisplayText(option.description, ''),
  };
}

function getVehicleModelOptions(vehicleType) {
  const rawOptions =
    (Array.isArray(vehicleType?.subtypes) && vehicleType.subtypes) ||
    (Array.isArray(vehicleType?.models) && vehicleType.models) ||
    (Array.isArray(vehicleType?.vehicle_models) && vehicleType.vehicle_models) ||
    (Array.isArray(vehicleType?.model_options) && vehicleType.model_options) ||
    [];
  const normalized = rawOptions
    .map((option, index) => normalizeVehicleModelOption(option, `model_${index + 1}`))
    .filter(Boolean);
  if (normalized.length > 0) {
    return normalized;
  }
  const typeName = getVehicleTypeName(vehicleType);
  const typeId = getVehicleTypeId(vehicleType) || 'auto';
  return [{ id: `${typeId}_standard`, name: `${typeName} Standard`, description: 'Standard model' }];
}

function getRideProductName(rideProduct, labels = {}) {
  const localized = labels?.[rideProduct];
  return getDisplayText(localized?.title || localized, RIDE_PRODUCT_LABEL_FALLBACKS[rideProduct] || titleFromId(rideProduct, 'Normal'));
}

function vehicleSupportsRideProduct(vehicleType, rideProduct) {
  const vehicleTypeId = getVehicleTypeId(vehicleType).toLowerCase();
  if (rideProduct === 'intercity') {
    return INTERCITY_COMPATIBLE_VEHICLE_TYPES.has(vehicleTypeId);
  }
  if (rideProduct === 'ev_auto') {
    return EV_AUTO_COMPATIBLE_VEHICLE_TYPES.has(vehicleTypeId);
  }
  const allowedRideTypes = Array.isArray(vehicleType?.allowed_ride_types)
    ? vehicleType.allowed_ride_types.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean)
    : [];
  if (allowedRideTypes.length === 0) {
    return true;
  }
  const allowedRideTypeSet = new Set(allowedRideTypes);
  const compatibilityKeys = RIDE_PRODUCT_COMPATIBILITY_KEYS[rideProduct] || [rideProduct];
  return compatibilityKeys.some((key) => allowedRideTypeSet.has(key));
}

function getPreferredVehicleForRideProduct(vehicleTypes, rideProduct, currentVehicleTypeId) {
  const safeTypes = Array.isArray(vehicleTypes) ? vehicleTypes : [];
  const currentId = String(currentVehicleTypeId || '').trim().toLowerCase();
  const currentVehicle = safeTypes.find((type) => getVehicleTypeId(type).toLowerCase() === currentId);
  if (rideProduct === 'ev_auto') {
    const evAutoVehicle = safeTypes.find((type) => getVehicleTypeId(type).toLowerCase() === 'ev_auto');
    if (evAutoVehicle) {
      return evAutoVehicle;
    }
  }
  if (rideProduct === 'tourism' && currentId === 'auto') {
    const tourismVehicle = safeTypes.find((type) =>
      ['taxi', 'xl', 'traveller'].includes(getVehicleTypeId(type).toLowerCase())
    );
    if (tourismVehicle) {
      return tourismVehicle;
    }
  }
  if (currentVehicle && vehicleSupportsRideProduct(currentVehicle, rideProduct)) {
    return currentVehicle;
  }
  return safeTypes.find((type) => vehicleSupportsRideProduct(type, rideProduct)) || currentVehicle || safeTypes[0] || null;
}

function getTourismPackagesForSelection(city, packageType) {
  const cityKey = String(city || '').trim();
  const typeKey = String(packageType || '').trim();
  const filtered = TOURISM_PACKAGES.filter((item) => {
    if (item.id === 'PKG_CUSTOM') {
      return typeKey === 'custom';
    }
    return item.city === cityKey && item.packageType === typeKey;
  });
  if (filtered.length > 0) {
    return filtered;
  }
  return TOURISM_PACKAGES.filter((item) => item.city === cityKey && item.id !== 'PKG_CUSTOM');
}

function parseTourismCustomStops(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function getTourismFarePreview(packageItem, vehicleTypeId, passengerCount, addOns = {}) {
  const vehicleMultipliers = {
    auto: 1,
    taxi: 1.4,
    xl: 2,
    traveller: 3.5,
    bus: 5,
  };
  const vehicleKey = String(vehicleTypeId || 'taxi').trim().toLowerCase();
  const packagePrice = Number(packageItem?.basePrice || 1800);
  let farePreview = packagePrice * (vehicleMultipliers[vehicleKey] || 1.4);
  if (Number(passengerCount || 1) > 4) {
    farePreview += 300;
  }
  if (addOns.guide) {
    farePreview += 500;
  }
  if (addOns.photographer) {
    farePreview += 1000;
  }
  if (addOns.boatRide) {
    farePreview += 750;
  }
  return Math.round(farePreview);
}

export function PassengerMapContent({ token, user, onLogout, onProfilePress = undefined }) {
  const autoPickupInitializedRef = useRef(false);
  const bookingStatusRef = useRef({ bookingId: null, status: null });
  const pickupSearchRequestRef = useRef(0);
  const dropSearchRequestRef = useRef(0);
  const driverAddressCacheRef = useRef(new Map());
  const pickupAddressRequestRef = useRef(0);
  const dropAddressRequestRef = useRef(0);
  const socketRef = useRef(null);
  const refreshPassengerBookingsRef = useRef(null);
  const passengerPollInFlightRef = useRef(false);
  const passengerPollCycleRef = useRef(0);
  const passengerPollCooldownUntilRef = useRef(0);
  const passengerPollNoticeAtRef = useRef(0);
  const activeBookingRequestRef = useRef({ token: null, request: null });
  const driverDiscoveryRequestRef = useRef({ signature: '', request: null, completedAt: 0 });
  const driverDiscoveryCooldownUntilRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pickupQuery, setPickupQuery] = useState('');
  const [dropoffQuery, setDropoffQuery] = useState('');
  const [pickupSuggestions, setPickupSuggestions] = useState([]);
  const [dropoffSuggestions, setDropoffSuggestions] = useState([]);
  const [searchingPickup, setSearchingPickup] = useState(false);
  const [searchingDropoff, setSearchingDropoff] = useState(false);
  const [locatingPickup, setLocatingPickup] = useState(false);
  const [locationValidation, setLocationValidation] = useState({ pickup: false, dropoff: false });
  const [locationPermissionState, setLocationPermissionState] = useState('prompt');
  
  const [pickupLocation, setPickupLocation] = useState(null);
  const [dropoffLocation, setDropoffLocation] = useState(null);
  
  const [activeBooking, setActiveBooking] = useState(null);
  const [passengerBookings, setPassengerBookings] = useState([]);
  const [historyPaginationOffset, setHistoryPaginationOffset] = useState(0);
  const [historyPageSize] = useState(20);
  const [historyHasMore, setHistoryHasMore] = useState(true);
  const [fare, setFare] = useState(null);
  const [rideRealtime, setRideRealtime] = useState({
    bookingId: null,
    status: null,
    etaToPickup: null,
    etaToDrop: null,
  });
  const [nearbyDrivers, setNearbyDrivers] = useState([]);
  const [favoriteDriverIds, setFavoriteDriverIds] = useState([]);
  const [blockedDriverIds, setBlockedDriverIds] = useState([]);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [fareExpectationInput, setFareExpectationInput] = useState('');
  const [optedOutDriverIds, setOptedOutDriverIds] = useState([]);
  const [autoFetchingTripData, setAutoFetchingTripData] = useState(false);
  const [scheduledAtInput, setScheduledAtInput] = useState('');
  const [scheduledTimeZone, setScheduledTimeZone] = useState('local');
  const [scheduledDriverGenderPreference, setScheduledDriverGenderPreference] = useState(null);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('cash');
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState(null);
  const [selectedPaymentChannel, setSelectedPaymentChannel] = useState(null);
  const [passengerPreferences, setPassengerPreferences] = useState(null);
  const [appliedPromo, setAppliedPromo] = useState({
    code: null,
    discount: 0,
    discount_type: null,
    discount_value: 0,
    max_discount: null,
  });
  const [passengerAccessibility, setPassengerAccessibility] = useState(null);
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);
  const [showInteractiveMap, setShowInteractiveMap] = useState(true);
  const [isMobileWeb, setIsMobileWeb] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return false;
    }
    return window.matchMedia('(max-width: 720px)').matches;
  });
  const [selectingPoint, setSelectingPoint] = useState('pickup');
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [justCompletedBooking, setJustCompletedBooking] = useState(null);
  const [showBookingFlow, setShowBookingFlow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return undefined;
    }
    const mediaQuery = window.matchMedia('(max-width: 720px)');
    const updateMobileLayout = () => setIsMobileWeb(mediaQuery.matches);
    updateMobileLayout();

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', updateMobileLayout);
      return () => mediaQuery.removeEventListener('change', updateMobileLayout);
    }

    mediaQuery.addListener(updateMobileLayout);
    return () => mediaQuery.removeListener(updateMobileLayout);
  }, []);

  useEffect(() => {
    let mounted = true;
    getWebGeolocationPermissionState().then((state) => {
      if (mounted) {
        setLocationPermissionState(state);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);
  
  // Initialize notifications
  const passengerNotificationSettings = useMemo(
    () => ({
      ...(passengerPreferences || {}),
      vibration_enabled: passengerAccessibility?.haptic_feedback,
    }),
    [passengerAccessibility?.haptic_feedback, passengerPreferences],
  );
  useNotificationManager(token, user?.id, passengerNotificationSettings);
  const { unreadCount, addNotification } = useNotifications();
  const { vehicleTypes: availableVehicleTypes, loading: vehicleTypesLoading } = useVehicleTypes();
  const [rideProduct, setRideProduct] = useState('normal');
  const [selectedVehicleTypeId, setSelectedVehicleTypeId] = useState('');
  const [selectedVehicleModelId, setSelectedVehicleModelId] = useState('');
  
  // Auto-select first vehicle type when available to ensure fare estimation works
  useEffect(() => {
    if (availableVehicleTypes && availableVehicleTypes.length > 0 && !selectedVehicleTypeId) {
      const firstVehicleTypeId = getVehicleTypeId(availableVehicleTypes[0]);
      if (firstVehicleTypeId) {
        setSelectedVehicleTypeId(firstVehicleTypeId);
      }
    }
  }, [availableVehicleTypes]);
  
  const effectiveSelectedVehicleTypeId = useMemo(
    () => selectedVehicleTypeId || getVehicleTypeId(availableVehicleTypes?.[0]) || '',
    [availableVehicleTypes, selectedVehicleTypeId],
  );
  const resolveEffectiveVehicleModelId = useCallback(() => {
    const vehicleType =
      (availableVehicleTypes || []).find((type) => getVehicleTypeId(type) === effectiveSelectedVehicleTypeId) ||
      null;
    const modelOptions = getVehicleModelOptions(vehicleType);
    if (modelOptions.some((model) => model.id === selectedVehicleModelId)) {
      return selectedVehicleModelId;
    }
    return modelOptions[0]?.id || '';
  }, [availableVehicleTypes, effectiveSelectedVehicleTypeId, selectedVehicleModelId]);
  const [corporateCode, setCorporateCode] = useState('');
  const [corporatePurpose, setCorporatePurpose] = useState('');
  const [corporateCostCenterId, setCorporateCostCenterId] = useState('');
  const [airportTerminal, setAirportTerminal] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [tourismPackage, setTourismPackage] = useState('Kerala Local Sightseeing');
  const [tourismPackageType, setTourismPackageType] = useState('full_day');
  const [tourismCity, setTourismCity] = useState('Trivandrum');
  const [tourismPackageId, setTourismPackageId] = useState('PKG_TRV_HERITAGE');
  const [tourismCustomStops, setTourismCustomStops] = useState('Kovalam Beach, Poovar Island');
  const [tourismLanguagePreference, setTourismLanguagePreference] = useState('English');
  const [tourismGuideRequired, setTourismGuideRequired] = useState(false);
  const [tourismPhotographerRequired, setTourismPhotographerRequired] = useState(false);
  const [tourismBoatRideRequired, setTourismBoatRideRequired] = useState(false);
  const [tourismHotelBookingRequested, setTourismHotelBookingRequested] = useState(false);
  const [tourismTicketBookingRequested, setTourismTicketBookingRequested] = useState(false);
  const [intercityReturnTrip, setIntercityReturnTrip] = useState(false);
  const [intercityWaitHoursInput, setIntercityWaitHoursInput] = useState('0');
  const [intercityTollsIncluded, setIntercityTollsIncluded] = useState(true);
  const [intercityRouteNotes, setIntercityRouteNotes] = useState('');
  const [rentalHoursInput, setRentalHoursInput] = useState('4');
  const [safeRidePriority, setSafeRidePriority] = useState('elderly');
  const [safeRidePassengerName, setSafeRidePassengerName] = useState('');
  const [safeRidePassengerAge, setSafeRidePassengerAge] = useState('');
  const [safeRideGuardianName, setSafeRideGuardianName] = useState('');
  const [safeRideGuardianPhone, setSafeRideGuardianPhone] = useState('');
  const [safeRideWheelchairRequired, setSafeRideWheelchairRequired] = useState(false);
  const [safeRideAssistanceRequired, setSafeRideAssistanceRequired] = useState(true);
  const [safeRideFemaleDriverPreferred, setSafeRideFemaleDriverPreferred] = useState(false);
  const [safeRideTrustedDriverRequired, setSafeRideTrustedDriverRequired] = useState(true);
  const [safeRideGuardianShareTracking, setSafeRideGuardianShareTracking] = useState(true);
  const [safeRideNotes, setSafeRideNotes] = useState('');
  const [womenOnlyFemaleDriverRequired, setWomenOnlyFemaleDriverRequired] = useState(true);
  const [womenOnlyAllowTrustedFallback, setWomenOnlyAllowTrustedFallback] = useState(false);
  const [womenOnlyGuardianName, setWomenOnlyGuardianName] = useState('');
  const [womenOnlyGuardianPhone, setWomenOnlyGuardianPhone] = useState('');
  const [womenOnlyShareGuardianTracking, setWomenOnlyShareGuardianTracking] = useState(true);
  const [passengerCountInput, setPassengerCountInput] = useState('1');
  const [showProfile, setShowProfile] = useState(false);
  const [showSafePath, setShowSafePath] = useState(false);
  const [showPassengerMenus, setShowPassengerMenus] = useState(false);
  const [showRideDetailsModal, setShowRideDetailsModal] = useState(false);
  const [poolCreateRequest, setPoolCreateRequest] = useState({ key: 0, model: null });
  const [driverLiveAddress, setDriverLiveAddress] = useState('');
  const [activePassengerMenu, setActivePassengerMenu] = useState(PRIMARY_PASSENGER_MENU_KEY);
  const [bookingMode, setBookingMode] = useState('single'); // 'single', 'family', 'pooling', 'corporate', 'travel', 'scheduled'
  const [bookingJustCreated, setBookingJustCreated] = useState(false);
  const [rideProductAvailability, setRideProductAvailability] = useState({
    enabled_products: ['normal'],
    pickup_district: null,
  });
  const [rideProductsLoading, setRideProductsLoading] = useState(false);
  const [spinWinStatus, setSpinWinStatus] = useState(null);
  const [spinWinLoading, setSpinWinLoading] = useState(false);
  const [spinningNow, setSpinningNow] = useState(false);
  const [languageCode, setLanguageCode] = useState(() => {
    if (typeof window === 'undefined') {
      return 'en';
    }
    return normalizeLanguageCode(window.localStorage.getItem('autobuddy_lang') || 'en');
  });
  const placesConfigured = isPlacesConfigured();
  const liveTrackStatuses = useMemo(() => LIVE_DRIVER_TRACKING_STATUSES, []);
  const t = useMemo(() => resolvePassengerLocale(languageCode), [languageCode]);
  const rideProductLabels = useMemo(() => getPassengerRideProductLabels(t), [t]);
  const menuLabels = useMemo(
    () => ({
      ride: t.rideBooking,
      live: t.liveRide || 'Live Ride',
      drivers: t.drivers,
      favorites: t.favorites || 'Favorite Drivers',
      safety: t.safety,
      wallet: t.wallet,
      spin: t.spin,
      history: t.history,
      notifications: t.notifications || 'Notifications',
      promo: t.promo || 'Promo Codes',
      support: t.support || 'Support',
      payment: t.payment || 'Payment',
      ratings: t.ratings || 'Ratings',
      preferences: t.preferences || 'Preferences',
      places: t.places || 'Saved Places',
      emergency: t.emergency || 'Emergency',
      accessibility: t.accessibility || 'Accessibility',
      scheduled: t.scheduled || 'Scheduled Rides',
      profile: t.profile || 'Profile',
      kyc: t.kyc || 'Identity Verification',
      documents: t.documents || 'Documents',
      receipts: t.receipts || 'Saved Receipts',
      subscription: t.subscription || 'Subscription',
      notes: t.notes || 'Ride Notes',
      sharing: t.sharing || 'Location Sharing',
      stats: t.stats || 'Ride Stats',
    }),
    [t],
  );

  const normalizeBookingPaymentMethod = useCallback((value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized || normalized === 'cash') {
      return 'cash';
    }
    return 'online';
  }, []);

  const paymentMethodLabel = useMemo(() => {
    if (selectedPaymentMethod === 'online') {
      return 'Online';
    }
    return 'Cash';
  }, [selectedPaymentMethod]);

  const accessibilityUi = useMemo(() => {
    const textSize = String(passengerAccessibility?.text_size || 'normal').toLowerCase();
    const textScale =
      textSize === 'extra_large'
        ? 1.18
        : textSize === 'large'
          ? 1.1
          : 1;
    const highContrast = Boolean(passengerAccessibility?.high_contrast);
    return {
      textScale,
      panelStyle: highContrast ? { backgroundColor: '#FFFFFF', borderColor: '#000000', borderWidth: 2 } : null,
      textStyle: {
        color: highContrast ? '#000000' : COLORS.textMain,
        fontSize: Math.round(13 * textScale),
      },
      headingStyle: {
        color: highContrast ? '#000000' : COLORS.textMain,
        fontSize: Math.round(20 * textScale),
      },
    };
  }, [passengerAccessibility]);

  const triggerA11yFeedback = useCallback(
    (announcement) => {
      if (!announcement) {
        return;
      }
      if (passengerAccessibility?.haptic_feedback && typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(12);
      }
      if (
        (passengerAccessibility?.screen_reader_enabled || passengerAccessibility?.voice_guidance) &&
        typeof window !== 'undefined' &&
        window.speechSynthesis
      ) {
        try {
          const utterance = new SpeechSynthesisUtterance(String(announcement));
          utterance.lang = 'en-IN';
          if (passengerAccessibility?.reduce_motion) {
            utterance.rate = 0.9;
          }
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
        } catch {
          // Ignore speech synthesis failures.
        }
      }
    },
    [passengerAccessibility],
  );

  const normalizeLocation = useCallback((location) => {
    if (!location) {
      return null;
    }
    const latitude = Number(location.latitude ?? location.lat);
    const longitude = Number(location.longitude ?? location.lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    return {
      latitude: Number(latitude.toFixed(6)),
      longitude: Number(longitude.toFixed(6)),
      address: location.address || 'Selected location',
    };
  }, []);

  const normalizeBookingStatus = useCallback((statusValue) => {
    const raw = String(statusValue || '').trim().toLowerCase();
    if (!raw) {
      return '';
    }
    if (raw.includes('.')) {
      return raw.split('.').pop() || raw;
    }
    return raw;
  }, []);

  const activeBookingId = activeBooking?.id ? String(activeBooking.id) : '';
  const activeRideRealtime = rideRealtime.bookingId === activeBookingId ? rideRealtime : null;
  const etaToPickup = activeRideRealtime?.etaToPickup ?? null;
  const etaToDrop = activeRideRealtime?.etaToDrop ?? null;
  const activeBookingStatus = normalizeBookingStatus(activeRideRealtime?.status || activeBooking?.status);
  const activeRideStartOtp = String(activeBooking?.ride_start_otp || '').trim();
  const activeRideEndOtp = String(activeBooking?.ride_end_otp || '').trim();
  const isDriverLiveSharing = liveTrackStatuses.has(activeBookingStatus);
  const canCancelActiveBooking = ['pending', 'scheduled', 'driver_arrived'].includes(activeBookingStatus);
  const driverArrivedCancellationApplies = activeBookingStatus === 'driver_arrived';
  const hasLiveRide = Boolean(
    activeBooking?.id &&
      !CLOSED_BOOKING_STATUSES.has(activeBookingStatus),
  );
  const pinnedPassengerMenuOptions = useMemo(
    () => (
      hasLiveRide
        ? [PASSENGER_MENU_BY_KEY.live, ...PINNED_PASSENGER_MENU_OPTIONS].filter(Boolean)
        : PINNED_PASSENGER_MENU_OPTIONS
    ),
    [hasLiveRide],
  );
  const liveEtaLabel = useMemo(() => {
    const map = {
      pending: '6 min',
      accepted: '4 min',
      driver_arrived: 'Arrived',
      in_progress: 'On Trip',
      completed: 'Done',
    };
    return map[activeBookingStatus] || '6 min';
  }, [activeBookingStatus]);
  const keralaSafety = useKeralaSafety({
    token,
    userName: user?.name,
    activeBooking,
  });
  const liveDriverLocation = normalizeLocation(
    activeBooking?.driver_live_location || activeBooking?.driver_location,
  );
  const formatCoordinateAddress = useCallback(
    (latitude, longitude) => {
      return 'Selected point on map';
    },
    [],
  );
  const buildLocationFromCoordinate = useCallback(
    (coordinate) => {
      const latitude = Number(Number(coordinate.latitude).toFixed(6));
      const longitude = Number(Number(coordinate.longitude).toFixed(6));
      return { latitude, longitude, address: formatCoordinateAddress(latitude, longitude) };
    },
    [formatCoordinateAddress],
  );
  const resolveReadableAddress = useCallback(
    async (latitude, longitude) => {
      if (placesConfigured) {
        const address = await reverseGeocodeLocation(latitude, longitude).catch(() => null);
        if (address) {
          return address;
        }
      }
      return formatCoordinateAddress(latitude, longitude);
    },
    [formatCoordinateAddress, placesConfigured],
  );
  const resolveAddressForPoint = useCallback(
    async (point, coordinate) => {
      const next = buildLocationFromCoordinate(coordinate);
      const requestRef = point === 'pickup' ? pickupAddressRequestRef : dropAddressRequestRef;
      const requestId = requestRef.current + 1;
      requestRef.current = requestId;

      const address = await resolveReadableAddress(next.latitude, next.longitude);
      if (requestRef.current !== requestId) {
        return;
      }

      const hydratedLocation = { ...next, address };
      if (point === 'pickup') {
        setPickupLocation(hydratedLocation);
        setPickupQuery(address);
      } else {
        setDropoffLocation(hydratedLocation);
        setDropoffQuery(address);
      }
    },
    [buildLocationFromCoordinate, resolveReadableAddress],
  );
  const driverLiveLocationLabel = useMemo(() => {
    if (!liveDriverLocation) {
      return '';
    }
    return (
      driverLiveAddress ||
      liveDriverLocation.address ||
      formatCoordinateAddress(liveDriverLocation.latitude, liveDriverLocation.longitude)
    );
  }, [driverLiveAddress, formatCoordinateAddress, liveDriverLocation]);
  const selectedPickupLocation = pickupLocation || normalizeLocation(activeBooking?.pickup_location);
  const selectedDropoffLocation = dropoffLocation || normalizeLocation(activeBooking?.drop_location || activeBooking?.dropoff_location);
  const searchBias = useMemo(
    () =>
      pickupLocation ||
      dropoffLocation ||
      selectedPickupLocation ||
      selectedDropoffLocation || { latitude: 13.0827, longitude: 80.2707 },
    [dropoffLocation, pickupLocation, selectedDropoffLocation, selectedPickupLocation],
  );
  const poolPanelLocation = selectedPickupLocation || pickupLocation || searchBias || DEFAULT_CITY_LOCATION;
  const poolCreateDefaults = useMemo(
    () => ({
      pickup_location: selectedPickupLocation?.address || pickupLocation?.address || '',
      dropoff_location: selectedDropoffLocation?.address || dropoffLocation?.address || '',
      max_wait_minutes: 10,
    }),
    [
      dropoffLocation?.address,
      pickupLocation?.address,
      selectedDropoffLocation?.address,
      selectedPickupLocation?.address,
    ],
  );

  const mapState = useMemo(() => {
    const origin = selectedPickupLocation;
    const destination = selectedDropoffLocation;
    const driverLiveLocation = isDriverLiveSharing ? liveDriverLocation : null;
    const liveTarget = activeBookingStatus === 'in_progress' ? (destination || origin) : (origin || destination);

    const routeOrigin = isDriverLiveSharing && driverLiveLocation && liveTarget
      ? driverLiveLocation
      : origin;
    const routeDestination = isDriverLiveSharing && driverLiveLocation && liveTarget
      ? liveTarget
      : destination;

    return {
      origin,
      destination,
      driverLiveLocation,
      routeOrigin,
      routeDestination,
    };
  }, [selectedPickupLocation, selectedDropoffLocation, liveDriverLocation, activeBookingStatus, isDriverLiveSharing]);

  // Hazard UI state
  const [hazardMarkers, setHazardMarkers] = React.useState([]);
  const [autoCenterHazardId, setAutoCenterHazardId] = React.useState(null);

  const fareExpectation = useMemo(() => {
    const parsed = Number(String(fareExpectationInput || '').trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [fareExpectationInput]);

  const enabledRideProducts = useMemo(() => {
    const source = Array.isArray(rideProductAvailability?.enabled_products)
      ? rideProductAvailability.enabled_products
      : [];
    const filtered = source.filter((key) => typeof key === 'string' && key.trim().length > 0);
    return filtered.length > 0 ? filtered : ['normal'];
  }, [rideProductAvailability]);
  const canScheduleBooking = enabledRideProducts.includes('scheduled');
  const effectiveRideProduct = rideProduct || 'normal';
  const isScheduledBookingMode = effectiveRideProduct === 'scheduled' && canScheduleBooking;
  const tourismPackagesForSelection = useMemo(
    () => getTourismPackagesForSelection(tourismCity, tourismPackageType),
    [tourismCity, tourismPackageType],
  );
  const selectedTourismPackage = useMemo(
    () =>
      tourismPackagesForSelection.find((item) => item.id === tourismPackageId) ||
      tourismPackagesForSelection[0] ||
      TOURISM_PACKAGES.find((item) => item.id === 'PKG_TRV_HERITAGE'),
    [tourismPackageId, tourismPackagesForSelection],
  );
  const tourismCustomStopList = useMemo(() => parseTourismCustomStops(tourismCustomStops), [tourismCustomStops]);
  const tourismAddOns = useMemo(
    () => ({
      guide: tourismGuideRequired,
      photographer: tourismPhotographerRequired,
      boatRide: tourismBoatRideRequired,
      hotelBooking: tourismHotelBookingRequested,
      ticketBooking: tourismTicketBookingRequested,
    }),
    [
      tourismBoatRideRequired,
      tourismGuideRequired,
      tourismHotelBookingRequested,
      tourismPhotographerRequired,
      tourismTicketBookingRequested,
    ],
  );
  const tourismFarePreview = useMemo(
    () =>
      getTourismFarePreview(
        selectedTourismPackage,
        effectiveSelectedVehicleTypeId,
        Number(passengerCountInput || 1) || 1,
        tourismAddOns,
      ),
    [effectiveSelectedVehicleTypeId, passengerCountInput, selectedTourismPackage, tourismAddOns],
  );

  const effectiveScheduledDriverGenderPreference = normalizeDriverGenderPreference(
    scheduledDriverGenderPreference || passengerPreferences?.driver_gender_preference,
  );

  const estimateDriverFare = useCallback(
    (driver) => {
      const projectedFare = Number(driver?.projected_fare);
      if (Number.isFinite(projectedFare) && projectedFare > 0) {
        return projectedFare;
      }
      const baseTripFare = Number(fare?.total_fare || 0);
      const multiplier = Number(driver?.fare_multiplier || 1);
      const pickupSurcharge = Number(driver?.pickup_surcharge || 0);
      if (!Number.isFinite(baseTripFare) || baseTripFare <= 0) {
        return Number.isFinite(pickupSurcharge) ? Math.max(0, pickupSurcharge) : 0;
      }
      const effectiveMultiplier = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
      const surcharge = Number.isFinite(pickupSurcharge) ? pickupSurcharge : 0;
      return Number((baseTripFare * effectiveMultiplier + surcharge).toFixed(2));
    },
    [fare?.total_fare],
  );

  const visibleDrivers = useMemo(() => {
    const optedOutSet = new Set(optedOutDriverIds);
    const eligible = nearbyDrivers.filter((driver) => {
      if (optedOutSet.has(driver.driver_id)) {
        return false;
      }
      if (fareExpectation === null) {
        return true;
      }
      return estimateDriverFare(driver) <= fareExpectation;
    });
    return eligible.slice(0, 5);
  }, [nearbyDrivers, optedOutDriverIds, fareExpectation, estimateDriverFare]);

  const notifyWithVoice = useCallback((title, body) => {
    triggerA11yFeedback(`${title}. ${body}`);
    if (typeof Notification !== 'undefined') {
      try {
        if (Notification.permission === 'granted') {
          void new Notification(title, { body });
        } else if (Notification.permission === 'default') {
          Notification.requestPermission().catch(() => null);
        }
      } catch {
        // Ignore browser notification errors.
      }
    }
  }, [triggerA11yFeedback]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }
    const htmlNode = document.documentElement;
    const previousBehavior = htmlNode.style.scrollBehavior;
    if (passengerAccessibility?.reduce_motion) {
      htmlNode.style.scrollBehavior = 'auto';
    }
    return () => {
      htmlNode.style.scrollBehavior = previousBehavior;
    };
  }, [passengerAccessibility?.reduce_motion]);

  const isPageVisible = useCallback(() => {
    if (typeof document === 'undefined') {
      return true;
    }
    return document.visibilityState !== 'hidden';
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }
    const syncLanguage = () => {
      const next = normalizeLanguageCode(window.localStorage.getItem('autobuddy_lang') || 'en');
      setLanguageCode(next);
    };
    const onLanguageEvent = () => {
      syncLanguage();
    };
    syncLanguage();
    window.addEventListener('storage', syncLanguage);
    window.addEventListener('autobuddy-language-change', onLanguageEvent);
    return () => {
      window.removeEventListener('storage', syncLanguage);
      window.removeEventListener('autobuddy-language-change', onLanguageEvent);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const hydrateDriverLiveAddress = async () => {
      if (!liveDriverLocation || !isDriverLiveSharing) {
        if (!cancelled) {
          setDriverLiveAddress('');
        }
        return;
      }

      const currentAddress = String(liveDriverLocation.address || '').trim();
      const looksLikeCoordinateAddress = /^lat\s*-?\d+(\.\d+)?\s*,\s*lng\s*-?\d+(\.\d+)?$/i.test(currentAddress);
      if (currentAddress && !looksLikeCoordinateAddress) {
        if (!cancelled) {
          setDriverLiveAddress(currentAddress);
        }
        return;
      }

      const cacheKey = `${liveDriverLocation.latitude.toFixed(4)},${liveDriverLocation.longitude.toFixed(4)}`;
      const cachedAddress = driverAddressCacheRef.current.get(cacheKey);
      if (cachedAddress) {
        if (!cancelled) {
          setDriverLiveAddress(cachedAddress);
        }
        return;
      }

      let resolvedAddress = '';
      if (placesConfigured) {
        try {
          resolvedAddress = String(
            (await reverseGeocodeLocation(liveDriverLocation.latitude, liveDriverLocation.longitude)) || '',
          ).trim();
        } catch {
          // Keep fallback below.
        }
      }
      const finalAddress = resolvedAddress || currentAddress || formatCoordinateAddress(
        liveDriverLocation.latitude,
        liveDriverLocation.longitude,
      );
      if (cancelled) {
        return;
      }
      if (finalAddress) {
        driverAddressCacheRef.current.set(cacheKey, finalAddress);
      }
      setDriverLiveAddress(finalAddress);
    };

    hydrateDriverLiveAddress();
    return () => {
      cancelled = true;
    };
  }, [
    formatCoordinateAddress,
    isDriverLiveSharing,
    liveDriverLocation,
    placesConfigured,
  ]);

  const callApi = async (fn, successMessage) => {
    try {
      setLoading(true);
      setError('');
      if (successMessage) {
        setMessage('');
      }
      const result = await fn();
      if (successMessage) {
        setMessage(successMessage);
      }
      return result;
    } catch (err) {
      setError(err.message || t.requestFailed);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const parseLocations = () => {
    const missingPickup = !pickupLocation;
    const missingDropoff = !dropoffLocation;
    setLocationValidation({ pickup: missingPickup, dropoff: missingDropoff });
    if (missingPickup || missingDropoff) {
      setError(t.selectPickupDropBoth);
      return null;
    }
    return { pickup: pickupLocation, dropoff: dropoffLocation };
  };

  const setLocationForPoint = (point, location) => {
    if (point === 'pickup') {
      setPickupLocation(location);
      setPickupQuery(location.address || '');
      setPickupSuggestions([]);
      setLocationValidation((prev) => ({ ...prev, pickup: false }));
    } else {
      setDropoffLocation(location);
      setDropoffQuery(location.address || '');
      setDropoffSuggestions([]);
      setLocationValidation((prev) => ({ ...prev, dropoff: false }));
    }
    setFare(null);
    setNearbyDrivers([]);
    setOptedOutDriverIds([]);
    setSelectedDriverId('');
    driverDiscoveryRequestRef.current = { signature: '', request: null, completedAt: 0 };
    driverDiscoveryCooldownUntilRef.current = 0;
  };

  const clearRideSelectionResults = useCallback(() => {
    setFare(null);
    setNearbyDrivers([]);
    setOptedOutDriverIds([]);
    setSelectedDriverId('');
    driverDiscoveryRequestRef.current = { signature: '', request: null, completedAt: 0 };
    driverDiscoveryCooldownUntilRef.current = 0;
  }, []);

  const handleVehicleTypeSelect = useCallback(
    (vehicleTypeOrId) => {
      const nextTypeId = getVehicleTypeId(vehicleTypeOrId);
      if (!nextTypeId) {
        return;
      }
      console.log('[VEHICLE_TYPE_SELECT]', { nextTypeId });
      const nextVehicleType =
        (availableVehicleTypes || []).find((type) => getVehicleTypeId(type) === nextTypeId) || null;
      const nextVehicleModelId = getVehicleModelOptions(nextVehicleType)[0]?.id || '';
      setSelectedVehicleTypeId(nextTypeId);
      setSelectedVehicleModelId(nextVehicleModelId);
      clearRideSelectionResults();
    },
    [availableVehicleTypes, clearRideSelectionResults],
  );

  const handleVehicleModelSelect = useCallback(
    (modelId) => {
      const nextModelId = String(modelId || '').trim();
      if (!nextModelId) {
        return;
      }
      console.log('[VEHICLE_MODEL_SELECT]', { nextModelId });
      setSelectedVehicleModelId(nextModelId);
      clearRideSelectionResults();
    },
    [clearRideSelectionResults],
  );

  const handleRideProductSelect = useCallback(
    (product) => {
      const nextProduct = String(product || 'normal').trim() || 'normal';
      console.log('[RIDE_PRODUCT_SELECT]', { nextProduct });
      const preferredVehicle = getPreferredVehicleForRideProduct(
        availableVehicleTypes,
        nextProduct,
        effectiveSelectedVehicleTypeId,
      );
      const preferredVehicleTypeId = getVehicleTypeId(preferredVehicle);
      if (preferredVehicleTypeId && preferredVehicleTypeId !== effectiveSelectedVehicleTypeId) {
        console.log('[RIDE_PRODUCT_SELECT_VEHICLE_SWITCH]', { 
          from: effectiveSelectedVehicleTypeId, 
          to: preferredVehicleTypeId 
        });
        setSelectedVehicleTypeId(preferredVehicleTypeId);
        setSelectedVehicleModelId(getVehicleModelOptions(preferredVehicle)[0]?.id || '');
      }
      setRideProduct(nextProduct);
      clearRideSelectionResults();
    },
    [availableVehicleTypes, clearRideSelectionResults, effectiveSelectedVehicleTypeId],
  );

  const renderTourismFields = useCallback(() => {
    const isCustomTour = tourismPackageType === 'custom';
    const plannedStops = isCustomTour ? tourismCustomStopList : selectedTourismPackage?.places || [];
    const addonOptions = [
      { key: 'guide', label: 'Local Guide', selected: tourismGuideRequired, onPress: setTourismGuideRequired },
      { key: 'photographer', label: 'Photographer', selected: tourismPhotographerRequired, onPress: setTourismPhotographerRequired },
      { key: 'boat', label: 'Boat Ride', selected: tourismBoatRideRequired, onPress: setTourismBoatRideRequired },
      { key: 'hotel', label: 'Hotel Help', selected: tourismHotelBookingRequested, onPress: setTourismHotelBookingRequested },
      { key: 'ticket', label: 'Ticket Help', selected: tourismTicketBookingRequested, onPress: setTourismTicketBookingRequested },
    ];
    return (
      <>
        <Text style={styles.infoText}>Package type</Text>
        <View style={styles.rideDetailsWrapRow}>
          {TOURISM_PACKAGE_TYPES.map((option) => {
            const selected = tourismPackageType === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.modeChip, selected && styles.modeChipActive]}
                onPress={() => setTourismPackageType(option.id)}
                disabled={loading}>
                <Text style={[styles.modeChipText, selected && styles.modeChipTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.infoText}>City</Text>
        <View style={styles.rideDetailsWrapRow}>
          {TOURISM_CITIES.map((city) => {
            const selected = tourismCity === city;
            return (
              <TouchableOpacity
                key={city}
                style={[styles.modeChip, selected && styles.modeChipActive]}
                onPress={() => setTourismCity(city)}
                disabled={loading}>
                <Text style={[styles.modeChipText, selected && styles.modeChipTextActive]}>{city}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.infoText}>Package</Text>
        <View style={styles.tourismPackageList}>
          {tourismPackagesForSelection.map((packageItem) => {
            const selected = selectedTourismPackage?.id === packageItem.id;
            return (
              <TouchableOpacity
                key={packageItem.id}
                style={[styles.tourismPackageChip, selected && styles.tourismPackageChipActive]}
                onPress={() => {
                  setTourismPackageId(packageItem.id);
                  setTourismPackage(packageItem.name);
                }}
                disabled={loading}>
                <Text style={[styles.tourismPackageTitle, selected && styles.modeChipTextActive]} numberOfLines={1}>
                  {packageItem.name}
                </Text>
                <Text style={styles.hint} numberOfLines={1}>
                  {packageItem.durationHours}h | INR {packageItem.basePrice}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {isCustomTour && (
          <VoiceTextInput
            style={[styles.input, styles.assistedNotesInput]}
            value={tourismCustomStops}
            onChangeText={(value) => setTourismCustomStops(value.slice(0, 240))}
            placeholder="Custom stops, comma separated"
            placeholderTextColor={COLORS.textMuted}
            multiline
            numberOfLines={2}
          />
        )}

        <Text style={styles.infoText}>Language</Text>
        <View style={styles.rideDetailsWrapRow}>
          {TOURISM_LANGUAGES.map((language) => {
            const selected = tourismLanguagePreference === language;
            return (
              <TouchableOpacity
                key={language}
                style={[styles.modeChip, selected && styles.modeChipActive]}
                onPress={() => setTourismLanguagePreference(language)}
                disabled={loading}>
                <Text style={[styles.modeChipText, selected && styles.modeChipTextActive]}>{language}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.infoText}>Add-ons</Text>
        <View style={styles.rideDetailsWrapRow}>
          {addonOptions.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[styles.modeChip, option.selected && styles.modeChipActive]}
              onPress={() => option.onPress((prev) => !prev)}
              disabled={loading}>
              <Text style={[styles.modeChipText, option.selected && styles.modeChipTextActive]}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.tourismPreviewBox}>
          <Text style={styles.infoTitle}>Tour preview</Text>
          <Text style={styles.infoText}>
            {tourismCity} | {selectedTourismPackage?.durationHours || 8}h | approx INR {tourismFarePreview}
          </Text>
          <Text style={styles.hint}>
            {plannedStops.length > 0 ? plannedStops.join(' -> ') : 'Add custom stops to generate the route'}
          </Text>
          <Text style={styles.hint}>Tourism drivers need KYC, 4.5+ rating, language match and local experience.</Text>
        </View>
      </>
    );
  }, [
    loading,
    selectedTourismPackage,
    tourismBoatRideRequired,
    tourismCity,
    tourismCustomStopList,
    tourismCustomStops,
    tourismFarePreview,
    tourismGuideRequired,
    tourismHotelBookingRequested,
    tourismLanguagePreference,
    tourismPackageType,
    tourismPackagesForSelection,
    tourismPhotographerRequired,
    tourismTicketBookingRequested,
  ]);

  const renderWomenOnlyFields = () => {
    const fallbackEnabled = !womenOnlyFemaleDriverRequired && womenOnlyAllowTrustedFallback;
    return (
      <View style={styles.rideDetailsSection}>
        <Text style={styles.rideDetailsSectionTitle}>Women Only safety</Text>
        <Text style={styles.hint}>
          Female passenger ride. Female driver first with KYC, police verification, live location, 4.7+ rating and no active complaints.
        </Text>
        <View style={styles.assistedGrid}>
          <VoiceTextInput
            style={[styles.input, styles.assistedInput]}
            value={womenOnlyGuardianName}
            onChangeText={setWomenOnlyGuardianName}
            placeholder="Guardian name"
            placeholderTextColor={COLORS.textMuted}
          />
          <VoiceTextInput
            style={[styles.input, styles.assistedInput]}
            value={womenOnlyGuardianPhone}
            onChangeText={setWomenOnlyGuardianPhone}
            keyboardType="phone-pad"
            placeholder="Guardian phone"
            placeholderTextColor={COLORS.textMuted}
          />
        </View>
        <View style={styles.assistedToggleGrid}>
          <TouchableOpacity
            style={[styles.modeChip, styles.assistedToggleChip, womenOnlyFemaleDriverRequired && styles.modeChipActive]}
            onPress={() => {
              setWomenOnlyFemaleDriverRequired((prev) => !prev);
              if (!womenOnlyFemaleDriverRequired) {
                setWomenOnlyAllowTrustedFallback(false);
              }
            }}
            disabled={loading}>
            <Text style={[styles.modeChipText, womenOnlyFemaleDriverRequired && styles.modeChipTextActive]}>
              Female driver required
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeChip, styles.assistedToggleChip, fallbackEnabled && styles.modeChipActive]}
            onPress={() => {
              if (womenOnlyFemaleDriverRequired) {
                setWomenOnlyFemaleDriverRequired(false);
                setWomenOnlyAllowTrustedFallback(true);
                return;
              }
              setWomenOnlyAllowTrustedFallback((prev) => !prev);
            }}
            disabled={loading}>
            <Text style={[styles.modeChipText, fallbackEnabled && styles.modeChipTextActive]}>
              Trusted safety fallback
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeChip, styles.assistedToggleChip, womenOnlyShareGuardianTracking && styles.modeChipActive]}
            onPress={() => setWomenOnlyShareGuardianTracking((prev) => !prev)}
            disabled={loading}>
            <Text style={[styles.modeChipText, womenOnlyShareGuardianTracking && styles.modeChipTextActive]}>
              Guardian tracking
            </Text>
          </TouchableOpacity>
        </View>
        <View style={styles.tourismPreviewBox}>
          <Text style={styles.infoTitle}>Safety stack</Text>
          <Text style={styles.hint}>
            Pickup OTP, SOS, live tracking, night checks and completion notification stay on for this ride.
          </Text>
        </View>
      </View>
    );
  };

  useEffect(() => {
    if (!token) {
      return undefined;
    }
    let cancelled = false;
    const hydratePassengerSettings = async () => {
      const [prefs, accessibility] = await Promise.all([
        apiRequest('/v1/passengers/preferences', { token }).catch(() => null),
        apiRequest('/v1/passengers/accessibility', { token }).catch(() => null),
      ]);
      if (cancelled) {
        return;
      }
      if (prefs) {
        setPassengerPreferences(prefs);
      }
      if (accessibility) {
        setPassengerAccessibility(accessibility);
      }
    };
    hydratePassengerSettings().catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    if (activePassengerMenu !== 'live' || hasLiveRide) {
      return undefined;
    }
    const timer = setTimeout(() => {
      setActivePassengerMenu(PRIMARY_PASSENGER_MENU_KEY);
    }, 0);
    return () => clearTimeout(timer);
  }, [activePassengerMenu, hasLiveRide]);

  // Watch for ride completion and auto-trigger rating modal
  useEffect(() => {
    if (!activeBooking?.id) {
      return undefined;
    }
    
    const currentStatus = String(activeBooking?.status || '').toLowerCase();
    if (currentStatus === 'completed' && !showRatingModal) {
      const completedBooking = activeBooking;
      const timer = setTimeout(() => {
        setJustCompletedBooking(completedBooking);
        setShowRatingModal(true);
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [activeBooking, activeBooking?.id, activeBooking?.status, showRatingModal]);

  const handleBookingComplete = useCallback((bookingData) => {
    const bookingId = bookingData?.booking_id || bookingData?.bookingId || bookingData?.id;
    if (bookingId) {
      setMessage(`Booking created! ID: ${bookingId}`);
      setActiveBooking({
        ...bookingData,
        id: bookingData?.id || bookingId,
        booking_id: bookingId,
        status: bookingData?.status || 'pending',
      });
      setBookingJustCreated(true);
      refreshPassengerBookingsRef.current?.({ silent: true });
    }
    setShowBookingFlow(false);
  }, []);

  const handleBookingCancel = useCallback(() => {
    setShowBookingFlow(false);
  }, []);

  const handlePromoDiscountApplied = useCallback((promoState) => {
    const nextPromo = {
      code: promoState?.code || null,
      discount: Number(promoState?.discount || 0),
      discount_type: promoState?.discount_type || null,
      discount_value: Number(promoState?.discount_value || promoState?.discount || 0),
      max_discount:
        promoState?.max_discount === null || promoState?.max_discount === undefined
          ? null
          : Number(promoState.max_discount),
    };
    setAppliedPromo(nextPromo);
    if (nextPromo.code) {
      setMessage(`Promo applied: ${nextPromo.code}`);
    }
  }, []);

  const handleDefaultMethodChange = useCallback(
    (method) => {
      const nextMethodType = method?.method_type || method;
      const nextMethod = normalizeBookingPaymentMethod(nextMethodType);
      setSelectedPaymentMethod(nextMethod);
      setSelectedPaymentMethodId(method?.id || null);
      setSelectedPaymentChannel(typeof nextMethodType === 'string' ? nextMethodType : null);
      setMessage(`Payment method set to ${nextMethod === 'online' ? 'Online' : 'Cash'}.`);
    },
    [normalizeBookingPaymentMethod],
  );

  const handlePreferencesChange = useCallback(
    (nextPrefs) => {
      setPassengerPreferences(nextPrefs || null);
    },
    [],
  );

  const handleAccessibilityChange = useCallback((settings) => {
    setPassengerAccessibility(settings || null);
  }, []);

  const closeNotificationCenter = useCallback(() => {
    setShowNotificationCenter(false);
    setActivePassengerMenu((currentMenu) =>
      currentMenu === 'notifications' ? PRIMARY_PASSENGER_MENU_KEY : currentMenu,
    );
  }, []);

  const handleNotificationPress = useCallback(
    (notification) => {
      if (notification?.type === 'booking_accepted' || notification?.bookingId) {
        setActivePassengerMenu(PRIMARY_PASSENGER_MENU_KEY);
        setShowNotificationCenter(false);
        return;
      }
      closeNotificationCenter();
    },
    [closeNotificationCenter],
  );

  const openPoolRideFlow = useCallback(
    (model = 'SYSTEM_CREATED') => {
      setRideProduct('pool');
      setShowRideDetailsModal(false);
      setPoolCreateRequest((prev) => ({ key: prev.key + 1, model }));
    },
    [],
  );

  const handleMenuSelection = useCallback(
    (menuKey, label) => {
      // Handle booking mode switching - map menu keys to active menu items
      const modeMapping = {
        ride: 'ride',
        family: 'family',
        pooling: 'pooling',
        corporate: 'corporate',
        travel: 'travel',
        scheduled_rides: 'scheduled',  // Map scheduled_rides menu option to 'scheduled' menu
      };

      const targetMenu = modeMapping[menuKey] || menuKey;

      // Special handling for pooling - use the flow method
      if (menuKey === 'pooling') {
        openPoolRideFlow('SYSTEM_CREATED');
        setActivePassengerMenu('pooling');
        setShowPassengerMenus(false);
        triggerA11yFeedback('Pool ride mode activated');
        return;
      }

      // For all other menu items, just set the active menu
      setActivePassengerMenu(targetMenu);
      setShowPassengerMenus(false);
      setShowNotificationCenter(menuKey === 'notifications');
      triggerA11yFeedback(`${label || 'Menu'} selected`);
    },
    [triggerA11yFeedback, openPoolRideFlow, setActivePassengerMenu, setShowPassengerMenus, setShowNotificationCenter],
  );

  const getMenuLabel = useCallback(
    (menu) => {
      const baseLabel = menuLabels[menu?.key] || menu?.key || t.menu;
      if (menu?.key === 'notifications' && unreadCount > 0) {
        return `${baseLabel} (${unreadCount})`;
      }
      return baseLabel;
    },
    [menuLabels, t.menu, unreadCount],
  );

  const renderPassengerMenuChip = useCallback(
    (menu, variant = 'secondary') => {
      const label = getMenuLabel(menu);
      const selected = activePassengerMenu === menu.key;
      return (
        <TouchableOpacity
          key={menu.key}
          style={[
            styles.menuChip,
            variant === 'pinned' && styles.pinnedMenuChip,
            variant === 'pinned' && isMobileWeb && styles.pinnedMenuChipMobile,
            selected && styles.menuChipActive,
          ]}
          onPress={() => handleMenuSelection(menu.key, label)}
          accessibilityRole="tab"
          accessibilityLabel={label}
          accessibilityState={{ selected }}>
          <View style={[styles.menuIconBadge, isMobileWeb && styles.menuIconBadgeMobile, selected && styles.menuIconBadgeActive]}>
            <PassengerMenuIcon symbol={menu.symbol} selected={selected} />
          </View>
          <Text
            style={[styles.menuChipText, isMobileWeb && styles.menuChipTextMobile, selected && styles.menuChipTextActive]}
            numberOfLines={1}>
            {label}
          </Text>
        </TouchableOpacity>
      );
    },
    [activePassengerMenu, getMenuLabel, handleMenuSelection, isMobileWeb],
  );

  const openRideEmergencyPanel = useCallback(() => {
    const label = t.emergencyDuringRide || 'Emergency during this ride';
    handleMenuSelection('emergency', label);
    setMessage(t.openingEmergencyContactsForRide || 'Opening emergency contacts for this ride.');
  }, [handleMenuSelection, t]);

  const activateRideSos = useCallback(async () => {
    if (!activeBooking?.id) {
      setError('SOS is available once an active ride is loaded.');
      return;
    }
    setError('');
    setMessage('Activating SOS...');
    triggerA11yFeedback('Activating SOS');
    const response = await keralaSafety.activateSos(
      'Passenger SOS from active ride screen',
      'active_ride_quick_access',
    );
    if (response) {
      const police = response?.kerala_emergency_numbers?.police || '112';
      setMessage(`SOS activated. Emergency escalation started. Police: ${police}`);
      triggerA11yFeedback('SOS activated. Emergency escalation started.');
    } else {
      setError('Could not activate SOS. Try Safety panel or call emergency number 112.');
    }
  }, [activeBooking?.id, keralaSafety, triggerA11yFeedback]);

  const confirmRideSos = useCallback(() => {
    Alert.alert(
      'Activate SOS?',
      'This will start emergency escalation for this ride and share your latest location if available.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Activate SOS', style: 'destructive', onPress: activateRideSos },
      ],
    );
  }, [activateRideSos]);

  const handleUseSavedPlace = useCallback(
    async (place) => {
      const latitude = Number(place?.latitude);
      const longitude = Number(place?.longitude);
      let resolvedLocation = null;

      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        resolvedLocation = {
          latitude: Number(latitude.toFixed(6)),
          longitude: Number(longitude.toFixed(6)),
          address: String(place?.address || place?.name || '').trim() || 'Saved place',
        };
      } else if (placesConfigured && String(place?.address || '').trim()) {
        const suggestions = await searchPlaces(String(place.address).trim(), searchBias).catch(() => []);
        const bestSuggestion = Array.isArray(suggestions) ? suggestions[0] : null;
        if (bestSuggestion?.placeId) {
          resolvedLocation = await getPlaceLocation(bestSuggestion.placeId).catch(() => null);
        }
      }

      if (!resolvedLocation) {
        setError('This saved place is missing map coordinates. Edit it with a valid location.');
        return;
      }

      const targetPoint = pickupLocation ? 'dropoff' : 'pickup';
      setLocationForPoint(targetPoint, resolvedLocation);
      setActivePassengerMenu(PRIMARY_PASSENGER_MENU_KEY);
      setMessage(targetPoint === 'pickup' ? t.pickupSelectedChooseDrop : t.dropSelected);
    },
    [pickupLocation, placesConfigured, searchBias, t.dropSelected, t.pickupSelectedChooseDrop],
  );

  
  const handleSearchTextChange = async (point, text) => {
    setError('');
    const normalized = text || '';
    if (point === 'pickup') {
      setPickupQuery(normalized);
      setLocationValidation((prev) => ({ ...prev, pickup: false }));
      if (pickupLocation && normalized.trim() !== String(pickupLocation.address || '').trim()) {
        setPickupLocation(null);
        setFare(null);
        setNearbyDrivers([]);
        setOptedOutDriverIds([]);
        setSelectedDriverId('');
        driverDiscoveryRequestRef.current = { signature: '', request: null, completedAt: 0 };
        driverDiscoveryCooldownUntilRef.current = 0;
      }
    } else {
      setDropoffQuery(normalized);
      setLocationValidation((prev) => ({ ...prev, dropoff: false }));
      if (dropoffLocation && normalized.trim() !== String(dropoffLocation.address || '').trim()) {
        setDropoffLocation(null);
        setFare(null);
        setNearbyDrivers([]);
        setOptedOutDriverIds([]);
        setSelectedDriverId('');
        driverDiscoveryRequestRef.current = { signature: '', request: null, completedAt: 0 };
        driverDiscoveryCooldownUntilRef.current = 0;
      }
    }

    if (normalized.trim().length < 3) {
      if (point === 'pickup') {
        setPickupSuggestions([]);
      } else {
        setDropoffSuggestions([]);
      }
      return;
    }

    if (!placesConfigured) {
      setError(t.googlePlacesMissing);
      return;
    }

    const requestRef = point === 'pickup' ? pickupSearchRequestRef : dropSearchRequestRef;
    const setSearching = point === 'pickup' ? setSearchingPickup : setSearchingDropoff;
    const setSuggestions = point === 'pickup' ? setPickupSuggestions : setDropoffSuggestions;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;

    try {
      setSearching(true);
      const suggestions = await searchPlaces(normalized, {
        latitude: Number(searchBias.latitude),
        longitude: Number(searchBias.longitude),
        countryCode: 'in',
      });
      if (requestRef.current !== requestId) {
        return;
      }
      setSuggestions(suggestions.slice(0, 5));
    } catch (err) {
      if (requestRef.current === requestId) {
        setSuggestions([]);
        setError(err.message || t.couldNotSearchLocations);
      }
    } finally {
      if (requestRef.current === requestId) {
        setSearching(false);
      }
    }
  };

  const handleSelectSuggestion = useCallback(async (point, suggestion) => {
    try {
      setError('');
      if (!placesConfigured) {
        setError(t.googlePlacesMissing);
        return;
      }
      if (point === 'pickup') {
        setSearchingPickup(true);
      } else {
        setSearchingDropoff(true);
      }

      const location = await getPlaceLocation(suggestion.placeId);
      setLocationForPoint(point, location);
      setMessage(point === 'pickup' ? t.pickupSelectedChooseDrop : t.dropSelected);
    } catch (err) {
      setError(err.message || t.couldNotSelectPlace);
    } finally {
      if (point === 'pickup') {
        setSearchingPickup(false);
      } else {
        setSearchingDropoff(false);
      }
    }
  }, [getPlaceLocation, placesConfigured, t]);

  // Interactive map handlers - match native implementation for feature parity
  const handleMapPress = useCallback((coordinate) => {
    setError('');
    
    const nextLocation = {
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      address: `Lat ${coordinate.latitude.toFixed(4)}, Lng ${coordinate.longitude.toFixed(4)}`,
    };

    if (selectingPoint === 'pickup') {
      setLocationForPoint('pickup', nextLocation);
      setSelectingPoint('dropoff');
      setMessage(t.pickupSelected || 'Pickup selected. Now select dropoff.');
      resolveAddressForPoint('pickup', coordinate).catch(() => null);
      return;
    }

    if (selectingPoint === 'dropoff') {
      setLocationForPoint('dropoff', nextLocation);
      setSelectingPoint('pickup');
      setMessage(t.dropSelected || 'Drop selected.');
      resolveAddressForPoint('dropoff', coordinate).catch(() => null);
      return;
    }
  }, [resolveAddressForPoint, selectingPoint, t]);

  const handleMarkerDragEnd = useCallback((markerKey, coordinate) => {
    const nextLocation = {
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      address: `Lat ${coordinate.latitude.toFixed(4)}, Lng ${coordinate.longitude.toFixed(4)}`,
    };
    
    setLocationForPoint(markerKey, nextLocation);
    setMessage(markerKey === 'pickup' ? 'Pickup moved' : 'Drop moved');
    resolveAddressForPoint(markerKey, coordinate).catch(() => null);
  }, [resolveAddressForPoint]);

  const autofillPickupFromCurrentLocation = useCallback(async ({ silent = false } = {}) => {
    if (!isWebGeolocationAvailable()) {
      setLocationPermissionState('unsupported');
      if (!silent) {
        setError(t.currentLocationNotSupported);
      }
      return;
    }

    try {
      setLocatingPickup(true);
      setError('');
      const beforePermission = await getWebGeolocationPermissionState();
      setLocationPermissionState(beforePermission);

      const position = await requestWebCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      });
      setLocationPermissionState('granted');

      const latitude = Number(position.coords.latitude.toFixed(6));
      const longitude = Number(position.coords.longitude.toFixed(6));
      let address = `Lat ${latitude}, Lng ${longitude}`;

      if (placesConfigured) {
        try {
          const resolved = await reverseGeocodeLocation(latitude, longitude);
          if (resolved) {
            address = resolved;
          }
        } catch {
          // Keep coordinate fallback.
        }
      }

      const location = { latitude, longitude, address };
      setLocationForPoint('pickup', location);
      if (!silent) {
        setMessage(t.pickupAutofilled);
      }
    } catch (err) {
      const nextPermission = await getWebGeolocationPermissionState();
      setLocationPermissionState(nextPermission === 'prompt' && Number(err?.code) === 1 ? 'denied' : nextPermission);
      if (!silent) {
        setError(formatWebGeolocationError(err, t.couldNotFetchCurrentLocation));
      } else if (Number(err?.code) === 1) {
        setError(formatWebGeolocationError(err, t.couldNotFetchCurrentLocation));
      }
    } finally {
      setLocatingPickup(false);
    }
  }, [placesConfigured, t]);

  const requestActiveBooking = useCallback(() => {
    const tokenKey = String(token || '');
    const currentRequest = activeBookingRequestRef.current;
    if (currentRequest?.request && currentRequest.token === tokenKey) {
      return currentRequest.request;
    }

    const request = apiRequest('/bookings/active', { token }).finally(() => {
      if (activeBookingRequestRef.current?.request === request) {
        activeBookingRequestRef.current = { token: null, request: null };
      }
    });
    activeBookingRequestRef.current = { token: tokenKey, request };
    return request;
  }, [token]);

  const refreshActiveBooking = async () => {
    const booking = await callApi(
      () => requestActiveBooking(),
      t.activeRideStatusRefreshed,
    );
    setActiveBooking(booking || null);
  };

  const applyDriverRelationshipState = useCallback((favorites, blocked) => {
    const favoriteIds = getFavoriteDriverIds(favorites);
    const blockedIds = Array.isArray(blocked?.driver_ids) ? blocked.driver_ids : [];
    setFavoriteDriverIds(favoriteIds.filter((driverId) => !blockedIds.includes(driverId)));
    setBlockedDriverIds(blockedIds);
  }, []);

  const handleFavoriteDriversChange = useCallback((favorites) => {
    const favoriteIds = getFavoriteDriverIds(favorites);
    setFavoriteDriverIds(favoriteIds.filter((driverId) => !blockedDriverIds.includes(driverId)));
  }, [blockedDriverIds]);

  const refreshPassengerBookings = useCallback(async ({ silent = false } = {}) => {
    try {
      setError(''); // Clear any previous errors
      const [bookings, favorites, blocked] = await Promise.all([
        apiRequest('/bookings', { token, query: { limit: historyPageSize, skip: 0 } }),
        apiRequest('/passengers/favorite-drivers', { token }).catch(() => []),
        apiRequest('/passengers/blocked-drivers', { token }).catch(() => ({ driver_ids: [] })),
      ]);
      applyDriverRelationshipState(favorites, blocked);
      setPassengerBookings(Array.isArray(bookings) ? bookings : []);
      setHistoryPaginationOffset(0);
      setHistoryHasMore((Array.isArray(bookings) ? bookings.length : 0) >= historyPageSize);
      if (!silent) {
        setMessage(t.bookingListRefreshed);
      }
      return bookings;
    } catch (err) {
      const errorMsg = err.message || t.couldNotLoadBookingList;
      if (!silent) {
        setError(errorMsg);
      }
      setPassengerBookings([]);
      return [];
    }
  }, [applyDriverRelationshipState, historyPageSize, t, token]);
  useEffect(() => {
    refreshPassengerBookingsRef.current = refreshPassengerBookings;
  }, [refreshPassengerBookings]);

  const loadMoreHistory = async () => {
    try {
      setError(''); // Clear any previous errors
      const nextOffset = historyPaginationOffset + historyPageSize;
      const newBookings = await apiRequest('/bookings', { token, query: { limit: historyPageSize, skip: nextOffset } });
      const allBookings = [...passengerBookings, ...(Array.isArray(newBookings) ? newBookings : [])];
      setPassengerBookings(allBookings);
      setHistoryPaginationOffset(nextOffset);
      setHistoryHasMore((Array.isArray(newBookings) ? newBookings.length : 0) >= historyPageSize);
      setMessage('More rides loaded');
    } catch (err) {
      const errorMsg = 'Could not load more rides: ' + err.message;
      setError(errorMsg);
    }
  };

  const refreshRideProductAvailability = useCallback(
    async ({ silent = false, addressOverride = null } = {}) => {
      const pickupAddress = String(addressOverride || pickupLocation?.address || '').trim() || undefined;
      try {
        if (!silent) {
          setRideProductsLoading(true);
        }
        const availability = await apiRequest('/ride-products/availability', {
          query: {
            pickup_address: pickupAddress,
          },
        });
        if (availability && Array.isArray(availability.enabled_products)) {
          const enabledProducts = availability.enabled_products.length > 0 ? availability.enabled_products : ['normal'];
          setRideProductAvailability({
            enabled_products: enabledProducts,
            pickup_district: availability.pickup_district || null,
          });
          if (!enabledProducts.includes(effectiveRideProduct)) {
            setRideProduct('normal');
            if (!silent) {
              setMessage(t.selectedRideProductSwitched);
            }
          }
        }
      } catch (err) {
        if (!silent) {
          setError(err.message || t.couldNotLoadRideProductSettings);
        }
      } finally {
        if (!silent) {
          setRideProductsLoading(false);
        }
      }
    },
    [effectiveRideProduct, pickupLocation?.address, t],
  );

  const refreshSpinWinStatus = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (!silent) {
          setSpinWinLoading(true);
        }
        const status = await apiRequest('/spin-win/config', { token });
        setSpinWinStatus(status || null);
        return status;
      } catch (err) {
        if (!silent) {
          setError(err.message || t.couldNotLoadSpinStatus);
        }
        return null;
      } finally {
        if (!silent) {
          setSpinWinLoading(false);
        }
      }
    },
    [t, token],
  );

  const spinNow = async () => {
    if (spinningNow) {
      return;
    }
    try {
      setSpinningNow(true);
      setError('');
      
      // If socket is available, emit spin request for real-time update
      if (socketRef.current && socketRef.current.connected) {
        socketRef.current.emit('request_spin', { token }, (result) => {
          const rewardLabel = String(result?.reward?.label || t.rewardFallback);
          const remaining = Number(result?.spins_left_today ?? 0);
          setMessage(`${t.spinComplete}: ${rewardLabel}. ${t.spinsLeftToday}: ${remaining}.`);
          refreshSpinWinStatus({ silent: true });
          setSpinningNow(false);
        });
        // Set timeout fallback in case socket doesn't respond
        setTimeout(() => {
          if (spinningNow) {
            setSpinningNow(false);
            refreshSpinWinStatus({ silent: false });
          }
        }, 5000);
      } else {
        // Fallback to REST API
        const result = await apiRequest('/spin-win/spin', { method: 'POST', token });
        const rewardLabel = String(result?.reward?.label || t.rewardFallback);
        const remaining = Number(result?.spins_left_today ?? 0);
        setMessage(`${t.spinComplete}: ${rewardLabel}. ${t.spinsLeftToday}: ${remaining}.`);
        await refreshSpinWinStatus({ silent: true });
        setSpinningNow(false);
      }
    } catch (err) {
      setError(err.message || t.spinFailedRetry);
      setSpinningNow(false);
    }
  };

  useEffect(() => {
    let unmounted = false;

    const refreshSilently = async () => {
      if (unmounted || passengerPollInFlightRef.current) {
        return;
      }
      if (!isPageVisible()) {
        return;
      }
      if (Date.now() < passengerPollCooldownUntilRef.current) {
        return;
      }

      passengerPollInFlightRef.current = true;
      passengerPollCycleRef.current += 1;
      const cycle = passengerPollCycleRef.current;
      const includeBookings = activePassengerMenu === 'history' || cycle % 3 === 0;
      const includeSpinStatus = activePassengerMenu === 'spin' || cycle % 6 === 0;
      const includeAvailability = activePassengerMenu === 'ride' || cycle % 4 === 0;
      let backedOff = false;

      const applyPassengerPollBackoff = (err) => {
        const cooldownMs = getPassengerPollBackoffMs(err);
        if (cooldownMs > 0) {
          backedOff = true;
          setPassengerPollCooldown(passengerPollCooldownUntilRef, cooldownMs);
          const now = Date.now();
          if (!unmounted && now - passengerPollNoticeAtRef.current > 15000) {
            setMessage(getPassengerSyncDelayMessage(err));
            passengerPollNoticeAtRef.current = now;
          }
        }
      };

      const quietPollRequest = (promise, fallback = PASSENGER_POLL_UNCHANGED) =>
        promise.catch((err) => {
          applyPassengerPollBackoff(err);
          return fallback;
        });

      try {
        const [active, bookings, spinStatus, availability] = await Promise.all([
          quietPollRequest(requestActiveBooking()),
          includeBookings ? quietPollRequest(apiRequest('/bookings', { token })) : Promise.resolve(null),
          includeSpinStatus ? quietPollRequest(apiRequest('/spin-win/config', { token })) : Promise.resolve(null),
          includeAvailability
            ? quietPollRequest(
                apiRequest('/ride-products/availability', {
                  query: { pickup_address: String(pickupLocation?.address || '').trim() || undefined },
                }),
              )
            : Promise.resolve(null),
        ]);
        if (unmounted) {
          return;
        }
        if (active !== PASSENGER_POLL_UNCHANGED) {
          setActiveBooking(active || null);
        }
        if (includeBookings && bookings !== PASSENGER_POLL_UNCHANGED) {
          setPassengerBookings(Array.isArray(bookings) ? bookings : []);
        }
        if (includeSpinStatus && spinStatus !== PASSENGER_POLL_UNCHANGED) {
          setSpinWinStatus(spinStatus || null);
        }
        if (
          availability !== PASSENGER_POLL_UNCHANGED &&
          availability &&
          Array.isArray(availability.enabled_products)
        ) {
          setRideProductAvailability({
            enabled_products: availability.enabled_products.length > 0 ? availability.enabled_products : ['normal'],
            pickup_district: availability.pickup_district || null,
          });
        }
        if (!backedOff) {
          passengerPollCooldownUntilRef.current = 0;
        }
      } catch (err) {
        applyPassengerPollBackoff(err);
      } finally {
        passengerPollInFlightRef.current = false;
      }
    };

    refreshSilently();
    const timer = setInterval(refreshSilently, PASSENGER_POLL_INTERVAL_MS);
    return () => {
      unmounted = true;
      clearInterval(timer);
    };
  }, [activePassengerMenu, isPageVisible, pickupLocation?.address, requestActiveBooking, token]);

  useEffect(() => {
    if (autoPickupInitializedRef.current || pickupLocation) {
      return;
    }
    autoPickupInitializedRef.current = true;
    autofillPickupFromCurrentLocation({ silent: true }).catch(() => null);
  }, [autofillPickupFromCurrentLocation, pickupLocation]);

  useEffect(() => {
    if (!token || !activeBooking?.id) {
      return undefined;
    }

    const socket = createAutoBuddySocket(token);
    socketRef.current = socket;
    const bookingId = String(activeBooking.id);
    const applyBookingPatch = (patch) => {
      if (!patch || typeof patch !== 'object') {
        return;
      }
      setActiveBooking((prev) => {
        if (!prev || String(prev.id || '') !== bookingId) {
          return prev;
        }
        return { ...prev, ...patch };
      });
    };
    const applyRealtimePatch = (patch) => {
      setRideRealtime((prev) => {
        const sameBooking = prev.bookingId === bookingId;
        return {
          bookingId,
          status: sameBooking ? prev.status : null,
          etaToPickup: sameBooking ? prev.etaToPickup : null,
          etaToDrop: sameBooking ? prev.etaToDrop : null,
          ...patch,
        };
      });
    };
    const normalizeDriverLocationPayload = (payload) => {
      const source = payload?.location || payload?.driver_live_location || payload?.driver_location || payload;
      const latitude = Number(source?.latitude ?? source?.lat);
      const longitude = Number(source?.longitude ?? source?.lng);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
      }
      return {
        latitude: Number(latitude.toFixed(6)),
        longitude: Number(longitude.toFixed(6)),
        address:
          String(source?.address || '').trim() ||
          `Lat ${Number(latitude).toFixed(6)}, Lng ${Number(longitude).toFixed(6)}`,
      };
    };

    const handleDriverLocation = (payload) => {
      if (!payload || String(payload.booking_id || '') !== bookingId) {
        return;
      }
      const nextLocation = normalizeDriverLocationPayload(payload);
      if (!nextLocation) {
        return;
      }
      setActiveBooking((prev) => {
        if (!prev || String(prev.id || '') !== bookingId) {
          return prev;
        }
        if (CLOSED_BOOKING_STATUSES.has(normalizeBookingStatus(prev.status))) {
          return prev;
        }
        return {
          ...prev,
          driver_live_location: nextLocation,
          driver_location: nextLocation,
        };
      });
      applyRealtimePatch({
        etaToPickup: payload.eta_to_pickup_min ?? null,
        etaToDrop: payload.eta_to_drop_min ?? null,
      });
    };
    const handleBookingStatusChanged = (payload) => {
      if (!payload || String(payload.booking_id || '') !== bookingId) {
        return;
      }
      const nextStatus = normalizeBookingStatus(payload.status);
      applyRealtimePatch({
        status: nextStatus || payload.status || null,
      });
      const nextPatch = {
        status: nextStatus || payload.status,
      };
      if (CLOSED_BOOKING_STATUSES.has(nextStatus)) {
        nextPatch.driver_live_location = null;
        nextPatch.driver_location = null;
      }
      applyBookingPatch(nextPatch);
    };
    const handleRideStateSync = (payload) => {
      if (!payload || String(payload.booking_id || '') !== bookingId) {
        return;
      }
      const nextPatch = {};
      const nextStatus = normalizeBookingStatus(payload.status);
      if (nextStatus) {
        nextPatch.status = nextStatus;
      }
      if (CLOSED_BOOKING_STATUSES.has(nextStatus)) {
        nextPatch.driver_live_location = null;
        nextPatch.driver_location = null;
      }
      applyRealtimePatch({
        status: nextStatus || payload.status || null,
        etaToPickup: payload.eta_to_pickup_min ?? null,
        etaToDrop: payload.eta_to_drop_min ?? null,
      });
      if (payload.driver_live_location || payload.driver_location) {
        const nextLocation = normalizeDriverLocationPayload(payload);
        if (nextLocation && !CLOSED_BOOKING_STATUSES.has(nextStatus)) {
          nextPatch.driver_live_location = nextLocation;
          nextPatch.driver_location = nextLocation;
        }
      }
      if (payload.ride_start_otp) {
        nextPatch.ride_start_otp = payload.ride_start_otp;
      }
      if (payload.ride_end_otp) {
        nextPatch.ride_end_otp = payload.ride_end_otp;
      }
      applyBookingPatch(nextPatch);
    };

    const joinBookingRoom = () => {
      socket.emit('join_booking', { booking_id: bookingId });
      socket.emit('request_ride_sync', { booking_id: bookingId });
    };

    const handleBookingCompleted = async (data) => {
      // Auto-refresh history when a booking completes
      await refreshPassengerBookingsRef.current?.({ silent: true });
    };

    socket.on('connect', joinBookingRoom);
    socket.on('driver_location_changed', handleDriverLocation);
    socket.on('driver_location', handleDriverLocation);
    socket.on('driver_location_updated', handleDriverLocation);
    socket.on('booking_status_changed', handleBookingStatusChanged);
    socket.on('ride_state_sync', handleRideStateSync);
    socket.on('booking_completed', handleBookingCompleted);
    const handleHazardAlert = (data) => {
      try {
        addNotification?.({
          ...data,
          type: 'safety',
          title: data?.title || 'Road Hazard Alert',
          body: data?.body || data?.message || 'A road hazard has been reported nearby.',
          timestamp: data?.timestamp || data?.created_at || new Date().toISOString(),
          read: false,
          data,
        });

        if (typeof Notification !== 'undefined') {
          if (Notification.permission === 'granted') {
            try {
              void new Notification(data?.title || 'Road Hazard Alert', { body: data?.body || data?.message || '' });
            } catch (e) {
              // ignore
            }
          } else if (Notification.permission === 'default') {
            Notification.requestPermission().catch(() => null);
          }
        }
        // Add hazard marker to local map state and auto-center
        try {
          const hazard = data?.data?.hazard || data?.hazard || data?.data || data;
          if (hazard) {
            const h = {
              id: hazard.id || data.id || `${hazard.latitude}_${hazard.longitude}`,
              latitude: hazard.latitude || hazard.lat,
              longitude: hazard.longitude || hazard.longitude || hazard.lng,
              severity: hazard.severity ?? data?.severity ?? 1,
              title: data?.title,
              body: data?.body,
              type: hazard.type || data?.type,
            };
            setHazardMarkers((prev) => [h, ...prev].slice(0, 20));
            setAutoCenterHazardId(h.id);
            setTimeout(() => setAutoCenterHazardId(null), 4000);
          }
        } catch (e) {
          // ignore
        }
      } catch (e) {
        console.warn('Failed to handle hazard_alert:', e);
      }
    };
    socket.on('hazard_alert', handleHazardAlert);
    if (socket.connected) {
      joinBookingRoom();
    }

    return () => {
      socket.off('connect', joinBookingRoom);
      socket.off('driver_location_changed', handleDriverLocation);
      socket.off('driver_location', handleDriverLocation);
      socket.off('driver_location_updated', handleDriverLocation);
      socket.off('booking_status_changed', handleBookingStatusChanged);
      socket.off('ride_state_sync', handleRideStateSync);
      socket.off('booking_completed', handleBookingCompleted);
      socket.off('hazard_alert', handleHazardAlert);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [activeBooking?.id, normalizeBookingStatus, token]);

  useEffect(() => {
    const bookingId = activeBooking?.id || null;
    const status = String(activeBooking?.status || '').toLowerCase() || null;
    if (!bookingId || !status) {
      bookingStatusRef.current = { bookingId: null, status: null };
      return;
    }

    if (bookingStatusRef.current.bookingId !== bookingId) {
      bookingStatusRef.current = { bookingId, status };
      return;
    }

    if (bookingStatusRef.current.status === status) {
      return;
    }
    bookingStatusRef.current = { bookingId, status };

    // Comprehensive booking state notifications for all statuses
    const bookingStateMessages = {
      pending: { titleKey: 'bookingPendingTitle', bodyKey: 'bookingPendingBody' },
      searching: { titleKey: 'searchingForDriverTitle', bodyKey: 'searchingForDriverBody' },
      accepted: { titleKey: 'driverFoundTitle', bodyKey: 'driverFoundBody' },
      driver_arrived: { titleKey: 'driverArrivedTitle', bodyKey: 'driverArrivedBody' },
      in_progress: { titleKey: 'tripStartedTitle', bodyKey: 'tripStartedBody' },
      completed: { titleKey: 'tripCompletedTitle', bodyKey: 'tripCompletedBody' },
      cancelled: { titleKey: 'bookingCancelledTitle', bodyKey: 'bookingCancelledBody' },
      rejected: { titleKey: 'bookingRejectedTitle', bodyKey: 'bookingRejectedBody' },
      no_driver_found: { titleKey: 'noDriverFoundTitle', bodyKey: 'noDriverFoundBody' },
      booking_failed: { titleKey: 'bookingFailedTitle', bodyKey: 'bookingFailedBody' },
      waiting_for_payment: { titleKey: 'waitingForPaymentTitle', bodyKey: 'waitingForPaymentBody' },
      rating_pending: { titleKey: 'ratingPendingTitle', bodyKey: 'ratingPendingBody' },
    };

    const messageKeys = bookingStateMessages[status];
    if (messageKeys && t[messageKeys.titleKey] && t[messageKeys.bodyKey]) {
      notifyWithVoice(t[messageKeys.titleKey], t[messageKeys.bodyKey]);
    }
  }, [activeBooking?.id, activeBooking?.status, notifyWithVoice, t]);

  const confirmCreateParallelBooking = () => {
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
      return Promise.resolve(true);
    }
    return Promise.resolve(window.confirm(t.confirmParallelBooking));
  };

  const applyNearbyDrivers = useCallback((drivers, favorites, blocked) => {
    const favoriteIds = getFavoriteDriverIds(favorites);
    setFavoriteDriverIds(favoriteIds);
    const blockedIds = Array.isArray(blocked?.driver_ids) ? blocked.driver_ids : [];
    setBlockedDriverIds(blockedIds);

    const nearbyList = (Array.isArray(drivers) ? drivers : []).map((driver) => ({
      ...driver,
      is_favorite: favoriteIds.includes(driver.driver_id),
      source: 'nearby',
    })).filter((driver) => !blockedIds.includes(driver.driver_id));
    const merged = nearbyList.slice(0, 5);
    setNearbyDrivers(merged);
    setSelectedDriverId((prev) =>
      prev && !merged.some((item) => item.driver_id === prev)
        ? ''
        : prev,
    );
    return merged;
  }, []);

  const resolveNearbyDriverLookupLocation = useCallback(async () => {
    const routeLocation = normalizeLocation(pickupLocation || selectedPickupLocation);
    if (routeLocation) {
      return routeLocation;
    }
    if (!isWebGeolocationAvailable()) {
      setLocationPermissionState('unsupported');
      return null;
    }

    try {
      setLocatingPickup(true);
      setError('');
      const beforePermission = await getWebGeolocationPermissionState();
      setLocationPermissionState(beforePermission);
      const position = await requestWebCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 60000,
      });
      setLocationPermissionState('granted');
      const latitude = Number(position.coords.latitude.toFixed(6));
      const longitude = Number(position.coords.longitude.toFixed(6));
      return { latitude, longitude, address: `Lat ${latitude}, Lng ${longitude}` };
    } catch (err) {
      const nextPermission = await getWebGeolocationPermissionState();
      setLocationPermissionState(nextPermission === 'prompt' && Number(err?.code) === 1 ? 'denied' : nextPermission);
      return null;
    } finally {
      setLocatingPickup(false);
    }
  }, [normalizeLocation, pickupLocation, selectedPickupLocation]);

  const refreshNearbyDriversForMenu = useCallback(async ({ silent = false } = {}) => {
    const lookupLocation = await resolveNearbyDriverLookupLocation();
    if (!lookupLocation) {
      setNearbyDrivers([]);
      setSelectedDriverId('');
      if (!silent) {
        setError(t.couldNotFetchCurrentLocation || 'Select pickup or allow current location to find nearby drivers.');
      }
      return null;
    }

    setAutoFetchingTripData(true);
    try {
      const vehicleSubtypeId = resolveEffectiveVehicleModelId();
      const query = {
        latitude: lookupLocation.latitude,
        longitude: lookupLocation.longitude,
        radius_km: 2,
        vehicle_type_id: effectiveSelectedVehicleTypeId || undefined,
        vehicle_subtype_id: vehicleSubtypeId || undefined,
        ride_type: effectiveRideProduct || undefined,
      };
      if (dropoffLocation) {
        query.drop_latitude = dropoffLocation.latitude;
        query.drop_longitude = dropoffLocation.longitude;
      }

      const [drivers, favorites, blocked] = await Promise.all([
        apiRequest('/drivers/nearby', { token, query }),
        apiRequest('/passengers/favorite-drivers', {
          token,
          query: {
            latitude: lookupLocation.latitude,
            longitude: lookupLocation.longitude,
            include_availability: true,
          },
        }).catch(() => []),
        apiRequest('/passengers/blocked-drivers', { token }).catch(() => ({ driver_ids: [] })),
      ]);
      const merged = applyNearbyDrivers(drivers, favorites, blocked);
      if (!silent) {
        setMessage(merged.length > 0 ? `${merged.length} drivers found within 2 km.` : 'No drivers within 2 km right now.');
      }
      return merged;
    } catch (err) {
      if (!silent) {
        setError(err.message || t.couldNotAutoCalculate);
      }
      return null;
    } finally {
      setAutoFetchingTripData(false);
    }
  }, [
    applyNearbyDrivers,
    dropoffLocation,
    effectiveRideProduct,
    effectiveSelectedVehicleTypeId,
    resolveEffectiveVehicleModelId,
    resolveNearbyDriverLookupLocation,
    t.couldNotAutoCalculate,
    t.couldNotFetchCurrentLocation,
    token,
  ]);

  const refreshDriverDiscovery = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!pickupLocation || !dropoffLocation) {
      setFare(null);
      setNearbyDrivers([]);
      setSelectedDriverId('');
      driverDiscoveryRequestRef.current = { signature: '', request: null, completedAt: 0 };
      return;
    }

    const vehicleSubtypeId = resolveEffectiveVehicleModelId();
    const signature = [
      getDiscoveryLocationSignature(pickupLocation),
      getDiscoveryLocationSignature(dropoffLocation),
      effectiveSelectedVehicleTypeId || 'auto',
      vehicleSubtypeId || 'model',
      effectiveRideProduct || 'normal',
    ].join('|');
    const now = Date.now();
    const currentRequest = driverDiscoveryRequestRef.current;

    if (!force && currentRequest.request && currentRequest.signature === signature) {
      return currentRequest.request;
    }
    if (!force && driverDiscoveryCooldownUntilRef.current > now) {
      if (!silent && now - passengerPollNoticeAtRef.current > 15000) {
        setMessage('Server is busy. Fare and driver search will retry shortly.');
        passengerPollNoticeAtRef.current = now;
      }
      return null;
    }
    if (
      !force &&
      currentRequest.signature === signature &&
      currentRequest.completedAt > 0 &&
      now - currentRequest.completedAt < DRIVER_DISCOVERY_DEDUPE_MS
    ) {
      return null;
    }

    let request = null;
    request = (async () => {
      const previousCompletedAt = currentRequest.completedAt;
      setAutoFetchingTripData(true);
      try {
        const [estimate, drivers, favorites, blocked] = await Promise.all([
          apiRequest('/fare/estimate', {
            method: 'POST',
            body: {
              pickup_location: pickupLocation,
              drop_location: dropoffLocation,
              vehicle_type_id: effectiveSelectedVehicleTypeId || undefined,
              vehicle_subtype_id: vehicleSubtypeId || undefined,
              ride_type: effectiveRideProduct || undefined,
            },
          }),
          apiRequest('/drivers/nearby', {
            token,
            query: {
              latitude: pickupLocation.latitude,
              longitude: pickupLocation.longitude,
              drop_latitude: dropoffLocation.latitude,
              drop_longitude: dropoffLocation.longitude,
              radius_km: 2,
              vehicle_type_id: effectiveSelectedVehicleTypeId || undefined,
              vehicle_subtype_id: vehicleSubtypeId || undefined,
              ride_type: effectiveRideProduct || undefined,
            },
          }),
          apiRequest('/passengers/favorite-drivers', {
            token,
            query: {
              latitude: pickupLocation.latitude,
              longitude: pickupLocation.longitude,
              include_availability: true,
            },
          }).catch(() => []),
          apiRequest('/passengers/blocked-drivers', { token }).catch(() => ({ driver_ids: [] })),
        ]);
        const normalizedEstimate = Array.isArray(estimate) ? (estimate[0] || null) : estimate || null;
        setFare(normalizedEstimate);
        const merged = applyNearbyDrivers(drivers, favorites, blocked);
        driverDiscoveryCooldownUntilRef.current = 0;
        driverDiscoveryRequestRef.current = { signature, request: null, completedAt: Date.now() };
        return merged;
      } catch (err) {
        const cooldownMs = getDriverDiscoveryBackoffMs(err);
        if (cooldownMs > 0) {
          driverDiscoveryCooldownUntilRef.current = Date.now() + cooldownMs;
          setPassengerPollCooldown(passengerPollCooldownUntilRef, cooldownMs);
          if (!silent) {
            setMessage('Server is busy. Fare and driver search will retry shortly.');
          }
          return null;
        }
        if (!silent) {
          setError(err.message || t.couldNotAutoCalculate);
        }
        return null;
      } finally {
        if (driverDiscoveryRequestRef.current.request === request) {
          driverDiscoveryRequestRef.current = { signature, request: null, completedAt: previousCompletedAt };
        }
        setAutoFetchingTripData(false);
      }
    })();

    driverDiscoveryRequestRef.current = {
      signature,
      request,
      completedAt: currentRequest.completedAt,
    };
    return request;
  }, [
    applyNearbyDrivers,
    dropoffLocation,
    effectiveRideProduct,
    effectiveSelectedVehicleTypeId,
    pickupLocation,
    resolveEffectiveVehicleModelId,
    t.couldNotAutoCalculate,
    token,
  ]);

  useEffect(() => {
    if (!pickupLocation || !dropoffLocation) {
      return undefined;
    }
    const timer = setTimeout(() => {
      refreshDriverDiscovery({ silent: false }).catch(() => null);
    }, 450);
    return () => {
      clearTimeout(timer);
    };
  }, [dropoffLocation, pickupLocation, refreshDriverDiscovery, effectiveSelectedVehicleTypeId, effectiveRideProduct]);

  useEffect(() => {
    if (activePassengerMenu !== 'drivers') {
      return undefined;
    }
    const timer = setTimeout(() => {
      if (pickupLocation && dropoffLocation) {
        refreshDriverDiscovery({ silent: true, force: true }).catch(() => null);
      } else {
        refreshNearbyDriversForMenu({ silent: false }).catch(() => null);
      }
    }, 150);
    return () => {
      clearTimeout(timer);
    };
  }, [
    activePassengerMenu,
    dropoffLocation,
    pickupLocation,
    refreshDriverDiscovery,
    refreshNearbyDriversForMenu,
  ]);

  useEffect(() => {
    if (selectedDriverId && !visibleDrivers.some((item) => item.driver_id === selectedDriverId)) {
      // Defer state update to avoid synchronous setState inside effect
      setTimeout(() => setSelectedDriverId(''), 0);
    }
  }, [selectedDriverId, visibleDrivers]);

  const optOutDriver = (driverId) => {
    setOptedOutDriverIds((prev) => {
      if (prev.includes(driverId)) {
        return prev;
      }
      return [...prev, driverId];
    });
    if (selectedDriverId === driverId) {
      setSelectedDriverId('');
    }
  };

  const resetDriverOptOuts = () => {
    setOptedOutDriverIds([]);
  };

  const toggleFavoriteDriver = async (driverId, isFavorite) => {
    const done = await callApi(
      () =>
        apiRequest(`/passengers/favorite-drivers/${driverId}`, {
          method: 'PUT',
          token,
          body: { is_favorite: !isFavorite },
        }),
      isFavorite ? t.removedFavoriteDriver : t.driverMarkedFavorite,
    );
    if (done) {
      setFavoriteDriverIds((prev) => (
        isFavorite
          ? prev.filter((item) => item !== driverId)
          : prev.includes(driverId) ? prev : [...prev, driverId]
      ));
      if (pickupLocation && dropoffLocation) {
        await refreshDriverDiscovery({ silent: true, force: true });
      } else if (activePassengerMenu === 'drivers') {
        await refreshNearbyDriversForMenu({ silent: true });
      }
    }
  };

  const toggleBlockedDriver = async (driverId, isBlocked) => {
    const done = await callApi(
      () =>
        apiRequest(`/passengers/blocked-drivers/${driverId}`, {
          method: 'PUT',
          token,
          body: { is_blocked: !isBlocked },
        }),
      isBlocked ? t.driverUnblocked : t.driverBlocked,
    );
    if (done) {
      setBlockedDriverIds((prev) => (
        isBlocked
          ? prev.filter((item) => item !== driverId)
          : prev.includes(driverId) ? prev : [...prev, driverId]
      ));
      if (!isBlocked) {
        setFavoriteDriverIds((prev) => prev.filter((item) => item !== driverId));
      }
      if (pickupLocation && dropoffLocation) {
        await refreshDriverDiscovery({ silent: true, force: true });
      } else if (activePassengerMenu === 'drivers') {
        await refreshNearbyDriversForMenu({ silent: true });
      }
    }
  };

  const createBooking = async () => {
    const locations = parseLocations();
    if (!locations) {
      return;
    }
    const isScheduledMode = effectiveRideProduct === 'scheduled';
    let scheduledForIso = undefined;
    if (isScheduledMode) {
      const scheduleValidation = validateScheduledPickup(
        scheduledAtInput,
        scheduledTimeZone,
        {
          required: t.selectPickupTimeScheduled,
          invalid: t.enterValidPickupDateTime,
          future: t.scheduledPickupFuture,
        },
      );
      if (!scheduleValidation.valid) {
        setError(scheduleValidation.message);
        return;
      }
      scheduledForIso = scheduleValidation.iso;
    }
    const bookingDriverGenderPreference = effectiveRideProduct === 'women_only'
      ? 'female'
      : isScheduledMode
        ? effectiveScheduledDriverGenderPreference
        : normalizeDriverGenderPreference(passengerPreferences?.driver_gender_preference);

    let existingActive = null;
    try {
      existingActive = await requestActiveBooking();
    } catch (err) {
      const cooldownMs = getPassengerPollBackoffMs(err);
      if (cooldownMs > 0) {
        setPassengerPollCooldown(passengerPollCooldownUntilRef, cooldownMs);
        setError(
          getPassengerSyncDelayMessage(
            err,
            t.couldNotConfirmActiveRide || 'Could not confirm active ride status. Please try again.',
          ),
        );
        return;
      }
    }
    let allowParallel = false;
    if (existingActive) {
      const shouldCreateAnother = await confirmCreateParallelBooking();
      if (!shouldCreateAnother) {
        setMessage(t.keepingExistingBooking);
        return;
      }
      allowParallel = true;
    }

    const passengerCount = Math.max(1, Math.min(6, Number(passengerCountInput || 1) || 1));
    const enabledRideProductSet = new Set(enabledRideProducts);
    if (!enabledRideProductSet.has(effectiveRideProduct)) {
      const districtLabel = rideProductAvailability?.pickup_district || t.thisDistrict;
      setError(`${t.selectedProductNotActiveIn} ${districtLabel}.`);
      return;
    }
    if (effectiveRideProduct === 'corporate' && !corporateCode.trim()) {
      setError(t.corporateCodeRequired);
      return;
    }
    if (effectiveRideProduct === 'airport' && (!flightNumber.trim() || !airportTerminal.trim())) {
      setError(t.airportFieldsRequired);
      return;
    }
    const rentalHours = Math.max(1, Math.min(12, Number(rentalHoursInput || 0) || 0));
    if (effectiveRideProduct === 'rental_hourly' && rentalHours <= 0) {
      setError(t.rentalHoursRequired);
      return;
    }
    const safeRidePassengerAgeValue = Number(String(safeRidePassengerAge || '').trim());
    const safeRidePassengerAgeNumber = Number.isFinite(safeRidePassengerAgeValue)
      ? Math.round(safeRidePassengerAgeValue)
      : 0;
    if (effectiveRideProduct === 'school_elderly_safe') {
      if (!safeRidePassengerName.trim() || !safeRideGuardianName.trim() || !safeRideGuardianPhone.trim()) {
        setError('Passenger name, guardian name, and guardian phone are required for School/Elderly rides.');
        return;
      }
      if (safeRidePassengerAgeNumber < 1 || safeRidePassengerAgeNumber > 120) {
        setError('Enter a valid passenger age for the assisted ride.');
        return;
      }
      if (safeRidePriority === 'school' && safeRidePassengerAgeNumber > 18) {
        setError('School assisted rides are for passengers 18 or younger.');
        return;
      }
      if (safeRidePriority === 'elderly' && safeRidePassengerAgeNumber < 55) {
        setError('Elderly assisted rides are for passengers 55 or older.');
        return;
      }
    }

    const intercityWaitHoursNumber = Number.parseInt(intercityWaitHoursInput, 10);
    const intercityWaitHours = Number.isFinite(intercityWaitHoursNumber)
      ? Math.max(0, Math.min(72, intercityWaitHoursNumber))
      : 0;
    const intercityRouteNotesValue = intercityRouteNotes.trim().slice(0, 240);
    const rideNotes = [];
    if (effectiveRideProduct === 'school_elderly_safe') {
      rideNotes.push(`Safe ride priority: ${safeRidePriority}`);
      rideNotes.push(`Assisted passenger: ${safeRidePassengerName.trim()} (${safeRidePassengerAgeNumber})`);
      rideNotes.push(`Guardian: ${safeRideGuardianName.trim()}`);
      if (safeRideWheelchairRequired) {
        rideNotes.push('Wheelchair required');
      }
      if (safeRideAssistanceRequired) {
        rideNotes.push('Door-to-door assistance required');
      }
      if (safeRideFemaleDriverPreferred) {
        rideNotes.push('Female driver preferred');
      }
      if (safeRideGuardianShareTracking) {
        rideNotes.push('Guardian live tracking enabled');
      }
      if (safeRideNotes.trim()) {
        rideNotes.push(`Care notes: ${safeRideNotes.trim()}`);
      }
    }
    if (effectiveRideProduct === 'corporate') {
      if (corporatePurpose.trim()) {
        rideNotes.push(`Corporate purpose: ${corporatePurpose.trim()}`);
      }
      if (corporateCostCenterId.trim()) {
        rideNotes.push(`Cost center: ${corporateCostCenterId.trim()}`);
      }
    }
    if (effectiveRideProduct === 'intercity') {
      rideNotes.push(intercityReturnTrip ? 'Intercity return trip requested' : 'One-way intercity ride');
      if (intercityWaitHours > 0) {
        rideNotes.push(`Outstation wait: ${intercityWaitHours}h`);
      }
      rideNotes.push(intercityTollsIncluded ? 'Tolls and parking included in estimate' : 'Tolls and parking paid separately');
      if (intercityRouteNotesValue) {
        rideNotes.push(`Route notes: ${intercityRouteNotesValue}`);
      }
    }
    if (effectiveRideProduct === 'women_only') {
      rideNotes.push(
        womenOnlyFemaleDriverRequired
          ? 'Women Only: female driver required'
          : 'Women Only: female driver first, trusted safety fallback allowed',
      );
      if (womenOnlyGuardianName.trim()) {
        rideNotes.push(`Women Only guardian: ${womenOnlyGuardianName.trim()}`);
      }
      if (womenOnlyShareGuardianTracking) {
        rideNotes.push('Women Only guardian live tracking enabled');
      }
    }
    if (appliedPromo?.code) {
      rideNotes.push(`Promo requested: ${appliedPromo.code}`);
    }
    const selectedDriverIdForPickup = visibleDrivers.some((driver) => driver.driver_id === selectedDriverId)
      ? selectedDriverId
      : '';
    const bookingVehicleSubtypeId = resolveEffectiveVehicleModelId();
    const bookingVehicleType =
      (availableVehicleTypes || []).find((type) => getVehicleTypeId(type) === effectiveSelectedVehicleTypeId) ||
      null;
    const bookingVehicleTypeName = getVehicleTypeName(
      bookingVehicleType || { vehicle_type_id: effectiveSelectedVehicleTypeId },
    );
    const bookingVehicleModel =
      getVehicleModelOptions(bookingVehicleType).find((model) => model.id === bookingVehicleSubtypeId) || null;
    const bookingVehicleModelName =
      bookingVehicleModel?.name ||
      (bookingVehicleSubtypeId ? titleFromId(bookingVehicleSubtypeId, `${bookingVehicleTypeName} Standard`) : undefined);

    const booking = await callApi(() =>
      apiRequest('/bookings/advanced', {
        method: 'POST',
        token,
        body: {
          pickup_location: locations.pickup,
          drop_location: {
            ...locations.dropoff,
          // compute drop distance robustly here (accept meters or km), fall back to existing location value
          distance_km: Number(
            fare?.distance_km ?? fare?.estimated_distance_km ?? (fare?.distance_m ? fare.distance_m / 1000 : undefined) ?? locations.dropoff?.distance_km ?? 0
          ),
          },
          payment_method: selectedPaymentMethod,
          payment_method_id: selectedPaymentMethodId || undefined,
          payment_channel: selectedPaymentChannel || undefined,
          promo_code: appliedPromo?.code || undefined,
          promo_discount_type: appliedPromo?.discount_type || undefined,
          promo_discount_value:
            Number.isFinite(Number(appliedPromo?.discount_value)) && Number(appliedPromo?.discount_value) > 0
              ? Number(appliedPromo.discount_value)
              : undefined,
          promo_max_discount:
            appliedPromo?.max_discount !== null &&
            appliedPromo?.max_discount !== undefined &&
            Number.isFinite(Number(appliedPromo.max_discount))
              ? Number(appliedPromo.max_discount)
              : undefined,
          ride_product: effectiveRideProduct,
          passenger_count: passengerCount,
          allow_parallel: allowParallel,
          selected_driver_id: selectedDriverIdForPickup || undefined,
          scheduled_for: scheduledForIso,
          corporate_code: effectiveRideProduct === 'corporate' ? corporateCode.trim() : undefined,
          corporate_purpose:
            effectiveRideProduct === 'corporate' && corporatePurpose.trim()
              ? corporatePurpose.trim()
              : undefined,
          corporate_cost_center_id:
            effectiveRideProduct === 'corporate' && corporateCostCenterId.trim()
              ? corporateCostCenterId.trim()
              : undefined,
          airport_terminal: effectiveRideProduct === 'airport' ? airportTerminal.trim() : undefined,
          flight_number: effectiveRideProduct === 'airport' ? flightNumber.trim() : undefined,
          intercity_return_trip: effectiveRideProduct === 'intercity' ? intercityReturnTrip : false,
          intercity_wait_hours: effectiveRideProduct === 'intercity' ? intercityWaitHours : undefined,
          intercity_tolls_included: effectiveRideProduct === 'intercity' ? intercityTollsIncluded : undefined,
          intercity_route_notes:
            effectiveRideProduct === 'intercity' && intercityRouteNotesValue ? intercityRouteNotesValue : undefined,
          tourism_package:
            effectiveRideProduct === 'tourism'
              ? selectedTourismPackage?.name || tourismPackage.trim()
              : undefined,
          tourism_package_id: effectiveRideProduct === 'tourism' ? selectedTourismPackage?.id : undefined,
          tourism_package_type: effectiveRideProduct === 'tourism' ? tourismPackageType : undefined,
          tourism_city: effectiveRideProduct === 'tourism' ? tourismCity : undefined,
          tourism_custom_stops:
            effectiveRideProduct === 'tourism' && tourismPackageType === 'custom' ? tourismCustomStopList : [],
          tourism_language_preference:
            effectiveRideProduct === 'tourism' ? tourismLanguagePreference : undefined,
          tourism_guide_required: effectiveRideProduct === 'tourism' ? tourismGuideRequired : false,
          tourism_photographer_required: effectiveRideProduct === 'tourism' ? tourismPhotographerRequired : false,
          tourism_boat_ride_required: effectiveRideProduct === 'tourism' ? tourismBoatRideRequired : false,
          tourism_hotel_booking_requested:
            effectiveRideProduct === 'tourism' ? tourismHotelBookingRequested : false,
          tourism_ticket_booking_requested:
            effectiveRideProduct === 'tourism' ? tourismTicketBookingRequested : false,
          women_only_required: effectiveRideProduct === 'women_only',
          passenger_gender: effectiveRideProduct === 'women_only' ? 'female' : undefined,
          women_only_female_driver_required:
            effectiveRideProduct === 'women_only' ? womenOnlyFemaleDriverRequired : undefined,
          women_only_allow_trusted_male_driver:
            effectiveRideProduct === 'women_only'
              ? !womenOnlyFemaleDriverRequired && womenOnlyAllowTrustedFallback
              : undefined,
          women_only_guardian_name:
            effectiveRideProduct === 'women_only' && womenOnlyGuardianName.trim()
              ? womenOnlyGuardianName.trim()
              : undefined,
          women_only_guardian_phone:
            effectiveRideProduct === 'women_only' && womenOnlyGuardianPhone.trim()
              ? womenOnlyGuardianPhone.trim()
              : undefined,
          women_only_share_guardian_tracking:
            effectiveRideProduct === 'women_only' ? womenOnlyShareGuardianTracking : undefined,
          driver_gender_preference: bookingDriverGenderPreference,
          rental_hours: effectiveRideProduct === 'rental_hourly' ? rentalHours : undefined,
          safe_ride_priority:
            effectiveRideProduct === 'school_elderly_safe' ? safeRidePriority : undefined,
          guardian_name:
            effectiveRideProduct === 'school_elderly_safe' ? safeRideGuardianName.trim() : undefined,
          guardian_phone:
            effectiveRideProduct === 'school_elderly_safe' ? safeRideGuardianPhone.trim() : undefined,
          assisted_passenger_name:
            effectiveRideProduct === 'school_elderly_safe' ? safeRidePassengerName.trim() : undefined,
          assisted_passenger_age:
            effectiveRideProduct === 'school_elderly_safe' ? safeRidePassengerAgeNumber : undefined,
          wheelchair_required:
            effectiveRideProduct === 'school_elderly_safe' ? safeRideWheelchairRequired : undefined,
          assistance_required:
            effectiveRideProduct === 'school_elderly_safe' ? safeRideAssistanceRequired : undefined,
          female_driver_preferred:
            effectiveRideProduct === 'school_elderly_safe' ? safeRideFemaleDriverPreferred : undefined,
          trusted_driver_required:
            effectiveRideProduct === 'school_elderly_safe' ? safeRideTrustedDriverRequired : undefined,
          guardian_share_tracking:
            effectiveRideProduct === 'school_elderly_safe' ? safeRideGuardianShareTracking : undefined,
          vehicle_type_id: effectiveSelectedVehicleTypeId || undefined,
          vehicle_subtype_id: bookingVehicleSubtypeId || undefined,
          vehicle_model: bookingVehicleModelName || undefined,
          notes: rideNotes.length > 0 ? rideNotes.join(' | ') : undefined,
        },
      }),
    );
    if (booking) {
      setActiveBooking(booking);
      setBookingJustCreated(true);
      setMessage(isScheduledMode ? t.scheduledRideRequestCreated : t.rideRequestCreated);
      refreshPassengerBookings({ silent: true });
    }
  };

  const cancelBooking = async () => {
    if (!activeBooking?.id) {
      return;
    }
    if (!canCancelActiveBooking) {
      setError(t.rideCannotBeCancelledAfterAccept);
      return;
    }
    const cancellationPolicyText = driverArrivedCancellationApplies
      ? (t.driverArrivedCancellationMinimumFare ||
          'Your driver has arrived. If you cancel now, the minimum fare will be payable to the driver.')
      : (t.freeCancellationBeforeAccept ||
          'Free cancellation applies while the ride is pending or scheduled.');
    const confirmed = window.confirm(
      `${t.confirmCancelBooking || 'Confirm cancellation'}\n\nPickup: ${normalizeLocation(activeBooking.pickup_location)?.address || 'Unknown'}\nDrop: ${normalizeLocation(activeBooking.drop_location || activeBooking.dropoff_location)?.address || 'Unknown'}\n\n${cancellationPolicyText}`,
    );
    if (!confirmed) {
      setMessage(t.cancellationAborted || 'Cancellation aborted.');
      return;
    }
    const cancelled = await callApi(() =>
      apiRequest(`/bookings/${activeBooking.id}/cancel`, {
        method: 'PUT',
        token,
        body: {
          reason_code: driverArrivedCancellationApplies
            ? 'passenger_driver_arrived_cancelled'
            : 'passenger_pending_cancelled',
          reason_text: driverArrivedCancellationApplies
            ? 'Passenger cancelled after driver arrival before trip start.'
            : 'Passenger cancelled before driver arrival.',
          policy_acknowledged: true,
          policy_version: driverArrivedCancellationApplies
            ? 'passenger_driver_arrived_cancel_v1'
            : 'passenger_pending_cancel_v1',
          passenger_context: {
            source: 'passenger_map',
            status_before_cancel: activeBookingStatus || activeBooking.status,
          },
        },
      }),
    );
    if (cancelled) {
      setMessage(t.bookingCancelled);
      await refreshActiveBooking();
      await refreshPassengerBookings({ silent: true });
    }
  };

  const refreshPassengerDashboard = async () => {
    await refreshActiveBooking();
    await refreshPassengerBookings({ silent: true });
    await refreshRideProductAvailability({ silent: true });
    await refreshSpinWinStatus({ silent: true });
    await refreshDriverDiscovery({ silent: true, force: true });
  };

  const handleProfilePress = useCallback(() => {
    if (typeof onProfilePress === 'function') {
      onProfilePress();
      return;
    }
    setShowProfile(true);
  }, [onProfilePress]);

  const shouldShowWebLocationPrompt =
    activePassengerMenu === PRIMARY_PASSENGER_MENU_KEY &&
    locationPermissionState !== 'granted' &&
    locationPermissionState !== 'unsupported';
  const shouldShowPassengerMenuRails =
    !isMobileWeb ||
    activePassengerMenu !== PRIMARY_PASSENGER_MENU_KEY ||
    showPassengerMenus;
  const selectedVehicleType = useMemo(
    () =>
      (availableVehicleTypes || []).find((type) => getVehicleTypeId(type) === effectiveSelectedVehicleTypeId) ||
      null,
    [availableVehicleTypes, effectiveSelectedVehicleTypeId],
  );
  const selectedVehicleModelOptions = useMemo(
    () => getVehicleModelOptions(selectedVehicleType),
    [selectedVehicleType],
  );
  const effectiveSelectedVehicleModelId = useMemo(
    () =>
      selectedVehicleModelOptions.some((model) => model.id === selectedVehicleModelId)
        ? selectedVehicleModelId
        : selectedVehicleModelOptions[0]?.id || '',
    [selectedVehicleModelId, selectedVehicleModelOptions],
  );
  const selectedVehicleModel =
    selectedVehicleModelOptions.find((model) => model.id === effectiveSelectedVehicleModelId) ||
    selectedVehicleModelOptions[0] ||
    null;
  const selectedVehicleDisplayName = selectedVehicleType
    ? getVehicleTypeName(selectedVehicleType)
    : titleFromId(effectiveSelectedVehicleTypeId, 'Auto');
  const selectedVehicleModelDisplayName =
    selectedVehicleModel?.name ||
    (selectedVehicleModelId
      ? titleFromId(selectedVehicleModelId, `${selectedVehicleDisplayName} Standard`)
      : effectiveSelectedVehicleModelId
        ? titleFromId(effectiveSelectedVehicleModelId, `${selectedVehicleDisplayName} Standard`)
        : '');
  const selectedRideChoiceLabel = [
    selectedVehicleDisplayName,
    selectedVehicleModelDisplayName,
    getRideProductName(effectiveRideProduct, rideProductLabels),
  ]
    .filter(Boolean)
    .join(' / ');
  
  // DEBUG: Log the computed label when it changes
  useEffect(() => {
    console.log('[RIDE_CHOICE_LABEL_UPDATE]', {
      label: selectedRideChoiceLabel,
      vehicleTypeId: selectedVehicleTypeId,
      vehicleModelId: selectedVehicleModelId,
      rideProduct: rideProduct,
      effective: {
        typeId: effectiveSelectedVehicleTypeId,
        modelId: effectiveSelectedVehicleModelId,
        product: effectiveRideProduct,
      }
    });
  }, [selectedRideChoiceLabel, selectedVehicleTypeId, selectedVehicleModelId, rideProduct, effectiveSelectedVehicleTypeId, effectiveSelectedVehicleModelId, effectiveRideProduct]);

  const closeRideDetailsModal = useCallback(() => {
    // Force state update to persist modal selections
    // Even if values haven't changed, re-triggering ensures React recognizes the update
    const typeId = String(effectiveSelectedVehicleTypeId || '').trim() || getVehicleTypeId(availableVehicleTypes?.[0]) || '';
    const modelId = String(effectiveSelectedVehicleModelId || '').trim();
    const product = String(effectiveRideProduct || 'normal').trim() || 'normal';
    
    // DEBUG: Log the state being committed
    console.log('[RIDE_DETAILS_MODAL_CLOSE] Persisting selections:', {
      vehicleTypeId: typeId,
      vehicleModelId: modelId,
      rideProduct: product,
      effective: {
        typeId: effectiveSelectedVehicleTypeId,
        modelId: effectiveSelectedVehicleModelId,
        product: effectiveRideProduct,
      }
    });
    
    // Commit selections to state (trigger re-render)
    setSelectedVehicleTypeId(typeId);
    setSelectedVehicleModelId(modelId);
    setRideProduct(product);
    
    // Close modal after state is committed
    setShowRideDetailsModal(false);
  }, [effectiveSelectedVehicleTypeId, effectiveSelectedVehicleModelId, effectiveRideProduct, availableVehicleTypes]);
  const recentDestinationOptions = useMemo(() => {
    const seen = new Set();
    return (passengerBookings || [])
      .map((booking) => {
        const location = normalizeLocation(booking.drop_location || booking.dropoff_location);
        const address = String(location?.address || '').trim();
        const key = address.toLowerCase();
        if (!location || !address || seen.has(key)) {
          return null;
        }
        seen.add(key);
        return {
          id: String(booking.id || key),
          label: address.split(',')[0] || 'Recent destination',
          address,
          location,
        };
      })
      .filter(Boolean)
      .slice(0, 3);
  }, [normalizeLocation, passengerBookings]);
  const quickFareValue = Number(fare?.total_fare || 0);
  const visibleDriverFareValues = visibleDrivers
    .slice(0, 5)
    .map((driver) => estimateDriverFare(driver))
    .filter((value) => Number.isFinite(value) && value > 0);
  const quickDriverFareMin = visibleDriverFareValues.length > 0 ? Math.min(...visibleDriverFareValues) : 0;
  const quickDriverFareMax = visibleDriverFareValues.length > 0 ? Math.max(...visibleDriverFareValues) : 0;
  const quickDriverFareRange =
    quickDriverFareMin > 0 && quickDriverFareMax > 0
      ? quickDriverFareMin === quickDriverFareMax
        ? `Rs. ${quickDriverFareMin.toFixed(0)}`
        : `Rs. ${quickDriverFareMin.toFixed(0)}-${quickDriverFareMax.toFixed(0)}`
      : '';
  const quickFareLabel =
    quickDriverFareRange || (quickFareValue > 0 ? `Rs. ${quickFareValue.toFixed(0)}` : 'Fare ready soon');

  const effectivePickupLocation = pickupLocation || selectedPickupLocation;
  const effectiveDropoffLocation = dropoffLocation || selectedDropoffLocation;

  const fareDistanceKm = Number(
    fare?.distance_km ??
      fare?.estimated_distance_km ??
      fare?.distance ??
      fare?.estimated_distance ??
      fare?.route?.distance_km ??
      fare?.route?.distance ??
      (fare?.distance_m ? fare.distance_m / 1000 : undefined) ??
      (fare?.distanceMeters ? fare.distanceMeters / 1000 : undefined) ??
      0,
  );
  const quickDistanceLabel = fareDistanceKm > 0 ? `${fareDistanceKm.toFixed(1)} km` : 'Distance calculating';
  const quickEtaLabel = visibleDrivers.length > 0 ? `${Math.min(visibleDrivers.length, 5)} within 2 km` : autoFetchingTripData ? 'Finding drivers' : 'Driver search live';
  const quickBookingReady = Boolean(effectivePickupLocation && effectiveDropoffLocation);
  const quickBookingStep = !effectiveDropoffLocation ? 1 : quickBookingReady && !fare && autoFetchingTripData ? 2 : 3;
  const quickDestinationText = effectiveDropoffLocation?.address || dropoffQuery || '';
  const quickPickupText = effectivePickupLocation?.address || pickupQuery || 'Use current location';

  const handleQuickConfirmRide = async () => {
    if (!pickupLocation) {
      if (pickupQuery.trim()) {
        setLocationValidation((prev) => ({ ...prev, pickup: true }));
        setError('Select pickup from the search results or use current location.');
        return;
      }
      await autofillPickupFromCurrentLocation({ silent: false });
      if (!dropoffLocation) {
        setError('Select your destination to continue.');
      }
      return;
    }
    if (!dropoffLocation) {
      setLocationValidation((prev) => ({ ...prev, dropoff: true }));
      setError('Select your destination to continue.');
      return;
    }
    await createBooking();
  };

  const selectRecentDestination = (item) => {
    if (!item?.location) {
      return;
    }
    setLocationForPoint('dropoff', item.location);
    setSelectingPoint('pickup');
    setMessage('Destination selected. Review fare and confirm.');
  };

  const renderQuickSuggestion = useCallback((item, point) => (
    <TouchableOpacity
      key={`quick-${point}-${item.placeId}`}
      style={styles.quickSuggestionRow}
      onPress={() => handleSelectSuggestion(point, item)}>
      <View style={styles.quickSuggestionPin} />
      <Text style={styles.quickSuggestionText} numberOfLines={2}>{item.description}</Text>
    </TouchableOpacity>
  ), [handleSelectSuggestion, styles]);

  const renderAssistedRideFields = () => (
    <View style={styles.rideDetailsSection}>
      <Text style={styles.rideDetailsSectionTitle}>School/Elderly assisted ride</Text>
      <Text style={styles.hint}>
        Verified assisted-ride drivers only. Pickup OTP, live tracking, and drop OTP are shared with the guardian.
      </Text>
      <View style={styles.modeRow}>
        <TouchableOpacity
          style={[styles.modeChip, safeRidePriority === 'school' && styles.modeChipActive]}
          onPress={() => setSafeRidePriority('school')}
          disabled={loading}>
          <Text style={[styles.modeChipText, safeRidePriority === 'school' && styles.modeChipTextActive]}>
            {t.school}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeChip, safeRidePriority === 'elderly' && styles.modeChipActive]}
          onPress={() => setSafeRidePriority('elderly')}
          disabled={loading}>
          <Text style={[styles.modeChipText, safeRidePriority === 'elderly' && styles.modeChipTextActive]}>
            {t.elderly}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.assistedGrid}>
        <VoiceTextInput
          style={[styles.input, styles.assistedInput]}
          value={safeRidePassengerName}
          onChangeText={setSafeRidePassengerName}
          placeholder="Passenger name"
          placeholderTextColor={COLORS.textMuted}
        />
        <VoiceTextInput
          style={[styles.input, styles.assistedInput]}
          value={safeRidePassengerAge}
          onChangeText={setSafeRidePassengerAge}
          keyboardType="number-pad"
          placeholder="Age"
          placeholderTextColor={COLORS.textMuted}
        />
        <VoiceTextInput
          style={[styles.input, styles.assistedInput]}
          value={safeRideGuardianName}
          onChangeText={setSafeRideGuardianName}
          placeholder="Guardian name"
          placeholderTextColor={COLORS.textMuted}
        />
        <VoiceTextInput
          style={[styles.input, styles.assistedInput]}
          value={safeRideGuardianPhone}
          onChangeText={setSafeRideGuardianPhone}
          keyboardType="phone-pad"
          placeholder="Guardian phone"
          placeholderTextColor={COLORS.textMuted}
        />
      </View>

      <View style={styles.assistedToggleGrid}>
        {[
          ['Wheelchair', safeRideWheelchairRequired, setSafeRideWheelchairRequired],
          ['Assistance', safeRideAssistanceRequired, setSafeRideAssistanceRequired],
          ['Female driver', safeRideFemaleDriverPreferred, setSafeRideFemaleDriverPreferred],
          ['Trusted driver', safeRideTrustedDriverRequired, setSafeRideTrustedDriverRequired],
          ['Share tracking', safeRideGuardianShareTracking, setSafeRideGuardianShareTracking],
        ].map(([label, active, setter]) => (
          <TouchableOpacity
            key={label}
            style={[styles.modeChip, styles.assistedToggleChip, active && styles.modeChipActive]}
            onPress={() => setter((prev) => !prev)}
            disabled={loading}>
            <Text style={[styles.modeChipText, active && styles.modeChipTextActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <VoiceTextInput
        style={[styles.input, styles.assistedNotesInput]}
        value={safeRideNotes}
        onChangeText={setSafeRideNotes}
        placeholder="Care notes, pickup handoff, medication reminder (optional)"
        placeholderTextColor={COLORS.textMuted}
        multiline
        numberOfLines={3}
      />
    </View>
  );

  const renderRideDetailsOverlay = () => {
    if (!showRideDetailsModal) {
      return null;
    }

    return (
      <View style={styles.rideDetailsOverlay}>
        <View style={styles.rideDetailsPanel}>
          <View style={styles.rideDetailsHeader}>
            <View>
              <Text style={styles.rideDetailsEyebrow}>Ride details</Text>
              <Text style={styles.rideDetailsTitle}>Choose your ride</Text>
            </View>
            <TouchableOpacity
              style={styles.rideDetailsCloseButton}
              onPress={closeRideDetailsModal}
              accessibilityLabel="Close ride details"
              accessibilityRole="button">
              <Text style={styles.rideDetailsCloseText}>x</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.rideDetailsBody}
            contentContainerStyle={styles.rideDetailsBodyContent}
            showsVerticalScrollIndicator={false}>
            <View style={styles.rideDetailsSection}>
              <Text style={styles.rideDetailsSectionTitle}>Vehicle type</Text>
              {vehicleTypesLoading ? (
                <ActivityIndicator size="small" color={COLORS.primary} />
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {(availableVehicleTypes || []).map((type) => {
                    const typeId = getVehicleTypeId(type);
                    const active = effectiveSelectedVehicleTypeId === typeId;
                    return (
                      <TouchableOpacity
                        key={typeId || getVehicleTypeName(type)}
                        style={[styles.rideDetailsOptionChip, active && styles.rideDetailsOptionChipActive]}
                        onPress={() => handleVehicleTypeSelect(type)}>
                        {!!type.icon && <Text style={styles.rideDetailsOptionIcon}>{type.icon}</Text>}
                        <Text
                          style={[
                            styles.rideDetailsOptionText,
                            active && styles.rideDetailsOptionTextActive,
                          ]}
                          numberOfLines={1}>
                          {getVehicleTypeName(type)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </View>

            <View style={styles.rideDetailsSection}>
              <Text style={styles.rideDetailsSectionTitle}>Vehicle model</Text>
              <View style={styles.rideDetailsWrapRow}>
                {selectedVehicleModelOptions.map((model) => {
                  const active = effectiveSelectedVehicleModelId === model.id;
                  return (
                    <TouchableOpacity
                      key={model.id}
                      style={[styles.rideDetailsOptionChip, active && styles.rideDetailsOptionChipActive]}
                      onPress={() => handleVehicleModelSelect(model.id)}>
                      <Text
                        style={[styles.rideDetailsOptionText, active && styles.rideDetailsOptionTextActive]}
                        numberOfLines={1}>
                        {model.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <View style={styles.rideDetailsSection}>
              <RideProductsGrid
                selected={effectiveRideProduct}
                enabledKeys={enabledRideProducts}
                hideInactive
                heading="Ride type"
                subheading=""
                labels={rideProductLabels}
                onSelect={handleRideProductSelect}
              />
            </View>

            {effectiveRideProduct === 'scheduled' && (
              <View style={styles.rideDetailsSection}>
                <ScheduledPickupPicker
                  value={scheduledAtInput}
                  onChangeText={setScheduledAtInput}
                  timezone={scheduledTimeZone}
                  onTimezoneChange={setScheduledTimeZone}
                  inputStyle={styles.input}
                  labels={{
                    title: t.setPickupTime,
                    date: t.date || 'Date',
                    time: t.time || 'Time',
                    timezone: t.timezone || 'Timezone',
                    manual: t.manual || 'Manual',
                    ready: t.ready || 'Ready',
                  }}
                  messages={{
                    required: t.selectPickupTimeScheduled,
                    invalid: t.enterValidPickupDateTime,
                    future: t.scheduledPickupFuture,
                  }}
                />
                <Text style={styles.infoText}>Driver Gender Preference</Text>
                <View style={styles.modeRow}>
                  {DRIVER_GENDER_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.modeChip,
                        effectiveScheduledDriverGenderPreference === option.value && styles.modeChipActive,
                      ]}
                      onPress={() => setScheduledDriverGenderPreference(option.value)}>
                      <Text
                        style={[
                          styles.modeChipText,
                          effectiveScheduledDriverGenderPreference === option.value && styles.modeChipTextActive,
                        ]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {effectiveRideProduct === 'pool' && (
              <View style={styles.rideDetailsSection}>
                <Text style={styles.rideDetailsSectionTitle}>Pool ride</Text>
                <Text style={styles.hint}>
                  Auto Match Pool groups compatible passengers automatically. Create My Pool opens a
                  passenger-created pool that others can join.
                </Text>
                <View style={styles.poolActionRow}>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.poolActionButton]}
                    accessibilityRole="button"
                    onPress={() => openPoolRideFlow('SYSTEM_CREATED')}>
                    <Text style={styles.actionText}>Auto Match Pool</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButtonMuted, styles.poolActionButton]}
                    accessibilityRole="button"
                    onPress={() => openPoolRideFlow('PASSENGER_CREATED')}>
                    <Text style={styles.actionText}>Create My Pool</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {effectiveRideProduct === 'corporate' && (
              <View style={styles.rideDetailsSection}>
                <Text style={styles.rideDetailsSectionTitle}>{t.corporateDetailsTitle || 'Corporate details'}</Text>
                <VoiceTextInput
                  style={styles.input}
                  value={corporateCode}
                  onChangeText={setCorporateCode}
                  placeholder={t.corporateCodePlaceholder}
                  placeholderTextColor={COLORS.textMuted}
                />
                <VoiceTextInput
                  style={styles.input}
                  value={corporatePurpose}
                  onChangeText={setCorporatePurpose}
                  placeholder={t.corporatePurposePlaceholder || 'Trip purpose (optional)'}
                  placeholderTextColor={COLORS.textMuted}
                />
                <VoiceTextInput
                  style={styles.input}
                  value={corporateCostCenterId}
                  onChangeText={setCorporateCostCenterId}
                  placeholder={t.corporateCostCenterPlaceholder || 'Cost center / project code (optional)'}
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
            )}

            {effectiveRideProduct === 'airport' && (
              <View style={styles.rideDetailsSection}>
                <Text style={styles.rideDetailsSectionTitle}>Airport details</Text>
                <VoiceTextInput
                  style={styles.input}
                  value={flightNumber}
                  onChangeText={setFlightNumber}
                  placeholder={t.flightNumberPlaceholder || 'Flight number'}
                  placeholderTextColor={COLORS.textMuted}
                />
                <VoiceTextInput
                  style={styles.input}
                  value={airportTerminal}
                  onChangeText={setAirportTerminal}
                  placeholder={t.airportTerminalPlaceholder || 'Airport terminal'}
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
            )}

            {effectiveRideProduct === 'intercity' && (
              <View style={styles.rideDetailsSection}>
                <Text style={styles.rideDetailsSectionTitle}>Intercity options</Text>
                <TouchableOpacity
                  style={[styles.modeChip, intercityReturnTrip && styles.modeChipActive]}
                  onPress={() => setIntercityReturnTrip((prev) => !prev)}
                  disabled={loading}>
                  <Text style={[styles.modeChipText, intercityReturnTrip && styles.modeChipTextActive]}>
                    {intercityReturnTrip ? t.returnTripYes : t.returnTripNo}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeChip, intercityTollsIncluded && styles.modeChipActive]}
                  onPress={() => setIntercityTollsIncluded((prev) => !prev)}
                  disabled={loading}>
                  <Text style={[styles.modeChipText, intercityTollsIncluded && styles.modeChipTextActive]}>
                    {intercityTollsIncluded
                      ? t.intercityTollsIncluded || 'Tolls included'
                      : t.intercityTollsExtra || 'Tolls extra'}
                  </Text>
                </TouchableOpacity>
                <VoiceTextInput
                  style={styles.input}
                  value={intercityWaitHoursInput}
                  onChangeText={(value) => setIntercityWaitHoursInput(value.replace(/[^0-9]/g, '').slice(0, 2))}
                  placeholder={t.intercityWaitHoursPlaceholder || 'Outstation wait hours (0 to 72)'}
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="numeric"
                />
                <VoiceTextInput
                  style={[styles.input, styles.assistedNotesInput]}
                  value={intercityRouteNotes}
                  onChangeText={(value) => setIntercityRouteNotes(value.slice(0, 240))}
                  placeholder={t.intercityRouteNotesPlaceholder || 'Route notes (optional)'}
                  placeholderTextColor={COLORS.textMuted}
                  multiline
                  numberOfLines={2}
                />
                <Text style={styles.hint}>Intercity uses Taxi, XL, or Traveller for outstation travel.</Text>
              </View>
            )}

            {effectiveRideProduct === 'tourism' && (
              <View style={styles.rideDetailsSection}>
                <Text style={styles.rideDetailsSectionTitle}>Tourism package</Text>
                {renderTourismFields()}
              </View>
            )}

            {effectiveRideProduct === 'women_only' && renderWomenOnlyFields()}

            {effectiveRideProduct === 'rental_hourly' && (
              <View style={styles.rideDetailsSection}>
                <Text style={styles.rideDetailsSectionTitle}>Rental hours</Text>
                <VoiceTextInput
                  style={styles.input}
                  value={rentalHoursInput}
                  onChangeText={setRentalHoursInput}
                  keyboardType="number-pad"
                  placeholder={t.rentalHoursPlaceholder}
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
            )}

            {effectiveRideProduct === 'school_elderly_safe' && renderAssistedRideFields()}

            <View style={styles.rideDetailsSection}>
              <Text style={styles.rideDetailsSectionTitle}>Passengers optional</Text>
              <VoiceTextInput
                style={styles.input}
                value={passengerCountInput}
                onChangeText={setPassengerCountInput}
                keyboardType="number-pad"
                placeholder="1-6, optional"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>
          </ScrollView>

          <TouchableOpacity
            style={styles.rideDetailsDoneButton}
            onPress={closeRideDetailsModal}>
            <Text style={styles.rideDetailsDoneText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };



  const semanticCardToNormalized = (key) => {
    return String(key || '')
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
  };

  const resolveSemanticDropoffFromHistory = useCallback(
    (cardKey) => {
      const normalized = semanticCardToNormalized(cardKey);
      if (!normalized) {
        return null;
      }

      // Best-effort: match by substring inside recent booking drop destinations.
      const keywordMap = {
        office: ['office', 'work', 'company'],
        airport: ['airport'],
        home: ['home', 'house', 'my place'],
        railway_station: ['railway station', 'railway', 'station', 'bus stand', 'bus station'],
        lulu_mall: ['lulu', 'lulu mall'],
        hospital: ['hospital', 'clinic'],
      };

      const keywords = keywordMap[normalized] || [];
      const bookings = Array.isArray(passengerBookings) ? passengerBookings : [];
      for (let i = 0; i < bookings.length; i += 1) {
        const booking = bookings[i];
        const loc = normalizeLocation(booking.drop_location || booking.dropoff_location);
        const address = String(loc?.address || '').toLowerCase();
        if (!loc || !address) continue;
        if (keywords.some((kw) => address.includes(String(kw).toLowerCase()))) {
          return { ...loc, address: loc.address };
        }
      }
      return null;
    },
    [passengerBookings, normalizeLocation],
  );

  const resolveSemanticDropoff = useCallback(
    async (cardKey) => {
      const byHistory = resolveSemanticDropoffFromHistory(cardKey);
      if (byHistory) {
        return byHistory;
      }

      // Fallback: use Places search by the semantic label.
      if (!placesConfigured) {
        return null;
      }
      const query = String(cardKey || '');
      const suggestions = await searchPlaces(String(query).trim(), searchBias).catch(() => []);
      const best = Array.isArray(suggestions) ? suggestions[0] : null;
      if (!best?.placeId) {
        return null;
      }
      const loc = await getPlaceLocation(best.placeId).catch(() => null);
      if (!loc) return null;
      return {
        latitude: Number(loc.latitude),
        longitude: Number(loc.longitude),
        address: String(loc.address || loc.name || query).trim() || query,
      };
    },
    [getPlaceLocation, placesConfigured, resolveSemanticDropoffFromHistory, searchBias],
  );

  const handleSemanticCardPress = useCallback(
    async (cardKey) => {
      try {
        setError('');
        setMessage('');

        // Auto-flow: always use current location as pickup (if not yet set), then set drop.
        if (!pickupLocation) {
          await autofillPickupFromCurrentLocation({ silent: true });
        }

        const drop = await resolveSemanticDropoff(cardKey);
        if (!drop) {
          setError('Could not find that place. Please use search once.');
          return;
        }

        setLocationForPoint('dropoff', drop);
        setSelectingPoint('pickup');

        // One tap booking.
        await createBooking();
      } catch {
        setError('Could not book from card.');
      }
    },
    [autofillPickupFromCurrentLocation, createBooking, pickupLocation, resolveSemanticDropoff, setError, setLocationForPoint],
  );

  const renderPassengerQuickBooking = () => (
    <View style={[styles.quickBookingSheet, isMobileWeb && styles.quickBookingSheetMobile]}>
      <View style={styles.quickSheetHandle} />
      <View style={styles.quickBookingHeader}>
        <View style={styles.quickBookingTitleBlock}>
          <Text style={styles.quickGreeting}>Hi {user?.name || 'there'}</Text>
          <Text style={[styles.quickTitle, isMobileWeb && styles.quickTitleMobile]}>
            {bookingMode === 'single' ? 'Where to?' : bookingMode === 'family' ? 'Book for your family' : bookingMode === 'pooling' ? 'Find a ride partner' : bookingMode === 'corporate' ? 'Book for your company' : bookingMode === 'travel' ? 'Plan your journey' : bookingMode === 'scheduled' ? 'Schedule your ride' : 'Where to?'}
          </Text>
          <Text style={[styles.quickSubtitle, isMobileWeb && styles.quickSubtitleMobile]}>
            {bookingMode === 'single' ? 'Enter your destination' : bookingMode === 'family' ? 'Add family members to your ride' : bookingMode === 'pooling' ? 'Share your ride with others' : bookingMode === 'corporate' ? 'Book for employees' : bookingMode === 'travel' ? 'Plan multiple stops' : bookingMode === 'scheduled' ? 'Schedule for later' : 'Enter your destination'}
          </Text>
        </View>
        <View style={styles.quickHeaderActions}>
          <NotificationBell
            onPress={() => setShowNotificationCenter(true)}
            unreadCount={unreadCount}
            style={styles.quickIconButton}
          />
          <TouchableOpacity
            style={styles.quickMoreButton}
            onPress={() => {
              setShowPassengerMenus((prev) => !prev);
              setActivePassengerMenu(PRIMARY_PASSENGER_MENU_KEY);
            }}>
            <Text style={styles.quickMoreText}>{showPassengerMenus ? 'Hide' : 'Menu'}</Text>
          </TouchableOpacity>
        </View>
      </View>



      {bookingMode === 'single' && (
        <View style={styles.quickStepRow}>
          {['Destination', 'Ride', 'Confirm'].map((label, index) => {
            const stepNumber = index + 1;
            const active = quickBookingStep >= stepNumber;
            return (
              <View key={label} style={styles.quickStepItem}>
                <View style={[styles.quickStepDot, active && styles.quickStepDotActive]}>
                  <Text style={[styles.quickStepNumber, active && styles.quickStepNumberActive]}>{stepNumber}</Text>
                </View>
                <Text style={[styles.quickStepLabel, active && styles.quickStepLabelActive]}>{label}</Text>
              </View>
            );
          })}
        </View>
      )}

      {shouldShowWebLocationPrompt && (
        <TouchableOpacity
          style={styles.quickLocationPrompt}
          onPress={() => autofillPickupFromCurrentLocation({ silent: false })}
          disabled={locatingPickup}>
          <Text style={styles.quickLocationPromptTitle}>{locatingPickup ? 'Getting your location...' : 'Allow current location'}</Text>
          <Text style={styles.quickLocationPromptText}>Pickup fills automatically after permission.</Text>
        </TouchableOpacity>
      )}

      <View style={styles.quickRouteBox}>
        <View style={styles.quickRouteLine}>
          <View style={[styles.quickRouteDot, styles.quickPickupDot]} />
          <View style={styles.quickRouteCopy}>
            <View style={styles.quickRouteLabelRow}>
              <Text style={styles.quickRouteLabel}>Pickup</Text>
              <TouchableOpacity
                style={styles.quickUseLocationButton}
                onPress={() => autofillPickupFromCurrentLocation({ silent: false })}
                disabled={locatingPickup}>
                <Text style={styles.quickUseLocationText}>{locatingPickup ? 'Locating' : 'Use current'}</Text>
              </TouchableOpacity>
            </View>
            <VoiceTextInput
              style={[styles.quickDestinationInput, locationValidation.pickup && styles.quickDestinationInputError]}
              containerStyle={styles.quickDestinationInputContainer}
              value={pickupQuery}
              onFocus={() => setSelectingPoint('pickup')}
              onChangeText={(text) => handleSearchTextChange('pickup', text)}
              placeholder={quickPickupText}
              placeholderTextColor="#7A8A80"
              returnKeyType="search"
            />
          </View>
        </View>

        <View style={styles.quickRouteDivider} />

        <View style={styles.quickRouteLine}>
          <View style={[styles.quickRouteDot, styles.quickDropDot]} />
          <View style={styles.quickRouteCopy}>
            <Text style={styles.quickRouteLabel}>Destination</Text>
            <VoiceTextInput
              style={[styles.quickDestinationInput, locationValidation.dropoff && styles.quickDestinationInputError]}
              containerStyle={styles.quickDestinationInputContainer}
              value={dropoffQuery}
              onFocus={() => setSelectingPoint('dropoff')}
              onChangeText={(text) => handleSearchTextChange('dropoff', text)}
              placeholder="Search destination"
              placeholderTextColor="#7A8A80"
              returnKeyType="search"
            />
          </View>
        </View>
      </View>

      {searchingPickup && <Text style={styles.quickHint}>Searching pickup...</Text>}
      {pickupSuggestions.slice(0, 4).map((item) => renderQuickSuggestion(item, 'pickup'))}

      {searchingDropoff && <Text style={styles.quickHint}>Searching places...</Text>}
      {dropoffSuggestions.slice(0, 4).map((item) => renderQuickSuggestion(item, 'dropoff'))}

      {!quickDestinationText && recentDestinationOptions.length > 0 && (
        <View style={styles.quickRecentSection}>
          <Text style={styles.quickSectionLabel}>Recent places</Text>
          <View style={styles.quickRecentRow}>
            {recentDestinationOptions.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.quickRecentChip}
                onPress={() => selectRecentDestination(item)}>
                <Text style={styles.quickRecentChipTitle} numberOfLines={1}>{item.label}</Text>
                <Text style={styles.quickRecentChipSub} numberOfLines={1}>{item.address}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      <View style={styles.quickChoiceRow}>
        <TouchableOpacity
          style={styles.quickChoiceChip}
          onPress={() => setShowRideDetailsModal(true)}
          accessibilityLabel="Select ride details"
          accessibilityRole="button">
          <Text style={styles.quickChoiceLabel}>Ride</Text>
          <Text style={styles.quickChoiceValue} numberOfLines={1}>
            {selectedRideChoiceLabel || 'Auto / Standard / Normal'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickChoiceChip}
          onPress={() => handleMenuSelection('payment', t.payment || 'Payment')}>
          <Text style={styles.quickChoiceLabel}>Payment</Text>
          <Text style={styles.quickChoiceValue}>{selectedPaymentMethod === 'online' ? 'Online' : 'Cash'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.quickFareCard}>
        <View>
          <Text style={styles.quickFareLabel}>{quickBookingReady ? 'Estimated fare' : 'Trip preview'}</Text>
          <Text style={styles.quickFareValue}>{autoFetchingTripData ? 'Calculating...' : quickFareLabel}</Text>
        </View>
        <View style={styles.quickFareMeta}>
          <Text style={styles.quickFareMetaText}>{quickDistanceLabel}</Text>
          <Text style={styles.quickFareMetaText}>{quickEtaLabel}</Text>
        </View>
      </View>

      <TouchableOpacity
        style={[
          styles.quickConfirmButton,
          (!quickBookingReady || loading) && styles.quickConfirmButtonDisabled,
        ]}
        onPress={handleQuickConfirmRide}
        disabled={loading || !quickBookingReady}>
        <Text style={styles.quickConfirmText}>
          {loading ? 'Requesting ride...' : quickBookingReady ? 'Confirm Ride' : 'Select destination'}
        </Text>
      </TouchableOpacity>

      <View style={styles.quickSecondaryActions}>
        <TouchableOpacity
          style={styles.quickSecondaryButton}
          onPress={() => {
            setShowPassengerMenus((prev) => !prev);
            setActivePassengerMenu('booking');
          }}>
          <Text style={styles.quickSecondaryText}>
            {bookingMode === 'single' ? 'Single' : bookingMode === 'family' ? 'Family' : bookingMode === 'pooling' ? 'Pool' : bookingMode === 'corporate' ? 'Corporate' : bookingMode === 'travel' ? 'Travel' : bookingMode === 'scheduled' ? 'Scheduled' : 'Booking Mode'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickSecondaryButton}
          onPress={() => setShowInteractiveMap((prev) => !prev)}>
          <Text style={styles.quickSecondaryText}>{showInteractiveMap ? 'Map pick on' : 'Map pick off'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickSecondaryButton}
          onPress={() => handleMenuSelection('safety', t.safety)}>
          <Text style={styles.quickSecondaryText}>Safety</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickSecondaryButton}
          onPress={handleProfilePress}>
          <Text style={styles.quickSecondaryText}>Profile</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (showSafePath) {
    return (
      <SafePathScreen onClose={() => setShowSafePath(false)} />
    );
  }

  if (showProfile) {
    return (
      <PassengerProfile
        token={token}
        user={user}
        onLogout={onLogout}
        onBack={() => setShowProfile(false)}
      />
    );
  }

  return (
    <AccessibilityProvider settings={passengerAccessibility}>
      <SafeAreaView style={styles.safeArea}>
        <View style={[styles.container, isMobileWeb && styles.containerMobile]}>
          {!isMobileWeb && <WebCommandBar />}
        <View style={[styles.mapContainer, isMobileWeb && styles.mapContainerMobile]}>
          <WebLeafletMap
            title={t.passengerMapTitle}
            fallbackUrl={mapState.fallbackUrl}
            mapStyle={[styles.mapIframe, isMobileWeb && styles.mapIframeMobile]}
            defaultCenter={DEFAULT_CITY_LOCATION}
            pickupLocation={mapState.origin}
            dropoffLocation={mapState.destination}
            hazardMarkers={hazardMarkers}
            autoCenterHazardId={autoCenterHazardId}
            driverLocation={mapState.driverLiveLocation}
            routeOrigin={mapState.routeOrigin}
            routeDestination={mapState.routeDestination}
            isInteractiveMode={showInteractiveMap}
            onMapPress={handleMapPress}
            onMarkerDragEnd={handleMarkerDragEnd}
            selectingPoint={selectingPoint}
            showStatusOverlay={false}
          />
        </View>

        <View style={[styles.panel, isMobileWeb && styles.panelMobile, accessibilityUi.panelStyle]}>
          <View
            style={[
              styles.headerRow,
              isMobileWeb && styles.headerRowMobile,
              isMobileWeb && activePassengerMenu === PRIMARY_PASSENGER_MENU_KEY && styles.headerRowBookingMobile,
            ]}>
            <View style={[styles.headerUserBlock, isMobileWeb && styles.headerUserBlockMobile]}>
              <Text style={[styles.hello, isMobileWeb && styles.helloMobile, accessibilityUi.headingStyle]}>{t.hi}, {user?.name || t.passengerFallbackName}</Text>
              {!isMobileWeb && <Text style={[styles.sub, accessibilityUi.textStyle]}>{t.passengerCenter}</Text>}
            </View>
            {!isMobileWeb && <Image source={LOGO_SOURCE} style={styles.headerLogo} resizeMode="contain" />}
            <NotificationBell
              onPress={() => setShowNotificationCenter(true)}
              unreadCount={unreadCount}
              style={[styles.headerButton, isMobileWeb && styles.headerButtonMobile]}
            />
            {!isMobileWeb && (
              <AccessibilityQuickAccess
                token={token}
                onSettingsChange={handleAccessibilityChange}
              />
            )}
            <TouchableOpacity onPress={handleProfilePress} style={[styles.profileButton, isMobileWeb && styles.profileButtonMobile]}>
              <Text style={styles.profileText}>{t.profile}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleMenuSelection('safety', t.safety)}
              style={[styles.logoutButton, styles.safetyHeaderButton, isMobileWeb && styles.logoutButtonMobile]}>
              <Text style={[styles.logoutText, styles.safetyHeaderText]}>{t.safety}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowSafePath(true)} style={[styles.logoutButton, isMobileWeb && styles.logoutButtonMobile]}>
              <Text style={[styles.logoutText]}>Safe Route</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onLogout} style={[styles.logoutButton, isMobileWeb && styles.logoutButtonMobile]}>
              <Text style={styles.logoutText}>{t.logout}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={[styles.panelScroll, isMobileWeb && styles.panelScrollMobile]}
            contentContainerStyle={[styles.panelScrollContent, isMobileWeb && styles.panelScrollContentMobile]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            {loading && <ActivityIndicator color={COLORS.primary} style={styles.loader} />}
            {autoFetchingTripData && <ActivityIndicator color={COLORS.primary} style={styles.loader} />}
            {!!error && <Text style={styles.error}>{error}</Text>}
            {!!message && <Text style={styles.message}>{message}</Text>}

            {/* Booking confirmation card - shows after successful booking */}
            {bookingJustCreated && activeBooking && (
              <BookingConfirmationCard
                booking={activeBooking}
                onDismiss={() => setBookingJustCreated(false)}
                autoDismissMs={5000}
              />
            )}

            {shouldShowWebLocationPrompt && !isMobileWeb && (
              <View style={[styles.locationPermissionCard, isMobileWeb && styles.locationPermissionCardMobile]}>
                <View style={styles.locationPermissionCopy}>
                  <Text style={styles.locationPermissionTitle}>Current location access</Text>
                  <Text style={styles.locationPermissionText}>
                    Allow AutoBuddy to use your current location for pickup.
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.locationPermissionButton, locatingPickup && styles.locationPermissionButtonDisabled]}
                  onPress={() => autofillPickupFromCurrentLocation({ silent: false })}
                  disabled={locatingPickup}>
                  <Text style={styles.locationPermissionButtonText}>
                    {locatingPickup ? 'Opening...' : 'Allow Location'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {shouldShowPassengerMenuRails && (
              <>
                <View style={[styles.dashboardTopRow, isMobileWeb && styles.dashboardTopRowMobile]}>
                  <TouchableOpacity
                    style={[
                      styles.primaryMenuButton,
                      isMobileWeb && styles.primaryMenuButtonMobile,
                      activePassengerMenu === PRIMARY_PASSENGER_MENU_KEY && styles.primaryMenuButtonActive,
                    ]}
                    accessibilityRole="tab"
                    accessibilityLabel={t.rideBooking}
                    accessibilityState={{ selected: activePassengerMenu === PRIMARY_PASSENGER_MENU_KEY }}
                    onPress={() => handleMenuSelection(PRIMARY_PASSENGER_MENU_KEY, t.rideBooking)}>
                    <View style={styles.primaryMenuButtonContent}>
                      <View
                        style={[
                          styles.menuIconBadge,
                          activePassengerMenu === PRIMARY_PASSENGER_MENU_KEY && styles.menuIconBadgeActive,
                        ]}>
                        <PassengerMenuIcon
                          symbol={PASSENGER_MENU_BY_KEY.ride.symbol}
                          selected={activePassengerMenu === PRIMARY_PASSENGER_MENU_KEY}
                        />
                      </View>
                      <Text style={styles.primaryMenuButtonText}>{t.rideBooking}</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.menuToggleButton, isMobileWeb && styles.menuToggleButtonMobile]}
                    accessibilityRole="button"
                    accessibilityLabel={showPassengerMenus ? t.hideMenus : t.otherMenus}
                    accessibilityState={{ expanded: showPassengerMenus }}
                    onPress={() =>
                      setShowPassengerMenus((prev) => {
                        const next = !prev;
                        triggerA11yFeedback(next ? `${t.otherMenus} opened` : `${t.otherMenus} closed`);
                        return next;
                      })
                    }>
                    <Text style={styles.menuToggleButtonText}>
                      {showPassengerMenus ? t.hideMenus : t.otherMenus}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={[styles.pinnedMenuRow, isMobileWeb && styles.pinnedMenuRowMobile]}>
                  {pinnedPassengerMenuOptions.map((menu) => renderPassengerMenuChip(menu, 'pinned'))}
                </View>

                {showPassengerMenus && (
                  <View style={styles.secondaryMenuPanel}>
                    {SECONDARY_PASSENGER_MENU_GROUPS.map((section) => (
                      <View key={section.key} style={styles.menuGroup}>
                        <Text style={styles.menuGroupTitle}>{section.title}</Text>
                        <View style={styles.secondaryMenuRow}>
                          {section.options.map((menu) => renderPassengerMenuChip(menu))}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}

            {activePassengerMenu !== PRIMARY_PASSENGER_MENU_KEY && (
              <View style={styles.activeMenuInfoRow}>
                <Text style={styles.activeMenuInfoText}>
                  {getMenuLabel(PASSENGER_MENU_BY_KEY[activePassengerMenu]) || t.menu}
                </Text>
                <TouchableOpacity
                  style={styles.menuToggleButton}
                  accessibilityRole="tab"
                  accessibilityLabel={t.backToRide}
                  accessibilityState={{ selected: false }}
                  onPress={() => handleMenuSelection(PRIMARY_PASSENGER_MENU_KEY, t.rideBooking)}>
                  <Text style={styles.menuToggleButtonText}>{t.backToRide}</Text>
                </TouchableOpacity>
              </View>
            )}

            {activePassengerMenu === 'safety' && <KeralaSafetyCard safety={keralaSafety} />}

            {activePassengerMenu === 'wallet' && (
              <View style={styles.infoBlock}>
                <Text style={styles.infoTitle}>{t.walletRevenue}</Text>
                <RevenueCard token={token} role={user?.role} />
              </View>
            )}

            {activePassengerMenu === 'spin' && (
              <View style={styles.infoBlock}>
                <Text style={styles.infoTitle}>{t.dailySpinWin}</Text>
                {!spinWinStatus ? (
                  <Text style={styles.infoText}>{t.spinStatusUnavailable}</Text>
                ) : (
                  <>
                    <Text style={styles.infoText}>
                      {t.statusLabel}: {spinWinStatus.enabled ? t.enabled : t.disabled}
                    </Text>
                    <Text style={styles.infoText}>
                      {t.dailyLimit}: {Number(spinWinStatus.daily_spin_limit || 0)} | {t.used}: {Number(spinWinStatus.spins_used_today || 0)} | {t.left}: {Number(spinWinStatus.spins_left_today || 0)}
                    </Text>
                    {spinWinStatus.starts_at && (
                      <Text style={styles.infoText}>{t.campaignStart}: {formatToIST(spinWinStatus.starts_at, { dateStyle: 'medium', timeStyle: 'short' })}</Text>
                    )}
                    {spinWinStatus.ends_at && (
                      <Text style={styles.infoText}>{t.campaignEnd}: {formatToIST(spinWinStatus.ends_at, { dateStyle: 'medium', timeStyle: 'short' })}</Text>
                    )}
                    {!spinWinStatus.eligible && (
                      <Text style={styles.validationText}>
                        {spinWinStatus.eligibility_reason || t.notEligibleForSpin}
                      </Text>
                    )}
                    {!!spinWinStatus.latest_reward && (
                      <Text style={styles.hint}>
                        {t.lastReward}: {spinWinStatus.latest_reward.prize_label || t.rewardFallback} ({spinWinStatus.latest_reward.reward_type || '-'})
                      </Text>
                    )}
                  </>
                )}

                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={spinNow}
                    disabled={
                      spinningNow
                      || spinWinLoading
                      || !spinWinStatus?.eligible
                      || Number(spinWinStatus?.spins_left_today || 0) <= 0
                    }>
                    <Text style={styles.actionText}>
                      {spinningNow ? t.spinning : t.spinNow}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButtonMuted}
                    onPress={() => refreshSpinWinStatus({ silent: false })}
                    disabled={spinWinLoading}>
                    <Text style={styles.actionText}>
                      {spinWinLoading ? t.refreshing : t.refresh}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {activePassengerMenu === 'ride' && renderPassengerQuickBooking()}

            {false && activePassengerMenu === 'ride' && (
              <>
                <View style={[styles.infoBlock, isMobileWeb && styles.infoBlockMobile]}>
                  <View style={[styles.rideModeRow, isMobileWeb && styles.rideModeRowMobile]}>
                    <Text style={[styles.infoTitle, isMobileWeb && styles.infoTitleMobile]}>{showInteractiveMap ? 'Interactive Map' : 'Search Location'}</Text>
                    <TouchableOpacity
                      style={[
                        styles.button,
                        isMobileWeb && styles.mapToggleButtonMobile,
                        {
                          paddingVertical: 8,
                          paddingHorizontal: 16,
                          backgroundColor: showInteractiveMap ? COLORS.primary : COLORS.mutedDark,
                        },
                      ]}
                      onPress={() => setShowInteractiveMap(!showInteractiveMap)}>
                      <Text style={[styles.buttonText, { fontSize: 13 }]}> 
                        {showInteractiveMap ? t.hide : t.show || (showInteractiveMap ? 'Hide' : 'Show')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {showInteractiveMap && (
                    <Text style={[styles.hint, { marginBottom: 12, fontWeight: '500', color: COLORS.primary }, isMobileWeb && styles.mapPickHintMobile]}> 
                      {t.tapMapToSelect || `Tap map to pick ${selectingPoint}`}
                    </Text>
                  )}
                  {isMobileWeb && (
                    <View style={styles.mobileRideSummary}>
                      <Text style={styles.mobileRideSummaryText} numberOfLines={1}>
                        {t.pickupSearch}: {pickupLocation?.address || pickupQuery || 'Not selected'}
                      </Text>
                      <Text style={styles.mobileRideSummaryText} numberOfLines={1}>
                        {t.dropSearch}: {dropoffLocation?.address || dropoffQuery || 'Not selected'}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={[styles.selectedBlock, isMobileWeb && styles.selectedBlockMobile]}>
                  <View style={styles.pickupLabelRow}>
                    <Text style={[styles.infoTitle, isMobileWeb && styles.infoTitleMobile]}>{t.pickupSearch}</Text>
                    <TouchableOpacity
                      style={[styles.currentLocationInlineButton, isMobileWeb && styles.currentLocationInlineButtonMobile]}
                      onPress={() => autofillPickupFromCurrentLocation({ silent: false })}
                      disabled={loading || locatingPickup}>
                      <Text style={styles.currentLocationInlineText}>
                        {locatingPickup ? t.fetching : t.useCurrent}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <SavedPlacesQuickSelect
                    token={token}
                    selectingFor="pickup"
                    onSelectPlace={(place) => {
                      const loc = {
                        latitude: Number(place?.latitude),
                        longitude: Number(place?.longitude),
                        address: String(place?.address || place?.name || '').trim(),
                      };
                      setLocationForPoint('pickup', loc);
                    }}
                  />
                  <VoiceTextInput
                    style={[styles.input, isMobileWeb && styles.inputMobile]}
                    value={pickupQuery}
                    onChangeText={(text) => handleSearchTextChange('pickup', text)}
                    placeholder={t.pickupPlaceholder}
                    placeholderTextColor={COLORS.textMuted}
                  />
                  {searchingPickup && <Text style={styles.hint}>{t.searchingPickup}</Text>}
                  {pickupSuggestions.map((item) => (
                    <TouchableOpacity
                      key={`pickup-${item.placeId}`}
                      style={styles.suggestion}
                      onPress={() => handleSelectSuggestion('pickup', item)}>
                      <Text style={styles.suggestionText}>{item.description}</Text>
                    </TouchableOpacity>
                  ))}
                  {locationValidation.pickup && (
                    <Text style={styles.validationText}>{t.pickupRequired}</Text>
                  )}
                </View>

                <View style={[styles.selectedBlock, isMobileWeb && styles.selectedBlockMobile]}>
                  <Text style={[styles.infoTitle, isMobileWeb && styles.infoTitleMobile]}>{t.dropSearch}</Text>
                  <SavedPlacesQuickSelect
                    token={token}
                    selectingFor="dropoff"
                    onSelectPlace={(place) => {
                      const loc = {
                        latitude: Number(place?.latitude),
                        longitude: Number(place?.longitude),
                        address: String(place?.address || place?.name || '').trim(),
                      };
                      setLocationForPoint('dropoff', loc);
                    }}
                  />
                  <VoiceTextInput
                    style={[styles.input, isMobileWeb && styles.inputMobile]}
                    value={dropoffQuery}
                    onChangeText={(text) => handleSearchTextChange('dropoff', text)}
                    placeholder={t.dropPlaceholder}
                    placeholderTextColor={COLORS.textMuted}
                  />
                  {searchingDropoff && <Text style={styles.hint}>{t.searchingDrop}</Text>}
                  {dropoffSuggestions.map((item) => (
                    <TouchableOpacity
                      key={`drop-${item.placeId}`}
                      style={styles.suggestion}
                      onPress={() => handleSelectSuggestion('dropoff', item)}>
                      <Text style={styles.suggestionText}>{item.description}</Text>
                    </TouchableOpacity>
                  ))}
                  {locationValidation.dropoff && (
                    <Text style={styles.validationText}>{t.dropRequired}</Text>
                  )}
                </View>

                <TouchableOpacity
                  style={[styles.bookingButton, isMobileWeb && styles.bookingButtonMobile, { backgroundColor: COLORS.primary, marginVertical: 12 }]}
                  onPress={() => setShowBookingFlow(true)}
                  disabled={!pickupLocation || !dropoffLocation}>
                  <Text style={[styles.actionText, { color: 'white', fontSize: 16, fontWeight: '700' }]}> 
                    {t.continueToRideDetails || 'Continue to ride details'}
                  </Text>
                </TouchableOpacity>
                {(!pickupLocation || !dropoffLocation) && (
                  <Text style={styles.hint}>{t.selectPickupAndDropFirst || 'Select pickup and dropoff first to continue.'}</Text>
                )}
              </>)}

            {SHOW_LEGACY_ONE_PAGE_BOOKING_FLOW && activePassengerMenu === 'ride' && (
              <>
                {/* PHASE 3A: Simplified UI - removed redundant InteractiveMap component */}
                {/* Use top WebGoogleLiveMap for visual reference, text search below for location selection */}

                {/* Interactive Map Toggle & Instructions */}
                <View style={styles.infoBlock}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <Text style={styles.infoTitle}>{showInteractiveMap ? 'Interactive Map' : 'Search Location'}</Text>
                    <TouchableOpacity
                      style={[
                        styles.button,
                        {
                          paddingVertical: 8,
                          paddingHorizontal: 16,
                          backgroundColor: showInteractiveMap ? COLORS.primary : COLORS.mutedDark,
                        },
                      ]}
                      onPress={() => setShowInteractiveMap(!showInteractiveMap)}>
                      <Text style={[styles.buttonText, { fontSize: 13 }]}>
                        {showInteractiveMap ? t.hide : t.show || (showInteractiveMap ? 'Hide' : 'Show')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {showInteractiveMap && (
                    <Text style={[styles.hint, { marginBottom: 12, fontWeight: '500', color: COLORS.primary }]}>
                      {t.tapMapToSelect || `Tap map to pick ${selectingPoint}`}
                    </Text>
                  )}
                </View>

                {/* Show text search + interactive map mode */}
                <>
                  <View style={styles.selectedBlock}>
                  <View style={styles.pickupLabelRow}>
                    <Text style={styles.infoTitle}>{t.pickupSearch}</Text>
                    <TouchableOpacity
                      style={styles.currentLocationInlineButton}
                      onPress={() => autofillPickupFromCurrentLocation({ silent: false })}
                      disabled={loading || locatingPickup}>
                      <Text style={styles.currentLocationInlineText}>
                        {locatingPickup ? t.fetching : t.useCurrent}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <SavedPlacesQuickSelect
                    token={token}
                    selectingFor="pickup"
                    onSelectPlace={(place) => {
                      const loc = {
                        latitude: Number(place?.latitude),
                        longitude: Number(place?.longitude),
                        address: String(place?.address || place?.name || '').trim(),
                      };
                      setLocationForPoint('pickup', loc);
                    }}
                  />
                  <VoiceTextInput
                    style={styles.input}
                    value={pickupQuery}
                    onChangeText={(text) => handleSearchTextChange('pickup', text)}
                    placeholder={t.pickupPlaceholder}
                    placeholderTextColor={COLORS.textMuted}
                  />
                  {searchingPickup && <Text style={styles.hint}>{t.searchingPickup}</Text>}
                  {pickupSuggestions.map((item) => (
                    <TouchableOpacity
                      key={`pickup-${item.placeId}`}
                      style={styles.suggestion}
                      onPress={() => handleSelectSuggestion('pickup', item)}>
                      <Text style={styles.suggestionText}>{item.description}</Text>
                    </TouchableOpacity>
                  ))}
                  {locationValidation.pickup && (
                    <Text style={styles.validationText}>{t.pickupRequired}</Text>
                  )}
                </View>

                <View style={styles.selectedBlock}>
                  <Text style={styles.infoTitle}>{t.dropSearch}</Text>
                  <SavedPlacesQuickSelect
                    token={token}
                    selectingFor="dropoff"
                    onSelectPlace={(place) => {
                      const loc = {
                        latitude: Number(place?.latitude),
                        longitude: Number(place?.longitude),
                        address: String(place?.address || place?.name || '').trim(),
                      };
                      setLocationForPoint('dropoff', loc);
                    }}
                  />
                  <VoiceTextInput
                    style={styles.input}
                    value={dropoffQuery}
                    onChangeText={(text) => handleSearchTextChange('dropoff', text)}
                    placeholder={t.dropPlaceholder}
                    placeholderTextColor={COLORS.textMuted}
                  />
                  {searchingDropoff && <Text style={styles.hint}>{t.searchingDrop}</Text>}
                  {dropoffSuggestions.map((item) => (
                    <TouchableOpacity
                      key={`drop-${item.placeId}`}
                      style={styles.suggestion}
                      onPress={() => handleSelectSuggestion('dropoff', item)}>
                      <Text style={styles.suggestionText}>{item.description}</Text>
                    </TouchableOpacity>
                  ))}
                  {locationValidation.dropoff && (
                    <Text style={styles.validationText}>{t.dropRequired}</Text>
                  )}
                </View>
                  </>
                {/* Trip summary removed per UI request */}
                <View style={styles.infoBlock}>
                  <Text style={styles.infoTitle}>{t.rideType || 'Ride Type'}</Text>
                  {!!rideProductAvailability?.pickup_district && (
                    <Text style={styles.hint}>
                      {t.districtLabel}: {rideProductAvailability.pickup_district}
                    </Text>
                  )}
                  
                  {/* NEW TWO-SCREEN BOOKING FLOW - PRIMARY INTERFACE */}
                  <TouchableOpacity 
                    style={[styles.bookingButton, { backgroundColor: COLORS.primary, marginVertical: 12 }]}
                    onPress={() => setShowBookingFlow(true)}>
                    <Text style={[styles.actionText, { color: 'white', fontSize: 16, fontWeight: '700' }]}>
                      🚗 Book Ride (Select Vehicle & Location)
                    </Text>
                  </TouchableOpacity>
                  
                  <Text style={{ fontSize: 12, color: COLORS.gray, textAlign: 'center', marginVertical: 8 }}>
                    OR select ride type below
                  </Text>

                  {rideProductsLoading && (
                    <Text style={styles.hint}>{t.updateRideProducts}</Text>
                  )}
                  <RideProductsGrid
                    selected={effectiveRideProduct}
                    enabledKeys={enabledRideProducts}
                    hideInactive
                    heading={t.chooseRideProduct}
                    subheading={t.chooseRideProductMl}
                    labels={rideProductLabels}
                    onSelect={handleRideProductSelect}
                  />

                  {/* Vehicle Type Selector - HIDDEN (replaced by new flow) */}
                  {false && (
                  <View style={[styles.infoBlock, { marginTop: 16, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 16 }]}>
                    <Text style={styles.infoTitle}>{t.vehicleType || 'Vehicle Type'}</Text>
                    {vehicleTypesLoading ? (
                      <ActivityIndicator size="small" color={COLORS.primary} />
                    ) : (
                      <ScrollView 
                        horizontal 
                        style={{ marginVertical: 12 }}
                        showsHorizontalScrollIndicator={false}
                      >
                        {availableVehicleTypes && availableVehicleTypes.map((type) => {
                          const typeId = getVehicleTypeId(type);
                          const active = effectiveSelectedVehicleTypeId === typeId;
                          return (
                            <TouchableOpacity
                              key={typeId || getVehicleTypeName(type)}
                              style={[
                                styles.vehicleTypeChip,
                                active && styles.vehicleTypeChipActive,
                              ]}
                              onPress={() => handleVehicleTypeSelect(type)}
                            >
                              <Text style={styles.vehicleTypeChipIcon}>{type.icon}</Text>
                              <Text
                                style={[
                                  styles.vehicleTypeChipText,
                                  active && styles.vehicleTypeChipTextActive,
                                ]}
                              >
                                {type.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                  </View>
                  )}

                  {/* PHASE 1 FIX: Inline driver selection (max 5) - Reduces taps from 6-7 to 2 */}
                  {pickupLocation && dropoffLocation && visibleDrivers.length > 0 && (
                    <View style={[styles.infoBlock, { backgroundColor: '#F0F7F5', borderLeftWidth: 3, borderLeftColor: COLORS.primary }]}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text style={styles.infoTitle}>
                          {t.drivers || 'Available Drivers'} ({visibleDrivers.length})
                        </Text>
                        {visibleDrivers.length > 3 && (
                          <TouchableOpacity
                            style={styles.driverChip}
                            onPress={() => setActivePassengerMenu('drivers')}>
                            <Text style={styles.driverChipText}>View All</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                      {visibleDrivers.slice(0, 5).map((driver) => (
                        <TouchableOpacity
                          key={driver.driver_id}
                          style={[
                            styles.inlineDriverRow,
                            selectedDriverId === driver.driver_id && styles.inlineDriverRowSelected,
                          ]}
                          onPress={() =>
                            setSelectedDriverId((prev) => (prev === driver.driver_id ? '' : driver.driver_id))
                          }>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.driverNameText}>{driver.name}</Text>
                            <Text style={styles.infoText}>
                              {Number(driver.distance_km || 0).toFixed(2)} km | ⭐ {driver.rating}
                            </Text>
                            <Text style={styles.infoText}>
                              ₹{estimateDriverFare(driver).toFixed(2)}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={[
                              styles.driverSelectChip,
                              selectedDriverId === driver.driver_id && styles.driverSelectChipSelected,
                            ]}
                            onPress={() =>
                              setSelectedDriverId((prev) => (prev === driver.driver_id ? '' : driver.driver_id))
                            }>
                            <Text style={[
                              styles.driverChipText,
                              selectedDriverId === driver.driver_id && styles.driverChipTextSelected,
                            ]}>
                              {selectedDriverId === driver.driver_id ? '✓' : 'Select'}
                            </Text>
                          </TouchableOpacity>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {isScheduledBookingMode && (
                    <View>
                      <ScheduledPickupPicker
                        value={scheduledAtInput}
                        onChangeText={setScheduledAtInput}
                        timezone={scheduledTimeZone}
                        onTimezoneChange={setScheduledTimeZone}
                        inputStyle={styles.input}
                        labels={{
                          title: t.setPickupTime,
                          date: t.date || 'Date',
                          time: t.time || 'Time',
                          timezone: t.timezone || 'Timezone',
                          manual: t.manual || 'Manual',
                          ready: t.ready || 'Ready',
                        }}
                        messages={{
                          required: t.selectPickupTimeScheduled,
                          invalid: t.enterValidPickupDateTime,
                          future: t.scheduledPickupFuture,
                        }}
                      />
                      <Text style={styles.infoText}>Driver Gender Preference</Text>
                      <View style={styles.modeRow}>
                        {DRIVER_GENDER_OPTIONS.map((option) => (
                          <TouchableOpacity
                            key={option.value}
                            style={[
                              styles.modeChip,
                              effectiveScheduledDriverGenderPreference === option.value && styles.modeChipActive,
                            ]}
                            onPress={() => setScheduledDriverGenderPreference(option.value)}>
                            <Text
                              style={[
                                styles.modeChipText,
                                effectiveScheduledDriverGenderPreference === option.value && styles.modeChipTextActive,
                              ]}>
                              {option.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}

                  <Text style={styles.infoText}>{t.passengerCount || 'Passengers'} (optional)</Text>
                  <VoiceTextInput
                    style={styles.input}
                    value={passengerCountInput}
                    onChangeText={setPassengerCountInput}
                    keyboardType="number-pad"
                    placeholder={t.passengerCountPlaceholder || 'Passenger count (1-6, optional)'}
                    placeholderTextColor={COLORS.textMuted}
                  />

                  {effectiveRideProduct === 'corporate' && (
                    <View style={{ backgroundColor: '#FFF3E0', borderLeftWidth: 3, borderLeftColor: '#FF9800', paddingLeft: 8, paddingRight: 8, paddingVertical: 6, borderRadius: 4, marginVertical: 8 }}>
                      <Text style={{ fontSize: 11, color: '#E65100', fontWeight: '600', marginBottom: 4 }}>
                        {t.corporateDetailsTitle || 'Corporate details'}
                      </Text>
                      <VoiceTextInput
                        style={styles.input}
                        value={corporateCode}
                        onChangeText={setCorporateCode}
                        placeholder={t.corporateCodePlaceholder}
                        placeholderTextColor={COLORS.textMuted}
                      />
                      <VoiceTextInput
                        style={styles.input}
                        value={corporatePurpose}
                        onChangeText={setCorporatePurpose}
                        placeholder={t.corporatePurposePlaceholder || 'Trip purpose (optional)'}
                        placeholderTextColor={COLORS.textMuted}
                      />
                      <VoiceTextInput
                        style={styles.input}
                        value={corporateCostCenterId}
                        onChangeText={setCorporateCostCenterId}
                        placeholder={t.corporateCostCenterPlaceholder || 'Cost center / project code (optional)'}
                        placeholderTextColor={COLORS.textMuted}
                      />
                    </View>
                  )}

                  {/* PHASE 1 FIX: Highlight airport fields */}
                  {effectiveRideProduct === 'airport' && (
                    <View style={{ backgroundColor: '#FFF3E0', borderLeftWidth: 3, borderLeftColor: '#FF9800', paddingLeft: 8, paddingRight: 8, paddingVertical: 8, borderRadius: 4, marginVertical: 8 }}>
                      <Text style={{ fontSize: 11, color: '#E65100', fontWeight: '600', marginBottom: 6 }}>
                        ⚠️ AIRPORT DETAILS REQUIRED
                      </Text>
                      <VoiceTextInput
                        style={[styles.input, { marginBottom: 6 }]}
                        value={flightNumber}
                        onChangeText={setFlightNumber}
                        placeholder={t.flightNumberPlaceholder || 'Flight Number (e.g., AI123)'}
                        placeholderTextColor={COLORS.textMuted}
                      />
                      <VoiceTextInput
                        style={styles.input}
                        value={airportTerminal}
                        onChangeText={setAirportTerminal}
                        placeholder={t.airportTerminalPlaceholder || 'Terminal (e.g., T1, T2)'}
                        placeholderTextColor={COLORS.textMuted}
                      />
                    </View>
                  )}

                  {effectiveRideProduct === 'intercity' && (
                    <View>
                      <TouchableOpacity
                        style={[styles.modeChip, intercityReturnTrip && styles.modeChipActive]}
                        onPress={() => setIntercityReturnTrip((prev) => !prev)}
                        disabled={loading}>
                        <Text style={[styles.modeChipText, intercityReturnTrip && styles.modeChipTextActive]}>
                          {intercityReturnTrip ? t.returnTripYes : t.returnTripNo}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.modeChip, intercityTollsIncluded && styles.modeChipActive]}
                        onPress={() => setIntercityTollsIncluded((prev) => !prev)}
                        disabled={loading}>
                        <Text style={[styles.modeChipText, intercityTollsIncluded && styles.modeChipTextActive]}>
                          {intercityTollsIncluded
                            ? t.intercityTollsIncluded || 'Tolls included'
                            : t.intercityTollsExtra || 'Tolls extra'}
                        </Text>
                      </TouchableOpacity>
                      <VoiceTextInput
                        style={styles.input}
                        value={intercityWaitHoursInput}
                        onChangeText={(value) => setIntercityWaitHoursInput(value.replace(/[^0-9]/g, '').slice(0, 2))}
                        placeholder={t.intercityWaitHoursPlaceholder || 'Outstation wait hours (0 to 72)'}
                        placeholderTextColor={COLORS.textMuted}
                        keyboardType="numeric"
                      />
                      <VoiceTextInput
                        style={[styles.input, styles.assistedNotesInput]}
                        value={intercityRouteNotes}
                        onChangeText={(value) => setIntercityRouteNotes(value.slice(0, 240))}
                        placeholder={t.intercityRouteNotesPlaceholder || 'Route notes (optional)'}
                        placeholderTextColor={COLORS.textMuted}
                        multiline
                        numberOfLines={2}
                      />
                      <Text style={styles.hint}>Intercity uses Taxi, XL, or Traveller for outstation travel.</Text>
                    </View>
                  )}

                  {effectiveRideProduct === 'tourism' && (
                    <View style={styles.tourismInlineSection}>{renderTourismFields()}</View>
                  )}

                  {effectiveRideProduct === 'women_only' && renderWomenOnlyFields()}

                  {effectiveRideProduct === 'rental_hourly' && (
                    <VoiceTextInput
                      style={styles.input}
                      value={rentalHoursInput}
                      onChangeText={setRentalHoursInput}
                      keyboardType="number-pad"
                      placeholder={t.rentalHoursPlaceholder}
                      placeholderTextColor={COLORS.textMuted}
                    />
                  )}

                  {effectiveRideProduct === 'school_elderly_safe' && renderAssistedRideFields()}

                  <PromoCodePanel
                    token={token}
                    rideFare={Number(fare?.total_fare || 1)}
                    onDiscountApplied={handlePromoDiscountApplied}
                    embedded
                    compact
                    title="Promo Code"
                    disabled={!fare}
                    disabledMessage="Choose pickup and drop to calculate fare before applying a promo."
                  />

                  <View style={styles.infoBlock}>
                    <Text style={styles.infoTitle}>Booking Preferences</Text>
                    <Text style={styles.infoText}>Payment: {paymentMethodLabel}</Text>
                    {!!selectedPaymentChannel && (
                      <Text style={styles.hint}>Channel: {String(selectedPaymentChannel).toUpperCase()}</Text>
                    )}
                    {isScheduledBookingMode && (
                      <Text style={styles.hint}>
                        Driver: {driverGenderPreferenceLabel(effectiveScheduledDriverGenderPreference)}
                      </Text>
                    )}
                    {appliedPromo?.code ? (
                      <Text style={styles.infoText}>
                        Promo: {appliedPromo.code}
                        {appliedPromo.discount > 0 ? ` (${appliedPromo.discount}${appliedPromo.discount_type === 'percentage' ? '%' : ''} off)` : ''}
                      </Text>
                    ) : (
                      <Text style={styles.hint}>No promo code applied</Text>
                    )}
                    {!!passengerPreferences?.language && (
                      <Text style={styles.hint}>Preference language: {String(passengerPreferences.language).toUpperCase()}</Text>
                    )}
                  </View>
                </View>
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: COLORS.primary }]}
                    onPress={() => setShowBookingFlow(true)}>
                    <Text style={styles.actionText}>📱 Book New Ride (Two-Screen Flow)</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.actionsRow}>
                  <TouchableOpacity style={styles.actionButton} onPress={createBooking} disabled={loading}>
                    <Text style={styles.actionText}>
                      {effectiveRideProduct === 'scheduled'
                        ? t.scheduleRide
                        : selectedDriverId
                          ? t.bookSelectedDriver
                          : t.bookAuto}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButtonMuted}
                    onPress={refreshPassengerDashboard}
                    disabled={loading}>
                    <Text style={styles.actionText}>{t.refresh}</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {activePassengerMenu === 'drivers' && (
              <>
                {fare && (
                  <View style={styles.infoBlock}>
                    <Text style={styles.infoTitle}>{t.fareEstimate}</Text>
                    <Text style={styles.infoText}>
                      INR {fare.total_fare} | {fare.distance_km} km | surge {fare.surge_multiplier}x
                    </Text>
                    <VoiceTextInput
                      style={styles.input}
                      value={fareExpectationInput}
                      onChangeText={setFareExpectationInput}
                      keyboardType="decimal-pad"
                      placeholder={t.maxFareExpectationPlaceholder}
                      placeholderTextColor={COLORS.textMuted}
                    />
                    {!!fareExpectation && (
                      <Text style={styles.hint}>{t.showingDriversUpToFare} {fareExpectation.toFixed(2)}</Text>
                    )}
                  </View>
                )}

                {nearbyDrivers.length > 0 ? (
                  <View style={styles.infoBlock}>
                    <View style={styles.driverHeaderRow}>
                      <Text style={styles.infoTitle}>{t.nearestDriversTop}</Text>
                      {optedOutDriverIds.length > 0 && (
                        <TouchableOpacity style={styles.driverChip} onPress={resetDriverOptOuts}>
                          <Text style={styles.driverChipText}>{t.resetOptOuts}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    {visibleDrivers.map((driver) => {
                      const driverFare = estimateDriverFare(driver);
                      const showDriverFare =
                        Number(driver?.projected_fare || 0) > 0 || Number(fare?.total_fare || 0) > 0;
                      return (
                      <View key={driver.driver_id} style={styles.driverRow}>
                        <View style={styles.driverInfoBlock}>
                          <Text style={styles.driverNameText}>
                            {driver.name}
                            {driver.source === 'favorite_fallback' ? ` (${t.favoriteOutsideNearby})` : ''}
                          </Text>
                          <Text style={styles.infoText}>
                            {Number(driver.distance_km || 0).toFixed(2)} km | {t.rating} {driver.rating}
                          </Text>
                          {showDriverFare && (
                            <Text style={styles.infoText}>
                              {t.projectedFare}: INR {driverFare.toFixed(2)}
                            </Text>
                          )}
                          {Number(driver.pickup_surcharge || 0) > 0 && (
                            <Text style={styles.infoText}>
                              {t.extraPickupCharge}: INR {Number(driver.pickup_surcharge || 0).toFixed(2)}
                            </Text>
                          )}
                        </View>
                        <View style={styles.driverActionBlock}>
                          <TouchableOpacity
                            style={[
                              styles.driverChip,
                              selectedDriverId === driver.driver_id && styles.driverChipSelected,
                            ]}
                            onPress={() =>
                              setSelectedDriverId((prev) => (prev === driver.driver_id ? '' : driver.driver_id))
                            }>
                            <Text
                              style={[
                                styles.driverChipText,
                                selectedDriverId === driver.driver_id && styles.driverChipTextSelected,
                              ]}>
                              {selectedDriverId === driver.driver_id ? t.selected : t.select}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.driverChip}
                            onPress={() => toggleFavoriteDriver(driver.driver_id, favoriteDriverIds.includes(driver.driver_id))}>
                            <Text style={styles.driverChipText}>
                              {favoriteDriverIds.includes(driver.driver_id) ? t.unfavorite : t.favorite}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.driverChip}
                            onPress={() => toggleBlockedDriver(driver.driver_id, blockedDriverIds.includes(driver.driver_id))}>
                            <Text style={styles.driverChipText}>
                              {blockedDriverIds.includes(driver.driver_id) ? t.unblock : t.block}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.driverChip} onPress={() => optOutDriver(driver.driver_id)}>
                            <Text style={styles.driverChipText}>{t.optOut}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                      );
                    })}
                    {visibleDrivers.length === 0 && (
                      <Text style={styles.hint}>
                        {t.noDriversMatchFare}
                      </Text>
                    )}
                  </View>
                ) : (
                  <View style={styles.infoBlock}>
                    <Text style={styles.infoText}>{t.noNearbyDrivers}</Text>
                  </View>
                )}

                {blockedDriverIds.length > 0 && (
                  <View style={styles.infoBlock}>
                    <Text style={styles.infoTitle}>{t.blockedDrivers}</Text>
                    {blockedDriverIds.slice(0, 8).map((driverId) => (
                      <View key={driverId} style={styles.blockedRow}>
                        <Text style={styles.infoText}>{driverId}</Text>
                        <TouchableOpacity style={styles.driverChip} onPress={() => toggleBlockedDriver(driverId, true)}>
                          <Text style={styles.driverChipText}>{t.unblock}</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}

            {activePassengerMenu === 'live' && (
              <>
                {activeBooking ? (
                  <FadeSlideView>
                    <GlassCard style={styles.premiumCallout}>
                      <LiveEtaPulse eta={liveEtaLabel} />
                      <Text style={styles.premiumTitle}>{t.yourAutoBuddyOnTheWay}</Text>
                      <Text style={styles.premiumMalayalam}>{t.liveTripUpdates}</Text>
                    </GlassCard>
                  </FadeSlideView>
                ) : (
                  <PremiumEmptyState
                    title={t.noActiveRide}
                    subtitle={t.noActiveRideSubtitle}
                    malayalam={t.noActiveRideMl}
                  />
                )}

                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={styles.actionButtonMuted}
                    onPress={refreshPassengerDashboard}
                    disabled={loading}>
                    <Text style={styles.actionText}>{t.refresh}</Text>
                  </TouchableOpacity>
                </View>

                {activeBooking && (
                  <>
                    {/* Live map visualization with driver tracking */}
                      {(activeBookingStatus === 'driver_arrived' || activeBookingStatus === 'in_progress') && (
                      <View style={{ marginVertical: 12, borderRadius: 12, overflow: 'hidden' }}>
                        <WebLeafletMap
                          driverLocation={liveDriverLocation}
                          pickupLocation={normalizeLocation(activeBooking.pickup_location)}
                          dropoffLocation={normalizeLocation(activeBooking.drop_location || activeBooking.dropoff_location)}
                          showStatusOverlay={false}
                        />
                      </View>
                    )}
                    <RideProgressTimeline status={activeBookingStatus || 'searching'} />
                    <View style={styles.infoBlock}>
                      <Text style={styles.infoTitle}>{t.activeBooking}</Text>
                      <Text style={styles.infoText}>{t.id}: {activeBooking.id}</Text>
                      <Text style={styles.infoText}>{t.status}: {activeBookingStatus || activeBooking.status}</Text>
                      {!!activeBooking.driver_name && (
                        <Text style={styles.infoText}>{t.driver}: {activeBooking.driver_name}</Text>
                      )}
                      {!!normalizeLocation(activeBooking.pickup_location) && (
                        <Text style={styles.infoText}>
                          {t.from}: {normalizeLocation(activeBooking.pickup_location).address}
                        </Text>
                      )}
                      {!!normalizeLocation(activeBooking.drop_location || activeBooking.dropoff_location) && (
                        <Text style={styles.infoText}>
                          {t.to}: {normalizeLocation(activeBooking.drop_location || activeBooking.dropoff_location).address}
                        </Text>
                      )}
                      {/* Prominently display ETA */}
                      {(activeBookingStatus === 'driver_arrived' || activeBookingStatus === 'in_progress') && (etaToPickup || etaToDrop) && (
                        <View style={{ backgroundColor: COLORS.secondary, borderRadius: 8, padding: 12, marginVertical: 8 }}>
                          <Text style={{ color: COLORS.mutedDark, fontSize: 12, fontWeight: '600', marginBottom: 4 }}>
                            {activeBookingStatus === 'driver_arrived' ? 'ETA to Pickup' : 'ETA to Dropoff'}
                          </Text>
                          <Text style={{ color: COLORS.primary, fontSize: 20, fontWeight: 'bold' }}>
                            {activeBookingStatus === 'driver_arrived' ? etaToPickup : etaToDrop} min
                          </Text>
                        </View>
                      )}
                      {!!liveDriverLocation && (
                        <Text style={styles.infoText}>
                          {t.driverLiveLocation}: {driverLiveLocationLabel}
                        </Text>
                      )}
                      {(activeBookingStatus === 'driver_arrived' && !!activeRideStartOtp) || (activeBookingStatus === 'in_progress' && !!activeRideEndOtp) ? (
                        <View style={[styles.infoBlock, { backgroundColor: COLORS.secondary, borderRadius: 8, padding: 12, marginVertical: 8 }]}>
                          <Text style={[styles.infoTitle, { fontSize: 14, marginBottom: 6 }]}>
                            {activeBookingStatus === 'driver_arrived' ? t.shareOtpWithDriver : t.shareCompletionOtpWithDriver}
                          </Text>
                          <Text style={[styles.infoText, { fontSize: 20, fontWeight: 'bold', letterSpacing: 2 }]}>
                            {activeBookingStatus === 'driver_arrived' ? activeRideStartOtp : activeRideEndOtp}
                          </Text>
                          <TouchableOpacity
                            onPress={() => {
                              const otpValue = activeBookingStatus === 'driver_arrived' ? activeRideStartOtp : activeRideEndOtp;
                              if (navigator.clipboard) {
                                navigator.clipboard.writeText(otpValue);
                                setMessage(t.otpCopied || 'OTP copied to clipboard');
                              }
                            }}
                            style={styles.actionButtonMuted}>
                            <Text style={styles.actionText}>{t.copy || 'Copy'}</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                      <Text style={styles.infoText}>{t.fareLabel}: INR {activeBooking.estimated_fare}</Text>
                      {Number(activeBooking.pickup_surcharge || 0) > 0 && (
                        <Text style={styles.infoText}>
                          {t.includesPickupSurcharge}: INR {Number(activeBooking.pickup_surcharge || 0).toFixed(2)}
                        </Text>
                      )}
                      <View style={styles.rideEmergencyCard}>
                        <View style={styles.rideEmergencyCopy}>
                          <Text style={styles.rideEmergencyTitle}>
                            {t.sosQuickAccess || 'SOS quick access'}
                          </Text>
                          <Text style={styles.rideEmergencyText}>
                            {t.sosQuickAccessHint || 'Tap to confirm SOS, or long-press SOS Now to activate immediately.'}
                          </Text>
                        </View>
                        <View style={styles.rideEmergencyActions}>
                          <TouchableOpacity
                            style={[styles.rideEmergencyButton, keralaSafety.busy && styles.rideEmergencyButtonDisabled]}
                            onPress={confirmRideSos}
                            onLongPress={activateRideSos}
                            disabled={keralaSafety.busy}
                            accessibilityRole="button"
                            accessibilityLabel={t.activateSosForRide || 'Activate SOS for this ride'}>
                            <Text style={styles.rideEmergencyButtonText}>
                              {keralaSafety.busy ? (t.sending || 'Sending...') : (t.sosNow || 'SOS Now')}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.rideEmergencySecondaryButton}
                            onPress={openRideEmergencyPanel}
                            accessibilityRole="button"
                            accessibilityLabel={t.openEmergencyContacts || 'Open emergency contacts'}>
                            <Text style={styles.rideEmergencySecondaryText}>{t.contacts || 'Contacts'}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                      {canCancelActiveBooking ? (
                        <TouchableOpacity onPress={cancelBooking} style={styles.cancelButton} disabled={loading}>
                          <Text style={styles.cancelText}>{t.cancelBooking}</Text>
                        </TouchableOpacity>
                      ) : (
                        <Text style={styles.infoText}>{t.cancellationDisabledAfterAccept}</Text>
                      )}
                      <RideCommunicationCard
                        token={token}
                        booking={activeBooking}
                        currentUserId={user?.id}
                        counterpartName={activeBooking.driver_name || t.driver}
                      />
                    </View>
                  </>
                )}
              </>
            )}
            {activePassengerMenu === 'history' && (
              <View style={styles.infoBlock}>
                <View style={styles.driverHeaderRow}>
                  <Text style={styles.infoTitle}>{t.rideHistory}</Text>
                  <TouchableOpacity
                    style={styles.driverChip}
                    onPress={() => refreshPassengerBookings({ silent: false })}
                    disabled={loading}>
                    <Text style={styles.driverChipText}>{t.refresh}</Text>
                  </TouchableOpacity>
                </View>
                {passengerBookings.length === 0 ? (
                  <PremiumEmptyState
                    title={t.noRidesYet}
                    subtitle={t.ridesHistorySubtitle}
                    malayalam={t.ridesHistorySubtitle}
                  />
                ) : (
                  <>
                    {passengerBookings.map((booking) => {
                      const historyDriverId = booking.driver_id;
                      const isFavoriteDriver = !!historyDriverId && favoriteDriverIds.includes(historyDriverId);
                      const isBlockedDriver = !!historyDriverId && blockedDriverIds.includes(historyDriverId);
                      return (
                      <View key={booking.id} style={[styles.historyCard, { borderLeftColor: booking.status === 'completed' ? '#4CAF50' : booking.status === 'cancelled' ? '#F44336' : '#2196F3', borderLeftWidth: 4 }]}>
                        <View style={styles.historyCardRow}>
                          <Text style={styles.historyCardStatus}>{booking.status.toUpperCase()}</Text>
                          <Text style={styles.historyCardId}>{booking.id.substring(0, 8)}</Text>
                        </View>
                        <View style={styles.historyCardRow}>
                          <Text style={styles.historyCardDriver}>{booking.driver_name || t.driverNotAssigned}</Text>
                          <Text style={styles.historyCardFare}>INR {booking.estimated_fare}</Text>
                        </View>
                        {!!booking.pickup_location && !!booking.drop_location && (
                          <Text style={styles.historyCardRoute} numberOfLines={1}>
                            {normalizeLocation(booking.pickup_location)?.address || 'Pickup'} → {normalizeLocation(booking.drop_location)?.address || 'Drop'}
                          </Text>
                        )}
                        {!!historyDriverId && (
                          <View style={styles.historyActionRow}>
                            <TouchableOpacity
                              style={[
                                styles.driverChip,
                                isFavoriteDriver && styles.driverChipSelected,
                                isBlockedDriver && styles.historyActionDisabled,
                              ]}
                              onPress={() => toggleFavoriteDriver(historyDriverId, isFavoriteDriver)}
                              disabled={loading || isBlockedDriver}>
                              <Text style={[
                                styles.driverChipText,
                                isFavoriteDriver && styles.driverChipTextSelected,
                              ]}>
                                {isFavoriteDriver ? t.unfavorite : t.favorite}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[
                                styles.driverChip,
                                isBlockedDriver && styles.driverChipSelected,
                              ]}
                              onPress={() => toggleBlockedDriver(historyDriverId, isBlockedDriver)}
                              disabled={loading}>
                              <Text style={[
                                styles.driverChipText,
                                isBlockedDriver && styles.driverChipTextSelected,
                              ]}>
                                {isBlockedDriver ? t.unblock : t.block}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                      );
                    })}
                    {historyHasMore && (
                      <TouchableOpacity 
                        style={styles.loadMoreButton}
                        onPress={loadMoreHistory}
                        disabled={loading}>
                        <Text style={styles.loadMoreText}>{loading ? 'Loading...' : 'Load More Rides'}</Text>
                      </TouchableOpacity>
                    )}
                    {!historyHasMore && passengerBookings.length > 0 && (
                      <Text style={[styles.infoText, { textAlign: 'center', marginTop: 12 }]}>All rides loaded ({passengerBookings.length} total)</Text>
                    )}
                  </>
                )}
              </View>
            )}

            {activePassengerMenu === 'notifications' && (
              <NotificationCenter
                token={token}
                onClose={() => {
                  setActivePassengerMenu(PRIMARY_PASSENGER_MENU_KEY);
                }}
                onNotificationPress={(notification) => {
                  if (notification?.bookingId) {
                    setActivePassengerMenu(PRIMARY_PASSENGER_MENU_KEY);
                  }
                }}
              />
            )}

            {activePassengerMenu === 'promo' && (
              <PromoCodePanel
                token={token}
                rideFare={Number(fare?.total_fare || activeBooking?.estimated_fare || 1)}
                onDiscountApplied={handlePromoDiscountApplied}
              />
            )}
            {activePassengerMenu === 'support' && <SupportTicketsPanel token={token} />}
            {activePassengerMenu === 'payment' && (
              <PaymentMethodsPanel token={token} onDefaultMethodChange={handleDefaultMethodChange} />
            )}
            {activePassengerMenu === 'ratings' && <PassengerRatingsPanel token={token} />}
            {activePassengerMenu === 'favorites' && (
              <FavoriteDriversPanel token={token} onFavoriteDriversChange={handleFavoriteDriversChange} />
            )}
            {activePassengerMenu === 'preferences' && (
              <PreferencesPanel token={token} onPreferencesChange={handlePreferencesChange} />
            )}
            {activePassengerMenu === 'places' && (
              <SavedPlacesPanel token={token} onUsePlace={handleUseSavedPlace} />
            )}
            {activePassengerMenu === 'emergency' && <EmergencyContactsPanel token={token} />}
            {activePassengerMenu === 'accessibility' && (
              <AccessibilityPanel token={token} onSettingsChange={handleAccessibilityChange} />
            )}
            {activePassengerMenu === 'pooling' && (
              <RidePoolingPanel
                key={`passenger-pool-${poolCreateRequest.key}`}
                userId={String(user?.id || user?.user_id || user?.email || 'passenger')}
                userType="passenger"
                currentLocation={poolPanelLocation}
                openCreateModel={poolCreateRequest.model}
                openCreateRequestKey={poolCreateRequest.key}
                createDefaults={poolCreateDefaults}
              />
            )}
            {activePassengerMenu === 'scheduled' && (
              <PassengerScheduledRidesPanel
                token={token}
                onOpenRide={() => handleMenuSelection(PRIMARY_PASSENGER_MENU_KEY, t.rideBooking)}
                onRideCancelled={async () => {
                  await refreshActiveBooking();
                  await refreshPassengerBookings({ silent: true });
                }}
              />
            )}
            {activePassengerMenu === 'family' && (
              <View style={[styles.infoBlock, isMobileWeb && styles.infoBlockMobile]}>
                <Text style={[styles.infoTitle, isMobileWeb && styles.infoTitleMobile]}>Family Booking</Text>
                <Text style={[styles.infoText, isMobileWeb && styles.infoTextMobile]}>
                  Book rides for your family members. Add family members and manage their ride preferences.
                </Text>
                <TouchableOpacity
                  style={[styles.button, isMobileWeb && styles.buttonMobile]}
                  onPress={() => {
                    setMessage('Family booking feature coming soon');
                    triggerA11yFeedback('Family booking feature coming soon');
                  }}>
                  <Text style={[styles.buttonText, isMobileWeb && styles.buttonTextMobile]}>Add Family Member</Text>
                </TouchableOpacity>
              </View>
            )}
            {activePassengerMenu === 'corporate' && (
              <View style={[styles.infoBlock, isMobileWeb && styles.infoBlockMobile]}>
                <Text style={[styles.infoTitle, isMobileWeb && styles.infoTitleMobile]}>Corporate Booking</Text>
                <Text style={[styles.infoText, isMobileWeb && styles.infoTextMobile]}>
                  Book rides for your company. Manage employee bookings and corporate accounts.
                </Text>
                <TouchableOpacity
                  style={[styles.button, isMobileWeb && styles.buttonMobile]}
                  onPress={() => {
                    setMessage('Corporate booking feature coming soon');
                    triggerA11yFeedback('Corporate booking feature coming soon');
                  }}>
                  <Text style={[styles.buttonText, isMobileWeb && styles.buttonTextMobile]}>Select Employee</Text>
                </TouchableOpacity>
              </View>
            )}
            {activePassengerMenu === 'travel' && (
              <View style={[styles.infoBlock, isMobileWeb && styles.infoBlockMobile]}>
                <Text style={[styles.infoTitle, isMobileWeb && styles.infoTitleMobile]}>Travel Packages</Text>
                <Text style={[styles.infoText, isMobileWeb && styles.infoTextMobile]}>
                  Plan multi-stop journeys and book travel packages for your entire trip.
                </Text>
                <TouchableOpacity
                  style={[styles.button, isMobileWeb && styles.buttonMobile]}
                  onPress={() => {
                    setMessage('Travel package booking coming soon');
                    triggerA11yFeedback('Travel package booking coming soon');
                  }}>
                  <Text style={[styles.buttonText, isMobileWeb && styles.buttonTextMobile]}>Plan Journey</Text>
                </TouchableOpacity>
              </View>
            )}
            {activePassengerMenu === 'profile' && <PassengerProfilePanel token={token} />}
            {activePassengerMenu === 'kyc' && <PassengerKYCPanel token={token} />}
            {activePassengerMenu === 'documents' && (
              <>
                <PassengerDocumentUpload token={token} />
                <PassengerDocumentsPanel token={token} />
              </>
            )}
            {activePassengerMenu === 'receipts' && <ReceiptsPanel token={token} />}
            {activePassengerMenu === 'subscription' && <SubscriptionPanel token={token} />}
            {activePassengerMenu === 'notes' && (
              <RideNotesPanel
                token={token}
                bookingId={activeBooking?.id}
                onNotesUpdated={() => {
                  setMessage('Ride notes updated');
                }}
              />
            )}
            {activePassengerMenu === 'sharing' && (
              <LocationSharingPanel
                token={token}
                activeBooking={activeBooking}
                currentLocation={pickupLocation || activeBooking?.pickup_location}
              />
            )}
            {activePassengerMenu === 'stats' && <RideStatsPanel token={token} />}
          </ScrollView>
        </View>

        {renderRideDetailsOverlay()}

        {/* Notification Center Modal */}
        {showNotificationCenter && (
          <View style={styles.notificationCenterOverlay}>
            <NotificationCenter
              token={token}
              onClose={closeNotificationCenter}
              onNotificationPress={handleNotificationPress}
            />
          </View>
        )}

        {/* Booking Flow Overlay */}
        {showBookingFlow && (
          <View style={styles.bookingFlowOverlay}>
            <PassengerBookingNavigator
              onBookingComplete={handleBookingComplete}
              onCancel={handleBookingCancel}
              initialPickup={pickupLocation}
              initialDropoff={dropoffLocation}
              recentBookings={passengerBookings}
            />
          </View>
        )}
        
        {/* Post-Ride Rating Modal */}
        {showRatingModal && justCompletedBooking && (
          <PostRideRatingModal
            visible={showRatingModal}
            booking={justCompletedBooking}
            token={token}
            onClose={() => {
              setShowRatingModal(false);
              setJustCompletedBooking(null);
            }}
            onRatingSubmitted={() => {
              setShowRatingModal(false);
              setJustCompletedBooking(null);
              setMessage('Thank you for your rating!');
            }}
          />
        )}
      </View>
      </SafeAreaView>
    </AccessibilityProvider>
  );
}

  const styles = StyleSheet.create({
    semanticCardsRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 8,
      marginBottom: 6,
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    semanticCard: {
      width: '31%',
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: 12,
      backgroundColor: COLORS.white,
      borderWidth: 1,
      borderColor: COLORS.border,
      alignItems: 'center',
    },
    semanticCardEmoji: {
      fontSize: 20,
    },
    semanticCardLabel: {
      marginTop: 6,
      color: COLORS.textMain,
      fontSize: 12,
      fontWeight: '600',
    },
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16 },
  containerMobile: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  mapContainer: {
    height: 220,
    position: 'relative',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D7E2DA',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    ...SHADOWS.card,
  },
  mapContainerMobile: {
    height: 268,
    borderRadius: 0,
    borderWidth: 0,
  },
  mapIframe: {
    width: '100%',
    height: '100%',
    borderWidth: 0,
  },
  mapIframeMobile: {
    borderRadius: 14,
  },
  panel: {
    marginTop: 14,
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D7E2DA',
    padding: 16,
    ...SHADOWS.card,
  },
  panelMobile: {
    marginTop: -22,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    padding: 10,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  panelScroll: { flex: 1 },
  panelScrollMobile: { flex: 1 },
  panelScrollContent: { paddingBottom: 22 },
  panelScrollContentMobile: { paddingBottom: 36 },
  premiumCallout: { marginBottom: 10 },
  premiumTitle: {
    ...TYPOGRAPHY.title,
    fontSize: 22,
    marginTop: 12,
  },
  premiumMalayalam: {
    marginTop: 4,
    ...TYPOGRAPHY.malayalam,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  headerRowMobile: {
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 2,
  },
  headerRowBookingMobile: {
    display: 'none',
  },
  headerUserBlock: { flex: 1, paddingRight: 8 },
  headerUserBlockMobile: { flexBasis: '100%', paddingRight: 0 },
  headerLogo: { width: 80, height: 44, marginHorizontal: 8, borderRadius: 10 },
  hello: { color: COLORS.textMain, fontSize: 19, fontWeight: '900' },
  helloMobile: { fontSize: 17 },
  sub: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  profileButton: {
    backgroundColor: '#E3F2E8',
    borderColor: '#2E7D32',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    ...SHADOWS.soft,
  },
  profileButtonMobile: {
    marginRight: 0,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  profileText: { color: '#2E7D32', fontWeight: '700' },
  logoutButton: {
    backgroundColor: '#F8FBF9',
    borderColor: '#D2DED6',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...SHADOWS.soft,
  },
  logoutButtonMobile: {
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  logoutText: { color: COLORS.textMain, fontWeight: '700' },
  safetyHeaderButton: {
    backgroundColor: '#FFF8E7',
    borderColor: '#E0A82E',
  },
  safetyHeaderText: { color: '#73510A' },
  loader: { marginVertical: 8 },
  error: { color: COLORS.danger, marginTop: 8 },
  message: { color: '#1B5E20', marginTop: 8 },
  locationPermissionCard: {
    borderWidth: 1,
    borderColor: '#B8D8C1',
    borderRadius: 12,
    backgroundColor: '#F3FAF5',
    padding: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  locationPermissionCardMobile: {
    alignItems: 'stretch',
    flexDirection: 'column',
    padding: 10,
    gap: 8,
  },
  locationPermissionCopy: {
    flex: 1,
  },
  locationPermissionTitle: {
    color: COLORS.textMain,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 2,
  },
  locationPermissionText: {
    color: '#355243',
    fontSize: 12,
    fontWeight: '600',
  },
  locationPermissionButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationPermissionButtonDisabled: {
    opacity: 0.7,
  },
  locationPermissionButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  quickBookingSheet: {
    borderWidth: 1,
    borderColor: '#D7E2DA',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    padding: 14,
    marginBottom: 12,
    ...SHADOWS.card,
  },
  quickBookingSheetMobile: {
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 10,
    marginBottom: 8,
    shadowOpacity: 0,
    elevation: 0,
  },
  quickSheetHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C8D8CE',
    marginBottom: 12,
  },
  quickBookingHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  quickBookingTitleBlock: {
    flex: 1,
  },
  quickGreeting: {
    color: '#66786D',
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 2,
  },
  quickTitle: {
    color: COLORS.textMain,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900',
  },
  quickTitleMobile: {
    fontSize: 22,
    lineHeight: 27,
  },
  quickHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  quickIconButton: {
    marginRight: 0,
  },
  quickMoreButton: {
    borderWidth: 1,
    borderColor: '#C9D9CF',
    backgroundColor: '#F8FBF9',
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  quickMoreText: {
    color: COLORS.textMain,
    fontSize: 12,
    fontWeight: '900',
  },
  quickStepRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  quickStepItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  quickStepDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#CBD9D0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  quickStepDotActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary,
  },
  quickStepNumber: {
    color: '#6B7D72',
    fontSize: 11,
    fontWeight: '900',
  },
  quickStepNumberActive: {
    color: '#FFFFFF',
  },
  quickStepLabel: {
    color: '#6B7D72',
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '800',
  },
  quickStepLabelActive: {
    color: COLORS.primaryDark,
  },
  quickLocationPrompt: {
    borderWidth: 1,
    borderColor: '#B8D8C1',
    borderRadius: 12,
    backgroundColor: '#F3FAF5',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  quickLocationPromptTitle: {
    color: COLORS.primaryDark,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 2,
  },
  quickLocationPromptText: {
    color: '#446151',
    fontSize: 12,
    fontWeight: '700',
  },
  quickRouteBox: {
    borderWidth: 1,
    borderColor: '#D8E5DC',
    borderRadius: 14,
    backgroundColor: '#FBFDFB',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  quickRouteLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  quickRouteDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 5,
  },
  quickPickupDot: {
    backgroundColor: COLORS.primary,
  },
  quickDropDot: {
    backgroundColor: '#E53935',
  },
  quickRouteCopy: {
    flex: 1,
    minWidth: 0,
  },
  quickRouteLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  quickRouteLabel: {
    color: '#6C7B72',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  quickRouteValue: {
    color: COLORS.textMain,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
    marginTop: 2,
  },
  quickUseLocationButton: {
    borderRadius: 999,
    backgroundColor: '#EAF6ED',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  quickUseLocationText: {
    color: COLORS.primaryDark,
    fontSize: 11,
    fontWeight: '900',
  },
  quickRouteDivider: {
    height: 1,
    backgroundColor: '#E4EEE7',
    marginVertical: 10,
    marginLeft: 22,
  },
  quickDestinationInputContainer: {
    marginTop: 4,
  },
  quickDestinationInput: {
    borderWidth: 0,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingVertical: 4,
    marginBottom: 0,
    backgroundColor: 'transparent',
    color: COLORS.textMain,
    fontSize: 16,
    fontWeight: '900',
  },
  quickDestinationInputError: {
    color: COLORS.danger,
  },
  quickHint: {
    color: '#66786D',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
  },
  quickSuggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderWidth: 1,
    borderColor: '#D8E5DC',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 11,
    paddingVertical: 10,
    marginBottom: 7,
  },
  quickSuggestionPin: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  quickSuggestionText: {
    flex: 1,
    color: COLORS.textMain,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  quickRecentSection: {
    marginBottom: 10,
  },
  quickSectionLabel: {
    color: '#66786D',
    fontSize: 11,
    fontWeight: '900',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  quickRecentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickRecentChip: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: '#D8E5DC',
    borderRadius: 12,
    backgroundColor: '#F8FBF9',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  quickRecentChipTitle: {
    color: COLORS.textMain,
    fontSize: 12,
    fontWeight: '900',
    marginBottom: 2,
  },
  quickRecentChipSub: {
    color: '#66786D',
    fontSize: 10,
    fontWeight: '700',
  },
  quickFareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderWidth: 1,
    borderColor: '#D8E5DC',
    borderRadius: 14,
    backgroundColor: '#F2F8F4',
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 9,
  },
  quickFareLabel: {
    color: '#557061',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  quickFareValue: {
    color: COLORS.textMain,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },
  quickFareMeta: {
    alignItems: 'flex-end',
    gap: 3,
  },
  quickFareMetaText: {
    color: '#496252',
    fontSize: 12,
    fontWeight: '800',
  },
  quickChoiceRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  quickChoiceChip: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: '#D8E5DC',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  quickChoiceLabel: {
    color: '#66786D',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  quickChoiceValue: {
    color: COLORS.textMain,
    fontSize: 13,
    fontWeight: '900',
  },
  rideDetailsOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 80,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(17, 31, 24, 0.42)',
  },
  rideDetailsPanel: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: 680,
    maxHeight: '88%',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    backgroundColor: COLORS.surface,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 18,
  },
  rideDetailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  rideDetailsEyebrow: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  rideDetailsTitle: {
    color: COLORS.textMain,
    fontSize: 20,
    fontWeight: '900',
  },
  rideDetailsCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EDF5EF',
  },
  rideDetailsCloseText: {
    color: COLORS.textMain,
    fontSize: 18,
    fontWeight: '900',
  },
  rideDetailsBody: {
    maxHeight: 560,
  },
  rideDetailsBodyContent: {
    paddingBottom: 8,
    gap: 12,
  },
  rideDetailsSection: {
    borderWidth: 1,
    borderColor: '#D8E5DC',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    padding: 12,
  },
  rideDetailsSectionTitle: {
    color: COLORS.textMain,
    fontSize: 14,
    fontWeight: '900',
    marginBottom: 8,
  },
  rideDetailsWrapRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rideDetailsOptionChip: {
    minHeight: 42,
    minWidth: 96,
    borderWidth: 1,
    borderColor: '#CBD9D0',
    borderRadius: 10,
    backgroundColor: '#F6FAF7',
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rideDetailsOptionChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#E3F2E8',
  },
  rideDetailsOptionIcon: {
    fontSize: 18,
    marginBottom: 3,
  },
  rideDetailsOptionText: {
    color: '#355243',
    fontSize: 12,
    fontWeight: '800',
  },
  rideDetailsOptionTextActive: {
    color: COLORS.primaryDark,
  },
  tourismInlineSection: {
    gap: 8,
    marginVertical: 8,
  },
  tourismPackageList: {
    gap: 8,
    marginBottom: 8,
  },
  tourismPackageChip: {
    borderWidth: 1,
    borderColor: '#CBD9D0',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  tourismPackageChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#E3F2E8',
  },
  tourismPackageTitle: {
    color: COLORS.textMain,
    fontSize: 13,
    fontWeight: '900',
  },
  tourismPreviewBox: {
    borderWidth: 1,
    borderColor: '#D8E5DC',
    borderRadius: 10,
    backgroundColor: '#F6FAF7',
    padding: 10,
    marginTop: 4,
  },
  rideDetailsDoneButton: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  rideDetailsDoneText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  quickConfirmButton: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
    ...SHADOWS.soft,
  },
  quickConfirmButtonDisabled: {
    backgroundColor: '#9DB8A5',
  },
  quickConfirmText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  quickSecondaryActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickSecondaryButton: {
    flexGrow: 1,
    borderWidth: 1,
    borderColor: '#D8E5DC',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  quickSecondaryText: {
    color: '#365043',
    fontSize: 12,
    fontWeight: '900',
  },
  route: { color: '#666666', marginTop: 10, marginBottom: 10 },
  dashboardTopRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  dashboardTopRowMobile: { gap: 6, marginBottom: 8 },
  primaryMenuButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#E8F5E9',
    ...SHADOWS.soft,
  },
  primaryMenuButtonMobile: {
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  primaryMenuButtonActive: {
    borderColor: COLORS.primaryDark,
    backgroundColor: '#D5ECD8',
  },
  primaryMenuButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryMenuButtonText: { color: COLORS.primaryDark, fontWeight: '800', textAlign: 'center' },
  menuToggleButton: {
    borderWidth: 1,
    borderColor: '#CBD9D0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#F6FAF7',
  },
  menuToggleButtonMobile: {
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  menuToggleButtonText: { color: '#355243', fontWeight: '700' },
  pinnedMenuRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  pinnedMenuRowMobile: {
    gap: 6,
    marginBottom: 8,
  },
  secondaryMenuPanel: {
    gap: 10,
    marginBottom: 10,
  },
  menuGroup: {
    borderTopWidth: 1,
    borderTopColor: '#DDE8E1',
    paddingTop: 8,
  },
  menuGroupTitle: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  secondaryMenuRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  activeMenuInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  activeMenuInfoText: { color: COLORS.textMain, fontWeight: '800', fontSize: 14 },
  menuChip: {
    borderWidth: 1,
    borderColor: '#CBD9D0',
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    maxWidth: '100%',
    minHeight: 40,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: '#F6FAF7',
  },
  pinnedMenuChip: {
    flexGrow: 1,
    flexBasis: '45%',
  },
  pinnedMenuChipMobile: {
    flexBasis: '48%',
    minHeight: 38,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  menuChipActive: { borderColor: COLORS.primary, backgroundColor: '#E3F2E8' },
  menuIconBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF2ED',
  },
  menuIconBadgeMobile: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  menuIconBadgeActive: {
    backgroundColor: COLORS.primary,
  },
  menuIconFallback: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.primaryDark,
  },
  menuIconFallbackActive: {
    backgroundColor: '#FFFFFF',
  },
  menuChipText: {
    color: '#355243',
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  menuChipTextMobile: {
    fontSize: 11,
  },
  menuChipTextActive: { color: COLORS.primaryDark },
  pickupLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  currentLocationInlineButton: {
    backgroundColor: '#E4F2E8',
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  currentLocationInlineButtonMobile: {
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  currentLocationInlineText: { color: COLORS.primaryDark, fontWeight: '700', fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: COLORS.textMain,
    backgroundColor: COLORS.background,
    marginBottom: 8,
  },
  inputMobile: {
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  hint: { color: '#666666', fontSize: 12, marginBottom: 8 },
  suggestion: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 6,
    backgroundColor: '#FFFFFF',
  },
  suggestionText: { color: '#202020', fontSize: 13 },
  selectedBlock: {
    borderWidth: 1,
    borderColor: '#D7E2DA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#FAFAFA',
    ...SHADOWS.soft,
  },
  selectedBlockMobile: {
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  tripSummaryCard: {
    borderWidth: 1,
    borderColor: '#D7E2DA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    ...SHADOWS.soft,
  },
  locationValueBox: {
    borderWidth: 1,
    borderColor: '#D7E2DA',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 4,
    marginBottom: 8,
  },
  locationValueBoxInvalid: {
    borderColor: COLORS.danger,
  },
  validationText: {
    color: COLORS.danger,
    fontSize: 12,
    marginTop: -4,
    marginBottom: 8,
    fontWeight: '600',
  },
  modeRow: { flexDirection: 'row', gap: 8, marginTop: 6, marginBottom: 8 },
  modeChip: {
    borderWidth: 1,
    borderColor: '#CBD9D0',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F6FAF7',
  },
  modeChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#E3F2E8',
  },
  modeChipText: { color: '#355243', fontWeight: '700' },
  modeChipTextActive: { color: COLORS.primaryDark },
  assistedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  assistedInput: {
    flexGrow: 1,
    flexBasis: 180,
    minWidth: 160,
  },
  assistedToggleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  assistedToggleChip: {
    flexGrow: 1,
    alignItems: 'center',
  },
  assistedNotesInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  poolActionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  poolActionButton: { flexGrow: 1, alignItems: 'center' },
  actionButton: {
    backgroundColor: '#2E7D32',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    ...SHADOWS.soft,
  },
  actionButtonMuted: {
    backgroundColor: '#455A64',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    ...SHADOWS.soft,
  },
  actionText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  infoBlock: {
    borderWidth: 1,
    borderColor: '#D7E2DA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#FAFAFA',
    ...SHADOWS.soft,
  },
  infoBlockMobile: {
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  rideModeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  rideModeRowMobile: {
    marginBottom: 8,
  },
  mapToggleButtonMobile: {
    borderRadius: 999,
  },
  mapPickHintMobile: {
    marginBottom: 8,
  },
  mobileRideSummary: {
    borderWidth: 1,
    borderColor: '#D7E2DA',
    borderRadius: 10,
    backgroundColor: '#F3FAF5',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
  },
  mobileRideSummaryText: {
    color: '#355243',
    fontSize: 12,
    fontWeight: '700',
  },
  subscriptionPlanRow: {
    marginTop: 8,
    gap: 8,
  },
  subscriptionPlanChip: {
    borderWidth: 1,
    borderColor: '#CBD9D0',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#F6FAF7',
  },
  subscriptionPlanChipSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#E3F2E8',
  },
  subscriptionPlanChipDisabled: {
    opacity: 0.5,
  },
  subscriptionPlanChipText: {
    color: '#355243',
    fontWeight: '700',
  },
  subscriptionPlanChipTextSelected: {
    color: COLORS.primaryDark,
  },
  subscriptionDueBox: {
    marginTop: 10,
  },
  driverHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  driverRow: {
    borderWidth: 1,
    borderColor: '#D7E2DA',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
    ...SHADOWS.soft,
  },
  driverInfoBlock: {
    marginBottom: 8,
  },
  driverNameText: {
    color: '#202020',
    fontWeight: '700',
    marginBottom: 2,
  },
  driverActionBlock: {
    flexDirection: 'row',
    gap: 8,
  },
  blockedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  driverChip: {
    borderWidth: 1,
    borderColor: '#CBD9D0',
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: '#F6FAF7',
  },
  driverChipSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#E3F2E8',
  },
  driverChipText: {
    color: '#355243',
    fontWeight: '700',
    fontSize: 12,
  },
  driverChipTextSelected: {
    color: COLORS.primaryDark,
  },
  inlineDriverRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginVertical: 4,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  inlineDriverRowSelected: {
    backgroundColor: '#E8F5E9',
    borderColor: COLORS.primary,
    borderWidth: 2,
  },
  driverSelectChip: {
    borderWidth: 1,
    borderColor: '#CBD9D0',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#F6FAF7',
  },
  driverSelectChipSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#D5ECD8',
  },
  infoTitle: { color: '#202020', fontWeight: '700', marginBottom: 4 },
  infoTitleMobile: { fontSize: 14 },
  infoText: { color: '#666666', marginBottom: 2 },
  otpShareText: {
    color: '#1B5E20',
    fontWeight: '800',
    marginBottom: 6,
  },
  rideEmergencyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#C62828',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#FFF4F4',
  },
  rideEmergencyCopy: {
    flex: 1,
  },
  rideEmergencyTitle: {
    color: '#C62828',
    fontWeight: '800',
    marginBottom: 2,
  },
  rideEmergencyText: {
    color: '#666666',
    fontSize: 12,
  },
  rideEmergencyButton: {
    backgroundColor: '#C62828',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  rideEmergencyButtonDisabled: {
    opacity: 0.65,
  },
  rideEmergencyButtonText: {
    color: '#fff',
    fontWeight: '800',
  },
  rideEmergencyActions: {
    gap: 8,
    minWidth: 92,
  },
  rideEmergencySecondaryButton: {
    borderWidth: 1,
    borderColor: '#C62828',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  rideEmergencySecondaryText: {
    color: '#C62828',
    fontWeight: '800',
    fontSize: 12,
  },
  cancelButton: {
    marginTop: 10,
    backgroundColor: '#C62828',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelText: { color: '#fff', fontWeight: '700' },
  historyCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  historyCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  historyCardStatus: {
    fontSize: 12,
    fontWeight: '700',
    color: '#202020',
    textTransform: 'uppercase',
  },
  historyCardId: {
    fontSize: 11,
    color: '#999999',
  },
  historyCardDriver: {
    fontSize: 14,
    fontWeight: '600',
    color: '#202020',
  },
  historyCardFare: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2196F3',
  },
  historyCardRoute: {
    fontSize: 12,
    color: '#666666',
    marginTop: 6,
    lineHeight: 16,
  },
  historyActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  historyActionDisabled: {
    opacity: 0.55,
  },
  notificationCenterOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'white',
    zIndex: 1000,
  },
  bookingFlowOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'white',
    zIndex: 1001,
  },
  headerButton: {
    marginRight: 8,
  },
  headerButtonMobile: {
    marginRight: 0,
  },
  vehicleTypeChip: {
    borderWidth: 1,
    borderColor: '#CBD9D0',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F6FAF7',
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  vehicleTypeChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#E3F2E8',
  },
  vehicleTypeChipIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  vehicleTypeChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#355243',
    textAlign: 'center',
  },
  vehicleTypeChipTextActive: {
    color: COLORS.primaryDark,
  },
  bookingButton: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.soft,
  },
  bookingButtonMobile: {
    borderRadius: 12,
    paddingVertical: 14,
  },
});

/**
 * Wrapper component that provides NotificationContext to PassengerMapContent
 */
export default function PassengerMap(props) {
  return <PassengerMapContent {...props} />;
}
