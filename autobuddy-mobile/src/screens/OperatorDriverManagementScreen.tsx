import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useOperatorDriverManagement } from '../hooks/useOperatorDriverManagement';

interface OperatorDriverManagementScreenProps {
  token: string | null;
  operatorId: string;
}

const statusColors = {
  pending: '#FFC107',
  approved: '#4CAF50',
  rejected: '#F44336',
  suspended: '#FF9800',
};

export const OperatorDriverManagementScreen: React.FC<OperatorDriverManagementScreenProps> = ({
  token,
  operatorId,
}) => {
  const {
    drivers,
    loading,
    error,
    fetchDrivers,
    approveDriver,
    rejectDriver,
    suspendDriver,
    unsuspendDriver,
    setCommissionRate,
    bulkApprove,
    bulkReject,
    removeDriver,
  } = useOperatorDriverManagement(token, operatorId);

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedDrivers, setSelectedDrivers] = useState<Set<string>>(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [showDriverDetail, setShowDriverDetail] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState<any>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [showRejectionModal, setShowRejectionModal] = useState(false);

  useEffect(() => {
    fetchDrivers();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchDrivers();
    setRefreshing(false);
  };

  const filteredDrivers = drivers.filter((driver) => {
    const matchesSearch =
      driver.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      driver.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      driver.phone.includes(searchQuery);
    const matchesStatus = !statusFilter || driver.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleSelectDriver = (driverId: string) => {
    const newSelected = new Set(selectedDrivers);
    if (newSelected.has(driverId)) {
      newSelected.delete(driverId);
    } else {
      newSelected.add(driverId);
    }
    setSelectedDrivers(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedDrivers.size === filteredDrivers.length) {
      setSelectedDrivers(new Set());
    } else {
      setSelectedDrivers(new Set(filteredDrivers.map((d) => d.id)));
    }
  };

  const handleBulkApprove = async () => {
    const count = await bulkApprove(Array.from(selectedDrivers));
    Alert.alert('Success', `${count} driver(s) approved`);
    setSelectedDrivers(new Set());
    setShowBulkActions(false);
  };

  const handleBulkReject = async () => {
    const count = await bulkReject(Array.from(selectedDrivers));
    Alert.alert('Success', `${count} driver(s) rejected`);
    setSelectedDrivers(new Set());
    setShowBulkActions(false);
  };

  const handleApprove = async (driverId: string) => {
    const success = await approveDriver(driverId);
    Alert.alert(success ? 'Success' : 'Error', success ? 'Driver approved' : 'Failed to approve');
    if (showDriverDetail) setShowDriverDetail(false);
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      Alert.alert('Error', 'Please provide a reason for rejection');
      return;
    }
    const success = await rejectDriver(selectedDriver.id, rejectionReason);
    Alert.alert(success ? 'Success' : 'Error', success ? 'Driver rejected' : 'Failed to reject');
    setRejectionReason('');
    setShowRejectionModal(false);
    setShowDriverDetail(false);
  };

  const handleSuspend = async (driverId: string) => {
    Alert.prompt(
      'Suspend Driver',
      'Enter reason for suspension:',
      [
        { text: 'Cancel' },
        {
          text: 'Suspend',
          onPress: async (reason) => {
            const success = await suspendDriver(driverId, reason || '');
            Alert.alert(success ? 'Success' : 'Error', success ? 'Driver suspended' : 'Failed');
            if (showDriverDetail) setShowDriverDetail(false);
          },
        },
      ]
    );
  };

  const handleUnsuspend = async (driverId: string) => {
    const success = await unsuspendDriver(driverId);
    Alert.alert(success ? 'Success' : 'Error', success ? 'Driver unsuspended' : 'Failed');
    if (showDriverDetail) setShowDriverDetail(false);
  };

  const handleDelete = (driverId: string) => {
    Alert.alert('Remove Driver', 'This action cannot be undone. Continue?', [
      { text: 'Cancel' },
      {
        text: 'Remove',
        onPress: async () => {
          const success = await removeDriver(driverId);
          Alert.alert(success ? 'Success' : 'Error', success ? 'Driver removed' : 'Failed');
          if (showDriverDetail) setShowDriverDetail(false);
        },
        style: 'destructive',
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Driver Management</Text>
        {selectedDrivers.size > 0 && (
          <Pressable
            style={styles.bulkActionButton}
            onPress={() => setShowBulkActions(!showBulkActions)}
          >
            <Text style={styles.bulkActionText}>{selectedDrivers.size} Selected</Text>
          </Pressable>
        )}
      </View>

      {/* Search & Filter */}
      <View style={styles.filterSection}>
        <View style={styles.searchContainer}>
          <MaterialIcons name="search" size={20} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name, email, phone..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.statusFilterContainer}>
          {['', 'pending', 'approved', 'rejected', 'suspended'].map((status) => (
            <Pressable
              key={status || 'all'}
              style={[
                styles.filterButton,
                statusFilter === status && styles.filterButtonActive,
              ]}
              onPress={() => setStatusFilter(status)}
            >
              <Text
                style={[
                  styles.filterButtonText,
                  statusFilter === status && styles.filterButtonTextActive,
                ]}
              >
                {status || 'All'}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Bulk Actions */}
      {showBulkActions && selectedDrivers.size > 0 && (
        <View style={styles.bulkActionsBar}>
          <Pressable
            style={[styles.bulkActionBarButton, styles.bulkApproveButton]}
            onPress={handleBulkApprove}
          >
            <MaterialIcons name="check" size={18} color="#fff" />
            <Text style={styles.bulkActionBarButtonText}>Approve All</Text>
          </Pressable>
          <Pressable
            style={[styles.bulkActionBarButton, styles.bulkRejectButton]}
            onPress={handleBulkReject}
          >
            <MaterialIcons name="close" size={18} color="#fff" />
            <Text style={styles.bulkActionBarButtonText}>Reject All</Text>
          </Pressable>
        </View>
      )}

      {/* Driver List */}
      {loading && drivers.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2196F3" />
        </View>
      ) : (
        <FlatList
          data={filteredDrivers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <DriverCard
              driver={item}
              isSelected={selectedDrivers.has(item.id)}
              onSelect={() => handleSelectDriver(item.id)}
              onPress={() => {
                setSelectedDriver(item);
                setShowDriverDetail(true);
              }}
            />
          )}
          ListHeaderComponent={
            selectedDrivers.size > 0 && (
              <View style={styles.selectAllBar}>
                <Pressable onPress={handleSelectAll}>
                  <MaterialIcons
                    name={
                      selectedDrivers.size === filteredDrivers.length
                        ? 'check-box'
                        : 'check-box-outline-blank'
                    }
                    size={24}
                    color="#2196F3"
                  />
                </Pressable>
                <Text style={styles.selectAllText}>Select All</Text>
              </View>
            )
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialIcons name="person-off" size={48} color="#ddd" />
              <Text style={styles.emptyText}>No drivers found</Text>
            </View>
          }
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        />
      )}

      {/* Error Banner */}
      {error && (
        <View style={styles.errorBanner}>
          <MaterialIcons name="error-outline" size={18} color="#F44336" />
          <Text style={styles.errorText}>{error.message}</Text>
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
                <Text style={styles.modalTitle}>{selectedDriver.name}</Text>
                <View style={{ width: 24 }} />
              </View>

              <View style={styles.modalBody}>
                <View style={styles.detailCard}>
                  <Text style={styles.detailSectionTitle}>Personal Info</Text>
                  <DetailRow label="Email" value={selectedDriver.email} />
                  <DetailRow label="Phone" value={selectedDriver.phone} />
                  <DetailRow label="License" value={selectedDriver.licenseNumber || 'N/A'} />
                  <DetailRow label="Vehicle" value={selectedDriver.vehicleNumber || 'N/A'} />
                  <DetailRow
                    label="Joined"
                    value={new Date(selectedDriver.joinedAt).toLocaleDateString()}
                  />
                </View>

                <View style={styles.detailCard}>
                  <Text style={styles.detailSectionTitle}>Performance</Text>
                  <DetailRow label="Total Rides" value={selectedDriver.totalRides.toString()} />
                  <DetailRow
                    label="Earnings"
                    value={`₹${selectedDriver.totalEarnings.toFixed(2)}`}
                  />
                  <DetailRow label="Rating" value={selectedDriver.averageRating.toFixed(1)} />
                  <DetailRow
                    label="Commission"
                    value={`${selectedDriver.commissionRate}%`}
                  />
                </View>

                <View style={styles.detailCard}>
                  <Text style={styles.detailSectionTitle}>Verification</Text>
                  <DetailRow
                    label="Documents"
                    value={selectedDriver.documentsVerified ? 'Verified' : 'Pending'}
                  />
                  <DetailRow
                    label="Background Check"
                    value={selectedDriver.backgroundCheckStatus.toUpperCase()}
                  />
                </View>

                <View style={styles.actionsContainer}>
                  {selectedDriver.status === 'pending' && (
                    <>
                      <Pressable
                        style={[styles.actionButton, styles.approveButton]}
                        onPress={() => handleApprove(selectedDriver.id)}
                      >
                        <MaterialIcons name="check-circle" size={20} color="#fff" />
                        <Text style={styles.actionButtonText}>Approve</Text>
                      </Pressable>
                      <Pressable
                        style={[styles.actionButton, styles.rejectButton]}
                        onPress={() => setShowRejectionModal(true)}
                      >
                        <MaterialIcons name="cancel" size={20} color="#fff" />
                        <Text style={styles.actionButtonText}>Reject</Text>
                      </Pressable>
                    </>
                  )}

                  {selectedDriver.status === 'approved' && (
                    <Pressable
                      style={[styles.actionButton, styles.suspendButton]}
                      onPress={() => handleSuspend(selectedDriver.id)}
                    >
                      <MaterialIcons name="pause-circle" size={20} color="#fff" />
                      <Text style={styles.actionButtonText}>Suspend</Text>
                    </Pressable>
                  )}

                  {selectedDriver.status === 'suspended' && (
                    <Pressable
                      style={[styles.actionButton, styles.approveButton]}
                      onPress={() => handleUnsuspend(selectedDriver.id)}
                    >
                      <MaterialIcons name="play-circle" size={20} color="#fff" />
                      <Text style={styles.actionButtonText}>Unsuspend</Text>
                    </Pressable>
                  )}

                  <Pressable
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => handleDelete(selectedDriver.id)}
                  >
                    <MaterialIcons name="delete" size={20} color="#fff" />
                    <Text style={styles.actionButtonText}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        )}
      </Modal>

      {/* Rejection Modal */}
      <Modal visible={showRejectionModal} transparent animationType="fade">
        <View style={styles.rejectionModalOverlay}>
          <View style={styles.rejectionModalContent}>
            <Text style={styles.rejectionModalTitle}>Reason for Rejection</Text>
            <TextInput
              style={styles.rejectionInput}
              placeholder="Enter rejection reason..."
              value={rejectionReason}
              onChangeText={setRejectionReason}
              multiline
              numberOfLines={4}
              placeholderTextColor="#999"
            />
            <View style={styles.rejectionActions}>
              <Pressable
                style={[styles.rejectionButton, styles.cancelButton]}
                onPress={() => {
                  setRejectionReason('');
                  setShowRejectionModal(false);
                }}
              >
                <Text style={styles.rejectionButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.rejectionButton, styles.confirmButton]}
                onPress={handleReject}
              >
                <Text style={[styles.rejectionButtonText, { color: '#fff' }]}>Reject</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const DriverCard: React.FC<{
  driver: any;
  isSelected: boolean;
  onSelect: () => void;
  onPress: () => void;
}> = ({ driver, isSelected, onSelect, onPress }) => (
  <Pressable style={styles.driverCard} onPress={onPress}>
    <Pressable style={styles.checkbox} onPress={onSelect}>
      <MaterialIcons
        name={isSelected ? 'check-box' : 'check-box-outline-blank'}
        size={20}
        color={isSelected ? '#2196F3' : '#ccc'}
      />
    </Pressable>

    <View style={styles.driverInfo}>
      <View style={styles.driverHeader}>
        <Text style={styles.driverName}>{driver.name}</Text>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: statusColors[driver.status] },
          ]}
        >
          <Text style={styles.statusText}>{driver.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.driverEmail}>{driver.email}</Text>
      <View style={styles.driverStats}>
        <Text style={styles.statItem}>
          <MaterialIcons name="directions-car" size={12} color="#666" /> {driver.totalRides} rides
        </Text>
        <Text style={styles.statItem}>
          <MaterialIcons name="star" size={12} color="#FFB800" /> {driver.averageRating.toFixed(1)}
        </Text>
        <Text style={styles.statItem}>
          ₹{driver.totalEarnings.toFixed(0)}
        </Text>
      </View>
    </View>
  </Pressable>
);

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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  bulkActionButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#E3F2FD',
    borderRadius: 6,
  },
  bulkActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2196F3',
  },
  filterSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    gap: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#000',
  },
  statusFilterContainer: {
    flexDirection: 'row',
    gap: 6,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 16,
  },
  filterButtonActive: {
    backgroundColor: '#2196F3',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  filterButtonTextActive: {
    color: '#fff',
  },
  selectAllBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f9f9f9',
  },
  selectAllText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  bulkActionsBar: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  bulkActionBarButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 6,
  },
  bulkApproveButton: {
    backgroundColor: '#4CAF50',
  },
  bulkRejectButton: {
    backgroundColor: '#F44336',
  },
  bulkActionBarButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  checkbox: {
    padding: 4,
  },
  driverInfo: {
    flex: 1,
  },
  driverHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  driverName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
  driverEmail: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
  },
  driverStats: {
    flexDirection: 'row',
    gap: 12,
  },
  statItem: {
    fontSize: 10,
    color: '#999',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
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
    padding: 16,
  },
  detailCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  detailSectionTitle: {
    fontSize: 13,
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
    fontSize: 12,
    color: '#666',
  },
  detailValue: {
    fontSize: 12,
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
  approveButton: {
    backgroundColor: '#4CAF50',
  },
  rejectButton: {
    backgroundColor: '#F44336',
  },
  suspendButton: {
    backgroundColor: '#FF9800',
  },
  deleteButton: {
    backgroundColor: '#F44336',
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  rejectionModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  rejectionModalContent: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
  },
  rejectionModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  rejectionInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#000',
    marginBottom: 16,
    textAlignVertical: 'top',
  },
  rejectionActions: {
    flexDirection: 'row',
    gap: 8,
  },
  rejectionButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  confirmButton: {
    backgroundColor: '#F44336',
  },
  rejectionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
});

export default OperatorDriverManagementScreen;
