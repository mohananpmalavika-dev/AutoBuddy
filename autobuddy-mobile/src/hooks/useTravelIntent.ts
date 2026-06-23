/**
 * Travel Intent Engine Hook - React Native
 * Manages all state for AI-powered travel suggestions
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import * as Location from 'expo-location';
import travelIntentService, { IntentSuggestion } from '../services/travelIntentService';

interface TravelState {
  // Search state
  searchQuery: string;
  isSearching: boolean;
  searchError: string | null;

  // Location state
  userLocation: { lat: number; lng: number } | null;
  locationPermission: string | null;

  // Suggestions state
  suggestions: IntentSuggestion[];
  selectedSuggestion: IntentSuggestion | null;
  suggestionsLoading: boolean;

  // Booking state
  isBooking: boolean;
  bookingError: string | null;
  bookingSuccess: boolean;
  bookingDetails: any | null;

  // Filter/options
  numPassengers: number;
  selectedVehicleType: string;
  suggestionsLimit: number;

  // History & trending
  trendingDestinations: any[];
  searchHistory: any[];
}

const initialState: TravelState = {
  searchQuery: '',
  isSearching: false,
  searchError: null,
  userLocation: null,
  locationPermission: null,
  suggestions: [],
  selectedSuggestion: null,
  suggestionsLoading: false,
  isBooking: false,
  bookingError: null,
  bookingSuccess: false,
  bookingDetails: null,
  numPassengers: 1,
  selectedVehicleType: 'auto',
  suggestionsLimit: 5,
  trendingDestinations: [],
  searchHistory: [],
};

export const useTravelIntent = () => {
  const [state, setState] = useState<TravelState>(initialState);
  const debounceTimer = useRef<NodeJS.Timeout>();

  /**
   * Request location permission and get current location
   */
  useEffect(() => {
    const requestLocationPermission = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        setState((prev) => ({ ...prev, locationPermission: status }));

        if (status === 'granted') {
          const userLocation = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High,
          });
          setState((prev) => ({
            ...prev,
            userLocation: {
              lat: userLocation.coords.latitude,
              lng: userLocation.coords.longitude,
            },
          }));
        }
      } catch (error) {
        console.error('Location error:', error);
      }
    };

    requestLocationPermission();
  }, []);

  /**
   * Handle search query input with debounce
   */
  const handleSearchInput = useCallback((query: string) => {
    setState((prev) => ({ ...prev, searchQuery: query }));

    // Debounce auto-search
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    if (query.length > 2) {
      debounceTimer.current = setTimeout(() => {
        handleSearch(query);
      }, 500);
    }
  }, []);

  /**
   * Execute search
   */
  const handleSearch = useCallback(async (query: string) => {
    setState((prev) => ({ ...prev, isSearching: true, searchError: null }));

    try {
      const suggestions = await travelIntentService.getSuggestions(
        query,
        state.userLocation?.lat,
        state.userLocation?.lng,
        state.numPassengers,
        state.suggestionsLimit
      );

      setState((prev) => ({
        ...prev,
        suggestions,
        isSearching: false,
      }));

      // Save to history
      if (suggestions.length > 0) {
        saveSearchHistory(query, suggestions[0].id);
      }
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        isSearching: false,
        searchError: error.message || 'Failed to search',
        suggestions: [],
      }));
    }
  }, [state.userLocation, state.numPassengers, state.suggestionsLimit]);

  /**
   * Get trending destinations
   */
  const loadTrendingDestinations = useCallback(async (category?: string) => {
    try {
      const trending = await travelIntentService.getTrendingDestinations(category);
      setState((prev) => ({
        ...prev,
        trendingDestinations: trending,
      }));
    } catch (error) {
      console.error('Error loading trending:', error);
    }
  }, []);

  /**
   * Select a suggestion
   */
  const selectSuggestion = useCallback((suggestion: IntentSuggestion) => {
    setState((prev) => ({
      ...prev,
      selectedSuggestion: suggestion,
    }));
  }, []);

  /**
   * Clear selections
   */
  const clearSelection = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedSuggestion: null,
      suggestions: [],
      searchQuery: '',
    }));
  }, []);

  /**
   * Quick book a ride
   */
  const quickBook = useCallback(
    async (suggestionId: string, vehicleType: string, numPassengers: number) => {
      if (!state.userLocation) {
        setState((prev) => ({
          ...prev,
          bookingError: 'Location not available',
        }));
        return;
      }

      setState((prev) => ({ ...prev, isBooking: true, bookingError: null }));

      try {
        const bookingResult = await travelIntentService.quickBook({
          suggestionId,
          vehicleType,
          numPassengers,
          pickupLocation: state.userLocation,
        });

        setState((prev) => ({
          ...prev,
          isBooking: false,
          bookingSuccess: true,
          bookingDetails: bookingResult,
        }));

        // Save to history
        saveSearchHistory(state.searchQuery, suggestionId, true);

        // Reset after 3 seconds
        setTimeout(() => {
          setState((prev) => ({
            ...prev,
            bookingSuccess: false,
          }));
        }, 3000);
      } catch (error: any) {
        setState((prev) => ({
          ...prev,
          isBooking: false,
          bookingError: error.message || 'Booking failed',
        }));
      }
    },
    [state.userLocation, state.searchQuery]
  );

  /**
   * Save search history
   */
  const saveSearchHistory = useCallback(
    async (query: string, suggestionId?: string, bookingCompleted: boolean = false) => {
      try {
        const userId = 'user_123'; // Would come from auth context
        await travelIntentService.saveHistory(userId, query, suggestionId, bookingCompleted);
      } catch (error) {
        console.error('Error saving history:', error);
      }
    },
    []
  );

  /**
   * Update number of passengers
   */
  const updateNumPassengers = useCallback((numPassengers: number) => {
    setState((prev) => ({
      ...prev,
      numPassengers: Math.max(1, Math.min(6, numPassengers)),
    }));
  }, []);

  /**
   * Update vehicle type
   */
  const updateVehicleType = useCallback((vehicleType: string) => {
    setState((prev) => ({
      ...prev,
      selectedVehicleType: vehicleType,
    }));
  }, []);

  /**
   * Get pricing estimate
   */
  const getPricingEstimate = useCallback(
    async (toLat: number, toLng: number, vehicleType?: string) => {
      if (!state.userLocation) {return null;}

      try {
        const pricing = await travelIntentService.estimatePricing(
          state.userLocation.lat,
          state.userLocation.lng,
          toLat,
          toLng,
          vehicleType || state.selectedVehicleType,
          state.numPassengers
        );
        return pricing;
      } catch (error) {
        console.error('Error getting pricing:', error);
        return null;
      }
    },
    [state.userLocation, state.selectedVehicleType, state.numPassengers]
  );

  /**
   * Submit feedback
   */
  const submitFeedback = useCallback(
    async (suggestionId: string, rating: number, comment?: string) => {
      try {
        await travelIntentService.submitFeedback(suggestionId, rating, comment);
      } catch (error) {
        console.error('Error submitting feedback:', error);
      }
    },
    []
  );

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    // State
    ...state,

    // Search methods
    handleSearchInput,
    handleSearch,
    loadTrendingDestinations,

    // Selection methods
    selectSuggestion,
    clearSelection,

    // Booking methods
    quickBook,

    // Preference methods
    updateNumPassengers,
    updateVehicleType,

    // Utility methods
    getPricingEstimate,
    submitFeedback,
    reset,
  };
};

export default useTravelIntent;
