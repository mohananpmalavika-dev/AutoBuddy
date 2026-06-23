import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  TextInput,
  FlatList,
  ActivityIndicator,
  Alert,
  Dimensions
} from 'react-native';
import { useCorporateAdmin } from '../../hooks/useCorporateAdmin';

const { width } = Dimensions.get('window');

// ============================================================================
// MAIN DASHBOARD SCREEN
// ============================================================================

export const CorporateDashboardScreen: React.FC<{ accountId: string }> = ({ accountId }) => {
  const {
    dashboardSummary,
    isLoading,
    error,
    fetchDashboardSummary,
    fetchExpenses,
    fetchPendingApprovals
  } = useCorporateAdmin();

  const [activeTab, setActiveTab] = useState<'expenses' | 'employees' | 'invoices' | 'approvals'>('expenses');

  useEffect(() => {
    fetchDashboardSummary(accountId);
    fetchExpenses(accountId, 'employee');
    fetchPendingApprovals(accountId);
  }, [accountId]);

  if (isLoading && !dashboardSummary) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Corporate Dashboard</Text>
      </View>

      {error && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {dashboardSummary && (
        <>
          <ScrollView style={styles.scrollContent}>
            {/* Budget Card */}
            <View style={styles.budgetCard}>
              <Text style={styles.cardTitle}>Budget Overview</Text>
              <View style={styles.budgetCircle}>
                <Text style={styles.budgetPercent}>
                  {dashboardSummary.budget_utilization_pct}%
                </Text>
              </View>
              <View style={styles.budgetDetails}>
                <View style={styles.budgetRow}>
                  <Text style={styles.budgetLabel}>Total Budget:</Text>
                  <Text style={styles.budgetValue}>₹{dashboardSummary.total_budget.toFixed(0)}</Text>
                </View>
                <View style={styles.budgetRow}>
                  <Text style={styles.budgetLabel}>Spent:</Text>
                  <Text style={styles.budgetValue}>₹{dashboardSummary.spent_this_month.toFixed(0)}</Text>
                </View>
                <View style={styles.budgetRow}>
                  <Text style={styles.budgetLabel}>Remaining:</Text>
                  <Text style={[styles.budgetValue, { color: '#4CAF50' }]}>
                    ₹{dashboardSummary.remaining_budget.toFixed(0)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Quick Stats Grid */}
            <View style={styles.statsGrid}>
              <StatCard
                label="Active Employees"
                value={dashboardSummary.active_employees.toString()}
              />
              <StatCard
                label="Pending Approvals"
                value={dashboardSummary.pending_approvals.toString()}
                badge={dashboardSummary.pending_approvals > 0}
              />
              <StatCard
                label="This Month Rides"
                value={dashboardSummary.current_month_rides.toString()}
              />
              <StatCard
                label="This Month Expense"
                value={`₹${dashboardSummary.current_month_expense.toFixed(0)}`}
              />
            </View>
          </ScrollView>

          {/* Tab Navigation */}
          <View style={styles.tabBar}>
            <TabButton
              label="Expenses"
              active={activeTab === 'expenses'}
              onPress={() => setActiveTab('expenses')}
            />
            <TabButton
              label="Employees"
              active={activeTab === 'employees'}
              onPress={() => setActiveTab('employees')}
            />
            <TabButton
              label="Invoices"
              active={activeTab === 'invoices'}
              onPress={() => setActiveTab('invoices')}
            />
            <TabButton
              label="Approvals"
              active={activeTab === 'approvals'}
              onPress={() => setActiveTab('approvals')}
            />
          </View>
        </>
      )}

      {/* Tab Content */}
      {activeTab === 'expenses' && <ExpensesTab accountId={accountId} />}
      {activeTab === 'employees' && <EmployeesTab accountId={accountId} />}
      {activeTab === 'invoices' && <InvoicesTab accountId={accountId} />}
      {activeTab === 'approvals' && <ApprovalsTab accountId={accountId} />}
    </View>
  );
};

// ============================================================================
// TAB COMPONENTS
// ============================================================================

