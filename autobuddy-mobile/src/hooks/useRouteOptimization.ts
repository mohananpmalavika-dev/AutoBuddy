import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Location {
  lat: number;
  lng: number;
  address: string;
}

export interface RoutePoint {
  id: string;
  location: Location;
  type: 'pickup' | 'dropoff' | 'waypoint';
  order: number;
  address?: string;
  passengerName?: string;
  passengerPhone?: string;
  status?: 'pending' | 'completed' | 'cancelled';
  eta?: number;
  distance?: number;
}

export type Stop = RoutePoint & {
  address: string;
  passengerName?: string;
  passengerPhone?: string;
  status: 'pending' | 'completed' | 'cancelled';
};

export interface NavigationStep {
  instruction: string;
  distance: number;
  duration: number;
}

export interface OptimizedRoute {
  id: string;
  points: RoutePoint[];
  stops: Stop[];
  totalDistance: number;
  totalTime: number;
  estimatedDuration: number;
  estimatedFare: number;
  polylineString?: string;
  trafficLevel: 'low' | 'moderate' | 'heavy';
  traffic: {
    level: 'low' | 'moderate' | 'high';
    delay: number;
  };
  optimization: {
    originalDistance: number;
    savedDistance: number;
    percentageOptimized: number;
  };
  carbonFootprint: number;
  savings: { timeMinutes: number; costPercentage: number };
  createdAt: number;
}

export interface NavigationConfig {
  autoReroute: boolean;
  trafficAwareRouting: boolean;
  avoidHighways: boolean;
  avoidTolls: boolean;
  preferredRouteType: 'fastest' | 'shortest' | 'eco';
  maximumWaypoints: number;
  notifyBothDriverAndPassenger: boolean;
}

export interface RouteHistory {
  id: string;
  route: OptimizedRoute;
  usedAt: number;
  actualDistance: number;
  actualTime: number;
  actualFare: number;
  feedback?: string;
}

interface UseRouteOptimizationReturn {
  currentRoute: OptimizedRoute | null;
  routes: OptimizedRoute[];
  config: NavigationConfig;
  history: RouteHistory[];
  calculateOptimizedRoute: (points: RoutePoint[]) => Promise<OptimizedRoute>;
  optimizeRoute: (stops: Stop[]) => Promise<OptimizedRoute>;
  updateRoute: (route: OptimizedRoute) => Promise<void>;
  updateStopStatus: (routeId: string, stopId: string, status: Stop['status']) => Promise<boolean>;
  selectRoute: (route: OptimizedRoute) => Promise<void>;
  updateConfig: (config: Partial<NavigationConfig>) => Promise<void>;
  startNavigation: (route: OptimizedRoute) => Promise<void>;
  endNavigation: (distance: number, time: number, fare: number, feedback?: string) => Promise<void>;
  getNavigationSteps: (routeId: string) => Promise<NavigationStep[]>;
  getRouteHistory: () => Promise<RouteHistory[]>;
  getEcoScore: (route: OptimizedRoute) => number;
  compareRoutes: (routes: OptimizedRoute[]) => Promise<OptimizedRoute>;
  loading: boolean;
}

const DEFAULT_CONFIG: NavigationConfig = {
  autoReroute: true,
  trafficAwareRouting: true,
  avoidHighways: false,
  avoidTolls: false,
  preferredRouteType: 'fastest',
  maximumWaypoints: 5,
  notifyBothDriverAndPassenger: true,
};

