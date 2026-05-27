import { useCallback, useRef, useState, useEffect } from 'react';
import { apiRequest } from '../lib/api';
import { createAutoBuddySocket } from '../lib/socket';

/**
 * Custom hook for managing active ride state and ride-related actions
 * Consolidates ride acceptance, decline, completion, and status tracking
 *
 * @param {string} token - Authentication token
 * @param {function} onRideStatusChange - Callback when ride status changes
 * @returns {object} Ride state and action methods
 */
export function useDriverRide({ token, onRideStatusChange } = {}) {
  const socketRef = useRef(null);
  const rideStatusListenerRef = useRef(null);

  // State management
  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [rideStartOtp, setRideStartOtp] = useState('');
  const [rideEndOtp, setRideEndOtp] = useState('');

  // Initialize socket listener for ride updates
  useEffect(() => {
    if (!token) return;

    try {
      socketRef.current = createAutoBuddySocket(token);

      // Listen for ride status updates
      rideStatusListenerRef.current = (updatedRide) => {
        if (updatedRide) {
          setRide(updatedRide);
          onRideStatusChange?.(updatedRide);
        }
      };

      socketRef.current.on('ride_status_update', rideStatusListenerRef.current);
      socketRef.current.on('active_ride', rideStatusListenerRef.current);
    } catch (err) {
      console.warn('Failed to initialize ride socket:', err);
    }

    return () => {
      if (socketRef.current && rideStatusListenerRef.current) {
        socketRef.current.off('ride_status_update', rideStatusListenerRef.current);
        socketRef.current.off('active_ride', rideStatusListenerRef.current);
      }
    };
  }, [token, onRideStatusChange]);

  // Accept a ride request
  const acceptRide = useCallback(
    async (rideId) => {
      if (!rideId || !token) {
        setError('Missing ride ID or authentication token');
        return false;
      }

      setLoading(true);
      setError('');

      try {
        const response = await apiRequest(`/rides/${rideId}/accept`, {
          method: 'POST',
          token,
        });

        if (response?.success) {
          setRide(response.data);
          onRideStatusChange?.(response.data);
          return true;
        }

        throw new Error(response?.message || 'Failed to accept ride');
      } catch (err) {
        const errorMsg = err?.message || 'Error accepting ride';
        setError(errorMsg);
        console.error('acceptRide error:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [token, onRideStatusChange]
  );

  // Decline a ride request
  const declineRide = useCallback(
    async (rideId, reason = '') => {
      if (!rideId || !token) {
        setError('Missing ride ID or authentication token');
        return false;
      }

      setLoading(true);
      setError('');

      try {
        const response = await apiRequest(`/rides/${rideId}/decline`, {
          method: 'POST',
          token,
          body: { reason },
        });

        if (response?.success) {
          setRide(null);
          return true;
        }

        throw new Error(response?.message || 'Failed to decline ride');
      } catch (err) {
        const errorMsg = err?.message || 'Error declining ride';
        setError(errorMsg);
        console.error('declineRide error:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  // Mark driver as arrived at pickup location
  const markArrived = useCallback(
    async (rideId) => {
      if (!rideId || !token) {
        setError('Missing ride ID or authentication token');
        return false;
      }

      setLoading(true);
      setError('');

      try {
        const response = await apiRequest(`/rides/${rideId}/arrived`, {
          method: 'POST',
          token,
        });

        if (response?.success) {
          setRide(response.data);
          onRideStatusChange?.(response.data);
          return true;
        }

        throw new Error(response?.message || 'Failed to mark arrived');
      } catch (err) {
        const errorMsg = err?.message || 'Error marking arrival';
        setError(errorMsg);
        console.error('markArrived error:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [token, onRideStatusChange]
  );

  // Start the trip (with optional OTP verification)
  const startTrip = useCallback(
    async (rideId, otpCode = null) => {
      if (!rideId || !token) {
        setError('Missing ride ID or authentication token');
        return false;
      }

      setLoading(true);
      setError('');

      try {
        const body = {};
        if (otpCode) {
          body.otp_code = otpCode;
        }

        const response = await apiRequest(`/rides/${rideId}/start`, {
          method: 'POST',
          token,
          body: Object.keys(body).length > 0 ? body : undefined,
        });

        if (response?.success) {
          setRide(response.data);
          onRideStatusChange?.(response.data);
          setRideStartOtp('');
          return true;
        }

        throw new Error(response?.message || 'Failed to start trip');
      } catch (err) {
        const errorMsg = err?.message || 'Error starting trip';
        setError(errorMsg);
        console.error('startTrip error:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [token, onRideStatusChange]
  );

  // Complete the ride
  const completeRide = useCallback(
    async (rideId, otpCode = null, rating = null) => {
      if (!rideId || !token) {
        setError('Missing ride ID or authentication token');
        return false;
      }

      setLoading(true);
      setError('');

      try {
        const body = {};
        if (otpCode) {
          body.otp_code = otpCode;
        }
        if (rating) {
          body.rating = rating;
        }

        const response = await apiRequest(`/rides/${rideId}/complete`, {
          method: 'POST',
          token,
          body: Object.keys(body).length > 0 ? body : undefined,
        });

        if (response?.success) {
          setRide(null);
          setRideEndOtp('');
          return true;
        }

        throw new Error(response?.message || 'Failed to complete ride');
      } catch (err) {
        const errorMsg = err?.message || 'Error completing ride';
        setError(errorMsg);
        console.error('completeRide error:', err);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  // Clear error message
  const clearError = useCallback(() => {
    setError('');
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (socketRef.current && rideStatusListenerRef.current) {
        socketRef.current.off('ride_status_update', rideStatusListenerRef.current);
        socketRef.current.off('active_ride', rideStatusListenerRef.current);
      }
    };
  }, []);

  return {
    // State
    ride,
    loading,
    error,
    rideStartOtp,
    rideEndOtp,

    // Actions
    acceptRide,
    declineRide,
    markArrived,
    startTrip,
    completeRide,
    clearError,

    // Setters (for manual control)
    setRide,
    setRideStartOtp,
    setRideEndOtp,
  };
}
