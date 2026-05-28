import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { COLORS, SHADOWS } from '../theme';

function formatMoney(value) {
  const amount = Number(value || 0);
  return `Rs. ${Number.isFinite(amount) ? amount.toFixed(2) : '0.00'}`;
}

function formatDateTime(value) {
  if (!value) {
    return 'Not available';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Not available';
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatStatusLabel(value) {
  return String(value || 'not_submitted')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getStatusTone(status) {
  const normalized = String(status || '').toLowerCase();
  if (['approved', 'processed', 'paid', 'completed', 'verified'].includes(normalized)) {
    return {
      backgroundColor: '#E8F5E9',
      borderColor: COLORS.success,
      color: COLORS.success,
    };
  }
  if (['failed', 'rejected', 'cancelled'].includes(normalized)) {
    return {
      backgroundColor: '#FFF5F5',
      borderColor: COLORS.danger,
      color: COLORS.danger,
    };
  }
  return {
    backgroundColor: '#FFF8E1',
    borderColor: COLORS.warning,
    color: '#8A5A00',
  };
}

/**
 * EarningsPanel Component
 * 
 * Unified display of earnings, pricing, and fare calculator.
 * Shows real-time metrics with expandable fare details.
 * 
 * Props:
 *   - earnings: {today_earnings, today_rides, weekly_earnings, monthly_earnings}
 *   - pricingRules: {base_fare, per_km_rate, surge_multiplier, night_multiplier, ...}
 *   - driverFareConfig: {base_fare, per_km_rate, ...} (driver's custom rates)
 *   - loading: boolean
 *   - initialAction: 'summary' | 'withdraw'
 *   - onRequestReport: () => void
 *   - onRequestWithdraw: () => void
 *   - onManageBankDetails: () => void
 */
export default function EarningsPanel({
  earnings = null,
  pricingRules = null,
  driverFareConfig = null,
  loading = false,
  initialAction = 'summary',
  onRequestReport,
  onRequestWithdraw,
  onManageBankDetails,
}) {
  const [showFareDetails, setShowFareDetails] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const withdrawInputRef = useRef(null);

  const todayMetrics = useMemo(() => {
    if (!earnings) return null;
    return {
      earnings: earnings.today_earnings || 0,
      rides: earnings.today_rides || 0,
      hourlyRate: earnings.today_earnings && earnings.today_rides 
        ? Math.round((earnings.today_earnings / 8) * 100) / 100 // Assuming 8 hour shift
        : 0,
    };
  }, [earnings]);

  const weeklyMetrics = useMemo(() => {
    if (!earnings) return null;
    return {
      earnings: earnings.weekly_earnings || 0,
      rideAverage: earnings.weekly_earnings && earnings.today_rides
        ? Math.round((earnings.weekly_earnings / 30) * 100) / 100 // Rough average
        : 0,
    };
  }, [earnings]);

  const monthlyMetrics = useMemo(() => {
    if (!earnings) return null;
    return {
      earnings: earnings.monthly_earnings || 0,
    };
  }, [earnings]);

  const fareDetails = useMemo(() => {
    if (!pricingRules) return null;
    return {
      baseFare: pricingRules.base_fare || 0,
      perKmRate: pricingRules.per_km_rate || 0,
      surgeMultiplier: pricingRules.surge_multiplier || 1,
      nightMultiplier: pricingRules.night_multiplier || 1,
      minimumFare: pricingRules.minimum_fare || 0,
      peakHours: pricingRules.peak_hours || '8,9,17,18,19',
    };
  }, [pricingRules]);

  const driverRates = useMemo(() => {
    if (!driverFareConfig) return null;
    return {
      baseFare: driverFareConfig.base_fare || driverFareConfig?.base_fare || 0,
      perKmRate: driverFareConfig.per_km_rate || 0,
      surgeMultiplier: driverFareConfig.surge_multiplier || 1,
      nightMultiplier: driverFareConfig.night_multiplier || 1,
    };
  }, [driverFareConfig]);

  const payout = useMemo(() => {
    const source = earnings?.payout && typeof earnings.payout === 'object' ? earnings.payout : {};
    const withdrawals = Array.isArray(earnings?.withdrawals)
      ? earnings.withdrawals
      : Array.isArray(source.recent_withdrawals)
        ? source.recent_withdrawals
        : [];
    const walletBalance = Number(source.wallet_balance ?? earnings?.wallet_balance ?? 0);
    const pendingWithdrawal = Number(source.pending_withdrawal ?? earnings?.pending_withdrawal ?? 0);
    const bankStatus = String(source.bank_verification_status || earnings?.bank_verification_status || 'not_submitted');
    const blocker =
      source.withdrawal_blocker ||
      (bankStatus !== 'verified'
        ? 'Bank details must be verified before withdrawals can be requested.'
        : walletBalance <= 0
          ? 'No available wallet balance to withdraw.'
          : '');

    return {
      walletBalance: Number.isFinite(walletBalance) ? walletBalance : 0,
      pendingWithdrawal: Number.isFinite(pendingWithdrawal) ? pendingWithdrawal : 0,
      bankStatus,
      bankName: source.bank_name || '',
      bankAccountMasked: source.bank_account_masked || '',
      canWithdraw: source.can_withdraw !== false && bankStatus === 'verified' && walletBalance > 0,
      blocker,
      payoutEta: source.payout_eta || null,
      latestFailureReason: source.latest_failure_reason || null,
      withdrawals,
    };
  }, [earnings]);

  const withdrawSubmitDisabled = loading || !payout.canWithdraw;

  const focusWithdrawInput = () => {
    withdrawInputRef.current?.focus?.();
  };

  const submitWithdrawal = () => {
    if (withdrawSubmitDisabled) {
      return;
    }
    onRequestWithdraw?.(Number(withdrawAmount || 0), 'bank_transfer');
  };

  useEffect(() => {
    if (initialAction !== 'withdraw') {
      return undefined;
    }
    const timer = setTimeout(() => {
      withdrawInputRef.current?.focus?.();
    }, 150);
    return () => clearTimeout(timer);
  }, [initialAction]);

  if (!earnings && !pricingRules) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading earnings...</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      showsVerticalScrollIndicator={false}>
      
      {/* Today's Earnings Card */}
      {todayMetrics && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Today&apos;s Earnings</Text>
          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>₹{todayMetrics.earnings}</Text>
              <Text style={styles.metricLabel}>Total</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>{todayMetrics.rides}</Text>
              <Text style={styles.metricLabel}>Rides</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metricItem}>
              <Text style={styles.metricValue}>₹{todayMetrics.hourlyRate}</Text>
              <Text style={styles.metricLabel}>Per Hour</Text>
            </View>
          </View>
        </View>
      )}

      {/* Weekly & Monthly Summary */}
      <View style={styles.summaryRow}>
        {weeklyMetrics && (
          <View style={[styles.card, styles.summaryCard]}>
            <Text style={styles.cardTitle}>Weekly</Text>
            <Text style={styles.bigNumber}>₹{weeklyMetrics.earnings}</Text>
            <Text style={styles.smallText}>Last 7 days</Text>
          </View>
        )}
        {monthlyMetrics && (
          <View style={[styles.card, styles.summaryCard]}>
            <Text style={styles.cardTitle}>Monthly</Text>
            <Text style={styles.bigNumber}>₹{monthlyMetrics.earnings}</Text>
            <Text style={styles.smallText}>This month</Text>
          </View>
        )}
      </View>

      {/* Action Buttons */}
      <View style={styles.actionButtons}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={onRequestReport}
          disabled={loading}>
          <Text style={styles.actionButtonIcon}>📊</Text>
          <Text style={styles.actionButtonText}>Full Report</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={focusWithdrawInput}
          disabled={loading}>
          <Text style={styles.actionButtonIcon}>💳</Text>
          <Text style={styles.actionButtonText}>Withdraw</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.card}>
        <View style={styles.payoutHeaderRow}>
          <Text style={styles.cardTitle}>Payouts</Text>
          <View style={[styles.statusPill, getStatusTone(payout.bankStatus)]}>
            <Text style={[styles.statusPillText, { color: getStatusTone(payout.bankStatus).color }]}>
              {formatStatusLabel(payout.bankStatus)}
            </Text>
          </View>
        </View>

        <View style={styles.walletGrid}>
          <View style={styles.walletMetric}>
            <Text style={styles.walletValue}>{formatMoney(payout.walletBalance)}</Text>
            <Text style={styles.walletLabel}>Available</Text>
          </View>
          <View style={styles.walletMetric}>
            <Text style={styles.walletValue}>{formatMoney(payout.pendingWithdrawal)}</Text>
            <Text style={styles.walletLabel}>Pending payout</Text>
          </View>
        </View>

        {!!payout.bankAccountMasked && (
          <Text style={styles.payoutMeta}>
            Bank: {payout.bankName || 'Bank account'} {payout.bankAccountMasked}
          </Text>
        )}
        {!!payout.payoutEta && (
          <Text style={styles.payoutMeta}>Next payout ETA: {formatDateTime(payout.payoutEta)}</Text>
        )}
        {!!payout.latestFailureReason && (
          <Text style={styles.failureText}>Latest failure: {payout.latestFailureReason}</Text>
        )}

        {!!payout.blocker && (
          <View style={styles.blockerBox}>
            <Text style={styles.blockerTitle}>Payout blocked</Text>
            <Text style={styles.blockerText}>{payout.blocker}</Text>
            {!!onManageBankDetails && payout.bankStatus !== 'verified' && (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={onManageBankDetails}
                disabled={loading}>
                <Text style={styles.secondaryButtonText}>Manage Bank Details</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <TextInput
          ref={withdrawInputRef}
          style={[styles.withdrawInput, withdrawSubmitDisabled && styles.inputDisabled]}
          value={withdrawAmount}
          onChangeText={setWithdrawAmount}
          placeholder="Withdrawal amount"
          placeholderTextColor={COLORS.gray || COLORS.textMuted}
          keyboardType="decimal-pad"
          editable={!withdrawSubmitDisabled}
        />
        <TouchableOpacity
          style={[styles.actionButton, styles.withdrawSubmitButton, withdrawSubmitDisabled && styles.actionButtonDisabled]}
          onPress={submitWithdrawal}
          disabled={withdrawSubmitDisabled}>
          <Text style={styles.actionButtonText}>Submit Withdrawal Request</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Withdrawal History</Text>
        {payout.withdrawals.length === 0 ? (
          <Text style={styles.smallText}>No withdrawal requests yet.</Text>
        ) : (
          payout.withdrawals.map((item) => {
            const tone = getStatusTone(item.status);
            return (
              <View key={item.id || `${item.created_at}-${item.amount}`} style={styles.withdrawalItem}>
                <View style={styles.withdrawalHeader}>
                  <View style={styles.withdrawalTitleBlock}>
                    <Text style={styles.withdrawalAmount}>{formatMoney(item.amount)}</Text>
                    <Text style={styles.withdrawalMeta}>
                      {formatDateTime(item.created_at)} | {String(item.method || 'bank_transfer').replace(/_/g, ' ')}
                    </Text>
                  </View>
                  <View style={[styles.statusPill, tone]}>
                    <Text style={[styles.statusPillText, { color: tone.color }]}>
                      {formatStatusLabel(item.status)}
                    </Text>
                  </View>
                </View>
                {!!item.payout_eta && (
                  <Text style={styles.withdrawalMeta}>Payout ETA: {formatDateTime(item.payout_eta)}</Text>
                )}
                {!!item.processed_at && (
                  <Text style={styles.withdrawalMeta}>Processed: {formatDateTime(item.processed_at)}</Text>
                )}
                {!!item.failure_reason && (
                  <Text style={styles.failureText}>Failure reason: {item.failure_reason}</Text>
                )}
                {!!item.admin_note && (
                  <Text style={styles.withdrawalMeta}>Admin note: {item.admin_note}</Text>
                )}
              </View>
            );
          })
        )}
      </View>

      {/* Fare Details Section */}
      <TouchableOpacity
        style={styles.card}
        onPress={() => setShowFareDetails(!showFareDetails)}>
        <View style={styles.fareHeaderRow}>
          <Text style={styles.cardTitle}>
            {showFareDetails ? '⬇️' : '➡️'} Fare Details
          </Text>
          <Text style={styles.expandIcon}>
            {showFareDetails ? '−' : '+'}
          </Text>
        </View>
      </TouchableOpacity>

      {showFareDetails && fareDetails && (
        <View style={[styles.card, styles.fareDetailsCard]}>
          <View style={styles.fareDetailsSection}>
            <Text style={styles.sectionTitle}>Platform Pricing</Text>
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Base Fare:</Text>
              <Text style={styles.fareValue}>₹{fareDetails.baseFare}</Text>
            </View>
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Per KM Rate:</Text>
              <Text style={styles.fareValue}>₹{fareDetails.perKmRate}/km</Text>
            </View>
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Minimum Fare:</Text>
              <Text style={styles.fareValue}>₹{fareDetails.minimumFare}</Text>
            </View>
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Surge (Peak):</Text>
              <Text style={styles.fareValue}>×{fareDetails.surgeMultiplier}</Text>
            </View>
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Night (10pm-6am):</Text>
              <Text style={styles.fareValue}>×{fareDetails.nightMultiplier}</Text>
            </View>
            <View style={styles.fareRow}>
              <Text style={styles.fareLabel}>Peak Hours:</Text>
              <Text style={styles.fareValue}>{fareDetails.peakHours}</Text>
            </View>
          </View>

          {driverRates && (
            <View style={[styles.fareDetailsSection, styles.yourRatesSection]}>
              <Text style={styles.sectionTitle}>Your Custom Rates</Text>
              {driverRates.baseFare !== fareDetails.baseFare && (
                <View style={styles.fareRow}>
                  <Text style={styles.fareLabel}>Base Fare:</Text>
                  <Text style={styles.fareValue}>₹{driverRates.baseFare}</Text>
                </View>
              )}
              {driverRates.perKmRate !== fareDetails.perKmRate && (
                <View style={styles.fareRow}>
                  <Text style={styles.fareLabel}>Per KM Rate:</Text>
                  <Text style={styles.fareValue}>₹{driverRates.perKmRate}/km</Text>
                </View>
              )}
              {driverRates.surgeMultiplier !== fareDetails.surgeMultiplier && (
                <View style={styles.fareRow}>
                  <Text style={styles.fareLabel}>Surge Multiplier:</Text>
                  <Text style={styles.fareValue}>×{driverRates.surgeMultiplier}</Text>
                </View>
              )}
              {driverRates.nightMultiplier !== fareDetails.nightMultiplier && (
                <View style={styles.fareRow}>
                  <Text style={styles.fareLabel}>Night Multiplier:</Text>
                  <Text style={styles.fareValue}>×{driverRates.nightMultiplier}</Text>
                </View>
              )}
              <Text style={styles.customNote}>
                ℹ️ Custom rates apply to your rides when approved by admin.
              </Text>
            </View>
          )}

          {/* Fare Calculator Example */}
          <View style={styles.fareDetailsSection}>
            <Text style={styles.sectionTitle}>Fare Estimate Example</Text>
            <Text style={styles.exampleText}>
              10 KM ride during peak hours:
            </Text>
            <Text style={styles.exampleCalculation}>
              (₹{fareDetails.baseFare} + 10 × ₹{fareDetails.perKmRate}) × {fareDetails.surgeMultiplier} = ₹{Math.max(
                Math.round(
                  (parseFloat(fareDetails.baseFare) + 10 * parseFloat(fareDetails.perKmRate)) 
                  * parseFloat(fareDetails.surgeMultiplier) * 100
                ) / 100,
                parseFloat(fareDetails.minimumFare)
              )}
            </Text>
          </View>
        </View>
      )}

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={COLORS.primary} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 12,
    paddingBottom: 24,
  },

  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.gray,
  },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    ...SHADOWS.card,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 12,
  },

  // Today's Metrics
  metricsGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 18,
    fontWeight: '800',
    color: COLORS.primary,
  },
  metricLabel: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 4,
  },
  metricDivider: {
    width: 1,
    height: 40,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 8,
  },

  // Summary Row
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    padding: 14,
    alignItems: 'center',
  },
  bigNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: COLORS.primary,
    marginVertical: 4,
  },
  smallText: {
    fontSize: 11,
    color: COLORS.gray,
  },

  // Action Buttons
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    backgroundColor: COLORS.primary,
    paddingVertical: 12,
    borderRadius: 12,
    ...SHADOWS.card,
  },
  actionButtonDisabled: {
    backgroundColor: COLORS.textMuted,
    opacity: 0.7,
  },
  actionButtonIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  actionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.white,
    textAlign: 'center',
  },
  withdrawInput: {
    borderWidth: 1,
    borderColor: '#D7E2DA',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
    color: COLORS.textMain,
    backgroundColor: COLORS.surface,
  },
  inputDisabled: {
    backgroundColor: '#F1F5F2',
    opacity: 0.8,
  },
  withdrawSubmitButton: {
    marginBottom: 12,
  },
  payoutHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '900',
  },
  walletGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  walletMetric: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D7E2DA',
    borderRadius: 12,
    padding: 12,
    backgroundColor: '#F8FBF9',
  },
  walletValue: {
    color: COLORS.primary,
    fontSize: 18,
    fontWeight: '900',
  },
  walletLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  payoutMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  blockerBox: {
    borderWidth: 1,
    borderColor: '#F3D27A',
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  blockerTitle: {
    color: '#8A5A00',
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 4,
  },
  blockerText: {
    color: '#6B4A00',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 18,
  },
  secondaryButton: {
    marginTop: 10,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
  },
  secondaryButtonText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  withdrawalItem: {
    borderWidth: 1,
    borderColor: '#D7E2DA',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#F8FBF9',
  },
  withdrawalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 6,
  },
  withdrawalTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  withdrawalAmount: {
    color: COLORS.textMain,
    fontSize: 15,
    fontWeight: '900',
  },
  withdrawalMeta: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 3,
  },
  failureText: {
    color: COLORS.danger,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },

  // Fare Details
  fareHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  expandIcon: {
    fontSize: 18,
    color: COLORS.primary,
  },

  fareDetailsCard: {
    backgroundColor: '#F9F9F9',
  },
  fareDetailsSection: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  fareDetailsSection_last: {
    borderBottomWidth: 0,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 10,
  },

  fareRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  fareLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  fareValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMain,
  },

  yourRatesSection: {
    backgroundColor: '#F0F8FF',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  customNote: {
    fontSize: 11,
    color: COLORS.gray,
    fontStyle: 'italic',
    marginTop: 8,
  },

  exampleText: {
    fontSize: 12,
    color: COLORS.gray,
    marginBottom: 6,
  },
  exampleCalculation: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: COLORS.primary,
    fontWeight: '600',
    padding: 8,
    backgroundColor: COLORS.background,
    borderRadius: 6,
  },

  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
