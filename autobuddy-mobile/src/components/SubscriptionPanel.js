import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';
import VoiceTextInput from './VoiceTextInput';

function getPlanDetails(audience = 'passenger') {
  const isDriver = audience === 'driver';
  return {
    free: {
      name: 'Free',
      period: 'Forever',
      description: isDriver
        ? 'Basic driver access while paid driver plans are not required.'
        : 'Basic access with no paid subscription selected.',
      benefits: isDriver
        ? ['View driver dashboard', 'Keep profile and documents updated', 'Use support and safety tools']
        : ['Book standard rides', 'Standard support', 'Ratings and reviews', 'Saved payment methods'],
      color: '#E0E0E0',
    },
    monthly: {
      name: 'Monthly',
      period: 'Per Month',
      description: isDriver
        ? 'Monthly driver plan for accepting ride requests after admin activation.'
        : 'Monthly admin-activated rider plan.',
      benefits: isDriver
        ? ['Accept ride requests', 'Admin-verified activation', 'Subscription and dues tracking']
        : ['Regular rider plan', 'Admin-verified activation', 'Subscription status tracking'],
      color: '#4CAF50',
    },
    quarterly: {
      name: 'Quarterly',
      period: 'Every 3 Months',
      description: isDriver
        ? 'Longer driver validity with fewer renewal cycles.'
        : 'Longer subscription period for regular riders.',
      benefits: ['Quarterly validity', 'Admin-verified activation', 'Fewer renewal cycles'],
      color: '#FFD700',
      badge: 'POPULAR',
    },
    annually: {
      name: 'Annually',
      period: 'Per Year',
      description: isDriver
        ? 'Annual driver plan for steady marketplace access.'
        : 'Annual subscription for frequent riders.',
      benefits: isDriver
        ? ['Annual validity', 'Admin-verified activation', 'Best for full-time drivers']
        : ['Annual validity', 'Admin-verified activation', 'Best for frequent riders'],
      color: '#7E57C2',
    },
    per_trip: {
      name: 'Per Trip',
      period: 'Usage Based',
      description: 'Dues are generated after ride thresholds.',
      benefits: isDriver
        ? ['Usage-based driver dues', 'Payment verification flow', 'Ride threshold tracking']
        : ['Usage-based dues', 'Payment verification flow', 'Ride threshold tracking'],
      color: '#29B6F6',
    },
  };
}

function planPrice(planKey, planConfig) {
  if (planKey === 'free') {
    return 'INR 0';
  }
  return `INR ${Number(planConfig?.amount || 0).toFixed(2)}`;
}

function normalizeSubscription(subscription = {}, paymentOptions = {}, pendingDues = []) {
  const plan = subscription?.plan_type || 'free';
  return {
    ...subscription,
    plan,
    status: subscription?.is_active ? 'active' : plan === 'free' ? 'active' : 'pending_admin_activation',
    renews_at: subscription?.period_expires_at || null,
    outstanding_amount: Number(subscription?.outstanding_amount || 0),
    payment_options: paymentOptions || {},
    pending_dues: Array.isArray(pendingDues) ? pendingDues : [],
  };
}

function getPaymentMethods(paymentOptions = {}) {
  const methods = [];
  if (paymentOptions.enable_upi) {
    methods.push({ value: 'upi', label: 'UPI' });
  }
  if (paymentOptions.enable_qr) {
    methods.push({ value: 'qr', label: 'QR' });
  }
  if (paymentOptions.enable_razorpay) {
    methods.push({ value: 'razorpay', label: 'Razorpay' });
  }
  return methods;
}

