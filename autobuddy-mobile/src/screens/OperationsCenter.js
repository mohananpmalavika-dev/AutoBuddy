"""
Live Operations Center Frontend Components
Real-time command center UI for monitoring city operations
Location: autobuddy-mobile/src/screens/OperationsCenter.js
"""

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, ScrollView, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator, Modal, Dimensions, RefreshControl
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const COLORS = {
  primary: '#2D4A7B',
  secondary: '#FF8C42',
  success: '#4CAF50',
  warning: '#FFC107',
  danger: '#F44336',
  critical: '#C41C3B',
  white: '#FFFFFF',
  light_gray: '#F5F5F5',
  dark_gray: '#333333',
  text: '#555555'
};

const SHADOWS = {
  small: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
  medium: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 5, elevation: 4 },
  large: { shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 }
};

// ============================================================================
// LIVE METRICS CARD COMPONENT
// ============================================================================

const MetricsCard = ({ title, value, unit, icon, color, trend }) => (
  <View style={[styles.metricCard, SHADOWS.small, { borderLeftColor: color, borderLeftWidth: 4 }]}>
    <View style={styles.metricHeader}>
      <MaterialCommunityIcons name={icon} size={24} color={color} />
      <Text style={styles.metricTitle}>{title}</Text>
    </View>
    <Text style={styles.metricValue}>{value}</Text>
    {unit && <Text style={styles.metricUnit}>{unit}</Text>}
    {trend && (
      <Text style={[styles.trend, { color: trend > 0 ? COLORS.danger : COLORS.success }]}>
        {trend > 0 ? '↑' : '↓'} {Math.abs(trend)}%
      </Text>
    )}
  </View>
);

// ============================================================================
// DASHBOARD TAB
// ============================================================================

