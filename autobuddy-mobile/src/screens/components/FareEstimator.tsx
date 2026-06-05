/**
 * Fare Estimator Component
 * Location: autobuddy-mobile/src/screens/components/FareEstimator.tsx
 *
 * Purpose: Show real-time fare estimates with surge pricing
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Animated
} from 'react-native';
import { vehicleTypesAPI } from '../../services/apiClient';

interface FareEstimate {
  vehicle_type_id: number;
  base_fare: number;
  estimated_distance_km: number;
  estimated_duration_minutes: number;
  per_km_charge: number;
  per_minute_charge: number;
  surge_multiplier: number;
  estimated_total_fare: number;
  minimum_fare: number;
  final_fare: number;
}

interface FareEstimatorProps {
  pickupLatitude: number;
  pickupLongitude: number;
  dropoffLatitude: number;
  dropoffLongitude: number;
  vehicleTypeId: number;
  rideProductId?: number;
}

export const FareEstimator: React.FC<FareEstimatorProps> = ({
  pickupLatitude,
  pickupLongitude,
  dropoffLatitude,
  dropoffLongitude,
  vehicleTypeId,
  rideProductId
}) => {
  const [estimate, setEstimate] = useState<FareEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scaleAnim = useMemo(() => new Animated.Value(1), []);

  const fetchFareEstimate = useCallback(async () => {
    try {
      setError(null);

      const response = await vehicleTypesAPI.estimateFare({
        pickup_latitude: pickupLatitude,
        pickup_longitude: pickupLongitude,
        dropoff_latitude: dropoffLatitude,
        dropoff_longitude: dropoffLongitude,
        vehicle_type_id: vehicleTypeId,
        ride_product_id: rideProductId
      });

      setEstimate(response);
      setLoading(false);

      // Pulse animation
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 1.05,
          duration: 200,
          useNativeDriver: true
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true
        })
      ]).start();
    } catch (err) {
      setError('Failed to calculate fare');
      setLoading(false);
      console.error('Error fetching fare estimate:', err);
    }
  }, [
    dropoffLatitude,
    dropoffLongitude,
    pickupLatitude,
    pickupLongitude,
    rideProductId,
    scaleAnim,
    vehicleTypeId,
  ]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchFareEstimate();
    }, 0);
    const interval = setInterval(fetchFareEstimate, 30000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [fetchFareEstimate]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#1F97D4" />
      </View>
    );
  }

  if (error || !estimate) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error || 'No fare estimate available'}</Text>
      </View>
    );
  }

  const surgeActive = estimate.surge_multiplier > 1;

  return (
    <Animated.View
      style={[
        styles.container,
        { transform: [{ scale: scaleAnim }] }
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Fare Estimate</Text>
        {surgeActive && (
          <View style={styles.surgeBadge}>
            <Text style={styles.surgeBadgeText}>
              {(estimate.surge_multiplier).toFixed(1)}x Surge
            </Text>
          </View>
        )}
      </View>

      <View style={styles.distanceRow}>
        <View style={styles.distanceItem}>
          <Text style={styles.distanceLabel}>Distance</Text>
          <Text style={styles.distanceValue}>
            {estimate.estimated_distance_km.toFixed(1)} km
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.distanceItem}>
          <Text style={styles.distanceLabel}>Duration</Text>
          <Text style={styles.distanceValue}>
            ~{Math.round(estimate.estimated_duration_minutes)} min
          </Text>
        </View>
      </View>

      <View style={styles.breakdownContainer}>
        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>Base Fare</Text>
          <Text style={styles.breakdownValue}>
            ₹{estimate.base_fare.toFixed(2)}
          </Text>
        </View>

        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>Distance Charge</Text>
          <Text style={styles.breakdownValue}>
            ₹{estimate.per_km_charge.toFixed(2)}
          </Text>
        </View>

        <View style={styles.breakdownRow}>
          <Text style={styles.breakdownLabel}>Time Charge</Text>
          <Text style={styles.breakdownValue}>
            ₹{estimate.per_minute_charge.toFixed(2)}
          </Text>
        </View>

        {surgeActive && (
          <View style={styles.breakdownRow}>
            <Text style={styles.breakdownLabel}>Surge Multiplier</Text>
            <Text style={[styles.breakdownValue, styles.surgeValue]}>
              ×{estimate.surge_multiplier.toFixed(2)}
            </Text>
          </View>
        )}

        <View style={styles.separator} />

        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total Fare</Text>
          <Text style={styles.totalPrice}>
            ₹{estimate.final_fare.toFixed(2)}
          </Text>
        </View>
      </View>

      <Text style={styles.disclaimerText}>
        This is an estimate. Final fare may vary based on actual route, traffic, and promotions.
      </Text>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  errorContainer: {
    backgroundColor: '#FADBD8',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 16,
  },
  errorText: {
    color: '#C0392B',
    fontSize: 12,
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2C3E50',
  },
  surgeBadge: {
    backgroundColor: '#E74C3C',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  surgeBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  distanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ECF0F1',
    marginBottom: 12,
  },
  distanceItem: {
    flex: 1,
    alignItems: 'center',
  },
  distanceLabel: {
    fontSize: 11,
    color: '#95A5A6',
    marginBottom: 4,
  },
  distanceValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2C3E50',
  },
  divider: {
    width: 1,
    height: 30,
    backgroundColor: '#ECF0F1',
    marginHorizontal: 12,
  },
  breakdownContainer: {
    marginBottom: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  breakdownLabel: {
    fontSize: 12,
    color: '#7F8C8D',
    fontWeight: '500',
  },
  breakdownValue: {
    fontSize: 12,
    color: '#2C3E50',
    fontWeight: '600',
  },
  surgeValue: {
    color: '#E74C3C',
  },
  separator: {
    height: 1,
    backgroundColor: '#ECF0F1',
    marginVertical: 8,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2C3E50',
  },
  totalPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: '#27AE60',
  },
  disclaimerText: {
    fontSize: 10,
    color: '#BDC3C7',
    fontStyle: 'italic',
    marginTop: 8,
    textAlign: 'center',
  },
});
