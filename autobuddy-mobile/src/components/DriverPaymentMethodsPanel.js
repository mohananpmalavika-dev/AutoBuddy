import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { usePaymentMethods } from '../hooks/usePaymentMethods';
import { theme } from '../theme';

const INITIAL_FORM = {
  methodType: 'upi',
  accountHolderName: '',
  accountNumber: '',
  ifscCode: '',
  upiId: '',
  isDefault: true,
};

const METHOD_OPTIONS = [
  { value: 'upi', label: 'UPI' },
  { value: 'wallet', label: 'Wallet' },
];

export default function DriverPaymentMethodsPanel({ token, driverId, isVisible, onClose }) {
  const {
    paymentMethods,
    isLoading,
    error,
    PAYMENT_METHODS,
    loadPaymentMethods,
    addPaymentMethod,
    deletePaymentMethod,
    setDefaultPaymentMethod,
  } = usePaymentMethods({ token, driverId });

  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState(INITIAL_FORM);

  useEffect(() => {
    if (isVisible) {
      loadPaymentMethods();
    }
  }, [isVisible, loadPaymentMethods]);

  const resetForm = useCallback(() => {
    setFormData({
      ...INITIAL_FORM,
      isDefault: paymentMethods.length === 0,
    });
  }, [paymentMethods.length]);

  const openAddForm = useCallback(() => {
    resetForm();
    setShowAddForm(true);
  }, [resetForm]);

  const handleAddMethod = useCallback(async () => {
    const accountHolderName = formData.accountHolderName.trim();
    const accountNumber = formData.accountNumber.trim();
    const ifscCode = formData.ifscCode.trim().toUpperCase();
    const upiId = formData.upiId.trim();

    if (formData.methodType === 'bank_transfer' && (!accountHolderName || !accountNumber || !ifscCode)) {
      Alert.alert('Missing details', 'Enter account holder name, account number, and IFSC code.');
      return;
    }

    if (formData.methodType === 'upi' && !upiId) {
      Alert.alert('Missing UPI', 'Enter a UPI ID.');
      return;
    }

    const success = await addPaymentMethod(formData.methodType, {
      account_holder_name: accountHolderName || 'Payout Wallet',
      account_number: accountNumber || undefined,
      ifsc_code: ifscCode || undefined,
      upi_id: upiId || undefined,
      is_default: formData.isDefault,
    });

    if (success) {
      setShowAddForm(false);
      resetForm();
    } else {
      Alert.alert('Error', error || 'Failed to add payment method');
    }
  }, [addPaymentMethod, error, formData, resetForm]);

  const handleDeleteMethod = useCallback(
    (methodId) => {
      Alert.alert('Remove payout method', 'Remove this payout method?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            const success = await deletePaymentMethod(methodId);
            if (!success) {
              Alert.alert('Error', error || 'Failed to remove payment method');
            }
          },
        },
      ]);
    },
    [deletePaymentMethod, error]
  );

  const handleSetDefault = useCallback(
    async (methodId) => {
      const success = await setDefaultPaymentMethod(methodId);
      if (!success) {
        Alert.alert('Error', error || 'Failed to update default method');
      }
    },
    [error, setDefaultPaymentMethod]
  );

  const renderMethodDetail = (method) => {
    if (method.method_type === 'upi') {
      return method.upi_id || 'UPI payout';
    }
    if (method.account_number) {
      return `Account ending ${String(method.account_number).slice(-4)}`;
    }
    return PAYMENT_METHODS[method.method_type] || method.method_type;
  };

  return (
    <Modal visible={isVisible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.headerButton}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Payout Methods</Text>
          <TouchableOpacity onPress={openAddForm}>
            <Text style={[styles.headerButton, styles.primaryText]}>Add</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {paymentMethods.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No payout method added</Text>
              <Text style={styles.emptyText}>Add a UPI or wallet payout method before configuring payout preferences.</Text>
            </View>
          ) : (
            paymentMethods.map((method) => (
              <View key={method.id} style={styles.methodCard}>
                <View style={styles.methodInfo}>
                  <Text style={styles.methodTitle}>
                    {PAYMENT_METHODS[method.method_type] || method.method_type}
                  </Text>
                  <Text style={styles.methodMeta}>{renderMethodDetail(method)}</Text>
                  <Text style={styles.methodStatus}>{method.verification_status || 'pending'}</Text>
                </View>
                <View style={styles.methodActions}>
                  <TouchableOpacity
                    disabled={method.is_default}
                    onPress={() => handleSetDefault(method.id)}
                    style={[styles.smallButton, method.is_default && styles.defaultButton]}
                  >
                    <Text style={[styles.smallButtonText, method.is_default && styles.defaultButtonText]}>
                      {method.is_default ? 'Default' : 'Set Default'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteMethod(method.id)} style={styles.removeButton}>
                    <Text style={styles.removeButtonText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}

          {isLoading && <Text style={styles.emptyText}>Loading...</Text>}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

        <Modal visible={showAddForm} animationType="fade" transparent>
          <View style={styles.formOverlay}>
            <View style={styles.formModal}>
              <Text style={styles.formTitle}>Add Payout Method</Text>

              <View style={styles.typeRow}>
                {METHOD_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option.value}
                    style={[styles.typeButton, formData.methodType === option.value && styles.typeButtonActive]}
                    onPress={() => setFormData((prev) => ({ ...prev, methodType: option.value }))}
                  >
                    <Text style={[styles.typeButtonText, formData.methodType === option.value && styles.typeButtonTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {formData.methodType !== 'wallet' && (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Account Holder Name</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formData.accountHolderName}
                    onChangeText={(text) => setFormData((prev) => ({ ...prev, accountHolderName: text }))}
                    placeholder="Name on payout account"
                  />
                </View>
              )}

              {formData.methodType === 'bank_transfer' && (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Account Number</Text>
                    <TextInput
                      style={styles.formInput}
                      value={formData.accountNumber}
                      onChangeText={(text) => setFormData((prev) => ({ ...prev, accountNumber: text }))}
                      keyboardType="number-pad"
                      placeholder="Bank account number"
                    />
                  </View>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>IFSC Code</Text>
                    <TextInput
                      style={styles.formInput}
                      value={formData.ifscCode}
                      onChangeText={(text) => setFormData((prev) => ({ ...prev, ifscCode: text }))}
                      autoCapitalize="characters"
                      placeholder="IFSC"
                    />
                  </View>
                </>
              )}

              {formData.methodType === 'upi' && (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>UPI ID</Text>
                  <TextInput
                    style={styles.formInput}
                    value={formData.upiId}
                    onChangeText={(text) => setFormData((prev) => ({ ...prev, upiId: text }))}
                    autoCapitalize="none"
                    placeholder="name@bank"
                  />
                </View>
              )}

              <View style={styles.defaultRow}>
                <Text style={styles.formLabel}>Make default</Text>
                <Switch
                  value={formData.isDefault}
                  onValueChange={(value) => setFormData((prev) => ({ ...prev, isDefault: value }))}
                  trackColor={{ false: theme.COLORS.grey3, true: theme.COLORS.primary }}
                />
              </View>

              <View style={styles.formButtons}>
                <TouchableOpacity
                  style={[styles.formButton, styles.cancelButton]}
                  onPress={() => setShowAddForm(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.formButton, styles.submitButton]}
                  onPress={handleAddMethod}
                  disabled={isLoading}
                >
                  <Text style={styles.submitButtonText}>{isLoading ? 'Saving...' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.COLORS.white,
    paddingTop: 40,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: theme.COLORS.grey2,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    color: theme.COLORS.black,
    fontSize: 18,
    fontWeight: '600',
  },
  headerButton: {
    color: theme.COLORS.grey5,
    fontSize: 14,
    fontWeight: '600',
  },
  primaryText: {
    color: theme.COLORS.primary,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  emptyCard: {
    backgroundColor: theme.COLORS.grey1,
    borderRadius: 8,
    padding: 16,
  },
  emptyTitle: {
    color: theme.COLORS.black,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyText: {
    color: theme.COLORS.grey5,
    fontSize: 13,
    paddingVertical: 10,
    textAlign: 'center',
  },
  methodCard: {
    backgroundColor: theme.COLORS.grey1,
    borderRadius: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    padding: 12,
  },
  methodInfo: {
    flex: 1,
    paddingRight: 10,
  },
  methodTitle: {
    color: theme.COLORS.black,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 3,
  },
  methodMeta: {
    color: theme.COLORS.grey5,
    fontSize: 12,
    marginBottom: 4,
  },
  methodStatus: {
    color: theme.COLORS.primary,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  methodActions: {
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  smallButton: {
    borderColor: theme.COLORS.primary,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  smallButtonText: {
    color: theme.COLORS.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  defaultButton: {
    backgroundColor: theme.COLORS.primary,
  },
  defaultButtonText: {
    color: theme.COLORS.white,
  },
  removeButton: {
    marginTop: 8,
  },
  removeButtonText: {
    color: theme.COLORS.danger,
    fontSize: 11,
    fontWeight: '700',
  },
  formOverlay: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  formModal: {
    backgroundColor: theme.COLORS.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 30,
  },
  formTitle: {
    color: theme.COLORS.black,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 16,
  },
  typeRow: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  typeButton: {
    borderColor: theme.COLORS.grey3,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  typeButtonActive: {
    backgroundColor: theme.COLORS.primary,
    borderColor: theme.COLORS.primary,
  },
  typeButtonText: {
    color: theme.COLORS.grey5,
    fontSize: 12,
    fontWeight: '700',
  },
  typeButtonTextActive: {
    color: theme.COLORS.white,
  },
  formGroup: {
    marginBottom: 12,
  },
  formLabel: {
    color: theme.COLORS.black,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  formInput: {
    borderColor: theme.COLORS.grey3,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  defaultRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  formButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  formButton: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    paddingVertical: 12,
  },
  cancelButton: {
    backgroundColor: theme.COLORS.grey2,
    marginRight: 8,
  },
  submitButton: {
    backgroundColor: theme.COLORS.primary,
    marginLeft: 8,
  },
  cancelButtonText: {
    color: theme.COLORS.grey5,
    fontWeight: '700',
  },
  submitButtonText: {
    color: theme.COLORS.white,
    fontWeight: '700',
  },
  error: {
    color: theme.COLORS.danger,
    fontSize: 13,
    marginTop: 12,
    textAlign: 'center',
  },
});
