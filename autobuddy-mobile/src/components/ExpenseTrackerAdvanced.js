import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SHADOWS } from '../theme';
import { formatToIST } from '../utils/time';
import VoiceTextInput from './VoiceTextInput';

/**
 * Advanced Expense Tracker with category breakdown, receipt uploads, and reporting
 */
export default function ExpenseTrackerAdvanced({
  expenses = [],
  totalExpense = 0,
  onAddExpense,
  onRemoveExpense,
  onUploadReceipt,
  isLoading = false,
  error = '',
  expenseTypes = {},
}) {
  const [showForm, setShowForm] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('month'); // month, week, all
  const [showStats, setShowStats] = useState(false);
  const [formData, setFormData] = useState({
    type: 'toll',
    amount: '',
    description: '',
    receiptUrl: null,
  });

  // Calculate category breakdown
  const categoryBreakdown = useMemo(() => {
    const breakdown = {};
    expenses.forEach(exp => {
      if (!breakdown[exp.type]) {
        breakdown[exp.type] = { count: 0, total: 0 };
      }
      breakdown[exp.type].count += 1;
      breakdown[exp.type].total += Number(exp.amount || 0);
    });
    return breakdown;
  }, [expenses]);

  // Calculate period expenses
  const periodExpenses = useMemo(() => {
    const now = new Date();
    const filtered = expenses.filter(exp => {
      const expDate = new Date(exp.created_at || now);
      if (selectedPeriod === 'week') {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return expDate >= weekAgo;
      } else if (selectedPeriod === 'month') {
        return expDate.getMonth() === now.getMonth() && expDate.getFullYear() === now.getFullYear();
      }
      return true;
    });
    return filtered.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
  }, [expenses, selectedPeriod]);

  // Calculate expense trends
  const expenseTrends = useMemo(() => {
    const trends = {};
    expenses.forEach(exp => {
      const date = formatToIST(exp.created_at || new Date(), { dateStyle: 'short' });
      if (!trends[date]) trends[date] = 0;
      trends[date] += Number(exp.amount || 0);
    });
    return trends;
  }, [expenses]);

  const handleAddExpense = async () => {
    if (!formData.amount) {
      alert('Please enter amount');
      return;
    }

    const success = await onAddExpense(
      formData.type,
      formData.amount,
      formData.description,
      formData.receiptUrl
    );

    if (success) {
      setFormData({
        type: 'toll',
        amount: '',
        description: '',
        receiptUrl: null,
      });
      setShowForm(false);
    }
  };

  const handleUploadReceipt = async () => {
    if (onUploadReceipt) {
      const receiptUrl = await onUploadReceipt();
      if (receiptUrl) {
        setFormData({ ...formData, receiptUrl });
      }
    }
  };

  const handleRemoveExpense = (expenseId) => {
    onRemoveExpense(expenseId);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>💰 Advanced Expense Tracking</Text>
          <Text style={styles.headerSubtitle}>Category breakdown & tax reporting</Text>
        </View>
        <TouchableOpacity style={styles.statsButton} onPress={() => setShowStats(true)}>
          <Text style={styles.statsButtonText}>📊</Text>
        </TouchableOpacity>
      </View>

      {/* Error Message */}
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      )}

      {/* Summary Cards */}
      <View style={styles.summaryGrid}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total ({selectedPeriod})</Text>
          <Text style={styles.summaryValue}>₹{periodExpenses.toFixed(2)}</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Categories</Text>
          <Text style={styles.summaryValue}>{Object.keys(categoryBreakdown).length}</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Entries</Text>
          <Text style={styles.summaryValue}>{expenses.length}</Text>
        </View>
      </View>

      {/* Period Selector */}
      <View style={styles.periodSelector}>
        {['week', 'month', 'all'].map(period => (
          <TouchableOpacity
            key={period}
            style={[
              styles.periodButton,
              selectedPeriod === period && styles.periodButtonActive,
            ]}
            onPress={() => setSelectedPeriod(period)}
          >
            <Text
              style={[
                styles.periodButtonText,
                selectedPeriod === period && styles.periodButtonTextActive,
              ]}
            >
              {period === 'all' ? 'All Time' : period === 'week' ? 'This Week' : 'This Month'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Category Breakdown */}
      {Object.keys(categoryBreakdown).length > 0 && (
        <View style={styles.categorySection}>
          <Text style={styles.categoryTitle}>📈 Category Breakdown</Text>
          {Object.entries(categoryBreakdown).map(([type, data]) => {
            const percentage = (data.total / totalExpense) * 100;
            return (
              <View key={type} style={styles.categoryRow}>
                <View style={styles.categoryInfo}>
                  <Text style={styles.categoryName}>
                    {expenseTypes[type] || type} ({data.count})
                  </Text>
                  <View style={styles.categoryBar}>
                    <View
                      style={[
                        styles.categoryBarFill,
                        {
                          width: `${percentage}%`,
                          backgroundColor: getCategoryColor(type),
                        },
                      ]}
                    />
                  </View>
                </View>
                <Text style={styles.categoryAmount}>₹{data.total.toFixed(2)}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Expenses List */}
      {expenses.length > 0 ? (
        <ScrollView style={styles.expensesList} showsVerticalScrollIndicator={false}>
          <Text style={styles.listTitle}>📋 Recent Expenses</Text>
          {expenses.map((expense) => (
            <View key={expense.id} style={styles.expenseCard}>
              <View style={styles.expenseInfo}>
                <View style={styles.expenseTypeBox}>
                  <Text style={styles.expenseTypeEmoji}>
                    {expense.type === 'toll' ? '🛣️' : expense.type === 'parking' ? '🅿️' : expense.type === 'fuel' ? '⛽' : '📌'}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.expenseType}>{expenseTypes[expense.type] || expense.type}</Text>
                    {expense.description && (
                      <Text style={styles.expenseDescription}>{expense.description}</Text>
                    )}
                    {expense.receiptUrl && (
                      <Text style={styles.receiptBadge}>📸 Receipt attached</Text>
                    )}
                  </View>
                </View>
              </View>

              <View style={styles.expenseActions}>
                <Text style={styles.expenseAmount}>₹{Number(expense.amount).toFixed(2)}</Text>
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => handleRemoveExpense(expense.id)}
                  disabled={isLoading}
                >
                  <Text style={styles.removeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateEmoji}>📭</Text>
          <Text style={styles.emptyStateText}>No expenses yet</Text>
          <Text style={styles.emptyStateSubtext}>Start tracking to see insights</Text>
        </View>
      )}

      {/* Add Expense Button */}
      <TouchableOpacity
        style={[styles.addButton, isLoading && styles.addButtonDisabled]}
        onPress={() => setShowForm(true)}
        disabled={isLoading}
      >
        <Text style={styles.addButtonText}>➕ Add Expense</Text>
      </TouchableOpacity>

      {/* Add Expense Modal */}
      <Modal
        visible={showForm}
        transparent
        animationType="slide"
        onRequestClose={() => setShowForm(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Expense</Text>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Text style={styles.modalCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Type Selection */}
            <Text style={styles.fieldLabel}>Expense Type</Text>
            <View style={styles.typeButtons}>
              {Object.entries(expenseTypes).map(([key, label]) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.typeButton,
                    formData.type === key && styles.typeButtonActive,
                  ]}
                  onPress={() => setFormData({ ...formData, type: key })}
                >
                  <Text
                    style={[
                      styles.typeButtonText,
                      formData.type === key && styles.typeButtonTextActive,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Amount */}
            <Text style={styles.fieldLabel}>Amount (₹)</Text>
            <VoiceTextInput
              style={styles.input}
              value={formData.amount}
              onChangeText={(text) => setFormData({ ...formData, amount: text })}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#BDBDBD"
            />

            {/* Description */}
            <Text style={styles.fieldLabel}>Description (Optional)</Text>
            <VoiceTextInput
              style={styles.input}
              value={formData.description}
              onChangeText={(text) => setFormData({ ...formData, description: text })}
              placeholder="e.g., NH Toll Booth"
              placeholderTextColor="#BDBDBD"
            />

            {/* Receipt Upload */}
            {onUploadReceipt && (
              <>
                <Text style={styles.fieldLabel}>Receipt (Optional)</Text>
                <TouchableOpacity
                  style={styles.uploadButton}
                  onPress={handleUploadReceipt}
                  disabled={isLoading}
                >
                  <Text style={styles.uploadButtonText}>
                    {formData.receiptUrl ? '✓ Receipt attached' : '📷 Upload Receipt'}
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {/* Buttons */}
            <View style={styles.formButtons}>
              <TouchableOpacity
                style={[styles.formButton, styles.formButtonCancel]}
                onPress={() => setShowForm(false)}
                disabled={isLoading}
              >
                <Text style={styles.formButtonCancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.formButton, styles.formButtonSubmit, isLoading && styles.formButtonDisabled]}
                onPress={handleAddExpense}
                disabled={isLoading}
              >
                {isLoading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <Text style={styles.formButtonSubmitText}>Add Expense</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Stats Modal */}
      <Modal
        visible={showStats}
        transparent
        animationType="fade"
        onRequestClose={() => setShowStats(false)}
      >
        <View style={styles.statsOverlay}>
          <View style={styles.statsModal}>
            <View style={styles.statsHeader}>
              <Text style={styles.statsTitle}>📊 Expense Statistics</Text>
              <TouchableOpacity onPress={() => setShowStats(false)}>
                <Text style={styles.statsCloseButton}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.statsContent}>
              <View style={styles.statItem}>
                <Text style={styles.statItemLabel}>Total All-Time</Text>
                <Text style={styles.statItemValue}>₹{totalExpense.toFixed(2)}</Text>
              </View>

              <View style={styles.statItem}>
                <Text style={styles.statItemLabel}>Average per Entry</Text>
                <Text style={styles.statItemValue}>
                  ₹{(totalExpense / Math.max(expenses.length, 1)).toFixed(2)}
                </Text>
              </View>

              <View style={styles.statItem}>
                <Text style={styles.statItemLabel}>Total Entries</Text>
                <Text style={styles.statItemValue}>{expenses.length}</Text>
              </View>

              <View style={styles.statItem}>
                <Text style={styles.statItemLabel}>Tracked Days</Text>
                <Text style={styles.statItemValue}>{Object.keys(expenseTrends).length}</Text>
              </View>

              <View style={styles.statItem}>
                <Text style={styles.statItemLabel}>Tax Deductible (80%)</Text>
                <Text style={styles.statItemValue}>₹{(totalExpense * 0.8).toFixed(2)}</Text>
              </View>

              {Object.entries(categoryBreakdown).length > 0 && (
                <>
                  <Text style={styles.categoryBreakdownTitle}>Category Breakdown</Text>
                  {Object.entries(categoryBreakdown).map(([type, data]) => (
                    <View key={type} style={styles.breakdownItem}>
                      <Text style={styles.breakdownLabel}>{expenseTypes[type] || type}</Text>
                      <Text style={styles.breakdownValue}>
                        ₹{data.total.toFixed(2)} ({data.count} entries)
                      </Text>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowStats(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function getCategoryColor(type) {
  switch (type) {
    case 'toll': return '#2196F3';
    case 'parking': return '#FF9800';
    case 'fuel': return '#4CAF50';
    case 'maintenance': return '#9C27B0';
    default: return '#757575';
  }
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    ...SHADOWS.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1976D2',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  statsButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: '#E3F2FD',
  },
  statsButtonText: {
    fontSize: 20,
  },
  errorBox: {
    backgroundColor: '#FFEBEE',
    borderLeftWidth: 4,
    borderLeftColor: '#C62828',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    marginBottom: 12,
  },
  errorText: {
    color: '#C62828',
    fontSize: 12,
    fontWeight: '600',
  },
  summaryGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: '#FFF',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1976D2',
    marginTop: 4,
  },
  periodSelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  periodButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  periodButtonActive: {
    backgroundColor: '#1976D2',
    borderColor: '#1976D2',
  },
  periodButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  periodButtonTextActive: {
    color: '#FFF',
  },
  categorySection: {
    marginBottom: 16,
    backgroundColor: '#FFF',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
  },
  categoryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  categoryInfo: {
    flex: 1,
    marginRight: 12,
  },
  categoryName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
  },
  categoryBar: {
    height: 8,
    backgroundColor: '#F0F0F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  categoryBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  categoryAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1976D2',
  },
  expensesList: {
    maxHeight: 200,
    marginBottom: 12,
  },
  listTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  expenseCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  expenseInfo: {
    flex: 1,
  },
  expenseTypeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  expenseTypeEmoji: {
    fontSize: 16,
    marginRight: 8,
  },
  expenseType: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  expenseDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  receiptBadge: {
    fontSize: 11,
    color: '#4CAF50',
    fontWeight: '600',
    marginTop: 2,
  },
  expenseActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  expenseAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2E7D32',
  },
  removeButton: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 14,
    backgroundColor: '#FFEBEE',
  },
  removeButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#C62828',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 30,
    marginBottom: 12,
  },
  emptyStateEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  emptyStateSubtext: {
    fontSize: 12,
    color: '#999',
  },
  addButton: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#1976D2',
    alignItems: 'center',
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 16,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  modalCloseButton: {
    fontSize: 24,
    fontWeight: '700',
    color: '#999',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
    marginTop: 12,
  },
  typeButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  typeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  typeButtonActive: {
    backgroundColor: '#1976D2',
    borderColor: '#1976D2',
  },
  typeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  typeButtonTextActive: {
    color: '#FFF',
  },
  input: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    backgroundColor: '#F9F9F9',
    fontSize: 14,
    marginBottom: 12,
  },
  uploadButton: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#1976D2',
    borderStyle: 'dashed',
    alignItems: 'center',
    marginBottom: 12,
  },
  uploadButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1976D2',
  },
  formButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  formButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  formButtonCancel: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  formButtonCancelText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#666',
  },
  formButtonSubmit: {
    backgroundColor: '#1976D2',
  },
  formButtonSubmitText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  formButtonDisabled: {
    opacity: 0.5,
  },
  statsOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  statsModal: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    maxHeight: '80%',
    width: '100%',
  },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  statsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  statsCloseButton: {
    fontSize: 24,
    fontWeight: '700',
    color: '#999',
  },
  statsContent: {
    maxHeight: 300,
  },
  statItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  statItemLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
  },
  statItemValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1976D2',
  },
  categoryBreakdownTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#333',
    marginTop: 16,
    marginBottom: 12,
  },
  breakdownItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  breakdownLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  breakdownValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
  },
  closeButton: {
    marginTop: 16,
    paddingVertical: 12,
    borderRadius: 6,
    backgroundColor: '#1976D2',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
});
