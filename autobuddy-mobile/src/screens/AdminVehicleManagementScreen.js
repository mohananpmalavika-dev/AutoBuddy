import React, { useCallback, useEffect, useState } from 'react';
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
  SectionList,
} from 'react-native';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../theme';
import { apiRequest } from '../lib/api';

/**
 * AdminVehicleManagementScreen
 * Admin panel for complete vehicle management:
 * - List all canonical vehicle types
 * - View/Edit vehicle details (name, capacity, multiplier)
 * - View/Edit ride-type compatibility
 * - View/Edit fare configurations
 * - Enable/Disable vehicles by region
 */
export default function AdminVehicleManagementScreen({
  navigation,
  route,
  token: tokenProp,
  embedded = false,
  isActive = true,
}) {
  const token = tokenProp || route?.params?.token || route?.params?.authToken || '';

  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showFareModal, setShowFareModal] = useState(false);
  const [showCompatibilityModal, setShowCompatibilityModal] = useState(false);

  // Form state
  const [editForm, setEditForm] = useState({
    name: '',
    multiplier: 1.0,
    capacity: 4,
    capacity_unit: 'passengers',
  });

  const [fareForm, setFareForm] = useState({
    ride_type: 'instant',
    base_fare: 40,
    per_km_rate: 12,
    per_minute_rate: 2,
    minimum_fare: 50,
    ride_multiplier: 1,
  });

  // Fetch all vehicles
  const fetchVehicles = useCallback(async () => {
    try {
      setError('');
      const data = await apiRequest('/api/vehicles/public/all', { token });
      setVehicles(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load vehicles');
      console.error('Error fetching vehicles:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }

    const timer = setTimeout(() => {
      fetchVehicles();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchVehicles, isActive]);

  const handleRefresh = () => {
    setLoading(true);
    fetchVehicles();
  };

  const openDetailsModal = (vehicle) => {
    setSelectedVehicle(vehicle);
    setEditForm({
      name: vehicle?.name ?? '',
      multiplier: vehicle?.base_multiplier ?? 1.0,
      capacity: vehicle?.capacity ?? 4,
      capacity_unit: vehicle?.capacity_unit ?? 'passengers',
    });
    setShowDetailsModal(true);
  };

  const syncFareForm = (fareConfig, rideType = 'instant') => {
    const baseConfig = fareConfig?.base || {};
    const rideConfig = fareConfig?.[rideType] || {};
    const toNumber = (value, fallback) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const base_fare = toNumber(baseConfig?.base_fare, 40);
    const per_km_rate = toNumber(baseConfig?.per_km_rate, 12);
    const per_minute_rate = toNumber(baseConfig?.per_minute_rate, 2);
    const minimum_fare = toNumber(baseConfig?.minimum_fare, 50);
    const ride_multiplier = toNumber(rideConfig?.multiplier, 1);

    setFareForm((current) => ({
      ...current,
      ride_type: rideType ?? 'instant',
      base_fare: base_fare,
      per_km_rate: per_km_rate,
      per_minute_rate: per_minute_rate,
      minimum_fare: minimum_fare,
      ride_multiplier: ride_multiplier,
    }));
  };

  const openFareModal = async (vehicle) => {
    setSelectedVehicle(vehicle);
    setShowFareModal(true);
    syncFareForm(vehicle.fare_config, fareForm.ride_type);

    try {
      const response = await apiRequest(`/api/vehicles/public/fare-config/${vehicle.vehicle_type_id}`, {
        method: 'GET',
        token,
      });
      const fareConfig = response?.fare_config || response?.data?.fare_config || vehicle.fare_config || {};
      setSelectedVehicle({ ...vehicle, fare_config: fareConfig });
      syncFareForm(fareConfig, fareForm.ride_type);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fare configuration');
    }
  };

  const openCompatibilityModal = (vehicle) => {
    setSelectedVehicle(vehicle);
    setShowCompatibilityModal(true);
  };

  const handleUpdateVehicle = async () => {
    if (!selectedVehicle) return;

    try {
      setLoading(true);
      const multiplier = parseFloat(editForm.multiplier) || 1.0;
      const capacity = parseInt(editForm.capacity, 10) || 1;
      
      if (!Number.isFinite(multiplier) || multiplier <= 0) {
        setError('Multiplier must be a positive number');
        return;
      }
      if (!Number.isInteger(capacity) || capacity <= 0) {
        setError('Capacity must be a positive integer');
        return;
      }
      
      const payload = {
        name: editForm.name ?? 'Unknown',
        base_multiplier: multiplier,
        capacity: capacity,
        capacity_unit: editForm.capacity_unit ?? 'passengers',
      };

      await apiRequest(`/api/vehicles/admin/${selectedVehicle.vehicle_type_id}`, {
        method: 'PUT',
        token,
        body: payload,
      });

      setMessage('Vehicle updated successfully!');
      setShowDetailsModal(false);
      await fetchVehicles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update vehicle');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFareConfig = async () => {
    if (!selectedVehicle) return;

    try {
      setLoading(true);
      
      if (fareForm.base_fare <= 0 || fareForm.minimum_fare <= 0 || fareForm.per_km_rate < 0 || fareForm.per_minute_rate < 0) {
        setError('All fare values must be positive numbers');
        return;
      }

      const existingFareConfig = selectedVehicle.fare_config || {};
      const rideTypeConfig = existingFareConfig[fareForm.ride_type ?? 'instant'] || {};
      const rideType = fareForm.ride_type ?? 'instant';
      
      const payload = {
        fare_config: {
          ...existingFareConfig,
          base: {
            ...(existingFareConfig.base || {}),
            base_fare: Math.max(0, Number(fareForm.base_fare) || 40),
            per_km_rate: Math.max(0, Number(fareForm.per_km_rate) || 12),
            per_minute_rate: Math.max(0, Number(fareForm.per_minute_rate) || 2),
            minimum_fare: Math.max(0, Number(fareForm.minimum_fare) || 50),
          },
          [rideType]: {
            ...(typeof rideTypeConfig === 'object' && rideTypeConfig ? rideTypeConfig : {}),
            multiplier: Math.max(0, Number(fareForm.ride_multiplier) || 1),
          },
        },
      };

      await apiRequest(`/api/vehicles/admin/${selectedVehicle.vehicle_type_id}/fare-config`, {
        method: 'PUT',
        token,
        body: payload,
      });

      setMessage('Fare configuration saved');
      setShowFareModal(false);
      await fetchVehicles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save fare configuration');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCompatibility = async () => {
    if (!selectedVehicle) return;

    try {
      setLoading(true);
      await apiRequest(`/api/vehicles/admin/${selectedVehicle.vehicle_type_id}`, {
        method: 'PUT',
        token,
        body: {
          allowed_ride_types: selectedVehicle.allowed_ride_types || [],
        },
      });

      setMessage('Compatibility settings saved');
      setShowCompatibilityModal(false);
      await fetchVehicles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save compatibility settings');
    } finally {
      setLoading(false);
    }
  };

  const handleDisableVehicle = async (vehicleId) => {
    Alert.alert(
      'Disable Vehicle',
      'This will disable the vehicle for new bookings. Continue?',
      [
        { text: 'Cancel', onPress: () => {} },
        {
          text: 'Disable',
          onPress: async () => {
            try {
              setLoading(true);
              await apiRequest(`/api/vehicles/admin/${vehicleId}`, {
                method: 'DELETE',
                token,
              });
              setMessage('Vehicle disabled successfully');
              await fetchVehicles();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to disable vehicle');
            } finally {
              setLoading(false);
            }
          },
          style: 'destructive',
        },
      ],
    );
  };

  if (loading && vehicles.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading vehicles...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const vehiclesList = (vehicles || []).map((vehicle) => ({
    title: vehicle?.name ?? vehicle?.vehicle_type_id ?? 'Unknown',
    data: [vehicle],
  }));

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation?.goBack?.()} disabled={embedded}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Vehicle Management</Text>
        <TouchableOpacity onPress={handleRefresh} disabled={loading}>
          <Text style={styles.refreshButton}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* Messages */}
      {error && <Text style={[styles.message, styles.errorMessage]}>{error}</Text>}
      {message && <Text style={[styles.message, styles.successMessage]}>{message}</Text>}

      {/* Vehicles List */}
      <SectionList
        sections={vehiclesList}
        keyExtractor={(item, index) => item.vehicle_type_id + index}
        renderSectionHeader={({ section: { title } }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{title}</Text>
          </View>
        )}
        renderItem={({ item: vehicle }) => (
          <View style={styles.vehicleCard}>
            <View style={styles.vehicleHeader}>
              <View>
                <Text style={styles.vehicleTitle}>{vehicle?.name ?? 'Unknown'}</Text>
                <Text style={styles.vehicleSubtitle}>
                  {(vehicle?.vehicle_type_id ?? 'unknown').toUpperCase()}
                </Text>
              </View>
              <View style={styles.vehicleBadges}>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{vehicle?.base_multiplier ?? 1}x</Text>
                </View>
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {vehicle?.capacity ?? 4} {(vehicle?.capacity_unit ?? 'passengers').charAt(0)}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={styles.vehicleDetails}>
              {(vehicle?.allowed_ride_types ?? []).join(', ') || 'No ride types configured'}
            </Text>

            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => openDetailsModal(vehicle)}
              >
                <Text style={styles.actionButtonText}>📋 Details</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => openFareModal(vehicle)}
              >
                <Text style={styles.actionButtonText}>💰 Fares</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => openCompatibilityModal(vehicle)}
              >
                <Text style={styles.actionButtonText}>🔗 Compatibility</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, styles.dangerButton]}
                onPress={() => handleDisableVehicle(vehicle.vehicle_type_id)}
              >
                <Text style={styles.actionButtonText}>⛔ Disable</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        scrollEnabled={true}
        showsVerticalScrollIndicator={true}
        contentContainerStyle={styles.listContent}
      />

      {/* Details Modal */}
      <Modal visible={showDetailsModal} animationType="slide" transparent>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Vehicle Details</Text>
            <TouchableOpacity
              onPress={() => setShowDetailsModal(false)}
              disabled={loading}
            >
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {selectedVehicle && (
              <>
                <Text style={styles.fieldLabel}>Vehicle Name</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.name}
                  onChangeText={(text) => setEditForm({ ...editForm, name: text })}
                  placeholder="e.g., Taxi, Auto"
                  editable={!loading}
                />

                <Text style={styles.fieldLabel}>Fare Multiplier</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.multiplier?.toString() ?? '1.0'}
                  onChangeText={(text) => {
                    const val = parseFloat(text);
                    setEditForm({ ...editForm, multiplier: Number.isFinite(val) ? val : 1.0 })
                  }}
                  placeholder="1.0"
                  keyboardType="decimal-pad"
                  editable={!loading}
                />
                <Text style={styles.fieldHint}>
                  Base: 1.0x | Budget: 0.75x | Premium: 1.5x - 2.0x
                </Text>

                <Text style={styles.fieldLabel}>Capacity</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.capacity?.toString() ?? '4'}
                  onChangeText={(text) => {
                    const val = parseInt(text, 10);
                    setEditForm({ ...editForm, capacity: Number.isInteger(val) && val > 0 ? val : 1 })
                  }}
                  placeholder="4"
                  keyboardType="number-pad"
                  editable={!loading}
                />

                <Text style={styles.fieldLabel}>Capacity Unit</Text>
                <View style={styles.unitSelector}>
                  {['passengers', 'kg'].map((unit) => (
                    <TouchableOpacity
                      key={unit}
                      style={[
                        styles.unitButton,
                        editForm.capacity_unit === unit && styles.unitButtonActive,
                      ]}
                      onPress={() => setEditForm({ ...editForm, capacity_unit: unit })}
                      disabled={loading}
                    >
                      <Text
                        style={[
                          styles.unitButtonText,
                          editForm.capacity_unit === unit && styles.unitButtonTextActive,
                        ]}
                      >
                        {unit}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TouchableOpacity
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={handleUpdateVehicle}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Save Changes</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Fare Configuration Modal */}
      <Modal visible={showFareModal} animationType="slide" transparent>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Fare Configuration</Text>
            <TouchableOpacity
              onPress={() => setShowFareModal(false)}
              disabled={loading}
            >
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {selectedVehicle && (
              <>
                <Text style={styles.infoText}>
                  Configure fares for {selectedVehicle?.name ?? 'this vehicle'} across different ride types.
                </Text>

                <Text style={styles.fieldLabel}>Ride Type</Text>
                <View style={styles.rideTypeSelector}>
                  {['instant', 'scheduled', 'rental', 'airport', 'intercity', 'ev_auto', 'tourism', 'pet'].map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.rideTypeButton,
                        fareForm.ride_type === type && styles.rideTypeButtonActive,
                      ]}
                      onPress={() => syncFareForm(selectedVehicle.fare_config, type)}
                      disabled={loading}
                    >
                      <Text
                        style={[
                          styles.rideTypeButtonText,
                          fareForm.ride_type === type && styles.rideTypeButtonTextActive,
                        ]}
                      >
                        {type}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>Base Fare (₹)</Text>
                <TextInput
                  style={styles.input}
                  value={fareForm.base_fare?.toString() ?? '40'}
                  onChangeText={(text) => {
                    const val = parseInt(text, 10);
                    setFareForm({ ...fareForm, base_fare: Number.isInteger(val) && val > 0 ? val : 40 })
                  }}
                  keyboardType="number-pad"
                  editable={!loading}
                />

                <Text style={styles.fieldLabel}>Per KM Rate (₹)</Text>
                <TextInput
                  style={styles.input}
                  value={fareForm.per_km_rate?.toString() ?? '12'}
                  onChangeText={(text) => {
                    const val = parseFloat(text);
                    setFareForm({ ...fareForm, per_km_rate: Number.isFinite(val) ? val : 12 })
                  }}
                  keyboardType="decimal-pad"
                  editable={!loading}
                />

                <Text style={styles.fieldLabel}>Per Minute Rate (₹)</Text>
                <TextInput
                  style={styles.input}
                  value={fareForm.per_minute_rate?.toString() ?? '2'}
                  onChangeText={(text) => {
                    const val = parseFloat(text);
                    setFareForm({ ...fareForm, per_minute_rate: Number.isFinite(val) ? val : 2 })
                  }}
                  keyboardType="decimal-pad"
                  editable={!loading}
                />

                <Text style={styles.fieldLabel}>Minimum Fare (₹)</Text>
                <TextInput
                  style={styles.input}
                  value={fareForm.minimum_fare?.toString() ?? '50'}
                  onChangeText={(text) => {
                    const val = parseInt(text, 10);
                    setFareForm({ ...fareForm, minimum_fare: Number.isInteger(val) && val > 0 ? val : 50 })
                  }}
                  keyboardType="number-pad"
                  editable={!loading}
                />

                <Text style={styles.fieldLabel}>Ride Multiplier</Text>
                <TextInput
                  style={styles.input}
                  value={fareForm.ride_multiplier?.toString() ?? '1'}
                  onChangeText={(text) => {
                    const val = parseFloat(text);
                    setFareForm({ ...fareForm, ride_multiplier: Number.isFinite(val) ? val : 1 })
                  }}
                  keyboardType="decimal-pad"
                  editable={!loading}
                />

                <TouchableOpacity
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={handleSaveFareConfig}
                  disabled={loading}
                >
                  <Text style={styles.buttonText}>Save Fare Config</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Ride-Type Compatibility Modal */}
      <Modal visible={showCompatibilityModal} animationType="slide" transparent>
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Ride-Type Compatibility</Text>
            <TouchableOpacity
              onPress={() => setShowCompatibilityModal(false)}
              disabled={loading}
            >
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {selectedVehicle && (
              <>
                <Text style={styles.infoText}>
                  Select which ride types are supported by {selectedVehicle.name}.
                </Text>

                <View style={styles.compatibilityList}>
                  {[
                    { id: 'instant', name: 'Instant', icon: '⚡' },
                    { id: 'scheduled', name: 'Scheduled', icon: '📅' },
                    { id: 'rental', name: 'Rental', icon: '⏰' },
                    { id: 'airport', name: 'Airport', icon: '✈️' },
                    { id: 'intercity', name: 'Intercity', icon: '🛣️' },
                    { id: 'ev_auto', name: 'EV Auto', icon: '🔋' },
                    { id: 'corporate', name: 'Corporate', icon: '💼' },
                    { id: 'tourism', name: 'Tourism', icon: '🗺️' },
                    { id: 'pet', name: 'Pet Rides', icon: '🐾' },
                    { id: 'goods', name: 'Goods', icon: '📦' },
                  ].map((rideType) => {
                    const isSupported = selectedVehicle.allowed_ride_types?.includes(
                      rideType.id
                    ) || false;
                    return (
                      <TouchableOpacity
                        key={rideType.id}
                        style={[
                          styles.compatibilityItem,
                          isSupported && styles.compatibilityItemActive,
                        ]}
                        onPress={() => {
                          // Toggle support
                          const updated = isSupported
                            ? selectedVehicle.allowed_ride_types.filter(
                                (rt) => rt !== rideType.id
                              )
                            : [...(selectedVehicle.allowed_ride_types || []), rideType.id];
                          setSelectedVehicle({
                            ...selectedVehicle,
                            allowed_ride_types: updated,
                          });
                        }}
                      >
                        <View style={styles.compatibilityCheck}>
                          <Text style={styles.compatibilityCheckIcon}>
                            {isSupported ? '✓' : '○'}
                          </Text>
                        </View>
                        <View>
                          <Text style={styles.compatibilityName}>{rideType.icon} {rideType.name}</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <TouchableOpacity
                  style={[styles.button, loading && styles.buttonDisabled]}
                  onPress={handleSaveCompatibility}
                  disabled={loading}
                >
                  <Text style={styles.buttonText}>Save Compatibility</Text>
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: COLORS.textSecondary,
    ...TYPOGRAPHY.body,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  backButton: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
  },
  refreshButton: {
    fontSize: 18,
  },
  message: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 12,
    borderRadius: 8,
    ...TYPOGRAPHY.body,
  },
  errorMessage: {
    backgroundColor: '#FFEBEE',
    color: COLORS.error,
  },
  successMessage: {
    backgroundColor: '#E8F5E9',
    color: COLORS.success,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 100,
  },
  sectionHeader: {
    paddingVertical: 12,
    paddingHorizontal: 0,
    backgroundColor: COLORS.background,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
  },
  vehicleCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    ...SHADOWS.soft,
  },
  vehicleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  vehicleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  vehicleSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  vehicleBadges: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  vehicleDetails: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 12,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    minWidth: '48%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  dangerButton: {
    backgroundColor: '#FFEBEE',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  closeButton: {
    fontSize: 24,
    color: COLORS.textSecondary,
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
    marginTop: 16,
  },
  fieldHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
  },
  unitSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  unitButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  unitButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  unitButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  unitButtonTextActive: {
    color: '#fff',
  },
  rideTypeSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  rideTypeButton: {
    flex: 1,
    minWidth: '48%',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  rideTypeButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  rideTypeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  rideTypeButtonTextActive: {
    color: '#fff',
  },
  infoText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: 16,
    lineHeight: 18,
  },
  compatibilityList: {
    gap: 10,
    marginBottom: 20,
  },
  compatibilityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: '#fff',
  },
  compatibilityItemActive: {
    backgroundColor: '#E8F5E9',
    borderColor: COLORS.success,
  },
  compatibilityCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  compatibilityCheckIcon: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.success,
  },
  compatibilityName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
