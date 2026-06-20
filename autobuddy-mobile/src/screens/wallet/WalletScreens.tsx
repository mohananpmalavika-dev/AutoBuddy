import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  TextInput,
  Switch
} from 'react-native';
import { useWalletManagement } from '../hooks/useWalletManagement';

// ==================== WALLET BALANCE SCREEN ====================

export const WalletBalanceScreen: React.FC<{ userId: string; authToken: string }> = ({ userId, authToken }) => {
  const { balance, summary, isLoading, fetchBalance, formatCurrency } = useWalletManagement(userId, authToken);

  useEffect(() => {
    fetchBalance();
    const interval = setInterval(fetchBalance, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [fetchBalance]);

  if (isLoading && !balance) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  const balancePercentage = balance ? (balance.current_balance / balance.max_balance) * 100 : 0;

  return (
    <ScrollView style={styles.container}>
      {/* Balance Card */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Wallet Balance</Text>
        <Text style={styles.balanceAmount}>{balance && formatCurrency(balance.current_balance)}</Text>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { width: `${Math.min(balancePercentage, 100)}%` }]} />
        </View>
        <Text style={styles.maxBalanceText}>
          {balance && `Max: ${formatCurrency(balance.max_balance)}`}
        </Text>
      </View>

      {/* Quick Stats */}
      {summary && (
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total Topups</Text>
            <Text style={styles.statValue}>{formatCurrency(summary.total_topups)}</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Total Spent</Text>
            <Text style={styles.statValue}>{formatCurrency(summary.total_spent)}</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Cashback</Text>
            <Text style={styles.statValue}>{formatCurrency(summary.total_cashback_received)}</Text>
          </View>

          <View style={styles.statCard}>
            <Text style={styles.statLabel}>This Month</Text>
            <Text style={styles.statValue}>{formatCurrency(summary.this_month_spent)}</Text>
          </View>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity style={[styles.button, styles.buttonPrimary]}>
          <Text style={styles.buttonText}>Add Money</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.button, styles.buttonSecondary]}>
          <Text style={styles.buttonTextSecondary}>Auto-Recharge</Text>
        </TouchableOpacity>
      </View>

      {/* Recent Transactions */}
      {summary && summary.recent_transactions.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Transactions</Text>
          {summary.recent_transactions.slice(0, 3).map((txn, idx) => (
            <View key={idx} style={styles.transactionItem}>
              <View style={styles.transactionLeft}>
                <Text style={styles.transactionDesc}>{txn.description}</Text>
                <Text style={styles.transactionTime}>{new Date(txn.created_at).toLocaleDateString()}</Text>
              </View>
              <Text
                style={[
                  styles.transactionAmount,
                  txn.type === 'ride_payment' ? styles.amountNegative : styles.amountPositive
                ]}
              >
                {txn.type === 'ride_payment' ? '-' : '+'}
                {formatCurrency(txn.amount)}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
};

// ==================== ADD MONEY TO WALLET SCREEN ====================

export const AddMoneyToWalletScreen: React.FC<{ userId: string; authToken: string; onSuccess: () => void }> = ({
  userId,
  authToken,
  onSuccess
}) => {
  const { initiateTopup, isLoading, formatCurrency } = useWalletManagement(userId, authToken);
  const [amount, setAmount] = useState('');
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [showPromo, setShowPromo] = useState(false);

  const quickAmounts = [500, 1000, 2000, 5000];

  const handleTopup = async () => {
    const topupAmount = selectedAmount || parseFloat(amount);

    if (!topupAmount || topupAmount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    const result = await initiateTopup(topupAmount, 'card', promoCode || undefined);

    if (result) {
      Alert.alert(
        'Topup Initiated',
        `Amount: ${formatCurrency(result.total_charged)}\n${result.discount_amount > 0 ? `Discount: ${formatCurrency(result.discount_amount)}` : ''}`,
        [
          {
            text: 'Continue to Payment',
            onPress: onSuccess
          }
        ]
      );
    } else {
      Alert.alert('Error', 'Failed to initiate topup');
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Quick Amounts</Text>
        <View style={styles.quickAmountsGrid}>
          {quickAmounts.map((amt) => (
            <TouchableOpacity
              key={amt}
              style={[
                styles.quickAmountButton,
                selectedAmount === amt && styles.quickAmountButtonActive
              ]}
              onPress={() => {
                setSelectedAmount(amt);
                setAmount('');
              }}
            >
              <Text
                style={[
                  styles.quickAmountText,
                  selectedAmount === amt && styles.quickAmountTextActive
                ]}
              >
                ₹{amt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Custom Amount</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter amount"
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
          editable={!selectedAmount}
        />
      </View>

      {/* Promo Code */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.promoToggle}
          onPress={() => setShowPromo(!showPromo)}
        >
          <Text style={styles.promoToggleText}>Have a promo code?</Text>
        </TouchableOpacity>

        {showPromo && (
          <TextInput
            style={styles.input}
            placeholder="Enter promo code"
            value={promoCode}
            onChangeText={setPromoCode}
          />
        )}
      </View>

      {/* Summary */}
      {(selectedAmount || amount) && (
        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Amount</Text>
            <Text style={styles.summaryValue}>{formatCurrency(selectedAmount || parseFloat(amount) || 0)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Platform Fee</Text>
            <Text style={styles.summaryValue}>{formatCurrency(0)}</Text>
          </View>
          <View style={[styles.summaryRow, styles.summaryTotal]}>
            <Text style={styles.summaryLabel}>Total</Text>
            <Text style={styles.summaryValueTotal}>{formatCurrency(selectedAmount || parseFloat(amount) || 0)}</Text>
          </View>
        </View>
      )}

      <TouchableOpacity
        style={[styles.button, styles.buttonPrimary, styles.buttonLarge]}
        onPress={handleTopup}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.buttonText}>Proceed to Payment</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
};

// ==================== AUTO-RECHARGE SETTINGS SCREEN ====================

export const AutoRechargeSettingsScreen: React.FC<{ userId: string; authToken: string }> = ({
  userId,
  authToken
}) => {
  const { autoRecharge, setupAutoRecharge, disableAutoRecharge, isLoading, formatCurrency } = useWalletManagement(
    userId,
    authToken
  );
  const [isEnabled, setIsEnabled] = useState(autoRecharge?.is_enabled || false);
  const [threshold, setThreshold] = useState((autoRecharge?.threshold_amount || 500).toString());
  const [amount, setAmount] = useState((autoRecharge?.recharge_amount || 1000).toString());

  const handleSetup = async () => {
    const result = await setupAutoRecharge(parseFloat(threshold), parseFloat(amount), 'saved_card_1');

    if (result) {
      Alert.alert('Success', 'Auto-recharge configured successfully');
    }
  };

  const handleDisable = async () => {
    Alert.alert(
      'Disable Auto-Recharge',
      'Are you sure?',
      [
        { text: 'Cancel', onPress: () => {} },
        {
          text: 'Disable',
          onPress: async () => {
            await disableAutoRecharge();
            setIsEnabled(false);
          }
        }
      ]
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Enable Auto-Recharge</Text>
          <Switch value={isEnabled} onValueChange={setIsEnabled} />
        </View>
      </View>

      {isEnabled && (
        <>
          <View style={styles.section}>
            <Text style={styles.label}>Recharge When Balance Below</Text>
            <TextInput
              style={styles.input}
              placeholder="₹500"
              keyboardType="decimal-pad"
              value={threshold}
              onChangeText={setThreshold}
            />
            <Text style={styles.helperText}>Your wallet will auto-recharge when balance drops below this amount</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Auto-Recharge Amount</Text>
            <TextInput
              style={styles.input}
              placeholder="₹1000"
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />
            <Text style={styles.helperText}>The amount to automatically add to your wallet</Text>
          </View>

          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              ℹ️ Max 3 auto-recharges per day for safety. You'll receive a notification before each recharge.
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary, styles.buttonLarge]}
            onPress={handleSetup}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>Save Settings</Text>
          </TouchableOpacity>
        </>
      )}

      {autoRecharge?.is_enabled && (
        <TouchableOpacity
          style={[styles.button, styles.buttonDanger, styles.buttonLarge]}
          onPress={handleDisable}
        >
          <Text style={styles.buttonText}>Disable Auto-Recharge</Text>
        </TouchableOpacity>
      )}

      {autoRecharge?.last_recharge_at && (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Last auto-recharged: {new Date(autoRecharge.last_recharge_at).toLocaleDateString()}\nTotal auto-recharged:
            {formatCurrency(autoRecharge.total_auto_recharged)}
          </Text>
        </View>
      )}
    </ScrollView>
  );
};

// ==================== TRANSACTION HISTORY SCREEN ====================

export const TransactionHistoryScreen: React.FC<{ userId: string; authToken: string }> = ({
  userId,
  authToken
}) => {
  const { transactions, currentPage, totalPages, isLoading, fetchTransactionHistory, formatCurrency } = useWalletManagement(
    userId,
    authToken
  );

  useEffect(() => {
    fetchTransactionHistory(1);
  }, [fetchTransactionHistory]);

  const handleLoadMore = () => {
    if (currentPage < totalPages) {
      fetchTransactionHistory(currentPage + 1);
    }
  };

  const renderTransaction = ({ item }: { item: any }) => (
    <View style={styles.transactionItem}>
      <View style={styles.transactionLeft}>
        <Text style={styles.transactionDesc}>{item.description}</Text>
        <Text style={styles.transactionTime}>{new Date(item.created_at).toLocaleDateString()}</Text>
      </View>
      <View style={styles.transactionRight}>
        <Text
          style={[
            styles.transactionAmount,
            item.type === 'ride_payment' ? styles.amountNegative : styles.amountPositive
          ]}
        >
          {item.type === 'ride_payment' ? '-' : '+'}
          {formatCurrency(item.amount)}
        </Text>
        <Text style={styles.transactionStatus}>{item.status}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {isLoading && !transactions.length ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#FF6B35" />
        </View>
      ) : transactions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No transactions yet</Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          renderItem={renderTransaction}
          keyExtractor={(item) => item.transaction_id}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.1}
          ListFooterComponent={() => (
            currentPage < totalPages && isLoading ? (
              <ActivityIndicator size="small" color="#FF6B35" style={{ marginVertical: 16 }} />
            ) : null
          )}
          scrollEnabled={false}
        />
      )}
    </View>
  );
};

// ==================== STYLES ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    padding: 16
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40
  },
  emptyText: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center'
  },

  // Balance Card
  balanceCard: {
    backgroundColor: '#FF6B35',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    elevation: 3
  },
  balanceLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    marginBottom: 8
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 12
  },
  progressContainer: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 8
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#FFF',
    borderRadius: 3
  },
  maxBalanceText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.8)'
  },

  // Stats Grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
    gap: 10
  },
  statCard: {
    width: '48%',
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    elevation: 2
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333'
  },

  // Buttons
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20
  },
  button: {
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center'
  },
  buttonLarge: {
    width: '100%',
    marginBottom: 10
  },
  buttonPrimary: {
    backgroundColor: '#FF6B35',
    flex: 1
  },
  buttonSecondary: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#FF6B35',
    flex: 1
  },
  buttonDanger: {
    backgroundColor: '#E53E3E'
  },
  buttonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14
  },
  buttonTextSecondary: {
    color: '#FF6B35',
    fontWeight: 'bold',
    fontSize: 14
  },

  // Section
  section: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 8
  },
  helperText: {
    fontSize: 12,
    color: '#999',
    marginTop: 4
  },

  // Quick Amounts
  quickAmountsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  quickAmountButton: {
    width: '48%',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    paddingVertical: 12,
    alignItems: 'center'
  },
  quickAmountButtonActive: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35'
  },
  quickAmountText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333'
  },
  quickAmountTextActive: {
    color: '#FFF'
  },

  // Promo
  promoToggle: {
    paddingVertical: 8
  },
  promoToggleText: {
    fontSize: 14,
    color: '#FF6B35',
    fontWeight: '600'
  },

  // Summary
  summaryCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0'
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8
  },
  summaryTotal: {
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    paddingTop: 12,
    marginTop: 12
  },
  summaryLabel: {
    fontSize: 14,
    color: '#666'
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333'
  },
  summaryValueTotal: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF6B35'
  },

  // Transaction Item
  transactionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    elevation: 1
  },
  transactionLeft: {
    flex: 1
  },
  transactionRight: {
    alignItems: 'flex-end'
  },
  transactionDesc: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2
  },
  transactionTime: {
    fontSize: 12,
    color: '#999'
  },
  transactionAmount: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2
  },
  transactionStatus: {
    fontSize: 10,
    color: '#999',
    textTransform: 'capitalize'
  },
  amountNegative: {
    color: '#E53E3E'
  },
  amountPositive: {
    color: '#38A169'
  },

  // Settings
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333'
  },

  // Info Box
  infoBox: {
    backgroundColor: '#EBF8FF',
    borderRadius: 6,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#3182CE'
  },
  infoText: {
    fontSize: 13,
    color: '#2C5282'
  }
});
