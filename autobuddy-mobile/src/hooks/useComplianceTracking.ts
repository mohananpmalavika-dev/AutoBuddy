import { useState, useCallback } from 'react';
import axios from 'axios';

export interface ComplianceItem {
  id: string;
  userId: string;
  type: 'document_verification' | 'background_check' | 'driving_license' | 'insurance' | 'pollution' | 'vehicle_inspection';
  status: 'compliant' | 'warning' | 'non_compliant' | 'expired' | 'pending';
  expiryDate?: Date;
  daysUntilExpiry?: number;
  documentUrl?: string;
  verifiedAt?: Date;
  verifiedBy?: string;
  notes?: string;
}

export interface ComplianceAlert {
  id: string;
  userId: string;
  type: 'upcoming_expiry' | 'already_expired' | 'verification_failed' | 'suspension_warning';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  createdAt: Date;
  resolvedAt?: Date;
  action?: string;
}

export interface ComplianceReport {
  id: string;
  userId: string;
  generatedAt: Date;
  overallStatus: 'compliant' | 'warning' | 'non_compliant';
  items: ComplianceItem[];
  alerts: ComplianceAlert[];
  nextReviewDate: Date;
}

interface UseComplianceTrackingReturn {
  complianceItems: ComplianceItem[];
  alerts: ComplianceAlert[];
  currentReport: ComplianceReport | null;
  loading: boolean;
  error: Error | null;
  fetchComplianceStatus: () => Promise<void>;
  fetchAlerts: () => Promise<void>;
  generateComplianceReport: () => Promise<ComplianceReport | null>;
  acknowledgeAlert: (alertId: string) => Promise<boolean>;
  updateComplianceItem: (itemId: string, updates: Partial<ComplianceItem>) => Promise<boolean>;
  getComplianceScore: () => number;
  getExpiringItems: (daysUntilExpiry?: number) => ComplianceItem[];
  getExpiredItems: () => ComplianceItem[];
  getComplianceTimeline: () => any[];
  uploadComplianceDocument: (itemId: string, filePath: string) => Promise<boolean>;
  requestManualVerification: (itemId: string, reason: string) => Promise<boolean>;
  getComplianceSummary: () => any;
}

