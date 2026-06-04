const DEFAULT_POSITION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 60000,
};

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

export function isWebGeolocationAvailable() {
  return typeof navigator !== 'undefined' && Boolean(navigator.geolocation);
}

export function isSecureGeolocationContext() {
  if (typeof window === 'undefined') {
    return true;
  }
  if (window.isSecureContext) {
    return true;
  }
  return LOCAL_HOSTS.has(window.location?.hostname || '');
}

export async function getWebGeolocationPermissionState() {
  if (!isWebGeolocationAvailable()) {
    return 'unsupported';
  }
  if (!navigator.permissions?.query) {
    return 'prompt';
  }

  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status?.state || 'prompt';
  } catch {
    return 'prompt';
  }
}

export function formatWebGeolocationError(error, fallback = 'Could not fetch current location.') {
  if (!isWebGeolocationAvailable()) {
    return 'Current location is not supported in this browser or webview.';
  }
  if (!isSecureGeolocationContext()) {
    return 'Location permission requires HTTPS. Open AutoBuddy using https:// and allow Location.';
  }

  const code = Number(error?.code);
  if (code === 1) {
    return 'Location permission denied. Enable Location for AutoBuddy in browser settings.';
  }
  if (code === 2) {
    return 'Current location is unavailable. Check GPS/location services and try again.';
  }
  if (code === 3) {
    return 'Location request timed out. Move to better network/GPS coverage and try again.';
  }

  return error?.message || fallback;
}

export async function requestWebCurrentPosition(options = {}) {
  if (!isWebGeolocationAvailable()) {
    const error = new Error('Current location is not supported in this browser or webview.');
    error.code = 'UNSUPPORTED_GEOLOCATION';
    throw error;
  }
  if (!isSecureGeolocationContext()) {
    const error = new Error('Location permission requires HTTPS.');
    error.code = 'INSECURE_GEOLOCATION_CONTEXT';
    throw error;
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      ...DEFAULT_POSITION_OPTIONS,
      ...options,
    });
  });
}
