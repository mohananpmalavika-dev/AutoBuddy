import { useCallback, useState } from 'react';
import { apiRequest } from '../lib/api';

export function useFavoritePassengers({ token, driverId }) {
  const [favorites, setFavorites] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Load all favorite passengers
  const loadFavorites = useCallback(async (limit = 50) => {
    if (!token || !driverId) return null;

    setIsLoading(true);
    setError('');

    try {
      const response = await apiRequest(`/drivers-tier3/favorite-passengers?limit=${limit}`, {
        method: 'GET',
        token,
      });

      if (response.data && response.data.favorites) {
        setFavorites(response.data.favorites);
        return response.data.favorites;
      }
    } catch (err) {
      setError(`Failed to load favorites: ${err.message}`);
      console.warn('Load favorites error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [token, driverId]);

  // Add passenger to favorites
  const addFavorite = useCallback(async (passengerId, rating = 5, notes = '') => {
    if (!token || !driverId) return null;

    try {
      const response = await apiRequest(`/drivers-tier3/favorite-passengers`, {
        method: 'POST',
        token,
        body: {
          passenger_id: passengerId,
          rating,
          notes,
        },
      });

      if (response.data) {
        setFavorites(prev => [...prev, response.data]);
        return response.data;
      }
    } catch (err) {
      setError(`Failed to add favorite: ${err.message}`);
      console.warn('Add favorite error:', err);
    }
  }, [token, driverId]);

  // Update favorite passenger info
  const updateFavorite = useCallback(async (passengerId, rating, notes) => {
    if (!token) return null;

    try {
      const response = await apiRequest(`/drivers-tier3/favorite-passengers/${passengerId}`, {
        method: 'PATCH',
        token,
        body: {
          rating,
          notes,
        },
      });

      if (response.data) {
        setFavorites(prev =>
          prev.map(fav => (fav.passenger_id === passengerId ? response.data : fav))
        );
        return response.data;
      }
    } catch (err) {
      setError(`Failed to update favorite: ${err.message}`);
      console.warn('Update favorite error:', err);
    }
  }, [token]);

  // Remove passenger from favorites
  const removeFavorite = useCallback(async (passengerId) => {
    if (!token) return null;

    try {
      await apiRequest(`/drivers-tier3/favorite-passengers/${passengerId}`, {
        method: 'DELETE',
        token,
      });

      setFavorites(prev => prev.filter(fav => fav.passenger_id !== passengerId));
      return true;
    } catch (err) {
      setError(`Failed to remove favorite: ${err.message}`);
      console.warn('Remove favorite error:', err);
    }
  }, [token]);

  // Check if passenger is favorite
  const isFavorite = useCallback((passengerId) => {
    return favorites.some(fav => fav.passenger_id === passengerId);
  }, [favorites]);

  // Get favorite by passenger ID
  const getFavoriteByPassengerId = useCallback((passengerId) => {
    return favorites.find(fav => fav.passenger_id === passengerId);
  }, [favorites]);

  return {
    favorites,
    isLoading,
    error,
    loadFavorites,
    addFavorite,
    updateFavorite,
    removeFavorite,
    isFavorite,
    getFavoriteByPassengerId,
  };
}
