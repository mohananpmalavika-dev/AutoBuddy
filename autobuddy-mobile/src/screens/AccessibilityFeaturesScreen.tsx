import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Switch,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAccessibilityFeatures } from '../hooks/useAccessibilityFeatures';

interface AccessibilityFeaturesScreenProps {
  token: string | null;
  userId: string;
}

export const AccessibilityFeaturesScreen: React.FC<
  AccessibilityFeaturesScreenProps
> = ({ token, userId }) => {
  const {
    settings,
    loading,
    fetchSettings,
    updateVisualSettings,
    updateAudioSettings,
    updateMotorSettings,
    updateCognitiveSettings,
    resetToDefaults,
    getAccessibilityPreset,
  } = useAccessibilityFeatures(token, userId);

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'visual' | 'audio' | 'motor' | 'cognitive'>('visual');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await fetchSettings();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleResetToDefaults = () => {
    Alert.alert(
      'Reset Accessibility Settings',
      'Are you sure you want to reset all accessibility settings to defaults?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            const success = await resetToDefaults();
            if (success) {
              Alert.alert('Success', 'Accessibility settings reset to defaults');
            }
          },
        },
      ]
    );
  };

  const applyPreset = async (preset: string) => {
    const presetSettings = getAccessibilityPreset(preset);
    if (presetSettings) {
      Alert.alert(
        `Apply ${preset.charAt(0).toUpperCase() + preset.slice(1)} Preset`,
        'This will update your accessibility settings for optimal experience.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Apply',
            style: 'default',
            onPress: async () => {
              await updateVisualSettings(presetSettings.visualSettings);
              await updateAudioSettings(presetSettings.audioSettings);
              await updateMotorSettings(presetSettings.motorSettings);
              await updateCognitiveSettings(presetSettings.cognitiveSettings);
              Alert.alert('Success', 'Preset applied successfully');
            },
          },
        ]
      );
    }
  };

  if (loading && !settings) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  if (!settings) {
    return (
      <View style={styles.errorContainer}>
        <MaterialIcons name="error" size={48} color="#F44336" />
        <Text style={styles.errorText}>Failed to load accessibility settings</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Presets */}
      <View style={styles.presetsSection}>
        <Text style={styles.sectionTitle}>Quick Presets</Text>
        <View style={styles.presetsGrid}>
          <PresetButton
            label="Blind"
            icon="visibility-off"
            onPress={() => applyPreset('blind')}
          />
          <PresetButton
            label="Low Vision"
            icon="visibility"
            onPress={() => applyPreset('lowVision')}
          />
          <PresetButton
            label="Deaf"
            icon="hearing-disabled"
            onPress={() => applyPreset('deaf')}
          />
          <PresetButton
            label="Motor"
            icon="accessibility-new"
            onPress={() => applyPreset('motorImpaired')}
          />
          <PresetButton
            label="Dyslexia"
            icon="spellcheck"
            onPress={() => applyPreset('dyslexia')}
          />
        </View>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TabButton
          label="Visual"
          active={activeTab === 'visual'}
          onPress={() => setActiveTab('visual')}
        />
        <TabButton
          label="Audio"
          active={activeTab === 'audio'}
          onPress={() => setActiveTab('audio')}
        />
        <TabButton
          label="Motor"
          active={activeTab === 'motor'}
          onPress={() => setActiveTab('motor')}
        />
        <TabButton
          label="Cognitive"
          active={activeTab === 'cognitive'}
          onPress={() => setActiveTab('cognitive')}
        />
      </View>

      {/* Visual Settings */}
      {activeTab === 'visual' && (
        <View style={styles.section}>
          <Text style={styles.subsectionTitle}>Text Size</Text>
          <View style={styles.optionButtons}>
            {(['small', 'normal', 'large', 'xlarge'] as const).map((size) => (
              <Pressable
                key={size}
                style={[
                  styles.optionButton,
                  settings.visualSettings.fontSize === size &&
                    styles.optionButtonActive,
                ]}
                onPress={async () => {
                  await updateVisualSettings({ fontSize: size });
                }}
              >
                <Text
                  style={[
                    styles.optionButtonText,
                    settings.visualSettings.fontSize === size &&
                      styles.optionButtonTextActive,
                  ]}
                >
                  {size.charAt(0).toUpperCase() + size.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>

          <SettingToggle
            icon="contrast"
            label="High Contrast"
            value={settings.visualSettings.highContrast}
            onChange={(value) =>
              updateVisualSettings({ highContrast: value })
            }
          />

          <SettingToggle
            icon="dark-mode"
            label="Dark Mode"
            value={settings.visualSettings.darkMode}
            onChange={(value) =>
              updateVisualSettings({ darkMode: value })
            }
          />

          <SettingToggle
            icon="motion-photos-off"
            label="Reduce Animations"
            value={settings.visualSettings.reduceAnimations}
            onChange={(value) =>
              updateVisualSettings({ reduceAnimations: value })
            }
          />

          <Text style={styles.subsectionTitle}>Color Blind Mode</Text>
          <View style={styles.optionButtons}>
            {(['none', 'deuteranopia', 'protanopia', 'tritanopia'] as const).map((mode) => (
              <Pressable
                key={mode}
                style={[
                  styles.modeButton,
                  settings.visualSettings.colorBlindMode === mode &&
                    styles.modeButtonActive,
                ]}
                onPress={async () => {
                  await updateVisualSettings({ colorBlindMode: mode });
                }}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    settings.visualSettings.colorBlindMode === mode &&
                      styles.modeButtonTextActive,
                  ]}
                >
                  {mode === 'none' ? 'None' : mode.charAt(0).toUpperCase() + mode.slice(1)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {/* Audio Settings */}
      {activeTab === 'audio' && (
        <View style={styles.section}>
          <SettingToggle
            icon="graphic-eq"
            label="Audio Description"
            value={settings.audioSettings.audioDescription}
            onChange={(value) =>
              updateAudioSettings({ audioDescription: value })
            }
          />

          <SettingToggle
            icon="subtitles"
            label="Always Show Captions"
            value={settings.audioSettings.captionPreference === 'always'}
            onChange={(value) =>
              updateAudioSettings({
                captionPreference: value ? 'always' : 'auto',
              })
            }
          />

          <SettingToggle
            icon="notifications-active"
            label="Sound Indicators"
            value={settings.audioSettings.soundIndicators}
            onChange={(value) =>
              updateAudioSettings({ soundIndicators: value })
            }
          />
        </View>
      )}

      {/* Motor Settings */}
      {activeTab === 'motor' && (
        <View style={styles.section}>
          <SettingToggle
            icon="pan-tool"
            label="Larger Touch Targets"
            value={settings.motorSettings.largerTouchTargets}
            onChange={(value) =>
              updateMotorSettings({ largerTouchTargets: value })
            }
          />

          <SettingToggle
            icon="gesture"
            label="Simplified Gestures"
            value={settings.motorSettings.simplifiedGestures}
            onChange={(value) =>
              updateMotorSettings({ simplifiedGestures: value })
            }
          />

          <SettingToggle
            icon="mic"
            label="Voice Control"
            value={settings.motorSettings.voiceControl}
            onChange={(value) =>
              updateMotorSettings({ voiceControl: value })
            }
          />
        </View>
      )}

      {/* Cognitive Settings */}
      {activeTab === 'cognitive' && (
        <View style={styles.section}>
          <SettingToggle
            icon="dashboard"
            label="Simplified UI"
            value={settings.cognitiveSettings.simplifiedUI}
            onChange={(value) =>
              updateCognitiveSettings({ simplifiedUI: value })
            }
          />

          <SettingToggle
            icon="auto-stories"
            label="Reading Guide"
            value={settings.cognitiveSettings.readingGuide}
            onChange={(value) =>
              updateCognitiveSettings({ readingGuide: value })
            }
          />

          <SettingToggle
            icon="center-focus-strong"
            label="Focus Mode"
            value={settings.cognitiveSettings.focusMode}
            onChange={(value) =>
              updateCognitiveSettings({ focusMode: value })
            }
          />
        </View>
      )}

      {/* Reset Button */}
      <View style={styles.section}>
        <Pressable
          style={styles.resetButton}
          onPress={handleResetToDefaults}
        >
          <MaterialIcons name="refresh" size={20} color="#F44336" />
          <Text style={styles.resetButtonText}>Reset to Defaults</Text>
        </Pressable>
      </View>

      <View style={{ height: 20 }} />
    </ScrollView>
  );
};

const PresetButton: React.FC<{
  label: string;
  icon: string;
  onPress: () => void;
}> = ({ label, icon, onPress }) => {
  return (
    <Pressable style={styles.presetButton} onPress={onPress}>
      <MaterialIcons name={icon as any} size={24} color="#2196F3" />
      <Text style={styles.presetButtonLabel}>{label}</Text>
    </Pressable>
  );
};

const TabButton: React.FC<{
  label: string;
  active: boolean;
  onPress: () => void;
}> = ({ label, active, onPress }) => {
  return (
    <Pressable
      style={[styles.tabButton, active && styles.tabButtonActive]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.tabButtonText,
          active && styles.tabButtonTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
};

const SettingToggle: React.FC<{
  icon: string;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}> = ({ icon, label, value, onChange }) => {
  return (
    <View style={styles.settingItem}>
      <View style={styles.settingLeft}>
        <MaterialIcons name={icon as any} size={20} color="#2196F3" />
        <Text style={styles.settingLabel}>{label}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: '#e0e0e0', true: '#81C784' }}
        thumbColor={value ? '#4CAF50' : '#f0f0f0'}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#F44336',
    marginTop: 12,
  },
  presetsSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    marginBottom: 12,
  },
  presetsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetButton: {
    width: '30%',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 6,
  },
  presetButtonLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    alignItems: 'center',
  },
  tabButtonActive: {
    borderBottomColor: '#2196F3',
  },
  tabButtonText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: '#2196F3',
  },
  section: {
    marginHorizontal: 16,
    marginVertical: 12,
  },
  subsectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
    marginTop: 12,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 8,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
  },
  optionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  optionButton: {
    flex: 1,
    minWidth: '23%',
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  optionButtonActive: {
    backgroundColor: '#2196F3',
  },
  optionButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
  },
  optionButtonTextActive: {
    color: '#fff',
  },
  modeButton: {
    flex: 1,
    minWidth: '23%',
    paddingVertical: 8,
    paddingHorizontal: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  modeButtonActive: {
    backgroundColor: '#2196F3',
  },
  modeButtonText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666',
    textAlign: 'center',
  },
  modeButtonTextActive: {
    color: '#fff',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#F44336',
  },
  resetButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#F44336',
  },
});

export default AccessibilityFeaturesScreen;
