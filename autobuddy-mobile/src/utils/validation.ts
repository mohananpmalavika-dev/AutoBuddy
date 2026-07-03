/**
 * Input Validation Utilities
 * 
 * Comprehensive validation functions for all user inputs.
 * Created as part of BUG-007, BUG-008, BUG-018, BUG-019 fixes.
 */

/**
 * Phone Number Validation
 */

export interface PhoneValidationResult {
  isValid: boolean;
  formatted?: string;
  error?: string;
}

/**
 * Validate and format Indian phone number
 * @param phone - Raw phone number input
 * @returns Validation result with formatted number
 */
export function validatePhone(phone: string | null | undefined): PhoneValidationResult {
  if (!phone) {
    return { isValid: false, error: 'Phone number is required' };
  }
  
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Check if it starts with country code
  if (cleaned.startsWith('91')) {
    // Remove country code
    const withoutCode = cleaned.substring(2);
    
    if (withoutCode.length !== 10) {
      return { isValid: false, error: 'Phone number must be 10 digits' };
    }
    
    return {
      isValid: true,
      formatted: `+91 ${withoutCode.substring(0, 5)} ${withoutCode.substring(5)}`,
    };
  }
  
  // Check for 10 digits
  if (cleaned.length !== 10) {
    return { isValid: false, error: 'Phone number must be 10 digits' };
  }
  
  // Check if starts with valid digits (6-9)
  if (!['6', '7', '8', '9'].includes(cleaned[0])) {
    return { isValid: false, error: 'Phone number must start with 6, 7, 8, or 9' };
  }
  
  return {
    isValid: true,
    formatted: `+91 ${cleaned.substring(0, 5)} ${cleaned.substring(5)}`,
  };
}

/**
 * Format phone number for display
 * @param phone - Phone number to format
 * @returns Formatted phone number or original if invalid
 */
export function formatPhone(phone: string | null | undefined): string {
  const result = validatePhone(phone);
  return result.formatted || phone || '';
}

/**
 * Location/Coordinates Validation
 */

export interface CoordinatesValidationResult {
  isValid: boolean;
  latitude?: number;
  longitude?: number;
  error?: string;
}

/**
 * Validate latitude and longitude coordinates
 * @param latitude - Latitude value
 * @param longitude - Longitude value
 * @returns Validation result
 */
export function validateCoordinates(
  latitude: any,
  longitude: any
): CoordinatesValidationResult {
  // Convert to numbers
  const lat = Number(latitude);
  const lng = Number(longitude);
  
  // Check if valid numbers
  if (!Number.isFinite(lat)) {
    return { isValid: false, error: 'Invalid latitude: must be a number' };
  }
  
  if (!Number.isFinite(lng)) {
    return { isValid: false, error: 'Invalid longitude: must be a number' };
  }
  
  // Check latitude range (-90 to 90)
  if (lat < -90 || lat > 90) {
    return { isValid: false, error: 'Latitude must be between -90 and 90' };
  }
  
  // Check longitude range (-180 to 180)
  if (lng < -180 || lng > 180) {
    return { isValid: false, error: 'Longitude must be between -180 and 180' };
  }
  
  // Check if coordinates are not zero (unlikely valid location)
  if (lat === 0 && lng === 0) {
    return { isValid: false, error: 'Invalid coordinates: cannot be (0, 0)' };
  }
  
  return {
    isValid: true,
    latitude: lat,
    longitude: lng,
  };
}

/**
 * Check if coordinates are within India
 * @param latitude - Latitude value
 * @param longitude - Longitude value
 * @returns true if coordinates are within India bounds
 */
export function isWithinIndia(latitude: number, longitude: number): boolean {
  // Approximate bounds of India
  const INDIA_BOUNDS = {
    minLat: 6.7,     // Southern tip (near Kanyakumari)
    maxLat: 35.5,    // Northern tip (Kashmir)
    minLng: 68.1,    // Western border
    maxLng: 97.4,    // Eastern border (Arunachal Pradesh)
  };
  
  return (
    latitude >= INDIA_BOUNDS.minLat &&
    latitude <= INDIA_BOUNDS.maxLat &&
    longitude >= INDIA_BOUNDS.minLng &&
    longitude <= INDIA_BOUNDS.maxLng
  );
}

/**
 * Fare/Amount Validation
 */

export interface FareValidationResult {
  isValid: boolean;
  amount?: number;
  error?: string;
}

/**
 * Validate fare amount
 * @param fare - Fare amount to validate
 * @param options - Validation options (min, max)
 * @returns Validation result
 */
