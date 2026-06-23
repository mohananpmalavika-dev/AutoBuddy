import { useState, useEffect, useCallback, useRef } from 'react';
import { apiRequest } from '../lib/api-client';

export interface PredictiveRideOption {
  id: string;
  type: 'auto' | 'cab';
  label: string;
  price: number;
  estimatedMinutes: number;
  icon: string;
}

export interface PredictiveBookingData {
  id: string;
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled';
  origin: string;
  destination: string;
  rideType: string;
  fare: number;
}

export interface PredictiveBookingState {
  greeting: string;
  userName: string;
  origin: string;
  destination: string;
  isMorningWindow: boolean;
  rideOptions: PredictiveRideOption[];
  selectedOptionId: string | null;
  bookingStatus: 'idle' | 'booking' | 'done' | 'error';
  bookingResult: PredictiveBookingData | null;
  errorMessage: string;
}

const MORNING_WINDOW_START_HOUR = 7;
const MORNING_WINDOW_END_HOUR = 10;

function getISTHour(): number {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000);
  return istTime.getHours();
}

function isInMorningWindow(): boolean {
  const hour = getISTHour();
  return hour >= MORNING_WINDOW_START_HOUR && hour < MORNING_WINDOW_END_HOUR;
}

function getGreeting(userName: string): string {
  const hour = getISTHour();
  if (hour < 12) {return `Good Morning ${userName}`;}
  if (hour < 17) {return `Good Afternoon ${userName}`;}
  return `Good Evening ${userName}`;
}

function getDefaultOrigin(): string {
  return 'Nearby Location';
}

function getDefaultDestination(): string {
  return 'Office';
}

function getDefaultRideOptions(): PredictiveRideOption[] {
  return [
    { id: 'auto', type: 'auto', label: 'Auto', price: 120, estimatedMinutes: 25, icon: '🛺' },
    { id: 'cab', type: 'cab', label: 'Cab', price: 190, estimatedMinutes: 18, icon: '🚖' },
  ];
}

/**
 * Hook for predictive one-tap morning booking.
 *
 * Detects the morning window, suggests the user's usual commute
 * (home → office) with pre-calculated fare, and handles
 * a single-tap booking flow.
 */
export function usePredictiveBooking(token: string | null, userName: string) {
  const [state, setState] = useState<PredictiveBookingState>({
    greeting: getGreeting(userName),
    userName,
    origin: getDefaultOrigin(),
    destination: getDefaultDestination(),
    isMorningWindow: isInMorningWindow(),
    rideOptions: getDefaultRideOptions(),
    selectedOptionId: null,
    bookingStatus: 'idle',
    bookingResult: null,
    errorMessage: '',
  });

  // Track auto-dismiss timeout
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update greeting when name changes
  useEffect(() => {
    setState((prev) => ({
      ...prev,
      greeting: getGreeting(userName),
      userName,
    }));
  }, [userName]);

  // Check morning window periodically (every 5 minutes)
  useEffect(() => {
    const checkWindow = () => {
      setState((prev) => ({
        ...prev,
        isMorningWindow: isInMorningWindow(),
      }));
    };
    const interval = setInterval(checkWindow, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Refresh predictive data from backend when in morning window
  useEffect(() => {
    if (!token || !state.isMorningWindow) {return;}

    let cancelled = false;

    const fetchPredictiveData = async () => {
      try {
        const data = await apiRequest<{
          greeting?: string;
          origin?: string;
          destination?: string;
          rideOptions?: PredictiveRideOption[];
        }>('/passenger/predictive-booking', {
          token,
          timeoutMs: 8000,
        }).catch(() => null);

        if (cancelled || !data) {return;}

        setState((prev) => ({
          ...prev,
          greeting: data.greeting || prev.greeting,
          origin: data.origin || prev.origin,
          destination: data.destination || prev.destination,
          rideOptions: data.rideOptions && data.rideOptions.length > 0
            ? data.rideOptions
            : prev.rideOptions,
          selectedOptionId: data.rideOptions?.[0]?.id || 'auto',
        }));
      } catch {
        // Use defaults on failure
      }
    };

    fetchPredictiveData();
    return () => { cancelled = true; };
  }, [token, state.isMorningWindow]);

  const selectOption = useCallback((optionId: string) => {
    setState((prev) => ({
      ...prev,
      selectedOptionId: optionId,
      errorMessage: '',
    }));
  }, []);

  const bookRide = useCallback(async () => {
    if (!token) {
      setState((prev) => ({ ...prev, errorMessage: 'Authentication required to book.' }));
      return;
    }

    const selectedOption = state.rideOptions.find(
      (opt) => opt.id === state.selectedOptionId
    );
    if (!selectedOption) {
      setState((prev) => ({ ...prev, errorMessage: 'Please select a ride option.' }));
      return;
    }

    setState((prev) => ({ ...prev, bookingStatus: 'booking', errorMessage: '' }));

    try {
      const result = await apiRequest<PredictiveBookingData>('/passenger/rides/book', {
        method: 'POST',
        token,
        body: {
          origin: state.origin,
          destination: state.destination,
          rideType: selectedOption.type,
          fare: selectedOption.price,
          source: 'predictive_booking',
        },
      });

      if (!result || result.status === 'cancelled') {
        throw new Error('Booking could not be created.');
      }

      setState((prev) => ({
        ...prev,
        bookingStatus: 'done',
        bookingResult: result,
      }));

      // Auto-reset after 5 seconds – also dismiss so card doesn't reappear
      if (dismissTimerRef.current) {clearTimeout(dismissTimerRef.current);}
      dismissTimerRef.current = setTimeout(() => {
        setState((prev) => ({
          ...prev,
          isMorningWindow: false,
          bookingStatus: 'idle',
          bookingResult: null,
          selectedOptionId: null,
        }));
      }, 5000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Booking failed. Please try again.';
      setState((prev) => ({
        ...prev,
        bookingStatus: 'error',
        errorMessage: message,
      }));
    }
  }, [token, state.rideOptions, state.selectedOptionId, state.origin, state.destination]);

  const reset = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    setState((prev) => ({
      ...prev,
      bookingStatus: 'idle',
      bookingResult: null,
      selectedOptionId: null,
      errorMessage: '',
    }));
  }, []);

  const dismiss = useCallback(() => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    setState((prev) => ({
      ...prev,
      isMorningWindow: false,
      bookingStatus: 'idle',
      bookingResult: null,
      selectedOptionId: null,
      errorMessage: '',
    }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (dismissTimerRef.current) {clearTimeout(dismissTimerRef.current);}
    };
  }, []);

  return {
    ...state,
    selectOption,
    bookRide,
    reset,
    dismiss,
  };
}

export default usePredictiveBooking;
