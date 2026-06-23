import React, { useState, useCallback, useEffect } from 'react';
import { View, ScrollView, FlatList, StyleSheet, TextInput, TouchableOpacity, Alert, Modal , Text } from 'react-native';
import { useOperatorFleetManagement } from '../hooks/useOperatorFleetManagement';

interface OperatorFleetManagementScreenProps {
  token: string;
  userId: string;
  userType: string;
}

export const OperatorFleetManagementScreen: React.FC<OperatorFleetManagementScreenProps> = ({
  token,
  userId,
  userType,
}) => {
  const {
    vehicles,
    analytics,
    addVehicle,
    updateVehicle,
    removeVehicle,
    getVehiclesNeedingService,
  } = useOperatorFleetManagement(userId);

  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showMaintenanceView, setShowMaintenanceView] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [vehicleForm, setVehicleForm] = useState({
    registration: '',
    make: '',
    model: '',
    year: new Date().getFullYear(),
    type: 'sedan' as const,
    color: '',
    seatingCapacity: 4,
    fuelType: 'petrol' as const,
  });

  const vehicleTypes: ('sedan' | 'suv' | 'hatchback' | 'van')[] = ['sedan', 'suv', 'hatchback', 'van'];
  const fuelTypes: ('petrol' | 'diesel' | 'electric' | 'hybrid')[] = ['petrol', 'diesel', 'electric', 'hybrid'];

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    // Analytics are already loaded from hook
  };

  const handleAddVehicle = useCallback(async () => {
    if (!vehicleForm.registration.trim() || !vehicleForm.make.trim()) {
      Alert.alert('Validation', 'Please fill in all required fields');
      return;
    }

    setIsLoading(true);
    try {
      await addVehicle({
        registration: vehicleForm.registration,
        make: vehicleForm.make,
        model: vehicleForm.model,
        year: vehicleForm.year,
        type: vehicleForm.type,
        color: vehicleForm.color,
        seatingCapacity: vehicleForm.seatingCapacity,
        fuelType: vehicleForm.fuelType,
        status: 'active',
        mileage: 0,
        lastServiceDate: Date.now(),
        insuranceExpiryDate: Date.now() + 365 * 24 * 60 * 60 * 1000,
        pollutionCertExpiryDate: Date.now() + 365 * 24 * 60 * 60 * 1000,
        ownerId: userId,
        totalRides: 0,
        averageRating: 0,
      });
      Alert.alert('Success', 'Vehicle added to fleet');
      setVehicleForm({
        registration: '',
        make: '',
        model: '',
        year: new Date().getFullYear(),
        type: 'sedan',
        color: '',
        seatingCapacity: 4,
        fuelType: 'petrol',
      });
      setShowAddVehicle(false);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to add vehicle';
      Alert.alert('Error', errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [vehicleForm, addVehicle, userId]);

  const handleRemoveVehicle = (vehicleId: string) => {
    Alert.alert('Remove Vehicle', 'Are you sure you want to remove this vehicle from the fleet?', [
      { text: 'Cancel', onPress: () => {} },
      {
        text: 'Remove',
        onPress: async () => {
          try {
            await removeVehicle(vehicleId);
            Alert.alert('Success', 'Vehicle removed');
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Failed to remove vehicle';
            Alert.alert('Error', errorMsg);
          }
        },
      },
    ]);
  };

  const vehiclesNeedingService = getVehiclesNeedingService();

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Fleet Management</Text>
        <Text style={styles.subtitle}>Manage your vehicle fleet and maintenance</Text>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{analytics.totalVehicles}</Text>
          <Text style={styles.statLabel}>Total Vehicles</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{analytics.activeVehicles}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{analytics.vehiclesInMaintenance}</Text>
          <Text style={styles.statLabel}>Maintenance</Text>
        </View>
      </View>

      <View style={styles.analyticsContainer}>
        <View style={styles.analyticsCard}>
          <Text style={styles.analyticsLabel}>Total Rides</Text>
          <Text style={styles.analyticsValue}>{analytics.totalRides}</Text>
        </View>
        <View style={styles.analyticsCard}>
          <Text style={styles.analyticsLabel}>Fleet Rating</Text>
          <Text style={styles.analyticsValue}>{analytics.averageFleetRating}★</Text>
        </View>
        <View style={styles.analyticsCard}>
          <Text style={styles.analyticsLabel}>Utilization</Text>
          <Text style={styles.analyticsValue}>{Math.round(analytics.utilizationRate)}%</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.addButton} onPress={() => setShowAddVehicle(true)}>
        <Text style={styles.addButtonText}>+ Add Vehicle</Text>
      </TouchableOpacity>

      {vehiclesNeedingService.length > 0 && (
        <View style={styles.alertBox}>
          <Text style={styles.alertTitle}>Maintenance Alert</Text>
          <Text style={styles.alertText}>
            {vehiclesNeedingService.length} vehicle(s) need service or documentation renewal
          </Text>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Fleet Vehicles ({vehicles.length})</Text>
        {vehicles.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No vehicles in fleet</Text>
            <Text style={styles.emptySubtext}>Add vehicles to start managing your fleet</Text>
          </View>
        ) : (
          <FlatList
            data={vehicles}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.vehicleCard}>
                <View style={styles.vehicleHeader}>
                  <View>
                    <Text style={styles.vehicleName}>
                      {item.make} {item.model}
                    </Text>
                    <Text style={styles.vehicleReg}>{item.registration}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor:
                          item.status === 'active'
                            ? '#4CAF50'
                            : item.status === 'maintenance'
                              ? '#FF9800'
                              : item.status === 'damaged'
                                ? '#f44336'
                                : '#999',
                      },
                    ]}
                  >
                    <Text style={styles.statusText}>
                      {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                    </Text>
                  </View>
                </View>

                <View style={styles.vehicleDetails}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Type:</Text>
                    <Text style={styles.detailValue}>{item.type}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Mileage:</Text>
                    <Text style={styles.detailValue}>{item.mileage} km</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Rides:</Text>
                    <Text style={styles.detailValue}>{item.totalRides}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Rating:</Text>
                    <Text style={styles.detailValue}>{item.averageRating}★</Text>
                  </View>
                </View>

                <View style={styles.vehicleActions}>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => setSelectedVehicle(item.id)}
                  >
                    <Text style={styles.actionButtonText}>Details</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => handleRemoveVehicle(item.id)}
                  >
                    <Text style={styles.deleteButtonText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        )}
      </View>

      <Modal visible={showAddVehicle} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Vehicle to Fleet</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Registration Number *</Text>
              <TextInput
                style={styles.input}
                placeholder="Plate number"
                value={vehicleForm.registration}
                onChangeText={(text) => setVehicleForm({ ...vehicleForm, registration: text })}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Make *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Toyota"
                value={vehicleForm.make}
                onChangeText={(text) => setVehicleForm({ ...vehicleForm, make: text })}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Model</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Innova"
                value={vehicleForm.model}
                onChangeText={(text) => setVehicleForm({ ...vehicleForm, model: text })}
              />
            </View>

            <View style={styles.formRow}>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.label}>Year</Text>
                <TextInput
                  style={styles.input}
                  placeholder="2024"
                  value={vehicleForm.year.toString()}
                  onChangeText={(text) =>
                    setVehicleForm({ ...vehicleForm, year: parseInt(text, 10) || new Date().getFullYear() })
                  }
                  keyboardType="number-pad"
                />
              </View>
              <View style={[styles.formGroup, { flex: 1 }]}>
                <Text style={styles.label}>Seats</Text>
                <TextInput
                  style={styles.input}
                  placeholder="4"
                  value={vehicleForm.seatingCapacity.toString()}
                  onChangeText={(text) =>
                    setVehicleForm({ ...vehicleForm, seatingCapacity: parseInt(text, 10) || 4 })
                  }
                  keyboardType="number-pad"
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Type</Text>
              <View style={styles.buttonGroup}>
                {vehicleTypes.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.typeButton,
                      vehicleForm.type === type && styles.typeButtonActive,
                    ]}
                    onPress={() => setVehicleForm({ ...vehicleForm, type })}
                  >
                    <Text
                      style={[
                        styles.typeButtonText,
                        vehicleForm.type === type && styles.typeButtonTextActive,
                      ]}
                    >
                      {type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Fuel Type</Text>
              <View style={styles.buttonGroup}>
                {fuelTypes.map((fuel) => (
                  <TouchableOpacity
                    key={fuel}
                    style={[
                      styles.fuelButton,
                      vehicleForm.fuelType === fuel && styles.fuelButtonActive,
                    ]}
                    onPress={() => setVehicleForm({ ...vehicleForm, fuelType: fuel })}
                  >
                    <Text
                      style={[
                        styles.fuelButtonText,
                        vehicleForm.fuelType === fuel && styles.fuelButtonTextActive,
                      ]}
                    >
                      {fuel}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowAddVehicle(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                onPress={handleAddVehicle}
                disabled={isLoading}
              >
                <Text style={styles.submitButtonText}>{isLoading ? 'Adding...' : 'Add Vehicle'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    marginVertical: 15,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
  },
  statNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#999',
  },
  analyticsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    marginBottom: 15,
    gap: 10,
  },
  analyticsCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  analyticsLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 4,
  },
  analyticsValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  addButton: {
    marginHorizontal: 15,
    marginBottom: 15,
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  alertBox: {
    marginHorizontal: 15,
    marginBottom: 15,
    padding: 12,
    backgroundColor: '#fff3cd',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
  },
  alertTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#856404',
    marginBottom: 4,
  },
  alertText: {
    fontSize: 12,
    color: '#856404',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginHorizontal: 15,
    marginBottom: 12,
  },
  emptyState: {
    marginHorizontal: 15,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 8,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#ccc',
  },
  vehicleCard: {
    marginHorizontal: 15,
    marginBottom: 10,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  vehicleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  vehicleName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  vehicleReg: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  vehicleDetails: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 10,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  detailLabel: {
    fontSize: 12,
    color: '#666',
  },
  detailValue: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
  },
  vehicleActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#2196F3',
    alignItems: 'center',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  deleteButtonText: {
    color: '#f44336',
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 25,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 20,
  },
  formGroup: {
    marginBottom: 16,
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#f9f9f9',
  },
  buttonGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeButton: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f9f9f9',
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  typeButtonText: {
    fontSize: 12,
    color: '#666',
    textTransform: 'capitalize',
  },
  typeButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  fuelButton: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f9f9f9',
    alignItems: 'center',
  },
  fuelButtonActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  fuelButtonText: {
    fontSize: 12,
    color: '#666',
    textTransform: 'capitalize',
  },
  fuelButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 25,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  submitButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#2196F3',
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
