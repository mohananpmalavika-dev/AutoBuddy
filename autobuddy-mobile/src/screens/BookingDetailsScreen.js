import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../theme';
import { bookingAPI } from '../services/apiClient';
import { getSocket } from '../services/socketClient';

function normalizeInitialLocation(location) {
  if (!location) {
    return { address: '', coords: null };
  }

  if (typeof location === 'string') {
    return { address: location, coords: null };
  }

  const latitude = Number(location.latitude ?? location.lat);
  const longitude = Number(location.longitude ?? location.lng);
  const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);

  return {
    address: String(location.address || location.name || '').trim(),
    coords: hasCoords ? { latitude, longitude } : null,
  };
}

/**
 * BookingDetailsScreen
 * Final step in the two-screen passenger booking flow.
 * Locations and service are selected before this screen, so this page only asks
 * for passenger count before dispatching the ride request.
 */
const BookingDetailsScreen = ({ navigation, route }) => {
  const service = route.params?.service || {};
  const {
    vehicle_type_id,
    vehicle_subtype_id,
    vehicle_subtype_capacity,
    vehicle_capacity,
    capacity_unit,
    ride_type,
  } = service;

  const initialPickup = normalizeInitialLocation(route.params?.initialPickup);
  const initialDropoff = normalizeInitialLocation(route.params?.initialDropoff);
  const selectedCapacity = Number(vehicle_subtype_capacity || vehicle_capacity || 0);
  const maxPassengerCount =
    capacity_unit !== 'kg' && selectedCapacity > 0 ? selectedCapacity : 6;

  const [passengerCount, setPassengerCount] = useState(1);
  const [loading, setLoading] = useState(false);

  const updatePassengerCount = (nextValue) => {
    setPassengerCount(Math.max(1, Math.min(maxPassengerCount, nextValue)));
  };

  const handleBookRide = async () => {
    if (!initialPickup.coords || !initialDropoff.coords) {
      Alert.alert(
        'Locations Required',
        'Please go back and select both pickup and dropoff locations.',
      );
      return;
    }

    if (passengerCount > maxPassengerCount) {
      Alert.alert(
        'Capacity Exceeded',
        `Selected vehicle seats up to ${maxPassengerCount} passengers.`,
      );
      return;
    }

    try {
      setLoading(true);

      const bookingData = {
        pickup_latitude: initialPickup.coords.latitude,
        pickup_longitude: initialPickup.coords.longitude,
        pickup_location: initialPickup.address,
        dropoff_latitude: initialDropoff.coords.latitude,
        dropoff_longitude: initialDropoff.coords.longitude,
        dropoff_location: initialDropoff.address,
        vehicle_type_id,
        vehicle_subtype_id: vehicle_subtype_id || null,
        ride_type,
        passenger_count: passengerCount,
        scheduled_datetime: null,
        promo_code: null,
        pickup_region: service.pickup_region || null,
        pickup_district: service.pickup_district || null,
        pickup_pincode: service.pickup_pincode || null,
      };

      const bookingResponse = await bookingAPI.createBooking(bookingData);
      const bookingId = bookingResponse?.booking_id || bookingResponse?.id;

      if (bookingId) {
        try {
          getSocket()?.emit?.('booking_created', { booking_id: bookingId });
        } catch {
          // Socket notification is best-effort; booking success should continue.
        }

        navigation.navigate('RideDetails', {
          ...(bookingResponse || {}),
          booking: bookingResponse,
          bookingId,
          booking_id: bookingId,
          id: bookingResponse?.id || bookingId,
          status: bookingResponse?.status || 'pending',
        });
      }
    } catch (error) {
      Alert.alert('Booking Failed', error.message || 'Unable to create booking');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>{'<- Back'}</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Booking Details</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Number of Passengers</Text>
          <View style={styles.counterContainer}>
            <TouchableOpacity
              style={styles.counterButton}
              onPress={() => updatePassengerCount(passengerCount - 1)}
              disabled={passengerCount <= 1}
            >
              <Text style={styles.counterButtonText}>-</Text>
            </TouchableOpacity>
            <Text style={styles.counterValue}>{passengerCount}</Text>
            <TouchableOpacity
              style={styles.counterButton}
              onPress={() => updatePassengerCount(passengerCount + 1)}
              disabled={passengerCount >= maxPassengerCount}
            >
              <Text style={styles.counterButtonText}>+</Text>
            </TouchableOpacity>
          </View>
          {maxPassengerCount > 1 && (
            <Text style={styles.capacityHint}>
              Maximum {maxPassengerCount} passengers for this vehicle
            </Text>
          )}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.bookButton, loading && styles.bookButtonDisabled]}
          onPress={handleBookRide}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={styles.bookButtonText}>Find Driver</Text>
              <Text style={styles.bookButtonArrow}>{'->'}</Text>
            </>
          )}
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

  scrollContent: {
    flexGrow: 1,
    padding: 16,
    paddingBottom: 100,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
  },

  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },

  backButtonText: {
    ...TYPOGRAPHY.body,
    color: COLORS.primary,
    fontWeight: '600',
  },

  title: {
    ...TYPOGRAPHY.heading2,
    color: COLORS.text,
    flex: 1,
    textAlign: 'center',
  },

  headerSpacer: {
    width: 74,
  },

  section: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },

  sectionTitle: {
    ...TYPOGRAPHY.heading2,
    color: COLORS.text,
    marginBottom: 24,
    textAlign: 'center',
  },

  counterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },

  counterButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.soft,
  },

  counterButtonText: {
    fontSize: 28,
    color: '#fff',
    fontWeight: 'bold',
    lineHeight: 30,
  },

  counterValue: {
    ...TYPOGRAPHY.title,
    color: COLORS.text,
    minWidth: 64,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },

  capacityHint: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 16,
    textAlign: 'center',
  },

  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.background,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  bookButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...SHADOWS.medium,
  },

  bookButtonDisabled: {
    backgroundColor: COLORS.disabled,
    opacity: 0.5,
  },

  bookButtonText: {
    ...TYPOGRAPHY.heading3,
    color: '#fff',
    fontWeight: '600',
  },

  bookButtonArrow: {
    fontSize: 20,
    color: '#fff',
  },
});

export default BookingDetailsScreen;
