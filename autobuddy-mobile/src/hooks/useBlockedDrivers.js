import { useState, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { apiRequest } from '../lib/api';
import {
  normalizeBlockedDriverRows,
  sortBlockedDriversByDate,
} from '../lib/passengerBlockedDrivers';

/**
 * Custom hook for managing passenger's blocked drivers
 * Provides state and functions for fetching, blocking, and unblocking drivers
 * 
 * Usage:
 * const {
 *   blockedDrivers,
 *   loading,
 *   error,
 *   fetchBlockedDrivers,
 *   blockDriver,
 *   unblockDriver,
 *   isDriverBlocked,
 * } = useBlockedDrivers();
 */
export default function useBlockedDrivers() {
  const [blockedDrivers, setBlockedDrivers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Fetch blocked drivers from API
   */
  const fetchBlockedDrivers = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiRequest('/api/passengers/blocked-drivers', {
        method: 'GET',
      });

      const normalized = normalizeBlockedDriverRows(response);
      const sorted = sortBlockedDriversByDate(normalized);
      setBlockedDrivers(sorted);

      return sorted;
    } catch (err) {
      console.error('Error fetching blocked drivers:', err);
      setError(err.message || 'Failed to load blocked drivers');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Block a driver
   * @param {string} driverId - Driver ID to block
   * @param {string} reason - Optional reason for blocking
   * @returns {Promise<boolean>} Success status
   */
  const blockDriver = useCallback(
    async (driverId, reason = null) => {
      if (!driverId) {
        Alert.alert('Error', 'Invalid driver ID');
        return false;
      }

      try {
        await apiRequest(`/api/passengers/blocked-drivers/${driverId}`, {
          method: 'PUT',
          body: {
            is_blocked: true,
            reason: reason,
          },
        });

        // Refresh blocked list
        await fetchBlockedDrivers();

        return true;
      } catch (err) {
        console.error('Error blocking driver:', err);
        Alert.alert('Error', err.message || 'Failed to block driver');
        return false;
      }
    },
    [fetchBlockedDrivers]
  );

  /**
   * Unblock a driver
   * @param {string} driverId - Driver ID to unblock
   * @returns {Promise<boolean>} Success status
   */
  const unblockDriver = useCallback(
    async (driverId) => {
      if (!driverId) {
        Alert.alert('Error', 'Invalid driver ID');
        return false;
      }

      try {
        await apiRequest(`/api/passengers/blocked-drivers/${driverId}`, {
          method: 'PUT',
          body: {
            is_blocked: false,
          },
        });

        // Update local state immediately for better UX
        setBlockedDrivers((prev) =>
          prev.filter((driver) => driver.driver_id !== driverId)
        );

        // Refresh to ensure consistency
        await fetchBlockedDrivers();

        return true;
      } catch (err) {
        console.error('Error unblocking driver:', err);
        Alert.alert('Error', err.message || 'Failed to unblock driver');
        return false;
      }
    },
    [fetchBlockedDrivers]
  );

  /**
   * Check if a specific driver is blocked
   * @param {string} driverId - Driver ID to check
   * @returns {boolean} True if driver is blocked
   */
  const isDriverBlocked = useCallback(
    (driverId) => {
      if (!driverId) return false;
      return blockedDrivers.some((driver) => driver.driver_id === driverId);
    },
    [blockedDrivers]
  );

  /**
   * Toggle block status for a driver
   * @param {string} driverId - Driver ID
   * @param {string} reason - Optional reason for blocking
   * @returns {Promise<boolean>} Success status
   */
  const toggleBlockDriver = useCallback(
    async (driverId, reason = null) => {
      const isBlocked = isDriverBlocked(driverId);
      
      if (isBlocked) {
        return await unblockDriver(driverId);
      } else {
        return await blockDriver(driverId, reason);
      }
    },
    [isDriverBlocked, blockDriver, unblockDriver]
  );

  /**
   * Get blocked driver count
   */
  const blockedCount = blockedDrivers.length;

  return {
    blockedDrivers,
    loading,
    error,
    blockedCount,
    fetchBlockedDrivers,
    blockDriver,
    unblockDriver,
    isDriverBlocked,
    toggleBlockDriver,
  };
}
