import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useVehicleManagement, Vehicle } from '../hooks/useVehicleManagement';

interface DriverVehicleManagementScreenProps {
  token: string | null;
  driverId: string;
}

export const DriverVehicleManagementScreen: React.FC<DriverVehicleManagementScreenProps> = ({
  token,
  driverId,
}) => {
  const {
    vehicles,
    loading,
    error,
    fetchVehicles,
    addVehicle,
    deleteVehicle,
    uploadVehicleDocument,
    getExpiringDocuments,
    addMaintenanceRecord,
    setVehicleStatus,
    getVehicleStats,
  } = useVehicleManagement(token, driverId);

  const [refreshing, setRefreshing] = useState(false);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showVehicleDetail, setShowVehicleDetail] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  const [stats, setStats] = useState<any>(null);

  const [newVehicleData, setNewVehicleData] = useState({
    type: 'sedan' as const,
    registrationNumber: '',
    make: '',
    model: '',
    year: new Date().getFullYear(),
    color: '',
    fuelType: 'petrol' as const,
    registrationExpiry: new Date(),
    insuranceExpiry: new Date(),
    pollutionExpiry: new Date(),
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await fetchVehicles();
    setStats(getVehicleStats());
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleAddVehicle = async () => {
    if (!newVehicleData.registrationNumber.trim() || !newVehicleData.make.trim()) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    const vehicle = await addVehicle({
      ...newVehicleData,
      driverId,
      status: 'active',
    });

    if (vehicle) {
      Alert.alert('Success', 'Vehicle added successfully');
      setNewVehicleData({
        type: 'sedan',
        registrationNumber: '',
        make: '',
        model: '',
        year: new Date().getFullYear(),
        color: '',
        fuelType: 'petrol',
        registrationExpiry: new Date(),
        insuranceExpiry: new Date(),
        pollutionExpiry: new Date(),
      });
      setShowAddVehicle(false);
      setStats(getVehicleStats());
    }
  };

  const handleDeleteVehicle = (vehicleId: string) => {
    Alert.alert('Delete Vehicle', 'Remove this vehicle? This action cannot be undone.', [
      { text: 'Cancel' },
      {
        text: 'Delete',
        onPress: async () => {
          const success = await deleteVehicle(vehicleId);
          if (success) {
            Alert.alert('Success', 'Vehicle deleted');
            setShowVehicleDetail(false);
            setStats(getVehicleStats());
          }
        },
        style: 'destructive',
      },
    ]);
  };

  const expiringDocs = getExpiringDocuments();
  const hasWarnings = expiringDocs.length > 0;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Stats Card */}
      {stats && (
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#4CAF50' }]}>{stats.active}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: '#FF9800' }]}>{stats.expiring}</Text>
            <Text style={styles.statLabel}>Expiring</Text>
          </View>
        </View>
      )}

      {/* Warnings */}
      {hasWarnings && (
        <View style={styles.warningBanner}>
          <MaterialIcons name="warning" size={18} color="#FF6F00" />
          <Text style={styles.warningText}>
            {expiringDocs.length} vehicle(s) have documents expiring soon
          </Text>
        </View>
      )}

      {/* Add Vehicle Button */}
      <Pressable
        style={styles.addButton}
        onPress={() => setShowAddVehicle(true)}
      >
        <MaterialIcons name="add-circle" size={24} color="#fff" />
        <Text style={styles.addButtonText}>Add New Vehicle</Text>
      </Pressable>

      {/* Vehicles List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My Vehicles</Text>
        {loading && vehicles.length === 0 ? (
          <ActivityIndicator size="large" color="#2196F3" style={{ marginVertical: 20 }} />
        ) : vehicles.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="directions-car" size={48} color="#ddd" />
            <Text style={styles.emptyText}>No vehicles added</Text>
          </View>
        ) : (
          <FlatList
            scrollEnabled={false}
            data={vehicles}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <VehicleCard
                vehicle={item}
                onPress={() => {
                  setSelectedVehicle(item);
                  setShowVehicleDetail(true);
                }}
              />
            )}
          />
        )}
      </View>

      {/* Error Banner */}
      {error && (
        <View style={styles.errorBanner}>
          <MaterialIcons name="error-outline" size={18} color="#F44336" />
          <Text style={styles.errorText}>{error.message}</Text>
        </View>
      )}

      {/* Add Vehicle Modal */}
      <Modal visible={showAddVehicle} transparent animationType="slide">
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Vehicle</Text>
              <Pressable onPress={() => setShowAddVehicle(false)}>
                <MaterialIcons name="close" size={24} color="#000" />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Vehicle Type</Text>
              <View style={styles.typeButtons}>
                {(['sedan', 'suv', 'hatchback', 'auto', 'bike'] as const).map((type) => (
                  <Pressable
                    key={type}
                    style={[
                      styles.typeButton,
                      newVehicleData.type === type && styles.typeButtonActive,
                    ]}
                    onPress={() => setNewVehicleData({ ...newVehicleData, type })}
                  >
                    <Text
                      style={[
                        styles.typeButtonText,
                        newVehicleData.type === type && styles.typeButtonTextActive,
                      ]}
                    >
                      {type}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.inputLabel}>Registration Number *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., DL01AB1234"
                value={newVehicleData.registrationNumber}
                onChangeText={(text) =>
                  setNewVehicleData({ ...newVehicleData, registrationNumber: text })
                }
                placeholderTextColor="#999"
              />

              <Text style={styles.inputLabel}>Make *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Toyota"
                value={newVehicleData.make}
                onChangeText={(text) =>
                  setNewVehicleData({ ...newVehicleData, make: text })
                }
                placeholderTextColor="#999"
              />

              <Text style={styles.inputLabel}>Model</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Fortuner"
                value={newVehicleData.model}
                onChangeText={(text) =>
                  setNewVehicleData({ ...newVehicleData, model: text })
                }
                placeholderTextColor="#999"
              />

              <Text style={styles.inputLabel}>Year</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 2023"
                value={newVehicleData.year.toString()}
                onChangeText={(text) =>
                  setNewVehicleData({
                    ...newVehicleData,
                    year: parseInt(text) || new Date().getFullYear(),
                  })
                }
                keyboardType="number-pad"
                placeholderTextColor="#999"
              />

              <Text style={styles.inputLabel}>Color</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Black"
                value={newVehicleData.color}
                onChangeText={(text) =>
                  setNewVehicleData({ ...newVehicleData, color: text })
                }
                placeholderTextColor="#999"
              />

              <Pressable style={styles.submitButton} onPress={handleAddVehicle}>
                <MaterialIcons name="add" size={18} color="#fff" />
                <Text style={styles.submitButtonText}>Add Vehicle</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Vehicle Detail Modal */}
      <Modal visible={showVehicleDetail} transparent animationType="slide">
        {selectedVehicle && (
          <View style={styles.modal}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Pressable onPress={() => setShowVehicleDetail(false)}>
                  <MaterialIcons name="close" size={24} color="#000" />
                </Pressable>
                <Text style={styles.modalTitle}>
                  {selectedVehicle.make} {selectedVehicle.model}
                </Text>
                <View style={{ width: 24 }} />
              </View>

              <ScrollView style={styles.modalBody}>
                <View style={styles.detailCard}>
                  <DetailRow label="Registration" value={selectedVehicle.registrationNumber} />
                  <DetailRow label="Type" value={selectedVehicle.type} />
                  <DetailRow label="Year" value={selectedVehicle.year.toString()} />
                  <DetailRow label="Color" value={selectedVehicle.color} />
                  <DetailRow label="Fuel Type" value={selectedVehicle.fuelType} />
                </View>

                <View style={styles.detailCard}>
                  <Text style={styles.detailSectionTitle}>Document Expiry</Text>
                  <DetailRow
                    label="Registration"
                    value={new Date(selectedVehicle.registrationExpiry).toLocaleDateString()}
                  />
                  <DetailRow
                    label="Insurance"
                    value={new Date(selectedVehicle.insuranceExpiry).toLocaleDateString()}
                  />
                  <DetailRow
                    label="Pollution"
                    value={new Date(selectedVehicle.pollutionExpiry).toLocaleDateString()}
                  />
                </View>

                <View style={styles.actionsContainer}>
                  <Pressable
                    style={[styles.actionButton, styles.editButton]}
                    onPress={() => Alert.alert('Edit', 'Edit functionality coming soon')}
                  >
                    <MaterialIcons name="edit" size={18} color="#fff" />
                    <Text style={styles.actionButtonText}>Edit</Text>
                  </Pressable>

                  <Pressable
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => handleDeleteVehicle(selectedVehicle.id)}
                  >
                    <MaterialIcons name="delete" size={18} color="#fff" />
                    <Text style={styles.actionButtonText}>Delete</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>
    </ScrollView>
  );
};

const VehicleCard: React.FC<{ vehicle: Vehicle; onPress: () => void }> = ({
  vehicle,
  onPress,
}) => {
  const isExpiring = vehicle.registrationExpiry < new Date();

  return (
    <Pressable style={styles.vehicleCard} onPress={onPress}>
      <View style={styles.vehicleHeader}>
        <View>
          <Text style={styles.vehicleName}>
            {vehicle.make} {vehicle.model}
          </Text>
          <Text style={styles.vehicleReg}>{vehicle.registrationNumber}</Text>
        </View>
        <View
          style={[
            styles.statusBadge,
            {
              backgroundColor:
                vehicle.status === 'active' ? '#4CAF50' : '#FF9800',
            },
          ]}
        >
          <Text style={styles.statusText}>{vehicle.status.toUpperCase()}</Text>
        </View>
      </View>

      <View style={styles.vehicleDetails}>
        <Text style={styles.detailText}>
          <MaterialIcons name="calendar-today" size={12} color="#666" /> {vehicle.year}
        </Text>
        <Text style={styles.detailText}>
          <MaterialIcons name="local-gas-station" size={12} color="#666" /> {vehicle.fuelType}
        </Text>
      </View>

      {isExpiring && (
        <View style={styles.warningFlag}>
          <MaterialIcons name="warning" size={12} color="#FF6F00" />
          <Text style={styles.warningFlagText}>Documents expiring</Text>
        </View>
      )}
    </Pressable>
  );
};

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  statsCard: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2196F3',
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#e0e0e0',
  },
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFF3E0',
    borderRadius: 6,
  },
  warningText: {
    fontSize: 12,
    color: '#E65100',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingVertical: 12,
    backgroundColor: '#2196F3',
    borderRadius: 8,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  vehicleCard: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  vehicleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  vehicleName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
  vehicleReg: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
  vehicleDetails: {
    flexDirection: 'row',
    gap: 12,
  },
  detailText: {
    fontSize: 11,
    color: '#666',
  },
  warningFlag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#FFF3E0',
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  warningFlagText: {
    fontSize: 10,
    color: '#E65100',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFF3CD',
    borderRadius: 6,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: '#856404',
  },
  modal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  modalBody: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  typeButtons: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    alignItems: 'center',
  },
  typeButtonActive: {
    backgroundColor: '#2196F3',
  },
  typeButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  typeButtonTextActive: {
    color: '#fff',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
    marginTop: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#000',
    marginBottom: 8,
  },
  detailCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  detailSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 11,
    color: '#666',
  },
  detailValue: {
    fontSize: 11,
    fontWeight: '600',
    color: '#000',
  },
  actionsContainer: {
    gap: 8,
    marginTop: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 6,
  },
  editButton: {
    backgroundColor: '#2196F3',
  },
  deleteButton: {
    backgroundColor: '#F44336',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 12,
    backgroundColor: '#2196F3',
    borderRadius: 6,
  },
  submitButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
});

export default DriverVehicleManagementScreen;
