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
    ? results.map((item) => ({
        ...item,
        placeId: item.placeId || item.place_id,
        description: getDisplayText(item.description || item.name || item.title, 'Place'),
      }))
    : [];
}

export async function getPlaceLocation(placeId) {
  const payload = await fetchBackendPlacesJson('details', {
    place_id: placeId,
    language: 'en',
  });
  return {
    ...payload,
    address: getDisplayText(payload?.address || payload?.description || payload?.name, 'Selected place'),
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
