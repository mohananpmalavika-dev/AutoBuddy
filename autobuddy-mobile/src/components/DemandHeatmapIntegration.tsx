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
import MapView, { Marker, Circle } from 'react-native-maps';
import { COLORS, SHADOWS } from '../theme';
import { demandTrafficAPI } from '../services/apiClient';

type Coordinate = {
  latitude: number;
  longitude: number;
};

type DemandLevel = 'HIGH' | 'MEDIUM' | 'LOW';

type DemandHotspot = {
  id: string;
  latitude: number;
  longitude: number;
  name: string;
  demandLevel: DemandLevel;
  estimatedRequests: number;
  avgFare: number;
  distance: number;
  eta: string;
  peakHours: string;
  radarColor: string;
  radius: number;
};

type DemandHeatmapProps = {
  onNavigateToHotspot?: (hotspot: DemandHotspot) => void;
  currentLocation?: Coordinate | null;
  disabled?: boolean;
};

type DemandHeatmapPayload = {
  hotspots?: unknown[];
  heatmap?: unknown[];
  cells?: unknown[];
  data?: unknown[] | { hotspots?: unknown[]; cells?: unknown[] };
};

/**
 * DemandHeatmapIntegration - Show high-demand areas for drivers to maximize earnings
 * Displays real-time demand hotspots and allows navigation to maximize earnings
 * Integrated into driver dashboard main flow
 */

const toNumber = (value: unknown, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const normalizeDemandLevel = (value: unknown): DemandLevel => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'HIGH' || normalized === 'MEDIUM' || normalized === 'LOW') {
    return normalized;
  }
  return 'MEDIUM';
};

const demandColor = (level: DemandLevel) => {
  switch (level) {
    case 'HIGH':
      return '#FF3B30';
    case 'MEDIUM':
      return '#FFA500';
    case 'LOW':
      return '#34C759';
    default:
      return COLORS.primary;
  }
};

const normalizeHotspot = (item: unknown, index: number): DemandHotspot | null => {
  if (!item || typeof item !== 'object') {
    return null;
  }
  const row = item as Record<string, any>;
  const location = row.location || row.center || row.coordinate || {};
  const latitude = toNumber(row.latitude ?? row.lat ?? location.latitude ?? location.lat, NaN);
  const longitude = toNumber(row.longitude ?? row.lng ?? row.lon ?? location.longitude ?? location.lng ?? location.lon, NaN);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const demandLevel = normalizeDemandLevel(row.demandLevel ?? row.demand_level ?? row.level ?? row.severity);
  return {
    id: String(row.id ?? row._id ?? row.cell_id ?? `hotspot-${index}`),
    latitude,
    longitude,
    name: String(row.name ?? row.area_name ?? row.label ?? row.locality ?? `Hotspot ${index + 1}`),
    demandLevel,
    estimatedRequests: toNumber(row.estimatedRequests ?? row.estimated_requests ?? row.request_count ?? row.demand_score, 0),
    avgFare: toNumber(row.avgFare ?? row.avg_fare ?? row.average_fare ?? row.estimated_fare, 0),
    distance: toNumber(row.distance ?? row.distance_km, 0),
    eta: String(row.eta ?? row.eta_text ?? (row.eta_minutes ? `${row.eta_minutes} mins` : 'Live')),
    peakHours: String(row.peakHours ?? row.peak_hours ?? row.peak_window ?? 'Live demand'),
    radarColor: String(row.radarColor ?? row.color ?? demandColor(demandLevel)),
    radius: toNumber(row.radius ?? row.radius_meters, 1000),
  };
};

const getHotspotRows = (payload: DemandHeatmapPayload | unknown): unknown[] => {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const row = payload as DemandHeatmapPayload;
  if (Array.isArray(row.hotspots)) {return row.hotspots;}
  if (Array.isArray(row.heatmap)) {return row.heatmap;}
  if (Array.isArray(row.cells)) {return row.cells;}
  if (Array.isArray(row.data)) {return row.data;}
  if (row.data && typeof row.data === 'object') {
    if (Array.isArray(row.data.hotspots)) {return row.data.hotspots;}
    if (Array.isArray(row.data.cells)) {return row.data.cells;}
  }
  return [];
};

