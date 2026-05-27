import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Alert,
} from 'react-native';
import { COLORS } from '../theme';
import { useAccessibility } from '../contexts/AccessibilityContext';

/**
 * AccessibilitySettings - Manage accessibility features
 */
export default function AccessibilitySettings() {
  const { accessibility, updateAccessibilitySettings, resetAccessibilitySettings } =
    useAccessibility();

  const textSizeOptions = ['small', 'normal', 'large'];

  const handleReset = () => {
    Alert.alert('Reset Accessibility Settings', 'Are you sure?', [
      { text: 'Cancel', onPress: () => {} },
      {
        text: 'Reset',
        onPress: () => {
          resetAccessibilitySettings();
          Alert.alert('Success', 'Accessibility settings reset to defaults');
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Accessibility Settings</Text>

      {/* Text Size */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Text Size</Text>
        <View style={styles.buttonGroup}>
          {textSizeOptions.map((size) => (
            <TouchableOpacity
              key={size}
              style={[
                styles.sizeButton,
                accessibility.textSize === size && styles.sizeButtonActive,
              ]}
              onPress={() => updateAccessibilitySettings('textSize', size)}
            >
              <Text
                style={[
                  styles.sizeButtonText,
                  { fontSize: size === 'small' ? 12 : size === 'large' ? 16 : 14 },
                  accessibility.textSize === size && styles.sizeButtonTextActive,
                ]}
              >
                {size.charAt(0).toUpperCase() + size.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Visual Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Visual Settings</Text>

        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>High Contrast Mode</Text>
          <Switch
            value={accessibility.highContrast}
            onValueChange={(v) => updateAccessibilitySettings('highContrast', v)}
          />
        </View>

        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Reduce Motion</Text>
          <Switch
            value={accessibility.reduceMotion}
            onValueChange={(v) => updateAccessibilitySettings('reduceMotion', v)}
          />
        </View>
      </View>

      {/* Audio & Haptic Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Audio & Haptic</Text>

        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Haptic Feedback</Text>
          <Switch
            value={accessibility.hapticFeedback}
            onValueChange={(v) => updateAccessibilitySettings('hapticFeedback', v)}
          />
        </View>

        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Voice Guidance</Text>
          <Switch
            value={accessibility.voiceGuidance}
            onValueChange={(v) => updateAccessibilitySettings('voiceGuidance', v)}
          />
        </View>

        <View style={styles.settingItem}>
          <Text style={styles.settingLabel}>Screen Reader Support</Text>
          <Switch
            value={accessibility.screenReaderEnabled}
            onValueChange={(v) => updateAccessibilitySettings('screenReaderEnabled', v)}
          />
        </View>
      </View>

      {/* Information */}
      <View style={styles.infoSection}>
        <Text style={styles.infoTitle}>About Accessibility</Text>
        <Text style={styles.infoText}>
          These settings help customize the app for your needs. Enable voice guidance to hear
          notifications read aloud, or use high contrast mode for better visibility.
        </Text>
      </View>

      {/* Reset Button */}
      <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
        <Text style={styles.resetButtonText}>Reset to Defaults</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
    padding: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 20,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 12,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  sizeButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#DDD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '15',
  },
  sizeButtonText: {
    fontWeight: '600',
    color: COLORS.textMain,
  },
  sizeButtonTextActive: {
    color: COLORS.primary,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  settingLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textMain,
  },
  infoSection: {
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    marginVertical: 20,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMain,
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  resetButton: {
    paddingVertical: 12,
    backgroundColor: '#F44336',
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  resetButtonText: {
    color: 'white',
    fontWeight: '700',
  },
});
