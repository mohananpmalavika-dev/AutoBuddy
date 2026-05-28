import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';
import VoiceTextInput from './VoiceTextInput';
import { driverDashboardLocales } from '../locales/driverDashboard';

/**
 * Resolve driver dashboard locale based on language code
 * @param {string} languageCode - Language code (en, ml, hi, ta)
 * @returns {object} Translated strings
 */
function resolveDriverLocale(languageCode = 'en') {
  const normalized = String(languageCode || 'en').trim().toLowerCase();
  return driverDashboardLocales[normalized] || driverDashboardLocales.en;
}

const DEFAULT_SETTINGS = {
  push_notifications: true,
  email_notifications: true,
  sms_alerts: true,
  sound_enabled: true,
  vibration_enabled: true,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00',
  language: 'en',
  theme: 'light',
  share_location: true,
  accept_promo: true,
};

function isValidTime24(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(value || '').trim());
}

function normalizeSettings(rawSettings = {}) {
  const source = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  return {
    ...DEFAULT_SETTINGS,
    ...source,
    push_notifications: source.push_notifications ?? DEFAULT_SETTINGS.push_notifications,
    email_notifications: source.email_notifications ?? DEFAULT_SETTINGS.email_notifications,
    sms_alerts: source.sms_alerts ?? DEFAULT_SETTINGS.sms_alerts,
    sound_enabled: source.sound_enabled ?? DEFAULT_SETTINGS.sound_enabled,
    vibration_enabled: source.vibration_enabled ?? DEFAULT_SETTINGS.vibration_enabled,
    quiet_hours_enabled: source.quiet_hours_enabled ?? DEFAULT_SETTINGS.quiet_hours_enabled,
    quiet_hours_start: isValidTime24(source.quiet_hours_start) ? source.quiet_hours_start : DEFAULT_SETTINGS.quiet_hours_start,
    quiet_hours_end: isValidTime24(source.quiet_hours_end) ? source.quiet_hours_end : DEFAULT_SETTINGS.quiet_hours_end,
    language: ['en', 'ml', 'hi', 'ta'].includes(String(source.language || '').toLowerCase()) ? String(source.language).toLowerCase() : DEFAULT_SETTINGS.language,
    theme: ['light', 'dark', 'auto'].includes(String(source.theme || '').toLowerCase()) ? String(source.theme).toLowerCase() : DEFAULT_SETTINGS.theme,
    share_location: source.share_location ?? DEFAULT_SETTINGS.share_location,
    accept_promo: source.accept_promo ?? DEFAULT_SETTINGS.accept_promo,
  };
}

function SettingRow({ label, value, onToggle, disabled = false }) {
  return (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <TouchableOpacity
        style={[styles.toggle, value && styles.toggleActive]}
        onPress={onToggle}
        disabled={disabled}
      >
        <View style={[styles.toggleThumb, value && styles.toggleThumbActive]} />
      </TouchableOpacity>
    </View>
  );
}

/**
 * EnhancedSettingsPanel - Expanded driver settings
 * Notifications, preferences, privacy, accessibility
 */
