import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { SymbolView } from 'expo-symbols';
import MapView, { Marker } from 'react-native-maps';

import { apiRequest } from '../lib/api';
import {
  getPlaceLocation, 
  isPlacesConfigured,
  reverseGeocodeLocation,
  searchPlaces,
} from '../lib/places';
import { COLORS, SHADOWS } from '../theme';
import RevenueCard from '../components/RevenueCard';
import RideProductsGrid from '../components/RideProductsGrid';
import RideCommunicationCard from '../components/RideCommunicationCard';
import VoiceTextInput from '../components/VoiceTextInput';
import BookingConfirmationCard from '../components/BookingConfirmationCard';
import InteractiveMap from '../components/InteractiveMap';
import ScheduledPickupPicker from '../components/ScheduledPickupPicker';
import KeralaSafetyCard from '../components/KeralaSafetyCard';
import PromoCodePanel from '../components/PromoCodePanel';
import SupportTicketsPanel from '../components/SupportTicketsPanel';
import PaymentMethodsPanel from '../components/PaymentMethodsPanel';
import PassengerRatingsPanel from '../components/PassengerRatingsPanel';
import FavoriteDriversPanel from '../components/FavoriteDriversPanel';
import PostRideRatingModal from '../components/PostRideRatingModal';
import SavedPlacesQuickSelect from '../components/SavedPlacesQuickSelect';
import PreferencesPanel from '../components/PreferencesPanel';
import SavedPlacesPanel from '../components/SavedPlacesPanel';
import EmergencyContactsPanel from '../components/EmergencyContactsPanel';
import AccessibilityPanel from '../components/AccessibilityPanel';
import PassengerScheduledRidesPanel from '../components/PassengerScheduledRidesPanel';
import NotificationCenter from '../components/NotificationCenter';
import PassengerProfilePanel from '../components/PassengerProfilePanel';
import PassengerKYCPanel from '../components/PassengerKYCPanel';
import PassengerDocumentsPanel from '../components/PassengerDocumentsPanel';
import ReceiptsPanel from '../components/ReceiptsPanel';
import SubscriptionPanel from '../components/SubscriptionPanel';
import { NotificationProvider, useNotifications } from '../contexts/NotificationContext';
import { useNotificationManager } from '../hooks/useNotificationManager';
import { usePassengerRideRealtime } from '../hooks/usePassengerRideRealtime';
import { useKeralaSafety } from '../hooks/useKeralaSafety';
import { validateScheduledPickup } from '../lib/scheduling';

const PASSENGER_MENU_SYMBOLS = {
  ride: { ios: 'car.fill', android: 'local_taxi', web: 'local_taxi' },
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
};
const PASSENGER_MENU_OPTIONS = [
  { key: 'ride', label: 'Ride Booking', symbol: PASSENGER_MENU_SYMBOLS.ride },
  { key: 'live', label: 'Live Ride', symbol: PASSENGER_MENU_SYMBOLS.live },
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
];
const PRIMARY_PASSENGER_MENU_KEY = 'ride';
const buildPassengerMenuOptions = (keys) =>
  keys.map((key) => PASSENGER_MENU_OPTIONS.find((menu) => menu.key === key)).filter(Boolean);
