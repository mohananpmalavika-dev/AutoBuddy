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

    try {
      socketRef.current = createAutoBuddySocket(token);

      // Listen for online status changes
      statusListenerRef.current = (status) => {
        if (status?.online !== undefined) {
          setServerIsOnline(status.online);
          onStatusChange?.(status.online);
        }
      };

      socketRef.current.on('driver_status_update', statusListenerRef.current);
      socketRef.current.on('availability_sync', statusListenerRef.current);
    } catch (err) {
      console.warn('Failed to initialize actions socket:', err);
    }

    return () => {
      if (socketRef.current && statusListenerRef.current) {
        socketRef.current.off('driver_status_update', statusListenerRef.current);
        socketRef.current.off('availability_sync', statusListenerRef.current);
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
        const endpoint = wantOnline ? '/drivers/go-online' : '/drivers/go-offline';
        const response = await apiRequest(endpoint, {
          method: 'POST',
          token,
        });

        if (response?.success) {
          setIsOnline(wantOnline);
          setServerIsOnline(wantOnline);
          onStatusChange?.(wantOnline);
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
        const response = await apiRequest(`/drivers/block/${passengerId}`, {
          method: 'POST',
          token,
          body: { reason },
        });

        if (response?.success) {
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
        const response = await apiRequest(`/drivers/unblock/${passengerId}`, {
          method: 'POST',
          token,
        });

        if (response?.success) {
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

        if (response?.success) {
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

        if (response?.success) {
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
        const response = await apiRequest(`/drivers/report/${reportType}`, {
          method: 'POST',
          token,
        });

        if (response?.success) {
          return response.data?.url || true;
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
    if (token) {
      refreshPendingRequests();
      refreshBlockedPassengers();
    }
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
