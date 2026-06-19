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
  Share,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useReferralSystem } from '../hooks/useReferralSystem';

interface ReferralSystemScreenProps {
  token: string | null;
  userId: string;
}

export const ReferralSystemScreen: React.FC<ReferralSystemScreenProps> = ({
  token,
  userId,
}) => {
  const {
    codes,
    rewards,
    stats,
    loading,
    error,
    fetchReferralCodes,
    createReferralCode,
    deactivateCode,
    reactivateCode,
    fetchRewards,
    getReferralStats,
    shareReferralCode,
    claimReward,
    applyReferralCode,
    getReferralHistory,
    generateShareLink,
  } = useReferralSystem(token, userId);

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'codes' | 'rewards' | 'stats'>('codes');
  const [codeDetailsModal, setCodeDetailsModal] = useState(false);
  const [selectedCode, setSelectedCode] = useState<any>(null);
  const [createCodeModal, setCreateCodeModal] = useState(false);
  const [newCode, setNewCode] = useState({
    displayName: '',
    discountPercentage: 10,
    maxUses: 100,
  });
  const [applyCodeModal, setApplyCodeModal] = useState(false);
  const [codeToApply, setCodeToApply] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await fetchReferralCodes(userId);
    await fetchRewards(userId);
    await getReferralStats(userId);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleCreateCode = async () => {
    if (!newCode.displayName) {
      Alert.alert('Error', 'Please enter a display name');
      return;
    }
    const success = await createReferralCode(
      newCode.displayName,
      newCode.discountPercentage,
      newCode.maxUses
    );
    if (success) {
      Alert.alert('Success', 'Referral code created');
      setCreateCodeModal(false);
      setNewCode({ displayName: '', discountPercentage: 10, maxUses: 100 });
      await loadData();
    }
  };

  const handleShareCode = async (code: string, platform: string) => {
    const link = generateShareLink(code);
    try {
      if (platform === 'link') {
        await Share.share({
          message: `Join me and get ${code} discount! ${link}`,
          url: link,
        });
      } else {
        const success = await shareReferralCode(
          code,
          platform as 'whatsapp' | 'sms' | 'email' | 'link'
        );
        if (success) {
          Alert.alert('Success', `Shared via ${platform}`);
        }
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to share code');
    }
  };

  const handleToggleCode = async (codeId: string, isActive: boolean) => {
    const success = isActive
      ? await deactivateCode(codeId)
      : await reactivateCode(codeId);
    if (success) {
      Alert.alert('Success', `Code ${isActive ? 'deactivated' : 'reactivated'}`);
      await loadData();
    }
  };

  const handleClaimReward = async (rewardId: string) => {
    const success = await claimReward(rewardId);
    if (success) {
      Alert.alert('Success', 'Reward claimed');
      await loadData();
    }
  };

  const handleApplyCode = async () => {
    if (!codeToApply) {
      Alert.alert('Error', 'Please enter a code');
      return;
    }
    const success = await applyReferralCode(codeToApply);
    if (success) {
      Alert.alert('Success', 'Code applied successfully');
      setApplyCodeModal(false);
      setCodeToApply('');
      await loadData();
    }
  };

  const referralHistory = getReferralHistory();

  if (loading && !codes.length) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Stats Overview */}
      {stats && (
        <View style={styles.statsContainer}>
          <StatCard
            title="Total Earned"
            value={`$${stats.totalEarned.toFixed(2)}`}
            icon="trending-up"
            color="#4CAF50"
          />
          <StatCard
            title="Total Referrals"
            value={`${stats.totalReferrals}`}
            icon="people"
            color="#2196F3"
          />
          <StatCard
            title="Active Referrals"
            value={`${stats.activeReferrals}`}
            icon="person-check"
            color="#FF9800"
          />
          <StatCard
            title="Pending Rewards"
            value={`${stats.pendingRewards}`}
            icon="schedule"
            color="#9C27B0"
          />
        </View>
      )}

      {/* Top Referral */}
      {stats?.topReferral && (
        <View style={styles.topReferralCard}>
          <MaterialIcons name="star" size={24} color="#FFD700" />
          <View style={styles.topReferralInfo}>
            <Text style={styles.topReferralLabel}>Top Referral Code</Text>
            <Text style={styles.topReferralCode}>{stats.topReferral.code}</Text>
            <Text style={styles.topReferralStats}>
              {stats.topReferral.uses} uses • ${stats.topReferral.earnings.toFixed(2)}
            </Text>
          </View>
        </View>
      )}

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TabButton
          label="My Codes"
          active={activeTab === 'codes'}
          onPress={() => setActiveTab('codes')}
        />
        <TabButton
          label="Rewards"
          active={activeTab === 'rewards'}
          onPress={() => setActiveTab('rewards')}
        />
        <TabButton
          label="Statistics"
          active={activeTab === 'stats'}
          onPress={() => setActiveTab('stats')}
        />
      </View>

      {/* Codes Tab */}
      {activeTab === 'codes' && (
        <View style={styles.section}>
          <View style={styles.headerRow}>
            <Text style={styles.sectionTitle}>Referral Codes</Text>
            <Pressable
              style={styles.actionButton}
              onPress={() => setCreateCodeModal(true)}
            >
              <MaterialIcons name="add" size={20} color="#2196F3" />
            </Pressable>
          </View>

          <Pressable
            style={styles.applyCodeButton}
            onPress={() => setApplyCodeModal(true)}
          >
            <MaterialIcons name="input" size={18} color="#2196F3" />
            <Text style={styles.applyCodeButtonText}>Apply a Code</Text>
          </Pressable>

          {codes.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="card-giftcard" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No referral codes yet</Text>
            </View>
          ) : (
            codes.map((code) => (
              <Pressable
                key={code.id}
                style={styles.codeCard}
                onPress={() => {
                  setSelectedCode(code);
                  setCodeDetailsModal(true);
                }}
              >
                <View style={styles.codeHeader}>
                  <View style={styles.codeLeft}>
                    <Text style={styles.codeValue}>{code.code}</Text>
                    <Text style={styles.codeName}>{code.displayName}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusBadge,
                      {
                        backgroundColor:
                          code.status === 'active'
                            ? '#E8F5E9'
                            : code.status === 'expired'
                              ? '#FFEBEE'
                              : '#FFF3E0',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        {
                          color:
                            code.status === 'active'
                              ? '#4CAF50'
                              : code.status === 'expired'
                                ? '#F44336'
                                : '#FF9800',
                        },
                      ]}
                    >
                      {code.status.charAt(0).toUpperCase() + code.status.slice(1)}
                    </Text>
                  </View>
                </View>

                <View style={styles.codeStats}>
                  <View style={styles.codeStat}>
                    <Text style={styles.codeStatLabel}>Discount</Text>
                    <Text style={styles.codeStatValue}>{code.discountPercentage}%</Text>
                  </View>
                  <View style={styles.codeStat}>
                    <Text style={styles.codeStatLabel}>Uses</Text>
                    <Text style={styles.codeStatValue}>
                      {code.currentUses}/{code.maxUses}
                    </Text>
                  </View>
                  <View style={styles.codeStat}>
                    <Text style={styles.codeStatLabel}>Earned</Text>
                    <Text style={styles.codeStatValue}>${code.rewardAmount.toFixed(2)}</Text>
                  </View>
                </View>

                <View style={styles.codeActions}>
                  <Pressable
                    style={styles.codeActionBtn}
                    onPress={() =>
                      handleShareCode(code.code, 'whatsapp')
                    }
                  >
                    <MaterialIcons name="share" size={16} color="#2196F3" />
                    <Text style={styles.codeActionText}>Share</Text>
                  </Pressable>
                  <Pressable
                    style={styles.codeActionBtn}
                    onPress={() =>
                      handleToggleCode(code.id, code.status === 'active')
                    }
                  >
                    <MaterialIcons
                      name={code.status === 'active' ? 'close' : 'check'}
                      size={16}
                      color="#F44336"
                    />
                    <Text style={styles.codeActionText}>
                      {code.status === 'active' ? 'Deactivate' : 'Reactivate'}
                    </Text>
                  </Pressable>
                </View>
              </Pressable>
            ))
          )}
        </View>
      )}

      {/* Rewards Tab */}
      {activeTab === 'rewards' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Your Rewards</Text>

          {rewards.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="card-giftcard" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No rewards yet</Text>
            </View>
          ) : (
            <>
              {/* Pending Rewards */}
              <Text style={styles.subsectionTitle}>Pending Rewards</Text>
              {rewards.filter((r) => r.status === 'pending').length === 0 ? (
                <Text style={styles.noItemsText}>No pending rewards</Text>
              ) : (
                rewards
                  .filter((r) => r.status === 'pending')
                  .map((reward) => (
                    <View key={reward.id} style={styles.rewardCard}>
                      <View style={styles.rewardLeft}>
                        <View
                          style={[
                            styles.rewardIcon,
                            { backgroundColor: '#FFF3E0' },
                          ]}
                        >
                          <MaterialIcons
                            name="schedule"
                            size={20}
                            color="#FF9800"
                          />
                        </View>
                        <View style={styles.rewardInfo}>
                          <Text style={styles.rewardType}>
                            {reward.type.replace(/_/g, ' ').toUpperCase()}
                          </Text>
                          <Text style={styles.rewardDetail}>
                            {reward.referredUser || 'Reward pending'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.rewardRight}>
                        <Text style={styles.rewardAmount}>
                          +${reward.amount.toFixed(2)}
                        </Text>
                        <Pressable
                          style={styles.claimButton}
                          onPress={() =>
                            handleClaimReward(reward.id)
                          }
                        >
                          <Text style={styles.claimButtonText}>Claim</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))
              )}

              {/* Credited Rewards */}
              <Text style={styles.subsectionTitle}>Credited Rewards</Text>
              {referralHistory.filter((r) => r.status === 'credited').length === 0 ? (
                <Text style={styles.noItemsText}>No credited rewards</Text>
              ) : (
                referralHistory
                  .filter((r) => r.status === 'credited')
                  .map((reward) => (
                    <View key={reward.id} style={styles.rewardCard}>
                      <View style={styles.rewardLeft}>
                        <View
                          style={[
                            styles.rewardIcon,
                            { backgroundColor: '#E8F5E9' },
                          ]}
                        >
                          <MaterialIcons
                            name="check-circle"
                            size={20}
                            color="#4CAF50"
                          />
                        </View>
                        <View style={styles.rewardInfo}>
                          <Text style={styles.rewardType}>
                            {reward.type.replace(/_/g, ' ').toUpperCase()}
                          </Text>
                          <Text style={styles.rewardDetail}>
                            Credited{' '}
                            {new Date(reward.creditedAt!).toLocaleDateString()}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.rewardAmountGreen}>
                        +${reward.amount.toFixed(2)}
                      </Text>
                    </View>
                  ))
              )}
            </>
          )}
        </View>
      )}

      {/* Statistics Tab */}
      {activeTab === 'stats' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Statistics</Text>

          {stats && (
            <>
              <View style={styles.statGridContainer}>
                <View style={styles.statGridItem}>
                  <Text style={styles.statGridLabel}>Active Codes</Text>
                  <Text style={styles.statGridValue}>
                    {codes.filter((c) => c.status === 'active').length}
                  </Text>
                </View>
                <View style={styles.statGridItem}>
                  <Text style={styles.statGridLabel}>Total Uses</Text>
                  <Text style={styles.statGridValue}>
                    {codes.reduce((sum, c) => sum + c.currentUses, 0)}
                  </Text>
                </View>
                <View style={styles.statGridItem}>
                  <Text style={styles.statGridLabel}>Avg Discount</Text>
                  <Text style={styles.statGridValue}>
                    {codes.length > 0
                      ? (
                        codes.reduce((sum, c) => sum + c.discountPercentage, 0) /
                        codes.length
                      ).toFixed(1)
                      : '0'}
                    %
                  </Text>
                </View>
                <View style={styles.statGridItem}>
                  <Text style={styles.statGridLabel}>Total Rewards</Text>
                  <Text style={styles.statGridValue}>
                    ${stats.totalEarned.toFixed(0)}
                  </Text>
                </View>
              </View>

              <Text style={styles.subsectionTitle}>Recent Activity</Text>
              {referralHistory.length === 0 ? (
                <Text style={styles.noItemsText}>No referral activity yet</Text>
              ) : (
                referralHistory.slice(0, 5).map((reward, idx) => (
                  <View key={idx} style={styles.activityItem}>
                    <View style={styles.activityLeft}>
                      <MaterialIcons name="trending-up" size={16} color="#4CAF50" />
                      <Text style={styles.activityText}>
                        {reward.type.replace(/_/g, ' ')}
                      </Text>
                    </View>
                    <Text style={styles.activityAmount}>
                      +${reward.amount.toFixed(2)}
                    </Text>
                  </View>
                ))
              )}
            </>
          )}
        </View>
      )}

      <View style={{ height: 20 }} />

      {/* Create Code Modal */}
      <Modal
        visible={createCodeModal}
        animationType="slide"
        transparent
        onRequestClose={() => setCreateCodeModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create Referral Code</Text>
              <Pressable onPress={() => setCreateCodeModal(false)}>
                <MaterialIcons name="close" size={24} color="#000" />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.formLabel}>Display Name</Text>
              <View style={styles.textInput}>
                <Text style={styles.textInputText}>{newCode.displayName || 'Enter name'}</Text>
              </View>

              <Text style={styles.formLabel}>Discount Percentage</Text>
              <View style={styles.percentageInput}>
                <Text style={styles.percentageValue}>{newCode.discountPercentage}%</Text>
              </View>

              <Text style={styles.formLabel}>Max Uses</Text>
              <View style={styles.maxUsesInput}>
                <Text style={styles.maxUsesValue}>{newCode.maxUses}</Text>
              </View>

              <Pressable
                style={styles.primaryButton}
                onPress={handleCreateCode}
              >
                <MaterialIcons name="add" size={20} color="#fff" />
                <Text style={styles.primaryButtonText}>Create Code</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Apply Code Modal */}
      <Modal
        visible={applyCodeModal}
        animationType="slide"
        transparent
        onRequestClose={() => setApplyCodeModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Apply Referral Code</Text>
              <Pressable onPress={() => setApplyCodeModal(false)}>
                <MaterialIcons name="close" size={24} color="#000" />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.formLabel}>Enter Code</Text>
              <View style={styles.codeInput}>
                <MaterialIcons name="card-giftcard" size={20} color="#2196F3" />
                <Text style={styles.codeInputText}>{codeToApply || 'Enter code'}</Text>
              </View>

              <Pressable
                style={styles.primaryButton}
                onPress={handleApplyCode}
              >
                <MaterialIcons name="check" size={20} color="#fff" />
                <Text style={styles.primaryButtonText}>Apply Code</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Code Details Modal */}
      <Modal
        visible={codeDetailsModal}
        animationType="slide"
        transparent
        onRequestClose={() => setCodeDetailsModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Code Details</Text>
              <Pressable onPress={() => setCodeDetailsModal(false)}>
                <MaterialIcons name="close" size={24} color="#000" />
              </Pressable>
            </View>

            {selectedCode && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailSection}>
                  <Text style={styles.detailCode}>{selectedCode.code}</Text>
                  <Text style={styles.detailName}>{selectedCode.displayName}</Text>
                </View>

                <View style={styles.detailGrid}>
                  <DetailGridItem label="Discount" value={`${selectedCode.discountPercentage}%`} />
                  <DetailGridItem
                    label="Current Uses"
                    value={`${selectedCode.currentUses}/${selectedCode.maxUses}`}
                  />
                  <DetailGridItem label="Reward Amount" value={`$${selectedCode.rewardAmount.toFixed(2)}`} />
                  <DetailGridItem
                    label="Status"
                    value={selectedCode.status.charAt(0).toUpperCase() + selectedCode.status.slice(1)}
                  />
                </View>

                <View style={styles.shareButtons}>
                  <ShareButton
                    icon="phone"
                    label="WhatsApp"
                    onPress={() =>
                      handleShareCode(selectedCode.code, 'whatsapp')
                    }
                  />
                  <ShareButton
                    icon="mail"
                    label="Email"
                    onPress={() =>
                      handleShareCode(selectedCode.code, 'email')
                    }
                  />
                  <ShareButton
                    icon="share"
                    label="Share"
                    onPress={() =>
                      handleShareCode(selectedCode.code, 'link')
                    }
                  />
                </View>
              </ScrollView>
            )}
          </View>
        </View>
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
      <Text
        style={[
          styles.tabButtonText,
          active && styles.tabButtonTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
};

const StatCard: React.FC<{
  title: string;
  value: string;
  icon: string;
  color: string;
}> = ({ title, value, icon, color }) => {
  return (
    <View style={[styles.statCard, { borderLeftColor: color }]}>
      <View style={[styles.statCardIcon, { backgroundColor: color + '20' }]}>
        <MaterialIcons name={icon as any} size={24} color={color} />
      </View>
      <View style={styles.statCardContent}>
        <Text style={styles.statCardLabel}>{title}</Text>
        <Text style={[styles.statCardValue, { color }]}>{value}</Text>
      </View>
    </View>
  );
};

const DetailGridItem: React.FC<{
  label: string;
  value: string;
}> = ({ label, value }) => {
  return (
    <View style={styles.detailGridItem}>
      <Text style={styles.detailGridLabel}>{label}</Text>
      <Text style={styles.detailGridValue}>{value}</Text>
    </View>
  );
};

const ShareButton: React.FC<{
  icon: string;
  label: string;
  onPress: () => void;
}> = ({ icon, label, onPress }) => {
  return (
    <Pressable style={styles.shareButton} onPress={onPress}>
      <MaterialIcons name={icon as any} size={20} color="#fff" />
      <Text style={styles.shareButtonText}>{label}</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  statCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    gap: 12,
  },
  statCardIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statCardContent: {
    flex: 1,
  },
  statCardLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 2,
  },
  statCardValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  topReferralCard: {
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderColor: '#FFD700',
  },
  topReferralInfo: {
    flex: 1,
  },
  topReferralLabel: {
    fontSize: 11,
    color: '#999',
  },
  topReferralCode: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginTop: 2,
  },
  topReferralStats: {
    fontSize: 11,
    color: '#666',
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
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  subsectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
    marginTop: 12,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyCodeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    marginBottom: 12,
    backgroundColor: '#E3F2FD',
    borderRadius: 6,
  },
  applyCodeButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2196F3',
  },
  codeCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  codeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  codeLeft: {
    flex: 1,
  },
  codeValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    fontFamily: 'monospace',
  },
  codeName: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  codeStats: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  codeStat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
  },
  codeStatLabel: {
    fontSize: 10,
    color: '#999',
  },
  codeStatValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
    marginTop: 2,
  },
  codeActions: {
    flexDirection: 'row',
    gap: 8,
  },
  codeActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    gap: 4,
  },
  codeActionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  rewardCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rewardLeft: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  rewardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardInfo: {
    flex: 1,
  },
  rewardType: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  rewardDetail: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  rewardRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  rewardAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
  rewardAmountGreen: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4CAF50',
  },
  claimButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#2196F3',
    borderRadius: 4,
  },
  claimButtonText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  noItemsText: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  statGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  statGridItem: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  statGridLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 4,
  },
  statGridValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2196F3',
  },
  activityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  activityLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activityText: {
    fontSize: 12,
    color: '#666',
  },
  activityAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4CAF50',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
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
    paddingVertical: 12,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
    marginTop: 12,
  },
  textInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    marginBottom: 12,
  },
  textInputText: {
    fontSize: 13,
    color: '#666',
  },
  percentageInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    marginBottom: 12,
  },
  percentageValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2196F3',
  },
  maxUsesInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    marginBottom: 12,
  },
  maxUsesValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2196F3',
  },
  codeInput: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    marginBottom: 12,
    gap: 8,
  },
  codeInputText: {
    flex: 1,
    fontSize: 13,
    color: '#666',
    fontFamily: 'monospace',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    borderRadius: 6,
    marginTop: 12,
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  detailSection: {
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  detailCode: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2196F3',
    fontFamily: 'monospace',
  },
  detailName: {
    fontSize: 13,
    color: '#666',
    marginTop: 6,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginVertical: 12,
  },
  detailGridItem: {
    width: '48%',
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    alignItems: 'center',
  },
  detailGridLabel: {
    fontSize: 10,
    color: '#999',
    marginBottom: 4,
  },
  detailGridValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
  shareButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  shareButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: '#2196F3',
    borderRadius: 6,
  },
  shareButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
});

export default ReferralSystemScreen;
