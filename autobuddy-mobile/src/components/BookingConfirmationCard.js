import React, { useCallback, useEffect, useState } from 'react';
import CancellationCostBanner from './CancellationCostBanner';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SHADOWS } from '../theme';

/**
 * BookingConfirmationCard Component
 * 
 * PROBLEM SOLVED: After booking, users unsure if it succeeded (only shows toast)
 * 
 * SOLUTION: Shows prominent confirmation card with:
 * - Booking ID for reference
 * - Pickup and dropoff locations
 * - Estimated fare and distance
 * - Driver info (if pre-selected)
 * - Visual confirmation (green checkmark, success colors)
 * - Auto-dismiss after 5 seconds or manual dismiss
 * 
 * PROPS:
 * - booking: object - Booking data {id, pickup_location, drop_location, estimated_fare, distance_km}
 * - onDismiss: Function() - Called when user dismisses or auto-dismiss triggers
 * - autoDismissMs: number - Auto dismiss delay (default 5000ms)
 */

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 12,
    marginVertical: 8,
    backgroundColor: '#E8F5E9',
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
    borderRadius: 8,
    padding: 12,
    ...SHADOWS.small,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  successIcon: {
    fontSize: 20,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  titleText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1B5E20',
    flex: 1,
    marginLeft: 8,
  },
  dismissButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  dismissButtonText: {
    fontSize: 18,
    color: '#4CAF50',
    fontWeight: 'bold',
  },
  bookingIdRow: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
    marginBottom: 8,
  },
  bookingIdLabel: {
    fontSize: 11,
    color: '#666666',
    fontWeight: '500',
  },
  bookingIdValue: {
    fontSize: 12,
    color: '#1B5E20',
    fontWeight: '700',
    marginTop: 2,
    fontFamily: 'monospace',
  },
  detailsRow: {
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 0,
  },
  detailLabel: {
    fontSize: 11,
    color: '#666666',
    fontWeight: '500',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 12,
    color: '#202020',
    fontWeight: '500',
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(76, 175, 80, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 4,
    marginTop: 8,
  },
  fareLabel: {
    fontSize: 12,
    color: '#666666',
  },
  fareValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1B5E20',
  },
  nextStepsText: {
    fontSize: 11,
    color: '#4CAF50',
    fontStyle: 'italic',
    marginTop: 8,
  },
});

export default function BookingConfirmationCard({
  booking,
  onDismiss,
  autoDismissMs = 5000,
}) {
  const [visible, setVisible] = useState(true);

  const handleDismiss = useCallback(() => {
    setVisible(false);
    if (typeof onDismiss === 'function') {
      onDismiss();
    }
  }, [onDismiss]);

  useEffect(() => {
    if (!autoDismissMs) {
      return undefined;
    }
    const timer = setTimeout(() => {
      handleDismiss();
    }, autoDismissMs);
    return () => clearTimeout(timer);
  }, [autoDismissMs, handleDismiss]);

  if (!visible || !booking) {
    return null;
  }

  const pickup = booking.pickup_location;
  const dropoff = booking.drop_location || booking.dropoff_location;
  const fareEstimate = Number(booking.estimated_fare || 0).toFixed(2);
  const distance = Number(booking.distance_km || 0).toFixed(1);

  // Example logic for cancellation state/cost (replace with real logic as needed)
  let cancellationState = 'free';
  let cancellationCost = 0;
  if (booking && booking.cancellation_fee) {
    cancellationState = booking.cancellation_fee > 0 ? 'paid' : 'free';
    cancellationCost = booking.cancellation_fee;
  }
  // If booking is locked, set to 'none'
  if (booking && booking.cancellation_locked) {
    cancellationState = 'none';
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.successIcon}>✓</Text>
        <Text style={styles.titleText}>Booking Confirmed!</Text>
        <TouchableOpacity style={styles.dismissButton} onPress={handleDismiss}>
          <Text style={styles.dismissButtonText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Cancellation Cost Banner */}
      <CancellationCostBanner cost={cancellationCost} state={cancellationState} />

      {/* Booking ID */}
      {booking.id && (
        <View style={styles.bookingIdRow}>
          <Text style={styles.bookingIdLabel}>BOOKING ID</Text>
          <Text style={styles.bookingIdValue}>{String(booking.id).slice(0, 12)}...</Text>
        </View>
      )}

      {/* Pickup Location */}
      {pickup && (
        <View style={styles.detailsRow}>
          <Text style={styles.detailLabel}>📍 PICKUP</Text>
          <Text style={styles.detailValue} numberOfLines={1}>
            {pickup.address || 'Location set'}
          </Text>
        </View>
      )}

      {/* Dropoff Location */}
      {dropoff && (
        <View style={styles.detailsRow}>
          <Text style={styles.detailLabel}>📍 DROPOFF</Text>
          <Text style={styles.detailValue} numberOfLines={1}>
            {dropoff.address || 'Location set'}
          </Text>
        </View>
      )}

      {/* Fare & Distance */}
      <View style={styles.fareRow}>
        <View>
          <Text style={styles.detailLabel}>ESTIMATED FARE</Text>
          <Text style={styles.fareValue}>₹{fareEstimate}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.detailLabel}>DISTANCE</Text>
          <Text style={styles.fareValue}>{distance} km</Text>
        </View>
      </View>

      <Text style={styles.nextStepsText}>
        Waiting for driver acceptance... Check your ride status below.
      </Text>
    </View>
  );
}
