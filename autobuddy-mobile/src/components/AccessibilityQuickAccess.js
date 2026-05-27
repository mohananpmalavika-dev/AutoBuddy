import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';

const ACCESSIBILITY_CATEGORIES = [
  {
    id: 'vision',
    label: 'Vision',
    icon: '👁️',
    settings: [
      { key: 'text_size', label: 'Text Size', type: 'select', options: [
        { label: 'Normal', value: 'normal' },
        { label: 'Large', value: 'large' },
        { label: 'Extra Large', value: 'extra_large' },
      ]},
      { key: 'high_contrast', label: 'High Contrast', type: 'toggle' },
      { key: 'reduce_motion', label: 'Reduce Animation', type: 'toggle' },
    ],
  },
  {
    id: 'hearing',
    label: 'Hearing',
    icon: '🔊',
    settings: [
      { key: 'haptic_feedback', label: 'Haptic Feedback', type: 'toggle' },
      { key: 'screen_reader_enabled', label: 'Screen Reader', type: 'toggle' },
    ],
  },
  {
    id: 'mobility',
    label: 'Mobility',
    icon: '♿',
    settings: [
      { key: 'voice_guidance', label: 'Voice Guidance', type: 'toggle' },
    ],
  },
];

const QUICK_TOGGLES = [
  { key: 'high_contrast', label: 'High\nContrast', icon: '◐◑' },
  { key: 'text_size', label: 'Large\nText', icon: 'A+' },
  { key: 'reduce_motion', label: 'Reduce\nMotion', icon: '═' },
  { key: 'haptic_feedback', label: 'Haptic', icon: '⌳' },
];

