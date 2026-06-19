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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouteOptimization, Stop } from '../hooks/useRouteOptimization';

interface RouteOptimizationScreenProps {
  token: string | null;
  driverId: string;
  activeRideStops?: Stop[];
}

export const RouteOptimizationScreen: React.FC<RouteOptimizationScreenProps> = ({
  token,
  driverId,
  activeRideStops = [],
}) => {
  const {
    currentRoute,
    loading,
    optimizeRoute,
    updateStopStatus,
    getNavigationSteps,
  } = useRouteOptimization(token, driverId);

  const [refreshing, setRefreshing] = useState(false);
  const [navSteps, setNavSteps] = useState<any[]>([]);
  const [showStopDetail, setShowStopDetail] = useState(false);
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);

  useEffect(() => {
    if (activeRideStops.length > 0) {
      handleOptimizeRoute();
    }
  }, []);

  const handleOptimizeRoute = async () => {
    if (activeRideStops.length === 0) {
      Alert.alert('Error', 'No stops to optimize');
      return;
    }

    const optimized = await optimizeRoute(activeRideStops);
    if (optimized) {
      const steps = await getNavigationSteps(optimized.id);
      setNavSteps(steps);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await handleOptimizeRoute();
    setRefreshing(false);
  };

  const handleMarkStopComplete = async (stopId: string) => {
    if (!currentRoute) return;
    const success = await updateStopStatus(currentRoute.id, stopId, 'completed');
    if (success) {
      Alert.alert('Success', 'Stop marked as completed');
    }
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Route Summary */}
      {currentRoute && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <MaterialIcons name="timeline" size={20} color="#2196F3" />
              <Text style={styles.summaryLabel}>Distance</Text>
              <Text style={styles.summaryValue}>
                {currentRoute.totalDistance.toFixed(1)} km
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <MaterialIcons name="schedule" size={20} color="#FF9800" />
              <Text style={styles.summaryLabel}>Time</Text>
              <Text style={styles.summaryValue}>
                {Math.round(currentRoute.estimatedDuration / 60)} min
              </Text>
            </View>
            <View style={styles.summaryItem}>
              <MaterialIcons name="attach-money" size={20} color="#4CAF50" />
              <Text style={styles.summaryLabel}>Fare</Text>
              <Text style={styles.summaryValue}>₹{currentRoute.estimatedFare}</Text>
            </View>
          </View>

          {/* Optimization Stats */}
          <View style={styles.optimizationStats}>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Original Route Distance</Text>
              <Text style={styles.statValue}>
                {currentRoute.optimization.originalDistance.toFixed(1)} km
              </Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Distance Saved</Text>
              <Text style={[styles.statValue, { color: '#4CAF50' }]}>
                {currentRoute.optimization.savedDistance.toFixed(1)} km
              </Text>
            </View>
            <View style={styles.statRow}>
              <Text style={styles.statLabel}>Optimization</Text>
              <Text style={[styles.statValue, { color: '#4CAF50' }]}>
                {currentRoute.optimization.percentageOptimized.toFixed(1)}%
              </Text>
            </View>
          </View>

          {/* Traffic Status */}
          <View
            style={[
              styles.trafficStatus,
              {
                backgroundColor:
                  currentRoute.traffic.level === 'low'
                    ? '#E8F5E9'
                    : currentRoute.traffic.level === 'moderate'
                    ? '#FFF3E0'
                    : currentRoute.traffic.level === 'high'
                    ? '#FFEBEE'
                    : '#F3E5F5',
              },
            ]}
          >
            <MaterialIcons
              name={
                currentRoute.traffic.level === 'low'
                  ? 'trending-down'
                  : 'trending-up'
              }
              size={18}
              color={
                currentRoute.traffic.level === 'low'
                  ? '#4CAF50'
                  : '#FF6F00'
              }
            />
            <Text
              style={[
                styles.trafficText,
                {
                  color:
                    currentRoute.traffic.level === 'low'
                      ? '#2E7D32'
                      : '#E65100',
                },
              ]}
            >
              Traffic: {currentRoute.traffic.level.toUpperCase()} (
              {currentRoute.traffic.delay} min delay)
            </Text>
          </View>
        </View>
      )}

      {/* Stops List */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Stops ({currentRoute?.stops.length || 0})</Text>
        {loading && !currentRoute ? (
          <ActivityIndicator size="large" color="#2196F3" style={{ marginVertical: 20 }} />
        ) : currentRoute ? (
          <View style={styles.stopsList}>
            {currentRoute.stops.map((stop, index) => (
              <StopCard
                key={stop.id}
                stop={stop}
                index={index + 1}
                onPress={() => {
                  setSelectedStop(stop);
                  setShowStopDetail(true);
                }}
                onComplete={() => handleMarkStopComplete(stop.id)}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <MaterialIcons name="location-off" size={48} color="#ddd" />
            <Text style={styles.emptyText}>No stops</Text>
            <Pressable style={styles.optimizeButton} onPress={handleOptimizeRoute}>
              <MaterialIcons name="route" size={18} color="#fff" />
              <Text style={styles.optimizeButtonText}>Optimize Route</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Navigation Steps */}
      {navSteps.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Navigation ({navSteps.length} steps)</Text>
          <View style={styles.navigationList}>
            {navSteps.slice(0, 5).map((step, index) => (
              <View key={index} style={styles.navigationStep}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepInstruction}>{step.instruction}</Text>
                  <Text style={styles.stepDetails}>
                    {step.distance}m • {Math.round(step.duration / 60)} min
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Stop Detail Modal */}
      <Modal visible={showStopDetail} transparent animationType="slide">
        {selectedStop && (
          <View style={styles.modal}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Pressable onPress={() => setShowStopDetail(false)}>
                  <MaterialIcons name="close" size={24} color="#000" />
                </Pressable>
                <Text style={styles.modalTitle}>Stop Details</Text>
                <View style={{ width: 24 }} />
              </View>

              <ScrollView style={styles.modalBody}>
                <View style={styles.detailCard}>
                  <View style={styles.detailRow}>
                    <MaterialIcons name="location-on" size={20} color="#2196F3" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Location</Text>
                      <Text style={styles.detailValue}>{selectedStop.address}</Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons
                      name={
                        selectedStop.type === 'pickup'
                          ? 'person-add'
                          : 'person-remove'
                      }
                      size={20}
                      color={selectedStop.type === 'pickup' ? '#4CAF50' : '#F44336'}
                    />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Type</Text>
                      <Text style={styles.detailValue}>
                        {selectedStop.type === 'pickup' ? 'Pickup' : 'Dropoff'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons name="person" size={20} color="#2196F3" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Passenger</Text>
                      <Text style={styles.detailValue}>{selectedStop.passengerName}</Text>
                      <Text style={styles.detailSubtext}>{selectedStop.passengerPhone}</Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons
                      name="check-circle"
                      size={20}
                      color={
                        selectedStop.status === 'completed'
                          ? '#4CAF50'
                          : selectedStop.status === 'pending'
                          ? '#FFC107'
                          : '#F44336'
                      }
                    />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Status</Text>
                      <Text style={styles.detailValue}}>
                        {selectedStop.status.charAt(0).toUpperCase() +
                          selectedStop.status.slice(1)}
                      </Text>
                    </View>
                  </View>
                </View>

                {selectedStop.status !== 'completed' && (
                  <Pressable
                    style={styles.completeButton}
                    onPress={() => {
                      handleMarkStopComplete(selectedStop.id);
                      setShowStopDetail(false);
                    }}
                  >
                    <MaterialIcons name="check-circle" size={20} color="#fff" />
                    <Text style={styles.completeButtonText}>Mark as Complete</Text>
                  </Pressable>
                )}
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>
    </ScrollView>
  );
};

const StopCard: React.FC<{
  stop: Stop;
  index: number;
  onPress: () => void;
  onComplete: () => void;
}> = ({ stop, index, onPress, onComplete }) => {
  const statusColors = {
    pending: '#FFC107',
    completed: '#4CAF50',
    cancelled: '#F44336',
  };

  return (
    <Pressable style={styles.stopCard} onPress={onPress}>
      <View style={styles.stopIndex}>{index}</View>

      <View style={styles.stopInfo}>
        <Text style={styles.stopType}>
          {stop.type === 'pickup' ? '🔵 Pickup' : '🔴 Dropoff'}
        </Text>
        <Text style={styles.stopAddress} numberOfLines={2}>
          {stop.address}
        </Text>
        <Text style={styles.stopPassenger}>{stop.passengerName}</Text>
      </View>

      <View
        style={[
          styles.stopStatus,
          { backgroundColor: statusColors[stop.status] },
        ]}
      >
        <Text style={styles.stopStatusText}>{stop.status.toUpperCase()}</Text>
      </View>

      {stop.status !== 'completed' && (
        <Pressable style={styles.completeIcon} onPress={onComplete}>
          <MaterialIcons name="check-circle-outline" size={24} color="#2196F3" />
        </Pressable>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  summaryCard: {
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginTop: 2,
  },
  optimizationStats: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
  },
  statValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  trafficStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 6,
  },
  trafficText: {
    fontSize: 12,
    fontWeight: '600',
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
  stopsList: {
    gap: 8,
  },
  stopCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 8,
  },
  stopIndex: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopIndexText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  stopInfo: {
    flex: 1,
  },
  stopType: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  stopAddress: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
    lineHeight: 15,
  },
  stopPassenger: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
  },
  stopStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  stopStatusText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
  completeIcon: {
    padding: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    marginBottom: 16,
  },
  optimizeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#2196F3',
    borderRadius: 6,
  },
  optimizeButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  navigationList: {
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
  },
  navigationStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  stepNumberText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  stepContent: {
    flex: 1,
  },
  stepInstruction: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
    lineHeight: 16,
  },
  stepDetails: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
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
  detailCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    marginTop: 2,
  },
  detailSubtext: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 10,
  },
  completeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#4CAF50',
    borderRadius: 6,
  },
  completeButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
});

export default RouteOptimizationScreen;
