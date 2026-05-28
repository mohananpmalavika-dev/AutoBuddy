import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { useGamificationBadges } from '../hooks/useGamificationBadges';
import { theme } from '../theme';

export function BadgesAchievementsWidget({ isVisible, onClose, token, driverId }) {
  const { earnedBadges, inProgressBadges, leaderboard, loadEarnedBadges, loadBadgeProgress, loadLeaderboard, getTotalBadgeCount, getBadgeCompletionPercentage } = useGamificationBadges({ token, driverId });
  const [activeTab, setActiveTab] = useState('earned'); // earned, progress, leaderboard
  const [selectedBadge, setSelectedBadge] = useState(null);

  useEffect(() => {
    if (isVisible) {
      loadEarnedBadges();
      loadBadgeProgress();
      loadLeaderboard();
    }
  }, [isVisible, loadEarnedBadges, loadBadgeProgress, loadLeaderboard]);

  const totalBadges = getTotalBadgeCount();
  const completionPercentage = getBadgeCompletionPercentage();

  const badgeIcons = {
    safety: 'S',
    performance: 'P',
    consistency: 'C',
    customer_service: 'CS',
    milestone: 'M',
  };

  return (
    <Modal visible={isVisible} animationType="slide" transparent>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Achievements</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Progress Overview */}
        <View style={styles.progressSection}>
          <View style={styles.progressCard}>
            <Text style={styles.progressLabel}>Badge Collection</Text>
            <Text style={styles.progressValue}>{totalBadges} / 12</Text>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${completionPercentage}%` }]} />
            </View>
            <Text style={styles.progressPercentage}>{completionPercentage}% Complete</Text>
          </View>
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabNav}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'earned' && styles.tabActive]}
            onPress={() => setActiveTab('earned')}
          >
            <Text style={[styles.tabText, activeTab === 'earned' && styles.tabTextActive]}>
              Earned ({earnedBadges.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'progress' && styles.tabActive]}
            onPress={() => setActiveTab('progress')}
          >
            <Text style={[styles.tabText, activeTab === 'progress' && styles.tabTextActive]}>
              In Progress ({inProgressBadges.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'leaderboard' && styles.tabActive]}
            onPress={() => setActiveTab('leaderboard')}
          >
            <Text style={[styles.tabText, activeTab === 'leaderboard' && styles.tabTextActive]}>
              Leaderboard
            </Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          {/* Earned Badges Tab */}
          {activeTab === 'earned' && (
            <View>
              {earnedBadges.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No badges earned yet</Text>
                  <Text style={styles.emptySubtext}>Complete driver activities to earn badges</Text>
                </View>
              ) : (
                <View style={styles.badgeGrid}>
                  {earnedBadges.map((badge, index) => (
                    <TouchableOpacity
                      key={index}
                      style={styles.badgeCard}
                      onPress={() => setSelectedBadge(badge)}
                    >
                      <Text style={styles.badgeIcon}>{badgeIcons[badge.badge_type] || 'B'}</Text>
                      <Text style={styles.badgeName}>{badge.badge_name}</Text>
                      <Text style={styles.badgeDate}>
                        {new Date(badge.earned_at).toLocaleDateString()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* In Progress Badges Tab */}
          {activeTab === 'progress' && (
            <View>
              {inProgressBadges.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>All badges unlocked!</Text>
                  <Text style={styles.emptySubtext}>You have completed all badge requirements</Text>
                </View>
              ) : (
                <View style={styles.progressList}>
                  {inProgressBadges.map((badge, index) => (
                    <View key={index} style={styles.progressCard2}>
                      <View style={styles.progressHeader}>
                        <View>
                          <Text style={styles.progressBadgeName}>
                            {badgeIcons[badge.badge_type] || 'B'} {badge.badge_name}
                          </Text>
                          <Text style={styles.progressDescription}>{badge.description}</Text>
                        </View>
                      </View>
                      <View style={styles.progressMeter}>
                        <View style={styles.progressMeterLabel}>
                          <Text style={styles.progressMeterText}>{badge.progress.toFixed(0)}%</Text>
                        </View>
                        <View style={styles.progressMeterBar}>
                          <View style={[styles.progressMeterFill, { width: `${badge.progress}%` }]} />
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Leaderboard Tab */}
          {activeTab === 'leaderboard' && (
            <View>
              {leaderboard.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>Loading leaderboard...</Text>
                </View>
              ) : (
                <View style={styles.leaderboardList}>
                  {leaderboard.map((entry, index) => (
                    <View key={index} style={[styles.leaderboardRow, index === 0 && styles.leaderboardRowFirst]}>
                      <View style={styles.leaderboardRank}>
                        <Text style={styles.leaderboardRankText}>
                          {index === 0 ? '#1' : index === 1 ? '#2' : index === 2 ? '#3' : `#${entry.rank}`}
                        </Text>
                      </View>
                      <View style={styles.leaderboardInfo}>
                        <Text style={styles.leaderboardName}>{entry.driver_name}</Text>
                        <Text style={styles.leaderboardBadges}>{entry.total_badges} badges earned</Text>
                      </View>
                      <View style={styles.leaderboardBadgeCount}>
                        <Text style={styles.leaderboardBadgeCountText}>{entry.total_badges}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}
        </ScrollView>

        {/* Badge Detail Modal */}
        {selectedBadge && (
          <Modal visible={selectedBadge !== null} animationType="slide" transparent>
            <View style={styles.detailContainer}>
              <View style={styles.detailHeader}>
                <TouchableOpacity onPress={() => setSelectedBadge(null)}>
                  <Text style={styles.detailBackText}>Back</Text>
                </TouchableOpacity>
                <Text style={styles.detailTitle}>Badge Details</Text>
                <View style={{ width: 60 }} />
              </View>

              <View style={styles.detailContent}>
                <View style={styles.detailCard}>
                  <Text style={styles.detailBadgeIcon}>{badgeIcons[selectedBadge.badge_type] || 'B'}</Text>
                  <Text style={styles.detailBadgeName}>{selectedBadge.badge_name}</Text>
                  <Text style={styles.detailBadgeType}>{selectedBadge.badge_type}</Text>

                  <View style={styles.detailStats}>
                    <View style={styles.detailStat}>
                      <Text style={styles.detailStatLabel}>Earned On</Text>
                      <Text style={styles.detailStatValue}>
                        {new Date(selectedBadge.earned_at).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </Text>
                    </View>
                    <View style={styles.detailStat}>
                      <Text style={styles.detailStatLabel}>Reward Points</Text>
                      <Text style={styles.detailStatValue}>{selectedBadge.reward_points || 0} pts</Text>
                    </View>
                    <View style={styles.detailStat}>
                      <Text style={styles.detailStatLabel}>Bonus Earnings</Text>
                      <Text style={styles.detailStatValue}>Rs. {selectedBadge.reward_bonus || 0}</Text>
                    </View>
                  </View>

                  <View style={styles.detailDescription}>
                    <Text style={styles.detailDescriptionText}>
                      This achievement recognizes your dedication and excellence as a driver.
                      Keep up the great work to earn more badges and rewards!
                    </Text>
                  </View>

                  <TouchableOpacity style={styles.shareButton}>
                    <Text style={styles.shareButtonText}>Share Achievement</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.COLORS.BACKGROUND,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.COLORS.LIGHT_GRAY,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.COLORS.TEXT,
  },
  backButton: {
    padding: 8,
  },
  backText: {
    fontSize: 14,
    color: theme.COLORS.PRIMARY,
    fontWeight: '500',
  },
  progressSection: {
    padding: 16,
    backgroundColor: 'white',
  },
  progressCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: theme.COLORS.LIGHT_GRAY,
  },
  progressLabel: {
    fontSize: 13,
    color: theme.COLORS.TEXT_SECONDARY,
    marginBottom: 4,
  },
  progressValue: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.COLORS.PRIMARY,
    marginBottom: 8,
  },
  progressBar: {
    height: 8,
    backgroundColor: theme.COLORS.LIGHT_GRAY,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.COLORS.SUCCESS,
  },
  progressPercentage: {
    fontSize: 12,
    color: theme.COLORS.TEXT_SECONDARY,
  },
  tabNav: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: theme.COLORS.LIGHT_GRAY,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: theme.COLORS.PRIMARY,
  },
  tabText: {
    fontSize: 12,
    color: theme.COLORS.TEXT_SECONDARY,
    fontWeight: '500',
  },
  tabTextActive: {
    color: theme.COLORS.PRIMARY,
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  badgeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  badgeCard: {
    width: '30%',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    ...theme.SHADOWS.small,
  },
  badgeIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  badgeName: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.COLORS.TEXT,
    textAlign: 'center',
    marginBottom: 4,
  },
  badgeDate: {
    fontSize: 9,
    color: theme.COLORS.TEXT_SECONDARY,
  },
  progressList: {
    marginBottom: 20,
  },
  progressCard2: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    ...theme.SHADOWS.small,
  },
  progressHeader: {
    marginBottom: 10,
  },
  progressBadgeName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.COLORS.TEXT,
    marginBottom: 4,
  },
  progressDescription: {
    fontSize: 12,
    color: theme.COLORS.TEXT_SECONDARY,
  },
  progressMeter: {
    gap: 8,
  },
  progressMeterLabel: {
    alignItems: 'flex-end',
  },
  progressMeterText: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.COLORS.PRIMARY,
  },
  progressMeterBar: {
    height: 6,
    backgroundColor: theme.COLORS.LIGHT_GRAY,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressMeterFill: {
    height: '100%',
    backgroundColor: theme.COLORS.PRIMARY,
  },
  leaderboardList: {
    marginBottom: 20,
  },
  leaderboardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    ...theme.SHADOWS.small,
  },
  leaderboardRowFirst: {
    backgroundColor: '#FFFBEA',
    borderLeftWidth: 4,
    borderLeftColor: '#FFB800',
  },
  leaderboardRank: {
    marginRight: 12,
  },
  leaderboardRankText: {
    fontSize: 24,
  },
  leaderboardInfo: {
    flex: 1,
  },
  leaderboardName: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.COLORS.TEXT,
    marginBottom: 2,
  },
  leaderboardBadges: {
    fontSize: 12,
    color: theme.COLORS.TEXT_SECONDARY,
  },
  leaderboardBadgeCount: {
    backgroundColor: theme.COLORS.PRIMARY,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  leaderboardBadgeCountText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 50,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.COLORS.TEXT,
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 13,
    color: theme.COLORS.TEXT_SECONDARY,
  },
  detailContainer: {
    flex: 1,
    backgroundColor: theme.COLORS.BACKGROUND,
  },
  detailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.COLORS.LIGHT_GRAY,
  },
  detailBackText: {
    fontSize: 14,
    color: theme.COLORS.PRIMARY,
    fontWeight: '500',
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.COLORS.TEXT,
  },
  detailContent: {
    flex: 1,
    padding: 16,
    justifyContent: 'center',
  },
  detailCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    ...theme.SHADOWS.small,
  },
  detailBadgeIcon: {
    fontSize: 80,
    marginBottom: 16,
  },
  detailBadgeName: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.COLORS.TEXT,
    marginBottom: 4,
  },
  detailBadgeType: {
    fontSize: 13,
    color: theme.COLORS.TEXT_SECONDARY,
    textTransform: 'capitalize',
    marginBottom: 20,
  },
  detailStats: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.COLORS.LIGHT_GRAY,
  },
  detailStat: {
    alignItems: 'center',
  },
  detailStatLabel: {
    fontSize: 11,
    color: theme.COLORS.TEXT_SECONDARY,
    marginBottom: 4,
  },
  detailStatValue: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.COLORS.PRIMARY,
  },
  detailDescription: {
    marginBottom: 20,
  },
  detailDescriptionText: {
    fontSize: 13,
    color: theme.COLORS.TEXT,
    textAlign: 'center',
    lineHeight: 20,
  },
  shareButton: {
    width: '100%',
    backgroundColor: theme.COLORS.PRIMARY,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  shareButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
});
