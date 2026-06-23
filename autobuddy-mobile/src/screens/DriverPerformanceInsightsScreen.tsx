import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useDriverPerformanceInsights } from '../hooks/useDriverPerformanceInsights';

type DateLike = string | number | Date | null | undefined;

const formatDateSafely = (date: DateLike): string => {
  if (!date) return 'Unknown';
  const dateObj = new Date(date);
  return !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : 'Unknown';
};

interface Insight {
  id: string;
  title: string;
  description?: string;
  rating?: number;
  [key: string]: any;
}

interface DriverPerformanceInsightsScreenProps {
  token: string | null;
  driverId: string;
}

export const DriverPerformanceInsightsScreen: React.FC<
  DriverPerformanceInsightsScreenProps
> = ({ token, driverId }) => {
  // Check for required data
  if (!token || !driverId) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Invalid or missing required data</Text>
      </View>
    );
  }

  const {
    metrics,
    insights,
    currentStats,
    loading,
    error,
    fetchMetrics,
    fetchInsights,
    getPerformanceTrend,
    getTopPerformanceDay,
    getAverageMetrics,
    getGoalProgress,
  } = useDriverPerformanceInsights(token, driverId);

  const [refreshing, setRefreshing] = useState(false);
  const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);
  const [showInsightDetail, setShowInsightDetail] = useState(false);
  const [timeRange, setTimeRange] = useState(7);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [timeRange]);

  const loadData = async () => {
    try {
      setLoadError(null);
      await fetchMetrics(timeRange);
      await fetchInsights();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load performance data';
      setLoadError(errorMsg);
      console.error('Performance data load error:', err);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const avgMetrics = getAverageMetrics();
  const goalProgress = getGoalProgress();
  const topDay = getTopPerformanceDay();
  const rideTrend = getPerformanceTrend('ridesCompleted', timeRange);
  const earningsTrend = getPerformanceTrend('totalEarnings', timeRange);
  const ratingTrend = getPerformanceTrend('rating', timeRange);

  const getTrendColor = (trend: number) => {
    if (trend > 0) return '#4CAF50';
    if (trend < 0) return '#F44336';
    return '#999';
  };

  const getTrendIcon = (trend: number) => {
    if (trend > 0) return 'trending-up';
    if (trend < 0) return 'trending-down';
    return 'trending-flat';
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Error banner if load failed */}
      {(loadError || error) && (
        <View style={styles.errorBanner}>
          <MaterialIcons name="error" size={20} color="#D32F2F" />
          <Text style={styles.errorBannerText}>{loadError || error || 'An error occurred'}</Text>
          <Pressable onPress={() => setLoadError(null)}>
            <MaterialIcons name="close" size={20} color="#D32F2F" />
          </Pressable>
        </View>
      )}

      {/* Time Range Selector */}
      <View style={styles.timeRangeContainer}>
        {[7, 14, 30].map((days) => (
          <Pressable
            key={days}
            style={[
              styles.timeRangeButton,
              timeRange === days && styles.timeRangeButtonActive,
            ]}
            onPress={() => setTimeRange(days)}
          >
            <Text
              style={[
                styles.timeRangeText,
                timeRange === days && styles.timeRangeTextActive,
              ]}
            >
              {days}d
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Current Stats */}
      {currentStats && (
        <View style={styles.statsGrid}>
          <StatCard
            icon="directions-car"
            label="Rides"
            value={currentStats.totalRides.toString()}
            color="#2196F3"
          />
          <StatCard
            icon="attach-money"
            label="Earnings"
            value={`₹${currentStats.totalEarnings.toFixed(0)}`}
            color="#4CAF50"
          />
          <StatCard
            icon="star"
            label="Rating"
            value={`${currentStats.avgRating.toFixed(1)}⭐`}
            color="#FF9800"
          />
          <StatCard
            icon="percent"
            label="Acceptance"
            value={`${currentStats.acceptanceRate.toFixed(0)}%`}
            color="#9C27B0"
          />
        </View>
      )}

      {/* Trends */}
      {avgMetrics && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Performance Trends</Text>

          <View style={styles.trendCards}>
            <TrendCard
              label="Rides"
              value={metrics.length > 0 ? metrics[metrics.length - 1].ridesCompleted : 0}
              trend={rideTrend}
              trendColor={getTrendColor(rideTrend)}
              trendIcon={getTrendIcon(rideTrend)}
            />
            <TrendCard
              label="Earnings"
              value={`₹${metrics.length > 0 ? metrics[metrics.length - 1].totalEarnings.toFixed(0) : 0}`}
              trend={earningsTrend}
              trendColor={getTrendColor(earningsTrend)}
              trendIcon={getTrendIcon(earningsTrend)}
            />
            <TrendCard
              label="Rating"
              value={`${metrics.length > 0 ? metrics[metrics.length - 1].rating.toFixed(1) : 0}⭐`}
              trend={ratingTrend}
              trendColor={getTrendColor(ratingTrend)}
              trendIcon={getTrendIcon(ratingTrend)}
            />
          </View>
        </View>
      )}

      {/* Goals Progress */}
      {goalProgress && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Weekly Goals</Text>

          <GoalCard
            icon="directions-car"
            label="Ride Target"
            current={goalProgress.rides.current}
            goal={goalProgress.rides.goal}
            progress={Math.min(goalProgress.rides.progress, 100)}
          />

          <GoalCard
            icon="star"
            label="Rating Target"
            current={
              goalProgress?.rating?.current && !isNaN(parseFloat(String(goalProgress.rating.current)))
                ? parseFloat(String(goalProgress.rating.current))
                : 0
            }
            goal={goalProgress?.rating?.goal ?? 5}
            progress={Math.min(goalProgress?.rating?.progress ?? 0, 100)}
          />
        </View>
      )}

      {/* Average Metrics */}
      {avgMetrics && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Average Metrics ({timeRange}d)</Text>

          <MetricRow
            label="Avg Rating"
            value={`${avgMetrics.avgRating}⭐`}
            icon="star"
          />
          <MetricRow
            label="Avg Acceptance"
            value={`${avgMetrics.avgAcceptance}%`}
            icon="check-circle"
          />
          <MetricRow
            label="Avg Cancellation"
            value={`${avgMetrics.avgCancellation}%`}
            icon="cancel"
          />
          <MetricRow
            label="Total Earnings"
            value={`₹${avgMetrics.totalEarnings}`}
            icon="attach-money"
          />
          <MetricRow
            label="Earnings/Ride"
            value={`₹${avgMetrics.avgEarningsPerRide}`}
            icon="trending-up"
          />
        </View>
      )}

      {/* Top Performance Day */}
      {topDay && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Performance Day</Text>
          <View style={styles.topDayCard}>
            <View style={styles.topDayDate}>
              <Text style={styles.topDayDateText}>
                {formatDateSafely(topDay.date)}
              </Text>
            </View>
            <View style={styles.topDayMetrics}>
              <View style={styles.topDayMetric}>
                <Text style={styles.topDayLabel}>Rides</Text>
                <Text style={styles.topDayValue}>{topDay.ridesCompleted}</Text>
              </View>
              <View style={styles.topDayMetric}>
                <Text style={styles.topDayLabel}>Earnings</Text>
                <Text style={[styles.topDayValue, { color: '#4CAF50' }]}>
                  ₹{topDay.totalEarnings.toFixed(0)}
                </Text>
              </View>
              <View style={styles.topDayMetric}>
                <Text style={styles.topDayLabel}>Rating</Text>
                <Text style={[styles.topDayValue, { color: '#FF9800' }]}>
                  {topDay.rating.toFixed(1)}⭐
                </Text>
              </View>
            </View>
          </View>
        </View>
      )}

      {/* Insights */}
      {insights.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Performance Insights</Text>
          {insights.map((insight) => (
            <InsightCard
              key={insight.id}
              insight={insight}
              onPress={() => {
                setSelectedInsight(insight);
                setShowInsightDetail(true);
              }}
            />
          ))}
        </View>
      )}

      {/* Insight Detail Modal */}
      <Modal visible={showInsightDetail} transparent animationType="slide">
        {selectedInsight && (
          <View style={styles.modal}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Pressable onPress={() => setShowInsightDetail(false)}>
                  <MaterialIcons name="close" size={24} color="#000" />
                </Pressable>
                <Text style={styles.modalTitle}>Insight Details</Text>
                <View style={{ width: 24 }} />
              </View>

              <ScrollView style={styles.modalBody}>
                <View style={styles.detailCard}>
                  <View style={styles.detailRow}>
                    <MaterialIcons name="lightbulb" size={20} color="#2196F3" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Title</Text>
                      <Text style={styles.detailValue}>{selectedInsight.title}</Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons name="description" size={20} color="#2196F3" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Description</Text>
                      <Text style={styles.detailValue}>
                        {selectedInsight.description}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons name="info" size={20} color="#2196F3" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Recommendation</Text>
                      <Text style={styles.detailValue}>
                        {selectedInsight.recommendation}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons
                      name={
                        selectedInsight.priority === 'high'
                          ? 'error'
                          : selectedInsight.priority === 'medium'
                          ? 'warning'
                          : 'info'
                      }
                      size={20}
                      color={
                        selectedInsight.priority === 'high'
                          ? '#F44336'
                          : selectedInsight.priority === 'medium'
                          ? '#FF9800'
                          : '#2196F3'
                      }
                    />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Priority</Text>
                      <Text style={styles.detailValue}>
                        {selectedInsight.priority.charAt(0).toUpperCase() +
                          selectedInsight.priority.slice(1)}
                      </Text>
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

const StatCard: React.FC<{
  icon: string;
  label: string;
  value: string;
  color: string;
}> = ({ icon, label, value, color }) => {
  return (
    <View style={[styles.statCard, { borderLeftColor: color, borderLeftWidth: 4 }]}>
      <MaterialIcons name={icon as any} size={20} color={color} />
      <Text style={styles.statCardLabel}>{label}</Text>
      <Text style={[styles.statCardValue, { color }]}>{value}</Text>
    </View>
  );
};

const TrendCard: React.FC<{
  label: string;
  value: string | number;
  trend: number;
  trendColor: string;
  trendIcon: string;
}> = ({ label, value, trend, trendColor, trendIcon }) => {
  return (
    <View style={styles.trendCard}>
      <Text style={styles.trendLabel}>{label}</Text>
      <Text style={styles.trendValue}>{value}</Text>
      <View style={styles.trendBadge}>
        <MaterialIcons name={trendIcon as any} size={16} color={trendColor} />
        <Text style={[styles.trendPercent, { color: trendColor }]}>
          {trend > 0 ? '+' : ''}{trend.toFixed(1)}%
        </Text>
      </View>
    </View>
  );
};

const GoalCard: React.FC<{
  icon: string;
  label: string;
  current: number;
  goal: number;
  progress: number;
}> = ({ icon, label, current, goal, progress }) => {
  return (
    <View style={styles.goalCard}>
      <View style={styles.goalHeader}>
        <MaterialIcons name={icon as any} size={20} color="#2196F3" />
        <Text style={styles.goalLabel}>{label}</Text>
        <Text style={styles.goalValue}>
          {current} / {goal}
        </Text>
      </View>
      <View style={styles.goalProgressBar}>
        <View
          style={[
            styles.goalProgressFill,
            { width: `${progress}%` },
          ]}
        />
      </View>
      <Text style={styles.goalPercent}>{progress.toFixed(0)}%</Text>
    </View>
  );
};

const MetricRow: React.FC<{
  label: string;
  value: string;
  icon: string;
}> = ({ label, value, icon }) => {
  return (
    <View style={styles.metricRow}>
      <View style={styles.metricLeft}>
        <MaterialIcons name={icon as any} size={18} color="#2196F3" />
        <Text style={styles.metricLabel}>{label}</Text>
      </View>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
};

const InsightCard: React.FC<{
  insight: any;
  onPress: () => void;
}> = ({ insight, onPress }) => {
  const getTypeColor = (type: string) => {
    switch (type) {
      case 'trend':
        return '#2196F3';
      case 'anomaly':
        return '#F44336';
      case 'opportunity':
        return '#4CAF50';
      case 'warning':
        return '#FF9800';
      default:
        return '#999';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'trend':
        return 'trending-up';
      case 'anomaly':
        return 'error';
      case 'opportunity':
        return 'lightbulb';
      case 'warning':
        return 'warning';
      default:
        return 'info';
    }
  };

  return (
    <Pressable style={styles.insightCard} onPress={onPress}>
      <View style={styles.insightHeader}>
        <View
          style={[
            styles.insightIcon,
            { backgroundColor: getTypeColor(insight.type) + '20' },
          ]}
        >
          <MaterialIcons
            name={getTypeIcon(insight.type) as any}
            size={20}
            color={getTypeColor(insight.type)}
          />
        </View>
        <View style={styles.insightInfo}>
          <Text style={styles.insightTitle}>{insight.title}</Text>
          <Text style={styles.insightType}>{insight.type.toUpperCase()}</Text>
        </View>
        <View
          style={[
            styles.insightPriority,
            {
              backgroundColor:
                insight.priority === 'high'
                  ? '#FFEBEE'
                  : insight.priority === 'medium'
                  ? '#FFF3E0'
                  : '#E3F2FD',
            },
          ]}
        >
          <Text
            style={[
              styles.insightPriorityText,
              {
                color:
                  insight.priority === 'high'
                    ? '#F44336'
                    : insight.priority === 'medium'
                    ? '#FF9800'
                    : '#2196F3',
              },
            ]}
          >
            {insight.priority}
          </Text>
        </View>
      </View>
      <Text style={styles.insightDescription} numberOfLines={2}>
        {insight.description}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  timeRangeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  timeRangeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  timeRangeButtonActive: {
    backgroundColor: '#2196F3',
  },
  timeRangeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  timeRangeTextActive: {
    color: '#fff',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 8,
    paddingVertical: 12,
    gap: 8,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  statCardLabel: {
    fontSize: 10,
    color: '#666',
    marginTop: 6,
  },
  statCardValue: {
    fontSize: 16,
    fontWeight: '700',
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
  trendCards: {
    flexDirection: 'row',
    gap: 8,
  },
  trendCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  trendLabel: {
    fontSize: 11,
    color: '#666',
  },
  trendValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginTop: 4,
  },
  trendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  trendPercent: {
    fontSize: 11,
    fontWeight: '700',
  },
  goalCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  goalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  goalLabel: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  goalValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#666',
  },
  goalProgressBar: {
    height: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  goalProgressFill: {
    height: '100%',
    backgroundColor: '#2196F3',
  },
  goalPercent: {
    fontSize: 10,
    color: '#666',
    textAlign: 'right',
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 8,
  },
  metricLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  metricLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  metricValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#666',
  },
  topDayCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  topDayDate: {
    marginBottom: 12,
  },
  topDayDateText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2196F3',
  },
  topDayMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  topDayMetric: {
    alignItems: 'center',
  },
  topDayLabel: {
    fontSize: 10,
    color: '#666',
  },
  topDayValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginTop: 4,
  },
  insightCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  insightHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  insightIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  insightInfo: {
    flex: 1,
  },
  insightTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  insightType: {
    fontSize: 9,
    color: '#999',
    marginTop: 2,
  },
  insightPriority: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  insightPriorityText: {
    fontSize: 9,
    fontWeight: '700',
  },
  insightDescription: {
    fontSize: 11,
    color: '#666',
    lineHeight: 15,
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
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 10,
  },
});

export default DriverPerformanceInsightsScreen;
