import { useRef, useCallback, useEffect } from 'react';
import axios from 'axios';

export interface PerformanceMetric {
  name: string;
  duration: number;
  timestamp: Date;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

export interface AppPerformanceStats {
  avgResponseTime: number;
  totalRequests: number;
  successRate: number;
  errorCount: number;
  slowRequests: number;
  metrics: PerformanceMetric[];
}

interface UsePerformanceMonitoringReturn {
  recordMetric: (name: string, duration: number, success: boolean, error?: string) => void;
  recordApiCall: (endpoint: string, duration: number, statusCode: number) => void;
  recordScreenNavigation: (screenName: string, duration: number) => void;
  recordRendering: (componentName: string, duration: number) => void;
  getStats: () => AppPerformanceStats;
  clearMetrics: () => void;
  reportMetrics: (userId: string) => Promise<boolean>;
  getSlowMetrics: (threshold?: number) => PerformanceMetric[];
}

export const usePerformanceMonitoring = (token: string | null): UsePerformanceMonitoringReturn => {
  const metricsRef = useRef<PerformanceMetric[]>([]);
  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
  const MAX_METRICS = 500;

  const recordMetric = useCallback(
    (name: string, duration: number, success: boolean, error?: string) => {
      const metric: PerformanceMetric = {
        name,
        duration,
        timestamp: new Date(),
        success,
        error,
      };

      metricsRef.current.push(metric);

      if (metricsRef.current.length > MAX_METRICS) {
        metricsRef.current = metricsRef.current.slice(-MAX_METRICS);
      }
    },
    []
  );

  const recordApiCall = useCallback(
    (endpoint: string, duration: number, statusCode: number) => {
      const success = statusCode >= 200 && statusCode < 300;
      const error = !success ? `HTTP ${statusCode}` : undefined;

      recordMetric(`API: ${endpoint}`, duration, success, error);
    },
    [recordMetric]
  );

  const recordScreenNavigation = useCallback(
    (screenName: string, duration: number) => {
      recordMetric(`Navigation: ${screenName}`, duration, true);
    },
    [recordMetric]
  );

  const recordRendering = useCallback(
    (componentName: string, duration: number) => {
      const slow = duration > 16;
      recordMetric(`Render: ${componentName}`, duration, !slow, slow ? 'Slow render' : undefined);
    },
    [recordMetric]
  );

  const getStats = useCallback((): AppPerformanceStats => {
    const metrics = metricsRef.current;

    if (metrics.length === 0) {
      return {
        avgResponseTime: 0,
        totalRequests: 0,
        successRate: 0,
        errorCount: 0,
        slowRequests: 0,
        metrics: [],
      };
    }

    const totalRequests = metrics.length;
    const successCount = metrics.filter((m) => m.success).length;
    const errorCount = totalRequests - successCount;
    const avgResponseTime =
      metrics.reduce((sum, m) => sum + m.duration, 0) / totalRequests;
    const slowRequests = metrics.filter((m) => m.duration > 1000).length;

    return {
      avgResponseTime,
      totalRequests,
      successRate: (successCount / totalRequests) * 100,
      errorCount,
      slowRequests,
      metrics,
    };
  }, []);

  const clearMetrics = useCallback(() => {
    metricsRef.current = [];
  }, []);

  const reportMetrics = useCallback(
    async (userId: string): Promise<boolean> => {
      if (!token) return false;

      try {
        const stats = getStats();
        await axios.post(
          `${API_BASE_URL}/performance/report`,
          {
            userId,
            stats: {
              avgResponseTime: stats.avgResponseTime,
              totalRequests: stats.totalRequests,
              successRate: stats.successRate,
              errorCount: stats.errorCount,
              slowRequests: stats.slowRequests,
              timestamp: new Date(),
            },
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return true;
      } catch (err) {
        console.error('Failed to report performance metrics:', err);
        return false;
      }
    },
    [token, getStats, API_BASE_URL]
  );

  const getSlowMetrics = useCallback(
    (threshold: number = 1000): PerformanceMetric[] => {
      return metricsRef.current.filter((m) => m.duration > threshold);
    },
    []
  );

  return {
    recordMetric,
    recordApiCall,
    recordScreenNavigation,
    recordRendering,
    getStats,
    clearMetrics,
    reportMetrics,
    getSlowMetrics,
  };
};
