import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';

const TERMINAL_STATUSES = new Set([
  'completed',
  'cancelled',
  'rejected',
  'no_driver_found',
  'booking_failed',
]);
const CANCELLABLE_STATUSES = new Set(['scheduled', 'pending']);

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (Array.isArray(value?.bookings)) {
    return value.bookings;
  }
  if (Array.isArray(value?.data)) {
    return value.data;
  }
  return [];
}

function normalizedStatus(value) {
  return String(value || 'scheduled').trim().toLowerCase() || 'scheduled';
}

function formatStatus(value) {
  return normalizedStatus(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value) {
  if (!value) {
    return 'Pickup time not set';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Pickup time not set';
  }
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return `Rs. ${amount.toFixed(2)}`;
}

function formatDistance(value) {
  const distance = Number(value);
  if (!Number.isFinite(distance) || distance <= 0) {
    return null;
  }
  return `${distance.toFixed(1)} km`;
}

function locationLabel(location, fallback) {
  if (typeof location === 'string' && location.trim()) {
    return location.trim();
  }
  if (!location || typeof location !== 'object') {
    return fallback;
  }
  const address = String(location.address || location.name || '').trim();
  if (address) {
    return address;
  }
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }
  return fallback;
}

function minutesUntilLabel(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  const minutes = Math.round((date.getTime() - Date.now()) / 60000);
  if (minutes < -15) {
    return 'Past pickup time';
  }
  if (minutes <= 0) {
    return 'Due now';
  }
  if (minutes < 60) {
    return `In ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (hours < 24) {
    return remainingMinutes ? `In ${hours}h ${remainingMinutes}m` : `In ${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? 'Tomorrow' : `In ${days} days`;
}

function normalizeScheduledRide(row) {
  const scheduledAt = row?.scheduled_for || row?.scheduled_time || row?.scheduledAt || null;
  return {
    id: String(row?.id || row?.booking_id || '').trim(),
    status: normalizedStatus(row?.status),
    scheduledAt,
    pickup: locationLabel(row?.pickup_location || row?.pickup, 'Pickup not set'),
    dropoff: locationLabel(row?.drop_location || row?.dropoff_location || row?.dropoff, 'Drop not set'),
    driverName: row?.driver_name || '',
    driverPhone: row?.driver_phone || '',
    fare: row?.estimated_fare ?? row?.final_fare ?? row?.estimatedFare,
    distanceKm: row?.distance_km ?? row?.actual_distance_km,
    paymentMethod: row?.payment_method || '',
    createdAt: row?.created_at || row?.createdAt || '',
  };
}

function isScheduledRide(row) {
  return Boolean(
    row?.scheduled_for ||
      row?.scheduled_time ||
      row?.scheduledAt ||
      normalizedStatus(row?.ride_product) === 'scheduled' ||
      normalizedStatus(row?.ride_type) === 'scheduled',
  );
}

function compareByScheduleAsc(a, b) {
  const left = new Date(a.scheduledAt || a.createdAt || 0).getTime();
  const right = new Date(b.scheduledAt || b.createdAt || 0).getTime();
  return (Number.isFinite(left) ? left : 0) - (Number.isFinite(right) ? right : 0);
}

function ScheduledRideCard({ ride, cancelling, onCancel, onOpenRide }) {
  const status = normalizedStatus(ride.status);
  const canCancel = CANCELLABLE_STATUSES.has(status);
  const statusStyle = TERMINAL_STATUSES.has(status)
    ? styles.statusPast
    : status === 'scheduled' || status === 'pending'
      ? styles.statusUpcoming
      : styles.statusActive;
  const fare = formatMoney(ride.fare);
  const distance = formatDistance(ride.distanceKm);
  const countdown = minutesUntilLabel(ride.scheduledAt);

  return (
    <View style={[styles.rideCard, SHADOWS.soft]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle}>{formatDateTime(ride.scheduledAt)}</Text>
          {!!countdown && <Text style={styles.countdown}>{countdown}</Text>}
        </View>
        <View style={[styles.statusPill, statusStyle]}>
          <Text style={styles.statusText}>{formatStatus(status)}</Text>
        </View>
      </View>

      <View style={styles.routeBlock}>
        <Text style={styles.routeLabel}>From</Text>
        <Text style={styles.routeText}>{ride.pickup}</Text>
        <Text style={styles.routeLabel}>To</Text>
        <Text style={styles.routeText}>{ride.dropoff}</Text>
      </View>

      <View style={styles.detailRow}>
        {!!fare && <Text style={styles.detailText}>{fare}</Text>}
        {!!distance && <Text style={styles.detailText}>{distance}</Text>}
        {!!ride.paymentMethod && <Text style={styles.detailText}>{String(ride.paymentMethod).toUpperCase()}</Text>}
      </View>

      {!!ride.driverName && (
        <Text style={styles.driverText}>
          Driver: {ride.driverName}{ride.driverPhone ? `, ${ride.driverPhone}` : ''}
        </Text>
      )}

      <View style={styles.actionRow}>
        {typeof onOpenRide === 'function' && !TERMINAL_STATUSES.has(status) && (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => onOpenRide(ride)}
            accessibilityRole="button"
            accessibilityLabel="Open this ride">
            <Text style={styles.secondaryButtonText}>Open Ride</Text>
          </TouchableOpacity>
        )}
        {canCancel && (
          <TouchableOpacity
            style={[styles.cancelButton, cancelling && styles.buttonDisabled]}
            onPress={() => onCancel(ride)}
            disabled={cancelling}
            accessibilityRole="button"
            accessibilityLabel="Cancel scheduled ride">
            <Text style={styles.cancelButtonText}>{cancelling ? 'Cancelling...' : 'Cancel Ride'}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function PassengerScheduledRidesPanel({
  token,
  onRideCancelled,
  onOpenRide,
}) {
  const [scheduledRides, setScheduledRides] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [cancellingId, setCancellingId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const fetchScheduledRides = useCallback(
    async ({ silent = false } = {}) => {
      if (!token) {
        setScheduledRides([]);
        return;
      }
      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError('');
      try {
        const response = await apiRequest('/bookings', {
          token,
          query: { limit: 200 },
        });
        const rides = asArray(response)
          .filter(isScheduledRide)
          .map(normalizeScheduledRide)
          .filter((ride) => ride.id)
          .sort(compareByScheduleAsc);
        setScheduledRides(rides);
      } catch (err) {
        setError(err.message || 'Failed to load scheduled rides');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [token],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchScheduledRides().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchScheduledRides]);

  const upcomingRides = useMemo(
    () => scheduledRides.filter((ride) => !TERMINAL_STATUSES.has(normalizedStatus(ride.status))),
    [scheduledRides],
  );
  const pastRides = useMemo(
    () =>
      scheduledRides
        .filter((ride) => TERMINAL_STATUSES.has(normalizedStatus(ride.status)))
        .sort((a, b) => compareByScheduleAsc(b, a)),
    [scheduledRides],
  );

  const cancelScheduledRide = useCallback(
    (ride) => {
      if (!ride?.id || cancellingId) {
        return;
      }
      const confirmCancellation = async () => {
        try {
          setCancellingId(ride.id);
          setError('');
          setMessage('');
          await apiRequest(`/bookings/${ride.id}/cancel`, {
            method: 'PUT',
            token,
            body: {
              reason_code: 'passenger_scheduled_cancelled',
              reason_text: 'Passenger cancelled scheduled ride from Scheduled Rides.',
              policy_acknowledged: true,
              passenger_context: { source: 'passenger_scheduled_rides_panel' },
            },
          });
          setMessage('Scheduled ride cancelled.');
          await fetchScheduledRides({ silent: true });
          if (typeof onRideCancelled === 'function') {
            await onRideCancelled(ride);
          }
        } catch (err) {
          setError(err.message || 'Failed to cancel scheduled ride');
        } finally {
          setCancellingId('');
        }
      };

      if (Platform.OS === 'web') {
        const confirmed =
          typeof globalThis.confirm === 'function'
            ? globalThis.confirm(`Cancel scheduled ride?\n\nPickup: ${ride.pickup}\nDrop: ${ride.dropoff}`)
            : true;
        if (confirmed) {
          confirmCancellation();
        }
        return;
      }

      Alert.alert(
        'Cancel scheduled ride?',
        `Pickup: ${ride.pickup}\nDrop: ${ride.dropoff}`,
        [
          { text: 'Keep Ride', style: 'cancel' },
          {
            text: 'Cancel Ride',
            style: 'destructive',
            onPress: confirmCancellation,
          },
        ],
      );
    },
    [cancellingId, fetchScheduledRides, onRideCancelled, token],
  );

  const renderRideSection = (title, rides, emptyText) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {rides.length === 0 ? (
        <View style={styles.emptyBlock}>
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      ) : (
        rides.map((ride) => (
          <ScheduledRideCard
            key={ride.id}
            ride={ride}
            cancelling={cancellingId === ride.id}
            onCancel={cancelScheduledRide}
            onOpenRide={onOpenRide}
          />
        ))
      )}
    </View>
  );

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.summaryCard, SHADOWS.card]}>
        <View style={styles.summaryHeader}>
          <View style={styles.summaryTitleBlock}>
            <Text style={styles.title}>Scheduled Rides</Text>
            <Text style={styles.subtitle}>
              {upcomingRides.length > 0
                ? `${upcomingRides.length} upcoming ride${upcomingRides.length === 1 ? '' : 's'}`
                : 'No upcoming scheduled rides'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.refreshButton, (loading || refreshing) && styles.buttonDisabled]}
            onPress={() => fetchScheduledRides({ silent: true })}
            disabled={loading || refreshing}
            accessibilityRole="button"
            accessibilityLabel="Refresh scheduled rides">
            <Text style={styles.refreshText}>{refreshing ? 'Refreshing...' : 'Refresh'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading && <ActivityIndicator color={COLORS.primary} style={styles.loader} />}
      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!message && <Text style={styles.message}>{message}</Text>}

      {!loading && (
        <>
          {renderRideSection('Upcoming', upcomingRides, 'Scheduled rides you create will appear here.')}
          {renderRideSection('Past', pastRides, 'No past scheduled rides yet.')}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    paddingBottom: 12,
  },
  summaryCard: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  summaryTitleBlock: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textMain,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  refreshButton: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F4FBF6',
  },
  refreshText: {
    color: COLORS.primary,
    fontWeight: '800',
    fontSize: 12,
  },
  loader: {
    marginVertical: 18,
  },
  error: {
    color: COLORS.danger,
    marginBottom: 10,
    fontWeight: '700',
  },
  message: {
    color: COLORS.success,
    marginBottom: 10,
    fontWeight: '700',
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textMain,
    marginBottom: 8,
  },
  emptyBlock: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 14,
    backgroundColor: '#F8FAF9',
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  rideCard: {
    backgroundColor: COLORS.card,
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  cardTitleBlock: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textMain,
  },
  countdown: {
    marginTop: 3,
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '700',
  },
  statusPill: {
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  statusUpcoming: {
    backgroundColor: '#E8F5E9',
  },
  statusActive: {
    backgroundColor: '#E3F2FD',
  },
  statusPast: {
    backgroundColor: '#EEF1F0',
  },
  statusText: {
    color: COLORS.textMain,
    fontSize: 11,
    fontWeight: '800',
  },
  routeBlock: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    backgroundColor: '#FAFCFB',
  },
  routeLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginTop: 4,
  },
  routeText: {
    color: COLORS.textMain,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 2,
  },
  detailRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  detailText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  driverText: {
    marginTop: 8,
    color: COLORS.textMain,
    fontSize: 13,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F8FAF9',
  },
  secondaryButtonText: {
    color: COLORS.textMain,
    fontWeight: '800',
    fontSize: 12,
  },
  cancelButton: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.danger,
  },
  cancelButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});
