import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  FlatList,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';

export interface FleetStats {
  driversOnline: number;
  driversTotal: number;
  activeRides: number;
  avgRating: number;
  utilizationRate: number;
  revenue: number;
  costs: number;
  profit: number;
}

export interface Alert {
  id: string;
  type: 'driver' | 'ride' | 'payment' | 'system';
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
}

interface OperatorDashboardProps {
  token: string;
  onLogout: () => void;
}

type TimePeriod = 'today' | 'week' | 'month';

export default function OperatorDashboard({
  token,
  onLogout,
}: OperatorDashboardProps) {
  const [period, setPeriod] = useState<TimePeriod>('today');
  const [fleetStats, setFleetStats] = useState<FleetStats>({
    driversOnline: 42,
    driversTotal: 85,
    activeRides: 23,
    avgRating: 4.7,
    utilizationRate: 78,
    revenue: 45230,
    costs: 12500,
    profit: 32730,
  });
  const [alerts, setAlerts] = useState<Alert[]>([
    {
      id: '1',
      type: 'driver',
      title: 'Driver Rating Low',
      message: 'Driver Raj (ID: DRV-001) rating dropped to 3.8',
      severity: 'medium',
      timestamp: new Date(),
    },
    {
      id: '2',
      type: 'payment',
      title: 'Payment Failed',
      message: '5 rides payment settlements pending',
      severity: 'high',
      timestamp: new Date(Date.now() - 3600000),
    },
  ]);

  const mockStatBoxes = [
    {
      id: 'online',
      label: 'Online',
      value: `${fleetStats.driversOnline}/${fleetStats.driversTotal}`,
      icon: 'check-circle',
      color: '#4CAF50',
    },
    {
      id: 'active',
      label: 'Active Rides',
      value: fleetStats.activeRides.toString(),
      icon: 'directions-car',
      color: '#2196F3',
    },
    {
      id: 'rating',
      label: 'Avg Rating',
      value: fleetStats.avgRating.toFixed(1),
      icon: 'star',
      color: '#FFB800',
    },
    {
      id: 'utilization',
      label: 'Utilization',
      value: `${fleetStats.utilizationRate}%`,
      icon: 'trending-up',
      color: '#9C27B0',
    },
  ];

  const getSeverityColor = (severity: Alert['severity']) => {
    switch (severity) {
      case 'critical':
        return '#D32F2F';
      case 'high':
        return '#F57C00';
      case 'medium':
        return '#FFA726';
      default:
        return '#FDD835';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Fleet Operations</Text>
        <Pressable style={styles.logoutButton} onPress={onLogout}>
          <MaterialIcons name="logout" size={20} color="#2196F3" />
        </Pressable>
      </View>

      {/* Period filter */}
      <View style={styles.periodFilter}>
        {(['today', 'week', 'month'] as TimePeriod[]).map(p => (
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

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {/* Live Status */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>LIVE STATUS</Text>
          <View style={styles.statsGrid}>
            {mockStatBoxes.map(stat => (
              <View key={stat.id} style={styles.statBox}>
                <MaterialIcons name={stat.icon as any} size={24} color={stat.color} />
                <Text style={styles.statValue}>{stat.value}</Text>
                <Text style={styles.statLabel}>{stat.label}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Revenue Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>REVENUE</Text>
          <View style={styles.revenueContent}>
            <View style={styles.revenueItem}>
              <Text style={styles.revenueLabel}>Earnings</Text>
              <Text style={styles.revenueAmount}>
                ₹{fleetStats.revenue.toLocaleString()}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.revenueItem}>
              <Text style={styles.revenueLabel}>Costs</Text>
              <Text style={styles.revenueAmount}>
                ₹{fleetStats.costs.toLocaleString()}
              </Text>
            </View>
            <View style={styles.divider} />
            <View style={[styles.revenueItem, styles.profitBox]}>
              <Text style={styles.revenueLabel}>Profit</Text>
              <Text style={styles.profitAmount}>
                ₹{fleetStats.profit.toLocaleString()}
              </Text>
            </View>
          </View>

          {/* Breakdown bars */}
          <View style={styles.breakdown}>
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>Commission</Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: '35%', backgroundColor: '#2196F3' },
                  ]}
                />
              </View>
              <Text style={styles.breakdownPercent}>35%</Text>
            </View>
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>Operations</Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: '28%', backgroundColor: '#4CAF50' },
                  ]}
                />
              </View>
              <Text style={styles.breakdownPercent}>28%</Text>
            </View>
            <View style={styles.breakdownItem}>
              <Text style={styles.breakdownLabel}>Incentives</Text>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: '22%', backgroundColor: '#FF9800' },
                  ]}
                />
              </View>
              <Text style={styles.breakdownPercent}>22%</Text>
            </View>
          </View>
        </View>

        {/* Alerts */}
        {alerts.length > 0 && (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>
                ⚠️ ALERTS ({alerts.length})
              </Text>
              <Pressable>
                <Text style={styles.viewAllLink}>View all</Text>
              </Pressable>
            </View>
            {alerts.slice(0, 3).map(alert => (
              <View
                key={alert.id}
                style={[
                  styles.alertItem,
                  { borderLeftColor: getSeverityColor(alert.severity) },
                ]}
              >
                <View
                  style={[
                    styles.alertBadge,
                    { backgroundColor: getSeverityColor(alert.severity) },
                  ]}
                />
                <View style={styles.alertContent}>
                  <Text style={styles.alertTitle}>{alert.title}</Text>
                  <Text style={styles.alertMessage} numberOfLines={2}>
                    {alert.message}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color="#999" />
              </View>
            ))}
          </View>
        )}

        {/* Quick Actions */}
        <View style={styles.quickActionsSection}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionsGrid}>
            <Pressable style={styles.actionButton}>
              <MaterialIcons name="map" size={32} color="#2196F3" />
              <Text style={styles.actionButtonLabel}>Fleet Map</Text>
            </Pressable>

            <Pressable style={styles.actionButton}>
              <MaterialIcons name="person-add" size={32} color="#2196F3" />
              <Text style={styles.actionButtonLabel}>Add Driver</Text>
            </Pressable>

            <Pressable style={styles.actionButton}>
              <MaterialIcons name="bar-chart" size={32} color="#2196F3" />
              <Text style={styles.actionButtonLabel}>Reports</Text>
            </Pressable>

            <Pressable style={styles.actionButton}>
              <MaterialIcons name="settings" size={32} color="#2196F3" />
              <Text style={styles.actionButtonLabel}>Settings</Text>
            </Pressable>
          </View>
        </View>

        {/* Driver Performance */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Top Performers (This Week)</Text>
          <FlatList
            data={[
              {
                id: 'drv-1',
                name: 'Rajesh Kumar',
                rides: 42,
                rating: 4.9,
                earnings: 8500,
              },
              {
                id: 'drv-2',
                name: 'Amit Singh',
                rides: 38,
                rating: 4.7,
                earnings: 7800,
              },
              {
                id: 'drv-3',
                name: 'Priya Sharma',
                rides: 35,
                rating: 4.6,
                earnings: 7200,
              },
            ]}
            scrollEnabled={false}
            renderItem={({ item, index }) => (
              <View
                style={[
                  styles.performerItem,
                  index !== 2 && styles.performerItemBorder,
                ]}
              >
                <View style={styles.performerRank}>
                  <Text style={styles.performerRankText}>{index + 1}</Text>
                </View>
                <View style={styles.performerInfo}>
                  <Text style={styles.performerName}>{item.name}</Text>
                  <View style={styles.performerStats}>
                    <Text style={styles.performerStat}>
                      {item.rides} rides
                    </Text>
                    <Text style={styles.performerStat}>
                      ⭐ {item.rating}
                    </Text>
                  </View>
                </View>
                <Text style={styles.performerEarnings}>
                  ₹{item.earnings.toLocaleString()}
                </Text>
              </View>
            )}
            keyExtractor={item => item.id}
          />
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
  periodFilter: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 10,
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
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  statBox: {
    flex: 0.48,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginTop: 6,
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
    fontWeight: '500',
  },
  revenueContent: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  revenueItem: {
    flex: 1,
    alignItems: 'center',
  },
  divider: {
    width: 1,
    backgroundColor: '#f0f0f0',
  },
  profitBox: {
    backgroundColor: '#F1F8E9',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  revenueLabel: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
  },
  revenueAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },
  profitAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4CAF50',
  },
  breakdown: {
    gap: 10,
  },
  breakdownItem: {
    gap: 4,
  },
  breakdownLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  breakdownPercent: {
    fontSize: 10,
    color: '#999',
    textAlign: 'right',
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
  quickActionsSection: {
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
    flex: 0.48,
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
  },
  actionButtonLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2196F3',
    marginTop: 8,
  },
  performerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 12,
  },
  performerItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  performerRank: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  performerRankText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  performerInfo: {
    flex: 1,
  },
  performerName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  performerStats: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  performerStat: {
    fontSize: 11,
    color: '#666',
  },
  performerEarnings: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4CAF50',
  },
});
