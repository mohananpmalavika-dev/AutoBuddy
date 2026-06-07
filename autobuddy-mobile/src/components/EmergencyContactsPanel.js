import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';

export default function EmergencyContactsPanel({ token }) {
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ contact_name: '', phone_number: '', relation: '' });
  const [error, setError] = useState('');

  const fetchContacts = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiRequest('/v1/passengers/emergency-contacts', { token });
      setContacts(
        Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response?.contacts)
            ? response.contacts
            : Array.isArray(response)
              ? response
              : [],
      );
    } catch (err) {
      setError(err.message || 'Failed to load emergency contacts');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }
    const timer = setTimeout(() => {
      fetchContacts().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [token, fetchContacts]);

  const addContact = useCallback(async () => {
    if (!formData.contact_name.trim() || !formData.phone_number.trim() || !formData.relation.trim()) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }
    try {
      await apiRequest('/v1/passengers/emergency-contacts', {
        method: 'POST',
        token,
        body: {
          contact_name: formData.contact_name.trim(),
          phone_number: formData.phone_number.trim(),
          relation: formData.relation.trim(),
          notify_on_rides: true,
        },
      });
      setFormData({ contact_name: '', phone_number: '', relation: '' });
      setShowForm(false);
      await fetchContacts();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to add contact');
    }
  }, [token, formData, fetchContacts]);

  const deleteContact = useCallback(
    async (contactId) => {
      Alert.alert('Delete Contact', 'Remove this emergency contact?', [
        { text: 'Cancel' },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              await apiRequest(`/v1/passengers/emergency-contacts/${contactId}`, { method: 'DELETE', token });
              await fetchContacts();
            } catch (_err) {
              Alert.alert('Error', 'Failed to delete contact');
            }
          },
          style: 'destructive',
        },
      ]);
    },
    [token, fetchContacts],
  );

  const callContact = useCallback(async (phoneNumber) => {
    const normalized = String(phoneNumber || '').replace(/[^\d+]/g, '');
    if (!normalized) {
      return;
    }
    await Linking.openURL(`tel:${normalized}`).catch(() => null);
  }, []);

  if (loading && contacts.length === 0) {
    return <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />;
  }

  return (
    <View style={styles.container}>
      {!!error && <Text style={styles.errorText}>{error}</Text>}
      {contacts.length === 0 && !showForm ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>SOS</Text>
          <Text style={styles.emptyTitle}>No Emergency Contacts</Text>
          <Text style={styles.emptyText}>Add trusted contacts for your safety</Text>
          <TouchableOpacity style={styles.addButton} onPress={() => setShowForm(true)}>
            <Text style={styles.addButtonText}>Add Contact</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <FlatList
            data={contacts}
            keyExtractor={(item) => String(item.id)}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.contactCard}>
                <View style={styles.contactInfo}>
                  <View style={styles.contactHeader}>
                    <Text style={styles.contactName}>{item.contact_name}</Text>
                    <Text style={styles.contactRelation}>{item.relation || 'Contact'}</Text>
                  </View>
                  <Text style={styles.contactPhone}>{item.phone_number}</Text>
                </View>
                <View style={styles.contactActions}>
                  <TouchableOpacity style={styles.callBtn} onPress={() => callContact(item.phone_number)}>
                    <Text style={styles.callBtnText}>Call</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteContact(item.id)} style={styles.deleteBtn}>
                    <Text style={styles.deleteBtnText}>X</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListFooterComponent={
              !showForm && (
                <TouchableOpacity style={styles.addButton} onPress={() => setShowForm(true)}>
                  <Text style={styles.addButtonText}>+ Add Another Contact</Text>
                </TouchableOpacity>
              )
            }
          />

          {showForm && (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Add Emergency Contact</Text>
              <TextInput
                style={styles.input}
                placeholder="Contact name"
                value={formData.contact_name}
                onChangeText={(text) => setFormData({ ...formData, contact_name: text })}
                placeholderTextColor="#AAA"
              />
              <TextInput
                style={styles.input}
                placeholder="Phone number"
                value={formData.phone_number}
                onChangeText={(text) => setFormData({ ...formData, phone_number: text })}
                keyboardType="phone-pad"
                placeholderTextColor="#AAA"
              />
              <View style={styles.relationshipOptions}>
                {['Family', 'Friend', 'Doctor', 'Other'].map((relation) => (
                  <TouchableOpacity
                    key={relation}
                    style={[styles.relChip, formData.relation === relation && styles.relChipActive]}
                    onPress={() => setFormData({ ...formData, relation })}>
                    <Text style={[styles.relChipText, formData.relation === relation && styles.relChipTextActive]}>
                      {relation}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.formActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowForm(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={addContact}>
                  <Text style={styles.saveBtnText}>Add Contact</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 12 },
  loader: { flex: 1, justifyContent: 'center' },
  errorText: { color: '#D32F2F', fontSize: 12, marginBottom: 10 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 },
  emptyIcon: { fontSize: 20, fontWeight: '800', color: '#D32F2F', marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textMain, marginBottom: 6 },
  emptyText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginBottom: 20 },
  contactCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    ...SHADOWS.soft,
  },
  contactInfo: { flex: 1 },
  contactHeader: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  contactName: { fontSize: 14, fontWeight: '600', color: COLORS.textMain },
  contactRelation: { fontSize: 12, color: COLORS.textMuted, paddingVertical: 2, paddingHorizontal: 6, backgroundColor: '#F0F0F0', borderRadius: 4 },
  contactPhone: { fontSize: 13, color: COLORS.textMuted, fontWeight: '500' },
  contactActions: { flexDirection: 'row', gap: 8, marginLeft: 8 },
  callBtn: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: '#E8F5E9', borderRadius: 6 },
  callBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  deleteBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  deleteBtnText: { fontSize: 14, color: '#F44336', fontWeight: '800' },
  formCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    ...SHADOWS.soft,
  },
  formTitle: { fontSize: 14, fontWeight: '700', color: COLORS.textMain, marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
    fontSize: 13,
    color: COLORS.textMain,
  },
  relationshipOptions: { flexDirection: 'row', gap: 6, marginBottom: 12, flexWrap: 'wrap' },
  relChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  relChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  relChipText: { fontSize: 12, color: COLORS.textMain, fontWeight: '600' },
  relChipTextActive: { color: '#FFFFFF' },
  formActions: { flexDirection: 'row', gap: 8 },
  cancelBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  cancelBtnText: { fontSize: 13, fontWeight: '600', color: COLORS.textMain },
  saveBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: COLORS.primary, alignItems: 'center' },
  saveBtnText: { fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  addButton: {
    paddingVertical: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 12,
    ...SHADOWS.soft,
  },
  addButtonText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
});
