/**
 * Safe Booking Hook
 * 
 * Provides safe access to booking object properties with default values.
 * Prevents null/undefined access bugs when booking is not available.
 * 
 * Created as part of BUG-002 fix - Booking object null checks.
 */

export interface Booking {
  id: string;
  destination: string;
  origin: string;
  fare: number;
  status: string;
  driver?: {
    id: string;
    name: string;
    phone: string;
    rating?: number;
    photo?: string;
  } | null;
  rideType: string;
  scheduledAt?: string;
  createdAt?: string;
  estimatedArrival?: string;
  [key: string]: any;
}

export interface SafeBooking {
  hasBooking: boolean;
  id: string;
  destination: string;
  origin: string;
  fare: number;
  status: string;
  driver: {
    id: string;
    name: string;
    phone: string;
    rating: number;
    photo: string;
  } | null;
  rideType: string;
  scheduledAt: string;
  createdAt: string;
  estimatedArrival: string;
}

/**
 * Hook to safely access booking properties with defaults
 * @param booking - Booking object (can be null/undefined)
 * @returns Safe booking object with guaranteed properties
 */
export function useSafeBooking(booking: Booking | null | undefined): SafeBooking {
  const hasBooking = booking !== null && booking !== undefined;
  
  return {
    hasBooking,
    id: booking?.id || '',
    destination: booking?.destination || '',
    origin: booking?.origin || '',
    fare: typeof booking?.fare === 'number' ? booking.fare : 0,
    status: booking?.status || 'unknown',
    driver: booking?.driver ? {
      id: booking.driver.id || '',
      name: booking.driver.name || 'Driver',
      phone: booking.driver.phone || '',
      rating: typeof booking.driver.rating === 'number' ? booking.driver.rating : 5.0,
      photo: booking.driver.photo || '',
    } : null,
    rideType: booking?.rideType || 'economy',
    scheduledAt: booking?.scheduledAt || '',
    createdAt: booking?.createdAt || '',
    estimatedArrival: booking?.estimatedArrival || '',
  };
}

/**
 * Type guard to check if booking is valid
 * @param booking - Object to check
 * @returns true if booking has required fields
 */
export function isValidBooking(booking: any): booking is Booking {
  return (
    booking !== null &&
    booking !== undefined &&
    typeof booking === 'object' &&
    typeof booking.id === 'string' &&
    booking.id.length > 0 &&
    typeof booking.destination === 'string' &&
    typeof booking.status === 'string'
  );
}

/**
 * Get booking status display text
 * @param status - Raw booking status
 * @returns User-friendly status text
 */
export function getBookingStatusText(status: string | undefined | null): string {
  if (!status) return 'Unknown';
  
  const statusMap: Record<string, string> = {
    'pending': 'Searching for driver...',
    'confirmed': 'Driver confirmed',
    'driver_assigned': 'Driver on the way',
    'driver_arrived': 'Driver arrived',
    'in_progress': 'Ride in progress',
    'completed': 'Completed',
    'cancelled': 'Cancelled',
    'unknown': 'Status unknown',
  };
  
  return statusMap[status.toLowerCase()] || status;
}

/**
 * Check if booking is active (not completed or cancelled)
 * @param booking - Booking object
 * @returns true if booking is active
 */
export function isBookingActive(booking: Booking | null | undefined): boolean {
  if (!booking || !booking.status) return false;
  
  const activeStatuses = ['pending', 'confirmed', 'driver_assigned', 'driver_arrived', 'in_progress'];
  return activeStatuses.includes(booking.status.toLowerCase());
}

/**
 * Check if booking has assigned driver
 * @param booking - Booking object
 * @returns true if driver is assigned
 */
export function hasDriver(booking: Booking | null | undefined): boolean {
  return !!(booking?.driver && booking.driver.id);
}
