import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface FleetVehicle {
  id: string;
  registration: string;
  make: string;
  model: string;
  year: number;
  type: 'sedan' | 'suv' | 'hatchback' | 'van';
  color: string;
  seatingCapacity: number;
  fuelType: 'petrol' | 'diesel' | 'electric' | 'hybrid';
  status: 'active' | 'maintenance' | 'inactive' | 'damaged';
  mileage: number;
  lastServiceDate: number;
  insuranceExpiryDate: number;
  pollutionCertExpiryDate: number;
  ownerId: string;
  currentDriver?: string;
  addedDate: number;
  totalRides: number;
  averageRating: number;
}

export interface MaintenanceRecord {
  id: string;
  vehicleId: string;
  type: 'routine' | 'repair' | 'inspection';
  description: string;
  cost: number;
  date: number;
  nextDueDate?: number;
  odometer: number;
  notes?: string;
}

export interface FleetAnalytics {
  totalVehicles: number;
  activeVehicles: number;
  vehiclesInMaintenance: number;
  totalKilometrage: number;
  averageAgeInYears: number;
  fuelCostPerKm: number;
  maintenanceCostMonthly: number;
  utilizationRate: number;
  totalRides: number;
  averageFleetRating: number;
}

export interface DriverAssignment {
  id: string;
  driverId: string;
  vehicleId: string;
  assignedDate: number;
  unassignedDate?: number;
  status: 'active' | 'inactive';
}

interface UseOperatorFleetManagementReturn {
  vehicles: FleetVehicle[];
  maintenance: MaintenanceRecord[];
  drivers: DriverAssignment[];
  analytics: FleetAnalytics;
  addVehicle: (vehicle: Omit<FleetVehicle, 'id' | 'addedDate'>) => Promise<void>;
  updateVehicle: (id: string, updates: Partial<FleetVehicle>) => Promise<void>;
  removeVehicle: (id: string) => Promise<void>;
  assignDriver: (driverId: string, vehicleId: string) => Promise<void>;
  unassignDriver: (vehicleId: string) => Promise<void>;
  addMaintenanceRecord: (record: Omit<MaintenanceRecord, 'id'>) => Promise<void>;
  getMaintenanceHistory: (vehicleId: string) => Promise<MaintenanceRecord[]>;
  getFleetAnalytics: () => Promise<FleetAnalytics>;
  getVehicleById: (id: string) => FleetVehicle | undefined;
  getActiveVehicles: () => FleetVehicle[];
  getVehiclesNeedingService: () => FleetVehicle[];
}

const FLEET_STORAGE_KEY = 'fleet_vehicles';
const MAINTENANCE_STORAGE_KEY = 'fleet_maintenance';
const DRIVERS_STORAGE_KEY = 'fleet_drivers';

