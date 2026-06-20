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
  FlatList,
  Modal
} from 'react-native';
import { LineChart, BarChart } from 'react-native-chart-kit';
import { useDriverInsights } from '../hooks/useDriverInsights';

const { width } = Dimensions.get('window');
const chartWidth = width - 40;

// ==================== SCREENS ====================

export const DriverPerformanceOverviewScreen: React.FC<{
  driverId: string;
  authToken: string;
  onViewTrips?: () => void;
  onViewSuggestions?: () => void;
}> = ({ driverId, authToken, onViewTrips, onViewSuggestions }) => {
  const { scorecard, tripAnalytics, behaviorPatterns, isLoading, error, fetchFullDashboard } =
    useDriverInsights(driverId, authToken);

  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchFullDashboard();
    setRefreshing(false);
  };

  if (isLoading && !scorecard) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return '#10B981';
    if (score >= 65) return '#F59E0B';
    return '#EF4444';
  };

  const ScoreMetricCard = ({ label, score, percentile }: { label: string; score: number; percentile: number }) => (
    <View style={styles.scoreMetricCard}>
      <View style={styles.scoreMetricHeader}>
        <Text style={styles.scoreMetricLabel}>{label}</Text>
        <Text style={styles.scoreMetricPercentile}>vs {percentile}th %ile</Text>
      </View>
      <View style={styles.scoreBar}>
        <View style={[styles.scoreBarFill, { width: `${Math.min(score, 100)}%`, backgroundColor: getScoreColor(score) }]} />
      </View>
      <Text style={[styles.scoreMetricValue, { color: getScoreColor(score) }]}>{score}/20</Text>
    </View>
  );

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF6B35" />}
    >
      {/* Overall Score Section */}
      {scorecard && (
        <>
          <View style={styles.overallScoreSection}>
            <Text style={styles.sectionTitle}>Performance Scorecard</Text>
            <View style={styles.overallScoreContainer}>
              <View style={styles.circleScore}>
                <Text style={styles.circleScoreValue}>{scorecard.overall_score}</Text>
                <Text style={styles.circleScoreLabel}>out of 100</Text>
              </View>
              <View style={styles.scoreMetadata}>
                <Text style={styles.scoreMetadataText}>
                  📊 Percentile Rank: <Text style={styles.boldText}>{scorecard.peer_percentile}th</Text>
                </Text>
                <Text style={[styles.scoreMetadataText, { marginTop: 8 }]}>
                  📈 Trend: <Text style={[styles.boldText, { color: scorecard.trend === 'up' ? '#10B981' : scorecard.trend === 'down' ? '#EF4444' : '#F59E0B' }]}>
                    {scorecard.trend === 'up' ? '↗ Improving' : scorecard.trend === 'down' ? '↘ Declining' : '→ Stable'}
                  </Text>
                </Text>
              </View>
            </View>

            {/* 6 Metric Cards */}
            <View style={styles.metricsGrid}>
              <ScoreMetricCard label="Acceptance" score={scorecard.acceptance_rate_score} percentile={scorecard.peer_percentile} />
              <ScoreMetricCard label="Completion" score={scorecard.completion_rate_score} percentile={scorecard.peer_percentile} />
              <ScoreMetricCard label="Rating" score={scorecard.rating_score} percentile={scorecard.peer_percentile} />
              <ScoreMetricCard label="Consistency" score={scorecard.consistency_score} percentile={scorecard.peer_percentile} />
              <ScoreMetricCard label="Efficiency" score={scorecard.efficiency_score} percentile={scorecard.peer_percentile} />
              <ScoreMetricCard label="Reliability" score={scorecard.reliability_score} percentile={scorecard.peer_percentile} />
            </View>
          </View>

          {/* Trip Analytics Summary */}
          {tripAnalytics && (
            <View style={styles.tripSummarySection}>
              <Text style={styles.sectionTitle}>Trip Analytics Summary</Text>
              <View style={styles.summaryStats}>
                <SummaryStat
                  icon="🚗"
                  label="Total Trips (30d)"
                  value={tripAnalytics.aggregated_stats.total_trips}
                  color="#3B82F6"
                />
                <SummaryStat
                  icon="💰"
                  label="Avg Earnings/Trip"
                  value={`₹${tripAnalytics.aggregated_stats.average_earnings_per_trip.toFixed(0)}`}
                  color="#10B981"
                />
                <SummaryStat
                  icon="📏"
                  label="Avg Distance"
                  value={`${tripAnalytics.aggregated_stats.average_distance_per_trip.toFixed(1)}km`}
                  color="#F59E0B"
                />
                <SummaryStat
                  icon="⏱️"
                  label="Avg Duration"
                  value={`${Math.round(tripAnalytics.aggregated_stats.average_duration_per_trip)}min`}
                  color="#8B5CF6"
                />
              </View>
              <TouchableOpacity style={[styles.button, styles.buttonPrimary]} onPress={onViewTrips}>
                <Text style={styles.buttonText}>📊 View Detailed Analytics</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Behavior Insights Snapshot */}
          {behaviorPatterns.length > 0 && (
            <View style={styles.behaviorSection}>
              <Text style={styles.sectionTitle}>Behavior Insights</Text>
              {behaviorPatterns.slice(0, 2).map((pattern, idx) => (
                <View key={idx} style={styles.behaviorCard}>
                  <View style={styles.behaviorHeader}>
                    <Text style={styles.behaviorType}>
                      {pattern.pattern_type === 'peak_hours' ? '🕐' : pattern.pattern_type === 'consistency' ? '📈' : '📍'}
                    </Text>
                    <Text style={styles.behaviorDescription}>{pattern.description}</Text>
                  </View>
                  <View style={styles.behaviorFooter}>
                    <View style={styles.frequencyBar}>
                      <View style={[styles.frequencyFill, { width: `${pattern.frequency_percentage}%` }]} />
                    </View>
                    <Text style={styles.frequencyText}>{pattern.frequency_percentage}%</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Buttons */}
          <View style={styles.actionButtonsContainer}>
            <TouchableOpacity style={[styles.button, styles.buttonSecondary]} onPress={onViewSuggestions}>
              <Text style={styles.buttonSecondaryText}>💡 View Suggestions</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={{ height: 20 }} />
    </ScrollView>
  );
};

// ==================== TRIP ANALYTICS SCREEN ====================

export const TripAnalyticsScreen: React.FC<{
  driverId: string;
  authToken: string;
}> = ({ driverId, authToken }) => {
  const { tripAnalytics, isLoading, error, fetchTripAnalytics } = useDriverInsights(driverId, authToken);
  const [selectedPeriod, setSelectedPeriod] = useState(30);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTripAnalytics(selectedPeriod);
    setRefreshing(false);
  };

  useEffect(() => {
    fetchTripAnalytics(selectedPeriod);
  }, [selectedPeriod]);

  if (isLoading && !tripAnalytics) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  const periodButtons = [
    { label: '7 Days', value: 7 },
    { label: '30 Days', value: 30 },
    { label: '90 Days', value: 90 }
  ];

  // Generate chart data
  const chartData = {
    labels: tripAnalytics?.trips.slice(-7).map((_, i) => `D${i + 1}`) || [],
    datasets: [
      {
        data: tripAnalytics?.trips.slice(-7).map(t => t.earnings) || [0],
        color: () => '#FF6B35',
        strokeWidth: 2
      }
    ]
  };

  const distanceData = {
    labels: ['5km', '10km', '15km', '20km', '25km+'],
    datasets: [
      {
        data: [
          tripAnalytics?.trips.filter(t => t.distance_km <= 5).length || 0,
          tripAnalytics?.trips.filter(t => t.distance_km > 5 && t.distance_km <= 10).length || 0,
          tripAnalytics?.trips.filter(t => t.distance_km > 10 && t.distance_km <= 15).length || 0,
          tripAnalytics?.trips.filter(t => t.distance_km > 15 && t.distance_km <= 20).length || 0,
          tripAnalytics?.trips.filter(t => t.distance_km > 20).length || 0
        ]
      }
    ]
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF6B35" />}
    >
      <Text style={styles.sectionTitle}>Trip Analytics</Text>

      {/* Period Selector */}
      <View style={styles.periodSelector}>
        {periodButtons.map(btn => (
          <TouchableOpacity
            key={btn.value}
            style={[styles.periodButton, selectedPeriod === btn.value && styles.periodButtonActive]}
            onPress={() => setSelectedPeriod(btn.value)}
          >
            <Text style={[styles.periodButtonText, selectedPeriod === btn.value && styles.periodButtonTextActive]}>
              {btn.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {tripAnalytics && (
        <>
          {/* Overview Stats */}
          <View style={styles.summaryStats}>
            <SummaryStat
              icon="🚗"
              label="Total Trips"
              value={tripAnalytics.aggregated_stats.total_trips}
              color="#3B82F6"
            />
            <SummaryStat
              icon="💰"
              label="Total Earnings"
              value={`₹${tripAnalytics.aggregated_stats.total_earnings.toFixed(0)}`}
              color="#10B981"
            />
            <SummaryStat
              icon="📏"
              label="Total Distance"
              value={`${tripAnalytics.aggregated_stats.total_distance.toFixed(0)}km`}
              color="#F59E0B"
            />
            <SummaryStat
              icon="⏱️"
              label="Total Duration"
              value={`${tripAnalytics.aggregated_stats.total_duration_minutes}min`}
              color="#8B5CF6"
            />
          </View>

          {/* Earnings Trend Chart */}
          <View style={styles.chartSection}>
            <Text style={styles.chartTitle}>Earnings Trend</Text>
            <View style={styles.chartContainer}>
              <LineChart
                data={chartData}
                width={chartWidth}
                height={220}
                chartConfig={{
                  backgroundColor: '#FFF',
                  backgroundGradientFrom: '#FFF',
                  backgroundGradientTo: '#FFF',
                  color: () => '#FF6B35',
                  labelColor: () => '#666',
                  strokeWidth: 2,
                  propsForDots: { r: '4', strokeWidth: '2', stroke: '#FF6B35' }
                }}
              />
            </View>
          </View>

          {/* Distance Distribution */}
          <View style={styles.chartSection}>
            <Text style={styles.chartTitle}>Trip Distance Distribution</Text>
            <View style={styles.chartContainer}>
              <BarChart
                data={distanceData}
                width={chartWidth}
                height={220}
                chartConfig={{
                  backgroundColor: '#FFF',
                  backgroundGradientFrom: '#FFF',
                  backgroundGradientTo: '#FFF',
                  color: () => '#3B82F6',
                  labelColor: () => '#666'
                }}
              />
            </View>
          </View>

          {/* Recent Trips Table */}
          <View style={styles.tripsTableSection}>
            <Text style={styles.chartTitle}>Recent Trips</Text>
            <FlatList
              data={tripAnalytics.trips.slice(0, 20)}
              keyExtractor={trip => trip.trip_id}
              scrollEnabled={false}
              renderItem={({ item: trip }) => (
                <View style={styles.tripRow}>
                  <View style={styles.tripRowLeft}>
                    <Text style={styles.tripDate}>{new Date(trip.date).toLocaleDateString()}</Text>
                    <Text style={styles.tripDetails}>
                      {trip.distance_km.toFixed(1)}km • {trip.duration_minutes}min
                    </Text>
                  </View>
                  <View style={styles.tripRowRight}>
                    <Text style={styles.tripEarnings}>₹{trip.earnings.toFixed(0)}</Text>
                    {trip.rating && (
                      <Text style={styles.tripRating}>⭐ {trip.rating.toFixed(1)}</Text>
                    )}
                  </View>
                </View>
              )}
            />
          </View>
        </>
      )}

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={{ height: 20 }} />
    </ScrollView>
  );
};

// ==================== IMPROVEMENT & BENCHMARK SCREEN ====================

export const ImprovementAndBenchmarkScreen: React.FC<{
  driverId: string;
  authToken: string;
}> = ({ driverId, authToken }) => {
  const { benchmarks, suggestions, scorecard, isLoading, error, fetchFullDashboard } =
    useDriverInsights(driverId, authToken);

  const [refreshing, setRefreshing] = useState(false);
  const [expandedBenchmark, setExpandedBenchmark] = useState('50th');

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchFullDashboard();
    setRefreshing(false);
  };

  if (isLoading && !benchmarks) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  const getBenchmarkColor = (yourScore: number, peerScore: number) => {
    if (yourScore >= peerScore * 0.95) return '#10B981';
    if (yourScore >= peerScore * 0.85) return '#F59E0B';
    return '#EF4444';
  };

  const BenchmarkComparison = ({ label, yourScore, peerScore }: { label: string; yourScore: number; peerScore: number }) => (
    <View style={styles.benchmarkCard}>
      <View style={styles.benchmarkHeader}>
        <Text style={styles.benchmarkLabel}>{label}</Text>
        <Text style={[styles.benchmarkYourScore, { color: getBenchmarkColor(yourScore, peerScore) }]}>
          {yourScore}
        </Text>
      </View>
      <View style={styles.benchmarkComparison}>
        <Text style={styles.benchmarkSmall}>Your Score</Text>
        <View style={styles.benchmarkBar}>
          <View style={[styles.benchmarkFill, { width: `${Math.min((yourScore / peerScore) * 100, 100)}%`, backgroundColor: getBenchmarkColor(yourScore, peerScore) }]} />
        </View>
        <Text style={styles.benchmarkSmall}>Peer Average: {peerScore}</Text>
      </View>
    </View>
  );

  const HighPrioritySuggestions = suggestions?.filter(s => s.priority === 'high') || [];
  const MediumPrioritySuggestions = suggestions?.filter(s => s.priority === 'medium') || [];

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF6B35" />}
    >
      {benchmarks && (
        <>
          {/* Benchmark Comparison Section */}
          <View style={styles.benchmarkSection}>
            <Text style={styles.sectionTitle}>Benchmark Comparison</Text>
            <Text style={styles.benchmarkDescription}>How your performance compares to other drivers</Text>

            {scorecard && (
              <BenchmarkComparison
                label="Overall Score"
                yourScore={scorecard.overall_score}
                peerScore={benchmarks.peer_percentiles['50th_percentile'] || 65}
              />
            )}

            <View style={styles.benchmarkTabs}>
              {['50th', '75th', '90th', '95th'].map(percentile => (
                <TouchableOpacity
                  key={percentile}
                  style={[styles.benchmarkTab, expandedBenchmark === percentile && styles.benchmarkTabActive]}
                  onPress={() => setExpandedBenchmark(percentile)}
                >
                  <Text style={[styles.benchmarkTabText, expandedBenchmark === percentile && styles.benchmarkTabTextActive]}>
                    {percentile} Percentile
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.benchmarkInfoCard}>
              <Text style={styles.benchmarkInfoTitle}>
                {benchmarks.interpretation.your_position}
              </Text>
              <Text style={styles.benchmarkInfoText}>
                📈 Strength: {benchmarks.interpretation.top_metric}
              </Text>
              <Text style={styles.benchmarkInfoText}>
                📉 Focus Area: {benchmarks.interpretation.needs_improvement}
              </Text>
            </View>
          </View>

          {/* How Others Perform */}
          <View style={styles.platformStatsSection}>
            <Text style={styles.sectionTitle}>How Others Perform</Text>
            <View style={styles.statCard}>
              <Text style={styles.statCardTitle}>🏆 What Top Drivers Do Best</Text>
              <Text style={styles.statCardText}>{benchmarks.interpretation.top_metric}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statCardTitle}>⚠️ Common Challenges</Text>
              <Text style={styles.statCardText}>{benchmarks.interpretation.needs_improvement}</Text>
            </View>
          </View>
        </>
      )}

      {/* Improvement Suggestions Section */}
      {suggestions && suggestions.length > 0 && (
        <View style={styles.suggestionsSection}>
          <Text style={styles.sectionTitle}>Improvement Suggestions</Text>

          {/* High Priority */}
          {HighPrioritySuggestions.length > 0 && (
            <View style={styles.prioritySection}>
              <Text style={styles.priorityTitle}>🔴 High Priority</Text>
              {HighPrioritySuggestions.map((suggestion, idx) => (
                <View key={idx} style={styles.suggestionCard}>
                  <View style={styles.suggestionHeader}>
                    <Text style={styles.suggestionCategory}>{suggestion.category.toUpperCase()}</Text>
                    <Text style={styles.suggestionConfidence}>{suggestion.confidence_score}% confidence</Text>
                  </View>
                  <Text style={styles.suggestionText}>{suggestion.suggestion_text}</Text>
                  <View style={styles.suggestionImpact}>
                    <Text style={styles.suggestionImpactLabel}>Expected Impact:</Text>
                    <Text style={styles.suggestionImpactText}>{suggestion.expected_impact}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Medium Priority */}
          {MediumPrioritySuggestions.length > 0 && (
            <View style={styles.prioritySection}>
              <Text style={styles.priorityTitle}>🟡 Medium Priority</Text>
              {MediumPrioritySuggestions.map((suggestion, idx) => (
                <View key={idx} style={styles.suggestionCard}>
                  <View style={styles.suggestionHeader}>
                    <Text style={styles.suggestionCategory}>{suggestion.category.toUpperCase()}</Text>
                    <Text style={styles.suggestionConfidence}>{suggestion.confidence_score}% confidence</Text>
                  </View>
                  <Text style={styles.suggestionText}>{suggestion.suggestion_text}</Text>
                  <View style={styles.suggestionImpact}>
                    <Text style={styles.suggestionImpactLabel}>Expected Impact:</Text>
                    <Text style={styles.suggestionImpactText}>{suggestion.expected_impact}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={{ height: 20 }} />
    </ScrollView>
  );
};

// ==================== HELPER COMPONENTS ====================

const SummaryStat = ({ icon, label, value, color }: { icon: string; label: string; value: string | number; color: string }) => (
  <View style={styles.statBox}>
    <Text style={styles.statIcon}>{icon}</Text>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={[styles.statValue, { color }]}>{value}</Text>
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginVertical: 16
  },
  overallScoreSection: {
    marginTop: 8
  },
  overallScoreContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2
  },
  circleScore: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FF6B35',
    justifyContent: 'center',
    alignItems: 'center'
  },
  circleScoreValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFF'
  },
  circleScoreLabel: {
    fontSize: 11,
    color: '#FFF',
    marginTop: 4
  },
  scoreMetadata: {
    flex: 1,
    marginLeft: 16
  },
  scoreMetadataText: {
    fontSize: 12,
    color: '#666'
  },
  boldText: {
    fontWeight: 'bold',
    color: '#333'
  },
  metricsGrid: {
    marginBottom: 16
  },
  scoreMetricCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    elevation: 1
  },
  scoreMetricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  scoreMetricLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333'
  },
  scoreMetricPercentile: {
    fontSize: 10,
    color: '#999'
  },
  scoreBar: {
    height: 6,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
    marginBottom: 6,
    overflow: 'hidden'
  },
  scoreBarFill: {
    height: '100%',
    borderRadius: 3
  },
  scoreMetricValue: {
    fontSize: 12,
    fontWeight: 'bold'
  },
  tripSummarySection: {
    marginVertical: 8
  },
  summaryStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginVertical: 12
  },
  statBox: {
    width: '48%',
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    elevation: 1,
    alignItems: 'center'
  },
  statIcon: {
    fontSize: 24,
    marginBottom: 4
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
    textAlign: 'center'
  },
  statValue: {
    fontSize: 14,
    fontWeight: 'bold'
  },
  button: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginVertical: 8
  },
  buttonPrimary: {
    backgroundColor: '#FF6B35'
  },
  buttonSecondary: {
    backgroundColor: '#E0E0E0',
    marginHorizontal: 0
  },
  buttonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 13
  },
  buttonSecondaryText: {
    color: '#333',
    fontWeight: '600',
    fontSize: 13
  },
  actionButtonsContainer: {
    marginVertical: 8
  },
  behaviorSection: {
    marginVertical: 8
  },
  behaviorCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    elevation: 1
  },
  behaviorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  behaviorType: {
    fontSize: 16,
    marginRight: 8
  },
  behaviorDescription: {
    fontSize: 12,
    color: '#333',
    flex: 1
  },
  behaviorFooter: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  frequencyBar: {
    flex: 1,
    height: 4,
    backgroundColor: '#E0E0E0',
    borderRadius: 2,
    overflow: 'hidden',
    marginRight: 8
  },
  frequencyFill: {
    height: '100%',
    backgroundColor: '#10B981'
  },
  frequencyText: {
    fontSize: 10,
    color: '#666',
    minWidth: 30
  },
  periodSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 12
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    marginHorizontal: 4,
    backgroundColor: '#E0E0E0',
    alignItems: 'center'
  },
  periodButtonActive: {
    backgroundColor: '#FF6B35'
  },
  periodButtonText: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500'
  },
  periodButtonTextActive: {
    color: '#FFF',
    fontWeight: '600'
  },
  chartSection: {
    marginVertical: 12
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8
  },
  chartContainer: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 8,
    elevation: 2
  },
  tripsTableSection: {
    marginVertical: 12
  },
  tripRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0'
  },
  tripRowLeft: {
    flex: 1
  },
  tripDate: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333'
  },
  tripDetails: {
    fontSize: 11,
    color: '#666',
    marginTop: 2
  },
  tripRowRight: {
    alignItems: 'flex-end'
  },
  tripEarnings: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#10B981'
  },
  tripRating: {
    fontSize: 11,
    color: '#F59E0B',
    marginTop: 2
  },
  benchmarkSection: {
    marginVertical: 12
  },
  benchmarkDescription: {
    fontSize: 12,
    color: '#666',
    marginBottom: 12
  },
  benchmarkCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    elevation: 1
  },
  benchmarkHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  benchmarkLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333'
  },
  benchmarkYourScore: {
    fontSize: 14,
    fontWeight: 'bold'
  },
  benchmarkComparison: {
    marginTop: 8
  },
  benchmarkSmall: {
    fontSize: 10,
    color: '#666',
    marginBottom: 4
  },
  benchmarkBar: {
    height: 6,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
    marginVertical: 6,
    overflow: 'hidden'
  },
  benchmarkFill: {
    height: '100%',
    borderRadius: 3
  },
  benchmarkTabs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 12
  },
  benchmarkTab: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginHorizontal: 4,
    borderRadius: 6,
    backgroundColor: '#F0F0F0',
    alignItems: 'center'
  },
  benchmarkTabActive: {
    backgroundColor: '#FF6B35'
  },
  benchmarkTabText: {
    fontSize: 10,
    color: '#333',
    fontWeight: '500'
  },
  benchmarkTabTextActive: {
    color: '#FFF',
    fontWeight: '600'
  },
  benchmarkInfoCard: {
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B35'
  },
  benchmarkInfoTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4
  },
  benchmarkInfoText: {
    fontSize: 11,
    color: '#666',
    marginVertical: 2
  },
  platformStatsSection: {
    marginVertical: 12
  },
  statCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    elevation: 1,
    borderLeftWidth: 4,
    borderLeftColor: '#3B82F6'
  },
  statCardTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4
  },
  statCardText: {
    fontSize: 11,
    color: '#666'
  },
  suggestionsSection: {
    marginVertical: 12
  },
  prioritySection: {
    marginBottom: 12
  },
  priorityTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8
  },
  suggestionCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    elevation: 1,
    borderLeftWidth: 4,
    borderLeftColor: '#FF6B35'
  },
  suggestionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  suggestionCategory: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FF6B35',
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4
  },
  suggestionConfidence: {
    fontSize: 10,
    color: '#666'
  },
  suggestionText: {
    fontSize: 12,
    color: '#333',
    marginBottom: 8,
    fontWeight: '500'
  },
  suggestionImpact: {
    backgroundColor: '#F9F9F9',
    borderRadius: 6,
    padding: 8,
    marginTop: 4
  },
  suggestionImpactLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666'
  },
  suggestionImpactText: {
    fontSize: 11,
    color: '#333',
    marginTop: 2
  },
  errorContainer: {
    backgroundColor: '#FEE',
    borderLeftWidth: 4,
    borderLeftColor: '#E53E3E',
    padding: 12,
    borderRadius: 8,
    marginVertical: 16
  },
  errorText: {
    fontSize: 12,
    color: '#C53030'
  }
});
