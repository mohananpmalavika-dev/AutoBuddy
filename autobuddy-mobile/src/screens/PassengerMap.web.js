import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SymbolView } from 'expo-symbols';

import { apiRequest } from '../lib/api';
import { createAutoBuddySocket } from '../lib/socket';
import {
  getPlaceLocation, 
  isPlacesConfigured,
  reverseGeocodeLocation,
  searchPlaces,
} from '../lib/places';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../theme';
import { AccessibilityProvider } from '../hooks/useAccessibility';
import { useVehicleTypes } from '../hooks/useVehicleTypes';
import RideCommunicationCard from '../components/RideCommunicationCard';
import WebCommandBar from '../components/WebCommandBar';
import VoiceTextInput from '../components/VoiceTextInput';
import KeralaSafetyCard from '../components/KeralaSafetyCard';
import RevenueCard from '../components/RevenueCard';
import RideProductsGrid from '../components/RideProductsGrid';
import WebGoogleLiveMap from '../components/WebGoogleLiveMap';
import BookingConfirmationCard from '../components/BookingConfirmationCard';
import ScheduledPickupPicker from '../components/ScheduledPickupPicker';
import NotificationBell from '../components/NotificationBell';
import NotificationCenter from '../components/NotificationCenter';
import PromoCodePanel from '../components/PromoCodePanel';
import SupportTicketsPanel from '../components/SupportTicketsPanel';
import PaymentMethodsPanel from '../components/PaymentMethodsPanel';
import PassengerRatingsPanel from '../components/PassengerRatingsPanel';
import FavoriteDriversPanel from '../components/FavoriteDriversPanel';
import PreferencesPanel from '../components/PreferencesPanel';
import SavedPlacesPanel from '../components/SavedPlacesPanel';
import SavedPlacesQuickSelect from '../components/SavedPlacesQuickSelect';
import EmergencyContactsPanel from '../components/EmergencyContactsPanel';
import AccessibilityPanel from '../components/AccessibilityPanel';
import AccessibilityQuickAccess from '../components/AccessibilityQuickAccess';
import PassengerScheduledRidesPanel from '../components/PassengerScheduledRidesPanel';
import PassengerProfilePanel from '../components/PassengerProfilePanel';
import PassengerKYCPanel from '../components/PassengerKYCPanel';
import PassengerDocumentUpload from '../components/PassengerDocumentUpload';
import PassengerDocumentsPanel from '../components/PassengerDocumentsPanel';
import ReceiptsPanel from '../components/ReceiptsPanel';
import SubscriptionPanel from '../components/SubscriptionPanel';
import RideNotesPanel from '../components/RideNotesPanel';
import LocationSharingPanel from '../components/LocationSharingPanel';
import RideStatsPanel from '../components/RideStatsPanel';
import PostRideRatingModal from '../components/PostRideRatingModal';
import { NotificationProvider, useNotifications } from '../contexts/NotificationContext';
import { useNotificationManager } from '../hooks/useNotificationManager';
import {
  FadeSlideView,
  GlassCard,
  LiveEtaPulse,
  PremiumEmptyState,
  RideProgressTimeline,
} from '../components/PremiumUI';
import { useKeralaSafety } from '../hooks/useKeralaSafety';
import PassengerProfile from './PassengerProfile';
import {
  getPassengerRideProductLabels,
  resolvePassengerLocale,
} from '../locales/passengerDashboard';
import { validateScheduledPickup } from '../lib/scheduling';

