/**
 * Admin Dashboard for Enterprise Features
 * - Airport Booking Management
 * - Corporate Account Administration
 * - Multi-Stop Route Analytics
 * - Live Driver Heatmap with Positioning AI
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LineChart, PieChart } from 'react-native-chart-kit';

const COLORS = {
  primary: '#2D4A7B',
  secondary: '#FF8C42',
  success: '#4CAF50',
  warning: '#FFC107',
  error: '#F44336',
  light: '#F5F5F5',
  dark: '#333',
  mutedDark: '#666',
};

const AdminDashboard = ({ token, userRole }) => {
  const [activeTab, setActiveTab] = useState('overview');
  const [airportBookings, setAirportBookings] = useState([]);
  const [corporateAccounts, setCorporateAccounts] = useState([]);
  const [heatmapData, setHeatmapData] = useState([]);
  const [analytics, setAnalytics] = useState({});
  const [loading, setLoading] = useState(false);

  const calculateAnalytics = useCallback((airport, corporate) => {
    const airportRevenue = airport.bookings?.reduce((sum, b) => sum + parseFloat(b.total_fare), 0) || 0;
    const corporateRevenue = corporate.accounts?.reduce((sum, a) => sum + parseFloat(a.current_month_spent), 0) || 0;
    
    setAnalytics({
      totalAirportRevenue: airportRevenue,
      totalCorporateRevenue: corporateRevenue,
      activeAirportBookings: airport.bookings?.filter(b => b.status !== 'completed').length || 0,
      activeCorporateAccounts: corporate.accounts?.filter(a => a.is_active).length || 0,
    });
  }, []);

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    try {
      const [airport, corporate, heatmap] = await Promise.all([
        fetch('/api/enterprise/airport/admin/bookings', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/enterprise/corporate/admin/accounts', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/enterprise/heatmap/current', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      const airportData = await airport.json();
      const corporateData = await corporate.json();
      const heatmapData = await heatmap.json();

      setAirportBookings(airportData.bookings || []);
      setCorporateAccounts(corporateData.accounts || []);
      setHeatmapData(heatmapData.data_points || []);
      
      // Calculate analytics
      calculateAnalytics(airportData, corporateData);
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  }, [calculateAnalytics, token]);

  useEffect(() => {
    const timeout = setTimeout(fetchAllData, 0);
    const interval = setInterval(fetchAllData, 30000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [fetchAllData]);

  const renderOverview = () => (
    <ScrollView style={styles.tabContent}>
      <View style={styles.metricsGrid}>
        <MetricCard
          icon="local-airport"
          title="Airport Bookings"
          value={airportBookings.length}
          revenue={analytics.totalAirportRevenue}
        />
        <MetricCard
          icon="business"
          title="Corporate Accounts"
          value={analytics.activeCorporateAccounts}
          revenue={analytics.totalCorporateRevenue}
        />
        <MetricCard
          icon="route"
          title="Multi-Stop Routes"
          value="2,341"
          revenue="₹1.2M"
        />
        <MetricCard
          icon="location"
          title="Driver Heatmap Points"
          value={heatmapData.length}
          revenue="Real-time"
        />
      </View>

      {/* Revenue Chart */}
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Revenue Trend (Last 30 Days)</Text>
        <LineChart
          data={{
            labels: ['Day 1', 'Day 5', 'Day 10', 'Day 15', 'Day 20', 'Day 25', 'Day 30'],
            datasets: [
              {
                data: [50000, 65000, 72000, 78000, 85000, 92000, 100000],
                strokeWidth: 2,
                color: () => COLORS.primary,
              }
            ]
          }}
          width={350}
          height={220}
          chartConfig={{
            backgroundColor: '#fff',
            backgroundGradientFrom: '#fff',
            backgroundGradientTo: '#fff',
            decimalPlaces: 0,
            color: () => COLORS.primary,
            labelColor: () => COLORS.mutedDark,
            propsForDots: { r: '4', strokeWidth: '2', stroke: COLORS.primary }
          }}
        />
      </View>
    </ScrollView>
  );

  const renderAirportBookings = () => (
    <ScrollView style={styles.tabContent}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Airport Bookings</Text>
        <Text style={styles.headerSubtitle}>{airportBookings.length} Active</Text>
      </View>

      <FlatList
        data={airportBookings.slice(0, 10)}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <AirportBookingCard booking={item} onAction={() => {}} />
        )}
      />
    </ScrollView>
  );

  const renderCorporateAccounts = () => (
    <ScrollView style={styles.tabContent}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Corporate Accounts</Text>
        <Text style={styles.headerSubtitle}>{analytics.activeCorporateAccounts} Active</Text>
      </View>

      {/* Account Creation Form */}
      <TouchableOpacity style={styles.addButton}>
        <MaterialIcons name="add-circle" size={20} color={COLORS.light} />
        <Text style={styles.addButtonText}>Add New Corporate Account</Text>
      </TouchableOpacity>

      {/* Corporate Accounts List */}
      <FlatList
        data={corporateAccounts.slice(0, 10)}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <CorporateAccountCard account={item} />
        )}
      />
    </ScrollView>
  );

  const renderHeatmap = () => (
    <ScrollView style={styles.tabContent}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Live Driver Heatmap</Text>
        <TouchableOpacity style={styles.refreshButton} onPress={fetchAllData}>
          <MaterialIcons name="refresh" size={18} color={COLORS.primary} />
        </TouchableOpacity>
      </View>

      {/* Heatmap Stats */}
      <View style={styles.statsContainer}>
        <StatBox
          label="Total Active Drivers"
          value={heatmapData.reduce((sum, p) => sum + p.drivers_count, 0)}
          color={COLORS.success}
        />
        <StatBox
          label="High Demand Zones"
          value={heatmapData.filter(p => p.demand_level === 'high' || p.demand_level === 'critical').length}
          color={COLORS.warning}
        />
      </View>

      {/* Demand Distribution Pie Chart */}
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Demand Distribution</Text>
        <PieChart
          data={[
            { name: 'Low', population: heatmapData.filter(p => p.demand_level === 'low').length, color: COLORS.success, legendFontColor: COLORS.dark },
            { name: 'Medium', population: heatmapData.filter(p => p.demand_level === 'medium').length, color: COLORS.secondary, legendFontColor: COLORS.dark },
            { name: 'High', population: heatmapData.filter(p => p.demand_level === 'high').length, color: COLORS.warning, legendFontColor: COLORS.dark },
            { name: 'Critical', population: heatmapData.filter(p => p.demand_level === 'critical').length, color: COLORS.error, legendFontColor: COLORS.dark }
          ]}
          width={350}
          height={220}
          chartConfig={{
            color: () => COLORS.primary,
          }}
          accessor="population"
          backgroundColor="transparent"
          paddingLeft="15"
          center={[60, 0]}
        />
      </View>

      {/* Hotspot Zones */}
      <View style={styles.zonesContainer}>
        <Text style={styles.zonesTitle}>Active Hotspots</Text>
        {heatmapData.filter(p => p.demand_level === 'critical' || p.demand_level === 'high').slice(0, 5).map((point, idx) => (
          <View key={idx} style={styles.hotspotRow}>
            <View style={[styles.demandIndicator, { backgroundColor: point.demand_level === 'critical' ? COLORS.error : COLORS.warning }]} />
            <View style={styles.hotspotInfo}>
              <Text style={styles.hotspotLabel}>{point.latitude.toFixed(3)}, {point.longitude.toFixed(3)}</Text>
              <Text style={styles.hotspotDetail}>{point.drivers_count} drivers | Surge: {point.surge_multiplier}x</Text>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      {/* Tab Navigation */}
      <View style={styles.tabBar}>
        <TabButton
          icon="dashboard"
          label="Overview"
          active={activeTab === 'overview'}
          onPress={() => setActiveTab('overview')}
        />
        <TabButton
          icon="local-airport"
          label="Airport"
          active={activeTab === 'airport'}
          onPress={() => setActiveTab('airport')}
        />
        <TabButton
          icon="business"
          label="Corporate"
          active={activeTab === 'corporate'}
          onPress={() => setActiveTab('corporate')}
        />
        <TabButton
          icon="location"
          label="Heatmap"
          active={activeTab === 'heatmap'}
          onPress={() => setActiveTab('heatmap')}
        />
      </View>

      {/* Tab Content */}
      {loading && activeTab !== 'overview' ? (
        <View style={styles.loaderContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <>
          {activeTab === 'overview' && renderOverview()}
          {activeTab === 'airport' && renderAirportBookings()}
          {activeTab === 'corporate' && renderCorporateAccounts()}
          {activeTab === 'heatmap' && renderHeatmap()}
        </>
      )}
    </View>
  );
};

/**
 * COMPONENT: Metric Card
 */
const MetricCard = ({ icon, title, value, revenue }) => (
  <View style={styles.metricCard}>
    <MaterialIcons name={icon} size={32} color={COLORS.primary} />
    <Text style={styles.metricTitle}>{title}</Text>
    <Text style={styles.metricValue}>{value}</Text>
    {revenue && <Text style={styles.metricRevenue}>{revenue}</Text>}
  </View>
);

/**
 * COMPONENT: Airport Booking Card
 */
const AirportBookingCard = ({ booking, onAction }) => (
  <View style={styles.bookingCard}>
    <View style={styles.bookingHeader}>
      <Text style={styles.bookingId}>{booking.flight_number}</Text>
      <Text style={[styles.bookingStatus, { color: booking.status === 'completed' ? COLORS.success : COLORS.warning }]}>
        {booking.status.toUpperCase()}
      </Text>
    </View>
    <View style={styles.bookingDetails}>
      <Text style={styles.detailText}>Passenger: {booking.passenger_name}</Text>
      <Text style={styles.detailText}>Airport: {booking.airport_code}</Text>
      <Text style={styles.detailText}>Terminal: {booking.terminal_id}</Text>
      <Text style={styles.detailText}>Fare: ₹{booking.total_fare}</Text>
    </View>
    {booking.meet_and_greet && (
      <View style={styles.serviceTag}>
        <MaterialIcons name="person" size={14} color={COLORS.secondary} />
        <Text style={styles.serviceText}>Meet & Greet</Text>
      </View>
    )}
  </View>
);

/**
 * COMPONENT: Corporate Account Card
 */
const CorporateAccountCard = ({ account }) => {
  const spentPercent = (account.current_month_spent / account.monthly_budget) * 100;
  
  return (
    <View style={styles.accountCard}>
      <View style={styles.accountHeader}>
        <Text style={styles.accountName}>{account.company_name}</Text>
        <Text style={[styles.accountStatus, { color: account.is_active ? COLORS.success : COLORS.error }]}>
          {account.is_active ? 'ACTIVE' : 'INACTIVE'}
        </Text>
      </View>
      <View style={styles.accountDetails}>
        <Text style={styles.detailText}>Admin: {account.admin_email}</Text>
        <Text style={styles.detailText}>Employees: {account.employee_count}</Text>
      </View>
      <View style={styles.budgetProgressContainer}>
        <View style={styles.budgetHeader}>
          <Text style={styles.budgetLabel}>Budget Usage</Text>
          <Text style={styles.budgetAmount}>₹{account.current_month_spent} / ₹{account.monthly_budget}</Text>
        </View>
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${Math.min(spentPercent, 100)}%`,
                backgroundColor: spentPercent > 80 ? COLORS.warning : COLORS.success
              }
            ]}
          />
        </View>
      </View>
    </View>
  );
};

/**
 * COMPONENT: Tab Button
 */
const TabButton = ({ icon, label, active, onPress }) => (
  <TouchableOpacity
    style={[styles.tabButton, active && styles.tabButtonActive]}
    onPress={onPress}>
    <MaterialIcons name={icon} size={20} color={active ? COLORS.primary : COLORS.mutedDark} />
    <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
  </TouchableOpacity>
);

/**
 * COMPONENT: Stat Box
 */
const StatBox = ({ label, value, color }) => (
  <View style={[styles.statBox, { borderLeftColor: color }]}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={[styles.statValue, { color }]}>{value}</Text>
  </View>
);

/**
 * STYLES
 */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.light,
    paddingHorizontal: 8,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: COLORS.primary,
  },
  tabLabel: {
    fontSize: 12,
    marginLeft: 4,
    color: COLORS.mutedDark,
  },
  tabLabelActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  tabContent: {
    flex: 1,
    padding: 16,
  },
  loaderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  metricCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginRight: '4%',
    marginBottom: 12,
    alignItems: 'center',
  },
  metricTitle: {
    fontSize: 11,
    color: COLORS.mutedDark,
    marginTop: 8,
    textAlign: 'center',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 4,
  },
  metricRevenue: {
    fontSize: 10,
    color: COLORS.success,
    marginTop: 4,
  },
  chartContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    alignItems: 'center',
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.dark,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.dark,
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.mutedDark,
  },
  refreshButton: {
    padding: 8,
  },
  addButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  bookingCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.secondary,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  bookingId: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  bookingStatus: {
    fontSize: 11,
    fontWeight: '700',
  },
  bookingDetails: {
    marginBottom: 8,
  },
  detailText: {
    fontSize: 12,
    color: COLORS.mutedDark,
    marginBottom: 4,
  },
  serviceTag: {
    flexDirection: 'row',
    backgroundColor: `${COLORS.secondary}20`,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
    alignItems: 'center',
    width: '50%',
  },
  serviceText: {
    fontSize: 11,
    color: COLORS.secondary,
    marginLeft: 4,
    fontWeight: '600',
  },
  accountCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  accountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  accountName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.dark,
  },
  accountStatus: {
    fontSize: 11,
    fontWeight: '700',
  },
  accountDetails: {
    marginBottom: 8,
  },
  budgetProgressContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.light,
  },
  budgetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  budgetLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.mutedDark,
  },
  budgetAmount: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.primary,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#e0e0e0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
  },
  statsContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    marginRight: 8,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.mutedDark,
    marginBottom: 6,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  zonesContainer: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginTop: 16,
  },
  zonesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.dark,
    marginBottom: 12,
  },
  hotspotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.light,
  },
  demandIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  hotspotInfo: {
    flex: 1,
  },
  hotspotLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.dark,
  },
  hotspotDetail: {
    fontSize: 11,
    color: COLORS.mutedDark,
    marginTop: 2,
  },
});

export default AdminDashboard;