export const useRouteOptimization = (userIdOrToken: string | null, maybeUserId?: string): UseRouteOptimizationReturn => {
  const userId = maybeUserId || userIdOrToken || 'guest';
  const [currentRoute, setCurrentRoute] = useState<OptimizedRoute | null>(null);
  const [routes, setRoutes] = useState<OptimizedRoute[]>([]);
  const [config, setConfig] = useState<NavigationConfig>(DEFAULT_CONFIG);
  const [history, setHistory] = useState<RouteHistory[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    initializeRouteData();
  }, [userId]);

  const initializeRouteData = async () => {
    try {
      const storedConfig = await AsyncStorage.getItem(`route_config_${userId}`);
      if (storedConfig) {setConfig(JSON.parse(storedConfig));}
      const storedHistory = await AsyncStorage.getItem(`route_history_${userId}`);
      if (storedHistory) {setHistory(JSON.parse(storedHistory));}
    } catch (error) {
      console.error('Failed to initialize route data:', error);
    }
  };

  const calculateOptimizedRoute = useCallback(
    async (points: RoutePoint[]): Promise<OptimizedRoute> => {
      setLoading(true);
      const sortedPoints = [...points].sort((a, b) => a.order - b.order);
      let totalDistance = 0;
      let totalTime = 0;
      for (let i = 0; i < sortedPoints.length - 1; i++) {
        const distance = calculateHaversineDistance(sortedPoints[i].location, sortedPoints[i + 1].location);
        totalDistance += distance;
        totalTime += (distance / 40) * 60;
      }
      const estimatedFare = 50 + totalDistance * 15;
      const originalDistance = totalDistance * 1.12;
      const savedDistance = Math.max(0, originalDistance - totalDistance);
      const trafficLevel = Math.random() < 0.4 ? 'low' : Math.random() < 0.75 ? 'moderate' : 'heavy';
      const stops: Stop[] = sortedPoints.map((point) => ({
        ...point,
        address: point.address || point.location.address,
        passengerName: point.passengerName || 'Passenger',
        passengerPhone: point.passengerPhone || '',
        status: point.status || 'pending',
      }));
      const optimizedRoute: OptimizedRoute = {
        id: `route_${Date.now()}`,
        points: sortedPoints,
        stops,
        totalDistance,
        totalTime,
        estimatedDuration: Math.round(totalTime * 60),
        estimatedFare,
        trafficLevel,
        traffic: {
          level: trafficLevel === 'heavy' ? 'high' : trafficLevel,
          delay: trafficLevel === 'heavy' ? 12 : trafficLevel === 'moderate' ? 6 : 1,
        },
        optimization: {
          originalDistance,
          savedDistance,
          percentageOptimized: originalDistance > 0 ? (savedDistance / originalDistance) * 100 : 0,
        },
        carbonFootprint: totalDistance * 0.21,
        savings: { timeMinutes: Math.round(Math.random() * 10), costPercentage: Math.round(Math.random() * 15) },
        createdAt: Date.now(),
      };
      setRoutes([...routes, optimizedRoute]);
      setCurrentRoute(optimizedRoute);
      setLoading(false);
      return optimizedRoute;
    },
    [routes],
  );

  const optimizeRoute = useCallback((stops: Stop[]) => calculateOptimizedRoute(stops), [calculateOptimizedRoute]);

  const updateRoute = useCallback(async (route: OptimizedRoute) => {
    const updated = routes.map((r) => (r.id === route.id ? route : r));
    setRoutes(updated);
    await AsyncStorage.setItem(`route_optimization_${userId}`, JSON.stringify(updated));
  }, [routes, userId]);

  const selectRoute = useCallback(async (route: OptimizedRoute) => {
    setCurrentRoute(route);
    await AsyncStorage.setItem(`route_current_${userId}`, JSON.stringify(route));
  }, [userId]);

  const updateStopStatus = useCallback(
    async (routeId: string, stopId: string, status: Stop['status']) => {
      const patchRoute = (route: OptimizedRoute): OptimizedRoute =>
        route.id === routeId
          ? {
              ...route,
              stops: route.stops.map((stop) => (stop.id === stopId ? { ...stop, status } : stop)),
            }
          : route;
      setRoutes((prev) => prev.map(patchRoute));
      setCurrentRoute((route) => (route ? patchRoute(route) : route));
      return true;
    },
    [],
  );

  const getNavigationSteps = useCallback(
    async (routeId: string): Promise<NavigationStep[]> => {
      const route = routes.find((item) => item.id === routeId) || currentRoute;
      const stops = route?.stops || [];
      return stops.map((stop, index) => ({
        instruction: `${index === 0 ? 'Start at' : 'Continue to'} ${stop.address}`,
        distance: Math.round((stop.distance || 0.8) * 1000),
        duration: Math.round((stop.eta || 4) * 60),
      }));
    },
    [currentRoute, routes],
  );

  const updateConfig = useCallback(async (newConfig: Partial<NavigationConfig>) => {
    const updated = { ...config, ...newConfig };
    setConfig(updated);
    await AsyncStorage.setItem(`route_config_${userId}`, JSON.stringify(updated));
  }, [config, userId]);

  const startNavigation = useCallback(async (route: OptimizedRoute) => {
    await selectRoute(route);
  }, [selectRoute]);

  const endNavigation = useCallback(
    async (distance: number, time: number, fare: number, feedback?: string) => {
      if (!currentRoute) {throw new Error('No active route');}
      const item: RouteHistory = { id: `h_${Date.now()}`, route: currentRoute, usedAt: Date.now(), actualDistance: distance, actualTime: time, actualFare: fare, feedback };
      const updated = [...history, item];
      setHistory(updated);
      await AsyncStorage.setItem(`route_history_${userId}`, JSON.stringify(updated));
      setCurrentRoute(null);
    },
    [currentRoute, history, userId],
  );

  const getRouteHistory = useCallback(async (): Promise<RouteHistory[]> => {
    const stored = await AsyncStorage.getItem(`route_history_${userId}`);
    return stored ? JSON.parse(stored) : [];
  }, [userId]);

  const getEcoScore = useCallback((route: OptimizedRoute): number => {
    return Math.round(50 + Math.max(0, 30 - route.totalDistance / 10) + (route.trafficLevel === 'low' ? 15 : 5));
  }, []);

  const compareRoutes = useCallback(
    async (routesToCompare: OptimizedRoute[]): Promise<OptimizedRoute> => {
      if (!routesToCompare.length) {throw new Error('No routes');}
      if (config.preferredRouteType === 'eco') {return routesToCompare.reduce((a, b) => (getEcoScore(b) > getEcoScore(a) ? b : a));}
      if (config.preferredRouteType === 'shortest') {return routesToCompare.reduce((a, b) => (b.totalDistance < a.totalDistance ? b : a));}
      return routesToCompare.reduce((a, b) => (b.totalTime < a.totalTime ? b : a));
    },
    [config, getEcoScore],
  );

  return { currentRoute, routes, config, history, calculateOptimizedRoute, optimizeRoute, updateRoute, updateStopStatus, selectRoute, updateConfig, startNavigation, endNavigation, getNavigationSteps, getRouteHistory, getEcoScore, compareRoutes, loading };
};

function calculateHaversineDistance(loc1: Location, loc2: Location): number {
  const R = 6371;
  const dLat = ((loc2.lat - loc1.lat) * Math.PI) / 180;
  const dLng = ((loc2.lng - loc1.lng) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos((loc1.lat * Math.PI) / 180) * Math.cos((loc2.lat * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
