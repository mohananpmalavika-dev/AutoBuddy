import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { API_BASE_URL } from '../lib/api';
import { emitDriverLocation } from './socketClient';

export const DRIVER_BACKGROUND_LOCATION_TASK = 'AUTOBUDDY_DRIVER_BACKGROUND_LOCATION_TASK';

const BG_TRACKING_TOKEN_KEY = 'autobuddy_bg_tracking_token_v1';
const BG_TRACKING_RIDE_ID_KEY = 'autobuddy_bg_tracking_ride_id_v1';
const SESSION_KEY = 'autobuddy_session_v1';

function toNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

async function readAuthToken() {
  const fromTaskState = await AsyncStorage.getItem(BG_TRACKING_TOKEN_KEY);
  if (fromTaskState) {
    return fromTaskState;
  }

  const sessionRaw = await AsyncStorage.getItem(SESSION_KEY);
  if (!sessionRaw) {
    return null;
  }

  try {
    const parsed = JSON.parse(sessionRaw);
    const token = String(parsed?.token || '').trim();
    return token || null;
  } catch {
    return null;
  }
}

async function postDriverLocation(coords) {
  const token = await readAuthToken();
  if (!token) {
    return;
  }
  const latitude = toNumber(coords?.latitude);
  const longitude = toNumber(coords?.longitude);
  if (latitude === null || longitude === null) {
    return;
  }

  const heading = toNumber(coords?.heading);
  const speed = toNumber(coords?.speed);
  const accuracy = toNumber(coords?.accuracy);

  try {
    await fetch(`${API_BASE_URL}/drivers/location`, {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        location: {
          latitude,
          longitude,
          heading,
          speed,
          accuracy,
        },
      }),
    });
  } catch {
    // Background delivery is best-effort; foreground socket/REST updates continue.
  }
}

if (!TaskManager.isTaskDefined(DRIVER_BACKGROUND_LOCATION_TASK)) {
  TaskManager.defineTask(DRIVER_BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
    if (error || Platform.OS === 'web') {
      return;
    }
    const locations = data?.locations;
    if (!Array.isArray(locations) || locations.length === 0) {
      return;
    }
    const latest = locations[0];
    const coords = latest?.coords || {};
    await postDriverLocation(coords);

    // Telemetry/logging: attempt socket emit for background updates
    try {
      const rideId = await AsyncStorage.getItem(BG_TRACKING_RIDE_ID_KEY) || '';
      const latitude = toNumber(coords.latitude);
      const longitude = toNumber(coords.longitude);
      const accuracy = toNumber(coords.accuracy);
      if (latitude !== null && longitude !== null) {
        // emitDriverLocation is resilient if socket isn't connected in background
        emitDriverLocation(rideId || '', latitude, longitude, accuracy);
        await appendBackgroundLog({ type: 'emit', rideId: rideId || null, latitude, longitude, accuracy, ts: Date.now() });
      }
    } catch (e) {
      // ensure background task doesn't crash
      await appendBackgroundLog({ type: 'emit_error', message: String(e), ts: Date.now() });
    }
  });
}

async function appendBackgroundLog(entry) {
  try {
    const key = 'autobuddy_bg_emit_logs_v1';
    const raw = await AsyncStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    arr.push(entry);
    // keep only last 200 entries to limit storage
    if (arr.length > 200) arr.splice(0, arr.length - 200);
    await AsyncStorage.setItem(key, JSON.stringify(arr));
  } catch (err) {
    // swallow
  }
}

export async function startBackgroundDriverTracking({ token, activeRideId }) {
  if (Platform.OS === 'web') {
    return;
  }
  const safeToken = String(token || '').trim();
  if (!safeToken) {
    return;
  }

  await AsyncStorage.setItem(BG_TRACKING_TOKEN_KEY, safeToken);
  await AsyncStorage.setItem(BG_TRACKING_RIDE_ID_KEY, String(activeRideId || ''));

  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(DRIVER_BACKGROUND_LOCATION_TASK);
  if (alreadyStarted) {
    return;
  }

  await Location.startLocationUpdatesAsync(DRIVER_BACKGROUND_LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 5000,
    distanceInterval: 10,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'AutoBuddy live tracking',
      notificationBody: 'Tracking driver location for active ride updates.',
      killServiceOnDestroy: false,
    },
  });
}

export async function stopBackgroundDriverTracking() {
  if (Platform.OS === 'web') {
    return;
  }
  await AsyncStorage.removeItem(BG_TRACKING_RIDE_ID_KEY);
  await AsyncStorage.removeItem(BG_TRACKING_TOKEN_KEY);
  const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(DRIVER_BACKGROUND_LOCATION_TASK);
  if (alreadyStarted) {
    await Location.stopLocationUpdatesAsync(DRIVER_BACKGROUND_LOCATION_TASK);
  }
}
