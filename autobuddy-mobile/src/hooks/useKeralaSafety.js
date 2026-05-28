import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';

import {
  addTrustedContact,
  deleteTrustedContact,
  getKeralaEmergencyNumbers,
  getMySafetyScore,
  getSafetyMode,
  listTrustedContacts,
  saveAudioRecordingMetadata,
  sendFamilyLocation,
  triggerSos,
  updateSafetyMode,
} from '../lib/safetyApi';
import { useRideAudioRecording } from './useRideAudioRecording';

const SOS_PHRASES = [
  'sos',
  'help me',
  'emergency',
  '\u0D30\u0D15\u0D4D\u0D37\u0D3F\u0D15\u0D4D\u0D15\u0D42',
  '\u0D38\u0D39\u0D3E\u0D2F\u0D3F\u0D15\u0D4D\u0D15\u0D42',
  '\u0D2A\u0D4B\u0D32\u0D40\u0D38\u0D3F\u0D28\u0D46 \u0D35\u0D3F\u0D33\u0D3F\u0D15\u0D4D\u0D15\u0D42',
  '\u0D06\u0D2A\u0D24\u0D4D\u0D24\u0D3E\u0D23\u0D4D',
  'rakshikku',
  'sahaayikku',
];

const WOMEN_MODE_PHRASES = [
  'women safety mode',
  'enable safety mode',
  '\u0D38\u0D47\u0D2B\u0D4D\u0D31\u0D4D\u0D31\u0D3F \u0D2E\u0D4B\u0D21\u0D4D',
];

function lower(value) {
  return String(value || '').trim().toLowerCase();
}

function speakMalayalam(text) {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.speechSynthesis) {
    try {
      const utterance = new SpeechSynthesisUtterance(String(text || ''));
      utterance.lang = 'ml-IN';
      utterance.rate = 0.95;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch {
      // Best effort voice feedback.
    }
  }
}

async function getCurrentLocation() {
  if (Platform.OS === 'web') {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return null;
    }
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: Number(position.coords.latitude.toFixed(6)),
            longitude: Number(position.coords.longitude.toFixed(6)),
            accuracy: Number(position.coords.accuracy || 0),
          });
        },
        (error) => reject(error),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
      );
    });
  }

  let LocationModule = null;
  try {
    LocationModule = require('expo-location');
  } catch {
    return null;
  }
  const permission = await LocationModule.requestForegroundPermissionsAsync();
  if (permission?.status !== 'granted') {
    return null;
  }
  const loc = await LocationModule.getCurrentPositionAsync({ accuracy: LocationModule.Accuracy.High });
  return {
    latitude: Number(loc.coords.latitude.toFixed(6)),
    longitude: Number(loc.coords.longitude.toFixed(6)),
    accuracy: Number(loc.coords.accuracy || 0),
  };
}

