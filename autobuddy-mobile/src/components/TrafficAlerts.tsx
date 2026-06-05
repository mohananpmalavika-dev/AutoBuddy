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
import { COLORS, SHADOWS } from '../theme';
import { demandTrafficAPI } from '../services/apiClient';

type Coordinate = {
  latitude: number;
  longitude: number;
};

type AlertSeverity = 'HIGH' | 'MEDIUM' | 'LOW';
type TrafficCondition = 'LIGHT' | 'MODERATE' | 'HEAVY';
type AlertImpact = 'AVOID' | 'CONSIDER' | 'INFO';

type TrafficAlert = {
  id: string;
  type: string;
  severity: AlertSeverity;
  title: string;
  description: string;
  location: string;
  delayTime: string;
  impact: AlertImpact;
  reportedTime: Date;
};

type TrafficRoute = {
  id: string;
  name: string;
  distance: number;
  duration: string;
  trafficCondition: TrafficCondition;
  avgSpeed: number;
  toll: number;
  avoidedAlerts: string[];
  isRecommended: boolean;
};

type TrafficAlertsProps = {
  currentLocation?: Coordinate | null;
  destinationLocation?: Coordinate | null;
  onRouteChange?: (route: TrafficRoute) => void;
  disabled?: boolean;
};

type TrafficPayload = {
  alerts?: unknown[];
  routes?: unknown[];
  data?: unknown[] | { alerts?: unknown[]; routes?: unknown[] };
};

/**
 * TrafficAlerts - Real-time traffic and route optimization for drivers
 * Shows traffic conditions, accidents, alerts, and suggests optimal routes
 * Helps drivers optimize earnings and avoid delays
 */

const toNumber = (value: unknown, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

const normalizeSeverity = (value: unknown): AlertSeverity => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'HIGH' || normalized === 'MEDIUM' || normalized === 'LOW') {
    return normalized;
  }
  return 'LOW';
};

const normalizeTrafficCondition = (value: unknown): TrafficCondition => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'LIGHT' || normalized === 'MODERATE' || normalized === 'HEAVY') {
    return normalized;
  }
  return 'MODERATE';
};

const normalizeImpact = (value: unknown): AlertImpact => {
  const normalized = String(value || '').trim().toUpperCase();
  if (normalized === 'AVOID' || normalized === 'CONSIDER' || normalized === 'INFO') {
    return normalized;
  }
  return 'INFO';
};

const getPayloadRows = (payload: TrafficPayload | unknown, key: 'alerts' | 'routes'): unknown[] => {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const row = payload as TrafficPayload;
  if (Array.isArray(row[key])) {return row[key] || [];}
  if (Array.isArray(row.data)) {return key === 'alerts' ? row.data : [];}
  if (row.data && typeof row.data === 'object' && Array.isArray(row.data[key])) {
    return row.data[key] || [];
  }
  return [];
};

const normalizeAlert = (item: unknown, index: number): TrafficAlert | null => {
  if (!item || typeof item !== 'object') {return null;}
  const row = item as Record<string, any>;
  return {
    id: String(row.id ?? row._id ?? row.alert_id ?? `alert-${index}`),
    type: String(row.type ?? row.alert_type ?? 'TRAFFIC'),
    severity: normalizeSeverity(row.severity),
    title: String(row.title ?? row.type ?? 'Traffic alert'),
    description: String(row.description ?? row.message ?? 'Traffic conditions changed.'),
    location: String(row.location ?? row.road ?? row.area ?? 'Route'),
    delayTime: String(row.delayTime ?? row.delay_time ?? row.delay ?? 'None'),
    impact: normalizeImpact(row.impact),
    reportedTime: row.reportedTime || row.reported_at ? new Date(row.reportedTime ?? row.reported_at) : new Date(),
  };
};

