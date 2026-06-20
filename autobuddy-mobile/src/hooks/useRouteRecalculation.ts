import { useState, useCallback, useEffect, useRef } from 'react';
import { OptimizedRoute, Stop } from './useRouteOptimization';

const LOG_RECALC = true;
const logRecalc = (message: string, data?: any) => {
  if (LOG_RECALC && typeof console !== 'undefined') {
    console.log(`[useRouteRecalculation] ${message}`, data || '');
  }
};

export interface RecalculationTrigger {
  type: 'traffic_change' | 'deviation' | 'new_stop' | 'periodic' | 'manual';
  reason: string;
  severity: 'low' | 'medium' | 'high';
}

export interface RouteRecalculationState {
  currentRoute: OptimizedRoute | null;
  previousRoute: OptimizedRoute | null;
  suggestedRoute: OptimizedRoute | null;
  isRecalculating: boolean;
  lastRecalcTime: number | null;
  timeDelta: number;
  distanceDelta: number;
  shouldRecalculate: boolean;
  recalculationTrigger: RecalculationTrigger | null;
  acceptedSuggestions: number;
  rejectedSuggestions: number;
}

const TRAFFIC_LEVEL_THRESHOLD = 2;
const DELAY_INCREASE_THRESHOLD_MS = 600000;
const DEVIATION_THRESHOLD_M = 100;
const PERIODIC_CHECK_INTERVAL_MS = 300000;

const trafficLevelMap = {
  low: 0,
  moderate: 1,
  high: 2,
  severe: 3,
};