const LOGO_SOURCE = require('../../assets/images/autobuddy-logo.jpg');
const PASSENGER_MENU_SYMBOLS = {
  ride: { ios: 'car.fill', android: 'local_taxi', web: 'local_taxi' },
  live: { ios: 'location.circle.fill', android: 'my_location', web: 'my_location' },
  drivers: { ios: 'person.2.fill', android: 'person_search', web: 'person_search' },
  favorites: { ios: 'star.fill', android: 'favorite', web: 'favorite' },
  safety: { ios: 'shield.fill', android: 'shield', web: 'shield' },
  wallet: { ios: 'creditcard.fill', android: 'account_balance_wallet', web: 'account_balance_wallet' },
  spin: { ios: 'gift.fill', android: 'redeem', web: 'redeem' },
  history: { ios: 'clock.arrow.circlepath', android: 'history', web: 'history' },
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
  profile: { ios: 'person.crop.circle.fill', android: 'person', web: 'person' },
  kyc: { ios: 'person.crop.rectangle', android: 'id_card', web: 'id_card' },
  documents: { ios: 'doc.text.fill', android: 'description', web: 'description' },
  receipts: { ios: 'list.bullet.rectangle.portrait.fill', android: 'receipt_long', web: 'receipt_long' },
  subscription: { ios: 'checkmark.seal.fill', android: 'workspace_premium', web: 'workspace_premium' },
  notes: { ios: 'note.text', android: 'note', web: 'note' },
  sharing: { ios: 'location.fill', android: 'location_on', web: 'location_on' },
  stats: { ios: 'chart.bar.fill', android: 'bar_chart', web: 'bar_chart' },
};
const PASSENGER_MENU_OPTIONS = [
  { key: 'ride', symbol: PASSENGER_MENU_SYMBOLS.ride },
  { key: 'live', symbol: PASSENGER_MENU_SYMBOLS.live },
  { key: 'drivers', symbol: PASSENGER_MENU_SYMBOLS.drivers },
  { key: 'favorites', symbol: PASSENGER_MENU_SYMBOLS.favorites },
  { key: 'safety', symbol: PASSENGER_MENU_SYMBOLS.safety },
  { key: 'wallet', symbol: PASSENGER_MENU_SYMBOLS.wallet },
  { key: 'spin', symbol: PASSENGER_MENU_SYMBOLS.spin },
  { key: 'history', symbol: PASSENGER_MENU_SYMBOLS.history },
  { key: 'notifications', symbol: PASSENGER_MENU_SYMBOLS.notifications },
  { key: 'promo', symbol: PASSENGER_MENU_SYMBOLS.promo },
  { key: 'support', symbol: PASSENGER_MENU_SYMBOLS.support },
  { key: 'payment', symbol: PASSENGER_MENU_SYMBOLS.payment },
  { key: 'ratings', symbol: PASSENGER_MENU_SYMBOLS.ratings },
  { key: 'preferences', symbol: PASSENGER_MENU_SYMBOLS.preferences },
  { key: 'places', symbol: PASSENGER_MENU_SYMBOLS.places },
  { key: 'emergency', symbol: PASSENGER_MENU_SYMBOLS.emergency },
  { key: 'accessibility', symbol: PASSENGER_MENU_SYMBOLS.accessibility },
  { key: 'scheduled', symbol: PASSENGER_MENU_SYMBOLS.scheduled },
  { key: 'profile', symbol: PASSENGER_MENU_SYMBOLS.profile },
  { key: 'kyc', symbol: PASSENGER_MENU_SYMBOLS.kyc },
  { key: 'documents', symbol: PASSENGER_MENU_SYMBOLS.documents },
  { key: 'receipts', symbol: PASSENGER_MENU_SYMBOLS.receipts },
  { key: 'subscription', symbol: PASSENGER_MENU_SYMBOLS.subscription },
  { key: 'notes', symbol: PASSENGER_MENU_SYMBOLS.notes },
  { key: 'sharing', symbol: PASSENGER_MENU_SYMBOLS.sharing },
  { key: 'stats', symbol: PASSENGER_MENU_SYMBOLS.stats },
];
const PRIMARY_PASSENGER_MENU_KEY = 'ride';
const buildPassengerMenuOptions = (keys) =>
  keys.map((key) => PASSENGER_MENU_OPTIONS.find((menu) => menu.key === key)).filter(Boolean);
