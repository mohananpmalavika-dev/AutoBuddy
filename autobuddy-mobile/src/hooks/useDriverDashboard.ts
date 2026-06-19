import { useEffect, useState, useCallback } from 'react';
import { apiRequest } from '../lib/api-client';
import type { EarningsData } from '../components/DriverEarningsWidget';
import type { DocumentStatus } from '../components/DriverDocumentStatus';
import type { RideRequest } from '../components/DriverRideRequestCard';

export interface DriverError {
  message: string;
  code?: string;
  status?: number;
}

/**
 * Hook to fetch driver earnings data with real-time updates
 */
export function useDriverEarnings(token: string | null) {
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<DriverError | null>(null);

  const fetchEarnings = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      setError(null);
      const response = await apiRequest<EarningsData>(
        '/drivers/me/earnings?period=day|week|month',
        { token }
      );
      setEarnings(response);
    } catch (err: unknown) {
      const apiError = err as any;
      setError({
        message: apiError?.message || 'Failed to fetch earnings',
        code: apiError?.code,
        status: apiError?.status,
      });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchEarnings();

    // Refresh earnings every 30 seconds when online
    const interval = setInterval(fetchEarnings, 30000);
    return () => clearInterval(interval);
  }, [fetchEarnings]);

  return { earnings, loading, error, refetch: fetchEarnings };
}

/**
 * Hook to fetch and monitor driver document status
 */
export function useDriverDocuments(token: string | null) {
  const [documents, setDocuments] = useState<DocumentStatus[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<DriverError | null>(null);

  const fetchDocuments = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      setError(null);
      const response = await apiRequest<DocumentStatus[]>(
        '/drivers/me/documents',
        { token }
      );
      setDocuments(response || []);
    } catch (err: unknown) {
      const apiError = err as any;
      setError({
        message: apiError?.message || 'Failed to fetch documents',
        code: apiError?.code,
        status: apiError?.status,
      });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchDocuments();

    // Check document status every 60 seconds
    const interval = setInterval(fetchDocuments, 60000);
    return () => clearInterval(interval);
  }, [fetchDocuments]);

  return { documents, loading, error, refetch: fetchDocuments };
}

/**
 * Hook to handle ride requests with timer
 */
export function useRideRequest(token: string | null) {
  const [rideRequest, setRideRequest] = useState<RideRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<DriverError | null>(null);

  const acceptRide = useCallback(
    async (rideId: string) => {
      if (!token) return;

      try {
        setLoading(true);
        await apiRequest(`/rides/${rideId}/accept`, {
          method: 'PUT',
          token,
        });
        setRideRequest(null);
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to accept ride',
          code: apiError?.code,
          status: apiError?.status,
        });
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  const declineRide = useCallback(
    async (rideId: string, reason?: string) => {
      if (!token) return;

      try {
        setLoading(true);
        await apiRequest(`/rides/${rideId}/decline`, {
          method: 'PUT',
          token,
          body: { reason },
        });
        setRideRequest(null);
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to decline ride',
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
    rideRequest,
    loading,
    error,
    acceptRide,
    declineRide,
    setRideRequest,
  };
}

/**
 * Hook to monitor driver online status
 */
export function useDriverOnlineStatus(token: string | null) {
  const [isOnline, setIsOnline] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<DriverError | null>(null);

  const toggleOnlineStatus = useCallback(
    async (online: boolean) => {
      if (!token) return;

      try {
        setLoading(true);
        setError(null);
        await apiRequest('/drivers/me/online-status', {
          method: 'PUT',
          token,
          body: { online },
        });
        setIsOnline(online);
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to update online status',
          code: apiError?.code,
          status: apiError?.status,
        });
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    // Fetch current online status
    const fetchStatus = async () => {
      if (!token) return;
      try {
        const response = await apiRequest<{ online: boolean }>(
          '/drivers/me/online-status',
          { token }
        );
        setIsOnline(response?.online || false);
      } catch {
        // Silently fail
      }
    };

    fetchStatus();
  }, [token]);

  return { isOnline, loading, error, toggleOnlineStatus };
}

/**
 * Hook to fetch driver alerts
 */
export function useDriverAlerts(token: string | null) {
  const [alerts, setAlerts] = useState<number>(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token) return;

    const fetchAlerts = async () => {
      try {
        setLoading(true);
        const response = await apiRequest<{ count: number }>(
          '/drivers/me/alerts/unread',
          { token }
        );
        setAlerts(response?.count || 0);
      } catch {
        setAlerts(0);
      } finally {
        setLoading(false);
      }
    };

    fetchAlerts();

    // Check for alerts every 60 seconds
    const interval = setInterval(fetchAlerts, 60000);
    return () => clearInterval(interval);
  }, [token]);

  return { alerts, loading };
}

/**
 * Hook to upload driver documents
 */
export function useDriverDocumentUpload(token: string | null) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<DriverError | null>(null);

  const uploadDocument = useCallback(
    async (documentType: string, fileUri: string) => {
      if (!token) return;

      try {
        setUploading(true);
        setError(null);

        // In a real app, use FormData to upload file
        // This is a placeholder
        const formData = new FormData();
        formData.append('document_type', documentType);
        formData.append('file', {
          uri: fileUri,
          type: 'image/jpeg',
          name: `${documentType}.jpg`,
        } as any);

        await apiRequest(`/drivers/me/documents/${documentType}/upload`, {
          method: 'POST',
          token,
          body: formData as any,
        });
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to upload document',
          code: apiError?.code,
          status: apiError?.status,
        });
      } finally {
        setUploading(false);
      }
    },
    [token]
  );

  return { uploading, error, uploadDocument };
}

/**
 * Hook to fetch ride history
 */
export function useDriverRideHistory(token: string | null, limit = 10) {
  const [rides, setRides] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<DriverError | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);

  const fetchRides = useCallback(
    async (loadMore = false) => {
      if (!token) return;

      try {
        setLoading(true);
        setError(null);
        const query = `?limit=${limit}&offset=${loadMore ? offset + limit : 0}`;
        const response = await apiRequest<{ rides: any[]; total: number }>(
          `/drivers/me/rides${query}`,
          { token }
        );

        if (loadMore) {
          setRides(prev => [...prev, ...(response?.rides || [])]);
          setOffset(offset + limit);
        } else {
          setRides(response?.rides || []);
        }

        setHasMore((response?.rides?.length || 0) === limit);
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to fetch ride history',
          code: apiError?.code,
          status: apiError?.status,
        });
      } finally {
        setLoading(false);
      }
    },
    [token, limit, offset]
  );

  useEffect(() => {
    fetchRides();
  }, []);

  return {
    rides,
    loading,
    error,
    hasMore,
    loadMore: () => fetchRides(true),
    refetch: () => fetchRides(false),
  };
}
