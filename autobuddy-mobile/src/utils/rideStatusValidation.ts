/**
 * Ride Status Validation Utilities
 * 
 * Provides validation for ride status transitions and state management.
 * Prevents invalid state transitions and ensures data consistency.
 * 
 * Created as part of BUG-009 fix - Ride status validation.
 */

// Valid ride statuses in the system
export type RideStatus =
  | 'pending'           // Ride requested, searching for driver
  | 'confirmed'         // Driver accepted, not yet started
  | 'driver_assigned'   // Driver assigned and approaching
  | 'driver_arrived'    // Driver arrived at pickup
  | 'in_progress'       // Ride in progress
  | 'completed'         // Ride completed successfully
  | 'cancelled'         // Ride cancelled (by passenger or driver)
  | 'cancelled_by_driver'
  | 'cancelled_by_passenger'
  | 'no_driver_available';

export interface RideStatusValidationResult {
  isValid: boolean;
  error?: string;
  canTransition?: boolean;
}

/**
 * Check if a status string is a valid ride status
 * @param status - Status to validate
 * @returns true if valid ride status
 */
export function isValidRideStatus(status: any): status is RideStatus {
  if (typeof status !== 'string') return false;
  
  const validStatuses: RideStatus[] = [
    'pending',
    'confirmed',
    'driver_assigned',
    'driver_arrived',
    'in_progress',
    'completed',
    'cancelled',
    'cancelled_by_driver',
    'cancelled_by_passenger',
    'no_driver_available',
  ];
  
  return validStatuses.includes(status as RideStatus);
}

/**
 * Validate a ride status value
 * @param status - Status to validate
 * @returns Validation result
 */
export function validateRideStatus(status: any): RideStatusValidationResult {
  if (!status) {
    return {
      isValid: false,
      error: 'Ride status is required',
    };
  }
  
  if (typeof status !== 'string') {
    return {
      isValid: false,
      error: 'Ride status must be a string',
    };
  }
  
  if (!isValidRideStatus(status)) {
    return {
      isValid: false,
      error: `Invalid ride status: "${status}"`,
    };
  }
  
  return {
    isValid: true,
  };
}

/**
 * Valid status transitions map
 * Key: current status, Value: array of valid next statuses
 */
const VALID_TRANSITIONS: Record<RideStatus, RideStatus[]> = {
  'pending': [
    'confirmed',
    'driver_assigned',
    'cancelled',
    'cancelled_by_passenger',
    'no_driver_available',
  ],
  'confirmed': [
    'driver_assigned',
    'driver_arrived',
    'cancelled',
    'cancelled_by_driver',
    'cancelled_by_passenger',
  ],
  'driver_assigned': [
    'driver_arrived',
    'cancelled',
    'cancelled_by_driver',
    'cancelled_by_passenger',
  ],
  'driver_arrived': [
    'in_progress',
    'cancelled',
    'cancelled_by_driver',
    'cancelled_by_passenger',
  ],
  'in_progress': [
    'completed',
    'cancelled',
    'cancelled_by_driver',
    'cancelled_by_passenger',
  ],
  'completed': [],  // Terminal state - no transitions allowed
  'cancelled': [],  // Terminal state - no transitions allowed
  'cancelled_by_driver': [],  // Terminal state
  'cancelled_by_passenger': [],  // Terminal state
  'no_driver_available': ['pending'],  // Can retry
};

/**
 * Check if a status transition is valid
 * @param currentStatus - Current ride status
 * @param newStatus - New status to transition to
 * @returns Validation result with transition info
 */
export function validateStatusTransition(
  currentStatus: any,
  newStatus: any
): RideStatusValidationResult {
  // Validate both statuses
  const currentValidation = validateRideStatus(currentStatus);
  if (!currentValidation.isValid) {
    return {
      isValid: false,
      error: `Invalid current status: ${currentValidation.error}`,
      canTransition: false,
    };
  }
  
  const newValidation = validateRideStatus(newStatus);
  if (!newValidation.isValid) {
    return {
      isValid: false,
      error: `Invalid new status: ${newValidation.error}`,
      canTransition: false,
    };
  }
  
  // Same status is always valid (idempotent)
  if (currentStatus === newStatus) {
    return {
      isValid: true,
      canTransition: true,
    };
  }
  
  // Check if transition is allowed
  const allowedTransitions = VALID_TRANSITIONS[currentStatus as RideStatus];
  const canTransition = allowedTransitions.includes(newStatus as RideStatus);
  
  if (!canTransition) {
    return {
      isValid: false,
      error: `Invalid transition from "${currentStatus}" to "${newStatus}"`,
      canTransition: false,
    };
  }
  
  return {
    isValid: true,
    canTransition: true,
  };
}

/**
 * Check if a ride is in an active state (not completed/cancelled)
 * @param status - Ride status to check
 * @returns true if ride is active
 */
export function isActiveRide(status: any): boolean {
  if (!isValidRideStatus(status)) return false;
  
  const activeStatuses: RideStatus[] = [
    'pending',
    'confirmed',
    'driver_assigned',
    'driver_arrived',
    'in_progress',
  ];
  
  return activeStatuses.includes(status);
}

