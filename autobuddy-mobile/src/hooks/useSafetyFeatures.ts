import { useState, useCallback } from 'react';
import axios from 'axios';

export interface EmergencyContact {
  id: string;
  name: string;
  phone: string;
  relationship: string;
}

export interface SafetyIncident {
  id: string;
  type: 'safety_concern' | 'harassment' | 'vehicle_issue' | 'accident' | 'other';
  description: string;
  rideId: string;
  driverId?: string;
  passengerId: string;
  status: 'reported' | 'investigating' | 'resolved';
  createdAt: Date;
  resolvedAt?: Date;
}

export interface TripShare {
  id: string;
  rideId: string;
  sharedWith: string[];
  expiresAt: Date;
  accessLog: { sharedAt: Date; accessedAt?: Date }[];
}

interface UseSafetyFeaturesReturn {
  emergencyContacts: EmergencyContact[];
  incidents: SafetyIncident[];
  tripShares: TripShare[];
  loading: boolean;
  error: Error | null;
  fetchEmergencyContacts: () => Promise<void>;
  addEmergencyContact: (contact: Omit<EmergencyContact, 'id'>) => Promise<EmergencyContact | null>;
  removeEmergencyContact: (contactId: string) => Promise<boolean>;
  triggerSOS: (rideId: string, location: { lat: number; lng: number }) => Promise<boolean>;
  reportIncident: (incident: Omit<SafetyIncident, 'id' | 'createdAt' | 'status'>) => Promise<SafetyIncident | null>;
  fetchIncidents: (userId: string) => Promise<void>;
  shareTrip: (rideId: string, phoneNumbers: string[]) => Promise<TripShare | null>;
  stopSharingTrip: (shareId: string) => Promise<boolean>;
  callEmergency: (contactId: string, rideId?: string) => Promise<boolean>;
  callDriver: (driverId: string) => Promise<boolean>;
  getSafetyTips: () => Promise<string[]>;
  enableLocationTracking: (rideId: string) => Promise<boolean>;
  disableLocationTracking: (rideId: string) => Promise<boolean>;
}

export const useSafetyFeatures = (token: string | null, userId: string): UseSafetyFeaturesReturn => {
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [incidents, setIncidents] = useState<SafetyIncident[]>([]);
  const [tripShares, setTripShares] = useState<TripShare[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

  const fetchEmergencyContacts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/users/${userId}/emergency-contacts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setEmergencyContacts(response.data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch contacts'));
    } finally {
      setLoading(false);
    }
  }, [token, userId, API_BASE_URL]);

  const addEmergencyContact = useCallback(
    async (contact: Omit<EmergencyContact, 'id'>): Promise<EmergencyContact | null> => {
      if (!token) return null;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/users/${userId}/emergency-contacts`,
          contact,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const newContact = response.data;
        setEmergencyContacts((prev) => [...prev, newContact]);
        return newContact;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to add contact'));
        return null;
      }
    },
    [token, userId, API_BASE_URL]
  );

  const removeEmergencyContact = useCallback(
    async (contactId: string): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.delete(`${API_BASE_URL}/users/${userId}/emergency-contacts/${contactId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setEmergencyContacts((prev) => prev.filter((c) => c.id !== contactId));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to remove contact'));
        return false;
      }
    },
    [token, userId, API_BASE_URL]
  );

  const triggerSOS = useCallback(
    async (rideId: string, location: { lat: number; lng: number }): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.post(
          `${API_BASE_URL}/rides/${rideId}/sos`,
          { location, triggeredBy: userId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        // Notify all emergency contacts immediately
        for (const contact of emergencyContacts) {
          await callEmergency(contact.id, rideId);
        }
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to trigger SOS'));
        return false;
      }
    },
    [token, userId, API_BASE_URL, emergencyContacts]
  );

  const reportIncident = useCallback(
    async (incident: Omit<SafetyIncident, 'id' | 'createdAt' | 'status'>): Promise<SafetyIncident | null> => {
      if (!token) return null;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/safety/incidents`,
          { ...incident, passengerId: userId },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const newIncident = response.data;
        setIncidents((prev) => [...prev, newIncident]);
        return newIncident;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to report incident'));
        return null;
      }
    },
    [token, userId, API_BASE_URL]
  );

  const fetchIncidents = useCallback(
    async (queryUserId: string) => {
      if (!token) return;
      try {
        const response = await axios.get(`${API_BASE_URL}/safety/incidents`, {
          params: { userId: queryUserId },
          headers: { Authorization: `Bearer ${token}` },
        });
        setIncidents(response.data);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch incidents'));
      }
    },
    [token, API_BASE_URL]
  );

  const shareTrip = useCallback(
    async (rideId: string, phoneNumbers: string[]): Promise<TripShare | null> => {
      if (!token) return null;
      try {
        const response = await axios.post(
          `${API_BASE_URL}/rides/${rideId}/share`,
          { phoneNumbers },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const share = response.data;
        setTripShares((prev) => [...prev, share]);
        return share;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to share trip'));
        return null;
      }
    },
    [token, API_BASE_URL]
  );

  const stopSharingTrip = useCallback(
    async (shareId: string): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.delete(`${API_BASE_URL}/trip-shares/${shareId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setTripShares((prev) => prev.filter((s) => s.id !== shareId));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to stop sharing'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const callEmergency = useCallback(
    async (contactId: string, rideId?: string): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.post(
          `${API_BASE_URL}/emergency-contacts/${contactId}/call`,
          { rideId, location: 'auto' },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to call emergency contact'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const callDriver = useCallback(
    async (driverId: string): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.post(
          `${API_BASE_URL}/drivers/${driverId}/call`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to call driver'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const getSafetyTips = useCallback(async (): Promise<string[]> => {
    try {
      const response = await axios.get(`${API_BASE_URL}/safety/tips`);
      return response.data.tips || [];
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch safety tips'));
      return [];
    }
  }, [API_BASE_URL]);

  const enableLocationTracking = useCallback(
    async (rideId: string): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.post(
          `${API_BASE_URL}/rides/${rideId}/location-tracking/enable`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to enable location tracking'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const disableLocationTracking = useCallback(
    async (rideId: string): Promise<boolean> => {
      if (!token) return false;
      try {
        await axios.post(
          `${API_BASE_URL}/rides/${rideId}/location-tracking/disable`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to disable location tracking'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  return {
    emergencyContacts,
    incidents,
    tripShares,
    loading,
    error,
    fetchEmergencyContacts,
    addEmergencyContact,
    removeEmergencyContact,
    triggerSOS,
    reportIncident,
    fetchIncidents,
    shareTrip,
    stopSharingTrip,
    callEmergency,
    callDriver,
    getSafetyTips,
    enableLocationTracking,
    disableLocationTracking,
  };
};
