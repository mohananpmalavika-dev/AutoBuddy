import AsyncStorage from '@react-native-async-storage/async-storage';

const SESSION_KEY = 'autobuddy_session_v1';
const sessionListeners = new Set();

function notifySessionListeners(session) {
  sessionListeners.forEach((listener) => {
    try {
      listener(session);
    } catch {
      // Session listeners should never break auth persistence.
    }
  });
}

export async function loadSession() {
  const raw = await AsyncStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveSession(session) {
  await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session));
  notifySessionListeners(session);
}

export async function clearSession() {
  await AsyncStorage.removeItem(SESSION_KEY);
  notifySessionListeners(null);
}

export function subscribeSession(listener) {
  sessionListeners.add(listener);
  return () => {
    sessionListeners.delete(listener);
  };
}
