import { useState, useCallback } from 'react';
import axios from 'axios';

export interface DriverForManagement {
  id: string;
  name: string;
  email: string;
  phone: string;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  joinedAt: Date;
  documentsVerified: boolean;
  backgroundCheckStatus: 'pending' | 'passed' | 'failed';
  commissionRate: number;
  totalEarnings: number;
  totalRides: number;
  averageRating: number;
  licenseNumber?: string;
  vehicleNumber?: string;
}

export interface BulkDriverAction {
  driverIds: string[];
  action: 'approve' | 'reject' | 'suspend' | 'unsuspend';
  reason?: string;
}

interface UseOperatorDriverManagementReturn {
  drivers: DriverForManagement[];
  loading: boolean;
  error: Error | null;
  fetchDrivers: (filters?: { status?: string; search?: string }) => Promise<void>;
  approveDriver: (driverId: string) => Promise<boolean>;
  rejectDriver: (driverId: string, reason: string) => Promise<boolean>;
  suspendDriver: (driverId: string, reason: string) => Promise<boolean>;
  unsuspendDriver: (driverId: string) => Promise<boolean>;
  setCommissionRate: (driverId: string, rate: number) => Promise<boolean>;
  bulkApprove: (driverIds: string[]) => Promise<number>;
  bulkReject: (driverIds: string[]) => Promise<number>;
  removeDriver: (driverId: string) => Promise<boolean>;
  sendMessage: (driverId: string, message: string) => Promise<boolean>;
  getDriverStats: (driverId: string) => any;
}

export const useOperatorDriverManagement = (
  token: string | null,
  operatorId: string
): UseOperatorDriverManagementReturn => {
  const [drivers, setDrivers] = useState<DriverForManagement[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

  const fetchDrivers = useCallback(
    async (filters?: { status?: string; search?: string }) => {
      if (!token) return;
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filters?.status) params.append('status', filters.status);
        if (filters?.search) params.append('search', filters.search);

        const response = await axios.get(
          `${API_BASE_URL}/operators/${operatorId}/drivers?${params}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setDrivers(response.data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch drivers'));
      } finally {
        setLoading(false);
      }
    },
    [token, operatorId, API_BASE_URL]
  );

  const approveDriver = useCallback(
    async (driverId: string): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.post(
          `${API_BASE_URL}/operators/${operatorId}/drivers/${driverId}/approve`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setDrivers((prev) =>
          prev.map((d) => (d.id === driverId ? { ...d, status: 'approved' } : d))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to approve driver'));
        return false;
      }
    },
    [token, operatorId, API_BASE_URL]
  );

  const rejectDriver = useCallback(
    async (driverId: string, reason: string): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.post(
          `${API_BASE_URL}/operators/${operatorId}/drivers/${driverId}/reject`,
          { reason },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setDrivers((prev) =>
          prev.map((d) => (d.id === driverId ? { ...d, status: 'rejected' } : d))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to reject driver'));
        return false;
      }
    },
    [token, operatorId, API_BASE_URL]
  );

  const suspendDriver = useCallback(
    async (driverId: string, reason: string): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.post(
          `${API_BASE_URL}/operators/${operatorId}/drivers/${driverId}/suspend`,
          { reason },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setDrivers((prev) =>
          prev.map((d) => (d.id === driverId ? { ...d, status: 'suspended' } : d))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to suspend driver'));
        return false;
      }
    },
    [token, operatorId, API_BASE_URL]
  );

  const unsuspendDriver = useCallback(
    async (driverId: string): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.post(
          `${API_BASE_URL}/operators/${operatorId}/drivers/${driverId}/unsuspend`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setDrivers((prev) =>
          prev.map((d) => (d.id === driverId ? { ...d, status: 'approved' } : d))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to unsuspend driver'));
        return false;
      }
    },
    [token, operatorId, API_BASE_URL]
  );

  const setCommissionRate = useCallback(
    async (driverId: string, rate: number): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.put(
          `${API_BASE_URL}/operators/${operatorId}/drivers/${driverId}/commission`,
          { rate },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setDrivers((prev) =>
          prev.map((d) => (d.id === driverId ? { ...d, commissionRate: rate } : d))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update commission rate'));
        return false;
      }
    },
    [token, operatorId, API_BASE_URL]
  );

  const bulkApprove = useCallback(
    async (driverIds: string[]): Promise<number> => {
      if (!token) return 0;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/operators/${operatorId}/drivers/bulk-approve`,
          { driverIds },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        await fetchDrivers();
        return response.data.approved || driverIds.length;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Bulk approve failed'));
        return 0;
      }
    },
    [token, operatorId, API_BASE_URL, fetchDrivers]
  );

  const bulkReject = useCallback(
    async (driverIds: string[]): Promise<number> => {
      if (!token) return 0;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/operators/${operatorId}/drivers/bulk-reject`,
          { driverIds },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        await fetchDrivers();
        return response.data.rejected || driverIds.length;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Bulk reject failed'));
        return 0;
      }
    },
    [token, operatorId, API_BASE_URL, fetchDrivers]
  );

  const removeDriver = useCallback(
    async (driverId: string): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.delete(
          `${API_BASE_URL}/operators/${operatorId}/drivers/${driverId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setDrivers((prev) => prev.filter((d) => d.id !== driverId));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to remove driver'));
        return false;
      }
    },
    [token, operatorId, API_BASE_URL]
  );

  const sendMessage = useCallback(
    async (driverId: string, message: string): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.post(
          `${API_BASE_URL}/operators/${operatorId}/drivers/${driverId}/message`,
          { message },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to send message'));
        return false;
      }
    },
    [token, operatorId, API_BASE_URL]
  );

  const getDriverStats = useCallback((driverId: string) => {
    const driver = drivers.find((d) => d.id === driverId);
    if (!driver) return null;

    return {
      totalEarnings: driver.totalEarnings,
      totalRides: driver.totalRides,
      averageRating: driver.averageRating,
      earningsPerRide: driver.totalRides > 0 ? driver.totalEarnings / driver.totalRides : 0,
      status: driver.status,
    };
  }, [drivers]);

  return {
    drivers,
    loading,
    error,
    fetchDrivers,
    approveDriver,
    rejectDriver,
    suspendDriver,
    unsuspendDriver,
    setCommissionRate,
    bulkApprove,
    bulkReject,
    removeDriver,
    sendMessage,
    getDriverStats,
  };
};
