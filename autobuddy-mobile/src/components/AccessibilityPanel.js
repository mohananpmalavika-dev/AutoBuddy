import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';

const TEXT_SIZE_OPTIONS = [
  { label: 'Normal', value: 'normal' },
  { label: 'Large', value: 'large' },
  { label: 'Extra Large', value: 'extra_large' },
];

const ACCESSIBILITY_SECTIONS = [
  {
    title: 'Visual',
    description: 'Settings for sight and vision-related needs',
    icon: '👁️',
    settings: [
      {
        key: 'text_size',
        label: 'Text Size',
        description: 'Adjust text size throughout the app',
        type: 'select',
        options: TEXT_SIZE_OPTIONS,
      },
      {
        key: 'high_contrast',
        label: 'High Contrast Mode',
        description: 'Increase contrast for better visibility',
        type: 'toggle',
      },
      {
        key: 'reduce_motion',
        label: 'Reduce Motion',
        description: 'Minimize animations and transitions',
        type: 'toggle',
      },
    ],
  },
  {
    title: 'Audio & Feedback',
    description: 'Settings for hearing and tactile feedback',
    icon: '🔊',
    settings: [
      {
        key: 'screen_reader_enabled',
        label: 'Screen Reader Support',
        description: 'Enable screen reader compatibility',
        type: 'toggle',
      },
      {
        key: 'haptic_feedback',
        label: 'Haptic Feedback',
        description: 'Vibration feedback for actions',
        type: 'toggle',
      },
      {
        key: 'voice_guidance',
        label: 'Voice Guidance',
        description: 'Audio guidance during rides',
        type: 'toggle',
      },
    ],
  },
];

function AccessibilityToggle({ label, description, field, value, saving, onToggle }) {
  return (
    <View style={styles.settingBlock}>
      <TouchableOpacity
        style={styles.settingRow}
        onPress={() => onToggle(field, !value)}
        disabled={saving}>
        <View style={styles.settingContent}>
          <Text style={styles.settingLabel}>{label}</Text>
          {description && <Text style={styles.settingDescription}>{description}</Text>}
        </View>
        <View style={[styles.toggle, value && styles.toggleActive]}>
          <View style={[styles.toggleDot, value && styles.toggleDotActive]} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

function AccessibilitySelect({ label, description, field, value, options, saving, onSelect }) {
  return (
    <View style={styles.settingBlock}>
      <Text style={styles.settingLabel}>{label}</Text>
      {description && <Text style={styles.settingDescription}>{description}</Text>}
      <View style={styles.optionsRow}>
        {options.map((option) => (
          <TouchableOpacity
            key={option.value}
            style={[styles.optionChip, value === option.value && styles.optionChipActive]}
            onPress={() => onSelect(field, option.value)}
            disabled={saving}>
            <Text style={[styles.optionChipText, value === option.value && styles.optionChipTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function AccessibilityPanel({ token, onSettingsChange = () => {} }) {
  const [loading, setLoading] = useState(false);
  const [accessibility, setAccessibility] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchAccessibility = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiRequest('/v1/passengers/accessibility', { token });
      const nextSettings = response?.data || response || null;
      setAccessibility(nextSettings);
      if (nextSettings) {
        onSettingsChange(nextSettings);
      }
    } catch (err) {
      setError(err.message || 'Failed to load accessibility settings');
    } finally {
      setLoading(false);
    }
  }, [onSettingsChange, token]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }
    const timer = setTimeout(() => {
      fetchAccessibility().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [token, fetchAccessibility]);

  const updateAccessibility = useCallback(
    async (field, value) => {
      try {
        setSaving(true);
        setError('');
        const response = await apiRequest('/v1/passengers/accessibility', {
          method: 'PATCH',
          token,
          body: { [field]: value },
        });
        const nextSettings = response?.data || response || null;
        setAccessibility(nextSettings);
        if (nextSettings) {
          onSettingsChange(nextSettings);
        }
      } catch (err) {
        setError(err.message || 'Failed to update accessibility setting');
      } finally {
        setSaving(false);
      }
    },
    [onSettingsChange, token],
  );

  if (loading || !accessibility) {
    return <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />;
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.infoBlock}>
        <Text style={styles.infoTitle}>Accessibility Preferences</Text>
        <Text style={styles.infoText}>
          Customize your experience to match your needs. These settings apply to your entire account.
        </Text>
      </View>

      {ACCESSIBILITY_SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionIcon}>{section.icon}</Text>
            <View style={styles.sectionTitleBlock}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionDescription}>{section.description}</Text>
            </View>
          </View>

          <View style={styles.settingsContent}>
            {section.settings.map((setting) => {
              if (setting.type === 'toggle') {
                return (
                  <AccessibilityToggle
                    key={setting.key}
                    label={setting.label}
                    description={setting.description}
                    field={setting.key}
                    value={accessibility[setting.key]}
                    saving={saving}
                    onToggle={updateAccessibility}
                  />
                );
              }

              if (setting.type === 'select') {
                return (
                  <AccessibilitySelect
                    key={setting.key}
                    label={setting.label}
                    description={setting.description}
                    field={setting.key}
                    value={accessibility[setting.key]}
                    options={setting.options}
                    saving={saving}
                    onSelect={updateAccessibility}
                  />
                );
              }

              return null;
            })}
          </View>
        </View>
      ))}

      <View style={styles.infoBlock}>
        <Text style={styles.infoText}>
          ℹ️ These settings are saved to your profile and will be applied whenever you use AutoBuddy.
        </Text>
      </View>

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 12 },
  loader: { flex: 1, justifyContent: 'center' },
  errorText: { color: '#D32F2F', fontSize: 12, marginBottom: 10, padding: 10 },

  infoBlock: {
    padding: 12,
    marginBottom: 16,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: 6,
  },
  infoText: { fontSize: 12, color: '#1976D2', lineHeight: 16 },

  section: {
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    ...SHADOWS.soft,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  sectionIcon: {
    fontSize: 24,
    marginRight: 10,
  },
  sectionTitleBlock: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  sectionDescription: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 2,
  },

  settingsContent: {
    gap: 0,
  },
  settingBlock: {
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingContent: {
    flex: 1,
    marginRight: 12,
  },
  settingLabel: { fontSize: 13, color: COLORS.textMain, fontWeight: '600' },
  settingDescription: { fontSize: 11, color: COLORS.textMuted, marginTop: 3, lineHeight: 15 },

  toggle: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#CCCCCC',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleActive: { backgroundColor: COLORS.primary },
  toggleDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignSelf: 'flex-start',
  },
  toggleDotActive: { alignSelf: 'flex-end' },

  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  optionChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  optionChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  optionChipText: { fontSize: 11, color: COLORS.textMain, fontWeight: '600' },
  optionChipTextActive: { color: '#FFFFFF' },
});
