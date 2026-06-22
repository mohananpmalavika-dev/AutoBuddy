import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Dimensions } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface PricingBreakdown {
  baseFare: number;
  distanceFare: number;
  surgeFare: number;
  discount: number;
  taxes: number;
  total: number;
}

interface DynamicPricingVisualizationProps {
  pricing: PricingBreakdown;
  isExpanded?: boolean;
  onToggle?: () => void;
}

/**
 * Dynamic Pricing Visualization
 * Shows real-time pricing breakdown with animations
 */
export const DynamicPricingVisualization: React.FC<
  DynamicPricingVisualizationProps
> = ({ pricing, isExpanded = false, onToggle }) => {
  const expandAnim = useRef(new Animated.Value(isExpanded ? 1 : 0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: isExpanded ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, [expandAnim, fadeAnim, isExpanded]);

  const maxHeight = expandAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 320],
  });

  const PricingRow = ({
    label,
    amount,
    icon,
    isTotal = false,
  }: {
    label: string;
    amount: number;
    icon: string;
    isTotal?: boolean;
  }) => (
    <Animated.View
      style={[styles.pricingRow, { opacity: fadeAnim }]}
    >
      <View style={styles.rowLeft}>
        <MaterialIcons
          name={icon as any}
          size={18}
          color={isTotal ? '#2196F3' : '#999'}
        />
        <Text style={[styles.rowLabel, isTotal && styles.totalLabel]}>
          {label}
        </Text>
      </View>
      <Text style={[styles.rowAmount, isTotal && styles.totalAmount]}>
        ₹{amount.toFixed(2)}
      </Text>
    </Animated.View>
  );

  return (
    <Animated.View
      style={[
        styles.container,
        { opacity: fadeAnim },
      ]}
    >
      {/* Summary card */}
      <View style={styles.summaryCard}>
        <View style={styles.summaryContent}>
          <Text style={styles.summaryLabel}>Total Fare</Text>
          <Text style={styles.summaryAmount}>₹{pricing.total.toFixed(2)}</Text>
        </View>
        <View style={styles.expandButton}>
          <Animated.View
            style={{
              transform: [
                {
                  rotate: expandAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '180deg'],
                  }),
                },
              ],
            }}
          >
            <MaterialIcons
              name="expand-more"
              size={24}
              color="#2196F3"
              onPress={onToggle}
            />
          </Animated.View>
        </View>
      </View>

      {/* Expanded breakdown */}
      <Animated.View
        style={[
          styles.breakdown,
          { maxHeight },
        ]}
      >
        <PricingRow
          label="Base Fare"
          amount={pricing.baseFare}
          icon="home"
        />
        <PricingRow
          label="Distance Fare"
          amount={pricing.distanceFare}
          icon="directions"
        />

        {pricing.surgeFare > 0 && (
          <>
            <View style={styles.surgeBadge}>
              <MaterialIcons name="bolt" size={14} color="#FF9800" />
              <Text style={styles.surgeBadgeText}>Surge Pricing</Text>
              <Text style={styles.surgeAmount}>
                +₹{pricing.surgeFare.toFixed(2)}
              </Text>
            </View>
            <PricingRow
              label="Surge"
              amount={pricing.surgeFare}
              icon="trending-up"
            />
          </>
        )}

        <View style={styles.divider} />

        {pricing.discount > 0 && (
          <Animated.View
            style={[
              styles.discountRow,
              { opacity: fadeAnim },
            ]}
          >
            <View style={styles.rowLeft}>
              <MaterialIcons name="local-offer" size={18} color="#4CAF50" />
              <Text style={[styles.rowLabel, styles.discountLabel]}>
                Discount Applied
              </Text>
            </View>
            <Text style={[styles.rowAmount, styles.discountAmount]}>
              -₹{pricing.discount.toFixed(2)}
            </Text>
          </Animated.View>
        )}

        <PricingRow
          label="Taxes & Fees"
          amount={pricing.taxes}
          icon="receipt"
        />

        <View style={styles.divider} />

        <PricingRow
          label="Total"
          amount={pricing.total}
          icon="check-circle"
          isTotal
        />
      </Animated.View>

      {/* Live update indicator */}
      <View style={styles.liveIndicator}>
        <View style={styles.liveDot} />
        <Text style={styles.liveText}>Pricing updates in real-time</Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(33, 150, 243, 0.2)',
    elevation: 6,
    shadowColor: '#2196F3',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  summaryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F5F9FF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(33, 150, 243, 0.1)',
  },
  summaryContent: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#999',
    marginBottom: 2,
  },
  summaryAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2196F3',
  },
  expandButton: {
    padding: 8,
  },
  breakdown: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  pricingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  totalLabel: {
    fontWeight: '700',
    color: '#2196F3',
  },
  rowAmount: {
    fontSize: 13,
    color: '#333',
    fontWeight: '600',
  },
  totalAmount: {
    fontSize: 16,
    color: '#2196F3',
    fontWeight: '700',
  },
  surgeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF3E0',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 8,
  },
  surgeBadgeText: {
    fontSize: 12,
    color: '#FF9800',
    fontWeight: '600',
    flex: 1,
  },
  surgeAmount: {
    fontSize: 12,
    color: '#FF9800',
    fontWeight: '700',
  },
  discountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#F1F8E9',
    paddingHorizontal: 8,
    borderRadius: 8,
    marginVertical: 8,
  },
  discountLabel: {
    color: '#4CAF50',
    fontWeight: '600',
  },
  discountAmount: {
    color: '#4CAF50',
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: 8,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#E8F5E9',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
  },
  liveText: {
    fontSize: 11,
    color: '#4CAF50',
    fontWeight: '500',
  },
});
