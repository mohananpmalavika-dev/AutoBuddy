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
  FlatList,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useIncentivesTracking, Incentive } from '../hooks/useIncentivesTracking';

type DateLike = string | number | Date | null | undefined;

const formatDateSafely = (date: DateLike): string => {
  if (!date) {return 'Unknown';}
  const dateObj = new Date(date);
  return !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : 'Unknown';
};

interface IncentivesTrackingScreenProps {
  token: string | null;
  driverId: string;
}

export const IncentivesTrackingScreen: React.FC<IncentivesTrackingScreenProps> = ({
  token,
  driverId,
}) => {
  const {
    activeIncentives,
    completedIncentives,
    bonuses,
    incentiveHistory,
    loading,
    fetchActiveIncentives,
    fetchBonuses,
    fetchIncentiveHistory,
    claimIncentive,
    getIncentiveProgress,
    getTotalEarnings,
    getUnclaimedAmount,
    getIncentiveStats,
  } = useIncentivesTracking(token, driverId);

  const [refreshing, setRefreshing] = useState(false);
  const [selectedIncentive, setSelectedIncentive] = useState<Incentive | null>(null);
  const [showIncentiveDetail, setShowIncentiveDetail] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'completed' | 'history'>('active');

  useEffect(() => {
    loadAllData();
  }, []);

  const loadAllData = async () => {
    await fetchActiveIncentives();
    await fetchBonuses();
    await fetchIncentiveHistory();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
  };

  const handleClaimIncentive = async (incentiveId: string) => {
    const success = await claimIncentive(incentiveId);
    if (success) {
      Alert.alert('Success', 'Incentive claimed successfully!');
      setShowIncentiveDetail(false);
    } else {
      Alert.alert('Error', 'Failed to claim incentive');
    }
  };

  const stats = getIncentiveStats();

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Statistics Cards */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <MaterialIcons name="trending-up" size={24} color="#4CAF50" />
          <Text style={styles.statLabel}>Total Earned</Text>
          <Text style={styles.statValue}>₹{stats.totalEarned.toFixed(0)}</Text>
        </View>

        <View style={styles.statCard}>
          <MaterialIcons name="wallet" size={24} color="#FF9800" />
          <Text style={styles.statLabel}>Unclaimed</Text>
          <Text style={styles.statValue}>₹{getUnclaimedAmount().toFixed(0)}</Text>
        </View>

        <View style={styles.statCard}>
          <MaterialIcons name="check-circle" size={24} color="#2196F3" />
          <Text style={styles.statLabel}>Completed</Text>
          <Text style={styles.statValue}>{stats.completed}</Text>
        </View>

        <View style={styles.statCard}>
          <MaterialIcons name="schedule" size={24} color="#9C27B0" />
          <Text style={styles.statLabel}>Active</Text>
          <Text style={styles.statValue}>{activeIncentives.length}</Text>
        </View>
      </View>

      {/* Bonus Cards */}
      {bonuses.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bonuses</Text>
          {bonuses.slice(0, 3).map((bonus) => (
            <View key={bonus.id} style={styles.bonusCard}>
              <View style={styles.bonusHeader}>
                <MaterialIcons name="card-giftcard" size={20} color="#FFD700" />
                <View style={styles.bonusInfo}>
                  <Text style={styles.bonusReason}>{bonus.reason}</Text>
                  <Text style={styles.bonusDate}>
                    {formatDateSafely(bonus.earnedAt)}
                  </Text>
                </View>
                <Text style={[styles.bonusAmount, { color: '#4CAF50' }]}>
                  +₹{bonus.amount.toFixed(0)}
                </Text>
              </View>
              <View
                style={[
                  styles.bonusStatus,
                  {
                    backgroundColor:
                      bonus.status === 'credited'
                        ? '#E8F5E9'
                        : bonus.status === 'pending'
                        ? '#FFF3E0'
                        : '#FFEBEE',
                  },
                ]}
              >
                <Text style={[styles.bonusStatusText, { color: '#666' }]}>
                  {bonus.status.toUpperCase()}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <Pressable
          style={[styles.tab, activeTab === 'active' && styles.activeTab]}
          onPress={() => setActiveTab('active')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'active' && styles.activeTabText,
            ]}
          >
            Active ({activeIncentives.length})
          </Text>
        </Pressable>

        <Pressable
          style={[styles.tab, activeTab === 'completed' && styles.activeTab]}
          onPress={() => setActiveTab('completed')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'completed' && styles.activeTabText,
            ]}
          >
            Completed ({completedIncentives.length})
          </Text>
        </Pressable>

        <Pressable
          style={[styles.tab, activeTab === 'history' && styles.activeTab]}
          onPress={() => setActiveTab('history')}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'history' && styles.activeTabText,
            ]}
          >
            History ({incentiveHistory.length})
          </Text>
        </Pressable>
      </View>

      {/* Active Incentives */}
      {activeTab === 'active' && (
        <View style={styles.section}>
          {loading && activeIncentives.length === 0 ? (
            <ActivityIndicator size="large" color="#2196F3" style={{ marginVertical: 20 }} />
          ) : activeIncentives.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="card-giftcard" size={48} color="#ddd" />
              <Text style={styles.emptyText}>No active incentives</Text>
            </View>
          ) : (
            activeIncentives.map((incentive) => (
              <IncentiveCard
                key={incentive.id}
                incentive={incentive}
                progress={getIncentiveProgress(incentive.id)}
                onPress={() => {
                  setSelectedIncentive(incentive);
                  setShowIncentiveDetail(true);
                }}
              />
            ))
          )}
        </View>
      )}

      {/* Completed Incentives */}
      {activeTab === 'completed' && (
        <View style={styles.section}>
          {completedIncentives.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="check-circle" size={48} color="#ddd" />
              <Text style={styles.emptyText}>No completed incentives</Text>
            </View>
          ) : (
            completedIncentives.map((incentive) => (
              <CompletedIncentiveCard
                key={incentive.id}
                incentive={incentive}
                onPress={() => {
                  setSelectedIncentive(incentive);
                  setShowIncentiveDetail(true);
                }}
              />
            ))
          )}
        </View>
      )}

      {/* History */}
      {activeTab === 'history' && (
        <View style={styles.section}>
          {incentiveHistory.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="history" size={48} color="#ddd" />
              <Text style={styles.emptyText}>No history yet</Text>
            </View>
          ) : (
            incentiveHistory.map((item) => (
              <View key={item.id} style={styles.historyItem}>
                <View style={styles.historyIcon}>
                  <MaterialIcons name="check-circle" size={20} color="#4CAF50" />
                </View>
                <View style={styles.historyContent}>
                  <Text style={styles.historyIncentiveId}>Incentive #{item.incentiveId.slice(0, 8)}</Text>
                  <Text style={styles.historyDate}>
                    {formatDateSafely(item.claimedAt)}
                  </Text>
                </View>
                <Text style={styles.historyAmount}>+₹{item.amount.toFixed(0)}</Text>
              </View>
            ))
          )}
        </View>
      )}

      {/* Incentive Detail Modal */}
      <Modal visible={showIncentiveDetail} transparent animationType="slide">
        {selectedIncentive && (
          <View style={styles.modal}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Pressable onPress={() => setShowIncentiveDetail(false)}>
                  <MaterialIcons name="close" size={24} color="#000" />
                </Pressable>
                <Text style={styles.modalTitle}>Incentive Details</Text>
                <View style={{ width: 24 }} />
              </View>

              <ScrollView style={styles.modalBody}>
                <View style={styles.detailCard}>
                  <View style={styles.detailRow}>
                    <MaterialIcons name="card-giftcard" size={20} color="#2196F3" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Title</Text>
                      <Text style={styles.detailValue}>{selectedIncentive.title}</Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons name="description" size={20} color="#2196F3" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Description</Text>
                      <Text style={styles.detailValue}>{selectedIncentive.description}</Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons name="attach-money" size={20} color="#4CAF50" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Reward Amount</Text>
                      <Text style={styles.detailValue}>₹{selectedIncentive.rewardAmount.toFixed(0)}</Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons name="trending-up" size={20} color="#FF9800" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Progress</Text>
                      <Text style={styles.detailValue}>{selectedIncentive.progress}%</Text>
                    </View>
                  </View>

                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${selectedIncentive.progress}%` },
                      ]}
                    />
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons
                      name={
                        selectedIncentive.status === 'completed'
                          ? 'check-circle'
                          : 'schedule'
                      }
                      size={20}
                      color={
                        selectedIncentive.status === 'completed'
                          ? '#4CAF50'
                          : '#FF9800'
                      }
                    />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Status</Text>
                      <Text style={styles.detailValue}>
                        {selectedIncentive.status.charAt(0).toUpperCase() +
                          selectedIncentive.status.slice(1).replace('_', ' ')}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons name="calendar-today" size={20} color="#2196F3" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Valid Until</Text>
                      <Text style={styles.detailValue}>
                        {formatDateSafely(selectedIncentive.endDate)}
                      </Text>
                    </View>
                  </View>

                  {/* Conditions */}
                  {selectedIncentive.conditions.length > 0 && (
                    <>
                      <View style={styles.divider} />
                      <Text style={styles.conditionsTitle}>Conditions</Text>
                      {selectedIncentive.conditions.map((condition, index) => (
                        <View key={index} style={styles.conditionItem}>
                          <Text style={styles.conditionText}>
                            {condition.type}: {condition.current} / {condition.target}{' '}
                            {condition.unit}
                          </Text>
                          <View style={styles.conditionProgressBar}>
                            <View
                              style={[
                                styles.conditionProgressFill,
                                {
                                  width: `${Math.min(
                                    (condition.current / condition.target) * 100,
                                    100
                                  )}%`,
                                },
                              ]}
                            />
                          </View>
                        </View>
                      ))}
                    </>
                  )}
                </View>

                {selectedIncentive.status === 'completed' &&
                  selectedIncentive.status !== 'claimed' && (
                    <Pressable
                      style={styles.claimButton}
                      onPress={() =>
                        handleClaimIncentive(selectedIncentive.id)
                      }
                    >
                      <MaterialIcons name="card-giftcard" size={20} color="#fff" />
                      <Text style={styles.claimButtonText}>Claim Incentive</Text>
                    </Pressable>
                  )}
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>
    </ScrollView>
  );
};

const IncentiveCard: React.FC<{
  incentive: Incentive;
  progress: number;
  onPress: () => void;
}> = ({ incentive, progress, onPress }) => {
  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'rides_completed':
        return 'directions-car';
      case 'rating_based':
        return 'star';
      case 'hours_online':
        return 'access-time';
      case 'referral':
        return 'person-add';
      case 'challenge':
        return 'flag';
      default:
        return 'card-giftcard';
    }
  };

  return (
    <Pressable style={styles.incentiveCard} onPress={onPress}>
      <View style={styles.incentiveHeader}>
        <View style={styles.incentiveIcon}>
          <MaterialIcons name={getTypeIcon(incentive.type)} size={20} color="#2196F3" />
        </View>
        <View style={styles.incentiveInfo}>
          <Text style={styles.incentiveTitle}>{incentive.title}</Text>
          <Text style={styles.incentiveType}>
            {incentive.type.replace(/_/g, ' ').toUpperCase()}
          </Text>
        </View>
        <Text style={styles.incentiveReward}>₹{incentive.rewardAmount.toFixed(0)}</Text>
      </View>

      <View style={styles.incentiveProgress}>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              { width: `${progress}%` },
            ]}
          />
        </View>
        <Text style={styles.progressText}>{progress}% Complete</Text>
      </View>

      <View style={styles.incentiveFooter}>
        <Text style={styles.incentiveDescription}>{incentive.description}</Text>
        <Text style={styles.incentiveExpiry}>
          Expires: {formatDateSafely(incentive.endDate)}
        </Text>
      </View>
    </Pressable>
  );
};

const CompletedIncentiveCard: React.FC<{
  incentive: Incentive;
  onPress: () => void;
}> = ({ incentive, onPress }) => {
  return (
    <Pressable style={styles.completedCard} onPress={onPress}>
      <View style={styles.completedHeader}>
        <View style={styles.completedIcon}>
          <MaterialIcons name="check-circle" size={20} color="#4CAF50" />
        </View>
        <View style={styles.completedInfo}>
          <Text style={styles.completedTitle}>{incentive.title}</Text>
          <Text style={styles.completedAmount}>₹{incentive.rewardAmount.toFixed(0)}</Text>
        </View>
        <Text
          style={[
            styles.completedStatus,
            {
              color: incentive.status === 'claimed' ? '#4CAF50' : '#FF9800',
            },
          ]}
        >
          {incentive.status.toUpperCase()}
        </Text>
      </View>
      {incentive.claimedAt && (
        <Text style={styles.claimedDate}>
          Claimed: {formatDateSafely(incentive.claimedAt)}
        </Text>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingVertical: 12,
    gap: 8,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 8,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginTop: 4,
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  bonusCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  bonusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  bonusInfo: {
    flex: 1,
  },
  bonusReason: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  bonusDate: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  bonusAmount: {
    fontSize: 13,
    fontWeight: '700',
  },
  bonusStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  bonusStatusText: {
    fontSize: 9,
    fontWeight: '700',
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    alignItems: 'center',
  },
  activeTab: {
    borderBottomColor: '#2196F3',
  },
  tabText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
  },
  activeTabText: {
    color: '#2196F3',
  },
  incentiveCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  incentiveHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  incentiveIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  incentiveInfo: {
    flex: 1,
  },
  incentiveTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  incentiveType: {
    fontSize: 9,
    color: '#999',
    marginTop: 2,
  },
  incentiveReward: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4CAF50',
  },
  incentiveProgress: {
    marginBottom: 12,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2196F3',
  },
  progressText: {
    fontSize: 10,
    color: '#666',
  },
  incentiveFooter: {
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 8,
  },
  incentiveDescription: {
    fontSize: 11,
    color: '#666',
    lineHeight: 15,
  },
  incentiveExpiry: {
    fontSize: 10,
    color: '#999',
    marginTop: 6,
  },
  completedCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  completedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  completedIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completedInfo: {
    flex: 1,
  },
  completedTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  completedAmount: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  completedStatus: {
    fontSize: 11,
    fontWeight: '700',
  },
  claimedDate: {
    fontSize: 10,
    color: '#999',
    marginTop: 8,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 8,
  },
  historyIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyContent: {
    flex: 1,
  },
  historyIncentiveId: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  historyDate: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  historyAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4CAF50',
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
  detailCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 10,
  },
  conditionsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
    marginTop: 8,
    marginBottom: 8,
  },
  conditionItem: {
    marginBottom: 12,
  },
  conditionText: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
  },
  conditionProgressBar: {
    height: 4,
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    overflow: 'hidden',
  },
  conditionProgressFill: {
    height: '100%',
    backgroundColor: '#2196F3',
  },
  claimButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#4CAF50',
    borderRadius: 6,
  },
  claimButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
});

export default IncentivesTrackingScreen;
