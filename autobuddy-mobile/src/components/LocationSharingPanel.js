import React, { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';

/**
 * LocationSharingPanel - Share live location with emergency contacts
 */
export default function LocationSharingPanel({ token, activeBooking, currentLocation }) {
  const [emergencyContacts, setEmergencyContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [sharingWith, setSharingWith] = useState(new Set());
  const [autoShareEnabled, setAutoShareEnabled] = useState(false);

  const fetchEmergencyContacts = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await apiRequest('/passengers/emergency-contacts', { token });
      setEmergencyContacts(data?.contacts || []);
    } catch (err) {
      setError(err.message || 'Failed to load emergency contacts');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchEmergencyContacts().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchEmergencyContacts]);

  const toggleContactShare = async (contactId) => {
    try {
      const newSharingSet = new Set(sharingWith);
      const isCurrentlySharng = newSharingSet.has(contactId);
      const contact = emergencyContacts.find((c) => c.id === contactId);

      setError('');
      await apiRequest('/passengers/location-sharing/update', {
        token,
        method: 'POST',
        body: {
          contact_id: contactId,
          booking_id: activeBooking?.id,
          enabled: !isCurrentlySharng,
          location: currentLocation,
        },
      });

      if (!isCurrentlySharng) {
        newSharingSet.add(contactId);
        setMessage(`Sharing location with ${contact?.name || 'contact'}`);
        AccessibilityInfo.announceForAccessibility(`Now sharing location with ${contact?.name || 'contact'}`);
      } else {
        newSharingSet.delete(contactId);
        setMessage(`Stopped sharing with ${contact?.name || 'contact'}`);
        AccessibilityInfo.announceForAccessibility(`Stopped sharing with ${contact?.name || 'contact'}`);
      }
      setSharingWith(newSharingSet);
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to update location sharing');
      AccessibilityInfo.announceForAccessibility(`Error: ${err.message || 'Failed to update location sharing'}`);
    }
  };

  const startAutoShare = async () => {
    try {
      setError('');
      await apiRequest('/passengers/location-sharing/auto-enable', {
        token,
        method: 'POST',
        body: {
          booking_id: activeBooking?.id,
          duration_minutes: 30,
        },
      });
      setAutoShareEnabled(true);
      setMessage('Auto-sharing enabled for next 30 minutes');
      AccessibilityInfo.announceForAccessibility('Auto-sharing enabled for next 30 minutes');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setError(err.message || 'Failed to enable auto-sharing');
      AccessibilityInfo.announceForAccessibility(`Error: ${err.message || 'Failed to enable auto-sharing'}`);
    }
  };

  const sendLocationSMS = async (contact) => {
    if (!contact?.phone_number || !currentLocation) {
      setError('Missing contact phone or current location');
      return;
    }

    try {
      const message = `Hi, I'm currently on a ride. Here's my live location: https://maps.google.com/?q=${currentLocation.latitude},${currentLocation.longitude}`;
      const encodedMessage = encodeURIComponent(message);
      Linking.openURL(`sms:${contact.phone_number}?body=${encodedMessage}`);
    } catch (_err) {
      setError('Failed to open SMS');
    }
  };

  if (loading && emergencyContacts.length === 0) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (emergencyContacts.length === 0) {
    return (
      <ScrollView style={styles.container}>
        {error && <Text style={styles.errorText}>❌ {error}</Text>}
        <View style={[styles.emptyState, SHADOWS.card]}>
          <Text style={styles.emptyIcon}>📍</Text>
          <Text style={styles.emptyText}>No Emergency Contacts</Text>
          <Text style={styles.emptySubtext}>
            Add emergency contacts in your profile to enable location sharing during rides.
          </Text>
          <TouchableOpacity
            style={styles.addContactButton}
            onPress={() => Linking.openURL('app://profile/emergency-contacts')}
          >
            <Text style={styles.addContactButtonText}>Add Emergency Contact</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {error && <Text style={styles.errorText}>❌ {error}</Text>}
      {message && <Text style={styles.messageText}>✓ {message}</Text>}

      {/* Active Location Sharing Info */}
      <View style={[styles.infoCard, SHADOWS.card]}>
        <Text style={styles.infoTitle}>🔴 Live Location Sharing</Text>
        <Text style={styles.infoText}>
          Share your ride location with trusted contacts. They will receive a live map link for your entire ride.
        </Text>
        {autoShareEnabled && (
          <View style={styles.autoshareIndicator}>
            <Text style={styles.autoshareText}>✓ Auto-sharing enabled</Text>
          </View>
        )}
      </View>

      {/* Auto-Share Option */}
      <TouchableOpacity
        style={[styles.autoShareButton, autoShareEnabled && styles.autoShareButtonActive]}
        onPress={startAutoShare}
        disabled={autoShareEnabled}
      >
        <Text style={[styles.autoShareText, autoShareEnabled && styles.autoShareTextActive]}>
          {autoShareEnabled ? '✓ Auto-Sharing Active (30 min)' : '⏱️ Enable Auto-Sharing (30 min)'}
        </Text>
      </TouchableOpacity>

      {/* Emergency Contacts List */}
      <Text style={styles.sectionTitle}>📋 Share With Contacts</Text>
      {emergencyContacts.map((contact) => (
        <View key={contact.id} style={[styles.contactCard, SHADOWS.card]}>
          <View style={styles.contactInfo}>
            <Text style={styles.contactName}>{contact.name}</Text>
            <Text style={styles.contactPhone}>{contact.phone_number}</Text>
            <Text style={styles.contactRelation}>{contact.relationship}</Text>
          </View>

          <View style={styles.contactActions}>
            <TouchableOpacity
              style={[
                styles.shareButton,
                sharingWith.has(contact.id) && styles.shareButtonActive,
              ]}
              onPress={() => toggleContactShare(contact.id)}
            >
              <Text style={[styles.shareButtonText, sharingWith.has(contact.id) && styles.shareButtonTextActive]}>
                {sharingWith.has(contact.id) ? '✓ Sharing' : 'Share Location'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.smsButton}
              onPress={() => sendLocationSMS(contact)}
            >
              <Text style={styles.smsButtonText}>📱 SMS</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}

      {/* Safety Tips */}
      <View style={[styles.tipsCard, SHADOWS.card]}>
        <Text style={styles.sectionTitle}>🛡️ Safety Tips</Text>
        <View style={styles.tipItem}>
          <Text style={styles.tipIcon}>✓</Text>
          <Text style={styles.tipText}>Share with trusted family and friends only</Text>
        </View>
        <View style={styles.tipItem}>
          <Text style={styles.tipIcon}>✓</Text>
          <Text style={styles.tipText}>Location automatically stops sharing after ride ends</Text>
        </View>
        <View style={styles.tipItem}>
          <Text style={styles.tipIcon}>✓</Text>
          <Text style={styles.tipText}>Contacts see driver name and vehicle details</Text>
        </View>
        <View style={styles.tipItem}>
          <Text style={styles.tipIcon}>✓</Text>
          <Text style={styles.tipText}>Your location is encrypted and never stored</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 12 },
  infoCard: {
    backgroundColor: '#FFEBEE',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#F44336',
  },
  infoTitle: { fontSize: 16, fontWeight: 'bold', color: '#C62828', marginBottom: 8 },
  infoText: { fontSize: 13, color: COLORS.text, lineHeight: 18 },
  autoshareIndicator: {
    marginTop: 12,
    padding: 8,
    backgroundColor: '#E8F5E9',
    borderRadius: 6,
    alignItems: 'center',
  },
  autoshareText: { fontSize: 12, fontWeight: '600', color: '#2E7D32' },
  autoShareButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginBottom: 20,
  },
  autoShareButtonActive: { backgroundColor: '#4CAF50' },
  autoShareTextActive: { color: '#FFFFFF', fontWeight: 'bold' },
  sectionTitle: { fontSize: 14, fontWeight: 'bold', color: COLORS.text, marginBottom: 12 },
  contactCard: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  contactInfo: { flex: 1 },
  contactName: { fontSize: 14, fontWeight: 'bold', color: COLORS.text, marginBottom: 4 },
  contactPhone: { fontSize: 12, color: COLORS.textMuted },
  contactRelation: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  contactActions: { flexDirection: 'row', gap: 8 },
  shareButton: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  shareButtonActive: { backgroundColor: COLORS.primary },
  shareButtonText: { fontSize: 11, fontWeight: '600', color: COLORS.primary },
  shareButtonTextActive: { color: '#FFFFFF' },
  smsButton: {
    backgroundColor: '#29B6F6',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  smsButtonText: { fontSize: 11, fontWeight: '600', color: '#FFFFFF' },
  tipsCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  tipItem: { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-start' },
  tipIcon: { fontSize: 14, fontWeight: 'bold', color: '#1976D2', marginRight: 10, marginTop: 2 },
  tipText: { fontSize: 12, color: COLORS.text, lineHeight: 18, flex: 1 },
  emptyState: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    marginTop: 40,
  },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyText: { fontSize: 16, fontWeight: 'bold', color: COLORS.text, marginBottom: 8 },
  emptySubtext: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', lineHeight: 18 },
  addContactButton: {
    marginTop: 16,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  addContactButtonText: { color: '#FFFFFF', fontWeight: 'bold', fontSize: 12 },
  errorText: { color: '#F44336', fontSize: 12, marginBottom: 12, fontWeight: '600', padding: 8, backgroundColor: '#FFEBEE', borderRadius: 4 },
  messageText: { color: '#4CAF50', fontSize: 12, marginBottom: 12, fontWeight: '600', padding: 8, backgroundColor: '#E8F5E9', borderRadius: 4 },
});
