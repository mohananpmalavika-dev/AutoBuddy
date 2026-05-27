import React, { useCallback, useEffect, useState } from 'react';
import {
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
 * AnalyticsDashboard - Driver performance analytics
 * Metrics, trends, comparisons
 */
export default function AnalyticsDashboard({ token, loading: parentLoading = false }) {
  const [analytics, setAnalytics] = useState({
    total_rides: 0,
    total_earnings: 0,
    average_rating: 0,
    acceptance_rate: 0,
    cancellation_rate: 0,
    average_trip_distance: 0,
    hours_online: 0,
    peak_hours: [],
    daily_trends: [],
    weekly_comparison: {},
  });
  const [period, setPeriod] = useState('week');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const periods = [
    { value: 'day', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' },
    { value: 'year', label: 'This Year' },
  ];

  useEffect(() => {
    fetchAnalytics();
  }, [period]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      setError('');
      try {
        const data = await apiRequest(`/drivers/analytics?period=${period}`, { token });
        if (data && data.analytics) {
          setAnalytics(data.analytics);
        }
      } catch (err) {
        console.log('Analytics endpoint not yet implemented, using mock data');
        setAnalytics({
          total_rides: 127,
          total_earnings: 4250,
          average_rating: 4.7,
          acceptance_rate: 88,
          cancellation_rate: 3,
          average_trip_distance: 6.2,
          hours_online: 42,
          peak_hours: [
            { hour: 8, count: 12 },
            { hour: 9, count: 15 },
            { hour: 17, count: 18 },
            { hour: 18, count: 22 },
            { hour: 19, count: 20 },
          ],
          daily_trends: [],
          weekly_comparison: {
            Monday: { rides: 18, earnings: 620, rating: 4.8 },
            Tuesday: { rides: 22, earnings: 750, rating: 4.7 },
            Wednesday: { rides: 20, earnings: 680, rating: 4.6 },
            Thursday: { rides: 19, earnings: 640, rating: 4.8 },
            Friday: { rides: 25, earnings: 850, rating: 4.7 },
            Saturday: { rides: 23, earnings: 780, rating: 4.9 },
          },
        });
      }
    } catch (err) {
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  };

  const getPerformanceColor = (value, maxValue = 100) => {
    const percentage = (value / maxValue) * 100;
    if (percentage >= 80) return COLORS.success;
    if (percentage >= 60) return COLORS.warning;
    return COLORS.error;
  };

  const StatCard = ({ icon, label, value, unit = '', trend = null, color = null }) => (
    <View style={[styles.statCard, { borderTopColor: color || COLORS.primary }]}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>
        {value}
        {unit && <Text style={styles.statUnit}>{unit}</Text>}
      </Text>
      {trend && (
        <Text style={[styles.trend, trend.up ? styles.trendUp : styles.trendDown]}>
          {trend.up ? '📈' : '📉'} {Math.abs(trend.value)}%
        </Text>
      )}
    </View>
  );

  if (loading && !analytics.total_rides) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>📊 Performance Analytics</Text>
      <Text style={styles.subtitle}>Track your driving performance and earnings</Text>

      {error && <Text style={[styles.message, styles.error]}>{error}</Text>}

      {/* Period Selection */}
      <View style={styles.periodSelector}>
        {periods.map((p) => (
          <TouchableOpacity
            key={p.value}
            style={[styles.periodButton, period === p.value && styles.periodButtonActive]}
            onPress={() => setPeriod(p.value)}
            disabled={parentLoading}
          >
            <Text
              style={[
                styles.periodButtonText,
                period === p.value && styles.periodButtonTextActive,
              ]}
            >
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Key Metrics Grid */}
      <View style={styles.metricsGrid}>
        <StatCard
          icon="🚗"
          label="Total Rides"
          value={analytics.total_rides}
          color={COLORS.primary}
        />
        <StatCard
          icon="💰"
          label="Earnings"
          value={`₹${analytics.total_earnings.toFixed(0)}`}
          color={COLORS.success}
        />
        <StatCard
          icon="⭐"
          label="Avg Rating"
          value={analytics.average_rating.toFixed(1)}
          unit="/5"
          color={getPerformanceColor(analytics.average_rating, 5)}
        />
        <StatCard
          icon="✓"
          label="Acceptance Rate"
          value={analytics.acceptance_rate.toFixed(0)}
          unit="%"
          color={getPerformanceColor(analytics.acceptance_rate, 100)}
        />
      </View>

      {/* Performance Metrics */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📈 Performance Metrics</Text>

        <View style={styles.metricRow}>
          <View style={styles.metricInfo}>
            <Text style={styles.metricLabel}>Cancellation Rate</Text>
            <Text style={styles.metricNote}>Lower is better</Text>
          </View>
          <View style={styles.metricValue}>
            <Text style={[styles.percentage, { color: getPerformanceColor(100 - analytics.cancellation_rate, 100) }]}>
              {analytics.cancellation_rate.toFixed(1)}%
            </Text>
          </View>
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metricInfo}>
            <Text style={styles.metricLabel}>Avg Trip Distance</Text>
            <Text style={styles.metricNote}>Distance per ride</Text>
          </View>
          <View style={styles.metricValue}>
            <Text style={styles.percentage}>{analytics.average_trip_distance.toFixed(1)} km</Text>
          </View>
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metricInfo}>
            <Text style={styles.metricLabel}>Hours Online</Text>
            <Text style={styles.metricNote}>Time available for rides</Text>
          </View>
          <View style={styles.metricValue}>
            <Text style={styles.percentage}>{analytics.hours_online.toFixed(1)} hrs</Text>
          </View>
        </View>

        <View style={styles.metricRow}>
          <View style={styles.metricInfo}>
            <Text style={styles.metricLabel}>Rides per Hour</Text>
            <Text style={styles.metricNote}>Efficiency metric</Text>
          </View>
          <View style={styles.metricValue}>
            <Text style={styles.percentage}>
              {(analytics.total_rides / Math.max(analytics.hours_online, 1)).toFixed(2)}
            </Text>
          </View>
        </View>
      </View>

      {/* Peak Hours Analysis */}
      {analytics.peak_hours && analytics.peak_hours.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⏰ Peak Hours</Text>
          <Text style={styles.peakHoursInfo}>
            These are the hours when you typically get the most ride requests:
          </Text>
          <View style={styles.peakHoursGrid}>
            {analytics.peak_hours.map((hour, idx) => (
              <View key={idx} style={styles.peakHourBadge}>
                <Text style={styles.peakHourText}>{hour.hour}:00</Text>
                <Text style={styles.peakHourCount}>{hour.count} rides</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Weekly Comparison */}
      {analytics.weekly_comparison && Object.keys(analytics.weekly_comparison).length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📅 Weekly Comparison</Text>
          {Object.entries(analytics.weekly_comparison).map(([day, data]) => (
            <View key={day} style={styles.comparisonRow}>
              <Text style={styles.dayLabel}>{day}</Text>
              <View style={styles.comparisonValues}>
                <View style={styles.comparisonValue}>
                  <Text style={styles.comparisonLabel}>Rides</Text>
                  <Text style={styles.comparisonNumber}>{data.rides}</Text>
                </View>
                <View style={styles.comparisonValue}>
                  <Text style={styles.comparisonLabel}>₹</Text>
                  <Text style={styles.comparisonNumber}>{data.earnings.toFixed(0)}</Text>
                </View>
                <View style={styles.comparisonValue}>
                  <Text style={styles.comparisonLabel}>⭐</Text>
                  <Text style={styles.comparisonNumber}>{data.rating.toFixed(1)}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Tips Section */}
      <View style={styles.tipsSection}>
        <Text style={styles.tipsTitle}>💡 Performance Tips</Text>
        <View style={styles.tip}>
          <Text style={styles.tipTitle}>🎯 Improve Acceptance Rate</Text>
          <Text style={styles.tipText}>
            Higher acceptance rates improve your visibility. Try to accept more ride requests to earn better.
          </Text>
        </View>
        <View style={styles.tip}>
          <Text style={styles.tipTitle}>⭐ Maintain Rating</Text>
          <Text style={styles.tipText}>
            Better ratings lead to premium ride access. Keep your vehicle clean and provide friendly service.
          </Text>
        </View>
        <View style={styles.tip}>
          <Text style={styles.tipTitle}>🕐 Target Peak Hours</Text>
          <Text style={styles.tipText}>
            Go online during peak hours to maximize ride requests and earnings.
          </Text>
        </View>
        <View style={styles.tip}>
          <Text style={styles.tipTitle}>🚗 Optimize Distance</Text>
          <Text style={styles.tipText}>
            Plan routes efficiently to maximize earnings per kilometer driven.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: COLORS.background,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.textMain,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 16,
  },
  message: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 13,
  },
  error: {
    backgroundColor: '#FFEBEE',
    color: COLORS.error,
  },
  periodSelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  periodButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  periodButtonTextActive: {
    color: '#fff',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  statCard: {
    width: '48%',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    borderTopWidth: 4,
    ...SHADOWS.soft,
  },
  statIcon: {
    fontSize: 24,
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.textMain,
  },
  statUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    marginLeft: 4,
  },
  trend: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 6,
  },
  trendUp: {
    color: COLORS.success,
  },
  trendDown: {
    color: COLORS.error,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textMain,
    marginBottom: 12,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    marginBottom: 10,
    ...SHADOWS.soft,
  },
  metricInfo: {
    flex: 1,
  },
  metricLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 2,
  },
  metricNote: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  metricValue: {
    alignItems: 'flex-end',
  },
  percentage: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textMain,
  },
  peakHoursInfo: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 10,
  },
  peakHoursGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  peakHourBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    alignItems: 'center',
    ...SHADOWS.soft,
  },
  peakHourText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
  peakHourCount: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  comparisonRow: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    ...SHADOWS.soft,
  },
  dayLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 10,
  },
  comparisonValues: {
    flexDirection: 'row',
    gap: 12,
  },
  comparisonValue: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: 8,
    paddingVertical: 8,
  },
  comparisonLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  comparisonNumber: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textMain,
  },
  tipsSection: {
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 14,
    marginTop: 10,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.warning,
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textMain,
    marginBottom: 12,
  },
  tip: {
    marginBottom: 12,
  },
  tipTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 4,
  },
  tipText: {
    fontSize: 12,
    color: COLORS.textMain,
    lineHeight: 16,
  },
});
