import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { apiRequest } from '../lib/api';
import { createAutoBuddySocket } from '../lib/socket';
import { isPlacesConfigured, reverseGeocodeLocation } from '../lib/places';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../theme';
import RideCommunicationCard from '../components/RideCommunicationCard';
import WebCommandBar from '../components/WebCommandBar';
import VoiceTextInput from '../components/VoiceTextInput';
import KeralaSafetyCard from '../components/KeralaSafetyCard';
import DriverTrustCard from '../components/DriverTrustCard';
import RevenueCard from '../components/RevenueCard';
import {
  FadeSlideView,
  GlassCard,
  LiveEtaPulse,
  PremiumEmptyState,
  RideProgressTimeline,
} from '../components/PremiumUI';
import { useKeralaSafety } from '../hooks/useKeralaSafety';
import DriverProfile from './DriverProfile';

const STATUS_FLOW = ['accepted', 'driver_arrived', 'in_progress', 'completed'];
const DRIVER_MENU_OPTIONS = [
  { key: 'requests', label: 'Ride Requests' },
  { key: 'trip', label: 'Active Trip' },
  { key: 'earnings', label: 'Earnings' },
  { key: 'fare', label: 'Fare Tools' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'safety', label: 'Safety' },
];
const DEFAULT_CITY_LOCATION = {
  latitude: 13.0827,
  longitude: 80.2707,
  address: 'Chennai',
};

