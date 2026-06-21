/**
 * Travel Intent Engine - React Web Component
 * Desktop version with responsive layout
 */

import React, { useEffect, useState } from 'react';
import travelIntentService, { IntentSuggestion } from '../services/travelIntentService';

interface WebTravelState {
  searchQuery: string;
  isSearching: boolean;
  searchError: string | null;
  suggestions: IntentSuggestion[];
  selectedSuggestion: IntentSuggestion | null;
  numPassengers: number;
  selectedVehicleType: string;
  trendingDestinations: any[];
  isBooking: boolean;
  bookingSuccess: boolean;
  bookingError: string | null;
  userLocation: { lat: number; lng: number } | null;
}

const initialState: WebTravelState = {
  searchQuery: '',
  isSearching: false,
  searchError: null,
  suggestions: [],
  selectedSuggestion: null,
  numPassengers: 1,
  selectedVehicleType: 'auto',
  trendingDestinations: [],
  isBooking: false,
  bookingSuccess: false,
  bookingError: null,
  userLocation: null,
};

export const useTravelIntentWeb = () => {
  const [state, setState] = useState<WebTravelState>(initialState);
  const debounceTimer = React.useRef<NodeJS.Timeout>();

  // Get user location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition((position) => {
        setState((prev) => ({
          ...prev,
          userLocation: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          },
        }));
      });
    }
  }, []);

  // Load trending on mount
  useEffect(() => {
    loadTrendingDestinations();
  }, []);

  const handleSearchInput = (query: string) => {
    setState((prev) => ({ ...prev, searchQuery: query }));

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (query.length > 2) {
      debounceTimer.current = setTimeout(() => {
        handleSearch(query);
      }, 500);
    }
  };

  const handleSearch = async (query: string) => {
    setState((prev) => ({ ...prev, isSearching: true, searchError: null }));

    try {
      const suggestions = await travelIntentService.getSuggestions(
        query,
        state.userLocation?.lat,
        state.userLocation?.lng,
        state.numPassengers,
        5
      );

      setState((prev) => ({
        ...prev,
        suggestions,
        isSearching: false,
      }));
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        isSearching: false,
        searchError: error.message || 'Failed to search',
        suggestions: [],
      }));
    }
  };

  const loadTrendingDestinations = async (category?: string) => {
    try {
      const trending = await travelIntentService.getTrendingDestinations(category);
      setState((prev) => ({
        ...prev,
        trendingDestinations: trending,
      }));
    } catch (error) {
      console.error('Error loading trending:', error);
    }
  };

  const selectSuggestion = (suggestion: IntentSuggestion) => {
    setState((prev) => ({
      ...prev,
      selectedSuggestion: suggestion,
    }));
  };

  const clearSelection = () => {
    setState((prev) => ({
      ...prev,
      selectedSuggestion: null,
      suggestions: [],
      searchQuery: '',
    }));
  };

  const quickBook = async (
    suggestionId: string,
    vehicleType: string,
    numPassengers: number
  ) => {
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
      }));

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
  };

  const updateNumPassengers = (numPassengers: number) => {
    setState((prev) => ({
      ...prev,
      numPassengers: Math.max(1, Math.min(6, numPassengers)),
    }));
  };

  const updateVehicleType = (vehicleType: string) => {
    setState((prev) => ({
      ...prev,
      selectedVehicleType: vehicleType,
    }));
  };

  return {
    ...state,
    handleSearchInput,
    handleSearch,
    loadTrendingDestinations,
    selectSuggestion,
    clearSelection,
    quickBook,
    updateNumPassengers,
    updateVehicleType,
  };
};

export default useTravelIntentWeb;
