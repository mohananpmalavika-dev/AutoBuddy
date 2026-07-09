/**
 * Subscription Plans Screen
 * Displays all available subscription plans with comparison
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
import { SubscriptionPlan, SubscriptionTier } from '../../types/subscription';
import { useNavigation } from '@react-navigation/native';

export default function SubscriptionPlansScreen() {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentSubscription, setCurrentSubscription] = useState<any>(null);
  const navigation = useNavigation();

  useEffect(() => {
    loadPlans();
    loadCurrentSubscription();
  }, []);

  const loadPlans = async () => {
    try {
      const data = await subscriptionService.getPlans();
      setPlans(data);
    } catch (error) {
      Alert.alert('Error', 'Failed to load subscription plans');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentSubscription = async () => {
    try {
      const sub = await subscriptionService.getMySubscription();
      setCurrentSubscription(sub);
    } catch (error) {
      console.error('Failed to load current subscription:', error);
    }
  };

  const handleSelectPlan = (plan: SubscriptionPlan) => {
    if (currentSubscription?.plan_id === plan.id) {
      Alert.alert('Already Subscribed', 'You are already on this plan');
      return;
    }

    navigation.navigate('SubscriptionCheckout' as never, { plan } as never);
  };

  const getTierColor = (tier: SubscriptionTier) => {
    switch (tier) {
      case SubscriptionTier.SIMPLE:
        return '#6B7280';
      case SubscriptionTier.SMART:
        return '#3B82F6';
      case SubscriptionTier.PRO:
        return '#8B5CF6';
      default:
        return '#6B7280';
    }
  };

  const formatPrice = (price: number, currency: string) => {
    if (price === 0) return 'Free';
    return `${currency === 'USD' ? '$' : currency} ${price.toFixed(2)}`;
  };

  const formatBillingCycle = (cycle: string) => {
    return cycle.charAt(0).toUpperCase() + cycle.slice(1);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading plans...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Choose Your Plan</Text>
        <Text style={styles.subtitle}>
          Select the plan that best fits your needs
        </Text>
      </View>

      <View style={styles.plansContainer}>
        {plans.map((plan) => {
          const isCurrentPlan = currentSubscription?.plan_id === plan.id;
          const tierColor = getTierColor(plan.tier);

          return (
            <View
              key={plan.id}
              style={[
                styles.planCard,
                isCurrentPlan && styles.currentPlanCard,
                { borderColor: tierColor },
              ]}
            >
              {/* Plan Header */}
              <View style={[styles.planHeader, { backgroundColor: tierColor }]}>
                <Text style={styles.planName}>{plan.name}</Text>
                {plan.trial_days > 0 && (
                  <View style={styles.trialBadge}>
                    <Text style={styles.trialText}>
                      {plan.trial_days} Days Free Trial
                    </Text>
                  </View>
                )}
              </View>

              {/* Plan Price */}
              <View style={styles.priceContainer}>
                <Text style={styles.price}>
                  {formatPrice(plan.price, plan.currency)}
                </Text>
                {plan.price > 0 && (
                  <Text style={styles.billingCycle}>
                    /{formatBillingCycle(plan.billing_cycle)}
                  </Text>
                )}
              </View>

              {/* Plan Description */}
              {plan.description && (
                <Text style={styles.description}>{plan.description}</Text>
              )}

              {/* Plan Features */}
              <View style={styles.featuresContainer}>
                <FeatureItem
                  icon="✓"
                  text={
                    plan.features.max_rides_per_month
                      ? `${plan.features.max_rides_per_month} rides per month`
                      : 'Unlimited rides'
                  }
                />
                {plan.features.ai_travel_intent && (
                  <FeatureItem icon="✓" text="AI Travel Intent" />
                )}
                {plan.features.family_assistant && (
                  <FeatureItem icon="✓" text="Family Assistant" />
                )}
                {plan.features.priority_support && (
                  <FeatureItem icon="✓" text="Priority Support" />
                )}
                {plan.features.no_surge_pricing && (
                  <FeatureItem icon="✓" text="No Surge Pricing" />
                )}
                {plan.features.premium_vehicles && (
                  <FeatureItem icon="✓" text="Premium Vehicles" />
                )}
                {plan.features.discount_percentage > 0 && (
                  <FeatureItem
                    icon="✓"
                    text={`${plan.features.discount_percentage}% Discount on Rides`}
                  />
                )}
                {plan.features.free_cancellations_per_month > 0 && (
                  <FeatureItem
                    icon="✓"
                    text={`${plan.features.free_cancellations_per_month} Free Cancellations`}
                  />
                )}
                <FeatureItem
                  icon="✓"
                  text={`${plan.features.ride_history_days} Days History`}
                />
                <FeatureItem
                  icon="✓"
                  text={`${plan.features.concurrent_bookings} Concurrent Bookings`}
                />
              </View>

              {/* Action Button */}
              <TouchableOpacity
                style={[
                  styles.selectButton,
                  isCurrentPlan && styles.currentButton,
                  { backgroundColor: isCurrentPlan ? '#6B7280' : tierColor },
                ]}
                onPress={() => handleSelectPlan(plan)}
                disabled={isCurrentPlan}
              >
                <Text style={styles.selectButtonText}>
                  {isCurrentPlan ? 'Current Plan' : 'Select Plan'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      {currentSubscription && (
        <TouchableOpacity
          style={styles.manageButton}
          onPress={() => navigation.navigate('ManageSubscription' as never)}
        >
          <Text style={styles.manageButtonText}>Manage My Subscription</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const FeatureItem = ({ icon, text }: { icon: string; text: string }) => (
  <View style={styles.featureItem}>
    <Text style={styles.featureIcon}>{icon}</Text>
    <Text style={styles.featureText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#6B7280',
  },
  header: {
    padding: 20,
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
  },
  plansContainer: {
    padding: 16,
  },
  planCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 2,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  currentPlanCard: {
    borderWidth: 3,
  },
  planHeader: {
    padding: 16,
    alignItems: 'center',
  },
  planName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  trialBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 8,
  },
  trialText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  price: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#111827',
  },
  billingCycle: {
    fontSize: 16,
    color: '#6B7280',
    marginLeft: 4,
  },
  description: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  featuresContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  featureIcon: {
    fontSize: 16,
    color: '#10B981',
    marginRight: 8,
    fontWeight: 'bold',
  },
  featureText: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  selectButton: {
    margin: 16,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  currentButton: {
    opacity: 0.7,
  },
  selectButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  manageButton: {
    margin: 16,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#3B82F6',
    alignItems: 'center',
  },
  manageButtonText: {
    color: '#3B82F6',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
