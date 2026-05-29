import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../theme';
import { apiRequest } from '../lib/api';
import {
  getPlaceLocation,
  searchPlaces,
  reverseGeocodeLocation,
} from '../lib/places';
import SavedPlacesQuickSelect from '../components/SavedPlacesQuickSelect';
import ScheduledPickupPicker from '../components/ScheduledPickupPicker';

/**
 * BookingDetailsScreen
 * Step 2 of Total Mobility Platform booking flow
 * 
 * Users enter:
 * - Pickup location
 * - Dropoff location
 * - Date/Time (if scheduled)
 * - Passenger count / goods weight
 * - Promo code
 * - Then book/find driver
 */

const BookingDetailsScreen = ({ navigation, route }) => {
  const { vehicleType, rideType } = route.params;

  const [pickupLocation, setPickupLocation] = useState('');
  const [dropoffLocation, setDropoffLocation] = useState('');
  const [pickupCoords, setPickupCoords] = useState(null);
  const [dropoffCoords, setDropoffCoords] = useState(null);
  const [rideDate, setRideDate] = useState(new Date());
  const [passengerCount, setPassengerCount] = useState(1);
  const [goodsWeight, setGoodsWeight] = useState(0);
  const [promoCode, setPromoCode] = useState('');
  const [estimatedFare, setEstimatedFare] = useState(null);
  const [estimatedDistance, setEstimatedDistance] = useState(null);
  const [estimatedDuration, setEstimatedDuration] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [savedPlaces, setSavedPlaces] = useState([]);

  const pickupInputRef = useRef(null);
  const dropoffInputRef = useRef(null);

  useEffect(() => {
    // Get current location for pickup
    getCurrentLocation();
    fetchSavedPlaces();
  }, []);

  useEffect(() => {
    // Calculate fare when locations change
    if (pickupCoords && dropoffCoords) {
      calculateFare();
    }
  }, [pickupCoords, dropoffCoords, vehicleType, passengerCount, goodsWeight]);

  const getCurrentLocation = async () => {
    try {
      // Get user's current location
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve(pos.coords),
          (err) => reject(err),
        );
      });

      setPickupCoords({
        latitude: position.latitude,
        longitude: position.longitude,
      });

      // Reverse geocode to get address
      const address = await reverseGeocodeLocation(
        position.latitude,
        position.longitude,
      );
      setPickupLocation(address || 'Current Location');
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const fetchSavedPlaces = async () => {
    try {
      const response = await apiRequest({
        endpoint: '/api/passenger/places',
        method: 'GET',
      });
      setSavedPlaces(response.data || []);
    } catch (error) {
      console.error('Error fetching saved places:', error);
    }
  };

  const handleLocationSearch = async (text, isPickup) => {
    if (isPickup) {
      setPickupLocation(text);
    } else {
      setDropoffLocation(text);
    }

    if (text.length < 3) {
      return;
    }

    try {
      setSearching(true);
      const results = await searchPlaces(text);

      // Show results as dropdown (simplified - in real app use dropdown component)
      if (results.length > 0) {
        const location = results[0];
        const coords = await getPlaceLocation(location.place_id);

        if (isPickup) {
          setPickupCoords(coords);
          setPickupLocation(location.description);
        } else {
          setDropoffCoords(coords);
          setDropoffLocation(location.description);
        }
      }
    } catch (error) {
      console.error('Error searching places:', error);
    } finally {
      setSearching(false);
    }
  };

  const calculateFare = async () => {
    try {
      setLoading(true);

      const response = await apiRequest({
        endpoint: '/api/bookings/estimate-fare',
        method: 'POST',
        body: {
          pickup_latitude: pickupCoords.latitude,
          pickup_longitude: pickupCoords.longitude,
          dropoff_latitude: dropoffCoords.latitude,
          dropoff_longitude: dropoffCoords.longitude,
          vehicle_type_id: vehicleType.id,
          passenger_count: passengerCount,
          goods_weight_kg: rideType.id === 'goods' ? goodsWeight : null,
        },
      });

      setEstimatedFare(response.data.estimated_fare);
      setEstimatedDistance(response.data.distance_km);
      setEstimatedDuration(response.data.duration_minutes);
    } catch (error) {
      console.error('Error calculating fare:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBookRide = async () => {
    if (!pickupCoords || !dropoffCoords) {
      Alert.alert('Please enter both pickup and dropoff locations');
      return;
    }

    try {
      setLoading(true);

      const bookingData = {
        pickup_latitude: pickupCoords.latitude,
        pickup_longitude: pickupCoords.longitude,
        pickup_address: pickupLocation,
        dropoff_latitude: dropoffCoords.latitude,
        dropoff_longitude: dropoffCoords.longitude,
        dropoff_address: dropoffLocation,
        vehicle_type_id: vehicleType.id,
        ride_type: rideType.id,
        scheduled_pickup_time:
          rideType.id === 'scheduled' ? rideDate.toISOString() : null,
        passenger_count: passengerCount,
        goods_weight_kg: rideType.id === 'goods' ? goodsWeight : null,
        promo_code: promoCode || null,
      };

      const response = await apiRequest({
        endpoint: '/api/bookings/create',
        method: 'POST',
        body: bookingData,
      });

      if (response.data?.booking_id) {
        // Navigate to ride details
        navigation.navigate('RideDetails', {
          bookingId: response.data.booking_id,
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
        {/* Header with back button */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
          >
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Booking Details</Text>
          <View style={styles.headerSpacer} />
        </View>

        {/* Service Summary */}
        <View style={styles.serviceSummary}>
          <View style={styles.serviceBadge}>
            <Text style={styles.serviceBadgeIcon}>{vehicleType.icon}</Text>
            <View style={styles.serviceBadgeText}>
              <Text style={styles.serviceBadgeName}>{vehicleType.name}</Text>
              <Text style={styles.serviceBadgeType}>{rideType.name}</Text>
            </View>
          </View>
        </View>

        {/* Location Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📍 LOCATIONS</Text>

          {/* Pickup Location */}
          <View style={styles.locationGroup}>
            <Text style={styles.locationLabel}>Pickup</Text>
            <View style={styles.locationInputContainer}>
              <Text style={styles.locationIcon}>📍</Text>
              <TextInput
                ref={pickupInputRef}
                style={styles.locationInput}
                placeholder="Enter pickup location"
                value={pickupLocation}
                onChangeText={(text) => handleLocationSearch(text, true)}
                placeholderTextColor={COLORS.textSecondary}
              />
              {pickupCoords && (
                <Text style={styles.checkIcon}>✓</Text>
              )}
            </View>

            {/* Quick select saved places */}
            {savedPlaces.length > 0 && (
              <SavedPlacesQuickSelect
                places={savedPlaces}
                onSelect={(place) => {
                  setPickupLocation(place.label);
                  setPickupCoords({
                    latitude: place.latitude,
                    longitude: place.longitude,
                  });
                }}
              />
            )}
          </View>

          {/* Dropoff Location */}
          <View style={styles.locationGroup}>
            <Text style={styles.locationLabel}>Dropoff</Text>
            <View style={styles.locationInputContainer}>
              <Text style={styles.locationIcon}>📍</Text>
              <TextInput
                ref={dropoffInputRef}
                style={styles.locationInput}
                placeholder="Enter dropoff location"
                value={dropoffLocation}
                onChangeText={(text) => handleLocationSearch(text, false)}
                placeholderTextColor={COLORS.textSecondary}
              />
              {dropoffCoords && (
                <Text style={styles.checkIcon}>✓</Text>
              )}
            </View>
          </View>

          {/* Swap locations button */}
          {pickupCoords && dropoffCoords && (
            <TouchableOpacity
              style={styles.swapButton}
              onPress={() => {
                [pickupLocation, dropoffLocation] = [dropoffLocation, pickupLocation];
                [pickupCoords, dropoffCoords] = [dropoffCoords, pickupCoords];
                setPickupLocation(pickupLocation);
                setDropoffLocation(dropoffLocation);
                setPickupCoords(pickupCoords);
                setDropoffCoords(dropoffCoords);
              }}
            >
              <Text style={styles.swapButtonText}>⬌ Swap</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Date/Time Section (for scheduled rides) */}
        {rideType.id === 'scheduled' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📅 DATE & TIME</Text>
            <TouchableOpacity
              style={styles.dateTimeButton}
              onPress={() => setShowSchedulePicker(true)}
            >
              <Text style={styles.dateTimeText}>
                {rideDate.toLocaleDateString()} at{' '}
                {rideDate.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Passenger Count / Goods Weight */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            {rideType.id === 'goods' ? '📦 CARGO DETAILS' : '👥 PASSENGERS'}
          </Text>

          {rideType.id === 'goods' ? (
            <>
              <View style={styles.counterGroup}>
                <Text style={styles.counterLabel}>Weight (kg)</Text>
                <View style={styles.counterContainer}>
                  <TouchableOpacity
                    style={styles.counterButton}
                    onPress={() =>
                      setGoodsWeight(Math.max(0, goodsWeight - 1))
                    }
                  >
                    <Text style={styles.counterButtonText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.counterValue}>{goodsWeight}</Text>
                  <TouchableOpacity
                    style={styles.counterButton}
                    onPress={() => setGoodsWeight(goodsWeight + 1)}
                  >
                    <Text style={styles.counterButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={styles.counterGroup}>
                <Text style={styles.counterLabel}>Number of Passengers</Text>
                <View style={styles.counterContainer}>
                  <TouchableOpacity
                    style={styles.counterButton}
                    onPress={() =>
                      setPassengerCount(Math.max(1, passengerCount - 1))
                    }
                  >
                    <Text style={styles.counterButtonText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.counterValue}>{passengerCount}</Text>
                  <TouchableOpacity
                    style={styles.counterButton}
                    onPress={() => setPassengerCount(passengerCount + 1)}
                  >
                    <Text style={styles.counterButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </View>

        {/* Promo Code */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🎟️ PROMO CODE</Text>
          <View style={styles.promoContainer}>
            <TextInput
              style={styles.promoInput}
              placeholder="Enter promo code (optional)"
              value={promoCode}
              onChangeText={setPromoCode}
              placeholderTextColor={COLORS.textSecondary}
            />
            {promoCode && (
              <TouchableOpacity
                onPress={() => setPromoCode('')}
                style={styles.clearPromo}
              >
                <Text style={styles.clearPromoText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Fare Estimate */}
        {estimatedFare !== null && (
          <View style={styles.fareEstimate}>
            <Text style={styles.fareEstimateTitle}>Fare Estimate</Text>

            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Distance:</Text>
              <Text style={styles.fareValue}>
                {estimatedDistance?.toFixed(2)} km
              </Text>
            </View>

            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Duration:</Text>
              <Text style={styles.fareValue}>
                ~{estimatedDuration} min
              </Text>
            </View>

            <View style={styles.fareDivider} />

            <View style={styles.fareRow}>
              <Text style={styles.fareAmount}>Total Estimated Fare:</Text>
              <Text style={styles.fareAmountValue}>
                ₹ {estimatedFare.toFixed(2)}
              </Text>
            </View>
          </View>
        )}

        {/* Spacer */}
        <View style={styles.spacer} />
      </ScrollView>

      {/* Book Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.bookButton,
            (!pickupCoords || !dropoffCoords || loading) &&
              styles.bookButtonDisabled,
          ]}
          onPress={handleBookRide}
          disabled={!pickupCoords || !dropoffCoords || loading}
        >
          {loading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={styles.bookButtonText}>Find Driver</Text>
              <Text style={styles.bookButtonArrow}>→</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Schedule Picker Modal */}
      {showSchedulePicker && (
        <ScheduledPickupPicker
          visible={showSchedulePicker}
          selectedDate={rideDate}
          onDateChange={setRideDate}
          onClose={() => setShowSchedulePicker(false)}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  scrollContent: {
    padding: 16,
    paddingBottom: 100,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
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
    width: 50,
  },

  serviceSummary: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: 12,
    padding: 12,
    marginBottom: 24,
  },

  serviceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  serviceBadgeIcon: {
    fontSize: 40,
  },

  serviceBadgeText: {
    flex: 1,
  },

  serviceBadgeName: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.text,
  },

  serviceBadgeType: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },

  section: {
    marginBottom: 24,
  },

  sectionTitle: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.text,
    marginBottom: 12,
  },

  locationGroup: {
    marginBottom: 16,
  },

  locationLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginBottom: 8,
    fontWeight: '600',
  },

  locationInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    paddingVertical: 4,
    ...SHADOWS.small,
  },

  locationIcon: {
    fontSize: 18,
    marginRight: 8,
  },

  locationInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    ...TYPOGRAPHY.body,
    color: COLORS.text,
  },

  checkIcon: {
    fontSize: 18,
    color: COLORS.success,
  },

  swapButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },

  swapButtonText: {
    color: COLORS.primary,
    fontWeight: '600',
  },

  dateTimeButton: {
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 12,
    paddingHorizontal: 16,
    ...SHADOWS.small,
  },

  dateTimeText: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
  },

  counterGroup: {
    marginBottom: 12,
  },

  counterLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginBottom: 8,
    fontWeight: '600',
  },

  counterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },

  counterButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    ...SHADOWS.small,
  },

  counterButtonText: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
  },

  counterValue: {
    ...TYPOGRAPHY.heading2,
    color: COLORS.text,
    minWidth: 40,
    textAlign: 'center',
  },

  promoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    ...SHADOWS.small,
  },

  promoInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    ...TYPOGRAPHY.body,
    color: COLORS.text,
  },

  clearPromo: {
    paddingHorizontal: 8,
  },

  clearPromoText: {
    fontSize: 20,
    color: COLORS.textSecondary,
  },

  fareEstimate: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },

  fareEstimateTitle: {
    ...TYPOGRAPHY.subheading,
    color: COLORS.text,
    marginBottom: 12,
  },

  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },

  fareLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },

  fareValue: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    fontWeight: '600',
  },

  fareDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 12,
  },

  fareAmount: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.text,
  },

  fareAmountValue: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.primary,
    fontWeight: 'bold',
  },

  spacer: {
    height: 20,
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
