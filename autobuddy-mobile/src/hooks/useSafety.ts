import { useEffect, useCallback, useState } from 'react';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface EmergencyContact {
  contact_id: string;
  name: string;
  phone: string;
  email?: string;
  relationship: string;
  is_primary: boolean;
}

interface SOSAlert {
  sos_id: string;
  status: string;
  reason: string;
  location: {
    latitude: number;
    longitude: number;
    address: string;
  };
  triggered_at: string;
  emergency_services_notified: boolean;
  emergency_contacts_notified: boolean;
}

interface IncidentReport {
  incident_id: string;
  type: string;
  severity: string;
  description: string;
  status: string;
  reported_at: string;
  location: {
    latitude: number;
    longitude: number;
    address: string;
  };
}

interface SafetyRating {
  rating_id: string;
  ride_id: string;
  score: number;
  is_safe: boolean;
  reason?: string;
  created_at: string;
}

interface SafetyProfile {
  user_id: string;
  safety_score: number;
  safety_level: string;
  total_ratings: number;
  safe_rides_percent: number;
  incidents_reported: number;
  sos_alerts_triggered: number;
  emergency_contacts_count: number;
  recent_incidents: IncidentReport[];
}

interface TrustCircle {
  circle_id: string;
  name: string;
  members_count: number;
  auto_share_location: boolean;
}

