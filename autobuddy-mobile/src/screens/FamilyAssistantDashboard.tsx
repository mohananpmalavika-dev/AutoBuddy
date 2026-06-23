import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  RefreshControl,
  TextInput,
  Modal,
  FlatList,
} from 'react-native';
import { Text } from 'react-native';
import { useFamilyAssistant } from '../hooks/useFamilyAssistant';
import { FamilyMemberCard } from '../components/FamilyMemberCard';

type DateLike = string | number | Date | null | undefined;

const formatDateSafely = (date: DateLike): string => {
  if (!date) return 'Unknown';
  const dateObj = new Date(date);
  return !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : 'Unknown';
};

const formatDateTimeSafely = (date: DateLike): string => {
  if (!date) return 'Unknown';
  const dateObj = new Date(date);
  return !isNaN(dateObj.getTime()) ? dateObj.toLocaleString() : 'Unknown';
};

interface FamilyAssistantDashboardProps {
  userId: string;
  token: string;
  userType: string;
}

export const FamilyAssistantDashboard: React.FC<FamilyAssistantDashboardProps> = ({
  userId,
  token,
  userType,
}) => {
  const {
    familyMembers,
    upcomingAppointments,
    notifications,
    unreadCount,
    dashboardData,
    loading,
    error,
    addFamilyMember,
    refreshAll,
    markAllRead,
  } = useFamilyAssistant(userId);

  const [refreshing, setRefreshing] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    relation: 'parent' as const,
  });

  const relations: Array<'parent' | 'child' | 'spouse' | 'sibling' | 'friend'> = [
    'parent',
    'child',
    'spouse',
    'sibling',
    'friend',
  ];

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshAll();
    } finally {
      setRefreshing(false);
    }
  }, [refreshAll]);

  const handleAddMember = useCallback(async () => {
    if (!formData.name.trim() || !formData.email.trim() || !formData.phone.trim()) {
      Alert.alert('Validation', 'Please fill in all fields');
      return;
    }

    try {
      await addFamilyMember({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        relation: formData.relation,
        is_active: true,
        calendar_synced: false,
        emergency_contact: false,
      });
      setFormData({ name: '', email: '', phone: '', relation: 'parent' });
      setShowAddMemberModal(false);
      Alert.alert('Success', 'Family member added successfully');
    } catch (err) {
      Alert.alert('Error', 'Failed to add family member');
    }
  }, [formData, addFamilyMember]);

  const handleMarkAllRead = useCallback(async () => {
    try {
      await markAllRead();
    } catch (err) {
      Alert.alert('Error', 'Failed to mark notifications as read');
    }
  }, [markAllRead]);

  const getAppointmentIcon = (type: string) => {
    switch (type) {
      case 'medical':
        return '🏥';
      case 'education':
        return '🎓';
      case 'work':
        return '💼';
      case 'personal':
        return '📝';
      default:
        return '📅';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return '#FF6B6B';
      case 'medium':
        return '#FFC93C';
      case 'low':
        return '#52A552';
      default:
        return '#7C7C7C';
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Header with Unread Notifications Badge */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Family Assistant</Text>
            <Text style={styles.subtitle}>Manage your family's rides & appointments</Text>
          </View>
          <TouchableOpacity
            style={styles.notificationBadge}
            onPress={() => setShowNotificationsModal(true)}
          >
            <Text style={styles.notificationBadgeText}>{unreadCount}</Text>
          </TouchableOpacity>
        </View>

        {error && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Dashboard Stats */}
        {dashboardData && (
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{dashboardData.bookingSummary.upcomingRides}</Text>
              <Text style={styles.statLabel}>Upcoming Rides</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{upcomingAppointments.length}</Text>
              <Text style={styles.statLabel}>Appointments</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{familyMembers.length}</Text>
              <Text style={styles.statLabel}>Family Members</Text>
            </View>
          </View>
        )}

        {/* Upcoming Appointments Section */}
        {upcomingAppointments.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming Appointments</Text>
            {upcomingAppointments.slice(0, 3).map((appointment) => (
              <View key={appointment.id} style={styles.appointmentCard}>
                <View style={styles.appointmentHeader}>
                  <Text style={styles.appointmentIcon}>
                    {getAppointmentIcon(appointment.appointment_type)}
                  </Text>
                  <View style={styles.appointmentTitleContainer}>
                    <Text style={styles.appointmentTitle}>{appointment.title}</Text>
                    <Text style={styles.appointmentTime}>
                      {formatDateTimeSafely(appointment.start_time)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.priorityBadge,
                      { backgroundColor: getPriorityColor(appointment.priority) },
                    ]}
                  >
                    <Text style={styles.priorityText}>{appointment.priority}</Text>
                  </View>
                </View>
                <Text style={styles.appointmentLocation}>📍 {appointment.location}</Text>
                {appointment.estimated_travel_time_minutes && (
                  <Text style={styles.travelTime}>
                    ⏱️ Est. travel: {appointment.estimated_travel_time_minutes} min
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}

        {/* Family Members Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Family Members</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => setShowAddMemberModal(true)}
            >
              <Text style={styles.addButtonText}>+ Add</Text>
            </TouchableOpacity>
          </View>
          {familyMembers.length > 0 ? (
            familyMembers.map((member) => (
              <View key={member.id} style={styles.memberCard}>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName}>{member.name}</Text>
                  <Text style={styles.memberRelation}>{member.relation}</Text>
                  <Text style={styles.memberPhone}>{member.phone}</Text>
                </View>
                {member.calendar_synced && (
                  <View style={styles.syncedBadge}>
                    <Text style={styles.syncedText}>✓ Synced</Text>
                  </View>
                )}
              </View>
            ))
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No family members added yet</Text>
              <TouchableOpacity
                style={styles.emptyStateButton}
                onPress={() => setShowAddMemberModal(true)}
              >
                <Text style={styles.emptyStateButtonText}>Add First Member</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Recent Notifications Preview */}
        {notifications.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Notifications</Text>
            {notifications.slice(0, 2).map((notification) => (
              <View key={notification.id} style={styles.notificationItem}>
                <Text style={styles.notificationMessage}>{notification.message}</Text>
                <Text style={styles.notificationTime}>
                  {formatDateTimeSafely(notification.created_at)}
                </Text>
              </View>
            ))}
            {notifications.length > 2 && (
              <TouchableOpacity
                style={styles.viewAllButton}
                onPress={() => setShowNotificationsModal(true)}
              >
                <Text style={styles.viewAllText}>View All ({notifications.length})</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </ScrollView>

      {/* Add Family Member Modal */}
      <Modal visible={showAddMemberModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Family Member</Text>
              <TouchableOpacity onPress={() => setShowAddMemberModal(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Name"
              placeholderTextColor="#999"
              value={formData.name}
              onChangeText={(text) => setFormData({ ...formData, name: text })}
            />

            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#999"
              keyboardType="email-address"
              value={formData.email}
              onChangeText={(text) => setFormData({ ...formData, email: text })}
            />

            <TextInput
              style={styles.input}
              placeholder="Phone"
              placeholderTextColor="#999"
              keyboardType="phone-pad"
              value={formData.phone}
              onChangeText={(text) => setFormData({ ...formData, phone: text })}
            />

            <View style={styles.relationSelector}>
              <Text style={styles.relationLabel}>Relation:</Text>
              <View style={styles.relationOptions}>
                {relations.map((relation) => (
                  <TouchableOpacity
                    key={relation}
                    style={[
                      styles.relationOption,
                      formData.relation === relation && styles.relationOptionActive,
                    ]}
                    onPress={() => setFormData({ ...formData, relation })}
                  >
                    <Text
                      style={[
                        styles.relationOptionText,
                        formData.relation === relation && styles.relationOptionTextActive,
                      ]}
                    >
                      {relation}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleAddMember}
              disabled={loading}
            >
              <Text style={styles.submitButtonText}>{loading ? 'Adding...' : 'Add Member'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Notifications Modal */}
      <Modal visible={showNotificationsModal} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.notificationsModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Notifications</Text>
              <TouchableOpacity
                style={styles.markAllButton}
                onPress={handleMarkAllRead}
              >
                <Text style={styles.markAllText}>Mark All Read</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowNotificationsModal(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={notifications}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={[styles.notificationItem, !item.read && styles.unreadNotification]}>
                  <Text style={styles.notificationMessage}>{item.message}</Text>
                  <Text style={styles.notificationTime}>
                    {formatDateTimeSafely(item.created_at)}
                  </Text>
                  {item.quick_action_data?.can_book_ride && (
                    <TouchableOpacity style={styles.quickActionButton}>
                      <Text style={styles.quickActionButtonText}>Book Ride</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
              scrollEnabled={true}
              contentContainerStyle={styles.notificationList}
            />

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowNotificationsModal(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
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
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  notificationBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FF6B6B',
    justifyContent: 'center',
    alignItems: 'center',
  },
  notificationBadgeText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  errorBanner: {
    backgroundColor: '#FFE5E5',
    padding: 12,
    margin: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B6B',
  },
  errorText: {
    color: '#CC0000',
    fontSize: 13,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 12,
    paddingVertical: 16,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  section: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  addButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
  },
  appointmentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  appointmentHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  appointmentIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  appointmentTitleContainer: {
    flex: 1,
  },
  appointmentTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  appointmentTime: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  priorityText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  appointmentLocation: {
    fontSize: 12,
    color: '#666',
    marginTop: 8,
  },
  travelTime: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  memberCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
  },
  memberInfo: {
    flex: 1,
  },
  memberName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  memberRelation: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  memberPhone: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  syncedBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  syncedText: {
    color: '#4CAF50',
    fontSize: 11,
    fontWeight: 'bold',
  },
  emptyState: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  emptyStateButton: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 6,
  },
  emptyStateButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  notificationItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  unreadNotification: {
    backgroundColor: '#F3F7FF',
  },
  notificationMessage: {
    fontSize: 13,
    color: '#1a1a1a',
    fontWeight: '500',
  },
  notificationTime: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  quickActionButton: {
    backgroundColor: '#FF9800',
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  quickActionButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  viewAllButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  viewAllText: {
    color: '#2196F3',
    fontWeight: 'bold',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  notificationsModal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  modalCloseButton: {
    fontSize: 24,
    color: '#999',
  },
  markAllButton: {
    paddingVertical: 4,
  },
  markAllText: {
    color: '#2196F3',
    fontWeight: 'bold',
    fontSize: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 14,
    color: '#1a1a1a',
  },
  relationSelector: {
    marginBottom: 16,
  },
  relationLabel: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  relationOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  relationOption: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  relationOptionActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  relationOptionText: {
    fontSize: 12,
    color: '#666',
  },
  relationOptionTextActive: {
    color: '#fff',
    fontWeight: 'bold',
  },
  submitButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
  },
  notificationList: {
    paddingBottom: 12,
  },
  closeButton: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  closeButtonText: {
    color: '#1a1a1a',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
