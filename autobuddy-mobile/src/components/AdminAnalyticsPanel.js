import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { apiRequest } from '../lib/api';
import { SHADOWS } from '../theme';

function formatCurrency(value) {
  const amount = Number(value || 0);
  return `Rs ${amount.toFixed(2)}`;
}

function StatCard({ label, value }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function BarRow({ label, value, max, suffix = '' }) {
  const widthPercent = Math.max(0, Math.min(100, (Number(value || 0) / Math.max(Number(max || 1), 1)) * 100));
  return (
    <View style={styles.barRow}>
      <View style={styles.barHead}>
        <Text style={styles.barLabel}>{label}</Text>
        <Text style={styles.barValue}>
          {value}
          {suffix}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${widthPercent}%` }]} />
      </View>
    </View>
  );
}

export default function AdminAnalyticsPanel({ token }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payload, setPayload] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/admin/analytics/live?days=30&forecast_days=7', { token });
      setPayload(data);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let mounted = true;
    const kickoff = setTimeout(() => {
      if (mounted) {
        void load();
      }
    }, 0);
    const timer = setInterval(() => {
      if (mounted) {
        void load();
      }
    }, 15000);
    return () => {
      mounted = false;
      clearTimeout(kickoff);
      clearInterval(timer);
    };
  }, [load]);

  const peakHours = useMemo(() => {
    const hourMap = {};
    const rows = Array.isArray(payload?.demand) ? payload.demand : [];
    for (const row of rows) {
      const hour = Number(row?.hour);
      if (!Number.isFinite(hour)) {
        continue;
      }
      hourMap[hour] = Number(hourMap[hour] || 0) + Number(row?.rides || 0);
    }
    const list = Object.entries(hourMap)
      .map(([hour, rides]) => ({ hour: Number(hour), rides: Number(rides || 0) }))
      .sort((a, b) => b.rides - a.rides)
      .slice(0, 6);
    return list;
  }, [payload]);

  const maxPeak = useMemo(
    () => Math.max(...peakHours.map((item) => Number(item.rides || 0)), 1),
    [peakHours],
  );

  const topCities = useMemo(
    () => (Array.isArray(payload?.city_traffic) ? payload.city_traffic.slice(0, 8) : []),
    [payload],
  );
  const maxCityRides = useMemo(
    () => Math.max(...topCities.map((item) => Number(item?.rides || 0)), 1),
    [topCities],
  );

  const topDrivers = useMemo(
    () => (Array.isArray(payload?.driver_performance) ? payload.driver_performance.slice(0, 6) : []),
    [payload],
  );
  const maxDriverCompleted = useMemo(
    () => Math.max(...topDrivers.map((item) => Number(item?.completed || 0)), 1),
    [topDrivers],
  );

  const heatmapTop = useMemo(
    () => (Array.isArray(payload?.heatmap) ? payload.heatmap.slice(0, 6) : []),
    [payload],
  );

  const forecastRows = useMemo(
    () => (Array.isArray(payload?.revenue_forecast?.forecast) ? payload.revenue_forecast.forecast : []),
    [payload],
  );
  const cancellationReasons = useMemo(
    () => (Array.isArray(payload?.booking_cancellation_reasons) ? payload.booking_cancellation_reasons.slice(0, 8) : []),
    [payload],
  );
  const earningsLeaders = useMemo(
    () => (Array.isArray(payload?.driver_earnings_leaderboard) ? payload.driver_earnings_leaderboard.slice(0, 6) : []),
    [payload],
  );
  const retentionSegments = useMemo(
    () =>
      Array.isArray(payload?.customer_retention_chart?.segments)
        ? payload.customer_retention_chart.segments
        : [],
    [payload],
  );
  const fraudAlerts = payload?.fraud_risk_alerts || { high_risk_count: 0, alerts: [] };
  const investorKpi = payload?.investor_kpi_dashboard || {};

  if (loading && !payload) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="small" />
        <Text style={styles.loaderText}>Loading analytics...</Text>
      </View>
    );
  }

  if (error && !payload) {
    return <Text style={styles.errorText}>{error}</Text>;
  }

  const overview = payload?.overview || {};

  return (
    <View>
      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.statsGrid}>
        <StatCard label="Bookings (30d)" value={Number(overview.total_bookings || 0)} />
        <StatCard label="Revenue (30d)" value={formatCurrency(overview.revenue)} />
        <StatCard label="Conversion" value={`${Number(overview.conversion_rate || 0).toFixed(2)}%`} />
        <StatCard label="Active Drivers" value={Number(overview.active_drivers || 0)} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Investor KPI Dashboard</Text>
        <View style={styles.statsGrid}>
          <StatCard label="GMV" value={formatCurrency(investorKpi.gmv)} />
          <StatCard label="AOV" value={formatCurrency(investorKpi.avg_order_value)} />
          <StatCard label="Repeat Rate" value={`${Number(investorKpi.repeat_customer_rate || 0).toFixed(2)}%`} />
          <StatCard label="Cancel Rate" value={`${Number(investorKpi.cancel_rate || 0).toFixed(2)}%`} />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Demand Peaks</Text>
        {peakHours.length === 0 ? (
          <Text style={styles.emptyText}>No demand data for selected window.</Text>
        ) : (
          peakHours.map((item) => (
            <BarRow
              key={`hour-${item.hour}`}
              label={`${String(item.hour).padStart(2, '0')}:00`}
              value={item.rides}
              max={maxPeak}
            />
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>City Traffic Analytics</Text>
        {topCities.length === 0 ? (
          <Text style={styles.emptyText}>No city traffic data available.</Text>
        ) : (
          topCities.map((city) => (
            <BarRow
              key={`city-${city.city}`}
              label={city.city}
              value={city.rides}
              max={maxCityRides}
            />
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Heatmap Hotspots</Text>
        {heatmapTop.length === 0 ? (
          <Text style={styles.emptyText}>No heatmap points yet.</Text>
        ) : (
          heatmapTop.map((point, idx) => (
            <Text key={`heat-${point.lat}-${point.lng}`} style={styles.listRow}>
              #{idx + 1} Lat {point.lat}, Lng {point.lng} | Demand {point.weight} | {formatCurrency(point.revenue)}
            </Text>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Driver Performance</Text>
        {topDrivers.length === 0 ? (
          <Text style={styles.emptyText}>No driver performance data yet.</Text>
        ) : (
          topDrivers.map((driver) => (
            <View key={`driver-${driver.driver_id}`} style={styles.driverBlock}>
              <Text style={styles.driverTitle}>
                {driver.driver_id} | Rating {Number(driver.avg_rating || 0).toFixed(2)}
              </Text>
              <BarRow
                label="Completed Rides"
                value={driver.completed}
                max={maxDriverCompleted}
              />
              <Text style={styles.driverMeta}>
                Completion {Number(driver.completion_rate || 0).toFixed(2)}% | Revenue {formatCurrency(driver.revenue)}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Driver Earnings Leaderboard</Text>
        {earningsLeaders.length === 0 ? (
          <Text style={styles.emptyText}>No earnings data yet.</Text>
        ) : (
          earningsLeaders.map((item, idx) => (
            <Text key={`earn-${item.driver_id}-${idx}`} style={styles.listRow}>
              #{idx + 1} {item.driver_id} | Rides {item.rides} | Earnings {formatCurrency(item.earnings)}
            </Text>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Revenue Forecast (Next 7 Days)</Text>
        {forecastRows.length === 0 ? (
          <Text style={styles.emptyText}>Forecast unavailable.</Text>
        ) : (
          forecastRows.map((row) => (
            <Text key={`forecast-${row.date}`} style={styles.listRow}>
              {row.date} | {formatCurrency(row.forecast_revenue)} | Confidence {row.confidence}%
            </Text>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Booking Cancellation Reasons</Text>
        {cancellationReasons.length === 0 ? (
          <Text style={styles.emptyText}>No cancellation reasons available.</Text>
        ) : (
          cancellationReasons.map((item) => (
            <Text key={`cancel-${item.reason}`} style={styles.listRow}>
              {item.reason} | {item.count}
            </Text>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Customer Retention</Text>
        {retentionSegments.length === 0 ? (
          <Text style={styles.emptyText}>No retention data yet.</Text>
        ) : (
          retentionSegments.map((row) => (
            <Text key={`ret-${row.segment}`} style={styles.listRow}>
              {row.segment} | Customers {row.customers}
            </Text>
          ))
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Fraud / Risk Alerts</Text>
        <Text style={styles.listRow}>High Risk Count: {Number(fraudAlerts.high_risk_count || 0)}</Text>
        {Array.isArray(fraudAlerts.alerts) && fraudAlerts.alerts.length > 0 ? (
          fraudAlerts.alerts.slice(0, 5).map((alert, idx) => (
            <Text key={`fraud-${alert.booking_id || idx}`} style={styles.listRow}>
              Booking {alert.booking_id || 'N/A'} | Score {Number(alert.risk_score || 0).toFixed(2)}
            </Text>
          ))
        ) : (
          <Text style={styles.emptyText}>No recent risk alerts.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  loaderWrap: { alignItems: 'center', paddingVertical: 20 },
  loaderText: { marginTop: 8, color: '#5E6E65' },
  errorText: { color: '#B71C1C', marginBottom: 10 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 14,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D7E2DA',
    padding: 14,
    ...SHADOWS.soft,
  },
  statLabel: { color: '#5E6E65', fontSize: 13, marginBottom: 6, fontWeight: '700' },
  statValue: { color: '#1B5E20', fontSize: 21, fontWeight: '800' },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D7E2DA',
    padding: 14,
    marginBottom: 12,
    ...SHADOWS.soft,
  },
  cardTitle: { color: '#1D3124', fontSize: 17, fontWeight: '800', marginBottom: 10 },
  emptyText: { color: '#6B7D73' },
  barRow: { marginBottom: 10 },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  barLabel: { color: '#2D4236', fontWeight: '700' },
  barValue: { color: '#2D4236', fontWeight: '700' },
  barTrack: {
    height: 8,
    backgroundColor: '#E7EFEB',
    borderRadius: 999,
    overflow: 'hidden',
  },
  barFill: { height: 8, backgroundColor: '#2E7D32', borderRadius: 999 },
  listRow: { color: '#2D4236', marginBottom: 8, lineHeight: 18 },
  driverBlock: {
    borderTopWidth: 1,
    borderTopColor: '#E4ECE7',
    paddingTop: 10,
    marginTop: 8,
  },
  driverTitle: { color: '#1D3124', fontWeight: '800', marginBottom: 6 },
  driverMeta: { color: '#5E6E65', marginTop: 2 },
});
