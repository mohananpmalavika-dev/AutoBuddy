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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { usePassengerInsurance, InsurancePlan } from '../hooks/usePassengerInsurance';

type DateLike = string | number | Date | null | undefined;

const formatDateSafely = (date: DateLike): string => {
  if (!date) return 'Unknown';
  const dateObj = new Date(date);
  return !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : 'Unknown';
};

interface PassengerInsuranceScreenProps {
  token: string | null;
  passengerId: string;
}

export const PassengerInsuranceScreen: React.FC<PassengerInsuranceScreenProps> = ({
  token,
  passengerId,
}) => {
  const {
    activePlans,
    availablePlans,
    claims,
    loading,
    fetchActivePlans,
    fetchAvailablePlans,
    fetchClaims,
    purchasePlan,
    cancelPlan,
    submitClaim,
  } = usePassengerInsurance(token, passengerId);

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'available' | 'claims'>('active');
  const [selectedPlan, setSelectedPlan] = useState<InsurancePlan | null>(null);
  const [showPlanDetail, setShowPlanDetail] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await fetchActivePlans();
    await fetchAvailablePlans();
    await fetchClaims();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handlePurchasePlan = async (planId: string) => {
    Alert.alert('Confirm Purchase', 'Are you sure you want to purchase this insurance plan?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Purchase',
        style: 'default',
        onPress: async () => {
          const success = await purchasePlan(planId);
          if (success) {
            Alert.alert('Success', 'Insurance plan purchased successfully');
            setShowPlanDetail(false);
            await loadData();
          } else {
            Alert.alert('Error', 'Failed to purchase plan');
          }
        },
      },
    ]);
  };

  const handleCancelPlan = async (planId: string) => {
    Alert.alert('Cancel Plan', 'Are you sure you want to cancel this insurance plan?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes, Cancel',
        style: 'destructive',
        onPress: async () => {
          const success = await cancelPlan(planId);
          if (success) {
            Alert.alert('Success', 'Insurance plan cancelled');
            setShowPlanDetail(false);
            await loadData();
          }
        },
      },
    ]);
  };

  const activeCoverageAmount = activePlans.reduce((sum, p) => sum + p.coverageAmount, 0);
  const pendingClaims = claims.filter((c) => c.status === 'submitted' || c.status === 'pending').length;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Coverage Summary */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryItem}>
          <MaterialIcons name="shield" size={24} color="#2196F3" />
          <Text style={styles.summaryLabel}>Active Plans</Text>
          <Text style={styles.summaryValue}>{activePlans.length}</Text>
        </View>
        <View style={styles.summaryItem}>
          <MaterialIcons name="security" size={24} color="#4CAF50" />
          <Text style={styles.summaryLabel}>Total Coverage</Text>
          <Text style={styles.summaryValue}>₹{((activeCoverageAmount ?? 0) as number).toFixed(0)}</Text>
        </View>
        <View style={styles.summaryItem}>
          <MaterialIcons name="assignment" size={24} color="#FF9800" />
          <Text style={styles.summaryLabel}>Pending Claims</Text>
          <Text style={styles.summaryValue}>{pendingClaims}</Text>
        </View>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TabButton
          label={`Active (${activePlans.length})`}
          active={activeTab === 'active'}
          onPress={() => setActiveTab('active')}
        />
        <TabButton
          label={`Available (${availablePlans.length})`}
          active={activeTab === 'available'}
          onPress={() => setActiveTab('available')}
        />
        <TabButton
          label={`Claims (${claims.length})`}
          active={activeTab === 'claims'}
          onPress={() => setActiveTab('claims')}
        />
      </View>

      {/* Active Plans */}
      {activeTab === 'active' && (
        <View style={styles.section}>
          {loading && activePlans.length === 0 ? (
            <ActivityIndicator size="large" color="#2196F3" style={{ marginVertical: 20 }} />
          ) : activePlans.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="shield" size={48} color="#ddd" />
              <Text style={styles.emptyText}>No active plans</Text>
              <Text style={styles.emptySubtext}>Browse available insurance plans to get protected</Text>
            </View>
          ) : (
            activePlans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isActive={true}
                onPress={() => {
                  setSelectedPlan(plan);
                  setShowPlanDetail(true);
                }}
              />
            ))
          )}
        </View>
      )}

      {/* Available Plans */}
      {activeTab === 'available' && (
        <View style={styles.section}>
          {loading && availablePlans.length === 0 ? (
            <ActivityIndicator size="large" color="#2196F3" style={{ marginVertical: 20 }} />
          ) : availablePlans.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="search-off" size={48} color="#ddd" />
              <Text style={styles.emptyText}>No plans available</Text>
            </View>
          ) : (
            availablePlans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                isActive={false}
                onPress={() => {
                  setSelectedPlan(plan);
                  setShowPlanDetail(true);
                }}
              />
            ))
          )}
        </View>
      )}

      {/* Claims */}
      {activeTab === 'claims' && (
        <View style={styles.section}>
          {claims.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="description" size={48} color="#ddd" />
              <Text style={styles.emptyText}>No claims yet</Text>
              <Pressable
                style={styles.newClaimButton}
                onPress={() => setShowClaimModal(true)}
              >
                <MaterialIcons name="add" size={18} color="#fff" />
                <Text style={styles.newClaimButtonText}>File a Claim</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Pressable
                style={styles.newClaimButton}
                onPress={() => setShowClaimModal(true)}
              >
                <MaterialIcons name="add" size={18} color="#fff" />
                <Text style={styles.newClaimButtonText}>File a New Claim</Text>
              </Pressable>

              {claims.map((claim) => (
                <ClaimCard key={claim.id} claim={claim} />
              ))}
            </>
          )}
        </View>
      )}

      {/* Plan Detail Modal */}
      <Modal visible={showPlanDetail} transparent animationType="slide">
        {selectedPlan && (
          <View style={styles.modal}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Pressable onPress={() => setShowPlanDetail(false)}>
                  <MaterialIcons name="close" size={24} color="#000" />
                </Pressable>
                <Text style={styles.modalTitle}>Plan Details</Text>
                <View style={{ width: 24 }} />
              </View>

              <ScrollView style={styles.modalBody}>
                <View style={styles.planDetailCard}>
                  <View style={styles.planBadge}>
                    <Text style={styles.planBadgeText}>
                      {(selectedPlan?.type ?? 'unknown').toUpperCase()}
                    </Text>
                  </View>

                  <Text style={styles.planName}>{selectedPlan.name}</Text>
                  <Text style={styles.planDescription}>
                    {selectedPlan.type === 'basic'
                      ? 'Basic coverage for essential protection'
                      : selectedPlan.type === 'standard'
                      ? 'Comprehensive coverage with good benefits'
                      : 'Premium coverage with maximum benefits'}
                  </Text>

                  <View style={styles.planPricing}>
                    <View style={styles.pricingItem}>
                      <Text style={styles.pricingLabel}>Monthly Premium</Text>
                      <Text style={styles.pricingValue}>
                        ₹{selectedPlan.monthlyPremium}
                      </Text>
                    </View>
                    <View style={styles.pricingItem}>
                      <Text style={styles.pricingLabel}>Coverage Amount</Text>
                      <Text style={[styles.pricingValue, { color: '#4CAF50' }]}>
                        ₹{selectedPlan.coverageAmount}
                      </Text>
                    </View>
                    <View style={styles.pricingItem}>
                      <Text style={styles.pricingLabel}>Deductible</Text>
                      <Text style={styles.pricingValue}>₹{selectedPlan.deductible}</Text>
                    </View>
                  </View>

                  <View style={styles.featuresList}>
                    <Text style={styles.featuresTitle}>Coverage Types</Text>
                    {selectedPlan.coverageTypes.map((type, index) => (
                      <View key={index} style={styles.featureItem}>
                        <MaterialIcons name="check-circle" size={16} color="#4CAF50" />
                        <Text style={styles.featureText}>{type}</Text>
                      </View>
                    ))}
                  </View>

                  {selectedPlan.features.length > 0 && (
                    <View style={styles.featuresList}>
                      <Text style={styles.featuresTitle}>Additional Features</Text>
                      {selectedPlan.features.map((feature, index) => (
                        <View key={index} style={styles.featureItem}>
                          <MaterialIcons name="star" size={14} color="#FF9800" />
                          <Text style={styles.featureText}>{feature}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={styles.validityInfo}>
                    <MaterialIcons name="calendar-today" size={16} color="#2196F3" />
                    <View style={styles.validityText}>
                      <Text style={styles.validityLabel}>Valid Until</Text>
                      <Text style={styles.validityValue}>
                        {formatDateSafely(selectedPlan?.endDate)}
                      </Text>
                    </View>
                  </View>
                </View>
              </ScrollView>

              <View style={styles.modalFooter}>
                {selectedPlan.status === 'active' ? (
                  <Pressable
                    style={[styles.actionButton, styles.cancelButton]}
                    onPress={() => handleCancelPlan(selectedPlan.id)}
                  >
                    <Text style={styles.cancelButtonText}>Cancel Plan</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={[styles.actionButton, styles.purchaseButton]}
                    onPress={() => handlePurchasePlan(selectedPlan.id)}
                  >
                    <MaterialIcons name="shopping-cart" size={18} color="#fff" />
                    <Text style={styles.purchaseButtonText}>Purchase Plan</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        )}
      </Modal>
    </ScrollView>
  );
};

const TabButton: React.FC<{
  label: string;
  active: boolean;
  onPress: () => void;
}> = ({ label, active, onPress }) => {
  return (
    <Pressable
      style={[styles.tabButton, active && styles.tabButtonActive]}
      onPress={onPress}
    >
      <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
};

const PlanCard: React.FC<{
  plan: InsurancePlan;
  isActive: boolean;
  onPress: () => void;
}> = ({ plan, isActive, onPress }) => {
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'basic':
        return '#2196F3';
      case 'standard':
        return '#FF9800';
      case 'premium':
        return '#F44336';
      default:
        return '#999';
    }
  };

  return (
    <Pressable style={styles.planCard} onPress={onPress}>
      <View style={styles.planCardHeader}>
        <View>
          <Text style={styles.planCardName}>{plan.name}</Text>
          <Text style={[styles.planCardType, { color: getTypeColor(plan.type) }]}>
            {(plan?.type ?? 'unknown').toUpperCase()}
          </Text>
        </View>
        {isActive && (
          <View style={styles.activeBadge}>
            <MaterialIcons name="check-circle" size={20} color="#4CAF50" />
          </View>
        )}
      </View>

      <View style={styles.planCardDetails}>
        <View style={styles.planCardDetail}>
          <Text style={styles.planCardDetailLabel}>Premium</Text>
          <Text style={styles.planCardDetailValue}>₹{plan.monthlyPremium}/mo</Text>
        </View>
        <View style={styles.planCardDetail}>
          <Text style={styles.planCardDetailLabel}>Coverage</Text>
          <Text style={[styles.planCardDetailValue, { color: '#4CAF50' }]}>
            ₹{plan.coverageAmount}
          </Text>
        </View>
      </View>

      {isActive && (
        <Text style={styles.planCardValidity}>
          Valid until {formatDateSafely(plan.endDate)}
        </Text>
      )}
    </Pressable>
  );
};

const ClaimCard: React.FC<{ claim: any }> = ({ claim }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'submitted':
      case 'pending':
        return '#FF9800';
      case 'approved':
      case 'paid':
        return '#4CAF50';
      case 'rejected':
        return '#F44336';
      default:
        return '#999';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
      case 'paid':
        return 'check-circle';
      case 'rejected':
        return 'cancel';
      default:
        return 'schedule';
    }
  };

  return (
    <View style={styles.claimCard}>
      <View style={styles.claimCardHeader}>
        <View>
          <Text style={styles.claimCardType}>{claim.claimType}</Text>
          <Text style={styles.claimCardAmount}>₹{claim.amount.toFixed(0)}</Text>
        </View>
        <View style={[styles.claimStatusBadge, { backgroundColor: getStatusColor(claim.status) + '20' }]}>
          <MaterialIcons
            name={getStatusIcon(claim.status) as any}
            size={18}
            color={getStatusColor(claim.status)}
          />
          <Text style={[styles.claimStatusText, { color: getStatusColor(claim.status) }]}>
            {claim.status.toUpperCase()}
          </Text>
        </View>
      </View>
      <Text style={styles.claimCardDescription} numberOfLines={2}>
        {claim.description}
      </Text>
      <Text style={styles.claimCardDate}>
        Submitted: {formatDateSafely(claim.submittedDate)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  summaryCard: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  summaryItem: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 10,
    color: '#666',
    marginTop: 6,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginTop: 2,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    alignItems: 'center',
  },
  tabButtonActive: {
    borderBottomColor: '#2196F3',
  },
  tabButtonText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: '#2196F3',
  },
  section: {
    marginHorizontal: 16,
    marginVertical: 12,
  },
  planCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  planCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  planCardName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
  planCardType: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  activeBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planCardDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#f0f0f0',
    marginBottom: 8,
  },
  planCardDetail: {
    flex: 1,
  },
  planCardDetailLabel: {
    fontSize: 10,
    color: '#666',
  },
  planCardDetailValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
    marginTop: 2,
  },
  planCardValidity: {
    fontSize: 10,
    color: '#999',
  },
  claimCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  claimCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  claimCardType: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  claimCardAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2196F3',
    marginTop: 2,
  },
  claimStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  claimStatusText: {
    fontSize: 9,
    fontWeight: '700',
  },
  claimCardDescription: {
    fontSize: 11,
    color: '#666',
    lineHeight: 15,
    marginBottom: 6,
  },
  claimCardDate: {
    fontSize: 9,
    color: '#999',
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
  emptySubtext: {
    fontSize: 11,
    color: '#bbb',
    marginTop: 6,
  },
  newClaimButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#2196F3',
    borderRadius: 8,
    marginBottom: 12,
  },
  newClaimButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
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
  modalFooter: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  planDetailCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
  },
  planBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#2196F3',
    borderRadius: 4,
    marginBottom: 8,
  },
  planBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
  planName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  planDescription: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
    lineHeight: 16,
  },
  planPricing: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  pricingItem: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 6,
  },
  pricingLabel: {
    fontSize: 10,
    color: '#666',
  },
  pricingValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
    marginTop: 2,
  },
  featuresList: {
    marginBottom: 12,
  },
  featuresTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  featureText: {
    fontSize: 11,
    color: '#666',
  },
  validityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  validityText: {
    flex: 1,
  },
  validityLabel: {
    fontSize: 10,
    color: '#999',
  },
  validityValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
    marginTop: 2,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 6,
  },
  purchaseButton: {
    backgroundColor: '#2196F3',
  },
  purchaseButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  cancelButton: {
    backgroundColor: '#FFEBEE',
    borderWidth: 1,
    borderColor: '#F44336',
  },
  cancelButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F44336',
  },
});

export default PassengerInsuranceScreen;
