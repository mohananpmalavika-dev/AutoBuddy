import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';

export default function SavedPlacesPanel({ token, onUsePlace = () => {} }) {
  const [loading, setLoading] = useState(false);
  const [places, setPlaces] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', address: '' });
  const [error, setError] = useState('');

  const fetchPlaces = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiRequest('/v1/passengers/saved-places', { token });
      setPlaces(Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : []);
    } catch (err) {
      setError(err.message || 'Failed to load saved places');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }
    const timer = setTimeout(() => {
      fetchPlaces().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [token, fetchPlaces]);

  const addPlace = useCallback(async () => {
    if (!formData.name.trim() || !formData.address.trim()) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }
    try {
      await apiRequest('/v1/passengers/saved-places', {
        method: 'POST',
        token,
        body: {
          name: formData.name.trim(),
          address: formData.address.trim(),
          place_type: 'custom',
          is_favorite: true,
        },
      });
      setFormData({ name: '', address: '' });
      setShowForm(false);
      await fetchPlaces();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to add place');
    }
  }, [token, formData, fetchPlaces]);

  const deletePlace = useCallback(
    async (placeId) => {
      Alert.alert('Delete Place', 'Remove this saved location?', [
        { text: 'Cancel' },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              await apiRequest(`/v1/passengers/saved-places/${placeId}`, { method: 'DELETE', token });
              await fetchPlaces();
            } catch (_err) {
              Alert.alert('Error', 'Failed to delete place');
            }
          },
          style: 'destructive',
        },
      ]);
    },
    [token, fetchPlaces],
  );

  if (loading && places.length === 0) {
    return <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />;
  }

  return (
    <View style={styles.container}>
      {!!error && <Text style={styles.errorText}>{error}</Text>}
      {places.length === 0 && !showForm ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>Pin</Text>
          <Text style={styles.emptyTitle}>No Saved Places</Text>
          <Text style={styles.emptyText}>Save your favorite locations for quick access</Text>
          <TouchableOpacity style={styles.addButton} onPress={() => setShowForm(true)}>
            <Text style={styles.addButtonText}>Add a Place</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <FlatList
            data={places}
            keyExtractor={(item) => String(item.id)}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <View style={styles.placeCard}>
                <View style={styles.placeHeader}>
                  <Text style={styles.placeEmoji}>Pin</Text>
                  <View style={styles.placeInfo}>
                    <Text style={styles.placeName}>{item.name}</Text>
                    <Text style={styles.placeAddress} numberOfLines={1}>
                      {item.address}
                    </Text>
                  </View>
                </View>
                <View style={styles.placeActions}>
                  <TouchableOpacity onPress={() => onUsePlace(item)} style={styles.useBtn}>
                    <Text style={styles.useBtnText}>Use</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deletePlace(item.id)} style={styles.deleteBtn}>
                    <Text style={styles.deleteBtnText}>X</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListFooterComponent={
              !showForm && (
                <TouchableOpacity style={styles.addButton} onPress={() => setShowForm(true)}>
                  <Text style={styles.addButtonText}>+ Add Another Place</Text>
                </TouchableOpacity>
              )
            }
          />

          {showForm && (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>Add New Place</Text>
              <TextInput
                style={styles.input}
                placeholder="Place name (e.g., Home, Work)"
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
                placeholderTextColor="#AAA"
              />
              <TextInput
                style={[styles.input, styles.addressInput]}
                placeholder="Full address"
                value={formData.address}
                onChangeText={(text) => setFormData({ ...formData, address: text })}
                multiline
                placeholderTextColor="#AAA"
              />
              <View style={styles.formActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowForm(false)}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={addPlace}>
                  <Text style={styles.saveBtnText}>Save Place</Text>
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
  emptyIcon: { fontSize: 20, fontWeight: '800', color: COLORS.primary, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textMain, marginBottom: 6 },
  emptyText: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginBottom: 20 },
  placeCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'space-between',
    ...SHADOWS.soft,
  },
  placeHeader: { flexDirection: 'row', flex: 1, alignItems: 'center', gap: 10 },
  placeEmoji: { fontSize: 11, fontWeight: '800', color: COLORS.primary },
  placeInfo: { flex: 1 },
  placeName: { fontSize: 14, fontWeight: '600', color: COLORS.textMain },
  placeAddress: { fontSize: 12, color: COLORS.textMuted, marginTop: 3 },
  placeActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 },
  useBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, backgroundColor: '#E8F5E9' },
  useBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  deleteBtn: { padding: 6 },
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
  addressInput: { minHeight: 80, textAlignVertical: 'top' },
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
