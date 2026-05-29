/**
 * Fleet Profitability Dashboard Screen
 * Real-time financial metrics, vehicle profitability analysis, and ROI tracking
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
  Dimensions,
  StyleSheet,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const COLORS = {
  primary: '#2D4A7B',
  secondary: '#FF8C42',
  success: '#4CAF50',
  warning: '#FFC107',
  danger: '#F44336',
  light: '#F5F5F5',
  dark: '#333333',
  text: '#666666',
  border: '#E0E0E0',
  white: '#FFFFFF',
};

const SHADOWS = {
  small: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 5,
  },
  large: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
};

const FleetProfitabilityScreen = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [portfolioData, setPortfolioData] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [vehiclesData, setVehiclesData] = useState(null);
  const [tipsData, setTipsData] = useState(null);
  const [roiData, setRoiData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fleetId = 'fleet_bangalore_001';

  // Fetch portfolio data
  const fetchPortfolio = useCallback(async () => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/v1/fleet-profitability/fleets/${fleetId}/portfolio`,
        { headers: { Authorization: 'Bearer test-token' } }
      );
      const json = await response.json();
      if (json.status === 'success') {
        setPortfolioData(json.data);
      }
    } catch (error) {
      console.error('Portfolio fetch error:', error);
    }
  }, [fleetId]);

  // Fetch dashboard data
  const fetchDashboard = useCallback(async () => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/v1/fleet-profitability/fleets/${fleetId}/dashboard`,
        { headers: { Authorization: 'Bearer test-token' } }
      );
      const json = await response.json();
      if (json.status === 'success') {
        setDashboardData(json.data);
      }
    } catch (error) {
      console.error('Dashboard fetch error:', error);
    }
  }, [fleetId]);

  // Fetch vehicles
  const fetchVehicles = useCallback(async () => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/v1/fleet-profitability/fleets/${fleetId}/vehicles?limit=5`,
        { headers: { Authorization: 'Bearer test-token' } }
      );
      const json = await response.json();
      if (json.status === 'success') {
        setVehiclesData(json.data);
      }
    } catch (error) {
      console.error('Vehicles fetch error:', error);
    }
  }, [fleetId]);

  // Fetch tips
  const fetchTips = useCallback(async () => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/v1/fleet-profitability/fleets/${fleetId}/optimization-tips`,
        { headers: { Authorization: 'Bearer test-token' } }
      );
      const json = await response.json();
      if (json.status === 'success') {
        setTipsData(json.data);
      }
    } catch (error) {
      console.error('Tips fetch error:', error);
    }
  }, [fleetId]);

  // Fetch ROI
  const fetchROI = useCallback(async () => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/v1/fleet-profitability/fleets/${fleetId}/roi-summary`,
        { headers: { Authorization: 'Bearer test-token' } }
      );
      const json = await response.json();
      if (json.status === 'success') {
        setRoiData(json.data);
      }
    } catch (error) {
      console.error('ROI fetch error:', error);
    }
  }, [fleetId]);

  // Load all data
  const loadAllData = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchPortfolio(),
      fetchDashboard(),
      fetchVehicles(),
      fetchTips(),
      fetchROI(),
    ]);
    setLoading(false);
  }, [fetchPortfolio, fetchDashboard, fetchVehicles, fetchTips, fetchROI]);

  // Initial load
  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Set up intervals for refresh
  useEffect(() => {
    const dashboardInterval = setInterval(fetchDashboard, 15000); // 15s
    const vehiclesInterval = setInterval(fetchVehicles, 30000); // 30s
    const portfolioInterval = setInterval(fetchPortfolio, 30000); // 30s

    return () => {
      clearInterval(dashboardInterval);
      clearInterval(vehiclesInterval);
      clearInterval(portfolioInterval);
    };
  }, [fetchDashboard, fetchVehicles, fetchPortfolio]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAllData().then(() => setRefreshing(false));
  }, [loadAllData]);

  // ============================================================================
  // OVERVIEW TAB
  // ============================================================================
  const OverviewTab = () => (
    <ScrollView
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {dashboardData && (
        <>
          {/* Daily Summary Card */}
          <View style={[styles.card, SHADOWS.medium]}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons
                name="calendar-today"
                size={24}
                color={COLORS.primary}
              />
              <Text style={styles.cardTitle}>Today's Performance</Text>
            </View>

            <View style={styles.summaryRow}>
              <SummaryCard
                label="Revenue"
                value={`₹${(dashboardData.daily_summary.revenue / 100000).toFixed(1)}L`}
                icon="trending-up"
                color={COLORS.success}
              />
              <SummaryCard
                label="Cost"
                value={`₹${(dashboardData.daily_summary.cost / 100000).toFixed(1)}L`}
                icon="trending-down"
                color={COLORS.warning}
              />
              <SummaryCard
                label="Profit"
                value={`₹${(dashboardData.daily_summary.profit / 100000).toFixed(1)}L`}
                icon="cash"
                color={COLORS.success}
              />
            </View>

            <View style={styles.marginBar}>
              <View style={styles.marginLabel}>
                <Text style={styles.label}>Margin</Text>
                <Text style={styles.marginValue}>
                  {dashboardData.daily_summary.margin_percentage.toFixed(1)}%
                </Text>
              </View>
              <View
                style={[
                  styles.marginProgress,
                  {
                    width: `${dashboardData.daily_summary.margin_percentage}%`,
                    backgroundColor:
                      dashboardData.daily_summary.margin_percentage > 50
                        ? COLORS.success
                        : COLORS.warning,
                  },
                ]}
              />
            </View>
          </View>

          {/* Weekly Summary */}
          <View style={[styles.card, SHADOWS.medium]}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons
                name="calendar-week"
                size={24}
                color={COLORS.secondary}
              />
              <Text style={styles.cardTitle}>Weekly Outlook</Text>
              <View style={[styles.trendBadge, {
                backgroundColor: dashboardData.weekly_summary.trend === 'up' ? COLORS.success : COLORS.danger
              }]}>
                <MaterialCommunityIcons
                  name={dashboardData.weekly_summary.trend === 'up' ? 'trending-up' : 'trending-down'}
                  size={16}
                  color={COLORS.white}
                />
              </View>
            </View>

            <View style={styles.weeklyMetrics}>
              <MetricRow
                label="Revenue"
                value={`₹${(dashboardData.weekly_summary.revenue / 1000000).toFixed(1)}M`}
              />
              <MetricRow
                label="Profit"
                value={`₹${(dashboardData.weekly_summary.profit / 1000000).toFixed(1)}M`}
              />
              <MetricRow
                label="Margin"
                value={`${dashboardData.weekly_summary.margin_percentage.toFixed(1)}%`}
              />
            </View>
          </View>

          {/* Fleet Status */}
          {portfolioData && (
            <View style={[styles.card, SHADOWS.medium]}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons
                  name="car-multiple"
                  size={24}
                  color={COLORS.primary}
                />
                <Text style={styles.cardTitle}>Fleet Status</Text>
              </View>

              <View style={styles.statusGrid}>
                <StatusBox
                  label="Active"
                  value={portfolioData.active_vehicles}
                  total={portfolioData.total_vehicles}
                  color={COLORS.success}
                />
                <StatusBox
                  label="Idle"
                  value={portfolioData.idle_vehicles}
                  total={portfolioData.total_vehicles}
                  color={COLORS.warning}
                />
                <StatusBox
                  label="Maintenance"
                  value={portfolioData.maintenance_vehicles}
                  total={portfolioData.total_vehicles}
                  color={COLORS.danger}
                />
              </View>
            </View>
          )}
        </>
      )}
    </ScrollView>
  );

  // ============================================================================
  // VEHICLES TAB
  // ============================================================================
  const VehiclesTab = () => (
    <ScrollView
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {vehiclesData && (
        <>
          {/* Top Performers */}
          <View style={[styles.card, SHADOWS.medium]}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons
                name="star"
                size={24}
                color={COLORS.warning}
              />
              <Text style={styles.cardTitle}>Top Performers</Text>
            </View>

            <FlatList
              data={vehiclesData.vehicles.slice(0, 3)}
              keyExtractor={(item) => item.vehicle_id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.vehicleCard}>
                  <View style={styles.vehicleHeader}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.vehicleNumber}>{item.vehicle_number}</Text>
                      <Text style={styles.vehicleType}>{item.vehicle_type}</Text>
                    </View>
                    <View style={[
                      styles.tierBadge,
                      {
                        backgroundColor:
                          item.tier === 'premium'
                            ? COLORS.success
                            : item.tier === 'high'
                            ? COLORS.warning
                            : COLORS.text
                      }
                    ]}>
                      <Text style={styles.tierText}>{item.tier.toUpperCase()}</Text>
                    </View>
                  </View>

                  <View style={styles.vehicleMetrics}>
                    <VehicleMetric
                      label="Profit"
                      value={`₹${item.daily_profit.toFixed(0)}`}
                      icon="cash"
                    />
                    <VehicleMetric
                      label="Margin"
                      value={`${item.profit_margin.toFixed(0)}%`}
                      icon="percent"
                    />
                    <VehicleMetric
                      label="Rating"
                      value={item.average_rating}
                      icon="star"
                    />
                  </View>
                </TouchableOpacity>
              )}
              scrollEnabled={false}
            />
          </View>

          {/* All Vehicles */}
          <View style={[styles.card, SHADOWS.medium]}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons
                name="list"
                size={24}
                color={COLORS.primary}
              />
              <Text style={styles.cardTitle}>All Vehicles ({vehiclesData.total_count})</Text>
            </View>

            <FlatList
              data={vehiclesData.vehicles}
              keyExtractor={(item) => item.vehicle_id}
              renderItem={({ item }) => (
                <View style={styles.vehicleListItem}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vehicleListNumber}>{item.vehicle_number}</Text>
                    <Text style={styles.vehicleListStatus}>{item.status}</Text>
                  </View>
                  <View style={styles.vehicleListRight}>
                    <Text style={styles.vehicleListProfit}>
                      ₹{item.daily_profit.toFixed(0)}
                    </Text>
                    <Text style={[
                      styles.vehicleListMargin,
                      {
                        color: item.profit_margin > 50 ? COLORS.success : COLORS.warning
                      }
                    ]}>
                      {item.profit_margin.toFixed(0)}%
                    </Text>
                  </View>
                </View>
              )}
              scrollEnabled={false}
            />
          </View>
        </>
      )}
    </ScrollView>
  );

  // ============================================================================
  // ROI TAB
  // ============================================================================
  const ROITab = () => (
    <ScrollView
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {roiData && (
        <>
          <View style={[styles.card, SHADOWS.medium]}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons
                name="calculator"
                size={24}
                color={COLORS.primary}
              />
              <Text style={styles.cardTitle}>Fleet ROI Analysis</Text>
            </View>

            <View style={styles.roiMetrics}>
              <ROICard
                label="Total Investment"
                value={`₹${(roiData.total_investment / 10000000).toFixed(1)}Cr`}
                icon="bank"
              />
              <ROICard
                label="Cumulative Profit"
                value={`₹${(roiData.total_cumulative_profit / 1000000).toFixed(1)}M`}
                icon="chart-line"
              />
              <ROICard
                label="Overall ROI"
                value={`${roiData.overall_roi_percentage.toFixed(1)}%`}
                icon="percent"
              />
            </View>

            <View style={styles.roiSummary}>
              <ROISummaryItem
                label="Avg Vehicle ROI"
                value={`${roiData.average_vehicle_roi.toFixed(1)}%`}
                trend="up"
              />
              <ROISummaryItem
                label="Avg Payoff"
                value={`${roiData.average_payoff_months.toFixed(0)} months`}
              />
              <ROISummaryItem
                label="ROI Positive"
                value={roiData.vehicles_roi_positive}
              />
            </View>
          </View>

          {/* ROI Status */}
          <View style={[styles.card, SHADOWS.medium]}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons
                name="information"
                size={24}
                color={COLORS.warning}
              />
              <Text style={styles.cardTitle}>ROI Status</Text>
            </View>

            <View style={styles.roiStatus}>
              <View style={styles.roiStatusItem}>
                <Text style={styles.roiStatusLabel}>Best ROI Vehicle</Text>
                <Text style={styles.roiStatusValue}>{roiData.best_roi_vehicle}</Text>
              </View>
              <View style={styles.roiStatusDivider} />
              <View style={styles.roiStatusItem}>
                <Text style={styles.roiStatusLabel}>Vehicles with Negative ROI</Text>
                <Text style={[styles.roiStatusValue, { color: COLORS.danger }]}>
                  {roiData.vehicles_roi_negative}
                </Text>
              </View>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );

  // ============================================================================
  // OPTIMIZATION TAB
  // ============================================================================
  const OptimizationTab = () => (
    <ScrollView
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {tipsData && (
        <>
          <View style={[styles.card, SHADOWS.medium]}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons
                name="lightbulb-on"
                size={24}
                color={COLORS.secondary}
              />
              <Text style={styles.cardTitle}>Optimization Tips</Text>
            </View>

            <View style={styles.potentialIncrease}>
              <Text style={styles.potentialLabel}>Total Potential Increase</Text>
              <Text style={styles.potentialValue}>
                ₹{(tipsData.total_potential_profit_increase / 100000).toFixed(1)}L
              </Text>
            </View>
          </View>

          <FlatList
            data={tipsData.optimization_tips}
            keyExtractor={(item) => item.tip_id}
            renderItem={({ item }) => (
              <View style={[styles.card, SHADOWS.medium, { marginHorizontal: 12, marginBottom: 12 }]}>
                <View style={styles.tipHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tipTitle}>{item.title}</Text>
                    <Text style={styles.tipArea}>{item.impact_area}</Text>
                  </View>
                  <View style={[styles.priorityBadge, {
                    backgroundColor: item.priority === 'high' ? COLORS.danger : item.priority === 'medium' ? COLORS.warning : COLORS.success
                  }]}>
                    <Text style={styles.priorityText}>{item.priority.toUpperCase()}</Text>
                  </View>
                </View>

                <View style={styles.tipMetrics}>
                  <TipMetric
                    label="Potential Increase"
                    value={`₹${(item.potential_profit_increase / 100000).toFixed(1)}L`}
                    icon="trending-up"
                  />
                  <TipMetric
                    label="ROI Days"
                    value={item.estimated_roi_days}
                    icon="calendar"
                  />
                  <TipMetric
                    label="Difficulty"
                    value={item.implementation_difficulty}
                    icon="tools"
                  />
                </View>

                <TouchableOpacity style={styles.implementButton}>
                  <MaterialCommunityIcons name="check" size={18} color={COLORS.white} />
                  <Text style={styles.implementButtonText}>Review</Text>
                </TouchableOpacity>
              </View>
            )}
            scrollEnabled={false}
          />
        </>
      )}
    </ScrollView>
  );

  // ============================================================================
  // SUB-COMPONENTS
  // ============================================================================

  const SummaryCard = ({ label, value, icon, color }) => (
    <View style={styles.summaryCard}>
      <MaterialCommunityIcons name={icon} size={24} color={color} />
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );

  const MetricRow = ({ label, value }) => (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );

  const StatusBox = ({ label, value, total, color }) => (
    <View style={styles.statusBox}>
      <MaterialCommunityIcons name="car" size={20} color={color} />
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={styles.statusValue}>{value}</Text>
      <Text style={styles.statusTotal}>of {total}</Text>
    </View>
  );

  const VehicleMetric = ({ label, value, icon }) => (
    <View style={styles.vehicleMetric}>
      <MaterialCommunityIcons name={icon} size={16} color={COLORS.text} />
      <Text style={styles.vehicleMetricLabel}>{label}</Text>
      <Text style={styles.vehicleMetricValue}>{value}</Text>
    </View>
  );

  const ROICard = ({ label, value, icon }) => (
    <View style={styles.roiCard}>
      <MaterialCommunityIcons name={icon} size={24} color={COLORS.primary} />
      <Text style={styles.roiCardLabel}>{label}</Text>
      <Text style={styles.roiCardValue}>{value}</Text>
    </View>
  );

  const ROISummaryItem = ({ label, value, trend }) => (
    <View style={styles.roiSummaryItem}>
      {trend && (
        <MaterialCommunityIcons
          name={trend === 'up' ? 'trending-up' : 'trending-down'}
          size={18}
          color={trend === 'up' ? COLORS.success : COLORS.danger}
        />
      )}
      <View style={{ flex: 1, marginLeft: trend ? 8 : 0 }}>
        <Text style={styles.roiSummaryLabel}>{label}</Text>
      </View>
      <Text style={styles.roiSummaryValue}>{value}</Text>
    </View>
  );

  const TipMetric = ({ label, value, icon }) => (
    <View style={styles.tipMetric}>
      <MaterialCommunityIcons name={icon} size={16} color={COLORS.text} />
      <Text style={styles.tipMetricLabel}>{label}:</Text>
      <Text style={styles.tipMetricValue}>{value}</Text>
    </View>
  );

  // ============================================================================
  // MAIN RENDER
  // ============================================================================

  const TabButton = ({ label, tab, icon }) => (
    <TouchableOpacity
      style={[
        styles.tabButton,
        activeTab === tab && { borderBottomColor: COLORS.primary, borderBottomWidth: 3 },
      ]}
      onPress={() => setActiveTab(tab)}
    >
      <MaterialCommunityIcons
        name={icon}
        size={20}
        color={activeTab === tab ? COLORS.primary : COLORS.text}
      />
      <Text
        style={[
          styles.tabLabel,
          activeTab === tab ? { color: COLORS.primary, fontWeight: '600' } : { color: COLORS.text },
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );

  if (loading && !dashboardData) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ marginTop: 12 }}>Loading profitability data...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, SHADOWS.medium]}>
        <Text style={styles.headerTitle}>Fleet Profitability</Text>
        <Text style={styles.headerSubtitle}>Financial Analytics & Insights</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TabButton label="Overview" tab="overview" icon="chart-box" />
        <TabButton label="Vehicles" tab="vehicles" icon="car-multiple" />
        <TabButton label="ROI" tab="roi" icon="calculator" />
        <TabButton label="Tips" tab="optimization" icon="lightbulb-on" />
      </View>

      {/* Tab Content */}
      <View style={styles.content}>
        {activeTab === 'overview' && <OverviewTab />}
        {activeTab === 'vehicles' && <VehiclesTab />}
        {activeTab === 'roi' && <ROITab />}
        {activeTab === 'optimization' && <OptimizationTab />}
      </View>
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.light,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.white,
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.primary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: COLORS.text,
    marginTop: 4,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
    paddingHorizontal: 8,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 11,
    marginTop: 4,
  },
  content: {
    flex: 1,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 8,
    padding: 12,
    margin: 12,
    marginBottom: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.primary,
    marginLeft: 12,
    flex: 1,
  },
  trendBadge: {
    padding: 6,
    borderRadius: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: COLORS.light,
    borderRadius: 8,
    marginHorizontal: 6,
  },
  summaryLabel: {
    fontSize: 11,
    color: COLORS.text,
    marginTop: 8,
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 4,
  },
  marginBar: {
    marginTop: 12,
  },
  marginLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  label: {
    fontSize: 12,
    color: COLORS.text,
  },
  marginValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  marginProgress: {
    height: 8,
    backgroundColor: COLORS.light,
    borderRadius: 4,
  },
  weeklyMetrics: {
    marginBottom: 8,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
  },
  metricLabel: {
    fontSize: 13,
    color: COLORS.text,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  statusGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: COLORS.light,
    borderRadius: 8,
    marginHorizontal: 6,
  },
  statusLabel: {
    fontSize: 11,
    color: COLORS.text,
    marginTop: 8,
  },
  statusValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 4,
  },
  statusTotal: {
    fontSize: 10,
    color: COLORS.text,
    marginTop: 2,
  },
  vehicleCard: {
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: COLORS.light,
    marginBottom: 8,
  },
  vehicleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  vehicleNumber: {
    fontWeight: '600',
    color: COLORS.primary,
  },
  vehicleType: {
    fontSize: 12,
    color: COLORS.text,
    marginTop: 2,
  },
  tierBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  tierText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.white,
  },
  vehicleMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  vehicleMetric: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  vehicleMetricLabel: {
    fontSize: 10,
    color: COLORS.text,
    marginTop: 4,
  },
  vehicleMetricValue: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
    marginTop: 2,
  },
  vehicleListItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
  },
  vehicleListNumber: {
    fontWeight: '600',
    color: COLORS.primary,
  },
  vehicleListStatus: {
    fontSize: 12,
    color: COLORS.text,
    marginTop: 4,
  },
  vehicleListRight: {
    alignItems: 'flex-end',
  },
  vehicleListProfit: {
    fontWeight: '700',
    color: COLORS.primary,
  },
  vehicleListMargin: {
    fontSize: 12,
    marginTop: 4,
  },
  roiMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  roiCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: COLORS.light,
    borderRadius: 8,
    marginHorizontal: 6,
  },
  roiCardLabel: {
    fontSize: 11,
    color: COLORS.text,
    marginTop: 8,
  },
  roiCardValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 4,
  },
  roiSummary: {
    marginBottom: 8,
  },
  roiSummaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
  },
  roiSummaryLabel: {
    fontSize: 13,
    color: COLORS.text,
  },
  roiSummaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    marginLeft: 'auto',
  },
  roiStatus: {
    flexDirection: 'row',
    paddingVertical: 12,
  },
  roiStatusItem: {
    flex: 1,
    alignItems: 'center',
  },
  roiStatusLabel: {
    fontSize: 12,
    color: COLORS.text,
  },
  roiStatusValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 4,
  },
  roiStatusDivider: {
    width: 1,
    backgroundColor: COLORS.border,
  },
  potentialIncrease: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: COLORS.light,
    borderRadius: 8,
    marginBottom: 16,
  },
  potentialLabel: {
    fontSize: 12,
    color: COLORS.text,
  },
  potentialValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.success,
    marginTop: 4,
  },
  tipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  tipTitle: {
    fontWeight: '600',
    color: COLORS.primary,
  },
  tipArea: {
    fontSize: 12,
    color: COLORS.text,
    marginTop: 4,
  },
  priorityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  priorityText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.white,
  },
  tipMetrics: {
    marginBottom: 12,
  },
  tipMetric: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  tipMetricLabel: {
    fontSize: 12,
    color: COLORS.text,
    marginLeft: 8,
  },
  tipMetricValue: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
    marginLeft: 'auto',
  },
  implementButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 6,
  },
  implementButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.white,
    marginLeft: 6,
  },
});

export default FleetProfitabilityScreen;
