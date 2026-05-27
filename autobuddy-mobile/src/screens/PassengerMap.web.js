import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { apiRequest } from '../lib/api';
import { createAutoBuddySocket } from '../lib/socket';
import {
  getPlaceLocation, 
  isPlacesConfigured,
  reverseGeocodeLocation,
  searchPlaces,
} from '../lib/places';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../theme';
import RideCommunicationCard from '../components/RideCommunicationCard';
import WebCommandBar from '../components/WebCommandBar';
import VoiceTextInput from '../components/VoiceTextInput';
import KeralaSafetyCard from '../components/KeralaSafetyCard';
import RevenueCard from '../components/RevenueCard';
import RideProductsGrid from '../components/RideProductsGrid';
import WebGoogleLiveMap from '../components/WebGoogleLiveMap';
import LocationSearchModal from '../components/LocationSearchModal';
import BookingConfirmationCard from '../components/BookingConfirmationCard';
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

const LOGO_SOURCE = require('../../assets/images/autobuddy-logo.jpg');
const PASSENGER_MENU_OPTIONS = [
  { key: 'ride' },
  { key: 'drivers' },
  { key: 'safety' },
  { key: 'wallet' },
  { key: 'spin' },
  { key: 'history' },
];
const PRIMARY_PASSENGER_MENU_KEY = 'ride';
const DASHBOARD_PASSENGER_MENU_KEYS = new Set([PRIMARY_PASSENGER_MENU_KEY]);
const SECONDARY_PASSENGER_MENU_OPTIONS = PASSENGER_MENU_OPTIONS.filter(
  (menu) => !DASHBOARD_PASSENGER_MENU_KEYS.has(menu.key),
);
const DEFAULT_CITY_LOCATION = {
  latitude: 13.0827,
  longitude: 80.2707,
};

