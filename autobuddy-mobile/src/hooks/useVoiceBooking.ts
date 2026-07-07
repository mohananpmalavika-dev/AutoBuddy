import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, PermissionsAndroid } from 'react-native';
import { parseIntent, looksLikeBookingIntent } from '../lib/intent/intentParser';
import { apiRequest } from '../lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VoiceBookingIntent {
  intentType: string;
  pickupText: string | null;
  destinationText: string;
  destinationLabel: string;
  rideProductPreference: string | null;
  preferredVehicleHint: string | null;
  raw: string;
  displaySummary: string;
}

export type VoiceState = 'idle' | 'listening' | 'processing' | 'confirming' | 'booking' | 'done' | 'error';

export type VoiceEngine = 'web' | 'native' | null;

export type VoiceLanguage = 'en-IN' | 'hi-IN' | 'ml-IN';

export interface VoiceBookingCallbacks {
  onIntentParsed?: (intent: VoiceBookingIntent) => void;
  onBookingComplete?: (result: any) => void;
  onError?: (error: string) => void;
  onStateChange?: (state: VoiceState) => void;
}

// ---------------------------------------------------------------------------
// Web speech recognition type declaration
// ---------------------------------------------------------------------------
declare global {
  interface Window {
    SpeechRecognition?: any;
    webkitSpeechRecognition?: any;
  }
}

// ---------------------------------------------------------------------------
// Native voice module (lazy-loaded)
// ---------------------------------------------------------------------------
let NativeVoiceModule: any = null;
if (Platform.OS !== 'web') {
  try {
    NativeVoiceModule = require('@react-native-voice/voice').default;
  } catch {
    NativeVoiceModule = null;
  }
}

function getSpeechRecognitionCtor() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return null;
  }
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

// ---------------------------------------------------------------------------
// Language Support Mapping
// ---------------------------------------------------------------------------
const LANGUAGE_CODES: Record<VoiceLanguage, string> = {
  'en-IN': 'English (India)',
  'hi-IN': 'हिंदी (Hindi)',
  'ml-IN': 'മലയാളം (Malayalam)',
};

