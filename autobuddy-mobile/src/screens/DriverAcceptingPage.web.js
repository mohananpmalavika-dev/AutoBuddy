import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { apiRequest } from '../lib/api';
import {
  hasDriverAvailabilitySnapshot,
  readDriverAvailability,
  toDriverLocationApiBody,
} from '../lib/driverAvailabilityStatus';
import { COLORS, SHADOWS } from '../theme';

const POLL_INTERVAL_MS = 8000;
const ACTIVE_STATUSES = new Set(['accepted', 'driver_arrived', 'arrived', 'in_progress', 'started']);
const CLOSED_STATUSES = new Set(['completed', 'cancelled', 'canceled', 'rejected', 'declined']);

function asArray(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const candidates = [
    payload.pending_requests,
    payload.pendingRequests,
    payload.requests,
    payload.bookings,
    payload.rides,
    payload.data,
    payload.result,
    payload.items,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  return [];
}

function getRideId(ride) {
  return String(ride?.id || ride?._id || ride?.booking_id || ride?.bookingId || '').trim();
}

function normalizeRide(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }
  const ride = payload.booking || payload.ride || payload.active_ride || payload.activeRide || payload;
  return getRideId(ride) ? ride : null;
}

function normalizeActiveRide(payload) {
  if (Array.isArray(payload)) {
    return payload.map(normalizeRide).find(Boolean) || null;
  }
  return normalizeRide(payload);
}

function normalizeRequests(payload) {
  return asArray(payload)
    .map(normalizeRide)
    .filter(Boolean)
    .filter((ride) => !CLOSED_STATUSES.has(String(ride.status || '').toLowerCase()));
}

function normalizeLocation(location) {
  if (!location || typeof location !== 'object') {
    return null;
  }
  const latitude = Number(location.latitude ?? location.lat);
  const longitude = Number(location.longitude ?? location.lng ?? location.lon);
  const address = String(location.address || location.name || location.label || '').trim();
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return address ? { address } : null;
  }
  return {
    latitude: Number(latitude.toFixed(6)),
    longitude: Number(longitude.toFixed(6)),
    address: address || `Lat ${latitude.toFixed(5)}, Lng ${longitude.toFixed(5)}`,
  };
}

function getPickup(ride) {
  return normalizeLocation(
    ride?.pickup_location ||
      ride?.pickupLocation ||
      ride?.pickup ||
      ride?.pickup_location_details,
  );
}

function getDrop(ride) {
  return normalizeLocation(
    ride?.drop_location ||
      ride?.dropoff_location ||
      ride?.dropLocation ||
      ride?.dropoffLocation ||
      ride?.drop ||
      ride?.destination ||
      ride?.drop_location_details,
  );
}

function getPassengerName(ride) {
  return String(
    ride?.passenger_name ||
      ride?.passengerName ||
      ride?.passenger?.name ||
      ride?.user?.name ||
      'Passenger',
  );
}

function getPassengerPhone(ride) {
  return String(
    ride?.passenger_phone ||
      ride?.passengerPhone ||
      ride?.passenger?.phone ||
      ride?.user?.phone ||
      '',
  ).trim();
}

function getFareText(ride) {
  const value = Number(ride?.estimated_fare ?? ride?.final_fare ?? ride?.fare ?? ride?.amount);
  return Number.isFinite(value) && value > 0 ? `INR ${value.toFixed(0)}` : 'Fare pending';
}

function getDistanceText(ride) {
  const value = Number(ride?.distance_km ?? ride?.distanceKm ?? ride?.distance);
  return Number.isFinite(value) && value > 0 ? `${value.toFixed(1)} km` : 'Distance pending';
}

function formatStatus(value) {
  const normalized = String(value || 'new request').replace(/_/g, ' ').trim();
  return normalized ? normalized.toUpperCase() : 'NEW REQUEST';
}

function getNextRideAction(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'accepted') {
    return { status: 'driver_arrived', label: 'Mark Arrived' };
  }
  if (normalized === 'driver_arrived' || normalized === 'arrived') {
    return { status: 'in_progress', label: 'Start Ride' };
  }
  if (normalized === 'in_progress' || normalized === 'started') {
    return { status: 'completed', label: 'Complete Ride' };
  }
  return null;
}