/**
 * Check if a ride is in a terminal state (completed/cancelled)
 * @param status - Ride status to check
 * @returns true if ride is in terminal state
 */
export function isTerminalStatus(status: any): boolean {
  if (!isValidRideStatus(status)) return false;
  
  const terminalStatuses: RideStatus[] = [
    'completed',
    'cancelled',
    'cancelled_by_driver',
    'cancelled_by_passenger',
  ];
  
  return terminalStatuses.includes(status);
}

/**
 * Check if a ride can be cancelled
 * @param status - Current ride status
 * @returns true if cancellation is allowed
 */
export function canCancelRide(status: any): boolean {
  if (!isValidRideStatus(status)) return false;
  
  // Cannot cancel if already in terminal state
  if (isTerminalStatus(status)) return false;
  
  // Cannot cancel if driver not found
  if (status === 'no_driver_available') return false;
  
  return true;
}

/**
 * Get user-friendly status text
 * @param status - Ride status
 * @returns User-friendly status text
 */
export function getRideStatusText(status: any): string {
  if (!isValidRideStatus(status)) return 'Unknown Status';
  
  const statusTextMap: Record<RideStatus, string> = {
    'pending': 'Searching for driver...',
    'confirmed': 'Driver confirmed',
    'driver_assigned': 'Driver on the way',
    'driver_arrived': 'Driver has arrived',
    'in_progress': 'Ride in progress',
    'completed': 'Ride completed',
    'cancelled': 'Ride cancelled',
    'cancelled_by_driver': 'Cancelled by driver',
    'cancelled_by_passenger': 'Cancelled by you',
    'no_driver_available': 'No driver available',
  };
  
  return statusTextMap[status];
}

/**
 * Get next possible statuses for current status
 * @param currentStatus - Current ride status
 * @returns Array of valid next statuses
 */
export function getNextStatuses(currentStatus: any): RideStatus[] {
  if (!isValidRideStatus(currentStatus)) return [];
  return VALID_TRANSITIONS[currentStatus];
}

/**
 * Get ride progress percentage based on status
 * @param status - Current ride status
 * @returns Progress percentage (0-100)
 */
export function getRideProgress(status: any): number {
  if (!isValidRideStatus(status)) return 0;
  
  const progressMap: Record<RideStatus, number> = {
    'pending': 10,
    'confirmed': 20,
    'driver_assigned': 40,
    'driver_arrived': 60,
    'in_progress': 80,
    'completed': 100,
    'cancelled': 0,
    'cancelled_by_driver': 0,
    'cancelled_by_passenger': 0,
    'no_driver_available': 0,
  };
  
  return progressMap[status];
}

/**
 * Validate complete ride object
 * @param ride - Ride object to validate
 * @returns Validation result
 */
export function validateRide(ride: any): RideStatusValidationResult {
  if (!ride || typeof ride !== 'object') {
    return {
      isValid: false,
      error: 'Ride must be an object',
    };
  }
  
  // Check required fields
  if (!ride.id) {
    return {
      isValid: false,
      error: 'Ride ID is required',
    };
  }
  
  // Validate status
  const statusValidation = validateRideStatus(ride.status);
  if (!statusValidation.isValid) {
    return statusValidation;
  }
  
  // Additional validations based on status
  if (isActiveRide(ride.status)) {
    // Active rides should have passenger ID
    if (!ride.passenger_id && !ride.passengerId) {
      return {
        isValid: false,
        error: 'Active ride must have passenger ID',
      };
    }
  }
  
  if (['driver_assigned', 'driver_arrived', 'in_progress'].includes(ride.status)) {
    // These statuses should have driver ID
    if (!ride.driver_id && !ride.driverId) {
      return {
        isValid: false,
        error: `Ride with status "${ride.status}" must have driver ID`,
      };
    }
  }
  
  return {
    isValid: true,
  };
}

/**
 * Sanitize ride status from API response
 * Handles various formats and returns normalized status
 * @param rawStatus - Raw status from API
 * @returns Normalized ride status or null if invalid
 */
export function sanitizeRideStatus(rawStatus: any): RideStatus | null {
  if (!rawStatus) return null;
  
  const normalized = String(rawStatus).toLowerCase().trim();
  
  // Handle snake_case and camelCase variations
  const statusMap: Record<string, RideStatus> = {
    'pending': 'pending',
    'confirmed': 'confirmed',
    'driver_assigned': 'driver_assigned',
    'driverassigned': 'driver_assigned',
    'driver_arrived': 'driver_arrived',
    'driverarrived': 'driver_arrived',
    'in_progress': 'in_progress',
    'inprogress': 'in_progress',
    'ongoing': 'in_progress',
    'active': 'in_progress',
    'completed': 'completed',
    'finished': 'completed',
    'cancelled': 'cancelled',
    'canceled': 'cancelled',
    'cancelled_by_driver': 'cancelled_by_driver',
    'cancelledbydriver': 'cancelled_by_driver',
    'cancelled_by_passenger': 'cancelled_by_passenger',
    'cancelledbypassenger': 'cancelled_by_passenger',
    'no_driver_available': 'no_driver_available',
    'nodriveravailable': 'no_driver_available',
  };
  
  return statusMap[normalized] || null;
}
