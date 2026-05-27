import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';

const TEXT_SIZE_OPTIONS = [
  { label: 'Normal', value: 'normal' },
  { label: 'Large', value: 'large' },
  { label: 'Extra Large', value: 'extra_large' },
];

function AccessibilityToggle({ label, field, value, saving, onToggle }) {
  return (
    <TouchableOpacity
      style={styles.accessibilityRow}
      onPress={() => onToggle(field, !value)}
      disabled={saving}>
      <View style={styles.accessibilityLabel}>
        <Text style={styles.accessibilityLabelText}>{label}</Text>
      </View>
      <View style={[styles.toggle, value && styles.toggleActive]}>
        <View style={[styles.toggleDot, value && styles.toggleDotActive]} />
      </View>
    </TouchableOpacity>
  );
}

function AccessibilitySelect({ label, field, value, options, saving, onSelect }) {
  return (
    <View style={styles.selectBlock}>
      <Text style={styles.accessibilityLabelText}>{label}</Text>
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Visual Accessibility</Text>
        <AccessibilitySelect
          label="Text Size"
          field="text_size"
          value={accessibility.text_size}
          options={TEXT_SIZE_OPTIONS}
          saving={saving}
          onSelect={updateAccessibility}
        />
        <AccessibilityToggle
          label="High Contrast"
          field="high_contrast"
          value={accessibility.high_contrast}
          saving={saving}
          onToggle={updateAccessibility}
        />
        <AccessibilityToggle
          label="Screen Reader Support"
          field="screen_reader_enabled"
          value={accessibility.screen_reader_enabled}
          saving={saving}
          onToggle={updateAccessibility}
        />
        <AccessibilityToggle
          label="Reduce Motion"
          field="reduce_motion"
          value={accessibility.reduce_motion}
          saving={saving}
          onToggle={updateAccessibility}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ride Guidance</Text>
        <AccessibilityToggle
          label="Haptic Feedback"
          field="haptic_feedback"
          value={accessibility.haptic_feedback}
          saving={saving}
          onToggle={updateAccessibility}
        />
        <AccessibilityToggle
          label="Voice Guidance"
          field="voice_guidance"
          value={accessibility.voice_guidance}
          saving={saving}
          onToggle={updateAccessibility}
        />
      </View>

      <View style={styles.infoBlock}>
        <Text style={styles.infoText}>
          These settings are saved to your passenger profile and can be used to improve ride support.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 12 },
  loader: { flex: 1, justifyContent: 'center' },
  errorText: { color: '#D32F2F', fontSize: 12, marginBottom: 10 },
  section: {
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    ...SHADOWS.soft,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 12,
  },
  accessibilityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  accessibilityLabel: { flex: 1 },
  accessibilityLabelText: { fontSize: 13, color: COLORS.textMain, fontWeight: '500' },
  selectBlock: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EFEFEF' },
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
  infoBlock: {
    padding: 12,
    marginTop: 10,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  infoText: { fontSize: 12, color: '#1976D2', lineHeight: 16 },
});
