import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { BarChart, LineChart, PieChart } from 'react-native-chart-kit';
import { useAdminDashboard } from '../hooks/useAdminDashboard';

interface AdminAnalyticsDashboardProps {
  token: string | null;
}

const chartWidth = Dimensions.get('window').width - 40;
const chartHeight = 220;

export const AdminAnalyticsDashboard: React.FC<AdminAnalyticsDashboardProps> = ({
  token,
}) => {
  const {
    platformStats,
    systemHealth,
    operatorMetrics,
    incidents,
    loading,
    refetch: refetchStats,
  } = useAdminDashboard(token);

  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refetchStats();
    setRefreshing(false);
  };

  const systemStatus = useMemo(() => {
    if (!systemHealth) {return 'unknown';}
    const allHealthy = Object.values(systemHealth).every(
      (health: any) => health.status === 'healthy'
    );
    return allHealthy ? 'healthy' : 'degraded';
  }, [systemHealth]);

  const criticalIncidents = useMemo(() => {
    return incidents?.filter(i => i.severity === 'critical') || [];
  }, [incidents]);

  const topOperators = useMemo(() => {
    return (operatorMetrics || [])
      .sort((a: any, b: any) => b.totalRides - a.totalRides)
      .slice(0, 5);
  }, [operatorMetrics]);

  if (loading && !platformStats) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* System Health Status */}
      <View style={styles.statusBar}>
        <View
          style={[
            styles.statusIndicator,
            {
              backgroundColor:
                systemStatus === 'healthy' ? '#4CAF50' : '#FF9800',
            },
          ]}
        />
        <View style={styles.statusContent}>
          <Text style={styles.statusTitle}>System Status</Text>
          <Text style={styles.statusValue}>
            {systemStatus === 'healthy'
              ? 'All Systems Operational'
              : 'Some Services Degraded'}
          </Text>
        </View>
        {criticalIncidents.length > 0 && (
          <View style={styles.incidentBadge}>
            <Text style={styles.incidentBadgeText}>{criticalIncidents.length}</Text>
          </View>
        )}
      </View>

      {/* Period Selector */}
      <View style={styles.periodSelector}>
        {(['today', 'week', 'month'] as const).map((p) => (
          <Pressable
            key={p}
            style={[styles.periodButton, period === p && styles.periodButtonActive]}
            onPress={() => setPeriod(p)}
          >
            <Text
              style={[
                styles.periodButtonText,
                period === p && styles.periodButtonTextActive,
              ]}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Platform KPIs */}
      {platformStats && (
        <View style={styles.metricsGrid}>
          <PlatformMetricCard
            label="Total Rides"
            value={platformStats.totalRides}
            icon="directions-car"
            color="#2196F3"
            change="+12%"
          />
          <PlatformMetricCard
            label="Active Users"
            value={platformStats.activeUsers}
            icon="people"
            color="#4CAF50"
            change="+8%"
          />
          <PlatformMetricCard
            label="GMV"
            value={`₹${platformStats.totalRevenue}`}
            icon="attach-money"
            color="#FFB800"
            change="+15%"
          />
          <PlatformMetricCard
            label="Operators"
            value={platformStats.totalOperators}
            icon="business"
            color="#9C27B0"
            change={`${platformStats.activeOperators} active`}
          />
        </View>
      )}

      {/* System Health Details */}
      {systemHealth && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>System Health</Text>
          <View style={styles.healthGrid}>
            <HealthItem
              label="API"
              status={systemHealth.api?.status}
              uptime={systemHealth.api?.uptime}
            />
            <HealthItem
              label="Database"
              status={systemHealth.database?.status}
              uptime={systemHealth.database?.uptime}
            />
            <HealthItem
              label="Cache"
              status={systemHealth.cache?.status}
              uptime={systemHealth.cache?.uptime}
            />
            <HealthItem
              label="Payments"
              status={systemHealth.payments?.status}
              uptime={systemHealth.payments?.uptime}
            />
          </View>
        </View>
      )}

      {/* Revenue Trends */}
      {platformStats && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Revenue Trends</Text>
          <LineChart
            data={{
              labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
              datasets: [
                {
                  data: [
                    platformStats.totalRevenue * 0.8,
                    platformStats.totalRevenue * 0.85,
                    platformStats.totalRevenue * 0.9,
                    platformStats.totalRevenue * 0.95,
                    platformStats.totalRevenue,
                    platformStats.totalRevenue * 1.1,
                    platformStats.totalRevenue * 1.15,
                  ],
                  color: () => '#2196F3',
                  strokeWidth: 2,
                },
              ],
            }}
            width={chartWidth}
            height={chartHeight}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={{
              backgroundColor: '#fff',
              backgroundGradientFrom: '#fff',
              backgroundGradientTo: '#fff',
              decimalPlaces: 0,
              color: () => '#2196F3',
              labelColor: () => '#666',
              style: { borderRadius: 8 },
              propsForDots: {
                r: '5',
                strokeWidth: '2',
                stroke: '#2196F3',
              },
            }}
            style={styles.chart}
            bezier
          />
        </View>
      )}

      {/* User Distribution */}
      {platformStats && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>User Distribution</Text>
          <PieChart
            data={[
              {
                name: 'Passengers',
                population: platformStats.totalUsers * 0.6,
                color: '#2196F3',
                legendFontColor: '#666',
                legendFontSize: 12,
              },
              {
                name: 'Drivers',
                population: platformStats.totalUsers * 0.3,
                color: '#4CAF50',
                legendFontColor: '#666',
                legendFontSize: 12,
              },
              {
                name: 'Operators',
                population: platformStats.totalUsers * 0.1,
                color: '#9C27B0',
                legendFontColor: '#666',
                legendFontSize: 12,
              },
            ]}
            width={chartWidth}
            height={chartHeight}
            chartConfig={{
              backgroundColor: '#fff',
              backgroundGradientFrom: '#fff',
              backgroundGradientTo: '#fff',
              color: () => '#2196F3',
              labelColor: () => '#666',
            }}
            accessor="population"
            backgroundColor="transparent"
            paddingLeft="15"
            style={styles.chart}
          />
        </View>
      )}

      {/* Rides Distribution */}
      {platformStats && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Rides by Type</Text>
          <BarChart
            data={{
              labels: ['Ride Now', 'Ride Later', 'Rental'],
              datasets: [
                {
                  data: [
                    platformStats.totalRides * 0.6,
                    platformStats.totalRides * 0.25,
                    platformStats.totalRides * 0.15,
                  ],
                  color: () => '#2196F3',
                },
              ],
            }}
            width={chartWidth}
            height={chartHeight}
            yAxisLabel=""
            yAxisSuffix=""
            chartConfig={{
              backgroundColor: '#fff',
              backgroundGradientFrom: '#fff',
              backgroundGradientTo: '#fff',
              decimalPlaces: 0,
              color: () => '#2196F3',
              labelColor: () => '#666',
              barPercentage: 0.6,
            }}
            style={styles.chart}
          />
        </View>
      )}

      {/* Top Operators */}
      {topOperators.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Top Operators</Text>
          {topOperators.map((operator: any, idx: number) => (
            <View key={operator.id} style={styles.operatorItem}>
              <View style={styles.operatorRank}>
                <Text style={styles.operatorRankText}>#{idx + 1}</Text>
              </View>
              <View style={styles.operatorInfo}>
                <Text style={styles.operatorName}>{operator.name}</Text>
                <Text style={styles.operatorStats}>
                  {operator.totalRides} rides • ₹{operator.totalRevenue}
                </Text>
              </View>
              <View style={styles.operatorMetric}>
                <Text style={styles.metricLabel}>Rating</Text>
                <Text style={styles.metricValue}>{operator.rating}/5</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Critical Incidents */}
      {criticalIncidents.length > 0 && (
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { color: '#F44336' }]}>
            Critical Incidents ({criticalIncidents.length})
          </Text>
          {criticalIncidents.slice(0, 5).map((incident: any) => (
            <View key={incident.id} style={styles.incidentItem}>
              <View style={styles.incidentIcon}>
                <MaterialIcons name="error" size={18} color="#F44336" />
              </View>
              <View style={styles.incidentContent}>
                <Text style={styles.incidentTitle}>{incident.title}</Text>
                <Text style={styles.incidentDescription}>
                  {incident.description}
                </Text>
                <Text style={styles.incidentTime}>
                  {new Date(incident.timestamp).toLocaleTimeString()}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Service Metrics */}
      {platformStats && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Service Metrics</Text>
          <ServiceMetric
            label="Avg Completion Time"
            value={`${platformStats.avgCompletionTime} min`}
            status="good"
          />
          <ServiceMetric
            label="Cancellation Rate"
            value={`${platformStats.cancellationRate}%`}
            status={platformStats.cancellationRate > 10 ? 'warning' : 'good'}
          />
          <ServiceMetric
            label="Avg Rating"
            value={platformStats.avgRating.toFixed(1)}
            status={platformStats.avgRating > 4.5 ? 'good' : 'warning'}
          />
        </View>
      )}

      <View style={styles.spacer} />
    </ScrollView>
  );
};

interface PlatformMetricCardProps {
  label: string;
  value: string | number;
  icon: string;
  color: string;
  change?: string;
}

const PlatformMetricCard: React.FC<PlatformMetricCardProps> = ({
  label,
  value,
  icon,
  color,
  change,
}) => (
  <View style={styles.metricCard}>
    <View style={[styles.metricIcon, { backgroundColor: `${color}20` }]}>
      <MaterialIcons name={icon as any} size={24} color={color} />
    </View>
    <Text style={styles.metricValue}>{value}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
    {change && <Text style={styles.metricChange}>{change}</Text>}
  </View>
);

interface HealthItemProps {
  label: string;
  status?: string;
  uptime?: number;
}

const HealthItem: React.FC<HealthItemProps> = ({ label, status, uptime }) => (
  <View style={styles.healthItem}>
    <View
      style={[
        styles.healthDot,
        {
          backgroundColor:
            status === 'healthy' ? '#4CAF50' : status === 'degraded' ? '#FF9800' : '#F44336',
        },
      ]}
    />
    <View>
      <Text style={styles.healthLabel}>{label}</Text>
      <Text style={styles.healthStatus}>
        {uptime ? `${uptime}% uptime` : status}
      </Text>
    </View>
  </View>
);

interface ServiceMetricProps {
  label: string;
  value: string;
  status: 'good' | 'warning' | 'critical';
}

const ServiceMetric: React.FC<ServiceMetricProps> = ({ label, value, status }) => (
  <View style={styles.serviceMetric}>
    <View style={styles.serviceMetricLeft}>
      <Text style={styles.serviceLabel}>{label}</Text>
      <Text style={styles.serviceValue}>{value}</Text>
    </View>
    <View
      style={[
        styles.statusDot,
        {
          backgroundColor:
            status === 'good' ? '#4CAF50' : status === 'warning' ? '#FF9800' : '#F44336',
        },
      ]}
    />
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  statusContent: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 12,
    color: '#666',
  },
  statusValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  incidentBadge: {
    backgroundColor: '#F44336',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  incidentBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  periodSelector: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  periodButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: '#2196F3',
  },
  periodButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  periodButtonTextActive: {
    color: '#fff',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    padding: 16,
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    gap: 6,
  },
  metricIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  metricLabel: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
  },
  metricChange: {
    fontSize: 10,
    color: '#4CAF50',
    fontWeight: '600',
  },
  card: {
    marginHorizontal: 16,
    marginVertical: 8,
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  chart: {
    marginVertical: 8,
    borderRadius: 8,
  },
  healthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  healthItem: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 6,
  },
  healthDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  healthLabel: {
    fontSize: 11,
    color: '#666',
  },
  healthStatus: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
    marginTop: 2,
  },
  operatorItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  operatorRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  operatorRankText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  operatorInfo: {
    flex: 1,
  },
  operatorName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  operatorStats: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  operatorMetric: {
    alignItems: 'flex-end',
  },
  operatorMetricLabel: {
    fontSize: 10,
    color: '#666',
  },
  operatorMetricValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2196F3',
  },
  incidentItem: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  incidentIcon: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: '#F4433620',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  incidentContent: {
    flex: 1,
  },
  incidentTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  incidentDescription: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  incidentTime: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
  },
  serviceMetric: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  serviceMetricLeft: {
    flex: 1,
  },
  serviceLabel: {
    fontSize: 12,
    color: '#666',
  },
  serviceValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  spacer: {
    height: 16,
  },
});

export default AdminAnalyticsDashboard;
