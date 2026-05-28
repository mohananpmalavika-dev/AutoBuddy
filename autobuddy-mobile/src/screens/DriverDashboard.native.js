import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import * as WebBrowser from 'expo-web-browser';
import MapView, { Marker, Polyline } from 'react-native-maps';
import BottomSheet from '@gorhom/bottom-sheet';

import { apiRequest } from '../lib/api';
import { createAutoBuddySocket } from '../lib/socket';
import { COLORS, SHADOWS } from '../theme';
import KeralaSafetyCard from '../components/KeralaSafetyCard';
import DriverTrustCard from '../components/DriverTrustCard';
import DriverKycPanel from '../components/DriverKycPanel';
import RevenueCard from '../components/RevenueCard';
import RideCommunicationCard from '../components/RideCommunicationCard';
import VoiceTextInput from '../components/VoiceTextInput';
import RideCard from '../components/RideCard';
import DriverTabBar from '../components/DriverTabBar';
import EarningsPanel from '../components/EarningsPanel';
import DocumentUploadPanel from '../components/DocumentUploadPanel';
import VehicleManagementPanel from '../components/VehicleManagementPanel';
import SupportTicketPanel from '../components/SupportTicketPanel';
import EnhancedSettingsPanel from '../components/EnhancedSettingsPanel';
import ProfileManagementPanel from '../components/ProfileManagementPanel';
import AnalyticsDashboard from '../components/AnalyticsDashboard';
import RideHistoryPanel from '../components/RideHistoryPanel';
import NotificationCenter from '../components/NotificationCenter';
import ScheduledRidesPanel from '../components/ScheduledRidesPanel';
import { useNotifications } from '../contexts/NotificationContext';
import { usePreferences } from '../contexts/PreferencesContext';
import { DRIVER_QUICK_ACTIONS } from '../constants/driverQuickActions';
import { useKeralaSafety } from '../hooks/useKeralaSafety';
import { useDriverRealtimeTracking } from '../hooks/useDriverRealtimeTracking';
import { useNotificationManager } from '../hooks/useNotificationManager';
import {
  filterBlockedPassengers,
  formatBlockedPassengerDate,
  getBlockedPassengerRideSummary,
  normalizeBlockedPassengerRows,
} from '../lib/driverBlockedPassengers';

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

const DEFAULT_DRIVER_SETTINGS = {
  push_notifications: true,
  email_notifications: true,
  sms_alerts: true,
  sound_enabled: true,
  vibration_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00',
  language: 'en',
  theme: 'light',
  share_location: true,
  accept_promo: true,
};

const STATUS_FLOW = ['accepted', 'driver_arrived', 'in_progress', 'completed'];
const DRIVER_MOVING_TRACK_INTERVAL_MS = 5000;
const DRIVER_IDLE_TRACK_INTERVAL_MS = 20000;
const DRIVER_IDLE_SPEED_THRESHOLD_KMH = 2;
const AVAILABILITY_RETRY_WINDOW_MS = 300000;

function normalizeDriverSettings(rawSettings = {}) {
  const source =
    rawSettings?.settings && typeof rawSettings.settings === 'object'
      ? rawSettings.settings
      : rawSettings;

  if (!source || typeof source !== 'object') {
    return DEFAULT_DRIVER_SETTINGS;
  }

  return {
    ...DEFAULT_DRIVER_SETTINGS,
    ...source,
    share_location: source.share_location ?? DEFAULT_DRIVER_SETTINGS.share_location,
  };
}

function isRetriableAvailabilityError(err) {
  const status = Number(err?.status || 0);
  const errText = String(err?.message || '').toLowerCase();
  return (
    status === 429 ||
    status === 503 ||
    errText.includes('temporarily unavailable') ||
    errText.includes('service unavailable') ||
    errText.includes('network timeout') ||
    errText.includes('network request failed') ||
    errText.includes('failed to fetch')
  );
}

function getAvailabilityErrorMessage(err) {
  const statusCode = Number(err?.status || 0);
  const errMsg = String(err?.message || '').toLowerCase();

  if (statusCode === 404) {
    return 'Availability endpoint not found. Please retry.';
  }
  if (statusCode === 401) {
    return 'Your session expired. Please log in again.';
  }
  if (statusCode === 429) {
    return 'Too many requests. Retrying automatically...';
  }
  if (statusCode === 503) {
    return 'Server is temporarily busy. Retrying automatically...';
  }
  if (statusCode >= 500) {
    return `Server error (${statusCode}). Please retry in a moment.`;
  }
  if (statusCode >= 400) {
    return `Request error: ${err?.message || 'Invalid request'}`;
  }
  if (errMsg.includes('network') || errMsg.includes('failed to fetch')) {
    return 'Network connection issue. Retrying automatically...';
  }
  return err?.message || 'Failed to update availability status.';
}

