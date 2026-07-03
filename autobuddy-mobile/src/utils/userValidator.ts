/**
 * User Validation Utility
 * 
 * Validates user objects from API responses to prevent null/undefined access bugs.
 * Created as part of BUG-001 fix.
 */

export interface ValidatedUser {
  id: string;
  role: 'passenger' | 'driver' | 'operator';
  name: string;
  email: string;
  phone: string;
  photo: string;
}

/**
 * Validates user object from API response
 * @param userData - Raw user data from API
 * @returns Validated user object or null if invalid
 */
export function validateUser(userData: any): ValidatedUser | null {
  // Check if userData exists
  if (!userData || typeof userData !== 'object') {
    console.error('[UserValidator] Invalid user: data is null or not an object');
    return null;
  }
  
  // Validate required field: id
  if (!userData.id || typeof userData.id !== 'string' || !userData.id.trim()) {
    console.error('[UserValidator] Invalid user: missing or invalid id');
    return null;
  }
  
  // Validate required field: role
  const validRoles = ['passenger', 'driver', 'operator'];
  if (!userData.role || !validRoles.includes(userData.role)) {
    console.error('[UserValidator] Invalid user: missing or invalid role. Got:', userData.role);
    return null;
  }
  
  // Validate required field: phone
  if (!userData.phone || typeof userData.phone !== 'string' || !userData.phone.trim()) {
    console.error('[UserValidator] Invalid user: missing or invalid phone');
    return null;
  }
  
  // Return validated user object with defaults for optional fields
  return {
    id: userData.id.trim(),
    role: userData.role,
    name: userData.name && typeof userData.name === 'string' ? userData.name.trim() : '',
    email: userData.email && typeof userData.email === 'string' ? userData.email.trim() : '',
    phone: userData.phone.trim(),
    photo: userData.photo && typeof userData.photo === 'string' ? userData.photo.trim() : '',
  };
}

/**
 * Type guard to check if user object is valid
 * @param user - User object to check
 * @returns true if user has all required fields
 */
export function isValidUser(user: any): user is ValidatedUser {
  return (
    user !== null &&
    typeof user === 'object' &&
    typeof user.id === 'string' &&
    typeof user.role === 'string' &&
    ['passenger', 'driver', 'operator'].includes(user.role) &&
    typeof user.phone === 'string' &&
    user.id.length > 0 &&
    user.phone.length > 0
  );
}
