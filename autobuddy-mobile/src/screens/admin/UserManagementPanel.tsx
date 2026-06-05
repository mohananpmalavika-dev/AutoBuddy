/**
 * Admin User Management UI Component
 * Manage users: search, view details, block/unblock, view history
 */

import React, { useCallback, useEffect, useState } from 'react';
import { formatToIST } from '../../utils/time';
import {
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Modal,
} from 'react-native';

type UserType = 'all' | 'passenger' | 'driver' | 'admin';

type AdminUser = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  user_type: Exclude<UserType, 'all'> | string;
  created_at: string;
  blocked?: boolean;
  rating?: number;
  total_rides?: number;
  wallet_balance?: number;
};

type UserManagementPanelProps = {
  adminToken: string;
};

const UserManagementPanel = ({ adminToken }: UserManagementPanelProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [detailsModalVisible, setDetailsModalVisible] = useState(false);
  const [filterType, setFilterType] = useState<UserType>('all');

  const searchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = searchQuery
        ? `/api/admin/users/search?query=${encodeURIComponent(searchQuery)}&type=${filterType}`
        : `/api/admin/users?type=${filterType}&limit=50`;

      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      if (response.ok) {
        const data = await response.json();
        setUsers((data.users || []) as AdminUser[]);
      } else {
        Alert.alert('Error', 'Failed to search users');
      }
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to search users');
    } finally {
      setLoading(false);
    }
  }, [adminToken, filterType, searchQuery]);

  useEffect(() => {
    void Promise.resolve().then(searchUsers);
  }, [searchUsers]);

  const handleBlockUser = async (userId: string) => {
    Alert.alert('Block User', 'Are you sure?', [
      { text: 'Cancel' },
      {
        text: 'Block',
        onPress: async () => {
          try {
            const response = await fetch(`/api/admin/users/${userId}/block`, {
              method: 'PUT',
              headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ reason: 'Admin action' }),
            });

            if (response.ok) {
              Alert.alert('Success', 'User blocked');
              searchUsers();
            }
          } catch (error) {
            Alert.alert('Error', error instanceof Error ? error.message : 'Failed to block user');
          }
        },
      },
    ]);
  };

  const handleUnblockUser = async (userId: string) => {
    try {
      const response = await fetch(`/api/admin/users/${userId}/unblock`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      if (response.ok) {
        Alert.alert('Success', 'User unblocked');
        searchUsers();
      }
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to unblock user');
    }
  };

  const renderUserItem = ({ item }: { item: AdminUser }) => (
    <TouchableOpacity
      style={styles.userCard}
      onPress={() => {
        setSelectedUser(item);
        setDetailsModalVisible(true);
      }}
    >
      <View style={styles.userInfo}>
        <Text style={styles.userName}>{item.name}</Text>
        <Text style={styles.userEmail}>{item.email}</Text>
        <Text style={styles.userType}>{item.user_type.toUpperCase()}</Text>
        {item.blocked && <Text style={styles.blockedBadge}>BLOCKED</Text>}
      </View>
      <View style={styles.userActions}>
        {item.blocked ? (
          <TouchableOpacity
            style={[styles.actionButton, styles.unblockButton]}
            onPress={() => handleUnblockUser(item.id)}
          >
            <Text style={styles.actionButtonText}>Unblock</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.actionButton, styles.blockButton]}
            onPress={() => handleBlockUser(item.id)}
          >
            <Text style={styles.actionButtonText}>Block</Text>
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>User Management</Text>

      {/* Filter Tabs */}
      <View style={styles.filterTabs}>
        {(['all', 'passenger', 'driver', 'admin'] as UserType[]).map((type) => (
          <TouchableOpacity
            key={type}
            style={[styles.filterTab, filterType === type && styles.filterTabActive]}
            onPress={() => {
              setFilterType(type);
              setSearchQuery('');
            }}
          >
            <Text style={[styles.filterTabText, filterType === type && styles.filterTabTextActive]}>
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or email"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={searchUsers}
        />
        <TouchableOpacity style={styles.searchButton} onPress={searchUsers}>
          <Text style={styles.searchButtonText}>🔍</Text>
        </TouchableOpacity>
      </View>

      {/* Users List */}
      {loading ? (
        <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
      ) : (
        <FlatList
          data={users}
          renderItem={renderUserItem}
          keyExtractor={(item) => item.id}
          scrollEnabled={false}
          ListEmptyComponent={<Text style={styles.emptyText}>No users found</Text>}
        />
      )}

      {/* User Details Modal */}
      <Modal visible={detailsModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity style={styles.closeButton} onPress={() => setDetailsModalVisible(false)}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>

            {selectedUser && (
              <ScrollView>
                <Text style={styles.modalTitle}>User Details</Text>

                <View style={styles.detailField}>
                  <Text style={styles.detailLabel}>Name:</Text>
                  <Text style={styles.detailValue}>{selectedUser.name}</Text>
                </View>

                <View style={styles.detailField}>
                  <Text style={styles.detailLabel}>Email:</Text>
                  <Text style={styles.detailValue}>{selectedUser.email}</Text>
                </View>

                <View style={styles.detailField}>
                  <Text style={styles.detailLabel}>Phone:</Text>
                  <Text style={styles.detailValue}>{selectedUser.phone}</Text>
                </View>

                <View style={styles.detailField}>
                  <Text style={styles.detailLabel}>Type:</Text>
                  <Text style={styles.detailValue}>{selectedUser.user_type}</Text>
                </View>

                <View style={styles.detailField}>
                  <Text style={styles.detailLabel}>Joined:</Text>
                  <Text style={styles.detailValue}>
                    {formatToIST(selectedUser.created_at, { dateStyle: 'medium' })}
                  </Text>
                </View>

                {selectedUser.user_type === 'driver' && (
                  <>
                    <View style={styles.detailField}>
                      <Text style={styles.detailLabel}>Rating:</Text>
                      <Text style={styles.detailValue}>{selectedUser.rating || 'N/A'}</Text>
                    </View>

                    <View style={styles.detailField}>
                      <Text style={styles.detailLabel}>Total Rides:</Text>
                      <Text style={styles.detailValue}>{selectedUser.total_rides || 0}</Text>
                    </View>
                  </>
                )}

                {selectedUser.user_type === 'passenger' && (
                  <>
                    <View style={styles.detailField}>
                      <Text style={styles.detailLabel}>Total Rides:</Text>
                      <Text style={styles.detailValue}>{selectedUser.total_rides || 0}</Text>
                    </View>

                    <View style={styles.detailField}>
                      <Text style={styles.detailLabel}>Wallet Balance:</Text>
                      <Text style={styles.detailValue}>₹{selectedUser.wallet_balance || 0}</Text>
                    </View>
                  </>
                )}

                <View style={styles.detailField}>
                  <Text style={styles.detailLabel}>Status:</Text>
                  <Text style={[styles.detailValue, selectedUser.blocked && styles.blockedText]}>
                    {selectedUser.blocked ? 'BLOCKED' : 'ACTIVE'}
                  </Text>
                </View>

                {/* Action Buttons */}
                <View style={styles.modalActions}>
                  {selectedUser.blocked ? (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.unblockButton]}
                      onPress={() => {
                        handleUnblockUser(selectedUser.id);
                        setDetailsModalVisible(false);
                      }}
                    >
                      <Text style={styles.actionButtonText}>Unblock User</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.blockButton]}
                      onPress={() => {
                        handleBlockUser(selectedUser.id);
                        setDetailsModalVisible(false);
                      }}
                    >
                      <Text style={styles.actionButtonText}>Block User</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  filterTabs: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 4,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginHorizontal: 2,
  },
  filterTabActive: {
    backgroundColor: '#007AFF',
  },
  filterTabText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
  },
  filterTabTextActive: {
    color: '#fff',
  },
  searchContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  searchButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  searchButtonText: {
    fontSize: 18,
  },
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  userEmail: {
    fontSize: 12,
    color: '#666',
    marginVertical: 4,
  },
  userType: {
    fontSize: 11,
    color: '#999',
  },
  blockedBadge: {
    fontSize: 10,
    color: '#ff3b30',
    fontWeight: 'bold',
    marginTop: 4,
  },
  userActions: {
    marginLeft: 8,
  },
  actionButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  blockButton: {
    backgroundColor: '#ff3b30',
  },
  unblockButton: {
    backgroundColor: '#34c759',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  loader: {
    marginTop: 32,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 32,
    color: '#999',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '80%',
  },
  closeButton: {
    alignSelf: 'flex-end',
    paddingBottom: 12,
  },
  closeButtonText: {
    fontSize: 24,
    color: '#999',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  detailField: {
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    marginTop: 4,
  },
  blockedText: {
    color: '#ff3b30',
    fontWeight: 'bold',
  },
  modalActions: {
    marginTop: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
});

export default UserManagementPanel;
