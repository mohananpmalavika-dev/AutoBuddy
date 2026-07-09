/**
 * Minimal Booking Screen
 * Clean, simple, voice-enabled ride booking interface
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Animated,
  Keyboard,
  Alert,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';

interface MinimalBookingScreenProps {
  token: string;
  user: any;
  onLogout: () => void;
}

type RideType = 'auto' | 'bike' | 'mini' | 'sedan' | 'suv' | 'premium' | 'rental_hourly' | 'rental_daily';
type VehicleCategory = 'instant' | 'rental';

export default function MinimalBookingScreen({ token, user }: MinimalBookingScreenProps) {
  // State
  const [pickupLocation, setPickupLocation] = useState('');
  const [dropoffLocation, setDropoffLocation] = useState('');
  const [selectedRideType, setSelectedRideType] = useState<RideType>('auto');
  const [vehicleCategory, setVehicleCategory] = useState<VehicleCategory>('instant');
  const [isListening, setIsListening] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<any>(null);
  const [rentalDuration, setRentalDuration] = useState(4); // hours for rental

  // Animation
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // Get current location on mount
  useEffect(() => {
    getCurrentLocation();
  }, []);

  // Voice pulse animation
  useEffect(() => {
    if (isListening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.3,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isListening]);

  // Slide in animation
  useEffect(() => {
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, []);

  const getCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Location permission is required');
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      setCurrentLocation(location);

      // Reverse geocode to get address
      const addresses = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });

      if (addresses.length > 0) {
        const addr = addresses[0];
        const currentAddr = `${addr.street || ''} ${addr.city || ''}`.trim();
        setPickupLocation(currentAddr || 'Current Location');
      }
    } catch (error) {
      console.error('Location error:', error);
    }
  };

  const handleVoiceInput = () => {
    setIsListening(true);
    
    // Speak prompt
    Speech.speak('Where would you like to go?', {
      language: 'en-US',
      pitch: 1.0,
      rate: 0.9,
    });

    // Simulate voice recognition (in production, use expo-speech-recognition)
    setTimeout(() => {
      // This is a placeholder - integrate actual voice recognition
      Alert.alert(
        'Voice Input',
        'Please say your destination',
        [
          {
            text: 'Cancel',
            onPress: () => setIsListening(false),
            style: 'cancel',
          },
          {
            text: 'Enter Text Instead',
            onPress: () => {
              setIsListening(false);
              // Focus dropoff input
            },
          },
        ]
      );
      setIsListening(false);
    }, 3000);
  };

  const handleBookRide = async () => {
    if (vehicleCategory === 'instant' && !dropoffLocation.trim()) {
      Alert.alert('Missing Information', 'Please enter your destination');
      return;
    }
    
    if (vehicleCategory === 'rental' && !pickupLocation.trim()) {
      Alert.alert('Missing Information', 'Please confirm pickup location');
      return;
    }

    setLoading(true);

    try {
      // API call to book ride
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_BASE_URL}/api/v1/rides/book`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          pickup_location: pickupLocation || 'Current Location',
          dropoff_location: vehicleCategory === 'rental' ? pickupLocation : dropoffLocation,
          ride_type: selectedRideType,
          vehicle_category: vehicleCategory,
          rental_duration: vehicleCategory === 'rental' ? rentalDuration : null,
          pickup_coords: currentLocation ? {
            latitude: currentLocation.coords.latitude,
            longitude: currentLocation.coords.longitude,
          } : null,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        Alert.alert(
          'Ride Requested!',
          'Finding a driver for you...',
          [
            {
              text: 'OK',
              onPress: () => {
                setDropoffLocation('');
                // Navigate to active ride screen
              },
            },
          ]
        );
      } else {
        throw new Error('Booking failed');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to book ride. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Instant ride types (3-wheelers and 4-wheelers)
  const instantRides = [
    { id: 'auto', name: 'Auto', icon: 'local-taxi', price: '₹', eta: '2 min', seats: '3', desc: '3-Wheeler' },
    { id: 'bike', name: 'Bike', icon: 'two-wheeler', price: '₹', eta: '1 min', seats: '1', desc: 'Two-Wheeler' },
    { id: 'mini', name: 'Mini', icon: 'directions-car', price: '₹₹', eta: '3 min', seats: '4', desc: 'Hatchback' },
    { id: 'sedan', name: 'Sedan', icon: 'drive-eta', price: '₹₹₹', eta: '4 min', seats: '4', desc: 'Sedan' },
    { id: 'suv', name: 'SUV', icon: 'airport-shuttle', price: '₹₹₹₹', eta: '5 min', seats: '6', desc: 'SUV/MUV' },
    { id: 'premium', name: 'Premium', icon: 'local-taxi', price: '₹₹₹₹₹', eta: '6 min', seats: '4', desc: 'Luxury' },
  ];

  // Rental options
  const rentalOptions = [
    { id: 'rental_hourly', name: 'Hourly', icon: 'schedule', price: '₹₹', duration: '4-12 hrs', desc: 'Flexible hours' },
    { id: 'rental_daily', name: 'Daily', icon: 'today', price: '₹₹₹', duration: '1-7 days', desc: 'Full day' },
  ];

  const currentRideTypes = vehicleCategory === 'instant' ? instantRides : rentalOptions;

  const animatedStyle = {
    transform: [
      {
        translateY: slideAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [50, 0],
        }),
      },
    ],
    opacity: slideAnim,
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>Hi, {user?.name || 'there'} 👋</Text>
          <Text style={styles.subtitle}>Where to?</Text>
        </View>

        {/* Location Inputs */}
        <Animated.View style={[styles.inputCard, animatedStyle]}>
          {/* Pickup */}
          <View style={styles.inputRow}>
            <MaterialIcons name="my-location" size={20} color="#10B981" />
            <TextInput
              style={styles.input}
              placeholder="Pickup location"
              placeholderTextColor="#9CA3AF"
              value={pickupLocation}
              onChangeText={setPickupLocation}
              editable={!loading}
            />
            <TouchableOpacity onPress={getCurrentLocation}>
              <MaterialIcons name="gps-fixed" size={20} color="#3B82F6" />
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {/* Dropoff */}
          <View style={styles.inputRow}>
            <MaterialIcons name="location-on" size={20} color="#EF4444" />
            <TextInput
              style={styles.input}
              placeholder={vehicleCategory === 'rental' ? 'Pickup location (optional)' : 'Where to?'}
              placeholderTextColor="#9CA3AF"
              value={dropoffLocation}
              onChangeText={setDropoffLocation}
              editable={!loading && vehicleCategory === 'instant'}
              autoFocus={vehicleCategory === 'instant'}
            />
            {dropoffLocation.length > 0 && (
              <TouchableOpacity onPress={() => setDropoffLocation('')}>
                <MaterialIcons name="close" size={20} color="#9CA3AF" />
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>

        {/* Voice Button */}
        <Animated.View style={[styles.voiceContainer, animatedStyle]}>
          <TouchableOpacity
            style={[styles.voiceButton, isListening && styles.voiceButtonActive]}
            onPress={handleVoiceInput}
            disabled={loading}
          >
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <MaterialIcons
                name={isListening ? 'mic' : 'mic-none'}
                size={32}
                color={isListening ? '#EF4444' : '#3B82F6'}
              />
            </Animated.View>
          </TouchableOpacity>
          <Text style={styles.voiceText}>
            {isListening ? 'Listening...' : 'Tap to speak'}
          </Text>
        </Animated.View>

        {/* Category Toggle */}
        <Animated.View style={[styles.categoryToggle, animatedStyle]}>
          <TouchableOpacity
            style={[
              styles.categoryButton,
              vehicleCategory === 'instant' && styles.categoryButtonActive,
            ]}
            onPress={() => {
              setVehicleCategory('instant');
              setSelectedRideType('auto');
            }}
            disabled={loading}
          >
            <MaterialIcons
              name="directions-car"
              size={20}
              color={vehicleCategory === 'instant' ? '#FFFFFF' : '#6B7280'}
            />
            <Text
              style={[
                styles.categoryButtonText,
                vehicleCategory === 'instant' && styles.categoryButtonTextActive,
              ]}
            >
              Instant Ride
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.categoryButton,
              vehicleCategory === 'rental' && styles.categoryButtonActive,
            ]}
            onPress={() => {
              setVehicleCategory('rental');
              setSelectedRideType('rental_hourly');
            }}
            disabled={loading}
          >
            <MaterialIcons
              name="event"
              size={20}
              color={vehicleCategory === 'rental' ? '#FFFFFF' : '#6B7280'}
            />
            <Text
              style={[
                styles.categoryButtonText,
                vehicleCategory === 'rental' && styles.categoryButtonTextActive,
              ]}
            >
              Rental
            </Text>
          </TouchableOpacity>
        </Animated.View>

        {/* Vehicle Types */}
        <Animated.View style={[styles.rideTypesContainer, animatedStyle]}>
          <Text style={styles.sectionTitle}>
            {vehicleCategory === 'instant' ? 'Choose Vehicle' : 'Rental Duration'}
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.rideTypesScroll}
          >
            {currentRideTypes.map((ride) => (
              <TouchableOpacity
                key={ride.id}
                style={[
                  styles.rideTypeCard,
                  selectedRideType === ride.id && styles.rideTypeCardSelected,
                ]}
                onPress={() => setSelectedRideType(ride.id as RideType)}
                disabled={loading}
              >
                <MaterialIcons
                  name={ride.icon as any}
                  size={32}
                  color={selectedRideType === ride.id ? '#FFFFFF' : '#374151'}
                />
                <Text
                  style={[
                    styles.rideTypeName,
                    selectedRideType === ride.id && styles.rideTypeNameSelected,
                  ]}
                >
                  {ride.name}
                </Text>
                <Text
                  style={[
                    styles.rideTypeDesc,
                    selectedRideType === ride.id && styles.rideTypeDescSelected,
                  ]}
                >
                  {ride.desc}
                </Text>
                <Text
                  style={[
                    styles.rideTypePrice,
                    selectedRideType === ride.id && styles.rideTypePriceSelected,
                  ]}
                >
                  {ride.price}
                </Text>
                {vehicleCategory === 'instant' ? (
                  <>
                    <Text
                      style={[
                        styles.rideTypeEta,
                        selectedRideType === ride.id && styles.rideTypeEtaSelected,
                      ]}
                    >
                      {ride.eta}
                    </Text>
                    <Text
                      style={[
                        styles.rideTypeSeats,
                        selectedRideType === ride.id && styles.rideTypeSeatsSelected,
                      ]}
                    >
                      {ride.seats} seats
                    </Text>
                  </>
                ) : (
                  <Text
                    style={[
                      styles.rideTypeEta,
                      selectedRideType === ride.id && styles.rideTypeEtaSelected,
                    ]}
                  >
                    {ride.duration}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </Animated.View>

        {/* Rental Duration Picker (if rental selected) */}
        {vehicleCategory === 'rental' && (
          <Animated.View style={[styles.rentalDurationContainer, animatedStyle]}>
            <Text style={styles.sectionTitle}>Duration</Text>
            <View style={styles.durationPicker}>
              <TouchableOpacity
                style={styles.durationButton}
                onPress={() => setRentalDuration(Math.max(1, rentalDuration - 1))}
              >
                <MaterialIcons name="remove" size={24} color="#3B82F6" />
              </TouchableOpacity>
              <View style={styles.durationDisplay}>
                <Text style={styles.durationValue}>{rentalDuration}</Text>
                <Text style={styles.durationUnit}>
                  {selectedRideType === 'rental_hourly' ? 'Hours' : 'Days'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.durationButton}
                onPress={() => setRentalDuration(rentalDuration + 1)}
              >
                <MaterialIcons name="add" size={24} color="#3B82F6" />
              </TouchableOpacity>
            </View>
          </Animated.View>
        )}

        {/* Book Button */}
        <Animated.View style={[styles.bookContainer, animatedStyle]}>
          <TouchableOpacity
            style={[
              styles.bookButton,
              ((vehicleCategory === 'instant' && !dropoffLocation) || loading) && styles.bookButtonDisabled,
            ]}
            onPress={handleBookRide}
            disabled={(vehicleCategory === 'instant' && !dropoffLocation) || loading}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <MaterialIcons name="send" size={20} color="#FFFFFF" />
                <Text style={styles.bookButtonText}>Book Ride</Text>
              </>
            )}
          </TouchableOpacity>
        </Animated.View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <TouchableOpacity style={styles.quickActionButton}>
            <MaterialIcons name="schedule" size={20} color="#6B7280" />
            <Text style={styles.quickActionText}>Schedule</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickActionButton}>
            <MaterialIcons name="payment" size={20} color="#6B7280" />
            <Text style={styles.quickActionText}>Payment</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.quickActionButton}>
            <MaterialIcons name="receipt-long" size={20} color="#6B7280" />
            <Text style={styles.quickActionText}>History</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  header: {
    marginBottom: 24,
  },
  greeting: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 18,
    color: '#6B7280',
  },
  inputCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#111827',
    paddingVertical: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 12,
  },
  voiceContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  voiceButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
    marginBottom: 12,
  },
  voiceButtonActive: {
    backgroundColor: '#FEE2E2',
    shadowColor: '#EF4444',
  },
  voiceText: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  rideTypesContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  rideTypes: {
    flexDirection: 'row',
    gap: 12,
  },
  rideTypeCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  rideTypeCardSelected: {
    backgroundColor: '#3B82F6',
    borderColor: '#2563EB',
  },
  rideTypeName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginTop: 8,
  },
  rideTypeNameSelected: {
    color: '#FFFFFF',
  },
  rideTypePrice: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  rideTypePriceSelected: {
    color: '#DBEAFE',
  },
  rideTypeEta: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  rideTypeEtaSelected: {
    color: '#DBEAFE',
  },
  bookContainer: {
    marginBottom: 24,
  },
  bookButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    padding: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  bookButtonDisabled: {
    backgroundColor: '#D1D5DB',
    shadowOpacity: 0,
    elevation: 0,
  },
  bookButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 12,
  },
  quickActionButton: {
    alignItems: 'center',
    padding: 12,
  },
  quickActionText: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
});
  categoryToggle: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  categoryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  categoryButtonActive: {
    backgroundColor: '#3B82F6',
    borderColor: '#2563EB',
  },
  categoryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6B7280',
  },
  categoryButtonTextActive: {
    color: '#FFFFFF',
  },
  rideTypesScroll: {
    gap: 12,
    paddingRight: 20,
  },
  rideTypeDesc: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  rideTypeDescSelected: {
    color: '#DBEAFE',
  },
  rideTypeSeats: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  rideTypeSeatsSelected: {
    color: '#DBEAFE',
  },
  rentalDurationContainer: {
    marginBottom: 24,
  },
  durationPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    gap: 24,
  },
  durationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationDisplay: {
    alignItems: 'center',
    minWidth: 100,
  },
  durationValue: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#111827',
  },
  durationUnit: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
