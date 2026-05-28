import React, { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS, SHADOWS } from '../theme';

const EMPTY_UPCOMING = {
  scheduled_requests: [],
  assigned_rides: [],
  counts: { scheduled_requests: 0, assigned_rides: 0, total: 0 },
};

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatDateTime(value) {
  if (!value) {
    return 'Time not set';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Time not set';
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
  const amount = Number(value || 0);
  return `Rs. ${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'}`;
}

function formatStatus(value) {
  return String(value || 'scheduled')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function locationAddress(location, fallback) {
  if (!location || typeof location !== 'object') {
    return fallback;
  }
  return (
    (typeof location.address === 'string' && location.address.trim()) ||
    (Number.isFinite(Number(location.latitude)) && Number.isFinite(Number(location.longitude))
      ? `${Number(location.latitude).toFixed(5)}, ${Number(location.longitude).toFixed(5)}`
      : fallback)
  );
}

function timeUntilLabel(minutesUntil) {
  const minutes = Number(minutesUntil);
  if (!Number.isFinite(minutes)) {
    return null;
  }
  if (minutes < -15) {
    return 'Past scheduled time';
  }
  if (minutes <= 0) {
    return 'Due now';
  }
  if (minutes < 60) {
    return `In ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `In ${hours}h ${remainingMinutes}m` : `In ${hours}h`;
}

function ScheduledRideCard({
  ride,
  type,
  loading,
  onAcceptRequest,
  onRejectRequest,
  onResumeRide,
  onNavigateRide,
  onCallPassenger,
  onCancelRide,
  onOpenSupport,
}) {
  const isRequest = type === 'request';
  const pickup = locationAddress(ride.pickup_location, 'Pickup not available');
  const drop = locationAddress(ride.drop_location, 'Drop not available');
  const timeLabel = timeUntilLabel(ride.minutes_until);
  const assignedActions = [
    { key: 'resume', label: 'Resume', onPress: onResumeRide },
    { key: 'navigate', label: 'Navigate', onPress: onNavigateRide },
    { key: 'call', label: 'Call', onPress: onCallPassenger },
    { key: 'support', label: 'Support', onPress: onOpenSupport },
    { key: 'cancel', label: 'Cancel', onPress: onCancelRide, danger: true },
  ];

  return (
    <View style={styles.rideCard}>
      <View style={styles.rideHeader}>
        <View style={styles.rideTitleBlock}>
          <Text style={styles.rideTitle}>{ride.passenger_name || 'Passenger'}</Text>
          <Text style={styles.rideMeta}>{formatDateTime(ride.scheduled_for)}</Text>
          {!!timeLabel && <Text style={styles.rideCountdown}>{timeLabel}</Text>}
        </View>
        <View style={[styles.statusPill, isRequest ? styles.statusRequest : styles.statusAssigned]}>
          <Text style={[styles.statusText, isRequest ? styles.statusRequestText : styles.statusAssignedText]}>
            {isRequest ? 'Request' : formatStatus(ride.status)}
          </Text>
        </View>
      </View>

      <View style={styles.routeBox}>
        <Text style={styles.routeLabel}>From</Text>
        <Text style={styles.routeText}>{pickup}</Text>
        <Text style={styles.routeLabel}>To</Text>
        <Text style={styles.routeText}>{drop}</Text>
      </View>

      <View style={styles.detailRow}>
        <Text style={styles.detailText}>{formatMoney(ride.estimated_fare ?? ride.final_fare)}</Text>
        {!!ride.distance_km && <Text style={styles.detailText}>{Number(ride.distance_km).toFixed(1)} km</Text>}
        {!!ride.dispatch_status && <Text style={styles.detailText}>{formatStatus(ride.dispatch_status)}</Text>}
      </View>

      {isRequest && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.buttonDisabled]}
            onPress={() => onAcceptRequest?.(ride.id)}
            disabled={loading}>
            <Text style={styles.primaryButtonText}>Accept</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.secondaryButton, loading && styles.buttonDisabled]}
            onPress={() => onRejectRequest?.(ride.id)}
            disabled={loading}>
            <Text style={styles.secondaryButtonText}>Decline</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isRequest && (
        <View style={styles.assignedActionGrid}>
          {assignedActions.map((action) => (
            <TouchableOpacity
              key={action.key}
              style={[
                styles.assignedActionButton,
                action.danger && styles.assignedDangerButton,
                (loading || typeof action.onPress !== 'function') && styles.buttonDisabled,
              ]}
              onPress={() => action.onPress?.(ride)}
              disabled={loading || typeof action.onPress !== 'function'}>
              <Text style={[styles.assignedActionText, action.danger && styles.assignedDangerText]}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

export default function ScheduledRidesPanel({
  upcomingRides = EMPTY_UPCOMING,
  loading = false,
  onAcceptRequest,
  onRejectRequest,
  onResumeRide,
  onNavigateRide,
  onCallPassenger,
  onCancelRide,
  onOpenSupport,
  onRefresh,
}) {
  const scheduledRequests = asArray(upcomingRides?.scheduled_requests);
  const assignedRides = asArray(upcomingRides?.assigned_rides);
  const counts = upcomingRides?.counts || EMPTY_UPCOMING.counts;
  const nextRide = useMemo(
    () => [...assignedRides, ...scheduledRequests]
      .filter((ride) => ride?.scheduled_for)
      .sort((a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime())[0],
    [assignedRides, scheduledRequests],
  );

  return (
    <View style={styles.container}>
      <View style={styles.summaryCard}>
        <View style={styles.summaryHeader}>
          <View style={styles.summaryTitleBlock}>
            <Text style={styles.title}>Scheduled Jobs</Text>
            <Text style={styles.subtitle}>
              {nextRide ? `Next: ${formatDateTime(nextRide.scheduled_for)}` : 'No upcoming scheduled ride'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.refreshButton, loading && styles.buttonDisabled]}
            onPress={onRefresh}
            disabled={loading}>
            <Text style={styles.refreshText}>Refresh</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.countRow}>
          <View style={styles.countItem}>
            <Text style={styles.countValue}>{Number(counts.scheduled_requests || scheduledRequests.length)}</Text>
            <Text style={styles.countLabel}>Open</Text>
          </View>
          <View style={styles.countItem}>
            <Text style={styles.countValue}>{Number(counts.assigned_rides || assignedRides.length)}</Text>
            <Text style={styles.countLabel}>Assigned</Text>
          </View>
          <View style={styles.countItem}>
            <Text style={styles.countValue}>{Number(counts.total || scheduledRequests.length + assignedRides.length)}</Text>
            <Text style={styles.countLabel}>Total</Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Open Scheduled Requests</Text>
      {scheduledRequests.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No open scheduled requests.</Text>
        </View>
      ) : (
        scheduledRequests.map((ride) => (
          <ScheduledRideCard
            key={ride.id}
            ride={ride}
            type="request"
            loading={loading}
            onAcceptRequest={onAcceptRequest}
            onRejectRequest={onRejectRequest}
          />
        ))
      )}

      <Text style={styles.sectionTitle}>Assigned Upcoming Rides</Text>
      {assignedRides.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No assigned scheduled rides.</Text>
        </View>
      ) : (
        assignedRides.map((ride) => (
          <ScheduledRideCard
            key={ride.id}
            ride={ride}
            type="assigned"
            loading={loading}
            onResumeRide={onResumeRide}
            onNavigateRide={onNavigateRide}
            onCallPassenger={onCallPassenger}
            onCancelRide={onCancelRide}
            onOpenSupport={onOpenSupport}
          />
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10,
  },
  summaryCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    ...SHADOWS.soft,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  summaryTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: COLORS.textMain,
    fontSize: 18,
    fontWeight: '900',
  },
  subtitle: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 3,
  },
  refreshButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.background,
  },
  refreshText: {
    color: COLORS.textMain,
    fontSize: 12,
    fontWeight: '800',
  },
  countRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  countItem: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: COLORS.background,
  },
  countValue: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: '900',
  },
  countLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  sectionTitle: {
    color: COLORS.textMain,
    fontSize: 14,
    fontWeight: '900',
    marginTop: 6,
  },
  rideCard: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    ...SHADOWS.soft,
  },
  rideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  rideTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  rideTitle: {
    color: COLORS.textMain,
    fontSize: 16,
    fontWeight: '900',
  },
  rideMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  rideCountdown: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '900',
    marginTop: 2,
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusRequest: {
    backgroundColor: '#FFF8E1',
    borderColor: COLORS.warning,
  },
  statusAssigned: {
    backgroundColor: '#E8F5E9',
    borderColor: COLORS.primary,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '900',
  },
  statusRequestText: {
    color: '#8A5A00',
  },
  statusAssignedText: {
    color: COLORS.primaryDark,
  },
  routeBox: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: COLORS.background,
    gap: 3,
  },
  routeLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  routeText: {
    color: COLORS.textMain,
    fontSize: 12,
    fontWeight: '700',
  },
  detailRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailText: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  assignedActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  assignedActionButton: {
    minWidth: 92,
    flexGrow: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  assignedActionText: {
    color: COLORS.textMain,
    fontSize: 12,
    fontWeight: '900',
  },
  assignedDangerButton: {
    borderColor: COLORS.danger,
    backgroundColor: '#FFF5F5',
  },
  assignedDangerText: {
    color: COLORS.danger,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: COLORS.surface,
    fontSize: 13,
    fontWeight: '900',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: COLORS.danger,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: COLORS.danger,
    fontSize: 13,
    fontWeight: '900',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  emptyCard: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
  },
  emptyText: {
    color: COLORS.textMuted,
    fontSize: 13,
    fontWeight: '700',
  },
});
