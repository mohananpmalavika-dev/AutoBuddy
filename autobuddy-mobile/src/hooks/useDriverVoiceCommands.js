import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

const LANGUAGE_CODES = {
  'en-IN': 'English',
  'ml-IN': 'Malayalam',
};

const TEXT = {
  'en-IN': {
    ready: 'Tap mic and speak a driver command.',
    unsupported: 'Voice commands are not available on this device.',
    listening: 'Listening...',
    processing: 'Processing command...',
    notUnderstood: 'Try: go online, show earnings, call passenger, SOS.',
    executed: 'Command opened.',
  },
  'ml-IN': {
    ready: 'മൈക്ക് അമർത്തി ഡ്രൈവർ കമാൻഡ് പറയുക.',
    unsupported: 'ഈ ഉപകരണത്തിൽ വോയ്സ് കമാൻഡ് ലഭ്യമല്ല.',
    listening: 'കേൾക്കുന്നു...',
    processing: 'കമാൻഡ് പരിശോധിക്കുന്നു...',
    notUnderstood: 'പറയുക: ഓൺലൈൻ, വരുമാനം, യാത്രക്കാരനെ വിളിക്കുക, SOS.',
    executed: 'കമാൻഡ് തുറന്നു.',
  },
};

const COMMANDS = [
  {
    action: { type: 'toggle_offline' },
    feedback: { 'en-IN': 'Paused new ride requests.', 'ml-IN': 'പുതിയ റൈഡ് അഭ്യർത്ഥനകൾ നിർത്തി.' },
    phrases: [
      'go offline',
      'offline',
      'pause requests',
      'stop requests',
      'stop accepting',
      'pause',
      'ഓഫ്‌ലൈൻ',
      'ഓഫ് ലൈൻ',
      'നിർത്തുക',
      'പോസ്',
    ],
  },
  {
    action: { type: 'go_online' },
    feedback: { 'en-IN': 'Opening online ride requests.', 'ml-IN': 'ഓൺലൈൻ റൈഡ് അഭ്യർത്ഥനകൾ തുറക്കുന്നു.' },
    phrases: [
      'go online',
      'online',
      'start driving',
      'start accepting',
      'accept rides',
      'ride requests',
      'ഓൺലൈൻ',
      'ഓണ്‍ലൈന്‍',
      'റൈഡ് സ്വീകരിക്കുക',
      'ട്രിപ്പ് സ്വീകരിക്കുക',
    ],
  },
  {
    action: { type: 'resume_active_ride' },
    feedback: { 'en-IN': 'Active ride controls opened.', 'ml-IN': 'നിലവിലെ റൈഡ് കൺട്രോളുകൾ തുറന്നു.' },
    phrases: ['resume ride', 'active ride', 'current ride', 'open ride', 'നിലവിലെ റൈഡ്', 'റൈഡ് തുറക്കുക'],
  },
  {
    action: { type: 'navigate_active_ride' },
    feedback: { 'en-IN': 'Opening navigation.', 'ml-IN': 'നാവിഗേഷൻ തുറക്കുന്നു.' },
    phrases: ['navigate', 'navigation', 'map', 'directions', 'route', 'മാപ്പ്', 'വഴി', 'നാവിഗേഷൻ'],
  },
  {
    action: { type: 'call_passenger' },
    feedback: { 'en-IN': 'Calling passenger.', 'ml-IN': 'യാത്രക്കാരനെ വിളിക്കുന്നു.' },
    phrases: ['call passenger', 'call customer', 'phone passenger', 'വിളിക്കുക', 'യാത്രക്കാരനെ വിളിക്കുക'],
  },
  {
    action: { type: 'next_ride_status' },
    feedback: { 'en-IN': 'Moving ride to the next step.', 'ml-IN': 'റൈഡ് അടുത്ത ഘട്ടത്തിലേക്ക് മാറ്റുന്നു.' },
    phrases: [
      'mark arrived',
      'start trip',
      'complete trip',
      'next step',
      'next ride step',
      'അറൈവ്',
      'ട്രിപ്പ് തുടങ്ങുക',
      'ട്രിപ്പ് പൂർത്തിയാക്കുക',
      'അടുത്ത ഘട്ടം',
    ],
  },
  {
    action: { type: 'sos' },
    feedback: { 'en-IN': 'Safety card opened.', 'ml-IN': 'സുരക്ഷാ കാർഡ് തുറന്നു.' },
    phrases: ['sos', 'emergency', 'help me', 'safety', 'അടിയന്തര', 'സഹായം', 'സുരക്ഷ'],
  },
  {
    action: { type: 'support_contact' },
    feedback: { 'en-IN': 'Support opened.', 'ml-IN': 'സപ്പോർട്ട് തുറന്നു.' },
    phrases: ['support', 'contact support', 'help desk', 'സപ്പോർട്ട്', 'സഹായകേന്ദ്രം'],
  },
  {
    action: { type: 'withdraw_earnings' },
    feedback: { 'en-IN': 'Earnings opened for withdrawal.', 'ml-IN': 'പിൻവലിക്കാനായി വരുമാനം തുറന്നു.' },
    phrases: ['withdraw', 'cash out', 'payout', 'പണം പിൻവലിക്കുക', 'പേയൗട്ട്'],
  },
  {
    action: { type: 'earnings_report' },
    feedback: { 'en-IN': 'Preparing earnings report.', 'ml-IN': 'വരുമാന റിപ്പോർട്ട് തയ്യാറാക്കുന്നു.' },
    phrases: ['earnings report', 'income report', 'report', 'വരുമാന റിപ്പോർട്ട്', 'റിപ്പോർട്ട്'],
  },
  {
    action: { type: 'tab', tab: 'earnings' },
    feedback: { 'en-IN': 'Earnings opened.', 'ml-IN': 'വരുമാനം തുറന്നു.' },
    phrases: ['earnings', 'income', 'money', 'വരുമാനം', 'പണം'],
  },
  {
    action: { type: 'tab', tab: 'payout' },
    feedback: { 'en-IN': 'Payout schedule opened.', 'ml-IN': 'പേയൗട്ട് ഷെഡ്യൂൾ തുറന്നു.' },
    phrases: ['payout schedule', 'settlement', 'പേയൗട്ട് ഷെഡ്യൂൾ', 'സെറ്റിൽമെന്റ്'],
  },
  {
    action: { type: 'tab', tab: 'paymethods' },
    feedback: { 'en-IN': 'Payment methods opened.', 'ml-IN': 'പേയ്‌മെന്റ് മാർഗങ്ങൾ തുറന്നു.' },
    phrases: ['payment methods', 'bank account', 'upi', 'പേയ്‌മെന്റ്', 'ബാങ്ക്', 'യുപിഐ'],
  },
  {
    action: { type: 'tab', tab: 'targets' },
    feedback: { 'en-IN': 'Targets opened.', 'ml-IN': 'ടാർഗെറ്റുകൾ തുറന്നു.' },
    phrases: ['targets', 'goal', 'daily target', 'ടാർഗറ്റ്', 'ലക്ഷ്യം'],
  },
  {
    action: { type: 'tab', tab: 'requests' },
    feedback: { 'en-IN': 'Ride flow opened.', 'ml-IN': 'റൈഡ് ഫ്ലോ തുറന്നു.' },
    phrases: ['requests', 'ride flow', 'bookings', 'requests tab', 'അഭ്യർത്ഥനകൾ', 'റൈഡുകൾ'],
  },
  {
    action: { type: 'tab', tab: 'upcoming' },
    feedback: { 'en-IN': 'Upcoming rides opened.', 'ml-IN': 'വരാനിരിക്കുന്ന റൈഡുകൾ തുറന്നു.' },
    phrases: ['upcoming', 'scheduled rides', 'schedule', 'വരാനിരിക്കുന്ന', 'ഷെഡ്യൂൾ'],
  },
  {
    action: { type: 'tab', tab: 'profile' },
    feedback: { 'en-IN': 'Profile opened.', 'ml-IN': 'പ്രൊഫൈൽ തുറന്നു.' },
    phrases: ['profile', 'my profile', 'പ്രൊഫൈൽ'],
  },
  {
    action: { type: 'tab', tab: 'documents' },
    feedback: { 'en-IN': 'Documents opened.', 'ml-IN': 'ഡോക്യുമെന്റുകൾ തുറന്നു.' },
    phrases: ['documents', 'document alerts', 'license', 'ഡോക്യുമെന്റ്', 'ലൈസൻസ്'],
  },
  {
    action: { type: 'tab', tab: 'vehicle' },
    feedback: { 'en-IN': 'Vehicle opened.', 'ml-IN': 'വാഹനം തുറന്നു.' },
    phrases: ['vehicle', 'car details', 'auto details', 'വാഹനം'],
  },
  {
    action: { type: 'tab', tab: 'analytics' },
    feedback: { 'en-IN': 'Analytics opened.', 'ml-IN': 'അനലിറ്റിക്സ് തുറന്നു.' },
    phrases: ['analytics', 'stats', 'performance', 'അനലിറ്റിക്സ്', 'പ്രകടനം'],
  },
  {
    action: { type: 'tab', tab: 'reviews' },
    feedback: { 'en-IN': 'Reviews opened.', 'ml-IN': 'റിവ്യൂകൾ തുറന്നു.' },
    phrases: ['reviews', 'ratings', 'rating', 'റിവ്യൂ', 'റേറ്റിംഗ്'],
  },
  {
    action: { type: 'tab', tab: 'history' },
    feedback: { 'en-IN': 'Ride history opened.', 'ml-IN': 'റൈഡ് ചരിത്രം തുറന്നു.' },
    phrases: ['history', 'ride history', 'past rides', 'ചരിത്രം', 'പഴയ റൈഡുകൾ'],
  },
  {
    action: { type: 'tab', tab: 'fare' },
    feedback: { 'en-IN': 'Fare tools opened.', 'ml-IN': 'ഫെയർ ടൂളുകൾ തുറന്നു.' },
    phrases: ['fare', 'fare calculator', 'price', 'ഫെയർ', 'നിരക്ക്'],
  },
  {
    action: { type: 'tab', tab: 'heatmap' },
    feedback: { 'en-IN': 'Demand map opened.', 'ml-IN': 'ഡിമാൻഡ് മാപ്പ് തുറന്നു.' },
    phrases: ['demand map', 'heatmap', 'hotspot', 'ഡിമാൻഡ് മാപ്പ്', 'ഹോട്ട്‌സ്‌പോട്ട്'],
  },
  {
    action: { type: 'tab', tab: 'settings' },
    feedback: { 'en-IN': 'Settings opened.', 'ml-IN': 'സെറ്റിംഗ്സ് തുറന്നു.' },
    phrases: ['settings', 'preferences', 'സെറ്റിംഗ്സ്', 'ക്രമീകരണം'],
  },
];