export default function PassengerMap({ token, user, onLogout, onProfilePress = undefined }) {
  const autoPickupInitializedRef = useRef(false);
  const bookingStatusRef = useRef({ bookingId: null, status: null });
  const pickupSearchRequestRef = useRef(0);
  const dropSearchRequestRef = useRef(0);
  const driverAddressCacheRef = useRef(new Map());
  const socketRef = useRef(null);
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
  const [fare, setFare] = useState(null);
  const [nearbyDrivers, setNearbyDrivers] = useState([]);
  const [favoriteDriverIds, setFavoriteDriverIds] = useState([]);
  const [blockedDriverIds, setBlockedDriverIds] = useState([]);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [fareExpectationInput, setFareExpectationInput] = useState('');
  const [optedOutDriverIds, setOptedOutDriverIds] = useState([]);
  const [autoFetchingTripData, setAutoFetchingTripData] = useState(false);
  const [scheduledAtInput, setScheduledAtInput] = useState('');
  const [rideProduct, setRideProduct] = useState('normal');
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
  const [locationSearchModalVisible, setLocationSearchModalVisible] = useState(false);
  const [locationSearchModalType, setLocationSearchModalType] = useState(null); // 'pickup' or 'dropoff'
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
  const liveTrackStatuses = useMemo(() => new Set(['accepted', 'driver_arrived', 'in_progress']), []);
  const t = useMemo(() => resolvePassengerLocale(languageCode), [languageCode]);
  const rideProductLabels = useMemo(() => getPassengerRideProductLabels(t), [t]);
  const menuLabels = useMemo(
    () => ({
      ride: t.rideBooking,
      drivers: t.drivers,
      safety: t.safety,
      wallet: t.wallet,
      spin: t.spin,
      history: t.history,
    }),
    [t],
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

  const activeBookingStatus = normalizeBookingStatus(activeBooking?.status);
  const activeRideStartOtp = String(activeBooking?.ride_start_otp || '').trim();
  const activeRideEndOtp = String(activeBooking?.ride_end_otp || '').trim();
  const isDriverLiveSharing = liveTrackStatuses.has(activeBookingStatus);
  const canCancelActiveBooking = activeBookingStatus === 'pending';
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
  const liveDriverLocation = normalizeLocation(activeBooking?.driver_location);
  const formatCoordinateAddress = useCallback(
    (latitude, longitude) => `Lat ${Number(latitude).toFixed(6)}, Lng ${Number(longitude).toFixed(6)}`,
    [],
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
    const driverLiveLocation = normalizeLocation(activeBooking?.driver_location);
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
  }, [googleMapsWebKey, selectedPickupLocation, selectedDropoffLocation, activeBooking, activeBookingStatus, isDriverLiveSharing]);

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
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        const utterance = new SpeechSynthesisUtterance(`${title}. ${body}`);
        utterance.lang = 'en-IN';
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(utterance);
      } catch {
        // Ignore speech synthesis failures.
      }
    }
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
  }, []);

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
      const bookings = await apiRequest('/bookings', { token });
      setPassengerBookings(Array.isArray(bookings) ? bookings : []);
      if (!silent) {
        setMessage(t.bookingListRefreshed);
      }
      return bookings;
    } catch (err) {
      if (!silent) {
        setError(err.message || t.couldNotLoadBookingList);
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
      const result = await apiRequest('/spin-win/spin', { method: 'POST', token });
      const rewardLabel = String(result?.reward?.label || t.rewardFallback);
      const remaining = Number(result?.spins_left_today ?? 0);
      setMessage(`${t.spinComplete}: ${rewardLabel}. ${t.spinsLeftToday}: ${remaining}.`);
      await refreshSpinWinStatus({ silent: true });
    } catch (err) {
      setError(err.message || t.spinFailedRetry);
    } finally {
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
    };
    const handleBookingStatusChanged = (payload) => {
      if (!payload || String(payload.booking_id || '') !== bookingId) {
        return;
      }
      const nextStatus = normalizeBookingStatus(payload.status);
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

    socket.on('connect', joinBookingRoom);
    socket.on('driver_location_changed', handleDriverLocation);
    socket.on('driver_location', handleDriverLocation);
    socket.on('booking_status_changed', handleBookingStatusChanged);
    socket.on('ride_state_sync', handleRideStateSync);
    if (socket.connected) {
      joinBookingRoom();
    }

    return () => {
      socket.off('connect', joinBookingRoom);
      socket.off('driver_location_changed', handleDriverLocation);
      socket.off('driver_location', handleDriverLocation);
      socket.off('booking_status_changed', handleBookingStatusChanged);
      socket.off('ride_state_sync', handleRideStateSync);
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

    if (status === 'driver_arrived') {
      notifyWithVoice(t.driverArrivedTitle, t.driverArrivedBody);
      return;
    }
    if (status === 'in_progress') {
      notifyWithVoice(t.tripStartedTitle, t.tripStartedBody);
      return;
    }
    if (status === 'completed') {
      notifyWithVoice(t.tripCompletedTitle, t.tripCompletedBody);
    }
  }, [activeBooking?.id, activeBooking?.status, notifyWithVoice, t.driverArrivedBody, t.driverArrivedTitle, t.tripCompletedBody, t.tripCompletedTitle, t.tripStartedBody, t.tripStartedTitle]);

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
      if (!scheduledAtInput) {
        setError(t.selectPickupTimeScheduled);
        return;
      }
      const parsed = new Date(scheduledAtInput);
      if (Number.isNaN(parsed.getTime())) {
        setError(t.enterValidPickupDateTime);
        return;
      }
      if (parsed.getTime() <= Date.now() + (2 * 60 * 1000)) {
        setError(t.scheduledPickupFuture);
        return;
      }
      scheduledForIso = parsed.toISOString();
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

    const booking = await callApi(() =>
      apiRequest('/bookings/advanced', {
        method: 'POST',
        token,
        body: {
          pickup_location: locations.pickup,
          drop_location: locations.dropoff,
          payment_method: 'cash',
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
          notes:
            effectiveRideProduct === 'school_elderly_safe'
              ? `Safe ride priority: ${safeRidePriority}`
              : undefined,
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
          />
          <View style={styles.mapOverlayWrap}>
            <GlassCard style={styles.mapOverlayCard}>
              <Text style={styles.mapOverlayTitle}>{t.mapTitle}</Text>
              <Text style={styles.mapOverlayMalayalam}>{t.mapSubtitle}</Text>
            </GlassCard>
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.headerRow}>
            <View style={styles.headerUserBlock}>
              <Text style={styles.hello}>{t.hi}, {user?.name || t.passengerFallbackName}</Text>
              <Text style={styles.sub}>{t.passengerCenter}</Text>
            </View>
            <Image source={LOGO_SOURCE} style={styles.headerLogo} resizeMode="contain" />
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
                onPress={() => {
                  setActivePassengerMenu(PRIMARY_PASSENGER_MENU_KEY);
                  setShowPassengerMenus(false);
                }}>
                <Text style={styles.primaryMenuButtonText}>{t.rideBooking}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.menuToggleButton}
                onPress={() => setShowPassengerMenus((prev) => !prev)}>
                <Text style={styles.menuToggleButtonText}>
                  {showPassengerMenus ? t.hideMenus : t.otherMenus}
                </Text>
              </TouchableOpacity>
            </View>

            {showPassengerMenus && (
              <View style={styles.secondaryMenuRow}>
                {SECONDARY_PASSENGER_MENU_OPTIONS.map((menu) => (
                  <TouchableOpacity
                    key={menu.key}
                    style={[styles.menuChip, activePassengerMenu === menu.key && styles.menuChipActive]}
                    onPress={() => {
                      setActivePassengerMenu(menu.key);
                      setShowPassengerMenus(false);
                    }}>
                    <Text style={[styles.menuChipText, activePassengerMenu === menu.key && styles.menuChipTextActive]}>
                      {menuLabels[menu.key] || menu.key}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {activePassengerMenu !== PRIMARY_PASSENGER_MENU_KEY && (
              <View style={styles.activeMenuInfoRow}>
                <Text style={styles.activeMenuInfoText}>
                  {menuLabels[activePassengerMenu] || t.menu}
                </Text>
                <TouchableOpacity
                  style={styles.menuToggleButton}
                  onPress={() => {
                    setActivePassengerMenu(PRIMARY_PASSENGER_MENU_KEY);
                    setShowPassengerMenus(false);
                  }}>
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
                    <>
                      <Text style={styles.infoText}>{t.setPickupTime}</Text>
                      <input
                        type="datetime-local"
                        value={scheduledAtInput}
                        onChange={(event) => setScheduledAtInput(event.target.value)}
                        style={{
                          width: '100%',
                          border: '1px solid #CBD9D0',
                          borderRadius: 8,
                          padding: '9px 10px',
                          marginTop: 4,
                          marginBottom: 4,
                          backgroundColor: '#FFFFFF',
                          color: '#202020',
                        }}
                      />
                    </>
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

            {activePassengerMenu === 'ride' && (
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
                  passengerBookings.slice(0, 20).map((booking) => (
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
                  ))
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
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
  secondaryMenuRow: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
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
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: '#F6FAF7',
  },
  menuChipActive: { borderColor: COLORS.primary, backgroundColor: '#E3F2E8' },
  menuChipText: { color: '#355243', fontWeight: '700' },
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
});
