import { useState, useCallback } from 'react';
import axios from 'axios';

export interface Vehicle {
  id: string;
  driverId: string;
  type: 'sedan' | 'suv' | 'hatchback' | 'auto' | 'bike';
  registrationNumber: string;
  make: string;
  model: string;
  year: number;
  color: string;
  fuelType: 'petrol' | 'diesel' | 'electric' | 'hybrid';
  registrationExpiry: Date;
  insuranceExpiry: Date;
  pollutionExpiry: Date;
  pucNumber?: string;
  registrationCertificate?: string;
  insuranceCertificate?: string;
  documents: {
    type: 'rc' | 'insurance' | 'pollution' | 'puc';
    fileUrl: string;
    expiryDate: Date;
  }[];
  maintenanceHistory: MaintenanceRecord[];
  status: 'active' | 'inactive' | 'maintenance' | 'rejected';
  createdAt: Date;
  lastVerified?: Date;
}

export interface MaintenanceRecord {
  id: string;
  vehicleId: string;
  date: Date;
  type: 'service' | 'repair' | 'inspection';
  description: string;
  cost: number;
  nextDueDate?: Date;
  mileage?: number;
}

interface UseVehicleManagementReturn {
  vehicles: Vehicle[];
  loading: boolean;
  error: Error | null;
  fetchVehicles: () => Promise<void>;
  addVehicle: (vehicleData: Omit<Vehicle, 'id' | 'createdAt' | 'documents' | 'maintenanceHistory'>) => Promise<Vehicle | null>;
  updateVehicle: (vehicleId: string, updates: Partial<Vehicle>) => Promise<boolean>;
  deleteVehicle: (vehicleId: string) => Promise<boolean>;
  uploadVehicleDocument: (vehicleId: string, docType: string, filePath: string) => Promise<boolean>;
  getExpiringDocuments: (daysUntilExpiry?: number) => Vehicle[];
  addMaintenanceRecord: (vehicleId: string, record: Omit<MaintenanceRecord, 'id'>) => Promise<boolean>;
  getMaintenanceHistory: (vehicleId: string) => MaintenanceRecord[];
  setVehicleStatus: (vehicleId: string, status: Vehicle['status']) => Promise<boolean>;
  getActiveVehicles: () => Vehicle[];
  getVehicleStats: () => any;
}

export const useVehicleManagement = (token: string | null, driverId: string): UseVehicleManagementReturn => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

  const fetchVehicles = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/drivers/${driverId}/vehicles`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setVehicles(response.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch vehicles'));
    } finally {
      setLoading(false);
    }
  }, [token, driverId, API_BASE_URL]);

  const addVehicle = useCallback(
    async (vehicleData: Omit<Vehicle, 'id' | 'createdAt' | 'documents' | 'maintenanceHistory'>): Promise<Vehicle | null> => {
      if (!token) return null;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/drivers/${driverId}/vehicles`,
          { ...vehicleData, driverId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const newVehicle = response.data;
        setVehicles((prev) => [...prev, newVehicle]);
        return newVehicle;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to add vehicle'));
        return null;
      }
    },
    [token, driverId, API_BASE_URL]
  );

  const updateVehicle = useCallback(
    async (vehicleId: string, updates: Partial<Vehicle>): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.put(
          `${API_BASE_URL}/drivers/${driverId}/vehicles/${vehicleId}`,
          updates,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setVehicles((prev) =>
          prev.map((v) => (v.id === vehicleId ? { ...v, ...updates } : v))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update vehicle'));
        return false;
      }
    },
    [token, driverId, API_BASE_URL]
  );

  const deleteVehicle = useCallback(
    async (vehicleId: string): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.delete(
          `${API_BASE_URL}/drivers/${driverId}/vehicles/${vehicleId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setVehicles((prev) => prev.filter((v) => v.id !== vehicleId));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to delete vehicle'));
        return false;
      }
    },
    [token, driverId, API_BASE_URL]
  );

  const uploadVehicleDocument = useCallback(
    async (vehicleId: string, docType: string, filePath: string): Promise<boolean> => {
      if (!token) return false;
      try {
        const formData = new FormData();
        formData.append('file', {
          uri: filePath,
          type: 'application/pdf',
          name: `${docType}_${Date.now()}.pdf`,
        } as any);
        formData.append('docType', docType);

        await axios.post(
          `${API_BASE_URL}/drivers/${driverId}/vehicles/${vehicleId}/documents`,
          formData,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'multipart/form-data',
            },
          }
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to upload document'));
        return false;
      }
    },
    [token, driverId, API_BASE_URL]
  );

  const getExpiringDocuments = useCallback(
    (daysUntilExpiry = 30): Vehicle[] => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + daysUntilExpiry * 24 * 60 * 60 * 1000);

      return vehicles.filter((vehicle) => {
        const expiringDocs = [
          vehicle.registrationExpiry,
          vehicle.insuranceExpiry,
          vehicle.pollutionExpiry,
        ];

        return expiringDocs.some(
          (date) => date && new Date(date) <= futureDate && new Date(date) > now
        );
      });
    },
    [vehicles]
  );

  const addMaintenanceRecord = useCallback(
    async (vehicleId: string, record: Omit<MaintenanceRecord, 'id'>): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.post(
          `${API_BASE_URL}/drivers/${driverId}/vehicles/${vehicleId}/maintenance`,
          record,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        await fetchVehicles();
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to add maintenance record'));
        return false;
      }
    },
    [token, driverId, API_BASE_URL, fetchVehicles]
  );

  const getMaintenanceHistory = useCallback(
    (vehicleId: string): MaintenanceRecord[] => {
      const vehicle = vehicles.find((v) => v.id === vehicleId);
      return vehicle?.maintenanceHistory || [];
    },
    [vehicles]
  );

  const setVehicleStatus = useCallback(
    async (vehicleId: string, status: Vehicle['status']): Promise<boolean> => {
      return updateVehicle(vehicleId, { status });
    },
    [updateVehicle]
  );

  const getActiveVehicles = useCallback(() => {
    return vehicles.filter((v) => v.status === 'active');
  }, [vehicles]);

  const getVehicleStats = useCallback(() => {
    return {
      total: vehicles.length,
      active: vehicles.filter((v) => v.status === 'active').length,
      maintenance: vehicles.filter((v) => v.status === 'maintenance').length,
      expiring: getExpiringDocuments().length,
      byType: vehicles.reduce(
        (acc, v) => {
          acc[v.type] = (acc[v.type] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    };
  }, [vehicles, getExpiringDocuments]);

  return {
    vehicles,
    loading,
    error,
    fetchVehicles,
    addVehicle,
    updateVehicle,
    deleteVehicle,
    uploadVehicleDocument,
    getExpiringDocuments,
    addMaintenanceRecord,
    getMaintenanceHistory,
    setVehicleStatus,
    getActiveVehicles,
    getVehicleStats,
  };
};
