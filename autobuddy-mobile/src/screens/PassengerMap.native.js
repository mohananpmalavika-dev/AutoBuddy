import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  AppState,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { SymbolView } from 'expo-symbols';
import MapView, { Marker } from '../components/FreeMap';

import { apiRequest } from '../lib/api';
import { getDisplayText } from '../lib/displayText';
import { getFavoriteDriverIds } from '../lib/favoriteDrivers';
import {
  getPlaceLocation, 
  isPlacesConfigured,
  reverseGeocodeLocation,
  searchPlaces,
} from '../lib/places';
import { COLORS, SHADOWS } from '../theme';
import RevenueCard from '../components/RevenueCard';
import { useVehicleTypes } from '../hooks/useVehicleTypes';
import { useVoiceBooking } from '../hooks/useVoiceBooking';
import RideProductsGrid from '../components/RideProductsGrid';
import RideCommunicationCard from '../components/RideCommunicationCard';
import VoiceTextInput from '../components/VoiceTextInput';
import BookingConfirmationCard from '../components/BookingConfirmationCard';
import VoiceBookingOverlay from '../components/VoiceBookingOverlay';
import InteractiveMap from '../components/InteractiveMap';
import ScheduledPickupPicker from '../components/ScheduledPickupPicker';
import KeralaSafetyCard from '../components/KeralaSafetyCard';
import PromoCodePanel from '../components/PromoCodePanel';
import SupportTicketsPanel from '../components/SupportTicketsPanel';
import PaymentMethodsPanel from '../components/PaymentMethodsPanel';
import PassengerRatingsPanel from '../components/PassengerRatingsPanel';
import FavoriteDriversPanel from '../components/FavoriteDriversPanel';
import PostRideRatingModal from '../components/PostRideRatingModal';
import PassengerBookingNavigator from '../screens/PassengerBookingNavigator';
import SavedPlacesQuickSelect from '../components/SavedPlacesQuickSelect';
import PreferencesPanel from '../components/PreferencesPanel';
import SavedPlacesPanel from '../components/SavedPlacesPanel';
import EmergencyContactsPanel from '../components/EmergencyContactsPanel';
import AccessibilityPanel from '../components/AccessibilityPanel';
import PassengerScheduledRidesPanel from '../components/PassengerScheduledRidesPanel';
import NotificationCenter from '../components/NotificationCenter';
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
import PredictiveBookingCard from '../components/PredictiveBookingCard';
import { usePredictiveBooking } from '../hooks/usePredictiveBooking';
import { useNotifications } from '../contexts/NotificationContext';
import { useNotificationManager } from '../hooks/useNotificationManager';
import { usePassengerRideRealtime } from '../hooks/usePassengerRideRealtime';
import { useKeralaSafety } from '../hooks/useKeralaSafety';
import { validateScheduledPickup } from '../lib/scheduling';

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
  { key: 'scheduled_rides', label: 'Schedule Ride', symbol: PASSENGER_MENU_SYMBOLS.scheduled_rides },
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

const DEFAULT_REGION = { latitude: 13.0827, longitude: 80.2707, latitudeDelta: 0.05, longitudeDelta: 0.05 };
const passengerMapStyle = [];
const SHOW_LEGACY_ONE_PAGE_BOOKING_FLOW = false;
const PASSENGER_POLL_UNCHANGED = Symbol('passenger-poll-unchanged');
const PASSENGER_POLL_INTERVAL_MS = 30000;
const PASSENGER_POLL_RATE_LIMIT_COOLDOWN_MS = 30000;
const PASSENGER_POLL_BACKEND_COOLDOWN_MS = 20000;
const PASSENGER_POLL_AUTH_RETRY_COOLDOWN_MS = 60000;
const PASSENGER_POLL_AUTH_EXPIRED_COOLDOWN_MS = 5 * 60 * 1000;
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

function normalizeDistanceKm(value) {
  const distance = Number(value);
  if (!Number.isFinite(distance) || distance <= 0) {
    return 0;
  }
  return distance > 1000 ? distance / 1000 : distance;
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
      continue;
    }
    const number = Number(value);
    if (Number.isFinite(number)) {
      return number;
    }
  }
  return null;
}

function readCoordinatePair(location) {
  const coordinates =
    (Array.isArray(location?.coordinates) && location.coordinates) ||
    (Array.isArray(location?.coords) && location.coords) ||
    (Array.isArray(location?.geometry?.coordinates) && location.geometry.coordinates) ||
    null;
  if (!coordinates || coordinates.length < 2) {
    return { latitude: null, longitude: null };
  }

  const first = Number(coordinates[0]);
  const second = Number(coordinates[1]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) {
    return { latitude: null, longitude: null };
  }

  if (Math.abs(first) <= 90 && Math.abs(second) > 90) {
    return { latitude: first, longitude: second };
  }
  return { latitude: second, longitude: first };
}

function readLocationLatitude(location) {
  const pair = readCoordinatePair(location);
  return firstFiniteNumber(
    location?.latitude,
    location?.lat,
    location?.location?.latitude,
    location?.location?.lat,
    location?.coordinate?.latitude,
    location?.coordinate?.lat,
    location?.geometry?.location?.lat,
    pair.latitude,
  );
}

function readLocationLongitude(location) {
  const pair = readCoordinatePair(location);
  return firstFiniteNumber(
    location?.longitude,
    location?.lng,
    location?.lon,
    location?.long,
    location?.location?.longitude,
    location?.location?.lng,
    location?.location?.lon,
    location?.coordinate?.longitude,
    location?.coordinate?.lng,
    location?.coordinate?.lon,
    location?.geometry?.location?.lng,
    location?.geometry?.location?.lon,
    pair.longitude,
  );
}

function getFareDistanceKm(fareEstimate) {
  if (!fareEstimate) {
    return 0;
  }
  const candidates = [
    fareEstimate.distance_km,
    fareEstimate.estimated_distance_km,
    fareEstimate.distance,
    fareEstimate.estimated_distance,
    fareEstimate.distanceKm,
    fareEstimate.estimatedDistanceKm,
    fareEstimate.route?.distance_km,
    fareEstimate.route?.distanceKm,
    fareEstimate.breakdown?.distance_km,
    fareEstimate.breakdown?.distanceKm,
    fareEstimate.route?.distance ? Number(fareEstimate.route.distance) / 1000 : undefined,
    fareEstimate.distance_m ? Number(fareEstimate.distance_m) / 1000 : undefined,
    fareEstimate.distance_meters ? Number(fareEstimate.distance_meters) / 1000 : undefined,
    fareEstimate.distanceMeters ? Number(fareEstimate.distanceMeters) / 1000 : undefined,
    fareEstimate.estimated_distance_meters ? Number(fareEstimate.estimated_distance_meters) / 1000 : undefined,
    fareEstimate.route?.distance_meters ? Number(fareEstimate.route.distance_meters) / 1000 : undefined,
    fareEstimate.route?.distanceMeters ? Number(fareEstimate.route.distanceMeters) / 1000 : undefined,
    fareEstimate.breakdown?.distance_meters ? Number(fareEstimate.breakdown.distance_meters) / 1000 : undefined,
  ];
  for (const candidate of candidates) {
    const distanceKm = normalizeDistanceKm(candidate);
    if (distanceKm > 0) {
      return distanceKm;
    }
  }
  return 0;
}

