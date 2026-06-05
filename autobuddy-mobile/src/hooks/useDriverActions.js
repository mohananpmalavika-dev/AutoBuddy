import { useCallback, useRef, useState, useEffect } from 'react';
import { apiRequest } from '../lib/api';
import { createAutoBuddySocket } from '../lib/socket';

/**
 * Custom hook for managing driver actions and status
 * Consolidates online/offline toggling, blocking passengers, and action queueing
 *
 * @param {string} token - Authentication token
 * @param {function} onStatusChange - Callback when online status changes
 * @returns {object} Action state and methods
 */
export function useDriverActions({ token, onStatusChange } = {}) {
  const socketRef = useRef(null);
  const statusListenerRef = useRef(null);
  const actionQueueRef = useRef([]);
  const syncInFlightRef = useRef(false);

  // State management
  const [isOnline, setIsOnline] = useState(false);
  const [serverIsOnline, setServerIsOnline] = useState(false);
  const [blockedPassengerIds, setBlockedPassengerIds] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [queuedActions, setQueuedActions] = useState([]);

  // Initialize socket for real-time status updates
  useEffect(() => {
    if (!token) return;

    const statusEvents = [
      'driver_status_update',
      'availability_sync',
      'driver_availability_changed',
      'driver_status_changed',
    ];

    try {
      socketRef.current = createAutoBuddySocket(token);

      // Listen for online status changes
      statusListenerRef.current = (status) => {
        const online =
          status?.online ??
          status?.is_available ??
          status?.isAvailable ??
          (typeof status?.status === 'string' ? status.status.toLowerCase() === 'online' : undefined);

        if (online !== undefined) {
          setServerIsOnline(online);
          onStatusChange?.(online);
        }
      };

      statusEvents.forEach((event) => socketRef.current.on(event, statusListenerRef.current));
    } catch (err) {
      console.warn('Failed to initialize actions socket:', err);
    }

    return () => {
      if (socketRef.current && statusListenerRef.current) {
        statusEvents.forEach((event) => socketRef.current.off(event, statusListenerRef.current));
      }
    };
  }, [token, onStatusChange]);

  // Toggle online/offline status
  const toggleOnline = useCallback(
    async (wantOnline) => {
      if (!token) {
        setError('Missing authentication token');
        return false;
      }

      setLoading(true);
      setError('');

      try {
        const response = await apiRequest('/drivers/availability', {
          method: 'PUT',
          token,
          body: { is_available: wantOnline },
        });

        if (typeof response?.is_available === 'boolean') {
          setIsOnline(response.is_available);
          setServerIsOnline(response.is_available);
          onStatusChange?.(response.is_available);
          return true;
        }

        throw new Error(response?.message || `Failed to go ${wantOnline ? 'online' : 'offline'}`);
      } catch (err) {
        const errorMsg = err?.message || 'Error toggling online status';
        setError(errorMsg);
        console.error('toggleOnline error:', err);
        setIsOnline(!wantOnline); // Revert on error
        return false;
      } finally {
        setLoading(false);
      }
    },
    [token, onStatusChange]
  );

  // Block a passenger
  const blockPassenger = useCallback(
    async (passengerId, reason = '') => {
      if (!passengerId || !token) {
        setError('Missing passenger ID or authentication token');
        return false;
      }

      setLoading(true);
      setError('');

      try {
        const response = await apiRequest(`/drivers/blocked-passengers/${passengerId}`, {
          method: 'PUT',
          token,
          body: { is_blocked: true, reason },
        });

        if (response?.message) {
          setBlockedPassengerIds((prev) => {
            if (prev.includes(passengerId)) return prev;
            return [...prev, passengerId];
          });
          return true;
        }

        throw new Error(response?.message || 'Failed to block passenger');
      } catch (err) {
        const errorMsg = err?.message || 'Error blocking passenger';
        setError(errorMsg);
        console.error('blockPassenger error:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  // Unblock a passenger
  const unblockPassenger = useCallback(
    async (passengerId) => {
      if (!passengerId || !token) {
        setError('Missing passenger ID or authentication token');
        return false;
      }

      setLoading(true);
      setError('');

      try {
        const response = await apiRequest(`/drivers/blocked-passengers/${passengerId}`, {
          method: 'PUT',
          token,
          body: { is_blocked: false },
        });

        if (response?.message) {
          setBlockedPassengerIds((prev) => prev.filter((id) => id !== passengerId));
          return true;
        }

        throw new Error(response?.message || 'Failed to unblock passenger');
      } catch (err) {
        const errorMsg = err?.message || 'Error unblocking passenger';
        setError(errorMsg);
        console.error('unblockPassenger error:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  // Get pending requests
  const refreshPendingRequests = useCallback(
    async () => {
      if (!token) {
        setError('Missing authentication token');
        return;
      }

      try {
        const response = await apiRequest('/drivers/pending-requests', {
          method: 'GET',
          token,
        });

        if (Array.isArray(response)) {
          setPendingRequests(response);
        } else if (response?.success) {
          setPendingRequests(response.data?.requests || []);
        } else if (Array.isArray(response?.data)) {
          setPendingRequests(response.data);
        }
      } catch (err) {
        console.warn('Failed to fetch pending requests:', err?.message);
      }
    },
    [token]
  );

  // Get blocked passengers list
  const refreshBlockedPassengers = useCallback(
    async () => {
      if (!token) {
        return;
      }

      try {
        const response = await apiRequest('/drivers/blocked-passengers', {
          method: 'GET',
          token,
        });

        if (Array.isArray(response?.passenger_ids)) {
          setBlockedPassengerIds(response.passenger_ids);
        } else if (response?.success) {
          setBlockedPassengerIds(response.data?.passenger_ids || []);
        } else if (Array.isArray(response?.data)) {
          setBlockedPassengerIds(response.data);
        }
      } catch (err) {
        console.warn('Failed to fetch blocked passengers:', err?.message);
      }
    },
    [token]
  );

  // Queue an action for offline sync
  const queueAction = useCallback((action, data) => {
    const queuedAction = {
      id: Date.now().toString(),
      action,
      data,
      timestamp: Date.now(),
      synced: false,
    };

    actionQueueRef.current.push(queuedAction);
    setQueuedActions((prev) => [...prev, queuedAction]);

    return queuedAction.id;
  }, []);

  // Sync queued actions when online
  const syncQueuedActions = useCallback(
    async () => {
      if (!token || syncInFlightRef.current || actionQueueRef.current.length === 0) {
        return true;
      }

      syncInFlightRef.current = true;
      const actions = [...actionQueueRef.current];

      try {
        const response = await apiRequest('/drivers/sync-actions', {
          method: 'POST',
          token,
          body: { actions },
        });

        if (response?.success) {
          // Clear synced actions
          actionQueueRef.current = [];
          setQueuedActions([]);
          return true;
        }

        throw new Error(response?.message || 'Failed to sync actions');
      } catch (err) {
        console.error('syncQueuedActions error:', err);
        return false;
      } finally {
        syncInFlightRef.current = false;
      }
    },
    [token]
  );

  // Request a full earnings report
  const requestReport = useCallback(
    async (reportType = 'earnings') => {
      if (!token) {
        setError('Missing authentication token');
        return false;
      }

      setLoading(true);
      setError('');

      try {
        const response = await apiRequest('/drivers/earnings/report', {
          method: 'POST',
          token,
          body: { format: 'json', report_type: reportType },
        });

        if (response?.report || response?.report_id) {
          return response.report || true;
        }

        throw new Error(response?.message || `Failed to generate ${reportType} report`);
      } catch (err) {
        const errorMsg = err?.message || 'Error generating report';
        setError(errorMsg);
        console.error('requestReport error:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  // Clear error
  const clearError = useCallback(() => {
    setError('');
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    if (!token) return undefined;
    const timer = setTimeout(() => {
      refreshPendingRequests();
      refreshBlockedPassengers();
    }, 0);
    return () => clearTimeout(timer);
  }, [token, refreshPendingRequests, refreshBlockedPassengers]);

  return {
    // State
    isOnline,
    serverIsOnline,
    blockedPassengerIds,
    pendingRequests,
    loading,
    error,
    queuedActions,

    // Actions
    toggleOnline,
    blockPassenger,
    unblockPassenger,
    refreshPendingRequests,
    refreshBlockedPassengers,
    queueAction,
    syncQueuedActions,
    requestReport,
    clearError,

    // Setters (for manual control)
    setIsOnline,
    setBlockedPassengerIds,
    setPendingRequests,
  };
}
