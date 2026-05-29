import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';
import { buildLanguageOptions, normalizeLanguageCode } from '../locales/indianLanguages';
import { COLORS, SHADOWS } from '../theme';

const PAYMENT_OPTIONS = [
  { label: 'Wallet', value: 'wallet' },
  { label: 'Card', value: 'card' },
  { label: 'UPI', value: 'upi' },
  { label: 'Cash', value: 'cash' },
];

const LANGUAGE_OPTIONS = buildLanguageOptions();

const DRIVER_GENDER_OPTIONS = [
  { label: 'Any', value: 'any' },
  { label: 'Male', value: 'male' },
  { label: 'Female', value: 'female' },
];

const TIMEZONE_OPTIONS = [
  { label: 'Device', value: 'local' },
  { label: 'IST', value: 'asia_kolkata' },
];

const DEFAULT_PREFS = {
  push_notifications: true,
  sms_notifications: true,
  email_notifications: true,
  promotional_offers: false,
  ride_status_notifications: true,
  driver_arrival_notification: true,
  surge_pricing_notification: true,
  default_payment_method: 'wallet',
  save_card_details: true,
  biometric_payment: false,
  ac_preferred: false,
  music_preferred: false,
  quiet_ride: false,
  pet_friendly: false,
  luggage_assistance: false,
  driver_gender_preference: 'any',
  prefer_high_rated_drivers: true,
  prefer_favorite_drivers: false,
  avoid_previously_blocked_drivers: true,
  language: 'en',
  timezone: 'local',
  profile_public: false,
  share_location_with_driver: true,
  analytics_enabled: true,
  wheelchair_access: false,
  audio_navigation: false,
  text_large: false,
  high_contrast: false,
  reduce_motion: false,
  screen_reader: false,
  haptic_feedback: true,
};

