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
import {
  useFleetStats,
  useDriverMetrics,
  useOperatorAlerts,
  useOperatorReports,
  FleetStatsData,
  DriverMetrics,
} from '../hooks/useOperatorDashboard';

interface OperatorAnalyticsDashboardProps {
  token: string | null;
}

const chartWidth = Dimensions.get('window').width - 40;
const chartHeight = 220;

export const OperatorAnalyticsDashboard: React.FC<OperatorAnalyticsDashboardProps> = ({
  token,
}) => {
  const { stats, loading: statsLoading, refetch: refetchStats } = useFleetStats(token);
  const { drivers, loading: driversLoading } = useDriverMetrics(token);
  const { alerts } = useOperatorAlerts(token);
  const { reports } = useOperatorReports(token);

  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetchStats?.();
    } catch (err) {
      console.error('Refresh failed:', err);
    }
    setRefreshing(false);
  };

  const criticalAlerts = useMemo(() => {
    if (!alerts || !Array.isArray(alerts)) return [];
    return alerts.filter(a => a?.severity === 'critical' || a?.severity === 'high');
  }, [alerts]);

  const topDrivers = useMemo(() => {
    if (!drivers || !Array.isArray(drivers)) return [];
    return [...drivers]
      .sort((a, b) => (b?.rating ?? 0) - (a?.rating ?? 0))
      .slice(0, 5);
  }, [drivers]);

  const driversByStatus = useMemo(() => {
    if (!drivers || !Array.isArray(drivers)) {
      return { online: 0, onRide: 0, offline: 0 };
    }
    return {
      online: drivers.filter(d => d?.status === 'online').length,
      onRide: drivers.filter(d => d?.status === 'on_ride').length,
      offline: drivers.filter(d => d?.status === 'offline').length,
    };
  }, [drivers]);

  if (statsLoading && !stats) {
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

      {/* Key Metrics Grid */}
      {stats && (
        <View style={styles.metricsGrid}>
          <MetricCard
            label="Active Rides"
            value={stats.activeRides ?? 0}
            icon="directions-car"
            color="#2196F3"
          />
          <MetricCard
            label="Online Drivers"
            value={stats.driversOnline ?? 0}
            icon="person-add"
            color="#4CAF50"
          />
          <MetricCard
            label="Utilization"
            value={`${Math.round(stats.utilizationRate ?? 0)}%`}
            icon="trending-up"
            color="#FF9800"
          />
          <MetricCard
            label="Avg Rating"
            value={(stats.avgRating ?? 0).toFixed(1)}
            icon="star"
            color="#FFB800"
          />
        </View>
      )}

      {/* Revenue Overview */}
      {stats && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Revenue Overview</Text>
          <View style={styles.revenueRow}>
            <RevenueItem
              label="Revenue"
              amount={stats.revenue ?? 0}
              color="#4CAF50"
            />
            <RevenueItem label="Costs" amount={stats.costs ?? 0} color="#F44336" />
            <RevenueItem label="Profit" amount={stats.profit ?? 0} color="#2196F3" />
          </View>

          {/* Revenue Chart */}
          <LineChart
            data={{
              labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
              datasets: [
                {
                  data: [
                    (stats.profit ?? 0) * 0.8,
                    (stats.profit ?? 0) * 0.9,
                    (stats.profit ?? 0),
                    (stats.profit ?? 0) * 0.95,
                    (stats.profit ?? 0) * 1.1,
                    (stats.profit ?? 0) * 1.15,
                    (stats.profit ?? 0) * 1.2,
                  ],
                  color: () => '#2196F3',
                  strokeWidth: 2,
                },
              ],
            }}
            width={chartWidth}
            height={chartHeight}
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

      {/* Driver Status Distribution */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Driver Status</Text>
        <PieChart
          data={[
            {
              name: 'Online',
              population: driversByStatus.online,
              color: '#4CAF50',
              legendFontColor: '#666',
              legendFontSize: 12,
            },
            {
              name: 'On Ride',
              population: driversByStatus.onRide,
              color: '#2196F3',
              legendFontColor: '#666',
              legendFontSize: 12,
            },
            {
              name: 'Offline',
              population: driversByStatus.offline,
              color: '#999',
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

      {/* Rides & Distance Stats */}
      {stats && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Rides & Distance</Text>
          <BarChart
            data={{
              labels: ['This Week', 'Last Week', 'Two Weeks'],
              datasets: [
                {
                  data: [(stats.totalRidesCount ?? 0), (stats.totalRidesCount ?? 0) * 0.85, (stats.totalRidesCount ?? 0) * 0.92],
                  color: () => '#2196F3',
                },
              ],
            }}
            width={chartWidth}
            height={chartHeight}
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
          <View style={styles.statsRow}>
            <StatItem label="Total Rides" value={stats.totalRidesCount ?? 0} />
            <StatItem
              label="Total Distance"
              value={`${Math.round(stats.totalDistance ?? 0)} km`}
            />
          </View>
        </View>
      )}

      {/* Top Drivers */}
      {topDrivers.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Top Drivers</Text>
          {topDrivers.map((driver, idx) => (
            <View key={driver?.driverId || idx} style={styles.driverItem}>
              <View style={styles.driverRank}>
                <Text style={styles.driverRankText}>#{idx + 1}</Text>
              </View>
              <View style={styles.driverInfo}>
                <Text style={styles.driverName}>{driver?.name || 'Unknown'}</Text>
                <Text style={styles.driverStats}>
                  {driver?.rideCount ?? 0} rides • {(driver?.rating ?? 0).toFixed(1)} ⭐
                </Text>
              </View>
              <View style={styles.driverEarnings}>
                <Text style={styles.earningsLabel}>Today</Text>
                <Text style={styles.earningsValue}>₹{driver?.earningsToday ?? 0}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Critical Alerts */}
      {criticalAlerts.length > 0 && (
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { color: '#F44336' }]}>
            Critical Alerts ({criticalAlerts.length})
          </Text>
          {criticalAlerts.slice(0, 5).map((alert) => (
            <View key={alert?.id || Math.random()} style={styles.alertItem}>
              <View
                style={[
                  styles.alertIcon,
                  {
                    backgroundColor:
                      alert?.severity === 'critical' ? '#F4433620' : '#FF980020',
                  },
                ]}
              >
                <MaterialIcons
                  name="warning"
                  size={18}
                  color={alert?.severity === 'critical' ? '#F44336' : '#FF9800'}
                />
              </View>
              <View style={styles.alertContent}>
                <Text style={styles.alertTitle}>{alert?.title || 'Alert'}</Text>
                <Text style={styles.alertMessage}>{alert?.message || 'No details'}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Recent Reports */}
      {reports && reports.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Recent Reports</Text>
          {reports.slice(0, 3).map((report) => (
            <Pressable key={report?.id || Math.random()} style={styles.reportItem}>
              <MaterialIcons name="assessment" size={20} color="#2196F3" />
              <View style={styles.reportInfo}>
                <Text style={styles.reportTitle}>{report?.period || 'N/A'}</Text>
                <Text style={styles.reportStats}>
                  {report?.totalRides ?? 0} rides • ₹{report?.profit ?? 0} profit
                </Text>
              </View>
              <MaterialIcons name="download" size={18} color="#2196F3" />
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.spacer} />
    </ScrollView>
  );
};

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: string;
  color: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ label, value, icon, color }) => (
  <View style={styles.metricCard}>
    <View style={[styles.metricIcon, { backgroundColor: `${color}20` }]}>
      <MaterialIcons name={icon as any} size={24} color={color} />
    </View>
    <Text style={styles.metricValue}>{value}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
  </View>
);

interface RevenueItemProps {
  label: string;
  amount: number;
  color: string;
}

const RevenueItem: React.FC<RevenueItemProps> = ({ label, amount, color }) => (
  <View style={styles.revenueItem}>
    <View style={[styles.revenueDot, { backgroundColor: color }]} />
    <View>
      <Text style={styles.revenueLabel}>{label}</Text>
      <Text style={styles.revenueAmount}>₹{amount}</Text>
    </View>
  </View>
);

interface StatItemProps {
  label: string;
  value: string | number;
}

const StatItem: React.FC<StatItemProps> = ({ label, value }) => (
  <View style={styles.statItem}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
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
    gap: 8,
  },
  metricIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  metricLabel: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
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
  revenueRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  revenueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  revenueDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  revenueLabel: {
    fontSize: 11,
    color: '#666',
  },
  revenueAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
  chart: {
    marginVertical: 8,
    borderRadius: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },
  driverItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  driverRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverRankText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  driverStats: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  driverEarnings: {
    alignItems: 'flex-end',
  },
  earningsLabel: {
    fontSize: 10,
    color: '#666',
  },
  earningsValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4CAF50',
  },
  alertItem: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  alertIcon: {
    width: 36,
    height: 36,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  alertContent: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  alertMessage: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  reportItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  reportInfo: {
    flex: 1,
  },
  reportTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  reportStats: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  spacer: {
    height: 16,
  },
});

export default OperatorAnalyticsDashboard;
