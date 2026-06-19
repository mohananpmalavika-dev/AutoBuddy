import { useState, useCallback } from 'react';
import axios from 'axios';

export interface ReportedContent {
  id: string;
  reportedBy: string;
  reportedUser: string;
  type: 'profile' | 'message' | 'rating' | 'behavior' | 'other';
  reason: string;
  description: string;
  evidence: string[];
  status: 'pending' | 'reviewing' | 'resolved' | 'dismissed';
  severity: 'low' | 'medium' | 'high' | 'critical';
  createdAt: Date;
  reviewedAt?: Date;
  reviewedBy?: string;
  action?: 'none' | 'warning' | 'suspension' | 'ban';
  actionDetails?: string;
}

export interface ModerationAction {
  id: string;
  reportId: string;
  action: 'none' | 'warning' | 'suspension' | 'ban';
  reason: string;
  duration?: number;
  details: string;
  createdAt: Date;
  createdBy: string;
  notifiedAt?: Date;
}

export interface ModerationStats {
  totalReports: number;
  pendingReports: number;
  resolvedReports: number;
  avgResolutionTime: number;
  usersWarned: number;
  usersSuspended: number;
  usersBanned: number;
}

interface UseModerationDashboardReturn {
  reports: ReportedContent[];
  actions: ModerationAction[];
  stats: ModerationStats | null;
  loading: boolean;
  error: Error | null;
  fetchReports: (status?: string) => Promise<void>;
  fetchReport: (reportId: string) => Promise<ReportedContent | null>;
  updateReportStatus: (reportId: string, status: string, severity?: string) => Promise<boolean>;
  takeAction: (reportId: string, action: string, reason: string, duration?: number) => Promise<boolean>;
  dismissReport: (reportId: string, reason: string) => Promise<boolean>;
  warnUser: (userId: string, reason: string) => Promise<boolean>;
  suspendUser: (userId: string, duration: number, reason: string) => Promise<boolean>;
  banUser: (userId: string, reason: string) => Promise<boolean>;
  getActionHistory: (userId: string) => ModerationAction[];
  fetchStats: () => Promise<void>;
  exportReport: (reportId: string) => Promise<any>;
}

export const useModerationDashboard = (token: string | null, adminId: string): UseModerationDashboardReturn => {
  const [reports, setReports] = useState<ReportedContent[]>([]);
  const [actions, setActions] = useState<ModerationAction[]>([]);
  const [stats, setStats] = useState<ModerationStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

  const fetchReports = useCallback(
    async (status?: string) => {
      if (!token) return;
      setLoading(true);
      try {
        const params = status ? { status } : {};
        const response = await axios.get(`${API_BASE_URL}/moderation/reports`, {
          params,
          headers: { Authorization: `Bearer ${token}` },
        });
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

  const fetchReport = useCallback(
    async (reportId: string): Promise<ReportedContent | null> => {
      if (!token) return null;
      try {
        const response = await axios.get(`${API_BASE_URL}/moderation/reports/${reportId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        return response.data;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch report'));
        return null;
      }
    },
    [token, API_BASE_URL]
  );

  const updateReportStatus = useCallback(
    async (reportId: string, status: string, severity?: string): Promise<boolean> => {
      if (!token) return false;
      try {
        const response = await axios.patch(
          `${API_BASE_URL}/moderation/reports/${reportId}`,
          { status, severity },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setReports((prev) =>
          prev.map((r) => (r.id === reportId ? response.data : r))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update report'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const takeAction = useCallback(
    async (
      reportId: string,
      action: string,
      reason: string,
      duration?: number
    ): Promise<boolean> => {
      if (!token) return false;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/moderation/reports/${reportId}/action`,
          { action, reason, duration, adminId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setActions((prev) => [response.data, ...prev]);
        setReports((prev) =>
          prev.map((r) => (r.id === reportId ? { ...r, status: 'resolved' } : r))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to take action'));
        return false;
      }
    },
    [token, adminId, API_BASE_URL]
  );

  const dismissReport = useCallback(
    async (reportId: string, reason: string): Promise<boolean> => {
      if (!token) return false;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/moderation/reports/${reportId}/dismiss`,
          { reason },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setReports((prev) =>
          prev.map((r) => (r.id === reportId ? response.data : r))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to dismiss report'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const warnUser = useCallback(
    async (userId: string, reason: string): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.post(
          `${API_BASE_URL}/moderation/users/${userId}/warn`,
          { reason, adminId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to warn user'));
        return false;
      }
    },
    [token, adminId, API_BASE_URL]
  );

  const suspendUser = useCallback(
    async (userId: string, duration: number, reason: string): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.post(
          `${API_BASE_URL}/moderation/users/${userId}/suspend`,
          { duration, reason, adminId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to suspend user'));
        return false;
      }
    },
    [token, adminId, API_BASE_URL]
  );

  const banUser = useCallback(
    async (userId: string, reason: string): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.post(
          `${API_BASE_URL}/moderation/users/${userId}/ban`,
          { reason, adminId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to ban user'));
        return false;
      }
    },
    [token, adminId, API_BASE_URL]
  );

  const getActionHistory = useCallback(
    (userId: string): ModerationAction[] => {
      return actions.filter((a) => {
        const report = reports.find((r) => r.id === a.reportId);
        return report?.reportedUser === userId;
      });
    },
    [actions, reports]
  );

  const fetchStats = useCallback(async () => {
    if (!token) return;
    try {
      const response = await axios.get(`${API_BASE_URL}/moderation/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setStats(response.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch stats'));
    }
  }, [token, API_BASE_URL]);

  const exportReport = useCallback(
    async (reportId: string): Promise<any> => {
      if (!token) return null;
      try {
        const response = await axios.get(
          `${API_BASE_URL}/moderation/reports/${reportId}/export`,
          {
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

  return {
    reports,
    actions,
    stats,
    loading,
    error,
    fetchReports,
    fetchReport,
    updateReportStatus,
    takeAction,
    dismissReport,
    warnUser,
    suspendUser,
    banUser,
    getActionHistory,
    fetchStats,
    exportReport,
  };
};
