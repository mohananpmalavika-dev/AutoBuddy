import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAdminMetrics, useSystemHealth, useAdminAlerts } from '../hooks/useAdminDashboard';

type TimeRange = '24h' | '7d' | '30d';
type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';
type NavigationParams = Record<string, unknown>;

interface AdminAlert {
  id: string;
  title: string;
  message: string;
  severity: AlertSeverity;
  createdAt: number;
}

interface SystemHealth {
  apiServer?: string;
  apiUptime?: string;
  database?: string;
  dbResponseTime?: string;
  cache?: string;
  cacheHitRate?: string;
  paymentGateway?: string;
  paymentTransactions?: string;
}

interface AdminMetrics {
  activeUsers?: number;
  dailyRevenue?: number;
  totalRides?: number;
  totalUsers?: number;
}

interface AdminDashboardProps {
  token: string;
  onLogout: () => void;
  onNavigate?: (screen: string, params?: NavigationParams) => void;
}

export default function AdminDashboard({
  token,
  onLogout,
  onNavigate,
}: AdminDashboardProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('24h');

  // Use actual admin hooks
  const { metrics, loading: metricsLoading, error: metricsError, refetch: refetchMetrics } = useAdminMetrics(token, timeRange);
  const { health, loading: healthLoading, error: healthError, refetch: refetchHealth } = useSystemHealth(token);
  const { alerts, loading: alertsLoading, error: alertsError, refetch: refetchAlerts } = useAdminAlerts(token);
  const safeAlerts = Array.isArray(alerts) ? alerts : [];
  const safeMetrics = {
    newDriversToday: 0,
    openTickets: 0,
    complianceScore: 0,
    totalUsers: 0,
    activeUsers: 0,
    dailyRevenue: 0,
    ridesToday: 0,
    avgRating: 0,
    ...(metrics || {}),
  };

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'operational':
      case 'healthy':
        return '#4CAF50';
      case 'degraded':
      case 'warning':
        return '#FF9800';
      default:
        return '#D32F2F';
    }
  };

  const getSeverityColor = (severity?: AlertSeverity): string => {
    switch (severity) {
      case 'critical':
        return '#D32F2F';
      case 'high':
        return '#F57C00';
      case 'medium':
        return '#FFA726';
      case 'low':
      default:
        return '#FDD835';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Admin Control Center</Text>
        <Pressable style={styles.logoutButton} onPress={onLogout}>
          <MaterialIcons name="logout" size={20} color="#2196F3" />
        </Pressable>
      </View>

      {/* Time range filter */}
      <View style={styles.timeRangeFilter}>
        {(['24h', '7d', '30d'] as TimeRange[]).map(range => (
          <Pressable
            key={range}
            style={[
              styles.timeRangeButton,
              timeRange === range && styles.timeRangeButtonActive,
            ]}
            onPress={() => setTimeRange(range)}
          >
            <Text
              style={[
                styles.timeRangeButtonText,
                timeRange === range && styles.timeRangeButtonTextActive,
              ]}
            >
              {range}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* System Health */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>⚙️ SYSTEM HEALTH</Text>
          <View style={styles.healthGrid}>
            <View style={styles.healthItem}>
              <View
                style={[
                  styles.healthIndicator,
                  { backgroundColor: getHealthColor(health?.apiServer ?? 'unknown') },
                ]}
              />
              <View style={styles.healthContent}>
                <Text style={styles.healthLabel}>API Server</Text>
                <Text style={styles.healthStatus}>
                  {health?.apiServer ?? 'unknown'} • {health?.apiUptime ?? 'N/A'}
                </Text>
              </View>
            </View>

            <View style={styles.healthItem}>
              <View
                style={[
                  styles.healthIndicator,
                  { backgroundColor: getHealthColor(health?.database ?? 'unknown') },
                ]}
              />
              <View style={styles.healthContent}>
                <Text style={styles.healthLabel}>Database</Text>
                <Text style={styles.healthStatus}>
                  {health?.database ?? 'unknown'} • {health?.dbResponseTime ?? 'N/A'}
                </Text>
              </View>
            </View>

            <View style={styles.healthItem}>
              <View
                style={[
                  styles.healthIndicator,
                  { backgroundColor: getHealthColor(health?.cache ?? 'unknown') },
                ]}
              />
              <View style={styles.healthContent}>
                <Text style={styles.healthLabel}>Cache</Text>
                <Text style={styles.healthStatus}>
                  {health?.cache ?? 'unknown'} • {health?.cacheHitRate ?? 'N/A'}
                </Text>
              </View>
            </View>

            <View style={styles.healthItem}>
              <View
                style={[
                  styles.healthIndicator,
                  {
                    backgroundColor: getHealthColor(health?.paymentGateway ?? 'unknown'),
                  },
                ]}
              />
              <View style={styles.healthContent}>
                <Text style={styles.healthLabel}>Payment Gateway</Text>
                <Text style={styles.healthStatus}>
                  {health?.paymentGateway ?? 'unknown'} • {health?.paymentTransactions ?? 'N/A'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Key Metrics */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <MaterialIcons name="people" size={24} color="#2196F3" />
            <Text style={styles.metricLabel}>Active Users</Text>
            <Text style={styles.metricValue}>{metrics?.activeUsers ?? 0}</Text>
            <Text style={styles.metricTrend}>↑ 12%</Text>
          </View>

          <View style={styles.metricCard}>
            <MaterialIcons name="attach-money" size={24} color="#4CAF50" />
            <Text style={styles.metricLabel}>Daily Revenue</Text>
            <Text style={styles.metricValue}>
              ₹{((metrics?.dailyRevenue ?? 0) / 1000).toFixed(0)}k
            </Text>
            <Text style={styles.metricTrend}>↑ 8%</Text>
          </View>

          <View style={styles.metricCard}>
            <MaterialIcons name="directions-car" size={24} color="#FF9800" />
            <Text style={styles.metricLabel}>Rides Today</Text>
            <Text style={styles.metricValue}>{metrics?.ridesToday ?? 0}</Text>
            <Text style={styles.metricTrend}>↑ 15%</Text>
          </View>

          <View style={styles.metricCard}>
            <MaterialIcons name="star" size={24} color="#FFB800" />
            <Text style={styles.metricLabel}>Avg Rating</Text>
            <Text style={styles.metricValue}>{(metrics?.avgRating ?? 0).toFixed(1)}</Text>
            <Text style={styles.metricTrend}>Stable</Text>
          </View>
        </View>

        {/* Critical Alerts */}
        {safeAlerts.filter(a => a?.severity === 'critical' || a?.severity === 'high')
          .length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                🚨 ALERTS (
                {safeAlerts.filter(a => a?.severity === 'critical').length})
              </Text>
              <Pressable>
                <Text style={styles.viewAllLink}>View all</Text>
              </Pressable>
            </View>
            {safeAlerts.slice(0, 3).map(alert => (
              <View
                key={alert?.id || `${alert?.title || 'alert'}-${alert?.message || 'no-details'}`}
                style={[
                  styles.alertItem,
                  { borderLeftColor: getSeverityColor(alert?.severity) },
                ]}
              >
                <View
                  style={[
                    styles.alertBadge,
                    { backgroundColor: getSeverityColor(alert?.severity) },
                  ]}
                />
                <View style={styles.alertContent}>
                  <Text style={styles.alertTitle}>{alert?.title || 'Alert'}</Text>
                  <Text style={styles.alertMessage} numberOfLines={2}>
                    {alert?.message || 'No details'}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color="#999" />
              </View>
            ))}
          </View>
        )}

        {/* Key Statistics */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>📊 KEY STATISTICS</Text>
          <View style={styles.statsList}>
            <View style={styles.statItem}>
              <View style={styles.statIconBox}>
                <MaterialIcons name="person-add" size={20} color="#2196F3" />
              </View>
              <View style={styles.statContent}>
                <Text style={styles.statLabel}>New Driver Signups</Text>
                <Text style={styles.statValue}>{safeMetrics.newDriversToday}</Text>
              </View>
            </View>

            <View style={styles.statItem}>
              <View style={styles.statIconBox}>
                <MaterialIcons name="help" size={20} color="#FF9800" />
              </View>
              <View style={styles.statContent}>
                <Text style={styles.statLabel}>Open Support Tickets</Text>
                <Text style={styles.statValue}>{safeMetrics.openTickets}</Text>
              </View>
            </View>

            <View style={styles.statItem}>
              <View style={styles.statIconBox}>
                <MaterialIcons name="verified" size={20} color="#4CAF50" />
              </View>
              <View style={styles.statContent}>
                <Text style={styles.statLabel}>Compliance Score</Text>
                <Text style={styles.statValue}>{safeMetrics.complianceScore}%</Text>
              </View>
            </View>

            <View style={styles.statItem}>
              <View style={styles.statIconBox}>
                <MaterialIcons name="people" size={20} color="#9C27B0" />
              </View>
              <View style={styles.statContent}>
                <Text style={styles.statLabel}>Total Users</Text>
                <Text style={styles.statValue}>
                  {(safeMetrics.totalUsers / 1000).toFixed(0)}k
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>Management</Text>
          <View style={styles.actionsGrid}>
            <Pressable
              style={styles.actionButton}
              onPress={() => onNavigate?.('AdminUserManagement')}
            >
              <MaterialIcons name="people" size={28} color="#2196F3" />
              <Text style={styles.actionLabel}>Users</Text>
            </Pressable>

            <Pressable
              style={styles.actionButton}
              onPress={() => onNavigate?.('AdminDriverManagement')}
            >
              <MaterialIcons name="directions-car" size={28} color="#2196F3" />
              <Text style={styles.actionLabel}>Drivers</Text>
            </Pressable>

            <Pressable
              style={styles.actionButton}
              onPress={() => onNavigate?.('AdminPayments')}
            >
              <MaterialIcons name="payment" size={28} color="#2196F3" />
              <Text style={styles.actionLabel}>Payments</Text>
            </Pressable>

            <Pressable
              style={styles.actionButton}
              onPress={() => onNavigate?.('AdminCompliance')}
            >
              <MaterialIcons name="warning" size={28} color="#2196F3" />
              <Text style={styles.actionLabel}>Compliance</Text>
            </Pressable>

            <Pressable
              style={styles.actionButton}
              onPress={() => onNavigate?.('AdminReports')}
            >
              <MaterialIcons name="bar-chart" size={28} color="#2196F3" />
              <Text style={styles.actionLabel}>Reports</Text>
            </Pressable>

            <Pressable
              style={styles.actionButton}
              onPress={() => onNavigate?.('AdminSettings')}
            >
              <MaterialIcons name="settings" size={28} color="#2196F3" />
              <Text style={styles.actionLabel}>Settings</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
  },
  logoutButton: {
    padding: 8,
  },
  timeRangeFilter: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  timeRangeButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  timeRangeButtonActive: {
    backgroundColor: '#2196F3',
  },
  timeRangeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  timeRangeButtonTextActive: {
    color: '#fff',
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  viewAllLink: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2196F3',
  },
  healthGrid: {
    gap: 8,
  },
  healthItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  healthIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  healthContent: {
    flex: 1,
  },
  healthLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  healthStatus: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  metricCard: {
    flex: 0.48,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  metricLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 8,
    fontWeight: '500',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginTop: 4,
  },
  metricTrend: {
    fontSize: 10,
    color: '#4CAF50',
    marginTop: 2,
    fontWeight: '600',
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    borderLeftWidth: 4,
    marginBottom: 8,
    gap: 10,
  },
  alertBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  alertMessage: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  statsList: {
    gap: 8,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  statIconBox: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  statContent: {
    flex: 1,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginTop: 2,
  },
  actionsSection: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionButton: {
    flex: 0.31,
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2196F3',
    marginTop: 8,
  },
});
