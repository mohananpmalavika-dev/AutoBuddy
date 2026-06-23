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
import { useOperatorDriverManagement } from '../hooks/useOperatorDriverManagement';

interface OperationsMonitoringScreenProps {
  token: string | null;
  operatorId: string;
}

export const OperationsMonitoringScreen: React.FC<OperationsMonitoringScreenProps> = ({
  token,
  operatorId,
}) => {
  const { drivers, loading, fetchDrivers, sendMessage } =
    useOperatorDriverManagement(token, operatorId);

  const [refreshing, setRefreshing] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [showDriverDetail, setShowDriverDetail] = useState(false);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageText, setMessageText] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'online' | 'offline' | 'active'>('all');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await fetchDrivers();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleSendMessage = async () => {
    if (!messageText.trim()) {
      Alert.alert('Error', 'Message cannot be empty');
      return;
    }

    if (!selectedDriver) {return;}

    const success = await sendMessage(selectedDriver.id, messageText);
    if (success) {
      Alert.alert('Success', 'Message sent to driver');
      setMessageText('');
      setShowMessageModal(false);
    } else {
      Alert.alert('Error', 'Failed to send message');
    }
  };

  const filteredDrivers = drivers.filter((driver) => {
    if (filterStatus === 'all') {return true;}
    if (filterStatus === 'online') {return driver.status === 'online';}
    if (filterStatus === 'offline') {return driver.status === 'offline';}
    if (filterStatus === 'active') {return driver.activeRides && driver.activeRides.length > 0;}
    return true;
  });

  const stats = {
    total: drivers.length,
    online: drivers.filter((d) => d.status === 'online').length,
    offline: drivers.filter((d) => d.status === 'offline').length,
    activeRides: drivers.reduce((sum, d) => sum + (d.activeRides?.length || 0), 0),
    revenue: drivers.reduce((sum, d) => sum + (d.totalEarnings || 0), 0),
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* KPI Cards */}
      <View style={styles.kpiContainer}>
        <KPICard
          icon="directions-car"
          label="Total Drivers"
          value={stats.total.toString()}
          color="#2196F3"
        />
        <KPICard
          icon="check-circle"
          label="Online"
          value={stats.online.toString()}
          color="#4CAF50"
        />
        <KPICard
          icon="offline-bolt"
          label="Offline"
          value={stats.offline.toString()}
          color="#9C27B0"
        />
        <KPICard
          icon="trending-up"
          label="Active Rides"
          value={stats.activeRides.toString()}
          color="#FF9800"
        />
      </View>

      {/* Revenue Card */}
      <View style={styles.revenueCard}>
        <View>
          <Text style={styles.revenueLabel}>Total Fleet Revenue</Text>
          <Text style={styles.revenueValue}>₹{stats.revenue.toFixed(0)}</Text>
        </View>
        <MaterialIcons name="trending-up" size={32} color="#4CAF50" />
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        <FilterTab
          label={`All (${drivers.length})`}
          active={filterStatus === 'all'}
          onPress={() => setFilterStatus('all')}
        />
        <FilterTab
          label={`Online (${stats.online})`}
          active={filterStatus === 'online'}
          onPress={() => setFilterStatus('online')}
        />
        <FilterTab
          label={`Offline (${stats.offline})`}
          active={filterStatus === 'offline'}
          onPress={() => setFilterStatus('offline')}
        />
        <FilterTab
          label={`Active (${stats.activeRides})`}
          active={filterStatus === 'active'}
          onPress={() => setFilterStatus('active')}
        />
      </View>

      {/* Drivers List */}
      {loading && drivers.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
        </View>
      ) : filteredDrivers.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="directions-car" size={48} color="#ddd" />
          <Text style={styles.emptyText}>No drivers found</Text>
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Fleet Status</Text>
          {filteredDrivers.map((driver) => (
            <DriverCard
              key={driver.id}
              driver={driver}
              onPress={() => {
                setSelectedDriver(driver);
                setShowDriverDetail(true);
              }}
            />
          ))}
        </View>
      )}

      {/* Driver Detail Modal */}
      <Modal visible={showDriverDetail} transparent animationType="slide">
        {selectedDriver && (
          <View style={styles.modal}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Pressable onPress={() => setShowDriverDetail(false)}>
                  <MaterialIcons name="close" size={24} color="#000" />
                </Pressable>
                <Text style={styles.modalTitle}>Driver Details</Text>
                <Pressable
                  onPress={() => {
                    setShowMessageModal(true);
                  }}
                >
                  <MaterialIcons name="send" size={24} color="#2196F3" />
                </Pressable>
              </View>

              <ScrollView style={styles.modalBody}>
                {/* Driver Info */}
                <View style={styles.detailCard}>
                  <View style={styles.detailRow}>
                    <MaterialIcons name="person" size={20} color="#2196F3" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Name</Text>
                      <Text style={styles.detailValue}>{selectedDriver.name}</Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons name="phone" size={20} color="#2196F3" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Phone</Text>
                      <Text style={styles.detailValue}>{selectedDriver.phone}</Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons
                      name={
                        selectedDriver.status === 'online'
                          ? 'check-circle'
                          : 'offline-bolt'
                      }
                      size={20}
                      color={
                        selectedDriver.status === 'online'
                          ? '#4CAF50'
                          : '#999'
                      }
                    />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Status</Text>
                      <Text style={styles.detailValue}>
                        {selectedDriver.status === 'online' ? 'Online' : 'Offline'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons name="star" size={20} color="#FF9800" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Rating</Text>
                      <Text style={styles.detailValue}>
                        {selectedDriver.rating.toFixed(1)} ⭐
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Performance Metrics */}
                <View style={styles.section}>
                  <Text style={styles.metricsTitle}>Performance Metrics</Text>

                  <View style={styles.detailCard}>
                    <View style={styles.metricRow}>
                      <Text style={styles.metricLabel}>Total Rides</Text>
                      <Text style={styles.metricValue}>
                        {selectedDriver.totalRides || 0}
                      </Text>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.metricRow}>
                      <Text style={styles.metricLabel}>Active Rides</Text>
                      <Text style={styles.metricValue}>
                        {selectedDriver.activeRides?.length || 0}
                      </Text>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.metricRow}>
                      <Text style={styles.metricLabel}>Acceptance Rate</Text>
                      <Text style={styles.metricValue}>
                        {(selectedDriver.acceptanceRate || 0).toFixed(1)}%
                      </Text>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.metricRow}>
                      <Text style={styles.metricLabel}>Cancellation Rate</Text>
                      <Text
                        style={[
                          styles.metricValue,
                          {
                            color:
                              (selectedDriver.cancellationRate || 0) > 5
                                ? '#F44336'
                                : '#4CAF50',
                          },
                        ]}
                      >
                        {(selectedDriver.cancellationRate || 0).toFixed(1)}%
                      </Text>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.metricRow}>
                      <Text style={styles.metricLabel}>Total Earnings</Text>
                      <Text style={[styles.metricValue, { color: '#4CAF50' }]}>
                        ₹{(selectedDriver.totalEarnings || 0).toFixed(0)}
                      </Text>
                    </View>

                    <View style={styles.divider} />

                    <View style={styles.metricRow}>
                      <Text style={styles.metricLabel}>Hours Online</Text>
                      <Text style={styles.metricValue}>
                        {selectedDriver.hoursOnline || 0}h
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Active Rides */}
                {selectedDriver.activeRides && selectedDriver.activeRides.length > 0 && (
                  <View style={styles.section}>
                    <Text style={styles.metricsTitle}>Active Rides</Text>
                    {selectedDriver.activeRides.map((ride: any, index: number) => (
                      <View key={index} style={styles.rideCard}>
                        <View style={styles.rideHeader}>
                          <MaterialIcons name="directions-car" size={16} color="#2196F3" />
                          <Text style={styles.rideId}>Ride #{ride.id}</Text>
                        </View>
                        <Text style={styles.ridePassenger}>{ride.passengerName}</Text>
                        <Text style={styles.rideDistance}>{ride.distance} km</Text>
                      </View>
                    ))}
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>

      {/* Message Modal */}
      <Modal visible={showMessageModal} transparent animationType="slide">
        <View style={styles.modal}>
          <View style={styles.messageModalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Send Message</Text>
              <Pressable onPress={() => setShowMessageModal(false)}>
                <MaterialIcons name="close" size={24} color="#000" />
              </Pressable>
            </View>

            <View style={styles.messageModalBody}>
              <Text style={styles.messageLabel}>To: {selectedDriver?.name}</Text>

              <View style={styles.messageInputContainer}>
                <Text style={styles.messageInputLabel}>Message</Text>
                <View style={styles.messageInput}>
                  {/* Note: In a real app, this would be a TextInput */}
                  <Text style={styles.messageInputPlaceholder}>
                    Type your message here...
                  </Text>
                </View>
              </View>

              <Pressable
                style={styles.sendButton}
                onPress={handleSendMessage}
              >
                <MaterialIcons name="send" size={20} color="#fff" />
                <Text style={styles.sendButtonText}>Send Message</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const KPICard: React.FC<{
  icon: string;
  label: string;
  value: string;
  color: string;
}> = ({ icon, label, value, color }) => {
  return (
    <View style={[styles.kpiCard, { borderLeftColor: color, borderLeftWidth: 4 }]}>
      <MaterialIcons name={icon as any} size={24} color={color} />
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
    </View>
  );
};

const FilterTab: React.FC<{
  label: string;
  active: boolean;
  onPress: () => void;
}> = ({ label, active, onPress }) => {
  return (
    <Pressable
      style={[styles.filterTab, active && styles.filterTabActive]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.filterTabText,
          active && styles.filterTabTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
};

const DriverCard: React.FC<{
  driver: any;
  onPress: () => void;
}> = ({ driver, onPress }) => {
  const getStatusColor = (status: string) => {
    return status === 'online' ? '#4CAF50' : '#999';
  };

  return (
    <Pressable style={styles.driverCard} onPress={onPress}>
      <View style={styles.driverHeader}>
        <View style={styles.driverInfo}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: getStatusColor(driver.status) },
            ]}
          />
          <View>
            <Text style={styles.driverName}>{driver.name}</Text>
            <Text style={styles.driverStatus}>
              {driver.status === 'online' ? 'Online' : 'Offline'}
            </Text>
          </View>
        </View>
        <Text style={styles.driverRating}>{driver.rating.toFixed(1)}⭐</Text>
      </View>

      <View style={styles.driverMetrics}>
        <MetricBadge label="Rides" value={driver.totalRides || 0} />
        <MetricBadge label="Active" value={driver.activeRides?.length || 0} />
        <MetricBadge label="Earnings" value={`₹${(driver.totalEarnings || 0).toFixed(0)}`} />
      </View>

      {driver.activeRides && driver.activeRides.length > 0 && (
        <View style={styles.activeRideIndicator}>
          <MaterialIcons name="directions-car" size={14} color="#FF9800" />
          <Text style={styles.activeRideText}>
            {driver.activeRides.length} ride(s) active
          </Text>
        </View>
      )}
    </Pressable>
  );
};

const MetricBadge: React.FC<{
  label: string;
  value: string | number;
}> = ({ label, value }) => {
  return (
    <View style={styles.metricBadge}>
      <Text style={styles.metricBadgeLabel}>{label}</Text>
      <Text style={styles.metricBadgeValue}>{value}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  kpiContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingVertical: 12,
    gap: 8,
  },
  kpiCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  kpiLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 8,
  },
  kpiValue: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  revenueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  revenueLabel: {
    fontSize: 12,
    color: '#666',
  },
  revenueValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#4CAF50',
    marginTop: 4,
  },
  filterTabs: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  filterTabActive: {
    backgroundColor: '#2196F3',
  },
  filterTabText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
  },
  filterTabTextActive: {
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
  metricsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  driverCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  driverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  driverName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
  driverStatus: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  driverRating: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FF9800',
  },
  driverMetrics: {
    flexDirection: 'row',
    gap: 8,
  },
  metricBadge: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  metricBadgeLabel: {
    fontSize: 9,
    color: '#666',
  },
  metricBadgeValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
    marginTop: 2,
  },
  activeRideIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#FFF3E0',
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  activeRideText: {
    fontSize: 10,
    color: '#FF9800',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 12,
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
  messageModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '60%',
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
  messageModalBody: {
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
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 10,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
  rideCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },
  rideHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  rideId: {
    fontSize: 11,
    fontWeight: '700',
    color: '#000',
  },
  ridePassenger: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  rideDistance: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  messageLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    marginBottom: 12,
  },
  messageInputContainer: {
    marginBottom: 16,
  },
  messageInputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  messageInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    minHeight: 100,
    justifyContent: 'flex-start',
  },
  messageInputPlaceholder: {
    fontSize: 12,
    color: '#999',
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#2196F3',
    borderRadius: 6,
  },
  sendButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
});

export default OperationsMonitoringScreen;