export default function EnhancedSettingsPanel({
  token,
  loading: parentLoading = false,
  displayIsOnline,
  onToggleOnline,
  onNavigateToTab,
  onSettingsChange,
}) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [languageCode, setLanguageCode] = useState(() => {
    if (typeof window === 'undefined') {
      return 'en';
    }
    return String(window.localStorage.getItem('autobuddy_lang') || 'en').trim().toLowerCase();
  });
  const t = useMemo(() => resolveDriverLocale(languageCode), [languageCode]);
  const languages = useMemo(
    () => [
      { value: 'en', label: t.english || 'English' },
      { value: 'ml', label: t.malayalam || 'Malayalam' },
      { value: 'hi', label: t.hindi || 'Hindi' },
      { value: 'ta', label: t.tamil || 'Tamil' },
    ],
    [t],
  );
  const themes = useMemo(
    () => [
      { value: 'light', label: t.light || 'Light' },
      { value: 'dark', label: t.dark || 'Dark' },
      { value: 'auto', label: t.autoTheme || 'Auto (System)' },
    ],
    [t],
  );
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [quietHoursDraft, setQuietHoursDraft] = useState({});

  // Handle language preference updates without triggering setState in effect
  const updateLanguagePreference = useCallback((lang) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('autobuddy_lang', lang);
      setLanguageCode(lang);
    }
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await apiRequest('/drivers/settings', { token });
      const nextSettings = normalizeSettings(data?.settings || {});
      setSettings(nextSettings);
      onSettingsChange?.(nextSettings);
      setQuietHoursDraft({
        quiet_hours_start: nextSettings.quiet_hours_start,
        quiet_hours_end: nextSettings.quiet_hours_end,
      });
    } catch (err) {
      setError(err.message || 'Could not load settings.');
    } finally {
      setLoading(false);
    }
  }, [onSettingsChange, token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchSettings().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchSettings]);

  const updateSettingsBulk = async (updates = {}) => {
    try {
      setLoading(true);
      setError('');
      const response = await apiRequest('/drivers/settings', {
        method: 'PUT',
        token,
        body: updates,
      });
      const nextSettings = normalizeSettings(response?.settings || { ...settings, ...updates });
      setSettings(nextSettings);
      
      // Update language preference if language setting changed
      if (updates.language && String(updates.language).trim()) {
        updateLanguagePreference(updates.language);
      }
      
      onSettingsChange?.(nextSettings);
      setQuietHoursDraft({
        quiet_hours_start: nextSettings.quiet_hours_start,
        quiet_hours_end: nextSettings.quiet_hours_end,
      });
      setMessage('Settings updated.');
      setTimeout(() => setMessage(''), 2500);
    } catch (err) {
      setError(err.message || 'Failed to update settings');
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async (key, value) => updateSettingsBulk({ [key]: value });

  const toggleSetting = (key) => {
    updateSetting(key, !Boolean(settings[key]));
  };

  const saveQuietHours = () => {
    const start = String(quietHoursDraft.quiet_hours_start || '').trim();
    const end = String(quietHoursDraft.quiet_hours_end || '').trim();
    if (!isValidTime24(start) || !isValidTime24(end)) {
      setError('Quiet hours must use 24-hour HH:MM format (example: 22:00).');
      return;
    }
    updateSettingsBulk({
      quiet_hours_start: start,
      quiet_hours_end: end,
    });
  };

  const handleChangePassword = () => {
    if (typeof onNavigateToTab === 'function') {
      onNavigateToTab('profile');
      return;
    }
    Alert.alert('Security', 'Use Profile > Account Security to change your password.');
  };

  const navigateToTab = (tab, options = {}, fallbackTitle, fallbackMessage) => {
    if (typeof onNavigateToTab === 'function') {
      onNavigateToTab(tab, options);
      return true;
    }
    Alert.alert(fallbackTitle, fallbackMessage);
    return false;
  };

  const handlePaymentMethods = () => {
    navigateToTab(
      'profile',
      { section: 'payout' },
      'Payment Methods',
      'Open Profile > Payout Details to manage the bank account used for driver payments and withdrawals.',
    );
  };

  const handleViewPrivacy = () => {
    setShowPrivacyPolicy((current) => !current);
  };

  const handleHelpFaq = () => {
    navigateToTab(
      'support',
      { supportAction: 'help' },
      'Help & FAQ',
      'Open the Support tab to search FAQs and view help-center answers.',
    );
  };

  const handleContactSupport = () => {
    navigateToTab(
      'support',
      { supportAction: 'contact' },
      'Contact Support',
      'Open the Support tab to create a support ticket.',
    );
  };

  const handleDeleteAccount = () => {
    navigateToTab(
      'support',
      { supportAction: 'contact' },
      'Delete Account',
      'Account deletion requires support verification. Open the Support tab to create a ticket.',
    );
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>{t.settingsTitle || 'Settings & Preferences'}</Text>
      <Text style={styles.subtitle}>{t.settingsSubtitle || 'Manage your account preferences'}</Text>

      {error && <Text style={[styles.message, styles.error]}>{error}</Text>}
      {message && <Text style={[styles.message, styles.success]}>{message}</Text>}

      {/* Availability Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.onlineStatus || 'Availability'}</Text>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>{t.currentStatus || 'Current Status'}</Text>
          <TouchableOpacity
            style={[styles.statusToggle, displayIsOnline && styles.statusToggleActive]}
            onPress={onToggleOnline}
            disabled={parentLoading}
          >
            <Text style={styles.statusToggleText}>{displayIsOnline ? (t.currentlyOnline || 'Online') : (t.currentlyOffline || 'Offline')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Notification Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.notificationSettings || 'Notifications'}</Text>
        <SettingRow
          label={t.pushNotifications || 'Push Notifications'}
          value={settings.push_notifications}
          onToggle={() => toggleSetting('push_notifications')}
          disabled={parentLoading}
        />
        <SettingRow
          label={t.emailNotifications || 'Email Notifications'}
          value={settings.email_notifications}
          onToggle={() => toggleSetting('email_notifications')}
          disabled={parentLoading}
        />
        <SettingRow
          label={t.smsAlerts || 'SMS Alerts'}
          value={settings.sms_alerts}
          onToggle={() => toggleSetting('sms_alerts')}
          disabled={parentLoading}
        />
        <SettingRow
          label={t.soundEnabled || 'Sound Enabled'}
          value={settings.sound_enabled}
          onToggle={() => toggleSetting('sound_enabled')}
          disabled={parentLoading}
        />
        <SettingRow
          label={t.vibrationEnabled || 'Vibration'}
          value={settings.vibration_enabled}
          onToggle={() => toggleSetting('vibration_enabled')}
          disabled={parentLoading}
        />
      </View>

      {/* Quiet Hours */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.quietHoursEnabled || 'Quiet Hours'}</Text>
        <SettingRow
          label={t.quietHoursEnabled || 'Enable Quiet Hours'}
          value={settings.quiet_hours_enabled}
          onToggle={() => toggleSetting('quiet_hours_enabled')}
          disabled={parentLoading}
        />
        {settings.quiet_hours_enabled && (
          <View style={styles.quietHoursForm}>
            <Text style={styles.fieldLabel}>{t.quietHoursStartTime || 'Start Time'}</Text>
            <VoiceTextInput
              style={styles.input}
              value={quietHoursDraft.quiet_hours_start}
              onChangeText={(value) => setQuietHoursDraft((previous) => ({ ...previous, quiet_hours_start: value }))}
              placeholder="22:00"
              placeholderTextColor={COLORS.textMuted}
            />
            <Text style={styles.fieldLabel}>{t.quietHoursEndTime || 'End Time'}</Text>
            <VoiceTextInput
              style={styles.input}
              value={quietHoursDraft.quiet_hours_end}
              onChangeText={(value) => setQuietHoursDraft((previous) => ({ ...previous, quiet_hours_end: value }))}
              placeholder="08:00"
              placeholderTextColor={COLORS.textMuted}
            />
            <TouchableOpacity
              style={[styles.actionButton, (parentLoading || loading) && styles.actionButtonDisabled]}
              onPress={saveQuietHours}
              disabled={parentLoading || loading}
            >
              <Text style={styles.actionButtonText}>{t.saveQuietHours || 'Save Quiet Hours'}</Text>
            </TouchableOpacity>
            <Text style={styles.quietHoursInfo}>
              {t.quietHoursInfo || 'No notifications will be sent during these hours'}
            </Text>
          </View>
        )}
      </View>

      {/* Privacy & Data */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.privacyData || 'Privacy & Data'}</Text>
        <SettingRow
          label={t.shareLocation || 'Share Location'}
          value={settings.share_location}
          onToggle={() => toggleSetting('share_location')}
          disabled={parentLoading}
        />
        <SettingRow
          label={t.promoAcceptance || 'Accept Promotional Offers'}
          value={settings.accept_promo}
          onToggle={() => toggleSetting('accept_promo')}
          disabled={parentLoading}
        />
        <Text style={styles.privacyNote}>
          {t.privacyNote || 'When Share Location is off, location is only shared during active rides. Promotional offers help you earn more.'}
        </Text>
      </View>

      {/* Display Preferences */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.preferences || 'Display'}</Text>
        <Text style={styles.fieldLabel}>{t.language || 'Language'}</Text>
        <View style={styles.optionGroup}>
          {languages.map((lang) => (
            <TouchableOpacity
              key={lang.value}
              style={[styles.option, settings.language === lang.value && styles.optionActive]}
              onPress={() => updateSetting('language', lang.value)}
              disabled={parentLoading}
            >
              <Text
                style={[
                  styles.optionText,
                  settings.language === lang.value && styles.optionTextActive,
                ]}
              >
                {lang.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>{t.theme || 'Theme'}</Text>
        <View style={styles.optionGroup}>
          {themes.map((theme) => (
            <TouchableOpacity
              key={theme.value}
              style={[styles.option, settings.theme === theme.value && styles.optionActive]}
              onPress={() => updateSetting('theme', theme.value)}
              disabled={parentLoading}
            >
              <Text
                style={[
                  styles.optionText,
                  settings.theme === theme.value && styles.optionTextActive,
                ]}
              >
                {theme.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Account Management */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.accountManagement || 'Account Management'}</Text>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={handleChangePassword}
          disabled={parentLoading || loading}
        >
          <Text style={styles.actionButtonText}>{t.changePassword || 'Change Password'}</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={handlePaymentMethods}
          disabled={parentLoading || loading}
        >
          <Text style={styles.actionButtonText}>{t.paymentMethods || 'Payment Methods'}</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={handleViewPrivacy}
          disabled={parentLoading || loading}
        >
          <Text style={styles.actionButtonText}>{showPrivacyPolicy ? (t.hidePrivacyPolicy || 'Hide Privacy Policy') : (t.viewPrivacyPolicy || 'View Privacy Policy')}</Text>
        </TouchableOpacity>
        {showPrivacyPolicy && (
          <View style={styles.policyPanel}>
            <Text style={styles.policyTitle}>AutoBuddy {t.privacyPolicy || 'Privacy Policy'}</Text>
            <Text style={styles.policyText}>
              AutoBuddy uses your account, vehicle, document, ride, payment, safety, and location data to run driver matching, trips, payouts, fraud prevention, and support.
            </Text>
            <Text style={styles.policyText}>
              Location sharing follows your Share Location setting while you are online, and remains active during live rides so passengers and safety tools can track the trip.
            </Text>
            <Text style={styles.policyText}>
              Documents, bank details, and support attachments are used for verification, compliance, payouts, and account help. Promotional preferences control whether offer messages are sent.
            </Text>
            <Text style={styles.policyText}>
              For account export, correction, or deletion requests, use {t.contactSupport || 'Contact Support'} so the team can verify ownership before making changes.
            </Text>
          </View>
        )}
        <TouchableOpacity 
          style={[styles.actionButton, styles.dangerButton]}
          onPress={handleDeleteAccount}
          disabled={parentLoading || loading}
        >
          <Text style={styles.dangerButtonText}>{t.deleteAccount || 'Delete Account'}</Text>
        </TouchableOpacity>
      </View>

      {/* About Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t.about || 'About'}</Text>
        <View style={styles.aboutItem}>
          <Text style={styles.aboutLabel}>{t.appVersion || 'App Version'}</Text>
          <Text style={styles.aboutValue}>1.2.5</Text>
        </View>
        <View style={styles.aboutItem}>
          <Text style={styles.aboutLabel}>{t.lastUpdated || 'Last Updated'}</Text>
          <Text style={styles.aboutValue}>{new Date().toLocaleDateString()}</Text>
        </View>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={handleHelpFaq}
          disabled={parentLoading || loading}
        >
          <Text style={styles.actionButtonText}>{t.helpAndFAQ || 'Help & FAQ'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={handleContactSupport}
          disabled={parentLoading || loading}
        >
          <Text style={styles.actionButtonText}>{t.contactSupport || 'Contact Support'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: COLORS.background,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.textMain,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 16,
  },
  message: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 13,
  },
  error: {
    backgroundColor: '#FFEBEE',
    color: COLORS.error,
  },
  success: {
    backgroundColor: '#E8F5E9',
    color: COLORS.success,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: COLORS.textMain,
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  settingLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMain,
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.border,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleActive: {
    backgroundColor: COLORS.success,
  },
  toggleThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
  },
  toggleThumbActive: {
    alignSelf: 'flex-end',
  },
  statusToggle: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  statusToggleActive: {
    backgroundColor: '#E8F5E9',
    borderColor: COLORS.success,
  },
  statusToggleText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  quietHoursForm: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 6,
    marginTop: 10,
  },
  fieldLabelSpaced: {
    marginTop: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: COLORS.textMain,
    backgroundColor: COLORS.background,
    marginBottom: 10,
  },
  quietHoursInfo: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  privacyNote: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 10,
    lineHeight: 16,
  },
  optionGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  option: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  optionActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  optionText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  optionTextActive: {
    color: '#fff',
  },
  actionButton: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    ...SHADOWS.soft,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  dangerButton: {
    borderColor: COLORS.error,
    backgroundColor: '#FFEBEE',
  },
  dangerButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.error,
  },
  policyPanel: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
  },
  policyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textMain,
    marginBottom: 8,
  },
  policyText: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 17,
    marginBottom: 8,
  },
  aboutItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  aboutLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMain,
  },
  aboutValue: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
});
