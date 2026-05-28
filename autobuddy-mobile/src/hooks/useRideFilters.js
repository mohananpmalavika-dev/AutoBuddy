import { useCallback, useState } from 'react';
import { apiRequest } from '../lib/api';

const DEFAULT_FILTERS = {
  maxPickupDistanceKm: null,
  minPassengerRating: 3.5,
  allowedPickupAreas: [],
  blockedPickupAreas: [],
  timeSlotRestrictions: null,
  autoDeclineEnabled: true,
};

export function useRideFilters({ token, driverId }) {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Load current filters
  const loadFilters = useCallback(async () => {
    if (!token || !driverId) return;

    setIsLoading(true);
    setError('');

    try {
      const response = await apiRequest(`/drivers/ride-filters`, {
        method: 'GET',
        token,
      });

      if (response.data) {
        setFilters({
          maxPickupDistanceKm: response.data.max_pickup_distance_km,
          minPassengerRating: response.data.min_passenger_rating,
          allowedPickupAreas: response.data.allowed_pickup_areas || [],
          blockedPickupAreas: response.data.blocked_pickup_areas || [],
          timeSlotRestrictions: response.data.time_slot_restrictions,
          autoDeclineEnabled: response.data.auto_decline_enabled,
        });
      }
    } catch (err) {
      setError(`Failed to load filters: ${err.message}`);
      console.warn('Load filters error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, driverId]);

  // Save filters to backend
  const saveFilters = useCallback(
    async (updatedFilters) => {
      if (!token || !driverId) {
        setError('Missing required data');
        return false;
      }

      setIsLoading(true);
      setError('');

      try {
        await apiRequest(`/drivers/ride-filters`, {
          method: 'POST',
          token,
          body: {
            max_pickup_distance_km: updatedFilters.maxPickupDistanceKm,
            min_passenger_rating: updatedFilters.minPassengerRating,
            allowed_pickup_areas: updatedFilters.allowedPickupAreas,
            blocked_pickup_areas: updatedFilters.blockedPickupAreas,
            time_slot_restrictions: updatedFilters.timeSlotRestrictions,
            auto_decline_enabled: updatedFilters.autoDeclineEnabled,
          },
        });

        setFilters(updatedFilters);
        return true;
      } catch (err) {
        setError(`Failed to save filters: ${err.message}`);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [token, driverId]
  );

  // Check if ride matches filters
  const matchesFilters = useCallback(
    (ride) => {
      if (!filters.autoDeclineEnabled) return true;

      // Check distance
      if (filters.maxPickupDistanceKm && ride.pickupDistanceKm > filters.maxPickupDistanceKm) {
        return false;
      }

      // Check passenger rating
      if (filters.minPassengerRating && ride.passengerRating < filters.minPassengerRating) {
        return false;
      }

      // Check allowed areas
      if (filters.allowedPickupAreas.length > 0 && !filters.allowedPickupAreas.includes(ride.pickupArea)) {
        return false;
      }

      // Check blocked areas
      if (filters.blockedPickupAreas.includes(ride.pickupArea)) {
        return false;
      }

      // Check time restrictions
      if (filters.timeSlotRestrictions) {
        const now = new Date().toTimeString().slice(0, 5);
        if (now >= filters.timeSlotRestrictions.start && now <= filters.timeSlotRestrictions.end) {
          return false;
        }
      }

      return true;
    },
    [filters]
  );

  // Update a single filter
  const updateFilter = useCallback(
    (filterKey, value) => {
      setFilters((prev) => ({
        ...prev,
        [filterKey]: value,
      }));
    },
    []
  );

  return {
    filters,
    isLoading,
    error,
    loadFilters,
    saveFilters,
    matchesFilters,
    updateFilter,
  };
}