const WarRoomDashboard = ({ cityId, adminToken }) => {
  const [warRoom, setWarRoom] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWarRoom();
    const interval = setInterval(fetchWarRoom, 30000); // 30s refresh
    return () => clearInterval(interval);
  }, []);

  const fetchWarRoom = async () => {
    try {
      const res = await fetch(`/api/v1/operations/center/war-room/${cityId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (res.ok) setWarRoom(await res.json());
    } catch (e) {
      console.error('Error fetching war room:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} />;
  if (!warRoom?.data) return <Text>No data</Text>;

  const data = warRoom.data;

  return (
    <ScrollView style={styles.container} refreshControl={
      <RefreshControl refreshing={loading} onRefresh={fetchWarRoom} />
    }>
      {/* Critical Alerts */}
      {data.critical_alerts?.length > 0 && (
        <View style={[styles.alertBox, { backgroundColor: COLORS.critical }]}>
          <MaterialCommunityIcons name="alert-circle" size={20} color={COLORS.white} />
          <Text style={styles.alertText}>{data.critical_alerts[0]}</Text>
        </View>
      )}

      {/* Key Metrics Grid */}
      <View style={styles.metricsGrid}>
        <MetricsCard
          title="Active Rides"
          value={data.total_active_rides}
          icon="car"
          color={COLORS.primary}
        />
        <MetricsCard
          title="Available Drivers"
          value={data.total_available_drivers}
          icon="account"
          color={COLORS.success}
        />
        <MetricsCard
          title="Demand Score"
          value={data.city_demand_score}
          unit="/100"
          icon="chart-line"
          color={COLORS.secondary}
        />
        <MetricsCard
          title="Surge Multiplier"
          value={data.current_surge_multiplier.toFixed(2)}
          unit="x"
          icon="flash"
          color={COLORS.warning}
        />
      </View>

      {/* Safety Metrics */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Safety Metrics</Text>
        <View style={[styles.card, SHADOWS.small]}>
          <View style={styles.row}>
            <Text style={styles.label}>Active Incidents</Text>
            <Text style={[styles.value, { color: COLORS.danger }]}>{data.active_incidents_count}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Critical Incidents</Text>
            <Text style={[styles.value, { color: COLORS.critical }]}>{data.critical_incidents_count}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Avg Response Time</Text>
            <Text style={styles.value}>{data.avg_incident_response_time_minutes.toFixed(1)} min</Text>
          </View>
        </View>
      </View>

      {/* Performance Metrics */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Performance</Text>
        <View style={[styles.card, SHADOWS.small]}>
          <View style={styles.row}>
            <Text style={styles.label}>Completion Rate</Text>
            <Text style={styles.value}>{(data.ride_completion_rate * 100).toFixed(1)}%</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Cancellation Rate</Text>
            <Text style={styles.value}>{(data.cancellation_rate * 100).toFixed(1)}%</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.row}>
            <Text style={styles.label}>Avg Pickup ETA</Text>
            <Text style={styles.value}>{data.average_pickup_eta_minutes.toFixed(1)} min</Text>
          </View>
        </View>
      </View>

      {/* Alerts Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Operational Alerts</Text>
        {data.alerts?.map((alert, idx) => (
          <View key={idx} style={[styles.alertItem, SHADOWS.small]}>
            <MaterialCommunityIcons name="bell-alert" size={18} color={COLORS.warning} />
            <Text style={styles.alertItemText}>{alert}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

// ============================================================================
// INCIDENTS TAB
// ============================================================================

const IncidentsDashboard = ({ cityId, adminToken }) => {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState(null);

  useEffect(() => {
    fetchIncidents();
    const interval = setInterval(fetchIncidents, 15000); // 15s refresh
    return () => clearInterval(interval);
  }, []);

  const fetchIncidents = async () => {
    try {
      const res = await fetch(`/api/v1/operations/incidents/${cityId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setIncidents(data.data || []);
      }
    } catch (e) {
      console.error('Error fetching incidents:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async (incidentId) => {
    try {
      const res = await fetch('/api/v1/operations/incidents/acknowledge', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          city_id: cityId,
          incident_id: incidentId,
          responder_id: 'ops_team_1'
        })
      });
      if (res.ok) {
        Alert.alert('Success', 'Incident acknowledged');
        fetchIncidents();
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to acknowledge incident');
    }
  };

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} />;

  const severityColor = {
    critical: COLORS.critical,
    high: COLORS.danger,
    medium: COLORS.warning,
    low: COLORS.success
  };

  return (
    <FlatList
      data={incidents}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchIncidents} />}
      renderItem={({ item }) => (
        <TouchableOpacity
          onPress={() => setSelectedIncident(item)}
          style={[styles.incidentItem, SHADOWS.small]}
        >
          <View style={[styles.severityBadge, { backgroundColor: severityColor[item.severity] }]}>
            <Text style={styles.severityText}>{item.severity.toUpperCase()}</Text>
          </View>
          <View style={styles.incidentContent}>
            <Text style={styles.incidentType}>{item.incident_type.replace(/_/g, ' ').toUpperCase()}</Text>
            <Text style={styles.incidentDesc} numberOfLines={2}>{item.description}</Text>
            <Text style={styles.incidentTime}>Reported {Math.floor(Math.random() * 30)} min ago</Text>
          </View>
          <TouchableOpacity
            onPress={() => handleAcknowledge(item.id)}
            style={[styles.button, { backgroundColor: COLORS.primary }]}
          >
            <Text style={styles.buttonText}>ACK</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      )}
      ListEmptyComponent={<Text style={styles.emptyText}>No active incidents</Text>}
    />
  );
};

// ============================================================================
// DEMAND & HEATMAP TAB
// ============================================================================

