/**
 * Manage Subscription Screen
 * View and manage current subscription
 */
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { subscriptionService } from '../../services/subscriptionService';
import { UserSubscription, SubscriptionUsage } from '../../types/subscription';

export default function ManageSubscriptionScreen({ navigation }: any) {
  const [subscription, setSubscription] = useState<UserSubscription | null>(null);
  const [usage, setUsage] = useState<SubscriptionUsage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [sub, usageData] = await Promise.all([
        subscriptionService.getMySubscription(),
        subscriptionService.getUsage().catch(() => null),
      ]);
      setSubscription(sub);
      setUsage(usageData);
    } catch (error) {
      Alert.alert('Error', 'Failed to load subscription details');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelSubscription = () => {
    Alert.alert(
      'Cancel Subscription',
      'Are you sure you want to cancel your subscription? You will continue to have access until the end of your current billing period.',
      [
        { text: 'Keep Subscription', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await subscriptionService.cancel({ cancel_at_period_end: true });
              Alert.alert('Success', 'Subscription will be canceled at the end of the billing period');
              loadData();
            } catch (error) {
              Alert.alert('Error', 'Failed to cancel subscription');
            }
          },
        },
      ]
    );
  };

  const handleUpgrade = () => {
    navigation.navigate('SubscriptionPlans');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  if (!subscription) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No active subscription</Text>
        <TouchableOpacity style={styles.button} onPress={() => navigation.navigate('SubscriptionPlans')}>
          <Text style={styles.buttonText}>View Plans</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const plan = subscription.plan;
  const statusColor = subscription.status === 'active' ? '#10B981' : '#EF4444';

  return (
    <ScrollView style={styles.container}>
      {/* Current Plan */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Current Plan</Text>
        <Text style={styles.planName}>{plan?.name || 'Unknown'}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor }]}>
          <Text style={styles.statusText}>{subscription.status.toUpperCase()}</Text>
        </View>
        
        {subscription.cancel_at_period_end && (
          <View style={styles.warningBox}>
            <Text style={styles.warningText}>
              ⚠️ Will cancel on {new Date(subscription.current_period_end).toLocaleDateString()}
            </Text>
          </View>
        )}
      </View>

      {/* Usage Stats */}
      {usage && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Usage This Period</Text>
          <View style={styles.usageRow}>
            <Text style={styles.usageLabel}>Rides Used:</Text>
            <Text style={styles.usageValue}>
              {usage.rides_used} {usage.rides_limit ? `/ ${usage.rides_limit}` : '(Unlimited)'}
            </Text>
          </View>
          {usage.usage_percentage !== null && (
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${usage.usage_percentage}%` }]} />
            </View>
          )}
          <View style={styles.usageRow}>
            <Text style={styles.usageLabel}>Period Ends:</Text>
            <Text style={styles.usageValue}>
              {new Date(usage.period_end).toLocaleDateString()} ({usage.days_remaining} days)
            </Text>
          </View>
        </View>
      )}

      {/* Features */}
      {plan?.features && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your Features</Text>
          {plan.features.ai_travel_intent && <FeatureItem text="✓ AI Travel Intent" />}
          {plan.features.family_assistant && <FeatureItem text="✓ Family Assistant" />}
          {plan.features.priority_support && <FeatureItem text="✓ Priority Support" />}
          {plan.features.no_surge_pricing && <FeatureItem text="✓ No Surge Pricing" />}
          {plan.features.discount_percentage > 0 && (
            <FeatureItem text={`✓ ${plan.features.discount_percentage}% Discount`} />
          )}
        </View>
      )}

      {/* Actions */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity style={[styles.button, styles.primaryButton]} onPress={handleUpgrade}>
          <Text style={styles.buttonText}>Upgrade Plan</Text>
        </TouchableOpacity>
        
        {!subscription.cancel_at_period_end && (
          <TouchableOpacity style={[styles.button, styles.dangerButton]} onPress={handleCancelSubscription}>
            <Text style={styles.buttonText}>Cancel Subscription</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const FeatureItem = ({ text }: { text: string }) => (
  <Text style={styles.featureText}>{text}</Text>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyText: { fontSize: 18, color: '#6B7280', marginBottom: 20 },
  card: { backgroundColor: '#FFFFFF', margin: 16, padding: 16, borderRadius: 12, elevation: 2 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#111827', marginBottom: 12 },
  planName: { fontSize: 24, fontWeight: 'bold', color: '#3B82F6', marginBottom: 8 },
  statusBadge: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  statusText: { color: '#FFFFFF', fontSize: 12, fontWeight: 'bold' },
  warningBox: { marginTop: 12, padding: 12, backgroundColor: '#FEF3C7', borderRadius: 8 },
  warningText: { color: '#92400E', fontSize: 14 },
  usageRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  usageLabel: { fontSize: 14, color: '#6B7280' },
  usageValue: { fontSize: 14, fontWeight: '600', color: '#111827' },
  progressBar: { height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, marginVertical: 12 },
  progressFill: { height: '100%', backgroundColor: '#3B82F6', borderRadius: 4 },
  featureText: { fontSize: 14, color: '#374151', marginBottom: 6 },
  actionsContainer: { padding: 16 },
  button: { padding: 16, borderRadius: 8, alignItems: 'center', marginBottom: 12 },
  primaryButton: { backgroundColor: '#3B82F6' },
  dangerButton: { backgroundColor: '#EF4444' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
});
