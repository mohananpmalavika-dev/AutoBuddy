import React, { useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal, Alert } from 'react-native';
import { useRidePooling } from '../hooks/useRidePooling';
import { theme } from '../theme';

export function RidePoolingPanel({ isVisible, onClose, token, driverId }) {
  const { poolAnalytics, poolOpportunities, loadPoolingAnalytics } = useRidePooling({ token, driverId });

  useEffect(() => {
    if (isVisible) {
      loadPoolingAnalytics();
    }
  }, [isVisible, loadPoolingAnalytics]);

  const handleAcceptPool = (poolId) => {
    Alert.alert('Pool Accepted', `Ride pool ${poolId} has been accepted. You'll earn extra incentives!`);
  };

  const handlePreviewPool = (pool) => {
    Alert.alert(
      'Pool Details',
      `${pool.passengers_count} passengers, ${pool.potential_matches} possible matches, Rs ${pool.estimated_savings} estimated savings.`,
    );
  };

  return (
    <Modal visible={isVisible} animationType="slide" transparent>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Ride Pooling</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView style={styles.content}>
          {/* Analytics Summary */}
          {poolAnalytics && (
            <View style={styles.analyticsCard}>
              <Text style={styles.cardTitle}>📊 Pooling Analytics</Text>
              <View style={styles.statGrid}>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Pools Detected</Text>
                  <Text style={styles.statValue}>{poolAnalytics.total_pools_detected}</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Acceptance Rate</Text>
                  <Text style={styles.statValue}>{poolAnalytics.acceptance_rate.toFixed(1)}%</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Potential Savings</Text>
                  <Text style={styles.statValue}>₹{poolAnalytics.potential_savings}</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Earnings Increase</Text>
                  <Text style={styles.statValue}>{((poolAnalytics.earnings_with_pooling / poolAnalytics.earnings_without_pooling - 1) * 100).toFixed(1)}%</Text>
                </View>
              </View>
            </View>
          )}

          {/* Pool Opportunities */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🔍 Available Pools</Text>
            {poolOpportunities.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>No active pooling opportunities</Text>
                <Text style={styles.emptySubtext}>Check back later for matches</Text>
              </View>
            ) : (
              poolOpportunities.map((pool, index) => (
                <TouchableOpacity key={index} style={styles.poolCard} onPress={() => handlePreviewPool(pool)}>
                  <View style={styles.poolHeader}>
                    <Text style={styles.poolTitle}>Pool {pool.pool_id.split('_')[1]}</Text>
                    <Text style={styles.poolSavings}>Save ₹{pool.estimated_savings}</Text>
                  </View>
                  <View style={styles.poolInfo}>
                    <Text style={styles.poolText}>👥 {pool.passengers_count} passengers total</Text>
                    <Text style={styles.poolText}>🎯 {pool.potential_matches} potential matches</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.acceptButton}
                    onPress={() => handleAcceptPool(pool.pool_id)}
                  >
                    <Text style={styles.acceptButtonText}>Accept Pool</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              ))
            )}
          </View>

          {/* Tips */}
          <View style={styles.tipsCard}>
            <Text style={styles.tipsTitle}>💡 Pro Tips</Text>
            <Text style={styles.tipsText}>• Accept more pools to build trust and earn bonuses</Text>
            <Text style={styles.tipsText}>• Pooling increases efficiency by 20-40%</Text>
            <Text style={styles.tipsText}>• Best pooling opportunities during peak hours</Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.COLORS.BACKGROUND,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 50,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.COLORS.LIGHT_GRAY,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.COLORS.TEXT,
  },
  backButton: {
    padding: 8,
  },
  backText: {
    fontSize: 14,
    color: theme.COLORS.PRIMARY,
    fontWeight: '500',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  analyticsCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    ...theme.SHADOWS.small,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: theme.COLORS.TEXT,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  stat: {
    width: '48%',
    backgroundColor: theme.COLORS.BACKGROUND,
    padding: 12,
    borderRadius: 6,
  },
  statLabel: {
    fontSize: 12,
    color: theme.COLORS.TEXT_SECONDARY,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.COLORS.PRIMARY,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: theme.COLORS.TEXT,
  },
  poolCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: theme.COLORS.SUCCESS,
    ...theme.SHADOWS.small,
  },
  poolHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  poolTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.COLORS.TEXT,
  },
  poolSavings: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.COLORS.SUCCESS,
  },
  poolInfo: {
    marginBottom: 10,
  },
  poolText: {
    fontSize: 13,
    color: theme.COLORS.TEXT_SECONDARY,
    marginBottom: 4,
  },
  acceptButton: {
    backgroundColor: theme.COLORS.PRIMARY,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 12,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    color: theme.COLORS.TEXT,
    fontWeight: '500',
    marginBottom: 4,
  },
  emptySubtext: {
    fontSize: 12,
    color: theme.COLORS.TEXT_SECONDARY,
  },
  tipsCard: {
    backgroundColor: '#FFF9E6',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FFB800',
  },
  tipsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  tipsText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
});
