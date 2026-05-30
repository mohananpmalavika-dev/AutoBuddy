import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'react-native';
import { formatToIST } from '../utils/time';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../theme';
import { bookingAPI, userAPI } from '../services/apiClient';
import { getSocket } from '../services/socketClient';
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
  // Extract service data from route params
  const service = route.params?.service || {};
  const {
    vehicle_type_id,
    vehicle_subtype_id,
    vehicle_subtype_name,
    vehicle_subtype_capacity,
    vehicle_name,
    vehicle_icon,
    vehicle_capacity,
    capacity_unit,
    ride_type,
    ride_type_name,
  } = service;

  // Fallback to old params for compatibility
  const vehicleType = { id: vehicle_type_id, name: vehicle_name, icon: vehicle_icon };
  const rideType = { id: ride_type, name: ride_type_name };
  const selectedCapacity = Number(vehicle_subtype_capacity || vehicle_capacity || 0);
  const selectedCapacityUnit = capacity_unit || 'passengers';

  const [pickupLocation, setPickupLocation] = useState('');
  const [dropoffLocation, setDropoffLocation] = useState('');
  const [pickupCoords, setPickupCoords] = useState(null);
  const [dropoffCoords, setDropoffCoords] = useState(null);
  const [rideDate, setRideDate] = useState(new Date());
  const [passengerCount, setPassengerCount] = useState(1);
  
  // Ride-type specific fields
  const [goodsWeight, setGoodsWeight] = useState(0);
  const [goodsType, setGoodsType] = useState('package');
  const [loadingHelpRequired, setLoadingHelpRequired] = useState(false);
  const [airportTerminal, setAirportTerminal] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [rentalHours, setRentalHours] = useState(4);
  const [tourHours, setTourHours] = useState(4);
  const [tourItinerary, setTourItinerary] = useState('');
  
  const [promoCode, setPromoCode] = useState('');
  const [estimatedFare, setEstimatedFare] = useState(null);
  const [estimatedDistance, setEstimatedDistance] = useState(null);
  const [estimatedDuration, setEstimatedDuration] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showSchedulePicker, setShowSchedulePicker] = useState(false);
  const [savedPlaces, setSavedPlaces] = useState([]);

  const pickupInputRef = useRef(null);
  const dropoffInputRef = useRef(null);

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
      const places = await userAPI.getSavedPlaces();
      setSavedPlaces(places || []);
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
    }
  };

  const calculateFare = useCallback(async () => {
    try {
      setLoading(true);

      // Build request with all ride-type specific fields
      const fareRequest = {
        pickup_latitude: pickupCoords.latitude,
        pickup_longitude: pickupCoords.longitude,
        dropoff_latitude: dropoffCoords.latitude,
        dropoff_longitude: dropoffCoords.longitude,
        ride_type: ride_type,
        vehicle_type_id: vehicle_type_id,
        vehicle_subtype_id: vehicle_subtype_id || null,
        passenger_count: passengerCount,
        scheduled_datetime: ride_type === 'scheduled' ? rideDate.toISOString() : null,
        pickup_region: service.pickup_region || null,
        pickup_district: service.pickup_district || null,
        pickup_pincode: service.pickup_pincode || null,
      };

      // Add ride-type specific fields if present
      if (ride_type === 'goods') {
        fareRequest.goods_weight_kg = goodsWeight;
      } else if (ride_type === 'rental' || ride_type === 'tourism') {
        fareRequest.rental_hours = ride_type === 'rental' ? rentalHours : tourHours;
      }

      const fareData = await bookingAPI.estimateFare(fareRequest);

      if (fareData?.estimated_fare != null) {
        setEstimatedFare(fareData.estimated_fare);
        setEstimatedDistance(fareData.distance_km);
        setEstimatedDuration(fareData.estimated_time_minutes);
      }
    } catch (error) {
      console.error('Error calculating fare:', error);
    } finally {
      setLoading(false);
    }
  }, [
    dropoffCoords,
    goodsWeight,
    passengerCount,
    pickupCoords,
    rentalHours,
    rideDate,
    ride_type,
    service.pickup_district,
    service.pickup_pincode,
    service.pickup_region,
    tourHours,
    vehicle_subtype_id,
    vehicle_type_id,
  ]);

  useEffect(() => {
    // Get current location for pickup
    const timer = setTimeout(() => {
      getCurrentLocation();
      fetchSavedPlaces();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Calculate fare when locations change
    if (pickupCoords && dropoffCoords) {
      const timer = setTimeout(() => {
        calculateFare();
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [
    calculateFare,
    dropoffCoords,
    pickupCoords,
  ]);

  const handleBookRide = async () => {
    if (!pickupCoords || !dropoffCoords) {
      Alert.alert('Please enter both pickup and dropoff locations');
      return;
    }
    if (ride_type === 'goods' && goodsWeight <= 0) {
      Alert.alert('Enter Goods Weight', 'Please enter the goods weight before booking.');
      return;
    }
    if (ride_type === 'goods' && selectedCapacityUnit === 'kg' && selectedCapacity > 0 && goodsWeight > selectedCapacity) {
      Alert.alert('Capacity Exceeded', `Selected vehicle can carry up to ${selectedCapacity} kg.`);
      return;
    }
    if (ride_type !== 'goods' && selectedCapacityUnit !== 'kg' && selectedCapacity > 0 && passengerCount > selectedCapacity) {
      Alert.alert('Capacity Exceeded', `Selected vehicle seats up to ${selectedCapacity} passengers.`);
      return;
    }
    if (ride_type === 'airport' && (!airportTerminal.trim() || !flightNumber.trim())) {
      Alert.alert('Flight Details Required', 'Please enter terminal and flight number for airport rides.');
      return;
    }

    try {
      setLoading(true);

      // Build comprehensive booking data
      const bookingData = {
        pickup_latitude: pickupCoords.latitude,
        pickup_longitude: pickupCoords.longitude,
        pickup_location: pickupLocation,
        dropoff_latitude: dropoffCoords.latitude,
        dropoff_longitude: dropoffCoords.longitude,
        dropoff_location: dropoffLocation,
        vehicle_type_id: vehicle_type_id,
        vehicle_subtype_id: vehicle_subtype_id || null,
        ride_type: ride_type,
        passenger_count: passengerCount,
        scheduled_datetime: ride_type === 'scheduled' ? rideDate.toISOString() : null,
        promo_code: promoCode || null,
        pickup_region: service.pickup_region || null,
        pickup_district: service.pickup_district || null,
        pickup_pincode: service.pickup_pincode || null,
      };

      // Add ride-type specific fields
      if (ride_type === 'goods') {
        bookingData.goods_details = {
          goods_weight_kg: goodsWeight,
          goods_type: goodsType.trim() || 'package',
          loading_help_required: loadingHelpRequired,
        };
      } else if (ride_type === 'airport') {
        bookingData.airport_details = {
          terminal: airportTerminal.trim(),
          flight_number: flightNumber.trim(),
        };
      } else if (ride_type === 'rental') {
        bookingData.rental_details = {
          rental_hours: rentalHours,
          rental_start_datetime: rideDate.toISOString(),
          with_driver: true,
        };
      } else if (ride_type === 'tourism') {
        bookingData.tourism_details = {
          tour_hours: tourHours,
          tour_itinerary: tourItinerary.trim() || null,
          return_location: dropoffLocation || null,
        };
      }

      const bookingResponse = await bookingAPI.createBooking(bookingData);
      const bookingId = bookingResponse?.booking_id || bookingResponse?.id;

      if (bookingId) {
        // Emit real-time Socket.IO event for live updates
        const socket = getSocket();
        socket.emit('booking_created', { booking_id: bookingId });
        
        // Navigate to ride details
        navigation.navigate('RideDetails', {
          bookingId,
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
              {!!vehicle_subtype_name && (
                <Text style={styles.serviceBadgeMeta}>{vehicle_subtype_name}</Text>
              )}
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
                {formatToIST(rideDate, { dateStyle: 'medium' })} at{' '}
                {formatToIST(rideDate, { timeStyle: 'short' })}
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

        {/* Ride-Type Specific Fields */}
        
        {/* GOODS DETAILS */}
        {ride_type === 'goods' && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📦 GOODS TYPE</Text>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Type of Goods</Text>
                <View style={styles.pickupContainer}>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., package, furniture, electronics"
                    value={goodsType}
                    onChangeText={setGoodsType}
                    placeholderTextColor={COLORS.textSecondary}
                  />
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🏋️ LOADING ASSISTANCE</Text>
              <TouchableOpacity
                style={[styles.checkboxContainer, loadingHelpRequired && styles.checkboxChecked]}
                onPress={() => setLoadingHelpRequired(!loadingHelpRequired)}
              >
                <Text style={styles.checkbox}>{loadingHelpRequired ? '☑' : '☐'}</Text>
                <Text style={styles.checkboxLabel}>Need loading assistance? (₹50 extra)</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* AIRPORT DETAILS */}
        {ride_type === 'airport' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>✈️ FLIGHT DETAILS</Text>
            
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Terminal (Optional)</Text>
              <View style={styles.pickupContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., A, B, T3"
                  value={airportTerminal}
                  onChangeText={setAirportTerminal}
                  placeholderTextColor={COLORS.textSecondary}
                />
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Flight Number (Optional)</Text>
              <View style={styles.pickupContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., AI123"
                  value={flightNumber}
                  onChangeText={setFlightNumber}
                  placeholderTextColor={COLORS.textSecondary}
                />
              </View>
            </View>
          </View>
        )}

        {/* RENTAL DETAILS */}
        {ride_type === 'rental' && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>⏰ RENTAL DURATION</Text>

            <View style={styles.counterGroup}>
              <Text style={styles.counterLabel}>Rental Hours</Text>
              <View style={styles.counterContainer}>
                <TouchableOpacity
                  style={styles.counterButton}
                  onPress={() => setRentalHours(Math.max(1, rentalHours - 1))}
                >
                  <Text style={styles.counterButtonText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.counterValue}>{rentalHours} hours</Text>
                <TouchableOpacity
                  style={styles.counterButton}
                  onPress={() => setRentalHours(rentalHours + 1)}
                >
                  <Text style={styles.counterButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* TOURISM DETAILS */}
        {ride_type === 'tourism' && (
          <>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🗺️ TOUR DURATION</Text>

              <View style={styles.counterGroup}>
                <Text style={styles.counterLabel}>Tour Hours</Text>
                <View style={styles.counterContainer}>
                  <TouchableOpacity
                    style={styles.counterButton}
                    onPress={() => setTourHours(Math.max(2, tourHours - 1))}
                  >
                    <Text style={styles.counterButtonText}>−</Text>
                  </TouchableOpacity>
                  <Text style={styles.counterValue}>{tourHours} hours</Text>
                  <TouchableOpacity
                    style={styles.counterButton}
                    onPress={() => setTourHours(tourHours + 1)}
                  >
                    <Text style={styles.counterButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📋 TOUR ITINERARY</Text>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Planned Stops & Route (Optional)</Text>
                <View style={styles.pickupContainer}>
                  <TextInput
                    style={[styles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                    placeholder="Enter stops and route details"
                    value={tourItinerary}
                    onChangeText={setTourItinerary}
                    placeholderTextColor={COLORS.textSecondary}
                    multiline
                  />
                </View>
              </View>
            </View>
          </>
        )}

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

  serviceBadgeMeta: {
    ...TYPOGRAPHY.caption,
    color: COLORS.primary,
    fontWeight: '600',
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

  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: COLORS.background,
  },

  checkboxChecked: {
    borderColor: COLORS.primary,
    backgroundColor: '#E8F5E9',
  },

  checkbox: {
    fontSize: 18,
    marginRight: 12,
    color: COLORS.primary,
  },

  checkboxLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    flex: 1,
  },

  fieldGroup: {
    marginBottom: 16,
  },

  fieldLabel: {
    ...TYPOGRAPHY.label,
    color: COLORS.text,
    marginBottom: 6,
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
