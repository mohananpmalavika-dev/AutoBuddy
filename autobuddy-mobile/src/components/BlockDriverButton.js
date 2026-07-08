import React, { useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  TextInput,
  View,
  Modal,
} from 'react-native';
import { COLORS, TYPOGRAPHY, SPACING } from '../theme';

/**
 * BlockDriverButton Component
 * 
 * A reusable button component for blocking/unblocking drivers.
 * Can be used in driver profiles, search results, or ride history.
 * 
 * Props:
 *   - driverId: string (required)
 *   - driverName: string (required)
 *   - isBlocked: boolean
 *   - onBlock: (driverId, reason) => Promise<boolean>
 *   - onUnblock: (driverId) => Promise<boolean>
 *   - style: object (optional)
 *   - compact: boolean (optional) - Use compact style
 */
export default function BlockDriverButton({
  driverId,
  driverName,
  isBlocked = false,
  onBlock,
  onUnblock,
  style,
  compact = false,
}) {
  const [loading, setLoading] = useState(false);
  const [showReasonModal, setShowReasonModal] = useState(false);
  const [blockReason, setBlockReason] = useState('');

  const handleBlockPress = () => {
    if (isBlocked) {
      // Unblock confirmation
      Alert.alert(
        'Unblock Driver?',
        `${driverName} will appear in your search results again and can accept your ride requests.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Unblock',
            onPress: handleUnblock,
            style: 'destructive',
          },
        ]
      );
    } else {
      // Show reason input modal
      setShowReasonModal(true);
    }
  };

  const handleBlock = async () => {
    if (!blockReason.trim()) {
      Alert.alert('Reason Required', 'Please provide a reason for blocking this driver.');
      return;
    }

    setShowReasonModal(false);
    setLoading(true);

    try {
      const success = await onBlock(driverId, blockReason.trim());
      if (success) {
        Alert.alert('Driver Blocked', `${driverName} has been blocked successfully.`);
        setBlockReason('');
      }
    } catch (error) {
      console.error('Error blocking driver:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUnblock = async () => {
    setLoading(true);
    try {
      const success = await onUnblock(driverId);
      if (success) {
        Alert.alert('Driver Unblocked', `${driverName} has been unblocked.`);
      }
    } catch (error) {
      console.error('Error unblocking driver:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelReason = () => {
    setShowReasonModal(false);
    setBlockReason('');
  };

  if (compact) {
    return (
      <>
        <TouchableOpacity
          style={[styles.compactButton, isBlocked && styles.compactButtonBlocked, style]}
          onPress={handleBlockPress}
          disabled={loading}>
          {loading ? (
            <ActivityIndicator size="small" color={isBlocked ? COLORS.error : COLORS.textSecondary} />
          ) : (
            <Text style={[styles.compactButtonText, isBlocked && styles.compactButtonTextBlocked]}>
              {isBlocked ? '🚫 Blocked' : '🚫'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Reason Modal */}
        <ReasonModal
          visible={showReasonModal}
          driverName={driverName}
          reason={blockReason}
          onReasonChange={setBlockReason}
          onConfirm={handleBlock}
          onCancel={handleCancelReason}
        />
      </>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={[
          styles.button,
          isBlocked ? styles.buttonUnblock : styles.buttonBlock,
          style,
        ]}
        onPress={handleBlockPress}
        disabled={loading}>
        {loading ? (
          <ActivityIndicator size="small" color={COLORS.white} />
        ) : (
          <Text style={styles.buttonText}>
            {isBlocked ? '✓ Unblock Driver' : '🚫 Block Driver'}
          </Text>
        )}
      </TouchableOpacity>

      {/* Reason Modal */}
      <ReasonModal
        visible={showReasonModal}
        driverName={driverName}
        reason={blockReason}
        onReasonChange={setBlockReason}
        onConfirm={handleBlock}
        onCancel={handleCancelReason}
      />
    </>
  );
}

/**
 * Reason Modal Component
 * Modal for entering block reason
 */
function ReasonModal({ visible, driverName, reason, onReasonChange, onConfirm, onCancel }) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Block {driverName}?</Text>
          <Text style={styles.modalDescription}>
            Please provide a reason for blocking this driver. This driver will no longer appear in your search results.
          </Text>

          <TextInput
            style={styles.reasonInput}
            placeholder="Reason for blocking (e.g., 'Unprofessional behavior')"
            placeholderTextColor={COLORS.textSecondary}
            value={reason}
            onChangeText={onReasonChange}
            multiline
            numberOfLines={3}
            maxLength={240}
            autoFocus
          />

          <View style={styles.modalActions}>
            <TouchableOpacity
              style={[styles.modalButton, styles.modalButtonCancel]}
              onPress={onCancel}>
              <Text style={styles.modalButtonTextCancel}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalButton, styles.modalButtonConfirm]}
              onPress={onConfirm}>
              <Text style={styles.modalButtonTextConfirm}>Block Driver</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  buttonBlock: {
    backgroundColor: '#FF6B6B',
  },
  buttonUnblock: {
    backgroundColor: COLORS.primary,
  },
  buttonText: {
    ...TYPOGRAPHY.button,
    color: COLORS.white,
    fontWeight: '600',
  },
  compactButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  compactButtonBlocked: {
    backgroundColor: '#FFE8E8',
    borderColor: '#FF6B6B',
  },
  compactButtonText: {
    fontSize: 16,
  },
  compactButtonTextBlocked: {
    fontSize: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.lg,
  },
  modalContent: {
    backgroundColor: COLORS.background,
    borderRadius: 16,
    padding: SPACING.xl,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    ...TYPOGRAPHY.headline6,
    fontWeight: '700',
    marginBottom: SPACING.sm,
    textAlign: 'center',
  },
  modalDescription: {
    ...TYPOGRAPHY.body2,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: SPACING.lg,
    lineHeight: 20,
  },
  reasonInput: {
    ...TYPOGRAPHY.body1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: SPACING.md,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: SPACING.lg,
  },
  modalActions: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#F5F5F5',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  modalButtonConfirm: {
    backgroundColor: '#FF6B6B',
  },
  modalButtonTextCancel: {
    ...TYPOGRAPHY.button,
    color: COLORS.textPrimary,
    fontWeight: '600',
  },
  modalButtonTextConfirm: {
    ...TYPOGRAPHY.button,
    color: COLORS.white,
    fontWeight: '600',
  },
});
