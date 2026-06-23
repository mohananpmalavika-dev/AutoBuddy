import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  FlatList,
  TextInput,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRidePooling, RidePool } from '../hooks/useRidePooling';

interface RidePoolingScreenProps {
  token: string | null;
  userId: string;
  userType: 'passenger' | 'driver';
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
}

export const RidePoolingScreen: React.FC<RidePoolingScreenProps> = ({
  token,
  userId,
  userType,
  pickupLat = 0,
  pickupLng = 0,
  dropoffLat = 0,
  dropoffLng = 0,
}) => {
  const {
    activePool,
    availablePools,
    fetchAvailablePools,
    createPool,
    joinPool,
    completePool,
    calculateSplitFare,
  } = useRidePooling(token, userId);

  const [refreshing, setRefreshing] = useState(false);
  const [showPoolDetail, setShowPoolDetail] = useState(false);
  const [selectedPool, setSelectedPool] = useState<RidePool | null>(null);
  const [showCreatePool, setShowCreatePool] = useState(false);
  const [baseCapacity, setBaseCapacity] = useState('4');

  useEffect(() => {
    loadPools();
  }, []);

  const loadPools = async () => {
    if (userType === 'passenger') {
      await fetchAvailablePools(pickupLat, pickupLng, dropoffLat, dropoffLng);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPools();
    setRefreshing(false);
  };

  const handleCreatePool = async () => {
    if (userType !== 'driver') {
      Alert.alert('Error', 'Only drivers can create pools');
      return;
    }

    const pool = await createPool(
      { pickupLat, pickupLng, dropoffLat, dropoffLng },
      parseInt(baseCapacity, 10) || 4
    );

    if (pool) {
      Alert.alert('Success', 'Pool created. Waiting for passengers to join...');
      setShowCreatePool(false);
      setBaseCapacity('4');
    }
  };

  const handleJoinPool = async (poolId: string) => {
    if (userType !== 'passenger') return;

    const success = await joinPool(poolId, {
      name: 'Current Passenger',
      phone: '+91XXXXXXXXXX',
      rating: 4.5,
      pickupLocation: { lat: pickupLat, lng: pickupLng, address: 'Pickup Location' },
      dropoffLocation: { lat: dropoffLat, lng: dropoffLng, address: 'Dropoff Location' },
      fare: 250,
    });

    if (success) {
      Alert.alert('Success', 'Joined pool! Waiting for driver confirmation.');
      onRefresh();
    }
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Active Pool */}
      {activePool && (
        <View style={styles.activePoolCard}>
          <View style={styles.activePoolHeader}>
            <Text style={styles.activePoolTitle}>Active Pool</Text>
            <View style={[styles.poolStatus, { backgroundColor: '#4CAF50' }]}>
              <Text style={styles.poolStatusText}>ACTIVE</Text>
            </View>
          </View>

          <View style={styles.poolStats}>
            <View style={styles.poolStatItem}>
              <MaterialIcons name="person" size={18} color="#2196F3" />
              <Text style={styles.poolStatLabel}>Passengers</Text>
              <Text style={styles.poolStatValue}>
                {activePool.passengers.length}/{activePool.capacity}
              </Text>
            </View>
            <View style={styles.poolStatItem}>
              <MaterialIcons name="attach-money" size={18} color="#4CAF50" />
              <Text style={styles.poolStatLabel}>Your Fare</Text>
              <Text style={styles.poolStatValue}>
                ₹{calculateSplitFare(activePool.totalFare, activePool.passengers.length)}
              </Text>
            </View>
            <View style={styles.poolStatItem}>
              <MaterialIcons name="discount" size={18} color="#FF9800" />
              <Text style={styles.poolStatLabel}>Savings</Text>
              <Text style={[styles.poolStatValue, { color: '#4CAF50' }]}>
                {activePool.discountPercentage}%
              </Text>
            </View>
          </View>

          {/* Passengers in Pool */}
          <View style={styles.passengersSection}>
            <Text style={styles.passengersTitle}>Passengers</Text>
            {activePool.passengers.map((passenger) => (
              <View key={passenger.id} style={styles.passengerItem}>
                <View style={styles.passengerAvatar}>
                  <Text style={styles.passengerAvatarText}>
                    {passenger.name.charAt(0)}
                  </Text>
                </View>
                <View style={styles.passengerInfo}>
                  <Text style={styles.passengerName}>{passenger.name}</Text>
                  <Text style={styles.passengerRating}>
                    <MaterialIcons name="star" size={12} color="#FFB800" />
                    {passenger.rating}
                  </Text>
                </View>
                <View
                  style={[
                    styles.passengerStatus,
                    {
                      backgroundColor:
                        passenger.status === 'pickedup'
                          ? '#4CAF50'
                          : '#FFC107',
                    },
                  ]}
                >
                  <Text style={styles.passengerStatusText}>
                    {passenger.status === 'pickedup' ? 'Aboard' : 'Waiting'}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {userType === 'driver' && activePool.status === 'active' && (
            <Pressable
              style={styles.completePoolButton}
              onPress={async () => {
                const completed = await completePool(activePool.id);
                if (completed) {
                  Alert.alert('Success', 'Pool completed');
                }
              }}
            >
              <MaterialIcons name="check-circle" size={18} color="#fff" />
              <Text style={styles.completePoolButtonText}>Complete Pool</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Driver - Create Pool */}
      {userType === 'driver' && !activePool && (
        <Pressable
          style={styles.createPoolButton}
          onPress={() => setShowCreatePool(true)}
        >
          <MaterialIcons name="add-circle" size={24} color="#fff" />
          <Text style={styles.createPoolButtonText}>Create New Pool</Text>
        </Pressable>
      )}

      {/* Passenger - Available Pools */}
      {userType === 'passenger' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Pools</Text>
          {availablePools.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="directions-car" size={48} color="#ddd" />
              <Text style={styles.emptyText}>No pools available</Text>
            </View>
          ) : (
            <FlatList
              scrollEnabled={false}
              data={availablePools}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <PoolCard
                  pool={item}
                  onPress={() => {
                    setSelectedPool(item);
                    setShowPoolDetail(true);
                  }}
                  onJoin={() => handleJoinPool(item.id)}
                  calculateSplitFare={calculateSplitFare}
                />
              )}
            />
          )}
        </View>
      )}

      {/* Create Pool Modal */}
      <Modal visible={showCreatePool} transparent animationType="slide">
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Pool</Text>
              <Pressable onPress={() => setShowCreatePool(false)}>
                <MaterialIcons name="close" size={24} color="#000" />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Vehicle Capacity</Text>
              <View style={styles.capacityButtons}>
                {[2, 3, 4, 5].map((cap) => (
                  <Pressable
                    key={cap}
                    style={[
                      styles.capacityButton,
                      baseCapacity === cap.toString() &&
                        styles.capacityButtonActive,
                    ]}
                    onPress={() => setBaseCapacity(cap.toString())}
                  >
                    <Text
                      style={[
                        styles.capacityButtonText,
                        baseCapacity === cap.toString() &&
                          styles.capacityButtonTextActive,
                      ]}
                    >
                      {cap} Seats
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.infoText}>
                You can adjust capacity anytime. Passengers will be matched based on their
                routes and pickup/dropoff locations.
              </Text>

              <Pressable style={styles.submitButton} onPress={handleCreatePool}>
                <MaterialIcons name="add-circle" size={18} color="#fff" />
                <Text style={styles.submitButtonText}>Create Pool</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Pool Detail Modal */}
      <Modal visible={showPoolDetail} transparent animationType="slide">
        {selectedPool && (
          <View style={styles.modal}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Pressable onPress={() => setShowPoolDetail(false)}>
                  <MaterialIcons name="close" size={24} color="#000" />
                </Pressable>
                <Text style={styles.modalTitle}>Pool Details</Text>
                <View style={{ width: 24 }} />
              </View>

              <ScrollView style={styles.modalBody}>
                <View style={styles.detailCard}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Total Fare</Text>
                    <Text style={styles.detailValue}>
                      ₹{selectedPool.totalFare.toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Your Share</Text>
                    <Text style={[styles.detailValue, { color: '#4CAF50' }]}>
                      ₹
                      {calculateSplitFare(
                        selectedPool.totalFare,
                        selectedPool.passengers.length + 1
                      ).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Discount</Text>
                    <Text style={[styles.detailValue, { color: '#FF9800' }]}>
                      {selectedPool.discountPercentage}%
                    </Text>
                  </View>
                </View>

                <View style={styles.detailCard}>
                  <Text style={styles.detailSectionTitle}>Route</Text>
                  <View style={styles.detailRow}>
                    <MaterialIcons name="location-on" size={16} color="#2196F3" />
                    <View style={styles.routeInfo}>
                      <Text style={styles.routeLabel}>Distance</Text>
                      <Text style={styles.routeValue}>
                        {selectedPool.route.totalDistance.toFixed(1)} km
                      </Text>
                    </View>
                  </View>
                  <View style={styles.detailRow}>
                    <MaterialIcons name="schedule" size={16} color="#FF9800" />
                    <View style={styles.routeInfo}>
                      <Text style={styles.routeLabel}>Duration</Text>
                      <Text style={styles.routeValue}>
                        {Math.round(selectedPool.route.estimatedDuration / 60)} min
                      </Text>
                    </View>
                  </View>
                </View>

                <Pressable
                  style={styles.joinButton}
                  onPress={() => {
                    handleJoinPool(selectedPool.id);
                    setShowPoolDetail(false);
                  }}
                >
                  <MaterialIcons name="done" size={18} color="#fff" />
                  <Text style={styles.joinButtonText}>Join This Pool</Text>
                </Pressable>
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>
    </ScrollView>
  );
};

const PoolCard: React.FC<{
  pool: RidePool;
  onPress: () => void;
  onJoin: () => void;
  calculateSplitFare: (total: number, count: number) => number;
}> = ({ pool, onPress, onJoin, calculateSplitFare }) => {
  return (
    <Pressable style={styles.poolCard} onPress={onPress}>
      <View style={styles.poolCardHeader}>
        <View>
          <Text style={styles.poolCapacity}>
            {pool.passengers.length}/{pool.capacity} Passengers
          </Text>
          <Text style={styles.poolDistance}>
            <MaterialIcons name="location-on" size={12} color="#666" />
            {pool.route.totalDistance.toFixed(1)} km • {Math.round(pool.route.estimatedDuration / 60)}{' '}
            min
          </Text>
        </View>
        <View style={styles.poolFareSection}>
          <Text style={styles.poolFareLabel}>Save</Text>
          <Text style={styles.poolSavings}>{pool.discountPercentage}%</Text>
        </View>
      </View>

      <View style={styles.poolCardFooter}>
        <View>
          <Text style={styles.poolFarePrice}>
            ₹{calculateSplitFare(pool.totalFare, pool.passengers.length + 1).toFixed(0)}
          </Text>
          <Text style={styles.poolFareSmall}>
            vs ₹{pool.totalFare} full price
          </Text>
        </View>
        <Pressable style={styles.joinPoolButton} onPress={onJoin}>
          <MaterialIcons name="arrow-forward" size={18} color="#fff" />
          <Text style={styles.joinPoolButtonText}>Join</Text>
        </Pressable>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  activePoolCard: {
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  activePoolHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  activePoolTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  poolStatus: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  poolStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  poolStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 12,
  },
  poolStatItem: {
    alignItems: 'center',
  },
  poolStatLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
  },
  poolStatValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginTop: 2,
  },
  passengersSection: {
    marginBottom: 12,
  },
  passengersTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  passengerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    marginBottom: 6,
  },
  passengerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  passengerAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  passengerInfo: {
    flex: 1,
  },
  passengerName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  passengerRating: {
    fontSize: 10,
    color: '#FFB800',
    marginTop: 2,
  },
  passengerStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  passengerStatusText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
  completePoolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#4CAF50',
    borderRadius: 6,
    marginTop: 12,
  },
  completePoolButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  createPoolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingVertical: 12,
    backgroundColor: '#2196F3',
    borderRadius: 8,
  },
  createPoolButtonText: {
    fontSize: 13,
    fontWeight: '700',
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
  poolCard: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 8,
  },
  poolCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  poolCapacity: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
  poolDistance: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
  },
  poolFareSection: {
    alignItems: 'center',
  },
  poolFareLabel: {
    fontSize: 10,
    color: '#666',
  },
  poolSavings: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4CAF50',
  },
  poolCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  poolFarePrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2196F3',
  },
  poolFareSmall: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  joinPoolButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#2196F3',
    borderRadius: 6,
  },
  joinPoolButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
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
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  capacityButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  capacityButton: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    alignItems: 'center',
  },
  capacityButtonActive: {
    backgroundColor: '#2196F3',
  },
  capacityButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  capacityButtonTextActive: {
    color: '#fff',
  },
  infoText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 16,
    lineHeight: 16,
  },
  detailCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  detailLabel: {
    fontSize: 12,
    color: '#666',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
  detailSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  routeInfo: {
    flex: 1,
    marginLeft: 8,
  },
  routeLabel: {
    fontSize: 11,
    color: '#666',
  },
  routeValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
    marginTop: 2,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#2196F3',
    borderRadius: 6,
  },
  submitButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#4CAF50',
    borderRadius: 6,
  },
  joinButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
});

export default RidePoolingScreen;
