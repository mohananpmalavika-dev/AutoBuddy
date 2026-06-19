import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export interface EarningsData {
  today: number;
  week: number;
  month: number;
  statistics: {
    ridesCount: number;
    distance: number;
    avgRating: number;
    completionRate: number;
  };
  nextPayoutDate?: string;
  payoutAmount?: number;
  comparison?: {
    percentChange: number;
    previousAmount: number;
  };
}

interface DriverEarningsWidgetProps {
  earnings: EarningsData;
  loading?: boolean;
  onViewDetails?: () => void;
}

export function DriverEarningsWidget({
  earnings,
  loading = false,
  onViewDetails,
}: DriverEarningsWidgetProps) {
  const comparisonPercent = earnings.comparison?.percentChange || 0;
  const isPositive = comparisonPercent >= 0;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Main earnings card */}
      <View style={styles.mainCard}>
        <View style={styles.amountSection}>
          <Text style={styles.label}>Today's Earnings</Text>
          <View style={styles.amountRow}>
            <Text style={styles.amount}>₹ {earnings.today.toLocaleString('en-IN')}</Text>
            {earnings.comparison && (
              <View
                style={[
                  styles.comparisonBadge,
                  isPositive ? styles.positiveBadge : styles.negativeBadge,
                ]}
              >
                <MaterialIcons
                  name={isPositive ? 'trending-up' : 'trending-down'}
                  size={14}
                  color={isPositive ? '#4CAF50' : '#F44336'}
                />
                <Text style={[
                  styles.comparisonText,
                  isPositive ? styles.positiveText : styles.negativeText,
                ]}>
                  {isPositive ? '+' : ''}{comparisonPercent}%
                </Text>
              </View>
            )}
          </View>
          {earnings.comparison && (
            <Text style={styles.comparisonLabel}>
              vs your average (₹{earnings.comparison.previousAmount.toLocaleString('en-IN')})
            </Text>
          )}
        </View>

        {/* Quick stats grid */}
        <View style={styles.statsGrid}>
          <StatItem
            label="Rides"
            value={earnings.statistics.ridesCount}
            icon="local-taxi"
          />
          <StatItem
            label="Distance"
            value={`${earnings.statistics.distance}km`}
            icon="navigation"
          />
          <StatItem
            label="Rating"
            value={`⭐${earnings.statistics.avgRating}`}
            icon="star"
          />
          <StatItem
            label="Completion"
            value={`${earnings.statistics.completionRate}%`}
            icon="done-all"
          />
        </View>
      </View>

      {/* Period breakdown */}
      <View style={styles.periodSection}>
        <PeriodRow label="This Week" amount={earnings.week} />
        <PeriodRow label="This Month" amount={earnings.month} />
      </View>

      {/* Payout info */}
      {earnings.nextPayoutDate && earnings.payoutAmount && (
        <View style={styles.payoutCard}>
          <View style={styles.payoutHeader}>
            <MaterialIcons name="account-balance" size={20} color="#2196F3" />
            <Text style={styles.payoutTitle}>Next Payout</Text>
          </View>
          <Text style={styles.payoutAmount}>
            ₹ {earnings.payoutAmount.toLocaleString('en-IN')}
          </Text>
          <Text style={styles.payoutDate}>
            Scheduled for: {formatDate(earnings.nextPayoutDate)}
          </Text>
          <Text style={styles.payoutNote}>
            Payouts are processed every Friday to your registered bank account.
          </Text>
        </View>
      )}

      {/* Tips for earning more */}
      <View style={styles.tipsSection}>
        <Text style={styles.tipsTitle}>💡 Earn More Tips</Text>
        <TipItem text="Accept rides during peak hours for surge pricing" />
        <TipItem text="Maintain high ratings for priority ride requests" />
        <TipItem text="Complete rides on time to improve acceptance rate" />
      </View>
    </View>
  );
}

interface StatItemProps {
  label: string;
  value: string | number;
  icon: string;
}

function StatItem({ label, value, icon }: StatItemProps) {
  return (
    <View style={styles.statItem}>
      <MaterialIcons name={icon as any} size={20} color="#2196F3" />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

interface PeriodRowProps {
  label: string;
  amount: number;
}

function PeriodRow({ label, amount }: PeriodRowProps) {
  return (
    <View style={styles.periodRow}>
      <Text style={styles.periodLabel}>{label}</Text>
      <Text style={styles.periodAmount}>₹ {amount.toLocaleString('en-IN')}</Text>
    </View>
  );
}

interface TipItemProps {
  text: string;
}

function TipItem({ text }: TipItemProps) {
  return (
    <View style={styles.tipItem}>
      <View style={styles.tipDot} />
      <Text style={styles.tipText}>{text}</Text>
    </View>
  );
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  loadingContainer: {
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mainCard: {
    marginBottom: 20,
  },
  amountSection: {
    marginBottom: 20,
  },
  label: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
    marginBottom: 8,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  amount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#000',
  },
  comparisonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  positiveBadge: {
    backgroundColor: '#E8F5E9',
  },
  negativeBadge: {
    backgroundColor: '#FFEBEE',
  },
  comparisonText: {
    marginLeft: 4,
    fontWeight: '600',
    fontSize: 12,
  },
  positiveText: {
    color: '#2E7D32',
  },
  negativeText: {
    color: '#C62828',
  },
  comparisonLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 6,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
    marginTop: 6,
  },
  statLabel: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  periodSection: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  periodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  periodLabel: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  periodAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
  payoutCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  payoutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  payoutTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1565C0',
    marginLeft: 8,
  },
  payoutAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2196F3',
    marginBottom: 4,
  },
  payoutDate: {
    fontSize: 12,
    color: '#0D47A1',
    marginBottom: 6,
  },
  payoutNote: {
    fontSize: 11,
    color: '#555',
    fontStyle: 'italic',
  },
  tipsSection: {
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    padding: 12,
  },
  tipsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F57F17',
    marginBottom: 10,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  tipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F57F17',
    marginRight: 10,
    marginTop: 6,
  },
  tipText: {
    fontSize: 12,
    color: '#333',
    flex: 1,
  },
});
