import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Dimensions,
  FlatList
} from 'react-native';
import { useDriverTier } from '../hooks/useDriverTier';

const { width } = Dimensions.get('window');

// ==================== TIER DASHBOARD WIDGET ====================

export const TierDashboardWidget: React.FC<{
  driverId: string;
  authToken: string;
  onPress?: () => void;
}> = ({ driverId, authToken, onPress }) => {
  const { currentTier, tierProgress, isLoading } = useDriverTier(driverId, authToken);

  if (isLoading) {
    return (
      <View style={styles.widgetContainer}>
        <ActivityIndicator size="small" color="#FF6B35" />
      </View>
    );
  }

  if (!currentTier) {
    return null;
  }

  const boostPercentage = Math.round((currentTier.multiplier - 1.0) * 100);

  return (
    <TouchableOpacity style={styles.widgetContainer} onPress={onPress}>
      <View style={[styles.tierBadge, { backgroundColor: currentTier.tier_color }]}>
        <Text style={styles.tierBadgeText}>{currentTier.tier_name}</Text>
      </View>

      <View style={styles.widgetContent}>
        <View style={styles.multiplierSection}>
          <Text style={styles.multiplierLabel}>Earn Multiplier</Text>
          <Text style={styles.multiplierValue}>
            {currentTier.multiplier.toFixed(2)}x
          </Text>
          {boostPercentage > 0 && (
            <Text style={styles.boostLabel}>+{boostPercentage}% earnings</Text>
          )}
        </View>

        {tierProgress && (
          <View style={styles.progressSection}>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${tierProgress.progress_percentage}%`,
                    backgroundColor: currentTier.tier_color
                  }
                ]}
              />
            </View>
            <Text style={styles.progressText}>
              {tierProgress.points_needed > 0
                ? `${tierProgress.points_needed} points to ${tierProgress.next_tier}`
                : 'Platinum tier reached'}
            </Text>
          </View>
        )}
      </View>

      <Text style={styles.tapHint}>Tap for details →</Text>
    </TouchableOpacity>
  );
};

// ==================== TIER DETAILS SCREEN ====================

export const DriverTierDetailsScreen: React.FC<{
  driverId: string;
  authToken: string;
}> = ({ driverId, authToken }) => {
  const { tierDashboard, tierHistory, isLoading, fetchTierDashboard } =
    useDriverTier(driverId, authToken);

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTierDashboard();
    setRefreshing(false);
  };

  if (isLoading && !tierDashboard) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  if (!tierDashboard) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Failed to load tier information</Text>
      </View>
    );
  }

  const { tier_info, progress, benefits, metrics } = tierDashboard;
  const boostPercentage = tier_info.earnings_boost_percentage;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF6B35" />}
    >
      {/* Current Tier Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Current Tier</Text>

        <View style={[styles.tierBigCard, { backgroundColor: tier_info.tier_color + '20' }]}>
          <View style={[styles.tierBigBadge, { backgroundColor: tier_info.tier_color }]}>
            <Text style={styles.tierBigText}>{tier_info.tier_name}</Text>
          </View>

          <View style={styles.tierCardContent}>
            <Text style={styles.tierPoints}>{tier_info.tier_points} points</Text>
            <Text style={styles.multiplierBig}>
              {tier_info.multiplier.toFixed(2)}x Multiplier
            </Text>
            {boostPercentage > 0 && (
              <Text style={styles.earnBoost}>+{boostPercentage}% Earnings Boost</Text>
            )}
          </View>
        </View>
      </View>

      {/* Progress to Next Tier */}
      {progress && progress.next_tier && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Progress to {progress.next_tier}</Text>

          <View style={styles.progressCard}>
            <View style={styles.progressBarLarge}>
              <View
                style={[
                  styles.progressFillLarge,
                  { width: `${progress.progress_percentage}%` }
                ]}
              />
            </View>
            <Text style={styles.progressPercentage}>{progress.progress_percentage}%</Text>

            <View style={styles.pointsInfo}>
              <Text style={styles.pointsLabel}>Points: {progress.points_current} / {progress.points_required}</Text>
              <Text style={styles.pointsNeeded}>{progress.points_needed} points to go</Text>
              <Text style={styles.daysEstimate}>Estimated: {progress.days_estimate} days</Text>
            </View>
          </View>

          {/* Requirements */}
          <View style={styles.requirementsContainer}>
            <Text style={styles.requirementsTitle}>Requirements for {progress.next_tier}</Text>

            <View style={styles.requirementRow}>
              <Text style={styles.requirementLabel}>Rides</Text>
              <View style={styles.requirementStatus}>
                <Text style={styles.requirementValue}>
                  {progress.rides_current} / {progress.rides_required}
                </Text>
                <Text style={[styles.requirementStatus, progress.rides_current >= progress.rides_required ? styles.complete : styles.incomplete]}>
                  {progress.rides_current >= progress.rides_required ? '✓' : `${progress.rides_needed} to go`}
                </Text>
              </View>
            </View>

            <View style={styles.requirementRow}>
              <Text style={styles.requirementLabel}>Rating</Text>
              <View style={styles.requirementStatus}>
                <Text style={styles.requirementValue}>
                  {progress.rating_current.toFixed(1)} / {progress.rating_required}
                </Text>
                <Text style={[styles.requirementStatus, progress.rating_current >= progress.rating_required ? styles.complete : styles.incomplete]}>
                  {progress.rating_current >= progress.rating_required ? '✓' : '!'}
                </Text>
              </View>
            </View>

            <View style={styles.requirementRow}>
              <Text style={styles.requirementLabel}>Acceptance Rate</Text>
              <View style={styles.requirementStatus}>
                <Text style={styles.requirementValue}>
                  {progress.acceptance_current.toFixed(0)}% / {progress.acceptance_required.toFixed(0)}%
                </Text>
                <Text style={[styles.requirementStatus, progress.acceptance_current >= progress.acceptance_required ? styles.complete : styles.incomplete]}>
                  {progress.acceptance_current >= progress.acceptance_required ? '✓' : '!'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Current Benefits */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Benefits</Text>

        {benefits.map((benefit, index) => (
          <View key={index} style={styles.benefitCard}>
            <Text style={styles.benefitIcon}>✓</Text>
            <Text style={styles.benefitText}>{benefit}</Text>
          </View>
        ))}
      </View>

      {/* Metrics Summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Metrics</Text>

        <View style={styles.metricsGrid}>
          <MetricCard label="Total Rides" value={metrics.total_rides} />
          <MetricCard label="Avg Rating" value={metrics.average_rating.toFixed(1)} />
          <MetricCard label="Acceptance" value={`${metrics.acceptance_rate.toFixed(0)}%`} />
          <MetricCard label="Total Earnings" value={`₹${(metrics.total_earnings / 1000).toFixed(1)}k`} />
        </View>
      </View>

      {/* Tier History */}
      {tierHistory && tierHistory.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tier Upgrade History</Text>

          {tierHistory.map((upgrade, index) => (
            <View key={index} style={styles.historyCard}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyDate}>
                  {new Date(upgrade.date).toLocaleDateString()}
                </Text>
                <Text style={styles.historyTiers}>
                  {upgrade.from_tier} → {upgrade.to_tier}
                </Text>
              </View>
              <View style={styles.historyMetrics}>
                <Text style={styles.historyMetric}>
                  {upgrade.metrics_at_upgrade.rides} rides • ⭐ {upgrade.metrics_at_upgrade.rating}
                </Text>
                <Text style={styles.historyMetric}>
                  {upgrade.metrics_at_upgrade.acceptance.toFixed(0)}% acceptance • ₹{(upgrade.metrics_at_upgrade.earnings / 1000).toFixed(1)}k earnings
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Tier Levels Overview */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tier Levels</Text>

        <TierLevelCard
          name="Bronze"
          color="#CD7F32"
          multiplier="1.0x"
          description="Default tier. Get started!"
        />
        <TierLevelCard
          name="Silver"
          color="#C0C0C0"
          multiplier="1.05x"
          description="200+ rides, 4.0+ rating"
        />
        <TierLevelCard
          name="Gold"
          color="#FFD700"
          multiplier="1.15x"
          description="1000+ rides, 4.3+ rating"
        />
        <TierLevelCard
          name="Platinum"
          color="#E5E4E2"
          multiplier="1.3x"
          description="2000+ rides, 4.6+ rating (Elite)"
        />
      </View>

      <View style={{ height: 20 }} />
    </ScrollView>
  );
};

// ==================== HELPER COMPONENTS ====================

const MetricCard = ({ label, value }: { label: string; value: string | number }) => (
  <View style={styles.metricCard}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue}>{value}</Text>
  </View>
);

const TierLevelCard = ({
  name,
  color,
  multiplier,
  description
}: {
  name: string;
  color: string;
  multiplier: string;
  description: string;
}) => (
  <View style={styles.tierLevelCard}>
    <View style={[styles.tierLevelBadge, { backgroundColor: color }]}>
      <Text style={styles.tierLevelName}>{name}</Text>
    </View>
    <View style={styles.tierLevelInfo}>
      <Text style={styles.tierLevelMultiplier}>{multiplier}</Text>
      <Text style={styles.tierLevelDesc}>{description}</Text>
    </View>
  </View>
);

// ==================== STYLES ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 16
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  errorText: {
    fontSize: 14,
    color: '#E53E3E',
    textAlign: 'center',
    marginTop: 20
  },
  section: {
    marginVertical: 16
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12
  },
  widgetContainer: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    marginVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2
  },
  tierBadge: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 12
  },
  tierBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFF'
  },
  widgetContent: {
    flex: 1
  },
  multiplierSection: {
    marginBottom: 8
  },
  multiplierLabel: {
    fontSize: 10,
    color: '#666'
  },
  multiplierValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FF6B35'
  },
  boostLabel: {
    fontSize: 10,
    color: '#10B981',
    fontWeight: '600'
  },
  progressSection: {
    marginTop: 4
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4
  },
  progressFill: {
    height: '100%',
    borderRadius: 2
  },
  progressText: {
    fontSize: 10,
    color: '#666'
  },
  tapHint: {
    fontSize: 9,
    color: '#999',
    marginLeft: 8
  },
  tierBigCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
    marginBottom: 12
  },
  tierBigBadge: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginRight: 16
  },
  tierBigText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFF'
  },
  tierCardContent: {
    flex: 1
  },
  tierPoints: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4
  },
  multiplierBig: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4
  },
  earnBoost: {
    fontSize: 12,
    color: '#10B981',
    fontWeight: '600'
  },
  progressCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    marginBottom: 12
  },
  progressBarLarge: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8
  },
  progressFillLarge: {
    height: '100%',
    backgroundColor: '#FF6B35',
    borderRadius: 4
  },
  progressPercentage: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8
  },
  pointsInfo: {
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    padding: 8
  },
  pointsLabel: {
    fontSize: 12,
    color: '#333',
    fontWeight: '600'
  },
  pointsNeeded: {
    fontSize: 11,
    color: '#666',
    marginTop: 2
  },
  daysEstimate: {
    fontSize: 11,
    color: '#F59E0B',
    fontWeight: '600',
    marginTop: 4
  },
  requirementsContainer: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    elevation: 1
  },
  requirementsTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8
  },
  requirementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0'
  },
  requirementLabel: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500'
  },
  requirementStatus: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  requirementValue: {
    fontSize: 11,
    color: '#666',
    marginRight: 8
  },
  complete: {
    color: '#10B981',
    fontWeight: 'bold'
  },
  incomplete: {
    color: '#F59E0B',
    fontWeight: 'bold'
  },
  benefitCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 1,
    borderLeftWidth: 4,
    borderLeftColor: '#10B981'
  },
  benefitIcon: {
    fontSize: 14,
    color: '#10B981',
    marginRight: 8,
    fontWeight: 'bold'
  },
  benefitText: {
    fontSize: 12,
    color: '#333',
    flex: 1
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between'
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    elevation: 1,
    alignItems: 'center'
  },
  metricLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4
  },
  metricValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333'
  },
  historyCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    elevation: 1,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6'
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  historyDate: {
    fontSize: 11,
    color: '#666'
  },
  historyTiers: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#3B82F6'
  },
  historyMetrics: {
    backgroundColor: '#F9F9F9',
    borderRadius: 6,
    padding: 8
  },
  historyMetric: {
    fontSize: 10,
    color: '#666',
    marginVertical: 2
  },
  tierLevelCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 1
  },
  tierLevelBadge: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    marginRight: 12,
    minWidth: 70,
    alignItems: 'center'
  },
  tierLevelName: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFF'
  },
  tierLevelInfo: {
    flex: 1
  },
  tierLevelMultiplier: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333'
  },
  tierLevelDesc: {
    fontSize: 10,
    color: '#666',
    marginTop: 2
  }
});
