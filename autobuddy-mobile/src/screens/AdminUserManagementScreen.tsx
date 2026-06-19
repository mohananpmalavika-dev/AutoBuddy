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
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAdminUserManagement, AdminUser } from '../hooks/useAdminUserManagement';

interface AdminUserManagementScreenProps {
  token: string | null;
}

const AVAILABLE_PERMISSIONS = [
  'user_management',
  'user_suspension',
  'compliance_review',
  'financial_reports',
  'system_config',
  'operator_management',
  'driver_verification',
  'incident_review',
  'support_escalation',
  'analytics_access',
];

const ROLE_PERMISSIONS = {
  admin: AVAILABLE_PERMISSIONS,
  moderator: [
    'user_suspension',
    'compliance_review',
    'incident_review',
    'support_escalation',
  ],
  support: ['support_escalation', 'analytics_access'],
};

export const AdminUserManagementScreen: React.FC<AdminUserManagementScreenProps> = ({
  token,
}) => {
  const {
    users,
    loading,
    error,
    fetchUsers,
    addUser,
    removeUser,
    suspendUser,
    reactivateUser,
    updatePermissions,
    resetPassword,
  } = useAdminUserManagement(token);

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showUserDetail, setShowUserDetail] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [newUserData, setNewUserData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'support' as const,
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchUsers({ role: roleFilter || undefined, status: statusFilter || undefined });
    setRefreshing(false);
  };

  const filteredUsers = users.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = !roleFilter || user.role === roleFilter;
    const matchesStatus = !statusFilter || user.status === statusFilter;
    return matchesSearch && matchesRole && matchesStatus;
  });

  const handleAddUser = async () => {
    if (!newUserData.name.trim() || !newUserData.email.trim()) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    const result = await addUser({
      ...newUserData,
      status: 'active',
      permissions: ROLE_PERMISSIONS[newUserData.role],
    });

    if (result) {
      Alert.alert('Success', 'User added successfully');
      setNewUserData({ name: '', email: '', phone: '', role: 'support' });
      setShowAddModal(false);
    } else {
      Alert.alert('Error', 'Failed to add user');
    }
  };

  const handleSuspend = async () => {
    if (!selectedUser) return;
    Alert.prompt(
      'Suspend User',
      'Enter reason for suspension:',
      [
        { text: 'Cancel' },
        {
          text: 'Suspend',
          onPress: async (reason) => {
            const success = await suspendUser(selectedUser.id, reason || '');
            if (success) {
              Alert.alert('Success', 'User suspended');
              setShowUserDetail(false);
              setSelectedUser(null);
            }
          },
        },
      ]
    );
  };

  const handleReactivate = async () => {
    if (!selectedUser) return;
    const success = await reactivateUser(selectedUser.id);
    if (success) {
      Alert.alert('Success', 'User reactivated');
      setShowUserDetail(false);
      setSelectedUser(null);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUser) return;
    Alert.alert(
      'Reset Password',
      'Send password reset email to ' + selectedUser.email + '?',
      [
        { text: 'Cancel' },
        {
          text: 'Reset',
          onPress: async () => {
            const tempPassword = await resetPassword(selectedUser.id);
            if (tempPassword) {
              Alert.alert('Success', `Temporary password: ${tempPassword}`);
            }
          },
        },
      ]
    );
  };

  const handleRemove = async () => {
    if (!selectedUser) return;
    Alert.alert('Remove User', 'This action cannot be undone. Continue?', [
      { text: 'Cancel' },
      {
        text: 'Remove',
        onPress: async () => {
          const success = await removeUser(selectedUser.id);
          if (success) {
            Alert.alert('Success', 'User removed');
            setShowUserDetail(false);
            setSelectedUser(null);
          }
        },
        style: 'destructive',
      },
    ]);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Admin Users</Text>
        <Pressable
          style={styles.addButton}
          onPress={() => setShowAddModal(true)}
        >
          <MaterialIcons name="add" size={24} color="#fff" />
        </Pressable>
      </View>

      {/* Search & Filter */}
      <View style={styles.filterSection}>
        <View style={styles.searchContainer}>
          <MaterialIcons name="search" size={20} color="#999" />
          <TextInput
            style={styles.searchInput}
            placeholder="Search users..."
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholderTextColor="#999"
          />
        </View>

        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            {['', 'admin', 'moderator', 'support'].map((role) => (
              <Pressable
                key={role || 'all'}
                style={[
                  styles.filterButton,
                  roleFilter === role && styles.filterButtonActive,
                ]}
                onPress={() => setRoleFilter(role)}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    roleFilter === role && styles.filterButtonTextActive,
                  ]}
                >
                  {role || 'All Roles'}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.filterRow}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            {['', 'active', 'inactive', 'suspended'].map((status) => (
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
                  {status || 'All Status'}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* User List */}
      {loading && users.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2196F3" />
        </View>
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <UserCard
              user={item}
              onPress={() => {
                setSelectedUser(item);
                setShowUserDetail(true);
              }}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialIcons name="person-off" size={48} color="#ddd" />
              <Text style={styles.emptyText}>No users found</Text>
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

      {/* Add User Modal */}
      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add New Admin User</Text>
              <Pressable onPress={() => setShowAddModal(false)}>
                <MaterialIcons name="close" size={24} color="#000" />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.inputLabel}>Full Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter full name"
                value={newUserData.name}
                onChangeText={(text) => setNewUserData({ ...newUserData, name: text })}
                placeholderTextColor="#999"
              />

              <Text style={styles.inputLabel}>Email *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter email"
                value={newUserData.email}
                onChangeText={(text) => setNewUserData({ ...newUserData, email: text })}
                keyboardType="email-address"
                placeholderTextColor="#999"
              />

              <Text style={styles.inputLabel}>Phone</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter phone number"
                value={newUserData.phone}
                onChangeText={(text) => setNewUserData({ ...newUserData, phone: text })}
                keyboardType="phone-pad"
                placeholderTextColor="#999"
              />

              <Text style={styles.inputLabel}>Role *</Text>
              <View style={styles.roleButtonGroup}>
                {(['admin', 'moderator', 'support'] as const).map((role) => (
                  <Pressable
                    key={role}
                    style={[
                      styles.roleButton,
                      newUserData.role === role && styles.roleButtonActive,
                    ]}
                    onPress={() => setNewUserData({ ...newUserData, role })}
                  >
                    <Text
                      style={[
                        styles.roleButtonText,
                        newUserData.role === role && styles.roleButtonTextActive,
                      ]}
                    >
                      {role.charAt(0).toUpperCase() + role.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.permissionsLabel}>Default Permissions</Text>
              <View style={styles.permissionsList}>
                {ROLE_PERMISSIONS[newUserData.role].map((perm) => (
                  <View key={perm} style={styles.permissionItem}>
                    <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                    <Text style={styles.permissionText}>
                      {perm.replace(/_/g, ' ')}
                    </Text>
                  </View>
                ))}
              </View>

              <Pressable style={styles.addUserButton} onPress={handleAddUser}>
                <MaterialIcons name="add" size={20} color="#fff" />
                <Text style={styles.addUserButtonText}>Add User</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* User Detail Modal */}
      <Modal visible={showUserDetail} transparent animationType="slide">
        {selectedUser && (
          <View style={styles.modal}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Pressable onPress={() => setShowUserDetail(false)}>
                  <MaterialIcons name="close" size={24} color="#000" />
                </Pressable>
                <Text style={styles.modalTitle}>{selectedUser.name}</Text>
                <View style={{ width: 24 }} />
              </View>

              <ScrollView style={styles.modalBody}>
                <View style={styles.detailCard}>
                  <DetailRow label="Email" value={selectedUser.email} />
                  <DetailRow label="Phone" value={selectedUser.phone || 'N/A'} />
                  <DetailRow label="Role" value={selectedUser.role.toUpperCase()} />
                  <DetailRow label="Status" value={selectedUser.status.toUpperCase()} />
                  <DetailRow
                    label="Last Login"
                    value={
                      selectedUser.lastLogin
                        ? new Date(selectedUser.lastLogin).toLocaleString()
                        : 'Never'
                    }
                  />
                </View>

                <View style={styles.detailCard}>
                  <Text style={styles.sectionTitle}>Permissions</Text>
                  <View style={styles.permissionsList}>
                    {selectedUser.permissions.map((perm) => (
                      <View key={perm} style={styles.permissionItem}>
                        <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                        <Text style={styles.permissionText}>
                          {perm.replace(/_/g, ' ')}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>

                <View style={styles.actionsContainer}>
                  {selectedUser.status === 'active' && (
                    <Pressable style={[styles.actionButton, styles.suspendButton]} onPress={handleSuspend}>
                      <MaterialIcons name="block" size={18} color="#fff" />
                      <Text style={styles.actionButtonText}>Suspend</Text>
                    </Pressable>
                  )}

                  {selectedUser.status === 'suspended' && (
                    <Pressable
                      style={[styles.actionButton, styles.reactivateButton]}
                      onPress={handleReactivate}
                    >
                      <MaterialIcons name="check-circle" size={18} color="#fff" />
                      <Text style={styles.actionButtonText}>Reactivate</Text>
                    </Pressable>
                  )}

                  <Pressable style={[styles.actionButton, styles.resetButton]} onPress={handleResetPassword}>
                    <MaterialIcons name="lock-reset" size={18} color="#fff" />
                    <Text style={styles.actionButtonText}>Reset Password</Text>
                  </Pressable>

                  <Pressable
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={handleRemove}
                  >
                    <MaterialIcons name="delete" size={18} color="#fff" />
                    <Text style={styles.actionButtonText}>Remove User</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
};

const UserCard: React.FC<{ user: AdminUser; onPress: () => void }> = ({ user, onPress }) => {
  const statusColors = {
    active: '#4CAF50',
    inactive: '#999',
    suspended: '#F44336',
  };

  const roleIcons = {
    admin: 'shield-admin',
    moderator: 'gavel',
    support: 'support-agent',
  };

  return (
    <Pressable style={styles.userCard} onPress={onPress}>
      <View style={styles.userCardContent}>
        <View style={styles.userCardHeader}>
          <View style={styles.roleIcon}>
            <MaterialIcons name={roleIcons[user.role] as any} size={20} color="#fff" />
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userName}>{user.name}</Text>
            <Text style={styles.userEmail}>{user.email}</Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: statusColors[user.status] }]} />
        </View>
        <View style={styles.userCardFooter}>
          <Text style={styles.roleText}>{user.role.toUpperCase()}</Text>
          <Text style={styles.permCountText}>{user.permissions.length} permissions</Text>
        </View>
      </View>
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
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterSection: {
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
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
  filterRow: {
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  filterScroll: {
    flexGrow: 0,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 6,
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
  userCard: {
    marginHorizontal: 16,
    marginVertical: 6,
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
  },
  userCardContent: {
    padding: 12,
  },
  userCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  roleIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
  userEmail: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  userCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 52,
  },
  roleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2196F3',
  },
  permCountText: {
    fontSize: 11,
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
  },
  roleButtonGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  roleButton: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    alignItems: 'center',
  },
  roleButtonActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  roleButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  roleButtonTextActive: {
    color: '#fff',
  },
  permissionsLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  permissionsList: {
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    padding: 12,
    gap: 8,
  },
  permissionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  permissionText: {
    fontSize: 12,
    color: '#333',
    textTransform: 'capitalize',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  addUserButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 12,
    backgroundColor: '#2196F3',
    borderRadius: 6,
  },
  addUserButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
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
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
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
  suspendButton: {
    backgroundColor: '#FF9800',
  },
  reactivateButton: {
    backgroundColor: '#4CAF50',
  },
  resetButton: {
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
});

export default AdminUserManagementScreen;
