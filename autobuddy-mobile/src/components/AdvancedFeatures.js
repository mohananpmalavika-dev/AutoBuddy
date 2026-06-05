/**
 * Advanced Features UI Components
 * Features 5-10: Dynamic Surge, AI Dispatch, Fraud Detection,
 * Driver Earnings, Women Safety, Fleet Owner Portal
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Switch, Modal, TextInput, FlatList, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const COLORS = {
  primary: '#2D4A7B',
  secondary: '#FF8C42',
  success: '#4CAF50',
  warning: '#FFC107',
  error: '#F44336',
  light: '#F5F5F5',
  dark: '#333',
};

// ============================================================================
// 5. DYNAMIC SURGE PRICING
// ============================================================================

export const DynamicSurgePricingPanel = ({ token, userLocation, onSurgeUpdate }) => {
  const [surgeData, setSurgeData] = useState({
    rainSurge: 1.0,
    eventSurge: 1.0,
    airportSurge: 1.0,
    totalSurge: 1.0,
  });
  const [loading, setLoading] = useState(false);

  const fetchSurgeData = useCallback(async () => {
    setLoading(true);
    try {
      // Check rain surge
      const rainRes = await fetch('/api/advanced/surge/rain-check', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify(userLocation)
      });
      const rainData = await rainRes.json();

      // Check airport surge
      const airportRes = await fetch('/api/advanced/surge/airport/HYD', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const airportData = await airportRes.json();

      const updated = {
        rainSurge: rainData.surge_multiplier,
        airportSurge: airportData.surge_multiplier,
        eventSurge: 1.0,
        totalSurge: Math.max(rainData.surge_multiplier, airportData.surge_multiplier)
      };
      setSurgeData(updated);
      onSurgeUpdate?.(updated);
    } catch (error) {
      console.error('Surge fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, [onSurgeUpdate, token, userLocation]);

  useEffect(() => {
    const timeout = setTimeout(fetchSurgeData, 0);
    const interval = setInterval(fetchSurgeData, 60000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [fetchSurgeData]);

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Dynamic Surge Pricing</Text>
        <MaterialIcons name="trending-up" size={24} color={COLORS.secondary} />
      </View>

      <View style={styles.surgeGrid}>
        <SurgeCard
          icon="cloud-rain"
          label="Rain Surge"
          multiplier={surgeData.rainSurge}
          active={surgeData.rainSurge > 1.0}
        />
        <SurgeCard
          icon="location-city"
          label="Event Surge"
          multiplier={surgeData.eventSurge}
          active={surgeData.eventSurge > 1.0}
        />
        <SurgeCard
          icon="local-airport"
          label="Airport Surge"
          multiplier={surgeData.airportSurge}
          active={surgeData.airportSurge > 1.0}
        />
      </View>

      <View style={styles.totalSurgeBox}>
        <Text style={styles.totalSurgeLabel}>Total Surge Multiplier</Text>
        <Text style={[styles.totalSurgeValue, { color: surgeData.totalSurge > 1.5 ? COLORS.error : COLORS.warning }]}>
          {surgeData.totalSurge.toFixed(2)}x
        </Text>
        <Text style={styles.surgeNote}>
          {surgeData.totalSurge === 1.0 ? 'No surge active' : `Fare will be ${((surgeData.totalSurge - 1) * 100).toFixed(0)}% higher`}
        </Text>
      </View>

      <TouchableOpacity style={styles.refreshButton} onPress={fetchSurgeData} disabled={loading}>
        {loading ? <ActivityIndicator color={COLORS.primary} /> : <MaterialIcons name="refresh" size={18} color={COLORS.primary} />}
        <Text style={styles.buttonText}>Refresh</Text>
      </TouchableOpacity>
    </View>
  );
};

const SurgeCard = ({ icon, label, multiplier, active }) => (
  <View style={[styles.surgeCard, active && styles.surgeCardActive]}>
    <MaterialIcons name={icon} size={28} color={active ? COLORS.secondary : COLORS.mutedDark} />
    <Text style={styles.surgeLabel}>{label}</Text>
    <Text style={[styles.surgeMultiplier, active && { color: COLORS.secondary }]}>
      {multiplier.toFixed(2)}x
    </Text>
  </View>
);

// ============================================================================
// 6. AI DISPATCH ENGINE
// ============================================================================

export const AIDispatchPanel = ({ token, booking, onDispatchComplete }) => {
  const [driverOptions, setDriverOptions] = useState([]);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [loading, setLoading] = useState(false);

  const findBestDriver = useCallback(async () => {
    if (!booking) {
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/advanced/dispatch/find-best-driver', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          booking_id: booking.id,
          passenger_location: booking.source,
          destination: booking.destination,
          ride_type: booking.ride_type
        })
      });
      const data = await res.json();
      setDriverOptions(data.top_candidates);
    } catch (error) {
      console.error('Dispatch error:', error);
    } finally {
      setLoading(false);
    }
  }, [booking, token]);

  useEffect(() => {
    const timeout = setTimeout(findBestDriver, 0);
    return () => clearTimeout(timeout);
  }, [findBestDriver]);

  const selectDriver = async (driver) => {
    setSelectedDriver(driver);
    // Log acceptance
    try {
      await fetch('/api/advanced/dispatch/log-response', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          booking_id: booking.id,
          driver_id: driver.driver_id,
          accepted: true,
          response_time_seconds: 5
        })
      });
      onDispatchComplete?.(driver);
    } catch (error) {
      console.error('Log error:', error);
    }
  };

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Smart Dispatch</Text>
        <MaterialIcons name="psychology" size={24} color={COLORS.primary} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 20 }} />
      ) : (
        <FlatList
          data={driverOptions}
          keyExtractor={(item) => item.driver_id}
          scrollEnabled={false}
          renderItem={({ item, index }) => (
            <DriverMatchCard
              driver={item}
              rank={index + 1}
              onSelect={() => selectDriver(item)}
              isSelected={selectedDriver?.driver_id === item.driver_id}
            />
          )}
        />
      )}
    </View>
  );
};

const DriverMatchCard = ({ driver, rank, onSelect, isSelected }) => (
  <TouchableOpacity
    style={[styles.driverCard, isSelected && styles.driverCardSelected]}
    onPress={onSelect}>
    <View style={styles.driverCardHeader}>
      <View style={styles.driverRank}>
        <Text style={styles.driverRankText}>{rank}</Text>
      </View>
      <View style={styles.driverInfo}>
        <Text style={styles.driverName}>{driver.driver_name}</Text>
        <View style={styles.driverStats}>
          <View style={styles.stat}>
            <MaterialIcons name="star" size={14} color={COLORS.warning} />
            <Text style={styles.statText}>{driver.driver_rating}/5</Text>
          </View>
          <View style={styles.stat}>
            <MaterialIcons name="location-on" size={14} color={COLORS.error} />
            <Text style={styles.statText}>{driver.distance_from_pickup}km</Text>
          </View>
        </View>
      </View>
      <View style={styles.scoreContainer}>
        <View style={[styles.scoreCircle, { backgroundColor: getScoreColor(driver.match_score) }]}>
          <Text style={styles.scoreText}>{driver.match_score.toFixed(0)}</Text>
        </View>
      </View>
    </View>
    <View style={styles.metricsRow}>
      <Metric label="Acceptance" value={`${(driver.acceptance_probability * 100).toFixed(0)}%`} />
      <Metric label="ETA" value={`${Math.round(driver.predicted_arrival_time / 60)} min`} />
    </View>
  </TouchableOpacity>
);

const Metric = ({ label, value }) => (
  <View style={styles.metric}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue}>{value}</Text>
  </View>
);

const getScoreColor = (score) => {
  if (score >= 80) return COLORS.success;
  if (score >= 60) return COLORS.warning;
  return COLORS.error;
};

// ============================================================================
// 7. FRAUD DETECTION
// ============================================================================

export const FraudDetectionPanel = ({ token, onFraudDetected }) => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchFraudCases = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/advanced/fraud/open-cases', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setAlerts(data.open_cases || []);
    } catch (error) {
      console.error('Fraud check error:', error);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const timeout = setTimeout(fetchFraudCases, 0);
    const interval = setInterval(fetchFraudCases, 300000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [fetchFraudCases]);

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Fraud Detection</Text>
        <MaterialIcons name="security" size={24} color={COLORS.error} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} />
      ) : alerts.length === 0 ? (
        <View style={styles.emptyState}>
          <MaterialIcons name="check-circle" size={48} color={COLORS.success} />
          <Text style={styles.emptyStateText}>No fraud cases detected</Text>
        </View>
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={(item) => item.case_id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <FraudCaseCard case={item} />
          )}
        />
      )}
    </View>
  );
};

const FraudCaseCard = ({ case: fraudCase }) => (
  <View style={[styles.caseCard, { borderLeftColor: fraudCase.severity === 'critical' ? COLORS.error : COLORS.warning }]}>
    <View style={styles.caseHeader}>
      <Text style={styles.caseId}>{fraudCase.case_id}</Text>
      <View style={[styles.severityBadge, { backgroundColor: fraudCase.severity === 'critical' ? COLORS.error : COLORS.warning }]}>
        <Text style={styles.severityText}>{fraudCase.severity.toUpperCase()}</Text>
      </View>
    </View>
    <Text style={styles.caseDetail}>Types: {fraudCase.fraud_types.join(', ')}</Text>
    <Text style={styles.caseDetail}>Status: {fraudCase.status}</Text>
  </View>
);

// ============================================================================
// 8. DRIVER EARNINGS OPTIMIZATION
// ============================================================================

export const DriverEarningsPanel = ({ token, driverId }) => {
  const [earnings, setEarnings] = useState(null);
  const [peakHours, setPeakHours] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchEarningsData = useCallback(async () => {
    setLoading(true);
    try {
      const [earningsRes, peakRes] = await Promise.all([
        fetch(`/api/advanced/earnings/prediction/${driverId}`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/advanced/earnings/peak-hours', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);
      const earningsData = await earningsRes.json();
      const peakData = await peakRes.json();
      setEarnings(earningsData);
      setPeakHours(peakData.peak_hours.slice(0, 5));
    } catch (error) {
      console.error('Earnings fetch error:', error);
    } finally {
      setLoading(false);
    }
  }, [driverId, token]);

  useEffect(() => {
    const timeout = setTimeout(fetchEarningsData, 0);
    return () => clearTimeout(timeout);
  }, [fetchEarningsData]);

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Earnings Optimization</Text>
        <MaterialIcons name="trending-up" size={24} color={COLORS.success} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={COLORS.primary} />
      ) : earnings ? (
        <ScrollView>
          <View style={styles.earningsBox}>
            <Text style={styles.earningsLabel}>Predicted Earnings Today</Text>
            <Text style={styles.earningsValue}>₹{earnings.predicted_earnings_today.toFixed(0)}</Text>
          </View>

          <Text style={styles.sectionTitle}>Recommended Zones</Text>
          {peakHours.length > 0 && (
            <View style={styles.peakHoursContainer}>
              {peakHours.map((hour) => (
                <View key={hour} style={styles.peakHourBadge}>
                  <Text style={styles.peakHourText}>{hour}:00</Text>
                </View>
              ))}
            </View>
          )}
          {earnings.recommended_zones.map((zone, idx) => (
            <View key={idx} style={styles.zoneCard}>
              <View style={styles.zoneHeader}>
                <Text style={styles.zoneName}>{zone.zone}</Text>
                <Text style={styles.zoneEarnings}>₹{zone.expected_earnings.toFixed(0)}</Text>
              </View>
              <Text style={styles.zoneReason}>{zone.reason}</Text>
              <View style={styles.peakHoursContainer}>
                {zone.peak_hours.map((hour) => (
                  <View key={hour} style={styles.peakHourBadge}>
                    <Text style={styles.peakHourText}>{hour}:00</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
};

// ============================================================================
// 9. WOMEN SAFETY SUITE
// ============================================================================

export const WomenSafetyPanel = ({ token, userId, onBookingUpdate }) => {
  const [womenOnlyEnabled, setWomenOnlyEnabled] = useState(false);
  const [trustedContacts, setTrustedContacts] = useState([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', phone: '' });

  const fetchTrustedContacts = useCallback(async () => {
    try {
      const res = await fetch(`/api/advanced/safety/trusted-contacts/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setTrustedContacts(data.contacts || []);
    } catch (error) {
      console.error('Trusted contacts fetch error:', error);
    }
  }, [token, userId]);

  useEffect(() => {
    const timeout = setTimeout(fetchTrustedContacts, 0);
    return () => clearTimeout(timeout);
  }, [fetchTrustedContacts]);

  const addTrustedContact = async () => {
    if (newContact.name && newContact.phone) {
      try {
        await fetch('/api/advanced/safety/add-trusted-contact', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            user_id: userId,
            contact: newContact
          })
        });
        setNewContact({ name: '', phone: '' });
        setShowAddContact(false);
        fetchTrustedContacts();
      } catch (error) {
        console.error('Add contact error:', error);
      }
    }
  };

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Women Safety</Text>
        <MaterialIcons name="security" size={24} color={COLORS.primary} />
      </View>

      <View style={styles.safetyToggle}>
        <View>
          <Text style={styles.toggleLabel}>Women-Only Rides</Text>
          <Text style={styles.toggleSubtext}>Request female drivers only</Text>
        </View>
        <Switch
          value={womenOnlyEnabled}
          onValueChange={setWomenOnlyEnabled}
          trackColor={{ false: '#ccc', true: COLORS.primary }}
          thumbColor={womenOnlyEnabled ? COLORS.success : '#666'}
        />
      </View>

      <View style={styles.divider} />

      <View style={styles.contactsSection}>
        <View style={styles.contactsHeader}>
          <Text style={styles.sectionTitle}>Trusted Contacts</Text>
          <TouchableOpacity onPress={() => setShowAddContact(true)}>
            <MaterialIcons name="add-circle" size={24} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        <FlatList
          data={trustedContacts}
          keyExtractor={(item) => item.contact_id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={styles.contactCard}>
              <MaterialIcons name="person" size={24} color={COLORS.primary} />
              <View style={styles.contactInfo}>
                <Text style={styles.contactName}>{item.contact_name}</Text>
                <Text style={styles.contactPhone}>{item.contact_phone}</Text>
                {item.is_primary && <Text style={styles.primaryBadge}>Primary</Text>}
              </View>
            </View>
          )}
        />
      </View>

      <Modal visible={showAddContact} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Trusted Contact</Text>
            <TextInput
              style={styles.input}
              placeholder="Contact Name"
              value={newContact.name}
              onChangeText={(text) => setNewContact({ ...newContact, name: text })}
            />
            <TextInput
              style={styles.input}
              placeholder="Phone Number"
              value={newContact.phone}
              onChangeText={(text) => setNewContact({ ...newContact, phone: text })}
              keyboardType="phone-pad"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelButton} onPress={() => setShowAddContact(false)}>
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.submitButton} onPress={addTrustedContact}>
                <Text style={styles.submitButtonText}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ============================================================================
// 10. FLEET OWNER PORTAL
// ============================================================================

export const FleetOwnerPanel = ({ token, fleetId }) => {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchFleetDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/advanced/fleet/${fleetId}/dashboard`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setDashboard(data);
    } catch (error) {
      console.error('Fleet dashboard error:', error);
    } finally {
      setLoading(false);
    }
  }, [fleetId, token]);

  useEffect(() => {
    const timeout = setTimeout(fetchFleetDashboard, 0);
    const interval = setInterval(fetchFleetDashboard, 60000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [fetchFleetDashboard]);

  return (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <Text style={styles.panelTitle}>Fleet Dashboard</Text>
        <MaterialIcons name="directions-car" size={24} color={COLORS.primary} />
      </View>

      {loading || !dashboard ? (
        <ActivityIndicator size="large" color={COLORS.primary} />
      ) : (
        <ScrollView>
          <View style={styles.fleetMetricsGrid}>
            <MetricBox label="Vehicles" value={dashboard.total_vehicles} icon="directions-car" />
            <MetricBox label="Drivers" value={dashboard.total_drivers} icon="person" />
            <MetricBox label="Active" value={dashboard.active_drivers} icon="check-circle" />
            <MetricBox label="Today" value={`₹${(dashboard.total_fleet_earnings_today / 1000).toFixed(0)}K`} icon="trending-up" />
          </View>

          <View style={styles.fleetSection}>
            <Text style={styles.fleetSectionTitle}>Top Performer</Text>
            <View style={styles.topPerformerCard}>
              <Text style={styles.topPerformerName}>{dashboard.top_driver.name}</Text>
              <Text style={styles.topPerformerEarnings}>₹{dashboard.top_driver.earnings_today.toFixed(0)}</Text>
              <Text style={styles.topPerformerLabel}>Today&apos;s Earnings</Text>
            </View>
          </View>

          <View style={styles.fleetSection}>
            <Text style={styles.fleetSectionTitle}>Fleet Summary</Text>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Weekly Earnings</Text>
              <Text style={styles.summaryValue}>₹{(dashboard.weekly_earnings / 1000).toFixed(0)}K</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Commission Due</Text>
              <Text style={[styles.summaryValue, { color: COLORS.warning }]}>₹{(dashboard.commission_due / 1000).toFixed(0)}K</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Avg Rating</Text>
              <Text style={styles.summaryValue}>{dashboard.average_rating} ⭐</Text>
            </View>
          </View>
        </ScrollView>
      )}
    </View>
  );
};

const MetricBox = ({ label, value, icon }) => (
  <View style={styles.metricBox}>
    <MaterialIcons name={icon} size={28} color={COLORS.primary} />
    <Text style={styles.metricBoxLabel}>{label}</Text>
    <Text style={styles.metricBoxValue}>{value}</Text>
  </View>
);

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  panelHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.light,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.dark,
  },
  surgeGrid: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  surgeCard: {
    flex: 1,
    backgroundColor: COLORS.light,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginRight: 8,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  surgeCardActive: {
    borderColor: COLORS.secondary,
    backgroundColor: '#fff9e6',
  },
  surgeLabel: {
    fontSize: 11,
    color: COLORS.mutedDark,
    marginTop: 6,
    textAlign: 'center',
  },
  surgeMultiplier: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.dark,
    marginTop: 4,
  },
  totalSurgeBox: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  totalSurgeLabel: {
    fontSize: 12,
    color: COLORS.mutedDark,
  },
  totalSurgeValue: {
    fontSize: 28,
    fontWeight: '700',
    marginTop: 4,
  },
  surgeNote: {
    fontSize: 11,
    color: COLORS.mutedDark,
    marginTop: 4,
  },
  refreshButton: {
    flexDirection: 'row',
    backgroundColor: COLORS.light,
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
    marginLeft: 6,
  },
  driverCard: {
    backgroundColor: COLORS.light,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  driverCardSelected: {
    borderColor: COLORS.primary,
    backgroundColor: '#f0f4ff',
  },
  driverCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  driverRank: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  driverRankText: {
    color: '#fff',
    fontWeight: '700',
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.dark,
  },
  driverStats: {
    flexDirection: 'row',
    marginTop: 6,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  statText: {
    fontSize: 11,
    color: COLORS.mutedDark,
    marginLeft: 4,
  },
  scoreContainer: {
    marginLeft: 12,
  },
  scoreCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scoreText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    borderRadius: 6,
    paddingVertical: 8,
  },
  metric: {
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 10,
    color: COLORS.mutedDark,
  },
  metricValue: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.dark,
    marginTop: 2,
  },
  caseCard: {
    backgroundColor: COLORS.light,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 3,
  },
  caseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  caseId: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.dark,
  },
  severityBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  severityText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  caseDetail: {
    fontSize: 11,
    color: COLORS.mutedDark,
    marginBottom: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyStateText: {
    fontSize: 14,
    color: COLORS.mutedDark,
    marginTop: 12,
  },
  earningsBox: {
    backgroundColor: COLORS.light,
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.success,
  },
  earningsLabel: {
    fontSize: 12,
    color: COLORS.mutedDark,
  },
  earningsValue: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.success,
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.dark,
    marginBottom: 12,
    marginTop: 12,
  },
  zoneCard: {
    backgroundColor: COLORS.light,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  zoneHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  zoneName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.dark,
  },
  zoneEarnings: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.success,
  },
  zoneReason: {
    fontSize: 11,
    color: COLORS.mutedDark,
    marginBottom: 8,
  },
  peakHoursContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  peakHourBadge: {
    backgroundColor: COLORS.primary,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 6,
    marginBottom: 6,
  },
  peakHourText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
  },
  safetyToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.dark,
  },
  toggleSubtext: {
    fontSize: 11,
    color: COLORS.mutedDark,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.light,
    marginVertical: 12,
  },
  contactsSection: {
    marginTop: 12,
  },
  contactsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.light,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  },
  contactInfo: {
    marginLeft: 12,
    flex: 1,
  },
  contactName: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.dark,
  },
  contactPhone: {
    fontSize: 11,
    color: COLORS.mutedDark,
    marginTop: 2,
  },
  primaryBadge: {
    fontSize: 9,
    color: COLORS.success,
    fontWeight: '700',
    marginTop: 2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.dark,
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.light,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 13,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  submitButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  submitButtonText: {
    color: '#fff',
    fontWeight: '700',
  },
  fleetMetricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  metricBox: {
    width: '48%',
    backgroundColor: COLORS.light,
    borderRadius: 8,
    padding: 12,
    marginRight: '4%',
    marginBottom: 12,
    alignItems: 'center',
  },
  metricBoxLabel: {
    fontSize: 11,
    color: COLORS.mutedDark,
    marginTop: 6,
  },
  metricBoxValue: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 4,
  },
  fleetSection: {
    marginBottom: 16,
  },
  fleetSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.dark,
    marginBottom: 10,
  },
  topPerformerCard: {
    backgroundColor: COLORS.light,
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.success,
  },
  topPerformerName: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.dark,
  },
  topPerformerEarnings: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.success,
    marginTop: 6,
  },
  topPerformerLabel: {
    fontSize: 10,
    color: COLORS.mutedDark,
    marginTop: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.light,
  },
  summaryLabel: {
    fontSize: 12,
    color: COLORS.mutedDark,
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.dark,
  },
  mutedDark: COLORS.mutedDark,
});

export default {
  DynamicSurgePricingPanel,
  AIDispatchPanel,
  FraudDetectionPanel,
  DriverEarningsPanel,
  WomenSafetyPanel,
  FleetOwnerPanel,
};
