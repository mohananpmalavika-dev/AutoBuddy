const LIVE_LOCATION_STATUS_WINDOW_MS = 90000;

const TRUE_STATUS_VALUES = new Set([
  '1',
  'true',
  'yes',
  'y',
  'on',
  'online',
  'available',
  'active',
  'ready',
  'live',
]);

const FALSE_STATUS_VALUES = new Set([
  '0',
  'false',
  'no',
  'n',
  'off',
  'offline',
  'unavailable',
  'inactive',
  'disabled',
]);

const BOOLEAN_SIGNAL_KEYS = [
  'is_available',
  'isAvailable',
  'available',
  'is_online',
  'isOnline',
  'online',
  'presence_online',
  'presenceOnline',
  'location_online',
  'locationOnline',
  'is_live',
  'isLive',
  'live',
  'driver_online',
  'driverOnline',
];

const STATUS_SIGNAL_KEYS = [
  'availability_status',
  'availabilityStatus',
  'availability',
  'online_status',
  'onlineStatus',
  'presence_status',
  'presenceStatus',
  'connection_state',
  'connectionState',
  'status',
  'state',
];

const LOCATION_SIGNAL_KEYS = [
  'current_location',
  'currentLocation',
  'location',
  'driver_location',
  'driverLocation',
  'live_location',
  'liveLocation',
];

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStatusSignal(value) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value !== 0;
  }
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!normalized) {
    return null;
  }
  if (TRUE_STATUS_VALUES.has(normalized)) {
    return true;
  }
  if (FALSE_STATUS_VALUES.has(normalized)) {
    return false;
  }
  return null;
}

function compactUniqueRecords(records) {
  const seen = new Set();
  return records.filter((record) => {
    if (!isRecord(record) || seen.has(record)) {
      return false;
    }
    seen.add(record);
    return true;
  });
}

function getAvailabilityCandidates(payload) {
  if (!isRecord(payload)) {
    return [];
  }

  return compactUniqueRecords([
    payload,
    payload.data,
    payload.result,
    payload.availability,
    payload.status,
    payload.state,
    payload.driver,
    payload.profile,
    payload.user,
    payload.data?.availability,
    payload.data?.status,
    payload.data?.state,
    payload.data?.driver,
    payload.data?.profile,
    payload.driver?.availability,
    payload.driver?.status,
    payload.profile?.availability,
    payload.profile?.status,
  ]);
}

export function hasLiveLocationSignal(location) {
  if (!isRecord(location)) {
    return false;
  }

  const explicitLive = [
    location.is_live_location,
    location.isLiveLocation,
    location.location_online,
    location.locationOnline,
    location.is_live,
    location.isLive,
    location.live,
  ]
    .map(normalizeStatusSignal)
    .some((value) => value === true);
  if (explicitLive) {
    return true;
  }

  const address = String(location.address || location.label || '').trim().toLowerCase();
  if (address === 'live location') {
    return true;
  }

  const latitude = Number(location.latitude ?? location.lat);
  const longitude = Number(location.longitude ?? location.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return false;
  }

  const updatedAt = Date.parse(
    location.updated_at ||
      location.updatedAt ||
      location.timestamp ||
      location.last_location_at ||
      location.lastLocationAt ||
      location.captured_at ||
      location.capturedAt ||
      '',
  );
  return Number.isFinite(updatedAt) && Date.now() - updatedAt <= LIVE_LOCATION_STATUS_WINDOW_MS;
}

export function toDriverLocationApiBody(location) {
  if (!isRecord(location)) {
    return null;
  }

  const latitude = Number(location.latitude ?? location.lat);
  const longitude = Number(location.longitude ?? location.lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  const bodyLocation = {
    latitude,
    longitude,
  };
  const address = String(location.address || location.label || '').trim();
  if (address) {
    bodyLocation.address = address;
  }

  return { location: bodyLocation };
}

function collectAvailabilitySignals(payload) {
  const candidates = getAvailabilityCandidates(payload);
  const signals = [];

  candidates.forEach((candidate) => {
    BOOLEAN_SIGNAL_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(candidate, key)) {
        const signal = normalizeStatusSignal(candidate[key]);
        if (signal !== null) {
          signals.push(signal);
        }
      }
    });

    STATUS_SIGNAL_KEYS.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(candidate, key)) {
        const signal = normalizeStatusSignal(candidate[key]);
        if (signal !== null) {
          signals.push(signal);
        }
      }
    });

    LOCATION_SIGNAL_KEYS.forEach((key) => {
      if (hasLiveLocationSignal(candidate[key])) {
        signals.push(true);
      }
    });
  });

  return signals;
}

export function readDriverAvailability(payload, fallback = false) {
  const signals = collectAvailabilitySignals(payload);

  if (signals.some((signal) => signal === true)) {
    return true;
  }
  if (signals.some((signal) => signal === false)) {
    return false;
  }
  return !!fallback;
}

export function hasDriverAvailabilitySnapshot(payload) {
  return collectAvailabilitySignals(payload).length > 0;
}

export function buildDriverAvailabilityState({
  serverIsOnline = false,
  localIsOnline = false,
  activeRideId = null,
  driverLocation = null,
  availabilityPendingDesired = null,
  availabilitySyncPending = false,
  availabilityToggleInFlight = false,
} = {}) {
  const syncing = !!availabilitySyncPending || !!availabilityToggleInFlight;
  const confirmedIsOnline =
    !!serverIsOnline ||
    !!localIsOnline ||
    !!String(activeRideId || '').trim() ||
    hasLiveLocationSignal(driverLocation);
  const desiredIsOnline =
    availabilityPendingDesired == null ? confirmedIsOnline : !!availabilityPendingDesired;
  const labelIsOnline = syncing ? desiredIsOnline : confirmedIsOnline;
  const status = syncing
    ? labelIsOnline
      ? 'going_online'
      : 'going_offline'
    : confirmedIsOnline
      ? 'online'
      : 'offline';

  return {
    isOnline: confirmedIsOnline,
    desiredIsOnline,
    label: syncing
      ? labelIsOnline
        ? 'GOING ONLINE...'
        : 'GOING OFFLINE...'
      : confirmedIsOnline
        ? 'ONLINE & READY'
        : 'OFFLINE',
    status,
    syncing,
    tone: syncing ? 'syncing' : confirmedIsOnline ? 'online' : 'offline',
  };
}
