import { useEffect, useCallback, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface DocumentExpiryAlert {
  alert_id: string;
  document_type: string;
  document_type_category: 'vehicle_doc' | 'kyc_doc' | 'insurance' | 'registration';
  expiry_date: string;
  alert_type: 'expiring_soon' | 'expired' | 'renewal_required';
  severity: 'warning' | 'critical';
  days_to_expiry: number;
  alert_status: 'sent' | 'acknowledged' | 'dismissed';
  sent_at: string;
}

interface ExpiringDocument {
  document_id: string;
  document_type: string;
  category: string;
  expiry_date: string;
  days_to_expiry: number;
  severity: 'warning' | 'critical';
  status: 'expired' | 'expiring_soon';
}

interface RenewalRequest {
  request_id: string;
  document_type: string;
  original_expiry_date: string;
  renewal_status: 'submitted' | 'under_review' | 'approved' | 'rejected';
  renewal_uploaded_at: string;
  verified_at?: string;
  rejection_reason?: string;
}

export const useDocumentExpiry = (driverId: string | null, authToken: string | null) => {
  const [alerts, setAlerts] = useState<DocumentExpiryAlert[]>([]);
  const [expiringDocuments, setExpiringDocuments] = useState<ExpiringDocument[]>([]);
  const [renewalRequests, setRenewalRequests] = useState<RenewalRequest[]>([]);
  const [pendingAlertCount, setPendingAlertCount] = useState(0);
  const [criticalAlertCount, setCriticalAlertCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAllAlerts = useCallback(
    async (status?: string) => {
      if (!driverId || !authToken) {return;}
      try {
        setIsLoading(true);
        const params = status ? { status } : {};
        const response = await axios.get(
          `${API_BASE_URL}/api/v3/document-expiry/alerts/${driverId}`,
          {
            params,
            headers: { Authorization: `Bearer ${authToken}` }
          }
        );
        setAlerts(response.data.alerts);
        setPendingAlertCount(response.data.summary.total);
        setCriticalAlertCount(response.data.summary.critical);
        setError(null);
      } catch (err) {
        console.error('Error fetching alerts:', err);
        setError('Failed to load expiry alerts');
      } finally {
        setIsLoading(false);
      }
    },
    [driverId, authToken]
  );

  const fetchExpiringDocuments = useCallback(
    async (days: number = 30, category: string = 'all') => {
      if (!driverId || !authToken) {return;}
      try {
        const response = await axios.get(
          `${API_BASE_URL}/api/v3/document-expiry/documents/${driverId}/expiring`,
          {
            params: { days_remaining: days, category },
            headers: { Authorization: `Bearer ${authToken}` }
          }
        );
        setExpiringDocuments(response.data.documents);
        setError(null);
      } catch (err) {
        console.error('Error fetching expiring documents:', err);
        setError('Failed to load expiring documents');
      }
    },
    [driverId, authToken]
  );

  const acknowledgeAlert = useCallback(
    async (alertId: string) => {
      if (!authToken) {return;}
      try {
        await axios.post(
          `${API_BASE_URL}/api/v3/document-expiry/alerts/${alertId}/acknowledge`,
          {},
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        setAlerts(alerts.filter(a => a.alert_id !== alertId) || []);
        setError(null);
      } catch (err) {
        console.error('Error acknowledging alert:', err);
        setError('Failed to acknowledge alert');
      }
    },
    [authToken, alerts]
  );

  const dismissAlert = useCallback(
    async (alertId: string) => {
      if (!authToken) {return;}
      try {
        await axios.post(
          `${API_BASE_URL}/api/v3/document-expiry/alerts/${alertId}/dismiss`,
          {},
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        setAlerts(alerts.filter(a => a.alert_id !== alertId) || []);
        setError(null);
      } catch (err) {
        console.error('Error dismissing alert:', err);
        setError('Failed to dismiss alert');
      }
    },
    [authToken, alerts]
  );

  const submitRenewal = useCallback(
    async (documentId: string, documentType: string, file: File, notes?: string) => {
      if (!driverId || !authToken) {return null;}
      try {
        const formData = new FormData();
        formData.append('file', file);
        if (notes) {formData.append('notes', notes);}

        const response = await axios.post(
          `${API_BASE_URL}/api/v3/document-expiry/renewals/${driverId}/submit`,
          formData,
          {
            params: { document_id: documentId, document_type: documentType },
            headers: {
              Authorization: `Bearer ${authToken}`,
              'Content-Type': 'multipart/form-data'
            }
          }
        );
        await fetchExpiringDocuments();
        setError(null);
        return response.data;
      } catch (err) {
        console.error('Error submitting renewal:', err);
        setError('Failed to submit renewal');
        return null;
      }
    },
    [driverId, authToken, fetchExpiringDocuments]
  );

  const getPendingRenewals = useCallback(
    async () => {
      if (!driverId || !authToken) {return;}
      try {
        const response = await axios.get(
          `${API_BASE_URL}/api/v3/document-expiry/renewals/${driverId}`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        setRenewalRequests(response.data.renewals);
        setError(null);
      } catch (err) {
        console.error('Error fetching renewals:', err);
        setError('Failed to load renewal requests');
      }
    },
    [driverId, authToken]
  );

  const getRenewalStatus = useCallback(
    async (requestId: string) => {
      if (!driverId || !authToken) {return null;}
      try {
        const response = await axios.get(
          `${API_BASE_URL}/api/v3/document-expiry/renewals/${driverId}/${requestId}`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        return response.data;
      } catch (err) {
        console.error('Error fetching renewal status:', err);
        return null;
      }
    },
    [driverId, authToken]
  );

  const calculateDaysUntilExpiry = useCallback((expiryDate: string): number => {
    const expiry = new Date(expiryDate);
    const now = new Date();
    const diff = expiry.getTime() - now.getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }, []);

  const getSeverityColor = useCallback((severity: 'warning' | 'critical'): string => {
    return severity === 'critical' ? '#DC2626' : '#EAB308';
  }, []);

  const getAlertsByCategory = useCallback(
    (category: 'vehicle' | 'kyc'): DocumentExpiryAlert[] => {
      return alerts.filter(
        alert =>
          (category === 'vehicle' && ['vehicle_doc', 'insurance', 'registration'].includes(alert.document_type_category)) ||
          (category === 'kyc' && alert.document_type_category === 'kyc_doc')
      );
    },
    [alerts]
  );

  // Initial fetch on mount
  useEffect(() => {
    if (driverId && authToken) {
      fetchAllAlerts();
      fetchExpiringDocuments();
      getPendingRenewals();
    }
  }, [driverId, authToken, fetchAllAlerts, fetchExpiringDocuments, getPendingRenewals]);

  return {
    // State
    alerts,
    expiringDocuments,
    renewalRequests,
    pendingAlertCount,
    criticalAlertCount,
    isLoading,
    error,

    // Functions
    fetchAllAlerts,
    fetchExpiringDocuments,
    acknowledgeAlert,
    dismissAlert,
    submitRenewal,
    getPendingRenewals,
    getRenewalStatus,
    calculateDaysUntilExpiry,
    getSeverityColor,
    getAlertsByCategory
  };
};
