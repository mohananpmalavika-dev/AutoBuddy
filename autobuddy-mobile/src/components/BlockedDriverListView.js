import React, { useCallback, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  Modal,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { COLORS, SHADOWS, TYPOGRAPHY } from '../theme';
import { formatToIST } from '../utils/time';

/**
 * BlockedDriverListView Component
 * 
 * Passenger interface for viewing and managing blocked drivers.
 * Mirrors the functionality of BlockedPassengerListView for drivers.
 * 
 * Props:
 *   - visible: boolean
 *   - blockedDrivers: Array<{id, name, phone, rating, vehicle, blockDate, blockReason}>
 *   - loading: boolean
 *   - onUnblock: (driverId) => void (async)
 *   - onClose: () => void
 *   - onViewProfile: (driverId) => void (optional)
 */
export default function BlockedDriverListView({
  visible = false,
  blockedDrivers = [],
  loading = false,
  onUnblock,
  onClose,
  onViewProfile,
}) {
  const [unblockingId, setUnblockingId] = useState(null);

  const handleUnblock = useCallback(
    async (driverId) => {
      Alert.alert(
        'Unblock Driver?',
        'This driver will appear in your search results again and can accept your ride requests.',
        [
          { text: 'Cancel', onPress: () => {}, style: 'cancel' },
          {
            text: 'Unblock',
            onPress: async () => {
              setUnblockingId(driverId);
              try {
                if (typeof onUnblock === 'function') {
                  await onUnblock(driverId);
                }
              } finally {
                setUnblockingId(null);
              }
            },
            style: 'destructive',
          },
        ]
      );
    },
    [onUnblock]
  );

  const handleClose = useCallback(() => {
    if (typeof onClose === 'function') {
      onClose();
    }
  }, [onClose]);

  const emptyState = useMemo(() => {
    if (!blockedDrivers || blockedDrivers.length === 0) {
      return (
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyIcon}>✨</Text>
          <Text style={styles.emptyTitle}>No Blocked Drivers</Text>
          <Text style={styles.emptySubtext}>
            You haven&apos;t blocked any drivers yet. Blocked drivers won&apos;t appear in your search results.
          </Text>
        </View>
      );
    }
    return null;
  }, [blockedDrivers]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
            <View style={styles.headerContent}>
              <Text style={styles.headerTitle}>Blocked Drivers</Text>
              {blockedDrivers && blockedDrivers.length > 0 && (
                <Text style={styles.headerCount}>
                  {blockedDrivers.length} driver{blockedDrivers.length !== 1 ? 's' : ''}
                </Text>
              )}
            </View>
            <View style={{ width: 40 }} />
          </View>

          {/* Content */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading blocked drivers...</Text>
            </View>
          ) : emptyState ? (
            emptyState
          ) : (
            <ScrollView
              style={styles.listContainer}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}>
              {blockedDrivers.map((driver, index) => (
                <View
                  key={driver.id || index}
                  style={[styles.driverCard, index === blockedDrivers.length - 1 && styles.lastCard]}>
                  {/* Driver Info */}
                  <View style={styles.driverInfoSection}>
                    <View style={styles.driverAvatar}>
                      <Text style={styles.avatarText}>
                        {driver.name?.charAt(0)?.toUpperCase() || 'D'}
                      </Text>
                    </View>

                    <View style={styles.driverDetails}>
                      <View style={styles.nameRow}>
                        <Text style={styles.driverName}>{driver.name || 'Unknown Driver'}</Text>
                        {driver.rating && (
                          <Text style={styles.rating}>⭐ {driver.rating.toFixed(1)}</Text>
                        )}
                      </View>
                      <Text style={styles.driverPhone}>{driver.phone || 'No phone'}</Text>

                      {/* Vehicle Info */}
                      {driver.vehicle && (
                        <View style={styles.vehicleRow}>
                          <Text style={styles.vehicleIcon}>🚗</Text>
                          <Text style={styles.vehicleText}>
                            {driver.vehicle.make || ''} {driver.vehicle.model || ''} {driver.vehicle.year || ''}
                          </Text>
                        </View>
                      )}

                      {/* Block Date */}
                      {driver.blockDate && (
                        <View style={styles.blockHistoryRow}>
                          <Text style={styles.blockHistoryLabel}>🚫 Blocked</Text>
                          <Text style={styles.blockDate}>
                            {formatToIST(driver.blockDate, { dateStyle: 'short' })}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Block Reason (if available) */}
                  {driver.blockReason && (
                    <View style={styles.reasonBox}>
                      <Text style={styles.reasonLabel}>Reason:</Text>
                      <Text style={styles.reasonText}>{driver.blockReason}</Text>
                    </View>
                  )}

                  {/* Action Buttons */}
                  <View style={styles.actionRow}>
                    {onViewProfile && (
                      <TouchableOpacity
                        style={[styles.actionButton, styles.profileButton]}
                        onPress={() => onViewProfile(driver.id)}
                        disabled={unblockingId === driver.id}>
                        <Text style={styles.profileButtonText}>View Profile</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[
                        styles.actionButton,
                        styles.unblockButton,
                        unblockingId === driver.id && styles.unblockButtonDisabled,
                      ]}
                      onPress={() => handleUnblock(driver.id)}
                      disabled={unblockingId === driver.id}>
                      {unblockingId === driver.id ? (
                        <ActivityIndicator size="small" color={COLORS.white} />
                      ) : (
                        <Text style={styles.unblockButtonText}>Unblock</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>
          )}

          {/* Footer Info */}
          <View style={styles.footer}>
            <Text style={styles.footerIcon}>ℹ️</Text>
            <Text style={styles.footerText}>
              Unblocking a driver allows them to appear in your search results and accept your ride requests.
            </Text>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  closeButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: COLORS.textSecondary,
  },
  headerContent: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    ...TYPOGRAPHY.headline5,
    fontWeight: '600',
  },
  headerCount: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...TYPOGRAPHY.body2,
    color: COLORS.textSecondary,
    marginTop: 12,
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    ...TYPOGRAPHY.headline6,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySubtext: {
    ...TYPOGRAPHY.body2,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  driverCard: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    ...SHADOWS.card,
  },
  lastCard: {
    marginBottom: 24,
  },
  driverInfoSection: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  driverAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.white,
  },
  driverDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  driverName: {
    ...TYPOGRAPHY.body1,
    fontWeight: '600',
    flex: 1,
  },
  rating: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
    color: '#FFA500',
  },
  driverPhone: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  vehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 4,
  },
  vehicleIcon: {
    fontSize: 14,
  },
  vehicleText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textPrimary,
    fontWeight: '500',
  },
  blockHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  blockHistoryLabel: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
    color: '#FF6B6B',
  },
  blockDate: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
  },
  reasonBox: {
    backgroundColor: '#FFE8E8',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderLeftWidth: 2,
    borderLeftColor: '#FF6B6B',
    marginBottom: 12,
  },
  reasonLabel: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
    color: '#FF6B6B',
    marginBottom: 2,
  },
  reasonText: {
    ...TYPOGRAPHY.caption,
    color: '#C62828',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileButton: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  profileButtonText: {
    ...TYPOGRAPHY.button,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  unblockButton: {
    backgroundColor: COLORS.primary,
  },
  unblockButtonDisabled: {
    opacity: 0.6,
  },
  unblockButtonText: {
    ...TYPOGRAPHY.button,
    color: COLORS.white,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 12,
    backgroundColor: '#E3F2FD',
    borderTopWidth: 1,
    borderTopColor: '#BBDEFB',
    gap: 8,
  },
  footerIcon: {
    fontSize: 16,
    marginTop: 2,
  },
  footerText: {
    ...TYPOGRAPHY.caption,
    color: '#0D47A1',
    flex: 1,
    lineHeight: 16,
  },
});
