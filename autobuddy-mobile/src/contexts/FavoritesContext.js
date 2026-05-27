import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * FavoritesContext - Manage favorites and emergency contacts
 */

const FavoritesContext = createContext(null);

export function FavoritesProvider({ children }) {
  const [favorites, setFavorites] = useState([]);
  const [emergencyContacts, setEmergencyContacts] = useState([]);

  const addFavorite = useCallback((driverId, driverName) => {
    const favorite = {
      id: `fav-${Date.now()}`,
      driverId,
      driverName,
      addedAt: new Date(),
    };
    setFavorites((prev) => [...prev, favorite]);
    return favorite;
  }, []);

  const removeFavorite = useCallback((driverId) => {
    setFavorites((prev) => prev.filter((f) => f.driverId !== driverId));
  }, []);

  const isFavorite = useCallback(
    (driverId) => favorites.some((f) => f.driverId === driverId),
    [favorites]
  );

  const addEmergencyContact = useCallback((name, phone, relation = 'Emergency Contact') => {
    const contact = {
      id: `emergency-${Date.now()}`,
      name,
      phone,
      relation,
      addedAt: new Date(),
    };
    setEmergencyContacts((prev) => [...prev, contact]);
    return contact;
  }, []);

  const removeEmergencyContact = useCallback((contactId) => {
    setEmergencyContacts((prev) => prev.filter((c) => c.id !== contactId));
  }, []);

  const value = {
    favorites,
    emergencyContacts,
    addFavorite,
    removeFavorite,
    isFavorite,
    addEmergencyContact,
    removeEmergencyContact,
    setFavorites,
    setEmergencyContacts,
  };

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const context = useContext(FavoritesContext);
  if (!context) {
    throw new Error('useFavorites must be used within FavoritesProvider');
  }
  return context;
}
