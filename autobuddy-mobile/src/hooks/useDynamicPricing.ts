import { useState, useEffect, useCallback } from 'react';

export interface Location {
  latitude: number;
  longitude: number;
}

export interface PricingBreakdown {
  base_fare: number;
  distance_fare: number;
  surge_fare: number;
  discount: number;
  taxes: number;
  total: number;
  currency: string;
  is_surge_active: boolean;
  surge_multiplier: number;
}

export interface ETAData {
  eta_minutes: number;
  distance_km: number;
  driver_name?: string;
  driver_rating?: number;
  vehicle_number?: string;
  vehicle_type?: string;
}

export interface PricingSummary {
  pricing: PricingBreakdown;
  eta: ETAData;
  user_id: string;
  calculated_at: string;
}

/**
 * Hook for calculating dynamic pricing and ETA
 */
export const useDynamicPricing = () => {
  const [pricing, setPricing] = useState<PricingBreakdown | null>(null);
  const [eta, setEta] = useState<ETAData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const calculatePricing = useCallback(
    async (
      pickup: Location,
      dropoff: Location,
      rideType: string = 'economy',
      userId: string = 'anonymous'
    ) => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/v1/premium-ui/pricing-summary/${userId}?pickup_lat=${pickup.latitude}&pickup_lon=${pickup.longitude}&dropoff_lat=${dropoff.latitude}&dropoff_lon=${dropoff.longitude}&ride_type=${rideType}`
        );

        if (!response.ok) {
          throw new Error('Failed to calculate pricing');
        }

        const data: PricingSummary = await response.json();
        setPricing(data.pricing);
        setEta(data.eta);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const getQuickEstimate = useCallback(
    async (rideType: string = 'economy', distanceKm: number = 10) => {
      try {
        const response = await fetch(
          `/api/v1/premium-ui/estimated-fare/${rideType}?distance_km=${distanceKm}`
        );

        if (!response.ok) {
          throw new Error('Failed to get estimate');
        }

        return await response.json();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
        return null;
      }
    },
    []
  );

  const getSurgeStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/v1/premium-ui/surge-status');

      if (!response.ok) {
        throw new Error('Failed to get surge status');
      }

      return await response.json();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      return null;
    }
  }, []);

  return {
    pricing,
    eta,
    loading,
    error,
    calculatePricing,
    getQuickEstimate,
    getSurgeStatus,
  };
};

/**
 * Hook for tracking real-time ride updates
 */
export const useRideTracking = (rideId: string) => {
  const [status, setStatus] = useState<string | null>(null);
  const [driverLocation, setDriverLocation] = useState<Location | null>(null);
  const [eta, setEta] = useState<number | null>(null);

  useEffect(() => {
    // Simulate WebSocket connection for real-time updates
    const interval = setInterval(() => {
      // In real implementation, this would come from WebSocket
      // For now, just simulate updates
      setEta((prev) => (prev ? Math.max(1, prev - 1) : null));
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [rideId]);

  return {
    status,
    driverLocation,
    eta,
  };
};
