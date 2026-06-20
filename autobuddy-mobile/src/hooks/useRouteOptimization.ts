import { useState, useCallback } from 'react';
import axios, { AxiosError } from 'axios';

// Logging utility
const LOG_ROUTE_OPTIMIZATION = true;
const logRouteOpt = (message: string, data?: any) => {
  if (LOG_ROUTE_OPTIMIZATION && typeof console !== 'undefined') {
    console.log(`[useRouteOptimization] ${message}`, data || '');
  }
};

const logRouteOptError = (message: string, error?: any) => {
  if (typeof console !== 'undefined') {
    console.error(`[useRouteOptimization ERROR] ${message}`, error || '');
  }
};

// Validation functions
const validateOptimizedRoute = (route: any): route is OptimizedRoute => {
  if (!route || typeof route !== 'object') {
    logRouteOptError('Route validation failed: not an object', route);
    return false;
  }

  const requiredFields = ['id', 'stops', 'totalDistance', 'estimatedDuration', 'traffic'];
  for (const field of requiredFields) {
    if (!(field in route)) {
      logRouteOptError(`Route validation failed: missing field '${field}'`);
      return false;
    }
  }

  // Validate stops array
  if (!Array.isArray(route.stops)) {
    logRouteOptError('Route validation failed: stops is not an array');
    return false;
  }

  for (const stop of route.stops) {
    if (!stop.id || !stop.type || !stop.location || !stop.status) {
      logRouteOptError('Route validation failed: invalid stop structure', stop);
      return false;
    }
  }

  // Validate traffic data
  if (!route.traffic || !route.traffic.level || typeof route.traffic.delay !== 'number') {
    logRouteOptError('Route validation failed: invalid traffic data', route.traffic);
    return false;
  }

  return true;
};

const validateNavigationStep = (step: any): step is NavigationStep => {
  return (
    step &&
    typeof step === 'object' &&
    typeof step.instruction === 'string' &&
    typeof step.distance === 'number' &&
    typeof step.duration === 'number'
  );
};

