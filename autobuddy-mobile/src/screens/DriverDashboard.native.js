import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import MapView, { Marker, Polyline } from 'react-native-maps';
import BottomSheet from '@gorhom/bottom-sheet';

import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';
import DriverTrustCard from '../components/DriverTrustCard';
import RevenueCard from '../components/RevenueCard';
import RideCommunicationCard from '../components/RideCommunicationCard';
import VoiceTextInput from '../components/VoiceTextInput';
import { useDriverRealtimeTracking } from '../hooks/useDriverRealtimeTracking';

const driverMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#38414e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212a37' }] },
];

const DEFAULT_DRIVER_LOCATION = {
  latitude: 13.0827,
  longitude: 80.2707,
  address: 'Current location unavailable',
};

const STATUS_FLOW = ['accepted', 'driver_arrived', 'in_progress', 'completed'];
const DRIVER_MENU_OPTIONS = [
  { key: 'requests', label: 'Ride Flow' },
  { key: 'earnings', label: 'Earnings' },
  { key: 'spin', label: 'Spin & Win' },
  { key: 'fare', label: 'Fare Tools' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'trust', label: 'Trust' },
];
const PRIMARY_DRIVER_MENU_KEY = 'requests';
const DASHBOARD_DRIVER_MENU_KEYS = new Set([PRIMARY_DRIVER_MENU_KEY]);
const SECONDARY_DRIVER_MENU_OPTIONS = DRIVER_MENU_OPTIONS.filter(
  (menu) => !DASHBOARD_DRIVER_MENU_KEYS.has(menu.key),
);

