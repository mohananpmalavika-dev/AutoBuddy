/**
 * Voice Recognition Hook
 * Cross-platform voice input for ride booking
 */
import { useState, useCallback } from 'react';
import * as Speech from 'expo-speech';
import { Platform, Alert } from 'react-native';

interface VoiceRecognitionResult {
  text: string;
  confidence: number;
}

export function useVoiceRecognition() {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const startListening = useCallback(async (prompt?: string) => {
    try {
      setIsListening(true);
      setError(null);
      setTranscript('');

      // Speak prompt if provided
      if (prompt) {
        await Speech.speak(prompt, {
          language: 'en-US',
          pitch: 1.0,
          rate: 0.9,
        });
        
        // Wait for speech to finish
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      // Platform-specific voice recognition
      if (Platform.OS === 'web') {
        await startWebVoiceRecognition();
      } else {
        // For native platforms, use expo-speech-recognition or react-native-voice
        await startNativeVoiceRecognition();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Voice recognition failed');
      setIsListening(false);
    }
  }, []);

  const startWebVoiceRecognition = async () => {
    if (typeof window === 'undefined') return;

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      Alert.alert('Not Supported', 'Voice recognition is not supported in this browser');
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const result = event.results[event.results.length - 1];
      const text = result[0].transcript;
      setTranscript(text);

      if (result.isFinal) {
        setIsListening(false);
      }
    };

    recognition.onerror = (event: any) => {
      setError(event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const startNativeVoiceRecognition = async () => {
    // Simulate voice recognition for now
    // In production, integrate expo-speech-recognition or react-native-voice
    
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // Simulated result - replace with actual recognition
        Alert.prompt(
          'Voice Input',
          'Speak your destination (simulation)',
          [
            {
              text: 'Cancel',
              onPress: () => {
                setIsListening(false);
                resolve();
              },
              style: 'cancel',
            },
            {
              text: 'OK',
              onPress: (text) => {
                if (text) {
                  setTranscript(text);
                }
                setIsListening(false);
                resolve();
              },
            },
          ],
          'plain-text'
        );
      }, 500);
    });
  };

  const stopListening = useCallback(() => {
    setIsListening(false);
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  return {
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    resetTranscript,
  };
}
