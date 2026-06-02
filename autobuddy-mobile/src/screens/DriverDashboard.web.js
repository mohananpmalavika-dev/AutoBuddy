import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { apiRequest } from '../lib/api';
import { isPlacesConfigured, reverseGeocodeLocation } from '../lib/places';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../theme';
import RideCommunicationCard from '../components/RideCommunicationCard';
import WebCommandBar from '../components/WebCommandBar';
import KeralaSafetyCard from '../components/KeralaSafetyCard';
import DriverTrustCard from '../components/DriverTrustCard';
import DriverKycPanel from '../components/DriverKycPanel';
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
import RideCard from '../components/RideCard';
import DriverTabBar from '../components/DriverTabBar';
import EarningsPanel from '../components/EarningsPanel';
import VoiceTextInput from '../components/VoiceTextInput';
import DocumentUploadPanel from '../components/DocumentUploadPanel';
import DriverFareDisplay from '../components/DriverFareDisplay';
import DriverFareProposal from '../components/DriverFareProposal';
import VehicleManagementPanel from '../components/VehicleManagementPanel';
import SupportTicketPanel from '../components/SupportTicketPanel';
import EnhancedSettingsPanel from '../components/EnhancedSettingsPanel';
import ProfileManagementPanel from '../components/ProfileManagementPanel';
import AnalyticsDashboardAdvanced from '../components/AnalyticsDashboardAdvanced';
import RideHistoryPanel from '../components/RideHistoryPanel';
import NotificationCenter from '../components/NotificationCenter';
import ScheduledRidesPanel from '../components/ScheduledRidesPanel';
import SubscriptionPanel from '../components/SubscriptionPanel';
import DriverReviewsPanel from '../components/DriverReviewsPanel';
import DriverCancelRidePanel from '../components/DriverCancelRidePanel';
import AvailabilityStatusCard from '../components/AvailabilityStatusCard';
import PassengerTrackingMap from '../components/PassengerTrackingMap';
import MessageTemplatesPanel from '../components/MessageTemplatesPanel';
import InTripNavigationDisplay from '../components/InTripNavigationDisplay';
import DriverPerformanceDashboard from '../components/DriverPerformanceDashboard';
import SOSButton from '../components/SOSButton';
import RequestCountdownDisplay from '../components/RequestCountdownDisplay';
import ExpenseTrackerAdvanced from '../components/ExpenseTrackerAdvanced';
import RideFilterPanel from '../components/RideFilterPanel';
import EarningTargetWidget from '../components/EarningTargetWidget';
import MaintenanceAlertPanel from '../components/MaintenanceAlertPanel';
import PayoutScheduleWidget from '../components/PayoutScheduleWidget';
import DriverPaymentMethodsPanel from '../components/DriverPaymentMethodsPanel';
import { RidePoolingPanel } from '../components/RidePoolingPanel';
import { TaxReportWidget } from '../components/TaxReportWidget';
import { FavoritePassengersPanel } from '../components/FavoritePassengersPanel';
import { ShiftScheduleCalendar } from '../components/ShiftScheduleCalendar';
import { BadgesAchievementsWidget } from '../components/BadgesAchievementsWidget';
import DriverTierBenefitsPanel from '../components/DriverTierBenefitsPanel';
import DocumentExpiryAlertsPanel from '../components/DocumentExpiryAlertsPanel';
import DriverSuspensionAppealPanel from '../components/DriverSuspensionAppealPanel';
import DriverReferralPanel from '../components/DriverReferralPanel';
import { useNotifications } from '../contexts/NotificationContext';
import { usePreferences } from '../contexts/PreferencesContext';
import { DRIVER_QUICK_ACTIONS } from '../constants/driverQuickActions';
import { useNotificationManager } from '../hooks/useNotificationManager';
import { useDriverRideQueueSocket } from '../hooks/useDriverRideQueueSocket';
import { useGPSTracking } from '../hooks/useGPSTracking';
import { useSOSAlert } from '../hooks/useSOSAlert';
import { useRequestCountdown } from '../hooks/useRequestCountdown';
import { useExpenseTracking } from '../hooks/useExpenseTracking';
import {
  filterBlockedPassengers,
  formatBlockedPassengerDate,
  getBlockedPassengerRideSummary,
  normalizeBlockedPassengerRows,
} from '../lib/driverBlockedPassengers';
import {
  buildGoogleMapsDirectionsUrl,
  canCancelRide,
  getNextActionLabel,
  getNextRideStatus,
  getRideNavigationTarget,
  getRideStatusMode,
  runDriverQuickAction,
} from '../lib/driverDashboardFlow';
import {
  extractDriverReadinessFromError,
  formatDriverReadinessMessage,
  getDriverReadinessTab,
  isDriverReadyToDrive,
} from '../lib/driverReadiness';

const DEFAULT_CITY_LOCATION = {
  latitude: 13.0827,
  longitude: 80.2707,
  address: 'Chennai',
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
const AVAILABILITY_RETRY_WINDOW_MS = 300000;
const AVAILABILITY_CONFIRMED_OVERRIDE_MS = 90000;
const AVAILABILITY_TRANSIENT_MESSAGE_PARTS = [
  'checking ready to drive',
  'going online',
  'going offline',
];
const AVAILABILITY_ONLINE_SUCCESS_MESSAGE_PARTS = [
  'you are now online',
  'you are online and discoverable',
];
const AVAILABILITY_OFFLINE_SUCCESS_MESSAGE_PARTS = [
  'you are now offline',
  'you are offline',
];

function isAvailabilityTransientMessage(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return AVAILABILITY_TRANSIENT_MESSAGE_PARTS.some((part) => normalized.includes(part));
}

function getVisibleAvailabilityMessage(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || isAvailabilityTransientMessage(value)) {
    return '';
  }
  if (
    AVAILABILITY_ONLINE_SUCCESS_MESSAGE_PARTS.some((part) => normalized.includes(part)) ||
    AVAILABILITY_OFFLINE_SUCCESS_MESSAGE_PARTS.some((part) => normalized.includes(part))
  ) {
    return '';
  }
  return value;
}

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