export default function SubscriptionPanel({ token, audience = 'passenger' }) {
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [availablePlans, setAvailablePlans] = useState(['free']);
  const [planConfig, setPlanConfig] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [upgrading, setUpgrading] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentUtr, setPaymentUtr] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [payingDue, setPayingDue] = useState(false);

  const planDetails = useMemo(() => getPlanDetails(audience), [audience]);
  const isDriver = audience === 'driver' || currentSubscription?.role === 'driver';
  const paymentMethods = useMemo(
    () => getPaymentMethods(currentSubscription?.payment_options),
    [currentSubscription?.payment_options],
  );

  const fetchSubscription = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const [configData, subscriptionData] = await Promise.all([
        apiRequest('/subscriptions/config', { token }),
        apiRequest('/subscriptions/me', { token }),
      ]);
      const backendPlans = configData?.plans || {};
      const activeBackendPlans = Object.keys(backendPlans).filter((planKey) => backendPlans[planKey]?.active);
      setPlanConfig(backendPlans);
      setAvailablePlans(['free', ...(activeBackendPlans.length > 0 ? activeBackendPlans : Object.keys(backendPlans))]);
      setCurrentSubscription(
        normalizeSubscription(
          subscriptionData?.subscription,
          subscriptionData?.payment_options,
          subscriptionData?.pending_dues,
        ),
      );
      const methods = getPaymentMethods(subscriptionData?.payment_options);
      setPaymentMethod((current) => (
        methods.some((method) => method.value === current) ? current : methods[0]?.value || ''
      ));
    } catch (err) {
      setError(err.message || 'Failed to load subscription');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSubscription().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchSubscription]);

  const currentPlanName = useMemo(
    () => planDetails[currentSubscription?.plan]?.name || 'Free',
    [currentSubscription?.plan, planDetails],
  );

  const selectPlan = async (planKey) => {
    if (planKey === currentSubscription?.plan) {
      Alert.alert('Already Selected', `You are already on the ${planDetails[planKey]?.name || planKey} plan.`);
      return;
    }
    if (planKey === 'free') {
      Alert.alert(
        'Free Plan',
        isDriver
          ? 'Free access is available only when paid driver plans are not required.'
          : 'Free access is available when no paid plan is selected.',
      );
      return;
    }

    const plan = planDetails[planKey] || { name: planKey, period: '' };
    Alert.alert(
      `Select ${plan.name}?`,
      `Select ${plan.name} (${planPrice(planKey, planConfig[planKey])}/${plan.period}). Admin activation may be required.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Select',
          onPress: async () => {
            try {
              setUpgrading(planKey);
              setError('');
              const response = await apiRequest('/subscriptions/select', {
                token,
                method: 'PUT',
                body: { plan_type: planKey },
              });
              setCurrentSubscription((prev) =>
                normalizeSubscription(
                  response?.subscription || { ...(prev || {}), plan_type: planKey },
                  prev?.payment_options,
                  prev?.pending_dues,
                ),
              );
              setMessage(`${plan.name} selected. Waiting for admin activation.`);
              setTimeout(() => setMessage(''), 3000);
            } catch (err) {
              setError(err.message || 'Failed to select subscription');
            } finally {
              setUpgrading(null);
            }
          },
        },
      ],
    );
  };

  const cancelSubscription = () => {
    Alert.alert(
      'Cancel Subscription?',
      'This cancels the selected plan. Admin activation may be required before selecting a paid plan again.',
      [
        { text: 'Keep Plan', style: 'cancel' },
        {
          text: 'Cancel Plan',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              setError('');
              const response = await apiRequest('/subscriptions/cancel', { token, method: 'POST' });
              setCurrentSubscription((prev) =>
                normalizeSubscription(
                  response?.subscription || { ...(prev || {}), plan_type: null, is_active: false },
                  prev?.payment_options,
                  prev?.pending_dues,
                ),
              );
              setMessage('Subscription cancelled.');
              setTimeout(() => setMessage(''), 3000);
            } catch (err) {
              setError(err.message || 'Failed to cancel subscription');
            } finally {
              setLoading(false);
            }
          },
        },
      ],
    );
  };

  const submitDuePayment = async () => {
    const method = paymentMethod || paymentMethods[0]?.value;
    if (!method) {
      setError('No subscription payment method is configured.');
      return;
    }
    if ((method === 'upi' || method === 'qr') && !String(paymentUtr || '').trim()) {
      setError('Enter UTR or transaction ID for UPI/QR payment.');
      return;
    }

    try {
      setPayingDue(true);
      setError('');
      const response = await apiRequest('/subscriptions/pay-due', {
        token,
        method: 'POST',
        body: {
          payment_method: method,
          payment_utr: paymentUtr.trim(),
          payment_ref: paymentRef.trim(),
        },
      });
      setMessage(response?.message || 'Payment submitted for admin verification.');
      setPaymentUtr('');
      setPaymentRef('');
      await fetchSubscription();
    } catch (err) {
      setError(err.message || 'Failed to submit subscription payment');
    } finally {
      setPayingDue(false);
    }
  };

  const renderBenefit = (benefit) => (
    <View key={benefit} style={styles.benefitRow}>
      <Text style={styles.benefitIcon}>OK</Text>
      <Text style={styles.benefitText}>{benefit}</Text>
    </View>
  );

  const renderPlanCard = (planKey) => {
    const plan = planDetails[planKey];
    if (!plan) {
      return null;
    }
    const isCurrent = currentSubscription?.plan === planKey;
    return (
      <View key={planKey} style={[styles.planCard, SHADOWS.card, isCurrent && styles.planCardCurrent]}>
        {!!plan.badge && (
          <View style={[styles.badge, { backgroundColor: plan.color }]}>
            <Text style={styles.badgeText}>{plan.badge}</Text>
          </View>
        )}
        <View style={[styles.planHeader, { backgroundColor: plan.color }]}>
          <Text style={styles.planName}>{plan.name}</Text>
          <View style={styles.priceBlock}>
            <Text style={styles.priceValue}>{planPrice(planKey, planConfig[planKey])}</Text>
            <Text style={styles.pricePeriod}>{plan.period}</Text>
          </View>
        </View>
        <View style={styles.planContent}>
          <Text style={styles.planDescription}>{plan.description}</Text>
          <View style={styles.benefitsSection}>{plan.benefits.map(renderBenefit)}</View>
          {isCurrent ? (
            <View style={styles.currentBadgeBlock}>
              <Text style={styles.currentBadgeText}>Current Plan</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.selectButton}
              onPress={() => selectPlan(planKey)}
              disabled={upgrading === planKey}>
              <Text style={styles.selectButtonText}>
                {upgrading === planKey ? 'Selecting...' : planKey === 'free' ? 'Included' : 'Select Plan'}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  if (loading && !currentSubscription) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {!!error && <Text style={styles.errorText}>{error}</Text>}
      {!!message && <Text style={styles.messageText}>{message}</Text>}

      {!!currentSubscription && (
        <View style={[styles.currentStatusBlock, SHADOWS.card]}>
          <Text style={styles.sectionTitle}>{isDriver ? 'Driver Subscription' : 'Current Subscription'}</Text>
          <View style={styles.statusContent}>
            <View>
              <Text style={styles.statusLabel}>Plan</Text>
              <Text style={styles.statusValue}>{currentPlanName}</Text>
            </View>
            <View>
              <Text style={styles.statusLabel}>Status</Text>
              <Text style={[styles.statusValue, { color: currentSubscription.status === 'active' ? '#4CAF50' : '#FF9800' }]}>
                {String(currentSubscription.status || '').replace(/_/g, ' ')}
              </Text>
            </View>
          </View>
          {currentSubscription.renews_at && (
            <>
              <Text style={styles.statusLabel}>Expires On</Text>
              <Text style={styles.statusValue}>{new Date(currentSubscription.renews_at).toLocaleDateString()}</Text>
            </>
          )}
          {currentSubscription.outstanding_amount > 0 && (
            <Text style={styles.dueText}>Outstanding due: INR {currentSubscription.outstanding_amount.toFixed(2)}</Text>
          )}
          {!!currentSubscription.last_payment_status && (
            <>
              <Text style={styles.statusLabel}>Last Payment</Text>
              <Text style={styles.statusValue}>{String(currentSubscription.last_payment_status).replace(/_/g, ' ')}</Text>
              {!!currentSubscription.last_payment_reject_reason && (
                <Text style={styles.rejectText}>{currentSubscription.last_payment_reject_reason}</Text>
              )}
            </>
          )}
          {currentSubscription.plan !== 'free' && (
            <TouchableOpacity style={styles.cancelButton} onPress={cancelSubscription} disabled={loading}>
              <Text style={styles.cancelButtonText}>Cancel Subscription</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {!!currentSubscription?.pending_dues?.length && (
        <View style={[styles.duesBlock, SHADOWS.card]}>
          <Text style={styles.sectionTitle}>Subscription Dues</Text>
          {currentSubscription.pending_dues.slice(0, 5).map((due) => (
            <View key={due.id || `${due.created_at}-${due.amount}`} style={styles.dueRow}>
              <View>
                <Text style={styles.dueAmount}>INR {Number(due.amount || 0).toFixed(2)}</Text>
                <Text style={styles.dueMeta}>
                  {String(due.status || 'due').replace(/_/g, ' ')} - cycle {due.cycle_number || 'N/A'}
                </Text>
              </View>
              <Text style={styles.dueDate}>{due.created_at ? new Date(due.created_at).toLocaleDateString() : ''}</Text>
            </View>
          ))}
        </View>
      )}

      {currentSubscription?.outstanding_amount > 0 && (
        <View style={[styles.paymentBlock, SHADOWS.card]}>
          <Text style={styles.sectionTitle}>Submit Due Payment</Text>
          <View style={styles.methodRow}>
            {paymentMethods.map((method) => (
              <TouchableOpacity
                key={method.value}
                style={[styles.methodChip, paymentMethod === method.value && styles.methodChipActive]}
                onPress={() => setPaymentMethod(method.value)}>
                <Text style={[styles.methodChipText, paymentMethod === method.value && styles.methodChipTextActive]}>
                  {method.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {!!currentSubscription.payment_options?.upi_id && (
            <Text style={styles.paymentHint}>UPI ID: {currentSubscription.payment_options.upi_id}</Text>
          )}
          {!!currentSubscription.payment_options?.qr_code_url && (
            <TouchableOpacity onPress={() => Linking.openURL(currentSubscription.payment_options.qr_code_url)}>
              <Text style={styles.paymentLink}>Open QR code</Text>
            </TouchableOpacity>
          )}
          {!!currentSubscription.payment_options?.razorpay_payment_link && (
            <TouchableOpacity onPress={() => Linking.openURL(currentSubscription.payment_options.razorpay_payment_link)}>
              <Text style={styles.paymentLink}>Open Razorpay payment link</Text>
            </TouchableOpacity>
          )}
          <VoiceTextInput
            value={paymentUtr}
            onChangeText={setPaymentUtr}
            placeholder="UTR or transaction ID"
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
          />
          <VoiceTextInput
            value={paymentRef}
            onChangeText={setPaymentRef}
            placeholder="Optional payment note"
            placeholderTextColor={COLORS.textMuted}
            style={styles.input}
          />
          <TouchableOpacity style={styles.payButton} onPress={submitDuePayment} disabled={payingDue}>
            <Text style={styles.payButtonText}>{payingDue ? 'Submitting...' : 'Submit Payment for Verification'}</Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={styles.sectionTitle}>{isDriver ? 'Choose Driver Plan' : 'Choose Your Plan'}</Text>
      <View style={styles.plansContainer}>{availablePlans.map(renderPlanCard)}</View>

      <View style={[styles.infoBlock, SHADOWS.card]}>
        <Text style={styles.sectionTitle}>How Activation Works</Text>
        <Text style={styles.infoText}>- Plans come from admin subscription configuration.</Text>
        <Text style={styles.infoText}>- Selecting a paid plan may require admin activation.</Text>
        <Text style={styles.infoText}>
          {isDriver
            ? '- Drivers may be blocked from accepting rides until plan and dues are active.'
            : '- Per-trip dues and payment options appear when configured.'}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 12 },
  errorText: { color: '#F44336', fontSize: 12, marginBottom: 12, fontWeight: '600', padding: 8, backgroundColor: '#FFEBEE', borderRadius: 4 },
  messageText: {
    color: '#4CAF50',
    fontSize: 12,
    marginBottom: 12,
    fontWeight: '600',
    padding: 8,
    backgroundColor: '#E8F5E9',
    borderRadius: 4,
  },
  currentStatusBlock: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textMain, marginBottom: 12 },
  statusContent: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  statusLabel: { fontSize: 12, color: COLORS.textMuted, marginBottom: 4 },
  statusValue: { fontSize: 15, fontWeight: '700', color: COLORS.textMain, textTransform: 'capitalize' },
  dueText: { color: '#D84315', fontSize: 13, fontWeight: '700', marginBottom: 12 },
  rejectText: { color: '#D32F2F', fontSize: 12, marginBottom: 8 },
  cancelButton: {
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D32F2F',
    alignItems: 'center',
  },
  cancelButtonText: { color: '#D32F2F', fontWeight: '700' },
  duesBlock: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 16, marginBottom: 16 },
  dueRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#ECECEC',
    paddingVertical: 10,
  },
  dueAmount: { fontSize: 14, fontWeight: '800', color: COLORS.textMain },
  dueMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 3, textTransform: 'capitalize' },
  dueDate: { fontSize: 12, color: COLORS.textMuted },
  paymentBlock: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 16, marginBottom: 16 },
  methodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  methodChip: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  methodChipActive: { borderColor: COLORS.primary, backgroundColor: 'rgba(255, 107, 53, 0.1)' },
  methodChipText: { color: COLORS.textMuted, fontWeight: '700' },
  methodChipTextActive: { color: COLORS.primary },
  paymentHint: { fontSize: 12, color: COLORS.textMain, marginBottom: 8 },
  paymentLink: { color: COLORS.primary, fontSize: 13, fontWeight: '700', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#D0D5DD',
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    color: COLORS.textMain,
    backgroundColor: '#FFFFFF',
  },
  payButton: { padding: 12, backgroundColor: COLORS.primary, borderRadius: 8, alignItems: 'center' },
  payButtonText: { color: '#FFFFFF', fontWeight: '800' },
  plansContainer: { marginBottom: 16 },
  planCard: { backgroundColor: '#FFFFFF', borderRadius: 12, overflow: 'hidden', marginBottom: 16 },
  planCardCurrent: { borderWidth: 2, borderColor: COLORS.primary },
  badge: { position: 'absolute', top: 10, right: 10, zIndex: 1, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  badgeText: { color: '#000', fontSize: 10, fontWeight: '800' },
  planHeader: { padding: 16 },
  planName: { fontSize: 20, fontWeight: '800', color: '#FFFFFF', marginBottom: 8 },
  priceBlock: { flexDirection: 'row', alignItems: 'baseline' },
  priceValue: { fontSize: 26, fontWeight: '800', color: '#FFFFFF' },
  pricePeriod: { fontSize: 12, color: '#FFFFFF', marginLeft: 8 },
  planContent: { padding: 16 },
  planDescription: { fontSize: 13, color: COLORS.textMuted, marginBottom: 14 },
  benefitsSection: { marginBottom: 16 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  benefitIcon: { color: '#4CAF50', fontWeight: '800', marginRight: 8, fontSize: 11 },
  benefitText: { flex: 1, fontSize: 13, color: COLORS.textMain },
  currentBadgeBlock: { padding: 12, backgroundColor: '#E8F5E9', borderRadius: 8, alignItems: 'center' },
  currentBadgeText: { color: '#2E7D32', fontWeight: '800' },
  selectButton: { padding: 12, backgroundColor: COLORS.primary, borderRadius: 8, alignItems: 'center' },
  selectButtonText: { color: '#FFFFFF', fontWeight: '800' },
  infoBlock: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 16, marginBottom: 16 },
  infoText: { fontSize: 13, color: COLORS.textMain, lineHeight: 20, marginBottom: 6 },
});