export const useComplianceTracking = (token: string | null, userId: string): UseComplianceTrackingReturn => {
  const [complianceItems, setComplianceItems] = useState<ComplianceItem[]>([]);
  const [alerts, setAlerts] = useState<ComplianceAlert[]>([]);
  const [currentReport, setCurrentReport] = useState<ComplianceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

  const fetchComplianceStatus = useCallback(async () => {
    if (!token) {return;}
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/compliance/${userId}/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setComplianceItems(response.data.items || []);
      setAlerts(response.data.alerts || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch compliance status'));
    } finally {
      setLoading(false);
    }
  }, [token, userId, API_BASE_URL]);

  const fetchAlerts = useCallback(async () => {
    if (!token) {return;}
    try {
      const response = await axios.get(`${API_BASE_URL}/compliance/${userId}/alerts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAlerts(response.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch alerts'));
    }
  }, [token, userId, API_BASE_URL]);

  const generateComplianceReport = useCallback(async () => {
    if (!token) {return null;}
    try {
      const response = await axios.post(
        `${API_BASE_URL}/compliance/${userId}/generate-report`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const report = response.data;
      setCurrentReport(report);
      return report;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to generate report'));
      return null;
    }
  }, [token, userId, API_BASE_URL]);

  const acknowledgeAlert = useCallback(
    async (alertId: string): Promise<boolean> => {
      if (!token) {return false;}
      try {
        await axios.post(
          `${API_BASE_URL}/compliance/alerts/${alertId}/acknowledge`,
          { userId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setAlerts((prev) =>
          prev.map((a) => (a.id === alertId ? { ...a, resolvedAt: new Date() } : a))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to acknowledge alert'));
        return false;
      }
    },
    [token, userId, API_BASE_URL]
  );

  const updateComplianceItem = useCallback(
    async (itemId: string, updates: Partial<ComplianceItem>): Promise<boolean> => {
      if (!token) {return false;}
      try {
        await axios.put(
          `${API_BASE_URL}/compliance/items/${itemId}`,
          updates,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setComplianceItems((prev) =>
          prev.map((i) => (i.id === itemId ? { ...i, ...updates } : i))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update item'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const getComplianceScore = useCallback(() => {
    if (complianceItems.length === 0) {return 0;}

    const compliantCount = complianceItems.filter((i) => i.status === 'compliant').length;
    return Math.round((compliantCount / complianceItems.length) * 100);
  }, [complianceItems]);

  const getExpiringItems = useCallback(
    (daysUntilExpiry = 30): ComplianceItem[] => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + daysUntilExpiry * 24 * 60 * 60 * 1000);

      return complianceItems.filter(
        (item) =>
          item.expiryDate &&
          new Date(item.expiryDate) <= futureDate &&
          new Date(item.expiryDate) > now
      );
    },
    [complianceItems]
  );

  const getExpiredItems = useCallback(() => {
    const now = new Date();
    return complianceItems.filter(
      (item) => item.expiryDate && new Date(item.expiryDate) <= now
    );
  }, [complianceItems]);

  const getComplianceTimeline = useCallback(() => {
    return complianceItems
      .filter((item) => item.verifiedAt)
      .sort((a, b) => new Date(b.verifiedAt!).getTime() - new Date(a.verifiedAt!).getTime())
      .slice(0, 10);
  }, [complianceItems]);

  const uploadComplianceDocument = useCallback(
    async (itemId: string, filePath: string): Promise<boolean> => {
      if (!token) {return false;}
      try {
        const formData = new FormData();
        formData.append('file', {
          uri: filePath,
          type: 'application/pdf',
          name: `compliance_${itemId}.pdf`,
        } as any);

        await axios.post(
          `${API_BASE_URL}/compliance/items/${itemId}/upload`,
          formData,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'multipart/form-data',
            },
          }
        );

        setComplianceItems((prev) =>
          prev.map((i) => (i.id === itemId ? { ...i, documentUrl: `uploaded_${Date.now()}` } : i))
        );

        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to upload document'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const requestManualVerification = useCallback(
    async (itemId: string, reason: string): Promise<boolean> => {
      if (!token) {return false;}
      try {
        await axios.post(
          `${API_BASE_URL}/compliance/items/${itemId}/verify`,
          { reason },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        setComplianceItems((prev) =>
          prev.map((i) => (i.id === itemId ? { ...i, status: 'pending' } : i))
        );

        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to request verification'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const getComplianceSummary = useCallback(() => {
    const compliant = complianceItems.filter((i) => i.status === 'compliant').length;
    const warning = complianceItems.filter((i) => i.status === 'warning').length;
    const expired = complianceItems.filter((i) => i.status === 'expired').length;
    const nonCompliant = complianceItems.filter((i) => i.status === 'non_compliant').length;

    const overallStatus =
      nonCompliant > 0 || expired > 0
        ? 'non_compliant'
        : warning > 0
        ? 'warning'
        : 'compliant';

    return {
      total: complianceItems.length,
      compliant,
      warning,
      expired,
      nonCompliant,
      overallStatus,
      score: getComplianceScore(),
      unresolvedAlerts: alerts.filter((a) => !a.resolvedAt).length,
    };
  }, [complianceItems, alerts, getComplianceScore]);

  return {
    complianceItems,
    alerts,
    currentReport,
    loading,
    error,
    fetchComplianceStatus,
    fetchAlerts,
    generateComplianceReport,
    acknowledgeAlert,
    updateComplianceItem,
    getComplianceScore,
    getExpiringItems,
    getExpiredItems,
    getComplianceTimeline,
    uploadComplianceDocument,
    requestManualVerification,
    getComplianceSummary,
  };
};
