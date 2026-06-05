/*
Corporate Ride Portal Frontend Component
Location: autobuddy-mobile/src/screens/CorporatePortal.js
B2B admin interface for managing employee ride programs
*/

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, ScrollView, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, ActivityIndicator, Modal, RefreshControl
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const COLORS = {
  primary: '#2D4A7B',
  secondary: '#FF8C42',
  success: '#4CAF50',
  warning: '#FFC107',
  danger: '#F44336',
  white: '#FFFFFF',
  light_gray: '#F5F5F5',
  dark_gray: '#333333',
  text: '#555555'
};

const SHADOWS = {
  small: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 2 },
  medium: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 5, elevation: 4 }
};

// ============================================================================
// DASHBOARD TAB
// ============================================================================

const CorporateDashboard = ({ companyId, adminToken }) => {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/corporate/company/${companyId}/analytics/dashboard`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (res.ok) setDashboard(await res.json());
    } catch (e) {
      console.error('Error fetching dashboard:', e);
    } finally {
      setLoading(false);
    }
  }, [adminToken, companyId]);

  useEffect(() => {
    const timeout = setTimeout(fetchDashboard, 0);
    const interval = setInterval(fetchDashboard, 60000); // 1 min refresh
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [fetchDashboard]);

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} />;
  if (!dashboard?.data) return <Text>No data</Text>;

  const data = dashboard.data;

  return (
    <ScrollView style={styles.container} refreshControl={
      <RefreshControl refreshing={loading} onRefresh={fetchDashboard} />
    }>
      {/* Key Metrics */}
      <View style={styles.metricsGrid}>
        <View style={[styles.metricCard, SHADOWS.small]}>
          <MaterialCommunityIcons name="account-multiple" size={24} color={COLORS.primary} />
          <Text style={styles.metricValue}>{data.metrics.active_employees}</Text>
          <Text style={styles.metricLabel}>Active Employees</Text>
        </View>

        <View style={[styles.metricCard, SHADOWS.small]}>
          <MaterialCommunityIcons name="car" size={24} color={COLORS.success} />
          <Text style={styles.metricValue}>{data.metrics.total_rides_this_month}</Text>
          <Text style={styles.metricLabel}>Rides This Month</Text>
        </View>

        <View style={[styles.metricCard, SHADOWS.small]}>
          <MaterialCommunityIcons name="currency-inr" size={24} color={COLORS.warning} />
          <Text style={styles.metricValue}>₹{(data.metrics.total_spend_this_month / 1000).toFixed(0)}K</Text>
          <Text style={styles.metricLabel}>Monthly Spend</Text>
        </View>

        <View style={[styles.metricCard, SHADOWS.small]}>
          <MaterialCommunityIcons name="percent" size={24} color={COLORS.danger} />
          <Text style={styles.metricValue}>{data.metrics.policy_compliance_rate}%</Text>
          <Text style={styles.metricLabel}>Policy Compliance</Text>
        </View>
      </View>

      {/* Top Destinations */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Top Destinations</Text>
        {data.top_destinations?.map((dest, idx) => (
          <View key={idx} style={[styles.listItem, SHADOWS.small]}>
            <View style={styles.listLeft}>
              <MaterialCommunityIcons name="map-marker" size={20} color={COLORS.primary} />
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.listTitle}>{dest.destination}</Text>
                <Text style={styles.listSubtitle}>{dest.rides} rides</Text>
              </View>
            </View>
            <Text style={styles.listValue}>{((dest.rides / data.metrics.total_rides_this_month) * 100).toFixed(0)}%</Text>
          </View>
        ))}
      </View>

      {/* Alerts */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Alerts</Text>
        {data.pending_approvals > 0 && (
          <View style={[styles.alertItem, { backgroundColor: COLORS.warning }]}>
            <MaterialCommunityIcons name="alert" size={18} color={COLORS.white} />
            <Text style={styles.alertText}>{data.pending_approvals} pending approvals</Text>
          </View>
        )}
        {data.overdue_invoices > 0 && (
          <View style={[styles.alertItem, { backgroundColor: COLORS.danger }]}>
            <MaterialCommunityIcons name="alert-circle" size={18} color={COLORS.white} />
            <Text style={styles.alertText}>{data.overdue_invoices} overdue invoices</Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
};

// ============================================================================
// EMPLOYEES TAB
// ============================================================================

const EmployeesTab = ({ companyId, adminToken }) => {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchEmployees = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/corporate/company/${companyId}/employees`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEmployees(data.data || []);
      }
    } catch (e) {
      console.error('Error fetching employees:', e);
    } finally {
      setLoading(false);
    }
  }, [adminToken, companyId]);

  useEffect(() => {
    const timeout = setTimeout(fetchEmployees, 0);
    const interval = setInterval(fetchEmployees, 30000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [fetchEmployees]);

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} />;

  return (
    <>
      <FlatList
        data={employees}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchEmployees} />}
        renderItem={({ item }) => (
          <View style={[styles.employeeCard, SHADOWS.small]}>
            <View style={styles.employeeHeader}>
              <View style={styles.employeeAvatar}>
                <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
              </View>
              <View style={styles.employeeInfo}>
                <Text style={styles.employeeName}>{item.name}</Text>
                <Text style={styles.employeeRole}>{item.department}</Text>
              </View>
              <View style={[
                styles.statusBadge,
                { backgroundColor: item.is_active ? COLORS.success : COLORS.light_gray }
              ]}>
                <Text style={styles.statusText}>{item.is_active ? 'Active' : 'Inactive'}</Text>
              </View>
            </View>

            <View style={styles.employeeBudget}>
              <View style={styles.budgetRow}>
                <Text style={styles.budgetLabel}>Budget</Text>
                <View style={styles.budgetBar}>
                  <View
                    style={[
                      styles.budgetFilled,
                      { width: `${(item.budget_spent_this_month / item.monthly_ride_budget) * 100}%` }
                    ]}
                  />
                </View>
                <Text style={styles.budgetValue}>
                  ₹{item.budget_spent_this_month} / ₹{item.monthly_ride_budget}
                </Text>
              </View>
              <Text style={styles.rideCount}>Rides: {item.rides_used_this_month}/{item.rides_per_month_limit}</Text>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>No employees</Text>}
      />

      <TouchableOpacity
        style={[styles.fab, SHADOWS.medium]}
        onPress={() => setShowAddModal(true)}
      >
        <MaterialCommunityIcons name="plus" size={24} color={COLORS.white} />
      </TouchableOpacity>

      <Modal visible={showAddModal} transparent animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Add Employee</Text>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: COLORS.primary }]}
              onPress={() => {
                setShowAddModal(false);
                Alert.alert('Success', 'Employee added');
              }}
            >
              <Text style={styles.buttonText}>Add</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: COLORS.light_gray }]}
              onPress={() => setShowAddModal(false)}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
};

