import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  FlatList,
  Linking,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useReferralProgram, ReferralReward } from '../hooks/useReferralProgram';

interface ReferralProgramScreenProps {
  userId: string;
  authToken: string;
  onShare?: (platform: string) => void;
}

export function ReferralProgramScreen({ userId, authToken, onShare }: ReferralProgramScreenProps) {
  const {
    referralInfo,
    referralLink,
    referralRewards,
    totalEarnings,
    pendingBonuses,
    claimedBonuses,
    referredDriverCount,
    isLoading,
    fetchReferralInfo,
    claimBonus,
    getShareUrl,
  } = useReferralProgram(userId, authToken);

  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'claims'>('overview');
  const [claimingBonus, setClaimingBonus] = useState(false);

  const handleClaimBonus = async () => {
    if (pendingBonuses <= 0) {return;}
    setClaimingBonus(true);
    await claimBonus(pendingBonuses);
    setClaimingBonus(false);
  };

  const handleShare = (platform: 'whatsapp' | 'sms' | 'email') => {
    const url = getShareUrl(platform);
    if (url) {
      Linking.openURL(url);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
        <Text style={styles.loadingText}>Loading referral program...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={isLoading} onRefresh={fetchReferralInfo} />
      }
    >
      {activeTab === 'overview' && (
        <>
          {/* Referral Link Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your Referral Code</Text>
            <View style={styles.codeBox}>
              <Text style={styles.referralCode}>{referralInfo?.code || '---'}</Text>
              <Pressable
                style={styles.copyButton}
                onPress={() => {
                  // Copy to clipboard
                  console.log('Copy:', referralLink);
                }}
              >
                <MaterialIcons name="content-copy" size={18} color="#2196F3" />
                <Text style={styles.copyButtonText}>Copy</Text>
              </Pressable>
            </View>

            <Text style={styles.linkLabel}>Referral Link</Text>
            <Text style={styles.linkText}>{referralLink}</Text>

            {/* Share Buttons */}
            <View style={styles.shareButtonsContainer}>
              <Pressable
                style={styles.shareButton}
                onPress={() => handleShare('whatsapp')}
              >
                <MaterialIcons name="chat-bubble" size={20} color="#25D366" />
                <Text style={styles.shareButtonText}>WhatsApp</Text>
              </Pressable>

              <Pressable
                style={styles.shareButton}
                onPress={() => handleShare('sms')}
              >
                <MaterialIcons name="sms" size={20} color="#2196F3" />
                <Text style={styles.shareButtonText}>SMS</Text>
              </Pressable>

              <Pressable
                style={styles.shareButton}
                onPress={() => handleShare('email')}
              >
                <MaterialIcons name="mail" size={20} color="#EA4335" />
                <Text style={styles.shareButtonText}>Email</Text>
              </Pressable>
            </View>
          </View>

          {/* Earnings Summary */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Earnings Summary</Text>
            <View style={styles.earningsGrid}>
              <View style={styles.earningsBox}>
                <Text style={styles.earningsLabel}>Total Earned</Text>
                <Text style={styles.earningsAmount}>₹{totalEarnings.toLocaleString('en-IN')}</Text>
              </View>
              <View style={styles.earningsBox}>
                <Text style={styles.earningsLabel}>Pending</Text>
                <Text style={styles.earningsAmountPending}>₹{pendingBonuses.toLocaleString('en-IN')}</Text>
              </View>
              <View style={styles.earningsBox}>
                <Text style={styles.earningsLabel}>Claimed</Text>
                <Text style={styles.earningsAmountClaimed}>₹{claimedBonuses.toLocaleString('en-IN')}</Text>
              </View>
            </View>

            {pendingBonuses > 0 && (
              <Pressable
                style={[styles.claimButton, claimingBonus && styles.claimButtonLoading]}
                onPress={handleClaimBonus}
                disabled={claimingBonus}
              >
                {claimingBonus ? (
                  <>
                    <ActivityIndicator size="small" color="#fff" />
                    <Text style={styles.claimButtonText}>Claiming...</Text>
                  </>
                ) : (
                  <>
                    <MaterialIcons name="check-circle" size={20} color="#fff" />
                    <Text style={styles.claimButtonText}>Claim ₹{pendingBonuses.toLocaleString('en-IN')}</Text>
                  </>
                )}
              </Pressable>
            )}
          </View>

          {/* Referred Drivers */}
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>Referred Drivers</Text>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{referredDriverCount}</Text>
              </View>
            </View>

            {referredDriverCount > 0 ? (
              <View>
                <Text style={styles.referralsSubtext}>
                  {referredDriverCount} driver{referredDriverCount !== 1 ? 's' : ''} signed up with your code
                </Text>
                <Pressable
                  style={styles.viewHistoryButton}
                  onPress={() => setActiveTab('history')}
                >
                  <Text style={styles.viewHistoryButtonText}>View Details</Text>
                  <MaterialIcons name="chevron-right" size={18} color="#2196F3" />
                </Pressable>
              </View>
            ) : (
              <Text style={styles.emptyText}>
                Share your referral code to start earning! Each successful driver signup earns you ₹50.
              </Text>
            )}
          </View>
        </>
      )}

      {activeTab === 'history' && <ReferralHistoryScreen rewards={referralRewards} />}

      {activeTab === 'claims' && <BonusClaimsScreen rewards={referralRewards} />}

      {/* Tab Navigation */}
      <View style={styles.tabNav}>
        <Pressable
          style={[styles.tab, activeTab === 'overview' && styles.tabActive]}
          onPress={() => setActiveTab('overview')}
        >
          <Text style={[styles.tabLabel, activeTab === 'overview' && styles.tabLabelActive]}>
            Overview
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabLabel, activeTab === 'history' && styles.tabLabelActive]}>
            History
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'claims' && styles.tabActive]}
          onPress={() => setActiveTab('claims')}
        >
          <Text style={[styles.tabLabel, activeTab === 'claims' && styles.tabLabelActive]}>
            Claims
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

