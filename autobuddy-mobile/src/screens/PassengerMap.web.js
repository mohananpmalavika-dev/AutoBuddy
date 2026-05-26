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
import {
  FadeSlideView,
  GlassCard,
  LiveEtaPulse,
  PremiumEmptyState,
  RideProgressTimeline,
} from '../components/PremiumUI';
import { useKeralaSafety } from '../hooks/useKeralaSafety';
import PassengerProfile from './PassengerProfile';

const LOGO_SOURCE = require('../../assets/images/autobuddy-logo.jpg');
const PASSENGER_MENU_OPTIONS = [
  { key: 'ride', label: 'Ride Booking' },
  { key: 'drivers', label: 'Drivers' },
  { key: 'safety', label: 'Safety' },
  { key: 'wallet', label: 'Wallet' },
  { key: 'history', label: 'Ride History' },
];
const PRIMARY_PASSENGER_MENU_KEY = 'ride';
const DASHBOARD_PASSENGER_MENU_KEYS = new Set([PRIMARY_PASSENGER_MENU_KEY]);
const SECONDARY_PASSENGER_MENU_OPTIONS = PASSENGER_MENU_OPTIONS.filter(
  (menu) => !DASHBOARD_PASSENGER_MENU_KEYS.has(menu.key),
);

export default function PassengerMap({ token, user, onLogout, onProfilePress = undefined }) {
  const autoPickupInitializedRef = useRef(false);
  const bookingStatusRef = useRef({ bookingId: null, status: null });
  const pickupSearchRequestRef = useRef(0);
  const dropSearchRequestRef = useRef(0);
  const driverAddressCacheRef = useRef(new Map());
  const socketRef = useRef(null);
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
  const [bookingMode, setBookingMode] = useState('instant');
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
  const placesConfigured = isPlacesConfigured();
  const googleMapsWebKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const liveTrackStatuses = useMemo(() => new Set(['accepted', 'driver_arrived', 'in_progress']), []);

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

  const mapUrl = useMemo(() => {
    const origin = selectedPickupLocation;
    const destination = selectedDropoffLocation;
    const driverLiveLocation = normalizeLocation(activeBooking?.driver_location);
    const liveTarget = activeBookingStatus === 'in_progress' ? (destination || origin) : (origin || destination);
    const usingBasicEmbed = !googleMapsWebKey;

    if (usingBasicEmbed) {
      if (isDriverLiveSharing && driverLiveLocation && liveTarget) {
        return `https://www.google.com/maps?output=embed&saddr=${driverLiveLocation.latitude},${driverLiveLocation.longitude}&daddr=${liveTarget.latitude},${liveTarget.longitude}`;
      }
      if (isDriverLiveSharing && driverLiveLocation) {
        return `https://www.google.com/maps?output=embed&q=${driverLiveLocation.latitude},${driverLiveLocation.longitude}&z=15`;
      }
      if (origin && destination) {
        return `https://www.google.com/maps?output=embed&saddr=${origin.latitude},${origin.longitude}&daddr=${destination.latitude},${destination.longitude}`;
      }
      const location = origin || destination;
      if (location) {
        return `https://www.google.com/maps?output=embed&q=${location.latitude},${location.longitude}&z=14`;
      }
      return 'https://www.google.com/maps?output=embed&q=13.0827,80.2707&z=11';
    }

    if (isDriverLiveSharing && driverLiveLocation && liveTarget) {
      return `https://www.google.com/maps/embed/v1/directions?key=${encodeURIComponent(
        googleMapsWebKey,
      )}&origin=${driverLiveLocation.latitude},${driverLiveLocation.longitude}&destination=${liveTarget.latitude},${liveTarget.longitude}&avoid=tolls|highways`;
    }

    if (isDriverLiveSharing && driverLiveLocation) {
      return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(
        googleMapsWebKey,
      )}&q=${driverLiveLocation.latitude},${driverLiveLocation.longitude}&zoom=15`;
    }

    if (origin && destination) {
      return `https://www.google.com/maps/embed/v1/directions?key=${encodeURIComponent(
        googleMapsWebKey,
      )}&origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&avoid=tolls|highways`;
    }

    const location = origin || destination;
    if (location) {
      return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(
        googleMapsWebKey,
      )}&q=${location.latitude},${location.longitude}&zoom=14`;
    }

    return `https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(
      googleMapsWebKey,
    )}&center=13.0827,80.2707&zoom=11&maptype=roadmap`;
  }, [googleMapsWebKey, selectedPickupLocation, selectedDropoffLocation, activeBooking, activeBookingStatus, isDriverLiveSharing]);

  const fareExpectation = useMemo(() => {
    const parsed = Number(String(fareExpectationInput || '').trim());
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [fareExpectationInput]);

  const effectiveRideProduct = useMemo(() => {
    if (bookingMode === 'scheduled') {
      return 'scheduled';
    }
    return rideProduct || 'normal';
  }, [bookingMode, rideProduct]);

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
      setError(err.message || 'Request failed.');
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
      setError('Select both pickup and drop addresses.');
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
      setMessage(point === 'pickup' ? 'Pickup selected. Choose drop location.' : 'Drop location selected.');
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
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      if (!silent) {
        setError('Current location is not supported in this browser.');
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
        setMessage('Pickup autofilled from current location. You can edit it.');
      }
    } catch (err) {
      if (!silent) {
        const messageFromBrowser = err?.message || 'Could not fetch current location.';
        setError(messageFromBrowser);
      }
    } finally {
      setLocatingPickup(false);
    }
  }, [placesConfigured]);

  const refreshActiveBooking = async () => {
    const booking = await callApi(
      () => apiRequest('/bookings/active', { token }),
      'Active ride status refreshed.',
    );
    setActiveBooking(booking || null);
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
      try {
        const [active, bookings] = await Promise.all([
          apiRequest('/bookings/active', { token }).catch(() => null),
          apiRequest('/bookings', { token }).catch(() => []),
        ]);
        if (unmounted) {
          return;
        }
        setActiveBooking(active || null);
        setPassengerBookings(Array.isArray(bookings) ? bookings : []);
      } catch {
        // Keep last known state on silent refresh failures.
      }
    };

    refreshSilently();
    const timer = setInterval(refreshSilently, 5000);
    return () => {
      unmounted = true;
      clearInterval(timer);
    };
  }, [token]);

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

    const joinBookingRoom = () => {
      socket.emit('join_booking', { booking_id: bookingId });
    };

    socket.on('connect', joinBookingRoom);
    socket.on('driver_location_changed', handleDriverLocation);
    socket.on('driver_location', handleDriverLocation);
    if (socket.connected) {
      joinBookingRoom();
    }

    return () => {
      socket.off('connect', joinBookingRoom);
      socket.off('driver_location_changed', handleDriverLocation);
      socket.off('driver_location', handleDriverLocation);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [activeBooking?.id, token]);

  useEffect(() => {
    if (!activeBooking?.id || !isDriverLiveSharing) {
      return undefined;
    }
    let cancelled = false;
    const refreshLiveDriverLocation = async () => {
      const active = await apiRequest('/bookings/active', { token }).catch(() => null);
      if (!cancelled) {
        setActiveBooking(active || null);
      }
    };
    refreshLiveDriverLocation();
    const timer = setInterval(refreshLiveDriverLocation, 2500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [activeBooking?.id, isDriverLiveSharing, token]);

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
  }, [activeBooking?.id, activeBooking?.status, notifyWithVoice]);

  const confirmCreateParallelBooking = () => {
    if (typeof window === 'undefined' || typeof window.confirm !== 'function') {
      return true;
    }
    return window.confirm('One booking is already in progress. Do you want to add another?');
  };

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!pickupLocation || !dropoffLocation) {
        if (!cancelled) {
          setFare(null);
          setNearbyDrivers([]);
          setSelectedDriverId('');
        }
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
        if (cancelled) {
          return;
        }
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
        if (selectedDriverId && !merged.some((item) => item.driver_id === selectedDriverId)) {
          setSelectedDriverId('');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || 'Could not auto-calculate fare or drivers.');
        }
      } finally {
        if (!cancelled) {
          setAutoFetchingTripData(false);
        }
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pickupLocation, dropoffLocation, token, selectedDriverId]);

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
      isFavorite ? 'Removed favorite driver.' : 'Driver marked as favorite.',
    );
    if (done && pickupLocation && dropoffLocation) {
      // Re-trigger auto fetch on existing locations.
      setPickupLocation((prev) => (prev ? { ...prev } : prev));
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
      setPickupLocation((prev) => (prev ? { ...prev } : prev));
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
        setError('Select pickup time for scheduled ride.');
        return;
      }
      const parsed = new Date(scheduledAtInput);
      if (Number.isNaN(parsed.getTime())) {
        setError('Enter a valid pickup date and time.');
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
      const shouldCreateAnother = confirmCreateParallelBooking();
      if (!shouldCreateAnother) {
        setMessage('Keeping existing booking in progress.');
        return;
      }
      allowParallel = true;
    }

    const passengerCount = Math.max(1, Math.min(6, Number(passengerCountInput || 1) || 1));
    if (effectiveRideProduct === 'corporate' && !corporateCode.trim()) {
      setError('Corporate code is required for corporate rides.');
      return;
    }
    if (effectiveRideProduct === 'airport' && (!flightNumber.trim() || !airportTerminal.trim())) {
      setError('Flight number and terminal are required for airport rides.');
      return;
    }
    const rentalHours = Math.max(1, Math.min(24, Number(rentalHoursInput || 0) || 0));
    if (effectiveRideProduct === 'rental_hourly' && rentalHours <= 0) {
      setError('Rental hours are required (1 to 24).');
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
    const cancelled = await callApi(() =>
      apiRequest(`/bookings/${activeBooking.id}/cancel`, { method: 'PUT', token }),
    );
    if (cancelled) {
      setMessage('Booking cancelled.');
      await refreshActiveBooking();
      await refreshPassengerBookings({ silent: true });
    }
  };

  const refreshPassengerDashboard = async () => {
    await refreshActiveBooking();
    await refreshPassengerBookings({ silent: true });
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
          <iframe
            title="Passenger map"
            src={mapUrl}
            style={styles.mapIframe}
            allowFullScreen
            loading="lazy"
          />
          <View style={styles.mapOverlayWrap}>
            <GlassCard style={styles.mapOverlayCard}>
              <Text style={styles.mapOverlayTitle}>Driver Map</Text>
              <Text style={styles.mapOverlayMalayalam}>ലൈവ് മാപ്പ് ട്രാക്കിംഗ് പ്രവർത്തിക്കുന്നു</Text>
            </GlassCard>
          </View>
        </View>

        <View style={styles.panel}>
          <View style={styles.headerRow}>
            <View style={styles.headerUserBlock}>
              <Text style={styles.hello}>Hi, {user?.name || 'Passenger'}</Text>
              <Text style={styles.sub}>Passenger Command Center</Text>
            </View>
            <Image source={LOGO_SOURCE} style={styles.headerLogo} resizeMode="contain" />
            <TouchableOpacity onPress={handleProfilePress} style={styles.profileButton}>
              <Text style={styles.profileText}>Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onLogout} style={styles.logoutButton}>
              <Text style={styles.logoutText}>Logout</Text>
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
                <Text style={styles.menuToggleButtonText}>
                  {showPassengerMenus ? 'Hide Menus' : 'Other Menus'}
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

            {activePassengerMenu === 'safety' && <KeralaSafetyCard safety={keralaSafety} />}

            {activePassengerMenu === 'wallet' && (
              <View style={styles.infoBlock}>
                <Text style={styles.infoTitle}>Wallet & Revenue</Text>
                <RevenueCard token={token} role={user?.role} />
              </View>
            )}

            {activePassengerMenu === 'ride' && (
              <>
                <View style={styles.selectedBlock}>
                  <View style={styles.pickupLabelRow}>
                    <Text style={styles.infoTitle}>Pickup Search</Text>
                    <TouchableOpacity
                      style={styles.currentLocationInlineButton}
                      onPress={() => autofillPickupFromCurrentLocation({ silent: false })}
                      disabled={loading || locatingPickup}>
                      <Text style={styles.currentLocationInlineText}>
                        {locatingPickup ? 'Fetching...' : 'Use Current'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <VoiceTextInput
                    style={styles.input}
                    value={pickupQuery}
                    onChangeText={(text) => handleSearchTextChange('pickup', text)}
                    placeholder="Enter pickup area, landmark, or address"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  {searchingPickup && <Text style={styles.hint}>Searching pickup...</Text>}
                  {pickupSuggestions.map((item) => (
                    <TouchableOpacity
                      key={`pickup-${item.placeId}`}
                      style={styles.suggestion}
                      onPress={() => handleSelectSuggestion('pickup', item)}>
                      <Text style={styles.suggestionText}>{item.description}</Text>
                    </TouchableOpacity>
                  ))}
                  {locationValidation.pickup && (
                    <Text style={styles.validationText}>Pickup location is required before booking.</Text>
                  )}
                </View>

                <View style={styles.selectedBlock}>
                  <Text style={styles.infoTitle}>Drop Search</Text>
                  <VoiceTextInput
                    style={styles.input}
                    value={dropoffQuery}
                    onChangeText={(text) => handleSearchTextChange('dropoff', text)}
                    placeholder="Enter drop area, landmark, or address"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  {searchingDropoff && <Text style={styles.hint}>Searching drop...</Text>}
                  {dropoffSuggestions.map((item) => (
                    <TouchableOpacity
                      key={`drop-${item.placeId}`}
                      style={styles.suggestion}
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
                  <RideProductsGrid
                    selected={effectiveRideProduct}
                    onSelect={(value) => {
                      setRideProduct(value);
                      if (value === 'scheduled') {
                        setBookingMode('scheduled');
                      } else if (bookingMode === 'scheduled') {
                        setBookingMode('instant');
                      }
                    }}
                  />
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
                      <Text style={styles.infoText}>Set pickup time</Text>
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

                  <VoiceTextInput
                    style={styles.input}
                    value={passengerCountInput}
                    onChangeText={setPassengerCountInput}
                    keyboardType="number-pad"
                    placeholder="Passenger count (1 to 6)"
                    placeholderTextColor={COLORS.textMuted}
                  />

                  {effectiveRideProduct === 'corporate' && (
                    <VoiceTextInput
                      style={styles.input}
                      value={corporateCode}
                      onChangeText={setCorporateCode}
                      placeholder="Corporate code"
                      placeholderTextColor={COLORS.textMuted}
                    />
                  )}

                  {effectiveRideProduct === 'airport' && (
                    <>
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
                    </>
                  )}

                  {effectiveRideProduct === 'intercity' && (
                    <TouchableOpacity
                      style={[styles.modeChip, intercityReturnTrip && styles.modeChipActive]}
                      onPress={() => setIntercityReturnTrip((prev) => !prev)}
                      disabled={loading}>
                      <Text style={[styles.modeChipText, intercityReturnTrip && styles.modeChipTextActive]}>
                        {intercityReturnTrip ? 'Return Trip: Yes' : 'Return Trip: No'}
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

                  {effectiveRideProduct === 'rental_hourly' && (
                    <VoiceTextInput
                      style={styles.input}
                      value={rentalHoursInput}
                      onChangeText={setRentalHoursInput}
                      keyboardType="number-pad"
                      placeholder="Rental hours (1 to 24)"
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
                  )}
                </View>
                <View style={styles.actionsRow}>
                  <TouchableOpacity style={styles.actionButton} onPress={createBooking} disabled={loading}>
                    <Text style={styles.actionText}>
                      {effectiveRideProduct === 'scheduled'
                        ? 'Schedule Ride'
                        : selectedDriverId
                          ? 'Book Selected Driver'
                          : 'Book Auto'}
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
                          {Number(driver.pickup_surcharge || 0) > 0 && (
                            <Text style={styles.infoText}>
                              Extra pickup charge: INR {Number(driver.pickup_surcharge || 0).toFixed(2)}
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
                  <FadeSlideView>
                    <GlassCard style={styles.premiumCallout}>
                      <LiveEtaPulse eta={liveEtaLabel} />
                      <Text style={styles.premiumTitle}>Your AutoBuddy is on the way</Text>
                      <Text style={styles.premiumMalayalam}>Live trip updates are shown here.</Text>
                    </GlassCard>
                  </FadeSlideView>
                ) : (
                  <PremiumEmptyState
                    title="No active ride"
                    subtitle="Book a ride to start tracking live trip details."
                    malayalam="No active ride now."
                  />
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
                  <>
                    <RideProgressTimeline status={activeBookingStatus || 'searching'} />
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
                        <Text style={styles.infoText}>
                          Driver live location: {driverLiveLocationLabel}
                        </Text>
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
                      {Number(activeBooking.pickup_surcharge || 0) > 0 && (
                        <Text style={styles.infoText}>
                          Includes pickup surcharge: INR {Number(activeBooking.pickup_surcharge || 0).toFixed(2)}
                        </Text>
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
                  </>
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
                  <PremiumEmptyState
                    title="No rides yet"
                    subtitle="Your completed and cancelled rides will appear here."
                    malayalam="പൂർത്തിയായതും റദ്ദാക്കിയതുമായ യാത്രകൾ ഇവിടെ കാണിക്കും."
                  />
                ) : (
                  passengerBookings.slice(0, 20).map((booking) => (
                    <Text key={booking.id} style={styles.infoText}>
                      {booking.status} | {booking.driver_name || 'Driver not assigned'} | INR {booking.estimated_fare}
                    </Text>
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
});