export const useSafety = (userId: string | null, authToken: string | null) => {
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContact[]>([]);
  const [sosAlert, setSOSAlert] = useState<SOSAlert | null>(null);
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  const [safetyRatings, setSafetyRatings] = useState<SafetyRating[]>([]);
  const [safetyProfile, setSafetyProfile] = useState<SafetyProfile | null>(null);
  const [trustCircles, setTrustCircles] = useState<TrustCircle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);

  // Fetch emergency contacts
  const fetchEmergencyContacts = useCallback(async () => {
    if (!userId || !authToken) return;

    try {
      setIsLoading(true);
      const response = await axios.get(
        `${API_BASE_URL}/api/v3/safety/emergency-contacts/${userId}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      setEmergencyContacts(response.data.contacts);
      setError(null);
    } catch (err) {
      console.error('Error fetching emergency contacts:', err);
      setError('Failed to load emergency contacts');
    } finally {
      setIsLoading(false);
    }
  }, [userId, authToken]);

  // Add emergency contact
  const addEmergencyContact = useCallback(
    async (
      name: string,
      phone: string,
      relationship: string,
      email?: string,
      isPrimary?: boolean
    ) => {
      if (!userId || !authToken) return false;

      try {
        setIsLoading(true);
        const response = await axios.post(
          `${API_BASE_URL}/api/v3/safety/emergency-contacts/add`,
          {
            name,
            phone,
            email,
            relationship,
            is_primary: isPrimary
          },
          {
            params: { user_id: userId },
            headers: { Authorization: `Bearer ${authToken}` }
          }
        );

        await fetchEmergencyContacts();
        setError(null);
        return true;
      } catch (err) {
        console.error('Error adding emergency contact:', err);
        setError('Failed to add emergency contact');
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [userId, authToken, fetchEmergencyContacts]
  );

  // Delete emergency contact
  const deleteEmergencyContact = useCallback(
    async (contactId: string) => {
      if (!authToken) return false;

      try {
        setIsLoading(true);
        await axios.delete(
          `${API_BASE_URL}/api/v3/safety/emergency-contacts/${contactId}`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );

        await fetchEmergencyContacts();
        return true;
      } catch (err) {
        console.error('Error deleting emergency contact:', err);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [authToken, fetchEmergencyContacts]
  );

  // Trigger SOS
  const triggerSOS = useCallback(
    async (
      reason: string,
      latitude: number,
      longitude: number,
      address: string,
      isDriver: boolean = false
    ) => {
      if (!userId || !authToken) return null;

      try {
        setIsLoading(true);
        const response = await axios.post(
          `${API_BASE_URL}/api/v3/safety/sos/trigger`,
          {
            user_id: userId,
            reason,
            location_latitude: latitude,
            location_longitude: longitude,
            location_address: address,
            is_driver: isDriver
          },
          { headers: { Authorization: `Bearer ${authToken}` } }
        );

        setSOSAlert(response.data);
        setError(null);
        return response.data;
      } catch (err) {
        console.error('Error triggering SOS:', err);
        setError('Failed to trigger SOS');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [userId, authToken]
  );

  // Cancel SOS
  const cancelSOS = useCallback(
    async (sosId: string) => {
      if (!authToken) return false;

      try {
        setIsLoading(true);
        await axios.post(
          `${API_BASE_URL}/api/v3/safety/sos/${sosId}/cancel`,
          {},
          { headers: { Authorization: `Bearer ${authToken}` } }
        );

        setSOSAlert(null);
        return true;
      } catch (err) {
        console.error('Error cancelling SOS:', err);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [authToken]
  );

  // Get SOS status
  const getSOSStatus = useCallback(
    async (sosId: string) => {
      if (!authToken) return null;

      try {
        const response = await axios.get(
          `${API_BASE_URL}/api/v3/safety/sos/${sosId}`,
          { headers: { Authorization: `Bearer ${authToken}` } }
        );

        return response.data;
      } catch (err) {
        console.error('Error fetching SOS status:', err);
        return null;
      }
    },
    [authToken]
  );

  // Report incident
  const reportIncident = useCallback(
    async (
      incidentType: string,
      severity: string,
      description: string,
      latitude: number,
      longitude: number,
      address: string,
      photos?: string[],
      videoUrl?: string,
      rideId?: string
    ) => {
      if (!userId || !authToken) return null;

      try {
        setIsLoading(true);
        const response = await axios.post(
          `${API_BASE_URL}/api/v3/safety/incidents/report`,
          {
            ride_id: rideId,
            incident_type: incidentType,
            severity,
            description,
            location_latitude: latitude,
            location_longitude: longitude,
            location_address: address,
            photos,
            video_url: videoUrl
          },
          {
            params: { user_id: userId },
            headers: { Authorization: `Bearer ${authToken}` }
          }
        );

        await fetchIncidentHistory();
        setError(null);
        return response.data;
      } catch (err) {
        console.error('Error reporting incident:', err);
        setError('Failed to report incident');
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [userId, authToken]
  );

  // Fetch incident history
  const fetchIncidentHistory = useCallback(async () => {
    if (!userId || !authToken) return;

    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/v3/safety/incidents/${userId}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      setIncidents(response.data.incidents);
    } catch (err) {
      console.error('Error fetching incidents:', err);
    }
  }, [userId, authToken]);

  // Add safety rating
  const addSafetyRating = useCallback(
    async (rideId: string, score: number, reason?: string) => {
      if (!userId || !authToken) return false;

      try {
        setIsLoading(true);
        const response = await axios.post(
          `${API_BASE_URL}/api/v3/safety/ratings/add`,
          {
            ride_id: rideId,
            rater_type: 'passenger',
            rating_score: score,
            reason
          },
          {
            params: { user_id: userId },
            headers: { Authorization: `Bearer ${authToken}` }
          }
        );

        await fetchSafetyRatings();
        return true;
      } catch (err) {
        console.error('Error adding safety rating:', err);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [userId, authToken]
  );

  // Fetch safety ratings
  const fetchSafetyRatings = useCallback(async () => {
    if (!userId || !authToken) return;

    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/v3/safety/ratings/${userId}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      setSafetyRatings(response.data.ratings);
    } catch (err) {
      console.error('Error fetching safety ratings:', err);
    }
  }, [userId, authToken]);

  // Fetch safety profile
  const fetchSafetyProfile = useCallback(async () => {
    if (!userId || !authToken) return;

    try {
      setIsLoading(true);
      const response = await axios.get(
        `${API_BASE_URL}/api/v3/safety/safety-profile/${userId}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      setSafetyProfile(response.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching safety profile:', err);
      setError('Failed to load safety profile');
    } finally {
      setIsLoading(false);
    }
  }, [userId, authToken]);

  // Start location sharing
  const startLocationSharing = useCallback(
    async (emergencyContactIds: string[], rideId?: string, durationMinutes: number = 60) => {
      if (!userId || !authToken) return false;

      try {
        setIsLoading(true);
        await axios.post(
          `${API_BASE_URL}/api/v3/safety/location-share/start`,
          {
            emergency_contact_ids: emergencyContactIds,
            ride_id: rideId,
            auto_end_after_minutes: durationMinutes
          },
          {
            params: { user_id: userId },
            headers: { Authorization: `Bearer ${authToken}` }
          }
        );

        setError(null);
        return true;
      } catch (err) {
        console.error('Error starting location sharing:', err);
        setError('Failed to start location sharing');
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [userId, authToken]
  );

  // Fetch trust circles
  const fetchTrustCircles = useCallback(async () => {
    if (!userId || !authToken) return;

    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/v3/safety/trust-circles/${userId}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      setTrustCircles(response.data.circles);
    } catch (err) {
      console.error('Error fetching trust circles:', err);
    }
  }, [userId, authToken]);

  // Create trust circle
  const createTrustCircle = useCallback(
    async (circleName: string, contactIds: string[], autoShare: boolean = true) => {
      if (!userId || !authToken) return false;

      try {
        setIsLoading(true);
        await axios.post(
          `${API_BASE_URL}/api/v3/safety/trust-circles/create`,
          {
            circle_name: circleName,
            emergency_contact_ids: contactIds,
            auto_share_location: autoShare
          },
          {
            params: { user_id: userId },
            headers: { Authorization: `Bearer ${authToken}` }
          }
        );

        await fetchTrustCircles();
        return true;
      } catch (err) {
        console.error('Error creating trust circle:', err);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [userId, authToken, fetchTrustCircles]
  );

  // Connect to SOS WebSocket
  const connectToSOSTracking = useCallback(
    (sosId: string) => {
      try {
        const wsProtocol = API_BASE_URL.startsWith('https') ? 'wss' : 'ws';
        const wsUrl = `${wsProtocol}://${API_BASE_URL.replace(/^https?:\/\//, '')}/api/v3/safety/ws/sos-tracking/${sosId}`;

        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
          console.log('Connected to SOS tracking');
        };

        ws.onmessage = (event) => {
          const data = JSON.parse(event.data);
          console.log('SOS update:', data);
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
        };

        ws.onclose = () => {
          console.log('Disconnected from SOS tracking');
        };

        setWsConnection(ws);
      } catch (err) {
        console.error('Error connecting to SOS tracking:', err);
      }
    },
    []
  );

  // Disconnect from WebSocket
  const disconnectFromSOSTracking = useCallback(() => {
    if (wsConnection) {
      wsConnection.close();
      setWsConnection(null);
    }
  }, [wsConnection]);

  // Initial load
  useEffect(() => {
    if (userId && authToken) {
      fetchEmergencyContacts();
      fetchIncidentHistory();
      fetchSafetyRatings();
      fetchSafetyProfile();
      fetchTrustCircles();
    }
  }, [userId, authToken]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectFromSOSTracking();
    };
  }, [disconnectFromSOSTracking]);

  return {
    emergencyContacts,
    sosAlert,
    incidents,
    safetyRatings,
    safetyProfile,
    trustCircles,
    isLoading,
    error,
    fetchEmergencyContacts,
    addEmergencyContact,
    deleteEmergencyContact,
    triggerSOS,
    cancelSOS,
    getSOSStatus,
    reportIncident,
    fetchIncidentHistory,
    addSafetyRating,
    fetchSafetyRatings,
    fetchSafetyProfile,
    startLocationSharing,
    fetchTrustCircles,
    createTrustCircle,
    connectToSOSTracking,
    disconnectFromSOSTracking
  };
};
