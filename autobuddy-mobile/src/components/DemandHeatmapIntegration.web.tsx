import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import InteractiveMap from './InteractiveMap';
import { COLORS, SHADOWS } from '../theme';
import { demandTrafficAPI } from '../services/apiClient';

export default function DemandHeatmapIntegration({
  onNavigateToHotspot,
  currentLocation,
  disabled = false,
}) {
  const [loading, setLoading] = useState(false);
  const [heatmapData, setHeatmapData] = useState([]);
  const [selectedHotspot, setSelectedHotspot] = useState(null);
  const [error, setError] = useState('');

  const loadHeatmapData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await demandTrafficAPI.getDemandHeatmap(
        currentLocation?.latitude,
        currentLocation?.longitude
      );
      const rows = Array.isArray(payload)
        ? payload
        : payload?.hotspots || payload?.data || payload?.cells || [];
      const hotspots = rows.map((r, i) => ({
        id: String(r.id ?? r._id ?? `hotspot-${i}`),
        latitude: Number(r.latitude ?? r.lat ?? r.center?.latitude ?? r.center?.lat),
        longitude: Number(r.longitude ?? r.lng ?? r.center?.longitude ?? r.center?.lng),
        name: String(r.name ?? r.area_name ?? r.label ?? `Hotspot ${i + 1}`),
        demandLevel: String(r.demandLevel || r.level || 'MEDIUM').toUpperCase(),
        estimatedRequests: Number(r.estimatedRequests ?? r.request_count ?? 0),
        avgFare: Number(r.avgFare ?? r.avg_fare ?? 0),
        radius: Number(r.radius ?? r.radius_meters ?? 1000),
        radarColor: r.color || (r.demandLevel === 'HIGH' ? '#FF3B30' : r.demandLevel === 'LOW' ? '#34C759' : '#FFA500'),
        eta: r.eta || 'Live',
        peakHours: r.peakHours || r.peak_window || 'Live demand',
      })).filter(h => Number.isFinite(h.latitude) && Number.isFinite(h.longitude));
      setHeatmapData(hotspots);
    } catch (err) {
      setError(err?.message || 'Failed to load heatmap');
    } finally {
      setLoading(false);
    }
  }, [currentLocation]);

  useEffect(() => {
    const timer = setTimeout(() => loadHeatmapData(), 0);
    const interval = setInterval(loadHeatmapData, 5 * 60 * 1000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [loadHeatmapData]);

  const handleNavigateToHotspot = (hotspot) => {
    Alert.alert(
      `Navigate to ${hotspot.name}?`,
      `${hotspot.estimatedRequests} requests expected\nAverage fare: ₹${hotspot.avgFare}\nETA: ${hotspot.eta}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Navigate', onPress: () => { setSelectedHotspot(hotspot); onNavigateToHotspot?.(hotspot); } },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, SHADOWS.card]}>
        <Text style={styles.title}>📍 Demand Hotspots</Text>
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 20 }} />
      </View>
    );
  }

  return (
    <View style={[styles.container, SHADOWS.card]}>
      <View style={styles.header}>
        <Text style={styles.title}>📍 High-Demand Areas</Text>
        <TouchableOpacity onPress={loadHeatmapData} disabled={disabled}>
          <Text style={styles.refreshButton}>🔄 Refresh</Text>
        </TouchableOpacity>
      </View>

      {currentLocation && (
        <View style={styles.mapContainer}>
          <InteractiveMap
            apiKey={process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY}
            center={{ lat: currentLocation.latitude, lng: currentLocation.longitude }}
            style={{ width: '100%', height: '100%' }}
          />
        </View>
      )}

      <View style={styles.hotspotsList}>
        <Text style={styles.listTitle}>Available Hotspots</Text>
        <FlatList
          data={heatmapData}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.hotspotItem, selectedHotspot?.id === item.id && styles.hotspotItemSelected]}
              onPress={() => handleNavigateToHotspot(item)}
              disabled={disabled}
            >
              <View style={[styles.hotspotDot, { backgroundColor: item.radarColor }]} />
              <View style={styles.hotspotInfo}>
                <View style={styles.hotspotNameRow}>
                  <Text style={styles.hotspotName}>{item.name}</Text>
                  <Text style={[styles.demandBadge, { backgroundColor: `${item.radarColor}20`, color: item.radarColor }]}>
                    {item.demandLevel}
                  </Text>
                </View>
                <View style={styles.hotspotDetailsRow}>
                  <Text style={styles.hotspotDetail}>📊 {item.estimatedRequests} requests</Text>
                  <Text style={styles.hotspotDetail}>💰 ₹{item.avgFare} avg</Text>
                  <Text style={styles.hotspotDetail}>⏱️ {item.eta}</Text>
                </View>
                <Text style={styles.peakHours}>Peak: {item.peakHours}</Text>
              </View>
              <Text style={styles.distanceText}>{item.distance ?? ''} km</Text>
            </TouchableOpacity>
          )}
          scrollEnabled={false}
        />
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginVertical: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  refreshButton: { color: COLORS.primary, fontSize: 14, fontWeight: '600' },
  mapContainer: { height: 250, borderRadius: 8, overflow: 'hidden', marginBottom: 16, borderWidth: 1, borderColor: '#EEE' },
  hotspotsList: { marginBottom: 16 },
  listTitle: { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 8, textTransform: 'uppercase' },
  hotspotItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 10, backgroundColor: '#F9F9F9', borderRadius: 8, marginBottom: 8, borderWidth: 1, borderColor: '#EEE' },
  hotspotItemSelected: { backgroundColor: `${COLORS.primary}15`, borderColor: COLORS.primary },
  hotspotDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  hotspotInfo: { flex: 1 },
  hotspotNameRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  hotspotName: { fontSize: 13, fontWeight: '600', color: COLORS.text, flex: 1 },
  demandBadge: { fontSize: 10, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, textTransform: 'uppercase', marginLeft: 8 },
  hotspotDetailsRow: { flexDirection: 'row', gap: 12, marginBottom: 4 },
  hotspotDetail: { fontSize: 11, color: COLORS.textMuted },
  peakHours: { fontSize: 11, color: COLORS.textMuted, fontStyle: 'italic' },
  distanceText: { fontSize: 12, fontWeight: '600', color: COLORS.primary, marginLeft: 8 },
  errorContainer: { backgroundColor: '#FFE5E5', borderRadius: 8, padding: 12 },
  errorText: { color: '#C41C00', fontSize: 12 },
});