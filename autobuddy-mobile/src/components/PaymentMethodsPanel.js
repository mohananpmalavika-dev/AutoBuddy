import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';
import VoiceTextInput from './VoiceTextInput';

function inferCardBrand(cardNumber) {
  const digits = String(cardNumber || '').replace(/\D/g, '');
  if (digits.startsWith('4')) {
    return 'visa';
  }
  if (/^5[1-5]/.test(digits)) {
    return 'mastercard';
  }
  if (/^3[47]/.test(digits)) {
    return 'amex';
  }
  return 'card';
}

function getMethodLabel(method) {
  if (method.method_type === 'card') {
    return `${String(method.card_brand || 'card').toUpperCase()} card`;
  }
  if (method.method_type === 'upi') {
    return 'UPI';
  }
  return String(method.method_type || 'Payment').toUpperCase();
}

function getMethodDisplay(method) {
  if (method.method_type === 'card') {
    return `**** **** **** ${method.card_last_four || method.last_four || '----'}`;
  }
  return method.upi_id || method.bank_name || 'Saved payment method';
}

export default function PaymentMethodsPanel({ token, onDefaultMethodChange = () => {} }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [walletBalance, setWalletBalance] = useState(0);
  const [walletTopupAmount, setWalletTopupAmount] = useState('');

  const [paymentType, setPaymentType] = useState('card');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [upiId, setUpiId] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const resetForm = useCallback(() => {
    setPaymentType('card');
    setCardNumber('');
    setExpiryDate('');
    setUpiId('');
    setIsDefault(false);
    setError('');
  }, []);

  const fetchPaymentMethods = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiRequest('/v1/passengers/payment-methods', { token });
      setPaymentMethods(Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : []);
    } catch (err) {
      setError(err.message || 'Failed to load payment methods');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchWalletBalance = useCallback(async () => {
    try {
      const response = await apiRequest('/wallet', { token });
      setWalletBalance(Number(response?.balance || response?.wallet?.balance || 0));
    } catch {
      // Wallet is secondary here; keep payment methods usable if this fails.
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }
    const timer = setTimeout(() => {
      fetchPaymentMethods().catch(() => null);
      fetchWalletBalance().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [token, fetchPaymentMethods, fetchWalletBalance]);

  const addPaymentMethod = useCallback(async () => {
    if (paymentType === 'card') {
      const digits = cardNumber.replace(/\D/g, '');
      if (digits.length < 12 || !expiryDate) {
        setError('Card number and expiry are required');
        return;
      }
    } else if (paymentType === 'upi' && !upiId.trim()) {
      setError('UPI ID is required');
      return;
    }

    try {
      setError('');
      setLoading(true);
      const digits = cardNumber.replace(/\D/g, '');
      const payload =
        paymentType === 'card'
          ? {
              method_type: 'card',
              card_last_four: digits.slice(-4),
              card_brand: inferCardBrand(digits),
              card_expiry: expiryDate,
              is_default: isDefault,
            }
          : {
              method_type: 'upi',
              upi_id: upiId.trim(),
              is_default: isDefault,
            };

      const response = await apiRequest('/v1/passengers/payment-methods', {
        method: 'POST',
        token,
        body: payload,
      });
      const newMethod = response?.data || response;

      if (newMethod) {
        setPaymentMethods((prev) => [newMethod, ...prev.filter((method) => method.id !== newMethod.id)]);
        setShowAddForm(false);
        resetForm();
        if (isDefault) {
          onDefaultMethodChange(newMethod);
        }
      }
      await fetchPaymentMethods();
    } catch (err) {
      setError(err.message || 'Failed to add payment method');
    } finally {
      setLoading(false);
    }
  }, [paymentType, cardNumber, expiryDate, upiId, isDefault, token, onDefaultMethodChange, resetForm, fetchPaymentMethods]);

  const deletePaymentMethod = useCallback(
    async (methodId) => {
      Alert.alert('Delete Payment Method', 'Are you sure?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              await apiRequest(`/v1/passengers/payment-methods/${methodId}`, { method: 'DELETE', token });
              setPaymentMethods((prev) => prev.filter((method) => method.id !== methodId));
            } catch (err) {
              setError(err.message || 'Failed to delete payment method');
            } finally {
              setLoading(false);
            }
          },
        },
      ]);
    },
    [token],
  );

  const topupWallet = useCallback(async () => {
    const amount = Number(walletTopupAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Enter a valid top-up amount');
      return;
    }
    try {
      setLoading(true);
      setError('');
      const response = await apiRequest('/wallet/topup', {
        method: 'POST',
        token,
        body: { amount },
      });
      setWalletBalance(Number(response?.balance || 0));
      setWalletTopupAmount('');
    } catch (err) {
      setError(err.message || 'Failed to top up wallet');
    } finally {
      setLoading(false);
    }
  }, [token, walletTopupAmount]);

  const formatCardNumber = (text) => {
    const cleaned = text.replace(/\D/g, '');
    const formatted =
      cleaned
        .slice(0, 16)
        .match(/\d{1,4}/g)
        ?.join(' ') || cleaned;
    setCardNumber(formatted);
  };

  const formatExpiryDate = (text) => {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length >= 2) {
      setExpiryDate(`${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}`);
    } else {
      setExpiryDate(cleaned);
    }
  };

  if (showAddForm) {
    return (
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.formSection}>
          <Text style={styles.formTitle}>Add Payment Method</Text>

          <Text style={styles.fieldLabel}>Payment Type</Text>
          <View style={styles.typeRow}>
            {['card', 'upi'].map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.typeChip, paymentType === type && styles.typeChipActive]}
                onPress={() => {
                  setPaymentType(type);
                  setError('');
                }}>
                <Text style={[styles.typeChipText, paymentType === type && styles.typeChipTextActive]}>
                  {type === 'card' ? 'Card' : 'UPI'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {!!error && <Text style={styles.errorText}>{error}</Text>}

          {paymentType === 'card' && (
            <>
              <Text style={styles.fieldLabel}>Card Number</Text>
              <VoiceTextInput
                style={styles.input}
                value={cardNumber}
                onChangeText={formatCardNumber}
                placeholder="1234 5678 9012 3456"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="number-pad"
                maxLength={19}
              />

              <Text style={styles.fieldLabel}>Expiry (MM/YY)</Text>
              <VoiceTextInput
                style={styles.input}
                value={expiryDate}
                onChangeText={formatExpiryDate}
                placeholder="MM/YY"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="number-pad"
                maxLength={5}
              />
            </>
          )}

          {paymentType === 'upi' && (
            <>
              <Text style={styles.fieldLabel}>UPI ID</Text>
              <VoiceTextInput
                style={styles.input}
                value={upiId}
                onChangeText={setUpiId}
                placeholder="yourname@upi"
                placeholderTextColor={COLORS.textMuted}
              />
            </>
          )}

          <TouchableOpacity style={styles.checkboxRow} onPress={() => setIsDefault(!isDefault)}>
            <View style={[styles.checkbox, isDefault && styles.checkboxActive]}>
              {isDefault && <Text style={styles.checkmark}>Y</Text>}
            </View>
            <Text style={styles.checkboxLabel}>Set as default payment method</Text>
          </TouchableOpacity>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={() => {
                setShowAddForm(false);
                resetForm();
              }}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.submitButton]}
              onPress={addPaymentMethod}
              disabled={loading}>
              <Text style={styles.submitButtonText}>{loading ? 'Adding...' : 'Add Method'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <TouchableOpacity style={styles.addButton} onPress={() => setShowAddForm(true)} disabled={loading}>
        <Text style={styles.addButtonText}>+ Add Payment Method</Text>
      </TouchableOpacity>

      <View style={[styles.section, { backgroundColor: '#E8F5E9' }]}>
        <Text style={styles.sectionTitle}>Wallet Balance</Text>
        <Text style={styles.walletBalanceText}>INR {walletBalance.toFixed(2)}</Text>
        <View style={styles.inputRow}>
          <VoiceTextInput
            style={styles.topupInput}
            value={walletTopupAmount}
            onChangeText={setWalletTopupAmount}
            placeholder="Amount"
            keyboardType="decimal-pad"
            placeholderTextColor={COLORS.textMuted}
          />
          <TouchableOpacity style={styles.addMoneyButton} onPress={topupWallet} disabled={loading}>
            <Text style={styles.addMoneyButtonText}>Add Money</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loading && paymentMethods.length === 0 ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />
      ) : paymentMethods.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No payment methods added</Text>
          <Text style={styles.emptyStateSubtext}>Add one to get started</Text>
        </View>
      ) : (
        <View style={styles.methodsList}>
          {paymentMethods.map((method) => (
            <View key={method.id} style={[styles.methodCard, method.is_default && styles.methodCardDefault]}>
              <View style={styles.methodHeader}>
                <View style={styles.methodInfo}>
                  <Text style={styles.methodType}>{getMethodLabel(method)}</Text>
                  <Text style={styles.methodDisplay}>{getMethodDisplay(method)}</Text>
                </View>
                {method.is_default && (
                  <View style={styles.defaultBadge}>
                    <Text style={styles.defaultBadgeText}>Default</Text>
                  </View>
                )}
              </View>

              {method.method_type === 'card' && method.card_expiry && (
                <Text style={styles.methodExpiry}>Expires: {method.card_expiry}</Text>
              )}

              <View style={styles.methodActions}>
                <TouchableOpacity
                  style={[styles.actionButton, styles.deleteButton]}
                  onPress={() => deletePaymentMethod(method.id)}>
                  <Text style={styles.deleteButtonText}>Delete</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  addButton: {
    margin: 12,
    padding: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    alignItems: 'center',
    ...SHADOWS.soft,
  },
  addButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  section: {
    margin: 12,
    padding: 16,
    borderRadius: 10,
    ...SHADOWS.soft,
  },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textMain, marginBottom: 8 },
  walletBalanceText: {
    fontSize: 28,
    fontWeight: '800',
    color: '#2E7D32',
    marginBottom: 12,
  },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  topupInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2E7D32',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: COLORS.textMain,
    backgroundColor: '#FFFFFF',
  },
  addMoneyButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(46, 125, 50, 0.1)',
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2E7D32',
  },
  addMoneyButtonText: { color: '#2E7D32', fontWeight: '700', fontSize: 12 },
  errorText: { color: '#D32F2F', fontSize: 12, margin: 12 },
  loader: { marginVertical: 40 },
  emptyState: { alignItems: 'center', marginVertical: 40 },
  emptyStateText: { fontSize: 14, fontWeight: '700', color: COLORS.textMain },
  emptyStateSubtext: { fontSize: 12, color: COLORS.textMuted, marginTop: 6 },
  methodsList: { padding: 12 },
  methodCard: {
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    ...SHADOWS.soft,
  },
  methodCardDefault: { borderLeftColor: '#4CAF50', backgroundColor: '#F1F8E9' },
  methodHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  methodInfo: { flex: 1 },
  methodType: { fontSize: 12, fontWeight: '700', color: COLORS.textMain },
  methodDisplay: { fontSize: 14, fontWeight: '600', color: COLORS.primary, marginTop: 4 },
  defaultBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  defaultBadgeText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  methodExpiry: { fontSize: 11, color: COLORS.textMuted, marginBottom: 10 },
  methodActions: { flexDirection: 'row', gap: 8 },
  actionButton: {
    flex: 1,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 4,
    alignItems: 'center',
  },
  deleteButton: { borderColor: '#D32F2F' },
  deleteButtonText: { color: '#D32F2F', fontWeight: '600', fontSize: 11 },
  formSection: {
    padding: 16,
    margin: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    ...SHADOWS.soft,
  },
  formTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textMain, marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMain, marginBottom: 6 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  typeChip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    alignItems: 'center',
  },
  typeChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  typeChipText: { fontSize: 11, color: COLORS.textMain, fontWeight: '600', textAlign: 'center' },
  typeChipTextActive: { color: '#FFFFFF' },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 13,
    color: COLORS.textMain,
    marginBottom: 12,
  },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 4,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkmark: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  checkboxLabel: { fontSize: 12, color: COLORS.textMain, fontWeight: '500' },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  button: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  cancelButton: { backgroundColor: '#F5F5F5', borderWidth: 1, borderColor: COLORS.border },
  submitButton: { backgroundColor: COLORS.primary },
  cancelButtonText: { color: COLORS.textMain, fontWeight: '700', fontSize: 13 },
  submitButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
});
