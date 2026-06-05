import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import DriverTabBar from '../components/DriverTabBar';
import AnalyticsDashboardAdvanced from '../components/AnalyticsDashboardAdvanced';
import { BadgesAchievementsWidget } from '../components/BadgesAchievementsWidget';
import DemandHeatmapIntegration from '../components/DemandHeatmapIntegration';
import DocumentExpiryAlertsPanel from '../components/DocumentExpiryAlertsPanel';
import DocumentUploadPanel from '../components/DocumentUploadPanel';
import DriverFareDisplay from '../components/DriverFareDisplay';
import DriverFareProposal from '../components/DriverFareProposal';
import DriverKycPanel from '../components/DriverKycPanel';
import DriverPhotoVerificationPanel from '../components/DriverPhotoVerificationPanel';
import DriverReferralPanel from '../components/DriverReferralPanel';
import DriverReviewsPanel from '../components/DriverReviewsPanel';
import DriverSuspensionAppealPanel from '../components/DriverSuspensionAppealPanel';
import DriverTierBenefitsPanel from '../components/DriverTierBenefitsPanel';
import DriverTrustCard from '../components/DriverTrustCard';
import EarningsPanel from '../components/EarningsPanel';
import EnhancedSettingsPanel from '../components/EnhancedSettingsPanel';
import { FavoritePassengersPanel } from '../components/FavoritePassengersPanel';
import KeralaSafetyCard from '../components/KeralaSafetyCard';
import NotificationCenter from '../components/NotificationCenter';
import PassengerSafetyRatingsPanel from '../components/PassengerSafetyRatingsPanel';
import ProfileManagementPanel from '../components/ProfileManagementPanel';
import RideCommunicationCard from '../components/RideCommunicationCard';
import RideFilterPanel from '../components/RideFilterPanel';
import RideHistoryPanel from '../components/RideHistoryPanel';
import { RidePoolingPanel } from '../components/RidePoolingPanel';
import ScheduledRidesPanel from '../components/ScheduledRidesPanel';
import { ShiftScheduleCalendar } from '../components/ShiftScheduleCalendar';
import SubscriptionPanel from '../components/SubscriptionPanel';
import SupportTicketPanel from '../components/SupportTicketPanel';
import { TaxReportWidget } from '../components/TaxReportWidget';
import TrafficAlerts from '../components/TrafficAlerts';
import VehicleManagementPanel from '../components/VehicleManagementPanel';
import WebGoogleLiveMap from '../components/WebGoogleLiveMap';
import { DRIVER_QUICK_ACTIONS } from '../constants/driverQuickActions';
import { useDriverRideQueueSocket } from '../hooks/useDriverRideQueueSocket';
import { useKeralaSafety } from '../hooks/useKeralaSafety';
import { apiRequest } from '../lib/api';
import {
  filterBlockedPassengers,
  formatBlockedPassengerDate,
  getBlockedPassengerRideSummary,
  normalizeBlockedPassengerRows,
} from '../lib/driverBlockedPassengers';
import {
  hasLiveLocationSignal,
  readDriverAvailability,
  toDriverLocationApiBody,
} from '../lib/driverAvailabilityStatus';
import {
  buildGoogleMapsDirectionsUrl,
  getNextActionLabel,
  getNextRideStatus,
  getRideNavigationTarget,
  getRideStatusMode,
  runDriverQuickAction,
} from '../lib/driverDashboardFlow';
import {
  formatDriverReadinessMessage,
  isDriverReadyToDrive,
} from '../lib/driverReadiness';
import {
  formatWebGeolocationError,
  isWebGeolocationAvailable,
  requestWebCurrentPosition,
} from '../lib/webGeolocation';
import { COLORS, SHADOWS } from '../theme';

const DEFAULT_CENTER = { latitude: 8.8932, longitude: 76.6141 };
const EMPTY_UPCOMING = {
  counts: { scheduled_requests: 0, assigned_rides: 0, total: 0 },
  scheduled_requests: [],
  assigned_rides: [],
};
const REFRESH_INTERVAL_MS = 60000;
const DRIVER_COMMAND_RATE_LIMIT_COOLDOWN_MS = 60000;
const DRIVER_ACTION_REFRESH_PAUSE_MS = 8000;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function unwrapArray(payload, keys = []) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  if (Array.isArray(payload.data)) {
    return payload.data;
  }
  for (const key of keys) {
    if (Array.isArray(payload[key])) {
      return payload[key];
    }
    if (Array.isArray(payload.data?.[key])) {
      return payload.data[key];
    }
  }
  return [];
}

function unwrapObject(payload, keys = []) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }
  for (const key of keys) {
    const value = payload[key] || payload.data?.[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value;
    }
  }
  return payload;
}

const STRICT_ACCEPTING_KEYS = ['is_available', 'isAvailable', 'available'];

function readBooleanLike(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value !== 0;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on', 'available', 'accepting'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off', 'unavailable', 'offline', 'paused'].includes(normalized)) {
    return false;
  }
  return null;
}

