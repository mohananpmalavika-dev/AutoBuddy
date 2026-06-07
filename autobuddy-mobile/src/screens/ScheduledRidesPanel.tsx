import React, { useCallback, useState, useEffect, useContext } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  Modal,
  StyleSheet,
  SafeAreaView,
  Text,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { scheduledRidesAPI } from '@/services/apiClient';
import { ScheduledRidesContext } from '@/contexts/ScheduledRidesContext';
import { getSocket } from '@/services/socketClient';
import { formatToIST } from '../utils/time';

type ScheduledRideStatus = 'scheduled' | 'confirmed' | 'cancelled' | 'completed' | 'pending_confirmation';
type DriverGenderPreference = 'any' | 'female' | 'male';

type ScheduledRide = {
  _id?: string;
  id?: string;
  pickup_location: string;
  dropoff_location: string;
  scheduled_datetime: string;
  status: ScheduledRideStatus | string;
  vehicle_type?: string;
  driver_gender_preference?: DriverGenderPreference | string;
  recurring?: boolean;
};

type ScheduledRidesContextValue = {
  scheduledRides: ScheduledRide[];
  setScheduledRides?: (rides: ScheduledRide[]) => void;
  addScheduledRide?: (ride: ScheduledRide) => void;
};

type ScheduledRidesPanelProps = {
  userId: string;
  userType: 'passenger' | 'driver';
};

type SocketRideEvent = {
  ride_id: string;
};

const ICONS: Record<string, string> = {
  add: '+',
  close: 'x',
  schedule: 'Clock',
  'date-range': 'Date',
  'location-on': 'Pin',
  edit: 'Edit',
  'check-circle': 'Check',
};

const MaterialIcons = ({
  name,
  size = 16,
  color = '#333',
}: {
  name: string;
  size?: number;
  color?: string;
}) => (
  <Text style={{ color, fontSize: Math.max(11, Math.min(size, 18)), fontWeight: '700' }}>
    {ICONS[name] || name}
  </Text>
);

const toScheduledRideId = (ride: Pick<ScheduledRide, '_id' | 'id'>) => ride._id || ride.id || '';
const DRIVER_GENDER_OPTIONS: { label: string; value: DriverGenderPreference }[] = [
  { label: 'Any', value: 'any' },
  { label: 'Female', value: 'female' },
  { label: 'Male', value: 'male' },
];

const driverGenderPreferenceLabel = (value?: string) => {
  const option = DRIVER_GENDER_OPTIONS.find((item) => item.value === String(value || 'any').toLowerCase());
  return option?.label || 'Any';
};