function resolveActiveVehicleId(payload) {
  const vehicles = Array.isArray(payload) ? payload : payload?.vehicles;
  if (!Array.isArray(vehicles) || vehicles.length === 0) {
    return null;
  }
  return String((vehicles.find((vehicle) => vehicle?.is_active) || vehicles[0])?.id || '').trim() || null;
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

function readDriverAvailability(payload, fallback = false) {
  const onlineFlags = [
    payload?.is_available,
    payload?.is_online,
    payload?.presence_online,
  ].filter((value) => typeof value === 'boolean');

  if (onlineFlags.some(Boolean)) {
    return true;
  }
  if (onlineFlags.length > 0) {
    return false;
  }

  const status = String(
    payload?.availability_status ||
      payload?.availability ||
      payload?.online_status ||
      payload?.status ||
      '',
  ).toLowerCase();

  if (['online', 'available', 'active', 'ready'].includes(status)) {
    return true;
  }
  if (['offline', 'unavailable', 'inactive', 'disabled'].includes(status)) {
    return false;
  }

  return !!fallback;
}

function hasDriverAvailabilitySnapshot(payload) {
  return (
    typeof payload?.is_available === 'boolean' ||
    typeof payload?.is_online === 'boolean' ||
    typeof payload?.presence_online === 'boolean' ||
    typeof payload?.availability_status === 'string' ||
    typeof payload?.availability === 'string' ||
    typeof payload?.online_status === 'string'
  );
}

function DriverDashboardContent({ token, user, onLogout, onProfilePress = undefined }) {
  const refreshInFlightRef = useRef(false);
  const initialLocationSyncAttemptedRef = useRef(false);
  const lastWatchedLocationRef = useRef(null);
  const pendingRequestIdsRef = useRef(new Set());
  const pendingNotificationInitRef = useRef(false);
  const locationSyncSuspendedUntilRef = useRef(0);
  const lastLocationPauseNoticeAtRef = useRef(0);
  const lastLocationPushAtRef = useRef(0);
  const locationPushInFlightRef = useRef(null);
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
  const realtimeRideQueueRefreshInFlightRef = useRef(false);
  const realtimeRideQueueRefreshQueuedRef = useRef(false);
  const socketRef = useRef(null);
  const driverPollCooldownUntilRef = useRef(0);
  const lastRateLimitNoticeAtRef = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isOnline, setIsOnline] = useState(false);
  const [serverIsOnline, setServerIsOnline] = useState(false);
  const [availabilitySyncPending, setAvailabilitySyncPending] = useState(false);
  const [availabilityToggleInFlight, setAvailabilityToggleInFlight] = useState(false);
  const [availabilityPendingDesired, setAvailabilityPendingDesired] = useState(null);
  const [menuBadges, setMenuBadges] = useState({});
  const [driverSettings, setDriverSettings] = useState(DEFAULT_DRIVER_SETTINGS);
  useNotificationManager(token, user?.id, driverSettings);
  const { unreadCount } = useNotifications();
  const { updatePreference } = usePreferences();
  const [driverLocation, setDriverLocation] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [upcomingRides, setUpcomingRides] = useState(null);
  const [blockedPassengerIds, setBlockedPassengerIds] = useState([]);
  const [blockedPassengers, setBlockedPassengers] = useState([]);
  const [blockedPassengerSearch, setBlockedPassengerSearch] = useState('');
  const [activeRide, setActiveRide] = useState(null);
  const [activeVehicleId, setActiveVehicleId] = useState(null);
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
  const [cancelRidePanelVisible, setCancelRidePanelVisible] = useState(false);
  const [cancelRideBookingId, setCancelRideBookingId] = useState(null);
  const [spinWinStatus, setSpinWinStatus] = useState(null);
  const [spinWinLoading, setSpinWinLoading] = useState(false);
  const [spinningNow, setSpinningNow] = useState(false);
  const [driverMetrics, setDriverMetrics] = useState({
    average_rating: 0,
    acceptance_rate: 0,
    completion_rate: 0,
    total_rides: 0,
    monthly_earnings: 0,
    avg_distance: 0,
    hours_online: 0,
    cancellation_rate: 0,
    weekly_avg_rating: 0,
    avg_response_time: 0,
  });
  const [analyticsHistory, setAnalyticsHistory] = useState([]);

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
  const applyAvailabilitySnapshot = useCallback((payload, fallback = false, options = {}) => {
    const nextStatus = readDriverAvailability(payload, fallback);
    if (options.protect) {
      const now = Date.now();
      availabilityLocalChangeAtRef.current = now;
      availabilityUiOverrideUntilRef.current = Math.max(
        availabilityUiOverrideUntilRef.current,
        now + AVAILABILITY_CONFIRMED_OVERRIDE_MS,
      );
    }
    setServerIsOnline(nextStatus);
    setIsOnline(nextStatus);
    return nextStatus;
  }, []);

  const googleMapsWebKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const placesConfigured = isPlacesConfigured();
  const activeRideStatus = String(activeRide?.status || '').toLowerCase();
  const activeRideId = String(activeRide?.id || '').trim() || null;
  const shareLocationWhileOnline = driverSettings.share_location !== false;
  const {
    navigatingToPickup,
    navigatingToDrop,
    sharesLocation: activeRideSharesLocation,
  } = getRideStatusMode(activeRideStatus);
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
  const driverAvailability = useMemo(() => {
    const syncing = availabilitySyncPending || availabilityToggleInFlight;
    const confirmedIsOnline = !!serverIsOnline;
    const desiredIsOnline =
      availabilityPendingDesired == null ? confirmedIsOnline : !!availabilityPendingDesired;
    const labelIsOnline = syncing ? desiredIsOnline : confirmedIsOnline;
    const status = syncing
      ? labelIsOnline
        ? 'going_online'
        : 'going_offline'
      : confirmedIsOnline
        ? 'online'
        : 'offline';

    return {
      isOnline: confirmedIsOnline,
      desiredIsOnline,
      label: syncing
        ? labelIsOnline
          ? 'GOING ONLINE...'
          : 'GOING OFFLINE...'
        : confirmedIsOnline
          ? 'ONLINE & READY'
          : 'OFFLINE',
      status,
      syncing,
      tone: syncing ? 'syncing' : confirmedIsOnline ? 'online' : 'offline',
    };
  }, [availabilityPendingDesired, availabilitySyncPending, availabilityToggleInFlight, serverIsOnline]);
  const shouldSyncDriverLocation =
    (shareLocationWhileOnline && driverAvailability.isOnline && !driverAvailability.syncing) ||
    activeRideSharesLocation;
  const visibleMessage = getVisibleAvailabilityMessage(message);

  // TIER 1 FEATURES: GPS, SOS, Countdown, Expenses
  const { location: driverGPSLocation, speed: driverSpeed, isTracking } = useGPSTracking({
    token,
    rideId: activeRideId,
    enabled: driverAvailability.isOnline || !!activeRideId,
    syncToBackend: false,
  });

  const { sosActive, sosError, sosMessage, triggerSOS, cancelSOS } = useSOSAlert({
    token,
    driverId: user?.id,
    rideId: activeRideId,
    currentLocation: driverGPSLocation || driverLocation,
  });

  const {
    secondsRemaining,
    isExpired,
    formattedTime,
    percentage,
  } = useRequestCountdown({
    rideId: pendingRequests[0]?.id,
    initialSeconds: 60,
    onExpire: (reason) => {
      if (reason === 'timeout') {
        setMessage('Ride request expired');
        setPendingRequests((prev) => prev.slice(1));
      }
    },
    autoStart: pendingRequests.length > 0,
  });

  const {
    expenses,
    totalExpense,
    isLoading: expenseLoading,
    error: expenseError,
    addExpense,
    removeExpense,
    fetchExpenses,
    expenseTypes,
  } = useExpenseTracking({
    token,
    rideId: activeRideId,
  });

  useEffect(() => {
    if (activeRideId) {
      fetchExpenses().catch(() => null);
    }
  }, [activeRideId, fetchExpenses]);

  const handleReceiptUpload = useCallback(async () => {
    try {
      // Placeholder for receipt upload implementation
      // In real implementation, this would:
      // 1. Open file picker
      // 2. Compress image
      // 3. Upload to backend
      // 4. Return receipt URL
      console.warn('Receipt upload not yet implemented - feature available in next release');
      return null;
    } catch (err) {
      console.error('Receipt upload error:', err);
      return null;
    }
  }, []);

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
  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }
    const root = document.documentElement;
    root.dataset.autobuddyDriverTheme = driverSettings.theme || DEFAULT_DRIVER_SETTINGS.theme;
    root.lang = driverSettings.language || DEFAULT_DRIVER_SETTINGS.language;
  }, [driverSettings.language, driverSettings.theme]);
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
      if (locationPushInFlightRef.current) {
        return locationPushInFlightRef.current;
      }

      const pushPromise = (async () => {
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
      })();

      locationPushInFlightRef.current = pushPromise;
      try {
        return await pushPromise;
      } finally {
        if (locationPushInFlightRef.current === pushPromise) {
          locationPushInFlightRef.current = null;
        }
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
        fallbackUrl = `https://maps.google.com/maps?saddr=${routeOrigin.latitude},${routeOrigin.longitude}&daddr=${routeDestination.latitude},${routeDestination.longitude}&output=embed`;
      } else if (pickup && drop) {
        fallbackUrl = `https://maps.google.com/maps?saddr=${pickup.latitude},${pickup.longitude}&daddr=${drop.latitude},${drop.longitude}&output=embed`;
      } else if (place) {
        fallbackUrl = `https://maps.google.com/maps?q=${place.latitude},${place.longitude}&z=14&output=embed`;
      } else {
        fallbackUrl = `https://maps.google.com/maps?q=${DEFAULT_CITY_LOCATION.latitude},${DEFAULT_CITY_LOCATION.longitude}&z=11&output=embed`;
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
  }, [googleMapsWebKey, activeRide, driverLocation, navigatingToDrop, navigatingToPickup]);

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
      const savedStatus = readDriverAvailability(updated, !!pending.desired);
      pendingAvailabilitySyncRef.current = null;
      setAvailabilityPendingDesired(null);
      setAvailabilitySyncPendingState(false);
      applyAvailabilitySnapshot(updated, !!pending.desired, { protect: true });
      setError('');
      if (savedStatus) {
        await pushDriverLocation({
          fallbackLocation: updated?.current_location || driverLocation,
          silent: true,
        });
      }
      setMessage(savedStatus ? '' : 'You are offline.');
    } catch (err) {
      if (isRetriableAvailabilityError(err)) {
        pendingAvailabilitySyncRef.current = {
          desired: !!pending.desired,
          attempts: Number(pending.attempts || 0) + 1,
          lastAttemptAt: Date.now(),
        };
        availabilityUiOverrideUntilRef.current = Date.now() + AVAILABILITY_RETRY_WINDOW_MS;
        availabilityLocalChangeAtRef.current = Date.now();
        setAvailabilityPendingDesired(!!pending.desired);
        setAvailabilitySyncPendingState(true);
        setError(getAvailabilityErrorMessage(err));
        setMessage('Availability sync queued. Retrying automatically.');
      } else {
        pendingAvailabilitySyncRef.current = null;
        setAvailabilityPendingDesired(null);
        setAvailabilitySyncPendingState(false);
        setServerIsOnline(serverIsOnline);
        setIsOnline(serverIsOnline);
        setError(getAvailabilityErrorMessage(err));
        setMessage('');
      }
    } finally {
      availabilityRetryInFlightRef.current = false;
    }
  }, [
    applyAvailabilitySnapshot,
    driverLocation,
    pushDriverLocation,
    serverIsOnline,
    setAvailabilitySyncPendingState,
    token,
  ]);

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
    const refreshStartedAt = Date.now();
    const profile = await runAction(() => apiRequest('/drivers/profile', { token }));
    const availabilitySnapshot = await requestDriverData('/drivers/availability', null);
    const appliedAvailabilitySnapshot =
      availabilitySnapshot &&
      hasDriverAvailabilitySnapshot(availabilitySnapshot) &&
      canApplyServerAvailabilitySnapshot(refreshStartedAt);
    if (appliedAvailabilitySnapshot) {
      applyAvailabilitySnapshot(availabilitySnapshot, serverIsOnline);
    }
    if (profile) {
      if (!appliedAvailabilitySnapshot && hasDriverAvailabilitySnapshot(profile)) {
        // Avoid overriding an in-flight toggle with stale profile snapshots.
        if (canApplyServerAvailabilitySnapshot(refreshStartedAt)) {
          applyAvailabilitySnapshot(profile, false);
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

    const [requests, scheduledPayload, ride, earningsSummary, pricing, fareCalc, blockedPassengersPayload, spinStatus, settingsPayload, menuBadgePayload, vehiclesPayload] = await Promise.all([
      requestDriverData('/drivers/pending-requests', []),
      requestDriverData('/drivers/upcoming-rides', null),
      requestDriverData('/drivers/active-ride', null),
      requestDriverData('/drivers/earnings', null),
      requestDriverData('/pricing/rules', null),
      requestDriverData('/drivers/fare-calculator', null),
      requestDriverData('/drivers/blocked-passengers', { passenger_ids: [], passengers: [] }),
      requestDriverData('/spin-win/config', null),
      requestDriverData('/drivers/settings', null),
      requestDriverData('/drivers/menu-badges', null),
      requestDriverData('/drivers/vehicles', null),
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
    setActiveVehicleId(resolveActiveVehicleId(vehiclesPayload));
    setMessage('Driver dashboard refreshed.');
  }, [
    attachReadableAddress,
    applyAvailabilitySnapshot,
    canApplyServerAvailabilitySnapshot,
    hydrateDriverFareConfig,
    normalizeLocation,
    requestDriverData,
    runAction,
    serverIsOnline,
    token,
  ]);

  const refreshDriverDataSilently = useCallback(async ({ includeProfile = false, includeMeta = false } = {}) => {
    const refreshStartedAt = Date.now();
    if (refreshInFlightRef.current) {
      return;
    }
    refreshInFlightRef.current = true;
    try {
      const [
        availabilitySnapshot,
        profile,
        settingsPayload,
        requests,
        scheduledPayload,
        ride,
        blockedPassengersPayload,
        spinStatus,
        menuBadgePayload,
        vehiclesPayload,
      ] = await Promise.all([
        requestDriverData('/drivers/availability', null),
        includeProfile ? requestDriverData('/drivers/profile', null) : Promise.resolve(null),
        includeProfile ? requestDriverData('/drivers/settings', null) : Promise.resolve(null),
        requestDriverData('/drivers/pending-requests', []),
        requestDriverData('/drivers/upcoming-rides', null),
        requestDriverData('/drivers/active-ride', null),
        requestDriverData('/drivers/blocked-passengers', { passenger_ids: [], passengers: [] }),
        requestDriverData('/spin-win/config', null),
        requestDriverData('/drivers/menu-badges', null),
        requestDriverData('/drivers/vehicles', null),
      ]);
      const [earningsSummary, pricing, fareCalc] = includeMeta
        ? await Promise.all([
          requestDriverData('/drivers/earnings', null),
          requestDriverData('/pricing/rules', null),
          requestDriverData('/drivers/fare-calculator', null),
        ])
        : [null, null, null];

      const appliedAvailabilitySnapshot =
        availabilitySnapshot &&
        hasDriverAvailabilitySnapshot(availabilitySnapshot) &&
        canApplyServerAvailabilitySnapshot(refreshStartedAt);
      if (appliedAvailabilitySnapshot) {
        applyAvailabilitySnapshot(availabilitySnapshot, serverIsOnline);
      } else if (includeProfile && profile && hasDriverAvailabilitySnapshot(profile)) {
        if (canApplyServerAvailabilitySnapshot(refreshStartedAt)) {
          applyAvailabilitySnapshot(profile, false);
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
      setActiveVehicleId(resolveActiveVehicleId(vehiclesPayload));
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
  }, [
    attachReadableAddress,
    applyAvailabilitySnapshot,
    canApplyServerAvailabilitySnapshot,
    hydrateDriverFareConfig,
    normalizeLocation,
    requestDriverData,
    serverIsOnline,
  ]);

  const refreshRideStageValidation = useCallback(async () => {
    const [ride, requests, scheduledPayload] = await Promise.all([
      requestDriverData('/drivers/active-ride', null),
      requestDriverData('/drivers/pending-requests', []),
      requestDriverData('/drivers/upcoming-rides', null),
    ]);
    setActiveRide(ride || null);
    setPendingRequests(Array.isArray(requests) ? requests : []);
    setUpcomingRides(scheduledPayload || null);
  }, [requestDriverData]);

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
    runDriverQuickAction(action, {
      isOnline: driverAvailability.isOnline,
      hasActiveRide: Boolean(activeRideId),
      setError,
      setMessage,
      goOnline: () => toggleOnlineStatus().catch(() => null),
      openRequests: () => setActiveTab('requests'),
      resumeActiveRide: () => {
        setActiveTab('requests');
        setExpandedRideCard(true);
        setMessage('Active ride controls opened.');
      },
      navigateActiveRide: openActiveRideMap,
      callPassenger: () => openActiveRideCall().catch(() => null),
      activateSos: () => {
        setActiveTab('safety');
        keralaSafety.activateSos('Driver quick action SOS', 'driver_quick_action').catch(() => null);
      },
      contactSupport: () => {
        setSupportLaunchAction('contact');
        setActiveTab('support');
        setMessage('Support ticket form opened.');
      },
      withdrawEarnings: () => {
        setEarningsLaunchAction('withdraw');
        setActiveTab('earnings');
        setMessage('Withdrawal form opened. Enter the amount to submit a request.');
        refreshDriverDataSilently({ includeMeta: true }).catch(() => null);
      },
      earningsReport: () => requestDriverEarningsReport().catch(() => null),
      openTab: (tab) => {
        if (tab === 'earnings') {
          setEarningsLaunchAction('summary');
        }
        if (tab === 'support') {
          setSupportLaunchAction('help');
        }
        setActiveTab(tab);
      },
    });
  };

  const handleDriverRideSocketError = useCallback((err) => {
    console.warn('Driver ride request socket error:', err?.message || err);
  }, []);

  useDriverRideQueueSocket({
    token,
    socketRef,
    activeRideId,
    heartbeatEnabled: driverAvailability.isOnline,
    refreshDriverRideQueueFromRealtime,
    onSocketError: handleDriverRideSocketError,
  });

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

  const toggleOnlineStatus = useCallback(async () => {
    if (availabilityToggleInFlightRef.current) {
      return;
    }

    if (!token) {
      setError('Missing authentication token');
      return;
    }

    const next = !driverAvailability.isOnline;
    const previousLocalStatus = isOnline;
    const previousServerStatus = serverIsOnline;
    const requestId = availabilityToggleRequestIdRef.current + 1;
    const toggledAt = Date.now();
    availabilityToggleInFlightRef.current = requestId;
    availabilityToggleRequestIdRef.current = requestId;
    availabilityLocalChangeAtRef.current = toggledAt;
    availabilityUiOverrideUntilRef.current = toggledAt + 15000;
    pendingAvailabilitySyncRef.current = null;

    setAvailabilityToggleInFlight(true);
    setAvailabilitySyncPendingState(true);
    setAvailabilityPendingDesired(next);
    setError('');
    setMessage(next ? 'Checking Ready to Drive...' : 'Going offline...');

    try {
      if (next) {
        const readiness = await apiRequest('/drivers/readiness', { token, timeoutMs: 8000 });
        if (availabilityToggleRequestIdRef.current !== requestId) {
          return;
        }
        if (!isDriverReadyToDrive(readiness)) {
          const rollbackAt = Date.now();
          availabilityLocalChangeAtRef.current = rollbackAt;
          availabilityUiOverrideUntilRef.current = rollbackAt + 15000;
          setAvailabilityPendingDesired(null);
          setServerIsOnline(previousServerStatus);
          setIsOnline(previousLocalStatus);
          setActiveTab(getDriverReadinessTab(readiness));
          setError(formatDriverReadinessMessage(readiness));
          setMessage('Complete Ready to Drive before going online.');
          refreshDriverMenuBadges().catch(() => null);
          return;
        }
      }

      setMessage(next ? 'Going online...' : 'Going offline...');

      const response = await apiRequest('/drivers/availability', {
        method: 'PUT',
        token,
        timeoutMs: 10000,
        body: { is_available: next },
      });

      if (availabilityToggleRequestIdRef.current !== requestId) {
        return;
      }

      const savedStatus = readDriverAvailability(response, next);
      const availabilitySnapshot = await requestDriverData('/drivers/availability', null);
      const confirmedSnapshot = hasDriverAvailabilitySnapshot(availabilitySnapshot)
        ? availabilitySnapshot
        : response;
      const confirmedStatus = readDriverAvailability(confirmedSnapshot, savedStatus);

      applyAvailabilitySnapshot(confirmedSnapshot, confirmedStatus, { protect: true });
      setError('');

      if (confirmedStatus !== next) {
        setError(
          next
            ? 'Server did not confirm online status. Please retry after Ready to Drive is complete.'
            : 'Server did not confirm offline status. Please retry.',
        );
        setMessage('');
        return;
      }

      setMessage(confirmedStatus ? '' : 'You are now offline.');

      if (confirmedStatus) {
        pushDriverLocation({ silent: true }).catch(() => null);
      }
    } catch (err) {
      if (availabilityToggleRequestIdRef.current !== requestId) {
        return;
      }

      const rollbackAt = Date.now();
      availabilityLocalChangeAtRef.current = rollbackAt;
      availabilityUiOverrideUntilRef.current = rollbackAt + 15000;

      setAvailabilityPendingDesired(null);
      setServerIsOnline(previousServerStatus);
      setIsOnline(previousLocalStatus);

      const readiness = extractDriverReadinessFromError(err);
      if (next && !isDriverReadyToDrive(readiness)) {
        setActiveTab(getDriverReadinessTab(readiness));
        setError(formatDriverReadinessMessage(readiness));
        setMessage('Complete Ready to Drive before going online.');
        refreshDriverMenuBadges().catch(() => null);
        return;
      }
      setError(getAvailabilityErrorMessage(err));
      setMessage('Status update failed. Please try again.');
    } finally {
      if (availabilityToggleInFlightRef.current === requestId) {
        availabilityToggleInFlightRef.current = null;
        pendingAvailabilitySyncRef.current = null;
        setAvailabilityPendingDesired(null);
        setAvailabilityToggleInFlight(false);
        setAvailabilitySyncPendingState(false);
      }
    }
  }, [
    driverAvailability.isOnline,
    applyAvailabilitySnapshot,
    isOnline,
    pushDriverLocation,
    requestDriverData,
    refreshDriverMenuBadges,
    serverIsOnline,
    setAvailabilitySyncPendingState,
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
      await refreshDriverDataSilently({ includeProfile: true });
    }
  };

  const moveRideToNextStatus = async () => {
    if (!activeRide?.id) {
      return;
    }
    const nextStatus = getNextRideStatus(activeRide.status);
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

  const performCancelActiveRide = async (cancelPayload = {}) => {
    if (!activeRideId) {
      return;
    }
    const cancelled = await runAction(
      () =>
        apiRequest(`/bookings/${activeRideId}/cancel`, {
          method: 'PUT',
          token,
          body: cancelPayload,
        }),
      'Ride cancelled. You are available for new requests.',
    );
    if (cancelled) {
      setCancelRidePanelVisible(false);
      setCancelRideBookingId(null);
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
    setActiveTab('requests');
    setExpandedRideCard(true);
    setCancelRideBookingId(activeRideId);
    setCancelRidePanelVisible(true);
    setMessage('Choose a cancellation reason and confirm the policy acknowledgement.');
  };

  const nextActionLabel = useMemo(() => getNextActionLabel(activeRide?.status), [activeRide?.status]);
  const canCancelActiveRide = Boolean(activeRideId) && canCancelRide(activeRideStatus);

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
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(roomUrl, '_blank', 'noopener,noreferrer');
    } else {
      setMessage(`Call room ready: ${roomUrl}`);
    }
  }, [activeRideId, runAction, token]);

  const openActiveRideMap = useCallback(() => {
    const origin = mapState.routeOrigin || mapState.driverPlace || mapState.pickup;
    const { destination: fallbackDestination } = getRideNavigationTarget({
      ride: activeRide,
      status: activeRideStatus,
      normalizeLocation,
    });
    const destination = mapState.routeDestination || fallbackDestination || mapState.drop || mapState.pickup;
    if (!destination) {
      setError('Ride location unavailable.');
      return;
    }

    const mapsUrl = buildGoogleMapsDirectionsUrl({ origin, destination });
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(mapsUrl, '_blank', 'noopener,noreferrer');
    } else {
      setMessage(`Route ready: ${mapsUrl}`);
    }
  }, [activeRide, activeRideStatus, mapState, normalizeLocation]);

  const resumeScheduledRide = useCallback((ride) => {
    if (!ride?.id) {
      return;
    }
    setActiveRide((prev) => (prev?.id === ride.id ? { ...prev, ...ride } : ride));
    setActiveTab('requests');
    setExpandedRideCard(true);
    setMessage('Scheduled ride controls opened.');
  }, []);

  const openScheduledRideNavigation = useCallback((ride) => {
    const { destination } = getRideNavigationTarget({
      ride,
      status: ride?.status,
      normalizeLocation,
    });
    if (!destination) {
      setError('Scheduled ride location unavailable.');
      return;
    }
    const mapsUrl = buildGoogleMapsDirectionsUrl({ origin: driverLocation, destination });
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(mapsUrl, '_blank', 'noopener,noreferrer');
    } else {
      setMessage(`Route ready: ${mapsUrl}`);
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
    if (typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(roomUrl, '_blank', 'noopener,noreferrer');
    } else {
      setMessage(`Call room ready: ${roomUrl}`);
    }
  }, [runAction, token]);

  const cancelScheduledRide = useCallback(async (ride) => {
    const rideId = String(ride?.id || '').trim();
    if (!rideId) {
      return;
    }
    const proceed =
      typeof window !== 'undefined' && typeof window.confirm === 'function'
        ? window.confirm('Cancel this scheduled ride? The passenger will be notified.')
        : true;
    if (!proceed) {
      return;
    }
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
            onPress={openActiveRideMap}
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

  const handleProfilePress = useCallback(() => {
    if (typeof onProfilePress === 'function') {
      onProfilePress();
    }
    setActiveTab('profile');
  }, [onProfilePress]);

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
          <View style={styles.mapOverlayWrap} pointerEvents="none">
            <View style={styles.mapOverlayCard}>
              <Text style={styles.mapOverlayTitle}>Live Driver Map</Text>
              <Text style={styles.mapOverlayMalayalam}>
                {activeRide ? 'Route view ready for the current ride.' : 'Showing current driver coverage area.'}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.panel}>
          {renderStickyActiveRideBar()}
          <ScrollView
            style={styles.panelScroll}
            contentContainerStyle={styles.panelScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
          <View style={styles.topBar}>
            <TouchableOpacity 
              style={[
                styles.statusBadgeButton,
                {
                  backgroundColor:
                    driverAvailability.syncing
                      ? '#FFF7E6'
                      : driverAvailability.isOnline
                      ? '#E8F5E9'
                      : '#F5F5F5',
                  borderColor:
                    driverAvailability.syncing
                      ? '#FFA500'
                      : driverAvailability.isOnline
                      ? '#2E7D32'
                      : '#BDBDBD',
                },
              ]}
              onPress={toggleOnlineStatus}
              disabled={availabilityToggleInFlight}
            >
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      driverAvailability.syncing
                        ? '#FFA500'
                        : driverAvailability.isOnline
                        ? '#2E7D32'
                        : '#8A8A8A',
                  },
                ]}
              />
              <View style={styles.statusContent}>
                <Text
                  style={[
                    styles.statusText,
                    {
                      color:
                        driverAvailability.syncing
                          ? '#B26A00'
                          : driverAvailability.isOnline
                          ? '#2E7D32'
                          : '#666',
                    },
                  ]}
                >
                  {driverAvailability.syncing
                    ? driverAvailability.desiredIsOnline
                      ? 'GOING ONLINE...'
                      : 'GOING OFFLINE...'
                    : driverAvailability.isOnline
                      ? 'ONLINE & READY'
                      : 'OFFLINE'}
                </Text>
                <Text style={styles.statusSub}>{user?.name || 'Driver'} - Tap to toggle</Text>
              </View>
              {driverAvailability.syncing && <ActivityIndicator size="small" color="#FFA500" />}
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
          {!!driverGPSLocation && (
            <Text style={styles.locationText}>
              📍 {driverGPSLocation.address || `${driverGPSLocation.latitude}, ${driverGPSLocation.longitude}`}
              {driverSpeed ? ` • Speed: ${driverSpeed} km/h` : ''} {isTracking ? '✅ Tracking' : '⏸️ Paused'}
            </Text>
          )}
          {!!driverLocation && !driverGPSLocation && (
            <Text style={styles.locationText}>
              Current location: {driverLocation.address || `${driverLocation.latitude}, ${driverLocation.longitude}`}
            </Text>
          )}
          {!!error && <Text style={styles.error}>{error}</Text>}
          {!!visibleMessage && <Text style={styles.message}>{visibleMessage}</Text>}
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
              isOnline={driverAvailability.isOnline}
              statusLabel={driverAvailability.label}
              statusSyncing={driverAvailability.syncing}
            />
          </View>

          {/* Ride Card - Always Visible */}
          {activeTab === 'requests' && (
            <View style={styles.rideCardContainer}>
              <RideCard
                ride={activeRide}
                driverLocation={driverLocation}
                onAccept={() => activeRide?.id && acceptRequest(activeRide.id)}
                onDecline={() => activeRide?.id && rejectRequest(activeRide.id)}
                onComplete={moveRideToNextStatus}
                onMessage={focusRideCommunication}
                onCall={openActiveRideCall}
                onMapPress={openActiveRideMap}
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
                  <FadeSlideView>
                    <GlassCard style={styles.premiumCallout}>
                      <LiveEtaPulse eta={liveEtaLabel} />
                      <Text style={styles.premiumTitle}>Ride Operations Active</Text>
                      <Text style={styles.premiumMalayalam}>Live trip controls are active.</Text>
                    </GlassCard>
                  </FadeSlideView>
                  <AvailabilityStatusCard
                    availability={driverAvailability}
                    onToggle={toggleOnlineStatus}
                    loading={availabilityToggleInFlight}
                  />
                  <View style={styles.requestCard}>
                    <RideProgressTimeline status={activeRideStatus || 'searching'} />

                    {/* TIER 1: SOS Button - Emergency Alert */}
                    <SOSButton
                      onTriggerSOS={triggerSOS}
                      onCancelSOS={cancelSOS}
                      sosActive={sosActive}
                      sosMessage={sosMessage}
                      sosError={sosError}
                      disabled={loading}
                      compact={false}
                    />

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
                        <PassengerTrackingMap
                          driverLocation={driverLocation}
                          pickupLocation={normalizeLocation(activeRide.pickup_location)}
                          status={activeRideStatus || 'driver_arrived'}
                          onNavigateToPassenger={openActiveRideMap}
                        />
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
                        <InTripNavigationDisplay
                          origin={normalizeLocation(activeRide.pickup_location)}
                          destination={normalizeLocation(activeRide.drop_location || activeRide.dropoff_location)}
                          currentLocation={driverGPSLocation || driverLocation}
                          rideStatus={activeRideStatus}
                          onOpenFullMap={openActiveRideMap}
                        />
                        {/* TIER 1: Expense Tracking */}
                        <ExpenseTrackerAdvanced
                          token={token}
                          driverId={user?.id}
                          expenses={expenses}
                          totalExpense={totalExpense}
                          onAddExpense={addExpense}
                          onRemoveExpense={removeExpense}
                          onUploadReceipt={handleReceiptUpload}
                          isLoading={expenseLoading}
                          error={expenseError}
                          expenseTypes={expenseTypes}
                        />
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
                    <DriverCancelRidePanel
                      visible={cancelRidePanelVisible && canCancelActiveRide && cancelRideBookingId === activeRideId}
                      booking={activeRide}
                      loading={loading}
                      onCancel={() => {
                        setCancelRidePanelVisible(false);
                        setCancelRideBookingId(null);
                      }}
                      onSubmit={(payload) => performCancelActiveRide(payload).catch(() => null)}
                    />
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
                driverAvailability.isOnline ? (
                  pendingRequests.length === 0 ? (
                    <PremiumEmptyState
                      title="No pending requests"
                      subtitle="You are online. New bookings will appear shortly."
                      malayalam="New requests will appear here shortly."
                    />
                  ) : (
                    pendingRequests.map((req, idx) => {
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
                      const isFirstRequest = idx === 0;

                      return (
                        <View key={req.id} style={styles.requestCardNew}>
                          {/* TIER 1: Request Countdown Timer */}
                          {isFirstRequest && (
                            <RequestCountdownDisplay
                              secondsRemaining={secondsRemaining}
                              isExpired={isExpired}
                              formattedTime={formattedTime}
                              percentage={percentage}
                              style={styles.countdownDisplay}
                            />
                          )}
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
                  <PremiumEmptyState
                    title="You are offline"
                    subtitle="Switch online to receive nearby ride requests."
                    malayalam="Go online to receive requests."
                  />
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
              <DriverPerformanceDashboard
                token={token}
                stats={{
                  acceptanceRate: 0,
                  cancellationRate: 0,
                  onTimePercentage: 0,
                  completionRate: 0,
                  averageRating: Number(user?.rating || 0),
                  rideCount: Number(earnings?.total_rides || 0),
                  earningsToday: Number(earnings?.today_earnings || 0),
                }}
              />
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

          {activeTab === 'targets' && (
            <View style={styles.earningsCard}>
              <EarningTargetWidget token={token} driverId={user?.id} />
            </View>
          )}

          {activeTab === 'payout' && (
            <PayoutScheduleWidget
              isVisible={true}
              onClose={() => setActiveTab('earnings')}
              token={token}
              driverId={user?.id}
            />
          )}

          {activeTab === 'paymethods' && (
            <DriverPaymentMethodsPanel
              isVisible={true}
              onClose={() => setActiveTab('earnings')}
              token={token}
              driverId={user?.id}
            />
          )}

          {activeTab === 'filters' && (
            <RideFilterPanel
              isVisible={true}
              onClose={() => setActiveTab('requests')}
              token={token}
              driverId={user?.id}
            />
          )}

          {activeTab === 'maintenance' && (
            <MaintenanceAlertPanel
              isVisible={true}
              onClose={() => setActiveTab('vehicle')}
              token={token}
              vehicleId={activeVehicleId}
            />
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
              <VoiceTextInput style={styles.input} value={driverFareConfig.peak_hours} onChangeText={(value) => updateDriverFareField('peak_hours', value)} placeholder="8,9,17,18,19" placeholderTextColor="#9AA7A0" />
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
                placeholderTextColor="#9AA7A0"
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

          {activeTab === 'subscription' && (
            <View style={styles.earningsCard}>
              <SubscriptionPanel token={token} audience="driver" />
            </View>
          )}

          {activeTab === 'history' && (
            <View style={styles.earningsCard}>
              <RideHistoryPanel
                token={token}
                viewerRole="driver"
                onSupportRequested={(booking) => {
                  setSupportLaunchAction('contact');
                  setActiveTab('support');
                  setMessage(`Support opened for booking ${String(booking?.id || '').slice(0, 12) || 'ride'}.`);
                }}
              />
            </View>
          )}

          {activeTab === 'notifications' && (
            <View style={styles.earningsCard}>
              <NotificationCenter
                token={token}
                onClose={() => setActiveTab('requests')}
                onNotificationPress={handleDriverNotificationPress}
              />
            </View>
          )}

          {activeTab === 'profile' && (
            <View style={styles.earningsCard}>
              <ProfileManagementPanel token={token} loading={loading} />
            </View>
          )}

          {activeTab === 'documents' && (
            <View style={styles.earningsCard}>
              <DocumentUploadPanel token={token} loading={loading} onDataChanged={refreshDriverMenuBadges} />
            </View>
          )}

          {activeTab === 'fare' && (
            <View style={styles.earningsCard}>
              <View style={{ flex: 1 }}>
                <DriverFareDisplay />
                <DriverFareProposal />
              </View>
            </View>
          )}

          {activeTab === 'vehicle' && (
            <View style={styles.earningsCard}>
              <VehicleManagementPanel token={token} loading={loading} />
            </View>
          )}

          {activeTab === 'support' && (
            <>
              <MessageTemplatesPanel
                token={token}
                activeRide={activeRide}
                onMessageSent={(message) => {
                  setMessage(`Message sent: ${message}`);
                }}
              />
              <View style={styles.earningsCard}>
                <SupportTicketPanel
                  key={supportLaunchAction}
                  token={token}
                  loading={loading}
                  initialAction={supportLaunchAction}
                  onDataChanged={refreshDriverMenuBadges}
                />
              </View>
            </>
          )}

          {activeTab === 'analytics' && (
            <View style={styles.earningsCard}>
              <AnalyticsDashboardAdvanced
                driverId={user?.id}
                token={token}
                currentMetrics={driverMetrics}
                historicalData={analyticsHistory}
                isLoading={loading}
              />
            </View>
          )}

          {activeTab === 'favorites' && (
            <View style={styles.earningsCard}>
              <FavoritePassengersPanel token={token} loading={loading} />
            </View>
          )}

          {activeTab === 'shifts' && (
            <View style={styles.earningsCard}>
              <ShiftScheduleCalendar token={token} loading={loading} />
            </View>
          )}

          {activeTab === 'reviews' && (
            <View style={styles.earningsCard}>
              <DriverReviewsPanel
                token={token}
                onAppealReview={(review) => {
                  setSupportLaunchAction('contact');
                  setActiveTab('support');
                  setMessage(`Support opened for review ${String(review?.id || review?.booking_id || '').slice(0, 12)}.`);
                }}
              />
            </View>
          )}

          {/* TIER 3: Ride Pooling Tab */}
          {activeTab === 'pooling' && (
            <RidePoolingPanel
              isVisible={true}
              onClose={() => setActiveTab('requests')}
              token={token}
              driverId={user?.id}
            />
          )}

          {/* TIER 3: Tax Reporting Tab */}
          {activeTab === 'taxreports' && (
            <TaxReportWidget
              isVisible={true}
              onClose={() => setActiveTab('earnings')}
              token={token}
              driverId={user?.id}
            />
          )}

          {/* TIER 3: Favorite Passengers Tab */}
          {activeTab === 'favorites' && (
            <FavoritePassengersPanel
              isVisible={true}
              onClose={() => setActiveTab('requests')}
              token={token}
              driverId={user?.id}
            />
          )}

          {/* TIER 3: Shift Schedule Tab */}
          {activeTab === 'shifts' && (
            <ShiftScheduleCalendar
              isVisible={true}
              onClose={() => setActiveTab('earnings')}
              token={token}
              driverId={user?.id}
            />
          )}

          {/* TIER 3: Gamification Badges Tab */}
          {activeTab === 'badges' && (
            <BadgesAchievementsWidget
              isVisible={true}
              onClose={() => setActiveTab('earnings')}
              token={token}
              driverId={user?.id}
            />
          )}

          {/* NEW: Driver Tier Benefits Tab */}
          {activeTab === 'tier' && (
            <DriverTierBenefitsPanel
              token={token}
              onTierUpgrade={() => setMessage('Visit the app store for tier upgrades')}
            />
          )}

          {/* NEW: Document Expiry Alerts Tab */}
          {activeTab === 'expiry' && (
            <DocumentExpiryAlertsPanel
              token={token}
              onDocumentExpiring={(data) => {
                const { critical, warning } = data;
                setMessage(`Document alerts: ${critical} critical, ${warning} warnings`);
              }}
            />
          )}

          {/* NEW: Driver Suspension Appeals Tab */}
          {activeTab === 'appeals' && (
            <DriverSuspensionAppealPanel
              token={token}
              onAppealSubmitted={() => setMessage('Appeal submitted successfully. You will receive a response within 48 hours.')}
            />
          )}

          {/* NEW: Driver Referral Program Tab */}
          {activeTab === 'referral' && (
            <DriverReferralPanel
              token={token}
              driverId={user?.id}
              onReferralShare={(code) => setMessage(`Referral code ${code} shared successfully!`)}
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
              displayIsOnline={driverAvailability.isOnline}
              onToggleOnline={toggleOnlineStatus}
              onNavigateToTab={handleSettingsNavigateToTab}
              onSettingsChange={handleDriverSettingsChange}
            />
          )}

          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

export default function DriverDashboard(props) {
  return <DriverDashboardContent {...props} />;
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
    left: 12,
    right: 12,
    top: 12,
  },
  mapOverlayCard: {
    alignSelf: 'flex-start',
    maxWidth: 360,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(215, 226, 218, 0.9)',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingVertical: 10,
    paddingHorizontal: 12,
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
  input: {
    borderWidth: 1,
    borderColor: '#D7E2DA',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: '#202020',
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
  },
  error: { color: COLORS.danger, marginBottom: 8 },
  message: { color: '#1B5E20', marginBottom: 8 },
  loader: { marginVertical: 6 },
  stickyRideBar: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#D7E2DA',
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
    color: '#66796E',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  stickyRideTitle: {
    color: '#202020',
    fontSize: 14,
    fontWeight: '900',
  },
  stickyRideMeta: {
    color: '#66796E',
    fontSize: 12,
    fontWeight: '600',
  },
  stickyRideStatusPill: {
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: '#2E7D32',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  stickyRideStatusText: {
    color: '#1B5E20',
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
    borderColor: '#D7E2DA',
    backgroundColor: '#F8FBF9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stickyRideButtonPrimary: {
    backgroundColor: '#2E7D32',
    borderColor: '#2E7D32',
  },
  stickyRideButtonDanger: {
    backgroundColor: '#FFF5F5',
    borderColor: '#D32F2F',
  },
  stickyRideButtonDisabled: {
    opacity: 0.6,
  },
  stickyRideButtonText: {
    color: '#355243',
    fontSize: 12,
    fontWeight: '800',
  },
  stickyRideButtonPrimaryText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  stickyRideButtonDangerText: {
    color: '#D32F2F',
    fontSize: 12,
    fontWeight: '900',
  },
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
  blockedSearchInput: {
    marginTop: 6,
    marginBottom: 12,
  },
  blockedPassengerCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D7E2DA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  // TIER 1: Countdown display style
  countdownDisplay: {
    marginTop: 0,
    marginBottom: 12,
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
    color: '#202020',
    fontSize: 16,
    fontWeight: '900',
  },
  blockedPassengerMeta: {
    color: '#666666',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  blockedReasonBox: {
    backgroundColor: '#F8FBF9',
    borderWidth: 1,
    borderColor: '#D7E2DA',
    borderRadius: 10,
    padding: 10,
  },
  blockedSectionLabel: {
    color: '#66796E',
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  blockedReasonText: {
    color: '#202020',
    fontSize: 13,
    fontWeight: '700',
  },
  blockedContextText: {
    color: '#666666',
    fontSize: 12,
    fontWeight: '600',
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
  cancelRideButton: {
    marginTop: 10,
    backgroundColor: '#FFF5F5',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D32F2F',
    alignItems: 'center',
  },
  cancelRideButtonText: { color: '#D32F2F', fontWeight: '800', fontSize: 15 },
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
  declineButtonNew: {
    backgroundColor: '#FFF5F5',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D32F2F',
    alignItems: 'center',
    minWidth: 90,
  },
  declineButtonTextNew: { color: '#D32F2F', fontWeight: '800', fontSize: 13 },
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
  tabsContainer: {
    marginVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F8FBF9',
    borderWidth: 1,
    borderColor: '#D7E2DA',
  },
  rideCardContainer: {
    marginVertical: 12,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#D7E2DA',
    backgroundColor: '#FFFFFF',
  },
  earningsPanel: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#D7E2DA',
    overflow: 'hidden',
  },
  actionButton: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  actionButtonText: {
    color: '#333333',
    fontWeight: '600',
    fontSize: 14,
  },
  settingItem: {
    paddingVertical: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEEEEE',
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 8,
  },
});
