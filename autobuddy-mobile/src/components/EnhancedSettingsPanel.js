import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';

/**
 * EnhancedSettingsPanel - Expanded driver settings
 * Notifications, preferences, privacy, accessibility
 */
export default function EnhancedSettingsPanel({ token, loading: parentLoading = false, displayIsOnline, onToggleOnline }) {
  const [settings, setSettings] = useState({
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
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const languages = [
    { value: 'en', label: 'English' },
    { value: 'ml', label: 'Malayalam' },
    { value: 'hi', label: 'Hindi' },
    { value: 'ta', label: 'Tamil' },
  ];

  const themes = [
    { value: 'light', label: '☀️ Light Mode' },
    { value: 'dark', label: '🌙 Dark Mode' },
    { value: 'auto', label: '🔄 Auto (System)' },
  ];

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setError('');
      try {
        const data = await apiRequest('/drivers/settings', { token });
        if (data && data.settings) {
          setSettings(data.settings);
        }
      } catch (err) {
        console.log('Settings endpoint not yet implemented, using defaults');
      }
    } catch (err) {
      setError(err.message || 'Using default settings');
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async (key, value) => {
    try {
      setLoading(true);
      setError('');
      const updated = { ...settings, [key]: value };
      await apiRequest('/drivers/settings', {
        method: 'PUT',
        token,
        body: { [key]: value },
      });
      setSettings(updated);
      setMessage('Setting updated');
    } catch (err) {
      setError(err.message || 'Failed to update setting');
    } finally {
      setLoading(false);
    }
  };

  const toggleSetting = (key) => {
    updateSetting(key, !settings[key]);
  };

  const handleChangePassword = () => {
    Alert.prompt(
      'Change Password',
      'Enter your current password',
      [
        {
          text: 'Cancel',
          onPress: () => {},
          style: 'cancel',
        },
        {
          text: 'Next',
          onPress: async (currentPassword) => {
            Alert.prompt(
              'New Password',
              'Enter your new password',
              [
                {
                  text: 'Cancel',
                  onPress: () => {},
                  style: 'cancel',
                },
                {
                  text: 'Confirm',
                  onPress: async (newPassword) => {
                    try {
                      setLoading(true);
                      setError('');
                      try {
                        await apiRequest('/drivers/change-password', {
                          method: 'POST',
                          token,
                          body: { currentPassword, newPassword },
                        });
                        setMessage('Password changed successfully');
                        setTimeout(() => setMessage(''), 3000);
                      } catch (err) {
                        console.log('Change password endpoint not yet implemented');
                        Alert.alert('Info', 'Password change functionality coming soon');
                      }
                    } catch (err) {
                      setError(err.message || 'Failed to change password');
                    } finally {
                      setLoading(false);
                    }
                  },
                },
              ],
              'secure-text',
            );
          },
        },
      ],
      'secure-text',
    );
  };

  const handlePaymentMethods = () => {
    Alert.alert(
      'Payment Methods',
      'Manage your payment methods and account',
      [
        { text: 'Add Payment Method', onPress: () => console.log('Add payment method') },
        { text: 'View Linked Accounts', onPress: () => console.log('View linked accounts') },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const handleViewPrivacy = () => {
    Alert.alert(
      'Privacy Policy',
      'AutoBuddy is committed to protecting your privacy. Tap OK to view the full policy in your browser.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'OK',
          onPress: () => {
            console.log('Open privacy policy');
          },
        },
      ],
    );
  };

  const handleHelpFaq = () => {
    Alert.alert(
      'Help & FAQ',
      'Common questions and support resources',
      [
        { text: 'View FAQ', onPress: () => console.log('View FAQ') },
        { text: 'Contact Support', onPress: () => console.log('Contact support') },
        { text: 'Close', style: 'cancel' },
      ],
    );
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action cannot be undone. All your data will be permanently deleted.',
      [
        {
          text: 'Cancel',
          onPress: () => {},
          style: 'cancel',
        },
        {
          text: 'Delete',
          onPress: async () => {
            Alert.prompt(
              'Confirm Deletion',
              'Type "DELETE" to confirm account deletion',
              [
                {
                  text: 'Cancel',
                  onPress: () => {},
                  style: 'cancel',
                },
                {
                  text: 'Delete',
                  onPress: async (text) => {
                    if (text === 'DELETE') {
                      try {
                        setLoading(true);
                        setError('');
                        try {
                          await apiRequest('/drivers/account', {
                            method: 'DELETE',
                            token,
                          });
                          Alert.alert('Account Deleted', 'Your account has been deleted');
                          // Redirect to login or app entry point
                        } catch (err) {
                          console.log('Delete account endpoint not yet implemented');
                          Alert.alert('Info', 'Account deletion functionality coming soon');
                        }
                      } catch (err) {
                        setError(err.message || 'Failed to delete account');
                      } finally {
                        setLoading(false);
                      }
                    } else {
                      Alert.alert('Cancelled', 'Account deletion cancelled');
                    }
                  },
                },
              ],
            );
          },
          style: 'destructive',
        },
      ],
    );
  };

  const SettingRow = ({ label, value, onToggle }) => (
    <View style={styles.settingRow}>
      <Text style={styles.settingLabel}>{label}</Text>
      <TouchableOpacity
        style={[styles.toggle, value && styles.toggleActive]}
        onPress={onToggle}
        disabled={parentLoading}
      >
        <View style={[styles.toggleThumb, value && styles.toggleThumbActive]} />
      </TouchableOpacity>
    </View>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>⚙️ Settings & Preferences</Text>
      <Text style={styles.subtitle}>Manage your account preferences</Text>

      {error && <Text style={[styles.message, styles.error]}>{error}</Text>}
      {message && <Text style={[styles.message, styles.success]}>{message}</Text>}

      {/* Availability Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🟢 Availability</Text>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Current Status</Text>
          <TouchableOpacity
            style={[styles.statusToggle, displayIsOnline && styles.statusToggleActive]}
            onPress={onToggleOnline}
            disabled={parentLoading}
          >
            <Text style={styles.statusToggleText}>{displayIsOnline ? '🟢 Online' : '🔴 Offline'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Notification Settings */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔔 Notifications</Text>
        <SettingRow
          label="Push Notifications"
          value={settings.push_notifications}
          onToggle={() => toggleSetting('push_notifications')}
        />
        <SettingRow
          label="Email Notifications"
          value={settings.email_notifications}
          onToggle={() => toggleSetting('email_notifications')}
        />
        <SettingRow
          label="SMS Alerts"
          value={settings.sms_alerts}
          onToggle={() => toggleSetting('sms_alerts')}
        />
        <SettingRow
          label="Sound Enabled"
          value={settings.sound_enabled}
          onToggle={() => toggleSetting('sound_enabled')}
        />
        <SettingRow
          label="Vibration"
          value={settings.vibration_enabled}
          onToggle={() => toggleSetting('vibration_enabled')}
        />
      </View>

      {/* Quiet Hours */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🤫 Quiet Hours</Text>
        <SettingRow
          label="Enable Quiet Hours"
          value={settings.quiet_hours_enabled}
          onToggle={() => toggleSetting('quiet_hours_enabled')}
        />
        {settings.quiet_hours_enabled && (
          <View style={styles.quietHoursForm}>
            <Text style={styles.fieldLabel}>Start Time</Text>
            <VoiceTextInput
              style={styles.input}
              value={settings.quiet_hours_start}
              onChangeText={(value) => updateSetting('quiet_hours_start', value)}
              placeholder="22:00"
              placeholderTextColor={COLORS.textMuted}
            />
            <Text style={styles.fieldLabel}>End Time</Text>
            <VoiceTextInput
              style={styles.input}
              value={settings.quiet_hours_end}
              onChangeText={(value) => updateSetting('quiet_hours_end', value)}
              placeholder="08:00"
              placeholderTextColor={COLORS.textMuted}
            />
            <Text style={styles.quietHoursInfo}>
              No notifications will be sent during these hours
            </Text>
          </View>
        )}
      </View>

      {/* Privacy & Data */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🔒 Privacy & Data</Text>
        <SettingRow
          label="Share Location"
          value={settings.share_location}
          onToggle={() => toggleSetting('share_location')}
        />
        <SettingRow
          label="Accept Promotional Offers"
          value={settings.accept_promo}
          onToggle={() => toggleSetting('accept_promo')}
        />
        <Text style={styles.privacyNote}>
          Your location is only shared during active rides. Promotional offers help you earn more.
        </Text>
      </View>

      {/* Display Preferences */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🎨 Display</Text>
        <Text style={styles.fieldLabel}>Language</Text>
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

        <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>Theme</Text>
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
        <Text style={styles.sectionTitle}>👤 Account Management</Text>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={handleChangePassword}
          disabled={parentLoading || loading}
        >
          <Text style={styles.actionButtonText}>🔐 Change Password</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={handlePaymentMethods}
          disabled={parentLoading || loading}
        >
          <Text style={styles.actionButtonText}>💳 Payment Methods</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={handleViewPrivacy}
          disabled={parentLoading || loading}
        >
          <Text style={styles.actionButtonText}>📋 View Privacy Policy</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.actionButton, styles.dangerButton]}
          onPress={handleDeleteAccount}
          disabled={parentLoading || loading}
        >
          <Text style={styles.dangerButtonText}>🗑️ Delete Account</Text>
        </TouchableOpacity>
      </View>

      {/* About Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ℹ️ About</Text>
        <View style={styles.aboutItem}>
          <Text style={styles.aboutLabel}>App Version</Text>
          <Text style={styles.aboutValue}>1.2.5</Text>
        </View>
        <View style={styles.aboutItem}>
          <Text style={styles.aboutLabel}>Last Updated</Text>
          <Text style={styles.aboutValue}>{new Date().toLocaleDateString()}</Text>
        </View>
        <TouchableOpacity 
          style={styles.actionButton}
          onPress={handleHelpFaq}
          disabled={parentLoading || loading}
        >
          <Text style={styles.actionButtonText}>❓ Help & FAQ</Text>
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
