import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * SavedPlacesContext - Manage saved locations (home, work, favorites)
 */

const SavedPlacesContext = createContext(null);

export function SavedPlacesProvider({ children }) {
  const [savedPlaces, setSavedPlaces] = useState([]);

  const addPlace = useCallback((name, address, coordinates, type = 'custom') => {
    const place = {
      id: `place-${Date.now()}`,
      name,
      address,
      coordinates,
      type, // home, work, custom
      createdAt: new Date(),
    };
    setSavedPlaces((prev) => [...prev, place]);
    return place;
  }, []);

  const removePlace = useCallback((placeId) => {
    setSavedPlaces((prev) => prev.filter((p) => p.id !== placeId));
  }, []);

  const updatePlace = useCallback((placeId, updates) => {
    setSavedPlaces((prev) =>
      prev.map((p) => (p.id === placeId ? { ...p, ...updates } : p))
    );
  }, []);

  const getPlacesByType = useCallback(
    (type) => savedPlaces.filter((p) => p.type === type),
    [savedPlaces]
  );

  const value = {
    savedPlaces,
    addPlace,
    removePlace,
    updatePlace,
    getPlacesByType,
    setSavedPlaces,
  };

  return (
    <SavedPlacesContext.Provider value={value}>
      {children}
    </SavedPlacesContext.Provider>
  );
}

export function useSavedPlaces() {
  const context = useContext(SavedPlacesContext);
  if (!context) {
    throw new Error('useSavedPlaces must be used within SavedPlacesProvider');
  }
  return context;
}
