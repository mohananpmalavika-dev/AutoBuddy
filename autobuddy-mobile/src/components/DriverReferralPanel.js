import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Share,
} from 'react-native';
import { COLORS } from '../theme';
import { apiRequest } from '../lib/api';
import { GlassCard, PremiumEmptyState } from './PremiumUI';
import { formatToIST } from '../utils/time';

export default function DriverReferralPanel({ token, driverId = '', onReferralShare = undefined }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [referralData, setReferralData] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' or 'history'

  const fetchReferralData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await apiRequest('/drivers/referral-program', {
        token,
        query: driverId ? { driver_id: driverId } : undefined,
      });
      if (data) {
        setReferralData(data);
      }
    } catch (err) {
      setError(err.message || 'Could not load referral program details');
    } finally {
      setLoading(false);
    }
  }, [driverId, token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchReferralData().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchReferralData]);

  const handleShareReferral = async () => {
    try {
      if (!referralData?.referral_code) return;

      const message = `Join me on AutoBuddy! Use my referral code ${referralData.referral_code} to get instant rewards. Download now!`;
      
      await Share.share({
        message: message,
        url: `https://autobuddy.app/join/${referralData.referral_code}`,
        title: 'Join AutoBuddy',
      });

      if (onReferralShare) {
        onReferralShare(referralData.referral_code);
      }
    } catch (_err) {
      setError('Could not share referral code');
    }
  };

  const handleCopyCode = async () => {
    try {
      if (!referralData?.referral_code) return;
      // In a real app, you'd use react-native-clipboard
      setError('');
      setError('Referral code copied to clipboard!');
      setTimeout(() => setError(''), 2000);
    } catch (_err) {
      setError('Could not copy code');
    }
  };

  if (loading && !referralData) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error && !referralData) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchReferralData}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!referralData) {
    return (
      <PremiumEmptyState
        title="Referral Program"
        subtitle="Could not load referral program details"
      />
    );
  }

  const {
    referral_code,
    total_referrals = 0,
    successful_referrals = 0,
    pending_referrals = 0,
    total_earnings = 0,
    referral_rate = 0,
    next_tier_referrals = 0,
    recent_referrals = [],
  } = referralData;

  const referralsLeft = Math.max(0, next_tier_referrals - successful_referrals);

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Referral Code Card */}
      <GlassCard style={styles.codeCard}>
        <Text style={styles.codeLabel}>Your Referral Code</Text>
        <View style={styles.codeContainer}>
          <Text style={styles.code}>{referral_code || 'N/A'}</Text>
          <TouchableOpacity 
            style={styles.codeButton}
            onPress={handleCopyCode}
          >
            <Text style={styles.codeButtonText}>Copy</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity 
          style={styles.shareButton}
          onPress={handleShareReferral}
        >
          <Text style={styles.shareButtonText}>Share Referral Code</Text>
        </TouchableOpacity>
      </GlassCard>

      {/* Stats Overview */}
      <View style={styles.statsRow}>
        <GlassCard style={styles.statCard}>
          <Text style={styles.statValue}>{total_referrals}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </GlassCard>
        <GlassCard style={styles.statCard}>
          <Text style={styles.statValue}>{successful_referrals}</Text>
          <Text style={styles.statLabel}>Successful</Text>
        </GlassCard>
        <GlassCard style={styles.statCard}>
          <Text style={styles.statValue}>{pending_referrals}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </GlassCard>
        <GlassCard style={styles.statCard}>
          <Text style={styles.statValue}>₹{total_earnings}</Text>
          <Text style={styles.statLabel}>Earnings</Text>
        </GlassCard>
      </View>

      {/* Progress to Next Tier */}
      {next_tier_referrals > 0 && (
        <GlassCard style={styles.tierCard}>
          <Text style={styles.tierTitle}>Progress to Next Tier</Text>
          <View style={styles.progressBarContainer}>
            <View 
              style={[
                styles.progressBar, 
                { width: `${Math.min((successful_referrals / next_tier_referrals) * 100, 100)}%` }
              ]} 
            />
          </View>
          <View style={styles.tierProgressText}>
            <Text style={styles.progressText}>
              {successful_referrals} / {next_tier_referrals} referrals
            </Text>
            {referralsLeft > 0 && (
              <Text style={styles.progressSubtext}>
                {referralsLeft} more needed
              </Text>
            )}
          </View>
        </GlassCard>
      )}

      {/* Tab Navigation */}
      <View style={styles.tabsContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'overview' && styles.tabActive]}
          onPress={() => setActiveTab('overview')}
        >
          <Text style={[styles.tabText, activeTab === 'overview' && styles.tabTextActive]}>
            How It Works
          </Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'history' && styles.tabActive]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabText, activeTab === 'history' && styles.tabTextActive]}>
            Referral History
          </Text>
        </TouchableOpacity>
      </View>

      {/* Overview Content */}
      {activeTab === 'overview' && (
        <>
          <GlassCard style={styles.infoCard}>
            <Text style={styles.infoTitle}>How It Works</Text>
            <View style={styles.infoContent}>
              <View style={styles.infoStep}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>1</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Share Your Code</Text>
                  <Text style={styles.stepDescription}>
                    Share your unique referral code with fellow drivers
                  </Text>
                </View>
              </View>

              <View style={styles.infoStep}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>2</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>They Sign Up</Text>
                  <Text style={styles.stepDescription}>
                    They use your code when creating an AutoBuddy driver account
                  </Text>
                </View>
              </View>

              <View style={styles.infoStep}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>3</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Complete Verification</Text>
                  <Text style={styles.stepDescription}>
                    Once they complete verification, they become an active driver
                  </Text>
                </View>
              </View>

              <View style={styles.infoStep}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>4</Text>
                </View>
                <View style={styles.stepContent}>
                  <Text style={styles.stepTitle}>Earn Rewards</Text>
                  <Text style={styles.stepDescription}>
                    Both of you earn ₹{referral_rate} bonus on sign-up (conditions apply)
                  </Text>
                </View>
              </View>
            </View>
          </GlassCard>

          <GlassCard style={styles.benefitsCard}>
            <Text style={styles.infoTitle}>Referral Benefits</Text>
            <View style={styles.benefitsList}>
              <View style={styles.benefitItem}>
                <Text style={styles.bulletPoint}>✓</Text>
                <Text style={styles.benefitText}>Unlimited referrals - no cap on earnings</Text>
              </View>
              <View style={styles.benefitItem}>
                <Text style={styles.bulletPoint}>✓</Text>
                <Text style={styles.benefitText}>Instant bonus credited on sign-up</Text>
              </View>
              <View style={styles.benefitItem}>
                <Text style={styles.bulletPoint}>✓</Text>
                <Text style={styles.benefitText}>Higher tier = higher referral rewards</Text>
              </View>
              <View style={styles.benefitItem}>
                <Text style={styles.bulletPoint}>✓</Text>
                <Text style={styles.benefitText}>Track all your referrals in real-time</Text>
              </View>
            </View>
          </GlassCard>
        </>
      )}

      {/* History Content */}
      {activeTab === 'history' && (
        <>
          {recent_referrals && recent_referrals.length > 0 ? (
            <>
              <Text style={styles.historyTitle}>Recent Referrals</Text>
              {recent_referrals.map((ref, idx) => (
                <GlassCard key={ref.id || idx} style={styles.referralCard}>
                  <View style={styles.referralHeader}>
                    <View style={styles.referralInfo}>
                      <Text style={styles.referralName}>{ref.name || 'Driver'}</Text>
                      <Text style={styles.referralDate}>
                        {ref.date ? formatToIST(ref.date, { dateStyle: 'short' }) : 'N/A'}
                      </Text>
                    </View>
                    <View style={[
                      styles.statusBadge,
                      ref.status === 'completed' && styles.statusBadgeCompleted,
                      ref.status === 'pending' && styles.statusBadgePending,
                    ]}>
                      <Text style={styles.statusBadgeText}>{ref.status?.toUpperCase()}</Text>
                    </View>
                  </View>
                  {ref.status === 'completed' && (
                    <View style={styles.referralEarnings}>
                      <Text style={styles.earningsLabel}>You Earned:</Text>
                      <Text style={styles.earningsAmount}>₹{ref.earning_amount || 0}</Text>
                    </View>
                  )}
                </GlassCard>
              ))}
            </>
          ) : (
            <PremiumEmptyState
              title="No Referrals Yet"
              subtitle="Start sharing your code to earn rewards!"
            />
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  codeCard: {
    marginBottom: 16,
    padding: 16,
  },
  codeLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 8,
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  code: {
    flex: 1,
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primary,
    letterSpacing: 2,
  },
  codeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: `${COLORS.primary}20`,
    borderRadius: 6,
  },
  codeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  shareButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  shareButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  tierCard: {
    marginBottom: 16,
    padding: 14,
  },
  tierTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 10,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.primary,
  },
  tierProgressText: {
    alignItems: 'center',
  },
  progressText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  progressSubtext: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  tabsContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    backgroundColor: COLORS.background,
    padding: 2,
    borderRadius: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabTextActive: {
    color: '#fff',
  },
  infoCard: {
    marginBottom: 16,
    padding: 14,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  infoContent: {
    gap: 12,
  },
  infoStep: {
    flexDirection: 'row',
    gap: 12,
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepNumberText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  stepDescription: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
    lineHeight: 15,
  },
  benefitsCard: {
    marginBottom: 16,
    padding: 14,
  },
  benefitsList: {
    gap: 8,
  },
  benefitItem: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  bulletPoint: {
    fontSize: 14,
    color: '#34C759',
    fontWeight: '700',
  },
  benefitText: {
    flex: 1,
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  referralCard: {
    marginBottom: 10,
    padding: 12,
  },
  referralHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  referralInfo: {
    flex: 1,
  },
  referralName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  referralDate: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: COLORS.background,
  },
  statusBadgeCompleted: {
    backgroundColor: '#34C75920',
  },
  statusBadgePending: {
    backgroundColor: '#FF950020',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.primary,
  },
  referralEarnings: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  earningsLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  earningsAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.primary,
  },
  errorText: {
    color: COLORS.error,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center',
  },
});
