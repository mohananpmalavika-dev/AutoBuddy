import React, { useEffect, useState, useCallback, useRef } from 'react';
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
type ConnectionStatus = 'connected' | 'polling' | 'offline';


const deduplicateAlerts = (alerts: TrafficAlert[], threshold = 500): TrafficAlert[] => {
  const seen = new Set<string>();
  return alerts.filter((alert) => {
    const key = `${alert.location}-${alert.type}`;
    if (seen.has(key)) {return false;}
    seen.add(key);
    return true;
  });
};

export default function TrafficAlerts({
  currentLocation,
  destinationLocation,
  driverId,
  routeId,
  onRouteChange,
  disabled = false,
}: TrafficAlertsProps) {
  const [loading, setLoading] = useState(false);
  const [alerts, setAlerts] = useState<TrafficAlert[]>([]);
  const [routes, setRoutes] = useState<TrafficRoute[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('polling');
  const [lastUpdateTime, setLastUpdateTime] = useState<number | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dismissedAlertsRef = useRef<Set<string>>(new Set());

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
      let nextAlerts = getPayloadRows(payload, 'alerts')
        .map(normalizeAlert)
        .filter((alert): alert is TrafficAlert => Boolean(alert));

      nextAlerts = nextAlerts
        .filter((alert) => !dismissedAlertsRef.current.has(alert.id))
        .map((alert) => ({
          ...alert,
          age: calculateAlertAge(alert.reportedTime),
        }));

      nextAlerts = deduplicateAlerts(nextAlerts);
      nextAlerts.sort((a, b) => {
        const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
        return severityOrder[a.severity] - severityOrder[b.severity];
      });

      const nextRoutes = getPayloadRows(payload, 'routes')
        .map(normalizeRoute)
        .filter((route): route is TrafficRoute => Boolean(route));

      setAlerts(nextAlerts);
      setRoutes(nextRoutes);
      setSelectedRoute(nextRoutes.find((route) => route.isRecommended)?.id ?? nextRoutes[0]?.id ?? null);
      setLastUpdateTime(Date.now());

      if (connectionStatus !== 'connected') {
        logAlert('Traffic data loaded via polling');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load traffic data'));
      logAlert('Failed to load traffic data', err);
    } finally {
      setLoading(false);
    }
  }, [currentLocation, destinationLocation, connectionStatus]);

  const connectWebSocket = useCallback(() => {
    if (!driverId || !routeId) {return;}

    try {
      const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${wsProtocol}//${location.host}/ws/traffic/${driverId}?route_id=${routeId}`;

      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setConnectionStatus('connected');
        logAlert('WebSocket connected for traffic alerts');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          logAlert('WebSocket message received', data);

          if (data.type === 'traffic:alert_new') {
            const newAlert = normalizeAlert(data.payload, 0);
            if (newAlert && !dismissedAlertsRef.current.has(newAlert.id)) {
              setAlerts((prev) => {
                const updated = [{ ...newAlert, age: calculateAlertAge(newAlert.reportedTime) }, ...prev];
                return deduplicateAlerts(updated).slice(0, 20);
              });
              setLastUpdateTime(Date.now());
            }
          } else if (data.type === 'traffic:alert_cleared') {
            setAlerts((prev) => prev.filter((a) => a.id !== data.alert_id));
          } else if (data.type === 'traffic:route_recommendation') {
            const recommendedRoute = normalizeRoute(data.payload, 0);
            if (recommendedRoute) {
              setRoutes((prev) => {
                const updated = prev.map((r) => ({
                  ...r,
                  isRecommended: r.id === recommendedRoute.id,
                }));
                return updated;
              });
            }
          }
        } catch (parseError) {
          logAlert('Failed to parse WebSocket message', parseError);
        }
      };

      ws.onerror = (error) => {
        logAlert('WebSocket error', error);
        setConnectionStatus('polling');
      };

      ws.onclose = () => {
        setConnectionStatus('polling');
        logAlert('WebSocket closed, falling back to polling');
        wsRef.current = null;

        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 5000);
      };

      wsRef.current = ws;
    } catch (error) {
      logAlert('Failed to connect WebSocket', error);
      setConnectionStatus('polling');
    }
  }, [driverId, routeId]);

  useEffect(() => {
    if (!currentLocation || !destinationLocation) {
      return undefined;
    }

    loadTrafficData();
    connectWebSocket();

    if (connectionStatus !== 'connected') {
      pollIntervalRef.current = setInterval(loadTrafficData, 3 * 60 * 1000);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [currentLocation, destinationLocation, loadTrafficData, connectWebSocket, connectionStatus]);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleSelectRoute = (route: TrafficRoute) => {
    setSelectedRoute(route.id);
    onRouteChange?.(route);
    Alert.alert(
      `Route Selected: ${route.name}`,
      `Duration: ${route.duration} | Distance: ${route.distance} km\nAverage Speed: ${route.avgSpeed} km/h`
    );
  };

  const handleDismissAlert = (alertId: string) => {
    dismissedAlertsRef.current.add(alertId);
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
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

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return '#34C759';
      case 'polling':
        return '#FFA500';
      case 'offline':
        return '#FF3B30';
      default:
        return '#999';
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return '🟢 Real-time';
      case 'polling':
        return '🟡 Polling';
      case 'offline':
        return '🔴 Offline';
      default:
        return 'Unknown';
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

  const criticalAlerts = alerts.filter((a) => a.severity === 'HIGH');
  const moderateAlerts = alerts.filter((a) => a.severity === 'MEDIUM');
  const infoAlerts = alerts.filter((a) => a.severity === 'LOW');

  if (loading && alerts.length === 0 && routes.length === 0) {
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
        <View>
          <Text style={styles.title}>🚦 Traffic Alerts & Routes</Text>
          <View style={styles.connectionStatusRow}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: getConnectionStatusColor() },
              ]}
            />
            <Text style={styles.connectionStatus}>{getConnectionStatusText()}</Text>
            {lastUpdateTime && (
              <Text style={styles.lastUpdate}>
                Updated {calculateAlertAge(new Date(lastUpdateTime))}
              </Text>
            )}
          </View>
        </View>
        <TouchableOpacity onPress={loadTrafficData} disabled={disabled}>
          <Text style={styles.refreshButton}>🔄</Text>
        </TouchableOpacity>
      </View>

      {/* Critical Alerts */}
      {criticalAlerts.length > 0 && (
        <View style={styles.alertsSection}>
          <Text style={styles.sectionTitle}>🚨 CRITICAL ALERTS</Text>
          <FlatList
            data={criticalAlerts}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <AlertItemComponent
                alert={item}
                onDismiss={handleDismissAlert}
              />
            )}
          />
        </View>
      )}

      {/* Moderate Alerts */}
      {moderateAlerts.length > 0 && (
        <View style={styles.alertsSection}>
          <Text style={styles.sectionTitle}>🚦 MODERATE ALERTS</Text>
          <FlatList
            data={moderateAlerts}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <AlertItemComponent
                alert={item}
                onDismiss={handleDismissAlert}
              />
            )}
          />
        </View>
      )}

      {/* Info Alerts */}
      {infoAlerts.length > 0 && (
        <View style={styles.alertsSection}>
          <Text style={styles.sectionTitle}>ℹ️ INFO</Text>
          <FlatList
            data={infoAlerts}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <AlertItemComponent
                alert={item}
                onDismiss={handleDismissAlert}
              />
            )}
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
            scrollEnabled={false}
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
          />
        </View>
      )}

      {/* Optimization Tips */}
      <View style={styles.tipsBox}>
        <Text style={styles.tipsTitle}>💡 Real-time Updates</Text>
        <Text style={styles.tipText}>• Green dot = WebSocket connected (instant alerts)</Text>
        <Text style={styles.tipText}>• Yellow dot = Using polling (3-min updates)</Text>
        <Text style={styles.tipText}>• Alerts auto-deduplicate within same location</Text>
        <Text style={styles.tipText}>• Dismiss alerts to reduce clutter</Text>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
    </View>
  );
}