const ScheduledRidesPanel: React.FC<ScheduledRidesPanelProps> = ({
  userId,
  userType,
}) => {
  const context = useContext(ScheduledRidesContext) as ScheduledRidesContextValue | null;
  const panelAudience = userType === 'driver' ? 'Driver' : 'Passenger';
  const [scheduledRides, setScheduledRides] = useState<ScheduledRide[]>(context?.scheduledRides || []);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedRide, setSelectedRide] = useState<ScheduledRide | null>(null);

  const [formData, setFormData] = useState({
    pickup_location: '',
    dropoff_location: '',
    scheduled_datetime: new Date(),
    recurring: false,
    vehicle_type: 'standard',
    driver_gender_preference: 'any' as DriverGenderPreference,
  });

  const loadScheduledRides = useCallback(async () => {
    try {
      setLoading(true);
      const result = await scheduledRidesAPI.listScheduledRides();
      const rides = result.scheduled_rides || result.rides || [];
      setScheduledRides(rides);
      context?.setScheduledRides?.(rides);
    } catch (error) {
      console.error('Error loading scheduled rides:', error);
      Alert.alert('Error', 'Failed to load scheduled rides');
    } finally {
      setLoading(false);
    }
  }, [context]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadScheduledRides();
    setRefreshing(false);
  };

  const registerSocketListeners = useCallback(() => {
    const socket = getSocket();
    if (!socket) {return;}

    socket.on('scheduled_ride_confirmed', (data: SocketRideEvent) => {
      setScheduledRides((prev) =>
        prev.map((ride) =>
          toScheduledRideId(ride) === data.ride_id ? { ...ride, status: 'confirmed' } : ride
        )
      );
    });

    socket.on('scheduled_ride_cancelled', (data: SocketRideEvent) => {
      setScheduledRides((prev) =>
        prev.map((ride) =>
          toScheduledRideId(ride) === data.ride_id ? { ...ride, status: 'cancelled' } : ride
        )
      );
    });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadScheduledRides();
    }, 0);
    registerSocketListeners();

    return () => {
      clearTimeout(timer);
      const socket = getSocket();
      if (socket) {
        socket.off('scheduled_ride_confirmed');
        socket.off('scheduled_ride_cancelled');
      }
    };
  }, [loadScheduledRides, registerSocketListeners]);

  const handleDateTimeTextChange = (value: string) => {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      setFormData({
        ...formData,
        scheduled_datetime: parsed,
      });
    }
  };

  const handleCreateScheduledRide = async () => {
    if (
      !formData.pickup_location.trim() ||
      !formData.dropoff_location.trim()
    ) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      const newRide = await scheduledRidesAPI.createScheduledRide({
        pickup_location: formData.pickup_location,
        dropoff_location: formData.dropoff_location,
        scheduled_datetime: formData.scheduled_datetime.toISOString(),
        recurring: formData.recurring,
        vehicle_type: formData.vehicle_type,
        driver_gender_preference: formData.driver_gender_preference,
      });

      setScheduledRides([...scheduledRides, newRide]);
      context?.addScheduledRide?.(newRide);
      setFormData({
        pickup_location: '',
        dropoff_location: '',
        scheduled_datetime: new Date(),
        recurring: false,
        vehicle_type: 'standard',
        driver_gender_preference: 'any',
      });
      setShowCreateModal(false);
      Alert.alert('Success', 'Scheduled ride created');
    } catch (error) {
      console.error('Error creating scheduled ride:', error);
      Alert.alert('Error', 'Failed to create scheduled ride');
    } finally {
      setLoading(false);
    }
  };

  const handleReschedule = async () => {
    if (!selectedRide) {return;}

    Alert.alert('Reschedule Ride', 'This will create a new ride with the updated time', [
      { text: 'Cancel' },
      {
        text: 'Reschedule',
        onPress: async () => {
          try {
            const updated = await scheduledRidesAPI.updateScheduledRide(toScheduledRideId(selectedRide), {
              scheduled_datetime: formData.scheduled_datetime.toISOString(),
              driver_gender_preference: formData.driver_gender_preference,
            });
            setScheduledRides((prev) => prev.map((r) => (toScheduledRideId(r) === toScheduledRideId(selectedRide) ? updated : r)));
            setSelectedRide(updated);
            Alert.alert('Success', 'Ride rescheduled');
          } catch {
            Alert.alert('Error', 'Failed to reschedule ride');
          }
        },
      },
    ]);
  };

  const handleCancelRide = async (rideId: string) => {
    Alert.alert(
      'Cancel Ride',
      'Are you sure you want to cancel this scheduled ride?',
      [
        { text: 'No' },
        {
          text: 'Yes',
          onPress: async () => {
            try {
              await scheduledRidesAPI.cancelScheduledRide(rideId);
              setScheduledRides((prev) =>
                prev.map((r) =>
                  toScheduledRideId(r) === rideId ? { ...r, status: 'cancelled' } : r
                )
              );
              Alert.alert('Success', 'Ride cancelled');
            } catch {
              Alert.alert('Error', 'Failed to cancel ride');
            }
          },
        },
      ]
    );
  };

  const handleConfirmRide = async (rideId: string) => {
    try {
      const confirmed = await scheduledRidesAPI.confirmScheduledRide(rideId);
      setScheduledRides((prev) =>
        prev.map((r) => (toScheduledRideId(r) === rideId ? confirmed : r))
      );
      Alert.alert('Success', 'Ride confirmed');
    } catch {
      Alert.alert('Error', 'Failed to confirm ride');
    }
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      scheduled: '#4ECDC4',
      confirmed: '#51CF66',
      cancelled: '#FF6B6B',
      completed: '#95A5A6',
      pending_confirmation: '#FFD93D',
    };
    return colors[status] || '#95A5A6';
  };

  const ScheduledRideItem = ({ ride }: { ride: ScheduledRide }) => (
    <TouchableOpacity
      style={styles.rideItem}
      onPress={() => {
        setSelectedRide(ride);
        setFormData({
          ...formData,
          scheduled_datetime: new Date(ride.scheduled_datetime),
          driver_gender_preference: (String(ride.driver_gender_preference || 'any').toLowerCase() as DriverGenderPreference),
        });
        setShowDetailModal(true);
      }}
    >
      <View style={styles.rideItemHeader}>
        <View>
          <Text style={styles.rideLocation}>📍 {ride.pickup_location}</Text>
          <Text style={styles.arrow}>↓</Text>
          <Text style={styles.rideLocation}>🏁 {ride.dropoff_location}</Text>
        </View>
        <View
          style={[styles.statusBadge, { backgroundColor: getStatusColor(ride.status) }]}
        >
          <Text style={styles.statusText}>{ride.status.toUpperCase()}</Text>
        </View>
      </View>
      <View style={styles.rideDateTime}>
        <MaterialIcons name="schedule" size={16} color="#666" />
        <Text style={styles.dateTimeText}>
          {formatToIST(ride.scheduled_datetime, { dateStyle: 'medium', timeStyle: 'short' })}
        </Text>
      </View>
      <View style={styles.rideDetails}>
        <Text style={styles.vehicleType}>{ride.vehicle_type || 'Standard'}</Text>
        <Text style={styles.preferenceBadge}>
          Driver: {driverGenderPreferenceLabel(ride.driver_gender_preference)}
        </Text>
        {ride.recurring && <Text style={styles.recurringBadge}>🔄 Recurring</Text>}
      </View>
    </TouchableOpacity>
  );

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#4ECDC4" />
          <Text style={styles.loadingText}>Loading scheduled rides...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const upcomingRides = scheduledRides.filter(
    (r) =>
      new Date(r.scheduled_datetime) > new Date() &&
      r.status !== 'cancelled'
  );

  const pastRides = scheduledRides.filter(
    (r) =>
      new Date(r.scheduled_datetime) <= new Date() ||
      r.status === 'cancelled' ||
      r.status === 'completed'
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{panelAudience} Scheduled Rides</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setShowCreateModal(true)}
        >
          <MaterialIcons name="add" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {/* Tabs and content */}
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {upcomingRides.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Upcoming Rides</Text>
            {upcomingRides.map((ride) => (
              <ScheduledRideItem key={toScheduledRideId(ride)} ride={ride} />
            ))}
          </>
        )}

        {pastRides.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Past Rides</Text>
            {pastRides.map((ride) => (
              <ScheduledRideItem key={toScheduledRideId(ride)} ride={ride} />
            ))}
          </>
        )}

        {scheduledRides.length === 0 && (
          <View style={styles.emptyContainer}>
            <MaterialIcons name="schedule" size={64} color="#ddd" />
            <Text style={styles.emptyText}>No scheduled rides yet</Text>
            <Text style={styles.emptySubText}>
              Schedule a ride in advance for convenience
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Create modal */}
      <Modal visible={showCreateModal} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreateModal(false)}>
              <MaterialIcons name="close" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Schedule a Ride</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            <Text style={styles.formLabel}>Pickup Location *</Text>
            <View style={styles.locationInput}>
              <MaterialIcons name="location-on" size={20} color="#4ECDC4" />
              <TextInput
                style={styles.locationTextInput}
                placeholder="Enter pickup location"
                placeholderTextColor="#999"
                value={formData.pickup_location}
                onChangeText={(pickup_location) => setFormData({ ...formData, pickup_location })}
              />
            </View>

            <Text style={styles.formLabel}>Dropoff Location *</Text>
            <View style={styles.locationInput}>
              <MaterialIcons name="location-on" size={20} color="#FF6B6B" />
              <TextInput
                style={styles.locationTextInput}
                placeholder="Enter dropoff location"
                placeholderTextColor="#999"
                value={formData.dropoff_location}
                onChangeText={(dropoff_location) => setFormData({ ...formData, dropoff_location })}
              />
            </View>

            <Text style={styles.formLabel}>Schedule Date & Time *</Text>
            <View style={styles.dateTimeButton}>
              <MaterialIcons name="date-range" size={20} color="#4ECDC4" />
              <TextInput
                style={styles.locationTextInput}
                placeholder="YYYY-MM-DD HH:mm"
                placeholderTextColor="#999"
                defaultValue={formData.scheduled_datetime.toISOString().slice(0, 16).replace('T', ' ')}
                onEndEditing={(event) => handleDateTimeTextChange(event.nativeEvent.text)}
              />
            </View>

            <Text style={styles.formLabel}>Vehicle Type</Text>
            <View style={styles.vehicleTypeContainer}>
              {['standard', 'comfort', 'xl'].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.vehicleOption,
                    formData.vehicle_type === type && styles.vehicleOptionActive,
                  ]}
                  onPress={() =>
                    setFormData({ ...formData, vehicle_type: type })
                  }
                >
                  <Text
                    style={[
                      styles.vehicleOptionText,
                      formData.vehicle_type === type &&
                        styles.vehicleOptionTextActive,
                    ]}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.formLabel}>Driver Gender Preference</Text>
            <View style={styles.preferenceOptions}>
              {DRIVER_GENDER_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.preferenceOption,
                    formData.driver_gender_preference === option.value && styles.preferenceOptionActive,
                  ]}
                  onPress={() => setFormData({ ...formData, driver_gender_preference: option.value })}
                >
                  <Text
                    style={[
                      styles.preferenceOptionText,
                      formData.driver_gender_preference === option.value && styles.preferenceOptionTextActive,
                    ]}
                  >
                    {option.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleCreateScheduledRide}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.submitButtonText}>Schedule Ride</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Detail modal */}
      <Modal visible={showDetailModal} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowDetailModal(false)}>
              <MaterialIcons name="close" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Ride Details</Text>
            <View style={{ width: 24 }} />
          </View>

          {selectedRide && (
            <ScrollView style={styles.modalContent}>
              <View style={styles.detailSection}>
                <Text style={styles.detailLabel}>Pickup</Text>
                <Text style={styles.detailValue}>{selectedRide.pickup_location}</Text>

                <Text style={[styles.detailLabel, { marginTop: 16 }]}>Dropoff</Text>
                <Text style={styles.detailValue}>{selectedRide.dropoff_location}</Text>

                <Text style={[styles.detailLabel, { marginTop: 16 }]}>Scheduled</Text>
                <Text style={styles.detailValue}>
                  {formatToIST(selectedRide.scheduled_datetime, { dateStyle: 'medium', timeStyle: 'short' })}
                </Text>

                <Text style={[styles.detailLabel, { marginTop: 16 }]}>Driver Gender Preference</Text>
                <Text style={styles.detailValue}>
                  {driverGenderPreferenceLabel(selectedRide.driver_gender_preference)}
                </Text>

                <Text style={[styles.detailLabel, { marginTop: 16 }]}>Status</Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(selectedRide.status) },
                  ]}
                >
                  <Text style={styles.statusText}>{selectedRide.status.toUpperCase()}</Text>
                </View>
              </View>

              {selectedRide.status !== 'cancelled' &&
                selectedRide.status !== 'completed' && (
                  <View style={styles.actionSection}>
                    {selectedRide.status === 'scheduled' && (
                      <>
                        <TouchableOpacity
                          style={[styles.actionBtn, styles.rescheduleBtn]}
                          onPress={handleReschedule}
                        >
                          <MaterialIcons name="edit" size={20} color="white" />
                          <Text style={styles.actionBtnText}>Reschedule</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.actionBtn, styles.cancelBtn]}
                          onPress={() =>
                            handleCancelRide(toScheduledRideId(selectedRide))
                          }
                        >
                          <MaterialIcons name="close" size={20} color="white" />
                          <Text style={styles.actionBtnText}>Cancel</Text>
                        </TouchableOpacity>
                      </>
                    )}

                    {selectedRide.status === 'pending_confirmation' && (
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.confirmBtn]}
                        onPress={() =>
                          handleConfirmRide(toScheduledRideId(selectedRide))
                        }
                      >
                        <MaterialIcons name="check-circle" size={20} color="white" />
                        <Text style={styles.actionBtnText}>Confirm</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  createButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4ECDC4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 64,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 12,
  },
  emptySubText: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f5f5f5',
  },
  rideItem: {
    backgroundColor: 'white',
    marginHorizontal: 8,
    marginVertical: 4,
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4ECDC4',
  },
  rideItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  rideLocation: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  arrow: {
    fontSize: 12,
    color: '#999',
    marginVertical: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'white',
  },
  rideDateTime: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  dateTimeText: {
    fontSize: 12,
    color: '#666',
    marginLeft: 4,
  },
  rideDetails: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  vehicleType: {
    fontSize: 12,
    fontWeight: '500',
    color: '#4ECDC4',
  },
  preferenceBadge: {
    fontSize: 12,
    fontWeight: '500',
    color: '#5D6D7E',
  },
  recurringBadge: {
    fontSize: 12,
    fontWeight: '500',
    color: '#FFD93D',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  locationInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  locationTextInput: {
    flex: 1,
    fontSize: 14,
    color: '#333',
    marginLeft: 8,
    paddingVertical: 0,
  },
  dateTimeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  vehicleTypeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  vehicleOption: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingVertical: 10,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  vehicleOptionActive: {
    backgroundColor: '#4ECDC4',
  },
  vehicleOptionText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  vehicleOptionTextActive: {
    color: 'white',
  },
  preferenceOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginBottom: 16,
  },
  preferenceOption: {
    minWidth: 84,
    flexGrow: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingVertical: 10,
    marginHorizontal: 4,
    marginBottom: 8,
    alignItems: 'center',
  },
  preferenceOptionActive: {
    backgroundColor: '#4ECDC4',
  },
  preferenceOptionText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  preferenceOptionTextActive: {
    color: 'white',
  },
  submitButton: {
    backgroundColor: '#4ECDC4',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  detailSection: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
  },
  actionSection: {
    flexDirection: 'row',
    marginTop: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  rescheduleBtn: {
    backgroundColor: '#4ECDC4',
  },
  cancelBtn: {
    backgroundColor: '#FF6B6B',
  },
  confirmBtn: {
    backgroundColor: '#51CF66',
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    marginLeft: 8,
  },
});

export default ScheduledRidesPanel;
