import { useEffect, useState, useCallback } from 'react';
import { apiRequest } from '../lib/api-client';

export interface AdminError {
  message: string;
  code?: string;
  status?: number;
}

export interface AdminMetrics {
  activeUsers: number;
  totalUsers: number;
  dailyRevenue: number;
  ridesToday: number;
  avgRating: number;
  newDriversToday: number;
  openTickets: number;
  complianceScore: number;
  chargebackRate: number;
}

export interface SystemHealthStatus {
  apiServer: 'operational' | 'degraded' | 'down';
  database: 'healthy' | 'warning' | 'critical';
  cache: 'operational' | 'degraded' | 'down';
  paymentGateway: 'operational' | 'degraded' | 'down';
  apiUptime: string;
  dbResponseTime: string;
  cacheHitRate: string;
  paymentTransactions: string;
  lastChecked: Date;
}

export interface AdminAlert {
  id: string;
  type: 'system' | 'compliance' | 'fraud' | 'performance';
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: Date;
  actionable: boolean;
}

export interface ComplianceData {
  score: number;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  warningChecks: number;
  details: Array<{
    category: string;
    status: 'pass' | 'fail' | 'warning';
    message: string;
  }>;
}

/**
 * Hook to fetch admin dashboard metrics
 */
export function useAdminMetrics(token: string | null, timeRange: string = '24h') {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AdminError | null>(null);

  const fetchMetrics = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      setError(null);
      const response = await apiRequest<AdminMetrics>(
        `/admin/metrics?timeRange=${timeRange}`,
        { token }
      );
      setMetrics(response || null);
    } catch (err: unknown) {
      const apiError = err as any;
      setError({
        message: apiError?.message || 'Failed to fetch metrics',
        code: apiError?.code,
        status: apiError?.status,
      });
    } finally {
      setLoading(false);
    }
  }, [token, timeRange]);

  useEffect(() => {
    fetchMetrics();

    // Refresh every 60 seconds
    const interval = setInterval(fetchMetrics, 60000);
    return () => clearInterval(interval);
  }, [fetchMetrics]);

  return { metrics, loading, error, refetch: fetchMetrics };
}

/**
 * Hook to fetch system health status
 */
export function useSystemHealth(token: string | null) {
  const [health, setHealth] = useState<SystemHealthStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AdminError | null>(null);

  const fetchHealth = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      setError(null);
      const response = await apiRequest<SystemHealthStatus>(
        '/admin/system/health',
        { token }
      );
      setHealth(response || null);
    } catch (err: unknown) {
      const apiError = err as any;
      setError({
        message: apiError?.message || 'Failed to fetch system health',
        code: apiError?.code,
        status: apiError?.status,
      });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchHealth();

    // Refresh every 30 seconds for real-time health status
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  return { health, loading, error, refetch: fetchHealth };
}

/**
 * Hook to fetch admin alerts
 */
export function useAdminAlerts(token: string | null) {
  const [alerts, setAlerts] = useState<AdminAlert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AdminError | null>(null);

  const fetchAlerts = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      setError(null);
      const response = await apiRequest<AdminAlert[]>(
        '/admin/alerts',
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

  const resolveAlert = useCallback(
    async (alertId: string, resolution: string) => {
      if (!token) return;

      try {
        await apiRequest(`/admin/alerts/${alertId}/resolve`, {
          method: 'POST',
          token,
          body: { resolution },
        });
        setAlerts(prev => prev.filter(a => a.id !== alertId));
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to resolve alert',
          code: apiError?.code,
          status: apiError?.status,
        });
      }
    },
    [token]
  );

  return { alerts, loading, error, refetch: fetchAlerts, resolveAlert };
}

/**
 * Hook to fetch compliance data
 */
export function useComplianceData(token: string | null) {
  const [compliance, setCompliance] = useState<ComplianceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AdminError | null>(null);

  const fetchCompliance = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      setError(null);
      const response = await apiRequest<ComplianceData>(
        '/admin/compliance/status',
        { token }
      );
      setCompliance(response || null);
    } catch (err: unknown) {
      const apiError = err as any;
      setError({
        message: apiError?.message || 'Failed to fetch compliance data',
        code: apiError?.code,
        status: apiError?.status,
      });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchCompliance();

    // Check compliance every 120 seconds
    const interval = setInterval(fetchCompliance, 120000);
    return () => clearInterval(interval);
  }, [fetchCompliance]);

  return { compliance, loading, error, refetch: fetchCompliance };
}

/**
 * Hook to manage system configuration
 */
export function useSystemConfig(token: string | null) {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AdminError | null>(null);

  const fetchConfig = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      setError(null);
      const response = await apiRequest(
        '/admin/system/config',
        { token }
      );
      setConfig(response || null);
    } catch (err: unknown) {
      const apiError = err as any;
      setError({
        message: apiError?.message || 'Failed to fetch configuration',
        code: apiError?.code,
        status: apiError?.status,
      });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const updateConfig = useCallback(
    async (updates: any) => {
      if (!token) return;

      try {
        setLoading(true);
        const response = await apiRequest(
          '/admin/system/config',
          {
            method: 'PUT',
            token,
            body: updates,
          }
        );
        setConfig(response || null);
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to update configuration',
          code: apiError?.code,
          status: apiError?.status,
        });
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  return { config, loading, error, updateConfig, refetch: fetchConfig };
}

/**
 * Hook to manage users (ban, suspend, etc.)
 */
export function useAdminUserManagement(token: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AdminError | null>(null);

  const suspendUser = useCallback(
    async (userId: string, reason: string, duration: number) => {
      if (!token) return;

      try {
        setLoading(true);
        setError(null);
        await apiRequest(`/admin/users/${userId}/suspend`, {
          method: 'POST',
          token,
          body: { reason, durationDays: duration },
        });
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to suspend user',
          code: apiError?.code,
          status: apiError?.status,
        });
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  const banUser = useCallback(
    async (userId: string, reason: string) => {
      if (!token) return;

      try {
        setLoading(true);
        setError(null);
        await apiRequest(`/admin/users/${userId}/ban`, {
          method: 'POST',
          token,
          body: { reason },
        });
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to ban user',
          code: apiError?.code,
          status: apiError?.status,
        });
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  const issueRefund = useCallback(
    async (rideId: string, amount: number, reason: string) => {
      if (!token) return;

      try {
        setLoading(true);
        setError(null);
        await apiRequest(`/admin/rides/${rideId}/refund`, {
          method: 'POST',
          token,
          body: { amount, reason },
        });
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to issue refund',
          code: apiError?.code,
          status: apiError?.status,
        });
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  return {
    loading,
    error,
    suspendUser,
    banUser,
    issueRefund,
  };
}

/**
 * Hook to generate admin reports
 */
export function useAdminReports(token: string | null) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<AdminError | null>(null);

  const generateReport = useCallback(
    async (reportType: string, timeRange: string) => {
      if (!token) return;

      try {
        setLoading(true);
        setError(null);
        const response = await apiRequest(
          '/admin/reports/generate',
          {
            method: 'POST',
            token,
            body: { reportType, timeRange },
          }
        );
        return response;
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
        await apiRequest(`/admin/reports/${reportId}/download`, {
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

  return { loading, error, generateReport, downloadReport };
}