export default function DriverDashboard({ token, user, onLogout, onProfilePress = undefined }) {
  const snapPoints = useMemo(() => ['26%', '55%'], []);
  const refreshInFlightRef = useRef(false);
  const initialLocationSyncAttemptedRef = useRef(false);
  const lastWatchedLocationRef = useRef(null);
  const mapRef = useRef(null);
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

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [serverIsOnline, setServerIsOnline] = useState(false);
  const [availabilitySyncPending, setAvailabilitySyncPending] = useState(false);
  const [driverLocation, setDriverLocation] = useState(DEFAULT_DRIVER_LOCATION);
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
  const [activeDriverMenu, setActiveDriverMenu] = useState(PRIMARY_DRIVER_MENU_KEY);
  const [showDriverMenus, setShowDriverMenus] = useState(false);
  const [spinWinStatus, setSpinWinStatus] = useState(null);
  const [spinWinLoading, setSpinWinLoading] = useState(false);
  const [spinningNow, setSpinningNow] = useState(false);
  const liveLocationRideStatuses = useMemo(() => new Set(['accepted', 'driver_arrived', 'in_progress']), []);
  const activeRideStatus = String(activeRide?.status || '').toLowerCase();
  const activeRideId = String(activeRide?.id || '').trim() || null;
  const navigatingToPickup = activeRideStatus === 'accepted' || activeRideStatus === 'driver_arrived';
  const navigatingToDrop = activeRideStatus === 'in_progress';
  const showStageRoute = navigatingToPickup || navigatingToDrop;
  const shouldSyncDriverLocation = (isOnline && !availabilitySyncPending) || liveLocationRideStatuses.has(activeRideStatus);
  const {
    connected: realtimeConnected,
    trackingError,
    emitSocketLocationUpdate,
  } = useDriverRealtimeTracking({
    token,
    activeRideId,
    enabled: shouldSyncDriverLocation,
    manageLocationWatch: false,
  });
  

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

  const readDeviceLocation = useCallback(async () => {
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        return null;
      }
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const latitude = Number(current.coords.latitude.toFixed(6));
      const longitude = Number(current.coords.longitude.toFixed(6));
      const cacheKey = `${latitude.toFixed(4)},${longitude.toFixed(4)}`;
      const cachedAddress = reverseGeocodeCacheRef.current.get(cacheKey);
      let address = cachedAddress || 'Live location';
      if (!cachedAddress && !reverseGeocodeInFlightRef.current) {
        reverseGeocodeInFlightRef.current = true;
        try {
          const geo = await Location.reverseGeocodeAsync({ latitude, longitude });
          const first = Array.isArray(geo) ? geo[0] : null;
          const pretty = [first?.name, first?.street, first?.city, first?.region].filter(Boolean).join(', ');
          if (pretty) {
            address = pretty;
            reverseGeocodeCacheRef.current.set(cacheKey, pretty);
          }
        } catch {
          // Keep live-location fallback.
        } finally {
          reverseGeocodeInFlightRef.current = false;
        }
      }
      return {
        latitude,
        longitude,
        address,
      };
    } catch {
      return null;
    }
  }, []);

  const pushDriverLocation = useCallback(
    async ({ locationOverride = null, fallbackLocation = null, silent = false } = {}) => {
      if (Date.now() < locationSyncSuspendedUntilRef.current) {
        return null;
      }

      const liveLocation = await readDeviceLocation();
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
        emitSocketLocationUpdate({
            booking_id: activeRideId || undefined,
            latitude: locationToSend.latitude,
            longitude: locationToSend.longitude,
            heading: null,
            speed: null,
            accuracy: null,
            address: locationToSend.address,
          });
        lastLocationPushAtRef.current = now;
        lastPushedLocationRef.current = locationToSend;
        locationSyncSuspendedUntilRef.current = 0;
        setDriverLocation(locationToSend);
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
    [activeRideId, driverLocation, emitSocketLocationUpdate, normalizeLocation, readDeviceLocation, token],
  );

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

  const notifyWithVoice = useCallback((title, body) => {
    Alert.alert(title, body);
    AccessibilityInfo.announceForAccessibility(`${title}. ${body}`);
  }, []);

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
      }
    }

    const [requests, ride, earningsSummary, pricing, fareCalc, blockedPassengers, spinStatus] = await Promise.all([
      apiRequest('/drivers/pending-requests', { token }).catch(() => []),
      apiRequest('/drivers/active-ride', { token }).catch(() => null),
      apiRequest('/drivers/earnings', { token }).catch(() => null),
      apiRequest('/pricing/rules', { token }).catch(() => null),
      apiRequest('/drivers/fare-calculator', { token }).catch(() => null),
      apiRequest('/drivers/blocked-passengers', { token }).catch(() => ({ passenger_ids: [] })),
      apiRequest('/spin-win/config', { token }).catch(() => null),
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
    setSpinWinStatus(spinStatus || null);
    setMessage('Driver dashboard refreshed.');
  }, [hydrateDriverFareConfig, normalizeLocation, runAction, token, availabilitySyncPending]);

  const refreshDriverDataSilently = useCallback(async ({ includeProfile = false, includeMeta = false } = {}) => {
    if (refreshInFlightRef.current) {
      return;
    }
    refreshInFlightRef.current = true;
    try {
      const [profile, requests, ride, blockedPassengers, spinStatus] = await Promise.all([
        includeProfile ? apiRequest('/drivers/profile', { token }).catch(() => null) : Promise.resolve(null),
        apiRequest('/drivers/pending-requests', { token }).catch(() => []),
        apiRequest('/drivers/active-ride', { token }).catch(() => null),
        apiRequest('/drivers/blocked-passengers', { token }).catch(() => ({ passenger_ids: [] })),
        apiRequest('/spin-win/config', { token }).catch(() => null),
      ]);
      const [earningsSummary, pricing, fareCalc] = includeMeta
        ? await Promise.all([
          apiRequest('/drivers/earnings', { token }).catch(() => null),
          apiRequest('/pricing/rules', { token }).catch(() => null),
          apiRequest('/drivers/fare-calculator', { token }).catch(() => null),
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
  }, [availabilitySyncPending, hydrateDriverFareConfig, normalizeLocation, token]);

  const refreshRideStageValidation = useCallback(async () => {
    const [ride, requests] = await Promise.all([
      apiRequest('/drivers/active-ride', { token }).catch(() => null),
      apiRequest('/drivers/pending-requests', { token }).catch(() => []),
    ]);
    setActiveRide(ride || null);
    setPendingRequests(Array.isArray(requests) ? requests : []);
  }, [token]);

  useEffect(() => {
    if (!showStageRoute || !mapRef.current || !activeRide) {
      return;
    }
    const pickup = normalizeLocation(activeRide.pickup_location || activeRide.pickup || activeRide.pickup_location_details);
    const drop = normalizeLocation(activeRide.dropoff_location || activeRide.dropoff || activeRide.dropoff_location_details);
    const target = navigatingToDrop ? (drop || pickup) : (pickup || drop);
    if (!target) return;
    try {
      mapRef.current.animateToRegion(
        {
          latitude: target.latitude,
          longitude: target.longitude,
          latitudeDelta: 0.02,
          longitudeDelta: 0.02,
        },
        500,
      );
    } catch (_e) {
      // ignore
    }
  }, [activeRide, navigatingToDrop, normalizeLocation, showStageRoute]);

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
    if (initialLocationSyncAttemptedRef.current) {
      return;
    }
    initialLocationSyncAttemptedRef.current = true;
    pushDriverLocation({ fallbackLocation: driverLocation, silent: true }).catch(() => null);
  }, [driverLocation, pushDriverLocation]);

  useEffect(() => {
    let unmounted = false;
    refreshDriverDataSilently({ includeProfile: true, includeMeta: true }).catch(() => null);
    const tick = async () => {
      if (unmounted) {
        return;
      }
      await refreshDriverDataSilently();
    };
    tick();
    const timer = setInterval(tick, 12000);
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
    let cancelled = false;
    const tick = async () => {
      if (cancelled) {
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
    const timer = setInterval(tick, 6000);
    tick();
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [retryPendingAvailabilitySync]);

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
    if (!shouldSyncDriverLocation) {
      return undefined;
    }

    let mounted = true;
    let subscription = null;
    const minDelta = 0.00003;

    const startWatching = async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!mounted || permission.status !== 'granted') {
          return;
        }
        subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 4000,
            distanceInterval: 8,
          },
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
        );
      } catch {
        // Keep silent; periodic location sync remains as fallback.
      }
    };

    startWatching();

    return () => {
      mounted = false;
      if (subscription) {
        subscription.remove();
      }
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
      Alert.alert(
        'Complete Without OTP?',
        'Passenger completion OTP is missing. Do you want to complete ride without OTP?',
        [
          { text: 'No', style: 'cancel' },
          {
            text: 'Yes, complete',
            onPress: async () => {
              const updatedWithoutOtp = await runAction(() =>
                apiRequest(`/bookings/${activeRide.id}/status`, {
                  method: 'PUT',
                  token,
                  body: {
                    status: nextStatus,
                    allow_complete_without_otp: true,
                    complete_without_otp_reason: 'passenger_unavailable',
                  },
                }),
              );
              if (updatedWithoutOtp) {
                setRideStartOtp('');
                setRideEndOtp('');
                setActiveRide((prev) => {
                  if (!updatedWithoutOtp || typeof updatedWithoutOtp !== 'object') {
                    return null;
                  }
                  return { ...(prev || {}), ...updatedWithoutOtp };
                });
                await refreshRideStageValidation();
              }
            },
          },
        ],
      );
      return;
    }
    const updated = await runAction(() =>
      apiRequest(`/bookings/${activeRide.id}/status`, {
        method: 'PUT',
        token,
        body: requiresStartOtp
          ? { status: nextStatus, ride_start_otp: normalizedStartOtp }
          : completionStep
            ? { status: nextStatus, ride_end_otp: normalizedEndOtp }
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
      // If trip started, push a fresh driver location and enable live-route UI
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

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        customMapStyle={driverMapStyle}
        initialRegion={{ ...driverLocation, latitudeDelta: 0.02, longitudeDelta: 0.02 }}>
        <Marker coordinate={driverLocation} title="You">
          <View style={styles.driverMarker} />
        </Marker>
        {/* Show stage-based route: accepted/arrived -> pickup, in_progress -> drop */}
        {showStageRoute && activeRide && (
          (() => {
            const pickup = normalizeLocation(activeRide.pickup_location || activeRide.pickup || activeRide.pickup_location_details);
            const drop = normalizeLocation(activeRide.dropoff_location || activeRide.dropoff || activeRide.dropoff_location_details);
            const destination = navigatingToDrop ? (drop || pickup) : (pickup || drop);
            const routeCoords = [];
            if (driverLocation) routeCoords.push({ latitude: driverLocation.latitude, longitude: driverLocation.longitude });
            if (destination) routeCoords.push({ latitude: destination.latitude, longitude: destination.longitude });
            return (
              <>
                {pickup && navigatingToPickup && <Marker coordinate={pickup} pinColor="green" />}
                {drop && navigatingToDrop && <Marker coordinate={drop} pinColor="red" />}
                {routeCoords.length >= 2 && (
                  <Polyline coordinates={routeCoords} strokeColor={COLORS.primary} strokeWidth={4} />
                )}
              </>
            );
          })()
        )}
      </MapView>

      <View style={styles.topBar}>
        <View style={styles.statusBadge}>
          <View
            style={[styles.statusDot, { backgroundColor: serverIsOnline ? COLORS.primary : COLORS.textMuted }]}
          />
          <View>
            <Text style={styles.statusText}>{serverIsOnline ? 'Online & Ready' : 'Offline'}</Text>
            <Text style={styles.statusSub}>{user?.name || 'Driver'}</Text>
          </View>
        </View>
        <View style={styles.topActions}>
          <TouchableOpacity style={styles.refreshButton} onPress={refreshDriverData} disabled={loading}>
            <Text style={styles.refreshText}>Refresh</Text>
          </TouchableOpacity>
          {typeof onProfilePress === 'function' && (
            <TouchableOpacity style={styles.refreshButton} onPress={onProfilePress} disabled={loading}>
              <Text style={styles.refreshText}>Profile</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.refreshButton} onPress={onLogout}>
            <Text style={styles.refreshText}>Logout</Text>
          </TouchableOpacity>
          <Switch
            trackColor={{ false: '#767577', true: COLORS.primaryDark }}
            thumbColor={isOnline ? COLORS.primary : '#f4f3f4'}
            onValueChange={toggleOnlineStatus}
            value={isOnline}
            disabled={loading || availabilitySyncPending}
          />
        </View>
      </View>

      <BottomSheet index={0} snapPoints={snapPoints} backgroundStyle={styles.sheetBackground}>
        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetContent}
          nestedScrollEnabled
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Driver Command Center</Text>
          {!!driverLocation && (
            <Text style={styles.locationText}>
              Current location: {driverLocation.address || `${driverLocation.latitude}, ${driverLocation.longitude}`}
            </Text>
          )}
          <Text style={styles.infoText}>
            Live Tracking: {realtimeConnected ? 'Online' : 'Reconnecting...'}
          </Text>
          {!!trackingError && <Text style={styles.warningText}>{trackingError}</Text>}
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

          {activeDriverMenu === 'trust' && <DriverTrustCard token={token} />}

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
                  style={styles.refreshButton}
                  onPress={() => refreshSpinWinStatus({ silent: false })}
                  disabled={spinWinLoading}>
                  <Text style={styles.refreshText}>{spinWinLoading ? 'Refreshing...' : 'Refresh'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {activeDriverMenu === 'fare' && (
            <>
              <View style={styles.earningsCard}>
                <TouchableOpacity style={styles.refreshButton} onPress={() => setShowFareCalculator((prev) => !prev)} disabled={loading}>
                  <Text style={styles.refreshText}>{showFareCalculator ? 'Hide Fare Details' : 'Fare Details'}</Text>
                </TouchableOpacity>
              </View>
              {showFareCalculator && (
                <View style={styles.earningsCard}>
                  <ScrollView
                    style={styles.fareDetailsScroll}
                    contentContainerStyle={styles.fareDetailsContent}
                    nestedScrollEnabled
                    showsVerticalScrollIndicator>
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
                    <VoiceTextInput value={driverFareConfig.base_fare} onChangeText={(v) => updateDriverFareField('base_fare', v)} style={styles.otpInput} keyboardType="decimal-pad" placeholder="Base fare" placeholderTextColor={COLORS.textMuted} />
                    <Text style={styles.fieldLabel}>Per KM Rate (INR)</Text>
                    <VoiceTextInput value={driverFareConfig.per_km_rate} onChangeText={(v) => updateDriverFareField('per_km_rate', v)} style={styles.otpInput} keyboardType="decimal-pad" placeholder="Per KM rate" placeholderTextColor={COLORS.textMuted} />
                    <Text style={styles.fieldLabel}>Minimum Fare (INR)</Text>
                    <VoiceTextInput value={driverFareConfig.minimum_fare} onChangeText={(v) => updateDriverFareField('minimum_fare', v)} style={styles.otpInput} keyboardType="decimal-pad" placeholder="Minimum fare" placeholderTextColor={COLORS.textMuted} />
                    <Text style={styles.fieldLabel}>Surge Multiplier</Text>
                    <VoiceTextInput value={driverFareConfig.surge_multiplier} onChangeText={(v) => updateDriverFareField('surge_multiplier', v)} style={styles.otpInput} keyboardType="decimal-pad" placeholder="Surge multiplier" placeholderTextColor={COLORS.textMuted} />
                    <Text style={styles.fieldLabel}>Night Multiplier</Text>
                    <VoiceTextInput value={driverFareConfig.night_multiplier} onChangeText={(v) => updateDriverFareField('night_multiplier', v)} style={styles.otpInput} keyboardType="decimal-pad" placeholder="Night multiplier" placeholderTextColor={COLORS.textMuted} />
                    <Text style={styles.fieldLabel}>Radius A (KM)</Text>
                    <VoiceTextInput value={driverFareConfig.driver_base_search_radius_km} onChangeText={(v) => updateDriverFareField('driver_base_search_radius_km', v)} style={styles.otpInput} keyboardType="decimal-pad" placeholder="Radius A (KM)" placeholderTextColor={COLORS.textMuted} />
                    <Text style={styles.fieldLabel}>Radius B (KM)</Text>
                    <VoiceTextInput value={driverFareConfig.driver_long_distance_search_radius_km} onChangeText={(v) => updateDriverFareField('driver_long_distance_search_radius_km', v)} style={styles.otpInput} keyboardType="decimal-pad" placeholder="Radius B (KM)" placeholderTextColor={COLORS.textMuted} />
                    <Text style={styles.fieldLabel}>Extra Pickup Per KM (INR)</Text>
                    <VoiceTextInput value={driverFareConfig.driver_pickup_surcharge_per_km} onChangeText={(v) => updateDriverFareField('driver_pickup_surcharge_per_km', v)} style={styles.otpInput} keyboardType="decimal-pad" placeholder="Extra pickup per KM" placeholderTextColor={COLORS.textMuted} />
                    <Text style={styles.fieldLabel}>Peak Hours (comma-separated)</Text>
                    <VoiceTextInput value={driverFareConfig.peak_hours} onChangeText={(v) => updateDriverFareField('peak_hours', v)} style={styles.otpInput} placeholder="Peak hours comma separated" placeholderTextColor={COLORS.textMuted} />
                    <TouchableOpacity style={styles.acceptButton} onPress={submitDriverFareCalculator} disabled={loading}>
                      <Text style={styles.acceptText}>Submit For Admin Approval</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.refreshButton} onPress={requestResetToAdminDefault} disabled={loading}>
                      <Text style={styles.refreshText}>Request Reset To Admin Default</Text>
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
                      <Text style={styles.acceptText}>Unblock</Text>
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
              <View style={styles.requestCard}>
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
            ) : (
              <View style={styles.offlineState}>
                <Text style={styles.offlineText}>No active ride right now.</Text>
              </View>
            )
          )}

          {activeDriverMenu === 'requests' && (
            <>
              {!activeRide ? (
                isOnline ? (
                  <View>
                    {pendingRequests.length === 0 ? (
                      <Text style={styles.offlineText}>No pending requests right now.</Text>
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
                                <Text style={styles.acceptText}>
                                  {blockedPassengerIds.includes(req.passenger_id) ? 'Unblock' : 'Block'}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>
                ) : (
                  <View style={styles.offlineState}>
                    <Text style={styles.offlineText}>Go online to receive ride requests.</Text>
                  </View>
                )
              ) : null}
            </>
          )}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  map: { flex: 1 },
  topBar: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    padding: 13,
    borderRadius: 18,
    flexWrap: 'wrap',
    gap: 8,
    ...SHADOWS.card,
  },
  statusBadge: { flexDirection: 'row', alignItems: 'center' },
  statusDot: { width: 12, height: 12, borderRadius: 6, marginRight: 8 },
  statusText: { fontSize: 16, fontWeight: '800', color: COLORS.textMain },
  statusSub: { fontSize: 12, color: COLORS.textMuted },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  refreshButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: COLORS.background,
    ...SHADOWS.soft,
  },
  refreshText: { color: COLORS.textMain, fontWeight: '700', fontSize: 12 },
  driverMarker: {
    width: 24,
    height: 24,
    backgroundColor: COLORS.secondary,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: '#fff',
  },
  sheetBackground: { backgroundColor: COLORS.surface, borderRadius: 24, ...SHADOWS.card },
  sheetScroll: { flex: 1 },
  sheetContent: { padding: 20, flexGrow: 1, paddingBottom: 26 },
  title: { fontSize: 22, fontWeight: '900', color: COLORS.textMain, marginBottom: 10 },
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
    backgroundColor: COLORS.background,
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
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
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
  locationText: { color: COLORS.textMuted, marginBottom: 8, fontWeight: '600' },
  infoText: { color: COLORS.textMain, marginBottom: 6, fontWeight: '600' },
  warningText: { color: '#D97706', marginBottom: 8, fontWeight: '600' },
  fareTitle: { color: COLORS.textMain, fontWeight: '800', marginBottom: 6 },
  fieldLabel: { color: COLORS.textMain, fontWeight: '700', marginTop: 10, marginBottom: 4 },
  error: { color: COLORS.danger, marginBottom: 8 },
  message: { color: COLORS.secondary, marginBottom: 8 },
  loader: { marginVertical: 6 },
  earningsCard: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    ...SHADOWS.soft,
  },
  earningsText: { color: COLORS.textMuted, marginBottom: 2 },
  fareDetailsScroll: {
    maxHeight: 360,
  },
  fareDetailsContent: {
    paddingBottom: 6,
  },
  requestCard: {
    backgroundColor: COLORS.background,
    padding: 14,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
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
  passengerName: { fontSize: 18, fontWeight: '700', color: COLORS.textMain },
  requestDetails: { fontSize: 14, color: COLORS.textMuted, marginTop: 4 },
  otpHint: { marginTop: 8, color: COLORS.textMain, fontWeight: '600' },
  otpInput: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    color: COLORS.textMain,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  acceptButton: {
    marginTop: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  blockButton: {
    marginTop: 8,
    backgroundColor: COLORS.danger,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  acceptText: { color: '#fff', fontWeight: '700' },
  offlineState: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  offlineText: { color: COLORS.textMuted, fontSize: 15 },
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
});
