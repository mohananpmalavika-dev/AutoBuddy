import React, { useMemo } from 'react';
import { View, Text, ScrollView } from 'react-native';

/**
 * Driver Performance Dashboard
 * Displays key metrics: acceptance rate, cancellation rate, on-time delivery, ratings
 * 
 * Props:
 *   - stats: {
 *       acceptanceRate: number (0-100),
 *       cancellationRate: number (0-100),
 *       onTimePercentage: number (0-100),
 *       completionRate: number (0-100),
 *       averageRating: number (1-5),
 *       rideCount: number,
 *       earningsToday: number,
 *     }
 *   - comparison: object - for comparing with platform average
 */
export default function DriverPerformanceDashboard({
  stats = {
    acceptanceRate: 95,
    cancellationRate: 2,
    onTimePercentage: 98,
    completionRate: 97,
    averageRating: 4.8,
    rideCount: 45,
    earningsToday: 2850,
  },
  comparison = {
    avgAcceptanceRate: 92,
    avgCancellationRate: 5,
    avgOnTimePercentage: 94,
  },
}) {
  // Performance tier based on metrics
  const performanceTier = useMemo(() => {
    const avg = (stats.acceptanceRate + stats.onTimePercentage + stats.completionRate) / 3;
    if (avg >= 98) return 'Diamond';
    if (avg >= 95) return 'Platinum';
    if (avg >= 90) return 'Gold';
    if (avg >= 85) return 'Silver';
    return 'Bronze';
  }, [stats]);

  const getTierColor = (tier) => {
    switch (tier) {
      case 'Diamond':
        return '#00BCD4';
      case 'Platinum':
        return '#9C27B0';
      case 'Gold':
        return '#FFC107';
      case 'Silver':
        return '#9E9E9E';
      default:
        return '#FF9800';
    }
  };

  const getMetricStatus = (value, threshold) => {
    if (value >= threshold) return { status: 'Good', color: '#4CAF50', icon: '✓' };
    if (value >= threshold - 5) return { status: 'Fair', color: '#FF9800', icon: '−' };
    return { status: 'Poor', color: '#F44336', icon: '✗' };
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Performance Tier Badge */}
      <View style={[styles.tierCard, { borderColor: getTierColor(performanceTier) }]}>
        <View style={[styles.tierBadge, { backgroundColor: getTierColor(performanceTier) }]}>
          <Text style={styles.tierLabel}>{performanceTier}</Text>
          <Text style={styles.tierEmoji}>
            {performanceTier === 'Diamond'
              ? '💎'
              : performanceTier === 'Platinum'
                ? '🥈'
                : performanceTier === 'Gold'
                  ? '🥇'
                  : performanceTier === 'Silver'
                    ? '🔶'
                    : '🔷'}
          </Text>
        </View>
        <View style={styles.tierContent}>
          <Text style={styles.tierTitle}>You are a {performanceTier} Driver!</Text>
          <Text style={styles.tierDescription}>
            Keep up the excellent performance to maintain your tier
          </Text>
        </View>
      </View>

      {/* Key Metrics Grid */}
      <View style={styles.metricsGrid}>
        {/* Acceptance Rate */}
        <MetricCard
          title="Acceptance Rate"
          value={stats.acceptanceRate}
          unit="%"
          comparison={comparison.avgAcceptanceRate}
          comparisonText={`Platform Avg: ${comparison.avgAcceptanceRate}%`}
          threshold={90}
          status={getMetricStatus(stats.acceptanceRate, 90)}
        />

        {/* Cancellation Rate */}
        <MetricCard
          title="Cancellation Rate"
          value={stats.cancellationRate}
          unit="%"
          comparison={comparison.avgCancellationRate}
          comparisonText={`Platform Avg: ${comparison.avgCancellationRate}%`}
          threshold={5}
          isInverse={true}
          status={getMetricStatus(100 - stats.cancellationRate, 95)}
        />

        {/* On-Time Delivery */}
        <MetricCard
          title="On-Time Delivery"
          value={stats.onTimePercentage}
          unit="%"
          comparison={comparison.avgOnTimePercentage}
          comparisonText={`Platform Avg: ${comparison.avgOnTimePercentage}%`}
          threshold={94}
          status={getMetricStatus(stats.onTimePercentage, 94)}
        />

        {/* Completion Rate */}
        <MetricCard
          title="Completion Rate"
          value={stats.completionRate}
          unit="%"
          comparison={null}
          threshold={95}
          status={getMetricStatus(stats.completionRate, 95)}
        />
      </View>

      {/* Rating Section */}
      <View style={styles.ratingCard}>
        <View style={styles.ratingContent}>
          <Text style={styles.ratingLabel}>Average Rating</Text>
          <View style={styles.ratingScore}>
            <Text style={styles.ratingNumber}>{stats.averageRating.toFixed(1)}</Text>
            <Text style={styles.ratingStars}>
              {'⭐'.repeat(Math.round(stats.averageRating))}
            </Text>
          </View>
          <Text style={styles.ratingBased}>Based on {stats.rideCount} rides</Text>
        </View>
        <View style={styles.ratingBar}>
          <View
            style={[
              styles.ratingBarFill,
              { width: `${(stats.averageRating / 5) * 100}%` },
            ]}
          />
        </View>
      </View>

      {/* Today's Stats */}
      <View style={styles.todayStatsCard}>
        <Text style={styles.todayTitle}>Today Stats</Text>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>Rides Completed</Text>
          <Text style={styles.statValue}>{stats.rideCount}</Text>
        </View>
        <View style={[styles.statRow, { borderBottomWidth: 0 }]}>
          <Text style={styles.statLabel}>Earnings</Text>
          <Text style={styles.statValue}>₹{stats.earningsToday.toLocaleString()}</Text>
        </View>
      </View>

      {/* Performance Tips */}
      <View style={styles.tipsCard}>
        <Text style={styles.tipsTitle}>📈 Tips to Improve:</Text>
        <Text style={styles.tip}>
          • Accept more requests to boost your acceptance rate
        </Text>
        <Text style={styles.tip}>
          • Avoid cancellations after accepting rides
        </Text>
        <Text style={styles.tip}>
          • Maintain good GPS signal for accurate navigation
        </Text>
        <Text style={styles.tip}>
          • Communicate with passengers about estimated arrival
        </Text>
        <Text style={styles.tip}>
          • Keep your vehicle clean and comfortable
        </Text>
      </View>

      {/* Performance History Chart Placeholder */}
      <View style={styles.chartCard}>
        <Text style={styles.chartTitle}>Performance Trends (7 Days)</Text>
        <Text style={styles.chartPlaceholder}>
          📊 Detailed charts coming soon in next update
        </Text>
        <View style={styles.chartMini}>
          <View style={[styles.chartBar, { height: '85%' }]} />
          <View style={[styles.chartBar, { height: '90%' }]} />
          <View style={[styles.chartBar, { height: '92%' }]} />
          <View style={[styles.chartBar, { height: '88%' }]} />
          <View style={[styles.chartBar, { height: '95%' }]} />
          <View style={[styles.chartBar, { height: '97%' }]} />
          <View style={[styles.chartBar, { height: '96%' }]} />
        </View>
      </View>

      {/* Rewards/Incentives */}
      <View style={styles.rewardsCard}>
        <Text style={styles.rewardsTitle}>🎁 Earn Rewards</Text>
        <View style={styles.rewardItem}>
          <Text style={styles.rewardText}>
            Maintain 95%+ acceptance rate → ₹500 bonus
          </Text>
          <Text style={styles.rewardStatus}>
            {stats.acceptanceRate >= 95 ? '✓ Earned' : `${stats.acceptanceRate}% (need ${95 - stats.acceptanceRate}%)`}
          </Text>
        </View>
        <View style={styles.rewardItem}>
          <Text style={styles.rewardText}>
            Complete 50+ rides this month → Free premium features
          </Text>
          <Text style={styles.rewardStatus}>
            {stats.rideCount * 30 >= 50 ? '✓ Eligible' : `${stats.rideCount * 30} rides (need ${50 - (stats.rideCount * 30)})`}
          </Text>
        </View>
        <View style={styles.rewardItem}>
          <Text style={styles.rewardText}>
            Achieve 4.8+ rating → Priority ride allocation
          </Text>
          <Text style={styles.rewardStatus}>
            {stats.averageRating >= 4.8 ? '✓ Active' : `${stats.averageRating.toFixed(1)} (need ${(4.8 - stats.averageRating).toFixed(1)})`}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function MetricCard({
  title,
  value,
  unit,
  comparison,
  comparisonText,
  threshold,
  isInverse = false,
  status,
}) {
  const displayStatus = isInverse ? getMetricStatus(100 - value, 100 - threshold) : status;

  return (
    <View style={[styles.metricCard, { borderLeftColor: displayStatus.color }]}>
      <Text style={styles.metricTitle}>{title}</Text>
      <View style={styles.metricValue}>
        <Text style={[styles.metricNumber, { color: displayStatus.color }]}>
          {value}
        </Text>
        <Text style={styles.metricUnit}>{unit}</Text>
      </View>
      <Text style={[styles.metricStatus, { color: displayStatus.color }]}>
        {displayStatus.icon} {displayStatus.status}
      </Text>
      {comparison !== null && (
        <Text style={styles.comparisonText}>{comparisonText}</Text>
      )}
    </View>
  );
}

function getMetricStatus(value, threshold) {
  if (value >= threshold) return { status: 'Good', color: '#4CAF50', icon: '✓' };
  if (value >= threshold - 5) return { status: 'Fair', color: '#FF9800', icon: '−' };
  return { status: 'Poor', color: '#F44336', icon: '✗' };
}

const styles = {
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    padding: 16,
  },
  tierCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 2,
    padding: 16,
    marginBottom: 20,
    gap: 16,
  },
  tierBadge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tierLabel: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 12,
  },
  tierEmoji: {
    fontSize: 32,
  },
  tierContent: {
    flex: 1,
  },
  tierTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 4,
  },
  tierDescription: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderLeftWidth: 4,
    padding: 12,
  },
  metricTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  metricValue: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  metricNumber: {
    fontSize: 28,
    fontWeight: '700',
  },
  metricUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginLeft: 4,
  },
  metricStatus: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  comparisonText: {
    fontSize: 10,
    color: '#999',
    fontWeight: '500',
  },
  ratingCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  ratingContent: {
    marginBottom: 12,
  },
  ratingLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  ratingScore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  ratingNumber: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFC107',
  },
  ratingStars: {
    fontSize: 18,
  },
  ratingBased: {
    fontSize: 11,
    color: '#999',
    fontWeight: '500',
  },
  ratingBar: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  ratingBarFill: {
    height: '100%',
    backgroundColor: '#FFC107',
  },
  todayStatsCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  todayTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  statValue: {
    fontSize: 14,
    color: '#212121',
    fontWeight: '700',
  },
  tipsCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
    padding: 16,
    marginBottom: 20,
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 12,
  },
  tip: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
    marginBottom: 6,
    lineHeight: 18,
  },
  chartCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 8,
  },
  chartPlaceholder: {
    fontSize: 12,
    color: '#999',
    fontWeight: '500',
    marginBottom: 16,
  },
  chartMini: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 100,
  },
  chartBar: {
    width: 12,
    backgroundColor: '#2196F3',
    borderRadius: 6,
  },
  rewardsCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FFC107',
    padding: 16,
    marginBottom: 20,
  },
  rewardsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#F57F17',
    marginBottom: 12,
  },
  rewardItem: {
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#FFE082',
  },
  rewardText: {
    fontSize: 12,
    color: '#F57F17',
    fontWeight: '600',
    marginBottom: 4,
  },
  rewardStatus: {
    fontSize: 11,
    color: '#FFA000',
    fontWeight: '500',
  },
};
