import React, { useCallback, useEffect, useMemo, useState } from 'react';
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

const PLAN_DETAILS = {
  free: {
    name: 'Free',
    period: 'Forever',
    description: 'Basic access with no paid subscription selected.',
    benefits: ['Book standard rides', 'Standard support', 'Ratings & reviews', 'Saved payment methods'],
    color: '#E0E0E0',
  },
  monthly: {
    name: 'Monthly',
    period: 'Per Month',
    description: 'Monthly admin-activated passenger plan.',
    benefits: ['Regular rider plan', 'Admin-verified activation', 'Subscription status tracking'],
    color: '#4CAF50',
  },
  quarterly: {
    name: 'Quarterly',
    period: 'Every 3 Months',
    description: 'Longer subscription period for regular riders.',
    benefits: ['Quarterly validity', 'Admin-verified activation', 'Fewer renewal cycles'],
    color: '#FFD700',
    badge: 'POPULAR',
  },
  annually: {
    name: 'Annually',
    period: 'Per Year',
    description: 'Annual subscription for frequent riders.',
    benefits: ['Annual validity', 'Admin-verified activation', 'Best for frequent riders'],
    color: '#7E57C2',
  },
  per_trip: {
    name: 'Per Trip',
    period: 'Usage Based',
    description: 'Dues are generated after ride thresholds.',
    benefits: ['Usage-based dues', 'Payment verification flow', 'Ride threshold tracking'],
    color: '#29B6F6',
  },
};

function planPrice(planKey, planConfig) {
  if (planKey === 'free') {
    return 'INR 0';
  }
  return `INR ${Number(planConfig?.amount || 0).toFixed(2)}`;
}

function normalizeSubscription(subscription = {}, paymentOptions = {}, pendingDues = []) {
  const plan = subscription.plan_type || 'free';
  return {
    ...subscription,
    plan,
    status: subscription.is_active ? 'active' : plan === 'free' ? 'active' : 'pending_admin_activation',
    renews_at: subscription.period_expires_at || null,
    outstanding_amount: Number(subscription.outstanding_amount || 0),
    payment_options: paymentOptions,
    pending_dues: pendingDues,
  };
}

export default function SubscriptionPanel({ token }) {
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [availablePlans, setAvailablePlans] = useState(['free']);
  const [planConfig, setPlanConfig] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [upgrading, setUpgrading] = useState(null);

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
    () => PLAN_DETAILS[currentSubscription?.plan]?.name || 'Free',
    [currentSubscription?.plan],
  );

  const selectPlan = async (planKey) => {
    if (planKey === currentSubscription?.plan) {
      Alert.alert('Already Selected', `You are already on the ${PLAN_DETAILS[planKey]?.name || planKey} plan.`);
      return;
    }
    if (planKey === 'free') {
      Alert.alert('Free Plan', 'Free access is available when no paid plan is selected.');
      return;
    }

    const plan = PLAN_DETAILS[planKey] || { name: planKey, period: '' };
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
                normalizeSubscription(response?.subscription || { ...(prev || {}), plan_type: planKey }),
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
    Alert.alert('Cancel Subscription?', 'This submits a cancellation request and returns you to free access.', [
      { text: 'Keep Plan', style: 'cancel' },
      {
        text: 'Cancel Plan',
        style: 'destructive',
        onPress: async () => {
          try {
            setLoading(true);
            setError('');
            await apiRequest('/passengers/subscription/cancel', { token, method: 'POST' });
            setCurrentSubscription((prev) => normalizeSubscription({ ...(prev || {}), plan_type: null, is_active: false }));
            setMessage('Subscription cancellation submitted.');
            setTimeout(() => setMessage(''), 3000);
          } catch (err) {
            setError(err.message || 'Failed to cancel subscription');
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const renderBenefit = (benefit) => (
    <View key={benefit} style={styles.benefitRow}>
      <Text style={styles.benefitIcon}>✓</Text>
      <Text style={styles.benefitText}>{benefit}</Text>
    </View>
  );

  const renderPlanCard = (planKey) => {
    const plan = PLAN_DETAILS[planKey];
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
              <Text style={styles.currentBadgeText}>✓ Current Plan</Text>
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
          <Text style={styles.sectionTitle}>Current Subscription</Text>
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
          {currentSubscription.plan !== 'free' && (
            <TouchableOpacity style={styles.cancelButton} onPress={cancelSubscription} disabled={loading}>
              <Text style={styles.cancelButtonText}>Cancel Subscription</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <Text style={styles.sectionTitle}>Choose Your Plan</Text>
      <View style={styles.plansContainer}>{availablePlans.map(renderPlanCard)}</View>

      <View style={[styles.infoBlock, SHADOWS.card]}>
        <Text style={styles.sectionTitle}>How Activation Works</Text>
        <Text style={styles.infoText}>• Plans come from admin subscription configuration.</Text>
        <Text style={styles.infoText}>• Selecting a paid plan may require admin activation.</Text>
        <Text style={styles.infoText}>• Per-trip dues and payment options appear when configured.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 12 },
  errorText: { color: '#D32F2F', fontSize: 12, marginBottom: 10 },
  messageText: {
    color: '#2E7D32',
    fontSize: 12,
    marginBottom: 10,
    padding: 10,
    backgroundColor: '#E8F5E9',
    borderRadius: 6,
  },
  currentStatusBlock: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textMain, marginBottom: 12 },
  statusContent: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  statusLabel: { fontSize: 12, color: COLORS.textMuted, marginBottom: 4 },
  statusValue: { fontSize: 15, fontWeight: '700', color: COLORS.textMain, textTransform: 'capitalize' },
  dueText: { color: '#D84315', fontSize: 13, fontWeight: '700', marginBottom: 12 },
  cancelButton: {
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D32F2F',
    alignItems: 'center',
  },
  cancelButtonText: { color: '#D32F2F', fontWeight: '700' },
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
  benefitIcon: { color: '#4CAF50', fontWeight: '800', marginRight: 8 },
  benefitText: { flex: 1, fontSize: 13, color: COLORS.textMain },
  currentBadgeBlock: { padding: 12, backgroundColor: '#E8F5E9', borderRadius: 8, alignItems: 'center' },
  currentBadgeText: { color: '#2E7D32', fontWeight: '800' },
  selectButton: { padding: 12, backgroundColor: COLORS.primary, borderRadius: 8, alignItems: 'center' },
  selectButtonText: { color: '#FFFFFF', fontWeight: '800' },
  infoBlock: { backgroundColor: '#FFFFFF', borderRadius: 10, padding: 16, marginBottom: 16 },
  infoText: { fontSize: 13, color: COLORS.textMain, lineHeight: 20, marginBottom: 6 },
});
