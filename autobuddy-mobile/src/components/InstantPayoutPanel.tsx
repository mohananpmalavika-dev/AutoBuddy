import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  FlatList,
} from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';
import { formatToIST } from '../utils/time';

type PayoutStatus = 'completed' | 'processing' | 'failed' | string;

type PayoutHistoryItem = {
  id: string;
  amount: number;
  method: string;
  status: PayoutStatus;
  date: string;
  time: string;
  reference: string;
  eta?: string;
};

type PaymentMethod = {
  id: string;
  type: 'bank' | 'upi' | 'card' | 'wallet' | string;
  icon: string;
  details: string;
  label: string;
  isDefault: boolean;
};

type InstantPayoutPanelProps = {
  driverId: string;
  currentBalance?: number;
  disabled?: boolean;
};

/**
 * InstantPayoutPanel - On-demand withdrawal system for drivers
 * Request instant payouts from current balance
 * Multiple payment methods (bank transfer, wallet, cards)
 * Track payout history and status
 */

export default function InstantPayoutPanel({
  driverId,
  currentBalance = 2450,
  disabled = false,
}: InstantPayoutPanelProps) {
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState(currentBalance);
  const [payoutHistory, setPayoutHistory] = useState<PayoutHistoryItem[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [payoutRequest, setPayoutRequest] = useState({
    amount: '',
    method: null as string | null,
  });

  const [newPaymentMethod, setNewPaymentMethod] = useState({
    type: 'bank' as PaymentMethod['type'],
    details: '',
  });

  const loadPayoutData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [balanceResponse, historyResponse, methodsResponse] = await Promise.all([
        apiRequest('/driver/payouts/balance', { query: { driver_id: driverId } }),
        apiRequest('/driver/payouts/history', { query: { driver_id: driverId } }),
        apiRequest('/driver/payouts/methods', { query: { driver_id: driverId } }),
      ]);

      const apiBalance = Number(balanceResponse?.balance ?? currentBalance);
      const apiHistory = Array.isArray(historyResponse?.history)
        ? historyResponse.history
        : Array.isArray(historyResponse?.data?.history)
          ? historyResponse.data.history
          : [];
      const apiMethods = Array.isArray(methodsResponse?.methods)
        ? methodsResponse.methods
        : Array.isArray(methodsResponse?.data?.methods)
          ? methodsResponse.data.methods
          : [];

      setBalance(apiBalance);
      if (apiHistory.length > 0) {
        setPayoutHistory(apiHistory);
      } else {
        setPayoutHistory([
          {
            id: 'payout_1',
            amount: 1000,
            method: 'Bank Transfer',
            status: 'completed',
            date: '2024-01-15',
            time: '3:45 PM',
            reference: 'PAY123456',
          },
          {
            id: 'payout_2',
            amount: 500,
            method: 'UPI',
            status: 'completed',
            date: '2024-01-13',
            time: '11:20 AM',
            reference: 'PAY123455',
          },
          {
            id: 'payout_3',
            amount: 2000,
            method: 'Bank Transfer',
            status: 'processing',
            date: '2024-01-16',
            time: 'Initiated now',
            reference: 'PAY123457',
            eta: '2-4 hours',
          },
        ]);
      }

      if (apiMethods.length > 0) {
        setPaymentMethods(apiMethods);
      } else {
        setPaymentMethods([
          {
            id: 'method_1',
            type: 'bank',
            icon: '🏦',
            details: 'HDFC • 1234',
            label: 'HDFC - **** 1234',
            isDefault: true,
          },
          {
            id: 'method_2',
            type: 'upi',
            icon: '📱',
            details: 'name@okhdfcbank',
            label: 'name@okhdfcbank',
            isDefault: false,
          },
          {
            id: 'method_3',
            type: 'wallet',
            icon: '💳',
            details: 'AutoBuddy Wallet',
            label: 'AutoBuddy Wallet',
            isDefault: false,
          },
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payout data');
      setBalance(currentBalance);
      setPayoutHistory([
        {
          id: 'payout_1',
          amount: 1000,
          method: 'Bank Transfer',
          status: 'completed',
          date: '2024-01-15',
          time: '3:45 PM',
          reference: 'PAY123456',
        },
        {
          id: 'payout_2',
          amount: 500,
          method: 'UPI',
          status: 'completed',
          date: '2024-01-13',
          time: '11:20 AM',
          reference: 'PAY123455',
        },
        {
          id: 'payout_3',
          amount: 2000,
          method: 'Bank Transfer',
          status: 'processing',
          date: '2024-01-16',
          time: 'Initiated now',
          reference: 'PAY123457',
          eta: '2-4 hours',
        },
      ]);
      setPaymentMethods([
        {
          id: 'method_1',
          type: 'bank',
          icon: '🏦',
          details: 'HDFC • 1234',
          label: 'HDFC - **** 1234',
          isDefault: true,
        },
        {
          id: 'method_2',
          type: 'upi',
          icon: '📱',
          details: 'name@okhdfcbank',
          label: 'name@okhdfcbank',
          isDefault: false,
        },
        {
          id: 'method_3',
          type: 'wallet',
          icon: '💳',
          details: 'AutoBuddy Wallet',
          label: 'AutoBuddy Wallet',
          isDefault: false,
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [currentBalance, driverId]);

  useEffect(() => {
    void Promise.resolve().then(loadPayoutData);
  }, [loadPayoutData]);

  const handleRequestPayout = async () => {
    if (!payoutRequest.amount || !payoutRequest.method) {
      Alert.alert('Missing Info', 'Please select amount and payment method');
      return;
    }

    const amount = parseFloat(payoutRequest.amount);
    if (amount <= 0 || amount > balance) {
      Alert.alert('Invalid Amount', `Please enter amount between ₹1 and ₹${balance}`);
      return;
    }

    setLoading(true);
    try {
      const payoutResponse = await apiRequest('/driver/payouts/request', {
        method: 'POST',
        body: {
          driver_id: driverId,
          amount,
          payment_method_id: payoutRequest.method,
        },
      });

      const method = paymentMethods.find((m) => m.id === payoutRequest.method);
      if (!method) {
        Alert.alert('Missing Info', 'Please select a valid payment method');
        return;
      }

      const newPayout =
        payoutResponse?.payout ||
        payoutResponse?.data?.payout ||
        {
          id: `payout_${Date.now()}`,
          amount: amount,
          method: method.label,
          status: 'processing',
          date: formatToIST(new Date(), { dateStyle: 'short' }),
          time: 'Initiated now',
          reference: `PAY${Date.now()}`,
          eta: '2-4 hours',
        };
      setPayoutHistory((prev) => [newPayout, ...prev]);
      setBalance((prev) => Math.max(0, prev - amount));
      setPayoutRequest({ amount: '', method: null });
      setShowPayoutModal(false);

      Alert.alert(
        '✅ Payout Requested',
        `₹${amount} will be transferred to ${method.label} within 2-4 hours`
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to request payout';
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleAddPaymentMethod = async () => {
    if (!newPaymentMethod.details) {
      Alert.alert('Missing Info', 'Please enter payment details');
      return;
    }

    setLoading(true);
    try {
      const paymentResponse = await apiRequest('/driver/payouts/methods', {
        method: 'POST',
        body: {
          driver_id: driverId,
          ...newPaymentMethod,
        },
      });

      const createdMethod =
        paymentResponse?.method || paymentResponse?.data?.method || {
          id: `method_${Date.now()}`,
          type: newPaymentMethod.type,
          icon: ['🏦', '📱', '💳', '💰'][
            Object.keys({ bank: '🏦', upi: '📱', card: '💳', wallet: '💰' }).indexOf(newPaymentMethod.type)
          ],
          details: newPaymentMethod.details,
          label: `${newPaymentMethod.type === 'bank' ? '🏦 Bank Account' : newPaymentMethod.type === 'upi' ? '📱 UPI' : newPaymentMethod.type === 'card' ? '💳 Debit Card' : '💰 Wallet'} - ${newPaymentMethod.details}`,
          isDefault: paymentMethods.length === 0,
        };

      setPaymentMethods([...paymentMethods, createdMethod]);
      setNewPaymentMethod({ type: 'bank', details: '' });
      setShowAddPayment(false);

      Alert.alert('✅ Payment Method Added', 'You can now use this for payouts');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to add payment method';
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: PayoutStatus) => {
    switch (status) {
      case 'completed':
        return '#34C759';
      case 'processing':
        return '#FF9500';
      case 'failed':
        return '#FF3B30';
      default:
        return COLORS.textSecondary;
    }
  };

  const formatAmount = (amt: number | string) => {
    return parseFloat(String(amt || 0)).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  if (loading && payoutHistory.length === 0) {
    return (
      <View style={[styles.container, SHADOWS.card]}>
        <Text style={styles.title}>💰 Instant Payouts</Text>
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 20 }} />
      </View>
    );
  }

  return (
    <>
      <View style={[styles.container, SHADOWS.card]}>
        <Text style={styles.title}>💰 Instant Payouts</Text>

        {/* Available Balance */}
        <View style={styles.balanceBox}>
          <Text style={styles.balanceLabel}>Available Balance</Text>
          <Text style={styles.balanceAmount}>₹{formatAmount(balance)}</Text>
          <View style={styles.balanceInfo}>
            <Text style={styles.balanceNote}>
              💡 Withdraw in 2-4 hours to your preferred account
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowPayoutModal(true)}
            disabled={disabled || balance === 0}
          >
            <Text style={styles.actionButtonEmoji}>💸</Text>
            <Text style={styles.actionButtonText}>Request Payout</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => setShowAddPayment(true)}
            disabled={disabled}
          >
            <Text style={styles.actionButtonEmoji}>➕</Text>
            <Text style={styles.actionButtonText}>Add Method</Text>
          </TouchableOpacity>
        </View>

        {/* Payment Methods */}
        {paymentMethods.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📌 Payment Methods</Text>
            {paymentMethods.map((method) => (
              <TouchableOpacity
                key={method.id}
                style={[
                  styles.methodItem,
                  method.isDefault && styles.methodItemDefault,
                ]}
                onPress={() => setSelectedMethod(method.id)}
              >
                <View style={styles.methodInfo}>
                  <Text style={styles.methodIcon}>{method.icon}</Text>
                  <View style={styles.methodDetails}>
                    <Text style={styles.methodLabel}>{method.label}</Text>
                    {method.isDefault && (
                      <Text style={styles.defaultBadge}>Default</Text>
                    )}
                  </View>
                </View>
                {selectedMethod === method.id && (
                  <Text style={styles.selectedCheckmark}>✓</Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Payout History */}
        {payoutHistory.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>📋 Recent Payouts</Text>
            <FlatList
              data={payoutHistory}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={styles.historyItem}>
                  <View style={styles.historyLeft}>
                    <Text style={styles.historyAmount}>₹{formatAmount(item.amount)}</Text>
                    <Text style={styles.historyMethod}>{item.method}</Text>
                  </View>

                  <View style={styles.historyRight}>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor: `${getStatusColor(item.status)}20`,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          { color: getStatusColor(item.status) },
                        ]}
                      >
                        {item.status.charAt(0).toUpperCase() +
                          item.status.slice(1)}
                      </Text>
                    </View>
                    <Text style={styles.historyDate}>{item.date}</Text>
                  </View>
                </View>
              )}
              scrollEnabled={false}
            />
          </View>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
      </View>

      {/* Payout Request Modal */}
      <Modal visible={showPayoutModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Request Instant Payout</Text>
              <TouchableOpacity onPress={() => setShowPayoutModal(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Amount Input */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Amount (₹)</Text>
              <View style={styles.amountInputContainer}>
                <Text style={styles.amountPrefix}>₹</Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder={`Max: ₹${formatAmount(balance)}`}
                  value={payoutRequest.amount}
                  onChangeText={(text) =>
                    setPayoutRequest({ ...payoutRequest, amount: text })
                  }
                  keyboardType="decimal-pad"
                  editable={!loading}
                />
              </View>
              <Text style={styles.helperText}>Available: ₹{formatAmount(balance)}</Text>
            </View>

            {/* Quick Amount Buttons */}
            <View style={styles.quickAmountRow}>
              {[Math.min(500, balance), Math.min(1000, balance), balance].map(
                (amt) =>
                  amt > 0 && (
                    <TouchableOpacity
                      key={amt}
                      style={styles.quickAmountButton}
                      onPress={() =>
                        setPayoutRequest({
                          ...payoutRequest,
                          amount: amt.toString(),
                        })
                      }
                    >
                      <Text style={styles.quickAmountText}>₹{formatAmount(amt)}</Text>
                    </TouchableOpacity>
                  )
              )}
            </View>

            {/* Payment Method Selection */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Select Payment Method</Text>
              {paymentMethods.map((method) => (
                <TouchableOpacity
                  key={method.id}
                  style={[
                    styles.methodSelectItem,
                    payoutRequest.method === method.id &&
                      styles.methodSelectItemActive,
                  ]}
                  onPress={() =>
                    setPayoutRequest({ ...payoutRequest, method: method.id })
                  }
                >
                  <View style={styles.methodRadio}>
                    {payoutRequest.method === method.id && (
                      <View style={styles.methodRadioDot} />
                    )}
                  </View>
                  <View>
                    <Text style={styles.methodSelectLabel}>{method.label}</Text>
                    <Text style={styles.methodSelectTime}>
                      Usually 2-4 hours
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* Submit Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                loading && styles.submitButtonDisabled,
              ]}
              onPress={handleRequestPayout}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>Request Payout</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Add Payment Method Modal */}
      <Modal visible={showAddPayment} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Payment Method</Text>
              <TouchableOpacity onPress={() => setShowAddPayment(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Payment Type */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Payment Method Type</Text>
              {['bank', 'upi', 'card', 'wallet'].map((type) => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.typeItem,
                    newPaymentMethod.type === type &&
                      styles.typeItemActive,
                  ]}
                  onPress={() =>
                    setNewPaymentMethod({
                      ...newPaymentMethod,
                      type,
                    })
                  }
                >
                  <View style={styles.typeRadio}>
                    {newPaymentMethod.type === type && (
                      <View style={styles.typeRadioDot} />
                    )}
                  </View>
                  <Text style={styles.typeLabel}>
                    {type === 'bank'
                      ? '🏦 Bank Account'
                      : type === 'upi'
                      ? '📱 UPI ID'
                      : type === 'card'
                      ? '💳 Debit Card'
                      : '💰 Digital Wallet'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Details Input */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>
                {newPaymentMethod.type === 'bank'
                  ? 'Bank Account Number'
                  : newPaymentMethod.type === 'upi'
                  ? 'UPI ID'
                  : newPaymentMethod.type === 'card'
                  ? 'Card Number'
                  : 'Wallet ID'}
              </Text>
              <TextInput
                style={styles.detailsInput}
                placeholder="Enter details"
                value={newPaymentMethod.details}
                onChangeText={(text) =>
                  setNewPaymentMethod({ ...newPaymentMethod, details: text })
                }
                editable={!loading}
              />
            </View>

            {/* Add Button */}
            <TouchableOpacity
              style={[
                styles.submitButton,
                loading && styles.submitButtonDisabled,
              ]}
              onPress={handleAddPaymentMethod}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>Add Payment Method</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 16,
  },
  balanceBox: {
    backgroundColor: `${COLORS.primary}10`,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  balanceLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  balanceAmount: {
    fontSize: 28,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 10,
  },
  balanceInfo: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 10,
  },
  balanceNote: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  actionButton: {
    flex: 1,
    backgroundColor: '#F0F0F0',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 6,
  },
  actionButtonEmoji: {
    fontSize: 18,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  section: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  methodItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    marginBottom: 8,
  },
  methodItemDefault: {
    backgroundColor: `${COLORS.primary}10`,
    borderWidth: 1,
    borderColor: COLORS.primary,
  },
  methodInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  methodIcon: {
    fontSize: 18,
  },
  methodDetails: {
    flex: 1,
  },
  methodLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 2,
  },
  defaultBadge: {
    fontSize: 9,
    color: COLORS.primary,
    fontWeight: '600',
  },
  selectedCheckmark: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '700',
  },
  historyItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    marginBottom: 8,
  },
  historyLeft: {
    flex: 1,
  },
  historyAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 2,
  },
  historyMethod: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  historyRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
  },
  historyDate: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
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
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  closeButton: {
    fontSize: 20,
    color: COLORS.textSecondary,
  },
  formGroup: {
    marginBottom: 20,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 10,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  amountPrefix: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
    marginRight: 4,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
  },
  helperText: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  quickAmountRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  quickAmountButton: {
    flex: 1,
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  quickAmountText: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.text,
  },
  methodSelectItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  methodSelectItemActive: {
    backgroundColor: `${COLORS.primary}10`,
    borderColor: COLORS.primary,
  },
  methodRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: COLORS.primary,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  methodSelectLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  methodSelectTime: {
    fontSize: 10,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  typeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  typeItemActive: {
    backgroundColor: `${COLORS.primary}10`,
    borderColor: COLORS.primary,
  },
  typeRadio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: COLORS.primary,
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeRadioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.primary,
  },
  typeLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  detailsInput: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  submitButtonDisabled: {
    opacity: 0.5,
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  errorContainer: {
    backgroundColor: '#FFE5E5',
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    color: '#C41C00',
    fontSize: 12,
  },
});
