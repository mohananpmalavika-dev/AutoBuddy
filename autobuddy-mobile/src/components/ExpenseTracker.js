import React, { useState } from 'react';
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
import VoiceTextInput from './VoiceTextInput';

export default function ExpenseTracker({
  expenses = [],
  totalExpense = 0,
  onAddExpense,
  onRemoveExpense,
  isLoading = false,
  error = '',
  expenseTypes = {},
}) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    type: 'toll',
    amount: '',
    description: '',
  });

  const handleAddExpense = async () => {
    if (!formData.amount) {
      alert('Please enter amount');
      return;
    }

    const success = await onAddExpense(
      formData.type,
      formData.amount,
      formData.description
    );

    if (success) {
      setFormData({ type: 'toll', amount: '', description: '' });
      setShowForm(false);
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
          <Text style={styles.headerTitle}>💰 Trip Expenses</Text>
          <Text style={styles.headerSubtitle}>Track tolls, parking & fuel</Text>
        </View>
        <View style={styles.totalBox}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>₹{totalExpense.toFixed(2)}</Text>
        </View>
      </View>

      {/* Error Message */}
      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* Expenses List */}
      {expenses.length > 0 ? (
        <ScrollView style={styles.expensesList} showsVerticalScrollIndicator={false}>
          {expenses.map((expense) => (
            <View key={expense.id} style={styles.expenseCard}>
              <View style={styles.expenseInfo}>
                <View style={styles.expenseTypeBox}>
                  <Text style={styles.expenseTypeEmoji}>
                    {expense.type === 'toll' ? '🛣️' : expense.type === 'parking' ? '🅿️' : '⛽'}
                  </Text>
                  <Text style={styles.expenseType}>{expenseTypes[expense.type] || expense.type}</Text>
                </View>
                {expense.description && (
                  <Text style={styles.expenseDescription}>{expense.description}</Text>
                )}
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
          <Text style={styles.emptyStateText}>No expenses added yet</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F9F9F9',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    ...SHADOWS.card,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  totalBox: {
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2E7D32',
  },
  totalLabel: {
    fontSize: 11,
    color: '#2E7D32',
    fontWeight: '600',
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2E7D32',
    marginTop: 2,
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
  expensesList: {
    maxHeight: 200,
    marginBottom: 12,
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
  expenseActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  expenseAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2E7D32',
  },
  removeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFEBEE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    fontSize: 16,
    color: '#C62828',
    fontWeight: '700',
  },
  emptyState: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
  },
  addButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  addButtonDisabled: {
    opacity: 0.6,
  },
  addButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 24,
    paddingTop: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
  },
  modalCloseButton: {
    fontSize: 20,
    color: '#666',
    fontWeight: '600',
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  typeButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    flexWrap: 'wrap',
  },
  typeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#D0D0D0',
  },
  typeButtonActive: {
    backgroundColor: '#2196F3',
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
    borderWidth: 1,
    borderColor: '#D0D0D0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    marginBottom: 14,
    backgroundColor: '#F9F9F9',
  },
  formButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  formButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  formButtonCancel: {
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#D0D0D0',
  },
  formButtonCancelText: {
    color: '#333',
    fontWeight: '600',
    fontSize: 14,
  },
  formButtonSubmit: {
    backgroundColor: '#2196F3',
  },
  formButtonSubmitText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  formButtonDisabled: {
    opacity: 0.6,
  },
});
