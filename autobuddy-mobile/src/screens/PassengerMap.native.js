import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
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
import RideCommunicationCard from '../components/RideCommunicationCard';
import VoiceTextInput from '../components/VoiceTextInput';
import BookingConfirmationCard from '../components/BookingConfirmationCard';
import InteractiveMap from '../components/InteractiveMap';
import { usePassengerRideRealtime } from '../hooks/usePassengerRideRealtime';

const PASSENGER_MENU_OPTIONS = [
  { key: 'ride', label: 'Ride Booking' },
  { key: 'drivers', label: 'Drivers' },
  { key: 'wallet', label: 'Wallet' },
  { key: 'history', label: 'Ride History' },
];
const PRIMARY_PASSENGER_MENU_KEY = 'ride';
const DASHBOARD_PASSENGER_MENU_KEYS = new Set([PRIMARY_PASSENGER_MENU_KEY]);
const SECONDARY_PASSENGER_MENU_OPTIONS = PASSENGER_MENU_OPTIONS.filter(
  (menu) => !DASHBOARD_PASSENGER_MENU_KEYS.has(menu.key),
);

const DEFAULT_REGION = { latitude: 13.0827, longitude: 80.2707, latitudeDelta: 0.05, longitudeDelta: 0.05 };
const passengerMapStyle = [];

