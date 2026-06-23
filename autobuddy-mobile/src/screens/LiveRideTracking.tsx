/**
 * LiveRideTracking.tsx
 * Real-time ride tracking with driver location updates
 * 
 * Features:
 * - Live driver location on map
 * - Ride status updates
 * - Estimated arrival time
 * - Ride fare breakdown
 * - Contact driver button
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { rideAPI } from '../services/apiClient';
import { getSocket } from '../services/socketClient';
import { COLORS } from '../theme';

type DriverLocation = {
  latitude: number;
  longitude: number;
  heading?: number;
};

type DriverLocationUpdate = {
  booking_id?: string;
  latitude?: number;
  longitude?: number;
  heading?: number;
};

type RideStatus = {
  status?: string;
  driver?: {
    name?: string;
    phone?: string;
    rating?: number;
    vehicle_name?: string;
    license_plate?: string;
  };
  estimated_arrival_minutes?: number;
  fare_breakdown?: {
    base?: number;
    distance?: number;
    time?: number;
  };
  final_fare?: number;
};

type LiveRideTrackingProps = {
  route: { params?: { bookingId?: string } };
  navigation: { goBack: () => void };
};

type MapRef = {
  animateToRegion?: (region: DriverLocation & { latitudeDelta: number; longitudeDelta: number }) => void;
};

export const LiveRideTracking = ({ route, navigation }: LiveRideTrackingProps) => {
  const { bookingId } = route.params || {};

  const [rideStatus, setRideStatus] = useState<RideStatus | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<MapRef | null>(null);

  // Fetch current ride status
  const fetchRideStatus = useCallback(async () => {
    if (!bookingId) {
      setLoading(false);
      return;
    }
    try {
      const response = await rideAPI.getRideStatus(bookingId);
      setRideStatus(response.data);
    } catch (error) {
      console.error('Error fetching ride status:', error);
      Alert.alert('Error', 'Could not fetch ride status');
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    void Promise.resolve().then(fetchRideStatus);

    // Listen to Socket.IO location updates
    const socket = getSocket();
    if (socket && bookingId) {
      socket.on('driver_location_updated', (data: DriverLocationUpdate) => {
        if (data.booking_id === bookingId) {
          setDriverLocation({
            latitude: data.latitude,
            longitude: data.longitude,
            heading: data.heading,
          });
          
          // Update map if available
          if (mapRef.current) {
            mapRef.current.animateToRegion?.({
              latitude: data.latitude,
              longitude: data.longitude,
              latitudeDelta: 0.01,
              longitudeDelta: 0.01,
            });
          }
        }
      });

      // Listen to ride status changes
      socket.on('ride_status_changed', (data: RideStatus & { booking_id?: string }) => {
        if (data.booking_id === bookingId) {
          setRideStatus(data);
        }
      });
    }

    return () => {
      if (socket) {
        socket.off('driver_location_updated');
        socket.off('ride_status_changed');
      }
    };
  }, [bookingId, fetchRideStatus]);

  const handleContactDriver = () => {
    if (rideStatus?.driver?.phone) {
      Linking.openURL(`tel:${rideStatus.driver.phone}`);
    }
  };

  const handleSOS = () => {
    Alert.alert(
      'Emergency',
      'Contact emergency services?',
      [
        { text: 'Call 911', onPress: () => Linking.openURL('tel:911') },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Map placeholder - integrate with react-native-maps */}
      <View style={styles.mapContainer}>
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapText}>
            Map: Driver at {driverLocation?.latitude?.toFixed(4)}, 
            {driverLocation?.longitude?.toFixed(4)}
          </Text>
        </View>
      </View>

      {/* Ride status card */}
      <View style={styles.statusCard}>
        <Text style={styles.statusTitle}>Ride Status: {rideStatus?.status}</Text>

        {rideStatus?.driver && (
          <View style={styles.driverInfo}>
            <View style={styles.driverAvatar}>
              <Text style={styles.avatarText}>
                {rideStatus.driver.name?.charAt(0)}
              </Text>
            </View>
            <View style={styles.driverDetails}>
              <Text style={styles.driverName}>{rideStatus.driver.name}</Text>
              <Text style={styles.driverRating}>⭐ {rideStatus.driver.rating}</Text>
              <Text style={styles.vehicleInfo}>
                {rideStatus.driver.vehicle_name} • {rideStatus.driver.license_plate}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.callButton}
              onPress={handleContactDriver}
            >
              <Text style={styles.callButtonText}>📞</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Estimated arrival */}
        {rideStatus?.estimated_arrival_minutes && (
          <View style={styles.arrivalInfo}>
            <Text style={styles.arrivalLabel}>Estimated Arrival</Text>
            <Text style={styles.arrivalTime}>
              {rideStatus.estimated_arrival_minutes} min
            </Text>
          </View>
        )}

        {/* Fare breakdown */}
        {rideStatus?.fare_breakdown && (
          <View style={styles.fareSection}>
            <Text style={styles.fareLabel}>Fare Details</Text>
            <View style={styles.fareRow}>
              <Text style={styles.fareItem}>Base Fare</Text>
              <Text style={styles.fareValue}>₹{rideStatus.fare_breakdown.base}</Text>
            </View>
            <View style={styles.fareRow}>
              <Text style={styles.fareItem}>Distance</Text>
              <Text style={styles.fareValue}>₹{rideStatus.fare_breakdown.distance}</Text>
            </View>
            <View style={styles.fareRow}>
              <Text style={styles.fareItem}>Time</Text>
              <Text style={styles.fareValue}>₹{rideStatus.fare_breakdown.time}</Text>
            </View>
            <View style={[styles.fareRow, styles.totalRow]}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>₹{rideStatus.final_fare}</Text>
            </View>
          </View>
        )}
      </View>

      {/* Action buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={[styles.button, styles.sosButton]}
          onPress={handleSOS}
        >
          <Text style={styles.sosButtonText}>🆘 SOS</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.cancelButton]}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.cancelButtonText}>Close</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  mapContainer: {
    flex: 2,
    backgroundColor: COLORS.lightGray,
  },
  mapPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapText: {
    color: COLORS.textSecondary,
    fontSize: 14,
  },
  statusCard: {
    flex: 3,
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 16,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  driverAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  driverDetails: {
    flex: 1,
    marginLeft: 12,
  },
  driverName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  driverRating: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  vehicleInfo: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  callButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  callButtonText: {
    fontSize: 20,
  },
  arrivalInfo: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  arrivalLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  arrivalTime: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  fareSection: {
    paddingVertical: 12,
  },
  fareLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  fareItem: {
    fontSize: 12,
    color: COLORS.text,
  },
  fareValue: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  totalValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.primary,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sosButton: {
    backgroundColor: '#FF6B6B',
  },
  sosButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  cancelButton: {
    backgroundColor: COLORS.lightGray,
  },
  cancelButtonText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 14,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default LiveRideTracking;
