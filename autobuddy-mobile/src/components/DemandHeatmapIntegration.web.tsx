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
import type { ViewStyle } from 'react-native';
import WebGoogleLiveMap from './WebGoogleLiveMap';
import { COLORS, SHADOWS } from '../theme';
import { demandTrafficAPI } from '../services/apiClient';

type LocationCoords = {
  latitude: number;
  longitude: number;
};

type Hotspot = {
  id: string;
  latitude: number;
  longitude: number;
  name: string;
  demandLevel: string;
  estimatedRequests: number;
  avgFare: number;
  radius: number;
  radarColor: string;
  eta: string;
  peakHours: string;
  distance?: string | number;
};

type RawHotspot = Record<string, any>;

type DemandHeatmapIntegrationProps = {
  onNavigateToHotspot?: (hotspot: Hotspot) => void;
  currentLocation?: LocationCoords | null;
  disabled?: boolean;
};

const GOOGLE_MAPS_WEB_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;

const buildDemandMapFallbackUrl = (location?: LocationCoords | Hotspot | null) => {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return 'https://www.google.com/maps?output=embed&q=9.9312,76.2673&z=11';
  }
  return `https://www.google.com/maps?output=embed&q=${latitude},${longitude}&z=14`;
};

const getHotspotMarkerStyle = (
  hotspot: Hotspot,
  center: LocationCoords,
  bounds: { latitudeRange: number; longitudeRange: number },
): ViewStyle => {
  const latitudeOffset = (Number(hotspot.latitude) - center.latitude) / bounds.latitudeRange;
  const longitudeOffset = (Number(hotspot.longitude) - center.longitude) / bounds.longitudeRange;
  const left = Math.max(6, Math.min(94, 50 + longitudeOffset * 40));
  const top = Math.max(6, Math.min(94, 50 - latitudeOffset * 40));
  return {
    left: `${left}%` as ViewStyle['left'],
    top: `${top}%` as ViewStyle['top'],
    backgroundColor: hotspot.radarColor || COLORS.primary,
  };
};

export default function DemandHeatmapIntegration({
  onNavigateToHotspot,
  currentLocation,
  disabled = false,
}: DemandHeatmapIntegrationProps) {
  const [loading, setLoading] = useState(false);
  const [heatmapData, setHeatmapData] = useState<Hotspot[]>([]);
  const [selectedHotspot, setSelectedHotspot] = useState<Hotspot | null>(null);
  const [error, setError] = useState('');
  const mapCenter = selectedHotspot || currentLocation || null;
  const mapFallbackUrl = buildDemandMapFallbackUrl(mapCenter);
  const hotspotBounds = {
    latitudeRange: Math.max(
      0.01,
      ...heatmapData.map((item) => Math.abs(Number(item.latitude) - Number(mapCenter?.latitude ?? currentLocation?.latitude ?? item.latitude))),
    ),
    longitudeRange: Math.max(
      0.01,
      ...heatmapData.map((item) => Math.abs(Number(item.longitude) - Number(mapCenter?.longitude ?? currentLocation?.longitude ?? item.longitude))),
    ),
  };

  const loadHeatmapData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = (await demandTrafficAPI.getDemandHeatmap(
        currentLocation?.latitude,
        currentLocation?.longitude
      )) as any;
      const rows: RawHotspot[] = Array.isArray(payload)
        ? payload
        : payload?.hotspots || payload?.data || payload?.cells || [];
      const hotspots = rows.map((r: RawHotspot, i: number): Hotspot => ({
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
        distance: r.distance,
      })).filter((h: Hotspot) => Number.isFinite(h.latitude) && Number.isFinite(h.longitude));
      setHeatmapData(hotspots);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load heatmap');
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

  const handleNavigateToHotspot = (hotspot: Hotspot) => {
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
          <WebGoogleLiveMap
            apiKey={GOOGLE_MAPS_WEB_KEY}
            title="Demand heatmap"
            fallbackUrl={mapFallbackUrl}
            defaultCenter={mapCenter}
            mapStyle={styles.demandMap}
            showStatusOverlay={false}
          />
          {mapCenter && heatmapData.length > 0 && (
            <View style={styles.hotspotOverlay} pointerEvents="none">
              {heatmapData.slice(0, 12).map((hotspot) => (
                <View
                  key={hotspot.id}
                  style={[
                    styles.mapHotspotPulse,
                    getHotspotMarkerStyle(hotspot, mapCenter, hotspotBounds),
                  ]}
                >
                  <View style={styles.mapHotspotCore} />
                </View>
              ))}
            </View>
          )}
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
  mapContainer: { height: 250, borderRadius: 8, overflow: 'hidden', marginBottom: 16, borderWidth: 1, borderColor: '#EEE', position: 'relative', backgroundColor: '#EAF1ED' },
  demandMap: { width: '100%', height: '100%' },
  hotspotOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  mapHotspotPulse: {
    position: 'absolute',
    width: 28,
    height: 28,
    marginLeft: -14,
    marginTop: -14,
    borderRadius: 14,
    opacity: 0.9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
  },
  mapHotspotCore: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
  },
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