export default function AccessibilityQuickAccess({ token, onSettingsChange = () => {} }) {
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accessibility, setAccessibility] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('vision');

  const fetchAccessibility = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiRequest('/v1/passengers/accessibility', { token });
      const nextSettings = response?.data || response || {};
      setAccessibility(nextSettings);
      if (nextSettings) {
        onSettingsChange(nextSettings);
      }
    } catch (err) {
      setError(err.message || 'Failed to load accessibility settings');
      // Set defaults on error
      setAccessibility({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token || !showModal) {
      return undefined;
    }
    fetchAccessibility().catch(() => null);
  }, [token, showModal]);

  const updateAccessibility = async (field, value) => {
    try {
      setSaving(true);
      setError('');
      const response = await apiRequest('/v1/passengers/accessibility', {
        method: 'PATCH',
        token,
        body: { [field]: value },
      });
      const nextSettings = response?.data || response || {};
      setAccessibility(nextSettings);
      if (nextSettings) {
        onSettingsChange(nextSettings);
      }
    } catch (err) {
      setError(err.message || 'Failed to update accessibility setting');
    } finally {
      setSaving(false);
    }
  };

  // Count active accessibility settings
  const countActiveSettings = () => {
    if (!accessibility) return 0;
    let count = 0;
    Object.values(accessibility).forEach((val) => {
      if (val === true || (typeof val === 'string' && val !== 'normal')) {
        count += 1;
      }
    });
    return count;
  };

  const activeCount = countActiveSettings();
  const hasActiveSettings = activeCount > 0;

  return (
    <>
      {/* Quick Access Button in Header */}
      <TouchableOpacity
        onPress={() => setShowModal(true)}
        style={[
          styles.quickAccessButton,
          hasActiveSettings && styles.quickAccessButtonActive,
        ]}>
        <Text style={styles.quickAccessIcon}>♿</Text>
        {hasActiveSettings && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{activeCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Accessibility Modal */}
      <Modal visible={showModal} animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Accessibility Settings</Text>
            <View style={{ width: 40 }} />
          </View>

          {loading ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />
          ) : (
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              {!!error && <Text style={styles.errorText}>{error}</Text>}

              {/* Quick Toggles */}
              <View style={styles.quickTogglesSection}>
                <Text style={styles.sectionTitle}>Quick Access</Text>
                <View style={styles.quickTogglesGrid}>
                  {QUICK_TOGGLES.map((toggle) => {
                    const isActive = accessibility?.[toggle.key];
                    const isTextSize = toggle.key === 'text_size';
                    const isLarge = accessibility?.text_size === 'large' || accessibility?.text_size === 'extra_large';

                    return (
                      <TouchableOpacity
                        key={toggle.key}
                        style={[
                          styles.quickToggleButton,
                          (isActive || (isTextSize && isLarge)) && styles.quickToggleButtonActive,
                        ]}
                        onPress={() => {
                          if (isTextSize) {
                            const sizes = ['normal', 'large', 'extra_large'];
                            const current = accessibility?.text_size || 'normal';
                            const nextIdx = (sizes.indexOf(current) + 1) % sizes.length;
                            updateAccessibility('text_size', sizes[nextIdx]);
                          } else {
                            updateAccessibility(toggle.key, !isActive);
                          }
                        }}
                        disabled={saving}>
                        <Text style={styles.quickToggleIcon}>{toggle.icon}</Text>
                        <Text style={styles.quickToggleLabel}>{toggle.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Category Tabs */}
              <View style={styles.categoriesTabBar}>
                {ACCESSIBILITY_CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.categoryTab, activeCategory === cat.id && styles.categoryTabActive]}
                    onPress={() => setActiveCategory(cat.id)}>
                    <Text style={styles.categoryTabIcon}>{cat.icon}</Text>
                    <Text style={[styles.categoryTabLabel, activeCategory === cat.id && styles.categoryTabLabelActive]}>
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Settings for Active Category */}
              {ACCESSIBILITY_CATEGORIES.map((cat) => {
                if (activeCategory !== cat.id) return null;

                return (
                  <View key={cat.id} style={styles.categoryContent}>
                    <Text style={styles.categoryTitle}>{cat.label} Accessibility</Text>
                    {cat.settings.map((setting) => {
                      if (setting.type === 'toggle') {
                        return (
                          <TouchableOpacity
                            key={setting.key}
                            style={styles.settingRow}
                            onPress={() => updateAccessibility(setting.key, !accessibility?.[setting.key])}
                            disabled={saving}>
                            <View style={styles.settingLabel}>
                              <Text style={styles.settingLabelText}>{setting.label}</Text>
                            </View>
                            <View
                              style={[
                                styles.toggle,
                                accessibility?.[setting.key] && styles.toggleActive,
                              ]}>
                              <View
                                style={[
                                  styles.toggleDot,
                                  accessibility?.[setting.key] && styles.toggleDotActive,
                                ]}
                              />
                            </View>
                          </TouchableOpacity>
                        );
                      }

                      if (setting.type === 'select') {
                        return (
                          <View key={setting.key} style={styles.selectBlock}>
                            <Text style={styles.settingLabelText}>{setting.label}</Text>
                            <View style={styles.optionsRow}>
                              {setting.options.map((option) => (
                                <TouchableOpacity
                                  key={option.value}
                                  style={[
                                    styles.optionChip,
                                    accessibility?.[setting.key] === option.value && styles.optionChipActive,
                                  ]}
                                  onPress={() => updateAccessibility(setting.key, option.value)}
                                  disabled={saving}>
                                  <Text
                                    style={[
                                      styles.optionChipText,
                                      accessibility?.[setting.key] === option.value && styles.optionChipTextActive,
                                    ]}>
                                    {option.label}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </View>
                        );
                      }

                      return null;
                    })}
                  </View>
                );
              })}

              {/* Info Block */}
              <View style={styles.infoBlock}>
                <Text style={styles.infoText}>
                  💡 Accessibility settings are saved to your profile and applied automatically on your next ride.
                </Text>
              </View>

              <View style={{ height: 20 }} />
            </ScrollView>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  quickAccessButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    position: 'relative',
    ...SHADOWS.soft,
  },
  quickAccessButtonActive: {
    backgroundColor: '#E8F5E9',
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  quickAccessIcon: {
    fontSize: 20,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#FF6B6B',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },

  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
    ...SHADOWS.soft,
  },
  closeButton: {
    fontSize: 24,
    color: COLORS.textMain,
    fontWeight: '600',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  modalContent: {
    flex: 1,
    padding: 12,
  },

  loader: { flex: 1, justifyContent: 'center' },
  errorText: { color: '#D32F2F', fontSize: 12, marginBottom: 10, padding: 10 },

  quickTogglesSection: {
    marginBottom: 16,
  },
  quickTogglesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickToggleButton: {
    width: '48%',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#EFEFEF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    gap: 6,
  },
  quickToggleButtonActive: {
    backgroundColor: '#E3F2FD',
    borderColor: COLORS.primary,
  },
  quickToggleIcon: {
    fontSize: 20,
  },
  quickToggleLabel: {
    fontSize: 11,
    color: COLORS.textMain,
    fontWeight: '600',
    textAlign: 'center',
  },

  categoriesTabBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  categoryTab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    gap: 4,
  },
  categoryTabActive: {
    borderBottomWidth: 3,
    borderBottomColor: COLORS.primary,
  },
  categoryTabIcon: {
    fontSize: 18,
  },
  categoryTabLabel: {
    fontSize: 12,
    color: COLORS.textMuted,
    fontWeight: '600',
  },
  categoryTabLabelActive: {
    color: COLORS.primary,
  },

  categoryContent: {
    marginBottom: 16,
  },
  categoryTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 12,
  },

  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  settingLabel: { flex: 1 },
  settingLabelText: { fontSize: 13, color: COLORS.textMain, fontWeight: '500' },

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

  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 10,
  },

  infoBlock: {
    padding: 12,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  infoText: { fontSize: 12, color: '#1976D2', lineHeight: 16 },
});
