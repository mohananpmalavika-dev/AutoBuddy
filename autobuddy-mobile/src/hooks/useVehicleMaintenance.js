import { useCallback, useState } from 'react';
import { apiRequest } from '../lib/api';

const MAINTENANCE_TYPES = {
  oil_change: 'Oil Change',
  tire_rotation: 'Tire Rotation',
  air_filter: 'Air Filter',
  spark_plugs: 'Spark Plugs',
  brake_service: 'Brake Service',
  battery: 'Battery',
  inspection: 'Annual Inspection',
  registration: 'Vehicle Registration',
  insurance: 'Insurance Renewal',
};

export function useVehicleMaintenance({ token, vehicleId }) {
  const [maintenanceRecords, setMaintenanceRecords] = useState([]);
  const [documentExpiries, setDocumentExpiries] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Load maintenance history
  const loadMaintenanceHistory = useCallback(async () => {
    if (!token || !vehicleId) return;

    setIsLoading(true);
    setError('');

    try {
      const response = await apiRequest(`/drivers-tier2/vehicles/${vehicleId}/maintenance`, {
        method: 'GET',
        token,
      });

      const payload = response?.data || response;
      setMaintenanceRecords(payload?.records || []);
    } catch (err) {
      setError(`Failed to load maintenance: ${err.message}`);
      console.warn('Load maintenance error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, vehicleId]);

  // Load document expiry tracking
  const loadDocumentExpiries = useCallback(async () => {
    if (!token || !vehicleId) return;

    setIsLoading(true);
    setError('');

    try {
      const response = await apiRequest(`/drivers-tier2/vehicles/${vehicleId}/document-expiry`, {
        method: 'GET',
        token,
      });

      const payload = response?.data || response;
      setDocumentExpiries(payload?.documents || []);
    } catch (err) {
      setError(`Failed to load documents: ${err.message}`);
      console.warn('Load documents error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, vehicleId]);

  // Log maintenance service
  const logMaintenance = useCallback(
    async (maintenanceType, serviceDate, nextDueDate, cost = null, receiptUrl = null) => {
      if (!token || !vehicleId) {
        setError('Missing required data');
        return false;
      }

      setIsLoading(true);
      setError('');

      try {
        await apiRequest(`/drivers-tier2/vehicles/${vehicleId}/maintenance`, {
          method: 'POST',
          token,
          body: {
            maintenance_type: maintenanceType,
            service_date: serviceDate,
            next_due_date: nextDueDate,
            cost,
            receipt_url: receiptUrl,
          },
        });

        // Reload maintenance history
        await loadMaintenanceHistory();
        return true;
      } catch (err) {
        setError(`Failed to log maintenance: ${err.message}`);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [token, vehicleId, loadMaintenanceHistory]
  );

  // Get maintenance due items
  const getMaintenanceDue = useCallback(async () => {
    if (!token || !vehicleId) return [];

    try {
      const response = await apiRequest(`/drivers-tier2/vehicles/${vehicleId}/maintenance-due`, {
        method: 'GET',
        token,
      });

      const payload = response?.data || response;
      return payload?.due_items || [];
    } catch (err) {
      console.warn('Failed to get maintenance due:', err);
      return [];
    }
  }, [token, vehicleId]);

  // Get document expiry alerts
  const getExpiryAlerts = useCallback(() => {
    return documentExpiries.filter((doc) => {
      const today = new Date();
      const expiryDate = new Date(doc.expiry_date);
      const daysUntilExpiry = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));
      return daysUntilExpiry <= doc.alert_days_before;
    });
  }, [documentExpiries]);

  // Check if maintenance is overdue
  const isOverdue = useCallback((record) => {
    if (!record.next_due_date) return false;
    const today = new Date();
    return new Date(record.next_due_date) < today;
  }, []);

  return {
    maintenanceRecords,
    documentExpiries,
    isLoading,
    error,
    MAINTENANCE_TYPES,
    loadMaintenanceHistory,
    loadDocumentExpiries,
    logMaintenance,
    getMaintenanceDue,
    getExpiryAlerts,
    isOverdue,
  };
}
