import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  Pressable,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export interface DriverInfo {
  id: string;
  name: string;
  photo?: string;
  status: 'online' | 'offline' | 'on_ride';
  rating: number;
  rideCount: number;
  ridestoday: number;
  earningsToday: number;
  earningsWeek: number;
  acceptanceRate: number;
}

interface DriverManagementCardProps {
  driver: DriverInfo;
  onMessage?: () => void;
  onAdjustIncentive?: () => void;
  onViewHistory?: () => void;
}

export function DriverManagementCard({
  driver,
  onMessage,
  onAdjustIncentive,
  onViewHistory,
}: DriverManagementCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online':
        return '#4CAF50';
      case 'on_ride':
        return '#2196F3';
      default:
        return '#999';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'online':
        return 'Online';
      case 'on_ride':
        return 'On Ride';
      default:
        return 'Offline';
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Image
          source={{ uri: driver.photo || 'https://via.placeholder.com/80' }}
          style={styles.avatar}
        />
        <View style={styles.driverInfo}>
          <Text style={styles.name}>{driver.name}</Text>
          <Text style={styles.id}>ID: {driver.id}</Text>
        </View>
        <View style={styles.statusSection}>
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: getStatusColor(driver.status) },
            ]}
          >
            <Text style={styles.statusText}>
              {getStatusLabel(driver.status)}
            </Text>
          </View>
          <View style={styles.ratingBox}>
            <MaterialIcons name="star" size={14} color="#FFB800" />
            <Text style={styles.rating}>{driver.rating.toFixed(1)}</Text>
          </View>
        </View>
      </View>

      {/* Stats Grid */}
      <View style={styles.statsGrid}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Today's Rides</Text>
          <Text style={styles.statValue}>{driver.ridestoday}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Today's Earnings</Text>
          <Text style={styles.statValue}>₹{driver.earningsToday}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Week Earnings</Text>
          <Text style={styles.statValue}>₹{driver.earningsWeek}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Acceptance</Text>
          <Text style={styles.statValue}>{driver.acceptanceRate}%</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actionsGrid}>
        <Pressable style={styles.actionButton} onPress={onMessage}>
          <MaterialIcons name="message" size={20} color="#2196F3" />
          <Text style={styles.actionLabel}>Message</Text>
        </Pressable>

        <Pressable style={styles.actionButton} onPress={onAdjustIncentive}>
          <MaterialIcons name="card-giftcard" size={20} color="#2196F3" />
          <Text style={styles.actionLabel}>Incentive</Text>
        </Pressable>

        <Pressable style={styles.actionButton} onPress={onViewHistory}>
          <MaterialIcons name="history" size={20} color="#2196F3" />
          <Text style={styles.actionLabel}>History</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#f0f0f0',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    marginRight: 12,
    backgroundColor: '#f0f0f0',
  },
  driverInfo: {
    flex: 1,
  },
  name: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },
  id: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  statusSection: {
    alignItems: 'flex-end',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
  ratingBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  rating: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  statLabel: {
    fontSize: 10,
    color: '#666',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
  },
  actionsGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    gap: 6,
  },
  actionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2196F3',
  },
});
