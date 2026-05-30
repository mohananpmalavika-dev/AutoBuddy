import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { SHADOWS } from '../theme';
import { formatToIST } from '../utils/time';

/**
 * RideHistoryCard - Reusable card for ride history entries
 * Props:
 * - booking: booking object
 * - onPress: function to call on tap
 * - isLoading: disables tap if true
 */
function RideHistoryCard({ booking, onPress, isLoading }) {
  const statusColor = {
    completed: '#4CAF50',
    cancelled: '#F44336',
    no_driver_found: '#FF9800',
    pending: '#2196F3',
    accepted: '#2196F3',
  }[booking.status] || '#757575';

  const formatDate = (dateStr) => {
    const datePart = formatToIST(dateStr, { month: 'short', day: 'numeric' });
    const timePart = formatToIST(dateStr, { hour: '2-digit', minute: '2-digit' });
    return `${datePart} ${timePart}`;
  };

  const formatLocation = (location) => {
    if (!location) return 'Unknown';
    if (typeof location === 'string') return location.split(',')[0];
    if (location.address) return location.address.split(',')[0];
    return 'Unknown';
  };

  return (
    <TouchableOpacity
      style={[styles.card, SHADOWS.soft]}
      onPress={onPress}
      disabled={isLoading}
      activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}> 
          <Text style={styles.statusText}>{booking.status.replace('_', ' ').toUpperCase()}</Text>
        </View>
        <Text style={styles.cardTime}>{formatDate(booking.created_at)}</Text>
      </View>
      
      {/* Vehicle Info */}
      {booking.vehicle_type_id && (
        <View style={styles.vehicleInfoRow}>
          <Text style={styles.vehicleIcon}>{booking.vehicle_icon || '🚗'}</Text>
          <Text style={styles.vehicleType}>{booking.vehicle_type_id.toUpperCase()}</Text>
          {booking.vehicle_type_multiplier && booking.vehicle_type_multiplier !== 1 && (
            <View style={styles.vehicleMultiplierBadge}>
              <Text style={styles.vehicleMultiplierText}>{booking.vehicle_type_multiplier}x</Text>
            </View>
          )}
        </View>
      )}
      
      <View style={styles.cardContent}>
        <View style={styles.routeSection}>
          <Text style={styles.routeText} numberOfLines={1}>
            📍 {formatLocation(booking.pickup_location)} → {formatLocation(booking.drop_location)}
          </Text>
        </View>
        <View style={styles.detailsRow}>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Driver</Text>
            <Text style={styles.detailValue}>{booking.driver_name || 'Unassigned'}</Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Distance</Text>
            <Text style={styles.detailValue}>
              {booking.distance_km ? `${Number(booking.distance_km).toFixed(1)} km` : '--'}
            </Text>
          </View>
          <View style={styles.detailItem}>
            <Text style={styles.detailLabel}>Fare</Text>
            <Text style={[styles.detailValue, styles.fareText]}>
              ₹{Number(booking.final_fare || booking.estimated_fare || 0).toFixed(0)}
            </Text>
          </View>
          {booking.rating && (
            <View style={styles.detailItem}>
              <Text style={styles.detailLabel}>Rating</Text>
              <Text style={styles.detailValue}>⭐ {booking.rating}/5</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.bookingId}>ID: {booking.id.substring(0, 12)}</Text>
        <Text style={styles.tapHint}>Tap for details →</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  cardTime: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
  },
  vehicleInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: '#F5F5F5',
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  vehicleIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  vehicleType: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
    flex: 1,
  },
  vehicleMultiplierBadge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  vehicleMultiplierText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1976D2',
  },
  cardContent: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  routeSection: {
    marginBottom: 10,
  },
  routeText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500',
  },
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  detailItem: {
    width: '48%',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 11,
    color: '#999',
    fontWeight: '500',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 12,
    color: '#333',
    fontWeight: '600',
  },
  fareText: {
    color: '#4CAF50',
    fontWeight: '700',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#EFEFEF',
    backgroundColor: '#FAFAFA',
  },
  bookingId: {
    fontSize: 11,
    color: '#999',
  },
  tapHint: {
    fontSize: 11,
    color: '#999',
  },
});

export default RideHistoryCard;
