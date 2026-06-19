import { useState, useCallback } from 'react';
import axios from 'axios';

export interface PerformanceMetric {
  date: Date;
  ridesCompleted: number;
  totalEarnings: number;
  rating: number;
  acceptanceRate: number;
  cancellationRate: number;
  completionRate: number;
  averageRideDistance: number;
  averageRideTime: number;
}

export interface InsightAnalysis {
  type: 'trend' | 'anomaly' | 'opportunity' | 'warning';
  title: string;
  description: string;
  metric: string;
  value: number;
  comparison?: number;
  recommendation: string;
  priority: 'low' | 'medium' | 'high';
}

interface UseDriverPerformanceInsightsReturn {
  metrics: PerformanceMetric[];
  insights: InsightAnalysis[];
  currentStats: {
    totalRides: number;
    totalEarnings: number;
    avgRating: number;
    acceptanceRate: number;
  } | null;
  loading: boolean;
  error: Error | null;
  fetchMetrics: (days?: number) => Promise<void>;
  fetchInsights: () => Promise<void>;
  getPerformanceTrend: (metric: string, days?: number) => number;
  getTopPerformanceDay: () => PerformanceMetric | null;
  getAverageMetrics: () => any;
  compareWithPeriod: (startDate: Date, endDate: Date) => any;
  getGoalProgress: () => any;
}

export const useDriverPerformanceInsights = (token: string | null, driverId: string): UseDriverPerformanceInsightsReturn => {
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [insights, setInsights] = useState<InsightAnalysis[]>([]);
  const [currentStats, setCurrentStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

  const fetchMetrics = useCallback(
    async (days = 30) => {
      if (!token) return;
      setLoading(true);
      try {
        const response = await axios.get(
          `${API_BASE_URL}/drivers/${driverId}/performance/metrics`,
          {
            params: { days },
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setMetrics(response.data.metrics || []);
        setCurrentStats(response.data.current || null);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch metrics'));
      } finally {
        setLoading(false);
      }
    },
    [token, driverId, API_BASE_URL]
  );

  const fetchInsights = useCallback(async () => {
    if (!token) return;
    try {
      const response = await axios.get(
        `${API_BASE_URL}/drivers/${driverId}/performance/insights`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setInsights(response.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch insights'));
    }
  }, [token, driverId, API_BASE_URL]);

  const getPerformanceTrend = useCallback(
    (metric: string, days = 7): number => {
      if (metrics.length < 2) return 0;
      const recentMetrics = metrics.slice(-days);
      if (recentMetrics.length < 2) return 0;

      const first = (recentMetrics[0] as any)[metric] || 0;
      const last = (recentMetrics[recentMetrics.length - 1] as any)[metric] || 0;
      if (first === 0) return 0;

      return ((last - first) / first) * 100;
    },
    [metrics]
  );

  const getTopPerformanceDay = useCallback((): PerformanceMetric | null => {
    if (metrics.length === 0) return null;
    return metrics.reduce((best, current) =>
      current.totalEarnings > (best?.totalEarnings || 0) ? current : best
    );
  }, [metrics]);

  const getAverageMetrics = useCallback(() => {
    if (metrics.length === 0) return null;

    const avgRating = metrics.reduce((sum, m) => sum + m.rating, 0) / metrics.length;
    const avgAcceptance = metrics.reduce((sum, m) => sum + m.acceptanceRate, 0) / metrics.length;
    const avgCancellation = metrics.reduce((sum, m) => sum + m.cancellationRate, 0) / metrics.length;
    const totalEarnings = metrics.reduce((sum, m) => sum + m.totalEarnings, 0);
    const totalRides = metrics.reduce((sum, m) => sum + m.ridesCompleted, 0);

    return {
      avgRating: avgRating.toFixed(2),
      avgAcceptance: avgAcceptance.toFixed(1),
      avgCancellation: avgCancellation.toFixed(1),
      totalEarnings: totalEarnings.toFixed(0),
      totalRides,
      avgEarningsPerRide: (totalEarnings / totalRides).toFixed(0),
    };
  }, [metrics]);

  const compareWithPeriod = useCallback(
    (startDate: Date, endDate: Date) => {
      const periodMetrics = metrics.filter(
        (m) => new Date(m.date) >= startDate && new Date(m.date) <= endDate
      );

      if (periodMetrics.length === 0) return null;

      const periodAvgRating = periodMetrics.reduce((sum, m) => sum + m.rating, 0) / periodMetrics.length;
      const periodTotalEarnings = periodMetrics.reduce((sum, m) => sum + m.totalEarnings, 0);
      const periodTotalRides = periodMetrics.reduce((sum, m) => sum + m.ridesCompleted, 0);

      return {
        periodDays: periodMetrics.length,
        avgRating: periodAvgRating.toFixed(2),
        totalEarnings: periodTotalEarnings.toFixed(0),
        totalRides: periodTotalRides,
      };
    },
    [metrics]
  );

  const getGoalProgress = useCallback(() => {
    const last7Days = metrics.slice(-7);
    if (last7Days.length === 0) return null;

    const totalRides = last7Days.reduce((sum, m) => sum + m.ridesCompleted, 0);
    const avgRating = last7Days.reduce((sum, m) => sum + m.rating, 0) / last7Days.length;

    const rideGoal = 50;
    const ratingGoal = 4.5;

    return {
      rides: {
        current: totalRides,
        goal: rideGoal,
        progress: (totalRides / rideGoal) * 100,
      },
      rating: {
        current: avgRating.toFixed(2),
        goal: ratingGoal,
        progress: (avgRating / ratingGoal) * 100,
      },
    };
  }, [metrics]);

  return {
    metrics,
    insights,
    currentStats,
    loading,
    error,
    fetchMetrics,
    fetchInsights,
    getPerformanceTrend,
    getTopPerformanceDay,
    getAverageMetrics,
    compareWithPeriod,
    getGoalProgress,
  };
};
