import { useEffect, useState, useCallback } from 'react';
import { apiRequest } from '../lib/api-client';

export interface OperatorError {
  message: string;
  code?: string;
  status?: number;
}

export interface FleetStatsData {
  driversOnline: number;
  driversTotal: number;
  activeRides: number;
  avgRating: number;
  utilizationRate: number;
  revenue: number;
  costs: number;
  profit: number;
  totalRidesCount: number;
  totalDistance: number;
}

export interface DriverMetrics {
  driverId: string;
  name: string;
  photo?: string;
  status: 'online' | 'offline' | 'on_ride';
  rating: number;
  rideCount: number;
  ridestoday: number;
  earningsToday: number;
  earningsWeek: number;
  attendanceWeek: number;
  acceptanceRate: number;
  avgRatingWeek: number;
  location?: {
    latitude: number;
    longitude: number;
  };
}

export interface OperatorAlert {
  id: string;
  type: 'driver' | 'ride' | 'payment' | 'system';
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  actionUrl?: string;
}

export interface OperatorReport {
  id: string;
  period: string;
  totalRides: number;
  totalEarnings: number;
  totalCosts: number;
  profit: number;
  avgRating: number;
  topDriver?: string;
  bottomDriver?: string;
  generatedAt: Date;
}

/**
 * Hook to fetch real-time fleet statistics
 */
export function useFleetStats(token: string | null) {
  const [stats, setStats] = useState<FleetStatsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<OperatorError | null>(null);

  const fetchStats = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      setError(null);
      const response = await apiRequest<FleetStatsData>(
        '/operators/me/fleet-stats',
        { token }
      );
      setStats(response || null);
    } catch (err: unknown) {
      const apiError = err as any;
      setError({
        message: apiError?.message || 'Failed to fetch fleet stats',
        code: apiError?.code,
        status: apiError?.status,
      });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchStats();

    // Refresh stats every 30 seconds for real-time updates
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}

/**
 * Hook to fetch all drivers and their metrics
 */
export function useDriverMetrics(token: string | null) {
  const [drivers, setDrivers] = useState<DriverMetrics[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<OperatorError | null>(null);

  const fetchDrivers = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      setError(null);
      const response = await apiRequest<DriverMetrics[]>(
        '/operators/me/drivers/metrics',
        { token }
      );
      setDrivers(response || []);
    } catch (err: unknown) {
      const apiError = err as any;
      setError({
        message: apiError?.message || 'Failed to fetch driver metrics',
        code: apiError?.code,
        status: apiError?.status,
      });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDrivers();

    // Refresh every 60 seconds
    const interval = setInterval(fetchDrivers, 60000);
    return () => clearInterval(interval);
  }, [fetchDrivers]);

  const updateDriverIncentive = useCallback(
    async (driverId: string, incentiveAmount: number) => {
      if (!token) return;

      try {
        await apiRequest(`/operators/me/drivers/${driverId}/incentive`, {
          method: 'PUT',
          token,
          body: { incentiveAmount },
        });
        // Refetch drivers to get updated data
        fetchDrivers();
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to update incentive',
          code: apiError?.code,
          status: apiError?.status,
        });
      }
    },
    [token, fetchDrivers]
  );

  return {
    drivers,
    loading,
    error,
    refetch: fetchDrivers,
    updateDriverIncentive,
  };
}

/**
 * Hook to fetch operator alerts
 */
export function useOperatorAlerts(token: string | null) {
  const [alerts, setAlerts] = useState<OperatorAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<OperatorError | null>(null);

  const fetchAlerts = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      setError(null);
      const response = await apiRequest<OperatorAlert[]>(
        '/operators/me/alerts',
        { token }
      );
      setAlerts(response || []);
    } catch (err: unknown) {
      const apiError = err as any;
      setError({
        message: apiError?.message || 'Failed to fetch alerts',
        code: apiError?.code,
        status: apiError?.status,
      });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAlerts();

    // Check for new alerts every 60 seconds
    const interval = setInterval(fetchAlerts, 60000);
    return () => clearInterval(interval);
  }, [fetchAlerts]);

  const dismissAlert = useCallback(
    async (alertId: string) => {
      if (!token) return;

      try {
        await apiRequest(`/operators/me/alerts/${alertId}/dismiss`, {
          method: 'POST',
          token,
        });
        setAlerts(prev => prev.filter(a => a.id !== alertId));
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to dismiss alert',
          code: apiError?.code,
          status: apiError?.status,
        });
      }
    },
    [token]
  );

  return { alerts, loading, error, refetch: fetchAlerts, dismissAlert };
}

/**
 * Hook to manage driver locations for map view
 */
export function useDriverLocations(token: string | null) {
  const [locations, setLocations] = useState<DriverMetrics[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<OperatorError | null>(null);

  useEffect(() => {
    if (!token) return;

    const fetchLocations = async () => {
      try {
        setLoading(true);
        const response = await apiRequest<DriverMetrics[]>(
          '/operators/me/drivers/locations',
          { token }
        );
        setLocations(response || []);
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to fetch locations',
          code: apiError?.code,
          status: apiError?.status,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchLocations();

    // Update locations every 10 seconds for real-time tracking
    const interval = setInterval(fetchLocations, 10000);
    return () => clearInterval(interval);
  }, [token]);

  return { locations, loading, error };
}

/**
 * Hook to generate and fetch operator reports
 */
export function useOperatorReports(token: string | null) {
  const [reports, setReports] = useState<OperatorReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<OperatorError | null>(null);

  const fetchReports = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      setError(null);
      const response = await apiRequest<OperatorReport[]>(
        '/operators/me/reports',
        { token }
      );
      setReports(response || []);
    } catch (err: unknown) {
      const apiError = err as any;
      setError({
        message: apiError?.message || 'Failed to fetch reports',
        code: apiError?.code,
        status: apiError?.status,
      });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const generateReport = useCallback(
    async (period: string) => {
      if (!token) return;

      try {
        setLoading(true);
        const response = await apiRequest<OperatorReport>(
          '/operators/me/reports/generate',
          {
            method: 'POST',
            token,
            body: { period },
          }
        );
        if (response) {
          setReports(prev => [...prev, response]);
        }
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to generate report',
          code: apiError?.code,
          status: apiError?.status,
        });
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  const downloadReport = useCallback(
    async (reportId: string) => {
      if (!token) return;

      try {
        // In real app, this would download the report file
        await apiRequest(`/operators/me/reports/${reportId}/download`, {
          token,
        });
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to download report',
          code: apiError?.code,
          status: apiError?.status,
        });
      }
    },
    [token]
  );

  return {
    reports,
    loading,
    error,
    refetch: fetchReports,
    generateReport,
    downloadReport,
  };
}

/**
 * Hook to manage operator settings and preferences
 */
export function useOperatorSettings(token: string | null) {
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<OperatorError | null>(null);

  const fetchSettings = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      setError(null);
      const response = await apiRequest(
        '/operators/me/settings',
        { token }
      );
      setSettings(response || null);
    } catch (err: unknown) {
      const apiError = err as any;
      setError({
        message: apiError?.message || 'Failed to fetch settings',
        code: apiError?.code,
        status: apiError?.status,
      });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const updateSettings = useCallback(
    async (updates: any) => {
      if (!token) return;

      try {
        setLoading(true);
        const response = await apiRequest(
          '/operators/me/settings',
          {
            method: 'PUT',
            token,
            body: updates,
          }
        );
        setSettings(response || null);
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to update settings',
          code: apiError?.code,
          status: apiError?.status,
        });
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  return { settings, loading, error, updateSettings, refetch: fetchSettings };
}
