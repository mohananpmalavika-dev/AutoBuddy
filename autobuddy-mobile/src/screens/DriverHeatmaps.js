/**
 * Driver Heatmaps & Demand Forecasting Screen
 * Real-time visualization of driver distribution, demand patterns, and AI-driven insights
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
  Modal,
  Dimensions,
  StyleSheet,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSocket } from '../integration/socket-service';

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

const DriverHeatmapsScreen = () => {
  const { socket, isConnected } = useSocket();
  const [activeTab, setActiveTab] = useState('heatmap');
  const [heatmapData, setHeatmapData] = useState(null);
  const [forecastData, setForecastData] = useState(null);
  const [trendData, setTrendData] = useState(null);
  const [alertsData, setAlertsData] = useState(null);
  const [recommendationsData, setRecommendationsData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const cityId = 'city_bangalore'; // Default city

  // Fetch heatmap data
  const fetchHeatmap = useCallback(async () => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/v1/heatmaps/cities/${cityId}/live`,
        { headers: { Authorization: 'Bearer test-token' } }
      );
      const json = await response.json();
      if (json.status === 'success') {
        setHeatmapData(json.data);
      }
    } catch (error) {
      console.error('Heatmap fetch error:', error);
    }
  }, [cityId]);

  // Fetch forecast data
  const fetchForecast = useCallback(async () => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/v1/heatmaps/cities/${cityId}/forecast/demand`,
        { headers: { Authorization: 'Bearer test-token' } }
      );
      const json = await response.json();
      if (json.status === 'success') {
        setForecastData(json.data);
      }
    } catch (error) {
      console.error('Forecast fetch error:', error);
    }
  }, [cityId]);

  // Fetch trends data
  const fetchTrends = useCallback(async () => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/v1/heatmaps/cities/${cityId}/trends/weekly`,
        { headers: { Authorization: 'Bearer test-token' } }
      );
      const json = await response.json();
      if (json.status === 'success') {
        setTrendData(json.data);
      }
    } catch (error) {
      console.error('Trends fetch error:', error);
    }
  }, [cityId]);

  // Fetch alerts data
  const fetchAlerts = useCallback(async () => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/v1/heatmaps/cities/${cityId}/supply-gap-alerts`,
        { headers: { Authorization: 'Bearer test-token' } }
      );
      const json = await response.json();
      if (json.status === 'success') {
        setAlertsData(json.data);
      }
    } catch (error) {
      console.error('Alerts fetch error:', error);
    }
  }, [cityId]);

  // Fetch recommendations
  const fetchRecommendations = useCallback(async () => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/v1/heatmaps/cities/${cityId}/incentive-recommendations`,
        { headers: { Authorization: 'Bearer test-token' } }
      );
      const json = await response.json();
      if (json.status === 'success') {
        setRecommendationsData(json.data);
      }
    } catch (error) {
      console.error('Recommendations fetch error:', error);
    }
  }, [cityId]);

  // Load all data
  const loadAllData = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchHeatmap(),
      fetchForecast(),
      fetchTrends(),
      fetchAlerts(),
      fetchRecommendations(),
    ]);
    setLoading(false);
  }, [fetchHeatmap, fetchForecast, fetchTrends, fetchAlerts, fetchRecommendations]);

  // Initial load
  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Set up intervals for refresh
  useEffect(() => {
    const heatmapInterval = setInterval(fetchHeatmap, 10000); // 10s
    const forecastInterval = setInterval(fetchForecast, 30000); // 30s
    const trendsInterval = setInterval(fetchTrends, 60000); // 60s
    const alertsInterval = setInterval(fetchAlerts, 15000); // 15s
    const recsInterval = setInterval(fetchRecommendations, 30000); // 30s

    return () => {
      clearInterval(heatmapInterval);
      clearInterval(forecastInterval);
      clearInterval(trendsInterval);
      clearInterval(alertsInterval);
      clearInterval(recsInterval);
    };
  }, [fetchHeatmap, fetchForecast, fetchTrends, fetchAlerts, fetchRecommendations]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadAllData().then(() => setRefreshing(false));
  }, [loadAllData]);

  // ============================================================================
  // HEATMAP TAB
  // ============================================================================
  const HeatmapTab = () => (
    <ScrollView
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Summary Card */}
      {heatmapData && (
        <View style={[styles.card, SHADOWS.medium]}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons
              name="map-marker-multiple"
              size={24}
              color={COLORS.primary}
            />
            <Text style={styles.cardTitle}>Live Heatmap Summary</Text>
          </View>

          <View style={styles.gridRow}>
            <MetricBox
              label="Active Drivers"
              value={heatmapData.total_active_drivers}
              icon="car"
            />
            <MetricBox
              label="Waiting Requests"
              value={heatmapData.total_waiting_requests}
              icon="phone-incoming"
            />
          </View>

          <View style={styles.gridRow}>
            <MetricBox
              label="Avg Demand"
              value={`${heatmapData.average_demand_score.toFixed(0)}`}
              icon="trending-up"
            />
            <MetricBox
              label="Low Supply Zones"
              value={heatmapData.low_supply_zones}
              icon="alert-circle"
            />
          </View>
        </View>
      )}

      {/* Grid Cells */}
      {heatmapData && (
        <View style={[styles.card, SHADOWS.medium]}>
          <View style={styles.cardHeader}>
            <MaterialCommunityIcons name="grid" size={24} color={COLORS.primary} />
            <Text style={styles.cardTitle}>Zone Breakdown ({heatmapData.grid_cells.length})</Text>
          </View>

          <FlatList
            data={heatmapData.grid_cells.slice(0, 8)}
            keyExtractor={(item) => item.cell_id}
            renderItem={({ item }) => (
              <View style={styles.gridCell}>
                <View style={styles.gridCellContent}>
                  <Text style={styles.gridCellLabel}>{item.cell_id}</Text>
                  <Text style={styles.gridCellValue}>{item.demand_score.toFixed(0)}</Text>
                </View>
                <View style={[
                  styles.demandBar,
                  {
                    backgroundColor:
                      item.demand_score > 75
                        ? COLORS.danger
                        : item.demand_score > 50
                        ? COLORS.warning
                        : COLORS.success,
                    width: `${item.demand_score}%`,
                  },
                ]} />
              </View>
            )}
            scrollEnabled={false}
          />
        </View>
      )}
    </ScrollView>
  );

  // ============================================================================
  // FORECAST TAB
  // ============================================================================
  const ForecastTab = () => (
    <ScrollView
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {forecastData && (
        <>
          <View style={[styles.card, SHADOWS.medium]}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons
                name="weather-cloudy"
                size={24}
                color={COLORS.primary}
              />
              <Text style={styles.cardTitle}>Demand Forecast ({forecastData.forecast_window_hours}h)</Text>
            </View>

            <FlatList
              data={forecastData.forecasts}
              keyExtractor={(item) => item.forecast_id}
              renderItem={({ item }) => (
                <View style={styles.forecastItem}>
                  <View style={styles.forecastTime}>
                    <Text style={styles.forecastPeriod}>{item.forecast_period.split('T')[1].slice(0, 5)}</Text>
                  </View>
                  <View style={styles.forecastMetrics}>
                    <View style={styles.metricRow}>
                      <Text style={styles.label}>Demand:</Text>
                      <Text style={styles.value}>{item.forecasted_demand_score.toFixed(0)}</Text>
                    </View>
                    <View style={styles.metricRow}>
                      <Text style={styles.label}>Confidence:</Text>
                      <Text style={styles.value}>{item.confidence_level.toFixed(0)}%</Text>
                    </View>
                    <View style={styles.metricRow}>
                      <Text style={styles.label}>Drivers Needed:</Text>
                      <Text style={styles.value}>{item.recommended_drivers_needed}</Text>
                    </View>
                  </View>
                </View>
              )}
              scrollEnabled={false}
            />
          </View>

          {/* Peak Hours */}
          <View style={[styles.card, SHADOWS.medium]}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="clock-alert" size={24} color={COLORS.warning} />
              <Text style={styles.cardTitle}>Forecasted Peak Hours</Text>
            </View>

            <FlatList
              data={forecastData.forecasts.filter((_, i) => i < 3)}
              keyExtractor={(item) => `peak_${item.forecast_id}`}
              renderItem={({ item }) => (
                <View
                  style={[
                    styles.peakItem,
                    item.forecasted_demand_score > 75 && { backgroundColor: COLORS.danger + '15' },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={item.forecasted_demand_score > 75 ? 'alert' : 'information'}
                    size={20}
                    color={item.forecasted_demand_score > 75 ? COLORS.danger : COLORS.warning}
                  />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.peakTime}>{item.forecast_period.split('T')[1].slice(0, 5)}</Text>
                    <Text style={styles.peakDemand}>
                      {item.forecasted_demand_score > 75 ? 'High' : 'Medium'} Demand Expected
                    </Text>
                  </View>
                  <Text style={styles.peakMultiplier}>×{item.recommended_incentive_multiplier.toFixed(1)}</Text>
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
  // TRENDS TAB
  // ============================================================================
  const TrendsTab = () => (
    <ScrollView
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {trendData && (
        <>
          <View style={[styles.card, SHADOWS.medium]}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons
                name="chart-line"
                size={24}
                color={COLORS.primary}
              />
              <Text style={styles.cardTitle}>Weekly Trends</Text>
            </View>

            <View style={styles.trendMetrics}>
              <TrendMetricRow
                icon="car-multiple"
                label="Avg Drivers Online"
                value={trendData.average_drivers_online}
                unit="drivers"
              />
              <TrendMetricRow
                icon="clock"
                label="Avg Wait Time"
                value={trendData.average_wait_time_minutes}
                unit="min"
              />
              <TrendMetricRow
                icon="route"
                label="Avg Ride Duration"
                value={trendData.average_ride_duration_minutes}
                unit="min"
              />
              <TrendMetricRow
                icon="percent"
                label="Cancellation Rate"
                value={trendData.cancellation_rate}
                unit="%"
              />
            </View>
          </View>

          {/* Peak & Low Hours */}
          <View style={[styles.card, SHADOWS.medium]}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="calendar-clock" size={24} color={COLORS.secondary} />
              <Text style={styles.cardTitle}>Time Patterns</Text>
            </View>

            <View style={styles.timePattern}>
              <View style={styles.timeBox}>
                <MaterialCommunityIcons name="trending-up" size={24} color={COLORS.danger} />
                <Text style={styles.timeLabel}>Peak Hours</Text>
                <Text style={styles.timeValue}>{trendData.peak_demand_time}</Text>
              </View>

              <View style={styles.timeBox}>
                <MaterialCommunityIcons name="trending-down" size={24} color={COLORS.success} />
                <Text style={styles.timeLabel}>Low Hours</Text>
                <Text style={styles.timeValue}>{trendData.low_demand_time}</Text>
              </View>
            </View>
          </View>

          {/* Performance Stats */}
          <View style={[styles.card, SHADOWS.medium]}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="star" size={24} color={COLORS.warning} />
              <Text style={styles.cardTitle}>Performance This Week</Text>
            </View>

            <View style={styles.statsGrid}>
              <StatCard
                value={trendData.total_completed_rides}
                label="Completed Rides"
                icon="check-circle"
                color={COLORS.success}
              />
              <StatCard
                value={trendData.demand_volatility.toFixed(0)}
                label="Demand Volatility"
                icon="wave"
                color={COLORS.warning}
                unit="%"
              />
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );

  // ============================================================================
  // ALERTS TAB
  // ============================================================================
  const AlertsTab = () => (
    <ScrollView
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {alertsData && (
        <>
          {/* Alert Summary */}
          <View style={[styles.card, SHADOWS.medium]}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons
                name="alert-multiple"
                size={24}
                color={COLORS.danger}
              />
              <Text style={styles.cardTitle}>Supply-Demand Gaps</Text>
            </View>

            <View style={styles.gridRow}>
              <MetricBox
                label="Total Alerts"
                value={alertsData.total_alerts}
                icon="alert-circle"
              />
              <MetricBox
                label="Unresolved"
                value={alertsData.unresolved_alerts}
                icon="clock-alert"
              />
            </View>
          </View>

          {/* Active Alerts */}
          <View style={[styles.card, SHADOWS.medium]}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="list-status" size={24} color={COLORS.danger} />
              <Text style={styles.cardTitle}>Active Alerts</Text>
            </View>

            <FlatList
              data={alertsData.alerts.filter((a) => !a.resolved)}
              keyExtractor={(item) => item.alert_id}
              renderItem={({ item }) => (
                <View
                  style={[
                    styles.alertItem,
                    item.severity === 'critical'
                      ? { borderLeftColor: COLORS.danger }
                      : item.severity === 'high'
                      ? { borderLeftColor: COLORS.warning }
                      : { borderLeftColor: COLORS.primary },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.alertZone}>{item.zone_id}</Text>
                    <Text style={styles.alertGap}>
                      {item.gap_percentage.toFixed(0)}% supply gap
                    </Text>
                    <View style={styles.alertMetrics}>
                      <Text style={styles.alertMetric}>
                        Requests: {item.demand_requests}
                      </Text>
                      <Text style={styles.alertMetric}>
                        Drivers: {item.available_drivers}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={[
                      styles.severityBadge,
                      {
                        backgroundColor:
                          item.severity === 'critical'
                            ? COLORS.danger
                            : item.severity === 'high'
                            ? COLORS.warning
                            : COLORS.primary,
                      },
                    ]}
                  >
                    <Text style={styles.severityText}>{item.severity.toUpperCase()}</Text>
                  </View>
                </View>
              )}
              scrollEnabled={false}
              ListEmptyComponent={
                <Text style={styles.emptyText}>No critical alerts at this time</Text>
              }
            />
          </View>
        </>
      )}
    </ScrollView>
  );

  // ============================================================================
  // RECOMMENDATIONS TAB
  // ============================================================================
  const RecommendationsTab = () => (
    <ScrollView
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {recommendationsData && (
        <>
          <View style={[styles.card, SHADOWS.medium]}>
            <View style={styles.cardHeader}>
              <MaterialCommunityIcons name="lightbulb-on" size={24} color={COLORS.secondary} />
              <Text style={styles.cardTitle}>AI Recommendations ({recommendationsData.recommendations.length})</Text>
            </View>

            <View style={styles.recSummary}>
              <View style={styles.recSumItem}>
                <Text style={styles.recSumLabel}>Avg ROI</Text>
                <Text style={styles.recSumValue}>{recommendationsData.avg_roi.toFixed(0)}%</Text>
              </View>
              <View style={styles.recSumDivider} />
              <View style={styles.recSumItem}>
                <Text style={styles.recSumLabel}>Recommendations</Text>
                <Text style={styles.recSumValue}>{recommendationsData.recommendations.length}</Text>
              </View>
            </View>
          </View>

          {/* Recommendations List */}
          <FlatList
            data={recommendationsData.recommendations}
            keyExtractor={(item) => item.recommendation_id}
            renderItem={({ item }) => (
              <View style={[styles.card, SHADOWS.medium, { marginHorizontal: 12, marginBottom: 12 }]}>
                <View style={styles.recHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recZone}>{item.zone_id}</Text>
                    <Text style={styles.recReason}>{item.recommendation_reason}</Text>
                  </View>
                  <View style={[styles.roiBadge, { backgroundColor: COLORS.success + '20' }]}>
                    <Text style={[styles.roiValue, { color: COLORS.success }]}>
                      {item.roi_percentage.toFixed(0)}%
                    </Text>
                  </View>
                </View>

                <View style={styles.recDetails}>
                  <RecDetail
                    label="Multiplier"
                    value={`×${item.recommended_multiplier.toFixed(2)}`}
                    icon="percent"
                  />
                  <RecDetail
                    label="Est. Drivers"
                    value={item.estimated_driver_response}
                    icon="car"
                  />
                  <RecDetail
                    label="Revenue Impact"
                    value={`₹${(item.expected_revenue_impact / 1000).toFixed(0)}k`}
                    icon="trending-up"
                  />
                </View>

                <TouchableOpacity style={styles.recButton}>
                  <MaterialCommunityIcons name="check" size={18} color={COLORS.white} />
                  <Text style={styles.recButtonText}>Implement</Text>
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

  const MetricBox = ({ label, value, icon }) => (
    <View style={[styles.metricBox, SHADOWS.small]}>
      <MaterialCommunityIcons name={icon} size={24} color={COLORS.primary} />
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );

  const TrendMetricRow = ({ icon, label, value, unit }) => (
    <View style={styles.trendRow}>
      <MaterialCommunityIcons name={icon} size={20} color={COLORS.primary} />
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.trendLabel}>{label}</Text>
      </View>
      <Text style={styles.trendValue}>
        {value} {unit}
      </Text>
    </View>
  );

  const StatCard = ({ value, label, icon, color, unit = '' }) => (
    <View style={[styles.statCard, SHADOWS.small, { borderTopColor: color, borderTopWidth: 3 }]}>
      <MaterialCommunityIcons name={icon} size={24} color={color} />
      <Text style={styles.statValue}>
        {value}
        {unit}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  const RecDetail = ({ label, value, icon }) => (
    <View style={styles.recDetail}>
      <MaterialCommunityIcons name={icon} size={16} color={COLORS.text} />
      <Text style={styles.recDetailLabel}>{label}:</Text>
      <Text style={styles.recDetailValue}>{value}</Text>
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

  if (loading && !heatmapData) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={{ marginTop: 12 }}>Loading heatmaps...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, SHADOWS.medium]}>
        <Text style={styles.headerTitle}>Driver Heatmaps</Text>
        <Text style={styles.headerSubtitle}>Real-time Analytics & Forecasting</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TabButton label="Live Map" tab="heatmap" icon="map" />
        <TabButton label="Forecast" tab="forecast" icon="weather-cloudy" />
        <TabButton label="Trends" tab="trends" icon="chart-line" />
        <TabButton label="Alerts" tab="alerts" icon="alert-circle" />
        <TabButton label="AI Tips" tab="recommendations" icon="lightbulb-on" />
      </View>

      {/* Tab Content */}
      <View style={styles.content}>
        {activeTab === 'heatmap' && <HeatmapTab />}
        {activeTab === 'forecast' && <ForecastTab />}
        {activeTab === 'trends' && <TrendsTab />}
        {activeTab === 'alerts' && <AlertsTab />}
        {activeTab === 'recommendations' && <RecommendationsTab />}
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
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  metricBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    backgroundColor: COLORS.light,
    borderRadius: 8,
    marginHorizontal: 6,
  },
  metricLabel: {
    fontSize: 12,
    color: COLORS.text,
    marginTop: 8,
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 4,
  },
  gridCell: {
    paddingVertical: 10,
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
  },
  gridCellContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  gridCellLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: COLORS.text,
  },
  gridCellValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  demandBar: {
    height: 6,
    borderRadius: 3,
  },
  forecastItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
  },
  forecastTime: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.primary + '15',
    borderRadius: 6,
    minWidth: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  forecastPeriod: {
    fontWeight: '600',
    color: COLORS.primary,
  },
  forecastMetrics: {
    flex: 1,
    marginLeft: 12,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  label: {
    fontSize: 12,
    color: COLORS.text,
  },
  value: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
  },
  peakItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: COLORS.light,
  },
  peakTime: {
    fontWeight: '600',
    color: COLORS.primary,
  },
  peakDemand: {
    fontSize: 12,
    color: COLORS.text,
    marginTop: 2,
  },
  peakMultiplier: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  trendMetrics: {
    marginBottom: 8,
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomColor: COLORS.border,
    borderBottomWidth: 1,
  },
  trendLabel: {
    fontSize: 13,
    color: COLORS.text,
  },
  trendValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  timePattern: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timeBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    marginHorizontal: 6,
    backgroundColor: COLORS.light,
    borderRadius: 8,
  },
  timeLabel: {
    fontSize: 12,
    color: COLORS.text,
    marginTop: 8,
  },
  timeValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginHorizontal: 6,
    backgroundColor: COLORS.light,
    borderRadius: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 8,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.text,
    marginTop: 4,
  },
  alertItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderLeftWidth: 4,
    backgroundColor: COLORS.light,
    borderRadius: 6,
    marginBottom: 8,
  },
  alertZone: {
    fontWeight: '600',
    color: COLORS.primary,
  },
  alertGap: {
    fontSize: 13,
    color: COLORS.danger,
    marginTop: 4,
  },
  alertMetrics: {
    flexDirection: 'row',
    marginTop: 6,
  },
  alertMetric: {
    fontSize: 11,
    color: COLORS.text,
    marginRight: 12,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  severityText: {
    fontSize: 10,
    fontWeight: '700',
    color: COLORS.white,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.text,
    paddingVertical: 20,
  },
  recSummary: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    backgroundColor: COLORS.light,
    borderRadius: 8,
  },
  recSumItem: {
    alignItems: 'center',
  },
  recSumLabel: {
    fontSize: 12,
    color: COLORS.text,
  },
  recSumValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.secondary,
    marginTop: 4,
  },
  recSumDivider: {
    width: 1,
    backgroundColor: COLORS.border,
  },
  recHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  recZone: {
    fontWeight: '600',
    color: COLORS.primary,
  },
  recReason: {
    fontSize: 12,
    color: COLORS.text,
    marginTop: 4,
  },
  roiBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  roiValue: {
    fontWeight: '700',
    fontSize: 12,
  },
  recDetails: {
    marginBottom: 12,
  },
  recDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  recDetailLabel: {
    fontSize: 12,
    color: COLORS.text,
    marginLeft: 8,
  },
  recDetailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
    marginLeft: 'auto',
  },
  recButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: COLORS.success,
    borderRadius: 6,
  },
  recButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.white,
    marginLeft: 6,
  },
});

export default DriverHeatmapsScreen;
