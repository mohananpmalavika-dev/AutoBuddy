export const DRIVER_STATUS_FLOW = ['accepted', 'driver_arrived', 'in_progress', 'completed'];

export const LIVE_LOCATION_RIDE_STATUSES = new Set(['accepted', 'driver_arrived', 'in_progress']);

export const DRIVER_RIDE_SOCKET_EVENTS = ['new_booking_available', 'booking_status_changed'];

export function normalizeRideStatus(status) {
  return String(status || '').trim().toLowerCase();
}

export function getRideStatusMode(status) {
  const normalizedStatus = normalizeRideStatus(status);
  const navigatingToPickup = normalizedStatus === 'accepted' || normalizedStatus === 'driver_arrived';
  const navigatingToDrop = normalizedStatus === 'in_progress';

  return {
    navigatingToPickup,
    navigatingToDrop,
    showStageRoute: navigatingToPickup || navigatingToDrop,
    sharesLocation: LIVE_LOCATION_RIDE_STATUSES.has(normalizedStatus),
  };
}

export function getNextRideStatus(status) {
  const currentIndex = DRIVER_STATUS_FLOW.indexOf(normalizeRideStatus(status));
  if (currentIndex < 0 || currentIndex >= DRIVER_STATUS_FLOW.length - 1) {
    return null;
  }
  return DRIVER_STATUS_FLOW[currentIndex + 1];
}

export function getNextActionLabel(status) {
  const labels = {
    accepted: 'Mark Arrived',
    driver_arrived: 'Start Trip',
    in_progress: 'Complete Trip',
  };
  return labels[normalizeRideStatus(status)] || null;
}

export function canCancelRide(status) {
  const normalizedStatus = normalizeRideStatus(status);
  return !['completed', 'cancelled', 'rejected'].includes(normalizedStatus);
}

export function getRidePickupLocation(ride, normalizeLocation) {
  if (!ride || typeof normalizeLocation !== 'function') {
    return null;
  }
  return normalizeLocation(ride.pickup_location || ride.pickup || ride.pickup_location_details);
}

export function getRideDropLocation(ride, normalizeLocation) {
  if (!ride || typeof normalizeLocation !== 'function') {
    return null;
  }
  return normalizeLocation(
    ride.drop_location ||
      ride.dropoff_location ||
      ride.dropoff ||
      ride.drop_location_details ||
      ride.dropoff_location_details,
  );
}

export function getRideNavigationTarget({ ride, status, normalizeLocation }) {
  const pickup = getRidePickupLocation(ride, normalizeLocation);
  const drop = getRideDropLocation(ride, normalizeLocation);
  const { navigatingToDrop } = getRideStatusMode(status || ride?.status);
  const destination = navigatingToDrop ? (drop || pickup) : (pickup || drop);

  return {
    pickup,
    drop,
    destination,
  };
}

export function buildOpenStreetMapDirectionsUrl({ origin, destination }) {
  if (!destination) {
    return '';
  }
  const destStr = `${destination.latitude},${destination.longitude}`;
  if (!origin) {
    return `https://www.openstreetmap.org/?mlat=${destination.latitude}&mlon=${destination.longitude}`;
  }
  return `https://www.openstreetmap.org/directions?from=${origin.latitude},${origin.longitude}&to=${destStr}`;
}

export function runDriverQuickAction(action, handlers = {}) {
  if (!action || typeof action !== 'object') {
    return;
  }

  if (action.type === 'go_online') {
    if (handlers.isOnline) {
      handlers.openRequests?.();
      handlers.setMessage?.('You are already online and ready for ride requests.');
      return;
    }
    handlers.goOnline?.();
    return;
  }

  if (action.type === 'resume_active_ride') {
    if (!handlers.hasActiveRide) {
      handlers.setError?.('No active ride to resume.');
      return;
    }
    handlers.resumeActiveRide?.();
    return;
  }

  if (action.type === 'navigate_active_ride') {
    if (!handlers.hasActiveRide) {
      handlers.setError?.('No active ride to navigate.');
      return;
    }
    handlers.navigateActiveRide?.();
    return;
  }

  if (action.type === 'call_passenger') {
    if (!handlers.hasActiveRide) {
      handlers.setError?.('No active ride passenger to call.');
      return;
    }
    handlers.callPassenger?.();
    return;
  }

  if (action.type === 'sos') {
    handlers.activateSos?.();
    return;
  }

  if (action.type === 'support_contact') {
    handlers.contactSupport?.();
    return;
  }

  if (action.type === 'withdraw_earnings') {
    handlers.withdrawEarnings?.();
    return;
  }

  if (action.type === 'earnings_report') {
    handlers.earningsReport?.();
    return;
  }

  if (action.type === 'tab' && action.tab) {
    handlers.openTab?.(action.tab);
  }
}
