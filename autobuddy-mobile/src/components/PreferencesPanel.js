import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';

const PAYMENT_OPTIONS = [
  { label: 'Wallet', value: 'wallet' },
  { label: 'Card', value: 'card' },
  { label: 'UPI', value: 'upi' },
  { label: 'Cash', value: 'cash' },
];

const LANGUAGE_OPTIONS = [
  { label: 'English', value: 'en' },
  { label: 'Malayalam', value: 'ml' },
];

const DRIVER_GENDER_OPTIONS = [
  { label: 'Any', value: 'any' },
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
];

function PreferenceToggle({ label, field, value, saving, onToggle }) {
  return (
    <TouchableOpacity
      style={styles.preferenceRow}
      onPress={() => onToggle(field, !value)}
      disabled={saving}>
      <View style={styles.preferenceLabel}>
        <Text style={styles.preferenceLabelText}>{label}</Text>
      </View>
      <View style={[styles.toggle, value && styles.toggleActive]}>
        <View style={[styles.toggleDot, value && styles.toggleDotActive]} />
      </View>
    </TouchableOpacity>
  );
}

function PreferenceSelect({ label, field, value, options, saving, onSelect }) {
  return (
    <View style={styles.selectBlock}>
      <Text style={styles.preferenceLabelText}>{label}</Text>
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

export default function PreferencesPanel({ token, onPreferencesChange = () => {} }) {
  const [loading, setLoading] = useState(false);
  const [prefs, setPrefs] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchPreferences = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiRequest('/v1/passengers/preferences', { token });
      const nextPrefs = response?.data || response || null;
      setPrefs(nextPrefs);
      if (nextPrefs) {
        onPreferencesChange(nextPrefs);
      }
    } catch (err) {
      setError(err.message || 'Failed to load preferences');
    } finally {
      setLoading(false);
    }
  }, [onPreferencesChange, token]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }
    const timer = setTimeout(() => {
      fetchPreferences().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [token, fetchPreferences]);

  const updatePreference = useCallback(
    async (field, value) => {
      try {
        setSaving(true);
        setError('');
        const response = await apiRequest('/v1/passengers/preferences', {
          method: 'PATCH',
          token,
          body: { [field]: value },
        });
        const nextPrefs = response?.data || response || null;
        setPrefs(nextPrefs);
        if (nextPrefs) {
          onPreferencesChange(nextPrefs);
        }
      } catch (err) {
        setError(err.message || 'Failed to update preference');
      } finally {
        setSaving(false);
      }
    },
    [onPreferencesChange, token],
  );

  if (loading || !prefs) {
    return <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />;
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {!!error && <Text style={styles.errorText}>{error}</Text>}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <PreferenceToggle
          label="Push Notifications"
          field="push_notifications"
          value={prefs.push_notifications}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="SMS Alerts"
          field="sms_notifications"
          value={prefs.sms_notifications}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Email Updates"
          field="email_notifications"
          value={prefs.email_notifications}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Promotional Offers"
          field="promotional_offers"
          value={prefs.promotional_offers}
          saving={saving}
          onToggle={updatePreference}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment</Text>
        <PreferenceSelect
          label="Default Payment Method"
          field="default_payment_method"
          value={prefs.default_payment_method}
          options={PAYMENT_OPTIONS}
          saving={saving}
          onSelect={updatePreference}
        />
        <PreferenceToggle
          label="Save Payment Methods"
          field="save_card_details"
          value={prefs.save_card_details}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Biometric Payment"
          field="biometric_payment"
          value={prefs.biometric_payment}
          saving={saving}
          onToggle={updatePreference}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ride Preferences</Text>
        <PreferenceToggle
          label="AC Preferred"
          field="ac_preferred"
          value={prefs.ac_preferred}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Music Preferred"
          field="music_preferred"
          value={prefs.music_preferred}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Quiet Ride"
          field="quiet_ride"
          value={prefs.quiet_ride}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceSelect
          label="Preferred Driver Gender"
          field="driver_gender_preference"
          value={prefs.driver_gender_preference || 'any'}
          options={DRIVER_GENDER_OPTIONS}
          saving={saving}
          onSelect={updatePreference}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Privacy and Locale</Text>
        <PreferenceSelect
          label="Language"
          field="language"
          value={prefs.language}
          options={LANGUAGE_OPTIONS}
          saving={saving}
          onSelect={updatePreference}
        />
        <PreferenceToggle
          label="Public Profile"
          field="profile_public"
          value={prefs.profile_public}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Share Location With Driver"
          field="share_location_with_driver"
          value={prefs.share_location_with_driver}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Usage Analytics"
          field="analytics_enabled"
          value={prefs.analytics_enabled}
          saving={saving}
          onToggle={updatePreference}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Accessibility</Text>
        <PreferenceToggle
          label="Wheelchair Accessible"
          field="wheelchair_access"
          value={prefs.wheelchair_access}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Audio Navigation"
          field="audio_navigation"
          value={prefs.audio_navigation}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Large Text"
          field="text_large"
          value={prefs.text_large}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="High Contrast Mode"
          field="high_contrast"
          value={prefs.high_contrast}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Reduce Motion"
          field="reduce_motion"
          value={prefs.reduce_motion}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Screen Reader Support"
          field="screen_reader"
          value={prefs.screen_reader}
          saving={saving}
          onToggle={updatePreference}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notification Details</Text>
        <PreferenceToggle
          label="Ride Status Updates"
          field="ride_status_notifications"
          value={prefs.ride_status_notifications}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Driver Arrival Alerts"
          field="driver_arrival_notification"
          value={prefs.driver_arrival_notification}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Surge Pricing Alerts"
          field="surge_pricing_notification"
          value={prefs.surge_pricing_notification}
          saving={saving}
          onToggle={updatePreference}
        />
      </View>

      <View style={styles.infoBlock}>
        <Text style={styles.infoText}>
          These preferences are saved and can be reused by booking, payment, and notification flows.
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
  preferenceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  preferenceLabel: { flex: 1 },
  preferenceLabelText: { fontSize: 13, color: COLORS.textMain, fontWeight: '500' },
  selectBlock: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EFEFEF' },
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
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
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
