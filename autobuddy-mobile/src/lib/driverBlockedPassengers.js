import { formatToIST } from '../utils/time';

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

function getPassengerId(item) {
  return cleanString(item?.passenger_id || item?.id);
}

export function normalizeBlockedPassengerRows(payload = {}) {
  const rows = [];
  const seen = new Set();
  const passengerRows = Array.isArray(payload?.passengers) ? payload.passengers : [];
  const passengerIds = Array.isArray(payload?.passenger_ids) ? payload.passenger_ids : [];

  passengerRows.forEach((item) => {
    const passengerId = getPassengerId(item);
    if (!passengerId || seen.has(passengerId)) {
      return;
    }

    seen.add(passengerId);
    rows.push({
      passenger_id: passengerId,
      passenger_name: cleanString(item.passenger_name || item.name) || 'Passenger',
      passenger_phone: cleanString(item.passenger_phone || item.phone),
      blocked_at: item.blocked_at || item.created_at || item.updated_at || null,
      updated_at: item.updated_at || null,
      reason: cleanString(item.reason || item.block_reason) || 'No reason recorded',
      last_booking_id: cleanString(item.last_booking_id || item.booking_id),
      last_booking_status: cleanString(item.last_booking_status || item.status),
      last_ride_at: item.last_ride_at || item.last_booking_at || null,
      pickup_address: cleanString(item.pickup_address || item.from),
      dropoff_address: cleanString(item.dropoff_address || item.drop_address || item.to),
      estimated_fare: item.estimated_fare ?? item.final_fare ?? null,
    });
  });

  passengerIds.forEach((passengerIdValue) => {
    const passengerId = cleanString(passengerIdValue);
    if (!passengerId || seen.has(passengerId)) {
      return;
    }

    seen.add(passengerId);
    rows.push({
      passenger_id: passengerId,
      passenger_name: 'Passenger',
      passenger_phone: null,
      blocked_at: null,
      updated_at: null,
      reason: 'No reason recorded',
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

export function getBlockedPassengerRideSummary(item) {
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

export function formatBlockedPassengerDate(value) {
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

export function filterBlockedPassengers(passengers, query) {
  const normalizedQuery = cleanString(query)?.toLowerCase();
  if (!normalizedQuery) {
    return Array.isArray(passengers) ? passengers : [];
  }

  return (Array.isArray(passengers) ? passengers : []).filter((item) => {
    const haystack = [
      item.passenger_id,
      item.passenger_name,
      item.passenger_phone,
      item.reason,
      item.last_booking_id,
      item.last_booking_status,
      item.pickup_address,
      item.dropoff_address,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}