export function validateFare(
  fare: any,
  options: { min?: number; max?: number } = {}
): FareValidationResult {
  const { min = 10, max = 10000 } = options;
  
  // Convert to number
  const amount = Number(fare);
  
  // Check if valid number
  if (!Number.isFinite(amount)) {
    return { isValid: false, error: 'Fare must be a valid number' };
  }
  
  // Check if positive
  if (amount <= 0) {
    return { isValid: false, error: 'Fare must be greater than zero' };
  }
  
  // Check minimum
  if (amount < min) {
    return { isValid: false, error: `Fare must be at least ₹${min}` };
  }
  
  // Check maximum
  if (amount > max) {
    return { isValid: false, error: `Fare cannot exceed ₹${max}` };
  }
  
  return {
    isValid: true,
    amount: Math.round(amount * 100) / 100, // Round to 2 decimal places
  };
}

/**
 * Validate fare estimation response from API
 * @param fareData - Fare data from API
 * @returns Validation result
 */
export function validateFareEstimation(fareData: any): FareValidationResult {
  if (!fareData || typeof fareData !== 'object') {
    return { isValid: false, error: 'Invalid fare data: must be an object' };
  }
  
  // Check for estimated_fare field
  if (!fareData.estimated_fare && fareData.estimated_fare !== 0) {
    return { isValid: false, error: 'Invalid fare data: missing estimated_fare field' };
  }
  
  // Validate the fare amount
  return validateFare(fareData.estimated_fare);
}

/**
 * Date/Time Validation
 */

export interface DateValidationResult {
  isValid: boolean;
  date?: Date;
  error?: string;
}

/**
 * Validate date input
 * @param dateInput - Date to validate (string, number, or Date)
 * @returns Validation result
 */
export function validateDate(dateInput: any): DateValidationResult {
  if (!dateInput) {
    return { isValid: false, error: 'Date is required' };
  }
  
  // Try to parse date
  const date = new Date(dateInput);
  
  // Check if valid date
  if (isNaN(date.getTime())) {
    return { isValid: false, error: 'Invalid date format' };
  }
  
  return {
    isValid: true,
    date,
  };
}

/**
 * Validate future date (for scheduled rides)
 * @param dateInput - Date to validate
 * @param minMinutesAhead - Minimum minutes ahead (default: 30)
 * @returns Validation result
 */
export function validateFutureDate(
  dateInput: any,
  minMinutesAhead: number = 30
): DateValidationResult {
  const result = validateDate(dateInput);
  
  if (!result.isValid || !result.date) {
    return result;
  }
  
  const now = new Date();
  const minTime = new Date(now.getTime() + minMinutesAhead * 60 * 1000);
  
  if (result.date < minTime) {
    return {
      isValid: false,
      error: `Date must be at least ${minMinutesAhead} minutes in the future`,
    };
  }
  
  // Check not too far in the future (e.g., 90 days)
  const maxTime = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  if (result.date > maxTime) {
    return {
      isValid: false,
      error: 'Date cannot be more than 90 days in the future',
    };
  }
  
  return {
    isValid: true,
    date: result.date,
  };
}

/**
 * Email Validation (Basic)
 */

export interface EmailValidationResult {
  isValid: boolean;
  email?: string;
  error?: string;
}

/**
 * Validate email address
 * @param email - Email to validate
 * @returns Validation result
 */
export function validateEmail(email: string | null | undefined): EmailValidationResult {
  if (!email) {
    return { isValid: false, error: 'Email is required' };
  }
  
  const trimmed = email.trim().toLowerCase();
  
  // Basic email regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(trimmed)) {
    return { isValid: false, error: 'Invalid email format' };
  }
  
  return {
    isValid: true,
    email: trimmed,
  };
}

/**
 * Distance Validation
 */

export interface DistanceValidationResult {
  isValid: boolean;
  distance?: number;
  error?: string;
}

/**
 * Validate distance in kilometers
 * @param distance - Distance to validate
 * @param options - Min/max options
 * @returns Validation result
 */
export function validateDistance(
  distance: any,
  options: { min?: number; max?: number } = {}
): DistanceValidationResult {
  const { min = 0.5, max = 500 } = options;
  
  const dist = Number(distance);
  
  if (!Number.isFinite(dist)) {
    return { isValid: false, error: 'Distance must be a valid number' };
  }
  
  if (dist < min) {
    return { isValid: false, error: `Distance must be at least ${min} km` };
  }
  
  if (dist > max) {
    return { isValid: false, error: `Distance cannot exceed ${max} km` };
  }
  
  return {
    isValid: true,
    distance: Math.round(dist * 10) / 10, // Round to 1 decimal
  };
}

/**
 * Generic validation helpers
 */

/**
 * Check if string is not empty
 */
export function isNonEmptyString(value: any): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Check if value is a positive number
 */
export function isPositiveNumber(value: any): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Check if value is within range
 */
export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/**
 * Sanitize string input (remove dangerous characters)
 */
export function sanitizeString(input: string | null | undefined): string {
  if (!input) return '';
  
  return input
    .trim()
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .substring(0, 500); // Limit length
}
