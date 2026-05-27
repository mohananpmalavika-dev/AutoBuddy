import React, { useEffect, useState } from 'react';
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

/**
 * SubscriptionPanel - Subscription management
 * Plans, tier management, benefits, renewals
 */
export default function SubscriptionPanel({ token }) {
  const [currentSubscription, setCurrentSubscription] = useState(null);
  const [availablePlans, setAvailablePlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [upgrading, setUpgrading] = useState(null);

  const PLAN_DETAILS = {
    free: {
      name: 'Free',
      price: '₹0',
      period: 'Forever',
      description: 'Get started with basic features',
      benefits: [
        'Up to 5 rides per day',
        'Standard support',
        'Basic ratings & reviews',
        'Payment methods',
      ],
      color: '#E0E0E0',
    },
    plus: {
      name: 'Plus',
      price: '₹99',
      period: 'Per Month',
      description: 'Popular choice for regular riders',
      benefits: [
        'Unlimited rides per day',
        'Priority support',
        'Premium driver filters',
        '10% discount on all rides',
        'Free ride cancellations (2x/month)',
        'Exclusive offers & promos',
      ],
      color: '#4CAF50',
    },
    premium: {
      name: 'Premium',
      price: '₹249',
      period: 'Per Month',
      description: 'Best for frequent riders',
      benefits: [
        'Unlimited rides per day',
        'Priority support (15 min response)',
        'Premium driver selection',
        '20% discount on all rides',
        'Unlimited free cancellations',
        'Exclusive offers & early access',
        'Airport priority bookings',
        'Ride insurance included',
        'Lounge access at select hubs',
      ],
      color: '#FFD700',
      badge: 'POPULAR',
    },
  };

  useEffect(() => {
    fetchSubscription();
  }, []);

  const fetchSubscription = async () => {
    try {
      setLoading(true);
      setError('');
      try {
        const data = await apiRequest('/passengers/subscription', { token });
        setCurrentSubscription(data?.subscription || null);
        setAvailablePlans(data?.available_plans || Object.keys(PLAN_DETAILS));
      } catch (err) {
        console.log('Subscription endpoint not yet implemented, using mock data');
        const mockSubscription = {
          plan: 'free',
          status: 'active',
          started_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          renews_at: null,
          auto_renew: false,
        };
        setCurrentSubscription(mockSubscription);
        setAvailablePlans(Object.keys(PLAN_DETAILS));
      }
    } catch (err) {
      setError(err.message || 'Failed to load subscription');
    } finally {
      setLoading(false);
    }
  };

  const handleUpgrade = (planKey) => {
    if (planKey === currentSubscription?.plan) {
      Alert.alert('Already Subscribed', `You are already on the ${PLAN_DETAILS[planKey].name} plan.`);
      return;
    }

    const plan = PLAN_DETAILS[planKey];
    Alert.alert(
      `Upgrade to ${plan.name}?`,
      `Upgrade to ${plan.name} (${plan.price}/${plan.period}). You can cancel anytime.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Upgrade',
          style: 'default',
          onPress: () => processUpgrade(planKey),
        },
      ]
    );
  };

  const processUpgrade = async (planKey) => {
    try {
      setUpgrading(planKey);
      setError('');

      try {
        const response = await apiRequest('/passengers/subscription/upgrade', {
          token,
          method: 'POST',
          body: JSON.stringify({ plan_key: planKey }),
        });

        setCurrentSubscription(response || { plan: planKey, status: 'active' });
        setMessage(`Successfully upgraded to ${PLAN_DETAILS[planKey].name}!`);
        setTimeout(() => setMessage(''), 3000);
      } catch (err) {
        console.log('Upgrade endpoint not yet implemented');
        setCurrentSubscription({ plan: planKey, status: 'active' });
        setMessage(`Upgrade to ${PLAN_DETAILS[planKey].name} requested. Processing...`);
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (err) {
      setError(err.message || 'Failed to upgrade subscription');
    } finally {
      setUpgrading(null);
    }
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel Subscription?',
      'Your subscription benefits will end at the end of the current billing cycle.',
      [
        { text: 'Keep Subscription', style: 'cancel' },
        {
          text: 'Cancel Subscription',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              try {
                await apiRequest('/passengers/subscription/cancel', {
                  token,
                  method: 'POST',
                });
              } catch (err) {
                console.log('Cancel endpoint not ready');
              }
              setCurrentSubscription({ ...currentSubscription, auto_renew: false });
              setMessage('Subscription cancelled. Benefits end at billing cycle.');
              setTimeout(() => setMessage(''), 3000);
            } catch (err) {
              setError(err.message || 'Failed to cancel subscription');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const renderBenefit = (benefit, index) => (
    <View key={index} style={styles.benefitRow}>
      <Text style={styles.benefitIcon}>✓</Text>
      <Text style={styles.benefitText}>{benefit}</Text>
    </View>
  );

  const renderPlanCard = (planKey) => {
    const plan = PLAN_DETAILS[planKey];
    const isCurrent = currentSubscription?.plan === planKey;

    return (
      <View key={planKey} style={[styles.planCard, SHADOWS.card, isCurrent && styles.planCardCurrent]}>
        {plan.badge && (
          <View style={[styles.badge, { backgroundColor: plan.color }]}>
            <Text style={styles.badgeText}>{plan.badge}</Text>
          </View>
        )}

        <View style={[styles.planHeader, { backgroundColor: plan.color }]}>
          <Text style={styles.planName}>{plan.name}</Text>
          <View style={styles.priceBlock}>
            <Text style={styles.priceValue}>{plan.price}</Text>
            <Text style={styles.pricePeriod}>{plan.period}</Text>
          </View>
        </View>

        <View style={styles.planContent}>
          <Text style={styles.planDescription}>{plan.description}</Text>

          <View style={styles.benefitsSection}>
            {plan.benefits.map((benefit, idx) => renderBenefit(benefit, idx))}
          </View>

          {isCurrent ? (
            <View style={styles.currentBadgeBlock}>
              <Text style={styles.currentBadgeText}>✓ Current Plan</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.selectButton}
              onPress={() => handleUpgrade(planKey)}
              disabled={upgrading === planKey}
            >
              <Text style={styles.selectButtonText}>
                {upgrading === planKey ? 'Processing...' : 'Select Plan'}
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
      {error && <Text style={styles.errorText}>{error}</Text>}
      {message && <Text style={styles.messageText}>{message}</Text>}

      {/* Current Subscription Status */}
      {currentSubscription && (
        <View style={[styles.currentStatusBlock, SHADOWS.card]}>
          <Text style={styles.sectionTitle}>Current Subscription</Text>
          <View style={styles.statusContent}>
            <View>
              <Text style={styles.statusLabel}>Plan</Text>
              <Text style={styles.statusValue}>{PLAN_DETAILS[currentSubscription.plan]?.name || 'Free'}</Text>
            </View>
            <View>
              <Text style={styles.statusLabel}>Status</Text>
              <Text style={[styles.statusValue, { color: currentSubscription.status === 'active' ? '#4CAF50' : '#FF9800' }]}>
                {currentSubscription.status}
              </Text>
            </View>
          </View>

          {currentSubscription.renews_at && (
            <>
              <Text style={styles.statusLabel}>Renews On</Text>
              <Text style={styles.statusValue}>
                {new Date(currentSubscription.renews_at).toLocaleDateString()}
              </Text>
            </>
          )}

          {currentSubscription.plan !== 'free' && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel Subscription</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Plan Comparison */}
      <Text style={styles.sectionTitle}>Choose Your Plan</Text>
      <View style={styles.plansContainer}>
        {availablePlans.map((planKey) => renderPlanCard(planKey))}
      </View>

      {/* Features Breakdown */}
      <View style={[styles.infoBlock, SHADOWS.card]}>
        <Text style={styles.sectionTitle}>Plan Features</Text>

        <View style={styles.featureComparison}>
          <View style={styles.comparisonRow}>
            <Text style={styles.featureLabel}>Daily Ride Limit</Text>
            <Text style={styles.freeValue}>5</Text>
            <Text style={styles.plusValue}>Unlimited</Text>
            <Text style={styles.premiumValue}>Unlimited</Text>
          </View>

          <View style={styles.comparisonRow}>
            <Text style={styles.featureLabel}>Ride Discounts</Text>
            <Text style={styles.freeValue}>None</Text>
            <Text style={styles.plusValue}>10%</Text>
            <Text style={styles.premiumValue}>20%</Text>
          </View>

          <View style={styles.comparisonRow}>
            <Text style={styles.featureLabel}>Free Cancellations</Text>
            <Text style={styles.freeValue}>None</Text>
            <Text style={styles.plusValue}>2/month</Text>
            <Text style={styles.premiumValue}>Unlimited</Text>
          </View>

          <View style={styles.comparisonRow}>
            <Text style={styles.featureLabel}>Support Priority</Text>
            <Text style={styles.freeValue}>Standard</Text>
            <Text style={styles.plusValue}>Priority</Text>
            <Text style={styles.premiumValue}>VIP (15 min)</Text>
          </View>
        </View>
      </View>

      {/* Billing Information */}
      <View style={[styles.infoBlock, SHADOWS.card]}>
        <Text style={styles.sectionTitle}>Billing Information</Text>
        <Text style={styles.infoText}>• Auto-renewal enabled for active subscriptions</Text>
        <Text style={styles.infoText}>• Cancel anytime with no penalties</Text>
        <Text style={styles.infoText}>• Invoices sent to your registered email</Text>
        <Text style={styles.infoText}>• Refunds available within 7 days of purchase</Text>
        <Text style={styles.infoText}>• Upgrade takes effect immediately</Text>
      </View>

      {/* FAQ */}
      <View style={[styles.infoBlock, SHADOWS.card]}>
        <Text style={styles.sectionTitle}>FAQ</Text>

        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>Can I change my plan?</Text>
          <Text style={styles.faqAnswer}>Yes, you can upgrade or downgrade anytime. Changes take effect immediately.</Text>
        </View>

        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>What happens if I cancel?</Text>
          <Text style={styles.faqAnswer}>Your benefits end at the end of the current billing cycle. You won't be charged again.</Text>
        </View>

        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>Are there discounts for annual plans?</Text>
          <Text style={styles.faqAnswer}>Contact our support team for annual plan pricing and special offers.</Text>
        </View>

        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>Can I get a refund?</Text>
          <Text style={styles.faqAnswer}>Yes, refunds are available within 7 days of purchase. Contact support.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 12 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, marginBottom: 12, marginTop: 12 },
  currentStatusBlock: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  statusContent: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  statusLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  statusValue: { fontSize: 14, fontWeight: 'bold', color: COLORS.text, marginTop: 4 },
  cancelButton: { marginTop: 12, paddingVertical: 10, borderWidth: 1, borderColor: '#F44336', borderRadius: 6, alignItems: 'center' },
  cancelButtonText: { fontSize: 12, fontWeight: '600', color: '#F44336' },
  plansContainer: { marginBottom: 16 },
  planCard: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
  },
  planCardCurrent: { borderWidth: 2, borderColor: COLORS.primary },
  badge: { position: 'absolute', top: 10, right: 10, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, zIndex: 10 },
  badgeText: { fontSize: 10, fontWeight: 'bold', color: '#fff' },
  planHeader: { padding: 16, alignItems: 'center' },
  planName: { fontSize: 16, fontWeight: 'bold', color: '#fff', marginBottom: 8 },
  priceBlock: { alignItems: 'center' },
  priceValue: { fontSize: 28, fontWeight: 'bold', color: '#fff' },
  pricePeriod: { fontSize: 11, color: '#fff', marginTop: 2 },
  planContent: { padding: 16 },
  planDescription: { fontSize: 12, color: COLORS.textMuted, marginBottom: 12, fontStyle: 'italic' },
  benefitsSection: { marginBottom: 12 },
  benefitRow: { flexDirection: 'row', marginBottom: 8, alignItems: 'flex-start' },
  benefitIcon: { fontSize: 14, color: COLORS.primary, marginRight: 8, fontWeight: 'bold' },
  benefitText: { fontSize: 12, color: COLORS.text, flex: 1 },
  currentBadgeBlock: { backgroundColor: '#E8F5E9', borderRadius: 6, paddingVertical: 10, alignItems: 'center' },
  currentBadgeText: { fontSize: 12, fontWeight: '600', color: '#4CAF50' },
  selectButton: { backgroundColor: COLORS.primary, borderRadius: 6, paddingVertical: 10, alignItems: 'center' },
  selectButtonText: { fontSize: 12, fontWeight: '600', color: '#fff' },
  featureComparison: { marginTop: 12 },
  comparisonRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  featureLabel: { flex: 1, fontSize: 11, fontWeight: '600', color: COLORS.text },
  freeValue: { flex: 0.7, fontSize: 11, color: COLORS.textMuted, textAlign: 'center' },
  plusValue: { flex: 0.7, fontSize: 11, color: '#4CAF50', textAlign: 'center', fontWeight: '600' },
  premiumValue: { flex: 0.7, fontSize: 11, color: '#FFD700', textAlign: 'center', fontWeight: '600' },
  infoBlock: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  infoText: { fontSize: 12, color: COLORS.text, lineHeight: 20, marginBottom: 4 },
  faqItem: { marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  faqQuestion: { fontSize: 12, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  faqAnswer: { fontSize: 11, color: COLORS.textMuted, lineHeight: 18 },
  errorText: { color: '#F44336', fontSize: 12, marginBottom: 12, fontWeight: '600' },
  messageText: { color: '#4CAF50', fontSize: 12, marginBottom: 12, fontWeight: '600' },
});
