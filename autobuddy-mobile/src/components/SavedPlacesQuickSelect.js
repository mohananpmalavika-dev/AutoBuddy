import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';

/**
 * SavedPlacesQuickSelect
 * Compact component showing Home/Work/Favorites shortcuts for quick location selection during booking
 */
export default function SavedPlacesQuickSelect({ token, onSelectPlace = () => {}, selectingFor = 'pickup' }) {
  const [loading, setLoading] = useState(false);
  const [places, setPlaces] = useState([]);
  const [error, setError] = useState('');

  const fetchPlaces = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiRequest('/v1/passengers/saved-places', { token });
      const allPlaces = Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : [];
      
      // Filter and sort: prioritize home/work, then favorites
      const prioritized = allPlaces.sort((a, b) => {
        const typeOrder = { home: 0, work: 1, custom: 2 };
        const aType = typeOrder[a.place_type] ?? 2;
        const bType = typeOrder[b.place_type] ?? 2;
        if (aType !== bType) return aType - bType;
        // Secondary sort: primary/favorite places first
        if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
        if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
        return 0;
      });
      
      setPlaces(prioritized.slice(0, 5)); // Show top 5 places (Home, Work, Favorites)
    } catch (err) {
      setError(err.message || 'Failed to load places');
      console.error('SavedPlacesQuickSelect fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) return undefined;
    const timer = setTimeout(() => {
      fetchPlaces().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [token, fetchPlaces]);

  const handlePlaceSelect = useCallback((place) => {
    onSelectPlace(place, selectingFor);
  }, [onSelectPlace, selectingFor]);

  if (!token) return null;
  
  // Don't show if no places available
  if (!loading && places.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerText}>
          {selectingFor === 'pickup' ? 'Quick pickup locations' : 'Quick dropoff locations'}
        </Text>
      </View>
      
      <View style={styles.placesRow}>
        {loading && places.length === 0 ? (
          <ActivityIndicator size="small" color={COLORS.primary} style={styles.loader} />
        ) : (
          places.map((place) => {
            const icon = place.place_type === 'home' ? '🏠' : place.place_type === 'work' ? '💼' : '📍';
            const isFavorite = place.is_favorite || place.is_primary;
            
            return (
              <TouchableOpacity
                key={place.id}
                style={[styles.placeButton, isFavorite && styles.placeButtonFavorite]}
                onPress={() => handlePlaceSelect(place)}
                activeOpacity={0.7}>
                <Text style={styles.placeIcon}>{icon}</Text>
                <Text style={styles.placeName} numberOfLines={1}>
                  {place.name || place.place_type}
                </Text>
                {isFavorite && <Text style={styles.favoriteBadge}>★</Text>}
              </TouchableOpacity>
            );
          })
        )}
        
        {!loading && places.length === 0 && (
          <Text style={styles.emptyText}>No saved places yet</Text>
        )}
      </View>
      
      {!!error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#F5F7FA',
    borderRadius: 12,
    padding: 12,
    marginVertical: 8,
    ...SHADOWS.soft,
  },
  header: {
    marginBottom: 8,
  },
  headerText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
  },
  placesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  placeButton: {
    flex: 1,
    minWidth: 90,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeButtonFavorite: {
    borderColor: COLORS.primary,
    backgroundColor: '#F0F7FF',
  },
  placeIcon: {
    fontSize: 18,
    marginBottom: 4,
  },
  placeName: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textMain,
    textAlign: 'center',
  },
  favoriteBadge: {
    fontSize: 10,
    color: COLORS.primary,
    marginTop: 2,
  },
  emptyText: {
    fontSize: 12,
    color: COLORS.textMuted,
    textAlign: 'center',
    flex: 1,
  },
  errorText: {
    color: '#D32F2F',
    fontSize: 11,
    marginTop: 8,
  },
});
