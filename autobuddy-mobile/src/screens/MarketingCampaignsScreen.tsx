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
import { useMarketingCampaigns, Campaign } from '../hooks/useMarketingCampaigns';

interface MarketingCampaignsScreenProps {
  token: string | null;
  adminId: string;
}

export const MarketingCampaignsScreen: React.FC<MarketingCampaignsScreenProps> = ({
  token,
  adminId,
}) => {
  const {
    campaigns,
    rewards,
    loading,
    fetchCampaigns,
    startCampaign,
    pauseCampaign,
    endCampaign,
    getCampaignMetrics,
    estimateROI,
  } = useMarketingCampaigns(token, adminId);

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'paused' | 'ended'>('active');
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [showCampaignDetail, setShowCampaignDetail] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await fetchCampaigns();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleStartCampaign = async (campaignId: string) => {
    const success = await startCampaign(campaignId);
    if (success) {
      Alert.alert('Success', 'Campaign started');
      await loadData();
    }
  };

  const handlePauseCampaign = async (campaignId: string) => {
    const success = await pauseCampaign(campaignId);
    if (success) {
      Alert.alert('Success', 'Campaign paused');
      await loadData();
    }
  };

  const activeCampaigns = campaigns.filter((c) => c.status === 'active');
  const pausedCampaigns = campaigns.filter((c) => c.status === 'paused');
  const endedCampaigns = campaigns.filter((c) => c.status === 'ended');

  const totalRewards = rewards.reduce((sum, r) => sum + r.rewardAmount, 0);
  const redeemedRewards = rewards.filter((r) => r.status === 'redeemed').length;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Summary Cards */}
      <View style={styles.summaryContainer}>
        <SummaryCard
          icon="local-offer"
          label="Active Campaigns"
          value={activeCampaigns.length.toString()}
          color="#2196F3"
        />
        <SummaryCard
          icon="card-giftcard"
          label="Total Rewards"
          value={`₹${totalRewards.toFixed(0)}`}
          color="#4CAF50"
        />
        <SummaryCard
          icon="check-circle"
          label="Redeemed"
          value={redeemedRewards.toString()}
          color="#FF9800"
        />
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TabButton
          label={`Active (${activeCampaigns.length})`}
          active={activeTab === 'active'}
          onPress={() => setActiveTab('active')}
        />
        <TabButton
          label={`Paused (${pausedCampaigns.length})`}
          active={activeTab === 'paused'}
          onPress={() => setActiveTab('paused')}
        />
        <TabButton
          label={`Ended (${endedCampaigns.length})`}
          active={activeTab === 'ended'}
          onPress={() => setActiveTab('ended')}
        />
      </View>

      {/* Active Campaigns */}
      {activeTab === 'active' && (
        <View style={styles.section}>
          {loading && activeCampaigns.length === 0 ? (
            <ActivityIndicator size="large" color="#2196F3" style={{ marginVertical: 20 }} />
          ) : activeCampaigns.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="local-offer" size={48} color="#ddd" />
              <Text style={styles.emptyText}>No active campaigns</Text>
            </View>
          ) : (
            activeCampaigns.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                onPress={() => {
                  setSelectedCampaign(campaign);
                  setShowCampaignDetail(true);
                }}
                onAction={() => handlePauseCampaign(campaign.id)}
                actionLabel="Pause"
              />
            ))
          )}
        </View>
      )}

      {/* Paused Campaigns */}
      {activeTab === 'paused' && (
        <View style={styles.section}>
          {pausedCampaigns.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="pause" size={48} color="#ddd" />
              <Text style={styles.emptyText}>No paused campaigns</Text>
            </View>
          ) : (
            pausedCampaigns.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                onPress={() => {
                  setSelectedCampaign(campaign);
                  setShowCampaignDetail(true);
                }}
                onAction={() => handleStartCampaign(campaign.id)}
                actionLabel="Resume"
              />
            ))
          )}
        </View>
      )}

      {/* Ended Campaigns */}
      {activeTab === 'ended' && (
        <View style={styles.section}>
          {endedCampaigns.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="check-circle" size={48} color="#ddd" />
              <Text style={styles.emptyText}>No ended campaigns</Text>
            </View>
          ) : (
            endedCampaigns.map((campaign) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                onPress={() => {
                  setSelectedCampaign(campaign);
                  setShowCampaignDetail(true);
                }}
                onAction={() => {}}
                actionLabel=""
                disabled
              />
            ))
          )}
        </View>
      )}

      {/* Campaign Detail Modal */}
      <Modal visible={showCampaignDetail} transparent animationType="slide">
        {selectedCampaign && (
          <View style={styles.modal}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Pressable onPress={() => setShowCampaignDetail(false)}>
                  <MaterialIcons name="close" size={24} color="#000" />
                </Pressable>
                <Text style={styles.modalTitle}>Campaign Details</Text>
                <View style={{ width: 24 }} />
              </View>

              <ScrollView style={styles.modalBody}>
                <View style={styles.detailCard}>
                  <View style={styles.campaignBadge}>
                    <Text style={styles.campaignBadgeText}>
                      {selectedCampaign.type.toUpperCase().replace(/_/g, ' ')}
                    </Text>
                  </View>

                  <Text style={styles.campaignName}>{selectedCampaign.name}</Text>
                  <Text style={styles.campaignDescription}>
                    {selectedCampaign.description}
                  </Text>

                  <View style={styles.metricsGrid}>
                    <MetricBox
                      label="Impressions"
                      value={selectedCampaign.metrics.impressions.toString()}
                    />
                    <MetricBox
                      label="Clicks"
                      value={selectedCampaign.metrics.clicks.toString()}
                    />
                    <MetricBox
                      label="Conversions"
                      value={selectedCampaign.metrics.conversions.toString()}
                    />
                    <MetricBox
                      label="Revenue"
                      value={`₹${selectedCampaign.metrics.revenue.toFixed(0)}`}
                    />
                  </View>

                  {(() => {
                    const metrics = getCampaignMetrics(selectedCampaign.id);
                    return metrics ? (
                      <View style={styles.advancedMetrics}>
                        <Text style={styles.metricsTitle}>Performance Metrics</Text>
                        <MetricRow
                          label="Click-Through Rate"
                          value={`${metrics.ctr}%`}
                        />
                        <MetricRow
                          label="Conversion Rate"
                          value={`${metrics.cvr}%`}
                        />
                        <MetricRow
                          label="Cost Per Click"
                          value={`₹${metrics.cpc}`}
                        />
                        <MetricRow
                          label="Cost Per Acquisition"
                          value={`₹${metrics.cpa}`}
                        />
                        <MetricRow
                          label="Estimated ROI"
                          value={`${estimateROI(selectedCampaign.id)}%`}
                          highlight
                        />
                      </View>
                    ) : null;
                  })()}

                  <View style={styles.budgetInfo}>
                    <Text style={styles.budgetLabel}>Budget Allocation</Text>
                    <View style={styles.budgetBar}>
                      <View
                        style={[
                          styles.budgetUsed,
                          {
                            width: `${(selectedCampaign.spentAmount / selectedCampaign.budget) * 100}%`,
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.budgetText}>
                      <Text style={styles.budgetSpent}>
                        ₹{selectedCampaign.spentAmount.toFixed(0)} spent
                      </Text>
                      <Text style={styles.budgetTotal}>
                        of ₹{selectedCampaign.budget.toFixed(0)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.datesInfo}>
                    <View style={styles.dateItem}>
                      <MaterialIcons name="calendar-today" size={16} color="#2196F3" />
                      <View style={styles.dateText}>
                        <Text style={styles.dateLabel}>Start Date</Text>
                        <Text style={styles.dateValue}>
                          {new Date(selectedCampaign.startDate).toLocaleDateString()}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.dateItem}>
                      <MaterialIcons name="calendar-today" size={16} color="#2196F3" />
                      <View style={styles.dateText}>
                        <Text style={styles.dateLabel}>End Date</Text>
                        <Text style={styles.dateValue}>
                          {new Date(selectedCampaign.endDate).toLocaleDateString()}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>
    </ScrollView>
  );
};

const SummaryCard: React.FC<{
  icon: string;
  label: string;
  value: string;
  color: string;
}> = ({ icon, label, value, color }) => {
  return (
    <View style={[styles.summaryCard, { borderLeftColor: color, borderLeftWidth: 4 }]}>
      <MaterialIcons name={icon as any} size={20} color={color} />
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={[styles.summaryValue, { color }]}>{value}</Text>
    </View>
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

const CampaignCard: React.FC<{
  campaign: Campaign;
  onPress: () => void;
  onAction: () => void;
  actionLabel: string;
  disabled?: boolean;
}> = ({ campaign, onPress, onAction, actionLabel, disabled }) => {
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'promotion':
        return '#2196F3';
      case 'referral':
        return '#4CAF50';
      case 'seasonal':
        return '#FF9800';
      case 'retention':
        return '#9C27B0';
      default:
        return '#666';
    }
  };

  return (
    <Pressable style={styles.campaignCard} onPress={onPress} disabled={disabled}>
      <View style={styles.campaignCardHeader}>
        <View>
          <Text style={styles.campaignCardName}>{campaign.name}</Text>
          <Text style={[styles.campaignCardType, { color: getTypeColor(campaign.type) }]}>
            {campaign.type.charAt(0).toUpperCase() + campaign.type.slice(1)}
          </Text>
        </View>
        {!disabled && actionLabel && (
          <Pressable
            style={styles.actionButton}
            onPress={(e) => {
              e.stopPropagation();
              onAction();
            }}
          >
            <Text style={styles.actionButtonText}>{actionLabel}</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.campaignMetrics}>
        <MetricPill label="Impressions" value={campaign.metrics.impressions} />
        <MetricPill label="Clicks" value={campaign.metrics.clicks} />
        <MetricPill label="Conv." value={campaign.metrics.conversions} />
      </View>

      <View style={styles.campaignFooter}>
        <Text style={styles.campaignBudget}>
          ₹{campaign.spentAmount.toFixed(0)} / ₹{campaign.budget.toFixed(0)}
        </Text>
        <Text style={styles.campaignStatus}>
          {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
        </Text>
      </View>
    </Pressable>
  );
};

const MetricBox: React.FC<{
  label: string;
  value: string;
}> = ({ label, value }) => {
  return (
    <View style={styles.metricBox}>
      <Text style={styles.metricBoxLabel}>{label}</Text>
      <Text style={styles.metricBoxValue}>{value}</Text>
    </View>
  );
};

const MetricRow: React.FC<{
  label: string;
  value: string;
  highlight?: boolean;
}> = ({ label, value, highlight }) => {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricRowLabel}>{label}</Text>
      <Text
        style={[
          styles.metricRowValue,
          highlight && { color: '#4CAF50', fontWeight: '700' },
        ]}
      >
        {value}
      </Text>
    </View>
  );
};

const MetricPill: React.FC<{
  label: string;
  value: number;
}> = ({ label, value }) => {
  return (
    <View style={styles.metricPill}>
      <Text style={styles.metricPillLabel}>{label}</Text>
      <Text style={styles.metricPillValue}>{value}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  summaryContainer: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 12,
    gap: 8,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  summaryLabel: {
    fontSize: 10,
    color: '#666',
    marginTop: 6,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
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
  campaignCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  campaignCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  campaignCardName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
  campaignCardType: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#2196F3',
    borderRadius: 4,
  },
  actionButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  campaignMetrics: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  metricPill: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    borderRadius: 4,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  metricPillLabel: {
    fontSize: 9,
    color: '#666',
  },
  metricPillValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#000',
    marginTop: 2,
  },
  campaignFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTopWidth: 1,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  campaignBudget: {
    fontSize: 10,
    color: '#999',
  },
  campaignStatus: {
    fontSize: 10,
    fontWeight: '700',
    color: '#666',
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
  },
  campaignBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#2196F3',
    borderRadius: 4,
    marginBottom: 8,
  },
  campaignBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
  campaignName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 4,
  },
  campaignDescription: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12,
    lineHeight: 16,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  metricBox: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  metricBoxLabel: {
    fontSize: 10,
    color: '#666',
  },
  metricBoxValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginTop: 2,
  },
  advancedMetrics: {
    backgroundColor: '#fff',
    borderRadius: 6,
    padding: 8,
    marginBottom: 12,
  },
  metricsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  metricRowLabel: {
    fontSize: 11,
    color: '#666',
  },
  metricRowValue: {
    fontSize: 11,
    fontWeight: '600',
    color: '#000',
  },
  budgetInfo: {
    backgroundColor: '#fff',
    borderRadius: 6,
    padding: 8,
    marginBottom: 12,
  },
  budgetLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#000',
    marginBottom: 6,
  },
  budgetBar: {
    height: 6,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  budgetUsed: {
    height: '100%',
    backgroundColor: '#2196F3',
  },
  budgetText: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  budgetSpent: {
    fontSize: 10,
    fontWeight: '600',
    color: '#2196F3',
  },
  budgetTotal: {
    fontSize: 10,
    color: '#999',
  },
  datesInfo: {
    gap: 8,
  },
  dateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dateText: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 10,
    color: '#999',
  },
  dateValue: {
    fontSize: 11,
    fontWeight: '600',
    color: '#000',
    marginTop: 2,
  },
});

export default MarketingCampaignsScreen;
