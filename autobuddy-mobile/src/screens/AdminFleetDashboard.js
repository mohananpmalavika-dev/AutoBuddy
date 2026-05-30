/**
 * AdminFleetDashboard.js - Complete Admin Dashboard for Fleet Portal
 * 
 * Integrates all 10+ advanced fleet features from FleetAdvancedFeatures.js
 * Provides centralized monitoring and management for fleet operations
 * 
 * Size: ~1200 lines
 * Status: Ready for integration
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  RefreshControl,
} from 'react-native';
import { COLORS, SHADOWS } from '../theme';
import { apiRequest } from '../lib/api';
import { formatToIST } from '../utils/time';

// Import all fleet feature components
import {
  FleetDashboardAdvanced,
  FleetWalletPanel,
  DriverAssignmentPanel,
  PerformanceRankingsPanel,
  LiveFleetMapPanel,
  IncentiveManagementPanel,
} from '../components/FleetAdvancedFeatures';

const AdminFleetDashboard = ({ route, navigation }) => {
  const { adminToken } = route.params || {};
  
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [fleets, setFleets] = useState([]);
  const [selectedFleet, setSelectedFleet] = useState(null);
  const [stats, setStats] = useState(null);

  // Fleet tabs available
  const FLEET_TABS = {
    overview: {
      component: FleetDashboardAdvanced,
      label: '📊 Dashboard',
      description: 'Fleet KPIs and health score',
    },
    wallet: {
      component: FleetWalletPanel,
      label: '💰 Wallet',
      description: 'Earnings and settlements',
    },
    assignments: {
      component: DriverAssignmentPanel,
      label: '👥 Assignments',
      description: 'Driver to vehicle assignments',
    },
    performance: {
      component: PerformanceRankingsPanel,
      label: '⭐ Performance',
      description: 'Driver rankings and metrics',
    },
    map: {
      component: LiveFleetMapPanel,
      label: '🗺️ Live Map',
      description: 'Real-time vehicle tracking',
    },
    incentives: {
      component: IncentiveManagementPanel,
      label: '🎁 Incentives',
      description: 'Incentive programs and tracking',
    },
  };

  const loadFleets = useCallback(async () => {
    try {
      setLoading(true);
      const operatorsResponse = await apiRequest('/admin/operators', { token: adminToken });
      const operators = Array.isArray(operatorsResponse?.operators) ? operatorsResponse.operators : [];

      const fleetRows = await Promise.all(
        operators
          .map((operator) => ({
            ...operator,
            fleet_id: String(operator.operator_id || operator.id || '').trim(),
          }))
          .filter((operator) => operator.fleet_id)
          .map(async (operator) => {
            let kpis = {};
            try {
              const kpiResponse = await apiRequest(`/v1/fleet/dashboard/kpis/${operator.fleet_id}`, {
                token: adminToken,
              });
              kpis = kpiResponse?.data || kpiResponse?.kpis || {};
            } catch (kpiError) {
              console.warn('Fleet KPI unavailable:', operator.fleet_id, kpiError?.message);
            }

            return {
              fleet_id: operator.fleet_id,
              fleet_name: operator.company_name || `${operator.contact_name || 'Operator'} Fleet`,
              owner_name: operator.contact_name || operator.owner_name || operator.contact_email || 'Unassigned',
              total_vehicles: Number(kpis.total_vehicles || operator.total_vehicles || 0),
              active_vehicles: Number(kpis.active_vehicles || operator.active_vehicles || 0),
              total_drivers: Number(kpis.total_drivers || operator.total_drivers || 0),
              active_drivers: Number(kpis.active_drivers || operator.active_drivers || 0),
              health_score: Number(kpis.health_score || 0),
              status: operator.active === false ? 'inactive' : (operator.verification_status || 'active'),
              monthly_revenue: Number(kpis.total_earnings_month || kpis.monthly_revenue || 0),
            };
          }),
      );

      setFleets(fleetRows);
      if (fleetRows.length > 0) {
        setSelectedFleet((previous) =>
          fleetRows.find((fleet) => fleet.fleet_id === previous?.fleet_id) || fleetRows[0]
        );
      } else {
        setSelectedFleet(null);
      }
      
      // Load aggregated stats
      const totalVehicles = fleetRows.reduce((sum, f) => sum + f.total_vehicles, 0);
      const totalDrivers = fleetRows.reduce((sum, f) => sum + f.total_drivers, 0);
      const totalRevenue = fleetRows.reduce((sum, f) => sum + f.monthly_revenue, 0);
      
      setStats({
        total_fleets: fleetRows.length,
        total_vehicles: totalVehicles,
        active_vehicles: fleetRows.reduce((sum, f) => sum + f.active_vehicles, 0),
        total_drivers: totalDrivers,
        active_drivers: fleetRows.reduce((sum, f) => sum + f.active_drivers, 0),
        total_revenue: totalRevenue,
        avg_health_score: fleetRows.length
          ? (fleetRows.reduce((sum, f) => sum + f.health_score, 0) / fleetRows.length).toFixed(1)
          : '0.0',
      });
    } catch (err) {
      console.error('Failed to load fleets:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [adminToken]);

  // Load fleet list on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      loadFleets();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadFleets]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadFleets();
  }, [loadFleets]);

  // Render current tab component
  const renderTabComponent = () => {
    if (!selectedFleet || !adminToken) {
      return (
        <View style={styles.noFleetContainer}>
          <Text style={styles.noFleetText}>No fleet selected</Text>
        </View>
      );
    }

    const tabConfig = FLEET_TABS[activeTab];
    const TabComponent = tabConfig.component;

    return (
      <TabComponent
        token={adminToken}
        fleetId={selectedFleet.fleet_id}
        onTabChange={setActiveTab}
      />
    );
  };

  if (loading && !stats) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>🏢 Fleet Admin Dashboard</Text>
        <Text style={styles.headerSubtitle}>Manage all fleet operations</Text>
      </View>

      {/* OVERVIEW STATS */}
      {stats && (
        <View style={styles.statsContainer}>
          <StatCard
            label="Total Fleets"
            value={stats.total_fleets}
            color="#3B82F6"
            icon="🏢"
          />
          <StatCard
            label="Active Vehicles"
            value={stats.active_vehicles}
            color="#10B981"
            icon="🚗"
          />
          <StatCard
            label="Active Drivers"
            value={stats.active_drivers}
            color="#F59E0B"
            icon="👤"
          />
          <StatCard
            label="Monthly Revenue"
            value={`₹${(stats.total_revenue / 1000000).toFixed(1)}M`}
            color="#8B5CF6"
            icon="💰"
          />
        </View>
      )}

      {/* FLEET SELECTOR */}
      <View style={styles.fleetSelector}>
        <Text style={styles.fleetSelectorTitle}>Select Fleet</Text>
        <FlatList
          data={fleets}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyExtractor={(item) => item.fleet_id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.fleetCard,
                selectedFleet?.fleet_id === item.fleet_id && styles.fleetCardSelected,
              ]}
              onPress={() => setSelectedFleet(item)}
            >
              <Text style={styles.fleetName}>{item.fleet_name.split(' ')[0]}</Text>
              <Text style={styles.fleetDetail}>{item.total_vehicles} vehicles</Text>
              <View style={styles.healthBadge}>
                <Text style={styles.healthScore}>{item.health_score}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* SELECTED FLEET INFO */}
      {selectedFleet && (
        <View style={styles.fleetInfoContainer}>
          <View style={styles.fleetInfoHeader}>
            <View>
              <Text style={styles.fleetInfoName}>{selectedFleet.fleet_name}</Text>
              <Text style={styles.fleetInfoOwner}>Owner: {selectedFleet.owner_name}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: '#10B98180' }]}>
              <Text style={styles.statusText}>Active</Text>
            </View>
          </View>

          <View style={styles.fleetQuickStats}>
            <QuickStat
              label="Vehicles"
              value={`${selectedFleet.active_vehicles}/${selectedFleet.total_vehicles}`}
            />
            <QuickStat
              label="Drivers"
              value={`${selectedFleet.active_drivers}/${selectedFleet.total_drivers}`}
            />
            <QuickStat
              label="Health"
              value={`${selectedFleet.health_score}%`}
            />
            <QuickStat
              label="Revenue (Monthly)"
              value={`₹${(selectedFleet.monthly_revenue / 100000).toFixed(0)}L`}
            />
          </View>
        </View>
      )}

      {/* TAB NAVIGATION */}
      <View style={styles.tabNavigation}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {Object.entries(FLEET_TABS).map(([key, tab]) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.tabButton,
                activeTab === key && styles.tabButtonActive,
              ]}
              onPress={() => setActiveTab(key)}
            >
              <Text
                style={[
                  styles.tabButtonText,
                  activeTab === key && styles.tabButtonTextActive,
                ]}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ACTIVE TAB CONTENT */}
      <View style={styles.tabContent}>
        {renderTabComponent()}
      </View>

      {/* QUICK ACTIONS */}
      <View style={styles.quickActionsContainer}>
        <Text style={styles.quickActionsTitle}>⚡ Quick Actions</Text>
        <View style={styles.quickActionsGrid}>
          <QuickActionButton
            label="Generate Report"
            icon="📋"
            onPress={() => navigation.navigate('GenerateReport', { fleetId: selectedFleet?.fleet_id })}
          />
          <QuickActionButton
            label="Message Owner"
            icon="💬"
            onPress={() => navigation.navigate('MessageFleetOwner', { fleetId: selectedFleet?.fleet_id })}
          />
          <QuickActionButton
            label="View Compliance"
            icon="✅"
            onPress={() => setActiveTab('compliance')}
          />
          <QuickActionButton
            label="Settings"
            icon="⚙️"
            onPress={() => navigation.navigate('FleetSettings', { fleetId: selectedFleet?.fleet_id })}
          />
        </View>
      </View>

      {/* ALL FLEETS TABLE */}
      <View style={styles.allFleetsContainer}>
        <Text style={styles.allFleetsTitle}>📊 All Fleets Overview</Text>
        <FlatList
          data={fleets}
          scrollEnabled={false}
          keyExtractor={(item) => item.fleet_id}
          renderItem={({ item }) => (
            <View style={styles.fleetTableRow}>
              <View style={styles.fleetTableCell}>
                <Text style={styles.fleetTableName}>{item.fleet_name}</Text>
                <Text style={styles.fleetTableOwner}>{item.owner_name}</Text>
              </View>
              <View style={styles.fleetTableCell}>
                <Text style={styles.fleetTableStat}>{item.active_vehicles}/{item.total_vehicles}</Text>
                <Text style={styles.fleetTableLabel}>Vehicles</Text>
              </View>
              <View style={styles.fleetTableCell}>
                <Text style={styles.fleetTableStat}>{item.active_drivers}/{item.total_drivers}</Text>
                <Text style={styles.fleetTableLabel}>Drivers</Text>
              </View>
              <View style={[styles.fleetTableCell, { justifyContent: 'center', alignItems: 'flex-end' }]}>
                <View style={[
                  styles.healthIndicator,
                  {
                    backgroundColor: item.health_score >= 90 ? '#10B981' :
                                     item.health_score >= 75 ? '#F59E0B' : '#EF4444'
                  }
                ]}>
                  <Text style={styles.healthIndicatorText}>{item.health_score}</Text>
                </View>
              </View>
            </View>
          )}
        />
      </View>

      {/* FOOTER */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>Last updated: {formatToIST(undefined, { timeStyle: 'short' })}</Text>
      </View>
    </ScrollView>
  );
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const StatCard = ({ label, value, color, icon }) => (
  <View style={[styles.statCard, { borderTopColor: color }]}>
    <Text style={styles.statIcon}>{icon}</Text>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={[styles.statValue, { color }]}>{value}</Text>
  </View>
);