interface ReferralHistoryScreenProps {
  rewards: ReferralReward[];
}

function ReferralHistoryScreen({ rewards }: ReferralHistoryScreenProps) {
  const creditedRewards = rewards.filter(r => r.status === 'credited' || r.status === 'paid_out');

  return (
    <View>
      <Text style={styles.listHeader}>Referral History</Text>
      {creditedRewards.length === 0 ? (
        <View style={styles.emptyCard}>
          <MaterialIcons name="history" size={48} color="#ccc" />
          <Text style={styles.emptyTitle}>No referrals yet</Text>
          <Text style={styles.emptyText}>Share your code to earn bonuses</Text>
        </View>
      ) : (
        creditedRewards.map((reward, index) => (
          <View key={reward.id} style={styles.historyItem}>
            <View style={styles.historyItemLeft}>
              <MaterialIcons name="person-add" size={24} color="#4CAF50" />
            </View>
            <View style={styles.historyItemContent}>
              <Text style={styles.historyItemTitle}>Driver Signup</Text>
              <Text style={styles.historyItemSubtitle}>
                {new Date(reward.created_at).toLocaleDateString('en-IN')}
              </Text>
            </View>
            <View style={styles.historyItemRight}>
              <Text style={styles.historyItemAmount}>+₹{reward.reward_amount.toLocaleString('en-IN')}</Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

interface BonusClaimsScreenProps {
  rewards: ReferralReward[];
}

function BonusClaimsScreen({ rewards }: BonusClaimsScreenProps) {
  const claimedRewards = rewards.filter(r => r.status === 'credited' || r.status === 'paid_out');
  const totalClaimed = claimedRewards.reduce((sum, r) => sum + r.reward_amount, 0);

  return (
    <View>
      <Text style={styles.listHeader}>Claim History</Text>
      <View style={styles.claimSummary}>
        <Text style={styles.claimSummaryLabel}>Total Claimed</Text>
        <Text style={styles.claimSummaryAmount}>₹{totalClaimed.toLocaleString('en-IN')}</Text>
      </View>

      {claimedRewards.length === 0 ? (
        <View style={styles.emptyCard}>
          <MaterialIcons name="payment" size={48} color="#ccc" />
          <Text style={styles.emptyTitle}>No claims yet</Text>
          <Text style={styles.emptyText}>Bonuses will appear here once claimed</Text>
        </View>
      ) : (
        claimedRewards.map((reward) => (
          <View key={reward.id} style={styles.claimItem}>
            <View style={styles.claimItemLeft}>
              <MaterialIcons name="check-circle" size={24} color="#4CAF50" />
            </View>
            <View style={styles.claimItemContent}>
              <Text style={styles.claimItemTitle}>Bonus Credited</Text>
              <Text style={styles.claimItemSubtitle}>
                {new Date(reward.created_at).toLocaleDateString('en-IN')}
              </Text>
            </View>
            <View style={styles.claimItemRight}>
              <Text style={styles.claimItemAmount}>₹{reward.reward_amount.toLocaleString('en-IN')}</Text>
            </View>
          </View>
        ))
      )}
    </View>
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
    padding: 20,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
  },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  badge: {
    backgroundColor: '#2196F3',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  codeBox: {
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  referralCode: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2196F3',
    letterSpacing: 2,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#E3F2FD',
  },
  copyButtonText: {
    marginLeft: 4,
    fontSize: 12,
    color: '#2196F3',
    fontWeight: '600',
  },
  linkLabel: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
    marginTop: 12,
    marginBottom: 4,
  },
  linkText: {
    fontSize: 13,
    color: '#2196F3',
    fontFamily: 'monospace',
  },
  shareButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  shareButton: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  shareButtonText: {
    fontSize: 11,
    color: '#666',
    marginTop: 4,
    fontWeight: '600',
  },
  earningsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  earningsBox: {
    flex: 1,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 4,
  },
  earningsLabel: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
    marginBottom: 6,
  },
  earningsAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2196F3',
  },
  earningsAmountPending: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFA500',
  },
  earningsAmountClaimed: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4CAF50',
  },
  claimButton: {
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimButtonLoading: {
    opacity: 0.7,
  },
  claimButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
  },
  referralsSubtext: {
    fontSize: 13,
    color: '#666',
    marginBottom: 8,
  },
  viewHistoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  viewHistoryButtonText: {
    fontSize: 13,
    color: '#2196F3',
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 13,
    color: '#999',
    lineHeight: 20,
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
  listHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  historyItem: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  historyItemLeft: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  historyItemContent: {
    flex: 1,
  },
  historyItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  historyItemSubtitle: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  historyItemRight: {
    alignItems: 'flex-end',
  },
  historyItemAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4CAF50',
  },
  claimSummary: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  claimSummaryLabel: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  claimSummaryAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#4CAF50',
  },
  claimItem: {
    backgroundColor: '#fff',
    marginHorizontal: 12,
    marginVertical: 4,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  claimItemLeft: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  claimItemContent: {
    flex: 1,
  },
  claimItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  claimItemSubtitle: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  claimItemRight: {
    alignItems: 'flex-end',
  },
  claimItemAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4CAF50',
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
});

export default ReferralProgramScreen;
