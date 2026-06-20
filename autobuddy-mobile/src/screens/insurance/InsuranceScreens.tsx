import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  FlatList,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useDriverInsurance, InsuranceClaim } from '../hooks/useDriverInsurance';

interface InsuranceScreensProps {
  userId: string;
  authToken: string;
}

export function InsuranceScreens({ userId, authToken }: InsuranceScreensProps) {
  const {
    activePlan,
    policyTerms,
    claims,
    tripsInsured,
    pendingClaimCount,
    approvedClaimCount,
    totalClaimsPaid,
    isLoading,
    fetchActivePlan,
    fetchClaims,
    fetchPolicyTerms,
    calculateDaysUntilExpiry,
    formatCoverageLimit,
  } = useDriverInsurance(userId, authToken);

  const [activeTab, setActiveTab] = useState<'coverage' | 'claims' | 'history'>('coverage');

  if (isLoading && !activePlan) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading insurance information...</Text>
      </View>
    );
  }

  if (!activePlan) {
    return (
      <View style={styles.noInsuranceContainer}>
        <MaterialIcons name="warning" size={64} color="#FFA500" />
        <Text style={styles.noInsuranceTitle}>No Active Insurance</Text>
        <Text style={styles.noInsuranceText}>
          You don't have an active insurance plan. Purchase one to get coverage.
        </Text>
        <Pressable style={styles.purchaseButton}>
          <MaterialIcons name="shopping-cart" size={20} color="#fff" />
          <Text style={styles.purchaseButtonText}>Browse Plans</Text>
        </Pressable>
      </View>
    );
  }

  const daysUntilExpiry = calculateDaysUntilExpiry(activePlan.active_until);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={fetchActivePlan} />}
    >
      {activeTab === 'coverage' && (
        <>
          {/* Active Plan Card */}
          <View style={styles.planCard}>
            <View style={styles.planHeader}>
              <Text style={styles.planName}>{activePlan.plan_name} Plan</Text>
              <View style={[styles.statusBadge, { backgroundColor: activePlan.status === 'active' ? '#4CAF50' : '#999' }]}>
                <Text style={styles.statusBadgeText}>{activePlan.status.toUpperCase()}</Text>
              </View>
            </View>

            <Text style={styles.validityText}>
              Valid until: {new Date(activePlan.active_until).toLocaleDateString('en-IN')} ({daysUntilExpiry} days)
            </Text>

            <View style={styles.premiumRow}>
              <Text style={styles.premiumLabel}>Monthly Premium</Text>
              <Text style={styles.premiumAmount}>₹{activePlan.monthly_premium.toLocaleString('en-IN')}</Text>
            </View>

            <View style={styles.deductibleRow}>
              <Text style={styles.deductibleLabel}>Trip Deductible</Text>
              <Text style={styles.deductibleAmount}>₹{activePlan.trip_deductible.toLocaleString('en-IN')}</Text>
            </View>
          </View>

          {/* Coverage Details */}
          <View style={styles.coverageCard}>
            <Text style={styles.cardTitle}>Coverage Details</Text>

            <View style={styles.coverageGrid}>
              <CoverageTypeBox
                icon="directions-car"
                type="Accident"
                limit={activePlan.coverage_limits.accident}
                covered={activePlan.accident_coverage}
              />
              <CoverageTypeBox
                icon="verified-user"
                type="Liability"
                limit={activePlan.coverage_limits.liability}
                covered={activePlan.liability_coverage}
              />
              <CoverageTypeBox
                icon="local-hospital"
                type="Injury"
                limit={activePlan.coverage_limits.injury}
                covered={activePlan.injury_coverage}
              />
              <CoverageTypeBox
                icon="security"
                type="Theft"
                limit={activePlan.coverage_limits.theft}
                covered={activePlan.theft_coverage}
              />
            </View>

            <View style={styles.maxCoverageBox}>
              <MaterialIcons name="info" size={20} color="#2196F3" />
              <View style={styles.maxCoverageText}>
                <Text style={styles.maxCoverageLabel}>Maximum per Claim</Text>
                <Text style={styles.maxCoverageAmount}>
                  ₹{activePlan.trip_limit.toLocaleString('en-IN')}
                </Text>
              </View>
            </View>
          </View>

          {/* Quick Actions */}
          <View style={styles.actionButtons}>
            <Pressable
              style={styles.fileClaimButton}
              onPress={() => setActiveTab('claims')}
            >
              <MaterialIcons name="edit" size={20} color="#fff" />
              <Text style={styles.fileClaimButtonText}>File a Claim</Text>
            </Pressable>

            <Pressable
              style={styles.viewTermsButton}
              onPress={() => fetchPolicyTerms(activePlan.plan_name.toLowerCase())}
            >
              <MaterialIcons name="description" size={20} color="#2196F3" />
              <Text style={styles.viewTermsButtonText}>View Terms</Text>
            </Pressable>
          </View>

          {/* Claims Overview */}
          <View style={styles.claimsOverview}>
            <Text style={styles.cardTitle}>Claims Overview</Text>

            <View style={styles.statsGrid}>
              <StatBox label="Total Claims" value={claims.length} color="#2196F3" />
              <StatBox label="Approved" value={approvedClaimCount} color="#4CAF50" />
              <StatBox label="Pending" value={pendingClaimCount} color="#FFA500" />
            </View>

            {approvedClaimCount > 0 && (
              <View style={styles.totalPaidBox}>
                <Text style={styles.totalPaidLabel}>Total Paid</Text>
                <Text style={styles.totalPaidAmount}>₹{totalClaimsPaid.toLocaleString('en-IN')}</Text>
              </View>
            )}

            {claims.length > 0 && (
              <Pressable
                style={styles.viewClaimsButton}
                onPress={() => setActiveTab('claims')}
              >
                <Text style={styles.viewClaimsButtonText}>View All Claims</Text>
                <MaterialIcons name="chevron-right" size={18} color="#2196F3" />
              </Pressable>
            )}
          </View>
        </>
      )}

      {activeTab === 'claims' && <ClaimsTab claims={claims} userId={userId} authToken={authToken} />}

      {activeTab === 'history' && <HistoryTab tripsInsured={tripsInsured} />}

      {/* Tab Navigation */}
      <View style={styles.tabNav}>
        <Pressable
          style={[styles.tab, activeTab === 'coverage' && styles.tabActive]}
          onPress={() => setActiveTab('coverage')}
        >
          <Text style={[styles.tabLabel, activeTab === 'coverage' && styles.tabLabelActive]}>Coverage</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'claims' && styles.tabActive]}
          onPress={() => setActiveTab('claims')}
        >
          <Text style={[styles.tabLabel, activeTab === 'claims' && styles.tabLabelActive]}>Claims</Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabLabel, activeTab === 'history' && styles.tabLabelActive]}>History</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

