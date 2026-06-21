import React, { useState, useCallback } from 'react';
import { View, ScrollView, FlatList, StyleSheet, TextInput, TouchableOpacity, Alert, Modal } from 'react-native';
import { Text } from 'react-native';
import { useFamilyAccounts } from '../hooks/useFamilyAccounts';
import { FamilyMemberCard } from '../components/FamilyMemberCard';

interface FamilyMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  relation: 'parent' | 'child' | 'spouse' | 'sibling' | 'friend';
  status: 'pending' | 'active' | 'inactive';
  sharedPaymentMethods?: string[];
  emergencyAccess?: boolean;
}

interface NewMemberForm {
  name: string;
  email: string;
  phone: string;
  relation: 'parent' | 'child' | 'spouse' | 'sibling' | 'friend';
}

interface FamilyManagementScreenProps {
  token: string;
  userId: string;
  userType: string;
}

export const FamilyManagementScreen: React.FC<FamilyManagementScreenProps> = ({
  token,
  userId,
  userType,
}) => {
  const { members, linkFamilyMember, removeFamilyMember, enableEmergencySharing, getMembers } =
    useFamilyAccounts(userId);

  const [showAddMember, setShowAddMember] = useState(false);
  const [formData, setFormData] = useState<NewMemberForm>({
    name: '',
    email: '',
    phone: '',
    relation: 'friend',
  });
  const [isLoading, setIsLoading] = useState(false);

  const relations: Array<'parent' | 'child' | 'spouse' | 'sibling' | 'friend'> = [
    'parent',
    'child',
    'spouse',
    'sibling',
    'friend',
  ];

  const handleAddMember = useCallback(async () => {
    if (!formData.name.trim() || !formData.email.trim() || !formData.phone.trim()) {
      Alert.alert('Validation', 'Please fill in all fields');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      Alert.alert('Validation', 'Please enter a valid email address');
      return;
    }

    setIsLoading(true);
    try {
      const newMember: FamilyMember = {
        id: `member_${Date.now()}`,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        relation: formData.relation,
        status: 'pending',
        sharedPaymentMethods: [],
        emergencyAccess: false,
      };

      await linkFamilyMember(newMember);
      Alert.alert('Success', 'Family member added. Invitation pending.');
      setFormData({ name: '', email: '', phone: '', relation: 'friend' });
      setShowAddMember(false);
      await getMembers();
    } catch (error) {
      Alert.alert('Error', 'Failed to add family member');
    } finally {
      setIsLoading(false);
    }
  }, [formData, linkFamilyMember, getMembers]);

  const handleRemoveMember = useCallback(
    (memberId: string) => {
      Alert.alert('Remove Member', 'Are you sure you want to remove this family member?', [
        { text: 'Cancel', onPress: () => {} },
        {
          text: 'Remove',
          onPress: async () => {
            try {
              await removeFamilyMember(memberId);
              await getMembers();
            } catch (error) {
              Alert.alert('Error', 'Failed to remove family member');
            }
          },
        },
      ]);
    },
    [removeFamilyMember, getMembers],
  );

  const handleToggleEmergencyAccess = useCallback(
    async (memberId: string, currentStatus: boolean) => {
      try {
        await enableEmergencySharing(memberId, !currentStatus);
        await getMembers();
      } catch (error) {
        Alert.alert('Error', 'Failed to update emergency access');
      }
    },
    [enableEmergencySharing, getMembers],
  );

  const activeMembersCount = members.filter((m) => m.status === 'active').length;
  const pendingMembersCount = members.filter((m) => m.status === 'pending').length;

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Family Accounts</Text>
        <Text style={styles.subtitle}>Manage shared access and linked family members</Text>
      </View>

      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{members.length}</Text>
          <Text style={styles.statLabel}>Total Members</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{activeMembersCount}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{pendingMembersCount}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.addButton} onPress={() => setShowAddMember(true)}>
        <Text style={styles.addButtonText}>+ Add Family Member</Text>
      </TouchableOpacity>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Family Members ({members.length})</Text>
        {members.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No family members added yet</Text>
            <Text style={styles.emptySubtext}>
              Add family members to enable shared payment and emergency access
            </Text>
          </View>
        ) : (
          <FlatList
            data={members}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <FamilyMemberCard
                member={item}
                onRemove={() => handleRemoveMember(item.id)}
                onToggleEmergencyAccess={() =>
                  handleToggleEmergencyAccess(item.id, item.emergencyAccess || false)
                }
              />
            )}
          />
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Emergency Contact Settings</Text>
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Emergency contacts with access enabled can view your current ride location and request
            ride information in case of emergency.
          </Text>
        </View>
      </View>

      <Modal visible={showAddMember} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Family Member</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Full Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter name"
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Email Address *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter email"
                value={formData.email}
                onChangeText={(text) => setFormData({ ...formData, email: text })}
                keyboardType="email-address"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Phone Number *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter phone number"
                value={formData.phone}
                onChangeText={(text) => setFormData({ ...formData, phone: text })}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Relationship</Text>
              <View style={styles.relationOptions}>
                {relations.map((rel) => (
                  <TouchableOpacity
                    key={rel}
                    style={[
                      styles.relationButton,
                      formData.relation === rel && styles.relationButtonActive,
                    ]}
                    onPress={() => setFormData({ ...formData, relation: rel })}
                  >
                    <Text
                      style={[
                        styles.relationButtonText,
                        formData.relation === rel && styles.relationButtonTextActive,
                      ]}
                    >
                      {rel.charAt(0).toUpperCase() + rel.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowAddMember(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                onPress={handleAddMember}
                disabled={isLoading}
              >
                <Text style={styles.submitButtonText}>
                  {isLoading ? 'Adding...' : 'Add Member'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 14,
    color: '#999',
  },
  statsContainer: {
    flexDirection: 'row',
    padding: 15,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
  },
  addButton: {
    marginHorizontal: 15,
    marginBottom: 20,
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginHorizontal: 15,
    marginBottom: 12,
  },
  emptyState: {
    marginHorizontal: 15,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 8,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    marginBottom: 5,
  },
  emptySubtext: {
    fontSize: 12,
    color: '#ccc',
    textAlign: 'center',
  },
  infoBox: {
    marginHorizontal: 15,
    padding: 12,
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  infoText: {
    fontSize: 13,
    color: '#1976d2',
    lineHeight: 18,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 25,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 20,
  },
  formGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
    backgroundColor: '#f9f9f9',
  },
  relationOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  relationButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f9f9f9',
  },
  relationButtonActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  relationButtonText: {
    fontSize: 13,
    color: '#666',
  },
  relationButtonTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 25,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
  },
  submitButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#2196F3',
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
});
