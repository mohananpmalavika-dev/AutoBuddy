/**
 * Safe Driver Hook
 * 
 * Provides safe access to driver object properties with default values.
 * Prevents null/undefined access bugs when driver is not available.
 * 
 * Created as part of BUG-003 fix - Driver object null checks.
 */

export interface Driver {
  id: string;
  name: string;
  phone: string;
  rating?: number;
  photo?: string;
  vehicle?: {
    make: string;
    model: string;
    licensePlate: string;
    color: string;
    year?: number;
  } | null;
  location?: {
    latitude: number;
    longitude: number;
  } | null;
  status?: string;
  totalRides?: number;
  [key: string]: any;
}

export interface SafeDriver {
  hasDriver: boolean;
  id: string;
  name: string;
  phone: string;
  rating: number;
  photo: string;
  vehicle: {
    make: string;
    model: string;
    licensePlate: string;
    color: string;
    year: number;
  } | null;
  location: {
    latitude: number;
    longitude: number;
  } | null;
  status: string;
  totalRides: number;
}

/**
 * Hook to safely access driver properties with defaults
 * @param driver - Driver object (can be null/undefined)
 * @returns Safe driver object with guaranteed properties
 */
export function useSafeDriver(driver: Driver | null | undefined): SafeDriver {
  const hasDriver = driver !== null && driver !== undefined;
  
  return {
    hasDriver,
    id: driver?.id || '',
    name: driver?.name || 'Driver',
    phone: driver?.phone || '',
    rating: typeof driver?.rating === 'number' ? driver.rating : 5.0,
    photo: driver?.photo || '',
    vehicle: driver?.vehicle ? {
      make: driver.vehicle.make || 'Unknown',
      model: driver.vehicle.model || 'Unknown',
      licensePlate: driver.vehicle.licensePlate || '',
      color: driver.vehicle.color || 'White',
      year: typeof driver.vehicle.year === 'number' ? driver.vehicle.year : new Date().getFullYear(),
    } : null,
    location: driver?.location ? {
      latitude: typeof driver.location.latitude === 'number' ? driver.location.latitude : 0,
      longitude: typeof driver.location.longitude === 'number' ? driver.location.longitude : 0,
    } : null,
    status: driver?.status || 'unknown',
    totalRides: typeof driver?.totalRides === 'number' ? driver.totalRides : 0,
  };
}

/**
 * Type guard to check if driver is valid
 * @param driver - Object to check
 * @returns true if driver has required fields
 */
export function isValidDriver(driver: any): driver is Driver {
  return (
    driver !== null &&
    driver !== undefined &&
    typeof driver === 'object' &&
    typeof driver.id === 'string' &&
    driver.id.length > 0 &&
    typeof driver.name === 'string' &&
    typeof driver.phone === 'string'
  );
}

/**
 * Get driver status display text
 * @param status - Raw driver status
 * @returns User-friendly status text
 */
export function getDriverStatusText(status: string | undefined | null): string {
  if (!status) return 'Unknown';
  
  const statusMap: Record<string, string> = {
    'available': 'Available',
    'busy': 'On a ride',
    'offline': 'Offline',
    'on_break': 'On break',
    'approaching': 'Approaching',
    'arrived': 'Arrived',
    'unknown': 'Status unknown',
  };
  
  return statusMap[status.toLowerCase()] || status;
}

/**
 * Check if driver is online and available
 * @param driver - Driver object
 * @returns true if driver is available for rides
 */
export function isDriverAvailable(driver: Driver | null | undefined): boolean {
  if (!driver || !driver.status) return false;
  return driver.status.toLowerCase() === 'available';
}

/**
 * Check if driver has a vehicle assigned
 * @param driver - Driver object
 * @returns true if vehicle is assigned
 */
export function hasVehicle(driver: Driver | null | undefined): boolean {
  return !!(driver?.vehicle && driver.vehicle.licensePlate);
}

/**
 * Format driver rating for display
 * @param rating - Driver rating (0-5)
 * @returns Formatted rating string
 */
export function formatDriverRating(rating: number | undefined | null): string {
  if (typeof rating !== 'number') return '—';
  return rating.toFixed(1);
}

/**
 * Get driver experience level based on total rides
 * @param totalRides - Number of completed rides
 * @returns Experience level
 */
export function getDriverExperienceLevel(totalRides: number | undefined): string {
  if (!totalRides || totalRides < 50) return 'New';
  if (totalRides < 200) return 'Experienced';
  if (totalRides < 500) return 'Expert';
  return 'Master';
}
