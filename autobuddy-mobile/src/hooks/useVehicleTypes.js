import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../lib/api';
import { getDisplayText } from '../lib/displayText';

const FALLBACK_VEHICLE_TYPES = Object.freeze([
  {
    id: 'auto',
    vehicle_type_id: 'auto',
    name: 'Auto',
    label: 'Auto',
    description: 'Budget-friendly auto rickshaw',
    capacity: 3,
    capacity_unit: 'passengers',
    base_multiplier: 0.75,
    allowed_ride_types: ['instant', 'scheduled', 'ev_auto', 'tourism', 'women_only', 'pet'],
    passenger_supported: true,
    goods_supported: false,
    active: true,
  },
  {
    id: 'ev_auto',
    vehicle_type_id: 'ev_auto',
    name: 'EV Auto',
    label: 'EV Auto',
    description: 'Electric auto rickshaw',
    capacity: 3,
    capacity_unit: 'passengers',
    base_multiplier: 0.8,
    allowed_ride_types: ['instant', 'scheduled', 'ev_auto', 'women_only'],
    passenger_supported: true,
    goods_supported: false,
    active: true,
  },
  {
    id: 'taxi',
    vehicle_type_id: 'taxi',
    name: 'Taxi',
    label: 'Taxi',
    description: 'Comfortable sedan',
    capacity: 4,
    capacity_unit: 'passengers',
    base_multiplier: 1,
    allowed_ride_types: ['instant', 'scheduled', 'airport', 'corporate', 'intercity', 'tourism', 'women_only', 'pet'],
    passenger_supported: true,
    goods_supported: false,
    active: true,
  },
  {
    id: 'xl',
    vehicle_type_id: 'xl',
    name: 'XL',
    label: 'XL',
    description: 'Larger passenger vehicle',
    capacity: 6,
    capacity_unit: 'passengers',
    base_multiplier: 1.25,
    allowed_ride_types: ['instant', 'scheduled', 'airport', 'corporate', 'intercity', 'tourism', 'women_only', 'pet'],
    passenger_supported: true,
    goods_supported: false,
    active: true,
  },
  {
    id: 'traveller',
    vehicle_type_id: 'traveller',
    name: 'Traveller',
    label: 'Traveller',
    description: 'Group travel vehicle',
    capacity: 8,
    capacity_unit: 'passengers',
    base_multiplier: 1.25,
    allowed_ride_types: ['instant', 'scheduled', 'rental', 'intercity', 'tourism'],
    passenger_supported: true,
    goods_supported: false,
    active: true,
  },
  {
    id: 'minitruck',
    vehicle_type_id: 'minitruck',
    name: 'Mini Truck',
    label: 'Mini Truck',
    description: 'Small goods delivery',
    capacity: 1000,
    capacity_unit: 'kg',
    base_multiplier: 1.5,
    allowed_ride_types: ['instant', 'scheduled', 'goods'],
    passenger_supported: false,
    goods_supported: true,
    active: true,
  },
  {
    id: 'truck',
    vehicle_type_id: 'truck',
    name: 'Truck',
    label: 'Truck',
    description: 'Heavy goods vehicle',
    capacity: 10000,
    capacity_unit: 'kg',
    base_multiplier: 1.8,
    allowed_ride_types: ['instant', 'scheduled', 'goods'],
    passenger_supported: false,
    goods_supported: true,
    active: true,
  },
]);

/**
 * Hook for managing vehicle types from backend
 * Fetches available vehicle types for drivers and passengers
 */
