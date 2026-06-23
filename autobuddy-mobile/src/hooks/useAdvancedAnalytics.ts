import { useState, useCallback } from 'react';
import axios from 'axios';

export interface AnalyticsReport {
  id: string;
  userId: string;
  type: 'ride' | 'revenue' | 'performance' | 'custom';
  title: string;
  description: string;
  metrics: {
    [key: string]: number | string;
  };
  period: {
    startDate: Date;
    endDate: Date;
  };
  generatedAt: Date;
  format: 'summary' | 'detailed' | 'export';
}

export interface AnalyticsMetric {
  name: string;
  value: number;
  trend: number;
  comparison: string;
}

interface UseAdvancedAnalyticsReturn {
  reports: AnalyticsReport[];
  metrics: AnalyticsMetric[];
  loading: boolean;
  error: Error | null;
  fetchReports: (userId: string, type?: string) => Promise<void>;
  generateReport: (type: string, startDate: Date, endDate: Date, format: string) => Promise<boolean>;
  deleteReport: (reportId: string) => Promise<boolean>;
  exportReport: (reportId: string, format: 'pdf' | 'csv' | 'xlsx') => Promise<Blob | null>;
  getMetricsForPeriod: (startDate: Date, endDate: Date) => Promise<void>;
  getComparisonAnalysis: (metric: string, period1: [Date, Date], period2: [Date, Date]) => any;
  scheduleReportGeneration: (type: string, frequency: 'daily' | 'weekly' | 'monthly') => Promise<boolean>;
}

export const useAdvancedAnalytics = (token: string | null): UseAdvancedAnalyticsReturn => {
  const [reports, setReports] = useState<AnalyticsReport[]>([]);
  const [metrics, setMetrics] = useState<AnalyticsMetric[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

  const fetchReports = useCallback(
    async (userId: string, type?: string) => {
      if (!token) {return;}
      setLoading(true);
      try {
        const params = type ? { type } : {};
        const response = await axios.get(
          `${API_BASE_URL}/analytics/reports/${userId}`,
          {
            params,
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setReports(response.data || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch reports'));
      } finally {
        setLoading(false);
      }
    },
    [token, API_BASE_URL]
  );

  const generateReport = useCallback(
    async (type: string, startDate: Date, endDate: Date, format: string): Promise<boolean> => {
      if (!token) {return false;}
      try {
        const response = await axios.post(
          `${API_BASE_URL}/analytics/reports/generate`,
          { type, startDate, endDate, format },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setReports((prev) => [response.data, ...prev]);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to generate report'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const deleteReport = useCallback(
    async (reportId: string): Promise<boolean> => {
      if (!token) {return false;}
      try {
        await axios.delete(`${API_BASE_URL}/analytics/reports/${reportId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setReports((prev) => prev.filter((r) => r.id !== reportId));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to delete report'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const exportReport = useCallback(
    async (reportId: string, format: 'pdf' | 'csv' | 'xlsx'): Promise<Blob | null> => {
      if (!token) {return null;}
      try {
        const response = await axios.get(
          `${API_BASE_URL}/analytics/reports/${reportId}/export`,
          {
            params: { format },
            headers: { Authorization: `Bearer ${token}` },
            responseType: 'blob',
          }
        );
        return response.data;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to export report'));
        return null;
      }
    },
    [token, API_BASE_URL]
  );

  const getMetricsForPeriod = useCallback(
    async (startDate: Date, endDate: Date) => {
      if (!token) {return;}
      try {
        const response = await axios.get(
          `${API_BASE_URL}/analytics/metrics`,
          {
            params: { startDate, endDate },
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setMetrics(response.data || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch metrics'));
      }
    },
    [token, API_BASE_URL]
  );

  const getComparisonAnalysis = useCallback(
    (metric: string, period1: [Date, Date], period2: [Date, Date]) => {
      return { metric, period1, period2, comparison: 'analysis' };
    },
    []
  );

  const scheduleReportGeneration = useCallback(
    async (type: string, frequency: 'daily' | 'weekly' | 'monthly'): Promise<boolean> => {
      if (!token) {return false;}
      try {
        await axios.post(
          `${API_BASE_URL}/analytics/reports/schedule`,
          { type, frequency },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to schedule report'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  return {
    reports,
    metrics,
    loading,
    error,
    fetchReports,
    generateReport,
    deleteReport,
    exportReport,
    getMetricsForPeriod,
    getComparisonAnalysis,
    scheduleReportGeneration,
  };
};
