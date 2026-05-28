import React, { useCallback, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { COLORS, SHADOWS } from '../theme';
import KeralaSafetyCard from './KeralaSafetyCard';

const RIDE_STATUS_MAP = {
  pending: { label: 'New Request', color: '#FF6B6B', icon: '📍' },
  accepted: { label: 'Accepted', color: '#4ECDC4', icon: '✓' },
  driver_arrived: { label: 'You Arrived', color: '#45B7D1', icon: '📍' },
  in_progress: { label: 'Trip Started', color: '#95E1D3', icon: '🚗' },
  completed: { label: 'Completed', color: '#6BCF7F', icon: '✓' },
};

const UNKNOWN_RIDE_STATUS = { label: 'Unknown', color: COLORS.gray, icon: '?' };

/**
 * RideCard Component
 * 
 * Displays current ride status with quick actions.
 * Designed for minimal scrolling - always visible on driver dashboard.
 * 
 * Addresses Issues:
 * - Issue #2: Hidden Ride Information - Prominent placement, swipeable
 * - Issue #7: Safety Card Accessibility - Safety card visible on ride card
 * 
 * Props:
 *   - ride: Active ride object
 *   - driverLocation: Current driver {latitude, longitude, address}
 *   - onAccept: () => void
 *   - onDecline: () => void  
 *   - onComplete: () => void
 *   - onMessage: () => void
 *   - onCall: () => void
 *   - onMapPress: () => void
 *   - safety: Safety state object (from useKeralaSafety hook)
 *   - loading: boolean
 *   - expanded: boolean
 *   - onToggleExpand: (boolean) => void
 */
export default function RideCard({
  ride,
  driverLocation,
  onAccept,
  onDecline,
  onComplete,
  onMessage,
  onCall,
  onMapPress,
  safety = null,
  loading = false,
  expanded = false,
  onToggleExpand,
}) {
  const rideStatusKey = String(ride?.status || '').toLowerCase();
  const rideStatus = rideStatusKey ? RIDE_STATUS_MAP[rideStatusKey] || UNKNOWN_RIDE_STATUS : null;

  const passenger = useMemo(() => ({
    name: ride?.passenger_name || 'Passenger',
    phone: ride?.passenger_phone || '',
    rating: ride?.passenger_rating || 4.5,
  }), [ride?.passenger_name, ride?.passenger_phone, ride?.passenger_rating]);

  const locations = useMemo(() => ({
    pickup: ride?.pickup_location || ride?.pickup || ride?.pickup_location_details,
    dropoff: ride?.dropoff_location || ride?.dropoff || ride?.dropoff_location_details,
  }), [ride?.pickup_location, ride?.pickup, ride?.pickup_location_details, 
      ride?.dropoff_location, ride?.dropoff, ride?.dropoff_location_details]);

  const estimatedFare = useMemo(() => {
    if (!ride?.estimated_fare && !ride?.fare) return null;
    return `₹${ride?.estimated_fare || ride?.fare || '0'}`;
  }, [ride?.estimated_fare, ride?.fare]);

  const handleToggleExpand = useCallback(() => {
    if (typeof onToggleExpand === 'function') {
      onToggleExpand(!expanded);
    }
  }, [expanded, onToggleExpand]);

  if (!ride) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateIcon}>📭</Text>
          <Text style={styles.emptyStateText}>No active requests</Text>
          <Text style={styles.emptyStateSubtext}>Turn online to receive ride requests</Text>
        </View>
      </View>
    );
  }

  const showActionButtons = !ride?.status || 
    ['pending', 'accepted'].includes(String(ride.status).toLowerCase());

  return (
    <View style={styles.container}>
      {/* Header with status badge */}
      <View style={styles.header}>
        <View style={[styles.statusBadge, { backgroundColor: rideStatus?.color }]}>
          <Text style={styles.statusIcon}>{rideStatus?.icon}</Text>
          <Text style={styles.statusLabel}>{rideStatus?.label}</Text>
        </View>
        <Text style={styles.rideId}>Ride #{ride?.id?.slice?.(-6) || 'N/A'}</Text>
      </View>

      {/* Passenger & Rating */}
      <View style={styles.passengerRow}>
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>
            {passenger.name?.charAt(0)?.toUpperCase() || 'P'}
          </Text>
        </View>
        <View style={styles.passengerInfo}>
          <Text style={styles.passengerName}>{passenger.name}</Text>
          <Text style={styles.rating}>⭐ {passenger.rating?.toFixed(1) || '4.5'}</Text>
        </View>
        <View style={styles.fareContainer}>
          <Text style={styles.fareLabel}>Est. Fare</Text>
          <Text style={styles.fareAmount}>{estimatedFare || '₹0'}</Text>
        </View>
      </View>

      {/* Location Summary */}
      <View style={styles.locationsRow}>
        <View style={styles.locationItem}>
          <Text style={styles.locationIcon}>📍</Text>
          <Text style={styles.locationText} numberOfLines={1}>
            {locations.pickup?.address || 'Pickup location'}
          </Text>
        </View>
        <View style={styles.locationDivider}>
          <Text style={styles.dividerArrow}>↓</Text>
        </View>
        <View style={styles.locationItem}>
          <Text style={styles.locationIcon}>🎯</Text>
          <Text style={styles.locationText} numberOfLines={1}>
            {locations.dropoff?.address || 'Dropoff location'}
          </Text>
        </View>
      </View>

      {/* Quick Action Buttons */}
      {showActionButtons && (
        <View style={styles.quickActions}>
          {String(ride.status).toLowerCase() === 'pending' ? (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, styles.acceptBtn]}
                onPress={onAccept}
                disabled={loading}>
                {loading ? (
                  <ActivityIndicator size="small" color={COLORS.white} />
                ) : (
                  <>
                    <Text style={styles.actionBtnIcon}>✓</Text>
                    <Text style={styles.actionBtnText}>Accept</Text>
                  </>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.declineBtn]}
                onPress={onDecline}
                disabled={loading}>
                <Text style={styles.actionBtnIcon}>✕</Text>
                <Text style={[styles.actionBtnText, { color: COLORS.danger }]}>Decline</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.actionBtn, styles.messageBtn]}
                onPress={onMessage}
                disabled={loading}>
                <Text style={styles.actionBtnIcon}>💬</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.callBtn]}
                onPress={onCall}
                disabled={loading}>
                <Text style={styles.actionBtnIcon}>📞</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.mapBtn]}
                onPress={onMapPress}
                disabled={loading}>
                <Text style={styles.actionBtnIcon}>🗺️</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* Next Action Button */}
      {['accepted', 'driver_arrived', 'in_progress'].includes(String(ride.status).toLowerCase()) && (
        <TouchableOpacity
          style={[styles.nextActionBtn, loading && styles.nextActionBtnDisabled]}
          onPress={onComplete}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator size="small" color={COLORS.white} />
          ) : (
            <Text style={styles.nextActionBtnText}>
              {String(ride.status).toLowerCase() === 'accepted' ? 'Mark Arrived' :
               String(ride.status).toLowerCase() === 'driver_arrived' ? 'Start Trip' :
               'Complete Trip'}
            </Text>
          )}
        </TouchableOpacity>
      )}

      {/* Expand Button */}
      {typeof onToggleExpand === 'function' && (
        <TouchableOpacity
          style={styles.expandBtn}
          onPress={handleToggleExpand}>
          <Text style={styles.expandIcon}>{expanded ? '▼' : '▲'}</Text>
          <Text style={styles.expandText}>
            {expanded ? 'Show Less' : 'Show Details'}
          </Text>
        </TouchableOpacity>
      )}

      {/* Expanded Details */}
      {expanded && (
        <View style={styles.expandedContent}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Passenger Phone:</Text>
            <Text style={styles.detailValue}>{passenger.phone || 'N/A'}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Your Location:</Text>
            <Text style={styles.detailValue} numberOfLines={2}>
              {driverLocation?.address || `${driverLocation?.latitude}, ${driverLocation?.longitude}`}
            </Text>
          </View>
          {ride?.special_instructions && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Notes:</Text>
              <Text style={styles.detailValue}>{ride.special_instructions}</Text>
            </View>
          )}

          {/* Safety Card - Issue #7: Always visible on ride card */}
          {safety && (
            <View style={styles.safetySection}>
              <KeralaSafetyCard safety={safety} compact={true} />
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 12,
    marginVertical: 8,
    ...SHADOWS.card,
  },
  
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  statusIcon: {
    fontSize: 16,
    marginRight: 6,
  },
  statusLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
  },
  rideId: {
    fontSize: 13,
    color: COLORS.gray,
    fontWeight: '500',
  },

  passengerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarPlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.white,
  },
  passengerInfo: {
    flex: 1,
  },
  passengerName: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textMain,
  },
  rating: {
    fontSize: 13,
    color: COLORS.gray,
    marginTop: 2,
  },
  fareContainer: {
    alignItems: 'flex-end',
  },
  fareLabel: {
    fontSize: 11,
    color: COLORS.gray,
  },
  fareAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 2,
  },

  locationsRow: {
    marginBottom: 12,
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 5,
  },
  locationIcon: {
    fontSize: 14,
    marginRight: 8,
    width: 20,
  },
  locationText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  locationDivider: {
    paddingVertical: 2,
    paddingLeft: 7,
  },
  dividerArrow: {
    fontSize: 12,
    color: COLORS.gray,
    fontWeight: '600',
  },

  quickActions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  acceptBtn: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  declineBtn: {
    backgroundColor: COLORS.surface,
    borderColor: COLORS.danger,
  },
  messageBtn: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  callBtn: {
    flex: 1,
    backgroundColor: '#10B981',
    borderColor: '#10B981',
  },
  mapBtn: {
    flex: 1,
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  actionBtnIcon: {
    fontSize: 16,
    marginRight: 4,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.white,
  },

  nextActionBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 8,
  },
  nextActionBtnDisabled: {
    opacity: 0.6,
  },
  nextActionBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.white,
  },

  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  expandIcon: {
    fontSize: 12,
    marginRight: 4,
    color: COLORS.gray,
  },
  expandText: {
    fontSize: 12,
    color: COLORS.gray,
    fontWeight: '500',
  },

  expandedContent: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  detailRow: {
    marginBottom: 10,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.gray,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 13,
    color: COLORS.textMain,
  },
  safetySection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },

  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyStateIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textMain,
    marginBottom: 4,
  },
  emptyStateSubtext: {
    fontSize: 13,
    color: COLORS.gray,
  },
});
