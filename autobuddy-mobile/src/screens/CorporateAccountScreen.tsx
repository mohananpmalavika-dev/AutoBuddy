import React, { useState, useCallback, useEffect } from 'react';
import { View, ScrollView, FlatList, StyleSheet, TextInput, TouchableOpacity, Alert, Modal } from 'react-native';
import { Text } from 'react-native';
import { useCorporateAccounts } from '../hooks/useCorporateAccounts';

interface CorporateAccountScreenProps {
  token: string;
  userId: string;
  userType: string;
}

export const CorporateAccountScreen: React.FC<CorporateAccountScreenProps> = ({
  token,
  userId,
  userType,
}) => {
  const {
    account,
    benefits,
    reimbursements,
    policies,
    linkCorporateAccount,
    unlinkAccount,
    getCorporateSummary,
    submitExpenseReimbursement,
  } = useCorporateAccounts(userId);

  const [showLinkAccount, setShowLinkAccount] = useState(false);
  const [showReimbursementForm, setShowReimbursementForm] = useState(false);
  const [summary, setSummary] = useState({
    accountStatus: 'not_linked',
    totalBenefits: 0,
    activeBenefits: 0,
    pendingReimbursements: 0,
    totalReimbursed: 0,
  });
  const [isLoading, setIsLoading] = useState(false);

  const [accountForm, setAccountForm] = useState({
    companyName: '',
    companyEmail: '',
    employeeId: '',
    department: '',
  });

  const [reimbursementForm, setReimbursementForm] = useState({
    amount: '',
    category: 'commute',
    description: '',
  });

  useEffect(() => {
    loadSummary();
  }, []);

  const loadSummary = async () => {
    const data = await getCorporateSummary();
    setSummary(data);
  };

  const handleLinkAccount = useCallback(async () => {
    if (!accountForm.companyName.trim() || !accountForm.employeeId.trim()) {
      Alert.alert('Validation', 'Please fill in required fields');
      return;
    }

    setIsLoading(true);
    try {
      const newAccount = {
        id: `corp_${Date.now()}`,
        companyName: accountForm.companyName,
        companyEmail: accountForm.companyEmail,
        employeeId: accountForm.employeeId,
        department: accountForm.department,
        approvalStatus: 'pending' as const,
        verificationToken: `token_${Date.now()}`,
      };

      await linkCorporateAccount(newAccount);
      Alert.alert('Success', 'Corporate account linked. Awaiting approval.');
      setAccountForm({ companyName: '', companyEmail: '', employeeId: '', department: '' });
      setShowLinkAccount(false);
      await loadSummary();
    } catch (error) {
      Alert.alert('Error', 'Failed to link corporate account');
    } finally {
      setIsLoading(false);
    }
  }, [accountForm, linkCorporateAccount, loadSummary]);

  const handleUnlinkAccount = () => {
    Alert.alert(
      'Unlink Account',
      'Are you sure you want to unlink your corporate account? This will remove all corporate benefits.',
      [
        { text: 'Cancel', onPress: () => {} },
        {
          text: 'Unlink',
          onPress: async () => {
            try {
              await unlinkAccount();
              await loadSummary();
            } catch (error) {
              Alert.alert('Error', 'Failed to unlink account');
            }
          },
        },
      ],
    );
  };

  const handleSubmitReimbursement = useCallback(async () => {
    if (!reimbursementForm.amount || !reimbursementForm.description.trim()) {
      Alert.alert('Validation', 'Please fill in all fields');
      return;
    }

    setIsLoading(true);
    try {
      await submitExpenseReimbursement({
        employeeId: account?.employeeId || '',
        amount: parseFloat(reimbursementForm.amount),
        currency: '₹',
        category: reimbursementForm.category,
        description: reimbursementForm.description,
        status: 'submitted',
      });
      Alert.alert('Success', 'Reimbursement request submitted');
      setReimbursementForm({ amount: '', category: 'commute', description: '' });
      setShowReimbursementForm(false);
      await loadSummary();
    } catch (error) {
      Alert.alert('Error', 'Failed to submit reimbursement request');
    } finally {
      setIsLoading(false);
    }
  }, [reimbursementForm, account, submitExpenseReimbursement, loadSummary]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return '#4CAF50';
      case 'pending':
        return '#FF9800';
      case 'rejected':
        return '#f44336';
      case 'submitted':
      case 'under_review':
        return '#2196F3';
      case 'reimbursed':
        return '#4CAF50';
      default:
        return '#999';
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Corporate Account</Text>
        <Text style={styles.subtitle}>Manage your corporate benefits and reimbursements</Text>
      </View>

      {!account ? (
        <View style={styles.noAccountContainer}>
          <Text style={styles.noAccountTitle}>No Corporate Account Linked</Text>
          <Text style={styles.noAccountText}>
            Link your corporate account to access company benefits, discounts, and reimbursement programs.
          </Text>
          <TouchableOpacity style={styles.linkButton} onPress={() => setShowLinkAccount(true)}>
            <Text style={styles.linkButtonText}>Link Corporate Account</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.accountCard}>
            <View style={styles.accountHeader}>
              <View>
                <Text style={styles.companyName}>{account.companyName}</Text>
                <Text style={styles.employeeId}>ID: {account.employeeId}</Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: getStatusColor(account.approvalStatus) },
                ]}
              >
                <Text style={styles.statusBadgeText}>
                  {account.approvalStatus.charAt(0).toUpperCase() + account.approvalStatus.slice(1)}
                </Text>
              </View>
            </View>

            <View style={styles.accountDetails}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Department:</Text>
                <Text style={styles.detailValue}>{account.department || 'N/A'}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Email:</Text>
                <Text style={styles.detailValue}>{account.companyEmail || 'N/A'}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.unlinkButton} onPress={handleUnlinkAccount}>
              <Text style={styles.unlinkButtonText}>Unlink Account</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{summary.totalBenefits}</Text>
              <Text style={styles.statLabel}>Total Benefits</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>{summary.activeBenefits}</Text>
              <Text style={styles.statLabel}>Active</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statNumber}>₹{summary.totalReimbursed}</Text>
              <Text style={styles.statLabel}>Reimbursed</Text>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Benefits ({summary.activeBenefits})</Text>
            </View>
            <FlatList
              data={benefits}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.benefitCard}>
                  <View style={styles.benefitHeader}>
                    <Text style={styles.benefitName}>{item.name}</Text>
                    {item.isActive && <View style={styles.activeDot} />}
                  </View>
                  <Text style={styles.benefitDescription}>{item.description}</Text>
                  <View style={styles.benefitValue}>
                    <Text style={styles.benefitValueText}>
                      {item.value}
                      {item.currency}
                    </Text>
                    <Text style={styles.benefitType}>{item.type}</Text>
                  </View>
                </View>
              )}
            />
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Reimbursement Requests</Text>
              <TouchableOpacity
                style={styles.addButton}
                onPress={() => setShowReimbursementForm(true)}
              >
                <Text style={styles.addButtonText}>+ Submit</Text>
              </TouchableOpacity>
            </View>

            {reimbursements.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No reimbursement requests yet</Text>
              </View>
            ) : (
              <FlatList
                data={reimbursements.sort((a, b) => b.submittedDate - a.submittedDate)}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <View style={styles.reimbursementCard}>
                    <View style={styles.reimbursementHeader}>
                      <Text style={styles.reimbursementAmount}>₹{item.amount}</Text>
                      <View
                        style={[
                          styles.statusBadge,
                          { backgroundColor: getStatusColor(item.status) },
                        ]}
                      >
                        <Text style={styles.statusBadgeText}>
                          {item.status.replace('_', ' ').charAt(0).toUpperCase() +
                            item.status.replace('_', ' ').slice(1)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.reimbursementDescription}>{item.description}</Text>
                    <Text style={styles.reimbursementCategory}>{item.category}</Text>
                  </View>
                )}
              />
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Compliance Policies</Text>
            <FlatList
              data={policies}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.policyCard}>
                  <Text style={styles.policyTitle}>{item.title}</Text>
                  <Text style={styles.policyDescription}>{item.description}</Text>
                  <Text style={styles.policyCategory}>{item.category}</Text>
                </View>
              )}
            />
          </View>
        </>
      )}

      <Modal visible={showLinkAccount} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Link Corporate Account</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Company Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter company name"
                value={accountForm.companyName}
                onChangeText={(text) => setAccountForm({ ...accountForm, companyName: text })}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Employee ID *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter employee ID"
                value={accountForm.employeeId}
                onChangeText={(text) => setAccountForm({ ...accountForm, employeeId: text })}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Department</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter department"
                value={accountForm.department}
                onChangeText={(text) => setAccountForm({ ...accountForm, department: text })}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Company Email</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter company email"
                value={accountForm.companyEmail}
                onChangeText={(text) => setAccountForm({ ...accountForm, companyEmail: text })}
                keyboardType="email-address"
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowLinkAccount(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                onPress={handleLinkAccount}
                disabled={isLoading}
              >
                <Text style={styles.submitButtonText}>{isLoading ? 'Linking...' : 'Link Account'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showReimbursementForm} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Submit Reimbursement Request</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Amount (₹) *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter amount"
                value={reimbursementForm.amount}
                onChangeText={(text) => setReimbursementForm({ ...reimbursementForm, amount: text })}
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Category</Text>
              <View style={styles.categoryButtons}>
                {['commute', 'business', 'emergency'].map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[
                      styles.categoryButton,
                      reimbursementForm.category === cat && styles.categoryButtonActive,
                    ]}
                    onPress={() => setReimbursementForm({ ...reimbursementForm, category: cat })}
                  >
                    <Text
                      style={[
                        styles.categoryButtonText,
                        reimbursementForm.category === cat && styles.categoryButtonTextActive,
                      ]}
                    >
                      {cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Description *</Text>
              <TextInput
                style={[styles.input, styles.multilineInput]}
                placeholder="Enter description"
                value={reimbursementForm.description}
                onChangeText={(text) => setReimbursementForm({ ...reimbursementForm, description: text })}
                multiline
                numberOfLines={4}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowReimbursementForm(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
                onPress={handleSubmitReimbursement}
                disabled={isLoading}
              >
                <Text style={styles.submitButtonText}>
                  {isLoading ? 'Submitting...' : 'Submit Request'}
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
  noAccountContainer: {
    marginHorizontal: 15,
    marginTop: 40,
    padding: 25,
    backgroundColor: '#fff',
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
  },
  noAccountTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  noAccountText: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  linkButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  linkButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  accountCard: {
    margin: 15,
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  accountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 15,
  },
  companyName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  employeeId: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  accountDetails: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 12,
    marginBottom: 15,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  detailValue: {
    fontSize: 13,
    color: '#333',
  },
  unlinkButton: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    alignItems: 'center',
  },
  unlinkButtonText: {
    color: '#f44336',
    fontSize: 13,
    fontWeight: '600',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 15,
    marginBottom: 20,
    gap: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eee',
  },
  statNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2196F3',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#999',
  },
  section: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 15,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  addButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  benefitCard: {
    marginHorizontal: 15,
    marginBottom: 10,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  benefitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  benefitName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
  },
  benefitDescription: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  benefitValue: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  benefitValueText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  benefitType: {
    fontSize: 11,
    color: '#999',
    textTransform: 'capitalize',
  },
  reimbursementCard: {
    marginHorizontal: 15,
    marginBottom: 10,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
  },
  reimbursementHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reimbursementAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  reimbursementDescription: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  reimbursementCategory: {
    fontSize: 11,
    color: '#999',
    textTransform: 'capitalize',
  },
  emptyState: {
    marginHorizontal: 15,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 8,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
  },
  policyCard: {
    marginHorizontal: 15,
    marginBottom: 10,
    padding: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  policyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  policyDescription: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
  },
  policyCategory: {
    fontSize: 11,
    color: '#999',
    textTransform: 'capitalize',
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
  multilineInput: {
    textAlignVertical: 'top',
    paddingVertical: 12,
  },
  categoryButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#f9f9f9',
    alignItems: 'center',
  },
  categoryButtonActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  categoryButtonText: {
    fontSize: 12,
    color: '#666',
  },
  categoryButtonTextActive: {
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