const normalizeRoute = (item: unknown, index: number): TrafficRoute | null => {
  if (!item || typeof item !== 'object') {return null;}
  const row = item as Record<string, any>;
  return {
    id: String(row.id ?? row._id ?? row.route_id ?? `route-${index}`),
    name: String(row.name ?? row.label ?? (index === 0 ? 'Recommended Route' : `Route ${index + 1}`)),
    distance: toNumber(row.distance ?? row.distance_km, 0),
    duration: String(row.duration ?? row.duration_text ?? row.eta ?? 'Live'),
    trafficCondition: normalizeTrafficCondition(row.trafficCondition ?? row.traffic_condition ?? row.condition),
    avgSpeed: toNumber(row.avgSpeed ?? row.avg_speed ?? row.average_speed_kmh, 0),
    toll: toNumber(row.toll ?? row.toll_amount, 0),
    avoidedAlerts: Array.isArray(row.avoidedAlerts)
      ? row.avoidedAlerts.map(String)
      : Array.isArray(row.avoided_alerts)
        ? row.avoided_alerts.map(String)
        : [],
    isRecommended: Boolean(row.isRecommended ?? row.is_recommended ?? index === 0),
  };
};

export default function TrafficAlerts({
  currentLocation,
  destinationLocation,
  onRouteChange,
  disabled = false,
}: TrafficAlertsProps) {
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<TrafficAlert[]>([]);
  const [routes, setRoutes] = useState<TrafficRoute[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [error, setError] = useState('');

  const loadTrafficData = useCallback(async () => {
    if (!currentLocation || !destinationLocation) {
      setAlerts([]);
      setRoutes([]);
      setSelectedRoute(null);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const payload = await demandTrafficAPI.getTrafficAlerts(currentLocation, destinationLocation);
      const nextAlerts = getPayloadRows(payload, 'alerts')
        .map(normalizeAlert)
        .filter((alert): alert is TrafficAlert => Boolean(alert));
      const nextRoutes = getPayloadRows(payload, 'routes')
        .map(normalizeRoute)
        .filter((route): route is TrafficRoute => Boolean(route));
      setAlerts(nextAlerts);
      setRoutes(nextRoutes);
      setSelectedRoute(nextRoutes.find((route) => route.isRecommended)?.id ?? nextRoutes[0]?.id ?? null);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load traffic data'));
    } finally {
      setLoading(false);
    }
  }, [currentLocation, destinationLocation]);

  useEffect(() => {
    if (!currentLocation || !destinationLocation) {
      return undefined;
    }
    const timer = setTimeout(() => {
      loadTrafficData();
    }, 0);
    const interval = setInterval(loadTrafficData, 2 * 60 * 1000);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [currentLocation, destinationLocation, loadTrafficData]);

  const handleSelectRoute = (route: TrafficRoute) => {
    setSelectedRoute(route.id);
    onRouteChange?.(route);
    Alert.alert(
      `Route Selected: ${route.name}`,
      `Duration: ${route.duration} | Distance: ${route.distance} km\nAverage Speed: ${route.avgSpeed} km/h`
    );
  };

  const getSeverityColor = (severity: AlertSeverity) => {
    switch (severity) {
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

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'ACCIDENT':
        return '🚨';
      case 'CONGESTION':
        return '🚦';
      case 'CONSTRUCTION':
        return '🚧';
      case 'RADAR':
        return '📷';
      default:
        return '⚠️';
    }
  };

  const getTrafficConditionColor = (condition: TrafficCondition) => {
    switch (condition) {
      case 'LIGHT':
        return '#34C759';
      case 'MODERATE':
        return '#FFA500';
      case 'HEAVY':
        return '#FF3B30';
      default:
        return COLORS.primary;
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, SHADOWS.card]}>
        <Text style={styles.title}>🚦 Traffic & Routes</Text>
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginVertical: 20 }} />
      </View>
    );
  }

  return (
    <View style={[styles.container, SHADOWS.card]}>
      <View style={styles.header}>
        <Text style={styles.title}>🚦 Traffic Alerts & Routes</Text>
        <TouchableOpacity onPress={loadTrafficData} disabled={disabled}>
          <Text style={styles.refreshButton}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* Traffic Alerts */}
      {alerts.length > 0 && (
        <View style={styles.alertsSection}>
          <Text style={styles.sectionTitle}>Active Alerts</Text>
          <FlatList
            data={alerts}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.alertItem}>
                <Text style={styles.alertIcon}>{getAlertIcon(item.type)}</Text>

                <View style={styles.alertContent}>
                  <View style={styles.alertHeaderRow}>
                    <Text style={styles.alertTitle}>{item.title}</Text>
                    <View
                      style={[
                        styles.severityBadge,
                        {
                          backgroundColor: `${getSeverityColor(item.severity)}20`,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.severityText,
                          { color: getSeverityColor(item.severity) },
                        ]}
                      >
                        {item.severity}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.alertDescription}>{item.description}</Text>

                  <View style={styles.alertMetaRow}>
                    <Text style={styles.alertMeta}>📍 {item.location}</Text>
                    {item.delayTime !== 'None' && (
                      <Text style={styles.alertMeta}>⏱️ {item.delayTime} delay</Text>
                    )}
                    <Text
                      style={[
                        styles.alertImpact,
                        {
                          color:
                            item.impact === 'AVOID'
                              ? '#FF3B30'
                              : item.impact === 'CONSIDER'
                                ? '#FFA500'
                                : '#34C759',
                        },
                      ]}
                    >
                      {item.impact}
                    </Text>
                  </View>
                </View>
              </View>
            )}
            scrollEnabled={false}
          />
        </View>
      )}

      {/* Route Options */}
      {routes.length > 0 && (
        <View style={styles.routesSection}>
          <Text style={styles.sectionTitle}>Recommended Routes</Text>
          <FlatList
            data={routes}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[
                  styles.routeItem,
                  selectedRoute === item.id && styles.routeItemSelected,
                ]}
                onPress={() => handleSelectRoute(item)}
                disabled={disabled}
              >
                {item.isRecommended && (
                  <View style={styles.recommendedBadge}>
                    <Text style={styles.recommendedBadgeText}>⭐ RECOMMENDED</Text>
                  </View>
                )}

                <View style={styles.routeHeader}>
                  <Text style={styles.routeName}>{item.name}</Text>
                  <View
                    style={[
                      styles.trafficBadge,
                      {
                        backgroundColor: `${getTrafficConditionColor(item.trafficCondition)}20`,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.trafficText,
                        { color: getTrafficConditionColor(item.trafficCondition) },
                      ]}
                    >
                      {item.trafficCondition}
                    </Text>
                  </View>
                </View>

                <View style={styles.routeStats}>
                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>⏱️ Duration</Text>
                    <Text style={styles.statValue}>{item.duration}</Text>
                  </View>

                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>📏 Distance</Text>
                    <Text style={styles.statValue}>{item.distance} km</Text>
                  </View>

                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>⛽ Avg Speed</Text>
                    <Text style={styles.statValue}>{item.avgSpeed} km/h</Text>
                  </View>

                  {item.toll > 0 && (
                    <View style={styles.stat}>
                      <Text style={styles.statLabel}>🛣️ Toll</Text>
                      <Text style={styles.statValue}>₹{item.toll}</Text>
                    </View>
                  )}
                </View>

                {item.avoidedAlerts.length > 0 && (
                  <Text style={styles.routeAlerts}>
                    ✓ Avoids {item.avoidedAlerts.length} alerts
                  </Text>
                )}
              </TouchableOpacity>
            )}
            scrollEnabled={false}
          />
        </View>
      )}

      {/* Optimization Tips */}
      <View style={styles.tipsBox}>
        <Text style={styles.tipsTitle}>💡 Route Optimization Tips</Text>
        <Text style={styles.tipText}>• Green = Light traffic (best earnings)</Text>
        <Text style={styles.tipText}>• Yellow = Moderate traffic (acceptable)</Text>
        <Text style={styles.tipText}>• Red = Heavy traffic (avoid if possible)</Text>
        <Text style={styles.tipText}>• Update 2 mins for real-time changes</Text>
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
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  refreshButton: {
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  alertsSection: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  alertItem: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 10,
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
  },
  alertIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  alertContent: {
    flex: 1,
  },
  alertHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  severityBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  severityText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  alertDescription: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginBottom: 6,
    lineHeight: 16,
  },
  alertMetaRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  alertMeta: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  alertImpact: {
    fontSize: 11,
    fontWeight: '600',
  },
  routesSection: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  routeItem: {
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  routeItemSelected: {
    backgroundColor: `${COLORS.primary}15`,
    borderColor: COLORS.primary,
    borderWidth: 2,
  },
  recommendedBadge: {
    backgroundColor: '#FFA500',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  recommendedBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },
  routeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  routeName: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  trafficBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  trafficText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  routeStats: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  stat: {
    flex: 1,
  },
  statLabel: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginBottom: 2,
  },
  statValue: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
  },
  routeAlerts: {
    fontSize: 11,
    color: '#34C759',
    fontWeight: '500',
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
