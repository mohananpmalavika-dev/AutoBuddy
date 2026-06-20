import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface EnhancedFavorite {
  id: string;
  userId: string;
  favoriteId: string;
  type: 'driver' | 'passenger';
  name: string;
  photo?: string;
  rating?: number;
  totalRides?: number;
  createdAt: Date;
  usageCount: number;
  lastUsedAt?: Date;
  notes?: string;
}

export interface RatingData {
  id: string;
  fromUserId: string;
  toUserId: string;
  rating: number;
  category: 'cleanliness' | 'driving' | 'communication' | 'safety' | 'overall';
  comment: string;
  rideId?: string;
  createdAt: Date;
}

export interface ProfileCard {
  id: string;
  userId: string;
  name: string;
  photo?: string;
  type: 'driver' | 'passenger';
  rating: number;
  reviewCount: number;
  totalRides: number;
  acceptanceRate?: number;
  cancelRate?: number;
  isFavorite: boolean;
  ratingBreakdown: { 5: number; 4: number; 3: number; 2: number; 1: number };
  recentReviews: RatingData[];
}

const ENHANCED_FAVORITES_STORAGE = 'social_favorites_enhanced';
const RATINGS_STORAGE = 'social_ratings_data';

export const useEnhancedSocialFeatures = (token: string | null, userId: string) => {
  const [favorites, setFavorites] = useState<Map<string, EnhancedFavorite>>(new Map());
  const [ratings, setRatings] = useState<RatingData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize
  useEffect(() => {
    const initialize = async () => {
      try {
        setLoading(true);
        const fav = await loadFavorites();
        const rat = await loadRatings();
        setFavorites(fav);
        setRatings(rat);
      } catch (err) {
        setError(`Init failed: ${err}`);
      } finally {
        setLoading(false);
      }
    };

    if (token && userId) initialize();
  }, [token, userId]);

  // Add to favorites
  const addToFavorites = useCallback(
    async (favoriteId: string, favoriteData: Omit<EnhancedFavorite, 'id' | 'usageCount' | 'createdAt'>) => {
      try {
        const favorite: EnhancedFavorite = {
          ...favoriteData,
          id: `fav_${Date.now()}`,
          createdAt: new Date(),
          usageCount: 0,
        };

        const updated = new Map(favorites);
        updated.set(favoriteId, favorite);
        setFavorites(updated);

        await AsyncStorage.setItem(
          ENHANCED_FAVORITES_STORAGE,
          JSON.stringify(Array.from(updated.values()))
        );
        return favorite;
      } catch (err) {
        setError(`Failed to add favorite: ${err}`);
        throw err;
      }
    },
    [favorites]
  );

  // Remove from favorites
  const removeFromFavorites = useCallback(
    async (favoriteId: string) => {
      try {
        const updated = new Map(favorites);
        updated.delete(favoriteId);
        setFavorites(updated);

        await AsyncStorage.setItem(
          ENHANCED_FAVORITES_STORAGE,
          JSON.stringify(Array.from(updated.values()))
        );
      } catch (err) {
        setError(`Failed to remove: ${err}`);
        throw err;
      }
    },
    [favorites]
  );

  // Sort favorites
  const getSortedFavorites = useCallback(
    (sortBy: 'recent' | 'frequency' | 'rating' | 'name' = 'frequency'): EnhancedFavorite[] => {
      const list = Array.from(favorites.values());

      switch (sortBy) {
        case 'frequency':
          return list.sort((a, b) => b.usageCount - a.usageCount);
        case 'recent':
          return list.sort((a, b) => {
            const timeA = b.lastUsedAt?.getTime() || 0;
            const timeB = a.lastUsedAt?.getTime() || 0;
            return timeA - timeB;
          });
        case 'rating':
          return list.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        case 'name':
          return list.sort((a, b) => a.name.localeCompare(b.name));
        default:
          return list;
      }
    },
    [favorites]
  );

  // Get favorites by type
  const getFavoritesByType = useCallback(
    (type: 'driver' | 'passenger'): EnhancedFavorite[] => {
      return Array.from(favorites.values()).filter(f => f.type === type);
    },
    [favorites]
  );

  // Record usage for quick-booking
  const recordFavoriteUsage = useCallback(
    async (favoriteId: string) => {
      try {
        const updated = new Map(favorites);
        const fav = updated.get(favoriteId);
        if (fav) {
          fav.usageCount += 1;
          fav.lastUsedAt = new Date();
          setFavorites(updated);

          await AsyncStorage.setItem(
            ENHANCED_FAVORITES_STORAGE,
            JSON.stringify(Array.from(updated.values()))
          );
        }
      } catch (err) {
        setError(`Failed to record usage: ${err}`);
      }
    },
    [favorites]
  );

  // Update notes
  const updateFavoriteNotes = useCallback(
    async (favoriteId: string, notes: string) => {
      try {
        const updated = new Map(favorites);
        const fav = updated.get(favoriteId);
        if (fav) {
          fav.notes = notes;
          setFavorites(updated);
          await AsyncStorage.setItem(
            ENHANCED_FAVORITES_STORAGE,
            JSON.stringify(Array.from(updated.values()))
          );
        }
      } catch (err) {
        setError(`Failed to update notes: ${err}`);
      }
    },
    [favorites]
  );

  // Add rating
  const addRating = useCallback(
    async (
      toUserId: string,
      rating: number,
      category: RatingData['category'],
      comment: string,
      rideId?: string
    ) => {
      try {
        const newRating: RatingData = {
          id: `rating_${Date.now()}`,
          fromUserId: userId,
          toUserId,
          rating: Math.max(1, Math.min(5, rating)),
          category,
          comment,
          rideId,
          createdAt: new Date(),
        };

        setRatings(prev => [newRating, ...prev]);
        await AsyncStorage.setItem(RATINGS_STORAGE, JSON.stringify(ratings));
        return newRating;
      } catch (err) {
        setError(`Failed to add rating: ${err}`);
        throw err;
      }
    },
    [userId, ratings]
  );

  // Get ratings and filter
  const getRatingsForUser = useCallback(
    (toUserId: string, category?: RatingData['category']): RatingData[] => {
      let filtered = ratings.filter(r => r.toUserId === toUserId);
      if (category) {
        filtered = filtered.filter(r => r.category === category);
      }
      return filtered;
    },
    [ratings]
  );

  // Calculate average rating
  const getAverageRating = useCallback(
    (toUserId: string, category?: RatingData['category']): number => {
      const userRatings = getRatingsForUser(toUserId, category);
      if (userRatings.length === 0) return 0;
      return userRatings.reduce((sum, r) => sum + r.rating, 0) / userRatings.length;
    },
    [getRatingsForUser]
  );

  // Get rating distribution
  const getRatingDistribution = useCallback(
    (toUserId: string): { 5: number; 4: number; 3: number; 2: number; 1: number } => {
      const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } as const;
      const userRatings = getRatingsForUser(toUserId);

      userRatings.forEach(r => {
        dist[r.rating as keyof typeof dist]++;
      });

      return dist;
    },
    [getRatingsForUser]
  );

  // Build profile card
  const buildProfileCard = useCallback(
    (userId: string, userBasicData: any): ProfileCard => {
      const userRatings = getRatingsForUser(userId);
      const avg = getAverageRating(userId);
      const dist = getRatingDistribution(userId);
      const isFav = favorites.has(userId);

      return {
        id: userId,
        userId,
        name: userBasicData.name || 'Unknown',
        photo: userBasicData.photo,
        type: userBasicData.type || 'driver',
        rating: avg,
        reviewCount: userRatings.length,
        totalRides: userBasicData.totalRides || 0,
        acceptanceRate: userBasicData.acceptanceRate,
        cancelRate: userBasicData.cancelRate,
        isFavorite: isFav,
        ratingBreakdown: dist,
        recentReviews: userRatings.slice(0, 3),
      };
    },
    [favorites, getRatingsForUser, getAverageRating, getRatingDistribution]
  );

  // Quick booking from favorites
  const quickBookFromFavorite = useCallback(
    async (favoriteId: string, rideDetails: any) => {
      try {
        // Record usage
        await recordFavoriteUsage(favoriteId);

        // Return quick-book data
        return {
          favoriteId,
          rideDetails,
          bookedAt: new Date(),
        };
      } catch (err) {
        setError(`Quick book failed: ${err}`);
        throw err;
      }
    },
    [recordFavoriteUsage]
  );

  // Get top favorites (for quick-booking UI)
  const getTopFavorites = useCallback(
    (count: number = 3, type?: 'driver' | 'passenger'): EnhancedFavorite[] => {
      let list = Array.from(favorites.values());
      if (type) list = list.filter(f => f.type === type);
      return list
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, count);
    },
    [favorites]
  );

  // Load/save helpers
  const loadFavorites = useCallback(async (): Promise<Map<string, EnhancedFavorite>> => {
    try {
      const data = await AsyncStorage.getItem(ENHANCED_FAVORITES_STORAGE);
      if (!data) return new Map();
      const fav: EnhancedFavorite[] = JSON.parse(data);
      const map = new Map();
      fav.forEach(f => map.set(f.favoriteId, f));
      return map;
    } catch (err) {
      console.error('Load favorites error:', err);
      return new Map();
    }
  }, []);

  const loadRatings = useCallback(async (): Promise<RatingData[]> => {
    try {
      const data = await AsyncStorage.getItem(RATINGS_STORAGE);
      return data ? JSON.parse(data) : [];
    } catch (err) {
      console.error('Load ratings error:', err);
      return [];
    }
  }, []);

  return {
    // Favorites
    addToFavorites,
    removeFromFavorites,
    getSortedFavorites,
    getFavoritesByType,
    getTopFavorites,
    recordFavoriteUsage,
    updateFavoriteNotes,

    // Ratings & Filtering
    addRating,
    getRatingsForUser,
    getAverageRating,
    getRatingDistribution,

    // Profile cards
    buildProfileCard,

    // Quick booking
    quickBookFromFavorite,

    // State
    favorites: new Map(favorites),
    ratings,
    loading,
    error,
  };
};