interface AlertItemComponentProps {
  alert: TrafficAlert;
  onDismiss: (alertId: string) => void;
}

const AlertItemComponent: React.FC<AlertItemComponentProps> = ({ alert, onDismiss }) => {
  return (
    <View
      style={[
        styles.alertItem,
        {
          borderLeftColor:
            alert.severity === 'HIGH'
              ? '#FF3B30'
              : alert.severity === 'MEDIUM'
                ? '#FFA500'
                : '#34C759',
        },
      ]}
    >
      <Text style={styles.alertIcon}>
        {alert.severity === 'HIGH' ? '🚨' : alert.severity === 'MEDIUM' ? '🚦' : 'ℹ️'}
      </Text>

      <View style={styles.alertContent}>
        <View style={styles.alertHeaderRow}>
          <Text style={styles.alertTitle}>{alert.title}</Text>
          {alert.isCrowdsourced && <Text style={styles.crowdsourcedBadge}>👥</Text>}
        </View>

        <Text style={styles.alertDescription}>{alert.description}</Text>

        <View style={styles.alertMetaRow}>
          <Text style={styles.alertMeta}>📍 {alert.location}</Text>
          {alert.delayTime !== 'None' && (
            <Text style={styles.alertMeta}>⏱️ {alert.delayTime}</Text>
          )}
          {alert.age && <Text style={styles.alertAge}>{alert.age}</Text>}
        </View>
      </View>

      <TouchableOpacity
        style={styles.dismissButton}
        onPress={() => onDismiss(alert.id)}
      >
        <Text style={styles.dismissButtonText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
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
  connectionStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  connectionStatus: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  lastUpdate: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginLeft: 4,
  },
  refreshButton: {
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 10,
    textTransform: 'uppercase',
    paddingHorizontal: 4,
  },
  alertsSection: {
    marginBottom: 16,
    paddingBottom: 12,
  },
  alertItem: {
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 4,
    alignItems: 'flex-start',
  },
  alertIcon: {
    fontSize: 18,
    marginRight: 12,
    marginTop: 2,
  },
  alertContent: {
    flex: 1,
  },
  alertHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    flex: 1,
  },
  crowdsourcedBadge: {
    fontSize: 12,
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
  alertAge: {
    fontSize: 10,
    color: '#999',
    fontStyle: 'italic',
  },
  dismissButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#EEE',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  dismissButtonText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '600',
  },
  routesSection: {
    marginBottom: 16,
    paddingBottom: 12,
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
