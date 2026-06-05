import React, { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';

/**
 * RideStatsPanel - Display ride statistics and history insights
 */
const StatCard = ({ icon, title, value, subtitle, color = COLORS.primary }) => (
  <View style={[styles.statCard, SHADOWS.card, { borderTopColor: color, borderTopWidth: 3 }]}>
    <Text style={styles.statIcon}>{icon}</Text>
    <Text style={styles.statTitle}>{title}</Text>
    <Text style={[styles.statValue, { color }]}>{value}</Text>
    {subtitle && <Text style={styles.statSubtitle}>{subtitle}</Text>}
  </View>
);

export default function RideStatsPanel({ token }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timePeriod, setTimePeriod] = useState('month'); // month, quarter, year, all

  const fetchStats = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await apiRequest('/passengers/ride-stats', { token, params: { period: timePeriod } });
      setStats(data?.stats || {});
    } catch (err) {
      setError(err.message || 'Failed to load ride statistics');
    } finally {
      setLoading(false);
    }
  }, [token, timePeriod]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchStats().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchStats]);

  // Announce stats loaded for accessibility
  useEffect(() => {
    if (!loading && stats?.total_rides > 0) {
      AccessibilityInfo.announceForAccessibility(
        `Ride stats loaded. Total rides: ${stats.total_rides}, Total spent: ₹${Number(stats.total_spent || 0).toFixed(0)}`
      );
    }
  }, [loading, stats?.total_rides, stats?.total_spent]);

  const periodButtons = [
    { key: 'month', label: '📅 Month' },
    { key: 'quarter', label: '📊 Quarter' },
    { key: 'year', label: '📈 Year' },
    { key: 'all', label: '⏱️ All Time' },
  ];

  if (loading && !stats) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {error && <Text style={styles.errorText}>❌ {error}</Text>}

      {/* Time Period Selector */}
      <View style={styles.periodSelector}>
        {periodButtons.map((period) => (
          <TouchableOpacity
            key={period.key}
            style={[styles.periodButton, timePeriod === period.key && styles.periodButtonActive]}
            onPress={() => setTimePeriod(period.key)}
          >
            <Text
              style={[styles.periodButtonText, timePeriod === period.key && styles.periodButtonTextActive]}
            >
              {period.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Summary Stats */}
      <View style={styles.summaryGrid}>
        <StatCard
          icon="🚗"
          title="Total Rides"
          value={String(stats?.total_rides || 0)}
          subtitle={`${Math.round((stats?.avg_rating || 0) * 10) / 10}⭐ avg rating`}
          color="#2196F3"
        />
        <StatCard
          icon="💵"
          title="Total Spent"
          value={`₹${Number(stats?.total_spent || 0).toFixed(0)}`}
          subtitle={`₹${Number(stats?.avg_fare || 0).toFixed(0)} per ride`}
          color="#4CAF50"
        />
        <StatCard
          icon="📏"
          title="Distance"
          value={`${Number(stats?.total_distance_km || 0).toFixed(0)} km`}
          subtitle={`${Number(stats?.avg_distance_km || 0).toFixed(1)} km avg`}
          color="#FF9800"
        />
        <StatCard
          icon="⏱️"
          title="Time"
          value={`${Math.round(stats?.total_duration_hours || 0)}h`}
          subtitle={`${Math.round((stats?.avg_duration_minutes || 0))} min avg`}
          color="#9C27B0"
        />
      </View>

      {/* Top Drivers */}
      {stats?.top_drivers && stats.top_drivers.length > 0 && (
        <View style={[styles.section, SHADOWS.card]}>
          <Text style={styles.sectionTitle}>⭐ Top Rated Drivers</Text>
          {stats.top_drivers.slice(0, 5).map((driver, index) => (
            <View key={driver.driver_id || index} style={styles.driverRow}>
              <Text style={styles.driverRank}>#{index + 1}</Text>
              <View style={styles.driverInfo}>
                <Text style={styles.driverName}>{driver.driver_name}</Text>
                <Text style={styles.driverStats}>
                  {driver.ride_count} rides • {Math.round(driver.rating * 10) / 10}⭐
                </Text>
              </View>
              <Text style={styles.driverRating}>{Math.round(driver.rating * 10) / 10}⭐</Text>
            </View>
          ))}
        </View>
      )}

      {/* Ride Patterns */}
      {stats?.ride_patterns && (
        <View style={[styles.section, SHADOWS.card]}>
          <Text style={styles.sectionTitle}>📊 Ride Patterns</Text>
          
          {stats.ride_patterns.peak_day && (
            <View style={styles.patternItem}>
              <Text style={styles.patternLabel}>📅 Most Active Day</Text>
              <Text style={styles.patternValue}>{stats.ride_patterns.peak_day}</Text>
            </View>
          )}

          {stats.ride_patterns.peak_hour && (
            <View style={styles.patternItem}>
              <Text style={styles.patternLabel}>🕐 Peak Hour</Text>
              <Text style={styles.patternValue}>{stats.ride_patterns.peak_hour}:00</Text>
            </View>
          )}

          {stats.ride_patterns.favorite_route && (
            <View style={styles.patternItem}>
              <Text style={styles.patternLabel}>🗺️ Favorite Route</Text>
              <Text style={styles.patternValue} numberOfLines={1}>
                {stats.ride_patterns.favorite_route}
              </Text>
            </View>
          )}

          {stats.ride_patterns.preferred_vehicle_type && (
            <View style={styles.patternItem}>
              <Text style={styles.patternLabel}>🚗 Preferred Vehicle</Text>
              <Text style={styles.patternValue}>{stats.ride_patterns.preferred_vehicle_type}</Text>
            </View>
          )}
        </View>
      )}

      {/* Recent Achievements */}
      {stats?.achievements && stats.achievements.length > 0 && (
        <View style={[styles.section, SHADOWS.card]}>
          <Text style={styles.sectionTitle}>🏆 Achievements</Text>
          {stats.achievements.map((achievement, index) => (
            <View key={index} style={styles.achievementItem}>
              <Text style={styles.achievementIcon}>{achievement.icon || '🎯'}</Text>
              <View style={styles.achievementInfo}>
                <Text style={styles.achievementTitle}>{achievement.title}</Text>
                <Text style={styles.achievementDesc}>{achievement.description}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Savings & Rewards */}
      {stats?.savings_and_rewards && (
        <View style={[styles.section, SHADOWS.card]}>
          <Text style={styles.sectionTitle}>💰 Savings & Rewards</Text>
          
          {stats.savings_and_rewards.total_savings > 0 && (
            <View style={styles.rewardItem}>
              <Text style={styles.rewardLabel}>💸 Total Savings</Text>
              <Text style={styles.rewardValue}>₹{Number(stats.savings_and_rewards.total_savings).toFixed(0)}</Text>
            </View>
          )}

          {stats.savings_and_rewards.promo_discounts > 0 && (
            <View style={styles.rewardItem}>
              <Text style={styles.rewardLabel}>🎟️ Promo Discounts</Text>
              <Text style={styles.rewardValue}>₹{Number(stats.savings_and_rewards.promo_discounts).toFixed(0)}</Text>
            </View>
          )}

          {stats.savings_and_rewards.loyalty_points > 0 && (
            <View style={styles.rewardItem}>
              <Text style={styles.rewardLabel}>⭐ Loyalty Points</Text>
              <Text style={styles.rewardValue}>{Number(stats.savings_and_rewards.loyalty_points).toFixed(0)}</Text>
            </View>
          )}
        </View>
      )}

      {/* Insights */}
      {stats?.insights && stats.insights.length > 0 && (
        <View style={[styles.insightsSection, SHADOWS.card]}>
          <Text style={styles.sectionTitle}>💡 Insights</Text>
          {stats.insights.map((insight, index) => (
            <View key={index} style={styles.insightItem}>
              <Text style={styles.insightIcon}>→</Text>
              <Text style={styles.insightText}>{insight}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 12 },
  errorText: { color: '#F44336', fontSize: 12, marginBottom: 12, fontWeight: '600', padding: 8, backgroundColor: '#FFEBEE', borderRadius: 4 },
  periodSelector: { flexDirection: 'row', marginBottom: 16, gap: 8, justifyContent: 'space-between' },
  periodButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    backgroundColor: COLORS.cardBackground,
  },
  periodButtonActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  periodButtonText: { fontSize: 11, fontWeight: '600', color: COLORS.text },
  periodButtonTextActive: { color: '#FFFFFF' },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  statCard: {
    width: '48%',
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
  },
  statIcon: { fontSize: 32, marginBottom: 8 },
  statTitle: { fontSize: 12, color: COLORS.textMuted, marginBottom: 6, textAlign: 'center' },
  statValue: { fontSize: 18, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' },
  statSubtitle: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center' },
  section: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: COLORS.text, marginBottom: 12 },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  driverRank: { fontSize: 14, fontWeight: 'bold', color: COLORS.primary, marginRight: 12, minWidth: 30 },
  driverInfo: { flex: 1 },
  driverName: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 2 },
  driverStats: { fontSize: 11, color: COLORS.textMuted },
  driverRating: { fontSize: 12, fontWeight: 'bold', color: '#FF9800' },
  patternItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  patternLabel: { fontSize: 13, color: COLORS.text },
  patternValue: { fontSize: 13, fontWeight: 'bold', color: COLORS.primary, maxWidth: '50%' },
  achievementItem: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  achievementIcon: { fontSize: 24, marginRight: 12 },
  achievementInfo: { flex: 1 },
  achievementTitle: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 2 },
  achievementDesc: { fontSize: 11, color: COLORS.textMuted },
  rewardItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rewardLabel: { fontSize: 13, color: COLORS.text },
  rewardValue: { fontSize: 14, fontWeight: 'bold', color: '#4CAF50' },
  insightsSection: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  insightItem: {
    flexDirection: 'row',
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  insightIcon: { fontSize: 16, fontWeight: 'bold', color: '#1976D2', marginRight: 8, marginTop: 1 },
  insightText: { flex: 1, fontSize: 12, color: COLORS.text, lineHeight: 18 },
});
