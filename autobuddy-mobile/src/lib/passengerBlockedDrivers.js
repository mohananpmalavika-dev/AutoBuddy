import { formatToIST } from '../utils/time';

/**
 * Helper functions for managing passenger blocked drivers
 * Mirrors the functionality of driverBlockedPassengers.js
 */

function cleanString(value) {
  const text = String(value || '').trim();
  return text || null;
}

function shortId(value) {
  const text = cleanString(value);
  if (!text) {
    return null;
  }
  return text.length > 8 ? text.slice(-8) : text;
}

function getDriverId(item) {
  return cleanString(item?.driver_id || item?.id);
}

/**
 * Normalize blocked driver data from API response
 * @param {Object} payload - API response with drivers array or driver_ids array
 * @returns {Array} Normalized array of blocked driver objects
 */
export function normalizeBlockedDriverRows(payload = {}) {
  const rows = [];
  const seen = new Set();
  const driverRows = Array.isArray(payload?.drivers) ? payload.drivers : [];
  const driverIds = Array.isArray(payload?.driver_ids) ? payload.driver_ids : [];

  // Process detailed driver objects
  driverRows.forEach((item) => {
    const driverId = getDriverId(item);
    if (!driverId || seen.has(driverId)) {
      return;
    }

    seen.add(driverId);
    rows.push({
      driver_id: driverId,
      driver_name: cleanString(item.driver_name || item.name) || 'Driver',
      driver_phone: cleanString(item.driver_phone || item.phone),
      driver_rating: item.driver_rating ?? item.rating ?? null,
      vehicle_info: item.vehicle_info || item.vehicle || null,
      blocked_at: item.blocked_at || item.created_at || item.updated_at || null,
      updated_at: item.updated_at || null,
      reason: cleanString(item.reason || item.block_reason),
      last_booking_id: cleanString(item.last_booking_id || item.booking_id),
      last_booking_status: cleanString(item.last_booking_status || item.status),
      last_ride_at: item.last_ride_at || item.last_booking_at || null,
      pickup_address: cleanString(item.pickup_address || item.from),
      dropoff_address: cleanString(item.dropoff_address || item.drop_address || item.to),
      estimated_fare: item.estimated_fare ?? item.final_fare ?? null,
    });
  });

  // Process driver IDs without detailed info
  driverIds.forEach((driverIdValue) => {
    const driverId = cleanString(driverIdValue);
    if (!driverId || seen.has(driverId)) {
      return;
    }

    seen.add(driverId);
    rows.push({
      driver_id: driverId,
      driver_name: 'Driver',
      driver_phone: null,
      driver_rating: null,
      vehicle_info: null,
      blocked_at: null,
      updated_at: null,
      reason: null,
      last_booking_id: null,
      last_booking_status: null,
      last_ride_at: null,
      pickup_address: null,
      dropoff_address: null,
      estimated_fare: null,
    });
  });

  return rows;
}

/**
 * Get a summary of the last ride with a blocked driver
 * @param {Object} item - Blocked driver item
 * @returns {string} Human-readable ride summary
 */
export function getBlockedDriverRideSummary(item) {
  const pickup = cleanString(item?.pickup_address);
  const dropoff = cleanString(item?.dropoff_address);
  
  if (pickup && dropoff) {
    return `${pickup} to ${dropoff}`;
  }
  if (pickup) {
    return `Pickup: ${pickup}`;
  }
  if (dropoff) {
    return `Drop: ${dropoff}`;
  }
  
  const bookingId = shortId(item?.last_booking_id);
  return bookingId ? `Ride #${bookingId}` : 'No ride context recorded';
}

/**
 * Format block date in IST timezone
 * @param {string|Date} value - Date value to format
 * @returns {string} Formatted date string
 */
export function formatBlockedDriverDate(value) {
  if (!value) {
    return 'Date not recorded';
  }

  try {
    return formatToIST(value, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return 'Date not recorded';
  }
}

/**
 * Filter blocked drivers by search query
 * @param {Array} drivers - Array of blocked driver objects
 * @param {string} query - Search query string
 * @returns {Array} Filtered array of drivers
 */
export function filterBlockedDrivers(drivers, query) {
  const normalizedQuery = cleanString(query)?.toLowerCase();
  if (!normalizedQuery) {
    return Array.isArray(drivers) ? drivers : [];
  }

  return (Array.isArray(drivers) ? drivers : []).filter((item) => {
    const haystack = [
      item.driver_id,
      item.driver_name,
      item.driver_phone,
      item.reason,
      item.vehicle_info?.make,
      item.vehicle_info?.model,
      item.vehicle_info?.license_plate,
      item.pickup_address,
      item.dropoff_address,
    ]
      .filter(Boolean)
      .map((value) => String(value).toLowerCase())
      .join(' ');

    return haystack.includes(normalizedQuery);
  });
}

/**
 * Format vehicle information for display
 * @param {Object} vehicle - Vehicle info object
 * @returns {string} Formatted vehicle string
 */
export function formatVehicleInfo(vehicle) {
  if (!vehicle) {
    return null;
  }

  const parts = [
    cleanString(vehicle.make),
    cleanString(vehicle.model),
    vehicle.year ? String(vehicle.year) : null,
  ].filter(Boolean);

  if (parts.length === 0) {
    return 'Vehicle info unavailable';
  }

  return parts.join(' ');
}

/**
 * Get license plate from vehicle info
 * @param {Object} vehicle - Vehicle info object
 * @returns {string|null} License plate or null
 */
export function getVehicleLicensePlate(vehicle) {
  if (!vehicle) {
    return null;
  }
  return cleanString(vehicle.license_plate || vehicle.registration_number);
}

/**
 * Sort blocked drivers by most recent block date
 * @param {Array} drivers - Array of blocked driver objects
 * @returns {Array} Sorted array
 */
export function sortBlockedDriversByDate(drivers) {
  return (Array.isArray(drivers) ? drivers : []).sort((a, b) => {
    const dateA = a.blocked_at || a.updated_at || 0;
    const dateB = b.blocked_at || b.updated_at || 0;
    
    if (!dateA && !dateB) return 0;
    if (!dateA) return 1;
    if (!dateB) return -1;
    
    return new Date(dateB) - new Date(dateA);
  });
}

/**
 * Check if a driver is blocked (by ID)
 * @param {Array} blockedDrivers - Array of blocked driver objects
 * @param {string} driverId - Driver ID to check
 * @returns {boolean} True if driver is blocked
 */
export function isDriverBlocked(blockedDrivers, driverId) {
  if (!Array.isArray(blockedDrivers) || !driverId) {
    return false;
  }
  
  const normalizedId = cleanString(driverId);
  return blockedDrivers.some((item) => item.driver_id === normalizedId);
}

/**
 * Get blocked driver by ID
 * @param {Array} blockedDrivers - Array of blocked driver objects
 * @param {string} driverId - Driver ID to find
 * @returns {Object|null} Blocked driver object or null
 */
export function getBlockedDriverById(blockedDrivers, driverId) {
  if (!Array.isArray(blockedDrivers) || !driverId) {
    return null;
  }
  
  const normalizedId = cleanString(driverId);
  return blockedDrivers.find((item) => item.driver_id === normalizedId) || null;
}
