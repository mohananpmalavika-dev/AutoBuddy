import { useCallback, useState, useMemo } from 'react';
import { apiRequest } from '../lib/api';

const RATING_CACHE_TTL = 300000; // 5 minutes

export function usePassengerRating({ token }) {
  const [ratingCache, setRatingCache] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch passenger rating with caching
  const getPassengerRating = useCallback(
    async (passengerId) => {
      if (!token || !passengerId) {
        return null;
      }

      // Check cache
      const cached = ratingCache[passengerId];
      if (cached && Date.now() - cached.timestamp < RATING_CACHE_TTL) {
        return cached.data;
      }

      setIsLoading(true);
      setError('');

      try {
        const response = await apiRequest(`/drivers-tier2/passengers/${passengerId}/ratings`, {
          method: 'GET',
          token,
        });
        const payload = response?.data || response;

        const ratingData = {
          averageRating: payload?.average_rating || 3.5,
          totalRatings: payload?.total_ratings || 0,
          recentReviews: payload?.recent_reviews || [],
        };

        // Cache the result
        setRatingCache((prev) => ({
          ...prev,
          [passengerId]: {
            data: ratingData,
            timestamp: Date.now(),
          },
        }));

        return ratingData;
      } catch (err) {
        console.warn(`Failed to fetch passenger rating for ${passengerId}:`, err);
        setError(`Failed to load rating: ${err.message}`);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [token, ratingCache]
  );

  // Get color based on rating
  const getRatingColor = useMemo(
    () => (rating) => {
      if (!rating) return '#FFA500';
      if (rating >= 4.5) return '#2E7D32'; // Green - excellent
      if (rating >= 4.0) return '#388E3C'; // Light green - good
      if (rating >= 3.5) return '#FFA500'; // Orange - average
      return '#D32F2F'; // Red - poor
    },
    []
  );

  // Get rating description
  const getRatingLabel = useMemo(
    () => (rating) => {
      if (!rating) return 'Unknown';
      if (rating >= 4.5) return 'Excellent';
      if (rating >= 4.0) return 'Good';
      if (rating >= 3.5) return 'Average';
      return 'Low Rating';
    },
    []
  );

  return {
    getPassengerRating,
    getRatingColor,
    getRatingLabel,
    isLoading,
    error,
  };
}
