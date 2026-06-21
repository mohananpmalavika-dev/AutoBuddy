import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  FlatList,
  SafeAreaView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useInsuranceCoverage } from '../hooks/useInsuranceCoverage';
import { InsuranceClaimCard } from '../components/InsuranceClaimCard';

interface InsuranceCoverageScreenProps {
  token: string | null;
  userId: string;
  userType: 'passenger' | 'driver';
}

export const InsuranceCoverageScreen: React.FC<InsuranceCoverageScreenProps> = ({
  token,
  userId,
  userType,
}) => {
  const {
    coverage,
    claims,
    loading,
    error,
    getCoverageDetails,
    getActiveClaims,
    getCoverageSummary,
    fileInsuranceClaim,
    updateClaimStatus,
  } = useInsuranceCoverage(token, userId);

  const [selectedClaim, setSelectedClaim] = useState<any>(null);
  const [showFileClaimModal, setShowFileClaimModal] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const [newClaimData, setNewClaimData] = useState({
    incidentType: 'accident' as any,
    description: '',
    location: '',
    amount: '',
  });
  const [claimError, setClaimError] = useState('');
  const [isFilingClaim, setIsFilingClaim] = useState(false);

  useEffect(() => {
    const calculatedSummary = getCoverageSummary();
    setSummary(calculatedSummary);
  }, [coverage, claims, getCoverageSummary]);

  const handleFileClaim = async () => {
    setClaimError('');

    if (!newClaimData.description.trim()) {
      setClaimError('Please describe the incident');
      return;
    }

    if (!newClaimData.location.trim()) {
      setClaimError('Please enter incident location');
      return;
    }

    const amount = parseFloat(newClaimData.amount);
    if (!amount || amount <= 0) {
      setClaimError('Please enter a valid claim amount');
      return;
    }

    try {
      setIsFilingClaim(true);

      await fileInsuranceClaim({
        incidentType: newClaimData.incidentType,
        description: newClaimData.description,
        location: newClaimData.location,
        amount,
        evidence: {
          photos: [],
          documents: [],
          description: 'Evidence to be uploaded',
        },
      });

      Alert.alert(
        'Success',
        'Your insurance claim has been filed. Our team will review it shortly.'
      );

      setShowFileClaimModal(false);
      setNewClaimData({
        incidentType: 'accident',
        description: '',
        location: '',
        amount: '',
      });
    } catch (err) {
      Alert.alert('Error', `Failed to file claim: ${err}`);
    } finally {
      setIsFilingClaim(false);
    }
  };

  const handleUpgradePlan = async (newType: 'basic' | 'premium' | 'comprehensive') => {
    // Plan upgrade would be implemented here
    Alert.alert(
      'Upgrade Plan',
      `You would be upgrading to ${newType} plan. This feature requires backend integration.`
    );
    setShowUpgradeModal(false);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  if (selectedClaim) {
    return (
      <SafeAreaView style={styles.container}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.detailHeader}>
            <Pressable onPress={() => setSelectedClaim(null)}>
              <MaterialIcons name="arrow_back" size={24} color="#333" />
            </Pressable>
            <Text style={styles.detailTitle}>Claim Details</Text>
            <View style={{ width: 24 }} />
          </View>

          {/* Claim Details */}
          <View style={styles.detailContainer}>
            <View style={styles.detailSection}>
              <Text style={styles.sectionTitle}>Claim Information</Text>

              <View style={styles.detailRow}>
                <Text style={styles.label}>Claim Number</Text>
                <Text style={styles.value}>{selectedClaim.claimNumber}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.label}>Status</Text>
                <View
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    backgroundColor:
                      selectedClaim.status === 'approved'
                        ? '#E8F5E9'
                        : selectedClaim.status === 'rejected'
                          ? '#FFEBEE'
                          : '#FFF3E0',
                    borderRadius: 4,
                  }}
                >
                  <Text
                    style={{
                      color:
                        selectedClaim.status === 'approved'
                          ? '#2E7D32'
                          : selectedClaim.status === 'rejected'
                            ? '#C62828'
                            : '#E65100',
                      fontWeight: '600',
                      fontSize: 11,
                    }}
                  >
                    {selectedClaim.status.replace('_', ' ').toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.label}>Incident Type</Text>
                <Text style={styles.value}>
                  {selectedClaim.incidentType.replace('_', ' ').toUpperCase()}
                </Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.label}>Date Filed</Text>
                <Text style={styles.value}>
                  {new Date(selectedClaim.filedDate).toLocaleDateString()}
                </Text>
              </View>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.sectionTitle}>Claim Amount</Text>

              <View style={styles.amountBox}>
                <View style={styles.amountItem}>
                  <Text style={styles.amountLabel}>Claimed Amount</Text>
                  <Text style={styles.amountValue}>
                    ₹{selectedClaim.amount.toFixed(2)}
                  </Text>
                </View>

                {selectedClaim.approvedAmount !== undefined && (
                  <View style={styles.amountItem}>
                    <Text style={styles.amountLabel}>Approved Amount</Text>
                    <Text style={[styles.amountValue, { color: '#4CAF50' }]}>
                      ₹{selectedClaim.approvedAmount.toFixed(2)}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <View style={styles.detailSection}>
              <Text style={styles.sectionTitle}>Incident Details</Text>

              <View style={styles.detailRow}>
                <Text style={styles.label}>Location</Text>
                <Text style={styles.value}>{selectedClaim.location}</Text>
              </View>

              <View style={styles.descriptionBox}>
                <Text style={styles.label}>Description</Text>
                <Text style={styles.descriptionText}>{selectedClaim.description}</Text>
              </View>
            </View>

            {selectedClaim.evidence && selectedClaim.evidence.photos.length > 0 && (
              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>Evidence</Text>
                <View style={styles.evidenceList}>
                  <MaterialIcons name="image" size={20} color="#2196F3" />
                  <Text style={styles.evidenceText}>
                    {selectedClaim.evidence.photos.length} photo
                    {selectedClaim.evidence.photos.length !== 1 ? 's' : ''} attached
                  </Text>
                </View>
              </View>
            )}

            {selectedClaim.rejectionReason && (
              <View style={[styles.detailSection, { backgroundColor: '#FFEBEE' }]}>
                <View style={styles.rejectionHeader}>
                  <MaterialIcons name="error" size={20} color="#F44336" />
                  <Text style={styles.rejectionTitle}>Rejection Reason</Text>
                </View>
                <Text style={styles.rejectionText}>{selectedClaim.rejectionReason}</Text>
              </View>
            )}

            {selectedClaim.notes && (
              <View style={styles.detailSection}>
                <Text style={styles.sectionTitle}>Notes</Text>
                <Text style={styles.noteText}>{selectedClaim.notes}</Text>
              </View>
            )}
          </View>

          {/* Action Buttons */}
          {selectedClaim.status !== 'settled' && selectedClaim.status !== 'rejected' && (
            <View style={styles.actionButtons}>
              <Pressable
                style={[styles.actionButton, { backgroundColor: '#FF9800' }]}
                onPress={() => {
                  Alert.alert(
                    'Contact Support',
                    'Contact insurance support for updates on your claim'
                  );
                }}
              >
                <MaterialIcons name="phone" size={18} color="white" />
                <Text style={styles.actionButtonText}>Contact Support</Text>
              </Pressable>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Coverage Summary */}
        {summary && (
          <>
            <View style={styles.coverageHeader}>
              <Text style={styles.coverageTitle}>{summary.coverageName}</Text>
              <View style={styles.coverageStatus}>
                <MaterialIcons
                  name={
                    summary.status === 'active' ? 'verified' : 'warning'
                  }
                  size={16}
                  color={summary.status === 'active' ? '#4CAF50' : '#FF9800'}
                />
                <Text
                  style={{
                    color: summary.status === 'active' ? '#4CAF50' : '#FF9800',
                    fontWeight: '600',
                    fontSize: 12,
                    marginLeft: 4,
                  }}
                >
                  {summary.status.toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Stats Cards */}
            <View style={styles.statsContainer}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{summary.totalClaims}</Text>
                <Text style={styles.statLabel}>Total Claims</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{summary.pendingClaims}</Text>
                <Text style={styles.statLabel}>Pending</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>₹{summary.totalApprovedAmount}</Text>
                <Text style={styles.statLabel}>Approved</Text>
              </View>
            </View>

            {/* Coverage Details */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Coverage Details</Text>

              <View style={styles.coverageDetailsBox}>
                <View style={styles.detailItem}>
                  <MaterialIcons name="attach_money" size={18} color="#2196F3" />
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Monthly Premium</Text>
                    <Text style={styles.detailValueLarge}>
                      ₹{summary.monthlyPremium}
                    </Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.detailItem}>
                  <MaterialIcons name="shield" size={18} color="#4CAF50" />
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Coverage Type</Text>
                    <Text style={styles.detailValue}>
                      {summary.coverageType.charAt(0).toUpperCase() +
                        summary.coverageType.slice(1)}
                    </Text>
                  </View>
                </View>

                <View style={styles.divider} />

                <View style={styles.detailItem}>
                  <MaterialIcons name="event" size={18} color="#FF9800" />
                  <View style={styles.detailContent}>
                    <Text style={styles.detailLabel}>Renewal Date</Text>
                    <Text style={styles.detailValue}>
                      {new Date(summary.renewalDate).toLocaleDateString()}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Coverage Features */}
              <View style={styles.featuresBox}>
                {summary.coverageDetails.accidentCoverage && (
                  <View style={styles.featureItem}>
                    <MaterialIcons name="check_circle" size={16} color="#4CAF50" />
                    <Text style={styles.featureText}>Accident Coverage</Text>
                  </View>
                )}
                {summary.coverageDetails.theftCoverage && (
                  <View style={styles.featureItem}>
                    <MaterialIcons name="check_circle" size={16} color="#4CAF50" />
                    <Text style={styles.featureText}>Theft Coverage</Text>
                  </View>
                )}
                {summary.coverageDetails.passengerInjury && (
                  <View style={styles.featureItem}>
                    <MaterialIcons name="check_circle" size={16} color="#4CAF50" />
                    <Text style={styles.featureText}>Passenger Injury Coverage</Text>
                  </View>
                )}
                {summary.coverageDetails.propertyDamage && (
                  <View style={styles.featureItem}>
                    <MaterialIcons name="check_circle" size={16} color="#4CAF50" />
                    <Text style={styles.featureText}>Property Damage Coverage</Text>
                  </View>
                )}
              </View>

              {/* Action Buttons */}
              <View style={styles.buttonGroup}>
                <Pressable
                  style={styles.primaryButton}
                  onPress={() => setShowFileClaimModal(true)}
                >
                  <MaterialIcons name="add_circle" size={20} color="white" />
                  <Text style={styles.primaryButtonText}>File a Claim</Text>
                </Pressable>

                <Pressable
                  style={[styles.primaryButton, { backgroundColor: '#FF9800' }]}
                  onPress={() => setShowUpgradeModal(true)}
                >
                  <MaterialIcons name="upgrade" size={20} color="white" />
                  <Text style={styles.primaryButtonText}>Upgrade Plan</Text>
                </Pressable>
              </View>
            </View>

            {/* Active Claims */}
            {getActiveClaims().length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Active Claims</Text>
                <FlatList
                  data={getActiveClaims()}
                  keyExtractor={item => item.id}
                  scrollEnabled={false}
                  renderItem={({ item }) => (
                    <InsuranceClaimCard
                      claim={item}
                      onPress={() => setSelectedClaim(item)}
                    />
                  )}
                />
              </View>
            )}
          </>
        )}

        {/* All Claims */}
        {claims.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>All Claims</Text>
            <FlatList
              data={claims}
              keyExtractor={item => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <InsuranceClaimCard
                  claim={item}
                  onPress={() => setSelectedClaim(item)}
                />
              )}
            />
          </View>
        )}
      </ScrollView>

      {/* File Claim Modal */}
      <Modal
        visible={showFileClaimModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFileClaimModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>File Insurance Claim</Text>
                <Pressable onPress={() => setShowFileClaimModal(false)}>
                  <MaterialIcons name="close" size={24} color="#333" />
                </Pressable>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Incident Type</Text>
                <View style={styles.pickerContainer}>
                  {['accident', 'theft', 'damage', 'injury', 'property_damage', 'other'].map(
                    type => (
                      <Pressable
                        key={type}
                        style={[
                          styles.pickerOption,
                          newClaimData.incidentType === type && styles.pickerOptionActive,
                        ]}
                        onPress={() =>
                          setNewClaimData({ ...newClaimData, incidentType: type })
                        }
                      >
                        <Text
                          style={{
                            color:
                              newClaimData.incidentType === type ? 'white' : '#333',
                            fontWeight: '600',
                            fontSize: 12,
                          }}
                        >
                          {type.replace('_', ' ')}
                        </Text>
                      </Pressable>
                    )
                  )}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Incident Location</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter location of incident"
                  placeholderTextColor="#999"
                  value={newClaimData.location}
                  onChangeText={text =>
                    setNewClaimData({ ...newClaimData, location: text })
                  }
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Claim Amount (₹)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Enter claim amount"
                  placeholderTextColor="#999"
                  value={newClaimData.amount}
                  onChangeText={text =>
                    setNewClaimData({ ...newClaimData, amount: text })
                  }
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Description</Text>
                <TextInput
                  style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                  placeholder="Describe what happened"
                  placeholderTextColor="#999"
                  value={newClaimData.description}
                  onChangeText={text =>
                    setNewClaimData({ ...newClaimData, description: text })
                  }
                  multiline
                />
              </View>

              {claimError && <Text style={styles.errorText}>{claimError}</Text>}

              <Pressable
                style={[styles.submitButton, isFilingClaim && { opacity: 0.6 }]}
                onPress={handleFileClaim}
                disabled={isFilingClaim}
              >
                {isFilingClaim ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <>
                    <MaterialIcons name="send" size={18} color="white" />
                    <Text style={styles.submitButtonText}>Submit Claim</Text>
                  </>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Upgrade Plan Modal */}
      <Modal
        visible={showUpgradeModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowUpgradeModal(false)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Upgrade Your Plan</Text>
                <Pressable onPress={() => setShowUpgradeModal(false)}>
                  <MaterialIcons name="close" size={24} color="#333" />
                </Pressable>
              </View>

              {['basic', 'premium', 'comprehensive'].map(planType => (
                <View
                  key={planType}
                  style={[
                    styles.planCard,
                    planType === 'premium' && styles.planCardHighlight,
                  ]}
                >
                  <View style={styles.planHeader}>
                    <Text style={styles.planName}>
                      {planType.charAt(0).toUpperCase() + planType.slice(1)}
                    </Text>
                    <Text style={styles.planPrice}>
                      ₹{planType === 'basic' ? 199 : planType === 'premium' ? 299 : 499}
                      /month
                    </Text>
                  </View>

                  <Text style={styles.planDescription}>
                    {planType === 'basic'
                      ? 'Basic coverage for essential protection'
                      : planType === 'premium'
                        ? 'Complete coverage for peace of mind'
                        : 'Maximum coverage with all benefits'}
                  </Text>

                  <Pressable
                    style={[
                      styles.planButton,
                      planType === 'premium' && styles.planButtonActive,
                    ]}
                    onPress={() => handleUpgradePlan(planType as any)}
                  >
                    <Text
                      style={[
                        styles.planButtonText,
                        planType === 'premium' && { color: 'white' },
                      ]}
                    >
                      {planType === 'premium' ? 'Current Plan' : 'Switch to ' + planType}
                    </Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverageHeader: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  coverageTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  coverageStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  statLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  section: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  coverageDetailsBox: {
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    overflow: 'hidden',
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  detailContent: {
    marginLeft: 12,
    flex: 1,
  },
  detailLabel: {
    fontSize: 12,
    color: '#999',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginTop: 4,
  },
  detailValueLarge: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2196F3',
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#F0F0F0',
  },
  featuresBox: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  featureText: {
    fontSize: 13,
    color: '#333',
  },
  buttonGroup: {
    marginTop: 12,
    gap: 8,
  },
  primaryButton: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primaryButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  detailContainer: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  detailSection: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    fontSize: 12,
    color: '#999',
  },
  value: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  amountBox: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
  },
  amountItem: {
    marginBottom: 12,
  },
  amountLabel: {
    fontSize: 12,
    color: '#999',
  },
  amountValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 4,
  },
  descriptionBox: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
  },
  descriptionText: {
    fontSize: 13,
    color: '#333',
    marginTop: 8,
    lineHeight: 20,
  },
  evidenceList: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  evidenceText: {
    fontSize: 13,
    color: '#2196F3',
  },
  rejectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  rejectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#F44336',
  },
  rejectionText: {
    fontSize: 13,
    color: '#C62828',
    lineHeight: 18,
  },
  noteText: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  actionButtons: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  actionButton: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  modalContent: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  formGroup: {
    marginBottom: 20,
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pickerOption: {
    flex: 1,
    minWidth: 100,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  pickerOptionActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  input: {
    borderWidth: 1,
    borderColor: '#2196F3',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginTop: 8,
  },
  errorText: {
    color: '#F44336',
    fontSize: 12,
    marginBottom: 12,
  },
  submitButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 20,
  },
  submitButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  planCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  planCardHighlight: {
    borderColor: '#2196F3',
    borderWidth: 2,
  },
  planHeader: {
    marginBottom: 8,
  },
  planName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  planPrice: {
    fontSize: 14,
    color: '#2196F3',
    fontWeight: '600',
    marginTop: 4,
  },
  planDescription: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  planButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2196F3',
    alignItems: 'center',
  },
  planButtonActive: {
    backgroundColor: '#2196F3',
  },
  planButtonText: {
    color: '#2196F3',
    fontWeight: '600',
    fontSize: 13,
  },
});

export default InsuranceCoverageScreen;
