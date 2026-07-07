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
  TextInput,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useWalletAndPayout, WalletTransaction, Payout } from '../hooks/useWalletAndPayout';

type DateLike = string | number | Date | null | undefined;

const formatDateSafely = (date: DateLike): string => {
  if (!date) {return 'Unknown';}
  const dateObj = new Date(date);
  return !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : 'Unknown';
};

const formatTimeSafely = (date: DateLike): string => {
  if (!date) {return 'Unknown';}
  const dateObj = new Date(date);
  return !isNaN(dateObj.getTime()) ? dateObj.toLocaleTimeString() : 'Unknown';
};

interface WalletScreenProps {
  token: string | null;
  userId: string;
  userType: 'passenger' | 'driver';
}

export const WalletScreen: React.FC<WalletScreenProps> = ({
  token,
  userId,
  userType,
}) => {
  const {
    balance,
    transactions,
    payouts,
    loading,
    error,
    fetchBalance,
    fetchTransactions,
    fetchPayouts,
    addMoneyToWallet,
    requestPayout,
    instantPayout,
    setAutoRecharge,
    getAutoRechargeSettings,
    getPayoutAccounts,
    addPayoutAccount,
    calculatePayoutFee,
  } = useWalletAndPayout(token, userId);

  const [refreshing, setRefreshing] = useState(false);
  const [showAddMoney, setShowAddMoney] = useState(false);
  const [showPayout, setShowPayout] = useState(false);
  const [showAutoRecharge, setShowAutoRecharge] = useState(false);
  const [topupAmount, setTopupAmount] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [payoutFee, setPayoutFee] = useState(0);
  const [autoRechargeSettings, setAutoRechargeSettings] = useState<any>(null);
  const [payoutAccounts, setPayoutAccounts] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await fetchBalance();
    await fetchTransactions();
    if (userType === 'driver') {
      await fetchPayouts();
      const settings = await getAutoRechargeSettings();
      setAutoRechargeSettings(settings);
      const accounts = await getPayoutAccounts();
      setPayoutAccounts(accounts);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleAddMoney = async () => {
    if (!topupAmount || isNaN(Number(topupAmount))) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    const success = await addMoneyToWallet(Number(topupAmount), 'card');
    if (success) {
      Alert.alert('Success', `₹${topupAmount} added to wallet`);
      setTopupAmount('');
      setShowAddMoney(false);
    }
  };

  const handleRequestPayout = async () => {
    if (!payoutAmount || isNaN(Number(payoutAmount))) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    if (!payoutAccounts.length) {
      Alert.alert('Error', 'Please add a payout account first');
      return;
    }

    const amount = Number(payoutAmount);
    if (balance && amount > balance.balance) {
      Alert.alert('Error', 'Insufficient balance');
      return;
    }

    const payout = await requestPayout(amount, payoutAccounts?.[0]?.id);
    if (payout) {
      Alert.alert('Success', 'Payout request submitted');
      setPayoutAmount('');
      setShowPayout(false);
    }
  };

  const handleInstantPayout = async () => {
    if (!payoutAmount || isNaN(Number(payoutAmount))) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    const amount = Number(payoutAmount);
    if (balance && amount > balance.balance) {
      Alert.alert('Error', 'Insufficient balance');
      return;
    }

    const payout = await instantPayout(amount);
    if (payout) {
      Alert.alert('Success', 'Instant payout processing');
      setPayoutAmount('');
      setShowPayout(false);
    }
  };

  const calculateFeeAndUpdate = async (amount: string) => {
    if (amount && !isNaN(Number(amount))) {
      const fee = await calculatePayoutFee(Number(amount));
      setPayoutFee(fee);
    }
  };

  const handlePayoutAmountChange = (value: string) => {
    setPayoutAmount(value);
    calculateFeeAndUpdate(value);
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Balance Card */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Total Balance</Text>
        <Text style={styles.balanceAmount}>
          ₹{balance?.balance.toFixed(2) || '0.00'}
        </Text>
        {balance && (
          <Text style={styles.balanceSubtext}>
            Last updated: {formatTimeSafely(balance.lastUpdated)}
          </Text>
        )}

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <Pressable
            style={styles.actionButton}
            onPress={() => setShowAddMoney(true)}
          >
            <MaterialIcons name="add-circle" size={20} color="#fff" />
            <Text style={styles.actionButtonText}>Add Money</Text>
          </Pressable>

          {userType === 'driver' && (
            <>
              <Pressable
                style={[styles.actionButton, styles.payoutButton]}
                onPress={() => setShowPayout(true)}
              >
                <MaterialIcons name="send" size={20} color="#fff" />
                <Text style={styles.actionButtonText}>Request Payout</Text>
              </Pressable>

              <Pressable
                style={[styles.actionButton, styles.instantButton]}
                onPress={() => {
                  Alert.alert(
                    'Instant Payout',
                    'Fee: 2% of amount. Continue?',
                    [
                      { text: 'Cancel' },
                      {
                        text: 'Proceed',
                        onPress: () => setShowPayout(true),
                      },
                    ]
                  );
                }}
              >
                <MaterialIcons name="flash-on" size={20} color="#fff" />
                <Text style={styles.actionButtonText}>Instant Payout</Text>
              </Pressable>
            </>
          )}
        </View>
      </View>

      {/* Auto Recharge (Driver Only) */}
      {userType === 'driver' && autoRechargeSettings && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Auto Recharge</Text>
            <Pressable onPress={() => setShowAutoRecharge(true)}>
              <MaterialIcons name="edit" size={20} color="#2196F3" />
            </Pressable>
          </View>

          <View style={styles.settingCard}>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Status</Text>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: autoRechargeSettings?.enabled ? '#4CAF50' : '#999',
                  },
                ]}
              >
                <Text style={styles.statusBadgeText}>
                  {autoRechargeSettings?.enabled ? 'Enabled' : 'Disabled'}
                </Text>
              </View>
            </View>

            {autoRechargeSettings?.enabled && (
              <>
                <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>Recharge Amount</Text>
                  <Text style={styles.settingValue}>
                    ₹{autoRechargeSettings?.amount ?? 1000}
                  </Text>
                </View>
                <View style={styles.settingRow}>
                  <Text style={styles.settingLabel}>Threshold</Text>
                  <Text style={styles.settingValue}>
                    ₹{autoRechargeSettings?.threshold ?? 500}
                  </Text>
                </View>
              </>
            )}
          </View>
        </View>
      )}

      {/* Recent Transactions */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Transaction History</Text>
        {loading && transactions.length === 0 ? (
          <ActivityIndicator size="large" color="#2196F3" style={{ marginVertical: 20 }} />
        ) : transactions.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="receipt" size={40} color="#ddd" />
            <Text style={styles.emptyText}>No transactions yet</Text>
          </View>
        ) : (
          <View style={styles.transactionList}>
            {transactions.map((transaction) => (
              <TransactionCard key={transaction.id} transaction={transaction} />
            ))}
          </View>
        )}
      </View>

      {/* Recent Payouts (Driver Only) */}
      {userType === 'driver' && payouts.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Payouts</Text>
          <View style={styles.payoutList}>
            {payouts.slice(0, 5).map((payout) => (
              <PayoutCard key={payout.id} payout={payout} />
            ))}
          </View>
        </View>
      )}

      {/* Error Banner */}
      {error && (
        <View style={styles.errorBanner}>
          <MaterialIcons name="error-outline" size={18} color="#F44336" />
          <Text style={styles.errorText}>{error.message}</Text>
        </View>
      )}

      {/* Add Money Modal */}
      <Modal visible={showAddMoney} transparent animationType="slide">
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Money to Wallet</Text>
              <Pressable onPress={() => setShowAddMoney(false)}>
                <MaterialIcons name="close" size={24} color="#000" />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Amount</Text>
              <View style={styles.amountInputContainer}>
                <Text style={styles.currencySymbol}>₹</Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder="Enter amount"
                  value={topupAmount}
                  onChangeText={setTopupAmount}
                  keyboardType="decimal-pad"
                  placeholderTextColor="#999"
                />
              </View>

              <View style={styles.quickAmounts}>
                {[500, 1000, 2000, 5000].map((amount) => (
                  <Pressable
                    key={amount}
                    style={styles.quickAmountButton}
                    onPress={() => setTopupAmount(amount.toString())}
                  >
                    <Text style={styles.quickAmountText}>₹{amount}</Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                style={styles.submitButton}
                onPress={handleAddMoney}
                disabled={!topupAmount}
              >
                <MaterialIcons name="payment" size={18} color="#fff" />
                <Text style={styles.submitButtonText}>Add ₹{topupAmount || '0'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Payout Modal */}
      <Modal visible={showPayout} transparent animationType="slide">
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Request Payout</Text>
              <Pressable onPress={() => setShowPayout(false)}>
                <MaterialIcons name="close" size={24} color="#000" />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Amount</Text>
              <View style={styles.amountInputContainer}>
                <Text style={styles.currencySymbol}>₹</Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder="Enter amount"
                  value={payoutAmount}
                  onChangeText={handlePayoutAmountChange}
                  keyboardType="decimal-pad"
                  placeholderTextColor="#999"
                />
              </View>

              {payoutFee > 0 && (
                <View style={styles.feeBreakdown}>
                  <View style={styles.feeRow}>
                    <Text style={styles.feeLabel}>Amount</Text>
                    <Text style={styles.feeValue}>₹{payoutAmount}</Text>
                  </View>
                  <View style={styles.feeRow}>
                    <Text style={styles.feeLabel}>Processing Fee</Text>
                    <Text style={styles.feeValue}>₹{payoutFee.toFixed(2)}</Text>
                  </View>
                  <View style={[styles.feeRow, styles.totalRow]}>
                    <Text style={styles.feeLabel}>Total</Text>
                    <Text style={styles.totalValue}>
                      ₹{(Number(payoutAmount) + payoutFee).toFixed(2)}
                    </Text>
                  </View>
                </View>
              )}

              <View style={styles.payoutActions}>
                <Pressable
                  style={styles.submitButton}
                  onPress={handleRequestPayout}
                  disabled={!payoutAmount}
                >
                  <MaterialIcons name="send" size={18} color="#fff" />
                  <Text style={styles.submitButtonText}>Request Payout</Text>
                </Pressable>

                <Pressable
                  style={[styles.submitButton, styles.instantPayoutButton]}
                  onPress={handleInstantPayout}
                  disabled={!payoutAmount}
                >
                  <MaterialIcons name="flash-on" size={18} color="#fff" />
                  <Text style={styles.submitButtonText}>Instant Payout</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Auto Recharge Modal */}
      <Modal visible={showAutoRecharge} transparent animationType="slide">
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Auto Recharge Settings</Text>
              <Pressable onPress={() => setShowAutoRecharge(false)}>
                <MaterialIcons name="close" size={24} color="#000" />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.infoText}>
                Automatically top up your wallet when balance falls below a threshold
              </Text>

              <Pressable
                style={styles.toggleButton}
                onPress={async () => {
                  const newEnabled = !autoRechargeSettings?.enabled;
                  await setAutoRecharge(newEnabled);
                  setAutoRechargeSettings({ ...autoRechargeSettings, enabled: newEnabled });
                }}
              >
                <MaterialIcons
                  name={autoRechargeSettings?.enabled ? 'toggle-on' : 'toggle-off'}
                  size={32}
                  color={autoRechargeSettings?.enabled ? '#4CAF50' : '#999'}
                />
                <Text style={styles.toggleLabel}>
                  Auto Recharge {autoRechargeSettings?.enabled ? 'Enabled' : 'Disabled'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const TransactionCard: React.FC<{ transaction: WalletTransaction }> = ({ transaction }) => {
  const isCredit = transaction.type === 'credit';

  return (
    <View style={styles.transactionCard}>
      <View
        style={[
          styles.transactionIcon,
          { backgroundColor: isCredit ? '#E8F5E9' : '#FFEBEE' },
        ]}
      >
        <MaterialIcons
          name={isCredit ? 'add-circle' : 'remove-circle'}
          size={20}
          color={isCredit ? '#4CAF50' : '#F44336'}
        />
      </View>

      <View style={styles.transactionInfo}>
        <Text style={styles.transactionDesc}>{transaction.description}</Text>
        <Text style={styles.transactionDate}>
          {formatDateSafely(transaction.createdAt)}
        </Text>
      </View>

      <View style={styles.transactionAmount}>
        <Text
          style={[
            styles.amount,
            { color: isCredit ? '#4CAF50' : '#F44336' },
          ]}
        >
          {isCredit ? '+' : '-'}₹{transaction.amount.toFixed(2)}
        </Text>
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor:
                transaction.status === 'completed'
                  ? '#4CAF50'
                  : transaction.status === 'pending'
                  ? '#FFC107'
                  : '#F44336',
            },
          ]}
        />
      </View>
    </View>
  );
};

