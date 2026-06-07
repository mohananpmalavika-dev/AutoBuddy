import React, { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useRidePooling } from '../hooks/useRidePooling';
import { theme } from '../theme';

export function RidePoolingPanel({ isVisible, onClose, token, driverId }) {
  const {
    error,
    isLoading,
    driverPools,
    poolAnalytics,
    poolOpportunities,
    loadPoolingAnalytics,
    loadDriverPools,
    createDriverPoolRoute,
    assignDriverToPool,
    acceptPoolingOffer,
  } = useRidePooling({ token, driverId });
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [routeForm, setRouteForm] = useState({
    route_name: '',
    pickup_location: '',
    dropoff_location: '',
    estimated_fare: '250',
    max_passengers: '4',
    discount_percentage: '20',
    max_wait_minutes: '10',
  });

  useEffect(() => {
    if (isVisible) {
      loadPoolingAnalytics();
      loadDriverPools();
    }
  }, [isVisible, loadDriverPools, loadPoolingAnalytics]);

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
      `${pool.passengers_count || pool.current_passengers || 0} passengers, ${pool.potential_matches || 0} possible matches, Rs. ${pool.estimated_savings || pool.savings || 0} estimated savings.`
    );
  };

  const handleCreateRoute = async () => {
    if (!routeForm.pickup_location.trim() || !routeForm.dropoff_location.trim()) {
      Alert.alert('Missing route', 'Pickup and dropoff are required.');
      return;
    }

    const result = await createDriverPoolRoute({
      route_name: routeForm.route_name.trim(),
      pickup_location: routeForm.pickup_location.trim(),
      dropoff_location: routeForm.dropoff_location.trim(),
      estimated_fare: Number(routeForm.estimated_fare) || 0,
      max_passengers: Number(routeForm.max_passengers) || 4,
      discount_percentage: Number(routeForm.discount_percentage) || 20,
      max_wait_minutes: Number(routeForm.max_wait_minutes) || 10,
    });

    if (result) {
      Alert.alert('Shared route started', 'Passengers can now join this driver-created pool.');
      setRouteForm({
        route_name: '',
        pickup_location: '',
        dropoff_location: '',
        estimated_fare: '250',
        max_passengers: '4',
        discount_percentage: '20',
        max_wait_minutes: '10',
      });
      setShowRouteForm(false);
      await loadDriverPools();
      return;
    }

    Alert.alert('Route failed', 'Could not start this shared route.');
  };

  const handleAssignDriver = async (poolId) => {
    const result = await assignDriverToPool(poolId);
    if (result) {
      Alert.alert('Assigned', 'This pool is now assigned to you.');
      await loadDriverPools();
      return;
    }
    Alert.alert('Assign failed', 'Could not assign this pool.');
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
          <View style={styles.quickActionCard}>
            <View>
              <Text style={styles.cardTitle}>Driver-Created Pool</Text>
              <Text style={styles.cardSubtext}>Start Shared Route</Text>
            </View>
            <TouchableOpacity style={styles.primarySmallButton} onPress={() => setShowRouteForm((value) => !value)}>
              <Text style={styles.primarySmallButtonText}>{showRouteForm ? 'Close' : 'Start'}</Text>
            </TouchableOpacity>
          </View>

          {showRouteForm && (
            <View style={styles.formCard}>
              <TextInput
                style={styles.input}
                placeholder="Route name"
                placeholderTextColor={theme.COLORS.TEXT_SECONDARY}
                value={routeForm.route_name}
                onChangeText={(route_name) => setRouteForm((prev) => ({ ...prev, route_name }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Pickup location"
                placeholderTextColor={theme.COLORS.TEXT_SECONDARY}
                value={routeForm.pickup_location}
                onChangeText={(pickup_location) => setRouteForm((prev) => ({ ...prev, pickup_location }))}
              />
              <TextInput
                style={styles.input}
                placeholder="Dropoff location"
                placeholderTextColor={theme.COLORS.TEXT_SECONDARY}
                value={routeForm.dropoff_location}
                onChangeText={(dropoff_location) => setRouteForm((prev) => ({ ...prev, dropoff_location }))}
              />
              <View style={styles.formRow}>
                <TextInput
                  style={[styles.input, styles.compactInput]}
                  keyboardType="numeric"
                  placeholder="Fare"
                  placeholderTextColor={theme.COLORS.TEXT_SECONDARY}
                  value={routeForm.estimated_fare}
                  onChangeText={(estimated_fare) => setRouteForm((prev) => ({ ...prev, estimated_fare }))}
                />
                <TextInput
                  style={[styles.input, styles.compactInput]}
                  keyboardType="numeric"
                  placeholder="Seats"
                  placeholderTextColor={theme.COLORS.TEXT_SECONDARY}
                  value={routeForm.max_passengers}
                  onChangeText={(max_passengers) => setRouteForm((prev) => ({ ...prev, max_passengers }))}
                />
              </View>
              <View style={styles.formRow}>
                <TextInput
                  style={[styles.input, styles.compactInput]}
                  keyboardType="numeric"
                  placeholder="Discount"
                  placeholderTextColor={theme.COLORS.TEXT_SECONDARY}
                  value={routeForm.discount_percentage}
                  onChangeText={(discount_percentage) => setRouteForm((prev) => ({ ...prev, discount_percentage }))}
                />
                <TextInput
                  style={[styles.input, styles.compactInput]}
                  keyboardType="numeric"
                  placeholder="Wait min"
                  placeholderTextColor={theme.COLORS.TEXT_SECONDARY}
                  value={routeForm.max_wait_minutes}
                  onChangeText={(max_wait_minutes) => setRouteForm((prev) => ({ ...prev, max_wait_minutes }))}
                />
              </View>
              <TouchableOpacity style={styles.createRouteButton} onPress={handleCreateRoute} disabled={isLoading}>
                <Text style={styles.createRouteButtonText}>{isLoading ? 'Starting...' : 'Start Shared Route'}</Text>
              </TouchableOpacity>
            </View>
          )}

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
            <Text style={styles.sectionTitle}>My Shared Routes</Text>
            {driverPools.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>{isLoading ? 'Loading routes...' : 'No shared routes yet'}</Text>
                <Text style={styles.emptySubtext}>Driver-created pools appear here.</Text>
              </View>
            ) : (
              driverPools.map((pool) => (
                <TouchableOpacity key={pool.pool_id || pool.id} style={styles.poolCard} onPress={() => handlePreviewPool(pool)}>
                  <View style={styles.poolHeader}>
                    <Text style={styles.poolTitle}>{pool.route_name || 'Shared Route'}</Text>
                    <Text style={styles.poolModel}>Driver Created</Text>
                  </View>
                  <View style={styles.poolInfo}>
                    <Text style={styles.poolText}>{pool.pickup_location || pool.pickup?.address || 'Pickup'}</Text>
                    <Text style={styles.poolText}>{pool.dropoff_location || pool.dropoff?.address || 'Dropoff'}</Text>
                    <Text style={styles.poolText}>
                      {pool.current_passengers || pool.passengers_count || 0}/{pool.max_passengers || 4} passengers
                    </Text>
                  </View>
                  {!pool.driver_id && (
                    <TouchableOpacity
                      style={styles.acceptButton}
                      onPress={() => handleAssignDriver(pool.pool_id || pool.id)}
                    >
                      <Text style={styles.acceptButtonText}>Assign to Me</Text>
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>
              ))
            )}
          </View>

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
  quickActionCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...theme.SHADOWS.small,
  },
  cardSubtext: {
    color: theme.COLORS.TEXT_SECONDARY,
    fontSize: 13,
    fontWeight: '600',
  },
  primarySmallButton: {
    backgroundColor: theme.COLORS.PRIMARY,
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  primarySmallButtonText: {
    color: 'white',
    fontWeight: '700',
  },
  formCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    ...theme.SHADOWS.small,
  },
  input: {
    backgroundColor: theme.COLORS.BACKGROUND,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.COLORS.LIGHT_GRAY,
    color: theme.COLORS.TEXT,
    fontSize: 14,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
  },
  compactInput: {
    flex: 1,
  },
  createRouteButton: {
    backgroundColor: theme.COLORS.PRIMARY,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 2,
  },
  createRouteButtonText: {
    color: 'white',
    fontWeight: '700',
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
  poolModel: {
    color: theme.COLORS.PRIMARY,
    fontSize: 12,
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
