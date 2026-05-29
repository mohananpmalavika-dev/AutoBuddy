import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS } from '../theme';
import { apiRequest } from '../lib/api';
import { GlassCard, PremiumEmptyState } from './PremiumUI';

export default function DriverTierBenefitsPanel({ token, onTierUpgrade = undefined }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tierData, setTierData] = useState(null);
  const [nextTierProgress, setNextTierProgress] = useState(0);

  const fetchTierBenefits = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await apiRequest('/drivers/tier-benefits', { token });
      if (data) {
        setTierData(data);
        const progress = data.current_tier_progress || 0;
        setNextTierProgress(progress);
      }
    } catch (err) {
      setError(err.message || 'Could not load tier benefits');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTierBenefits().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchTierBenefits]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchTierBenefits}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!tierData) {
    return (
      <PremiumEmptyState
        title="No Tier Data"
        subtitle="Could not load your driver tier information"
      />
    );
  }

  const tierName = tierData.current_tier || 'Standard';
  const tiers = tierData.available_tiers || [];
  const currentTierIndex = tiers.findIndex(t => t.name === tierName);
  const nextTier = currentTierIndex >= 0 && currentTierIndex < tiers.length - 1 
    ? tiers[currentTierIndex + 1] 
    : null;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Current Tier Card */}
      <GlassCard style={styles.tierCard}>
        <View style={styles.tierHeader}>
          <Text style={styles.tierTitle}>Current Tier</Text>
          <View style={styles.tierBadge}>
            <Text style={styles.tierBadgeText}>{tierName}</Text>
          </View>
        </View>
        
        {tierData.current_benefits && Object.entries(tierData.current_benefits).map(([key, value]) => (
          <View key={key} style={styles.benefitRow}>
            <Text style={styles.benefitLabel}>{formatBenefitLabel(key)}</Text>
            <Text style={styles.benefitValue}>{formatBenefitValue(key, value)}</Text>
          </View>
        ))}
      </GlassCard>

      {/* Progress to Next Tier */}
      {nextTier && (
        <GlassCard style={styles.progressCard}>
          <Text style={styles.progressTitle}>Progress to {nextTier.name}</Text>
          <View style={styles.progressBarContainer}>
            <View 
              style={[
                styles.progressBar, 
                { width: `${Math.min(nextTierProgress, 100)}%` }
              ]} 
            />
          </View>
          <Text style={styles.progressText}>{Math.round(nextTierProgress)}% Complete</Text>
          
          {nextTier.requirements && (
            <View style={styles.requirementsContainer}>
              <Text style={styles.requirementsTitle}>Requirements:</Text>
              {Object.entries(nextTier.requirements).map(([key, value]) => (
                <View key={key} style={styles.requirementRow}>
                  <Text style={styles.requirementLabel}>• {formatRequirementLabel(key)}</Text>
                  <Text style={styles.requirementValue}>{value}</Text>
                </View>
              ))}
            </View>
          )}
        </GlassCard>
      )}

      {/* Available Tiers */}
      <Text style={styles.sectionTitle}>All Tiers</Text>
      {tiers.map((tier) => (
        <GlassCard 
          key={tier.name} 
          style={[
            styles.tierListCard,
            tier.name === tierName && styles.tierListCardActive
          ]}
        >
          <View style={styles.tierListHeader}>
            <Text style={[
              styles.tierListName,
              tier.name === tierName && styles.tierListNameActive
            ]}>
              {tier.name}
            </Text>
            {tier.name === tierName && (
              <View style={styles.activeBadge}>
                <Text style={styles.activeBadgeText}>Current</Text>
              </View>
            )}
          </View>
          
          {tier.benefits && Object.entries(tier.benefits).map(([key, value]) => (
            <View key={key} style={styles.tierBenefitRow}>
              <Text style={styles.tierBenefitLabel}>
                {formatBenefitLabel(key)}:
              </Text>
              <Text style={styles.tierBenefitValue}>{formatBenefitValue(key, value)}</Text>
            </View>
          ))}
        </GlassCard>
      ))}
    </ScrollView>
  );
}

function formatBenefitLabel(key) {
  return key
    .replace(/_/g, ' ')
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function formatBenefitValue(key, value) {
  if (typeof value === 'number') {
    if (key.includes('rate') || key.includes('multiplier')) {
      return value.toFixed(2);
    }
    return value.toString();
  }
  return String(value);
}

function formatRequirementLabel(key) {
  return formatBenefitLabel(key);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  tierCard: {
    marginBottom: 16,
    padding: 16,
  },
  tierHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tierTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  tierBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  tierBadgeText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  benefitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  benefitLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  benefitValue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  progressCard: {
    marginBottom: 16,
    padding: 16,
  },
  progressTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: COLORS.border,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.primary,
  },
  progressText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 12,
  },
  requirementsContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  requirementsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  requirementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  requirementLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  requirementValue: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  tierListCard: {
    marginBottom: 12,
    padding: 12,
  },
  tierListCardActive: {
    backgroundColor: `${COLORS.primary}10`,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  tierListHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tierListName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  tierListNameActive: {
    color: COLORS.primary,
  },
  activeBadge: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeBadgeText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 10,
  },
  tierBenefitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    fontSize: 12,
  },
  tierBenefitLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  tierBenefitValue: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  errorText: {
    color: COLORS.error,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center',
  },
});
