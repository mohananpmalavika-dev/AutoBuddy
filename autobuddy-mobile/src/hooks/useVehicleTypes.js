import { useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../lib/api';

/**
 * Hook for managing vehicle types from backend
 * Fetches available vehicle types for drivers and passengers
 */
export function useVehicleTypes() {
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchVehicleTypes = useCallback(async (token = null) => {
    setLoading(true);
    setError('');
    
    try {
      const endpoint = token 
        ? '/admin/vehicle-types/'  // Admin endpoint for all types
        : '/api/admin/vehicle-types/public/all';  // Public endpoint
      
      const data = await apiRequest(endpoint, { token });
      setVehicleTypes(data || []);
      return data || [];
    } catch (err) {
      const errorMsg = err?.message || 'Failed to fetch vehicle types';
      setError(errorMsg);
      console.error('Error fetching vehicle types:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch vehicle types on mount
  useEffect(() => {
    fetchVehicleTypes();
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