const PINNED_PASSENGER_MENU_OPTIONS = buildPassengerMenuOptions(['drivers', 'favorites', 'safety', 'wallet']);
const SECONDARY_PASSENGER_MENU_GROUPS = [
  { key: 'trip', title: 'Trip', keys: ['scheduled', 'history', 'stats', 'notes', 'ratings', 'receipts'] },
  { key: 'deals', title: 'Deals & Payment', keys: ['spin', 'promo', 'payment', 'subscription'] },
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

function PassengerMenuIcon({ symbol, selected, size = 16 }) {
  return (
    <SymbolView
      name={symbol}
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
  const [selectingPoint, setSelectingPoint] = useState('pickup');
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [justCompletedBooking, setJustCompletedBooking] = useState(null);
  
  // Initialize notifications
  const passengerNotificationSettings = useMemo(
    () => ({
      ...(passengerPreferences || {}),
      vibration_enabled: passengerAccessibility?.haptic_feedback,
    }),
    [passengerAccessibility?.haptic_feedback, passengerPreferences],
  );
  useNotificationManager(token, user?.id, passengerNotificationSettings);
  const { unreadCount } = useNotifications();
  const { vehicleTypes: availableVehicleTypes, loading: vehicleTypesLoading } = useVehicleTypes();
  const [rideProduct, setRideProduct] = useState('normal');
  const [selectedVehicleTypeId, setSelectedVehicleTypeId] = useState('');
  const effectiveSelectedVehicleTypeId = useMemo(
    () => selectedVehicleTypeId || availableVehicleTypes?.[0]?.id || '',
    [availableVehicleTypes, selectedVehicleTypeId],
  );
  const [corporateCode, setCorporateCode] = useState('');
  const [airportTerminal, setAirportTerminal] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [tourismPackage, setTourismPackage] = useState('Kerala Local Sightseeing');
  const [intercityReturnTrip, setIntercityReturnTrip] = useState(false);
  const [rentalHoursInput, setRentalHoursInput] = useState('4');
  const [safeRidePriority, setSafeRidePriority] = useState('elderly');
  const [passengerCountInput, setPassengerCountInput] = useState('1');
  const [showProfile, setShowProfile] = useState(false);
  const [showPassengerMenus, setShowPassengerMenus] = useState(false);
  const [driverLiveAddress, setDriverLiveAddress] = useState('');
  const [activePassengerMenu, setActivePassengerMenu] = useState(PRIMARY_PASSENGER_MENU_KEY);
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
    return String(window.localStorage.getItem('autobuddy_lang') || 'en').trim().toLowerCase();
  });
  const placesConfigured = isPlacesConfigured();
  const googleMapsWebKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const liveTrackStatuses = useMemo(() => new Set(['searching', 'accepted', 'driver_arrived', 'in_progress']), []);
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

  const normalizeLocation = (location) => {
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
      address: location.address || `Lat ${Number(latitude.toFixed(6))}, Lng ${Number(longitude.toFixed(6))}`,
    };
  };

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
  const canCancelActiveBooking = activeBookingStatus === 'pending';
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
    (latitude, longitude) => `Lat ${Number(latitude).toFixed(6)}, Lng ${Number(longitude).toFixed(6)}`,
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

  const mapState = useMemo(() => {
    const origin = selectedPickupLocation;
    const destination = selectedDropoffLocation;
    const driverLiveLocation = liveDriverLocation;
    const liveTarget = activeBookingStatus === 'in_progress' ? (destination || origin) : (origin || destination);
    const usingBasicEmbed = !googleMapsWebKey;
    let fallbackUrl = '';

    if (usingBasicEmbed) {
      if (isDriverLiveSharing && driverLiveLocation && liveTarget) {
        fallbackUrl = `https://www.google.com/maps?output=embed&saddr=${driverLiveLocation.latitude},${driverLiveLocation.longitude}&daddr=${liveTarget.latitude},${liveTarget.longitude}`;
      } else if (isDriverLiveSharing && driverLiveLocation) {
        fallbackUrl = `https://www.google.com/maps?output=embed&q=${driverLiveLocation.latitude},${driverLiveLocation.longitude}&z=15`;
      } else if (origin && destination) {
        fallbackUrl = `https://www.google.com/maps?output=embed&saddr=${origin.latitude},${origin.longitude}&daddr=${destination.latitude},${destination.longitude}`;
      } else {
        const location = origin || destination;
        fallbackUrl = location
          ? `https://www.google.com/maps?output=embed&q=${location.latitude},${location.longitude}&z=14`
          : 'https://www.google.com/maps?output=embed&q=13.0827,80.2707&z=11';
      }
    } else if (isDriverLiveSharing && driverLiveLocation && liveTarget) {
      fallbackUrl = `https://www.google.com/maps/embed/v1/directions?key=${encodeURIComponent(
        googleMapsWebKey,
      )}&origin=${driverLiveLocation.latitude},${driverLiveLocation.longitude}&destination=${liveTarget.latitude},${liveTarget.longitude}&avoid=tolls|highways`;
    } else if (isDriverLiveSharing && driverLiveLocation) {
      fallbackUrl = `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(
        googleMapsWebKey,
      )}&q=${driverLiveLocation.latitude},${driverLiveLocation.longitude}&zoom=15`;
    } else if (origin && destination) {
      fallbackUrl = `https://www.google.com/maps/embed/v1/directions?key=${encodeURIComponent(
        googleMapsWebKey,
      )}&origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&avoid=tolls|highways`;
    } else {
      const location = origin || destination;
      fallbackUrl = location
        ? `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(
            googleMapsWebKey,
          )}&q=${location.latitude},${location.longitude}&zoom=14`
        : `https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(
            googleMapsWebKey,
          )}&center=13.0827,80.2707&zoom=11&maptype=roadmap`;
    }

    const routeOrigin = isDriverLiveSharing && driverLiveLocation && liveTarget
      ? driverLiveLocation
      : origin;
    const routeDestination = isDriverLiveSharing && driverLiveLocation && liveTarget
      ? liveTarget
      : destination;

    return {
      fallbackUrl,
      origin,
      destination,
      driverLiveLocation,
      routeOrigin,
      routeDestination,
    };
  }, [googleMapsWebKey, selectedPickupLocation, selectedDropoffLocation, liveDriverLocation, activeBookingStatus, isDriverLiveSharing]);

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
      const next = String(window.localStorage.getItem('autobuddy_lang') || 'en').trim().toLowerCase();
      setLanguageCode(next || 'en');
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
        if (prefs.default_payment_method) {
          setSelectedPaymentMethod(normalizeBookingPaymentMethod(prefs.default_payment_method));
        }
      }
      if (accessibility) {
        setPassengerAccessibility(accessibility);
      }
    };
    hydratePassengerSettings().catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [normalizeBookingPaymentMethod, token]);

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
      if (nextPrefs?.default_payment_method) {
        const nextDefault = String(nextPrefs.default_payment_method || '').trim();
        setSelectedPaymentMethod(normalizeBookingPaymentMethod(nextDefault));
        setSelectedPaymentChannel(nextDefault || null);
      }
    },
    [normalizeBookingPaymentMethod],
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

  const handleMenuSelection = useCallback(
    (menuKey, label) => {
      setActivePassengerMenu(menuKey);
      setShowPassengerMenus(false);
      setShowNotificationCenter(menuKey === 'notifications');
      triggerA11yFeedback(`${label || 'Menu'} selected`);
    },
    [triggerA11yFeedback],
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
    } else {
      setDropoffQuery(normalized);
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

  const handleSelectSuggestion = async (point, suggestion) => {
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
  };

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
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      if (!silent) {
        setError(t.currentLocationNotSupported);
      }
      return;
    }

    try {
      setLocatingPickup(true);
      setError('');

      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 60000,
        });
      });

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
      if (!silent) {
        const messageFromBrowser = err?.message || t.couldNotFetchCurrentLocation;
        setError(messageFromBrowser);
      }
    } finally {
      setLocatingPickup(false);
    }
  }, [placesConfigured, t]);

  const refreshActiveBooking = async () => {
    const booking = await callApi(
      () => apiRequest('/bookings/active', { token }),
      t.activeRideStatusRefreshed,
    );
    setActiveBooking(booking || null);
  };

  const refreshPassengerBookings = async ({ silent = false } = {}) => {
    try {
      setError(''); // Clear any previous errors
      const bookings = await apiRequest('/bookings', { token, limit: 100, offset: 0 });
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
  };
  useEffect(() => {
    refreshPassengerBookingsRef.current = refreshPassengerBookings;
  });

  const loadMoreHistory = async () => {
    try {
      setError(''); // Clear any previous errors
      const nextOffset = historyPaginationOffset + historyPageSize;
      const newBookings = await apiRequest('/bookings', { token, limit: 100, offset: nextOffset });
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

      try {
        const [active, bookings, spinStatus, availability] = await Promise.all([
          apiRequest('/bookings/active', { token }).catch(() => null),
          includeBookings ? apiRequest('/bookings', { token }).catch(() => []) : Promise.resolve(null),
          includeSpinStatus ? apiRequest('/spin-win/config', { token }).catch(() => null) : Promise.resolve(null),
          includeAvailability
            ? apiRequest('/ride-products/availability', {
              query: { pickup_address: String(pickupLocation?.address || '').trim() || undefined },
            }).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (unmounted) {
          return;
        }
        setActiveBooking(active || null);
        if (includeBookings) {
          setPassengerBookings(Array.isArray(bookings) ? bookings : []);
        }
        if (includeSpinStatus) {
          setSpinWinStatus(spinStatus || null);
        }
        if (availability && Array.isArray(availability.enabled_products)) {
          setRideProductAvailability({
            enabled_products: availability.enabled_products.length > 0 ? availability.enabled_products : ['normal'],
            pickup_district: availability.pickup_district || null,
          });
        }
        passengerPollCooldownUntilRef.current = 0;
      } catch (err) {
        const status = Number(err?.status || 0);
        if (status === 429) {
          passengerPollCooldownUntilRef.current = Date.now() + 30000;
          const now = Date.now();
          if (now - passengerPollNoticeAtRef.current > 15000) {
            setMessage('Server is busy. Slowing passenger sync for 30 seconds.');
            passengerPollNoticeAtRef.current = now;
          }
        } else if (status === 503) {
          passengerPollCooldownUntilRef.current = Date.now() + 20000;
        }
      } finally {
        passengerPollInFlightRef.current = false;
      }
    };

    refreshSilently();
    const timer = setInterval(refreshSilently, 12000);
    return () => {
      unmounted = true;
      clearInterval(timer);
    };
  }, [activePassengerMenu, isPageVisible, pickupLocation?.address, token]);

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

    const handleDriverLocation = (payload) => {
      if (!payload || String(payload.booking_id || '') !== bookingId) {
        return;
      }
      const source = payload.location || payload;
      const latitude = Number(source?.latitude ?? source?.lat);
      const longitude = Number(source?.longitude ?? source?.lng);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return;
      }
      const nextLocation = {
        latitude: Number(latitude.toFixed(6)),
        longitude: Number(longitude.toFixed(6)),
        address:
          String(source?.address || '').trim() ||
          `Lat ${Number(latitude).toFixed(6)}, Lng ${Number(longitude).toFixed(6)}`,
      };
      setActiveBooking((prev) => {
        if (!prev || String(prev.id || '') !== bookingId) {
          return prev;
        }
        return { ...prev, driver_location: nextLocation };
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
      applyBookingPatch({
        status: nextStatus || payload.status,
      });
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
      applyRealtimePatch({
        status: nextStatus || payload.status || null,
        etaToPickup: payload.eta_to_pickup_min ?? null,
        etaToDrop: payload.eta_to_drop_min ?? null,
      });
      if (payload.driver_live_location || payload.driver_location) {
        const source = payload.driver_live_location || payload.driver_location;
        const latitude = Number(source?.latitude ?? source?.lat);
        const longitude = Number(source?.longitude ?? source?.lng);
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          nextPatch.driver_location = {
            latitude: Number(latitude.toFixed(6)),
            longitude: Number(longitude.toFixed(6)),
            address:
              String(source?.address || '').trim() ||
              `Lat ${Number(latitude).toFixed(6)}, Lng ${Number(longitude).toFixed(6)}`,
          };
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
    socket.on('booking_status_changed', handleBookingStatusChanged);
    socket.on('ride_state_sync', handleRideStateSync);
    socket.on('booking_completed', handleBookingCompleted);
    if (socket.connected) {
      joinBookingRoom();
    }

    return () => {
      socket.off('connect', joinBookingRoom);
      socket.off('driver_location_changed', handleDriverLocation);
      socket.off('driver_location', handleDriverLocation);
      socket.off('booking_status_changed', handleBookingStatusChanged);
      socket.off('ride_state_sync', handleRideStateSync);
      socket.off('booking_completed', handleBookingCompleted);
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

  const refreshDriverDiscovery = useCallback(async ({ silent = false } = {}) => {
    if (!pickupLocation || !dropoffLocation) {
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
            pickup_location: pickupLocation,
            drop_location: dropoffLocation,
          },
        }),
        apiRequest('/drivers/nearby', {
          token,
          query: {
            latitude: pickupLocation.latitude,
            longitude: pickupLocation.longitude,
            drop_latitude: dropoffLocation.latitude,
            drop_longitude: dropoffLocation.longitude,
            radius_km: 6,
          },
        }),
        apiRequest('/passengers/favorite-drivers', {
          token,
          query: {
            latitude: pickupLocation.latitude,
            longitude: pickupLocation.longitude,
          },
        }).catch(() => []),
        apiRequest('/passengers/blocked-drivers', { token }).catch(() => ({ driver_ids: [] })),
      ]);
      setFare(estimate || null);

      const favoritesList = Array.isArray(favorites) ? favorites : [];
      const favoriteIds = favoritesList.map((item) => item.driver_id).filter(Boolean);
      setFavoriteDriverIds(favoriteIds);
      const blockedIds = Array.isArray(blocked?.driver_ids) ? blocked.driver_ids : [];
      setBlockedDriverIds(blockedIds);

      const nearbyList = (Array.isArray(drivers) ? drivers : []).map((driver) => ({
        ...driver,
        is_favorite: favoriteIds.includes(driver.driver_id),
        source: 'nearby',
      })).filter((driver) => !blockedIds.includes(driver.driver_id));
      const nearbyIds = new Set(nearbyList.map((item) => item.driver_id));
      const favoriteFallback = favoritesList
        .filter((driver) => driver?.driver_id && !nearbyIds.has(driver.driver_id) && !blockedIds.includes(driver.driver_id))
        .map((driver) => ({ ...driver, source: 'favorite_fallback', is_favorite: true }));

      const merged = [...nearbyList, ...favoriteFallback];
      setNearbyDrivers(merged);
      setSelectedDriverId((prev) =>
        prev && !merged.some((item) => item.driver_id === prev)
          ? ''
          : prev,
      );
    } catch (err) {
      if (!silent) {
        setError(err.message || t.couldNotAutoCalculate);
      }
    } finally {
      setAutoFetchingTripData(false);
    }
  }, [dropoffLocation, pickupLocation, t.couldNotAutoCalculate, token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      refreshDriverDiscovery({ silent: false }).catch(() => null);
    }, 450);
    return () => {
      clearTimeout(timer);
    };
  }, [refreshDriverDiscovery]);

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
    if (done && pickupLocation && dropoffLocation) {
      await refreshDriverDiscovery({ silent: true });
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
    if (done && pickupLocation && dropoffLocation) {
      await refreshDriverDiscovery({ silent: true });
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

    const existingActive = await apiRequest('/bookings/active', { token }).catch(() => null);
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
    const rentalHours = Math.max(1, Math.min(24, Number(rentalHoursInput || 0) || 0));
    if (effectiveRideProduct === 'rental_hourly' && rentalHours <= 0) {
      setError(t.rentalHoursRequired);
      return;
    }

    const rideNotes = [];
    if (effectiveRideProduct === 'school_elderly_safe') {
      rideNotes.push(`Safe ride priority: ${safeRidePriority}`);
    }
    if (appliedPromo?.code) {
      rideNotes.push(`Promo requested: ${appliedPromo.code}`);
    }

    const booking = await callApi(() =>
      apiRequest('/bookings/advanced', {
        method: 'POST',
        token,
        body: {
          pickup_location: locations.pickup,
          drop_location: locations.dropoff,
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
          selected_driver_id: selectedDriverId || undefined,
          scheduled_for: scheduledForIso,
          corporate_code: effectiveRideProduct === 'corporate' ? corporateCode.trim() : undefined,
          airport_terminal: effectiveRideProduct === 'airport' ? airportTerminal.trim() : undefined,
          flight_number: effectiveRideProduct === 'airport' ? flightNumber.trim() : undefined,
          intercity_return_trip: effectiveRideProduct === 'intercity' ? intercityReturnTrip : false,
          tourism_package: effectiveRideProduct === 'tourism' ? tourismPackage.trim() : undefined,
          women_only_required: effectiveRideProduct === 'women_only',
          rental_hours: effectiveRideProduct === 'rental_hourly' ? rentalHours : undefined,
          safe_ride_priority:
            effectiveRideProduct === 'school_elderly_safe' ? safeRidePriority : undefined,
          vehicle_type_id: effectiveSelectedVehicleTypeId || undefined,
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
    const confirmed = window.confirm(
      `${t.confirmCancelBooking}\n\nPickup: ${normalizeLocation(activeBooking.pickup_location)?.address || 'Unknown'}\nDrop: ${normalizeLocation(activeBooking.drop_location || activeBooking.dropoff_location)?.address || 'Unknown'}`,
    );
    if (!confirmed) {
      setMessage(t.cancellationAborted);
      return;
    }
    const cancelled = await callApi(() =>
      apiRequest(`/bookings/${activeBooking.id}/cancel`, { method: 'PUT', token }),
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
    await refreshDriverDiscovery({ silent: true });
  };

  const handleProfilePress = useCallback(() => {
    if (typeof onProfilePress === 'function') {
      onProfilePress();
      return;
    }
    setShowProfile(true);
  }, [onProfilePress]);

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
        <View style={styles.container}>
          <WebCommandBar />
        <View style={styles.mapContainer}>
          <WebGoogleLiveMap
            apiKey={googleMapsWebKey}
            title={t.passengerMapTitle}
            fallbackUrl={mapState.fallbackUrl}
            mapStyle={styles.mapIframe}
            defaultCenter={DEFAULT_CITY_LOCATION}
            pickupLocation={mapState.origin}
            dropoffLocation={mapState.destination}
            driverLocation={mapState.driverLiveLocation}
            routeOrigin={mapState.routeOrigin}
            routeDestination={mapState.routeDestination}
            isInteractiveMode={showInteractiveMap}
            onMapPress={handleMapPress}
            onMarkerDragEnd={handleMarkerDragEnd}
            selectingPoint={selectingPoint}
          />
          <View style={styles.mapOverlayWrap}>
            <GlassCard style={styles.mapOverlayCard}>
              <Text style={[styles.mapOverlayTitle, accessibilityUi.textStyle]}>{t.mapTitle}</Text>
              <Text style={[styles.mapOverlayMalayalam, accessibilityUi.textStyle]}>{t.mapSubtitle}</Text>
            </GlassCard>
          </View>
        </View>

        <View style={[styles.panel, accessibilityUi.panelStyle]}>
          <View style={styles.headerRow}>
            <View style={styles.headerUserBlock}>
              <Text style={[styles.hello, accessibilityUi.headingStyle]}>{t.hi}, {user?.name || t.passengerFallbackName}</Text>
              <Text style={[styles.sub, accessibilityUi.textStyle]}>{t.passengerCenter}</Text>
            </View>
            <Image source={LOGO_SOURCE} style={styles.headerLogo} resizeMode="contain" />
            <NotificationBell
              onPress={() => setShowNotificationCenter(true)}
              unreadCount={unreadCount}
              style={styles.headerButton}
            />
            <AccessibilityQuickAccess
              token={token}
              onSettingsChange={handleAccessibilityChange}
            />
            <TouchableOpacity onPress={handleProfilePress} style={styles.profileButton}>
              <Text style={styles.profileText}>{t.profile}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onLogout} style={styles.logoutButton}>
              <Text style={styles.logoutText}>{t.logout}</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.panelScroll}
            contentContainerStyle={styles.panelScrollContent}
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

            <View style={styles.dashboardTopRow}>
              <TouchableOpacity
                style={[
                  styles.primaryMenuButton,
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
                style={styles.menuToggleButton}
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
                      <Text style={styles.infoText}>{t.campaignStart}: {new Date(spinWinStatus.starts_at).toLocaleString()}</Text>
                    )}
                    {spinWinStatus.ends_at && (
                      <Text style={styles.infoText}>{t.campaignEnd}: {new Date(spinWinStatus.ends_at).toLocaleString()}</Text>
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

            {activePassengerMenu === 'ride' && (
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

                {/* Show text search or interactive mode */}
                {!showInteractiveMap && (
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
                )}
                {/* Trip summary removed per UI request */}
                <View style={styles.infoBlock}>
                  <Text style={styles.infoTitle}>{t.rideType}</Text>
                  {!!rideProductAvailability?.pickup_district && (
                    <Text style={styles.hint}>
                      {t.districtLabel}: {rideProductAvailability.pickup_district}
                    </Text>
                  )}
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
                    onSelect={setRideProduct}
                  />

                  {/* Vehicle Type Selector */}
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
                        {availableVehicleTypes && availableVehicleTypes.map((type) => (
                          <TouchableOpacity
                            key={type.id}
                            style={[
                              styles.vehicleTypeChip,
                              effectiveSelectedVehicleTypeId === type.id && styles.vehicleTypeChipActive,
                            ]}
                            onPress={() => setSelectedVehicleTypeId(type.id)}
                          >
                            <Text style={styles.vehicleTypeChipIcon}>{type.icon}</Text>
                            <Text
                              style={[
                                styles.vehicleTypeChipText,
                                effectiveSelectedVehicleTypeId === type.id && styles.vehicleTypeChipTextActive,
                              ]}
                            >
                              {type.name}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    )}
                  </View>

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
                  )}

                  <Text style={styles.infoText}>{t.passengerCount}</Text>
                  <VoiceTextInput
                    style={styles.input}
                    value={passengerCountInput}
                    onChangeText={setPassengerCountInput}
                    keyboardType="number-pad"
                    placeholder={t.passengerCountPlaceholder}
                    placeholderTextColor={COLORS.textMuted}
                  />

                  {/* PHASE 1 FIX: Highlight corporate code field */}
                  {effectiveRideProduct === 'corporate' && (
                    <View style={{ backgroundColor: '#FFF3E0', borderLeftWidth: 3, borderLeftColor: '#FF9800', paddingLeft: 8, paddingRight: 8, paddingVertical: 6, borderRadius: 4, marginVertical: 8 }}>
                      <Text style={{ fontSize: 11, color: '#E65100', fontWeight: '600', marginBottom: 4 }}>
                        ⚠️ CORPORATE CODE REQUIRED
                      </Text>
                      <VoiceTextInput
                        style={styles.input}
                        value={corporateCode}
                        onChangeText={setCorporateCode}
                        placeholder={t.corporateCodePlaceholder}
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
                    <TouchableOpacity
                      style={[styles.modeChip, intercityReturnTrip && styles.modeChipActive]}
                      onPress={() => setIntercityReturnTrip((prev) => !prev)}
                      disabled={loading}>
                      <Text style={[styles.modeChipText, intercityReturnTrip && styles.modeChipTextActive]}>
                        {intercityReturnTrip ? t.returnTripYes : t.returnTripNo}
                      </Text>
                    </TouchableOpacity>
                  )}

                  {effectiveRideProduct === 'tourism' && (
                    <VoiceTextInput
                      style={styles.input}
                      value={tourismPackage}
                      onChangeText={setTourismPackage}
                      placeholder={t.tourismPackagePlaceholder}
                      placeholderTextColor={COLORS.textMuted}
                    />
                  )}

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

                  {effectiveRideProduct === 'school_elderly_safe' && (
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
                  )}

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
                    {visibleDrivers.map((driver) => (
                      <View key={driver.driver_id} style={styles.driverRow}>
                        <View style={styles.driverInfoBlock}>
                          <Text style={styles.driverNameText}>
                            {driver.name}
                            {driver.source === 'favorite_fallback' ? ` (${t.favoriteOutsideNearby})` : ''}
                          </Text>
                          <Text style={styles.infoText}>
                            {Number(driver.distance_km || 0).toFixed(2)} km | {t.rating} {driver.rating}
                          </Text>
                          <Text style={styles.infoText}>
                            {t.projectedFare}: INR {estimateDriverFare(driver).toFixed(2)}
                          </Text>
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
                    ))}
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
                        <WebGoogleLiveMap
                          passengerLocation={normalizeLocation(activeBooking.pickup_location)}
                          driverLocation={liveDriverLocation}
                          dropoffLocation={normalizeLocation(activeBooking.drop_location || activeBooking.dropoff_location)}
                          eta={etaToPickup || etaToDrop}
                          status={activeBookingStatus}
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
                    {passengerBookings.map((booking) => (
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
                      </View>
                    ))}
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
            {activePassengerMenu === 'favorites' && <FavoriteDriversPanel token={token} />}
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
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16 },
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
  mapOverlayWrap: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 10,
  },
  mapOverlayCard: {
    paddingVertical: 9,
    paddingHorizontal: 10,
  },
  mapOverlayTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textMain,
  },
  mapOverlayMalayalam: {
    marginTop: 2,
    ...TYPOGRAPHY.malayalam,
    fontSize: 12,
  },
  mapIframe: {
    width: '100%',
    height: '100%',
    borderWidth: 0,
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
  panelScroll: { flex: 1 },
  panelScrollContent: { paddingBottom: 22 },
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
  headerUserBlock: { flex: 1, paddingRight: 8 },
  headerLogo: { width: 44, height: 44, marginHorizontal: 8 },
  hello: { color: COLORS.textMain, fontSize: 19, fontWeight: '900' },
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
  logoutText: { color: COLORS.textMain, fontWeight: '700' },
  loader: { marginVertical: 8 },
  error: { color: COLORS.danger, marginTop: 8 },
  message: { color: '#1B5E20', marginTop: 8 },
  route: { color: '#666666', marginTop: 10, marginBottom: 10 },
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
    borderColor: '#CBD9D0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#F6FAF7',
  },
  menuToggleButtonText: { color: '#355243', fontWeight: '700' },
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
  menuChipActive: { borderColor: COLORS.primary, backgroundColor: '#E3F2E8' },
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
    color: '#355243',
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
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
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
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
  actionText: { color: '#fff', fontWeight: '700' },
  infoBlock: {
    borderWidth: 1,
    borderColor: '#D7E2DA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#FAFAFA',
    ...SHADOWS.soft,
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
  notificationCenterOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'white',
    zIndex: 1000,
  },
  headerButton: {
    marginRight: 8,
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
});

/**
 * Wrapper component that provides NotificationContext to PassengerMapContent
 */
export default function PassengerMap(props) {
  return (
    <NotificationProvider>
      <PassengerMapContent {...props} />
    </NotificationProvider>
  );
}
