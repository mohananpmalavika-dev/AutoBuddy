import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

function getVehicleId(vehicle) {
  return vehicle?.id || vehicle?.vehicle_type_id;
}

function normalizeVehicleSubtype(subtype) {
  if (!subtype) {
    return null;
  }
  if (typeof subtype === 'string') {
    return { id: subtype, name: subtype };
  }
  return {
    ...subtype,
    id: subtype.id || subtype.vehicle_subtype_id || subtype.name,
    name: subtype.name || subtype.label || subtype.id || 'Variant',
  };
}

function normalizeVehicleSubtypes(vehicle) {
  return (vehicle?.subtypes || [])
    .map(normalizeVehicleSubtype)
    .filter(Boolean);
}

function getVehicleDescription(vehicle) {
  if (vehicle?.description) {
    return vehicle.description;
  }
  if (vehicle?.capacity_unit === 'kg') {
    return `Up to ${vehicle.capacity}${vehicle.capacity_unit}`;
  }
  return `${vehicle?.capacity || 1} ${vehicle?.capacity_unit || 'passengers'}`;
}

const ServiceSelectionScreen = ({ navigation, route }) => {
  const pickupRegion = route?.params?.pickup_region;
  const pickupDistrict = route?.params?.pickup_district;
  const pickupPincode = route?.params?.pickup_pincode;
  const [selectedVehicleType, setSelectedVehicleType] = useState(null);
  const [selectedVehicleSubtype, setSelectedVehicleSubtype] = useState(null);
  const [selectedRideType, setSelectedRideType] = useState(null);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [filteredVehicles, setFilteredVehicles] = useState([]);
  const [rideTypes, setRideTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [compatibilityInfo, setCompatibilityInfo] = useState(null);

  // Vehicle types with categories and sub-types
  const VEHICLE_TYPES = useMemo(() => [
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
  ], []);

  // Ride types
  const RIDE_TYPES = useMemo(() => [
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
  ], []);

  const fetchCompatibleVehicles = useCallback(async (rideTypeId) => {
    try {
      // Fetch compatibility info from backend
      const response = await apiRequest(
        `/api/vehicles/public/compatibility/by-ride-type?ride_type=${encodeURIComponent(rideTypeId)}`,
        {
          method: 'GET',
          query: {
            region: pickupRegion,
            district: pickupDistrict,
            pincode: pickupPincode,
          },
        },
      );

      if (response.success === false) {
        // Fall back to all vehicles if API fails
        setFilteredVehicles(vehicleTypes);
        setCompatibilityInfo(null);
        return;
      }

      const compatibleVehicleIds = response.compatible_vehicles || [];
      setCompatibilityInfo(response);
      
      // Filter vehicles to show only compatible ones
      const filtered = vehicleTypes.filter(v => 
        compatibleVehicleIds.includes(getVehicleId(v))
      );
      
      setFilteredVehicles(filtered.length > 0 ? filtered : vehicleTypes);
    } catch (err) {
      console.error('Error fetching compatible vehicles:', err);
      // Fall back to all vehicles
      setFilteredVehicles(vehicleTypes);
      setCompatibilityInfo(null);
    }
  }, [pickupDistrict, pickupPincode, pickupRegion, vehicleTypes]);

  const loadServiceData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch available vehicle types from CANONICAL vehicles API
      const vehiclesResponse = await apiRequest('/api/vehicles/public/all', {
        method: 'GET',
        query: {
          region: pickupRegion,
          district: pickupDistrict,
          pincode: pickupPincode,
        },
      });

      // Fetch available ride types from backend
      const rideTypesResponse = await apiRequest('/api/ride-types/public/all', {
        method: 'GET',
      });

      setVehicleTypes(vehiclesResponse.data || vehiclesResponse || VEHICLE_TYPES);
      setRideTypes(rideTypesResponse.data || rideTypesResponse || RIDE_TYPES);
    } catch (err) {
      console.error('Error loading service data:', err);
      // Fall back to static data if API fails
      setVehicleTypes(VEHICLE_TYPES);
      setRideTypes(RIDE_TYPES);
    } finally {
      setLoading(false);
    }
  }, [RIDE_TYPES, VEHICLE_TYPES, pickupDistrict, pickupPincode, pickupRegion]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadServiceData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadServiceData]);

  // When ride type is selected, fetch compatible vehicles and filter
  useEffect(() => {
    if (selectedRideType) {
      const timer = setTimeout(() => {
        fetchCompatibleVehicles(selectedRideType.id);
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [fetchCompatibleVehicles, selectedRideType]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const subtypes = normalizeVehicleSubtypes(selectedVehicleType);
      setSelectedVehicleSubtype(subtypes[0] || null);
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedVehicleType]);

  const handleContinue = () => {
    if (!selectedVehicleType) {
      Alert.alert('Please select a vehicle type');
      return;
    }
    if (!selectedRideType) {
      Alert.alert('Please select a ride type');
      return;
    }

    const vehicleCapacity =
      selectedVehicleSubtype?.capacity || selectedVehicleType.capacity || 1;

    // Navigate to BookingDetailsScreen with comprehensive service data
    navigation.navigate('BookingDetails', {
      service: {
        vehicle_type_id: getVehicleId(selectedVehicleType),
        vehicle_subtype_id: selectedVehicleSubtype?.id || null,
        vehicle_subtype_name: selectedVehicleSubtype?.name || null,
        vehicle_subtype_capacity: selectedVehicleSubtype?.capacity || null,
        vehicle_name: selectedVehicleType.name,
        vehicle_icon: selectedVehicleType.icon,
        vehicle_capacity: vehicleCapacity,
        capacity_unit: selectedVehicleType.capacity_unit || 'passengers',
        ride_type: selectedRideType.id,
        ride_type_name: selectedRideType.name,
        ride_type_icon: selectedRideType.icon,
        special_fields: compatibilityInfo?.special_fields || [],
        pickup_region: pickupRegion || null,
        pickup_district: pickupDistrict || null,
        pickup_pincode: pickupPincode || null,
      }
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

          {/* Compatibility Info */}
          {selectedRideType && compatibilityInfo && (
            <View style={styles.compatibilityInfo}>
              <Text style={styles.compatibilityLabel}>
                💡 {compatibilityInfo.ride_type_multiplier}x multiplier for {selectedRideType.name}
              </Text>
            </View>
          )}

          <View style={styles.gridContainer}>
            {(selectedRideType ? filteredVehicles : vehicleTypes).map((vehicle) => (
              <TouchableOpacity
                key={getVehicleId(vehicle)}
                style={[
                  styles.vehicleCard,
                  getVehicleId(selectedVehicleType) === getVehicleId(vehicle) && styles.vehicleCardSelected,
                ]}
                onPress={() => setSelectedVehicleType(vehicle)}
              >
                <View
                  style={[
                    styles.vehicleIconBg,
                    { backgroundColor: (vehicle.color || '#FFA500') + '20' },
                  ]}
                >
                  <Text style={styles.vehicleIcon}>{vehicle.icon}</Text>
                </View>

                <Text style={styles.vehicleName}>{vehicle.name}</Text>
                <Text style={styles.vehicleDescription}>
                  {getVehicleDescription(vehicle)}
                </Text>

                {getVehicleId(selectedVehicleType) === getVehicleId(vehicle) && (
                  <View style={styles.checkmark}>
                    <Text style={styles.checkmarkText}>✓</Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* Subtypes for selected vehicle */}
          {selectedVehicleType && normalizeVehicleSubtypes(selectedVehicleType).length > 0 && (
            <View style={styles.subtypesContainer}>
              <Text style={styles.subtypeTitle}>Vehicle Variants:</Text>
              <View style={styles.subtypesGrid}>
                {normalizeVehicleSubtypes(selectedVehicleType).map((subtype) => (
                  <TouchableOpacity
                    key={subtype.id}
                    style={[
                      styles.subtypeChip,
                      selectedVehicleSubtype?.id === subtype.id && styles.subtypeChipSelected,
                    ]}
                    onPress={() => setSelectedVehicleSubtype(subtype)}
                  >
                    <Text
                      style={[
                        styles.subtypeText,
                        selectedVehicleSubtype?.id === subtype.id && styles.subtypeTextSelected,
                      ]}
                    >
                      {subtype.name}
                    </Text>
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
                  {selectedVehicleSubtype?.name ? ` / ${selectedVehicleSubtype.name}` : ''}
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

  subtypeChipSelected: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },

  subtypeText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.secondary,
    fontWeight: '500',
  },

  subtypeTextSelected: {
    color: '#fff',
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

  compatibilityInfo: {
    backgroundColor: '#E8F5E9',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    borderRadius: 8,
  },

  compatibilityLabel: {
    ...TYPOGRAPHY.body,
    color: '#2E7D32',
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
