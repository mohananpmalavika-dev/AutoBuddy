import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../theme';
import { apiRequest } from '../lib/api';

/**
 * ServiceSelectionScreen
 * Step 1 of Total Mobility Platform booking flow
 * 
 * Users select:
 * - Vehicle Type (Auto, Taxi, XL, Traveller, Bus, Truck, etc.)
 * - Ride Type (Instant, Scheduled, Rental/Hourly, Airport, Corporate, Tourism, Goods)
 * 
 * Then tap "Continue" to proceed to BookingDetailsScreen
 */

const ServiceSelectionScreen = ({ navigation, route }) => {
  const [selectedVehicleType, setSelectedVehicleType] = useState(null);
  const [selectedRideType, setSelectedRideType] = useState(null);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [rideTypes, setRideTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Vehicle types with categories and sub-types
  const VEHICLE_TYPES = [
    {
      id: 'auto',
      name: 'Auto',
      icon: '🛺',
      description: 'Budget friendly',
      color: '#FFA500',
      subtypes: ['Standard'],
    },
    {
      id: 'taxi',
      name: 'Taxi',
      icon: '🚖',
      description: 'Comfortable ride',
      color: '#FFD700',
      subtypes: ['Sedan', 'Hatchback'],
    },
    {
      id: 'xl',
      name: 'XL',
      icon: '🚗',
      description: 'More space',
      color: '#4169E1',
      subtypes: ['SUV', 'Wagon'],
    },
    {
      id: 'traveller',
      name: 'Traveller',
      icon: '🚐',
      description: 'Group travel',
      color: '#20B2AA',
      subtypes: ['6-seater', '8-seater'],
    },
    {
      id: 'bus',
      name: 'Bus',
      icon: '🚌',
      description: 'Large groups',
      color: '#DC143C',
      subtypes: ['City Bus', 'Coach'],
    },
    {
      id: 'minitruck',
      name: 'Mini Truck',
      icon: '🚚',
      description: 'Small goods',
      color: '#8B4513',
      subtypes: ['500kg', '1000kg'],
    },
    {
      id: 'truck',
      name: 'Truck',
      icon: '🚛',
      description: 'Heavy goods',
      color: '#654321',
      subtypes: ['2.5T', '5T', '10T'],
    },
  ];

  // Ride types
  const RIDE_TYPES = [
    {
      id: 'instant',
      name: 'Instant Ride',
      icon: '⚡',
      description: 'Book now, ride immediately',
      color: '#FF6B6B',
    },
    {
      id: 'scheduled',
      name: 'Scheduled Ride',
      icon: '📅',
      description: 'Book for later time',
      color: '#4ECDC4',
    },
    {
      id: 'rental',
      name: 'Rental / Hourly',
      icon: '⏰',
      description: 'Hourly rental service',
      color: '#45B7D1',
    },
    {
      id: 'airport',
      name: 'Airport',
      icon: '✈️',
      description: 'Airport transfer',
      color: '#96CEB4',
    },
    {
      id: 'corporate',
      name: 'Corporate',
      icon: '🏢',
      description: 'Business travel',
      color: '#9B59B6',
    },
    {
      id: 'tourism',
      name: 'Tourism',
      icon: '🗺️',
      description: 'Sightseeing tours',
      color: '#E74C3C',
    },
    {
      id: 'goods',
      name: 'Goods / Logistics',
      icon: '📦',
      description: 'Cargo delivery',
      color: '#F39C12',
    },
  ];

  useEffect(() => {
    loadServiceData();
  }, []);

  const loadServiceData = async () => {
    try {
      setLoading(true);
      
      // Fetch available vehicle types from backend
      const vehiclesResponse = await apiRequest({
        endpoint: '/api/admin/vehicle-types/public/all',
        method: 'GET',
      });

      // Fetch available ride types from backend
      const rideTypesResponse = await apiRequest({
        endpoint: '/api/ride-types/public/all',
        method: 'GET',
      });

      setVehicleTypes(vehiclesResponse.data || VEHICLE_TYPES);
      setRideTypes(rideTypesResponse.data || RIDE_TYPES);
      setError(null);
    } catch (err) {
      console.error('Error loading service data:', err);
      // Fall back to static data if API fails
      setVehicleTypes(VEHICLE_TYPES);
      setRideTypes(RIDE_TYPES);
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    if (!selectedVehicleType) {
      Alert.alert('Please select a vehicle type');
      return;
    }
    if (!selectedRideType) {
      Alert.alert('Please select a ride type');
      return;
    }

    // Navigate to BookingDetailsScreen with selected service
    navigation.navigate('BookingDetails', {
      vehicleType: selectedVehicleType,
      rideType: selectedRideType,
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading services...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Choose Your Service</Text>
          <Text style={styles.subtitle}>
            Select vehicle type and ride type to get started
          </Text>
        </View>

        {/* Vehicle Type Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1️⃣ VEHICLE TYPE</Text>
          <Text style={styles.sectionDescription}>
            What type of vehicle do you need?
          </Text>

          <View style={styles.gridContainer}>
            {vehicleTypes.map((vehicle) => (
              <TouchableOpacity
                key={vehicle.id}
                style={[
                  styles.vehicleCard,
                  selectedVehicleType?.id === vehicle.id && styles.vehicleCardSelected,
                ]}
                onPress={() => setSelectedVehicleType(vehicle)}
              >
                <View
                  style={[
                    styles.vehicleIconBg,
                    { backgroundColor: vehicle.color + '20' },
                  ]}
                >
                  <Text style={styles.vehicleIcon}>{vehicle.icon}</Text>
                </View>

                <Text style={styles.vehicleName}>{vehicle.name}</Text>
                <Text style={styles.vehicleDescription}>
                  {vehicle.description}
                </Text>

                {selectedVehicleType?.id === vehicle.id && (
                  <View style={styles.checkmark}>
                    <Text style={styles.checkmarkText}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Subtypes for selected vehicle */}
          {selectedVehicleType && selectedVehicleType.subtypes && (
            <View style={styles.subtypesContainer}>
              <Text style={styles.subtypeTitle}>Vehicle Variants:</Text>
              <View style={styles.subtypesGrid}>
                {selectedVehicleType.subtypes.map((subtype) => (
                  <TouchableOpacity
                    key={subtype}
                    style={styles.subtypeChip}
                  >
                    <Text style={styles.subtypeText}>{subtype}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Ride Type Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2️⃣ RIDE TYPE</Text>
          <Text style={styles.sectionDescription}>
            How do you want to book?
          </Text>

          <View style={styles.gridContainer}>
            {rideTypes.map((ride) => (
              <TouchableOpacity
                key={ride.id}
                style={[
                  styles.rideTypeCard,
                  selectedRideType?.id === ride.id && styles.rideTypeCardSelected,
                ]}
                onPress={() => setSelectedRideType(ride)}
              >
                <View
                  style={[
                    styles.rideTypeIconBg,
                    { backgroundColor: ride.color + '20' },
                  ]}
                >
                  <Text style={styles.rideTypeIcon}>{ride.icon}</Text>
                </View>

                <Text style={styles.rideTypeName}>{ride.name}</Text>
                <Text style={styles.rideTypeDescription}>
                  {ride.description}
                </Text>

                {selectedRideType?.id === ride.id && (
                  <View style={styles.checkmark}>
                    <Text style={styles.checkmarkText}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Summary */}
        {selectedVehicleType && selectedRideType && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Your Selection</Text>
            <View style={styles.summaryContent}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Vehicle:</Text>
                <Text style={styles.summaryValue}>
                  {selectedVehicleType.icon} {selectedVehicleType.name}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryLabel}>Service:</Text>
                <Text style={styles.summaryValue}>
                  {selectedRideType.icon} {selectedRideType.name}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Spacer */}
        <View style={styles.spacer} />
      </ScrollView>

      {/* Continue Button */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[
            styles.continueButton,
            (!selectedVehicleType || !selectedRideType) && styles.continueButtonDisabled,
          ]}
          onPress={handleContinue}
          disabled={!selectedVehicleType || !selectedRideType}
        >
          <Text style={styles.continueButtonText}>
            Continue to Booking Details
          </Text>
          <Text style={styles.continueButtonArrow}>→</Text>
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
    padding: 16,
    paddingBottom: 100,
  },

  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  loadingText: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    marginTop: 12,
  },

  header: {
    marginBottom: 32,
    marginTop: 8,
  },

  title: {
    ...TYPOGRAPHY.heading1,
    color: COLORS.text,
    marginBottom: 8,
  },

  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },

  section: {
    marginBottom: 32,
  },

  sectionTitle: {
    ...TYPOGRAPHY.heading3,
    color: COLORS.text,
    marginBottom: 4,
  },

  sectionDescription: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginBottom: 16,
  },

  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },

  vehicleCard: {
    width: '48%',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },

  vehicleCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },

  vehicleIconBg: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },

  vehicleIcon: {
    fontSize: 32,
  },

  vehicleName: {
    ...TYPOGRAPHY.subheading,
    color: COLORS.text,
    marginBottom: 4,
  },

  vehicleDescription: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontSize: 11,
  },

  rideTypeCard: {
    width: '48%',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: COLORS.card,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
    ...SHADOWS.small,
  },

  rideTypeCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },

  rideTypeIconBg: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },

  rideTypeIcon: {
    fontSize: 28,
  },

  rideTypeName: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    marginBottom: 4,
    fontWeight: '600',
  },

  rideTypeDescription: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    textAlign: 'center',
    fontSize: 11,
  },

  checkmark: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },

  checkmarkText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },

  subtypesContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  subtypeTitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    marginBottom: 8,
    fontWeight: '600',
  },

  subtypesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  subtypeChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: COLORS.secondary + '20',
    borderWidth: 1,
    borderColor: COLORS.secondary,
  },

  subtypeText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.secondary,
    fontWeight: '500',
  },

  summaryCard: {
    backgroundColor: COLORS.primaryLight,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },

  summaryTitle: {
    ...TYPOGRAPHY.subheading,
    color: COLORS.text,
    marginBottom: 12,
  },

  summaryContent: {
    gap: 8,
  },

  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  summaryLabel: {
    ...TYPOGRAPHY.body,
    color: COLORS.textSecondary,
  },

  summaryValue: {
    ...TYPOGRAPHY.body,
    color: COLORS.text,
    fontWeight: '600',
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

  continueButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    ...SHADOWS.medium,
  },

  continueButtonDisabled: {
    backgroundColor: COLORS.disabled,
    opacity: 0.5,
  },

  continueButtonText: {
    ...TYPOGRAPHY.heading3,
    color: '#fff',
    fontWeight: '600',
  },

  continueButtonArrow: {
    fontSize: 20,
    color: '#fff',
  },
});

export default ServiceSelectionScreen;