export default function DemandHeatmapIntegration({
  onNavigateToHotspot,
  currentLocation,
  disabled = false,
}: DemandHeatmapProps) {
  const [loading, setLoading] = useState(false);
  const [heatmapData, setHeatmapData] = useState<DemandHotspot[]>([]);
  const [selectedHotspot, setSelectedHotspot] = useState<DemandHotspot | null>(null);
  const [error, setError] = useState('');

  const loadHeatmapData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await demandTrafficAPI.getDemandHeatmap(
        currentLocation?.latitude,
        currentLocation?.longitude
      );
      const hotspots = getHotspotRows(payload)
        .map(normalizeHotspot)
        .filter((hotspot): hotspot is DemandHotspot => Boolean(hotspot));
      setHeatmapData(hotspots);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load heatmap'));
    } finally {
      setLoading(false);
    }
  }, [currentLocation]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadHeatmapData();
    }, 0);
    const interval = setInterval(loadHeatmapData, 5 * 60 * 1000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [loadHeatmapData]);

  const handleNavigateToHotspot = (hotspot: DemandHotspot) => {
    Alert.alert(
      `Navigate to ${hotspot.name}?`,
      `${hotspot.estimatedRequests} requests expected\nAverage fare: ₹${hotspot.avgFare}\nETA: ${hotspot.eta}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Navigate',
          onPress: () => {
            setSelectedHotspot(hotspot);
            onNavigateToHotspot?.(hotspot);
          },
        },
      ]
    );
  };

  const getDemandColor = (level: DemandLevel) => demandColor(level);

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

      {/* Mini Map View */}
      {currentLocation && (
        <View style={styles.mapContainer}>
          <MapView
            style={styles.map}
            initialRegion={{
              latitude: currentLocation.latitude,
              longitude: currentLocation.longitude,
              latitudeDelta: 0.1,
              longitudeDelta: 0.1,
            }}
            scrollEnabled={false}
            zoomEnabled={false}
          >
            {/* Current Driver Location */}
            <Marker
              coordinate={{
                latitude: currentLocation.latitude,
                longitude: currentLocation.longitude,
              }}
              title="Your Location"
            >
              <View style={styles.driverMarker}>
                <Text style={styles.driverMarkerEmoji}>🚗</Text>
              </View>
            </Marker>

            {/* Hotspots */}
            {heatmapData.map((hotspot) => (
              <React.Fragment key={hotspot.id}>
                {/* Demand Radius */}
                <Circle
                  center={{
                    latitude: hotspot.latitude,
                    longitude: hotspot.longitude,
                  }}
                  radius={hotspot.radius}
                  strokeColor={hotspot.radarColor}
                  strokeWidth={2}
                  fillColor={`${hotspot.radarColor}20`}
                />

                {/* Hotspot Marker */}
                <Marker
                  coordinate={{
                    latitude: hotspot.latitude,
                    longitude: hotspot.longitude,
                  }}
                  title={hotspot.name}
                  description={`${hotspot.estimatedRequests} requests`}
                >
                  <View
                    style={[
                      styles.hotspotMarker,
                      { backgroundColor: hotspot.radarColor },
                    ]}
                  >
                    <Text style={styles.hotspotMarkerEmoji}>
                      {hotspot.demandLevel === 'HIGH'
                        ? '🔥'
                        : hotspot.demandLevel === 'MEDIUM'
                          ? '⚡'
                          : '✨'}
                    </Text>
                  </View>
                </Marker>
              </React.Fragment>
            ))}
          </MapView>
        </View>
      )}

      {/* Hotspots List */}
      <View style={styles.hotspotsList}>
        <Text style={styles.listTitle}>Available Hotspots</Text>
        <FlatList
          data={heatmapData}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.hotspotItem,
                selectedHotspot?.id === item.id && styles.hotspotItemSelected,
              ]}
              onPress={() => handleNavigateToHotspot(item)}
              disabled={disabled}
            >
              <View
                style={[
                  styles.hotspotDot,
                  { backgroundColor: getDemandColor(item.demandLevel) },
                ]}
              />

              <View style={styles.hotspotInfo}>
                <View style={styles.hotspotNameRow}>
                  <Text style={styles.hotspotName}>{item.name}</Text>
                  <Text
                    style={[
                      styles.demandBadge,
                      {
                        backgroundColor: `${getDemandColor(item.demandLevel)}20`,
                        color: getDemandColor(item.demandLevel),
                      },
                    ]}
                  >
                    {item.demandLevel}
                  </Text>
                </View>

                <View style={styles.hotspotDetailsRow}>
                  <Text style={styles.hotspotDetail}>
                    📊 {item.estimatedRequests} requests
                  </Text>
                  <Text style={styles.hotspotDetail}>💰 ₹{item.avgFare} avg</Text>
                  <Text style={styles.hotspotDetail}>⏱️ {item.eta}</Text>
                </View>

                <Text style={styles.peakHours}>Peak: {item.peakHours}</Text>
              </View>

              <Text style={styles.distanceText}>{item.distance} km</Text>
            </TouchableOpacity>
          )}
          scrollEnabled={false}
        />
      </View>

      {/* Tips */}
      <View style={styles.tipsBox}>
        <Text style={styles.tipsTitle}>💡 Earnings Tips</Text>
        <Text style={styles.tipText}>• High-demand areas = higher earnings potential</Text>
        <Text style={styles.tipText}>• Peak hours show when demand is highest</Text>
        <Text style={styles.tipText}>• Navigate early to beat other drivers</Text>
        <Text style={styles.tipText}>• Check traffic alerts before moving</Text>
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
  refreshButton: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  mapContainer: {
    height: 250,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  driverMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#FFF',
  },
  driverMarkerEmoji: {
    fontSize: 20,
  },
  hotspotMarker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  hotspotMarkerEmoji: {
    fontSize: 18,
  },
  hotspotsList: {
    marginBottom: 16,
  },
  listTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  hotspotItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  hotspotItemSelected: {
    backgroundColor: `${COLORS.primary}15`,
    borderColor: COLORS.primary,
  },
  hotspotDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  hotspotInfo: {
    flex: 1,
  },
  hotspotNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  hotspotName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  demandBadge: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    textTransform: 'uppercase',
    marginLeft: 8,
  },
  hotspotDetailsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 4,
  },
  hotspotDetail: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  peakHours: {
    fontSize: 11,
    color: COLORS.textMuted,
    fontStyle: 'italic',
  },
  distanceText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.primary,
    marginLeft: 8,
  },
  tipsBox: {
    backgroundColor: '#FFF9E6',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#FFA500',
  },
  tipsTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FF6B00',
    marginBottom: 8,
  },
  tipText: {
    fontSize: 11,
    color: COLORS.text,
    marginBottom: 4,
    lineHeight: 14,
  },
  errorContainer: {
    backgroundColor: '#FFE5E5',
    borderRadius: 8,
    padding: 12,
  },
  errorText: {
    color: '#C41C00',
    fontSize: 12,
  },
});
