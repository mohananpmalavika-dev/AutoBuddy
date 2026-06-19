import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Animated,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRealtimeEarnings, EarningsUpdate } from '../hooks/useRealtimeEarnings';

interface DriverEarningsWidgetProps {
  initialEarnings?: {
    today?: number;
    week?: number;
    month?: number;
  };
  onEarningNotification?: (earning: EarningsUpdate) => void;
}

export const DriverEarningsWidget: React.FC<DriverEarningsWidgetProps> = ({
  initialEarnings,
  onEarningNotification,
}) => {
  const { earnings, latestEarning, incentive } = useRealtimeEarnings(initialEarnings);
  const [selectedPeriod, setSelectedPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [animatedValue] = useState(new Animated.Value(0));
  const [prevEarnings, setPrevEarnings] = useState(earnings.today);

  // Animate earning counter
  useEffect(() => {
    if (latestEarning) {
      onEarningNotification?.(latestEarning);

      // Trigger animation
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 300,
          delay: 2000,
          useNativeDriver: false,
        }),
      ]).start();

      setPrevEarnings(earnings.today);
    }
  }, [latestEarning, animatedValue, earnings.today, onEarningNotification]);

  const getCurrentEarnings = () => {
    switch (selectedPeriod) {
      case 'week':
        return earnings.week;
      case 'month':
        return earnings.month;
      default:
        return earnings.today;
    }
  };

  const getEarningsLabel = () => {
    switch (selectedPeriod) {
      case 'week':
        return "This Week's Earnings";
      case 'month':
        return "This Month's Earnings";
      default:
        return "Today's Earnings";
    }
  };

  return (
    <View style={styles.container}>
      {/* Main Earnings Card */}
      <View style={styles.mainCard}>
        <View style={styles.headerSection}>
          <Text style={styles.label}>{getEarningsLabel()}</Text>
          <View style={styles.badges}>
            <View style={[styles.badge, styles.badgeActive]}>
              <MaterialIcons name="trending-up" size={14} color="#2196F3" />
              <Text style={styles.badgeText}>+12%</Text>
            </View>
          </View>
        </View>

        {/* Earnings Amount with Animation */}
        <Animated.View
          style={[
            styles.amountContainer,
            {
              opacity: animatedValue.interpolate({
                inputRange: [0, 1],
                outputRange: [1, 1.2],
              }),
              transform: [
                {
                  scale: animatedValue.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.05],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={styles.amount}>₹{getCurrentEarnings().toFixed(0)}</Text>
        </Animated.View>

        {/* Latest Earning Notification */}
        {latestEarning && (
          <View style={styles.latestEarning}>
            <View style={styles.notificationBadge}>
              <MaterialIcons name="add" size={16} color="#4CAF50" />
            </View>
            <Text style={styles.notificationText}>
              You earned ₹{latestEarning.amount} from ride {latestEarning.ride_id?.slice(0, 8)}
            </Text>
          </View>
        )}

        {/* Incentive Popup */}
        {incentive && (
          <View style={[styles.incentiveCard, styles.incentiveVisible]}>
            <View style={styles.incentiveIcon}>
              <MaterialIcons name="local-offer" size={24} color="#FFB800" />
            </View>
            <View style={styles.incentiveContent}>
              <Text style={styles.incentiveTitle}>Incentive Unlocked!</Text>
              <Text style={styles.incentiveAmount}>₹{incentive.amount}</Text>
              <Text style={styles.incentiveDescription}>Complete 5 more rides today</Text>
            </View>
          </View>
        )}
      </View>

      {/* Period Tabs */}
      <View style={styles.tabsContainer}>
        {(['today', 'week', 'month'] as const).map((period) => (
          <Pressable
            key={period}
            style={[styles.tab, selectedPeriod === period && styles.tabActive]}
            onPress={() => setSelectedPeriod(period)}
          >
            <Text
              style={[styles.tabLabel, selectedPeriod === period && styles.tabLabelActive]}
            >
              {period.charAt(0).toUpperCase() + period.slice(1)}
            </Text>
            {selectedPeriod === period && <View style={styles.tabIndicator} />}
          </Pressable>
        ))}
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <StatCard
          icon="directions-car"
          label="Rides"
          value={earnings.total_rides.toString()}
          color="#2196F3"
        />
        <StatCard
          icon="star"
          label="Rating"
          value={earnings.average_rating.toFixed(1)}
          color="#FFB800"
        />
        <StatCard
          icon="check-circle"
          label="Acceptance"
          value={`${(earnings.acceptance_rate * 100).toFixed(0)}%`}
          color="#4CAF50"
        />
      </View>

      {/* Recent Rides Summary */}
      {earnings.recent_updates.length > 0 && (
        <View style={styles.recentSection}>
          <Text style={styles.recentTitle}>Recent Earnings</Text>
          {earnings.recent_updates.slice(0, 3).map((update, index) => (
            <View key={index} style={styles.recentItem}>
              <View style={styles.recentIcon}>
                <MaterialIcons name="done-all" size={16} color="#4CAF50" />
              </View>
              <View style={styles.recentDetails}>
                <Text style={styles.recentRideId}>Ride {update.ride_id?.slice(0, 8)}</Text>
                <Text style={styles.recentTime}>
                  {new Date(update.timestamp).toLocaleTimeString()}
                </Text>
              </View>
              <Text style={styles.recentAmount}>+₹{update.amount.toFixed(0)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Tips Section */}
      <View style={styles.tipsSection}>
        <View style={styles.tipCard}>
          <MaterialIcons name="lightbulb" size={20} color="#FFB800" />
          <View style={styles.tipContent}>
            <Text style={styles.tipTitle}>Pro Tip</Text>
            <Text style={styles.tipText}>Complete 2 more rides to unlock the ₹100 bonus!</Text>
          </View>
        </View>
      </View>
    </View>
  );
};

/**
 * Stat Card Component
 */
const StatCard: React.FC<{
  icon: string;
  label: string;
  value: string;
  color: string;
}> = ({ icon, label, value, color }) => {
  return (
    <View style={styles.statCard}>
      <View style={[styles.statIcon, { backgroundColor: `${color}20` }]}>
        <MaterialIcons name={icon as any} size={20} color={color} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f5f5f5',
  },
  mainCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    color: '#999',
    fontWeight: '500',
  },
  badges: {
    flexDirection: 'row',
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#f0f0f0',
  },
  badgeActive: {
    backgroundColor: '#E3F2FD',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2196F3',
  },
  amountContainer: {
    marginBottom: 16,
  },
  amount: {
    fontSize: 42,
    fontWeight: '700',
    color: '#000',
  },
  latestEarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    backgroundColor: '#F1F8E9',
    borderRadius: 8,
    marginTop: 12,
  },
  notificationBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationText: {
    flex: 1,
    fontSize: 12,
    color: '#2E7D32',
    fontWeight: '500',
  },
  incentiveCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    marginTop: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FFB800',
    opacity: 0,
  },
  incentiveVisible: {
    opacity: 1,
  },
  incentiveIcon: {
    width: 44,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#FFE082',
    alignItems: 'center',
    justifyContent: 'center',
  },
  incentiveContent: {
    flex: 1,
    justifyContent: 'center',
  },
  incentiveTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E65100',
    marginBottom: 2,
  },
  incentiveAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FF8F00',
  },
  incentiveDescription: {
    fontSize: 11,
    color: '#E65100',
    marginTop: 2,
  },
  tabsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingHorizontal: 16,
  },
  tab: {
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#2196F3',
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
  },
  tabLabelActive: {
    color: '#2196F3',
  },
  tabIndicator: {
    width: 4,
    height: 2,
    backgroundColor: '#2196F3',
    borderRadius: 1,
    marginTop: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statIcon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    color: '#999',
    fontWeight: '500',
  },
  recentSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  recentTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    marginBottom: 10,
  },
  recentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  recentIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentDetails: {
    flex: 1,
  },
  recentRideId: {
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
  },
  recentTime: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  recentAmount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4CAF50',
  },
  tipsSection: {
    marginBottom: 12,
  },
  tipCard: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    alignItems: 'flex-start',
  },
  tipContent: {
    flex: 1,
  },
  tipTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F57F17',
    marginBottom: 2,
  },
  tipText: {
    fontSize: 11,
    color: '#E65100',
    lineHeight: 16,
  },
});

export default DriverEarningsWidget;