function calculateDirectDistanceKm(origin, destination) {
  const originLatitude = readLocationLatitude(origin);
  const originLongitude = readLocationLongitude(origin);
  const destinationLatitude = readLocationLatitude(destination);
  const destinationLongitude = readLocationLongitude(destination);
  if (
    !Number.isFinite(originLatitude) ||
    !Number.isFinite(originLongitude) ||
    !Number.isFinite(destinationLatitude) ||
    !Number.isFinite(destinationLongitude)
  ) {
    return 0;
  }
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const latitudeDelta = toRadians(destinationLatitude - originLatitude);
  const longitudeDelta = toRadians(destinationLongitude - originLongitude);
  const a =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(toRadians(originLatitude)) *
      Math.cos(toRadians(destinationLatitude)) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

function getRideProductName(rideProduct) {
  return RIDE_PRODUCT_LABEL_FALLBACKS[rideProduct] || titleFromId(rideProduct, 'Normal');
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
  "use no memo";

  const autoPickupInitializedRef = useRef(false);
  const bookingStatusRef = useRef({ bookingId: null, status: null });
  const driverAddressCacheRef = useRef(new Map());
  const refreshPassengerBookingsRef = useRef(null);
  const passengerPollInFlightRef = useRef(false);
  const passengerPollCycleRef = useRef(0);
  const passengerPollCooldownUntilRef = useRef(0);
  const passengerPollNoticeAtRef = useRef(0);
  const activeBookingRequestRef = useRef({ token: null, request: null });
  const appStateRef = useRef(AppState.currentState || 'active');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pickupQuery, setPickupQuery] = useState('');
  const [dropoffQuery, setDropoffQuery] = useState('');
  const [pickupLocation, setPickupLocation] = useState(null);
  const [dropoffLocation, setDropoffLocation] = useState(null);
  const [routePreviewLocations, setRoutePreviewLocations] = useState({ pickup: null, dropoff: null });
  const [routePreviewDistanceKm, setRoutePreviewDistanceKm] = useState(0);
  const pickupLocationRef = useRef(null);
  const dropoffLocationRef = useRef(null);
  const refreshDriverDiscoveryRef = useRef(null);
  const [pickupSuggestions, setPickupSuggestions] = useState([]);
  const [dropoffSuggestions, setDropoffSuggestions] = useState([]);
  const [searchingPickup, setSearchingPickup] = useState(false);
  const [searchingDropoff, setSearchingDropoff] = useState(false);
  const [locatingPickup, setLocatingPickup] = useState(false);
  const [locationValidation, setLocationValidation] = useState({ pickup: false, dropoff: false });
  const [activeBooking, setActiveBooking] = useState(null);
  const [passengerBookings, setPassengerBookings] = useState([]);
  const [historyPaginationOffset, setHistoryPaginationOffset] = useState(0);
  const [historyPageSize] = useState(20);
  const [historyHasMore, setHistoryHasMore] = useState(true);
  const [fare, setFare] = useState(null);
  const [nearbyDrivers, setNearbyDrivers] = useState([]);
  const [favoriteDriverIds, setFavoriteDriverIds] = useState([]);
  const [blockedDriverIds, setBlockedDriverIds] = useState([]);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [fareExpectationInput, setFareExpectationInput] = useState('');
  const [optedOutDriverIds, setOptedOutDriverIds] = useState([]);
  const [autoFetchingTripData, setAutoFetchingTripData] = useState(false);
  const [rideProduct, setRideProduct] = useState('normal');
  const [selectedVehicleTypeId, setSelectedVehicleTypeId] = useState('');
  const [selectedVehicleModelId, setSelectedVehicleModelId] = useState('');
  const { vehicleTypes: availableVehicleTypes, loading: vehicleTypesLoading } = useVehicleTypes();

  useEffect(() => {
    pickupLocationRef.current = pickupLocation;
  }, [pickupLocation]);

  useEffect(() => {
    dropoffLocationRef.current = dropoffLocation;
  }, [dropoffLocation]);
  
  // Auto-select first vehicle type when available to ensure fare estimation works
  useEffect(() => {
    if (availableVehicleTypes && availableVehicleTypes.length > 0 && !selectedVehicleTypeId) {
      const firstVehicleTypeId = getVehicleTypeId(availableVehicleTypes[0]);
      if (firstVehicleTypeId) {
        setSelectedVehicleTypeId(firstVehicleTypeId);
      }
    }
  }, [availableVehicleTypes]);
  
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
  const [selectingPoint, setSelectingPoint] = useState('pickup');
  const [mapError, setMapError] = useState('');
  const [activePassengerMenu, setActivePassengerMenu] = useState(PRIMARY_PASSENGER_MENU_KEY);
  const [showPassengerMenus, setShowPassengerMenus] = useState(false);
  const [bookingJustCreated, setBookingJustCreated] = useState(false);
  const [showInteractiveMap, setShowInteractiveMap] = useState(true);
  const [rideProductAvailability, setRideProductAvailability] = useState({
    enabled_products: ['normal'],
    pickup_district: null,
  });
  const [rideProductsLoading, setRideProductsLoading] = useState(false);
  const [spinWinStatus, setSpinWinStatus] = useState(null);
  const [spinWinLoading, setSpinWinLoading] = useState(false);
  const [spinningNow, setSpinningNow] = useState(false);
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [justCompletedBooking, setJustCompletedBooking] = useState(null);
  const [showBookingFlow, setShowBookingFlow] = useState(false);
  const [showRideDetailsModal, setShowRideDetailsModal] = useState(false);
  const [showVoiceBooking, setShowVoiceBooking] = useState(false);
  const [voiceLanguageCode, setVoiceLanguageCode] = useState('en');
  const [poolCreateRequest, setPoolCreateRequest] = useState({ key: 0, model: null });
  const passengerNotificationSettings = useMemo(
    () => ({
      ...(passengerPreferences || {}),
      vibration_enabled: passengerAccessibility?.haptic_feedback,
    }),
    [passengerAccessibility?.haptic_feedback, passengerPreferences],
  );
  useNotificationManager(token, user?.id, passengerNotificationSettings);
  const { unreadCount } = useNotifications();
  const voiceLanguage = voiceLanguageCode === 'ml' ? 'ml-IN' : 'en-IN';
  const voiceBooking = useVoiceBooking(
    {
      onIntentParsed: (intent) => {
        if (intent?.pickupText) {
          setPickupQuery(intent.pickupText);
          setPickupLocation(null);
        }
        if (intent?.destinationText || intent?.destinationLabel) {
          setDropoffQuery(intent.destinationLabel || intent.destinationText);
          setDropoffLocation(null);
        }
        setActivePassengerMenu(PRIMARY_PASSENGER_MENU_KEY);
        setMessage(intent?.displaySummary || 'Voice booking details filled.');
        setError('');
      },
      onBookingComplete: (result) => {
        const booking = result?.booking || result?.data?.booking || result?.data || result;
        if (booking && typeof booking === 'object') {
          setActiveBooking(booking);
          setBookingJustCreated(true);
        }
        setMessage(voiceLanguageCode === 'ml' ? 'Voice ride request sent in Malayalam.' : 'Voice ride request sent.');
        setShowVoiceBooking(false);
      },
      onError: (voiceError) => {
        setError(voiceError);
      },
    },
    voiceLanguage,
  );
  const mapRef = useRef(null);
  const [driverLiveAddress, setDriverLiveAddress] = useState('');
  const pickupAddressRequestRef = useRef(0);
  const dropAddressRequestRef = useRef(0);
  const pickupSearchRequestRef = useRef(0);
  const dropSearchRequestRef = useRef(0);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appStateRef.current = nextState;
    });

    return () => {
      subscription?.remove?.();
    };
  }, []);

  useEffect(() => {
    voiceBooking.switchLanguage(voiceLanguage);
  }, [voiceBooking.switchLanguage, voiceLanguage]);

  const handleQuickLanguageChange = useCallback((nextLanguageCode) => {
    setVoiceLanguageCode(nextLanguageCode === 'ml' ? 'ml' : 'en');
  }, []);

  const formatCoordinateAddress = (lat, lng) => `Lat ${Number(lat).toFixed(6)}, Lng ${Number(lng).toFixed(6)}`;

  const buildLocationFromCoordinate = (coordinate) => {
    const latitude = Number(Number(coordinate.latitude).toFixed(6));
    const longitude = Number(Number(coordinate.longitude).toFixed(6));
    return { latitude, longitude, address: formatCoordinateAddress(latitude, longitude) };
  };
  const placesConfigured = isPlacesConfigured();
  const liveTrackStatuses = useMemo(() => new Set(['searching', 'accepted', 'driver_arrived', 'in_progress']), []);
  const normalizeBookingPaymentMethod = useCallback((value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized || normalized === 'cash') {
      return 'cash';
    }
    return 'online';
  }, []);

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

  // Initialize default vehicle type when available types are loaded
  useEffect(() => {
    if (availableVehicleTypes && availableVehicleTypes.length > 0 && !selectedVehicleTypeId) {
      const defaultVehicleTypeId = getVehicleTypeId(availableVehicleTypes[0]);
      const timer = setTimeout(() => {
        if (defaultVehicleTypeId) {
          setSelectedVehicleTypeId(defaultVehicleTypeId);
        }
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [availableVehicleTypes, selectedVehicleTypeId]);

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
      setSelectedPaymentMethod(normalizeBookingPaymentMethod(nextMethodType));
      setSelectedPaymentMethodId(method?.id || null);
      setSelectedPaymentChannel(typeof nextMethodType === 'string' ? nextMethodType : null);
    },
    [normalizeBookingPaymentMethod],
  );

  const handlePreferencesChange = useCallback(
    (nextPrefs) => {
      setPassengerPreferences(nextPrefs || null);
    },
    [],
  );
  const normalizeLocation = useCallback((location) => {
    if (!location) {
      return null;
    }
    const latitude = readLocationLatitude(location);
    const longitude = readLocationLongitude(location);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return null;
    }
    return {
      latitude: Number(latitude.toFixed(6)),
      longitude: Number(longitude.toFixed(6)),
      address:
        (typeof location.address === 'string' && location.address.trim()) ||
        `Lat ${Number(latitude.toFixed(6))}, Lng ${Number(longitude.toFixed(6))}`,
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
  const {
    driverLocation: realtimeDriverLocation,
    rideStatus: realtimeRideStatus,
    etaToPickup,
    etaToDrop,
    driverOnline,
  } = usePassengerRideRealtime({
    token,
    activeBooking,
  });
  const activeBookingStatus = normalizeBookingStatus(realtimeRideStatus || activeBooking?.status);
  const activeRideStartOtp = String(activeBooking?.ride_start_otp || '').trim();
  const activeRideEndOtp = String(activeBooking?.ride_end_otp || '').trim();
  const isDriverLiveSharing = liveTrackStatuses.has(activeBookingStatus);
  const canCancelActiveBooking = ['pending', 'scheduled', 'driver_arrived'].includes(activeBookingStatus);
  const driverArrivedCancellationApplies = activeBookingStatus === 'driver_arrived';
  const hasLiveRide = Boolean(
    activeBooking?.id &&
      !['completed', 'cancelled', 'rejected', 'no_driver_found', 'booking_failed'].includes(activeBookingStatus),
  );
  const pinnedPassengerMenuOptions = useMemo(
    () => (
      hasLiveRide
        ? [PASSENGER_MENU_BY_KEY.live, ...PINNED_PASSENGER_MENU_OPTIONS].filter(Boolean)
        : PINNED_PASSENGER_MENU_OPTIONS
    ),
    [hasLiveRide],
  );
  const liveDriverLocation = normalizeLocation(
    realtimeDriverLocation || activeBooking?.driver_live_location || activeBooking?.driver_location,
  );
  const liveDriverLatitude = liveDriverLocation?.latitude ?? null;
  const liveDriverLongitude = liveDriverLocation?.longitude ?? null;
  const liveDriverRawAddress = String(liveDriverLocation?.address || '').trim();
  const driverLiveLocationLabel = useMemo(() => {
    if (!liveDriverLocation) {
      return '';
    }
    return driverLiveAddress || liveDriverLocation.address || formatCoordinateAddress(
      liveDriverLocation.latitude,
      liveDriverLocation.longitude,
    );
  }, [driverLiveAddress, liveDriverLocation]);
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
        selectedVehicleTypeId || getVehicleTypeId(availableVehicleTypes?.[0]) || '',
        Number(passengerCountInput || 1) || 1,
        tourismAddOns,
      ),
    [availableVehicleTypes, passengerCountInput, selectedTourismPackage, selectedVehicleTypeId, tourismAddOns],
  );
  const effectiveScheduledDriverGenderPreference = normalizeDriverGenderPreference(
    scheduledDriverGenderPreference || passengerPreferences?.driver_gender_preference,
  );
  const keralaSafety = useKeralaSafety({
    token,
    userName: user?.name,
    activeBooking,
  });
  const accessibilityUi = useMemo(() => {
    const textSize = String(passengerAccessibility?.text_size || 'normal').toLowerCase();
    const textScale = textSize === 'extra_large' ? 1.18 : textSize === 'large' ? 1.1 : 1;
    const highContrast = Boolean(passengerAccessibility?.high_contrast);
    return {
      containerStyle: highContrast ? { backgroundColor: '#FFFFFF' } : null,
      panelStyle: highContrast ? { borderColor: '#000000', borderWidth: 2 } : null,
      textStyle: {
        color: highContrast ? '#000000' : COLORS.textMain,
        fontSize: Math.round(13 * textScale),
      },
      titleStyle: {
        color: highContrast ? '#000000' : COLORS.textMain,
        fontSize: Math.round(20 * textScale),
      },
    };
  }, [passengerAccessibility]);
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
  const shouldShowPassengerMenuRails =
    activePassengerMenu !== PRIMARY_PASSENGER_MENU_KEY ||
    showPassengerMenus;
  const effectiveSelectedVehicleTypeId = selectedVehicleTypeId || getVehicleTypeId(availableVehicleTypes?.[0]) || '';
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
    getRideProductName(effectiveRideProduct),
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
    // Vehicle and ride-product selections are committed on tap. Rewriting them here can
    // restore a stale Auto fallback if Done is pressed before the latest render lands.
    setShowRideDetailsModal(false);
  }, []);
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
  const effectivePickupLocation =
    [pickupLocation, routePreviewLocations.pickup]
      .map(normalizeLocation)
      .find(Boolean) || null;
  const effectiveDropoffLocation =
    [dropoffLocation, routePreviewLocations.dropoff]
      .map(normalizeLocation)
      .find(Boolean) || null;
  const directTripDistanceKm = calculateDirectDistanceKm(effectivePickupLocation, effectiveDropoffLocation);
  const fareDistanceKm = getFareDistanceKm(fare);
  const resolvedTripDistanceKm = fareDistanceKm || directTripDistanceKm || routePreviewDistanceKm;
  const localQuickFareValue =
    resolvedTripDistanceKm > 0
      ? Math.max(30, 25 + resolvedTripDistanceKm * 12)
      : 0;
  const quickFareValue = Number(
    fare?.total_fare ||
      fare?.estimated_fare ||
      localQuickFareValue ||
      0,
  );
  const quickFareLabel = quickFareValue > 0 ? `Rs. ${quickFareValue.toFixed(0)}` : 'Fare ready soon';
  const quickDistanceLabel =
    resolvedTripDistanceKm > 0 ? `${resolvedTripDistanceKm.toFixed(1)} km` : 'Distance calculating';
  const quickEtaLabel = visibleDrivers.length > 0 ? `${visibleDrivers.length} nearby` : autoFetchingTripData ? 'Finding drivers' : 'Driver search live';
  
  // FIX: Consider booking ready if we have both locations AND distance (even without fare loaded yet)
  const quickBookingReady = Boolean(
    effectivePickupLocation &&
      effectiveDropoffLocation &&
      resolvedTripDistanceKm > 0,
  );
  
  // FIX: Improved step calculation - step 3 (ready) if both locations exist with distance
  const quickBookingStep = !effectiveDropoffLocation 
    ? 1 
    : !effectivePickupLocation 
      ? 1
      : resolvedTripDistanceKm > 0 
        ? 3 
        : 2;
  
  const quickDestinationText = effectiveDropoffLocation?.address || dropoffQuery || '';
  const quickPickupText = effectivePickupLocation?.address || pickupQuery || 'Use current location';
  const searchBias = useMemo(() => pickupLocation || dropoffLocation || DEFAULT_REGION, [
    pickupLocation,
    dropoffLocation,
  ]);
  const poolPanelLocation = pickupLocation || searchBias || DEFAULT_REGION;
  const poolCreateDefaults = useMemo(
    () => ({
      pickup_location: pickupLocation?.address || pickupQuery || '',
      dropoff_location: dropoffLocation?.address || dropoffQuery || '',
      max_wait_minutes: 10,
    }),
    [dropoffLocation?.address, dropoffQuery, pickupLocation?.address, pickupQuery],
  );

  const validateBothLocations = () => {
    const activePickupLocation = pickupLocation || pickupLocationRef.current || routePreviewLocations.pickup;
    const activeDropoffLocation = dropoffLocation || dropoffLocationRef.current || routePreviewLocations.dropoff;
    const missingPickup = !activePickupLocation;
    const missingDropoff = !activeDropoffLocation;
    setLocationValidation({ pickup: missingPickup, dropoff: missingDropoff });
    if (missingPickup || missingDropoff) {
      setError('Select both pickup and drop from map or search.');
      return false;
    }
    return true;
  };

  const animateMapToLocation = useCallback((location) => {
    if (!mapRef.current || !location) {
      return;
    }
    mapRef.current.animateToRegion(
      {
        latitude: location.latitude,
        longitude: location.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      passengerAccessibility?.reduce_motion ? 0 : 450,
    );
  }, [passengerAccessibility?.reduce_motion]);

  const setLocationForPoint = (point, location) => {
    const currentPickupLocation = pickupLocationRef.current || pickupLocation;
    const currentDropoffLocation = dropoffLocationRef.current || dropoffLocation;
    const nextPickupLocation = point === 'pickup' ? location : currentPickupLocation;
    const nextDropoffLocation = point === 'dropoff' ? location : currentDropoffLocation;

    if (point === 'pickup') {
      pickupLocationRef.current = location;
      setPickupLocation(location);
      setPickupQuery(location.address);
      setPickupSuggestions([]);
      setLocationValidation((prev) => ({ ...prev, pickup: false }));
    } else {
      dropoffLocationRef.current = location;
      setDropoffLocation(location);
      setDropoffQuery(location.address);
      setDropoffSuggestions([]);
      setLocationValidation((prev) => ({ ...prev, dropoff: false }));
    }
    
    // CRITICAL FIX: Update route preview locations BEFORE clearing fare to prevent UI flicker
    const directDistance = calculateDirectDistanceKm(nextPickupLocation, nextDropoffLocation);
    setRoutePreviewLocations({
      pickup: nextPickupLocation || null,
      dropoff: nextDropoffLocation || null,
    });
    setRoutePreviewDistanceKm(directDistance);
    
    // Clear fare and driver data only AFTER route preview is set
    setFare(null);
    setNearbyDrivers([]);
    setOptedOutDriverIds([]);
    setSelectedDriverId('');

    if (nextPickupLocation && nextDropoffLocation) {
      // Immediate trigger for driver/fare discovery to update button state faster
      setTimeout(() => {
        try {
          if (typeof refreshDriverDiscoveryRef.current === 'function') {
            refreshDriverDiscoveryRef.current({ silent: false, force: true }).catch(() => null);
          }
        } catch (e) {
          // ignore
        }
      }, 50); // Reduced from 120ms to 50ms for faster response
    }
  };

  const clearRideSelectionResults = useCallback(() => {
    setFare(null);
    setNearbyDrivers([]);
    setOptedOutDriverIds([]);
    setSelectedDriverId('');
  }, []);

  const handleVehicleTypeSelect = useCallback(
    (vehicleTypeOrId) => {
      const nextTypeId = getVehicleTypeId(vehicleTypeOrId);
      if (!nextTypeId) {
        return;
      }
      const nextVehicleType =
        (availableVehicleTypes || []).find((type) => getVehicleTypeId(type) === nextTypeId) || null;
      const nextVehicleModelId = getVehicleModelOptions(nextVehicleType)[0]?.id || '';
      setSelectedVehicleTypeId(nextTypeId);
      setSelectedVehicleModelId(nextVehicleModelId);
      clearRideSelectionResults();
      // Ensure fare & driver discovery refreshes immediately after the selection
      setTimeout(() => {
        try {
          if (typeof refreshDriverDiscovery === 'function') {
            refreshDriverDiscovery({ silent: false, force: true }).catch(() => null);
          }
        } catch (e) {
          // ignore
        }
      }, 120);
    },
    [availableVehicleTypes, clearRideSelectionResults],
  );

  const handleVehicleModelSelect = useCallback(
    (modelId) => {
      const nextModelId = String(modelId || '').trim();
      if (!nextModelId) {
        return;
      }
      setSelectedVehicleModelId(nextModelId);
      clearRideSelectionResults();
      // Force a near-immediate refresh so fare/driver info updates for the new model
      setTimeout(() => {
        try {
          if (typeof refreshDriverDiscovery === 'function') {
            refreshDriverDiscovery({ silent: false, force: true }).catch(() => null);
          }
        } catch (e) {
          // ignore
        }
      }, 120);
    },
    [clearRideSelectionResults],
  );

  const handleRideProductSelect = useCallback(
    (product) => {
      const nextProduct = String(product || 'normal').trim() || 'normal';
      const preferredVehicle = getPreferredVehicleForRideProduct(
        availableVehicleTypes,
        nextProduct,
        effectiveSelectedVehicleTypeId,
      );
      const preferredVehicleTypeId = getVehicleTypeId(preferredVehicle);
      if (preferredVehicleTypeId && preferredVehicleTypeId !== effectiveSelectedVehicleTypeId) {
        setSelectedVehicleTypeId(preferredVehicleTypeId);
        setSelectedVehicleModelId(getVehicleModelOptions(preferredVehicle)[0]?.id || '');
      }
      setRideProduct(nextProduct);
      clearRideSelectionResults();
      // Trigger a forced refresh so fare estimate reflects the new ride product immediately
      setTimeout(() => {
        try {
          if (typeof refreshDriverDiscovery === 'function') {
            refreshDriverDiscovery({ silent: false, force: true }).catch(() => null);
          }
        } catch (e) {
          // ignore
        }
      }, 120);
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
        const suggestions = await searchPlaces(String(place.address).trim(), pickupLocation || dropoffLocation || DEFAULT_REGION).catch(() => []);
        const best = Array.isArray(suggestions) ? suggestions[0] : null;
        if (best?.placeId) {
          resolvedLocation = await getPlaceLocation(best).catch(() => null);
        }
      }

      if (!resolvedLocation) {
        setError('This saved place is missing map coordinates.');
        return;
      }

      const point = pickupLocation ? 'dropoff' : 'pickup';
      setLocationForPoint(point, resolvedLocation);
      setActivePassengerMenu(PRIMARY_PASSENGER_MENU_KEY);
      setMessage(point === 'pickup' ? 'Pickup selected. Choose drop location.' : 'Drop location selected.');
    },
    [dropoffLocation, pickupLocation, placesConfigured],
  );

  const resolveReadableAddress = useCallback(async (latitude, longitude) => {
    if (placesConfigured) {
      try {
        const googleAddress = await reverseGeocodeLocation(latitude, longitude);
        if (googleAddress) {
          return googleAddress;
        }
      } catch {
        // Fall through to device reverse geocoding.
      }
    }

    try {
      const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
      const first = Array.isArray(geo) ? geo[0] : null;
      if (first) {
        const formatted = [first.name, first.street, first.city, first.region]
          .filter(Boolean)
          .join(', ');
        if (formatted) {
          return formatted;
        }
      }
    } catch {
      // Keep coordinate fallback.
    }

    return formatCoordinateAddress(latitude, longitude);
  }, [placesConfigured]);

  const resolveAddressForPoint = async (point, coordinate) => {
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
  };

  useEffect(() => {
    let cancelled = false;
    const hydrateDriverLiveAddress = async () => {
      if (liveDriverLatitude === null || liveDriverLongitude === null || !isDriverLiveSharing) {
        if (!cancelled) {
          setDriverLiveAddress('');
        }
        return;
      }

      const currentAddress = liveDriverRawAddress;
      const looksLikeCoordinateAddress = /^lat\s*-?\d+(\.\d+)?\s*,\s*lng\s*-?\d+(\.\d+)?$/i.test(currentAddress);
      if (currentAddress && !looksLikeCoordinateAddress) {
        if (!cancelled) {
          setDriverLiveAddress(currentAddress);
        }
        return;
      }

      const cacheKey = `${liveDriverLatitude.toFixed(4)},${liveDriverLongitude.toFixed(4)}`;
      const cachedAddress = driverAddressCacheRef.current.get(cacheKey);
      if (cachedAddress) {
        if (!cancelled) {
          setDriverLiveAddress(cachedAddress);
        }
        return;
      }

      const resolvedAddress = await resolveReadableAddress(
        liveDriverLatitude,
        liveDriverLongitude,
      );
      if (cancelled) {
        return;
      }
      if (resolvedAddress) {
        driverAddressCacheRef.current.set(cacheKey, resolvedAddress);
      }
      setDriverLiveAddress(resolvedAddress || currentAddress);
    };

    hydrateDriverLiveAddress();
    return () => {
      cancelled = true;
    };
  }, [
    isDriverLiveSharing,
    liveDriverLatitude,
    liveDriverLongitude,
    liveDriverRawAddress,
    resolveReadableAddress,
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
      setError(err.message || 'Request failed.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const triggerA11yFeedback = useCallback(
    (announcement) => {
      if (passengerAccessibility?.haptic_feedback) {
        Vibration.vibrate(15);
      }
      if (passengerAccessibility?.screen_reader_enabled || passengerAccessibility?.voice_guidance) {
        AccessibilityInfo.announceForAccessibility(String(announcement || '').trim());
      }
    },
    [passengerAccessibility],
  );

  const notifyWithVoice = useCallback(
    (title, body) => {
      Alert.alert(title, body);
      triggerA11yFeedback(`${title}. ${body}`);
    },
    [triggerA11yFeedback],
  );

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
      'Active ride status refreshed.',
    );
    if (booking) {
      setActiveBooking(booking);
    } else {
      setActiveBooking(null);
    }
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
        setMessage('Booking list refreshed.');
      }
      return bookings;
    } catch (err) {
      const errorMsg = err.message || 'Could not load booking list.';
      if (!silent) {
        setError(errorMsg);
      }
      setPassengerBookings([]);
      return [];
    }
  }, [applyDriverRelationshipState, historyPageSize, token]);

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
          const enabledProducts =
            availability.enabled_products.length > 0 ? availability.enabled_products : ['normal'];
          setRideProductAvailability({
            enabled_products: enabledProducts,
            pickup_district: availability.pickup_district || null,
          });
          if (!enabledProducts.includes(effectiveRideProduct)) {
            // Only reset if user hasn't explicitly selected a custom ride
            // (i.e., they're still using the defaults)
            const isUsingDefaults = effectiveRideProduct === 'normal' && 
                                   (!effectiveSelectedVehicleTypeId || effectiveSelectedVehicleTypeId === 'auto');
            
            if (isUsingDefaults) {
              setRideProduct('normal');
            } else {
              // User has a custom selection, keep it (product may become available elsewhere)
              // Log the mismatch but don't force reset
              console.log('[RIDE_PRODUCT_UNAVAILABLE_AT_LOCATION]', {
                selected: effectiveRideProduct,
                available: enabledProducts,
                keeping: 'user selection'
              });
            }
            
            if (!silent && isUsingDefaults) {
              setMessage('Selected ride product is not active here. Switched to Normal.');
            }
          }
        }
      } catch (err) {
        if (!silent) {
          setError(err.message || 'Could not load ride product settings.');
        }
      } finally {
        if (!silent) {
          setRideProductsLoading(false);
        }
      }
    },
    [effectiveRideProduct, pickupLocation?.address],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      refreshRideProductAvailability({ silent: true }).catch(() => null);
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [refreshRideProductAvailability]);

  const fetchSpinWinStatus = useCallback(
    async ({ silent = false } = {}) => {
      try {
        if (!silent) {
          setSpinWinLoading(true);
        }
        const status = await apiRequest('/spin-win/config', { token });
        setSpinWinStatus(status || null);
      } catch (err) {
        if (!silent) {
          setError(err.message || 'Could not load Spin & Win status.');
        }
      } finally {
        if (!silent) {
          setSpinWinLoading(false);
        }
      }
    },
    [token],
  );

  const spinNow = useCallback(async () => {
    if (spinningNow) {
      return;
    }
    try {
      setSpinningNow(true);
      setError('');
      const result = await apiRequest('/spin-win/spin', { method: 'POST', token });
      const rewardLabel = String(result?.reward?.prize_label || 'Reward').trim() || 'Reward';
      const remaining = Number(result?.spins_left_today ?? 0);
      setMessage(`Spin complete: ${rewardLabel}. Spins left today: ${remaining}.`);
      await fetchSpinWinStatus({ silent: true });
    } catch (err) {
      setError(err.message || 'Spin failed. Please try again.');
    } finally {
      setSpinningNow(false);
    }
  }, [fetchSpinWinStatus, spinningNow, token]);

  useEffect(() => {
    let unmounted = false;
    const refreshSilently = async () => {
      if (unmounted || passengerPollInFlightRef.current) {
        return;
      }
      if (appStateRef.current !== 'active') {
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
        const [active, bookings, spinStatus] = await Promise.all([
          quietPollRequest(requestActiveBooking()),
          includeBookings ? quietPollRequest(apiRequest('/bookings', { token })) : Promise.resolve(null),
          includeSpinStatus ? quietPollRequest(apiRequest('/spin-win/config', { token })) : Promise.resolve(null),
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
        if (!backedOff) {
          passengerPollCooldownUntilRef.current = 0;
        }
      } catch (err) {
        applyPassengerPollBackoff(err);
        // Keep last known state on silent refresh failures.
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
  }, [activePassengerMenu, requestActiveBooking, token]);

  useEffect(() => {
    // Auto-refresh history when user opens the history tab
    if (activePassengerMenu === 'history') {
      const timer = setTimeout(() => {
        refreshPassengerBookings({ silent: true });
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [activePassengerMenu, refreshPassengerBookings]);

  useEffect(() => {
    const bookingId = activeBooking?.id || null;
    const status = String(activeBookingStatus || '').toLowerCase() || null;
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

    // Comprehensive booking state announcements for better UX
    const bookingStateMessages = {
      pending: { title: 'Booking Pending', msg: 'Your booking is being processed.' },
      searching: { title: 'Searching for Drivers', msg: 'We are finding the best driver for you.' },
      accepted: { title: 'Driver Found', msg: 'Your driver has accepted your ride.' },
      driver_arrived: { title: 'Driver Arrived', msg: 'Your driver has arrived at the pickup point.' },
      in_progress: { title: 'Trip Started', msg: 'Your trip has started.' },
      completed: { title: 'Trip Completed', msg: 'Your trip has ended.' },
      cancelled: { title: 'Booking Cancelled', msg: 'Your booking has been cancelled.' },
      rejected: { title: 'Booking Rejected', msg: 'Your booking request was not accepted. Please try again.' },
      no_driver_found: { title: 'No Driver Available', msg: 'Sorry, no drivers are currently available. Please try again later.' },
      booking_failed: { title: 'Booking Failed', msg: 'There was an issue booking your ride. Please try again.' },
      waiting_for_payment: { title: 'Payment Required', msg: 'Please complete the payment to continue.' },
      rating_pending: { title: 'Rate Your Ride', msg: 'Please rate your ride experience.' },
    };

    const announcement = bookingStateMessages[status];
    if (announcement) {
      notifyWithVoice(announcement.title, announcement.msg);
    }
  }, [activeBooking?.id, activeBookingStatus, notifyWithVoice]);

  const confirmCreateParallelBooking = () =>
    new Promise((resolve) => {
      let answered = false;
      const decide = (value) => {
        if (!answered) {
          answered = true;
          resolve(value);
        }
      };

      Alert.alert(
        'Active Ride in Progress',
        'You already have an active ride booking.\n\nDo you want to create another ride request?',
        [
          { text: 'Keep Current Ride', style: 'cancel', onPress: () => decide(false) },
          { text: 'Add Another Ride', style: 'default', onPress: () => decide(true) },
        ],
        {
          cancelable: true,
          onDismiss: () => decide(false),
        },
      );
    });

  const handleSearchTextChange = async (point, text) => {
    setError('');
    const normalized = text || '';

    if (point === 'pickup') {
      setPickupQuery(normalized);
      setLocationValidation((prev) => ({ ...prev, pickup: false }));
      if (pickupLocation && normalized.trim() !== String(pickupLocation.address || '').trim()) {
        setPickupLocation(null);
        pickupLocationRef.current = null;
        setRoutePreviewLocations((prev) => ({ ...prev, pickup: null }));
        setRoutePreviewDistanceKm(0);
        setFare(null);
        setNearbyDrivers([]);
        setOptedOutDriverIds([]);
        setSelectedDriverId('');
      }
    } else {
      setDropoffQuery(normalized);
      setLocationValidation((prev) => ({ ...prev, dropoff: false }));
      if (dropoffLocation && normalized.trim() !== String(dropoffLocation.address || '').trim()) {
        setDropoffLocation(null);
        dropoffLocationRef.current = null;
        setRoutePreviewLocations((prev) => ({ ...prev, dropoff: null }));
        setRoutePreviewDistanceKm(0);
        setFare(null);
        setNearbyDrivers([]);
        setOptedOutDriverIds([]);
        setSelectedDriverId('');
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
      setError('Location search is temporarily unavailable.');
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
        latitude: searchBias.latitude,
        longitude: searchBias.longitude,
        countryCode: 'in',
      });

      if (requestRef.current !== requestId) {
        return;
      }

      setSuggestions(suggestions.slice(0, 5));
    } catch (err) {
      if (requestRef.current === requestId) {
        setSuggestions([]);
        setError(err.message || 'Could not search locations.');
      }
    } finally {
      if (requestRef.current === requestId) {
        setSearching(false);
      }
    }
  };

  const handleSelectSuggestion = async (point, suggestion) => {
    try {
      setError('');
      if (!placesConfigured) {
        setError('Location search is temporarily unavailable.');
        return;
      }

      if (point === 'pickup') {
        setSearchingPickup(true);
      } else {
        setSearchingDropoff(true);
      }

      const location = await getPlaceLocation(suggestion);
      setLocationForPoint(point, location);
      animateMapToLocation(location);

      if (point === 'pickup') {
        setSelectingPoint('dropoff');
        setMessage('Pickup selected. Choose drop location.');
      } else {
        setSelectingPoint('pickup');
        setMessage('Drop location selected.');
      }
    } catch (err) {
      setError(err.message || 'Could not select place.');
    } finally {
      if (point === 'pickup') {
        setSearchingPickup(false);
      } else {
        setSearchingDropoff(false);
      }
    }
  };

  const autofillPickupFromCurrentLocation = useCallback(async ({ silent = false } = {}) => {
    try {
      setLocatingPickup(true);
      setError('');
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        if (!silent) {
          setError('Location permission denied. You can still type or pick from map.');
        }
        return;
      }

      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const latitude = Number(current.coords.latitude.toFixed(6));
      const longitude = Number(current.coords.longitude.toFixed(6));
      let address = `Lat ${latitude}, Lng ${longitude}`;

      try {
        const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
        const first = Array.isArray(geo) ? geo[0] : null;
        if (first) {
          const formatted = [first.name, first.street, first.city, first.region]
            .filter(Boolean)
            .join(', ');
          if (formatted) {
            address = formatted;
          }
        }
      } catch {
        // Keep lat/lng fallback when reverse geocoding is unavailable.
      }

      const nextLocation = { latitude, longitude, address };
      setLocationForPoint('pickup', nextLocation);
      setSelectingPoint('dropoff');
      animateMapToLocation(nextLocation);
      if (!silent) {
        setMessage('Pickup autofilled from current location. You can edit it.');
      }
    } catch (err) {
      if (!silent) {
        setError(err.message || 'Could not fetch current location.');
      }
    } finally {
      setLocatingPickup(false);
    }
  }, [animateMapToLocation]);

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
    setSelectedDriverId((previousSelectedId) =>
      previousSelectedId && !merged.some((item) => item.driver_id === previousSelectedId)
        ? ''
        : previousSelectedId,
    );
    return merged;
  }, []);

  const resolveNearbyDriverLookupLocation = useCallback(async () => {
    const routeLocation = normalizeLocation(pickupLocation || activeBooking?.pickup_location);
    if (routeLocation) {
      return routeLocation;
    }
    try {
      setLocatingPickup(true);
      setError('');
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        return null;
      }
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const latitude = Number(current.coords.latitude.toFixed(6));
      const longitude = Number(current.coords.longitude.toFixed(6));
      return { latitude, longitude, address: `Lat ${latitude}, Lng ${longitude}` };
    } catch {
      return null;
    } finally {
      setLocatingPickup(false);
    }
  }, [activeBooking?.pickup_location, normalizeLocation, pickupLocation]);

  const refreshNearbyDriversForMenu = useCallback(async ({ silent = false } = {}) => {
    const lookupLocation = await resolveNearbyDriverLookupLocation();
    if (!lookupLocation) {
      setNearbyDrivers([]);
      setSelectedDriverId('');
      if (!silent) {
        setError('Select pickup or allow current location to find nearby drivers.');
      }
      return null;
    }

    setAutoFetchingTripData(true);
    try {
      const query = {
        latitude: lookupLocation.latitude,
        longitude: lookupLocation.longitude,
        radius_km: 2,
        vehicle_type_id: effectiveSelectedVehicleTypeId || undefined,
        vehicle_subtype_id: effectiveSelectedVehicleModelId || undefined,
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
        setError(err.message || 'Could not fetch nearby drivers.');
      }
      return null;
    } finally {
      setAutoFetchingTripData(false);
    }
  }, [
    applyNearbyDrivers,
    dropoffLocation,
    effectiveRideProduct,
    effectiveSelectedVehicleModelId,
    effectiveSelectedVehicleTypeId,
    resolveNearbyDriverLookupLocation,
    token,
  ]);

  const refreshDriverDiscovery = useCallback(async ({ silent = false } = {}) => {
    const activePickupLocation = pickupLocation || pickupLocationRef.current;
    const activeDropoffLocation = dropoffLocation || dropoffLocationRef.current;

    if (!activePickupLocation || !activeDropoffLocation) {
      setFare(null);
      setNearbyDrivers([]);
      setSelectedDriverId('');
      return;
    }
    try {
      setAutoFetchingTripData(true);
      const [estimate, drivers, favorites, blocked] = await Promise.all([
        apiRequest('/fare/estimate', {
          method: 'POST',
          body: {
            pickup_location: activePickupLocation,
            drop_location: activeDropoffLocation,
            vehicle_type_id: effectiveSelectedVehicleTypeId || undefined,
            vehicle_subtype_id: effectiveSelectedVehicleModelId || undefined,
            ride_type: effectiveRideProduct || undefined,
          },
        }),
        apiRequest('/drivers/nearby', {
          token,
          query: {
            latitude: activePickupLocation.latitude,
            longitude: activePickupLocation.longitude,
            drop_latitude: activeDropoffLocation.latitude,
            drop_longitude: activeDropoffLocation.longitude,
            radius_km: 2,
            vehicle_type_id: effectiveSelectedVehicleTypeId || undefined,
            vehicle_subtype_id: effectiveSelectedVehicleModelId || undefined,
            ride_type: effectiveRideProduct || undefined,
          },
        }),
        apiRequest('/passengers/favorite-drivers', {
          token,
          query: {
            latitude: activePickupLocation.latitude,
            longitude: activePickupLocation.longitude,
            include_availability: true,
          },
        }).catch(() => []),
        apiRequest('/passengers/blocked-drivers', { token }).catch(() => ({ driver_ids: [] })),
      ]);

      setFare(estimate || null);
      applyNearbyDrivers(drivers, favorites, blocked);
    } catch (err) {
      const fallbackDistanceKm = calculateDirectDistanceKm(activePickupLocation, activeDropoffLocation);
      if (fallbackDistanceKm > 0) {
        setFare((currentFare) => currentFare || {
          distance_km: Number(fallbackDistanceKm.toFixed(2)),
          total_fare: 0,
          source: 'local_distance_fallback',
        });
      }
      if (!silent) {
        setError(err.message || 'Could not auto-calculate fare or drivers.');
      }
    } finally {
      setAutoFetchingTripData(false);
    }
  }, [
    applyNearbyDrivers,
    dropoffLocation,
    effectiveRideProduct,
    effectiveSelectedVehicleModelId,
    effectiveSelectedVehicleTypeId,
    pickupLocation,
    token,
  ]);

  useEffect(() => {
    refreshDriverDiscoveryRef.current = refreshDriverDiscovery;
  }, [refreshDriverDiscovery]);

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
        refreshDriverDiscovery({ silent: true }).catch(() => null);
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

  const startVisibleBookingMode = useCallback(
    (product, announcement, options = {}) => {
      const nextProduct = String(product || 'normal').trim() || 'normal';
      handleRideProductSelect(nextProduct);
      setActivePassengerMenu(PRIMARY_PASSENGER_MENU_KEY);
      setShowPassengerMenus(false);
      if (options.passengerCount) {
        setPassengerCountInput(String(options.passengerCount));
      }
      if (options.openRideDetails !== false) {
        setShowRideDetailsModal(true);
      }
      if (announcement) {
        setMessage(announcement);
        triggerA11yFeedback(announcement);
      }
    },
    [handleRideProductSelect, triggerA11yFeedback],
  );

  const getMenuLabel = useCallback(
    (menu) => {
      if (menu?.key === 'notifications' && unreadCount > 0) {
        return `${menu.label} (${unreadCount})`;
      }
      return menu?.label || 'Menu';
    },
    [unreadCount],
  );

  const handleMenuSelection = useCallback(
    (menuKey, label) => {
      if (menuKey === PRIMARY_PASSENGER_MENU_KEY) {
        startVisibleBookingMode('normal', label ? `${label} opened` : 'Ride booking opened', {
          openRideDetails: false,
        });
        return;
      }

      if (menuKey === 'pooling') {
        setRideProduct('pool');
        setShowRideDetailsModal(false);
        setPoolCreateRequest((prev) => ({ key: prev.key + 1, model: 'SYSTEM_CREATED' }));
        setActivePassengerMenu('pooling');
        setShowPassengerMenus(false);
        triggerA11yFeedback('Pool ride mode activated');
        return;
      }

      if (menuKey === 'family') {
        startVisibleBookingMode(
          'normal',
          'Family booking opened. Add pickup, destination, passenger count and notes.',
          { passengerCount: passengerCountInput && passengerCountInput !== '1' ? passengerCountInput : '2' },
        );
        return;
      }

      if (menuKey === 'corporate') {
        startVisibleBookingMode('corporate', 'Corporate booking opened. Enter company code, pickup and destination.');
        return;
      }

      if (menuKey === 'travel') {
        startVisibleBookingMode('tourism', 'Travel packages opened. Choose package, city, add-ons, pickup and destination.');
        return;
      }

      if (menuKey === 'scheduled_rides') {
        startVisibleBookingMode('scheduled', 'Scheduled ride opened. Pick route and future pickup time.');
        return;
      }

      setActivePassengerMenu(menuKey);
      setShowPassengerMenus(false);
      triggerA11yFeedback(`${label || 'Menu'} selected`);
    },
    [passengerCountInput, startVisibleBookingMode, triggerA11yFeedback],
  );

  const openPoolRideFlow = useCallback(
    (model = 'SYSTEM_CREATED') => {
      setRideProduct('pool');
      setShowRideDetailsModal(false);
      setPoolCreateRequest((prev) => ({ key: prev.key + 1, model }));
      handleMenuSelection('pooling', 'Pool Ride');
    },
    [handleMenuSelection],
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
            selected && styles.menuChipActive,
          ]}
          onPress={() => handleMenuSelection(menu.key, label)}
          accessibilityRole="tab"
          accessibilityLabel={label}
          accessibilityState={{ selected }}>
          <View style={[styles.menuIconBadge, selected && styles.menuIconBadgeActive]}>
            <PassengerMenuIcon symbol={menu.symbol} selected={selected} />
          </View>
          <Text
            style={[styles.menuChipText, selected && styles.menuChipTextActive]}
            numberOfLines={1}>
            {label}
          </Text>
        </TouchableOpacity>
      );
    },
    [activePassengerMenu, getMenuLabel, handleMenuSelection],
  );

  const openRideEmergencyPanel = useCallback(() => {
    handleMenuSelection('emergency', 'Emergency during this ride');
    setMessage('Opening emergency contacts for this ride.');
  }, [handleMenuSelection]);

  const activateRideSos = useCallback(async () => {
    if (!activeBooking?.id) {
      setError('SOS is available once an active ride is loaded.');
      return;
    }
    setError('');
    setMessage('Activating SOS...');
    try {
      Vibration.vibrate([0, 120, 80, 120]);
    } catch {
      // Best-effort haptic feedback.
    }
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

  useEffect(() => {
    if (autoPickupInitializedRef.current || pickupLocation) {
      return;
    }
    autoPickupInitializedRef.current = true;
    autofillPickupFromCurrentLocation({ silent: true }).catch(() => null);
  }, [autofillPickupFromCurrentLocation, pickupLocation]);

  const toggleFavoriteDriver = async (driverId, isFavorite) => {
    const done = await callApi(
      () =>
        apiRequest(`/passengers/favorite-drivers/${driverId}`, {
          method: 'PUT',
          token,
          body: { is_favorite: !isFavorite },
        }),
      isFavorite ? 'Removed favorite driver.' : 'Driver marked as favorite.',
    );
    if (done) {
      setFavoriteDriverIds((prev) => (
        isFavorite
          ? prev.filter((item) => item !== driverId)
          : prev.includes(driverId) ? prev : [...prev, driverId]
      ));
      if (pickupLocation && dropoffLocation) {
        await refreshDriverDiscovery({ silent: true });
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
      isBlocked ? 'Driver unblocked.' : 'Driver blocked.',
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
        await refreshDriverDiscovery({ silent: true });
      } else if (activePassengerMenu === 'drivers') {
        await refreshNearbyDriversForMenu({ silent: true });
      }
    }
  };

  const createBooking = async () => {
    if (!validateBothLocations()) {
      return;
    }
    if (!new Set(enabledRideProducts).has(effectiveRideProduct)) {
      const districtLabel = rideProductAvailability?.pickup_district || 'this district';
      setError(`Selected product is not active in ${districtLabel}.`);
      return;
    }
    const isScheduledMode = effectiveRideProduct === 'scheduled';
    let scheduledForIso = undefined;
    if (isScheduledMode) {
      const scheduleValidation = validateScheduledPickup(scheduledAtInput, scheduledTimeZone);
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

    const passengerCountValue = Number(String(passengerCountInput || '').trim());
    const passengerCount = Number.isFinite(passengerCountValue)
      ? Math.max(1, Math.min(6, Math.round(passengerCountValue)))
      : 1;
    if (effectiveRideProduct === 'corporate' && !corporateCode.trim()) {
      setError('Corporate code required.');
      return;
    }
    if (effectiveRideProduct === 'airport' && (!flightNumber.trim() || !airportTerminal.trim())) {
      setError('Flight number and terminal are required for airport rides.');
      return;
    }
    const rentalHoursValue = Number(String(rentalHoursInput || '').trim());
    const rentalHours = Number.isFinite(rentalHoursValue)
      ? Math.max(1, Math.min(12, Math.round(rentalHoursValue)))
      : 0;
    if (effectiveRideProduct === 'rental_hourly' && rentalHours <= 0) {
      setError('Rental hours required.');
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

    const bookingEligibility = await callApi(() =>
      apiRequest('/passenger/documents/can-book-ride', { token }),
    );
    if (!bookingEligibility) {
      return;
    }
    if (bookingEligibility.can_book_ride === false) {
      const eligibilityReason = bookingEligibility.reason || 'Complete KYC and mandatory documents before booking.';
      setError(eligibilityReason);
      setActivePassengerMenu(String(eligibilityReason).toLowerCase().includes('document') ? 'documents' : 'kyc');
      return;
    }

    let existingActive = null;
    try {
      existingActive = await requestActiveBooking();
    } catch (err) {
      const cooldownMs = getPassengerPollBackoffMs(err);
      if (cooldownMs > 0) {
        setPassengerPollCooldown(passengerPollCooldownUntilRef, cooldownMs);
        setError(
          getPassengerSyncDelayMessage(err, 'Could not confirm active ride status. Please try again.'),
        );
        return;
      }
    }
    let allowParallel = false;
    if (existingActive) {
      const shouldCreateAnother = await confirmCreateParallelBooking();
      if (!shouldCreateAnother) {
        setMessage('Keeping existing booking in progress.');
        return;
      }
      allowParallel = true;
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
    const booking = await callApi(() =>
      apiRequest('/bookings/advanced', {
        method: 'POST',
        token,
        body: {
          pickup_location: pickupLocation,
          drop_location: {
            ...dropoffLocation,
            distance_km: Number(
              getFareDistanceKm(fare) ||
                calculateDirectDistanceKm(pickupLocation, dropoffLocation) ||
                dropoffLocation?.distance_km ||
                0,
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
          safe_ride_priority: effectiveRideProduct === 'school_elderly_safe' ? safeRidePriority : undefined,
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
          vehicle_subtype_id: effectiveSelectedVehicleModelId || undefined,
          vehicle_model: selectedVehicleModelDisplayName || undefined,
          notes: rideNotes.length ? rideNotes.join(' | ') : undefined,
        },
      }),
    );
    if (booking) {
      setActiveBooking(booking);
      setBookingJustCreated(true);
      setMessage(isScheduledMode ? 'Scheduled ride request created.' : 'Ride request created.');
      triggerA11yFeedback(isScheduledMode ? 'Scheduled ride request created' : 'Ride request created');
      refreshPassengerBookings({ silent: true });
    }
  };

  const cancelBooking = async () => {
    if (!activeBooking?.id) {
      return;
    }
    if (!canCancelActiveBooking) {
      setError('Ride can be cancelled while pending, scheduled, or after driver arrival before trip start.');
      return;
    }
    const pickupAddr = normalizeLocation(activeBooking.pickup_location || pickupLocation)?.address || 'Pickup location';
    const dropAddr = normalizeLocation(activeBooking.drop_location || activeBooking.dropoff_location || dropoffLocation)?.address || 'Drop location';
    const cancellationPolicyText = driverArrivedCancellationApplies
      ? 'Your driver has arrived. If you cancel now, the minimum fare will be payable to the driver.'
      : 'Free cancellation applies while the ride is pending or scheduled.';
    return new Promise((resolve) => {
      Alert.alert(
        'Confirm Cancellation',
        `Are you sure you want to cancel this ride?\n\nFrom: ${pickupAddr}\nTo: ${dropAddr}\n\n${cancellationPolicyText}`,
        [
          { text: 'Keep Ride', style: 'cancel', onPress: () => {
            setMessage('Cancellation aborted.');
            resolve(false);
          } },
          { text: 'Cancel Ride', style: 'destructive', onPress: async () => {
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
              setMessage('Booking cancelled.');
              triggerA11yFeedback('Booking cancelled');
              await refreshActiveBooking();
              await refreshPassengerBookings({ silent: true });
            }
            resolve(cancelled ? true : false);
          } },
        ],
      );
    });
  };

  const handleMapPress = (event) => {
    const coordinate = event.nativeEvent.coordinate;
    const nextLocation = buildLocationFromCoordinate(coordinate);
    setError('');

    if (selectingPoint === 'pickup') {
      setLocationForPoint('pickup', nextLocation);
      setSelectingPoint('dropoff');
      setMessage('Pickup selected. Resolving address...');
      animateMapToLocation(nextLocation);
      resolveAddressForPoint('pickup', coordinate).catch(() => null);
      return;
    }

    setLocationForPoint('dropoff', nextLocation);
    setSelectingPoint('pickup');
    setMessage('Drop selected. Resolving address...');
    animateMapToLocation(nextLocation);
    resolveAddressForPoint('dropoff', coordinate).catch(() => null);
  };

  const handlePickupDrag = (event) => {
    const coordinate = event.nativeEvent.coordinate;
    const nextLocation = buildLocationFromCoordinate(coordinate);
    setLocationForPoint('pickup', nextLocation);
    setMessage('Pickup moved. Resolving address...');
    resolveAddressForPoint('pickup', coordinate).catch(() => null);
  };

  const handleDropoffDrag = (event) => {
    const coordinate = event.nativeEvent.coordinate;
    const nextLocation = buildLocationFromCoordinate(coordinate);
    setLocationForPoint('dropoff', nextLocation);
    setMessage('Drop moved. Resolving address...');
    resolveAddressForPoint('dropoff', coordinate).catch(() => null);
  };

  const clearLocations = () => {
    setPickupLocation(null);
    setDropoffLocation(null);
    setPickupQuery('');
    setDropoffQuery('');
    setPickupSuggestions([]);
    setDropoffSuggestions([]);
    setSelectingPoint('pickup');
    setFare(null);
    setNearbyDrivers([]);
    setSelectedDriverId('');
    setOptedOutDriverIds([]);
    setLocationValidation({ pickup: false, dropoff: false });
    setMessage('Pickup and drop cleared.');
    setError('');
  };

  const refreshPassengerDashboard = async () => {
    await refreshActiveBooking();
    await refreshPassengerBookings({ silent: true });
    await refreshRideProductAvailability({ silent: true });
    await refreshDriverDiscovery({ silent: true });
  };

  useEffect(() => {
    if (!liveDriverLocation) {
      return;
    }
    mapRef.current?.animateToRegion?.(
      {
        latitude: liveDriverLocation.latitude,
        longitude: liveDriverLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      passengerAccessibility?.reduce_motion ? 0 : 600,
    );
  }, [liveDriverLocation, passengerAccessibility?.reduce_motion]);

  const handleQuickConfirmRide = async () => {
    const activePickupLocation = pickupLocation || pickupLocationRef.current || routePreviewLocations.pickup;
    const activeDropoffLocation = dropoffLocation || dropoffLocationRef.current || routePreviewLocations.dropoff;
    if (!activePickupLocation) {
      await autofillPickupFromCurrentLocation({ silent: false });
      if (!activeDropoffLocation) {
        setError('Select your destination to continue.');
      }
      return;
    }
    if (!activeDropoffLocation) {
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
    animateMapToLocation(item.location);
    setMessage('Destination selected. Review fare and confirm.');
  };

  const renderQuickSuggestion = (item, point) => (
    <TouchableOpacity
      key={`quick-${point}-${item.placeId}`}
      style={styles.quickSuggestionRow}
      onPress={() => handleSelectSuggestion(point, item)}>
      <View style={styles.quickSuggestionPin} />
      <Text style={styles.quickSuggestionText} numberOfLines={2}>{item.description}</Text>
    </TouchableOpacity>
  );

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
            School
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.modeChip, safeRidePriority === 'elderly' && styles.modeChipActive]}
          onPress={() => setSafeRidePriority('elderly')}
          disabled={loading}>
          <Text style={[styles.modeChipText, safeRidePriority === 'elderly' && styles.modeChipTextActive]}>
            Elderly
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

  const renderRideDetailsModal = () => (
    <Modal
      visible={showRideDetailsModal}
      animationType="slide"
      transparent
      onRequestClose={closeRideDetailsModal}>
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
                <Text style={styles.rideDetailsSectionTitle}>Corporate details</Text>
                <VoiceTextInput
                  style={styles.input}
                  value={corporateCode}
                  onChangeText={setCorporateCode}
                  placeholder="Corporate code"
                  placeholderTextColor={COLORS.textMuted}
                />
                <VoiceTextInput
                  style={styles.input}
                  value={corporatePurpose}
                  onChangeText={setCorporatePurpose}
                  placeholder="Trip purpose (optional)"
                  placeholderTextColor={COLORS.textMuted}
                />
                <VoiceTextInput
                  style={styles.input}
                  value={corporateCostCenterId}
                  onChangeText={setCorporateCostCenterId}
                  placeholder="Cost center / project code (optional)"
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
                  placeholder="Flight number"
                  placeholderTextColor={COLORS.textMuted}
                />
                <VoiceTextInput
                  style={styles.input}
                  value={airportTerminal}
                  onChangeText={setAirportTerminal}
                  placeholder="Airport terminal"
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
                    {intercityReturnTrip ? 'Return trip: yes' : 'Return trip: no'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modeChip, intercityTollsIncluded && styles.modeChipActive]}
                  onPress={() => setIntercityTollsIncluded((prev) => !prev)}
                  disabled={loading}>
                  <Text style={[styles.modeChipText, intercityTollsIncluded && styles.modeChipTextActive]}>
                    {intercityTollsIncluded ? 'Tolls included' : 'Tolls extra'}
                  </Text>
                </TouchableOpacity>
                <VoiceTextInput
                  style={styles.input}
                  value={intercityWaitHoursInput}
                  onChangeText={(value) => setIntercityWaitHoursInput(value.replace(/[^0-9]/g, '').slice(0, 2))}
                  placeholder="Outstation wait hours (0 to 72)"
                  placeholderTextColor={COLORS.textMuted}
                  keyboardType="numeric"
                />
                <VoiceTextInput
                  style={[styles.input, styles.assistedNotesInput]}
                  value={intercityRouteNotes}
                  onChangeText={(value) => setIntercityRouteNotes(value.slice(0, 240))}
                  placeholder="Route notes (optional)"
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
                  placeholder="Rental hours"
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
    </Modal>
  );

  const renderPassengerQuickBooking = () => (
    <View style={styles.quickBookingSheet}>
      <View style={styles.quickSheetHandle} />
      <View style={styles.quickBookingHeader}>
        <View style={styles.quickBookingTitleBlock}>
          <Text style={styles.quickGreeting}>Hi {user?.name || 'there'}</Text>
          <Text style={styles.quickTitle}>Where are you going?</Text>
          <Text style={styles.quickSubtitle}>Speak in English or Malayalam, then confirm the ride.</Text>
        </View>
        <TouchableOpacity
          style={styles.quickMoreButton}
          onPress={() => {
            setShowPassengerMenus((prev) => !prev);
            setActivePassengerMenu(PRIMARY_PASSENGER_MENU_KEY);
          }}>
          <Text style={styles.quickMoreText}>{showPassengerMenus ? 'Hide' : 'Menu'}</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.quickLanguageToggle}>
        {[
          { code: 'en', label: 'English' },
          { code: 'ml', label: 'Malayalam' },
        ].map((option) => {
          const selected = voiceLanguageCode === option.code;
          return (
            <TouchableOpacity
              key={option.code}
              style={[styles.quickLanguageChip, selected && styles.quickLanguageChipActive]}
              onPress={() => handleQuickLanguageChange(option.code)}
              accessibilityRole="button"
              accessibilityState={{ selected }}>
              <Text style={[styles.quickLanguageText, selected && styles.quickLanguageTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[styles.quickVoiceCard, voiceBooking.voiceState === 'listening' && styles.quickVoiceCardListening]}
        onPress={() => {
          voiceBooking.reset();
          setShowVoiceBooking(true);
        }}
        accessibilityRole="button"
        accessibilityLabel="Book by voice">
        <View style={[styles.quickVoiceIcon, voiceBooking.voiceState === 'listening' && styles.quickVoiceIconListening]}>
          <Text style={styles.quickVoiceIconText}>{voiceBooking.voiceState === 'listening' ? '||' : 'mic'}</Text>
        </View>
        <View style={styles.quickVoiceCopy}>
          <Text style={styles.quickVoiceTitle}>Book by voice</Text>
          <Text style={styles.quickVoiceHint}>Try Malayalam or English. Example: Book an auto to Kollam railway station.</Text>
        </View>
        <Text style={styles.quickVoiceAction}>Speak</Text>
      </TouchableOpacity>

      <View style={styles.quickStepRow}>
        {['Destination', 'Ride', 'Confirm'].map((label, index) => {
          const stepNumber = index + 1;
          const active = quickBookingStep >= stepNumber;
          return (
            <View key={label} style={styles.quickStepItem}>
              <View style={[styles.quickStepDot, active && styles.quickStepDotActive]}>
                <Text style={[styles.quickStepNumber, active && styles.quickStepNumberActive]}>{stepNumber}</Text>
              </View>
              <Text style={[styles.quickStepLabel, active && styles.quickStepLabelActive]} numberOfLines={1}>
                {label}
              </Text>
            </View>
          );
        })}
      </View>

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
            <Text style={styles.quickRouteValue} numberOfLines={1}>{quickPickupText}</Text>
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
              voiceLang={voiceLanguage}
            />
          </View>
        </View>
      </View>

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
          key={`ride-choice-${selectedRideChoiceLabel || 'default'}`}
          style={styles.quickChoiceChip}
          onPress={() => setShowRideDetailsModal(true)}
          accessibilityLabel="Select ride details"
          accessibilityRole="button">
          <Text style={styles.quickChoiceLabel}>Ride</Text>
          <Text key={`ride-choice-value-${selectedRideChoiceLabel || 'default'}`} style={styles.quickChoiceValue} numberOfLines={1}>
            {selectedRideChoiceLabel || 'Auto / Standard / Normal'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.quickFareCard}>
        <View>
          <Text style={styles.quickFareLabel}>{quickBookingReady ? 'Estimated fare' : 'Trip preview'}</Text>
          <Text style={styles.quickFareValue}>
            {quickFareValue > 0 ? quickFareLabel : autoFetchingTripData ? 'Calculating...' : quickFareLabel}
          </Text>
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
        disabled={loading}>
        <Text style={styles.quickConfirmText}>
          {loading ? 'Requesting ride...' : quickBookingReady ? 'Confirm Ride' : 'Select destination'}
        </Text>
      </TouchableOpacity>

      <View style={styles.quickSecondaryActions}>
        <TouchableOpacity
          style={styles.quickSecondaryButton}
          onPress={() => setShowInteractiveMap((prev) => !prev)}>
          <Text style={styles.quickSecondaryText}>{showInteractiveMap ? 'Map pick on' : 'Map pick off'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.quickSecondaryButton}
          onPress={() => handleMenuSelection('safety', 'Safety')}>
          <Text style={styles.quickSecondaryText}>Safety</Text>
        </TouchableOpacity>
        {typeof onProfilePress === 'function' && (
          <TouchableOpacity style={styles.quickSecondaryButton} onPress={onProfilePress}>
            <Text style={styles.quickSecondaryText}>Profile</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.quickSecondaryButton} onPress={onLogout}>
          <Text style={styles.quickSecondaryText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, accessibilityUi.containerStyle]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        customMapStyle={passengerMapStyle}
        initialRegion={DEFAULT_REGION}
        onMapReady={() => setMapError('')}
        onMapLoaded={() => setMapError('')}
        onError={(event) =>
          setMapError(event?.nativeEvent?.error || 'Map failed to render on this device.')
        }
        onPress={handleMapPress}>
        {pickupLocation && (
          <Marker
            coordinate={pickupLocation}
            title="Pickup"
            description={pickupLocation.address}
            pinColor="#E53935"
            draggable
            onDragEnd={handlePickupDrag}
          />
        )}
        {dropoffLocation && (
          <Marker
            coordinate={dropoffLocation}
            title="Dropoff"
            description={dropoffLocation.address}
            pinColor="#1E88E5"
            draggable
            onDragEnd={handleDropoffDrag}
          />
        )}
        {isDriverLiveSharing && liveDriverLocation && (
          <Marker
            coordinate={liveDriverLocation}
            title="Driver Live Location"
            description={driverOnline ? 'Driver is online' : 'Driver reconnecting'}
            pinColor="#0B8F3A"
          />
        )}
      </MapView>
      {!!mapError && (
        <View style={styles.mapErrorCard}>
          <Text style={styles.mapErrorText}>{mapError}</Text>
        </View>
      )}

      {activePassengerMenu !== PRIMARY_PASSENGER_MENU_KEY && (
        <View style={[styles.topBar, accessibilityUi.panelStyle]}>
          <View>
            <Text style={[styles.hello, accessibilityUi.titleStyle]}>Hi, {user?.name || 'Passenger'}</Text>
            <Text style={[styles.sub, accessibilityUi.textStyle]}>Passenger Command Center</Text>
          </View>
          {typeof onProfilePress === 'function' && (
            <TouchableOpacity onPress={onProfilePress} style={styles.logoutButton}>
              <Text style={styles.logoutText}>Profile</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => handleMenuSelection('safety', 'Safety')}
            style={[styles.logoutButton, styles.safetyHeaderButton]}>
            <Text style={[styles.logoutText, styles.safetyHeaderText]}>Safety</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={onLogout} style={styles.logoutButton}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.bottomCard, accessibilityUi.panelStyle]}>
        <ScrollView
          contentContainerStyle={styles.bottomCardScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          {activePassengerMenu !== PRIMARY_PASSENGER_MENU_KEY && (
            <>
              <Text style={[styles.title, accessibilityUi.titleStyle]}>Ride Flow</Text>
              <Text style={[styles.route, accessibilityUi.textStyle]}>Tap map to pick {selectingPoint}</Text>
            </>
          )}
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
          {shouldShowPassengerMenuRails && (
            <>
              <View style={styles.dashboardTopRow}>
                <TouchableOpacity
                  style={[
                    styles.primaryMenuButton,
                    activePassengerMenu === PRIMARY_PASSENGER_MENU_KEY && styles.primaryMenuButtonActive,
                  ]}
                  accessibilityRole="tab"
                  accessibilityLabel="Ride Booking"
                  accessibilityState={{ selected: activePassengerMenu === PRIMARY_PASSENGER_MENU_KEY }}
                  onPress={() => {
                    handleMenuSelection(PRIMARY_PASSENGER_MENU_KEY, 'Ride Booking');
                  }}>
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
                    <Text style={styles.primaryMenuButtonText}>Ride Booking</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.menuToggleButton}
                  accessibilityRole="button"
                  accessibilityLabel={showPassengerMenus ? 'Hide passenger menu groups' : 'Show passenger menu groups'}
                  accessibilityState={{ expanded: showPassengerMenus }}
                  onPress={() =>
                    setShowPassengerMenus((prev) => {
                      const next = !prev;
                      triggerA11yFeedback(next ? 'Other menus opened' : 'Other menus closed');
                      return next;
                    })
                  }>
                  <Text style={styles.menuToggleButtonText}>{showPassengerMenus ? 'Hide Menus' : 'Other Menus'}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.pinnedMenuRow}>
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
                {getMenuLabel(PASSENGER_MENU_BY_KEY[activePassengerMenu]) || 'Menu'}
              </Text>
              <TouchableOpacity
                style={styles.menuToggleButton}
                accessibilityRole="tab"
                accessibilityLabel="Back to Ride"
                accessibilityState={{ selected: false }}
                onPress={() => handleMenuSelection(PRIMARY_PASSENGER_MENU_KEY, 'Ride Booking')}>
                <Text style={styles.menuToggleButtonText}>Back to Ride</Text>
              </TouchableOpacity>
            </View>
          )}

          {activePassengerMenu === 'wallet' && (
            <View style={styles.infoBlock}>
              <Text style={styles.infoTitle}>Wallet & Revenue</Text>
              <RevenueCard token={token} role={user?.role} />
            </View>
          )}
          {activePassengerMenu === 'safety' && (
            <View style={styles.infoBlock}>
              <Text style={styles.infoTitle}>Safety</Text>
              <KeralaSafetyCard safety={keralaSafety} />
            </View>
          )}

          {activePassengerMenu === 'ride' && renderPassengerQuickBooking()}

          {SHOW_LEGACY_ONE_PAGE_BOOKING_FLOW && activePassengerMenu === 'ride' && (
            <>
              {/* PHASE 2: Interactive Map for faster location selection - 67% time reduction */}
              {showInteractiveMap && (
                <View style={{ marginBottom: 12, paddingHorizontal: 12 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={styles.searchLabel}>📍 Select Locations on Map</Text>
                    <TouchableOpacity onPress={() => setShowInteractiveMap(false)}>
                      <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: '500' }}>Hide</Text>
                    </TouchableOpacity>
                  </View>
                  <InteractiveMap
                    pickupLocation={pickupLocation}
                    dropoffLocation={dropoffLocation}
                    selectingPoint={!pickupLocation ? 'pickup' : !dropoffLocation ? 'dropoff' : null}
                    onLocationSelect={(point, location) => {
                      setLocationForPoint(point, location);
                    }}
                    center={
                      pickupLocation || dropoffLocation
                        ? { latitude: (pickupLocation || dropoffLocation).latitude, longitude: (pickupLocation || dropoffLocation).longitude }
                        : DEFAULT_REGION
                    }
                  />
                </View>
              )}

              {!pickupLocation || !dropoffLocation ? (
                <TouchableOpacity
                  onPress={() => setShowInteractiveMap(true)}
                  style={{ paddingVertical: 8, paddingHorizontal: 12, marginBottom: 8 }}>
                  <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: '500' }}>
                    {showInteractiveMap ? '' : 'Show Interactive Map'}
                  </Text>
                </TouchableOpacity>
              ) : null}

              <TouchableOpacity
                onPress={() => setShowBookingFlow(true)}
                style={[
                  styles.confirmButton,
                  { backgroundColor: COLORS.primary, marginHorizontal: 12, marginBottom: 12, paddingVertical: 12 },
                ]}>
                <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '600', textAlign: 'center' }}>
                  📱 Book New Ride (Two-Screen Flow)
                </Text>
              </TouchableOpacity>

              {/* One-page booking removed: prefer two-screen flow to reduce scrolling and confusion */}

              <View style={styles.searchBlock}>
                <Text style={styles.searchLabel}>Select Point</Text>
                <View style={styles.modeRow}>
                  <TouchableOpacity
                    style={[styles.selectChip, selectingPoint === 'pickup' && styles.selectChipActive]}
                    onPress={() => setSelectingPoint('pickup')}>
                    <Text style={[styles.selectChipText, selectingPoint === 'pickup' && styles.selectChipTextActive]}>
                      Pickup
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.selectChip, selectingPoint === 'dropoff' && styles.selectChipActive]}
                    onPress={() => setSelectingPoint('dropoff')}>
                    <Text style={[styles.selectChipText, selectingPoint === 'dropoff' && styles.selectChipTextActive]}>
                      Drop
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.clearChip} onPress={clearLocations}>
                    <Text style={styles.clearChipText}>Clear</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.pickupLabelRow}>
                  <Text style={styles.searchLabel}>Pickup Search</Text>
                  <TouchableOpacity
                    style={styles.currentLocationInlineChip}
                    onPress={() => autofillPickupFromCurrentLocation({ silent: false })}
                    disabled={loading || locatingPickup}>
                    <Text style={styles.currentLocationInlineText}>
                      {locatingPickup ? 'Fetching...' : 'Use Current'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <VoiceTextInput
                  value={pickupQuery}
                  onChangeText={(text) => handleSearchTextChange('pickup', text)}
                  placeholder="Enter pickup area, landmark, or address"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.searchInput}
                />
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
                {searchingPickup && <Text style={styles.searchHint}>Searching pickup...</Text>}
                {pickupSuggestions.map((item) => (
                  <TouchableOpacity
                    key={`pickup-${item.placeId}`}
                    style={styles.suggestionRow}
                    onPress={() => handleSelectSuggestion('pickup', item)}>
                    <Text style={styles.suggestionText}>{item.description}</Text>
                  </TouchableOpacity>
                ))}
                {locationValidation.pickup && (
                  <Text style={styles.validationText}>Pickup location is required before booking.</Text>
                )}

                <Text style={styles.searchLabel}>Drop Search</Text>
                <VoiceTextInput
                  value={dropoffQuery}
                  onChangeText={(text) => handleSearchTextChange('dropoff', text)}
                  placeholder="Enter drop area, landmark, or address"
                  placeholderTextColor={COLORS.textMuted}
                  style={styles.searchInput}
                />
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
                {searchingDropoff && <Text style={styles.searchHint}>Searching drop...</Text>}
                {dropoffSuggestions.map((item) => (
                  <TouchableOpacity
                    key={`drop-${item.placeId}`}
                    style={styles.suggestionRow}
                    onPress={() => handleSelectSuggestion('dropoff', item)}>
                    <Text style={styles.suggestionText}>{item.description}</Text>
                  </TouchableOpacity>
                ))}
                {locationValidation.dropoff && (
                  <Text style={styles.validationText}>Drop location is required before booking.</Text>
                )}
              </View>
              <View style={styles.infoBlock}>
                <Text style={styles.infoTitle}>Ride Type</Text>
                {!!rideProductAvailability?.pickup_district && (
                  <Text style={styles.hint}>District: {rideProductAvailability.pickup_district}</Text>
                )}
                {rideProductsLoading && (
                  <Text style={styles.hint}>Updating ride products...</Text>
                )}
                <RideProductsGrid
                  selected={effectiveRideProduct}
                  enabledKeys={enabledRideProducts}
                  hideInactive
                  heading="Choose Ride Product"
                  subheading="Select the ride product for this booking"
                  onSelect={handleRideProductSelect}
                />

                {/* Vehicle Type Selector */}
                <View style={styles.vehicleTypeSection}>
                  <Text style={styles.infoText}>Vehicle Type</Text>
                  {vehicleTypesLoading ? (
                    <ActivityIndicator size="small" color={COLORS.primary} />
                  ) : (
                    <ScrollView 
                      horizontal 
                      style={styles.vehicleTypeScrollView}
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

                {isScheduledBookingMode && (
                  <View>
                    <ScheduledPickupPicker
                      value={scheduledAtInput}
                      onChangeText={setScheduledAtInput}
                      timezone={scheduledTimeZone}
                      onTimezoneChange={setScheduledTimeZone}
                      inputStyle={styles.input}
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
                <Text style={styles.infoText}>Passengers (optional)</Text>
                <VoiceTextInput
                  style={styles.input}
                  value={passengerCountInput}
                  onChangeText={setPassengerCountInput}
                  keyboardType="number-pad"
                  placeholder="Passenger count (1-6, optional)"
                  placeholderTextColor={COLORS.textMuted}
                />
                {effectiveRideProduct === 'corporate' && (
                  <View style={styles.productRequirementBox}>
                    <Text style={styles.productRequirementTitle}>Corporate details</Text>
                    <VoiceTextInput
                      style={styles.input}
                      value={corporateCode}
                      onChangeText={setCorporateCode}
                      placeholder="Corporate code"
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <VoiceTextInput
                      style={styles.input}
                      value={corporatePurpose}
                      onChangeText={setCorporatePurpose}
                      placeholder="Trip purpose (optional)"
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <VoiceTextInput
                      style={styles.input}
                      value={corporateCostCenterId}
                      onChangeText={setCorporateCostCenterId}
                      placeholder="Cost center / project code (optional)"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  </View>
                )}
                {effectiveRideProduct === 'airport' && (
                  <View style={styles.productRequirementBox}>
                    <Text style={styles.productRequirementTitle}>Airport details required</Text>
                    <VoiceTextInput
                      style={styles.input}
                      value={flightNumber}
                      onChangeText={setFlightNumber}
                      placeholder="Flight number (e.g., AI123)"
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <VoiceTextInput
                      style={styles.input}
                      value={airportTerminal}
                      onChangeText={setAirportTerminal}
                      placeholder="Terminal (e.g., T1, T2)"
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
                        {intercityReturnTrip ? 'Return trip: yes' : 'Return trip: no'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modeChip, intercityTollsIncluded && styles.modeChipActive]}
                      onPress={() => setIntercityTollsIncluded((prev) => !prev)}
                      disabled={loading}>
                      <Text style={[styles.modeChipText, intercityTollsIncluded && styles.modeChipTextActive]}>
                        {intercityTollsIncluded ? 'Tolls included' : 'Tolls extra'}
                      </Text>
                    </TouchableOpacity>
                    <VoiceTextInput
                      style={styles.input}
                      value={intercityWaitHoursInput}
                      onChangeText={(value) => setIntercityWaitHoursInput(value.replace(/[^0-9]/g, '').slice(0, 2))}
                      placeholder="Outstation wait hours (0 to 72)"
                      placeholderTextColor={COLORS.textMuted}
                      keyboardType="numeric"
                    />
                    <VoiceTextInput
                      style={[styles.input, styles.assistedNotesInput]}
                      value={intercityRouteNotes}
                      onChangeText={(value) => setIntercityRouteNotes(value.slice(0, 240))}
                      placeholder="Route notes (optional)"
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
                    placeholder="Rental hours"
                    placeholderTextColor={COLORS.textMuted}
                  />
                )}
                {effectiveRideProduct === 'school_elderly_safe' && renderAssistedRideFields()}
              </View>

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
                <Text style={styles.infoText}>
                  Payment: {selectedPaymentMethod === 'online' ? 'Online' : 'Cash'}
                </Text>
                {!!selectedPaymentChannel && (
                  <Text style={styles.infoText}>
                    Channel: {String(selectedPaymentChannel).toUpperCase()}
                  </Text>
                )}
                {isScheduledBookingMode && (
                  <Text style={styles.infoText}>
                    Driver: {driverGenderPreferenceLabel(effectiveScheduledDriverGenderPreference)}
                  </Text>
                )}
                {appliedPromo?.code ? (
                  <Text style={styles.infoText}>
                    Promo: {appliedPromo.code}
                  </Text>
                ) : (
                  <Text style={styles.infoText}>Promo: none</Text>
                )}
                {!!passengerPreferences?.language && (
                  <Text style={styles.infoText}>
                    Language: {String(passengerPreferences.language).toUpperCase()}
                  </Text>
                )}
                {passengerAccessibility?.high_contrast ? (
                  <Text style={styles.infoText}>Accessibility: High contrast enabled</Text>
                ) : null}
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.actionButton} onPress={createBooking} disabled={loading}>
                  <Text style={styles.actionText}>
                    {isScheduledBookingMode
                      ? 'Schedule Ride'
                      : selectedDriverId
                        ? 'Book Selected Driver'
                        : 'Book Auto (Nearest 5)'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButtonMuted}
                  onPress={refreshPassengerDashboard}
                  disabled={loading}>
                  <Text style={styles.actionText}>Refresh</Text>
                </TouchableOpacity>
              </View>
            </>
          )}

          {activePassengerMenu === 'drivers' && (
            <>
              {fare && (
                <View style={styles.infoBlock}>
                  <Text style={styles.infoTitle}>Fare Estimate</Text>
                  <Text style={styles.infoText}>
                    INR {fare.total_fare} | {fare.distance_km} km | surge {fare.surge_multiplier}x
                  </Text>
                  <VoiceTextInput
                    style={styles.input}
                    value={fareExpectationInput}
                    onChangeText={setFareExpectationInput}
                    keyboardType="decimal-pad"
                    placeholder="Your max fare expectation (optional)"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  {!!fareExpectation && (
                    <Text style={styles.hint}>Showing drivers with projected fare up to INR {fareExpectation.toFixed(2)}</Text>
                  )}
                </View>
              )}

              {nearbyDrivers.length > 0 ? (
                <View style={styles.infoBlock}>
                  <View style={styles.driverHeaderRow}>
                    <Text style={styles.infoTitle}>Nearest Drivers (Top 5)</Text>
                    {optedOutDriverIds.length > 0 && (
                      <TouchableOpacity style={styles.driverChip} onPress={resetDriverOptOuts}>
                        <Text style={styles.driverChipText}>Reset Opt-outs</Text>
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
                          {driver.source === 'favorite_fallback' ? ' (Favorite - outside nearby)' : ''}
                        </Text>
                        <Text style={styles.infoText}>
                          {Number(driver.distance_km || 0).toFixed(2)} km | rating {driver.rating}
                        </Text>
                        {showDriverFare && (
                          <Text style={styles.infoText}>
                            Projected fare: INR {driverFare.toFixed(2)}
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
                            {selectedDriverId === driver.driver_id ? 'Selected' : 'Select'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.driverChip}
                          onPress={() => toggleFavoriteDriver(driver.driver_id, favoriteDriverIds.includes(driver.driver_id))}>
                          <Text style={styles.driverChipText}>
                            {favoriteDriverIds.includes(driver.driver_id) ? 'Unfavorite' : 'Favorite'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.driverChip}
                          onPress={() => toggleBlockedDriver(driver.driver_id, blockedDriverIds.includes(driver.driver_id))}>
                          <Text style={styles.driverChipText}>
                            {blockedDriverIds.includes(driver.driver_id) ? 'Unblock' : 'Block'}
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.driverChip} onPress={() => optOutDriver(driver.driver_id)}>
                          <Text style={styles.driverChipText}>Opt Out</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    );
                  })}
                  {visibleDrivers.length === 0 && (
                    <Text style={styles.hint}>
                      No drivers match your fare expectation. Increase expectation or reset opt-outs.
                    </Text>
                  )}
                </View>
              ) : (
                <View style={styles.infoBlock}>
                  <Text style={styles.infoText}>
                    No drivers found within 2 km. Select pickup or allow current location, then try refresh.
                  </Text>
                </View>
              )}

              {blockedDriverIds.length > 0 && (
                <View style={styles.infoBlock}>
                  <Text style={styles.infoTitle}>Blocked Drivers</Text>
                  {blockedDriverIds.slice(0, 8).map((driverId) => (
                    <View key={driverId} style={styles.blockedRow}>
                      <Text style={styles.infoText}>{driverId}</Text>
                      <TouchableOpacity style={styles.driverChip} onPress={() => toggleBlockedDriver(driverId, true)}>
                        <Text style={styles.driverChipText}>Unblock</Text>
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
                <View style={styles.infoBlock}>
                  <Text style={styles.infoTitle}>Live Trip</Text>
                  <Text style={styles.infoText}>Track ride status, OTP, and driver updates here.</Text>
                </View>
              ) : (
                <View style={styles.infoBlock}>
                  <Text style={styles.infoText}>No active ride right now.</Text>
                </View>
              )}

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.actionButtonMuted}
                  onPress={refreshPassengerDashboard}
                  disabled={loading}>
                  <Text style={styles.actionText}>Refresh</Text>
                </TouchableOpacity>
              </View>

              {activeBooking && (
                <View style={styles.infoBlock}>
                  <Text style={styles.infoTitle}>Active Booking</Text>
                  <Text style={styles.infoText}>ID: {activeBooking.id}</Text>
                  <Text style={styles.infoText}>Status: {activeBookingStatus || activeBooking.status}</Text>
                  {!!activeBooking.driver_name && (
                    <Text style={styles.infoText}>Driver: {activeBooking.driver_name}</Text>
                  )}
                  {!!normalizeLocation(activeBooking.pickup_location) && (
                    <Text style={styles.infoText}>
                      From: {normalizeLocation(activeBooking.pickup_location).address}
                    </Text>
                  )}
                  {!!normalizeLocation(activeBooking.drop_location || activeBooking.dropoff_location) && (
                    <Text style={styles.infoText}>
                      To: {normalizeLocation(activeBooking.drop_location || activeBooking.dropoff_location).address}
                    </Text>
                  )}
                  {!!liveDriverLocation && (
                    <>
                      <Text style={styles.infoText}>
                        Driver live location: {driverLiveLocationLabel}
                      </Text>
                      <Text style={styles.infoText}>
                        Driver Live: {liveDriverLocation.latitude.toFixed(5)}, {liveDriverLocation.longitude.toFixed(5)}
                      </Text>
                      {/* Prominently display ETA */}
                      {(activeBookingStatus === 'driver_arrived' || activeBookingStatus === 'in_progress') && (
                        <View style={{ backgroundColor: COLORS.secondary, borderRadius: 8, padding: 12, marginVertical: 8 }}>
                          <Text style={{ color: COLORS.mutedDark, fontSize: 12, fontWeight: '600', marginBottom: 4 }}>
                            {activeBookingStatus === 'driver_arrived' ? 'ETA to Pickup' : 'ETA to Dropoff'}
                          </Text>
                          <Text style={{ color: COLORS.primary, fontSize: 20, fontWeight: 'bold' }}>
                            {activeBookingStatus === 'driver_arrived' ? (etaToPickup ? `${etaToPickup} min` : 'Calculating...') : (etaToDrop ? `${etaToDrop} min` : 'Calculating...')}
                          </Text>
                        </View>
                      )}
                      <Text style={styles.infoText}>
                        Driver Network: {driverOnline ? 'Online' : 'Reconnecting...'}
                      </Text>
                    </>
                  )}
                  {activeBookingStatus === 'driver_arrived' && !!activeRideStartOtp && (
                    <Text style={styles.otpShareText}>
                      Share OTP with driver: {activeRideStartOtp}
                    </Text>
                  )}
                  {activeBookingStatus === 'in_progress' && !!activeRideEndOtp && (
                    <Text style={styles.otpShareText}>
                      Share completion OTP with driver: {activeRideEndOtp}
                    </Text>
                  )}
                  <Text style={styles.infoText}>Fare: INR {activeBooking.estimated_fare}</Text>
                  <View style={styles.rideEmergencyCard}>
                    <View style={styles.rideEmergencyCopy}>
                      <Text style={styles.rideEmergencyTitle}>SOS quick access</Text>
                      <Text style={styles.rideEmergencyText}>
                        Tap to confirm SOS, or long-press SOS Now to activate immediately.
                      </Text>
                    </View>
                    <View style={styles.rideEmergencyActions}>
                      <TouchableOpacity
                        style={[styles.rideEmergencyButton, keralaSafety.busy && styles.rideEmergencyButtonDisabled]}
                        onPress={confirmRideSos}
                        onLongPress={activateRideSos}
                        disabled={keralaSafety.busy}
                        accessibilityRole="button"
                        accessibilityLabel="Activate SOS for this ride">
                        <Text style={styles.rideEmergencyButtonText}>
                          {keralaSafety.busy ? 'Sending...' : 'SOS Now'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.rideEmergencySecondaryButton}
                        onPress={openRideEmergencyPanel}
                        accessibilityRole="button"
                        accessibilityLabel="Open emergency contacts">
                        <Text style={styles.rideEmergencySecondaryText}>Contacts</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  {activeBookingStatus === 'driver_arrived' && !!activeRideStartOtp && (
                    <View style={[styles.infoBlock, { backgroundColor: COLORS.secondary, borderRadius: 8, padding: 12, marginVertical: 8 }]}>
                      <Text style={[styles.infoTitle, { fontSize: 14, marginBottom: 6 }]}>Share OTP with Driver</Text>
                      <Text style={[styles.infoText, { fontSize: 22, fontWeight: 'bold', letterSpacing: 3, textAlign: 'center' }]}>
                        {activeRideStartOtp}
                      </Text>
                    </View>
                  )}
                  {activeBookingStatus === 'in_progress' && !!activeRideEndOtp && (
                    <View style={[styles.infoBlock, { backgroundColor: COLORS.secondary, borderRadius: 8, padding: 12, marginVertical: 8 }]}>
                      <Text style={[styles.infoTitle, { fontSize: 14, marginBottom: 6 }]}>Completion OTP</Text>
                      <Text style={[styles.infoText, { fontSize: 22, fontWeight: 'bold', letterSpacing: 3, textAlign: 'center' }]}>
                        {activeRideEndOtp}
                      </Text>
                    </View>
                  )}
                  {canCancelActiveBooking ? (
                    <TouchableOpacity onPress={cancelBooking} style={styles.cancelButton} disabled={loading}>
                      <Text style={styles.cancelText}>Cancel Booking</Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={styles.infoText}>Cancellation is unavailable now. It is allowed before dispatch or after driver arrival before trip start.</Text>
                  )}
                  <RideCommunicationCard
                    token={token}
                    booking={activeBooking}
                    currentUserId={user?.id}
                    counterpartName={activeBooking.driver_name || 'Driver'}
                  />
                  
                  {/* Active Ride Quick Actions */}
                  <View style={styles.quickActionsRow}>
                    <TouchableOpacity
                      style={[styles.quickActionButton, { backgroundColor: '#FF9800' }]}
                      onPress={() => {
                        Alert.alert(
                          'Report Issue',
                          'Report a problem with this ride?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Report',
                              style: 'default',
                              onPress: () => {
                                setActivePassengerMenu('support');
                                setMessage('Opening support to report issue...');
                              },
                            },
                          ]
                        );
                      }}
                    >
                      <Text style={styles.quickActionIcon}>⚠️</Text>
                      <Text style={styles.quickActionLabel}>Report Issue</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.quickActionButton, { backgroundColor: '#2196F3' }]}
                      onPress={() => {
                        Alert.alert(
                          'Lost Item',
                          'Report a lost item?',
                          [
                            { text: 'Cancel', style: 'cancel' },
                            {
                              text: 'Report Lost Item',
                              style: 'default',
                              onPress: () => {
                                setActivePassengerMenu('support');
                                setMessage('Opening support to report lost item...');
                              },
                            },
                          ]
                        );
                      }}
                    >
                      <Text style={styles.quickActionIcon}>🔍</Text>
                      <Text style={styles.quickActionLabel}>Lost Item</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </>
          )}
          {activePassengerMenu === 'history' && (
            <View style={styles.infoBlock}>
              <View style={styles.driverHeaderRow}>
                <Text style={styles.infoTitle}>Ride History</Text>
                <TouchableOpacity
                  style={styles.driverChip}
                  onPress={() => refreshPassengerBookings({ silent: false })}
                  disabled={loading}>
                  <Text style={styles.driverChipText}>Refresh</Text>
                </TouchableOpacity>
              </View>
              {passengerBookings.length === 0 ? (
                <Text style={styles.infoText}>No rides yet.</Text>
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
                        <Text style={styles.historyCardDriver}>{booking.driver_name || 'Driver not assigned'}</Text>
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
                              {isFavoriteDriver ? 'Unfavorite' : 'Favorite'}
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
                              {isBlockedDriver ? 'Unblock' : 'Block'}
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
          {activePassengerMenu === 'spin' && (
            <View style={styles.infoBlock}>
              <Text style={styles.infoTitle}>Spin & Win</Text>
              {!spinWinStatus ? (
                <Text style={styles.infoText}>Spin status is unavailable. Tap refresh.</Text>
              ) : (
                <>
                  <Text style={styles.infoText}>
                    Status: {spinWinStatus.enabled ? 'Enabled' : 'Disabled'}
                  </Text>
                  <Text style={styles.infoText}>
                    Daily limit: {Number(spinWinStatus.daily_spin_limit || 0)} | Used:{' '}
                    {Number(spinWinStatus.spins_used_today || 0)} | Left:{' '}
                    {Number(spinWinStatus.spins_left_today || 0)}
                  </Text>
                  {!spinWinStatus.eligible && (
                    <Text style={styles.infoText}>
                      {spinWinStatus.eligibility_reason || 'Not eligible for Spin & Win.'}
                    </Text>
                  )}
                </>
              )}
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={spinNow}
                  disabled={
                    spinningNow ||
                    spinWinLoading ||
                    !spinWinStatus?.eligible ||
                    Number(spinWinStatus?.spins_left_today || 0) <= 0
                  }>
                  <Text style={styles.actionText}>{spinningNow ? 'Spinning...' : 'Spin Now'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButtonMuted}
                  onPress={() => fetchSpinWinStatus({ silent: false })}
                  disabled={spinWinLoading}>
                  <Text style={styles.actionText}>{spinWinLoading ? 'Refreshing...' : 'Refresh'}</Text>
                </TouchableOpacity>
              </View>
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
            <AccessibilityPanel token={token} onSettingsChange={setPassengerAccessibility} />
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
              onOpenRide={() => handleMenuSelection(PRIMARY_PASSENGER_MENU_KEY, 'Ride Booking')}
              onRideCancelled={async () => {
                await refreshActiveBooking();
                await refreshPassengerBookings({ silent: true });
              }}
            />
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

        {renderRideDetailsModal()}

        {/* Booking Flow Modal */}
        <Modal
          visible={showBookingFlow}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setShowBookingFlow(false)}>
            <PassengerBookingNavigator
              onBookingComplete={handleBookingComplete}
              onCancel={handleBookingCancel}
              initialPickup={pickupLocation}
              initialDropoff={dropoffLocation}
              recentBookings={passengerBookings}
            />
        </Modal>

        <VoiceBookingOverlay
          visible={showVoiceBooking}
          voiceState={voiceBooking.voiceState}
          transcript={voiceBooking.transcript}
          lastIntent={voiceBooking.lastIntent}
          errorMessage={voiceBooking.errorMessage}
          isVoiceAvailable={voiceBooking.isVoiceAvailable}
          onStartListening={voiceBooking.startListening}
          onStopListening={voiceBooking.stopListening}
          onConfirm={() => voiceBooking.confirmAndBook(token)}
          onRetry={voiceBooking.reset}
          onClose={() => {
            voiceBooking.reset();
            setShowVoiceBooking(false);
          }}
        />

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  map: { flex: 1 },
  mapErrorCard: {
    position: 'absolute',
    top: 132,
    left: 16,
    right: 16,
    backgroundColor: '#FFEDEB',
    borderWidth: 1,
    borderColor: '#F28B82',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  mapErrorText: {
    color: '#8A1C1C',
    fontSize: 12,
    fontWeight: '600',
  },
  topBar: {
    position: 'absolute',
    top: 52,
    left: 16,
    right: 16,
    padding: 14,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    ...SHADOWS.card,
  },
  hello: { color: COLORS.textMain, fontSize: 18, fontWeight: '900' },
  sub: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  logoutButton: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...SHADOWS.soft,
  },
  logoutText: { color: COLORS.textMain, fontWeight: '700' },
  safetyHeaderButton: {
    backgroundColor: '#FFF8E7',
    borderColor: '#E0A82E',
  },
  safetyHeaderText: { color: '#73510A' },
  bottomCard: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 12,
    maxHeight: '72%',
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 12,
    ...SHADOWS.card,
  },
  bottomCardScrollContent: {
    paddingBottom: 20,
  },
  title: { color: COLORS.textMain, fontSize: 22, fontWeight: '800' },
  route: { color: COLORS.textMuted, marginTop: 4, marginBottom: 10 },
  quickBookingSheet: {
    backgroundColor: '#FFFFFF',
    paddingBottom: 6,
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
    fontSize: 22,
    lineHeight: 27,
    fontWeight: '900',
  },
  quickSubtitle: {
    color: '#66786D',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 4,
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
  quickLanguageToggle: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  quickLanguageChip: {
    flex: 1,
    minHeight: 40,
    borderWidth: 1,
    borderColor: '#D8E5DC',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  quickLanguageChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#E8F5EC',
  },
  quickLanguageText: {
    color: '#456253',
    fontSize: 13,
    fontWeight: '900',
  },
  quickLanguageTextActive: {
    color: COLORS.primaryDark,
  },
  quickVoiceCard: {
    minHeight: 74,
    borderWidth: 1,
    borderColor: '#CFE0D4',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
  },
  quickVoiceCardListening: {
    borderColor: '#D88A1D',
    backgroundColor: '#FFF8EC',
  },
  quickVoiceIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.primary,
  },
  quickVoiceIconListening: {
    backgroundColor: '#D88A1D',
  },
  quickVoiceIconText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  quickVoiceCopy: {
    flex: 1,
    minWidth: 0,
  },
  quickVoiceTitle: {
    color: COLORS.textMain,
    fontSize: 15,
    fontWeight: '900',
    lineHeight: 20,
  },
  quickVoiceHint: {
    color: '#66786D',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 2,
  },
  quickVoiceAction: {
    color: '#0B6A32',
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
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(17, 31, 24, 0.42)',
  },
  rideDetailsPanel: {
    maxHeight: '86%',
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
    maxHeight: 520,
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
  dashboardTopRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
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
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: COLORS.bg,
  },
  menuToggleButtonText: { color: COLORS.textMain, fontWeight: '700' },
  pinnedMenuRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  secondaryMenuPanel: {
    gap: 10,
    marginBottom: 10,
  },
  menuGroup: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
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
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 40,
    maxWidth: '100%',
    paddingVertical: 7,
    paddingHorizontal: 9,
  },
  pinnedMenuChip: {
    flexGrow: 1,
    flexBasis: '45%',
  },
  menuChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#E4F2E8',
  },
  menuIconBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAF2ED',
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
    color: COLORS.textMain,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  menuChipTextActive: { color: COLORS.primaryDark },
  selectRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  selectChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 9,
  },
  selectChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#E4F2E8',
  },
  selectChipText: { color: COLORS.muted, fontWeight: '700' },
  selectChipTextActive: { color: COLORS.primaryDark },
  clearChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 9,
  },
  clearChipText: { color: COLORS.textMain, fontWeight: '700' },
  currentLocationChip: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: '#E4F2E8',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 9,
  },
  currentLocationText: { color: COLORS.primaryDark, fontWeight: '700' },
  locationBlock: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: COLORS.bg,
    ...SHADOWS.soft,
  },
  locationValueBox: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
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
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
    marginBottom: 8,
  },
  modeChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surface,
  },
  modeChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#E3F2E8',
  },
  modeChipText: { color: COLORS.textMain, fontWeight: '700' },
  modeChipTextActive: { color: COLORS.primaryDark },
  assistedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  assistedInput: {
    flexGrow: 1,
    flexBasis: 150,
    minWidth: 140,
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
    minHeight: 72,
    textAlignVertical: 'top',
  },
  searchBlock: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: COLORS.bg,
    ...SHADOWS.soft,
  },
  searchLabel: {
    color: COLORS.textMain,
    fontWeight: '700',
    marginBottom: 6,
  },
  pickupLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  currentLocationInlineChip: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    backgroundColor: '#E4F2E8',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
  },
  currentLocationInlineText: { color: COLORS.primaryDark, fontWeight: '700', fontSize: 12 },
  searchInput: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    backgroundColor: COLORS.surface,
    color: COLORS.textMain,
    paddingHorizontal: 11,
    paddingVertical: 10,
    marginBottom: 8,
  },
  searchHint: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginBottom: 8,
  },
  suggestionRow: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    backgroundColor: COLORS.surface,
    marginBottom: 6,
  },
  suggestionText: { color: COLORS.textMain, fontSize: 13 },
  loader: { marginVertical: 8 },
  error: { color: COLORS.danger, marginBottom: 8 },
  message: { color: COLORS.secondary, marginBottom: 8 },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  poolActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  poolActionButton: {
    flexGrow: 1,
    alignItems: 'center',
  },
  actionButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    ...SHADOWS.soft,
  },
  actionButtonMuted: {
    backgroundColor: COLORS.primaryDark,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    ...SHADOWS.soft,
  },
  actionText: { color: '#fff', fontWeight: '700' },
  infoBlock: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: COLORS.background,
    ...SHADOWS.soft,
  },
  subscriptionPlanRow: {
    marginTop: 8,
    gap: 8,
  },
  subscriptionPlanChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: COLORS.surface,
  },
  subscriptionPlanChipSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#E3F2E8',
  },
  subscriptionPlanChipDisabled: {
    opacity: 0.5,
  },
  subscriptionPlanChipText: {
    color: COLORS.textMain,
    fontWeight: '700',
    fontSize: 12,
  },
  subscriptionPlanChipTextSelected: {
    color: COLORS.primaryDark,
  },
  subscriptionDueBox: {
    marginTop: 8,
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: COLORS.textMain,
    backgroundColor: COLORS.surface,
    marginTop: 8,
    marginBottom: 6,
  },
  productRequirementBox: {
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
    borderRadius: 8,
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginVertical: 8,
  },
  productRequirementTitle: {
    color: '#E65100',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  hint: { color: COLORS.textMuted, fontSize: 12, marginBottom: 8 },
  driverHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  driverRow: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    backgroundColor: COLORS.surface,
    ...SHADOWS.soft,
  },
  driverInfoBlock: {
    marginBottom: 8,
  },
  driverNameText: {
    color: COLORS.textMain,
    fontWeight: '700',
    marginBottom: 2,
  },
  driverActionBlock: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  driverChip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: COLORS.background,
  },
  driverChipSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#E3F2E8',
  },
  driverChipText: {
    color: COLORS.textMain,
    fontWeight: '700',
    fontSize: 12,
  },
  driverChipTextSelected: {
    color: COLORS.primaryDark,
  },
  blockedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  infoTitle: { color: COLORS.textMain, fontWeight: '700', marginBottom: 4 },
  infoText: { color: COLORS.textMuted, marginBottom: 2 },
  otpShareText: {
    color: COLORS.primaryDark,
    fontWeight: '800',
    marginBottom: 6,
  },
  rideEmergencyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#FFF4F4',
  },
  rideEmergencyCopy: {
    flex: 1,
  },
  rideEmergencyTitle: {
    color: COLORS.danger,
    fontWeight: '800',
    marginBottom: 2,
  },
  rideEmergencyText: {
    color: COLORS.textMuted,
    fontSize: 12,
  },
  rideEmergencyButton: {
    backgroundColor: COLORS.danger,
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
    borderColor: COLORS.danger,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  rideEmergencySecondaryText: {
    color: COLORS.danger,
    fontWeight: '800',
    fontSize: 12,
  },
  cancelButton: {
    marginTop: 10,
    backgroundColor: COLORS.danger,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelText: { color: '#fff', fontWeight: '700' },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  quickActionButton: {
    flex: 1,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickActionIcon: {
    fontSize: 18,
    marginBottom: 4,
  },
  quickActionLabel: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 11,
    textAlign: 'center',
  },
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
  vehicleTypeSection: {
    marginBottom: 16,
  },
  vehicleTypeScrollView: {
    marginVertical: 12,
  },
  vehicleTypeChip: {
    borderWidth: 1,
    borderColor: '#CBD9D0',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
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
    fontSize: 20,
    marginBottom: 4,
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
});

export default function PassengerMap(props) {
  return <PassengerMapContent {...props} />;
}
