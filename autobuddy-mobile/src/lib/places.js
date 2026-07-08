import { Platform } from 'react-native';
import { API_BASE_URL } from './api';
import { getDisplayMessage, getDisplayText } from './displayText';

const BACKEND_PLACES_BASE = `${API_BASE_URL}/places`;

function buildBackendPlacesUrl(path, params) {
  const url = new URL(`${BACKEND_PLACES_BASE}/${path}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

async function fetchBackendPlacesJson(path, params) {
  const response = await fetch(buildBackendPlacesUrl(path, params), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });
  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = raw;
  }

  if (!response.ok) {
    const message =
      getDisplayMessage(payload?.detail, '') ||
      getDisplayText(payload?.message, '') ||
      (typeof payload === 'string' && payload) ||
      `Places request failed (${response.status}).`;
    throw new Error(message);
  }

  return payload;
}

export function isPlacesConfigured() {
  return true;
}

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizePlaceResult(item, fallbackAddress = 'Selected place') {
  if (!item || typeof item !== 'object') {
    return null;
  }

  const latitude = toFiniteNumber(item.latitude ?? item.lat);
  const longitude = toFiniteNumber(item.longitude ?? item.lng ?? item.lon);
  const address = getDisplayText(
    item.address || item.description || item.formatted_address || item.name || item.title,
    fallbackAddress,
  );

  return {
    ...item,
    placeId: item.placeId || item.place_id || item.id || '',
    description: getDisplayText(item.description || item.address || item.name || item.title, address),
    address,
    latitude,
    longitude,
  };
}

function hasCoordinates(location) {
  return Number.isFinite(Number(location?.latitude)) && Number.isFinite(Number(location?.longitude));
}

export async function searchPlaces(query, options = {}) {
  const input = String(query || '').trim();
  if (input.length < 3) {
    return [];
  }

  const results = await fetchBackendPlacesJson('autocomplete', {
    input,
    language: options.language || 'en',
    country_code: options.countryCode,
    latitude: options.latitude,
    longitude: options.longitude,
    radius: options.radius || 50000,
  });
  return Array.isArray(results)
    ? results.map((item) => normalizePlaceResult(item, 'Place')).filter(Boolean)
    : [];
}

export async function getPlaceLocation(placeIdOrSuggestion) {
  const suggestion = normalizePlaceResult(placeIdOrSuggestion, 'Selected place');
  if (hasCoordinates(suggestion)) {
    return {
      ...suggestion,
      latitude: Number(suggestion.latitude),
      longitude: Number(suggestion.longitude),
    };
  }

  const placeId =
    typeof placeIdOrSuggestion === 'string'
      ? placeIdOrSuggestion
      : suggestion?.placeId || placeIdOrSuggestion?.place_id || placeIdOrSuggestion?.id || '';
  const payload = await fetchBackendPlacesJson('details', {
    place_id: placeId,
    language: 'en',
  });
  const location = normalizePlaceResult(payload, 'Selected place');
  if (!hasCoordinates(location)) {
    throw new Error('Could not read coordinates for selected place.');
  }
  return {
    ...location,
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
  };
}

export async function reverseGeocodeLocation(latitude, longitude) {
  const payload = await fetchBackendPlacesJson('reverse-geocode', {
    latitude,
    longitude,
    language: 'en',
  });
  return getDisplayText(payload?.address, '') || null;
}
