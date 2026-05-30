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
 * BlockedPassengerListView Component
 * 
 * Detailed view of blocked passengers with unblock action + history.
 * Addresses Issue #6: Blocked Passenger List Hidden
 * 
 * Props:
 *   - visible: boolean
 *   - blockedPassengers: Array<{id, name, phone, rating, blockReason, blockDate, blockCount}>
 *   - loading: boolean
 *   - onUnblock: (passengerId) => void (async)
 *   - onClose: () => void
 *   - onViewHistory: (passengerId) => void
 */
export default function BlockedPassengerListView({
  visible = false,
  blockedPassengers = [],
  loading = false,
  onUnblock,
  onClose,
  onViewHistory,
}) {
  const [unblockingId, setUnblockingId] = useState(null);

  const handleUnblock = useCallback(
    async (passengerId) => {
      Alert.alert(
        'Unblock Passenger?',
        'This passenger will be able to book rides from you again.',
        [
          { text: 'Cancel', onPress: () => {}, style: 'cancel' },
          {
            text: 'Unblock',
            onPress: async () => {
              setUnblockingId(passengerId);
              try {
                if (typeof onUnblock === 'function') {
                  await onUnblock(passengerId);
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
    if (!blockedPassengers || blockedPassengers.length === 0) {
      return (
        <View style={styles.emptyStateContainer}>
          <Text style={styles.emptyIcon}>✨</Text>
          <Text style={styles.emptyTitle}>No Blocked Passengers</Text>
          <Text style={styles.emptySubtext}>
            You haven&apos;t blocked any passengers yet. This is where they&apos;ll appear if you do.
          </Text>
        </View>
      );
    }
    return null;
  }, [blockedPassengers]);

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
              <Text style={styles.headerTitle}>Blocked Passengers</Text>
              {blockedPassengers && blockedPassengers.length > 0 && (
                <Text style={styles.headerCount}>
                  {blockedPassengers.length} passenger{blockedPassengers.length !== 1 ? 's' : ''}
                </Text>
              )}
            </View>
            <View style={{ width: 40 }} />
          </View>

          {/* Content */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={styles.loadingText}>Loading blocked passengers...</Text>
            </View>
          ) : emptyState ? (
            emptyState
          ) : (
            <ScrollView
              style={styles.listContainer}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.listContent}>
              {blockedPassengers.map((passenger, index) => (
                <View
                  key={passenger.id || index}
                  style={[styles.passengerCard, index === blockedPassengers.length - 1 && styles.lastCard]}>
                  {/* Passenger Info */}
                  <View style={styles.passengerInfoSection}>
                    <View style={styles.passengerAvatar}>
                      <Text style={styles.avatarText}>
                        {passenger.name?.charAt(0)?.toUpperCase() || 'P'}
                      </Text>
                    </View>

                    <View style={styles.passengerDetails}>
                      <View style={styles.nameRow}>
                        <Text style={styles.passengerName}>{passenger.name || 'Unknown'}</Text>
                        {passenger.rating && (
                          <Text style={styles.rating}>⭐ {passenger.rating.toFixed(1)}</Text>
                        )}
                      </View>
                      <Text style={styles.passengerPhone}>{passenger.phone || 'No phone'}</Text>

                      {/* Block History */}
                      <View style={styles.blockHistoryRow}>
                        <Text style={styles.blockHistoryLabel}>
                          🚫 Blocked {passenger.blockCount || 1}x
                        </Text>
                        {passenger.blockDate && (
                          <Text style={styles.blockDate}>
                            {formatToIST(passenger.blockDate, { dateStyle: 'short' })}
                          </Text>
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Block Reason (if available) */}
                  {passenger.blockReason && (
                    <View style={styles.reasonBox}>
                      <Text style={styles.reasonLabel}>Reason:</Text>
                      <Text style={styles.reasonText}>{passenger.blockReason}</Text>
                    </View>
                  )}

                  {/* Action Buttons */}
                  <View style={styles.actionRow}>
                    {onViewHistory && (
                      <TouchableOpacity
                        style={[styles.actionButton, styles.historyButton]}
                        onPress={() => onViewHistory(passenger.id)}
                        disabled={unblockingId === passenger.id}>
                        <Text style={styles.historyButtonText}>View History</Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      style={[
                        styles.actionButton,
                        styles.unblockButton,
                        unblockingId === passenger.id && styles.unblockButtonDisabled,
                      ]}
                      onPress={() => handleUnblock(passenger.id)}
                      disabled={unblockingId === passenger.id}>
                      {unblockingId === passenger.id ? (
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
              Unblocking a passenger allows them to send you ride requests again.
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
  passengerCard: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    ...SHADOWS.card,
  },
  lastCard: {
    marginBottom: 24,
  },
  passengerInfoSection: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  passengerAvatar: {
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
  passengerDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  passengerName: {
    ...TYPOGRAPHY.body1,
    fontWeight: '600',
    flex: 1,
  },
  rating: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
    color: '#FFA500',
  },
  passengerPhone: {
    ...TYPOGRAPHY.caption,
    color: COLORS.textSecondary,
    marginBottom: 6,
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
  historyButton: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  historyButtonText: {
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