// Retry logic
const executeWithRetry = async (
  fn: () => Promise<any>,
  maxRetries = 2,
  delayMs = 1000
): Promise<any> => {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = delayMs * Math.pow(2, attempt);
        logRouteOpt(`Retry attempt ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  throw lastError;
};

// Enhanced Axios instance with timeout
const createAxiosClient = () =>
  axios.create({
    timeout: 30000, // 30 second timeout
  });

export interface Stop {
  id: string;
  type: 'pickup' | 'dropoff';
  location: { lat: number; lng: number };
  address: string;
  passengerName: string;
  passengerPhone: string;
  estimatedArrival?: Date;
  status: 'pending' | 'completed' | 'cancelled';
}

export interface OptimizedRoute {
  id: string;
  stops: Stop[];
  totalDistance: number;
  estimatedDuration: number;
  estimatedFare: number;
  polyline: string;
  optimization: {
    originalDistance: number;
    savedDistance: number;
    percentageOptimized: number;
  };
  traffic: {
    level: 'low' | 'moderate' | 'high' | 'severe';
    delay: number;
  };
}

export interface NavigationStep {
  instruction: string;
  distance: number;
  duration: number;
  maneuver: string;
}

interface UseRouteOptimizationReturn {
  currentRoute: OptimizedRoute | null;
  routes: OptimizedRoute[];
  navigationSteps: NavigationStep[];
  loading: boolean;
  error: Error | null;
  optimizeRoute: (stops: Stop[], vehicleCapacity?: number) => Promise<OptimizedRoute | null>;
  getAlternativeRoutes: (stops: Stop[], count?: number) => Promise<OptimizedRoute[]>;
  updateStopStatus: (routeId: string, stopId: string, status: Stop['status']) => Promise<boolean>;
  getNavigationSteps: (routeId: string) => Promise<NavigationStep[]>;
  estimateFare: (distance: number, duration: number, surgeMultiplier?: number) => Promise<number>;
  getTrafficUpdate: (routeId: string) => Promise<any>;
  addStopToRoute: (routeId: string, stop: Stop) => Promise<OptimizedRoute | null>;
  removeStopFromRoute: (routeId: string, stopId: string) => Promise<OptimizedRoute | null>;
  reorderStops: (routeId: string, newOrder: string[]) => Promise<OptimizedRoute | null>;
}

export const useRouteOptimization = (token: string | null, driverId: string): UseRouteOptimizationReturn => {
  const [currentRoute, setCurrentRoute] = useState<OptimizedRoute | null>(null);
  const [routes, setRoutes] = useState<OptimizedRoute[]>([]);
  const [navigationSteps, setNavigationSteps] = useState<NavigationStep[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

  const optimizeRoute = useCallback(
    async (stops: Stop[], vehicleCapacity = 4): Promise<OptimizedRoute | null> => {
      if (!token) return null;
      setLoading(true);
      try {
        const response = await executeWithRetry(() =>
          axios.post(
            `${API_BASE_URL}/routes/optimize`,
            { driverId, stops, vehicleCapacity },
            { headers: { Authorization: `Bearer ${token}` } }
          )
        );
        const optimizedRoute = response.data;
        if (!validateOptimizedRoute(optimizedRoute)) {
          throw new Error('Invalid route response structure');
        }
        logRouteOpt('Route optimized successfully', {
          distance: optimizedRoute.totalDistance,
          duration: optimizedRoute.estimatedDuration,
          stops: optimizedRoute.stops.length,
          traffic: optimizedRoute.traffic.level
        });
        setCurrentRoute(optimizedRoute);
        return optimizedRoute;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to optimize route');
        logRouteOptError('Failed to optimize route', error);
        setError(error);
        return null;
      } finally {
        setLoading(false);
      }
    },
    [token, driverId, API_BASE_URL]
  );

  const getAlternativeRoutes = useCallback(
    async (stops: Stop[], count = 3): Promise<OptimizedRoute[]> => {
      if (!token) return [];
      try {
        const response = await executeWithRetry(() =>
          axios.post(
            `${API_BASE_URL}/routes/alternatives`,
            { driverId, stops, count },
            { headers: { Authorization: `Bearer ${token}` } }
          )
        );
        const altRoutes = response.data;
        if (!Array.isArray(altRoutes)) {
          throw new Error('Alternative routes response is not an array');
        }
        const validRoutes = altRoutes.filter((route) => {
          if (!validateOptimizedRoute(route)) {
            logRouteOptError('Invalid alternative route skipped', route);
            return false;
          }
          return true;
        });
        logRouteOpt(`Retrieved ${validRoutes.length}/${altRoutes.length} alternative routes`);
        setRoutes(validRoutes);
        return validRoutes;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to fetch alternative routes');
        logRouteOptError('Failed to fetch alternative routes', error);
        setError(error);
        return [];
      }
    },
    [token, driverId, API_BASE_URL]
  );

  const updateStopStatus = useCallback(
    async (routeId: string, stopId: string, status: Stop['status']): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.put(
          `${API_BASE_URL}/routes/${routeId}/stops/${stopId}`,
          { status },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (currentRoute?.id === routeId) {
          setCurrentRoute((prev) =>
            prev
              ? {
                  ...prev,
                  stops: prev.stops.map((s) =>
                    s.id === stopId ? { ...s, status } : s
                  ),
                }
              : null
          );
        }

        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update stop'));
        return false;
      }
    },
    [token, API_BASE_URL, currentRoute]
  );

  const getNavigationSteps = useCallback(
    async (routeId: string): Promise<NavigationStep[]> => {
      if (!token) return [];
      try {
        const response = await executeWithRetry(() =>
          axios.get(
            `${API_BASE_URL}/routes/${routeId}/navigation`,
            { headers: { Authorization: `Bearer ${token}` } }
          )
        );
        const steps = response.data;
        if (!Array.isArray(steps)) {
          throw new Error('Navigation steps response is not an array');
        }
        const validSteps = steps.filter((step) => {
          if (!validateNavigationStep(step)) {
            logRouteOptError('Invalid navigation step skipped', step);
            return false;
          }
          return true;
        });
        logRouteOpt(`Retrieved ${validSteps.length}/${steps.length} navigation steps`);
        setNavigationSteps(validSteps);
        return validSteps;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to fetch navigation steps');
        logRouteOptError('Failed to fetch navigation steps', error);
        setError(error);
        return [];
      }
    },
    [token, API_BASE_URL]
  );

  const estimateFare = useCallback(
    async (distance: number, duration: number, surgeMultiplier = 1): Promise<number> => {
      try {
        const response = await executeWithRetry(() =>
          axios.post(
            `${API_BASE_URL}/fares/estimate`,
            { distance, duration, surgeMultiplier },
            { headers: { Authorization: `Bearer ${token}` } }
          )
        );
        const fare = response.data.fare;
        if (typeof fare !== 'number' || fare < 0) {
          throw new Error('Invalid fare value in response');
        }
        logRouteOpt('Fare estimated', { distance, duration, fare });
        return fare;
      } catch (err) {
        logRouteOptError('Fare estimation failed, using fallback', err);
        return distance * 15 + (duration / 60) * 2;
      }
    },
    [token, API_BASE_URL]
  );

  const getTrafficUpdate = useCallback(
    async (routeId: string): Promise<any> => {
      if (!token) return null;
      try {
        const response = await executeWithRetry(() =>
          axios.get(
            `${API_BASE_URL}/routes/${routeId}/traffic`,
            { headers: { Authorization: `Bearer ${token}` } }
          )
        );
        const traffic = response.data;
        if (!traffic || !traffic.level || typeof traffic.delay !== 'number') {
          logRouteOptError('Invalid traffic data structure', traffic);
          return null;
        }
        logRouteOpt('Traffic update received', { level: traffic.level, delay: traffic.delay });
        return traffic;
      } catch (err) {
        logRouteOptError('Failed to fetch traffic update', err);
        return null;
      }
    },
    [token, API_BASE_URL]
  );

  const addStopToRoute = useCallback(
    async (routeId: string, stop: Stop): Promise<OptimizedRoute | null> => {
      if (!token) return null;
      try {
        const response = await executeWithRetry(() =>
          axios.post(
            `${API_BASE_URL}/routes/${routeId}/stops`,
            stop,
            { headers: { Authorization: `Bearer ${token}` } }
          )
        );
        const updatedRoute = response.data;
        if (!validateOptimizedRoute(updatedRoute)) {
          throw new Error('Invalid route response after adding stop');
        }
        logRouteOpt('Stop added to route', { stopId: stop.id, totalStops: updatedRoute.stops.length });
        if (currentRoute?.id === routeId) {
          setCurrentRoute(updatedRoute);
        }
        return updatedRoute;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to add stop');
        logRouteOptError('Failed to add stop', error);
        setError(error);
        return null;
      }
    },
    [token, API_BASE_URL, currentRoute]
  );

  const removeStopFromRoute = useCallback(
    async (routeId: string, stopId: string): Promise<OptimizedRoute | null> => {
      if (!token) return null;
      try {
        const response = await executeWithRetry(() =>
          axios.delete(
            `${API_BASE_URL}/routes/${routeId}/stops/${stopId}`,
            { headers: { Authorization: `Bearer ${token}` } }
          )
        );
        const updatedRoute = response.data;
        if (!validateOptimizedRoute(updatedRoute)) {
          throw new Error('Invalid route response after removing stop');
        }
        logRouteOpt('Stop removed from route', { stopId, totalStops: updatedRoute.stops.length });
        if (currentRoute?.id === routeId) {
          setCurrentRoute(updatedRoute);
        }
        return updatedRoute;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to remove stop');
        logRouteOptError('Failed to remove stop', error);
        setError(error);
        return null;
      }
    },
    [token, API_BASE_URL, currentRoute]
  );

  const reorderStops = useCallback(
    async (routeId: string, newOrder: string[]): Promise<OptimizedRoute | null> => {
      if (!token) return null;
      try {
        const response = await executeWithRetry(() =>
          axios.put(
            `${API_BASE_URL}/routes/${routeId}/reorder`,
            { stopOrder: newOrder },
            { headers: { Authorization: `Bearer ${token}` } }
          )
        );
        const updatedRoute = response.data;
        if (!validateOptimizedRoute(updatedRoute)) {
          throw new Error('Invalid route response after reordering stops');
        }
        logRouteOpt('Stops reordered', { newOrder, totalStops: updatedRoute.stops.length });
        if (currentRoute?.id === routeId) {
          setCurrentRoute(updatedRoute);
        }
        return updatedRoute;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to reorder stops');
        logRouteOptError('Failed to reorder stops', error);
        setError(error);
        return null;
      }
    },
    [token, API_BASE_URL, currentRoute]
  );

  return {
    currentRoute,
    routes,
    navigationSteps,
    loading,
    error,
    optimizeRoute,
    getAlternativeRoutes,
    updateStopStatus,
    getNavigationSteps,
    estimateFare,
    getTrafficUpdate,
    addStopToRoute,
    removeStopFromRoute,
    reorderStops,
  };
};