interface CoverageTypeBoxProps {
  icon: string;
  type: string;
  limit: number;
  covered: boolean;
}

function CoverageTypeBox({ icon, type, limit, covered }: CoverageTypeBoxProps) {
  return (
    <View style={styles.coverageBox}>
      <View style={[styles.coverageIcon, !covered && styles.coverageIconDisabled]}>
        <MaterialIcons name={icon as any} size={24} color={covered ? '#2196F3' : '#999'} />
      </View>
      <Text style={styles.coverageType}>{type}</Text>
      <Text style={styles.coverageLimit}>₹{(limit / 100000).toFixed(1)}L</Text>
      <Text style={[styles.coverageStatus, !covered && styles.coverageStatusDisabled]}>
        {covered ? '✓ Covered' : '✗ Not Covered'}
      </Text>
    </View>
  );
}

interface StatBoxProps {
  label: string;
  value: number;
  color: string;
}

function StatBox({ label, value, color }: StatBoxProps) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

interface ClaimsTabProps {
  claims: InsuranceClaim[];
  userId: string;
  authToken: string;
}

function ClaimsTab({ claims, userId, authToken }: ClaimsTabProps) {
  const [showFileClaim, setShowFileClaim] = useState(false);

  return (
    <View>
      <View style={styles.claimsHeader}>
        <Text style={styles.claimsHeaderTitle}>Insurance Claims</Text>
        <Pressable
          style={styles.newClaimButton}
          onPress={() => setShowFileClaim(true)}
        >
          <MaterialIcons name="add" size={20} color="#fff" />
          <Text style={styles.newClaimButtonText}>New Claim</Text>
        </Pressable>
      </View>

      {claims.length === 0 ? (
        <View style={styles.emptyCard}>
          <MaterialIcons name="assignment-ind" size={48} color="#ccc" />
          <Text style={styles.emptyTitle}>No Claims Yet</Text>
          <Text style={styles.emptyText}>File a claim for an incident during your trip</Text>
        </View>
      ) : (
        <FlatList
          data={claims}
          keyExtractor={(item) => item.claim_id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <ClaimCard claim={item} />
          )}
          style={styles.claimsList}
        />
      )}

      <FileClaimModal
        visible={showFileClaim}
        onClose={() => setShowFileClaim(false)}
        userId={userId}
        authToken={authToken}
      />
    </View>
  );
}

