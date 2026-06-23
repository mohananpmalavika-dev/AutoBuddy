/**
 * AI Travel Intent Engine - React Native Service Layer
 * Handles all API communication for intent recognition, suggestions, and bookings
 */

import axios, { AxiosInstance } from 'axios';
import { Platform } from 'react-native';

interface IntentRecognitionRequest {
  query: string;
  currentLocation?: { lat: number; lng: number };
  numPassengers: number;
  preferences?: Record<string, any>;
}

interface IntentSuggestion {
  id: string;
  location: {
    id: string;
    name: string;
    category: string;
    address: string;
    latitude: number;
    longitude: number;
    rating: number;
    reviewsCount: number;
    amenities: string[];
  };
  pricing: {
    vehicleType: string;
    estimatedFare: number;
    fareBreakdown: {
      baseFare: number;
      perKmCharge: number;
      perMinuteCharge: number;
      surgeFactor: number;
    };
  }[];
  travelTime: {
    estimatedMinutes: number;
    distance: number;
  };
  score: number;
  confidence: number;
}

interface QuickBookRequest {
  suggestionId: string;
  vehicleType: string;
  numPassengers: number;
  pickupLocation: { lat: number; lng: number };
}

class TravelIntentService {
  private api: AxiosInstance;
  private baseURL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  constructor() {
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Recognize user's travel intent from natural language query
   */
  async recognizeIntent(request: IntentRecognitionRequest) {
    try {
      const response = await this.api.post('/api/intent/recognize', {
        query: request.query,
        current_location: request.currentLocation,
        num_passengers: request.numPassengers,
        preferences: request.preferences,
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get AI-powered destination suggestions based on intent
   */
  async getSuggestions(
    query: string,
    latitude?: number,
    longitude?: number,
    numPassengers: number = 1,
    limit: number = 5
  ): Promise<IntentSuggestion[]> {
    try {
      const params = new URLSearchParams({
        query,
        num_passengers: numPassengers.toString(),
        limit: limit.toString(),
      });

      if (latitude && longitude) {
        params.append('latitude', latitude.toString());
        params.append('longitude', longitude.toString());
      }

      const response = await this.api.get(`/api/intent/suggest?${params}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get detailed information about a suggestion
   */
  async getSuggestionDetails(suggestionId: string) {
    try {
      const response = await this.api.get(`/api/intent/suggestions/${suggestionId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Quick booking from suggestion
   */
  async quickBook(request: QuickBookRequest) {
    try {
      const response = await this.api.post('/api/intent/quick-book', {
        suggestion_id: request.suggestionId,
        vehicle_type: request.vehicleType,
        num_passengers: request.numPassengers,
        pickup_location: {
          lat: request.pickupLocation.lat,
          lng: request.pickupLocation.lng,
        },
      });
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get trending destinations
   */
  async getTrendingDestinations(category?: string, limit: number = 10) {
    try {
      const params = new URLSearchParams({ limit: limit.toString() });
      if (category) {params.append('category', category);}

      const response = await this.api.get(`/api/intent/trending?${params}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * List all locations
   */
  async listLocations(category?: string, search?: string, limit: number = 20) {
    try {
      const params = new URLSearchParams({ limit: limit.toString() });
      if (category) {params.append('category', category);}
      if (search) {params.append('search', search);}

      const response = await this.api.get(`/api/intent/locations?${params}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get location details
   */
  async getLocationDetails(locationId: string) {
    try {
      const response = await this.api.get(`/api/intent/locations/${locationId}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Estimate pricing for a route
   */
  async estimatePricing(
    fromLat: number,
    fromLng: number,
    toLat: number,
    toLng: number,
    vehicleType: string = 'auto',
    numPassengers: number = 1
  ) {
    try {
      const params = new URLSearchParams({
        from_lat: fromLat.toString(),
        from_lng: fromLng.toString(),
        to_lat: toLat.toString(),
        to_lng: toLng.toString(),
        vehicle_type: vehicleType,
        num_passengers: numPassengers.toString(),
      });

      const response = await this.api.get(`/api/intent/pricing/estimate?${params}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Save user intent search history
   */
  async saveHistory(
    userId: string,
    query: string,
    suggestionSelected?: string,
    bookingCompleted: boolean = false
  ) {
    try {
      const params = new URLSearchParams({
        user_id: userId,
        query,
        booking_completed: bookingCompleted.toString(),
      });
      if (suggestionSelected) {
        params.append('suggestion_selected', suggestionSelected);
      }

      const response = await this.api.post(`/api/intent/history?${params}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Get search metrics
   */
  async getSearchMetrics(limit: number = 10) {
    try {
      const response = await this.api.get(`/api/intent/search/metrics?limit=${limit}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Submit feedback on a suggestion
   */
  async submitFeedback(suggestionId: string, rating: number, comment?: string) {
    try {
      const params = new URLSearchParams({
        suggestion_id: suggestionId,
        rating: rating.toString(),
      });
      if (comment) {params.append('comment', comment);}

      const response = await this.api.post(`/api/intent/feedback?${params}`);
      return response.data;
    } catch (error) {
      throw this.handleError(error);
    }
  }

  /**
   * Set authorization token
   */
  setAuthToken(token: string) {
    this.api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  /**
   * Clear authorization token
   */
  clearAuthToken() {
    delete this.api.defaults.headers.common['Authorization'];
  }

  /**
   * Handle API errors
   */
  private handleError(error: any): Error {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        // Server responded with error status
        return new Error(
          error.response.data?.detail || 
          `Server error: ${error.response.status}`
        );
      } else if (error.request) {
        // Request made but no response
        return new Error('No response from server. Check your internet connection.');
      }
    }
    return error || new Error('Unknown error occurred');
  }
}

export default new TravelIntentService();
export type { IntentSuggestion, IntentRecognitionRequest, QuickBookRequest };
