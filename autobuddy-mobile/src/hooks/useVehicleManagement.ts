import { useEffect, useCallback, useState } from 'react';
import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface Vehicle {
  vehicle_id: string;
  vehicle_type: string;
  registration_number: string;
  make: string;
  model: string;
  year: number;
  color: string;
  is_active: boolean;
  is_verified: boolean;
}

interface VehicleDocument {
  document_id: string;
  type: string;
  number: string;
  expiry_date: string;
  status: string;
  days_to_expiry: number;
  is_expiring_soon: boolean;
  verified: boolean;
}

interface VehicleInsurance {
  insurance_id: string;
  provider_name: string;
  policy_number: string;
  cover_type: string;
  sum_insured: number;
  expiry_date: string;
  days_to_expiry: number;
  is_active: boolean;
}

interface MaintenanceRecord {
  maintenance_id: string;
  service_type: string;
  date: string;
  cost?: number;
  service_center: string;
}

export const useVehicleManagement = (driverId: string | null, authToken: string | null) => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [documents, setDocuments] = useState<VehicleDocument[]>([]);
  const [insurance, setInsurance] = useState<VehicleInsurance | null>(null);
  const [maintenanceHistory, setMaintenanceHistory] = useState<MaintenanceRecord[]>([]);
  const [expiringDocuments, setExpiringDocuments] = useState<VehicleDocument[]>([]);
  const [expiringInsurance, setExpiringInsurance] = useState<VehicleInsurance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchVehicles = useCallback(async () => {
    if (!driverId || !authToken) {return;}
    try {
      setIsLoading(true);
      const response = await axios.get(
        `${API_BASE_URL}/api/v3/vehicle-management/vehicles/${driverId}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      setVehicles(response.data.vehicles);
      setError(null);
    } catch (err) {
      console.error('Error fetching vehicles:', err);
      setError('Failed to load vehicles');
    } finally {
      setIsLoading(false);
    }
  }, [driverId, authToken]);

  const addVehicle = useCallback(
    async (vehicleType: string, registrationNumber: string, make: string, model: string, year: number, color: string, licensePlate: string) => {
      if (!driverId || !authToken) {return false;}
      try {
        setIsLoading(true);
        await axios.post(
          `${API_BASE_URL}/api/v3/vehicle-management/vehicles/add`,
          {
            vehicle_type: vehicleType,
            registration_number: registrationNumber,
            make,
            model,
            year,
            color,
            license_plate: licensePlate
          },
          {
            params: { driver_id: driverId },
            headers: { Authorization: `Bearer ${authToken}` }
          }
        );
        await fetchVehicles();
        return true;
      } catch (err) {
        console.error('Error adding vehicle:', err);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [driverId, authToken, fetchVehicles]
  );

  const getVehicleDetails = useCallback(
    async (vehicleId: string) => {
      if (!authToken) {return null;}
      try {
        setIsLoading(true);
        const response = await axios.get(
          `${API_BASE_URL}/api/v3/vehicle-management/vehicles/${vehicleId}/details`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        setDocuments(response.data.documents || []);
        setInsurance(response.data.insurance);
        return response.data;
      } catch (err) {
        console.error('Error fetching vehicle details:', err);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [authToken]
  );

  const updateVehicle = useCallback(
    async (vehicleId: string, updates: any) => {
      if (!authToken) {return false;}
      try {
        setIsLoading(true);
        await axios.put(
          `${API_BASE_URL}/api/v3/vehicle-management/vehicles/${vehicleId}`,
          updates,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        await fetchVehicles();
        return true;
      } catch (err) {
        console.error('Error updating vehicle:', err);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [authToken, fetchVehicles]
  );

  const deleteVehicle = useCallback(
    async (vehicleId: string) => {
      if (!authToken) {return false;}
      try {
        setIsLoading(true);
        await axios.delete(
          `${API_BASE_URL}/api/v3/vehicle-management/vehicles/${vehicleId}`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );
        await fetchVehicles();
        return true;
      } catch (err) {
        console.error('Error deleting vehicle:', err);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [authToken, fetchVehicles]
  );

  const getExpiringDocuments = useCallback(async () => {
    if (!driverId || !authToken) {return;}
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/v3/vehicle-management/drivers/${driverId}/documents/expiring-soon`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      setExpiringDocuments(response.data.expiring_documents);
    } catch (err) {
      console.error('Error fetching expiring documents:', err);
    }
  }, [driverId, authToken]);

  const getExpiringInsurance = useCallback(async () => {
    if (!driverId || !authToken) {return;}
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/v3/vehicle-management/drivers/${driverId}/insurance/expiring-soon`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      setExpiringInsurance(response.data.expiring_insurance);
    } catch (err) {
      console.error('Error fetching expiring insurance:', err);
    }
  }, [driverId, authToken]);

  const recordMaintenance = useCallback(
    async (vehicleId: string, serviceType: string, description: string, maintenanceDate: string, cost: number | null, serviceCenter: string) => {
      if (!driverId || !authToken) {return false;}
      try {
        setIsLoading(true);
        await axios.post(
          `${API_BASE_URL}/api/v3/vehicle-management/vehicles/${vehicleId}/maintenance/record`,
          {
            service_type: serviceType,
            description,
            maintenance_date: maintenanceDate,
            cost,
            service_center: serviceCenter
          },
          {
            params: { driver_id: driverId, vehicle_id: vehicleId },
            headers: { Authorization: `Bearer ${authToken}` }
          }
        );
        return true;
      } catch (err) {
        console.error('Error recording maintenance:', err);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [driverId, authToken]
  );

  useEffect(() => {
    if (driverId && authToken) {
      fetchVehicles();
      getExpiringDocuments();
      getExpiringInsurance();
    }
  }, [driverId, authToken, fetchVehicles, getExpiringDocuments, getExpiringInsurance]);

  return {
    vehicles,
    documents,
    insurance,
    maintenanceHistory,
    expiringDocuments,
    expiringInsurance,
    isLoading,
    error,
    fetchVehicles,
    addVehicle,
    getVehicleDetails,
    updateVehicle,
    deleteVehicle,
    getExpiringDocuments,
    getExpiringInsurance,
    recordMaintenance
  };
};
