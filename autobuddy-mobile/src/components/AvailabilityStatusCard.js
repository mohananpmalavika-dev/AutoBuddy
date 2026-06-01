import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';

/**
 * Real-Time Availability Status Card
 * Shows driver's availability status with sync state and detailed feedback
 * 
 * Props:
 *   - availability: { isOnline, desiredIsOnline, label, status, syncing, tone }
 *   - error: string - Error message if sync failed
 *   - message: string - Status message
 *   - onToggle: () => void - Callback to toggle availability
 *   - loading: boolean - Is toggle in flight
 */
export default function AvailabilityStatusCard({
  availability = {},
  error = '',
  message = '',
  onToggle = () => null,
  loading = false,
}) {
  const {
    isOnline = false,
    desiredIsOnline = isOnline,
    syncing = false,
  } = availability;
  const labelIsOnline = syncing ? !!desiredIsOnline : !!isOnline;
  const resolvedTone = syncing ? 'syncing' : isOnline ? 'online' : 'offline';
  const resolvedLabel = syncing
    ? labelIsOnline
      ? 'GOING ONLINE...'
      : 'GOING OFFLINE...'
    : isOnline
      ? 'ONLINE & READY'
      : 'OFFLINE';

  // Determine colors based on tone
  const colorMap = useMemo(
    () => ({
      online: {
        background: '#E8F5E9',
        border: '#2E7D32',
        dot: '#2E7D32',
        text: '#1B5E20',
        subText: '#2E7D32',
      },
      syncing: {
        background: '#FFF7E6',
        border: '#FFA500',
        dot: '#FFA500',
        text: '#B26A00',
        subText: '#FF9800',
      },
      offline: {
        background: '#F5F5F5',
        border: '#BDBDBD',
        dot: '#8A8A8A',
        text: '#666',
        subText: '#999',
      },
    }),
    [],
  );

  const colors = colorMap[resolvedTone] || colorMap.offline;

  // Status details
  const statusDetails = useMemo(() => {
    if (syncing) {
      return {
        icon: '⟳',
        detail: labelIsOnline ? 'Going online...' : 'Going offline...',
        hint: 'Waiting for server confirmation',
      };
    }
    if (isOnline) {
      return {
        icon: '●',
        detail: 'Ready for requests',
        hint: 'You will receive new ride requests',
      };
    }
    return {
      icon: '○',
      detail: 'Not accepting requests',
      hint: 'You are currently offline',
    };
  }, [labelIsOnline, syncing, isOnline]);

  return (
    <View style={[styles.container, { borderColor: colors.border, backgroundColor: colors.background }]}>
      {/* Status Header */}
      <View style={styles.header}>
        <View style={styles.statusDotContainer}>
          <View
            style={[
              styles.statusDot,
              {
                backgroundColor: colors.dot,
                borderColor: colors.border,
              },
            ]}
          >
            {syncing && (
              <ActivityIndicator
                size="small"
                color={colors.dot}
                style={styles.dotSpinner}
              />
            )}
          </View>
        </View>

        <View style={styles.statusInfo}>
          <Text style={[styles.statusLabel, { color: colors.text }]}>
            {resolvedLabel}
          </Text>
          <Text style={[styles.statusDetail, { color: colors.subText }]}>
            {statusDetails.detail}
          </Text>
        </View>

        {syncing && (
          <View style={styles.syncingBadge}>
            <ActivityIndicator size="small" color={colors.dot} />
          </View>
        )}
      </View>

      {/* Status Details */}
      <View style={[styles.detailsSection, { borderTopColor: colors.border }]}>
        <Text style={[styles.detailHint, { color: colors.subText }]}>
          {statusDetails.hint}
        </Text>

        {/* Error Message */}
        {error && (
          <Text style={[styles.errorText]}>
            ⚠️ {error}
          </Text>
        )}

        {/* Success/Info Message */}
        {message && !error && (
          <Text style={[styles.successText]}>
            ✓ {message}
          </Text>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[
            styles.toggleButton,
            {
              backgroundColor: colors.border,
              opacity: loading ? 0.6 : 1,
            },
          ]}
          onPress={onToggle}
          disabled={loading || syncing}
          activeOpacity={0.7}
        >
          <Text style={[styles.toggleButtonText, { color: colors.text }]}>
            {loading ? 'Updating...' : isOnline ? 'Go Offline' : 'Go Online'}
          </Text>
        </TouchableOpacity>

        {syncing && (
          <Text style={[styles.syncNote, { color: colors.subText }]}>
            Do not close app while syncing
          </Text>
        )}
      </View>

      {/* Sync Status Timeline */}
      {syncing && (
        <View style={[styles.syncTimeline, { backgroundColor: colors.border + '20' }]}>
          <Text style={[styles.timelineLabel, { color: colors.text }]}>
            Sync Progress:
          </Text>
          <View style={styles.progressSteps}>
            <View style={[styles.step, styles.stepComplete, { backgroundColor: colors.dot }]} />
            <View style={[styles.stepDivider, { backgroundColor: colors.border }]} />
            <View style={[styles.step, { backgroundColor: colors.border }]} />
            <View style={[styles.stepDivider, { backgroundColor: colors.border }]} />
            <View style={[styles.step, { backgroundColor: colors.border }]} />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = {
  container: {
    borderRadius: 12,
    borderWidth: 2,
    padding: 16,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusDotContainer: {
    marginRight: 12,
  },
  statusDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dotSpinner: {
    position: 'absolute',
  },
  statusInfo: {
    flex: 1,
  },
  statusLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  statusDetail: {
    fontSize: 13,
    fontWeight: '500',
  },
  syncingBadge: {
    padding: 4,
  },
  detailsSection: {
    borderTopWidth: 1,
    paddingTop: 12,
    marginBottom: 12,
  },
  detailHint: {
    fontSize: 12,
    fontWeight: '400',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#D32F2F',
    marginTop: 6,
    fontWeight: '500',
  },
  successText: {
    fontSize: 12,
    color: '#2E7D32',
    marginTop: 6,
    fontWeight: '500',
  },
  actions: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  toggleButton: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 140,
    justifyContent: 'center',
    alignItems: 'center',
  },
  toggleButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  syncNote: {
    fontSize: 11,
    marginTop: 8,
    fontStyle: 'italic',
  },
  syncTimeline: {
    borderRadius: 8,
    padding: 12,
    marginTop: 12,
  },
  timelineLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
  },
  progressSteps: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  step: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  stepComplete: {
    opacity: 1,
  },
  stepDivider: {
    width: 20,
    height: 2,
    marginHorizontal: 4,
  },
};
