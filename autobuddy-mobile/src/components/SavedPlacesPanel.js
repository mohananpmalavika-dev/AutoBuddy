import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiRequest } from '../lib/api';
import { getPlaceLocation, searchPlaces } from '../lib/places';
import { COLORS, SHADOWS } from '../theme';

export default function SavedPlacesPanel({ token, onUsePlace = () => {} }) {
  const [loading, setLoading] = useState(false);
  const [places, setPlaces] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingPlaceId, setEditingPlaceId] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    place_type: 'custom',
    latitude: '',
    longitude: '',
    is_primary: false,
  });
  const [error, setError] = useState('');
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeSuggestions, setPlaceSuggestions] = useState([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);

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

  const resetForm = useCallback(() => {
    setFormData({
      name: '',
      address: '',
      place_type: 'custom',
      latitude: '',
      longitude: '',
      is_primary: false,
    });
    setPlaceQuery('');
    setPlaceSuggestions([]);
    setEditingPlaceId(null);
    setShowForm(false);
  }, []);

  const savePlace = useCallback(async () => {
    if (!formData.name.trim() || !formData.address.trim()) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }
    const latitudeValue = String(formData.latitude || '').trim();
    const longitudeValue = String(formData.longitude || '').trim();
    const latitude = latitudeValue ? Number(latitudeValue) : null;
    const longitude = longitudeValue ? Number(longitudeValue) : null;
    if (
      (latitudeValue && !Number.isFinite(latitude)) ||
      (longitudeValue && !Number.isFinite(longitude))
    ) {
      Alert.alert('Error', 'Latitude/Longitude must be valid numbers');
      return;
    }
    try {
      const endpoint = editingPlaceId
        ? `/v1/passengers/saved-places/${editingPlaceId}`
        : '/v1/passengers/saved-places';
      const method = editingPlaceId ? 'PUT' : 'POST';
      await apiRequest(endpoint, {
        method,
        token,
        body: {
          name: formData.name.trim(),
          address: formData.address.trim(),
          place_type: formData.place_type,
          latitude,
          longitude,
          is_favorite: true,
          is_primary: Boolean(formData.is_primary),
        },
      });
      resetForm();
      await fetchPlaces();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save place');
    }
  }, [editingPlaceId, fetchPlaces, formData, resetForm, token]);

  const searchPlaceSuggestions = useCallback(async () => {
    if (placeQuery.trim().length < 3) {
      setError('Enter at least 3 characters to search places');
      return;
    }
    try {
      setSearchingPlaces(true);
      setError('');
      const suggestions = await searchPlaces(placeQuery, { countryCode: 'in' });
      setPlaceSuggestions(suggestions.slice(0, 5));
    } catch (err) {
      setError(err.message || 'Failed to search places');
    } finally {
      setSearchingPlaces(false);
    }
  }, [placeQuery]);

  const selectPlaceSuggestion = useCallback(async (suggestion) => {
    try {
      setSearchingPlaces(true);
      setError('');
      const location = await getPlaceLocation(suggestion.placeId);
      setFormData((prev) => ({
        ...prev,
        address: location.address || suggestion.description || prev.address,
        latitude: location.latitude === undefined ? prev.latitude : String(location.latitude),
        longitude: location.longitude === undefined ? prev.longitude : String(location.longitude),
      }));
      setPlaceQuery(suggestion.description || location.address || '');
      setPlaceSuggestions([]);
    } catch (err) {
      setError(err.message || 'Failed to select place');
    } finally {
      setSearchingPlaces(false);
    }
  }, []);

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
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => {
              setEditingPlaceId(null);
              setShowForm(true);
            }}>
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
                    <Text style={styles.placeMeta}>
                      {String(item.place_type || 'custom').toUpperCase()}
                      {item.is_primary ? ' * PRIMARY' : ''}
                    </Text>
                    <Text style={styles.placeAddress} numberOfLines={1}>
                      {item.address}
                    </Text>
                  </View>
                </View>
                <View style={styles.placeActions}>
                  <TouchableOpacity onPress={() => onUsePlace(item)} style={styles.useBtn}>
                    <Text style={styles.useBtnText}>Use</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.editBtn}
                    onPress={() => {
                      setEditingPlaceId(item.id);
                      setFormData({
                        name: String(item.name || ''),
                        address: String(item.address || ''),
                        place_type: String(item.place_type || 'custom'),
                        latitude:
                          item.latitude === null || item.latitude === undefined
                            ? ''
                            : String(item.latitude),
                        longitude:
                          item.longitude === null || item.longitude === undefined
                            ? ''
                            : String(item.longitude),
                        is_primary: Boolean(item.is_primary),
                      });
                      setPlaceQuery(String(item.address || ''));
                      setPlaceSuggestions([]);
                      setShowForm(true);
                    }}>
                    <Text style={styles.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deletePlace(item.id)} style={styles.deleteBtn}>
                    <Text style={styles.deleteBtnText}>X</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            ListFooterComponent={
              !showForm && (
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => {
                    setEditingPlaceId(null);
                    setShowForm(true);
                  }}>
                  <Text style={styles.addButtonText}>+ Add Another Place</Text>
                </TouchableOpacity>
              )
            }
          />

          {showForm && (
            <View style={styles.formCard}>
              <Text style={styles.formTitle}>{editingPlaceId ? 'Edit Place' : 'Add New Place'}</Text>
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
                onChangeText={(text) => {
                  setFormData({ ...formData, address: text });
                  setPlaceQuery(text);
                }}
                multiline
                placeholderTextColor="#AAA"
              />
              <View style={styles.searchRow}>
                <TextInput
                  style={[styles.input, styles.searchInput]}
                  placeholder="Search address or landmark"
                  value={placeQuery}
                  onChangeText={setPlaceQuery}
                  placeholderTextColor="#AAA"
                />
                <TouchableOpacity style={styles.searchButton} onPress={searchPlaceSuggestions} disabled={searchingPlaces}>
                  <Text style={styles.searchButtonText}>{searchingPlaces ? '...' : 'Search'}</Text>
                </TouchableOpacity>
              </View>
              {placeSuggestions.map((suggestion) => (
                <TouchableOpacity
                  key={suggestion.placeId || suggestion.description}
                  style={styles.suggestionRow}
                  onPress={() => selectPlaceSuggestion(suggestion)}>
                  <Text style={styles.suggestionText}>{suggestion.description}</Text>
                </TouchableOpacity>
              ))}
              <View style={styles.coordinateRow}>
                <TextInput
                  style={[styles.input, styles.coordinateInput]}
                  placeholder="Latitude (optional)"
                  value={formData.latitude}
                  onChangeText={(text) => setFormData({ ...formData, latitude: text })}
                  placeholderTextColor="#AAA"
                  keyboardType="decimal-pad"
                />
                <TextInput
                  style={[styles.input, styles.coordinateInput]}
                  placeholder="Longitude (optional)"
                  value={formData.longitude}
                  onChangeText={(text) => setFormData({ ...formData, longitude: text })}
                  placeholderTextColor="#AAA"
                  keyboardType="decimal-pad"
                />
              </View>
              <View style={styles.typeRow}>
                {['home', 'work', 'custom'].map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.typeChip, formData.place_type === type && styles.typeChipActive]}
                    onPress={() => setFormData({ ...formData, place_type: type })}>
                    <Text style={[styles.typeChipText, formData.place_type === type && styles.typeChipTextActive]}>
                      {type === 'home' ? 'Home' : type === 'work' ? 'Work' : 'Custom'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={styles.primaryToggle}
                onPress={() => setFormData({ ...formData, is_primary: !formData.is_primary })}>
                <Text style={styles.primaryToggleText}>
                  {formData.is_primary ? 'Primary place selected' : 'Set as primary place'}
                </Text>
              </TouchableOpacity>
              <View style={styles.formActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={resetForm}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.saveBtn} onPress={savePlace}>
                  <Text style={styles.saveBtnText}>{editingPlaceId ? 'Update Place' : 'Save Place'}</Text>
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
  placeMeta: { fontSize: 10, color: COLORS.primary, marginTop: 2, fontWeight: '700' },
  placeAddress: { fontSize: 12, color: COLORS.textMuted, marginTop: 3 },
  placeActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 8 },
  useBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, backgroundColor: '#E8F5E9' },
  useBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  editBtn: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, backgroundColor: '#E3F2FD' },
  editBtnText: { fontSize: 12, fontWeight: '700', color: '#1976D2' },
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
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: { flex: 1 },
  searchButton: {
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    marginBottom: 10,
  },
  searchButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  suggestionRow: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    backgroundColor: '#F9FFF9',
  },
  suggestionText: { color: COLORS.textMain, fontSize: 12, fontWeight: '600' },
  coordinateRow: { flexDirection: 'row', gap: 8 },
  coordinateInput: { flex: 1 },
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  typeChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
  },
  typeChipActive: { borderColor: COLORS.primary, backgroundColor: '#E8F5E9' },
  typeChipText: { fontSize: 12, color: COLORS.textMain, fontWeight: '600' },
  typeChipTextActive: { color: COLORS.primary },
  primaryToggle: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
    backgroundColor: '#FAFAFA',
  },
  primaryToggleText: { fontSize: 12, color: COLORS.textMain, fontWeight: '600' },
  formActions: { flexDirection: 'row', gap: 8 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
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
