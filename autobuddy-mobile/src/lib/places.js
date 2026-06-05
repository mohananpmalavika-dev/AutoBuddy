import { Platform } from 'react-native';
import { API_BASE_URL } from './api';
import { getDisplayMessage, getDisplayText } from './displayText';

const GOOGLE_MAPS_API_BASE = 'https://maps.googleapis.com/maps/api';
const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const SHOULD_PROXY_PLACES = Platform.OS === 'web';
const BACKEND_PLACES_BASE = `${API_BASE_URL}/places`;

function buildUrl(path, params) {
  const query = new URLSearchParams({
    ...params,
    key: GOOGLE_MAPS_API_KEY || '',
  });
  return `${GOOGLE_MAPS_API_BASE}/${path}?${query.toString()}`;
}

async function fetchGoogleJson(path, params, allowZeroResults = false) {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error('Google Maps key missing. Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY.');
  }

  const response = await fetch(buildUrl(path, params));
  const payload = await response.json();
  const status = payload?.status;

  if (status === 'OK') {
    return payload;
  }

  if (allowZeroResults && status === 'ZERO_RESULTS') {
    return payload;
  }

  const message = payload?.error_message || `Google Places request failed (${status || 'unknown'}).`;
  throw new Error(message);
}

export function isPlacesConfigured() {
  return SHOULD_PROXY_PLACES ? true : Boolean(GOOGLE_MAPS_API_KEY);
}

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

export async function searchPlaces(query, options = {}) {
  const input = String(query || '').trim();
  if (input.length < 3) {
    return [];
  }

  const params = {
    input,
    language: options.language || 'en',
  };

  if (options.countryCode) {
    params.components = `country:${options.countryCode}`;
  }

  if (typeof options.latitude === 'number' && typeof options.longitude === 'number') {
    params.location = `${options.latitude},${options.longitude}`;
    params.radius = String(options.radius || 50000);
  }

  if (SHOULD_PROXY_PLACES) {
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

  const payload = await fetchGoogleJson('place/autocomplete/json', params, true);
  const predictions = Array.isArray(payload?.predictions) ? payload.predictions : [];
  return predictions.map((item) => ({
    placeId: item.place_id,
    description: getDisplayText(item.description, 'Place'),
  }));
}

export async function getPlaceLocation(placeId) {
  if (SHOULD_PROXY_PLACES) {
    const payload = await fetchBackendPlacesJson('details', {
      place_id: placeId,
      language: 'en',
    });
    return {
      ...payload,
      address: getDisplayText(payload?.address || payload?.description || payload?.name, 'Selected place'),
    };
  }

  const payload = await fetchGoogleJson('place/details/json', {
    place_id: placeId,
    fields: 'formatted_address,geometry,name',
    language: 'en',
  });

  const result = payload?.result || {};
  const lat = result?.geometry?.location?.lat;
  const lng = result?.geometry?.location?.lng;

  if (typeof lat !== 'number' || typeof lng !== 'number') {
    throw new Error('Could not read coordinates for selected place.');
  }

  return {
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lng.toFixed(6)),
    address: getDisplayText(result.formatted_address || result.name, `Lat ${lat}, Lng ${lng}`),
  };
}

export async function reverseGeocodeLocation(latitude, longitude) {
  if (SHOULD_PROXY_PLACES) {
    const payload = await fetchBackendPlacesJson('reverse-geocode', {
      latitude,
      longitude,
      language: 'en',
    });
    return getDisplayText(payload?.address, '') || null;
  }

  const payload = await fetchGoogleJson(
    'geocode/json',
    {
      latlng: `${latitude},${longitude}`,
      language: 'en',
    },
    true,
  );

  const first = Array.isArray(payload?.results) ? payload.results[0] : null;
  return getDisplayText(first?.formatted_address, '') || null;
}