export function useKeralaSafety({ token, userName, activeBooking }) {
  const [mode, setMode] = useState(null);
  const [trustedContacts, setTrustedContacts] = useState([]);
  const [emergencyNumbers, setEmergencyNumbers] = useState({});
  const [safetyScore, setSafetyScore] = useState(null);
  const [lastLocation, setLastLocation] = useState(null);
  const [sosActive, setSosActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [lastSos, setLastSos] = useState(null);

  const trackingTimerRef = useRef(null);
  const audio = useRideAudioRecording();

  const refreshAll = useCallback(async () => {
    if (!token) {
      return;
    }
    const [modeResp, contactsResp, emergencyResp, scoreResp] = await Promise.all([
      getSafetyMode(token).catch(() => null),
      listTrustedContacts(token).catch(() => []),
      getKeralaEmergencyNumbers().catch(() => null),
      getMySafetyScore(token).catch(() => null),
    ]);
    if (modeResp) {
      setMode(modeResp);
    }
    setTrustedContacts(Array.isArray(contactsResp) ? contactsResp : []);
    setEmergencyNumbers((emergencyResp && emergencyResp.numbers) || {});
    setSafetyScore(scoreResp || null);
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      refreshAll().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [refreshAll]);

  const enableWomenSafetyMode = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      const next = {
        enabled: true,
        women_safety_mode: true,
        auto_share_location: true,
        audio_recording_enabled: true,
        malayalam_voice_enabled: true,
        voice_auto_sos_enabled: true,
      };
      const response = await updateSafetyMode(token, next);
      setMode(response?.safety_mode || next);
      setMessage('Women Safety Mode enabled.');
      speakMalayalam('\u0D38\u0D47\u0D2B\u0D4D\u0D31\u0D4D\u0D31\u0D3F \u0D2E\u0D4B\u0D21\u0D4D \u0D2A\u0D4D\u0D30\u0D35\u0D7C\u0D24\u0D4D\u0D24\u0D28\u0D02 \u0D06\u0D30\u0D02\u0D2D\u0D3F\u0D1A\u0D4D\u0D1A\u0D41');
    } catch (err) {
      setError(err.message || 'Could not enable women safety mode');
    } finally {
      setBusy(false);
    }
  }, [token]);

  const addContact = useCallback(
    async ({ name, phone, relation }) => {
      if (!token) return;
      setBusy(true);
      setError('');
      try {
        await addTrustedContact(token, { name, phone, relation });
        const contacts = await listTrustedContacts(token);
        setTrustedContacts(Array.isArray(contacts) ? contacts : []);
        setMessage('Trusted contact added.');
      } catch (err) {
        setError(err.message || 'Could not add trusted contact');
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  const removeContact = useCallback(
    async (contactId) => {
      if (!token) return;
      setBusy(true);
      setError('');
      try {
        await deleteTrustedContact(token, contactId);
        const contacts = await listTrustedContacts(token);
        setTrustedContacts(Array.isArray(contacts) ? contacts : []);
        setMessage('Trusted contact removed.');
      } catch (err) {
        setError(err.message || 'Could not remove trusted contact');
      } finally {
        setBusy(false);
      }
    },
    [token],
  );

  const persistAudioEvidence = useCallback(
    async (audioMeta) => {
      if (!token || !audioMeta || !activeBooking?.id) {
        return null;
      }
      return saveAudioRecordingMetadata(token, {
        booking_id: activeBooking.id,
        file_url: audioMeta.uri || `local-audio://${Date.now()}`,
        duration_seconds: audioMeta.duration_seconds || 0,
        mime_type: audioMeta.mime_type || null,
        size_bytes: audioMeta.size_bytes || null,
        started_at: audioMeta.started_at || null,
        ended_at: audioMeta.ended_at || null,
      }).catch(() => null);
    },
    [activeBooking, token],
  );

  const activateSos = useCallback(
    async (reason = 'Emergency SOS', source = 'manual') => {
      if (!token) return null;
      setBusy(true);
      setError('');
      setMessage('');
      try {
        let audioMeta = null;
        if (mode?.audio_recording_enabled && !audio.recording) {
          await audio.startRecording().catch(() => null);
        }

        const location = await getCurrentLocation().catch(() => null);
        if (location) {
          setLastLocation(location);
        }
        const response = await triggerSos(token, {
          booking_id: activeBooking?.id || null,
          reason,
          source,
          location: location || null,
        });
        setSosActive(true);
        setLastSos(response?.sos || null);

        if (audio.recording) {
          audioMeta = await audio.stopRecording().catch(() => null);
        }
        if (audioMeta) {
          await persistAudioEvidence(audioMeta);
        }

        const police = String(response?.kerala_emergency_numbers?.police || emergencyNumbers.police || '112');
        setMessage(`SOS activated. Emergency number: ${police}`);
        speakMalayalam('\u0D0E\u0D38\u0D4D \u0D12 \u0D0E\u0D38\u0D4D \u0D06\u0D15\u0D4D\u0D1F\u0D3F\u0D35\u0D47\u0D31\u0D4D\u0D31\u0D3E\u0D2F\u0D3F');
        return response;
      } catch (err) {
        setError(err.message || 'Could not activate SOS');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [activeBooking, audio, emergencyNumbers, mode, persistAudioEvidence, token],
  );

  const processVoiceSafetyCommand = useCallback(
    async (spokenText) => {
      const command = lower(spokenText);
      if (!command) return false;
      if (SOS_PHRASES.some((phrase) => command.includes(lower(phrase)))) {
        await activateSos('Malayalam voice emergency trigger', 'voice_malayalam');
        return true;
      }
      if (WOMEN_MODE_PHRASES.some((phrase) => command.includes(lower(phrase)))) {
        await enableWomenSafetyMode();
        return true;
      }
      return false;
    },
    [activateSos, enableWomenSafetyMode],
  );

  const startFamilyTracking = useCallback(() => {
    if (!token || !activeBooking?.id || !mode?.enabled || !mode?.auto_share_location) {
      return;
    }
    if (trackingTimerRef.current) {
      clearInterval(trackingTimerRef.current);
      trackingTimerRef.current = null;
    }
    trackingTimerRef.current = setInterval(async () => {
      const location = await getCurrentLocation().catch(() => null);
      if (!location) return;
      setLastLocation(location);
      await sendFamilyLocation(token, {
        booking_id: activeBooking.id,
        location,
      }).catch(() => null);
    }, 15000);
  }, [activeBooking, mode, token]);

  const stopFamilyTracking = useCallback(() => {
    if (trackingTimerRef.current) {
      clearInterval(trackingTimerRef.current);
      trackingTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (mode?.enabled && activeBooking?.id) {
      startFamilyTracking();
    } else {
      stopFamilyTracking();
    }
    return stopFamilyTracking;
  }, [activeBooking?.id, mode?.enabled, startFamilyTracking, stopFamilyTracking]);

  const callEmergencyNumber = useCallback(
    async (kind) => {
      const number = String(emergencyNumbers?.[kind] || '').trim();
      if (!number) return;
      try {
        await Linking.openURL(`tel:${number}`);
      } catch {
        // Ignore if device/browser cannot open dialer.
      }
    },
    [emergencyNumbers],
  );

  return {
    busy,
    error: error || audio.error,
    message,
    mode,
    trustedContacts,
    emergencyNumbers,
    safetyScore,
    sosActive,
    lastSos,
    lastLocation,
    recording: audio.recording,
    lastRecording: audio.lastRecording,
    refreshAll,
    enableWomenSafetyMode,
    addContact,
    removeContact,
    activateSos,
    processVoiceSafetyCommand,
    startAudioRecording: audio.startRecording,
    stopAudioRecording: async () => {
      const info = await audio.stopRecording();
      if (info) {
        await persistAudioEvidence(info);
      }
      return info;
    },
    startFamilyTracking,
    stopFamilyTracking,
    callEmergencyNumber,
    speakMalayalam: (text) => speakMalayalam(text || `\u0D38\u0D41\u0D30\u0D15\u0D4D\u0D37\u0D3E \u0D05\u0D31\u0D3F\u0D2F\u0D3F\u0D2A\u0D4D\u0D2A\u0D4D. ${userName || ''}`),
  };
}