const PINNED_PASSENGER_MENU_OPTIONS = buildPassengerMenuOptions(['drivers', 'favorites', 'safety', 'wallet']);
const SECONDARY_PASSENGER_MENU_GROUPS = [
  { key: 'trip', title: 'Trip', keys: ['scheduled', 'history', 'ratings', 'receipts'] },
  { key: 'deals', title: 'Deals & Payment', keys: ['spin', 'promo', 'payment', 'subscription'] },
  { key: 'account', title: 'Account', keys: ['profile', 'kyc', 'documents', 'preferences', 'places', 'accessibility'] },
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

const DEFAULT_REGION = { latitude: 13.0827, longitude: 80.2707, latitudeDelta: 0.05, longitudeDelta: 0.05 };
const passengerMapStyle = [];

export function PassengerMapContent({ token, user, onLogout, onProfilePress = undefined }) {
  const autoPickupInitializedRef = useRef(false);
  const bookingStatusRef = useRef({ bookingId: null, status: null });
  const driverAddressCacheRef = useRef(new Map());
  const passengerPollInFlightRef = useRef(false);
  const passengerPollCycleRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pickupQuery, setPickupQuery] = useState('');
  const [dropoffQuery, setDropoffQuery] = useState('');
  const [pickupLocation, setPickupLocation] = useState(null);
  const [dropoffLocation, setDropoffLocation] = useState(null);
  const [pickupSuggestions, setPickupSuggestions] = useState([]);
  const [dropoffSuggestions, setDropoffSuggestions] = useState([]);
  const [searchingPickup, setSearchingPickup] = useState(false);
  const [searchingDropoff, setSearchingDropoff] = useState(false);
  const [locatingPickup, setLocatingPickup] = useState(false);
  const [locationValidation, setLocationValidation] = useState({ pickup: false, dropoff: false });
  const [activeBooking, setActiveBooking] = useState(null);
  const [passengerBookings, setPassengerBookings] = useState([]);
  const [fare, setFare] = useState(null);
  const [nearbyDrivers, setNearbyDrivers] = useState([]);
  const [favoriteDriverIds, setFavoriteDriverIds] = useState([]);
  const [blockedDriverIds, setBlockedDriverIds] = useState([]);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [fareExpectationInput, setFareExpectationInput] = useState('');
  const [optedOutDriverIds, setOptedOutDriverIds] = useState([]);
  const [autoFetchingTripData, setAutoFetchingTripData] = useState(false);
  const [rideProduct, setRideProduct] = useState('normal');
  const [corporateCode, setCorporateCode] = useState('');
  const [airportTerminal, setAirportTerminal] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [tourismPackage, setTourismPackage] = useState('Kerala Local Sightseeing');
  const [intercityReturnTrip, setIntercityReturnTrip] = useState(false);
  const [rentalHoursInput, setRentalHoursInput] = useState('4');
  const [safeRidePriority, setSafeRidePriority] = useState('elderly');
  const [passengerCountInput, setPassengerCountInput] = useState('1');
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
  const passengerNotificationSettings = useMemo(
    () => ({
      ...(passengerPreferences || {}),
      vibration_enabled: passengerAccessibility?.haptic_feedback,
    }),
    [passengerAccessibility?.haptic_feedback, passengerPreferences],
  );
  useNotificationManager(token, user?.id, passengerNotificationSettings);
  const { unreadCount } = useNotifications();
  const mapRef = useRef(null);
  const [driverLiveAddress, setDriverLiveAddress] = useState('');
  const pickupAddressRequestRef = useRef(0);
  const dropAddressRequestRef = useRef(0);
  const pickupSearchRequestRef = useRef(0);
  const dropSearchRequestRef = useRef(0);

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
      setSelectedPaymentMethod(normalizeBookingPaymentMethod(nextMethodType));
      setSelectedPaymentMethodId(method?.id || null);
      setSelectedPaymentChannel(typeof nextMethodType === 'string' ? nextMethodType : null);
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
  const searchBias = useMemo(() => pickupLocation || dropoffLocation || DEFAULT_REGION, [
    pickupLocation,
    dropoffLocation,
  ]);

  const validateBothLocations = () => {
    const missingPickup = !pickupLocation;
    const missingDropoff = !dropoffLocation;
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
    if (point === 'pickup') {
      setPickupLocation(location);
      setPickupQuery(location.address);
      setPickupSuggestions([]);
      setLocationValidation((prev) => ({ ...prev, pickup: false }));
    } else {
      setDropoffLocation(location);
      setDropoffQuery(location.address);
      setDropoffSuggestions([]);
      setLocationValidation((prev) => ({ ...prev, dropoff: false }));
    }
    setFare(null);
    setNearbyDrivers([]);
    setOptedOutDriverIds([]);
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
          resolvedLocation = await getPlaceLocation(best.placeId).catch(() => null);
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

  const refreshActiveBooking = async () => {
    const booking = await callApi(
      () => apiRequest('/bookings/active', { token }),
      'Active ride status refreshed.',
    );
    if (booking) {
      setActiveBooking(booking);
    } else {
      setActiveBooking(null);
    }
  };

  const refreshPassengerBookings = async ({ silent = false } = {}) => {
    try {
      const bookings = await apiRequest('/bookings', { token });
      setPassengerBookings(Array.isArray(bookings) ? bookings : []);
      if (!silent) {
        setMessage('Booking list refreshed.');
      }
      return bookings;
    } catch (err) {
      if (!silent) {
        setError(err.message || 'Could not load booking list.');
      }
      return [];
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
            setRideProduct('normal');
            if (!silent) {
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
      passengerPollInFlightRef.current = true;
      passengerPollCycleRef.current += 1;
      const cycle = passengerPollCycleRef.current;
      const includeBookings = activePassengerMenu === 'history' || cycle % 3 === 0;
      const includeSpinStatus = activePassengerMenu === 'spin' || cycle % 6 === 0;
      try {
        const [active, bookings, spinStatus] = await Promise.all([
          apiRequest('/bookings/active', { token }).catch(() => null),
          includeBookings ? apiRequest('/bookings', { token }).catch(() => []) : Promise.resolve(null),
          includeSpinStatus ? apiRequest('/spin-win/config', { token }).catch(() => null) : Promise.resolve(null),
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
      } catch {
        // Keep last known state on silent refresh failures.
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
  }, [activePassengerMenu, token]);

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
      setError('Google Places key missing. Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.');
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
        setError('Google Places key missing. Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.');
        return;
      }

      if (point === 'pickup') {
        setSearchingPickup(true);
      } else {
        setSearchingDropoff(true);
      }

      const location = await getPlaceLocation(suggestion.placeId);
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
      setSelectedDriverId((previousSelectedId) =>
        previousSelectedId && !merged.some((item) => item.driver_id === previousSelectedId)
          ? ''
          : previousSelectedId,
      );
    } catch (err) {
      if (!silent) {
        setError(err.message || 'Could not auto-calculate fare or drivers.');
      }
    } finally {
      setAutoFetchingTripData(false);
    }
  }, [dropoffLocation, pickupLocation, token]);

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
      setActivePassengerMenu(menuKey);
      setShowPassengerMenus(false);
      triggerA11yFeedback(`${label || 'Menu'} selected`);
    },
    [triggerA11yFeedback],
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
      isBlocked ? 'Driver unblocked.' : 'Driver blocked.',
    );
    if (done && pickupLocation && dropoffLocation) {
      await refreshDriverDiscovery({ silent: true });
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
      ? Math.max(1, Math.min(24, Math.round(rentalHoursValue)))
      : 0;
    if (effectiveRideProduct === 'rental_hourly' && rentalHours <= 0) {
      setError('Rental hours required.');
      return;
    }

    const existingActive = await apiRequest('/bookings/active', { token }).catch(() => null);
    let allowParallel = false;
    if (existingActive) {
      const shouldCreateAnother = await confirmCreateParallelBooking();
      if (!shouldCreateAnother) {
        setMessage('Keeping existing booking in progress.');
        return;
      }
      allowParallel = true;
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
          pickup_location: pickupLocation,
          drop_location: dropoffLocation,
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
          safe_ride_priority: effectiveRideProduct === 'school_elderly_safe' ? safeRidePriority : undefined,
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
      setError('Ride cannot be cancelled after the driver has accepted.');
      return;
    }
    const pickupAddr = normalizeLocation(pickupLocation)?.address || 'Pickup location';
    const dropAddr = normalizeLocation(dropoffLocation)?.address || 'Drop location';
    return new Promise((resolve) => {
      Alert.alert(
        'Confirm Cancellation',
        `Are you sure you want to cancel this ride?\n\nFrom: ${pickupAddr}\nTo: ${dropAddr}`,
        [
          { text: 'Keep Ride', style: 'cancel', onPress: () => {
            setMessage('Cancellation aborted.');
            resolve(false);
          } },
          { text: 'Cancel Ride', style: 'destructive', onPress: async () => {
            const cancelled = await callApi(() =>
              apiRequest(`/bookings/${activeBooking.id}/cancel`, { method: 'PUT', token }),
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
            pinColor={COLORS.secondary}
            draggable
            onDragEnd={handlePickupDrag}
          />
        )}
        {dropoffLocation && (
          <Marker
            coordinate={dropoffLocation}
            title="Dropoff"
            description={dropoffLocation.address}
            pinColor={COLORS.primary}
            draggable
            onDragEnd={handleDropoffDrag}
          />
        )}
        {isDriverLiveSharing && liveDriverLocation && (
          <Marker
            coordinate={liveDriverLocation}
            title="Driver Live Location"
            description={driverOnline ? 'Driver is online' : 'Driver reconnecting'}
            pinColor="green"
          />
        )}
      </MapView>
      {!!mapError && (
        <View style={styles.mapErrorCard}>
          <Text style={styles.mapErrorText}>{mapError}</Text>
        </View>
      )}

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
        <TouchableOpacity onPress={onLogout} style={styles.logoutButton}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.bottomCard, accessibilityUi.panelStyle]}>
        <ScrollView
          contentContainerStyle={styles.bottomCardScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <Text style={[styles.title, accessibilityUi.titleStyle]}>Ride Flow</Text>
          <Text style={[styles.route, accessibilityUi.textStyle]}>Tap map to pick {selectingPoint}</Text>
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

          {activePassengerMenu === 'ride' && (
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
                  onSelect={setRideProduct}
                />

                {isScheduledBookingMode && (
                  <ScheduledPickupPicker
                    value={scheduledAtInput}
                    onChangeText={setScheduledAtInput}
                    timezone={scheduledTimeZone}
                    onTimezoneChange={setScheduledTimeZone}
                    inputStyle={styles.input}
                  />
                )}
                <Text style={styles.infoText}>Passengers</Text>
                <VoiceTextInput
                  style={styles.input}
                  value={passengerCountInput}
                  onChangeText={setPassengerCountInput}
                  keyboardType="number-pad"
                  placeholder="Passenger count (1-6)"
                  placeholderTextColor={COLORS.textMuted}
                />
                {effectiveRideProduct === 'corporate' && (
                  <View style={styles.productRequirementBox}>
                    <Text style={styles.productRequirementTitle}>Corporate code required</Text>
                    <VoiceTextInput
                      style={styles.input}
                      value={corporateCode}
                      onChangeText={setCorporateCode}
                      placeholder="Corporate code"
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
                  <TouchableOpacity
                    style={[styles.modeChip, intercityReturnTrip && styles.modeChipActive]}
                    onPress={() => setIntercityReturnTrip((prev) => !prev)}
                    disabled={loading}>
                    <Text style={[styles.modeChipText, intercityReturnTrip && styles.modeChipTextActive]}>
                      {intercityReturnTrip ? 'Return trip: yes' : 'Return trip: no'}
                    </Text>
                  </TouchableOpacity>
                )}
                {effectiveRideProduct === 'tourism' && (
                  <VoiceTextInput
                    style={styles.input}
                    value={tourismPackage}
                    onChangeText={setTourismPackage}
                    placeholder="Tourism package"
                    placeholderTextColor={COLORS.textMuted}
                  />
                )}
                {effectiveRideProduct === 'women_only' && (
                  <Text style={styles.hint}>Women-only ride will request a female driver when available.</Text>
                )}
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
                {effectiveRideProduct === 'school_elderly_safe' && (
                  <>
                    <Text style={styles.infoText}>Safe ride priority</Text>
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
                  </>
                )}
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
                  {visibleDrivers.map((driver) => (
                    <View key={driver.driver_id} style={styles.driverRow}>
                      <View style={styles.driverInfoBlock}>
                        <Text style={styles.driverNameText}>
                          {driver.name}
                          {driver.source === 'favorite_fallback' ? ' (Favorite - outside nearby)' : ''}
                        </Text>
                        <Text style={styles.infoText}>
                          {Number(driver.distance_km || 0).toFixed(2)} km | rating {driver.rating}
                        </Text>
                        <Text style={styles.infoText}>
                          Projected fare: INR {estimateDriverFare(driver).toFixed(2)}
                        </Text>
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
                  ))}
                  {visibleDrivers.length === 0 && (
                    <Text style={styles.hint}>
                      No drivers match your fare expectation. Increase expectation or reset opt-outs.
                    </Text>
                  )}
                </View>
              ) : (
                <View style={styles.infoBlock}>
                  <Text style={styles.infoText}>No nearby drivers yet. Create a booking first.</Text>
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
                      <Text style={styles.infoText}>
                        ETA to Pickup: {etaToPickup ? `${etaToPickup} min` : 'Calculating...'}
                      </Text>
                      <Text style={styles.infoText}>
                        ETA to Drop: {etaToDrop ? `${etaToDrop} min` : 'Calculating...'}
                      </Text>
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
                    <Text style={styles.infoText}>Cancellation disabled after driver accepts.</Text>
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
                passengerBookings.slice(0, 20).map((booking) => (
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
                  </View>
                ))
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
          {activePassengerMenu === 'favorites' && <FavoriteDriversPanel token={token} />}
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
          {activePassengerMenu === 'documents' && <PassengerDocumentsPanel token={token} />}
          {activePassengerMenu === 'receipts' && <ReceiptsPanel token={token} />}
          {activePassengerMenu === 'subscription' && <SubscriptionPanel token={token} />}
        </ScrollView>

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
  bottomCard: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 20,
    maxHeight: '56%',
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    ...SHADOWS.card,
  },
  bottomCardScrollContent: {
    paddingBottom: 20,
  },
  title: { color: COLORS.textMain, fontSize: 22, fontWeight: '800' },
  route: { color: COLORS.textMuted, marginTop: 4, marginBottom: 10 },
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
});

export default function PassengerMap(props) {
  return (
    <NotificationProvider>
      <PassengerMapContent {...props} />
    </NotificationProvider>
  );
}
