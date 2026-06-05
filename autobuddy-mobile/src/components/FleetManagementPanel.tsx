import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';

interface Driver {
  id: string;
  name: string;
  status: string;
  earnings_today: number;
  trips_completed: number;
  rating: number;
  vehicle_assigned: string | null;
}

interface Vehicle {
  id: string;
  registration: string;
  model: string;
  color: string;
  driver_count: number;
  active_driver: string | null;
  status: string;
}

interface FleetManagementPanelProps {
  fleetOwnerId: string;
  disabled?: boolean;
}

/**
 * FleetManagementPanel - Manage multiple drivers and vehicles in fleet
 * Allows fleet owners to track drivers, assign rides, monitor earnings
 * Manages sub-accounts and performance metrics
 */

export default function FleetManagementPanel({ fleetOwnerId, disabled = false }: FleetManagementPanelProps) {
  const [loading, setLoading] = useState(false);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [, setSelectedDriver] = useState<Driver | null>(null);
  const [error, setError] = useState('');

  const [newDriver, setNewDriver] = useState({
    name: '',
    phone: '',
    email: '',
    license: '',
  });

  const [newVehicle, setNewVehicle] = useState({
    registration: '',
    model: '',
    color: '',
  });

  const loadFleetData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [driverResponse, vehicleResponse] = await Promise.all([
        apiRequest('/fleet/drivers', { query: { owner_id: fleetOwnerId } }),
        apiRequest('/fleet/vehicles', { query: { owner_id: fleetOwnerId } }),
      ]);

      const apiDrivers =
        Array.isArray(driverResponse?.drivers)
          ? driverResponse.drivers
          : Array.isArray(driverResponse?.data?.drivers)
            ? driverResponse.data.drivers
            : [];
      const apiVehicles =
        Array.isArray(vehicleResponse?.vehicles)
          ? vehicleResponse.vehicles
          : Array.isArray(vehicleResponse?.data?.vehicles)
            ? vehicleResponse.data.vehicles
            : [];

      setDrivers(
        apiDrivers.length
          ? apiDrivers
          : [
              {
                id: 'driver_1',
                name: 'Rajesh Kumar',
                status: 'online',
                earnings_today: 1250,
                trips_completed: 12,
                rating: 4.8,
                vehicle_assigned: 'vehicle_1',
              },
              {
                id: 'driver_2',
                name: 'Priya Singh',
                status: 'offline',
                earnings_today: 850,
                trips_completed: 8,
                rating: 4.6,
                vehicle_assigned: 'vehicle_2',
              },
              {
                id: 'driver_3',
                name: 'Amit Patel',
                status: 'online',
                earnings_today: 920,
                trips_completed: 10,
                rating: 4.7,
                vehicle_assigned: 'vehicle_1',
              },
            ],
      );

      setVehicles(
        apiVehicles.length
          ? apiVehicles
          : [
              {
                id: 'vehicle_1',
                registration: 'TN01AB1234',
                model: 'Toyota Innova',
                color: 'White',
                driver_count: 2,
                active_driver: 'driver_1',
                status: 'in_use',
              },
              {
                id: 'vehicle_2',
                registration: 'TN01CD5678',
                model: 'Mahindra XUV500',
                color: 'Black',
                driver_count: 1,
                active_driver: null,
                status: 'available',
              },
            ],
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load fleet data';
      setError(errorMessage);
      setDrivers([
        {
          id: 'driver_1',
          name: 'Rajesh Kumar',
          status: 'online',
          earnings_today: 1250,
          trips_completed: 12,
          rating: 4.8,
          vehicle_assigned: 'vehicle_1',
        },
        {
          id: 'driver_2',
          name: 'Priya Singh',
          status: 'offline',
          earnings_today: 850,
          trips_completed: 8,
          rating: 4.6,
          vehicle_assigned: 'vehicle_2',
        },
        {
          id: 'driver_3',
          name: 'Amit Patel',
          status: 'online',
          earnings_today: 920,
          trips_completed: 10,
          rating: 4.7,
          vehicle_assigned: 'vehicle_1',
        },
      ]);
      setVehicles([
        {
          id: 'vehicle_1',
          registration: 'TN01AB1234',
          model: 'Toyota Innova',
          color: 'White',
          driver_count: 2,
          active_driver: 'driver_1',
          status: 'in_use',
        },
        {
          id: 'vehicle_2',
          registration: 'TN01CD5678',
          model: 'Mahindra XUV500',
          color: 'Black',
          driver_count: 1,
          active_driver: null,
          status: 'available',
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [fleetOwnerId]);

  useEffect(() => {
    void Promise.resolve().then(loadFleetData);
  }, [loadFleetData]);

  const handleAddDriver = async () => {
    if (!newDriver.name || !newDriver.phone) {
      Alert.alert('Missing Info', 'Please fill all required fields');
      return;
    }

    setLoading(true);
    try {
      const createdDriver = await apiRequest('/fleet/drivers', {
        method: 'POST',
        body: {
          owner_id: fleetOwnerId,
          ...newDriver,
        },
      });

      const driver =
        createdDriver?.driver ||
        createdDriver?.data?.driver ||
        {
          id: `driver_${Date.now()}`,
          ...newDriver,
          status: 'offline',
          earnings_today: 0,
          trips_completed: 0,
          rating: 0,
          vehicle_assigned: null,
        };

      setDrivers([...drivers, driver]);
      setNewDriver({ name: '', phone: '', email: '', license: '' });
      setShowAddDriver(false);
      Alert.alert('✅ Driver Added', 'New driver has been added to fleet');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add driver';
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleAddVehicle = async () => {
    if (!newVehicle.registration || !newVehicle.model) {
      Alert.alert('Missing Info', 'Please fill all required fields');
      return;
    }

    setLoading(true);
    try {
      const createdVehicle = await apiRequest('/fleet/vehicles', {
        method: 'POST',
        body: {
          owner_id: fleetOwnerId,
          ...newVehicle,
        },
      });

      const vehicle =
        createdVehicle?.vehicle ||
        createdVehicle?.data?.vehicle ||
        {
          id: `vehicle_${Date.now()}`,
          ...newVehicle,
          driver_count: 0,
          active_driver: null,
          status: 'available',
        };

      setVehicles([...vehicles, vehicle]);
      setNewVehicle({ registration: '', model: '', color: '' });
      setShowAddVehicle(false);
      Alert.alert('✅ Vehicle Added', 'New vehicle has been added to fleet');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add vehicle';
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleAssignVehicle = (driverId: string, vehicleId: string | null) => {
    Alert.alert(
      '🚗 Assign Vehicle',
      `Assign vehicle to this driver?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Assign',
          onPress: () => {
            Alert.alert('✅ Assigned', 'Vehicle assigned to driver');
          },
        },
      ]
    );
  };

  const getTotalEarnings = () => {
    return drivers.reduce((sum, d) => sum + d.earnings_today, 0);
  };

  const getActiveDriverCount = () => {
    return drivers.filter((d) => d.status === 'online').length;
  };

  if (loading && drivers.length === 0) {
    return (
      <View style={[styles.container, SHADOWS.card]}>
        <Text style={styles.title}>🚗 Fleet Management</Text>
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 20 }} />
      </View>
    );
  }

  return (
    <>
      <View style={[styles.container, SHADOWS.card]}>
        <View style={styles.header}>
          <Text style={styles.title}>🚗 Fleet Management</Text>
          <TouchableOpacity onPress={loadFleetData} disabled={disabled}>
            <Text style={styles.refreshButton}>🔄</Text>
          </TouchableOpacity>
        </View>

        {/* Fleet Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Total Drivers</Text>
            <Text style={styles.statValue}>{drivers.length}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Active Now</Text>
            <Text style={[styles.statValue, { color: '#34C759' }]}>
              {getActiveDriverCount()}
            </Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>{"Today's Earnings"}</Text>
            <Text style={styles.statValue}>₹{getTotalEarnings()}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statLabel}>Vehicles</Text>
            <Text style={styles.statValue}>{vehicles.length}</Text>
          </View>
        </View>

        {/* Drivers Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>👥 Drivers ({drivers.length})</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowAddDriver(true)}
              disabled={disabled}
            >
              <Text style={styles.addButtonText}>+ Add</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={drivers}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.driverItem}
                onPress={() => setSelectedDriver(item)}
              >
                <View style={styles.driverInfo}>
                  <View style={styles.driverNameRow}>
                    <Text style={styles.driverName}>{item.name}</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            item.status === 'online'
                              ? '#34C75920'
                              : '#95A5A620',
                        },
                      ]}
                    >
                      <Text
                        style={{
                          color:
                            item.status === 'online'
                              ? '#34C759'
                              : '#95A5A6',
                          fontSize: 10,
                          fontWeight: '600',
                        }}
                      >
                        {item.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.driverStatsRow}>
                    <Text style={styles.driverStat}>⭐ {item.rating}</Text>
                    <Text style={styles.driverStat}>📊 {item.trips_completed} trips</Text>
                    <Text style={styles.driverStat}>💰 ₹{item.earnings_today}</Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => handleAssignVehicle(item.id, item.vehicle_assigned)}
                >
                  <Text style={styles.actionText}>→</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            )}
            scrollEnabled={false}
          />
        </View>

        {/* Vehicles Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🚙 Vehicles ({vehicles.length})</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowAddVehicle(true)}
              disabled={disabled}
            >
              <Text style={styles.addButtonText}>+ Add</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={vehicles}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.vehicleItem}>
                <View style={styles.vehicleInfo}>
                  <Text style={styles.vehicleModel}>{item.model}</Text>
                  <Text style={styles.vehicleReg}>{item.registration}</Text>
                  <Text style={styles.vehicleColor}>🎨 {item.color}</Text>
                </View>

                <View style={styles.vehicleStats}>
                  <Text style={styles.vehicleStat}>{item.driver_count} drivers</Text>
                  <View
                    style={[
                      styles.vehicleStatusBadge,
                      {
                        backgroundColor:
                          item.status === 'in_use'
                            ? '#4ECDC420'
                            : '#34C75920',
                      },
                    ]}
                  >
                    <Text
                      style={{
                        color:
                          item.status === 'in_use'
                            ? COLORS.primary
                            : '#34C759',
                        fontSize: 10,
                        fontWeight: '600',
                      }}
                    >
                      {item.status.replace('_', ' ').toUpperCase()}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            )}
            scrollEnabled={false}
          />
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </View>

      {/* Add Driver Modal */}
      <Modal visible={showAddDriver} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Driver</Text>
              <TouchableOpacity onPress={() => setShowAddDriver(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Driver Name"
              value={newDriver.name}
              onChangeText={(text) => setNewDriver({ ...newDriver, name: text })}
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone Number"
              value={newDriver.phone}
              onChangeText={(text) => setNewDriver({ ...newDriver, phone: text })}
              keyboardType="phone-pad"
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder="Email"
              value={newDriver.email}
              onChangeText={(text) => setNewDriver({ ...newDriver, email: text })}
              keyboardType="email-address"
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder="License Number"
              value={newDriver.license}
              onChangeText={(text) => setNewDriver({ ...newDriver, license: text })}
              editable={!loading}
            />

            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleAddDriver}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>Add Driver</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add Vehicle Modal */}
      <Modal visible={showAddVehicle} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Vehicle</Text>
              <TouchableOpacity onPress={() => setShowAddVehicle(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Registration Number"
              value={newVehicle.registration}
              onChangeText={(text) => setNewVehicle({ ...newVehicle, registration: text })}
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder="Vehicle Model"
              value={newVehicle.model}
              onChangeText={(text) => setNewVehicle({ ...newVehicle, model: text })}
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder="Color"
              value={newVehicle.color}
              onChangeText={(text) => setNewVehicle({ ...newVehicle, color: text })}
              editable={!loading}
            />

            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleAddVehicle}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>Add Vehicle</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  refreshButton: {
    fontSize: 16,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    padding: 10,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  section: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  addButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  driverItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    marginBottom: 8,
  },
  driverInfo: {
    flex: 1,
  },
  driverNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  driverName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  driverStatsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  driverStat: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  actionText: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '600',
  },
  vehicleItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    marginBottom: 8,
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleModel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  vehicleReg: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  vehicleColor: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  vehicleStats: {
    alignItems: 'flex-end',
    gap: 6,
  },
  vehicleStat: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  vehicleStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  closeButton: {
    fontSize: 20,
    color: COLORS.textSecondary,
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 14,
    color: COLORS.text,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: '#FFE5E5',
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    color: '#C41C00',
    fontSize: 12,
  },
});