let NativeVoiceModule = null;
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

function normalizeForMatch(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getText(language) {
  return TEXT[language] || TEXT['en-IN'];
}

function resolveInitialLanguage(initialLanguage) {
  if (initialLanguage && LANGUAGE_CODES[initialLanguage]) {
    return initialLanguage;
  }
  if (typeof window === 'undefined') {
    return 'en-IN';
  }
  const stored = String(window.localStorage?.getItem('driverVoiceLanguage') || '').trim();
  return LANGUAGE_CODES[stored] ? stored : 'en-IN';
}

export function parseDriverVoiceCommand(transcript) {
  const normalized = normalizeForMatch(transcript);
  if (!normalized) {
    return null;
  }
  return (
    COMMANDS.find((command) =>
      command.phrases.some((phrase) => normalized.includes(normalizeForMatch(phrase))),
    ) || null
  );
}

export function useDriverVoiceCommands(callbacks = {}, initialLanguage = 'en-IN') {
  const { onCommand, onFeedback, onError } = callbacks;
  const [voiceState, setVoiceState] = useState('idle');
  const [transcript, setTranscript] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [currentLanguage, setCurrentLanguage] = useState(() => resolveInitialLanguage(initialLanguage));
  const [voiceEngine, setVoiceEngine] = useState(null);
  const recognitionRef = useRef(null);

  const labels = getText(currentLanguage);
  const isListening = voiceState === 'listening';
  const isVoiceAvailable = voiceEngine !== null;

  useEffect(() => {
    let unmounted = false;
    if (Platform.OS === 'web') {
      setVoiceEngine(getSpeechRecognitionCtor() ? 'web' : null);
      return () => {
        unmounted = true;
      };
    }

    if (!NativeVoiceModule) {
      setVoiceEngine(null);
      return () => {
        unmounted = true;
      };
    }

    NativeVoiceModule.isAvailable()
      .then((available) => {
        if (!unmounted) {
          setVoiceEngine(available ? 'native' : null);
        }
      })
      .catch(() => {
        if (!unmounted) {
          setVoiceEngine(null);
        }
      });

    return () => {
      unmounted = true;
    };
  }, []);

  useEffect(
    () => () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // Ignore cleanup stop failures.
        }
      }
      if (NativeVoiceModule) {
        try {
          NativeVoiceModule.destroy().then(() => {
            NativeVoiceModule.removeAllListeners();
          });
        } catch {
          // Ignore native voice cleanup failures.
        }
      }
    },
    [],
  );

  const switchLanguage = useCallback((language) => {
    const nextLanguage = LANGUAGE_CODES[language] ? language : 'en-IN';
    setCurrentLanguage(nextLanguage);
    if (typeof window !== 'undefined') {
      window.localStorage?.setItem('driverVoiceLanguage', nextLanguage);
      window.localStorage?.setItem('driverLanguage', nextLanguage === 'ml-IN' ? 'ml' : 'en');
      window.localStorage?.setItem('autobuddy_lang', nextLanguage === 'ml-IN' ? 'ml' : 'en');
    }
  }, []);

  const processTranscript = useCallback(
    (rawTranscript) => {
      const nextTranscript = String(rawTranscript || '').replace(/\s+/g, ' ').trim();
      setTranscript(nextTranscript);
      setVoiceState('processing');
      const matchedCommand = parseDriverVoiceCommand(nextTranscript);
      if (!matchedCommand) {
        const nextError = labels.notUnderstood;
        setErrorMessage(nextError);
        setVoiceState('error');
        onError?.(nextError);
        return null;
      }
      setErrorMessage('');
      setVoiceState('done');
      const feedback = matchedCommand.feedback?.[currentLanguage] || matchedCommand.feedback?.['en-IN'] || labels.executed;
      onFeedback?.(feedback);
      onCommand?.(matchedCommand.action, {
        transcript: nextTranscript,
        language: currentLanguage,
        feedback,
      });
      return matchedCommand.action;
    },
    [currentLanguage, labels.executed, labels.notUnderstood, onCommand, onError, onFeedback],
  );

  const stopListening = useCallback(() => {
    if (Platform.OS === 'web') {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // Ignore stop failures.
        }
      }
      setVoiceState('idle');
      return;
    }
    if (NativeVoiceModule) {
      NativeVoiceModule.stop().catch(() => NativeVoiceModule.cancel());
    }
    setVoiceState('idle');
  }, []);

  const startListening = useCallback(() => {
    setErrorMessage('');
    setTranscript('');

    if (!isVoiceAvailable) {
      setErrorMessage(labels.unsupported);
      setVoiceState('error');
      onError?.(labels.unsupported);
      return;
    }

    if (Platform.OS === 'web') {
      const SpeechRecognition = getSpeechRecognitionCtor();
      if (!SpeechRecognition) {
        setErrorMessage(labels.unsupported);
        setVoiceState('error');
        onError?.(labels.unsupported);
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = currentLanguage;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;
      recognitionRef.current = recognition;

      recognition.onstart = () => {
        setVoiceState('listening');
        onFeedback?.(labels.listening);
      };
      recognition.onresult = (event) => {
        const results = Array.from(event?.results || []);
        const combined = results
          .map((result) => result?.[0]?.transcript || '')
          .join(' ')
          .trim();
        if (combined) {
          setTranscript(combined);
        }
        const lastResult = results[results.length - 1];
        if (lastResult?.isFinal && combined) {
          processTranscript(combined);
        }
      };
      recognition.onerror = (event) => {
        const nextError = event?.error ? `Voice error: ${event.error}` : labels.unsupported;
        setErrorMessage(nextError);
        setVoiceState('error');
        onError?.(nextError);
      };
      recognition.onend = () => {
        setVoiceState((state) => (state === 'listening' ? 'idle' : state));
      };

      try {
        recognition.start();
      } catch {
        setErrorMessage(labels.unsupported);
        setVoiceState('error');
        onError?.(labels.unsupported);
      }
      return;
    }

    if (!NativeVoiceModule) {
      setErrorMessage(labels.unsupported);
      setVoiceState('error');
      onError?.(labels.unsupported);
      return;
    }

    NativeVoiceModule.onSpeechStart = () => {
      setVoiceState('listening');
      onFeedback?.(labels.listening);
    };
    NativeVoiceModule.onSpeechPartialResults = (event) => {
      const partial = event?.value?.[0] || '';
      if (partial) {
        setTranscript(partial);
      }
    };
    NativeVoiceModule.onSpeechResults = (event) => {
      processTranscript(event?.value?.[0] || '');
    };
    NativeVoiceModule.onSpeechError = (event) => {
      const nextError = event?.error?.message || event?.error?.code || labels.unsupported;
      setErrorMessage(String(nextError));
      setVoiceState('error');
      onError?.(String(nextError));
    };
    NativeVoiceModule.onSpeechEnd = () => {
      setVoiceState((state) => (state === 'listening' ? 'idle' : state));
    };

    NativeVoiceModule.start(currentLanguage).catch(() => {
      setErrorMessage(labels.unsupported);
      setVoiceState('error');
      onError?.(labels.unsupported);
    });
  }, [
    currentLanguage,
    isVoiceAvailable,
    labels.listening,
    labels.unsupported,
    onError,
    onFeedback,
    processTranscript,
  ]);

  const reset = useCallback(() => {
    setTranscript('');
    setErrorMessage('');
    setVoiceState('idle');
  }, []);

  return {
    currentLanguage,
    errorMessage,
    isListening,
    isVoiceAvailable,
    labels,
    processTranscript,
    reset,
    startListening,
    stopListening,
    supportedLanguages: Object.keys(LANGUAGE_CODES),
    switchLanguage,
    transcript,
    voiceEngine,
    voiceState,
  };
}