export const useOperatorFleetManagement = (operatorId: string): UseOperatorFleetManagementReturn => {
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>([]);
  const [drivers, setDrivers] = useState<DriverAssignment[]>([]);
  const [analytics, setAnalytics] = useState<FleetAnalytics>({
    totalVehicles: 0,
    activeVehicles: 0,
    vehiclesInMaintenance: 0,
    totalKilometrage: 0,
    averageAgeInYears: 0,
    fuelCostPerKm: 0,
    maintenanceCostMonthly: 0,
    utilizationRate: 0,
    totalRides: 0,
    averageFleetRating: 0,
  });

  useEffect(() => {
    initializeFleetData();
  }, [operatorId]);

  const initializeFleetData = async () => {
    try {
      const storedVehicles = await AsyncStorage.getItem(`${FLEET_STORAGE_KEY}_${operatorId}`);
      if (storedVehicles) {
        setVehicles(JSON.parse(storedVehicles));
      }

      const storedMaintenance = await AsyncStorage.getItem(
        `${MAINTENANCE_STORAGE_KEY}_${operatorId}`,
      );
      if (storedMaintenance) {
        setMaintenance(JSON.parse(storedMaintenance));
      }

      const storedDrivers = await AsyncStorage.getItem(`${DRIVERS_STORAGE_KEY}_${operatorId}`);
      if (storedDrivers) {
        setDrivers(JSON.parse(storedDrivers));
      }

      await calculateAnalytics(storedVehicles ? JSON.parse(storedVehicles) : []);
    } catch (error) {
      console.error('Failed to initialize fleet data:', error);
    }
  };

  const calculateAnalytics = async (vehiclesList: FleetVehicle[]) => {
    const activeCount = vehiclesList.filter((v) => v.status === 'active').length;
    const maintenanceCount = vehiclesList.filter((v) => v.status === 'maintenance').length;
    const totalKm = vehiclesList.reduce((sum, v) => sum + v.mileage, 0);
    const totalRides = vehiclesList.reduce((sum, v) => sum + v.totalRides, 0);
    const avgRating =
      vehiclesList.reduce((sum, v) => sum + v.averageRating, 0) / (vehiclesList.length || 1);

    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const maintenanceLastMonth = maintenance.filter((m) => m.date > thirtyDaysAgo);
    const monthlyCost = maintenanceLastMonth.reduce((sum, m) => sum + m.cost, 0);

    setAnalytics({
      totalVehicles: vehiclesList.length,
      activeVehicles: activeCount,
      vehiclesInMaintenance: maintenanceCount,
      totalKilometrage: totalKm,
      averageAgeInYears:
        vehiclesList.reduce((sum, v) => sum + (new Date().getFullYear() - v.year), 0) /
        (vehiclesList.length || 1),
      fuelCostPerKm: Math.round((totalKm > 0 ? monthlyCost / totalKm : 0) * 100) / 100,
      maintenanceCostMonthly: monthlyCost,
      utilizationRate: vehiclesList.length > 0 ? (activeCount / vehiclesList.length) * 100 : 0,
      totalRides,
      averageFleetRating: Math.round(avgRating * 10) / 10,
    });
  };

  const addVehicle = useCallback(
    async (vehicle: Omit<FleetVehicle, 'id' | 'addedDate'>) => {
      try {
        const newVehicle: FleetVehicle = {
          ...vehicle,
          id: `vehicle_${Date.now()}`,
          addedDate: Date.now(),
        };

        const updatedVehicles = [...vehicles, newVehicle];
        setVehicles(updatedVehicles);
        await AsyncStorage.setItem(
          `${FLEET_STORAGE_KEY}_${operatorId}`,
          JSON.stringify(updatedVehicles),
        );
        await calculateAnalytics(updatedVehicles);
      } catch (error) {
        console.error('Failed to add vehicle:', error);
        throw error;
      }
    },
    [vehicles, operatorId],
  );

  const updateVehicle = useCallback(
    async (id: string, updates: Partial<FleetVehicle>) => {
      try {
        const updatedVehicles = vehicles.map((v) => (v.id === id ? { ...v, ...updates } : v));
        setVehicles(updatedVehicles);
        await AsyncStorage.setItem(
          `${FLEET_STORAGE_KEY}_${operatorId}`,
          JSON.stringify(updatedVehicles),
        );
        await calculateAnalytics(updatedVehicles);
      } catch (error) {
        console.error('Failed to update vehicle:', error);
        throw error;
      }
    },
    [vehicles, operatorId],
  );

  const removeVehicle = useCallback(
    async (id: string) => {
      try {
        const updatedVehicles = vehicles.filter((v) => v.id !== id);
        setVehicles(updatedVehicles);
        await AsyncStorage.setItem(
          `${FLEET_STORAGE_KEY}_${operatorId}`,
          JSON.stringify(updatedVehicles),
        );
        await calculateAnalytics(updatedVehicles);
      } catch (error) {
        console.error('Failed to remove vehicle:', error);
        throw error;
      }
    },
    [vehicles, operatorId],
  );

  const assignDriver = useCallback(
    async (driverId: string, vehicleId: string) => {
      try {
        const existing = drivers.find(
          (d) => d.vehicleId === vehicleId && d.status === 'active',
        );
        const updatedDrivers = existing
          ? drivers.map((d) =>
              d.id === existing.id
                ? { ...d, driverId, assignedDate: Date.now() }
                : d,
            )
          : [
              ...drivers,
              {
                id: `assignment_${Date.now()}`,
                driverId,
                vehicleId,
                assignedDate: Date.now(),
                status: 'active' as const,
              },
            ];

        setDrivers(updatedDrivers);
        await AsyncStorage.setItem(
          `${DRIVERS_STORAGE_KEY}_${operatorId}`,
          JSON.stringify(updatedDrivers),
        );
      } catch (error) {
        console.error('Failed to assign driver:', error);
        throw error;
      }
    },
    [drivers, operatorId],
  );

  const unassignDriver = useCallback(
    async (vehicleId: string) => {
      try {
        const updatedDrivers = drivers.map((d) =>
          d.vehicleId === vehicleId
            ? { ...d, status: 'inactive' as const, unassignedDate: Date.now() }
            : d,
        );
        setDrivers(updatedDrivers);
        await AsyncStorage.setItem(
          `${DRIVERS_STORAGE_KEY}_${operatorId}`,
          JSON.stringify(updatedDrivers),
        );
      } catch (error) {
        console.error('Failed to unassign driver:', error);
        throw error;
      }
    },
    [drivers, operatorId],
  );

  const addMaintenanceRecord = useCallback(
    async (record: Omit<MaintenanceRecord, 'id'>) => {
      try {
        const newRecord: MaintenanceRecord = {
          ...record,
          id: `maintenance_${Date.now()}`,
        };

        const updatedMaintenance = [...maintenance, newRecord];
        setMaintenance(updatedMaintenance);
        await AsyncStorage.setItem(
          `${MAINTENANCE_STORAGE_KEY}_${operatorId}`,
          JSON.stringify(updatedMaintenance),
        );

        await updateVehicle(record.vehicleId, { mileage: record.odometer });
      } catch (error) {
        console.error('Failed to add maintenance record:', error);
        throw error;
      }
    },
    [maintenance, operatorId, updateVehicle],
  );

  const getMaintenanceHistory = useCallback(
    async (vehicleId: string): Promise<MaintenanceRecord[]> => {
      return maintenance.filter((m) => m.vehicleId === vehicleId);
    },
    [maintenance],
  );

  const getFleetAnalytics = useCallback(async (): Promise<FleetAnalytics> => {
    return analytics;
  }, [analytics]);

  const getVehicleById = useCallback(
    (id: string): FleetVehicle | undefined => {
      return vehicles.find((v) => v.id === id);
    },
    [vehicles],
  );

  const getActiveVehicles = useCallback((): FleetVehicle[] => {
    return vehicles.filter((v) => v.status === 'active');
  }, [vehicles]);

  const getVehiclesNeedingService = useCallback((): FleetVehicle[] => {
    const now = Date.now();
    return vehicles.filter((v) => {
      const lastServiceMonthsAgo =
        (now - v.lastServiceDate) / (1000 * 60 * 60 * 24 * 30);
      const insuranceExpired = v.insuranceExpiryDate < now;
      const pollutionExpired = v.pollutionCertExpiryDate < now;

      return lastServiceMonthsAgo > 3 || insuranceExpired || pollutionExpired;
    });
  }, [vehicles]);

  return {
    vehicles,
    maintenance,
    drivers,
    analytics,
    addVehicle,
    updateVehicle,
    removeVehicle,
    assignDriver,
    unassignDriver,
    addMaintenanceRecord,
    getMaintenanceHistory,
    getFleetAnalytics,
    getVehicleById,
    getActiveVehicles,
    getVehiclesNeedingService,
  };
};