// ============================================================================
// RIDE REQUESTS TAB
// ============================================================================

const RideRequestsTab = ({ companyId, adminToken }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/corporate/ride-requests/${companyId}?status=pending`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRequests(data.data || []);
      }
    } catch (e) {
      console.error('Error fetching requests:', e);
    } finally {
      setLoading(false);
    }
  }, [adminToken, companyId]);

  useEffect(() => {
    const timeout = setTimeout(fetchRequests, 0);
    const interval = setInterval(fetchRequests, 15000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [fetchRequests]);

  const handleApprove = async (requestId) => {
    try {
      await fetch(`/api/v1/corporate/ride-requests/${requestId}/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${adminToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ approver_id: 'admin_1' })
      });
      Alert.alert('Success', 'Request approved');
      fetchRequests();
    } catch (e) {
      Alert.alert('Error', 'Failed to approve');
    }
  };

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} />;

  return (
    <FlatList
      data={requests}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchRequests} />}
      renderItem={({ item }) => (
        <View style={[styles.requestCard, SHADOWS.small]}>
          <View style={styles.requestHeader}>
            <View>
              <Text style={styles.employeeName}>{item.employee_name}</Text>
              <Text style={styles.requestDate}>{item.ride_date}</Text>
            </View>
            <View style={[
              styles.badge,
              { backgroundColor: item.status === 'pending' ? COLORS.warning : COLORS.success }
            ]}>
              <Text style={styles.badgeText}>{item.status.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.routeInfo}>
            <MaterialCommunityIcons name="map-marker" size={16} color={COLORS.primary} />
            <Text style={styles.routeText}>{item.pickup} → {item.dropoff}</Text>
          </View>

          <View style={styles.costRow}>
            <Text style={styles.costLabel}>Estimated Cost</Text>
            <Text style={styles.costValue}>₹{item.estimated_cost}</Text>
          </View>

          {item.status === 'pending' && (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: COLORS.success }]}
                onPress={() => handleApprove(item.id)}
              >
                <MaterialCommunityIcons name="check" size={18} color={COLORS.white} />
                <Text style={styles.actionButtonText}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: COLORS.danger }]}
              >
                <MaterialCommunityIcons name="close" size={18} color={COLORS.white} />
                <Text style={styles.actionButtonText}>Reject</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}
      ListEmptyComponent={<Text style={styles.emptyText}>No pending requests</Text>}
    />
  );
};