const LANGUAGE_HINTS: Record<VoiceLanguage, string[]> = {
  'en-IN': ['book', 'ride', 'auto', 'cab', 'taxi', 'to', 'airport', 'station'],
  'hi-IN': ['बुक', 'राइड', 'ऑटो', 'कैब', 'टैक्सी', 'तक', 'एयरपोर्ट', 'स्टेशन'],
  'ml-IN': ['ബുക്ക്', 'റൈഡ്', 'ഓട്ടോ', 'ക്യാബ്', 'ടാക്സി', 'വരെ', 'എയർപോർട്ട്', 'സ്റ്റേഷൻ'],
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const DEFAULT_LANG: VoiceLanguage = 'en-IN';

function getVoiceBookingHelpMessage(language: VoiceLanguage): string {
  if (language === 'ml-IN') {
    return "ബുക്കിംഗ് അഭ്യർത്ഥന മനസ്സിലായില്ല. 'കൊല്ലം റെയിൽവേ സ്റ്റേഷനിലേക്ക് ഓട്ടോ ബുക്ക് ചെയ്യുക' പോലെ പറയുക.";
  }
  if (language === 'hi-IN') {
    return "मुझे बुकिंग अनुरोध समझ नहीं आया। कुछ ऐसा कहें: 'कोल्लम रेलवे स्टेशन के लिए ऑटो बुक करें'।";
  }
  return "I didn't catch a booking request. Try saying something like 'Book an auto to Kollam railway station'.";
}

export function useVoiceBooking(callbacks: VoiceBookingCallbacks = {}, initialLanguage: VoiceLanguage = DEFAULT_LANG) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [lastIntent, setLastIntent] = useState<VoiceBookingIntent | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [voiceEngine, setVoiceEngine] = useState<VoiceEngine>(null);
  const [isNativeAvailable, setIsNativeAvailable] = useState(false);
  const [currentLanguage, setCurrentLanguage] = useState<VoiceLanguage>(initialLanguage);

  const recognitionRef = useRef<any>(null);
  const partialTranscriptRef = useRef('');
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Track whether we're in the middle of a listening session
  const listeningRef = useRef(false);
  // BUG-010 FIX: Track whether we're in the middle of booking to prevent race condition
  const bookingInProgressRef = useRef(false);

  // -----------------------------------------------------------------------
  // Check native voice availability
  // -----------------------------------------------------------------------
  useEffect(() => {
    let unmounted = false;

    const webCtor = getSpeechRecognitionCtor();
    if (Platform.OS === 'web' && webCtor) {
      if (!unmounted) {setVoiceEngine('web');}
      return;
    }

    if (Platform.OS !== 'web' && NativeVoiceModule) {
      NativeVoiceModule.isAvailable()
        .then((available: boolean) => {
          if (!unmounted) {
            setIsNativeAvailable(Boolean(available));
            setVoiceEngine(Boolean(available) ? 'native' : null);
          }
        })
        .catch(() => {
          if (!unmounted) {
            setIsNativeAvailable(false);
            setVoiceEngine(null);
          }
        });
    }

    return () => {
      unmounted = true;
    };
  }, []);

  // -----------------------------------------------------------------------
  // Cleanup on unmount
  // -----------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch { /* ignore */ }
      }
      if (NativeVoiceModule) {
        try {
          NativeVoiceModule.destroy().then(() => {
            NativeVoiceModule.removeAllListeners();
          });
        } catch { /* ignore */ }
      }
    };
  }, []);

  // -----------------------------------------------------------------------
  // State helper
  // -----------------------------------------------------------------------
  const updateState = useCallback((next: VoiceState) => {
    setVoiceState(next);
    callbacksRef.current.onStateChange?.(next);
  }, []);

  // -----------------------------------------------------------------------
  // Request audio permission (Android)
  // -----------------------------------------------------------------------
  const requestAudioPermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {return true;}
    try {
      const result = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
      );
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  }, []);

  // -----------------------------------------------------------------------
  // Switch language (en-IN, hi-IN, ml-IN)
  // -----------------------------------------------------------------------
  const switchLanguage = useCallback((lang: VoiceLanguage) => {
    setCurrentLanguage(lang);
  }, []);

  // -----------------------------------------------------------------------
  // Process transcript into intent (language-aware)
  // -----------------------------------------------------------------------
  const processTranscript = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {return;}

    setTranscript(trimmed);

    // Check if it looks like a booking intent (language-aware)
    if (!looksLikeBookingIntent(trimmed)) {
      const errorMsgs: Record<VoiceLanguage, string> = {
        'en-IN': "I didn't catch a booking request. Try saying something like 'Book an auto to Kollam railway station'.",
        'hi-IN': "मुझे बुकिंग रिक्वेस्ट नहीं समझ आई। 'कोल्लम रेलवे स्टेशन के लिए ऑटो बुक करें' जैसा कुछ कहने की कोशिश करें।",
        'ml-IN': "ഞാൻ ബുകിംഗ് അഭ്യർത്ഥന മനസ്സിലാക്കിയില്ല. 'കൊല്ലം റെയിൽവേ സ്റ്റേഷനിലേക്ക് ഓട്ടോ ബുക്ക് ചെയ്യുക' പോലത്തെ എന്തെങ്കിലും പറയാൻ ശ്രമിക്കുക.",
      };
      setErrorMessage(getVoiceBookingHelpMessage(currentLanguage));
      updateState('error');
      return;
    }

    // Parse the intent (language-aware)
    updateState('processing');
    const rawIntent = parseIntent(trimmed);
    const intent: VoiceBookingIntent = {
      ...rawIntent,
      rideProductPreference: rawIntent.rideProductPreference ?? null,
      preferredVehicleHint: rawIntent.preferredVehicleHint ?? null,
    };
    setLastIntent(intent);

    // Notify caller
    callbacksRef.current.onIntentParsed?.(intent);

    // Move to confirmation state
    updateState('confirming');
  }, [updateState, currentLanguage]);

  // -----------------------------------------------------------------------
  // Web speech recognition
  // -----------------------------------------------------------------------
  const startWebListening = useCallback(() => {
    const ctor = getSpeechRecognitionCtor();
    if (!ctor) {
      setErrorMessage('Voice input is not supported in this browser.');
      updateState('error');
      return;
    }

    setErrorMessage('');
    partialTranscriptRef.current = '';

    const recognition = new ctor();
    recognitionRef.current = recognition;
    recognition.lang = currentLanguage;  // Use selected language
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const results: any[] = Array.from(event.results || []);
      const latest: any = results[results.length - 1];
      if (latest && latest[0]) {
        partialTranscriptRef.current = String(latest[0].transcript || '');
        setTranscript(partialTranscriptRef.current);
      }
    };

    recognition.onerror = (event: any) => {
      const code = String(event?.error || '');
      if (code !== 'no-speech' && code !== 'aborted') {
        setErrorMessage(`Voice error: ${code}`);
        updateState('error');
      } else if (code === 'no-speech') {
        // No speech detected — reset to idle
        updateState('idle');
        setTranscript('');
      }
      listeningRef.current = false;
    };

    recognition.onend = () => {
      listeningRef.current = false;
      // Process whatever transcript we got
      if (partialTranscriptRef.current.trim()) {
        processTranscript(partialTranscriptRef.current);
      } else {
        updateState('idle');
      }
    };

    try {
      listeningRef.current = true;
      recognition.start();
      updateState('listening');
    } catch {
      listeningRef.current = false;
      setErrorMessage('Voice input is unavailable right now.');
      updateState('error');
    }
  }, [updateState, processTranscript, currentLanguage]);

  // -----------------------------------------------------------------------
  // Native speech recognition (Android/iOS via @react-native-voice/voice)
  // -----------------------------------------------------------------------
  const startNativeListening = useCallback(async () => {
    if (!NativeVoiceModule || !isNativeAvailable) {
      setErrorMessage('Voice input is not available on this device.');
      updateState('error');
      return;
    }

    const hasPermission = await requestAudioPermission();
    if (!hasPermission) {
      setErrorMessage('Microphone permission is required for voice booking.');
      updateState('error');
      return;
    }

    setErrorMessage('');
    partialTranscriptRef.current = '';

    // Set up listeners
    NativeVoiceModule.onSpeechPartialResults = (event: any) => {
      const text = Array.isArray(event?.value) ? event.value[0] : '';
      if (text) {
        partialTranscriptRef.current = text;
        setTranscript(text);
      }
    };

    NativeVoiceModule.onSpeechResults = (event: any) => {
      const text = Array.isArray(event?.value) ? event.value[0] : '';
      if (text) {
        partialTranscriptRef.current = text;
        setTranscript(text);
      }
    };

    NativeVoiceModule.onSpeechError = (event: any) => {
      const errorCode = String(event?.error?.message || event?.error || '').trim();
      if (errorCode && errorCode !== '7' && errorCode !== '6') {
        setErrorMessage(`Voice error: ${errorCode}`);
        updateState('error');
      }
      listeningRef.current = false;
    };

    NativeVoiceModule.onSpeechEnd = () => {
      listeningRef.current = false;
      if (partialTranscriptRef.current.trim()) {
        processTranscript(partialTranscriptRef.current);
      } else {
        updateState('idle');
      }
    };

    try {
      listeningRef.current = true;
      await NativeVoiceModule.start(currentLanguage);  // Use selected language
      updateState('listening');
    } catch {
      listeningRef.current = false;
      setErrorMessage('Could not start voice input.');
      updateState('error');
    }
  }, [isNativeAvailable, requestAudioPermission, updateState, processTranscript, currentLanguage]);

  // -----------------------------------------------------------------------
  // Start listening
  // -----------------------------------------------------------------------
  const startListening = useCallback(() => {
    if (listeningRef.current) {return;}

    if (Platform.OS === 'web') {
      startWebListening();
    } else {
      startNativeListening();
    }
  }, [startWebListening, startNativeListening]);

  // -----------------------------------------------------------------------
  // Stop listening
  // -----------------------------------------------------------------------
  const stopListening = useCallback(() => {
    if (Platform.OS === 'web') {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch { /* ignore */ }
      }
    } else if (NativeVoiceModule) {
      NativeVoiceModule.stop().catch(() => NativeVoiceModule.cancel());
    }
    listeningRef.current = false;
  }, []);

  // -----------------------------------------------------------------------
  // Confirm booking — calls the backend booking API with parsed intent
  // BUG-010 FIX: Add race condition protection
  // -----------------------------------------------------------------------
  const confirmAndBook = useCallback(async (token?: string) => {
    if (!lastIntent) {return;}

    // BUG-010 FIX: Prevent duplicate bookings from multiple clicks/calls
    if (bookingInProgressRef.current) {
      console.log('[VoiceBooking] Booking already in progress, ignoring duplicate call');
      return null;
    }

    bookingInProgressRef.current = true;
    updateState('booking');

    try {
      const pickupHint = lastIntent.pickupText || undefined;
      const result = await apiRequest('/bookings/voice', {
        method: 'POST',
        token,
        body: {
          raw_utterance: lastIntent.raw,
          destination_text: lastIntent.destinationText,
          pickup_text: pickupHint,
          preferred_vehicle_hint: lastIntent.preferredVehicleHint,
          preferred_ride_product: lastIntent.rideProductPreference,
          intent_type: lastIntent.intentType,
          language_detected: currentLanguage,
        },
      });

      updateState('done');
      callbacksRef.current.onBookingComplete?.(result);
      return result;
    } catch (err: any) {
      const msg = err?.message || 'Booking failed. Please try again.';
      setErrorMessage(msg);
      updateState('error');
      callbacksRef.current.onError?.(msg);
      return null;
    } finally {
      // BUG-010 FIX: Always clear the booking flag
      bookingInProgressRef.current = false;
    }
  }, [lastIntent, updateState, currentLanguage]);

  // -----------------------------------------------------------------------
  // Retry / reset
  // -----------------------------------------------------------------------
  const reset = useCallback(() => {
    stopListening();
    setVoiceState('idle');
    setTranscript('');
    setLastIntent(null);
    setErrorMessage('');
    partialTranscriptRef.current = '';
  }, [stopListening]);

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------
  return {
    voiceState,
    transcript,
    lastIntent,
    errorMessage,
    voiceEngine,
    isVoiceAvailable: voiceEngine !== null,
    currentLanguage,
    supportedLanguages: Object.keys(LANGUAGE_CODES) as VoiceLanguage[],

    startListening,
    stopListening,
    confirmAndBook,
    reset,
    switchLanguage,
  };
}
