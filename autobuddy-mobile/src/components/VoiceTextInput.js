import React, { useEffect, useRef, useState } from 'react';
import { PermissionsAndroid, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const DEFAULT_LANG = 'en-IN';
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

export default function VoiceTextInput({
  value,
  onChangeText,
  style,
  containerStyle,
  voiceLang = DEFAULT_LANG,
  enableVoice = true,
  ...textInputProps
}) {
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [nativeVoiceAvailable, setNativeVoiceAvailable] = useState(false);
  const recognitionRef = useRef(null);
  const baseValueRef = useRef('');
  const speechRecognitionCtor = getSpeechRecognitionCtor();
  const canUseWebVoice = Boolean(speechRecognitionCtor);
  const canUseNativeVoice = Boolean(Platform.OS !== 'web' && NativeVoiceModule && nativeVoiceAvailable);
  const canUseVoice = Boolean(enableVoice && (canUseWebVoice || canUseNativeVoice));

  useEffect(() => {
    let unmounted = false;
    async function checkNativeVoiceAvailability() {
      if (Platform.OS === 'web' || !NativeVoiceModule) {
        setNativeVoiceAvailable(false);
        return;
      }
      try {
        const available = await NativeVoiceModule.isAvailable();
        if (!unmounted) {
          setNativeVoiceAvailable(Boolean(available));
        }
      } catch {
        if (!unmounted) {
          setNativeVoiceAvailable(false);
        }
      }
    }
    checkNativeVoiceAvailability();
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
          // Ignore stop failures while unmounting.
        }
      }
      if (NativeVoiceModule) {
        try {
          NativeVoiceModule.destroy().then(() => {
            NativeVoiceModule.removeAllListeners();
          });
        } catch {
          // Ignore native cleanup failures.
        }
      }
    },
    [],
  );

  const normalizeTranscriptOutput = (rawTranscript) => {
    const transcript = String(rawTranscript || '').replace(/\s+/g, ' ').trim();
    if (!transcript) {
      return '';
    }
    const base = String(baseValueRef.current || '').trim();
    return base ? `${base} ${transcript}`.replace(/\s+/g, ' ').trim() : transcript;
  };

  const stopListening = () => {
    if (Platform.OS === 'web') {
      if (!recognitionRef.current) {
        setListening(false);
        return;
      }
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop failures.
      } finally {
        setListening(false);
      }
      return;
    }

    if (!NativeVoiceModule) {
      setListening(false);
      return;
    }
    Promise.resolve()
      .then(() => NativeVoiceModule.stop())
      .catch(() => NativeVoiceModule.cancel())
      .finally(() => {
        setListening(false);
      });
  };

  const requestAudioPermission = async () => {
    if (Platform.OS !== 'android') {
      return true;
    }
    try {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      return result === PermissionsAndroid.RESULTS.GRANTED;
    } catch {
      return false;
    }
  };

  const startListeningWeb = () => {
    if (listening) {
      return;
    }

    const webRecognitionCtor = getSpeechRecognitionCtor();
    if (!webRecognitionCtor) {
      const insecureContext = typeof window !== 'undefined' && window.isSecureContext === false;
      setVoiceError(
        insecureContext
          ? 'Voice input on web requires HTTPS (or localhost).'
          : 'Voice input is not supported in this browser.',
      );
      return;
    }

    setVoiceError('');
    baseValueRef.current = String(value || '').trim();
    const recognition = new webRecognitionCtor();
    recognitionRef.current = recognition;
    recognition.lang = voiceLang || DEFAULT_LANG;
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results || [])
        .map((entry) => entry?.[0]?.transcript || '')
        .join(' ')
        .trim();
      if (!transcript) {
        return;
      }
      onChangeText?.(normalizeTranscriptOutput(transcript));
    };

    recognition.onerror = (event) => {
      const code = String(event?.error || '').trim();
      if (code && code !== 'no-speech' && code !== 'aborted') {
        setVoiceError(`Voice input error: ${code}`);
      }
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    try {
      setListening(true);
      recognition.start();
    } catch {
      setListening(false);
      setVoiceError('Voice input is unavailable right now.');
    }
  };

  const startListeningNative = async () => {
    if (!NativeVoiceModule || !canUseNativeVoice || listening) {
      return;
    }

    const hasPermission = await requestAudioPermission();
    if (!hasPermission) {
      setVoiceError('Microphone permission is required for voice input.');
      return;
    }

    setVoiceError('');
    baseValueRef.current = String(value || '').trim();

    NativeVoiceModule.onSpeechPartialResults = (event) => {
      const transcript = Array.isArray(event?.value) ? event.value[0] : '';
      if (transcript) {
        onChangeText?.(normalizeTranscriptOutput(transcript));
      }
    };
    NativeVoiceModule.onSpeechResults = (event) => {
      const transcript = Array.isArray(event?.value) ? event.value[0] : '';
      if (transcript) {
        onChangeText?.(normalizeTranscriptOutput(transcript));
      }
    };
    NativeVoiceModule.onSpeechError = (event) => {
      const errorCode = String(event?.error?.message || event?.error || '').trim();
      if (errorCode && errorCode !== '7' && errorCode !== '6') {
        setVoiceError(`Voice input error: ${errorCode}`);
      }
      setListening(false);
    };
    NativeVoiceModule.onSpeechEnd = () => {
      setListening(false);
    };

    try {
      setListening(true);
      await NativeVoiceModule.start(voiceLang || DEFAULT_LANG);
    } catch {
      setListening(false);
      setVoiceError('Voice input is unavailable right now.');
    }
  };

  const toggleListening = () => {
    if (listening) {
      stopListening();
      return;
    }
    if (Platform.OS === 'web') {
      startListeningWeb();
      return;
    }
    startListeningNative();
  };

  return (
    <View style={[styles.container, containerStyle]}>
      <TextInput
        {...textInputProps}
        value={value}
        onChangeText={onChangeText}
        style={[style, styles.inputFlex]}
      />
      {canUseVoice ? (
        <TouchableOpacity
          onPress={toggleListening}
          style={[styles.micButton, listening && styles.micButtonActive]}
          accessibilityRole="button"
          accessibilityLabel={listening ? 'Stop voice input' : 'Start voice input'}>
          <Text style={[styles.micText, listening && styles.micTextActive]}>{listening ? 'Stop' : 'Mic'}</Text>
        </TouchableOpacity>
      ) : null}
      {!!voiceError && <Text style={styles.errorText}>{voiceError}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  inputFlex: {
    flexGrow: 1,
    minHeight: 44,
    paddingRight: 54,
  },
  micButton: {
    position: 'absolute',
    right: 10,
    top: 7,
    borderWidth: 1,
    borderColor: '#AFCAB8',
    backgroundColor: '#EFF8F2',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  micButtonActive: {
    borderColor: '#2E7D32',
    backgroundColor: '#DFF0E5',
  },
  micText: {
    color: '#2B4E3A',
    fontSize: 12,
    fontWeight: '700',
  },
  micTextActive: {
    color: '#1D5D27',
  },
  errorText: {
    color: '#A12424',
    fontSize: 11,
    marginTop: 4,
  },
});
