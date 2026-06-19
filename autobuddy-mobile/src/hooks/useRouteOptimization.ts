import { useState, useCallback } from 'react';
import axios from 'axios';

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
        const response = await axios.post(
          `${API_BASE_URL}/routes/optimize`,
          { driverId, stops, vehicleCapacity },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const optimizedRoute = response.data;
        setCurrentRoute(optimizedRoute);
        return optimizedRoute;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to optimize route'));
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
        const response = await axios.post(
          `${API_BASE_URL}/routes/alternatives`,
          { driverId, stops, count },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const altRoutes = response.data;
        setRoutes(altRoutes);
        return altRoutes;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch alternative routes'));
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
        const response = await axios.get(
          `${API_BASE_URL}/routes/${routeId}/navigation`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setNavigationSteps(response.data);
        return response.data;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch navigation steps'));
        return [];
      }
    },
    [token, API_BASE_URL]
  );

  const estimateFare = useCallback(
    async (distance: number, duration: number, surgeMultiplier = 1): Promise<number> => {
      try {
        const response = await axios.post(
          `${API_BASE_URL}/fares/estimate`,
          { distance, duration, surgeMultiplier },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return response.data.fare || 0;
      } catch (err) {
        return distance * 15 + (duration / 60) * 2;
      }
    },
    [token, API_BASE_URL]
  );

  const getTrafficUpdate = useCallback(
    async (routeId: string): Promise<any> => {
      if (!token) return null;
      try {
        const response = await axios.get(
          `${API_BASE_URL}/routes/${routeId}/traffic`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return response.data;
      } catch (err) {
        return null;
      }
    },
    [token, API_BASE_URL]
  );

  const addStopToRoute = useCallback(
    async (routeId: string, stop: Stop): Promise<OptimizedRoute | null> => {
      if (!token) return null;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/routes/${routeId}/stops`,
          stop,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const updatedRoute = response.data;
        if (currentRoute?.id === routeId) {
          setCurrentRoute(updatedRoute);
        }
        return updatedRoute;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to add stop'));
        return null;
      }
    },
    [token, API_BASE_URL, currentRoute]
  );

  const removeStopFromRoute = useCallback(
    async (routeId: string, stopId: string): Promise<OptimizedRoute | null> => {
      if (!token) return null;
      try {
        const response = await axios.delete(
          `${API_BASE_URL}/routes/${routeId}/stops/${stopId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const updatedRoute = response.data;
        if (currentRoute?.id === routeId) {
          setCurrentRoute(updatedRoute);
        }
        return updatedRoute;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to remove stop'));
        return null;
      }
    },
    [token, API_BASE_URL, currentRoute]
  );

  const reorderStops = useCallback(
    async (routeId: string, newOrder: string[]): Promise<OptimizedRoute | null> => {
      if (!token) return null;
      try {
        const response = await axios.put(
          `${API_BASE_URL}/routes/${routeId}/reorder`,
          { stopOrder: newOrder },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const updatedRoute = response.data;
        if (currentRoute?.id === routeId) {
          setCurrentRoute(updatedRoute);
        }
        return updatedRoute;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to reorder stops'));
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
