/**
 * Mode Selection Screen - Allows users to choose between Simple/Smart/Pro modes
 * Location: src/screens/ModeSelectionScreen.tsx
 * 
 * Displays mode options with features and allows user to switch modes
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useUserMode, UserMode } from '../contexts/UserModeContext';
import {
  getModeSummary,
  getModeDescription,
  getModeTransitions,
  FEATURES,
} from '../utils/featureAccess';

interface ModeCardProps {
  mode: UserMode;
  isCurrentMode: boolean;
  onSelect: (mode: UserMode) => void;
  loading: boolean;
}

interface ModeSelectionScreenContainerProps {
  onLaunchGuardianMode?: () => void;
}

const ModeCard: React.FC<ModeCardProps> = ({ mode, isCurrentMode, onSelect, loading }) => {
  const summary = getModeSummary(mode);

  return (
    <TouchableOpacity
      style={[
        styles.modeCard,
        isCurrentMode && styles.currentModeCard,
        { borderColor: summary.color },
      ]}
      onPress={() => !loading && !isCurrentMode && onSelect(mode)}
      disabled={loading || isCurrentMode}
    >
      <View style={[styles.badge, { backgroundColor: summary.color }]}>
        <Text style={styles.badgeText}>{summary.badge}</Text>
      </View>

      <Text style={styles.modeName}>{summary.name}</Text>
      <Text style={styles.modePrice}>{summary.price}</Text>

      <View style={styles.featuresList}>
        {summary.features.map((feature, index) => (
          <View key={index} style={styles.featureItem}>
            <Text style={styles.featureDot}>•</Text>
            <Text style={styles.featureText}>{feature}</Text>
          </View>
        ))}
      </View>

      {isCurrentMode && (
        <View style={[styles.currentBadge, { backgroundColor: summary.color }]}>
          <Text style={styles.currentBadgeText}>CURRENT</Text>
        </View>
      )}

      {!isCurrentMode && (
        <TouchableOpacity
          style={[styles.selectButton, { backgroundColor: summary.color }]}
          onPress={() => onSelect(mode)}
          disabled={loading}
        >
          <Text style={styles.selectButtonText}>
            {loading ? 'Loading...' : 'Select Mode'}
          </Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
};

export const ModeSelectionScreen: React.FC<ModeSelectionScreenContainerProps> = ({ onLaunchGuardianMode }) => {
  const {
    currentMode,
    loading,
    error,
    setUserMode,
    startProTrial,
    upgradeToProSubscription,
  } = useUserMode();

  const [showTrialModal, setShowTrialModal] = useState(false);
  const [selectedModeForUpgrade, setSelectedModeForUpgrade] = useState<UserMode | null>(null);

  const handleModeSelect = async (mode: UserMode) => {
    if (mode === currentMode) {
      Alert.alert('Already selected', `You are already in ${mode} mode`);
      return;
    }

    // If selecting Pro mode, show trial/subscription options
    if (mode === 'pro') {
      setSelectedModeForUpgrade(mode);
      setShowTrialModal(true);
      return;
    }

    // For smart mode, just switch
    try {
      await setUserMode(mode);
      Alert.alert('Success', `Switched to ${mode} mode!`);
    } catch (err) {
      Alert.alert('Error', `Failed to switch mode: ${error}`);
    }
  };

  const handleProTrialStart = async () => {
    try {
      await startProTrial(7);
      setShowTrialModal(false);
      Alert.alert('Success', 'Pro trial started! 7 days free access.');
    } catch (err) {
      Alert.alert('Error', `Failed to start trial: ${error}`);
    }
  };

  const handleProUpgrade = async () => {
    try {
      // In a real app, this would integrate with payment system
      await upgradeToProSubscription(30);
      setShowTrialModal(false);
      Alert.alert('Success', 'Upgraded to Pro mode!');
    } catch (err) {
      Alert.alert('Error', `Failed to upgrade: ${error}`);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Choose Your Mode</Text>
        <Text style={styles.headerSubtitle}>
          {getModeDescription(currentMode)}
        </Text>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      <View style={styles.modesContainer}>
        <ModeCard
          mode="simple"
          isCurrentMode={currentMode === 'simple'}
          onSelect={handleModeSelect}
          loading={loading}
        />
        <ModeCard
          mode="smart"
          isCurrentMode={currentMode === 'smart'}
          onSelect={handleModeSelect}
          loading={loading}
        />
        <ModeCard
          mode="pro"
          isCurrentMode={currentMode === 'pro'}
          onSelect={handleModeSelect}
          loading={loading}
        />
      </View>

      <View style={styles.guardianSection}>
        <Text style={styles.guardianSectionTitle}>Guardian Mode</Text>
        <Text style={styles.guardianSectionDescription}>
          Activate Guardian Mode for safe journeys with voice guidance, caregiver monitoring, and SOS support.
        </Text>
        <TouchableOpacity
          style={styles.guardianButton}
          onPress={() => onLaunchGuardianMode?.()}
          disabled={loading}
        >
          <Text style={styles.guardianButtonText}>Open Guardian Mode</Text>
        </TouchableOpacity>
      </View>

      {/* Comparison Table */}
      <View style={styles.comparisonContainer}>
        <Text style={styles.comparisonTitle}>Feature Comparison</Text>

        <View style={styles.comparisonTable}>
          {/* Header row */}
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableCell, styles.featureNameCell]}>Feature</Text>
            <Text style={styles.tableCell}>Simple</Text>
            <Text style={styles.tableCell}>Smart</Text>
            <Text style={styles.tableCell}>Pro</Text>
          </View>

          {/* Feature rows */}
          <View style={styles.tableRow}>
            <Text style={[styles.tableCell, styles.featureNameCell]}>Book Ride</Text>
            <Text style={styles.tableCell}>✓</Text>
            <Text style={styles.tableCell}>✓</Text>
            <Text style={styles.tableCell}>✓</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={[styles.tableCell, styles.featureNameCell]}>
              Schedule Ride
            </Text>
            <Text style={styles.tableCell}>✓</Text>
            <Text style={styles.tableCell}>✓</Text>
            <Text style={styles.tableCell}>✓</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={[styles.tableCell, styles.featureNameCell]}>AI Suggestions</Text>
            <Text style={styles.tableCell}>—</Text>
            <Text style={styles.tableCell}>✓</Text>
            <Text style={styles.tableCell}>✓</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={[styles.tableCell, styles.featureNameCell]}>Family Assistant</Text>
            <Text style={styles.tableCell}>—</Text>
            <Text style={styles.tableCell}>✓</Text>
            <Text style={styles.tableCell}>✓</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={[styles.tableCell, styles.featureNameCell]}>Voice Booking</Text>
            <Text style={styles.tableCell}>—</Text>
            <Text style={styles.tableCell}>✓</Text>
            <Text style={styles.tableCell}>✓</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={[styles.tableCell, styles.featureNameCell]}>
              Fleet Management
            </Text>
            <Text style={styles.tableCell}>—</Text>
            <Text style={styles.tableCell}>—</Text>
            <Text style={styles.tableCell}>✓</Text>
          </View>

          <View style={styles.tableRow}>
            <Text style={[styles.tableCell, styles.featureNameCell]}>Analytics</Text>
            <Text style={styles.tableCell}>—</Text>
            <Text style={styles.tableCell}>—</Text>
            <Text style={styles.tableCell}>✓</Text>
          </View>
        </View>
      </View>

      {/* Trial/Upgrade Modal */}
      <Modal
        visible={showTrialModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowTrialModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Upgrade to Pro Mode</Text>
            <Text style={styles.modalDescription}>
              Unlock advanced features with fleet management and analytics.
            </Text>

            <TouchableOpacity
              style={[styles.modalButton, styles.trialButton]}
              onPress={handleProTrialStart}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.trialButtonText}>Start 7-Day Free Trial</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.modalButton, styles.upgradeButton]}
              onPress={handleProUpgrade}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.upgradeButtonText}>Subscribe Now</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowTrialModal(false)}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  content: {
    paddingBottom: 40,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  errorContainer: {
    margin: 16,
    padding: 12,
    backgroundColor: '#fee2e2',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#dc2626',
  },
  errorText: {
    color: '#991b1b',
    fontSize: 14,
  },
  modesContainer: {
    padding: 16,
    gap: 12,
  },
  modeCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    padding: 16,
    marginBottom: 12,
  },
  currentModeCard: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 12,
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modeName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  modePrice: {
    fontSize: 18,
    fontWeight: '600',
    color: '#059669',
    marginBottom: 12,
  },
  featuresList: {
    marginBottom: 12,
    gap: 8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureDot: {
    fontSize: 16,
    color: '#6b7280',
    marginRight: 8,
    fontWeight: 'bold',
  },
  featureText: {
    fontSize: 14,
    color: '#4b5563',
  },
  currentBadge: {
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  currentBadgeText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  selectButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 12,
  },
  selectButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  comparisonContainer: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  guardianSection: {
    marginTop: 24,
    padding: 16,
    borderRadius: 16,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  guardianSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#3730A3',
    marginBottom: 8,
  },
  guardianSectionDescription: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 16,
  },
  guardianButton: {
    backgroundColor: '#4338CA',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  guardianButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  comparisonTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
  },
  comparisonTable: {
    backgroundColor: 'white',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 12,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
    paddingVertical: 12,
  },
  tableCell: {
    flex: 1,
    fontSize: 14,
    paddingHorizontal: 12,
    color: '#374151',
    textAlign: 'center',
  },
  featureNameCell: {
    flex: 1.5,
    textAlign: 'left',
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  modalDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 24,
    lineHeight: 20,
  },
  modalButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 12,
  },
  trialButton: {
    backgroundColor: '#8b5cf6',
  },
  trialButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  upgradeButton: {
    backgroundColor: '#dc2626',
  },
  upgradeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelButton: {
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