const ExpensesTab: React.FC<{ accountId: string }> = ({ accountId }) => {
  const { expenses, isLoading, fetchExpenses } = useCorporateAdmin();
  const [groupBy, setGroupBy] = useState<'employee' | 'department' | 'date'>('employee');

  useEffect(() => {
    fetchExpenses(accountId, groupBy);
  }, [groupBy]);

  return (
    <View style={styles.tabContent}>
      <View style={styles.groupBySelector}>
        <TouchableOpacity
          style={[styles.groupBtn, groupBy === 'employee' && styles.groupBtnActive]}
          onPress={() => setGroupBy('employee')}
        >
          <Text style={styles.groupBtnText}>By Employee</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.groupBtn, groupBy === 'department' && styles.groupBtnActive]}
          onPress={() => setGroupBy('department')}
        >
          <Text style={styles.groupBtnText}>By Department</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.groupBtn, groupBy === 'date' && styles.groupBtnActive]}
          onPress={() => setGroupBy('date')}
        >
          <Text style={styles.groupBtnText}>By Date</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator size="large" color="#4CAF50" />
      ) : (
        <FlatList
          data={expenses}
          keyExtractor={(item, idx) => `${item.category}-${idx}`}
          renderItem={({ item }) => (
            <View style={styles.expenseItem}>
              <View style={styles.expenseHeader}>
                <Text style={styles.expenseCategory}>{item.category}</Text>
                <Text style={styles.expenseAmount}>₹{item.total_amount.toFixed(0)}</Text>
              </View>
              <View style={styles.expenseDetails}>
                <Text style={styles.expenseDetail}>Rides: {item.ride_count}</Text>
                <Text style={styles.expenseDetail}>Avg: ₹{item.avg_per_ride.toFixed(0)}</Text>
              </View>
            </View>
          )}
          scrollEnabled={false}
        />
      )}
    </View>
  );
};

const EmployeesTab: React.FC<{ accountId: string }> = ({ accountId }) => {
  const { employees, fetchEmployees, bulkAddEmployees } = useCorporateAdmin();
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    fetchEmployees(accountId);
  }, []);

  return (
    <View style={styles.tabContent}>
      <View style={styles.tabHeader}>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowAddModal(true)}
        >
          <Text style={styles.addBtnText}>+ Add Employee</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={employees}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.employeeItem}>
            <View style={styles.employeeHeader}>
              <Text style={styles.employeeName}>{item.name}</Text>
              <View style={[styles.statusBadge, item.is_active ? styles.activeBadge : styles.inactiveBadge]}>
                <Text style={styles.statusText}>{item.is_active ? 'Active' : 'Inactive'}</Text>
              </View>
            </View>
            <Text style={styles.employeeEmail}>{item.email}</Text>
            <View style={styles.employeeDetails}>
              <Text style={styles.detailText}>Dept: {item.department}</Text>
              <Text style={styles.detailText}>Role: {item.role_in_program}</Text>
            </View>
            <View style={styles.employeeDetails}>
              <Text style={styles.detailText}>Daily Limit: ₹{item.monthly_ride_budget}</Text>
              <Text style={styles.detailText}>Spent: ₹{item.budget_spent_this_month.toFixed(0)}</Text>
            </View>
          </View>
        )}
        scrollEnabled={false}
      />

      <AddEmployeeModal visible={showAddModal} onClose={() => setShowAddModal(false)} accountId={accountId} />
    </View>
  );
};

const InvoicesTab: React.FC<{ accountId: string }> = ({ accountId }) => {
  const { invoices, fetchInvoices } = useCorporateAdmin();
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);

  useEffect(() => {
    fetchInvoices(accountId);
  }, []);

  const handlePayClick = (invoice: any) => {
    setSelectedInvoice(invoice);
    setShowPayModal(true);
  };

  return (
    <View style={styles.tabContent}>
      <FlatList
        data={invoices}
        keyExtractor={item => item.invoice_id}
        renderItem={({ item }) => (
          <View style={styles.invoiceItem}>
            <View style={styles.invoiceHeader}>
              <Text style={styles.invoiceNumber}>{item.invoice_number}</Text>
              <View style={[styles.statusBadge,
                item.invoice_status === 'paid' ? styles.paidBadge : styles.pendingBadge]}>
                <Text style={styles.statusText}>{item.invoice_status.toUpperCase()}</Text>
              </View>
            </View>
            <Text style={styles.invoicePeriod}>
              {new Date(item.billing_period_start).toLocaleDateString()} - {new Date(item.billing_period_end).toLocaleDateString()}
            </Text>
            <View style={styles.invoiceDetails}>
              <Text style={styles.detailText}>Rides: {item.total_rides}</Text>
              <Text style={styles.detailText}>Amount: ₹{item.total_amount.toFixed(0)}</Text>
            </View>
            {item.invoice_status !== 'paid' && (
              <TouchableOpacity
                style={styles.payBtn}
                onPress={() => handlePayClick(item)}
              >
                <Text style={styles.payBtnText}>Pay Now</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
        scrollEnabled={false}
      />

      <InvoicePaymentModal
        visible={showPayModal}
        invoice={selectedInvoice}
        onClose={() => setShowPayModal(false)}
        accountId={accountId}
      />
    </View>
  );
};

const ApprovalsTab: React.FC<{ accountId: string }> = ({ accountId }) => {
  const { pendingApprovals, fetchPendingApprovals } = useCorporateAdmin();

  useEffect(() => {
    fetchPendingApprovals(accountId);
  }, []);

  return (
    <View style={styles.tabContent}>
      <Text style={styles.approvalsHeader}>
        {pendingApprovals.length} Pending Approvals
      </Text>

      <FlatList
        data={pendingApprovals}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={styles.approvalItem}>
            <View style={styles.approvalHeader}>
              <Text style={styles.approvalEmployee}>{item.employee_id}</Text>
              <View style={styles.statusBadge}>
                <Text style={styles.statusText}>{item.approval_status}</Text>
              </View>
            </View>
            <Text style={styles.approvalRoute}>
              {item.pickup_location} → {item.dropoff_location}
            </Text>
            <View style={styles.approvalDetails}>
              <Text style={styles.detailText}>Est. Cost: ₹{item.estimated_cost.toFixed(0)}</Text>
              <Text style={styles.detailText}>{new Date(item.ride_date).toLocaleDateString()}</Text>
            </View>
            <View style={styles.approvalButtons}>
              <TouchableOpacity style={[styles.actionBtn, styles.approveBtn]}>
                <Text style={styles.actionBtnText}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.rejectBtn]}>
                <Text style={styles.actionBtnText}>Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        scrollEnabled={false}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No pending approvals</Text>
        }
      />
    </View>
  );
};