// ============================================================================
// INVOICES TAB
// ============================================================================

const InvoicesTab = ({ companyId, adminToken }) => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchInvoices = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/corporate/company/${companyId}/invoices`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      if (res.ok) {
        const data = await res.json();
        setInvoices(data.data || []);
      }
    } catch (e) {
      console.error('Error fetching invoices:', e);
    } finally {
      setLoading(false);
    }
  }, [adminToken, companyId]);

  useEffect(() => {
    const timeout = setTimeout(fetchInvoices, 0);
    return () => clearTimeout(timeout);
  }, [fetchInvoices]);

  if (loading) return <ActivityIndicator size="large" color={COLORS.primary} />;

  const getStatusColor = (status) => {
    switch (status) {
      case 'paid': return COLORS.success;
      case 'sent': return COLORS.warning;
      default: return COLORS.light_gray;
    }
  };

  return (
    <FlatList
      data={invoices}
      keyExtractor={(item) => item.id}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={fetchInvoices} />}
      renderItem={({ item }) => (
        <View style={[styles.invoiceCard, SHADOWS.small]}>
          <View style={styles.invoiceHeader}>
            <View>
              <Text style={styles.invoiceNumber}>{item.invoice_number}</Text>
              <Text style={styles.invoiceMonth}>{item.billing_month}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
              <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.invoiceDetail}>
            <Text style={styles.detailLabel}>Total Rides</Text>
            <Text style={styles.detailValue}>{item.total_rides}</Text>
          </View>

          <View style={styles.invoiceDetail}>
            <Text style={styles.detailLabel}>Total Amount</Text>
            <Text style={styles.detailValue}>₹{item.total_amount}</Text>
          </View>

          <TouchableOpacity style={[styles.downloadButton, SHADOWS.small]}>
            <MaterialCommunityIcons name="download" size={18} color={COLORS.primary} />
            <Text style={styles.downloadText}>Download PDF</Text>
          </TouchableOpacity>
        </View>
      )}
      ListEmptyComponent={<Text style={styles.emptyText}>No invoices</Text>}
    />
  );
};

// ============================================================================
// MAIN CORPORATE PORTAL SCREEN
// ============================================================================

export const CorporatePortalScreen = ({ route, navigation }) => {
  const { companyId, adminToken } = route.params || { companyId: 'corp_001', adminToken: 'test-token' };
  const [activeTab, setActiveTab] = useState('dashboard');

  const renderTabContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return <CorporateDashboard companyId={companyId} adminToken={adminToken} />;
      case 'employees':
        return <EmployeesTab companyId={companyId} adminToken={adminToken} />;
      case 'requests':
        return <RideRequestsTab companyId={companyId} adminToken={adminToken} />;
      case 'invoices':
        return <InvoicesTab companyId={companyId} adminToken={adminToken} />;
      default:
        return null;
    }
  };

  return (
    <View style={styles.screen}>
      {/* Header */}
      <View style={[styles.header, SHADOWS.medium]}>
        <Text style={styles.headerTitle}>Corporate Portal</Text>
        <Text style={styles.headerSubtitle}>Ride Program Management</Text>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabBar}>
        {[
          { id: 'dashboard', label: 'Dashboard', icon: 'view-dashboard' },
          { id: 'employees', label: 'Employees', icon: 'account-multiple' },
          { id: 'requests', label: 'Requests', icon: 'check-circle' },
          { id: 'invoices', label: 'Invoices', icon: 'file-document' }
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
  screen: { flex: 1, backgroundColor: COLORS.light_gray },
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
    marginBottom: 12,
    alignItems: 'center'
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.primary,
    marginTop: 8
  },
  metricLabel: {
    fontSize: 12,
    color: COLORS.text,
    marginTop: 4,
    textAlign: 'center'
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
  listItem: {
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  listLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  listTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.dark_gray
  },
  listSubtitle: {
    fontSize: 12,
    color: COLORS.text,
    marginTop: 2
  },
  listValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.primary
  },
  alertItem: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center'
  },
  alertText: {
    color: COLORS.white,
    marginLeft: 12,
    fontWeight: '600'
  },
  employeeCard: {
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8
  },
  employeeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12
  },
  employeeAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center'
  },
  avatarText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 16
  },
  employeeInfo: {
    flex: 1,
    marginLeft: 12
  },
  employeeName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.dark_gray
  },
  employeeRole: {
    fontSize: 12,
    color: COLORS.text,
    marginTop: 2
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
  employeeBudget: {
    backgroundColor: COLORS.light_gray,
    padding: 8,
    borderRadius: 6
  },
  budgetRow: {
    marginBottom: 8
  },
  budgetLabel: {
    fontSize: 11,
    color: COLORS.text,
    marginBottom: 4
  },
  budgetBar: {
    height: 6,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
    marginBottom: 4,
    overflow: 'hidden'
  },
  budgetFilled: {
    height: '100%',
    backgroundColor: COLORS.success
  },
  budgetValue: {
    fontSize: 11,
    color: COLORS.text,
    fontWeight: 'bold'
  },
  rideCount: {
    fontSize: 11,
    color: COLORS.text
  },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.secondary,
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: COLORS.white,
    padding: 20,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    color: COLORS.dark_gray
  },
  button: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8
  },
  buttonText: {
    color: COLORS.white,
    fontWeight: 'bold'
  },
  requestCard: {
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8
  },
  requestHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12
  },
  requestDate: {
    fontSize: 12,
    color: COLORS.text,
    marginTop: 2
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4
  },
  badgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: COLORS.white
  },
  routeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  routeText: {
    fontSize: 12,
    color: COLORS.text,
    marginLeft: 6
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#ECECEC'
  },
  costLabel: {
    fontSize: 12,
    color: COLORS.text
  },
  costValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.primary
  },
  actionRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8
  },
  actionButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center'
  },
  actionButtonText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 12,
    marginLeft: 4
  },
  invoiceCard: {
    backgroundColor: COLORS.white,
    padding: 12,
    borderRadius: 8,
    marginBottom: 8
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start'
  },
  invoiceNumber: {
    fontSize: 14,
    fontWeight: 'bold',
    color: COLORS.dark_gray
  },
  invoiceMonth: {
    fontSize: 12,
    color: COLORS.text,
    marginTop: 2
  },
  divider: {
    height: 1,
    backgroundColor: '#ECECEC',
    marginVertical: 8
  },
  invoiceDetail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6
  },
  detailLabel: {
    fontSize: 12,
    color: COLORS.text
  },
  detailValue: {
    fontSize: 12,
    fontWeight: 'bold',
    color: COLORS.primary
  },
  downloadButton: {
    backgroundColor: COLORS.light_gray,
    paddingVertical: 8,
    borderRadius: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8
  },
  downloadText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: 'bold',
    marginLeft: 6
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.text,
    marginTop: 40,
    fontSize: 14
  }
});

export default CorporatePortalScreen;
