import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Modal, Alert, ScrollView } from 'react-native';
import { useEarningTarget } from '../hooks/useEarningTarget';
import { theme } from '../theme';

const EarningTargetWidget = ({ token, driverId, compact = false }) => {
  const {
    currentTarget,
    progressMetrics,
    isLoading,
    error,
    loadCurrentTarget,
    setEarningTarget,
    loadTargetHistory,
    successRate,
  } = useEarningTarget({ token, driverId });

  const [showSetTarget, setShowSetTarget] = useState(false);
  const [targetAmount, setTargetAmount] = useState('5000');
  const [bonusMultiplier, setBonusMultiplier] = useState('1.5');

  useEffect(() => {
    loadCurrentTarget();
    loadTargetHistory();
  }, [loadCurrentTarget, loadTargetHistory]);

  const handleSetTarget = async () => {
    if (!targetAmount || parseFloat(targetAmount) <= 0) {
      Alert.alert('Error', 'Please enter valid target amount');
      return;
    }

    const success = await setEarningTarget(
      parseFloat(targetAmount),
      parseFloat(bonusMultiplier)
    );

    if (success) {
      Alert.alert('Success', 'Target set successfully');
      setShowSetTarget(false);
    } else {
      Alert.alert('Error', error || 'Failed to set target');
    }
  };

  if (compact) {
    // Compact widget for dashboard
    return (
      <View style={styles.compactContainer}>
        <View style={styles.compactHeader}>
          <Text style={styles.compactTitle}>Weekly Target</Text>
          <TouchableOpacity onPress={() => setShowSetTarget(true)}>
            <Text style={styles.compactEdit}>Edit</Text>
          </TouchableOpacity>
        </View>

        {progressMetrics ? (
          <>
            <View style={styles.compactContent}>
              <View>
                <Text style={styles.compactAmount}>₹{progressMetrics.currentEarnings}</Text>
                <Text style={styles.compactTarget}>of ₹{progressMetrics.targetAmount}</Text>
              </View>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    {
                      width: `${progressMetrics.progressPercentage}%`,
                      backgroundColor: progressMetrics.statusColor,
                    },
                  ]}
                />
              </View>
            </View>

            {progressMetrics.bonusEarned > 0 && (
              <Text style={styles.bonusText}>💰 Bonus earned: ₹{progressMetrics.bonusEarned}</Text>
            )}
          </>
        ) : (
          <TouchableOpacity
            style={styles.setTargetButton}
            onPress={() => setShowSetTarget(true)}
          >
            <Text style={styles.setTargetText}>Set Weekly Target</Text>
          </TouchableOpacity>
        )}

        <SetTargetModal
          visible={showSetTarget}
          onClose={() => setShowSetTarget(false)}
          onSave={handleSetTarget}
          targetAmount={targetAmount}
          setTargetAmount={setTargetAmount}
          bonusMultiplier={bonusMultiplier}
          setBonusMultiplier={setBonusMultiplier}
          isLoading={isLoading}
        />
      </View>
    );
  }

  // Full view
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Earning Target</Text>
        <TouchableOpacity onPress={() => setShowSetTarget(true)}>
          <Text style={styles.editButton}>Edit</Text>
        </TouchableOpacity>
      </View>

      {progressMetrics ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Main Progress */}
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressAmount}>₹{progressMetrics.currentEarnings}</Text>
              <Text style={styles.progressTarget}>/ ₹{progressMetrics.targetAmount}</Text>
            </View>

            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${progressMetrics.progressPercentage}%`,
                    backgroundColor: progressMetrics.statusColor,
                  },
                ]}
              />
            </View>

            <Text style={styles.progressPercent}>{Math.round(progressMetrics.progressPercentage)}% Complete</Text>
          </View>

          {/* Quick Stats */}
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Remaining</Text>
              <Text style={styles.statValue}>₹{progressMetrics.remainingAmount}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Hours Left</Text>
              <Text style={styles.statValue}>{progressMetrics.hoursRemaining}h</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Bonus</Text>
              <Text style={styles.statValue}>×{currentTarget?.bonusMultiplier}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Success Rate</Text>
              <Text style={styles.statValue}>{successRate}%</Text>
            </View>
          </View>

          {/* Bonus Status */}
          {progressMetrics.isTargetMet && (
            <View style={styles.bonusSection}>
              <Text style={styles.bonusTitle}>🎉 Target Met!</Text>
              <Text style={styles.bonusAmount}>Bonus Earned: ₹{progressMetrics.bonusEarned}</Text>
            </View>
          )}

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>
      ) : (
        <TouchableOpacity style={styles.setButton} onPress={() => setShowSetTarget(true)}>
          <Text style={styles.setButtonText}>Set Your Weekly Target</Text>
        </TouchableOpacity>
      )}

      <SetTargetModal
        visible={showSetTarget}
        onClose={() => setShowSetTarget(false)}
        onSave={handleSetTarget}
        targetAmount={targetAmount}
        setTargetAmount={setTargetAmount}
        bonusMultiplier={bonusMultiplier}
        setBonusMultiplier={setBonusMultiplier}
        isLoading={isLoading}
      />
    </View>
  );
};

const SetTargetModal = ({
  visible,
  onClose,
  onSave,
  targetAmount,
  setTargetAmount,
  bonusMultiplier,
  setBonusMultiplier,
  isLoading,
}) => (
  <Modal visible={visible} animationType="fade" transparent>
    <View style={styles.modalOverlay}>
      <View style={styles.modalContent}>
        <Text style={styles.modalTitle}>Set Weekly Target</Text>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Target Amount (₹)</Text>
          <TextInput
            style={styles.input}
            placeholder="5000"
            value={targetAmount}
            onChangeText={setTargetAmount}
            keyboardType="decimal-pad"
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>Bonus Multiplier</Text>
          <View style={styles.multiplierOptions}>
            {['1.5', '2.0', '2.5', '3.0'].map((mult) => (
              <TouchableOpacity
                key={mult}
                style={[
                  styles.multiplierButton,
                  bonusMultiplier === mult && styles.multiplierButtonActive,
                ]}
                onPress={() => setBonusMultiplier(mult)}
              >
                <Text style={[
                  styles.multiplierText,
                  bonusMultiplier === mult && styles.multiplierTextActive,
                ]}>
                  ×{mult}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.modalButtons}>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveBtn, isLoading && styles.saveBtnDisabled]}
            onPress={onSave}
            disabled={isLoading}
          >
            <Text style={styles.saveBtnText}>{isLoading ? 'Saving...' : 'Set Target'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  compactContainer: {
    backgroundColor: theme.COLORS.white,
    borderRadius: 12,
    padding: 14,
    ...theme.SHADOWS.medium,
  },
  compactHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  compactTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.COLORS.black,
  },
  compactEdit: {
    fontSize: 12,
    color: theme.COLORS.primary,
    fontWeight: '600',
  },
  compactContent: {
    marginBottom: 10,
  },
  compactAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.COLORS.primary,
    marginBottom: 2,
  },
  compactTarget: {
    fontSize: 12,
    color: theme.COLORS.grey5,
    marginBottom: 8,
  },
  progressBar: {
    height: 6,
    backgroundColor: theme.COLORS.grey2,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  bonusText: {
    fontSize: 12,
    color: theme.COLORS.success,
    fontWeight: '600',
    marginTop: 8,
  },
  setTargetButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  setTargetText: {
    color: theme.COLORS.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  container: {
    flex: 1,
    backgroundColor: theme.COLORS.white,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.COLORS.black,
  },
  editButton: {
    color: theme.COLORS.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  progressSection: {
    marginBottom: 24,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  progressAmount: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.COLORS.primary,
  },
  progressTarget: {
    fontSize: 14,
    color: theme.COLORS.grey5,
    marginLeft: 4,
  },
  progressPercent: {
    fontSize: 12,
    color: theme.COLORS.grey5,
    marginTop: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  statCard: {
    width: '48%',
    backgroundColor: theme.COLORS.grey1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  statLabel: {
    fontSize: 11,
    color: theme.COLORS.grey5,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.COLORS.black,
  },
  bonusSection: {
    backgroundColor: '#FFF8E1',
    borderLeftWidth: 4,
    borderLeftColor: theme.COLORS.warning,
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
  },
  bonusTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F57F17',
    marginBottom: 4,
  },
  bonusAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F57F17',
  },
  setButton: {
    backgroundColor: theme.COLORS.primary,
    borderRadius: 8,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  setButtonText: {
    color: theme.COLORS.white,
    fontSize: 14,
    fontWeight: '600',
  },
  error: {
    color: theme.COLORS.danger,
    fontSize: 13,
    marginTop: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: theme.COLORS.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 30,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.COLORS.black,
    marginBottom: 20,
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.COLORS.black,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.COLORS.grey3,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  multiplierOptions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  multiplierButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.COLORS.grey3,
    borderRadius: 6,
    paddingVertical: 10,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  multiplierButtonActive: {
    backgroundColor: theme.COLORS.primary,
    borderColor: theme.COLORS.primary,
  },
  multiplierText: {
    color: theme.COLORS.grey5,
    fontWeight: '600',
  },
  multiplierTextActive: {
    color: theme.COLORS.white,
  },
  modalButtons: {
    flexDirection: 'row',
    marginTop: 20,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.COLORS.grey3,
    borderRadius: 8,
    paddingVertical: 12,
    marginRight: 8,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: theme.COLORS.grey5,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 1,
    backgroundColor: theme.COLORS.primary,
    borderRadius: 8,
    paddingVertical: 12,
    marginLeft: 8,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: theme.COLORS.white,
    fontWeight: '600',
  },
});

export default EarningTargetWidget;