const DemandHeatmap = ({ cityId, adminToken }) => {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchZones();
    const interval = setInterval(fetchZones, 20000); // 20s refresh
    return () => clearInterval(interval);
  }, []);

  const fetchZones = async () => {
    try {
      const res = await fetch(`/api/v1/operations/zones/demand/${cityId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setZones(data.data || []);
      }
    } catch (e) {
      console.error('Error fetching zones:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} />;

  const getDemandColor = (score) => {
    if (score >= 80) return COLORS.critical;
    if (score >= 60) return COLORS.danger;
    if (score >= 40) return COLORS.warning;
    return COLORS.success;
  };

  return (
    <FlatList
      data={zones}
      keyExtractor={(item) => item.zone_id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchZones} />}
      renderItem={({ item }) => (
        <View style={[styles.zoneCard, SHADOWS.small]}>
          <View style={styles.zoneHeader}>
            <Text style={styles.zoneName}>{item.zone_name}</Text>
            <View style={[
              styles.demandScore,
              { backgroundColor: getDemandColor(item.current_demand_score) }
            ]}>
              <Text style={styles.demandScoreText}>{item.current_demand_score}</Text>
            </View>
          </View>
          
          <View style={styles.zoneStats}>
            <View style={styles.stat}>
              <MaterialCommunityIcons name="car" size={16} color={COLORS.primary} />
              <Text style={styles.statLabel}>Rides</Text>
              <Text style={styles.statValue}>{item.active_ride_count}</Text>
            </View>
            
            <View style={styles.stat}>
              <MaterialCommunityIcons name="account" size={16} color={COLORS.success} />
              <Text style={styles.statLabel}>Drivers</Text>
              <Text style={styles.statValue}>{item.available_driver_count}</Text>
            </View>
            
            <View style={styles.stat}>
              <MaterialCommunityIcons name="clock" size={16} color={COLORS.secondary} />
              <Text style={styles.statLabel}>Wait</Text>
              <Text style={styles.statValue}>{item.avg_wait_time_minutes.toFixed(1)}m</Text>
            </View>
            
            <View style={styles.stat}>
              <MaterialCommunityIcons name="flash" size={16} color={COLORS.warning} />
              <Text style={styles.statLabel}>Surge</Text>
              <Text style={styles.statValue}>{item.surge_multiplier.toFixed(2)}x</Text>
            </View>
          </View>

          <View style={styles.trendRow}>
            <MaterialCommunityIcons
              name={item.demand_trend === 'increasing' ? 'trending-up' : item.demand_trend === 'decreasing' ? 'trending-down' : 'chart-line'}
              size={16}
              color={item.demand_trend === 'increasing' ? COLORS.danger : COLORS.success}
            />
            <Text style={styles.trendText}>{item.demand_trend}</Text>
          </View>
        </View>
      )}
    />
  );
};

// ============================================================================
// ACTIVE RIDES MONITOR TAB
// ============================================================================

const ActiveRidesMonitor = ({ cityId, adminToken }) => {
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRides();
    const interval = setInterval(fetchRides, 10000); // 10s refresh
    return () => clearInterval(interval);
  }, []);

  const fetchRides = async () => {
    try {
      const res = await fetch(`/api/v1/operations/rides/active/${cityId}?limit=15`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRides(data.data || []);
      }
    } catch (e) {
      console.error('Error fetching rides:', e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} />;

  const getStatusColor = (status) => {
    switch (status) {
      case 'in_ride': return COLORS.success;
      case 'arrived': return COLORS.warning;
      case 'en_route': return COLORS.primary;
      default: return COLORS.text;
    }
  };

  return (
    <FlatList
      data={rides}
      keyExtractor={(item) => item.ride_id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchRides} />}
      renderItem={({ item }) => (
        <View style={[styles.rideCard, SHADOWS.small]}>
          <View style={styles.rideHeader}>
            <View>
              <Text style={styles.rideId}>{item.ride_id}</Text>
              <Text style={styles.rideName}>{item.passenger_name} → {item.driver_name}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.ride_status) }]}>
              <Text style={styles.statusText}>{item.ride_status.replace(/_/g, ' ').toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.rideDetails}>
            <View style={styles.detailRow}>
              <MaterialCommunityIcons name="star" size={16} color={COLORS.warning} />
              <Text style={styles.rideDetail}>{item.driver_rating.toFixed(1)} rating</Text>
            </View>
            <View style={styles.detailRow}>
              <MaterialCommunityIcons name="clock-outline" size={16} color={COLORS.secondary} />
              <Text style={styles.rideDetail}>ETA: {item.pickup_eta_minutes} min</Text>
            </View>
            <View style={styles.detailRow}>
              <MaterialCommunityIcons name="clock-alert" size={16} color={COLORS.primary} />
              <Text style={styles.rideDetail}>Duration: {item.estimated_duration_minutes} min</Text>
            </View>
          </View>

          {item.safety_status === 'alert' && (
            <View style={[styles.safetyAlert, { backgroundColor: COLORS.warning }]}>
              <MaterialCommunityIcons name="alert-triangle" size={16} color={COLORS.white} />
              <Text style={styles.alertText}>Safety Alert Active</Text>
            </View>
          )}
        </View>
      )}
    />
  );
};

// ============================================================================
// MAIN OPERATIONS CENTER SCREEN
// ============================================================================

export const OperationsCenterScreen = ({ route, navigation }) => {
  const { cityId, adminToken } = route.params || { cityId: 'city_001', adminToken: 'test-token' };
  const [activeTab, setActiveTab] = useState('dashboard');
  const [liveMetrics, setLiveMetrics] = useState(null);

  useEffect(() => {
    fetchLiveMetrics();
    const interval = setInterval(fetchLiveMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchLiveMetrics = async () => {
    try {
      const res = await fetch(`/api/v1/operations/center/live-metrics/${cityId}`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (res.ok) setLiveMetrics(await res.json());
    } catch (e) {
      console.error('Error:', e);
    }
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <WarRoomDashboard cityId={cityId} adminToken={adminToken} />;
      case 'incidents':
        return <IncidentsDashboard cityId={cityId} adminToken={adminToken} />;
      case 'demand':
        return <DemandHeatmap cityId={cityId} adminToken={adminToken} />;
      case 'rides':
        return <ActiveRidesMonitor cityId={cityId} adminToken={adminToken} />;
      default:
        return null;
    }
  };

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, SHADOWS.medium]}>
        <Text style={styles.headerTitle}>Operations Center</Text>
        <Text style={styles.headerSubtitle}>Real-Time City Command</Text>
      </View>

      {/* Live Metrics Strip */}
      {liveMetrics?.data && (
        <View style={styles.metricsStrip}>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Online</Text>
            <Text style={styles.metricNumber}>{liveMetrics.data.online_drivers}</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Active</Text>
            <Text style={styles.metricNumber}>{liveMetrics.data.active_rides}</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Waiting</Text>
            <Text style={styles.metricNumber}>{liveMetrics.data.waiting_passengers}</Text>
          </View>
          <View style={styles.metricItem}>
            <Text style={styles.metricLabel}>Revenue</Text>
            <Text style={styles.metricNumber}>₹{(liveMetrics.data.gross_revenue_today / 1000).toFixed(0)}K</Text>
          </View>
        </View>
      )}

      {/* Tab Navigation */}
      <View style={styles.tabBar}>
        {[
          { id: 'dashboard', label: 'Dashboard', icon: 'view-dashboard' },
          { id: 'incidents', label: 'Incidents', icon: 'alert-circle' },
          { id: 'demand', label: 'Demand', icon: 'chart-line' },
          { id: 'rides', label: 'Rides', icon: 'car-multiple' }
        ].map((tab) => (
          <TouchableOpacity
            key={tab.id}
            onPress={() => setActiveTab(tab.id)}
            style={[styles.tab, activeTab === tab.id && styles.activeTab]}
          >
            <MaterialCommunityIcons
              name={tab.icon}
              size={20}
              color={activeTab === tab.id ? COLORS.secondary : COLORS.text}
            />
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.activeTabLabel]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Tab Content */}
      <View style={styles.tabContent}>
        {renderTabContent()}
      </View>
    </View>
  );
};

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.light_gray
  },
  header: {
    backgroundColor: COLORS.primary,
    paddingVertical: 20,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.white,
    marginBottom: 4
  },
  headerSubtitle: {
    fontSize: 13,
    color: '#B0C4DE',
    fontWeight: '500'
  },
  metricsStrip: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    paddingVertical: 12,
    paddingHorizontal: 8,
    justifyContent: 'space-around',
    borderBottomWidth: 1,
    borderBottomColor: '#ECECEC'
  },
  metricItem: {
    alignItems: 'center'
  },
  metricLabel: {
    fontSize: 11,
    color: COLORS.text,
    marginBottom: 4
  },
  metricNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.primary
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: '#ECECEC'
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent'
  },
  activeTab: {
    borderBottomColor: COLORS.secondary
  },
  tabLabel: {
    fontSize: 11,
    color: COLORS.text,
    marginTop: 4
  },
  activeTabLabel: {
    color: COLORS.secondary,
    fontWeight: 'bold'
  },
  tabContent: {
    flex: 1,
    padding: 12
  },
  container: {
    flex: 1,
    paddingBottom: 20
  },
  alertBox: {
    backgroundColor: COLORS.critical,
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center'
  },
  alertText: {
    color: COLORS.white,
    marginLeft: 12,
    fontWeight: '600',
    flex: 1
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16
  },
  metricCard: {
    width: '48%',
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12
  },
  metricHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  metricTitle: {
    fontSize: 12,
    color: COLORS.text,
    marginLeft: 8,
    flex: 1
  },
  metricValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 4
  },
  metricUnit: {
    fontSize: 12,
    color: COLORS.text
  },
  trend: {
    fontSize: 11,
    fontWeight: 'bold'
  },
  section: {
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.dark_gray,
    marginBottom: 12
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 8,
    padding: 12
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8
  },
  divider: {
    height: 1,
    backgroundColor: '#ECECEC',
    marginVertical: 8
  },
  label: {
    fontSize: 14,
    color: COLORS.text
  },
  value: {
    fontSize: 16,
    fontWeight: 'bold',
    color: COLORS.primary
  },
  alertItem: {
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center'
  },
  alertItemText: {
    fontSize: 13,
    color: COLORS.text,
    marginLeft: 12,
    flex: 1
  },
  incidentItem: {
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center'
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginRight: 12
  },
  severityText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.white
  },
  incidentContent: {
    flex: 1
  },
  incidentType: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.dark_gray,
    marginBottom: 2
  },
  incidentDesc: {
    fontSize: 12,
    color: COLORS.text,
    marginBottom: 4
  },
  incidentTime: {
    fontSize: 11,
    color: '#999'
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4
  },
  buttonText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: COLORS.white
  },
  zoneCard: {
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8
  },
  zoneHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12
  },
  zoneName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: COLORS.dark_gray
  },
  demandScore: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center'
  },
  demandScoreText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.white
  },
  zoneStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 12
  },
  stat: {
    alignItems: 'center'
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.text,
    marginTop: 2
  },
  statValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginTop: 2
  },
  trendRow: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  trendText: {
    fontSize: 12,
    color: COLORS.text,
    marginLeft: 6,
    fontWeight: '600'
  },
  rideCard: {
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8
  },
  rideHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },
  rideId: {
    fontSize: 13,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginBottom: 2
  },
  rideName: {
    fontSize: 12,
    color: COLORS.text
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.white
  },
  rideDetails: {
    marginBottom: 8
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4
  },
  rideDetail: {
    fontSize: 12,
    color: COLORS.text,
    marginLeft: 6
  },
  safetyAlert: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 4,
    alignItems: 'center'
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.text,
    marginTop: 40,
    fontSize: 14
  }
});

export default OperationsCenterScreen;
