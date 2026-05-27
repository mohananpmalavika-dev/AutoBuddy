import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
} from 'react-native';
import { COLORS } from '../theme';
import { usePreferences } from '../contexts/PreferencesContext';

/**
 * PreferencesPanel - Manage user preferences
 */
export default function PreferencesPanel() {
  const { preferences, updatePreference } = usePreferences();
  const [activeTab, setActiveTab] = useState('notifications');

  const renderNotificationPreferences = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Notification Preferences</Text>

      <View style={styles.preferenceItem}>
        <Text style={styles.preferenceLabel}>Push Notifications</Text>
        <Switch
          value={preferences.notifications?.push ?? true}
          onValueChange={(v) => updatePreference('notifications.push', v)}
        />
      </View>

      <View style={styles.preferenceItem}>
        <Text style={styles.preferenceLabel}>Email Notifications</Text>
        <Switch
          value={preferences.notifications?.email ?? true}
          onValueChange={(v) => updatePreference('notifications.email', v)}
        />
      </View>

      <View style={styles.preferenceItem}>
        <Text style={styles.preferenceLabel}>SMS Notifications</Text>
        <Switch
          value={preferences.notifications?.sms ?? true}
          onValueChange={(v) => updatePreference('notifications.sms', v)}
        />
      </View>

      <View style={styles.preferenceItem}>
        <Text style={styles.preferenceLabel}>Promotional Offers</Text>
        <Switch
          value={preferences.notifications?.promotions ?? false}
          onValueChange={(v) => updatePreference('notifications.promotions', v)}
        />
      </View>
    </View>
  );

  const renderPaymentPreferences = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Payment Preferences</Text>

      <View style={styles.preferenceItem}>
        <Text style={styles.preferenceLabel}>Default Payment Method</Text>
        <Text style={styles.preferenceValue}>
          {preferences.payment?.defaultMethod || 'Wallet'}
        </Text>
      </View>

      <View style={styles.preferenceItem}>
        <Text style={styles.preferenceLabel}>Save Payment Methods</Text>
        <Switch
          value={preferences.payment?.saveCards ?? true}
          onValueChange={(v) => updatePreference('payment.saveCards', v)}
        />
      </View>

      <View style={styles.preferenceItem}>
        <Text style={styles.preferenceLabel}>Biometric Payment</Text>
        <Switch
          value={preferences.payment?.biometricEnabled ?? false}
          onValueChange={(v) => updatePreference('payment.biometricEnabled', v)}
        />
      </View>
    </View>
  );

  const renderPrivacyPreferences = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Privacy Settings</Text>

      <View style={styles.preferenceItem}>
        <Text style={styles.preferenceLabel}>Profile Visibility</Text>
        <Switch
          value={preferences.privacy?.profilePublic ?? false}
          onValueChange={(v) => updatePreference('privacy.profilePublic', v)}
        />
      </View>

      <View style={styles.preferenceItem}>
        <Text style={styles.preferenceLabel}>Share Location with Driver</Text>
        <Switch
          value={preferences.privacy?.shareLocation ?? true}
          onValueChange={(v) => updatePreference('privacy.shareLocation', v)}
        />
      </View>

      <View style={styles.preferenceItem}>
        <Text style={styles.preferenceLabel}>Analytics & Improvement</Text>
        <Switch
          value={preferences.privacy?.analytics ?? true}
          onValueChange={(v) => updatePreference('privacy.analytics', v)}
        />
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {['notifications', 'payment', 'privacy'].map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content}>
        {activeTab === 'notifications' && renderNotificationPreferences()}
        {activeTab === 'payment' && renderPaymentPreferences()}
        {activeTab === 'privacy' && renderPrivacyPreferences()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 3,
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#999',
  },
  activeTabText: {
    color: COLORS.primary,
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 12,
  },
  preferenceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  preferenceLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textMain,
  },
  preferenceValue: {
    fontSize: 13,
    color: COLORS.textMuted,
  },
});
