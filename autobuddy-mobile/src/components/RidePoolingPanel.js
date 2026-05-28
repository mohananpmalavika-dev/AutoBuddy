import React, { useEffect } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRidePooling } from '../hooks/useRidePooling';
import { theme } from '../theme';

export function RidePoolingPanel({ isVisible, onClose, token, driverId }) {
  const {
    error,
    isLoading,
    poolAnalytics,
    poolOpportunities,
    loadPoolingAnalytics,
    acceptPoolingOffer,
  } = useRidePooling({ token, driverId });

  useEffect(() => {
    if (isVisible) {
      loadPoolingAnalytics();
    }
  }, [isVisible, loadPoolingAnalytics]);

  const handleAcceptPool = async (poolId) => {
    const result = await acceptPoolingOffer(poolId);
    if (result?.status === 'accepted') {
      Alert.alert('Pool submitted', 'Pooling request accepted and sent for dispatch review.');
      return;
    }
    Alert.alert('Pool failed', 'Could not accept this pool. Please try again.');
  };

  const handlePreviewPool = (pool) => {
    Alert.alert(
      'Pool Details',
      `${pool.passengers_count} passengers, ${pool.potential_matches} possible matches, Rs. ${pool.estimated_savings} estimated savings.`
    );
  };

  const earningsIncrease =
    poolAnalytics?.earnings_without_pooling > 0
      ? ((poolAnalytics.earnings_with_pooling / poolAnalytics.earnings_without_pooling - 1) * 100).toFixed(1)
      : '0.0';

  return (
    <Modal visible={isVisible} animationType="slide" transparent>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Ride Pooling</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView style={styles.content}>
          {poolAnalytics && (
            <View style={styles.analyticsCard}>
              <Text style={styles.cardTitle}>Pooling Analytics</Text>
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
                  <Text style={styles.statValue}>Rs. {poolAnalytics.potential_savings}</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Earnings Increase</Text>
                  <Text style={styles.statValue}>{earningsIncrease}%</Text>
                </View>
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Available Pools</Text>
            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {poolOpportunities.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>{isLoading ? 'Loading pools...' : 'No active pooling opportunities'}</Text>
                <Text style={styles.emptySubtext}>Matching pools appear here after route checks.</Text>
              </View>
            ) : (
              poolOpportunities.map((pool) => (
                <TouchableOpacity key={pool.pool_id} style={styles.poolCard} onPress={() => handlePreviewPool(pool)}>
                  <View style={styles.poolHeader}>
                    <Text style={styles.poolTitle}>Pool {String(pool.pool_id || '').slice(0, 8)}</Text>
                    <Text style={styles.poolSavings}>Save Rs. {pool.estimated_savings}</Text>
                  </View>
                  <View style={styles.poolInfo}>
                    <Text style={styles.poolText}>{pool.passengers_count} passengers total</Text>
                    <Text style={styles.poolText}>{pool.potential_matches} potential matches</Text>
                  </View>
                  <TouchableOpacity style={styles.acceptButton} onPress={() => handleAcceptPool(pool.pool_id)}>
                    <Text style={styles.acceptButtonText}>Accept Pool</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              ))
            )}
          </View>

          <View style={styles.tipsCard}>
            <Text style={styles.tipsTitle}>Tips</Text>
            <Text style={styles.tipsText}>Accept more pools to build trust and earn bonuses.</Text>
            <Text style={styles.tipsText}>Pooling works best during peak hours.</Text>
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
  headerSpacer: {
    width: 60,
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
    fontWeight: '700',
    color: theme.COLORS.TEXT,
    marginBottom: 12,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  stat: {
    flexBasis: '47%',
    backgroundColor: theme.COLORS.BACKGROUND,
    borderRadius: 8,
    padding: 12,
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
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.COLORS.TEXT,
    marginBottom: 12,
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 13,
    marginBottom: 8,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 32,
    ...theme.SHADOWS.small,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.COLORS.TEXT,
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 13,
    color: theme.COLORS.TEXT_SECONDARY,
  },
  poolCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    ...theme.SHADOWS.small,
  },
  poolHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  poolTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.COLORS.TEXT,
  },
  poolSavings: {
    color: '#2E7D32',
    fontWeight: '700',
  },
  poolInfo: {
    marginBottom: 12,
    gap: 4,
  },
  poolText: {
    fontSize: 13,
    color: theme.COLORS.TEXT_SECONDARY,
  },
  acceptButton: {
    backgroundColor: theme.COLORS.PRIMARY,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: 'white',
    fontWeight: '700',
  },
  tipsCard: {
    backgroundColor: '#FFF9E6',
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
  },
  tipsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.COLORS.TEXT,
    marginBottom: 8,
  },
  tipsText: {
    fontSize: 13,
    color: theme.COLORS.TEXT_SECONDARY,
    marginBottom: 6,
  },
});