function DriverDashboardContent({ token, user, onLogout, onProfilePress = undefined }) {
  const snapPoints = useMemo(() => ['26%', '55%'], []);
  const refreshInFlightRef = useRef(false);
  const initialLocationSyncAttemptedRef = useRef(false);
  const lastWatchedLocationRef = useRef(null);
  const mapRef = useRef(null);
  const pendingRequestIdsRef = useRef(new Set());
  const pendingNotificationInitRef = useRef(false);
  const rideRequestSocketRef = useRef(null);
  const realtimeRideQueueRefreshInFlightRef = useRef(false);
  const realtimeRideQueueRefreshQueuedRef = useRef(false);
  const locationSyncSuspendedUntilRef = useRef(0);
  const lastLocationPauseNoticeAtRef = useRef(0);
  const lastLocationPushAtRef = useRef(0);
  const lastPushedLocationRef = useRef(null);
  const reverseGeocodeInFlightRef = useRef(false);
  const reverseGeocodeCacheRef = useRef(new Map());
  const availabilityUiOverrideUntilRef = useRef(0);
  const availabilityLocalChangeAtRef = useRef(0);
  const availabilityToggleRequestIdRef = useRef(0);
  const availabilityToggleInFlightRef = useRef(null);
  const pendingAvailabilitySyncRef = useRef(null);
  const availabilityRetryInFlightRef = useRef(false);
  const availabilitySyncPendingRef = useRef(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [serverIsOnline, setServerIsOnline] = useState(false);
  const [availabilitySyncPending, setAvailabilitySyncPending] = useState(false);
  const [menuBadges, setMenuBadges] = useState({});
  const [driverSettings, setDriverSettings] = useState(DEFAULT_DRIVER_SETTINGS);
  useNotificationManager(token, user?.id, driverSettings);
  const { unreadCount } = useNotifications();
  const { updatePreference } = usePreferences();
  const [driverLocation, setDriverLocation] = useState(DEFAULT_DRIVER_LOCATION);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [upcomingRides, setUpcomingRides] = useState(null);
  const [blockedPassengerIds, setBlockedPassengerIds] = useState([]);
  const [blockedPassengers, setBlockedPassengers] = useState([]);
  const [blockedPassengerSearch, setBlockedPassengerSearch] = useState('');
  const [activeRide, setActiveRide] = useState(null);
  const [earnings, setEarnings] = useState(null);
  const [pricingRules, setPricingRules] = useState(null);
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
  const [activeTab, setActiveTab] = useState('requests');
  const [supportLaunchAction, setSupportLaunchAction] = useState('help');
  const [earningsLaunchAction, setEarningsLaunchAction] = useState('summary');
  const [expandedRideCard, setExpandedRideCard] = useState(false);
  const [spinWinStatus, setSpinWinStatus] = useState(null);
  const [spinWinLoading, setSpinWinLoading] = useState(false);
  const [spinningNow, setSpinningNow] = useState(false);
  const [driverTrackingIntervalMs, setDriverTrackingIntervalMs] = useState(DRIVER_MOVING_TRACK_INTERVAL_MS);
  const setAvailabilitySyncPendingState = useCallback((value) => {
    const nextValue = !!value;
    availabilitySyncPendingRef.current = nextValue;
    setAvailabilitySyncPending(nextValue);
  }, []);
  const canApplyServerAvailabilitySnapshot = useCallback((requestStartedAt = Date.now()) => (
    requestStartedAt >= availabilityLocalChangeAtRef.current &&
    !availabilitySyncPendingRef.current &&
    !availabilityToggleInFlightRef.current &&
    !pendingAvailabilitySyncRef.current &&
    Date.now() >= availabilityUiOverrideUntilRef.current
  ), []);
  const liveLocationRideStatuses = useMemo(() => new Set(['accepted', 'driver_arrived', 'in_progress']), []);
  const activeRideStatus = String(activeRide?.status || '').toLowerCase();
  const activeRideId = String(activeRide?.id || '').trim() || null;
  const shareLocationWhileOnline = driverSettings.share_location !== false;
  const activeRideSharesLocation = liveLocationRideStatuses.has(activeRideStatus);
  const navigatingToPickup = activeRideStatus === 'accepted' || activeRideStatus === 'driver_arrived';
  const navigatingToDrop = activeRideStatus === 'in_progress';
  const showStageRoute = navigatingToPickup || navigatingToDrop;
  const shouldSyncDriverLocation =
    (shareLocationWhileOnline && isOnline && !availabilitySyncPending) || activeRideSharesLocation;
  const shouldPushAvailabilityLocation = shareLocationWhileOnline || activeRideSharesLocation;
  const displayIsOnline = availabilitySyncPending ? isOnline : serverIsOnline;
  const visibleBlockedPassengers = useMemo(
    () => filterBlockedPassengers(blockedPassengers, blockedPassengerSearch),
    [blockedPassengerSearch, blockedPassengers],
  );
  const upcomingRideCount = useMemo(() => {
    const counts = upcomingRides?.counts;
    if (counts && Number.isFinite(Number(counts.total))) {
      return Number(counts.total);
    }
    return (
      (Array.isArray(upcomingRides?.scheduled_requests) ? upcomingRides.scheduled_requests.length : 0) +
      (Array.isArray(upcomingRides?.assigned_rides) ? upcomingRides.assigned_rides.length : 0)
    );
  }, [upcomingRides]);
  useEffect(() => {
    updatePreference('language', driverSettings.language || DEFAULT_DRIVER_SETTINGS.language);
    updatePreference('notifications.bookingUpdates', driverSettings.push_notifications !== false);
    updatePreference('notifications.promotions', driverSettings.accept_promo !== false);
    updatePreference('notifications.sound', driverSettings.sound_enabled !== false);
    updatePreference('notifications.vibration', driverSettings.vibration_enabled !== false);
    updatePreference('privacy.shareLocation', driverSettings.share_location !== false);
  }, [
    driverSettings.accept_promo,
    driverSettings.language,
    driverSettings.push_notifications,
    driverSettings.share_location,
    driverSettings.sound_enabled,
    driverSettings.vibration_enabled,
    updatePreference,
  ]);
  const keralaSafety = useKeralaSafety({
    token,
    userName: user?.name,
    activeBooking: activeRide,
  });
  const {
    connected: realtimeConnected,
    trackingError,
    emitSocketLocationUpdate,
  } = useDriverRealtimeTracking({
    token,
    activeRideId,
    enabled: shouldSyncDriverLocation,
    manageLocationWatch: false,
    manageBackgroundTracking: activeRideSharesLocation,
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

  const refreshDriverMenuBadges = useCallback(async () => {
    const payload = await apiRequest('/drivers/menu-badges', { token }).catch(() => null);
    if (payload && typeof payload === 'object') {
      setMenuBadges(payload);
    }
    return payload;
  }, [token]);

  const handleDriverSettingsChange = useCallback((nextSettings = {}) => {
    setDriverSettings((currentSettings) =>
      normalizeDriverSettings({ ...currentSettings, ...(nextSettings || {}) }),
    );
  }, []);

  const handleSettingsNavigateToTab = useCallback((tab, options = {}) => {
    const nextTab = String(tab || '').trim();
    if (!nextTab) {
      return;
    }
    if (nextTab === 'support') {
      setSupportLaunchAction(options?.supportAction === 'contact' ? 'contact' : 'help');
    }
    setActiveTab(nextTab);
  }, []);

  const handleDriverNotificationPress = useCallback((notification) => {
    const data = notification?.data && typeof notification.data === 'object' ? notification.data : {};
    const type = String(notification?.type || data.type || '').toLowerCase();

    if (notification?.bookingId || data.booking_id || data.bookingId || type.includes('ride') || type.includes('booking')) {
      setActiveTab('requests');
      return;
    }
    if (type.includes('support') || data.ticket_id || data.ticketId) {
      setSupportLaunchAction('contact');
      setActiveTab('support');
      return;
    }
    if (
      type.includes('payout') ||
      type.includes('payment') ||
      type.includes('earning') ||
      type.includes('withdraw')
    ) {
      setActiveTab('earnings');
      return;
    }
    if (type.includes('kyc') || type.includes('document') || type.includes('trust')) {
      setActiveTab('trust');
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
    async ({ locationOverride = null, fallbackLocation = null, speedKmhOverride = null, silent = false } = {}) => {
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
            speed:
              Number.isFinite(Number(speedKmhOverride)) && Number(speedKmhOverride) >= 0
                ? Number(speedKmhOverride)
                : null,
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
      setAvailabilitySyncPendingState(false);
      availabilityLocalChangeAtRef.current = Date.now();
      availabilityUiOverrideUntilRef.current = Date.now() + 15000;
      setServerIsOnline(savedStatus);
      setIsOnline(savedStatus);
      setError('');
      if (savedStatus) {
        await pushDriverLocation({
          fallbackLocation: updated?.current_location || driverLocation,
          silent: true,
        });
      }
      setMessage(savedStatus ? 'You are online and discoverable.' : 'You are offline.');
    } catch (err) {
      if (isRetriableAvailabilityError(err)) {
        pendingAvailabilitySyncRef.current = {
          desired: !!pending.desired,
          attempts: Number(pending.attempts || 0) + 1,
          lastAttemptAt: Date.now(),
        };
        availabilityUiOverrideUntilRef.current = Date.now() + AVAILABILITY_RETRY_WINDOW_MS;
        availabilityLocalChangeAtRef.current = Date.now();
        setAvailabilitySyncPendingState(true);
        setIsOnline(!!pending.desired);
        setError(getAvailabilityErrorMessage(err));
        setMessage('Availability sync queued. Retrying automatically.');
      } else {
        pendingAvailabilitySyncRef.current = null;
        setAvailabilitySyncPendingState(false);
        setError(getAvailabilityErrorMessage(err));
        setMessage('');
      }
    } finally {
      availabilityRetryInFlightRef.current = false;
    }
  }, [driverLocation, pushDriverLocation, setAvailabilitySyncPendingState, token]);

  const notifyWithVoice = useCallback((title, body) => {
    Alert.alert(title, body);
    AccessibilityInfo.announceForAccessibility(`${title}. ${body}`);
  }, []);

  const refreshDriverData = useCallback(async () => {
    const refreshStartedAt = Date.now();
    const profile = await runAction(() => apiRequest('/drivers/profile', { token }));
    if (profile) {
      if (typeof profile.is_available === 'boolean') {
        // Avoid overriding an in-flight toggle with stale profile snapshots.
        if (canApplyServerAvailabilitySnapshot(refreshStartedAt)) {
          setServerIsOnline(profile.is_available);
          setIsOnline(profile.is_available);
        }
      }
      const resolvedLocation = normalizeLocation(profile.current_location);
      if (resolvedLocation) {
        setDriverLocation(resolvedLocation);
      }
    }

    const [requests, scheduledPayload, ride, earningsSummary, pricing, fareCalc, blockedPassengersPayload, spinStatus, settingsPayload, menuBadgePayload] = await Promise.all([
      apiRequest('/drivers/pending-requests', { token }).catch(() => []),
      apiRequest('/drivers/upcoming-rides', { token }).catch(() => null),
      apiRequest('/drivers/active-ride', { token }).catch(() => null),
      apiRequest('/drivers/earnings', { token }).catch(() => null),
      apiRequest('/pricing/rules', { token }).catch(() => null),
      apiRequest('/drivers/fare-calculator', { token }).catch(() => null),
      apiRequest('/drivers/blocked-passengers', { token }).catch(() => ({ passenger_ids: [], passengers: [] })),
      apiRequest('/spin-win/config', { token }).catch(() => null),
      apiRequest('/drivers/settings', { token }).catch(() => null),
      apiRequest('/drivers/menu-badges', { token }).catch(() => null),
    ]);
    await Promise.all([
      apiRequest('/subscriptions/config', { token }).catch(() => null),
      apiRequest('/subscriptions/me', { token }).catch(() => null),
    ]);

    setPendingRequests(requests || []);
    setUpcomingRides(scheduledPayload || null);
    const nextBlockedPassengers = normalizeBlockedPassengerRows(blockedPassengersPayload);
    setBlockedPassengers(nextBlockedPassengers);
    setBlockedPassengerIds(nextBlockedPassengers.map((item) => item.passenger_id));
    setActiveRide(ride || null);
    setEarnings(earningsSummary || null);
    setPricingRules(pricing || fareCalc?.default_pricing || null);
    setDriverFareStatus(String(fareCalc?.status || 'default'));
    setDriverFareRequestInfo(fareCalc?.request || null);
    hydrateDriverFareConfig(fareCalc?.request?.payload || fareCalc?.effective_pricing || fareCalc?.default_pricing || null);
    setSpinWinStatus(spinStatus || null);
    if (settingsPayload) {
      setDriverSettings(normalizeDriverSettings(settingsPayload));
    }
    if (menuBadgePayload) {
      setMenuBadges(menuBadgePayload);
    }
    setMessage('Driver dashboard refreshed.');
  }, [canApplyServerAvailabilitySnapshot, hydrateDriverFareConfig, normalizeLocation, runAction, token]);

  const refreshDriverDataSilently = useCallback(async ({ includeProfile = false, includeMeta = false } = {}) => {
    const refreshStartedAt = Date.now();
    if (refreshInFlightRef.current) {
      return;
    }
    refreshInFlightRef.current = true;
    try {
      const [profile, settingsPayload, requests, scheduledPayload, ride, blockedPassengersPayload, spinStatus, menuBadgePayload] = await Promise.all([
        includeProfile ? apiRequest('/drivers/profile', { token }).catch(() => null) : Promise.resolve(null),
        includeProfile ? apiRequest('/drivers/settings', { token }).catch(() => null) : Promise.resolve(null),
        apiRequest('/drivers/pending-requests', { token }).catch(() => []),
        apiRequest('/drivers/upcoming-rides', { token }).catch(() => null),
        apiRequest('/drivers/active-ride', { token }).catch(() => null),
        apiRequest('/drivers/blocked-passengers', { token }).catch(() => ({ passenger_ids: [], passengers: [] })),
        apiRequest('/spin-win/config', { token }).catch(() => null),
        apiRequest('/drivers/menu-badges', { token }).catch(() => null),
      ]);
      const [earningsSummary, pricing, fareCalc] = includeMeta
        ? await Promise.all([
          apiRequest('/drivers/earnings', { token }).catch(() => null),
          apiRequest('/pricing/rules', { token }).catch(() => null),
          apiRequest('/drivers/fare-calculator', { token }).catch(() => null),
        ])
        : [null, null, null];

      if (includeProfile && profile && typeof profile.is_available === 'boolean') {
        if (canApplyServerAvailabilitySnapshot(refreshStartedAt)) {
          setServerIsOnline(profile.is_available);
          setIsOnline(profile.is_available);
        }
      }
      if (includeProfile) {
        const resolvedLocation = normalizeLocation(profile?.current_location);
        if (resolvedLocation) {
          setDriverLocation(resolvedLocation);
        }
      }
      if (settingsPayload) {
        setDriverSettings(normalizeDriverSettings(settingsPayload));
      }
      setPendingRequests(Array.isArray(requests) ? requests : []);
      setUpcomingRides(scheduledPayload || null);
      const nextBlockedPassengers = normalizeBlockedPassengerRows(blockedPassengersPayload);
      setBlockedPassengers(nextBlockedPassengers);
      setBlockedPassengerIds(nextBlockedPassengers.map((item) => item.passenger_id));
      setActiveRide(ride || null);
      setSpinWinStatus(spinStatus || null);
      if (menuBadgePayload) {
        setMenuBadges(menuBadgePayload);
      }
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
  }, [canApplyServerAvailabilitySnapshot, hydrateDriverFareConfig, normalizeLocation, token]);

  const refreshRideStageValidation = useCallback(async () => {
    const [ride, requests, scheduledPayload] = await Promise.all([
      apiRequest('/drivers/active-ride', { token }).catch(() => null),
      apiRequest('/drivers/pending-requests', { token }).catch(() => []),
      apiRequest('/drivers/upcoming-rides', { token }).catch(() => null),
    ]);
    setActiveRide(ride || null);
    setPendingRequests(Array.isArray(requests) ? requests : []);
    setUpcomingRides(scheduledPayload || null);
  }, [token]);

  const refreshDriverRideQueueFromRealtime = useCallback(async () => {
    if (realtimeRideQueueRefreshInFlightRef.current) {
      realtimeRideQueueRefreshQueuedRef.current = true;
      return;
    }

    realtimeRideQueueRefreshInFlightRef.current = true;
    try {
      do {
        realtimeRideQueueRefreshQueuedRef.current = false;
        await refreshRideStageValidation();
      } while (realtimeRideQueueRefreshQueuedRef.current);
    } catch (err) {
      console.warn('Driver realtime ride request refresh failed:', err);
    } finally {
      realtimeRideQueueRefreshInFlightRef.current = false;
    }
  }, [refreshRideStageValidation]);

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

  const requestDriverEarningsReport = async () => {
    const report = await runAction(
      () =>
        apiRequest('/drivers/earnings/report', {
          method: 'POST',
          token,
          body: { format: 'json' },
        }),
      'Driver earnings report generated.',
    );
    if (report?.report) {
      const total = Number(report.report.total_earnings || 0).toFixed(2);
      const rides = Number(report.report.total_rides || 0);
      setMessage(`Report ready: INR ${total} across ${rides} completed rides.`);
    }
  };

  const requestDriverWithdrawal = async (amount, method = 'bank_transfer') => {
    const normalizedAmount = Number(amount || 0);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
      setError('Enter a valid withdrawal amount.');
      return;
    }
    const result = await runAction(
      () =>
        apiRequest('/drivers/withdraw', {
          method: 'POST',
          token,
          body: { amount: normalizedAmount, method },
        }),
      'Withdrawal request submitted for admin processing.',
    );
    if (result) {
      await refreshDriverDataSilently({ includeMeta: true });
    }
  };

  const handleQuickActionPress = (action) => {
    if (!action || typeof action !== 'object') {
      return;
    }
    if (action.type === 'go_online') {
      if (displayIsOnline) {
        setActiveTab('requests');
        setMessage('You are already online and ready for ride requests.');
        return;
      }
      toggleDriverAvailability(true).catch(() => null);
      return;
    }
    if (action.type === 'resume_active_ride') {
      if (!activeRideId) {
        setError('No active ride to resume.');
        return;
      }
      setActiveTab('requests');
      setExpandedRideCard(true);
      setMessage('Active ride controls opened.');
      return;
    }
    if (action.type === 'navigate_active_ride') {
      if (!activeRideId) {
        setError('No active ride to navigate.');
        return;
      }
      openActiveRideNavigation().catch(() => null);
      return;
    }
    if (action.type === 'call_passenger') {
      if (!activeRideId) {
        setError('No active ride passenger to call.');
        return;
      }
      openActiveRideCall().catch(() => null);
      return;
    }
    if (action.type === 'sos') {
      setActiveTab('safety');
      keralaSafety.activateSos('Driver quick action SOS', 'driver_quick_action').catch(() => null);
      return;
    }
    if (action.type === 'support_contact') {
      setSupportLaunchAction('contact');
      setActiveTab('support');
      setMessage('Support ticket form opened.');
      return;
    }
    if (action.type === 'withdraw_earnings') {
      setEarningsLaunchAction('withdraw');
      setActiveTab('earnings');
      setMessage('Withdrawal form opened. Enter the amount to submit a request.');
      refreshDriverDataSilently({ includeMeta: true }).catch(() => null);
      return;
    }
    if (action.type === 'earnings_report') {
      requestDriverEarningsReport().catch(() => null);
      return;
    }
    if (action.type === 'tab' && action.tab) {
      if (action.tab === 'earnings') {
        setEarningsLaunchAction('summary');
      }
      if (action.tab === 'support') {
        setSupportLaunchAction('help');
      }
      setActiveTab(action.tab);
    }
  };

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    const socket = createAutoBuddySocket(token);
    rideRequestSocketRef.current = socket;

    const refreshFromRealtime = () => {
      void refreshDriverRideQueueFromRealtime();
    };
    const handleSocketError = (err) => {
      console.warn('Driver ride request socket error:', err?.message || err);
    };

    socket.on('connect', refreshFromRealtime);
    socket.on('new_booking_available', refreshFromRealtime);
    socket.on('booking_status_changed', refreshFromRealtime);
    socket.on('connect_error', handleSocketError);

    if (socket.connected) {
      refreshFromRealtime();
    }

    return () => {
      socket.off('connect', refreshFromRealtime);
      socket.off('new_booking_available', refreshFromRealtime);
      socket.off('booking_status_changed', refreshFromRealtime);
      socket.off('connect_error', handleSocketError);
      socket.disconnect();
      if (rideRequestSocketRef.current === socket) {
        rideRequestSocketRef.current = null;
      }
    };
  }, [refreshDriverRideQueueFromRealtime, token]);

  useEffect(() => {
    if (!shouldSyncDriverLocation) {
      return;
    }
    if (initialLocationSyncAttemptedRef.current) {
      return;
    }
    initialLocationSyncAttemptedRef.current = true;
    pushDriverLocation({ fallbackLocation: driverLocation, silent: true }).catch(() => null);
  }, [driverLocation, pushDriverLocation, shouldSyncDriverLocation]);

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
            timeInterval: driverTrackingIntervalMs,
            distanceInterval: driverTrackingIntervalMs <= DRIVER_MOVING_TRACK_INTERVAL_MS ? 5 : 15,
          },
          (position) => {
            const speedMps = Number(position?.coords?.speed ?? 0);
            const speedKmh = Number.isFinite(speedMps) && speedMps > 0 ? speedMps * 3.6 : 0;
            const nextInterval =
              speedKmh < DRIVER_IDLE_SPEED_THRESHOLD_KMH
                ? DRIVER_IDLE_TRACK_INTERVAL_MS
                : DRIVER_MOVING_TRACK_INTERVAL_MS;
            setDriverTrackingIntervalMs((prev) => (prev === nextInterval ? prev : nextInterval));

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
  }, [driverTrackingIntervalMs, normalizeLocation, pushDriverLocation, shouldSyncDriverLocation]);

  const toggleDriverAvailability = useCallback(async (wantOnline) => {
    if (availabilityToggleInFlightRef.current) {
      return;
    }

    if (!token) {
      setError('Missing authentication token');
      return;
    }

    const next = !!wantOnline;
    const previousLocalStatus = isOnline;
    const previousServerStatus = serverIsOnline;
    const requestId = availabilityToggleRequestIdRef.current + 1;
    const toggledAt = Date.now();
    availabilityToggleRequestIdRef.current = requestId;
    availabilityToggleInFlightRef.current = requestId;
    availabilityLocalChangeAtRef.current = toggledAt;
    availabilityUiOverrideUntilRef.current = toggledAt + 15000;
    pendingAvailabilitySyncRef.current = null;

    setIsOnline(next);
    setAvailabilitySyncPendingState(true);
    setError('');
    setMessage(next ? 'Going online...' : 'Going offline...');

    try {
      const response = await apiRequest('/drivers/availability', {
        method: 'PUT',
        token,
        body: { is_available: next },
      });

      if (requestId !== availabilityToggleRequestIdRef.current) {
        return;
      }

      const savedStatus =
        typeof response?.is_available === 'boolean' ? response.is_available : next;

      const savedAt = Date.now();
      availabilityLocalChangeAtRef.current = savedAt;
      availabilityUiOverrideUntilRef.current = savedAt + 15000;
      setIsOnline(savedStatus);
      setServerIsOnline(savedStatus);
      setMessage(savedStatus ? 'You are now online.' : 'You are now offline.');
      setError('');

      if (savedStatus && shouldPushAvailabilityLocation) {
        await pushDriverLocation({ silent: true });
      }
    } catch (err) {
      if (requestId !== availabilityToggleRequestIdRef.current) {
        return;
      }

      const rollbackAt = Date.now();
      availabilityLocalChangeAtRef.current = rollbackAt;
      availabilityUiOverrideUntilRef.current = rollbackAt + 15000;
      setIsOnline(previousLocalStatus);
      setServerIsOnline(previousServerStatus);
      setError(getAvailabilityErrorMessage(err));
      setMessage('Failed to update status. Please try again.');
    } finally {
      if (availabilityToggleInFlightRef.current === requestId) {
        availabilityToggleInFlightRef.current = null;
        pendingAvailabilitySyncRef.current = null;
        setAvailabilitySyncPendingState(false);
      }
    }
  }, [
    isOnline,
    pushDriverLocation,
    serverIsOnline,
    setAvailabilitySyncPendingState,
    shouldPushAvailabilityLocation,
    token,
  ]);

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

  const rejectRequest = async (bookingId) => {
    const rejected = await runAction(
      () =>
        apiRequest(`/bookings/${bookingId}/reject`, {
          method: 'PUT',
          token,
        }),
      'Ride request declined.',
    );
    if (rejected) {
      setPendingRequests((prev) => (Array.isArray(prev) ? prev.filter((item) => item?.id !== bookingId) : prev));
      await refreshDriverDataSilently();
    }
  };

  const toggleBlockedPassenger = async (passengerId, isBlocked, context = {}) => {
    const body = { is_blocked: !isBlocked };
    if (!isBlocked) {
      if (context.reason) {
        body.reason = context.reason;
      }
      if (context.bookingId) {
        body.booking_id = context.bookingId;
      }
    }

    const done = await runAction(
      () =>
        apiRequest(`/drivers/blocked-passengers/${passengerId}`, {
          method: 'PUT',
          token,
          body,
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

  const performCancelActiveRide = async () => {
    if (!activeRideId) {
      return;
    }
    const cancelled = await runAction(
      () =>
        apiRequest(`/bookings/${activeRideId}/cancel`, {
          method: 'PUT',
          token,
        }),
      'Ride cancelled. You are available for new requests.',
    );
    if (cancelled) {
      setRideStartOtp('');
      setRideEndOtp('');
      setActiveRide(null);
      setIsOnline(true);
      setServerIsOnline(true);
      await refreshDriverDataSilently({ includeProfile: true, includeMeta: true });
    }
  };

  const cancelActiveRide = () => {
    if (!activeRideId) {
      return;
    }
    Alert.alert(
      'Cancel Ride?',
      'This will cancel the active ride and notify the passenger.',
      [
        { text: 'Keep Ride', style: 'cancel' },
        {
          text: 'Cancel Ride',
          style: 'destructive',
          onPress: () => {
            performCancelActiveRide().catch(() => null);
          },
        },
      ],
    );
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
  const canCancelActiveRide = Boolean(activeRideId) && !['completed', 'cancelled'].includes(activeRideStatus);

  const focusRideCommunication = useCallback(() => {
    if (!activeRideId) {
      return;
    }
    setActiveTab('requests');
    setExpandedRideCard(true);
    setMessage('Use the In-App Call & Chat panel below to message the passenger.');
  }, [activeRideId]);

  const openActiveRideCall = useCallback(async () => {
    if (!activeRideId) {
      return;
    }
    const payload = await runAction(() => apiRequest(`/bookings/${activeRideId}/call-room`, { token }));
    const roomUrl = String(payload?.room_url || '').trim();
    if (!roomUrl) {
      setError('Call room URL unavailable.');
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(roomUrl);
    } catch {
      await Linking.openURL(roomUrl);
    }
  }, [activeRideId, runAction, token]);

  const focusActiveRideRoute = useCallback(() => {
    if (!activeRide) {
      return;
    }
    const pickup = normalizeLocation(activeRide.pickup_location || activeRide.pickup || activeRide.pickup_location_details);
    const drop = normalizeLocation(activeRide.dropoff_location || activeRide.dropoff || activeRide.dropoff_location_details);
    const destination = navigatingToDrop ? (drop || pickup) : (pickup || drop);
    if (!destination) {
      setError('Ride location unavailable.');
      return;
    }

    const routeCoords = [driverLocation, destination]
      .filter(Boolean)
      .map((location) => ({
        latitude: location.latitude,
        longitude: location.longitude,
      }));

    try {
      if (mapRef.current?.fitToCoordinates && routeCoords.length >= 2) {
        mapRef.current.fitToCoordinates(routeCoords, {
          edgePadding: { top: 80, right: 60, bottom: 320, left: 60 },
          animated: true,
        });
      } else {
        mapRef.current?.animateToRegion(
          {
            latitude: destination.latitude,
            longitude: destination.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          },
          500,
        );
      }
      setMessage(navigatingToDrop ? 'Map focused on drop-off route.' : 'Map focused on pickup route.');
    } catch {
      setError('Could not focus ride route on map.');
    }
  }, [activeRide, driverLocation, navigatingToDrop, normalizeLocation]);

  const openActiveRideNavigation = useCallback(async () => {
    if (!activeRide) {
      return;
    }
    const pickup = normalizeLocation(activeRide.pickup_location || activeRide.pickup || activeRide.pickup_location_details);
    const drop = normalizeLocation(
      activeRide.drop_location ||
        activeRide.dropoff_location ||
        activeRide.dropoff ||
        activeRide.drop_location_details,
    );
    const destination = navigatingToDrop ? (drop || pickup) : (pickup || drop);
    if (!destination) {
      setError('Ride location unavailable.');
      return;
    }

    const origin = driverLocation
      ? `&origin=${driverLocation.latitude},${driverLocation.longitude}`
      : '';
    const mapsUrl =
      `https://www.google.com/maps/dir/?api=1${origin}&destination=${destination.latitude},${destination.longitude}&travelmode=driving`;
    try {
      await Linking.openURL(mapsUrl);
    } catch {
      setError('Could not open navigation.');
    }
  }, [activeRide, driverLocation, navigatingToDrop, normalizeLocation]);

  const resumeScheduledRide = useCallback((ride) => {
    if (!ride?.id) {
      return;
    }
    setActiveRide((prev) => (prev?.id === ride.id ? { ...prev, ...ride } : ride));
    setActiveTab('requests');
    setExpandedRideCard(true);
    setMessage('Scheduled ride controls opened.');
  }, []);

  const openScheduledRideNavigation = useCallback(async (ride) => {
    const pickup = normalizeLocation(ride?.pickup_location || ride?.pickup || ride?.pickup_location_details);
    const drop = normalizeLocation(
      ride?.drop_location ||
        ride?.dropoff_location ||
        ride?.dropoff ||
        ride?.drop_location_details,
    );
    const destination = String(ride?.status || '').toLowerCase() === 'in_progress' ? (drop || pickup) : (pickup || drop);
    if (!destination) {
      setError('Scheduled ride location unavailable.');
      return;
    }
    const origin = driverLocation
      ? `&origin=${driverLocation.latitude},${driverLocation.longitude}`
      : '';
    const mapsUrl =
      `https://www.google.com/maps/dir/?api=1${origin}&destination=${destination.latitude},${destination.longitude}&travelmode=driving`;
    try {
      await Linking.openURL(mapsUrl);
    } catch {
      setError('Could not open scheduled ride navigation.');
    }
  }, [driverLocation, normalizeLocation]);

  const callScheduledPassenger = useCallback(async (ride) => {
    const rideId = String(ride?.id || '').trim();
    if (!rideId) {
      return;
    }
    const payload = await runAction(() => apiRequest(`/bookings/${rideId}/call-room`, { token }));
    const roomUrl = String(payload?.room_url || '').trim();
    if (!roomUrl) {
      setError('Call room URL unavailable.');
      return;
    }
    try {
      await WebBrowser.openBrowserAsync(roomUrl);
    } catch {
      await Linking.openURL(roomUrl);
    }
  }, [runAction, token]);

  const cancelScheduledRide = useCallback((ride) => {
    const rideId = String(ride?.id || '').trim();
    if (!rideId) {
      return;
    }
    Alert.alert(
      'Cancel Scheduled Ride?',
      'This will cancel the assigned scheduled ride and notify the passenger.',
      [
        { text: 'Keep Ride', style: 'cancel' },
        {
          text: 'Cancel Ride',
          style: 'destructive',
          onPress: async () => {
            const cancelled = await runAction(
              () =>
                apiRequest(`/bookings/${rideId}/cancel`, {
                  method: 'PUT',
                  token,
                }),
              'Scheduled ride cancelled.',
            );
            if (cancelled) {
              if (activeRideId === rideId) {
                setActiveRide(null);
              }
              await refreshDriverDataSilently({ includeProfile: true, includeMeta: true });
            }
          },
        },
      ],
    );
  }, [activeRideId, refreshDriverDataSilently, runAction, token]);

  const openScheduledRideSupport = useCallback((ride) => {
    setSupportLaunchAction('contact');
    setActiveTab('support');
    setMessage(`Support opened for scheduled ride ${String(ride?.id || '').slice(0, 12) || 'ride'}.`);
  }, []);

  const handleStickyNextAction = () => {
    if (activeRideStatus === 'driver_arrived' && !String(rideStartOtp || '').trim()) {
      setActiveTab('requests');
      setExpandedRideCard(true);
      setError('Enter passenger OTP to start trip.');
      return;
    }
    moveRideToNextStatus().catch(() => null);
  };

  const renderStickyActiveRideBar = () => {
    if (!activeRide) {
      return null;
    }

    const pickup = normalizeLocation(activeRide.pickup_location || activeRide.pickup || activeRide.pickup_location_details);
    const drop = normalizeLocation(
      activeRide.drop_location ||
        activeRide.dropoff_location ||
        activeRide.dropoff ||
        activeRide.drop_location_details,
    );
    const statusLabel = String(activeRide.status || 'active').replace(/_/g, ' ');
    const rideSuffix = String(activeRide.id || '').slice(-6) || 'N/A';
    const fareValue = activeRide.final_fare ?? activeRide.estimated_fare ?? activeRide.fare;
    const fareText = fareValue !== undefined && fareValue !== null && fareValue !== '' ? `INR ${fareValue}` : 'Fare pending';
    const routeText = [pickup?.address, drop?.address].filter(Boolean).join(' -> ') || 'Route available in ride details';

    return (
      <View style={styles.stickyRideBar}>
        <View style={styles.stickyRideHeader}>
          <View style={styles.stickyRideTitleBlock}>
            <Text style={styles.stickyRideEyebrow}>Active ride #{rideSuffix}</Text>
            <Text style={styles.stickyRideTitle} numberOfLines={1}>
              {activeRide.passenger_name || 'Passenger'} - {fareText}
            </Text>
            <Text style={styles.stickyRideMeta} numberOfLines={1}>{routeText}</Text>
          </View>
          <View style={styles.stickyRideStatusPill}>
            <Text style={styles.stickyRideStatusText}>{statusLabel}</Text>
          </View>
        </View>
        <View style={styles.stickyRideActions}>
          <TouchableOpacity
            style={[styles.stickyRideButton, loading && styles.stickyRideButtonDisabled]}
            onPress={() => setActiveTab('requests')}
            disabled={loading}>
            <Text style={styles.stickyRideButtonText}>Open Ride</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.stickyRideButton, loading && styles.stickyRideButtonDisabled]}
            onPress={focusRideCommunication}
            disabled={loading}>
            <Text style={styles.stickyRideButtonText}>Message</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.stickyRideButton, loading && styles.stickyRideButtonDisabled]}
            onPress={openActiveRideCall}
            disabled={loading}>
            <Text style={styles.stickyRideButtonText}>Call</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.stickyRideButton, loading && styles.stickyRideButtonDisabled]}
            onPress={focusActiveRideRoute}
            disabled={loading}>
            <Text style={styles.stickyRideButtonText}>Map</Text>
          </TouchableOpacity>
          {!!nextActionLabel && (
            <TouchableOpacity
              style={[styles.stickyRideButton, styles.stickyRideButtonPrimary, loading && styles.stickyRideButtonDisabled]}
              onPress={handleStickyNextAction}
              disabled={loading}>
              <Text style={styles.stickyRideButtonPrimaryText}>{nextActionLabel}</Text>
            </TouchableOpacity>
          )}
          {canCancelActiveRide && (
            <TouchableOpacity
              style={[styles.stickyRideButton, styles.stickyRideButtonDanger, loading && styles.stickyRideButtonDisabled]}
              onPress={cancelActiveRide}
              disabled={loading}>
              <Text style={styles.stickyRideButtonDangerText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

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
        <TouchableOpacity
          style={[styles.statusBadgeButton, { backgroundColor: displayIsOnline ? '#E8F5E9' : '#F5F5F5', borderColor: displayIsOnline ? COLORS.primary : '#BDBDBD' }]}
          onPress={() => toggleDriverAvailability(!displayIsOnline)}
          disabled={availabilitySyncPending}
        >
          <View style={[styles.statusDot, { backgroundColor: availabilitySyncPending ? '#FFA500' : displayIsOnline ? COLORS.primary : COLORS.textMuted }]} />
          <View style={styles.statusContent}>
            <Text style={[styles.statusText, { color: displayIsOnline ? COLORS.primary : '#666' }]}>
              {availabilitySyncPending ? (displayIsOnline ? 'GOING ONLINE...' : 'GOING OFFLINE...') : (displayIsOnline ? 'ONLINE & READY' : 'OFFLINE')}
            </Text>
            <Text style={styles.statusSub}>{user?.name || 'Driver'} - Tap to toggle</Text>
          </View>
          {availabilitySyncPending && <ActivityIndicator size="small" color="#FFA500" />}
        </TouchableOpacity>
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
        </View>
      </View>

      <BottomSheet index={0} snapPoints={snapPoints} backgroundStyle={styles.sheetBackground}>
        {renderStickyActiveRideBar()}
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

          {/* Tab Navigation */}
          <View style={styles.tabsContainer}>
            <DriverTabBar
              activeTab={activeTab}
              onTabChange={setActiveTab}
              requestCount={pendingRequests.length}
              upcomingCount={upcomingRideCount}
              notificationCount={unreadCount}
              menuBadges={menuBadges}
              isOnline={displayIsOnline}
              compact={false}
            />
          </View>

          {/* Ride Card - Always Visible */}
          {activeTab === 'requests' && activeRide && (
            <View style={styles.rideCardContainer}>
              <RideCard
                ride={activeRide}
                driverLocation={driverLocation}
                onAccept={() => activeRide?.id && acceptRequest(activeRide.id)}
                onDecline={() => activeRide?.id && rejectRequest(activeRide.id)}
                onComplete={moveRideToNextStatus}
                onMessage={focusRideCommunication}
                onCall={openActiveRideCall}
                onMapPress={focusActiveRideRoute}
                loading={loading}
                expanded={expandedRideCard}
                onToggleExpand={setExpandedRideCard}
              />
            </View>
          )}

          {/* Tab Content - Dynamic Based on Active Tab */}
          {activeTab === 'requests' && (
            <>
              {activeRide ? (
                <>
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
                        <View style={styles.otpCard}>
                          <Text style={styles.otpCardLabel}>PASSENGER OTP REQUIRED</Text>
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
                          <Text style={styles.otpCardLabel}>COMPLETION OTP (Optional)</Text>
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
                    {canCancelActiveRide && (
                      <TouchableOpacity style={styles.cancelRideButton} onPress={cancelActiveRide} disabled={loading}>
                        <Text style={styles.cancelRideButtonText}>Cancel Ride</Text>
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
              ) : null}

              {!activeRide && (
                displayIsOnline ? (
                  pendingRequests.length === 0 ? (
                    <View style={styles.offlineState}>
                      <Text style={styles.offlineText}>No pending requests right now.</Text>
                    </View>
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
                                <Text style={styles.fareBadgeText}>Rs. {req.estimated_fare}</Text>
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
                              <Text style={styles.acceptTextNew}>Accept</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.declineButtonNew}
                              onPress={() => rejectRequest(req.id)}
                              disabled={loading}>
                              <Text style={styles.declineButtonTextNew}>Decline</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.blockButtonNew, isBlocked && styles.blockButtonActive]}
                              onPress={() =>
                                toggleBlockedPassenger(req.passenger_id, isBlocked, {
                                  bookingId: req.id,
                                  reason: 'Blocked from pending ride request',
                                })
                              }
                              disabled={loading}>
                              <Text style={[styles.blockButtonTextNew, isBlocked && styles.blockButtonTextActive]}>
                                {isBlocked ? 'Blocked' : 'Block'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })
                  )
                ) : (
                  <View style={styles.offlineState}>
                    <Text style={styles.offlineText}>Go online to receive ride requests.</Text>
                  </View>
                )
              )}
            </>
          )}

          {activeTab === 'upcoming' && (
            <ScheduledRidesPanel
              upcomingRides={upcomingRides}
              loading={loading}
              onAcceptRequest={acceptRequest}
              onRejectRequest={rejectRequest}
              onResumeRide={resumeScheduledRide}
              onNavigateRide={openScheduledRideNavigation}
              onCallPassenger={callScheduledPassenger}
              onCancelRide={cancelScheduledRide}
              onOpenSupport={openScheduledRideSupport}
              onRefresh={refreshRideStageValidation}
            />
          )}

          {/* Earnings Tab */}
          {activeTab === 'earnings' && (
            <>
              <RevenueCard token={token} role={user?.role} />
              <View style={styles.earningsPanel}>
                <EarningsPanel
                  earnings={earnings}
                  pricingRules={pricingRules}
                  driverFareConfig={driverFareConfig}
                  loading={loading}
                  initialAction={earningsLaunchAction}
                  onRequestReport={requestDriverEarningsReport}
                  onRequestWithdraw={requestDriverWithdrawal}
                  onManageBankDetails={() => setActiveTab('profile')}
                />
              </View>
            </>
          )}

          {activeTab === 'spin' && (
            <View style={styles.earningsCard}>
              <Text style={styles.fareTitle}>Spin & Win</Text>
              <Text style={styles.requestDetails}>
                Status: {spinWinStatus?.enabled ? 'Enabled' : 'Disabled'} | Spins left today: {Number(spinWinStatus?.spins_left_today || 0)}
              </Text>
              {!!spinWinStatus?.eligibility_reason && (
                <Text style={styles.requestDetails}>{spinWinStatus.eligibility_reason}</Text>
              )}
              {!!spinWinStatus?.latest_reward?.label && (
                <Text style={styles.requestDetails}>Latest reward: {spinWinStatus.latest_reward.label}</Text>
              )}
              <TouchableOpacity
                style={styles.actionButton}
                onPress={spinNow}
                disabled={loading || spinWinLoading || spinningNow || !spinWinStatus?.eligible || Number(spinWinStatus?.spins_left_today || 0) <= 0}>
                <Text style={styles.actionButtonText}>{spinningNow ? 'Spinning...' : 'Spin Now'}</Text>
              </TouchableOpacity>
            </View>
          )}

          {activeTab === 'fare' && (
            <View style={styles.earningsCard}>
              <Text style={styles.fareTitle}>Fare Tools</Text>
              <Text style={styles.requestDetails}>Status: {driverFareStatus}</Text>
              {!!driverFareRequestInfo?.reject_reason && (
                <Text style={styles.error}>Rejected: {driverFareRequestInfo.reject_reason}</Text>
              )}
              <Text style={styles.fieldLabel}>Base Fare</Text>
              <VoiceTextInput style={styles.input} value={driverFareConfig.base_fare} onChangeText={(value) => updateDriverFareField('base_fare', value)} keyboardType="decimal-pad" />
              <Text style={styles.fieldLabel}>Per KM Rate</Text>
              <VoiceTextInput style={styles.input} value={driverFareConfig.per_km_rate} onChangeText={(value) => updateDriverFareField('per_km_rate', value)} keyboardType="decimal-pad" />
              <Text style={styles.fieldLabel}>Minimum Fare</Text>
              <VoiceTextInput style={styles.input} value={driverFareConfig.minimum_fare} onChangeText={(value) => updateDriverFareField('minimum_fare', value)} keyboardType="decimal-pad" />
              <Text style={styles.fieldLabel}>Surge Multiplier</Text>
              <VoiceTextInput style={styles.input} value={driverFareConfig.surge_multiplier} onChangeText={(value) => updateDriverFareField('surge_multiplier', value)} keyboardType="decimal-pad" />
              <Text style={styles.fieldLabel}>Night Multiplier</Text>
              <VoiceTextInput style={styles.input} value={driverFareConfig.night_multiplier} onChangeText={(value) => updateDriverFareField('night_multiplier', value)} keyboardType="decimal-pad" />
              <Text style={styles.fieldLabel}>Base Search Radius KM</Text>
              <VoiceTextInput style={styles.input} value={driverFareConfig.driver_base_search_radius_km} onChangeText={(value) => updateDriverFareField('driver_base_search_radius_km', value)} keyboardType="decimal-pad" />
              <Text style={styles.fieldLabel}>Long Distance Radius KM</Text>
              <VoiceTextInput style={styles.input} value={driverFareConfig.driver_long_distance_search_radius_km} onChangeText={(value) => updateDriverFareField('driver_long_distance_search_radius_km', value)} keyboardType="decimal-pad" />
              <Text style={styles.fieldLabel}>Pickup Surcharge Per KM</Text>
              <VoiceTextInput style={styles.input} value={driverFareConfig.driver_pickup_surcharge_per_km} onChangeText={(value) => updateDriverFareField('driver_pickup_surcharge_per_km', value)} keyboardType="decimal-pad" />
              <Text style={styles.fieldLabel}>Peak Hours</Text>
              <VoiceTextInput style={styles.input} value={driverFareConfig.peak_hours} onChangeText={(value) => updateDriverFareField('peak_hours', value)} placeholder="8,9,17,18,19" placeholderTextColor={COLORS.textMuted} />
              <View style={styles.requestButtonsRow}>
                <TouchableOpacity style={styles.acceptButtonNew} onPress={submitDriverFareCalculator} disabled={loading}>
                  <Text style={styles.acceptTextNew}>Submit For Approval</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.blockButtonNew} onPress={requestResetToAdminDefault} disabled={loading}>
                  <Text style={styles.blockButtonTextNew}>Reset To Admin Default</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {activeTab === 'blocked' && (
            <View style={styles.earningsCard}>
              <Text style={styles.fareTitle}>Blocked Passengers</Text>
              <VoiceTextInput
                style={[styles.input, styles.blockedSearchInput]}
                value={blockedPassengerSearch}
                onChangeText={setBlockedPassengerSearch}
                placeholder="Search name, phone, reason, or ride"
                placeholderTextColor={COLORS.textMuted}
              />
              {blockedPassengers.length === 0 ? (
                <Text style={styles.requestDetails}>No blocked passengers.</Text>
              ) : visibleBlockedPassengers.length === 0 ? (
                <Text style={styles.requestDetails}>No blocked passengers match your search.</Text>
              ) : (
                visibleBlockedPassengers.map((blockedPassenger) => {
                  const fareValue = Number(blockedPassenger.estimated_fare);
                  return (
                    <View key={blockedPassenger.passenger_id} style={styles.blockedPassengerCard}>
                      <View style={styles.blockedPassengerHeader}>
                        <View style={styles.blockedPassengerTitleBlock}>
                          <Text style={styles.blockedPassengerName}>{blockedPassenger.passenger_name}</Text>
                          <Text style={styles.blockedPassengerMeta}>
                            ID: {blockedPassenger.passenger_id}
                          </Text>
                          {!!blockedPassenger.passenger_phone && (
                            <Text style={styles.blockedPassengerMeta}>
                              Phone: {blockedPassenger.passenger_phone}
                            </Text>
                          )}
                        </View>
                        <TouchableOpacity
                          style={styles.blockButtonNew}
                          onPress={() => toggleBlockedPassenger(blockedPassenger.passenger_id, true)}
                          disabled={loading}>
                          <Text style={styles.blockButtonTextNew}>Unblock</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.blockedReasonBox}>
                        <Text style={styles.blockedSectionLabel}>Why blocked</Text>
                        <Text style={styles.blockedReasonText}>{blockedPassenger.reason}</Text>
                      </View>

                      <Text style={styles.blockedContextText}>
                        Blocked: {formatBlockedPassengerDate(blockedPassenger.blocked_at)}
                      </Text>
                      <Text style={styles.blockedContextText}>
                        Ride: {getBlockedPassengerRideSummary(blockedPassenger)}
                      </Text>
                      {!!blockedPassenger.last_booking_status && (
                        <Text style={styles.blockedContextText}>
                          Status: {blockedPassenger.last_booking_status}
                        </Text>
                      )}
                      {Number.isFinite(fareValue) && (
                        <Text style={styles.blockedContextText}>
                          Fare: Rs. {fareValue.toFixed(2)}
                        </Text>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          )}
          {activeTab === 'safety' && (
            <KeralaSafetyCard safety={keralaSafety} />
          )}

          {activeTab === 'trust' && (
            <>
              <DriverKycPanel token={token} onDataChanged={refreshDriverMenuBadges} />
              <DriverTrustCard token={token} />
            </>
          )}

          {activeTab === 'history' && (
            <RideHistoryPanel
              token={token}
              viewerRole="driver"
              onSupportRequested={(booking) => {
                setSupportLaunchAction('contact');
                setActiveTab('support');
                setMessage(`Support opened for booking ${String(booking?.id || '').slice(0, 12) || 'ride'}.`);
              }}
            />
          )}

          {activeTab === 'notifications' && (
            <NotificationCenter
              token={token}
              onClose={() => setActiveTab('requests')}
              onNotificationPress={handleDriverNotificationPress}
            />
          )}

          {/* Actions Tab */}
          {activeTab === 'actions' && (
            <>
              <View style={styles.earningsCard}>
                <Text style={styles.fareTitle}>Quick Actions</Text>
                {DRIVER_QUICK_ACTIONS.map((action) => (
                  <TouchableOpacity key={action.key} style={styles.actionButton} onPress={() => handleQuickActionPress(action)}>
                    <Text style={styles.actionButtonText}>{action.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Settings Tab */}
          {activeTab === 'settings' && (
            <EnhancedSettingsPanel
              token={token}
              loading={loading}
              displayIsOnline={displayIsOnline}
              onToggleOnline={() => toggleDriverAvailability(!displayIsOnline)}
              onNavigateToTab={handleSettingsNavigateToTab}
              onSettingsChange={handleDriverSettingsChange}
            />
          )}

          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <ProfileManagementPanel token={token} loading={loading} />
          )}

          {/* Documents Tab */}
          {activeTab === 'documents' && (
            <DocumentUploadPanel token={token} loading={loading} onDataChanged={refreshDriverMenuBadges} />
          )}

          {/* Vehicle Tab */}
          {activeTab === 'vehicle' && (
            <VehicleManagementPanel token={token} loading={loading} />
          )}

          {/* Support Tab */}
          {activeTab === 'support' && (
            <SupportTicketPanel
              key={supportLaunchAction}
              token={token}
              loading={loading}
              initialAction={supportLaunchAction}
              onDataChanged={refreshDriverMenuBadges}
            />
          )}

          {/* Analytics Tab */}
          {activeTab === 'analytics' && (
            <AnalyticsDashboard token={token} loading={loading} />
          )}
        </ScrollView>
      </BottomSheet>
    </View>
  );
}

export default function DriverDashboard(props) {
  return <DriverDashboardContent {...props} />;
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
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: COLORS.textMain,
    backgroundColor: COLORS.surface,
    marginBottom: 8,
  },
  error: { color: COLORS.danger, marginBottom: 8 },
  message: { color: COLORS.secondary, marginBottom: 8 },
  loader: { marginVertical: 6 },
  stickyRideBar: {
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    zIndex: 20,
    ...SHADOWS.soft,
  },
  stickyRideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stickyRideTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  stickyRideEyebrow: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  stickyRideTitle: {
    color: COLORS.textMain,
    fontSize: 14,
    fontWeight: '900',
  },
  stickyRideMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  stickyRideStatusPill: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  stickyRideStatusText: {
    color: COLORS.primaryDark,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  stickyRideActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stickyRideButton: {
    minHeight: 36,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyRideButtonPrimary: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  stickyRideButtonDanger: {
    backgroundColor: '#FFF5F5',
    borderColor: COLORS.danger,
  },
  stickyRideButtonDisabled: {
    opacity: 0.6,
  },
  stickyRideButtonText: {
    color: COLORS.textMain,
    fontSize: 12,
    fontWeight: '800',
  },
  stickyRideButtonPrimaryText: {
    color: COLORS.white,
    fontSize: 12,
    fontWeight: '900',
  },
  stickyRideButtonDangerText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '900',
  },
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
  requestCardNew: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    marginBottom: 12,
    borderLeftWidth: 5,
    borderLeftColor: COLORS.primary,
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
  passengerNameNew: { fontSize: 18, fontWeight: '800', color: COLORS.primary },
  requestCardId: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
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
  fareBadgeText: { fontSize: 12, fontWeight: '800', color: COLORS.primary },
  requestCardLocations: { marginBottom: 10, gap: 6 },
  locationRow: { flexDirection: 'row', gap: 8 },
  locationLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, minWidth: 40 },
  requestLocationText: { fontSize: 12, color: COLORS.textMain, flex: 1 },
  requestInfo: { marginBottom: 8 },
  requestButtonsRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  blockedRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  blockedSearchInput: {
    marginTop: 6,
    marginBottom: 12,
  },
  blockedPassengerCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  blockedPassengerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  blockedPassengerTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  blockedPassengerName: {
    color: COLORS.textMain,
    fontSize: 16,
    fontWeight: '900',
  },
  blockedPassengerMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  blockedReasonBox: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 10,
  },
  blockedSectionLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  blockedReasonText: {
    color: COLORS.textMain,
    fontSize: 13,
    fontWeight: '700',
  },
  blockedContextText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
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
    backgroundColor: COLORS.surface,
    color: COLORS.textMain,
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
    color: COLORS.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  nextActionButton: {
    marginTop: 10,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    ...SHADOWS.soft,
  },
  nextActionButtonText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  cancelRideButton: {
    marginTop: 10,
    backgroundColor: '#FFF5F5',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.danger,
    alignItems: 'center',
  },
  cancelRideButtonText: { color: COLORS.danger, fontWeight: '800', fontSize: 15 },
  acceptButton: {
    marginTop: 8,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  acceptButtonNew: {
    flex: 1,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    ...SHADOWS.soft,
  },
  blockButton: {
    marginTop: 8,
    backgroundColor: COLORS.danger,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  blockButtonNew: {
    backgroundColor: COLORS.background,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    minWidth: 90,
  },
  blockButtonActive: {
    backgroundColor: '#FFEBEE',
    borderColor: COLORS.danger,
  },
  acceptText: { color: '#fff', fontWeight: '700' },
  acceptTextNew: { color: '#fff', fontWeight: '800', fontSize: 14 },
  declineButtonNew: {
    backgroundColor: '#FFF5F5',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.danger,
    alignItems: 'center',
    minWidth: 90,
  },
  declineButtonTextNew: { color: COLORS.danger, fontWeight: '800', fontSize: 13 },
  blockButtonTextNew: { color: COLORS.textMain, fontWeight: '700', fontSize: 13 },
  blockButtonTextActive: { color: COLORS.danger, fontWeight: '800' },
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
  tabsContainer: {
    marginVertical: 12,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rideCardContainer: {
    marginVertical: 12,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  earningsPanel: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  actionButton: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  actionButtonText: {
    color: COLORS.textMain,
    fontWeight: '600',
    fontSize: 14,
  },
  settingItem: {
    paddingVertical: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMain,
    marginBottom: 8,
  },
});