export function useVehicleTypes() {
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const normalizeVehicleType = useCallback((vehicleType) => {
    if (!vehicleType || typeof vehicleType !== 'object') {
      return null;
    }

    const rawId = vehicleType.id || vehicleType.vehicle_type_id || vehicleType.type_id || vehicleType.key || '';
    const fallbackName = getDisplayText(rawId, 'Vehicle')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
    const name = getDisplayText(vehicleType.name || vehicleType.label || vehicleType.vehicle_type_name, fallbackName);
    const id = getDisplayText(rawId, name);

    return {
      ...vehicleType,
      id,
      name,
      label: getDisplayText(vehicleType.label, name),
      vehicle_type_name: getDisplayText(vehicleType.vehicle_type_name, name),
      description: getDisplayText(vehicleType.description, ''),
      icon: getDisplayText(vehicleType.icon, ''),
    };
  }, []);

  const fetchVehicleTypes = useCallback(async (token = null) => {
    setLoading(true);
    setError('');
    
    try {
      const endpoint = token 
        ? '/admin/vehicle-types/'  // Admin endpoint for all types
        : '/api/vehicles/public/all';  // Canonical public endpoint
      
      const data = await apiRequest(endpoint, { token });
      const rows = Array.isArray(data)
        ? data
        : Array.isArray(data?.data)
          ? data.data
          : Array.isArray(data?.vehicle_types)
            ? data.vehicle_types
            : [];
      const nextVehicleTypes = rows
        .map(normalizeVehicleType)
        .filter(Boolean);
      setVehicleTypes(nextVehicleTypes);
      return nextVehicleTypes;
    } catch (err) {
      const errorMsg = err?.message || 'Failed to fetch vehicle types';
      if (!token) {
        const fallbackVehicleTypes = FALLBACK_VEHICLE_TYPES
          .map(normalizeVehicleType)
          .filter(Boolean);
        setVehicleTypes(fallbackVehicleTypes);
        setError('');
        console.warn('Vehicle types API unavailable, using defaults:', errorMsg);
        return fallbackVehicleTypes;
      }
      setError(errorMsg);
      console.error('Error fetching vehicle types:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, [normalizeVehicleType]);

  // Fetch vehicle types on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchVehicleTypes();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchVehicleTypes]);

  const createVehicleType = useCallback(async (token, vehicleTypeData) => {
    try {
      const data = await apiRequest('/admin/vehicle-types/', {
        method: 'POST',
        token,
        body: vehicleTypeData
      });
      
      // Refresh list
      await fetchVehicleTypes(token);
      return { success: true, data };
    } catch (err) {
      const errorMsg = err?.message || 'Failed to create vehicle type';
      console.error('Error creating vehicle type:', err);
      return { success: false, error: errorMsg };
    }
  }, [fetchVehicleTypes]);

  const updateVehicleType = useCallback(async (token, vehicleTypeId, updateData) => {
    try {
      const data = await apiRequest(`/admin/vehicle-types/${vehicleTypeId}`, {
        method: 'PUT',
        token,
        body: updateData
      });
      
      // Refresh list
      await fetchVehicleTypes(token);
      return { success: true, data };
    } catch (err) {
      const errorMsg = err?.message || 'Failed to update vehicle type';
      console.error('Error updating vehicle type:', err);
      return { success: false, error: errorMsg };
    }
  }, [fetchVehicleTypes]);

  const deleteVehicleType = useCallback(async (token, vehicleTypeId) => {
    try {
      const data = await apiRequest(`/admin/vehicle-types/${vehicleTypeId}`, {
        method: 'DELETE',
        token
      });
      
      // Refresh list
      await fetchVehicleTypes(token);
      return { success: true, data };
    } catch (err) {
      const errorMsg = err?.message || 'Failed to delete vehicle type';
      console.error('Error deleting vehicle type:', err);
      return { success: false, error: errorMsg };
    }
  }, [fetchVehicleTypes]);

  const activateVehicleType = useCallback(async (token, vehicleTypeId) => {
    try {
      const data = await apiRequest(`/admin/vehicle-types/${vehicleTypeId}/activate`, {
        method: 'POST',
        token
      });
      
      // Refresh list
      await fetchVehicleTypes(token);
      return { success: true, data };
    } catch (err) {
      const errorMsg = err?.message || 'Failed to activate vehicle type';
      console.error('Error activating vehicle type:', err);
      return { success: false, error: errorMsg };
    }
  }, [fetchVehicleTypes]);

  return {
    vehicleTypes,
    loading,
    error,
    fetchVehicleTypes,
    createVehicleType,
    updateVehicleType,
    deleteVehicleType,
    activateVehicleType
  };
}
