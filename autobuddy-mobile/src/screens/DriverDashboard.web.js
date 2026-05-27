import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
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
import WebGoogleLiveMap from '../components/WebGoogleLiveMap';
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
  { key: 'requests', label: 'Ride Flow' },
  { key: 'earnings', label: 'Earnings' },
  { key: 'spin', label: 'Spin & Win' },
  { key: 'fare', label: 'Fare Tools' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'safety', label: 'Safety' },
];
const PRIMARY_DRIVER_MENU_KEY = 'requests';
const DASHBOARD_DRIVER_MENU_KEYS = new Set([PRIMARY_DRIVER_MENU_KEY]);
const SECONDARY_DRIVER_MENU_OPTIONS = DRIVER_MENU_OPTIONS.filter(
  (menu) => !DASHBOARD_DRIVER_MENU_KEYS.has(menu.key),
);
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
  const availabilityToggleRequestIdRef = useRef(0);
  const pendingAvailabilitySyncRef = useRef(null);
  const availabilityRetryInFlightRef = useRef(false);
  const socketRef = useRef(null);
  const driverPollCooldownUntilRef = useRef(0);
  const lastRateLimitNoticeAtRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [serverIsOnline, setServerIsOnline] = useState(false);
  const [availabilitySyncPending, setAvailabilitySyncPending] = useState(false);
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
  const [activeDriverMenu, setActiveDriverMenu] = useState(PRIMARY_DRIVER_MENU_KEY);
  const [showDriverMenus, setShowDriverMenus] = useState(false);
  const [spinWinStatus, setSpinWinStatus] = useState(null);
  const [spinWinLoading, setSpinWinLoading] = useState(false);
  const [spinningNow, setSpinningNow] = useState(false);
  
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
  const shouldSyncDriverLocation = (isOnline && !availabilitySyncPending) || liveLocationRideStatuses.has(activeRideStatus);
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

  const isPageVisible = useCallback(() => {
    if (typeof document === 'undefined') {
      return true;
    }
    return document.visibilityState !== 'hidden';
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
    async ({ locationOverride = null, fallbackLocation = null, speedKmhOverride = null, silent = false } = {}) => {
      if (Date.now() < locationSyncSuspendedUntilRef.current) {
        return null;
      }
      if (!isPageVisible()) {
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
      const minPushIntervalMs = movedEnough ? 10000 : 30000;
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
            speed:
              Number.isFinite(Number(speedKmhOverride)) && Number(speedKmhOverride) >= 0
                ? Number(speedKmhOverride)
                : null,
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
    [activeRideId, attachReadableAddress, driverLocation, isPageVisible, normalizeLocation, readBrowserLocation, token],
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

  const mapState = useMemo(() => {
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
    const navigatingToPickup = activeRideStatus === 'accepted' || activeRideStatus === 'driver_arrived';
    const navigatingToDrop = activeRideStatus === 'in_progress';
    const routeOrigin = navigatingToPickup || navigatingToDrop ? (driverPlace || pickup) : null;
    const routeDestination = navigatingToPickup ? pickup : navigatingToDrop ? drop : null;
    const hasRoute =
      !!routeOrigin &&
      !!routeDestination &&
      (Math.abs(routeOrigin.latitude - routeDestination.latitude) > 0.000001 ||
        Math.abs(routeOrigin.longitude - routeDestination.longitude) > 0.000001);
    const place = driverPlace || pickup || drop;
    const usingBasicEmbed = !googleMapsWebKey;
    let fallbackUrl = '';

    if (usingBasicEmbed) {
      if (hasRoute) {
        fallbackUrl = `https://www.google.com/maps?output=embed&saddr=${routeOrigin.latitude},${routeOrigin.longitude}&daddr=${routeDestination.latitude},${routeDestination.longitude}`;
      } else if (pickup && drop) {
        fallbackUrl = `https://www.google.com/maps?output=embed&saddr=${pickup.latitude},${pickup.longitude}&daddr=${drop.latitude},${drop.longitude}`;
      } else if (place) {
        fallbackUrl = `https://www.google.com/maps?output=embed&q=${place.latitude},${place.longitude}&z=14`;
      } else {
        fallbackUrl = `https://www.google.com/maps?output=embed&q=${DEFAULT_CITY_LOCATION.latitude},${DEFAULT_CITY_LOCATION.longitude}&z=11`;
      }
    } else if (hasRoute) {
      fallbackUrl = `https://www.google.com/maps/embed/v1/directions?key=${encodeURIComponent(googleMapsWebKey)}&origin=${routeOrigin.latitude},${routeOrigin.longitude}&destination=${routeDestination.latitude},${routeDestination.longitude}&avoid=tolls|highways`;
    } else if (pickup && drop) {
      fallbackUrl = `https://www.google.com/maps/embed/v1/directions?key=${encodeURIComponent(googleMapsWebKey)}&origin=${pickup.latitude},${pickup.longitude}&destination=${drop.latitude},${drop.longitude}&avoid=tolls|highways`;
    } else if (place) {
      fallbackUrl = `https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(googleMapsWebKey)}&q=${place.latitude},${place.longitude}&zoom=14`;
    } else {
      fallbackUrl = `https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(
        googleMapsWebKey,
      )}&center=${DEFAULT_CITY_LOCATION.latitude},${DEFAULT_CITY_LOCATION.longitude}&zoom=11&maptype=roadmap`;
    }

    return {
      pickup,
      drop,
      driverPlace,
      routeOrigin,
      routeDestination,
      fallbackUrl,
    };
  }, [googleMapsWebKey, activeRide, activeRideStatus, driverLocation]);

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

  const retryPendingAvailabilitySync = useCallback(async () => {
    const pending = pendingAvailabilitySyncRef.current;
    if (!pending || availabilityRetryInFlightRef.current) {
      return;
    }
    availabilityRetryInFlightRef.current = true;
    try {
      const updated = await apiRequest('/drivers/availability', {
        method: 'PUT',
        token,
        body: { is_available: !!pending.desired },
      });
      const savedStatus =
        typeof updated?.is_available === 'boolean' ? updated.is_available : !!pending.desired;
      pendingAvailabilitySyncRef.current = null;
      setAvailabilitySyncPending(false);
      availabilityUiOverrideUntilRef.current = Date.now() + 15000;
      setIsOnline(savedStatus);
      if (savedStatus) {
        await pushDriverLocation({
          fallbackLocation: updated?.current_location || driverLocation,
          silent: true,
        });
      }
      setMessage(savedStatus ? 'You are online and discoverable.' : 'You are offline.');
    } catch (err) {
      const status = Number(err?.status || 0);
      const errText = String(err?.message || '').toLowerCase();
      const retriable =
        status === 429 ||
        status === 503 ||
        errText.includes('temporarily unavailable') ||
        errText.includes('service unavailable') ||
        errText.includes('network timeout') ||
        errText.includes('network request failed') ||
        errText.includes('failed to fetch');
      if (retriable) {
        pendingAvailabilitySyncRef.current = {
          desired: !!pending.desired,
          attempts: Number(pending.attempts || 0) + 1,
          lastAttemptAt: Date.now(),
        };
        availabilityUiOverrideUntilRef.current = Date.now() + 300000;
        setAvailabilitySyncPending(true);
        setIsOnline(!!pending.desired);
      } else {
        pendingAvailabilitySyncRef.current = null;
        setAvailabilitySyncPending(false);
      }
    } finally {
      availabilityRetryInFlightRef.current = false;
    }
  }, [driverLocation, pushDriverLocation, token]);

  const requestDriverData = useCallback(
    async (path, fallbackValue) => {
      try {
        return await apiRequest(path, { token });
      } catch (err) {
        const status = Number(err?.status || 0);
        if (status === 429) {
          const now = Date.now();
          driverPollCooldownUntilRef.current = Math.max(driverPollCooldownUntilRef.current, now + 30000);
          if (now - lastRateLimitNoticeAtRef.current > 15000) {
            setMessage('Server is busy. Slowing dashboard sync for 30 seconds.');
            lastRateLimitNoticeAtRef.current = now;
          }
        } else if (status === 503) {
          driverPollCooldownUntilRef.current = Math.max(driverPollCooldownUntilRef.current, Date.now() + 20000);
        }
        return fallbackValue;
      }
    },
    [token],
  );

  const refreshDriverData = useCallback(async () => {
    const profile = await runAction(() => apiRequest('/drivers/profile', { token }));
    if (profile) {
      // Always update from server when we fetch profile
      if (typeof profile.is_available === 'boolean') {
        setServerIsOnline(profile.is_available);
        const canApplyServerAvailability =
          !availabilitySyncPending &&
          !pendingAvailabilitySyncRef.current &&
          Date.now() >= availabilityUiOverrideUntilRef.current;
        // Avoid overriding an in-flight toggle with stale profile snapshots.
        if (canApplyServerAvailability) {
          setIsOnline(profile.is_available);
        }
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

    const [requests, ride, earningsSummary, pricing, fareCalc, blockedPassengers, spinStatus] = await Promise.all([
      requestDriverData('/drivers/pending-requests', []),
      requestDriverData('/drivers/active-ride', null),
      requestDriverData('/drivers/earnings', null),
      requestDriverData('/pricing/rules', null),
      requestDriverData('/drivers/fare-calculator', null),
      requestDriverData('/drivers/blocked-passengers', { passenger_ids: [] }),
      requestDriverData('/spin-win/config', null),
    ]);

    setPendingRequests(requests || []);
    setBlockedPassengerIds(Array.isArray(blockedPassengers?.passenger_ids) ? blockedPassengers.passenger_ids : []);
    setActiveRide(ride || null);
    setEarnings(earningsSummary || null);
    setPricingRules(pricing || fareCalc?.default_pricing || null);
    setDriverFareStatus(String(fareCalc?.status || 'default'));
    setDriverFareRequestInfo(fareCalc?.request || null);
    hydrateDriverFareConfig(fareCalc?.request?.payload || fareCalc?.effective_pricing || fareCalc?.default_pricing || null);
    setSpinWinStatus(spinStatus || null);
    setMessage('Driver dashboard refreshed.');
  }, [attachReadableAddress, hydrateDriverFareConfig, normalizeLocation, requestDriverData, runAction, token, availabilitySyncPending]);

  const refreshDriverDataSilently = useCallback(async ({ includeProfile = false, includeMeta = false } = {}) => {
    if (refreshInFlightRef.current) {
      return;
    }
    refreshInFlightRef.current = true;
    try {
      const [profile, requests, ride, blockedPassengers, spinStatus] = await Promise.all([
        includeProfile ? requestDriverData('/drivers/profile', null) : Promise.resolve(null),
        requestDriverData('/drivers/pending-requests', []),
        requestDriverData('/drivers/active-ride', null),
        requestDriverData('/drivers/blocked-passengers', { passenger_ids: [] }),
        requestDriverData('/spin-win/config', null),
      ]);
      const [earningsSummary, pricing, fareCalc] = includeMeta
        ? await Promise.all([
          requestDriverData('/drivers/earnings', null),
          requestDriverData('/pricing/rules', null),
          requestDriverData('/drivers/fare-calculator', null),
        ])
        : [null, null, null];

      if (includeProfile && profile && typeof profile.is_available === 'boolean') {
        // Always sync server state, then update local state if no pending changes
        setServerIsOnline(profile.is_available);
        const canApplyServerAvailability =
          !availabilitySyncPending &&
          !pendingAvailabilitySyncRef.current &&
          Date.now() >= availabilityUiOverrideUntilRef.current;
        if (canApplyServerAvailability) {
          setIsOnline(profile.is_available);
        }
      }
      if (includeProfile) {
        const resolvedLocation = normalizeLocation(profile?.current_location);
        if (resolvedLocation) {
          setDriverLocation(resolvedLocation);
          attachReadableAddress(resolvedLocation).then((nextLocation) => {
            if (nextLocation) {
              setDriverLocation(nextLocation);
            }
          });
        }
      }
      setPendingRequests(Array.isArray(requests) ? requests : []);
      setBlockedPassengerIds(Array.isArray(blockedPassengers?.passenger_ids) ? blockedPassengers.passenger_ids : []);
      setActiveRide(ride || null);
      setSpinWinStatus(spinStatus || null);
      if (includeMeta) {
        setEarnings(earningsSummary || null);
        setPricingRules(pricing || fareCalc?.default_pricing || null);
        setDriverFareStatus(String(fareCalc?.status || 'default'));
        setDriverFareRequestInfo(fareCalc?.request || null);
        hydrateDriverFareConfig(
          fareCalc?.request?.payload || fareCalc?.effective_pricing || fareCalc?.default_pricing || null,
        );
      }
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [availabilitySyncPending, attachReadableAddress, hydrateDriverFareConfig, normalizeLocation, requestDriverData]);

  const refreshRideStageValidation = useCallback(async () => {
    const [ride, requests] = await Promise.all([
      requestDriverData('/drivers/active-ride', null),
      requestDriverData('/drivers/pending-requests', []),
    ]);
    setActiveRide(ride || null);
    setPendingRequests(Array.isArray(requests) ? requests : []);
  }, [requestDriverData]);

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
          setError(err.message || 'Could not load Spin & Win status.');
        }
        return null;
      } finally {
        if (!silent) {
          setSpinWinLoading(false);
        }
      }
    },
    [token],
  );

  const spinNow = async () => {
    if (spinningNow) {
      return;
    }
    try {
      setSpinningNow(true);
      setError('');
      const result = await apiRequest('/spin-win/spin', { method: 'POST', token });
      const rewardLabel = String(result?.reward?.label || 'reward');
      const remaining = Number(result?.spins_left_today ?? 0);
      setMessage(`Spin complete: ${rewardLabel}. Spins left today: ${remaining}.`);
      await refreshSpinWinStatus({ silent: true });
    } catch (err) {
      setError(err.message || 'Spin failed. Please try again.');
    } finally {
      setSpinningNow(false);
    }
  };

  useEffect(() => {
    if (initialLocationSyncAttemptedRef.current) {
      return;
    }
    initialLocationSyncAttemptedRef.current = true;
    pushDriverLocation({ fallbackLocation: driverLocation, silent: true }).catch(() => null);
  }, [driverLocation, pushDriverLocation]);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (cancelled) {
        return;
      }
      if (!isPageVisible()) {
        return;
      }
      const pending = pendingAvailabilitySyncRef.current;
      if (!pending) {
        return;
      }
      const lastAttemptAt = Number(pending.lastAttemptAt || 0);
      if (Date.now() - lastAttemptAt < 12000) {
        return;
      }
      await retryPendingAvailabilitySync();
    };
    const timer = setInterval(tick, 10000);
    tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isPageVisible, retryPendingAvailabilitySync]);

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
      await refreshDriverDataSilently({ includeMeta: true });
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
      await refreshDriverDataSilently({ includeMeta: true });
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
    let cycleCount = 0;
    const tick = async () => {
      if (unmounted) {
        return;
      }
      if (!isPageVisible()) {
        return;
      }
      if (Date.now() < driverPollCooldownUntilRef.current) {
        return;
      }
      cycleCount += 1;
      await refreshDriverDataSilently({
        includeProfile: cycleCount % 3 === 0,
        includeMeta: cycleCount % 5 === 0,
      });
    };
    refreshDriverDataSilently({ includeProfile: true, includeMeta: true }).catch(() => null);
    tick();
    const timer = setInterval(tick, 20000);
    return () => {
      unmounted = true;
      clearInterval(timer);
    };
  }, [isPageVisible, refreshDriverDataSilently]);

  useEffect(() => {
    if (!shouldSyncDriverLocation) {
      return undefined;
    }
    let cancelled = false;
    const tick = async () => {
      if (cancelled) {
        return;
      }
      if (!isPageVisible()) {
        return;
      }
      await pushDriverLocation({ silent: true });
    };
    tick();
    const timer = setInterval(tick, 30000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isPageVisible, pushDriverLocation, shouldSyncDriverLocation]);

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
	        const speedMps = Number(position?.coords?.speed ?? 0);
	        const speedKmh = Number.isFinite(speedMps) && speedMps > 0 ? speedMps * 3.6 : 0;
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
	        pushDriverLocation({
	          locationOverride: nextLocation,
	          speedKmhOverride: speedKmh,
	          silent: true,
	        }).catch(() => null);
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
    if (loading || availabilitySyncPending) {
      return;
    }
    const next = typeof nextValue === 'boolean' ? nextValue : !isOnline;
    if (next === isOnline && !pendingAvailabilitySyncRef.current) {
      return;
    }
    const requestId = availabilityToggleRequestIdRef.current + 1;
    availabilityToggleRequestIdRef.current = requestId;
    
    // Immediately show optimistic UI
    availabilityUiOverrideUntilRef.current = Date.now() + 15000;
    setIsOnline(next);
    setAvailabilitySyncPending(true);
    setError('');
    setMessage(next ? 'Going online...' : 'Going offline...');

    try {
      const updated = await apiRequest('/drivers/availability', {
        method: 'PUT',
        token,
        body: { is_available: next },
      });

      // Only process response if this is still the latest request
      if (requestId !== availabilityToggleRequestIdRef.current) {
        return;
      }

      if (updated && typeof updated.is_available === 'boolean') {
        const savedStatus = updated.is_available;
        setServerIsOnline(savedStatus);
        availabilityUiOverrideUntilRef.current = Date.now() + 15000;
        setIsOnline(savedStatus);
        setAvailabilitySyncPending(false);
        pendingAvailabilitySyncRef.current = null;
        setMessage(savedStatus ? 'You are online and discoverable.' : 'You are offline.');
        
        // If going online, push location
        if (savedStatus) {
          await pushDriverLocation({
            fallbackLocation: updated?.current_location || driverLocation,
            silent: true,
          });
        }
        // Don't refresh profile immediately - trust the API response to avoid stale data overwriting correct state
        await refreshDriverDataSilently({ includeProfile: false });
      } else {
        // Fallback: assume success if no error thrown
        setServerIsOnline(next);
        availabilityUiOverrideUntilRef.current = Date.now() + 15000;
        setIsOnline(next);
        setAvailabilitySyncPending(false);
        pendingAvailabilitySyncRef.current = null;
        setMessage(next ? 'You are online and discoverable.' : 'You are offline.');
        // Don't refresh profile immediately - trust the API response to avoid stale data overwriting correct state
        await refreshDriverDataSilently({ includeProfile: false });
      }
    } catch (err) {
      // On error, revert to server state
      if (requestId !== availabilityToggleRequestIdRef.current) {
        return;
      }
      
      setError(`Failed to update status: ${err?.message || 'Unknown error'}`);
      setMessage('');
      
      // Try to fetch current state from server
      try {
        const profile = await apiRequest('/drivers/profile', { token });
        if (profile && typeof profile.is_available === 'boolean') {
          setServerIsOnline(profile.is_available);
          setIsOnline(profile.is_available);
        }
      } catch (_profileErr) {
        // If we can't fetch profile, revert to opposite of what we tried to set
        setIsOnline(!next);
        setServerIsOnline(!next);
      }
      
      setAvailabilitySyncPending(false);
      pendingAvailabilitySyncRef.current = null;
    }
  };

  const acceptRequest = async (bookingId) => {
    const accepted = await runAction(() =>
      apiRequest(`/bookings/${bookingId}/accept`, {
        method: 'PUT',
        token,
      }),
    );
    if (accepted) {
      setPendingRequests((prev) => (Array.isArray(prev) ? prev.filter((item) => item?.id !== bookingId) : prev));
      await pushDriverLocation({ fallbackLocation: driverLocation, silent: true });
      await refreshRideStageValidation();
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
      await refreshDriverDataSilently({ includeProfile: true });
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
      setActiveRide((prev) => {
        if (completionStep) {
          return null;
        }
        if (!updated || typeof updated !== 'object') {
          return prev;
        }
        return { ...(prev || {}), ...updated };
      });
      // If trip started, push a fresh driver location and show live route promptly
      if (requiresStartOtp) {
        try {
          await pushDriverLocation({ fallbackLocation: driverLocation, silent: true });
        } catch (_e) {
          // ignore
        }
      }
      await refreshRideStageValidation();
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
          <WebGoogleLiveMap
            apiKey={googleMapsWebKey}
            title="Live Driver Map"
            fallbackUrl={mapState.fallbackUrl}
            mapStyle={styles.mapIframe}
            defaultCenter={DEFAULT_CITY_LOCATION}
            pickupLocation={mapState.pickup}
            dropoffLocation={mapState.drop}
            driverLocation={mapState.driverPlace}
            routeOrigin={mapState.routeOrigin}
            routeDestination={mapState.routeDestination}
          />
        </View>

        <View style={styles.panel}>
          <ScrollView
            style={styles.panelScroll}
            contentContainerStyle={styles.panelScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
          <View style={styles.topBar}>
            <TouchableOpacity 
              style={[styles.statusBadgeButton, { backgroundColor: serverIsOnline ? '#E8F5E9' : '#F5F5F5', borderColor: serverIsOnline ? '#2E7D32' : '#BDBDBD' }]}
              onPress={() => toggleOnlineStatus()}
              disabled={loading || availabilitySyncPending}
            >
              <View style={[styles.statusDot, { backgroundColor: availabilitySyncPending ? '#FFA500' : serverIsOnline ? '#2E7D32' : '#8A8A8A' }]} />
              <View style={styles.statusContent}>
                <Text style={[styles.statusText, { color: serverIsOnline ? '#2E7D32' : '#666' }]}>
                  {availabilitySyncPending ? 'Updating...' : (serverIsOnline ? 'ONLINE & READY' : 'OFFLINE')}
                </Text>
                <Text style={styles.statusSub}>{user?.name || 'Driver'} • Tap to toggle</Text>
              </View>
              {availabilitySyncPending && <ActivityIndicator size="small" color="#FFA500" />}
            </TouchableOpacity>
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
          <View style={styles.dashboardTopRow}>
            <TouchableOpacity
              style={[
                styles.primaryMenuButton,
                activeDriverMenu === PRIMARY_DRIVER_MENU_KEY && styles.primaryMenuButtonActive,
              ]}
              onPress={() => {
                setActiveDriverMenu(PRIMARY_DRIVER_MENU_KEY);
                setShowDriverMenus(false);
              }}>
              <Text style={styles.primaryMenuButtonText}>Ride Flow</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuToggleButton}
              onPress={() => setShowDriverMenus((prev) => !prev)}>
              <Text style={styles.menuToggleButtonText}>{showDriverMenus ? 'Hide Menus' : 'Other Menus'}</Text>
            </TouchableOpacity>
          </View>

          {showDriverMenus && (
            <View style={styles.secondaryMenuRow}>
              {SECONDARY_DRIVER_MENU_OPTIONS.map((menu) => (
                <TouchableOpacity
                  key={menu.key}
                  style={[styles.menuChip, activeDriverMenu === menu.key && styles.menuChipActive]}
                  onPress={() => {
                    setActiveDriverMenu(menu.key);
                    setShowDriverMenus(false);
                  }}>
                  <Text style={[styles.menuChipText, activeDriverMenu === menu.key && styles.menuChipTextActive]}>
                    {menu.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {activeDriverMenu !== PRIMARY_DRIVER_MENU_KEY && (
            <View style={styles.activeMenuInfoRow}>
              <Text style={styles.activeMenuInfoText}>
                {DRIVER_MENU_OPTIONS.find((menu) => menu.key === activeDriverMenu)?.label || 'Menu'}
              </Text>
              <TouchableOpacity
                style={styles.menuToggleButton}
                onPress={() => {
                  setActiveDriverMenu(PRIMARY_DRIVER_MENU_KEY);
                  setShowDriverMenus(false);
                }}>
                <Text style={styles.menuToggleButtonText}>Back to Requests</Text>
              </TouchableOpacity>
            </View>
          )}

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

          {activeDriverMenu === 'spin' && (
            <View style={styles.earningsCard}>
              <Text style={styles.fareTitle}>Daily Spin & Win</Text>
              {!spinWinStatus ? (
                <Text style={styles.earningsText}>Spin status is unavailable. Tap refresh.</Text>
              ) : (
                <>
                  <Text style={styles.earningsText}>
                    Status: {spinWinStatus.enabled ? 'Enabled' : 'Disabled'}
                  </Text>
                  <Text style={styles.earningsText}>
                    Daily limit: {Number(spinWinStatus.daily_spin_limit || 0)} | Used: {Number(spinWinStatus.spins_used_today || 0)} | Left: {Number(spinWinStatus.spins_left_today || 0)}
                  </Text>
                  {!!spinWinStatus.starts_at && (
                    <Text style={styles.earningsText}>Campaign Start: {new Date(spinWinStatus.starts_at).toLocaleString()}</Text>
                  )}
                  {!!spinWinStatus.ends_at && (
                    <Text style={styles.earningsText}>Campaign End: {new Date(spinWinStatus.ends_at).toLocaleString()}</Text>
                  )}
                  {!spinWinStatus.eligible && (
                    <Text style={styles.warningText}>
                      {spinWinStatus.eligibility_reason || 'Not eligible for Spin & Win.'}
                    </Text>
                  )}
                  {!!spinWinStatus.latest_reward && (
                    <Text style={styles.earningsText}>
                      Last reward: {spinWinStatus.latest_reward.prize_label || 'Reward'} ({spinWinStatus.latest_reward.reward_type || '-'})
                    </Text>
                  )}
                </>
              )}
              <View style={styles.requestButtonsRow}>
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={spinNow}
                  disabled={
                    spinningNow
                    || spinWinLoading
                    || !spinWinStatus?.eligible
                    || Number(spinWinStatus?.spins_left_today || 0) <= 0
                  }>
                  <Text style={styles.acceptText}>{spinningNow ? 'Spinning...' : 'Spin Now'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionButtonMuted}
                  onPress={() => refreshSpinWinStatus({ silent: false })}
                  disabled={spinWinLoading}>
                  <Text style={styles.actionText}>{spinWinLoading ? 'Refreshing...' : 'Refresh'}</Text>
                </TouchableOpacity>
              </View>
            </View>
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

          {activeDriverMenu === 'requests' && (
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
                      <View style={styles.otpCard}>
                        <Text style={styles.otpCardLabel}>🔐 PASSENGER OTP REQUIRED</Text>
                        <Text style={styles.otpCardHint}>Ask passenger to share their pickup OTP</Text>
                        <VoiceTextInput
                          value={rideStartOtp}
                          onChangeText={setRideStartOtp}
                          keyboardType="number-pad"
                          placeholder="0000"
                          placeholderTextColor="#BDBDBD"
                          style={styles.otpInputLarge}
                          maxLength={8}
                          autoFocus={true}
                        />
                        <Text style={styles.otpCardNote}>Enter the 4-8 digit code only</Text>
                      </View>
                    </>
                  )}
                  {String(activeRide.status) === 'in_progress' && (
                    <>
                      <View style={styles.otpCard}>
                        <Text style={styles.otpCardLabel}>🏁 COMPLETION OTP (Optional)</Text>
                        <Text style={styles.otpCardHint}>Passenger drop-off OTP if available</Text>
                        <VoiceTextInput
                          value={rideEndOtp}
                          onChangeText={setRideEndOtp}
                          keyboardType="number-pad"
                          placeholder="0000"
                          placeholderTextColor="#BDBDBD"
                          style={styles.otpInputLarge}
                          maxLength={8}
                        />
                        <Text style={styles.otpCardNote}>Leave blank to complete without OTP</Text>
                      </View>
                    </>
                  )}
                  {!!nextActionLabel && (
                    <TouchableOpacity style={styles.nextActionButton} onPress={moveRideToNextStatus} disabled={loading}>
                      <Text style={styles.nextActionButtonText}>{nextActionLabel}</Text>
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
              {!activeRide ? (
                isOnline ? (
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
                      const isBlocked = blockedPassengerIds.includes(req.passenger_id);
                      return (
                        <View key={req.id} style={styles.requestCardNew}>
                          <View style={styles.requestCardHeader}>
                            <View style={styles.requestCardTitle}>
                              <Text style={styles.passengerNameNew}>{req.passenger_name}</Text>
                              <Text style={styles.requestCardId}>#{req.id?.toString()?.slice(-6) || 'N/A'}</Text>
                            </View>
                            <View style={styles.requestCardBadges}>
                              <View style={styles.distanceBadge}>
                                <Text style={styles.distanceBadgeText}>{req.distance_km} km</Text>
                              </View>
                              <View style={styles.fareBadge}>
                                <Text style={styles.fareBadgeText}>₹{req.estimated_fare}</Text>
                              </View>
                            </View>
                          </View>
                          
                          <View style={styles.requestCardLocations}>
                            {!!pickup && (
                              <View style={styles.locationRow}>
                                <Text style={styles.locationLabel}>From:</Text>
                                <Text style={styles.requestLocationText}>{pickup.address}</Text>
                              </View>
                            )}
                            {!!drop && (
                              <View style={styles.locationRow}>
                                <Text style={styles.locationLabel}>To:</Text>
                                <Text style={styles.requestLocationText}>{drop.address}</Text>
                              </View>
                            )}
                          </View>

                          <View style={styles.requestButtonsRow}>
                            <TouchableOpacity
                              style={styles.acceptButtonNew}
                              onPress={() => acceptRequest(req.id)}
                              disabled={loading}>
                              <Text style={styles.acceptTextNew}>✓ Accept</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.blockButtonNew, isBlocked && styles.blockButtonActive]}
                              onPress={() => toggleBlockedPassenger(req.passenger_id, isBlocked)}
                              disabled={loading}>
                              <Text style={[styles.blockButtonTextNew, isBlocked && styles.blockButtonTextActive]}>
                                {isBlocked ? '✓ Blocked' : 'Block'}
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
                )
              ) : null}
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
  statusBadgeButton: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 14, 
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 2,
    gap: 10,
    minWidth: 200,
    ...SHADOWS.soft,
  },
  statusContent: { flex: 1 },
  statusDot: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
  statusText: { fontSize: 14, fontWeight: '900', color: COLORS.textMain },
  statusSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
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
    borderColor: '#D2DED6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#F8FBF9',
  },
  menuToggleButtonText: { color: COLORS.textMain, fontWeight: '700' },
  secondaryMenuRow: { flexDirection: 'row', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  activeMenuInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  activeMenuInfoText: { color: COLORS.textMain, fontWeight: '800', fontSize: 14 },
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
  requestCardNew: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginBottom: 12,
    borderLeftWidth: 5,
    borderLeftColor: '#2E7D32',
    borderWidth: 1,
    borderColor: '#E8F5E9',
    padding: 14,
    ...SHADOWS.soft,
  },
  requestCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  requestCardTitle: { flex: 1, gap: 2 },
  passengerNameNew: { fontSize: 18, fontWeight: '800', color: '#1B5E20' },
  requestCardId: { fontSize: 12, color: '#888', fontWeight: '600' },
  requestCardBadges: { flexDirection: 'row', gap: 6 },
  distanceBadge: {
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFCC80',
  },
  distanceBadgeText: { fontSize: 12, fontWeight: '800', color: '#E65100' },
  fareBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#81C784',
  },
  fareBadgeText: { fontSize: 12, fontWeight: '800', color: '#2E7D32' },
  requestCardLocations: { marginBottom: 10, gap: 6 },
  locationRow: { flexDirection: 'row', gap: 8 },
  locationLabel: { fontSize: 12, fontWeight: '700', color: '#666', minWidth: 40 },
  requestLocationText: { fontSize: 12, color: '#444', flex: 1 },
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
  otpCard: {
    marginTop: 12,
    marginBottom: 12,
    backgroundColor: '#F0F7FF',
    borderRadius: 12,
    borderLeftWidth: 6,
    borderLeftColor: '#1976D2',
    padding: 14,
    borderWidth: 1,
    borderColor: '#BBDEFB',
    ...SHADOWS.soft,
  },
  otpCardLabel: {
    fontSize: 14,
    fontWeight: '900',
    color: '#1565C0',
    marginBottom: 4,
  },
  otpCardHint: {
    fontSize: 12,
    color: '#1976D2',
    marginBottom: 12,
    fontWeight: '500',
  },
  otpInputLarge: {
    borderWidth: 2,
    borderColor: '#1976D2',
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    color: '#000000',
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
    marginBottom: 8,
  },
  otpCardNote: {
    fontSize: 11,
    color: '#666',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  nextActionButton: {
    marginTop: 10,
    backgroundColor: '#2E7D32',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    ...SHADOWS.soft,
  },
  nextActionButtonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  acceptButton: {
    marginTop: 8,
    backgroundColor: '#2E7D32',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  acceptButtonNew: {
    flex: 1,
    backgroundColor: '#2E7D32',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    ...SHADOWS.soft,
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
  blockButtonNew: {
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BDBDBD',
    alignItems: 'center',
    minWidth: 90,
  },
  blockButtonActive: {
    backgroundColor: '#FFEBEE',
    borderColor: '#EF5350',
  },
  blockButtonText: { color: '#fff', fontWeight: '700' },
  blockButtonTextNew: { color: '#666', fontWeight: '700', fontSize: 13 },
  blockButtonTextActive: { color: '#D32F2F', fontWeight: '800' },
  acceptText: { color: '#fff', fontWeight: '700' },
  acceptTextNew: { color: '#fff', fontWeight: '800', fontSize: 14 },
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
