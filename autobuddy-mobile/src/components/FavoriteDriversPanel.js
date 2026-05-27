import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';

export default function FavoriteDriversPanel({ token }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [drivers, setDrivers] = useState([]);

  const fetchFavorites = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiRequest('/passengers/favorite-drivers', { token });
      setDrivers(Array.isArray(response) ? response : response?.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load favorite drivers');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const removeFavorite = async (driverId) => {
    setLoading(true);
    setError('');
    try {
      await apiRequest(`/passengers/favorite-drivers/${driverId}`, { method: 'PUT', token, body: { is_favorite: false } });
      setDrivers((prev) => prev.filter((d) => d.driver_id !== driverId));
    } catch (err) {
      setError(err.message || 'Failed to remove favorite');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Favorite Drivers</Text>
      {loading && <ActivityIndicator color={COLORS.primary} style={styles.loader} />}
      {!!error && <Text style={styles.error}>{error}</Text>}
      {drivers.length === 0 && !loading ? (
        <Text style={styles.empty}>No favorite drivers found.</Text>
      ) : (
        drivers.map((driver) => (
          <View key={driver.driver_id} style={styles.driverCard}>
            <Text style={styles.driverName}>{driver.name || driver.driver_id}</Text>
            <Text style={styles.driverInfo}>⭐ {driver.rating || '-'} | {driver.vehicle_number || 'No vehicle'}</Text>
            <TouchableOpacity style={styles.removeButton} onPress={() => removeFavorite(driver.driver_id)}>
              <Text style={styles.removeButtonText}>Remove</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, padding: 16 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 16, color: COLORS.textMain },
  loader: { marginVertical: 20 },
  error: { color: '#D32F2F', marginBottom: 12 },
  empty: { color: COLORS.textMuted, fontSize: 14, marginTop: 40, textAlign: 'center' },
  driverCard: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    ...SHADOWS.soft,
  },
  driverName: { fontSize: 15, fontWeight: '700', color: COLORS.textMain },
  driverInfo: { fontSize: 13, color: COLORS.textMuted, marginBottom: 8 },
  removeButton: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 6,
    marginTop: 4,
  },
  removeButtonText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
});
