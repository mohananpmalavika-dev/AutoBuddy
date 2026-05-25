import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { PLAN_LABELS } from '@/lib/subscriptions';
import type { PlanOption, UserRole } from '@/lib/models';
import { COLORS } from '@/theme';

interface SubscriptionGateProps {
  role: UserRole;
  planOptions: PlanOption[];
  errorMessage: string;
  isSubmitting: boolean;
  onSelectPlan: (planType: PlanOption['planType']) => void;
}

export function SubscriptionGate({
  role,
  planOptions,
  errorMessage,
  isSubmitting,
  onSelectPlan,
}: SubscriptionGateProps) {
  const roleLabel = role === 'driver' ? 'driver' : 'passenger';

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Select a {roleLabel} subscription plan to continue</Text>
      <Text style={styles.hint}>This is required before entering the dashboard.</Text>
      {planOptions.length === 0 ? (
        <Text style={styles.error}>No paid plans are available right now.</Text>
      ) : (
        planOptions.map((plan) => (
          <TouchableOpacity
            key={plan.planType}
            style={[styles.planButton, !plan.active && styles.planButtonDisabled]}
            disabled={!plan.active || isSubmitting}
            onPress={() => onSelectPlan(plan.planType)}>
            <Text style={styles.planText}>
              {PLAN_LABELS[plan.planType]} - INR {plan.amount.toFixed(2)}
            </Text>
            <Text style={styles.planSub}>{plan.active ? 'Tap to select' : 'Inactive by admin'}</Text>
          </TouchableOpacity>
        ))
      )}
      {!!errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
      {isSubmitting && <ActivityIndicator size="small" color={COLORS.primary} style={styles.loader} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    width: '100%',
    maxWidth: 460,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
  },
  title: {
    color: COLORS.textMain,
    fontSize: 17,
    fontWeight: '800',
    marginBottom: 6,
  },
  hint: {
    color: COLORS.textMuted,
    marginBottom: 10,
  },
  planButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: COLORS.background,
    marginBottom: 8,
  },
  planButtonDisabled: {
    opacity: 0.5,
  },
  planText: {
    color: COLORS.textMain,
    fontWeight: '700',
  },
  planSub: {
    color: COLORS.textMuted,
    marginTop: 2,
    fontSize: 12,
  },
  error: {
    color: COLORS.danger,
    marginTop: 8,
  },
  loader: {
    marginTop: 10,
  },
});