// ============================================================================
// MODALS
// ============================================================================

const AddEmployeeModal: React.FC<{ visible: boolean; onClose: () => void; accountId: string }> = ({
  visible,
  onClose,
  accountId
}) => {
  const { bulkAddEmployees } = useCorporateAdmin();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');

  const handleAddEmployee = async () => {
    if (!name || !email) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    try {
      await bulkAddEmployees(accountId, [{
        name,
        email,
        department,
        monthly_budget: 5000,
        daily_limit: 500
      }]);
      Alert.alert('Success', 'Employee added successfully');
      onClose();
    } catch (err) {
      Alert.alert('Error', 'Failed to add employee');
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Add Employee</Text>

          <TextInput
            style={styles.input}
            placeholder="Name"
            value={name}
            onChangeText={setName}
            placeholderTextColor="#999"
          />
          <TextInput
            style={styles.input}
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            placeholderTextColor="#999"
          />
          <TextInput
            style={styles.input}
            placeholder="Department"
            value={department}
            onChangeText={setDepartment}
            placeholderTextColor="#999"
          />

          <View style={styles.modalButtons}>
            <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={onClose}>
              <Text style={styles.modalBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn, styles.submitBtn]} onPress={handleAddEmployee}>
              <Text style={[styles.modalBtnText, { color: '#fff' }]}>Add</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const InvoicePaymentModal: React.FC<{
  visible: boolean;
  invoice: any;
  onClose: () => void;
  accountId: string;
}> = ({ visible, invoice, onClose, accountId }) => {
  const { payInvoice } = useCorporateAdmin();
  const [paymentMethod, setPaymentMethod] = useState('card');

  const handlePay = async () => {
    try {
      await payInvoice(accountId, invoice.invoice_id, paymentMethod);
      Alert.alert('Success', 'Payment processing');
      onClose();
    } catch (err) {
      Alert.alert('Error', 'Failed to process payment');
    }
  };

  if (!invoice) {return null;}

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Pay Invoice</Text>

          <View style={styles.invoiceDetails}>
            <View style={styles.invoiceDetailRow}>
              <Text style={styles.invoiceDetailLabel}>Invoice:</Text>
              <Text style={styles.invoiceDetailValue}>{invoice.invoice_number}</Text>
            </View>
            <View style={styles.invoiceDetailRow}>
              <Text style={styles.invoiceDetailLabel}>Amount:</Text>
              <Text style={styles.invoiceDetailValue}>₹{invoice.total_amount.toFixed(0)}</Text>
            </View>
            <View style={styles.invoiceDetailRow}>
              <Text style={styles.invoiceDetailLabel}>Due Date:</Text>
              <Text style={styles.invoiceDetailValue}>
                {new Date(invoice.due_date).toLocaleDateString()}
              </Text>
            </View>
          </View>

          <Text style={styles.paymentMethodLabel}>Payment Method:</Text>
          <View style={styles.paymentMethods}>
            <TouchableOpacity
              style={[styles.methodBtn, paymentMethod === 'card' && styles.methodBtnActive]}
              onPress={() => setPaymentMethod('card')}
            >
              <Text style={styles.methodText}>Card</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.methodBtn, paymentMethod === 'bank_transfer' && styles.methodBtnActive]}
              onPress={() => setPaymentMethod('bank_transfer')}
            >
              <Text style={styles.methodText}>Bank Transfer</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.modalButtons}>
            <TouchableOpacity style={[styles.modalBtn, styles.cancelBtn]} onPress={onClose}>
              <Text style={styles.modalBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.modalBtn, styles.submitBtn]} onPress={handlePay}>
              <Text style={[styles.modalBtnText, { color: '#fff' }]}>Pay Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ============================================================================