interface ClaimCardProps {
  claim: InsuranceClaim;
}

function ClaimCard({ claim }: ClaimCardProps) {
  const statusColor =
    claim.claim_status === 'approved'
      ? '#4CAF50'
      : claim.claim_status === 'rejected'
      ? '#F44336'
      : '#FFA500';

  const statusIcon =
    claim.claim_status === 'approved'
      ? 'check-circle'
      : claim.claim_status === 'rejected'
      ? 'cancel'
      : 'hourglass-empty';

  return (
    <View style={styles.claimCard}>
      <View style={styles.claimCardHeader}>
        <MaterialIcons name={statusIcon as any} size={24} color={statusColor} />
        <View style={styles.claimCardInfo}>
          <Text style={styles.claimType}>{claim.claim_type.toUpperCase()}</Text>
          <Text style={styles.claimDate}>{new Date(claim.created_at).toLocaleDateString('en-IN')}</Text>
        </View>
        <View style={styles.claimAmount}>
          <Text style={styles.claimAmountLabel}>Claimed</Text>
          <Text style={styles.claimAmountValue}>₹{claim.claim_amount.toLocaleString('en-IN')}</Text>
        </View>
      </View>

      <View style={styles.claimStatus}>
        <Text style={[styles.claimStatusBadge, { color: statusColor }]}>
          {claim.claim_status.toUpperCase()}
        </Text>
        {claim.approved_amount && (
          <Text style={styles.approvedAmount}>Approved: ₹{claim.approved_amount.toLocaleString('en-IN')}</Text>
        )}
      </View>

      {claim.decision_message && (
        <View style={styles.decisionMessage}>
          <Text style={styles.decisionMessageText}>{claim.decision_message}</Text>
        </View>
      )}
    </View>
  );
}

interface HistoryTabProps {
  tripsInsured: any[];
}

function HistoryTab({ tripsInsured }: HistoryTabProps) {
  if (tripsInsured.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <MaterialIcons name="history" size={48} color="#ccc" />
        <Text style={styles.emptyTitle}>No Trips Insured</Text>
        <Text style={styles.emptyText}>Your insured trips will appear here</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={tripsInsured}
      keyExtractor={(item) => item.trip_id}
      scrollEnabled={false}
      renderItem={({ item }) => (
        <View style={styles.tripCard}>
          <View style={styles.tripCardHeader}>
            <MaterialIcons name="directions-car" size={24} color="#2196F3" />
            <View style={styles.tripInfo}>
              <Text style={styles.tripType}>{item.ride_type.toUpperCase()}</Text>
              <Text style={styles.tripDate}>{new Date(item.start_time).toLocaleDateString('en-IN')}</Text>
            </View>
          </View>
          <View style={styles.tripPremium}>
            <Text style={styles.tripPremiumLabel}>Insurance: </Text>
            <Text style={styles.tripPremiumAmount}>₹{item.insurance_premium.toLocaleString('en-IN')}</Text>
          </View>
          {item.claim_filed && (
            <View style={styles.claimFiledBadge}>
              <MaterialIcons name="check" size={16} color="#4CAF50" />
              <Text style={styles.claimFiledText}>Claim Filed</Text>
            </View>
          )}
        </View>
      )}
      style={styles.tripsList}
    />
  );
}

