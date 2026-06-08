/**
 * Admin Analytics Dashboard UI Component
 * Real-time analytics, charts, and KPI monitoring
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { apiRequest } from '../../lib/api';

type DateRange = 'today' | 'week' | 'month' | 'year';

type DashboardStats = Record<string, any>;

type AnalyticsDashboardPanelProps = {
  adminToken: string;
};

type KPICardProps = {
  title: string;
  value: string | number;
  subtitle?: string;
  color: string;
};

const KPICard = ({ title, value, subtitle, color }: KPICardProps) => (
  <View style={[styles.kpiCard, { borderLeftColor: color, borderLeftWidth: 4 }]}>
    <Text style={styles.kpiTitle}>{title}</Text>
    <Text style={[styles.kpiValue, { color }]}>{value}</Text>
    {subtitle && <Text style={styles.kpiSubtitle}>{subtitle}</Text>}
  </View>
);

const AnalyticsDashboardPanel = ({ adminToken }: AnalyticsDashboardPanelProps) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange>('today');

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/admin/reports/analytics/dashboard', {
        token: adminToken,
        query: { range: dateRange },
      });
      setStats(data);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to load analytics');
    } finally {
      setLoading(false);
    }
  }, [adminToken, dateRange]);

  useEffect(() => {
    void Promise.resolve().then(loadDashboardData);
  }, [loadDashboardData]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" style={styles.loader} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Analytics Dashboard</Text>

      {/* Date Range Selector */}
      <View style={styles.dateRangeContainer}>
        {(['today', 'week', 'month', 'year'] as DateRange[]).map((range) => (
          <TouchableOpacity
            key={range}
            style={[styles.dateRangeButton, dateRange === range && styles.dateRangeButtonActive]}
            onPress={() => setDateRange(range)}
          >
            <Text
              style={[styles.dateRangeButtonText, dateRange === range && styles.dateRangeButtonTextActive]}
            >
              {range.charAt(0).toUpperCase() + range.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Key Performance Indicators */}
      <Text style={styles.sectionTitle}>Key Metrics</Text>

      {stats && (
        <>
          <KPICard
            title="Total Revenue"
            value={`₹${stats.total_revenue || 0}`}
            subtitle={`Avg: ₹${stats.avg_revenue_per_ride || 0}/ride`}
            color="#34c759"
          />

          <KPICard
            title="Total Rides"
            value={stats.total_rides || 0}
            subtitle={`${stats.completed_rides || 0} completed`}
            color="#007AFF"
          />

          <KPICard
            title="Active Users"
            value={stats.active_users || 0}
            subtitle={`${stats.active_drivers || 0} drivers, ${stats.active_passengers || 0} passengers`}
            color="#FF9500"
          />

          <KPICard
            title="Avg Rating"
            value={(stats.average_rating || 0).toFixed(1)}
            subtitle={`${stats.total_ratings || 0} ratings`}
            color="#5856d6"
          />

          {/* Ride Status Breakdown */}
          <Text style={styles.sectionTitle}>Ride Status</Text>
          <View style={styles.statusGrid}>
            <View style={styles.statusItem}>
              <Text style={styles.statusCount}>{stats.rides_pending || 0}</Text>
              <Text style={styles.statusLabel}>Pending</Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={[styles.statusCount, { color: '#FF9500' }]}>{stats.rides_in_progress || 0}</Text>
              <Text style={styles.statusLabel}>In Progress</Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={[styles.statusCount, { color: '#34c759' }]}>{stats.rides_completed || 0}</Text>
              <Text style={styles.statusLabel}>Completed</Text>
            </View>
            <View style={styles.statusItem}>
              <Text style={[styles.statusCount, { color: '#ff3b30' }]}>{stats.rides_cancelled || 0}</Text>
              <Text style={styles.statusLabel}>Cancelled</Text>
            </View>
          </View>

          {/* Driver Performance */}
          <Text style={styles.sectionTitle}>Driver Performance</Text>
          <View style={styles.performanceCard}>
            <View style={styles.performanceRow}>
              <Text style={styles.performanceLabel}>Top Drivers by Rating</Text>
              <Text style={styles.performanceValue}>{stats.top_drivers_count || 0}</Text>
            </View>
            <View style={styles.performanceRow}>
              <Text style={styles.performanceLabel}>Avg Acceptance Rate</Text>
              <Text style={styles.performanceValue}>{((stats.avg_acceptance_rate || 0) * 100).toFixed(1)}%</Text>
            </View>
            <View style={styles.performanceRow}>
              <Text style={styles.performanceLabel}>Avg Rides per Driver</Text>
              <Text style={styles.performanceValue}>{(stats.avg_rides_per_driver || 0).toFixed(1)}</Text>
            </View>
          </View>

          {/* Payment Methods */}
          <Text style={styles.sectionTitle}>Payment Methods</Text>
          <View style={styles.paymentGrid}>
            <View style={styles.paymentItem}>
              <Text style={styles.paymentValue}>{stats.wallet_payments || 0}</Text>
              <Text style={styles.paymentLabel}>Wallet</Text>
            </View>
            <View style={styles.paymentItem}>
              <Text style={styles.paymentValue}>{stats.card_payments || 0}</Text>
              <Text style={styles.paymentLabel}>Card</Text>
            </View>
            <View style={styles.paymentItem}>
              <Text style={styles.paymentValue}>{stats.cash_payments || 0}</Text>
              <Text style={styles.paymentLabel}>Cash</Text>
            </View>
            <View style={styles.paymentItem}>
              <Text style={styles.paymentValue}>{stats.upi_payments || 0}</Text>
              <Text style={styles.paymentLabel}>UPI</Text>
            </View>
          </View>

          {/* Support Metrics */}
          <Text style={styles.sectionTitle}>Support</Text>
          <View style={styles.supportCard}>
            <View style={styles.supportRow}>
              <Text style={styles.supportLabel}>Open Tickets</Text>
              <Text style={[styles.supportValue, { color: '#ff3b30' }]}>{stats.open_tickets || 0}</Text>
            </View>
            <View style={styles.supportRow}>
              <Text style={styles.supportLabel}>Avg Resolution Time</Text>
              <Text style={styles.supportValue}>{stats.avg_resolution_time || 'N/A'}</Text>
            </View>
            <View style={styles.supportRow}>
              <Text style={styles.supportLabel}>Customer Satisfaction</Text>
              <Text style={[styles.supportValue, { color: '#34c759' }]}>
                {((stats.customer_satisfaction || 0) * 100).toFixed(1)}%
              </Text>
            </View>
          </View>

          {/* Export Options */}
          <View style={styles.exportContainer}>
            <TouchableOpacity style={styles.exportButton}>
              <Text style={styles.exportButtonText}>📊 Export Report</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.exportButton, styles.exportButtonSecondary]}>
              <Text style={styles.exportButtonTextSecondary}>📧 Email Report</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#333',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 12,
    color: '#333',
  },
  dateRangeContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 8,
  },
  dateRangeButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginHorizontal: 4,
  },
  dateRangeButtonActive: {
    backgroundColor: '#007AFF',
  },
  dateRangeButtonText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 12,
    fontWeight: '600',
  },
  dateRangeButtonTextActive: {
    color: '#fff',
  },
  loader: {
    marginTop: 50,
  },
  kpiCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  kpiTitle: {
    fontSize: 12,
    color: '#999',
    marginBottom: 8,
  },
  kpiValue: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  kpiSubtitle: {
    fontSize: 12,
    color: '#666',
  },
  statusGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statusItem: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  statusCount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  statusLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
  performanceCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  performanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  performanceLabel: {
    fontSize: 14,
    color: '#666',
  },
  performanceValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  paymentGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  paymentItem: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  paymentValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  paymentLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 8,
  },
  supportCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 20,
  },
  supportRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  supportLabel: {
    fontSize: 14,
    color: '#666',
  },
  supportValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  exportContainer: {
    flexDirection: 'row',
    marginTop: 24,
    marginBottom: 32,
  },
  exportButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  exportButtonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  exportButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  exportButtonTextSecondary: {
    color: '#007AFF',
    fontWeight: '600',
    fontSize: 14,
  },
});

export default AnalyticsDashboardPanel;
