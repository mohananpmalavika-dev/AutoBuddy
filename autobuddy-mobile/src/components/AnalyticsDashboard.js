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

const EMPTY_ANALYTICS = {
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
  dispatch_attempts: { accepted: 0, rejected: 0, expired: 0, total: 0 },
};

const PERIODS = [
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'This Year' },
];

function numberValue(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPerformanceColor(value, maxValue = 100) {
  const percentage = (numberValue(value) / Math.max(numberValue(maxValue), 1)) * 100;
  if (percentage >= 80) return COLORS.success;
  if (percentage >= 60) return COLORS.warning;
  return COLORS.error;
}

function StatCard({ label, value, unit = '', color = null }) {
  return (
    <View style={[styles.statCard, { borderTopColor: color || COLORS.primary }]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>
        {value}
        {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
      </Text>
    </View>
  );
}

export default function AnalyticsDashboard({ token, loading: parentLoading = false }) {
  const [analytics, setAnalytics] = useState(EMPTY_ANALYTICS);
  const [period, setPeriod] = useState('week');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await apiRequest('/drivers/analytics', {
        token,
        query: { period },
      });
      setAnalytics({ ...EMPTY_ANALYTICS, ...(data?.analytics || {}) });
    } catch (err) {
      setAnalytics(EMPTY_ANALYTICS);
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [period, token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchAnalytics().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchAnalytics]);

  const totalRides = numberValue(analytics.total_rides);
  const totalEarnings = numberValue(analytics.total_earnings);
  const averageRating = numberValue(analytics.average_rating);
  const acceptanceRate = numberValue(analytics.acceptance_rate);
  const cancellationRate = numberValue(analytics.cancellation_rate);
  const averageTripDistance = numberValue(analytics.average_trip_distance);
  const hoursOnline = numberValue(analytics.hours_online);

  if (loading && !totalRides) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Performance Analytics</Text>
      <Text style={styles.subtitle}>Real backend metrics from completed rides, dispatches, and online sessions</Text>

      {error ? <Text style={[styles.message, styles.error]}>{error}</Text> : null}

      <View style={styles.periodSelector}>
        {PERIODS.map((item) => (
          <TouchableOpacity
            key={item.value}
            style={[styles.periodButton, period === item.value && styles.periodButtonActive]}
            onPress={() => setPeriod(item.value)}
            disabled={parentLoading}
          >
            <Text style={[styles.periodButtonText, period === item.value && styles.periodButtonTextActive]}>
              {item.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.metricsGrid}>
        <StatCard label="Total Rides" value={totalRides} color={COLORS.primary} />
        <StatCard label="Earnings" value={`Rs ${totalEarnings.toFixed(0)}`} color={COLORS.success} />
        <StatCard
          label="Avg Rating"
          value={averageRating.toFixed(1)}
          unit="/5"
          color={getPerformanceColor(averageRating, 5)}
        />
        <StatCard
          label="Acceptance Rate"
          value={acceptanceRate.toFixed(0)}
          unit="%"
          color={getPerformanceColor(acceptanceRate, 100)}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Performance Metrics</Text>

        <MetricRow
          label="Cancellation Rate"
          note="Lower is better"
          value={`${cancellationRate.toFixed(1)}%`}
          color={getPerformanceColor(100 - cancellationRate, 100)}
        />
        <MetricRow
          label="Avg Trip Distance"
          note="Distance per completed ride"
          value={`${averageTripDistance.toFixed(1)} km`}
        />
        <MetricRow
          label="Hours Online"
          note="Tracked from availability changes"
          value={`${hoursOnline.toFixed(1)} hrs`}
        />
        <MetricRow
          label="Rides per Hour"
          note="Completed rides divided by online hours"
          value={(totalRides / Math.max(hoursOnline, 1)).toFixed(2)}
        />
      </View>

      {analytics.dispatch_attempts ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Dispatch Attempts</Text>
          <View style={styles.dispatchGrid}>
            <DispatchPill label="Accepted" value={analytics.dispatch_attempts.accepted} />
            <DispatchPill label="Rejected" value={analytics.dispatch_attempts.rejected} />
            <DispatchPill label="Expired" value={analytics.dispatch_attempts.expired} />
            <DispatchPill label="Total" value={analytics.dispatch_attempts.total} />
          </View>
        </View>
      ) : null}

      {analytics.peak_hours?.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Peak Hours</Text>
          <Text style={styles.peakHoursInfo}>Hours with the most completed rides in this period.</Text>
          <View style={styles.peakHoursGrid}>
            {analytics.peak_hours.map((hour) => (
              <View key={`${hour.hour}-${hour.count}`} style={styles.peakHourBadge}>
                <Text style={styles.peakHourText}>{hour.hour}:00</Text>
                <Text style={styles.peakHourCount}>{hour.count} rides</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {analytics.weekly_comparison && Object.keys(analytics.weekly_comparison).length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Daily Comparison</Text>
          {Object.entries(analytics.weekly_comparison).map(([day, data]) => (
            <View key={day} style={styles.comparisonRow}>
              <Text style={styles.dayLabel}>{day}</Text>
              <View style={styles.comparisonValues}>
                <ComparisonValue label="Rides" value={numberValue(data.rides)} />
                <ComparisonValue label="Rs" value={numberValue(data.earnings).toFixed(0)} />
                <ComparisonValue label="Rating" value={numberValue(data.rating || averageRating).toFixed(1)} />
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {!loading && !error && totalRides === 0 ? (
        <View style={styles.emptySection}>
          <Text style={styles.emptyTitle}>No completed rides for this period yet</Text>
          <Text style={styles.emptyText}>
            Analytics will update from completed bookings, dispatch responses, and availability sessions.
          </Text>
        </View>
      ) : null}

      <View style={styles.tipsSection}>
        <Text style={styles.tipsTitle}>Performance Tips</Text>
        <Tip title="Improve Acceptance Rate" text="Higher acceptance rates improve your visibility for matching." />
        <Tip title="Maintain Rating" text="Better ratings can improve passenger trust and repeat demand." />
        <Tip title="Target Peak Hours" text="Use your peak-hour data to plan when to stay online." />
        <Tip title="Optimize Distance" text="Efficient routes help maximize earnings per kilometer." />
      </View>
    </ScrollView>
  );
}

function MetricRow({ label, note, value, color = COLORS.textMain }) {
  return (
    <View style={styles.metricRow}>
      <View style={styles.metricInfo}>
        <Text style={styles.metricLabel}>{label}</Text>
        <Text style={styles.metricNote}>{note}</Text>
      </View>
      <View style={styles.metricValue}>
        <Text style={[styles.percentage, { color }]}>{value}</Text>
      </View>
    </View>
  );
}

function DispatchPill({ label, value }) {
  return (
    <View style={styles.dispatchPill}>
      <Text style={styles.dispatchLabel}>{label}</Text>
      <Text style={styles.dispatchValue}>{numberValue(value)}</Text>
    </View>
  );
}

function ComparisonValue({ label, value }) {
  return (
    <View style={styles.comparisonValue}>
      <Text style={styles.comparisonLabel}>{label}</Text>
      <Text style={styles.comparisonNumber}>{value}</Text>
    </View>
  );
}

function Tip({ title, text }) {
  return (
    <View style={styles.tip}>
      <Text style={styles.tipTitle}>{title}</Text>
      <Text style={styles.tipText}>{text}</Text>
    </View>
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
  dispatchGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  dispatchPill: {
    width: '48%',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 12,
    ...SHADOWS.soft,
  },
  dispatchLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 4,
  },
  dispatchValue: {
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
  emptySection: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
    ...SHADOWS.soft,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textMain,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 17,
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
