import { useEffect, useState, useCallback } from 'react';
import { apiRequest } from '../lib/api-client';

export interface Favorite {
  id: string;
  userId: string;
  favoriteId: string;
  type: 'driver' | 'passenger';
  name: string;
  photo?: string;
  rating?: number;
  totalRides?: number;
  createdAt: Date;
}

export interface FavoritesError {
  message: string;
  code?: string;
}

/**
 * Hook to manage user favorites (favorite drivers/passengers)
 */
export function useFavorites(token: string | null) {
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FavoritesError | null>(null);

  // Fetch all favorites on mount
  const fetchFavorites = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      setError(null);

      const response = await apiRequest('/favorites', {
        method: 'GET',
        token,
      });

      setFavorites(response?.favorites || []);
    } catch (err: unknown) {
      const apiError = err as any;
      setError({
        message: apiError?.message || 'Failed to fetch favorites',
        code: apiError?.code,
      });
      console.error('[Favorites] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  // Add favorite
  const addFavorite = useCallback(
    async (favoriteId: string, type: 'driver' | 'passenger', name: string, photo?: string, rating?: number) => {
      if (!token) return;

      try {
        setError(null);

        const response = await apiRequest('/favorites', {
          method: 'POST',
          token,
          body: {
            favorite_id: favoriteId,
            type,
            name,
            photo,
            rating,
          },
        });

        const newFavorite: Favorite = {
          id: response?.id || `fav_${Date.now()}`,
          userId: response?.user_id || '',
          favoriteId,
          type,
          name,
          photo,
          rating,
          createdAt: new Date(),
        };

        setFavorites((prev) => [newFavorite, ...prev]);
        return newFavorite;
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to add favorite',
          code: apiError?.code,
        });
        throw err;
      }
    },
    [token]
  );

  // Remove favorite
  const removeFavorite = useCallback(
    async (favoriteId: string) => {
      if (!token) return;

      try {
        setError(null);

        await apiRequest(`/favorites/${favoriteId}`, {
          method: 'DELETE',
          token,
        });

        setFavorites((prev) => prev.filter((f) => f.id !== favoriteId));
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to remove favorite',
          code: apiError?.code,
        });
        throw err;
      }
    },
    [token]
  );

  // Check if user is favorite
  const isFavorite = useCallback(
    (favoriteId: string) => {
      return favorites.some((f) => f.favoriteId === favoriteId);
    },
    [favorites]
  );

  // Get favorite by ID
  const getFavorite = useCallback(
    (favoriteId: string) => {
      return favorites.find((f) => f.favoriteId === favoriteId) || null;
    },
    [favorites]
  );

  // Get favorites by type
  const getFavoritesByType = useCallback(
    (type: 'driver' | 'passenger') => {
      return favorites.filter((f) => f.type === type);
    },
    [favorites]
  );

  return {
    favorites,
    loading,
    error,
    addFavorite,
    removeFavorite,
    isFavorite,
    getFavorite,
    getFavoritesByType,
    refetch: fetchFavorites,
  };
}

/**
 * Hook to manage ratings history
 */
export function useRatingsHistory(token: string | null, userId?: string) {
  const [ratings, setRatings] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FavoritesError | null>(null);
  const [stats, setStats] = useState({
    averageRating: 0,
    totalRatings: 0,
    ratingDistribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
  });

  const fetchRatingsHistory = useCallback(
    async (limit = 20, offset = 0) => {
      if (!token) return;

      try {
        setLoading(true);
        setError(null);

        const endpoint = userId
          ? `/users/${userId}/ratings/history`
          : `/ratings/history`;

        const response = await apiRequest(endpoint, {
          method: 'GET',
          token,
          headers: {
            'X-Limit': limit.toString(),
            'X-Offset': offset.toString(),
          },
        });

        const ratingsData = response?.ratings || [];
        setRatings(ratingsData);

        // Calculate statistics
        if (ratingsData.length > 0) {
          const avgRating =
            ratingsData.reduce((sum: number, r: any) => sum + r.rating, 0) /
            ratingsData.length;

          const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
          ratingsData.forEach((r: any) => {
            distribution[r.rating as keyof typeof distribution]++;
          });

          setStats({
            averageRating: avgRating,
            totalRatings: ratingsData.length,
            ratingDistribution: distribution,
          });
        }
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to fetch ratings',
          code: apiError?.code,
        });
        console.error('[RatingsHistory] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    },
    [token, userId]
  );

  useEffect(() => {
    fetchRatingsHistory();
  }, [fetchRatingsHistory]);

  // Filter ratings
  const filterRatings = useCallback(
    (minRating: number, maxRating: number) => {
      return ratings.filter(
        (r) => r.rating >= minRating && r.rating <= maxRating
      );
    },
    [ratings]
  );

  // Get ratings by type (given/received)
  const getRatingsByType = useCallback(
    (type: 'given' | 'received') => {
      return ratings.filter((r) => r.type === type);
    },
    [ratings]
  );

  return {
    ratings,
    stats,
    loading,
    error,
    filterRatings,
    getRatingsByType,
    refetch: fetchRatingsHistory,
  };
}

/**
 * Hook to get detailed driver profile with ratings
 */
export function useDriverProfile(token: string | null, driverId: string) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FavoritesError | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!token || !driverId) return;

    try {
      setLoading(true);
      setError(null);

      const response = await apiRequest(`/drivers/${driverId}/profile`, {
        method: 'GET',
        token,
      });

      setProfile(response || null);
    } catch (err: unknown) {
      const apiError = err as any;
      setError({
        message: apiError?.message || 'Failed to fetch profile',
        code: apiError?.code,
      });
      console.error('[DriverProfile] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [token, driverId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return {
    profile,
    loading,
    error,
    refetch: fetchProfile,
  };
}

/**
 * Hook to get detailed passenger profile
 */
export function usePassengerProfile(token: string | null, passengerId: string) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<FavoritesError | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!token || !passengerId) return;

    try {
      setLoading(true);
      setError(null);

      const response = await apiRequest(`/passengers/${passengerId}/profile`, {
        method: 'GET',
        token,
      });

      setProfile(response || null);
    } catch (err: unknown) {
      const apiError = err as any;
      setError({
        message: apiError?.message || 'Failed to fetch profile',
        code: apiError?.code,
      });
      console.error('[PassengerProfile] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [token, passengerId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return {
    profile,
    loading,
    error,
    refetch: fetchProfile,
  };
}

export default {
  useFavorites,
  useRatingsHistory,
  useDriverProfile,
  usePassengerProfile,
};
