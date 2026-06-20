import { useEffect, useCallback, useState } from 'react';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface ScheduledRide {
  ride_id: string;
  status: string;
  scheduled_at: string;
  scheduled_for_date: string;
  scheduled_for_time: string;
  pickup_address: string;
  dropoff_address: string;
  estimated_fare: number;
  estimated_duration_minutes: number;
  is_recurring: boolean;
  recurrence_type: string;
  vehicle_type: string;
  assigned_driver_id?: string;
}

interface ScheduleRideParams {
  pickup_latitude: number;
  pickup_longitude: number;
  pickup_address: string;
  dropoff_latitude: number;
  dropoff_longitude: number;
  dropoff_address: string;
  scheduled_at: Date;
  vehicle_type?: string;
  recurring_type?: string;
  recurring_end_date?: Date;
}

/**
 * Hook for managing scheduled rides
 * Handles:
 * - Scheduling rides in advance
 * - Recurring rides (daily, weekly, etc.)
 * - Viewing scheduled rides
 * - Rescheduling
 * - Cancellation
 * - Reminders
 */
export const useScheduledRides = (userId: string | null, authToken: string | null) => {
  const [scheduledRides, setScheduledRides] = useState<ScheduledRide[]>([]);
  const [upcomingRides, setUpcomingRides] = useState<ScheduledRide[]>([]);
  const [rideDetails, setRideDetails] = useState<ScheduledRide | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch all scheduled rides for user
  const fetchScheduledRides = useCallback(async (status?: string) => {
    if (!userId || !authToken) return;

    try {
      setIsLoading(true);
      const url = `${API_BASE_URL}/api/v3/scheduled-rides/my-scheduled-rides/${userId}`;
      const response = await axios.get(
        status ? `${url}?status=${status}` : url,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      setScheduledRides(response.data.rides);
      setError(null);
    } catch (err) {
      console.error('Error fetching scheduled rides:', err);
      setError('Failed to load scheduled rides');
    } finally {
      setIsLoading(false);
    }
  }, [userId, authToken]);

  // Fetch upcoming rides (next 7 days)
  const fetchUpcomingRides = useCallback(async () => {
    if (!userId || !authToken) return;

    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/v3/scheduled-rides/upcoming/${userId}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      setUpcomingRides(response.data.rides);
    } catch (err) {
      console.error('Error fetching upcoming rides:', err);
    }
  }, [userId, authToken]);

  // Get details of a specific scheduled ride
  const getRideDetails = useCallback(async (rideId: string) => {
    if (!authToken) return null;

    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/v3/scheduled-rides/scheduled/${rideId}`,
        { headers: { Authorization: `Bearer ${authToken}` } }
      );
      setRideDetails(response.data);
      return response.data;
    } catch (err) {
      console.error('Error fetching ride details:', err);
      return null;
    }
  }, [authToken]);

  // Schedule a new ride
  const scheduleRide = useCallback(async (params: ScheduleRideParams) => {
    if (!userId || !authToken) return null;

    try {
      setIsLoading(true);
      const response = await axios.post(
        `${API_BASE_URL}/api/v3/scheduled-rides/schedule`,
        {
          user_id: userId,
          pickup_latitude: params.pickup_latitude,
          pickup_longitude: params.pickup_longitude,
          pickup_address: params.pickup_address,
          dropoff_latitude: params.dropoff_latitude,
          dropoff_longitude: params.dropoff_longitude,
          dropoff_address: params.dropoff_address,
          scheduled_at: params.scheduled_at.toISOString(),
          vehicle_type: params.vehicle_type || 'economy',
          recurrence_type: params.recurring_type || 'never',
          recurrence_end_date: params.recurring_end_date?.toISOString()
        },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      // Refresh list
      await fetchScheduledRides();
      await fetchUpcomingRides();

      return response.data;
    } catch (err) {
      console.error('Error scheduling ride:', err);
      setError('Failed to schedule ride');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [userId, authToken, fetchScheduledRides, fetchUpcomingRides]);

  // Cancel a scheduled ride
  const cancelRide = useCallback(async (rideId: string, reason?: string) => {
    if (!authToken) return false;

    try {
      setIsLoading(true);
      await axios.post(
        `${API_BASE_URL}/api/v3/scheduled-rides/cancel/${rideId}`,
        { cancellation_reason: reason },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      // Refresh
      await fetchScheduledRides();
      await fetchUpcomingRides();
      return true;
    } catch (err) {
      console.error('Error cancelling ride:', err);
      setError('Failed to cancel ride');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [authToken, fetchScheduledRides, fetchUpcomingRides]);

  // Reschedule a ride
  const rescheduleRide = useCallback(async (rideId: string, newScheduledAt: Date, reason?: string) => {
    if (!authToken) return false;

    try {
      setIsLoading(true);
      const response = await axios.post(
        `${API_BASE_URL}/api/v3/scheduled-rides/reschedule/${rideId}`,
        {
          new_scheduled_at: newScheduledAt.toISOString(),
          reason
        },
        { headers: { Authorization: `Bearer ${authToken}` } }
      );

      // Refresh
      await fetchScheduledRides();
      await fetchUpcomingRides();
      return response.data;
    } catch (err) {
      console.error('Error rescheduling ride:', err);
      setError('Failed to reschedule ride');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [authToken, fetchScheduledRides, fetchUpcomingRides]);

  // Initial fetch
  useEffect(() => {
    if (userId && authToken) {
      fetchScheduledRides();
      fetchUpcomingRides();
    }
  }, [userId, authToken, fetchScheduledRides, fetchUpcomingRides]);

  // Format time
  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  return {
    scheduledRides,
    upcomingRides,
    rideDetails,
    isLoading,
    error,
    fetchScheduledRides,
    fetchUpcomingRides,
    getRideDetails,
    scheduleRide,
    cancelRide,
    rescheduleRide,
    formatTime,
    formatDate
  };
};