// UTILITY COMPONENTS
// ============================================================================

const StatCard: React.FC<{ label: string; value: string; badge?: boolean }> = ({
  label,
  value,
  badge
}) => (
  <View style={styles.statCard}>
    {badge && <View style={styles.badgeIndicator} />}
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const TabButton: React.FC<{
  label: string;
  active: boolean;
  onPress: () => void;
}> = ({ label, active, onPress }) => (
  <TouchableOpacity
    style={[styles.tab, active && styles.tabActive]}
    onPress={onPress}
  >
    <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
  </TouchableOpacity>
);

// ============================================================================
// STYLES
// ============================================================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5'
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#fff'
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333'
  },
  errorBanner: {
    backgroundColor: '#ffebee',
    paddingVertical: 12,
    paddingHorizontal: 16,
    margin: 8,
    borderRadius: 8
  },
  errorText: {
    color: '#d32f2f',
    fontSize: 14
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12
  },
  budgetCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    elevation: 2
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12
  },
  budgetCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#e8f5e9',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
    marginBottom: 16
  },
  budgetPercent: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#4CAF50'
  },
  budgetDetails: {
    gap: 10
  },
  budgetRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  budgetLabel: {
    fontSize: 14,
    color: '#666'
  },
  budgetValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333'
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 16
  },
  statCard: {
    width: width / 2 - 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    alignItems: 'center'
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#4CAF50',
    marginBottom: 4
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center'
  },
  badgeIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#d32f2f'
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0'
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent'
  },
  tabActive: {
    borderBottomColor: '#4CAF50'
  },
  tabText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#999',
    fontWeight: '500'
  },
  tabTextActive: {
    color: '#4CAF50',
    fontWeight: '600'
  },
  tabContent: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12
  },
  tabHeader: {
    marginBottom: 12
  },
  addBtn: {
    backgroundColor: '#4CAF50',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8
  },
  addBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600'
  },
  groupBySelector: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12
  },
  groupBtn: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center'
  },
  groupBtnActive: {
    backgroundColor: '#4CAF50'
  },
  groupBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#333'
  },
  expenseItem: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    elevation: 1
  },
  expenseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  expenseCategory: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333'
  },
  expenseAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50'
  },
  expenseDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  expenseDetail: {
    fontSize: 12,
    color: '#666'
  },
  employeeItem: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    elevation: 1
  },
  employeeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  employeeName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    flex: 1
  },
  employeeEmail: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8
  },
  employeeDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#f0f0f0'
  },
  activeBadge: {
    backgroundColor: '#e8f5e9'
  },
  inactiveBadge: {
    backgroundColor: '#ffebee'
  },
  paidBadge: {
    backgroundColor: '#e8f5e9'
  },
  pendingBadge: {
    backgroundColor: '#fff3e0'
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#333'
  },
  detailText: {
    fontSize: 12,
    color: '#666'
  },
  invoiceItem: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    elevation: 1
  },
  invoiceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  invoiceNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333'
  },
  invoicePeriod: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8
  },
  invoiceDetails: {
    gap: 4
  },
  invoiceDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  invoiceDetailLabel: {
    fontSize: 12,
    color: '#666'
  },
  invoiceDetailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333'
  },
  payBtn: {
    backgroundColor: '#4CAF50',
    paddingVertical: 8,
    marginTop: 12,
    borderRadius: 6,
    alignItems: 'center'
  },
  payBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600'
  },
  approvalsHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12
  },
  approvalItem: {
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
    elevation: 1
  },
  approvalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8
  },
  approvalEmployee: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333'
  },
  approvalRoute: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8
  },
  approvalDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  approvalButtons: {
    flexDirection: 'row',
    gap: 8
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center'
  },
  approveBtn: {
    backgroundColor: '#4CAF50'
  },
  rejectBtn: {
    backgroundColor: '#f44336'
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600'
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 14,
    marginTop: 16
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end'
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    paddingBottom: 32
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 12,
    fontSize: 14,
    color: '#333'
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center'
  },
  cancelBtn: {
    backgroundColor: '#f0f0f0'
  },
  submitBtn: {
    backgroundColor: '#4CAF50'
  },
  modalBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333'
  },
  paymentMethodLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
    marginBottom: 8
  },
  paymentMethods: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16
  },
  methodBtn: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    alignItems: 'center'
  },
  methodBtnActive: {
    backgroundColor: '#e8f5e9',
    borderColor: '#4CAF50'
  },
  methodText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#333'
  }
});
