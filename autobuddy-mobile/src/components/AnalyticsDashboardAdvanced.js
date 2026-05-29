import React, { useState, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  Modal,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { LineChart, BarChart } from 'react-native-chart-kit';
import { COLORS, SHADOWS } from '../theme';
import apiRequest from '../services/apiClient';

const screenWidth = Dimensions.get('window').width;

/**
 * Advanced Analytics Dashboard with trend charts and deeper metrics
 */
export default function AnalyticsDashboardAdvanced({
  driverId,
  token,
  currentMetrics = {},
  historicalData = [],
  isLoading = false,
}) {
  const [selectedMetric, setSelectedMetric] = useState('earnings');
  const [showTrendModal, setShowTrendModal] = useState(false);
  const [showPeakHoursModal, setShowPeakHoursModal] = useState(false);
  const [dashboardData, setDashboardData] = useState(null);
  const [chartLoading, setChartLoading] = useState(false);

  // Fetch advanced analytics data
  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        setChartLoading(true);
        const response = await apiRequest({
          method: 'GET',
          endpoint: `/api/drivers/${driverId}/analytics/advanced`,
          token,
        });
        if (response?.data) {
          setDashboardData(response.data);
        }
      } catch (err) {
        console.warn('Failed to load analytics:', err?.message);
      } finally {
        setChartLoading(false);
      }
    };

    if (driverId && token) {
      loadAnalytics();
    }
  }, [driverId, token]);

  // Calculate 30-day earnings trend
  const earningsTrend = useMemo(() => {
    const data = dashboardData?.earnings_trend || [];
    if (!Array.isArray(data) || data.length === 0) return null;

    const last30Days = data.slice(-30);
    return {
      labels: last30Days.map((d, i) => i % 5 === 0 ? `Day ${i + 1}` : ''),
      datasets: [
        {
          data: last30Days.map(d => Number(d.amount || 0)),
          color: () => '#1976D2',
          strokeWidth: 2,
        }
      ],
    };
  }, [dashboardData]);

  // Calculate peak hours heatmap data
  const peakHoursData = useMemo(() => {
    const data = dashboardData?.peak_hours || {};
    if (!data || Object.keys(data).length === 0) return null;

    const hours = Array.from({ length: 24 }, (_, i) => i);
    const requestCounts = hours.map(h => Number(data[h] || 0));
    
    return {
      labels: hours.map(h => `${h}:00`),
      datasets: [
        {
          data: requestCounts,
          color: () => '#FF9800',
          strokeWidth: 0,
        }
      ],
    };
  }, [dashboardData]);

  // Calculate passenger satisfaction metrics
  const satisfactionMetrics = useMemo(() => {
    const data = dashboardData?.satisfaction || {};
    return {
      avg_rating: Number(data.avg_rating || 0),
      rating_distribution: data.rating_distribution || {},
      repeat_rate: Number(data.repeat_rate || 0),
      total_passengers: Number(data.total_passengers || 0),
    };
  }, [dashboardData]);

  // Calculate cancellation analysis
  const cancellationAnalysis = useMemo(() => {
    const data = dashboardData?.cancellation_reasons || {};
    if (!data || Object.keys(data).length === 0) return null;

    const sorted = Object.entries(data)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    const total = sorted.reduce((sum, [, count]) => sum + count, 0);
    return sorted.map(([reason, count]) => ({
      reason,
      count,
      percentage: ((count / total) * 100).toFixed(1),
    }));
  }, [dashboardData]);

  // Calculate performance score
  const performanceScore = useMemo(() => {
    const metrics = currentMetrics;
    const baseScore = 50;
    const ratingScore = Math.min((Number(metrics.average_rating || 0) / 5) * 30, 30);
    const acceptanceScore = Math.min((Number(metrics.acceptance_rate || 0) / 100) * 20, 20);
    return Math.round(baseScore + ratingScore + acceptanceScore);
  }, [currentMetrics]);

  const getPerformanceColor = (score) => {
    if (score >= 90) return '#4CAF50';
    if (score >= 75) return '#FFC107';
    return '#FF5722';
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📊 Advanced Analytics</Text>
        <Text style={styles.headerSubtitle}>Trends, insights & performance metrics</Text>
      </View>

      {isLoading || chartLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1976D2" />
          <Text style={styles.loadingText}>Loading analytics...</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Performance Score Card */}
          <View style={styles.performanceCard}>
            <View style={styles.performanceCircle}>
              <Text
                style={[
                  styles.performanceScore,
                  { color: getPerformanceColor(performanceScore) }
                ]}
              >
                {performanceScore}
              </Text>
              <Text style={styles.performanceLabel}>Score</Text>
            </View>
            <View style={styles.performanceDetails}>
              <Text style={styles.performanceTitle}>Overall Performance</Text>
              <View style={styles.performanceStats}>
                <Text style={styles.performanceStat}>
                  ⭐ {(currentMetrics.average_rating || 0).toFixed(1)}/5.0
                </Text>
                <Text style={styles.performanceStat}>
                  ✓ {(currentMetrics.acceptance_rate || 0).toFixed(0)}% Acceptance
                </Text>
                <Text style={styles.performanceStat}>
                  🚗 {currentMetrics.total_rides || 0} Total Rides
                </Text>
              </View>
            </View>
          </View>

          {/* Quick Stats */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Monthly Earnings</Text>
              <Text style={styles.statValue}>₹{(currentMetrics.monthly_earnings || 0).toLocaleString()}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Avg Trip Distance</Text>
              <Text style={styles.statValue}>{(currentMetrics.avg_distance || 0).toFixed(1)}km</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Hours Online</Text>
              <Text style={styles.statValue}>{(currentMetrics.hours_online || 0).toFixed(0)}h</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Repeat Passengers</Text>
              <Text style={styles.statValue}>{(satisfactionMetrics.repeat_rate || 0).toFixed(0)}%</Text>
            </View>
          </View>

          {/* Earnings Trend Chart */}
          {earningsTrend && (
            <View style={styles.chartSection}>
              <TouchableOpacity
                style={styles.chartHeader}
                onPress={() => setShowTrendModal(true)}
              >
                <Text style={styles.chartTitle}>📈 30-Day Earnings Trend</Text>
                <Text style={styles.chartAction}>View →</Text>
              </TouchableOpacity>
              <View style={styles.chartContainer}>
                <LineChart
                  data={earningsTrend}
                  width={screenWidth - 50}
                  height={250}
                  chartConfig={{
                    backgroundColor: '#FFF',
                    backgroundGradientFrom: '#FFF',
                    backgroundGradientTo: '#FFF',
                    color: (opacity = 1) => `rgba(25, 118, 210, ${opacity})`,
                    labelColor: (opacity = 1) => `rgba(51, 51, 51, ${opacity})`,
                    strokeWidth: 2,
                    propsForBackgroundLines: {
                      strokeDasharray: '0',
                      stroke: '#E0E0E0',
                    },
                  }}
                  bezier
                />
              </View>
            </View>
          )}

          {/* Peak Hours Analysis */}
          {peakHoursData && (
            <View style={styles.chartSection}>
              <TouchableOpacity
                style={styles.chartHeader}
                onPress={() => setShowPeakHoursModal(true)}
              >
                <Text style={styles.chartTitle}>🔥 Peak Hours Analysis</Text>
                <Text style={styles.chartAction}>View →</Text>
              </TouchableOpacity>
              <View style={styles.chartContainer}>
                <BarChart
                  data={peakHoursData}
                  width={screenWidth - 50}
                  height={250}
                  chartConfig={{
                    backgroundColor: '#FFF',
                    backgroundGradientFrom: '#FFF',
                    backgroundGradientTo: '#FFF',
                    color: (opacity = 1) => `rgba(255, 152, 0, ${opacity})`,
                    labelColor: (opacity = 1) => `rgba(51, 51, 51, ${opacity})`,
                    barPercentage: 0.8,
                    propsForBackgroundLines: {
                      strokeDasharray: '0',
                      stroke: '#E0E0E0',
                    },
                  }}
                />
              </View>
            </View>
          )}

          {/* Passenger Satisfaction */}
          <View style={styles.metricsSection}>
            <Text style={styles.sectionTitle}>👥 Passenger Satisfaction</Text>
            <View style={styles.satisfactionCard}>
              <View style={styles.satisfactionItem}>
                <Text style={styles.satisfactionLabel}>Average Rating</Text>
                <Text style={styles.satisfactionValue}>
                  {satisfactionMetrics.avg_rating.toFixed(1)} ⭐
                </Text>
              </View>
              <View style={styles.satisfactionItem}>
                <Text style={styles.satisfactionLabel}>Repeat Passengers</Text>
                <Text style={styles.satisfactionValue}>
                  {satisfactionMetrics.repeat_rate.toFixed(0)}%
                </Text>
              </View>
              <View style={styles.satisfactionItem}>
                <Text style={styles.satisfactionLabel}>Total Passengers</Text>
                <Text style={styles.satisfactionValue}>
                  {satisfactionMetrics.total_passengers}
                </Text>
              </View>
            </View>
          </View>

          {/* Cancellation Analysis */}
          {cancellationAnalysis && (
            <View style={styles.metricsSection}>
              <Text style={styles.sectionTitle}>⚠️ Cancellation Analysis</Text>
              <View style={styles.cancellationList}>
                {cancellationAnalysis.map((item, idx) => (
                  <View key={idx} style={styles.cancellationItem}>
                    <View style={styles.cancellationInfo}>
                      <Text style={styles.cancellationReason}>{item.reason}</Text>
                      <Text style={styles.cancellationCount}>
                        {item.count} cancellations
                      </Text>
                    </View>
                    <Text style={styles.cancellationPercentage}>{item.percentage}%</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Rating Distribution */}
          <View style={styles.metricsSection}>
            <Text style={styles.sectionTitle}>⭐ Rating Distribution</Text>
            <View style={styles.ratingDistribution}>
              {[5, 4, 3, 2, 1].map(rating => {
                const count = satisfactionMetrics.rating_distribution?.[rating] || 0;
                const total = satisfactionMetrics.total_passengers || 1;
                const percentage = (count / total) * 100;
                return (
                  <View key={rating} style={styles.ratingRow}>
                    <Text style={styles.ratingLabel}>{rating}★</Text>
                    <View style={styles.ratingBar}>
                      <View
                        style={[
                          styles.ratingBarFill,
                          {
                            width: `${percentage}%`,
                            backgroundColor: rating >= 4 ? '#4CAF50' : rating >= 3 ? '#FFC107' : '#FF5722',
                          }
                        ]}
                      />
                    </View>
                    <Text style={styles.ratingCount}>{count}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Additional Metrics */}
          <View style={styles.metricsSection}>
            <Text style={styles.sectionTitle}>📊 Additional Metrics</Text>
            <View style={styles.metricsList}>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Cancellation Rate</Text>
                <Text style={styles.metricValue}>
                  {(currentMetrics.cancellation_rate || 0).toFixed(1)}%
                </Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Completion Rate</Text>
                <Text style={styles.metricValue}>
                  {(currentMetrics.completion_rate || 0).toFixed(1)}%
                </Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Avg Rating This Week</Text>
                <Text style={styles.metricValue}>
                  {(currentMetrics.weekly_avg_rating || 0).toFixed(1)}/5.0
                </Text>
              </View>
              <View style={styles.metricItem}>
                <Text style={styles.metricLabel}>Response Time</Text>
                <Text style={styles.metricValue}>
                  {(currentMetrics.avg_response_time || 0).toFixed(1)}s
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.footerPadding} />
        </ScrollView>
      )}

      {/* Trend Modal */}
      <Modal
        visible={showTrendModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTrendModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>30-Day Earnings Trend</Text>
              <TouchableOpacity onPress={() => setShowTrendModal(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            {earningsTrend && (
              <ScrollView style={styles.modalContent}>
                <LineChart
                  data={earningsTrend}
                  width={screenWidth - 60}
                  height={300}
                  chartConfig={{
                    backgroundColor: '#FFF',
                    backgroundGradientFrom: '#FFF',
                    backgroundGradientTo: '#FFF',
                    color: (opacity = 1) => `rgba(25, 118, 210, ${opacity})`,
                    labelColor: (opacity = 1) => `rgba(51, 51, 51, ${opacity})`,
                    strokeWidth: 2,
                  }}
                  bezier
                />
                <Text style={styles.modalInsight}>
                  Your earnings have been stable over the last 30 days. Try increasing your availability
                  during peak hours to boost earnings.
                </Text>
              </ScrollView>
            )}

            <TouchableOpacity
              style={styles.modalCloseAction}
              onPress={() => setShowTrendModal(false)}
            >
              <Text style={styles.modalCloseActionText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Peak Hours Modal */}
      <Modal
        visible={showPeakHoursModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPeakHoursModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Peak Hours Heatmap</Text>
              <TouchableOpacity onPress={() => setShowPeakHoursModal(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            {peakHoursData && (
              <ScrollView style={styles.modalContent}>
                <BarChart
                  data={peakHoursData}
                  width={screenWidth - 60}
                  height={300}
                  chartConfig={{
                    backgroundColor: '#FFF',
                    backgroundGradientFrom: '#FFF',
                    backgroundGradientTo: '#FFF',
                    color: (opacity = 1) => `rgba(255, 152, 0, ${opacity})`,
                    labelColor: (opacity = 1) => `rgba(51, 51, 51, ${opacity})`,
                    barPercentage: 0.8,
                  }}
                />
                <Text style={styles.modalInsight}>
                  Your peak request hours are during morning rush (7-10 AM) and evening rush (5-8 PM).
                  Maximize availability during these times for better earnings.
                </Text>
              </ScrollView>
            )}

            <TouchableOpacity
              style={styles.modalCloseAction}
              onPress={() => setShowPeakHoursModal(false)}
            >
              <Text style={styles.modalCloseActionText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  header: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: '#1976D2',
    paddingTop: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#E3F2FD',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  performanceCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 16,
    ...SHADOWS.card,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  performanceCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#E0E0E0',
    marginRight: 16,
  },
  performanceScore: {
    fontSize: 32,
    fontWeight: '700',
  },
  performanceLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginTop: 4,
  },
  performanceDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  performanceTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  performanceStats: {
    gap: 6,
  },
  performanceStat: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    minWidth: '48%',
    backgroundColor: '#FFF',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    ...SHADOWS.card,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
    marginBottom: 6,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1976D2',
  },
  chartSection: {
    marginBottom: 20,
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    ...SHADOWS.card,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  chartTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
  },
  chartAction: {
    fontSize: 12,
    color: '#1976D2',
    fontWeight: '600',
  },
  chartContainer: {
    alignItems: 'center',
    marginVertical: 8,
  },
  metricsSection: {
    marginBottom: 20,
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    ...SHADOWS.card,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  satisfactionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  satisfactionItem: {
    flex: 1,
    alignItems: 'center',
  },
  satisfactionLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
    marginBottom: 6,
  },
  satisfactionValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1976D2',
  },
  cancellationList: {
    gap: 12,
  },
  cancellationItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FFF',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FF5722',
  },
  cancellationInfo: {
    flex: 1,
  },
  cancellationReason: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  cancellationCount: {
    fontSize: 11,
    color: '#999',
  },
  cancellationPercentage: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FF5722',
  },
  ratingDistribution: {
    gap: 12,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ratingLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
    width: 30,
  },
  ratingBar: {
    flex: 1,
    height: 8,
    backgroundColor: '#F0F0F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  ratingBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  ratingCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    width: 30,
    textAlign: 'right',
  },
  metricsList: {
    gap: 12,
  },
  metricItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1976D2',
  },
  footerPadding: {
    height: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modal: {
    flex: 1,
    backgroundColor: '#FFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    marginTop: 50,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  modalCloseButton: {
    fontSize: 24,
    fontWeight: '700',
    color: '#999',
  },
  modalContent: {
    flex: 1,
    paddingVertical: 12,
  },
  modalInsight: {
    fontSize: 13,
    color: '#666',
    fontWeight: '600',
    marginTop: 16,
    lineHeight: 20,
    paddingHorizontal: 12,
  },
  modalCloseAction: {
    paddingVertical: 12,
    borderRadius: 6,
    backgroundColor: '#1976D2',
    alignItems: 'center',
    marginTop: 12,
  },
  modalCloseActionText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
});