interface FileClaimModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
  authToken: string;
}

function FileClaimModal({ visible, onClose, userId, authToken }: FileClaimModalProps) {
  const [claimType, setClaimType] = useState('');
  const [description, setDescription] = useState('');
  const [incidentLocation, setIncidentLocation] = useState('');
  const [claimAmount, setClaimAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!claimType || !description || !incidentLocation || !claimAmount) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      // TODO: Call API to file claim
      Alert.alert('Success', 'Claim submitted successfully');
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Pressable onPress={onClose}>
              <MaterialIcons name="close" size={24} color="#000" />
            </Pressable>
            <Text style={styles.modalTitle}>File a Claim</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalBody}>
            <Text style={styles.fieldLabel}>Claim Type *</Text>
            <View style={styles.claimTypeButtons}>
              {['accident', 'liability', 'injury', 'theft'].map((type) => (
                <Pressable
                  key={type}
                  style={[
                    styles.claimTypeButton,
                    claimType === type && styles.claimTypeButtonSelected,
                  ]}
                  onPress={() => setClaimType(type)}
                >
                  <Text style={[
                    styles.claimTypeButtonText,
                    claimType === type && styles.claimTypeButtonTextSelected,
                  ]}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Description *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Describe what happened"
              multiline
              numberOfLines={4}
              value={description}
              onChangeText={setDescription}
              maxLength={1000}
            />
            <Text style={styles.charCount}>{description.length}/1000</Text>

            <Text style={styles.fieldLabel}>Incident Location *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Where did the incident occur?"
              value={incidentLocation}
              onChangeText={setIncidentLocation}
            />

            <Text style={styles.fieldLabel}>Claim Amount (₹) *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Amount to claim"
              keyboardType="decimal-pad"
              value={claimAmount}
              onChangeText={setClaimAmount}
            />

            <Text style={styles.supportingDocsLabel}>Supporting Documents</Text>
            <Pressable style={styles.uploadButton}>
              <MaterialIcons name="upload-file" size={20} color="#2196F3" />
              <Text style={styles.uploadButtonText}>Upload Files (Optional)</Text>
            </Pressable>
          </ScrollView>

          <View style={styles.modalFooter}>
            <Pressable
              style={styles.cancelButton}
              onPress={onClose}
              disabled={isSubmitting}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>

            <Pressable
              style={[styles.submitButton, isSubmitting && styles.submitButtonLoading]}
              onPress={handleSubmit}
              disabled={isSubmitting || !claimType || !description}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="check" size={18} color="#fff" />
                  <Text style={styles.submitButtonText}>Submit Claim</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingBottom: 80,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  noInsuranceContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  noInsuranceTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
    marginTop: 12,
  },
  noInsuranceText: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
    textAlign: 'center',
  },
  purchaseButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  purchaseButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  planCard: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 12,
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  planName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  validityText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
  },
  premiumRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  premiumLabel: {
    fontSize: 13,
    color: '#666',
  },
  premiumAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2196F3',
  },
  deductibleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  deductibleLabel: {
    fontSize: 13,
    color: '#666',
  },
  deductibleAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFA500',
  },
  coverageCard: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  coverageGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  coverageBox: {
    width: '48%',
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  coverageIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  coverageIconDisabled: {
    backgroundColor: '#f0f0f0',
  },
  coverageType: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
    marginBottom: 4,
  },
  coverageLimit: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2196F3',
    marginBottom: 4,
  },
  coverageStatus: {
    fontSize: 10,
    color: '#4CAF50',
  },
  coverageStatusDisabled: {
    color: '#999',
  },
  maxCoverageBox: {
    flexDirection: 'row',
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  maxCoverageText: {
    marginLeft: 12,
    flex: 1,
  },
  maxCoverageLabel: {
    fontSize: 12,
    color: '#666',
  },
  maxCoverageAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2196F3',
    marginTop: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 12,
    marginVertical: 12,
  },
  fileClaimButton: {
    flex: 1,
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileClaimButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
  },
  viewTermsButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2196F3',
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewTermsButtonText: {
    color: '#2196F3',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
  },
  claimsOverview: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
  },
  totalPaidBox: {
    backgroundColor: '#E8F5E9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  totalPaidLabel: {
    fontSize: 12,
    color: '#666',
  },
  totalPaidAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4CAF50',
    marginTop: 4,
  },
  viewClaimsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  viewClaimsButtonText: {
    fontSize: 13,
    color: '#2196F3',
    fontWeight: '600',
  },
  tabNav: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    marginTop: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#2196F3',
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
  },
  tabLabelActive: {
    color: '#2196F3',
  },
  claimsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  claimsHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  newClaimButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  newClaimButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  emptyCard: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 16,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginTop: 12,
  },
  emptyText: {
    fontSize: 13,
    color: '#999',
    marginTop: 6,
  },
  claimsList: {
    paddingHorizontal: 12,
  },
  claimCard: {
    backgroundColor: '#fff',
    marginVertical: 6,
    borderRadius: 8,
    padding: 12,
  },
  claimCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  claimCardInfo: {
    flex: 1,
    marginLeft: 12,
  },
  claimType: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  claimDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  claimAmount: {
    alignItems: 'flex-end',
  },
  claimAmountLabel: {
    fontSize: 11,
    color: '#999',
  },
  claimAmountValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginTop: 2,
  },
  claimStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  claimStatusBadge: {
    fontSize: 11,
    fontWeight: '700',
  },
  approvedAmount: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
    marginLeft: 12,
  },
  decisionMessage: {
    marginTop: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 6,
    padding: 8,
  },
  decisionMessageText: {
    fontSize: 12,
    color: '#666',
    lineHeight: 18,
  },
  tripsList: {
    paddingHorizontal: 12,
  },
  tripCard: {
    backgroundColor: '#fff',
    marginVertical: 6,
    borderRadius: 8,
    padding: 12,
  },
  tripCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tripInfo: {
    flex: 1,
    marginLeft: 12,
  },
  tripType: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  tripDate: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  tripPremium: {
    flexDirection: 'row',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  tripPremiumLabel: {
    fontSize: 12,
    color: '#666',
  },
  tripPremiumAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2196F3',
  },
  claimFiledBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#E8F5E9',
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  claimFiledText: {
    fontSize: 11,
    color: '#4CAF50',
    fontWeight: '600',
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
    marginTop: 12,
  },
  claimTypeButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  claimTypeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  claimTypeButtonSelected: {
    backgroundColor: '#E3F2FD',
    borderColor: '#2196F3',
  },
  claimTypeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  claimTypeButtonTextSelected: {
    color: '#2196F3',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    padding: 10,
    fontSize: 13,
    marginBottom: 8,
  },
  charCount: {
    fontSize: 11,
    color: '#999',
    textAlign: 'right',
    marginBottom: 12,
  },
  supportingDocsLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    marginTop: 12,
  },
  uploadButton: {
    borderWidth: 1,
    borderColor: '#2196F3',
    borderRadius: 6,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButtonText: {
    fontSize: 13,
    color: '#2196F3',
    fontWeight: '600',
    marginLeft: 8,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  submitButton: {
    flex: 1,
    backgroundColor: '#2196F3',
    borderRadius: 6,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonLoading: {
    opacity: 0.7,
  },
  submitButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 6,
  },
});

export default InsuranceScreens;
