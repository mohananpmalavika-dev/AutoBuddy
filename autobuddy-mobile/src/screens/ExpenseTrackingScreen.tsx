import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useExpenseTracking } from '../hooks/useExpenseTracking';

type DateLike = string | number | Date | null | undefined;

const formatDateSafely = (date: DateLike): string => {
  if (!date) return 'Unknown';
  const dateObj = new Date(date);
  return !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : 'Unknown';
};

const formatDateTimeSafely = (date: DateLike): string => {
  if (!date) return 'Unknown';
  const dateObj = new Date(date);
  return !isNaN(dateObj.getTime()) ? dateObj.toLocaleString() : 'Unknown';
};

interface ExpenseTrackingScreenProps {
  token: string | null;
  userId: string;
}

export const ExpenseTrackingScreen: React.FC<ExpenseTrackingScreenProps> = ({
  token,
  userId,
}) => {
  const {
    expenses,
    categories,
    summary,
    loading,
    error,
    fetchExpenses,
    addExpense,
    deleteExpense,
    categorizeExpense,
    uploadReceipt,
    getSummary,
    getExpensesByCategory,
    setExpenseLimit,
    getExpenseAlerts,
  } = useExpenseTracking(token, userId);

  const [refreshing, setRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expenseDetailsModal, setExpenseDetailsModal] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<any>(null);
  const [addExpenseModal, setAddExpenseModal] = useState(false);
  const [newExpense, setNewExpense] = useState({
    amount: '',
    category: 'fuel' as const,
    description: '',
  });
  const [alerts, setAlerts] = useState<string[]>([]);

  const categoryIcons: { [key: string]: string } = {
    fuel: 'local-gas-station',
    maintenance: 'build',
    insurance: 'shield',
    toll: 'toll',
    cleaning: 'cleaning-services',
    other: 'more-horiz',
  };

  const categoryColors: { [key: string]: string } = {
    fuel: '#FF9800',
    maintenance: '#2196F3',
    insurance: '#4CAF50',
    toll: '#9C27B0',
    cleaning: '#00BCD4',
    other: '#757575',
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const start = new Date();
    start.setDate(1);
    await fetchExpenses(userId, start, new Date());
    await getSummary(start, new Date());
    const expenseAlerts = getExpenseAlerts();
    setAlerts(expenseAlerts);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleAddExpense = async () => {
    if (!newExpense.amount || !newExpense.description) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }
    const success = await addExpense({
      amount: parseFloat(newExpense.amount),
      category: newExpense.category,
      description: newExpense.description,
      date: new Date(),
      userId,
      status: 'pending',
    });
    if (success) {
      Alert.alert('Success', 'Expense added');
      setAddExpenseModal(false);
      setNewExpense({ amount: '', category: 'fuel', description: '' });
      await loadData();
    }
  };

  const handleDeleteExpense = (expenseId: string) => {
    Alert.alert('Delete Expense', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const success = await deleteExpense(expenseId);
          if (success) {
            Alert.alert('Success', 'Expense deleted');
            await loadData();
          }
        },
      },
    ]);
  };

  const categoryExpenses =
    selectedCategory && selectedCategory !== 'all'
      ? getExpensesByCategory(selectedCategory)
      : expenses;

  if (loading && !expenses.length) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Summary Card */}
      {summary && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryLabel}>Total Expenses</Text>
              <Text style={styles.summaryValue}>${summary.totalExpenses.toFixed(2)}</Text>
            </View>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryLabel}>Daily Average</Text>
              <Text style={styles.summaryValue}>${summary.averageDaily.toFixed(2)}</Text>
            </View>
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryLabel}>Highest</Text>
              <Text style={styles.summaryValue}>{summary.highestCategory}</Text>
            </View>
            <View style={styles.summaryStat}>
              <Text style={styles.summaryLabel}>Entries</Text>
              <Text style={styles.summaryValue}>{summary.expenses.length}</Text>
            </View>
          </View>
        </View>
      )}

      {/* Alerts */}
      {alerts.length > 0 && (
        <View style={styles.alertsContainer}>
          {alerts.map((alert, idx) => (
            <View key={idx} style={styles.alertBanner}>
              <MaterialIcons name="warning" size={18} color="#FF9800" />
              <Text style={styles.alertText}>{alert}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Category Filter */}
      <View style={styles.categoryFilter}>
        <Pressable
          style={[
            styles.categoryFilterBtn,
            !selectedCategory && styles.categoryFilterBtnActive,
          ]}
          onPress={() => setSelectedCategory(null)}
        >
          <Text
            style={[
              styles.categoryFilterText,
              !selectedCategory && styles.categoryFilterTextActive,
            ]}
          >
            All
          </Text>
        </Pressable>
        {(['fuel', 'maintenance', 'insurance', 'toll', 'cleaning'] as const).map((cat) => (
          <Pressable
            key={cat}
            style={[
              styles.categoryFilterBtn,
              selectedCategory === cat && styles.categoryFilterBtnActive,
            ]}
            onPress={() => setSelectedCategory(cat)}
          >
            <MaterialIcons
              name={categoryIcons[cat] as any}
              size={16}
              color={selectedCategory === cat ? '#fff' : categoryColors[cat]}
            />
            <Text
              style={[
                styles.categoryFilterText,
                selectedCategory === cat && styles.categoryFilterTextActive,
              ]}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Expenses List */}
      <View style={styles.section}>
        <View style={styles.headerRow}>
          <Text style={styles.sectionTitle}>
            {selectedCategory ? selectedCategory.toUpperCase() : 'All'} Expenses
          </Text>
          <Pressable
            style={styles.addButton}
            onPress={() => setAddExpenseModal(true)}
          >
            <MaterialIcons name="add" size={20} color="#2196F3" />
          </Pressable>
        </View>

        {categoryExpenses.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="receipt-long" size={48} color="#ccc" />
            <Text style={styles.emptyText}>No expenses found</Text>
          </View>
        ) : (
          categoryExpenses.map((expense) => (
            <Pressable
              key={expense.id}
              style={styles.expenseCard}
              onPress={() => {
                setSelectedExpense(expense);
                setExpenseDetailsModal(true);
              }}
            >
              <View style={styles.expenseLeft}>
                <View
                  style={[
                    styles.expenseCategoryIcon,
                    {
                      backgroundColor:
                        categoryColors[expense.category] + '20',
                    },
                  ]}
                >
                  <MaterialIcons
                    name={categoryIcons[expense.category] as any}
                    size={20}
                    color={categoryColors[expense.category]}
                  />
                </View>
                <View style={styles.expenseInfo}>
                  <Text style={styles.expenseCategory}>
                    {expense.category.charAt(0).toUpperCase() + expense.category.slice(1)}
                  </Text>
                  <Text style={styles.expenseDescription}>{expense.description}</Text>
                  <Text style={styles.expenseDate}>
                    {formatDateSafely(expense.date)}
                  </Text>
                </View>
              </View>
              <View style={styles.expenseRight}>
                <Text style={styles.expenseAmount}>${expense.amount.toFixed(2)}</Text>
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor:
                        expense.status === 'approved'
                          ? '#E8F5E9'
                          : expense.status === 'rejected'
                            ? '#FFEBEE'
                            : '#FFF3E0',
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.statusText,
                      {
                        color:
                          expense.status === 'approved'
                            ? '#4CAF50'
                            : expense.status === 'rejected'
                              ? '#F44336'
                              : '#FF9800',
                      },
                    ]}
                  >
                    {expense.status.charAt(0).toUpperCase() + expense.status.slice(1)}
                  </Text>
                </View>
              </View>
            </Pressable>
          ))
        )}
      </View>

      <View style={{ height: 20 }} />

      {/* Add Expense Modal */}
      <Modal
        visible={addExpenseModal}
        animationType="slide"
        transparent
        onRequestClose={() => setAddExpenseModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Expense</Text>
              <Pressable onPress={() => setAddExpenseModal(false)}>
                <MaterialIcons name="close" size={24} color="#000" />
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.formLabel}>Amount</Text>
              <View style={styles.amountInput}>
                <Text style={styles.amountCurrency}>$</Text>
                <Text style={styles.amountValue}>{newExpense.amount || '0.00'}</Text>
              </View>

              <Text style={styles.formLabel}>Category</Text>
              <View style={styles.categoryGrid}>
                {(['fuel', 'maintenance', 'insurance', 'toll', 'cleaning', 'other'] as const).map(
                  (cat) => (
                    <Pressable
                      key={cat}
                      style={[
                        styles.categoryOption,
                        newExpense.category === cat && styles.categoryOptionActive,
                      ]}
                      onPress={() =>
                        setNewExpense({ ...newExpense, category: cat })
                      }
                    >
                      <MaterialIcons
                        name={categoryIcons[cat] as any}
                        size={20}
                        color={
                          newExpense.category === cat
                            ? '#fff'
                            : categoryColors[cat]
                        }
                      />
                      <Text
                        style={[
                          styles.categoryOptionText,
                          newExpense.category === cat &&
                            styles.categoryOptionTextActive,
                        ]}
                      >
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </Text>
                    </Pressable>
                  )
                )}
              </View>

              <Text style={styles.formLabel}>Description</Text>
              <View style={styles.descriptionInput}>
                <Text style={styles.descriptionText}>{newExpense.description || 'Enter details'}</Text>
              </View>

              <Pressable
                style={styles.primaryButton}
                onPress={handleAddExpense}
              >
                <MaterialIcons name="add" size={20} color="#fff" />
                <Text style={styles.primaryButtonText}>Add Expense</Text>
              </Pressable>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Expense Details Modal */}
      <Modal
        visible={expenseDetailsModal}
        animationType="slide"
        transparent
        onRequestClose={() => setExpenseDetailsModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Expense Details</Text>
              <Pressable onPress={() => setExpenseDetailsModal(false)}>
                <MaterialIcons name="close" size={24} color="#000" />
              </Pressable>
            </View>

            {selectedExpense && (
              <ScrollView style={styles.modalBody}>
                <View style={styles.detailSection}>
                  <View
                    style={[
                      styles.largeIcon,
                      {
                        backgroundColor:
                          categoryColors[selectedExpense.category] + '20',
                      },
                    ]}
                  >
                    <MaterialIcons
                      name={categoryIcons[selectedExpense.category] as any}
                      size={32}
                      color={categoryColors[selectedExpense.category]}
                    />
                  </View>
                  <Text style={styles.detailAmount}>${selectedExpense.amount.toFixed(2)}</Text>
                  <Text style={styles.detailCategory}>
                    {selectedExpense.category.charAt(0).toUpperCase() +
                      selectedExpense.category.slice(1)}
                  </Text>
                </View>

                <View style={styles.detailsGrid}>
                  <DetailRow label="Description" value={selectedExpense.description} />
                  <DetailRow
                    label="Date"
                    value={formatDateTimeSafely(selectedExpense.date)}
                  />
                  <DetailRow
                    label="Status"
                    value={
                      selectedExpense.status.charAt(0).toUpperCase() +
                      selectedExpense.status.slice(1)
                    }
                  />
                  {selectedExpense.receiptUrl && (
                    <DetailRow label="Receipt" value="Attached" />
                  )}
                </View>

                <Pressable
                  style={styles.deleteButton}
                  onPress={() => {
                    handleDeleteExpense(selectedExpense.id);
                    setExpenseDetailsModal(false);
                  }}
                >
                  <MaterialIcons name="delete" size={20} color="#F44336" />
                  <Text style={styles.deleteButtonText}>Delete Expense</Text>
                </Pressable>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const DetailRow: React.FC<{
  label: string;
  value: string;
}> = ({ label, value }) => {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailRowLabel}>{label}</Text>
      <Text style={styles.detailRowValue}>{value}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  summaryStat: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  alertsContainer: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF3E0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
  },
  alertText: {
    flex: 1,
    fontSize: 12,
    color: '#FF6F00',
    fontWeight: '600',
  },
  categoryFilter: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  categoryFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  categoryFilterBtnActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  categoryFilterText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  categoryFilterTextActive: {
    color: '#fff',
  },
  section: {
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  expenseCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  expenseLeft: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  expenseCategoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expenseInfo: {
    flex: 1,
  },
  expenseCategory: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
  expenseDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  expenseDate: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  expenseRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  expenseAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  modalBody: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
    marginTop: 12,
  },
  amountInput: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    marginBottom: 12,
  },
  amountCurrency: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2196F3',
    marginRight: 4,
  },
  amountValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  categoryOption: {
    width: '31%',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  categoryOptionActive: {
    backgroundColor: '#2196F3',
  },
  categoryOptionText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  categoryOptionTextActive: {
    color: '#fff',
  },
  descriptionInput: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    marginBottom: 12,
    minHeight: 60,
    justifyContent: 'center',
  },
  descriptionText: {
    fontSize: 13,
    color: '#666',
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    borderRadius: 6,
    marginTop: 12,
    marginBottom: 12,
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  detailSection: {
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  largeIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  detailAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
  },
  detailCategory: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  detailsGrid: {
    paddingVertical: 12,
    marginBottom: 12,
  },
  detailRow: {
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailRowLabel: {
    fontSize: 11,
    color: '#999',
    marginBottom: 4,
  },
  detailRowValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#F44336',
    backgroundColor: '#FFEBEE',
    marginBottom: 12,
  },
  deleteButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F44336',
  },
});

export default ExpenseTrackingScreen;