function readDriverAccepting(payload, fallback = false) {
  const candidates = [
    payload,
    payload?.data,
    payload?.result,
    payload?.availability,
    payload?.driver,
    payload?.profile,
    payload?.data?.availability,
    payload?.data?.driver,
    payload?.data?.profile,
  ].filter((item) => item && typeof item === 'object' && !Array.isArray(item));

  for (const candidate of candidates) {
    for (const key of STRICT_ACCEPTING_KEYS) {
      if (Object.prototype.hasOwnProperty.call(candidate, key)) {
        const explicit = readBooleanLike(candidate[key]);
        if (explicit !== null) {
          return explicit;
        }
      }
    }
  }

  return readDriverAvailability(payload, fallback);
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLocation(value) {
  if (!value) {
    return null;
  }
  if (typeof value === 'string') {
    const address = value.trim();
    return address ? { address } : null;
  }
  if (typeof value !== 'object') {
    return null;
  }

  const source = value.coordinates && typeof value.coordinates === 'object' ? { ...value, ...value.coordinates } : value;
  const latitude = toNumber(source.latitude ?? source.lat);
  const longitude = toNumber(source.longitude ?? source.lng ?? source.lon);
  const address = String(
    source.address ||
      source.formatted_address ||
      source.name ||
      source.label ||
      '',
  ).trim();

  if (latitude === null || longitude === null) {
    return address ? { address } : null;
  }

  return {
    ...source,
    latitude,
    longitude,
    address: address || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`,
  };
}

function hasUsableLocation(location) {
  const normalized = normalizeLocation(location);
  if (!normalized) {
    return false;
  }
  return (
    hasLiveLocationSignal(normalized) ||
    (Number.isFinite(Number(normalized.latitude)) && Number.isFinite(Number(normalized.longitude)))
  );
}

function getPickupLocation(ride) {
  return normalizeLocation(ride?.pickup_location || ride?.pickup || ride?.pickup_location_details);
}

function getDropLocation(ride) {
  return normalizeLocation(
    ride?.drop_location ||
      ride?.dropoff_location ||
      ride?.dropoff ||
      ride?.drop_location_details ||
      ride?.dropoff_location_details,
  );
}

function getActiveRideFromPayload(payload) {
  const ride = unwrapObject(payload, ['active_ride', 'activeRide', 'booking', 'ride']);
  if (!ride || !ride.id) {
    return null;
  }
  return ride;
}

function getAvailabilityErrorMessage(err) {
  const status = Number(err?.status || 0);
  if (status === 401) {
    return 'Your session expired. Please log in again.';
  }
  if (status === 429) {
    return 'Too many requests. Please wait a moment.';
  }
  if (status >= 500) {
    return `Server error (${status}). Please retry.`;
  }
  return err?.message || 'Request failed. Please retry.';
}

function getDriverCommandCooldownMs(err) {
  const status = Number(err?.status || 0);
  const retryAfterMs = Number(err?.retryAfterMs || 0);
  if (status === 429 || err?.rateLimitCooldown) {
    return Math.max(5000, Math.min(120000, retryAfterMs || DRIVER_COMMAND_RATE_LIMIT_COOLDOWN_MS));
  }
  if (status === 503 || err?.backendOutage) {
    return Math.max(15000, Math.min(60000, retryAfterMs || 30000));
  }
  return 0;
}

function formatMoney(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? `Rs. ${amount.toFixed(0)}` : 'Fare pending';
}

function formatDistance(value) {
  const distance = Number(value || 0);
  return Number.isFinite(distance) && distance > 0 ? `${distance.toFixed(1)} km` : 'Distance pending';
}

function formatStatus(value) {
  return String(value || 'active').replace(/_/g, ' ');
}

function buildMapFallbackUrl(location) {
  const point = normalizeLocation(location);
  if (!point?.latitude || !point?.longitude) {
    return '';
  }
  return `https://www.google.com/maps?q=${encodeURIComponent(`${point.latitude},${point.longitude}`)}&z=15&output=embed`;
}

function getUpcomingCount(payload) {
  const counts = payload?.counts || {};
  const explicitTotal = Number(counts.total);
  if (Number.isFinite(explicitTotal)) {
    return explicitTotal;
  }
  return asArray(payload?.scheduled_requests).length + asArray(payload?.assigned_rides).length;
}

function MetricTile({ label, value, compact = false }) {
  return (
    <View style={[styles.metricTile, compact && styles.metricTileCompact]}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function StatusPill({ accepting, syncing, tracking, onPress, disabled, userName, compact = false }) {
  const tone = syncing ? 'syncing' : accepting ? 'accepting' : 'paused';
  const colors = {
    accepting: {
      bg: '#E8F5E9',
      border: '#1B8A4B',
      text: '#0B5D2B',
      dot: '#1B8A4B',
    },
    paused: {
      bg: '#F7F7F7',
      border: '#8A8A8A',
      text: '#455A64',
      dot: '#7C8780',
    },
    syncing: {
      bg: '#FFF7E6',
      border: '#F9A825',
      text: '#8A5A00',
      dot: '#F9A825',
    },
  }[tone];

  return (
    <TouchableOpacity
      style={[
        styles.statusPill,
        compact && styles.statusPillCompact,
        { backgroundColor: colors.bg, borderColor: colors.border },
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.78}>
      <View style={[styles.statusDot, { backgroundColor: colors.dot }]} />
      <View style={styles.statusCopy}>
        <Text style={[styles.statusTitle, { color: colors.text }]}>
          {syncing ? 'SYNCING' : accepting ? 'ACCEPTING RIDES' : 'PAUSED'}
        </Text>
        <Text style={styles.statusHint} numberOfLines={compact ? 2 : undefined}>
          {userName || 'Driver'} - {accepting ? 'Tap to pause requests' : 'Tap to go online'}
          {tracking ? ' - tracking' : ''}
        </Text>
      </View>
      {syncing ? <ActivityIndicator size="small" color={colors.dot} /> : null}
    </TouchableOpacity>
  );
}

function EmptyState({ title, subtitle, actionLabel, onAction, loading }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyMark}>-</Text>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
      {actionLabel ? (
        <TouchableOpacity style={styles.emptyAction} onPress={onAction} disabled={loading}>
          <Text style={styles.emptyActionText}>{loading ? 'Please wait...' : actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function RequestCard({ request, loading, onAccept, onDecline }) {
  const pickup = getPickupLocation(request);
  const drop = getDropLocation(request);

  return (
    <View style={styles.requestCard}>
      <View style={styles.requestHeader}>
        <View style={styles.requestTitleBlock}>
          <Text style={styles.requestTitle}>{request?.passenger_name || 'Passenger'}</Text>
          <Text style={styles.requestId}>Request #{String(request?.id || '').slice(-6) || 'N/A'}</Text>
        </View>
        <View style={styles.requestBadges}>
          <Text style={styles.distanceBadge}>{formatDistance(request?.distance_km)}</Text>
          <Text style={styles.fareBadge}>{formatMoney(request?.estimated_fare ?? request?.fare)}</Text>
        </View>
      </View>

      <View style={styles.routeBlock}>
        <Text style={styles.routeLabel}>Pickup</Text>
        <Text style={styles.routeText}>{pickup?.address || 'Pickup location unavailable'}</Text>
        <Text style={styles.routeLabel}>Drop</Text>
        <Text style={styles.routeText}>{drop?.address || 'Drop location unavailable'}</Text>
      </View>

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.primaryAction, loading && styles.disabledAction]}
          onPress={() => onAccept(request?.id)}
          disabled={loading || !request?.id}>
          <Text style={styles.primaryActionText}>Accept</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.secondaryDangerAction, loading && styles.disabledAction]}
          onPress={() => onDecline(request?.id)}
          disabled={loading || !request?.id}>
          <Text style={styles.secondaryDangerText}>Decline</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ActiveRidePanel({
  ride,
  driverLocation,
  loading,
  rideStartOtp,
  rideEndOtp,
  onRideStartOtpChange,
  onRideEndOtpChange,
  onNextStatus,
  onCall,
  onMap,
  token,
  userId,
}) {
  const status = String(ride?.status || '').toLowerCase();
  const nextLabel = getNextActionLabel(status);
  const pickup = getPickupLocation(ride);
  const drop = getDropLocation(ride);

  return (
    <View style={styles.activeRidePanel}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionEyebrow}>Active ride</Text>
          <Text style={styles.sectionTitle}>{ride?.passenger_name || 'Passenger'}</Text>
        </View>
        <Text style={styles.statusBadge}>{formatStatus(status)}</Text>
      </View>

      <View style={styles.metricRow}>
        <MetricTile label="Fare" value={formatMoney(ride?.final_fare ?? ride?.estimated_fare ?? ride?.fare)} />
        <MetricTile label="Distance" value={formatDistance(ride?.distance_km)} />
        <MetricTile label="Ride ID" value={`#${String(ride?.id || '').slice(-6) || 'N/A'}`} />
      </View>

      <View style={styles.routeBlock}>
        <Text style={styles.routeLabel}>Pickup</Text>
        <Text style={styles.routeText}>{pickup?.address || 'Pickup location unavailable'}</Text>
        <Text style={styles.routeLabel}>Drop</Text>
        <Text style={styles.routeText}>{drop?.address || 'Drop location unavailable'}</Text>
        <Text style={styles.routeLabel}>Your location</Text>
        <Text style={styles.routeText}>{driverLocation?.address || 'Driver location syncing'}</Text>
      </View>

      {status === 'driver_arrived' ? (
        <View style={styles.otpBlock}>
          <Text style={styles.inputLabel}>Passenger start OTP</Text>
          <TextInput
            value={rideStartOtp}
            onChangeText={onRideStartOtpChange}
            keyboardType="number-pad"
            placeholder="0000"
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
            maxLength={8}
          />
        </View>
      ) : null}

      {status === 'in_progress' ? (
        <View style={styles.otpBlock}>
          <Text style={styles.inputLabel}>Completion OTP optional</Text>
          <TextInput
            value={rideEndOtp}
            onChangeText={onRideEndOtpChange}
            keyboardType="number-pad"
            placeholder="0000"
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
            maxLength={8}
          />
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.secondaryAction} onPress={onCall} disabled={loading}>
          <Text style={styles.secondaryActionText}>Call</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryAction} onPress={onMap} disabled={loading}>
          <Text style={styles.secondaryActionText}>Map</Text>
        </TouchableOpacity>
        {nextLabel ? (
          <TouchableOpacity
            style={[styles.primaryAction, loading && styles.disabledAction]}
            onPress={onNextStatus}
            disabled={loading}>
            <Text style={styles.primaryActionText}>{nextLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <RideCommunicationCard
        token={token}
        booking={ride}
        currentUserId={userId}
        counterpartName={ride?.passenger_name || 'Passenger'}
      />
    </View>
  );
}

export default function DriverCommandPage({
  token,
  user,
  onLogout,
  onProfilePress = undefined,
}) {
  const { width } = useWindowDimensions();
  const socketRef = useRef(null);
  const refreshInFlightRef = useRef(false);
  const locationWatchIdRef = useRef(null);
  const activeRideIdRef = useRef(null);
  const driverPollCooldownUntilRef = useRef(0);
  const locationSyncCooldownUntilRef = useRef(0);
  const lastRateLimitNoticeAtRef = useRef(0);
  const lastLocationPauseNoticeAtRef = useRef(0);
  const [activeTab, setActiveTab] = useState('requests');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [isAccepting, setIsAccepting] = useState(false);
  const [trackingOnline, setTrackingOnline] = useState(false);
  const [driverLocation, setDriverLocation] = useState(null);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [activeRide, setActiveRide] = useState(null);
  const [upcomingRides, setUpcomingRides] = useState(EMPTY_UPCOMING);
  const [earnings, setEarnings] = useState(null);
  const [pricingRules, setPricingRules] = useState(null);
  const [driverFareConfig, setDriverFareConfig] = useState(null);
  const [menuBadges, setMenuBadges] = useState({});
  const [blockedPassengers, setBlockedPassengers] = useState([]);
  const [blockedPassengerSearch, setBlockedPassengerSearch] = useState('');
  const [rideStartOtp, setRideStartOtp] = useState('');
  const [rideEndOtp, setRideEndOtp] = useState('');
  const [spinWinStatus, setSpinWinStatus] = useState(null);
  const [spinWinLoading, setSpinWinLoading] = useState(false);
  const [spinningNow, setSpinningNow] = useState(false);

  const activeRideId = String(activeRide?.id || '').trim();
  const activeRideStatus = String(activeRide?.status || '').toLowerCase();
  const displayIsAccepting = isAccepting || Boolean(activeRideId);
  const googleMapsWebKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
  const compactLayout = width < 760;
  const keralaSafety = useKeralaSafety({
    token,
    userName: user?.name,
    activeBooking: activeRide,
  });
  const visibleBlockedPassengers = useMemo(
    () => filterBlockedPassengers(blockedPassengers, blockedPassengerSearch),
    [blockedPassengerSearch, blockedPassengers],
  );
  const passengerSafetyTarget = useMemo(() => {
    const upcomingCandidates = [
      ...asArray(upcomingRides?.scheduled_requests),
      ...asArray(upcomingRides?.assigned_rides),
    ];
    const candidate = [activeRide, ...asArray(pendingRequests), ...upcomingCandidates].find(
      (item) => String(item?.passenger_id || item?.passenger?.id || '').trim(),
    );
    if (!candidate) {
      return null;
    }
    const passengerId = String(candidate.passenger_id || candidate.passenger?.id || '').trim();
    return {
      id: passengerId,
      name: String(candidate.passenger_name || candidate.passenger?.name || 'Passenger'),
      rideId: String(candidate.id || candidate.booking_id || ''),
    };
  }, [activeRide, pendingRequests, upcomingRides]);

  useEffect(() => {
    activeRideIdRef.current = activeRideId;
  }, [activeRideId]);

  const applyAvailabilitySnapshot = useCallback((payload, fallback = false) => {
    const next = readDriverAccepting(payload, fallback);
    setIsAccepting(next);
    return next;
  }, []);

  const safeRequest = useCallback(
    async (path, fallbackValue, options = {}) => {
      try {
        return await apiRequest(path, { token, ...options });
      } catch (err) {
        const cooldownMs = getDriverCommandCooldownMs(err);
        if (cooldownMs > 0) {
          const now = Date.now();
          driverPollCooldownUntilRef.current = Math.max(
            driverPollCooldownUntilRef.current,
            now + cooldownMs,
          );
          if (Number(err?.status || 0) === 429 && now - lastRateLimitNoticeAtRef.current > 15000) {
            setMessage(`Server is busy. Slowing driver sync for ${Math.ceil(cooldownMs / 1000)} seconds.`);
            lastRateLimitNoticeAtRef.current = now;
          }
        }
        return fallbackValue;
      }
    },
    [token],
  );

  const pushDriverLocation = useCallback(
    async (location) => {
      const now = Date.now();
      if (now < locationSyncCooldownUntilRef.current) {
        return null;
      }

      const normalized = normalizeLocation(location);
      const body = toDriverLocationApiBody({
        ...(normalized || {}),
        ride_id: activeRideIdRef.current || null,
        booking_id: activeRideIdRef.current || null,
      });
      if (!body) {
        return null;
      }

      try {
        const payload = await apiRequest('/drivers/location', {
          method: 'POST',
          token,
          timeoutMs: 8000,
          body: {
            ...body,
            booking_id: activeRideIdRef.current || undefined,
          },
        });
        setTrackingOnline(true);
        setDriverLocation({
          ...normalized,
          timestamp: new Date().toISOString(),
          is_live_location: true,
        });
        return payload;
      } catch (err) {
        const cooldownMs = getDriverCommandCooldownMs(err);
        if (cooldownMs > 0) {
          const pausedUntil = Date.now() + cooldownMs;
          locationSyncCooldownUntilRef.current = Math.max(locationSyncCooldownUntilRef.current, pausedUntil);
          driverPollCooldownUntilRef.current = Math.max(driverPollCooldownUntilRef.current, pausedUntil);
          if (Number(err?.status || 0) === 429 && Date.now() - lastLocationPauseNoticeAtRef.current > 15000) {
            setMessage(`Server is busy. Live location sync will retry in ${Math.ceil(cooldownMs / 1000)} seconds.`);
            lastLocationPauseNoticeAtRef.current = Date.now();
          }
        }
        return null;
      }
    },
    [token],
  );

  const handlePosition = useCallback(
    (position) => {
      const coords = position?.coords || {};
      const latitude = toNumber(coords.latitude);
      const longitude = toNumber(coords.longitude);
      if (latitude === null || longitude === null) {
        return;
      }
      const nextLocation = {
        latitude,
        longitude,
        accuracy: toNumber(coords.accuracy),
        speed: toNumber(coords.speed),
        timestamp: new Date(position.timestamp || Date.now()).toISOString(),
        address: 'Live location',
        is_live_location: true,
      };
      setDriverLocation(nextLocation);
      setTrackingOnline(true);
      pushDriverLocation(nextLocation).catch(() => null);
    },
    [pushDriverLocation],
  );

  const stopLocationTracking = useCallback(() => {
    if (
      typeof navigator !== 'undefined' &&
      navigator.geolocation &&
      locationWatchIdRef.current !== null
    ) {
      navigator.geolocation.clearWatch(locationWatchIdRef.current);
    }
    locationWatchIdRef.current = null;
    setTrackingOnline(false);
  }, []);

  const startLocationTracking = useCallback(async () => {
    if (!isWebGeolocationAvailable()) {
      if (hasUsableLocation(driverLocation)) {
        setTrackingOnline(true);
      }
      setError('Current location is not supported in this browser or webview.');
      return;
    }

    if (locationWatchIdRef.current !== null) {
      return;
    }

    try {
      const currentPosition = await requestWebCurrentPosition({
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      });
      handlePosition(currentPosition);
    } catch (err) {
      if (hasUsableLocation(driverLocation)) {
        setTrackingOnline(true);
      }
      setError(formatWebGeolocationError(err, 'Location permission is required to receive ride requests.'));
      return;
    }

    locationWatchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      (watchError) => {
        if (Number(watchError?.code) === 1) {
          setError(formatWebGeolocationError(watchError, 'Location permission is required to receive ride requests.'));
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  }, [driverLocation, handlePosition]);

  const refreshDriverData = useCallback(
    async ({ silent = false, force = false } = {}) => {
      if (!force && silent && Date.now() < driverPollCooldownUntilRef.current) {
        return;
      }
      if (refreshInFlightRef.current) {
        return;
      }
      refreshInFlightRef.current = true;
      if (!silent) {
        setRefreshing(true);
      }
      try {
        const [
          profile,
          availability,
          requests,
          active,
          upcoming,
          earningsSummary,
          pricing,
          fareCalc,
          badges,
          blockedPassengersPayload,
          spinStatusPayload,
        ] = await Promise.all([
          safeRequest('/drivers/profile', null),
          safeRequest('/drivers/availability', null),
          safeRequest('/drivers/pending-requests', []),
          safeRequest('/drivers/active-ride', null),
          safeRequest('/drivers/upcoming-rides', EMPTY_UPCOMING),
          safeRequest('/drivers/earnings', null),
          safeRequest('/pricing/rules', null),
          safeRequest('/drivers/fare-calculator', null),
          safeRequest('/drivers/menu-badges', {}),
          safeRequest('/drivers/blocked-passengers', { passenger_ids: [], passengers: [] }),
          safeRequest('/spin-win/config', null),
        ]);

        if (availability) {
          applyAvailabilitySnapshot(availability, false);
        } else if (profile) {
          applyAvailabilitySnapshot(profile, false);
        }

        const profileLocation = normalizeLocation(profile?.current_location);
        if (profileLocation) {
          setDriverLocation((current) => current || profileLocation);
        }

        setPendingRequests(unwrapArray(requests, ['requests', 'pending_requests', 'bookings']));
        setActiveRide(getActiveRideFromPayload(active));
        setUpcomingRides(upcoming || EMPTY_UPCOMING);
        setEarnings(earningsSummary || null);
        setPricingRules(pricing || fareCalc?.default_pricing || fareCalc?.effective_pricing || null);
        setDriverFareConfig(fareCalc?.request?.payload || fareCalc?.effective_pricing || null);
        setMenuBadges(badges || {});
        setBlockedPassengers(normalizeBlockedPassengerRows(blockedPassengersPayload));
        setSpinWinStatus(spinStatusPayload || null);
        if (!silent) {
          setMessage('Driver page refreshed.');
        }
      } finally {
        refreshInFlightRef.current = false;
        setRefreshing(false);
      }
    },
    [applyAvailabilitySnapshot, safeRequest],
  );

  const refreshFromRealtime = useCallback(() => {
    refreshDriverData({ silent: true }).catch(() => null);
  }, [refreshDriverData]);

  useDriverRideQueueSocket({
    token,
    socketRef,
    refreshDriverRideQueueFromRealtime: refreshFromRealtime,
    onSocketError: () => setMessage('Live updates reconnecting.'),
    activeRideId,
    heartbeatEnabled: displayIsAccepting,
  });

  useEffect(() => {
    let cancelled = false;
    const initialRefresh = setTimeout(() => {
      refreshDriverData({ silent: true }).catch((err) => {
        if (!cancelled) {
          setError(getAvailabilityErrorMessage(err));
        }
      });
    }, 0);
    const timer = setInterval(() => {
      refreshDriverData({ silent: true }).catch(() => null);
    }, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearTimeout(initialRefresh);
      clearInterval(timer);
      stopLocationTracking();
    };
  }, [refreshDriverData, stopLocationTracking]);

  useEffect(() => {
    if (isAccepting || activeRideId) {
      const timer = setTimeout(() => {
        startLocationTracking();
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [activeRideId, isAccepting, startLocationTracking]);

  const runAction = useCallback(async (action, successMessage = '') => {
    setLoading(true);
    setError('');
    try {
      const result = await action();
      if (successMessage) {
        setMessage(successMessage);
      }
      return result;
    } catch (err) {
      setError(getAvailabilityErrorMessage(err));
      setMessage('');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleOnlineStatus = useCallback(async () => {
    if (availabilityLoading || loading) {
      return;
    }

    const next = !displayIsAccepting;
    setAvailabilityLoading(true);
    setError('');
    setMessage(next ? 'Going online...' : 'Pausing requests...');
    setIsAccepting(next);

    try {
      if (next) {
        const readiness = await apiRequest('/drivers/readiness', { token, timeoutMs: 8000 });
        if (!isDriverReadyToDrive(readiness)) {
          setIsAccepting(false);
          setError(formatDriverReadinessMessage(readiness));
          setMessage('');
          return;
        }
      }

      const response = await apiRequest('/drivers/availability', {
        method: 'PUT',
        token,
        timeoutMs: 10000,
        body: { is_available: next },
      });
      const snapshot = await safeRequest('/drivers/availability', response);
      const confirmed = readDriverAccepting(snapshot, next);
      setIsAccepting(confirmed);

      if (confirmed) {
        startLocationTracking();
      } else {
        stopLocationTracking();
      }

      setMessage(confirmed ? 'Accepting ride requests.' : 'Paused new requests.');
      await refreshDriverData({ silent: true });
    } catch (err) {
      setIsAccepting(!next);
      setError(getAvailabilityErrorMessage(err));
      setMessage('');
    } finally {
      setAvailabilityLoading(false);
    }
  }, [
    availabilityLoading,
    displayIsAccepting,
    loading,
    refreshDriverData,
    safeRequest,
    startLocationTracking,
    stopLocationTracking,
    token,
  ]);

  const acceptRequest = useCallback(
    async (bookingId) => {
      if (!bookingId) {
        return;
      }
      driverPollCooldownUntilRef.current = Math.max(
        driverPollCooldownUntilRef.current,
        Date.now() + DRIVER_ACTION_REFRESH_PAUSE_MS,
      );
      const accepted = await runAction(
        () => apiRequest(`/bookings/${bookingId}/accept`, { method: 'PUT', token }),
        'Ride accepted.',
      );
      if (!accepted) {
        return;
      }
      setPendingRequests((current) => current.filter((item) => item?.id !== bookingId));
      setIsAccepting(true);
      startLocationTracking();
      await refreshDriverData({ silent: true, force: true });
    },
    [refreshDriverData, runAction, startLocationTracking, token],
  );

  const rejectRequest = useCallback(
    async (bookingId) => {
      if (!bookingId) {
        return;
      }
      driverPollCooldownUntilRef.current = Math.max(
        driverPollCooldownUntilRef.current,
        Date.now() + DRIVER_ACTION_REFRESH_PAUSE_MS,
      );
      const rejected = await runAction(
        () => apiRequest(`/bookings/${bookingId}/reject`, { method: 'PUT', token }),
        'Ride request declined.',
      );
      if (rejected) {
        setPendingRequests((current) => current.filter((item) => item?.id !== bookingId));
        await refreshDriverData({ silent: true, force: true });
      }
    },
    [refreshDriverData, runAction, token],
  );

  const moveRideToNextStatus = useCallback(async () => {
    if (!activeRideId) {
      return;
    }
    const nextStatus = getNextRideStatus(activeRideStatus);
    if (!nextStatus) {
      return;
    }

    const startOtp = String(rideStartOtp || '').trim();
    const endOtp = String(rideEndOtp || '').trim();
    if (nextStatus === 'in_progress' && !startOtp) {
      setError('Enter passenger OTP to start trip.');
      return;
    }

    const body =
      nextStatus === 'in_progress'
        ? { status: nextStatus, ride_start_otp: startOtp }
        : nextStatus === 'completed' && endOtp
          ? { status: nextStatus, ride_end_otp: endOtp }
          : nextStatus === 'completed'
            ? {
                status: nextStatus,
                allow_complete_without_otp: true,
                complete_without_otp_reason: 'passenger_unavailable',
              }
            : { status: nextStatus };

    const updated = await runAction(
      () => apiRequest(`/bookings/${activeRideId}/status`, { method: 'PUT', token, body }),
      nextStatus === 'completed' ? 'Ride completed.' : 'Ride status updated.',
    );
    if (!updated) {
      return;
    }
    setRideStartOtp('');
    setRideEndOtp('');
    await refreshDriverData({ silent: true });
  }, [activeRideId, activeRideStatus, refreshDriverData, rideEndOtp, rideStartOtp, runAction, token]);

  const openActiveRideMap = useCallback(() => {
    const navigation = getRideNavigationTarget({
      ride: activeRide,
      status: activeRideStatus,
      normalizeLocation,
    });
    const url = buildGoogleMapsDirectionsUrl({
      origin: normalizeLocation(driverLocation),
      destination: navigation.destination,
    });
    if (url && typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [activeRide, activeRideStatus, driverLocation]);

  const openActiveRideCall = useCallback(async () => {
    if (!activeRideId) {
      return;
    }
    const payload = await runAction(() => apiRequest(`/bookings/${activeRideId}/call-room`, { token }));
    const roomUrl = String(payload?.room_url || '').trim();
    if (roomUrl) {
      if (typeof window !== 'undefined' && typeof window.open === 'function') {
        window.open(roomUrl, '_blank', 'noopener,noreferrer');
      }
      return;
    }
    const phone = String(activeRide?.passenger_phone || '').trim();
    if (phone) {
      Linking.openURL(`tel:${phone}`).catch(() => null);
    }
  }, [activeRide?.passenger_phone, activeRideId, runAction, token]);

  const requestDriverEarningsReport = useCallback(async () => {
    const report = await runAction(
      () => apiRequest('/drivers/earnings/report', { method: 'POST', token }),
      'Driver earnings report generated.',
    );
    if (report?.report) {
      setMessage(`Report ready: ${formatMoney(report.report.total_earnings)} across ${Number(report.report.total_rides || 0)} rides.`);
    }
  }, [runAction, token]);

  const requestDriverWithdrawal = useCallback(
    async (amount, method = 'bank_transfer') => {
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
        'Withdrawal request submitted.',
      );
      if (result) {
        await refreshDriverData({ silent: true });
      }
    },
    [refreshDriverData, runAction, token],
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

  const spinNow = useCallback(async () => {
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
  }, [refreshSpinWinStatus, spinningNow, token]);

  const toggleBlockedPassenger = useCallback(
    async (passengerId, isBlocked) => {
      const normalizedPassengerId = String(passengerId || '').trim();
      if (!normalizedPassengerId) {
        return;
      }
      const done = await runAction(
        () =>
          apiRequest(`/drivers/blocked-passengers/${normalizedPassengerId}`, {
            method: 'PUT',
            token,
            body: { is_blocked: !isBlocked },
          }),
        isBlocked ? 'Passenger unblocked.' : 'Passenger blocked.',
      );
      if (done) {
        await refreshDriverData({ silent: true });
      }
    },
    [refreshDriverData, runAction, token],
  );

  const resumeScheduledRide = useCallback((ride) => {
    if (ride?.id) {
      setActiveRide(ride);
      setActiveTab('requests');
    }
  }, []);

  const cancelScheduledRide = useCallback(
    async (ride) => {
      const rideId = String(ride?.id || '').trim();
      if (!rideId) {
        return;
      }
      const cancelled = await runAction(
        () => apiRequest(`/bookings/${rideId}/cancel`, { method: 'PUT', token }),
        'Scheduled ride cancelled.',
      );
      if (cancelled) {
        await refreshDriverData({ silent: true });
      }
    },
    [refreshDriverData, runAction, token],
  );

  const openScheduledRideNavigation = useCallback((ride) => {
    const navigation = getRideNavigationTarget({
      ride,
      status: ride?.status,
      normalizeLocation,
    });
    const url = buildGoogleMapsDirectionsUrl({
      origin: normalizeLocation(driverLocation),
      destination: navigation.destination,
    });
    if (url && typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [driverLocation]);

  const callScheduledPassenger = useCallback(
    async (ride) => {
      const rideId = String(ride?.id || '').trim();
      if (!rideId) {
        return;
      }
      const payload = await runAction(() => apiRequest(`/bookings/${rideId}/call-room`, { token }));
      const roomUrl = String(payload?.room_url || '').trim();
      if (roomUrl && typeof window !== 'undefined' && typeof window.open === 'function') {
        window.open(roomUrl, '_blank', 'noopener,noreferrer');
      }
    },
    [runAction, token],
  );

  const openDemandHotspotNavigation = useCallback((hotspot) => {
    const destination = normalizeLocation(hotspot);
    const url = buildGoogleMapsDirectionsUrl({
      origin: normalizeLocation(driverLocation),
      destination,
    });
    if (url && typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
    setMessage(`Navigation opened to ${String(hotspot?.name || 'demand hotspot')}.`);
  }, [driverLocation]);

  const handleTrafficRouteChange = useCallback((route) => {
    setMessage(`Route selected: ${String(route?.name || 'recommended route')}.`);
  }, []);

  const handleQuickActionPress = useCallback(
    (action) => {
      runDriverQuickAction(action, {
        isOnline: displayIsAccepting,
        hasActiveRide: Boolean(activeRideId),
        setError,
        setMessage,
        goOnline: () => toggleOnlineStatus().catch(() => null),
        openRequests: () => setActiveTab('requests'),
        resumeActiveRide: () => {
          setActiveTab('requests');
          setMessage('Active ride controls opened.');
        },
        navigateActiveRide: openActiveRideMap,
        callPassenger: () => openActiveRideCall().catch(() => null),
        activateSos: () => {
          setActiveTab('safety');
          if (typeof keralaSafety?.activateSos === 'function') {
            keralaSafety.activateSos('Driver quick action SOS', 'driver_quick_action').catch(() => null);
          } else {
            setMessage('Safety card opened.');
          }
        },
        contactSupport: () => {
          setActiveTab('support');
          setMessage('Support ticket form opened.');
        },
        withdrawEarnings: () => {
          setActiveTab('earnings');
          setMessage('Open Earnings to submit a withdrawal request.');
        },
        earningsReport: () => requestDriverEarningsReport().catch(() => null),
        openTab: setActiveTab,
      });
    },
    [
      activeRideId,
      displayIsAccepting,
      keralaSafety,
      openActiveRideCall,
      openActiveRideMap,
      requestDriverEarningsReport,
      toggleOnlineStatus,
    ],
  );

  const activeRideNavigation = useMemo(
    () =>
      getRideNavigationTarget({
        ride: activeRide,
        status: activeRideStatus,
        normalizeLocation,
      }),
    [activeRide, activeRideStatus],
  );
  const rideMode = useMemo(() => getRideStatusMode(activeRideStatus), [activeRideStatus]);
  const mapDestination = rideMode.navigatingToDrop
    ? activeRideNavigation.drop
    : activeRideNavigation.pickup || activeRideNavigation.drop;
  const mapCenter = normalizeLocation(driverLocation) || mapDestination || DEFAULT_CENTER;
  const fallbackUrl = buildMapFallbackUrl(mapCenter);

  const renderRequestsTab = () => {
    if (activeRide) {
      return (
        <ActiveRidePanel
          ride={activeRide}
          driverLocation={driverLocation}
          loading={loading}
          rideStartOtp={rideStartOtp}
          rideEndOtp={rideEndOtp}
          onRideStartOtpChange={setRideStartOtp}
          onRideEndOtpChange={setRideEndOtp}
          onNextStatus={moveRideToNextStatus}
          onCall={openActiveRideCall}
          onMap={openActiveRideMap}
          token={token}
          userId={user?.id}
        />
      );
    }

    if (!displayIsAccepting) {
      return (
        <EmptyState
          title="Paused new requests"
          subtitle="Go online to accept nearby ride requests."
          actionLabel="Go Online"
          onAction={toggleOnlineStatus}
          loading={availabilityLoading}
        />
      );
    }

    if (pendingRequests.length === 0) {
      return (
        <EmptyState
          title="Ready for ride requests"
          subtitle="You are accepting rides. New bookings will appear here."
          actionLabel="Refresh"
          onAction={() => refreshDriverData()}
          loading={refreshing}
        />
      );
    }

    return (
      <View style={styles.requestList}>
        {pendingRequests.map((request, index) => (
          <RequestCard
            key={String(request?.id || `request-${index}`)}
            request={request}
            loading={loading}
            onAccept={acceptRequest}
            onDecline={rejectRequest}
          />
        ))}
      </View>
    );
  };

  const renderEarningsTab = () => (
    <EarningsPanel
      earnings={earnings}
      pricingRules={pricingRules}
      driverFareConfig={driverFareConfig}
      loading={loading}
      onRequestReport={requestDriverEarningsReport}
      onRequestWithdraw={requestDriverWithdrawal}
      onManageBankDetails={() => setActiveTab('profile')}
    />
  );

  const refreshDriverMenuBadges = useCallback(
    () => refreshDriverData({ silent: true }).catch(() => null),
    [refreshDriverData],
  );

  const renderLinkedToolPanel = ({ title, description, primaryTab = 'requests', primaryLabel = 'Ride Flow' }) => (
    <View style={styles.simplePanel}>
      <Text style={styles.simpleTitle}>{title}</Text>
      <Text style={styles.simpleText}>{description}</Text>
      <View style={styles.actionRow}>
        <TouchableOpacity style={styles.secondaryAction} onPress={() => setActiveTab(primaryTab)}>
          <Text style={styles.secondaryActionText}>{primaryLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryAction} onPress={() => setActiveTab('support')}>
          <Text style={styles.secondaryActionText}>Support</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderBlockedPassengersTab = () => (
    <View style={styles.simplePanel}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionEyebrow}>Safety</Text>
          <Text style={styles.sectionTitle}>Blocked Passengers</Text>
        </View>
        <TouchableOpacity style={styles.secondaryAction} onPress={() => refreshDriverData()} disabled={refreshing}>
          <Text style={styles.secondaryActionText}>{refreshing ? 'Refreshing...' : 'Refresh'}</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.input}
        value={blockedPassengerSearch}
        onChangeText={setBlockedPassengerSearch}
        placeholder="Search name, phone, reason, or ride"
        placeholderTextColor={COLORS.textMuted}
      />
      {blockedPassengers.length === 0 ? (
        <Text style={styles.simpleText}>No blocked passengers.</Text>
      ) : visibleBlockedPassengers.length === 0 ? (
        <Text style={styles.simpleText}>No blocked passengers match your search.</Text>
      ) : (
        <View style={styles.blockedPassengerList}>
          {visibleBlockedPassengers.map((blockedPassenger) => {
            const fareValue = Number(blockedPassenger.estimated_fare);
            return (
              <View key={blockedPassenger.passenger_id} style={styles.blockedPassengerCard}>
                <View style={styles.blockedPassengerHeader}>
                  <View style={styles.blockedPassengerTitleBlock}>
                    <Text style={styles.blockedPassengerName}>{blockedPassenger.passenger_name}</Text>
                    <Text style={styles.blockedPassengerMeta}>ID: {blockedPassenger.passenger_id}</Text>
                    {!!blockedPassenger.passenger_phone && (
                      <Text style={styles.blockedPassengerMeta}>Phone: {blockedPassenger.passenger_phone}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={styles.secondaryDangerAction}
                    onPress={() => toggleBlockedPassenger(blockedPassenger.passenger_id, true)}
                    disabled={loading}>
                    <Text style={styles.secondaryDangerText}>Unblock</Text>
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
                  <Text style={styles.blockedContextText}>Status: {blockedPassenger.last_booking_status}</Text>
                )}
                {Number.isFinite(fareValue) && (
                  <Text style={styles.blockedContextText}>Fare: Rs. {fareValue.toFixed(2)}</Text>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );

  const renderPassengerSafetyTab = () => {
    if (!passengerSafetyTarget?.id) {
      return (
        <View style={styles.simplePanel}>
          <Text style={styles.simpleTitle}>Passenger Safety</Text>
          <Text style={styles.simpleText}>
            Passenger safety ratings appear when you have an active ride, a pending request, or an upcoming passenger.
          </Text>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.secondaryAction} onPress={() => setActiveTab('requests')}>
              <Text style={styles.secondaryActionText}>Ride Flow</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryAction} onPress={() => refreshDriverData()}>
              <Text style={styles.secondaryActionText}>Refresh</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.stackedPanels}>
        <View style={styles.simplePanel}>
          <Text style={styles.simpleTitle}>Passenger Safety</Text>
          <Text style={styles.simpleText}>
            Reviewing {passengerSafetyTarget.name}
            {passengerSafetyTarget.rideId ? ` for ride #${passengerSafetyTarget.rideId.slice(-6)}` : ''}.
          </Text>
        </View>
        <PassengerSafetyRatingsPanel passengerId={passengerSafetyTarget.id} disabled={loading} />
      </View>
    );
  };

  const renderSpinWinTab = () => {
    const spinEnabled = Boolean(spinWinStatus?.enabled ?? spinWinStatus?.is_enabled);
    const spinEligible = Boolean(spinWinStatus?.eligible ?? spinWinStatus?.is_eligible);
    const spinsLeft = Number(spinWinStatus?.spins_left_today ?? spinWinStatus?.spinsLeftToday ?? 0);
    const dailyLimit = Number(
      spinWinStatus?.daily_spin_limit ??
        spinWinStatus?.dailySpinLimit ??
        spinWinStatus?.max_spins_per_day ??
        0,
    );
    const spinsUsed = Number(spinWinStatus?.spins_used_today ?? spinWinStatus?.spinsUsedToday ?? 0);
    const spinDisabled = loading || spinWinLoading || spinningNow || !spinEligible || spinsLeft <= 0;

    return (
      <View style={styles.simplePanel}>
        <Text style={styles.simpleTitle}>Spin & Win</Text>
        <Text style={styles.simpleText}>
          Status: {spinWinLoading ? 'Loading...' : spinWinStatus ? (spinEnabled ? 'Enabled' : 'Disabled') : 'Unavailable'}
        </Text>
        <Text style={styles.simpleText}>
          Daily limit: {dailyLimit} | Used: {spinsUsed} | Left: {spinsLeft}
        </Text>
        {!!spinWinStatus?.eligibility_reason && (
          <Text style={styles.simpleText}>{spinWinStatus.eligibility_reason}</Text>
        )}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.primaryAction, spinDisabled && styles.disabledAction]}
            onPress={spinNow}
            disabled={spinDisabled}>
            <Text style={styles.primaryActionText}>{spinningNow ? 'Spinning...' : 'Spin Now'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryAction, spinWinLoading && styles.disabledAction]}
            onPress={() => refreshSpinWinStatus({ silent: false })}
            disabled={spinWinLoading}>
            <Text style={styles.secondaryActionText}>{spinWinLoading ? 'Refreshing...' : 'Refresh'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderQuickActionsTab = () => (
    <View style={styles.simplePanel}>
      <Text style={styles.simpleTitle}>Quick Actions</Text>
      <View style={styles.actionRow}>
        {DRIVER_QUICK_ACTIONS.map((action) => (
          <TouchableOpacity
            key={action.key}
            style={styles.secondaryAction}
            onPress={() => handleQuickActionPress(action)}>
            <Text style={styles.secondaryActionText}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'requests':
        return renderRequestsTab();
      case 'upcoming':
        return (
          <ScheduledRidesPanel
            upcomingRides={upcomingRides}
            loading={loading}
            onAcceptRequest={acceptRequest}
            onRejectRequest={rejectRequest}
            onResumeRide={resumeScheduledRide}
            onNavigateRide={openScheduledRideNavigation}
            onCallPassenger={callScheduledPassenger}
            onCancelRide={cancelScheduledRide}
            onOpenSupport={() => setActiveTab('support')}
            onRefresh={() => refreshDriverData()}
          />
        );
      case 'earnings':
        return renderEarningsTab();
      case 'support':
        return <SupportTicketPanel token={token} loading={loading} initialAction="help" onDataChanged={refreshDriverMenuBadges} />;
      case 'profile':
        return <ProfileManagementPanel token={token} loading={loading} />;
      case 'documents':
        return <DocumentUploadPanel token={token} loading={loading} onDataChanged={refreshDriverMenuBadges} />;
      case 'vehicle':
        return <VehicleManagementPanel token={token} loading={loading} />;
      case 'trust':
        return (
          <View style={styles.stackedPanels}>
            <DriverKycPanel token={token} onDataChanged={refreshDriverMenuBadges} />
            <DriverTrustCard token={token} />
          </View>
        );
      case 'subscription':
        return <SubscriptionPanel token={token} audience="driver" />;
      case 'history':
        return (
          <RideHistoryPanel
            token={token}
            viewerRole="driver"
            onSupportRequested={(booking) => {
              setActiveTab('support');
              setMessage(`Support opened for booking ${String(booking?.id || '').slice(0, 12) || 'ride'}.`);
            }}
          />
        );
      case 'notifications':
        return (
          <NotificationCenter
            token={token}
            onClose={() => setActiveTab('requests')}
            onNotificationPress={(notification) => {
              const target = String(notification?.screen || notification?.target || notification?.type || '').toLowerCase();
              if (target.includes('earning')) {
                setActiveTab('earnings');
              } else if (target.includes('support')) {
                setActiveTab('support');
              } else if (target.includes('document')) {
                setActiveTab('documents');
              }
            }}
          />
        );
      case 'fare':
        return (
          <View style={styles.stackedPanels}>
            <DriverFareDisplay />
            <DriverFareProposal />
          </View>
        );
      case 'analytics':
        return (
          <AnalyticsDashboardAdvanced
            driverId={user?.id}
            token={token}
            currentMetrics={{
              totalRides: Number(earnings?.total_rides || earnings?.rides_completed || 0),
              todayEarnings: Number(earnings?.today_earnings || 0),
              walletBalance: Number(earnings?.wallet_balance || 0),
            }}
            historicalData={[]}
            isLoading={loading}
          />
        );
      case 'heatmap':
        return (
          <View style={styles.stackedPanels}>
            <View style={styles.simplePanel}>
              <Text style={styles.simpleTitle}>Demand Heatmap</Text>
              <Text style={styles.simpleText}>
                {normalizeLocation(driverLocation)
                  ? 'Showing high-demand areas near your current position.'
                  : 'Go online or refresh location to load nearby demand.'}
              </Text>
            </View>
            <DemandHeatmapIntegration
              currentLocation={normalizeLocation(driverLocation)}
              disabled={loading}
              onNavigateToHotspot={openDemandHotspotNavigation}
            />
          </View>
        );
      case 'traffic':
        return (
          <View style={styles.stackedPanels}>
            <View style={styles.simplePanel}>
              <Text style={styles.simpleTitle}>Traffic Alerts</Text>
              <Text style={styles.simpleText}>
                {mapDestination
                  ? 'Live route alerts are based on your current ride destination.'
                  : 'Accept or resume a ride to load route-specific traffic.'}
              </Text>
            </View>
            <TrafficAlerts
              currentLocation={normalizeLocation(driverLocation)}
              destinationLocation={mapDestination}
              disabled={loading}
              onRouteChange={handleTrafficRouteChange}
            />
          </View>
        );
      case 'reviews':
        return (
          <DriverReviewsPanel
            token={token}
            onAppealReview={(review) => {
              setActiveTab('support');
              setMessage(`Support opened for review ${String(review?.id || review?.booking_id || '').slice(0, 12) || 'ride'}.`);
            }}
          />
        );
      case 'blocked':
        return renderBlockedPassengersTab();
      case 'safety':
        return <KeralaSafetyCard safety={keralaSafety} />;
      case 'spin':
        return renderSpinWinTab();
      case 'filters':
        return (
          <RideFilterPanel
            isVisible
            onClose={() => setActiveTab('requests')}
            token={token}
            driverId={user?.id}
          />
        );
      case 'photoVerification':
        return (
          <DriverPhotoVerificationPanel
            driverId={user?.id}
            disabled={loading}
            onVerificationComplete={(result) => {
              setMessage(
                result?.status === 'VERIFIED'
                  ? 'Photo verification submitted.'
                  : 'Photo verification needs another attempt.',
              );
              refreshDriverMenuBadges();
            }}
          />
        );
      case 'passengerSafety':
        return renderPassengerSafetyTab();
      case 'tier':
        return <DriverTierBenefitsPanel token={token} onTierUpgrade={() => setActiveTab('subscription')} />;
      case 'expiry':
        return (
          <DocumentExpiryAlertsPanel
            token={token}
            onDocumentExpiring={(data) => {
              const critical = Number(data?.critical || 0);
              const warning = Number(data?.warning || 0);
              setMessage(`Document alerts: ${critical} critical, ${warning} warnings`);
            }}
          />
        );
      case 'appeals':
        return (
          <DriverSuspensionAppealPanel
            token={token}
            onAppealSubmitted={() => setMessage('Appeal submitted successfully. You will receive a response within 48 hours.')}
          />
        );
      case 'referral':
        return (
          <DriverReferralPanel
            token={token}
            driverId={user?.id}
            onReferralShare={(code) => setMessage(`Referral code ${code} shared successfully.`)}
          />
        );
      case 'pooling':
        return (
          <RidePoolingPanel
            isVisible
            onClose={() => setActiveTab('requests')}
            token={token}
            driverId={user?.id}
          />
        );
      case 'taxreports':
        return (
          <TaxReportWidget
            isVisible
            onClose={() => setActiveTab('earnings')}
            token={token}
            driverId={user?.id}
          />
        );
      case 'favorites':
        return (
          <FavoritePassengersPanel
            isVisible
            onClose={() => setActiveTab('requests')}
            token={token}
            driverId={user?.id}
          />
        );
      case 'shifts':
        return (
          <ShiftScheduleCalendar
            isVisible
            onClose={() => setActiveTab('earnings')}
            token={token}
            driverId={user?.id}
          />
        );
      case 'badges':
        return (
          <BadgesAchievementsWidget
            isVisible
            onClose={() => setActiveTab('earnings')}
            token={token}
            driverId={user?.id}
          />
        );
      case 'maintenance':
        return (
          <View style={styles.stackedPanels}>
            <VehicleManagementPanel token={token} loading={loading} />
            <DocumentExpiryAlertsPanel token={token} />
          </View>
        );
      case 'targets':
        return renderLinkedToolPanel({
          title: 'Earning Targets',
          description: 'Daily earnings, reports, and withdrawal actions are available from the Earnings tab.',
          primaryTab: 'earnings',
          primaryLabel: 'Open Earnings',
        });
      case 'payout':
      case 'paymethods':
        return renderLinkedToolPanel({
          title: formatStatus(activeTab),
          description: 'Manage payout details and withdrawals from Earnings or Profile.',
          primaryTab: 'earnings',
          primaryLabel: 'Open Earnings',
        });
      case 'actions':
        return renderQuickActionsTab();
      case 'settings':
        return (
          <EnhancedSettingsPanel
            token={token}
            loading={loading}
            displayIsOnline={displayIsAccepting}
            onToggleOnline={toggleOnlineStatus}
            onNavigateToTab={setActiveTab}
          />
        );
      default:
        return renderLinkedToolPanel({
          title: formatStatus(activeTab),
          description: 'This driver tool is connected to the live command center. Use Ride Flow for bookings or Support for help.',
        });
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, compactLayout && styles.scrollContentCompact]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={[styles.mapShell, compactLayout ? styles.mapShellCompact : styles.mapShellDesktop]}>
          <WebGoogleLiveMap
            apiKey={googleMapsWebKey}
            title="AutoBuddy driver map"
            fallbackUrl={fallbackUrl}
            mapStyle={styles.map}
            defaultCenter={mapCenter}
            pickupLocation={activeRideNavigation.pickup}
            dropoffLocation={activeRideNavigation.drop}
            driverLocation={driverLocation}
            routeOrigin={normalizeLocation(driverLocation)}
            routeDestination={mapDestination}
            showStatusOverlay={false}
          />
          <View style={[styles.mapOverlay, compactLayout && styles.mapOverlayCompact]} pointerEvents="none">
            <Text style={styles.mapTitle}>Live Driver Map</Text>
            <Text style={styles.mapSubtitle}>
              {displayIsAccepting ? 'Accepting ride requests.' : 'Paused new requests.'}
            </Text>
          </View>
        </View>

        <View style={[styles.mainPanel, compactLayout && styles.mainPanelCompact]}>
          <View style={[styles.topBar, compactLayout && styles.topBarCompact]}>
            <StatusPill
              accepting={displayIsAccepting}
              syncing={availabilityLoading}
              tracking={trackingOnline}
              onPress={toggleOnlineStatus}
              disabled={availabilityLoading || loading}
              userName={user?.name}
              compact={compactLayout}
            />
            <View style={[styles.topActions, compactLayout && styles.topActionsCompact]}>
              <TouchableOpacity
                style={[styles.topActionButton, compactLayout && styles.topActionButtonCompact]}
                onPress={() => refreshDriverData()}
                disabled={refreshing || loading}>
                <Text style={styles.topActionText}>{refreshing ? '...' : 'Refresh'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.topActionButton, compactLayout && styles.topActionButtonCompact]}
                onPress={onProfilePress || (() => setActiveTab('profile'))}>
                <Text style={styles.topActionText}>Profile</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.topActionButton, compactLayout && styles.topActionButtonCompact]}
                onPress={onLogout}>
                <Text style={styles.topActionText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.titleRow, compactLayout && styles.titleRowCompact]}>
            <View style={compactLayout && styles.titleBlockCompact}>
              <Text style={[styles.pageTitle, compactLayout && styles.pageTitleCompact]}>Driver Command Center</Text>
              <Text style={[styles.locationText, compactLayout && styles.locationTextCompact]} numberOfLines={compactLayout ? 2 : undefined}>
                {driverLocation?.address || 'Location not synced yet'}
                {trackingOnline ? ' - Tracking' : ''}
              </Text>
            </View>
            <View style={[styles.summaryTiles, compactLayout && styles.summaryTilesCompact]}>
              <MetricTile label="Requests" value={pendingRequests.length} compact={compactLayout} />
              <MetricTile label="Upcoming" value={getUpcomingCount(upcomingRides)} compact={compactLayout} />
              <MetricTile label="Today" value={formatMoney(earnings?.today_earnings)} compact={compactLayout} />
            </View>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {message && !error ? <Text style={styles.messageText}>{message}</Text> : null}
          {(loading || refreshing) && <ActivityIndicator color={COLORS.primary} style={styles.loader} />}

          <DriverTabBar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            requestCount={pendingRequests.length}
            upcomingCount={getUpcomingCount(upcomingRides)}
            notificationCount={0}
            menuBadges={menuBadges}
            isOnline={displayIsAccepting}
            statusLabel={displayIsAccepting ? 'ACCEPTING RIDES' : 'PAUSED'}
            statusSyncing={availabilityLoading}
          />

          <View style={[styles.tabPanel, compactLayout && styles.tabPanelCompact]}>{renderTabContent()}</View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 16,
  },
  scrollContentCompact: {
    padding: 8,
    gap: 10,
  },
  mapShell: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    overflow: 'hidden',
    position: 'relative',
    ...SHADOWS.card,
  },
  mapShellDesktop: {
    height: 280,
  },
  mapShellCompact: {
    height: 190,
    borderRadius: 8,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  mapOverlay: {
    position: 'absolute',
    left: 14,
    top: 14,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  mapOverlayCompact: {
    left: 8,
    top: 8,
    maxWidth: '76%',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  mapTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.textMain,
  },
  mapSubtitle: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
  },
  mainPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: 16,
    gap: 14,
    ...SHADOWS.card,
  },
  mainPanelCompact: {
    padding: 10,
    gap: 10,
  },
  topBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  topBarCompact: {
    alignItems: 'stretch',
  },
  topActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  topActionsCompact: {
    width: '100%',
    flexWrap: 'nowrap',
  },
  topActionButton: {
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
  },
  topActionButtonCompact: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
  },
  topActionText: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.textMain,
  },
  statusPill: {
    minHeight: 72,
    minWidth: 250,
    maxWidth: 360,
    borderRadius: 8,
    borderWidth: 2,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusPillCompact: {
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    minHeight: 66,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statusDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  statusCopy: {
    flex: 1,
    minWidth: 0,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  statusHint: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
  },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 14,
  },
  titleRowCompact: {
    flexDirection: 'column',
    gap: 10,
  },
  titleBlockCompact: {
    width: '100%',
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: COLORS.textMain,
  },
  pageTitleCompact: {
    fontSize: 24,
    lineHeight: 29,
  },
  locationText: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textMuted,
  },
  locationTextCompact: {
    fontSize: 13,
    lineHeight: 18,
  },
  summaryTiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryTilesCompact: {
    width: '100%',
    flexWrap: 'nowrap',
  },
  metricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricTile: {
    minWidth: 94,
    minHeight: 58,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.overlaySoft,
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  metricTileCompact: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
  },
  metricValue: {
    fontSize: 17,
    fontWeight: '900',
    color: COLORS.textMain,
    fontVariant: ['tabular-nums'],
  },
  metricLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.textMuted,
  },
  errorText: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: '800',
  },
  messageText: {
    color: COLORS.success,
    fontSize: 14,
    fontWeight: '800',
  },
  loader: {
    alignSelf: 'flex-start',
  },
  tabPanel: {
    minHeight: 280,
  },
  tabPanelCompact: {
    minHeight: 220,
  },
  stackedPanels: {
    gap: 14,
  },
  requestList: {
    gap: 12,
  },
  blockedPassengerList: {
    gap: 10,
  },
  blockedPassengerCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#FFFFFF',
    padding: 12,
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
    fontWeight: '700',
    marginTop: 2,
  },
  blockedReasonBox: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#F8FBF9',
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
    lineHeight: 19,
  },
  blockedContextText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 18,
  },
  requestCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: 14,
    gap: 12,
  },
  requestHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  requestTitleBlock: {
    flex: 1,
    minWidth: 180,
  },
  requestTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textMain,
  },
  requestId: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textMuted,
  },
  requestBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  distanceBadge: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F7D488',
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '900',
    color: '#8A5A00',
  },
  fareBadge: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A5D6A7',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.success,
  },
  routeBlock: {
    gap: 5,
  },
  routeLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  routeText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMain,
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  primaryAction: {
    minHeight: 44,
    minWidth: 132,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  secondaryAction: {
    minHeight: 44,
    minWidth: 112,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryActionText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '900',
  },
  secondaryDangerAction: {
    minHeight: 44,
    minWidth: 112,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.danger,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  secondaryDangerText: {
    color: COLORS.danger,
    fontSize: 14,
    fontWeight: '900',
  },
  disabledAction: {
    opacity: 0.6,
  },
  emptyState: {
    minHeight: 280,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  emptyMark: {
    fontSize: 36,
    fontWeight: '900',
    color: COLORS.textMain,
  },
  emptyTitle: {
    marginTop: 8,
    fontSize: 18,
    fontWeight: '900',
    color: COLORS.textMain,
    textAlign: 'center',
  },
  emptySubtitle: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMuted,
    textAlign: 'center',
  },
  emptyAction: {
    marginTop: 16,
    minHeight: 42,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  emptyActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  activeRidePanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: 14,
    gap: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionEyebrow: {
    fontSize: 11,
    fontWeight: '900',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  sectionTitle: {
    marginTop: 3,
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.textMain,
  },
  statusBadge: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A5D6A7',
    backgroundColor: '#E8F5E9',
    color: COLORS.success,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  otpBlock: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '900',
    color: COLORS.textMuted,
  },
  input: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textMain,
    backgroundColor: '#FFFFFF',
  },
  simplePanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    padding: 18,
    gap: 12,
  },
  simpleTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.textMain,
    textTransform: 'capitalize',
  },
  simpleText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMuted,
    lineHeight: 21,
  },
});