function PreferenceToggle({ label, field, value, saving, onToggle }) {
  return (
    <View style={styles.preferenceRow}>
      <View style={styles.preferenceLabel}>
        <Text style={styles.preferenceLabelText}>{label}</Text>
      </View>
      <Switch
        value={Boolean(value)}
        disabled={saving}
        trackColor={{ false: '#D1D5DB', true: '#A5D6A7' }}
        thumbColor={value ? COLORS.primary : '#FFFFFF'}
        onValueChange={(nextValue) => onToggle(field, nextValue)}
      />
    </View>
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
        const nextValue = field === 'language' ? normalizeLanguageCode(value) : value;
        const response = await apiRequest('/v1/passengers/preferences', {
          method: 'PATCH',
          token,
          body: { [field]: nextValue },
        });
        const nextPrefs = response?.data || response || null;
        setPrefs(nextPrefs);
        if (field === 'language' && typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('autobuddy_lang', nextValue);
          if (typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('autobuddy-language-change', {
                detail: { language: nextValue },
              }),
            );
          }
        }
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

  const viewPrefs = { ...DEFAULT_PREFS, ...(prefs || {}) };

  if (loading || !prefs) {
    return <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />;
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {!!error && <Text selectable style={styles.errorText}>{error}</Text>}

      <View style={styles.infoBlock}>
        <Text style={styles.infoTitle}>Passenger Settings</Text>
        <Text style={styles.infoText}>
          Control ride defaults, driver matching, alerts, language, privacy, and accessibility.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>
        <PreferenceToggle
          label="Push Notifications"
          field="push_notifications"
          value={viewPrefs.push_notifications}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="SMS Alerts"
          field="sms_notifications"
          value={viewPrefs.sms_notifications}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Email Updates"
          field="email_notifications"
          value={viewPrefs.email_notifications}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Promotional Offers"
          field="promotional_offers"
          value={viewPrefs.promotional_offers}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Ride Status Updates"
          field="ride_status_notifications"
          value={viewPrefs.ride_status_notifications}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Driver Arrival Alerts"
          field="driver_arrival_notification"
          value={viewPrefs.driver_arrival_notification}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Surge Pricing Alerts"
          field="surge_pricing_notification"
          value={viewPrefs.surge_pricing_notification}
          saving={saving}
          onToggle={updatePreference}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Ride Preferences</Text>
        <PreferenceToggle
          label="AC Preferred"
          field="ac_preferred"
          value={viewPrefs.ac_preferred}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Music Preferred"
          field="music_preferred"
          value={viewPrefs.music_preferred}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Quiet Ride"
          field="quiet_ride"
          value={viewPrefs.quiet_ride}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Pet Friendly Ride"
          field="pet_friendly"
          value={viewPrefs.pet_friendly}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Luggage Assistance"
          field="luggage_assistance"
          value={viewPrefs.luggage_assistance}
          saving={saving}
          onToggle={updatePreference}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Driver Preferences</Text>
        <PreferenceSelect
          label="Preferred Driver Gender"
          field="driver_gender_preference"
          value={viewPrefs.driver_gender_preference || 'any'}
          options={DRIVER_GENDER_OPTIONS}
          saving={saving}
          onSelect={updatePreference}
        />
        <PreferenceToggle
          label="Prefer Highly Rated Drivers"
          field="prefer_high_rated_drivers"
          value={viewPrefs.prefer_high_rated_drivers}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Prefer Favorite Drivers"
          field="prefer_favorite_drivers"
          value={viewPrefs.prefer_favorite_drivers}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Avoid Blocked Drivers"
          field="avoid_previously_blocked_drivers"
          value={viewPrefs.avoid_previously_blocked_drivers}
          saving={saving}
          onToggle={updatePreference}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Language and Region</Text>
        <PreferenceSelect
          label="Language"
          field="language"
          value={viewPrefs.language}
          options={LANGUAGE_OPTIONS}
          saving={saving}
          onSelect={updatePreference}
        />
        <PreferenceSelect
          label="Timezone"
          field="timezone"
          value={viewPrefs.timezone || 'local'}
          options={TIMEZONE_OPTIONS}
          saving={saving}
          onSelect={updatePreference}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Payment</Text>
        <PreferenceSelect
          label="Default Payment Method"
          field="default_payment_method"
          value={viewPrefs.default_payment_method}
          options={PAYMENT_OPTIONS}
          saving={saving}
          onSelect={updatePreference}
        />
        <PreferenceToggle
          label="Save Payment Methods"
          field="save_card_details"
          value={viewPrefs.save_card_details}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Biometric Payment"
          field="biometric_payment"
          value={viewPrefs.biometric_payment}
          saving={saving}
          onToggle={updatePreference}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Privacy</Text>
        <PreferenceToggle
          label="Public Profile"
          field="profile_public"
          value={viewPrefs.profile_public}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Share Location With Driver"
          field="share_location_with_driver"
          value={viewPrefs.share_location_with_driver}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Usage Analytics"
          field="analytics_enabled"
          value={viewPrefs.analytics_enabled}
          saving={saving}
          onToggle={updatePreference}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Accessibility</Text>
        <PreferenceToggle
          label="Wheelchair Accessible"
          field="wheelchair_access"
          value={viewPrefs.wheelchair_access}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Audio Navigation"
          field="audio_navigation"
          value={viewPrefs.audio_navigation}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Large Text"
          field="text_large"
          value={viewPrefs.text_large}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="High Contrast Mode"
          field="high_contrast"
          value={viewPrefs.high_contrast}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Reduce Motion"
          field="reduce_motion"
          value={viewPrefs.reduce_motion}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Screen Reader Support"
          field="screen_reader"
          value={viewPrefs.screen_reader}
          saving={saving}
          onToggle={updatePreference}
        />
        <PreferenceToggle
          label="Haptic Feedback"
          field="haptic_feedback"
          value={viewPrefs.haptic_feedback}
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
    marginBottom: 16,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  infoTitle: { fontSize: 14, fontWeight: '800', color: '#1976D2', marginBottom: 4 },
  infoText: { fontSize: 12, color: '#1976D2', lineHeight: 16 },
});
