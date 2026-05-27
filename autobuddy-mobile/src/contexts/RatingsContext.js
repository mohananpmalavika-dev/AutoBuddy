import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * RatingsContext - Global state for passenger ratings and feedback
 */

const RatingsContext = createContext(null);

export function RatingsProvider({ children }) {
  const [ratings, setRatings] = useState([]);
  const [averageRating, setAverageRating] = useState(0);
  const [totalRatings, setTotalRatings] = useState(0);
  const [pendingRatings, setPendingRatings] = useState([]);

  const submitRating = useCallback((bookingId, driverId, score, feedback = '') => {
    const rating = {
      id: `rating-${Date.now()}`,
      bookingId,
      driverId,
      score: Math.min(5, Math.max(1, score)),
      feedback,
      timestamp: new Date(),
      submitted: false,
    };

    setPendingRatings((prev) => [...prev, rating]);
    return rating.id;
  }, []);

  const confirmRating = useCallback((ratingId) => {
    setPendingRatings((prev) =>
      prev.map((r) => (r.id === ratingId ? { ...r, submitted: true } : r))
    );
  }, []);

  const updateRating = useCallback((ratingId, updates) => {
    setPendingRatings((prev) =>
      prev.map((r) => (r.id === ratingId ? { ...r, ...updates } : r))
    );
  }, []);

  const getRating = useCallback(
    (bookingId) => {
      return ratings.find((r) => r.bookingId === bookingId) || null;
    },
    [ratings]
  );

  const getDriverAverageRating = useCallback(
    (driverId) => {
      const driverRatings = ratings.filter((r) => r.driverId === driverId);
      if (driverRatings.length === 0) return 0;
      const sum = driverRatings.reduce((acc, r) => acc + r.score, 0);
      return (sum / driverRatings.length).toFixed(1);
    },
    [ratings]
  );

  const value = {
    ratings,
    averageRating,
    totalRatings,
    pendingRatings,
    submitRating,
    confirmRating,
    updateRating,
    getRating,
    getDriverAverageRating,
    setRatings,
    setTotalRatings,
  };

  return (
    <RatingsContext.Provider value={value}>
      {children}
    </RatingsContext.Provider>
  );
}

export function useRatings() {
  const context = useContext(RatingsContext);
  if (!context) {
    throw new Error('useRatings must be used within RatingsProvider');
  }
  return context;
}