function getVisibleError(value) {
  return String(value || '').replace(/offline/gi, 'paused').trim();
}

async function readBrowserLocation() {
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
      accuracy: position.coords.accuracy,
      timestamp: new Date().toISOString(),
      is_live_location: true,
    };
  } catch {
    return null;
  }
}

function buildMapsUrl(ride, driverLocation) {
  const pickup = getPickup(ride);
  const drop = getDrop(ride);
  const origin = driverLocation || pickup;
  const destination = drop || pickup;
  if (!origin || !destination) {
    return '';
  }
  const originText =
    Number.isFinite(Number(origin.latitude)) && Number.isFinite(Number(origin.longitude))
      ? `${origin.latitude},${origin.longitude}`
      : origin.address;
  const destinationText =
    Number.isFinite(Number(destination.latitude)) && Number.isFinite(Number(destination.longitude))
      ? `${destination.latitude},${destination.longitude}`
      : destination.address;
  if (!originText || !destinationText) {
    return '';
  }
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originText)}&destination=${encodeURIComponent(destinationText)}`;
}

function StatPill({ label, value }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LocationLine({ label, location }) {
  if (!location) {
    return null;
  }
  return (
    <View style={styles.locationRow}>
      <Text style={styles.locationLabel}>{label}</Text>
      <Text style={styles.locationValue} numberOfLines={2}>
        {location.address || `${location.latitude}, ${location.longitude}`}
      </Text>
    </View>
  );
}

function RequestCard({ ride, onAccept, onDecline, busy }) {
  const rideId = getRideId(ride);
  const pickup = getPickup(ride);
  const drop = getDrop(ride);
  return (
    <View style={styles.requestCard}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.passengerName}>{getPassengerName(ride)}</Text>
          <Text style={styles.rideMeta}>{formatStatus(ride.status)}</Text>
        </View>
        <View style={styles.fareBadge}>
          <Text style={styles.fareText}>{getFareText(ride)}</Text>
        </View>
      </View>

      <View style={styles.tripDetails}>
        <LocationLine label="Pickup" location={pickup} />
        <LocationLine label="Drop" location={drop} />
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.distanceText}>{getDistanceText(ride)}</Text>
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.secondaryButton, busy && styles.buttonDisabled]}
            onPress={() => onDecline(rideId)}
            disabled={busy}
          >
            <Text style={styles.secondaryButtonText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, busy && styles.buttonDisabled]}
            onPress={() => onAccept(rideId)}
            disabled={busy}
          >
            <Text style={styles.primaryButtonText}>{busy ? 'Accepting' : 'Accept'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function ActiveRideCard({ ride, driverLocation, onAdvance, onOpenMap, busy }) {
  if (!ride) {
    return null;
  }
  const nextAction = getNextRideAction(ride.status);
  const phone = getPassengerPhone(ride);
  const mapsUrl = buildMapsUrl(ride, driverLocation);
  return (
    <View style={styles.activeRideSection}>
      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionEyebrow}>ACTIVE RIDE</Text>
          <Text style={styles.sectionTitle}>{getPassengerName(ride)}</Text>
        </View>
        <Text style={styles.activeStatus}>{formatStatus(ride.status)}</Text>
      </View>

      <View style={styles.tripDetails}>
        <LocationLine label="Pickup" location={getPickup(ride)} />
        <LocationLine label="Drop" location={getDrop(ride)} />
      </View>

      <View style={styles.activeMetaRow}>
        <StatPill label="Fare" value={getFareText(ride)} />
        <StatPill label="Distance" value={getDistanceText(ride)} />
      </View>

      <View style={styles.actionRowWide}>
        {!!phone && (
          <TouchableOpacity style={styles.secondaryButton} onPress={() => Linking.openURL(`tel:${phone}`)}>
            <Text style={styles.secondaryButtonText}>Call</Text>
          </TouchableOpacity>
        )}
        {!!mapsUrl && (
          <TouchableOpacity style={styles.secondaryButton} onPress={() => onOpenMap(mapsUrl)}>
            <Text style={styles.secondaryButtonText}>Map</Text>
          </TouchableOpacity>
        )}
        {!!nextAction && (
          <TouchableOpacity
            style={[styles.primaryButton, busy && styles.buttonDisabled]}
            onPress={() => onAdvance(ride, nextAction.status)}
            disabled={busy}
          >
            <Text style={styles.primaryButtonText}>{busy ? 'Updating' : nextAction.label}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function DriverAcceptingPage({ token, user, onLogout, onProfilePress = undefined }) {
  const [isOnline, setIsOnline] = useState(false);
  const [syncingAvailability, setSyncingAvailability] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionId, setActionId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [requests, setRequests] = useState([]);
  const [activeRide, setActiveRide] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
  }, []);

  const pushDriverLocation = useCallback(async (locationOverride = null) => {
    const location = normalizeLocation(locationOverride) || normalizeLocation(await readBrowserLocation());
    if (!location) {
      return null;
    }
    setDriverLocation(location);
    const body = toDriverLocationApiBody({
      ...location,
      timestamp: new Date().toISOString(),
      is_live_location: true,
    });
    if (!body) {
      return location;
    }
    await apiRequest('/drivers/location', {
      method: 'POST',
      token,
      body,
      timeoutMs: 10000,
    }).catch(() => null);
    return location;
  }, [token]);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!token) {
      setLoading(false);
      return;
    }
    if (!silent) {
      setError('');
    }
    setLoading((current) => (silent ? current : true));
    try {
      const [availabilityPayload, requestsPayload, activePayload] = await Promise.all([
        apiRequest('/drivers/availability', { token, timeoutMs: 10000 }).catch(() => null),
        apiRequest('/drivers/pending-requests', { token, timeoutMs: 10000 }).catch(() => []),
        apiRequest('/drivers/active-ride', { token, timeoutMs: 10000 }).catch(() => null),
      ]);

      if (!mountedRef.current) {
        return;
      }

      if (hasDriverAvailabilitySnapshot(availabilityPayload)) {
        setIsOnline(readDriverAvailability(availabilityPayload, isOnline));
      }
      setRequests(normalizeRequests(requestsPayload));
      setActiveRide(normalizeActiveRide(activePayload));
      setLastUpdatedAt(new Date());
    } catch (err) {
      if (!silent) {
        setError(getVisibleError(err?.message || 'Could not load driver requests.'));
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [isOnline, token]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      refresh({ silent: true });
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const toggleAvailability = useCallback(async () => {
    if (!token || syncingAvailability) {
      return;
    }
    const next = !isOnline;
    setSyncingAvailability(true);
    setError('');
    setMessage(next ? 'Accepting requests.' : 'Paused new requests.');
    setIsOnline(next);
    try {
      const response = await apiRequest('/drivers/availability', {
        method: 'PUT',
        token,
        timeoutMs: 10000,
        body: { is_available: next },
      });
      const confirmed = readDriverAvailability(response, next);
      setIsOnline(confirmed);
      if (confirmed) {
        await pushDriverLocation();
        setMessage('Ready for ride requests.');
      } else {
        setMessage('Paused new requests.');
      }
      await refresh({ silent: true });
    } catch (err) {
      setIsOnline(!next);
      setError(getVisibleError(err?.message || 'Availability update failed.'));
      setMessage('');
    } finally {
      setSyncingAvailability(false);
    }
  }, [isOnline, pushDriverLocation, refresh, syncingAvailability, token]);

  const acceptRequest = useCallback(async (rideId) => {
    if (!rideId || actionId) {
      return;
    }
    setActionId(rideId);
    setError('');
    setMessage('');
    try {
      const accepted = await apiRequest(`/bookings/${rideId}/accept`, {
        method: 'PUT',
        token,
        timeoutMs: 12000,
      });
      await pushDriverLocation();
      setIsOnline(true);
      setRequests((current) => current.filter((ride) => getRideId(ride) !== rideId));
      setActiveRide(normalizeActiveRide(accepted) || requests.find((ride) => getRideId(ride) === rideId) || null);
      setMessage('Ride accepted.');
      await refresh({ silent: true });
    } catch (err) {
      setError(getVisibleError(err?.message || 'Could not accept this ride.'));
    } finally {
      setActionId('');
    }
  }, [actionId, pushDriverLocation, refresh, requests, token]);

  const declineRequest = useCallback(async (rideId) => {
    if (!rideId || actionId) {
      return;
    }
    setActionId(rideId);
    setError('');
    setMessage('');
    try {
      await apiRequest(`/bookings/${rideId}/reject`, {
        method: 'PUT',
        token,
        timeoutMs: 10000,
      });
      setRequests((current) => current.filter((ride) => getRideId(ride) !== rideId));
      setMessage('Ride declined.');
      await refresh({ silent: true });
    } catch (err) {
      setError(getVisibleError(err?.message || 'Could not decline this ride.'));
    } finally {
      setActionId('');
    }
  }, [actionId, refresh, token]);

  const advanceRide = useCallback(async (ride, nextStatus) => {
    const rideId = getRideId(ride);
    if (!rideId || actionId) {
      return;
    }
    setActionId(rideId);
    setError('');
    try {
      const updated = await apiRequest(`/bookings/${rideId}/status`, {
        method: 'PUT',
        token,
        timeoutMs: 12000,
        body: { status: nextStatus },
      });
      const nextRide = normalizeActiveRide(updated);
      setActiveRide(nextStatus === 'completed' ? null : nextRide || { ...ride, status: nextStatus });
      setMessage(nextStatus === 'completed' ? 'Ride completed.' : 'Ride updated.');
      await refresh({ silent: true });
    } catch (err) {
      setError(getVisibleError(err?.message || 'Could not update ride.'));
    } finally {
      setActionId('');
    }
  }, [actionId, refresh, token]);

  const openMap = useCallback((url) => {
    if (url) {
      Linking.openURL(url).catch(() => setError('Could not open map.'));
    }
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    refresh();
  }, [refresh]);

  const statusTone = syncingAvailability ? 'syncing' : isOnline ? 'online' : 'paused';
  const statusLabel = statusTone === 'syncing' ? 'SYNCING' : statusTone === 'online' ? 'ACCEPTING RIDES' : 'PAUSED';
  const visibleRequests = useMemo(() => requests.filter((ride) => !ACTIVE_STATUSES.has(String(ride.status || '').toLowerCase())), [requests]);
  const updatedText = lastUpdatedAt
    ? `Updated ${lastUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : 'Not synced yet';

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <View style={styles.headerBand}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.eyebrow}>DRIVER ACCEPTING</Text>
              <Text style={styles.title}>Ride Requests</Text>
            </View>
            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.ghostButton} onPress={refresh} disabled={loading}>
                <Text style={styles.ghostButtonText}>Refresh</Text>
              </TouchableOpacity>
              {!!onProfilePress && (
                <TouchableOpacity style={styles.ghostButton} onPress={onProfilePress}>
                  <Text style={styles.ghostButtonText}>Profile</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.ghostButton} onPress={onLogout}>
                <Text style={styles.ghostButtonText}>Logout</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.statusStrip}>
            <View style={[styles.statusDot, styles[`statusDot_${statusTone}`]]} />
            <View style={styles.statusTextBlock}>
              <Text style={styles.statusLabel}>{statusLabel}</Text>
              <Text style={styles.statusSub}>{user?.name || 'Driver'} - {updatedText}</Text>
            </View>
            <TouchableOpacity
              style={[styles.availabilityButton, statusTone === 'online' && styles.pauseButton]}
              onPress={toggleAvailability}
              disabled={syncingAvailability}
            >
              {syncingAvailability ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={styles.availabilityButtonText}>{isOnline ? 'Pause' : 'Go Online'}</Text>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.statsRow}>
            <StatPill label="Requests" value={String(visibleRequests.length)} />
            <StatPill label="Active" value={activeRide ? '1' : '0'} />
            <StatPill label="Mode" value={isOnline ? 'Live' : 'Paused'} />
          </View>
        </View>

        {!!error && <Text style={styles.errorText}>{error}</Text>}
        {!!message && <Text style={styles.messageText}>{message}</Text>}
        {loading && <ActivityIndicator color={COLORS.primary} style={styles.loader} />}

        <ActiveRideCard
          ride={activeRide}
          driverLocation={driverLocation}
          onAdvance={advanceRide}
          onOpenMap={openMap}
          busy={!!actionId && getRideId(activeRide) === actionId}
        />

        <View style={styles.sectionHeader}>
          <View>
            <Text style={styles.sectionEyebrow}>NEW REQUESTS</Text>
            <Text style={styles.sectionTitle}>{visibleRequests.length === 1 ? '1 request' : `${visibleRequests.length} requests`}</Text>
          </View>
        </View>

        {visibleRequests.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{isOnline ? 'Waiting for ride requests' : 'Paused new requests'}</Text>
            <Text style={styles.emptySub}>
              {isOnline ? 'New passenger bookings will appear here.' : 'Go online when you are ready to accept bookings.'}
            </Text>
          </View>
        ) : (
          visibleRequests.map((ride) => {
            const rideId = getRideId(ride);
            return (
              <RequestCard
                key={rideId}
                ride={ride}
                onAccept={acceptRequest}
                onDecline={declineRequest}
                busy={actionId === rideId}
              />
            );
          })
        )}
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
  content: {
    padding: 16,
    gap: 14,
  },
  headerBand: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 14,
    gap: 14,
    ...SHADOWS.card,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    flexWrap: 'wrap',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  eyebrow: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
  },
  title: {
    color: COLORS.textMain,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0,
    marginTop: 2,
  },
  statusStrip: {
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#F8FBF9',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  statusDot_online: {
    backgroundColor: COLORS.success,
  },
  statusDot_syncing: {
    backgroundColor: COLORS.warning,
  },
  statusDot_paused: {
    backgroundColor: '#7C8780',
  },
  statusTextBlock: {
    flex: 1,
    minWidth: 160,
  },
  statusLabel: {
    color: COLORS.textMain,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0,
  },
  statusSub: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  availabilityButton: {
    minHeight: 42,
    minWidth: 108,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseButton: {
    backgroundColor: '#455A64',
  },
  availabilityButtonText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 13,
  },
  ghostButton: {
    minHeight: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  ghostButtonText: {
    color: COLORS.textMain,
    fontWeight: '800',
    fontSize: 12,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statPill: {
    minWidth: 104,
    flexGrow: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  statValue: {
    color: COLORS.textMain,
    fontSize: 18,
    fontWeight: '900',
  },
  statLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
    textTransform: 'uppercase',
  },
  loader: {
    marginVertical: 10,
  },
  errorText: {
    color: COLORS.danger,
    fontWeight: '800',
  },
  messageText: {
    color: COLORS.primaryDark,
    fontWeight: '800',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  sectionEyebrow: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  sectionTitle: {
    color: COLORS.textMain,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 2,
  },
  activeRideSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    padding: 14,
    gap: 12,
    ...SHADOWS.soft,
  },
  activeStatus: {
    color: COLORS.primaryDark,
    backgroundColor: '#E8F5E9',
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
  },
  activeMetaRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  requestCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    gap: 12,
    ...SHADOWS.soft,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
    alignItems: 'flex-start',
  },
  cardTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  passengerName: {
    color: COLORS.textMain,
    fontSize: 18,
    fontWeight: '900',
  },
  rideMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 2,
  },
  fareBadge: {
    backgroundColor: '#F4F8F5',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  fareText: {
    color: COLORS.primaryDark,
    fontSize: 13,
    fontWeight: '900',
  },
  tripDetails: {
    gap: 8,
  },
  locationRow: {
    flexDirection: 'row',
    gap: 10,
  },
  locationLabel: {
    width: 58,
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '900',
  },
  locationValue: {
    flex: 1,
    color: COLORS.textMain,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  distanceText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '800',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  actionRowWide: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  primaryButton: {
    minHeight: 40,
    minWidth: 104,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 40,
    minWidth: 86,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: COLORS.textMain,
    fontSize: 13,
    fontWeight: '900',
  },
  buttonDisabled: {
    opacity: 0.62,
  },
  emptyState: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 24,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: {
    color: COLORS.textMain,
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  emptySub: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 19,
  },
});