export default function PassengerMap({ token, user, onLogout, onProfilePress = undefined }) {
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
  const [bookingMode, setBookingMode] = useState('instant');
  const [scheduledAtInput, setScheduledAtInput] = useState('');
  const [selectingPoint, setSelectingPoint] = useState('pickup');
  const [mapError, setMapError] = useState('');
  const [activePassengerMenu, setActivePassengerMenu] = useState(PRIMARY_PASSENGER_MENU_KEY);
  const [showPassengerMenus, setShowPassengerMenus] = useState(false);
  const [bookingJustCreated, setBookingJustCreated] = useState(false);
  const [showInteractiveMap, setShowInteractiveMap] = useState(true);
  const [locationSearchModalVisible, setLocationSearchModalVisible] = useState(false);
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
  const liveTrackStatuses = useMemo(() => new Set(['accepted', 'driver_arrived', 'in_progress']), []);
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

  const animateMapToLocation = (location) => {
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
      450,
    );
  };

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

  const notifyWithVoice = useCallback((title, body) => {
    Alert.alert(title, body);
    AccessibilityInfo.announceForAccessibility(`${title}. ${body}`);
  }, []);

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
      try {
        const [active, bookings] = await Promise.all([
          apiRequest('/bookings/active', { token }).catch(() => null),
          includeBookings ? apiRequest('/bookings', { token }).catch(() => []) : Promise.resolve(null),
        ]);
        if (unmounted) {
          return;
        }
        setActiveBooking(active || null);
        if (includeBookings) {
          setPassengerBookings(Array.isArray(bookings) ? bookings : []);
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

    if (status === 'driver_arrived') {
      notifyWithVoice('Driver Arrived', 'Your driver has arrived at the pickup point.');
      return;
    }
    if (status === 'in_progress') {
      notifyWithVoice('Trip Started', 'Your trip has started.');
      return;
    }
    if (status === 'completed') {
      notifyWithVoice('Trip Completed', 'Your trip has ended.');
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
  }, []);

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
    const isScheduledMode = bookingMode === 'scheduled';
    let scheduledForIso = undefined;
    if (isScheduledMode) {
      const normalized = String(scheduledAtInput || '').trim();
      if (!normalized) {
        setError('Enter pickup date/time for scheduled ride (YYYY-MM-DD HH:mm).');
        return;
      }
      const candidate = normalized.replace(' ', 'T');
      const parsed = new Date(candidate);
      if (Number.isNaN(parsed.getTime())) {
        setError('Invalid schedule format. Use YYYY-MM-DD HH:mm.');
        return;
      }
      if (parsed.getTime() <= Date.now() + (2 * 60 * 1000)) {
        setError('Scheduled pickup time must be at least 2 minutes in the future.');
        return;
      }
      scheduledForIso = parsed.toISOString();
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

    const effectiveRideProduct = isScheduledMode ? 'scheduled' : 'normal';
    const booking = await callApi(() =>
      apiRequest('/bookings/advanced', {
        method: 'POST',
        token,
        body: {
          pickup_location: pickupLocation,
          drop_location: dropoffLocation,
          payment_method: 'cash',
          ride_product: effectiveRideProduct,
          passenger_count: 1,
          allow_parallel: allowParallel,
          selected_driver_id: selectedDriverId || undefined,
          scheduled_for: scheduledForIso,
        },
      }),
    );
    if (booking) {
      setActiveBooking(booking);
      setBookingJustCreated(true);
      setMessage(isScheduledMode ? 'Scheduled ride request created.' : 'Ride request created.');
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
      600,
    );
  }, [liveDriverLocation]);

  return (
    <View style={styles.container}>
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

      <View style={styles.topBar}>
        <View>
          <Text style={styles.hello}>Hi, {user?.name || 'Passenger'}</Text>
          <Text style={styles.sub}>Passenger Command Center</Text>
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

      <View style={styles.bottomCard}>
        <ScrollView
          contentContainerStyle={styles.bottomCardScrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Ride Flow</Text>
          <Text style={styles.route}>Tap map to pick {selectingPoint}</Text>
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
              <Text style={styles.primaryMenuButtonText}>Ride Booking</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuToggleButton}
              onPress={() => setShowPassengerMenus((prev) => !prev)}>
              <Text style={styles.menuToggleButtonText}>{showPassengerMenus ? 'Hide Menus' : 'Other Menus'}</Text>
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
                    {menu.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {activePassengerMenu !== PRIMARY_PASSENGER_MENU_KEY && (
            <View style={styles.activeMenuInfoRow}>
              <Text style={styles.activeMenuInfoText}>
                {PASSENGER_MENU_OPTIONS.find((menu) => menu.key === activePassengerMenu)?.label || 'Menu'}
              </Text>
              <TouchableOpacity
                style={styles.menuToggleButton}
                onPress={() => {
                  setActivePassengerMenu(PRIMARY_PASSENGER_MENU_KEY);
                  setShowPassengerMenus(false);
                }}>
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
                <View style={styles.modeRow}>
                  <TouchableOpacity
                    style={[styles.modeChip, bookingMode === 'instant' && styles.modeChipActive]}
                    onPress={() => setBookingMode('instant')}
                    disabled={loading}>
                    <Text style={[styles.modeChipText, bookingMode === 'instant' && styles.modeChipTextActive]}>
                      Instant
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modeChip, bookingMode === 'scheduled' && styles.modeChipActive]}
                    onPress={() => setBookingMode('scheduled')}
                    disabled={loading}>
                    <Text style={[styles.modeChipText, bookingMode === 'scheduled' && styles.modeChipTextActive]}>
                      Schedule
                    </Text>
                  </TouchableOpacity>
                </View>
                {bookingMode === 'scheduled' && (
                  <>
                    <Text style={styles.infoText}>Pickup time (YYYY-MM-DD HH:mm)</Text>
                    <VoiceTextInput
                      value={scheduledAtInput}
                      onChangeText={setScheduledAtInput}
                      placeholder="2026-05-31 08:30"
                      placeholderTextColor={COLORS.textMuted}
                      style={styles.searchInput}
                    />
                  </>
                )}
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity style={styles.actionButton} onPress={createBooking} disabled={loading}>
                  <Text style={styles.actionText}>
                    {bookingMode === 'scheduled'
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

          {activePassengerMenu === 'ride' && (
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
        </ScrollView>
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
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  menuChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#E4F2E8',
  },
  menuChipText: { color: COLORS.textMain, fontWeight: '700' },
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
  cancelButton: {
    marginTop: 10,
    backgroundColor: COLORS.danger,
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