export default function DriverDashboard({ token, user, onLogout, onProfilePress = undefined }) {
  const refreshInFlightRef = useRef(false);
  const initialLocationSyncAttemptedRef = useRef(false);
  const lastWatchedLocationRef = useRef(null);
  const pendingRequestIdsRef = useRef(new Set());
  const pendingNotificationInitRef = useRef(false);
  const locationSyncSuspendedUntilRef = useRef(0);
  const lastLocationPauseNoticeAtRef = useRef(0);
  const lastLocationPushAtRef = useRef(0);
  const lastPushedLocationRef = useRef(null);
  const reverseGeocodeInFlightRef = useRef(false);
  const reverseGeocodeCacheRef = useRef(new Map());
  const availabilityUiOverrideUntilRef = useRef(0);
  const socketRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [driverLocation, setDriverLocation] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [blockedPassengerIds, setBlockedPassengerIds] = useState([]);
  const [activeRide, setActiveRide] = useState(null);
  const [earnings, setEarnings] = useState(null);
  const [pricingRules, setPricingRules] = useState(null);
  const [showFareCalculator, setShowFareCalculator] = useState(false);
  const [driverFareConfig, setDriverFareConfig] = useState({
    base_fare: '25',
    per_km_rate: '12',
    surge_multiplier: '1.5',
    night_multiplier: '1.3',
    minimum_fare: '30',
    driver_base_search_radius_km: '5',
    driver_long_distance_search_radius_km: '12',
    driver_pickup_surcharge_per_km: '12',
    peak_hours: '8,9,17,18,19',
  });
  const [driverFareStatus, setDriverFareStatus] = useState('default');
  const [driverFareRequestInfo, setDriverFareRequestInfo] = useState(null);
  const [rideStartOtp, setRideStartOtp] = useState('');
  const [rideEndOtp, setRideEndOtp] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [activeDriverMenu, setActiveDriverMenu] = useState('requests');
  
  const googleMapsWebKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const placesConfigured = isPlacesConfigured();
  const liveLocationRideStatuses = useMemo(() => new Set(['accepted', 'driver_arrived', 'in_progress']), []);
  const activeRideStatus = String(activeRide?.status || '').toLowerCase();
  const activeRideId = String(activeRide?.id || '').trim() || null;
  const liveEtaLabel = useMemo(() => {
    const map = {
      accepted: '5 min',
      driver_arrived: 'Arrived',
      in_progress: 'On Trip',
      completed: 'Done',
    };
    return map[activeRideStatus] || '6 min';
  }, [activeRideStatus]);
  const keralaSafety = useKeralaSafety({
    token,
    userName: user?.name,
    activeBooking: activeRide,
  });
  const shouldSyncDriverLocation = isOnline || liveLocationRideStatuses.has(activeRideStatus);
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

  const readBrowserLocation = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return null;
    }
    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 45000,
        });
      });
      return {
        latitude: Number(position.coords.latitude.toFixed(6)),
        longitude: Number(position.coords.longitude.toFixed(6)),
        address: 'Live location',
      };
    } catch {
      return null;
    }
  }, []);

  const attachReadableAddress = useCallback(
    async (location) => {
      const normalized = normalizeLocation(location);
      if (!normalized) {
        return null;
      }
      const currentAddress = String(normalized.address || '').trim();
      const looksGeneric =
        !currentAddress ||
        currentAddress.toLowerCase() === 'live location' ||
        currentAddress.toLowerCase().startsWith('lat ');
      if (!looksGeneric || !placesConfigured) {
        return normalized;
      }

      const cacheKey = `${normalized.latitude.toFixed(4)},${normalized.longitude.toFixed(4)}`;
      const cachedAddress = reverseGeocodeCacheRef.current.get(cacheKey);
      if (cachedAddress) {
        return { ...normalized, address: cachedAddress };
      }
      if (reverseGeocodeInFlightRef.current) {
        return normalized;
      }

      reverseGeocodeInFlightRef.current = true;
      try {
        const resolvedAddress = await reverseGeocodeLocation(normalized.latitude, normalized.longitude);
        if (resolvedAddress) {
          reverseGeocodeCacheRef.current.set(cacheKey, resolvedAddress);
          return { ...normalized, address: resolvedAddress };
        }
      } catch {
        // Keep coordinate fallback if reverse geocoding fails.
      } finally {
        reverseGeocodeInFlightRef.current = false;
      }

      return normalized;
    },
    [normalizeLocation, placesConfigured],
  );

  const pushDriverLocation = useCallback(
    async ({ locationOverride = null, fallbackLocation = null, silent = false } = {}) => {
      if (Date.now() < locationSyncSuspendedUntilRef.current) {
        return null;
      }

      const liveLocation = await readBrowserLocation();
      const locationToSend =
        normalizeLocation(locationOverride) ||
        normalizeLocation(liveLocation) ||
        normalizeLocation(fallbackLocation) ||
        normalizeLocation(driverLocation);

      if (!locationToSend) {
        return null;
      }

      const now = Date.now();
      const previouslyPushed = lastPushedLocationRef.current;
      const movedEnough =
        !previouslyPushed ||
        Math.abs(previouslyPushed.latitude - locationToSend.latitude) > 0.00003 ||
        Math.abs(previouslyPushed.longitude - locationToSend.longitude) > 0.00003;
      const minPushIntervalMs = movedEnough ? 5000 : 12000;
      if (now - lastLocationPushAtRef.current < minPushIntervalMs) {
        return locationToSend;
      }

      try {
        await apiRequest('/drivers/location', {
          method: 'PUT',
          token,
          body: { location: locationToSend },
        });
        if (socketRef.current) {
          socketRef.current.emit('driver_location_update', {
            booking_id: activeRideId || undefined,
            latitude: locationToSend.latitude,
            longitude: locationToSend.longitude,
            heading: null,
            speed: null,
            accuracy: null,
            address: locationToSend.address,
          });
        }
        lastLocationPushAtRef.current = now;
        lastPushedLocationRef.current = locationToSend;
        locationSyncSuspendedUntilRef.current = 0;
        setDriverLocation(locationToSend);
        attachReadableAddress(locationToSend).then((resolved) => {
          if (resolved) {
            setDriverLocation(resolved);
          }
        });
        return locationToSend;
      } catch (err) {
        const messageLower = String(err?.message || '').toLowerCase();
        const isBackendUnavailable =
          Number(err?.status || 0) === 503 ||
          messageLower.includes('database temporarily unavailable') ||
          messageLower.includes('service unavailable');
        const isRateLimited = Number(err?.status || 0) === 429 || messageLower.includes('too many requests');

        if (isBackendUnavailable) {
          locationSyncSuspendedUntilRef.current = Date.now() + 60000;
          const now = Date.now();
          if (now - lastLocationPauseNoticeAtRef.current > 15000) {
            setMessage('Driver location sync paused for 60 seconds. Backend database is temporarily unavailable.');
            lastLocationPauseNoticeAtRef.current = now;
          }
          return null;
        }
        if (isRateLimited) {
          locationSyncSuspendedUntilRef.current = Date.now() + 20000;
          return null;
        }
        if (!silent) {
          setError(err.message || 'Could not update current driver location.');
        }
        return null;
      }
    },
    [activeRideId, attachReadableAddress, driverLocation, normalizeLocation, readBrowserLocation, token],
  );

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

  const hydrateDriverFareConfig = useCallback((payload) => {
    if (!payload || typeof payload !== 'object') {
      return;
    }
    setDriverFareConfig({
      base_fare: String(payload.base_fare ?? 25),
      per_km_rate: String(payload.per_km_rate ?? 12),
      surge_multiplier: String(payload.surge_multiplier ?? 1.5),
      night_multiplier: String(payload.night_multiplier ?? 1.3),
      minimum_fare: String(payload.minimum_fare ?? 30),
      driver_base_search_radius_km: String(payload.driver_base_search_radius_km ?? 5),
      driver_long_distance_search_radius_km: String(payload.driver_long_distance_search_radius_km ?? 12),
      driver_pickup_surcharge_per_km: String(payload.driver_pickup_surcharge_per_km ?? payload.per_km_rate ?? 12),
      peak_hours: Array.isArray(payload.peak_hours) ? payload.peak_hours.join(',') : '8,9,17,18,19',
    });
  }, []);

  const mapUrl = useMemo(() => {
    if (!googleMapsWebKey) {
      return null;
    }

    const resolveCoords = (location) => {
      if (!location) {
        return null;
      }
      const latitude = typeof location.latitude === 'number'
        ? location.latitude
        : typeof location.lat === 'number'
          ? location.lat
          : null;
      const longitude = typeof location.longitude === 'number'
        ? location.longitude
        : typeof location.lng === 'number'
          ? location.lng
          : null;
      return latitude !== null && longitude !== null ? { latitude, longitude } : null;
    };

    const pickup = resolveCoords(activeRide?.pickup_location || activeRide?.pickup || activeRide?.pickup_location_details);
    const drop = resolveCoords(activeRide?.dropoff_location || activeRide?.dropoff || activeRide?.dropoff_location_details);
    const driverPlace = resolveCoords(driverLocation || activeRide?.driver_location);
    const place = driverPlace || pickup || drop;

    if (pickup && drop) {
      return `https://www.google.com/maps/embed/v1/directions?key=${encodeURIComponent(googleMapsWebKey)}&origin=${pickup.latitude},${pickup.longitude}&destination=${drop.latitude},${drop.longitude}&avoid=tolls|highways`;
    }

    if (place) {
      return `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(googleMapsWebKey)}&q=${place.latitude},${place.longitude}&zoom=14`;
    }

    return `https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(
      googleMapsWebKey,
    )}&center=${DEFAULT_CITY_LOCATION.latitude},${DEFAULT_CITY_LOCATION.longitude}&zoom=11&maptype=roadmap`;
  }, [googleMapsWebKey, activeRide, driverLocation]);

  const runAction = useCallback(async (fn, successText) => {
    try {
      setLoading(true);
      setError('');
      if (successText) {
        setMessage('');
      }
      const result = await fn();
      if (successText) {
        setMessage(successText);
      }
      return result;
    } catch (err) {
      setError(err.message || 'Request failed.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshDriverData = useCallback(async () => {
    const profile = await runAction(() => apiRequest('/drivers/profile', { token }));
    if (profile) {
      if (typeof profile.is_available === 'boolean' && Date.now() >= availabilityUiOverrideUntilRef.current) {
        setIsOnline(profile.is_available);
      }
      const resolvedLocation = normalizeLocation(profile.current_location);
      if (resolvedLocation) {
        setDriverLocation(resolvedLocation);
        attachReadableAddress(resolvedLocation).then((nextLocation) => {
          if (nextLocation) {
            setDriverLocation(nextLocation);
          }
        });
      }
    }

    const [requests, ride, earningsSummary, pricing, fareCalc, blockedPassengers] = await Promise.all([
      apiRequest('/drivers/pending-requests', { token }).catch(() => []),
      apiRequest('/drivers/active-ride', { token }).catch(() => null),
      apiRequest('/drivers/earnings', { token }).catch(() => null),
      apiRequest('/pricing/rules', { token }).catch(() => null),
      apiRequest('/drivers/fare-calculator', { token }).catch(() => null),
      apiRequest('/drivers/blocked-passengers', { token }).catch(() => ({ passenger_ids: [] })),
    ]);
    await Promise.all([
      apiRequest('/subscriptions/config', { token }).catch(() => null),
      apiRequest('/subscriptions/me', { token }).catch(() => null),
    ]);

    setPendingRequests(requests || []);
    setBlockedPassengerIds(Array.isArray(blockedPassengers?.passenger_ids) ? blockedPassengers.passenger_ids : []);
    setActiveRide(ride || null);
    setEarnings(earningsSummary || null);
    setPricingRules(pricing || fareCalc?.default_pricing || null);
    setDriverFareStatus(String(fareCalc?.status || 'default'));
    setDriverFareRequestInfo(fareCalc?.request || null);
    hydrateDriverFareConfig(fareCalc?.request?.payload || fareCalc?.effective_pricing || fareCalc?.default_pricing || null);
    setMessage('Driver dashboard refreshed.');
  }, [attachReadableAddress, hydrateDriverFareConfig, normalizeLocation, runAction, token]);

  const refreshDriverDataSilently = useCallback(async () => {
    if (refreshInFlightRef.current) {
      return;
    }
    refreshInFlightRef.current = true;
    try {
      const [profile, requests, ride, earningsSummary, pricing, fareCalc, blockedPassengers] = await Promise.all([
        apiRequest('/drivers/profile', { token }).catch(() => null),
        apiRequest('/drivers/pending-requests', { token }).catch(() => []),
        apiRequest('/drivers/active-ride', { token }).catch(() => null),
        apiRequest('/drivers/earnings', { token }).catch(() => null),
        apiRequest('/pricing/rules', { token }).catch(() => null),
        apiRequest('/drivers/fare-calculator', { token }).catch(() => null),
        apiRequest('/drivers/blocked-passengers', { token }).catch(() => ({ passenger_ids: [] })),
      ]);
      await Promise.all([
        apiRequest('/subscriptions/config', { token }).catch(() => null),
        apiRequest('/subscriptions/me', { token }).catch(() => null),
      ]);

      if (profile && typeof profile.is_available === 'boolean' && Date.now() >= availabilityUiOverrideUntilRef.current) {
        setIsOnline(profile.is_available);
      }
      const resolvedLocation = normalizeLocation(profile?.current_location);
      if (resolvedLocation) {
        setDriverLocation(resolvedLocation);
        attachReadableAddress(resolvedLocation).then((nextLocation) => {
          if (nextLocation) {
            setDriverLocation(nextLocation);
          }
        });
      }
      setPendingRequests(Array.isArray(requests) ? requests : []);
      setBlockedPassengerIds(Array.isArray(blockedPassengers?.passenger_ids) ? blockedPassengers.passenger_ids : []);
      setActiveRide(ride || null);
      setEarnings(earningsSummary || null);
      setPricingRules(pricing || fareCalc?.default_pricing || null);
      setDriverFareStatus(String(fareCalc?.status || 'default'));
      setDriverFareRequestInfo(fareCalc?.request || null);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [attachReadableAddress, normalizeLocation, token]);

  useEffect(() => {
    if (initialLocationSyncAttemptedRef.current) {
      return;
    }
    initialLocationSyncAttemptedRef.current = true;
    pushDriverLocation({ fallbackLocation: driverLocation, silent: true }).catch(() => null);
  }, [driverLocation, pushDriverLocation]);

  const updateDriverFareField = (field, value) => {
    setDriverFareConfig((prev) => ({ ...prev, [field]: value }));
  };

  const submitDriverFareCalculator = async () => {
    const baseFare = Number(driverFareConfig.base_fare || 0);
    const perKmRate = Number(driverFareConfig.per_km_rate || 0);
    const surgeMultiplier = Number(driverFareConfig.surge_multiplier || 1);
    const nightMultiplier = Number(driverFareConfig.night_multiplier || 1);
    const minimumFare = Number(driverFareConfig.minimum_fare || 0);
    const baseRadius = Number(driverFareConfig.driver_base_search_radius_km || 5);
    const longRadius = Number(driverFareConfig.driver_long_distance_search_radius_km || 12);
    const pickupRate = Number(driverFareConfig.driver_pickup_surcharge_per_km || perKmRate || 0);
    const peakHours = String(driverFareConfig.peak_hours || '')
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 23);

    if ([baseFare, perKmRate, surgeMultiplier, nightMultiplier, minimumFare, baseRadius, longRadius, pickupRate]
      .some((value) => Number.isNaN(value) || value < 0)) {
      setError('Fare config values must be valid non-negative numbers.');
      return;
    }
    if (baseRadius < 0.5) {
      setError('Radius A must be at least 0.5 km.');
      return;
    }
    if (longRadius < baseRadius) {
      setError('Radius B must be greater than or equal to radius A.');
      return;
    }

    const updated = await runAction(
      () =>
        apiRequest('/drivers/fare-calculator', {
          method: 'PUT',
          token,
          body: {
            base_fare: baseFare,
            per_km_rate: perKmRate,
            surge_multiplier: surgeMultiplier,
            night_multiplier: nightMultiplier,
            minimum_fare: minimumFare,
            driver_base_search_radius_km: baseRadius,
            driver_long_distance_search_radius_km: longRadius,
            driver_pickup_surcharge_per_km: pickupRate,
            peak_hours: peakHours.length > 0 ? peakHours : [8, 9, 17, 18, 19],
          },
        }),
      'Fare calculator request submitted. Waiting for admin approval.',
    );
    if (updated) {
      await refreshDriverDataSilently();
    }
  };

  const requestResetToAdminDefault = async () => {
    const done = await runAction(
      () =>
        apiRequest('/drivers/fare-calculator/reset-request', {
          method: 'POST',
          token,
          body: {
            note: 'Driver requested reset to admin default fare calculator.',
          },
        }),
      'Reset request submitted. Waiting for admin approval.',
    );
    if (done) {
      await refreshDriverDataSilently();
    }
  };

  
  useEffect(() => {
    const socket = createAutoBuddySocket(token);
    socketRef.current = socket;
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const socket = socketRef.current;
    const bookingId = activeRideId;
    if (!socket || !bookingId) {
      return undefined;
    }
    const joinBookingRoom = () => {
      socket.emit('join_booking', { booking_id: bookingId });
    };
    socket.on('connect', joinBookingRoom);
    if (socket.connected) {
      joinBookingRoom();
    }
    return () => {
      socket.off('connect', joinBookingRoom);
    };
  }, [activeRideId]);

  useEffect(() => {
    let unmounted = false;
    const tick = async () => {
      if (unmounted) {
        return;
      }
      await refreshDriverDataSilently();
    };
    tick();
    const timer = setInterval(tick, 5000);
    return () => {
      unmounted = true;
      clearInterval(timer);
    };
  }, [refreshDriverDataSilently]);

  useEffect(() => {
    if (!shouldSyncDriverLocation) {
      return undefined;
    }
    let cancelled = false;
    const tick = async () => {
      if (cancelled) {
        return;
      }
      await pushDriverLocation({ silent: true });
    };
    tick();
    const timer = setInterval(tick, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [pushDriverLocation, shouldSyncDriverLocation]);

  useEffect(() => {
    const nextIds = new Set(
      (Array.isArray(pendingRequests) ? pendingRequests : [])
        .map((item) => item?.id)
        .filter(Boolean),
    );
    if (!pendingNotificationInitRef.current) {
      pendingRequestIdsRef.current = nextIds;
      pendingNotificationInitRef.current = true;
      return;
    }
    const newIds = Array.from(nextIds).filter((id) => !pendingRequestIdsRef.current.has(id));
    pendingRequestIdsRef.current = nextIds;
    if (newIds.length > 0) {
      const countText = newIds.length === 1 ? '1 new ride request' : `${newIds.length} new ride requests`;
      notifyWithVoice('New Ride Request', `${countText} received from passengers.`);
    }
  }, [notifyWithVoice, pendingRequests]);

  useEffect(() => {
    if (!shouldSyncDriverLocation || typeof navigator === 'undefined' || !navigator.geolocation) {
      return undefined;
    }

    const minDelta = 0.00003;
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const nextLocation = normalizeLocation({
          latitude: position?.coords?.latitude,
          longitude: position?.coords?.longitude,
          address: 'Live location',
        });
        if (!nextLocation) {
          return;
        }

        const prev = lastWatchedLocationRef.current;
        const movedEnough =
          !prev ||
          Math.abs(prev.latitude - nextLocation.latitude) > minDelta ||
          Math.abs(prev.longitude - nextLocation.longitude) > minDelta;
        if (!movedEnough) {
          return;
        }

        lastWatchedLocationRef.current = nextLocation;
        setDriverLocation(nextLocation);
        pushDriverLocation({ locationOverride: nextLocation, silent: true }).catch(() => null);
      },
      () => null,
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      },
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [normalizeLocation, pushDriverLocation, shouldSyncDriverLocation]);

  const toggleOnlineStatus = async (nextValue) => {
    const next = typeof nextValue === 'boolean' ? nextValue : !isOnline;
    availabilityUiOverrideUntilRef.current = Date.now() + 90000;
    setIsOnline(next);
    setError('');
    setMessage(next ? 'Switching online...' : 'Switching offline...');
    const updated = await runAction(() =>
      apiRequest('/drivers/availability', {
        method: 'PUT',
        token,
        body: { is_available: next },
      }),
    );
    if (updated) {
      const savedStatus = typeof updated?.is_available === 'boolean' ? updated.is_available : next;
      availabilityUiOverrideUntilRef.current = 0;
      setIsOnline(savedStatus);
      if (savedStatus) {
        await pushDriverLocation({
          fallbackLocation: updated?.current_location || driverLocation,
          silent: true,
        });
      }
      setMessage(savedStatus ? 'You are online and discoverable.' : 'You are offline.');
      await refreshDriverDataSilently();
      return;
    }
    setMessage(next ? 'Showing online locally. Backend unavailable now.' : 'Showing offline locally.');
  };

  const acceptRequest = async (bookingId) => {
    const accepted = await runAction(() =>
      apiRequest(`/bookings/${bookingId}/accept`, {
        method: 'PUT',
        token,
      }),
    );
    if (accepted) {
      await pushDriverLocation({ fallbackLocation: driverLocation, silent: true });
      await refreshDriverData();
    }
  };

  const toggleBlockedPassenger = async (passengerId, isBlocked) => {
    const done = await runAction(
      () =>
        apiRequest(`/drivers/blocked-passengers/${passengerId}`, {
          method: 'PUT',
          token,
          body: { is_blocked: !isBlocked },
        }),
      isBlocked ? 'Passenger unblocked.' : 'Passenger blocked.',
    );
    if (done) {
      await refreshDriverDataSilently();
    }
  };

  const moveRideToNextStatus = async () => {
    if (!activeRide?.id) {
      return;
    }
    const currentIndex = STATUS_FLOW.indexOf(String(activeRide.status));
    const nextStatus = currentIndex >= 0 && currentIndex < STATUS_FLOW.length - 1
      ? STATUS_FLOW[currentIndex + 1]
      : null;
    if (!nextStatus) {
      return;
    }
    const requiresStartOtp = nextStatus === 'in_progress';
    const completionStep = nextStatus === 'completed';
    const normalizedStartOtp = String(rideStartOtp || '').trim();
    const normalizedEndOtp = String(rideEndOtp || '').trim();
    if (requiresStartOtp && !normalizedStartOtp) {
      setError('Enter passenger OTP to start trip.');
      return;
    }
    if (completionStep && !normalizedEndOtp) {
      const proceedWithoutOtp =
        typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm('Passenger completion OTP is missing. Complete ride without OTP?')
          : true;
      if (!proceedWithoutOtp) {
        return;
      }
    }
    const updated = await runAction(() =>
      apiRequest(`/bookings/${activeRide.id}/status`, {
        method: 'PUT',
        token,
        body: requiresStartOtp
          ? { status: nextStatus, ride_start_otp: normalizedStartOtp }
          : completionStep
            ? (
              normalizedEndOtp
                ? { status: nextStatus, ride_end_otp: normalizedEndOtp }
                : {
                    status: nextStatus,
                    allow_complete_without_otp: true,
                    complete_without_otp_reason: 'passenger_unavailable',
                  }
            )
            : { status: nextStatus },
      }),
    );
    if (updated) {
      setRideStartOtp('');
      setRideEndOtp('');
      await refreshDriverData();
    }
  };

  const nextActionLabel = useMemo(() => {
    if (!activeRide?.status) {
      return null;
    }
    const map = {
      accepted: 'Mark Arrived',
      driver_arrived: 'Start Trip',
      in_progress: 'Complete Trip',
      completed: null,
    };
    return map[String(activeRide.status)] || null;
  }, [activeRide]);

  const handleProfilePress = useCallback(() => {
    if (typeof onProfilePress === 'function') {
      onProfilePress();
      return;
    }
    setShowProfile(true);
  }, [onProfilePress]);

  if (showProfile) {
    return (
      <DriverProfile
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
          {mapUrl ? (
            <iframe
              title="Live Driver Map"
              src={mapUrl}
              style={styles.mapIframe}
              allowFullScreen
              loading="lazy"
            />
          ) : (
            <View style={styles.mapFallback}>
              <Text style={styles.mapTitle}>Live Driver Map</Text>
              <Text style={styles.mapSub}>Web preview mode. Native map works in Android/iOS builds.</Text>
            </View>
          )}
          <View style={styles.mapOverlayWrap}>
            <GlassCard style={styles.mapOverlayCard}>
              <Text style={styles.mapOverlayTitle}>Driver Navigation</Text>
              <Text style={styles.mapOverlayMalayalam}>പിക്കപ്പ് ലൊക്കേഷനിലേക്ക് പോകുന്നു</Text>
            </GlassCard>
          </View>
        </View>

        <View style={styles.panel}>
          <ScrollView
            style={styles.panelScroll}
            contentContainerStyle={styles.panelScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
          <View style={styles.topBar}>
            <View style={styles.statusBadge}>
              <View
                style={[styles.statusDot, { backgroundColor: isOnline ? '#2E7D32' : '#8A8A8A' }]}
              />
              <View>
                <Text style={styles.statusText}>{isOnline ? 'Online & Ready' : 'Offline'}</Text>
                <Text style={styles.statusSub}>{user?.name || 'Driver'}</Text>
              </View>
            </View>
            <View style={styles.topActions}>
              <TouchableOpacity style={styles.refreshButton} onPress={refreshDriverData} disabled={loading}>
                <Text style={styles.refreshText}>Refresh</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.refreshButton} onPress={handleProfilePress} disabled={loading}>
                <Text style={styles.refreshText}>Profile</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.refreshButton} onPress={onLogout}>
                <Text style={styles.refreshText}>Logout</Text>
              </TouchableOpacity>
              <Switch
                trackColor={{ false: '#C6C6C6', true: '#AED7B0' }}
                thumbColor={isOnline ? '#2E7D32' : '#F3F3F3'}
                onValueChange={toggleOnlineStatus}
                value={isOnline}
                disabled={loading}
              />
            </View>
          </View>

          <Text style={styles.title}>Driver Command Center</Text>
          {!!driverLocation && (
            <Text style={styles.locationText}>
              Current location: {driverLocation.address || `${driverLocation.latitude}, ${driverLocation.longitude}`}
            </Text>
          )}
          {!!error && <Text style={styles.error}>{error}</Text>}
          {!!message && <Text style={styles.message}>{message}</Text>}
          {loading && <ActivityIndicator color={COLORS.primary} style={styles.loader} />}
          <View style={styles.menuRow}>
            {DRIVER_MENU_OPTIONS.map((menu) => (
              <TouchableOpacity
                key={menu.key}
                style={[styles.menuChip, activeDriverMenu === menu.key && styles.menuChipActive]}
                onPress={() => setActiveDriverMenu(menu.key)}>
                <Text style={[styles.menuChipText, activeDriverMenu === menu.key && styles.menuChipTextActive]}>
                  {menu.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {activeDriverMenu === 'safety' && (
            <>
              <KeralaSafetyCard safety={keralaSafety} compact />
              <DriverTrustCard token={token} />
            </>
          )}

          {activeDriverMenu === 'earnings' && (
            <>
              <RevenueCard token={token} role={user?.role} />
              {!!earnings ? (
                <View style={styles.earningsCard}>
                  <Text style={styles.earningsText}>
                    Today INR {earnings.today_earnings} ({earnings.today_rides} rides)
                  </Text>
                  <Text style={styles.earningsText}>
                    Lifetime INR {earnings.total_earnings} ({earnings.total_rides} rides)
                  </Text>
                </View>
              ) : (
                <View style={styles.earningsCard}>
                  <Text style={styles.earningsText}>No earnings summary yet.</Text>
                </View>
              )}
            </>
          )}

          {activeDriverMenu === 'fare' && (
            <>
              <View style={styles.earningsCard}>
                <TouchableOpacity
                  style={styles.actionButtonMuted}
                  onPress={() => setShowFareCalculator((prev) => !prev)}
                  disabled={loading}>
                  <Text style={styles.actionText}>{showFareCalculator ? 'Hide Fare Details' : 'Fare Details'}</Text>
                </TouchableOpacity>
              </View>
              {showFareCalculator && (
                <View style={styles.earningsCard}>
                  <ScrollView
                    style={styles.fareDetailsScroll}
                    contentContainerStyle={styles.fareDetailsContent}
                    showsVerticalScrollIndicator
                    nestedScrollEnabled>
                    <Text style={styles.fareTitle}>Fare Details</Text>
                    {!!pricingRules && (
                      <>
                        <Text style={styles.earningsText}>
                          Trip Fare = max(Min Fare, (Base Fare + Distance x Per KM) x Time Multiplier)
                        </Text>
                        <Text style={styles.earningsText}>
                          Base Fare INR {Number(pricingRules.base_fare || 0).toFixed(2)} | Per KM INR {Number(pricingRules.per_km_rate || 0).toFixed(2)}
                        </Text>
                        <Text style={styles.earningsText}>
                          Min Fare INR {Number(pricingRules.minimum_fare || 0).toFixed(2)} | Surge {Number(pricingRules.surge_multiplier || 1).toFixed(2)}x | Night {Number(pricingRules.night_multiplier || 1).toFixed(2)}x
                        </Text>
                        <Text style={styles.earningsText}>
                          Radius A: {Number(pricingRules.driver_base_search_radius_km || 5).toFixed(1)} km | Radius B: {Number(pricingRules.driver_long_distance_search_radius_km || 12).toFixed(1)} km
                        </Text>
                        <Text style={styles.earningsText}>
                          Extra Pickup: if driver distance {'>'} A, extra = (distance - A) x INR {Number(
                            pricingRules.driver_pickup_surcharge_per_km || pricingRules.per_km_rate || 0,
                          ).toFixed(2)}
                        </Text>
                      </>
                    )}
                    <Text style={styles.fareTitle}>Edit Fare Calculator</Text>
                    <Text style={styles.earningsText}>Status: {driverFareStatus}</Text>
                    {!!driverFareRequestInfo?.status && (
                      <Text style={styles.earningsText}>Last Request: {String(driverFareRequestInfo.status)}</Text>
                    )}
                    {!!driverFareRequestInfo?.request_type && (
                      <Text style={styles.earningsText}>Request Type: {String(driverFareRequestInfo.request_type)}</Text>
                    )}
                    {!!driverFareRequestInfo?.reject_reason && (
                      <Text style={styles.error}>Reason: {driverFareRequestInfo.reject_reason}</Text>
                    )}
                    <Text style={styles.fieldLabel}>Base Fare (INR)</Text>
                    <VoiceTextInput
                      value={driverFareConfig.base_fare}
                      onChangeText={(value) => updateDriverFareField('base_fare', value)}
                      style={styles.otpInput}
                      keyboardType="decimal-pad"
                      placeholder="Base fare"
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <Text style={styles.fieldLabel}>Per KM Rate (INR)</Text>
                    <VoiceTextInput
                      value={driverFareConfig.per_km_rate}
                      onChangeText={(value) => updateDriverFareField('per_km_rate', value)}
                      style={styles.otpInput}
                      keyboardType="decimal-pad"
                      placeholder="Per KM rate"
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <Text style={styles.fieldLabel}>Minimum Fare (INR)</Text>
                    <VoiceTextInput
                      value={driverFareConfig.minimum_fare}
                      onChangeText={(value) => updateDriverFareField('minimum_fare', value)}
                      style={styles.otpInput}
                      keyboardType="decimal-pad"
                      placeholder="Minimum fare"
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <Text style={styles.fieldLabel}>Surge Multiplier</Text>
                    <VoiceTextInput
                      value={driverFareConfig.surge_multiplier}
                      onChangeText={(value) => updateDriverFareField('surge_multiplier', value)}
                      style={styles.otpInput}
                      keyboardType="decimal-pad"
                      placeholder="Surge multiplier"
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <Text style={styles.fieldLabel}>Night Multiplier</Text>
                    <VoiceTextInput
                      value={driverFareConfig.night_multiplier}
                      onChangeText={(value) => updateDriverFareField('night_multiplier', value)}
                      style={styles.otpInput}
                      keyboardType="decimal-pad"
                      placeholder="Night multiplier"
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <Text style={styles.fieldLabel}>Radius A (KM)</Text>
                    <VoiceTextInput
                      value={driverFareConfig.driver_base_search_radius_km}
                      onChangeText={(value) => updateDriverFareField('driver_base_search_radius_km', value)}
                      style={styles.otpInput}
                      keyboardType="decimal-pad"
                      placeholder="Radius A (KM)"
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <Text style={styles.fieldLabel}>Radius B (KM)</Text>
                    <VoiceTextInput
                      value={driverFareConfig.driver_long_distance_search_radius_km}
                      onChangeText={(value) => updateDriverFareField('driver_long_distance_search_radius_km', value)}
                      style={styles.otpInput}
                      keyboardType="decimal-pad"
                      placeholder="Radius B (KM)"
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <Text style={styles.fieldLabel}>Extra Pickup Per KM (INR)</Text>
                    <VoiceTextInput
                      value={driverFareConfig.driver_pickup_surcharge_per_km}
                      onChangeText={(value) => updateDriverFareField('driver_pickup_surcharge_per_km', value)}
                      style={styles.otpInput}
                      keyboardType="decimal-pad"
                      placeholder="Extra pickup per KM"
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <Text style={styles.fieldLabel}>Peak Hours (comma-separated)</Text>
                    <VoiceTextInput
                      value={driverFareConfig.peak_hours}
                      onChangeText={(value) => updateDriverFareField('peak_hours', value)}
                      style={styles.otpInput}
                      placeholder="Peak hours comma separated"
                      placeholderTextColor={COLORS.textMuted}
                    />
                    <TouchableOpacity style={styles.acceptButton} onPress={submitDriverFareCalculator} disabled={loading}>
                      <Text style={styles.acceptText}>Submit For Admin Approval</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionButtonMuted} onPress={requestResetToAdminDefault} disabled={loading}>
                      <Text style={styles.actionText}>Request Reset To Admin Default</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              )}
            </>
          )}

          {activeDriverMenu === 'blocked' && (
            blockedPassengerIds.length > 0 ? (
              <View style={styles.earningsCard}>
                <Text style={styles.fareTitle}>Blocked Passengers</Text>
                {blockedPassengerIds.slice(0, 10).map((passengerId) => (
                  <View key={passengerId} style={styles.blockedRow}>
                    <Text style={styles.earningsText}>{passengerId}</Text>
                    <TouchableOpacity
                      style={styles.blockButton}
                      onPress={() => toggleBlockedPassenger(passengerId, true)}
                      disabled={loading}>
                      <Text style={styles.blockButtonText}>Unblock</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.earningsCard}>
                <Text style={styles.earningsText}>No blocked passengers.</Text>
              </View>
            )
          )}

          {activeDriverMenu === 'trip' && (
            activeRide ? (
              <>
                <FadeSlideView>
                  <GlassCard style={styles.premiumCallout}>
                    <LiveEtaPulse eta={liveEtaLabel} />
                    <Text style={styles.premiumTitle}>Ride Operations Active</Text>
                    <Text style={styles.premiumMalayalam}>Live trip controls are active.</Text>
                  </GlassCard>
                </FadeSlideView>
                <View style={styles.requestCard}>
                  <RideProgressTimeline status={activeRideStatus || 'searching'} />
                  <Text style={styles.passengerName}>Active Ride: {activeRide.passenger_name || 'Passenger'}</Text>
                  <Text style={styles.requestDetails}>Status: {activeRide.status}</Text>
                  <Text style={styles.requestDetails}>
                    Fare INR {activeRide.estimated_fare} | {activeRide.distance_km} km
                  </Text>
                  {!!normalizeLocation(activeRide.pickup_location) && (
                    <Text style={styles.requestDetails}>
                      From: {normalizeLocation(activeRide.pickup_location).address}
                    </Text>
                  )}
                  {!!normalizeLocation(activeRide.drop_location || activeRide.dropoff_location) && (
                    <Text style={styles.requestDetails}>
                      To: {normalizeLocation(activeRide.drop_location || activeRide.dropoff_location).address}
                    </Text>
                  )}
                  {String(activeRide.status) === 'driver_arrived' && (
                    <>
                      <Text style={styles.otpHint}>Ask passenger for OTP to start trip</Text>
                      <VoiceTextInput
                        value={rideStartOtp}
                        onChangeText={setRideStartOtp}
                        keyboardType="number-pad"
                        placeholder="Enter passenger OTP"
                        placeholderTextColor={COLORS.textMuted}
                        style={styles.otpInput}
                        maxLength={8}
                      />
                    </>
                  )}
                  {String(activeRide.status) === 'in_progress' && (
                    <>
                      <Text style={styles.otpHint}>Enter passenger completion OTP (optional)</Text>
                      <VoiceTextInput
                        value={rideEndOtp}
                        onChangeText={setRideEndOtp}
                        keyboardType="number-pad"
                        placeholder="Enter completion OTP"
                        placeholderTextColor={COLORS.textMuted}
                        style={styles.otpInput}
                        maxLength={8}
                      />
                    </>
                  )}
                  {!!nextActionLabel && (
                    <TouchableOpacity style={styles.acceptButton} onPress={moveRideToNextStatus} disabled={loading}>
                      <Text style={styles.acceptText}>{nextActionLabel}</Text>
                    </TouchableOpacity>
                  )}
                  <RideCommunicationCard
                    token={token}
                    booking={activeRide}
                    currentUserId={user?.id}
                    counterpartName={activeRide.passenger_name || 'Passenger'}
                  />
                </View>
              </>
            ) : (
              <PremiumEmptyState
                title="No active ride"
                subtitle="Accept a ride request to start trip operations."
                malayalam="No active ride now."
              />
            )
          )}

          {activeDriverMenu === 'requests' && (
            <>
              {activeRide ? (
                <View style={styles.earningsCard}>
                  <Text style={styles.earningsText}>You already have an active ride. Complete it to receive new requests.</Text>
                </View>
              ) : isOnline ? (
                pendingRequests.length === 0 ? (
                  <PremiumEmptyState
                    title="No pending requests"
                    subtitle="You are online. New bookings will appear shortly."
                    malayalam="New requests will appear here shortly."
                  />
                ) : (
                  pendingRequests.map((req) => {
                    const pickup = normalizeLocation(
                      req.pickup_location || req.pickup || req.pickup_location_details,
                    );
                    const drop = normalizeLocation(
                      req.drop_location ||
                      req.dropoff_location ||
                      req.dropoff ||
                      req.drop_location_details,
                    );
                    return (
                      <View key={req.id} style={styles.requestCard}>
                        <View style={styles.requestInfo}>
                          <Text style={styles.passengerName}>{req.passenger_name}</Text>
                          <Text style={styles.requestDetails}>
                            {req.distance_km} km away | INR {req.estimated_fare}
                          </Text>
                          {!!pickup && (
                            <Text style={styles.requestDetails}>From: {pickup.address}</Text>
                          )}
                          {!!drop && (
                            <Text style={styles.requestDetails}>To: {drop.address}</Text>
                          )}
                        </View>
                        <View style={styles.requestButtonsRow}>
                          <TouchableOpacity
                            style={styles.acceptButton}
                            onPress={() => acceptRequest(req.id)}
                            disabled={loading}>
                            <Text style={styles.acceptText}>Accept</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.blockButton}
                            onPress={() => toggleBlockedPassenger(req.passenger_id, blockedPassengerIds.includes(req.passenger_id))}
                            disabled={loading}>
                            <Text style={styles.blockButtonText}>
                              {blockedPassengerIds.includes(req.passenger_id) ? 'Unblock' : 'Block'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )
              ) : (
                <PremiumEmptyState
                  title="You are offline"
                  subtitle="Switch online to receive nearby ride requests."
                  malayalam="Go online to receive requests."
                />
              )}
            </>
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
  mapFallback: {
    height: 220,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#D7E2DA',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.card,
  },
  mapIframe: {
    width: '100%',
    height: '100%',
    borderWidth: 0,
  },
  mapTitle: { fontSize: 22, fontWeight: '900', color: COLORS.textMain },
  mapSub: { marginTop: 8, fontSize: 14, color: COLORS.textMuted },
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
  premiumCallout: { marginTop: 8, marginBottom: 8 },
  premiumTitle: {
    ...TYPOGRAPHY.title,
    fontSize: 22,
    marginTop: 12,
  },
  premiumMalayalam: {
    marginTop: 4,
    ...TYPOGRAPHY.malayalam,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  statusBadge: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
  statusText: { fontSize: 16, fontWeight: '800', color: COLORS.textMain },
  statusSub: { fontSize: 12, color: COLORS.textMuted },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' },
  refreshButton: {
    borderWidth: 1,
    borderColor: '#D2DED6',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#F8FBF9',
    ...SHADOWS.soft,
  },
  refreshText: { color: COLORS.textMain, fontWeight: '700', fontSize: 12 },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.textMain, marginTop: 12, marginBottom: 10 },
  menuRow: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  menuChip: {
    borderWidth: 1,
    borderColor: '#D2DED6',
    backgroundColor: '#F8FBF9',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  menuChipActive: {
    borderColor: COLORS.primary,
    backgroundColor: '#E3F2E8',
  },
  menuChipText: { color: COLORS.textMain, fontWeight: '700', fontSize: 12 },
  menuChipTextActive: { color: COLORS.primaryDark },
  locationText: { color: '#355243', marginBottom: 8, fontWeight: '600' },
  fareTitle: { color: '#202020', fontWeight: '800', marginBottom: 6 },
  fieldLabel: { color: '#355243', fontWeight: '700', marginTop: 10, marginBottom: 4 },
  error: { color: COLORS.danger, marginBottom: 8 },
  message: { color: '#1B5E20', marginBottom: 8 },
  loader: { marginVertical: 6 },
  earningsCard: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#D7E2DA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    ...SHADOWS.soft,
  },
  earningsText: { color: '#666666', marginBottom: 2 },
  fareDetailsScroll: {
    maxHeight: 360,
  },
  fareDetailsContent: {
    paddingBottom: 6,
  },
  requestCard: {
    backgroundColor: '#FAFAFA',
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#D7E2DA',
    ...SHADOWS.soft,
  },
  requestInfo: { marginBottom: 8 },
  requestButtonsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  blockedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  passengerName: { fontSize: 18, fontWeight: '700', color: '#202020' },
  requestDetails: { fontSize: 14, color: '#666666', marginTop: 4 },
  otpHint: { marginTop: 8, color: '#202020', fontWeight: '600' },
  otpInput: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#D9D9D9',
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    color: '#202020',
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  acceptButton: {
    marginTop: 8,
    backgroundColor: '#2E7D32',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  actionButtonMuted: {
    marginTop: 8,
    backgroundColor: '#455A64',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  blockButton: {
    marginTop: 8,
    backgroundColor: '#C62828',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  blockButtonText: { color: '#fff', fontWeight: '700' },
  acceptText: { color: '#fff', fontWeight: '700' },
  actionText: { color: '#fff', fontWeight: '700' },
  offlineText: { color: '#666666', fontSize: 15, marginTop: 12 },
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
    fontSize: 12,
  },
  subscriptionPlanChipTextSelected: {
    color: COLORS.primaryDark,
  },
  subscriptionDueBox: {
    marginTop: 8,
    gap: 8,
  },
});
