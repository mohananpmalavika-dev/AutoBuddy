import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  SafeAreaView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { COLORS, TYPOGRAPHY, SPACING, SHADOWS } from '../theme';
import BlockDriverButton from '../components/BlockDriverButton';
import useBlockedDrivers from '../hooks/useBlockedDrivers';
import { apiRequest } from '../lib/api';

/**
 * DriverProfileScreen
 * 
 * Displays driver details with block/unblock functionality.
 * Demonstrates integration of BlockDriverButton component.
 * 
 * Route params:
 *   - driverId: string (required)
 */
export default function DriverProfileScreen({ route, navigation }) {
  const { driverId } = route.params;
  
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const {
    isDriverBlocked,
    blockDriver,
    unblockDriver,
    fetchBlockedDrivers,
  } = useBlockedDrivers();

  // Fetch driver details
  useEffect(() => {
    fetchDriverDetails();
    fetchBlockedDrivers();
  }, [driverId]);

  const fetchDriverDetails = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Replace with your actual API endpoint
      const response = await apiRequest(`/api/drivers/${driverId}`, {
        method: 'GET',
      });
      
      setDriver(response);
    } catch (err) {
      console.error('Error fetching driver details:', err);
      setError(err.message || 'Failed to load driver details');
    } finally {
      setLoading(false);
    }
  };

  const handleBlock = async (driverId, reason) => {
    return await blockDriver(driverId, reason);
  };

  const handleUnblock = async (driverId) => {
    return await unblockDriver(driverId);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading driver profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !driver) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>⚠️</Text>
          <Text style={styles.errorText}>{error || 'Driver not found'}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={fetchDriverDetails}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const blocked = isDriverBlocked(driverId);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header with Back Button */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}>
            <Text style={styles.backButtonText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Driver Profile</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Blocked Banner (if driver is blocked) */}
        {blocked && (
          <View style={styles.blockedBanner}>
            <Text style={styles.blockedBannerIcon}>🚫</Text>
            <Text style={styles.blockedBannerText}>
              This driver is blocked. They won't appear in your search results.
            </Text>
          </View>
        )}

        {/* Driver Avatar & Basic Info */}
        <View style={styles.profileSection}>
          <View style={styles.avatarContainer}>
            {driver.profile_image ? (
              <Image
                source={{ uri: driver.profile_image }}
                style={styles.avatar}
              />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarText}>
                  {driver.name?.charAt(0)?.toUpperCase() || 'D'}
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.driverName}>{driver.name || 'Unknown Driver'}</Text>
          
          {/* Rating */}
          {driver.rating && (
            <View style={styles.ratingContainer}>
              <Text style={styles.ratingStar}>⭐</Text>
              <Text style={styles.ratingText}>
                {driver.rating.toFixed(1)} ({driver.total_rides || 0} rides)
              </Text>
            </View>
          )}

          {/* Verification Badge */}
          {driver.is_verified && (
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedIcon}>✓</Text>
              <Text style={styles.verifiedText}>Verified Driver</Text>
            </View>
          )}
        </View>

        {/* Contact Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Information</Text>
          
          {driver.phone && (
            <View style={styles.infoRow}>
              <Text style={styles.infoIcon}>📞</Text>
              <Text style={styles.infoText}>{driver.phone}</Text>
            </View>
          )}
          
          {driver.email && (
            <View style={styles.infoRow}>
              <Text style={styles.infoIcon}>📧</Text>
              <Text style={styles.infoText}>{driver.email}</Text>
            </View>
          )}
        </View>

        {/* Vehicle Info */}
        {driver.vehicle && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Vehicle Details</Text>
            
            <View style={styles.vehicleCard}>
              <Text style={styles.vehicleIcon}>🚗</Text>
              <View style={styles.vehicleInfo}>
                <Text style={styles.vehicleMakeModel}>
                  {driver.vehicle.make} {driver.vehicle.model}
                </Text>
                {driver.vehicle.year && (
                  <Text style={styles.vehicleDetail}>Year: {driver.vehicle.year}</Text>
                )}
                {driver.vehicle.color && (
                  <Text style={styles.vehicleDetail}>Color: {driver.vehicle.color}</Text>
                )}
                {driver.vehicle.license_plate && (
                  <Text style={styles.vehiclePlate}>
                    {driver.vehicle.license_plate}
                  </Text>
                )}
              </View>
            </View>
          </View>
        )}

        {/* Driver Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Statistics</Text>
          
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{driver.total_rides || 0}</Text>
              <Text style={styles.statLabel}>Total Rides</Text>
            </View>
            
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {driver.acceptance_rate ? `${driver.acceptance_rate}%` : 'N/A'}
              </Text>
              <Text style={styles.statLabel}>Accept Rate</Text>
            </View>
            
            <View style={styles.statCard}>
              <Text style={styles.statValue}>
                {driver.cancellation_rate ? `${driver.cancellation_rate}%` : 'N/A'}
              </Text>
              <Text style={styles.statLabel}>Cancel Rate</Text>
            </View>
          </View>
        </View>

        {/* About */}
        {driver.bio && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About</Text>
            <Text style={styles.bioText}>{driver.bio}</Text>
          </View>
        )}

        {/* Block/Unblock Button */}
        <View style={styles.actionSection}>
          <BlockDriverButton
            driverId={driverId}
            driverName={driver.name}
            isBlocked={blocked}
            onBlock={handleBlock}
            onUnblock={handleUnblock}
            style={styles.blockButton}
          />
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.background,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 32,
    color: COLORS.textPrimary,
    fontWeight: '300',
  },
  headerTitle: {
    ...TYPOGRAPHY.headline6,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  loadingText: {
    ...TYPOGRAPHY.body2,
    color: COLORS.textSecondary,
    marginTop: SPACING.md,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: SPACING.md,
  },
  errorText: {
    ...TYPOGRAPHY.body1,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: 8,
  },
  retryButtonText: {
    ...TYPOGRAPHY.button,
    color: COLORS.white,
    fontWeight: '600',
  },
  blockedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFE8E8',
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.md,
    borderBottomWidth: 2,
    borderBottomColor: '#FF6B6B',
    gap: SPACING.sm,
  },
  blockedBannerIcon: {
    fontSize: 20,
  },
  blockedBannerText: {
    ...TYPOGRAPHY.body2,
    color: '#C62828',
    flex: 1,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: SPACING.xl,
    backgroundColor: COLORS.background,
  },
  avatarContainer: {
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 40,
    fontWeight: '700',
    color: COLORS.white,
  },
  driverName: {
    ...TYPOGRAPHY.headline5,
    fontWeight: '700',
    marginBottom: SPACING.xs,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: SPACING.xs,
  },
  ratingStar: {
    fontSize: 16,
  },
  ratingText: {
    ...TYPOGRAPHY.body2,
    color: COLORS.textSecondary,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: 16,
    gap: 4,
    marginTop: SPACING.xs,
  },
  verifiedIcon: {
    fontSize: 14,
    color: '#4CAF50',
  },
  verifiedText: {
    ...TYPOGRAPHY.caption,
    color: '#2E7D32',
    fontWeight: '600',
  },
  section: {
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.lg,
    marginTop: SPACING.sm,
  },
  sectionTitle: {
    ...TYPOGRAPHY.body1,
    fontWeight: '700',
    marginBottom: SPACING.md,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    gap: SPACING.md,
  },
  infoIcon: {
    fontSize: 20,
  },
  infoText: {
    ...TYPOGRAPHY.body1,
    color: COLORS.textPrimary,
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: 12,
    gap: SPACING.md,
    ...SHADOWS.card,
  },
  vehicleIcon: {
    fontSize: 32,
  },
  vehicleInfo: {
    flex: 1,
  },
  vehicleMakeModel: {
    ...TYPOGRAPHY.body1,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  vehicleDetail: {
    ...TYPOGRAPHY.body2,
    color: COLORS.textSecondary,
    marginBottom: 2,
  },
  vehiclePlate: {
    ...TYPOGRAPHY.body2,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: SPACING.xs,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.surface,
    padding: SPACING.md,
    borderRadius: 12,
    alignItems: 'center',
    ...SHADOWS.card,
  },
  statValue: {
    ...TYPOGRAPHY.headline6,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: SPACING.xs,
  },
  statLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
  bioText: {
    ...TYPOGRAPHY.body2,
    color: COLORS.textPrimary,
    lineHeight: 20,
  },
  actionSection: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.xl,
  },
  blockButton: {
    width: '100%',
  },
  bottomSpacer: {
    height: SPACING.xl,
  },
});
