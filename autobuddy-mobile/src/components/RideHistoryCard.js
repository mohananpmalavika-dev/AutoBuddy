import React from 'react';
import { TouchableOpacity, View, Text } from 'react-native';
import { SHADOWS } from '../theme';

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
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' }) +
      ' ' +
      date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
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

const styles = {};
// TODO: Move styles from RideHistoryPanel.js or define here

export default RideHistoryCard;
