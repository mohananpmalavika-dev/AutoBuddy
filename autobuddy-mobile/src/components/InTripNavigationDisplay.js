import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { useRouteOptimization } from '../hooks/useRouteOptimization';
import ETACalculator from '../utils/etaCalculations';

const GEOLOCATION_THRESHOLD = 100;
const STEP_REFRESH_INTERVAL = 5000;
const LOG_NAVIGATION = true;

const logNav = (message, data) => {
  if (LOG_NAVIGATION && typeof console !== 'undefined') {
    console.log(`[InTripNavigationDisplay] ${message}`, data || '');
  }
};

const MANEUVER_ICONS = {
  'turn-left': '↙️',
  'turn-right': '↘️',
  'turn-sharp-left': '↙️',
  'turn-sharp-right': '↘️',
  'turn-slight-left': '↙️',
  'turn-slight-right': '↘️',
  'continue': '↑',
  'roundabout': '🔄',
  'uturn': '↩️',
  'merge': '↗️',
  'fork': '⎇',
  'ramp': '↗️',
  'straight': '↑',
};

export default function InTripNavigationDisplay({
  origin = null,
  destination = null,
  currentLocation = null,
  currentRoute = null,
  routeId = null,
  estimatedDistance = 0,
  estimatedTime = 0,
  nextInstruction = 'Follow GPS directions',
  distanceToNextTurn = 0,
  rideStatus = 'in_progress',
  driverId = null,
  authToken = null,
  onOpenFullMap = () => null,
  onStepAdvanced = () => null,
}) {
  const [navigationSteps, setNavigationSteps] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepsLoading, setStepsLoading] = useState(false);
  const [eta, setEta] = useState(null);
  const [trafficInfo, setTrafficInfo] = useState(null);
  const [lastUpdateTime, setLastUpdateTime] = useState(Date.now());

  const { getNavigationSteps, getTrafficUpdate } = useRouteOptimization(authToken, driverId || '');

  const navigationData = useMemo(() => {
    if (!currentRoute) return null;
    const calc = ETACalculator.calculateFromRoute(currentRoute);
    return {
      distance: currentRoute.totalDistance.toFixed(1),
      estimatedMinutes: Math.round(calc.totalETA / 60),
      eta: calc,
    };
  }, [currentRoute]);

  useEffect(() => {
    if (!routeId || !authToken) return;

    const fetchSteps = async () => {
      setStepsLoading(true);
      try {
        const steps = await getNavigationSteps(routeId);
        if (steps && steps.length > 0) {
          setNavigationSteps(steps);
          logNav(`Loaded ${steps.length} navigation steps`, { steps });
        }
      } catch (error) {
        logNav(`Failed to load navigation steps`, error);
      } finally {
        setStepsLoading(false);
      }
    };

    fetchSteps();
    const interval = setInterval(fetchSteps, STEP_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [routeId, authToken, getNavigationSteps]);

  useEffect(() => {
    if (!routeId || !authToken) return;

    const fetchTraffic = async () => {
      try {
        const traffic = await getTrafficUpdate(routeId);
        if (traffic) {
          setTrafficInfo(traffic);
          logNav('Traffic update received', traffic);
        }
      } catch (error) {
        logNav('Failed to fetch traffic', error);
      }
    };

    fetchTraffic();
    const interval = setInterval(fetchTraffic, 10000);
    return () => clearInterval(interval);
  }, [routeId, authToken, getTrafficUpdate]);

  useEffect(() => {
    if (!navigationSteps.length || !currentLocation) return;

    const checkStepCompletion = () => {
      if (currentStepIndex >= navigationSteps.length) return;

      const currentStep = navigationSteps[currentStepIndex];
      if (!currentStep.distance) {
        const nextIndex = currentStepIndex + 1;
        if (nextIndex < navigationSteps.length) {
          setCurrentStepIndex(nextIndex);
          logNav(`Advanced to step ${nextIndex}`, navigationSteps[nextIndex]);
          onStepAdvanced?.(nextIndex, navigationSteps[nextIndex]);
        }
      }
    };

    checkStepCompletion();
  }, [currentLocation, navigationSteps, currentStepIndex, onStepAdvanced]);

  const getCurrentStep = useCallback(() => {
    return navigationSteps[currentStepIndex] || null;
  }, [navigationSteps, currentStepIndex]);

  const getNextSteps = useCallback(() => {
    const next = [];
    for (let i = currentStepIndex + 1; i < Math.min(currentStepIndex + 3, navigationSteps.length); i++) {
      next.push(navigationSteps[i]);
    }
    return next;
  }, [navigationSteps, currentStepIndex]);

  const getProgressPercentage = useCallback(() => {
    if (navigationSteps.length === 0) return 0;
    return ((currentStepIndex + 1) / navigationSteps.length) * 100;
  }, [navigationSteps.length, currentStepIndex]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'accepted':
        return '#2196F3';
      case 'driver_arrived':
        return '#FF9800';
      case 'in_progress':
        return '#4CAF50';
      default:
        return '#9E9E9E';
    }
  };

  const getStatusMessage = (status) => {
    switch (status) {
      case 'accepted':
        return 'Heading to pickup';
      case 'driver_arrived':
        return 'Ready for pickup';
      case 'in_progress':
        return 'On trip to destination';
      default:
        return 'Route available';
    }
  };

  const formatDistance = (meters) => {
    if (meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(1)}km`;
  };

  const getManeuveriIcon = (maneuver) => {
    return MANEUVER_ICONS[maneuver?.toLowerCase()] || '→';
  };

  const currentStep = getCurrentStep();
  const nextSteps = getNextSteps();

  return (
    <View style={styles.container}>
      {/* Main Navigation Card */}
      <View style={styles.navCard}>
        {/* ETA Section */}
        <View style={styles.etaSection}>
          <View style={styles.etaContent}>
            <Text style={styles.etaLabel}>Estimated arrival</Text>
            <Text style={styles.etaTime}>
              {navigationData ? `${navigationData.estimatedMinutes}` : '--'} min
            </Text>
            <Text style={styles.etaDistance}>
              {navigationData ? `${navigationData.distance} km` : '--'}
            </Text>
            {trafficInfo && (
              <Text style={styles.trafficInfo}>
                🚦 {trafficInfo.level} traffic (+{Math.round(trafficInfo.delay / 60)} min)
              </Text>
            )}
          </View>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor(rideStatus) }]} />
        </View>

        {/* Current Step - Main Instruction */}
        {stepsLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#2196F3" />
            <Text style={styles.loadingText}>Loading directions...</Text>
          </View>
        ) : currentStep ? (
          <View style={[styles.instructionBanner, { borderLeftColor: getStatusColor(rideStatus) }]}>
            <View style={styles.maneuverRow}>
              <Text style={styles.maneuverIcon}>{getManeuveriIcon(currentStep.maneuver)}</Text>
              <Text style={styles.instructionLabel}>NEXT TURN</Text>
            </View>
            <Text style={styles.instructionText} numberOfLines={2}>
              {currentStep.instruction}
            </Text>
            {currentStep.distance > 0 && (
              <Text style={styles.distanceToTurn}>in {formatDistance(currentStep.distance)}</Text>
            )}
          </View>
        ) : (
          <View style={styles.instructionBanner}>
            <Text style={styles.instructionText}>{nextInstruction || 'Follow GPS directions'}</Text>
          </View>
        )}

        {/* Progress Bar */}
        <View style={styles.progressSection}>
          <View style={styles.progressLabel}>
            <Text style={styles.progressText}>{getStatusMessage(rideStatus)}</Text>
            <Text style={styles.progressPercent}>
              {navigationSteps.length > 0 ? `${currentStepIndex + 1}/${navigationSteps.length}` : '--'}
            </Text>
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${getProgressPercentage()}%`,
                  backgroundColor: getStatusColor(rideStatus),
                },
              ]}
            />
          </View>
        </View>
      </View>

      {/* Next Steps Preview */}
      {nextSteps.length > 0 && (
        <View style={styles.nextStepsSection}>
          <Text style={styles.nextStepsTitle}>Upcoming turns</Text>
          <View style={styles.nextStepsList}>
            {nextSteps.map((step, idx) => (
              <View key={idx} style={styles.nextStepItem}>
                <Text style={styles.nextStepManeuver}>{getManeuveriIcon(step.maneuver)}</Text>
                <View style={styles.nextStepContent}>
                  <Text style={styles.nextStepInstruction} numberOfLines={1}>
                    {step.instruction}
                  </Text>
                  <Text style={styles.nextStepDistance}>{formatDistance(step.distance)}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Location Details */}
      <View style={styles.locationsSection}>
        {rideStatus !== 'accepted' && origin && (
          <View style={styles.locationRow}>
            <Text style={styles.locationLabel}>📍 From:</Text>
            <Text style={styles.locationText} numberOfLines={1}>
              {origin.address || 'Pickup location'}
            </Text>
          </View>
        )}

        {destination && (
          <View style={styles.locationRow}>
            <Text style={styles.locationLabel}>📍 To:</Text>
            <Text style={styles.locationText} numberOfLines={1}>
              {destination.address || 'Destination'}
            </Text>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actionsSection}>
        <TouchableOpacity
          style={styles.openMapButton}
          onPress={onOpenFullMap}
        >
          <Text style={styles.openMapText}>🗺 Open Full Map</Text>
        </TouchableOpacity>

        <View style={styles.tipsContainer}>
          <Text style={styles.tipsLabel}>Tips:</Text>
          <Text style={styles.tip}>• Keep your phone visible for directions</Text>
          <Text style={styles.tip}>• Use voice guidance if available</Text>
        </View>
      </View>

      {/* Speed Advisory */}
      {rideStatus === 'in_progress' && (
        <View style={styles.speedAdvisory}>
          <Text style={styles.speedLabel}>Follow speed limits and traffic rules</Text>
          <Text style={styles.speedHint}>Safe driving = Happy passengers = Better ratings</Text>
        </View>
      )}
    </View>
  );
}


  return (
    <View style={styles.container}>
      {/* Main Navigation Card */}
      <View style={styles.navCard}>
        {/* ETA Section */}
        <View style={styles.etaSection}>
          <View style={styles.etaContent}>
            <Text style={styles.etaLabel}>Estimated arrival</Text>
            <Text style={styles.etaTime}>
              {navigationData ? `${navigationData.estimatedMinutes}` : '--'} min
            </Text>
            <Text style={styles.etaDistance}>
              {navigationData ? `${navigationData.distance} km` : '--'}
            </Text>
          </View>
          <View style={[styles.statusDot, { backgroundColor: getStatusColor(rideStatus) }]} />
        </View>

        {/* Next Turn Instruction */}
        <View style={[styles.instructionBanner, { borderLeftColor: getStatusColor(rideStatus) }]}>
          <Text style={styles.instructionLabel}>Next:</Text>
          <Text style={styles.instructionText} numberOfLines={2}>
            {nextInstruction || 'Follow GPS directions'}
          </Text>
          {distanceToNextTurn > 0 && (
            <Text style={styles.distanceToTurn}>
              in {distanceToNextTurn < 1000 ? `${distanceToNextTurn}m` : `${(distanceToNextTurn / 1000).toFixed(1)}km`}
            </Text>
          )}
        </View>

        {/* Progress Bar */}
        <View style={styles.progressSection}>
          <View style={styles.progressLabel}>
            <Text style={styles.progressText}>{getStatusMessage(rideStatus)}</Text>
            <Text style={styles.progressPercent}>{Math.round(getProgressPercentage())}%</Text>
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${getProgressPercentage()}%`,
                  backgroundColor: getStatusColor(rideStatus),
                },
              ]}
            />
          </View>
        </View>
      </View>

      {/* Location Details */}
      <View style={styles.locationsSection}>
        {rideStatus !== 'accepted' && origin && (
          <View style={styles.locationRow}>
            <Text style={styles.locationLabel}>📍 From:</Text>
            <Text style={styles.locationText} numberOfLines={1}>
              {origin.address || 'Pickup location'}
            </Text>
          </View>
        )}

        {destination && (
          <View style={styles.locationRow}>
            <Text style={styles.locationLabel}>📍 To:</Text>
            <Text style={styles.locationText} numberOfLines={1}>
              {destination.address || 'Destination'}
            </Text>
          </View>
        )}
      </View>

      {/* Actions */}
      <View style={styles.actionsSection}>
        <TouchableOpacity
          style={styles.openMapButton}
          onPress={onOpenFullMap}
        >
          <Text style={styles.openMapText}>🗺 Open Full Map</Text>
        </TouchableOpacity>

        <View style={styles.tipsContainer}>
          <Text style={styles.tipsLabel}>Tips:</Text>
          <Text style={styles.tip}>• Keep your phone visible for directions</Text>
          <Text style={styles.tip}>• Use voice guidance if available</Text>
        </View>
      </View>

      {/* Speed Advisory */}
      {rideStatus === 'in_progress' && (
        <View style={styles.speedAdvisory}>
          <Text style={styles.speedLabel}>Follow speed limits and traffic rules</Text>
          <Text style={styles.speedHint}>Safe driving = Happy passengers = Better ratings</Text>
        </View>
      )}
    </View>
  );
}

const styles = {
  container: {
    flex: 1,
    paddingBottom: 16,
  },
  navCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  etaSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  etaContent: {
    flex: 1,
  },
  etaLabel: {
    fontSize: 11,
    color: '#999',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  etaTime: {
    fontSize: 32,
    fontWeight: '700',
    color: '#212121',
    lineHeight: 36,
  },
  etaDistance: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
    marginTop: 2,
  },
  trafficInfo: {
    fontSize: 11,
    color: '#FF9800',
    fontWeight: '600',
    marginTop: 4,
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  instructionBanner: {
    borderLeftWidth: 4,
    borderRadius: 8,
    backgroundColor: '#F9F9F9',
    padding: 12,
    marginBottom: 16,
  },
  maneuverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  maneuverIcon: {
    fontSize: 20,
  },
  instructionLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#999',
    textTransform: 'uppercase',
  },
  instructionText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#212121',
    marginBottom: 8,
  },
  distanceToTurn: {
    fontSize: 11,
    color: '#666',
    fontWeight: '500',
  },
  progressSection: {
    gap: 8,
  },
  progressLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  progressPercent: {
    fontSize: 12,
    fontWeight: '700',
    color: '#212121',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  nextStepsSection: {
    backgroundColor: '#F9F9F9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  nextStepsTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#999',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  nextStepsList: {
    gap: 8,
  },
  nextStepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 4,
  },
  nextStepManeuver: {
    fontSize: 18,
    minWidth: 24,
  },
  nextStepContent: {
    flex: 1,
  },
  nextStepInstruction: {
    fontSize: 12,
    color: '#212121',
    fontWeight: '500',
  },
  nextStepDistance: {
    fontSize: 11,
    color: '#999',
    fontWeight: '400',
    marginTop: 2,
  },
  locationsSection: {
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    gap: 10,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#666',
    minWidth: 40,
  },
  locationText: {
    fontSize: 12,
    color: '#212121',
    fontWeight: '500',
    flex: 1,
  },
  actionsSection: {
    gap: 12,
    marginBottom: 16,
  },
  openMapButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openMapText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '700',
  },
  tipsContainer: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#FFA500',
  },
  tipsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#B26A00',
    marginBottom: 6,
  },
  tip: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
  },
  speedAdvisory: {
    backgroundColor: '#FCE4EC',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#E91E63',
  },
  speedLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#880E4F',
    marginBottom: 4,
  },
  speedHint: {
    fontSize: 11,
    color: '#C2185B',
    fontWeight: '500',
  },
};