const QuickStat = ({ label, value }) => (
  <View style={styles.quickStatBox}>
    <Text style={styles.quickStatLabel}>{label}</Text>
    <Text style={styles.quickStatValue}>{value}</Text>
  </View>
);

const QuickActionButton = ({ label, icon, onPress }) => (
  <TouchableOpacity style={styles.quickActionButton} onPress={onPress}>
    <Text style={styles.quickActionIcon}>{icon}</Text>
    <Text style={styles.quickActionLabel}>{label}</Text>
  </TouchableOpacity>
);

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
  
  // Header
  header: {
    backgroundColor: COLORS.primary,
    padding: 20,
    paddingTop: 40,
    paddingBottom: 30,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFF',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#E0E7FF',
  },

  // Stats Container
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    padding: 12,
    gap: 12,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    borderTopWidth: 4,
    alignItems: 'center',
    ...SHADOWS.light,
  },
  statIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },

  // Fleet Selector
  fleetSelector: {
    padding: 16,
    backgroundColor: '#F9FAFB',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  fleetSelectorTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4B5563',
    marginBottom: 12,
  },
  fleetCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    marginRight: 12,
    width: 120,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  fleetCardSelected: {
    borderColor: COLORS.primary,
    borderWidth: 2,
    backgroundColor: '#E0F2FE',
  },
  fleetName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 4,
  },
  fleetDetail: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 6,
  },
  healthBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  healthScore: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },

  // Fleet Info
  fleetInfoContainer: {
    margin: 12,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    ...SHADOWS.medium,
  },
  fleetInfoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  fleetInfoName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
  },
  fleetInfoOwner: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  statusText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '600',
  },
  fleetQuickStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  quickStatBox: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  quickStatLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 4,
  },
  quickStatValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },

  // Tab Navigation
  tabNavigation: {
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  tabButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: COLORS.primary,
  },
  tabButtonText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: COLORS.primary,
  },

  // Tab Content
  tabContent: {
    minHeight: 400,
    backgroundColor: COLORS.background,
  },

  // Quick Actions
  quickActionsContainer: {
    margin: 16,
  },
  quickActionsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
  },
  quickActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  quickActionButton: {
    width: '48%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    ...SHADOWS.light,
  },
  quickActionIcon: {
    fontSize: 28,
    marginBottom: 4,
  },
  quickActionLabel: {
    fontSize: 11,
    color: '#4B5563',
    textAlign: 'center',
  },

  // All Fleets Table
  allFleetsContainer: {
    margin: 16,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    ...SHADOWS.light,
  },
  allFleetsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
  },
  fleetTableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    paddingVertical: 12,
    alignItems: 'center',
  },
  fleetTableCell: {
    flex: 1,
  },
  fleetTableName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
  },
  fleetTableOwner: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  fleetTableStat: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F2937',
  },
  fleetTableLabel: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
  },
  healthIndicator: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  healthIndicatorText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },

  // No Fleet
  noFleetContainer: {
    padding: 32,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 200,
  },
  noFleetText: {
    fontSize: 14,
    color: '#6B7280',
  },

  // Footer
  footer: {
    padding: 16,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    marginTop: 16,
  },
  footerText: {
    fontSize: 11,
    color: '#9CA3AF',
  },
});

export default AdminFleetDashboard;