export const useRouteRecalculation = () => {
  const [state, setState] = useState<RouteRecalculationState>({
    currentRoute: null,
    previousRoute: null,
    suggestedRoute: null,
    isRecalculating: false,
    lastRecalcTime: null,
    timeDelta: 0,
    distanceDelta: 0,
    shouldRecalculate: false,
    recalculationTrigger: null,
    acceptedSuggestions: 0,
    rejectedSuggestions: 0,
  });

  const lastTrafficCheckRef = useRef<{ level: number; delay: number } | null>(null);
  const periodicCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null);

  const setCurrentRoute = useCallback((route: OptimizedRoute | null) => {
    setState((prev) => ({
      ...prev,
      previousRoute: prev.currentRoute,
      currentRoute: route,
    }));
  }, []);

  const setSuggestedRoute = useCallback((route: OptimizedRoute | null) => {
    if (route && state.currentRoute) {
      const timeDelta = Math.round((state.currentRoute.estimatedDuration - route.estimatedDuration) / 60);
      const distanceDelta = Math.round((state.currentRoute.totalDistance - route.totalDistance) * 10) / 10;

      setState((prev) => ({
        ...prev,
        suggestedRoute: route,
        timeDelta,
        distanceDelta,
      }));

      logRecalc('Suggested route available', {
        timeSaved: timeDelta,
        distanceSaved: distanceDelta,
      });
    } else {
      setState((prev) => ({
        ...prev,
        suggestedRoute: null,
      }));
    }
  }, [state.currentRoute]);

  const checkTrafficChange = useCallback((newRoute: OptimizedRoute): RecalculationTrigger | null => {
    if (!state.currentRoute || !lastTrafficCheckRef.current) {
      lastTrafficCheckRef.current = {
        level: trafficLevelMap[newRoute.traffic.level as keyof typeof trafficLevelMap] || 0,
        delay: newRoute.traffic.delay,
      };
      return null;
    }

    const currentLevel = trafficLevelMap[newRoute.traffic.level as keyof typeof trafficLevelMap] || 0;
    const previousLevel = lastTrafficCheckRef.current.level;
    const levelDelta = Math.abs(currentLevel - previousLevel);

    if (levelDelta >= TRAFFIC_LEVEL_THRESHOLD) {
      lastTrafficCheckRef.current = { level: currentLevel, delay: newRoute.traffic.delay };

      const levelChangeDir = currentLevel > previousLevel ? 'worsening' : 'improving';
      logRecalc(`Traffic level ${levelChangeDir}`, {
        from: Object.keys(trafficLevelMap).find((k) => trafficLevelMap[k as keyof typeof trafficLevelMap] === previousLevel),
        to: newRoute.traffic.level,
      });

      return {
        type: 'traffic_change',
        reason: `Traffic ${levelChangeDir} (${previousLevel} → ${currentLevel})`,
        severity: currentLevel > previousLevel ? 'high' : 'low',
      };
    }

    const delayIncrease = newRoute.traffic.delay - lastTrafficCheckRef.current.delay;
    if (delayIncrease > DELAY_INCREASE_THRESHOLD_MS) {
      lastTrafficCheckRef.current.delay = newRoute.traffic.delay;
      const minutesAdded = Math.round(delayIncrease / 60000);

      logRecalc(`Significant delay increase detected`, { minutesAdded });

      return {
        type: 'traffic_change',
        reason: `Delay increased by ${minutesAdded} minutes`,
        severity: 'high',
      };
    }

    lastTrafficCheckRef.current = {
      level: currentLevel,
      delay: newRoute.traffic.delay,
    };

    return null;
  }, [state.currentRoute]);

  const checkDeviation = useCallback((currentPosition: { lat: number; lng: number }, route: OptimizedRoute): RecalculationTrigger | null => {
    if (!lastPositionRef.current) {
      lastPositionRef.current = currentPosition;
      return null;
    }

    if (!route.stops.length) return null;

    const nextStop = route.stops[0];
    const distanceToStop = calculateHaversineDistance(
      currentPosition,
      { lat: nextStop.location.lat, lng: nextStop.location.lng }
    );

    if (distanceToStop > DEVIATION_THRESHOLD_M) {
      logRecalc(`Route deviation detected`, { deviationMeters: distanceToStop });

      return {
        type: 'deviation',
        reason: `Deviated ${distanceToStop}m from route`,
        severity: distanceToStop > 500 ? 'high' : 'medium',
      };
    }

    lastPositionRef.current = currentPosition;
    return null;
  }, []);

  const evaluateRecalculation = useCallback(
    (newRoute: OptimizedRoute, trigger: RecalculationTrigger | null, currentPosition?: { lat: number; lng: number }): boolean => {
      if (!state.currentRoute) return false;

      let shouldRecalc = false;
      let finalTrigger = trigger;

      if (trigger) {
        shouldRecalc = trigger.severity === 'high';
      }

      if (currentPosition && !shouldRecalc) {
        const deviationTrigger = checkDeviation(currentPosition, state.currentRoute);
        if (deviationTrigger) {
          shouldRecalc = true;
          finalTrigger = deviationTrigger;
        }
      }

      if (!shouldRecalc) {
        const trafficTrigger = checkTrafficChange(newRoute);
        if (trafficTrigger) {
          shouldRecalc = trafficTrigger.severity === 'high';
          finalTrigger = trafficTrigger;
        }
      }

      setState((prev) => ({
        ...prev,
        shouldRecalculate: shouldRecalc,
        recalculationTrigger: finalTrigger,
        isRecalculating: shouldRecalc,
      }));

      if (shouldRecalc && finalTrigger) {
        logRecalc(`Recalculation triggered: ${finalTrigger.reason}`);
      }

      return shouldRecalc;
    },
    [state.currentRoute, checkTrafficChange, checkDeviation]
  );

  const acceptSuggestedRoute = useCallback(() => {
    if (state.suggestedRoute) {
      setCurrentRoute(state.suggestedRoute);
      setState((prev) => ({
        ...prev,
        suggestedRoute: null,
        lastRecalcTime: Date.now(),
        acceptedSuggestions: prev.acceptedSuggestions + 1,
        isRecalculating: false,
      }));

      logRecalc('Suggested route accepted', {
        timeSaved: state.timeDelta,
        distanceSaved: state.distanceDelta,
      });
    }
  }, [state.suggestedRoute, state.timeDelta, state.distanceDelta, setCurrentRoute]);

  const rejectSuggestedRoute = useCallback(() => {
    setState((prev) => ({
      ...prev,
      suggestedRoute: null,
      rejectedSuggestions: prev.rejectedSuggestions + 1,
      isRecalculating: false,
    }));

    logRecalc('Suggested route rejected');
  }, []);

  const manualRecalculate = useCallback((newRoute: OptimizedRoute) => {
    setState((prev) => ({
      ...prev,
      isRecalculating: true,
      recalculationTrigger: {
        type: 'manual',
        reason: 'User manually requested recalculation',
        severity: 'medium',
      },
    }));

    setSuggestedRoute(newRoute);
  }, [setSuggestedRoute]);

  const startPeriodicMonitoring = useCallback(() => {
    if (periodicCheckIntervalRef.current) {
      clearInterval(periodicCheckIntervalRef.current);
    }

    periodicCheckIntervalRef.current = setInterval(() => {
      setState((prev) => {
        if (prev.currentRoute) {
          return {
            ...prev,
            recalculationTrigger: {
              type: 'periodic',
              reason: 'Periodic monitoring check',
              severity: 'low',
            },
          };
        }
        return prev;
      });
    }, PERIODIC_CHECK_INTERVAL_MS);

    logRecalc('Periodic monitoring started', { intervalMs: PERIODIC_CHECK_INTERVAL_MS });
  }, []);

  const stopPeriodicMonitoring = useCallback(() => {
    if (periodicCheckIntervalRef.current) {
      clearInterval(periodicCheckIntervalRef.current);
      periodicCheckIntervalRef.current = null;
    }
    logRecalc('Periodic monitoring stopped');
  }, []);

  useEffect(() => {
    return () => {
      if (periodicCheckIntervalRef.current) {
        clearInterval(periodicCheckIntervalRef.current);
      }
    };
  }, []);

  return {
    state,
    setCurrentRoute,
    setSuggestedRoute,
    evaluateRecalculation,
    acceptSuggestedRoute,
    rejectSuggestedRoute,
    manualRecalculate,
    startPeriodicMonitoring,
    stopPeriodicMonitoring,
  };
};

function calculateHaversineDistance(
  pos1: { lat: number; lng: number },
  pos2: { lat: number; lng: number }
): number {
  const R = 6371000;
  const dLat = ((pos2.lat - pos1.lat) * Math.PI) / 180;
  const dLng = ((pos2.lng - pos1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((pos1.lat * Math.PI) / 180) *
      Math.cos((pos2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export default useRouteRecalculation;
