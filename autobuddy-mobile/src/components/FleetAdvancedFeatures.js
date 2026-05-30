/**
 * Fleet Owner Portal - Advanced UI Components (Uber/Ola Level)
 * 
 * Components:
 * 1. FleetDashboardAdvanced - KPIs, health score, quick stats
 * 2. FleetWalletPanel - Earnings, settlements, withdrawals
 * 3. DriverAssignmentPanel - Assign/reassign/replace drivers
 * 4. AttendancePanel - Daily attendance tracking
 * 5. PerformanceRankings - Driver rankings and metrics
 * 6. IncentiveManagementPanel - Create and manage incentives
 * 7. LiveFleetMapPanel - Real-time vehicle locations
 * 8. DemandHeatmapPanel - Zone-based demand visualization
 * 9. RevenueForecasting - Revenue predictions
 * 10. AIRecommendationsPanel - AI optimization suggestions
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';
import { formatToIST } from '../utils/time';

// ============================================================================
// 1. FLEET DASHBOARD ADVANCED
// ============================================================================

export const FleetDashboardAdvanced = ({ token, fleetId, onTabChange }) => {
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchKPIs = useCallback(async () => {
    try {
      setError('');
      const payload = await apiRequest(`/v1/fleet/dashboard/kpis/${fleetId}`, { token });
      setKpis(payload?.data || payload);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [fleetId, token]);

  useEffect(() => {
    const initialTimer = setTimeout(fetchKPIs, 0);
    const interval = setInterval(fetchKPIs, 30000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [fetchKPIs]);

  const getHealthColor = (score) => {
    if (score >= 90) return '#10B981';
    if (score >= 75) return '#F59E0B';
    if (score >= 60) return '#F97316';
    return '#EF4444';
  };

  const getHealthStatus = (score) => {
    if (score >= 90) return 'Excellent';
    if (score >= 75) return 'Good';
    if (score >= 60) return 'Fair';
    return 'Poor';
  };

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} />;

  return (
    <ScrollView style={styles.container}>
      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Health Score */}
      {kpis && (
        <>
          <View style={[styles.healthCard, { borderColor: getHealthColor(kpis.health_score) }]}>
            <Text style={styles.healthLabel}>Fleet Health Score</Text>
            <View style={styles.healthScoreContainer}>
              <View 
                style={[
                  styles.healthCircle, 
                  { borderColor: getHealthColor(kpis.health_score) }
                ]}
              >
                <Text style={styles.healthScore}>{kpis.health_score.toFixed(1)}</Text>
              </View>
              <View style={styles.healthDetails}>
                <Text style={styles.healthStatus}>
                  Status: {getHealthStatus(kpis.health_score)}
                </Text>
                <Text style={styles.healthTrend}>↑ Improving</Text>
              </View>
            </View>
          </View>

          {/* Quick Stats Grid */}
          <View style={styles.statsGrid}>
            <StatBox
              label="Active Vehicles"
              value={kpis.active_vehicles}
              total={kpis.total_vehicles}
              icon="🚗"
            />
            <StatBox
              label="Active Drivers"
              value={kpis.active_drivers}
              total={kpis.total_drivers}
              icon="👤"
            />
            <StatBox
              label="Today's Earnings"
              value={`₹${(kpis.total_earnings_today / 1000).toFixed(1)}K`}
              icon="💰"
            />
            <StatBox
              label="Avg Rating"
              value={kpis.avg_driver_rating.toFixed(1)}
              total="5.0"
              icon="⭐"
            />
          </View>

          {/* Performance Metrics */}
          <View style={styles.metricsCard}>
            <Text style={styles.cardTitle}>Performance Metrics</Text>
            <MetricRow
              label="Acceptance Rate"
              value={`${kpis.avg_acceptance_rate.toFixed(1)}%`}
              target="90%"
              color="#10B981"
            />
            <MetricRow
              label="Completion Rate"
              value={`${kpis.avg_completion_rate.toFixed(1)}%`}
              target="95%"
              color="#3B82F6"
            />
            <MetricRow
              label="Cancellation Rate"
              value={`${kpis.avg_cancellation_rate.toFixed(1)}%`}
              target="<3%"
              color="#EF4444"
            />
            <MetricRow
              label="Vehicle Utilization"
              value={`${kpis.vehicle_utilization.toFixed(1)}%`}
              target="80%"
              color="#8B5CF6"
            />
          </View>

          {/* Red Flags */}
          {kpis.red_flags && kpis.red_flags.length > 0 && (
            <View style={styles.alertsCard}>
              <Text style={styles.cardTitle}>⚠️ Attention Required</Text>
              {kpis.red_flags.map((flag, idx) => (
                <View key={idx} style={styles.alertItem}>
                  <Text style={styles.alertText}>• {flag}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <ActionButton
              label="View Analytics"
              icon="📊"
              onPress={() => onTabChange('analytics')}
              color="#3B82F6"
            />
            <ActionButton
              label="View Drivers"
              icon="👥"
              onPress={() => onTabChange('drivers')}
              color="#10B981"
            />
            <ActionButton
              label="Manage Incentives"
              icon="🎁"
              onPress={() => onTabChange('incentives')}
              color="#F59E0B"
            />
          </View>
        </>
      )}
    </ScrollView>
  );
};

// ============================================================================
// 2. FLEET WALLET PANEL
// ============================================================================

export const FleetWalletPanel = ({ token, fleetId }) => {
  const [wallet, setWallet] = useState(null);
  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');

  const fetchWalletData = useCallback(async () => {
    try {
      const [walletPayload, settlementsPayload] = await Promise.all([
        apiRequest(`/v1/fleet/wallet/${fleetId}`, { token }),
        apiRequest(`/v1/fleet/settlements/${fleetId}`, { token }),
      ]);

      setWallet(walletPayload?.data || walletPayload);
      setSettlements(settlementsPayload?.settlements || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [fleetId, token]);

  useEffect(() => {
    const timer = setTimeout(fetchWalletData, 0);
    return () => clearTimeout(timer);
  }, [fetchWalletData]);

  const handleWithdraw = async () => {
    if (!withdrawAmount) {
      Alert.alert('Error', 'Please enter amount');
      return;
    }

    try {
      await apiRequest(`/v1/fleet/withdraw/${fleetId}`, {
        method: 'POST',
        token,
        query: {
          amount: parseFloat(withdrawAmount),
          method: 'bank_transfer',
        },
      });
      Alert.alert('Success', 'Withdrawal request submitted');
      setShowWithdraw(false);
      setWithdrawAmount('');
      fetchWalletData();
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} />;

  return (
    <ScrollView style={styles.container}>
      {wallet && (
        <>
          {/* Balance Cards */}
          <View style={styles.balanceCardsContainer}>
            <BalanceCard
              label="Total Earnings"
              amount={wallet.total_earnings}
              color="#3B82F6"
            />
            <BalanceCard
              label="Available Balance"
              amount={wallet.available_balance}
              color="#10B981"
            />
            <BalanceCard
              label="Pending Settlement"
              amount={wallet.pending_amount}
              color="#F59E0B"
            />
          </View>

          {/* Withdraw Button */}
          <TouchableOpacity
            style={styles.withdrawButton}
            onPress={() => setShowWithdraw(true)}
          >
            <Text style={styles.withdrawButtonText}>Withdraw Money</Text>
          </TouchableOpacity>

          {/* Settlement History */}
          <View style={styles.historyCard}>
            <Text style={styles.cardTitle}>Recent Settlements</Text>
            <FlatList
              data={settlements.slice(0, 5)}
              keyExtractor={(item) => item.settlement_id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.settlementItem}>
                  <View style={styles.settlementInfo}>
                    <Text style={styles.settlementPeriod}>
                       {formatToIST(item.settlement_period_start, { dateStyle: 'short' })} - {formatToIST(item.settlement_period_end, { dateStyle: 'short' })}
                    </Text>
                    <Text style={styles.settlementRides}>{item.total_rides} rides</Text>
                  </View>
                  <Text style={styles.settlementAmount}>₹{item.net_earnings.toLocaleString()}</Text>
                </View>
              )}
            />
          </View>

          {/* Withdraw Modal */}
          <Modal
            visible={showWithdraw}
            transparent
            animationType="slide"
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Withdraw Money</Text>
                <Text style={styles.availableText}>
                  Available: ₹{wallet.available_balance.toLocaleString()}
                </Text>
                <TextInput
                  style={styles.withdrawInput}
                  placeholder="Enter amount"
                  keyboardType="numeric"
                  value={withdrawAmount}
                  onChangeText={setWithdrawAmount}
                />
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.cancelButton]}
                    onPress={() => setShowWithdraw(false)}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.confirmButton]}
                    onPress={handleWithdraw}
                  >
                    <Text style={styles.confirmButtonText}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </>
      )}
    </ScrollView>
  );
};

// ============================================================================
// 3. DRIVER ASSIGNMENT PANEL
// ============================================================================

export const DriverAssignmentPanel = ({ token, fleetId }) => {
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAssignmentResources = useCallback(async () => {
    try {
      const payload = await apiRequest(`/v1/fleet/driver-assignment/resources/${fleetId}`, { token });
      setDrivers(Array.isArray(payload?.drivers) ? payload.drivers : []);
      setVehicles(Array.isArray(payload?.vehicles) ? payload.vehicles : []);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }, [fleetId, token]);

  useEffect(() => {
    const timer = setTimeout(fetchAssignmentResources, 0);
    return () => clearTimeout(timer);
  }, [fetchAssignmentResources]);

  const handleAssign = async () => {
    if (!selectedDriver || !selectedVehicle) {
      Alert.alert('Error', 'Select both driver and vehicle');
      return;
    }

    try {
      await apiRequest('/v1/fleet/driver-assignment/assign', {
        method: 'POST',
        token,
        query: {
          fleet_id: fleetId,
          driver_id: selectedDriver.id,
          vehicle_id: selectedVehicle.id,
          shift: 'full_day',
        },
      });
      Alert.alert('Success', 'Driver assigned to vehicle');
      setShowAssignModal(false);
      setSelectedDriver(null);
      setSelectedVehicle(null);
      fetchAssignmentResources();
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} />;

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity
        style={styles.assignButton}
        onPress={() => setShowAssignModal(true)}
      >
        <Text style={styles.assignButtonText}>+ Assign Driver</Text>
      </TouchableOpacity>

      <View style={styles.statsCard}>
        <Text style={styles.statsLabel}>Available Drivers: {drivers.filter(d => d.status === 'available').length}</Text>
        <Text style={styles.statsLabel}>Unassigned Vehicles: {vehicles.filter(v => v.status === 'unassigned').length}</Text>
      </View>

      {/* Assignments List */}
      <Text style={styles.sectionTitle}>Current Assignments</Text>
      <FlatList
        data={drivers.filter(d => d.status === 'assigned')}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={styles.assignmentCard}>
            <View style={styles.assignmentHeader}>
              <Text style={styles.driverName}>{item.name}</Text>
              <Text style={styles.rating}>⭐ {item.rating}</Text>
            </View>
            <Text style={styles.vehicleInfo}>Vehicle: {item.currentVehicle}</Text>
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.smallButton}>
                <Text style={styles.smallButtonText}>Reassign</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.smallButton, styles.dangerButton]}>
                <Text style={styles.smallButtonText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      {/* Assignment Modal */}
      <Modal visible={showAssignModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Assign Driver to Vehicle</Text>
            
            <Text style={styles.selectLabel}>Select Driver</Text>
            <ScrollView style={styles.selectList}>
              {drivers.filter(d => d.status === 'available').map(driver => (
                <TouchableOpacity
                  key={driver.id}
                  style={[
                    styles.selectItem,
                    selectedDriver?.id === driver.id && styles.selectedItem,
                  ]}
                  onPress={() => setSelectedDriver(driver)}
                >
                  <Text style={styles.selectItemText}>{driver.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.selectLabel}>Select Vehicle</Text>
            <ScrollView style={styles.selectList}>
              {vehicles.filter(v => v.status === 'unassigned').map(vehicle => (
                <TouchableOpacity
                  key={vehicle.id}
                  style={[
                    styles.selectItem,
                    selectedVehicle?.id === vehicle.id && styles.selectedItem,
                  ]}
                  onPress={() => setSelectedVehicle(vehicle)}
                >
                  <Text style={styles.selectItemText}>{vehicle.plate}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowAssignModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleAssign}
              >
                <Text style={styles.confirmButtonText}>Assign</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

// ============================================================================
// 4. PERFORMANCE RANKINGS
// ============================================================================

export const PerformanceRankingsPanel = ({ token, fleetId }) => {
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchRankings = useCallback(async () => {
    try {
      const payload = await apiRequest(`/v1/fleet/performance/rankings/${fleetId}`, { token });
      setRankings(Array.isArray(payload?.rankings) ? payload.rankings : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [fleetId, token]);

  useEffect(() => {
    const timer = setTimeout(fetchRankings, 0);
    return () => clearTimeout(timer);
  }, [fetchRankings]);

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} />;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>Driver Performance Rankings</Text>
      <FlatList
        data={rankings.slice(0, 15)}
        keyExtractor={(item) => item.driver_id}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={styles.rankingCard}>
            <View style={styles.rankBadge}>
              <Text style={styles.rankNumber}>{item.rank}</Text>
            </View>
            <View style={styles.rankingInfo}>
              <Text style={styles.driverName}>{item.driver_name}</Text>
              <View style={styles.metricsRow}>
                <Text style={styles.metricBadge}>⭐ {item.rating.toFixed(1)}</Text>
                <Text style={styles.metricBadge}>✓ {item.acceptance_rate.toFixed(0)}%</Text>
                <Text style={styles.metricBadge}>💰 {item.revenue_score.toFixed(0)}</Text>
              </View>
            </View>
            <Text style={[styles.badge, { backgroundColor: item.performance_badge === 'gold' ? '#F59E0B' : item.performance_badge === 'silver' ? '#9CA3AF' : '#CD7F32' }]}>
              {item.performance_badge.toUpperCase()}
            </Text>
          </View>
        )}
      />
    </ScrollView>
  );
};

// ============================================================================
// 5. LIVE FLEET MAP PANEL
// ============================================================================

export const LiveFleetMapPanel = ({ token, fleetId }) => {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLiveMap = useCallback(async () => {
    try {
      const payload = await apiRequest(`/v1/fleet/live-map/${fleetId}`, { token });
      setVehicles(Array.isArray(payload?.vehicles) ? payload.vehicles : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [fleetId, token]);

  useEffect(() => {
    const initialTimer = setTimeout(fetchLiveMap, 0);
    const interval = setInterval(fetchLiveMap, 10000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [fetchLiveMap]);

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} />;

  const summary = {
    active: vehicles.filter(v => v.status === 'active').length,
    idle: vehicles.filter(v => v.status === 'idle').length,
    offline: vehicles.filter(v => v.status === 'offline').length,
    onRide: vehicles.filter(v => v.is_on_ride).length,
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.mapStatsContainer}>
        <MapStat label="Active" value={summary.active} color="#10B981" />
        <MapStat label="Idle" value={summary.idle} color="#F59E0B" />
        <MapStat label="On Ride" value={summary.onRide} color="#3B82F6" />
        <MapStat label="Offline" value={summary.offline} color="#6B7280" />
      </View>

      <Text style={styles.sectionTitle}>Vehicle Status</Text>
      <FlatList
        data={vehicles.slice(0, 20)}
        keyExtractor={(item) => item.vehicle_id}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={styles.vehicleStatusCard}>
            <View style={styles.statusIndicator}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      item.status === 'active' ? '#10B981' :
                      item.status === 'idle' ? '#F59E0B' : '#6B7280',
                  },
                ]}
              />
            </View>
            <View style={styles.vehicleInfo}>
              <Text style={styles.vehicleId}>{item.vehicle_id}</Text>
              <Text style={styles.driverInfo}>Driver: {item.driver_id}</Text>
            </View>
            <View style={styles.speedInfo}>
              <Text style={styles.speed}>{item.speed.toFixed(0)} km/h</Text>
              <Text style={styles.status}>{item.status}</Text>
            </View>
          </View>
        )}
      />
    </ScrollView>
  );
};

// ============================================================================
// 6. INCENTIVE MANAGEMENT PANEL
// ============================================================================

export const IncentiveManagementPanel = ({ token, fleetId }) => {
  const [incentives, setIncentives] = useState([]);
  const [program, setProgram] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [incentiveForm, setIncentiveForm] = useState(() => {
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return {
      driverId: '',
      incentiveType: 'weekly_bonus',
      amount: '',
      condition: '',
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  });

  const fetchIncentives = useCallback(async () => {
    try {
      const [incentivesPayload, programPayload] = await Promise.all([
        apiRequest(`/v1/fleet/incentives/${fleetId}`, { token }),
        apiRequest(`/v1/fleet/incentives/program/${fleetId}`, { token }),
      ]);

      setIncentives(Array.isArray(incentivesPayload?.incentives) ? incentivesPayload.incentives : []);
      setProgram(programPayload?.program || null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [fleetId, token]);

  useEffect(() => {
    const timer = setTimeout(fetchIncentives, 0);
    return () => clearTimeout(timer);
  }, [fetchIncentives]);

  const updateIncentiveForm = (field, value) => {
    setIncentiveForm((previous) => ({ ...previous, [field]: value }));
  };

  const handleCreateIncentive = async () => {
    const amount = parseFloat(incentiveForm.amount);
    if (!incentiveForm.driverId.trim() || !amount || !incentiveForm.condition.trim()) {
      Alert.alert('Error', 'Enter driver, amount, and condition');
      return;
    }

    try {
      await apiRequest('/v1/fleet/incentives/create', {
        method: 'POST',
        token,
        query: {
          fleet_id: fleetId,
          driver_id: incentiveForm.driverId.trim(),
          incentive_type: incentiveForm.incentiveType.trim() || 'weekly_bonus',
          amount,
          condition: incentiveForm.condition.trim(),
          start_date: incentiveForm.startDate,
          end_date: incentiveForm.endDate,
        },
      });
      Alert.alert('Success', 'Incentive created');
      setShowCreate(false);
      setIncentiveForm((previous) => ({
        ...previous,
        driverId: '',
        amount: '',
        condition: '',
      }));
      fetchIncentives();
    } catch (err) {
      Alert.alert('Error', err.message);
    }
  };

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} />;

  return (
    <ScrollView style={styles.container}>
      {program && (
        <View style={styles.programCard}>
          <Text style={styles.cardTitle}>{program.program_name}</Text>
          <Text style={styles.programDesc}>{program.description}</Text>
          <View style={styles.budgetBar}>
            <View
              style={[
                styles.budgetFilled,
                { width: `${(program.allocated_so_far / program.total_budget) * 100}%` },
              ]}
            />
          </View>
          <View style={styles.budgetInfo}>
            <Text>Allocated: ₹{program.allocated_so_far.toLocaleString()}</Text>
            <Text>Remaining: ₹{program.remaining_budget.toLocaleString()}</Text>
          </View>
        </View>
      )}

      <TouchableOpacity
        style={styles.createButton}
        onPress={() => setShowCreate(true)}
      >
        <Text style={styles.createButtonText}>+ Create Incentive</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Active Incentives ({incentives.length})</Text>
      <FlatList
        data={incentives.slice(0, 10)}
        keyExtractor={(item) => item.incentive_id}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={styles.incentiveCard}>
            <View style={styles.incentiveHeader}>
              <Text style={styles.incentiveType}>{item.incentive_type.replace(/_/g, ' ').toUpperCase()}</Text>
              <Text style={styles.incentiveAmount}>₹{item.amount}</Text>
            </View>
            <Text style={styles.incentiveCondition}>{item.condition}</Text>
            <View style={styles.progressContainer}>
              <View
                style={[
                  styles.progressBar,
                  { width: `${item.progress}%` },
                ]}
              />
            </View>
            <Text style={styles.progressText}>{item.progress.toFixed(0)}% complete</Text>
          </View>
        )}
      />

      <Modal visible={showCreate} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Incentive</Text>
            <TextInput
              style={styles.withdrawInput}
              placeholder="Driver ID"
              autoCapitalize="none"
              value={incentiveForm.driverId}
              onChangeText={(value) => updateIncentiveForm('driverId', value)}
            />
            <TextInput
              style={styles.withdrawInput}
              placeholder="Type"
              autoCapitalize="none"
              value={incentiveForm.incentiveType}
              onChangeText={(value) => updateIncentiveForm('incentiveType', value)}
            />
            <TextInput
              style={styles.withdrawInput}
              placeholder="Amount"
              keyboardType="numeric"
              value={incentiveForm.amount}
              onChangeText={(value) => updateIncentiveForm('amount', value)}
            />
            <TextInput
              style={styles.withdrawInput}
              placeholder="Condition"
              value={incentiveForm.condition}
              onChangeText={(value) => updateIncentiveForm('condition', value)}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setShowCreate(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handleCreateIncentive}
              >
                <Text style={styles.confirmButtonText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const StatBox = ({ label, value, total, icon }) => (
  <View style={styles.statBox}>
    <Text style={styles.statIcon}>{icon}</Text>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={styles.statValue}>{value}</Text>
    {total && <Text style={styles.statTotal}>of {total}</Text>}
  </View>
);

const MetricRow = ({ label, value, target, color }) => (
  <View style={styles.metricRow}>
    <Text style={styles.metricLabel}>{label}</Text>
    <View style={styles.metricValues}>
      <Text style={[styles.metricValue, { color }]}>{value}</Text>
      <Text style={styles.metricTarget}>Target: {target}</Text>
    </View>
  </View>
);

const BalanceCard = ({ label, amount, color }) => (
  <View style={[styles.balanceCard, { borderLeftColor: color }]}>
    <Text style={styles.balanceLabel}>{label}</Text>
    <Text style={styles.balanceAmount}>₹{amount.toLocaleString()}</Text>
  </View>
);

const ActionButton = ({ label, icon, onPress, color }) => (
  <TouchableOpacity style={styles.actionButton} onPress={onPress}>
    <Text style={styles.actionIcon}>{icon}</Text>
    <Text style={styles.actionLabel}>{label}</Text>
  </TouchableOpacity>
);

const MapStat = ({ label, value, color }) => (
  <View style={styles.mapStat}>
    <Text style={[styles.mapStatValue, { color }]}>{value}</Text>
    <Text style={styles.mapStatLabel}>{label}</Text>
  </View>
);

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 16,
  },
  
  // Fleet Dashboard Styles
  healthCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    ...SHADOWS.medium,
  },
  healthLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  healthScoreContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  healthCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  healthScore: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.primary,
  },
  healthDetails: {
    flex: 1,
  },
  healthStatus: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  healthTrend: {
    fontSize: 14,
    color: '#10B981',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statBox: {
    width: '48%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
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
    color: '#1F2937',
  },
  statTotal: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  metricsCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    ...SHADOWS.light,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  metricLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  metricValues: {
    alignItems: 'flex-end',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  metricTarget: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  alertsCard: {
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  alertItem: {
    marginBottom: 8,
  },
  alertText: {
    fontSize: 14,
    color: '#92400E',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginHorizontal: 4,
    ...SHADOWS.light,
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  actionLabel: {
    fontSize: 11,
    color: '#6B7280',
    textAlign: 'center',
  },
  
  // Wallet Styles
  balanceCardsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  balanceCard: {
    width: '31%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    borderLeftWidth: 4,
    marginBottom: 12,
    ...SHADOWS.light,
  },
  balanceLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  balanceAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  withdrawButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  withdrawButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  historyCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    ...SHADOWS.light,
  },
  settlementItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  settlementInfo: {
    flex: 1,
  },
  settlementPeriod: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 2,
  },
  settlementRides: {
    fontSize: 12,
    color: '#6B7280',
  },
  settlementAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#10B981',
  },
  
  // Assignment Styles
  assignButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  assignButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  statsCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    ...SHADOWS.light,
  },
  statsLabel: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
  },
  assignmentCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    ...SHADOWS.light,
  },
  assignmentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  driverName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  rating: {
    fontSize: 12,
    color: '#F59E0B',
  },
  vehicleInfo: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  smallButton: {
    flex: 1,
    backgroundColor: '#E5E7EB',
    borderRadius: 6,
    padding: 6,
    alignItems: 'center',
  },
  dangerButton: {
    backgroundColor: '#FEE2E2',
  },
  smallButtonText: {
    fontSize: 11,
    color: '#4B5563',
  },
  
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 12,
  },
  availableText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  withdrawInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    fontSize: 14,
  },
  selectLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
    marginTop: 12,
    marginBottom: 8,
  },
  selectList: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    maxHeight: 120,
    marginBottom: 12,
  },
  selectItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  selectedItem: {
    backgroundColor: '#E0F2FE',
  },
  selectItemText: {
    fontSize: 14,
    color: '#4B5563',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  modalButton: {
    flex: 1,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#E5E7EB',
  },
  cancelButtonText: {
    color: '#4B5563',
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: COLORS.primary,
  },
  confirmButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 13,
  },
  
  // Rankings Styles
  rankingCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
    ...SHADOWS.light,
  },
  rankBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankNumber: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 16,
  },
  rankingInfo: {
    flex: 1,
  },
  metricsRow: {
    flexDirection: 'row',
    marginTop: 4,
    flexWrap: 'wrap',
  },
  metricBadge: {
    fontSize: 11,
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 4,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    color: '#FFF',
    fontSize: 10,
    fontWeight: '600',
  },
  
  // Map Styles
  mapStatsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  mapStat: {
    width: '23%',
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    ...SHADOWS.light,
  },
  mapStatValue: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  mapStatLabel: {
    fontSize: 11,
    color: '#6B7280',
  },
  vehicleStatusCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    alignItems: 'center',
    ...SHADOWS.light,
  },
  statusIndicator: {
    marginRight: 12,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  speedInfo: {
    alignItems: 'flex-end',
  },
  speed: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
  },
  status: {
    fontSize: 10,
    color: '#6B7280',
  },
  
  // Incentive Styles
  programCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    ...SHADOWS.light,
  },
  programDesc: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 12,
  },
  budgetBar: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    marginBottom: 8,
    overflow: 'hidden',
  },
  budgetFilled: {
    height: '100%',
    backgroundColor: COLORS.primary,
  },
  budgetInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 12,
    color: '#6B7280',
  },
  createButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 16,
  },
  createButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  incentiveCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    ...SHADOWS.light,
  },
  incentiveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  incentiveType: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  incentiveAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  incentiveCondition: {
    fontSize: 12,
    color: '#4B5563',
    marginBottom: 8,
  },
  progressContainer: {
    height: 6,
    backgroundColor: '#E5E7EB',
    borderRadius: 3,
    marginBottom: 4,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.primary,
  },
  progressText: {
    fontSize: 11,
    color: '#6B7280',
  },
});

export default {
  FleetDashboardAdvanced,
  FleetWalletPanel,
  DriverAssignmentPanel,
  PerformanceRankingsPanel,
  LiveFleetMapPanel,
  IncentiveManagementPanel,
};