const PayoutCard: React.FC<{ payout: Payout }> = ({ payout }) => {
  const statusColors = {
    pending: '#FFC107',
    processing: '#2196F3',
    completed: '#4CAF50',
    failed: '#F44336',
  };

  return (
    <View style={styles.payoutCard}>
      <View style={styles.payoutHeader}>
        <Text style={styles.payoutAmount}>₹{payout.amount.toFixed(2)}</Text>
        <View
          style={[
            styles.payoutStatus,
            { backgroundColor: statusColors[payout.status] },
          ]}
        >
          <Text style={styles.payoutStatusText}>{payout.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.payoutDate}>
        {formatDateSafely(payout.requestedAt)}
      </Text>
      {payout.failureReason && (
        <Text style={styles.failureReason}>{payout.failureReason}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  balanceCard: {
    marginHorizontal: 16,
    marginVertical: 16,
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: '#2196F3',
    borderRadius: 12,
  },
  balanceLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: '500',
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: '700',
    color: '#fff',
    marginVertical: 8,
  },
  balanceSubtext: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 6,
  },
  payoutButton: {
    backgroundColor: '#FF9800',
  },
  instantButton: {
    backgroundColor: '#4CAF50',
  },
  actionButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },
  settingCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    padding: 12,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  settingLabel: {
    fontSize: 12,
    color: '#666',
  },
  settingValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 13,
    color: '#999',
    marginTop: 8,
  },
  transactionList: {
    gap: 8,
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 6,
  },
  transactionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionInfo: {
    flex: 1,
  },
  transactionDesc: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  transactionDate: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  transactionAmount: {
    alignItems: 'flex-end',
    gap: 4,
  },
  amount: {
    fontSize: 12,
    fontWeight: '700',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  payoutList: {
    gap: 8,
  },
  payoutCard: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 6,
    borderLeftWidth: 4,
    borderLeftColor: '#2196F3',
  },
  payoutHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  payoutAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
  payoutStatus: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 3,
  },
  payoutStatusText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
  payoutDate: {
    fontSize: 11,
    color: '#666',
  },
  failureReason: {
    fontSize: 10,
    color: '#F44336',
    marginTop: 4,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFF3CD',
    borderRadius: 6,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: '#856404',
  },
  modal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
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
    paddingVertical: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
  },
  infoText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 16,
    lineHeight: 16,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  currencySymbol: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2196F3',
    marginRight: 4,
  },
  amountInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#000',
  },
  quickAmounts: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  quickAmountButton: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
    alignItems: 'center',
  },
  quickAmountText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2196F3',
  },
  feeBreakdown: {
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    padding: 12,
    marginBottom: 12,
  },
  feeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    marginBottom: 0,
    paddingTop: 8,
  },
  feeLabel: {
    fontSize: 12,
    color: '#666',
  },
  feeValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  totalValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2196F3',
  },
  payoutActions: {
    gap: 8,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#2196F3',
    borderRadius: 6,
  },
  instantPayoutButton: {
    backgroundColor: '#FF9800',
  },
  submitButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 12,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
});

export default WalletScreen;
